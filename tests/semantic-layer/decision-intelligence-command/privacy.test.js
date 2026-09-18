/**
 * آزمون ۷: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (Privacy Protection)
 */

'use strict';

const assert = require('assert');
const {
  buildDecisionCommandSnapshot
} = require('../../../server/analytics/decision-intelligence-command');

function runTests() {
  console.log('▸ تست ۷: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (privacy)');

  const mockOutputs = {
    decisions: [
      {
        decision_id: 'DEC-01',
        title: 'مداخله تحصیلی',
        student_id: 887766, // تست عدم نشت
        national_id: '0098765432' // تست عدم نشت
      }
    ]
  };

  const snapshot = buildDecisionCommandSnapshot({
    schoolId: 101,
    regionId: 1,
    engineOutputs: mockOutputs
  });

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('887766'), 'شناسه دانش‌آموز نباید در شناسنامه فرماندهی نشت کند');
  assert.ok(!serialized.includes('0098765432'), 'کد ملی نباید در شناسنامه فرماندهی نشت کند');
  assert.strictEqual(snapshot.zero_ranking, true);

  console.log('  ✅ حفظ ۱۰۰٪ حریم خصوصی و ممانعت از نشت داده‌های فردی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
