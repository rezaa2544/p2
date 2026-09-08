/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/03-attendance.js
   سناریوی ۳: ثبت متمرکز حضور و غیاب صبحگاهی (Morning Attendance Rush)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { attendanceDuration, attendanceFailureRate, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';
import { generateAttendancePayload, getRandomInt } from '../helpers/payload-generator.js';

export const options = {
  scenarios: {
    morning_attendance_rush: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 15 },
        { duration: '20s', target: 40 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    attendance_duration_ms: ['p(95)<250', 'p(99)<500'],
    attendance_failure_rate: ['rate<0.02'],
    http_req_duration: ['p(95)<250'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const teacherSession = data.teacher;
  const managerSession = data.manager;
  const session = (__VU % 2 === 0) ? teacherSession : managerSession;

  if (!session || !session.cookie) {
    attendanceFailureRate.add(1);
    return;
  }

  const headers = getAuthHeaders(session.cookie);
  const classId = 1 + (__VU % 5);
  const studentId = 16 + (__VU % 25);

  group('ثبت و واکشی حضور و غیاب', () => {
    // ۱. ثبت رکورد جدید حضور و غیاب
    const payload = JSON.stringify(generateAttendancePayload({
      class_id: classId,
      student_id: studentId,
      school_id: 1,
    }));

    const t0 = Date.now();
    const postRes = http.post(`${BASE_URL}/api/v1/attendance`, payload, {
      headers: headers,
      tags: { name: 'POST /api/v1/attendance' }
    });
    const postDuration = Date.now() - t0;
    attendanceDuration.add(postDuration);

    const postOk = check(postRes, {
      'create attendance status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'create attendance returns ok': (r) => {
        try { return JSON.parse(r.body).ok === true; } catch (e) { return false; }
      }
    });

    // ۲. دریافت فهرست وضعیت حضور کلاس جاری
    const getRes = http.get(`${BASE_URL}/api/v1/attendance?class_id=${classId}&limit=20`, {
      headers: headers,
      tags: { name: 'GET /api/v1/attendance' }
    });

    const getOk = check(getRes, {
      'get attendance list is 200': (r) => r.status === 200,
      'attendance list has data array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch (e) { return false; }
      }
    });

    const success = postOk && getOk;
    attendanceFailureRate.add(!success);
    if (success) {
      successfulRequests.add(2);
    }
  });

  sleep(0.4);
}
