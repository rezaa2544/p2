#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Wave 18 — تستِ سناریویِ فشار (Stress) در سوئیتِ بارِ ملی
   قراردادِ `tests/performance/suites/national-load-test.js` برای
   SCENARIO=stress + مستنداتِ نتیجهٔ اجرایِ واقعیِ Wave 18.

   پوشش:
     S1  سوئیتِ k6 معتبر است (import k6 + options)
     S2  سناریویِ stress_ramp: اجراگرِ ramping-arrival-rate + مراحلِ
         افزایشی تا نقطهٔ شکست (≥۳ مرحله) + سیم‌کشیِ STRESS_START/STRESS_MAX
     S3  آستانه‌هایِ پذیرش: http_req_failed · http_req_duration (p95/p99)
         · sync_duration · write_errors · checks
     S4  واقع‌گراییِ مسیرِ نوشتن: attendance (مجاز برای manager) +
         school_id/by از نشست + student_id/class_id از دادهٔ واقعی —
         نه idهای هاردکد و نه کالکشنِ غیرمجاز
     S5  استخرِ کاربرانِ واقعی: PAYESH_USERS (phone:nid,…) + حالتِ
         تک‌کاربرهٔ سازگار با گذشته
     S6  دستگیره‌هایِ اجرایِ sandbox: TIME_SCALE · MAX_VUS ·
         SUMMARY_FILE · SPIKE_BASE · SOAK_DURATION
     S7  بدونِ hostِ هاردکدِ غیر-localhost (فقط PAYESH_BASE_URL)
     S8  اعدادِ مدلِ ملی (NATIONAL) از دیتاستِ ۱۰ میلیونی مشتق شده‌اند
     S9  گزارشِ WAVE18_LOAD_TEST_REPORT.md وجود دارد و نتیجهٔ stress
         را با اعدادِ صادقانه (rps/p95/خطا/مرگ OOM) ثبت کرده است
     S10 یافتهٔ معماریِ حیاتی ثبت شده: سقفِ حافظهٔ هر درخواستِ هم‌زمان
         و مرگِ OOM در فشارِ پایدار + بازگشتِ سلامتِ داده (PG)

   اجرا: node tests/wave18-stress-test.js
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

/* ── S1: سوئیتِ k6 معتبر ─────────────────────────────────────────── */
chk('S1a سوئیتِ ملی وجود دارد', fs.existsSync(SUITE));
chk('S1b اسکریپتِ k6 معتبر (import k6 + export const options)',
  /from 'k6\/http'/.test(src) && /from 'k6'/.test(src) && /export const options/.test(src));
chk('S1c handleSummary خروجیِ JSON دارد (rps/p95/failed/writes)',
  /handleSummary/.test(src) && /failed_rate/.test(src) && /writes/.test(src));

/* ── S2: سناریویِ stress ─────────────────────────────────────────── */
chk('S2a کلیدواژهٔ stress در SCENARIO',
  /SCENARIO === 'all' \|\| SCENARIO === 'stress'/.test(src));
chk('S2b اجراگرِ ramping-arrival-rate برایِ افزایشِ تدریجیِ بار',
  /stress_ramp[\s\S]{0,200}executor: 'ramping-arrival-rate'/.test(src));
chk('S2c مراحلِ افزایشیِ تا نقطهٔ شکست (≥۳ stage)',
  (() => { const m = /stress_ramp:[\s\S]*?stages:\s*\[([\s\S]*?)\]/.exec(src);
            return !!(m && (m[1].match(/target:/g) || []).length >= 3); })(),
  'stages < 3');
chk('S2d STRESS_START و STRESS_MAX با __ENV سیم‌کشی شده‌اند',
  /__ENV\.STRESS_START/.test(src) && /__ENV\.STRESS_MAX/.test(src));
chk('S2e maxVUs از طریقِ MAX_VUS سقف‌پذیر است (محافظِ مولدِ کوچک)',
  /MAX_VUS/.test(src) && /capVUs/.test(src));

/* ── S3: آستانه‌ها ────────────────────────────────────────────────── */
chk('S3a http_req_failed rate<0.001', /http_req_failed: \['rate<0\.001'\]/.test(src));
chk('S3b http_req_duration p95<300 و p99<1000',
  /http_req_duration: \['p\(50\)<120', 'p\(95\)<300', 'p\(99\)<1000'\]/.test(src));
chk('S3c sync_duration p95<400', /sync_duration: \['p\(95\)<400'\]/.test(src));
chk('S3d write_errors rate<0.001', /write_errors: \['rate<0\.001'\]/.test(src));
chk('S3e checks rate>0.99', /'checks': \['rate>0\.99'\]/.test(src));

