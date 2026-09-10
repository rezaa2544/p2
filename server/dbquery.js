/* ═══════════════════════════════════════════════════════════════════
   server/dbquery.js — DB-native paged-query builders (Wave 3, chat2)
   -------------------------------------------------------------------
   Pure builders that turn a high-traffic LIST endpoint's declared filters,
   role-scope and ordering into *parameterized* PostgreSQL statements that
   push predicate + sort + keyset pagination down to the DB instead of
   "load all → filter → sort → slice" in JavaScript.

   Security invariants enforced HERE (so callers can't break them):
   - Every user-controlled value goes into `params`; identifiers are only
     ever taken from an internal allowlist — never interpolated from input.
   - Cursor + LIMIT+1 detect `has_more` without OFFSET (no degradation).
   - Role scope is expressed as SQL (school_id bound + EXISTS subqueries for
     teacher/student/parent), so the DB enforces tenant boundaries.

   ⚠️ HONEST VERIFICATION NOTE (recorded): these builders are unit-tested for
   SQL structure / parameter binding / identifier allowlist, and the routes
   are wired to run them ONLY when PostgreSQL is live (db.isPostgres()). They
   were NOT executed against a real PostgreSQL in this sandbox (no live DB /
   driver / seeded schema). A live parity + authorization gate on real PG is
   MANDATORY before production. See docs/WAVE3_QUERY_PERFORMANCE.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* Identifier allowlist — the only table/column identifiers this module will
   ever place into SQL. Anything else must be a bound parameter. */
const ALLOWED_TABLES = new Set(['users', 'attendance', 'enrollments', 'classes', 'schedule', 'parent_links', 'grades', 'subjects', 'schools', 'offices']);

function tableName(t) {
  if (!ALLOWED_TABLES.has(t)) throw new Error(`dbquery: table not allowlisted: ${String(t)}`);
  return t;
}

/** Roles that see across schools (no school_id predicate).
 *  Wave 5 — single authorization model: this set is RE-EXPORTED from
 *  server/policy.js (superadmin only). edu_office is NOT school-blind: its
 *  REST reads now carry the office-geometry predicate (province/county/
 *  district over the schools table) — exactly the rule sync's write gate
 *  (policy.inScope) enforces. */
const policy = require('./policy');
const SUPER_SCOPED = policy.SUPER_SCOPED;

/** Office-geometry school predicate (edu_office) — bound params only;
 *  unresolvable office ⇒ deny-all (fail-closed, SQL-side). */

function _officeGeoClause(alias, user, office, parts, push) {
  const col = (alias ? alias + '.' : '') + 'school_id';
  if (!user || user.role !== 'edu_office') return;
  if (!office) { parts.push('1 = 0'); return; } /* fail-closed: no office anchor */
  const terms = [];
  for (const field of ['province_id', 'county_id', 'district_id']) {
    if (office[field] != null && office[field] !== '') {
      const i = push(Number(office[field]));
      terms.push(`sc.${field} = $${i}`);
    }
  }
  const inner = terms.length ? ` WHERE ${terms.join(' AND ')}` : '';
  parts.push(`${col} IN (SELECT sc.id FROM "${tableName('schools')}" sc${inner})`);
}

