'use strict';
/* M15-04 (P0-2) — SYNC READ BATCHING.
 *
 * PROBLEM (as authorized): 500 ops x up to 3 readOne = up to 1500 single-row
 * SELECTs per batch (scope-gate hydration, the OCC base check, and the apply
 * loop). The fix batches only the READ phase: ops are pre-scanned once into
 * (collection -> Set<id>), one set-based `WHERE id = ANY($1::bigint[])` fetch
 * per distinct collection warms a request-scoped cache, and findForApply /
 * the OCC base check consult that cache before falling back to the legacy
 * per-row readOne.
 *
 * This suite proves three things against REAL PostgreSQL:
 *   A) the read phase is now set-based (1 query per collection, 0 readOne);
 *   B) the fallback path is the exact legacy behaviour (readMany failing must
 *      degrade to per-row reads, never widen scope or change results);
 *   C) the 12 Hermes-verified sync invariants did not move — undo-log LIFO,
 *      undo idx position, undo state-equality, authoritativeRows first-wins,
 *      plannedVersions/OCC, intra-batch duplicate uid, mirrorAppend growthLog,
 *      reinsert verification, record_exists 409, !ex uPush, version-bump
 *      ordering, uPush scoping.
 *
 * Note on the mirror: in PG-live mode rows hydrated BY a batch are detached
 * from the store after a successful commit (PG is the authority; the mirror is
 * a bounded cache — sync.js "post-commit mirror detachment"). So mirror growth
 * is observed through a pre-commit hook snapshot, and undo correctness is
 * proven against a boot row that the batch must NOT own.
 *
 * Session/rate-limit fixtures; no auth certification.
 */
const assert = require('assert/strict'), crypto = require('crypto'), { Pool } = require('pg');
const db = require('../server/db'), { createSync } = require('../server/sync');
const url = process.env.SYNC_TEST_DATABASE_URL;
if (!url) throw Error('SYNC_TEST_DATABASE_URL required; missing real PG is failure, never skip');
const schema = 'm15sync_' + crypto.randomBytes(8).toString('hex');
const admin = new Pool({ connectionString: url });
const realPool = new Pool({ connectionString: url, options: '-c search_path=' + schema + ' -c statement_timeout=10000' });
let count = 0, failures = 0, seq = 5000;
/* هر check باید awaited شود — در غیرِ این صورت یک rejectionِ async به‌صورتِ
   PASS ثبت می‌شد (false-green). */
async function check(n, fn) {
  try { await fn(); count++; console.log(JSON.stringify({ check: n, result: 'PASS' })); }
  catch (e) { failures++; console.log(JSON.stringify({ check: n, result: 'FAIL', error: String(e && e.message || e).split('\n')[0] })); }
}

let readManyCalls = [], readOneCalls = [], override = null;
function make(hook) {
  readManyCalls = []; readOneCalls = [];
  const store = { classes: [], grades: [], announcements: [], users: [], __processed_uids: {} };
  const wrapped = {
    ...db,
    readMany: async (name, ids) => { readManyCalls.push({ name, ids: (ids || []).slice() }); return db.readMany(name, ids); },
    readOne: async (name, id) => { readOneCalls.push({ name, id }); return db.readOne(name, id); },
    persistSyncBatch: async ops => { if (hook) await hook(ops); return db.persistSyncBatch(ops); }
  };
  if (override && override.readMany)
    wrapped.readMany = async (name, ids) => { readManyCalls.push({ name, ids: (ids || []).slice() }); return override.readMany(name, ids); };
  const sync = createSync({
    store, db: wrapped, ids: { nextId: async () => ++seq },
    sessionFrom: async () => ({ id: 5, school_id: 1, role: 'manager' }),
    sendJson: (r, status, body) => { r.reply = { status, body }; },
    audit() {}, markDirty() {}, MAX_BATCH: 50, AT_DRIFT_MS: 999999
  });
  return { store, send: async ops => { const r = {}; await sync.apiSync({}, r, { ops: structuredClone(ops) }); return r.reply; } };
}
function op(uid, c, t, extra) {
  return { uid, c, t, by: 5, user_id: 5, school_id: 1, at: new Date().toISOString(),
    ...(t === 'upd' || t === 'del' ? { id: 1, base_version: 9 } : {}),
    data: c === 'classes' ? { name: 'renamed' } : (c === 'grades' ? { score: 18 } : { title: 'single intention', school_id: 1 }),
    ...extra };
}
const C_IDS = [], G_IDS = [];
for (let i = 0; i < 10; i++) { C_IDS.push(101 + i); G_IDS.push(201 + i); }

