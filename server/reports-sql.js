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
  tableName: tbl   /* exported so the allowlist itself is testable (as in dbquery.js) */
};
