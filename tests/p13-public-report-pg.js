/* ─────────────────────────────────────────────────────────────
   p13-public-report-pg.js — P1-3 (Wave 18 §۵-۸):
   تجمیعِ گزارشِ عمومی سمتِ PostgreSQL (public-report-sql.js)
   ─────────────────────────────────────────────────────────────
   یافتهٔ §۵-۸: public-report از آینهٔ درون‌حافظه‌ای محاسبه می‌شد؛ با
   هیدراتاسیونِ مقیّد = «تقریبِ نمونهٔ محدود». این تست قفل می‌کند:

   T1  هم‌ارزیِ دقیق (parity) مسیرِ PG با هستهٔ حافظه (computePublicReport)
       روی یک seed مشترک — شامل نقش‌ها، کلاس‌ها، جلسات (type غایب ⇒ assoc،
       archived حذف، MAX(meeting_date))، شهر (LEFT JOIN counties) و goals
   T2  parity برای sid دوم / نامعتبر (→ اولین مدرسهٔ فعال) / null
   T3  endpoint با آینهٔ خالی و PG پر ⇒ پاسخ از PG (نه اسکنِ آینه)
   T4  خطای PG ⇒ 503 صادقانه (public_report_pg_failed)، نه عددِ تقریبی
   T5  هیچ مدرسهٔ فعال ⇒ 200 با {schools:[], report:null}
   T6  کلید assoc همیشه حاضر است (نوبتِ اول اگر غایب)

   جهش‌ها (اجرای مستقیم این فایل با env P13_MUTATE=<id>):
   M1 حذف «active IS TRUE» از فهرستِ مدارس      M2 حذف شرطِ نه‌آرشیو
   M3 حذف scope مدرسه از شمارشِ نقش‌ها           M4 دورزدنِ مسیر PG در endpoint

   اجرا: node tests/p13-public-report-pg.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

/* جهش‌کشی (الگوی امن p06): هر دو فایلِ درگیر به نسخهٔ کپی می‌روند و
   public-report کپی‌شده به public-report-sql کپی‌شده require می‌کند؛
   در exit حذف می‌شوند و سورسِ تولید هرگز نوشته نمی‌شود. */
