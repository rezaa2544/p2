/**
 * آزمون ۶: اصل حاکمیت تصمیم انسانی و تحریم تصمیم/اجرای خودکار (human-control)
 */

'use strict';

const assert = require('assert');
const {
  evaluateOperationalOutcome,
  buildOutcomeEvaluationSnapshot,
  generateOptimizationInsights
} = require('../../../server/analytics/outcome-evaluation-optimization');

function runTests() {
  console.log('▸ تست ۶: آزمون حاکمیت تصمیم انسانی و تحریم اتوماسیون (human-control)');

  const outcome = evaluateOperationalOutcome({});
  assert.strictEqual(outcome.automated_decision, false, 'اتخاذ خودکار تصمیم ممنوع است');
  assert.strictEqual(outcome.automated_execution, false, 'اجرای خودکار مداخله ممنوع است');
  assert.strictEqual(outcome.requires_human_approval, true, 'تأیید عامل انسانی الزامی است');

  const snapshot = buildOutcomeEvaluationSnapshot({ schoolId: 101, regionId: 1 });
  assert.strictEqual(snapshot.automated_decision, false);
  assert.strictEqual(snapshot.automated_execution, false);
  assert.strictEqual(snapshot.requires_human_approval, true);

  const insights = generateOptimizationInsights({ schoolId: 101 });
  for (const ins of insights) {
    assert.strictEqual(ins.automated_execution, false, 'بینش بهینه‌سازی نباید خودکار اجرا شود');
    assert.strictEqual(ins.requires_human_approval, true, 'تأیید عامل انسانی برای بهینه‌سازی الزامی است');
  }

  console.log('  ✅ رعایت ۱۰۰٪ حاکمیت تصمیم انسانی در تمامی توابع ارزیابی پیامد تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
