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

   اجرا:
     k6 run -e SCENARIO=load    tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=stress  tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=spike   tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=soak    tests/performance/suites/national-load-test.js
     k6 run -e SCENARIO=all     tests/performance/suites/national-load-test.js

   متغیرها:
     PAYESH_BASE_URL   آدرسِ سرورِ هدف
     PAYESH_PHONE / PAYESH_NID   کاربرِ آزمون
     LOAD_VUS PEAK_VUS STRESS_START STRESS_MAX SPIKE_VUS SOAK_DURATION
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
/* کاربرِ آزمون باید «teacher» باشد و یک دانش‌آموزِ ثبت‌نام‌شده در کلاسِ خودش
   داشته باشد؛ وگرنه authz درستاً رد می‌کند (role_denied / out_of_scope) و
   سنجهٔ نوشتن بی‌معنا می‌شود. PAYESH_STUDENT_ID از دادهٔ واقعیِ دیتاست می‌آید. */
const STUDENT_ID = parseInt(__ENV.PAYESH_STUDENT_ID || '0', 10);
const SCENARIO = (__ENV.SCENARIO || 'all').toLowerCase();

/* هر سناریو با نسبتی از بارِ ملی اجرا می‌شود؛ پیش‌فرض‌ها برای یک محیطِ
   staging کوچک‌اند و در اجرایِ واقعی باید بالا بروند. */
const LOAD_VUS = parseInt(__ENV.LOAD_VUS || '50', 10);
const PEAK_VUS = parseInt(__ENV.PEAK_VUS || '400', 10);
const STRESS_START = parseInt(__ENV.STRESS_START || '50', 10);
const STRESS_MAX = parseInt(__ENV.STRESS_MAX || '3000', 10);
const SPIKE_VUS = parseInt(__ENV.SPIKE_VUS || '1500', 10);
const SOAK_DURATION = __ENV.SOAK_DURATION || '2h';

/* متریک‌های اختصاصیِ §21 */
const writeErrors = new Rate('write_errors');
const writesPerSec = new Counter('writes_total');
const syncLatency = new Trend('sync_duration', true);

