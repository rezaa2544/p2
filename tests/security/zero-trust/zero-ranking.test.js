/**
 * تست تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در لایه Zero Trust (P1-SC-06)
 */
'use strict';

const assert = require('assert');
const {
  assertNoZeroRanking,
  buildSecurityHealthSnapshot,
  ZERO_TRUST_ERRORS
} = require('../../../server/security/zero-trust-runtime');

function runZeroRankingTests() {
  console.log('▸ تست ۹: تضمین ۱۰۰٪ منع رتبه‌بندی رقابتی در Zero Trust (zero-ranking)');

  // ۱. شیء مجاز و بدون رتبه‌بندی
  const cleanData = {
    school_id: 101,
    status: 'ACTIVE',
    metrics: { progress_score: 85 }
  };
  assert.doesNotThrow(() => {
    assertNoZeroRanking(cleanData);
  });

  // ۲. تست کلیدهای ممنوعه تک‌به‌تک
  const prohibitedKeys = [
    'rank',
    'ranking_score',
    'league_table',
    'best_school',
    'worst_school',
    'compare_school',
    'top_school'
  ];

  for (const forbiddenKey of prohibitedKeys) {
    const dirtyObj = { [forbiddenKey]: 1 };
    assert.throws(() => {
      assertNoZeroRanking(dirtyObj);
    }, (err) => {
      return err.code === ZERO_TRUST_ERRORS.ZERO_RANKING_VIOLATION;
    }, `کلید ممنوعه ${forbiddenKey} باید با خطای ZERO_RANKING_VIOLATION مسدود شود`);
  }

  // ۳. تست مقادیر ممنوعه در رشته‌ها
  const dirtyValueObj = { description: 'این مدرسه بهترین است (best_school)' };
  assert.throws(() => {
    assertNoZeroRanking(dirtyValueObj);
  }, (err) => {
    return err.code === ZERO_TRUST_ERRORS.ZERO_RANKING_VIOLATION;
  });

  // ۴. بررسی شناسنامه رسمی سلامت امنیت
  const snap = buildSecurityHealthSnapshot({ schoolId: 1, user: { id: 1, role: 'superadmin' } });
  assert.strictEqual(snap.governance.zero_ranking_guarantee, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.rank_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.ranking_score_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.league_table_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.best_school_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.worst_school_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.compare_school_prohibited, true);
  assert.strictEqual(snap.governance_and_invariants.zero_ranking_guarantee.top_school_prohibited, true);

  console.log('  ✅ تحریم صلب رتبه‌بندی رقابتی در تمام لایه‌های Zero Trust تایید شد');
}

if (require.main === module) {
  runZeroRankingTests();
}

module.exports = { runZeroRankingTests };
