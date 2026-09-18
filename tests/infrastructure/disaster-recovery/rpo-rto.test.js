/**
 * تست پایش و انطباق اهداف RPO و RTO در لایه DR (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const {
  calculateRpoRtoMetrics,
  TARGET_RPO_SECONDS,
  TARGET_RTO_SECONDS
} = require('../../../server/infrastructure/disaster-recovery');

function runRpoRtoTests() {
  console.log('▸ تست ۳: پایش اهداف RPO (۵ دقیقه) و RTO (۱۵ دقیقه) (rpo-rto)');

  assert.strictEqual(TARGET_RPO_SECONDS, 300);
  assert.strictEqual(TARGET_RTO_SECONDS, 900);

  // ۱. حالت منطبق با سیاست (RPO=120s, RTO=240s)
  const nominal = calculateRpoRtoMetrics({
    achieved_rpo_seconds: 120,
    estimated_rto_seconds: 240
  });

  assert.strictEqual(nominal.achieved_rpo_seconds, 120);
  assert.strictEqual(nominal.estimated_rto_seconds, 240);
  assert.strictEqual(nominal.rpo_compliant, true);
  assert.strictEqual(nominal.rto_compliant, true);
  assert.strictEqual(nominal.overall_compliance, true);

  // ۲. نقض RPO (بیش از ۳۰۰ ثانیه)
  const violatedRpo = calculateRpoRtoMetrics({
    achieved_rpo_seconds: 350,
    estimated_rto_seconds: 240
  });
  assert.strictEqual(violatedRpo.rpo_compliant, false);
  assert.strictEqual(violatedRpo.rto_compliant, true);
  assert.strictEqual(violatedRpo.overall_compliance, false);

  // ۳. نقض RTO (بیش از ۹۰۰ ثانیه)
  const violatedRto = calculateRpoRtoMetrics({
    achieved_rpo_seconds: 100,
    estimated_rto_seconds: 950
  });
  assert.strictEqual(violatedRto.rpo_compliant, true);
  assert.strictEqual(violatedRto.rto_compliant, false);
  assert.strictEqual(violatedRto.overall_compliance, false);

  console.log('  ✅ صحت محاسبات RPO/RTO و انطباق با سیاست‌های مصوب تایید شد');
}

if (require.main === module) {
  runRpoRtoTests();
}

module.exports = { runRpoRtoTests };
