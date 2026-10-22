#!/usr/bin/env node
/* CI-only helper for isolated M15-01 PostgreSQL databases. */
'use strict';

const { URL } = require('url');

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.M15_RUNTIME_ALLOW_CI !== '1') {
    throw new Error('m15_ci_database_guard_rejected');
  }
  const action = process.argv[2];
  const databaseName = String(process.argv[3] || '');
  if (!['create', 'drop'].includes(action)) throw new Error('usage: node tools/m15-01-ci-db.js <create|drop> <payesh_m15_*>');
  if (!/^payesh_m15_[a-z0-9_]{1,40}$/.test(databaseName)) throw new Error('m15_database_name_not_isolated');
  const connectionString = String(process.env.PG_ADMIN_URL || '');
  let adminUrl;
  try { adminUrl = new URL(connectionString); } catch (_) { throw new Error('m15_admin_dsn_invalid'); }
  let adminDatabase;
  try { adminDatabase = decodeURIComponent(String(adminUrl.pathname || '').replace(/^\/+/, '')); }
  catch (_) { throw new Error('m15_admin_dsn_path_invalid'); }
  if (!['127.0.0.1', 'localhost'].includes(adminUrl.hostname) || adminUrl.protocol !== 'postgres:'
      || Number(adminUrl.port) !== 5432 || adminDatabase !== 'payesh_ci' || adminUrl.search || adminUrl.hash) {
    throw new Error('m15_admin_database_target_not_loopback');
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (action === 'create') {
      const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1;', [databaseName]);
      if (existing.rowCount) throw new Error('m15_database_already_exists_refusing_reuse');
      await client.query('CREATE DATABASE "' + databaseName + '";');
      console.log('M15 isolated database created: ' + databaseName);
    } else {
      await client.query('DROP DATABASE IF EXISTS "' + databaseName + '" WITH (FORCE);');
      console.log('M15 isolated database dropped: ' + databaseName);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('M15 isolated database helper failed: ' + String(error && error.message || error));
  process.exitCode = 1;
});
