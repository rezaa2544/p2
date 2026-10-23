/* ═══════════════════════════════════════════════════════════════════
   tests/performance/suites/national-load-test.js  —  Wave 18
   آزمون بار ملی (National Load Test) با k6
   ───────────────────────────────────────────────────────────────────
   مرجع: docs/ROADMAP.md §21 · docs/WAVE18_LOAD_TESTING.md
   مدل دیتاست: tools/seed-national.js  (NATIONAL_MODEL)

   این اسکریپت «سندِ اجرایِ واقعیِ ظرفیتِ ملی» است. سوئیتِ
   `tests/wave18-load.js` همان سناریوها را در مقیاسِ کوچک و بدونِ k6 اجرا
   می‌کند تا شکلِ ادعاها در CI ثابت شود؛ عددِ ظرفیتِ ملی اما از این‌جا
   می‌آید و فقط روی زیرساختِ واقعی معنا دارد.

   اجرا (هر سناریو جدا یا با SCENARIO=all):
     k6 run -e SCENARIO=load    tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=stress  tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=spike   tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=soak    tests/performance/suites/national-load-test.js

   متغیرها:
     PAYESH_BASE_URL   آدرسِ سرورِ هدف (پیش‌فرض http://localhost:3000)
     PAYESH_PHONE / PAYESH_NID   کاربرِ آزمونِ تک‌نفره (حالتِ ساده)
     PAYESH_USERS      استخرِ کاربرانِ واقعی: «phone:nid,phone:nid,…»
                       (خروجیِ دیتاستِ ملی؛ هر VU یکی را برمی‌دارد —
                       الگویِ واقعیِ کاربران به‌جای نشستِ مشترکِ تک‌نفره)
     LOAD_VUS PEAK_VUS STRESS_START STRESS_MAX SPIKE_BASE SPIKE_VUS
     SOAK_DURATION     (پیش‌فرض 2h؛ اجرایِ sandbox: کوتاه‌تر)
     TIME_SCALE        ضریبِ کوتاه‌سازیِ همهٔ مدت‌ها (1 = کامل؛ 0.4 = فشرده)
     MAX_VUS           سقفِ سختِ VUها (محافظِ مولدِ بارِ کوچک؛ 0 = بی‌سقف)
     SUMMARY_FILE      مسیرِ فایلِ JSON خلاصه (اختیاری)
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/* ── اهدافِ مشتق‌شده از NATIONAL_MODEL (tools/seed-national.js) ──────────
   این اعداد حدس نیستند؛ از مدلِ ۱۰ میلیون کاربری محاسبه می‌شوند:
     attendance_per_day 6,000,000 ÷ 7,200 s  ≈   833 writes/s  (صبحِ مهر)
     peak_writes_per_sec = 833 × 3          = 2,500 writes/s
     peak_api_rps        = 2,500 × 8        = 20,000 rps
   اگر نسبت‌ها عوض شوند، این جدول باید از همان مدل بازمحاسبه شود. */
const NATIONAL = {
  users: 10_000_000,
  normal_api_rps: 500,
  peak_api_rps: 20_000,
  peak_writes_per_sec: 2_500
};

const BASE = __ENV.PAYESH_BASE_URL || 'http://localhost:3000';
const PHONE = __ENV.PAYESH_PHONE || '09999838444';
const NID = __ENV.PAYESH_NID || '';
const SCENARIO = (__ENV.SCENARIO || 'all').toLowerCase();

/* استخرِ کاربرانِ واقعی (Wave 18 — نوبتِ آماده‌سازی): phone:nid,phone:nid…
   اگر نبود، همان حالتِ تک‌کاربرِ قدیمی. */
const USERS_POOL = (__ENV.PAYESH_USERS || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const i = s.indexOf(':'); return i > 0
    ? { phone: s.slice(0, i), nid: s.slice(i + 1) }
    : { phone: s, nid: '' }; });

/* هر سناریو با نسبتی از بارِ ملی اجرا می‌شود؛ پیش‌فرض‌ها برای یک محیطِ
   staging کوچک‌اند و در اجرایِ واقعی باید بالا بروند. */
