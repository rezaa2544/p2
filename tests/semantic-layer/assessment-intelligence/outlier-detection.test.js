/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/outlier-detection.test.js
   -------------------------------------------------------------------
   P0-EI-03: Tukey's Fences & Grade Anomaly Detection Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { detectGradeAnomalies } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۴: کشف ناهنجاری‌ها و داده‌های پرت با حصارهای توکی (detectGradeAnomalies)');

  // سناریوی داده متمرکز با ۱ نمره پرت پایین
  const grades = [
    { student_id: 1, score: 2 }, // نمره پرت شدید
    { student_id: 2, score: 14 },
    { student_id: 3, score: 14.5 },
    { student_id: 4, score: 15 },
    { student_id: 5, score: 15.5 },
    { student_id: 6, score: 16 },
    { student_id: 7, score: 16.5 },
    { student_id: 8, score: 17 }
  ];

  const res = detectGradeAnomalies({ grades });
  assert.strictEqual(res.anomalies_detected, true);
  assert.strictEqual(res.outliers_count, 1);
  assert.strictEqual(res.outliers[0].student_id, 1);
  assert.strictEqual(res.outliers[0].type, 'LOW_OUTLIER');
  assert.ok(res.iqr > 0);
  assert.ok(res.lower_fence > 2);

  // سناریوی خوشه‌بندی غیرطبیعی حول نمره قبولی ۱۰ (Pass Threshold Spike)
  const spikedGrades = [
    { score: 5 }, { score: 7 },
    { score: 10 }, { score: 10 }, { score: 10 }, { score: 10 }, { score: 10.2 }, // تجمع بیش از ۳۵٪
    { score: 14 }, { score: 16 }, { score: 18 }
  ];
  const spikeRes = detectGradeAnomalies({ grades: spikedGrades });
  assert.strictEqual(spikeRes.anomalies_detected, true);
  assert.ok(spikeRes.clustering_anomalies.length > 0);
  assert.strictEqual(spikeRes.clustering_anomalies[0].type, 'PASS_THRESHOLD_SPIKE');

  console.log('  ✅ کشف نمرات پرت توکی (Tukey Fences) و هشدارهای خوشه‌بندی غیرطبیعی مرز قبولی');
}

if (require.main === module) run();
module.exports = { run };
