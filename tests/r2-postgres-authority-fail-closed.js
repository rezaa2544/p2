/**
 * tests/r2-postgres-authority-fail-closed.js — R2 Zero-Trust Negative Tests
 *
 * Proves that postgres-authority.js strictly FAILS CLOSED across all operations:
 * 1. DATABASE_URL absent / unattached authority -> throws AUTHORITY_UNAVAILABLE
 * 2. DB unreachable / connection failure -> throws AUTHORITY_QUERY_FAILED
 * 3. Query failure / DB execution error -> throws AUTHORITY_QUERY_FAILED
 * 4. Missing tenant policy -> throws TENANT_BOUNDARY_VIOLATION
 * 5. Consumer bypass prevention:
 *    - All consumers fail closed when DATABASE_URL is unset
 *    - In production (NODE_ENV=production or PAYESH_ENV=production), memory mode cannot be enabled
 *    - Explicit opt-in dev memory mode works ONLY in non-production without DATABASE_URL
 *
 * No silent fallback to RAM. No empty results masquerading as DB availability.
 */
'use strict';

const assert = require('assert');
const postgresAuthority = require('../server/infrastructure/authority/postgres-authority');
const opsKv = require('../server/infrastructure/ops-kv');
const regionControl = require('../server/infrastructure/national-region-control-plane');
const trafficFabric = require('../server/infrastructure/national-traffic-fabric');
const capacityEnforcement = require('../server/infrastructure/national-capacity-enforcement');
const provincialScaling = require('../server/infrastructure/provincial-pilot-scaling');
const changeManagement = require('../server/infrastructure/change-management');
const noc = require('../server/operations/national-operations-center');
const eventProcessing = require('../server/infrastructure/event-processing-layer');
const productionHardening = require('../server/infrastructure/phase6-production-hardening');

let pass = 0;
let fail = 0;

