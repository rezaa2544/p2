/**
 * تست قطعیت محاسبات و انجماد عمیق داده‌ها در DR (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const fixture = require('./evidence-fixture');
const {
  buildDisasterRecoveryHealthSnapshot,
  verifyBackupIntegrity,
  calculateRpoRtoMetrics,
  evaluateHighAvailability,
  validateRestoreRehearsal
} = require('../../../server/infrastructure/disaster-recovery');

function runDeterministicTests() {
  console.log('▸ تست ۸: قطعیت جبری ۱۰۰٪ و ایمنی در برابر جهش داده‌ها در DR (deterministic)');

  const user = { id: 10, role: 'manager', school_id: 101, region_id: 1 };
  const mockOptions = fixture;

  // ۱. انجماد عمیق و ممانعت از تغییر شیء
  const snapshot = buildDisasterRecoveryHealthSnapshot({ schoolId: 101, regionId: 1, user }, mockOptions);
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.backup));
  assert(Object.isFrozen(snapshot.recovery));
  assert(Object.isFrozen(snapshot.high_availability));
  assert(Object.isFrozen(snapshot.governance_and_invariants));

  assert.throws(() => {
    snapshot.status = 'corrupted';
  }, /TypeError/);

  assert.throws(() => {
    snapshot.backup.verified = false;
  }, /TypeError/);

  // ۲. بررسی قطعیت محاسبات در ۱۰ تکرار متوالی
  for (let i = 0; i < 10; i++) {
    const b = verifyBackupIntegrity(mockOptions.backup);
    const r = calculateRpoRtoMetrics(mockOptions.recovery);
    const h = evaluateHighAvailability(mockOptions.highAvailability);
    const dr = validateRestoreRehearsal(mockOptions.rehearsal);

    assert.strictEqual(b.verified, true);
    assert.strictEqual(r.achieved_rpo_seconds, 120);
    assert.strictEqual(r.rpo_compliant, true);
    assert.strictEqual(h.database, 'healthy');
    assert.strictEqual(dr.drill_status, 'PASSED');
  }

  console.log('  ✅ انجماد عمیق و قطعیت جبری ۱۰۰٪ در ۱۰ اجرای متوالی تایید شد');
}

if (require.main === module) {
  runDeterministicTests();
}

module.exports = { runDeterministicTests };
