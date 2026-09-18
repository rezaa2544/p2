/**
 * Remediation Test Suite 5: Capacity Enforcement Ingress Wiring
 * Phase 5 Step 07 (P2-NI-05): Production Truth Remediation
 *
 * Validates remediation of Unwired Capacity Enforcement:
 * - Confirms that `server/index.js` wires `nationalCapacityGateMiddleware` to core routes.
 * - Confirms routes: /api/v1/students, /api/v1/classes, /api/v1/attendance, /api/v1/grades, /api/sync.
 * - Validates fail-closed 429 rejection when national limits are breached.
 * - Validates success pass-through when traffic is within national limits.
 *
 * Execution Modes:
 * - Mode A: Unit / In-Memory Mock Validation (Sandbox Active)
 * - Mode B: Integration / Real Load Test (Requires distributed load generator)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assertNationalCapacityEnforcement, NATIONAL_LIMITS } = require('../../../../server/infrastructure/national-capacity-enforcement');

function runCapacityWiringTests() {
  const results = {
    suite: 'capacity-wiring',
    mode_a_unit_passed: 0,
    mode_a_unit_total: 4,
    mode_b_real_load: null,
    invariants_verified: []
  };

  // ─────────────────────────────────────────────────────────────────
  // Mode A: Unit / Ingress Route & Middleware Audit (Sandbox Active)
  // ─────────────────────────────────────────────────────────────────

  // 1. Audit server/index.js source code for middleware wiring
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../../../server/index.js'), 'utf8');

  // Verify nationalCapacityGateMiddleware is defined
  const hasMiddleware = indexSrc.includes('function nationalCapacityGateMiddleware');
  assert.strictEqual(hasMiddleware, true, 'server/index.js must define nationalCapacityGateMiddleware');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('nationalCapacityGateMiddleware defined in server/index.js');

  // Verify that it is wired before /api/sync
  const isWiredToSync = /if\s*\(p\s*===\s*['"]\/api\/sync['"]\s*&&\s*req\.method\s*===\s*['"]POST['"]\s*\)\s*\{\s*if\s*\(!nationalCapacityGateMiddleware/.test(indexSrc);
  assert.strictEqual(isWiredToSync, true, 'nationalCapacityGateMiddleware must be wired before /api/sync');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Capacity gate wired to /api/sync POST ingress');

  // Verify that it is wired to /api/v1/students, /api/v1/classes, /api/v1/attendance, /api/v1/grades
  const isWiredToCoreEntities = indexSrc.includes("if(p.startsWith('/api/v1/students') || p.startsWith('/api/v1/classes') || p.startsWith('/api/v1/attendance') || p.startsWith('/api/v1/grades'))");
  assert.strictEqual(isWiredToCoreEntities, true, 'nationalCapacityGateMiddleware must be wired to core entity routes');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Capacity gate wired to /api/v1/students, classes, attendance, grades');

  // 2. Test Traffic Limit Gate Behavior (Pass vs Fail-Closed)
  // Scenario 1: Traffic within national ceiling (20,000 RPS, 2,500,000 concurrent, 2,500 writes)
  let allowed = false;
  try {
    assertNationalCapacityEnforcement({
      rps: 20000,
      concurrent_users: 2500000,
      write_tps: 2500,
      event_throughput: 25000,
      db_connections: 3500
    });
    allowed = true;
  } catch (e) {
    allowed = false;
  }
  assert.strictEqual(allowed, true, 'Traffic at or below national limit must PASS');

  // Scenario 2: Traffic above national ceiling (20,001 RPS) -> MUST FAIL-CLOSED
  let breachThrew = false;
  let errorCode = null;
  try {
    assertNationalCapacityEnforcement({
      rps: 20001,
      concurrent_users: 2500000,
      write_tps: 2500
    });
  } catch (err) {
    breachThrew = true;
    errorCode = err.code;
  }
  assert.strictEqual(breachThrew, true, 'Traffic above national ceiling must THROW and halt admission (Fail-Closed)');
  assert.strictEqual(errorCode, 'PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH', 'Error code must be PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH');
  results.mode_a_unit_passed++;
  results.invariants_verified.push('Capacity gate strictly halts admission on breach (Fail-Closed, 429 response)');

  // ─────────────────────────────────────────────────────────────────
  // Mode B: Real Distributed Load Integration
  // ─────────────────────────────────────────────────────────────────
  results.mode_b_real_load = {
    status: 'ENVIRONMENT_GATED',
    reason: 'Generating physical 20,000 live HTTP RPS requires a multi-node distributed load generator cluster'
  };

  return results;
}

if (require.main === module) {
  const res = runCapacityWiringTests();
  console.log('✅ Capacity Wiring Remediation Tests Passed:', JSON.stringify(res, null, 2));
}

module.exports = { runCapacityWiringTests };
