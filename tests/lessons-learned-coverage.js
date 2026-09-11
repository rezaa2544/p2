#!/usr/bin/env node
// tests/lessons-learned-coverage.js — پوشش سند درس‌آموخته‌ها (مأموریت ۳۴، چت ۶)
// قرارداد: ده بخش الزامی + دست‌کم ۵ مورد در هر دسته؛ صداقت اعداد با منابع ریپو.
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

const FILE = path.join(__dirname, '..', 'docs', 'LESSONS_LEARNED.md');
chk('فایل سند وجود دارد', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) { console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`); process.exit(1); }
const doc = fs.readFileSync(FILE, 'utf8');

// جداکنندهٔ بخش‌ها
function sectionOf(i) {
  const start = doc.indexOf('## بخش ' + fa(i) + ':');
  const next = doc.indexOf('\n## بخش ', start + 1);
  return next === -1 ? doc.slice(start) : doc.slice(start, next);
}
const bulletsOf = (t) => t.split('\n').filter((l) => l.startsWith('- ')).length;
const numberedOf = (t) => t.split('\n').filter((l) => /^\d+\. /.test(l)).length;

grp('سربرگ و صداقت');
chk('عنوان اصلی', doc.startsWith('# درس‌آموخته‌ها و بازنگری پروژه'));
chk('وضعیت و مالک', doc.includes('**وضعیت:** فعال') && doc.includes('چت ۶ (مستندات و انتشار)'));
chk('قید صداقت ابلاغی در مقدمه', doc.includes('📋 ابلاغی'));

grp('بخش ۱ — خلاصهٔ مدیریتی');
const s1 = sectionOf(1);
chk('سربرگ بخش ۱', s1.length > 0 && s1.includes('Executive Summary'));
const goodIdx = s1.indexOf('### چه چیزی خوب کار کرد');
const badIdx = s1.indexOf('### چه چیزی بد کار کرد');
const diffIdx = s1.indexOf('### چه چیزی باید متفاوت می‌بود');
chk('سه زیربخش دارد', goodIdx !== -1 && badIdx !== -1 && diffIdx !== -1 && goodIdx < badIdx && badIdx < diffIdx);
chk('خوب کار کرد ≥ ۵ مورد', numberedOf(s1.slice(goodIdx, badIdx)) >= 5);
chk('بد کار کرد ≥ ۵ مورد', numberedOf(s1.slice(badIdx, diffIdx)) >= 5);
chk('باید متفاوت می‌بود ≥ ۵ مورد', numberedOf(s1.slice(diffIdx)) >= 5);

grp('بخش ۲ — درس‌های فنی');
const s2 = sectionOf(2);
chk('سربرگ بخش ۲', s2.length > 0 && s2.includes('Technical Lessons'));
const arch = s2.indexOf('### معماری'), test_ = s2.indexOf('### تست'), sec = s2.indexOf('### امنیت'), perf = s2.indexOf('### کارایی');
chk('چهار زیربخش فنی', arch !== -1 && test_ !== -1 && sec !== -1 && perf !== -1 && arch < test_ && test_ < sec && sec < perf);
chk('معماری ≥ ۵', bulletsOf(s2.slice(arch, test_)) >= 5);
chk('تست ≥ ۵', bulletsOf(s2.slice(test_, sec)) >= 5);
chk('امنیت ≥ ۵', bulletsOf(s2.slice(sec, perf)) >= 5);
chk('کارایی ≥ ۵', bulletsOf(s2.slice(perf)) >= 5);
chk('تصمیم‌های معماری نام برده شده', ['PostgreSQL', 'SoT', 'fail-closed', 'Outbox', 'Tombstone', 'OCC'].filter((k) => s2.includes(k)).length >= 5);

grp('بخش ۳ — درس‌های فرآیندی');
const s3 = sectionOf(3);
chk('سربرگ بخش ۳', s3.length > 0 && s3.includes('Process Lessons'));
const ma = s3.indexOf('### هماهنگی چندعاملی'), pr = s3.indexOf('### صف پول‌ریکوئست'), dk = s3.indexOf('### مستندات'), td = s3.indexOf('### تی‌دی‌دی');
chk('چهار زیربخش فرآیندی', ma !== -1 && pr !== -1 && dk !== -1 && td !== -1 && ma < pr && pr < dk && dk < td);
chk('هماهنگی چندعاملی ≥ ۵', bulletsOf(s3.slice(ma, pr)) >= 5);
chk('صف پول‌ریکوئست ≥ ۵', bulletsOf(s3.slice(pr, dk)) >= 5);
chk('مستندات ≥ ۵', bulletsOf(s3.slice(dk, td)) >= 5);
chk('تی‌دی‌دی ≥ ۵', bulletsOf(s3.slice(td)) >= 5);

grp('بخش ۴ — درس‌های محیطی');
const s4 = sectionOf(4);
chk('سربرگ بخش ۴', s4.length > 0 && s4.includes('Environmental Lessons'));
const envKeys = ['ریست سندباکس', 'او‌ام‌آی روفلو', 'باگ پنجشنبه', 'انقضای توکن', 'دی‌ان‌اس'];
const envIdx = envKeys.map((k) => s4.indexOf(k));
chk('پنج زیربخش محیطی به ترتیب', envIdx.every((i) => i !== -1) && envIdx.every((v, i) => i === 0 || v > envIdx[i - 1]));
for (let i = 0; i < envIdx.length; i++) {
  const body = i < 4 ? s4.slice(envIdx[i], envIdx[i + 1]) : s4.slice(envIdx[i]);
  chk(envKeys[i] + ' ≥ ۵', bulletsOf(body) >= 5);
}
chk('راه‌حل روفلو ذکر شده', s4.includes('CLAUDE_FLOW_DISABLE_BRIDGE=1') && s4.includes('بیرون'));
chk('الگوی بازیابی ریست ذکر شده', s4.includes('git add -A') && s4.includes('کامیت الحاقی'));

grp('بخش ۵ — چه چیز متفاوت');
const s5 = sectionOf(5);
chk('سربرگ بخش ۵', s5.length > 0 && s5.includes("What We'd Do Differently"));
chk('دست‌کم ۵ مورد', bulletsOf(s5) >= 5);
chk('اوپن‌کد ذکر شده', s5.includes('اوپن‌کد'));

grp('بخش ۶ — الگوهای بازمصرف');
const s6 = sectionOf(6);
chk('سربرگ بخش ۶', s6.length > 0 && s6.includes('Reusable Patterns'));
chk('شش الگو', bulletsOf(s6) >= 6);
for (const p of ['چندعاملی', 'باندل', 'قفل', 'تست-اول', 'هر-دو-سمت', 'ران‌بورد']) {
  chk('الگوی «' + p + '»', s6.includes(p));
}

grp('بخش ۷ — ضدالگوها');
const s7 = sectionOf(7);
chk('سربرگ بخش ۷', s7.length > 0 && s7.includes('Anti-Patterns'));
chk('پنج ضدالگو', bulletsOf(s7) >= 5);
for (const a of ['طولانی‌مدت', 'بدون تست', 'بدون راستی‌آزمایی', 'شکست واحد', 'سخت‌کد']) {
  chk('ضدالگوی «' + a + '»', s7.includes(a));
}

grp('بخش ۸ — سنجه‌های سفر');
const s8 = sectionOf(8);
chk('سربرگ بخش ۸', s8.length > 0 && s8.includes('Metrics of Journey'));
for (const m of ['۳۴', '۰ تا ۲۰', '۳۵۳', '۵۴۷', '۲۶۹', '۳۶', '۳۹', '۴۳٪', '۱۰۰۰+', '۵+', 'rc17', '۵']) {
  chk('سنجهٔ «' + m + '»', s8.includes(m));
}
chk('قید صداقت شمار کامیت‌ها', s8.includes('برآورد ابلاغی'));

grp('بخش ۹ — توصیه‌ها برای تیم بعدی');
const s9 = sectionOf(9);
chk('سربرگ بخش ۹', s9.length > 0 && s9.includes('Recommendations'));
chk('ده توصیهٔ شماره‌دار', numberedOf(s9) >= 10);
chk('ابزارهای روز اول', s9.includes('ابزارهای روز اول'));
chk('مستندات روز اول با ترتیب', s9.includes('مستندات روز اول') && s9.indexOf('SKILLS_MASTER.md') < s9.indexOf('HANDOFF.md', s9.indexOf('مستندات روز اول')));

grp('بخش ۱۰ — سخن پایانی');
const s10 = sectionOf(10);
chk('سربرگ بخش ۱۰', s10.length > 0 && s10.includes('Closing Note'));
chk('قدردانی از تیم', s10.includes('سپاسگزاریم'));
const sigs = ['چت ۱', 'چت ۲', 'چت ۳', 'چت ۴', 'چت ۵', 'چت ۶', 'چت ۷'];
chk('امضای هفت هم‌تیمی', sigs.every((s) => s10.includes(s)) && s10.includes('اوپن‌کد'));
chk('تاریخ پایان', s10.includes('۲۰۲۶-۰۹-۱۱') && s10.includes('rc17'));

grp('ارجاع‌های بین‌سندی');
for (const ref of ['SKILLS_MASTER.md', 'HANDOFF.md', 'DOCS_FREEZE_v1.0.0-rc16.md', 'RUNBOOK_CARDS', 'RISK_REGISTER.md', 'SECURITY_FINDINGS_REGISTER.md', 'P0_BLOCKER_TRACKER.md', 'TEST_COVERAGE_REPORT.md', 'DOCUMENTATION_MAP.md', 'POST_RESET_INTEGRITY_REPORT.md', 'DOCS_INDEX.md']) {
  chk('ارجاع به ' + ref, doc.includes(ref));
}

console.log(`\nنتیجه: ${fa(pass)} موفق / ${fa(fail)} ناموفق (از ${fa(pass + fail)})`);
if (failures.length) { console.log('موارد ناموفق:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
