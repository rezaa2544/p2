/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/school-health-dashboard/mutation-safety.test.js
   -------------------------------------------------------------------
   P0-EI-05: Mutation Safety & Frozen Object Integrity Tests
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
  console.log('▸ تست ۷: ایمنی در برابر جهش داده‌ها و انجماد اشیا (Object.freeze Mutation Safety)');

  const frozenParams = Object.freeze({
    attendance: Object.freeze({ attendance_rate: 92, chronic_absence_rate: 5 }),
    assessment: Object.freeze({ reliability: 85, fairness_score: 90, quality_score: 80 }),
    progress: Object.freeze({ improving_ratio: 0.7, declining_ratio: 0.1 }),
    completion: Object.freeze({ pass_rate: 94, failure_rate: 3 })
  });

  const frozenStudents = Object.freeze([
    Object.freeze({ id: 1, school_id: 10 }),
    Object.freeze({ id: 2, school_id: 10 })
  ]);

  const frozenClasses = Object.freeze([
    Object.freeze({ id: 101, school_id: 10, grade_level: '10' })
  ]);

  const frozenGrades = Object.freeze([
    Object.freeze({ id: 1, school_id: 10, student_id: 1, class_id: 101, score: 17, max_score: 20 }),
    Object.freeze({ id: 2, school_id: 10, student_id: 2, class_id: 101, score: 14, max_score: 20 })
  ]);

  assert.doesNotThrow(() => {
    const health = calculateSchoolHealthIndex(frozenParams);
    const issues = detectSchoolCriticalIssues({ students: frozenStudents, grades: frozenGrades });
    const actions = generateDailyActionCenter({ issues });
    aggregateSchoolEducationalMetrics({
      school_id: 10,
      classes: frozenClasses,
      students: frozenStudents,
      grades: frozenGrades
    });
    generateExecutiveSummary({ schoolHealth: health, issues, actions });
  }, 'توابع داشبورد سلامت نباید هیچ مشخصه‌ای از ورودی‌های منجمد را دستکاری کنند');

  console.log('  ✅ پایداری کامل در برابر اشیای منجمد: تمامی ورودی‌ها بدون تغییر باقی ماندند');
}

if (require.main === module) run();
module.exports = { run };
