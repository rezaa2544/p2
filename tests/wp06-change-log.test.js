#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wp06-change-log.test.js — WP-06 (#434): قراردادِ لاگِ تغییرِ seq-دار
   ───────────────────────────────────────────────────────────────────
   Contract under test (migrations/028 + server/db.js persistOpsBatch +
   server/change-log.js):

   CL1  a committed persistOpsBatch writes one sync_change_log row per
        applied op, inside the SAME transaction (collection, record_id,
        school_id, op, version, at all present);
   CL2  ids are monotonic in apply order (the cursor basis);
   CL3  tenant isolation: the reader (readChangeLogSince) without a
        school_id for a non-superadmin actor = fail-closed
        PHASE6_TENANT_ISOLATION_BREACH (never a silent full log);
   CL4  per-tenant filter: a tenant reader sees ONLY its school rows;
   CL5  NEGATIVE PROOF (the atomicity law): when the change-log insert
        FAILS mid-transaction, the WHOLE batch rolls back — the data
        mutation must NOT survive without its log row;
   CL6  PAYESH_SYNC_LOG=off = the legacy path: no log rows, the batch
        still commits (the rollback lock for the old behavior).

   Exit codes: 0 = green · 1 = check failed · 2 = NOT-RUN (no live PG).

   Usage (real PostgreSQL required — this is a PG-contract suite):
     PG_LIVE_PG='postgres://postgres:***@127.0.0.1:15432/payesh' \
       node tests/wp06-change-log.test.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const NAME = 'wp06-change-log';
const PGURL = process.env.PG_LIVE_PG || null;
if (!PGURL) {
  console.log(NAME + ': NOT-RUN — PG_LIVE_PG required (PG-contract suite)');
  process.exit(2);
}
/* server/db.js reads DATABASE_URL at require time — same contract as the
   other PG-contract suites (the harness env must land on the real seam). */
process.env.DATABASE_URL = PGURL;

let pg = null;
try { pg = require('pg'); } catch (e) { pg = null; }
if (!pg) { console.log(NAME + ': NOT-RUN — pg driver not resolvable (set NODE_PATH)'); process.exit(2); }

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

