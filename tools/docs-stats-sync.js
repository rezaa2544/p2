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

   تعریف (C6-02، board 2026-09-17):
     «درخت» = درخت پایدار: اسناد ریشه + زیرپوشه‌های پایدار. زیرپوشه‌های
     متغیر `daily-*` از شمار خارج‌اند (افزودن سند روزانه آمار را خراب
     نمی‌کند)؛ شمار آن‌ها در dailySubs/--json گزارش می‌شود.

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

/* اسناد «زنده» — همان سه سندی که §۱ بند ۲ قفل از تضمینِ اثر مستثنا کرده */
const LIVE_DOCS = ['DOCS_HEALTH_REPORT.md', 'DOCS_CONSISTENCY_REPORT.md', 'SECURITY_INCIDENT_LOG.md'];

/* ── سیاست C6-02 (board docs/daily-mission-boards/2026-09-17/Chat6.md) ──
   زیرپوشه‌های `daily-*` (`daily-reports/`، `daily-audits/`، ...) اسنادِ
   عملیاتیِ متغیرند: افزودن سند روزانه نباید آمارِ عادی/یخ‌زده را خراب
   کند («daily reports no longer corrupt normal stats»). شمارِ «درخت» از
   اینجای‌جا **درخت پایدار** است: اسناد ریشه + زیرپوشه‌های پایدار. شمارِ
   روزانه جدا گزارش می‌شود (--json / کنسول) و گیت نمی‌کند.
   جمع فیزیکی کامل = پایدار + روزانه.
   یادداشت تعریف: اعدادِ تاریخیِ لحظهٔ قفل (rc44: ۴۲۰) و همگامی‌های پیشین
   (مثلاً #300: ۴۲۵) با تعریفِ همه‌شمول بودند؛ از C6-02 به بعد تعریف پایدار
   جاری است. سندِ قفل (مانیفست) دست‌نخورده می‌ماند — بازتولید آن قلمِ
   C6-05 (rc45) است. */
const DAILY_PREFIX = 'daily-';
const isDailySub = (name) => name.startsWith(DAILY_PREFIX);

