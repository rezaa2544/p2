/**
 * آزمون ۴: مدیریت عدم قطعیت و محدودیت‌های مدل (Uncertainty & Assumptions)
 */

'use strict';

const assert = require('assert');
const {
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۴: مدیریت عدم قطعیت و افشای فرضیات مدل (uncertainty)');

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 1
  });

  assert.ok(Array.isArray(snapshot.assumptions), 'فرضیات مدل باید آرایه‌ای معتبر باشند');
  assert.ok(snapshot.assumptions.length >= 2, 'حداقل ۲ فرض اساسی باید ذکر شود');

  assert.ok(Array.isArray(snapshot.limitations), 'محدودیت‌های مدل باید آرایه‌ای معتبر باشند');
  assert.ok(snapshot.limitations.length >= 1, 'محدودیت‌های مدل باید صراحتاً بیان شوند');

  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(snapshot.confidence_level));
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(snapshot.uncertainty_level));

  assert.ok(snapshot.data_quality);
  assert.ok(snapshot.data_quality.completeness_pct >= 0);

  console.log('  ✅ شفاف‌سازی سطوح عدم قطعیت، فرضیات و کیفیت داده‌ها تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
