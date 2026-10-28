#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   a11y-contrast-tokens — کنتراستِ توکن‌هایِ تم، بدونِ مرورگر (M15-01 / D)

   چرا این تست هست: نقصِ color-contrast در tests/a11y-runtime.js
   («div.tab.active» با fg #1668f0 روی bg #e4edfe، نسبتِ ۴٫۱۸ < ۴٫۵)
   تا امروز «متناوب» به‌نظر می‌رسید، چون اسکن با axe فقط داخلِ مرورگر و
   فقط رویِ «تمی که آن لحظه فعال بود» اجرا می‌شد. واقعیت این است که نقص
   قطعی است و ریشه‌اش توکن است: --primary یک رنگِ «پرکردن» است و رویِ
   سطوحِ رنگیِ تم (soft/surface-2) به آستانهٔ AA نمی‌رسد؛ فقط وقتی به‌عنوانِ
   رنگِ متن به‌کار رود شکست می‌دهد.

   این تست همان ریاضیِ WCAG 2.1 را رویِ خودِ توکن‌ها اجرا می‌کند، پس:
     • قطعی است (بدونِ مرورگر، بدونِ زمان‌بندی، بدونِ شبکه)،
     • axe را حذف نمی‌کند — لایهٔ مکمل است، نه جانشین؛
     • قاعده را نگه می‌دارد: متن باید از توکنی بیاید که در همهٔ تم‌ها AA است.

   اجرا: node tests/a11y-contrast-tokens.js   (خروجی ۱ = نقضِ AA)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'src/styles/base.css');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; const e = name + (extra !== undefined ? ' — ' + extra : ''); errors.push(e); console.log('  ❌ ' + e); }
}
function grp(t) { console.log('\n▸ ' + t); }

/* ── WCAG 2.1 relative luminance + contrast ratio ─────────────────── */
const hex = (h) => String(h).trim();
const isHex = (h) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex(h));
function lum(h) {
  /* #fff و #ffffff هر دو معتبرند؛ توکن‌هایِ تم از هر دو شکل استفاده می‌کنند
     و ردکردنِ کوتاه‌نوشت یعنی بی‌صدا ردکردنِ بخشی از سطوح. */
  const raw = hex(h).slice(1);
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const v = full.match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
const AA_NORMAL = 4.5;

/* ── استخراجِ توکن‌هایِ هر تم از خودِ CSS ──────────────────────────── */
function tokensOf(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) return null;
  const body = css.slice(open + 1, close);
  const out = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].trim();
  return out;
}
const css = fs.readFileSync(CSS, 'utf8');
const THEMES = [
  { id: 'theme-1 (root)', sel: ':root{' },
  { id: 'theme-2', sel: '[data-theme="theme-2"]' },
  { id: 'theme-3', sel: '[data-theme="theme-3"]' }
];

grp('کنترلِ خودِ سنجه (بدونِ این، تست می‌تواند بی‌معنا سبز باشد)');
chk('نسبتِ سیاه/سفید = ۲۱ (تعریفِ WCAG)', Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01,
  ratio('#000000', '#ffffff').toFixed(3));
chk('جفتِ تاریخیِ شکست‌خورده (#1668f0 روی #e4edfe) زیرِ AA شناخته می‌شود',
  ratio('#1668f0', '#e4edfe') < AA_NORMAL, ratio('#1668f0', '#e4edfe').toFixed(3));
chk('جفتِ جایگزین (#0f4dc0 روی #e4edfe) بالایِ AA شناخته می‌شود',
  ratio('#0f4dc0', '#e4edfe') >= AA_NORMAL, ratio('#0f4dc0', '#e4edfe').toFixed(3));

grp('توکن‌هایِ هر تم خوانده می‌شوند');
const parsed = [];
for (const t of THEMES) {
  const tk = tokensOf(css, t.sel);
  parsed.push({ ...t, tk });
  chk(`${t.id}: بلوکِ توکن‌ها پیدا شد`, !!tk && Object.keys(tk).length > 5,
    tk ? Object.keys(tk).length + ' توکن' : 'یافت نشد');
}

