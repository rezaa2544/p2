/**
 * tests/semantic-layer/assessment-semantics.test.js
 * تست‌های واحد کیفیت و دشواری سنجش
 */
'use strict';

const assert = require('assert');
const { evaluateAssessmentSemantics } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های محاسباتی کیفیت و دشواری سنجش (Assessment Quality)');

test('محاسبه ضریب دشواری متعادل (BALANCED) و ضریب تمایز', () => {
  // ۱۰ دانش‌آموز با نمرات از ضعیف تا قوی:
  // 6, 8, 10, 12, 14, 15, 16, 17, 18, 20
  // میانگین = 13.6 -> ضریب دشواری = 13.6 / 20 = 0.68 -> BALANCED
  const grades = [
    { score: 6 }, { score: 8 }, { score: 10 }, { score: 12 }, { score: 14 },
    { score: 15 }, { score: 16 }, { score: 17 }, { score: 18 }, { score: 20 }
  ];

  const res = evaluateAssessmentSemantics({ assessmentId: 'midterm_term1', grades });
  assert.strictEqual(res.total_examinees, 10);
  assert.strictEqual(res.difficulty_index, 0.68);
  assert.strictEqual(res.difficulty_classification, 'BALANCED');
  assert(res.discrimination_index > 0.3);
  assert.strictEqual(res.pass_rate, 80.0); // 8 از 10 بالای 10 هستند
});

test('تشخیص آزمون بسیار دشوار (HARD)', () => {
  const grades = [
    { score: 2 }, { score: 4 }, { score: 5 }, { score: 6 }, { score: 8 }
  ];
  // میانگین = 5.0 -> ضریب دشواری = 5.0 / 20 = 0.25 -> HARD
  const res = evaluateAssessmentSemantics({ grades });
  assert.strictEqual(res.difficulty_classification, 'HARD');
  assert.strictEqual(res.pass_rate, 0.0);
});

test('رفتار ایمن در آزمون بدون شرکت‌کننده (Empty Exam)', () => {
  const res = evaluateAssessmentSemantics({ grades: [] });
  assert.strictEqual(res.total_examinees, 0);
  assert.strictEqual(res.difficulty_index, null);
  assert.strictEqual(res.difficulty_classification, 'NO_DATA');
});

if (fail > 0) process.exit(1);
