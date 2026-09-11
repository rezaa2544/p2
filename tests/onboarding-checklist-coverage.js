#!/usr/bin/env node
/* onboarding-checklist-coverage.js — پوشش چک‌لیست آنبوردینگ (چت ۶، مأموریت ۳۱) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'ONBOARDING_CHECKLIST.md');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function grp(t) { console.log('▸ ' + t); }
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

chk('چک‌لیست آنبوردینگ وجود دارد', fs.existsSync(DOC));
const doc = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';

grp('چهار بخش اصلی');
[['۱', 'روز اول'], ['۲', 'هفتهٔ اول'], ['۳', 'ماه اول'], ['۴', 'مسئولیت‌های جاری']]
  .forEach(([num, title]) => chk('بخش ' + num + ': ' + title, doc.includes('## بخش ' + num + ': ' + title)));

grp('چک‌باکس‌ها');
const boxes = (doc.match(/^- \[ \] /gm) || []).length;
const nested = (doc.match(/^ {2,}- \[ \] /gm) || []).length;
chk('دست‌کم ۲۵ چک‌باکس ریشه (' + fa(boxes) + ')', boxes >= 25, String(boxes));
chk('مجموع چک‌باکس‌ها با تودرتوها (' + fa(boxes + nested) + ')', boxes + nested >= 30, String(boxes + nested));
chk('هیچ چک‌باکس از پیش تیک‌خورده نیست', !/- \[x\]/i.test(doc));

grp('روز اول');
['نصب Node', 'PostgreSQL', 'Redis', 'npm ci', 'node server/seed.js', 'node tests/smoke.js',
 '۵۴۷/۵۴۷', 'SKILLS_MASTER.md', 'DOCS_INDEX.md', 'روفلو'].forEach((i) =>
  chk('آیتم روز اول: ' + i, doc.includes(i)));

grp('هفتهٔ اول');
['NATIONAL_ARCHITECTURE.md', 'DATABASE_ARCHITECTURE.md', 'SECURITY_MODEL.md',
 'wave1-multi-instance.js', 'demo-thursday.js', 'docs-freeze-marker.js', 'secret-scan.js'].forEach((i) =>
  chk('آیتم هفتهٔ اول: ' + i, doc.includes(i)));

grp('ماه اول');
['۲۵٪ اسناد', 'یک پی‌آر کوچک', 'دریل', 'آموزش یک موضوع'].forEach((i) =>
  chk('آیتم ماه اول: ' + i, doc.includes(i)));

grp('مسئولیت‌ها و پیوندها');
['روزانه', 'هفتگی', 'ماهانه', 'رویدادمحور'].forEach((c) =>
  chk('چرخهٔ مسئولیت: ' + c, doc.includes('**' + c + '**')));
['ONBOARDING_NEW_DEVELOPER.md', 'DOCUMENTATION_HANDOVER.md', 'DOCUMENTATION_MAINTENANCE.md', 'HANDOFF.md'].forEach((r) =>
  chk('ارجاع به ' + r, doc.includes(r)));
chk('سه خط قرمز تازه‌وارد آمده', doc.includes('سه خط قرمز تازه‌وارد'));

grp('امنیت و جایگاه در کتابخانه');
chk('هیچ رازی در سند نیست', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));
chk('ردیف نمایه برای چک‌لیست وجود دارد', rd('docs/DOCS_INDEX.md').includes('ONBOARDING_CHECKLIST.md'));

console.log('');
console.log('نتیجه: ' + fa(pass) + ' موفق / ' + fa(fail) + ' ناموفق (از ' + fa(pass + fail) + ')');
process.exit(fail ? 1 : 0);
