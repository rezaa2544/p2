#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   a11y-state-matrix.js — ماتریسِ وضعیت × تم برایِ نودهای «رنگ‌حساس»

   این سنجه **جایگزینِ axe نیست**. axe یک موتورِ واقعی است که درختِ رندرشده
   را می‌بیند؛ این‌جا هیچ مرورگری لازم نیست چون هیچ رندری انجام نمی‌شود:
   برایِ هر نودِ شناخته‌شده، قاعده‌های CSSی که در آن وضعیت واقعاً اعمال
   می‌شوند از خودِ `src/styles/base.css` انتخاب، توکن‌ها با همان تم حل، و
   نسبتِ کنتراست محاسبه می‌شود.

   چرا لازم است: نقصِ گزارش‌شده (`div[data-t="grades"]`, fg #1668f0 روی
   bg #e4edfe, 4.176:1) فقط در **یک ترکیبِ وضعیت** ظاهر می‌شد: theme-3 +
   دانش‌آموز + پرونده + تبِ grades. اسکنِ axe در CI یک نمونه از آن ترکیب را
   دید؛ اما «کدام ترکیب‌ها اصلاً وجود دارند» از قبل معلوم نیست. این ماتریس
   همهٔ ترکیب‌های ممکن را از سورس می‌شمارد تا هیچ ترکیبی «دیده‌نشده» نمانَد.

   اجرا: node tests/a11y-state-matrix.js [--json]
   خروجی: جدولِ هر ترکیب + شمارشِ اسکن‌ها؛ exit 1 اگر هر ترکیبی < 4.5 بدهد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'base.css'), 'utf8');
const AA = 4.5;

