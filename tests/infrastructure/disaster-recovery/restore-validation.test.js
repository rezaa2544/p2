/**
 * تست راستی‌آزمایی مانور بازیابی و مهار دستکاری (P1-SC-04)
 */
'use strict';

const assert = require('assert');
const fixture = require('./evidence-fixture');
const {
  validateRestoreRehearsal
} = require('../../../server/infrastructure/disaster-recovery');

function runRestoreValidationTests() {
  console.log('▸ تست ۲: راستی‌آزمایی مانور بازیابی و مهار دستکاری (restore-validation)');

  // ۱. مانور بازیابی موفقیت‌آمیز در محیط مجزا
  const nominal = validateRestoreRehearsal({
    ...fixture.rehearsal,
    duration_seconds: 180,
    tables_restored: 38,
    records_restored: 150000
  });

  assert.strictEqual(nominal.drill_status, 'PASSED');
  assert.strictEqual(nominal.verified, true);
  assert.strictEqual(nominal.duration_seconds, 180);
  assert.strictEqual(nominal.tables_restored, 38);
  assert.strictEqual(nominal.isolated_target, true);

  // ۲. مهار دستکاری و سقط در صورت تخریب آرشیو پشتیبان (Tamper Detection)
  assert.throws(() => {
    validateRestoreRehearsal({ tampered: true });
  }, /RESTORE_TAMPER_DETECTED/);

  // ۳. عدم تایید مانور در صورت فراتر رفتن زمان از سقف RTO (۹۰۰ ثانیه)
  const slowRestore = validateRestoreRehearsal({ ...fixture.rehearsal, duration_seconds: 950 });
  assert.strictEqual(slowRestore.drill_status, 'FAILED');
  assert.strictEqual(slowRestore.verified, false);

  console.log('  ✅ صحت مانور بازیابی، ایزولاسیون هدف و مهار دستکاری با موفقیت تایید شد');
}

if (require.main === module) {
  runRestoreValidationTests();
}

module.exports = { runRestoreValidationTests };
