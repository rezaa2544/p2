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

/* ── قاعدهٔ «تولیدی» (نه خطِ پایه) ─────────────────────────────────
   بعضی مسیرها در `.gitignore`‌اند چون **خروجیِ ساخت‌اند**، نه فایلِ
   ورودیِ مخزن: ‏`docs/_metadata.json` را `tools/docs-metadata.js` می‌سازد،
   ‏`docs/_export/` را `tools/docs-export.sh`. ارجاعِ سند به آن‌ها درست است؛
   فقط روی یک **کلونِ تازه** هنوز ساخته نشده‌اند. اگر آن‌ها را «ارجاعِ
   کهنه» حساب کنیم، گیت روی مخزنِ سالمِ تازه‌کلون‌شده قرمز می‌شود و
   بعد نادیده گرفته می‌شود — همان درسی که در freezeManifest گرفتیم.
   پس قاعده از خودِ `.gitignore` خوانده می‌شود (خودنگهدار)، و شمارِ
   مواردِ ردشده در خروجی **دیده می‌شود** تا ساکت قورت داده نشوند. */
function readIgnorePatterns(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  return text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
}

/* الگوی gitignore → رگکس. سه حالت: anchored (با / ابتدایی)، directory
   (با / انتهایی)، و basename (بدون / — در هر عمقی می‌خورد). */
function ignoreRegex(pattern) {
  let p = pattern;
  let dirOnly = false;
  if (p.endsWith('/')) { dirOnly = true; p = p.slice(0, -1); }
  const anchored = p.startsWith('/') || p.indexOf('/') !== -1;
  if (p.startsWith('/')) p = p.slice(1);
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '.*');
  const head = anchored ? '^' : '(?:^|/)';
  return new RegExp(head + body + (dirOnly ? '(?:/|$)' : '$'));
}

let _ignoreRes = null;
function ignoreRes() {
  if (_ignoreRes === null) {
    _ignoreRes = readIgnorePatterns(path.join(ROOT, '.gitignore')).map(ignoreRegex);
  }
  return _ignoreRes;
}

/* یک ارجاع «تولیدی» است اگر خودش یا هر بخشِ والدِ مسیرش ignore شود
   ‏(مثلاً `dist/` باید `dist/x.js` را هم بگیرد). */
function isGenerated(ref) {
  const res = ignoreRes();
  if (!res.length) return false;
  const parts = ref.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    if (res.some((re) => re.test(sub))) return true;
  }
  return false;
}

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
  const gen = new Map();       // ref -> Set(doc) — تولیدی (ignore شده)، قرمز نمی‌کند
  for (const doc of allDocs()) {
    const src = fs.readFileSync(doc, 'utf8');
    for (const m of src.matchAll(REF_RE)) {
      const ref = m[1].replace(/[.,؛)]+$/, '');
      if (!REAL_PREFIXES.some((p) => ref.startsWith(p))) continue;
      /* ارجاع‌های دارای placeholder واقعاً مسیر نیستند */
      if (/[<>{}*]/.test(ref)) continue;
      if (isTemplate(ref)) continue;
      if (fs.existsSync(path.join(ROOT, ref))) continue;
      /* خروجیِ ساخت است، نه ارجاعِ کهنه — ولی شمارش می‌شود تا پنهان نماند */
      if (isGenerated(ref)) { if (!gen.has(ref)) gen.set(ref, new Set()); gen.get(ref).add(rel(doc)); continue; }
      const d = rel(doc);
      if (!byDoc.has(d)) byDoc.set(d, new Set());
      byDoc.get(d).add(ref);
      if (!byRef.has(ref)) byRef.set(ref, new Set());
      byRef.get(ref).add(d);
    }
  }
  return { byDoc, byRef, gen };
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
  const { byDoc, byRef, gen } = findRefs();

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
      generatedSkipped: [...gen.keys()].sort(),
      fresh: fresh.map((p) => ({ doc: p.doc, ref: p.ref })),
      resolvedSinceBaseline: gone,
      verdict: fresh.length ? 'RED' : 'GREEN',
    }, null, 2));
    /* حکم (M-REFS-SILENCE-FIX): --json هم در برابر ارجاعِ تازه ساکت نماند */
    return fresh.length ? 1 : 0;
  }

  console.log(`ارجاعِ کهنه به فایلِ ناموجود: ${pairs.length} مورد در ${byDoc.size} سند`);
  console.log(`  خطِ پایه (بدهیِ تاریخی): ${known.size}`);
  console.log(`  تازه (باید رفع شود)   : ${fresh.length}`);
  if (gen.size) console.log(`  تولیدی (ردشده با قاعدهٔ .gitignore، نه بدهی): ${gen.size}`);
  if (gone.length) console.log(`  از زمانِ خطِ پایه رفع شده: ${gone.length} ← خطِ پایه را با --baseline تازه کنید`);

  if (fresh.length) {
    console.log('\nارجاع‌های کهنهٔ تازه:');
    for (const p of fresh) console.log(`  • ${p.doc} → ${p.ref}`);
  }

  if (byRef.size) {
    console.log('\nپرتکرارترین ارجاع‌های ناموجود:');
    [...byRef.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 8)
      .forEach(([ref, docs]) => console.log(`  ${String(docs.size).padStart(2)} سند → ${ref}`));
  }

  /* ────────────────────────────────────────────────────────────────
     حکم (M-REFS-SILENCE-FIX — چت ۶): ابزار هرگز در برابر ارجاعِ کهنهٔ
     تازه **ساکت** نماند. پیش از این، اجرایِ بدونِ پرچم با ده‌ها ارجاعِ
     تازه exit=0 می‌داد (کلاسِ «ابزارِ ساکت، سبز») و فقط --check قرمز
     می‌کرد ⇒ هر سی‌آی/گزارشِ بدونِ پرچم، سبزِ جعلی می‌دید.
     اکنون: خطِ «نتیجه» همیشه چاپ می‌شود و exit در همهٔ حالت‌ها
     (پیش‌فرض · --check · --json) با آن هم‌خوان است: قرمز ⇒ exit=1.
     --baseline همچنان exit=0 (عملیاتِ بازتولید، نه داوری).
     ──────────────────────────────────────────────────────────────── */
  if (fresh.length) {
    console.log(`\nنتیجه: ${fresh.length} ارجاعِ کهنهٔ تازه ❌`);
    console.error(`\n❌ ${fresh.length} ارجاعِ تازه به فایلِ ناموجود.`);
    console.error('   یا فایل را برگردانید/تغییرِ نامِ ارجاع را بدهید، یا اگر سند تاریخی است');
    console.error('   خطِ پایه را با دلیل بازتولید کنید: node tools/docs-refs-check.js --baseline');
    return 1;
  }
  console.log('\nنتیجه: ۰ ارجاعِ کهنهٔ تازه ✅');
  return 0;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  try {
    process.exit(run({ check: a.includes('--check'), baseline: a.includes('--baseline'), json: a.includes('--json') }));
  } catch (e) { console.error('❌ ' + e.message); process.exit(2); }
}

module.exports = { findRefs, allDocs, loadBaseline, keyOf, isGenerated, ignoreRegex, readIgnorePatterns };
