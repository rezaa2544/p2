/**
 * آزمون ایمنی در برابر جهش داده‌ها (Object.freeze Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  evaluateEarlyWarningRules,
  createInterventionCase,
  planInterventionAction,
  transitionCaseStatus,
  evaluateInterventionOutcome,
  summarizeSchoolInterventions
} = require('../../../server/analytics/intervention-case-management');

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function runTest() {
  console.log('▸ تست ۸: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenStudent = deepFreeze({
    studentId: 701,
    schoolId: 10,
    currentGpa: 8.5,
    previousGpa: 14.0,
    recentAttendanceRate: 82.0,
    consecutiveAbsences: 3
  });

  const frozenCase = deepFreeze({
    case_id: 'CASE-10-701',
    student_id: 701,
    school_id: 10,
    trigger_type: 'DROPOUT_RISK_COMPOUND',
    priority: 'CRITICAL',
    status: 'OPEN',
    baseline_metrics: { gpa: 8.5, attendance_rate: 82.0 },
    history: [{ status: 'OPEN', timestamp: '2026-09-18T10:00:00Z', updated_by: 1 }]
  });

  const frozenPlanParams = deepFreeze({
    caseRecord: frozenCase,
    strategyType: 'COMBINED',
    plannerId: 405,
    interventions: [{ type: 'COUNSELING_SESSION', responsible_id: 405 }]
  });

  const frozenPostMetrics = deepFreeze({
    gpa: 12.0,
    attendance_rate: 90.0
  });

  assert.doesNotThrow(() => {
    evaluateEarlyWarningRules(frozenStudent);
    createInterventionCase({
      studentId: frozenStudent.studentId,
      schoolId: frozenStudent.schoolId,
      triggerType: 'TEST',
      baselineMetrics: frozenStudent
    });
    const planned = planInterventionAction(frozenPlanParams);
    const underReview = transitionCaseStatus(frozenCase, 'UNDER_REVIEW', { actorId: 405, actorRole: 'counselor' });
    evaluateInterventionOutcome({ caseRecord: frozenCase, postMetrics: frozenPostMetrics });
    summarizeSchoolInterventions([frozenCase], { schoolId: 10 });
  }, 'All functions must execute safely with deeply frozen objects');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

module.exports = { runTest };
if (require.main === module) runTest();
