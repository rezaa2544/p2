/**
 * Capacity Reservation Governance Unit Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  createCapacityReservation,
  releaseCapacityReservation,
  getCapacityReservations,
  getCapacityReservationById,
  resetCapacityEnforcementForTests,
  CAPACITY_ENFORCEMENT_ERRORS
} = require('../../../../server/infrastructure/national-capacity-enforcement');

function runReservationGovernanceTests() {
  resetCapacityEnforcementForTests();

  // 1. Unapproved reservation rejected
  assert.throws(() => {
    createCapacityReservation({
      region_id: 'ir-isfahan-1',
      tenant_id: 'tenant-school-201',
      requested_capacity: { rps: 500, concurrent_users: 100000 }
    }, {
      approved: false
    });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
  }, 'Unapproved reservation must be rejected');

  // 2. Automated reservation rejected
  assert.throws(() => {
    createCapacityReservation({
      region_id: 'ir-isfahan-1',
      tenant_id: 'tenant-school-201',
      requested_capacity: { rps: 500 }
    }, {
      approved: true,
      automated_decision: true,
      operator_id: 'auto-bot',
      approval_id: 'appv-auto',
      reason: 'Auto scale reservation'
    });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.RESERVATION_APPROVAL_REQUIRED;
  }, 'Automated reservation must be forbidden');

  // 3. Valid human-approved reservation
  const reservation = createCapacityReservation({
    reservation_id: 'res-pilot-exam-01',
    region_id: 'ir-isfahan-1',
    tenant_id: 'tenant-school-201',
    requested_capacity: { rps: 500, concurrent_users: 100000, db_connections: 100 },
    duration_minutes: 60
  }, {
    approved: true,
    operator_id: 'op-exam-coordinator',
    approval_id: 'appv-hum-99',
    reason: 'Nationwide mathematics assessment window'
  });

  assert.strictEqual(reservation.reservation_id, 'res-pilot-exam-01');
  assert.strictEqual(reservation.status, 'ACTIVE');
  assert.strictEqual(reservation.region_id, 'ir-isfahan-1');
  assert.strictEqual(reservation.approved_capacity.rps, 500);

  // 4. Retrieve reservation
  const fetched = getCapacityReservationById('res-pilot-exam-01');
  assert.ok(fetched);
  assert.strictEqual(fetched.tenant_id, 'tenant-school-201');

  const list = getCapacityReservations({ region_id: 'ir-isfahan-1' });
  assert.strictEqual(list.length, 1);

  // 5. Release reservation
  const released = releaseCapacityReservation('res-pilot-exam-01', {
    operator_id: 'op-exam-coordinator'
  });
  assert.strictEqual(released.status, 'RELEASED');
  assert.ok(released.released_at);

  // 6. Zero ranking guard
  assert.throws(() => {
    createCapacityReservation({
      region_id: 'ir-isfahan-1',
      tenant_id: 'tenant-school-201',
      best_school: 'school-1'
    }, {
      approved: true,
      operator_id: 'op-1',
      approval_id: 'appv-1',
      reason: 'Testing'
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keyword must be rejected');

  resetCapacityEnforcementForTests();
  return { suite: 'reservation-governance', passed: 6 };
}

if (require.main === module) {
  const res = runReservationGovernanceTests();
  console.log(`✅ reservation-governance.test.js: ${res.passed}/6 passed`);
}

module.exports = { runReservationGovernanceTests };
