/**
 * آزمون تضمین نظارت انسانی و عدم تصمیم‌گیری خودکار (Human-in-the-Loop Guard)
 */

'use strict';

const assert = require('assert');
const {
  generateActionRecommendations,
  generatePrincipalActionBoard,
  evaluateActionEffectiveness
} = require('../../../server/analytics/recommendation-action-planning');

function runTest() {
  console.log('▸ تست ۶: آزمون الزام نظارت انسانی و منع تصمیم‌گیری خودکار (Human-in-the-Loop Guard)');

  const recs = generateActionRecommendations({
    schoolId: 5,
    schoolSnapshot: { chronic_absence_rate: 16.0 }
  });

  // ۱. تمامی پیشنهادها باید برچسب عدم تصمیم خودکار و نیاز به تایید انسان داشته باشند
  assert.ok(recs.length > 0);
  for (const r of recs) {
    assert.strictEqual(r.automated_decision, false, 'automated_decision must be false');
    assert.strictEqual(r.requires_human_confirmation, true, 'requires_human_confirmation must be true');
    assert.strictEqual(r.approval_status, 'REVIEW_PENDING', 'Initial status must be pending human review');
  }

  // ۲. تابلوی اقدامات مدیر نیز باید گواهی نظارت انسانی داشته باشد
  const board = generatePrincipalActionBoard({
    schoolId: 5,
    recommendations: recs
  });
  assert.strictEqual(board.automated_decision, false);
  assert.strictEqual(board.requires_human_confirmation, true);

  // ۳. ارزیابی اثربخشی نیز نیازمند تایید انسانی است
  const outcome = evaluateActionEffectiveness({
    actionRecord: recs[0],
    preMetrics: { attendance_rate: 80 },
    postMetrics: { attendance_rate: 85 }
  });
  assert.strictEqual(outcome.automated_decision, false);
  assert.strictEqual(outcome.requires_human_confirmation, true);

  console.log('  ✅ رعایت ۱۰۰٪ اصل نظارت انسانی در تمامی خروجی‌ها و پیشنهادها');
}

module.exports = { runTest };
if (require.main === module) runTest();
