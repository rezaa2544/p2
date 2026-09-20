/**
 * Phase 7/8 — PostgreSQL is the sole authority.
 * RAM Maps in control-plane modules are strictly NON-AUTHORITATIVE caches.
 * All authoritative decisions go through here.
 * Fail-Closed: If authority is unavailable or unattached, all authority paths throw AUTHORITY_UNAVAILABLE.
 */
'use strict';

let _db = null;

function attach(db) {
  _db = db && typeof db.query === 'function' ? db : null;
}

function attached() {
  return !!(_db && typeof _db.query === 'function');
}

function unavailable(msg) {
  const err = new Error(msg || 'AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
  err.code = 'AUTHORITY_UNAVAILABLE';
  err.status = 503;
  return err;
}

function requireDb() {
  if (_db && typeof _db.query === 'function') return _db;
  throw unavailable();
}

/**
 * Determines whether explicit in-memory development mode is active.
 * Strict rules:
 * - NEVER allowed in production (NODE_ENV=production or PAYESH_ENV=production)
 * - NEVER allowed when DATABASE_URL is set
 * - Requires explicit opt-in: PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1
 * In all other cases (including default unset environment), system MUST fail closed.
 */
function isExplicitDevOptIn() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
  if (isProd) return false;
  if (process.env.DATABASE_URL) return false;
  return process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1';
}

