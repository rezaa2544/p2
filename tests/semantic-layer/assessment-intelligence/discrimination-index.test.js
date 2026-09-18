/* ═══════════════════════════════════════════════════════════════════
   tests/semantic-layer/assessment-intelligence/discrimination-index.test.js
   -------------------------------------------------------------------
   P0-EI-03: Discrimination Index (D-index) CTT 27% Rules Tests
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const assert = require('assert');
const { calculateDiscriminationIndex } = require('../../../server/analytics/assessment-intelligence');

function run() {
  console.log('▸ تست ۳: محاسبه شاخص تمایز آزمون بر مبنای ۲۷٪ بالا و پایین (Discrimination Index)');

  // سناریوی تمایز عالی (EXCELLENT >= 0.40)
  // ۱۰ دانش‌آموز: ۲۷٪ برابر با ۲ نفر اول و ۲ نفر آخر
  // گروه پایین: 2, 4 (میانگین 3)
  // گروه بالا: 18, 20 (میانگین 19)
  // D = (19 - 3) / 20 = 16 / 20 = 0.80 -> EXCELLENT
  const highDiscGrades = [
    { score: 2 }, { score: 4 }, { score: 7 }, { score: 9 }, { score: 10 },
    { score: 12 }, { score: 13 }, { score: 15 }, { score: 18 }, { score: 20 }
  ];
  const resHigh = calculateDiscriminationIndex({ grades: highDiscGrades });
  assert.strictEqual(resHigh.discrimination_index, 0.8);
  assert.strictEqual(resHigh.discrimination_quality, 'EXCELLENT');
  assert.strictEqual(resHigh.top_group_size, 2);
  assert.strictEqual(resHigh.bottom_group_size, 2);

  // سناریوی تمایز ضعیف (POOR < 0.20)
  // نمرات یکنواخت و نزدیک به هم: 14 تا 16
  const poorDiscGrades = [
    { score: 14 }, { score: 14.5 }, { score: 15 }, { score: 15 }, { score: 15.5 },
    { score: 15.5 }, { score: 16 }, { score: 16 }, { score: 16.5 }, { score: 16.5 }
  ];
  const resPoor = calculateDiscriminationIndex({ grades: poorDiscGrades });
  assert.ok(resPoor.discrimination_index < 0.20);
  assert.strictEqual(resPoor.discrimination_quality, 'POOR');

  // سناریوی کمبود حجم نمونه (< ۴ نفر)
  const smallGrades = [{ score: 10 }, { score: 15 }];
  const resSmall = calculateDiscriminationIndex({ grades: smallGrades });
  assert.strictEqual(resSmall.discrimination_index, null);
  assert.strictEqual(resSmall.discrimination_quality, 'INSUFFICIENT_SAMPLE');

  console.log('  ✅ تفکیک دقیق سطوح کیفی شاخص تمایز و رفتار ایمن در حجم نمونه کم');
}

if (require.main === module) run();
module.exports = { run };
