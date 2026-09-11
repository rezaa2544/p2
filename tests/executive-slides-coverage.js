#!/usr/bin/env node
/* executive-slides-coverage.js — پوشش طرح اسلایدهای ارائهٔ مدیریتی (چت ۶، مأموریت ۳۳) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'EXECUTIVE_SLIDES_OUTLINE.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('طرح اسلایدها وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('پانزده اسلاید');
const nums = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۱۰', '۱۱', '۱۲', '۱۳', '۱۴', '۱۵'];
nums.forEach((n) => chk('اسلاید ' + n + ' عنوان دارد', doc.includes('## اسلاید ' + n + ' — ')));

grp('ساختار هر اسلاید');
const slides = doc.split(/^## اسلاید /m).slice(1).map((s) => {
  // هر اسلاید تا نخستین جداکنندهٔ «---» یا سرفصل بعدی
  let end = s.length;
  const sep = s.indexOf('\n---');
  if (sep !== -1) end = Math.min(end, sep);
  const nx = s.search(/\n## /);
  if (nx !== -1) end = Math.min(end, nx);
  return s.slice(0, end);
});
chk('دقیقاً ۱۵ اسلاید پارس شد (' + fa(slides.length) + ')', slides.length === 15, String(slides.length));
let bulletsOk = true, chartOk = true;
for (const s of slides) {
  const bullets = s.split('\n').filter((l) => l.startsWith('- ') && !l.includes('نمودار پیشنهادی')).length;
  if (bullets < 3 || bullets > 5) bulletsOk = false;
  if ((s.match(/نمودار پیشنهادی:/g) || []).length !== 1) chartOk = false;
}
chk('هر اسلاید ۳ تا ۵ گلوله دارد', bulletsOk);
chk('هر اسلاید دقیقاً یک نمودار پیشنهادی دارد', chartOk);

grp('روایت ارائه');
['یک نگاه', 'آمادگی', 'مانع', 'تصمیم', 'خط زمانی', 'پایلوت', 'شاخص', 'توصیه'].forEach((t) =>
  chk('موضوع روایت: ' + t, doc.includes(t)));
chk('زمان‌بندی ۳۰ دقیقه آمده', doc.includes('۳۰ دقیقه'));
chk('یادداشت‌های اجرا دارد', doc.includes('## یادداشت‌های اجرا'));

grp('ارجاع‌ها و جایگاه');
chk('به بستهٔ خلاصه ارجاع می‌دهد', doc.includes('EXECUTIVE_BRIEFING.md'));
chk('خروجی جلسه به دفتر تصمیم‌ها برمی‌گردد', doc.includes('IRAN_COMPLIANCE_PACKAGE.md'));
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه وجود دارد', rd('docs/DOCS_INDEX.md').includes('EXECUTIVE_SLIDES_OUTLINE.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
