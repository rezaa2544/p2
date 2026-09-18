/**
 * tests/infrastructure/phase5/resource-governance/zero-ranking-protection.test.js
 * آزمون تضمین عدم رتبه‌بندی و مهار واژگان مقایسه‌ای (Zero Ranking Protection)
 */

'use strict';

const assert = require('assert');
const {
  FEDERATION_ERRORS,
  assertNoZeroRanking
} = require('../../../../server/infrastructure/phase5-region-federation');

console.log('--- آزمون تضمین عدم رتبه‌بندی رقابتی مدارس ---');

// ۱. محموله سالم و بدون رتبه‌بندی
const cleanPayload = {
  school_id: 101,
  allocated_rps: 200,
  growth_trajectory: 'positive',
  zero_ranking_guarantee: true
};
assert.doesNotThrow(() => {
  assertNoZeroRanking(cleanPayload);
});

// ۲. شناسایی و بلاک کلیدهای رتبه‌بندی ممنوعه (league_table)
assert.throws(() => {
  assertNoZeroRanking({
    province: 'تهران',
    league_table: [101, 102, 103]
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۳. شناسایی و بلاک مقایسه بین‌مدرسه‌ای (compare_school)
assert.throws(() => {
  assertNoZeroRanking({
    type: 'PROVINCE_REPORT',
    compare_school: { a: 10, b: 20 }
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

// ۴. شناسایی برترین مدرسه (top_school)
assert.throws(() => {
  assertNoZeroRanking({
    top_school: 'دبیرستان الف'
  });
}, (err) => {
  assert.strictEqual(err.code, FEDERATION_ERRORS.ZERO_RANKING_VIOLATION);
  return true;
});

console.log('✅ ۴/۴: تضمین منع رتبه‌بندی و بلاک واژگان ممنوعه با موفقیت تایید شد');
