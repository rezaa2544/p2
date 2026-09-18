/**
 * آزمون چرخه حیات و ماشین وضعیت پرونده مداخله (Case Lifecycle & State Machine)
 */

'use strict';

const assert = require('assert');
const {
  createInterventionCase,
  planInterventionAction,
  transitionCaseStatus
} = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۳: چرخه حیات پرونده مداخله و تغییر وضعیت (Case Lifecycle & State Machine)');

  // ۱. ایجاد پرونده اولیه در وضعیت OPEN
  const initialCase = createInterventionCase({
    studentId: 301,
    schoolId: 10,
    triggerType: 'CRITICAL_ACADEMIC_DROP',
    priority: 'HIGH',
    baselineMetrics: { gpa: 9.0, attendance_rate: 85.0 },
    assignedRole: 'counselor',
    assignedToId: 405,
    creatorId: 1
  });

  assert.strictEqual(initialCase.status, 'OPEN');
  assert.strictEqual(initialCase.student_id, 301);
  assert.strictEqual(initialCase.history.length, 1);

  // ۲. تغییر وضعیت به UNDER_REVIEW
  const underReviewCase = transitionCaseStatus(initialCase, 'UNDER_REVIEW', {
    actorId: 405,
    actorRole: 'counselor',
    note: 'بررسی مصاحبه اولیه با دانش‌آموز'
  });
  assert.strictEqual(underReviewCase.status, 'UNDER_REVIEW');
  assert.strictEqual(underReviewCase.history.length, 2);

  // ۳. تدوین برنامه مداخله و ورود به INTERVENTION_ACTIVE
  const plannedCase = planInterventionAction({
    caseRecord: underReviewCase,
    strategyType: 'ACADEMIC_TUTORING',
    plannerId: 405,
    interventions: [
      { type: 'ACADEMIC_TUTORING', responsible_role: 'teacher', responsible_id: 501, description: 'کلاس تقویتی ریاضی' },
      { type: 'COUNSELING_SESSION', responsible_role: 'counselor', responsible_id: 405, description: 'مشاوره کاهش اضطراب امتحان' }
    ],
    reviewDeadline: '2026-10-18'
  });

  assert.strictEqual(plannedCase.status, 'INTERVENTION_ACTIVE');
  assert.strictEqual(plannedCase.action_plan.interventions.length, 2);
  assert.strictEqual(plannedCase.history.length, 3);

  // ۴. ورود به مرحله ارزشیابی EVALUATING
  const evaluatingCase = transitionCaseStatus(plannedCase, 'EVALUATING', {
    actorId: 405,
    actorRole: 'counselor',
    note: 'پایان دوره مداخله و شروع ارزیابی اثربخشی'
  });
  assert.strictEqual(evaluatingCase.status, 'EVALUATING');

  // ۵. خاتمه موفق پرونده RESOLVED
  const resolvedCase = transitionCaseStatus(evaluatingCase, 'RESOLVED', {
    actorId: 405,
    actorRole: 'counselor',
    note: 'ارتقای نمرات و رفع ریسک'
  });
  assert.strictEqual(resolvedCase.status, 'RESOLVED');

  // ۶. بررسی گارد جلوگیری از تغییر غیرمجاز وضعیت (Illegal State Transition)
  assert.throws(
    () => transitionCaseStatus(initialCase, 'RESOLVED', { actorId: 405, actorRole: 'counselor' }),
    /ILLEGAL_STATE_TRANSITION/,
    'Transition from OPEN directly to RESOLVED without evaluation or review must be blocked'
  );

  console.log('  ✅ صحت عملکرد ماشین وضعیت، ثبت تاریخچه و رعایت قوانین چرخه پرونده');
}

module.exports = { runTest };
if (require.main === module) runTest();
