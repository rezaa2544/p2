/* N-21 — server/schema.sql divergent from the migration chain.
 *
 * DEFECT: the tracked schema.sql is a generator artifact, but the generator's
 * --write-schema path wrote generateMigrationSQL() (33k data INSERTs + parity
 * ALTERs, ~5 MB) instead of the DDL-only reference, and the DDL path itself
 * omitted everything the migration chain adds server-side: `version` (only 9
 * version-tracked collections got it, and as a bare nullable INTEGER), chg_id
 * (migration 011), processing_token (021), server_outbox_dlq's unique index
 * (021) and server_tombstones (023 — which had to be hand-patched back into
 * the committed file after a regeneration dropped it). A database built from
 * the committed file no longer resembled one the chain produces: sms_wallet
 * had no version column, so the wallet CAS (N-18) could not work at all, and
 * every row took version = NULL so all conditional OCC UPDATEs matched
 * nothing (409 forever).
 *
 * FIX: generateDDL() now carries the chain-parity blocks and declares
 * `version INTEGER NOT NULL DEFAULT 1` inline; --write-schema writes the
 * DDL-only reference. This test pins the file to the generator so it cannot
 * drift again.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const SCHEMA_FILE = path.join(ROOT, 'server', 'schema.sql');
const MIGRATE_TOOL = path.join(ROOT, 'tools', 'migrate-to-pg.js');

const PG_HOST = '127.0.0.1';
const PG_PORT = '5433';
const PG_USER = 'postgres';
const TEST_DB = 'payesh_n21_drift';
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\16\\bin';

let results = [];
let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { results.push('  PASS  ' + name); },
    (e) => { failures++; results.push('  FAIL  ' + name + '\n          ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n          ')); }
  );
}

/* CRLF tolerance: the checkout is core.autocrlf=true, so a committed LF blob
   materialises as CRLF on disk and a naive string compare reports a false
   drift. Compare on LF-normalised text. */
function norm(s) {
  return String(s).replace(/\r\n/g, '\n');
}

