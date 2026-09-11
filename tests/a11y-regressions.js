#!/usr/bin/env node
'use strict';
/**
 * تست‌هایِ رگرسیونِ دسترس‌پذیری (استاتیک، بدونِ مرورگر) — مکملِ tests/a11y-runtime.js
 *
 * چرا جدا از تستِ runtime؟ تستِ runtime به playwright + chromium نیاز دارد؛
 * این تست رویِ سورس اجرا می‌شود و در هر محیطی (CI سبک) جلوی بازگشتِ
 * نقض‌هایی را می‌گیرد که یک‌بار در اسکنِ axe-core پیدا و رفع شدند:
 *
 *   دور ۱ (critical):
 *     - select-name: سلکت‌های بی‌نام (بدونِ label/aria-label) در ۸ نما
 *     - label: input بی‌برچسب (چک‌باکسِ «چک‌لیست فردا»، تاریخِ حضورغیاب، فایلِ تکلیف)
 *   دور ۲ (serious):
 *     - color-contrast: توکن‌هایِ رنگیِ متن باید رویِ پس‌زمینه‌هایشان AA (‏≥4.5:1) بدهند
 *     - opacity:.7 رویِ متنِ muted کنتراستِ مؤثر را زیرِ 4.5 می‌بُرد
 *
 * قاعدهٔ mutation: اگر هر aria-label حذف شود یا توکنِ رنگی روشن‌تر شود، این تست سرخ می‌شود.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

/* ── ۱) select-name / label: کنترل‌هایِ رفع‌شده باید aria-label نگه دارند ── */
const mustHaveAria = [
  ['src/js/06-login.js',                 'data-f="pubschool"'],
  ['src/js/32-atrisk-meetings-growth.js','data-f="riskDays"'],
  ['src/js/56-sida-diff.js',             'data-f="term"'],
  ['src/js/12-attendance.js',            'data-f="class"'],
  ['src/js/13-grades.js',                'data-f="class"'],
  ['src/js/15-schedule.js',              'data-f="homepick"'],
  ['src/js/17-student-record.js',        'id="cert_term"'],
  ['src/js/17-student-record.js',        'id="cert_tpl"'],
  ['src/js/12-attendance.js',            'type="date" data-f="date"'],
  ['src/js/08-dashboard.js',             'data-act="tomorrow-check"'],
  ['src/js/51-homework.js',              'id="hwfile_'],
];
console.log('▸ کنترل‌هایِ فرم باید نامِ دسترس‌پذیر داشته باشند (axe: select-name/label)');
for (const [file, marker] of mustHaveAria) {
  const src = read(file);
  const i = src.indexOf(marker);
  if (i < 0) { ok(false, `${file} — نشانگرِ «${marker}» پیدا نشد (کد جابه‌جا شده؟ تست را به‌روز کن)`); continue; }
  /* aria-label باید در همان تگ (تا ۳۰۰ نویسه اطراف نشانگر، پیش از >) باشد */
  const start = src.lastIndexOf('<', i);
  const end = src.indexOf('>', i);
  const tag = src.slice(Math.max(0, start), end > 0 ? end + 1 : i + 300);
  ok(/aria-label=/.test(tag), `${file} :: ${marker} → aria-label دارد`);
}

