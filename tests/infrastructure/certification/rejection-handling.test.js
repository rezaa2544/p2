/**
 * tests/infrastructure/certification/rejection-handling.test.js
 * آزمون رفتارهای رد و رد صلاحیت صدور گواهینامه انتشار (Rejection Handling)
 */

'use strict';

const assert = require('assert');
const {
  CERTIFICATION_STATUS,
  GO_NOGO_STATUS,
  generatePhase4ReleaseCertificate
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون رفتارهای رد و رد صلاحیت گواهینامه انتشار ---');

// ۱. آزمون رد صلاحیت در صورت شکست گیت داده
const certWithDataFail = generatePhase4ReleaseCertificate({
  gatesInput: { pg_sole_sot: false }
});
assert.strictEqual(certWithDataFail.status, CERTIFICATION_STATUS.REJECTED);
assert.strictEqual(certWithDataFail.release_ready, false);
assert.ok(certWithDataFail.failure_reasons.length > 0);

// ۲. آزمون رد صلاحیت در صورت شکست تصمیم GO/NO-GO
const certWithNoGo = generatePhase4ReleaseCertificate({
  goNoGoInput: { dr_drill_verified: false }
});
assert.strictEqual(certWithNoGo.status, CERTIFICATION_STATUS.REJECTED);
assert.strictEqual(certWithNoGo.national_go_decision, GO_NOGO_STATUS.NO_GO);
assert.strictEqual(certWithNoGo.release_ready, false);

// ۳. آزمون رد صلاحیت در صورت وجود نشت امنیتی
const certWithLeak = generatePhase4ReleaseCertificate({
  gatesInput: { secret_leaks: 1 }
});
assert.strictEqual(certWithLeak.status, CERTIFICATION_STATUS.REJECTED);
assert.strictEqual(certWithLeak.release_ready, false);

console.log('✅ ۸/۹: رفتارهای رد و عدم صدور مجوز در نقایص امنیتی/عملیاتی تایید شد');
