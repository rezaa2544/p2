/* ═══════════════════════════════════════════════════════════════════
   tests/performance/suites/chaos-redis-test.js
   سوئیت آزمون آشوب و پایداری در زمان قطع Redis (Redis Chaos & Fallback Test)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۴
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { circuitBreakerTrips, redisLatency, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';

export const options = {
  scenarios: {
    redis_chaos_traffic: {
      executor: 'constant-vus',
      vus: 30,
      duration: '45s',
    },
  },
  thresholds: {
    // الزامات تاب‌آوری در زمان قطع کش:
    // ۱. هیچ خطای ۵۰۰ یا کرش نباید بازگردد (Circuit Breaker & Fallback)
    // ۲. نشست‌ها باید بدون وقفه تایید شوند
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400'],
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

  group('تست تاب‌آوری و اعتبارسنجی خودکفا در غیاب Redis', () => {
    // ۱. فراخوانی اندپوینت Bootstrap (بررسی عملکرد لایه L1 In-Memory Cache و عدم رخداد 500)
    const t0 = Date.now();
    const bootstrapRes = http.get(`${BASE_URL}/api/v1/bootstrap`, {
      headers: headers,
      tags: { name: 'GET /api/v1/bootstrap [chaos-resilience]' }
    });
    const lat = Date.now() - t0;
    redisLatency.add(lat);

    check(bootstrapRes, {
      'no 500 internal server error during redis disruption': (r) => r.status !== 500,
      'status is 200 with fallback data': (r) => r.status === 200,
      'response has valid user payload': (r) => {
        try {
          const b = JSON.parse(r.body);
          return b.ok === true && !!b.user;
        } catch (e) {
          return false;
        }
      }
    });

    // ۲. بررسی اعتبارسنجی توکن نشست رمزنگاری‌شده (JWT Verification Resilience)
    const meRes = http.get(`${BASE_URL}/api/auth/me`, {
      headers: headers,
      tags: { name: 'GET /api/auth/me [token-resilience]' }
    });

    check(meRes, {
      'jwt verified without external redis state': (r) => r.status === 200,
      'identity matches sub': (r) => {
        try {
          const b = JSON.parse(r.body);
          return b.ok === true && b.user && b.user.id === session.user.id;
        } catch (e) {
          return false;
        }
      }
    });
  });

  sleep(0.3);
}