const MUT = process.env.P13_MUTATE || '';
const mutatedReport = path.join(__dirname, '..', 'server', 'public-report.p13-mutated.js');
const mutatedSql = path.join(__dirname, '..', 'server', 'public-report-sql.p13-mutated.js');
if (MUT) {
  const realReport = fs.readFileSync(path.join(__dirname, '..', 'server', 'public-report.js'), 'utf8');
  const realSql = fs.readFileSync(path.join(__dirname, '..', 'server', 'public-report-sql.js'), 'utf8');
  const muts = {
    M1: [/WHERE active IS TRUE ORDER BY id/, 'ORDER BY id'],
    M2: [/ AND \(archived IS NULL OR archived = ''\) /, ' '],
    M3: [/WHERE school_id = \$1 AND role IN \('student', 'teacher'\)/, "WHERE role IN ('student', 'teacher')"],
    M4: [/if\(db && typeof db\.isPostgres === 'function' && db\.isPostgres\(\)\)\{/, 'if(false){'],
  };
  if (!muts[MUT]) { console.error('جهش ناشناخته: ' + MUT); process.exit(2); }
  const whichFile = (MUT === 'M4') ? 'report' : 'sql';
  let sqlOut = realSql, repOut = realReport;
  if (whichFile === 'sql') sqlOut = realSql.replace(muts[MUT][0], muts[MUT][1]);
  else repOut = realReport.replace(muts[MUT][0], muts[MUT][1]);
  /* کپیِ report همیشه به کپیِ sql اشاره می‌کند تا زنجیرهٔ require یکدست بماند */
  repOut = repOut.replace("require('./public-report-sql')", "require('./public-report-sql.p13-mutated')");
  fs.writeFileSync(mutatedSql, sqlOut);
  fs.writeFileSync(mutatedReport, repOut);
  process.on('exit', () => {
    try { fs.unlinkSync(mutatedReport); } catch (_) {}
    try { fs.unlinkSync(mutatedSql); } catch (_) {}
  });
}

const { newDb } = require('pg-mem');
const db = require('../server/db.js');
const { computePublicReport } = require('../server/public-report-core.js');
const { publicReportFromPg } = require(MUT ? mutatedSql : '../server/public-report-sql.js');
const { createPublicReport } = require(MUT ? mutatedReport : '../server/public-report.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
async function quiet(fn) {
  const e0 = console.error; console.error = () => {};
  try { return await fn(); } finally { console.error = e0; }
}

(async () => {
  console.log('\n▸ P1-3 — تجمیعِ گزارشِ عمومی سمتِ PG (Wave 18 §۵-۸)');

  /* ── PG مشترک (pg-mem) ── */
  const pg = newDb();
  const { Pool } = pg.adapters.createPg();
  const pool = new Pool();
  await pool.query('CREATE TABLE schools (id INTEGER PRIMARY KEY, name TEXT, level TEXT, city TEXT, county_id INTEGER, active BOOLEAN, public_goals TEXT, boom_goals TEXT)');
  await pool.query('CREATE TABLE counties (id INTEGER PRIMARY KEY, name TEXT)');
  await pool.query('CREATE TABLE users (id INTEGER PRIMARY KEY, school_id INTEGER, role TEXT)');
  await pool.query('CREATE TABLE classes (id INTEGER PRIMARY KEY, school_id INTEGER)');
  await pool.query('CREATE TABLE assoc_minutes (id INTEGER PRIMARY KEY, school_id INTEGER, meeting_type TEXT, meeting_date TEXT, archived TEXT)');
  db.__setPoolForTests(pool);

  /* ── seed مشترک: PG و آینه از یک منبع ── */
  const counties = [
    { id: 10, name: 'شهر-الف' },
    { id: 11, name: 'شهر-ب' }
  ];
  const schools = [
    { id: 1, name: 'مدرسه-۱', level: 'متوسطه', city: null, county_id: 10, active: true,  public_goals: '1', boom_goals: '  اهدافِ مدرسهٔ یک  ' },
    { id: 2, name: 'مدرسه-۲', level: 'ابتدایی', city: null, county_id: 11, active: true,  public_goals: '0', boom_goals: 'نمی‌آید' },
    { id: 3, name: 'بسته',    level: '',        city: null, county_id: null, active: false, public_goals: '1', boom_goals: 'نمی‌آید' }
  ];
  const users = [
    { id: 101, school_id: 1, role: 'student' }, { id: 102, school_id: 1, role: 'student' },
    { id: 103, school_id: 1, role: 'student' }, { id: 104, school_id: 1, role: 'teacher' },
    { id: 105, school_id: 1, role: 'teacher' }, { id: 106, school_id: 1, role: 'manager' },
    { id: 201, school_id: 2, role: 'student' }, { id: 202, school_id: 2, role: 'student' },
    { id: 203, school_id: 2, role: 'student' }, { id: 204, school_id: 2, role: 'student' },
    { id: 205, school_id: 2, role: 'student' }, { id: 206, school_id: 2, role: 'teacher' }
  ];
  const classes = [
    { id: 301, school_id: 1 }, { id: 302, school_id: 1 }, { id: 303, school_id: 2 }
  ];
  const mins = [
    { id: 1, school_id: 1, meeting_type: 'assoc',   meeting_date: '1400-01-02', archived: null },
    { id: 2, school_id: 1, meeting_type: 'assoc',   meeting_date: '1400-02-03', archived: '' },
    { id: 3, school_id: 1, meeting_type: 'council', meeting_date: '1400-01-15', archived: null },
    { id: 4, school_id: 1, meeting_type: null,      meeting_date: '1399-12-10', archived: null },
    { id: 5, school_id: 1, meeting_type: 'council', meeting_date: '1400-05-01', archived: '1' },
    { id: 6, school_id: 2, meeting_type: 'council', meeting_date: '1400-03-01', archived: null }
  ];
  for (const c of counties) await pool.query('INSERT INTO counties (id, name) VALUES ($1, $2)', [c.id, c.name]);
  for (const s of schools) await pool.query('INSERT INTO schools (id, name, level, city, county_id, active, public_goals, boom_goals) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [s.id, s.name, s.level, s.city, s.county_id, s.active, s.public_goals, s.boom_goals]);
  for (const u of users) await pool.query('INSERT INTO users (id, school_id, role) VALUES ($1,$2,$3)', [u.id, u.school_id, u.role]);
  for (const c of classes) await pool.query('INSERT INTO classes (id, school_id) VALUES ($1,$2)', [c.id, c.school_id]);
  for (const m of mins) await pool.query('INSERT INTO assoc_minutes (id, school_id, meeting_type, meeting_date, archived) VALUES ($1,$2,$3,$4,$5)',
    [m.id, m.school_id, m.meeting_type, m.meeting_date, m.archived]);

  const mirror = { counties, schools, users, classes, assoc_minutes: mins };

  /* ── T1/T2: parity دقیق دو مسیر ── */
  for (const sid of [1, 2, 999, null]) {
    const fromCore = computePublicReport(mirror, sid);
    const fromSql = await quiet(() => publicReportFromPg(db, sid));
    chk('T parity sid=' + JSON.stringify(sid) + ' — مسیرِ PG عینِ هستهٔ حافظه',
      JSON.stringify(fromCore) === JSON.stringify(fromSql),
      '\n    core=' + JSON.stringify(fromCore).slice(0, 220) + '\n    sql =' + JSON.stringify(fromSql).slice(0, 220));
  }
  const r1 = await publicReportFromPg(db, 1);
  chk('T1 ادعاهای محتوایی sid=1: نقش‌ها/کلاس‌ها/جلسات/شهر/goals',
    r1.report.students === 3 && r1.report.teachers === 2 && r1.report.classes === 2
    && r1.report.city === 'شهر-الف' && r1.report.goals === 'اهدافِ مدرسهٔ یک'
    && r1.schools.length === 2 && r1.report.meetings.length === 2
    && r1.report.meetings[0].key === 'assoc' && r1.report.meetings[0].n === 3
    && r1.report.meetings[0].last === '1400-02-03'
    && r1.report.meetings[1].key === 'council' && r1.report.meetings[1].n === 1
    && r1.report.meetings[1].last === '1400-01-15',
    JSON.stringify(r1.report));

  /* ── T3: endpoint با آینهٔ خالی و PG پر ⇒ پاسخ از PG ── */
  const capture = (res) => { const r = {}; sendJsonTo(r, res); return r; };
  function sendJsonTo(holder, res) {
    holder.end = (code, body) => { res._cap = { code, body }; };
  }
  const emptyMirror = { counties: [], schools: [], users: [], classes: [], assoc_minutes: [] };
  const pub = createPublicReport({ store: emptyMirror, db, sendJson: (res, code, body) => { res._cap = { code, body }; }, workers: null });
  const res3 = {};
  await pub.apiPublicReport({ url: '/api/public-report?school_id=2' }, res3);
  chk('T3 endpoint روی آینهٔ خالی: پاسخ از PG آمد (نه اسکنِ آینه)',
    res3._cap.code === 200 && res3._cap.body.ok === true
    && res3._cap.body.schools.length === 2
    && res3._cap.body.report.sid === 2 && res3._cap.body.report.students === 5,
    JSON.stringify(res3._cap.body).slice(0, 200));
  const mt6 = (res3._cap.body && res3._cap.body.report && res3._cap.body.report.meetings) || [];
  chk('T6 کلیدِ assoc همیشه حاضر (مدرسهٔ ۲ فقط council دارد ⇒ assoc با n=0 اولِ لیست)',
    mt6.length === 2
    && mt6[0].key === 'assoc' && mt6[0].n === 0
    && mt6[1].key === 'council' && mt6[1].n === 1,
    JSON.stringify(mt6));

  /* ── T4: خطای PG ⇒ 503 صادقانه ── */
  const origQuery = pool.query.bind(pool);
  let pgDown = false;
  pool.query = (...args) => (pgDown ? Promise.reject(new Error('pg down (p13)')) : origQuery(...args));
  pgDown = true;
  const res4 = {};
  await quiet(() => pub.apiPublicReport({ url: '/api/public-report' }, res4));
  pgDown = false;
  pool.query = origQuery;
  chk('T4 خطای PG: 503 + public_report_pg_failed (نه عددِ تقریبیِ آینهٔ مقیّد)',
    res4._cap.code === 503 && res4._cap.body.code === 'public_report_pg_failed',
    'code=' + res4._cap.code + ' body=' + JSON.stringify(res4._cap.body).slice(0, 100));

  /* ── T5: هیچ مدرسهٔ فعال ⇒ 200 با ساختارِ خالی ── */
  await pool.query('UPDATE schools SET active = FALSE');
  const res5 = {};
  await pub.apiPublicReport({ url: '/api/public-report' }, res5);
  await pool.query('UPDATE schools SET active = TRUE WHERE id <> 3');
  chk('T5 هیچ مدرسهٔ فعال: 200 و {schools:[], report:null}',
    res5._cap.code === 200 && res5._cap.body.ok === true
    && Array.isArray(res5._cap.body.schools) && res5._cap.body.schools.length === 0
    && res5._cap.body.report === null,
    JSON.stringify(res5._cap.body).slice(0, 100));

  console.log('────────────────────────────────────────────');
  if (failc === 0) console.log('P1-3 Public Report PG: ' + okc + '/' + (okc + failc) + ' موفق  —  بدون خطا ✅');
  else { console.log('P1-3 Public Report PG: ' + okc + ' سبز / ' + failc + ' قرمز ❌'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
