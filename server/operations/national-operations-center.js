/**
 * National Operations Center (NOC) — Real-Time Operations Layer
 * Phase 5 Step 4 (P2-NI-02): National Production Readiness & Operations
 *
 * Provides real-time operational aggregation across all 7 national regions,
 * API & SLO compliance, incident lifecycle management, and human-in-the-loop state transitions.
 *
 * Invariants Enforced:
 * - Human approval mandatory for any operational state change (Fail-Closed).
 * - No automated infrastructure state changes allowed.
 * - PostgreSQL is sole source of truth; Redis cache only.
 * - Zero Ranking Guarantee: No comparative ranking across schools or regions.
 */

'use strict';

const { CANONICAL_NATIONAL_REGIONS, calculateNationalRegionHealthSummary } = require('../infrastructure/national-region-control-plane');
const { NATIONAL_SLO_TARGETS, buildNationalOperationsDashboard } = require('../monitoring/national-observability-plane');
const { assertDisasterRecoveryZeroRanking } = require('../infrastructure/disaster-recovery');
const authority = require('../infrastructure/authority');

const NOC_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  RECOVERY: 'RECOVERY'
});

const INCIDENT_SEVERITY = Object.freeze({
  P1_CRITICAL: 'P1_CRITICAL',
  P2_HIGH: 'P2_HIGH',
  P3_MEDIUM: 'P3_MEDIUM',
  P4_LOW: 'P4_LOW'
});

const INCIDENT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  MITIGATING: 'MITIGATING',
  RESOLVED: 'RESOLVED'
});

