#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave23-reports-pg.js — گزارشِ حضور روی PostgreSQLِ **واقعی**

   چرا این فایل هست
   ────────────────
   سرآیندِ server/dbquery.js صریحاً ثبت کرده که سازنده‌های SQL آن هرگز روی
   یک PostgreSQLِ واقعی اجرا نشده‌اند («A live parity + authorization gate
   on real PG is MANDATORY before production»). همین تست آن قلم را برای
   مسیرِ DB-native گزارشِ حضور (موج ۲۳) می‌بندد:

   ۱) هم‌ارزی (parity): خروجیِ مسیرِ DB-native باید **بایت‌به‌بایت** همان
      خروجیِ مسیرِ حافظه باشد — روی همان داده.
   ۲) مهار اجاره‌ای: مدیر فقط مدرسهٔ خودش · نقشِ بی‌حق ۴۰۳ · سوپرادمین همه.
   ۳) صفحه‌بندی: پیمایشِ cursor همهٔ کلاس‌ها را دقیقاً یک‌بار می‌پوشاند.
   ۴) bounded: صفحه هیچ‌گاه بیش از limit ردیف نمی‌دهد.
   ۵) مسیریابیِ خواندن: کوئری‌ها از queryRead می‌روند (رپلیکای فقط‌خواندنی).
   ۶) نقشهٔ اجرا: EXPLAIN ANALYZE باید برای attendance از ایندکس استفاده کند.

   پیش‌نیاز: یک PostgreSQLِ در دسترس. اگر نبود، تست **اجرا نمی‌شود** و با
   برچسبِ صریحِ NOT-RUN و کدِ خروجِ ۳ تمام می‌شود — سبزِ جعلی نمی‌دهد.
   در محیطِ بدونِ دیتابیس با برچسبِ NOT-RUN و کدِ ۰ تمام می‌شود؛ اگر
   ‏WAVE23_REQUIRE_PG=1 باشد (کاری که run-all-tests.sh هنگامِ یافتنِ
   PostgreSQL انجام می‌دهد) کدِ خروج ۳ می‌شود، یعنی تست **الزامی** است.

   اجرا:
     DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
       node tests/wave23-reports-pg.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_DB = process.env.WAVE23_TEST_DB || 'payesh_w23_test';
const BASE_URL = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/postgres';

/* حجمِ داده: باید آن‌قدر باشد که برنامه‌ریز ایندکس را برتر بداند و
   «۱۰۰۰+ رکورد» خواسته‌شده پوشش داده شود. */
const N_ATTENDANCE = Number(process.env.WAVE23_ROWS || 36000);
const N_SCHOOLS = 20, N_CLASSES = 200, N_STUDENTS = 2000;
const JY = 1404, JM = 6;                 /* شهریور ۱۴۰۴ = ۲۰۲۵-۰۸-۲۳ … ۲۰۲۵-۰۹-۲۳ */

let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }

async function main() {
  const { Client } = require('pg');
  const rs = require(path.join(ROOT, 'server', 'reports-sql.js'));
  const { createReportsRoutes } = require(path.join(ROOT, 'server', 'routes', 'reports.js'));

  /* ── اتصال و ساختِ دیتابیسِ آزمون ─────────────────────────────── */
  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const c = new Client({ connectionString: BASE_URL.replace(/\/[^/]*$/, '/' + TEST_DB) });
  await c.connect();

  /* مهاجرت‌های واقعیِ مخزن — همان‌هایی که در تولید اعمال می‌شوند */
  const migs = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
  for (const f of migs) {
    await c.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
  }
  console.log(`  · ${migs.length} مهاجرت اعمال شد (${migs[0]} … ${migs[migs.length - 1]})`);

  /* ── دادهٔ آزمون (قطعی و بازتولیدپذیر) ─────────────────────────── */
  await c.query(`INSERT INTO schools (id, name, type, version)
                 SELECT g, 'مدرسهٔ '||g, 'governmental', 1 FROM generate_series(1,$1) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO classes (id, school_id, name, grade, version)
                 SELECT g, 1+((g-1)%$1), 'کلاس '||g, 7+((g-1)%6), 1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_CLASSES]);
  await c.query(`INSERT INTO users (id, school_id, role, full_name, version)
                 SELECT g, 1+((g-1)%$1), 'student', 'دانش‌آموز '||g, 1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_STUDENTS]);
  /* school_id همیشه از خودِ کلاس گرفته می‌شود تا داده **سازگار** باشد؛
     ناسازگاریِ عمدی در سنجهٔ W23-JOIN جداگانه سنجیده می‌شود. */
  await c.query(`INSERT INTO attendance (school_id, class_id, student_id, date, status, version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1),
                        to_char(DATE '2025-01-01' + (g%365), 'YYYY-MM-DD'),
                        /* وضعیت از هَشِ md5 می‌آید نه از g%5: الگویِ منظمِ قبلی
                           باعث می‌شد نرخِ **همهٔ** کلاس‌ها عددِ صحیح باشد و مسیرِ
                           گردکردن هرگز سنجیده نشود (جهشِ M7 همین‌جا زنده ماند). */
                        (ARRAY['present','absent','late','excused','early_exit'])[
                          1 + (('x' || substr(md5(g::text), 1, 3))::bit(12)::int % 5)], 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, N_ATTENDANCE, N_CLASSES]);
  /* رکوردهای بیرونِ ماه — باید شمرده نشوند */
  await c.query(`UPDATE attendance SET date='2020-01-05' WHERE id % 97 = 0`);
  /* یک کلاس عمداً در ماهِ خواسته‌شده هیچ حضوری ندارد (سنجهٔ صفر) */
  await c.query(`DELETE FROM attendance WHERE class_id = 3 AND date >= '2025-08-23' AND date < '2025-09-23'`);
  await c.query('ANALYZE attendance; ANALYZE classes; ANALYZE users');
  const totalRows = Number((await c.query('SELECT count(*)::int n FROM attendance')).rows[0].n);

  /* ── آینهٔ حافظه از همان داده (برای سنجشِ هم‌ارزی) ─────────────── */
  const store = { schools: [], classes: [], users: [], attendance: [] };
  store.schools = (await c.query('SELECT id, name, type FROM schools ORDER BY id')).rows
    .map((r) => ({ id: r.id, name: r.name, school_type: r.type }));
  store.classes = (await c.query('SELECT id, school_id, name, grade FROM classes ORDER BY id')).rows;
  store.users = (await c.query('SELECT id, school_id, role, full_name FROM users ORDER BY id')).rows;
  store.attendance = (await c.query('SELECT school_id, class_id, student_id, date, status FROM attendance ORDER BY id')).rows;

  /* ── دو مسیر: حافظه (بدونِ db) و DB-native (با db جعلیِ ضبط‌کننده) ── */
  const audits = [];
  const audit = (k, p) => audits.push([k, p]);
  const memRoutes = createReportsRoutes({ store, audit });
  let readCalls = 0, writeCalls = 0;
  const dbStub = {
    isPostgres: () => true,
    query: async (sql, params) => { writeCalls++; return c.query(sql, params); },
    queryRead: async (sql, params) => { readCalls++; return c.query(sql, params); }
  };
  const dbRoutes = createReportsRoutes({ store, db: dbStub, audit });

  const url = (o) => { const p = new URLSearchParams(); for (const k in o) if (o[k] != null) p.set(k, o[k]); return p; };
  const strip = (b) => { const o = Object.assign({}, b); delete o.source; delete o.pagination; return o; };

  console.log(`\n  · داده: ${totalRows} رکوردِ حضور · ${N_SCHOOLS} مدرسه · ${N_CLASSES} کلاس · ${N_STUDENTS} دانش‌آموز`);

  /* ════ ۱) هم‌ارزی ══════════════════════════════════════════════ */
  grp('W23-PARITY — هم‌ارزیِ DB-native با مسیرِ حافظه (PostgreSQL واقعی)');
  const cases = [
    { name: 'سوپرادمین، کلِ دامنه', user: { id: 9001, role: 'superadmin' }, q: { jy: JY, jm: JM } },
    { name: 'مدیرِ مدرسهٔ ۵', user: { id: 9002, role: 'manager', school_id: 5 }, q: { jy: JY, jm: JM } },
    { name: 'سوپرادمین + فیلترِ کلاس', user: { id: 9001, role: 'superadmin' }, q: { jy: JY, jm: JM, class_id: 7 } },
    { name: 'سوپرادمین، ماهِ دیگر', user: { id: 9001, role: 'superadmin' }, q: { jy: JY, jm: 1 } },
    { name: 'اسفند (سالِ کبیسهٔ شمسی)', user: { id: 9001, role: 'superadmin' }, q: { jy: 1403, jm: 12 } }
  ];
  for (const t of cases) {
    const a = await memRoutes.attendanceReport({ user: t.user }, url(t.q));
    const b = await dbRoutes.attendanceReport({ user: t.user }, url(t.q));
    const same = JSON.stringify(strip(a.body)) === JSON.stringify(strip(b.body));
    chk('هم‌ارز: ' + t.name, same && a.status === b.status,
      same ? '' : `mem=${JSON.stringify(strip(a.body)).slice(0, 200)} db=${JSON.stringify(strip(b.body)).slice(0, 200)}`);
  }
  chk('مسیرِ DB خودش را در پاسخ اعلام می‌کند',
    (await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM }))).body.source === 'postgresql');

  /* کلاسِ بدونِ حضور در ماه باید با صفر بیاید، نه اینکه حذف شود */
  const zSchool = Number((await c.query('SELECT school_id FROM classes WHERE id = 3')).rows[0].school_id);
  const zeroCase = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: zSchool }));
  const cls3 = (zeroCase.body.schools[0] || {}).classes.find((r) => Number(r.class_id) === 3);
  chk('کلاسِ بدونِ حضور در ماه با صفر می‌آید (حذف نمی‌شود)', !!cls3 && cls3.total === 0 && cls3.rate === null,
    JSON.stringify(cls3));

  /* ── تفاوتِ معناییِ ثبت‌شده میان دو مسیر ──────────────────────────
     مسیرِ حافظه رکوردِ حضور را با class_id سطل‌بندی می‌کند و **بررسی نمی‌کند**
     که school_idِ رکورد با مدرسهٔ همان کلاس یکی باشد؛ مسیرِ SQL شرطِ
     ‏`a.school_id = c.school_id` را در JOIN می‌گذارد. روی دادهٔ سازگار دو
     مسیر یکی‌اند (سنجهٔ هم‌ارزیِ بالا)؛ روی رکوردِ ناسازگار، SQL آن را
     حساب نمی‌کند. این تفاوت عمدی و سخت‌گیرانه‌تر است و این‌جا ثبت می‌شود. */
  grp('W23-JOIN — رکوردِ ناسازگار (school_id ≠ مدرسهٔ کلاس)');
  const badSchool = zSchool === 1 ? 2 : 1;
  /* رکورد می‌گوید مدرسهٔ badSchool، ولی class_id مالِ مدرسهٔ zSchool است.
     درخواست **بدونِ فیلترِ مدرسه** است تا هر دو مدرسه در دامنه باشند؛ وگرنه
     فیلترِ دامنه خودش رکورد را حذف می‌کند و تفاوت اصلاً دیده نمی‌شود
     (نخستین نسخهٔ همین سنجه این‌طور بی‌اثر بود). */
  await c.query(`INSERT INTO attendance (school_id, class_id, student_id, date, status, version)
                 VALUES ($1, 3, 1, '2025-08-25', 'present', 1)`, [badSchool]);
  store.attendance.push({ school_id: badSchool, class_id: 3, student_id: 1, date: '2025-08-25', status: 'present' });
  const memLoose = await memRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, class_id: 3 }));
  const dbStrict = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, class_id: 3 }));
  const pick = (b) => ((b.body.schools.find((s) => Number(s.school_id) === zSchool) || { classes: [] }).classes
    .find((r) => Number(r.class_id) === 3)) || {};
  const memRow = pick(memLoose);
  const dbRow = pick(dbStrict);
  chk('مسیرِ حافظه رکوردِ ناسازگار را می‌شمارد (رفتارِ موجود)', (memRow.total || 0) === 1, JSON.stringify(memRow));
  chk('مسیرِ SQL رکوردِ ناسازگار را نمی‌شمارد (سخت‌گیرانه‌تر، مستند)', (dbRow.total || 0) === 0, JSON.stringify(dbRow));
  await c.query(`DELETE FROM attendance WHERE class_id = 3 AND school_id = $1`, [badSchool]);
  store.attendance = store.attendance.filter((r) => !(Number(r.class_id) === 3 && Number(r.school_id) === badSchool));

  /* ════ ۲) مهار اجاره‌ای روی دیتابیس ════════════════════════════ */
  grp('W23-AUTHZ — مهار اجاره‌ای در SQL');
  const mgr = await dbRoutes.attendanceReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({ jy: JY, jm: JM }));
  chk('مدیر فقط مدرسهٔ خودش را می‌بیند',
    mgr.body.schools.length === 1 && Number(mgr.body.schools[0].school_id) === 5, JSON.stringify(mgr.body.schools.map((s) => s.school_id)));
  const teacher = await dbRoutes.attendanceReport({ user: { id: 3, role: 'teacher', school_id: 5 } }, url({ jy: JY, jm: JM }));
  chk('نقشِ بی‌حق ۴۰۳ می‌گیرد (fail-closed)', teacher.status === 403, 'status=' + teacher.status);
  const outsider = await dbRoutes.attendanceReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({ jy: JY, jm: JM, school_id: 6 }));
  chk('درخواستِ مدرسهٔ بیرون از دامنه ۴۰۳ است نه لیستِ خالی', outsider.status === 403, 'status=' + outsider.status);
  const noUser = await dbRoutes.attendanceReport({ user: null }, url({ jy: JY, jm: JM }));
  chk('بدونِ کاربر ۴۰۳ است', noUser.status === 403);
  const badMonth = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: 1200, jm: JM }));
  chk('سالِ نامعتبر ۴۰۰ است (نه کوئری)', badMonth.status === 400, 'status=' + badMonth.status);

  /* تزریق: پارامترِ school_id نباید از SQL بیرون بزند */
  const inj = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, class_id: "1 OR 1=1" }));
  chk('class_id تزریق‌شده ۴۰۰ می‌گیرد (نه خطای ۵۰۰ از دیتابیس)', inj.status === 400, 'status=' + inj.status);
  const inj2 = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: "1; DROP" }));
  chk('school_id تزریق‌شده ۴۰۳/۴۰۰ می‌گیرد نه خطای SQL', inj2.status === 403 || inj2.status === 400, 'status=' + inj2.status);
  const lim0 = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 99999999 }));
  const limN = lim0.body.schools.reduce((a, s) => a + s.classes.length, 0);
  chk('limit نجومی به سقف می‌چسبد', limN <= 5000, String(limN));

  /* ════ ۳) صفحه‌بندی و bounded ══════════════════════════════════ */
  grp('W23-PAGE — صفحه‌بندیِ keyset و bounded بودن');
  const all = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM }));
  const allKeys = [];
  for (const s of all.body.schools) for (const r of s.classes) allKeys.push(`${s.school_id}|${r.class_id}`);
  const seen = []; let cursor = null, pages = 0, over = 0;
  while (pages < 50) {
    const q = { jy: JY, jm: JM, limit: 7 };
    if (cursor) q.cursor = cursor;
    const r = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url(q));
    const n = r.body.schools.reduce((a, s) => a + s.classes.length, 0);
    if (n > 7) over++;
    for (const s of r.body.schools) for (const row of s.classes) seen.push(`${s.school_id}|${row.class_id}`);
    pages++;
    if (!r.body.pagination.has_more) break;
    cursor = r.body.pagination.next_cursor;
  }
  chk('هیچ صفحه‌ای بیش از limit ردیف ندارد', over === 0, String(over));
  chk('پیمایشِ cursor همهٔ کلاس‌ها را می‌پوشاند', seen.length === allKeys.length, `${seen.length} در برابر ${allKeys.length}`);
  chk('هیچ کلاسی دوبار نمی‌آید', new Set(seen).size === seen.length, `${new Set(seen).size}/${seen.length}`);
  chk('مجموعهٔ صفحه‌ها دقیقاً همانِ پاسخِ کامل است',
    JSON.stringify([...seen].sort()) === JSON.stringify([...allKeys].sort()));
  chk('چند صفحه پیموده شد (یعنی واقعاً صفحه‌بندی شد)', pages > 1, String(pages));

  /* جمع‌ها نباید با صفحه‌بندی عوض شوند */
  const p1 = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 3, school_id: 1 }));
  const pAll = await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: 1 }));
  chk('جمعِ مدرسه با صفحه‌بندی عوض نمی‌شود',
    JSON.stringify(p1.body.schools[0].totals) === JSON.stringify(pAll.body.schools[0].totals),
    `${JSON.stringify(p1.body.schools[0].totals)} ≠ ${JSON.stringify(pAll.body.schools[0].totals)}`);
  chk('شمارِ دانش‌آموزان از GROUP BY می‌آید و درست است',
    pAll.body.schools[0].students === store.users.filter((u) => u.role === 'student' && Number(u.school_id) === 1).length,
    String(pAll.body.schools[0].students));

  /* ════ ۴) مسیریابیِ خواندن (رپلیکا) ════════════════════════════ */
  grp('W23-ROUTE — خواندن‌ها از queryRead می‌روند');
  readCalls = 0; writeCalls = 0;
  await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 5 }));
  chk('همهٔ کوئری‌های گزارش از queryRead رفتند', readCalls >= 3 && writeCalls === 0, `read=${readCalls} write=${writeCalls}`);
  chk('شمارِ کوئری‌ها ثابت است (نه به‌ازای هر رکورد)', readCalls === 3, String(readCalls));

  /* ════ ۵) نقشهٔ اجرا — ایندکس، نه پویشِ کامل ═══════════════════ */
  grp('W23-PLAN — EXPLAIN ANALYZE روی PostgreSQL واقعی');
  const range = rs.jalaliMonthRange(JY, JM);
  const built = rs.buildAttendanceClassPage({ schoolIds: [1, 2, 3], from: range.from, to: range.to, limit: 500 });
  const ex = await c.query('EXPLAIN (ANALYZE, BUFFERS) ' + built.sql, built.params);
  const plan = ex.rows.map((r) => r['QUERY PLAN']).join('\n');
  const usedIndex = /Index(?: Only)? Scan using (\w+) on attendance|Bitmap Index Scan on (\w+)/.exec(plan);
  chk('attendance با ایندکس خوانده می‌شود (نه Seq Scan)', !!usedIndex && !/Seq Scan on attendance/.test(plan),
    plan.split('\n').filter((l) => /attendance/.test(l)).join(' | '));
  chk('ایندکسِ استفاده‌شده همانِ (school_id, class_id, date) است',
    !!usedIndex && /idx_attendance_school_class_date/.test(plan), (usedIndex && (usedIndex[1] || usedIndex[2])) || '—');
  const ms = /Execution Time: ([\d.]+) ms/.exec(plan);
  chk('زمانِ اجرا ثبت شد', !!ms, plan.slice(-120));
  if (ms) console.log(`  · EXPLAIN ANALYZE: ${ms[1]} ms روی ${totalRows} رکورد (ایندکس: ${usedIndex[1] || usedIndex[2]})`);

  /* ════ ۶) ممیزی ════════════════════════════════════════════════ */
  grp('W23-AUDIT — رویدادِ ممیزی ثبت می‌شود');
  audits.length = 0;
  await dbRoutes.attendanceReport({ user: { id: 42, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 2 }));
  chk('رویدادِ report_generated با kind=attendance ثبت شد',
    audits.some((a) => a[0] === 'report_generated' && a[1].kind === 'attendance' && a[1].user_id === 42),
    JSON.stringify(audits));

  await c.end();
  return { totalRows };
}

function notRun(reason) {
  console.log('\n══════════════════════════════════════════════');
  console.log('⚠ NOT-RUN — tests/wave23-reports-pg.js اجرا نشد (سبزِ جعلی نیست)');
  console.log('  دلیل: ' + reason);
  console.log('  رفع: یک PostgreSQL بالا بیاورید و DATABASE_URL را بدهید:');
  console.log('    DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node tests/wave23-reports-pg.js');
  console.log('══════════════════════════════════════════════');
}

main().then(() => {
  console.log('\n──────────────────────────────────────────');
  console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
  if (fail) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
  console.log('wave23-reports-pg: سبز ✅ (روی PostgreSQL واقعی)');
}).catch((e) => {
  const msg = String(e && e.message || e);
  if (/ECONNREFUSED|ENOTFOUND|getaddrinfo|password authentication|does not exist|EACCES|no pg_hba/i.test(msg)) {
    notRun(msg);
    /* سبزِ جعلی نه: برچسبِ NOT-RUN همیشه چاپ می‌شود. کدِ خروجِ ۳ فقط وقتی که
       محیط ادعا کند دیتابیس دارد (WAVE23_REQUIRE_PG=1) — scripts/run-all-tests.sh
       این را خودش وقتی PostgreSQLِ در دسترس یافت روشن می‌کند، پس در محیطِ بدونِ
       دیتابیس باتری بی‌دلیل قرمز نمی‌شود و در محیطِ با دیتابیس تست الزامی است. */
    process.exit(process.env.WAVE23_REQUIRE_PG === '1' ? 3 : 0);
  }
  console.error('❌ خطا: ' + msg);
  if (e && e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
});
