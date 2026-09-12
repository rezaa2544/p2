#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/docs-refs-check.js — ارجاعِ مستندات به فایل‌های ناموجود

   چرا
   ───
   مستندات به مسیرهای کد ارجاع می‌دهند (`tests/x.js`، `tools/y.js`،
   `src/js/z.js`، `docs/w.md`). وقتی آن فایل تغییرِ نام می‌گیرد یا حذف
   می‌شود، ارجاع ساکت می‌ماند و سند دروغ می‌گوید. در ۲۰۲۶-۰۹-۱۲ شانزده
   ارجاعِ کهنه به تست‌های ناموجود پیدا شد — هیچ‌کدام هیچ تستی را قرمز
   نمی‌کرد، چون هیچ چیزی این را نمی‌سنجید.

   این ابزار همان کاری را می‌کند که tools/docs-stats-sync.js برای شمارها
   کرد: یک واقعیتِ قابلِ شمارش (وجودِ فایل) را به یک گیت تبدیل می‌کند.

   سیاستِ «جغجغه» (ratchet)
   ────────────────────────
   بیشترِ ارجاع‌های کهنه در **گزارش‌های تاریخیِ نقطه‌درزمانی**‌اند و
   ویرایششان یعنی جعلِ سابقه. پس بدهیِ موجود در یک خطِ پایه
   (tools/docs-refs-baseline.json) ثبت می‌شود و **فقط ارجاعِ کهنهٔ تازه**
   گیت را قرمز می‌کند. بدهی قدیمی حذف نمی‌شود، فقط دیگر رشد نمی‌کند.

   استفاده
   ───────
     node tools/docs-refs-check.js            # گزارشِ کامل
     node tools/docs-refs-check.js --check    # exit 1 اگر ارجاعِ کهنهٔ تازه باشد
     node tools/docs-refs-check.js --baseline # بازتولیدِ خطِ پایه (با دلیل!)
     node tools/docs-refs-check.js --json

   اجرا: node tools/docs-refs-check.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'docs-refs-baseline.json');

/* الگوهایی که «ارجاع به یک فایلِ واقعی» حساب می‌شوند. عمداً محدود به
   پیشوندهای شناخته‌شدهٔ مخزن‌اند تا نویزِ متنِ فارسی گرفته نشود. */
/* دو نکتهٔ رگکس که هر دو باگِ واقعی بودند:
   ۱) جایگزین‌ها باید **بلندترین اول** بیایند، وگرنه `js` پیش از `json` می‌خورد و
      ‏`tools/x.json` به `tools/x.js` بریده می‌شود (ارجاعِ کهنهٔ ساختگی).
   ۲) پسا‌نگرِ `(?![A-Za-z0-9_.-])` تا پسوند، پیشوندِ یک پسوندِ بلندتر نباشد. */
const REF_RE = /\b((?:tests|tools|scripts|src\/js|docs|migrations|server|infra)\/[A-Za-z0-9_.\-\/]+\.(?:json|yaml|yml|html|css|sql|js|md|sh|ps1))(?![A-Za-z0-9_.-])/g;

/* پیشوندهایی که واقعاً در این مخزن فایل نگه می‌دارند */
const REAL_PREFIXES = ['tests/', 'tools/', 'scripts/', 'src/js/', 'docs/', 'migrations/', 'server/', 'infra/'];

/* مسیرهایی که ارجاعِ «قالب/نمونه»‌اند، نه ادعای وجودِ فایل. این‌ها را
   عمداً رد می‌کنیم: سند دارد الگو نشان می‌دهد، نه دروغ می‌گوید.
   اگر موردِ تازه‌ای از این جنس دیدید، به‌جای گذاشتن در خطِ پایه این‌جا
   اضافه کنید — خطِ پایه برای بدهیِ واقعی است، نه برای نویز. */
const TEMPLATE_PATTERNS = [
  /(?:^|\/)MODULE\.js$/,            // جای‌نگهدارِ عمومی در راهنمای ماژول
  /(?:^|\/)[A-Za-z0-9]+-my-feature\.js$/, // «ماژولِ خود را این‌جا بسازید» (۲۵-، ‏NN-، …)
  /(?:^|\/)_order\.js$/,            // تصویرِ ترتیبِ بیلد، نه یک فایل
  /^docs\/_export\//,               // خروجیِ تولیدشدهٔ export، کامیت نمی‌شود
];
const isTemplate = (ref) => TEMPLATE_PATTERNS.some((re) => re.test(ref));

