/**
 * آزمون سنتز کارنامه جامع رشد و توانمندسازی معلم (synthesizeTeacherGrowthProfile)
 */

'use strict';

const assert = require('assert');
const { synthesizeTeacherGrowthProfile } = require('../../../server/analytics/teacher-evidence');

function runTest() {
  console.log('▸ تست ۶: سنتز کارنامه جامع رشد و توانمندسازی معلم (synthesizeTeacherGrowthProfile)');

  const profile = synthesizeTeacherGrowthProfile({
    teacherId: 105,
    schoolId: 12,
    workloadProfile: {
      school_id: 12,
      workload_intensity: 'BALANCED'
    },
    evidencePortfolio: {
      school_id: 12,
      portfolio_completeness: 'PROFICIENT',
      diversity_type_count: 3
    },
    observationReview: {
      school_id: 12,
      mastery_level: 'ADVANCED',
      priority_focus_dimension: 'learner_engagement'
    },
    pdTracker: {
      school_id: 12,
      pd_status: 'ACTIVE_LEARNER'
    },
    consistencyProfile: {
      consistency_status: 'CONSISTENT'
    }
  });

  assert.strictEqual(profile.teacher_id, 105);
  assert.strictEqual(profile.school_id, 12);
  assert.strictEqual(profile.is_ranked, false, 'Profile must explicitly guarantee no ranking');
  assert.strictEqual(profile.ranking_score, null, 'Profile must have zero ranking score');
  assert.strictEqual(profile.workload_status, 'BALANCED');
  assert.strictEqual(profile.evidence_completeness, 'PROFICIENT');
  assert.strictEqual(profile.observation_mastery, 'ADVANCED');
  assert.strictEqual(profile.pd_engagement, 'ACTIVE_LEARNER');
  assert.strictEqual(profile.growth_trajectory, 'ADVANCING');
  assert.ok(profile.strength_areas.length >= 2, 'Should extract strengths');
  assert.ok(Array.isArray(profile.priority_growth_goals), 'Should extract constructive growth goals');

  console.log('  ✅ سنتز کارآمد کارنامه رشد بدون رتبه‌بندی و تمرکز بر هدایت توانمندسازی');
}

module.exports = { runTest };
if (require.main === module) runTest();
