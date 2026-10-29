#!/usr/bin/env node
'use strict';

/**
 * M15-01 Operational E4 Verification Harness & Finite Closure Checklist Probe
 *
 * Enforces strict separation between single-runner CI E3 evidence and multi-node
 * operational E4 evidence across real infrastructure failure domains:
 *   - E4-01: Multi-host PostgreSQL primary + streaming standby replication
 *   - E4-02: Off-site / cross-region pgBackRest stanza health & backup age
 *   - E4-03: Isolated multi-host PITR restore & 26-migration catalog checksum
 *   - E4-04: Real PgBouncer transaction pooler routing & failover reroute RTO
 *   - E4-05: Multi-node Redis Sentinel (>= 3 distinct hosts) quorum & persistence
 *   - E4-06: Independent observability plane failure domain (Prometheus + Alertmanager)
 *   - E4-07: Live on-call alert -> human ack -> runbook -> recovery (MTTA / MTTR)
 *
 * Exit codes:
 *   0 — PASS:    All 7 mandatory E4 operational criteria executed and passed
 *   1 — FAIL:    At least one criterion failed threshold/safety or rejected spoofed single-host/loopback target
 *   2 — BLOCKED: No failure, but one or more real multi-node operational targets are unprovisioned/unreachable
 *
 * Security & privacy invariants:
 *   - Never prints, logs, or writes raw DSNs, passwords, tokens, or secrets
 *   - Records only SHA-256 host fingerprints and redacted diagnostics via m15-01-log-redactor
 *   - Refuses operational execution unless E4_CONFIRM_ISOLATED_STAGING === '1'
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { redactText } = require('./m15-01-log-redactor');

const CANONICAL_CATALOG_SHA256 = 'sha256:7743953e67a9f6421a245143501f010532c02056427d8d480725fdecfcd14eb6'.replace(/^sha256:/, '');
const EXPECTED_MIGRATION_COUNT = 26;
const DEFAULT_MAX_REPL_LAG_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_BACKUP_AGE_SEC = 86400;
const DEFAULT_PGBOUNCER_RTO_MAX_MS = 30000;
const DEFAULT_MTTA_MAX_MS = 300000;
const DEFAULT_MTTR_MAX_MS = 900000;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function hostFingerprint(host) {
  return `host_sha256:${sha256Hex(String(host || '').trim().toLowerCase()).slice(0, 16)}`;
}

function isLoopbackHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host === '0.0.0.0'
    || host === '::1'
    || host === '::'
    || host.startsWith('127.')
    || host.startsWith('::ffff:127.')
    || host === 'host.docker.internal'
  ) {
    return true;
  }
  return false;
}

function parseDsnSafe(rawValue, label) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return { present: false, error: `missing_${label}` };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_err) {
    return { present: true, valid: false, error: `invalid_url_${label}` };
  }
  const protocol = String(parsed.protocol || '').replace(/:$/, '').toLowerCase();
  const hostname = String(parsed.hostname || '').trim().toLowerCase();
  const port = parsed.port ? Number(parsed.port) : (protocol.startsWith('postgres') ? 5432 : (protocol === 'https' ? 443 : 80));
  if (!hostname || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return { present: true, valid: false, error: `invalid_endpoint_${label}` };
  }
  return {
    present: true,
    valid: true,
    raw: value,
    protocol,
    hostname,
    port,
    loopback: isLoopbackHost(hostname),
    fingerprint: `${protocol}://${hostFingerprint(hostname)}:${port}`,
  };
}

function parsePositiveInt(rawValue, fallbackValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return fallbackValue;
  }
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num <= 0 || Math.floor(num) !== num) {
    return NaN;
  }
  return num;
}

function commandAvailable(binaryName, execFn) {
  try {
    execFn('sh', ['-c', `command -v "$1" >/dev/null 2>&1`, '--', binaryName], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolveHostAddresses(hostname, lookupFn) {
  if (net.isIP(hostname)) {
    return [hostname];
  }
  const records = await lookupFn(hostname, { all: true });
  return records.map((entry) => String(entry.address || entry).trim().toLowerCase()).filter(Boolean);
}

function hasOverlappingAddress(addrsA, addrsB) {
  const setA = new Set(addrsA);
  for (const addr of addrsB) {
    if (setA.has(addr)) return true;
  }
  return false;
}

function defaultHttpGetJson(targetUrl, bearerToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const headers = { Accept: 'application/json' };
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    const req = mod.request(parsed, { method: 'GET', headers, timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(bodyText);
        } catch (_err) {
          json = null;
        }
        resolve({ statusCode: res.statusCode || 0, json, bodyLength: bodyText.length });
      });
    });
    req.on('timeout', () => req.destroy(new Error('http_request_timeout')));
    req.on('error', reject);
    req.end();
  });
}

function encodeRespCommand(parts) {
  let out = `*${parts.length}\r\n`;
  for (const part of parts) {
    const buf = Buffer.from(String(part), 'utf8');
    out += `$${buf.length}\r\n${buf.toString('utf8')}\r\n`;
  }
  return out;
}

function parseRespValue(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const header = buffer.slice(offset + 1, lineEnd).toString('utf8');
  if (prefix === '+' || prefix === '-') {
    return { type: prefix, value: header, next: lineEnd + 2 };
  }
  if (prefix === ':') {
    return { type: ':', value: Number(header), next: lineEnd + 2 };
  }
  if (prefix === '$') {
    const byteLen = Number(header);
    if (byteLen < 0) return { type: '$', value: null, next: lineEnd + 2 };
    const end = lineEnd + 2 + byteLen;
    if (end + 2 > buffer.length) return null;
    return {
      type: '$',
      value: buffer.slice(lineEnd + 2, end).toString('utf8'),
      next: end + 2,
    };
  }
  if (prefix === '*') {
    const count = Number(header);
    if (count < 0) return { type: '*', value: null, next: lineEnd + 2 };
    const items = [];
    let cursor = lineEnd + 2;
    for (let idx = 0; idx < count; idx += 1) {
      const parsed = parseRespValue(buffer, cursor);
      if (!parsed) return null;
      items.push(parsed.value);
      cursor = parsed.next;
    }
    return { type: '*', value: items, next: cursor };
  }
  throw new Error(`unsupported_resp_prefix:${prefix}`);
}

function defaultRedisCommand(host, port, password, commandParts) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const queue = [];
    if (password) queue.push(['AUTH', password]);
    queue.push(commandParts);
    let stepIndex = 0;
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(val);
    };

    socket.setTimeout(8000, () => finish(new Error('redis_socket_timeout')));
    socket.on('error', (err) => finish(err));
    socket.on('connect', () => {
      socket.write(encodeRespCommand(queue[0]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let parsed;
      try {
        parsed = parseRespValue(buffer, 0);
      } catch (err) {
        finish(err);
        return;
      }
      if (!parsed) return;
      buffer = buffer.slice(parsed.next);
      if (parsed.type === '-') {
        finish(new Error(`redis_error:${parsed.value}`));
        return;
      }
      stepIndex += 1;
      if (stepIndex < queue.length) {
        socket.write(encodeRespCommand(queue[stepIndex]));
        return;
      }
      finish(null, parsed.value);
    });
  });
}

async function defaultPgQuery(dsn, sql, params = []) {
  // Lazy-require pg so syntax checks remain clean even without node_modules.
  const { Client } = require('pg');
  const client = new Client({ connectionString: dsn, connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

const CLOSURE_CHECKLIST_SPEC = {
  'E4-01': {
    criterion: 'Multi-node PostgreSQL 16+ primary and streaming standby run on distinct hosts/failure domains with primary R/W, standby in recovery, and streaming WAL replay lag <= 16 MiB.',
    required_environment_and_permissions: 'Isolated multi-node staging environment with two distinct PostgreSQL hosts (Primary + Standby), network routing from runner/bastion, read-only monitoring credentials in E4_PG_PRIMARY_DSN and E4_PG_STANDBY_DSN, plus E4_CONFIRM_ISOLATED_STAGING=1.',
    reproducible_command: 'E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'Primary pg_is_in_recovery()=false, Standby pg_is_in_recovery()=true, resolved Primary IP != Standby IP (non-loopback), streaming_standbys >= 1, max_lag_bytes <= 16777216.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-01].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) provisions the isolated multi-node PostgreSQL Primary + Standby, runs the probe, and records redacted evidence. Owner only grants secure staging access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-02': {
    criterion: 'pgBackRest repository resides in an off-site/distinct fault region from PostgreSQL primary with stanza status code 0, non-empty WAL archive range, and full backup age <= 86400s.',
    required_environment_and_permissions: 'pgbackrest CLI >= 2.50 on staging bastion/backup host, off-site S3/object-store bucket in distinct region (E4_BACKUP_REPO_REGION != E4_PRIMARY_REGION), and E4_PGBACKREST_STANZA.',
    reproducible_command: 'E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'E4_PRIMARY_REGION != E4_BACKUP_REPO_REGION, pgbackrest info status.code == 0, >= 1 full backup with age_sec <= 86400, non-empty WAL archive min/max.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-02].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) provisions the off-site cross-region backup repository, runs pgBackRest full + WAL archive backup, and records redacted evidence. Owner only grants secure cloud/IAM access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-03': {
    criterion: 'Isolated host time-target PITR restore from off-site pgBackRest repository matches all 26 schema_migrations checksums and excludes post-target writes.',
    required_environment_and_permissions: 'Dedicated isolated recovery host distinct from Primary and Standby, E4_PITR_RESTORED_DSN, and target timestamp E4_PITR_TARGET_UTC.',
    reproducible_command: 'bash tools/pitr-restore.sh --target "$E4_PITR_TARGET_UTC" && bash tools/pitr-verify.sh --expect-before "$E4_PITR_TARGET_UTC" && E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'Restored host IP distinct from Primary & Standby (non-loopback), 26 schema_migrations rows with catalog_sha256 == sha256:7743953e67a9f6421a245143501f010532c02056427d8d480725fdecfcd14eb6, post_target_audit_rows == 0.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-03].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) executes the multi-host PITR restore drill and records redacted evidence. Owner only grants secure recovery-host access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-04': {
    criterion: 'Real multi-host PgBouncer transaction pooler routes R/W client traffic across primary promotion (`--reroute-pgbouncer-only`) within <= 30000 ms RTO.',
    required_environment_and_permissions: 'PgBouncer instance in staging HA stack with E4_PGBOUNCER_DSN, E4_PGBOUNCER_ADMIN_DSN, and multi-host failover evidence JSON output E4_PGBOUNCER_EVIDENCE_JSON from tools/failover-postgres.sh --live.',
    reproducible_command: 'bash tools/failover-postgres.sh --live && E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'PgBouncer pool_mode == "transaction", upstream target host non-loopback and unpaused, client query pg_is_in_recovery() == false, 0 < promotion_to_verified_pgbouncer_write_ms <= 30000.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-04].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) runs tools/failover-postgres.sh --live against multi-node staging HA PostgreSQL + PgBouncer and records redacted E4_PGBOUNCER_EVIDENCE_JSON. Owner only grants secure staging access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-05': {
    criterion: 'Multi-node Redis Sentinel cluster (>= 3 distinct non-loopback hosts) maintains quorum, agrees on promoted master address, and preserves AOF/RDB persistence.',
    required_environment_and_permissions: 'Three or more Redis Sentinel nodes across distinct hosts (E4_REDIS_SENTINEL_ENDPOINTS), E4_REDIS_MASTER_NAME, and optional E4_REDIS_PASSWORD / E4_SENTINEL_PASSWORD.',
    reproducible_command: 'bash tools/failover-redis.sh && E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: '>= 3 distinct resolved Sentinel host IPs, 100% SENTINEL ckquorum OK, unanimous non-loopback master IP:port with role == "master" and AOF/RDB persistence enabled.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-05].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) deploys the 3-node cross-host Redis Sentinel topology, runs the failover checks, and records redacted evidence. Owner only grants secure staging access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-06': {
    criterion: 'Observability plane (Prometheus + Alertmanager) runs on an independent host/failure domain separate from DB/pooler hosts with canonical alert rules active and zero placeholder receivers.',
    required_environment_and_permissions: 'Dedicated monitoring host/plane separate from database/app failure domain with E4_PROMETHEUS_URL, E4_ALERTMANAGER_URL, and optional E4_OBSERVABILITY_BEARER_TOKEN.',
    reproducible_command: 'E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'Non-loopback Prometheus/Alertmanager host IPs disjoint from DB/PgBouncer host IPs, HTTP 200 on /api/v1/rules (>= 11 canonical rules incl. RedisDown & SyncQueueDepth) and /api/v2/status (0 example.invalid receivers).',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-06].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) deploys Prometheus + Alertmanager on the isolated monitoring host, validates alert rules, and records redacted evidence. Owner only grants secure monitoring access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
  'E4-07': {
    criterion: 'Real on-call incident chain (Alert -> Paging -> Human Acknowledgement -> Runbook Execution -> Verified Service Recovery) meets MTTA <= 300000 ms and MTTR <= 900000 ms.',
    required_environment_and_permissions: 'Live external paging/on-call route + human responder drill record written to E4_ONCALL_INCIDENT_JSON.',
    reproducible_command: 'E4_CONFIRM_ISOLATED_STAGING=1 node tools/m15-01-e4-verify.js --require-pass --output artifacts/m15-01-e4/e4-probe-report.json',
    expected_result_and_threshold: 'Non-synthetic paging provider and human responder, valid ISO-8601 timestamps, 0 < mtta_ms <= 300000, mtta_ms <= mttr_ms <= 900000.',
    raw_evidence_artifact: 'artifacts/m15-01-e4/e4-probe-report.json (criteria[E4-07].metrics + report_sha256).',
    owner_and_next_action: 'Operator: Chat 4 (Infrastructure/Performance) configures and runs the live paging drill and records redacted E4_ONCALL_INCIDENT_JSON. The designated on-call human must acknowledge the page and execute the runbook; this human action cannot be simulated or self-certified. Owner only grants secure access or explicitly owner-exclusive approvals if required; owner is not operator, test runner, log analyst, or coordinator. Never send secret values in chat.',
  },
};

function makeCriterionResult(id, status, reasonCode, detail, metrics = {}) {
  return Object.assign(
    {
      id,
      status,
      reason_code: reasonCode,
      detail: redactText(String(detail || '')),
      metrics,
    },
    CLOSURE_CHECKLIST_SPEC[id]
  );
}

async function runE4Verification(options = {}) {
  const env = options.env || process.env;
  const lookupFn = options.lookupFn || ((host, opts) => dns.lookup(host, opts));
  const pgQueryFn = options.pgQueryFn || defaultPgQuery;
  const execFn = options.execFn || execFileSync;
  const redisCommandFn = options.redisCommandFn || defaultRedisCommand;
  const httpGetJsonFn = options.httpGetJsonFn || defaultHttpGetJson;
  const fsReadFn = options.fsReadFn || ((filePath) => fs.readFileSync(filePath, 'utf8'));
  const startedAt = new Date().toISOString();

  const stagingConfirmed = String(env.E4_CONFIRM_ISOLATED_STAGING || '').trim() === '1';
  const anyTargetProvided = [
    'E4_PG_PRIMARY_DSN',
    'E4_PG_STANDBY_DSN',
    'E4_PGBACKREST_STANZA',
    'E4_PITR_RESTORED_DSN',
    'E4_PGBOUNCER_DSN',
    'E4_REDIS_SENTINEL_ENDPOINTS',
    'E4_PROMETHEUS_URL',
    'E4_ALERTMANAGER_URL',
    'E4_ONCALL_INCIDENT_JSON',
  ].some((key) => Boolean(String(env[key] || '').trim()));

  const localCapabilities = {
    docker_cli_present: commandAvailable('docker', execFn),
    psql_cli_present: commandAvailable('psql', execFn),
    pgbackrest_cli_present: commandAvailable('pgbackrest', execFn),
    pgbouncer_cli_present: commandAvailable('pgbouncer', execFn),
    redis_cli_present: commandAvailable('redis-cli', execFn),
    staging_confirmation_set: stagingConfirmed,
  };

  if (anyTargetProvided && !stagingConfirmed) {
    const failedSafety = Object.keys(CLOSURE_CHECKLIST_SPEC).map((id) => makeCriterionResult(
      id,
      'FAIL',
      'missing_isolated_staging_confirmation',
      'Operational E4 target variables were supplied without E4_CONFIRM_ISOLATED_STAGING=1; refusing execution fail-closed to protect production.',
      {}
    ));
    return finalizeReport(startedAt, env, localCapabilities, failedSafety);
  }

  const criteria = [];
  const dataPlaneAddresses = new Set();
  let primaryAddrs = [];
  let standbyAddrs = [];

  // --- E4-01: Multi-node PostgreSQL Primary & Standby ---
  const primaryDsn = parseDsnSafe(env.E4_PG_PRIMARY_DSN, 'pg_primary_dsn');
  const standbyDsn = parseDsnSafe(env.E4_PG_STANDBY_DSN, 'pg_standby_dsn');
  const maxLagBytes = parsePositiveInt(env.E4_MAX_REPL_LAG_BYTES, DEFAULT_MAX_REPL_LAG_BYTES);
  if (!primaryDsn.present || !standbyDsn.present) {
    criteria.push(makeCriterionResult(
      'E4-01',
      'BLOCKED',
      'missing_e4_postgres_dsns',
      'E4_PG_PRIMARY_DSN and/or E4_PG_STANDBY_DSN not configured in environment.',
      { primary_configured: primaryDsn.present, standby_configured: standbyDsn.present }
    ));
  } else if (!primaryDsn.valid || !standbyDsn.valid || Number.isNaN(maxLagBytes)) {
    criteria.push(makeCriterionResult(
      'E4-01',
      'FAIL',
      'invalid_e4_postgres_config',
      `Invalid PostgreSQL E4 DSN or lag threshold (${primaryDsn.error || standbyDsn.error || 'invalid_lag'}).`
    ));
  } else if (primaryDsn.loopback || standbyDsn.loopback || primaryDsn.hostname === standbyDsn.hostname) {
    criteria.push(makeCriterionResult(
      'E4-01',
      'FAIL',
      'single_host_or_loopback_postgres_rejected',
      'Loopback or identical hostname detected across Primary and Standby; single-host setups are E3, never E4.',
      { primary_endpoint: primaryDsn.fingerprint, standby_endpoint: standbyDsn.fingerprint }
    ));
  } else {
    try {
      primaryAddrs = await resolveHostAddresses(primaryDsn.hostname, lookupFn);
      standbyAddrs = await resolveHostAddresses(standbyDsn.hostname, lookupFn);
      primaryAddrs.forEach((ip) => dataPlaneAddresses.add(ip));
      standbyAddrs.forEach((ip) => dataPlaneAddresses.add(ip));
      if (
        primaryAddrs.some(isLoopbackHost)
        || standbyAddrs.some(isLoopbackHost)
        || hasOverlappingAddress(primaryAddrs, standbyAddrs)
      ) {
        criteria.push(makeCriterionResult(
          'E4-01',
          'FAIL',
          'overlapping_or_loopback_postgres_ips',
          'Resolved IP addresses for Primary and Standby overlap or resolve to loopback.',
          { primary_endpoint: primaryDsn.fingerprint, standby_endpoint: standbyDsn.fingerprint }
        ));
      } else {
        const primRoleRes = await pgQueryFn(
          primaryDsn.raw,
          'SELECT pg_is_in_recovery() AS recovery, inet_server_addr()::text AS server_addr'
        );
        const replRes = await pgQueryFn(
          primaryDsn.raw,
          "SELECT count(*)::int AS streaming_standbys, COALESCE(max(pg_wal_lsn_diff(sent_lsn, replay_lsn)), 0)::bigint AS max_lag_bytes FROM pg_stat_replication WHERE state = 'streaming'"
        );
        const stbyRoleRes = await pgQueryFn(
          standbyDsn.raw,
          'SELECT pg_is_in_recovery() AS recovery, inet_server_addr()::text AS server_addr'
        );
        const primRow = (primRoleRes.rows && primRoleRes.rows[0]) || {};
        const replRow = (replRes.rows && replRes.rows[0]) || {};
        const stbyRow = (stbyRoleRes.rows && stbyRoleRes.rows[0]) || {};
        const streamingStandbys = Number(replRow.streaming_standbys || 0);
        const observedLag = Number(replRow.max_lag_bytes || 0);
        const distinctServerAddr = Boolean(primRow.server_addr && stbyRow.server_addr && primRow.server_addr !== stbyRow.server_addr);
        const passed = primRow.recovery === false
          && stbyRow.recovery === true
          && distinctServerAddr
          && streamingStandbys >= 1
          && observedLag <= maxLagBytes;
        criteria.push(makeCriterionResult(
          'E4-01',
          passed ? 'PASS' : 'FAIL',
          passed ? 'verified_multi_host_pg_replication' : 'pg_ha_invariant_failed',
          passed
            ? 'Verified multi-host PostgreSQL primary R/W + distinct standby streaming replication within lag ceiling.'
            : 'PostgreSQL HA invariant check failed (recovery state, server address separation, or lag threshold).',
          {
            primary_endpoint: primaryDsn.fingerprint,
            standby_endpoint: standbyDsn.fingerprint,
            primary_in_recovery: Boolean(primRow.recovery),
            standby_in_recovery: Boolean(stbyRow.recovery),
            distinct_server_addr: distinctServerAddr,
            streaming_standbys: streamingStandbys,
            max_lag_bytes: observedLag,
            ceiling_lag_bytes: maxLagBytes,
          }
        ));
      }
    } catch (err) {
      criteria.push(makeCriterionResult('E4-01', 'FAIL', 'pg_ha_query_error', err.message));
    }
  }

  // --- E4-02: Off-Site pgBackRest Stanza & Cross-Region Backup ---
  const stanza = String(env.E4_PGBACKREST_STANZA || '').trim();
  const primaryRegion = String(env.E4_PRIMARY_REGION || '').trim().toLowerCase();
  const backupRegion = String(env.E4_BACKUP_REPO_REGION || '').trim().toLowerCase();
  const maxBackupAgeSec = parsePositiveInt(env.E4_PGBACKREST_MAX_BACKUP_AGE_SEC, DEFAULT_MAX_BACKUP_AGE_SEC);
  if (!stanza || !primaryRegion || !backupRegion) {
    criteria.push(makeCriterionResult(
      'E4-02',
      'BLOCKED',
      'missing_e4_pgbackrest_config',
      'E4_PGBACKREST_STANZA, E4_PRIMARY_REGION, and/or E4_BACKUP_REPO_REGION not configured.',
      { pgbackrest_cli_present: localCapabilities.pgbackrest_cli_present }
    ));
  } else if (Number.isNaN(maxBackupAgeSec) || !/^[A-Za-z0-9_-]{1,64}$/.test(stanza)) {
    criteria.push(makeCriterionResult('E4-02', 'FAIL', 'invalid_pgbackrest_parameters', 'Invalid stanza identifier or max backup age.'));
  } else if (primaryRegion === backupRegion) {
    criteria.push(makeCriterionResult(
      'E4-02',
      'FAIL',
      'same_region_backup_repo_rejected',
      'Backup repository region matches primary database region; E4 requires distinct fault/region domain.',
      { primary_region: primaryRegion, backup_repo_region: backupRegion }
    ));
  } else {
    try {
      const rawInfo = execFn('pgbackrest', [`--stanza=${stanza}`, '--output=json', 'info'], {
        encoding: 'utf8',
        timeout: 20000,
      });
      const parsedInfo = JSON.parse(rawInfo);
      const stanzaEntry = Array.isArray(parsedInfo) ? parsedInfo[0] : null;
      const backups = (stanzaEntry && Array.isArray(stanzaEntry.backup)) ? stanzaEntry.backup : [];
      const fullBackups = backups.filter((item) => item && item.type === 'full' && item.timestamp && item.timestamp.stop);
      const latestFull = fullBackups[fullBackups.length - 1] || null;
      const nowSec = Math.floor(Date.now() / 1000);
      const ageSec = latestFull ? Math.max(0, nowSec - Number(latestFull.timestamp.stop)) : Infinity;
      const archiveOk = Boolean(
        stanzaEntry
        && Array.isArray(stanzaEntry.archive)
        && stanzaEntry.archive.some((arc) => arc && arc.min && arc.max)
      );
      const statusOk = Boolean(stanzaEntry && stanzaEntry.status && stanzaEntry.status.code === 0);
      const passed = statusOk && Boolean(latestFull) && ageSec <= maxBackupAgeSec && archiveOk;
      criteria.push(makeCriterionResult(
        'E4-02',
        passed ? 'PASS' : 'FAIL',
        passed ? 'verified_offsite_pgbackrest_stanza' : 'pgbackrest_stanza_check_failed',
        passed
          ? 'Verified off-site cross-region pgBackRest stanza health, WAL archive continuity, and full backup freshness.'
          : 'pgBackRest stanza unhealthy, missing WAL archive continuity, or full backup older than ceiling.',
        {
          stanza,
          primary_region: primaryRegion,
          backup_repo_region: backupRegion,
          status_code: stanzaEntry && stanzaEntry.status ? stanzaEntry.status.code : -1,
          full_backup_count: fullBackups.length,
          latest_full_backup_age_sec: Number.isFinite(ageSec) ? ageSec : null,
          max_backup_age_sec: maxBackupAgeSec,
          wal_archive_continuous: archiveOk,
        }
      ));
    } catch (err) {
      criteria.push(makeCriterionResult('E4-02', 'FAIL', 'pgbackrest_exec_error', err.message));
    }
  }

  // --- E4-03: Multi-Host Isolated PITR Restore & Catalog Checksum ---
  const pitrDsn = parseDsnSafe(env.E4_PITR_RESTORED_DSN, 'pitr_restored_dsn');
  const pitrTargetUtc = String(env.E4_PITR_TARGET_UTC || '').trim();
  const expectedCatalogSha = String(env.E4_EXPECTED_CATALOG_SHA256 || CANONICAL_CATALOG_SHA256).trim().toLowerCase();
  if (!pitrDsn.present || !pitrTargetUtc) {
    criteria.push(makeCriterionResult(
      'E4-03',
      'BLOCKED',
      'missing_e4_pitr_target',
      'E4_PITR_RESTORED_DSN and/or E4_PITR_TARGET_UTC not configured.'
    ));
  } else if (!pitrDsn.valid || Number.isNaN(Date.parse(pitrTargetUtc)) || !/^[0-9a-f]{64}$/.test(expectedCatalogSha)) {
    criteria.push(makeCriterionResult('E4-03', 'FAIL', 'invalid_e4_pitr_config', 'Invalid PITR DSN, timestamp, or expected catalog SHA-256.'));
  } else if (pitrDsn.loopback) {
    criteria.push(makeCriterionResult('E4-03', 'FAIL', 'loopback_pitr_host_rejected', 'Loopback PITR target cannot satisfy multi-host E4 isolation.'));
  } else {
    try {
      const pitrAddrs = await resolveHostAddresses(pitrDsn.hostname, lookupFn);
      if (
        pitrAddrs.some(isLoopbackHost)
        || hasOverlappingAddress(pitrAddrs, primaryAddrs)
        || hasOverlappingAddress(pitrAddrs, standbyAddrs)
      ) {
        criteria.push(makeCriterionResult(
          'E4-03',
          'FAIL',
          'non_isolated_pitr_host_rejected',
          'PITR restored host overlaps with Primary/Standby IP or loopback; isolated recovery host required.'
        ));
      } else {
        const ledgerRes = await pgQueryFn(
          pitrDsn.raw,
          "SELECT version || '|' || name || '|' || checksum AS line FROM schema_migrations ORDER BY version ASC"
        );
        const lines = (ledgerRes.rows || []).map((row) => String(row.line || ''));
        const catalogSha = sha256Hex(`${lines.join('\n')}\n`);
        const postTargetRes = await pgQueryFn(
          pitrDsn.raw,
          'SELECT count(*)::int AS cnt FROM audit_log WHERE created_at > $1::timestamptz',
          [pitrTargetUtc]
        );
        const postRows = Number((postTargetRes.rows && postTargetRes.rows[0] && postTargetRes.rows[0].cnt) || 0);
        const passed = lines.length === EXPECTED_MIGRATION_COUNT
          && catalogSha === expectedCatalogSha
          && postRows === 0;
        criteria.push(makeCriterionResult(
          'E4-03',
          passed ? 'PASS' : 'FAIL',
          passed ? 'verified_isolated_pitr_restore' : 'pitr_verification_mismatch',
          passed
            ? 'Verified isolated multi-host PITR catalog SHA-256 across all 26 migrations and zero post-target rows.'
            : 'PITR restored catalog SHA-256, migration count, or post-target boundary check failed.',
          {
            pitr_endpoint: pitrDsn.fingerprint,
            migration_count: lines.length,
            catalog_sha256: catalogSha,
            expected_catalog_sha256: expectedCatalogSha,
            post_target_audit_rows: postRows,
          }
        ));
      }
    } catch (err) {
      criteria.push(makeCriterionResult('E4-03', 'FAIL', 'pitr_query_error', err.message));
    }
  }

  // --- E4-04: Real PgBouncer Transaction Pooler Routing & Measured Failover RTO ---
  const bouncerDsn = parseDsnSafe(env.E4_PGBOUNCER_DSN, 'pgbouncer_dsn');
  const bouncerAdminDsn = parseDsnSafe(env.E4_PGBOUNCER_ADMIN_DSN, 'pgbouncer_admin_dsn');
  const bouncerEvidenceFile = String(env.E4_PGBOUNCER_EVIDENCE_JSON || '').trim();
  const maxRtoMs = parsePositiveInt(env.E4_PGBOUNCER_RTO_MAX_MS, DEFAULT_PGBOUNCER_RTO_MAX_MS);
  if (!bouncerDsn.present || !bouncerAdminDsn.present || !bouncerEvidenceFile) {
    criteria.push(makeCriterionResult(
      'E4-04',
      'BLOCKED',
      'missing_e4_pgbouncer_targets',
      'E4_PGBOUNCER_DSN, E4_PGBOUNCER_ADMIN_DSN, and/or E4_PGBOUNCER_EVIDENCE_JSON not configured.'
    ));
  } else if (!bouncerDsn.valid || !bouncerAdminDsn.valid || Number.isNaN(maxRtoMs)) {
    criteria.push(makeCriterionResult('E4-04', 'FAIL', 'invalid_e4_pgbouncer_config', 'Invalid PgBouncer DSN or RTO ceiling.'));
  } else if (bouncerDsn.loopback || bouncerAdminDsn.loopback) {
    criteria.push(makeCriterionResult('E4-04', 'FAIL', 'loopback_pgbouncer_rejected', 'Loopback PgBouncer target cannot satisfy E4.'));
  } else {
    try {
      const bouncerAddrs = await resolveHostAddresses(bouncerDsn.hostname, lookupFn);
      bouncerAddrs.forEach((ip) => dataPlaneAddresses.add(ip));
      const dbsRes = await pgQueryFn(bouncerAdminDsn.raw, 'SHOW DATABASES;');
      const poolsRes = await pgQueryFn(bouncerAdminDsn.raw, 'SHOW POOLS;');
      const clientRes = await pgQueryFn(bouncerDsn.raw, 'SELECT pg_is_in_recovery() AS recovery;');
      const drillJson = JSON.parse(fsReadFn(bouncerEvidenceFile));
      const rerouteMs = Number(drillJson.promotion_to_verified_pgbouncer_write_ms || drillJson.pgbouncer_reroute_rto_ms || NaN);
      const dbRows = dbsRes.rows || [];
      const poolRows = poolsRes.rows || [];
      const activeDb = dbRows.find((row) => row && row.name && row.name !== 'pgbouncer');
      const transactionMode = poolRows.some((row) => String(row.pool_mode || '').toLowerCase() === 'transaction');
      const nonPaused = Boolean(activeDb && Number(activeDb.paused || 0) === 0 && !isLoopbackHost(activeDb.host));
      const writable = Boolean(clientRes.rows && clientRes.rows[0] && clientRes.rows[0].recovery === false);
      const rtoWithinCeiling = Number.isFinite(rerouteMs) && rerouteMs > 0 && rerouteMs <= maxRtoMs;
      const passed = nonPaused && transactionMode && writable && rtoWithinCeiling && drillJson.pgbouncer_reroute_tested === true;
      criteria.push(makeCriterionResult(
        'E4-04',
        passed ? 'PASS' : 'FAIL',
        passed ? 'verified_pgbouncer_failover_reroute' : 'pgbouncer_e4_check_failed',
        passed
          ? 'Verified multi-host PgBouncer transaction pool routing to writable primary within RTO budget.'
          : 'PgBouncer pool_mode, upstream host non-loopback check, writable primary probe, or failover RTO check failed.',
        {
          pgbouncer_endpoint: bouncerDsn.fingerprint,
          pool_mode_transaction: transactionMode,
          upstream_non_paused_non_loopback: nonPaused,
          writable_primary_reached: writable,
          promotion_to_verified_pgbouncer_write_ms: Number.isFinite(rerouteMs) ? rerouteMs : null,
          rto_ceiling_ms: maxRtoMs,
        }
      ));
    } catch (err) {
      criteria.push(makeCriterionResult('E4-04', 'FAIL', 'pgbouncer_query_error', err.message));
    }
  }

  // --- E4-05: Multi-Node Redis Sentinel (>= 3 Distinct Hosts) ---
  const rawSentinels = String(env.E4_REDIS_SENTINEL_ENDPOINTS || '').trim();
  const masterName = String(env.E4_REDIS_MASTER_NAME || 'payesh-master').trim();
  if (!rawSentinels) {
    criteria.push(makeCriterionResult(
      'E4-05',
      'BLOCKED',
      'missing_e4_redis_sentinel_endpoints',
      'E4_REDIS_SENTINEL_ENDPOINTS not configured.'
    ));
  } else {
    const endpoints = rawSentinels.split(',').map((item) => item.trim()).filter(Boolean).map((item, idx) => {
      const parsed = parseDsnSafe(`redis://${item}`, `sentinel_${idx}`);
      return parsed;
    });
    if (endpoints.length < 3 || endpoints.some((ep) => !ep.valid || ep.loopback)) {
      criteria.push(makeCriterionResult(
        'E4-05',
        'FAIL',
        'insufficient_or_loopback_sentinels',
        'E4 requires >= 3 valid non-loopback Redis Sentinel endpoints across distinct hosts.',
        { sentinel_count: endpoints.length }
      ));
    } else {
      try {
        const resolvedPerSentinel = [];
        for (const ep of endpoints) {
          const addrs = await resolveHostAddresses(ep.hostname, lookupFn);
          addrs.forEach((ip) => dataPlaneAddresses.add(ip));
          resolvedPerSentinel.push(addrs[0] || ep.hostname);
        }
        const uniqueSentinelIps = new Set(resolvedPerSentinel);
        if (uniqueSentinelIps.size < 3 || [...uniqueSentinelIps].some(isLoopbackHost)) {
          criteria.push(makeCriterionResult(
            'E4-05',
            'FAIL',
            'co_located_sentinel_hosts_rejected',
            'Sentinel endpoints resolved to fewer than 3 distinct non-loopback host IPs; single-host Sentinel is E3 only.',
            { distinct_sentinel_ips: uniqueSentinelIps.size }
          ));
        } else {
          const reportedMasters = [];
          let quorumCount = 0;
          for (const ep of endpoints) {
            const quorumReply = await redisCommandFn(ep.hostname, ep.port, env.E4_SENTINEL_PASSWORD, ['SENTINEL', 'ckquorum', masterName]);
            if (String(quorumReply || '').toUpperCase().includes('OK')) quorumCount += 1;
            const masterAddr = await redisCommandFn(ep.hostname, ep.port, env.E4_SENTINEL_PASSWORD, ['SENTINEL', 'get-master-addr-by-name', masterName]);
            if (Array.isArray(masterAddr) && masterAddr.length === 2) {
              reportedMasters.push(`${masterAddr[0]}:${masterAddr[1]}`);
            }
          }
          const uniqueMasters = [...new Set(reportedMasters)];
          const agreedMaster = uniqueMasters.length === 1 ? uniqueMasters[0] : '';
          const sepIdx = agreedMaster.lastIndexOf(':');
          const masterHost = sepIdx > 0 ? agreedMaster.slice(0, sepIdx) : '';
          const masterPort = sepIdx > 0 ? Number(agreedMaster.slice(sepIdx + 1)) : 0;
          let roleMaster = false;
          let persistenceOk = false;
          if (masterHost && !isLoopbackHost(masterHost) && masterPort > 0) {
            const roleReply = await redisCommandFn(masterHost, masterPort, env.E4_REDIS_PASSWORD, ['ROLE']);
            const persistenceInfo = await redisCommandFn(masterHost, masterPort, env.E4_REDIS_PASSWORD, ['INFO', 'persistence']);
            roleMaster = Array.isArray(roleReply) && roleReply[0] === 'master';
            persistenceOk = /aof_enabled:1/.test(String(persistenceInfo)) || /rdb_last_bgsave_status:ok/.test(String(persistenceInfo));
          }
          const passed = quorumCount === endpoints.length && Boolean(masterHost) && !isLoopbackHost(masterHost) && roleMaster && persistenceOk;
          criteria.push(makeCriterionResult(
            'E4-05',
            passed ? 'PASS' : 'FAIL',
            passed ? 'verified_multi_host_sentinel_quorum' : 'sentinel_quorum_or_persistence_failed',
            passed
              ? 'Verified >= 3 distinct-host Redis Sentinels in quorum with unanimous writable persistent master.'
              : 'Sentinel quorum, master consensus, non-loopback host requirement, or persistence check failed.',
            {
              sentinel_nodes_checked: endpoints.length,
              distinct_sentinel_hosts: uniqueSentinelIps.size,
              quorum_ok_nodes: quorumCount,
              unanimous_master_fingerprint: masterHost ? `${hostFingerprint(masterHost)}:${masterPort}` : null,
              role_master: roleMaster,
              persistence_verified: persistenceOk,
            }
          ));
        }
      } catch (err) {
        criteria.push(makeCriterionResult('E4-05', 'FAIL', 'sentinel_probe_error', err.message));
      }
    }
  }

  // --- E4-06: Independent Observability Plane Failure Domain ---
  const promUrl = parseDsnSafe(env.E4_PROMETHEUS_URL, 'prometheus_url');
  const amUrl = parseDsnSafe(env.E4_ALERTMANAGER_URL, 'alertmanager_url');
  if (!promUrl.present || !amUrl.present) {
    criteria.push(makeCriterionResult(
      'E4-06',
      'BLOCKED',
      'missing_e4_observability_urls',
      'E4_PROMETHEUS_URL and/or E4_ALERTMANAGER_URL not configured.'
    ));
  } else if (!promUrl.valid || !amUrl.valid) {
    criteria.push(makeCriterionResult('E4-06', 'FAIL', 'invalid_observability_urls', 'Invalid Prometheus or Alertmanager URL.'));
  } else if (promUrl.loopback || amUrl.loopback) {
    criteria.push(makeCriterionResult('E4-06', 'FAIL', 'loopback_observability_plane_rejected', 'Loopback observability plane is not an independent failure domain.'));
  } else {
    try {
      const promAddrs = await resolveHostAddresses(promUrl.hostname, lookupFn);
      const amAddrs = await resolveHostAddresses(amUrl.hostname, lookupFn);
      const sharesDataPlane = hasOverlappingAddress(promAddrs, dataPlaneAddresses)
        || hasOverlappingAddress(amAddrs, dataPlaneAddresses);
      if (promAddrs.some(isLoopbackHost) || amAddrs.some(isLoopbackHost) || sharesDataPlane) {
        criteria.push(makeCriterionResult(
          'E4-06',
          'FAIL',
          'shared_failure_domain_observability_rejected',
          'Prometheus/Alertmanager resolves to loopback or shares host IP with PostgreSQL/PgBouncer/Redis data plane.'
        ));
      } else {
        const rulesResp = await httpGetJsonFn(`${promUrl.raw.replace(/\/$/, '')}/api/v1/rules`, env.E4_OBSERVABILITY_BEARER_TOKEN);
        const amResp = await httpGetJsonFn(`${amUrl.raw.replace(/\/$/, '')}/api/v2/status`, env.E4_OBSERVABILITY_BEARER_TOKEN);
        const groups = (((rulesResp.json || {}).data || {}).groups) || [];
        const ruleNames = [];
        for (const group of groups) {
          for (const rule of (group.rules || [])) {
            if (rule && rule.name) ruleNames.push(rule.name);
          }
        }
        const configOriginal = String((((amResp.json || {}).config || {}).original) || '');
        const hasPlaceholder = /example\.invalid/i.test(configOriginal);
        const passed = rulesResp.statusCode === 200
          && amResp.statusCode === 200
          && ruleNames.includes('RedisDown')
          && ruleNames.includes('SyncQueueDepth')
          && !hasPlaceholder;
        criteria.push(makeCriterionResult(
          'E4-06',
          passed ? 'PASS' : 'FAIL',
          passed ? 'verified_independent_observability_plane' : 'observability_plane_validation_failed',
          passed
            ? 'Verified independent-host Prometheus & Alertmanager plane with canonical rules loaded and non-placeholder routing.'
            : 'Observability HTTP probe, canonical rule set, or Alertmanager placeholder check failed.',
          {
            prometheus_endpoint: promUrl.fingerprint,
            alertmanager_endpoint: amUrl.fingerprint,
            loaded_rule_count: ruleNames.length,
            has_placeholder_receiver: hasPlaceholder,
          }
        ));
      }
    } catch (err) {
      criteria.push(makeCriterionResult('E4-06', 'FAIL', 'observability_http_error', err.message));
    }
  }

  // --- E4-07: Live On-Call Human Acknowledgement -> Runbook -> Recovery Chain ---
  const oncallFile = String(env.E4_ONCALL_INCIDENT_JSON || '').trim();
  const maxMttaMs = parsePositiveInt(env.E4_MTTA_MAX_MS, DEFAULT_MTTA_MAX_MS);
  const maxMttrMs = parsePositiveInt(env.E4_MTTR_MAX_MS, DEFAULT_MTTR_MAX_MS);
  if (!oncallFile) {
    criteria.push(makeCriterionResult(
      'E4-07',
      'BLOCKED',
      'missing_e4_oncall_incident_record',
      'E4_ONCALL_INCIDENT_JSON not configured; live human on-call paging/acknowledgement drill has not been executed.'
    ));
  } else if (Number.isNaN(maxMttaMs) || Number.isNaN(maxMttrMs)) {
    criteria.push(makeCriterionResult('E4-07', 'FAIL', 'invalid_mtta_mttr_thresholds', 'Invalid E4_MTTA_MAX_MS or E4_MTTR_MAX_MS.'));
  } else {
    try {
      const incident = JSON.parse(fsReadFn(oncallFile));
      const firedMs = Date.parse(String(incident.alert_fired_at || ''));
      const ackMs = Date.parse(String(incident.human_acknowledged_at || ''));
      const recoveredMs = Date.parse(String(incident.service_recovered_at || ''));
      const provider = String(incident.paging_provider || '').trim();
      const responder = String(incident.responder_handle || '').trim();
      const runbook = String(incident.runbook_executed || '').trim();
      const syntheticReceiver = /m15-01-alert-receiver|localhost|127\.0\.0\.1|synthetic|mock/i.test(`${provider} ${responder}`);
      const mttaMs = ackMs - firedMs;
      const mttrMs = recoveredMs - firedMs;
      const passed = !syntheticReceiver
        && Boolean(provider && responder && runbook && incident.incident_id)
        && Number.isFinite(firedMs)
        && Number.isFinite(ackMs)
        && Number.isFinite(recoveredMs)
        && mttaMs > 0
        && mttaMs <= maxMttaMs
        && mttrMs >= mttaMs
        && mttrMs <= maxMttrMs;
      criteria.push(makeCriterionResult(
        'E4-07',
        passed ? 'PASS' : 'FAIL',
        passed ? 'verified_human_oncall_ack_recovery_chain' : 'oncall_ack_chain_invalid_or_exceeded_slo',
        passed
          ? 'Verified non-synthetic paging delivery, human responder acknowledgement, runbook execution, and recovery within MTTA/MTTR bounds.'
          : 'On-call acknowledgement record synthetic, incomplete, non-monotonic, or outside MTTA/MTTR ceilings.',
        {
          incident_id: String(incident.incident_id || ''),
          mtta_ms: Number.isFinite(mttaMs) ? mttaMs : null,
          mttr_ms: Number.isFinite(mttrMs) ? mttrMs : null,
          mtta_ceiling_ms: maxMttaMs,
          mttr_ceiling_ms: maxMttrMs,
        }
      ));
    } catch (err) {
      criteria.push(makeCriterionResult('E4-07', 'FAIL', 'oncall_record_read_error', err.message));
    }
  }

  return finalizeReport(startedAt, env, localCapabilities, criteria);
}

function finalizeReport(startedAt, env, localCapabilities, criteria) {
  const completedAt = new Date().toISOString();
  const counts = {
    total: criteria.length,
    pass: criteria.filter((c) => c.status === 'PASS').length,
    fail: criteria.filter((c) => c.status === 'FAIL').length,
    blocked: criteria.filter((c) => c.status === 'BLOCKED').length,
  };
  let overallStatus = 'BLOCKED';
  let exitCode = 2;
  if (counts.fail > 0) {
    overallStatus = 'FAIL';
    exitCode = 1;
  } else if (counts.pass === counts.total && counts.total === 7) {
    overallStatus = 'PASS';
    exitCode = 0;
  }

  let headSha = String(env.GITHUB_SHA || '').trim();
  if (!headSha) {
    try {
      headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (_err) {
      headSha = 'UNKNOWN';
    }
  }

  const reportBody = {
    schema_version: 'm15-01-e4-verification-v1',
    mission_id: 'M15-01',
    evidence_level_target: 'E4',
    started_at: startedAt,
    completed_at: completedAt,
    git_head_sha: headSha,
    overall_status: overallStatus,
    mission_closeout_verdict: overallStatus === 'PASS'
      ? 'E4_OPERATIONAL_CRITERIA_VERIFIED'
      : (overallStatus === 'FAIL' ? 'FAILED WITH EVIDENCE' : 'BLOCKED WITH PROOF'),
    exit_code: exitCode,
    counts,
    local_environment_probe: localCapabilities,
    criteria,
  };
  const canonicalJson = JSON.stringify(reportBody, null, 2);
  const reportSha256 = sha256Hex(canonicalJson);
  return Object.assign({}, reportBody, { report_sha256: reportSha256 });
}

function parseCliArgs(argv) {
  let outputPath = '';
  let requirePass = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg === '--require-pass') {
      requirePass = true;
    }
  }
  return { outputPath, requirePass };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const report = await runE4Verification({ env: process.env });
  const serialized = `${redactText(JSON.stringify(report, null, 2))}\n`;
  if (cli.outputPath) {
    const resolved = path.resolve(cli.outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, { encoding: 'utf8', mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({
    mission_id: report.mission_id,
    git_head_sha: report.git_head_sha,
    overall_status: report.overall_status,
    mission_closeout_verdict: report.mission_closeout_verdict,
    exit_code: report.exit_code,
    counts: report.counts,
    report_sha256: report.report_sha256,
    output_path: cli.outputPath ? path.resolve(cli.outputPath) : null,
  })}\n`);
  const strictRequirePass = cli.requirePass || String(process.env.E4_REQUIRE_PASS || '').trim() === '1';
  if (report.exit_code === 0) {
    return;
  }
  if (report.exit_code === 2 && !strictRequirePass) {
    process.exit(2);
  }
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${redactText(String(err && err.stack ? err.stack : err))}\n`);
    process.exit(1);
  });
}

module.exports = {
  CANONICAL_CATALOG_SHA256,
  CLOSURE_CHECKLIST_SPEC,
  hostFingerprint,
  isLoopbackHost,
  parseDsnSafe,
  runE4Verification,
};