/* ── S4: واقع‌گراییِ نوشتن ───────────────────────────────────────── */
chk('S4a نوشتن روی attendance است (مجاز برای manager؛ نه teacher_notes)',
  /c: 'attendance'/.test(src) && !/c: 'teacher_notes'/.test(src));
chk('S4b school_id و by از نشستِ کاربر می‌آیند (نه هاردکد)',
  /school_id: u\.schoolId/.test(src) && /by: u\.userId/.test(src));
chk('S4c student_id/class_id از دادهٔ واقعیِ setup گرفته می‌شوند',
  /u\.students\[/.test(src) && /u\.classes\[/.test(src) && /\/api\/v1\/students\?limit=50/.test(src));
chk('S4d uid یکتا per-VU/per-iter تولید می‌شود (idempotency کلاینت)',
  /function uid\(\)/.test(src));

/* ── S5: استخرِ کاربران ──────────────────────────────────────────── */
chk('S5a PAYESH_USERS استخرِ چندکاربرهٔ phone:nid',
  /PAYESH_USERS/.test(src) && /phone:nid/i.test(src));
chk('S5b حالتِ تک‌کاربرهٔ PAYESH_PHONE/PAYESH_NID حفظ شده (سازگاری)',
  /__ENV\.PAYESH_PHONE/.test(src) && /__ENV\.PAYESH_NID/.test(src));
chk('S5c هر VU کاربرِ خودش را برمی‌دارد (الگویِ واقعیِ کاربران)',
  /users\[__VU % users\.length\]/.test(src));

/* ── S6: دستگیره‌هایِ sandbox ────────────────────────────────────── */
chk('S6a TIME_SCALE برای کوتاه‌سازیِ مدت‌ها', /TIME_SCALE/.test(src) && /function dur\(/.test(src));
chk('S6b SUMMARY_FILE برای خروجیِ JSON خلاصه', /SUMMARY_FILE/.test(src));
chk('S6c SOAK_DURATION و SPIKE_BASE هم پارامتریک‌اند',
  /SOAK_DURATION/.test(src) && /__ENV\.SPIKE_BASE/.test(src));

/* ── S7: بدونِ hostِ هاردکد ─────────────────────────────────────── */
{
  const hosts = src.match(/https?:\/\/[a-zA-Z0-9.\-]+/g) || [];
  const bad = hosts.filter(h => !/localhost|127\.0\.0\.1|waf\.local/.test(h));
  chk('S7 هیچ host غیر-localhostی هاردکد نشده', bad.length === 0, bad.join(','));
}

/* ── S8: مدلِ ملی ────────────────────────────────────────────────── */
chk('S8a NATIONAL: ۱۰ میلیون کاربر', /users: 10_000_000/.test(src));
chk('S8b NATIONAL: ۲٬۵۰۰ نوشتن/ثانیهٔ قله و ۲۰٬۰۰۰ rps قله',
  /peak_writes_per_sec: 2_500/.test(src) && /peak_api_rps: 20_000/.test(src));
chk('S8c ارجاع به دیتاستِ ملی (seed-national)', /seed-national|NATIONAL_MODEL/.test(src));

/* ── S9: گزارشِ اجرا ─────────────────────────────────────────────── */
chk('S9a docs/WAVE18_LOAD_TEST_REPORT.md وجود دارد', fs.existsSync(REPORT));
chk('S9b سناریوی stress در گزارش با اعدادِ واقعی (rps و p95)',
  /فشار|Stress/i.test(rep) && /rps/.test(rep) && /p95/.test(rep));
chk('S9c صداقتِ محدودیت‌ها ثبت شده (سندباکس/سقفِ مولد/سقفِ ظرفیت)',
  /سقف|اشباع|sandbox|سندباکس/.test(rep));
chk('S9d تعدادِ نوشتن‌های موفقِ stress در گزارش هست',
  /نوشتن|writes/i.test(rep));

/* ── S10: یافتهٔ حیاتی ──────────────────────────────────────────── */
chk('S10a مرگِ OOM در فشارِ پایدار ثبت شده (exit 137 / کرنل)',
  /OOM|exit 137|SIGKILL|حافظه/.test(rep));
chk('S10b سلامتِ داده پس از شکست تأیید شده (PG/کاهشِ نبودِ داده)',
  /PG|PostgreSQL/.test(rep) && /سلامت|یکپارچگی|داده.*سالم|بدون از دست رفتن/i.test(rep));
chk('S10c هزینهٔ حافظهٔ هر درخواستِ هم‌زمان کمّی شده (MB/درخواست)',
  /MB.{0,40}درخواست|درخواستِ هم‌زمان|per-request/i.test(rep));

console.log('────────────────────────────────────────────');
console.log('Wave 18 — Stress Test: ' + pass + '/' + (pass + fail) + ' موفق' + (fail ? ' — ' + fail + ' خطا ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
