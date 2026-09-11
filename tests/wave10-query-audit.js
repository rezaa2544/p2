#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave10-query-audit.js — Query audit for the delta/read paths
   (Delta Hardening Phase 2 gate)
   ─────────────────────────────────────────────────────────────────
   Audits every SQL surface the delta pull and the paged REST reads go
   through, so a future edit cannot quietly un-parameterize a query:

     QA1  allowlist: syncdelta tables == pull's ALL_COLLECTIONS set (no orphans)
     QA2  deltaRowsSql binds `since` ($1) — no ISO literal baked into SQL
     QA3  deltaRowsSql keyset continuation binds (lastUpdatedAt, lastId)
     QA4  deltaKeysetSql binds since + after + LIMIT limit+1
     QA5  tombstonesSql binds since + schoolId (tenant filter is a parameter)
     QA6  hostile identifiers rejected by every builder (injection allowlist)
     QA7  stable ORDER BY (updated_at, id) for every allowlisted table
     QA8  dbquery students: hostile search lands in params, not SQL
     QA9  dbquery users: same for the users-list search
     QA10 dbquery attendance: composite "date|id" cursor + legacy numeric degrade
     QA11 dbquery grades/classes: cursor predicates are parameterized
     QA12 page LIMIT is always limit+1 as a bound parameter (no OFFSET)
     QA13 pull.js source audit: DB reads go only through builder SQL
          (no string-concatenated SQL; cursor/since never interpolated)
     QA14 syncdelta SQL contains no user-controlled table interpolation
          outside the allowlist (source audit)

   Run: node tests/wave10-query-audit.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { deltaRowsSql, deltaKeysetSql, tombstonesSql, tableName } = require(path.join(ROOT, 'server', 'syncdelta'));
const dq = require(path.join(ROOT, 'server', 'dbquery'));

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }

const SINCE = '2026-09-08T10:00:00.000Z';
const HOSTILE = [
  'users; DROP TABLE x', "grades' OR '1'='1", 'grades --', 'grades; TRUNCATE schools',
  'grades UNION SELECT * FROM users', ''
];
const PULL_TABLES = [
  'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'hw_assignments', 'hw_submissions', 'vclass_sessions',
  'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
];