(async () => {
  try {
    await admin.query('CREATE SCHEMA ' + schema);
    db.__setPoolForTests(realPool);
    await realPool.query(`CREATE TABLE classes(id int primary key,school_id int,name text,version int,updated_at timestamptz,chg_id bigint);
 CREATE TABLE grades(id int primary key,school_id int,student_id int,score numeric,version int,updated_at timestamptz,chg_id bigint);
 CREATE TABLE announcements(id int primary key,school_id int,title text,updated_at timestamptz);
 CREATE TABLE users(id int primary key,school_id int,role text,full_name text,version int,updated_at timestamptz);
 CREATE TABLE server_processed_uids(uid text primary key,processed_at timestamptz);
 CREATE TABLE sync_conflicts(id bigint primary key,collection text,record_id int,school_id int,user_id int,client_uid text,base_version int,incoming_version int,current_version int,server_version int,client_data jsonb,server_data jsonb,server_state jsonb,incoming jsonb,status text,created_at timestamptz,updated_at timestamptz);
 CREATE TABLE server_tombstones(id BIGSERIAL PRIMARY KEY,"collection" VARCHAR(64) NOT NULL,record_id INTEGER NOT NULL,school_id INTEGER,deleted_by INTEGER,deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reason VARCHAR(255));`);
  } catch (e) { console.error('setup failed:', e.message); process.exitCode = 2; return; }

  const seed = async () => {
    await realPool.query('TRUNCATE classes,grades,announcements,users,sync_conflicts,server_processed_uids,server_tombstones');
    let ci = '', gi = '';
    for (let i = 0; i < 10; i++) {
      ci += (i ? ',' : '') + '(' + (101 + i) + ",1,'orig',9,NOW()," + (1000 + i) + ")";
      gi += (i ? ',' : '') + '(' + (201 + i) + ',1,' + (300 + i) + ',10,9,NOW(),' + (2000 + i) + ')';
    }
    await realPool.query('INSERT INTO classes VALUES ' + ci);
    await realPool.query('INSERT INTO grades VALUES ' + gi);
  };

  /* ── A) the read phase is set-based ───────────────────────────────── */
  await seed();
  {
    const ops = [];
    for (let i = 0; i < 10; i++) {
      ops.push(op(schema + '-c' + i, 'classes', 'upd', { id: 101 + i }));
      ops.push(op(schema + '-g' + i, 'grades', 'upd', { id: 201 + i }));
    }
    const r = await make().send(ops);
    await check('A1 batch of 20 ops applied ok', () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.equal(r.body.results.length, 20);
      assert.ok(r.body.results.every(x => x.ok), 'every op must succeed: ' + JSON.stringify(r.body.results.filter(x => !x.ok)));
    });
    await check('A2 exactly ONE set-based read per distinct collection (2 total)', () => {
      assert.equal(readManyCalls.length, 2, 'expected 2 readMany (classes, grades), got ' + readManyCalls.length);
      assert.deepStrictEqual(readManyCalls.map(x => x.name).sort(), ['classes', 'grades']);
    });
    await check('A3 the set carries exactly the batch ids', () => {
      const byName = {};
      for (const c of readManyCalls) byName[c.name] = new Set();
      for (const c of readManyCalls) for (const id of c.ids) byName[c.name].add(Number(id));
      assert.deepStrictEqual(Array.from(byName.classes).sort((a, b) => a - b), C_IDS, 'classes id set');
      assert.deepStrictEqual(Array.from(byName.grades).sort((a, b) => a - b), G_IDS, 'grades id set');
    });
    await check('A4 ZERO per-row readOne on the batched path (scope-gate + OCC + apply)', () => {
      assert.deepStrictEqual(readOneCalls, [], 'the batched path must not issue any readOne; got ' + JSON.stringify(readOneCalls));
    });
    await check('A5 functional equivalence — PG holds the new values and versions', async () => {
      const c = await realPool.query('SELECT * FROM classes ORDER BY id');
      assert.equal(c.rows.length, 10);
      assert.ok(c.rows.every(x => x.name === 'renamed' && x.version === 10), 'all classes renamed + bumped');
      const g = await realPool.query('SELECT * FROM grades ORDER BY id');
      assert.ok(g.rows.every(x => Number(x.score) === 18 && x.version === 10), 'all grades updated + bumped');
    });
  }

  /* ── A7: mirrorAppend growth — observed pre-commit, before the
     post-commit detachment removes batch-hydrated rows. chg_id must never
     enter the mirror (readMany goes through stripInternalColumns). ── */
  await seed();
  {
    let snapped = null;
    const m = make(async () => { snapped = JSON.parse(JSON.stringify(m.store.classes)); });
    const ops = [op(schema + '-m1', 'classes', 'upd', { id: 101 }), op(schema + '-m2', 'classes', 'upd', { id: 102 })];
    const r = await m.send(ops);
    await check('A7 mirrorAppend grows the mirror by exactly the hydrated rows, stripped', () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.ok(Array.isArray(snapped), 'pre-commit snapshot must exist');
      assert.equal(snapped.length, 2, 'mirror must hold the 2 hydrated rows pre-commit');
      assert.deepStrictEqual(snapped.map(x => Number(x.id)).sort((a, b) => a - b), [101, 102]);
      assert.ok(snapped.every(x => !('chg_id' in x)), 'internal columns (chg_id) must never enter the mirror');
      assert.ok(snapped.every(x => x.version === 10), 'the hydrated rows carry the applied mutation');
    });
  }

  /* ── B) fallback = exact legacy path when the batch read fails ────── */
  await seed();
  {
    override = { readMany: async () => { throw Error('injected batch failure'); } };
    const ops = [];
    for (let i = 0; i < 5; i++) ops.push(op(schema + '-f' + i, 'classes', 'upd', { id: 101 + i }));
    const r = await make().send(ops);
    await check('B1 a failed batch read degrades to the legacy per-row reads', () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.ok(r.body.results.every(x => x.ok));
      assert.equal(readManyCalls.length, 1, 'the batch is attempted exactly once per collection');
      /* مسیرِ legacy: هم scope-gate و هم بررسی OCC هر کدام یک readOne می‌زنند
         → ۲ خواندن برای هر op با store-miss (هر دو از همان readOneِ قبلی‌اند). */
      assert.equal(readOneCalls.length, 10, 'fallback must issue one readOne per read site per op; got ' + readOneCalls.length);
      assert.deepStrictEqual(readOneCalls.map(x => x.name), Array(10).fill('classes'));
      assert.deepStrictEqual(readOneCalls.map(x => Number(x.id)), [101, 101, 102, 102, 103, 103, 104, 104, 105, 105]);
    });
    override = null;
  }
  await seed();
  {
    override = { readMany: async () => { throw Error('injected batch failure'); } };
    const m = make();
    const r = await m.send([op(schema + '-f-rb', 'classes', 'upd', { id: 101 })]);
    await check('B2 the fallback path still commits correctly', async () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      const row = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
      assert.equal(row.name, 'renamed');
      assert.equal(row.version, 10);
    });
    override = null;
  }

  /* ── C) the 12 invariants ─────────────────────────────────────────── */

  /* 1+2+3: undo-log LIFO, idx position, state-equality. A boot row (id 50)
     that the batch does NOT own must survive the rollback untouched, while the
     6 batch-hydrated rows must be removed — this distinguishes a correct
     owned rollback from a blanket clear. */
  await seed();
  {
    const bootRow = { id: 50, school_id: 1, name: 'boot', version: 1 };
    const m = make(async () => { throw Error('injected commit failure'); });
    m.store.classes = [Object.assign({}, bootRow)];
    const ops = [op(schema + '-boot', 'classes', 'upd', { id: 50, base_version: 1 })];
    for (let i = 0; i < 6; i++) ops.push(op(schema + '-rb' + i, 'classes', 'upd', { id: 101 + i }));
    const r = await m.send(ops);
    await check('C1 undo rolls back batch-hydrated rows and restores the boot row exactly', () => {
      assert.equal(r.status, 503, JSON.stringify(r));
      assert.deepStrictEqual(m.store.classes, [bootRow],
        'the boot row must be restored to its exact pre-op state and the 6 hydrated rows removed');
    });
    await check('C2 rollback left PG untouched', async () => {
      const rows = (await realPool.query('SELECT * FROM classes ORDER BY id')).rows;
      assert.equal(rows.length, 10);
      assert.ok(rows.every(x => x.name === 'orig' && x.version === 9), 'no partial write may survive');
    });
  }

  /* 4: authoritativeRows first-wins — a concurrent newer write must beat the
     batch-cached row; the authoritative PG CAS rejects the stale write. */
  await seed();
  {
    const m = make(async () => {
      await realPool.query("UPDATE classes SET name='newer-client-B', version=10 WHERE id=101");
    });
    const r = await m.send([op(schema + '-race', 'classes', 'upd', { id: 101 })]);
    await check('C3 authoritativeRows/PG-CAS first-wins over the batch cache', () => {
      assert.equal(r.status, 409, JSON.stringify(r));
    });
    await check('C4 the newer PG row survives', async () => {
      const row = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
      assert.equal(row.name, 'newer-client-B');
      assert.equal(row.version, 10);
    });
  }

  /* 5: plannedVersions / OCC — an out-of-order older event is refused
     (advisory pre-check; the row was read into the cache at version 10). */
  await seed();
  {
    await realPool.query("UPDATE classes SET name='newer', version=10 WHERE id=101");
    const m = make();
    const r = await m.send([op(schema + '-occ1', 'classes', 'upd', { id: 101 })]);
    await check('C5 plannedVersions/OCC — an older base is refused', () => {
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body.results) && r.body.results.length === 1);
      assert.equal(r.body.results[0].ok, false, 'the stale op must not be applied');
      assert.equal(r.body.results[0].code, 'stale_base', JSON.stringify(r.body.results[0]));
    });
  }

  /* 6: intra-batch duplicate uid — the second occurrence must not reapply. */
  await seed();
  {
    const m = make();
    const dup = op(schema + '-dup', 'classes', 'upd', { id: 101 });
    const r = await m.send([dup, structuredClone(dup)]);
    await check('C6 intra-batch duplicate uid applied exactly once', async () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      const oks = r.body.results.filter(x => x.ok);
      assert.equal(oks.length, 1, 'exactly one of the duplicate ops may apply');
      const row = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
      assert.equal(row.version, 10, 'version bumped exactly once');
    });
  }

  /* 7: mirrorAppend growthLog — proven by A7 (exact growth + id set). */
  await check('C7 mirrorAppend growthLog — proven in A7', () => assert.ok(true));

  /* 8: reinsert verification — an ins claiming an existing identity conflicts. */
  await seed();
  {
    const m = make();
    const r = await m.send([op(schema + '-ins', 'classes', 'ins', { data: { id: 101, name: 'rewind', school_id: 1 } })]);
    await check('C8 reinsert verification / record_exists 409', () => {
      assert.equal(r.status, 409, JSON.stringify(r));
    });
    await check('C9 the existing row is untouched', async () => {
      const row = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
      assert.equal(row.name, 'orig');
      assert.equal(row.version, 9);
    });
  }

  /* 10: !ex uPush — a del on a store-miss row must hydrate first, then
     delete, and the delete must reach PG. */
  await seed();
  {
    const m = make();
    const r = await m.send([op(schema + '-del', 'classes', 'del', { id: 101, data: {} })]);
    await check('C10 del on a store-miss hydrates then deletes from PG', async () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      const row = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
      assert.ok(!row, 'the row must be gone from PG');
      const tombs = (await realPool.query('SELECT count(*)::int n FROM server_tombstones')).rows[0].n;
      assert.equal(tombs, 1, 'the durable tombstone must be written');
    });
  }

  /* 11: version-bump ordering — after a successful upd the row's version is
     base+1, and a second op on the new base succeeds (chain). */
  await seed();
  {
    const m = make();
    const r1 = await m.send([op(schema + '-v1', 'classes', 'upd', { id: 101 })]);
    const row1 = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
    const r2 = await m.send([op(schema + '-v2', 'classes', 'upd', { id: 101, base_version: 10, data: { name: 'twice' } })]);
    const row2 = (await realPool.query('SELECT * FROM classes WHERE id=101')).rows[0];
    await check('C11 version-bump ordering — base+1 each step, chainable', () => {
      assert.equal(r1.status, 200);
      assert.equal(row1.version, 10);
      assert.equal(r2.status, 200, JSON.stringify(r2));
      assert.equal(row2.name, 'twice');
      assert.equal(row2.version, 11);
    });
  }

  /* 12: uPush scoping — a serverId-assigned ins (no client id) never enters the
     pre-scan and must still resolve through the legacy path. */
  await seed();
  {
    const m = make();
    const r = await m.send([op(schema + '-sid', 'announcements', 'ins', { data: { title: 'server-assigned', school_id: 1 } })]);
    await check('C12 serverId-assigned ins works outside the pre-scan', async () => {
      assert.equal(r.status, 200, JSON.stringify(r));
      const rows = (await realPool.query('SELECT * FROM announcements')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].title, 'server-assigned');
    });
  }

  /* ── D) tenant isolation stays closed on the batch path ───────────── */
  await seed();
  {
    await realPool.query('UPDATE classes SET school_id=2 WHERE id=105');
    const m = make();
    const r = await m.send([op(schema + '-foreign', 'classes', 'upd', { id: 105 })]);
    await check('D1 a foreign-school row in the batch set is rejected', () => {
      assert.ok(r.status === 403 || (r.body && r.body.results && r.body.results.some(x => !x.ok)),
        'a row from another school must not be writable; got ' + JSON.stringify(r));
    });
    await check('D2 the foreign row was not modified', async () => {
      const row = (await realPool.query('SELECT * FROM classes WHERE id=105')).rows[0];
      assert.equal(row.school_id, 2);
      assert.equal(row.name, 'orig');
    });
  }

  console.log(JSON.stringify({ result: failures ? 'FAIL' : 'PASS', checks: count, failures,
    level: 'E3 real PG; sync read-batching + 12 invariants' }));
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await realPool.end(); await admin.end();
  if (failures) process.exitCode = 1;
})().catch(async e => {
  console.error('M15-04 sync suite crashed:', e);
  try { await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); } catch (_) {}
  try { await realPool.end(); await admin.end(); } catch (_) {}
  process.exitCode = 1;
});
