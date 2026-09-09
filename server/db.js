/* ═══════════════════════════════════════════════════════════════════
   server/db.js — Unified Database Layer & PostgreSQL Connection Pool
   -------------------------------------------------------------------
   Phase 2: Relational PostgreSQL Engine with Graceful JSON Fallback
   - Full ACID transaction management with connection pooling.
   - Dual-mode operation: Native PostgreSQL when DATABASE_URL is set,
     or zero-dependency in-memory JSON fallback when unset.
   - Methods: query(sql, params), transaction(callback), ping(),
     persistOp(op), persistOpsBatch(ops), healthCheck(), close().
   - Supports: PG_POOL_MIN, PG_POOL_MAX, PG_TIMEOUT_MS, DATABASE_URL.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

let pg = null;
try {
  pg = require('pg');
} catch (e) {
  // pg driver is optional for offline/standalone execution
}

let pool = null;
let isPgActive = false;
let memoryStore = null;
let reconnectTimer = null;

const config = {
  connectionString: process.env.DATABASE_URL || null,
  min: parseInt(process.env.PG_POOL_MIN || '2', 10),
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_TIMEOUT_MS || process.env.PG_TIMEOUT || '3000', 10),
  idleTimeoutMillis: 30000
};

/**
 * Initialize Database Layer & Pool Lifecycle
 * @param {Object} fallbackStore - In-memory store object loaded from payesh.json
 */
async function init(fallbackStore) {
  if (fallbackStore) {
    memoryStore = fallbackStore;
  }
  config.connectionString = process.env.DATABASE_URL || null;

  if (!config.connectionString || !pg) {
    isPgActive = false;
    return { ok: true, driver: 'memory', poolSize: 0 };
  }

  try {
    if (pool) {
      try { await pool.end(); } catch (e) {}
    }

    pool = new pg.Pool({
      connectionString: config.connectionString,
      min: config.min,
      max: config.max,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis
    });

    pool.on('error', (err) => {
      console.error('[DB] PostgreSQL pool background error:', err.message);
      // Attempt reconnect if pool died
      scheduleReconnect();
    });

    // Test connection & verify ping
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT NOW() as server_time');
      isPgActive = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      return { ok: true, driver: 'postgres', serverTime: res.rows[0].server_time };
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[DB] PostgreSQL connection failed. Falling back to JSON in-memory store:', err.message);
    isPgActive = false;
    scheduleReconnect();
    return { ok: true, driver: 'memory', fallback: true, warning: err.message };
  }
}

/**
 * Schedule background reconnection when PG goes down
 */
function scheduleReconnect() {
  if (!config.connectionString || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await init(memoryStore);
      if (isPgActive) {
        console.log('[DB] Successfully reconnected to PostgreSQL database');
      }
    } catch (e) {}
  }, 10000).unref();
}

/**
 * Check if PostgreSQL is active
 */
function isPostgres() {
  return isPgActive && pool !== null;
}

/**
 * Get active connection pool
 */
function getPool() {
  return pool;
}

/**
 * Execute parameterized query with automatic client lease
 */
async function query(text, params) {
  if (!isPostgres()) {
    return { rows: [], rowCount: 0 };
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('[DB] Query execution error:', err.message);
    throw err;
  }
}

/**
 * Quick ping for health probes & readiness checks
 */
async function ping() {
  if (!isPostgres()) {
    return { ok: true, driver: 'memory', alive: true };
  }
  try {
    const res = await pool.query('SELECT 1 AS ping');
    return { ok: true, driver: 'postgres', alive: res.rows && res.rows[0] && res.rows[0].ping === 1 };
  } catch (err) {
    return { ok: false, driver: 'postgres', alive: false, error: err.message };
  }
}

/**
 * Execute a function within an atomic PostgreSQL transaction
 * @param {Function} callback - async (client) => { ... }
 */
async function transaction(callback) {
  if (!isPostgres()) {
    return await callback(null);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); }
    catch (rbErr) { console.error('[DB] ROLLBACK failed:', rbErr.message); }   /* P1-14: خطایِ rollback نباید خطایِ اصلی را بپوشاند */
    throw err;
  } finally {
    client.release();
  }
}

/**
 * P1-14: persist ONE op on a given client — THROWS on error (for use inside transactions).
 * Semantics mirror the old persistOp: empty-data ins/upd is a no-op; uid tracking is
 * best-effort (silent); del with no id skips the DELETE but still tracks the uid.
 */
