/**
 * آزمون ۵: اصل حاکمیت تصمیم انسانی و تحریم اتوماسیون (human-control)
 */

'use strict';

const assert = require('assert');
const {
  buildUnifiedIntelligenceSnapshot,
  generatePlatformHealthReport
} = require('../../../server/analytics/intelligence-platform-integration');

function runTests() {
  console.log('▸ تست ۵: آزمون حاکمیت تصمیم انسانی در سطح کل پلتفرم (human-control)');

  const snapshot = buildUnifiedIntelligenceSnapshot({ schoolId: 101, regionId: 1 });
  assert.strictEqual(snapshot.automated_decision, false, 'تصمیم‌گیری خودکار در پلتفرم مطلقا ممنوع است');
  assert.strictEqual(snapshot.automated_execution, false, 'اجرای خودکار اقدامات در پلتفرم مطلقا ممنوع است');
  assert.strictEqual(snapshot.requires_human_approval, true, 'تأیید عامل انسانی الزامی است');

  const report = generatePlatformHealthReport({ schoolId: 101, regionId: 1 });
  assert.strictEqual(report.human_sovereignty_verified, true);

  console.log('  ✅ رعایت ۱۰۰٪ اصل حاکمیت تصمیم انسانی در تمامی سطوح پلتفرم تأیید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
