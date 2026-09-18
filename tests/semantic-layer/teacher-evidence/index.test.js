/**
 * سوئیت جامع آزمون‌های چارچوب شواهد تدریس و کیفیت‌بخشی معلمان (P0-EI-07)
 */

'use strict';

const teacherAccessGuardTest = require('./teacher-access-guard.test');
const workloadProfileTest = require('./workload-profile.test');
const evidencePortfolioTest = require('./evidence-portfolio.test');
const lessonObservationTest = require('./lesson-observation.test');
const professionalDevelopmentTest = require('./professional-development.test');
const growthSynthesisTest = require('./growth-synthesis.test');
const noRankingTest = require('./no-ranking.test');
const deterministicTest = require('./deterministic.test');
const mutationSafetyTest = require('./mutation-safety.test');
const tenantIsolationTest = require('./tenant-isolation.test');

function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  P0-EI-07: Teacher Evidence & Quality Framework Suite             ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  teacherAccessGuardTest.runTest();
  workloadProfileTest.runTest();
  evidencePortfolioTest.runTest();
  lessonObservationTest.runTest();
  professionalDevelopmentTest.runTest();
  growthSynthesisTest.runTest();
  noRankingTest.runTest();
  deterministicTest.runTest();
  mutationSafetyTest.runTest();
  tenantIsolationTest.runTest();

  console.log('\n✅ تمامی ۱۰ سوئیت آزمون چارچوب شواهد تدریس معلمان با موفقیت پاس شدند.');
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
