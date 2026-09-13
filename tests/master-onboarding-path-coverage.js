#!/usr/bin/env node
// tests/master-onboarding-path-coverage.js — پوشش مسیر جامع آنبوردینگ (مأموریت ۴۰، چت ۶)
// قرارداد ابلاغی: هشت بخش + سه مسیر زمانی + مسیرهای تخصصی + ۵/۱۵/۳۰ سؤال درک.
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

const FILE = path.join(__dirname, '..', 'docs', 'MASTER_ONBOARDING_PATH.md');
chk('فایل مسیر آنبوردینگ وجود دارد', fs.existsSync(FILE));
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
const SECS = ['## ۱) هدف', '## ۲) مسیر ۱ روزه', '## ۳) مسیر ۱ هفته‌ای', '## ۴) مسیر ۱ ماهه',
  '## ۵) مسیرهای تخصصی', '## ۶) چک‌لیست درک', '## ۷) مسیرهای اشتباه رایج', '## ۸) منابع کمکی'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 22) + '»', doc.includes(s));

grp('هدف — سه سطح');
const s1 = sectionOf(SECS[0]);
chk('جدول سه سطح ۱ روز/۱ هفته/۱ ماه', s1.includes('**۱ روز**') && s1.includes('**۱ هفته**') && s1.includes('**۱ ماه**'));
chk('استثنای مدیران (بریفینگ)', s1.includes('EXECUTIVE_BRIEFING.md'));

grp('مسیر ۱ روزه — ساعت‌به‌ساعت');
const s2 = sectionOf(SECS[1]);
for (const h of ['۹–۱۰', '۱۰–۱۲', '۱۳–۱۵', '۱۵–۱۷']) chk('بلوک «' + h + '»', s2.includes(h));
chk('دود ۵۴۷/۵۴۷', s2.includes('۵۴۷/۵۴۷'));
chk('ساعت اول: بریف + واژه‌نامه', s2.includes('SUPERVISOR_BRIEF.md') && s2.includes('GLOSSARY.md'));

grp('مسیر ۱ هفته‌ای — روزبه‌روز');
const s3 = sectionOf(SECS[2]);
for (const d of ['| ۱ |', '| ۲ |', '| ۳ |', '| ۴ |', '| ۵ |', '| ۶ |', '| ۷ |']) chk('روز ' + d, s3.includes(d));
for (const ref of ['ROADMAP.md', 'DATABASE_ARCHITECTURE.md', 'DATA_DICTIONARY.md', 'SECURITY_MODEL.md', 'AUTHORIZATION_MODEL.md', 'SYNC_PROTOCOL.md', 'OBSERVABILITY.md', 'PRODUCTION_RUNBOOK.md']) {
  chk('ارجاع «' + ref + '»', s3.includes(ref));
}
chk('روز هفتم: پی‌آر کوچک', s3.includes('پی‌آر کوچک'));

grp('مسیر ۱ ماهه — هفته‌به‌هفته');
const s4 = sectionOf(SECS[3]);
for (const w of ['| ۱ |', '| ۲ |', '| ۳ |', '| ۴ |']) chk('هفتهٔ ' + w, s4.includes(w));
for (const ref of ['INCIDENT_RESPONSE.md', 'SECRETS_MANAGEMENT.md', 'CONFIGURATION_REFERENCE.md', 'VENDOR_PLAYBOOK.md', 'RISK_REGISTER.md', 'PILOT_OPERATIONS_PLAYBOOK.md']) {
  chk('ارجاع «' + ref + '»', s4.includes(ref));
}
chk('هفتهٔ چهارم: پی‌آر متوسط', s4.includes('پی‌آر متوسط'));

grp('مسیرهای تخصصی');
const s5 = sectionOf(SECS[4]);
for (const t of ['**بک‌اند**', '**فرانت‌اند**', '**امنیت**', '**دواپس**', '**مدیریت محصول**']) chk('مسیر «' + t + '»', s5.includes(t));
chk('امنیت: چک‌لیست پنتست + ای‌اس‌وی‌اس', s5.includes('PEN_TEST_CHECKLIST.md') && s5.includes('WAVE13_ASVS_AUDIT.md'));

grp('چک‌لیست درک — شمار سؤال‌ها');
const s6 = sectionOf(SECS[5]);
const q = (block) => block.split('\n').filter((l) => /^\d+\. /.test(l)).length;
const b1 = s6.slice(s6.indexOf('### ۶.۱'), s6.indexOf('### ۶.۲'));
const b2 = s6.slice(s6.indexOf('### ۶.۲'), s6.indexOf('### ۶.۳'));
const b3 = s6.slice(s6.indexOf('### ۶.۳'));
chk('مسیر ۱ روزه: ۵ سؤال (' + fa(q(b1)) + ')', q(b1) === 5);
chk('مسیر ۱ هفته: ۱۵ سؤال (' + fa(q(b2)) + ')', q(b2) === 15);
chk('مسیر ۱ ماه: ۳۰ سؤال (' + fa(q(b3)) + ')', q(b3) === 30);

grp('مسیرهای اشتباه');
const s7 = sectionOf(SECS[6]);
chk('دست‌کم ۶ مورد', s7.split('\n').filter((l) => /^\d+\. /.test(l)).length >= 6);
chk('مثال خواندن بدون ترتیب', s7.includes('بدون ترتیب'));
chk('مثال کد زدن پیش از دود', s7.includes('پیش از دود'));

grp('منابع کمکی');
const s8 = sectionOf(SECS[7]);
for (const r of ['GLOSSARY.md', 'FAQ.md', 'TROUBLESHOOTING.md', 'DOCUMENTATION_HANDOVER.md', 'ruflo']) chk('منبع «' + r + '»', s8.includes(r));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['DOCS_INDEX.md', 'DOCUMENTATION_MAP.md', 'ONBOARDING_NEW_DEVELOPER.md', 'ONBOARDING_CHECKLIST.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