/** Ownership clauses mirroring policy.readOk/filterReadable exactly. */
function _roleScopeParts(alias, coll, user, parts, push) {
  const a = alias ? alias + '.' : '';
  if (!user || SUPER_SCOPED.has(user.role)) return;
  if (coll === 'users-directory') {
    if (user.role === 'student') { const i = push(Number(user.id)); parts.push(`${a}id = $${i}`); return; }
    if (user.role === 'parent') {
      const i = push(Number(user.id));
      parts.push(`(${a}id = $${i} OR EXISTS (SELECT 1 FROM "${tableName('parent_links')}" pl WHERE pl.parent_id = $${i} AND pl.student_id = ${a}id))`);
      return;
    }
  }
  if (coll === 'students') {
    if (user.role === 'student') { const i = push(Number(user.id)); parts.push(`${a}id = $${i}`); return; }
    if (user.role === 'parent') { const i = push(Number(user.id)); parts.push(`EXISTS (SELECT 1 FROM "${tableName('parent_links')}" pl WHERE pl.parent_id = $${i} AND pl.student_id = ${a}id)`); return; }
    if (user.role === 'teacher') {
      const t = push(Number(user.id));
      parts.push(`EXISTS (SELECT 1 FROM "${tableName('enrollments')}" e3 WHERE e3.student_id = ${a}id AND e3.class_id IN (SELECT c3.id FROM "${tableName('classes')}" c3 WHERE c3.homeroom_teacher_id = $${t} OR c3.id IN (SELECT s3.class_id FROM "${tableName('schedule')}" s3 WHERE s3.teacher_id = $${t})))`);
      return;
    }
  }
  if (coll === 'classes') {
    if (user.role === 'student') { const i = push(Number(user.id)); parts.push(`${a}id IN (SELECT e.class_id FROM "${tableName('enrollments')}" e WHERE e.student_id = $${i})`); return; }
    if (user.role === 'parent') { const i = push(Number(user.id)); parts.push(`${a}id IN (SELECT e.class_id FROM "${tableName('enrollments')}" e WHERE e.student_id IN (SELECT pl.student_id FROM "${tableName('parent_links')}" pl WHERE pl.parent_id = $${i}))`); return; }
    if (user.role === 'teacher') { const t = push(Number(user.id)); parts.push(`(${a}homeroom_teacher_id = $${t} OR ${a}id IN (SELECT s.class_id FROM "${tableName('schedule')}" s WHERE s.teacher_id = $${t}))`); return; }
  }
}

/**
 * Compose the final page + count statements from a set of WHERE parts.
 * @param {Object} o
 * @param {string} o.from         base table+alias, e.g. '"grades" g' (count source)
 * @param {string} [o.pageFrom]   page source (base + JOINs) — defaults to `from`
 * @param {string} [o.selectList] SELECT list for the page — defaults to `*`
 * @param {Array<string>} o.parts
 * @param {Array<*>} o.params
 * @param {string} o.orderBy
 * @param {string} o.cursorRef
 * @param {number} o.limit
 * @param {number} [o.cursor]
 * @returns {{page:{sql,params}, count:{sql,params}}}
 */
function _finalize(o) {
  const whereSql = o.parts.length ? `WHERE ${o.parts.join(' AND ')}` : '';
  const countFrom = o.countFrom || o.from;

  // COUNT uses only the filter parts, over the base table (no JOINs, no cursor, no limit)
  const countSql = `SELECT COUNT(*)::int AS n FROM ${countFrom} ${whereSql}`;
  const countParams = o.params.slice();

  // Page: add keyset cursor, then LIMIT limit+1 (detect has_more, no OFFSET)
  const pageParams = o.params.slice();
  const pageParts = o.parts.slice();
  if (o.cursor != null && !isNaN(Number(o.cursor))) {
    pageParams.push(Number(o.cursor));
    pageParts.push(`${o.cursorRef} > $${pageParams.length}`);
  }
  const pageWhere = pageParts.length ? `WHERE ${pageParts.join(' AND ')}` : '';
  pageParams.push(Number(o.limit) + 1);
  const selectList = o.selectList || '*';
  const pageFrom = o.pageFrom || o.from;
  const pageSql = `SELECT ${selectList} FROM ${pageFrom} ${pageWhere} ORDER BY ${o.orderBy} LIMIT $${pageParams.length}`;

  return { page: { sql: pageSql, params: pageParams }, count: { sql: countSql, params: countParams } };
}

/**
 * students list — mirrors server/routes/students.js getStudentsList.
 */
