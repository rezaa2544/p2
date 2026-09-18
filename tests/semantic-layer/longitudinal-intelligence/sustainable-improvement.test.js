/**
 * آزمون سنجش دوام و پایداری بهبود آموزشی (calculateSustainableImprovement)
 */

'use strict';

const assert = require('assert');
const {
  calculateSustainableImprovement,
  PERSISTENCE_TYPES
} = require('../../../server/analytics/longitudinal-intelligence-monitoring');

function runTest() {
  console.log('▸ تست ۳: سنجش دوام و تفکیک بهبود پایدار از نوسان و جهش مقطعی (calculateSustainableImprovement)');

  // ۱. سناریوی بهبود پایدار واقعی (SUSTAINABLE_IMPROVEMENT)
  const sustainableSnapshots = [
    { period: '1404-T1', health_index: 65.0 }, // مبنا
    { period: '1404-T2', health_index: 70.0 }, // رشد
    { period: '1405-T1', health_index: 74.0 }, // رشد
    { period: '1405-T2', health_index: 78.0 }, // رشد
    { period: '1406-T1', health_index: 82.0 }  // رشد
  ];

  const resSust = calculateSustainableImprovement({
    snapshots: sustainableSnapshots,
    metric: 'health_index'
  });

  assert.strictEqual(resSust.is_sustainable, true);
  assert.strictEqual(resSust.classification, PERSISTENCE_TYPES.SUSTAINABLE_IMPROVEMENT);
  assert.strictEqual(resSust.persistence_score, 1.0); // ۴ از ۴ دوره بالاتر از مبنا

  // ۲. سناریوی جهش موقت (TEMPORARY_SPIKE)
  const spikeSnapshots = [
    { period: '1404-T1', health_index: 68.0 },
    { period: '1404-T2', health_index: 84.0 }, // جهش شدید ناگهانی
    { period: '1405-T1', health_index: 67.0 }, // سقوط فوری به سطح پیشین
    { period: '1405-T2', health_index: 68.5 }
  ];

  const resSpike = calculateSustainableImprovement({
    snapshots: spikeSnapshots,
    metric: 'health_index'
  });

  assert.strictEqual(resSpike.is_sustainable, false);
  assert.strictEqual(resSpike.classification, PERSISTENCE_TYPES.TEMPORARY_SPIKE);

  // ۳. سناریوی افت تدریجی و فرسایشی (GRADUAL_DECLINE)
  const declineSnapshots = [
    { period: '1404-T1', health_index: 80.0 },
    { period: '1404-T2', health_index: 77.0 },
    { period: '1405-T1', health_index: 73.0 },
    { period: '1405-T2', health_index: 69.0 }
  ];

  const resDecline = calculateSustainableImprovement({
    snapshots: declineSnapshots,
    metric: 'health_index'
  });

  assert.strictEqual(resDecline.is_sustainable, false);
  assert.strictEqual(resDecline.classification, PERSISTENCE_TYPES.GRADUAL_DECLINE);

  // ۴. مقایسه مستقیم قبل و بعد دوره (Before & After Period)
  const prePostRes = calculateSustainableImprovement({
    beforePeriod: { value: 65.0 },
    afterPeriod: { value: 78.0 }
  });
  assert.strictEqual(prePostRes.is_sustainable, true);
  assert.strictEqual(prePostRes.delta, 13.0);

  console.log('  ✅ تفکیک قطعی پایداری تغییرات، محاسبه ضریب دوام و مهار سوگیری نوسانات مقطعی');
}

module.exports = { runTest };
if (require.main === module) runTest();
