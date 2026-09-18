/**
 * آزمون اصل عدم رتبه‌بندی خودکار معلمان (No Automated Ranking Guard)
 */

'use strict';

const assert = require('assert');
const { synthesizeTeacherGrowthProfile } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۷: آزمون تضمین عدم رتبه‌بندی و عدم مقایسه خطی معلمان (No-Ranking Guarantee)');

  // ایجاد نمایه برای دو معلم مختلف با سطوح متفاوت
  const teacherA = synthesizeTeacherGrowthProfile({
    teacherId: 101,
    schoolId: 15,
    evidencePortfolio: { school_id: 15, portfolio_completeness: 'EXEMPLARY', diversity_type_count: 4 },
    observationReview: { school_id: 15, mastery_level: 'ADVANCED' },
    pdTracker: { school_id: 15, pd_status: 'ACTIVE_LEARNER' }
  });

  const teacherB = synthesizeTeacherGrowthProfile({
    teacherId: 102,
    schoolId: 15,
    evidencePortfolio: { school_id: 15, portfolio_completeness: 'DEVELOPING', diversity_type_count: 1 },
    observationReview: { school_id: 15, mastery_level: 'DEVELOPING', priority_focus_dimension: 'formative_feedback' },
    pdTracker: { school_id: 15, pd_status: 'NEEDS_ENGAGEMENT' }
  });

  // ۱. عدم وجود فیلدهای رتبه
  assert.strictEqual(teacherA.is_ranked, false);
  assert.strictEqual(teacherA.ranking_score, null);
  assert.strictEqual(teacherB.is_ranked, false);
  assert.strictEqual(teacherB.ranking_score, null);

  assert.strictEqual('rank' in teacherA, false, 'rank property must not exist');
  assert.strictEqual('percentile' in teacherA, false, 'percentile property must not exist');
  assert.strictEqual('rank' in teacherB, false, 'rank property must not exist');
  assert.strictEqual('percentile' in teacherB, false, 'percentile property must not exist');

  // ۲. تأیید رویکرد بازخورد سازنده و عدم تنبیه
  assert.ok(
    teacherB.priority_growth_goals.some(g => g.includes('بازخورد')),
    'Constructive guidance must be provided instead of penalty'
  );

  console.log('  ✅ تضمین قطعی عدم رتبه‌بندی خطی، عدم تولید شاخص تحقیرآمیز و تکیه بر شایستگی');
}

module.exports = { runTest };
if (require.main === module) runTest();
