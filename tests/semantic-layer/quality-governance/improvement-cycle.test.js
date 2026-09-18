/**
 * آزمون چرخه بهبود مستمر (PDCA) و ترنزیشن‌های مجاز و غیرمجاز
 */

'use strict';

const assert = require('assert');
const {
  initiateImprovementCycle,
  transitionImprovementCycle,
  PDCA_PHASES,
  QUALITY_PILLARS
} = require('../../../server/analytics/quality-governance');

function runTest() {
  console.log('▸ تست ۳: چرخه استاندارد بهبود مستمر PDCA و صحت ماشین حالت (transitionImprovementCycle)');

  // ایجاد چرخه جدید در فاز PLAN
  const initialParams = {
    school_id: 10,
    pillar_key: QUALITY_PILLARS.ACADEMIC_MASTERY,
    problem_statement: 'افت نمرات آزمون ریاضی پایه نهم در مبحث هندسه',
    target_metric: 'academic_mastery_score',
    baseline_value: 58.5,
    target_value: 75.0,
    action_plan: 'برگزاری کارگاه تقویتی و تمرینات هفتگی گام به گام',
    responsible_role: 'head_of_math_department',
    planned_check_date: '2026-11-01'
  };

  const cycle = initiateImprovementCycle(initialParams);

  assert.ok(cycle.cycle_id.startsWith('PDCA-SCH10-'));
  assert.strictEqual(cycle.current_phase, PDCA_PHASES.PLAN);
  assert.strictEqual(cycle.baseline_value, 58.5);
  assert.strictEqual(cycle.target_value, 75.0);
  assert.strictEqual(cycle.history.length, 1);

  // ۱. انتقال معتبر: PLAN -> DO
  const doCycle = transitionImprovementCycle(cycle, {
    to_phase: PDCA_PHASES.DO,
    note: 'اجرای کارگاه‌های فوق برنامه آغاز شد',
    actor: { id: 101, role: 'manager' }
  });
  assert.strictEqual(doCycle.current_phase, PDCA_PHASES.DO);
  assert.strictEqual(doCycle.history.length, 2);

  // ۲. انتقال غیرمعتبر: تلاش برای جهش از DO مستقیم به ACT بدون گذار از CHECK
  assert.throws(
    () => transitionImprovementCycle(doCycle, {
      to_phase: PDCA_PHASES.ACT,
      note: 'جهش غیرمجاز',
      actor: { id: 101, role: 'manager' }
    }),
    /INVALID_PDCA_PHASE_TRANSITION/,
    'Should not transition directly from DO to ACT'
  );

  // ۳. انتقال معتبر: DO -> CHECK
  const checkCycle = transitionImprovementCycle(doCycle, {
    to_phase: PDCA_PHASES.CHECK,
    note: 'ارزیابی آزمون میان‌دوره برگزار شد و داده‌ها ثبت گردید',
    actor: { id: 101, role: 'manager' }
  });
  assert.strictEqual(checkCycle.current_phase, PDCA_PHASES.CHECK);

  // ۴. انتقال معتبر: CHECK -> ACT
  const actCycle = transitionImprovementCycle(checkCycle, {
    to_phase: PDCA_PHASES.ACT,
    note: 'تحلیل اثربخشی انجام شد و مرحله استانداردسازی آغاز گشت',
    actor: { id: 101, role: 'manager' }
  });
  assert.strictEqual(actCycle.current_phase, PDCA_PHASES.ACT);

  console.log('  ✅ صحت ماشین حالت چرخه دمینگ (PDCA) و مهار جهش‌های فازی غیرمجاز');
}

module.exports = { runTest };
if (require.main === module) runTest();
