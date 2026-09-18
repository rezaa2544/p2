/**
 * آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution Integrity)
 */

'use strict';

const assert = require('assert');
const {
  evaluateEarlyWarningRules,
  createInterventionCase,
  planInterventionAction,
  evaluateInterventionOutcome,
  summarizeSchoolInterventions
} = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۷: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const fixedNow = '2026-09-18T10:00:00.000Z';
  const studentPayload = {
    studentId: 701,
    schoolId: 10,
    currentGpa: 8.5,
    previousGpa: 14.0,
    recentAttendanceRate: 82.0,
    consecutiveAbsences: 3
  };

  let baseWarning, baseCase, basePlan, baseOutcome, baseSummary;

  for (let i = 0; i < 10; i++) {
    const warning = evaluateEarlyWarningRules(studentPayload);
    const newCase = createInterventionCase({
      caseId: 'CASE-10-701-FIXED',
      studentId: studentPayload.studentId,
      schoolId: studentPayload.schoolId,
      triggerType: warning.alerts[0].trigger_type,
      priority: warning.alerts[0].priority,
      baselineMetrics: { gpa: studentPayload.currentGpa, attendance_rate: studentPayload.recentAttendanceRate },
      assignedRole: 'counselor',
      assignedToId: 405,
      creatorId: 1
    }, { now: fixedNow });

    const planned = planInterventionAction({
      caseRecord: newCase,
      strategyType: 'COMBINED',
      plannerId: 405,
      interventions: [{ type: 'COUNSELING_SESSION', responsible_id: 405 }],
      reviewDeadline: '2026-10-18'
    }, { now: fixedNow });

    const outcome = evaluateInterventionOutcome({
      caseRecord: planned,
      postMetrics: { gpa: 12.0, attendance_rate: 90.0 },
      evaluatorId: 405
    }, { now: fixedNow });

    const summary = summarizeSchoolInterventions([planned], { schoolId: 10 });

    const sWarning = JSON.stringify(warning);
    const sCase = JSON.stringify(newCase);
    const sPlan = JSON.stringify(planned);
    const sOutcome = JSON.stringify(outcome);
    const sSummary = JSON.stringify(summary);

    if (i === 0) {
      baseWarning = sWarning;
      baseCase = sCase;
      basePlan = sPlan;
      baseOutcome = sOutcome;
      baseSummary = sSummary;
    } else {
      assert.strictEqual(sWarning, baseWarning, `Early warning mismatch at ${i}`);
      assert.strictEqual(sCase, baseCase, `Case creation mismatch at ${i}`);
      assert.strictEqual(sPlan, basePlan, `Action planning mismatch at ${i}`);
      assert.strictEqual(sOutcome, baseOutcome, `Outcome evaluation mismatch at ${i}`);
      assert.strictEqual(sSummary, baseSummary, `Summary mismatch at ${i}`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

module.exports = { runTest };
if (require.main === module) runTest();
