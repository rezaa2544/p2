#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/docs-stats-sync.js — تولیدکنندهٔ بلوک‌های آماری مستندات

   چرا این ابزار وجود دارد
   ───────────────────────
   چند سند، شمارِ زندهٔ دیسک را به‌صورت دستی در متن خود تکرار می‌کنند
   (شمار تست‌ها، شمار اسناد ریشه/درخت). هر بار که کسی یک سند یا یک تست
   اضافه می‌کند، آن عددها کهنه می‌شوند و سه تست قرمز می‌شوند:
       docs-metrics · documentation-map-coverage · test-coverage-report-coverage
   این در فاصلهٔ چند روز چند بار تکرار شد (rc28 → rc29 → rc30)، چون
   «عددِ درست» فقط در دیسک است ولی «عددِ نوشته‌شده» دستی نگه داشته می‌شد.

   این ابزار آن اعداد را از دیسک می‌سازد. تنها چیزی که دستی می‌ماند،
   خودِ قفلِ مستندات است (که ماهیتاً یک تصمیم انسانی است).

   استفاده
   ───────
     node tools/docs-stats-sync.js              # نوشتن (idempotent)
     node tools/docs-stats-sync.js --check      # فقط بررسی؛ اگر کهنه بود exit 1
     node tools/docs-stats-sync.js --freeze     # + بازتولید مانیفستِ قفلِ جاری
     node tools/docs-stats-sync.js --json       # چاپ واقعیتِ دیسک

   قرارداد
   ───────
   هر خطی که این ابزار مالک آن است باید **دقیقاً یک بار** در سند بیاید؛
   اگر الگویی صفر یا بیش از یک بار بخورد، ابزار با خطا می‌ایستد به‌جای
   اینکه بی‌صدا سند را خراب کند.

   اجرا: node tools/docs-stats-sync.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/* ── ابزارها ─────────────────────────────────────────────────────── */
const fa = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);

function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
}

/* قفلِ جاری همان است که تستِ نگهبان به آن اشاره می‌کند — از خودِ تست
   خوانده می‌شود تا این ابزار هم کهنه نشود. */
function currentFreeze() {
  const t = fs.readFileSync(path.join(ROOT, 'tests', 'docs-freeze-marker.js'), 'utf8');
  const m = t.match(/const FREEZE = '([^']+)'/);
  if (!m) throw new Error('tests/docs-freeze-marker.js: «const FREEZE» پیدا نشد');
  return m[1];
}

/* ترتیبِ نمایشِ زیرپوشه‌ها ثابت است تا هر اجرا دیفِ بی‌مورد نسازد؛
   زیرپوشهٔ تازه به انتها اضافه می‌شود. */
const SUB_ORDER = ['RUNBOOK_CARDS', 'user-guides', 'pilot'];
function subNames(t) {
  const have = Object.keys(t.subs);
  return SUB_ORDER.filter((s) => have.includes(s))
    .concat(have.filter((s) => !SUB_ORDER.includes(s)).sort());
}
const subLabel = (t) => subNames(t).map((s) => `\`${s}/\``).join(' + ');

/* ── واقعیتِ دیسک ────────────────────────────────────────────────── */
function truth() {
  const rootMd = listMd(DOCS);
  const freezeRel = currentFreeze();                 // docs/DOCS_FREEZE_v1.0.0-rcNN.md
  const freezeName = path.basename(freezeRel);
  const rc = (freezeName.match(/rc(\d+)/) || [])[1];

  let subTotal = 0;
  const subs = {};
  for (const e of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const n = listMd(path.join(DOCS, e.name)).length;
    if (n) { subs[e.name] = n; subTotal += n; }
  }

  const testsRoot = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js')).length;
  const apiDir = path.join(ROOT, 'tests', 'api');
  const testsApi = fs.existsSync(apiDir)
    ? fs.readdirSync(apiDir).filter((f) => f.endsWith('.js')).length : 0;

  return {
    rc: rc || '?',
    docsRoot: rootMd.length,                 // همهٔ docs/*.md، با خودِ قفل
    docsRootMinusFreeze: rootMd.length - 1,  // مانیفست: بیرون از خودِ قفل
    docsSub: subTotal,
    subs,
    docsTree: rootMd.length + subTotal,
    testsRoot,
    testsApi,
    testsTotal: testsRoot + testsApi,
  };
}

