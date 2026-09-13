#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/bench-reports-concurrency.js — شواهد هم‌زمانی (P1-7 سبک)
   ۵۰ درخواست هم‌زمان گزارش روی PostgreSQL زنده؛ p50/p95/خطا؛ مقایسه با
   مسیر حافظه روی همان داده.

   صداقت مقیاس (Target ≠ Measured): هدف بریف scale=0.01 (۱۰۰k کاربر،
   ~1.4GB JSON) بود؛ sandbox ~1GB RAM دارد و آن دیتاست نه در RAM جا
   می‌شود نه در /tmp. این بنچ روی WAVE23_ROWS (پیش‌فرض 200k رکورد
   حضور + 60k نمره — همان مقیاس بزرگ بنچ قبلی) اجرا و **با برچسب
   مقیاس** گزارش می‌شود. اجرای scale=0.01 = NOT-RUN (RAM محدود).

   اجرا:
     DATABASE_URL=... node tools/bench-reports-concurrency.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_DB = process.env.WAVE23_BENCH_DB || 'payesh_w23_bench';
const BASE_URL = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/postgres';
const N_ATT = Number(process.env.WAVE23_ROWS || 200000);
const N_GRADES = Number(process.env.WAVE23_GRADES || 60000);
const N_SCHOOLS = 20, N_CLASSES = 200, N_STUDENTS = 2000;
const CONC = Number(process.env.WAVE23_CONC || 50);
const JY = 1404, JM = 6;

const quant = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

