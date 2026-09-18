/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/deterministic.test.js
   -------------------------------------------------------------------
   P0-EI-05: Deterministic Execution Integrity (10 Runs Bit-Identical)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const {
  calculateSchoolHealthIndex,
  detectSchoolCriticalIssues,
  generateDailyActionCenter,
  aggregateSchoolEducationalMetrics,
  generateExecutiveSummary
} = require('../../../server/analytics/school-health-dashboard');

function run() {
  console.log('▸ تست ۶: آزمون قطعیت و بازتولیدپذیری بیت‌به‌بیت (Deterministic 10-Execution)');

  const mockParams = {
    attendance: { attendance_rate: 90, chronic_absence_rate: 12 },
    assessment: { reliability: 80, fairness_score: 85, quality_score: 75 },
    progress: { improving_ratio: 0.6, declining_ratio: 0.2 },
    completion: { pass_rate: 88, failure_rate: 8 }
  };

  const mockStudents = [{ id: 1, school_id: 10 }, { id: 2, school_id: 10 }];
  const mockClasses = [{ id: 101, school_id: 10, grade_level: '10' }];
  const mockGrades = [
    { id: 1, school_id: 10, student_id: 1, class_id: 101, score: 16, max_score: 20 },
    { id: 2, school_id: 10, student_id: 2, class_id: 101, score: 9, max_score: 20 }
  ];

  let baseH, baseI, baseA, baseM;

  for (let runIdx = 0; runIdx < 10; runIdx++) {
    const h = JSON.stringify(calculateSchoolHealthIndex(mockParams));
    const issues = detectSchoolCriticalIssues({ students: mockStudents, grades: mockGrades });
    const issStr = JSON.stringify(issues);
    const actStr = JSON.stringify(generateDailyActionCenter({ issues }));
    const aggStr = JSON.stringify(aggregateSchoolEducationalMetrics({
      school_id: 10,
      classes: mockClasses,
      students: mockStudents,
      grades: mockGrades
    }));

    if (runIdx === 0) {
      baseH = h;
      baseI = issStr;
      baseA = actStr;
      baseM = aggStr;
    } else {
      assert.strictEqual(h, baseH, `انحراف در اجرای ${runIdx} تابع calculateSchoolHealthIndex`);
      assert.strictEqual(issStr, baseI, `انحراف در اجرای ${runIdx} تابع detectSchoolCriticalIssues`);
      assert.strictEqual(actStr, baseA, `انحراف در اجرای ${runIdx} تابع generateDailyActionCenter`);
      assert.strictEqual(aggStr, baseM, `انحراف در اجرای ${runIdx} تابع aggregateSchoolEducationalMetrics`);
    }
  }

  console.log('  ✅ قطعیت ۱۰۰٪: ده اجرای متوالی تمامی توابع خروجی‌های بیت‌به‌بیت یکسان تولید کردند');
}

if (require.main === module) run();
module.exports = { run };
