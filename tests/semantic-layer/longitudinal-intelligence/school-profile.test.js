/**
 * آزمون ساخت پرونده طولی تاریخی مدرسه بدون رتبه‌بندی (buildLongitudinalSchoolProfile)
 */

'use strict';

const assert = require('assert');
const {
  buildLongitudinalSchoolProfile,
  TREND_DIRECTIONS
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۵: ساخت پرونده تاریخی و طولی مدرسه (buildLongitudinalSchoolProfile)');

  const snapshots = [
    {
      period: '1404-T1',
      health_index: 70.0,
      academic_metrics: { average_gpa: 15.0 },
      attendance_metrics: { calendar_rate: 88.0, chronic_absence_rate: 12.0 }
    },
    {
      period: '1404-T2',
      health_index: 72.0,
      academic_metrics: { average_gpa: 15.3 },
      attendance_metrics: { calendar_rate: 89.0, chronic_absence_rate: 10.5 }
    },
    {
      period: '1405-T1',
      health_index: 75.0,
      academic_metrics: { average_gpa: 15.8 },
      attendance_metrics: { calendar_rate: 91.0, chronic_absence_rate: 8.5 }
    },
    {
      period: '1405-T2',
      health_index: 79.0,
      academic_metrics: { average_gpa: 16.5 },
      attendance_metrics: { calendar_rate: 93.0, chronic_absence_rate: 6.0 }
    }
  ];

  const profile = buildLongitudinalSchoolProfile({
    schoolId: 10,
    snapshots,
    periodRange: '1404-1405'
  });

  assert.strictEqual(profile.school_id, 10);
  assert.strictEqual(profile.total_periods, 4);
  assert.strictEqual(profile.overall_trend, TREND_DIRECTIONS.IMPROVING);
  assert.ok(profile.trends_by_metric.health_index);
  assert.ok(profile.trends_by_metric.academic_gpa);
  assert.ok(profile.trends_by_metric.attendance_rate);
  assert.ok(profile.trends_by_metric.chronic_absence_rate);

  // بررسی عدم رتبه‌بندی
  assert.strictEqual(profile.zero_ranking_policy_enforced, true);
  assert.strictEqual(profile.is_ranked, false);
  assert.strictEqual(profile.ranking_score, null);
  assert.strictEqual(profile.league_table, null);

  console.log('  ✅ صحت ساخت شناسنامه طولی مدرسه با ارزیابی چندبُعدی و پایبندی به منع رتبه‌بندی');
}

module.exports = { runTest };
if (require.main === module) runTest();
