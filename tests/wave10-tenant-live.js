#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave10-tenant-live.js — جداسازیِ tenant رویِ PostgreSQL «زنده» (موج ۱۰ ادامه)
   ───────────────────────────────────────────────────────────────────
   چرا این سوئیت: گیت‌هایِ موجود (wave5-authz T25..T31) فقط «متنِ SQL»ِ
   builderها را می‌سنجند؛ هیچ‌جا رفتارِ واقعی — این‌که PG با آن SQL و آن
   پارامترها واقعاً سطرِ مدرسهٔ دیگر را برنگرداند — رویِ دیتابیسِ زنده
   اثبات نشده بود. این‌جا دادهٔ دو مدرسه رویِ PG واقعی seed می‌شود و
   همان مسیرِ تولید (dbquery builders → executePagedList → pg) با نقش‌های
   مختلف اجرا و «نشت» با شمارش و id-set سنجیده می‌شود.

   بخش L — جداسازیِ زنده:
     L1  مدیرِ مدرسهٔ ۱: attendance فقط school 1 (id-set دقیق، صفر نشت)
     L2  مدیرِ مدرسهٔ ۱: grades فقط school 1
     L3  مدیرِ مدرسهٔ ۱: classes فقط school 1
     L4  مدیرِ مدرسهٔ ۱: users-directory فقط school 1 + حساب‌هایِ ملی
         (school_id NULL) هرگز نشت نمی‌کنند
     L5  دانش‌آموز: grades فقط سطرهایِ خودش (نه هم‌مدرسه‌ای)
     L6  ولی: attendance فقط فرزندِ لینک‌شده
     L7  دبیر: attendance فقط کلاس‌هایی که واقعاً درس می‌دهد
     L8  دبیر: grades = اجتماعِ policy (خود-نوشته ∪ درسِ خودش ∪ کلاسِ خودش)
         — نه نمرهٔ کلاسِ غیرمرتبطِ همان مدرسه
     L9  total ی count هم tenant-scoped است (نه شمارِ سراسری)
     L10 superadmin (SUPER_SCOPED): هر دو مدرسه را می‌بیند — گواهِ این‌که
         داده‌ی هر دو مدرسه واقعاً در جدول هست و سبزیِ L1..L9 بی‌جهت نیست

   self-skip: بدونِ باینری‌هایِ PG (PATH یا PG_LIVE_BIN) یا ماژولِ pg
   خروجی 0/0 skip و exit 0 — CI قرمز نمی‌شود (الگوی wave10-pg-live.js).

   اجرا:
     PG_LIVE_BIN=/path/to/pg/bin node tests/wave10-tenant-live.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 240) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }
function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}

/* ── کشفِ باینری‌ها و ماژول (شرطِ self-skip — الگوی wave10-pg-live) ── */
function findPgBin() {
  const cand = [];
  if (process.env.PG_LIVE_BIN) cand.push(process.env.PG_LIVE_BIN);
  try {
    const w = cp.execSync('which initdb', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w) cand.push(path.dirname(w));
  } catch (e) {}
  for (const d of cand) {
    if (['initdb', 'postgres', 'pg_ctl'].every((b) => fs.existsSync(path.join(d, b)))) return d;
  }
  return null;
}
function hasPgModule() { try { require.resolve('pg'); return true; } catch (e) { return false; } }

const BIN = findPgBin();
if (!BIN || !hasPgModule()) {
  skip('wave10 tenant live gate', !BIN ? 'باینری‌هایِ PostgreSQL (initdb/postgres/pg_ctl) در PATH/PG_LIVE_BIN نیستند'
    : 'ماژولِ pg نصب نیست');
  console.error('\nwave10-tenant-live: NOT-RUN — PostgreSQL prerequisite missing; this suite cannot produce green evidence.\n');
  process.exit(1);
}

const PORT = 55460;
const DATA = '/tmp/w10tenant-' + process.pid;
const ROOT = path.join(__dirname, '..');

