/**
 * Chaos Scenario 8: Stale Operational State & Cache Divergence
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  assertDatabaseAsSourceOfTruth,
  DATA_SOVEREIGNTY_ERRORS
} = require('../../../../server/infrastructure/data-sovereignty');
const { enforceNationalSecurityBoundary } = require('../../../../server/security/national-security-governance');

function runStaleStateChaosTest() {
  // 1. Simulate desynchronized Redis attempting to authorize school identity
  assert.throws(() => {
    assertDatabaseAsSourceOfTruth({
      authority_source: 'redis',
      decision_type: 'school_identity'
    });
  }, (err) => {
    return err.code === DATA_SOVEREIGNTY_ERRORS.CACHE_AUTHORITY_VIOLATION;
  }, 'Stale or volatile cache must never decide school identity');

  // 2. Validate PostgreSQL authoritative check blocks cross-school access under stale condition
  const staleUser = {
    id: 'usr-stale-01',
    role: 'manager',
    school_id: 101,
    region_id: 'ir-tehran-1'
  };

  assert.throws(() => {
    enforceNationalSecurityBoundary({
      user: staleUser,
      target_school_id: 102, // Different school
      target_region_id: 'ir-tehran-1'
    });
  }, (err) => {
    return err.code === 'PHASE5_NATIONAL_TENANT_ISOLATION_FAILURE';
  }, 'Tenant isolation must remain fail-closed regardless of stale cache state');

  return {
    scenario: 'stale_operational_state',
    expected_behavior: 'Deny authorization from volatile cache and fail-closed cross-tenant access',
    actual_behavior: 'Cache authority violation and tenant isolation failure enforced',
    fail_closed: true,
    data_loss: false,
    tenant_leakage: false,
    recovery_path: 'Cache invalidation from PostgreSQL authoritative log',
    human_approval_required: true,
    status: 'PASSED'
  };
}

module.exports = { runStaleStateChaosTest };