async function persistOpWithClient(client, op) {
  const col = op.c;
  const t = op.t;
  const data = op.data || {};
  const ident = (name) => {
    if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name || ''))) throw new Error('unsafe SQL identifier: ' + name);
    return '"' + name + '"';
  };
  const table = ident(col);
  const valOf = (v) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;

  if (t === 'ins') {
    const fields = Object.keys(data);
    if (fields.length === 0) return;

    const cols = fields.map(ident).join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const values = fields.map(f => valOf(data[f]));
    const updateSet = fields
      .filter(f => f !== 'id')
      .map(f => `${ident(f)} = EXCLUDED.${ident(f)}`)
      .join(', ');

    const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet};`;
    await client.query(sql, values);
  } else if (t === 'upd') {
    const fields = Object.keys(data).filter(f => f !== 'id');
    if (fields.length === 0) return;
    const id = Number(op.id != null ? op.id : data.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error('missing id for update op');

    const values = fields.map(f => valOf(data[f]));
    const setSql = fields.map((f, i) => `${ident(f)} = $${i + 1}`).join(', ');

    if (op.base_version != null) {
      /* Wave 2 — OCC در سطح SQL: معادل
         UPDATE ... WHERE id=$id AND version=$base_version؛ صفر row ⇒ 409. */
      const base = Number(op.base_version);
      if (!Number.isInteger(base) || base < 1) {
        const e = new Error('bad base_version');
        e.code = 'bad_base_version';
        throw e;
      }
      const res = await client.query(
        `UPDATE ${table} SET ${setSql} WHERE id = $${fields.length + 1} AND version = $${fields.length + 2};`,
        values.concat([id, base])
      );
      if (res && res.rowCount === 0) {
        const e = new Error('optimistic concurrency conflict');
        e.code = 'occ_conflict';
        e.status = 409;
        throw e;
      }
    } else {
      await client.query(`UPDATE ${table} SET ${setSql} WHERE id = $${fields.length + 1};`, values.concat([id]));
    }
  } else if (t === 'del') {
    const delId = Number(op.id != null ? op.id : (data && data.id));
    if (delId) {
      await client.query(`DELETE FROM ${table} WHERE id = $1;`, [delId]);
    }
  }

  // Also persist processed UID into server_processed_uids (best-effort, as before)
  if (op.uid) {
    await client.query(
      `INSERT INTO server_processed_uids (uid, processed_at) VALUES ($1, NOW()) ON CONFLICT (uid) DO NOTHING;`,
      [op.uid]
    ).catch(() => {});
  }
}

/**
 * Persist an applied sync operation to PostgreSQL (single-op; failures are logged, never thrown)
 */
async function persistOp(op) {
  if (!isPostgres() || !op || !op.c) return;

  const col = op.c;
  const t = op.t;

  try {
    await persistOpWithClient({ query: (text, params) => pool.query(text, params) }, op);
  } catch (err) {
    console.error(`[DB] Error persisting sync op to PostgreSQL (${col}.${t}):`, err.message);
  }
}

/**
 * P1-14: persist applied ops on a given client, in order — THROWS on the first
 * failure so the caller's transaction rolls everything back.
 */
async function persistOpsBatchWithClient(client, ops) {
  let n = 0;
  for (const op of (ops || [])) {
    if (!op || !op.c) continue;
    await persistOpWithClient(client, op);
    n++;
  }
  return { ok: true, count: n };
}

/**
 * P1-14: atomic multi-record mirror — all ops in ONE transaction (all-or-nothing).
 * Memory fallback: PG mirror is skipped (the JSON store is the source of truth there).
 * THROWS on failure (after ROLLBACK) so the caller can audit / mark for retry.
 */
async function persistOpsBatch(ops) {
  const list = ops || [];
  if (!isPostgres()) {
    return { ok: true, driver: 'memory', count: list.length };
  }
  return await transaction(async (client) => {
    const r = await persistOpsBatchWithClient(client, list);
    r.driver = 'postgres';
    return r;
  });
}

/**
 * Check if a UID has been processed (PostgreSQL or memory store)
 */
async function isUidProcessed(uid) {
  if (isPostgres()) {
    try {
      const res = await pool.query('SELECT 1 FROM server_processed_uids WHERE uid = $1', [uid]);
      if (res.rowCount > 0) return true;
    } catch (e) {}
  }
  if (memoryStore && memoryStore.__processed_uids) {
    return !!memoryStore.__processed_uids[uid];
  }
  return false;
}

/**
 * Detailed Health check status
 */
async function healthCheck() {
  if (!isPostgres()) {
    return { ok: true, driver: 'memory', message: 'In-memory JSON store operational' };
  }

  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    return {
      ok: true,
      driver: 'postgres',
      latency_ms: latency,
      total_count: pool.totalCount,
      idle_count: pool.idleCount,
      waiting_count: pool.waitingCount
    };
  } catch (err) {
    return { ok: false, driver: 'postgres', error: err.message };
  }
}

/**
 * Graceful shutdown
 */
async function close() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pool) {
    try {
      await pool.end();
    } catch (e) {}
    pool = null;
    isPgActive = false;
  }
}

/* P1-14: seam تزریقِ pool برای تستِ اتمی‌بودن بدون PG واقعی (pg-mem).
   فقط تست از آن استفاده می‌کند؛ کدِ اجرایی همیشه از init می‌آید. */
function __setPoolForTests(p) {
  if (p) { pool = p; isPgActive = true; }
  else { pool = null; isPgActive = false; }
}

module.exports = {
  init,
  isPostgres,
  getPool,
  query,
  ping,
  transaction,
  persistOp,
  persistOpWithClient,
  persistOpsBatchWithClient,
  persistOpsBatch,
  __setPoolForTests,
  isUidProcessed,
  healthCheck,
  close
};
