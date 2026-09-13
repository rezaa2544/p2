#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   migration-009-live.js — گیتِ زندهٔ مهاجرت ۰۰۹ (CHECK + ایندکسِ مرکب)
   ───────────────────────────────────────────────────────────────────
   قاعدهٔ ۴ بریف: مهاجرت = forward + down + تست از DB خالی + DB دارای
   داده + ردِ مقدارِ نامعتبر + rollback رفت/برگشت — همه رویِ PG *زنده*.

   M1  زنجیرهٔ ۰۰۱..۰۰۹ رویِ دیتابیسِ خالی بدونِ خطا اعمال می‌شود
   M2  چهار CHECK + ایندکسِ مرکب پس از ۰۰۹ در کاتالوگ موجودند
   M3  ردیفِ معتبر (هر ۴ kind × ۲ format × ۲ status) پذیرفته می‌شود
   M4  kind نامعتبر ⇒ 23514 (check_violation)
   M5  format نامعتبر (از جمله 'screen' که هیچ مسیرِ کدی نمی‌نویسد) ⇒ 23514
   M6  status نامعتبر ⇒ 23514
   M7  generated_by غیرعددی ⇒ 23514؛ NULL پذیرفته
   M8  down ⇒ قیدها/ایندکس حذف؛ ردیفِ پیش‌تر-نامعتبر حالا پذیرفته (اثباتِ
       واقعی بودنِ rollback)؛ re-apply رویِ دیتابیسِ *دارای داده* دوباره سبز
   M9  پس از re-apply، دادهٔ موجودِ معتبر دست‌نخورده و قیدها دوباره فعال‌اند
   M10 idempotency ایندکس: اجرای دوبارهٔ ۰۰۹ رویِ دیتابیسِ دارای قید خطای
       تکراری می‌دهد (قیدها ADD CONSTRAINT بدونِ IF NOT EXISTS اند — عمدی،
       مثل زنجیرهٔ موجود: هر مهاجرت فقط یک‌بار اجرا می‌شود)؛ ولی پس از down
       کامل، apply مجدد سبز است (رفت/برگشت/رفت)

   بدونِ باینری‌هایِ PG (PATH یا PG_LIVE_BIN) یا ماژولِ pg: self-skip.
   اجرا:
     PG_LIVE_BIN=/path/to/pg/bin node tests/migration-009-live.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

let okc = 0, failc = 0, skipped = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function skip(name, why) { skipped++; console.log('  ⏭️  ' + name + '  —  ' + why); }
function finish() {
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc)
    + (skipped ? ' (' + skipped + ' skip)' : ''));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
}

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
  skip('migration-009 live gate', !BIN ? 'باینری‌هایِ PostgreSQL در PATH/PG_LIVE_BIN نیستند' : 'ماژولِ pg نصب نیست');
  console.log('\nmigration-009-live: 0/0 (skip)؛ سبزِ نهایی: ✅\n');
  process.exit(0);
}

const PORT = 55452;
const DATA = '/tmp/mig009-' + process.pid;
const ROOT = path.join(__dirname, '..');

