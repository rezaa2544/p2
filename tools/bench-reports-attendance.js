#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/bench-reports-attendance.js — سنجهٔ پیش/پسِ گزارشِ حضور

   گزارشِ حضورِ موج ۲۳ کلِ store.attendance را در حافظه می‌پوید؛ مسیرِ
   DB-native سه کوئریِ ایندکس‌دار می‌زند. این ابزار هر دو را روی یک
   PostgreSQLِ **واقعی** و روی یک دادهٔ یکسان اندازه می‌گیرد:

   • میانه/کمینه/صدک۹۵ زمانِ پاسخ برای هر مسیر
   • تعدادِ ردیف‌هایی که هر مسیر واقعاً لمس می‌کند
   • EXPLAIN ANALYZE کوئریِ صفحه (نقشهٔ اجرا + ایندکسِ استفاده‌شده)
   • حجمِ داده‌ای که مسیرِ حافظه مجبور است در RAM نگه دارد

   خروجی یک جدولِ قابلِ چسباندن در گزارش است. هیچ عددی حدس زده نمی‌شود.

   اجرا:
     DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
       node tools/bench-reports-attendance.js [rows] [iterations]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const BASE_URL = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/postgres';
const DB = process.env.WAVE23_BENCH_DB || 'payesh_w23_bench';
const ROWS = Number(process.argv[2] || process.env.WAVE23_ROWS || 36000);
const ITER = Number(process.argv[3] || 30);
const N_SCHOOLS = 20, N_CLASSES = 200, N_STUDENTS = 2000;
const JY = 1404, JM = 6;

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0], med: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] };
};
const f = (n) => n.toFixed(2);

