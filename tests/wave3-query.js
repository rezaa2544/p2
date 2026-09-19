#!/usr/bin/env node
/**
 * Wave 3 (chat2) — Query & Performance · students / attendance
 * ---------------------------------------------------------------------------
 * Verifies the DB-native paged-query layer without needing a live PostgreSQL:
 *
 *  A. SQL builders (buildStudentsList / buildAttendanceList)
 *     - structure: SELECT..FROM..WHERE..ORDER BY..LIMIT $N (limit+1)
 *     - COUNT twin for a stable `total`
 *     - keyset cursor appears as a bound param (id > $), never inlined
 *     - user-controlled values (classId/grade/date/search/studentId) are only
 *       ever bound params — SQL-injection attempt must NOT appear in sql text
 *     - identifiers come from the internal allowlist
 *  B. executePagedList shaper (fake db) — pagination metadata parity with
 *     middleware/pagination.js: {data, pagination{limit,has_more,next_cursor,
 *     prev_cursor,count,total}} and has_more via LIMIT+1.
 *  C. Route memory path parity — students/attendance GET-lists still behave via
 *     the (unchanged) JS pipeline when PostgreSQL is NOT active.
 *  D. Real-PG execution (guarded) — self-skips when no live DB.
 *
 * ⚠️ Real PostgreSQL branch is NOT executed in this sandbox (no live DB /
 * driver / seeded schema). See docs/WAVE3_QUERY_PERFORMANCE.md.
 *
 * Run: node tests/wave3-query.js
 */
const { buildStudentsList, buildAttendanceList, executePagedList } = require('../server/dbquery');
const { createStudentRoutes } = require('../server/routes/students');
const { createAttendanceRoutes } = require('../server/routes/attendance');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }

/* tiny fake db with programmable rows/count */
function fakeDb(rows, count) {
  return {
    async query(sql, params) {
      if (/^SELECT COUNT/i.test(sql.trim())) return { rows: [{ n: count }] };
      return { rows: rows.map(r => Object.assign({}, r)) };
    }
  };
}

const manager = { id: 10, school_id: 1, role: 'manager' };
const teacher = { id: 20, school_id: 1, role: 'teacher' };
const superadmin = { id: 1, role: 'superadmin' };

