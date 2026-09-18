/**
 * تست تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در استقرار پایلوت (P1-SC-05)
 */
'use strict';

const assert = require('assert');
const {
  buildPilotDeploymentHealthSnapshot,
  assertPilotZeroRanking
} = require('../../../server/deployment/pilot-traffic-management');

function runZeroRankingTests() {
  console.log('▸ تست ۷: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در پایلوت (zero-ranking)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const snapshot = buildPilotDeploymentHealthSnapshot({ schoolId: 101, regionId: 1, user });

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
  assert.strictEqual(assertPilotZeroRanking(snapshot), true);

  // ۳. رد قاطع و آزمون منفی در صورت درج کلیدهای ممنوعه
  const forbiddenKeys = ['rank', 'ranking_score', 'league_table', 'best_school', 'worst_school'];
  for (const fk of forbiddenKeys) {
    const maliciousPayload = {
      nested: {
        [fk]: 1
      }
    };
    assert.throws(() => {
      assertPilotZeroRanking(maliciousPayload);
    }, /ZERO_RANKING_VIOLATION/);
  }

  // ۴. رد قاطع در صورت وجود مقادیر متنی ممنوعه
  assert.throws(() => {
    assertPilotZeroRanking({ canary_note: 'selected as best_school in pilot cohort' });
  }, /ZERO_RANKING_VIOLATION/);

  console.log('  ✅ تحریم مطلق رتبه‌بندی رقابتی در خروجی‌های استقرار پایلوت تایید شد');
}

if (require.main === module) {
  runZeroRankingTests();
}

module.exports = { runZeroRankingTests };
