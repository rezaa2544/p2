/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/01-login.js
   سناریوی ۱: ورود انبوه هم‌زمان کاربران با OTP و کد ملی
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۲.۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { loginDuration, loginFailureRate, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, extractCookie, ALL_TEST_USERS } from '../helpers/auth-helper.js';

export const options = {
  scenarios: {
    login_load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 15 },
        { duration: '15s', target: 30 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    login_duration_ms: ['p(95)<200', 'p(99)<400'],
    login_failure_rate: ['rate<0.05'],
    http_req_duration: ['p(95)<250'],
  },
};

const BASE_URL = getBaseUrl();

export default function () {
  // افراز یکتا برای هر کاربر مجازی (VU Partitioning) جهت جلوگیری از تلاقی همزمان یک شماره تلفن
  const vuOffset = (__VU - 1) * 30;
  const userIndex = (vuOffset + (__ITER % 30)) % ALL_TEST_USERS.length;
  const user = ALL_TEST_USERS[userIndex];
  
  // ۱. درخواست ارسال کد تایید OTP
  const sendPayload = JSON.stringify({ phone: user.phone });
  const sendRes = http.post(`${BASE_URL}/api/auth/send-code`, sendPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/auth/send-code' }
  });

  const sendOk = check(sendRes, {
    'send-code status is 200': (r) => r.status === 200,
    'send-code has ok property': (r) => {
      try { return JSON.parse(r.body).ok === true; } catch (e) { return false; }
    }
  });

  let demoCode = '1234';
  try {
    const parsed = JSON.parse(sendRes.body);
    if (parsed.demo_code) demoCode = parsed.demo_code;
  } catch (e) {}

  // ۲. ارسال درخواست لاگین با کد و کد ملی
  const loginPayload = JSON.stringify({
    phone: user.phone,
    code: demoCode,
    national_id: user.national_id
  });

  const t0 = Date.now();
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/auth/login' }
  });
  const duration = Date.now() - t0;
  loginDuration.add(duration);

  const cookie = extractCookie(loginRes);
  const loginOk = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login returns payesh_session cookie': () => !!cookie,
    'login returns user role': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.ok === true && !!data.user && !!data.user.role;
      } catch (e) {
        return false;
      }
    }
  });

  const overallSuccess = sendOk && loginOk;
  loginFailureRate.add(!overallSuccess);
  if (overallSuccess) {
    successfulRequests.add(1);
  }

  sleep(0.5);
}