/* ── خطوطی که این ابزار مالکشان است ─────────────────────────────── */
/* هر ورودی: فایل، الگوی شناسایی خط، و سازندهٔ خطِ درست.
   `match` باید دقیقاً یک خط را بگیرد؛ `render` کل آن خط را بازنویسی می‌کند. */
const OWNED = [
  {
    file: 'docs/TEST_COVERAGE_REPORT.md',
    key: 'tests-total-row',
    match: /^\| \*\*کل فایل‌های تست\*\* \|.*\|$/m,
    render: (t) => `| **کل فایل‌های تست** | **${fa(t.testsTotal)}** (${fa(t.testsRoot)} در \`tests/\` + ${fa(t.testsApi)} در \`tests/api/\`) |`,
  },
  {
    file: 'docs/TEST_COVERAGE_REPORT.md',
    key: 'tests-inline-list',
    match: /^- `tests\/` \(.*?\) · `tests\/api\/` \(.*?\)(.*)$/m,
    render: (t, m) => `- \`tests/\` (${fa(t.testsRoot)} فایل) · \`tests/api/\` (${fa(t.testsApi)} فایل)${m[1] || ''}`,
  },
  {
    file: 'docs/DOCS_METRICS.md',
    key: 'docs-total-row',
    match: /^\| تعداد کل اسناد `docs\/\*\.md` \|.*\| شمارش فایل \|$/m,
    render: (t) => `| تعداد کل اسناد \`docs/*.md\` | **${fa(t.docsRootMinusFreeze)}** سند ریشه (پیش از خود سند قفل \`rc${t.rc}\`؛ با آن ${fa(t.docsRoot)}) + ${fa(t.docsSub)} سند در زیرپوشه‌ها (${subLabel(t)}) = جمع درخت ${fa(t.docsTree)} | شمارش فایل |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-total',
    match: /^\| کل اسناد \(لحظهٔ قفل `rc\d+`\) \|.*\|$/m,
    render: (t) => `| کل اسناد (لحظهٔ قفل \`rc${t.rc}\`) | **${fa(t.docsTree)}** |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-root',
    match: /^\| اسناد ریشهٔ `docs\/\*\.md` \(با خود نقشه و قفل\) \|.*\|$/m,
    render: (t) => `| اسناد ریشهٔ \`docs/*.md\` (با خود نقشه و قفل) | ${fa(t.docsRoot)} |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-sub',
    match: /^\| اسناد زیرپوشه‌ها \(.*?\) \|.*\|$/m,
    render: (t) => `| اسناد زیرپوشه‌ها (${subLabel(t)}) | ${fa(t.docsSub)} |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-sum',
    match: /^\| \*\*جمع\*\* \|.*\|$/m,
    render: (t) => `| **جمع** | **${fa(t.docsTree)}** |`,
  },
];

/* ── بازتولیدِ مانیفستِ قفلِ جاری ────────────────────────────────── */
function freezeManifest() {
  const rel = currentFreeze();
  const p = path.join(ROOT, rel);
  const selfName = path.basename(rel);
  const files = listMd(DOCS).filter((f) => f !== selfName).sort();
  const rows = files.map((f) => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(DOCS, f))).digest('hex');
    return `| \`${f}\` | \`sha256:${h}\` |`;
  });
  return { rel, p, count: rows.length, table: rows.join('\n') };
}

