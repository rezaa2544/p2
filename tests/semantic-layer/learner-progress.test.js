/**
 * tests/semantic-layer/learner-progress.test.js
 * تست‌های واحد پروفایل پیشرفت یادگیرنده
 */
'use strict';

const assert = require('assert');
const { evaluateLearnerProgress } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های محاسباتی پروفایل پیشرفت یادگیرنده (Learner Progress)');

test('محاسبه سطح تسلط پیشرفته (ADVANCED) و تفکیک تکوینی/تراکمی', () => {
  const grades = [
    { score: 18.5, max_score: 20, kind: 'continuous', subject_id: 1, date: '2026-10-01' },
    { score: 19.0, max_score: 20, kind: 'continuous', subject_id: 1, date: '2026-10-15' },
    { score: 19.5, max_score: 20, kind: 'final', subject_id: 1, date: '2026-11-01' },
    { score: 18.0, max_score: 20, kind: 'final', subject_id: 2, date: '2026-11-01' }
  ];

  const res = evaluateLearnerProgress({ studentId: 100, grades });
  assert.strictEqual(res.student_id, 100);
  assert.strictEqual(res.mastery_level, 'ADVANCED');
  assert.strictEqual(res.overall_mean, 18.75);
  assert.strictEqual(res.formative_mean, 18.75);
  assert.strictEqual(res.summative_mean, 18.75);
  assert.strictEqual(res.formative_summative_gap, 0.0);
  assert(res.stability_score >= 90);
  assert.strictEqual(res.subjects_breakdown[1].count, 3);
  assert.strictEqual(res.subjects_breakdown[2].count, 1);
});

test('تشخیص سطح نیازمند مداخله (BELOW_BASIC)', () => {
  const grades = [
    { score: 8, max_score: 20, kind: 'continuous', subject_id: 1, date: '2026-10-01' },
    { score: 7, max_score: 20, kind: 'continuous', subject_id: 1, date: '2026-10-15' },
    { score: 9, max_score: 20, kind: 'final', subject_id: 1, date: '2026-11-01' }
  ];

  const res = evaluateLearnerProgress({ studentId: 101, grades });
  assert.strictEqual(res.mastery_level, 'BELOW_BASIC');
  assert.strictEqual(res.overall_mean, 8.0);
});

test('مدیریت حالت بدون داده (Empty / Missing Data)', () => {
  const res = evaluateLearnerProgress({ studentId: 102, grades: [] });
  assert.strictEqual(res.mastery_level, 'NO_DATA');
  assert.strictEqual(res.overall_mean, null);
  assert.strictEqual(res.observations_count, 0);
});

test('گارد شناسه دانش‌آموز (Invalid Input without studentId)', () => {
  assert.throws(() => {
    evaluateLearnerProgress({ grades: [] });
  }, /studentId is required/);
});

if (fail > 0) process.exit(1);
