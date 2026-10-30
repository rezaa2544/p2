#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { prepareMigrationSql, migrateDown, migrateUp, computeChecksum } = require('../tools/migrate-ledger');

const sharedUrl = process.env.DATABASE_URL || process.env.PGURL;
if (!sharedUrl) throw new Error('DATABASE_URL/PGURL is required');

/* M15-01 (2026-10-30): this suite used to roll the SHARED database down to
   011 and leave it there, which made it order-dependent in two directions:
   (a) its own outcome depended on whatever data earlier suites had written —
   migration 025 widens bell_schedules.days to TEXT precisely because a real
   week stringifies to ~1.3 KB, and 025's down migration is fail-closed, so a
   seeded database turns the rollback into `value too long for type character
   varying(255)`; (b) reaching 011 destroys the shared state every later suite
   expects. A dedicated scratch database removes both: the chain is still the
   real chain, the ledger is still the real ledger, and nothing outside this
   suite changes. */
const SCRATCH_DB = 'payesh_m012_crash';
const withDb = (url, name) => {
  const u = new URL(url);
  u.pathname = '/' + name;
  return u.toString();
};
const scratchUrl = withDb(sharedUrl, SCRATCH_DB);

async function scalar(client, sql, params=[]) {
  const r = await client.query(sql, params);
  return r.rows[0] && Object.values(r.rows[0])[0];
}

(async () => {
  /* admin connection on the default database: create the scratch database */
  const admin = new Client({ connectionString: withDb(sharedUrl, 'postgres') });
  await admin.connect();
  try {
    await admin.query('DROP DATABASE IF EXISTS ' + SCRATCH_DB + ' WITH (FORCE)');
    await admin.query('CREATE DATABASE ' + SCRATCH_DB);
  } finally {
    await admin.end();
  }

  const client = new Client({ connectionString: scratchUrl });
  await client.connect();
  try {
    // Bring the scratch database to the head of the chain first, so the
    // rollback below walks the real down migrations rather than doing nothing.
    await migrateUp(client, { pgUrl: scratchUrl });

    // Put the database at 011: this is the exact pre-012 state needed for the
    // crash-window experiment. No historical evidence is substituted.
    while (String(await scalar(client, "SELECT COALESCE(MAX(version),'000') FROM schema_migrations")) !== '011') {
      const latest = String(await scalar(client, "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"));
      if (latest === '011') break;
      await migrateDown(client, latest, { pgUrl: scratchUrl });
    }

    const src = fs.readFileSync(path.join(__dirname, '..', 'migrations', '012_partition_grades_attendance.sql'), 'utf8');
    const checksum = computeChecksum(src);

    // Simulated crash boundary: execute the migration itself, which contains
    // its real internal COMMITs, but deliberately do NOT execute the ledger
    // INSERT. Terminating here is equivalent to a process crash after swap
    // commit and before the ledger write.
    execFileSync('psql', [scratchUrl, '-v', 'ON_ERROR_STOP=1', '-q'], {
      input: prepareMigrationSql(src),
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });

    const before = await client.query("SELECT 1 FROM schema_migrations WHERE version='012'");
    assert.strictEqual(before.rowCount, 0, 'crash simulation must leave 012 absent from ledger');

    const sentinel = await scalar(client, "SELECT COUNT(*) FROM pg_class WHERE relname IN ('attendance','grades') AND relkind='p'");
    assert.strictEqual(Number(sentinel), 2, 'swap must be committed before simulated crash');

    // Recovery path: runner must detect ALREADY_APPLIED and record 012
    // idempotently without re-running the destructive swap.
    const recovered = await migrateUp(client, { pgUrl: scratchUrl });
    assert(recovered.some(x => x.version === '012' && x.status === 'ALREADY_APPLIED_RECOVERED'));
    const row = await client.query("SELECT checksum FROM schema_migrations WHERE version='012'");
    assert.strictEqual(row.rows[0].checksum, checksum);

    // Independent re-run: a second up is a no-op and preserves the checksum.
    const again = await migrateUp(client, { pgUrl: scratchUrl });
    assert.strictEqual(again.length, 0);

    console.log('MIGRATION 012 CRASH/RECOVERY LIVE: PASS');
  } finally {
    await client.end();
    const cleanup = new Client({ connectionString: withDb(sharedUrl, 'postgres') });
    try {
      await cleanup.connect();
      await cleanup.query('DROP DATABASE IF EXISTS ' + SCRATCH_DB + ' WITH (FORCE)');
    } catch (e) {
      console.error('MIGRATION 012: scratch database cleanup failed: ' + e.message);
    } finally {
      await cleanup.end().catch(() => { });
    }
  }
})().catch(err => {
  console.error('MIGRATION 012 CRASH/RECOVERY LIVE: FAIL', err.stack || err);
  process.exit(1);
});
