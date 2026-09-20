/**
 * National Capacity Enforcement & Reservation Governance Engine
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation & Hardening
 *
 * Enforces real capacity contracts across national and regional infrastructure:
 * - Ceiling 20,000 Peak RPS
 * - Ceiling 2,500,000 Peak Concurrent Users
 * - Ceiling 2,500 Write TPS
 * - Ceiling 25,000 Outbox Events/sec
 * - Ceiling 3,500 DB Connections
 *
 * Invariants Enforced:
 * - Fail-Closed: Any breach throws designated error and halts admission.
 * - Human Sovereignty: Quota changes and reservations strictly require human approval.
 * - PostgreSQL SSoT: No capacity state derived from volatile Redis cache.
 * - Zero Ranking Guarantee: Strict rejection of comparative rankings.
 */

'use strict';

const { CANONICAL_NATIONAL_REGIONS } = require('./national-region-control-plane');
const { NATIONAL_TARGET_CAPACITY } = require('./national-capacity-engine');
const { assertDisasterRecoveryZeroRanking } = require('./disaster-recovery');
const authority = require('./authority');

const CAPACITY_ENFORCEMENT_ERRORS = Object.freeze({
  CAPACITY_LIMIT_BREACH: 'PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH',
  WRITE_CAPACITY_BREACH: 'PHASE5_NATIONAL_WRITE_CAPACITY_BREACH',
  EVENT_CAPACITY_BREACH: 'PHASE5_NATIONAL_EVENT_CAPACITY_BREACH',
  DB_CAPACITY_BREACH: 'PHASE5_NATIONAL_DB_CAPACITY_BREACH',
  RESERVATION_APPROVAL_REQUIRED: 'PHASE5_RESERVATION_APPROVAL_REQUIRED',
  RESERVATION_INVALID: 'PHASE5_RESERVATION_INVALID',
  RESERVATION_EXPIRED: 'PHASE5_RESERVATION_EXPIRED',
  ZERO_RANKING_VIOLATION: 'ZERO_RANKING_VIOLATION'
});

const NATIONAL_LIMITS = Object.freeze({
  MAX_RPS: 20000,
  MAX_CONCURRENT_USERS: 2500000,
  MAX_WRITE_TPS: 2500,
  MAX_EVENT_THROUGHPUT: 25000,
  MAX_DB_CONNECTIONS: 3500
});

// Capacity reservation tracking store (backed by PostgreSQL in production)
/**
 * Non-authoritative local cache for capacity reservations.
 * CONTRACT: PostgreSQL table 'authority_state' (kind: 'reservation') is the sole SSoT.
 * This Map is strictly a read-through cache. In production and by default,
 * all reads and writes fail closed (AUTHORITY_UNAVAILABLE) if PostgreSQL authority is unattached.
 */
const activeReservations = new Map();

function isExplicitDevMemoryMode() {
  if (process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production' || process.env.DATABASE_URL) {
    return false;
  }
  return process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1';
}

