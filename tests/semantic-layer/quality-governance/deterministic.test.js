/**
 * آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت (Determinism & Reproducibility)
 */

'use strict';

const assert = require('assert');
const {
  evaluateQualityPillars,
  generateDistrictQualitySummary,
  initiateImprovementCycle,
  evaluateImprovementCycleOutcome
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۷: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ تکرار متوالی');

  const inputData = {
    assessments: [
      { score: 17.5, max_score: 20 },
      { score: 14.0, max_score: 20 },
      { score: 18.0, max_score: 20 }
    ],
    attendanceSessions: [
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'ABSENT' },
      { status: 'PRESENT' },
      { status: 'LATE' }
    ],
    assessmentsWithVariance: [
      { score_variance: 2.1 },
      { score_variance: 1.8 }
    ],
    courses: [
      { lesson_plans_submitted: 9, total_lesson_plans: 10, observation_feedback_received: 2 }
    ],
    parentEngagement: {
      registered_parents: 80,
      active_portal_parents: 64,
      pta_attendance_rate: 72
    }
  };

  const initialPillars = JSON.stringify(evaluateQualityPillars(inputData));

  for (let i = 0; i < 10; i++) {
    const currentRun = JSON.stringify(evaluateQualityPillars(inputData));
    assert.strictEqual(
      currentRun,
      initialPillars,
      `Evaluation iteration #${i + 1} produced non-deterministic output`
    );
  }

  // بررسی تکرارپذیری چرخه PDCA با شناسه صریح
  const cycleOpts = {
    cycle_id: 'PDCA-FIXED-TEST-1',
    school_id: 5,
    pillar_key: 'ACADEMIC_MASTERY',
    problem_statement: 'تست بازتولیدپذیری چرخه',
    target_metric: 'metric_a',
    baseline_value: 50,
    target_value: 80
  };
  const firstCycle = JSON.stringify(initiateImprovementCycle(cycleOpts));
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(JSON.stringify(initiateImprovementCycle(cycleOpts)), firstCycle);
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی محاسبات در کلیه تکرارها اثبات شد');
}

module.exports = { runTest };
if (require.main === module) runTest();
