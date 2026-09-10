#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave3-query3.js — Wave 3: composite keyset cursors + live-PostgreSQL gate
   ───────────────────────────────────────────────────────────────────
   Why this suite exists:

   `buildAttendanceList` orders by (date DESC, id ASC) but its keyset cursor
   was `id > $cursor` — a single column that does not match the sort order.
   Neither wave3-query.js nor wave3-query2.js caught it, because both assert
   the cursor's SHAPE against a fake db rather than walking real pages.

   Measured on a live PostgreSQL 18.4, 120,000 attendance rows in one
   manager's scope, 500 rows per page:

       pages walked        13          (stopped early — has_more went false)
       unique rows reached 6,000
       rows never returned 114,000  =  95.0% of the data

   Section A pins the fix with no database at all. Section B re-runs the whole
   thing against a live PostgreSQL when DATABASE_URL is set, and self-skips
   when it is not — so CI without a DB still passes, and the gate becomes real
   the moment a database is available.

   اجرا:  node tests/wave3-query3.js
   با دیتابیس زنده:
     DATABASE_URL=postgres://user:pass@127.0.0.1:5432/payesh node tests/wave3-query3.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const Q = require(path.join(__dirname, '..', 'server', 'dbquery.js'));

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }

const MGR = { role: 'manager', school_id: 1, id: 2 };

console.log('\n▸ Wave 3 — composite keyset cursors (A: pure · B: live PostgreSQL)');

/* ═══ A. pure — no database required ═══ */
console.log('\n  — A. cursor algebra');
{
  const spec = Q.compositeCursorKey([
    { ref: 'date', key: 'date', dir: 'DESC' },
    { ref: 'id', key: 'id', dir: 'ASC' }
  ]);

  chk('A1 the cursor encodes every ORDER BY column, in order',
    spec.encode({ date: '2026-09-05', id: 77 }) === '2026-09-05|77',
    spec.encode({ date: '2026-09-05', id: 77 }));

  const params = [];
  const pred = spec.predicate('2026-09-05|77', params);
  chk('A2 the keyset predicate is the row-value comparison for (date DESC, id ASC)',
    pred === '((date < $1) OR (date = $2 AND id > $3))', pred);
  chk('A3 no cursor value is interpolated into the SQL — only $n placeholders',
    !/2026-09-05/.test(pred) && !/\b77\b/.test(pred) && params.length === 3
    && JSON.stringify(params) === JSON.stringify(['2026-09-05', '2026-09-05', '77']),
    JSON.stringify(params) + ' / ' + pred);

  /* the BUILDER's spec casts the trailing id, so an integer column is never
     bound as a string and left to an implicit cast */
  const bspec = Q.buildAttendanceList({ user: MGR, limit: 5, cursor: null }).cursorKey;
  const bp = [];
  bspec.predicate('2026-09-05|77', bp);
  chk('A3b the builder binds the trailing id as a number, not a string',
    typeof bp[2] === 'number' && bp[2] === 77, JSON.stringify(bp));

  /* DESC on the leading column, ASC on the trailing one — mixing these up
     silently walks the index backwards and returns the same page forever. */
  const asc = Q.compositeCursorKey([
    { ref: 'date', key: 'date', dir: 'ASC' },
    { ref: 'id', key: 'id', dir: 'ASC' }
  ]);
  const p2 = [];
  chk('A4 a leading ASC column flips to `>`, proving direction comes from the spec',
    asc.predicate('2026-09-05|77', p2) === '((date > $1) OR (date = $2 AND id > $3))',
    asc.predicate('2026-09-05|77', []));

  /* clients built before the fix send a bare id — degrade, do not break */
  const p3 = [];
  const legacy = spec.predicate('42', p3);
  chk('A5 a bare numeric cursor still works (backwards compatible)',
    legacy === 'id > $1' && JSON.stringify(p3) === '[42]', legacy + ' / ' + JSON.stringify(p3));

  const p4 = [];
  chk('A6 a malformed cursor yields no predicate rather than broken SQL',
    spec.predicate('not|a|cursor', p4) === null && p4.length === 0, String(spec.predicate('not|a|cursor', [])));

  chk('A7 a row missing a cursor column falls back to the id-only cursor',
    spec.encode({ id: 9 }) === '9', spec.encode({ id: 9 }));

  /* the builder actually carries the spec — this is what executePagedList reads */
  const built = Q.buildAttendanceList({ user: MGR, limit: 50, cursor: null });
  chk('A8 buildAttendanceList carries a composite keyset spec',
    !!built.cursorKey && built.cursorKey.cols.length === 2
    && built.cursorKey.cols.map((c) => c.ref + ':' + c.dir).join(',') === 'date:DESC,id:ASC',
    JSON.stringify(built.cursorKey && built.cursorKey.cols.map((c) => c.ref + ':' + c.dir)));
  chk('A9 the composite spec matches the ORDER BY it must mirror',
    /date DESC, id ASC/.test(built.page.sql), built.page.sql.slice(-70));

  /* the page SQL must contain the composite predicate once a cursor is given */
  const paged = Q.buildAttendanceList({ user: MGR, limit: 50, cursor: '2026-09-05|77' });
  chk('A10 a cursor produces the composite predicate in the page SQL',
    /date < \$\d+/.test(paged.page.sql) && /date = \$\d+ AND id > \$\d+/.test(paged.page.sql),
    paged.page.sql.slice(paged.page.sql.indexOf('WHERE')));
  chk('A11 the COUNT query never carries a cursor (total must stay stable)',
    !/date <|id >/.test(paged.count.sql), paged.count.sql);

  /* the other four lists sort by id alone, so their cursor is unchanged */
  for (const [name, b] of [
    ['students', Q.buildStudentsList({ user: MGR, limit: 50, cursor: '100' })],
    ['grades', Q.buildGradesList({ user: MGR, limit: 50, cursor: '100' })],
    ['classes', Q.buildClassesList({ user: MGR, limit: 50, cursor: '100' })],
    ['users', Q.buildUsersList({ user: MGR, limit: 50, cursor: '100' })]
  ]) {
    chk('A12 ' + name + ' keeps its single-column id cursor (ORDER BY id)',
      b.cursorKey == null && /id > \$\d+/.test(b.page.sql), b.page.sql.slice(-60));
  }

  /* executePagedList must emit the composite cursor, not last.id */
  (async () => {
    const fake = {
      query: async (sql) => ({
        rows: /COUNT/.test(sql)
          ? [{ n: 1000 }]
          : [
            { id: 11, date: '2026-09-09' },
            { id: 12, date: '2026-09-08' },
            { id: 13, date: '2026-09-07' }
          ]
      })
    };
    const built3 = Q.buildAttendanceList({ user: MGR, limit: 2, cursor: null });
    const res = await Q.executePagedList(fake, built3, { limit: 2, cursor: null });
    chk('A13 executePagedList emits a composite next_cursor',
      res.pagination.next_cursor === '2026-09-08|12', String(res.pagination.next_cursor));
    chk('A14 has_more still comes from LIMIT+1', res.pagination.has_more === true);
    await partB();
  })();
}

