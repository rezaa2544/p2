/**
 * تست تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در لایه بازیابی بحران (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const {
  buildDisasterRecoveryHealthSnapshot,
  assertDisasterRecoveryZeroRanking
} = require('../../../server/infrastructure/disaster-recovery');

function runZeroRankingTests() {
  console.log('▸ تست ۷: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در DR (zero-ranking)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildDisasterRecoveryHealthSnapshot({ schoolId: 101, regionId: 1, user });

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
  assert.strictEqual(assertDisasterRecoveryZeroRanking(snapshot), true);

  // ۳. رد قاطع و آزمون منفی در صورت درج کلیدهای ممنوعه
  const forbiddenKeys = ['rank', 'ranking_score', 'league_table', 'best_school', 'worst_school'];
  for (const fk of forbiddenKeys) {
    const maliciousPayload = {
      nested: {
        [fk]: 1
      }
    };
    assert.throws(() => {
      assertDisasterRecoveryZeroRanking(maliciousPayload);
    }, /ZERO_RANKING_VIOLATION/);
  }

  // ۴. رد قاطع در صورت وجود مقادیر متنی ممنوعه
  assert.throws(() => {
    assertDisasterRecoveryZeroRanking({ backup_tag: 'worst_school backup archive' });
  }, /ZERO_RANKING_VIOLATION/);

  console.log('  ✅ تحریم مطلق رتبه‌بندی رقابتی در خروجی‌های DR تایید شد');
}

if (require.main === module) {
  runZeroRankingTests();
}

module.exports = { runZeroRankingTests };
