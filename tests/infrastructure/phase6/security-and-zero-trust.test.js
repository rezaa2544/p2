/**
 * tests/infrastructure/phase6/security-and-zero-trust.test.js
 * Stage 4: Security, Zero Trust & Production Hardening Test Suite
 */

'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const {
  validateProductionEnvironment,
  sanitizePayload,
  assertTenantBoundary,
  HARDENING_ERRORS
} = require(path.join(ROOT, 'server/infrastructure/phase6-production-hardening'));

async function testTenantAndProvincialIsolation() {
  console.log('▸ Phase 6 Test 6: Zero-Trust Tenant & Provincial Isolation');

  const managerSchoolA = { id: 10, role: 'manager', school_id: 101, province_code: '07' };

  // ۱. دسترسی به مدرسه خود -> مجاز
  assert.strictEqual(assertTenantBoundary(managerSchoolA, 101, '07'), true);
  console.log('  ✅ 6.1 Same-school access permitted');

  // ۲. تلاش برای دسترسی به مدرسه دیگر در همان استان -> رد قطعی
  assert.throws(() => {
    assertTenantBoundary(managerSchoolA, 102, '07');
  }, (err) => {
    return err.code === HARDENING_ERRORS.TENANT_BREACH;
  }, 'Cross-school access within province must be blocked');
  console.log('  ✅ 6.2 Cross-school IDOR attempt blocked (Tenant Breach)');

  // ۳. تلاش برای دسترسی به استان دیگر -> رد قطعی
  assert.throws(() => {
    assertTenantBoundary(managerSchoolA, 101, '04');
  }, (err) => {
    return err.code === HARDENING_ERRORS.TENANT_BREACH;
  }, 'Cross-province access must be blocked');
  console.log('  ✅ 6.3 Cross-province breach attempt blocked');

  // ۴. کاربر بدون شناسه -> خطای ۴۰۱
  assert.throws(() => {
    assertTenantBoundary(null, 101, '07');
  }, /UNAUTHORIZED/);
  console.log('  ✅ 6.4 Anonymous access rejected');
}

async function testSecretSanitization() {
  console.log('▸ Phase 6 Test 7: Secret Masking & Telemetry Sanitization');

  const rawPayload = {
    user_id: 55,
    full_name: 'کاربر آزمایشی',
    national_id: '0012345678',
    phone_number: '09121234567',
    password_hash: 'super-secret-hash',
    jwt_token: 'bearer.token.payload',
    nested: {
      auth_code: '123456',
      normal_field: 'safe'
    }
  };

  const sanitized = sanitizePayload(rawPayload);

  assert.strictEqual(sanitized.national_id, '001*******', 'National ID must be masked');
  assert.strictEqual(sanitized.phone_number, '0912****567', 'Phone number must be masked');
  assert.strictEqual(sanitized.password_hash, '[REDACTED_SECRET]', 'Password must be redacted');
  assert.strictEqual(sanitized.jwt_token, '[REDACTED_SECRET]', 'Token must be redacted');
  assert.strictEqual(sanitized.nested.auth_code, '[REDACTED_SECRET]', 'Nested secret must be redacted');
  assert.strictEqual(sanitized.nested.normal_field, 'safe', 'Safe fields must remain untouched');

  console.log('  ✅ 7.1 All sensitive PII, passwords, tokens and OTP codes masked');
}

async function testProductionEnvironmentValidation() {
  console.log('▸ Phase 6 Test 8: Production Environment Hardening & Config Audit');

  // ۱. محیط توسعه (Non-production): عدم نیاز به تنظیمات سخت‌گیرانه
  const devCheck = validateProductionEnvironment({ NODE_ENV: 'development' });
  assert.strictEqual(devCheck.valid, true);
  console.log('  ✅ 8.1 Development environment validated');

  // ۲. محیط عملیاتی ناقص (Missing DATABASE_URL): باید خطا صادر کند
  const badProdCheck = validateProductionEnvironment({
    NODE_ENV: 'production',
    PAYESH_JWT_SECRET: 'short'
  });
  assert.strictEqual(badProdCheck.valid, false);
  assert(badProdCheck.issues.length >= 2, 'Must report missing DB and weak secret');
  console.log('  ✅ 8.2 Production fail-fast on insecure environment verified');

  // ۳. محیط عملیاتی ایمن و استاندارد
  const goodProdCheck = validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://app:pass@cluster-db:5432/payesh',
    REDIS_URL: 'redis://cluster-cache:6379',
    PAYESH_JWT_SECRET: 'complex-cryptographically-secure-key-32-chars-long',
    PAYESH_BEHIND_PROXY: '1'
  });
  assert.strictEqual(goodProdCheck.valid, true);
  console.log('  ✅ 8.3 Hardened production environment verified');
}

async function main() {
  console.log('===================================================================');
  console.log('🧪 Running Suite 4: Security, Zero Trust & Production Hardening');
  console.log('===================================================================');

  await testTenantAndProvincialIsolation();
  await testSecretSanitization();
  await testProductionEnvironmentValidation();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('✅ Suite 4 (Security & Hardening) PASSED 100%');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('❌ Suite 4 Failed:', err);
  process.exit(1);
});
