/**
 * تست رعایت ۱۰۰٪ اصل حاکمیت تصمیم انسانی در بازیابی پس از بحران (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const {
  buildDisasterRecoveryHealthSnapshot
} = require('../../../server/infrastructure/disaster-recovery');

function runHumanSovereigntyTests() {
  console.log('▸ تست ۶: پاسداری از حاکمیت تصمیم انسانی در DR و بازیابی بحران (human-sovereignty)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildDisasterRecoveryHealthSnapshot({ schoolId: 101, regionId: 1, user });

  // ۱. ارزیابی انطباق حاکمیتی در شناسنامه سلامت DR
  const gov = snapshot.governance_and_invariants.human_decision_sovereignty;
  assert.strictEqual(gov.automated_decision, false);
  assert.strictEqual(gov.automated_execution, false);
  assert.strictEqual(gov.requires_human_approval, true);
  assert.strictEqual(gov.enforced, true);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در بازیابی پس از بحران تایید شد');
}

if (require.main === module) {
  runHumanSovereigntyTests();
}

module.exports = { runHumanSovereigntyTests };