/* ── ۲) کنتراستِ رنگ (axe: color-contrast) — WCAG AA برایِ متنِ عادی ≥ 4.5:1 ── */
function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const css = read('src/styles/base.css');
function cssVar(name) {
  const m = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  return m ? m[1] : null;
}
console.log('▸ توکن‌هایِ رنگی باید AA بدهند (axe: color-contrast)');
const pairs = [
  /* [نامِ تست, رنگِ متن, پس‌زمینه] */
  ['--green رویِ سفید (متنِ درون‌خطی مثل «۰ ریال»)',        cssVar('green'), '#ffffff'],
  ['--red رویِ سفید (متنِ درون‌خطی مثل «▼ ۰٫۵۶»)',           cssVar('red'), '#ffffff'],
  ['--amber رویِ سفید',                                        cssVar('amber'), '#ffffff'],
  ['سفید رویِ --green (toast.ok)',                             '#ffffff', cssVar('green')],
  ['سفید رویِ --red (toast.err پایه)',                          '#ffffff', cssVar('red')],
  ['--green-text رویِ --green-soft (badge/sync-chip)',          cssVar('green-text'), cssVar('green-soft')],
  ['--red-text رویِ --red-soft',                                cssVar('red-text'), cssVar('red-soft')],
  ['--amber-text رویِ --amber-soft',                            cssVar('amber-text'), cssVar('amber-soft')],
  ['--muted رویِ سفید',                                        cssVar('muted'), '#ffffff'],
  ['--muted رویِ --surface-2',                                  cssVar('muted'), cssVar('surface-2')],
];
for (const [name, fg, bg] of pairs) {
  if (!fg || !bg) { ok(false, name + ' — توکن پیدا نشد'); continue; }
  const r = contrast(fg, bg);
  ok(r >= 4.5, `${name}: ${r.toFixed(2)}:1 (نیاز ≥ 4.5)`);
}

/* nav-group رویِ تیره‌ترین رنگِ گرادیانِ سایدبار */
{
  const m = css.match(/\.nav-group\{[^}]*color:(#[0-9a-fA-F]{6})/);
  ok(m && contrast(m[1], '#0b1329') >= 4.5 && contrast(m[1], '#14225a') >= 4.5,
    `.nav-group رویِ گرادیانِ سایدبار (هر دو سرِ گرادیان ≥ 4.5)` + (m ? ` — ${m[1]}` : ' — رنگ پیدا نشد'));
}
/* b-gray و b-cyan و b-purple: رنگِ صریح */
for (const [cls, bg] of [['b-gray', '#eef1f6'], ['b-cyan', '#e2f4fb']]) {
  const m = css.match(new RegExp('\\.' + cls + '\\{background:#[0-9a-fA-F]{6};color:(#[0-9a-fA-F]{6})'));
  ok(m && contrast(m[1], bg) >= 4.5, `.${cls}: ` + (m ? contrast(m[1], bg).toFixed(2) + ':1' : 'رنگِ صریح پیدا نشد'));
}
{
  const m = css.match(/\.b-purple\{background:var\(--purple-soft\);color:(#[0-9a-fA-F]{6})/);
  const soft = cssVar('purple-soft');
  ok(m && soft && contrast(m[1], soft) >= 4.5, '.b-purple: ' + (m && soft ? contrast(m[1], soft).toFixed(2) + ':1' : 'پیدا نشد'));
}
/* toast.warn: پس‌زمینهٔ صریح با متنِ سفید */
{
  const m = css.match(/\.toast\.warn\{background:(#[0-9a-fA-F]{6});color:#fff\}/);
  ok(m && contrast('#ffffff', m[1]) >= 4.5, '.toast.warn: ' + (m ? contrast('#ffffff', m[1]).toFixed(2) + ':1' : 'پیدا نشد'));
}
/* toast.err: پس‌زمینهٔ صریحِ تیره (نه var(--red) روشنِ قدیمی) */
{
  const m = css.match(/\.toast\.err\{background:(#[0-9a-fA-F]{6})\}/);
  ok(m && contrast('#ffffff', m[1]) >= 4.5, '.toast.err: ' + (m ? contrast('#ffffff', m[1]).toFixed(2) + ':1' : 'پیدا نشد'));
}

/* ── ۳) opacity رویِ متنِ muted ممنوع (کنتراستِ مؤثر را می‌شکند) ── */
console.log('▸ opacity رویِ متنِ muted ممنوع');
{
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src/js'))) {
    if (!f.endsWith('.js')) continue;
    const src = read('src/js/' + f);
    if (/class="small muted" style="opacity:\.?\d/.test(src) || /muted[^"]*"\s+style="[^"]*opacity:\s*\.[0-8]/.test(src)) bad.push(f);
  }
  ok(bad.length === 0, 'هیچ opacity<0.9 رویِ متنِ muted — ' + (bad.length ? 'نقض: ' + bad.join(', ') : 'پاک'));
}

console.log(`\nجمع: ${pass} قبول، ${fail} رد`);
process.exit(fail ? 1 : 0);
