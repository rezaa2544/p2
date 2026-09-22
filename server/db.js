/* ═══════════════════════════════════════════════════════════════════
   server/db.js — Unified Database Layer & PostgreSQL Connection Pool
   -------------------------------------------------------------------
   Phase 2: Relational PostgreSQL Engine with Graceful JSON Fallback
   - Full ACID transaction management with connection pooling.
   - Dual-mode operation: Native PostgreSQL when DATABASE_URL is set,
     or zero-dependency in-memory JSON fallback when unset.
   - Methods: query(sql, params), queryRead(sql, params), transaction(callback),
     ping(), persistOp(op), persistOpsBatch(ops), healthCheck(), close().
   - Supports: PG_POOL_MIN, PG_POOL_MAX, PG_TIMEOUT_MS, DATABASE_URL,
     READ_DATABASE_URL (+ READ_POOL_MIN, READ_POOL_MAX).

   Wave 10 (chat2) — Database Scale: READ REPLICA (additive, safe-by-default).
   An optional read-only connection pool is created when READ_DATABASE_URL is
   set. Heavy GET-list reads (the DB-native paged lists) are routed to it via
   queryRead(); if the replica is not configured or hiccups, queryRead() falls
   back to the primary pool (behaviour identical to before). Writes and sync /
   pull correctness reads (readCollection/readOne/delta) intentionally stay on
   the PRIMARY pool so a replica can never lag a client's own recent writes.
   Partitioning of large tables is DESIGN-ONLY here (pending a live PG run);
   see docs/WAVE10_DB_SCALE.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
/* ویو ۱۴ (Observability) — سیگنالِ metrics برای لایهٔ دیتابیس. بدون
   وابستگیِ بیرونی؛ metrics.js فقط crypto را require می‌کند (بدون چرخه). */
const metrics = require('./metrics');

/* آستانهٔ «کوئریِ کند» — فقط برای شمارش، نه برای تغییرِ رفتار. */
const DB_SLOW_MS = (Number(process.env.PAYESH_DB_SLOW_MS) > 0)
  ? Number(process.env.PAYESH_DB_SLOW_MS) : 250;
function dbSeconds(startNs) {
  try { return Number(process.hrtime.bigint() - startNs) / 1e9; }
  catch (e) { return 0; }
}
function dbSlow(startNs) {
  try { return Number(process.hrtime.bigint() - startNs) / 1e6 >= DB_SLOW_MS; }
  catch (e) { return false; }
}

let pg = null;
try {
  pg = require('pg');
} catch (e) {
  // pg driver is optional for offline/standalone execution
}

let pool = null;
let readPool = null;          /* Wave 10: optional read-replica pool (READ_DATABASE_URL) */
let readPoolActive = false;   /* Wave 10: true only after the replica answers a ping */
let replicaReprobeTimer = null; /* S3-1: کاوشِ خودکارِ بازگشتِ رپلیکا */
let REPLICA_REPROBE_MS = 10000;
let isPgActive = false;
let memoryStore = null;
let reconnectTimer = null;

const config = {
  connectionString: process.env.DATABASE_URL || null,
  min: parseInt(process.env.PG_POOL_MIN || '2', 10),
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_TIMEOUT_MS || process.env.PG_TIMEOUT || '3000', 10),
  idleTimeoutMillis: 30000,
  /* Wave 10 — read replica (optional). When READ_DATABASE_URL is present a
     second read-only pool is opened and heavy GET-list reads route to it. */
  readConnectionString: process.env.READ_DATABASE_URL || null,
  readMin: parseInt(process.env.READ_POOL_MIN || '2', 10),
  readMax: parseInt(process.env.READ_POOL_MAX || '10', 10)
};

/* ── P0-1 (Package 1) — PostgreSQL production enforcement ─────────────
   In production the JSON/in-memory store must never be the backing store:
   it is per-process, so two instances silently diverge on every write
   (auth codes, idempotency UIDs, attendance, grades, finance) and a
   container restart loses everything since the last 2s persist tick.

   This is the exact contract Redis already implements for itself
   (server/redis.js:150-158 "REDIS_URL is required when NODE_ENV=production
   (in-memory fallback is dev-only)" and redis.js:224-236 "Redis unreachable
   in production"), so the two backing stores now fail the same way.

   ALLOW_MEMORY_FALLBACK=1 is an explicit dev/test opt-in. It is IGNORED in
   production — a flag must not be able to re-open a production data-loss
   path. */
function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
}

function memoryFallbackAllowed() {
  /* Phase 8.1 (R5): NODE_ENV=production is the hard-production contract —
     the explicit opt-in flag is IGNORED here (the P0-1 comment above: "a
     flag must not be able to re-open a production data-loss path"). This
     restores the behaviour pinned by tests/pg-prod-no-json-writes.js (a3/a4),
     tests/pg-prod-boot-no-db.js (3a/3b) and tests/pg-prod-suite-policy.js
     (3a). PAYESH_ENV=production alone is the posture flag (TLS/env gates);
     it keeps the explicit dev/test opt-in so harnesses such as server17 T2
     and wave15 can exercise production code paths without infra — the boot
     env-mismatch warning still fires loudly in that shape. */
  if (process.env.NODE_ENV === 'production') return false;
  if (isProductionEnv()) return memoryFallbackRequested();
  return true; /* dev/test: fallback stays available (see init() warning) */
}

