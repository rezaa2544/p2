/**
 * تست رعایت ۱۰۰٪ اصل حاکمیت تصمیم انسانی در لایه رصدپذیری (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  buildObservabilityHealthSnapshot,
  buildOperationalAlerts
} = require('../../../server/monitoring/production-observability');

function runHumanSovereigntyTests() {
  console.log('▸ تست ۷: پاسداری از حاکمیت تصمیم انسانی در رصدپذیری و هشدارها (human-sovereignty)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildObservabilityHealthSnapshot(
    { schoolId: 101, regionId: 1, user },
    {
      applicationMetrics: { latency_p99_ms: 450 },
      queueMetrics: { dead_letter_queue_size: 2 }
    }
  );

  // ۱. ارزیابی انطباق حاکمیتی در شناسنامه سلامت
  const gov = snapshot.governance_and_invariants.human_decision_sovereignty;
  assert.strictEqual(gov.automated_decision, false);
  assert.strictEqual(gov.automated_execution, false);
  assert.strictEqual(gov.requires_human_approval, true);
  assert.strictEqual(gov.enforced, true);

  // ۲. ارزیابی هشدارهای عملیاتی تولید
  assert(snapshot.operational_alerts.length > 0);
  for (const alert of snapshot.operational_alerts) {
    assert.strictEqual(alert.governance.automated_decision, false);
    assert.strictEqual(alert.governance.automated_execution, false);
    assert.strictEqual(alert.governance.requires_human_approval, true);
    assert(typeof alert.suggested_remediation === 'string');
    assert(alert.suggested_remediation.length > 0);
  }

  // ۳. ارزیابی مستقل تابع ساخت هشدارها
  const alerts = buildOperationalAlerts([
    {
      category: 'DATABASE_POOL_SATURATION',
      severity: 'WARNING',
      description: 'Test anomaly'
    }
  ]);
  assert.strictEqual(alerts[0].governance.automated_decision, false);
  assert.strictEqual(alerts[0].governance.automated_execution, false);
  assert.strictEqual(alerts[0].governance.requires_human_approval, true);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در رصدپذیری و هشدارها تایید شد');
}

if (require.main === module) {
  runHumanSovereigntyTests();
}

module.exports = { runHumanSovereigntyTests };