function pgctl(args) {
  return cp.execSync(path.join(BIN, 'pg_ctl') + ' -D ' + DATA + ' ' + args, { stdio: 'pipe', timeout: 60000 }).toString();
}
function cleanup() {
  try { pgctl('stop -m immediate -w'); } catch (e) {}
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const FWD = path.join(ROOT, 'migrations', '009_report_logs_constraints.sql');
const DOWN = path.join(ROOT, 'migrations', '009_report_logs_constraints.down.sql');

async function main() {
  const { Client } = require('pg');
  console.log('\nmigration-009-live — CHECK + ایندکسِ مرکبِ report_logs رویِ PG زنده\n');

  cp.execSync(path.join(BIN, 'initdb') + ' -D ' + DATA + ' -U payesh --auth=trust -E UTF8', { stdio: 'pipe', timeout: 120000 });
  fs.appendFileSync(DATA + '/postgresql.conf',
    "\nport = " + PORT + "\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '" + DATA + "'\n");
  pgctl('start -w -l ' + DATA + '/log.txt');
  const admin = new Client({ host: '127.0.0.1', port: PORT, user: 'payesh', database: 'postgres' });
  await admin.connect(); await admin.query('CREATE DATABASE payesh'); await admin.end();
  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'payesh', database: 'payesh' });
  await c.connect();

  /* M1 — کل زنجیره روی DB خالی */
  let m1ok = true, m1err = '';
  const files = fs.readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.includes('.down.')).sort();
  for (const f of files) {
    try { await c.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')); }
    catch (e) { m1ok = false; m1err = f + ': ' + e.message; break; }
  }
  chk('M1 زنجیرهٔ ۰۰۱..۰۰۹ رویِ دیتابیسِ خالی', m1ok && files[files.length - 1].startsWith('009'), m1err);

  /* M2 — قیدها و ایندکس در کاتالوگ */
  const cons = (await c.query(
    "SELECT conname FROM pg_constraint WHERE conrelid='report_logs'::regclass AND contype='c' ORDER BY 1")).rows.map((r) => r.conname);
  const idx = (await c.query(
    "SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_report_logs_school_updated_id','idx_attendance_school_updated_id','idx_grades_school_updated_id') ORDER BY 1")).rows.map((r) => r.indexname);
  chk('M2 چهار CHECK + سه ایندکسِ مرکب موجودند',
    ['chk_report_logs_format', 'chk_report_logs_generated_by', 'chk_report_logs_kind', 'chk_report_logs_status']
      .every((x) => cons.includes(x)) && idx.length === 3, JSON.stringify({ cons, idx }));

  /* M3 — همهٔ ترکیب‌های معتبر */
  await c.query("INSERT INTO schools (id,name) VALUES (1,'مدرسه ۰۰۹') ON CONFLICT (id) DO NOTHING");
  let m3ok = true, m3err = '';
  try {
    for (const k of ['attendance', 'academic', 'finance', 'teachers'])
      for (const f of ['csv', 'pdf'])
        for (const s of ['generated', 'synced'])
          await c.query(
            "INSERT INTO report_logs (school_id,kind,format,status,generated_by,created_at,updated_at) VALUES (1,$1,$2,$3,'42',now(),now())",
            [k, f, s]);
  } catch (e) { m3ok = false; m3err = e.message; }
  chk('M3 هر ۱۶ ترکیبِ معتبرِ kind×format×status پذیرفته می‌شود', m3ok, m3err);

  async function expectCheck(name, sql, params) {
    try { await c.query(sql, params); chk(name, false, 'پذیرفته شد!'); }
    catch (e) { chk(name, e.code === '23514', 'code=' + e.code); }
  }
  await expectCheck('M4 kind نامعتبر (bogus) ⇒ 23514',
    "INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'bogus','csv','generated')");
  await expectCheck("M5 format نامعتبر ('screen' — هیچ مسیرِ کدی نمی‌نویسد) ⇒ 23514",
    "INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'attendance','screen','generated')");
  await expectCheck('M6 status نامعتبر (draft) ⇒ 23514',
    "INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'attendance','csv','draft')");
  await expectCheck('M7a generated_by غیرعددی ⇒ 23514',
    "INSERT INTO report_logs (school_id,kind,format,status,generated_by) VALUES (1,'attendance','csv','generated','admin')");
  let m7b = true, m7berr = '';
  try {
    await c.query("INSERT INTO report_logs (school_id,kind,format,status,generated_by) VALUES (1,'attendance','csv','generated',NULL)");
  } catch (e) { m7b = false; m7berr = e.message; }
  chk('M7b generated_by = NULL پذیرفته می‌شود', m7b, m7berr);

  /* M8 — down: قیدها بروند، نامعتبر پذیرفته شود؛ سپس re-apply روی DB دارای داده */
  await c.query(fs.readFileSync(DOWN, 'utf8'));
  const consAfterDown = (await c.query(
    "SELECT count(*) c FROM pg_constraint WHERE conrelid='report_logs'::regclass AND contype='c'")).rows[0].c;
  let m8loose = true;
  try { await c.query("INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'bogus','screen','draft')"); }
  catch (e) { m8loose = false; }
  chk('M8a down: قیدها حذف و ردیفِ نامعتبر (موقتاً) پذیرفته می‌شود',
    Number(consAfterDown) === 0 && m8loose);
  /* ردیفِ زباله را پاک کن تا VALIDATE ی re-apply صادقانه سبز شود (دیتابیسِ
     دارای داده = ۱۷ ردیفِ معتبرِ M3/M7b) */
  await c.query("DELETE FROM report_logs WHERE kind='bogus'");
  let m8re = true, m8err = '';
  try { await c.query(fs.readFileSync(FWD, 'utf8')); } catch (e) { m8re = false; m8err = e.message; }
  chk('M8b re-apply رویِ دیتابیسِ دارای ۱۷ ردیفِ معتبر (VALIDATE واقعی)', m8re, m8err);

  /* M8c — اثباتِ fail-closed بودنِ VALIDATE: با زباله در جدول، apply باید قرمز شود */
  await c.query(fs.readFileSync(DOWN, 'utf8'));
  await c.query("INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'bogus','csv','generated')");
  let m8c = false, m8cCode = '';
  try { await c.query(fs.readFileSync(FWD, 'utf8')); }
  catch (e) { m8c = true; m8cCode = e.code; await c.query('ROLLBACK').catch(() => {}); }
  chk('M8c apply رویِ دیتابیسِ دارای زباله ⇒ VALIDATE قرمز (23514، نه سبزِ ساکت)', m8c && m8cCode === '23514', 'code=' + m8cCode);
  await c.query("DELETE FROM report_logs WHERE kind='bogus'");
  await c.query(fs.readFileSync(FWD, 'utf8'));

  /* M9 — دادهٔ معتبر دست‌نخورده + قیدها فعال */
  const nRows = Number((await c.query('SELECT count(*) c FROM report_logs')).rows[0].c);
  let m9enforced = false;
  try { await c.query("INSERT INTO report_logs (school_id,kind,format,status) VALUES (1,'bogus','csv','generated')"); }
  catch (e) { m9enforced = e.code === '23514'; }
  chk('M9 پس از رفت/برگشت/رفت: ۱۷ ردیفِ معتبر سرِ جا و قیدها فعال', nRows === 17 && m9enforced, 'rows=' + nRows);

  /* M10 — دوباره‌اجرا بدونِ down ⇒ قیدِ تکراری (42710) — سیاستِ عمدیِ زنجیره */
  let m10 = false, m10code = '';
  try { await c.query(fs.readFileSync(FWD, 'utf8')); }
  catch (e) { m10 = true; m10code = e.code; await c.query('ROLLBACK').catch(() => {}); }
  chk('M10 اجرایِ دوبارهٔ ۰۰۹ بدونِ down ⇒ 42710 (هر مهاجرت یک‌بار — مثل بقیهٔ زنجیره)', m10 && m10code === '42710', 'code=' + m10code);

  await c.end();
  finish();
}
main().catch((e) => { chk('اجرایِ گیت بدونِ خطایِ پیش‌بینی‌نشده', false, e.stack || e.message); finish(); });