function memoryFallbackRequested() {
  return process.env.ALLOW_MEMORY_FALLBACK === '1';
}

/**
 * Why the JSON/in-memory backing store is (not) usable right now.
 * Pure/env-only — safe to call from boot gates and tests.
 */
function backingStorePolicy() {
  const production = isProductionEnv();
  const allow = memoryFallbackAllowed();
  return {
    production: production,
    allow_memory_fallback: allow,
    flag_requested: memoryFallbackRequested(),
    reason: !production
      ? 'non-production: JSON/in-memory backing store permitted'
      : (allow
        ? 'production: JSON/in-memory backing store permitted'
        : 'production: DATABASE_URL required — JSON/in-memory fallback is dev-only')
  };
}

/* P0-1 (round 3, item 2) — see the pool.on('connect') handler in init().
   Counted so a test can prove the event was observed rather than crashed on. */
let clientErrorCount = 0;
function onClientError(err) {
  clientErrorCount++;
  const msg = (err && err.message) || String(err);
  if (isProductionEnv()) {
    console.error('[DB] PostgreSQL client error in production — the operation fails explicitly and readiness goes red (no silent retry, no process crash):', msg);
  } else {
    console.warn('[DB] PostgreSQL client error:', msg);
  }
}
function clientErrors() { return clientErrorCount; }

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
    readPoolActive = false;
    if (readPool) { try { readPool.end().catch(() => {}); } catch (e) {} readPool = null; }
    /* P0-1: production refuses the JSON/in-memory backing store (mirrors
       server/redis.js:150-158). ok:false is what the boot gate keys on. */
    if (!memoryFallbackAllowed()) {
      const error = !config.connectionString
        ? 'DATABASE_URL is required when NODE_ENV=production (JSON/in-memory fallback is dev-only)'
        : 'pg driver is not installed (required when NODE_ENV=production)';
      return { ok: false, driver: 'none', poolSize: 0, read_replica: false, error: error };
    }
    if (!memoryFallbackRequested()) {
      console.warn('[DB] no DATABASE_URL — using the JSON/in-memory store. Dev/test only; '
        + 'set ALLOW_MEMORY_FALLBACK=1 to silence this warning. In production this is a startup failure.');
    }
    return { ok: true, driver: 'memory', poolSize: 0, read_replica: false };
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

    /* P0-1 (round 3, item 2) — a checked-out pg Client whose connection dies
       emits an 'error' event that nothing listened to, which aborted the
       whole Node process ("Unhandled 'error' event" on Client). The in-flight
       query already rejects, so the caller still sees an explicit failure;
       this listener only stops the crash and records the event.

       Production semantics deliberately follow the existing Redis precedent
       (server/redis.js:224-236 and tests/redis-prodfail.js): operations throw
       and readiness goes red — the process is NOT killed, because a single
       reset connection must not become a full outage. Exit-on-client-error
       would be stricter than the contract this codebase already ships for its
       other shared backend. */
    pool.on('connect', (c) => {
      try { c.on('error', onClientError); } catch (e) {}
    });

    // Test connection & verify ping
    const client = await pool.connect();
    let serverTime = null;
    try {
      const res = await client.query('SELECT NOW() as server_time');
      serverTime = res.rows && res.rows[0] ? res.rows[0].server_time : null;
      isPgActive = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    } finally {
      client.release();
    }

    /* Wave 10 — best-effort read-replica pool. Never fatal: if the replica is
       not configured or cannot answer a ping, readPoolActive stays false and
       queryRead() transparently uses the primary pool (identical behaviour). */
    try {
      if (config.readConnectionString && pg) {
        if (readPool) { try { await readPool.end(); } catch (e) {} }
        readPool = new pg.Pool({
          connectionString: config.readConnectionString,
          min: config.readMin,
          max: config.readMax,
          connectionTimeoutMillis: config.connectionTimeoutMillis,
          idleTimeoutMillis: config.idleTimeoutMillis
        });
        readPool.on('error', (err) => {
          console.error('[DB] Read-replica pool background error:', err.message);
          readPoolActive = false;   /* stop routing to a dead replica */
          scheduleReplicaReprobe(); /* S3-1: ولی برایِ بازگشتش کاوش کن */
        });
        const rc = await readPool.connect();
        try { await rc.query('SELECT 1 AS ping'); readPoolActive = true; }
        finally { rc.release(); }
      } else {
        /* READ_DATABASE_URL no longer set → drop any lingering replica pool */
        readPoolActive = false;
        if (readPool) { try { await readPool.end(); } catch (e) {} readPool = null; }
      }
    } catch (e) {
      readPoolActive = false;
      console.warn('[DB] Read replica unavailable; reads will use primary pool:', e.message);
      scheduleReplicaReprobe(); /* S3-1: اگر pool هست، بعداً دوباره بچش */
    }

    return { ok: true, driver: 'postgres', serverTime, read_replica: readPoolActive };
  } catch (err) {
    isPgActive = false;
    readPoolActive = false;
    if (readPool) { try { readPool.end().catch(() => {}); } catch (e) {} readPool = null; }
    scheduleReconnect();
    /* P0-1: an unreachable PostgreSQL in production is a startup failure, not a
       silent downgrade to the JSON store (mirrors server/redis.js:224-236). */
    if (!memoryFallbackAllowed()) {
      console.error('[DB] PostgreSQL unreachable in production — refusing the JSON/in-memory fallback:', err.message);
      return { ok: false, driver: 'none', error: 'PostgreSQL unreachable in production: ' + err.message };
    }
    console.warn('[DB] PostgreSQL connection failed. Falling back to JSON in-memory store:', err.message);
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

/* S3-1 (موج ۱۰): خطایِ خودِ کوئری (گناهِ statement) در برابرِ خطایِ اتصال.
   کلاس‌هایِ SQLSTATE ‏22 (داده) / 23 (جامعیت) / 42 (نحو/دسترسی/ناشناخته)
   قطعاً گناهِ statement است و ربطی به سلامتِ رپلیکا ندارد — مسیریابی نباید
   بخوابد. هر چیزِ دیگر (از جمله خطایِ بی‌کد — پینِ D3c) ابهامِ اتصال است. */
function isReplicaQueryError(err) {
  const code = String((err && err.code) || '');
  return code.length >= 2 && (code.indexOf('22') === 0 || code.indexOf('23') === 0 || code.indexOf('42') === 0);
}

/**
 * S3-1: کاوشِ خودکارِ بازگشتِ رپلیکا (آینهٔ scheduleReconnect برایِ پرماری).
 * پیش‌تر رپلیکایِ خوابیده هیچ مسیرِ بازگشتی نداشت — تا ری‌استارت، همهٔ
 * خوانش‌ها رویِ پرماری می‌ماند. شکستِ کاوش ساکت است (شکستِ اول همان‌جا که
 * رخ داد لاگ شد)؛ فقط بهبودی لاگ می‌شود تا در قطعیِ طولانی لاگ هرز نرود.
 */
function scheduleReplicaReprobe() {
  if (!readPool || readPoolActive || replicaReprobeTimer) return;
  replicaReprobeTimer = setTimeout(async () => {
    replicaReprobeTimer = null;
    if (!readPool || readPoolActive) return;
    try {
      const rc = await readPool.connect();
      try { await rc.query('SELECT 1 AS ping'); }
      finally { try { rc.release(); } catch (e) {} }
      readPoolActive = true;
      console.log('[DB] Read replica recovered; routing reads back to replica');
    } catch (e) {
      scheduleReplicaReprobe();   /* هنوز خواب است — بعداً دوباره */
    }
  }, REPLICA_REPROBE_MS).unref();
}

/**
 * Check if PostgreSQL is active
 */
function isPostgres() {
  return isPgActive && pool !== null;
}

/**
 * Get active connection pool (primary/write)
 */
function getPool() {
  return pool;
}

/* Wave 10 — read-replica accessors (optional; active only when configured+live) */
function isReplicaActive() {
  return readPoolActive && readPool !== null;
}
function getReadPool() {
  return readPool;
}

/**
 * Execute parameterized query with automatic client lease
 */
async function query(text, params) {
  if (!isPostgres()) {
    return { rows: [], rowCount: 0 };
  }
  const start = process.hrtime.bigint();
  try {
    const res = await pool.query(text, params);
    metrics.observeDb('query', 'primary', dbSeconds(start), false, dbSlow(start));
    return res;
  } catch (err) {
    metrics.observeDb('query', 'primary', dbSeconds(start), true, false);
    console.error('[DB] Query execution error:', err.message);
    throw err;
  }
}

/**
 * Wave 10 — READ-ONLY query routed to the read replica when one is live.
 * Used by the heavy GET-list read seam (dbquery.executePagedList). Falls back
 * to the primary pool when the replica is absent or errors — so behaviour is
 * identical to query() in every non-replica configuration. Callers MUST only
 * pass read-only SQL here (no writes); replicas reject/ignore writes anyway.
 */
async function queryRead(text, params) {
  if (isReplicaActive()) {
    const start = process.hrtime.bigint();
    try {
      const res = await readPool.query(text, params);
      metrics.observeDb('query_read', 'replica', dbSeconds(start), false, dbSlow(start));
      return res;
    } catch (err) {
      metrics.observeDb('query_read', 'replica', dbSeconds(start), true, false);
      /* S3-1: فقط خطایِ اتصال مسیریابی را می‌خواباند (+ کاوشِ بازگشت)؛
         خطایِ خودِ کوئری (SQL بد) سلامتِ رپلیکا را زیرِ سؤال نمی‌برد.
         fallback به پرماری در هر دو حالت سرِ جاست. */
      if (!isReplicaQueryError(err)) {
        readPoolActive = false;   /* dead replica → stop routing, fall back to primary */
        scheduleReplicaReprobe();
      }
      console.warn('[DB] Read replica query failed; falling back to primary:', err.message);
    }
  }
  return query(text, params);
}

/* ═══════════════════════════════════════════════════════════════════
   Wave 1 (chat2) — Read-path seam.
   -------------------------------------------------------------------
   A single entry point for server READS so that, once PostgreSQL is the
   configured source of truth, every read route serves from the DB instead
   of reaching into the in-memory JSON `store`.

   Dual mode (identical to the rest of this file):
   - PG active (DATABASE_URL + pg driver):  SELECT * FROM "<table>"
   - memory fallback / offline:              (memoryStore[name] || [])
     In this mode memoryStore === the JSON store that `server/index.js`
     loaded, so the returned rows are byte-for-byte what the caller would
     have read from `store[name]` before. Behavior is therefore preserved.

   ⚠️ Verification note (recorded honestly): the PostgreSQL branch of
   these helpers is defined and wired, but was NOT executed against a live
   PostgreSQL in the CI sandbox for this part (no DATABASE_URL / driver /
   seeded DB). It is exercised only when a real PG is present. See
   docs/WAVE1_READS_INVENTORY.md. Only real data tables may be read here;
   internal store keys (__deleted_records, __server_version, …) are NOT
   relational tables and are intentionally NOT routable through PG.
   ═══════════════════════════════════════════════════════════════════ */

const PG_READABLE_TABLE = /^[a-z][a-z0-9_]*$/;

/* Wave 1 — relational tables mirrored from server/schema.sql (domain
   collections only; server_* infra tables are PG-internal and have no store
   counterpart). Used by hydrateStoreFromPg: ONLY these collections are ever
   replaced from PG, so a collection without a PG table keeps its store copy. */
const SCHEMA_TABLES = new Set(('announcements app_settings assets assoc_minutes attendance attendance_modes ' +
  'bell_schedules bus_events bus_followups bus_locations bus_needs bus_routes bus_students calendar certificates ' +
  'class_subject_members classes corrections counselor_msgs counselor_refs counties discipline districts donations ' +
  'dojo_types dorm_assignments dorm_meals dorm_rooms enrollments exam_duties exam_terms exams grades hw_assignments ' +
  'hw_submissions installments internships leaves lib_books lib_loans makeup_classes meeting_slots messages ' +
  'nid_conflicts notifications notify_queue nudges offices parent_links parent_subscriptions parent_verifications ' +
  'pre_enrollments preapps provinces reexams safety_drills schedule scholarships school_years schools sedascores ' +
  'sms_log sms_wallet staff_attendance student_archive student_transfers subjects subscription_payments substitutions ' +
  'summer_classes support_tickets teacher_evaluations teacher_notes teacher_schools teacher_sms training_courses ' +
  'transactions transfer_requests tuition_plans tuitions users vclass_attendance vclass_links vclass_questions ' +
  'vclass_sessions visitors sync_conflicts').split(' '));

/* Wave 1 — shape parity: persistOp JSON-stringifies object values and the pg
   driver returns TIMESTAMPTZ as Date, while the store holds ISO strings and
   live objects. Revive PG rows so PG-reads are byte-shape-identical to the
   store shape callers already handle. Conservative: only {/[-led strings are
   parse-attempted (with fallback), Dates become ISO strings. Memory mode is
   untouched (it returns store references directly, never through here). */
function reviveValue(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && (v.charAt(0) === '{' || v.charAt(0) === '[')) {
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  return v;
}
function reviveRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const o = {};
    for (const k of Object.keys(r)) o[k] = reviveValue(r[k]);
    return o;
  });
}

