#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   docs-export-script.js — سنجه‌های اسکریپت برون‌برد:
     DE-VAL  معتبر بودن اسکریپت (نحو + پیام نبود پنداک + کد ۰)
     DE-IDE  اجرای دوبار پشت‌سرهم = ایدِمپوتنت (هر دو کد ۰)
     DE-ENV  گیت‌ایگنور + راهنما + ارجاع سند تحویل
   اجرا: node tests/docs-export-script.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

grp('DE-VAL — اعتبار اسکریپت');
const script = rd('tools/docs-export.sh');
chk('اسکریپت وجود دارد', !!script);
let syntax = 0;
try { execFileSync('bash', ['-n', 'tools/docs-export.sh'], { cwd: ROOT, stdio: 'pipe' }); }
catch (e) { syntax = e.status; }
chk('نحو بش معتبر است (bash -n)', syntax === 0);
chk('رفتار نبود پنداک در اسکریپست تعریف شده', /pandoc not installed/.test(script || '') && /exit 0/.test(script || ''));
chk('خروجی در مسیر گیت‌ایگنورد', /docs\/_export/.test(script || ''));

grp('DE-IDE — ایدِمپوتنسی (اجرای دوبار)');
let c1 = 0, o1 = '', c2 = 0, o2 = '';
try { o1 = execFileSync('bash', ['tools/docs-export.sh'], { cwd: ROOT, encoding: 'utf8' }); }
catch (e) { c1 = e.status; o1 = String(e.stdout || ''); }
try { o2 = execFileSync('bash', ['tools/docs-export.sh'], { cwd: ROOT, encoding: 'utf8' }); }
catch (e) { c2 = e.status; o2 = String(e.stdout || ''); }
chk('اجرای نخست کد ۰', c1 === 0, String(c1));
chk('اجرای دوم کد ۰', c2 === 0, String(c2));
const hasPandoc = !/pandoc not installed/.test(o1);
if (hasPandoc) {
  chk('با پنداک: فهرست تولید شد', fs.existsSync(path.join(ROOT, 'docs/_export/index.html')));
} else {
  chk('بی پنداک: پیام نصب چاپ شد', /pandoc not installed/.test(o1) && /pandoc not installed/.test(o2));
  chk('بی پنداک: هیچ خروجی‌ای ساخته نشد', !fs.existsSync(path.join(ROOT, 'docs/_export/html')));
}

grp('DE-ENV — محیط و مستندات');
chk('گیت‌ایگنور مسیر برون‌برد را دارد', /docs\/_export\//.test(rd('.gitignore') || ''));
chk('راهنمای برون‌برد موجود است', !!rd('docs/DOCS_EXPORT_GUIDE.md'));
chk('راهنما دستور نصب پنداک دارد', /pandoc/.test(rd('docs/DOCS_EXPORT_GUIDE.md') || '') && /apt-get|brew|winget/.test(rd('docs/DOCS_EXPORT_GUIDE.md') || ''));
chk('بستهٔ تحویل به اسکریپت ارجاع دارد', /docs-export\.sh/.test(rd('docs/DOCUMENTATION_HANDOVER.md') || ''));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ اسکریپت برون‌برد معتبر و ایدِمپوتنت است.');
