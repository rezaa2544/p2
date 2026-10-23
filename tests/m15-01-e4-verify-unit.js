#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CLOSURE_CHECKLIST_SPEC,
  runE4Verification,
} = require('../tools/m15-01-e4-verify');

let pass = 0;
let fail = 0;

function check(label, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.error(`  FAIL  ${label}${extra ? ` (${extra})` : ''}`);
  }
}

const LEDGER_26_LINES = Array.from({ length: 26 }, (_, idx) => {
  const ver = String(idx + 1).padStart(3, '0');
  return `${ver}|mig_${ver}|chk_${ver}`;
});
const TEST_CATALOG_SHA256 = crypto
  .createHash('sha256')
  .update(`${LEDGER_26_LINES.join('\n')}\n`, 'utf8')
  .digest('hex');

const HOST_MAP = {
  'pg-primary.staging.internal': [{ address: '10.40.1.10' }],
  'pg-standby.staging.internal': [{ address: '10.40.2.10' }],
  'pg-pitr.staging.internal': [{ address: '10.40.3.10' }],
  'pgbouncer.staging.internal': [{ address: '10.40.1.20' }],
  'sentinel-1.staging.internal': [{ address: '10.40.4.11' }],
  'sentinel-2.staging.internal': [{ address: '10.40.5.12' }],
  'sentinel-3.staging.internal': [{ address: '10.40.6.13' }],
  'prometheus.obs.internal': [{ address: '10.50.1.10' }],
  'alertmanager.obs.internal': [{ address: '10.50.1.11' }],
};

function makeValidMultiNodeMocks() {
  const nowSec = Math.floor(Date.now() / 1000);
  const env = {
    GITHUB_SHA: 'd4dc1e210c8133aa47d8eeef910ef63ef1158650',
    E4_CONFIRM_ISOLATED_STAGING: '1',
    E4_PG_PRIMARY_DSN: 'postgresql://monitor:SuperSecretPrimaryPw99!@pg-primary.staging.internal:5432/payesh',
    E4_PG_STANDBY_DSN: 'postgresql://monitor:SuperSecretStandbyPw99!@pg-standby.staging.internal:5432/payesh',
    E4_PGBACKREST_STANZA: 'payesh_prod_eq',
    E4_PRIMARY_REGION: 'eu-central-1',
    E4_BACKUP_REPO_REGION: 'eu-west-1',
    E4_PITR_RESTORED_DSN: 'postgresql://monitor:SuperSecretPitrPw99!@pg-pitr.staging.internal:5432/payesh',
    E4_PITR_TARGET_UTC: '2026-10-23T18:00:00Z',
    E4_EXPECTED_CATALOG_SHA256: TEST_CATALOG_SHA256,
    E4_PGBOUNCER_DSN: 'postgresql://app:SuperSecretPoolPw99!@pgbouncer.staging.internal:6432/payesh',
    E4_PGBOUNCER_ADMIN_DSN: 'postgresql://admin:SuperSecretAdminPw99!@pgbouncer.staging.internal:6432/pgbouncer',
    E4_PGBOUNCER_EVIDENCE_JSON: '/virtual/pgbouncer-drill.json',
    E4_REDIS_SENTINEL_ENDPOINTS: 'sentinel-1.staging.internal:26379,sentinel-2.staging.internal:26379,sentinel-3.staging.internal:26379',
    E4_REDIS_MASTER_NAME: 'payesh-master',
    E4_PROMETHEUS_URL: 'https://prometheus.obs.internal:9090',
    E4_ALERTMANAGER_URL: 'https://alertmanager.obs.internal:9093',
    E4_ONCALL_INCIDENT_JSON: '/virtual/oncall-drill.json',
  };

  return {
    env,
    lookupFn: async (host) => {
      if (!HOST_MAP[host]) throw new Error(`unexpected_host:${host}`);
      return HOST_MAP[host];
    },
    pgQueryFn: async (dsn, sql) => {
      if (dsn.includes('pg-primary.staging.internal')) {
        if (sql.includes('pg_stat_replication')) {
          return { rows: [{ streaming_standbys: 1, max_lag_bytes: 4096 }] };
        }
        return { rows: [{ recovery: false, server_addr: '10.40.1.10' }] };
      }
      if (dsn.includes('pg-standby.staging.internal')) {
        return { rows: [{ recovery: true, server_addr: '10.40.2.10' }] };
      }
      if (dsn.includes('pg-pitr.staging.internal')) {
        if (sql.includes('schema_migrations')) {
          return { rows: LEDGER_26_LINES.map((line) => ({ line })) };
        }
        return { rows: [{ cnt: 0 }] };
      }
      if (dsn.endsWith('/pgbouncer')) {
        if (sql.includes('SHOW DATABASES')) {
          return { rows: [{ name: 'payesh', host: 'pg-standby.staging.internal', port: 5432, paused: 0 }] };
        }
        return { rows: [{ database: 'payesh', pool_mode: 'transaction' }] };
      }
      if (dsn.includes('pgbouncer.staging.internal')) {
        return { rows: [{ recovery: false }] };
      }
      throw new Error(`unexpected_dsn:${dsn}`);
    },
    execFn: (bin) => {
      if (bin === 'pgbackrest') {
        return JSON.stringify([{
          name: 'payesh_prod_eq',
          status: { code: 0, message: 'ok' },
          archive: [{ min: '000000010000000000000001', max: '000000010000000000000009' }],
          backup: [{ type: 'full', timestamp: { stop: nowSec - 600 } }],
        }]);
      }
      return '';
    },
    redisCommandFn: async (_host, _port, _pw, parts) => {
      if (parts[0] === 'SENTINEL' && parts[1] === 'ckquorum') return 'OK 3 usable Sentinels.';
      if (parts[0] === 'SENTINEL' && parts[1] === 'get-master-addr-by-name') return ['10.40.4.50', '6379'];
      if (parts[0] === 'ROLE') return ['master', 1024, []];
      if (parts[0] === 'INFO') return 'aof_enabled:1\r\nrdb_last_bgsave_status:ok\r\n';
      throw new Error('unexpected_redis_cmd');
    },
    httpGetJsonFn: async (targetUrl) => {
      if (targetUrl.endsWith('/api/v1/rules')) {
        return {
          statusCode: 200,
          json: {
            data: {
              groups: [{
                rules: [
                  { name: 'RedisDown' },
                  { name: 'SyncQueueDepth' },
                ],
              }],
            },
          },
        };
      }
      return {
        statusCode: 200,
        json: { config: { original: 'receivers:\n  - name: pagerduty-prod\n' } },
      };
    },
    fsReadFn: (filePath) => {
      if (filePath === '/virtual/pgbouncer-drill.json') {
        return JSON.stringify({
          pgbouncer_reroute_tested: true,
          promotion_to_verified_pgbouncer_write_ms: 8420,
        });
      }
      if (filePath === '/virtual/oncall-drill.json') {
        return JSON.stringify({
          incident_id: 'INC-2026-1023-E4',
          paging_provider: 'pagerduty',
          responder_handle: 'oncall-sre-primary',
          runbook_executed: 'docs/RUNBOOK_CARDS/POSTGRES_FAILOVER.md',
          alert_fired_at: '2026-10-23T18:10:00.000Z',
          human_acknowledged_at: '2026-10-23T18:11:12.000Z',
          service_recovered_at: '2026-10-23T18:14:05.000Z',
        });
      }
      throw new Error(`missing_virtual_file:${filePath}`);
    },
  };
}

