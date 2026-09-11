#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   migrate-helper.js — دستیارِ مهاجرت‌های اسکیما
   ───────────────────────────────────────────────────────────────────
   چرا: تصادمِ شمارهٔ `۰۰۴` (docs/MIGRATION_DECISION.md) از آنجا آمد که دو
   شاخهٔ مستقل هر دو «شمارهٔ بعدی» را حدس زدند و هیچ ابزاری جلوی آن را
   نگرفت. این ابزار شماره را از **دیسک** مشتق می‌کند.

   این جایگزینِ «دفترِ کلِ مهاجرت» نیست — هنوز هیچ ثبتِ ماشینی از
   «کدام مهاجرت روی کدام محیط اعمال شد» وجود ندارد
   (docs/MIGRATION_AUDIT.md §۵). این فقط سه کارِ فوری را مکانیزه می‌کند.

   کاربرد:
     node tools/migrate-helper.js --check          بررسیِ شماره‌گذاری و ساختار
     node tools/migrate-helper.js --next           شمارهٔ بعدی را چاپ کن
     node tools/migrate-helper.js --new <name>     جفتِ فایل از قالب بساز
     node tools/migrate-helper.js --verify <n>     راستی‌آزماییِ پس از اجرا (SQL)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'migrations');

let fail = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { fail++; console.log('  ❌ ' + m); };

// ── خواندنِ وضعیتِ دیسک ─────────────────────────────────────────────
function inventory() {
  if (!fs.existsSync(MIG)) { console.error('پوشهٔ migrations/ وجود ندارد'); process.exit(2); }
  const all = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  const forwards = all.filter((f) => !f.endsWith('.down.sql'));
  const downs = all.filter((f) => f.endsWith('.down.sql'));
  return { all, forwards, downs, num: (f) => f.slice(0, 3) };
}

// ── --next ─────────────────────────────────────────────────────────
function nextNumber() {
  const { forwards, num } = inventory();
  if (!forwards.length) return '001';
  const max = forwards.map((f) => parseInt(num(f), 10)).reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(3, '0');
}

// ── --check ────────────────────────────────────────────────────────
function check() {
  const { forwards, downs, num } = inventory();
  console.log('\n▸ migrate-helper — بررسیِ ' + forwards.length + ' مهاجرتِ forward\n');

  const nums = forwards.map(num);
  const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
  dupes.length ? bad('شمارهٔ تکراری: ' + dupes.join(',')) : ok('هیچ شمارهٔ تکراری نیست');

  const expected = nums.map((_, i) => String(i + 1).padStart(3, '0'));
  JSON.stringify(nums) === JSON.stringify(expected)
    ? ok('شماره‌ها از ۰۰۱ پیوسته‌اند (' + nums.join(' ') + ')')
    : bad('شماره‌ها پیوسته نیستند — انتظار ' + expected.join(' ') + ' · یافت ' + nums.join(' '));

  const noDown = forwards.filter((f) => !downs.includes(f.replace(/\.sql$/, '.down.sql')));
  noDown.length ? bad('بدونِ فایلِ برگشت: ' + noDown.join(',')) : ok('همه جفتِ رفت/برگشت دارند');

  const orphan = downs.filter((d) => !forwards.includes(d.replace(/\.down\.sql$/, '.sql')));
  orphan.length ? bad('.down.sql یتیم: ' + orphan.join(',')) : ok('هیچ .down.sql یتیمی نیست');

  for (const f of forwards) {
    const body = fs.readFileSync(path.join(MIG, f), 'utf8')
      .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    const problems = [];
    if (!/BEGIN;/.test(body)) problems.push('BEGIN;');
    if (!/COMMIT;/.test(body)) problems.push('COMMIT;');
    if (/\bDROP\s+TABLE\b/i.test(body)) problems.push('DROP TABLE (انقباض باید جدا باشد)');
    for (const b of (body.match(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi) || [])) {
      if (!/\bIF\s+(NOT\s+)?EXISTS\b/i.test(b)) { problems.push('بلوکِ DO بدونِ بررسیِ وجود'); break; }
    }
    const rest = body.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, ' ');
    const DDL = /^(CREATE\s+(TABLE|INDEX|SEQUENCE|VIEW|MATERIALIZED\s+VIEW)|ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN)/i;
    const unguarded = rest.split(';').map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => DDL.test(s) && !/\bIF\s+(NOT\s+)?EXISTS\b/i.test(s));
    if (unguarded.length) problems.push(unguarded.length + ' DDL بدونِ IF [NOT] EXISTS');
    problems.length ? bad(f + ' → ' + problems.join(' · ')) : ok(f);
  }

  const guide = fs.readFileSync(path.join(ROOT, 'docs/MIGRATION_GUIDE.md'), 'utf8');
  const missing = forwards.filter((f) => !guide.includes(f));
  missing.length ? bad('در docs/MIGRATION_GUIDE.md §۸ ردیف ندارد: ' + missing.join(','))
    : ok('همهٔ مهاجرت‌ها در جدولِ §۸ راهنما ردیف دارند');

  console.log('\n──────────────────────────────────────────');
  console.log(fail === 0 ? 'migrate-helper --check: سبز ✅  (شمارهٔ بعدی: ' + nextNumber() + ')'
    : 'migrate-helper --check: قرمز ❌  (' + fail + ' مورد)');
  return fail === 0 ? 0 : 1;
}

