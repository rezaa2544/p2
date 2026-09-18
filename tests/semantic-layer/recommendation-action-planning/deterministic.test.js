/**
 * آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  generateActionRecommendations,
  generatePrincipalActionBoard
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۸: آزمون قطعیت جبری ۱۰۰٪ و بازتولیدپذیری بیت‌به‌بیت در ۱۰ تکرار متوالی');

  const snapshot = {
    attendance_rate: 81.5,
    chronic_absence_rate: 14.0,
    average_gpa: 11.8,
    failing_students_ratio: 0.11,
    overloaded_teachers_count: 1
  };

  const fixedOptions = { now: '2026-09-18T10:00:00.000Z', deadline: '2026-10-15' };

  const firstRecs = JSON.stringify(generateActionRecommendations({
    schoolId: 10,
    schoolSnapshot: snapshot
  }, fixedOptions));

  for (let i = 0; i < 10; i++) {
    const nextRecs = JSON.stringify(generateActionRecommendations({
      schoolId: 10,
      schoolSnapshot: snapshot
    }, fixedOptions));

    assert.strictEqual(
      nextRecs,
      firstRecs,
      `Iteration #${i + 1} produced non-deterministic recommendations output`
    );
  }

  // بررسی تابلوی اقدامات
  const recs = JSON.parse(firstRecs);
  const firstBoard = JSON.stringify(generatePrincipalActionBoard({
    schoolId: 10,
    recommendations: recs
  }, fixedOptions));

  for (let i = 0; i < 10; i++) {
    const nextBoard = JSON.stringify(generatePrincipalActionBoard({
      schoolId: 10,
      recommendations: recs
    }, fixedOptions));

    assert.strictEqual(
      nextBoard,
      firstBoard,
      `Iteration #${i + 1} produced non-deterministic action board output`
    );
  }

  console.log('  ✅ قطعیت جبری ۱۰۰٪ و برابری باینری تمامی توابع در کلیه تکرارها اثبات گردید');
}

module.exports = { runTest };
if (require.main === module) runTest();
