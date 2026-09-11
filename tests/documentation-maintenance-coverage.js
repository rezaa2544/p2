#!/usr/bin/env node
/* documentation-maintenance-coverage.js — پوشش راهنمای نگهداری مستندات (چت ۶، مأموریت ۳۱) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'DOCUMENTATION_MAINTENANCE.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('سند نگهداری مستندات وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('ده بخش اصلی');
[['۱', 'اصول نگهداری'], ['۲', 'چرخه‌های نگهداری'], ['۳', 'فرآیند افزودن سند جدید'],
 ['۴', 'فرآیند حذف/آرشیو سند'], ['۵', 'فرآیند بامپ قفل'], ['۶', 'تست‌های پوشش مستندات'],
 ['۷', 'نقش‌ها و مسئولیت‌ها'], ['۸', 'ابزارها'], ['۹', 'کلیدهای تاریخی'], ['۱۰', 'بدهی مستنداتی']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('محتوای اصول و چرخه‌ها');
['هر تغییر کد = تغییر سند مرتبط', 'Definition of Done', 'یتیمی وجود ندارد', 'یک منبع حقیقت'].forEach((p) =>
  chk('اصل: ' + p, doc.includes(p)));
['روزانه', 'هفتگی', 'ماهانه', 'فصلی'].forEach((c) =>
  chk('چرخهٔ ' + c, doc.includes('**' + c)));

grp('فرآیندها');
chk('شش گام افزودن سند', (doc.slice(doc.indexOf('## بخش ۳'), doc.indexOf('## بخش ۴')).match(/^\d\. /gm) || []).length === 6);
chk('قاعدهٔ آرشیو نه حذف', doc.includes('حذف نمی‌شود — آرشیو'));
chk('ارجاع به پوشهٔ آرشیو', doc.includes('docs/archive/'));
chk('فریز ۱۴/۱۴ در فرآیند بامپ', doc.includes('۱۴/۱۴'));
chk('چک‌لیست دام آف‌بای‌وان آمده', doc.includes('آف‌بای‌وان'));

grp('تست‌ها و ابزارها');
['tests/docs-freeze-marker.js', 'tests/docs-metrics.js', 'tests/docs-health.js', 'tests/docs-consistency.js',
 'tests/docs-index-coverage.js', 'tools/docs-health.sh', 'tools/docs-consistency-check.sh',
 'tools/generate-data-dictionary.js', 'tools/docs-export.sh'].forEach((t) =>
  chk('ارجاع به ' + t, doc.includes(t)));
chk('الگوی تست تازه معرفی شده', doc.includes('risk-register-coverage.js'));

grp('نقش‌ها');
['مستندساز (چت ۶)', 'مسئول امنیت (چت ۱)', 'اس‌آر‌ای (چت ۴)', 'ناظر'].forEach((r) =>
  chk('نقش: ' + r, doc.includes(r)));

grp('کلیدهای تاریخی و بدهی');
chk('قفل‌های تاریخی مصون‌اند', doc.includes('rc1.md') && doc.includes('rc13'));
chk('هندآف و آرشیوش آمده', doc.includes('HANDOFF_ARCHIVE.md'));
chk('بدهی‌های رویداد-وابسته اولویت‌بندی شده‌اند', doc.includes('🔴 بالا') && doc.includes('🟢 پایین'));
chk('بدهی بار واقعی در فهرست است', doc.includes('LOAD_TEST_RESULTS.md'));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای سند نگهداری وجود دارد', rd('docs/DOCS_INDEX.md').includes('DOCUMENTATION_MAINTENANCE.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