function isPgReadableTable(name) {
  return typeof name === 'string'
    && PG_READABLE_TABLE.test(name)
    && name.indexOf('__') !== 0;
}

/* Wave 10 (chg_id): ستون‌هایِ داخلیِ لایهٔ DB — هرگز از سرور بیرون نمی‌روند.
   SELECT * آن‌ها را برمی‌گرداند (ستونِ پارتیشن‌نشده به ازایِ هر جدول)؛ این‌جا
   کنار گذاشته می‌شوند تا شکلِ سطرِ PG با حالتِ حافظه بایت‌به‌بایت یکی بماند و
   هیچ‌وقت به op کلاینت راه پیدا نکنند (validate.js آن را unknown_field می‌گیرد). */
const INTERNAL_ROW_COLUMNS = new Set(['chg_id']);

/**
 * Remove server-internal columns from rows leaving the DB layer.
 * Pure function; returns the same array shape with shallow-copied rows.
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
function stripInternalColumns(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    let has = false;
    for (const k of INTERNAL_ROW_COLUMNS) { if (k in r) { has = true; break; } }
    if (!has) return r;
    const c = Object.assign({}, r);
    for (const k of INTERNAL_ROW_COLUMNS) delete c[k];
    return c;
  });
}

/**
 * Read one full collection via the unified layer.
 * @param {string} name - collection / table name (real data table only)
 * @returns {Promise<Array>} array of row objects
 */
