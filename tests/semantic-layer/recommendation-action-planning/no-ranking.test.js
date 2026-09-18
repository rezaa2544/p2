/**
 * آزمون تضمین عدم رتبه‌بندی رقابتی و لیگ جدول مدارس (Zero-Ranking Guarantee)
 */

'use strict';

const assert = require('assert');
const {
  generatePrincipalActionBoard,
  generateActionRecommendations
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۷: تضمین منع مطلق رتبه‌بندی رقابتی و لیگ جدول مدارس (Zero-Ranking Guarantee)');

  const recs = generateActionRecommendations({
    schoolId: 12,
    schoolSnapshot: { chronic_absence_rate: 13.0, average_gpa: 11.5 }
  });

  const board = generatePrincipalActionBoard({
    schoolId: 12,
    recommendations: recs
  });

  // ۱. فیلدهای صریح منع رتبه‌بندی
  assert.strictEqual(board.zero_ranking_policy_enforced, true);
  assert.strictEqual(board.is_ranked, false);
  assert.strictEqual(board.ranking_score, null);
  assert.strictEqual(board.league_table, null);
  assert.strictEqual(board.best_school, null);
  assert.strictEqual(board.worst_school, null);

  // ۲. بررسی عدم وجود کلیدهای رقابتی در آبجکت داشبورد
  const forbiddenKeys = ['rank', 'rank_position', 'leaderboard', 'top_performers', 'bottom_performers', 'competition_index'];
  const boardKeys = Object.keys(board);
  for (const forbidden of forbiddenKeys) {
    assert.ok(!boardKeys.includes(forbidden), `Forbidden key ${forbidden} must not exist in action board`);
  }

  // ۳. عدم وجود فیلد rank در آیتم‌های اقدامات
  for (const r of recs) {
    assert.strictEqual(r.rank, undefined, 'Individual recommendation item must not have rank');
  }

  console.log('  ✅ تضمین قطعی معماری بدون رتبه‌بندی مخرب در کلیه تابلوی اقدامات');
}

module.exports = { runTest };
if (require.main === module) runTest();
