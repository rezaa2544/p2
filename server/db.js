/* ═══════════════════════════════════════════════════════════════════
   server/db.js — Unified Database Layer & PostgreSQL Connection Pool
   -------------------------------------------------------------------
   Phase 2: Relational PostgreSQL Engine with Graceful JSON Fallback
   - Full ACID transaction management with connection pooling.
   - Dual-mode operation: Native PostgreSQL when DATABASE_URL is set,
     or zero-dependency in-memory JSON fallback when unset.
   - Methods: query(sql, params), transaction(callback), ping(),
     persistOp(op), healthCheck(), close().
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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Persist an applied sync operation to PostgreSQL
 */
async function persistOp(op) {
  if (!isPostgres() || !op || !op.c) return;

  const col = op.c;
  const t = op.t;
  const data = op.data || {};

  try {
    if (t === 'ins' || t === 'upd') {
      const fields = Object.keys(data);
      if (fields.length === 0) return;

      const cols = fields.map(f => `"${f}"`).join(', ');
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
      const values = fields.map(f => {
        const val = data[f];
        if (val !== null && typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val;
      });

      const updateSet = fields
        .filter(f => f !== 'id')
        .map((f, i) => `"${f}" = EXCLUDED."${f}"`)
        .join(', ');

      const sql = `INSERT INTO ${col} (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet};`;
      await pool.query(sql, values);
    } else if (t === 'del') {
      const delId = Number(op.id != null ? op.id : (data && data.id));
      if (delId) {
        await pool.query(`DELETE FROM ${col} WHERE id = $1;`, [delId]);
      }
    }

    // Also persist processed UID into server_processed_uids
    if (op.uid) {
      await pool.query(
        `INSERT INTO server_processed_uids (uid, processed_at) VALUES ($1, NOW()) ON CONFLICT (uid) DO NOTHING;`,
        [op.uid]
      ).catch(() => {});
    }
  } catch (err) {
    console.error(`[DB] Error persisting sync op to PostgreSQL (${col}.${t}):`, err.message);
  }
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

module.exports = {
  init,
  isPostgres,
  getPool,
  query,
  ping,
  transaction,
  persistOp,
  isUidProcessed,
  healthCheck,
  close
};
