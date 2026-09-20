/**
 * tests/r1-eliminate-ram-authorities.test.js — R1 Zero-Trust Regression Tests
 *
 * Proves that:
 * 1. PostgreSQL is the sole authoritative state across:
 *    - national-region-control-plane
 *    - national-traffic-fabric
 *    - national-capacity-enforcement
 * 2. Multi-instance convergence: Instance A changes state -> Instance B observes the same PostgreSQL state.
 * 3. Process restart durability: A new instance hydrates from PostgreSQL rather than RAM defaults.
 * 4. Strict fail-closed: DB unavailable does NOT silently fall back to RAM.
 */
'use strict';

const assert = require('assert');
const authority = require('../server/infrastructure/authority');
const postgresAuthority = require('../server/infrastructure/authority/postgres-authority');
const opsKv = require('../server/infrastructure/ops-kv');
const regionControl = require('../server/infrastructure/national-region-control-plane');
const trafficFabric = require('../server/infrastructure/national-traffic-fabric');
const capacityEnforcement = require('../server/infrastructure/national-capacity-enforcement');

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

async function run() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  R1 Eliminate RAM Authorities Regression Test Suite        ');
  console.log('════════════════════════════════════════════════════════════\n');

  // Simulated in-memory PostgreSQL store for mock DB driver
  const pgAuthorityState = new Map();
  const pgOpsKv = new Map();

  const mockPgDriver = {
    query: async (sql, params) => {
      const q = String(sql).trim();
      // authority_state INSERT / UPDATE
      if (q.includes('INSERT INTO authority_state')) {
        const kind = params[0];
        const id = params[1];
        const payload = JSON.parse(params[2]);
        const key = `${kind}:${id}`;
        const prev = pgAuthorityState.get(key) || { version: 0 };
        const nextVer = prev.version + 1;
        pgAuthorityState.set(key, { kind, id, payload, version: nextVer });
        return { rows: [{ version: nextVer }], rowCount: 1 };
      }
      // authority_state SELECT single
      if (q.includes('SELECT payload, version FROM authority_state WHERE kind = $1 AND id = $2')) {
        const key = `${params[0]}:${params[1]}`;
        const row = pgAuthorityState.get(key);
        if (!row) return { rows: [], rowCount: 0 };
        return { rows: [{ payload: row.payload, version: row.version }], rowCount: 1 };
      }
      // authority_state SELECT list
      if (q.includes('SELECT id, payload, version FROM authority_state WHERE kind = $1')) {
        const kind = params[0];
        const rows = [];
        for (const [k, v] of pgAuthorityState.entries()) {
          if (v.kind === kind) rows.push({ id: v.id, payload: v.payload, version: v.version });
        }
        return { rows, rowCount: rows.length };
      }
      // phase6_ops_kv
      if (q.includes('phase6_ops_kv')) {
        if (q.includes('INSERT INTO phase6_ops_kv') || q.includes('ON CONFLICT (key)')) {
          const k = params[0];
          const v = JSON.parse(params[1]);
          const prev = pgOpsKv.get(k) || { version: 0 };
          const nextVer = prev.version + 1;
          pgOpsKv.set(k, { value: v, version: nextVer });
          return { rows: [{ version: nextVer }], rowCount: 1 };
        }
        if (q.includes('SELECT value, version FROM phase6_ops_kv WHERE key = $1')) {
          const k = params[0];
          const entry = pgOpsKv.get(k);
          if (!entry) return { rows: [], rowCount: 0 };
          return { rows: [{ value: entry.value, version: entry.version }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }
  };

  // Step 1: Attach Authority & Ops-KV to mock PG
  console.log('--- Step 1: Attach Authority and Ops-KV to PostgreSQL SoT ---');
  postgresAuthority.attach(mockPgDriver);
  opsKv.attach(mockPgDriver);

  chk('Authority is attached', authority.attached());
  chk('Ops-KV is attached', opsKv.attached());

  // Step 2: Multi-Instance Region Convergence
  console.log('\n--- Step 2: Multi-Instance Region Convergence ---');
  // Instance A changes region state
  const updatedRegA = await regionControl.updateNationalRegionState('ir-isfahan-1', 'MAINTENANCE', {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator: { id: 1, role: 'superadmin', name: 'Cluster Lead' }
  });
  chk('Instance A sets ir-isfahan-1 to MAINTENANCE', updatedRegA.health_status === 'MAINTENANCE');

  // Verify it was written to PostgreSQL SoT
  const pgStored = pgAuthorityState.get('region:ir-isfahan-1');
  chk('PostgreSQL authority_state contains region:ir-isfahan-1', !!pgStored);
  chk('PostgreSQL authority_state has health_status = MAINTENANCE', pgStored.payload.health_status === 'MAINTENANCE');

  // Instance B refreshes from PostgreSQL SoT
  await regionControl.refreshRegionsFromSoT();
  const regFromB = regionControl.getNationalRegionById('ir-isfahan-1');
  chk('Instance B observes same PostgreSQL state (MAINTENANCE)', regFromB && regFromB.health_status === 'MAINTENANCE');

  // Step 3: Multi-Instance Traffic Fabric Convergence
  console.log('\n--- Step 3: Multi-Instance Traffic Fabric Convergence ---');
  const updatedTfA = await trafficFabric.updateNationalTrafficWeight('ir-tehran-1', 25, {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator: { id: 1, role: 'superadmin' }
  });
  chk('Instance A sets ir-tehran-1 traffic weight to 25', updatedTfA.allocated_weight === 25);

  const opsKvStored = pgOpsKv.get('national_traffic_weights');
  chk('PostgreSQL ops_kv has national_traffic_weights', !!opsKvStored);
  const weightsMap = opsKvStored ? opsKvStored.value : {};
  chk('PostgreSQL ops_kv has ir-tehran-1 weight = 25', weightsMap['ir-tehran-1'] && weightsMap['ir-tehran-1'].allocated_weight === 25);

  // Instance B refreshes from PostgreSQL SoT
  await trafficFabric.refreshTrafficFromSoT();
  const topoB = trafficFabric.getNationalTrafficFabricTopology();
  chk('Instance B observes same PostgreSQL traffic weight (25)', topoB.topology['ir-tehran-1'].allocated_weight === 25);

  // Step 4: Multi-Instance Capacity Reservation Convergence
  console.log('\n--- Step 4: Multi-Instance Capacity Reservation Convergence ---');
  const resPayload = {
    reservation_id: 'res-test-99',
    region_id: 'ir-tehran-1',
    tenant_id: 'tenant-07',
    requested_capacity: { rps: 500, db_connections: 50 },
    approved_capacity: { rps: 500, db_connections: 50 },
    duration_minutes: 60
  };
  const approval = {
    approved: true,
    automated_decision: false,
    automated_execution: false,
    requires_human_approval: true,
    operator_id: 'admin-1',
    approval_id: 'app-99',
    reason: 'Exam surge'
  };
  const resA = await capacityEnforcement.createCapacityReservation(resPayload, approval);
  chk('Instance A creates reservation res-test-99', resA.reservation_id === 'res-test-99');

  const pgResStored = pgAuthorityState.get('reservation:res-test-99');
  chk('PostgreSQL authority_state contains reservation:res-test-99', !!pgResStored);

  // Clear local RAM map to simulate a clean Instance B
  capacityEnforcement.resetCapacityEnforcementForTests();
  chk('Local memory cleared for Instance B simulation', capacityEnforcement.getCapacityReservationById('res-test-99') === null);

  // Instance B refreshes from PostgreSQL
  await capacityEnforcement.refreshReservationsFromSoT();
  const resB = capacityEnforcement.getCapacityReservationById('res-test-99');
  chk('Instance B hydrates reservation from PostgreSQL SoT', resB && resB.reservation_id === 'res-test-99');

  // Step 5: Strict Fail-Closed When DB Authority is Disconnected
  console.log('\n--- Step 5: Strict Fail-Closed (No Silent Fallback to RAM) ---');
  process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/testdb';
  postgresAuthority.attach(null);
  opsKv.attach(null);

  // Region Control Plane Must Fail Closed
  assert.throws(() => {
    regionControl.getNationalRegionRegistry();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getNationalRegionRegistry() throws AUTHORITY_UNAVAILABLE without DB', true);

  assert.throws(() => {
    regionControl.getNationalRegionById('ir-tehran-1');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getNationalRegionById() throws AUTHORITY_UNAVAILABLE without DB', true);

  assert.throws(() => {
    regionControl.updateNationalRegionState('ir-tehran-1', 'READY', {
      approved: true, automated_decision: false, automated_execution: false, requires_human_approval: true, operator: { id: 1, role: 'superadmin' }
    });
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('updateNationalRegionState() throws AUTHORITY_UNAVAILABLE without DB', true);

  // Traffic Fabric Must Fail Closed
  assert.throws(() => {
    trafficFabric.getNationalTrafficFabricTopology();
  }, (err) => err.code === 'OPS_KV_UNAVAILABLE');
  chk('getNationalTrafficFabricTopology() throws OPS_KV_UNAVAILABLE without DB', true);

  assert.throws(() => {
    trafficFabric.updateNationalTrafficWeight('ir-tehran-1', 50, {
      approved: true, automated_decision: false, automated_execution: false, requires_human_approval: true, operator: { id: 1, role: 'superadmin' }
    });
  }, (err) => err.code === 'OPS_KV_UNAVAILABLE');
  chk('updateNationalTrafficWeight() throws OPS_KV_UNAVAILABLE without DB', true);

  // Capacity Enforcement Must Fail Closed
  assert.throws(() => {
    capacityEnforcement.getCapacityReservations();
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getCapacityReservations() throws AUTHORITY_UNAVAILABLE without DB', true);

  assert.throws(() => {
    capacityEnforcement.getCapacityReservationById('res-test-99');
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('getCapacityReservationById() throws AUTHORITY_UNAVAILABLE without DB', true);

  assert.throws(() => {
    capacityEnforcement.createCapacityReservation(resPayload, approval);
  }, (err) => err.code === 'AUTHORITY_UNAVAILABLE');
  chk('createCapacityReservation() throws AUTHORITY_UNAVAILABLE without DB', true);

  delete process.env.DATABASE_URL;

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`R1 Suite Result: ${pass} PASS / ${fail} FAIL`);
  console.log('────────────────────────────────────────────────────────────\n');

  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error('FATAL in R1 suite:', err);
  process.exit(1);
});
