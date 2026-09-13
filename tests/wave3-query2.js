#!/usr/bin/env node
/**
 * Wave 3 part 2 (chat2) — DB-native GET-lists for grades / classes / users
 * ---------------------------------------------------------------------------
 * Extends the pattern from tests/wave3-query.js (part 1, students/attendance):
 *
 *  A. SQL builders (buildGradesList / buildClassesList / buildUsersList)
 *     - structure + allowlisted tables/joins + bound params
 *     - keyset cursor + LIMIT limit+1 + COUNT twin
 *     - SQL-injection safety (search / national_id only ever bound ILIKE params)
 *     - role-scope via EXISTS (teacher/student/parent for grades)
 *  B. executePagedList shaper on a fake db — pagination metadata + enrichment
 *     columns (subject_name/student_name / student_count/homeroom_teacher_name)
 *  C. Route memory-path parity — grades/classes/users lists behave via the
 *     (unchanged) JS pipeline when PostgreSQL is NOT active.
 *  D. Real-PG execution (guarded) — self-skips without a live DB.
 *
 * ⚠️ Real PostgreSQL branch is NOT executed here (no live DB/driver/schema).
 * See docs/WAVE3_QUERY_PERFORMANCE.md.
 *
 * Run: node tests/wave3-query2.js
 */
const {
  buildGradesList, buildClassesList, buildUsersList, executePagedList
} = require('../server/dbquery');
const { createGradeRoutes } = require('../server/routes/grades');
const { createClassRoutes } = require('../server/routes/classes');
const { createUserRoutes } = require('../server/routes/users');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }

const mgr = { id: 10, school_id: 1, role: 'manager' };
const teacher = { id: 20, school_id: 1, role: 'teacher' };
const student = { id: 30, school_id: 1, role: 'student' };
const parent = { id: 50, school_id: 1, role: 'parent' };
const superadmin = { id: 1, role: 'superadmin' };

function fakeDb(rows, count) {
  return {
    async query(sql, params) {
      if (/^SELECT COUNT/i.test(sql.trim())) return { rows: [{ n: count }] };
      return { rows: rows.map(r => Object.assign({}, r)) };
    }
  };
}

