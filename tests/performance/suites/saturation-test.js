/* ═══════════════════════════════════════════════════════════════════
   tests/performance/suites/saturation-test.js
   سوئیت آزمون اشباع و نقطه شکست پایگاه داده (Database Saturation Test)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۳
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { dbQueryDuration, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';
import { generateAttendancePayload, generateGradePayload, generateBatchSyncOps } from '../helpers/payload-generator.js';

export const options = {
  scenarios: {
    database_saturation_ramp: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '10s', target: 25 },   // فاز ۱: ترافیک معمول
        { duration: '20s', target: 75 },   // فاز ۲: افزایش بار و پر شدن کانکشن‌پول
        { duration: '30s', target: 150 },  // فاز ۳: ورود به محدوده آستانه و اشباع
        { duration: '10s', target: 200 },  // فاز ۴: تست حداکثر فشار (Knee Point)
        { duration: '10s', target: 0 },    // فاز ۵: بازیابی و تخلیه بار
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // در اوج اشباع کمتر از ۵٪ خطا مجاز است
    http_req_duration: ['p(95)<1200'], // آستانه مجاز تاخیر در اوج بار
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const managerSession = data.manager;
  const teacherSession = data.teacher;
  if (!managerSession || !managerSession.cookie || !teacherSession || !teacherSession.cookie) return;

  const managerHeaders = getAuthHeaders(managerSession.cookie);
  const teacherHeaders = getAuthHeaders(teacherSession.cookie);
  const operationType = __ITER % 4;

  group('ترکیب عملیات سنگین پایگاه داده', () => {
    if (operationType === 0) {
      // عملیات ۱: خوانش سنگین فهرست‌ها با فیلتر (Indexed Database Read)
      const res = http.get(`${BASE_URL}/api/v1/students?limit=50&sort=name`, {
        headers: managerHeaders,
        tags: { name: 'GET /api/v1/students [heavy read]' }
      });
      check(res, { 'students list read ok': (r) => r.status === 200 });
    } else if (operationType === 1) {
      // عملیات ۲: نوشتن ردیف حضور و غیاب توسط مدیر (Atomic Insert)
      const payload = JSON.stringify(generateAttendancePayload({
        school_id: 1,
        class_id: 1 + (__VU % 5),
        student_id: 16 + (__VU % 30)
      }));
      const res = http.post(`${BASE_URL}/api/v1/attendance`, payload, {
        headers: managerHeaders,
        tags: { name: 'POST /api/v1/attendance [write]' }
      });
      check(res, { 'attendance write ok': (r) => r.status === 200 || r.status === 201 });
    } else if (operationType === 2) {
      // عملیات ۳: واکشی نمرات همراه با محاسبات سمت سرور
      const res = http.get(`${BASE_URL}/api/v1/grades?limit=30`, {
        headers: managerHeaders,
        tags: { name: 'GET /api/v1/grades [query]' }
      });
      check(res, { 'grades query ok': (r) => r.status === 200 });
    } else {
      // عملیات ۴: همگام‌سازی دسته آفلاین توسط مدیر (Batch Write)
      const ops = generateBatchSyncOps(5, managerSession.user.id, managerSession.user.school_id || 1, 'manager');
      const res = http.post(`${BASE_URL}/api/sync`, JSON.stringify({ ops }), {
        headers: managerHeaders,
        tags: { name: 'POST /api/sync [batch]' }
      });
      check(res, { 'sync batch ok': (r) => r.status === 200 });
    }
  });

  sleep(0.1 + Math.random() * 0.2);
}