async function runTests() {
  console.log('=== M15-01 E4 Operational Verification Unit & Mutation Suite ===');

  // 1. Checklist schema completeness across all 7 E4 items (6 mandatory closure fields each)
  const checklistIds = Object.keys(CLOSURE_CHECKLIST_SPEC);
  check('defines all 7 canonical E4 operational criteria (E4-01..E4-07)', checklistIds.length === 7);
  for (const id of checklistIds) {
    const entry = CLOSURE_CHECKLIST_SPEC[id];
    check(
      `${id} defines all 6 mandatory finite closure checklist fields`,
      Boolean(
        entry.criterion
        && entry.required_environment_and_permissions
        && entry.reproducible_command
        && entry.expected_result_and_threshold
        && entry.raw_evidence_artifact
        && entry.owner_and_next_action
      )
    );
  }

  // 2. Empty environment -> BLOCKED WITH PROOF (exit_code === 2, 0 PASS, 7 BLOCKED)
  const blockedReport = await runE4Verification({ env: { GITHUB_SHA: 'deadbeef'.repeat(5) } });
  check('empty env yields BLOCKED overall_status and exit_code 2',
    blockedReport.overall_status === 'BLOCKED'
      && blockedReport.exit_code === 2
      && blockedReport.mission_closeout_verdict === 'BLOCKED WITH PROOF'
      && blockedReport.counts.pass === 0
      && blockedReport.counts.blocked === 7);

  // 3. Valid full multi-node operational topology -> PASS (exit_code === 0, 7/7 PASS, zero secrets leaked)
  const baseMocks = makeValidMultiNodeMocks();
  const passReport = await runE4Verification(baseMocks);
  const serializedPass = JSON.stringify(passReport);
  check('valid multi-node operational topology yields PASS (7/7, exit 0)',
    passReport.overall_status === 'PASS'
      && passReport.exit_code === 0
      && passReport.counts.pass === 7
      && passReport.counts.fail === 0
      && passReport.counts.blocked === 0);
  check('report completely withholds raw DSN passwords and usernames',
    !serializedPass.includes('SuperSecretPrimaryPw99!')
      && !serializedPass.includes('SuperSecretStandbyPw99!')
      && !serializedPass.includes('SuperSecretPitrPw99!')
      && !serializedPass.includes('SuperSecretPoolPw99!')
      && !serializedPass.includes('SuperSecretAdminPw99!'));

  // 4. Safety & Mutation-Sensitivity Negative Controls (all MUST fail closed with exit_code === 1)
  const noConfirmMocks = makeValidMultiNodeMocks();
  delete noConfirmMocks.env.E4_CONFIRM_ISOLATED_STAGING;
  const noConfirmReport = await runE4Verification(noConfirmMocks);
  check('refuses execution fail-closed when E4_CONFIRM_ISOLATED_STAGING!=1',
    noConfirmReport.overall_status === 'FAIL' && noConfirmReport.exit_code === 1);

  const singleHostPg = makeValidMultiNodeMocks();
  singleHostPg.lookupFn = async (host) => (
    host.startsWith('pg-') ? [{ address: '10.40.1.10' }] : HOST_MAP[host]
  );
  const singleHostPgReport = await runE4Verification(singleHostPg);
  check('rejects co-located Primary/Standby IP spoofing fail-closed (single-host E3 != E4)',
    singleHostPgReport.overall_status === 'FAIL'
      && singleHostPgReport.exit_code === 1
      && singleHostPgReport.criteria.find((c) => c.id === 'E4-01').reason_code === 'overlapping_or_loopback_postgres_ips');

  const sameRegionBackup = makeValidMultiNodeMocks();
  sameRegionBackup.env.E4_BACKUP_REPO_REGION = 'eu-central-1';
  const sameRegionReport = await runE4Verification(sameRegionBackup);
  check('rejects co-located backup region fail-closed (E4-02)',
    sameRegionReport.overall_status === 'FAIL'
      && sameRegionReport.criteria.find((c) => c.id === 'E4-02').reason_code === 'same_region_backup_repo_rejected');

  const singleHostSentinel = makeValidMultiNodeMocks();
  singleHostSentinel.lookupFn = async (host) => (
    host.startsWith('sentinel-') ? [{ address: '10.40.4.11' }] : HOST_MAP[host]
  );
  const singleHostSentinelReport = await runE4Verification(singleHostSentinel);
  check('rejects co-located Sentinel IPs fail-closed (E4-05)',
    singleHostSentinelReport.overall_status === 'FAIL'
      && singleHostSentinelReport.criteria.find((c) => c.id === 'E4-05').reason_code === 'co_located_sentinel_hosts_rejected');

  const sharedObsPlane = makeValidMultiNodeMocks();
  sharedObsPlane.lookupFn = async (host) => (
    host === 'prometheus.obs.internal' ? [{ address: '10.40.1.10' }] : HOST_MAP[host]
  );
  const sharedObsReport = await runE4Verification(sharedObsPlane);
  check('rejects shared-host observability plane fail-closed (E4-06)',
    sharedObsReport.overall_status === 'FAIL'
      && sharedObsReport.criteria.find((c) => c.id === 'E4-06').reason_code === 'shared_failure_domain_observability_rejected');

  const syntheticOncall = makeValidMultiNodeMocks();
  const origFsRead = syntheticOncall.fsReadFn;
  syntheticOncall.fsReadFn = (filePath) => {
    if (filePath === '/virtual/oncall-drill.json') {
      return JSON.stringify({
        incident_id: 'INC-FAKE',
        paging_provider: 'm15-01-alert-receiver',
        responder_handle: 'localhost-bot',
        runbook_executed: 'docs/RUNBOOK_CARDS/POSTGRES_FAILOVER.md',
        alert_fired_at: '2026-10-23T18:10:00.000Z',
        human_acknowledged_at: '2026-10-23T18:10:05.000Z',
        service_recovered_at: '2026-10-23T18:10:15.000Z',
      });
    }
    return origFsRead(filePath);
  };
  const syntheticOncallReport = await runE4Verification(syntheticOncall);
  check('rejects synthetic CI webhook receiver for human on-call ack requirement (E4-07)',
    syntheticOncallReport.overall_status === 'FAIL'
      && syntheticOncallReport.criteria.find((c) => c.id === 'E4-07').reason_code === 'oncall_ack_chain_invalid_or_exceeded_slo');

  // 5. Real CLI execution check on current sandbox environment (must write 0600 JSON + exit 2 without --require-pass, exit 1 with --require-pass)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-e4-cli-'));
  const reportFile = path.join(tmpDir, 'probe.json');
  try {
    const cliBlocked = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'tools', 'm15-01-e4-verify.js'), '--output', reportFile],
      { encoding: 'utf8', env: { PATH: process.env.PATH || '' } }
    );
    const cliStrict = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'tools', 'm15-01-e4-verify.js'), '--require-pass'],
      { encoding: 'utf8', env: { PATH: process.env.PATH || '' } }
    );
    const written = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const mode = fs.statSync(reportFile).mode & 0o777;
    check('CLI exits 2 on missing E4 infra, writes mode-0600 report with valid SHA-256, and exits 1 under --require-pass',
      cliBlocked.status === 2
        && cliStrict.status === 1
        && mode === 0o600
        && written.overall_status === 'BLOCKED'
        && /^[0-9a-f]{64}$/.test(written.report_sha256));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\nM15-01 E4 verification unit summary: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
