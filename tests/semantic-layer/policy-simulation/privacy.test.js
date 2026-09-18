/**
 * آزمون ۷: حفظ حریم خصوصی و عدم افشای هویت فردی (Privacy Protection)
 */

'use strict';

const assert = require('assert');
const {
  buildPolicySimulationSnapshot
} = require('../../../server/analytics/policy-simulation-engine');

function runTests() {
  console.log('▸ تست ۷: حفظ حریم خصوصی و عدم افشای هویت فردی (privacy)');

  const snapshot = buildPolicySimulationSnapshot({
    schoolId: 101,
    regionId: 1,
    baselineMetrics: {
      current_attendance_rate: 88.0,
      current_gpa: 15.0,
      student_id: 123456, // تست عدم نشت
      national_id: '0012345678'
    }
  });

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('123456'), 'شناسه دانش‌آموز نباید در شبیه‌سازی نشت کند');
  assert.ok(!serialized.includes('0012345678'), 'کد ملی نباید در شبیه‌سازی نشت کند');
  assert.strictEqual(snapshot.zero_ranking, true);

  console.log('  ✅ حفظ ۱۰۰٪ حریم خصوصی و ممانعت از نشت داده‌های فردی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
