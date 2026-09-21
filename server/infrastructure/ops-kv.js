/**
 * Phase 6.6 — durable operational key-value SoT.
 * RAM Maps in Phase-5 control-plane modules are CACHE only.
 * PostgreSQL table phase6_ops_kv is the authority across instances.
 */
'use strict';

let _db = null;

function isExplicitDevOptIn() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
  if (isProd) return false;
  if (process.env.DATABASE_URL) return false;
  return process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1';
}

function unavailable(msg) {
  const err = new Error(msg || 'OPS_KV_UNAVAILABLE: PostgreSQL SoT is not attached');
  err.code = 'OPS_KV_UNAVAILABLE';
  err.status = 503;
  return err;
}

function attach(db) {
  _db = db && typeof db.query === 'function' ? db : null;
}

function attached() {
  return !!_db;
}

async function set(key, value) {
  if (!_db) {
    if (isExplicitDevOptIn()) return 1;
    throw unavailable();
  }
  let res;
  try {
    res = await _db.query(
      `INSERT INTO phase6_ops_kv (key, value, version, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb,
             version = phase6_ops_kv.version + 1,
             updated_at = NOW()
       RETURNING version;`,
      [String(key), JSON.stringify(value)]
    );
  } catch (err) {
    if (err && (err.code === 'OPS_KV_UNAVAILABLE' || err.code === 'OPS_KV_PERSIST_FAILED')) throw err;
    const error = new Error('OPS_KV_QUERY_FAILED: ' + (err && err.message ? err.message : String(err)));
    error.code = 'OPS_KV_QUERY_FAILED';
    error.status = 503;
    error.cause = err;
    throw error;
  }
  if (!res || !res.rowCount) {
    const err = new Error('OPS_KV_PERSIST_FAILED');
    err.code = 'OPS_KV_PERSIST_FAILED';
    err.status = 503;
    throw err;
  }
  return Number(res.rows[0].version);
}

async function get(key) {
  if (!_db) {
    if (isExplicitDevOptIn()) return null;
    throw unavailable();
  }
  let res;
  try {
    res = await _db.query('SELECT value, version FROM phase6_ops_kv WHERE key = $1;', [String(key)]);
  } catch (err) {
    if (err && err.code === 'OPS_KV_UNAVAILABLE') throw err;
    const error = new Error('OPS_KV_QUERY_FAILED: ' + (err && err.message ? err.message : String(err)));
    error.code = 'OPS_KV_QUERY_FAILED';
    error.status = 503;
    error.cause = err;
    throw error;
  }
  if (!res || !res.rows || !res.rows.length) return null;
  return res.rows[0].value;
}

module.exports = { attach, attached, set, get, isExplicitDevOptIn, unavailable };