(async () => {
  const tool = require(MIGRATE_TOOL);
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'model.json'), 'utf8'));
  const collections = model.collections || {};
  const collNames = Object.keys(collections);

  /* ── N21-1: the committed file must be exactly what the generator emits.
     A stale schema.sql is the whole defect — this is the guard that makes a
     regeneration mandatory whenever the model or the generator changes. */
  await check('N21-1 committed server/schema.sql is byte-identical to generateDDL() (no drift)', () => {
    assert.ok(fs.existsSync(SCHEMA_FILE), 'server/schema.sql is missing');
    const committed = norm(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    const generated = norm(tool.generateDDL());
    assert.strictEqual(committed, generated,
      'server/schema.sql has drifted from the generator output — run `node tools/migrate-to-pg.js --write-schema`');
  });

  /* ── N21-2: the OCC contract must be declared inline on EVERY app table.
     A nullable/defaultless version is functionally broken: new rows take
     NULL and every WHERE version=$base UPDATE matches nothing. */
  await check('N21-2 every app collection declares "version" INTEGER NOT NULL DEFAULT 1 inline', () => {
    const ddl = norm(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    const missing = [];
    const weak = [];
    for (const col of collNames) {
      const open = ddl.indexOf('CREATE TABLE IF NOT EXISTS ' + col + ' (');
      assert.ok(open !== -1, 'no CREATE TABLE for collection ' + col);
      const close = ddl.indexOf(');', open);
      const body = ddl.slice(open, close);
      const m = body.match(/"version"\s+([^\n]*)/);
      if (!m) { missing.push(col); continue; }
      if (!/INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1/i.test(m[1])) weak.push(col + ' -> ' + m[1].trim());
    }
    assert.deepStrictEqual(missing, [], 'collections with no version column at all: ' + missing.join(', '));
    assert.deepStrictEqual(weak, [], 'collections with a weak version declaration: ' + weak.join(', '));
  });

  /* ── N21-3: migration 011 parity — the delta change-ID infrastructure. */
  await check('N21-3 migration 011 parity: chg_id + payesh_chg_seq + bump trigger on the 14 delta tables', () => {
    const ddl = norm(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    const CHG = ['users', 'classes', 'subjects', 'schedule', 'enrollments',
      'attendance', 'grades', 'discipline', 'leaves', 'notifications',
      'announcements', 'hw_submissions', 'counselor_refs', 'counselor_msgs'];
    assert.ok(/CREATE SEQUENCE IF NOT EXISTS payesh_chg_seq/.test(ddl), 'payesh_chg_seq missing');
    assert.ok(/payesh_chg_bump\(\) RETURNS trigger/.test(ddl), 'payesh_chg_bump function missing');
    const problems = [];
    for (const t of CHG) {
      if (!new RegExp('ALTER TABLE ' + t + ' ADD COLUMN IF NOT EXISTS chg_id BIGINT').test(ddl)) problems.push(t + ': no chg_id column');
      if (!new RegExp('CREATE TRIGGER trg_' + t + '_chg BEFORE INSERT OR UPDATE ON ' + t).test(ddl)) problems.push(t + ': no bump trigger');
      if (!new RegExp('idx_' + t + '_chg_id ON ' + t + ' \\(chg_id\\)').test(ddl)) problems.push(t + ': no chg_id index');
    }
    assert.deepStrictEqual(problems, [], problems.join('; '));
    /* chg_id must stay server-internal: it is minted by the trigger and
       stripped by stripInternalColumns, so it must NOT be a model field —
       otherwise the generated INSERTs would carry it. */
    for (const t of CHG) {
      assert.ok(!(collections[t].fields || []).includes('chg_id'), t + ': chg_id leaked into the model field list');
    }
  });

  /* ── N21-4: migrations 021/023 parity — outbox lease, DLQ dedupe,
     durable tombstones. */
  await check('N21-4 migration 021/023 parity: processing_token, DLQ unique index, server_tombstones', () => {
    const ddl = norm(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    assert.ok(/processing_token TEXT/.test(ddl), 'server_outbox.processing_token missing (migration 021)');
    assert.ok(/idx_server_outbox_processing_lease/.test(ddl), 'outbox processing-lease index missing (migration 021)');
    assert.ok(/uq_server_outbox_dlq_outbox_id/.test(ddl), 'DLQ outbox_id unique index missing (migration 021)');
    assert.ok(/CREATE TABLE IF NOT EXISTS server_outbox_dlq/.test(ddl), 'server_outbox_dlq missing (migration 014)');
    assert.ok(/CREATE TABLE IF NOT EXISTS server_tombstones/.test(ddl), 'server_tombstones missing (migration 023)');
    assert.ok(/idx_server_tombstones_deleted_at/.test(ddl), 'server_tombstones deleted_at index missing');
    assert.ok(/idx_server_tombstones_school_deleted_at/.test(ddl), 'server_tombstones school+deleted_at index missing');
  });

  /* ── N21-5: the file is a true representation — it actually builds a
     working database whose OCC contract holds. Text parity alone cannot
     catch a column that reads correctly but behaves wrong. */
  await check('N21-5 live build: the DDL creates a database where version defaults to 1 and an OCC UPDATE matches', async () => {
    const psql = path.join(PG_BIN, 'psql.exe');
    /* -t -A: tuples-only, unaligned — so a scalar SELECT yields a bare value
       that parseInt can read (with headers the output starts with the column
       name and parseInt yields NaN). */
    const run = (db, sql) => new Promise((resolve, reject) => {
      execFile(psql, ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
        { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) },
        (err, stdout, stderr) => err ? reject(new Error(stderr || String(err))) : resolve(stdout));
    });
    const fileApply = (db) => new Promise((resolve, reject) => {
      execFile(psql, ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', '-f', SCHEMA_FILE],
        { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) },
        (err, stdout, stderr) => err ? reject(new Error(String(stderr || err).split('\n').filter(l => /ERROR/i.test(l)).slice(0, 3).join(' | '))) : resolve());
    });

    await run('postgres', 'DROP DATABASE IF EXISTS ' + TEST_DB + ';');
    await run('postgres', 'CREATE DATABASE ' + TEST_DB + ';');
    await fileApply(TEST_DB);

    /* version must be NOT NULL DEFAULT 1 on every APP collection. Internal
       tables (server_outbox / server_outbox_dlq) also carry a `version`
       column that is legitimately nullable — a delete event in the outbox
       holds no row version — so scope the contract to the app collections
       the OCC layer actually updates. */
    const weak = (await run(TEST_DB,
      "SELECT table_name FROM information_schema.columns WHERE column_name='version' AND table_schema='public' AND (is_nullable='NO' AND column_default='1') <> true;")).trim();
    const weakTables = weak.split('\n').map(s => s.trim()).filter(Boolean);
    const appLeaks = weakTables.filter(t => collections[t]);
    assert.deepStrictEqual(appLeaks, [],
      'app tables missing the NOT NULL DEFAULT 1 version contract: ' + appLeaks.join(', ') +
      ' (internal tables are allowed a nullable version: ' + weakTables.join(', ') + ')');

    /* an INSERT takes version=1 (not NULL) and the chg_id trigger fires */
    const ins = (await run(TEST_DB, "INSERT INTO users (id, role, full_name) VALUES (77001,'teacher','N21 drift guard') RETURNING chg_id, version;")).replace(/\s+/g, ' ').trim();
    const parts = ins.split('|');
    const chg = parseInt(parts[0], 10);
    const ver = parseInt(parts[1], 10);
    assert.ok(Number.isFinite(chg) && chg >= 1, 'chg_id trigger did not mint a value, got: ' + ins);
    assert.strictEqual(ver, 1, 'a fresh row must take version=1, got: ' + ins);

    /* and a base_version-matched OCC UPDATE then matches — the operation the
       whole OCC layer depends on; on the old nullable DDL it matched nothing */
    const upd = await run(TEST_DB, "UPDATE users SET full_name='N21 bumped', version=version+1 WHERE id=77001 AND version=1 RETURNING version;");
    assert.ok(/2/.test(upd), 'OCC UPDATE with base_version=1 did not match the row, got: ' + upd);

    await run('postgres', 'DROP DATABASE IF EXISTS ' + TEST_DB + ';');
  });

  console.log('\n=== N-21 schema drift / migration-chain parity ===');
  console.log(results.join('\n'));
  console.log((failures ? '\nFAILED: ' + failures : '\nALL PASSED') + ' (' + results.length + ' checks)');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('N-21 harness crashed:', e); process.exit(2); });