const LOAD_VUS = parseInt(__ENV.LOAD_VUS || '50', 10);
const PEAK_VUS = parseInt(__ENV.PEAK_VUS || '400', 10);
const STRESS_START = parseInt(__ENV.STRESS_START || '50', 10);
const STRESS_MAX = parseInt(__ENV.STRESS_MAX || '3000', 10);
const SPIKE_BASE = parseInt(__ENV.SPIKE_BASE || '50', 10);
const SPIKE_VUS = parseInt(__ENV.SPIKE_VUS || '1500', 10);
const SOAK_DURATION = __ENV.SOAK_DURATION || '2h';

/* مقیاسِ زمانی (sandbox) و سقفِ سختِ VU (محافظِ مولدِ کوچک) */
const TS = parseFloat(__ENV.TIME_SCALE || '1') > 0 ? parseFloat(__ENV.TIME_SCALE || '1') : 1;
const MAX_VUS_CAP = parseInt(__ENV.MAX_VUS || '0', 10);
function dur(spec) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(spec).trim());
  if (!m) return spec;
  const n = parseFloat(m[1]) * TS;
  if (m[2] === 'ms') return Math.max(1, Math.round(n)) + 'ms';
  if (m[2] === 's') return Math.max(1, Math.round(n)) + 's';
  if (m[2] === 'm') return (Math.round(n * 10) / 10) + 'm';
  return (Math.round(n * 100) / 100) + 'h';
}
function capVUs(n) { return MAX_VUS_CAP > 0 ? Math.min(n, MAX_VUS_CAP) : n; }

/* متریک‌های اختصاصیِ §21 */
const writeErrors = new Rate('write_errors');
const writesPerSec = new Counter('writes_total');
const syncLatency = new Trend('sync_duration', true);