async function readCollection(name) {
  if (typeof name !== 'string' || !name) return [];
  if (isPostgres() && isPgReadableTable(name)) {
    const res = await pool.query(`SELECT * FROM "${name}"`);
    return stripInternalColumns(reviveRows(res.rows));
  }
  return (memoryStore && Array.isArray(memoryStore[name])) ? memoryStore[name] : [];
}

/**
 * Read a single row by numeric id (via readCollection).
 * @param {string} name - collection / table name
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
async function readOne(name, id) {
  /* Wave 1 — indexed single-row read when PG is live (PK lookup instead of
     full-table scan); memory mode keeps the exact legacy find semantics. */
  if (isPostgres() && isPgReadableTable(name)) {
    const n = Number(id);
    if (!Number.isFinite(n)) return null;
    const res = await pool.query(`SELECT * FROM "${name}" WHERE id = $1 LIMIT 1`, [n]);
    const rows = stripInternalColumns(reviveRows(res.rows));
    return rows.length ? rows[0] : null;
  }
  const rows = await readCollection(name);
  const n = Number(id);
  return rows.find((r) => r && Number(r.id) === n) || null;
}

/**
 * Wave 1 — boot hydration: replace store domain collections with PG truth.
 * Iterates SCHEMA_TABLES (not store keys) so a skeleton boot — whose store has
 * no domain keys yet — is POPULATED from PG, not left empty. Only SCHEMA_TABLES
 * members are ever touched, so cache-only collections (outbox, tombstones,
 * __deleted_records, __* internals) keep their store copies. Per-table
 * try/catch: one bad table warns and keeps going (single reads still route to
 * PG when live, so boot stays safe).
 * @param {Object} store - live in-memory store object (mutated in place)
 * @returns {Promise<{ok:boolean, hydrated:number, skipped:Array}>}
 */