function buildStudentsList({ user, office, classId, grade, search, limit, cursor }) {
  const from = '"users" u';
  const parts = [`u.role = 'student'`];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    if (user.role === 'edu_office') {
      /* قراردادِ رکوردِ دانش‌آموز (policy.studentRecordOk): اداره — و هر نقشِ
         دیگر — دیدنِ فهرستِ دانش‌آموزان را ندارد ⇒ fail-closed. دایرکتوریِ
         کاربران (/api/users) هندسهٔ دفتر را می‌بیند؛ فهرستِ دانش‌آموزان نه. */
      parts.push('1 = 0');
    } else {
      const i = push(Number(user.school_id));
      parts.push(`u.school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */
    }
  }
  _roleScopeParts('u', 'students', user, parts, push);
  if (classId) {
    const c = push(Number(classId));
    parts.push(`EXISTS (SELECT 1 FROM "${tableName('enrollments')}" e WHERE e.student_id = u.id AND e.class_id = $${c})`);
  }
  if (grade != null && grade !== '') {
    const g = push(Number(grade));
    parts.push(`u.grade_level = $${g}`);
  }
  if (search) {
    const q = push('%' + String(search).trim() + '%');
    parts.push(`(CAST(u.full_name AS TEXT) ILIKE $${q} OR CAST(u.national_id AS TEXT) ILIKE $${q})`);
  }
  /* teacher scope now unified in _roleScopeParts above (single model with policy.readOk) */

  return _finalize({ from, parts, params, orderBy: 'u.id ASC', cursorRef: 'u.id', limit, cursor });
}

/**
 * attendance list — mirrors server/routes/attendance.js getAttendanceList.
 */
function buildAttendanceList({ user, office, date, classId, studentId, limit, cursor }) {
  const from = '"attendance"';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    if (user.role !== 'edu_office') {
      const i = push(Number(user.school_id));
      parts.push(`school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */
    }
    _officeGeoClause('', user, office, parts, push);
  }
  if (user && user.role === 'teacher') {
    /* Wave 5 — teacher sees attendance of classes they actually teach
       (policy.readOk teacher arm; attendance rows carry no teacher/subject
       columns, so the JS ∪-arms are no-ops here — class arms are enough). */
    const t = push(Number(user.id));
    parts.push(`(class_id IN (SELECT s.class_id FROM "${tableName('schedule')}" s WHERE s.teacher_id = $${t})` +
      ` OR class_id IN (SELECT c.id FROM "${tableName('classes')}" c WHERE c.homeroom_teacher_id = $${t}))`);
  }
  if (date) {
    const d = push(String(date).trim());
    parts.push(`date = $${d}`);
  }
  if (classId) {
    const c = push(Number(classId));
    parts.push(`class_id = $${c}`);
  }
  if (studentId) {
    const s = push(Number(studentId));
    parts.push(`student_id = $${s}`);
  }
  if (user && user.role === 'student') {
    const sid = push(Number(user.id));
    parts.push(`student_id = $${sid}`);
  } else if (user && user.role === 'parent') {
    const pid = push(Number(user.id));
    parts.push(`EXISTS (SELECT 1 FROM "${tableName('parent_links')}" pl WHERE pl.parent_id = $${pid} AND pl.student_id = attendance.student_id)`);
  }

  return _finalize({ from, parts, params, orderBy: 'date DESC, id ASC', cursorRef: 'id', limit, cursor });
}

/**
 * grades list — mirrors server/routes/grades.js getGradesList.
 * Enrichment (subject_name/student_name) is done via allowlisted LEFT JOINs in
 * the page query; the COUNT stays over the base table (joins are many-to-one).
 */
function buildGradesList({ user, office, studentId, subjectId, classId, limit, cursor }) {
  const from = '"grades" g';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    if (user.role !== 'edu_office') {
      const i = push(Number(user.school_id));
      parts.push(`g.school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */
    }
    _officeGeoClause('g', user, office, parts, push);
  }
  if (studentId) {
    const s = push(Number(studentId));
    parts.push(`g.student_id = $${s}`);
  }
  if (subjectId) {
    const s = push(Number(subjectId));
    parts.push(`g.subject_id = $${s}`);
  }
  if (classId) {
    const c = push(Number(classId));
    parts.push(`g.class_id = $${c}`);
  }
  if (user && user.role === 'student') {
    const sid = push(Number(user.id));
    parts.push(`g.student_id = $${sid}`);
  } else if (user && user.role === 'parent') {
    const pid = push(Number(user.id));
    parts.push(`EXISTS (SELECT 1 FROM "${tableName('parent_links')}" pl WHERE pl.parent_id = $${pid} AND pl.student_id = g.student_id)`);
  } else if (user && user.role === 'teacher') {
    /* Wave 5 — same union as policy.readOk: own-written ∪ taught-subject ∪ taught-class */
    const tid = push(Number(user.id));
    parts.push(
      `(g.teacher_id = $${tid} OR EXISTS (SELECT 1 FROM "${tableName('schedule')}" s3 WHERE s3.teacher_id = $${tid} AND s3.subject_id = g.subject_id)` +
      ` OR g.class_id IN (SELECT s4.class_id FROM "${tableName('schedule')}" s4 WHERE s4.teacher_id = $${tid})` +
      ` OR g.class_id IN (SELECT c4.id FROM "${tableName('classes')}" c4 WHERE c4.homeroom_teacher_id = $${tid}))`
    );
  }

  const pageFrom = `"grades" g LEFT JOIN "${tableName('subjects')}" sb ON sb.id = g.subject_id ` +
    `LEFT JOIN "${tableName('users')}" st ON st.id = g.student_id`;
  const selectList = 'g.*, sb.name AS subject_name, st.full_name AS student_name';

  return _finalize({
    from, pageFrom, selectList, parts, params,
    orderBy: 'g.id DESC', cursorRef: 'g.id', limit, cursor
  });
}

/**
 * classes list — mirrors server/routes/classes.js getClassesList.
 * student_count via a scalar subquery over enrollments; homeroom teacher name
 * via a LEFT JOIN on users (the count stays over the base classes table).
 */
function buildClassesList({ user, office, grade, limit, cursor }) {
  const from = '"classes" c';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    if (user.role !== 'edu_office') {
      const i = push(Number(user.school_id));
      parts.push(`c.school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */
    }
    _officeGeoClause('c', user, office, parts, push);
  }
  _roleScopeParts('c', 'classes', user, parts, push);
  if (grade != null && grade !== '') {
    const g = push(Number(grade));
    parts.push(`c.grade = $${g}`);
  }

  const enr = `"${tableName('enrollments')}"`;
  const pageFrom = `"classes" c LEFT JOIN "${tableName('users')}" tu ON tu.id = c.homeroom_teacher_id`;
  const selectList = `c.*, (SELECT COUNT(*)::int FROM ${enr} e WHERE e.class_id = c.id) AS student_count, tu.full_name AS homeroom_teacher_name`;

  return _finalize({
    from, pageFrom, selectList, parts, params,
    orderBy: 'c.id ASC', cursorRef: 'c.id', limit, cursor
  });
}

