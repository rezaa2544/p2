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
const ALLOWED_TABLES = new Set(['users', 'attendance', 'enrollments', 'classes', 'schedule', 'parent_links', 'grades', 'subjects']);

function tableName(t) {
  if (!ALLOWED_TABLES.has(t)) throw new Error(`dbquery: table not allowlisted: ${String(t)}`);
  return t;
}

/** Roles that see across schools (no school_id predicate). */
const SUPER_SCOPED = new Set(['superadmin', 'edu_office']);

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
  const spec = o.cursorKey || null;
  if (o.cursor != null && spec) {
    /* Composite keyset. A single-column `id > cursor` is only correct when the
       ORDER BY is on id. attendance orders by (date DESC, id ASC), so an
       id-only cursor silently abandons the rest of the result set — measured
       on a live PostgreSQL with 120,000 rows in scope: walking next_cursor
       reached 6,000 rows, 13 pages, and 95% of the data was never returned. */
    const pred = spec.predicate(o.cursor, pageParams);
    if (pred) pageParts.push(pred);
  } else if (o.cursor != null && !isNaN(Number(o.cursor))) {
    pageParams.push(Number(o.cursor));
    pageParts.push(`${o.cursorRef} > $${pageParams.length}`);
  }
  const pageWhere = pageParts.length ? `WHERE ${pageParts.join(' AND ')}` : '';
  pageParams.push(Number(o.limit) + 1);
  const selectList = o.selectList || '*';
  const pageFrom = o.pageFrom || o.from;
  const pageSql = `SELECT ${selectList} FROM ${pageFrom} ${pageWhere} ORDER BY ${o.orderBy} LIMIT $${pageParams.length}`;

  return { page: { sql: pageSql, params: pageParams }, count: { sql: countSql, params: countParams }, cursorKey: spec };
}

/**
 * A composite keyset cursor over `cols`, which MUST mirror the ORDER BY.
 *   cols: [{ ref, key, dir, cast? }]   e.g. [{ref:'date',key:'date',dir:'DESC'},
 *                                            {ref:'id',  key:'id',  dir:'ASC'}]
 * The wire cursor is the column values joined with `|`, in ORDER BY order.
 * The predicate is the standard row-value comparison expanded for the planner:
 *   (a < v1) OR (a = v1 AND b > v2) …
 * A bare numeric cursor (what clients built before this change still send)
 * degrades to the trailing id column only — never worse than before.
 */
function compositeCursorKey(cols) {
  const val = (col, raw) => (col.cast ? col.cast(raw) : raw);
  return {
    cols,
    encode(row) {
      if (!row) return null;
      const parts = cols.map((c) => row[c.key]);
      if (parts.some((p) => p === undefined || p === null)) return String(row[cols[cols.length - 1].key]);
      return parts.join('|');
    },
    predicate(cursor, params) {
      const raw = String(cursor).split('|');
      if (raw.length !== cols.length) {
        const last = cols[cols.length - 1];
        if (!isNaN(Number(cursor))) { params.push(Number(cursor)); return `${last.ref} > $${params.length}`; }
        return null;
      }
      const ors = [];
      for (let i = 0; i < cols.length; i++) {
        const ands = [];
        for (let j = 0; j < i; j++) { params.push(val(cols[j], raw[j])); ands.push(`${cols[j].ref} = $${params.length}`); }
        params.push(val(cols[i], raw[i]));
        ands.push(`${cols[i].ref} ${cols[i].dir === 'DESC' ? '<' : '>'} $${params.length}`);
        ors.push('(' + ands.join(' AND ') + ')');
      }
      return '(' + ors.join(' OR ') + ')';
    }
  };
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

  /* The ORDER BY is (date DESC, id ASC), so the keyset must be composite.
     An id-only cursor here is not a cursor at all — see compositeCursorKey. */
  return _finalize({
    from, parts, params, orderBy: 'date DESC, id ASC', cursorRef: 'id', limit, cursor,
    /* `id` is cast to a number: the cursor arrives off the wire as a string and
       binding "77" against an integer column would rely on an implicit cast. */
    cursorKey: compositeCursorKey([
      { ref: 'date', key: 'date', dir: 'DESC' },
      { ref: 'id', key: 'id', dir: 'ASC', cast: Number }
    ])
  });
}

/**
 * grades list — mirrors server/routes/grades.js getGradesList.
 * Enrichment (subject_name/student_name) is done via allowlisted LEFT JOINs in
 * the page query; the COUNT stays over the base table (joins are many-to-one).
 */
function buildGradesList({ user, studentId, subjectId, classId, limit, cursor }) {
  const from = '"grades" g';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    const i = push(Number(user.school_id));
    parts.push(`(g.school_id IS NULL OR g.school_id = $${i})`);
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
    const tid = push(Number(user.id));
    parts.push(
      `(g.teacher_id = $${tid} OR EXISTS (SELECT 1 FROM "${tableName('schedule')}" s3 WHERE s3.teacher_id = $${tid} AND s3.subject_id = g.subject_id))`
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
function buildClassesList({ user, grade, limit, cursor }) {
  const from = '"classes" c';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    const i = push(Number(user.school_id));
    parts.push(`(c.school_id IS NULL OR c.school_id = $${i})`);
  }
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
function buildUsersList({ user, role, search, limit, cursor }) {
  const from = '"users" u';
  const parts = [];
  const params = [];
  const push = (v) => { params.push(v); return params.length; };

  if (user && !SUPER_SCOPED.has(user.role)) {
    const i = push(Number(user.school_id));
    parts.push(`(u.school_id IS NULL OR u.school_id = $${i})`);
  }
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
  /* encode the cursor with the same key the WHERE clause decoded, so a walk
     resumes exactly where it stopped instead of jumping by id */
  const spec = built.cursorKey || null;
  const enc = (row) => (row ? (spec ? spec.encode(row) : String(row.id)) : null);
  const next = enc(last);
  const prev = enc(first);
  return {
    data,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore ? next : null,
      prev_cursor: cursor ? prev : null,
      count: data.length,
      total
    }
  };
}

module.exports = {
  buildPagedSql: _finalize,
  compositeCursorKey,
  buildStudentsList,
  buildAttendanceList,
  buildGradesList,
  buildClassesList,
  buildUsersList,
  executePagedList,
  tableName
};