// ── --new <name> ───────────────────────────────────────────────────
function scaffold(rawName) {
  const name = String(rawName || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  if (!name) { console.error('نامِ معتبر بدهید (فقط a-z0-9_). مثال: --new wave4_audit_index'); return 2; }
  const n = nextNumber();
  const base = n + '_' + name;
  const fwd = path.join(MIG, base + '.sql');
  const dwn = path.join(MIG, base + '.down.sql');
  if (fs.existsSync(fwd) || fs.existsSync(dwn)) { console.error('فایل از پیش وجود دارد: ' + base); return 2; }

  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(fwd, `-- ═══════════════════════════════════════════════════════════════
-- ${base}.sql — <یک جمله: این مهاجرت چه می‌کند>
-- ───────────────────────────────────────────────────────────────
-- چرا: <چرا این تغییر لازم است؛ اگر مسیرِ پرترافیک را لمس می‌کند،
--       خروجیِ EXPLAIN ANALYZE قبل/بعد را در گزارشِ موج بیاورید>
--
-- قرارداد (docs/MIGRATION_GUIDE.md §۱ و §۷.۱):
--   • توان‌پذیر: هر DDL با IF [NOT] EXISTS
--   • تراکنشی: BEGIN; … COMMIT;
--   • بدونِ DROP TABLE — انقباض باید مهاجرتِ جدا باشد
--   • CREATE INDEX CONCURRENTLY داخلِ تراکنش ممکن نیست؛ روی تولید
--     دستی با CONCURRENTLY اعمال کنید
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- CREATE INDEX IF NOT EXISTS idx_<table>_<cols> ON <table> (<cols>);

COMMIT;
`);
  fs.writeFileSync(dwn, `-- Rollback for ${base}.sql
-- اگر DROP COLUMN یا DROP TABLE دارید، صریح بنویسید:
-- «پس از نوشتنِ داده، این بازگشت داده از دست می‌دهد» (راهنما §۴).
BEGIN;

-- DROP INDEX IF EXISTS idx_<table>_<cols>;

COMMIT;
`);
  console.log('ساخته شد:');
  console.log('  migrations/' + base + '.sql');
  console.log('  migrations/' + base + '.down.sql');
  console.log('\nگام‌های بعدی (docs/MIGRATION_GUIDE.md §۷.۱):');
  console.log('  ۱. بدنه را پر کنید — هر DDL با IF [NOT] EXISTS');
  console.log('  ۲. node tools/migrate-helper.js --check');
  console.log('  ۳. node tests/migration-sequence.js');
  console.log('  ۴. رفت → برگشت → رفتِ دوباره روی پستگرسِ محلی');
  console.log('  ۵. ردیفِ ' + String(parseInt(n, 10)).padStart(1, '0') + ' را به جدولِ §۸ docs/MIGRATION_GUIDE.md اضافه کنید');
  return 0;
}

// ── --verify <n> : SQL راستی‌آزماییِ پس از اجرا ──────────────────────
function verify(n) {
  const pad = String(n || '').padStart(3, '0');
  const { forwards } = inventory();
  const f = forwards.find((x) => x.startsWith(pad + '_'));
  if (!f) { console.error('مهاجرتِ ' + pad + ' پیدا نشد'); return 2; }
  const body = fs.readFileSync(path.join(MIG, f), 'utf8');

  console.log('\n▸ راستی‌آزماییِ پس از اجرا — ' + f);
  console.log('  (این خروجیِ SQL را می‌دهد؛ روی psql محیطِ مقصد اجرا کنید)\n');

  const idx = [...body.matchAll(/CREATE INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)/gi)]
    .map((m) => ({ name: m[1], table: m[2] }));
  const cols = [...body.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)\s+([A-Z]+)/gi)]
    .map((m) => ({ table: m[1], col: m[2], type: m[3] }));
  const tabs = [...body.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map((m) => m[1]);
  const seqs = [...body.matchAll(/CREATE SEQUENCE IF NOT EXISTS\s+(\w+)/gi)].map((m) => m[1]);

  if (idx.length) {
    console.log('-- ایندکس‌ها (' + idx.length + ') باید وجود داشته باشند:');
    console.log("SELECT indexname FROM pg_indexes WHERE indexname IN (" +
      idx.map((i) => "'" + i.name + "'").join(', ') + ') ORDER BY 1;');
    console.log('-- انتظار: ' + idx.length + ' ردیف\n');
  }
  if (cols.length) {
    console.log('-- ستون‌ها (' + cols.length + ') باید وجود داشته باشند:');
    console.log("SELECT table_name, column_name, data_type FROM information_schema.columns");
    console.log(' WHERE ' + cols.map((c) => "(table_name='" + c.table + "' AND column_name='" + c.col + "')").join('\n    OR ') + ';');
    console.log('-- انتظار: ' + cols.length + ' ردیف\n');
  }
  if (tabs.length) {
    console.log('-- جدول‌ها (' + tabs.length + '):');
    console.log("SELECT tablename FROM pg_tables WHERE tablename IN (" +
      tabs.map((t) => "'" + t + "'").join(', ') + ') ORDER BY 1;\n');
  }
  if (seqs.length) {
    console.log('-- دنباله‌ها (' + seqs.length + '):');
    console.log("SELECT sequencename FROM pg_sequences WHERE sequencename IN (" +
      seqs.map((s) => "'" + s + "'").join(', ') + ');\n');
  }
  if (!idx.length && !cols.length && !tabs.length && !seqs.length) {
    console.log('-- این مهاجرت شیءِ ساختاریِ قابلِ راستی‌آزمایی نمی‌سازد؛');
    console.log('-- نتیجهٔ \\d <جدولِ لمس‌شده> و شمارش‌ها را در گزارشِ موج ثبت کنید.');
  }
  console.log('-- سپس سه گیتِ همیشگی (راهنما §۲.۴):');
  console.log('--   node tests/smoke.js && node tools/check-authz.js && node tests/secret-scan.js');
  return 0;
}

// ── main ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--check')) process.exit(check());
if (argv.includes('--next')) { console.log(nextNumber()); process.exit(0); }
if (argv.includes('--new')) process.exit(scaffold(argv[argv.indexOf('--new') + 1]));
if (argv.includes('--verify')) process.exit(verify(argv[argv.indexOf('--verify') + 1]));

console.log(`مهاجرت‌های روی دیسک: ${inventory().forwards.length} · شمارهٔ بعدی: ${nextNumber()}

کاربرد:
  node tools/migrate-helper.js --check          بررسیِ شماره‌گذاری و ساختار
  node tools/migrate-helper.js --next           شمارهٔ بعدی
  node tools/migrate-helper.js --new <name>     ساختِ جفتِ فایل از قالب
  node tools/migrate-helper.js --verify <n>     SQL راستی‌آزماییِ پس از اجرا

قرارداد: docs/MIGRATION_GUIDE.md §۱.۱ و §۷.۱`);
process.exit(0);