async function main() {
  const client = new pg.Client({ connectionString: PGURL });
  await client.connect();

  /* the suite needs migration 028 present (version column = TEXT) */
  const mig = await client.query("SELECT 1 FROM schema_migrations WHERE version::text = '028'");
  if (!mig.rows.length) {
    console.log(NAME + ': NOT-RUN — migration 028 not applied on the target DB');
    await client.end();
    process.exit(2);
  }

  const { readChangeLogSince } = require('../server/change-log.js');

  /* ── fresh workspace for this suite's records ── */
  await client.query("CREATE TABLE IF NOT EXISTS wp06_t (id TEXT PRIMARY KEY, school_id BIGINT, payload TEXT)");
  await client.query('DELETE FROM wp06_t');

  const batch = [
    { c: 'wp06_t', t: 'ins', uid: 'wp06-uid-1', data: { id: 'wp06-r1', school_id: 1, payload: 'a' } },
    { c: 'wp06_t', t: 'ins', uid: 'wp06-uid-2', data: { id: 'wp06-r2', school_id: 2, payload: 'b' } },
    { c: 'wp06_t', t: 'ins', uid: 'wp06-uid-3', data: { id: 'wp06-r3', school_id: 1, payload: 'c' } }
  ];

  const db = require('../server/db.js');
  /* db.js init is async — until awaited the layer runs in memory mode
     (the drill suites instead inject __setPoolForTests). */
  await db.init();
  if (!db.isPostgres()) {
    console.log(NAME + ': NOT-RUN — db layer did not enter PostgreSQL mode (DATABASE_URL/init)');
    await client.end();
    process.exit(2);
  }

  /* CL1+CL2: committed batch ⇒ log rows, monotonic ids, per-op fields */
  const before = await client.query('SELECT COALESCE(MAX(id),0) AS m FROM sync_change_log');
  const startSeq = Number(before.rows[0].m);
  const r1 = await db.persistOpsBatch(batch);
  chk('CL1 batch commits with the change-log rows written in-transaction', r1 && r1.ok === true && r1.count === 3);
  const logged = await client.query(
    'SELECT id, collection, record_id, school_id, op FROM sync_change_log WHERE id > $1 AND collection = $2 ORDER BY id ASC',
    [startSeq, 'wp06_t']
  );
  chk('CL1 one log row per applied op', logged.rows.length === 3, 'got ' + logged.rows.length);
  chk('CL1 fields populated (collection/record_id/school_id/op)',
    logged.rows.length === 3
    && logged.rows.every((r) => r.collection === 'wp06_t' && r.record_id && Number.isFinite(Number(r.school_id)) && (r.op === 'ins')),
    JSON.stringify(logged.rows).slice(0, 160));
  const ids = logged.rows.map((r) => Number(r.id));
  chk('CL2 ids are monotonic ascending', ids.length === 3 && ids[0] < ids[1] && ids[1] < ids[2], ids.join(','));

  /* CL3: reader fail-closed without a tenant scope for non-superadmin */
  const noTenant = await readChangeLogSince(db, { sinceSeq: 0, isSuperadmin: false, schoolId: null });
  chk('CL3 non-superadmin without school_id = fail-closed PHASE6',
    noTenant && noTenant.ok === false && noTenant.code === 'PHASE6_TENANT_ISOLATION_BREACH');

  /* CL4: tenant reader sees only its school */
  const t1 = await readChangeLogSince(db, { sinceSeq: startSeq, schoolId: 1, collections: ['wp06_t'] });
  const t2 = await readChangeLogSince(db, { sinceSeq: startSeq, schoolId: 2, collections: ['wp06_t'] });
  chk('CL4 tenant 1 sees only its own rows (2 of 3)',
    t1.ok === true && t1.rows.length === 2 && t1.rows.every((r) => Number(r.school_id) === 1),
    JSON.stringify(t1).slice(0, 160));
  chk('CL4 tenant 2 sees only its own row (1 of 3)',
    t2.ok === true && t2.rows.length === 1 && Number(t2.rows[0].school_id) === 2);
  const sup = await readChangeLogSince(db, { sinceSeq: startSeq, isSuperadmin: true, collections: ['wp06_t'] });
  chk('CL4 superadmin (national) sees all 3',
    sup.ok === true && sup.rows.length === 3);

  /* CL5: NEGATIVE PROOF — a failing log insert must roll back the batch.
     Inject the failure with a BEFORE INSERT trigger while the table stays
     PRESENT (a rename would only trip the graceful hasLog skip, not the
     atomicity law); the data mutation must NOT survive. */
  await client.query(`CREATE OR REPLACE FUNCTION wp06_break_log() RETURNS trigger AS $fn$
    BEGIN RAISE EXCEPTION 'injected sync_change_log failure'; END $fn$ LANGUAGE plpgsql`);
  await client.query('DROP TRIGGER IF EXISTS wp06_break ON sync_change_log');
  await client.query('CREATE TRIGGER wp06_break BEFORE INSERT ON sync_change_log FOR EACH ROW EXECUTE FUNCTION wp06_break_log()');
  let rolledBack = false;
  try {
    await db.persistOpsBatch([
      { c: 'wp06_t', t: 'ins', uid: 'wp06-uid-4', data: { id: 'wp06-r4', school_id: 1, payload: 'must-not-survive' } }
    ]);
  } catch (e) {
    rolledBack = true; /* the throw = the contract (the caller retries) */
  }
  const survivor = await client.query("SELECT count(*) AS c FROM wp06_t WHERE id = 'wp06-r4'");
  const uids = await client.query("SELECT count(*) AS c FROM server_processed_uids WHERE uid = 'wp06-uid-4'");
  await client.query('DROP TRIGGER IF EXISTS wp06_break ON sync_change_log');
  await client.query('DROP FUNCTION IF EXISTS wp06_break_log()');
  chk('CL5 broken log ⇒ batch THROWS (explicit failure, no silent ack)', rolledBack);
  chk('CL5 negative proof: the data mutation did NOT survive without its log row',
    Number(survivor.rows[0].c) === 0, 'rows surviving: ' + survivor.rows[0].c);
  chk('CL5 negative proof: the UID claim did NOT survive either (no poisoned dedup)',
    Number(uids.rows[0].c) === 0, 'uid claims surviving: ' + uids.rows[0].c);

  /* CL6: PAYESH_SYNC_LOG=off = the legacy path — the batch commits, no rows */
  const envBefore = process.env.PAYESH_SYNC_LOG;
  process.env.PAYESH_SYNC_LOG = 'off';
  const beforeOff = await client.query('SELECT COALESCE(MAX(id),0) AS m FROM sync_change_log');
  const rOff = await db.persistOpsBatch([
    { c: 'wp06_t', t: 'ins', uid: 'wp06-uid-5', data: { id: 'wp06-r5', school_id: 1, payload: 'off-mode' } }
  ]);
  const afterOff = await client.query('SELECT COALESCE(MAX(id),0) AS m FROM sync_change_log');
  if (envBefore === undefined) delete process.env.PAYESH_SYNC_LOG; else process.env.PAYESH_SYNC_LOG = envBefore;
  chk('CL6 PAYESH_SYNC_LOG=off ⇒ the batch still commits (the legacy rollback lock)',
    rOff && rOff.ok === true);
  chk('CL6 PAYESH_SYNC_LOG=off ⇒ no log rows were written',
    Number(afterOff.rows[0].m) === Number(beforeOff.rows[0].m));

  /* cleanup */
  await client.query('DELETE FROM server_processed_uids WHERE uid LIKE \'wp06-uid-%\'');
  await client.query('DELETE FROM sync_change_log WHERE collection = \'wp06_t\'');
  await client.query('DROP TABLE IF EXISTS wp06_t');
  await client.end();

  console.log('\nنتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
  if (fail) {
    console.log('شکست‌ها:');
    for (const f of fails) console.log(' - ' + f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(NAME + ': FATAL —', e.message); process.exit(1); });
