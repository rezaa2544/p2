/**
 * آزمون ۱۱: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (Privacy Protection)
 */

'use strict';

const assert = require('assert');
const {
  evaluateOperationalOutcome,
  buildOutcomeEvaluationSnapshot
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۱۱: حفظ حریم خصوصی و عدم نشت اطلاعات فردی (privacy)');

  const mockTask = {
    task_id: 'TASK-SEC-01',
    decision_id: 'DEC-SEC-01',
    title: 'برنامه ارتقای تحصیلی',
    student_id: 887766, // نباید نشت کند
    national_id: '0098765432', // نباید نشت کند
    phone: '09123456789'
  };

  const outcome = evaluateOperationalOutcome({
    task: mockTask,
    baselineMetrics: { attendance_pct: 80, gpa: 14 },
    postMetrics: { attendance_pct: 85, gpa: 15 }
  });

  const snapshot = buildOutcomeEvaluationSnapshot({
    schoolId: 101,
    regionId: 1,
    evaluations: [outcome]
  });

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('887766'), 'شناسه دانش‌آموز نباید در شناسنامه ارزیابی پیامد نشت کند');
  assert.ok(!serialized.includes('0098765432'), 'کد ملی نباید در شناسنامه ارزیابی نشت کند');
  assert.ok(!serialized.includes('09123456789'), 'تلفن نباید در شناسنامه ارزیابی نشت کند');
  assert.strictEqual(snapshot.zero_ranking, true);

  console.log('  ✅ حفظ ۱۰۰٪ حریم خصوصی و ممانعت از نشت داده‌های فردی تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
