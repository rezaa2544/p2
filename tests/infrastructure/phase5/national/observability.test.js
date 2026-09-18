/**
 * tests/infrastructure/phase5/national/observability.test.js
 * آزمون پلین رصدپذیری ملی، انطباق SLO و تابلوی عملیات (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  NATIONAL_SLO_TARGETS,
  buildNationalOperationsDashboard
} = require('../../../../server/monitoring/national-observability-plane');

console.log('--- آزمون پلین رصدپذیری ملی و پایش SLO ---');

// ۱. بررسی تابلوی عملیات ملی در وضعیت بهینه
const optimalDashboard = buildNationalOperationsDashboard({
  api_latency_p95_ms: 180,
  api_latency_p99_ms: 600,
  api_error_rate_pct: 0.01,
  event_lag_ms: 100,
  db_replication_lag_ms: 50
});

assert.strictEqual(optimalDashboard.dashboard_id, 'DASHBOARD-PHASE5-NATIONAL-OPERATIONS');
assert.strictEqual(optimalDashboard.operational_status, 'OPTIMAL');
assert.strictEqual(optimalDashboard.slo_performance.overall_slo_pass, true);
assert.strictEqual(optimalDashboard.human_governance.requires_human_approval, true);
assert.strictEqual(optimalDashboard.zero_ranking_guarantee.enforced, true);

// ۲. هشدار رصدپذیری در صورت نقض آستانه SLO
const alertDashboard = buildNationalOperationsDashboard({
  api_latency_p95_ms: 350, // فراتر از سقف ۳۰۰ms
  api_error_rate_pct: 0.25 // فراتر از سقف ۰.۱٪
});

assert.strictEqual(alertDashboard.operational_status, 'MONITORING_ALERT');
assert.strictEqual(alertDashboard.slo_performance.compliance.p95_compliant, false);
assert.strictEqual(alertDashboard.slo_performance.compliance.error_rate_compliant, false);
assert.strictEqual(alertDashboard.slo_performance.overall_slo_pass, false);

console.log('✅ ۶/۷: پلین رصدپذیری ملی و سنجش دقیق SLO با موفقیت تایید شد');
