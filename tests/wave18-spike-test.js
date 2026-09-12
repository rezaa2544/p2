#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 18 — تستِ سناریویِ جهش (Spike) در سوئیتِ بارِ ملی
   قراردادِ `tests/performance/suites/national-load-test.js` برای
   SCENARIO=spike (الگویِ صبحِ اولِ مهر: سطحِ آرام → جهش → نگه‌داشتنِ
   قله → بازگشت) + مستنداتِ نتیجهٔ اجرایِ واقعیِ Wave 18.

   پوشش:
     P1  سناریویِ spike_mehr: چهار فازِ آرام/جهش/نگه‌داشتن/بازگشت
     P2  SPIKE_BASE پارامتریک است (پیش‌فرضِ محافظه‌کارانه؛ نه هاردکد)
     P3  SPIKE_VUS سطحِ جهش را تعیین می‌کند (۵۰۰→۳۰۰۰ در طرح)
     P4  آستانه‌هایِ پذیرش همان قراردادِ ملی است
     P5  بازگشتِ پایداری پس از جهش در گزارش ثبت شده (recovery)
     P6  اعدادِ اجرایِ واقعیِ spike در گزارش هست (rps/p95/خطا)
     P7  محیطِ اجرا و محدودیت‌هایِ مولد صادقانه ثبت شده‌اند
     P8  سوئیتِ k6 و گزارش هم‌زمانِ همهٔ سناریوها معتبرند

   اجرا: node tests/wave18-spike-test.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'tests', 'performance', 'suites', 'national-load-test.js');
const REPORT = path.join(ROOT, 'docs', 'WAVE18_LOAD_TEST_REPORT.md');

let pass = 0, fail = 0;
function chk(name, cond, detail){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

const src = fs.existsSync(SUITE) ? fs.readFileSync(SUITE, 'utf8') : '';
const rep = fs.existsSync(REPORT) ? fs.readFileSync(REPORT, 'utf8') : '';

/* ── P1: چهار فازِ spike ─────────────────────────────────────────── */
chk('P1a کلیدواژهٔ spike در SCENARIO',
  /SCENARIO === 'all' \|\| SCENARIO === 'spike'/.test(src));
chk('P1b سناریویِ spike_mehr (صبحِ مهر) تعریف شده',
  /spike_mehr/.test(src));
chk('P1c اجراگرِ ramping-arrival-rate',
  /spike_mehr[\s\S]{0,200}executor: 'ramping-arrival-rate'/.test(src));
{
  const m = /spike_mehr:[\s\S]*?stages:\s*\[([\s\S]*?)\]/.exec(src);
  const stages = m ? (m[1].match(/target:/g) || []).length : 0;
  chk('P1d چهار فاز: آرام → جهش → نگه‌داشتن → بازگشت', stages === 4, 'stages=' + stages);
  chk('P1e فازِ بازگشت به سطحِ آرام (پایانِ جهش، نه قطعِ ناگهانی)',
    m ? /SPIKE_BASE, duration: dur\('2m'\)/.test(m[1]) : false);
  chk('P1f فازِ جهشِ کوتاه (۳۰ثانیهٔ واقعی)', m ? /dur\('30s'\)/.test(m[1]) : false);
}

/* ── P2: پارامترها ───────────────────────────────────────────────── */
chk('P2a SPIKE_BASE از __ENV (پیش‌فرضِ ۵۰؛ قابلِ بالا بردن به ۵۰۰)',
  /__ENV\.SPIKE_BASE \|\| '50'/.test(src));
chk('P2b SPIKE_VUS از __ENV (سطحِ جهش)',
  /__ENV\.SPIKE_VUS/.test(src));
chk('P2c MAX_VUS سقفِ هم‌زمانیِ مولد را محافظت می‌کند',
  /MAX_VUS/.test(src));

/* ── P3: آستانه‌ها ────────────────────────────────────────────────── */
chk('P3a آستانه‌هایِ SLO ملی (failed<0.001 · p95<300 · p99<1000)',
  /http_req_failed: \['rate<0\.001'\]/.test(src) &&
  /http_req_duration: \['p\(50\)<120', 'p\(95\)<300', 'p\(99\)<1000'\]/.test(src));
chk('P3b آستانهٔ نوشتن (sync p95<400 · write_errors<0.001)',
  /sync_duration: \['p\(95\)<400'\]/.test(src) && /write_errors: \['rate<0\.001'\]/.test(src));

/* ── P4: گزارش ───────────────────────────────────────────────────── */
chk('P4a docs/WAVE18_LOAD_TEST_REPORT.md وجود دارد', fs.existsSync(REPORT));
chk('P4b سناریویِ جهش در گزارش با اعداد (۵۰۰→۳۰۰۰)',
  /جهش|Spike|اسپایک/i.test(rep) && /3000|۳۰۰۰/.test(rep));
chk('P4c rps و p95 اجرایِ spike ثبت شده',
  /rps/.test(rep) && /p95/.test(rep));
chk('P4d بازگشتِ سلامتِ سرور پس از جهش (recovery) ثبت شده',
  /بازگشت|recovery|بهبود/i.test(rep));
chk('P4e خطاهای HTTP کمّی شده‌اند (صفر یا درصد)',
  /خطا|failed/i.test(rep));

/* ── P5: محدودیت‌هایِ صادقانه ───────────────────────────────────── */
chk('P5a مولد و سرور روی یک جعبه بودند (تفسیرِ اعداد)',
  /یک جعبه|همان جعبه|shared|تک‌نمونه|تک-نمونه|2GB|۲ گیگ/i.test(rep));
chk('P5b سقفِ ظرفیتِ مشاهده‌شده کمّی شده (knee/سقف rps)',
  /سقف|knee|اشباع/i.test(rep) && /rps/.test(rep));
chk('P5c پنج سناریوی طرح (بار/اوج/فشار/جهش/چند-روزه) در گزارش‌اند',
  /بار عادی|Load/i.test(rep) && /اوج|پیک|Peak/i.test(rep) && /فشار|Stress/i.test(rep)
    && /جهش|Spike/i.test(rep) && /چند روزه|Soak|سوک/i.test(rep));

/* ── P6: سازگاریِ کل ─────────────────────────────────────────────── */
chk('P6a سوئیتِ k6 معتبر', /from 'k6\/http'/.test(src) && /export const options/.test(src));
chk('P6b استخرِ کاربرانِ واقعی در سوئیت', /PAYESH_USERS/.test(src));
chk('P6c NATIONAL در سوئیت (۱۰M کاربر)', /NATIONAL/.test(src) && /10_000_000/.test(src));

console.log('────────────────────────────────────────────');
console.log('Wave 18 — Spike Test: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