(async () => {
  console.log('Wave 10 — ممیزیِ کوئری‌های مسیرِ دلتا/خواندن');

  group('A. allowlist و پارامتری‌بودنِ builderهای دلتا');

  await test('QA1 جدول‌های syncdelta == مجموعه‌های pull (بدون یتیم)', async () => {
    for (const t of PULL_TABLES) {
      let ok = false;
      try { ok = tableName(t) === t; } catch (e) { ok = false; }
      assert(ok, 'pull table not allowlisted in syncdelta: ' + t);
    }
  });

  await test('QA2 deltaRowsSql: since به‌صورت $1 بسته می‌شود (نه literal)', async () => {
    for (const t of PULL_TABLES) {
      const b = deltaRowsSql(t, { sinceISO: SINCE });
      assert(b.params[0] === SINCE, t + ': since not bound first');
      assert(b.sql.indexOf(SINCE) === -1, t + ': since leaked as literal into SQL');
      assert(/\$1/.test(b.sql), t + ': $1 placeholder present');
    }
  });

  await test('QA3 deltaRowsSql: ادامهٔ keyset پارامتری است', async () => {
    const b = deltaRowsSql('grades', { sinceISO: SINCE, lastUpdatedAt: SINCE, lastId: 42 });
    assert(b.params.indexOf(42) > -1, 'lastId bound');
    assert(b.sql.indexOf('42') === -1 || !/[^$]42/.test(b.sql.replace('$42', '')), 'lastId leaked as literal');
    assert(b.params.indexOf(SINCE) > -1, 'lastUpdatedAt bound');
  });

  await test('QA4 deltaKeysetSql: since+after+LIMIT همه بسته', async () => {
    const b = deltaKeysetSql('grades', { sinceISO: SINCE, afterUpdatedAt: SINCE, afterId: 7, limit: 50 });
    assert(b.params[0] === SINCE && b.params.indexOf(SINCE, 1) > -1, 'since and after bound');
    assert(b.params.indexOf(7) > -1, 'afterId bound');
    assert(b.params[b.params.length - 1] === 51, 'LIMIT must be bound as limit+1 (51), got ' + b.params[b.params.length - 1]);
    assert(/LIMIT \$\d+$/.test(b.sql), 'LIMIT as placeholder');
  });

  await test('QA5 tombstonesSql: فیلترِ مدرسه پارامتری است', async () => {
    const b = tombstonesSql({ sinceISO: SINCE, schoolId: 3 });
    assert(b.params[0] === SINCE, 'since bound');
    assert(b.params.indexOf(3) > -1, 'schoolId bound');
    assert(b.sql.indexOf('school_id = $') > -1, 'school filter parameterized');
  });

  await test('QA6 شناسه‌های خصمانه توسط همهٔ builderها رد می‌شوند', async () => {
    for (const h of HOSTILE) {
      let threw = false;
      try { deltaRowsSql(h, { sinceISO: SINCE }); } catch (e) { threw = true; }
      assert(threw, 'deltaRowsSql must reject: ' + JSON.stringify(h));
      threw = false;
      try { deltaKeysetSql(h, { sinceISO: SINCE }); } catch (e) { threw = true; }
      assert(threw, 'deltaKeysetSql must reject: ' + JSON.stringify(h));
    }
  });

  await test('QA7 ترتیبِ پایدار (updated_at, id) روی همهٔ جدول‌ها', async () => {
    for (const t of PULL_TABLES) {
      const b = deltaRowsSql(t, { sinceISO: SINCE });
      assert(/ORDER BY updated_at ASC, id ASC$/.test(b.sql), t + ': unstable order — ' + b.sql.slice(-40));
    }
    const k = deltaKeysetSql('grades', { sinceISO: SINCE });
    assert(/ORDER BY updated_at ASC, id ASC LIMIT/.test(k.sql), 'keyset unstable order');
    const ts = tombstonesSql({ sinceISO: SINCE });
    assert(/ORDER BY deleted_at ASC, id ASC$/.test(ts.sql), 'tombstones unstable order');
  });

  group('B. builderهای لیستِ صفحه‌بندی‌شده (dbquery)');

  const mgr = { id: 5, role: 'manager', school_id: 1 };

  await test('QA8 students: جست‌وجوی خصمانه در params می‌رود نه در SQL', async () => {
    const evil = "'; DROP TABLE users; --";
    const b = dq.buildStudentsList({ user: mgr, search: evil, limit: 25 });
    assert(b.page.params.indexOf('%' + evil + '%') > -1, 'search must be bound as param');
    assert(b.page.sql.indexOf(evil) === -1, 'search leaked into SQL');
    assert(b.count.sql.indexOf(evil) === -1, 'search leaked into COUNT');
  });

  await test('QA9 users: جست‌وجوی خصمانه پارامتری است', async () => {
    const evil = "x' OR '1'='1";
    const b = dq.buildUsersList({ user: mgr, search: evil, limit: 25 });
    assert(b.page.params.indexOf('%' + evil + '%') > -1, 'bound');
    assert(b.page.sql.indexOf(evil) === -1 && b.count.sql.indexOf(evil) === -1, 'leaked');
  });

  await test('QA10 attendance: کرسرِ مرکب date|id + تنزلِ عددیِ legacy', async () => {
    const b = dq.buildAttendanceList({ user: mgr, date: '2026-09-08', limit: 25, cursor: '2026-09-08|77' });
    assert(b.page.params.indexOf('2026-09-08') > -1 && b.page.params.indexOf(77) > -1, 'composite cursor parts bound');
    const legacy = dq.buildAttendanceList({ user: mgr, date: '2026-09-08', limit: 25, cursor: '77' });
    assert(legacy.page.params.indexOf(77) > -1, 'legacy numeric cursor bound');
  });

  await test('QA11 grades/classes: پرادیکتِ کرسر پارامتری است', async () => {
    const g = dq.buildGradesList({ user: mgr, limit: 25, cursor: 500 });
    assert(g.page.params.indexOf(500) > -1, 'grades cursor bound');
    assert(g.page.sql.indexOf(' 500') === -1, 'grades cursor leaked');
    const c = dq.buildClassesList({ user: mgr, limit: 25, cursor: 9 });
    assert(c.page.params.indexOf(9) > -1, 'classes cursor bound');
  });

  await test('QA12 صفحه همیشه LIMIT limit+1 بسته دارد (بدون OFFSET)', async () => {
    for (const b of [
      dq.buildStudentsList({ user: mgr, limit: 25 }),
      dq.buildAttendanceList({ user: mgr, date: '2026-09-08', limit: 25 }),
      dq.buildGradesList({ user: mgr, limit: 25 }),
      dq.buildClassesList({ user: mgr, limit: 25 }),
      dq.buildUsersList({ user: mgr, limit: 25 })
    ]) {
      assert(/LIMIT \$\d+$/.test(b.page.sql), 'LIMIT placeholder missing: ' + b.page.sql.slice(-30));
      assert(b.page.params[b.page.params.length - 1] === 26, 'LIMIT must be 25+1');
      assert(b.page.sql.indexOf('OFFSET') === -1, 'no OFFSET allowed');
    }
  });

  group('C. ممیزیِ منبعِ pull.js — مسیرِ DB فقط از builder');

  await test('QA13 pull.js: SQL دست‌ساز/الحاقی وجود ندارد؛ cursor/since فقط پارامتر', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'pull.js'), 'utf8');
    /* fetchDeltaRows must use the builder output verbatim */
    assert(/const built = deltaRowsSql\(c, \{ sinceISO \}\);/.test(src), 'delta fetch must come from deltaRowsSql');
    assert(/db\.query\(built\.sql, built\.params\)/.test(src), 'db.query must take builder sql+params');
    /* no string-built SQL anywhere in pull.js */
    const suspicious = src.match(/db\.query\((?!built)[^)]*['"`]/g) || [];
    assert(suspicious.length === 0, 'non-builder db.query calls: ' + JSON.stringify(suspicious));
    /* the authenticated cursor payload.since only flows via query.since → builder param */
    assert(src.indexOf('query.since = v.payload.since;') > -1, 'cursor since must replace the query param (bound downstream)');
  });

  await test('QA14 syncdelta: الحاقِ جدول فقط از allowlist (منبع)', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'syncdelta.js'), 'utf8');
    /* tableName() is the single gate; FROM clauses use its result only */
    assert(/function tableName\(t\)/.test(src), 'allowlist gate missing');
    assert(/ALLOWED\.has\(t\)/.test(src), 'allowlist membership check missing');
    const fromClauses = src.match(/FROM \\"?\$\{?\s*t\b/g) || src.match(/FROM "\$\{t\}"/g) || [];
    assert(fromClauses.length > 0, 'table interpolation sites present');
    /* every FROM interpolation must be the gated t (never a raw argument) */
    const rawInterp = src.match(/FROM "[a-z_]*"\s*\+\s*/g) || [];
    assert(rawInterp.length === 0, 'raw concatenation into FROM');
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave10 Query Audit: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (fail) process.exit(1);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
