/**
 * آزمون اصل نظارت و تأیید انسانی (Human-in-the-Loop Guard)
 */

'use strict';

const assert = require('assert');
const {
  planInterventionAction,
  transitionCaseStatus
} = require('../../../server/analytics/intervention-case-management');

function runTest() {
  console.log('▸ تست ۶: آزمون الزام نظارت و تصمیم‌گیری انسانی (Human-in-the-Loop Guard)');

  const mockCase = {
    case_id: 'CASE-10-901',
    student_id: 901,
    school_id: 10,
    status: 'UNDER_REVIEW',
    history: []
  };

  // ۱. تدوین برنامه مداخله بدون شناسه انسان مجاز: سقط با HUMAN_IN_THE_LOOP_REQUIRED
  assert.throws(
    () => planInterventionAction({
      caseRecord: mockCase,
      interventions: [{ type: 'COUNSELING_SESSION' }],
      plannerId: null // غیبت انسان تصمیم‌گیر
    }),
    /HUMAN_IN_THE_LOOP_REQUIRED/,
    'Intervention action plan must not be committed without an authorized human planner'
  );

  // ۲. تغییر وضعیت پرونده بدون عامل انسانی: سقط با HUMAN_IN_THE_LOOP_REQUIRED
  assert.throws(
    () => transitionCaseStatus(mockCase, 'INTERVENTION_ACTIVE', {
      actorId: null // بدون شناسه مسئول
    }),
    /HUMAN_IN_THE_LOOP_REQUIRED/,
    'State transitions must require an authorized human actor'
  );

  console.log('  ✅ تضمین قطعی نظارت انسانی و ممنوعیت تصمیم‌گیری خودکار بدون تأیید کادر مدرسه');
}

module.exports = { runTest };
if (require.main === module) runTest();
