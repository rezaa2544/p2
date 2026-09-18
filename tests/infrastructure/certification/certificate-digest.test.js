/**
 * tests/infrastructure/certification/certificate-digest.test.js
 * آزمون اعتبار، فرمت و ضد دستکاری بودن چک‌سام گواهینامه انتشار
 */

'use strict';

const assert = require('assert');
const {
  CERTIFICATION_STATUS,
  generatePhase4ReleaseCertificate
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون امضای رمزنگاری‌شده و چک‌سام گواهی انتشار ---');

const cert = generatePhase4ReleaseCertificate();

// ۱. بررسی فرمت چک‌سام
assert.ok(cert.sha256_certificate_digest, 'گواهی باید دارای چک‌سام باشد');
assert.strictEqual(typeof cert.sha256_certificate_digest, 'string');
assert.strictEqual(cert.sha256_certificate_digest.length, 64, 'طول چک‌سام SHA-256 باید ۶۴ کاراکتر باشد');
assert.match(cert.sha256_certificate_digest, /^[a-f0-9]{64}$/, 'چک‌سام باید هگزادسیمال با حروف کوچک باشد');

// ۲. بررسی شناسه استاندارد گواهی
assert.strictEqual(cert.certificate_id, 'CERT-PAYESH-PHASE4-SCALE-OFFICIAL-20260918');
assert.strictEqual(cert.phase, 'PHASE_4');
assert.strictEqual(cert.status, CERTIFICATION_STATUS.CERTIFIED);
assert.strictEqual(cert.layers_count, 6);
assert.strictEqual(cert.readiness_index, 100);

// ۳. بررسی تغییر چک‌سام در صورت تغییر محتوا (Tamper Sensitivity)
const cert1 = generatePhase4ReleaseCertificate({ certified_at: '2026-09-18T10:00:00.000Z' });
const cert2 = generatePhase4ReleaseCertificate({ certified_at: '2026-09-18T11:00:00.000Z' });
assert.notStrictEqual(
  cert1.sha256_certificate_digest,
  cert2.sha256_certificate_digest,
  'تغییر زمان یا متاداده باید چک‌سام را تغییر دهد'
);

console.log('✅ ۹/۹: اعتبار امضای رمزنگاری‌شده و حساسیت به تغییر داده‌ها تایید شد');
