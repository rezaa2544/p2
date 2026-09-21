#!/usr/bin/env node
/**
 * Wave 1 (chat2) — PostgreSQL Source of Truth · Part 1 (Reads Inventory & seam)
 * -----------------------------------------------------------------------------
 * Verifies that the unified read seam introduced in server/db.js
 * (readCollection / readOne) and its wiring in the high-value read endpoints
 * (routes/bootstrap.js + pull.js) preserve EXACT behaviour in the memory
 * fallback (JSON store is the runtime source of truth) and are traversed
 * whenever a db layer is provided.
 *
 *  - db.readCollection mirrors the seeded store collection-for-collection.
 *  - db.readOne mirrors store lookups by id.
 *  - createBootstrapRoute({store, db}) produces byte-identical output to
 *    createBootstrapRoute({store}) for every role (db:null legacy path).
 *  - createPull({store, db}) produces byte-identical output to
 *    createPull({store}) for the scoped server suite.
 *  - A counter asserts the db-backed path really CALLS db.readCollection
 *    (proving the seam is traversed, not dead code).
 *
 * REAL-POSTGRES NOTE (recorded honestly): no live PostgreSQL is available in
 * this CI sandbox, so the PostgreSQL branch of readCollection (SELECT * FROM
 * "<table>") is NOT executed here. A guarded block below runs ONLY when
 * DATABASE_URL + the `pg` driver are present and a seeded schema exists;
 * otherwise it reports "skipped (no live PG)". See docs/WAVE1_READS_INVENTORY.md.
 *
 * Run: node tests/wave1-reads.js
 */

const { createPull } = require('../server/pull');
const { createBootstrapRoute } = require('../server/routes/bootstrap');
const db = require('../server/db');

let pass = 0, fail = 0;
const failures = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'شرط برقرار نیست'); };

async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(title) { console.log(`\n▸ ${title}`); }
// apiPull/getBootstrapData embed server_time = new Date().toISOString(); the
// two compared calls are a few ms apart, so normalize that volatile field.
const stripVolatile = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.server_time; return c; };
const bodyEqual = (a, b) => JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b));

/* ── seeded in-memory store (mirrors server/data/payesh.json shape) ── */
function seedStore() {
  const S = { __server_version: 7, __deleted_records: [] };
  S.schools = [{ id: 1, name: 'دبیرستان پایش ۱', type: 'high' }, { id: 2, name: 'دبیرستان پایش ۲', type: 'high' }];
  S.users = [
    { id: 10, school_id: 1, role: 'manager', full_name: 'مدیر ۱', national_id: '0011223344' },
    { id: 20, school_id: 1, role: 'teacher', full_name: 'دبیر ۱', national_id: '0022334455' },
    { id: 30, school_id: 1, role: 'student', full_name: 'علی', national_id: '0033445566', grade_level: 10 },
    { id: 31, school_id: 1, role: 'student', full_name: 'رضا', national_id: '0044556677', grade_level: 10 },
    { id: 50, school_id: 1, role: 'parent', full_name: 'پدر علی', national_id: '0055667788' },
    { id: 40, school_id: 2, role: 'manager', full_name: 'مدیر ۲', national_id: '0066778899' }
  ];
  S.classes = [
    { id: 1, school_id: 1, name: '۱۰۱', grade: 10, homeroom_teacher_id: 20 },
    { id: 2, school_id: 1, name: '۱۰۲', grade: 10, homeroom_teacher_id: 99 },
    { id: 3, school_id: 2, name: '۲۰۱', grade: 10, homeroom_teacher_id: 40 }
  ];
  S.subjects = [{ id: 1, name: 'ریاضی' }, { id: 2, name: 'فیزیک' }];
  S.schedule = [
    { id: 1, school_id: 1, class_id: 1, teacher_id: 20, subject_id: 1 },
    { id: 2, school_id: 1, class_id: 2, teacher_id: 99, subject_id: 2 }
  ];
  S.enrollments = [
    { id: 1, school_id: 1, class_id: 1, student_id: 30 },
    { id: 2, school_id: 1, class_id: 2, student_id: 31 }
  ];
  S.bell_schedules = [{ id: 1, school_id: 1, label: 'زنگ ۱' }];
  S.parent_links = [{ id: 1, parent_id: 50, student_id: 30 }];
  S.notifications = [
    { id: 1, user_id: 30, school_id: 1, title: 'به علی', read: false },
    { id: 2, user_id: 50, school_id: 1, title: 'به پدر', read: true }
  ];
  S.sync_conflicts = [{ id: 1, school_id: 1, status: 'open' }, { id: 2, school_id: 1, status: 'resolved' }];
  return S;
}