export const options = {
  scenarios: Object.assign(
    {},
    SCENARIO === 'all' || SCENARIO === 'load' ? {
      /* بارِ عادی، سپس قله — §21: «بار عادی و peak» */
      load_normal: {
        executor: 'constant-arrival-rate',
        rate: LOAD_VUS, timeUnit: '1s', duration: '5m',
        preAllocatedVUs: LOAD_VUS, maxVUs: LOAD_VUS * 4
      },
      load_peak: {
        executor: 'constant-arrival-rate',
        rate: PEAK_VUS, timeUnit: '1s', duration: '5m', startTime: '6m',
        preAllocatedVUs: PEAK_VUS, maxVUs: PEAK_VUS * 2
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'stress' ? {
      /* افزایش تا نقطهٔ شکست — §21: «افزایش بار تا نقطه failure» */
      stress_ramp: {
        executor: 'ramping-arrival-rate',
        startRate: STRESS_START, timeUnit: '1s',
        preAllocatedVUs: STRESS_START, maxVUs: STRESS_MAX * 2,
        stages: [
          { target: STRESS_START * 4, duration: DUR_STAGE },
          { target: STRESS_START * 16, duration: DUR_STAGE },
          { target: STRESS_MAX, duration: DUR_STRS },
          { target: STRESS_MAX, duration: DUR_STAGE }
        ]
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'spike' ? {
      /* افزایشِ ناگهانی — §21: «افزایش ناگهانی بار» (صبحِ اولِ مهر) */
      spike_mehr: {
        executor: 'ramping-arrival-rate',
        startRate: 50, timeUnit: '1s',
        preAllocatedVUs: 200, maxVUs: SPIKE_VUS * 2,
        stages: [
          { target: 50, duration: '2m' },
          { target: SPIKE_VUS, duration: '30s' },   /* جهش */
          { target: SPIKE_VUS, duration: '10m' },   /* نگه‌داشتنِ قله */
          { target: 50, duration: '2m' }            /* بازگشت */
        ]
      }
    } : {},
    SCENARIO === 'all' || SCENARIO === 'soak' ? {
      /* اجرایِ مداوم برای کشفِ نشتی — §21 */
      soak_endurance: {
        executor: 'constant-arrival-rate',
        rate: LOAD_VUS, timeUnit: '1s', duration: SOAK_DURATION,
        preAllocatedVUs: LOAD_VUS, maxVUs: LOAD_VUS * 3
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
function login() {
  const sent = http.post(BASE + '/api/auth/send-code', JSON.stringify({ phone: PHONE }),
    { headers: { 'content-type': 'application/json' } });
  let code = null;
  try { code = sent.json('demo_code'); } catch (e) { code = null; }
  if (!code) { check(sent, { 'send-code ok': (r) => r.status === 200 }); return null; }
  const res = http.post(BASE + '/api/auth/login',
    JSON.stringify({ phone: PHONE, code, national_id: NID || undefined }),
    { headers: { 'content-type': 'application/json' } });
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) return null;
  const setCookie = res.headers['Set-Cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || '');
  const cookie = raw.split(';').map((c) => c.trim()).filter((c) => c.indexOf('=') > 0).join('; ');
  /* هویتِ واقعیِ کاربرِ login‌شده را برمی‌گردانیم. نوشتنِ `by` با شناسهٔ
     هاردکد، گاردِ forged_by سرور را فعال می‌کند و همهٔ نوشتن‌ها رد می‌شوند. */
  let me = null;
  try { me = res.json('user'); } catch (e) { me = null; }
  return { cookie, user: me || {} };
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

/* ── سناریوی نوشتن (sync) ─────────────────────────────────────────── */
function writeOnce(sess) {
  const cookie = sess && sess.cookie;
  const me = (sess && sess.user) || {};
  /* فقط فیلدهایِ مجازِ مدلِ teacher_notes (authz/model.json):
     body, created_at, school_id, student_id, teacher_id, updated_at.
     هر کلیدِ دیگر ⇒ unknown_field (fail-closed). */
  const data = { school_id: me.school_id || 1, teacher_id: me.id || 1, body: 'k6 load probe' };
  if (STUDENT_ID) data.student_id = STUDENT_ID;
  const body = JSON.stringify({
    ops: [{ uid: uid(), t: 'ins', c: 'teacher_notes', data,
            by: me.id || 1, at: new Date().toISOString() }]
  });
  const t0 = Date.now();
  const res = http.post(BASE + '/api/sync', body,
    { headers: { 'content-type': 'application/json', cookie: cookie || '' } });
  syncLatency.add(Date.now() - t0);
  writesPerSec.add(1);
  /* سرور برایِ نوشتنِ ردشده هم HTTP 200 می‌دهد و `ok:false` را در body
     می‌گذارد (مثلاً forged_by). سنجهٔ write_errors باید body را بخواند،
     وگرنه یک اجرایِ کاملاً ردشده «سبز» گزارش می‌شود. */
  let good = false, code = 'unparsed';
  try {
    const j = res.json();
    code = (j && j.code) || (j && j.results && j.results[0] && j.results[0].code) || '';
    good = res.status === 200 && j && j.ok !== false &&
      (!j.results || j.results.every((r) => r.ok !== false));
  } catch (e) { good = false; }
  writeErrors.add(!good);
  check(res, { 'sync accepted (ok in body)': () => good });
  if (!good) syncRejects.add(code || 'unknown');
}

export function setup() {
  const sess = login();
  if (!sess) throw new Error('login در setup شکست خورد — PAYESH_PHONE/PAYESH_NID را بررسی کنید');
  return { sess, model: NATIONAL };
}

export default function (data) {
  const sess = data && data.sess;
  const cookie = sess && sess.cookie;
  group('read mix', () => readMix(cookie));
  /* نسبتِ ۸ خواندن به ۱ نوشتن، همان چیزی که مدلِ ملی فرض می‌کند */
  if (__ITER % 8 === 0) group('write', () => writeOnce(sess));
  sleep(Math.random() * 0.4 + 0.1);
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify({
      scenario: SCENARIO,
      model: NATIONAL,
      metrics: {
        rps: data.metrics.http_reqs && data.metrics.http_reqs.values.rate,
        p50: data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(50)'],
        p95: data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(95)'],
        p99: data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(99)'],
        failed_rate: data.metrics.http_req_failed && data.metrics.http_req_failed.values.rate,
        writes: data.metrics.writes_total && data.metrics.writes_total.values.count
      }
    }, null, 2) + '\n'
  };
}
