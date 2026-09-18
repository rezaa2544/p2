/**
 * تست رعایت ۱۰۰٪ اصل حاکمیت تصمیم انسانی در استقرار پایلوت (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  buildPilotDeploymentHealthSnapshot
} = require('../../../server/deployment/pilot-traffic-management');

function runHumanSovereigntyTests() {
  console.log('▸ تست ۶: پاسداری از حاکمیت تصمیم انسانی در استقرار پایلوت و رول‌بک (human-sovereignty)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildPilotDeploymentHealthSnapshot({ schoolId: 101, regionId: 1, user });

  // ۱. ارزیابی انطباق حاکمیتی در شناسنامه سلامت استقرار
  const gov = snapshot.governance_and_invariants.human_decision_sovereignty;
  assert.strictEqual(gov.automated_decision, false);
  assert.strictEqual(gov.automated_execution, false);
  assert.strictEqual(gov.requires_human_approval, true);
  assert.strictEqual(gov.enforced, true);

  // ۲. ارزیابی پرچم‌های رول‌بک و استقرار
  assert.strictEqual(snapshot.human_approval_required, true);
  assert.strictEqual(snapshot.rollback.automated_execution, false);
  assert.strictEqual(snapshot.rollback.requires_human_approval, true);

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در استقرار پایلوت و رول‌بک تایید شد');
}

if (require.main === module) {
  runHumanSovereigntyTests();
}

module.exports = { runHumanSovereigntyTests };
