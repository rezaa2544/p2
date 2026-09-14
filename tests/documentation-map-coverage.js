#!/usr/bin/env node
/* documentation-map-coverage.js — پوشش نقشه و کاتالوگ مستندات (چت ۶، مأموریت ۳۲) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'DOCUMENTATION_MAP.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('نقشهٔ مستندات وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('هشت بخش اصلی');
[['۱', 'نمای کلی'], ['۲', 'نقشهٔ حرارتی دسته‌ها'], ['۳', 'نمایهٔ کلیدواژه'],
 ['۴', 'نمایه بر اساس نقش'], ['۵', 'نمایه بر اساس موج'], ['۶', 'نمایه بر اساس مأموریت'],
 ['۷', 'اسناد یتیم'], ['۸', 'اسناد قطب']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('سازگاری زنده با کاتالوگ');
const tool = require(path.join(ROOT, 'tools/docs-metadata.js'));
const entries = tool.buildCatalog();
const total = entries.length;
const rootCount = entries.filter((e) => !e.path.replace('docs/', '').includes('/')).length;
chk('ادعای کل اسناد با دیسک یکی است (' + fa(total) + ')', doc.includes('**' + fa(total) + '**'), String(total));
chk('ادعای شمار ریشه درست است (' + fa(rootCount) + ')', doc.includes(fa(rootCount)), String(rootCount));
const sum = tool.summarize(entries);
chk('ادعای صفر یتیم با کاتالوگ سازگار است', sum.orphans.length === 0 && doc.includes('صفر سند یتیم'));
chk('قطب اول کاتالوگ در جدول قطب‌ها هست', doc.includes(path.basename(sum.hubs[0].path)));

grp('نمایه‌ها');
const kwSec = doc.slice(doc.indexOf('## بخش ۳'), doc.indexOf('## بخش ۴'));
const kwRows = (kwSec.match(/^\| \S.*\| \*\*\d+.*?\*\* |^\| [^|]+ \| [۰-۹0-9]+ \|/gm) || kwSec.split('\n').filter((l) => /^\| /.test(l)).length - 2);
const kwCount = kwSec.split('\n').filter((l) => /^\| /.test(l) && !/کلیدواژه/.test(l) && !/^\|---/.test(l)).length;
chk('حداقل ۵۰ کلیدواژه (' + fa(kwCount) + ')', kwCount >= 50, String(kwCount));
const roleSec = doc.slice(doc.indexOf('## بخش ۴'), doc.indexOf('## بخش ۵'));
chk('حداقل ۶ نقش', roleSec.split('\n').filter((l) => /^\| /.test(l) && !/نقش/.test(l) && !/^\|---/.test(l)).length >= 6);
const waveSec = doc.slice(doc.indexOf('## بخش ۵'), doc.indexOf('## بخش ۶'));
chk('حداقل ۱۰ موج', waveSec.split('\n').filter((l) => /^\| موج /.test(l)).length >= 10);
const misSec = doc.slice(doc.indexOf('## بخش ۶'), doc.indexOf('## بخش ۷'));
chk('حداقل ۱۰ ردیف مأموریت', misSec.split('\n').filter((l) => /^\| /.test(l) && !/مأموریت |^\|---/.test(l)).length >= 10);
const hubSec = doc.slice(doc.indexOf('## بخش ۸'), doc.indexOf('## تاریخچه'));
chk('جدول قطب‌ها ده ردیف دارد', hubSec.split('\n').filter((l) => /^\| [۰-۹0-9]+ \| /.test(l)).length === 10);

grp('ارجاع‌های نقشه واقعی‌اند');
const links = [...doc.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]);
chk('نقشه بیش از ۱۰۰ لینک داخلی دارد (' + fa(links.length) + ')', links.length > 100, String(links.length));
const broken = links.filter((l) => !fs.existsSync(path.join(ROOT, 'docs', l)));
chk('هیچ لینک شکسته‌ای ندارد', broken.length === 0, broken.slice(0, 3).join(','));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای نقشه وجود دارد', rd('docs/DOCS_INDEX.md').includes('DOCUMENTATION_MAP.md'));
chk('ابزار متادیتا در راهنمای نگهداری ثبت شده', rd('docs/DOCUMENTATION_MAINTENANCE.md').includes('docs-metadata.js'));

grp('شمار بازگشتی stats بدون بازتولید اسناد');
const stats = require(path.join(ROOT, 'tools/docs-stats-sync.js'));
const fixture = fs.mkdtempSync(path.join(require('os').tmpdir(), 'docs-stats-'));
const seeded = ['README.md', path.basename(stats.currentFreeze()), 'nested/direct.md',
  'nested/_preserved.md', 'nested/deep/report.md', 'daily-reports/Chat7/report.md',
  'folder.md/child.md', 'nested/data.json'];
try {
  for (const rel of seeded) {
    const file = path.join(fixture, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Fixture\n');
  }
  fs.symlinkSync(fixture, path.join(fixture, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
  const counted = stats.truth(fixture);
  chk('ریشه و کل درخت فقط فایل‌های واقعی را می‌شمارند', counted.docsRoot === 2 && counted.docsSub === 5 && counted.docsTree === 7);
  chk('همهٔ عمق‌ها زیر نام پوشهٔ اصلی جمع می‌شوند', counted.subs.nested === 3 && counted.subs['daily-reports'] === 1 && counted.subs['folder.md'] === 1 && Object.keys(counted.subs).length === 3);
  chk('truth قطعی و read-only است', JSON.stringify(counted) === JSON.stringify(stats.truth(fixture)) && seeded.every((rel) => fs.readFileSync(path.join(fixture, rel), 'utf8') === '# Fixture\n'));
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