function assertAuthorityAttached(msg) {
  if (isExplicitDevOptIn()) return;
  if (!attached()) {
    throw unavailable(msg || 'AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
  }
}

async function query(sql, params) {
  const db = requireDb();
  try {
    return await db.query(sql, params);
  } catch (err) {
    if (err && (err.code === 'AUTHORITY_UNAVAILABLE' || err.code === 'REPLAY_ATTACK_DETECTED')) throw err;
    const error = new Error('AUTHORITY_QUERY_FAILED: ' + (err && err.message ? err.message : String(err)));
    error.code = 'AUTHORITY_QUERY_FAILED';
    error.status = 503;
    error.cause = err;
    throw error;
  }
}

async function putState(kind, id, payload, updatedBy) {
  const res = await query(
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
  const res = await query(
    'SELECT payload, version FROM authority_state WHERE kind = $1 AND id = $2;',
    [String(kind), String(id)]
  );
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0].payload;
}

async function listState(kind) {
  const res = await query(
    'SELECT id, payload, version FROM authority_state WHERE kind = $1;',
    [String(kind)]
  );
  return (res && res.rows) || [];
}

async function getTenantPolicy(province, school) {
  const p = String(province);
  const s = school != null && String(school) !== '' ? String(school) : '*';
  const res = await query(
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
  const ins = await query(
    `INSERT INTO phase6_replay_ledger (nonce, signature_hash, expires_at)
     VALUES ($1, $2, $3::timestamptz)
     ON CONFLICT (nonce) DO NOTHING
     RETURNING nonce;`,
    [String(nonce), String(signatureHash), expiresAt]
  );
  if (!ins || !ins.rowCount) {
    const err = new Error('امضای امنیتی قبلاً مصرف شده است (Replay Signature Rejected)');
    err.code = 'REPLAY_ATTACK_DETECTED';
    err.status = 403;
    throw err;
  }
  return true;
}

async function getCanaryState(clusterId) {
  const res = await query(
    'SELECT * FROM phase6_canary_configs WHERE id = $1;',
    [String(clusterId)]
  );
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0];
}

async function listCanaryConfigs() {
  const res = await query('SELECT * FROM phase6_canary_configs;');
  return (res && res.rows) || [];
}

async function upsertCanaryConfig(cluster) {
  return query(
    `INSERT INTO phase6_canary_configs (id, name, provinces, primary_dc, secondary_dc, capacity_tps, traffic_weight, weight, region_id, status, version)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $7, $1, $8, 1)
     ON CONFLICT (id) DO UPDATE SET traffic_weight = $7, weight = $7, updated_at = NOW();`,
    [cluster.id, cluster.name, JSON.stringify(cluster.provinces), cluster.primaryDc, cluster.secondaryDc, cluster.capacityTps, cluster.weight, cluster.status]
  );
}

async function deleteCanaryConfig(clusterId) {
  return query('DELETE FROM phase6_canary_configs WHERE id = $1 RETURNING id;', [String(clusterId)]);
}

async function updateCanaryWeight(clusterId, weight) {
  return query(
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
  return query(
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
  const op = (details && details.operator) || {};
  const payload = {
    action,
    cluster_id: details.clusterId || null,
    old_weight: details.oldWeight != null ? Number(details.oldWeight) : null,
    new_weight: details.newWeight != null ? Number(details.newWeight) : null,
    reason: details.reason || null,
    nonce: details.nonce || null
  };
  return query(
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
  const policy = await getTenantPolicy(province, school);
  if (!policy) {
    const err = new Error('TENANT_BOUNDARY_VIOLATION: No matching tenant policy row in authority SSoT');
    err.code = 'TENANT_BOUNDARY_VIOLATION';
    err.status = 403;
    throw err;
  }
  if (policy && policy.allowed_scope) {
    const scope = typeof policy.allowed_scope === 'string' ? JSON.parse(policy.allowed_scope) : policy.allowed_scope;
    if (scope.deny === true) {
      const err = new Error('TENANT_BOUNDARY_VIOLATION: Tenant policy explicitly denies access');
      err.code = 'TENANT_BOUNDARY_VIOLATION';
      err.status = 403;
      throw err;
    }
    if (requiredScope) {
      if (scope.allowed_scopes && Array.isArray(scope.allowed_scopes)) {
        if (!scope.allowed_scopes.includes(requiredScope) && !scope.allowed_scopes.includes('*')) {
          const err = new Error(`TENANT_BOUNDARY_VIOLATION: Required scope '${requiredScope}' is not in policy allowed_scopes [${scope.allowed_scopes.join(', ')}]`);
          err.code = 'TENANT_BOUNDARY_VIOLATION';
          err.status = 403;
          throw err;
        }
      }
      if (scope.match && requiredScope !== scope.match && scope.match !== '*') {
        const err = new Error(`TENANT_BOUNDARY_VIOLATION: Required scope '${requiredScope}' violates policy match rule '${scope.match}'`);
        err.code = 'TENANT_BOUNDARY_VIOLATION';
        err.status = 403;
        throw err;
      }
    }
  }
  return policy;
}

async function updateCanaryWeightWithAudit(clusterId, weight, auditDetails) {
  requireDb();
  const dbModule = require('../../db');
  return dbModule.transaction(async (client) => {
    const res = await client.query(
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
    if (!res || !res.rowCount) throw unavailable('CANARY_UPDATE_FAILED');
    if (auditDetails) {
      const op = auditDetails.operator || {};
      const payload = {
        action: auditDetails.action || 'WEIGHT_UPDATED',
        cluster_id: clusterId,
        old_weight: auditDetails.oldWeight != null ? Number(auditDetails.oldWeight) : null,
        new_weight: Number(weight),
        reason: auditDetails.reason || null,
        nonce: auditDetails.nonce || null
      };
      await client.query(
        `INSERT INTO phase6_audit_events
           (action, event_type, cluster_id, operator_id, operator_role, actor, old_weight, new_weight, reason, signature, payload)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb);`,
        [
          auditDetails.action || 'WEIGHT_UPDATED',
          clusterId,
          op.id != null ? String(op.id) : '0',
          op.role || 'system',
          op.id != null ? String(op.id) : 'system',
          auditDetails.oldWeight != null ? Number(auditDetails.oldWeight) : null,
          Number(weight),
          auditDetails.reason || null,
          auditDetails.signature || null,
          JSON.stringify(payload)
        ]
      );
    }
    return res;
  });
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
  updateCanaryWeightWithAudit,
  updateCanaryCircuitBreaker,
  recordCanaryAuditEvent,
  verifyAndRecordGovernanceNonce,
  appendSystemAudit,
  assertTenantPolicy,
  unavailable,
  isExplicitDevOptIn,
  assertAuthorityAttached
};
