/**
 * tests/infrastructure/certification/deterministic.test.js
 * آزمون قطعیت جبری و تطابق بیت‌به‌بیت در ۱۰ اجرای متوالی
 */

'use strict';

const assert = require('assert');
const {
  generatePhase4ReleaseCertificate
} = require('../../../server/infrastructure/phase4-release-certification');

console.log('--- آزمون قطعیت جبری و تطابق بیت‌به‌بیت گواهی انتشار ---');

const fixedTimestamp = '2026-09-18T12:00:00.000Z';
const iterations = 10;
const digests = [];

for (let i = 0; i < iterations; i++) {
  const cert = generatePhase4ReleaseCertificate({
    certified_at: fixedTimestamp
  });
  digests.push(cert.sha256_certificate_digest);
}

// بررسی تطابق کامل تمامی ۱۰ چک‌سام خروجی
const firstDigest = digests[0];
assert.ok(firstDigest && firstDigest.length === 64, 'چک‌سام باید هش ۶۴ کاراکتری هگزادسیمال معتبر باشد');

for (let i = 1; i < iterations; i++) {
  assert.strictEqual(
    digests[i],
    firstDigest,
    `تطابق چک‌سام در دور ${i + 1} با دور ۱ باید بیت‌به‌بیت یکسان باشد`
  );
}

console.log(`✅ ۷/۹: قطعیت جبری در ${iterations} اجرای متوالی با چک‌سام ثابت تایید شد: ${firstDigest.slice(0, 16)}...`);