(async () => {
  /* ── A. SQL builders ── */
  group('A. DB-native SQL builders');
  await test('students: correct structure + bound school scope + ORDER BY id', async () => {
    const b = buildStudentsList({ user: manager, classId: null, grade: '10', search: null, limit: 50, cursor: null });
    assert(/SELECT \* FROM "users" u/.test(b.page.sql), 'FROM users');
    assert(b.page.sql.includes("u.role = 'student'"), 'role filter');
    assert(/u\.school_id = \$\d+/.test(b.page.sql), 'school scope is a bound param');
    assert(/ORDER BY u\.id ASC/.test(b.page.sql), 'ORDER BY id ASC');
    assert(/LIMIT \$\d+$/.test(b.page.sql.trim()), 'LIMIT present at end');
    const lim = Number(b.page.params[b.page.params.length - 1]);
    assert(lim === 51, `LIMIT must be limit+1 (51), got ${lim}`);
    assert(/SELECT COUNT\(\*\)::int AS n/.test(b.count.sql), 'COUNT twin present');
  });

  await test('students: search value is only a bound ILIKE param (injection-safe)', async () => {
    const bad = "x' OR 1=1 --";
    const b = buildStudentsList({ user: manager, classId: null, grade: null, search: bad, limit: 50, cursor: null });
    assert(!b.page.sql.includes(bad), 'raw search must NOT appear in sql');
    assert(b.page.sql.includes('ILIKE'), 'uses ILIKE');
    assert(b.page.params.includes('%' + bad + '%'), 'search wrapped and bound');
  });

  await test('students: teacher scope uses only allowlisted tables via EXISTS', async () => {
    const b = buildStudentsList({ user: teacher, classId: '5', grade: null, search: null, limit: 20, cursor: null });
    assert(b.page.sql.includes('"enrollments"') && b.page.sql.includes('"classes"') && b.page.sql.includes('"schedule"'), 'teacher join tables allowlisted');
    const forTables = /FROM\s+"([a-z_]+)"/.exec(b.page.sql);
    assert(forTables && ['users', 'enrollments', 'classes', 'schedule'].includes(forTables[1]), 'FROM target allowlisted');
    assert(b.page.params.includes(5), 'class_id bound');
    assert(b.page.params.includes(20), 'teacher id bound');
  });

  await test('students: superadmin has no school_id predicate', async () => {
    const b = buildStudentsList({ user: superadmin, classId: null, grade: null, search: null, limit: 50, cursor: null });
    assert(!b.page.sql.includes('school_id ='), 'superadmin unbound by school');
  });

  await test('students: keyset cursor is a bound predicate', async () => {
    const b = buildStudentsList({ user: manager, classId: null, grade: null, search: null, limit: 50, cursor: 7 });
    assert(/u\.id > \$\d+/.test(b.page.sql), 'cursor predicate bound');
    assert(b.page.params.some(p => p === 7), 'cursor=7 in params');
  });

  await test('attendance: structure, filters bound, ordering date DESC,id ASC', async () => {
    const b = buildAttendanceList({ user: manager, date: '2026-09-08', classId: '3', studentId: null, limit: 25, cursor: null });
    assert(/FROM "attendance"/.test(b.page.sql), 'FROM attendance');
    assert(/ORDER BY date DESC, id ASC/.test(b.page.sql), 'ordering');
    assert(b.page.params.includes('2026-09-08'), 'date bound');
    assert(b.page.params.includes(3), 'class_id bound');
    const lim = Number(b.page.params[b.page.params.length - 1]);
    assert(lim === 26, `LIMIT 26, got ${lim}`);
  });

  await test('attendance: parent scope via allowlisted parent_links EXISTS', async () => {
    const b = buildAttendanceList({ user: { id: 50, school_id: 1, role: 'parent' }, date: null, classId: null, studentId: null, limit: 50, cursor: null });
    assert(b.page.sql.includes('"parent_links"'), 'parent_links EXISTS');
    assert(b.page.params.includes(50), 'parent id bound');
  });

  /* ── B. executePagedList shaper (fake db) ── */
  group('B. executePagedList pagination shape (fake db)');
  await test('page not full → has_more=false, total from COUNT', async () => {
    const rows = [1, 2, 3, 4].map(id => ({ id }));
    const built = buildStudentsList({ user: manager, classId: null, grade: null, search: null, limit: 5, cursor: null });
    const r = await executePagedList(fakeDb(rows, 4), built, { limit: 5, cursor: null });
    assert(r.data.length === 4, 'data length');
    assert(r.pagination.has_more === false, 'no more pages');
    assert(r.pagination.total === 4, 'total from COUNT');
    assert(r.pagination.count === 4, 'count');
    assert(r.pagination.next_cursor === null, 'next_cursor null when no more');
    assert(r.pagination.prev_cursor === null, 'prev_cursor null without cursor');
  });

  await test('page full via LIMIT+1 → has_more=true and data sliced', async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(id => ({ id })); // 6 returned for limit 5 ⇒ 1 extra
    const built = buildStudentsList({ user: manager, classId: null, grade: null, search: null, limit: 5, cursor: null });
    const r = await executePagedList(fakeDb(rows, 6), built, { limit: 5, cursor: null });
    assert(r.data.length === 5, 'data sliced to limit');
    assert(r.pagination.has_more === true, 'has_more true');
    assert(r.pagination.next_cursor === '5', `next_cursor = last id (5), got ${r.pagination.next_cursor}`);
    assert(r.pagination.count === 5, 'count = page size');
    assert(r.pagination.total === 6, 'total = 6');
  });

  await test('executePagedList honors a keyset cursor (id > cursor)', async () => {
    const rows = [8, 9].map(id => ({ id }));
    let sawCursor = false;
    const spy = {
      async query(sql, params) {
        if (/^SELECT COUNT/i.test(sql)) return { rows: [{ n: 10 }] };
        if (params.includes(7)) sawCursor = true;
        return { rows };
      }
    };
    const built = buildStudentsList({ user: manager, classId: null, grade: null, search: null, limit: 5, cursor: 7 });
    await executePagedList(spy, built, { limit: 5, cursor: 7 });
    assert(sawCursor, 'cursor passed to db');
  });

  /* ── C. Route memory-path parity (PG NOT active) ── */
  group('C. Route memory path (PostgreSQL not active)');
  const memDb = { isPostgres: () => false };
  const seed = () => ({
    schools: [{ id: 1 }],
    users: [
      { id: 10, school_id: 1, role: 'manager', full_name: 'مدیر' },
      { id: 20, school_id: 1, role: 'teacher', full_name: 'دبیر' },
      { id: 30, school_id: 1, role: 'student', full_name: 'علی', grade_level: 10, national_id: '0033445566' },
      { id: 31, school_id: 1, role: 'student', full_name: 'رضا', grade_level: 10, national_id: '0044556677' }
    ],
    classes: [{ id: 1, school_id: 1, homeroom_teacher_id: 20 }],
    enrollments: [
      { id: 1, school_id: 1, class_id: 1, student_id: 30 },
      { id: 2, school_id: 1, class_id: 1, student_id: 31 }
    ],
    schedule: [{ id: 1, school_id: 1, class_id: 1, teacher_id: 20 }],
    attendance: [
      { id: 1, school_id: 1, class_id: 1, student_id: 30, date: '2026-09-08', status: 'present' },
      { id: 2, school_id: 1, class_id: 1, student_id: 31, date: '2026-09-08', status: 'absent' }
    ],
    parent_links: []
  });

  await test('students list (memory) returns expected projected rows', async () => {
    const s = seed();
    const routes = createStudentRoutes({ store: s, db: memDb, ids: {}, deleter: {}, audit: () => {}, markDirty: () => {} });
    const r = await routes.getStudentsList({ user: s.users[0] }, new URLSearchParams('?grade=10'));
    assert(r.ok === true, 'ok');
    assert(Array.isArray(r.data), 'data array');
    assert(r.data.length === 2, 'two grade-10 students');
    assert('national_id_masked' in r.data[0] || !('password' in r.data[0]), 'projected (no raw leak)');
    assert(r.pagination && typeof r.pagination.limit === 'number', 'pagination shape');
  });

  await test('attendance list (memory) returns rows + pagination', async () => {
    const s = seed();
    const routes = createAttendanceRoutes({ store: s, db: memDb, ids: {}, deleter: {}, audit: () => {}, markDirty: () => {} });
    const r = await routes.getAttendanceList({ user: s.users[0] }, new URLSearchParams('?date=2026-09-08'));
    assert(r.ok === true && r.data.length === 2, 'two attendance rows for that date');
    assert(r.pagination.total === 2, 'memory total');
  });

  /* ── D. Real PostgreSQL (guarded; self-skips) ── */
  group('D. PostgreSQL execution (guarded)');
  await test('real-PG run', async () => {
    let pg = null;
    try { pg = require('pg'); } catch (e) { pg = null; }
    if (!process.env.DATABASE_URL || !pg) {
      /* P1-GAP-01 (Chat 2 remediation): self-skip ممنوع — بدون PostgreSQL واقعی
         این سنجه FAIL است، نه SKIP؛ سبزِ کاذب دیگر ممکن نیست. */
      throw new Error('FAIL — PostgreSQL در دسترس نیست (DATABASE_URL خالی یا درایور pg نیست)؛ skip ممنوع (P1-GAP-01)');
    }
    const db = require('../server/db');
    const info = await db.init(seed());
    assert(info.driver === 'postgres', 'driver postgres');
    const built = buildStudentsList({ user: manager, classId: null, grade: '10', search: null, limit: 5, cursor: null });
    const r = await executePagedList(db, built, { limit: 5, cursor: null });
    assert(Array.isArray(r.data), 'pg returned rows');
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave3 Query: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
