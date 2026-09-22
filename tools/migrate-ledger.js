#!/usr/bin/env node
/**
 * tools/migrate-ledger.js — PostgreSQL Authoritative Migration Ledger (C-6 / R21)
 *
 * Requirements:
 * - Table: schema_migrations (version PRIMARY KEY, name, applied_at, checksum)
 * - Atomic execution: SQL + ledger record in a single transaction (or coordinated transaction)
 * - Idempotency: Already-applied migrations are skipped; checksum verified
 * - Out-of-order / skipped migration detection
 * - Failed migration rolls back cleanly and is NOT recorded in ledger
 * - Replaces raw shell psql loops as the authoritative migration runner
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function prepareMigrationSql(sql) {
  let cleaned = sql;
  cleaned = cleaned.replace(/^(\s*(--[^\n]*\n|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/|\s)*)BEGIN\s*;/i, '$1');
  cleaned = cleaned.replace(/COMMIT\s*;(\s*(--[^\n]*\n|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/|\s)*)$/i, '$1');
  return cleaned;
}

async function ensureLedgerTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL
    );
  `);
}

async function getAppliedMigrations(client) {
  await ensureLedgerTable(client);
  const res = await client.query(`
    SELECT version, name, applied_at, checksum
      FROM schema_migrations
     ORDER BY version ASC;
  `);
  return res.rows;
}

function discoverMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at ${MIGRATIONS_DIR}`);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  const seenVersions = new Map();

  return files.map(file => {
    const match = file.match(/^([0-9]{3})_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration file format: ${file}. Expected NNN_name.sql`);
    }

    const version = match[1];
    if (seenVersions.has(version)) {
      throw new Error(
        `DUPLICATE_MIGRATION_VERSION: version ${version} is used by ${seenVersions.get(version)} and ${file}`
      );
    }
    seenVersions.set(version, file);

    const fullPath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeChecksum(content);
    return {
      version,
      name: file,
      path: fullPath,
      content,
      checksum
    };
  });
}

function canRunPsql() {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Executes pending migrations using atomic transactions and ledger verification.
 */
async function migrateUp(client, options = {}) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  const allFiles = discoverMigrationFiles();
  const results = [];
  const pgUrl = options.pgUrl || process.env.DATABASE_URL || process.env.PGURL;
  const usePsql = !!(pgUrl && canRunPsql());

  let firstUnappliedIndex = -1;
  let lastAppliedIndex = -1;
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    if (appliedMap.has(file.version)) {
      if (firstUnappliedIndex !== -1) {
        const skippedFile = allFiles[firstUnappliedIndex];
        const err = new Error(
          `MIGRATION_OUT_OF_ORDER: Migration ${file.name} is recorded as applied, but preceding migration ${skippedFile.name} was not applied`
        );
        err.code = 'MIGRATION_OUT_OF_ORDER';
        err.expectedVersion = skippedFile.version;
        err.actualVersion = file.version;
        throw err;
      }
      const recorded = appliedMap.get(file.version);
      if (recorded.checksum !== file.checksum) {
        const err = new Error(
          `MIGRATION_CHECKSUM_MISMATCH: Migration ${file.name} (version ${file.version}) has checksum ${file.checksum} but ledger recorded ${recorded.checksum}`
        );
        err.code = 'MIGRATION_CHECKSUM_MISMATCH';
        err.version = file.version;
        throw err;
      }
      lastAppliedIndex = i;
    } else {
      if (firstUnappliedIndex === -1) {
        firstUnappliedIndex = i;
      }
    }
  }

  const startIndex = firstUnappliedIndex === -1 ? allFiles.length : firstUnappliedIndex;
  for (let i = startIndex; i < allFiles.length; i++) {
    const file = allFiles[i];

    // Execute migration with atomic ledger entry
    try {
      if (usePsql) {
        const cleanedContent = prepareMigrationSql(file.content);
        const ledgerSql = `\nINSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES ('${file.version.replace(/'/g, "''")}', '${file.name.replace(/'/g, "''")}', NOW(), '${file.checksum.replace(/'/g, "''")}');\n`;
        const hasInternalTx = /\bCOMMIT\s*;/i.test(cleanedContent);
        const scriptSql = hasInternalTx
          ? `${cleanedContent}\n${ledgerSql}`
          : `BEGIN;\n${cleanedContent}\n${ledgerSql}COMMIT;\n`;
        execFileSync('psql', [pgUrl, '-v', 'ON_ERROR_STOP=1', '-q'], { input: scriptSql, stdio: ['pipe', 'inherit', 'inherit'] });
      } else {
        await client.query('BEGIN');
        await client.query(prepareMigrationSql(file.content));
        await client.query(`
          INSERT INTO schema_migrations (version, name, applied_at, checksum)
          VALUES ($1, $2, NOW(), $3);
        `, [file.version, file.name, file.checksum]);
        await client.query('COMMIT');
      }

      lastAppliedIndex = i;
      appliedMap.set(file.version, { version: file.version, name: file.name, checksum: file.checksum });
      results.push({ version: file.version, name: file.name, status: 'APPLIED', checksum: file.checksum });
    } catch (err) {
      if (!usePsql) {
        try { await client.query('ROLLBACK'); } catch (_) {}
      }
      const failErr = new Error(`MIGRATION_EXECUTION_FAILED: Error in migration ${file.name}: ${err.message}`);
      failErr.code = 'MIGRATION_EXECUTION_FAILED';
      failErr.cause = err;
      failErr.migration = file.name;
      throw failErr;
    }
  }

  return results;
}

