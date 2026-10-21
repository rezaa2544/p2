#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-01-dr-unit-'));
let passed = 0;
function check(name, condition) {
  assert.strictEqual(condition, true, name);
  passed++;
  console.log('PASS ' + name);
}
function put(file, text) {
  fs.writeFileSync(file, text, { mode: 0o700 });
  fs.chmodSync(file, 0o700);
}

try {
  const bin = path.join(TEMP, 'bin');
  fs.mkdirSync(bin);
  const pitrArgs = path.join(TEMP, 'pitr-args.log');
  const dbLog = path.join(TEMP, 'pitr-database.log');
  put(path.join(bin, 'psql'), `#!/bin/sh
query=''
for arg in "$@"; do query="$arg"; done
printf '%s\\n' "PGDATABASE=$PGDATABASE" >> "$PSQL_DATABASE_LOG"
case "$query" in
  *"SELECT pg_is_in_recovery()"*) echo f ;;
  *"SELECT count(*) FROM users"*|*"SELECT count(*) FROM schools"*|*"SELECT count(*) FROM classes"*|*"SELECT count(*) FROM grades"*|*"SELECT count(*) FROM attendance"*) echo 1 ;;
  *"SELECT coalesce(md5(string_agg"*) echo checksum ;;
  *"SELECT 1"*) echo 1 ;;
esac
exit 0
`);
  put(path.join(bin, 'pg_ctl'), '#!/bin/sh\nexit 0\n');
  put(path.join(bin, 'pg_isready'), '#!/bin/sh\nexit 0\n');
  put(path.join(TEMP, 'fake-pgbackrest.sh'), `#!/bin/sh
for arg in "$@"; do printf 'ARG=<%s>\\n' "$arg" >> "$PBR_ARGUMENTS_LOG"; done
exit 0
`);
  const target = '2026-10-19 14:25:36.123456+00';
  const pitrEnv = Object.assign({}, process.env, {
    PATH: bin + path.delimiter + process.env.PATH,
    PBR_EXEC: 'sh ' + path.join(TEMP, 'fake-pgbackrest.sh'),
    PBR_DEST_ROOT: path.join(TEMP, 'pitr-runs'),
    PBR_DATABASE: 'payesh',
    PBR_ARGUMENTS_LOG: pitrArgs,
    PSQL_DATABASE_LOG: dbLog
  });
  const pitr = spawnSync('bash', [path.join(ROOT, 'tools/pitr-restore.sh'), '--time', target], {
    cwd: ROOT, encoding: 'utf8', env: pitrEnv
  });
  assert.strictEqual(pitr.status, 0, pitr.stderr || pitr.stdout);
  const pgBackRestArgs = fs.readFileSync(pitrArgs, 'utf8');
  check('PITR preserves timestamp as a single target argument', pgBackRestArgs.includes('ARG=<--target=' + target + '>'));
  check('PITR verification connects to the restored application database, not postgres',
    fs.readFileSync(dbLog, 'utf8').split(/\r?\n/).filter(Boolean).length > 0
      && fs.readFileSync(dbLog, 'utf8').split(/\r?\n/).filter(Boolean).every((line) => line === 'PGDATABASE=payesh'));

  const drRuntimeSource = fs.readFileSync(path.join(ROOT, 'tools/m15-01-dr-runtime.sh'), 'utf8');
  const workflowSource = fs.readFileSync(path.join(ROOT, '.github/workflows/m15-01-runtime-evidence.yml'), 'utf8');
  check('workflow fails when either required runtime or DR evidence artifact is missing',
    (workflowSource.match(/if-no-files-found: error/g) || []).length === 2);
  check('DR PASS artifact explicitly cannot disposition M15-01 closure',
    drRuntimeSource.includes("mission_disposition: 'SUBSET_ONLY_NOT_M15_01_CLOSURE'"));
  check('DR command and output logging uses the shared secret redactor',
    drRuntimeSource.includes('format-command') && drRuntimeSource.includes('redact-file')
      && drRuntimeSource.includes('OUTPUT_REDACTION_FAILED'));
  const redactionPos = drRuntimeSource.indexOf('redact_file "$output"');
  const firstErrorPos = drRuntimeSource.indexOf('grep -Eim1', redactionPos);
  const diagnosticTailPos = drRuntimeSource.indexOf('tail -n 8 "$sanitized_output"', firstErrorPos);
  const diagnosticBoundPos = drRuntimeSource.indexOf('cut -c1-1200', diagnosticTailPos);
  const diagnosticPos = drRuntimeSource.indexOf('pg-ha-start sanitized failure excerpt');
  check('failed pg-ha-start exposes bounded first-error/tail context only after secret redaction',
    redactionPos >= 0 && firstErrorPos > redactionPos && diagnosticTailPos > firstErrorPos
      && diagnosticBoundPos > diagnosticTailPos && diagnosticPos > diagnosticBoundPos
      && drRuntimeSource.includes('(E:|Err:|error response from daemon|failed to solve')
      && !drRuntimeSource.includes('|cannot|unable)')
      && drRuntimeSource.includes('cut -c1-500') && drRuntimeSource.includes('cut -c1-600')
      && drRuntimeSource.includes('diagnostic="${diagnostic//%/%25}"'));
  check('DR evidence requires a clean source tree in addition to the GitHub SHA match',
    drRuntimeSource.includes('git status --porcelain --untracked-files=all')
      && drRuntimeSource.includes('SOURCE_TREE_CLEAN="true"'));
  check('DR cleanup refuses pre-existing Compose projects and only tears down projects claimed by this run',
    drRuntimeSource.includes('assert_compose_project_unused')
      && drRuntimeSource.includes('docker ps --all --quiet --filter "label=com.docker.compose.project=${project}"')
      && drRuntimeSource.includes('docker volume ls --quiet --filter "label=com.docker.compose.project=${project}"')
      && drRuntimeSource.includes('docker network ls --quiet --filter "label=com.docker.compose.project=${project}"')
      && drRuntimeSource.includes('if [[ "$PG_PROJECT_OWNED" == 1 ]]')
      && drRuntimeSource.includes('if [[ "$REDIS_PROJECT_OWNED" == 1 ]]'));
  const runLoggedStart = drRuntimeSource.indexOf('run_logged() {');
  const runLoggedEnd = drRuntimeSource.indexOf('\n}\n', runLoggedStart);
  const runLoggedBlock = runLoggedStart >= 0 && runLoggedEnd > runLoggedStart
    ? drRuntimeSource.slice(runLoggedStart, runLoggedEnd) : '';
  const outputCat = runLoggedBlock.indexOf('cat "$sanitized_output" >> "$COMMAND_LOG"');
  const outputElse = runLoggedBlock.indexOf('else', outputCat);
  const rawOutputCleanup = runLoggedBlock.indexOf('rm -f "$output"', outputElse);
  check('DR stages raw output outside artifacts, preserves it only after redaction, and deletes raw data on failure',
    runLoggedBlock.includes('"$RAW_OUTPUT_DIR/${label}.log"')
      && runLoggedBlock.includes('"$EVIDENCE_DIR/${label}.log"')
      && outputCat >= 0 && outputElse > outputCat && rawOutputCleanup > outputElse);
  const pitrCatalogStart = drRuntimeSource.indexOf('run_logged pitr-restored-current-schema-ledger-check');
  const pitrCatalogEnd = drRuntimeSource.indexOf('run_logged pitr-stop-restored-instance', pitrCatalogStart);
  const pitrCatalogBlock = pitrCatalogStart >= 0 && pitrCatalogEnd > pitrCatalogStart
    ? drRuntimeSource.slice(pitrCatalogStart, pitrCatalogEnd) : '';
  const pitrCatalogContract = (source) => source.includes("SELECT version || '|' || name || '|' || checksum FROM schema_migrations ORDER BY version ASC;")
    && source.includes('if [[ "$PITR_SCHEMA_LEDGER" != "$EXPECTED_SCHEMA_LEDGER" ]]')
    && source.includes('PITR_SCHEMA_CATALOG_MATCH="true"');
  check('PITR restored schema compares every migration version, name, and checksum', pitrCatalogContract(pitrCatalogBlock));
  check('PITR schema gate is mutation-sensitive when checksum verification is removed',
    !pitrCatalogContract(pitrCatalogBlock.replace('|| checksum FROM schema_migrations', '|| name FROM schema_migrations')));
  check('pg-backup renders restrictive pgBackRest config as root before handing it to postgres',
    drRuntimeSource.includes('compose_pg exec -T -u root pg-backup /opt/payesh/entrypoints/render-config.sh'));

  const badDb = spawnSync('bash', [path.join(ROOT, 'tools/pitr-restore.sh'), '--time', target, '--no-start'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, pitrEnv, { PBR_DATABASE: 'payesh;drop_schema' })
  });
  check('PITR rejects an unsafe database-name override before restore', badDb.status !== 0
    && /PBR_DATABASE must be a simple PostgreSQL database name/.test(badDb.stderr));

  const countFile = path.join(TEMP, 'pg-is-ready-count');
  const promoteFile = path.join(TEMP, 'pg-promote-called');
  put(path.join(bin, 'pg_isready'), `#!/bin/sh
printf 'probe\\n' >> "$PG_ISREADY_COUNT_FILE"
exit "${'${PG_ISREADY_RESULT:-1}'}"
`);
  put(path.join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  put(path.join(bin, 'psql'), `#!/bin/sh
query=''
for arg in "$@"; do query="$arg"; done
case "$query" in
  *"SELECT pg_is_in_recovery()"*) echo t ;;
  *"pg_wal_lsn_diff"*) echo 0 ;;
  *"pg_promote"*) echo t; printf 'called\\n' >> "$PG_PROMOTE_LOG" ;;
esac
exit 0
`);
  const failoverScript = path.join(ROOT, 'tools/failover-postgres.sh');
  const commonFailoverEnv = {
    PATH: bin + path.delimiter + process.env.PATH,
    PGHOST: '127.0.0.1', PGPORT: '5433', PGUSER: 'postgres', PGDATABASE: 'payesh',
    OLD_PGHOST: '127.0.0.1', OLD_PGPORT: '5432',
    PG_ISREADY_COUNT_FILE: countFile, PG_PROMOTE_LOG: promoteFile
  };
  const alive = spawnSync('bash', [failoverScript, '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, commonFailoverEnv, { PG_ISREADY_RESULT: '0' })
  });
  check('PostgreSQL failover refuses promotion when the old primary answers its first probe',
    alive.status === 1 && /death probe 1\/3/.test(alive.stderr) && !fs.existsSync(promoteFile));
  check('live-primary guard performs one probe then fails closed',
    fs.readFileSync(countFile, 'utf8').split(/\r?\n/).filter(Boolean).length === 1);

  fs.writeFileSync(countFile, '');
  const dead = spawnSync('bash', [failoverScript, '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, commonFailoverEnv, { PG_ISREADY_RESULT: '1' })
  });
  check('PostgreSQL failover requires three failed primary probes before dry-run readiness',
    dead.status === 0 && /DRY-RUN: آمادهٔ promote/.test(dead.stdout)
      && fs.readFileSync(countFile, 'utf8').split(/\r?\n/).filter(Boolean).length === 3);
  check('dry-run never invokes pg_promote', !fs.existsSync(promoteFile));

  console.log(`M15-01 DR runtime unit tests: ${passed} passed, 0 failed`);
} catch (error) {
  console.error('M15-01 DR runtime unit tests: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(TEMP, { recursive: true, force: true });
}
