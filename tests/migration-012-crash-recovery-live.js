#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { prepareMigrationSql, migrateDown, migrateUp, computeChecksum } = require('../tools/migrate-ledger');

const pgUrl = process.env.DATABASE_URL || process.env.PGURL;
if (!pgUrl) throw new Error('DATABASE_URL/PGURL is required');

async function scalar(client, sql, params=[]) {
  const r = await client.query(sql, params);
  return r.rows[0] && Object.values(r.rows[0])[0];
}

(async () => {
  const client = new Client({ connectionString: pgUrl });
  await client.connect();
  try {
    // Put the database at 011: this is the exact pre-012 state needed for the
    // crash-window experiment. No historical evidence is substituted.
    while (String(await scalar(client, "SELECT COALESCE(MAX(version),'000') FROM schema_migrations")) !== '011') {
      const latest = String(await scalar(client, "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"));
      if (latest === '011') break;
      await migrateDown(client, latest, { pgUrl });
    }

    const src = fs.readFileSync(path.join(__dirname, '..', 'migrations', '012_partition_grades_attendance.sql'), 'utf8');
    const checksum = computeChecksum(src);

    // Simulated crash boundary: execute the migration itself, which contains
    // its real internal COMMITs, but deliberately do NOT execute the ledger
    // INSERT. Terminating here is equivalent to a process crash after swap
    // commit and before the ledger write.
    execFileSync('psql', [pgUrl, '-v', 'ON_ERROR_STOP=1', '-q'], {
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
    const recovered = await migrateUp(client, { pgUrl });
    assert(recovered.some(x => x.version === '012' && x.status === 'ALREADY_APPLIED_RECOVERED'));
    const row = await client.query("SELECT checksum FROM schema_migrations WHERE version='012'");
    assert.strictEqual(row.rows[0].checksum, checksum);

    // Independent re-run: a second up is a no-op and preserves the checksum.
    const again = await migrateUp(client, { pgUrl });
    assert.strictEqual(again.length, 0);

    console.log('MIGRATION 012 CRASH/RECOVERY LIVE: PASS');
  } finally {
    await client.end();
  }
})().catch(err => {
  console.error('MIGRATION 012 CRASH/RECOVERY LIVE: FAIL', err.stack || err);
  process.exit(1);
});
