/**
 * tests/semantic-layer/learning-trend.test.js
 * تست‌های واحد روند پیشرفت یادگیری
 */
'use strict';

const assert = require('assert');
const { calculateLearningProgressTrend } = require('../../server/analytics/semantic.js');

let pass = 0;
let fail = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    pass++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    fail++;
  }
}

console.log('▸ تست‌های محاسباتی روند پیشرفت یادگیری (Learning Progress Trend)');

test('تشخیص روند مثبت و رو به بهبود (IMPROVING)', () => {
  // جلسات ۱ تا ۴ با نمرات: 12, 14, 16, 18 (شیب = +2.0)
  const records = [
    { score: 12, date: '2026-10-01' },
    { score: 14, date: '2026-10-15' },
    { score: 16, date: '2026-11-01' },
    { score: 18, date: '2026-11-15' }
  ];

  const res = calculateLearningProgressTrend(records);
  assert.strictEqual(res.direction, 'IMPROVING');
  assert.strictEqual(res.slope, 2.0);
  assert.strictEqual(res.r_squared, 1.0);
  assert.strictEqual(res.net_change, 6.0);
});

test('تشخیص روند منفی و افت نمرات (DECLINING)', () => {
  // جلسات ۱ تا ۴ با نمرات: 18, 16, 14, 11 (شیب منفی)
  const records = [
    { score: 18, date: '2026-10-01' },
    { score: 16, date: '2026-10-15' },
    { score: 14, date: '2026-11-01' },
    { score: 11, date: '2026-11-15' }
  ];

  const res = calculateLearningProgressTrend(records);
  assert.strictEqual(res.direction, 'DECLINING');
  assert(res.slope < -1.0);
  assert(res.net_change < 0);
});

test('تشخیص روند پایدار و ثابت (STABLE)', () => {
  // جلسات با نوسان بسیار اندک: 15, 15.2, 14.9, 15.1
  const records = [
    { score: 15.0, date: '2026-10-01' },
    { score: 15.2, date: '2026-10-15' },
    { score: 14.9, date: '2026-11-01' },
    { score: 15.1, date: '2026-11-15' }
  ];

  const res = calculateLearningProgressTrend(records);
  assert.strictEqual(res.direction, 'STABLE');
  assert(Math.abs(res.slope) < 0.25);
});

test('کف مشاهدات: کمتر از ۳ جلسه برچسب INSUFFICIENT_DATA می‌دهد', () => {
  const records = [
    { score: 15, date: '2026-10-01' },
    { score: 16, date: '2026-10-15' }
  ];

  const res = calculateLearningProgressTrend(records);
  assert.strictEqual(res.direction, 'INSUFFICIENT_DATA');
  assert.strictEqual(res.slope, null);
});

if (fail > 0) process.exit(1);
