#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   onboarding-coverage.js — سنجه‌های راهنمای تازه‌وارد:
     OB-SEC  هفت بخش
     OB-SET  نصب و راه‌اندازی با نسخه‌ها و گیت‌ها
     OB-TOUR تور کدبیس با اجزای واقعی
     OB-EX   مثال‌های واقعی برای کارهای رایج
     OB-REF  ارجاع‌های زنده
   اجرا: node tests/onboarding-coverage.js
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

const doc = rd('docs/ONBOARDING_NEW_DEVELOPER.md');
if (!doc) { console.log('❌ docs/ONBOARDING_NEW_DEVELOPER.md نیست'); process.exit(1); }

grp('OB-SEC — بخش‌های هفت‌گانه');
[
  ['خوش آمدید/معرفی', /پروژه چیست|خوش آمدید/],
  ['آماده‌سازی محیط', /آماده‌سازی محیط/],
  ['تور کدبیس', /تور کدبیس/],
  ['گردش کار توسعه', /گردش کار توسعه/],
  ['کارهای رایج', /کارهای رایج/],
  ['عیب‌یابی اولیه', /عیب‌یابی/],
  ['کمک گرفتن', /کمک بگیریم/]
].forEach(([label, re]) => chk('بخشِ «' + label + '»', re.test(doc)));

grp('OB-SET — نصب و راه‌اندازی');
chk('نسخهٔ نود ۲۲+', /22/.test(doc) && /Node/.test(doc));
chk('نصب پستگرس و ردیس', /PostgreSQL/.test(doc) && /Redis/.test(doc));
chk('کلون و نصب', /git clone/.test(doc) && /npm install/.test(doc));
chk('سید و اجرای اول', /server\/seed\.js/.test(doc) && /npm start/.test(doc));
chk('دود برای تأیید محیط', /tests\/smoke\.js/.test(doc) && /547/.test(doc));
chk('هشدار کلوبوم خالی (رفتار شناخته‌شده)', /بی‌صدا/.test(doc) || /خروجی ۰/.test(doc));

grp('OB-TOUR — تور کدبیس واقعی');
chk('روت‌های واقعی سرور', /routes\/\{?attendance/.test(doc) || /server\/routes/.test(doc));
chk('میان‌افزار ایزولاسیون', /middleware\/scope\.js|scope\.js/.test(doc));
chk('اوت‌باکس و ورکر', /outbox\.js/.test(doc) && /worker/.test(doc));
chk('ماژول‌های کلاینت + ترتیب الحاق', /src\/js/.test(doc) && /_order\.json/.test(doc));
chk('ممنوعیت ویرایش دستی ایندکس', /هرگز.*دستی|دستی ویرایش نکنید/.test(doc));
chk('سه سطح تست', /یکپارچگی/.test(doc) && /دودی|سراسری/.test(doc) && /tests\/api/.test(doc));
chk('ارجاع به نمایهٔ مرکزی', /DOCS_INDEX\.md/.test(doc));

grp('OB-EX — مثال‌های واقعی');
chk('مثال مسیر: الگوی شش مسیر موجود', /شش مسیر|createStudentRoutes|createXRoutes/.test(doc));
chk('مثال ویو: فایل شماره‌دار + ان‌ای‌وی', /09-schools\.js|NAV/.test(doc));
chk('مثال مهاجرت: ۰۰۴ + راهنمای مهاجرت', /004/.test(doc) && /MIGRATION_GUIDE\.md/.test(doc));
chk('مثال تست: ساختار چک/شمار', /occ\.js|chk/.test(doc));
chk('بازتولید مجوزها نه مرج دستی', /بازتولید/.test(doc) && /check-authz/.test(doc));

grp('OB-HELP — کمک و ارجاع‌ها');
chk('هندآف برای تاریخچه', /HANDOFF\.md/.test(doc));
chk('روفلو با قید اجرای بیرون ریپو', /روفلو/.test(doc) && /بیرون/.test(doc));
chk('ارجاع به عیب‌یابی کامل', /TROUBLESHOOTING\.md/.test(doc));
chk('بریف ناظر برای قواعد', /SUPERVISOR_BRIEF\.md/.test(doc));
const refs = [...new Set((doc.match(/(?:docs|server|infra|tests|tools|src|migrations|\.claude)\/[A-Za-z0-9_./-]+\.(?:json|md|js|yml|sh|sql)/g) || []))];
const dead = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
chk('همهٔ ارجاع‌ها به فایل موجود می‌رسند', dead.length === 0, dead.join(','));

console.log('\n──────────────────────────────────────────');
console.log('نتیجه: ' + pass + ' موفق / ' + fail + ' ناموفق (از ' + (pass + fail) + ')');
if (fail > 0) { console.log('موارد ناموفق:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✅ راهنمای تازه‌وارد کامل است.');