/**
 * Rolls back the latest applied migration.
 */
async function migrateDown(client, targetVersion = null, options = {}) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  if (applied.length === 0) return null;

  const latest = applied[applied.length - 1];
  if (targetVersion && latest.version !== targetVersion) {
    const err = new Error(
      `MIGRATION_ROLLBACK_ORDER_VIOLATION: Requested rollback of version ${targetVersion}, but latest applied version is ${latest.version}`
    );
    err.code = 'MIGRATION_ROLLBACK_ORDER_VIOLATION';
    throw err;
  }

  const downFileName = `${latest.version}_${latest.name.replace(/^([0-9]{3})_|\.sql$/g, '')}.down.sql`;
  const downPath = path.join(MIGRATIONS_DIR, downFileName);
  if (!fs.existsSync(downPath)) {
    const err = new Error(`MIGRATION_DOWN_FILE_MISSING: Down file ${downFileName} does not exist`);
    err.code = 'MIGRATION_DOWN_FILE_MISSING';
    throw err;
  }

  const downContent = fs.readFileSync(downPath, 'utf8');
  const pgUrl = options.pgUrl || process.env.DATABASE_URL || process.env.PGURL;
  const usePsql = !!(pgUrl && canRunPsql());

  try {
    if (usePsql) {
      const cleanedDown = prepareMigrationSql(downContent);
      const ledgerSql = `\nDELETE FROM schema_migrations WHERE version = '${latest.version.replace(/'/g, "''")}';\n`;
      const hasInternalTx = /\bCOMMIT\s*;/i.test(cleanedDown);
      const scriptSql = hasInternalTx
        ? `${cleanedDown}\n${ledgerSql}`
        : `BEGIN;\n${cleanedDown}\n${ledgerSql}COMMIT;\n`;
      execFileSync('psql', [pgUrl, '-v', 'ON_ERROR_STOP=1', '-q'], { input: scriptSql, stdio: ['pipe', 'inherit', 'inherit'] });
    } else {
      await client.query('BEGIN');
      await client.query(prepareMigrationSql(downContent));
      await client.query('DELETE FROM schema_migrations WHERE version = $1;', [latest.version]);
      await client.query('COMMIT');
    }

    return { version: latest.version, name: downFileName, status: 'ROLLED_BACK' };
  } catch (err) {
    if (!usePsql) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    const failErr = new Error(`MIGRATION_ROLLBACK_FAILED: Error rolling back ${downFileName}: ${err.message}`);
    failErr.code = 'MIGRATION_ROLLBACK_FAILED';
    failErr.cause = err;
    throw failErr;
  }
}

/**
 * Rolls back all applied migrations in reverse order until the ledger is empty.
 */
async function migrateAllDown(client, options = {}) {
  await ensureLedgerTable(client);
  const results = [];
  while (true) {
    const rolled = await migrateDown(client, null, options);
    if (!rolled) break;
    results.push(rolled);
  }
  return results;
}

async function getStatus(client) {
  await ensureLedgerTable(client);
  const applied = await getAppliedMigrations(client);
  const allFiles = discoverMigrationFiles();
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  return allFiles.map(f => ({
    version: f.version,
    name: f.name,
    applied: appliedMap.has(f.version),
    applied_at: appliedMap.has(f.version) ? appliedMap.get(f.version).applied_at : null,
    checksum: f.checksum
  }));
}

if (require.main === module) {
  const { Client } = require('pg');
  const pgUrl = process.env.DATABASE_URL || process.env.PGURL;
  if (!pgUrl) {
    console.error('FATAL: DATABASE_URL or PGURL environment variable is required');
    process.exit(1);
  }
  const client = new Client({ connectionString: pgUrl });
  const command = process.argv[2] || 'up';

  (async () => {
    await client.connect();
    try {
      if (command === 'up') {
        const res = await migrateUp(client, { pgUrl });
        console.log(`[LEDGER] Applied ${res.length} migration(s).`);
      } else if (command === 'down') {
        const res = await migrateDown(client, process.argv[3] || null, { pgUrl });
        console.log(`[LEDGER] Rolled back migration:`, res);
      } else if (command === 'down-all') {
        const res = await migrateAllDown(client, { pgUrl });
        console.log(`[LEDGER] Rolled back total ${res.length} migration(s).`);
      } else if (command === 'status') {
        const st = await getStatus(client);
        console.table(st);
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    } finally {
      await client.end();
    }
  })().catch(err => {
    console.error(`[LEDGER FATAL] Migration failed:`, err);
    process.exit(1);
  });
}

module.exports = {
  computeChecksum,
  prepareMigrationSql,
  ensureLedgerTable,
  getAppliedMigrations,
  discoverMigrationFiles,
  migrateUp,
  migrateDown,
  migrateAllDown,
  getStatus
};
