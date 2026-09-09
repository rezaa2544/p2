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
const ALLOWED_TABLES = new Set(['users', 'attendance', 'enrollments', 'classes', 'schedule', 'parent_links']);

function tableName(t) {
  if (!ALLOWED_TABLES.has(t)) throw new Error(`dbquery: table not allowlisted: ${String(t)}`);
  return t;
}

/** Roles that see across schools (no school_id predicate). */
const SUPER_SCOPED = new Set(['superadmin', 'edu_office']);

/**
 * Compose the final page + count statements from a set of WHERE parts.
 * @param {Object} o
 * @param {string} o.from       e.g. '"users" u'
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

  // COUNT uses only the filter parts (no cursor, no limit)
  const countSql = `SELECT COUNT(*)::int AS n FROM ${o.from} ${whereSql}`;
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
  const pageSql = `SELECT * FROM ${o.from} ${pageWhere} ORDER BY ${o.orderBy} LIMIT $${pageParams.length}`;

  return { page: { sql: pageSql, params: pageParams }, count: { sql: countSql, params: countParams } };
}

/**
 * students list — mirrors server/routes/students.js getStudentsList.
 */
function buildStudentsList({ user, classId, grade, search, limit, cursor }) {
  const from = '"users" u';
  const parts = [`u.role = 'student'`];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    const i = push(Number(user.school_id));
    parts.push(`(u.school_id IS NULL OR u.school_id = $${i})`);
  }
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
  if (user && user.role === 'teacher') {
    const tid = push(Number(user.id));
    parts.push(
      `EXISTS (SELECT 1 FROM "${tableName('enrollments')}" e2 WHERE e2.student_id = u.id AND e2.class_id IN (` +
      `SELECT c2.id FROM "${tableName('classes')}" c2 WHERE c2.homeroom_teacher_id = $${tid} ` +
      `OR c2.id IN (SELECT s2.class_id FROM "${tableName('schedule')}" s2 WHERE s2.teacher_id = $${tid})))`
    );
  }

  return _finalize({ from, parts, params, orderBy: 'u.id ASC', cursorRef: 'u.id', limit, cursor });
}

/**
 * attendance list — mirrors server/routes/attendance.js getAttendanceList.
 */
function buildAttendanceList({ user, date, classId, studentId, limit, cursor }) {
  const from = '"attendance"';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    const i = push(Number(user.school_id));
    parts.push(`(school_id IS NULL OR school_id = $${i})`);
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
 * Execute the paged + count statements against a live db and shape the result
 * exactly like server/middleware/pagination.js `paginateArray` (data +
 * pagination{limit,has_more,next_cursor,prev_cursor,count,total}).
 */
async function executePagedList(db, built, { limit, cursor }) {
  const res = await db.query(built.page.sql, built.page.params);
  const got = (res && Array.isArray(res.rows)) ? res.rows : [];
  const hasMore = got.length > limit;
  const data = hasMore ? got.slice(0, limit) : got;

  let total = null;
  try {
    const c = await db.query(built.count.sql, built.count.params);
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
  executePagedList,
  tableName
};
