#!/usr/bin/env node
/* Guarded relational fixture seeder for disposable M15-01 CI databases only.
 * It never drops schema/data and refuses any non-empty fixture target. */
'use strict';

const { URL } = require('url');
const { Client } = require('pg');
const fixtures = require('./seed-relational-small');
const { discoverMigrationFiles } = require('./migrate-ledger');

function validateSeedTarget(raw, profile) {
  if (!['runtime', 'dr'].includes(profile)) throw new Error('m15_seed_profile_invalid');
  let url;
  try { url = new URL(String(raw || '')); }
  catch (_) { throw new Error('m15_seed_dsn_invalid'); }
  let database;
  try { database = decodeURIComponent(String(url.pathname || '').replace(/^\/+/, '')); }
  catch (_) { throw new Error('m15_seed_database_path_invalid'); }
  const localHosts = new Set(['127.0.0.1', 'localhost']);
  const validDatabase = profile === 'dr'
    ? database === 'payesh'
    : /^payesh_m15_[a-z0-9_]{1,40}$/.test(database);
  if (!localHosts.has(url.hostname) || url.protocol !== 'postgres:' || Number(url.port) !== 5432
      || !validDatabase || url.search || url.hash || !url.username || !url.password) {
    throw new Error('m15_seed_target_not_isolated_loopback');
  }
  return { profile, database };
}

function migrationCatalogMatches(ledgerRows, migrationFiles) {
  if (!Array.isArray(ledgerRows) || !Array.isArray(migrationFiles)
      || ledgerRows.length !== migrationFiles.length) return false;
  return migrationFiles.every((migration, index) => {
    const applied = ledgerRows[index];
    return applied && String(applied.version) === String(migration.version)
      && String(applied.name) === String(migration.name)
      && String(applied.checksum) === String(migration.checksum);
  });
}

function validateFixtureGeneratedCounts(result) {
  if (Number(result && result.enrollments) !== 20 || Number(result && result.attendance) !== 50
      || Number(result && result.grades) !== 30 || !Array.isArray(result && result.attendanceDates)
      || result.attendanceDates.length !== 5
      || result.attendanceDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))) {
    throw new Error('m15_seed_fixture_generated_count_mismatch');
  }
  return true;
}

function summarizeFixtureResult(result) {
  if (!result || !Array.isArray(result.schoolIds) || result.schoolIds.length !== 2
      || new Set(result.schoolIds.map(String)).size !== 2
      || !Array.isArray(result.userIds) || result.userIds.length !== 15) {
    throw new Error('m15_seed_fixture_shape_invalid');
  }
  const managers = result.userIds.filter((user) => user && user.role === 'manager');
  const managerSchools = new Set(managers.map((user) => String(user.school_id)));
  const fixtureSchools = new Set(result.schoolIds.map(String));
  if (managers.length !== 2 || managerSchools.size !== 2
      || Array.from(managerSchools).some((schoolId) => !fixtureSchools.has(schoolId))) {
    throw new Error('m15_seed_manager_scope_invalid');
  }
  return { tenantCount: fixtureSchools.size, managerCount: managers.length };
}

async function seedDatabase(connectionString, profile) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.M15_RUNTIME_ALLOW_CI !== '1') {
    throw new Error('m15_ci_seed_guard_rejected');
  }
  const target = validateSeedTarget(connectionString, profile);
  const migrationFiles = discoverMigrationFiles();
  const latestMigration = migrationFiles[migrationFiles.length - 1];
  if (!latestMigration) throw new Error('m15_seed_migration_catalog_empty');

  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 30000 });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const ledger = await client.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;');
    const ledgerCount = ledger.rows.length;
    const ledgerLatest = String(ledger.rows[ledgerCount - 1] && ledger.rows[ledgerCount - 1].version || '');
    if (ledgerCount !== migrationFiles.length || ledgerLatest !== latestMigration.version
        || !migrationCatalogMatches(ledger.rows, migrationFiles)) {
      throw new Error('m15_seed_schema_not_current');
    }

    const before = await fixtures.counts(client);
    const occupied = Object.entries(before).filter(([, count]) => Number(count) !== 0);
    if (occupied.length) throw new Error('m15_seed_refusing_nonempty_fixture_tables:' + occupied.map(([name]) => name).join(','));

    await client.query('BEGIN');
    let result;
    try {
      result = await fixtures.loadFixture(client);
      await client.query('SET CONSTRAINTS ALL IMMEDIATE;');
      const after = await fixtures.counts(client);
      const expected = { schools: 2, users: 15, subjects: 6, classes: 4, enrollments: 20, attendance: 50, grades: 30 };
      for (const [table, count] of Object.entries(expected)) {
        if (Number(after[table]) !== count) throw new Error('m15_seed_fixture_count_mismatch:' + table);
      }
      const fixtureSummary = summarizeFixtureResult(result);
      validateFixtureGeneratedCounts(result);
      await client.query('COMMIT;');
      return {
        profile: target.profile,
        database: target.database,
        migration_count: ledgerCount,
        latest_migration: ledgerLatest,
        row_counts: after,
        tenant_count: fixtureSummary.tenantCount,
        manager_count: fixtureSummary.managerCount,
        attendance_fixture_latest_date: result.attendanceDates[0],
        phone_or_national_id_recorded: false
      };
    } catch (error) {
      try { await client.query('ROLLBACK;'); } catch (_) {}
      throw error;
    }
  } finally {
    if (connected) await client.end();
  }
}

async function main() {
  const connectionString = String(process.env.DATABASE_URL || '');
  const profile = String(process.env.M15_CI_SEED_PROFILE || '');
  const result = await seedDatabase(connectionString, profile);
  console.log('M15 isolated relational fixture seeded: ' + JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    const message = String(error && error.message || error || 'unknown');
    console.error('M15 isolated fixture seeder failed: ' + message.slice(0, 180));
    process.exitCode = 1;
  });
}

module.exports = {
  validateSeedTarget,
  migrationCatalogMatches,
  validateFixtureGeneratedCounts,
  summarizeFixtureResult,
  seedDatabase
};
