/**
 * تست آمادگی سازوکار بازگشت سریع به نسخه قبلی (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  evaluateRollbackReadiness
} = require('../../../server/deployment/pilot-traffic-management');

function runRollbackReadinessTests() {
  console.log('▸ تست ۳: آمادگی بازگشت سریع و حاکمیت تصمیم انسانی در رول‌بک (rollback-readiness)');

  // ۱. حالت آماده بازگشت (Nominal)
  const nominal = evaluateRollbackReadiness();
  assert.strictEqual(nominal.available, true);
  assert.strictEqual(nominal.strategy, 'FAST_DRAIN_AND_TRAFFIC_SWITCH');
  assert.strictEqual(nominal.estimated_rollback_seconds, 30);
  assert.strictEqual(nominal.governance.automated_decision, false);
  assert.strictEqual(nominal.governance.automated_execution, false);
  assert.strictEqual(nominal.governance.requires_human_approval, true);

  // ۲. عدم آمادگی در صورت نبود آرشیو پایه
  const missingArtifact = evaluateRollbackReadiness({ baseline_artifact_available: false });
  assert.strictEqual(missingArtifact.available, false);

  // ۳. عدم آمادگی در صورت ناامن بودن اسکیما
  const unsafeSchema = evaluateRollbackReadiness({ schema_rollback_safe: false });
  assert.strictEqual(unsafeSchema.available, false);

  console.log('  ✅ صحت ارزیابی آمادگی رول‌بک و رعایت صلب حاکمیت انسانی با موفقیت تایید شد');
}

if (require.main === module) {
  runRollbackReadinessTests();
}

module.exports = { runRollbackReadinessTests };
