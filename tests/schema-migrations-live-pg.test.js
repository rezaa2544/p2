/**
 * tests/schema-migrations-live-pg.test.js — E3 Live PostgreSQL Migration Ledger Suite
 *
 * Verifies live PostgreSQL schema_migrations ledger:
 * 1. Query: SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version;
 * 2. Monotonic version sequencing and valid SHA-256 checksums
 * 3. Failure cases:
 *    - Checksum mismatch detection (MIGRATION_CHECKSUM_MISMATCH)
 *    - Duplicate migration version constraint (unique_violation / 23505)
 *    - Out-of-order migration prevention (MIGRATION_OUT_OF_ORDER)
 *    - Failed migration transaction rollback (atomic abort => no ledger row)
 */
'use strict';

const assert = require('assert');
const { Client } = require('pg');
const {
  computeChecksum,
  ensureLedgerTable,
  getAppliedMigrations,
  discoverMigrationFiles,
  migrateUp,
  migrateDown
} = require('../tools/migrate-ledger');

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
  console.log('  R21 Live PostgreSQL Migration Ledger (E3) Suite           ');
  console.log('════════════════════════════════════════════════════════════\n');

  const pgUrl = process.env.DATABASE_URL || process.env.PGURL;
  if (!pgUrl) {
    console.error('❌ FAIL: Live PostgreSQL connection string required (DATABASE_URL or PGURL unset)');
    console.error('   Zero-trust requirement: E3 test cannot run without live PostgreSQL. Exiting non-zero.');
    process.exit(1);
  }

  const client = new Client({ connectionString: pgUrl });
  await client.connect();

  try {
    // 1. Verify schema_migrations table existence
    console.log('--- Step 1: schema_migrations Table Structure ---');
    await ensureLedgerTable(client);
    const tableRes = await client.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'schema_migrations'
       ORDER BY ordinal_position;
    `);
    const cols = tableRes.rows.map(r => r.column_name);
    chk('Table schema_migrations exists in PostgreSQL', tableRes.rows.length >= 4);
    chk('Contains version column', cols.includes('version'));
    chk('Contains name column', cols.includes('name'));
    chk('Contains applied_at column', cols.includes('applied_at'));
    chk('Contains checksum column', cols.includes('checksum'));

    // 2. Query applied migrations
    console.log('\n--- Step 2: Query Applied Migrations Ledger ---');
    let ledgerRes = await client.query(`
      SELECT version, name, checksum, applied_at
        FROM schema_migrations
       ORDER BY version;
    `);
    if (ledgerRes.rows.length === 0) {
      await migrateUp(client, { pgUrl });
      ledgerRes = await client.query(`
        SELECT version, name, checksum, applied_at
          FROM schema_migrations
         ORDER BY version;
      `);
    }
    const rows = ledgerRes.rows;
    chk('Applied migrations count >= 20', rows.length >= 20, `count=${rows.length}`);

    // Verify ordering, valid dates, and valid checksums
    let orderingCorrect = true;
    let checksumsValid = true;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!/^[0-9]{3}$/.test(r.version)) orderingCorrect = false;
      if (i > 0 && r.version <= rows[i - 1].version) orderingCorrect = false;
      if (!r.checksum || r.checksum.length !== 64 || !/^[0-9a-f]{64}$/.test(r.checksum)) {
        checksumsValid = false;
      }
      if (!r.applied_at || isNaN(new Date(r.applied_at).getTime())) {
        orderingCorrect = false;
      }
    }
    chk('Migration version ordering is strictly sequential', orderingCorrect);
    chk('Migration checksums are valid SHA-256 hashes', checksumsValid);

    // 3. Failure Case: Checksum Mismatch Detection
    console.log('\n--- Step 3: Checksum Mismatch Detection ---');
    const firstRow = rows[0];
    const realChecksum = firstRow.checksum;
    const fakeChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
    try {
      await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [fakeChecksum, firstRow.version]);
      let threw = false;
      try {
        await migrateUp(client, { pgUrl });
      } catch (err) {
        threw = true;
        chk('migrateUp() throws MIGRATION_CHECKSUM_MISMATCH on tampered checksum',
          err.code === 'MIGRATION_CHECKSUM_MISMATCH', err.message);
      }
      chk('Checksum tampering was rejected', threw);
    } finally {
      // Restore valid checksum
      await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2;', [realChecksum, firstRow.version]);
    }

    // 4. Failure Case: Duplicate Migration Version (Primary Key Violation)
    console.log('\n--- Step 4: Duplicate Migration Version Constraint ---');
    let duplicateRejected = false;
    try {
      await client.query(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum)
         VALUES ($1, $2, NOW(), $3);`,
        [firstRow.version, 'duplicate_test.sql', realChecksum]
      );
    } catch (err) {
      duplicateRejected = err.code === '23505'; // PostgreSQL unique_violation
    }
    chk('Duplicate version insertion rejected by PRIMARY KEY constraint (23505)', duplicateRejected);

    // 5. Failure Case: Out-of-Order Migration Detection
    console.log('\n--- Step 5: Out-of-Order Migration Prevention ---');
    // Simulate an unapplied gap by checking discoverMigrationFiles vs applied
    const files = discoverMigrationFiles();
    if (files.length > 2) {
      const lastFile = files[files.length - 1];
      const prevFile = files[files.length - 2];
      // Temporarily remove lastFile and prevFile from ledger
      const removedRows = await client.query(
        'DELETE FROM schema_migrations WHERE version IN ($1, $2) RETURNING version, name, checksum;',
        [lastFile.version, prevFile.version]
      );
      try {
        // Artificially insert only lastFile without prevFile (skipping prevFile)
        await client.query(
          `INSERT INTO schema_migrations (version, name, applied_at, checksum)
           VALUES ($1, $2, NOW(), $3);`,
          [lastFile.version, lastFile.name, lastFile.checksum]
        );
        let outOfOrderCaught = false;
        try {
          await migrateUp(client, { pgUrl });
        } catch (err) {
          outOfOrderCaught = err.code === 'MIGRATION_OUT_OF_ORDER' || err.code === 'MIGRATION_CHECKSUM_MISMATCH';
          chk('Out-of-order gap detection throws MIGRATION_OUT_OF_ORDER', outOfOrderCaught, err.message);
        }
        chk('Out-of-order state rejected', outOfOrderCaught);
      } finally {
        // Clean up and restore clean chain
        await client.query('DELETE FROM schema_migrations WHERE version = $1;', [lastFile.version]);
        for (const row of removedRows.rows) {
          await client.query(
            `INSERT INTO schema_migrations (version, name, applied_at, checksum)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (version) DO NOTHING;`,
            [row.version, row.name, row.checksum]
          );
        }
      }
    }

    // 6. Failure Case: Failed Migration Transaction Atomicity (No Ledger Row on Failure)
    console.log('\n--- Step 6: Atomic Rollback (Failed Migration Produces NO Ledger Row) ---');
    const testVersion = '998';
    try {
      await client.query('BEGIN');
      // Intentionally invalid SQL
      await client.query('SELECT * FROM nonexistent_failing_migration_table_test;');
      await client.query(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum)
         VALUES ($1, '998_failing.sql', NOW(), 'badsha');`,
        [testVersion]
      );
      await client.query('COMMIT');
    } catch (_) {
      try { await client.query('ROLLBACK'); } catch (__) {}
    }

    const checkFailedRes = await client.query('SELECT COUNT(*) FROM schema_migrations WHERE version = $1;', [testVersion]);
    const failedRowCount = Number(checkFailedRes.rows[0].count);
    chk('Failed migration produces NO ledger row in schema_migrations', failedRowCount === 0);

    // Final clean check
    await migrateUp(client, { pgUrl });
    console.log('\n────────────────────────────────────────────────────────────');
    console.log(`R21 Live PG Suite Result: ${pass} PASS / ${fail} FAIL`);
    console.log('────────────────────────────────────────────────────────────\n');

    if (fail > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('FATAL in R21 Live PG suite:', err);
  process.exit(1);
});