async function hydrateStoreFromPg(store, opts) {
  const out = { ok: true, hydrated: 0, skipped: [], capped: [], env_skipped: [], kept: [], mirror_incomplete: false };
  /* B7 (Phase-2 remediation directive): an empty PG table must never wipe a
     non-empty in-memory collection — unless the caller explicitly forces it
     (opts.force === true or PAYESH_FORCE_HYDRATION=1). Protection against
     hydration data loss on a fresh/empty database. */
  const FORCE = !!((opts && opts.force === true) || process.env.PAYESH_FORCE_HYDRATION === '1');
  if (!store || typeof store !== 'object') return out;
  /* Wave 18 — هیدراتاسیونِ مقیّد (مانورِ بارِ ملی): در مقیاسِ ملی، بارگذاریِ
     کلِ جدول‌ها در RAM ممکن نیست (کاربران ۱۰M ⇒ چند GB شیءِ JS؛ OOM در بوت).
     دو env اختیاری، هر دو پیش‌فرض خاموش (رفتارِ فعلی حفظ می‌شود):
       PAYESH_PG_HYDRATE_SKIP=t1,t2      — این جدول‌ها اصلاً هیدراته نشوند
       PAYESH_PG_HYDRATE_LIMIT=u:5000    — سقفِ سطرِ per-جدول (ORDER BY id)
     مسیرهایِ خواندنِ زنده (pgLive ⇒ db.readCollection/executePagedList)
     همچنان مستقیم از PG می‌خوانند؛ سقف فقط «آینهٔ درون‌حافظه‌ایِ بوت» را
     مقیّد می‌کند. یافتهٔ مانور: auth فعلاً از همین آینه می‌خواند (اسکنِ
     خطیِ store.users) — در مقیاسِ واقعی باید به جست‌وجویِ ایندکس‌دارِ PG
     برود (users.phone ایندکس ندارد). */
  const skipEnv = String(process.env.PAYESH_PG_HYDRATE_SKIP || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const limEnv = {};
  String(process.env.PAYESH_PG_HYDRATE_LIMIT || '')
    .split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => {
      const i = p.indexOf(':');
      if (i > 0) {
        const t = p.slice(0, i).trim(), n = Number(p.slice(i + 1));
        if (t && Number.isFinite(n) && n >= 0) limEnv[t] = n;
      }
    });
  for (const key of SCHEMA_TABLES) {
    if (!isPgReadableTable(key)) continue;
    if (skipEnv.indexOf(key) > -1) { out.env_skipped.push(key); continue; }
    try {
      const cap = limEnv[key];
      let rows;
      if (cap !== undefined) {
        const res = await pool.query(`SELECT * FROM "${key}" ORDER BY id LIMIT $1`, [cap]);
        rows = reviveRows(res.rows);
      } else {
        rows = await readCollection(key);
      }
      /* B7 rule: empty PG + non-empty memory ⇒ keep memory (no destructive
         overwrite). Audited via out.kept so operators can see it. */
      if (!FORCE && Array.isArray(rows) && rows.length === 0
          && Array.isArray(store[key]) && store[key].length > 0) {
        out.kept.push(key);
        continue;
      }
      store[key] = rows;
      if (cap !== undefined) out.capped.push(key + ':' + cap);
      out.hydrated++;
    } catch (e) {
      out.skipped.push(key);
      console.warn('[DB] Hydration skipped for ' + key + ':', e.message);
    }
  }
  /* بازخوردِ بازبینِ PR #94: آینهٔ سقف‌دار/ناقص هرگز نباید روی فایلِ
     store.json نوشته شود — فایلِ کاملِ قبلی را می‌کُشد. این پرچم به
     index.js می‌گوید مسیرهای persist فایل را در PG-live ببندد. */
  out.mirror_incomplete = out.capped.length > 0 || out.env_skipped.length > 0;
  return out;
}

