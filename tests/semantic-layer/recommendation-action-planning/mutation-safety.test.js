/**
 * آزمون ایمنی در برابر جهش داده‌ها و فریز بودن خروجی‌ها (Mutation Safety)
 */

'use strict';

const assert = require('assert');
const {
  generateActionRecommendations,
  generatePrincipalActionBoard,
  evaluateActionEffectiveness,
  prioritizeActions
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۹: آزمون ایمنی در برابر جهش داده‌ها و انجماد عمیق اشیا (deepFreeze Mutation Safety)');

  const recs = generateActionRecommendations({
    schoolId: 1,
    schoolSnapshot: { chronic_absence_rate: 15.0 }
  });

  // ۱. بررسی انجماد آرایه و المان‌ها
  assert.ok(Object.isFrozen(recs), 'Recommendations array must be frozen');
  assert.ok(Object.isFrozen(recs[0]), 'Individual recommendation must be frozen');
  assert.throws(() => { recs[0].severity = 'MUTATED'; }, /TypeError/);

  // ۲. بررسی انجماد شواهد تودرتو
  assert.ok(Object.isFrozen(recs[0].evidence), 'Evidence sub-object must be frozen');
  assert.throws(() => { recs[0].evidence.current_value = 999; }, /TypeError/);

  // ۳. بررسی انجماد تابلوی اقدامات مدیر
  const board = generatePrincipalActionBoard({ schoolId: 1, recommendations: recs });
  assert.ok(Object.isFrozen(board), 'Board must be frozen');
  assert.ok(Object.isFrozen(board.immediate_24h_actions), 'immediate_24h_actions must be frozen');
  assert.throws(() => { board.total_actions_count = 0; }, /TypeError/);

  // ۴. بررسی انجماد ارزیابی اثربخشی
  const outcome = evaluateActionEffectiveness({
    actionRecord: recs[0],
    preMetrics: { attendance_rate: 80 },
    postMetrics: { attendance_rate: 85 }
  });
  assert.ok(Object.isFrozen(outcome), 'Outcome must be frozen');
  assert.ok(Object.isFrozen(outcome.deltas), 'Deltas sub-object must be frozen');

  console.log('  ✅ ایمنی کامل در برابر جهش غیرمجاز و انجماد عمیق ساختارها تأیید گردید');
}

module.exports = { runTest };
if (require.main === module) runTest();
