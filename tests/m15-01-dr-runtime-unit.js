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
  const pitrDirs = fs.readdirSync(path.join(TEMP, 'pitr-runs'));
  const pitrConf = fs.readFileSync(path.join(TEMP, 'pitr-runs', pitrDirs[0], 'etc', 'postgresql.conf'), 'utf8');
  check('PITR isolated postgresql.conf points hba_file/ident_file at restored PGDATA and keeps max_connections >= primary default',
    pitrConf.includes("hba_file = '") && pitrConf.includes("/data/pg_hba.conf'")
      && pitrConf.includes("ident_file = '") && pitrConf.includes("/data/pg_ident.conf'")
      && pitrConf.includes('archive_mode = off')
      && pitrConf.includes('max_connections = 200'));
  check('PITR verification connects to the restored application database, not postgres',
    fs.readFileSync(dbLog, 'utf8').split(/\r?\n/).filter(Boolean).length > 0
      && fs.readFileSync(dbLog, 'utf8').split(/\r?\n/).filter(Boolean).every((line) => line === 'PGDATABASE=payesh'));

  const drRuntimeSource = fs.readFileSync(path.join(ROOT, 'tools/m15-01-dr-runtime.sh'), 'utf8');
  const pgDockerfileSource = fs.readFileSync(path.join(ROOT, 'infra/postgres/Dockerfile'), 'utf8');
  const workflowSource = fs.readFileSync(path.join(ROOT, '.github/workflows/m15-01-runtime-evidence.yml'), 'utf8');
  check('workflow fails when either required runtime or DR evidence artifact is missing',
    (workflowSource.match(/if-no-files-found: error/g) || []).length === 2);
  check('DR PASS artifact explicitly cannot disposition M15-01 closure',
    drRuntimeSource.includes("mission_disposition: 'SUBSET_ONLY_NOT_M15_01_CLOSURE'"));
  check('DR command and output logging uses the shared secret redactor',
    drRuntimeSource.includes('format-command') && drRuntimeSource.includes('redact-file')
      && drRuntimeSource.includes('OUTPUT_REDACTION_FAILED'));
  const redactionPos = drRuntimeSource.indexOf('redact_file "$output"');
  const containerLogsPos = drRuntimeSource.indexOf('compose_pg logs --no-color --timestamps --tail=100 pg-primary pg-standby');
  const containerLogsRedactionPos = drRuntimeSource.indexOf('redact_file "$container_logs_raw"', containerLogsPos);
  const containerLogsArtifactPos = drRuntimeSource.indexOf('cat "$container_logs_sanitized" >> "$COMMAND_LOG"', containerLogsRedactionPos);
  const containerLogsExcerptPos = drRuntimeSource.indexOf('tail -n 12 "$container_logs_sanitized"', containerLogsRedactionPos);
  const firstErrorPos = drRuntimeSource.indexOf('grep -Eim1', containerLogsExcerptPos);
  const diagnosticTailPos = drRuntimeSource.indexOf('tail -n 8 "$sanitized_output"', firstErrorPos);
  const diagnosticBoundPos = drRuntimeSource.indexOf('cut -c1-1800', diagnosticTailPos);
  const diagnosticPos = drRuntimeSource.indexOf('pg-ha-start sanitized failure excerpt');
  check('failed pg-ha-start records PostgreSQL container logs, then emits only bounded redacted diagnostics',
    redactionPos >= 0 && containerLogsPos > redactionPos && containerLogsRedactionPos > containerLogsPos
      && containerLogsArtifactPos > containerLogsRedactionPos && containerLogsExcerptPos > containerLogsRedactionPos
      && firstErrorPos > containerLogsExcerptPos && diagnosticTailPos > firstErrorPos
      && diagnosticBoundPos > diagnosticTailPos && diagnosticPos > diagnosticBoundPos
      && drRuntimeSource.includes('(^|[[:space:]])(E:|Err:)|error response from daemon|failed to solve')
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
  check('pgBackRest build exact-installs the current Debian candidate and verifies the installed package version',
    pgDockerfileSource.includes('apt-cache policy pgbackrest')
      && pgDockerfileSource.includes('"pgbackrest=$candidate"')
      && pgDockerfileSource.includes('"$installed" != "$candidate"')
      && pgDockerfileSource.includes('/usr/local/share/payesh-pgbackrest-package-version')
      && !pgDockerfileSource.includes('2.47-1'));
  check('DR records and re-verifies the actual pgBackRest Debian package version against the build record',
    drRuntimeSource.includes("dpkg-query -W '-f=${Version}' pgbackrest")
      && drRuntimeSource.includes('pgbackrest-build-recorded-package-version')
      && drRuntimeSource.includes('M15_DR_PGBACKREST_PACKAGE_VERSION')
      && drRuntimeSource.includes('pgbackrest_debian_package_version')
      && !drRuntimeSource.includes('pgbackrest package 2.47-1'));

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

  const unsetUserEnv = Object.assign({}, process.env, commonFailoverEnv, { PG_ISREADY_RESULT: '1' });
  delete unsetUserEnv.USER;
  const promoted = spawnSync('bash', [failoverScript], {
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, unsetUserEnv, {
      PATH: path.join(TEMP, 'bin-promote') + path.delimiter + bin + path.delimiter + process.env.PATH
    })
  });
  check('PostgreSQL failover check handles unset USER without nounset failure', (() => {
    const binPromote = path.join(TEMP, 'bin-promote');
    fs.mkdirSync(binPromote, { recursive: true });
    let promotedFlag = false;
    const stateFile = path.join(TEMP, 'pg-promoted-state');
    put(path.join(binPromote, 'psql'), `#!/bin/sh
query=''
for arg in "$@"; do query="$arg"; done
case "$query" in
  *"SELECT pg_is_in_recovery()"*)
    if [ -f "${stateFile}" ]; then echo f; else echo t; fi ;;
  *"pg_wal_lsn_diff"*) echo 0 ;;
  *"pg_promote"*) touch "${stateFile}"; echo t ;;
esac
exit 0
`);
    const envNoUser = Object.assign({}, unsetUserEnv, {
      PATH: binPromote + path.delimiter + bin + path.delimiter + process.env.PATH
    });
    const res = spawnSync('bash', [failoverScript], { cwd: ROOT, encoding: 'utf8', env: envNoUser });
    promotedFlag = res.status === 0 && /PROMOTE_OK:/.test(res.stdout);
    return promotedFlag;
  })());
  void promoted;

  check('Redis Sentinel failover splits comma-delimited master host,port after promotion', (() => {
    const binRedis = path.join(TEMP, 'bin-redis');
    fs.mkdirSync(binRedis, { recursive: true });
    const stateFile = path.join(TEMP, 'redis-failover-state');
    put(path.join(binRedis, 'redis-cli'), `#!/bin/sh
host=''
port=''
while [ $# -gt 0 ]; do
  case "$1" in
    -h) host="$2"; shift 2 ;;
    -p) port="$2"; shift 2 ;;
    *) break ;;
  esac
done
cmd="$1"
case "$cmd" in
  ping)
    if [ "$port" = "26379" ]; then echo PONG; exit 0; fi
    exit 1 ;;
  SENTINEL)
    sub="$2"
    if [ "$sub" = "get-master-addr-by-name" ]; then
      if [ -f "${stateFile}" ]; then printf '172.19.0.4\\n6379\\n'; else printf '172.19.0.2\\n6379\\n'; fi
      exit 0
    fi
    if [ "$sub" = "FAILOVER" ]; then touch "${stateFile}"; echo OK; exit 0; fi ;;
  INFO)
    if [ "$host" = "172.19.0.4" ] && [ "$port" = "6379" ]; then echo "role:master"; exit 0; fi
    echo "bad_target=$host:$port" >&2; exit 1 ;;
esac
exit 1
`);
    const res = spawnSync('bash', [path.join(ROOT, 'tools/failover-redis.sh')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: binRedis + path.delimiter + process.env.PATH,
        SENTINELS: '127.0.0.1:26379',
        MASTER_NAME: 'mymaster'
      })
    });
    return res.status === 0 && /NEW_MASTER=172\.19\.0\.4,6379/.test(res.stdout);
  })());

  const haComposeSource = fs.readFileSync(path.join(ROOT, 'infra/postgres/docker-compose.ha.yml'), 'utf8');
  const standbyEntrypointSource = fs.readFileSync(path.join(ROOT, 'infra/postgres/entrypoints/standby-entrypoint.sh'), 'utf8');
  const replicationInitSource = fs.readFileSync(path.join(ROOT, 'infra/postgres/init/01-replication.sh'), 'utf8');
  const pgBackRestTemplateSource = fs.readFileSync(path.join(ROOT, 'infra/postgres/pgbackrest.conf.template'), 'utf8');
  check('PostgreSQL HA primary avoids literal single quotes in shared_preload_libraries GUC and uses path-style S3 URI for MinIO',
    !haComposeSource.includes("shared_preload_libraries=''")
      && haComposeSource.includes('"shared_preload_libraries="')
      && pgBackRestTemplateSource.includes('repo1-s3-uri-style=path'));
  check('PostgreSQL standby entrypoint clears PGDATA contents without removing the volume mountpoint',
    !standbyEntrypointSource.includes('rm -rf "$PGDATA"')
      && standbyEntrypointSource.includes('find "$PGDATA" -mindepth 1 -delete')
      && replicationInitSource.includes('host replication replicator all scram-sha-256'));

  check('PostgreSQL init replication script avoids shell PID expansion and updates pg_hba.conf', (() => {
    const binInit = path.join(TEMP, 'bin-init');
    const fakePgData = path.join(TEMP, 'fake-pgdata');
    const sqlCapture = path.join(TEMP, 'replication-init.sql');
    fs.mkdirSync(binInit, { recursive: true });
    fs.mkdirSync(fakePgData, { recursive: true });
    fs.writeFileSync(path.join(fakePgData, 'pg_hba.conf'), 'host all all all scram-sha-256\n');
    put(path.join(binInit, 'psql'), `#!/bin/sh
cat > "${sqlCapture}"
exit 0
`);
    const res = spawnSync('bash', [path.join(ROOT, 'infra/postgres/init/01-replication.sh')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: binInit + path.delimiter + process.env.PATH,
        PGDATA: fakePgData,
        POSTGRES_USER: 'postgres',
        POSTGRES_DB: 'payesh',
        REPLICATION_PASSWORD: 'test-repl-password'
      })
    });
    const capturedSql = fs.readFileSync(sqlCapture, 'utf8');
    const hba = fs.readFileSync(path.join(fakePgData, 'pg_hba.conf'), 'utf8');
    return res.status === 0
      && !/\bDO\s+\d+\s+BEGIN\b/.test(capturedSql)
      && capturedSql.includes('CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD %L')
      && capturedSql.includes('CREATE ROLE pgbouncer WITH LOGIN PASSWORD %L')
      && hba.includes('host replication replicator all scram-sha-256');
  })());

  check('pgBackRest render-config prefixes plain HTTP scheme when TLS verification is disabled for bare internal endpoints', (() => {
    const httpOut = path.join(TEMP, 'pgbackrest-http.conf');
    const httpsOut = path.join(TEMP, 'pgbackrest-https.conf');
    const mockChownBin = path.join(TEMP, 'bin-render');
    fs.mkdirSync(mockChownBin, { recursive: true });
    put(path.join(mockChownBin, 'chown'), '#!/bin/sh\nexit 0\n');
    const rHttp = spawnSync('bash', [path.join(ROOT, 'infra/postgres/entrypoints/render-config.sh')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: mockChownBin + path.delimiter + process.env.PATH,
        PGHA_CONF_TEMPLATE: path.join(ROOT, 'infra/postgres/pgbackrest.conf.template'),
        PGHA_CONF_TARGET: httpOut,
        PB_REPO_S3_ENDPOINT: 'minio:9000',
        PB_REPO_S3_VERIFY_TLS: 'n'
      })
    });
    const rHttps = spawnSync('bash', [path.join(ROOT, 'infra/postgres/entrypoints/render-config.sh')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: mockChownBin + path.delimiter + process.env.PATH,
        PGHA_CONF_TEMPLATE: path.join(ROOT, 'infra/postgres/pgbackrest.conf.template'),
        PGHA_CONF_TARGET: httpsOut,
        PB_REPO_S3_ENDPOINT: 's3.eu-central-1.amazonaws.com',
        PB_REPO_S3_VERIFY_TLS: 'y'
      })
    });
    return rHttp.status === 0 && rHttps.status === 0
      && fs.readFileSync(httpOut, 'utf8').includes('repo1-s3-endpoint=http://minio:9000')
      && fs.readFileSync(httpsOut, 'utf8').includes('repo1-s3-endpoint=s3.eu-central-1.amazonaws.com');
  })());

  console.log(`M15-01 DR runtime unit tests: ${passed} passed, 0 failed`);
} catch (error) {
  console.error('M15-01 DR runtime unit tests: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(TEMP, { recursive: true, force: true });
}
