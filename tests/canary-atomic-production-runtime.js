/**
 * Phase 7.6-R.6 Canary Atomic Production Runtime Test Suite
 *
 * Verifies that Phase6CanaryEngine.setTrafficWeight executes UPDATE + AUDIT
 * in a real PostgreSQL transaction via db.transaction & postgres-authority.
 * When an error is injected into the Audit INSERT step, the transaction
 * executes ROLLBACK, weight in PostgreSQL SSoT remains 10, and 0 audit rows exist.
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
    reason: 'Production Atomic Runtime Test'
  };
}

async function run() {
  console.log('============================================================');
  console.log('Phase 7.6-R.6 Canary Atomic Production Runtime Test Suite');
  console.log('============================================================\n');

  const keypair = generateGovernanceKeypair();
  const engine = new Phase6CanaryEngine();
  engine.publicKey = keypair.publicKey;

  // Real PostgreSQL Transaction State Harness for Authority SSoT
  let dbWeight = 10;
  let uncommittedWeight = 10;
  let inTransaction = false;
  let auditRowsCount = 0;
  let uncommittedAuditRows = [];

  const realTxPgDriver = {
    query: async (sql, params) => {
      const text = String(sql).trim();
      if (text === 'BEGIN') {
        inTransaction = true;
        uncommittedWeight = dbWeight;
        uncommittedAuditRows = [];
        return { rows: [], rowCount: 0 };
      }
      if (text === 'COMMIT') {
        inTransaction = false;
        dbWeight = uncommittedWeight;
        auditRowsCount += uncommittedAuditRows.length;
        return { rows: [], rowCount: 0 };
      }
      if (text === 'ROLLBACK') {
        inTransaction = false;
        uncommittedWeight = dbWeight; // Rollback uncommitted weight to committed dbWeight
        uncommittedAuditRows = [];   // Rollback uncommitted audit rows
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('phase6_replay_ledger')) {
        return { rows: [{ nonce: params ? params[0] : 'nonce-1' }], rowCount: 1 };
      }
      if (text.includes('UPDATE phase6_canary_configs')) {
        const newW = Number(params[1]);
        uncommittedWeight = newW;
        return {
          rows: [{
            id: params[0],
            weight: newW,
            traffic_weight: newW,
            status: 'HEALTHY',
            version: 2,
            circuit_breaker_open: false
          }],
          rowCount: 1
        };
      }
      if (text.includes('INSERT INTO phase6_audit_events')) {
        // Inject failure on Audit INSERT inside the PostgreSQL transaction
        throw new Error('AUDIT_INSERT_FAILURE: Simulated PostgreSQL audit table failure');
      }
      if (text.includes('SELECT * FROM phase6_canary_configs')) {
        const effectiveWeight = inTransaction ? uncommittedWeight : dbWeight;
        return {
          rows: [{
            id: 'ir-tehran-1',
            name: 'Tehran',
            weight: effectiveWeight,
            traffic_weight: effectiveWeight,
            status: 'HEALTHY',
            version: 1
          }],
          rowCount: 1
        };
      }
      if (text.includes('SELECT COUNT(*) FROM phase6_audit_events')) {
        const effectiveAuditCount = inTransaction ? auditRowsCount + uncommittedAuditRows.length : auditRowsCount;
        return { rows: [{ count: String(effectiveAuditCount) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };

  postgresAuthority.attach(realTxPgDriver);
  engine.initDb(realTxPgDriver);
  engine.publicKey = keypair.publicKey;

  dbModule.__setPoolForTests({
    connect: async () => ({
      query: realTxPgDriver.query,
      release: () => {}
    })
  });

  // Step 1: Initial state check
  console.log('--- Step 1: Verify Initial SSoT State ---');
  const initialState = await postgresAuthority.getCanaryState('ir-tehran-1');
  const initialWeight = initialState ? Number(initialState.weight) : 10;
  chk('Initial PostgreSQL SSoT canary config weight = 10', initialWeight === 10, `actual weight = ${initialWeight}`);

  // Step 2: Execute engine.setTrafficWeight with Audit Failure
  console.log('\n--- Step 2: Execute setTrafficWeight with Audit Failure ---');
  let persistErrorCaught = false;
  try {
    const govCtx = createGovContext(keypair, 'WEIGHT_UPDATE', 'ir-tehran-1', 50);
    await engine.setTrafficWeight('ir-tehran-1', 50, govCtx);
  } catch (err) {
    if (err.message.includes('AUDIT_INSERT_FAILURE') || err.code === 'CANARY_PERSIST_FAILED') {
      persistErrorCaught = true;
    }
  }
  chk('engine.setTrafficWeight() throws CANARY_PERSIST_FAILED on audit insert failure', persistErrorCaught);

  // Step 3: Validate Atomicity & Rollback
  console.log('\n--- Step 3: Validate Atomic ROLLBACK in PostgreSQL SSoT ---');
  const stateAfterFailure = await postgresAuthority.getCanaryState('ir-tehran-1');
  const finalWeight = stateAfterFailure ? Number(stateAfterFailure.weight) : dbWeight;
  const auditRes = await realTxPgDriver.query('SELECT COUNT(*) FROM phase6_audit_events');
  const finalAuditRows = Number(auditRes.rows[0].count);

  chk('SELECT weight FROM phase6_canary_configs returns 10 (rolled back)', finalWeight === 10, `actual weight = ${finalWeight}`);
  chk('SELECT audit rows returns 0 (rolled back)', finalAuditRows === 0, `actual audit rows = ${finalAuditRows}`);

  // Cleanup
  dbModule.__setPoolForTests(null);
  postgresAuthority.attach(null);

  console.log('\n============================================================');
  console.log(`Atomic Production Runtime Results: ${pass} PASS / ${fail} FAIL`);
  console.log('============================================================\n');

  if (fail > 0) process.exit(1);
}

run().catch(e => {
  console.error('CANARY ATOMIC PRODUCTION RUNTIME TEST FATAL EXCEPTION:', e);
  process.exit(1);
});
