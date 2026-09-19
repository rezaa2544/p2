/**
 * Phase 7 — PostgreSQL is the only authority.
 * RAM Maps in control-plane modules are CACHE. Decisions go through here.
 */
'use strict';

let _db = null;

function attach(db) {
  _db = db && typeof db.query === 'function' ? db : null;
}

function attached() {
  return !!_db;
}

function unavailable(msg) {
  const err = new Error(msg || 'AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
  err.code = 'AUTHORITY_UNAVAILABLE';
  err.status = 503;
  return err;
}

function requireDb() {
  if (_db) return _db;
  if (process.env.DATABASE_URL) throw unavailable();
  return null;
}

async function query(sql, params) {
  const db = requireDb();
  if (!db) return { rows: [], rowCount: 0 };
  return db.query(sql, params);
}

async function putState(kind, id, payload, updatedBy) {
  const db = requireDb();
  if (!db) return null;
  const res = await db.query(
    `INSERT INTO authority_state (kind, id, payload, version, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, 1, NOW(), $4)
     ON CONFLICT (kind, id) DO UPDATE
       SET payload = $3::jsonb,
           version = authority_state.version + 1,
           updated_at = NOW(),
           updated_by = $4
     RETURNING version;`,
    [String(kind), String(id), JSON.stringify(payload), updatedBy != null ? String(updatedBy) : null]
  );
  if (!res || !res.rowCount) throw unavailable('AUTHORITY_PERSIST_FAILED');
  return Number(res.rows[0].version);
}

async function getState(kind, id) {
  const db = requireDb();
  if (!db) return null;
  const res = await db.query(
    'SELECT payload, version FROM authority_state WHERE kind = $1 AND id = $2;',
    [String(kind), String(id)]
  );
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0].payload;
}

async function listState(kind) {
  const db = requireDb();
  if (!db) return [];
  const res = await db.query(
    'SELECT id, payload, version FROM authority_state WHERE kind = $1;',
    [String(kind)]
  );
  return (res && res.rows) || [];
}

async function getTenantPolicy(province, school) {
  const db = requireDb();
  if (!db) return null;
  const p = String(province);
  const s = school != null && String(school) !== '' ? String(school) : '*';
  const res = await db.query(
    `SELECT province, school, allowed_scope, version
       FROM tenant_policy
      WHERE province = $1 AND (school = $2 OR school = '*')
      ORDER BY CASE WHEN school = '*' THEN 1 ELSE 0 END
      LIMIT 1;`,
    [p, s]
  );
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0];
}

async function consumeNonce(nonce, signatureHash, expiresAt) {
  const db = requireDb();
  if (!db) {
    const err = new Error('GOVERNANCE_LEDGER_UNAVAILABLE');
    err.code = 'GOVERNANCE_LEDGER_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
  const ins = await db.query(
    `INSERT INTO phase6_replay_ledger (nonce, signature_hash, expires_at)
     VALUES ($1, $2, $3::timestamptz)
     ON CONFLICT (nonce) DO NOTHING
     RETURNING nonce;`,
    [String(nonce), String(signatureHash), expiresAt]
  );
  if (!ins || !ins.rowCount) {
    const err = new Error('امضای امنیتی قبلاً مصرف شده است (Replay Signature Rejected)');
    err.code = 'REPLAY_ATTACK_DETECTED';
    throw err;
  }
  return true;
}

async function getCanaryState(clusterId) {
  const db = requireDb();
  if (!db) return null;
  const res = await db.query(
    'SELECT * FROM phase6_canary_configs WHERE id = $1;',
    [String(clusterId)]
  );
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0];
}

async function listCanaryConfigs() {
  const db = requireDb();
  if (!db) return [];
  const res = await db.query('SELECT * FROM phase6_canary_configs;');
  return (res && res.rows) || [];
}

async function upsertCanaryConfig(cluster) {
  const db = requireDb();
  if (!db) return null;
  return db.query(
    `INSERT INTO phase6_canary_configs (id, name, provinces, primary_dc, secondary_dc, capacity_tps, traffic_weight, weight, region_id, status, version)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $7, $1, $8, 1)
     ON CONFLICT (id) DO UPDATE SET traffic_weight = $7, weight = $7, updated_at = NOW();`,
    [cluster.id, cluster.name, JSON.stringify(cluster.provinces), cluster.primaryDc, cluster.secondaryDc, cluster.capacityTps, cluster.weight, cluster.status]
  );
}

