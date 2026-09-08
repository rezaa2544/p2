/* ═══════════════════════════════════════════════════════════════════
   tests/performance/suites/spike-mehr-test.js
   سوئیت آزمون ضربه ترافیکی اول مهر (10x Mehr 1st School Reopening Spike)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۹
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';

export const options = {
  scenarios: {
    mehr_first_traffic_shock: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '10s', target: 15 },   // وضعیت عادی پیش از شروع ساعت مدرسه
        { duration: '15s', target: 150 },  // 💥 جهش انفجاری ۱۰ برابری در شروع ساعت آموزشی
        { duration: '30s', target: 150 },  // حفظ بار در اوج ضربه اول مهر
        { duration: '15s', target: 15 },   // بازگشت به شرایط پایدار
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // معیارهای قبولی در آزمون ضربه اول مهر (§۹.۲):
    // ۱. نرخ خطا (Error Rate): کمتر از ۰.۱٪ در اوج ضربه
    // ۲. زمان پاسخ ۹۵٪: زیر ۵۰۰ میلی‌ثانیه
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const roles = ['manager', 'teacher', 'student', 'parent'];
  const role = roles[__VU % roles.length];
  const session = data[role];

  if (!session || !session.cookie) return;
  const headers = getAuthHeaders(session.cookie);

  group('شبیه‌سازی ورود هماهنگ اول مهر', () => {
    // ۱. درخواست بارگذاری داشبورد و داده‌های اولیه
    const bootRes = http.get(`${BASE_URL}/api/v1/bootstrap`, {
      headers: headers,
      tags: { name: 'GET /api/v1/bootstrap [spike]' }
    });

    check(bootRes, {
      'spike bootstrap status 200': (r) => r.status === 200,
      'bootstrap payload valid': (r) => {
        try {
          return JSON.parse(r.body).ok === true;
        } catch (e) {
          return false;
        }
      }
    });

    // ۲. استعلام زنگ و برنامه درسی روز اول مدرسه
    const bellRes = http.get(`${BASE_URL}/api/bell/now`, {
      headers: headers,
      tags: { name: 'GET /api/bell/now [spike]' }
    });

    check(bellRes, {
      'bell response ok': (r) => r.status === 200
    });
  });

  sleep(0.2 + Math.random() * 0.3);
}
