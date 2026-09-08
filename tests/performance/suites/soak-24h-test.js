/* ═══════════════════════════════════════════════════════════════════
   tests/performance/suites/soak-24h-test.js
   سوئیت آزمون پایداری و استقامت طولانی‌مدت (24-Hour Soak / Endurance Test)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۸
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';
import { generateAttendancePayload, generateGradePayload } from '../helpers/payload-generator.js';

// مدت زمان تست قابل تنظیم از طریق محیط (پیش‌فرض ۲۴ ساعت برای آزمون واقعی، ۱ دقیقه برای تست اعتبارسنجی)
const SOAK_DURATION = __ENV.SOAK_DURATION || '24h';
const SOAK_VUS = parseInt(__ENV.SOAK_VUS || '30', 10);

export const options = {
  scenarios: {
    continuous_soak_load: {
      executor: 'constant-vus',
      vus: SOAK_VUS,
      duration: SOAK_DURATION,
    },
  },
  thresholds: {
    // در طول آزمون ۲۴ ساعته:
    // ۱. نرخ خطا باید زیر ۰.۱٪ باقی بماند (عدم رخداد نشت حافظه یا قطع ارتباط)
    // ۲. زمان پاسخ ۹۵٪ درخواست‌ها باید زیر ۲۰۰ میلی‌ثانیه حفظ شود
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<200', 'p(99)<400'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const sessionIndex = __VU % 4;
  const session = sessionIndex === 0 ? data.manager : (sessionIndex === 1 ? data.teacher : (sessionIndex === 2 ? data.student : data.parent));
  if (!session || !session.cookie) return;

  const headers = getAuthHeaders(session.cookie);
  const phase = __ITER % 3;

  group('چرخه پایدار درخواست‌های پیوسته', () => {
    if (phase === 0) {
      // بررسی سلامت و وضعیت سیستم (Heartbeat / Healthcheck)
      const res = http.get(`${BASE_URL}/api/health`);
      check(res, { 'healthcheck is 200': (r) => r.status === 200 });
    } else if (phase === 1) {
      // بارگذاری داده اولیه (Bootstrap Read)
      const res = http.get(`${BASE_URL}/api/v1/bootstrap`, { headers: headers });
      check(res, { 'bootstrap ok': (r) => r.status === 200 });
    } else {
      // ثبت تراکنش سبک دوره‌ای
      if (session.user.role === 'teacher' || session.user.role === 'manager') {
        const payload = JSON.stringify(generateAttendancePayload({
          school_id: 1,
          class_id: 1,
          student_id: 16 + (__VU % 15)
        }));
        const res = http.post(`${BASE_URL}/api/v1/attendance`, payload, { headers: headers });
        check(res, { 'transaction ok': (r) => r.status === 200 || r.status === 201 });
      } else {
        const res = http.get(`${BASE_URL}/api/bell/now`, { headers: headers });
        check(res, { 'bell query ok': (r) => r.status === 200 });
      }
    }
  });

  // خواب تنظیم‌شده برای شبیه‌سازی رفتار طبیعی کاربران و جلوگیری از اسپایک غیرواقعی
  sleep(1.0 + Math.random() * 0.5);
}
