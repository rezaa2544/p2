/**
 * tests/infrastructure/certification/human-sovereignty.test.js
 * آزمون صلب حاکمیت تصمیم و اجرای انسانی (Human Decision Sovereignty)
 */

'use strict';

const assert = require('assert');
const {
  PHASE4_ERRORS,
  assertHumanDecisionSovereignty,
  generatePhase4ReleaseCertificate
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون حاکمیت تصمیم و اجرای انسانی ---');

// ۱. قرارداد معتبر حاکمیت انسانی
const validGovernance = {
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true
};
assert.doesNotThrow(() => {
  assertHumanDecisionSovereignty(validGovernance);
}, 'قرارداد معتبر نباید خطایی پرتاب کند');

// ۲. نقض با تصمیم‌گیری خودکار
assert.throws(() => {
  assertHumanDecisionSovereignty({
    automated_decision: true,
    automated_execution: false,
    requires_human_approval: true
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.HUMAN_SOVEREIGNTY_VIOLATION);
  return true;
});

// ۳. نقض با اجرای خودکار
assert.throws(() => {
  assertHumanDecisionSovereignty({
    automated_decision: false,
    automated_execution: true,
    requires_human_approval: true
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.HUMAN_SOVEREIGNTY_VIOLATION);
  return true;
});

// ۴. نقض با عدم الزام تایید انسانی
assert.throws(() => {
  assertHumanDecisionSovereignty({
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: false
  });
}, (err) => {
  assert.strictEqual(err.code, PHASE4_ERRORS.HUMAN_SOVEREIGNTY_VIOLATION);
  return true;
});

// ۵. بررسی حضور فیلدهای حاکمیت انسانی در شناسنامه گواهی انتشار
const cert = generatePhase4ReleaseCertificate();
assert.strictEqual(cert.governance.human_decision_sovereignty, 'ENFORCED');

console.log('✅ ۴/۹: حاکمیت قطعی تصمیم و اجرای انسانی با موفقیت تایید شد');