/**
 * آیا آینهٔ درون‌حافظه‌ای را باید روی store.json نوشت؟
 * خالث/خالص — قابلِ تستِ مستقیم (tests/wave18-hydration-guards.js).
 * فقط وقتی «نه» می‌گوید که PG مرجع است و هیدراتاسیون عمداً بریده
 * بوده (capped/env-skipped). هر حالتِ دیگر — از جمله آینهٔ کامل و
 * حالتِ بدونِ PG — رفتارِ قبلی (نوشتن) را حفظ می‌کند.
 */
function shouldPersistMirrorFile(pgLive, hydrateResult){
  return !(pgLive && hydrateResult && hydrateResult.mirror_incomplete);
}

/**
 * آیا سقفِ هیدراتاسیون جدولِ users را بریده؟ (هشدارِ بوت: کاربرانِ
 * بیرونِ سقف با auth مبتنی بر آینه نمی‌توانند وارد شوند — فقط برای
 * محیط‌های آزمونِ بار معنا دارد.)
 */
function hydrationUsersCapped(h){
  return !!(h && Array.isArray(h.capped) && h.capped.some(function(s){
    return String(s).split(':')[0] === 'users';
  }));
}

/* F1 (chaos-drill #185 — بحرانی): «PG انتظار می‌رود؟»
   در production با DATABASE_URL ست، اگر isPgActive وسطِ اجرا false شود
   (قطعِ PG + reconnectِ ناموفق)، هیچ مسیری حق ندارد memory را «سالم»
   جا بزند — وگرنه readiness سبزِ دروغ می‌شود و ackهای 200 پس از بازگشتِ
   PG در آن نیستند (گم‌شدنِ دائمیِ دادهٔ ackشده؛ شاهد: chaos-drill-pg-outage). */
function pgExpected() {
  return !memoryFallbackAllowed() && !!(process.env.DATABASE_URL);
}

/**
 * Quick ping for health probes & readiness checks
 */
async function ping() {
  if (!isPostgres()) {
    if (pgExpected()) {
      return { ok: false, driver: 'none', alive: false,
        error: 'PostgreSQL expected in production (DATABASE_URL set) but not connected — refusing memory driver' };
    }
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

  const start = process.hrtime.bigint();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    metrics.observeDb('transaction', 'primary', dbSeconds(start), false, dbSlow(start));
    return result;
  } catch (err) {
    metrics.observeDb('transaction', 'primary', dbSeconds(start), true, false);
    try { await client.query('ROLLBACK'); }
    catch (rbErr) { console.error('[DB] ROLLBACK failed:', rbErr.message); }   /* P1-14: خطایِ rollback نباید خطایِ اصلی را بپوشاند */
    throw err;
  } finally {
    client.release();
  }
}

/* Wave 10 (پارتیشن‌بندی): فهرستِ جدول‌هایِ پارتیشن‌شده — PAYESH_PARTITIONED_TABLES
   (مثلاً "grades,attendance"). خالی ⇒ همه‌چیز مثلِ قبل (ON CONFLICT (id)).
   سوییچِ صریح تا rollout تدریجی و rollback لحظه‌ای ممکن باشد. */