function pgctl(args) {
  return cp.execSync(path.join(BIN, 'pg_ctl') + ' -D ' + DATA + ' ' + args,
    { stdio: 'pipe', timeout: 60000 }).toString();
}
function cleanup() {
  try { pgctl('stop -m immediate -w'); } catch (e) {}
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

(async () => {
  const { Client } = require('pg');
  console.log('\nwave10-tenant-live — جداسازیِ tenant رویِ PG واقعی (builders→executePagedList→pg)\n');

  /* ── بوت ── */
  cp.execSync(path.join(BIN, 'initdb') + ' -D ' + DATA + ' -U payesh --auth=trust -E UTF8',
    { stdio: 'pipe', timeout: 120000 });
  fs.appendFileSync(DATA + '/postgresql.conf',
    "\nport = " + PORT + "\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '" + DATA + "'\n");
  pgctl('start -w -l ' + DATA + '/log.txt');

  const admin = new Client({ host: '127.0.0.1', port: PORT, user: 'payesh', database: 'postgres' });
  await admin.connect();
  await admin.query('CREATE DATABASE payesh');
  await admin.end();

  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'payesh', database: 'payesh' });
  await c.connect();

  /* migrations واقعیِ مخزن */
  const files = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.includes('.down.')).sort();
  const { execFileSync } = require('child_process');
  const dbUrl = `postgres://payesh@127.0.0.1:${PORT}/payesh`;
  for (const f of files) {
const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8');
    if (/^[^\n]*\\gset\s*$/m.test(sql) || /^\\[a-z]/m.test(sql)) {
      /* فایلِ متاکامنددار — قرارداد §۹.۷ WAVE10_DB_SCALE: فقط psql (الگوی #163) */
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '-f', path.join(ROOT, 'migrations', f), dbUrl], { stdio: 'pipe' });
    } else {
      await c.query(sql);
    }
  }

  /* ── seed دو مدرسه ─────────────────────────────────────────────
     مدرسهٔ ۱: مدیر 11 · دبیر 12 (درسِ 501 در کلاس 101) · دانش‌آموزان 13/14 · ولی 15 (فرزند: 13)
     مدرسهٔ ۲: مدیر 21 · دانش‌آموز 23
     کلاس 102 در مدرسهٔ ۱ که دبیر 12 هیچ ربطی به آن ندارد (برای L7/L8). */
  await c.query("INSERT INTO schools (id, name) VALUES (1,'مدرسه یک'), (2,'مدرسه دو')");
  await c.query(`INSERT INTO users (id, role, school_id, full_name) VALUES
    (11,'manager',1,'مدیر ۱'), (12,'teacher',1,'دبیر ۱'), (13,'student',1,'دانش‌آموز ۱۳'),
    (14,'student',1,'دانش‌آموز ۱۴'), (15,'parent',1,'ولی ۱۵'),
    (21,'manager',2,'مدیر ۲'), (23,'student',2,'دانش‌آموز ۲۳'),
    (99,'superadmin',NULL,'حساب ملی')`);
  await c.query(`INSERT INTO classes (id, school_id, name) VALUES
    (101,1,'کلاس ۱۰۱'), (102,1,'کلاس ۱۰۲'), (201,2,'کلاس ۲۰۱')`);
  await c.query("INSERT INTO subjects (id, school_id, name) VALUES (501,1,'ریاضی'), (502,1,'علوم'), (601,2,'ریاضی۲')");
  await c.query("INSERT INTO schedule (id, school_id, class_id, teacher_id, subject_id, day, period) VALUES (1,1,101,12,501,'شنبه','۱')");
  await c.query("INSERT INTO parent_links (id, parent_id, student_id) VALUES (1,15,13)");
  await c.query(`INSERT INTO attendance (id, school_id, student_id, class_id, date, status) VALUES
    (1001,1,13,101,'2026-09-10','present'), (1002,1,14,102,'2026-09-10','absent'),
    (2001,2,23,201,'2026-09-10','present')`);
  await c.query(`INSERT INTO grades (id, school_id, student_id, class_id, subject_id, teacher_id, score, term) VALUES
    (3001,1,13,101,501,12,17,'نوبت اول'),
    (3002,1,14,102,502,11,15,'نوبت اول'),
    (4001,2,23,201,601,21,19,'نوبت اول')`);

  /* db سازگار با executePagedList (فقط query — مثل حالتِ بدونِ رپلیکا) */
  const db = { query: (sql, params) => c.query(sql, params) };
  const {
    buildAttendanceList, buildGradesList, buildClassesList, buildUsersList, executePagedList
  } = require(path.join(ROOT, 'server', 'dbquery.js'));

  const run = (built) => executePagedList(db, built, { limit: 50, cursor: null });
  const ids = (r) => r.data.map((x) => Number(x.id)).sort((a, b) => a - b).join(',');

  const mgr1 = { id: 11, role: 'manager', school_id: 1 };
  const stu13 = { id: 13, role: 'student', school_id: 1 };
  const par15 = { id: 15, role: 'parent', school_id: 1 };
  const tch12 = { id: 12, role: 'teacher', school_id: 1 };
  const sup = { id: 99, role: 'superadmin', school_id: null };

  console.log('▸ بخش L — جداسازیِ زنده');

  const a1 = await run(buildAttendanceList({ user: mgr1, limit: 50 }));
  chk('L1 مدیرِ ۱: attendance دقیقاً {1001,1002} — سطرِ 2001 مدرسهٔ ۲ نشت نکرد',
    ids(a1) === '1001,1002', 'ids=' + ids(a1));

  const g1 = await run(buildGradesList({ user: mgr1, limit: 50 }));
  chk('L2 مدیرِ ۱: grades دقیقاً {3001,3002} — نمرهٔ 4001 مدرسهٔ ۲ نشت نکرد',
    ids(g1) === '3001,3002', 'ids=' + ids(g1));

  const c1 = await run(buildClassesList({ user: mgr1, limit: 50 }));
  chk('L3 مدیرِ ۱: classes دقیقاً {101,102} — کلاس 201 نشت نکرد',
    ids(c1) === '101,102', 'ids=' + ids(c1));

  const u1 = await run(buildUsersList({ user: mgr1, limit: 50 }));
  const u1ids = ids(u1);
  chk('L4 مدیرِ ۱: users فقط مدرسهٔ ۱ — نه کاربرِ مدرسهٔ ۲، نه حسابِ ملیِ NULL',
    u1ids === '11,12,13,14,15', 'ids=' + u1ids);

  const g5 = await run(buildGradesList({ user: stu13, limit: 50 }));
  chk('L5 دانش‌آموز ۱۳: grades فقط {3001} — نه نمرهٔ هم‌مدرسه‌ایِ 3002',
    ids(g5) === '3001', 'ids=' + ids(g5));

  const a6 = await run(buildAttendanceList({ user: par15, limit: 50 }));
  chk('L6 ولی ۱۵: attendance فقط فرزندِ لینک‌شده {1001} — نه 1002',
    ids(a6) === '1001', 'ids=' + ids(a6));

  const a7 = await run(buildAttendanceList({ user: tch12, limit: 50 }));
  chk('L7 دبیر ۱۲: attendance فقط کلاسِ خودش {1001} — نه کلاسِ 102 همان مدرسه',
    ids(a7) === '1001', 'ids=' + ids(a7));

  const g8 = await run(buildGradesList({ user: tch12, limit: 50 }));
  chk('L8 دبیر ۱۲: grades = اجتماعِ policy {3001} — نه 3002 (کلاس/درسِ غیرمرتبط)',
    ids(g8) === '3001', 'ids=' + ids(g8));

  chk('L9 total ی count هم tenant-scoped است (attendance مدیرِ ۱ = 2، نه 3)',
    a1.pagination.total === 2 && g1.pagination.total === 2,
    'att=' + a1.pagination.total + ' grd=' + g1.pagination.total);

  const aSup = await run(buildAttendanceList({ user: sup, limit: 50 }));
  chk('L10 superadmin هر دو مدرسه را می‌بیند {1001,1002,2001} — گواهِ حضورِ دادهٔ هر دو tenant',
    ids(aSup) === '1001,1002,2001', 'ids=' + ids(aSup));

  await c.end();
  finish();
})().catch((e) => { console.error('FATAL', e); cleanup(); process.exit(2); });
