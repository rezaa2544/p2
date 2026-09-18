/**
 * آزمون خلاصه راهبری کیفیت منطقه آموزشی (generateDistrictQualitySummary)
 */

'use strict';

const assert = require('assert');
const {
  generateDistrictQualitySummary,
  evaluateQualityPillars
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۵: خلاصه راهبری کیفیت منطقه‌ای بدون مقایسه رقابتی (generateDistrictQualitySummary)');

  const schoolA_Report = evaluateQualityPillars({
    assessments: [{ score: 18, max_score: 20 }],
    attendanceSessions: [{ status: 'PRESENT' }],
    parentEngagement: { registered_parents: 50, active_portal_parents: 45, pta_attendance_rate: 80 }
  });

  const schoolB_Report = evaluateQualityPillars({
    assessments: [{ score: 14, max_score: 20 }],
    attendanceSessions: [{ status: 'PRESENT' }, { status: 'PRESENT' }, { status: 'ABSENT' }],
    parentEngagement: { registered_parents: 50, active_portal_parents: 36, pta_attendance_rate: 70 }
  });

  const schoolC_Report = evaluateQualityPillars({
    assessments: [{ score: 7, max_score: 20 }],
    attendanceSessions: [{ status: 'ABSENT' }],
    parentEngagement: { registered_parents: 50, active_portal_parents: 10, pta_attendance_rate: 10 }
  });

  const districtSchools = [
    { school_id: 101, school_name: 'دبستان فردوسی', ...schoolA_Report },
    { school_id: 102, school_name: 'دبیرستان رازی', ...schoolB_Report },
    { school_id: 103, school_name: 'هنرستان کمال‌الملک', ...schoolC_Report }
  ];

  const summary = generateDistrictQualitySummary({
    region_id: 3,
    district_name: 'منطقه ۳ تهران',
    schools_data: districtSchools
  });

  assert.strictEqual(summary.region_id, 3);
  assert.strictEqual(summary.district_name, 'منطقه ۳ تهران');
  assert.strictEqual(summary.total_schools_evaluated, 3);
  assert.strictEqual(typeof summary.district_quality_index_mean, 'number');

  // بررسی توزیع وضعیت‌های کیفی
  assert.strictEqual(summary.status_distribution.EXEMPLARY, 1);
  assert.strictEqual(summary.status_distribution.STABLE_AND_COMPLIANT, 1);
  assert.strictEqual(summary.status_distribution.CRITICAL_ATTENTION_REQUIRED, 1);

  // بررسی عدم رتبه‌بندی
  assert.strictEqual(summary.zero_ranking_policy_enforced, true);
  assert.strictEqual(summary.is_ranked, false);
  assert.strictEqual(summary.ranking_score, null);
  assert.strictEqual(summary.league_table, null);

  console.log('  ✅ صحت تجمیع شاخص‌های منطقه‌ای و توزیع سطوح سلامت بدون رتبه‌بندی');
}

module.exports = { runTest };
if (require.main === module) runTest();