(async () => {
  group('A. DB-native SQL builders (grades/classes/users)');

  await test('grades: scope + filters bound, ORDER BY id DESC, enrich via LEFT JOINs', async () => {
    const b = buildGradesList({ user: mgr, studentId: '30', subjectId: '5', classId: null, limit: 20, cursor: null });
    assert(/FROM "grades" g/.test(b.page.sql), 'FROM grades g');
    assert(/g\.school_id = \$\d+/.test(b.page.sql), 'school scope bound');
    assert(/g\.student_id = \$\d+/.test(b.page.sql), 'student filter bound');
    assert(/g\.subject_id = \$\d+/.test(b.page.sql), 'subject filter bound');
    assert(/LEFT JOIN "subjects" sb ON sb\.id = g\.subject_id/.test(b.page.sql), 'subjects LEFT JOIN');
    assert(/LEFT JOIN "users" st ON st\.id = g\.student_id/.test(b.page.sql), 'users LEFT JOIN (student name)');
    assert(/subject_name/.test(b.page.sql) && /student_name/.test(b.page.sql), 'enrichment aliases');
    assert(/ORDER BY g\.id DESC/.test(b.page.sql), 'ORDER BY id DESC');
    const lim = Number(b.page.params[b.page.params.length - 1]);
    assert(lim === 21, `LIMIT 21, got ${lim}`);
    assert(/^SELECT COUNT\(\*\)::int AS n FROM "grades" g/.test(b.count.sql.trim()), 'count over base table only (no joins)');
  });

  await test('grades: student/parent/teacher role scope via bound EXISTS', async () => {
    const bs = buildGradesList({ user: student, studentId: null, subjectId: null, classId: null, limit: 50, cursor: null });
    assert(/g\.student_id = \$\d+/.test(bs.page.sql), 'student self');
    const bp = buildGradesList({ user: parent, studentId: null, subjectId: null, classId: null, limit: 50, cursor: null });
    assert(bp.page.sql.includes('"parent_links"'), 'parent EXISTS parent_links');
    const bt = buildGradesList({ user: teacher, studentId: null, subjectId: null, classId: null, limit: 50, cursor: null });
    assert(bt.page.sql.includes('"schedule"') && /g\.teacher_id = \$\d+/.test(bt.page.sql), 'teacher scope');
  });

  await test('grades: superadmin has no school predicate', async () => {
    const b = buildGradesList({ user: superadmin, studentId: null, subjectId: null, classId: null, limit: 50, cursor: null });
    assert(!/school_id = \$\d+/.test(b.page.sql), 'no school bound for superadmin');
  });

  await test('grades: keyset cursor bound (DESC ⇒ id < cursor) + LIMIT+1', async () => {
    const b = buildGradesList({ user: mgr, studentId: null, subjectId: null, classId: null, limit: 25, cursor: 7 });
    assert(/g\.id < \$\d+/.test(b.page.sql), 'DESC keyset cursor predicate (id <)');
    assert(!/g\.id > \$\d+/.test(b.page.sql), 'no inverted cursor (id >) over DESC');
    assert(b.page.params.some(p => p === 7), 'cursor=7 bound');
  });

  await test('classes: scope + grade bound, ORDER BY id ASC, enrichment joins', async () => {
    const b = buildClassesList({ user: mgr, grade: '10', limit: 50, cursor: null });
    assert(/FROM "classes" c/.test(b.page.sql), 'FROM classes');
    assert(/c\.school_id = \$\d+/.test(b.page.sql), 'school scope bound');
    assert(/c\.grade = \$\d+/.test(b.page.sql), 'grade bound');
    assert(/LEFT JOIN "users" tu ON tu\.id = c\.homeroom_teacher_id/.test(b.page.sql), 'teacher name join');
    assert(/student_count/.test(b.page.sql) && /homeroom_teacher_name/.test(b.page.sql), 'enrichment aliases');
    assert(/FROM "enrollments" e WHERE e\.class_id = c\.id/.test(b.page.sql), 'student_count subquery');
    assert(/ORDER BY c\.id ASC/.test(b.page.sql), 'ORDER BY id ASC');
    assert(/^SELECT COUNT\(\*\)::int AS n FROM "classes" c/.test(b.count.sql.trim()), 'count over classes only');
  });

  await test('classes: superadmin unscoped', async () => {
    const b = buildClassesList({ user: superadmin, grade: null, limit: 50, cursor: null });
    assert(!/school_id = \$\d+/.test(b.page.sql), 'unscoped for superadmin');
  });

  await test('users: scope/role bound + search ILIKE over name/nid/phone (injection-safe)', async () => {
    const b = buildUsersList({ user: mgr, role: 'teacher', search: "x' OR 1=1 --", limit: 50, cursor: null });
    assert(/u\.school_id = \$\d+/.test(b.page.sql), 'school scope bound');
    assert(/u\.role = \$\d+/.test(b.page.sql), 'role bound');
    assert(/CAST\(u\.full_name AS TEXT\) ILIKE \$\d+/.test(b.page.sql), 'full_name ILIKE');
    assert(/CAST\(u\.national_id AS TEXT\) ILIKE \$\d+/.test(b.page.sql), 'national_id ILIKE');
    assert(/CAST\(u\.phone AS TEXT\) ILIKE \$\d+/.test(b.page.sql), 'phone ILIKE');
    assert(!b.page.sql.includes("1=1"), 'raw injection must not appear in sql');
    assert(b.page.params.includes('%' + "x' OR 1=1 --" + '%'), 'search value only bound');
  });

  await test('users: national_id search is a bound param, never inlined', async () => {
    const b = buildUsersList({ user: superadmin, role: null, search: '0012345678', limit: 50, cursor: null });
    assert(b.page.sql.includes('national_id AS TEXT) ILIKE'), 'ILIKE used');
    assert(!b.page.sql.includes('0012345678'), 'nid not literally in SQL');
    assert(b.page.params.includes('%0012345678%'), 'nid bound as param');
  });

  group('B. executePagedList pagination + enrichment (fake db)');
  await test('grades page sliced at limit, has_more via LIMIT+1, enrichment passthrough', async () => {
    const rows = [1, 2, 3, 4, 5, 6].map(id => ({ id, subject_id: 1, student_id: 30, subject_name: 'ریاضی', student_name: 'علی' }));
    const built = buildGradesList({ user: mgr, studentId: null, subjectId: null, classId: null, limit: 5, cursor: null });
    const r = await executePagedList(fakeDb(rows, 6), built, { limit: 5, cursor: null });
    assert(r.data.length === 5, 'data sliced to 5');
    assert(r.pagination.has_more === true, 'has_more');
    assert(r.pagination.next_cursor === '5', 'next_cursor=5');
    assert(r.pagination.total === 6, 'total=6');
    assert(r.data[0].subject_name === 'ریاضی', 'enrichment column present');
  });

  group('C. Route memory-path parity (PostgreSQL not active)');
  const memDb = { isPostgres: () => false };
  const seed = () => ({
    schools: [{ id: 1 }],
    users: [
      { id: 10, school_id: 1, role: 'manager', full_name: 'مدیر' },
      { id: 20, school_id: 1, role: 'teacher', full_name: 'دبیر' },
      { id: 30, school_id: 1, role: 'student', full_name: 'علی', grade_level: 10 },
      { id: 40, school_id: 2, role: 'manager', full_name: 'مدیر ۲' }
    ],
    classes: [{ id: 1, school_id: 1, grade: 10, homeroom_teacher_id: 20 }],
    enrollments: [{ id: 1, school_id: 1, class_id: 1, student_id: 30 }],
    schedule: [{ id: 1, school_id: 1, class_id: 1, subject_id: 1, teacher_id: 20 }],
    subjects: [{ id: 1, name: 'ریاضی' }],
    grades: [
      { id: 101, school_id: 1, student_id: 30, subject_id: 1, class_id: 1, teacher_id: 20, score: 20 },
      { id: 102, school_id: 2, student_id: 999, subject_id: 1, class_id: 2, teacher_id: 99, score: 18 }
    ],
    parent_links: []
  });

  await test('grades list (memory) returns only in-scope rows + enrichment', async () => {
    const s = seed();
    const r = await createGradeRoutes({ store: s, db: memDb, ids: {}, deleter: {}, audit: () => {}, markDirty: () => {} })
      .getGradesList({ user: s.users[0] }, new URLSearchParams());
    assert(r.ok === true, 'ok');
    assert(r.data.length === 1, 'only school-1 grade');
    assert(r.data[0].subject_name === 'ریاضی', 'memory enrichment subject_name');
    assert(r.pagination.total === 1, 'memory total');
  });

  await test('classes list (memory) enrichment student_count + teacher name', async () => {
    const s = seed();
    const r = await createClassRoutes({ store: s, db: memDb, ids: {}, deleter: {}, audit: () => {}, markDirty: () => {} })
      .getClassesList({ user: s.users[0] }, new URLSearchParams('?grade=10'));
    assert(r.ok === true && r.data.length === 1, 'one grade-10 class in scope');
    assert(r.data[0].student_count === 1, 'student_count enriched');
    assert(r.data[0].homeroom_teacher_name === 'دبیر', 'teacher name enriched');
  });

  await test('users list (memory) scope + role filter + projection', async () => {
    const s = seed();
    const r = await createUserRoutes({ store: s, db: memDb, ids: {}, deleter: {}, audit: () => {}, markDirty: () => {} })
      .getUsersList({ user: s.users[0] }, new URLSearchParams('?role=manager'));
    assert(r.ok === true, 'ok');
    assert(r.data.length === 1 && r.data[0].id === 10, 'only in-scope manager (school 1)');
    assert(!('password' in r.data[0]), 'projected (no raw leak)');
  });

  group('D. PostgreSQL execution (guarded)');
  await test('real-PG run', async () => {
    let pg = null;
    try { pg = require('pg'); } catch (e) { pg = null; }
    if (!process.env.DATABASE_URL || !pg) {
      console.log('     ⏭️  no live PostgreSQL — DB-native SQL NOT executed; see WAVE3_QUERY_PERFORMANCE.md');
      return;
    }
    const db = require('../server/db');
    const info = await db.init(seed());
    assert(info.driver === 'postgres', 'driver postgres');
    const b = buildGradesList({ user: mgr, studentId: null, subjectId: null, classId: null, limit: 5, cursor: null });
    const r = await executePagedList(db, b, { limit: 5, cursor: null });
    assert(Array.isArray(r.data), 'pg returned rows');
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave3 Query part2: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
