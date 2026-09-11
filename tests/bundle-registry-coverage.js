#!/usr/bin/env node
// tests/bundle-registry-coverage.js — پوشش رجیستری مرکزی باندل‌ها (مأموریت ۴۲، چت ۶)
// قرارداد: جدول مرکزی همهٔ باندل‌ها + پروتکل راستی‌آزمایی + دستور بازیابی + ریسک/اولویت.
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

const FILE = path.join(__dirname, '..', 'docs', 'BUNDLE_REGISTRY.md');
chk('فایل رجیستری وجود دارد', fs.existsSync(FILE));
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

grp('شش بخش');
const SECS = ['## ۱) هدف و قواعد', '## ۲) جدول مرکزی باندل‌ها', '## ۳) پروتکل راستی‌آزمایی',
  '## ۴) دستور بازیابی در نشست جدید', '## ۵) ریسک و اولویت', '## ۶) قواعد نگهداری رجیستری'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 24) + '»', doc.includes(s));

grp('جدول مرکزی — ستون‌ها و ردیف‌ها');
const s2 = sectionOf(SECS[1]);
for (const col of ['| سندباکس |', 'مسیر در سندباکس', 'رأس (Tip)', 'حجم', 'وضعیت']) chk('ستون «' + col + '»', s2.includes(col));
const rows = s2.split('\n').filter((l) => l.startsWith('| چت'));
chk('دست‌کم ۲۴ ردیف سندباکسی (' + fa(rows.length) + ')', rows.length >= 24);
for (const b of ['p0-2-close-v1', 'p0-2-close-v3', 'p0-2-close-v5', 'delta-schema-gaps', 'delta-scope-columns',
  'delta-teacher-scope', 'delta-driver-scope', 'feedback-widget', 'a11y-rebuild', 'wave19-chaos-live',
  'wave19-wal-full', 'chat7-session6', 'lessons-learned', 'executive-briefing', 'release-notes-rc17',
  'openapi-spec', 'config-reference', 'pilot-playbook', 'vendor-playbook', 'master-onboarding',
  'push-recovery', 'docs-index']) {
  chk('باندل «' + b + '»', s2.includes(b));
}
for (const br of ['arena/01a08543-p2', 'arena/01a08a4e-p2', 'arena/01a08c7a-p2', 'arena/01a08b24-p2']) {
  chk('شاخهٔ «' + br + '»', s2.includes(br));
}
for (const sha of ['66e03f0', '519917e', '400d59b', '0c84f11', 'aefbc29', 'cac106d', '1d26d8f', '5f675d4']) {
  chk('رأس «' + sha + '»', s2.includes(sha));
}
chk('ستون حجم برای باندل‌های تأییدشده', s2.includes('۸.۶ مگابایت'));

grp('پروتکل راستی‌آزمایی');
const s3 = sectionOf(SECS[2]);
chk('پنج گام شماره‌دار', s3.split('\n').filter((l) => /^\d+\. /.test(l)).length >= 5);
chk('verify + complete history', s3.includes('git bundle verify') && s3.includes('complete history'));
chk('محل بازیابی ردیف‌های از دست رفته', s3.includes('محل بازیابی'));

grp('دستور بازیابی');
const s4 = sectionOf(SECS[3]);
for (const c of ['git bundle verify', 'git checkout -b push-', 'git merge', '--no-ff', 'git push']) {
  chk('دستور «' + c + '»', s4.includes(c));
}
chk('ترتیب مرج + ارجاع به پلی‌بوک نجات', s4.includes('PUSH_RECOVERY_PLAYBOOK.md'));

grp('ریسک و اولویت');
const s5 = sectionOf(SECS[4]);
chk('دست‌کم ۴ ردیف ریسک', s5.split('\n').filter((l) => /^\| [۱-۴] \|/.test(l)).length >= 4);
chk('چت ۷ پرریسک‌ترین', s5.includes('chat7-session6'));

grp('قواعد نگهداری');
const s6 = sectionOf(SECS[5]);
chk('قاعدهٔ باندل جدید = ردیف جدید', s6.includes('ردیف جدید'));
chk('نجات‌یافته پس از مرج', s6.includes('نجات‌یافته'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['PUSH_RECOVERY_PLAYBOOK.md', 'PR_MERGE_PLAN.md', 'RISK_REGISTER.md', 'HANDOFF.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
