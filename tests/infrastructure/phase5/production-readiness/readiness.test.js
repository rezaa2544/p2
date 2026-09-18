/**
 * National Production Readiness Engine Unit Test Suite
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 */

'use strict';

const assert = require('assert');
const {
  READINESS_VERDICT,
  READINESS_ERRORS,
  evaluateNationalProductionReadiness,
  assertHumanProductionSignOff
} = require('../../../../server/infrastructure/national-production-readiness');

function runReadinessTests() {
  // 1. Evaluate readiness snapshot structure
  const report = evaluateNationalProductionReadiness();
  assert.ok(report.timestamp);
  assert.ok([READINESS_VERDICT.GO, READINESS_VERDICT.NO_GO].includes(report.overall_verdict));
  assert.strictEqual(report.requires_human_approval, true);
  assert.strictEqual(report.automated_decision, false);

  // 2. Pillars coverage
  const pillars = report.pillars;
  assert.ok(pillars.infrastructure_ready, 'Must include infrastructure_ready pillar');
  assert.ok(pillars.security_ready, 'Must include security_ready pillar');
  assert.ok(pillars.capacity_ready, 'Must include capacity_ready pillar');
  assert.ok(pillars.dr_ready, 'Must include dr_ready pillar');
  assert.ok(pillars.observability_ready, 'Must include observability_ready pillar');
  assert.ok(pillars.documentation_ready, 'Must include documentation_ready pillar');

  // 3. Automated sign-off must fail closed
  assert.throws(() => {
    assertHumanProductionSignOff({
      automated_decision: true,
      operator_id: 'auto-agent'
    });
  }, (err) => {
    return err.code === READINESS_ERRORS.AUTOMATED_DEPLOYMENT_FORBIDDEN;
  }, 'Automated sign-off must be forbidden');

  // 4. Missing required sign-off attributes
  assert.throws(() => {
    assertHumanProductionSignOff({
      operator_id: 'op-commander'
      // missing sign_off_id, timestamp, approval_decision
    });
  }, (err) => {
    return err.code === READINESS_ERRORS.APPROVAL_REQUIRED;
  }, 'Missing sign-off attributes must be rejected');

  // 5. Valid human sign-off
  const validSignOff = {
    operator_id: 'op-commander-99',
    sign_off_id: 'signoff-2026-prod-01',
    timestamp: new Date().toISOString(),
    approval_decision: 'APPROVED',
    comment: 'All infrastructure gates green'
  };
  const verified = assertHumanProductionSignOff(validSignOff);
  assert.strictEqual(verified, true);

  // 6. Zero ranking violation
  assert.throws(() => {
    evaluateNationalProductionReadiness({
      league_table: true
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keywords must be rejected');

  return { suite: 'readiness', passed: 6 };
}

if (require.main === module) {
  const res = runReadinessTests();
  console.log(`✅ readiness.test.js: ${res.passed}/6 passed`);
}

module.exports = { runReadinessTests };
