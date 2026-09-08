/* ═══════════════════════════════════════════════════════════════════
   tests/performance/scenarios/06-sync-batch.js
   سناریوی ۶: همگام‌سازی دسته‌ای آفلاین (Offline Queue Batch Sync)
   سند مرجع: docs/PERFORMANCE_TESTING_PLAN.md §۱
   ═══════════════════════════════════════════════════════════════════ */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { syncDuration, syncFailureRate, syncOpsCount, syncBatchSize, successfulRequests } from '../helpers/metrics.js';
import { getBaseUrl, setupAllSessions, getAuthHeaders } from '../helpers/auth-helper.js';
import { generateBatchSyncOps, getRandomInt } from '../helpers/payload-generator.js';

export const options = {
  scenarios: {
    batch_sync_load: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '5s', target: 10 },
        { duration: '20s', target: 30 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    sync_duration_ms: ['p(95)<500', 'p(99)<1000'],
    sync_failure_rate: ['rate<0.02'],
    http_req_duration: ['p(95)<600'],
  },
};

const BASE_URL = getBaseUrl();

export function setup() {
  return setupAllSessions(BASE_URL);
}

export default function (data) {
  const managerSession = data.manager;
  if (!managerSession || !managerSession.cookie) {
    syncFailureRate.add(1);
    return;
  }

  const headers = getAuthHeaders(managerSession.cookie);
  const batchCount = getRandomInt(5, 25); // تست دسته‌های بین ۵ تا ۲۵ عملیات اتمیک
  const ops = generateBatchSyncOps(batchCount, 2, 1);

  const payload = JSON.stringify({ ops: ops });
  const t0 = Date.now();
  
  const res = http.post(`${BASE_URL}/api/sync`, payload, {
    headers: headers,
    tags: { name: 'POST /api/sync' }
  });
  
  const duration = Date.now() - t0;
  syncDuration.add(duration);
  syncBatchSize.add(batchCount);

  const ok = check(res, {
    'sync status is 200': (r) => r.status === 200,
    'sync response contains applied or ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.ok === true || Array.isArray(body.applied) || body.status === 'ok';
      } catch (e) {
        return false;
      }
    }
  });

  syncFailureRate.add(!ok);
  if (ok) {
    syncOpsCount.add(batchCount);
    successfulRequests.add(1);
  }

  sleep(0.5);
}
