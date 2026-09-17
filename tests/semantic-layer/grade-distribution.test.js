/**
 * tests/semantic-layer/grade-distribution.test.js
 * تست‌های واحد توزیع آماری نمرات
 */
'use strict';

const assert = require('assert');
const { calculateGradeDistribution } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های محاسباتی توزیع آماری نمرات (Grade Distribution)');

test('محاسبه دقیق میانگین، میانه، انحراف معیار و چارک‌ها', () => {
  // ۵ نمره: 10, 12, 14, 16, 18
  // مجموع = 70, میانگین = 14.0
  // میانه = 14.0
  // Q1 = 12.0, Q3 = 16.0, IQR = 4.0
  const records = [
    { score: 10, max_score: 20, school_id: 1 },
    { score: 12, max_score: 20, school_id: 1 },
    { score: 14, max_score: 20, school_id: 1 },
    { score: 16, max_score: 20, school_id: 1 },
    { score: 18, max_score: 20, school_id: 1 }
  ];

  const res = calculateGradeDistribution(records, { expectedSchoolId: 1 });
  assert.strictEqual(res.count, 5);
  assert.strictEqual(res.mean, 14.0);
  assert.strictEqual(res.median, 14.0);
  assert.strictEqual(res.min, 10.0);
  assert.strictEqual(res.max, 18.0);
  assert.strictEqual(res.quartiles.q1, 12.0);
  assert.strictEqual(res.quartiles.q3, 16.0);
  assert.strictEqual(res.quartiles.iqr, 4.0);
  assert.strictEqual(res.std_dev, 2.83); // sqrt(40 / 5) = sqrt(8) ≈ 2.828
});

test('نرمال‌سازی مقیاس‌های غیر ۲۰ به مقیاس ۲۰', () => {
  const records = [
    { score: 5, max_score: 10, school_id: 1 }, // معادل 10 از 20
    { score: 50, max_score: 100, school_id: 1 } // معادل 10 از 20
  ];

  const res = calculateGradeDistribution(records);
  assert.strictEqual(res.count, 2);
  assert.strictEqual(res.mean, 10.0);
  assert.strictEqual(res.median, 10.0);
});

test('پشتیبانی از ارقام فارسی در نمره («۱۷٫۵»)', () => {
  const records = [
    { score: '۱۷٫۵', max_score: 20 },
    { score: '۱۸٫۵', max_score: 20 }
  ];

  const res = calculateGradeDistribution(records);
  assert.strictEqual(res.count, 2);
  assert.strictEqual(res.mean, 18.0);
});

test('فیلتر نمرات نامعتبر و پرت (منفی یا بیشتر از سقف)', () => {
  const records = [
    { score: 15, max_score: 20 },
    { score: -2, max_score: 20 }, // نامعتبر
    { score: 25, max_score: 20 }, // نامعتبر
    { score: 'نامشخص', max_score: 20 } // نامعتبر
  ];

  const res = calculateGradeDistribution(records);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.invalid_count, 3);
  assert.strictEqual(res.mean, 15.0);
  assert.strictEqual(res.data_quality.status, 'PARTIAL_DATA');
});

test('تطابق دسته‌بندی باکت‌های هیستوگرام و ارزیابی توصیفی آموزش و پرورش', () => {
  const records = [
    { score: 8 },  // مردود / نیاز به تلاش
    { score: 12 }, // متوسط / قابل قبول
    { score: 16 }, // خوب
    { score: 19 }  // خیلی خوب / عالی
  ];

  const res = calculateGradeDistribution(records);
  assert.strictEqual(res.histogram.failed, 1);
  assert.strictEqual(res.histogram.acceptable, 1);
  assert.strictEqual(res.histogram.good, 1);
  assert.strictEqual(res.histogram.excellent, 1);

  assert.strictEqual(res.qualitative_counts.needs_effort, 1);
  assert.strictEqual(res.qualitative_counts.acceptable, 1);
  assert.strictEqual(res.qualitative_counts.good, 1);
  assert.strictEqual(res.qualitative_counts.excellent, 1);
});

if (fail > 0) process.exit(1);
