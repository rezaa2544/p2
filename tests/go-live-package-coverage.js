#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   go-live-package-coverage.js — سنجه‌های بستهٔ رسمیِ انتشار:
     GL-SEC   هر هشت بخشِ الزامی
     GL-CHK   چک‌لیستِ پیش از انتشار (دست‌کم ۱۷ بند)
     GL-SEQ   ترتیبِ روزِ انتشار (تی−۷ تا تی+۲۴)
     GL-ROLL  برنامهٔ بازگشت: محرک/رویه/ارتباط/راستی‌آزمایی
     GL-VERI  راستی‌آزماییِ پنج‌گانهٔ پس از انتشار
     GL-MAT   ماتریسِ تصمیم با نتیجهٔ صریح
     GL-APP   ذی‌نفعان + جای امضا
     GL-REF   ارجاع‌های فایلِ زنده
   اجرا: node tests/go-live-package-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function grp(t) { console.log('\n▸ ' + t); }
const rd = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return null; } };

const doc = rd('docs/GO_LIVE_PACKAGE.md');
if (!doc) { console.log('❌ docs/GO_LIVE_PACKAGE.md نیست'); process.exit(1); }

grp('GL-SEC — بخش‌های هشت‌گانه');
[
  ['چک‌لیست پیش از انتشار', /چک‌لیست پیش از انتشار/],
  ['ترتیب روز انتشار', /ترتیب روز انتشار|Go-Live Sequence/],
  ['برنامهٔ بازگشت', /برنامهٔ بازگشت|Rollback Plan/],
  ['راستی‌آزمایی پس از انتشار', /راستی‌آزمایی پس از انتشار/],
  ['ماتریس تصمیم', /ماتریس تصمیم انتشار|Go ?\/ ?No-Go/],
  ['ذی‌نفعان و تأییدها', /ذی‌نفعان و تأییدها/],
  ['قالب‌های ارتباطی', /قالب‌های ارتباطی/],
  ['مانع‌های باز', /مانع‌های باز/]
].forEach(([label, re]) => chk('بخشِ «' + label + '» در سند هست', re.test(doc)));

grp('GL-CHK — چک‌لیست');
const boxes = (doc.match(/^- \[ \]/gm) || []).length;
chk('دست‌کم ۱۷ بندِ چک‌لیست', boxes >= 17, String(boxes));
['دود ۵۴۷', 'استیجینگ', 'پنتست', 'دریل', 'آزمون بار', 'آشوب', 'آن‌کال', 'بازگشت', 'حقوقی', 'اقامت داده'].forEach((k) =>
  chk('بندِ «' + k + '» در چک‌لیست هست', doc.includes(k)));

grp('GL-SEQ — ترتیب روز انتشار');
['تی−۷ روز', 'تی−۳ روز', 'تی−۱ روز', 'تی−۰', 'تی+۱ ساعت', 'تی+۲۴ ساعت'].forEach((t) =>
  chk('نقطهٔ زمانیِ «' + t + '» تعریف شده', doc.includes(t)));
chk('روش برش: آبی/سبز یا کاناری', /آبی\/سبز|کاناری/.test(doc));

grp('GL-ROLL — برنامهٔ بازگشت');
chk('محرک‌های کمّی (نرخ خطا/تأخیر/فساد داده)', /محرک/.test(doc) && /فساد|از‌دست‌رفتن داده/.test(doc));
chk('رویه با ارجاع به راهنمای استقرار/ران‌بوک', /راهنمای استقرار|ران‌بوک/.test(doc));
chk('ارتباطاتِ بازگشت مشخص است', /اعلام می‌کند|صفحهٔ وضعیت/.test(doc));
chk('راستی‌آزمایی پس از بازگشت دارد', /پس از بازگشت/.test(doc));

grp('GL-VERI — راستی‌آزمایی پس از انتشار');
chk('سلامتِ پروب‌ها', /پروب/.test(doc) || /سلامت/.test(doc));
chk('خط پایهٔ متریک‌ها', /خط پایه/.test(doc));
chk('پنج سفر کاربری انتها-به-انتها', /پنج سفر/.test(doc));
chk('آزمون همگام‌سازی دوطرفه', /کلاینت ← سرور ← کلاینت/.test(doc));
chk('آزمون آلارم با تزریق خطا', /تزریق خطا/.test(doc));

grp('GL-MAT — ماتریس تصمیم');
chk('ستون‌های معیار/حداقل/وضعیت/تصمیم', /معیار/.test(doc) && /حداقل قابل قبول/.test(doc) && /وضعیت فعلی/.test(doc) && /تصمیم/.test(doc));
chk('هم «گو» و هم «نو-گو» در ماتریس هست', /گو/.test(doc) && /نو-گو/.test(doc));
chk('نتیجهٔ صریح فعلی با دلیل', /نتیجهٔ فعلی/.test(doc));
chk('به‌روزرسانی ماتریس در جلسهٔ تصمیم الزامی شده', /دوباره پر می‌شود|جلسهٔ تصمیم/.test(doc));

grp('GL-APP — ذی‌نفعان');
['مسئول فنی', 'مسئول امنیت', 'مسئول بهره‌برداری', 'مالک کسب‌وکار'].forEach((r) =>
  chk('نقشِ «' + r + '» تعریف شده', doc.includes(r)));
chk('جای امضا/تاریخ خالی برای هر نقش', (doc.match(/____/g) || []).length >= 4);
chk('قاعدهٔ چهار امضا', /چهار امضا/.test(doc));

grp('GL-COM — قالب‌های ارتباطی');
['داخلی', 'صفحهٔ وضعیت', 'مراجع', 'پست‌مورتم'].forEach((c) =>
  chk('قالبِ «' + c + '» وجود دارد', doc.includes(c)));

grp('GL-BLK — مانع‌ها و ارجاع‌ها');
chk('جدول مانع‌ها با مسئول/مهلت/کاهش ریسک', /مسئول/.test(doc) && /مهلت/.test(doc) && /کاهش ریسک/.test(doc));
const blockerRows = (doc.match(/^\|\s*[۱-۹]\s*\|/gm) || []).length;
chk('شش مانعِ پ0 در جدول', blockerRows >= 6, String(blockerRows));
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
chk('سند به فایل‌های ریپو ارجاع می‌دهد', refs.length >= 4, String(refs.length));
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایلِ موجود می‌رسند', dead.length === 0, dead.join(','));
chk('ارجاع به چک‌لیست آمادگی به‌عنوان منبع مانع‌ها', /PRODUCTION_READINESS_CHECKLIST\.md/.test(doc));

console.log('\n' + '─'.repeat(52));
console.log(`نتیجه بستهٔ انتشار: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
process.exit(fail ? 1 : 0);
