/**
 * آزمون تحلیل جبری روندهای آموزشی (calculateEducationalTrends)
 */

'use strict';

const assert = require('assert');
const {
  calculateEducationalTrends,
  TREND_DIRECTIONS
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۱: تحلیل جبری و شیب روندهای زمانی آموزشی (calculateEducationalTrends)');

  // ۱. روند صعودی شاخص سلامت (IMPROVING)
  const improvingSnapshots = [
    { period: '1404-T1', health_index: 70.0 },
    { period: '1404-T2', health_index: 72.5 },
    { period: '1405-T1', health_index: 76.0 },
    { period: '1405-T2', health_index: 79.5 },
    { period: '1406-T1', health_index: 84.0 }
  ];

  const trendImp = calculateEducationalTrends({
    snapshots: improvingSnapshots,
    metric: 'health_index',
    periodRange: '1404-1406'
  });

  assert.strictEqual(trendImp.direction, TREND_DIRECTIONS.IMPROVING);
  assert.ok(trendImp.slope > 0, 'Slope should be positive');
  assert.strictEqual(trendImp.sample_count, 5);
  assert.strictEqual(trendImp.start_value, 70.0);
  assert.strictEqual(trendImp.end_value, 84.0);
  assert.strictEqual(trendImp.delta, 14.0);

  // ۲. روند نزولی شاخص سلامت (DECLINING)
  const decliningSnapshots = [
    { period: '1404-T1', health_index: 85.0 },
    { period: '1404-T2', health_index: 80.0 },
    { period: '1405-T1', health_index: 74.0 },
    { period: '1405-T2', health_index: 68.0 }
  ];

  const trendDec = calculateEducationalTrends({
    snapshots: decliningSnapshots,
    metric: 'health_index'
  });

  assert.strictEqual(trendDec.direction, TREND_DIRECTIONS.DECLINING);
  assert.ok(trendDec.slope < 0, 'Slope should be negative');
  assert.strictEqual(trendDec.delta, -17.0);

  // ۳. روند پایدار و با نوسان اندک (STABLE)
  const stableSnapshots = [
    { period: '1404-T1', health_index: 75.0 },
    { period: '1404-T2', health_index: 75.2 },
    { period: '1405-T1', health_index: 74.9 },
    { period: '1405-T2', health_index: 75.1 }
  ];

  const trendStb = calculateEducationalTrends({
    snapshots: stableSnapshots,
    metric: 'health_index'
  });

  assert.strictEqual(trendStb.direction, TREND_DIRECTIONS.STABLE);

  // ۴. شاخص معکوس: نرخ غیبت مزمن (کاهش شیب یعنی بهبود)
  const chronicSnapshots = [
    { period: '1404-T1', chronic_absence_rate: 15.0 },
    { period: '1404-T2', chronic_absence_rate: 12.0 },
    { period: '1405-T1', chronic_absence_rate: 9.0 },
    { period: '1405-T2', chronic_absence_rate: 6.0 }
  ];

  const chronicTrend = calculateEducationalTrends({
    snapshots: chronicSnapshots,
    metric: 'chronic_absence_rate'
  });

  assert.strictEqual(chronicTrend.is_inverted, true);
  assert.strictEqual(chronicTrend.direction, TREND_DIRECTIONS.IMPROVING, 'Declining chronic absence rate means IMPROVING');

  console.log('  ✅ صحت محاسبه شیب رگرسیون، جهت روند و پشتیبانی از شاخص‌های معکوس');
}

module.exports = { runTest };
if (require.main === module) runTest();
