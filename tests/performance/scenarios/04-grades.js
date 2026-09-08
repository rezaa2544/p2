/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/04-grades.js
   سناریوی ۴: ثبت نمرات و اعتبارسنجی همزمانی (Concurrent Grade Management)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { gradesDuration, gradesFailureRate, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';
import { generateGradePayload, getRandomInt } from '../helpers/payload-generator.js';

export const options = {
  scenarios: {
    grades_load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 15 },
        { duration: '20s', target: 35 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    grades_duration_ms: ['p(95)<200', 'p(99)<450'],
    grades_failure_rate: ['rate<0.02'],
    http_req_duration: ['p(95)<200'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const teacherSession = data.teacher;
  if (!teacherSession || !teacherSession.cookie) {
    gradesFailureRate.add(1);
    return;
  }

  const headers = getAuthHeaders(teacherSession.cookie);
  const studentId = 16 + (__VU % 20);
  const subjectId = 1 + (__VU % 5);
  const classId = 1 + (__VU % 4);

  group('ثبت و به‌روزرسانی نمرات', () => {
    // ۱. ثبت نمره جدید
    const payload = JSON.stringify(generateGradePayload({
      student_id: studentId,
      subject_id: subjectId,
      class_id: classId,
      score: getRandomInt(12, 20),
      teacher_id: 4
    }));

    const t0 = Date.now();
    const createRes = http.post(`${BASE_URL}/api/v1/grades`, payload, {
      headers: headers,
      tags: { name: 'POST /api/v1/grades' }
    });
    const duration = Date.now() - t0;
    gradesDuration.add(duration);

    let gradeId = null;
    let version = 1;
    const createOk = check(createRes, {
      'create grade is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'create grade returns item': (r) => {
        try {
          const body = JSON.parse(r.body);
          if (body.data && body.data.id) {
            gradeId = body.data.id;
            version = body.data.version || 1;
          }
          return body.ok === true;
        } catch (e) {
          return false;
        }
      }
    });

    // ۲. ویرایش نمره با کنترل نگارش همگام (Optimistic Concurrency Check)
    let patchOk = true;
    if (gradeId) {
      const updatePayload = JSON.stringify({
        score: Math.min(20, getRandomInt(15, 20)),
        base_version: version,
        note: 'تصحیح مجدد توسط دبیر'
      });

      const patchRes = http.patch(`${BASE_URL}/api/v1/grades/${gradeId}`, updatePayload, {
        headers: headers,
        tags: { name: 'PATCH /api/v1/grades/:id' }
      });

      patchOk = check(patchRes, {
        'patch grade is 200': (r) => r.status === 200 || r.status === 409, // 409 is valid concurrency conflict
      });
    }

    const overallSuccess = createOk && patchOk;
    gradesFailureRate.add(!overallSuccess);
    if (overallSuccess) {
      successfulRequests.add(gradeId ? 2 : 1);
    }
  });

  sleep(0.4);
}