function isPartitionedTable(name) {
  const v = String(process.env.PAYESH_PARTITIONED_TABLES || '');
  if (!v) return false;
  return v.split(',').map((x) => x.trim()).filter(Boolean).includes(String(name));
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

    /* Wave 10 (پارتیشن‌بندی): جدولِ پارتیشن‌شده PK (id, created_at) دارد —
       ON CONFLICT (id) دیگر به هیچ uniqueای نمی‌خورد و فرمِ (id, created_at)
       هم idempotency را می‌شکند (id تکراری با created_at متفاوت ⇒ سطرِ
       دوم). معادلِ دقیقِ upsert: اول UPDATE به id (ایندکسِ غیر یکتایِ id)؛
       اگر هیچ سطری نداشت INSERT؛ رقابتِ هم‌زمان با 23505 گرفته می‌شود و
       UPDATE دوباره می‌زند — «آخرین برنده»، همان ترتیبِ DO UPDATE. */
    if (isPartitionedTable(col)) {
      const upFields = fields.filter(f => f !== 'id');
      const hasId = data.id != null && Number.isFinite(Number(data.id));
      if (hasId && upFields.length > 0) {
        const setSql = upFields.map((f, i) => `${ident(f)} = $${i + 1}`).join(', ');
        const upVals = upFields.map(f => valOf(data[f]));
        const updSql = `UPDATE ${table} SET ${setSql} WHERE id = $${upFields.length + 1};`;
        const updRes = await client.query(updSql, upVals.concat([Number(data.id)]));
        if (updRes && Number(updRes.rowCount) > 0) return; /* سطرِ موجود ⇒ به‌روزرسانی شد */
      }
      const insSql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders});`;
      try {
        await client.query(insSql, values);
      } catch (err) {
        /* رقابت: کسِ دیگری همین id را همین لحظه درج کرد — مثلِ ON CONFLICT
           DO UPDATE، ما برندهٔ نهایی هستیم: UPDATE دوباره. */
        if (err && err.code === '23505' && hasId && upFields.length > 0) {
          const setSql = upFields.map((f, i) => `${ident(f)} = $${i + 1}`).join(', ');
          const upVals = upFields.map(f => valOf(data[f]));
          const updSql = `UPDATE ${table} SET ${setSql} WHERE id = $${upFields.length + 1};`;
          const updRes = await client.query(updSql, upVals.concat([Number(data.id)]));
          if (!updRes || !(Number(updRes.rowCount) > 0)) throw err;
        } else {
          throw err;
        }
      }
      return;
    }

    const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet};`;
    await client.query(sql, values);
  } else if (t === 'upd') {
    const fields = Object.keys(data).filter(f => f !== 'id');
    if (fields.length === 0) return;
    const id = Number(op.id != null ? op.id : data.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error('missing id for update op');

    /* ADR-013 hardening: version is server-owned whenever OCC is present.
       A client-supplied data.version must never pin/rewrite the version counter,
       otherwise repeated writes with the same base_version can all succeed.
       The base_version predicate and the version increment must be part of the
       same UPDATE so PostgreSQL serializes the compare-and-write atomically. */
    const hasBaseVersion = op.base_version != null;
    const writeFields = hasBaseVersion ? fields.filter(f => f !== 'version') : fields;
    const values = writeFields.map(f => valOf(data[f]));
    const versionClause = hasBaseVersion
      ? ', version = COALESCE(version, 1) + 1'
      : (writeFields.includes('version') ? '' : ', version = COALESCE(version, 1) + 1');
    const setSql = writeFields.map((f, i) => `${ident(f)} = ${String.fromCharCode(36)}${i + 1}`).join(', ') + versionClause;

    if (op.base_version != null) {
      const base = op.base_version;
      if (typeof base !== 'number' || !Number.isInteger(base) || base < 1) {
        const e = new Error('bad base_version');
        e.code = 'bad_base_version';
        throw e;
      }
      const res = await client.query(
        `UPDATE ${table} SET ${setSql} WHERE id = ${writeFields.length + 1} AND version = ${writeFields.length + 2};`,
        values.concat([id, base])
      );
      if (res && res.rowCount === 0) {
        const e = new Error('optimistic concurrency conflict');
        e.code = 'occ_conflict';
        e.status = 409;
        e.op = op;
        throw e;
      }
    } else {
      if (process.env.PAYESH_STRICT_OCC === '1') {
        const e = new Error('optimistic concurrency conflict: missing required base_version');
        e.code = 'missing_base_version';
        e.status = 409;
        throw e;
      }
      await client.query(`UPDATE ${table} SET ${setSql} WHERE id = ${writeFields.length + 1};`, values.concat([id]));
    }
  } else if (t === 'del') {
    const delId = Number(op.id != null ? op.id : (data && data.id));
    if (delId) {
      if (op.base_version != null) {
        const base = op.base_version;
        if (typeof base !== 'number' || !Number.isInteger(base) || base < 1) {
          const e = new Error('bad base_version');
          e.code = 'bad_base_version';
          throw e;
        }
        const res = await client.query(
          `DELETE FROM ${table} WHERE id = $1 AND version = $2;`,
          [delId, base]
        );
        if (res && res.rowCount === 0) {
          const e = new Error('optimistic concurrency conflict');
          e.code = 'occ_conflict';
          e.status = 409;
          e.op = op;
          throw e;
        }
      } else {
        if (process.env.PAYESH_STRICT_OCC === '1') {
          const e = new Error('optimistic concurrency conflict: missing required base_version');
          e.code = 'missing_base_version';
          e.status = 409;
          throw e;
        }
        await client.query(`DELETE FROM ${table} WHERE id = $1;`, [delId]);
      }
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
    /* F1 (chaos-drill #185): در production با DATABASE_URL، skipِ بی‌صدایِ
       آینه = ackِ 200ی که هرگز به PG نمی‌رسد ⇒ THROW تا sync.js همان مسیرِ
       رسمیِ sync_mirror_failed/503 + rollback را برود (کلاینت retry می‌کند). */
    if (pgExpected()) {
      throw new Error('PostgreSQL expected in production but not connected — refusing silent memory ack (F1)');
    }
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
    } catch (e) {
      /* P0-1 (round 3, item 3) — this used to be an empty catch, which silently
         downgraded a PostgreSQL failure to the per-process JSON store. That is
         an idempotency hole: a sync uid whose "already applied?" check could
         not be answered was treated as *not* applied, so the same op could be
         applied twice across instances. In production we now fail closed; the
         sync route turns the throw into a clean 500 (server/index.js request
         wrapper) / 503, and the client retries. Dev/test keeps the old
         warn-and-continue behaviour so local offline runs still work. */
      if (!memoryFallbackAllowed()) {
        throw new Error('isUidProcessed: PostgreSQL idempotency check failed in production (refusing to fall back to the per-process store): '
          + ((e && e.message) || e));
      }
      console.warn('[DB] isUidProcessed: PostgreSQL query failed, using the in-memory store (dev/test only):', (e && e.message) || e);
    }
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
    const out = {
      ok: true,
      driver: 'postgres',
      latency_ms: latency,
      total_count: pool.totalCount,
      idle_count: pool.idleCount,
      waiting_count: pool.waitingCount
    };
    /* Wave 10 — read-replica observability (present only when configured+live) */
    out.read_replica = isReplicaActive() ? {
      active: true,
      total_count: readPool.totalCount,
      idle_count: readPool.idleCount,
      waiting_count: readPool.waitingCount
    } : { active: false };
    return out;
  } catch (err) {
    return { ok: false, driver: 'postgres', error: err.message };
  }
}