function rewriteFreeze(man) {
  const src = fs.readFileSync(man.p, 'utf8');
  const HEAD_MARK = '| سند | اثر (SHA-256) |\n|---|---|\n';
  const i = src.indexOf(HEAD_MARK);
  if (i < 0) throw new Error(`${man.rel}: سرآغازِ جدولِ مانیفست پیدا نشد`);
  const afterTable = src.indexOf('\n\n---\n', i);
  if (afterTable < 0) throw new Error(`${man.rel}: پایانِ جدولِ مانیفست پیدا نشد`);

  let out = src.slice(0, i + HEAD_MARK.length) + man.table + src.slice(afterTable);

  /* شمارِ §۳ و شمارِ سربرگ هم باید با مانیفست یکی باشند */
  out = out.replace(/^(## ۳\) فهرست اسناد ریشه با هش \(شمار: )[\d۰-۹]+(\))$/m,
    (_m, a, b) => a + fa(man.count) + b);
  out = out.replace(/(\*\*همهٔ )[\d۰-۹]+( سند ریشهٔ\*\*)/,
    (_m, a, b) => a + fa(man.count) + b);
  /* پانوشت باید نامِ همین قفل را بگوید، نه قفلِ قبلی را */
  out = out.replace(/^_قفل `rc\d+`/, `_قفل \`rc${(path.basename(man.rel).match(/rc(\d+)/) || [])[1]}\``);
  return out;
}

/* ── موتور ───────────────────────────────────────────────────────── */
function run({ check, freeze, json }) {
  const t = truth();
  if (json) { console.log(JSON.stringify(t, null, 2)); return 0; }

  const stale = [];
  let changedFiles = 0;

  for (const spec of OWNED) {
    const p = path.join(ROOT, spec.file);
    if (!fs.existsSync(p)) { stale.push(`${spec.file}: فایل نیست (${spec.key})`); continue; }
    const src = fs.readFileSync(p, 'utf8');

    /* الگو باید دقیقاً یک بار بخورد — وگرنه بی‌صدا سند را خراب می‌کنیم */
    const hits = src.match(new RegExp(spec.match.source, 'gm')) || [];
    if (hits.length !== 1) {
      stale.push(`${spec.file} [${spec.key}]: الگو ${hits.length} بار خورد (باید ۱ باشد) — از نوشتن خودداری شد`);
      continue;
    }
    const m = src.match(spec.match);
    const want = spec.render(t, m);
    const have = m[0];
    if (want === have) continue;

    stale.push(`${spec.file} [${spec.key}]\n      بود: ${have}\n      شد : ${want}`);
    if (!check) {
      fs.writeFileSync(p, src.replace(spec.match, () => want), 'utf8');
      changedFiles++;
    }
  }

  if (freeze) {
    const man = freezeManifest();
    const want = rewriteFreeze(man);
    const have = fs.readFileSync(man.p, 'utf8');
    if (want !== have) {
      stale.push(`${man.rel}: مانیفست/شمار کهنه است (${man.count} سند)`);
      if (!check) { fs.writeFileSync(man.p, want, 'utf8'); changedFiles++; }
    }
  }

  if (check) {
    if (stale.length) {
      console.error('❌ آمارِ مستندات کهنه است:');
      for (const s of stale) console.error('  • ' + s);
      console.error('\nرفع: node tools/docs-stats-sync.js' + (freeze ? ' --freeze' : ''));
      return 1;
    }
    console.log('✅ آمارِ مستندات با دیسک یکی است.');
    console.log(`   اسناد: ${t.docsRoot} ریشه (مانیفست ${t.docsRootMinusFreeze}) + ${t.docsSub} زیرپوشه = ${t.docsTree} درخت · قفل rc${t.rc}`);
    console.log(`   تست‌ها: ${t.testsTotal} = ${t.testsRoot} ریشه + ${t.testsApi} ای‌پی‌آی`);
    return 0;
  }

  if (stale.length === 0) {
    console.log('✅ چیزی کهنه نبود؛ سندها دست‌نخورده ماندند.');
  } else {
    console.log(`✅ ${stale.length} مورد همگام شد (${changedFiles} فایل):`);
    for (const s of stale) console.log('  • ' + s.split('\n')[0]);
  }
  console.log(`   اسناد: ${t.docsRoot} ریشه (مانیفست ${t.docsRootMinusFreeze}) + ${t.docsSub} زیرپوشه = ${t.docsTree} درخت · قفل rc${t.rc}`);
  console.log(`   تست‌ها: ${t.testsTotal} = ${t.testsRoot} ریشه + ${t.testsApi} ای‌پی‌آی`);
  return 0;
}

/* ── ورودی ───────────────────────────────────────────────────────── */
if (require.main === module) {
  const a = process.argv.slice(2);
  const check = a.includes('--check');
  const freeze = a.includes('--freeze');
  const json = a.includes('--json');
  try {
    process.exit(run({ check, freeze, json }));
  } catch (e) {
    console.error('❌ ' + e.message);
    process.exit(2);
  }
}

module.exports = { truth, fa, OWNED, freezeManifest, rewriteFreeze, currentFreeze };