export const options = {
  scenarios: Object.assign(
    {},
    SCENARIO === 'all' || SCENARIO === 'load' || SCENARIO === 'normal' ? {
      /* بارِ عادی — §21: «بار عادی» (۵۰۰ کاربرِ فعال در طرحِ Wave 18) */
      load_normal: {
        executor: 'constant-arrival-rate',
        rate: LOAD_VUS, timeUnit: '1s', duration: dur('5m'),
        preAllocatedVUs: Math.min(LOAD_VUS, capVUs(LOAD_VUS)), maxVUs: capVUs(LOAD_VUS * 4)
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'peak' ? {
      /* قله — §21: «peak» (پیکِ شروعِ سالِ تحصیلی — ۲۰۰۰ کاربرِ همزمان) */
      load_peak: {
        executor: 'constant-arrival-rate',
        rate: PEAK_VUS, timeUnit: '1s', duration: dur('5m'),
        startTime: SCENARIO === 'all' ? dur('6m') : '0s',
        preAllocatedVUs: Math.min(PEAK_VUS, capVUs(PEAK_VUS)), maxVUs: capVUs(PEAK_VUS * 2)
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'stress' ? {
      /* افزایش تا نقطهٔ شکست — §21: «افزایش بار تا نقطه failure» */
      stress_ramp: {
        executor: 'ramping-arrival-rate',
        startRate: STRESS_START, timeUnit: '1s',
        preAllocatedVUs: Math.min(STRESS_START * 4, capVUs(STRESS_START * 4)),
        maxVUs: capVUs(STRESS_MAX * 2),
        stages: [
          { target: STRESS_START * 4, duration: dur('5m') },
          { target: STRESS_START * 16, duration: dur('5m') },
          { target: STRESS_MAX, duration: dur('10m') },
          { target: STRESS_MAX, duration: dur('5m') }
        ]
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'spike' ? {
      /* افزایشِ ناگهانی — §21: «افزایشِ ناگهانی بار» (صبحِ اولِ مهر).
         SPIKE_BASE = سطحِ آرام (پیش‌فرض 50)؛ جهش تا SPIKE_VUS. */
      spike_mehr: {
        executor: 'ramping-arrival-rate',
        startRate: SPIKE_BASE, timeUnit: '1s',
        preAllocatedVUs: Math.min(200, capVUs(200)), maxVUs: capVUs(SPIKE_VUS * 2),
        stages: [
          { target: SPIKE_BASE, duration: dur('2m') },
          { target: SPIKE_VUS, duration: dur('30s') },   /* جهش */
          { target: SPIKE_VUS, duration: dur('10m') },   /* نگه‌داشتنِ قله */
          { target: SPIKE_BASE, duration: dur('2m') }    /* بازگشت */
        ]
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'soak' ? {
      /* اجرایِ مداوم برای کشفِ نشتی — §21 */
      soak_endurance: {
        executor: 'constant-arrival-rate',
        rate: LOAD_VUS, timeUnit: '1s', duration: SOAK_DURATION,
        preAllocatedVUs: Math.min(LOAD_VUS, capVUs(LOAD_VUS)), maxVUs: capVUs(LOAD_VUS * 3)
      }
    } : {}
  ),

  /* آستانه‌های پذیرش. این‌ها SLOهای docs/WAVE14_OBSERVABILITY.md هستند. */
  thresholds: {
    http_req_failed: ['rate<0.001'],            /* ۹۹.۹٪ موفق */
    http_req_duration: ['p(50)<120', 'p(95)<300', 'p(99)<1000'],
    sync_duration: ['p(95)<400'],
    write_errors: ['rate<0.001'],
    /* در soak: نشتیِ حافظه یا رشدِ صف نباید دیده شود */
    'checks': ['rate>0.99']
  }
};

/* ── نشست ─────────────────────────────────────────────────────────── */
function login(phone, nid) {
  const sent = http.post(BASE + '/api/auth/send-code', JSON.stringify({ phone }),
    { headers: { 'content-type': 'application/json' } });
  let code = null;
  try { code = sent.json('demo_code'); } catch (e) { code = null; }
  if (!code) { check(sent, { 'send-code ok': (r) => r.status === 200 }); return null; }
  const res = http.post(BASE + '/api/auth/login',
    JSON.stringify({ phone, code, national_id: nid || undefined }),
    { headers: { 'content-type': 'application/json' } });
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) return null;
  const setCookie = res.headers['Set-Cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  return raw.split(';').map((c) => c.trim()).filter((c) => c.indexOf('=') > 0).join('; ');
}

/* نشستِ کاملِ یک کاربر: کوکی + مدرسه/نقش + نمونهٔ دانش‌آموزان/کلاس‌های
   مدرسه‌اش (برای نوشتنِ حضورِ واقعی — نه idهای هاردکد). */
function buildUser(phone, nid) {
  const cookie = login(phone, nid);
  if (!cookie) return null;
  const H = { headers: { cookie } };
  const me = http.get(BASE + '/api/auth/me', H);
  let user = {};
  try { user = me.json('user') || {}; } catch (e) { user = {}; }
  let students = [], classes = [];
  try {
    const sl = http.get(BASE + '/api/v1/students?limit=50', H);
    students = (sl.json('data') || []).map((s) => s.id).filter((x) => x != null);
  } catch (e) { students = []; }
  try {
    const cl = http.get(BASE + '/api/v1/classes?limit=20', H);
    classes = (cl.json('data') || []).map((c) => c.id).filter((x) => x != null);
  } catch (e) { classes = []; }
  return { cookie, phone, userId: user.id || null, schoolId: user.school_id || null, students, classes };
}

let uidSeq = 0;
function uid() { return 'k6-' + (__VU) + '-' + (++uidSeq) + '-' + Date.now(); }

/* ── سناریوی خواندن (ترکیبِ نزدیک به workloadِ واقعی) ─────────────── */
function readMix(cookie) {
  const H = { headers: { cookie: cookie || '' } };
  const rs = [
    http.get(BASE + '/api/health'),
    http.get(BASE + '/api/public-report'),
    http.get(BASE + '/api/v1/students?limit=10', H),
    http.get(BASE + '/api/auth/me', H)
  ];
  check(rs[0], { 'health 200': (r) => r.status === 200 });
  check(rs[2], { 'list 200 or 401': (r) => r.status === 200 || r.status === 401 });
}

/* ── سناریوی نوشتن (sync) ───────────────────────────────────────────
   Wave 18 — نوبتِ آماده‌سازی: نوشتنِ «حضور» — همان‌که صبحِ مهر ۸۳۳ نویسه/
   ثانیهٔ مدلِ ملی است. idها از نشست (school/by) و از دیتاستِ واقعی
   (student/class) می‌آیند؛ هیچ id هاردکدی نیست. */
function writeOnce(u) {
  if (!u || !u.schoolId || !u.userId) return;
  const studentId = u.students.length ? u.students[Math.floor(Math.random() * u.students.length)] : null;
  const classId = u.classes.length ? u.classes[Math.floor(Math.random() * u.classes.length)] : null;
  if (studentId == null || classId == null) return;
  const body = JSON.stringify({
    ops: [{
      uid: uid(), t: 'ins', c: 'attendance',
      data: {
        school_id: u.schoolId, student_id: studentId, class_id: classId,
        date: new Date().toISOString().slice(0, 10),
        status: 'present', source: 'manual',
        taken_at: new Date().toISOString()
      },
      by: u.userId, at: new Date().toISOString()
    }]
  });
  const t0 = Date.now();
  const res = http.post(BASE + '/api/sync', body,
    { headers: { 'content-type': 'application/json', cookie: u.cookie || '' } });
  syncLatency.add(Date.now() - t0);
  writesPerSec.add(1);
  const good = res.status === 200;
  writeErrors.add(!good);
  check(res, { 'sync 200': () => good });
}

export function setup() {
  /* استخرِ واقعی یا تک‌کاربرِ env — هر VU یکی برمی‌دارد (الگویِ واقعی). */
  const pool = USERS_POOL.length ? USERS_POOL : [{ phone: PHONE, nid: NID }];
  const users = [];
  for (const p of pool) {
    const u = buildUser(p.phone, p.nid);
    if (u) users.push(u);
  }
  return { users, single: !USERS_POOL.length, model: NATIONAL };
}

export default function (data) {
  const users = (data && data.users) || [];
  if (!users.length) { return; }
  const u = users[__VU % users.length];
  group('read mix', () => readMix(u.cookie));
  /* نسبتِ ۸ خواندن به ۱ نوشتن، همان چیزی که مدلِ ملی فرض می‌کند */
  if (__ITER % 8 === 0) group('write', () => writeOnce(u));
  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  const summary = {
    scenario: SCENARIO,
    when: new Date().toISOString(),
    model: NATIONAL,
    timeScale: TS,
    metrics: (() => {
      const d = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
      /* k6: «med» همان p50 است؛ در خروجیِ خلاصه درصدهای تنظیم‌شده می‌آیند */
      return {
        rps: data.metrics.http_reqs && data.metrics.http_reqs.values.rate,
        requests: data.metrics.http_reqs && data.metrics.http_reqs.values.count,
        p50: d['p(50)'] != null ? d['p(50)'] : d.med,
        p95: d['p(95)'],
        p99: d['p(99)'],
      failed_rate: data.metrics.http_req_failed && data.metrics.http_req_failed.values.rate,
      checks_rate: data.metrics.checks && data.metrics.checks.values.rate,
      writes: data.metrics.writes_total && data.metrics.writes_total.values.count,
      write_errors_rate: data.metrics.write_errors && data.metrics.write_errors.values.rate,
      sync_p95: data.metrics.sync_duration && data.metrics.sync_duration.values['p(95)']
      };
    })()
  };
  const out = { stdout: JSON.stringify(summary, null, 2) + '\n' };
  if (__ENV.SUMMARY_FILE) out[__ENV.SUMMARY_FILE] = JSON.stringify(summary, null, 2);
  return out;
}
