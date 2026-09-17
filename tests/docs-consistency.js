#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-consistency.js — تست ممیزی هماهنگی مستندات:
     DC-TOOL ابزار بررسی اجرا می‌شود و تعارض صفر است
     DC-DOC  گزارش ممیزی با بخش‌های لازم موجود است
     DC-NUM  اعداد مرجع در منابع اصلی دست‌نخورده‌اند
     DC-NEG  الگوهای متناقضِ شناخته‌شده در هیچ سندی نیستند
   اجرا: node tests/docs-consistency.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 220) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

grp('DC-TOOL — ابزار بررسی');
let out = '', code = 0;
try { out = execFileSync('bash', ['tools/docs-consistency-check.sh'], { cwd: ROOT, encoding: 'utf8' }); }
catch (e) { out = String(e.stdout || ''); code = e.status; }
chk('اجرای ابزار با کد ۰ (بدون تعارض)', code === 0, out.split('\n').filter((l) => l.includes('❌')).join(' | '));
chk('دست‌کم ۳۰ بررسی ماشینی انجام شد', (out.match(/✅|❌/g) || []).length >= 30, String((out.match(/✅|❌/g) || []).length));
chk('خلاصهٔ صفر تعارض', /۰ تعارض|0 تعارض/.test(out));

grp('DC-DOC — گزارش ممیزی');
const rep = rd('docs/DOCS_CONSISTENCY_REPORT.md');
chk('گزارگ وجود دارد', !!rep);
if (rep) {
  ['خلاصهٔ اجرایی', 'تعارض‌های یافته‌شده', 'دسته‌های بازرسی‌شدهٔ هماهنگ', 'اقلام باز', 'روش اجرا', 'MACHINE:START', 'MACHINE:END']
    .forEach((s) => chk('بخش/نشانگر «' + s + '»', rep.includes(s)));
  chk('جدول چهار تعارض اصلی پر شده', (rep.match(/\| [۱۲۳۴] \|/g) || []).length >= 4);
  chk('اقلام باز دارای مالک‌اند', /چت [۰-۶]|ناظر/.test(rep.split('اقلام باز')[1] || ''));
  chk('بلوک ماشینی پس از اجرا به‌روز است', /نتیجه: \d+ هماهنگ \/ 0 تعارض/.test(rep));
}

grp('DC-NUM — اعداد مرجع دست‌نخورده');
const cap = rd('docs/CAPACITY_MODEL.md') || '';
[['۱۰٬۰۰۰٬۰۰۰', 'کاربر ثبت‌شده'], ['۶٬۰۰۰٬۰۰۰', 'فعال روزانه'], ['۲٬۵۰۰٬۰۰۰', 'پیک همزمان'], ['۲۰٬۰۰۰', 'آر‌پی‌اس پیک'], ['۲٬۵۰۰', 'نوشتن پیک']]
  .forEach(([n, l]) => chk('مرجع «' + l + '»', cap.includes(n)));

grp('DC-NEG — الگوهای متناقض ممنوع');
const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
let bad = [];
for (const f of docs) {
  if (f === 'DOCS_CONSISTENCY_REPORT.md') continue; // گزارش، خودش الگوها را نقل می‌کند
  const s = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
  if (/(^|[^٫۰-۹])۵ میلیون کاربر هم ?زمان|(^|[^٫۰-۹])۵ میلیون کاربر هم‌زمان|۵٬۰۰۰٬۰۰۰ کاربر/.test(s) && !s.includes('یادداشت جایگزینی (ممیزی')) bad.push(f);
}
chk('هر پیک ۵ میلیونی با یادداشت جایگزینی پرچم دارد', bad.length === 0, bad.join(','));
bad = [];
for (const f of docs) {
  if (f === 'DOCS_CONSISTENCY_REPORT.md') continue;
  const s = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
  if (/rate<0\.01"/.test(s)) bad.push(f);
}
chk('آستانهٔ خطای شل (۱٪) در اسناد نقل نشده', bad.length === 0, bad.join(','));
const th = rd('tests/performance/config/thresholds.json') || '';
chk('آستانهٔ سراسری واقعی همچنان ۰٫۱٪ است', th.includes('"http_req_failed": ["rate<0.001"]'));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ اسناد هماهنگ‌اند.');
