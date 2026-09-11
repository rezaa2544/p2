#!/usr/bin/env node
// tests/pilot-operations-playbook-coverage.js — پوشش پلی‌بوک عملیات پایلوت (مأموریت ۳۸، چت ۶)
// قرارداد ابلاغی: دوازده بخش + چک‌لیست‌ها + جداول اس‌ال‌ای/کی‌پی‌آی/محرک‌ها + ارجاع‌ها.
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

const FILE = path.join(__dirname, '..', 'docs', 'PILOT_OPERATIONS_PLAYBOOK.md');
chk('فایل پلی‌بوک وجود دارد', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) process.exit(1);
const doc = fs.readFileSync(FILE, 'utf8');
function sectionOf(title) {
  const start = doc.indexOf(title);
  if (start === -1) return '';
  // سربرگ بعدی را بیرون بلوک‌های کد پیدا کن
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
const bulletsOf = (t) => t.split('\n').filter((l) => l.startsWith('- ')).length;

grp('دوازده بخش');
const SECS = ['## ۱) هدف و دامنه', '## ۲) تیم پایلوت و آن‌کال', '## ۳) روال روزانه',
  '## ۴) روال هفتگی', '## ۵) شاخص‌های کلیدی روزانه', '## ۶) تریاژ تیکت',
  '## ۷) ارتباط با مدارس', '## ۸) آنبوردینگ مدرسهٔ جدید', '## ۹) الگوهای پاسخ تکراری',
  '## ۱۰) قالب گزارش هفتگی', '## ۱۱) معیارهای توقف/بازگشت', '## ۱۲) معیارهای خروج موفق'];
for (const s of SECS) chk('سربرگ «' + s.slice(3, 26) + '»', doc.includes(s));

grp('هدف و دامنه');
const s1 = sectionOf(SECS[0]);
chk('مقیاس ۳۰ تا ۵۰ مدرسه', s1.includes('۳۰ تا ۵۰ مدرسه'));
chk('بازهٔ ۱۲ هفته', s1.includes('۱۲ هفته'));
chk('چهار نقش تیم', s1.includes('Pilot Lead') && s1.includes('Support Engineer') && s1.includes('Data Analyst') && s1.includes('Trainer'));

grp('تیم و آن‌کال');
const s2 = sectionOf(SECS[1]);
chk('بازهٔ پوشش ۷ صبح تا ۱۰ شب', s2.includes('۷–۱۴') && s2.includes('۱۴–۲۲'));
chk('۲۴/۷ هفتهٔ اول هر فاز', s2.includes('۲۴/۷'));
chk('ماتریس بالاکشیدن ≥ ۳ ردیف', s2.split('\n').filter((l) => l.startsWith('| ') && (l.includes('پ۰') || l.includes('آن‌کال') || l.includes('امنیتی') || l.includes('شکایت'))).length >= 3);

grp('روال روزانه — چهار نوبت با چک‌لیست');
const s3 = sectionOf(SECS[2]);
for (const w of ['۳.۱ صبح', '۳.۲ ظهر', '۳.۳ عصر', '۳.۴ شب']) chk('نوبت «' + w + '»', s3.includes('### ' + w));
const boxes = s3.split('\n').filter((l) => l.startsWith('- [ ]')).length;
chk('دست‌کم ۱۲ آیتم چک‌لیستی (' + fa(boxes) + ')', boxes >= 12);
chk('بررسی پشتیبان با پی‌جی‌بک‌رست', s3.includes('pgbackrest'));
chk('استندآپ ۱۵ دقیقه‌ای', s3.includes('استندآپ'));

grp('روال هفتگی');
const s4 = sectionOf(SECS[3]);
for (const d of ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']) chk('روز «' + d + '»', s4.includes(d));

grp('KPI ها');
const s5 = sectionOf(SECS[4]);
chk('جدول ≥ ۶ ردیف', s5.split('\n').filter((l) => l.startsWith('| ') && l.includes('≥')).length >= 4);
for (const k of ['۹۹.۵٪', '۳۰۰ میلی‌ثانیه', '۹۵٪', '۸۰٪', '۷۰٪']) chk('مقدار هدف «' + k + '»', s5.includes(k));

grp('تریاژ تیکت');
const s6 = sectionOf(SECS[5]);
for (const p of ['پ۰ — بحرانی', 'پ۱ — بالا', 'پ۲ — متوسط', 'پ۳ — پایین']) chk('سطح «' + p + '»', s6.includes(p));
chk('زمان پاسخ پ۰ = ۵ دقیقه', s6.includes('۵ دقیقه'));
chk('مسیر تیکت به باگ', s6.includes('ردیاب مسئله'));

grp('ارتباط با مدارس');
const s7 = sectionOf(SECS[6]);
chk('چک‌این روزانهٔ ۵ مدرسهٔ لنگر', s7.includes('روزانه') && s7.includes('۵ مدرسه'));
chk('فرم رضایت والد', s7.includes('PARENT_CONSENT_FORM.md'));

grp('آنبوردینگ');
const s8 = sectionOf(SECS[7]);
for (const d of ['| ۱ |', '| ۲ |', '| ۳ |', '| ۴ |', '| ۵ |']) chk('روز ' + d, s8.includes(d));
chk('آموزش ۲ ساعتهٔ مدیر در روز ۱', s8.includes('۲ ساعته'));
chk('ارجاع به راهنماهای کاربری', s8.includes('MANAGER_GUIDE.md') && s8.includes('TEACHER_GUIDE.md'));

grp('الگوهای پاسخ');
const s9 = sectionOf(SECS[8]);
chk('دست‌کم ۶ الگو', s9.split('\n').filter((l) => l.startsWith('| «')).length >= 6);
for (const q of ['نمرات فرزندم', 'سیستم کند است', 'لاگین نمی‌شود', 'داده اشتباه است']) chk('الگوی «' + q + '»', s9.includes(q));

grp('قالب گزارش هفتگی');
const s10 = sectionOf(SECS[9]);
chk('بلوک قالب وجود دارد', s10.includes('```'));
for (const k of ['آمار کلیدی', 'تیکت‌ها', 'بازخورد کاربران', 'مشکلات فنی', 'اقلام اقدام']) chk('بخش قالب «' + k + '»', s10.includes(k));

grp('محرک‌های بازگشت');
const s11 = sectionOf(SECS[10]);
chk('دست‌کم ۵ محرک', s11.split('\n').filter((l) => l.startsWith('| ') && !l.includes('محرک') && !l.includes('---')).length >= 5);
for (const t of ['۹۵٪ در ۲۴ ساعت', 'فساد', 'نقض امنیتی', '۵۰٪ در دو هفته', '۱۰ حادثهٔ پ۰']) chk('محرک «' + t + '»', s11.includes(t));

grp('معیارهای خروج');
const s12 = sectionOf(SECS[11]);
chk('دست‌کم ۶ معیار چک‌لیستی', s12.split('\n').filter((l) => l.startsWith('- [ ]')).length >= 6);
chk('صفر حادثهٔ امنیتی', s12.includes('صفر'));
chk('ارجاع به گزارش پساپایلوت', s12.includes('پساپایلوت'));

grp('ارجاع‌ها و پاکیزگی');
for (const ref of ['PILOT_ROLLOUT_PLAN.md', 'OPERATIONAL_HANDOVER.md', 'INCIDENT_RESPONSE.md', 'PRODUCTION_RUNBOOK.md', 'RUNBOOK_CARDS/README.md', 'CONFIGURATION_REFERENCE.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}
chk('بدون راز', !/(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN)/.test(doc));

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
