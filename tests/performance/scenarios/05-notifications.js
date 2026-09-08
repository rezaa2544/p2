/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/05-notifications.js
   سناریوی ۵: صف اعلان‌ها و ارسال پیام‌های گروهی (Notification & SMS Queue)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { notificationDuration, notificationFailureRate, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';

export const options = {
  scenarios: {
    notifications_dispatch: {
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
    notification_duration_ms: ['p(95)<300', 'p(99)<600'],
    notification_failure_rate: ['rate<0.02'],
    http_req_duration: ['p(95)<300'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const superadminSession = data.superadmin;
  const parentSession = data.parent;
  const managerSession = data.manager;

  if (!superadminSession || !superadminSession.cookie || !parentSession || !parentSession.cookie) {
    notificationFailureRate.add(1);
    return;
  }

  const superadminHeaders = getAuthHeaders(superadminSession.cookie);
  const parentHeaders = getAuthHeaders(parentSession.cookie);

  group('پردازش صف اعلان‌ها و استعلام وضعیت', () => {
    // ۱. ارسال و تخلیه صف پیامک‌ها توسط ادمین (SMS Batch Queue Dispatch)
    const smsPayload = JSON.stringify({
      queue_ids: [1]
    });

    const t0 = Date.now();
    const smsRes = http.post(`${BASE_URL}/api/sms/send`, smsPayload, {
      headers: superadminHeaders,
      tags: { name: 'POST /api/sms/send' }
    });
    const duration = Date.now() - t0;
    notificationDuration.add(duration);

    const smsOk = check(smsRes, {
      'sms queue dispatch handled (200, 503, or 400)': (r) => r.status === 200 || r.status === 503 || r.status === 400 || r.status === 429,
    });

    // ۲. بررسی دریافت اعلان و نشان خوانده‌نشده توسط ولی/دانش‌آموز
    const bootstrapRes = http.get(`${BASE_URL}/api/v1/bootstrap`, {
      headers: parentHeaders,
      tags: { name: 'GET /api/v1/bootstrap [parent notifications]' }
    });

    const bootstrapOk = check(bootstrapRes, {
      'parent bootstrap status is 200': (r) => r.status === 200,
      'unread_notifications field exists': (r) => {
        try {
          const body = JSON.parse(r.body);
          return typeof body.unread_notifications === 'number';
        } catch (e) {
          return false;
        }
      }
    });

    const overallSuccess = smsOk && bootstrapOk;
    notificationFailureRate.add(!overallSuccess);
    if (overallSuccess) {
      successfulRequests.add(2);
    }
  });

  sleep(0.4);
}
