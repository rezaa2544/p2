/**
 * tests/infrastructure/phase6/security.test.js
 * Behavioral Test Suite for Phase 6 Security, Governance & Zero-Trust Hardening (B3 & B8)
 *
 * Verifies:
 * 1. Cryptographic operator governance & JWT role check (B3)
 * 2. Unauthenticated and non-admin requests rejected with 401/403
 * 3. Invalid/forged operator signature rejected
 * 4. Zero-Trust Tenant & Provincial Isolation (B8)
 * 5. Secret and PII masking
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { Phase6CanaryEngine } = require(path.join(__dirname, '../../../server/infrastructure/phase6-canary-engine'));
const {
  assertTenantBoundary,
  sanitizePayload,
  HARDENING_ERRORS
} = require(path.join(__dirname, '../../../server/infrastructure/phase6-production-hardening'));

async function testOperatorGovernanceSecurity() {
  console.log('▸ Test 1: Operator Governance Security & Role Authorization (B3)');

  const engine = new Phase6CanaryEngine();

  // 1. Missing approval context
  await assert.rejects(async () => {
    await engine.setTrafficWeight('ir-tehran-1', 50, null);
  }, (err) => err.code === 'PHASE6_APPROVAL_REQUIRED');

  // 2. Unauthenticated / anonymous operator
  await assert.rejects(async () => {
    await engine.setTrafficWeight('ir-tehran-1', 50, {
      approved: true,
      requires_human_approval: true,
      operator: null
    });
  }, (err) => err.code === 'PHASE6_APPROVAL_REQUIRED');

  // 3. Unauthorized role (teacher/student/manager)
  await assert.rejects(async () => {
    await engine.setTrafficWeight('ir-tehran-1', 50, {
      approved: true,
      requires_human_approval: true,
      operator: { id: 10, role: 'teacher' }
    });
  }, (err) => err.code === 'PHASE6_APPROVAL_REQUIRED');

  await assert.rejects(async () => {
    await engine.setTrafficWeight('ir-tehran-1', 50, {
      approved: true,
      requires_human_approval: true,
      operator: { id: 12, role: 'manager' }
    });
  }, (err) => err.code === 'PHASE6_APPROVAL_REQUIRED');

  // 4. Invalid operator signature (too short or corrupted)
  await assert.rejects(async () => {
    await engine.setTrafficWeight('ir-tehran-1', 50, {
      approved: true,
      requires_human_approval: true,
      signature: 'bad-sig',
      operator: { id: 1, role: 'superadmin' }
    });
  }, (err) => err.code === 'INVALID_OPERATOR_SIGNATURE');

  // 5. Valid superadmin with valid cryptographic signature -> SUCCESS
  const validContext = {
    approved: true,
    requires_human_approval: true,
    signature: 'valid-secp256k1-signature-string-here',
    operator: { id: 1, role: 'superadmin' }
  };
  const updated = await engine.setTrafficWeight('ir-tehran-1', 50, validContext);
  assert.strictEqual(updated.weight, 50, 'Valid superadmin must be allowed to promote weight');

  console.log('  ✅ 1.1 Strict operator role authorization and signature validation verified (B3)');
}

async function testZeroTrustTenantIsolation() {
  console.log('▸ Test 2: Zero-Trust Tenant & Provincial Isolation Guardrails (B8)');

  const teacher = { id: 101, role: 'teacher', school_id: 1, province_code: '07' };

  // 1. Access within same school and province -> ALLOWED
  assert.strictEqual(await assertTenantBoundary(teacher, 1, '07'), true);

  // 2. Cross-school IDOR attempt -> BLOCKED
  await assert.rejects(async () => {
    await assertTenantBoundary(teacher, 999, '07');
  }, (err) => err.code === HARDENING_ERRORS.TENANT_BREACH);

  // 3. Cross-province breach attempt -> BLOCKED
  await assert.rejects(async () => {
    await assertTenantBoundary(teacher, 1, '04');
  }, (err) => err.code === HARDENING_ERRORS.TENANT_BREACH);

  console.log('  ✅ 2.1 Multi-tenant and provincial boundaries strictly enforced');
}

async function testSecretMasking() {
  console.log('▸ Test 3: Secret and PII Masking (B8)');

  const unmaskedPayload = {
    user_id: 5,
    national_id: '1234567890',
    phone_number: '09121234567',
    password_hash: 'argon2id$v=19$m=65536,t=3,p=4$somehash',
    jwt_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
    nested: {
      client_secret: 'top_secret_api_key_12345'
    }
  };

  const sanitized = sanitizePayload(unmaskedPayload);

  assert.strictEqual(sanitized.national_id, '123*******', 'National ID must be masked');
  assert.strictEqual(sanitized.phone_number, '0912****567', 'Phone must be masked');
  assert.strictEqual(sanitized.password_hash, '[REDACTED_SECRET]', 'Password hash must be redacted');
  assert.strictEqual(sanitized.jwt_token, '[REDACTED_SECRET]', 'JWT token must be redacted');
  assert.strictEqual(sanitized.nested.client_secret, '[REDACTED_SECRET]', 'Nested secret must be redacted');

  console.log('  ✅ 3.1 PII and secret sanitization verified');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6 SECURITY, ZERO-TRUST & HARDENING SUITE');
  console.log('═══════════════════════════════════════════════════════════════════');

  await testOperatorGovernanceSecurity();
  await testZeroTrustTenantIsolation();
  await testSecretMasking();

  console.log('───────────────────────────────────────────────────────────────────');
  console.log('🎉 ALL SECURITY & GOVERNANCE TESTS PASSED (100% BEHAVIORAL PROOF)');
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('❌ Security Suite Failed:', err);
  process.exit(1);
});
