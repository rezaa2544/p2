/**
 * Capacity Limits Unit Test Suite
 * Phase 5 Step 5 (P2-NI-03): National Production Fabric Validation
 */

'use strict';

const assert = require('assert');
const {
  assertNationalCapacityEnforcement,
  checkRegionCapacityHeadroom,
  CAPACITY_ENFORCEMENT_ERRORS,
  NATIONAL_LIMITS
} = require('../../../../server/infrastructure/national-capacity-enforcement');

function runCapacityLimitsTests() {
  // 1. Nominal capacity passes
  const valid = assertNationalCapacityEnforcement({
    rps: 15000,
    concurrent_users: 2000000,
    write_tps: 1800,
    event_throughput: 20000,
    db_connections: 3000
  });
  assert.strictEqual(valid, true);

  // 2. Global RPS breach (22,000 > 20,000)
  assert.throws(() => {
    assertNationalCapacityEnforcement({ rps: 22000 });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.CAPACITY_LIMIT_BREACH;
  }, 'Global RPS breach must throw CAPACITY_LIMIT_BREACH');

  // 3. Global Concurrent Users breach (3,000,000 > 2,500,000)
  assert.throws(() => {
    assertNationalCapacityEnforcement({ concurrent_users: 3000000 });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.CAPACITY_LIMIT_BREACH;
  }, 'Global concurrent users breach must throw CAPACITY_LIMIT_BREACH');

  // 4. Global Write TPS breach (2,800 > 2,500)
  assert.throws(() => {
    assertNationalCapacityEnforcement({ write_tps: 2800 });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.WRITE_CAPACITY_BREACH;
  }, 'Write TPS breach must throw WRITE_CAPACITY_BREACH');

  // 5. Global Event Throughput breach (28,000 > 25,000)
  assert.throws(() => {
    assertNationalCapacityEnforcement({ event_throughput: 28000 });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.EVENT_CAPACITY_BREACH;
  }, 'Event throughput breach must throw EVENT_CAPACITY_BREACH');

  // 6. Global DB Connections breach (3,800 > 3,500)
  assert.throws(() => {
    assertNationalCapacityEnforcement({ db_connections: 3800 });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.DB_CAPACITY_BREACH;
  }, 'DB connections breach must throw DB_CAPACITY_BREACH');

  // 7. Regional capacity headroom check
  const headroom = checkRegionCapacityHeadroom('ir-tehran-1', {
    rps: 2000,
    concurrent_users: 1000000,
    db_connections: 500
  });
  assert.strictEqual(headroom.region_id, 'ir-tehran-1');
  assert.strictEqual(headroom.sufficient_headroom, true);
  assert.strictEqual(headroom.headroom.rps_headroom, 1500); // 3500 - 2000

  // 8. Regional capacity breach
  assert.throws(() => {
    assertNationalCapacityEnforcement({
      region_id: 'ir-rural-central-1',
      rps: 900 // ceiling is 800
    });
  }, (err) => {
    return err.code === CAPACITY_ENFORCEMENT_ERRORS.CAPACITY_LIMIT_BREACH;
  }, 'Regional RPS breach must throw CAPACITY_LIMIT_BREACH');

  // 9. Zero ranking guard
  assert.throws(() => {
    assertNationalCapacityEnforcement({
      rps: 1000,
      ranking_score: 90
    });
  }, (err) => {
    return err.code === 'ZERO_RANKING_VIOLATION' || err.message.includes('ZERO_RANKING_VIOLATION');
  }, 'Zero ranking keyword must be rejected');

  return { suite: 'capacity-limits', passed: 9 };
}

if (require.main === module) {
  const res = runCapacityLimitsTests();
  console.log(`✅ capacity-limits.test.js: ${res.passed}/9 passed`);
}

module.exports = { runCapacityLimitsTests };