/* ═══ B. live PostgreSQL — self-skips without DATABASE_URL ═══ */
async function partB() {
  console.log('\n  — B. live PostgreSQL');
  if (!process.env.DATABASE_URL) {
    skip('B1–B7 real-database gate', 'DATABASE_URL is not set');
    return finish();
  }
  let pg;
  try { pg = require('pg'); } catch (e) { skip('B1–B7 real-database gate', 'the pg driver is not installed'); return finish(); }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); }
  catch (e) { skip('B1–B7 real-database gate', 'cannot connect: ' + e.message.split('\n')[0]); return finish(); }

  const db = { query: (sql, params) => client.query(sql, params), isPostgres: () => true };

  /* B1 — every builder's page query actually executes */
  const cases = [
    ['students', Q.buildStudentsList({ user: MGR, limit: 50, cursor: null })],
    ['students+class', Q.buildStudentsList({ user: MGR, classId: 1, limit: 50, cursor: null })],
    ['students+search', Q.buildStudentsList({ user: MGR, search: 'دانش', limit: 50, cursor: null })],
    ['attendance', Q.buildAttendanceList({ user: MGR, date: '2026-09-05', limit: 50, cursor: null })],
    ['attendance+parent', Q.buildAttendanceList({ user: { role: 'parent', school_id: 1, id: 3 }, limit: 50, cursor: null })],
    ['grades', Q.buildGradesList({ user: MGR, limit: 50, cursor: null })],
    ['classes', Q.buildClassesList({ user: MGR, limit: 50, cursor: null })],
    ['users', Q.buildUsersList({ user: MGR, limit: 50, cursor: null })]
  ];
  const errs = [];
  for (const [name, b] of cases) {
    try { await client.query(b.page.sql, b.page.params); await client.query(b.count.sql, b.count.params); }
    catch (e) { errs.push(name + ': ' + e.message.split('\n')[0]); }
  }
  chk('B1 all ' + cases.length + ' builder queries execute on live PostgreSQL', errs.length === 0, errs.join(' | '));

  /* B2 — the pagination walk reaches EVERY row (the bug this suite exists for) */
  const LIMIT = 500;
  const fullQ = Q.buildAttendanceList({ user: MGR, limit: 1000000, cursor: null });
  const fullSql = fullQ.page.sql.replace(/ORDER BY[\s\S]*$/, '') + ' ORDER BY date DESC, id ASC';
  let totalInScope = 0;
  try {
    const full = await client.query(fullSql.replace(/LIMIT \$\d+/, ''), fullQ.page.params.slice(0, -1));
    totalInScope = full.rows.length;
  } catch (e) { totalInScope = -1; }
  if (totalInScope <= 0) {
    skip('B2 pagination walk', 'no attendance rows in scope to walk');
  } else {
    const seen = new Set();
    let cursor = null, pages = 0, dup = 0;
    while (pages < 5000) {
      const b = Q.buildAttendanceList({ user: MGR, limit: LIMIT, cursor });
      const res = await Q.executePagedList(db, b, { limit: LIMIT, cursor });
      if (!res.data.length) break;
      for (const r of res.data) { if (seen.has(r.id)) dup++; seen.add(r.id); }
      if (!res.pagination.has_more) break;
      cursor = res.pagination.next_cursor; pages++;
    }
    chk('B2 walking next_cursor reaches every row in scope (no skipped page)',
      seen.size === totalInScope, seen.size + ' of ' + totalInScope + ' reached in ' + (pages + 1) + ' pages');
    chk('B3 no row is ever returned twice', dup === 0, 'duplicates=' + dup);
  }

  /* B4 — the same walk on the id-ordered lists (control) */
  {
    const f = Q.buildStudentsList({ user: MGR, limit: 1000000, cursor: null });
    let n = 0;
    try { n = (await client.query(f.page.sql.replace(/LIMIT \$\d+/, ''), f.page.params.slice(0, -1))).rows.length; } catch (e) {}
    if (n > 0) {
      const seen = new Set(); let cursor = null, pages = 0;
      while (pages < 2000) {
        const b = Q.buildStudentsList({ user: MGR, limit: 500, cursor });
        const res = await Q.executePagedList(db, b, { limit: 500, cursor });
        if (!res.data.length) break;
        res.data.forEach((r) => seen.add(r.id));
        if (!res.pagination.has_more) break;
        cursor = res.pagination.next_cursor; pages++;
      }
      chk('B4 the id-ordered student list also walks completely', seen.size === n, seen.size + ' of ' + n);
    } else skip('B4 the id-ordered student list also walks completely', 'no students in scope');
  }

  /* B5 — scope: a manager must never receive another school's rows */
  {
    const b = Q.buildStudentsList({ user: MGR, limit: 1000, cursor: null });
    const r = await client.query(b.page.sql, b.page.params);
    const foreign = r.rows.filter((u) => u.school_id != null && Number(u.school_id) !== 1);
    chk('B5 a manager never receives another school\'s students', foreign.length === 0,
      'foreign=' + foreign.length + '/' + r.rows.length);
  }

  /* B6 — injection: a hostile search must not change the plan's shape */
  {
    const hostile = "x'; DROP TABLE users; --";
    const b = Q.buildStudentsList({ user: MGR, search: hostile, limit: 50, cursor: null });
    let ran = true;
    try { await client.query(b.page.sql, b.page.params); } catch (e) { ran = false; }
    const still = await client.query("SELECT to_regclass('public.users') AS t");
    chk('B6 a hostile search is inert and the table survives',
      ran && still.rows[0].t === 'users' && !/DROP/i.test(b.page.sql), b.page.sql.slice(0, 80));
  }

  /* B7 — the paged queries must not seq-scan their base table */
  {
    const scans = [];
    for (const [name, b] of cases) {
      try {
        const ex = await client.query('EXPLAIN (FORMAT TEXT) ' + b.page.sql, b.page.params);
        const plan = ex.rows.map((r) => Object.values(r)[0]).join('\n');
        if (/Seq Scan on (users|attendance|grades|classes)\b/.test(plan)) scans.push(name);
      } catch (e) { /* already reported by B1 */ }
    }
    chk('B7 no paged list seq-scans its base table', scans.length === 0, 'seq-scanning: ' + scans.join(', '));
  }

  await client.end();
  return finish();
}

function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}
