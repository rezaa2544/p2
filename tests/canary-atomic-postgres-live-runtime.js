/**
 * Phase 7.6-R.7.2 Live PostgreSQL Canary Atomic Runtime Verification
 *
 * Contract Requirements:
 * - Missing 'pg' driver -> FAIL (exit 1)
 * - PostgreSQL unreachable -> FAIL (exit 1)
 * - Transaction/Assertion failure -> FAIL (exit 1)
 * - Zero fake-green or try/catch silent exit 0 allowed
 * - ONLY real PostgreSQL connection + atomic ROLLBACK verification -> PASS (exit 0)
 */

'use strict';

let Client;
try {
  ({ Client } = require('pg'));
} catch (e) {
  console.error(' ❌ FAIL: pg driver module is missing or cannot be loaded');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.PGURL || 'postgres://payesh:payesh@127.0.0.1:5432/payesh_ci';

let pass = 0;
let fail = 0;

function chk(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(` ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    console.error(` ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function run() {
  console.log('============================================================');
  console.log('[REAL-DATABASE] Phase 7.6-R.7.2 Canary Atomic PostgreSQL Live Runtime');
  console.log('Evidence Level: E3/E4 — Real PostgreSQL Engine Required');
  console.log('============================================================\n');

  const client = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });

  try {
    await client.connect();
  } catch (err) {
    console.error(` ❌ FAIL: PostgreSQL database is unreachable at ${DATABASE_URL}: ${err.message}`);
    process.exit(1);
  }

  try {
    // 1. Verify PostgreSQL engine
    const resVer = await client.query('SELECT version();');
    chk('Connected to real PostgreSQL engine', !!resVer.rows[0].version, resVer.rows[0].version.split(' on ')[0]);

    // 2. Ensure canary configs table and initial test row
    await client.query(`
      CREATE TABLE IF NOT EXISTS phase6_canary_configs (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128),
        traffic_weight INT DEFAULT 0,
        weight INT DEFAULT 0,
        status VARCHAR(32) DEFAULT 'HEALTHY',
        version INT DEFAULT 1,
        circuit_breaker_open BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS phase6_audit_events (
        id SERIAL PRIMARY KEY,
        action VARCHAR(64) NOT NULL,
        cluster_id VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO phase6_canary_configs (id, name, traffic_weight, weight, status, version)
      VALUES ('ir-tehran-1', 'Tehran Cluster', 10, 10, 'HEALTHY', 1)
      ON CONFLICT (id) DO UPDATE SET traffic_weight = 10, weight = 10;
    `);

    // 3. Before state
    const resBefore = await client.query("SELECT traffic_weight FROM phase6_canary_configs WHERE id = 'ir-tehran-1';");
    const weightBefore = resBefore.rows[0] ? Number(resBefore.rows[0].traffic_weight) : -1;
    console.log(` Before: Weight = ${weightBefore}`);
    chk('Initial weight is 10 in SSoT', weightBefore === 10, `weightBefore = ${weightBefore}`);

    // 4. Injected transaction failure
    let injectedError = null;
    try {
      await client.query('BEGIN;');
      await client.query("UPDATE phase6_canary_configs SET traffic_weight = 50 WHERE id = 'ir-tehran-1';");
      // Force SQL error: insert non-existent column
      await client.query("INSERT INTO phase6_audit_events (non_existent_column) VALUES ('INVALID');");
      await client.query('COMMIT;');
    } catch (err) {
      injectedError = err;
      await client.query('ROLLBACK;');
    }

    console.log(` After Failure: ${injectedError ? injectedError.message : 'NO_ERROR_INJECTED'}`);
    chk('Injected error caught during transaction', !!injectedError, injectedError ? injectedError.message : '');

    // 5. Verify rollback
    const resAfter = await client.query("SELECT traffic_weight FROM phase6_canary_configs WHERE id = 'ir-tehran-1';");
    const weightAfter = resAfter.rows[0] ? Number(resAfter.rows[0].traffic_weight) : -1;
    console.log(` Rollback Verification: Weight = ${weightAfter}`);
    chk('PostgreSQL ROLLBACK restored weight to 10', weightAfter === 10, `weightAfter = ${weightAfter}`);

    // 6. Audit rows count
    const resAudit = await client.query("SELECT COUNT(*)::int AS count FROM phase6_audit_events WHERE action = 'INVALID';");
    const auditCount = resAudit.rows[0] ? Number(resAudit.rows[0].count) : -1;
    console.log(` Audit Rows Count: ${auditCount}`);
    chk('Audit rows count is 0 after transaction rollback', auditCount === 0, `auditCount = ${auditCount}`);

    await client.end();

    console.log('\n============================================================');
    console.log(`Postgres Live Runtime Results: ${pass} PASS / ${fail} FAIL`);
    console.log('============================================================');

    if (fail > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error(` ❌ FAIL: Execution error during live PostgreSQL transaction test: ${e.message}`);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

run();
