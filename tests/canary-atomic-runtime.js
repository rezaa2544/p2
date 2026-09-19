/**
 * Phase 7.6-R.5 Canary Atomic Runtime Test Suite
 *
 * Verifies that Canary Engine setTrafficWeight executes UPDATE + AUDIT
 * as ONE atomic PostgreSQL transaction. Any failure in the Audit step MUST
 * trigger ROLLBACK of both the weight update and the audit write, preserving
 * the initial weight and leaving 0 audit rows.
 */

'use strict';

const authority = require('../server/infrastructure/authority');
const postgresAuthority = require('../server/infrastructure/authority/postgres-authority');
const dbModule = require('../server/db');
const {
  Phase6CanaryEngine,
  generateGovernanceKeypair,
  signGovernancePayload
} = require('../server/infrastructure/phase6-canary-engine');

let pass = 0;
let fail = 0;

function chk(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(` ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    console.error(` ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function createGovContext(keypair, action, clusterId, targetWeight) {
  const signed = signGovernancePayload(keypair.privateKey, {
    action,
    cluster_id: clusterId,
    target_weight: targetWeight
  });
  return {
    approved: true,
    operator: { id: 'admin1', role: 'superadmin' },
    nonce: signed.nonce,
    timestamp: signed.timestamp,
    expiry: signed.expiry,
    signature: signed.signature,
    action,
    reason: 'Atomic Runtime Test'
  };
}

async function run() {
  console.log('============================================================');
  console.log('Phase 7.6-R.5 Canary Atomic Runtime Test Suite');
  console.log('============================================================\n');

  const keypair = generateGovernanceKeypair();

  // Test 1: Fail-Closed when Atomic API is missing
  console.log('--- Test 1: Fail-Closed when Atomic API is missing ---');
  const engineMissing = new Phase6CanaryEngine();
  engineMissing.publicKey = keypair.publicKey;

  const mockDbAttached = {
    query: async (sql, params) => {
      if (sql.includes('phase6_replay_ledger')) return { rows: [{ nonce: params[0] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
  postgresAuthority.attach(mockDbAttached);

  const origApi = postgresAuthority.updateCanaryWeightWithAudit;
  const origAuthorityApi = authority.updateCanaryWeightWithAudit;
  delete postgresAuthority.updateCanaryWeightWithAudit;
  delete authority.updateCanaryWeightWithAudit;

  let missingApiErrorCaught = false;
  try {
    const govCtx = createGovContext(keypair, 'WEIGHT_UPDATE', 'ir-tehran-1', 50);
    await engineMissing.setTrafficWeight('ir-tehran-1', 50, govCtx);
  } catch (err) {
    if (err.code === 'ATOMIC_CANARY_UPDATE_UNAVAILABLE' || err.message.includes('ATOMIC_CANARY_UPDATE_UNAVAILABLE')) {
      missingApiErrorCaught = true;
    }
  }
  chk('engine.setTrafficWeight() throws ATOMIC_CANARY_UPDATE_UNAVAILABLE when atomic API is missing', missingApiErrorCaught);

  // Restore API
  postgresAuthority.updateCanaryWeightWithAudit = origApi;
  authority.updateCanaryWeightWithAudit = origAuthorityApi;
  postgresAuthority.attach(null);

  // Test 2: Atomic ROLLBACK on Audit Failure
  console.log('\n--- Test 2: Atomic ROLLBACK on Audit Failure ---');
  const engine = new Phase6CanaryEngine();
  engine.publicKey = keypair.publicKey;

  // DB Harness state
  let canaryTable = [{ id: 'ir-tehran-1', weight: 10, traffic_weight: 10, status: 'HEALTHY', version: 1 }];
  let auditRows = [];

  const mockTxDb = {
    query: async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return {};
      }
      if (sql === 'ROLLBACK') {
        // Rollback uncommitted changes
        canaryTable[0].weight = 10;
        canaryTable[0].traffic_weight = 10;
        auditRows = [];
        return {};
      }
      if (sql.includes('phase6_replay_ledger')) {
        return { rows: [{ nonce: params[0] }], rowCount: 1 };
      }
      if (sql.includes('UPDATE phase6_canary_configs')) {
        canaryTable[0].weight = Number(params[1]);
        canaryTable[0].traffic_weight = Number(params[1]);
        canaryTable[0].version++;
        return { rows: [canaryTable[0]], rowCount: 1 };
      }
      if (sql.includes('phase6_audit_events')) {
        // Intentionally FAIL the Audit step inside the transaction!
        throw new Error('AUDIT_STORAGE_FAILURE: Simulated PostgreSQL audit table failure');
      }
      if (sql.includes('SELECT * FROM phase6_canary_configs')) {
        return { rows: canaryTable, rowCount: canaryTable.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  postgresAuthority.attach(mockTxDb);
  engine.initDb(mockTxDb);
  engine.publicKey = keypair.publicKey;

  dbModule.__setPoolForTests({
    connect: async () => ({
      query: mockTxDb.query,
      release: () => {}
    })
  });

  let atomicFailureCaught = false;
  try {
    const govCtx = createGovContext(keypair, 'WEIGHT_UPDATE', 'ir-tehran-1', 50);
    await engine.setTrafficWeight('ir-tehran-1', 50, govCtx);
  } catch (err) {
    if (err.message.includes('AUDIT_STORAGE_FAILURE') || err.code === 'CANARY_PERSIST_FAILED') {
      atomicFailureCaught = true;
    }
  }

  chk('setTrafficWeight() throws CANARY_PERSIST_FAILED on audit write failure', atomicFailureCaught);

  // Check DB SSoT state after rollback
  const canaryStateAfterFailure = await postgresAuthority.getCanaryState('ir-tehran-1');
  const weightAfterFailure = canaryStateAfterFailure ? Number(canaryStateAfterFailure.weight) : canaryTable[0].weight;

  chk('Weight after audit failure remains initial value (weight = 10)', weightAfterFailure === 10, `actual weight = ${weightAfterFailure}`);
  chk('Audit event row count is 0 after rollback', auditRows.length === 0, `actual audit rows = ${auditRows.length}`);

  // Test 3: Successful Atomic UPDATE + AUDIT
  console.log('\n--- Test 3: Successful Atomic UPDATE + AUDIT ---');
  const mockTxSuccessDb = {
    query: async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
      if (sql.includes('phase6_replay_ledger')) {
        return { rows: [{ nonce: params[0] }], rowCount: 1 };
      }
      if (sql.includes('UPDATE phase6_canary_configs')) {
        canaryTable[0].weight = Number(params[1]);
        canaryTable[0].traffic_weight = Number(params[1]);
        return { rows: [canaryTable[0]], rowCount: 1 };
      }
      if (sql.includes('phase6_audit_events')) {
        auditRows.push({ action: params[0], cluster_id: params[1] });
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      if (sql.includes('SELECT * FROM phase6_canary_configs')) {
        return { rows: canaryTable, rowCount: canaryTable.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  postgresAuthority.attach(mockTxSuccessDb);
  engine.initDb(mockTxSuccessDb);
  engine.publicKey = keypair.publicKey;

  dbModule.__setPoolForTests({
    connect: async () => ({
      query: mockTxSuccessDb.query,
      release: () => {}
    })
  });

  const govCtxSuccess = createGovContext(keypair, 'WEIGHT_UPDATE', 'ir-tehran-1', 50);
  const updatedCluster = await engine.setTrafficWeight('ir-tehran-1', 50, govCtxSuccess);

  chk('setTrafficWeight() returns updated cluster with weight = 50', updatedCluster && updatedCluster.weight === 50);
  chk('Audit event row count is 1 after successful transaction', auditRows.length === 1);

  // Cleanup
  dbModule.__setPoolForTests(null);
  postgresAuthority.attach(null);

  console.log('\n============================================================');
  console.log(`Atomic Runtime Test Results: ${pass} PASS / ${fail} FAIL`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
}

run().catch(e => {
  console.error('CANARY ATOMIC RUNTIME TEST FATAL EXCEPTION:', e);
  process.exit(1);
});