function assertAuthorityAttachedIfRequired() {
  if (isExplicitDevMemoryMode()) return;
  if (!authority.attached()) {
    const err = new Error('AUTHORITY_UNAVAILABLE: National capacity enforcement requires live PostgreSQL authority');
    err.code = 'AUTHORITY_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

async function persistReservation(row) {
  if (!row || !row.reservation_id) return;
  if (!authority.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return;
  }
  const version = await authority.putState('reservation', row.reservation_id, row, row.operator_id);
  return version;
}

async function refreshReservationsFromSoT() {
  if (!authority.attached()) {
    if (!isExplicitDevMemoryMode()) {
      const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
      err.code = 'AUTHORITY_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    return false;
  }
  const rows = await authority.listState('reservation');
  for (const r of rows) {
    if (r && r.id && r.payload) activeReservations.set(r.id, Object.assign({}, r.payload, { version: r.version, source: 'PG_AUTHORITY' }));
  }
  return true;
}

/**
 * Asserts that real/observed metrics do not breach national capacity contracts.
 * Enforces Fail-Closed behavior immediately upon limit breach.
 *
 * @param {Object} metrics - { rps, concurrent_users, write_tps, event_throughput, db_connections, region_id }
 * @param {Object} options - { strict: true }
 * @returns {boolean}
 */
function assertNationalCapacityEnforcement(metrics = {}, options = {}) {
  assertDisasterRecoveryZeroRanking(metrics);
  assertDisasterRecoveryZeroRanking(options);

  const rps = metrics.rps != null ? Number(metrics.rps) : 0;
  const concurrent = metrics.concurrent_users != null ? Number(metrics.concurrent_users) : 0;
  const writeTps = metrics.write_tps != null ? Number(metrics.write_tps) : 0;
  const events = metrics.event_throughput != null ? Number(metrics.event_throughput) : 0;
  const dbConns = metrics.db_connections != null ? Number(metrics.db_connections) : 0;

  // 1. Check Write TPS ceiling (2,500 writes/sec)
  if (writeTps > NATIONAL_LIMITS.MAX_WRITE_TPS) {
    const err = new Error(
      `PHASE5_NATIONAL_WRITE_CAPACITY_BREACH: Write throughput ${writeTps} TPS exceeds national limit ${NATIONAL_LIMITS.MAX_WRITE_TPS} TPS`
    );
    err.code = CAPACITY_ENFORCEMENT_ERRORS.WRITE_CAPACITY_BREACH;
    err.metric = 'write_tps';
    err.observed = writeTps;
    err.limit = NATIONAL_LIMITS.MAX_WRITE_TPS;
    throw err;
  }

  // 2. Check Event Throughput ceiling (25,000 eps)
  if (events > NATIONAL_LIMITS.MAX_EVENT_THROUGHPUT) {
    const err = new Error(
      `PHASE5_NATIONAL_EVENT_CAPACITY_BREACH: Event throughput ${events} eps exceeds national outbox limit ${NATIONAL_LIMITS.MAX_EVENT_THROUGHPUT} eps`
    );
    err.code = CAPACITY_ENFORCEMENT_ERRORS.EVENT_CAPACITY_BREACH;
    err.metric = 'event_throughput';
    err.observed = events;
    err.limit = NATIONAL_LIMITS.MAX_EVENT_THROUGHPUT;
    throw err;
  }

  // 3. Check Database Connections ceiling (3,500 connections)
  if (dbConns > NATIONAL_LIMITS.MAX_DB_CONNECTIONS) {
    const err = new Error(
      `PHASE5_NATIONAL_DB_CAPACITY_BREACH: Database active connections ${dbConns} exceeds pool ceiling ${NATIONAL_LIMITS.MAX_DB_CONNECTIONS}`
    );
    err.code = CAPACITY_ENFORCEMENT_ERRORS.DB_CAPACITY_BREACH;
    err.metric = 'db_connections';
    err.observed = dbConns;
    err.limit = NATIONAL_LIMITS.MAX_DB_CONNECTIONS;
    throw err;
  }

  // 4. Check Global RPS and Concurrent Users
  if (rps > NATIONAL_LIMITS.MAX_RPS || concurrent > NATIONAL_LIMITS.MAX_CONCURRENT_USERS) {
    const err = new Error(
      `PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH: Capacity demand (RPS: ${rps}, Concurrent: ${concurrent}) exceeds national targets (RPS: ${NATIONAL_LIMITS.MAX_RPS}, Concurrent: ${NATIONAL_LIMITS.MAX_CONCURRENT_USERS})`
    );
    err.code = CAPACITY_ENFORCEMENT_ERRORS.CAPACITY_LIMIT_BREACH;
    err.metric = rps > NATIONAL_LIMITS.MAX_RPS ? 'rps' : 'concurrent_users';
    err.observed = { rps, concurrent };
    err.limit = { rps: NATIONAL_LIMITS.MAX_RPS, concurrent: NATIONAL_LIMITS.MAX_CONCURRENT_USERS };
    throw err;
  }

  // 5. Region-specific capacity check if region_id is provided
  if (metrics.region_id) {
    const reg = CANONICAL_NATIONAL_REGIONS.find(r => r.region_id === metrics.region_id);
    if (reg && reg.capacity_profile) {
      if (rps > reg.capacity_profile.max_rps) {
        const err = new Error(
          `PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH: Regional RPS ${rps} exceeds region "${metrics.region_id}" capacity ${reg.capacity_profile.max_rps}`
        );
        err.code = CAPACITY_ENFORCEMENT_ERRORS.CAPACITY_LIMIT_BREACH;
        err.metric = 'region_rps';
        err.region_id = metrics.region_id;
        throw err;
      }
      if (dbConns > reg.capacity_profile.database_connections_limit) {
        const err = new Error(
          `PHASE5_NATIONAL_DB_CAPACITY_BREACH: Regional DB connections ${dbConns} exceeds region "${metrics.region_id}" limit ${reg.capacity_profile.database_connections_limit}`
        );
        err.code = CAPACITY_ENFORCEMENT_ERRORS.DB_CAPACITY_BREACH;
        err.metric = 'region_db_connections';
        err.region_id = metrics.region_id;
        throw err;
      }
    }
  }

  return true;
}

/**
 * Checks available capacity headroom for a given region.
 */
function checkRegionCapacityHeadroom(regionId, currentDemand = {}) {
  assertDisasterRecoveryZeroRanking(currentDemand);

  const reg = CANONICAL_NATIONAL_REGIONS.find(r => r.region_id === regionId);
  if (!reg) {
    const err = new Error(`Region ${regionId} not found in canonical control plane`);
    err.code = 'PHASE5_NATIONAL_REGION_NOT_FOUND';
    throw err;
  }

  const profile = reg.capacity_profile || {
    max_rps: 2000,
    max_concurrent_users: 500000,
    database_connections_limit: 500,
    event_throughput_limit: 3000
  };

  const currentRps = Number(currentDemand.rps || 0);
  const currentConcurrent = Number(currentDemand.concurrent_users || 0);
  const currentDb = Number(currentDemand.db_connections || 0);

  const rpsHeadroom = Math.max(0, profile.max_rps - currentRps);
  const concurrentHeadroom = Math.max(0, profile.max_concurrent_users - currentConcurrent);
  const dbHeadroom = Math.max(0, profile.database_connections_limit - currentDb);

  const hasHeadroom = rpsHeadroom > 0 && concurrentHeadroom > 0 && dbHeadroom > 0;

  return {
    region_id: regionId,
    profile,
    current_demand: { rps: currentRps, concurrent_users: currentConcurrent, db_connections: currentDb },
    headroom: {
      rps_headroom: rpsHeadroom,
      concurrent_headroom: concurrentHeadroom,
      db_headroom: dbHeadroom
    },
    sufficient_headroom: hasHeadroom
  };
}

/**
 * Creates and registers a Capacity Reservation.
 * Strictly requires human approval.
 */
function createCapacityReservation(reservationPayload, approvalPayload) {
  assertAuthorityAttachedIfRequired();
  assertDisasterRecoveryZeroRanking(reservationPayload);
  assertDisasterRecoveryZeroRanking(approvalPayload);

  if (!approvalPayload || approvalPayload.approved !== true) {
    const err = new Error('Capacity reservation requires explicit human approval');
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
    throw err;
  }

  if (approvalPayload.automated_decision === true || approvalPayload.automated_execution === true) {
    const err = new Error('Automated capacity reservation is strictly forbidden');
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
    throw err;
  }

  const { operator_id, approval_id, reason } = approvalPayload;
  if (!operator_id || !approval_id || !reason) {
    const err = new Error('Missing mandatory operator_id, approval_id, or reason for capacity reservation');
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
    throw err;
  }

  if (!reservationPayload || !reservationPayload.region_id || !reservationPayload.tenant_id) {
    const err = new Error('Reservation requires valid region_id and tenant_id');
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_INVALID;
    throw err;
  }

  const requested = reservationPayload.requested_capacity || {};
  const approved = reservationPayload.approved_capacity || requested;

  // Validate that approved capacity does not breach national ceilings
  assertNationalCapacityEnforcement({
    rps: approved.rps || 0,
    concurrent_users: approved.concurrent_users || 0,
    write_tps: approved.write_tps || 0,
    event_throughput: approved.event_throughput || 0,
    db_connections: approved.db_connections || 0,
    region_id: reservationPayload.region_id
  });

  const reservationId = reservationPayload.reservation_id || `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date();
  const durationMinutes = reservationPayload.duration_minutes || 120;
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  const reservation = {
    reservation_id: reservationId,
    region_id: reservationPayload.region_id,
    tenant_id: reservationPayload.tenant_id,
    requested_capacity: requested,
    approved_capacity: approved,
    operator_id: String(operator_id).trim(),
    approval_id: String(approval_id).trim(),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    reason: String(reason).trim(),
    status: 'ACTIVE'
  };

  let persistPromise;
  if (authority.attached()) {
    persistPromise = persistReservation(reservation).then(() => {
      activeReservations.set(reservationId, reservation);
      return Object.freeze({ ...reservation });
    });
  } else if (!isExplicitDevMemoryMode()) {
    const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
    err.code = 'AUTHORITY_UNAVAILABLE';
    err.status = 503;
    throw err;
  } else {
    activeReservations.set(reservationId, reservation);
    persistPromise = Promise.resolve(Object.freeze({ ...reservation }));
  }

  const p = persistPromise.then(() => Object.freeze({ ...reservation }));
  Object.assign(p, Object.freeze({ ...reservation }));
  return p;
}

/**
 * Releases or terminates an active capacity reservation.
 */
function releaseCapacityReservation(reservationId, operatorPayload) {
  assertAuthorityAttachedIfRequired();
  assertDisasterRecoveryZeroRanking(operatorPayload);

  if (!activeReservations.has(reservationId)) {
    const err = new Error(`Capacity reservation ${reservationId} not found`);
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_INVALID;
    throw err;
  }

  if (!operatorPayload || !operatorPayload.operator_id) {
    const err = new Error('Releasing a reservation requires operator_id');
    err.code = CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
    throw err;
  }

  const res = activeReservations.get(reservationId);
  const candidate = {
    ...res,
    status: 'RELEASED',
    released_at: new Date().toISOString(),
    released_by: String(operatorPayload.operator_id).trim()
  };

  let persistPromise;
  if (authority.attached()) {
    persistPromise = persistReservation(candidate).then(() => {
      activeReservations.set(reservationId, candidate);
      return Object.freeze({ ...candidate });
    });
  } else if (!isExplicitDevMemoryMode()) {
    const err = new Error('AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached');
    err.code = 'AUTHORITY_UNAVAILABLE';
    err.status = 503;
    throw err;
  } else {
    activeReservations.set(reservationId, candidate);
    persistPromise = Promise.resolve(Object.freeze({ ...candidate }));
  }

  const p = persistPromise.then(() => Object.freeze({ ...candidate }));
  Object.assign(p, Object.freeze({ ...candidate }));
  return p;
}

/**
 * Retrieves capacity reservations with optional filtering.
 */
function getCapacityReservations(filter = {}) {
  assertAuthorityAttachedIfRequired();
  assertDisasterRecoveryZeroRanking(filter);
  const now = new Date();
  const list = Array.from(activeReservations.values());

  return list.map(item => {
    // Check expiration dynamically
    if (item.status === 'ACTIVE' && new Date(item.expires_at) < now) {
      item.status = 'EXPIRED';
    }
    return Object.freeze({ ...item });
  }).filter(item => {
    if (filter.status && item.status !== filter.status) return false;
    if (filter.region_id && item.region_id !== filter.region_id) return false;
    if (filter.tenant_id && item.tenant_id !== filter.tenant_id) return false;
    return true;
  });
}

/**
 * Retrieves a single reservation by ID.
 */
function getCapacityReservationById(reservationId) {
  assertAuthorityAttachedIfRequired();
  const res = activeReservations.get(reservationId);
  if (!res) return null;
  return Object.freeze({ ...res });
}

/**
 * Clears reservation tracking store for test isolation.
 */
function resetCapacityEnforcementForTests() {
  activeReservations.clear();
}

module.exports = {
  CAPACITY_ENFORCEMENT_ERRORS,
  NATIONAL_LIMITS,
  assertNationalCapacityEnforcement,
  checkRegionCapacityHeadroom,
  createCapacityReservation,
  releaseCapacityReservation,
  getCapacityReservations,
  getCapacityReservationById,
  resetCapacityEnforcementForTests,
  refreshReservationsFromSoT
};
