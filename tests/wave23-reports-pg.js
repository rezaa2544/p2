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

  /* ═══════════════════════════════════════════════════════════════
     تکمیلِ Wave 23 — سه گزارشِ دیگر: academic / finance / teachers
     ═══════════════════════════════════════════════════════════════ */

  /* ── دادهٔ سه گزارشِ جدید (قطعی) ── */
  const JTERM = 'نوبت اول';
  await c.query(`INSERT INTO subjects (id, school_id, name)
                 SELECT g, 1+((g-1)%$1), 'درس '||g FROM generate_series(1,10) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO grades (school_id, class_id, student_id, subject_id, score, max_score, term, version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1), 1+(g%9),
                        (('x'||substr(md5(g::text),1,3))::bit(12)::int % 2100) / 100.0,
                        CASE WHEN g % 11 = 0 THEN '100' WHEN g % 13 = 0 THEN '' ELSE '20' END,
                        CASE WHEN g % 3 = 0 THEN 'نوبت دوم' WHEN g % 17 = 0 THEN NULL ELSE $4 END, 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, 24000, N_CLASSES, JTERM]);
  /* score > max_score('20') برای g%11: score تا 21 — عمداً؛ نرمال‌سازی باید تحمل کند */
  await c.query(`UPDATE schools SET type = 'shahed' WHERE id % 4 = 1`);
  await c.query(`UPDATE schools SET type = 'non_profit' WHERE id % 4 = 2`);
  /* id%4∈{0,3} governmental می‌مانند — گزارشِ مالی نباید آن‌ها را بیاورد */
  await c.query(`INSERT INTO tuitions (school_id, student_id, total, discount, payable, paid)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), 1000+g, CASE WHEN g%7=0 THEN 'junk' ELSE (g%90)::text END,
                        (900+g)::text, ((900+g)/2)::text
                 FROM generate_series(1,3000) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO installments (school_id, student_id, amount, paid_amount, status, due_date)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), 100+g%400,
                        CASE WHEN g%3=0 THEN ((100+g%400)/2)::text ELSE '0' END,
                        (ARRAY['paid','pending','partial','canceled','weird'])[1+g%5],
                        CASE WHEN g%2=0 THEN '2020-01-01' ELSE '2099-01-01' END
                 FROM generate_series(1,4000) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO scholarships (school_id, student_id, status)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), (ARRAY['approved','pending','rejected'])[1+g%3]
                 FROM generate_series(1,900) g`, [N_SCHOOLS, N_STUDENTS]);
  /* کادر: id بالای 8000 تا با دانش‌آموزان نخورد؛ ~15 نفر در هر مدرسه */
  await c.query(`INSERT INTO users (id, school_id, role, full_name, version)
                 SELECT 8000+g, 1+((g-1)%$1), 'teacher', 'دبیر '||g, 1 FROM generate_series(1,300) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO staff_attendance (school_id, staff_id, date, status)
                 SELECT 1+((g-1)%$1), 8000+(1+((g-1)%300)),
                        to_char(DATE '2025-08-23' + (g%40), 'YYYY-MM-DD'),
                        (ARRAY['present','absent','late','odd'])[1+g%4]
                 FROM generate_series(1,6000) g`, [N_SCHOOLS]);
  await c.query(`UPDATE staff_attendance SET school_id = 1+((staff_id-8001)%${N_SCHOOLS})`); /* سازگار با مدرسهٔ کادر */
  await c.query(`INSERT INTO substitutions (school_id, sub_teacher_id, date)
                 SELECT 1+((g-1)%300)%$1+((1+((g-1)%300))-1)%$1*0, 8000+(1+((g-1)%300)),
                        to_char(DATE '2025-08-23' + (g%40), 'YYYY-MM-DD')
                 FROM generate_series(1,800) g`, [N_SCHOOLS]);
  await c.query(`UPDATE substitutions SET school_id = 1+((sub_teacher_id-8001)%${N_SCHOOLS})`);
  await c.query(`INSERT INTO training_courses (school_id, staff_id, hours, status, date)
                 SELECT 1+((1+((g-1)%300))-1)%$1, 8000+(1+((g-1)%300)), 4+g%20,
                        (ARRAY['completed','done','open'])[1+g%3],
                        to_char(DATE '2024-01-01' + (g%700), 'YYYY-MM-DD')
                 FROM generate_series(1,600) g`, [N_SCHOOLS]);
  await c.query(`UPDATE training_courses SET school_id = 1+((staff_id-8001)%${N_SCHOOLS})`);
  await c.query('ANALYZE grades; ANALYZE tuitions; ANALYZE installments; ANALYZE scholarships; ANALYZE staff_attendance; ANALYZE substitutions; ANALYZE training_courses; ANALYZE users');

  /* آینهٔ حافظه از همان داده — schoolها PG-شکل‌اند ({type}) تا رفعِ باگِ
     schoolHasTuition روی هر دو مسیر سنجیده شود */
  store.schools = (await c.query('SELECT id, name, type FROM schools ORDER BY id')).rows;
  store.users = (await c.query('SELECT id, school_id, role, full_name FROM users ORDER BY id')).rows;
  store.grades = (await c.query('SELECT school_id, class_id, student_id, score, max_score, term, id FROM grades ORDER BY id')).rows
    .map((r) => ({ school_id: r.school_id, class_id: r.class_id, student_id: r.student_id, score: r.score, max_score: r.max_score, term: r.term }));
  store.tuitions = (await c.query('SELECT school_id, student_id, total, discount, payable, paid FROM tuitions ORDER BY id')).rows;
  store.installments = (await c.query('SELECT school_id, student_id, amount, paid_amount, status, due_date FROM installments ORDER BY id')).rows;
  store.scholarships = (await c.query('SELECT school_id, student_id, status FROM scholarships ORDER BY id')).rows;
  store.staff_attendance = (await c.query('SELECT school_id, staff_id, date, status FROM staff_attendance ORDER BY id')).rows;
  store.substitutions = (await c.query('SELECT school_id, sub_teacher_id, date FROM substitutions ORDER BY id')).rows;
  store.training_courses = (await c.query('SELECT school_id, staff_id, hours, status FROM training_courses ORDER BY id')).rows;

  /* ════ ۷) هم‌ارزیِ سه گزارشِ جدید ═════════════════════════════ */
  grp('W23C-PARITY — هم‌ارزیِ academic/finance/teachers با مسیرِ حافظه');
  const cases2 = [
    { kind: 'academicReport', name: 'academic: سوپرادمین، کلِ دامنه', user: { id: 1, role: 'superadmin' }, q: {} },
    { kind: 'academicReport', name: 'academic: term فیلترشده', user: { id: 1, role: 'superadmin' }, q: { term: JTERM } },
    { kind: 'academicReport', name: 'academic: مدیرِ مدرسهٔ ۵ + term', user: { id: 2, role: 'manager', school_id: 5 }, q: { term: JTERM } },
    { kind: 'academicReport', name: 'academic: counselor مدرسهٔ ۳', user: { id: 3, role: 'counselor', school_id: 3 }, q: {} },
    { kind: 'academicReport', name: 'academic: فیلترِ کلاس', user: { id: 1, role: 'superadmin' }, q: { class_id: 7 } },
    { kind: 'financeReport', name: 'finance: سوپرادمین، کلِ دامنه', user: { id: 1, role: 'superadmin' }, q: {} },
    { kind: 'financeReport', name: 'finance: مدیرِ مدرسهٔ شهریه‌دار (شاهد PG-شکل)', user: { id: 2, role: 'manager', school_id: 5 }, q: {} },
    { kind: 'teachersReport', name: 'teachers: سوپرادمین، ماهِ داده‌دار', user: { id: 1, role: 'superadmin' }, q: { jy: JY, jm: JM } },
    { kind: 'teachersReport', name: 'teachers: مدیرِ مدرسهٔ ۵', user: { id: 2, role: 'manager', school_id: 5 }, q: { jy: JY, jm: JM } },
    { kind: 'teachersReport', name: 'teachers: ماهِ بی‌داده', user: { id: 1, role: 'superadmin' }, q: { jy: 1400, jm: 1 } }
  ];
  for (const t of cases2) {
    const a = await memRoutes[t.kind]({ user: t.user }, url(t.q));
    const b = await dbRoutes[t.kind]({ user: t.user }, url(t.q));
    const same = JSON.stringify(strip(a.body)) === JSON.stringify(strip(b.body));
    chk('هم‌ارز: ' + t.name, same && a.status === b.status,
      same ? '' : `mem=${JSON.stringify(strip(a.body)).slice(0, 220)} db=${JSON.stringify(strip(b.body)).slice(0, 220)}`);
  }
  for (const k of ['academicReport', 'financeReport', 'teachersReport']) {
    const r = await dbRoutes[k]({ user: { id: 1, role: 'superadmin' } }, url(k === 'teachersReport' ? { jy: JY, jm: JM } : {}));
    chk(k + ' مسیرِ DB خودش را اعلام می‌کند', r.body.source === 'postgresql', String(r.body.source));
  }

  /* رفعِ باگِ schoolHasTuition روی دیتابیسِ واقعی: مدرسهٔ شاهدِ PG-شکل */
  grp('W23-TUITION — رفعِ باگِ school_type/type (red-first)');
  const shahedId = Number((await c.query(`SELECT id FROM schools WHERE type = 'shahed' ORDER BY id LIMIT 1`)).rows[0].id);
  const govId = Number((await c.query(`SELECT id FROM schools WHERE type = 'governmental' ORDER BY id LIMIT 1`)).rows[0].id);
  const finShahed = await dbRoutes.financeReport({ user: { id: 1, role: 'superadmin' } }, url({ school_id: shahedId }));
  chk('مدرسهٔ شاهد (ستونِ PG «type») دیگر 400 نمی‌گیرد', finShahed.status === 200
    && finShahed.body.schools.length === 1 && finShahed.body.schools[0].school_type === 'shahed',
    `status=${finShahed.status}`);
  const finGov = await dbRoutes.financeReport({ user: { id: 1, role: 'superadmin' } }, url({ school_id: govId }));
  chk('درخواستِ صریحِ مدرسهٔ بدونِ شهریه همچنان 400 است', finGov.status === 400, `status=${finGov.status}`);
  const finAll = await dbRoutes.financeReport({ user: { id: 1, role: 'superadmin' } }, url({}));
  chk('گزارشِ کلی فقط مدارسِ شهریه‌دار را می‌آورد',
    finAll.body.schools.length > 0 && finAll.body.schools.every((s) => ['shahed', 'non_profit'].includes(s.school_type)),
    JSON.stringify(finAll.body.schools.map((s) => s.school_type).slice(0, 6)));

  /* ════ ۸) مهارِ اجاره‌ای سه گزارشِ جدید ═══════════════════════ */
  grp('W23C-AUTHZ — مهار اجاره‌ای و اعتبارسنجی (P2)');
  const acMgr = await dbRoutes.academicReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({}));
  chk('academic: مدیر فقط مدرسهٔ خودش', acMgr.body.schools.length === 1 && Number(acMgr.body.schools[0].school_id) === 5);
  const teMgr = await dbRoutes.teachersReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({ jy: JY, jm: JM }));
  chk('teachers: مدیر فقط مدرسهٔ خودش و staff فقط از همان مدرسه',
    teMgr.body.schools.length === 1 && teMgr.body.schools[0].staff.every((r) => Number(r.school_id) === 5));
  const fiMgr = await dbRoutes.financeReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({}));
  chk('finance: مدیر فقط مدرسهٔ خودش', fiMgr.body.schools.every((s) => Number(s.school_id) === 5));
  chk('academic: نقشِ بی‌حق 403', (await dbRoutes.academicReport({ user: { id: 9, role: 'student', school_id: 5 } }, url({}))).status === 403);
  chk('finance: counselor حق ندارد (فقط academic دارد)', (await dbRoutes.financeReport({ user: { id: 9, role: 'counselor', school_id: 5 } }, url({}))).status === 403);
  chk('teachers: مدرسهٔ خارج از دامنه 403', (await dbRoutes.teachersReport({ user: { id: 2, role: 'manager', school_id: 5 } }, url({ jy: JY, jm: JM, school_id: 6 }))).status === 403);
  /* P2: ورودیِ خراب ⇒ 400 در هر ۴ endpoint (نه NaN/500) */
  chk('P2: academic class_id خراب ⇒ 400', (await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ class_id: '7; DROP' }))).status === 400);
  chk('P2: academic school_id خراب ⇒ 400', (await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ school_id: 'NaN' }))).status === 400);
  chk('P2: finance school_id خراب ⇒ 400', (await dbRoutes.financeReport({ user: { id: 1, role: 'superadmin' } }, url({ school_id: '1 OR 1=1' }))).status === 400);
  chk('P2: teachers school_id خراب ⇒ 400', (await dbRoutes.teachersReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: 'x' }))).status === 400);
  chk('P2: attendance school_id خراب ⇒ 400 (parserِ مشترک روی endpoint چت ۶ هم)', (await dbRoutes.attendanceReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: '−۱' }))).status === 400);
  chk('P2: term با کاراکترِ کنترلی ⇒ 400', (await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ term: 'a\u0000b' }))).status === 400);
  chk('P2: مسیرِ حافظه هم همان 400 را می‌دهد (قراردادِ واحد)', (await memRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ class_id: 'zz' }))).status === 400);

  /* ════ ۹) صفحه‌بندیِ گزارش‌های جدید ═══════════════════════════ */
  grp('W23C-PAGE — پیمایشِ cursor گزارشِ تحصیلی و معلمان');
  async function walk(kind, q, keyOf) {
    const all = await dbRoutes[kind]({ user: { id: 1, role: 'superadmin' } }, url(q));
    const want = [];
    for (const s of all.body.schools) for (const r of (s.classes || s.staff)) want.push(keyOf(s, r));
    const seen2 = []; let cur = null, pages2 = 0, over2 = 0;
    while (pages2 < 80) {
      const qq = Object.assign({}, q, { limit: 7 });
      if (cur) qq.cursor = cur;
      const r = await dbRoutes[kind]({ user: { id: 1, role: 'superadmin' } }, url(qq));
      const n = r.body.schools.reduce((a, s) => a + (s.classes || s.staff).length, 0);
      if (n > 7) over2++;
      for (const s of r.body.schools) for (const row of (s.classes || s.staff)) seen2.push(keyOf(s, row));
      pages2++;
      if (!r.body.pagination.has_more) break;
      cur = r.body.pagination.next_cursor;
    }
    return { want, seen: seen2, pages: pages2, over: over2 };
  }
  const wA = await walk('academicReport', { term: JTERM }, (s, r) => `${s.school_id}|${r.class_id}`);
  chk('academic: پیمایش کامل، بدونِ تکرار و بدونِ overflow',
    wA.over === 0 && wA.pages > 1 && new Set(wA.seen).size === wA.seen.length
    && JSON.stringify([...wA.seen].sort()) === JSON.stringify([...wA.want].sort()),
    `pages=${wA.pages} seen=${wA.seen.length} want=${wA.want.length}`);
  const wT = await walk('teachersReport', { jy: JY, jm: JM }, (s, r) => `${s.school_id}|${r.staff_id}`);
  chk('teachers: پیمایش کامل، بدونِ تکرار و بدونِ overflow',
    wT.over === 0 && wT.pages > 1 && new Set(wT.seen).size === wT.seen.length
    && JSON.stringify([...wT.seen].sort()) === JSON.stringify([...wT.want].sort()),
    `pages=${wT.pages} seen=${wT.seen.length} want=${wT.want.length}`);

  /* ── یافتهٔ بازبینِ PR #120 (flag 2، red-first): در پیمایشِ چندصفحه‌ای،
     صفحهٔ آخر نباید مدارسِ مصرف‌شدهٔ صفحاتِ قبل را دوباره با ردیفِ خالی
     برگرداند. قرارداد: در پاسخِ صفحه‌دار (cursor یا has_more) فقط مدارسِ
     دارای ردیفِ همان صفحه؛ مدارسِ بی‌ردیف فقط در پاسخِ تک‌صفحه‌ای. */
  async function walkNoEmpty(kind, q, rowsOf) {
    let cur = null, pages3 = 0;
    const offenders = [];
    while (pages3 < 80) {
      const qq = Object.assign({}, q, { limit: 7 });
      if (cur) qq.cursor = cur;
      const r = await dbRoutes[kind]({ user: { id: 1, role: 'superadmin' } }, url(qq));
      pages3++;
      const paged = !!cur || r.body.pagination.has_more;
      if (paged) {
        for (const s of r.body.schools) if (!rowsOf(s).length) offenders.push(`p${pages3}:s${s.school_id}`);
      }
      if (!r.body.pagination.has_more) break;
      cur = r.body.pagination.next_cursor;
    }
    return offenders;
  }
  const oAtt = await walkNoEmpty('attendanceReport', { jy: JY, jm: JM }, (s) => s.classes);
  chk('attendance: هیچ صفحه‌ای مدرسهٔ بدونِ ردیف را برنمی‌گرداند (بدونِ تکرارِ ظرف)', oAtt.length === 0, oAtt.join(','));
  const oAc = await walkNoEmpty('academicReport', { term: JTERM }, (s) => s.classes);
  chk('academic: هیچ صفحه‌ای مدرسهٔ بدونِ ردیف را برنمی‌گرداند', oAc.length === 0, oAc.join(','));
  const oTe = await walkNoEmpty('teachersReport', { jy: JY, jm: JM }, (s) => s.staff);
  chk('teachers: هیچ صفحه‌ای مدرسهٔ بدونِ ردیف را برنمی‌گرداند', oTe.length === 0, oTe.join(','));
  const acP1 = await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ term: JTERM, limit: 3, school_id: 1 }));
  const acPA = await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ term: JTERM, school_id: 1 }));
  chk('academic: میانگین/روندِ مدرسه با صفحه‌بندی عوض نمی‌شود',
    acP1.body.schools[0].avg === acPA.body.schools[0].avg
    && JSON.stringify(acP1.body.schools[0].trend) === JSON.stringify(acPA.body.schools[0].trend));
  const teP1 = await dbRoutes.teachersReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 3, school_id: 1 }));
  const tePA = await dbRoutes.teachersReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, school_id: 1 }));
  chk('teachers: جمعِ مدرسه با صفحه‌بندی عوض نمی‌شود',
    JSON.stringify(teP1.body.schools[0].totals) === JSON.stringify(tePA.body.schools[0].totals));

  /* رکوردِ ناسازگارِ نمره: school_id می‌گوید مدرسهٔ دیگر، class_id مالِ
     مدرسهٔ zSchool — مسیرِ SQL (تطبیقِ g.school_id = c.school_id در JOIN)
     نباید بشمارد؛ همان دکترینِ W23-JOIN حضور برای grades. */
  grp('W23C-JOIN — نمرهٔ ناسازگار (school_id ≠ مدرسهٔ کلاس)');
  const gBad = zSchool === 1 ? 2 : 1;
  const before3 = await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ class_id: 3 }));
  const pickAc = (b) => ((b.body.schools.find((s) => Number(s.school_id) === zSchool) || { classes: [] }).classes
    .find((r) => Number(r.class_id) === 3)) || {};
  const cntBefore = Number(pickAc(before3).count) || 0;
  await c.query(`INSERT INTO grades (school_id, class_id, student_id, subject_id, score, max_score, term, version)
                 VALUES ($1, 3, 1, 1, 15, '20', $2, 1)`, [gBad, JTERM]);
  const after3 = await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ class_id: 3 }));
  chk('مسیرِ SQL نمرهٔ ناسازگار را نمی‌شمارد (تطبیقِ مدرسه در JOIN)',
    (Number(pickAc(after3).count) || 0) === cntBefore,
    `before=${cntBefore} after=${pickAc(after3).count}`);
  await c.query(`DELETE FROM grades WHERE class_id = 3 AND school_id = $1`, [gBad]);

  /* ════ ۱۰) مسیریابیِ خواندن و شمارِ کوئری ═════════════════════ */
  grp('W23C-ROUTE — همهٔ خواندن‌ها از queryRead و bounded');
  /* bounded در خودِ دیتابیس: هیچ کوئریِ صفحه‌ای نباید بیش از limit+1 ردیف
     از PG برگرداند — پاسخِ slice شده کافی نیست، چون LIMITِ حذف‌شده یعنی
     کلِ جدول خوانده شده است (همان anti-pattern که این موج می‌بندد). */
  {
    const rowCounts = [];
    const dbCount = {
      isPostgres: () => true,
      query: async (sql, params) => c.query(sql, params),
      queryRead: async (sql, params) => { const r = await c.query(sql, params); rowCounts.push({ n: r.rows.length, page: /LIMIT/.test(sql) }); return r; }
    };
    const countRoutes = createReportsRoutes({ store, db: dbCount, audit });
    rowCounts.length = 0;
    await countRoutes.teachersReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 7 }));
    const pageResults = rowCounts.filter((r) => r.page);
    chk('teachers: کوئریِ صفحه LIMIT دارد و بیش از limit+1 ردیف از PG نمی‌آید',
      pageResults.length >= 1 && pageResults.every((r) => r.n <= 8),
      JSON.stringify(rowCounts));
    rowCounts.length = 0;
    await countRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ term: JTERM, limit: 7 }));
    const pageResults2 = rowCounts.filter((r) => r.page);
    chk('academic: کوئریِ صفحه LIMIT دارد و بیش از limit+1 ردیف از PG نمی‌آید',
      pageResults2.length >= 1 && pageResults2.every((r) => r.n <= 8),
      JSON.stringify(rowCounts));
  }
  readCalls = 0; writeCalls = 0;
  await dbRoutes.academicReport({ user: { id: 1, role: 'superadmin' } }, url({ term: JTERM, limit: 5 }));
  chk('academic: فقط queryRead، شمارِ ثابتِ کوئری (۳)', readCalls === 3 && writeCalls === 0, `read=${readCalls} write=${writeCalls}`);
  readCalls = 0; writeCalls = 0;
  await dbRoutes.financeReport({ user: { id: 1, role: 'superadmin' } }, url({}));
  chk('finance: فقط queryRead، شمارِ ثابتِ کوئری (۳)', readCalls === 3 && writeCalls === 0, `read=${readCalls} write=${writeCalls}`);
  readCalls = 0; writeCalls = 0;
  await dbRoutes.teachersReport({ user: { id: 1, role: 'superadmin' } }, url({ jy: JY, jm: JM, limit: 5 }));
  chk('teachers: فقط queryRead، شمارِ ثابت (۳: صفحه+نام‌ها+جمع)', readCalls === 3 && writeCalls === 0, `read=${readCalls} write=${writeCalls}`);

  /* ════ ۱۱) نقشهٔ اجرا — EXPLAIN (ANALYZE, BUFFERS) ═══════════ */
  grp('W23C-PLAN — EXPLAIN (ANALYZE, BUFFERS) سه گزارشِ جدید');
  const seqFindings = [];
  async function planOf(label, built) {
    const ex2 = await c.query('EXPLAIN (ANALYZE, BUFFERS) ' + built.sql, built.params);
    const plan2 = ex2.rows.map((r) => r['QUERY PLAN']).join('\n');
    const ms2 = /Execution Time: ([\d.]+) ms/.exec(plan2);
    const seqs = [...plan2.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1]);
    if (seqs.length) seqFindings.push(`${label}: Seq Scan on ${[...new Set(seqs)].join(',')}`);
    console.log(`  · ${label}: ${ms2 ? ms2[1] : '?'} ms${seqs.length ? ' — Seq: ' + [...new Set(seqs)].join(',') : ' — بدونِ Seq Scan'}`);
    return { plan: plan2, ms: ms2 ? Number(ms2[1]) : null, seqs };
  }
  const scope3 = [1, 2, 3];
  const pAc = await planOf('academic صفحه', rs.buildAcademicClassPage({ schoolIds: scope3, term: JTERM, limit: 500 }));
  chk('academic: grades با ایندکس خوانده می‌شود (نه Seq Scan روی جدولِ پایه)',
    !pAc.seqs.includes('grades'), pAc.seqs.join(','));
  const pFi = await planOf('finance شهریه', rs.buildFinanceTuitions({ schoolIds: scope3 }));
  chk('finance: tuitions با ایندکس خوانده می‌شود', !pFi.seqs.includes('tuitions'), pFi.seqs.join(','));
  const pFi2 = await planOf('finance اقساط', rs.buildFinanceInstallments({ schoolIds: scope3, today: '2026-09-12' }));
  chk('finance: installments با ایندکس خوانده می‌شود', !pFi2.seqs.includes('installments'), pFi2.seqs.join(','));
  const rng9 = rs.jalaliMonthRange(JY, JM);
  const pTe = await planOf('teachers صفحه', rs.buildTeachersStaffPage({ schoolIds: scope3, from: rng9.from, to: rng9.to, limit: 500 }));
  chk('teachers: staff_attendance با ایندکس خوانده می‌شود', !pTe.seqs.includes('staff_attendance'), pTe.seqs.join(','));
  if (seqFindings.length) console.log('  ⚠ یافته‌های Seq Scan (ثبت در سند): ' + seqFindings.join(' | '));

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