/**
 * Wave 10 — concise pool-summary for /health-style introspection: primary +
 * (optional) read replica, their current lease counts, and replica routing flag.
 */
function poolStats() {
  const stats = {
    driver: isPostgres() ? 'postgres' : 'memory',
    primary: {
      active: isPostgres(),
      min: config.min,
      max: config.max,
      total_count: pool ? pool.totalCount : 0,
      idle_count: pool ? pool.idleCount : 0,
      waiting_count: pool ? pool.waitingCount : 0
    },
    read_replica: isReplicaActive() ? {
      active: true,
      min: config.readMin,
      max: config.readMax,
      total_count: readPool.totalCount,
      idle_count: readPool.idleCount,
      waiting_count: readPool.waitingCount
    } : { active: false }
  };
  stats.routing_reads_to_replica = isReplicaActive();   /* queryRead() target */
  return stats;
}

/**
 * Graceful shutdown
 */
async function close() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (replicaReprobeTimer) {
    clearTimeout(replicaReprobeTimer);
    replicaReprobeTimer = null;
  }
  if (pool) {
    try {
      await pool.end();
    } catch (e) {}
    pool = null;
    isPgActive = false;
  }
  /* Wave 10 — tear down the read replica too */
  if (readPool) {
    try {
      await readPool.end();
    } catch (e) {}
    readPool = null;
    readPoolActive = false;
  }
}

/* P1-14: seam تزریقِ pool برای تستِ اتمی‌بودن بدون PG واقعی (pg-mem).
   فقط تست از آن استفاده می‌کند؛ کدِ اجرایی همیشه از init می‌آید. */
function __setPoolForTests(p) {
  if (p) { pool = p; isPgActive = true; }
  else { pool = null; isPgActive = false; }
}

/* Wave 10 — same injection seam for the read-replica pool (fake-db tests only) */
function __setReadPoolForTests(p) {
  if (p) { readPool = p; readPoolActive = true; }
  else { readPool = null; readPoolActive = false; }
}

/* S3-1: درزِ تأخیرِ کاوش برایِ تست (پیش‌فرضِ اجرایی ۱۰۰۰۰ms دست‌نخورده) */
function __setReprobeDelayForTests(ms) {
  const v = Number(ms);
  if (Number.isFinite(v) && v >= 0) REPLICA_REPROBE_MS = v;
  return REPLICA_REPROBE_MS;
}

module.exports = {
  init,
  isPostgres,
  /* P0-1 (Package 1) — production backing-store policy */
  isProductionEnv,
  pgExpected,
  memoryFallbackAllowed,
  memoryFallbackRequested,
  backingStorePolicy,
  /* round 3, item 2 — observed pg Client errors (crash-prevention counter) */
  clientErrors,
  shouldPersistMirrorFile,
  hydrationUsersCapped,
  getPool,
  isReplicaActive,
  getReadPool,
  query,
  queryRead,
  readCollection,
  readOne,
  hydrateStoreFromPg,
  ping,
  transaction,
  persistOp,
  persistOpWithClient,
  persistOpsBatchWithClient,
  persistOpsBatch,
  __setPoolForTests,
  /* Wave 10 (chg_id): کنارگذاریِ ستون‌های داخلی برای خواننده‌های بیرونی (pull/delta) */
  stripInternalColumns,
  /* Wave 10 (پارتیشن‌بندی): آیا این جدول در PAYESH_PARTITIONED_TABLES است */
  isPartitionedTable,
  __setReadPoolForTests,
  __setReprobeDelayForTests,
  isUidProcessed,
  healthCheck,
  poolStats,
  close
};
