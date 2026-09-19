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
  unavailable
};
