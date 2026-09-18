/**
 * آزمون ۶: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در زیرساخت (zero-ranking)
 */

'use strict';

const assert = require('assert');
const {
  buildProductionReadinessSnapshot
} = require('../../../server/infrastructure/scalability-foundation');

function runTests() {
  console.log('▸ تست ۶: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در زیرساخت (zero-ranking)');

  const snapshot = buildProductionReadinessSnapshot({ schoolId: 101, regionId: 1 });
  const zeroRanking = snapshot.governance_and_compliance.zero_ranking_guarantee;

  assert.strictEqual(zeroRanking.rank_prohibited, true);
  assert.strictEqual(zeroRanking.ranking_score_prohibited, true);
  assert.strictEqual(zeroRanking.league_table_prohibited, true);
  assert.strictEqual(zeroRanking.best_school_prohibited, true);
  assert.strictEqual(zeroRanking.worst_school_prohibited, true);
  assert.strictEqual(zeroRanking.evaluation_nature, 'IPSATIVE');
  assert.strictEqual(zeroRanking.enforced, true);

  // اسکن بازگشتی کلیدها جهت اطمینان از عدم وجود کلیدهای ممنوعه رتبه‌بندی
  const forbiddenKeys = ['rank', 'ranking_score', 'league_table', 'best_school', 'worst_school'];
  function deepScanKeys(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      const lower = k.toLowerCase();
      for (const forbidden of forbiddenKeys) {
        assert.strictEqual(lower === forbidden, false, `کلید ممنوعه "${k}" نباید وجود داشته باشد`);
      }
      deepScanKeys(obj[k]);
    }
  }

  deepScanKeys(snapshot);

  console.log('  ✅ اسکن عمیق و عدم وجود هرگونه برچسب یا کلید رتبه‌بندی رقابتی تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
