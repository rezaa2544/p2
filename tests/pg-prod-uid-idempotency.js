#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-uid-idempotency.js — Package 1 / round 3, item 3
   ───────────────────────────────────────────────────────────────────
   db.isUidProcessed() used to swallow every PostgreSQL error with an
   empty catch and then answer from the per-process JSON store:

     try { ...SELECT 1 FROM server_processed_uids... } catch (e) {}

   That is an idempotency hole, not a graceful degradation: when the
   "already applied?" question cannot be answered by the shared database,
   the op was treated as NOT applied, so the same sync uid could be
   applied twice across instances. In production it must fail closed.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     NODE_PATH=~/pgws/node_modules \
       PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       node tests/pg-prod-uid-idempotency.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-uid-idempotency';
const PGURL = process.env.PG_LIVE_PG || 'postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1';
const DBJS = path.join(ROOT, 'server', 'db.js');

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}
function freshDb() {
  delete require.cache[require.resolve(DBJS)];
  return require(DBJS);
}

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) { console.log(NAME + ': NOT-RUN — pg driver not resolvable (set NODE_PATH)'); process.exit(2); }

(async function main() {
  console.log(NAME + ' — the idempotency check must fail closed in production\n');

  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  try { await probe.query('SELECT 1'); }
  catch (e) { console.log(NAME + ': NOT-RUN — PostgreSQL not reachable: ' + e.message); process.exit(2); }
  finally { try { await probe.end(); } catch (e) {} }

  /* ── 1. production + the idempotency table missing ⇒ throw ── */
  process.env.NODE_ENV = 'production';
  process.env.PAYESH_ENV = 'production';
  process.env.DATABASE_URL = PGURL;
  delete process.env.ALLOW_MEMORY_FALLBACK;

  const db = freshDb();
  const info = await db.init({ users: [], __processed_uids: { 'mem-only-uid': true } });
  chk('0a production init on live PostgreSQL is ok', info && info.ok === true && info.driver === 'postgres',
    JSON.stringify(info));

  await db.query('DROP TABLE IF EXISTS server_processed_uids');

  let threw = false, msg = '';
  try { await db.isUidProcessed('mem-only-uid'); }
  catch (e) { threw = true; msg = String(e && e.message || e); }
  chk('1a an unanswerable idempotency check THROWS in production (fail closed)',
    threw === true, 'did not throw — it silently answered from the per-process store');
  chk('1b the error says it refuses the per-process fallback',
    /production/.test(msg) && /per-process|fallback|idempotency/i.test(msg), msg);
  chk('1c a uid that ONLY exists in memory is not treated as processed',
    threw === true, 'memory-only uid would have been reported as already applied');

  /* ── 2. happy path must still work (no regression) ── */
  await db.query('CREATE TABLE IF NOT EXISTS server_processed_uids (uid VARCHAR(128) PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await db.query("INSERT INTO server_processed_uids (uid) VALUES ('applied-uid') ON CONFLICT DO NOTHING");

  const yes = await db.isUidProcessed('applied-uid');
  chk('2a a uid present in PostgreSQL is reported as processed', yes === true, 'got ' + yes);

  const no = await db.isUidProcessed('never-seen-uid');
  chk('2b an unknown uid is reported as NOT processed', no === false, 'got ' + no);

  await db.query('DROP TABLE IF EXISTS server_processed_uids');
  try { await db.close(); } catch (e) {}

  /* ── 3. development keeps warn-and-continue (no regression) ── */
  {
    process.env.NODE_ENV = 'development';
    process.env.PAYESH_ENV = 'development';
    const dv = freshDb();
    await dv.init({ users: [], __processed_uids: { 'dev-uid': true } });
    await dv.query('DROP TABLE IF EXISTS server_processed_uids').catch(() => {});
    let devThrew = false, devVal;
    try { devVal = await dv.isUidProcessed('dev-uid'); }
    catch (e) { devThrew = true; }
    chk('3a development does NOT throw on the same failure', devThrew === false,
      'it threw — that would break local/offline runs');
    chk('3b development still answers from the in-memory store', devVal === true, 'got ' + devVal);
    try { await dv.close(); } catch (e) {}
  }

  /* ── 4. structural: the empty catch is gone ── */
  const src = fs.readFileSync(DBJS, 'utf8');
  const bodyStart = src.indexOf('async function isUidProcessed');
  const body = bodyStart === -1 ? '' : src.slice(bodyStart, bodyStart + 1400);
  chk('4a isUidProcessed no longer contains an empty catch',
    body !== '' && !/catch\s*\(e\)\s*\{\s*\}/.test(body),
    body ? 'empty catch still present' : 'function not found');
  chk('4b the production path is gated by the same policy helper as the boot gate',
    /if\s*\(!memoryFallbackAllowed\(\)\)\s*\{[\s\S]{0,300}?throw/.test(body),
    'gate not found in isUidProcessed');

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail)
    + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(NAME + ': NOT-RUN — harness error: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
