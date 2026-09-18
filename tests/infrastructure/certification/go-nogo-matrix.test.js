/**
 * tests/infrastructure/certification/go-nogo-matrix.test.js
 * آزمون ماتریس تصمیم قطعی ملی GO / NO-GO (Roadmap §32)
 */

'use strict';

const assert = require('assert');
const {
  GO_NOGO_STATUS,
  evaluateNationalGoNoGo
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون ماتریس تصمیم قطعی استقرار ملی GO / NO-GO ---');

// ۱. ارزیابی در شرایط احراز کامل ۷ شرط الزامی
const allSatisfied = evaluateNationalGoNoGo({
  zero_data_loss_proven: true,
  audit_logging_active: true,
  load_chaos_resilience_verified: true,
  no_silent_fallback: true,
  slo_compliant: true,
  dr_drill_verified: true,
  docs_complete: true
});

assert.strictEqual(allSatisfied.decision, GO_NOGO_STATUS.GO, 'در شرایط احراز کامل باید تصمیم GO باشد');
assert.strictEqual(allSatisfied.satisfied_count, 7);
assert.strictEqual(allSatisfied.total_criteria, 7);

// ۲. نقض شرط ۱: عدم اثبات عدم تلفات داده -> NO_GO
const crit1Failed = evaluateNationalGoNoGo({
  zero_data_loss_proven: false
});
assert.strictEqual(crit1Failed.decision, GO_NOGO_STATUS.NO_GO);
assert.strictEqual(crit1Failed.satisfied_count, 6);

// ۳. نقض شرط ۴: وجود شکست خاموش (Silent Fallback) -> NO_GO
const crit4Failed = evaluateNationalGoNoGo({
  no_silent_fallback: false
});
assert.strictEqual(crit4Failed.decision, GO_NOGO_STATUS.NO_GO);

// ۴. نقض شرط ۶: عدم انجام مانور بازیابی -> NO_GO
const crit6Failed = evaluateNationalGoNoGo({
  dr_drill_verified: false
});
assert.strictEqual(crit6Failed.decision, GO_NOGO_STATUS.NO_GO);

// ۵. نقض شرط ۷: عدم انطباق یا نقص اسناد -> NO_GO
const crit7Failed = evaluateNationalGoNoGo({
  docs_complete: false
});
assert.strictEqual(crit7Failed.decision, GO_NOGO_STATUS.NO_GO);

console.log('✅ ۳/۹: ماتریس تصمیم قطعی استقرار ملی GO / NO-GO با موفقیت تایید شد');
