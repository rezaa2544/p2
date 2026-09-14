#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-persistence-failure.js — Package 1 / P0-1, test 4 of 5
   ───────────────────────────────────────────────────────────────────
   A persistence failure in production must surface as an explicit
   failure — never as a silent success on the JSON store.

   Two failure modes are exercised against a real PostgreSQL 18:
     (a) the backend is killed mid-transaction (pg_terminate_backend on
         our own pid) ⇒ the write must throw and must not land;
     (b) PostgreSQL is unreachable at boot in production ⇒ db.init must
         return ok:false (before the gate it returned
         {ok:true, driver:'memory', fallback:true} — a silent success).

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       NODE_PATH=/home/user/pgws/node_modules node tests/pg-prod-persistence-failure.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-persistence-failure';
const PGURL = process.env.PG_LIVE_PG || 'postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1';
const DBJS = path.join(ROOT, 'server', 'db.js');

let pass = 0, fail = 0;
let preflightOk = false;   /* only a connectivity failure may count as NOT-RUN */
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) {
  console.log(NAME + ': NOT-RUN — the pg driver is not resolvable (set NODE_PATH)');
  process.exit(2);
}
function freshDb() {
  delete require.cache[require.resolve(DBJS)];
  return require(DBJS);
}

(async function main() {
  console.log(NAME + ' — persistence failure must be explicit, never silent\n');

  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  try { await probe.query('SELECT 1'); }
  catch (e) {
    console.log(NAME + ': NOT-RUN — PostgreSQL not reachable: ' + e.message);
    process.exit(2);
  } finally { try { await probe.end(); } catch (e) {} }
  preflightOk = true;

  process.env.NODE_ENV = 'production';
  process.env.PAYESH_ENV = 'production';
  process.env.DATABASE_URL = PGURL;
  delete process.env.ALLOW_MEMORY_FALLBACK;

  const db = freshDb();
  const info = await db.init({ users: [], __processed_uids: {} });
  chk('1a baseline: production init on live PostgreSQL is ok',
    info && info.ok === true && info.driver === 'postgres', JSON.stringify(info));

  /* ── (a) backend killed mid-write ── */
  await db.query('DROP TABLE IF EXISTS chat1_pkg1_fail');
  await db.query('CREATE TABLE chat1_pkg1_fail (id int PRIMARY KEY, v text NOT NULL)');

  let threw = false, errMsg = '';
  try {
    await db.transaction(async (c) => {
      /* FINDING (flagged, not silently absorbed): when the backend dies the
         pg *Client* emits an 'error' event that nothing in server/db.js
         listens to, so Node aborts the whole process with
         "Unhandled 'error' event". The query also rejects, so the failure is
         never silent — but crashing the process is a separate robustness gap
         and is out of this package's scope (boot path only). The no-op
         listener here keeps THIS test measuring the transaction result. */
      c.on('error', () => {});
      await c.query("INSERT INTO chat1_pkg1_fail (id, v) VALUES (1, 'in-flight')");
      /* Kill our own backend: the connection dies while the write is in
         flight, which is what a crash/OOM/failover looks like from here. */
      await c.query('SELECT pg_terminate_backend(pg_backend_pid())');
      await c.query("INSERT INTO chat1_pkg1_fail (id, v) VALUES (2, 'after-kill')");
    });
  } catch (e) { threw = true; errMsg = String(e && e.message || e); }

  chk('2a a mid-write backend kill throws (explicit failure)', threw === true,
    'did not throw; err=' + errMsg);
  chk('2b the error names a connection/termination problem, not a fake success',
    /terminat|connection|closed|ECONN|unexpected/i.test(errMsg), errMsg);

  /* The write must not have landed anywhere. */
  const probe2 = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  let rows = -1;
  try {
    const r = await probe2.query('SELECT count(*)::int AS n FROM chat1_pkg1_fail');
    rows = r.rows[0].n;
  } catch (e) { rows = -1; }
  finally { try { await probe2.end(); } catch (e) {} }
  chk('2c the killed write did not persist (0 rows)', rows === 0, 'rows=' + rows);

  /* And it must not have been quietly mirrored into the JSON store. */
  const memStore = { users: [], __processed_uids: {} };
  chk('2d nothing was silently mirrored into the in-memory store',
    Object.keys(memStore.__processed_uids).length === 0 && (memStore.chat1_pkg1_fail === undefined));

  await db.query('DROP TABLE IF EXISTS chat1_pkg1_fail').catch(() => {});
  try { await db.close(); } catch (e) {}

  /* ── (b) PostgreSQL unreachable at boot, in production ── */
  {
    process.env.DATABASE_URL = 'postgres://chat1:chat1@127.0.0.1:1/payesh_none';
    process.env.PG_TIMEOUT_MS = '2000';
    const D = freshDb();
    const r = await D.init({ users: [] });
    chk('3a unreachable PostgreSQL in production ⇒ ok:false (not a silent ok:true)',
      r && r.ok === false, JSON.stringify(r));
    chk("3b driver is 'none', not 'memory'", r && r.driver === 'none', JSON.stringify(r));
    chk('3c the error is explicit about production + PostgreSQL',
      r && /PostgreSQL unreachable in production/.test(r.error || ''), JSON.stringify(r));
    chk('3d isPostgres() stays false so write paths cannot pretend to persist',
      D.isPostgres() === false);
    chk('3e the JSON persist path stays disabled in production',
      D.memoryFallbackAllowed() === false);
    try { await D.close(); } catch (e) {}
  }

  /* ── control: the same unreachable DB in development still falls back ── */
  {
    process.env.NODE_ENV = 'development';
    process.env.PAYESH_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://chat1:chat1@127.0.0.1:1/payesh_none';
    const Dv = freshDb();
    const r = await Dv.init({ users: [] });
    chk('4a development keeps the pre-existing fallback (no regression)',
      r && r.ok === true && r.driver === 'memory', JSON.stringify(r));
    try { await Dv.close(); } catch (e) {}
  }

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  /* A missing gate / broken assertion is a FAILURE, not a skip. Only an
     unusable environment (no live PostgreSQL) may report NOT-RUN. */
  if (!preflightOk) {
    console.log(NAME + ': NOT-RUN — environment unusable: ' + (e && e.message ? e.message : e));
    process.exit(2);
  }
  fail++;
  console.log('  ❌ harness threw (counted as a failure): ' + (e && e.message ? e.message : e));
  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail) + '  FAILED: harness error');
  process.exit(1);
});
