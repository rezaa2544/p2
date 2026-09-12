/* ═══════════════════════════════════════════════════════════════════
   server/reports-sql.js — Wave 23: DB-native report builders
   -------------------------------------------------------------------
   server/routes/reports.js (Wave 23) aggregates by scanning the whole
   in-memory `store`: every attendance record of every month, every grade
   of every term, every user. That is O(rows in the tenant) per request,
   unbounded, and it grows with history — the exact anti-pattern SKILLS
   forbids for heavy paths ("no in-memory aggregation on heavy paths;
   DB-native with an index and a bounded result").

   This module holds the *pure* SQL builders for those reports: they turn
   a report's scope + filters + page into parameterized PostgreSQL
   statements, so the predicate, the aggregation and the pagination are
   pushed into the database instead of into JavaScript.

   Security invariants (same contract as server/dbquery.js, deliberately):
   - Every user-controlled value is a bound parameter ($n). Identifiers
     come only from the internal allowlist below — never from input.
   - Pagination is keyset (LIMIT n+1 over an ordered key), never OFFSET,
     so page 500 costs what page 1 costs.
   - Tenant scope is expressed in SQL (`school_id = ANY($1)`), so the
     database enforces the boundary rather than a JS filter over a
     fully-materialised array.
   - Results are BOUNDED: a page returns at most `limit` class rows.

   Dual mode: these builders are only used when PostgreSQL is live
   (db.isPostgres()). Otherwise server/routes/reports.js keeps the
   original in-memory path byte-for-byte, so the JSON fallback and the
   offline client are unaffected.

   Verification: tests/wave23-reports-sql.js (pure, always runs) and
   tests/wave23-reports-pg.js (real PostgreSQL, parity against the
   in-memory implementation). See docs/WAVE23_DB_NATIVE_REPORTS.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── Jalali calendar ───────────────────────────────────────────────
   server/routes/reports.js already carries toJalali (mirror of
   src/js/22-jalali-calendar.js). We need the inverse to turn a Jalali
   month into a half-open Gregorian range [from, to) that can be bound
   as parameters — attendance.date is VARCHAR(50) holding 'YYYY-MM-DD',
   so lexicographic comparison equals chronological comparison and a
   btree index on (school_id, date) can serve the range. */
const _div = (a, b) => Math.floor(a / b);