grp('متن رویِ سطوحِ همان تم ≥ 4.5 (AA، متنِ معمولی)');
/* برایِ هر تم، رنگِ متنِ «امن» (--primary-dark) و متن/متنِ کم‌رنگ باید رویِ
   همهٔ سطوحی که واقعاً زیرِ متن می‌آیند AA باشند. سطوح عمداً شاملِ softها هم
   هستند: همان‌جایی که --primary شکست می‌خورد. */
const SURFACES = ['surface', 'surface-2', 'bg', 'primary-soft'];
for (const { id, tk } of parsed) {
  if (!tk) continue;
  for (const bg of SURFACES) {
    if (!isHex(tk[bg] || '')) continue;
    const r = ratio(tk['primary-dark'], tk[bg]);
    chk(`${id}: --primary-dark رویِ --${bg} ≥ 4.5`, isHex(tk['primary-dark'] || '') && r >= AA_NORMAL,
      isHex(tk['primary-dark'] || '') ? `${tk['primary-dark']} روی ${tk[bg]} = ${r.toFixed(2)}` : '--primary-dark تعریف نشده');
  }
  for (const [fg, bg] of [['text', 'surface'], ['muted', 'surface-2'], ['muted', 'surface']]) {
    if (!isHex(tk[fg] || '') || !isHex(tk[bg] || '')) continue;
    const r = ratio(tk[fg], tk[bg]);
    chk(`${id}: --${fg} رویِ --${bg} ≥ 4.5`, r >= AA_NORMAL, `${tk[fg]} روی ${tk[bg]} = ${r.toFixed(2)}`);
  }
}

grp('قاعدهٔ توکن: --primary رنگِ پرکردن است، نه رنگِ متن');
/* اگر جایی `color:var(--primary)` بماند، رویِ سطوحِ softِ تم زیرِ AA می‌رود —
   همان نقصی که در .tab.active بود. متن باید از --primary-dark بیاید. */
const TEXT_PRIMARY_RE = /(^|[;{\s])color\s*:\s*var\(\s*--primary\s*\)/g;
const offenders = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/styles')).filter((x) => x.endsWith('.css'))) {
  const txt = fs.readFileSync(path.join(ROOT, 'src/styles', f), 'utf8');
  for (const line of txt.split('\n')) {
    TEXT_PRIMARY_RE.lastIndex = 0;
    if (TEXT_PRIMARY_RE.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 120)}`);
  }
}
chk('هیچ stylesheet‌ای color:var(--primary) ندارد', offenders.length === 0, offenders.join(' | '));

grp('کنترلِ منفیِ همان قاعده (تشخیص باید واقعاً بگیرد)');
const FIXTURE = '.x{color:var(--primary)}\n.y{ background:var(--primary) }\n.z{color:var(--primary-dark)}';
const hits = FIXTURE.split('\n').filter((l) => { TEXT_PRIMARY_RE.lastIndex = 0; return TEXT_PRIMARY_RE.test(l); });
chk('نمونهٔ نقض گرفته می‌شود و پرکردن/متنِ امن گرفته نمی‌شود',
  hits.length === 1 && /\.x\{/.test(hits[0]), JSON.stringify(hits));

grp('متنِ سفید رویِ پرکردنِ --primary ≥ 4.5 (دکمه‌هایِ پر)');
for (const { id, tk } of parsed) {
  if (!tk || !isHex(tk.primary || '')) continue;
  const r = ratio('#ffffff', tk.primary);
  chk(`${id}: #fff رویِ --primary ≥ 4.5`, r >= AA_NORMAL, `${tk.primary} = ${r.toFixed(2)}`);
}

console.log('');
console.log('────────────────────────────────────────────────────');
if (fail === 0) console.log('a11y-contrast-tokens: ' + pass + '/' + pass + ' سبز ✅');
else {
  console.log('a11y-contrast-tokens: ' + pass + ' سبز / ' + fail + ' قرمز ❌');
  for (const e of errors) console.log('   ' + e);
  process.exit(1);
}
