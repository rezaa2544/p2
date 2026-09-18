/**
 * tests/infrastructure/phase5/national/data-sovereignty.test.js
 * آزمون حاکمیت داده، تک‌مرجعیت حقیقت و تفکیک کش (P2-NI-01)
 */

'use strict';

const assert = require('assert');
const {
  assertDatabaseAsSourceOfTruth,
  formatSovereignCacheKey,
  verifyDataSovereigntyCompliance,
  DATA_SOVEREIGNTY_ERRORS
} = require('../../../../server/infrastructure/data-sovereignty');

console.log('--- آزمون حاکمیت داده و اصالت پایگاه داده ---');

// ۱. تصمیم‌گیری مجاز مبتنی بر PostgreSQL
assert.strictEqual(assertDatabaseAsSourceOfTruth({
  authority_source: 'postgresql',
  decision_type: 'auth'
}), true);

// ۲. نقض حاکمیت داده: تصمیم‌گیری حیاتی بر مبنای کش ردیس
assert.throws(() => {
  assertDatabaseAsSourceOfTruth({
    authority_source: 'redis',
    decision_type: 'tenant_isolation'
  });
}, (err) => {
  assert.strictEqual(err.code, DATA_SOVEREIGNTY_ERRORS.CACHE_AUTHORITY_VIOLATION);
  return true;
});

// ۳. تولید کلید کش ایزوله با الگوی حاکمیتی
const key = formatSovereignCacheKey('ir-tehran-1', 101, 'session', 999);
assert.strictEqual(key, 'payesh:sov:r:ir-tehran-1:t:101:session:999');

// ۴. گزارش انطباق حاکمیت داده
const report = verifyDataSovereigntyCompliance();
assert.strictEqual(report.primary_source_of_truth, 'PostgreSQL Enterprise Fabric');
assert.strictEqual(report.cache_policy, 'REDIS_CACHE_ONLY_VOLATILE');
assert.strictEqual(report.zero_ranking_guarantee, true);

console.log('✅ ۵/۷: حاکمیت داده و تک‌مرجعیت حقیقت با موفقیت تایید شد');
