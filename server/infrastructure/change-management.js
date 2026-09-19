/**
 * Change Management Governance Engine
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness & Operations
 *
 * Governs all infrastructure and operational change requests across national clusters.
 * Invariants Enforced:
 * - Every change MUST have: change_id, requester, approval, risk_level, rollback_plan.
 * - Missing approval throws PHASE5_CHANGE_APPROVAL_REQUIRED.
 * - Automated execution throws PHASE5_CHANGE_AUTOMATED_FORBIDDEN.
 * - Zero Ranking Guarantee strictly preserved.
 */

'use strict';

const { assertDisasterRecoveryZeroRanking } = require('./disaster-recovery');
const authority = require('./authority');

const CHANGE_RISK_LEVEL = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const CHANGE_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  EXECUTED: 'EXECUTED',
  REJECTED: 'REJECTED',
  ROLLED_BACK: 'ROLLED_BACK'
});

const CHANGE_ERRORS = Object.freeze({
  APPROVAL_REQUIRED: 'PHASE5_CHANGE_APPROVAL_REQUIRED',
  AUTOMATED_FORBIDDEN: 'PHASE5_CHANGE_AUTOMATED_FORBIDDEN',
  INVALID_CHANGE: 'PHASE5_CHANGE_INVALID_REQUEST',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

const changeRegistry = new Map();

async function persistChange(row) {
  if (!row || !row.change_id) return;
  if (!authority.attached()) {
    if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  await authority.putState('change', row.change_id, row, row.requester);
  await authority.appendSystemAudit({
    actor: row.requester || 'system',
    action: 'INFRASTRUCTURE_CHANGE_STATE_UPDATE',
    reason: row.title || 'Change management state persisted',
    after: row
  });
}

async function refreshChangesFromSoT() {
  if (!authority.attached()) return false;
  const rows = await authority.listState('change');
  for (const r of rows) {
    if (r && r.id && r.payload) changeRegistry.set(r.id, r.payload);
  }
  return true;
}

/**
 * Validates approval payload for infrastructure changes.
 */
function assertChangeApproval(approval) {
  if (!approval || typeof approval !== 'object') {
    const err = new Error('Change request requires explicit human approval');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (approval.automated_decision === true || approval.automated_execution === true || approval.auto_approved === true) {
    const err = new Error('Automated infrastructure changes are forbidden');
    err.code = CHANGE_ERRORS.AUTOMATED_FORBIDDEN;
    throw err;
  }

  const { approval_id, operator, timestamp } = approval;
  if (!approval_id || typeof approval_id !== 'string' || approval_id.trim().length === 0) {
    const err = new Error('Missing approval_id in change approval');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!operator || typeof operator !== 'string' || operator.trim().length === 0) {
    const err = new Error('Missing operator in change approval');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!timestamp) {
    const err = new Error('Missing timestamp in change approval');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  return true;
}

/**
 * Registers an infrastructure change request.
 */
async function registerChangeRequest(requestData) {
  assertDisasterRecoveryZeroRanking(requestData);

  if (!requestData || typeof requestData !== 'object') {
    const err = new Error('Change request body is required');
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const changeId = requestData.change_id || `cr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const requester = requestData.requester;
  if (!requester || typeof requester !== 'string' || requester.trim().length === 0) {
    const err = new Error('Missing requester in change request');
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const riskLevel = requestData.risk_level || CHANGE_RISK_LEVEL.MEDIUM;
  if (!Object.values(CHANGE_RISK_LEVEL).includes(riskLevel)) {
    const err = new Error(`Invalid risk_level: ${riskLevel}`);
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const rollbackPlan = requestData.rollback_plan;
  if (!rollbackPlan || (typeof rollbackPlan === 'string' && rollbackPlan.trim().length === 0)) {
    const err = new Error('Missing mandatory rollback_plan in change request');
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  // Check if approval is provided up-front or if this is a pending submission
  let status = CHANGE_STATUS.PENDING_APPROVAL;
  let approvalData = null;

  if (requestData.approval) {
    assertChangeApproval(requestData.approval);
    approvalData = {
      approval_id: String(requestData.approval.approval_id).trim(),
      operator: String(requestData.approval.operator).trim(),
      timestamp: new Date(requestData.approval.timestamp).toISOString(),
      requires_human_approval: true,
      automated_decision: false
    };
    status = CHANGE_STATUS.APPROVED;
  }

  const change = {
    change_id: changeId,
    title: requestData.title || 'National Infrastructure Change',
    target_region: requestData.target_region || 'all',
    change_type: requestData.change_type || 'INFRASTRUCTURE_UPDATE',
    requester: requester.trim(),
    risk_level: riskLevel,
    rollback_plan: typeof rollbackPlan === 'string' ? rollbackPlan.trim() : rollbackPlan,
    status,
    approval: approvalData,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  changeRegistry.set(changeId, change);
  await persistChange(change);
  return Object.freeze({ ...change });
}

/**
 * Approves a pending change request with explicit human operator signature.
 */
async function approveChangeRequest(changeId, approvalPayload) {
  assertDisasterRecoveryZeroRanking(approvalPayload);
  assertChangeApproval(approvalPayload);

  if (!changeRegistry.has(changeId)) {
    const err = new Error(`Change request ${changeId} not found`);
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const change = changeRegistry.get(changeId);
  change.status = CHANGE_STATUS.APPROVED;
  change.approval = {
    approval_id: String(approvalPayload.approval_id).trim(),
    operator: String(approvalPayload.operator).trim(),
    timestamp: new Date(approvalPayload.timestamp).toISOString(),
    requires_human_approval: true,
    automated_decision: false
  };
  change.updated_at = new Date().toISOString();

  changeRegistry.set(changeId, change);
  await persistChange(change);
  return Object.freeze({ ...change });
}

/**
 * Executes an approved change request.
 */
async function executeChangeRequest(changeId, executionPayload) {
  assertDisasterRecoveryZeroRanking(executionPayload);

  if (!changeRegistry.has(changeId)) {
    const err = new Error(`Change request ${changeId} not found`);
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const change = changeRegistry.get(changeId);
  if (change.status !== CHANGE_STATUS.APPROVED) {
    const err = new Error(`Change ${changeId} cannot be executed in state ${change.status}; approval is required.`);
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!executionPayload || executionPayload.automated_execution === true) {
    const err = new Error('Automated execution of change requests is forbidden');
    err.code = CHANGE_ERRORS.AUTOMATED_FORBIDDEN;
    throw err;
  }

  if (!executionPayload.operator_id) {
    const err = new Error('Missing operator_id for change execution');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  change.status = CHANGE_STATUS.EXECUTED;
  change.executed_by = executionPayload.operator_id.trim();
  change.executed_at = new Date().toISOString();
  change.execution_details = executionPayload.details || 'Successfully executed';

  changeRegistry.set(changeId, change);
  await persistChange(change);
  return Object.freeze({ ...change });
}

/**
 * Rolls back an executed or approved change request.
 */
async function rollbackChangeRequest(changeId, rollbackPayload) {
  assertDisasterRecoveryZeroRanking(rollbackPayload);

  if (!changeRegistry.has(changeId)) {
    const err = new Error(`Change request ${changeId} not found`);
    err.code = CHANGE_ERRORS.INVALID_CHANGE;
    throw err;
  }

  const change = changeRegistry.get(changeId);
  if (!rollbackPayload || rollbackPayload.automated_rollback === true) {
    const err = new Error('Automated rollback without operator oversight is forbidden');
    err.code = CHANGE_ERRORS.AUTOMATED_FORBIDDEN;
    throw err;
  }

  if (!rollbackPayload.operator_id) {
    const err = new Error('Missing operator_id for change rollback');
    err.code = CHANGE_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  change.status = CHANGE_STATUS.ROLLED_BACK;
  change.rolled_back_by = rollbackPayload.operator_id.trim();
  change.rolled_back_at = new Date().toISOString();
  change.rollback_reason = rollbackPayload.reason || 'Operational intervention rollback';

  changeRegistry.set(changeId, change);
  await persistChange(change);
  return Object.freeze({ ...change });
}

/**
 * Returns recorded change requests.
 */
function getChangeRequests(filter = {}) {
  assertDisasterRecoveryZeroRanking(filter);
  const list = Array.from(changeRegistry.values());
  if (filter.status) {
    return list.filter(c => c.status === filter.status);
  }
  if (filter.risk_level) {
    return list.filter(c => c.risk_level === filter.risk_level);
  }
  return list;
}

/**
 * Returns change request by ID.
 */
function getChangeRequestById(changeId) {
  const change = changeRegistry.get(changeId);
  if (!change) return null;
  return Object.freeze({ ...change });
}

/**
 * Clears registry for test isolation.
 */
function resetChangeRegistryForTests() {
  changeRegistry.clear();
}

module.exports = {
  CHANGE_RISK_LEVEL,
  CHANGE_STATUS,
  CHANGE_ERRORS,
  assertChangeApproval,
  registerChangeRequest,
  approveChangeRequest,
  executeChangeRequest,
  rollbackChangeRequest,
  getChangeRequests,
  getChangeRequestById,
  resetChangeRegistryForTests,
  refreshChangesFromSoT
};
