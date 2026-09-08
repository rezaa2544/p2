/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/02-bootstrap.js
   سناریوی ۲: واکشی داده‌های اولیه کلاینت (Scoped Bootstrap API)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { bootstrapDuration, bootstrapFailureRate, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';

export const options = {
  scenarios: {
    bootstrap_load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 20 },
        { duration: '20s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    bootstrap_duration_ms: ['p(95)<180', 'p(99)<350'],
    bootstrap_failure_rate: ['rate<0.01'],
    http_req_duration: ['p(95)<200'],
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

  if (!session || !session.cookie) {
    bootstrapFailureRate.add(1);
    return;
  }

  const headers = getAuthHeaders(session.cookie);
  const t0 = Date.now();
  
  const res = http.get(`${BASE_URL}/api/v1/bootstrap`, {
    headers: headers,
    tags: { name: 'GET /api/v1/bootstrap', role: role }
  });
  
  const duration = Date.now() - t0;
  bootstrapDuration.add(duration);

  const ok = check(res, {
    'bootstrap status is 200': (r) => r.status === 200,
    'bootstrap has ok property': (r) => {
      try { return JSON.parse(r.body).ok === true; } catch (e) { return false; }
    },
    'bootstrap response time < 200ms': () => duration < 200,
    'bootstrap returns role-scoped user': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.user && body.user.role === role;
      } catch (e) {
        return false;
      }
    }
  });

  bootstrapFailureRate.add(!ok);
  if (ok) {
    successfulRequests.add(1);
  }

  sleep(0.3);
}
