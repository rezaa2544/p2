#!/usr/bin/env node
// tests/push-recovery-playbook-coverage.js — پوشش پلی‌بوک نجات کامیت‌های پوش‌نشده (مأموریت ۴۱، چت ۶)
// قرارداد: هشت بخش + فهرست باندل‌ها + قالب دستورات + گیت‌ها + اولویت‌بندی.
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

const FILE = path.join(__dirname, '..', 'docs', 'PUSH_RECOVERY_PLAYBOOK.md');
chk('فایل پلی‌بوک نجات وجود دارد', fs.existsSync(FILE));
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

grp('هشت بخش');
const SECS = ['## ۱) چرا پوش نمی‌شود', '## ۲) فهرست باندل‌های شناخته‌شده',
  '## ۳) دستور پوش هر باندل در نشست جدید', '## ۴) گیت‌های پیش از مرج',
  '## ۵) ترتیب مرج و مدیریت تعارض', '## ۶) اولویت نجات سندباکس‌ها',
  '## ۷) حالت‌های شکست و درمان', '## ۸) چک‌لیست نشستِ نجات'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 26) + '»', doc.includes(s));

grp('چرا پوش نمی‌شود');
const s1 = sectionOf(SECS[0]);
chk('سه دلیل', s1.split('\n').filter((l) => /^\d+\. /.test(l)).length >= 3);
chk('ارجاع به ریسک ئی-۰۰۴', s1.includes('RISK-E-004'));
chk('قاعدهٔ طلایی ساخت باندل', s1.includes('git bundle create') && s1.includes('git bundle verify'));

grp('فهرست باندل‌ها');
const s2 = sectionOf(SECS[1]);
for (const b of ['p0-2-close-v3.bundle', 'delta-scope-final.bundle', 'feedback-widget.bundle', 'wave19-chaos-live.bundle', 'chat7-session6.bundle', 'master-onboarding.bundle']) {
  chk('باندل «' + b + '»', s2.includes(b));
}
for (const br of ['arena/01a08543-p2', 'arena/01a08a4e-p2', 'arena/01a08c7a-p2', 'arena/01a08b24-p2']) {
  chk('شاخهٔ «' + br + '»', s2.includes(br));
}
chk('باندل‌های تاریخچه‌ای چت ۶ ≥ ۵ ردیف', s2.split('\n').filter((l) => l.includes('.bundle`') && l.includes('| `66e03f0') || l.includes('519917e') || l.includes('400d59b') || l.includes('0c84f11') || l.includes('aefbc29') || l.includes('cac106d')).length >= 5);
chk('برآورد ≈۱۰۰ کامیت', s2.includes('۱۰۰ کامیت'));

grp('قالب دستورات');
const s3 = sectionOf(SECS[2]);
for (const c of ['git bundle verify', 'git checkout -b push-', 'git merge', '--no-ff', 'node tests/smoke.js', 'node tools/check-authz.js', 'node tests/secret-scan.js', 'node build.js --check', 'git push origin', 'gh pr create']) {
  chk('دستور «' + c + '»', s3.includes(c));
}
chk('نکتهٔ کلون کم‌عمق', s3.includes('--unshallow') || s3.includes('کم‌عمق'));

grp('گیت‌ها');
const s4 = sectionOf(SECS[3]);
chk('چهار گیت', s4.split('\n').filter((l) => l.startsWith('| `node')).length >= 4);
chk('قاعدهٔ بدون استثنا', s4.includes('بی‌استثناء') || s4.includes('ممنوع'));

grp('ترتیب مرج');
const s5 = sectionOf(SECS[4]);
chk('پی‌آر جدا برای هر باندل', s5.includes('یک پی‌آر جدا'));
chk('قاعدهٔ حفظ دوطرفه', s5.includes('حفظ دوطرفه'));
chk('ارجاع به برنامهٔ ادغام', s5.includes('PR_MERGE_PLAN.md'));

grp('اولویت نجات');
const s6 = sectionOf(SECS[5]);
chk('دست‌کم ۵ ردیف اولویت', s6.split('\n').filter((l) => /^\| [۱-۵] \|/.test(l)).length >= 5);
chk('چت ۷ در صدر (۲۷ کامیت)', s6.includes('چت ۷') && s6.includes('۲۷'));

grp('حالت‌های شکست');
const s7 = sectionOf(SECS[6]);
chk('دست‌کم ۴ حالت', s7.split('\n').filter((l) => l.startsWith('| ') && !l.includes('شکست') && !l.includes('---')).length >= 4);
chk('unrelated histories', s7.includes('unrelated histories'));

grp('چک‌لیست نجات');
const s8 = sectionOf(SECS[7]);
chk('دست‌کم ۷ آیتم', s8.split('\n').filter((l) => l.startsWith('- [ ]')).length >= 7);

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['PR_MERGE_PLAN.md', 'RISK_REGISTER.md', 'P0_BLOCKER_TRACKER.md', 'OPERATIONAL_HANDOVER.md', 'HANDOFF.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
