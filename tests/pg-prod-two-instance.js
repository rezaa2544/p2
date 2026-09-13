#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   pg-prod-two-instance.js — Package 1 / P0-1, test 3 of 5
   ───────────────────────────────────────────────────────────────────
   The invariant the gate protects: with PostgreSQL as the backing store,
   two independent server instances see ONE state — a write by A is
   immediately readable by B, and an update by B is readable by A.

   It also demonstrates the failure the gate exists to prevent: with the
   JSON/in-memory store each process owns its own copy, so the same
   write/update sequence diverges (the pre-gate production behaviour).

   Two *independent* db.js module instances are created by clearing the
   require cache, so each holds its own pool / memoryStore — exactly what
   two OS processes would do.

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage:
     PG_LIVE_PG='postgres://chat1:chat1@127.0.0.1:55433/payesh_chat1' \
       NODE_PATH=/home/user/pgws/node_modules node tests/pg-prod-two-instance.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAME = 'pg-prod-two-instance';
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
  console.log(NAME + ' — two instances, one PostgreSQL ⇒ one state\n');

  const probe = new pg.Pool({ connectionString: PGURL, max: 2, connectionTimeoutMillis: 5000 });
  try { await probe.query('SELECT 1'); }
  catch (e) {
    console.log(NAME + ': NOT-RUN — PostgreSQL not reachable: ' + e.message);
    process.exit(2);
  } finally { try { await probe.end(); } catch (e) {} }
  preflightOk = true;

  /* ══ Part A — production, both instances on PostgreSQL ══ */
  process.env.NODE_ENV = 'production';
  process.env.PAYESH_ENV = 'production';
  process.env.DATABASE_URL = PGURL;
  delete process.env.ALLOW_MEMORY_FALLBACK;

  const A = freshDb();
  const B = freshDb();
  chk('A0 two independent db.js module instances (what two OS processes do)', A !== B);

  const ia = await A.init({ users: [] });
  const ib = await B.init({ users: [] });
  chk('A0b each instance holds its own distinct live pool',
    !!A.getPool() && !!B.getPool() && A.getPool() !== B.getPool());
  chk('A1 instance A init ok on postgres', ia && ia.ok === true && ia.driver === 'postgres', JSON.stringify(ia));
  chk('A2 instance B init ok on postgres', ib && ib.ok === true && ib.driver === 'postgres', JSON.stringify(ib));

  await A.query('DROP TABLE IF EXISTS chat1_pkg1_shared');
  await A.query('CREATE TABLE chat1_pkg1_shared (id int PRIMARY KEY, v text NOT NULL)');

  /* A writes → B must read it. */
  await A.query("INSERT INTO chat1_pkg1_shared (id, v) VALUES (1, 'written-by-A')");
  const bRead1 = await B.query('SELECT v FROM chat1_pkg1_shared WHERE id = 1');
  chk('A3 write by A is immediately visible to B',
    bRead1.rows.length === 1 && bRead1.rows[0].v === 'written-by-A', JSON.stringify(bRead1.rows));

  /* B updates → A must read it. */
  await B.query("UPDATE chat1_pkg1_shared SET v = 'updated-by-B' WHERE id = 1");
  const aRead1 = await A.query('SELECT v FROM chat1_pkg1_shared WHERE id = 1');
  chk('A4 update by B is immediately visible to A',
    aRead1.rows.length === 1 && aRead1.rows[0].v === 'updated-by-B', JSON.stringify(aRead1.rows));

  /* Concurrent writes from both, then both agree on the total. */
  await Promise.all([
    A.query("INSERT INTO chat1_pkg1_shared (id, v) VALUES (2, 'a2')"),
    B.query("INSERT INTO chat1_pkg1_shared (id, v) VALUES (3, 'b3')")
  ]);
  const ca = await A.query('SELECT count(*)::int AS n FROM chat1_pkg1_shared');
  const cb = await B.query('SELECT count(*)::int AS n FROM chat1_pkg1_shared');
  chk('A5 after concurrent writes both instances report identical state',
    ca.rows[0].n === 3 && cb.rows[0].n === 3 && ca.rows[0].n === cb.rows[0].n,
    'A=' + ca.rows[0].n + ' B=' + cb.rows[0].n);

  /* A transaction rolled back on A must not appear on B either. */
  let threw = false;
  try {
    await A.transaction(async (c) => {
      await c.query("INSERT INTO chat1_pkg1_shared (id, v) VALUES (99, 'doomed')");
      throw new Error('deliberate rollback');
    });
  } catch (e) { threw = true; }
  const afterRollback = await B.query('SELECT count(*)::int AS n FROM chat1_pkg1_shared WHERE id = 99');
  chk('A6 a rolled-back write on A is absent for B (no partial visibility)',
    threw === true && afterRollback.rows[0].n === 0, 'threw=' + threw + ' rows=' + afterRollback.rows[0].n);

  await A.query('DROP TABLE IF EXISTS chat1_pkg1_shared');
  try { await A.close(); } catch (e) {}
  try { await B.close(); } catch (e) {}

  /* ══ Part B — the counter-example: memory store diverges per process ══ */
  process.env.NODE_ENV = 'development';
  process.env.PAYESH_ENV = 'development';
  delete process.env.DATABASE_URL;

  const M1 = freshDb();
  const M2 = freshDb();
  const storeA = { shared: [] };
  const storeB = { shared: [] };
  await M1.init(storeA);
  await M2.init(storeB);
  chk('B0 both memory instances are on the JSON/in-memory driver',
    M1.isPostgres() === false && M2.isPostgres() === false);

  storeA.shared.push({ id: 1, v: 'written-by-A' });
  /* readCollection is async in both modes — awaiting is what makes this a
     real read-path comparison rather than a comparison of two Promises. */
  const m1 = await M1.readCollection('shared');
  const m2 = await M2.readCollection('shared');
  chk('B1 memory instance A sees the write', Array.isArray(m1) && m1.length === 1,
    'type=' + typeof m1 + ' len=' + (Array.isArray(m1) ? m1.length : 'n/a'));
  chk('B2 memory instance B does NOT see it — per-process divergence (the P0-1 defect)',
    Array.isArray(m2) && m2.length === 0,
    'type=' + typeof m2 + ' len=' + (Array.isArray(m2) ? m2.length : 'n/a'));
  chk('B3 this divergence is impossible under the gate (production refuses memory)',
    (function () {
      process.env.NODE_ENV = 'production';
      const P = freshDb();
      const allowed = P.memoryFallbackAllowed();
      process.env.NODE_ENV = 'development';
      return allowed === false;
    })());

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
