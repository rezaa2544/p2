#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const evidence = require('../tools/m15-01-runtime-evidence');
const logRedactor = require('../tools/m15-01-log-redactor');
const ciSummary = require('../tools/m15-01-ci-summary');
const ciSeed = require('../tools/m15-01-ci-seed');
const relationalSeed = require('../tools/seed-relational-small');
const receiver = require('../tools/m15-01-alert-receiver');
const migrationLedger = require('../tools/migrate-ledger');
const { resolveActorProvince } = require('../server/infrastructure/phase6-production-hardening');

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log('PASS ' + name);
}
function throwsCode(fn, code) {
  assert.throws(fn, new RegExp(code));
}

try {
  test('Prometheus exposition parser preserves exact route labels and values', () => {
    const text = [
      '# HELP payesh_http_requests_total Requests',
      'payesh_http_requests_total{route="/api/v1/pull",method="GET",code="200"} 17',
      'payesh_build_info{version="1.0",phase="1"} 1'
    ].join('\n');
    const rows = evidence.parseMetricText(text);
    assert.strictEqual(evidence.metricValue(rows, 'payesh_http_requests_total', {
      route: '/api/v1/pull', method: 'GET', code: '200'
    }), 17);
    assert.strictEqual(evidence.metricValue(rows, 'payesh_build_info', { phase: '1' }), 1);
  });

  test('runtime and DR command/output logs redact environment secrets and URL credentials', () => {
    const secrets = {
      POSTGRES_PASSWORD: 'pg-random-password-value-123456',
      PG_ADMIN_URL: 'postgres://payesh:pg-random-password-value-123456@127.0.0.1:5432/payesh_ci',
      PAYESH_METRICS_TOKEN: 'metrics-token-value-1234567890',
      PG_PASSWORD: 'dr-postgres-password-value-123456',
      GITHUB_TOKEN: 'github-token-value-1234567890',
      AWS_ACCESS_KEY_ID: 'synthetic-access-key-id-value',
      SESSION_COOKIE: 'synthetic-session-cookie-value'
    };
    const command = logRedactor.formatCommand([
      'docker', 'run', '--env', 'POSTGRES_PASSWORD=' + secrets.POSTGRES_PASSWORD,
      'env', 'PG_ADMIN_URL=' + secrets.PG_ADMIN_URL,
      '--env=PAYESH_METRICS_TOKEN=' + secrets.PAYESH_METRICS_TOKEN
    ], secrets);
    const output = logRedactor.redactText([
      'POSTGRES_PASSWORD=' + secrets.POSTGRES_PASSWORD,
      'PG_ADMIN_URL=' + secrets.PG_ADMIN_URL,
      'connecting to postgres://other:other-unlisted-password@127.0.0.1:5432/db',
      'PG_PASSWORD=' + secrets.PG_PASSWORD,
      'PAYESH_METRICS_TOKEN=' + secrets.PAYESH_METRICS_TOKEN,
      'GITHUB_TOKEN=' + secrets.GITHUB_TOKEN,
      'AWS_ACCESS_KEY_ID=' + secrets.AWS_ACCESS_KEY_ID,
      'SESSION_COOKIE=' + secrets.SESSION_COOKIE
    ].join('\n'), secrets);
    for (const value of Object.values(secrets)) {
      assert.strictEqual(command.includes(value), false);
      assert.strictEqual(output.includes(value), false);
    }
    assert.match(command, /docker run/);
    assert.match(command, /POSTGRES_PASSWORD=.*REDACTED/);
    assert.match(output, /PG_ADMIN_URL=\[REDACTED\]/);
    assert.match(output, /AWS_ACCESS_KEY_ID=\[REDACTED\]/);
    assert.match(output, /SESSION_COOKIE=\[REDACTED\]/);
    assert.match(output, /postgres:\/\/\[REDACTED\]/);
    const unlisted = logRedactor.redactText([
      'AWS_ACCESS_KEY_ID=unlisted-access-key-value',
      'AUTHORIZATION: Bearer unlisted-bearer-token-value',
      'SESSION_COOKIE="unlisted cookie value"'
    ].join('\n'), {});
    assert.doesNotMatch(unlisted, /unlisted-(?:access-key|bearer-token)|unlisted cookie value/);
    assert.match(unlisted, /AUTHORIZATION: \[REDACTED\]/);
    const unlistedCommand = logRedactor.formatCommand([
      'docker', 'run', '-e', 'AWS_ACCESS_KEY_ID=unlisted-access-key-value',
      '--header', 'Authorization: Bearer unlisted-bearer-token-value'
    ], {});
    assert.doesNotMatch(unlistedCommand, /unlisted-(?:access-key|bearer-token)/);
    assert.match(unlistedCommand, /AWS_ACCESS_KEY_ID=.*REDACTED/);
    assert.match(unlistedCommand, /Authorization: \[REDACTED\]/);
    const structured = logRedactor.redactText(
      '{"demo_code":"synthetic-one-time-code","user":{"id":9001,"full_name":"Synthetic Person","phone":"09991234567","national_id":"M15E300001"},"status":401}',
      {}
    );
    for (const value of ['synthetic-one-time-code', 'Synthetic Person', '09991234567', 'M15E300001']) {
      assert.strictEqual(structured.includes(value), false);
    }
    assert.match(structured, /"user":"\[REDACTED\]"/);
    assert.match(structured, /"status":401/);
    assert.strictEqual(logRedactor.isSensitiveKey('demo_code'), true);
    assert.strictEqual(logRedactor.isSensitiveKey('phone'), true);
    assert.strictEqual(logRedactor.isSensitiveKey('MINIO_ROOT_USER'), true);
    assert.strictEqual(logRedactor.isSensitiveKey('accessToken'), true);
    assert.strictEqual(logRedactor.isSensitiveKey('set-cookie'), true);
    assert.strictEqual(logRedactor.isSensitiveKey('code'), false, 'ordinary HTTP status codes must remain useful');
    const postgresDiagnostic = logRedactor.redactText('DETAIL: Key (phone)=(09999000001) already exists.', {});
    assert.doesNotMatch(postgresDiagnostic, /09999000001/);
    assert.match(postgresDiagnostic, /Key \(phone\)=\[REDACTED\]/);
    const genericConstraintDiagnostic = logRedactor.redactText('DETAIL: Key (id)=(12345) already exists.', {});
    assert.doesNotMatch(genericConstraintDiagnostic, /12345/);
    assert.match(genericConstraintDiagnostic, /Key \(id\)=\[REDACTED\]/);
  });

  test('CI evidence summaries expose only allowlisted status and failed-stage metadata', () => {
    const dir = path.join(os.tmpdir(), 'm15-ci-summary-' + crypto.randomUUID());
    const secret = 'synthetic-summary-secret-value';
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(path.join(dir, 'runtime-evidence.json'), JSON.stringify({
        status: 'FAIL', source_sha: 'a'.repeat(40), exit_code: 1,
        failure: { code: 'runtime_fixture_failed', message: secret, dsn: 'postgres://user:' + secret + '@127.0.0.1/db' }
      }));
      fs.writeFileSync(path.join(dir, 'infrastructure-cleanup.json'), JSON.stringify({ status: 'PASS' }));
      fs.writeFileSync(path.join(dir, 'commands.log'), [
        'COMMAND[start-postgres]: docker run POSTGRES_PASSWORD=' + secret,
        'EXIT_CODE[start-postgres]: 0',
        'EXIT_CODE[isolated-e3-runtime-evidence]: 1'
      ].join('\n'));
      const runtime = ciSummary.createSummary('runtime', dir);
      assert.match(runtime, /Source SHA: `a{40}`/);
      assert.match(runtime, /First failed command stage: `isolated-e3-runtime-evidence` \(exit 1\)/);
      assert.match(runtime, /Failure code: `runtime_fixture_failed`/);
      assert.match(runtime, /Cleanup report: \*\*PASS\*\*/);
      assert.strictEqual(runtime.includes(secret), false);
      assert.strictEqual(runtime.includes('postgres://'), false);

      fs.writeFileSync(path.join(dir, 'dr-runtime-evidence.json'), JSON.stringify({
        status: 'FAIL', source_sha: 'b'.repeat(40), exit_code: 1,
        postgres: { pitr: { before_marker_restored: 'NOT_RUN', after_marker_excluded: 'NOT_RUN' },
          failover: { promoted_standby_writable_after_promotion: 'NOT_RUN' } },
        redis_sentinel: { post_promotion_write_verified: 'NOT_RUN' }, sensitive: secret
      }));
      fs.writeFileSync(path.join(dir, 'commands.log'), 'EXIT_CODE[pg-compose-start]: 1\n');
      const dr = ciSummary.createSummary('dr', dir);
      assert.match(dr, /First failed command stage: `pg-compose-start` \(exit 1\)/);
      assert.match(dr, /not independent review, production readiness, or E4 evidence/);
      assert.strictEqual(dr.includes(secret), false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('runtime evidence failure messages redact PostgreSQL constraint PII and credentials', () => {
    const raw = 'Key (phone)=(09999000001), national_id=1234567890; postgres://dbuser:synthetic-db-password@127.0.0.1:5432/payesh; Authorization: Bearer synthetic-bearer-token';
    const safe = evidence.redactError(raw, {
      PG_ADMIN_URL: 'postgres://dbuser:synthetic-db-password@127.0.0.1:5432/payesh',
      PAYESH_METRICS_TOKEN: 'synthetic-bearer-token'
    });
    for (const value of ['09999000001', '1234567890', 'synthetic-db-password', 'synthetic-bearer-token']) {
      assert.strictEqual(safe.includes(value), false);
    }
    assert.match(safe, /REDACTED/);
    const unsafeCode = evidence.redactErrorCode('09999000001; postgres://dbuser:synthetic-db-password@127.0.0.1:5432/payesh', {
      PG_ADMIN_URL: 'postgres://dbuser:synthetic-db-password@127.0.0.1:5432/payesh'
    });
    assert.doesNotMatch(unsafeCode, /09999000001|synthetic-db-password/);
    assert.doesNotMatch(unsafeCode, /[^A-Za-z0-9_.-]/);
  });

  test('database manager principal school must exist in the exact runtime JSON store', () => {
    const seedPath = path.join(os.tmpdir(), 'm15-runtime-store-' + crypto.randomUUID() + '.json');
    try {
      fs.writeFileSync(seedPath, JSON.stringify({ schools: [{ id: 1 }, { id: 2 }] }));
      assert.deepStrictEqual(evidence.assertManagerPrincipalSchoolInSeed({ role: 'manager', school_id: '1' }, seedPath), {
        role: 'manager', school_id: 1, runtime_store_school_found: true
      });
      throwsCode(() => evidence.assertManagerPrincipalSchoolInSeed({ role: 'manager', school_id: 3 }, seedPath), 'seeded_manager_school_missing_from_runtime_store');
      throwsCode(() => evidence.assertManagerPrincipalSchoolInSeed({ role: 'student', school_id: 1 }, seedPath), 'seeded_manager_principal_scope_invalid');
    } finally { fs.rmSync(seedPath, { force: true }); }
  });

  test('attendance route requires the fixture month, tenant scope, and nonempty live rows', () => {
    const principal = { role: 'manager', school_id: 1 };
    const month = evidence.jalaliMonthForIsoDate('2026-10-19');
    assert.deepStrictEqual(month, { year: 1405, month: 7 });
    const body = { jy: 1405, jm: 7, schools: [{ school_id: 1, students: 5, totals: { total: 25 } }] };
    assert.deepStrictEqual(evidence.assertAttendanceReportMatchesPrincipal(200, body, principal, month), {
      school_id: 1, attendance_rows: 25, students: 5
    });
    throwsCode(() => evidence.assertAttendanceReportMatchesPrincipal(200, Object.assign({}, body, { jm: 8 }), principal, month), 'attendance_report_fixture_month_mismatch');
    throwsCode(() => evidence.assertAttendanceReportMatchesPrincipal(200, { ...body, schools: [{ ...body.schools[0], school_id: 2 }] }, principal, month), 'attendance_report_manager_tenant_scope_mismatch');
    throwsCode(() => evidence.assertAttendanceReportMatchesPrincipal(200, { ...body, schools: [{ ...body.schools[0], totals: { total: 0 } }] }, principal, month), 'attendance_report_fixture_rows_missing');
    throwsCode(() => evidence.assertAttendanceReportMatchesPrincipal(403, body, principal, month), 'attendance_report_fixture_scope_http_or_shape_invalid');
    throwsCode(() => evidence.jalaliMonthForIsoDate('2026-02-30'), 'fixture_attendance_date_invalid');
  });

  test('route counter gate excludes warmups and rejects counter drift', () => {
    assert.strictEqual(evidence.counterDeltaMatches(20, 25, 5), true);
    assert.strictEqual(evidence.counterDeltaMatches(20, 28, 5), false);
    assert.strictEqual(evidence.counterDeltaMatches(20, null, 5), false);
  });

  test('DSN path allowlist rejects unrelated and encoded database names', () => {
    const localDb = (name) => 'postgres://payesh:pw@127.0.0.1:5432/' + name;
    assert.strictEqual(evidence.assertLocalDsn(localDb('payesh_m15_evidence'), 'postgres', 'postgres:', 5432,
      /^payesh_m15_[a-z0-9_]{1,40}$/).pathname, '/payesh_m15_evidence');
    throwsCode(() => evidence.assertLocalDsn(localDb('payesh_evidence'), 'postgres', 'postgres:', 5432,
      /^payesh_m15_[a-z0-9_]{1,40}$/), 'postgres_dsn_not_isolated_loopback');
    throwsCode(() => evidence.assertLocalDsn(localDb('payesh_m15_test%2Fpublic'), 'postgres', 'postgres:', 5432,
      /^payesh_m15_[a-z0-9_]{1,40}$/), 'postgres_dsn_not_isolated_loopback');
    throwsCode(() => evidence.assertLocalDsn(localDb('payesh_m15_test%ZZ'), 'postgres', 'postgres:', 5432,
      /^payesh_m15_[a-z0-9_]{1,40}$/), 'postgres_dsn_path_invalid');
    throwsCode(() => evidence.assertLocalDsn('redis://127.0.0.1:6379/1', 'redis', 'redis:', 6379, /^0$/),
      'redis_dsn_not_isolated_loopback');
  });

  test('container resource contract requires separate CPU, memory, PID, and network limits', () => {
    const expected = { nano_cpus: 500000000, memory_bytes: 536870912, pids_limit: 64, network_mode: 'host' };
    assert.strictEqual(evidence.resourceLimitsMatch({
      nano_cpus: 500000000, memory_bytes: 536870912, pids_limit: 64, network_mode: 'host'
    }, expected), true);
    assert.strictEqual(evidence.resourceLimitsMatch({
      nano_cpus: 1000000000, memory_bytes: 536870912, pids_limit: 64, network_mode: 'host'
    }, expected), false);
    assert.strictEqual(evidence.resourceLimitsMatch({
      nano_cpus: 500000000, memory_bytes: 536870912, pids_limit: 0, network_mode: 'host'
    }, expected), false);
  });

  test('Redis resource limits are exact and verified as part of the failure-injection target', () => {
    assert.deepStrictEqual(evidence.REDIS_RESOURCE_LIMIT, {
      nano_cpus: 250000000, memory_bytes: 268435456, pids_limit: 128
    });
    const runtimeShell = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-ci-runtime.sh'), 'utf8');
    assert.match(runtimeShell, /start-ephemeral-redis docker run --detach --name "\$REDIS_CONTAINER" --label "\$M15_RUN_LABEL_KEY=\$RUN_INSTANCE"/);
    assert.match(runtimeShell, /--cpus=0\.25 --memory=256m --pids-limit=128/);
  });

  test('CI setup keeps database credentials out of argv/artifacts and redacts temporary command output', () => {
    const runtimeShell = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-ci-runtime.sh'), 'utf8');
    assert.match(runtimeShell, /--env-file "\$POSTGRES_ENV"/);
    assert.match(runtimeShell, /chmod 600 "\$POSTGRES_ENV"/);
    assert.match(runtimeShell, /format_command "\$@"/);
    assert.match(runtimeShell, /redact_file "\$output"/);
    assert.match(runtimeShell, /rm -f "\$output"/);
    assert.match(runtimeShell, /remove-transient-.*basename "\$transient_file"/);
    assert.match(runtimeShell, /remove-isolated-runtime-image docker image rm "\$API_IMAGE"/);
    assert.match(runtimeShell, /M15_PROMETHEUS_FILE_GID=\$PROMETHEUS_FILE_GID/);
    assert.match(runtimeShell, /if \[\[ "\$owner" == "\$RUN_INSTANCE" \]\]; then/);
    assert.match(runtimeShell, /if \[\[ "\$DB_CONTAINER_CREATED" == 1 \]\]; then remove_container_if_present "\$DB_CONTAINER"; fi/);
    assert.match(runtimeShell, /if \[\[ "\$REDIS_CONTAINER_CREATED" == 1 \]\]; then remove_container_if_present "\$REDIS_CONTAINER"; fi/);
    assert.match(runtimeShell, /if \[\[ "\$API_IMAGE_CREATED" == 1 \]\]/);
    assert.match(runtimeShell, /Refusing to reuse a pre-existing PostgreSQL container name/);
    assert(runtimeShell.includes('assert_compose_project_unused "$COMPOSE_PROJECT"'));
    assert(runtimeShell.includes('docker ps --all --quiet --filter "label=com.docker.compose.project=${project}"'));
    assert(runtimeShell.includes('docker volume ls --quiet --filter "label=com.docker.compose.project=${project}"'));
    assert(runtimeShell.includes('docker network ls --quiet --filter "label=com.docker.compose.project=${project}"'));
    assert(runtimeShell.includes('OBSERVABILITY_PROJECT_CLAIMED=1'));
    assert(runtimeShell.includes('if [[ "$OBSERVABILITY_PROJECT_CLAIMED" == 1 && -f "$COMPOSE_ENV" ]]'));
    assert.doesNotMatch(runtimeShell, /remove_container_if_present m15-redis\b/);
    assert(runtimeShell.includes('docker-compose.m15-ci.yml'));
    const prometheusCiOverride = fs.readFileSync(path.join(__dirname, '..', 'infra', 'observability', 'docker-compose.m15-ci.yml'), 'utf8');
    assert.match(prometheusCiOverride, /group_add:[\s\S]*M15_PROMETHEUS_FILE_GID/);
    assert.match(prometheusCiOverride, /io\.payesh\.m15-01\.run: "\$\{M15_RUN_INSTANCE/);
    assert.doesNotMatch(runtimeShell, /POSTGRES_PASSWORD=payesh|postgres:\/\/payesh:payesh@/);
    assert.doesNotMatch(runtimeShell, /PG_ADMIN_URL="\$PG_ADMIN_URL"/);
  });

  test('runtime image is non-root and Docker context excludes credentials and unrelated local data', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-runtime.Dockerfile'), 'utf8');
    const dockerignore = fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf8').split(/\r?\n/);
    assert.match(dockerfile, /ARG M15_RUN_INSTANCE[\s\S]*LABEL io\.payesh\.m15-01\.run=/);
    assert.match(dockerfile, /COPY --chown=node:node server\/ \.\/server\//);
    assert.match(dockerfile, /COPY --chown=node:node authz\/write-perms\.json/);
    assert.match(dockerfile, /COPY --chown=node:node tools\/m15-01-route-load\.js/);
    assert.doesNotMatch(dockerfile, /COPY --chown=node:node \. \./, 'the image build must not copy the full repository');
    assert.match(dockerfile, /mkdir -p \/run\/m15 \/app\/server\/data \/app\/tools/);
    assert.match(dockerfile, /^USER node$/m);
    const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-runtime-evidence.js'), 'utf8');
    assert(runtimeSource.includes("info.user !== 'node'"));
    assert(runtimeSource.includes("info.user !== uid + ':' + gid"));
    assert.strictEqual(dockerignore.includes('**'), true, 'Docker context must be denied by default');
    for (const pattern of [
      '.env', '.env.*', '.env*', '**/.env', '**/.env.*', '**/.env*',
      '.npmrc', '*.log', '*.pem', '*.key', '*.crt', '*.cer', '*.p12', '*.pfx', '*.jks', '*.keystore',
      'data/backups/', 'data/national/', 'reference/', 'tmp/', '.idea/', '.vscode/', '.claude/',
      'skill-observations/', 'tests/chaos-output/', 'docs/_export/', 'tools/ft/base-model/',
      '.github/', 'docs/', 'infra/', 'migrations/', 'tools/*', '!tools/m15-01-route-load.js',
      'server/data/', 'server/data/*',
      '!package.json', '!package-lock.json', '!index.html', '!USER_GUIDE.html',
      '!account-deletion.html', '!privacy.html', '!server/', '!server/**',
      '!authz/', '!authz/write-perms.json', '!tools/'
    ]) {
      assert.strictEqual(dockerignore.includes(pattern), true, 'missing .dockerignore rule ' + pattern);
    }
    assert.doesNotMatch(dockerignore.join('\n'), /!server\/data\/payesh\.json/,
      'the Docker context must not re-include an ignored local JSON store');
  });

  test('EXPLAIN fixture inserts only marker-tagged synthetic phone values in reserved 0999 format', () => {
    const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-runtime-evidence.js'), 'utf8');
    assert.match(runtimeSource, /\$3 \|\| lpad\(\(9000000 \+ n\)::text, 7, '0'\)/);
    assert.match(runtimeSource, /\[school\.rows\[0\]\.id, planRun, '0999'\]/);
    assert.doesNotMatch(runtimeSource, /'09' \|\| lpad\(n::text, 10, '0'\)/);
  });

  test('CI relational seeder accepts only profile-specific local disposable databases', () => {
    assert.strictEqual(ciSeed.validateSeedTarget(
      'postgres://payesh:pw@127.0.0.1:5432/payesh_m15_a_evidence', 'runtime').database, 'payesh_m15_a_evidence');
    assert.strictEqual(ciSeed.validateSeedTarget(
      'postgres://postgres:pw@localhost:5432/payesh', 'dr').database, 'payesh');
    throwsCode(() => ciSeed.validateSeedTarget(
      'postgres://payesh:pw@db.example:5432/payesh_m15_a_evidence', 'runtime'), 'm15_seed_target_not_isolated_loopback');
    throwsCode(() => ciSeed.validateSeedTarget(
      'postgres://payesh:pw@127.0.0.1:5432/payesh', 'runtime'), 'm15_seed_target_not_isolated_loopback');
    throwsCode(() => ciSeed.validateSeedTarget(
      'postgres://postgres:pw@127.0.0.1:5432/payesh_m15_dr', 'dr'), 'm15_seed_target_not_isolated_loopback');
    throwsCode(() => ciSeed.validateSeedTarget(
      'postgres://payesh:pw@127.0.0.1:5432/payesh_m15_a%2Fevil', 'runtime'), 'm15_seed_target_not_isolated_loopback');
    throwsCode(() => ciSeed.validateSeedTarget(
      'postgres://payesh:pw@127.0.0.1:5432/payesh_m15_a_evidence?sslmode=require', 'runtime'), 'm15_seed_target_not_isolated_loopback');
  });

  test('CI fixture seeder requires every migration version, name, and checksum to match', () => {
    const catalog = [
      { version: '001', name: '001_initial.sql', checksum: 'aa' },
      { version: '002', name: '002_reports.sql', checksum: 'bb' }
    ];
    assert.strictEqual(ciSeed.migrationCatalogMatches(catalog, catalog), true);
    assert.strictEqual(ciSeed.migrationCatalogMatches(catalog.slice(0, 1), catalog), false);
    assert.strictEqual(ciSeed.migrationCatalogMatches(catalog.concat(catalog[1]), catalog), false);
    assert.strictEqual(ciSeed.migrationCatalogMatches([
      catalog[0], { ...catalog[1], name: '002_changed.sql' }
    ], catalog), false);
    assert.strictEqual(ciSeed.migrationCatalogMatches([
      catalog[0], { ...catalog[1], checksum: 'changed' }
    ], catalog), false);
  });

  test('CI fixture seeder validates recent ISO fixture dates and relational counts', () => {
    const valid = { enrollments: 20, attendance: 50, grades: 30,
      attendanceDates: ['2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15'] };
    assert.strictEqual(ciSeed.validateFixtureGeneratedCounts(valid), true);
    assert.throws(() => ciSeed.validateFixtureGeneratedCounts({ ...valid, attendanceDates: ['not-a-date'] }),
      /m15_seed_fixture_generated_count_mismatch/);
    assert.throws(() => ciSeed.validateFixtureGeneratedCounts({ ...valid, attendance: 49 }),
      /m15_seed_fixture_generated_count_mismatch/);
  });

  test('CI fixture summary verifies two managers belong to the two seeded tenants', () => {
    const userIds = [
      { role: 'superadmin', school_id: 1 },
      { role: 'manager', school_id: 1 }, { role: 'manager', school_id: 2 },
      { role: 'teacher', school_id: 1 }, { role: 'teacher', school_id: 2 },
      ...Array.from({ length: 10 }, (_, i) => ({ role: 'student', school_id: i < 5 ? 1 : 2 }))
    ];
    assert.deepStrictEqual(ciSeed.summarizeFixtureResult({ schoolIds: [1, 2], userIds }), {
      tenantCount: 2, managerCount: 2
    });
    const missingManager = userIds.map((u) => Object.assign({}, u));
    missingManager[1].role = 'teacher';
    throwsCode(() => ciSeed.summarizeFixtureResult({ schoolIds: [1, 2], userIds: missingManager }), 'm15_seed_manager_scope_invalid');
    const wrongScope = userIds.map((u) => Object.assign({}, u));
    wrongScope[2].school_id = 99;
    throwsCode(() => ciSeed.summarizeFixtureResult({ schoolIds: [1, 2], userIds: wrongScope }), 'm15_seed_manager_scope_invalid');
  });

  test('M15 fixture seeds canonical province scope and preserves fail-closed routing', () => {
    const plan = ciSeed.buildFixtureProvinceScopePlan([101, 202]);
    assert.deepStrictEqual(plan, [
      { school_id: 101, province_code: '07', province_name: 'M15 CI fixture province A' },
      { school_id: 202, province_code: '14', province_name: 'M15 CI fixture province B' }
    ]);
    const rows = [
      { school_id: 101, province_id: 701, province_code: '07', tenant_policy_present: true,
        tenant_policy_province: '07', tenant_policy_school: '*',
        tenant_policy_allowed_scope: { match: 'actor_province' }, tenant_policy_version: 1 },
      { school_id: 202, province_id: 702, province_code: '14', tenant_policy_present: true,
        tenant_policy_province: '14', tenant_policy_school: '*',
        tenant_policy_allowed_scope: { match: 'actor_province' }, tenant_policy_version: 1 }
    ];
    assert.deepStrictEqual(ciSeed.validateFixtureProvinceScopeRows(rows, [101, 202]), {
      province_count: 2, scoped_school_count: 2, tenant_policy_count: 2, tenant_policy_validated: true
    });
    assert.deepStrictEqual(evidence.assertManagerPrincipalProvinceScope(rows[0], {
      role: 'manager', school_id: 101
    }), { province_scope_resolved: true, tenant_policy_present: true, tenant_policy_valid: true });
    throwsCode(() => ciSeed.buildFixtureProvinceScopePlan([101]), 'm15_seed_province_scope_plan_invalid');
    throwsCode(() => ciSeed.buildFixtureProvinceScopePlan([101, 101]), 'm15_seed_province_scope_plan_invalid');
    throwsCode(() => ciSeed.validateFixtureProvinceScopeRows(rows.slice(0, 1), [101, 202]), 'm15_seed_province_scope_rows_invalid');
    throwsCode(() => ciSeed.validateFixtureProvinceScopeRows([
      rows[0], { ...rows[1], tenant_policy_present: false }
    ], [101, 202]), 'm15_seed_province_scope_rows_invalid');
    throwsCode(() => ciSeed.validateFixtureProvinceScopeRows([
      rows[0], { ...rows[1], tenant_policy_allowed_scope: { deny: true } }
    ], [101, 202]), 'm15_seed_province_scope_rows_invalid');
    throwsCode(() => ciSeed.validateFixtureProvinceScopeRows([
      rows[0], { ...rows[1], tenant_policy_allowed_scope: { match: 'actor_school' } }
    ], [101, 202]), 'm15_seed_province_scope_rows_invalid');
    throwsCode(() => evidence.assertManagerPrincipalProvinceScope({
      ...rows[0], tenant_policy_present: false
    }, { role: 'manager', school_id: 101 }), 'seeded_manager_province_scope_invalid');
    throwsCode(() => evidence.assertManagerPrincipalProvinceScope({
      ...rows[0], tenant_policy_allowed_scope: { deny: true }
    }, { role: 'manager', school_id: 101 }), 'seeded_manager_province_scope_invalid');
    throwsCode(() => evidence.assertManagerPrincipalProvinceScope({
      ...rows[0], province_code: '7'
    }, { role: 'manager', school_id: 101 }), 'seeded_manager_province_scope_invalid');

    const hydratedStore = {
      schools: [
        { id: 101, province_id: 701 },
        { id: 202, province_id: 702 }
      ],
      provinces: [
        { id: 701, code: '07' },
        { id: 702, code: '14' }
      ]
    };
    assert.strictEqual(resolveActorProvince({ id: 1001, role: 'manager', school_id: 101 }, hydratedStore), '07');
    assert.strictEqual(resolveActorProvince({ id: 1002, role: 'manager', school_id: 202 }, hydratedStore), '14');
    assert.strictEqual(resolveActorProvince({ id: 1001, role: 'manager', school_id: 101 }, {
      schools: [{ id: 101, province_id: null }], provinces: []
    }), null);
    const dbSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'db.js'), 'utf8');
    const schemaTablesStart = dbSource.indexOf('const SCHEMA_TABLES');
    const schemaTablesEnd = dbSource.indexOf('));', schemaTablesStart);
    assert(schemaTablesStart >= 0 && schemaTablesEnd > schemaTablesStart);
    assert.match(dbSource.slice(schemaTablesStart, schemaTablesEnd), /\bprovinces\b/,
      'PG hydration must include provinces so resolveActorProvince can map province_id to code');

    const indexSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    const apiV1Start = indexSource.indexOf("if(p.indexOf('/api/v1/') === 0){");
    const missingProvinceGuard = indexSource.indexOf('if (!effProv)', apiV1Start);
    const unknownRouteFallback = indexSource.indexOf(
      "return sendJson(res, 404, { ok: false, code: 'not_found' });", missingProvinceGuard);
    const failClosedResponse = indexSource.indexOf(
      'return sendJson(res, err.status === 503 ? 503 : 403', missingProvinceGuard);
    assert(apiV1Start >= 0 && missingProvinceGuard > apiV1Start);
    assert(failClosedResponse > missingProvinceGuard && failClosedResponse < unknownRouteFallback);
    assert(unknownRouteFallback > failClosedResponse,
      'unknown route stays behind the tenant guard; fixture scope must be repaired, not bypassed');
  });

  test('M15 province seeding links both tenants and rejects missing authority policy', () => {
    const script = String.raw`
      const assert = require('assert');
      const ciSeed = require('./tools/m15-01-ci-seed');
      const evidence = require('./tools/m15-01-runtime-evidence');
      function fakeClient(options = {}) {
        const calls = [];
        return {
          calls,
          async query(sql, values = []) {
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            calls.push({ sql: normalized, values });
            if (normalized.startsWith('SELECT count(*)::int AS count FROM provinces')) {
              return { rows: [{ count: Number(options.catalogCount || 0) }] };
            }
            if (normalized.startsWith('INSERT INTO provinces')) {
              const code = String(values[0]);
              return { rows: [{ id: code === '07' ? 701 : 702, code }], rowCount: 1 };
            }
            if (normalized.startsWith('UPDATE schools')) {
              return { rows: [{ id: values[1] }], rowCount: 1 };
            }
            if (normalized.includes('tenant_policy')) {
              return { rows: [
                { school_id: 101, province_id: 701, province_code: '07',
                  tenant_policy_present: options.policyPresent !== false, tenant_policy_province: '07',
                  tenant_policy_school: '*', tenant_policy_allowed_scope: options.policyScope || { match: 'actor_province' },
                  tenant_policy_version: 1 },
                { school_id: 202, province_id: 702, province_code: '14',
                  tenant_policy_present: options.policyPresent !== false, tenant_policy_province: '14',
                  tenant_policy_school: '*', tenant_policy_allowed_scope: options.policyScope || { match: 'actor_province' },
                  tenant_policy_version: 1 }
              ], rowCount: 2 };
            }
            throw new Error('unexpected_fixture_query');
          }
        };
      }
      (async () => {
        const client = fakeClient();
        const summary = await ciSeed.seedFixtureProvinceScopes(client, [101, 202]);
        assert.deepStrictEqual(summary, {
          province_count: 2, scoped_school_count: 2, tenant_policy_count: 2, tenant_policy_validated: true
        });
        assert.strictEqual(client.calls.filter((call) => call.sql.startsWith('INSERT INTO provinces')).length, 2);
        assert.strictEqual(client.calls.filter((call) => call.sql.startsWith('UPDATE schools')).length, 2);
        assert(client.calls.some((call) => call.sql.includes('LEFT JOIN LATERAL')));

        const scopeQueries = [];
        const pool = {
          async query(sql, values) {
            scopeQueries.push({ sql: String(sql), values });
            return { rows: [{
              school_id: 101, province_id: 701, province_code: '07', tenant_policy_present: true,
              tenant_policy_province: '07', tenant_policy_school: '*',
              tenant_policy_allowed_scope: { match: 'actor_province' }, tenant_policy_version: 1
            }] };
          }
        };
        assert.deepStrictEqual(await evidence.verifyManagerPrincipalProvinceScope(pool, {
          role: 'manager', school_id: 101
        }), { province_scope_resolved: true, tenant_policy_present: true, tenant_policy_valid: true });
        assert.deepStrictEqual(scopeQueries[0].values, [101]);
        assert.match(scopeQueries[0].sql, /LEFT JOIN provinces/);
        assert.match(scopeQueries[0].sql, /LEFT JOIN LATERAL/);
        assert.match(scopeQueries[0].sql, /tenant_policy/);
        await assert.rejects(() => evidence.verifyManagerPrincipalProvinceScope({
          query: async () => ({ rows: [] })
        }, { role: 'manager', school_id: 101 }), /seeded_manager_province_scope_invalid/);

        await assert.rejects(() => ciSeed.seedFixtureProvinceScopes(fakeClient({ catalogCount: 1 }), [101, 202]),
          /m15_seed_refusing_nonempty_province_catalog/);
        await assert.rejects(() => ciSeed.seedFixtureProvinceScopes(fakeClient({ policyPresent: false }), [101, 202]),
          /m15_seed_province_scope_rows_invalid/);
        await assert.rejects(() => ciSeed.seedFixtureProvinceScopes(fakeClient({ policyScope: { deny: true } }), [101, 202]),
          /m15_seed_province_scope_rows_invalid/);
      })().catch((error) => {
        console.error(error && error.message || error);
        process.exitCode = 1;
      });
    `;
    execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
  });

  test('relational fixture dates use valid recent ISO days across month boundaries', () => {
    const dates = relationalSeed.recentIsoDateDays(5, new Date('2026-10-01T00:30:00.000Z'));
    assert.deepStrictEqual(dates, ['2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28', '2026-09-27']);
    assert.strictEqual(new Set(dates).size, 5);
    assert.throws(() => relationalSeed.recentIsoDateDays(0, new Date('2026-10-01T00:30:00.000Z')), /invalid ISO fixture date window/);
  });

  test('cache timer, durable-watermark query, and boot replay exclusion are source-checked', () => {
    const index = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    const worker = fs.readFileSync(path.join(__dirname, '..', 'server', 'worker.js'), 'utf8');
    const outbox = fs.readFileSync(path.join(__dirname, '..', 'server', 'outbox.js'), 'utf8');
    assert.strictEqual(evidence.cacheWorkerTimerContractMatches(index, worker, outbox), true);
    assert.strictEqual(evidence.cacheWorkerTimerContractMatches(index, worker.replace('tickReplicate().catch', 'directTickReplicate().catch'), outbox), false);
    assert.strictEqual(evidence.cacheWorkerTimerContractMatches(index, worker, outbox.replace("type NOT LIKE 'cache.%'", "type LIKE 'cache.%'")), false);
    const runtimeSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-runtime-evidence.js'), 'utf8');
    assert.doesNotMatch(runtimeSource, /require\(['"]\.\.\/server\/index['"]\)/);
  });

  test('P11 migration chain routes transaction-control migration 012 through psql', () => {
    const p11 = fs.readFileSync(path.join(__dirname, '..', 'tests', 'p11-phone-auth-live.js'), 'utf8');
    const migration012 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '012_partition_grades_attendance.sql'), 'utf8');
    assert.strictEqual(migrationLedger.hasInternalTransactionControl(migration012), true);
    assert.strictEqual(migrationLedger.hasInternalTransactionControl('SELECT 1;'), false);
    assert.match(p11, /hasInternalTransactionControl\(sql\)/);
    assert.match(p11, /execFileSync\('psql'/);
  });

  test('queue-retention JSONB marker parameters have explicit PostgreSQL types', () => {
    const runtime = fs.readFileSync(path.join(__dirname, '..', 'tools', 'm15-01-runtime-evidence.js'), 'utf8');
    assert.match(runtime, /jsonb_build_object\('origin', \$1::text\)/);
    assert.match(runtime, /jsonb_build_object\('origin', \$2::text\)/);
  });

  test('phone-auth EXPLAIN contract matches auth SQL and P11 bind precedent', () => {
    const auth = fs.readFileSync(path.join(__dirname, '..', 'server', 'auth.js'), 'utf8');
    const p11 = fs.readFileSync(path.join(__dirname, '..', 'tests', 'p11-phone-auth-live.js'), 'utf8');
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(auth, p11), true);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(auth, p11,
      evidence.PHONE_AUTH_SQL.replace('ORDER BY id', 'ORDER BY phone'), evidence.PHONE_AUTH_ARGS_PATTERN), false);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(auth, p11,
      evidence.PHONE_AUTH_SQL, evidence.PHONE_AUTH_ARGS_PATTERN + 'x'), false);
    const start = auth.indexOf('async function userByPhone(phone)');
    const end = auth.indexOf('/* ── endpoints', start);
    const mutateAuthQuery = (mutation) => auth.slice(0, start) + mutation(auth.slice(start, end)) + auth.slice(end);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(
      mutateAuthQuery((block) => block.replace('phone, $2', "phone, 'literal'")), p11), false);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(
      mutateAuthQuery((block) => block.replace('national_id, active', 'national_id, deleted')), p11), false);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(
      mutateAuthQuery((block) => block.replace("'ORDER BY id LIMIT 1'", "'ORDER BY phone LIMIT 1'")), p11), false);
    assert.strictEqual(evidence.phoneAuthQueryContractMatches(auth, p11.replace('const AUTH_ARGS', 'const AUTH_ARGZ')), false);
  });

  test('private-network guard allows local and Docker-bridge peers but rejects public peers', () => {
    assert.strictEqual(receiver.isPrivateOrLoopback('127.0.0.1'), true);
    assert.strictEqual(receiver.isPrivateOrLoopback('::ffff:127.0.0.1'), true);
    assert.strictEqual(receiver.isPrivateOrLoopback('172.18.0.1'), true);
    assert.strictEqual(receiver.isPrivateOrLoopback('10.0.2.2'), true);
    assert.strictEqual(receiver.isPrivateOrLoopback('169.254.169.254'), false, 'cloud metadata link-local must not reach the test sink');
    assert.strictEqual(receiver.isPrivateOrLoopback('::ffff:169.254.169.254'), false, 'IPv4-mapped cloud metadata link-local must also be rejected');
    assert.strictEqual(receiver.isPrivateOrLoopback('8.8.8.8'), false);
    assert.strictEqual(receiver.isPrivateOrLoopback('not-an-ip'), false);
  });

  test('Alertmanager receiver normalizes payload and omits annotations/unapproved labels', () => {
    const normalized = receiver.normalizeEvent({
      receiver: 'payesh-webhook',
      status: 'firing',
      groupKey: 'private-test-group-key-must-not-be-stored',
      alerts: [{
        status: 'firing',
        labels: { alertname: 'RedisDown', severity: 'critical', service: 'payesh', phone: 'do-not-store' },
        annotations: { summary: 'private annotation must not be stored' },
        startsAt: '2026-10-19T00:00:00Z'
      }]
    });
    const serialized = JSON.stringify(normalized);
    assert.strictEqual(normalized.receiver, 'payesh-webhook');
    assert.strictEqual(normalized.alerts[0].alertname, 'RedisDown');
    assert.strictEqual(serialized.includes('do-not-store'), false);
    assert.strictEqual(serialized.includes('private annotation'), false);
    assert.strictEqual(serialized.includes('annotations'), false);
    assert.strictEqual(serialized.includes('group_key'), false);
    assert.strictEqual(serialized.includes('private-test-group-key'), false);
  });

  test('Alertmanager receiver refuses non-CI invocation', () => {
    const originalActions = process.env.GITHUB_ACTIONS;
    const originalGuard = process.env.M15_RUNTIME_ALLOW_CI;
    try {
      process.env.GITHUB_ACTIONS = 'false';
      process.env.M15_RUNTIME_ALLOW_CI = '0';
      assert.throws(() => receiver.start({ eventsFile: '/tmp/not-used.jsonl' }), /m15_alert_receiver_ci_only_guard_rejected/);
    } finally {
      if (originalActions == null) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = originalActions;
      if (originalGuard == null) delete process.env.M15_RUNTIME_ALLOW_CI;
      else process.env.M15_RUNTIME_ALLOW_CI = originalGuard;
    }
  });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-01-unit-'));
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenFile = path.join(temp, 'metrics.token');
    fs.writeFileSync(tokenFile, token, { mode: 0o640 });
    fs.chmodSync(tokenFile, 0o640);
    const seedFile = path.join(temp, 'payesh.json');
    fs.writeFileSync(seedFile, '{}');
    const jwtSecret = 'b'.repeat(64);
    const databaseUrl = 'postgres://payesh:payesh@127.0.0.1:5432/payesh_m15_evidence';
    const redisUrl = 'redis://127.0.0.1:6379/0';
    const instanceId = 'm15-e3-api-a-1234567890-1';
    const apiEnvFile = path.join(temp, 'api.env');
    fs.writeFileSync(apiEnvFile, [
      'TZ=UTC', 'NODE_ENV=test', 'PAYESH_ENV=test', 'PAYESH_DEV_OTP_BYPASS=1',
      'PAYESH_CACHE_DURABLE_INVALIDATION=on', 'PAYESH_METRICS_TOKEN=' + token,
      'PAYESH_JWT_SECRET=' + jwtSecret, 'DATABASE_URL=' + databaseUrl,
      'REDIS_URL=' + redisUrl, 'PAYESH_INSTANCE_ID=' + instanceId,
      'PAYESH_WORKER_INTERVAL_MS=3600000', 'HOST=0.0.0.0', 'PORT=3000'
    ].join('\n') + '\n', { mode: 0o600 });
    fs.chmodSync(apiEnvFile, 0o600);
    const sha = 'a'.repeat(40);
    const env = {
      GITHUB_ACTIONS: 'true',
      GITHUB_SHA: sha,
      M15_RUNTIME_ALLOW_CI: '1',
      NODE_ENV: 'test',
      PAYESH_ENV: 'test',
      PAYESH_DEV_OTP_BYPASS: '1',
      PAYESH_METRICS_TOKEN: token,
      M15_METRICS_TOKEN_FILE: tokenFile,
      M15_PROMETHEUS_FILE_GID: String(process.getgid()),
      RUNNER_TEMP: temp,
      M15_ARTIFACT_PATH: path.join(temp, 'evidence.json'),
      M15_ALERT_EVENTS_FILE: path.join(temp, 'alert-events.jsonl'),
      M15_ALERT_RECEIVER_URL: 'http://127.0.0.1:18080/health',
      GITHUB_RUN_ID: '1234567890',
      GITHUB_RUN_ATTEMPT: '1',
      M15_RUN_INSTANCE: 'a-1234567890-1',
      M15_REDIS_CONTAINER: 'm15-redis-a-1234567890-1',
      M15_DATABASE_CONTAINER: 'm15-postgres-a-1234567890-1',
      M15_EVIDENCE_RUN: 'a',
      M15_API_IMAGE: 'm15-01-runtime:a-1234567890-1',
      M15_API_ENV_FILE: apiEnvFile,
      M15_API_CONTAINER: 'm15-api-initial-a-1234567890-1',
      M15_API_RESTART_CONTAINER: 'm15-api-restart-a-1234567890-1',
      M15_API_REPLAY_CONTAINER: 'm15-api-replay-a-1234567890-1',
      M15_ROUTE_SPEC_FILE: path.join(temp, 'route-spec.json'),
      M15_ROUTE_RESULT_FILE: path.join(temp, 'route-result.json'),
      PAYESH_JWT_SECRET: jwtSecret,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      PAYESH_INSTANCE_ID: instanceId,
      PAYESH_WORKER_INTERVAL_MS: '3600000'
    };
    const options = { seedPath: seedFile, currentSha: sha, gitStatus: '' };

    test('isolated E3 environment validation accepts only the intended CI setup', () => {
      const cfg = evidence.validateEnvironment(env, options);
      assert.strictEqual(cfg.head, sha);
      assert.strictEqual(cfg.database_name, 'payesh_m15_evidence');
      assert.strictEqual(cfg.worker_interval_ms, 3600000);
      assert.strictEqual(cfg.api_image, 'm15-01-runtime:a-1234567890-1');
      assert.strictEqual(cfg.run_instance, 'a-1234567890-1');
      assert.strictEqual(cfg.database_container, 'm15-postgres-a-1234567890-1');
      assert.strictEqual(cfg.metrics_file_mode, '0640');
      assert.strictEqual(cfg.metrics_file_gid, process.getgid());
      assert.strictEqual(cfg.environment.scope.includes('not E4'), true);
      assert.strictEqual(cfg.environment.resource_isolation.includes('not separate physical machines'), true);
      assert.strictEqual(cfg.environment.source_tree_clean, true);
    });

    test('environment validation rejects production auth bypass', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { PAYESH_ENV: 'production' }), options), 'non_production_dev_otp_guard_rejected');
    });

    test('environment validation rejects external API and database targets', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_BASE_URL: 'http://example.com:3000' }), options), 'api_target_not_isolated_loopback');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { DATABASE_URL: 'postgres://payesh:pw@db.example.com:5432/payesh_m15_evidence' }), options), 'postgres_dsn_not_isolated_loopback');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { DATABASE_URL: 'postgres://payesh:pw@127.0.0.1:5432/payesh_evidence' }), options), 'postgres_dsn_not_isolated_loopback');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { DATABASE_URL: 'postgres://payesh:pw@127.0.0.1:5432/payesh_m15_test%2Fpublic' }), options), 'postgres_dsn_not_isolated_loopback');
    });

    test('environment validation rejects weak or mismatched token files', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { PAYESH_METRICS_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }), options), 'metrics_token_missing_or_weak');
      fs.chmodSync(tokenFile, 0o644);
      throwsCode(() => evidence.validateEnvironment(env, options), 'metrics_token_file_must_be_regular_mode_0640');
      fs.chmodSync(tokenFile, 0o640);
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, {
        M15_PROMETHEUS_FILE_GID: String(process.getgid() + 1)
      }), options), 'metrics_token_file_group_contract_invalid');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { PAYESH_METRICS_TOKEN: crypto.randomBytes(32).toString('hex') }), options), 'metrics_token_file_mismatch');
    });

    test('environment validation rejects wrong SHA, dirty source trees, non-isolated artifacts, and short worker intervals', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { GITHUB_SHA: 'b'.repeat(40) }), options), 'source_sha_mismatch');
      throwsCode(() => evidence.validateEnvironment(env, Object.assign({}, options, { gitStatus: ' M tools/m15-01-runtime-evidence.js' })), 'source_tree_not_clean');
      throwsCode(() => evidence.validateEnvironment(env, Object.assign({}, options, { gitStatus: '?? untracked-secret.txt' })), 'source_tree_not_clean');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_ARTIFACT_PATH: path.join(os.tmpdir(), 'outside.json') }), options), 'runtime_artifacts_must_be_distinct_files_under_runner_temp');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { PAYESH_WORKER_INTERVAL_MS: '1000' }), options), 'worker_interval_too_short_for_queue_evidence_window');
    });

    test('environment validation rejects names not uniquely scoped to this exact GitHub run', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_REDIS_CONTAINER: 'm15-redis' }), options),
        'redis_failure_injection_requires_run_owned_container');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_DATABASE_CONTAINER: 'm15-postgres' }), options),
        'database_resource_container_not_isolated');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_RUN_INSTANCE: 'a-1234567890-2' }), options),
        'run_instance_identity_mismatch');
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { GITHUB_RUN_ATTEMPT: 'not-numeric' }), options),
        'github_run_identity_invalid');
    });

    test('environment validation rejects public API images and unprotected API env files', () => {
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, { M15_API_IMAGE: 'node:22' }), options), 'api_and_load_generator_image_not_isolated');
      fs.chmodSync(apiEnvFile, 0o644);
      throwsCode(() => evidence.validateEnvironment(env, options), 'api_env_file_must_be_regular_mode_0600');
      fs.chmodSync(apiEnvFile, 0o600);
      throwsCode(() => evidence.validateEnvironment(Object.assign({}, env, {
        M15_ROUTE_RESULT_FILE: path.join(os.tmpdir(), 'outside-result.json')
      }), options), 'route_generator_files_must_be_distinct_and_under_runner_temp');
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log('M15-01 runtime evidence unit tests: ' + pass + ' passed, 0 failed');
} catch (error) {
  console.error('M15-01 runtime evidence unit tests: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
