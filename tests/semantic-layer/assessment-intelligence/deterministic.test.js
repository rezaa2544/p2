/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/deterministic.test.js
   -------------------------------------------------------------------
   P0-EI-03: 100% Deterministic Bit-by-Bit Execution Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  analyzeAssessmentQuality,
  calculateDiscriminationIndex,
  detectGradeAnomalies,
  calculateAssessmentFairness,
  calculateTeacherAssessmentProfile,
  generateAssessmentInsights
} = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۷: آزمون قطعیت محاسبات (Deterministic 10-Execution Integrity)');

  const grades = [
    { id: 1, student_id: 1, teacher_id: 200, class_id: 101, score: 6, max_score: 20 },
    { id: 2, student_id: 2, teacher_id: 200, class_id: 101, score: 9, max_score: 20 },
    { id: 3, student_id: 3, teacher_id: 200, class_id: 101, score: 10, max_score: 20 },
    { id: 4, student_id: 4, teacher_id: 200, class_id: 101, score: 12, max_score: 20 },
    { id: 5, student_id: 5, teacher_id: 200, class_id: 101, score: 15, max_score: 20 },
    { id: 6, student_id: 6, teacher_id: 200, class_id: 101, score: 18, max_score: 20 }
  ];
  const exam = { id: 50, school_id: 10, max_score: 20 };

  const baselineQuality = JSON.stringify(analyzeAssessmentQuality({ exam, grades }));
  const baselineDisc = JSON.stringify(calculateDiscriminationIndex({ grades }));
  const baselineAnom = JSON.stringify(detectGradeAnomalies({ grades }));
  const baselineFair = JSON.stringify(calculateAssessmentFairness({ grades }));
  const baselineTeacher = JSON.stringify(calculateTeacherAssessmentProfile({ teacherId: 200, grades }));

  for (let i = 1; i <= 10; i++) {
    const curQuality = JSON.stringify(analyzeAssessmentQuality({ exam, grades }));
    const curDisc = JSON.stringify(calculateDiscriminationIndex({ grades }));
    const curAnom = JSON.stringify(detectGradeAnomalies({ grades }));
    const curFair = JSON.stringify(calculateAssessmentFairness({ grades }));
    const curTeacher = JSON.stringify(calculateTeacherAssessmentProfile({ teacherId: 200, grades }));

    assert.strictEqual(curQuality, baselineQuality, `تطابق بیت‌به‌بیت کیفیت آزمون در تکرار ${i}`);
    assert.strictEqual(curDisc, baselineDisc, `تطابق بیت‌به‌بیت تمایز در تکرار ${i}`);
    assert.strictEqual(curAnom, baselineAnom, `تطابق بیت‌به‌بیت ناهنجاری در تکرار ${i}`);
    assert.strictEqual(curFair, baselineFair, `تطابق بیت‌به‌بیت عدالت در تکرار ${i}`);
    assert.strictEqual(curTeacher, baselineTeacher, `تطابق بیت‌به‌بیت پروفایل معلم در تکرار ${i}`);
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

if (require.main === module) run();
module.exports = { run };