const NOC_ERRORS = Object.freeze({
  APPROVAL_REQUIRED: 'PHASE5_NOC_APPROVAL_REQUIRED',
  AUTOMATED_FORBIDDEN: 'PHASE5_NOC_AUTOMATED_DECISION_FORBIDDEN',
  INVALID_STATE: 'PHASE5_NOC_INVALID_STATE',
  INVALID_INCIDENT: 'PHASE5_NOC_INVALID_INCIDENT',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

// In-memory runtime state for operations center (PostgreSQL authority in production)
let currentNocState = NOC_STATES.NORMAL;
const nocStateTransitionHistory = [];
const activeIncidents = new Map();

async function persistIncident(row) {
  if (!row || !row.incident_id) return;
  if (!authority.attached()) {
    if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  await authority.putState('noc_incident', row.incident_id, row, row.operator_id);
}

async function persistNocState() {
  if (!authority.attached()) {
    if (process.env.DATABASE_URL) {
      const err = new Error('AUTHORITY_UNAVAILABLE');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  await authority.putState('noc_state', 'current', {
    state: currentNocState,
    history: nocStateTransitionHistory.slice(-50)
  });
}

async function refreshNocFromSoT() {
  if (!authority.attached()) return false;
  const st = await authority.getState('noc_state', 'current');
  if (st && st.state) currentNocState = st.state;
  if (st && Array.isArray(st.history)) {
    nocStateTransitionHistory.length = 0;
    nocStateTransitionHistory.push(...st.history);
  }
  const rows = await authority.listState('noc_incident');
  for (const r of rows) {
    if (r && r.id && r.payload) activeIncidents.set(r.id, r.payload);
  }
  return true;
}

/**
 * Validates human approval attributes for any operational transition.
 */
function assertNocHumanApproval(payload) {
  if (!payload || typeof payload !== 'object') {
    const err = new Error('NOC state change requires explicit human approval payload');
    err.code = NOC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (payload.automated_decision === true || payload.automated_execution === true || payload.auto_trigger === true) {
    const err = new Error('Automated NOC state changes are forbidden in national production');
    err.code = NOC_ERRORS.AUTOMATED_FORBIDDEN;
    throw err;
  }

  const { operator_id, approval_id, timestamp, reason } = payload;
  if (!operator_id || typeof operator_id !== 'string' || operator_id.trim().length === 0) {
    const err = new Error('Missing mandatory operator_id for NOC transition');
    err.code = NOC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!approval_id || typeof approval_id !== 'string' || approval_id.trim().length === 0) {
    const err = new Error('Missing mandatory approval_id for NOC transition');
    err.code = NOC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!timestamp) {
    const err = new Error('Missing mandatory timestamp for NOC transition');
    err.code = NOC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    const err = new Error('Missing mandatory reason for NOC transition');
    err.code = NOC_ERRORS.APPROVAL_REQUIRED;
    throw err;
  }

  return true;
}

/**
 * Transitions the National Operations Center state.
 * Requires human approval.
 */
async function transitionNocState(targetState, approvalPayload) {
  assertDisasterRecoveryZeroRanking(approvalPayload);
  assertNocHumanApproval(approvalPayload);

  if (!Object.values(NOC_STATES).includes(targetState)) {
    const err = new Error(`Invalid target NOC state: ${targetState}`);
    err.code = NOC_ERRORS.INVALID_STATE;
    throw err;
  }

  const previousState = currentNocState;
  currentNocState = targetState;

  const record = Object.freeze({
    transition_id: `noc-tr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    from_state: previousState,
    to_state: targetState,
    operator_id: approvalPayload.operator_id.trim(),
    approval_id: approvalPayload.approval_id.trim(),
    timestamp: new Date(approvalPayload.timestamp).toISOString(),
    reason: approvalPayload.reason.trim(),
    requires_human_approval: true,
    automated_decision: false
  });

  nocStateTransitionHistory.push(record);
  await persistNocState();
  return record;
}

/**
 * Records or updates an incident in the National Operations Center.
 */
async function recordNocIncident(incidentData, approvalPayload) {
  assertDisasterRecoveryZeroRanking(incidentData);
  assertDisasterRecoveryZeroRanking(approvalPayload);
  assertNocHumanApproval(approvalPayload);

  if (!incidentData || !incidentData.incident_id || !incidentData.title) {
    const err = new Error('Incident data must include incident_id and title');
    err.code = NOC_ERRORS.INVALID_INCIDENT;
    throw err;
  }

  const severity = incidentData.severity || INCIDENT_SEVERITY.P3_MEDIUM;
  if (!Object.values(INCIDENT_SEVERITY).includes(severity)) {
    const err = new Error(`Invalid incident severity: ${severity}`);
    err.code = NOC_ERRORS.INVALID_INCIDENT;
    throw err;
  }

  const status = incidentData.status || INCIDENT_STATUS.OPEN;
  if (!Object.values(INCIDENT_STATUS).includes(status)) {
    const err = new Error(`Invalid incident status: ${status}`);
    err.code = NOC_ERRORS.INVALID_INCIDENT;
    throw err;
  }

  const incident = {
    incident_id: String(incidentData.incident_id),
    title: String(incidentData.title),
    region_id: incidentData.region_id || 'national-fabric',
    severity,
    status,
    description: incidentData.description || '',
    operator_id: approvalPayload.operator_id.trim(),
    approval_id: approvalPayload.approval_id.trim(),
    created_at: incidentData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    mitigation_plan: incidentData.mitigation_plan || 'Standard runbook execution'
  };

  activeIncidents.set(incident.incident_id, incident);
  await persistIncident(incident);
  return Object.freeze({ ...incident });
}

/**
 * Retrieves the list of recorded NOC incidents.
 */
function getNocIncidents(filter = {}) {
  assertDisasterRecoveryZeroRanking(filter);
  const incidents = Array.from(activeIncidents.values());

  if (filter.status) {
    return incidents.filter(inc => inc.status === filter.status);
  }
  if (filter.region_id) {
    return incidents.filter(inc => inc.region_id === filter.region_id);
  }
  return incidents;
}

/**
 * Resolves an active incident.
 */
async function resolveNocIncident(incidentId, resolutionDetails, approvalPayload) {
  assertDisasterRecoveryZeroRanking(resolutionDetails);
  assertDisasterRecoveryZeroRanking(approvalPayload);
  assertNocHumanApproval(approvalPayload);

  if (!activeIncidents.has(incidentId)) {
    const err = new Error(`Incident ${incidentId} not found`);
    err.code = NOC_ERRORS.INVALID_INCIDENT;
    throw err;
  }

  const incident = activeIncidents.get(incidentId);
  incident.status = INCIDENT_STATUS.RESOLVED;
  incident.resolved_at = new Date().toISOString();
  incident.resolution_summary = resolutionDetails.summary || 'Resolved by NOC operator';
  incident.resolved_by = approvalPayload.operator_id.trim();

  activeIncidents.set(incidentId, incident);
  await persistIncident(incident);
  return Object.freeze({ ...incident });
}

/**
 * Aggregates the full National Operations Center real-time view.
 */
function getNationalOperationsCenterSnapshot(options = {}) {
  assertDisasterRecoveryZeroRanking(options);

  // 1. Region & Cluster status aggregation
  const regionHealthSummary = calculateNationalRegionHealthSummary();
  const regionBreakdown = CANONICAL_NATIONAL_REGIONS.map(reg => ({
    region_id: reg.region_id,
    region_name: reg.name,
    primary_dc: reg.primary_dc,
    secondary_dc: reg.secondary_dc,
    status: reg.initial_state,
    target_rps: reg.capacity_profile ? reg.capacity_profile.max_rps : 2000,
    provinces_count: Array.isArray(reg.province_scope) ? reg.province_scope.length : 0
  }));

  // 2. Observability & SLO dashboard aggregation
  const observabilityDashboard = buildNationalOperationsDashboard(options);

  // 3. Incidents aggregation
  const incidents = Array.from(activeIncidents.values());
  const openIncidents = incidents.filter(inc => inc.status !== INCIDENT_STATUS.RESOLVED);
  const criticalIncidents = openIncidents.filter(inc => inc.severity === INCIDENT_SEVERITY.P1_CRITICAL);

  // 4. Determine calculated recommended state
  let calculatedState = NOC_STATES.NORMAL;
  const isSloPass = observabilityDashboard.slo_performance && observabilityDashboard.slo_performance.overall_slo_pass;
  if (criticalIncidents.length > 0) {
    calculatedState = NOC_STATES.CRITICAL;
  } else if (openIncidents.length > 0 || !isSloPass) {
    calculatedState = NOC_STATES.WARNING;
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    noc_state: currentNocState,
    recommended_state: calculatedState,
    requires_human_approval_to_transition: true,
    sovereign_governance: {
      single_source_of_truth: 'PostgreSQL',
      cache_mode: 'Redis Cache-Only (Non-Authoritative)',
      human_in_the_loop: true,
      zero_ranking_guarantee: true
    },
    regions_overview: {
      total_regions: regionBreakdown.length,
      active_regions: regionHealthSummary.active_regions,
      ready_regions: regionHealthSummary.ready_regions,
      degraded_regions: regionHealthSummary.degraded_regions,
      maintenance_regions: regionHealthSummary.maintenance_regions,
      regions: regionBreakdown
    },
    slo_performance: observabilityDashboard.slo_performance,
    api_telemetry: observabilityDashboard.slo_performance ? observabilityDashboard.slo_performance.observed : {},
    incidents_overview: {
      total_recorded: incidents.length,
      active_open: openIncidents.length,
      critical_p1: criticalIncidents.length,
      incidents: openIncidents
    },
    transition_audit_log: [...nocStateTransitionHistory].slice(-10)
  };

  assertDisasterRecoveryZeroRanking(snapshot);
  return Object.freeze(snapshot);
}

/**
 * Resets runtime state for test isolations.
 */
function resetNocStateForTests() {
  currentNocState = NOC_STATES.NORMAL;
  nocStateTransitionHistory.length = 0;
  activeIncidents.clear();
}

module.exports = {
  NOC_STATES,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  NOC_ERRORS,
  assertNocHumanApproval,
  transitionNocState,
  recordNocIncident,
  getNocIncidents,
  resolveNocIncident,
  getNationalOperationsCenterSnapshot,
  resetNocStateForTests,
  refreshNocFromSoT
};
