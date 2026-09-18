/**
 * تست تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در لایه رصدپذیری (P1-SC-03)
 */
'use strict';

const assert = require('assert');
const {
  buildObservabilityHealthSnapshot,
  assertObservabilityZeroRanking
} = require('../../../server/monitoring/production-observability');

function runZeroRankingTests() {
  console.log('▸ تست ۸: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در رصدپذیری (zero-ranking)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildObservabilityHealthSnapshot({ schoolId: 101, regionId: 1, user });

  // ۱. ارزیابی انطباق شناسنامه سلامت
  const zr = snapshot.governance_and_invariants.zero_ranking_guarantee;
  assert.strictEqual(zr.rank_prohibited, true);
  assert.strictEqual(zr.ranking_score_prohibited, true);
  assert.strictEqual(zr.league_table_prohibited, true);
  assert.strictEqual(zr.best_school_prohibited, true);
  assert.strictEqual(zr.worst_school_prohibited, true);
  assert.strictEqual(zr.evaluation_nature, 'IPSATIVE');
  assert.strictEqual(zr.enforced, true);

  // ۲. اسکن عمیق شیء اسنپ‌شات تولیدشده
  assert.strictEqual(assertObservabilityZeroRanking(snapshot), true);

  // ۳. رد قاطع و آزمون منفی در صورت درج کلیدهای ممنوعه
  const forbiddenKeys = ['rank', 'ranking_score', 'league_table', 'best_school', 'worst_school'];
  for (const fk of forbiddenKeys) {
    const maliciousPayload = {
      nested: {
        [fk]: 1
      }
    };
    assert.throws(() => {
      assertObservabilityZeroRanking(maliciousPayload);
    }, /ZERO_RANKING_VIOLATION/);
  }

  // ۴. رد قاطع در صورت وجود مقادیر متنی ممنوعه
  assert.throws(() => {
    assertObservabilityZeroRanking({ message: 'This is the best_school in district' });
  }, /ZERO_RANKING_VIOLATION/);

  console.log('  ✅ تحریم مطلق رتبه‌بندی رقابتی در خروجی‌های رصدپذیری تایید شد');
}

if (require.main === module) {
  runZeroRankingTests();
}

module.exports = { runZeroRankingTests };
