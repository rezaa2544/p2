/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/fairness.test.js
   -------------------------------------------------------------------
   P0-EI-03: Assessment Fairness & Disparity Detection Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { calculateAssessmentFairness } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۵: ارزیابی عدالت و برابری سنجش (calculateAssessmentFairness)');

  // سناریو الف: آزمون عادلانه با عملکرد یکسان در کلاس‌های موازی
  const fairGrades = [
    { class_id: 101, score: 14 }, { class_id: 101, score: 15 }, { class_id: 101, score: 16 },
    { class_id: 102, score: 14.5 }, { class_id: 102, score: 15 }, { class_id: 102, score: 15.5 }
  ];
  const fairRes = calculateAssessmentFairness({ grades: fairGrades });
  assert.strictEqual(fairRes.fairness_rating, 'EXCELLENT');
  assert.strictEqual(fairRes.fairness_flags.length, 0);
  assert.ok(fairRes.fairness_score >= 85);

  // سناریو ب: شکاف شدید بین دو کلاس موازی (Class Disparity >= 3.0)
  // کلاس ۱۰۱ میانگین ۱۸ - کلاس ۱۰۲ میانگین ۱۲ (اختلاف ۶ نمره)
  const unfairGrades = [
    { class_id: 101, score: 17 }, { class_id: 101, score: 18 }, { class_id: 101, score: 19 },
    { class_id: 102, score: 11 }, { class_id: 102, score: 12 }, { class_id: 102, score: 13 }
  ];
  const unfairRes = calculateAssessmentFairness({ grades: unfairGrades });
  assert.ok(unfairRes.fairness_flags.some(f => f.type === 'CLASS_DISPARITY_ALERT'));
  assert.ok(unfairRes.fairness_score < 85);
  assert.strictEqual(unfairRes.class_parity.max_mean_gap, 6.0);

  // سناریو ج: شکاف جنسیتی
  const users = [
    { id: 1, gender: 'male' }, { id: 2, gender: 'male' }, { id: 3, gender: 'male' }, { id: 4, gender: 'male' },
    { id: 5, gender: 'female' }, { id: 6, gender: 'female' }, { id: 7, gender: 'female' }, { id: 8, gender: 'female' }
  ];
  const genderGrades = [
    { student_id: 1, score: 18 }, { student_id: 2, score: 19 }, { student_id: 3, score: 18 }, { student_id: 4, score: 19 }, // پسران میانگین 18.5
    { student_id: 5, score: 13 }, { student_id: 6, score: 14 }, { student_id: 7, score: 13 }, { student_id: 8, score: 14 }  // دختران میانگین 13.5 (اختلاف 5 نمره)
  ];
  const genderRes = calculateAssessmentFairness({ grades: genderGrades, users });
  assert.ok(genderRes.demographic_parity.evaluated, 'باید ارزیابی جمعیت‌شناختی انجام شود');
  assert.strictEqual(genderRes.demographic_parity.gender_gap, 5.0);
  assert.ok(genderRes.fairness_flags.some(f => f.type === 'DEMOGRAPHIC_DISPARITY_ALERT'));

  console.log('  ✅ شناسایی دقیق شکاف‌های بین‌کلاسی، برابری جنسیتی و محاسبه امتیاز عدالت');
}

if (require.main === module) run();
module.exports = { run };
