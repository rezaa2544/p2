#!/usr/bin/env node
/**
 * tests/intelligence-client-render.test.js
 * قفل عیب D6 — مصرف‌کنندهٔ کلاینت برای لایهٔ هوشمندی
 *
 * انگیزه: پیش از این کلِ src/js هیچ فراخوانی به /api/v1/analytics/* نداشت.
 * این تست، ماژول ۷۸ را در یک sandbox شبیه‌سازی‌شدهٔ کلاینت اجرا می‌کند و
 * تأیید می‌کند که:
 *   ۱. داشبورد، شاخص سلامت واقعی را از پاسخ API رندر می‌کند.
 *   ۲. ابعادِ بدون داده، «بدون داده» نشان داده می‌شوند (نه صفر یا حدس).
 *   ۳. کیفیت دادهٔ PARTIAL به‌درستی توضیح داده می‌شود.
 *   ۴. مسیر route، رجیستری اکشن و رندرِ حالت خطا کار می‌کنند.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '78-intelligence.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); }
}

// شمای پاسخِ واقعیِ /api/v1/analytics/school-intelligence (دادهٔ ناقص)
function sampleSnapshot() {
  return {
    health_index: {
      score: 72.5, status: 'NEEDS_MONITORING',
      components: { academic: 70, attendance: 75, engagement: null, intervention: 80 },
      critical_risk_count: 1,
      data_quality: {
        status: 'PARTIAL', completeness: 0.75,
        present_dimensions: ['academic'],
        missing_dimensions: ['engagement']
      }
    },
    risk_summary: { total_risks_count: 3, critical_count: 1,
      top_risks: [{ title: 'افت تحصیلی پایه نهم', severity: 'critical' }] },
    academic_summary: { average_gpa: 14.2, failing_students_ratio: 12 },
    attendance_summary: { calendar_rate: 91, chronic_absence_rate: 8 },
    action_center: [{ title: 'برگزاری کارگاه تقویتی', priority: 'high' }]
  };
}

function makeCtx(apiSnapshot, apiError) {
  const calls = [];
  const ctx = {
    S: { user: { role: 'manager', school_id: 1 } },
    db: { schools: [{ id: 1 }] },
    setTimeout,
    esc: (s) => String(s == null ? '' : s).replace(/</g, '&lt;'),
    fa: (n) => String(n),
    empty: (e, t, d, btn) => `<div class="empty"><h4>${t}</h4>${btn || ''}</div>`,
    toJalali: () => [1404, 1, 1],
    todayISO: () => '2026-09-24',
    render: () => {},
    Api: {
      get: (p) => {
        calls.push(p);
        if (apiError) return Promise.reject(new Error(apiError));
        return Promise.resolve({ ok: true, snapshot: apiSnapshot });
      }
    },
    __calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

console.log('\n🧠 مصرف‌کنندهٔ کلاینتِ لایهٔ هوشمندی (D6 Client Consumer Gate)\n');

// ۱. مسیر route در shell ثبت شده
const shellSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '07-shell.js'), 'utf8');
check("route 'intelligence' در 07-shell.js ثبت شده",
  /case\s+'intelligence'\s*:\s*return\s+viewIntelligence\(\)/.test(shellSrc));

// ۲. ماژول در _order.json ثبت شده
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '_order.json'), 'utf8'));
check('ماژول ۷۸ در _order.json ثبت شده', order.indexOf('78-intelligence.js') > -1);

// ۳. آیتم منو برای نقش‌های مجاز
const routerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '05-router.js'), 'utf8');
check("آیتم منو برای manager وجود دارد",
  /manager:\[\['کار روزانه',\[\['dashboard','📊','داشبورد مدرسه'],\['intelligence','🧠','مرکز هوشمندی'/.test(routerSrc));
check("آیتم منو برای superadmin وجود دارد",
  /\['intelligence','🧠','مرکز هوشمندی'\]/.test(routerSrc));
check("آیتم منو برای edu_office وجود دارد",
  /edu_office:\[\['کار روزانه',\[\['officedash','📈','داشبورد آماری منطقه'],\['intelligence','🧠','مرکز هوشمندی'/.test(routerSrc));
check("عنوان TITLES برای intelligence وجود دارد", /intelligence:\['مرکز هوشمندی مدرسه'/.test(routerSrc));

// ۴. authz: مسیر برای نقش‌های مجاز باز است
const authzSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '30-authz.js'), 'utf8');
check('EXTRA_ROUTES، intelligence را برای manager مجاز می‌داند',
  /manager:\s*\[[^\]]*'intelligence'/.test(authzSrc));
check('canRoute برای سوپرادمین همیشه باز است',
  /if\(role === 'superadmin'\) return true;/.test(authzSrc));

// ۵. رجیستری اکشن
const actionsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '19-actions-core.js'), 'utf8');
check('INT_ACTIONS در dispatcher ثبت شده',
  /typeof INT_ACTIONS!=='undefined'&&INT_ACTIONS\[a\]/.test(actionsSrc));

// ۶. رندرِ حالتِ بارگذاری
const ctxLoad = makeCtx(sampleSnapshot(), null);
ctxLoad.INT_STATE = null;
const loadView = ctxLoad.viewIntelligence();
check('حالت بارگذاری نمایش می‌شود', /در حال محاسبه/.test(loadView));

// ۷. بارگذاری از مسیر درست API
check('intLoad مسیر /api/v1/analytics/school-intelligence را صدا می‌زند',
  ctxLoad.intSchoolId() === 1);
ctxLoad.intLoad();
setTimeout(() => {
  check('درخواست به مسیر analytics ارسال می‌شود',
    ctxLoad.__calls.some((p) => p.indexOf('/api/v1/analytics/school-intelligence') === 0));

  // ۸. رندرِ حالتِ سالم با دادهٔ ناقص
  const ctx = makeCtx(sampleSnapshot(), null);
  ctx.INT_STATE = { loading: false, error: null, __started: true, snapshot: sampleSnapshot() };
  const v = ctx.viewIntelligence();
  check('شاخص سلامت رندر می‌شود', v.includes('شاخص سلامت مدرسه'));
  check('وضعیت NEEDS_MONITORING به فارسی رندر می‌شود', v.includes('نیازمند پایش'));
  check('امتیاز واقعی رندر می‌شود', v.includes('72.5'));
  check('بُعد بدون داده، «بدون داده» نشان داده می‌شود', v.includes('بدون داده'));
  check('کیفیت دادهٔ PARTIAL توضیح داده می‌شود', v.includes('دادهٔ ناقص'));
  check('بُعد گمشده در توضیح کیفیت داده ذکر می‌شود', v.includes('مشارکت'));
  check('پرچم بحرانی رندر می‌شود', v.includes('پرچم‌های هوشمندی'));
  check('اقدام اولویت‌دار رندر می‌شود', v.includes('اقدامات اولویت‌دار'));
  check('میانگین نمرات رندر می‌شود', v.includes('14.2'));
  check('نرخ حضور رندر می‌شود', v.includes('91'));
  check('سلبِ پیش‌فرض‌های خوش‌بینانه بیان می‌شود', v.includes('خوش‌بینانه'));
  check('هیچ مقدارِ جادوییِ ۷۸.۵ یا ۹۰ در خروجی نیست',
    !v.includes('78.5') && !v.includes('90.0'));

  // ۹. حالت بدون داده
  const ctxNd = makeCtx(null, null);
  ctxNd.INT_STATE = { loading: false, error: null, __started: true,
    snapshot: { health_index: { score: null, status: 'NO_DATA', components: {}, data_quality: { status: 'NO_DATA', missing_dimensions: [] } },
      risk_summary: { top_risks: [] }, action_center: [] } };
  const vnd = ctxNd.viewIntelligence();
  check('حالت NO_DATA به‌درستی نمایش داده می‌شود', vnd.includes('شاخص سلامت') && vnd.includes('—'));
  check('لیستِ خالیِ پرچم‌ها و اقدامات بدون شکست رندر می‌شوند',
    vnd.includes('پرچم بحرانی') && vnd.includes('اقدام باز'));

  // ۱۰. حالت خطا
  const ctxErr = makeCtx(null, 'خطای سرور ۵۰۳');
  ctxErr.INT_STATE = { loading: false, error: 'خطای سرور ۵۰۳', __started: true, snapshot: null };
  const ve = ctxErr.viewIntelligence();
  check('حالت خطا پیام و دکمهٔ تلاشِ دوباره نشان می‌دهد',
    ve.includes('ناموفق') && ve.includes('تلاش دوباره'));
  check('اکشن intelligence-retry در رجیستری موجود است',
    Object.keys(ctxErr.INT_ACTIONS).indexOf('intelligence-retry') > -1);

  // ۱۱. محتوای index.html بازسازی شده
  const built = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('index.html بازسازی شده و شامل ماژول است',
    built.indexOf('مرکز هوشمندی مدرسه') > -1 && built.indexOf('viewIntelligence') > -1);

  console.log(`\nمصرف‌کنندهٔ کلاینت: ${pass} pass / ${fail} fail`);
  if (fail) {
    failures.forEach((f) => console.log(`  • ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exit(1);
  }
  console.log('✅ کلاینت اکنون لایهٔ هوشمندی را مصرف و نمایش می‌دهد.');
}, 30);