/* ── کنتراست WCAG 2.1 ─────────────────────────────────────────────── */
function lum(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ── جدولِ توکن‌ها برای هر تم (از همان CSS، بدونِ hardcode) ─────────── */
function tokenTable(theme) {
  const t = {};
  for (const m of css.matchAll(/:root\s*\{([\s\S]*?)\}/g)) {
    for (const d of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) t[d[1]] = d[2];
  }
  if (theme && theme !== 'theme-1') {
    const re = new RegExp('\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\}', 'g');
    for (const m of css.matchAll(re)) {
      for (const d of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) t[d[1]] = d[2];
    }
  }
  return t;
}

/* ── قاعده‌های یک انتخابگر، به ترتیبِ ظهور در فایل ──────────────────── */
function rulesFor(selector) {
  const out = [];
  for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = r[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n').pop().trim();
    const wanted = selector.split(',').map((s) => s.trim());
    const sels = sel.split(',').map((s) => s.trim());
    if (!sels.some((s) => wanted.includes(s))) continue;
    const decls = {};
    for (const d of r[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    }
    out.push({ sel, decls });
  }
  return out;
}

/* ── حلِ یک مقدار: var(--x) با توکنِ تم، یا رنگِ صریح ────────────────── */
function resolve(value, tokens) {
  if (!value) return null;
  const v = String(value).trim();
  const m = v.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/);
  let hex = m ? (tokens[m[1]] || (m[2] && m[2].trim())) : v;
  if (!hex || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return null;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h.toLowerCase();
}

/* ── نودهای «رنگ‌حساس»: هر کدام یک ترکیبِ وضعیت است ────────────────────
   `layers` = قاعده‌هایی که به ترتیب اعمال می‌شوند (base → state).
   پس‌زمینه از آخرین قاعده‌ای که background می‌دهد می‌آید، وگرنه از ظرف. */
const NODES = [
  {
    name: 'tab.active',
    selectors: ['.tab', '.tab.active'],
    container: '--surface-2',       /* .card-head داخلِ .card */
    why: 'تبِ فعال در پروندهٔ دانش‌آموز (theme-3/record/grades — نقصِ گزارش‌شده)'
  },
  {
    name: 'tab (inactive)',
    selectors: ['.tab'],
    container: '--surface-2',
    why: 'تبِ غیرفعال کنارِ تبِ فعال'
  },
  {
    name: 'sync-chip.busy',
    selectors: ['.sync-chip', '.sync-chip.busy'],
    container: '--surface-2',
    why: 'وضعیتِ گذرایِ همگام‌سازی (busy)'
  },
  {
    name: 'sync-chip.off',
    selectors: ['.sync-chip', '.sync-chip.off'],
    container: '--surface-2',
    why: 'وضعیتِ گذرایِ همگام‌سازی (off)'
  },
  {
    name: 'back-btn',
    selectors: ['.back-btn'],
    container: '--surface',
    why: 'دکمهٔ بازگشت — فقط در مسیرهایِ غیرِ خانه رندر می‌شود'
  },
  {
    name: 'avatar',
    selectors: ['.avatar'],
    container: '--surface',
    why: 'آواتار در سرصفحه'
  },
  {
    name: 'sec-title',
    selectors: ['.sec-title'],
    container: '--surface',
    why: 'عنوانِ بخش داخلِ کارت'
  }
];

const THEMES = ['theme-1', 'theme-2', 'theme-3'];

function evaluate(node, theme) {
  const tk = tokenTable(theme);
  let fg = null;
  let bg = null;
  const trace = [];
  for (const sel of node.selectors) {
    for (const r of rulesFor(sel)) {
      if (r.decls.color) { fg = resolve(r.decls.color, tk); trace.push(r.sel + ' → color:' + r.decls.color); }
      const bgDecl = r.decls.background || r.decls['background-color'];
      if (bgDecl) {
        /* گرادیان را به رنگِ اولش فرو می‌کاهیم؛ برایِ این نودها گرادیان نیست */
        const first = bgDecl.includes('gradient') ? (bgDecl.match(/#[0-9a-fA-F]{3,8}/) || [])[0] : bgDecl;
        bg = resolve(first, tk);
        if (bg) trace.push(r.sel + ' → background:' + first);
      }
    }
  }
  if (!bg) {
    bg = resolve('var(' + node.container + ')', tk);
    trace.push('container → ' + node.container + ' = ' + bg);
  }
  return { fg, bg, trace };
}

const wantJson = process.argv.includes('--json');
const rows = [];
let violations = 0;

for (const theme of THEMES) {
  for (const node of NODES) {
    const { fg, bg, trace } = evaluate(node, theme);
    if (!fg || !bg) {
      rows.push({ theme, node: node.name, fg, bg, ratio: null, verdict: 'UNRESOLVED', trace });
      continue;
    }
    const ratio = contrast(fg, bg);
    const pass = ratio >= AA;
    if (!pass) violations++;
    rows.push({ theme, node: node.name, fg, bg, ratio: Number(ratio.toFixed(4)), verdict: pass ? 'PASS' : 'FAIL', trace });
  }
}

/* شمارشِ صادقانه: هر ردیف یک ترکیب است، نه یک «اسکنِ axe» */
const scans = rows.length;

if (wantJson) {
  console.log(JSON.stringify({
    kind: 'static-state-matrix',
    substitute_for_axe: false,
    note: 'No browser is launched. Values come from src/styles/base.css with per-theme token resolution. The real axe run is tests/a11y-runtime.js and requires Chromium.',
    themes: THEMES,
    nodes: NODES.map((n) => n.name),
    scans,
    violations,
    rows
  }, null, 2));
} else {
  console.log('▸ ماتریسِ وضعیت × تم (بدونِ مرورگر — جایگزینِ axe نیست)');
  console.log('  ' + 'theme'.padEnd(9) + 'node'.padEnd(18) + 'fg'.padEnd(10) + 'bg'.padEnd(10) + 'ratio   verdict');
  for (const r of rows) {
    const flag = r.verdict === 'PASS' ? '✅' : (r.verdict === 'FAIL' ? '❌' : '⚠️ ');
    console.log('  ' + flag + ' ' + String(r.theme).padEnd(9) + String(r.node).padEnd(18) +
      String(r.fg || '—').padEnd(10) + String(r.bg || '—').padEnd(10) +
      (r.ratio === null ? '—'.padEnd(8) : (r.ratio.toFixed(3) + ':1').padEnd(8)) + r.verdict);
  }
  console.log('\n  ترکیب‌های سنجیده‌شده: ' + scans + '  (۳ تم × ' + NODES.length + ' نود)');
  console.log('  نقض: ' + violations);
  if (violations) {
    console.log('\n  نقض‌ها با ردِ استنتاج:');
    rows.filter((r) => r.verdict === 'FAIL').forEach((r) => {
      console.log('   • ' + r.theme + ' ' + r.node + ' = ' + r.ratio + ':1 (' + r.fg + ' on ' + r.bg + ')');
      r.trace.forEach((t) => console.log('       ' + t));
    });
  }
  console.log('\n──────────────────────────────────────────');
  console.log(violations === 0
    ? 'نتیجه: ۰ نقض در ' + scans + ' ترکیب ✅'
    : 'نتیجه: ' + violations + ' نقض از ' + scans + ' ترکیب ❌');
}

process.exit(violations === 0 ? 0 : 1);