function chk(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    console.error(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function testUnattachedFailClosed() {
  console.log('\n--- Test 1: Unattached Authority Must Hard Fail-Closed ---');
  postgresAuthority.attach(null);

  // requireDb
  assert.throws(() => {
    postgresAuthority.requireDb();
  }, (err) => {
    return err.code === 'AUTHORITY_UNAVAILABLE' && err.status === 503;
  });
  chk('requireDb() throws AUTHORITY_UNAVAILABLE (503)', true);

  // query
  await assert.rejects(async () => {
    await postgresAuthority.query('SELECT 1');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('query() rejects with AUTHORITY_UNAVAILABLE', true);

  // getState
  await assert.rejects(async () => {
    await postgresAuthority.getState('region', 'ir-tehran-1');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getState() rejects with AUTHORITY_UNAVAILABLE (no null masquerade)', true);

  // listState
  await assert.rejects(async () => {
    await postgresAuthority.listState('region');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('listState() rejects with AUTHORITY_UNAVAILABLE (no empty array masquerade)', true);

  // putState
  await assert.rejects(async () => {
    await postgresAuthority.putState('region', 'ir-tehran-1', { health: 'OK' });
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('putState() rejects with AUTHORITY_UNAVAILABLE', true);

  // getTenantPolicy
  await assert.rejects(async () => {
    await postgresAuthority.getTenantPolicy('07', '*');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getTenantPolicy() rejects with AUTHORITY_UNAVAILABLE', true);

  // assertTenantPolicy
  await assert.rejects(async () => {
    await postgresAuthority.assertTenantPolicy('07', '*', 'actor_province');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('assertTenantPolicy() rejects with AUTHORITY_UNAVAILABLE', true);

  // getCanaryState
  await assert.rejects(async () => {
    await postgresAuthority.getCanaryState('ir-tehran-1');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getCanaryState() rejects with AUTHORITY_UNAVAILABLE', true);

  // listCanaryConfigs
  await assert.rejects(async () => {
    await postgresAuthority.listCanaryConfigs();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('listCanaryConfigs() rejects with AUTHORITY_UNAVAILABLE', true);

  // updateCanaryWeight
  await assert.rejects(async () => {
    await postgresAuthority.updateCanaryWeight('ir-tehran-1', 50);
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('updateCanaryWeight() rejects with AUTHORITY_UNAVAILABLE', true);

  // consumeNonce
  await assert.rejects(async () => {
    await postgresAuthority.consumeNonce('nonce123', 'hash123', new Date().toISOString());
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('consumeNonce() rejects with AUTHORITY_UNAVAILABLE', true);
}

async function testConnectionFailure() {
  console.log('\n--- Test 2: DB Connection Failure / Unreachable DB ---');
  const brokenDb = {
    query: async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      err.code = 'ECONNREFUSED';
      throw err;
    }
  };
  postgresAuthority.attach(brokenDb);

  await assert.rejects(async () => {
    await postgresAuthority.query('SELECT 1');
  }, (err) => err.code === 'AUTHORITY_QUERY_FAILED' && err.status === 503);
  chk('query() on ECONNREFUSED wraps to AUTHORITY_QUERY_FAILED (503)', true);

  await assert.rejects(async () => {
    await postgresAuthority.getState('region', 'ir-tehran-1');
  }, (err) => err.code === 'AUTHORITY_QUERY_FAILED');
  chk('getState() on connection failure throws AUTHORITY_QUERY_FAILED', true);

  await assert.rejects(async () => {
    await postgresAuthority.listState('region');
  }, (err) => err.code === 'AUTHORITY_QUERY_FAILED');
  chk('listState() on connection failure throws AUTHORITY_QUERY_FAILED', true);
}

async function testQueryFailure() {
  console.log('\n--- Test 3: SQL Execution Failure ---');
  const sqlErrorDb = {
    query: async () => {
      const err = new Error('relation "authority_state" does not exist');
      err.code = '42P01';
      throw err;
    }
  };
  postgresAuthority.attach(sqlErrorDb);

  await assert.rejects(async () => {
    await postgresAuthority.query('SELECT * FROM authority_state');
  }, (err) => err.code === 'AUTHORITY_QUERY_FAILED' && err.message.includes('authority_state'));
  chk('query() on SQL error wraps to AUTHORITY_QUERY_FAILED', true);

  await assert.rejects(async () => {
    await postgresAuthority.putState('region', 'ir-tehran-1', {});
  }, (err) => err.code === 'AUTHORITY_QUERY_FAILED');
  chk('putState() on SQL error throws AUTHORITY_QUERY_FAILED', true);
}

async function testTenantBoundaryFailure() {
  console.log('\n--- Test 4: Tenant Boundary Violation on Missing Policy ---');
  const emptyDb = {
    query: async () => ({ rows: [], rowCount: 0 })
  };
  postgresAuthority.attach(emptyDb);

  await assert.rejects(async () => {
    await postgresAuthority.assertTenantPolicy('99', 'unknown_school', 'test_scope');
  }, (err) => err.code === 'TENANT_BOUNDARY_VIOLATION' && err.status === 403);
  chk('assertTenantPolicy() throws TENANT_BOUNDARY_VIOLATION (403) when no policy row', true);

  // Policy with explicit deny
  const denyDb = {
    query: async () => ({
      rows: [{ province: '99', school: '*', allowed_scope: JSON.stringify({ deny: true }), version: 1 }],
      rowCount: 1
    })
  };
  postgresAuthority.attach(denyDb);

  await assert.rejects(async () => {
    await postgresAuthority.assertTenantPolicy('99', '*', 'any_scope');
  }, (err) => err.code === 'TENANT_BOUNDARY_VIOLATION' && err.message.includes('denies access'));
  chk('assertTenantPolicy() throws TENANT_BOUNDARY_VIOLATION when policy has deny: true', true);

  postgresAuthority.attach(null);
}

async function testConsumerBypassPrevention() {
  console.log('\n--- Test 5: Consumer Guard Bypass Prevention (No DATABASE_URL bypass) ---');
  postgresAuthority.attach(null);
  opsKv.attach(null);
  delete process.env.DATABASE_URL;
  delete process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
  delete process.env.NODE_ENV;
  delete process.env.PAYESH_ENV;

  // 1. opsKv.get must fail closed when unattached and DATABASE_URL is unset
  await assert.rejects(async () => {
    await opsKv.get('any_key');
  }, (err) => err.code === 'OPS_KV_UNAVAILABLE');
  chk('opsKv.get() throws OPS_KV_UNAVAILABLE when unattached and DATABASE_URL unset', true);

  // 2. regionControl must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    regionControl.getNationalRegionRegistry();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('regionControl.getNationalRegionRegistry() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 3. trafficFabric must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    trafficFabric.getNationalTrafficFabricTopology();
  }, (err) => err.code === 'OPS_KV_UNAVAILABLE');
  chk('trafficFabric.getNationalTrafficFabricTopology() throws OPS_KV_UNAVAILABLE when DATABASE_URL unset', true);

  // 4. capacityEnforcement must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    capacityEnforcement.getCapacityReservations();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('capacityEnforcement.getCapacityReservations() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 5. provincialScaling must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    provincialScaling.getProvincialPilots();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('provincialScaling.getProvincialPilots() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 6. changeManagement must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    changeManagement.getChangeRequests();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('changeManagement.getChangeRequests() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 7. noc must fail closed when DATABASE_URL is unset
  assert.throws(() => {
    noc.getNocIncidents();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('noc.getNocIncidents() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 8. eventProcessing must fail closed when DATABASE_URL is unset
  await assert.rejects(async () => {
    await eventProcessing.seenIdempotency('test-key-fail-closed');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('eventProcessing.seenIdempotency() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset', true);

  // 9. phase6-production-hardening tenant boundary must fail closed when unattached
  const testActor = { id: 10, role: 'school_admin', province_code: '07', school_id: 101 };
  await assert.rejects(async () => {
    await productionHardening.assertTenantBoundary(testActor, 101, '07');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('assertTenantBoundary() throws AUTHORITY_UNAVAILABLE when DATABASE_URL unset and unattached', true);

  // 10. Production Mode Rejection of Dev Memory Flag
  console.log('\n--- Test 6: Production Mode Disallows Dev Memory Bypass ---');
  process.env.NODE_ENV = 'production';
  process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1'; // Attempt bypass in production

  chk('isExplicitDevOptIn() returns false in production despite opt-in flag', postgresAuthority.isExplicitDevOptIn() === false);

  assert.throws(() => {
    postgresAuthority.assertAuthorityAttached();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('assertAuthorityAttached() rejects in production despite dev memory flag', true);

  assert.throws(() => {
    regionControl.getNationalRegionRegistry();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('regionControl rejects in production despite dev memory flag', true);

  assert.throws(() => {
    provincialScaling.getProvincialPilots();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('provincialScaling rejects in production despite dev memory flag', true);

  assert.throws(() => {
    changeManagement.getChangeRequests();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('changeManagement rejects in production despite dev memory flag', true);

  // Clean up
  delete process.env.NODE_ENV;
  delete process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  R2 postgres-authority.js Hard Fail-Closed Negative Suite  ');
  console.log('════════════════════════════════════════════════════════════');

  await testUnattachedFailClosed();
  await testConnectionFailure();
  await testQueryFailure();
  await testTenantBoundaryFailure();
  await testConsumerBypassPrevention();

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`R2 Negative Suite Result: ${pass} PASS / ${fail} FAIL`);
  console.log('────────────────────────────────────────────────────────────\n');

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL in R2 suite:', err);
  process.exit(1);
});
