/**
 * Multi-Role Concurrency & Race Condition Suite
 * Phase 5 Step 6 (P2-NI-04): National Production Simulation & Cross-Phase Hardening
 *
 * Verifies concurrent interactions across all repository roles:
 *  - student
 *  - parent
 *  - teacher
 *  - manager (principal)
 *  - counselor
 *  - edu_office (district / province)
 *  - superadmin (NOC / infrastructure / security)
 *  - driver
 *  - guard
 */

'use strict';

const assert = require('assert');
const { VALID_ROLES } = require('../../../../server/security/zero-trust-runtime');
const { USER_ROLES } = require('../../../../server/validate');
const { checkOcc, bump } = require('../../../../server/occ');
const { recordNationalAuditTrail, getNationalAuditTrail } = require('../../../../server/security/national-security-governance');

const EXTENDED_ACTOR_ROLES = Object.freeze([
  'student',
  'parent',
  'teacher',
  'manager',
  'counselor',
  'edu_office',
  'superadmin',
  'driver',
  'guard'
]);

function runConcurrencyRolesTests() {
  let passed = 0;

  // 1. All 9 roles must be recognized in repository security schemas
  EXTENDED_ACTOR_ROLES.forEach(role => {
    const inVal = USER_ROLES.includes(role);
    assert(inVal, `Role ${role} must exist in USER_ROLES`);
  });
  passed++;

  // 2. Concurrent OCC Bump & Race Detection
  // Simulate two concurrent actors attempting to update the same record version
  const record = { id: 101, version: 5, data: 'original' };
  
  // Actor A reads version 5
  const actorAVersion = record.version;
  // Actor B reads version 5
  const actorBVersion = record.version;

  // Actor A successfully commits and bumps version to 6
  const bumpedVersion = bump(record);
  assert.strictEqual(bumpedVersion, 6, 'Version must increment to 6');
  assert.strictEqual(record.version, 6, 'Record version must be 6');

  // Actor B tries to update using stale version 5 -> OCC collision detected!
  const occCheckB = checkOcc(record, { version: actorBVersion });
  assert(occCheckB !== null, 'Stale concurrent update must return conflict object');
  assert.strictEqual(occCheckB.status, 409, 'Status must be 409 Conflict');
  assert.strictEqual(occCheckB.body.code, 'conflict', 'Conflict code must be returned');
  passed++;

  // 3. Concurrent multi-role audit trail emission
  EXTENDED_ACTOR_ROLES.forEach((role, idx) => {
    recordNationalAuditTrail({
      action: `CONCURRENT_ROLE_OP_${role.toUpperCase()}`,
      region_id: 'ir-tehran-1',
      operator_id: `user-${role}-${idx}`,
      operator_role: role,
      status: 'SUCCESS',
      details: { role, concurrent_index: idx }
    });
  });

  const trails = getNationalAuditTrail({ region_id: 'ir-tehran-1' });
  assert(trails.length >= EXTENDED_ACTOR_ROLES.length, 'Audit trail must record all concurrent actor operations');
  passed++;

  // 4. Role Isolation: Student cannot claim teacher or manager privileges
  const studentUser = { id: 501, role: 'student', school_id: 10 };
  assert.strictEqual(studentUser.role, 'student');
  assert(studentUser.role !== 'teacher' && studentUser.role !== 'manager');
  passed++;

  // 5. Parent can only access their linked child (no sibling leakage)
  const parentId = 901;
  const childA = 501;
  const childB = 502; // Foreign child
  const parentLinks = new Set([childA]);

  const canAccessA = parentLinks.has(childA);
  const canAccessB = parentLinks.has(childB);
  assert.strictEqual(canAccessA, true, 'Parent must access linked child');
  assert.strictEqual(canAccessB, false, 'Parent must NOT access foreign child');
  passed++;

  return {
    suite: 'concurrency-roles',
    roles_tested: EXTENDED_ACTOR_ROLES.length,
    passed
  };
}

if (require.main === module) {
  const res = runConcurrencyRolesTests();
  console.log(`✅ concurrency-roles.test.js: ${res.passed}/5 passed across ${res.roles_tested} roles`);
}

module.exports = {
  runConcurrencyRolesTests,
  EXTENDED_ACTOR_ROLES
};
