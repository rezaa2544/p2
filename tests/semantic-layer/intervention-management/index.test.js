/**
 * سوئیت جامع آزمون‌های مدیریت پرونده‌های مداخله زودهنگام (P0-EI-08)
 */

'use strict';

const accessGuardTest = require('./access-guard.test');
const earlyWarningTest = require('./early-warning.test');
const caseLifecycleTest = require('./case-lifecycle.test');
const outcomeAssessmentTest = require('./outcome-assessment.test');
const schoolSummaryTest = require('./school-summary.test');
const humanInTheLoopTest = require('./human-in-the-loop.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-08: Intervention Case Management Comprehensive Suite       ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  accessGuardTest.runTest();
  earlyWarningTest.runTest();
  caseLifecycleTest.runTest();
  outcomeAssessmentTest.runTest();
  schoolSummaryTest.runTest();
  humanInTheLoopTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n✅ تمامی ۹ سوئیت آزمون مدیریت پرونده‌های مداخله با موفقیت پاس شدند.');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
