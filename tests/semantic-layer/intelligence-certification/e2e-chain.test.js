/**
 * آزمون ۲: مدار بسته کامل انتهای‌به‌انتها (e2e-chain)
 */

'use strict';

const assert = require('assert');
const {
  executeEndToEndChain,
  PHASE3_ENGINE_ID
} = require('../../../server/analytics/intelligence-release-certification');

function runTests() {
  console.log('▸ تست ۲: مدار بسته کامل انتهای‌به‌انتها از سیگنال خام تا گواهینامه (e2e-chain)');

  const mockSignal = {
    school_id: 101,
    region_id: 1,
    type: 'ATTENDANCE_DROP_AND_ASSESSMENT_GAP',
    attendance_rate: 76.2,
    grade_average: 11.9
  };

  const chainResult = executeEndToEndChain(mockSignal, { timestamp: '2026-09-18T10:00:00.000Z' });

  assert.strictEqual(chainResult.verified, false, 'trace شبیه‌سازی‌شده نباید اجرای تولیدی را verified کند');
  assert.strictEqual(chainResult.execution_mode, 'SYNTHETIC_SIMULATION');
  assert.strictEqual(chainResult.unbroken_loop, true, 'مدار باید کاملاً پیوسته و بدون انقطاع باشد');
  assert.strictEqual(chainResult.human_in_the_loop_preserved, true, 'حاکمیت انسانی باید در مدار حفظ شده باشد');
  assert.strictEqual(chainResult.zero_ranking_preserved, true, 'منع رتبه‌بندی باید در مدار حفظ شده باشد');
  assert.strictEqual(chainResult.total_steps, 12, 'باید دقیقاً ۱۲ گام در ردیابی زنجیره ثبت شده باشد');

  // بررسی گام‌های کلیدی در ردپای زنجیره
  const trace = chainResult.trace;
  assert.strictEqual(trace[0].step, 'STEP_01_RAW_SIGNAL');
  assert.strictEqual(trace[1].step, 'STEP_02_DETECTION');
  assert.strictEqual(trace[1].engine, PHASE3_ENGINE_ID.EI_09_SCHOOL_INTELLIGENCE);

  // گام ۶: دروازه حاکمیت تصمیم انسانی
  const humanGate = trace[5];
  assert.strictEqual(humanGate.step, 'STEP_06_HUMAN_APPROVAL');
  assert.strictEqual(humanGate.automated_decision, false);
  assert.strictEqual(humanGate.automated_execution, false);
  assert.strictEqual(humanGate.requires_human_approval, true);
  assert.strictEqual(humanGate.human_approved, true);

  // گام ۹: ارزیابی پیامد (ایپساتیو)
  const outcomeStep = trace[8];
  assert.strictEqual(outcomeStep.step, 'STEP_09_OUTCOME');
  assert.strictEqual(outcomeStep.engine, PHASE3_ENGINE_ID.EI_19_OUTCOME_EVALUATION);
  assert.strictEqual(outcomeStep.evaluation_nature, 'IPSATIVE_IMPROVEMENT');

  // گام ۱۲: صدور گواهی
  const certStep = trace[11];
  assert.strictEqual(certStep.step, 'STEP_12_CERTIFICATION');
  assert.strictEqual(certStep.status, 'SIMULATION_ONLY');
  assert.strictEqual(chainResult.unbroken_loop, false);

  console.log('  ✅ اعتبارسنجی ۱۲ گام پیوسته زنجیره ارزش از سیگنال خام تا گواهی با موفقیت تایید شد');
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
