/**
 * Change Management Governance Unit Test Suite
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness
 */

'use strict';

const assert = require('assert');
const {
  CHANGE_RISK_LEVEL,
  CHANGE_STATUS,
  CHANGE_ERRORS,
  registerChangeRequest,
  approveChangeRequest,
  executeChangeRequest,
  rollbackChangeRequest,
  getChangeRequests,
  getChangeRequestById,
  resetChangeRegistryForTests
} = require('../../../../server/infrastructure/change-management');

function runChangeManagementTests() {
  resetChangeRegistryForTests();

  // 1. Missing mandatory requester / rollback_plan
  assert.throws(() => {
    registerChangeRequest({
      title: 'Invalid Request Without Requester or Rollback'
    });
  }, (err) => {
    return err.code === CHANGE_ERRORS.INVALID_CHANGE;
  }, 'Change request without mandatory fields must be rejected');

  // 2. Register change with pending approval
  const pendingChange = registerChangeRequest({
    change_id: 'cr-test-001',
    title: 'Upgrade cluster border connection pool',
    requester: 'op-infra-lead',
    risk_level: CHANGE_RISK_LEVEL.HIGH,
    rollback_plan: 'Rollback connection pool config to 400 connections'
  });
  assert.strictEqual(pendingChange.status, CHANGE_STATUS.PENDING_APPROVAL);

  // 3. Execution without approval fails closed
  assert.throws(() => {
    executeChangeRequest('cr-test-001', {
      operator_id: 'op-infra-lead'
    });
  }, (err) => {
    return err.code === CHANGE_ERRORS.APPROVAL_REQUIRED;
  }, 'Unapproved change execution must fail closed');

  // 4. Automated approval attempt rejected
  assert.throws(() => {
    approveChangeRequest('cr-test-001', {
      automated_decision: true,
      operator: 'auto-pilot-bot',
      approval_id: 'appv-auto-1'
    });
  }, (err) => {
    return err.code === CHANGE_ERRORS.AUTOMATED_FORBIDDEN;
  }, 'Automated approval must be forbidden');

  // 5. Valid human approval
  const approvedChange = approveChangeRequest('cr-test-001', {
    approval_id: 'appv-human-001',
    operator: 'sec-officer-9',
    timestamp: new Date().toISOString()
  });
  assert.strictEqual(approvedChange.status, CHANGE_STATUS.APPROVED);

  // 6. Authorized execution
  const executedChange = executeChangeRequest('cr-test-001', {
    operator_id: 'sec-officer-9',
    details: 'Applied successfully via control plane'
  });
  assert.strictEqual(executedChange.status, CHANGE_STATUS.EXECUTED);

  // 7. Rollback execution
  const rolledBackChange = rollbackChangeRequest('cr-test-001', {
    operator_id: 'sec-officer-9',
    reason: 'Canary error spike observed'
  });
  assert.strictEqual(rolledBackChange.status, CHANGE_STATUS.ROLLED_BACK);

  // 8. Zero ranking guard
  assert.throws(() => {
    registerChangeRequest({
      change_id: 'cr-test-bad',
      requester: 'op-lead',
      rollback_plan: 'Standard revert',
      ranking_score: 95
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keywords must be rejected in change requests');

  resetChangeRegistryForTests();
  return { suite: 'change-management', passed: 8 };
}

if (require.main === module) {
  const res = runChangeManagementTests();
  console.log(`✅ change-management.test.js: ${res.passed}/8 passed`);
}

module.exports = { runChangeManagementTests };