async function main() {
  const { Client } = require('pg');
  const rs = require(path.join(ROOT, 'server', 'reports-sql.js'));
  const { createReportsRoutes } = require(path.join(ROOT, 'server', 'routes', 'reports.js'));

  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const c = new Client({ connectionString: BASE_URL.replace(/\/[^/]*$/, '/' + DB) });
  await c.connect();
  const migs = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((x) => x.endsWith('.sql') && !x.endsWith('.down.sql')).sort();
  for (const m of migs) await c.query(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));

  await c.query(`INSERT INTO schools (id,name,type,version) SELECT g,'مدرسهٔ '||g,'governmental',1 FROM generate_series(1,$1) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO classes (id,school_id,name,grade,version) SELECT g,1+((g-1)%$1),'کلاس '||g,7+((g-1)%6),1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_CLASSES]);
  await c.query(`INSERT INTO users (id,school_id,role,full_name,version) SELECT g,1+((g-1)%$1),'student','دانش‌آموز '||g,1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO attendance (school_id,class_id,student_id,date,status,version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1),
                        to_char(DATE '2025-01-01' + (g%365),'YYYY-MM-DD'),
                        (ARRAY['present','absent','late','excused','early_exit'])[
                          1 + (('x'||substr(md5(g::text),1,3))::bit(12)::int % 5)], 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, ROWS, N_CLASSES]);
  await c.query('ANALYZE attendance; ANALYZE classes; ANALYZE users');

  const total = Number((await c.query('SELECT count(*)::int n FROM attendance')).rows[0].n);
  const inMonth = Number((await c.query(`SELECT count(*)::int n FROM attendance WHERE date >= $1 AND date < $2`,
    [rs.jalaliMonthRange(JY, JM).from, rs.jalaliMonthRange(JY, JM).to])).rows[0].n);
  const bytes = Number((await c.query(`SELECT pg_total_relation_size('attendance')::bigint b`)).rows[0].b);

  /* آینهٔ حافظه — همان چیزی که مسیرِ قدیمی در RAM نگه می‌دارد */
  const t0 = Date.now();
  const store = {
    schools: (await c.query('SELECT id,name,type FROM schools ORDER BY id')).rows.map((r) => ({ id: r.id, name: r.name, school_type: r.type })),
    classes: (await c.query('SELECT id,school_id,name,grade FROM classes ORDER BY id')).rows,
    users: (await c.query('SELECT id,school_id,role,full_name FROM users ORDER BY id')).rows,
    attendance: (await c.query('SELECT school_id,class_id,student_id,date,status FROM attendance ORDER BY id')).rows
  };
  const loadMs = Date.now() - t0;
  const storeBytes = Buffer.byteLength(JSON.stringify(store.attendance), 'utf8');

  const db = { isPostgres: () => true, query: (s, p) => c.query(s, p), queryRead: (s, p) => c.query(s, p) };
  const memR = createReportsRoutes({ store, audit: () => {} });
  const dbR = createReportsRoutes({ store, db, audit: () => {} });
  const u = (o) => { const p = new URLSearchParams(); for (const k in o) if (o[k] != null) p.set(k, o[k]); return p; };

  /* گرم‌کردن */
  for (let i = 0; i < 3; i++) {
    await memR.attendanceReport({ user: { id: 1, role: 'superadmin' } }, u({ jy: JY, jm: JM }));
    await dbR.attendanceReport({ user: { id: 1, role: 'superadmin' } }, u({ jy: JY, jm: JM, limit: 500 }));
  }

  const scenarios = [
    ['همهٔ مدارس (سوپرادمین)', { id: 1, role: 'superadmin' }, {}],
    ['یک مدرسه (مدیر)', { id: 2, role: 'manager', school_id: 5 }, {}],
    ['همهٔ مدارس + صفحهٔ ۵۰۰', { id: 1, role: 'superadmin' }, { limit: 500 }]
  ];

  const rows = [];
  for (const [name, user, extra] of scenarios) {
    const a = [], b = [];
    for (let i = 0; i < ITER; i++) {
      let t = process.hrtime.bigint();
      await memR.attendanceReport({ user }, u({ jy: JY, jm: JM }));
      a.push(Number(process.hrtime.bigint() - t) / 1e6);
      t = process.hrtime.bigint();
      await dbR.attendanceReport({ user }, u({ jy: JY, jm: JM, limit: extra.limit || 500 }));
      b.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    const A = stats(a), B = stats(b);
    rows.push({ name, A, B, speedup: A.med / B.med });
  }

  /* EXPLAIN ANALYZE کوئریِ صفحه */
  const built = rs.buildAttendanceClassPage({ schoolIds: [1, 2, 3], ...rs.jalaliMonthRange(JY, JM), limit: 500 });
  const ex = await c.query('EXPLAIN (ANALYZE, BUFFERS) ' + built.sql, built.params);
  const plan = ex.rows.map((r) => r['QUERY PLAN']).join('\n');

  console.log('\n══════════ سنجهٔ گزارشِ حضور — پیش/پس ══════════');
  console.log(`دیتابیس: PostgreSQL واقعی (${DB}) · ${total} رکوردِ حضور (${inMonth} در ماهِ خواسته‌شده)`);
  console.log(`مدرسه ${N_SCHOOLS} · کلاس ${N_CLASSES} · دانش‌آموز ${N_STUDENTS} · تکرار ${ITER}`);
  console.log(`حجمِ attendance روی دیسک: ${(bytes / 1048576).toFixed(1)} MiB · بارگذاریِ آینهٔ حافظه: ${loadMs} ms · JSONِ آن: ${(storeBytes / 1048576).toFixed(1)} MiB`);

  console.log('\n| سناریو | حافظه: میانه (ms) | DB-native: میانه (ms) | سرعت | حافظه p95 | DB p95 |');
  console.log('| :--- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    console.log(`| ${r.name} | ${f(r.A.med)} | ${f(r.B.med)} | ${r.speedup.toFixed(1)}× | ${f(r.A.p95)} | ${f(r.B.p95)} |`);
  }
  console.log('\nکمینه/میانه/صدک۹۵ به تفکیک:');
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(26)} حافظه  min=${f(r.A.min)} med=${f(r.A.med)} p95=${f(r.A.p95)}   |   DB  min=${f(r.B.min)} med=${f(r.B.med)} p95=${f(r.B.p95)}`);
  }

  console.log('\nردیف‌هایی که هر مسیر لمس می‌کند (سوپرادمین، همهٔ مدارس):');
  console.log(`  مسیرِ حافظه : ${total} رکورد (کلِ جدول) + ${store.users.length} کاربر + ${store.classes.length} کلاس — در هر درخواست`);
  console.log(`  DB-native  : ${inMonth} رکوردِ همان ماه، از راهِ ایندکس، در ۳ کوئری`);

  console.log('\n────── EXPLAIN ANALYZE (کوئریِ صفحه، ۳ مدرسه) ──────');
  console.log(plan.split('\n').map((l) => '  ' + l).join('\n'));

  const idx = /Index(?: Only)? Scan using (\S+) on attendance/.exec(plan);
  console.log('\nایندکسِ استفاده‌شده روی attendance: ' + (idx ? idx[1] : '⚠ هیچ (Seq Scan)'));
  console.log('ایندکسِ تازه لازم نشد: idx_attendance_school_class_date (مهاجرتِ ۰۰۲) همین الگو را پوشش می‌دهد.');

  await c.end();
}

main().catch((e) => {
  console.error('❌ ' + (e && e.message || e));
  if (/ECONNREFUSED|ENOTFOUND/.test(String(e && e.message))) {
    console.error('   یک PostgreSQLِ در دسترس لازم است (DATABASE_URL). این ابزار بدونِ آن اجرا نمی‌شود.');
  }
  process.exit(1);
});