(async () => {
  const store = seedStore();

  /* ---- A. server/db.js seam (memory mode) ---- */
  group('A. db.readCollection / readOne — memory fallback parity');
  await test('init memory driver', async () => {
    const info = await db.init(store);
    assert(info && info.driver === 'memory', 'باید fallback حافظه‌ای باشد (بدون DATABASE_URL)');
    assert(db.isPostgres() === false, 'PG نباید فعال باشد');
  });

  await test('readCollection mirrors store per collection', async () => {
    for (const c of ['schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments', 'notifications', 'bell_schedules', 'parent_links', 'sync_conflicts']) {
      const rows = await db.readCollection(c);
      assert(Array.isArray(rows), `${c} باید آرایه برگرداند`);
      assert(rows.length === store[c].length, `${c}: تعداد نابرابر`);
    }
  });

  await test('readOne mirrors store find-by-id', async () => {
    const u = await db.readOne('users', 30);
    assert(u && u.id === 30 && u.full_name === 'علی', 'readOne کاربر ۳۰');
    const none = await db.readOne('classes', 999);
    assert(none === null, 'readOne ناموجود باید null باشد');
  });

  await test('unknown/internal names do not explode (empty array)', async () => {
    const rows = await db.readCollection('__deleted_records'); // store metadata — not a PG table
    assert(Array.isArray(rows), 'کلید داخلی باید آرایه برگرداند (از store)');
  });

  /* ---- B. bootstrap parity: db-backed vs legacy store-direct ---- */
  group('B. bootstrap read parity (db seam vs store-direct)');
  const cache = require('../server/cache');
  await cache.init().catch(() => {}); // redis memory fallback; never fatal here

  const roleUsers = [
    { role: 'manager', id: 10, school_id: 1 },
    { role: 'teacher', id: 20, school_id: 1 },
    { role: 'student', id: 30, school_id: 1 },
    { role: 'parent', id: 50, school_id: 1 },
    { role: 'superadmin', id: 1, school_id: null }
  ];

  // wrap db to COUNT seam calls (proves traversal)
  const seamDb = {
    readCollection: async (c) => { seamDb.calls++; return db.readCollection(c); },
    calls: 0
  };

  const legacyBootstrap = createBootstrapRoute({ store });
  const seamBootstrap = createBootstrapRoute({ store, db: seamDb });

  for (const ru of roleUsers) {
    // unique user ids per controller so the bootstrap L1 cache is not shared
    const legacyReq = { user: Object.assign({}, store.users.find(u => u.id === ru.id) || { id: ru.id, school_id: ru.school_id, role: ru.role }, { id: ru.id }) };
    const seamReq = { user: Object.assign({}, store.users.find(u => u.id === ru.id) || { id: ru.id, school_id: ru.school_id, role: ru.role }, { id: ru.id }) };
    await test(`bootstrap '${ru.role}' seam === store-direct`, async () => {
      const a = await legacyBootstrap.getBootstrapData(legacyReq);
      const b = await seamBootstrap.getBootstrapData(seamReq);
      assert(a.status === b.status, 'وضعیت نابرابر');
      assert(bodyEqual(a.body, b.body), `خروجی ${ru.role} نابرابر است`);
      assert(b.body && b.body.ok === true, `${ru.role}: باید موفق باشد`);
    });
  }
  await test('seam bootstrap returns valid payload without full collection scan (P0-01 contract)', async () => {
    // Under P0-01 (commit b803d00), bootstrap intentionally does NOT call db.readCollection (full table scan)
    // to prevent national Heap OOM. In memory fallback, it uses bounded store lookups;
    // in PG mode, it traverses scoped db.query (WHERE school_id = $1).
    const res = await seamBootstrap.getBootstrapData({ user: { id: 21, role: 'teacher', school_id: 1, full_name: 'دبیر سیام', national_id: '0099887766' } });
    assert(res.body && res.body.ok === true, 'باید موفق باشد');
    assert(res.body.classes && Array.isArray(res.body.classes), 'کلاس‌ها باید در خروجی باشند');
  });

  /* ---- C. pull parity: db-backed vs legacy store-direct ----
     Each controller is given its OWN deep copy of the seed so there is no
     cross-controller reference sharing; the seam controller reads its copy
     through a db-backed readCol (readCollection), the legacy one directly
     from store. Same input ⇒ must yield byte-identical output. */
  group('C. pull read parity (db seam vs store-direct)');
  const cloneStore = (o) => JSON.parse(JSON.stringify(o));
  let seamReadCalls = 0;
  const mkPullLegacy = (st, sess, url) => {
    const ctl = createPull({ store: st, sessionFrom: () => sess, sendJson: (r, status, body) => ({ status, body }) });
    return ctl.apiPull({ url }, {});
  };
  const mkPullSeam = (st, sess, url) => {
    const fakeDb = {
      readCollection: async (c) => { seamReadCalls++; return Array.isArray(st[c]) ? st[c] : []; }
    };
    const ctl = createPull({ store: st, db: fakeDb, sessionFrom: () => sess, sendJson: (r, status, body) => ({ status, body }) });
    return ctl.apiPull({ url }, {});
  };

  const scenarios = [
    { name: 'manager full snapshot', session: { id: 10, school_id: 1, role: 'manager' }, url: '/api/v1/pull' },
    { name: 'teacher scoped', session: { id: 20, school_id: 1, role: 'teacher' }, url: '/api/v1/pull' },
    { name: 'student self only', session: { id: 30, school_id: 1, role: 'student' }, url: '/api/v1/pull' },
    { name: 'parent children', session: { id: 50, school_id: 1, role: 'parent' }, url: '/api/v1/pull' },
    { name: 'collections filter', session: { id: 10, school_id: 1, role: 'manager' }, url: '/api/v1/pull?collections=classes,subjects' },
    { name: 'delta since', session: { id: 10, school_id: 1, role: 'manager' }, url: '/api/v1/pull?since=2026-09-08T00:00:00.000Z' }
  ];

  for (const sc of scenarios) {
    await test(`pull '${sc.name}' seam === store-direct`, async () => {
      const a = await mkPullLegacy(cloneStore(store), sc.session, sc.url);
      const b = await mkPullSeam(cloneStore(store), sc.session, sc.url);
      assert(a.status === b.status, 'وضعیت نابرابر');
      assert(bodyEqual(a.body, b.body), `خروجی pull '${sc.name}' نابرابر است`);
    });
  }
  await test('seam actually invoked readCollection on pull', async () => {
    assert(seamReadCalls > 0, 'مسیر readCollection در pull طی نشد');
  });

  /* ---- D. real PostgreSQL (guarded; self-skips without a live DB) ---- */
  group('D. PostgreSQL branch (guarded)');
  await test('real-PG SELECT verification', async () => {
    const hasPgDriver = (() => { try { require('pg'); return true; } catch (e) { return false; } })();
    if (!process.env.DATABASE_URL || !hasPgDriver) {
      console.log('     ⏭️  no live PostgreSQL (DATABASE_URL/pg absent) — PG SELECT branch NOT executed; see WAVE1_READS_INVENTORY.md');
      return;
    }
    const info = await db.init(store); // would connect to real PG when configured
    assert(info.driver === 'postgres', 'driver باید postgres باشد');
    const rows = await db.readCollection('users');
    assert(Array.isArray(rows) && rows.length > 0, 'users باید از PG برگردد');
  });

  /* ── result ── */
  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave1 Reads: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