async function deleteCanaryConfig(clusterId) {
  const db = requireDb();
  if (!db) return null;
  return db.query('DELETE FROM phase6_canary_configs WHERE id = $1 RETURNING id;', [String(clusterId)]);
}

async function updateCanaryWeight(clusterId, weight) {
  const db = requireDb();
  if (!db) return null;
  return db.query(
    `UPDATE phase6_canary_configs
        SET traffic_weight = $2,
            weight = $2,
            version = phase6_canary_configs.version + 1,
            circuit_breaker_open = CASE WHEN $2 > 0 THEN false ELSE phase6_canary_configs.circuit_breaker_open END,
            status = CASE WHEN $2 > 0 THEN 'HEALTHY' ELSE phase6_canary_configs.status END,
            updated_at = NOW()
      WHERE id = $1
      RETURNING version, traffic_weight, weight, status, circuit_breaker_open;`,
    [String(clusterId), Number(weight)]
  );
}

async function updateCanaryCircuitBreaker(clusterId, open, secondaryDc, status) {
  const db = requireDb();
  if (!db) return null;
  return db.query(
    `UPDATE phase6_canary_configs
        SET circuit_breaker_open = $2,
            secondary_dc = COALESCE($3, secondary_dc),
            status = COALESCE($4, status),
            version = version + 1,
            updated_at = NOW()
      WHERE id = $1
      RETURNING version, circuit_breaker_open, status, secondary_dc;`,
    [String(clusterId), Boolean(open), secondaryDc || null, status || null]
  );
}

async function recordCanaryAuditEvent(action, details) {
  const db = requireDb();
  if (!db) return null;
  const op = (details && details.operator) || {};
  const payload = {
    action,
    cluster_id: details.clusterId || null,
    old_weight: details.oldWeight != null ? Number(details.oldWeight) : null,
    new_weight: details.newWeight != null ? Number(details.newWeight) : null,
    reason: details.reason || null,
    nonce: details.nonce || null
  };
  return db.query(
    `INSERT INTO phase6_audit_events
       (action, event_type, cluster_id, operator_id, operator_role, actor, old_weight, new_weight, reason, signature, payload)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb);`,
    [
      action,
      details.clusterId || null,
      op.id != null ? String(op.id) : '0',
      op.role || 'system',
      op.id != null ? String(op.id) : 'system',
      details.oldWeight != null ? Number(details.oldWeight) : null,
      details.newWeight != null ? Number(details.newWeight) : null,
      details.reason || null,
      details.signature || null,
      JSON.stringify(payload)
    ]
  );
}

async function verifyAndRecordGovernanceNonce(nonce, signatureHash, expiresAt) {
  return consumeNonce(nonce, signatureHash, expiresAt);
}

async function appendSystemAudit(entry = {}) {
  const audit = require('./audit-ledger');
  return audit.record(entry);
}

async function assertTenantPolicy(province, school, requiredScope) {
  const db = requireDb();
  if (process.env.DATABASE_URL && !db) {
    throw unavailable('AUTHORITY_UNAVAILABLE: Tenant policy authority disconnected');
  }
  const policy = await getTenantPolicy(province, school);
  if (!policy) {
    if (process.env.DATABASE_URL) {
      const err = new Error('TENANT_BOUNDARY_VIOLATION: No matching tenant policy row in authority SSoT');
      err.code = 'TENANT_BOUNDARY_VIOLATION';
      err.status = 403;
      throw err;
    }
    return true;
  }
  if (policy && policy.allowed_scope) {
    const scope = typeof policy.allowed_scope === 'string' ? JSON.parse(policy.allowed_scope) : policy.allowed_scope;
    if (scope.deny === true) {
      const err = new Error('TENANT_BOUNDARY_VIOLATION: Tenant policy explicitly denies access');
      err.code = 'TENANT_BOUNDARY_VIOLATION';
      err.status = 403;
      throw err;
    }
  }
  return policy;
}

module.exports = {
  attach,
  attached,
  requireDb,
  query,
  putState,
  getState,
  listState,
  getTenantPolicy,
  consumeNonce,
  getCanaryState,
  listCanaryConfigs,
  upsertCanaryConfig,
  deleteCanaryConfig,
  updateCanaryWeight,
  updateCanaryCircuitBreaker,
  recordCanaryAuditEvent,
  verifyAndRecordGovernanceNonce,
  appendSystemAudit,
  assertTenantPolicy,
  unavailable
};