async function main() {
  const { Client } = require('pg');
  const { createReportsRoutes } = require(path.join(ROOT, 'server', 'routes', 'reports.js'));

  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const dbUrl = BASE_URL.replace(/\/[^/]*$/, '/' + TEST_DB);
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  const migs = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
  for (const f of migs) await c.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));

  console.log(`\nbench-reports-concurrency — ${CONC} درخواستِ هم‌زمان روی PostgreSQL زنده`);
  console.log(`مقیاس (Measured): ${N_ATT} حضور · ${N_GRADES} نمره · ${N_SCHOOLS} مدرسه · ${N_CLASSES} کلاس`);
  console.log(`هدفِ بریف (Target): scale=0.01 (~100k کاربر / ~1.4GB) — NOT-RUN: RAM سندباکس ~1GB\n`);

  /* seed — همان الگوی قطعی تست parity */
  await c.query(`INSERT INTO schools (id, name, type, version) SELECT g, 'مدرسهٔ '||g,
                 CASE WHEN g%4=1 THEN 'shahed' WHEN g%4=2 THEN 'non_profit' ELSE 'governmental' END, 1
                 FROM generate_series(1,$1) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO classes (id, school_id, name, grade, version)
                 SELECT g, 1+((g-1)%$1), 'کلاس '||g, 7+((g-1)%6), 1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_CLASSES]);
  await c.query(`INSERT INTO users (id, school_id, role, full_name, version)
                 SELECT g, 1+((g-1)%$1), 'student', 'د '||g, 1 FROM generate_series(1,$2) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO subjects (id, school_id, name) SELECT g, 1+((g-1)%$1), 'درس '||g FROM generate_series(1,10) g`, [N_SCHOOLS]);
  await c.query(`INSERT INTO attendance (school_id, class_id, student_id, date, status, version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1),
                        to_char(DATE '2025-01-01' + (g%365), 'YYYY-MM-DD'),
                        (ARRAY['present','absent','late','excused','early_exit'])[1+(('x'||substr(md5(g::text),1,3))::bit(12)::int % 5)], 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, N_ATT, N_CLASSES]);
  await c.query(`INSERT INTO grades (school_id, class_id, student_id, subject_id, score, max_score, term, version)
                 SELECT cl.school_id, cl.id, 1+((g-1)%$1), 1+(g%9),
                        (('x'||substr(md5(g::text),1,3))::bit(12)::int % 2100) / 100.0, '20',
                        CASE WHEN g%3=0 THEN 'نوبت دوم' ELSE 'نوبت اول' END, 1
                 FROM generate_series(1,$2) g JOIN classes cl ON cl.id = 1+((g-1)%$3)`,
    [N_STUDENTS, N_GRADES, N_CLASSES]);
  await c.query(`INSERT INTO tuitions (school_id, student_id, total, discount, payable, paid)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), 1000+g, (g%90)::text, (900+g)::text, ((900+g)/2)::text
                 FROM generate_series(1,6000) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO installments (school_id, student_id, amount, paid_amount, status, due_date)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), 100+g%400, '0',
                        (ARRAY['paid','pending','partial','canceled'])[1+g%4],
                        CASE WHEN g%2=0 THEN '2020-01-01' ELSE '2099-01-01' END
                 FROM generate_series(1,8000) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query(`INSERT INTO scholarships (school_id, student_id, status)
                 SELECT 1+((g-1)%$1), 1+((g-1)%$2), (ARRAY['approved','pending'])[1+g%2] FROM generate_series(1,1500) g`, [N_SCHOOLS, N_STUDENTS]);
  await c.query('ANALYZE');
  console.log('  · seed کامل شد');

  /* آینهٔ حافظه از همان داده */
  const store = {};
  store.schools = (await c.query('SELECT id, name, type FROM schools ORDER BY id')).rows;
  store.classes = (await c.query('SELECT id, school_id, name, grade FROM classes ORDER BY id')).rows;
  store.users = (await c.query('SELECT id, school_id, role, full_name FROM users ORDER BY id')).rows;
  store.attendance = (await c.query('SELECT school_id, class_id, student_id, date, status FROM attendance ORDER BY id')).rows;
  store.grades = (await c.query('SELECT school_id, class_id, student_id, score, max_score, term FROM grades ORDER BY id')).rows;
  store.tuitions = (await c.query('SELECT school_id, student_id, total, discount, payable, paid FROM tuitions ORDER BY id')).rows;
  store.installments = (await c.query('SELECT school_id, student_id, amount, paid_amount, status, due_date FROM installments ORDER BY id')).rows;
  store.scholarships = (await c.query('SELECT school_id, student_id, status FROM scholarships ORDER BY id')).rows;
  store.staff_attendance = []; store.substitutions = []; store.training_courses = [];
  const memMiB = Math.round(process.memoryUsage().heapUsed / 1048576);
  console.log(`  · آینهٔ حافظه بار شد (heap ~${memMiB} MiB)`);

  /* Pool واقعی — هم‌زمانی معنادار (Client تکی صف می‌شود) */
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: dbUrl, max: 10 });
  const dbPool = {
    isPostgres: () => true,
    query: (sql, params) => pool.query(sql, params),
    queryRead: (sql, params) => pool.query(sql, params)
  };
  const memRoutes = createReportsRoutes({ store });
  const dbRoutes = createReportsRoutes({ store, db: dbPool });
  const url = (o) => { const p = new URLSearchParams(); for (const k in o) if (o[k] != null) p.set(k, o[k]); return p; };

  /* بارِ ترکیبی: ۴ نوع گزارش، کاربرها/مدرسه‌های مختلف */
  const su = { id: 1, role: 'superadmin' };
  const mgr = (i) => ({ id: 100 + i, role: 'manager', school_id: 1 + (i % N_SCHOOLS) });
  const mix = (i) => {
    switch (i % 4) {
      case 0: return ['attendanceReport', mgr(i), { jy: JY, jm: JM }];
      case 1: return ['academicReport', mgr(i), { term: 'نوبت اول' }];
      case 2: return ['financeReport', su, {}];
      default: return ['teachersReport', mgr(i), { jy: JY, jm: JM }];
    }
  };

  async function burst(routes, label) {
    /* گرم‌کردن */
    await routes.attendanceReport({ user: su }, url({ jy: JY, jm: JM }));
    const lat = []; let errs = 0;
    const t0 = process.hrtime.bigint();
    await Promise.all(Array.from({ length: CONC }, (_, i) => (async () => {
      const [kind, user, q] = mix(i);
      const s = process.hrtime.bigint();
      try {
        const r = await routes[kind]({ user }, url(q));
        if (r.status !== 200) errs++;
      } catch (e) { errs++; }
      lat.push(Number(process.hrtime.bigint() - s) / 1e6);
    })()));
    const wall = Number(process.hrtime.bigint() - t0) / 1e6;
    const p50 = quant(lat, 0.50).toFixed(1), p95 = quant(lat, 0.95).toFixed(1);
    console.log(`  ${label}: p50=${p50}ms · p95=${p95}ms · wall=${wall.toFixed(0)}ms · errors=${errs}/${CONC}`);
    return { p50: Number(p50), p95: Number(p95), wall, errs };
  }

  console.log(`\n▸ ${CONC} درخواستِ هم‌زمانِ ترکیبی (attendance+academic+finance+teachers)`);
  const mem1 = await burst(memRoutes, 'حافظه   (full-scan)');
  const db1 = await burst(dbRoutes, 'DB-native (pooled)');
  /* دورِ دوم برای پایداری */
  const mem2 = await burst(memRoutes, 'حافظه   دورِ ۲');
  const db2 = await burst(dbRoutes, 'DB-native دورِ ۲');

  console.log('\n▸ جمع‌بندی (Measured @ ' + N_ATT + ' رکوردِ حضور، ' + CONC + ' هم‌زمان):');
  console.log(`  p95 حافظه: ${Math.max(mem1.p95, mem2.p95)}ms · p95 DB-native: ${Math.max(db1.p95, db2.p95)}ms`);
  console.log(`  خطاها: mem=${mem1.errs + mem2.errs} db=${db1.errs + db2.errs}`);
  console.log('  ⚠ Target≠Measured: هدفِ بریف scale=0.01 (~1.4GB) بود — در این sandbox NOT-RUN (RAM ~1GB).');

  await pool.end();
  await c.end();
  const adminEnd = new Client({ connectionString: BASE_URL });
  await adminEnd.connect();
  await adminEnd.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await adminEnd.end();
}

main().catch((e) => { console.error('خطا:', e.message); process.exit(1); });