/* خواندنِ عددِ فارسی از یک ردیفِ جدول */
const unfa = (str) => Number(String(str).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

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

  /* C6-02: زیرپوشه‌های `daily-*` از شمارِ پایدار جدا می‌شوند (پایدار =
     subs؛ روزانه = dailySubs). فیلدهای docsSub/docsTree به تعریف پایدار
     منتقل شدند — جمع فیزیکی کامل در docsTreePhysical است. */
  let subTotal = 0;
  const subs = {};
  const dailySubs = {};
  let dailyTotal = 0;
  for (const e of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const n = listMd(path.join(DOCS, e.name)).length;
    if (!n) continue;
    if (isDailySub(e.name)) { dailySubs[e.name] = n; dailyTotal += n; }
    else { subs[e.name] = n; subTotal += n; }
  }

  const testsRoot = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js')).length;
  const apiDir = path.join(ROOT, 'tests', 'api');
  const testsApi = fs.existsSync(apiDir)
    ? fs.readdirSync(apiDir).filter((f) => f.endsWith('.js')).length : 0;

  /* تست‌های تو‌در‌تویِ غیرِ api. شمارِ رسمی (= آنچه tests/test-coverage-report-coverage.js
     می‌سنجد) فقط tests/ و tests/api/ است؛ این‌ها عمداً بیرون آن تعریف‌اند، ولی باید
     **دیده** شوند تا افزودنِ تست در tests/performance/suites بی‌صدا از قلم نیفتد. */
  const nested = {};
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const sub = rel ? rel + '/' + e.name : e.name;
      if (sub === 'api') continue;
      const n = fs.readdirSync(path.join(dir, e.name)).filter((f) => f.endsWith('.js')).length;
      if (n) nested[sub] = n;
      walk(path.join(dir, e.name), sub);
    }
  })(path.join(ROOT, 'tests'), '');
  const testsNested = Object.values(nested).reduce((a, b) => a + b, 0);

  /* دسته‌بندیِ وضعیت برای نقشهٔ مستندات */
  const frozenDocs = fs.readdirSync(DOCS).filter((f) => /^DOCS_FREEZE_v1\.0\.0-rc\d+\.md$/.test(f)).length;

  return {
    rc: rc || '?',
    docsRoot: rootMd.length,                 // همهٔ docs/*.md، با خودِ قفل
    docsRootMinusFreeze: rootMd.length - 1,  // مانیفست: بیرون از خودِ قفل
    docsSub: subTotal,                       // C6-02: فقط زیرپوشه‌های پایدار
    subs,
    dailySubs,                               // C6-02: زیرپوشه‌های daily-* (خارج از شمار)
    dailyTotal,
    docsTree: rootMd.length + subTotal,      // C6-02: درخت پایدار
    docsTreePhysical: rootMd.length + subTotal + dailyTotal, // کل فیزیکی (تفصیلی)
    testsRoot,
    testsApi,
    testsTotal: testsRoot + testsApi,
    testsNested,
    nested,
    frozenDocs,
    liveDocs: LIVE_DOCS.length,
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
    /* C6-02: این ردیف فقط عددهای **پایدار** را می‌نویسد — شمارِ روزانه درون
       ردیف نمی‌آید (با هر گزارشِ تازه می‌زدود و ردیف را کهنه می‌کرد؛ همان
       «خرابیِ آمارِ عادی» که C6-02 حذف کرد). ردیف همچنان دو عددِ متعارف را
       می‌آورَد که tests/docs-metrics.js می‌سنجد: «ریشه» و «درختِ سه‌زیرپوشه‌ای».
       (رگرسیونِ ۲۰۲۶-۰۹-۱۷، 6204fe3: قالب پیشین «درخت سه‌زیرپوشه‌ای» را هرگز به‌صورت
       جمع نمی‌نوشت؛ از این نسخه صریح نوشته می‌شود و DM-KEY سبز می‌ماند.)
       شمارِ روزانه لحظه‌ای: tools/docs-stats-sync.js --json (فیلد dailySubs). */
    render: (t) => {
      const core = ['RUNBOOK_CARDS', 'user-guides', 'pilot'].reduce((a, k) => a + (t.subs[k] || 0), 0);
      const dailyLabel = Object.keys(t.dailySubs).sort().map((s) => `\`${s}/\``).join(' + ');
      return `| تعداد کل اسناد \`docs/*.md\` | **${fa(t.docsRootMinusFreeze)}** سند ریشه (پیش از خود سند قفل \`rc${t.rc}\`؛ با آن ${fa(t.docsRoot)}) + ${fa(t.docsSub)} سند پایدار در زیرپوشه‌ها (${subLabel(t)}) = جمع درخت پایدار ${fa(t.docsTree)}؛ تفکیک: سه زیرپوشهٔ پایه ${fa(core)} + بقیهٔ پایدار ${fa(t.docsSub - core)} ⇒ درخت سه‌زیرپوشه‌ای ${fa(t.docsRoot + core)}؛ سوابقِ روزانهٔ عملیاتی (${dailyLabel || '—'}) خارج از شمارش — سیاست C6-02 | شمارش فایل |`;
    },
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
  /* جدولِ «به تفکیک وضعیت» یکپارچه مالکیت می‌شود: اگر فقط ردیفِ جمع عوض شود،
     اجزا با جمع نمی‌خوانند و جدولِ نامعتبر منتشر می‌شود. */
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-status-active',
    match: /^\| فعال \(در حال استفاده\) \|.*\|$/m,
    render: (t, m, ctx) => `| فعال (در حال استفاده) | ${fa(ctx.active)} |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-status-live',
    match: /^\| زنده \(ماشینی\/رخدادی، مستثنی از بامپ\) \|.*\|$/m,
    render: (t, m, ctx) => `| زنده (ماشینی/رخدادی، مستثنی از بامپ) | ${fa(t.liveDocs)} |`,
  },
  {
    file: 'docs/DOCUMENTATION_MAP.md',
    key: 'map-status-frozen',
    match: /^\| منجمد \(قفل‌های تاریخی\) \|.*\|$/m,
    render: (t, m, ctx) => `| منجمد (قفل‌های تاریخی) | ${fa(t.frozenDocs)} |`,
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

  /* اسناد «زنده» (§۱ بند ۲ قفل) از تضمینِ اثر مستثنا‌اند و تستِ نگهبان هم
     هششان را نمی‌سنجد. اگر این ابزار هشِ تازه‌شان را بنویسد، هر بار که
     `tests/docs-consistency.js` گزارش‌های ماشینی را بازتولید کند --check
     قرمز می‌شود — و گیتی که با هر اجرای تست قرمز شود به‌درد نمی‌خورد.
     پس هشِ ثبت‌شدهٔ لحظهٔ قفل دست‌نخورده می‌ماند، دقیقاً مانندِ قرارداد. */
  const prev = {};
  if (fs.existsSync(p)) {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/\| `([^`]+\.md)` \| `sha256:([0-9a-f]{64})` \|/g)) {
      prev[m[1]] = m[2];
    }
  }

  const files = listMd(DOCS).filter((f) => f !== selfName).sort();
  const rows = files.map((f) => {
    const h = LIVE_DOCS.includes(f) && prev[f]
      ? prev[f]
      : crypto.createHash('sha256').update(fs.readFileSync(path.join(DOCS, f))).digest('hex');
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
/* ردیفِ «آرشیو» قاعدهٔ ماشینی ندارد (دستهٔ ۲.۱۱ نقشه است)، پس مقدارِ جاری‌اش
   خوانده می‌شود و «فعال» باقی‌مانده می‌شود. اگر باقی‌مانده منفی شد، یعنی آرشیو
   اشتباه است و ابزار به‌جای نوشتن می‌ایستد. */
function statusContext(t) {
  const src = fs.readFileSync(path.join(ROOT, 'docs/DOCUMENTATION_MAP.md'), 'utf8');
  const m = src.match(/^\| آرشیو \(بایگانی نمایه\) \|\s*([\d۰-۹]+)\s*\|$/m);
  const archive = m ? unfa(m[1]) : 0;
  const active = t.docsTree - t.liveDocs - t.frozenDocs - archive;
  return { archive, active, archiveRowFound: !!m };
}

function run({ check, freeze, json }) {
  const t = truth();
  if (json) { console.log(JSON.stringify(t, null, 2)); return 0; }

  const stale = [];
  const ambiguous = [];
  let changedFiles = 0;
  let ctx = {};
  try { ctx = statusContext(t); } catch (e) { /* سند نبود؛ پایین گزارش می‌شود */ }

  /* اگر دسته‌بندی قابل derivation نبود، هیچ ردیفی از آن جدول نوشته نمی‌شود */
  if (ctx.archiveRowFound && ctx.active < 0) {
    ambiguous.push('docs/DOCUMENTATION_MAP.md [به تفکیک وضعیت]: فعال = ' + ctx.active +
      ' (منفی) — ردیفِ آرشیو (' + ctx.archive + ') با جمعِ درخت (' + t.docsTree +
      ') نمی‌خواند؛ از نوشتن خودداری شد');
  }

  for (const spec of OWNED) {
    const p2 = path.join(ROOT, spec.file);
    if (!fs.existsSync(p2)) { ambiguous.push(`${spec.file}: فایل نیست (${spec.key})`); continue; }
    const src = fs.readFileSync(p2, 'utf8');

    /* الگو باید دقیقاً یک بار بخورد — وگرنه بی‌صدا سند را خراب می‌کنیم */
    const hits = src.match(new RegExp(spec.match.source, 'gm')) || [];
    if (hits.length !== 1) {
      ambiguous.push(`${spec.file} [${spec.key}]: الگو ${hits.length} بار خورد (باید ۱ باشد) — از نوشتن خودداری شد`);
      continue;
    }
    const m = src.match(spec.match);
    const want = spec.render(t, m, ctx);
    const have = m[0];
    if (want === have) continue;

    stale.push(`${spec.file} [${spec.key}]\n      بود: ${have}\n      شد : ${want}`);
    if (!check) {
      fs.writeFileSync(p2, src.replace(spec.match, () => want), 'utf8');
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

  /* ابهام = شکست، در هر دو حالت. پیش‌تر در حالتِ نوشتن exit 0 می‌داد و
     «موفقیتِ نیمه‌کاره» گزارش می‌کرد — Devin review روی #۸۷ همین را گرفت. */
  if (ambiguous.length) {
    console.error('\u274c ابهام — از نوشتن خودداری شد (exit 2):');
    for (const a of ambiguous) console.error('  \u2022 ' + a);
    return 2;
  }

  if (check) {
    if (stale.length) {
      console.error('\u274c آمارِ مستندات کهنه است:');
      for (const s2 of stale) console.error('  \u2022 ' + s2);
      console.error('\nرفع: node tools/docs-stats-sync.js' + (freeze ? ' --freeze' : ''));
      return 1;
    }
    console.log('\u2705 آمارِ مستندات با دیسک یکی است.');
  } else if (stale.length === 0) {
    console.log('\u2705 چیزی کهنه نبود؛ سندها دست‌نخورده ماندند.');
  } else {
    console.log(`\u2705 ${stale.length} مورد همگام شد (${changedFiles} فایل):`);
    for (const s2 of stale) console.log('  \u2022 ' + s2.split('\n')[0]);
  }

  console.log(`   اسناد پایدار: ${t.docsRoot} ریشه (مانیفست ${t.docsRootMinusFreeze}) + ${t.docsSub} پایدار = ${t.docsTree} درخت پایدار · قفل rc${t.rc}`);
  console.log(`   روزانه (خارج از شمارش — C6-02): ${t.dailyTotal} (${Object.entries(t.dailySubs).map(([k, v]) => `${k}: ${v}`).join('، ') || '—'}) ⇒ جمع فیزیکی ${t.docsTreePhysical}`);
  console.log(`   وضعیت: فعال ${ctx.active} + زنده ${t.liveDocs} + منجمد ${t.frozenDocs} + آرشیو ${ctx.archive} = ${t.docsTree}`);
  console.log(`   تست‌ها: ${t.testsTotal} = ${t.testsRoot} ریشه + ${t.testsApi} ای‌پی‌آی`);
  if (t.testsNested) {
    console.log(`   \u26a0 بیرونِ آن تعریف: ${t.testsNested} فایلِ تو‌در‌تو (` +
      Object.entries(t.nested).map(([k, v]) => `${k}: ${v}`).join('، ') +
      `) — شمارِ رسمی همان تعریفِ tests/test-coverage-report-coverage.js است`);
  }
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
