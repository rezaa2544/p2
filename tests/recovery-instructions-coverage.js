#!/usr/bin/env node
// tests/recovery-instructions-coverage.js — پوشش راهنمای بازیابی باندل جامع چت ۶ (مأموریت ۴۳، چت ۶)
// قرارداد: پنج بخش — محتوا، ورود، ری‌بیس، راستی‌آزمایی، بازیابی از پشتیبان دوم.
'use strict';
const fs = require('fs');
const path = require('path');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
let pass = 0, fail = 0;
const failures = [];
function grp(t) { console.log('\n■ ' + t); }
function chk(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name); }
}

const FILE = path.join(__dirname, '..', 'docs', 'RECOVERY_INSTRUCTIONS.md');
chk('فایل راهنمای بازیابی وجود دارد', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) process.exit(1);
const doc = fs.readFileSync(FILE, 'utf8');
function sectionOf(title) {
  const start = doc.indexOf(title);
  if (start === -1) return '';
  const lines = doc.slice(start + title.length).split('\n');
  let inFence = false;
  const out = [];
  for (const l of lines) {
    if (l.startsWith('```')) inFence = !inFence;
    if (!inFence && l.startsWith('## ')) break;
    out.push(l);
  }
  return out.join('\n');
}

grp('پنج بخش');
const SECS = ['## ۱) محتوای باندل جامع', '## ۲) ورود باندل در نشست جدید',
  '## ۳) اگر main جلو رفته باشد', '## ۴) راستی‌آزمایی پس از مرج', '## ۵) اگر باندل نبود'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 24) + '»', doc.includes(s));

grp('محتوای باندل');
const s1 = sectionOf(SECS[0]);
chk('نام باندل جامع', s1.includes('chat6-master-recovery.bundle'));
chk('پشتیبان دوم تار', s1.includes('docs-backup.tar.gz'));
chk('قفل‌های آرسی۱ تا آرسی۲۶', s1.includes('rc1') && s1.includes('rc26'));
chk('پوشش مأموریت‌های ۳۶ تا ۴۳', s1.includes('۳۶ تا ۴۳'));

grp('ورود باندل');
const s2 = sectionOf(SECS[1]);
for (const c of ['git bundle verify', 'git fetch origin main', 'git checkout -b chat6-master-recovery', 'git merge bundle-chat6 --no-ff']) {
  chk('دستور «' + c + '»', s2.includes(c));
}
chk('راه‌حل کلون کم‌عمق', s2.includes('--unshallow') || s2.includes('--depth'));

grp('ری‌بیس و مرج جلوافتادگی');
const s3 = sectionOf(SECS[2]);
chk('دو گزینهٔ مرج/ری‌بیس', s3.includes('git merge origin/main') && s3.includes('git rebase origin/main'));
chk('قاعدهٔ حفظ دوطرفه', s3.includes('حفظ دوطرفه'));
chk('چهار گیت پیش از پوش', s3.includes('۵۴۷') && s3.includes('۱۱/۱۱'));
chk('پوش و پی‌آر', s3.includes('git push origin chat6-master-recovery') && s3.includes('gh pr create'));

grp('راستی‌آزمایی پس از مرج');
const s4 = sectionOf(SECS[3]);
chk('فریز + سلامت + شمارش', s4.includes('docs-freeze-marker.js') && s4.includes('docs-health.sh') && s4.includes('wc -l'));
chk('به‌روزرسانی رجیستری', s4.includes('BUNDLE_REGISTRY.md'));

grp('بازیابی از پشتیبان دوم');
const s5 = sectionOf(SECS[4]);
chk('بازکردن تار', s5.includes('tar -xzf'));
chk('بازسازی نمایه', s5.includes('docs-metadata.js'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['BUNDLE_REGISTRY.md', 'PUSH_RECOVERY_PLAYBOOK.md', 'PR_MERGE_PLAN.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
