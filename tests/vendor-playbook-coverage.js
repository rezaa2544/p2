#!/usr/bin/env node
// tests/vendor-playbook-coverage.js — پوشش پلی‌بوک ارزیابی و آنبوردینگ وندور (مأموریت ۳۹، چت ۶)
// قرارداد ابلاغی: ده بخش + شش دستهٔ وندور + چک‌لیست آنبوردینگ + ماتریس امتیازدهی.
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

const FILE = path.join(__dirname, '..', 'docs', 'VENDOR_PLAYBOOK.md');
chk('فایل پلی‌بوک وندور وجود دارد', fs.existsSync(FILE));
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

grp('ده بخش');
const SECS = ['## ۱) مقدمه', '## ۲) شش دستهٔ وندور موردنیاز', '## ۳) معیارهای ارزیابی',
  '## ۴) قالب آر‌اف‌پی', '## ۵) چک‌لیست آنبوردینگ وندور', '## ۶) الگوهای یکپارچگی فنی',
  '## ۷) پایش اس‌ال‌ای وندور', '## ۸) آف‌بوردینگ وندور', '## ۹) ردیاب ریسک وندورها',
  '## ۱۰) لاگ تصمیم‌ها'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 24) + '»', doc.includes(s));

grp('مقدمه — دامنه و اصول');
const s1 = sectionOf(SECS[0]);
chk('سه اصل: اس‌ال‌ای/امنیت/خروج‌پذیری', s1.includes('اس‌ال‌ای مستند') && s1.includes('امنیت') && s1.includes('خروج‌پذیری'));
chk('ارجاع به ردیاب پی۰', s1.includes('P0_BLOCKER_TRACKER.md'));

grp('شش دستهٔ وندور');
const s2 = sectionOf(SECS[1]);
for (const c of ['هاست و زیرساخت', 'درگاه پیامک', 'استعلام کد ملی', 'پنتست خارجی', 'سی‌دی‌ان', 'پشتیبان']) {
  chk('دستهٔ «' + c + '»', s2.includes(c));
}
for (const v of ['آروان', 'پارس‌پک', 'ایران‌سرور', 'افرانت', 'کاوه‌نگار', 'ملی‌پیامک', 'فراز اس‌ام‌اس', 'ثبت احوال']) {
  chk('نامزد «' + v + '»', s2.includes(v));
}
chk('شش ردیف جدول دسته‌ها', s2.split('\n').filter((l) => /^\| [۱-۶] \|/.test(l)).length === 6);
chk('ارجاع به تصمیم‌های دی', s2.includes('دی-۲') && s2.includes('دی-۳') && s2.includes('دی-۴'));

grp('ماتریس امتیازدهی');
const s3 = sectionOf(SECS[2]);
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const weights = [...s3.matchAll(/\| ([۰-۹]+)٪ \|/g)].map((m) => parseInt(toEn(m[1]), 10));
chk('هشت معیار', s3.split('\n').filter((l) => l.startsWith('| ') && l.includes('٪ |')).length >= 8);
chk('جمع وزن‌ها = ۱۰۰ (' + fa(weights.reduce((a, b) => a + b, 0)) + ')', weights.reduce((a, b) => a + b, 0) === 100);
for (const w of ['۲۵٪', '۲۰٪', '۱۵٪', '۱۰٪', '۵٪']) chk('وزن «' + w + '»', s3.includes('| ' + w + ' |'));

grp('آر‌اف‌پی');
const s4 = sectionOf(SECS[3]);
chk('هشت بند اطلاعاتی', s4.split('\n').filter((l) => /^\d+\. /.test(l)).length >= 8);
chk('معیارهای پذیرش آر‌اف‌پی', s4.includes('معیارهای پذیرش'));

grp('چک‌لیست آنبوردینگ');
const s5 = sectionOf(SECS[4]);
const boxes = s5.split('\n').filter((l) => l.startsWith('- [ ]')).length;
chk('دست‌کم ۹ آیتم (' + fa(boxes) + ')', boxes >= 9);
chk('راز در گیت/کد ممنوع', s5.includes('secret-scan.js') || s5.includes('ریپو'));
chk('ارجاع به مدیریت رازها', s5.includes('SECRETS_MANAGEMENT.md'));

grp('الگوهای یکپارچگی');
const s6 = sectionOf(SECS[5]);
chk('پیامک: فیلاور دو وندور + مدار قطع‌کننده', s6.includes('فیلاور') && s6.includes('مدار قطع‌کننده'));
chk('استعلام: هش‌شده + کش + ممیزی', s6.includes('هش‌شده') && s6.includes('کش') && s6.includes('ممیزی'));
chk('میزبان: اقامت داده', s6.includes('اقامت داده'));
chk('پشتیبان: رمزنگاری در سکون', s6.includes('رمزنگاری'));
chk('ارجاع به ریسک‌های ئی', s6.includes('RISK-E-001') && s6.includes('RISK-E-002'));

grp('پایش اس‌ال‌ای');
const s7 = sectionOf(SECS[6]);
chk('چهار گام پایش', s7.split('\n').filter((l) => l.startsWith('| ') && !l.includes('گام') && !l.includes('---')).length >= 4);
chk('ارجاع به پلی‌بوک پایلوت', s7.includes('PILOT_OPERATIONS_PLAYBOOK.md'));

grp('آف‌بوردینگ');
const s8 = sectionOf(SECS[7]);
chk('شش گام شماره‌دار', s8.split('\n').filter((l) => /^\d+\. /.test(l)).length >= 6);
chk('نگه‌داری ۳۰ روزه', s8.includes('۳۰ روز'));
chk('ابطال راز سمت وندور', s8.includes('ابطال'));

grp('ردیاب ریسک وندورها');
const s9 = sectionOf(SECS[8]);
for (const r of ['RISK-E-001', 'RISK-E-002', 'RISK-E-003', 'RISK-E-004']) chk('ریسک «' + r + '»', s9.includes(r));

grp('لاگ تصمیم‌ها');
const s10 = sectionOf(SECS[9]);
chk('چهار ردیف تصمیم باز', s10.split('\n').filter((l) => l.includes('⏳ باز')).length >= 4);
chk('ستون‌های جدول', s10.includes('| تاریخ |') && s10.includes('تصمیم‌گیر'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['IRAN_COMPLIANCE_PACKAGE.md', 'P0_BLOCKER_TRACKER.md', 'SECRETS_MANAGEMENT.md', 'DISASTER_RECOVERY.md', 'RISK_REGISTER.md', 'EXECUTIVE_BRIEFING.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
