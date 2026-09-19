/**
 * Phase 6.6 — durable operational key-value SoT.
 * RAM Maps in Phase-5 control-plane modules are CACHE only.
 * PostgreSQL table phase6_ops_kv is the authority across instances.
 */
'use strict';

let _db = null;

function attach(db) {
  _db = db && typeof db.query === 'function' ? db : null;
}

function attached() {
  return !!_db;
}

async function set(key, value) {
  if (!_db) {
    const err = new Error('OPS_KV_UNAVAILABLE: PostgreSQL SoT is not attached');
    err.code = 'OPS_KV_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
  const res = await _db.query(
    `INSERT INTO phase6_ops_kv (key, value, version, updated_at)
     VALUES ($1, $2::jsonb, 1, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = $2::jsonb,
           version = phase6_ops_kv.version + 1,
           updated_at = NOW()
     RETURNING version;`,
    [String(key), JSON.stringify(value)]
  );
  if (!res || !res.rowCount) {
    const err = new Error('OPS_KV_PERSIST_FAILED');
    err.code = 'OPS_KV_PERSIST_FAILED';
    err.status = 503;
    throw err;
  }
  return Number(res.rows[0].version);
}

async function get(key) {
  if (!_db) return null;
  const res = await _db.query('SELECT value, version FROM phase6_ops_kv WHERE key = $1;', [String(key)]);
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0].value;
}

module.exports = { attach, attached, set, get };