function scanDir(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanDir(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
}

/* همهٔ سندها: docs/ (بازگشتی) + ریشهٔ مخزن */
function allDocs() {
  const out = [];
  scanDir(path.join(ROOT, 'docs'), out);
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.md') && fs.statSync(path.join(ROOT, f)).isFile()) out.push(path.join(ROOT, f));
  }
  return out.sort();
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function findRefs() {
  const byDoc = new Map();     // doc -> Set(missing ref)
  const byRef = new Map();     // ref -> Set(doc)
  for (const doc of allDocs()) {
    const src = fs.readFileSync(doc, 'utf8');
    for (const m of src.matchAll(REF_RE)) {
      const ref = m[1].replace(/[.,؛)]+$/, '');
      if (!REAL_PREFIXES.some((p) => ref.startsWith(p))) continue;
      /* ارجاع‌های دارای placeholder واقعاً مسیر نیستند */
      if (/[<>{}*]/.test(ref)) continue;
      if (isTemplate(ref)) continue;
      if (fs.existsSync(path.join(ROOT, ref))) continue;
      const d = rel(doc);
      if (!byDoc.has(d)) byDoc.set(d, new Set());
      byDoc.get(d).add(ref);
      if (!byRef.has(ref)) byRef.set(ref, new Set());
      byRef.get(ref).add(d);
    }
  }
  return { byDoc, byRef };
}

function loadBaseline() {
  try {
    const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    return new Set(b.known || []);
  } catch (e) { return new Set(); }
}

/* کلیدِ خطِ پایه: «سند ← ارجاع». با سند کلید می‌خورد نه فقط ارجاع، تا
   سرایتِ یک ارجاعِ کهنه به سندِ تازه قرمز بماند. */
const keyOf = (doc, ref) => doc + ' → ' + ref;

function run({ check, baseline, json }) {
  const { byDoc, byRef } = findRefs();

  const pairs = [];
  for (const [doc, refs] of byDoc) for (const ref of refs) pairs.push({ doc, ref });
  pairs.sort((a, b) => (a.doc + a.ref).localeCompare(b.doc + b.ref));

  if (baseline) {
    const out = {
      _generated: new Date().toISOString().slice(0, 10),
      _why: 'ارجاع‌های کهنهٔ موجود در گزارش‌های تاریخیِ نقطه‌درزمانی — ویرایششان یعنی جعلِ سابقه. این فهرست فقط از رشدِ بدهی جلوگیری می‌کند؛ ارجاعِ کهنهٔ تازه گیت را قرمز می‌کند.',
      count: pairs.length,
      known: pairs.map((p) => keyOf(p.doc, p.ref)),
    };
    fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`✅ خطِ پایه بازنویسی شد: ${pairs.length} ارجاعِ کهنه در tools/docs-refs-baseline.json`);
    return 0;
  }

  const known = loadBaseline();
  const fresh = pairs.filter((p) => !known.has(keyOf(p.doc, p.ref)));
  const gone = [...known].filter((k) => !pairs.some((p) => keyOf(p.doc, p.ref) === k));

  if (json) {
    console.log(JSON.stringify({
      totalMissing: pairs.length,
      grandfathers: known.size,
      fresh: fresh.map((p) => ({ doc: p.doc, ref: p.ref })),
      resolvedSinceBaseline: gone,
    }, null, 2));
    return 0;
  }

  console.log(`ارجاعِ کهنه به فایلِ ناموجود: ${pairs.length} مورد در ${byDoc.size} سند`);
  console.log(`  خطِ پایه (بدهیِ تاریخی): ${known.size}`);
  console.log(`  تازه (باید رفع شود)   : ${fresh.length}`);
  if (gone.length) console.log(`  از زمانِ خطِ پایه رفع شده: ${gone.length} ← خطِ پایه را با --baseline تازه کنید`);

  if (fresh.length) {
    console.log('\nارجاع‌های کهنهٔ تازه:');
    for (const p of fresh) console.log(`  • ${p.doc} → ${p.ref}`);
  }

  if (check) {
    if (fresh.length) {
      console.error(`\n❌ ${fresh.length} ارجاعِ تازه به فایلِ ناموجود.`);
      console.error('   یا فایل را برگردانید/تغییرِ نامِ ارجاع را بدهید، یا اگر سند تاریخی است');
      console.error('   خطِ پایه را با دلیل بازتولید کنید: node tools/docs-refs-check.js --baseline');
      return 1;
    }
    console.log('\n✅ هیچ ارجاعِ کهنهٔ تازه‌ای نیست.');
    return 0;
  }

  if (byRef.size) {
    console.log('\nپرتکرارترین ارجاع‌های ناموجود:');
    [...byRef.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 8)
      .forEach(([ref, docs]) => console.log(`  ${String(docs.size).padStart(2)} سند → ${ref}`));
  }
  return 0;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  try {
    process.exit(run({ check: a.includes('--check'), baseline: a.includes('--baseline'), json: a.includes('--json') }));
  } catch (e) { console.error('❌ ' + e.message); process.exit(2); }
}

module.exports = { findRefs, allDocs, loadBaseline, keyOf };
