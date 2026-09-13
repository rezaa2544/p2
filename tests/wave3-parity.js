#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave3-parity.js — Wave 3: گیتِ برابریِ فیلد‌به‌فیلدِ مسیرِ JS و مسیرِ SQL
   ───────────────────────────────────────────────────────────────────
   قیدِ سرخِ بازِ docs/WAVE3_QUERY_PERFORMANCE.md §۴:
     «گیتِ برابریِ بایت‌به‌بایتِ مسیرِ JS و مسیرِ SQL — اجرای هم‌زمانِ هر دو
      روی یک ورودی و مقایسهٔ خروجی.»

   روش: یک store حافظه‌ای از همان ردیف‌های PostgreSQL ساخته می‌شود؛ بعد هر
   route-handler واقعی (server/routes/*.js) دو بار صدا می‌خورَد:
     - یک‌بار با db=null            → مسیرِ JS (load→filterReadable→sort→paginate)
     - یک‌بار با db={isPostgres:✓}  → مسیرِ SQL (dbquery builders روی PG زنده)
   و خروجی‌ها فیلد‌به‌فیلد (id، ترتیب، فیلدهای غنی‌سازی، pagination) مقایسه
   می‌شوند — از جمله در پیمایشِ چندصفحه‌ای با next_cursor.

   بدون DATABASE_URL: self-skip (مثل بخشِ B سوئیت wave3-query3) تا CI بدونِ
   دیتابیس قرمز نشود؛ با DATABASE_URL گیت واقعی است.

   اجرا:
     DATABASE_URL=postgres://user:pass@127.0.0.1:5432/payesh node tests/wave3-parity.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }
function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}

console.log('\n▸ Wave 3 — JS↔SQL parity gate (فیلد‌به‌فیلد، روی PG زنده)');

if (!process.env.DATABASE_URL) { skip('parity gate', 'DATABASE_URL is not set'); finish(); }
let pg;
try { pg = require('pg'); } catch (e) { skip('parity gate', 'the pg driver is not installed'); finish(); }

/* فیلدهایی که دو مسیر *به‌حق* متفاوت می‌سازند و از مقایسه کنار می‌روند:
   - total: مسیرِ JS طولِ آرایهٔ فیلترشده را می‌دهد؛ SQL یک COUNT جدا (هر دو
     درست‌اند ولی در walk صفحهٔ n>1 مسیرِ JS totalِ pre-filter را ندارد؟ —
     نه: هر دو total کل را می‌دهند؛ total را مقایسه می‌کنیم.)
   - هیچ. مقایسه کامل است؛ نرمال‌سازی فقط نوع (string/number) و null/undefined. */
function normVal(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && String(Number(v)) === v) return Number(v);
  return v;
}
function normRow(r) {
  const out = {};
  for (const k of Object.keys(r).sort()) out[k] = normVal(r[k]);
  return out;
}
function diffRows(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  const all = new Set([...ka, ...kb]);
  const d = [];
  for (const k of all) {
    const va = JSON.stringify(a[k] === undefined ? null : a[k]);
    const vb = JSON.stringify(b[k] === undefined ? null : b[k]);
    if (va !== vb) d.push(k + ': js=' + va + ' sql=' + vb);
  }
  return d;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try { await client.connect(); }
  catch (e) { skip('parity gate', 'cannot connect: ' + e.message.split('\n')[0]); return finish(); }

  /* ── store حافظه‌ای از همان ردیف‌های PG (تا دو مسیر یک جهان را ببینند) ── */
  const store = {};
  for (const coll of ['users', 'classes', 'enrollments', 'attendance', 'grades',
    'subjects', 'schools', 'offices', 'schedule', 'parent_links']) {
    try {
      const r = await client.query(`SELECT * FROM "${coll}"`);
      store[coll] = r.rows;
    } catch (e) { store[coll] = []; }
  }
  console.log('  store loaded: users=' + store.users.length + ' attendance=' + store.attendance.length
    + ' grades=' + store.grades.length + ' classes=' + store.classes.length);

  const liveDb = { query: (s, p) => client.query(s, p), isPostgres: () => true };
  const deadDb = null; /* مسیرِ JS */

  const noop = () => {};
  const mkCtx = (db) => ({ store, db, audit: noop, markDirty: noop, ids: { nextId: async () => 1 }, deleter: {} });

  const { createStudentRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'students.js'));
  const { createAttendanceRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'attendance.js'));
  const { createGradeRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'grades.js'));
  const { createClassRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'classes.js'));
  const { createUserRoutes } = require(path.join(__dirname, '..', 'server', 'routes', 'users.js'));

  const js = {
    students: createStudentRoutes(mkCtx(deadDb)).getStudentsList,
    attendance: createAttendanceRoutes(mkCtx(deadDb)).getAttendanceList,
    grades: createGradeRoutes(mkCtx(deadDb)).getGradesList,
    classes: createClassRoutes(mkCtx(deadDb)).getClassesList,
    users: createUserRoutes(mkCtx(deadDb)).getUsersList
  };
  const sql = {
    students: createStudentRoutes(mkCtx(liveDb)).getStudentsList,
    attendance: createAttendanceRoutes(mkCtx(liveDb)).getAttendanceList,
    grades: createGradeRoutes(mkCtx(liveDb)).getGradesList,
    classes: createClassRoutes(mkCtx(liveDb)).getClassesList,
    users: createUserRoutes(mkCtx(liveDb)).getUsersList
  };

  /* کاربرها از دادهٔ واقعی — تا سناریو مصنوعی نباشد */
  const manager = store.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const teacher = store.users.find((u) => u.role === 'teacher' && u.school_id === 1);
  const student = store.users.find((u) => u.role === 'student' && u.school_id === 1);
  const superadmin = store.users.find((u) => u.role === 'superadmin') || { id: 999901, role: 'superadmin', school_id: null };
  const someClass = store.classes.find((c) => c.school_id === 1);

  const U = (obj) => ({ get: (k) => (obj[k] == null ? null : String(obj[k])) });

  /* یک اجرا: هر دو مسیر روی یک ورودی؛ برابریِ فیلد‌به‌فیلد */
  async function parity(name, coll, user, params) {
    let a, b;
    try { a = await js[coll]({ user }, U(params)); } catch (e) { chk(name, false, 'JS threw: ' + e.message); return null; }
    try { b = await sql[coll]({ user }, U(params)); } catch (e) { chk(name, false, 'SQL threw: ' + e.message); return null; }
    const ja = a.data.map(normRow), jb = b.data.map(normRow);

    if (ja.length !== jb.length) { chk(name, false, 'row count js=' + ja.length + ' sql=' + jb.length); return { a, b }; }
    for (let i = 0; i < ja.length; i++) {
      const d = diffRows(ja[i], jb[i]);
      if (d.length) { chk(name, false, 'row[' + i + '] (id=' + ja[i].id + '): ' + d.slice(0, 4).join(' | ')); return { a, b }; }
    }
    const pa = a.pagination, pb = b.pagination;
    const pd = [];
    for (const k of ['limit', 'has_more', 'next_cursor', 'count', 'total']) {
      if (String(pa[k]) !== String(pb[k])) pd.push(k + ': js=' + pa[k] + ' sql=' + pb[k]);
    }
    if (pd.length) { chk(name, false, 'pagination: ' + pd.join(' | ')); return { a, b }; }
    chk(name + ' (' + ja.length + ' ردیف)', true);
    return { a, b };
  }

  /* ── صفحهٔ اول، نقش‌ها و فیلترهای مختلف ── */
  await parity('students / مدیر', 'students', manager, { limit: '50' });
  await parity('students / مدیر + class_id', 'students', manager, { limit: '50', class_id: String(someClass.id) });
  await parity('students / مدیر + جست‌وجو', 'students', manager, { limit: '50', q: 'دانش' });
  await parity('students / سوپرادمین', 'students', superadmin, { limit: '50' });
  await parity('attendance / مدیر', 'attendance', manager, { limit: '50' });
  await parity('attendance / مدیر + date', 'attendance', manager, { limit: '50', date: (store.attendance[0] || {}).date });
  await parity('attendance / دبیر', 'attendance', teacher, { limit: '50' });
  await parity('attendance / دانش‌آموز', 'attendance', student, { limit: '50' });
  await parity('grades / مدیر', 'grades', manager, { limit: '50' });
  await parity('grades / مدیر + subject', 'grades', manager, { limit: '50', subject_id: '1' });
  await parity('grades / دانش‌آموز', 'grades', student, { limit: '50' });
  await parity('classes / مدیر', 'classes', manager, { limit: '50' });
  await parity('classes / مدیر + grade', 'classes', manager, { limit: '50', grade: String(someClass.grade) });
  await parity('users / مدیر', 'users', manager, { limit: '50' });
  await parity('users / مدیر + role', 'users', manager, { limit: '50', role: 'teacher' });
  await parity('users / مدیر + جست‌وجو', 'users', manager, { limit: '50', q: 'بالک' });

  /* ── پیمایشِ چندصفحه‌ای: کرسرِ هر مسیر به خودش برمی‌گردد و مجموعه‌ها یکی‌اند ── */
  async function walkParity(name, coll, user, params, maxPages) {
    const idsA = [], idsB = [];
    let curA = null, curB = null;
    for (let p = 0; p < maxPages; p++) {
      const qa = Object.assign({}, params); if (curA) qa.cursor = curA;
      const qb = Object.assign({}, params); if (curB) qb.cursor = curB;
      const ra = await js[coll]({ user }, U(qa));
      const rb = await sql[coll]({ user }, U(qb));
      ra.data.forEach((r) => idsA.push(r.id));
      rb.data.forEach((r) => idsB.push(r.id));
      /* هم‌قدم: هر صفحه هم باید برابر باشد */
      if (JSON.stringify(ra.data.map((r) => r.id)) !== JSON.stringify(rb.data.map((r) => r.id))) {
        chk(name, false, 'page ' + p + ' id order diverged');
        return;
      }
      if (!ra.pagination.has_more && !rb.pagination.has_more) break;
      if (ra.pagination.has_more !== rb.pagination.has_more) {
        chk(name, false, 'has_more diverged at page ' + p + ' js=' + ra.pagination.has_more + ' sql=' + rb.pagination.has_more);
        return;
      }
      curA = ra.pagination.next_cursor; curB = rb.pagination.next_cursor;
    }
    chk(name + ' (' + idsA.length + ' ردیف در پیمایش)',
      JSON.stringify(idsA) === JSON.stringify(idsB),
      'set sizes js=' + idsA.length + ' sql=' + idsB.length);
  }

  await walkParity('walk: attendance / مدیر (کرسر مرکب date|id)', 'attendance', manager, { limit: '200' }, 100);
  await walkParity('walk: grades / مدیر (id DESC)', 'grades', manager, { limit: '200' }, 100);
  await walkParity('walk: students / مدیر (id ASC)', 'students', manager, { limit: '100' }, 50);
  await walkParity('walk: users / مدیر', 'users', manager, { limit: '200' }, 100);

  await client.end();
  finish();
}

main().catch((e) => { console.error('parity gate crashed:', e); process.exit(1); });