/**
 * users list — mirrors server/routes/users.js getUsersList (school scope +
 * role + free-text search over full_name/national_id/phone). national_id is
 * only ever a bound ILIKE parameter — never interpolated.
 */
function buildUsersList({ user, office, role, search, limit, cursor }) {
  const from = '"users" u';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    if (user.role !== 'edu_office') {
      const i = push(Number(user.school_id));
      parts.push(`u.school_id = $${i}`); /* Wave 5 — national accounts (school NULL) never leak */
    }
    _officeGeoClause('u', user, office, parts, push);
  }
  _roleScopeParts('u', 'users-directory', user, parts, push);
  if (role) {
    const r = push(String(role));
    parts.push(`u.role = $${r}`);
  }
  if (search) {
    const q = push('%' + String(search).trim() + '%');
    parts.push(
      `(CAST(u.full_name AS TEXT) ILIKE $${q} OR CAST(u.national_id AS TEXT) ILIKE $${q} OR CAST(u.phone AS TEXT) ILIKE $${q})`
    );
  }

  return _finalize({ from, parts, params, orderBy: 'u.id ASC', cursorRef: 'u.id', limit, cursor });
}

/**
 * Execute the paged + count statements against a live db and shape the result
 * exactly like server/middleware/pagination.js `paginateArray` (data +
 * pagination{limit,has_more,next_cursor,prev_cursor,count,total}).
 */
async function executePagedList(db, built, { limit, cursor }) {
  /* Wave 10 — heavy GET-list reads route to the read replica when one is live
     (db.queryRead). When db only exposes query (memory/fallback/fake dbs) it is
     used unchanged — identical behaviour. db.queryRead itself falls back to the
     primary when no replica is configured/active. */
  const read = (db && typeof db.queryRead === 'function') ? db.queryRead.bind(db) : db.query.bind(db);

  const res = await read(built.page.sql, built.page.params);
  const got = (res && Array.isArray(res.rows)) ? res.rows : [];
  const hasMore = got.length > limit;
  const data = hasMore ? got.slice(0, limit) : got;

  let total = null;
  try {
    const c = await read(built.count.sql, built.count.params);
    const n = c && c.rows && c.rows[0] && c.rows[0].n;
    if (n != null) total = Number(n);
  } catch (e) { /* total best-effort */ }

  const first = data[0];
  const last = data[data.length - 1];
  return {
    data,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore && last ? String(last.id) : null,
      prev_cursor: cursor ? (first ? String(first.id) : null) : null,
      count: data.length,
      total
    }
  };
}

module.exports = {
  buildPagedSql: _finalize,
  buildStudentsList,
  buildAttendanceList,
  buildGradesList,
  buildClassesList,
  buildUsersList,
  executePagedList,
  tableName
};
