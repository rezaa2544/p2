/**
 * آزمون سنجش اثربخشی مداخله (Intervention Outcome Assessment)
 */

'use strict';

const assert = require('assert');
const { evaluateInterventionOutcome } = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۴: سنجش اثربخشی و مقایسه متغیرهای قبل و بعد مداخله (evaluateInterventionOutcome)');

  const mockCase = {
    case_id: 'CASE-10-501',
    student_id: 501,
    school_id: 10,
    baseline_metrics: {
      gpa: 8.5,
      attendance_rate: 75.0
    }
  };

  // ۱. مداخله بسیار اثربخش: ارتقای چشمگیر معدل و حضور
  const highlyEffective = evaluateInterventionOutcome({
    caseRecord: mockCase,
    postMetrics: {
      gpa: 13.5, // Delta = +5.0
      attendance_rate: 92.0 // Delta = +17.0
    },
    evaluatorId: 405,
    evaluatorRole: 'counselor'
  });

  assert.strictEqual(highlyEffective.delta_gpa, 5.0);
  assert.strictEqual(highlyEffective.delta_attendance_rate, 17.0);
  assert.strictEqual(highlyEffective.efficacy_level, 'HIGHLY_EFFECTIVE');
  assert.strictEqual(highlyEffective.recommendation, 'CLOSURE');

  // ۲. مداخله نسبتاً اثربخش: روند مثبت ولی ناکافی
  const partiallyEffective = evaluateInterventionOutcome({
    caseRecord: mockCase,
    postMetrics: {
      gpa: 9.5, // Delta = +1.0
      attendance_rate: 78.0 // Delta = +3.0
    },
    evaluatorId: 405
  });

  assert.strictEqual(partiallyEffective.efficacy_level, 'PARTIALLY_EFFECTIVE');
  assert.strictEqual(partiallyEffective.recommendation, 'CONTINUE_INTERVENTION');

  // ۳. مداخله ناموفق و نیازمند ارجاع (Escalation)
  const escalatedOutcome = evaluateInterventionOutcome({
    caseRecord: mockCase,
    postMetrics: {
      gpa: 6.0, // Delta = -2.5
      attendance_rate: 60.0 // Delta = -15.0
    },
    evaluatorId: 405
  });

  assert.strictEqual(escalatedOutcome.efficacy_level, 'REQUIRES_ESCALATION');
  assert.strictEqual(escalatedOutcome.recommendation, 'ESCALATE');

  console.log('  ✅ صحت ارزیابی دلتای نمرات، نرخ حضور، و طبقه‌بندی اثربخشی مداخله');
}

module.exports = { runTest };
if (require.main === module) runTest();