/** Jalali → Gregorian [gy, gm, gd] (standard arithmetic algorithm). */
function jalaliToGregorian(jy, jm, jd) {
  let y = jy + 1595;
  let days = -355668 + (365 * y) + _div(y, 33) * 8 + _div((y % 33) + 3, 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * _div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * _div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * _div(days, 1461);
  days %= 1461;
  if (days > 365) { gy += _div(days - 1, 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 0; gm < 13 && gd > sal[gm]; gm++) gd -= sal[gm];
  return [gy, gm, gd];
}

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (a) => `${a[0]}-${pad2(a[1])}-${pad2(a[2])}`;

/**
 * Jalali month (jy, jm) → half-open Gregorian range ['YYYY-MM-DD', 'YYYY-MM-DD').
 * The upper bound is the first day of the NEXT month minus nothing — we use
 * an exclusive bound so no leap-year day counting is needed at all.
 */
function jalaliMonthRange(jy, jm) {
  const from = iso(jalaliToGregorian(jy, jm, 1));
  const nm = jm === 12 ? [jy + 1, 1] : [jy, jm + 1];
  const to = iso(jalaliToGregorian(nm[0], nm[1], 1));
  return { from, to };
}

/* ── identifier allowlist ──────────────────────────────────────────
   The only table identifiers this module will ever place into SQL.
   Mirrors the rule in server/dbquery.js. */
const ALLOWED_TABLES = new Set(['attendance', 'classes', 'users', 'schools', 'grades']);
function tbl(t) {
  if (!ALLOWED_TABLES.has(t)) throw new Error(`reports-sql: table not allowlisted: ${String(t)}`);
  return t;
}

/* Status buckets. Unknown / NULL status counts as 'absent' — that is the
   in-memory implementation's documented behaviour (`STATUSES.indexOf(...)
   > -1 ? status : 'absent'`), and parity is asserted by the PG test. */
/* BUG FIXED: this must count `a.id`, never `count(*)`. The class page is a
   LEFT JOIN, so a class with no attendance in the month still yields ONE
   all-NULL row; count(*) would report total=1 and the COALESCE catch-all
   would count that NULL as an absence. The PG parity test caught it
   (mem total=0 vs db total=1). Under the totals query's INNER JOIN the two
   are identical, so one shared expression is safe. */
const ATT_FILTERS = `
  count(a.id)::int AS total,
  count(a.id) FILTER (WHERE a.status = 'present')::int    AS present,
  count(a.id) FILTER (WHERE a.status = 'late')::int       AS late,
  count(a.id) FILTER (WHERE a.status = 'excused')::int    AS excused,
  count(a.id) FILTER (WHERE a.status = 'early_exit')::int AS early_exit,
  count(a.id) FILTER (WHERE COALESCE(a.status, '') NOT IN ('present','late','excused','early_exit'))::int AS absent`;

/** Hard ceiling so a caller cannot ask for an unbounded page. */
const MAX_PAGE = 5000;
const clampLimit = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 500;
  return Math.min(Math.floor(v), MAX_PAGE);
};

/**
 * Page of class rows for the monthly attendance report.
 *
 * Pagination walks the CLASSES table, not the aggregate, on purpose: the
 * in-memory report emits a row for every class in scope — including ones
 * with zero attendance in the month — so keying the page on `classes`
 * keeps the response shape identical while staying bounded. The month
 * predicate lives in the LEFT JOIN condition, so classes without rows in
 * the month still appear with zeros instead of disappearing.
 *
 * @returns {{sql:string, params:any[]}} parameterized statement, LIMIT+1
 */
function buildAttendanceClassPage({ schoolIds, classId, from, to, limit, cursor }) {
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const pSchools = push(schoolIds.map(Number));
  const pFrom = push(String(from));
  const pTo = push(String(to));

  const parts = [`c.school_id = ANY($${pSchools})`];
  if (classId != null && classId !== '') parts.push(`c.id = $${push(Number(classId))}`);
  if (cursor != null && cursor !== '') {
    /* composite keyset over the ORDER BY key (school_id, id) — row-value
       comparison so the planner can use the index. */
    const raw = String(cursor).split('|');
    const cs = Number(raw[0]); const ci = Number(raw[1]);
    if (raw.length === 2 && Number.isFinite(cs) && Number.isFinite(ci)) {
      parts.push(`(c.school_id, c.id) > ($${push(cs)}, $${push(ci)})`);
    }
  }

  const lim = clampLimit(limit) + 1;
  const sql = `SELECT c.school_id, c.id AS class_id, c.name, c.grade,${ATT_FILTERS}
FROM ${tbl('classes')} c
LEFT JOIN ${tbl('attendance')} a
       ON a.class_id = c.id
      AND a.school_id = c.school_id
      AND a.date >= $${pFrom}
      AND a.date <  $${pTo}
WHERE ${parts.join('\n  AND ')}
GROUP BY c.school_id, c.id, c.name, c.grade
ORDER BY c.school_id, c.id
LIMIT ${lim}`;
  return { sql, params };
}

/**
 * Per-school totals over ALL classes in scope (not just the page) — a
 * paginated page must not silently change the meaning of "totals".
 * Bounded by the number of scoped schools; callers pass the schools of
 * the current page, so this stays O(schools on the page).
 */
function buildAttendanceSchoolTotals({ schoolIds, from, to, classId }) {
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const pSchools = push(schoolIds.map(Number));
  const pFrom = push(String(from));
  const pTo = push(String(to));
  const parts = [`a.school_id = ANY($${pSchools})`];
  /* BUG FIXED: the month predicate was pushed as a parameter but never placed
     in the WHERE clause, so per-school totals aggregated across EVERY month
     while the class page showed one month. Caught by the param/placeholder
     invariant in tests/wave23-reports-sql.js, then by the PG parity test. */
  parts.push(`a.date >= $${pFrom}`);
  parts.push(`a.date <  $${pTo}`);
  if (classId != null && classId !== '') parts.push(`a.class_id = $${push(Number(classId))}`);

  const sql = `SELECT a.school_id,${ATT_FILTERS}
FROM ${tbl('attendance')} a
JOIN ${tbl('classes')} c ON c.id = a.class_id AND c.school_id = a.school_id
WHERE ${parts.join(' AND ')}
GROUP BY a.school_id`;
  return { sql, params };
}

/** Enrolled student headcount per school (one GROUP BY, not a full user scan). */
function buildStudentsPerSchool({ schoolIds }) {
  const params = [schoolIds.map(Number)];
  const sql = `SELECT school_id, count(*)::int AS n
FROM ${tbl('users')}
WHERE role = 'student' AND school_id = ANY($1)
GROUP BY school_id`;
  return { sql, params };
}

/** Wire cursor for the attendance report page: "school_id|class_id". */
function attendanceCursor(row) {
  if (!row) return null;
  return `${row.school_id}|${row.class_id}`;
}

/* Same rounding as the in-memory implementation and src/js/77-reports.js:
   Math.round(x*1000)/10 — kept in JS so the two paths cannot drift. */
function rate10(attended, total) {
  return total ? Math.round((attended / total) * 1000) / 10 : null;
}

/* ═══ Wave 23 completion — academic / finance / teachers builders ═══
   Same doctrine as the attendance builders above: pure functions, every
   user value a bound parameter, identifiers from the allowlist, keyset
   pagination with LIMIT n+1, tenant scope in SQL. */

ALLOWED_TABLES.add('tuitions');
ALLOWED_TABLES.add('installments');
ALLOWED_TABLES.add('scholarships');
ALLOWED_TABLES.add('staff_attendance');
ALLOWED_TABLES.add('substitutions');
ALLOWED_TABLES.add('training_courses');

/* ── standard parameter validation (P2) ────────────────────────────
   The in-memory paths used bare Number() — a broken input became NaN and
   silently matched nothing (or hit SQL as 'NaN' → 500 on PG). These four
   parsers give every endpoint the same contract: broken input ⇒ 400,
   never a silent NaN. Pure + exported so they are directly testable. */

/** Strict positive integer (>=1). Returns the int, or null when invalid. */
function parsePositiveInt(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return (Number.isSafeInteger(n) && n >= 1) ? n : null;
}

/** Optional positive int: absent/'' ⇒ ok:null; present ⇒ must parse. */
function parseOptionalPositiveInt(v) {
  if (v == null || v === '') return { ok: true, value: null };
  const n = parsePositiveInt(v);
  return n == null ? { ok: false, value: null } : { ok: true, value: n };
}

/** term is only ever a bound equality parameter, but we still refuse
    garbage early: absent ⇒ null; a short printable string ⇒ itself. */
function validateTerm(v) {
  if (v == null || v === '') return { ok: true, value: null };
  const s = String(v);
  if (s.length > 60) return { ok: false, value: null };
  if (/[\u0000-\u001f\u007f]/.test(s)) return { ok: false, value: null };
  return { ok: true, value: s };
}

/** school_id has the same shape rule as any id — the scope check itself
    (403 for out-of-scope) stays in the route; this is only the 400 gate. */
function validateSchoolId(v) {
  return parseOptionalPositiveInt(v);
}

/* ── Number()-parity casts ─────────────────────────────────────────
   Several money/score columns are VARCHAR in PostgreSQL (schema drift the
   JSON store never noticed). The in-memory paths do `Number(x) || 0`.
   A bare ::numeric would throw on junk, so the cast only fires when the
   trimmed value looks like a decimal number — junk counts as 0 exactly
   like Number('junk')||0. (Number's exotic accepts — '1e3', '0x10' —
   are deliberately NOT mirrored; report money/score data is decimal.
   Recorded in docs/WAVE23_DB_NATIVE_REPORTS.md.) */
const NUM_RE_SQL = `'^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'`;
const numOr0 = (col) =>
  `CASE WHEN ${col} IS NOT NULL AND btrim(${col}) ~ ${NUM_RE_SQL} THEN btrim(${col})::numeric ELSE 0 END`;

/* grades.max_score is VARCHAR; the in-memory norm is:
     mx = Number(max_score) || 20;  v = mx > 0 ? score/mx*20 : null(skip)
   so: castable-and-negative ⇒ row skipped; 0/''/junk/NULL ⇒ 20 (v=score);
   positive ⇒ score*20/mx. NULL norm rows fall out of count()/sum(). */
const MX_VALID = `(g.max_score IS NOT NULL AND btrim(g.max_score) ~ ${NUM_RE_SQL})`;
const MX_NUM = `btrim(g.max_score)::numeric`;
const NORM_EXPR = `CASE
    WHEN ${MX_VALID} AND ${MX_NUM} < 0 THEN NULL
    WHEN ${MX_VALID} AND ${MX_NUM} > 0 THEN COALESCE(g.score, 0) * 20 / ${MX_NUM}
    ELSE COALESCE(g.score, 0)
  END`;

/**
 * Academic report — page of class rows. Same pagination doctrine as the
 * attendance page: the page walks CLASSES (so a class with no grades in
 * the term still appears with count=0), keyset over (school_id, id).
 */
function buildAcademicClassPage({ schoolIds, classId, term, limit, cursor }) {
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const pSchools = push(schoolIds.map(Number));

  const gParts = [`school_id = ANY($${pSchools})`];
  if (term != null && term !== '') gParts.push(`term = $${push(String(term))}`);

  const cParts = [`c.school_id = ANY($${pSchools})`];
  if (classId != null && classId !== '') cParts.push(`c.id = $${push(Number(classId))}`);
  if (cursor != null && cursor !== '') {
    const raw = String(cursor).split('|');
    const cs = Number(raw[0]); const ci = Number(raw[1]);
    if (raw.length === 2 && Number.isFinite(cs) && Number.isFinite(ci)) {
      cParts.push(`(c.school_id, c.id) > ($${push(cs)}, $${push(ci)})`);
    }
  }

  const lim = clampLimit(limit) + 1;
  const sql = `WITH g AS (
  SELECT g.school_id, g.class_id, ${NORM_EXPR} AS norm
  FROM ${tbl('grades')} g
  WHERE ${gParts.join(' AND ')}
)
SELECT c.school_id, c.id AS class_id, c.name, c.grade,
  count(g.norm)::int AS cnt,
  COALESCE(sum(g.norm), 0)::float8 AS total,
  count(g.norm) FILTER (WHERE g.norm >= 10)::int AS pass
FROM ${tbl('classes')} c
LEFT JOIN g ON g.class_id = c.id AND g.school_id = c.school_id
WHERE ${cParts.join('\n  AND ')}
GROUP BY c.school_id, c.id, c.name, c.grade
ORDER BY c.school_id, c.id
LIMIT ${lim}`;
  return { sql, params };
}

/**
 * Academic per-school weighted average over ALL classes in scope (with the
 * same class/term filters) — pagination must not change the meaning of the
 * school figure. Mirrors the in-memory formula exactly, including the
 * quirk that it weights the ROUNDED per-class average by the class count.
 */
function buildAcademicSchoolTotals({ schoolIds, classId, term }) {
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const pSchools = push(schoolIds.map(Number));
  const gParts = [`school_id = ANY($${pSchools})`];
  if (term != null && term !== '') gParts.push(`term = $${push(String(term))}`);
  const cParts = [`c.school_id = ANY($${pSchools})`];
  if (classId != null && classId !== '') cParts.push(`c.id = $${push(Number(classId))}`);

  const sql = `WITH g AS (
  SELECT g.school_id, g.class_id, ${NORM_EXPR} AS norm
  FROM ${tbl('grades')} g
  WHERE ${gParts.join(' AND ')}
), per_class AS (
  SELECT c.school_id, count(g.norm)::int AS cnt,
         CASE WHEN count(g.norm) > 0
              THEN round((sum(g.norm) / count(g.norm))::numeric, 1) END AS avg1
  FROM ${tbl('classes')} c
  LEFT JOIN g ON g.class_id = c.id AND g.school_id = c.school_id
  WHERE ${cParts.join(' AND ')}
  GROUP BY c.school_id, c.id
)
SELECT school_id,
  COALESCE(sum(avg1 * cnt), 0)::float8 AS wsum,
  COALESCE(sum(cnt), 0)::int AS n
FROM per_class
GROUP BY school_id`;
  return { sql, params };
}

/**
 * Academic trend: per-school per-term average over ALL grades in scope —
 * the in-memory path builds the trend before applying term/class filters,
 * so this builder deliberately takes no filters. Row order mirrors the JS
 * Map insertion order (first appearance in id order) via min(id).
 */
function buildAcademicTrend({ schoolIds }) {
  const params = [schoolIds.map(Number)];
  const sql = `WITH g AS (
  SELECT g.school_id, g.id, g.term, ${NORM_EXPR} AS norm
  FROM ${tbl('grades')} g
  WHERE school_id = ANY($1)
)
SELECT school_id,
  CASE WHEN term IS NULL OR term = '' THEN '—' ELSE term END AS term,
  count(norm)::int AS cnt,
  COALESCE(sum(norm), 0)::float8 AS total
FROM g
GROUP BY school_id, 2
ORDER BY school_id, min(id)`;
  return { sql, params };
}

/** Finance: per-school tuition sums. total is NUMERIC; discount/payable/
    paid are VARCHAR ⇒ Number()-parity cast. */
function buildFinanceTuitions({ schoolIds }) {
  const params = [schoolIds.map(Number)];
  const sql = `SELECT school_id,
  count(*)::int AS cnt,
  COALESCE(sum(COALESCE(total, 0)), 0)::float8 AS total,
  COALESCE(sum(${numOr0('discount')}), 0)::float8 AS discount,
  COALESCE(sum(${numOr0('payable')}), 0)::float8 AS payable,
  COALESCE(sum(${numOr0('paid')}), 0)::float8 AS paid
FROM ${tbl('tuitions')}
WHERE school_id = ANY($1)
GROUP BY school_id`;
  return { sql, params };
}

/** Finance: per-school installment buckets. Unknown status ⇒ 'pending'
    (in-memory catch-all); overdue = pending/partial past `today`
    (bound parameter — the route passes the same ISO date string the
    in-memory path computes, so the two paths cannot disagree on "now"). */
function buildFinanceInstallments({ schoolIds, today }) {
  const params = [schoolIds.map(Number), String(today)];
  const sql = `SELECT school_id,
  count(*) FILTER (WHERE st = 'paid')::int AS paid,
  count(*) FILTER (WHERE st = 'pending')::int AS pending,
  count(*) FILTER (WHERE st = 'partial')::int AS partial,
  count(*) FILTER (WHERE st = 'canceled')::int AS canceled,
  count(*) FILTER (WHERE st IN ('pending','partial')
                   AND due_date IS NOT NULL AND due_date <> ''
                   AND due_date < $2)::int AS overdue,
  COALESCE(sum(${numOr0('paid_amount')}), 0)::float8 AS paid_amount,
  COALESCE(sum(COALESCE(amount, 0)) FILTER (WHERE st <> 'canceled'), 0)::float8 AS due_amount
FROM (
  SELECT *, CASE WHEN status IN ('paid','pending','partial','canceled')
                 THEN status ELSE 'pending' END AS st
  FROM ${tbl('installments')}
  WHERE school_id = ANY($1)
) x
GROUP BY school_id`;
  return { sql, params };
}

/** Finance: per-school scholarship counts. */
function buildFinanceScholarships({ schoolIds }) {
  const params = [schoolIds.map(Number)];
  const sql = `SELECT school_id,
  count(*)::int AS cnt,
  count(*) FILTER (WHERE status = 'approved')::int AS approved
FROM ${tbl('scholarships')}
WHERE school_id = ANY($1)
GROUP BY school_id`;
  return { sql, params };
}

/**
 * Teachers: page of staff rows — three per-source aggregates FULL-joined
 * on (school_id, staff_id), keyset over that same key. staff_attendance
 * and substitutions are month-scoped; training_courses is whole-history
 * (the in-memory path aggregates training hours with no date filter).
 */
function buildTeachersStaffPage({ schoolIds, from, to, limit, cursor }) {
  const params = [];
  const push = (v) => { params.push(v); return params.length; };
  const pSchools = push(schoolIds.map(Number));
  const pFrom = push(String(from));
  const pTo = push(String(to));

  const parts = [];
  if (cursor != null && cursor !== '') {
    const raw = String(cursor).split('|');
    const cs = Number(raw[0]); const ci = Number(raw[1]);
    if (raw.length === 2 && Number.isFinite(cs) && Number.isFinite(ci)) {
      parts.push(`(school_id, staff_id) > ($${push(cs)}, $${push(ci)})`);
    }
  }

  const lim = clampLimit(limit) + 1;
  const sql = `WITH sa AS (
  SELECT school_id, staff_id,
    count(*) FILTER (WHERE status = 'present')::int AS present,
    count(*) FILTER (WHERE status = 'late')::int AS late,
    count(*) FILTER (WHERE COALESCE(status,'') NOT IN ('present','late'))::int AS absent
  FROM ${tbl('staff_attendance')}
  WHERE school_id = ANY($${pSchools}) AND date >= $${pFrom} AND date < $${pTo}
  GROUP BY school_id, staff_id
), su AS (
  SELECT school_id, sub_teacher_id AS staff_id, count(*)::int AS substitutions
  FROM ${tbl('substitutions')}
  WHERE school_id = ANY($${pSchools}) AND date >= $${pFrom} AND date < $${pTo}
  GROUP BY school_id, sub_teacher_id
), tr AS (
  SELECT school_id, staff_id,
    COALESCE(sum(COALESCE(hours, 0)), 0)::int AS training_hours,
    count(*) FILTER (WHERE status IN ('completed','done'))::int AS training_done
  FROM ${tbl('training_courses')}
  WHERE school_id = ANY($${pSchools})
  GROUP BY school_id, staff_id
)
SELECT school_id, staff_id,
  COALESCE(present, 0) AS present, COALESCE(absent, 0) AS absent, COALESCE(late, 0) AS late,
  COALESCE(substitutions, 0) AS substitutions,
  COALESCE(training_hours, 0) AS training_hours, COALESCE(training_done, 0) AS training_done
FROM sa
FULL JOIN su USING (school_id, staff_id)
FULL JOIN tr USING (school_id, staff_id)
${parts.length ? 'WHERE ' + parts.join(' AND ') + '\n' : ''}ORDER BY school_id, staff_id
LIMIT ${lim}`;
  return { sql, params };
}

/** Teachers: per-school totals over ALL staff in scope (not just the
    page) — same reason as the attendance/academic totals builders. */
function buildTeachersSchoolTotals({ schoolIds, from, to }) {
  const page = buildTeachersStaffPage({ schoolIds, from, to, limit: 1 });
  /* reuse the identical CTE set, aggregate by school, no LIMIT */
  const body = page.sql.slice(0, page.sql.indexOf(')\nSELECT school_id, staff_id,') + 2);
  const sql = `${body}
SELECT school_id,
  COALESCE(sum(COALESCE(present, 0)), 0)::int AS present,
  COALESCE(sum(COALESCE(absent, 0)), 0)::int AS absent,
  COALESCE(sum(COALESCE(late, 0)), 0)::int AS late,
  COALESCE(sum(COALESCE(substitutions, 0)), 0)::int AS substitutions,
  COALESCE(sum(COALESCE(training_hours, 0)), 0)::int AS training_hours
FROM sa
FULL JOIN su USING (school_id, staff_id)
FULL JOIN tr USING (school_id, staff_id)
GROUP BY school_id`;
  return { sql, params: page.params.slice(0, 3) };
}

/** Bounded name/role lookup for exactly the staff ids on the page. */
function buildUsersByIds({ ids }) {
  const params = [ids.map(Number)];
  const sql = `SELECT id, full_name, role FROM ${tbl('users')} WHERE id = ANY($1)`;
  return { sql, params };
}

/** Wire cursor for staff pages: "school_id|staff_id". */
function teachersCursor(row) {
  if (!row) return null;
  return `${row.school_id}|${row.staff_id}`;
}

module.exports = {
  jalaliToGregorian,
  jalaliMonthRange,
  buildAttendanceClassPage,
  buildAttendanceSchoolTotals,
  buildStudentsPerSchool,
  attendanceCursor,
  rate10,
  clampLimit,
  MAX_PAGE,
  ALLOWED_TABLES,
  tableName: tbl,  /* exported so the allowlist itself is testable (as in dbquery.js) */
  /* Wave 23 completion */
  parsePositiveInt,
  parseOptionalPositiveInt,
  validateTerm,
  validateSchoolId,
  buildAcademicClassPage,
  buildAcademicSchoolTotals,
  buildAcademicTrend,
  buildFinanceTuitions,
  buildFinanceInstallments,
  buildFinanceScholarships,
  buildTeachersStaffPage,
  buildTeachersSchoolTotals,
  buildUsersByIds,
  teachersCursor
};
