/**
 * tests/semantic-layer/completion-semantics.test.js
 * تست‌های واحد وضعیت تکمیل و ارتقای تحصیلی
 */
'use strict';

const assert = require('assert');
const { evaluateCompletionSemantics } = require('../../server/analytics/semantic.js');

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

console.log('▸ تست‌های محاسباتی تکمیل و ارتقای تحصیلی (Completion Semantics)');

test('قبولی کامل (PASSED) با گذراندن همه دروس و معدل معتبر', () => {
  const subjectGrades = [
    { subject_id: 'math', score: 16, coeff: 4 },
    { subject_id: 'physics', score: 15, coeff: 3 },
    { subject_id: 'literature', score: 18, coeff: 2 }
  ];
  // معدل وزنی = (16*4 + 15*3 + 18*2) / 9 = (64 + 45 + 36) / 9 = 145 / 9 ≈ 16.11
  const res = evaluateCompletionSemantics({ studentId: 501, subjectGrades });
  assert.strictEqual(res.total_subjects, 3);
  assert.strictEqual(res.passed_subjects, 3);
  assert.strictEqual(res.failed_subjects, 0);
  assert.strictEqual(res.gpa, 16.11);
  assert.strictEqual(res.completion_status, 'PASSED');
  assert.strictEqual(res.promotion_eligible, true);
  assert.strictEqual(res.makeup_exam_required, false);
});

test('قبولی مشروط با تجدیدی (CONDITIONAL) — ۱ درس افتاده اما معدل بالای ۱۰', () => {
  const subjectGrades = [
    { subject_id: 'math', score: 16, coeff: 3 },
    { subject_id: 'physics', score: 8, coeff: 2 }, // افتاده
    { subject_id: 'literature', score: 15, coeff: 2 }
  ];
  // معدل وزنی = (48 + 16 + 30) / 7 = 94 / 7 ≈ 13.43
  const res = evaluateCompletionSemantics({ studentId: 502, subjectGrades });
  assert.strictEqual(res.passed_subjects, 2);
  assert.strictEqual(res.failed_subjects, 1);
  assert.strictEqual(res.gpa, 13.43);
  assert.strictEqual(res.completion_status, 'CONDITIONAL');
  assert.strictEqual(res.promotion_eligible, true);
  assert.strictEqual(res.makeup_exam_required, true);
  assert.deepStrictEqual(res.failed_subject_ids, ['physics']);
});

test('مردودی قطعی (FAILED) — بیش از ۲ درس افتاده', () => {
  const subjectGrades = [
    { subject_id: 'math', score: 7, coeff: 3 },
    { subject_id: 'physics', score: 8, coeff: 2 },
    { subject_id: 'chemistry', score: 9, coeff: 2 },
    { subject_id: 'literature', score: 15, coeff: 2 }
  ];
  const res = evaluateCompletionSemantics({ studentId: 503, subjectGrades });
  assert.strictEqual(res.failed_subjects, 3);
  assert.strictEqual(res.completion_status, 'FAILED');
  assert.strictEqual(res.promotion_eligible, false);
});

if (fail > 0) process.exit(1);
