#!/usr/bin/env node
/* M15-01 current-head E3: real HTTP + PostgreSQL + Redis + Prometheus/Alertmanager.
 * CI-only by design. Uses localhost service containers and the seeded demo world;
 * this is a bounded runtime inventory, never a production/national-capacity claim.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');
const { isValidActorProvinceTenantPolicy } = require('./m15-01-tenant-policy');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXPECTED_METRICS = [
  'payesh_db_up', 'payesh_redis_up', 'payesh_sync_queue_depth',
  'payesh_cache_outbox_backlog_depth', 'payesh_node_heap_used_bytes',
  'payesh_node_rss_bytes', 'payesh_db_query_latency_ms', 'payesh_redis_ping_latency_ms'
];
const PHONE_AUTH_SQL = "SELECT id, role, school_id, national_id, active, full_name, phone FROM users WHERE right(regexp_replace(phone, $2, '', 'g'), 10) = $1 ORDER BY id LIMIT 1";
const PHONE_AUTH_ARGS_PATTERN = '[\\s\\-()]';

function phoneAuthQueryContractMatches(authSource, p11Source, runtimeSql, runtimeArgsPattern) {
  const authText = String(authSource || '').replace(/\s+/g, ' ');
  const p11Text = String(p11Source || '').replace(/\s+/g, ' ');
  const slash = String.fromCharCode(92);
  const escapedQuote = slash + "'";
  const whereCore = 'FROM users WHERE right(regexp_replace(phone, $2, '
    + escapedQuote + escapedQuote + ', ' + escapedQuote + 'g' + escapedQuote
    + '), 10) = $1';
  const selectLiteral = "'SELECT id, role, school_id, national_id, active, full_name, phone '";
  const authWhereLiteral = "'" + whereCore + " '";
  const authOrderLiteral = "'ORDER BY id LIMIT 1'";
  const p11WhereOrderLiteral = "'" + whereCore + " ORDER BY id LIMIT 1'";
  const authStart = authText.indexOf('async function userByPhone(phone)');
  const authEnd = authText.indexOf('/* ── endpoints', authStart);
  const authBlock = authStart >= 0 && authEnd > authStart ? authText.slice(authStart, authEnd) : '';
  const p11Start = p11Text.indexOf('const AUTH_SQL =');
  const p11End = p11Text.indexOf('const AUTH_ARGS', p11Start);
  const p11Block = p11Start >= 0 && p11End > p11Start ? p11Text.slice(p11Start, p11End) : '';
  const argsPatternSource = '[' + slash + slash + 's' + slash + slash + '-()]';
  const expectedP11Args = "const AUTH_ARGS = (tail) => [tail, '" + argsPatternSource + "'];";
  const actualP11Args = (p11Text.match(/const AUTH_ARGS = [^;]+;/) || [])[0] || '';
  const expectedSql = (selectLiteral.slice(1, -1) + whereCore.split(escapedQuote).join("'")
    + ' ORDER BY id LIMIT 1').replace(/\\s+/g, ' ').trim();
  const actualSql = String(runtimeSql == null ? PHONE_AUTH_SQL : runtimeSql).replace(/\\s+/g, ' ').trim();
  const actualArgsPattern = String(runtimeArgsPattern == null ? PHONE_AUTH_ARGS_PATTERN : runtimeArgsPattern);
  const expectedArgsPattern = '[' + slash + 's' + slash + '-()]';
  return authBlock.includes([selectLiteral, authWhereLiteral, authOrderLiteral].join(' + '))
    && p11Block.includes([selectLiteral, p11WhereOrderLiteral].join(' + '))
    && authBlock.includes("[tail, '" + argsPatternSource + "']")
    && actualP11Args === expectedP11Args
    && actualSql === expectedSql
    && actualArgsPattern === expectedArgsPattern;
}

function counterDeltaMatches(before, after, requests) {
  return Number.isFinite(Number(before)) && Number.isFinite(Number(after))
    && Number.isFinite(Number(requests)) && Number(after) - Number(before) === Number(requests);
}

function parseLabels(text) {
  const labels = {};
  const re = /([A-Za-z_][A-Za-z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    labels[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return labels;
}

function parseMetricText(text) {
  const rows = [];
  const lineRe = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|NaN|[+-]?Inf)(?:\s+\d+)?$/;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const m = lineRe.exec(line.trim());
    if (!m) continue;
    rows.push({ name: m[1], labels: parseLabels(m[2] || ''), value: Number(m[3]) });
  }
  return rows;
}

function metricValue(rows, name, labels) {
  labels = labels || {};
  const row = (rows || []).find((x) => x.name === name
    && Object.keys(labels).every((key) => x.labels[key] === String(labels[key])));
  return row ? row.value : null;
}

function percentile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(Number(q) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeSamples(samples, elapsedMs) {
  const values = samples.map((x) => x.latency_ms);
  const requests = samples.length;
  const successes = samples.filter((x) => x.status >= 200 && x.status < 300).length;
  const seconds = Math.max(Number(elapsedMs) / 1000, 0.001);
  return {
    requests,
    successes,
    failures: requests - successes,
    duration_ms: Number(elapsedMs),
    rps: Number((successes / seconds).toFixed(3)),
    latency_ms: {
      p50: Number(percentile(values, 0.50)?.toFixed(3) || 0),
      p95: Number(percentile(values, 0.95)?.toFixed(3) || 0),
      p99: Number(percentile(values, 0.99)?.toFixed(3) || 0),
      max: Number(Math.max(...values, 0).toFixed(3))
    },
    status_counts: samples.reduce((acc, x) => {
      const key = String(x.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  };
}

function parseLocalUrl(raw, label, protocols, ports) {
  let u;
  try { u = new URL(String(raw || '')); }
  catch (_) { throw new Error(label + '_url_invalid'); }
  const local = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  if (!local.has(u.hostname) || !protocols.includes(u.protocol) || u.username || u.password
      || (ports && !ports.includes(Number(u.port || (u.protocol === 'https:' ? 443 : 80))))) {
    throw new Error(label + '_target_not_isolated_loopback');
  }
  if (u.search || u.hash) throw new Error(label + '_url_has_query_or_fragment');
  return u;
}

function assertLocalDsn(raw, label, protocol, port, pathPattern) {
  let u;
  try { u = new URL(String(raw || '')); }
  catch (_) { throw new Error(label + '_dsn_invalid'); }
  const local = new Set(['127.0.0.1', 'localhost', '[::1]']);
  let databaseOrIndex;
  try { databaseOrIndex = decodeURIComponent(String(u.pathname || '').replace(/^\/+/, '')); }
  catch (_) { throw new Error(label + '_dsn_path_invalid'); }
  if (!local.has(u.hostname) || u.protocol !== protocol || Number(u.port) !== port
      || !databaseOrIndex || (pathPattern && !pathPattern.test(databaseOrIndex))) {
    throw new Error(label + '_dsn_not_isolated_loopback');
  }
  return u;
}

function currentSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

function isBelow(parent, child) {
  const base = path.resolve(parent);
  const target = path.resolve(child);
  return target !== base && target.startsWith(base + path.sep);
}

function validateEnvironment(env, options) {
  options = options || {};
  if (env.GITHUB_ACTIONS !== 'true' || env.M15_RUNTIME_ALLOW_CI !== '1') throw new Error('ci_only_guard_rejected');
  if (env.NODE_ENV === 'production' || env.PAYESH_ENV === 'production' || env.PAYESH_DEV_OTP_BYPASS !== '1') {
    throw new Error('non_production_dev_otp_guard_rejected');
  }
  const metricsToken = String(env.PAYESH_METRICS_TOKEN || '');
  if (metricsToken.length < 32 || /^([a-f0-9])\1+$/.test(metricsToken.toLowerCase())) throw new Error('metrics_token_missing_or_weak');
  const base = parseLocalUrl(env.M15_BASE_URL || 'http://127.0.0.1:3000', 'api', ['http:'], [3000]);
  const prometheus = parseLocalUrl(env.M15_PROMETHEUS_URL || 'http://127.0.0.1:9090', 'prometheus', ['http:'], [9090]);
  const alertmanager = parseLocalUrl(env.M15_ALERTMANAGER_URL || 'http://127.0.0.1:9093', 'alertmanager', ['http:'], [9093]);
  const receiver = parseLocalUrl(env.M15_ALERT_RECEIVER_URL || 'http://127.0.0.1:18080/health', 'alert_receiver', ['http:'], [18080]);
  if (base.pathname !== '/' || prometheus.pathname !== '/' || alertmanager.pathname !== '/' || receiver.pathname !== '/health') {
    throw new Error('runtime_service_url_path_not_allowed');
  }
  const database = assertLocalDsn(env.DATABASE_URL, 'postgres', 'postgres:', 5432, /^payesh_m15_[a-z0-9_]{1,40}$/);
  const redis = assertLocalDsn(env.REDIS_URL, 'redis', 'redis:', 6379, /^0$/);
  if (database.search || database.hash || redis.search || redis.hash) throw new Error('runtime_dsn_query_or_fragment_not_allowed');
  if (!env.M15_METRICS_TOKEN_FILE) throw new Error('metrics_token_file_missing');
  const tokenStat = fs.lstatSync(env.M15_METRICS_TOKEN_FILE);
  if (!tokenStat.isFile() || tokenStat.isSymbolicLink() || (tokenStat.mode & 0o777) !== 0o640) {
    throw new Error('metrics_token_file_must_be_regular_mode_0640');
  }
  const metricsFileGidText = String(env.M15_PROMETHEUS_FILE_GID || '');
  const metricsFileGid = Number(metricsFileGidText);
  if (!/^\d+$/.test(metricsFileGidText) || !Number.isSafeInteger(metricsFileGid)
      || typeof process.getgid !== 'function' || typeof process.getuid !== 'function'
      || tokenStat.uid !== process.getuid() || tokenStat.gid !== metricsFileGid
      || metricsFileGid !== process.getgid()) {
    throw new Error('metrics_token_file_group_contract_invalid');
  }
  const fromFile = fs.readFileSync(env.M15_METRICS_TOKEN_FILE, 'utf8');
  if (fromFile !== metricsToken) throw new Error('metrics_token_file_mismatch');
  const runnerTemp = path.resolve(String(env.RUNNER_TEMP || ''));
  const artifactPath = path.resolve(String(env.M15_ARTIFACT_PATH || path.join(runnerTemp, 'm15-01-runtime-evidence.json')));
  const eventsFile = path.resolve(String(env.M15_ALERT_EVENTS_FILE || ''));
  if (!env.RUNNER_TEMP || !isBelow(runnerTemp, artifactPath) || !isBelow(runnerTemp, eventsFile)
      || artifactPath === eventsFile) throw new Error('runtime_artifacts_must_be_distinct_files_under_runner_temp');
  const runKey = String(env.M15_EVIDENCE_RUN || '');
  if (!/^[a-z0-9]{1,8}$/.test(runKey)) throw new Error('evidence_run_key_invalid');
  const githubRunId = String(env.GITHUB_RUN_ID || '');
  const githubRunAttempt = String(env.GITHUB_RUN_ATTEMPT || '');
  if (!/^\d{1,20}$/.test(githubRunId) || !/^\d{1,8}$/.test(githubRunAttempt)) {
    throw new Error('github_run_identity_invalid');
  }
  const runInstance = runKey + '-' + githubRunId + '-' + githubRunAttempt;
  if (String(env.M15_RUN_INSTANCE || '') !== runInstance) throw new Error('run_instance_identity_mismatch');
  const redisContainer = String(env.M15_REDIS_CONTAINER || '');
  if (redisContainer !== 'm15-redis-' + runInstance) throw new Error('redis_failure_injection_requires_run_owned_container');
  const databaseContainer = String(env.M15_DATABASE_CONTAINER || '');
  if (databaseContainer !== 'm15-postgres-' + runInstance) throw new Error('database_resource_container_not_isolated');
  const apiInstanceId = String(env.PAYESH_INSTANCE_ID || '');
  if (apiInstanceId !== 'm15-e3-api-' + runInstance) throw new Error('api_instance_id_not_isolated');
  const workerIntervalMs = Number(env.PAYESH_WORKER_INTERVAL_MS);
  if (!Number.isFinite(workerIntervalMs) || workerIntervalMs < 60000) throw new Error('worker_interval_too_short_for_queue_evidence_window');
  const apiImage = String(env.M15_API_IMAGE || '');
  if (apiImage !== 'm15-01-runtime:' + runInstance) throw new Error('api_and_load_generator_image_not_isolated');
  const apiEnvFile = path.resolve(String(env.M15_API_ENV_FILE || ''));
  if (!env.M15_API_ENV_FILE || !isBelow(runnerTemp, apiEnvFile)) throw new Error('api_env_file_must_be_under_runner_temp');
  const apiEnvStat = fs.lstatSync(apiEnvFile);
  if (!apiEnvStat.isFile() || apiEnvStat.isSymbolicLink() || (apiEnvStat.mode & 0o777) !== 0o600) {
    throw new Error('api_env_file_must_be_regular_mode_0600');
  }
  const apiEnvContents = fs.readFileSync(apiEnvFile, 'utf8');
  const jwtSecret = String(env.PAYESH_JWT_SECRET || '');
  if (!/^[a-f0-9]{64}$/i.test(jwtSecret)) throw new Error('api_jwt_secret_missing_or_weak');
  for (const line of [
    'TZ=UTC', 'NODE_ENV=test', 'PAYESH_ENV=test', 'PAYESH_DEV_OTP_BYPASS=1',
    'PAYESH_CACHE_DURABLE_INVALIDATION=on', 'PAYESH_METRICS_TOKEN=' + metricsToken,
    'PAYESH_JWT_SECRET=' + jwtSecret, 'DATABASE_URL=' + env.DATABASE_URL,
    'REDIS_URL=' + env.REDIS_URL, 'PAYESH_INSTANCE_ID=' + apiInstanceId,
    'PAYESH_WORKER_INTERVAL_MS=' + workerIntervalMs, 'HOST=0.0.0.0', 'PORT=3000'
  ]) {
    if (!apiEnvContents.split(/\r?\n/).includes(line)) throw new Error('api_env_file_contract_mismatch');
  }
  const apiContainer = String(env.M15_API_CONTAINER || '');
  const apiRestartContainer = String(env.M15_API_RESTART_CONTAINER || '');
  const apiReplayContainer = String(env.M15_API_REPLAY_CONTAINER || '');
  if (apiContainer !== 'm15-api-initial-' + runInstance || apiRestartContainer !== 'm15-api-restart-' + runInstance
      || apiReplayContainer !== 'm15-api-replay-' + runInstance) throw new Error('api_container_names_not_run_isolated');
  const routeSpecFile = path.resolve(String(env.M15_ROUTE_SPEC_FILE || ''));
  const routeResultFile = path.resolve(String(env.M15_ROUTE_RESULT_FILE || ''));
  if (!env.M15_ROUTE_SPEC_FILE || !env.M15_ROUTE_RESULT_FILE
      || !isBelow(runnerTemp, routeSpecFile) || !isBelow(runnerTemp, routeResultFile)
      || routeSpecFile === routeResultFile || routeSpecFile === artifactPath || routeResultFile === artifactPath) {
    throw new Error('route_generator_files_must_be_distinct_and_under_runner_temp');
  }
  const seedPath = options.seedPath || path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(seedPath)) throw new Error('deterministic_demo_seed_missing');
  const head = options.currentSha || currentSha();
  if (!/^[a-f0-9]{40,64}$/i.test(String(head))) throw new Error('source_sha_invalid');
  if (env.GITHUB_SHA && head !== env.GITHUB_SHA) throw new Error('source_sha_mismatch');
  let gitStatus;
  try {
    gitStatus = options.gitStatus == null
      ? execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' })
      : String(options.gitStatus);
  } catch (_) { throw new Error('source_tree_status_unavailable'); }
  if (gitStatus.trim()) throw new Error('source_tree_not_clean');
  return {
    head,
    base,
    prometheus,
    alertmanager,
    receiver,
    artifact_path: artifactPath,
    alert_events_file: eventsFile,
    metrics_file_gid: metricsFileGid,
    metrics_file_mode: (tokenStat.mode & 0o777).toString(8).padStart(4, '0'),
    redis_container: redisContainer,
    database_container: databaseContainer,
    api_instance_id: apiInstanceId,
    api_container: apiContainer,
    api_restart_container: apiRestartContainer,
    api_replay_container: apiReplayContainer,
    api_image: apiImage,
    api_env_file: apiEnvFile,
    route_spec_file: routeSpecFile,
    route_result_file: routeResultFile,
    run_key: runKey,
    run_instance: runInstance,
    worker_interval_ms: workerIntervalMs,
    database_name: database.pathname.slice(1),
    redis_mode: 'ephemeral Docker resource container',
    environment: {
      runner_os: env.RUNNER_OS || 'unknown',
      runner_arch: env.RUNNER_ARCH || 'unknown',
      runner_image_os: env.ImageOS || null,
      runner_image_version: env.ImageVersion || null,
      prometheus_token_file_mode: (tokenStat.mode & 0o777).toString(8).padStart(4, '0'),
      prometheus_token_file_group_id: metricsFileGid,
      host_cpu_model: (os.cpus()[0] && os.cpus()[0].model) || null,
      host_cpu_count: os.cpus().length,
      host_memory_bytes: os.totalmem(),
      node: process.version,
      database_host_class: 'dedicated PostgreSQL Docker container with 0.5 CPU and 1 GiB memory cgroup limits',
      api_host_class: 'dedicated API Docker container with 1 CPU and 2 GiB memory cgroup limits',
      load_generator_host_class: 'separate route-generator Docker container with 0.5 CPU and 512 MiB cgroup limits',
      resource_isolation: 'separate API/load-generator/PostgreSQL containers and cgroups on one ephemeral CI host; not separate physical machines',
      redis_host_class: 'loopback ephemeral Redis container with 0.25 CPU, 256 MiB memory, and 128 PID cgroup limits',
      dataset: 'server/seed.js deterministic demo world',
      source_tree_clean: true,
      isolated_run_instance: runInstance,
      app_worker_interval_ms: workerIntervalMs,
      scope: 'isolated GitHub Actions E3 integration; not production, not E4, and not national-scale capacity'
    }
  };
}

async function fetchText(url, options, timeoutMs) {
  const response = await fetch(url, Object.assign({}, options || {}, {
    signal: AbortSignal.timeout(timeoutMs || 15000)
  }));
  const text = await response.text();
  return { response, text };
}

async function getMetrics(base, token) {
  const result = await fetchText(new URL('/metrics', base), {
    headers: token ? { authorization: 'Bearer ' + token } : {}
  });
  return result;
}

async function waitFor(condition, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    try {
      last = await condition();
      if (last) return last;
    } catch (e) { last = e && e.message; }
    await sleep(1000);
  }
  throw new Error(label + '_timeout' + (last ? ':' + String(last).slice(0, 100) : ''));
}

async function prometheusQuery(promUrl, expression) {
  const u = new URL('/api/v1/query', promUrl);
  u.searchParams.set('query', expression);
  const { response, text } = await fetchText(u, {}, 10000);
  if (!response.ok) throw new Error('prometheus_query_http_' + response.status);
  const json = JSON.parse(text);
  if (json.status !== 'success' || !json.data || !Array.isArray(json.data.result)) throw new Error('prometheus_query_invalid_response');
  return json.data.result;
}

async function prometheusApi(promUrl, endpoint) {
  const { response, text } = await fetchText(new URL(endpoint, promUrl), {}, 10000);
  if (!response.ok) throw new Error('prometheus_api_http_' + response.status);
  const json = JSON.parse(text);
  if (json.status !== 'success' || !json.data) throw new Error('prometheus_api_invalid_response');
  return json.data;
}

function readAlertEvents(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try { rows.push(JSON.parse(line)); } catch (_) { /* ignore an incomplete trailing write */ }
  }
  return rows;
}

const REDIS_RESOURCE_LIMIT = Object.freeze({ nano_cpus: 250000000, memory_bytes: 268435456, pids_limit: 128 });

function inspectRedisContainer(name, runInstance) {
  const raw = execFileSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 10000 });
  const info = JSON.parse(raw)[0];
  const ports = info && info.NetworkSettings && info.NetworkSettings.Ports && info.NetworkSettings.Ports['6379/tcp'];
  const hostConfig = info && info.HostConfig;
  const labels = info && info.Config && info.Config.Labels;
  if (!info || !/^redis:8(?:[.-]|$)/.test(String(info.Config && info.Config.Image || '')) || !info.State || !info.State.Running
      || !labels || String(labels[RUN_LABEL_KEY] || '') !== String(runInstance || '')
      || !Array.isArray(ports) || !ports.some((p) => p.HostIp === '127.0.0.1' && Number(p.HostPort) === 6379)
      || !hostConfig || Number(hostConfig.NanoCpus) !== REDIS_RESOURCE_LIMIT.nano_cpus
      || Number(hostConfig.Memory) !== REDIS_RESOURCE_LIMIT.memory_bytes
      || Number(hostConfig.PidsLimit) !== REDIS_RESOURCE_LIMIT.pids_limit) {
    throw new Error('redis_failure_injection_target_not_expected_run_owned_ephemeral_container');
  }
  return {
    image: info.Config.Image,
    host_binding: '127.0.0.1:6379',
    cpu_cores: Number(hostConfig.NanoCpus) / 1000000000,
    memory_bytes: Number(hostConfig.Memory),
    pids_limit: Number(hostConfig.PidsLimit),
    limits_verified_by_docker_inspect: true
  };
}

function flattenPlan(node, out) {
  if (!node) return out;
  out.push({
    node_type: node['Node Type'] || null,
    relation: node['Relation Name'] || null,
    index_name: node['Index Name'] || null,
    actual_rows: node['Actual Rows'] == null ? null : Number(node['Actual Rows']),
    actual_total_time_ms: node['Actual Total Time'] == null ? null : Number(node['Actual Total Time']),
    shared_hit_blocks: node['Shared Hit Blocks'] == null ? null : Number(node['Shared Hit Blocks']),
    shared_read_blocks: node['Shared Read Blocks'] == null ? null : Number(node['Shared Read Blocks'])
  });
  for (const child of node.Plans || []) flattenPlan(child, out);
  return out;
}

async function warmRoute(base, cookie, route) {
  const url = new URL(route.path, base);
  const headers = { accept: 'application/json', cookie };
  for (let i = 0; i < 3; i++) {
    const { response } = await fetchText(url, { headers }, 15000);
    if (response.status < 200 || response.status >= 300) throw new Error(route.name + '_warmup_http_' + response.status);
  }
}

function containerSummary(name) {
  const template = '{{.State.Running}}|{{.State.ExitCode}}|{{.State.Pid}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.Config.User}}|{{index .Config.Labels "io.payesh.m15-01.run"}}';
  const output = execFileSync('docker', ['inspect', '--format=' + template, name], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
  }).trim();
  const fields = output.split('|');
  if (fields.length !== 10) throw new Error('docker_container_inspect_invalid:' + name);
  return {
    name,
    running: fields[0] === 'true',
    exit_code: Number(fields[1]),
    host_pid: Number(fields[2]),
    nano_cpus: Number(fields[3]),
    memory_bytes: Number(fields[4]),
    pids_limit: Number(fields[5]),
    network_mode: fields[6],
    image: fields[7],
    user: fields[8],
    run_instance: fields[9] === '<no value>' ? '' : fields[9]
  };
}

function resourceLimitsMatch(info, expected) {
  return !!info && Number(info.nano_cpus) === Number(expected.nano_cpus)
    && Number(info.memory_bytes) === Number(expected.memory_bytes)
    && Number(info.pids_limit) === Number(expected.pids_limit)
    && (!expected.network_mode || info.network_mode === expected.network_mode);
}

function assertResourceLimits(info, expected, label) {
  if (!resourceLimitsMatch(info, expected)) throw new Error('container_resource_limit_mismatch:' + label);
}

function containerExists(name) {
  try {
    execFileSync('docker', ['inspect', '--format={{.Id}}', name], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
    });
    return true;
  } catch (_) { return false; }
}

const RUN_LABEL_KEY = 'io.payesh.m15-01.run';
function containerOwnedByRun(name, runInstance) {
  if (!runInstance) return false;
  try {
    const format = '{{index .Config.Labels "' + RUN_LABEL_KEY + '"}}';
    const owner = execFileSync('docker', ['inspect', '--format=' + format, name], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000
    }).trim();
    return owner === String(runInstance);
  } catch (_) { return false; }
}

const API_RESOURCE_LIMIT = Object.freeze({ nano_cpus: 1000000000, memory_bytes: 2147483648, pids_limit: 256, network_mode: 'host' });
const LOAD_RESOURCE_LIMIT = Object.freeze({ nano_cpus: 500000000, memory_bytes: 536870912, pids_limit: 64, network_mode: 'host' });
const DB_RESOURCE_LIMIT = Object.freeze({ nano_cpus: 500000000, memory_bytes: 1073741824, pids_limit: 128 });

function startApiContainer(cfg, name, overrides, runtimeState) {
  if (containerExists(name)) throw new Error('api_container_name_already_exists:' + name);
  const args = ['run', '--detach', '--name', name, '--label', RUN_LABEL_KEY + '=' + cfg.run_instance,
    '--network', 'host', '--cpus=1', '--memory=2g', '--pids-limit=256', '--env-file', cfg.api_env_file];
  for (const [key, value] of Object.entries(overrides || {})) args.push('--env', key + '=' + String(value));
  args.push(cfg.api_image);
  execFileSync('docker', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  runtimeState.apiContainers.add(name);
  const info = containerSummary(name);
  if (!info.running || info.host_pid <= 0 || info.user !== 'node' || info.run_instance !== cfg.run_instance) {
    throw new Error('api_container_not_running_nonroot_or_run_owned:' + name);
  }
  assertResourceLimits(info, API_RESOURCE_LIMIT, name);
  return info;
}

async function waitForApiReady(name, base, timeoutMs) {
  const end = Date.now() + (timeoutMs || 120000);
  let lastStatus = null;
  while (Date.now() < end) {
    const state = containerSummary(name);
    if (!state.running) throw new Error('api_container_exited_before_readiness:' + state.exit_code);
    try {
      const { response, text } = await fetchText(new URL('/api/readiness', base), {}, 5000);
      lastStatus = response.status;
      if (response.status === 200) {
        const body = JSON.parse(text);
        if (body.db && body.db.driver === 'postgres' && body.db.alive === true
            && body.redis && body.redis.driver === 'redis' && body.redis.alive === true
            && body.redis.live === true && body.draining === false) {
          const health = await fetchText(new URL('/api/health', base), {}, 5000);
          if (!health.response.ok) throw new Error('api_health_not_ready:' + health.response.status);
          const healthBody = JSON.parse(health.text);
          if (!healthBody.worker || healthBody.worker.active !== true) throw new Error('api_worker_timer_not_active');
          return {
            container: state,
            readiness: { status: response.status, database_driver: body.db.driver, redis_driver: body.redis.driver },
            health: {
              status: health.response.status,
              worker_active: healthBody.worker.active === true,
              worker_last_tick_at: healthBody.worker.lastTickAt || null,
              worker_last_tick_age_ms: Number(healthBody.worker.lastTickAgeMs || 0),
              pid: Number(healthBody.pid || 0)
            }
          };
        }
      }
    } catch (error) {
      lastStatus = error && error.message || 'request_failed';
      if (String(lastStatus).startsWith('api_health_not_ready') || String(lastStatus).startsWith('api_worker_timer')) throw error;
    }
    await sleep(500);
  }
  throw new Error('api_readiness_timeout:' + String(lastStatus || 'no_response').slice(0, 60));
}

async function bootApi(cfg, name, base, runtimeState, overrides) {
  const container = startApiContainer(cfg, name, overrides, runtimeState);
  const ready = await waitForApiReady(name, base, 120000);
  return { container, readiness: ready.readiness, health: ready.health };
}

function measureRouteInContainer(cfg, route, cookie, seconds, concurrency, index, runtimeState) {
  const name = 'm15-load-' + cfg.run_instance + '-' + index;
  if (containerExists(name)) throw new Error('route_generator_container_name_already_exists:' + name);
  const specPath = cfg.route_spec_file;
  const resultPath = cfg.route_result_file;
  const spec = {
    base_url: cfg.base.origin,
    cookie,
    route: { path: route.path, template: route.template },
    seconds,
    concurrency
  };
  fs.writeFileSync(specPath, JSON.stringify(spec) + '\n', { mode: 0o600 });
  fs.chmodSync(specPath, 0o600);
  fs.writeFileSync(resultPath, '', { mode: 0o600 });
  fs.chmodSync(resultPath, 0o600);
  runtimeState.loadContainers.add(name);
  try {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
    const args = [
      'run', '--name', name, '--label', RUN_LABEL_KEY + '=' + cfg.run_instance,
      '--network', 'host', '--cpus=0.5', '--memory=512m', '--pids-limit=64',
      '--read-only', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m', '--user=' + uid + ':' + gid,
      '--mount=type=bind,source=' + specPath + ',target=/run/m15/spec.json,readonly',
      '--mount=type=bind,source=' + resultPath + ',target=/run/m15/result.json',
      cfg.api_image, 'node', 'tools/m15-01-route-load.js'
    ];
    execFileSync('docker', args, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: (seconds + 45) * 1000, maxBuffer: 1024 * 1024
    });
    const info = containerSummary(name);
    assertResourceLimits(info, LOAD_RESOURCE_LIMIT, name);
    if (info.run_instance !== cfg.run_instance) throw new Error('route_generator_container_run_ownership_mismatch');
    if (info.user !== uid + ':' + gid) throw new Error('route_generator_user_identity_mismatch');
    if (info.running || info.exit_code !== 0) throw new Error('route_generator_container_failed:' + info.exit_code);
    const raw = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    if (raw.route_template !== route.template || Number(raw.failures) !== 0 || Number(raw.requests) < 1) {
      throw new Error('route_generator_result_invalid:' + route.template);
    }
    execFileSync('docker', ['rm', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    runtimeState.loadContainers.delete(name);
    return {
      route_template: raw.route_template,
      path: route.path,
      requests: Number(raw.requests),
      successes: Number(raw.successes),
      failures: Number(raw.failures),
      duration_ms: Number(raw.elapsed_ms),
      rps: Number(raw.requests_per_second),
      latency_ms: raw.latency_ms,
      concurrency: Number(raw.concurrency),
      bytes_total: Number(raw.bytes_total),
      status_counts: raw.status_counts,
      resource_limits: {
        user: info.user,
        cpu_cores: info.nano_cpus / 1000000000,
        memory_bytes: info.memory_bytes,
        pids_limit: info.pids_limit,
        network_mode: info.network_mode,
        container_exit_code: info.exit_code,
        limits_verified_by_docker_inspect: true
      },
      container_name: name
    };
  } finally {
    if (containerExists(name)) {
      if (!containerOwnedByRun(name, cfg.run_instance)) {
        throw new Error('route_generator_container_cleanup_ownership_mismatch');
      }
      try { execFileSync('docker', ['rm', '-f', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }); } catch (_) {}
    }
    runtimeState.loadContainers.delete(name);
    try { fs.rmSync(specPath, { force: true }); } catch (_) {}
    try { fs.rmSync(resultPath, { force: true }); } catch (_) {}
  }
}

async function testRouteBoundaries(base, cookie, report) {
  const unauthenticated = await fetchText(new URL('/api/auth/me', base), { headers: { accept: 'application/json' } }, 10000);
  if (unauthenticated.response.status !== 401) throw new Error('unauthenticated_route_boundary_http_' + unauthenticated.response.status);
  const missingRoute = await fetchText(new URL('/api/v1/m15-evidence-no-such-route', base), { headers: { accept: 'application/json', cookie } }, 10000);
  if (missingRoute.response.status !== 404) throw new Error('unknown_api_route_boundary_http_' + missingRoute.response.status);
  const futurePull = await fetchText(new URL('/api/v1/pull?since=2099-01-01T00%3A00%3A00.000Z', base), {
    headers: { accept: 'application/json', cookie }
  }, 15000);
  if (futurePull.response.status < 200 || futurePull.response.status >= 300) {
    throw new Error('future_cursor_pull_boundary_http_' + futurePull.response.status);
  }
  report.route_boundaries = {
    unauthenticated_auth_me_status: unauthenticated.response.status,
    unknown_api_route_status: missingRoute.response.status,
    future_cursor_pull_status: futurePull.response.status,
    future_cursor_pull_body_bytes: Buffer.byteLength(futurePull.text),
    cookie_value_recorded: false
  };
}

async function verifyMetricsSecurity(cfg, token, report) {
  const denied = await getMetrics(cfg.base, '');
  if (denied.response.status !== 403) throw new Error('metrics_unauthorized_status_' + denied.response.status);
  const authorized = await getMetrics(cfg.base, token);
  if (!authorized.response.ok) throw new Error('metrics_authorized_http_' + authorized.response.status);
  const rows = parseMetricText(authorized.text);
  const missing = EXPECTED_METRICS.filter((name) => metricValue(rows, name, {}) == null);
  if (missing.length) throw new Error('metrics_expected_series_missing:' + missing.join(','));
  report.metrics_security = {
    unauthenticated_status: denied.response.status,
    bearer_status: authorized.response.status,
    expected_series_present: EXPECTED_METRICS,
    token_file_mode: cfg.metrics_file_mode,
    token_file_group_id: cfg.metrics_file_gid,
    protected_group_read_for_prometheus: true,
    sensitive_values_recorded: false
  };
}

async function findDatabaseManagerPrincipal(pool) {
  const result = await pool.query(`SELECT id, role, school_id, national_id, active, full_name, phone
    FROM users
    WHERE role = 'manager' AND active IS TRUE AND phone IS NOT NULL AND national_id IS NOT NULL
    ORDER BY id LIMIT 1;`);
  if (!result.rows.length) throw new Error('seeded_manager_principal_missing_from_current_schema');
  return result.rows[0];
}

function assertManagerPrincipalSchoolInSeed(principal, seedPath) {
  if (!principal || principal.role !== 'manager' || !Number.isSafeInteger(Number(principal.school_id))
      || Number(principal.school_id) < 1) throw new Error('seeded_manager_principal_scope_invalid');
  let store;
  try { store = JSON.parse(fs.readFileSync(seedPath || path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8')); }
  catch (_) { throw new Error('runtime_store_seed_invalid'); }
  const school = Array.isArray(store.schools)
    ? store.schools.find((entry) => entry && Number(entry.id) === Number(principal.school_id))
    : null;
  if (!school) throw new Error('seeded_manager_school_missing_from_runtime_store');
  return { role: 'manager', school_id: Number(principal.school_id), runtime_store_school_found: true };
}

function assertManagerPrincipalProvinceScope(scope, principal) {
  const schoolId = Number(principal && principal.school_id);
  const scopeSchoolId = Number(scope && scope.school_id);
  const provinceId = Number(scope && scope.province_id);
  const provinceCode = String(scope && scope.province_code || '');
  if (!principal || principal.role !== 'manager' || !Number.isSafeInteger(schoolId) || schoolId < 1
      || !scope || scopeSchoolId !== schoolId || !Number.isSafeInteger(provinceId) || provinceId < 1
      || !/^\d{2}$/.test(provinceCode)
      || !isValidActorProvinceTenantPolicy(scope, { school_id: schoolId, province_code: provinceCode })) {
    throw new Error('seeded_manager_province_scope_invalid');
  }
  return { province_scope_resolved: true, tenant_policy_present: true, tenant_policy_valid: true };
}

async function verifyManagerPrincipalProvinceScope(pool, principal) {
  if (!principal || principal.role !== 'manager' || !Number.isSafeInteger(Number(principal.school_id))
      || Number(principal.school_id) < 1) throw new Error('seeded_manager_province_scope_invalid');
  const result = await pool.query(
    `SELECT s.id AS school_id, s.province_id, p.code AS province_code,
            (tp.province IS NOT NULL) AS tenant_policy_present,
            tp.province AS tenant_policy_province, tp.school AS tenant_policy_school,
            tp.allowed_scope AS tenant_policy_allowed_scope, tp.version AS tenant_policy_version
       FROM schools AS s
       LEFT JOIN provinces AS p ON p.id = s.province_id
       LEFT JOIN LATERAL (
         SELECT province, school, allowed_scope, version
           FROM tenant_policy
          WHERE province = p.code AND (school = s.id::text OR school = '*')
          ORDER BY CASE WHEN school = s.id::text THEN 0 ELSE 1 END
          LIMIT 1
       ) AS tp ON TRUE
      WHERE s.id = $1;`,
    [Number(principal.school_id)]);
  if (!result.rows || result.rows.length !== 1) throw new Error('seeded_manager_province_scope_invalid');
  return assertManagerPrincipalProvinceScope(result.rows[0], principal);
}

function jalaliMonthForIsoDate(rawDate) {
  const isoDate = String(rawDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error('fixture_attendance_date_invalid');
  const date = new Date(isoDate + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error('fixture_attendance_date_invalid');
  }
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'UTC', year: 'numeric', month: 'numeric'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type === 'year' || part.type === 'month')
    .map((part) => [part.type, Number(part.value)]));
  if (!Number.isInteger(values.year) || !Number.isInteger(values.month)
      || values.month < 1 || values.month > 12) throw new Error('fixture_attendance_jalali_month_invalid');
  return { year: values.year, month: values.month };
}

function assertAttendanceReportMatchesPrincipal(status, body, principal, expectedMonth) {
  if (Number(status) !== 200 || !body || !Array.isArray(body.schools) || body.schools.length !== 1) {
    throw new Error('attendance_report_fixture_scope_http_or_shape_invalid');
  }
  if (expectedMonth && (Number(body.jy) !== Number(expectedMonth.year)
      || Number(body.jm) !== Number(expectedMonth.month))) {
    throw new Error('attendance_report_fixture_month_mismatch');
  }
  const school = body.schools[0];
  if (Number(school.school_id) !== Number(principal && principal.school_id)) {
    throw new Error('attendance_report_manager_tenant_scope_mismatch');
  }
  const total = Number(school.totals && school.totals.total);
  const students = Number(school.students);
  if (!Number.isFinite(total) || total < 1 || !Number.isFinite(students) || students < 1) {
    throw new Error('attendance_report_fixture_rows_missing');
  }
  return { school_id: Number(school.school_id), attendance_rows: total, students };
}

async function explainPhoneLookup(pool, report, principal) {
  principal = principal || await findDatabaseManagerPrincipal(pool);
  const authSource = fs.readFileSync(path.join(ROOT, 'server', 'auth.js'), 'utf8');
  const p11Source = fs.readFileSync(path.join(ROOT, 'tests', 'p11-phone-auth-live.js'), 'utf8');
  if (!phoneAuthQueryContractMatches(authSource, p11Source, PHONE_AUTH_SQL, PHONE_AUTH_ARGS_PATTERN)) {
    throw new Error('phone_auth_query_contract_changed_review_harness');
  }
  const rawPhone = String(principal.phone);
  const tail = rawPhone.replace(/[\s\-()]/g, '').slice(-10);
  if (tail.length !== 10) throw new Error('seeded_manager_phone_tail_invalid');
  const phoneSql = PHONE_AUTH_SQL;
  const args = [tail, PHONE_AUTH_ARGS_PATTERN];
  const found = await pool.query(phoneSql, args);
  if (!found.rows.length || String(found.rows[0].id) !== String(principal.id)) throw new Error('phone_auth_runtime_lookup_mismatch');

  const planRun = 'm15-e3-plan-' + crypto.randomUUID();
  report.database.synthetic_plan_data_cleanup_marker = planRun;
  const school = await pool.query('SELECT id FROM schools ORDER BY id LIMIT 1');
  if (!school.rows.length) throw new Error('phone_plan_requires_seeded_school');
  const synthetic = await pool.query(`INSERT INTO users
      (school_id, role, full_name, phone, national_id, username, active, created_at, updated_at)
    SELECT $1, 'student', $2 || '_' || n::text,
      $3 || lpad((9000000 + n)::text, 7, '0'), 'M15E3' || lpad(n::text, 5, '0'),
      $2 || '_' || n::text, true, now(), now()
    FROM generate_series(1, 12000) AS n
    ON CONFLICT DO NOTHING;`, [school.rows[0].id, planRun, '0999']);
  if (Number(synthetic.rowCount) < 10000) throw new Error('phone_plan_synthetic_rows_incomplete');
  report.database.synthetic_plan_rows_inserted = Number(synthetic.rowCount);
  report.database.synthetic_plan_data = {
    phone_prefix: '0999',
    national_id_marker_prefix: 'M15E3',
    raw_values_recorded: false
  };
  await pool.query('ANALYZE users');
  const planResult = await pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + phoneSql, args);
  const planRoot = planResult.rows[0]['QUERY PLAN'][0];
  const nodes = flattenPlan(planRoot.Plan, []);
  const indexUsed = nodes.some((node) => node.index_name === 'idx_users_phone_auth');
  const usersSeqScan = nodes.some((node) => node.node_type === 'Seq Scan' && node.relation === 'users');
  report.database.query_plans.phone_auth_lookup = {
    statement_id: 'server/auth.js:userByPhone',
    explain_command: 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) <exact server/auth.js userByPhone SQL>',
    sql: phoneSql,
    sql_sha256: crypto.createHash('sha256').update(phoneSql, 'utf8').digest('hex'),
    sql_matches_runtime_contract: true,
    bind_parameters: ['$1=seeded_manager_phone_tail', '$2=auth_phone_normalization_pattern'],
    bound_values_redacted: true,
    matching_user_found: true,
    executed_against_current_migrated_schema: true,
    additional_synthetic_plan_rows_inserted: Number(synthetic.rowCount || 0),
    plan: nodes,
    index_used: indexUsed,
    users_sequential_scan: usersSeqScan,
    planning_time_ms: Number(planRoot['Planning Time'] || 0),
    execution_time_ms: Number(planRoot['Execution Time'] || 0)
  };
  if (!indexUsed || usersSeqScan) throw new Error('phone_auth_query_plan_not_using_expected_index');
  report.database.synthetic_plan_data_cleanup_marker = planRun;
  return { principal, phoneSql, args, planRun };
}

function cacheWorkerTimerContractMatches(indexSource, workerSource, outboxSource) {
  indexSource = String(indexSource == null ? fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8') : indexSource);
  workerSource = String(workerSource == null ? fs.readFileSync(path.join(ROOT, 'server', 'worker.js'), 'utf8') : workerSource);
  outboxSource = String(outboxSource == null ? fs.readFileSync(path.join(ROOT, 'server', 'outbox.js'), 'utf8') : outboxSource);
  const replayStart = outboxSource.indexOf('async function replayPendingFromPg()');
  const replayEnd = outboxSource.indexOf('async function fetchPendingBatch', replayStart);
  const replicateStart = outboxSource.indexOf('async function fetchReplicateBatch');
  const replicateEnd = outboxSource.indexOf('async function replicateBacklog', replicateStart);
  const timerStart = workerSource.indexOf('function start()');
  const timerEnd = workerSource.indexOf('function stop()', timerStart);
  if ([replayStart, replayEnd, replicateStart, replicateEnd, timerStart, timerEnd].some((n) => n < 0)) return false;
  const replayBlock = outboxSource.slice(replayStart, replayEnd);
  const replicateBlock = outboxSource.slice(replicateStart, replicateEnd);
  const timerBlock = workerSource.slice(timerStart, timerEnd);
  return indexSource.includes('worker.start();')
    && replayBlock.includes("type NOT LIKE 'cache.%'")
    && replicateBlock.includes("type LIKE 'cache.%' AND id > $1")
    && timerBlock.includes('setInterval(')
    && timerBlock.includes('tickReplicate().catch');
}

async function exerciseQueueRetention(outbox, pool, report) {
  const marker = 'm15-e3-queue-retention-' + crypto.randomUUID();
  const staleInstance = marker + '-stale';
  const currentInstance = marker + '-current';
  const probe = {
    status: 'RUNNING',
    evidence: 'live behavioral reproduction in disposable migrated PostgreSQL; not a throughput or capacity measurement',
    synthetic_marker: marker,
    stale_watermark_instance_id: staleInstance,
    current_watermark_instance_id: currentInstance,
    processed_outbox_id: null,
    dlq_row_id: null,
    command: 'runtimeOutbox.reapProcessed(1) with synthetic aged rows and watermarks',
    retention_age_seconds: 1,
    stale_watermark_age_days: 30,
    dlq_row_age_days: 30,
    limitation: 'The live reproduction does not add stale-watermark cleanup or DLQ retention policy; those remain separate product decisions.'
  };
  report.queue_retention_probe = probe;
  const processed = await pool.query(`INSERT INTO server_outbox
      (type, collection, payload, status, retry_count, created_at, processed_at)
    VALUES ('m15.queue_retention_probe', 'm15_retention', jsonb_build_object('origin', $1::text),
      'processed', 0, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
    RETURNING id;`, [marker]);
  if (!processed.rows.length) throw new Error('queue_retention_processed_probe_insert_failed');
  const outboxId = Number(processed.rows[0].id);
  probe.processed_outbox_id = outboxId;
  await pool.query(`INSERT INTO server_outbox_watermark (instance_id, last_id, updated_at)
    VALUES ($1, 0, NOW() - INTERVAL '30 days'), ($2, $3, NOW());`, [staleInstance, currentInstance, outboxId]);
  const dlq = await pool.query(`INSERT INTO server_outbox_dlq
      (outbox_id, type, collection, payload, error_message, retry_count, failed_at)
    VALUES ($1, 'm15.queue_retention_probe', 'm15_retention', jsonb_build_object('origin', $2::text),
      'synthetic retention probe', 5, NOW() - INTERVAL '30 days')
    RETURNING id;`, [outboxId, marker]);
  if (!dlq.rows.length) throw new Error('queue_retention_dlq_probe_insert_failed');
  probe.dlq_row_id = Number(dlq.rows[0].id);

  const deletedWhilePinned = await outbox.reapProcessed(1);
  const pinnedRow = await pool.query('SELECT status FROM server_outbox WHERE id = $1;', [outboxId]);
  if (Number(deletedWhilePinned) !== 0 || pinnedRow.rows.length !== 1 || pinnedRow.rows[0].status !== 'processed') {
    throw new Error('queue_retention_stale_watermark_did_not_pin_processed_row');
  }
  probe.stale_watermark_observation = {
    watermark_last_id: 0,
    processed_row_id: outboxId,
    reaper_rows_deleted: Number(deletedWhilePinned),
    processed_row_retained: true
  };

  await pool.query('UPDATE server_outbox_watermark SET last_id = $2, updated_at = NOW() WHERE instance_id = $1;',
    [staleInstance, outboxId]);
  const deletedAfterAdvance = await outbox.reapProcessed(1);
  const afterAdvance = await pool.query('SELECT id FROM server_outbox WHERE id = $1;', [outboxId]);
  if (Number(deletedAfterAdvance) !== 1 || afterAdvance.rows.length !== 0) {
    throw new Error('queue_retention_reaper_did_not_delete_after_all_watermarks_advanced');
  }
  const dlqAfter = await pool.query('SELECT id FROM server_outbox_dlq WHERE id = $1;', [probe.dlq_row_id]);
  if (dlqAfter.rows.length !== 1) throw new Error('queue_retention_dlq_probe_unexpectedly_removed');
  probe.after_watermark_advance = {
    watermark_last_id: outboxId,
    reaper_rows_deleted: Number(deletedAfterAdvance),
    processed_row_deleted: true
  };
  probe.dlq_retention_observation = {
    failed_at_age_days: 30,
    row_survived_processed_reaper: true,
    cleanup_policy_claimed: false
  };
  probe.status = 'OBSERVED';
  probe.exit_code = 0;
}

async function exerciseOutbox(cfg, pool, outbox, report) {
  const cacheEvents = require('../server/cache-invalidation-events');
  if (!cacheWorkerTimerContractMatches()) throw new Error('cache_worker_timer_replay_contract_changed_review_harness');
  const queueOrigin = 'm15-e3-' + crypto.randomUUID();
  report.queue = {
    test_origin: queueOrigin,
    api_worker_interval_ms: cfg.worker_interval_ms,
    consumer_invocation: 'containerized server/index.js worker.start() timer after process restart; no manual tick',
    timer_path_tested: false,
    process_restart_replay_tested: false,
    cache_boot_replay_excludes_event: true,
    resource_isolation: 'API and load generator are separate Docker cgroups; PostgreSQL is a separate container; all share the ephemeral CI host.'
  };
  const event = await cacheEvents.appendDurable(outbox,
    cacheEvents.collectionChanged('m15_evidence', null, 1, queueOrigin));
  if (!event || !Number.isFinite(Number(event.id))) throw new Error('queue_event_not_created');
  const stored = await pool.query(
    "SELECT status, type, payload->>'origin' AS origin FROM server_outbox WHERE id = $1;",
    [event.id]
  );
  if (stored.rows.length !== 1 || stored.rows[0].status !== 'pending'
      || stored.rows[0].type !== 'cache.collection_changed' || stored.rows[0].origin !== queueOrigin) {
    throw new Error('queue_event_not_durable_pending');
  }
  const pendingMetricsResult = await getMetrics(cfg.base, process.env.PAYESH_METRICS_TOKEN);
  if (!pendingMetricsResult.response.ok) throw new Error('queue_pending_metrics_http_' + pendingMetricsResult.response.status);
  const pendingMetrics = parseMetricText(pendingMetricsResult.text);
  const syncQueueDepth = metricValue(pendingMetrics, 'payesh_sync_queue_depth', {});
  const backlog = metricValue(pendingMetrics, 'payesh_cache_outbox_backlog_depth', {});
  if (backlog == null || backlog < 1) throw new Error('cache_outbox_pending_gauge_not_observed');
  Object.assign(report.queue, {
    event_persisted_pending: true,
    event_id: Number(event.id),
    pending_sync_queue_depth: syncQueueDepth,
    pending_cache_outbox_backlog_depth: backlog,
    initial_api_container: cfg.api_container,
    initial_api_worker_timer_active: report.application.worker_timer_active_on_boot,
    consumer_results: []
  });
  const promBacklogPending = await waitFor(async () => {
    const rows = await prometheusQuery(cfg.prometheus, 'payesh_cache_outbox_backlog_depth');
    return rows.length && Number(rows[0].value[1]) >= 1 ? rows[0] : null;
  }, 90000, 'prometheus_cache_backlog_pending');
  report.prometheus.queue_depth_observed = syncQueueDepth != null;
  report.prometheus.sync_queue_depth_value = syncQueueDepth;
  report.prometheus.queue_backlog_observed_pending = Number(promBacklogPending.value[1]) >= 1;
  report.prometheus.queue_backlog_value = Number(promBacklogPending.value[1]);
  return { origin: queueOrigin, eventId: Number(event.id), replayIds: [] };
}

async function exerciseRestartReplay(cfg, pool, queueRun, report, runtimeState) {
  const beforeStop = await pool.query('SELECT status FROM server_outbox WHERE id = $1;', [queueRun.eventId]);
  if (!beforeStop.rows.length || beforeStop.rows[0].status !== 'pending') throw new Error('queue_event_not_pending_before_process_restart');
  const stopped = stopApiContainer(cfg.api_container, runtimeState);
  if (stopped.exit_code !== 0) throw new Error('initial_api_container_did_not_stop_cleanly');
  const afterStop = await pool.query('SELECT status FROM server_outbox WHERE id = $1;', [queueRun.eventId]);
  if (!afterStop.rows.length || afterStop.rows[0].status !== 'pending') throw new Error('queue_event_not_pending_after_process_restart');

  const restarted = await bootApi(cfg, cfg.api_restart_container, cfg.base, runtimeState, {
    PAYESH_WORKER_INTERVAL_MS: '250'
  });
  if (restarted.container.host_pid === report.application.container_host_pid) throw new Error('api_process_pid_did_not_change_on_restart');
  report.resource_isolation.api_container_runs.push({
    name: restarted.container.name,
    image: restarted.container.image,
    user: restarted.container.user,
    host_pid: restarted.container.host_pid,
    cpu_cores: restarted.container.nano_cpus / 1000000000,
    memory_bytes: restarted.container.memory_bytes,
    pids_limit: restarted.container.pids_limit,
    network_mode: restarted.container.network_mode,
    limits_verified_by_docker_inspect: true
  });
  const reached = await waitFor(async () => {
    const rows = await pool.query('SELECT last_id FROM server_outbox_watermark WHERE instance_id = $1;', [cfg.api_instance_id]);
    return rows.length && Number(rows[0].last_id) >= queueRun.eventId ? Number(rows[0].last_id) : null;
  }, 90000, 'restarted_api_timer_watermark');
  const processed = await pool.query('SELECT status, retry_count FROM server_outbox WHERE id = $1;', [queueRun.eventId]);
  if (!processed.rows.length || processed.rows[0].status !== 'processed') throw new Error('restarted_api_timer_did_not_process_cache_event');
  const liveHealth = await fetchText(new URL('/api/health', cfg.base), {}, 5000);
  if (!liveHealth.response.ok) throw new Error('restarted_api_health_http_' + liveHealth.response.status);
  const liveHealthBody = JSON.parse(liveHealth.text);
  if (!liveHealthBody.worker || liveHealthBody.worker.active !== true) throw new Error('restarted_api_worker_timer_not_active');
  report.queue.restart = {
    prior_container: report.application.container,
    prior_container_exit_code: stopped.exit_code,
    prior_host_pid: report.application.container_host_pid,
    restarted_host_pid: restarted.container.host_pid,
    instance_id_preserved: true,
    worker_interval_ms: 250,
    worker_timer_active: restarted.health.worker_active,
    worker_last_tick_age_ms: Number(liveHealthBody.worker.lastTickAgeMs || 0),
    boot_replay_cache_exclusion_verified: true,
    event_status: processed.rows[0].status,
    event_retry_count: Number(processed.rows[0].retry_count || 0),
    watermark: Number(reached),
    timer_path_processed_event: true
  };
  report.queue.timer_path_tested = true;
  report.queue.process_restart_replay_tested = true;
  report.queue.status_after_restart_timer = processed.rows[0].status;
  report.queue.restart_container = cfg.api_restart_container;
  report.queue.replay_instance_ids = [];
  report.queue.consumer_results.push({ instance_id: cfg.api_instance_id, event_processed: true, watermark: Number(reached) });

  const replayId = 'm15-e3-replay-' + crypto.randomUUID();
  const replayBase = new URL(cfg.base.href);
  replayBase.port = '13001';
  const replay = await bootApi(cfg, cfg.api_replay_container, replayBase, runtimeState, {
    PAYESH_INSTANCE_ID: replayId,
    PAYESH_WORKER_INTERVAL_MS: '250',
    PORT: '13001'
  });
  report.resource_isolation.api_container_runs.push({
    name: replay.container.name,
    image: replay.container.image,
    user: replay.container.user,
    host_pid: replay.container.host_pid,
    cpu_cores: replay.container.nano_cpus / 1000000000,
    memory_bytes: replay.container.memory_bytes,
    pids_limit: replay.container.pids_limit,
    network_mode: replay.container.network_mode,
    limits_verified_by_docker_inspect: true
  });
  const replayWatermark = await waitFor(async () => {
    const rows = await pool.query('SELECT last_id FROM server_outbox_watermark WHERE instance_id = $1;', [replayId]);
    return rows.length && Number(rows[0].last_id) >= queueRun.eventId ? Number(rows[0].last_id) : null;
  }, 90000, 'independent_api_timer_watermark');
  const replayStatus = await pool.query('SELECT status FROM server_outbox WHERE id = $1;', [queueRun.eventId]);
  if (!replayStatus.rows.length || replayStatus.rows[0].status !== 'processed') throw new Error('independent_api_timer_did_not_replay_cache_event');
  report.queue.replay_instance_ids = [replayId];
  report.queue.independent_replay = {
    consumers: 2,
    api_processes: [
      { container: cfg.api_restart_container, host_pid: restarted.container.host_pid, instance_id: cfg.api_instance_id, worker_timer_active: restarted.health.worker_active, watermark: Number(reached) },
      { container: cfg.api_replay_container, host_pid: replay.container.host_pid, instance_id: replayId, worker_timer_active: replay.health.worker_active, watermark: Number(replayWatermark) }
    ],
    all_processed: true,
    watermarks_reached_event_id: Number(reached) >= queueRun.eventId && Number(replayWatermark) >= queueRun.eventId,
    same_persisted_cache_event_observed_by_both: true
  };
  report.queue.consumer_results.push({ instance_id: replayId, event_processed: true, watermark: Number(replayWatermark) });

  const afterMetricsResponse = await getMetrics(cfg.base, process.env.PAYESH_METRICS_TOKEN);
  if (!afterMetricsResponse.response.ok) throw new Error('queue_after_metrics_http_' + afterMetricsResponse.response.status);
  const afterMetrics = parseMetricText(afterMetricsResponse.text);
  report.queue.after_sync_queue_depth = metricValue(afterMetrics, 'payesh_sync_queue_depth', {});
  report.queue.after_cache_outbox_backlog_depth = metricValue(afterMetrics, 'payesh_cache_outbox_backlog_depth', {});
  if (report.queue.after_cache_outbox_backlog_depth !== 0) throw new Error('cache_outbox_backlog_not_drained_after_timer_processing');
  const settled = await waitFor(async () => {
    const rows = await prometheusQuery(cfg.prometheus, 'payesh_cache_outbox_backlog_depth');
    return rows.length && Number(rows[0].value[1]) === 0 ? rows[0] : null;
  }, 90000, 'prometheus_queue_backlog_settled');
  report.prometheus.queue_backlog_settled = Number(settled.value[1]) === 0;
}

async function initializeQueueRuntime(report) {
  const db = require('../server/db');
  const { createOutbox } = require('../server/outbox');
  const info = await db.init();
  if (!info || info.ok !== true || info.driver !== 'postgres' || !db.isPostgres()) {
    throw new Error('queue_runtime_postgres_initialization_failed');
  }
  const store = { outbox: [], outbox_dlq: [] };
  const outbox = createOutbox({ store, db });
  report.queue_runtime = { database_driver: info.driver, separate_from_api_process: true };
  return { db, outbox };
}

function stopApiContainer(name, runtimeState) {
  if (!containerExists(name)) throw new Error('api_container_missing_on_shutdown:' + name);
  if (!containerOwnedByRun(name, runtimeState && runtimeState.runInstance)) {
    throw new Error('api_container_shutdown_ownership_mismatch');
  }
  const before = containerSummary(name);
  if (before.running) {
    execFileSync('docker', ['stop', '--time', '30', name], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000
    });
  }
  const after = containerSummary(name);
  if (after.running || after.exit_code !== 0) throw new Error('api_container_shutdown_not_graceful:' + after.exit_code);
  execFileSync('docker', ['rm', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  runtimeState.apiContainers.delete(name);
  return { exit_code: after.exit_code, host_pid: before.host_pid };
}

async function exerciseRedisAlert(cfg, token, report, runtimeState) {
  const redisMeta = inspectRedisContainer(cfg.redis_container, cfg.run_instance);
  report.redis.ephemeral_container = redisMeta;
  const startAt = Date.now();
  execFileSync('docker', ['stop', '--time', '2', cfg.redis_container], { stdio: 'pipe', timeout: 15000 });
  if (runtimeState) runtimeState.redisStopped = true;
  let stopped = true;
  try {
    const down = await waitFor(async () => {
      const result = await getMetrics(cfg.base, token);
      if (!result.response.ok) return null;
      const value = metricValue(parseMetricText(result.text), 'payesh_redis_up', {});
      return value === 0 ? { observed_at: Date.now(), value } : null;
    }, 45000, 'redis_down_metric');
    report.redis.failure_injection = { container_stopped: true, down_metric: down.value, observed_ms: down.observed_at - startAt };
    const firing = await waitFor(async () => {
      const rows = await prometheusQuery(cfg.prometheus, 'ALERTS{alertname="RedisDown",alertstate="firing"}');
      return rows.length ? rows[0] : null;
    }, 180000, 'prometheus_redis_down_rule_firing');
    report.alertmanager.redis_down_rule = { alertname: 'RedisDown', firing: true, labels: firing.metric || {} };
    const firingDelivery = await waitFor(() => readAlertEvents(cfg.alert_events_file).find((entry) =>
      entry.receiver === 'payesh-webhook' && Array.isArray(entry.alerts)
      && entry.alerts.some((alert) => alert.alertname === 'RedisDown' && alert.status === 'firing')) || null,
    180000, 'alertmanager_redis_down_webhook_delivery');
    report.alertmanager.webhook_delivered = true;
    report.alertmanager.webhook_receiver = firingDelivery.receiver;
    report.alertmanager.webhook_alert_status = 'firing';
    report.alertmanager.webhook_alert_names = firingDelivery.alerts.map((alert) => alert.alertname);
    report.alertmanager.webhook_received_at = firingDelivery.received_at;
  } finally {
    if (!containerOwnedByRun(cfg.redis_container, cfg.run_instance)) {
      throw new Error('redis_restart_ownership_mismatch');
    }
    execFileSync('docker', ['start', cfg.redis_container], { stdio: 'pipe', timeout: 15000 });
    stopped = false;
    if (runtimeState) runtimeState.redisStopped = false;
  }
  if (stopped) throw new Error('redis_recovery_not_attempted');
  const recovered = await waitFor(async () => {
    const result = await getMetrics(cfg.base, token);
    if (!result.response.ok) return null;
    const value = metricValue(parseMetricText(result.text), 'payesh_redis_up', {});
    return value === 1 ? { observed_at: Date.now(), value } : null;
  }, 90000, 'redis_recovery_metric');
  report.redis.recovery = { redis_up: recovered.value, observed_ms: recovered.observed_at - startAt };
  const resolved = await waitFor(async () => {
    const rows = await prometheusQuery(cfg.prometheus, 'ALERTS{alertname="RedisDown",alertstate="firing"}');
    return rows.length === 0 ? true : null;
  }, 90000, 'prometheus_redis_down_rule_resolved');
  report.alertmanager.prometheus_rule_resolved = !!resolved;
  const resolvedDelivery = await waitFor(() => readAlertEvents(cfg.alert_events_file).find((entry) =>
    entry.receiver === 'payesh-webhook' && Array.isArray(entry.alerts)
    && entry.alerts.some((alert) => alert.alertname === 'RedisDown' && alert.status === 'resolved')) || null,
  360000, 'alertmanager_redis_down_resolved_webhook_delivery');
  report.alertmanager.webhook_resolved_delivered = true;
  report.alertmanager.webhook_resolved_received_at = resolvedDelivery.received_at;
  report.alertmanager.delivery_receiver = 'payesh-webhook';
  report.alertmanager.receiver_is_test_only = true;
}

async function run() {
  const tempRoot = process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : '/tmp';
  let reportPath = process.env.M15_ARTIFACT_PATH
    ? path.resolve(process.env.M15_ARTIFACT_PATH)
    : path.join(tempRoot, 'm15-01-runtime-evidence.json');
  const report = {
    schema_version: 4,
    mission: 'M15-01',
    evidence_level: 'E3',
    status: 'RUNNING',
    status_scope: 'this isolated current-head runtime harness only',
    mission_disposition: 'SUBSET_ONLY_NOT_M15_01_CLOSURE',
    command: 'node tools/m15-01-runtime-evidence.js',
    source_sha: null,
    started_at: new Date().toISOString(),
    environment: { runner_os: process.env.RUNNER_OS || os.platform(), runner_arch: process.env.RUNNER_ARCH || os.arch(), node: process.version },
    limitations: [
      'The API, bounded route generator, PostgreSQL, Redis, Prometheus, and Alertmanager run as distinct disposable Docker containers; API/load-generator/PostgreSQL have explicit cgroup CPU and memory limits. They are co-located on one ephemeral GitHub Actions host, not on separate physical machines.',
      'Deterministic seeded demo data plus clearly tagged temporary synthetic phone rows; route RPS is a bounded CI microbenchmark, not production capacity.',
      'Single-host E3 runtime evidence only; it does not establish E4 multi-host resilience or national-scale capacity.',
      'The Alertmanager destination is an isolated CI webhook sink, not an operational on-call/paging destination.',
      'The cache.* event is left pending across a real API container shutdown/restart. Current source excludes cache.* from boot replay, so the restarted server worker timer must process it; a second API container verifies independent watermark replay. No manual tick is invoked.',
      'DR restore/failover is not proven by this harness; it is an independent M15-01 acceptance gate.'
    ]
  };
  try { report.source_sha = currentSha(); } catch (_) {}
  let pool = null;
  let queueRuntimeDb = null;
  let queueOutbox = null;
  let receiverServer = null;
  let exitCode = 0;
  const runtimeState = {
    redisStopped: false,
    runInstance: String(process.env.M15_RUN_INSTANCE || ''),
    redisContainer: String(process.env.M15_REDIS_CONTAINER || ''),
    apiContainers: new Set(),
    loadContainers: new Set()
  };

  try {
    const cfg = validateEnvironment(process.env);
    reportPath = cfg.artifact_path;
    report.source_sha = cfg.head;
    report.environment = Object.assign({}, cfg.environment, {
      platform: os.platform(),
      release: os.release(),
      github_ref: process.env.GITHUB_REF || null,
      github_event_name: process.env.GITHUB_EVENT_NAME || null,
      github_run_id: process.env.GITHUB_RUN_ID || null,
      github_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null
    });
    report.database = { database_name: cfg.database_name, version: null, migrations: null, row_counts: null, query_plans: {} };
    report.redis = { mode: cfg.redis_mode, ping: null, failure_injection: null, recovery: null };
    report.metrics_security = {};
    report.prometheus = { ready: false, target_up: false, route_counter_observed: false, queue_depth_observed: false };
    report.alertmanager = { ready: false, webhook_delivered: false, receiver_is_test_only: true };
    report.routes = [];

    const metricsToken = String(process.env.PAYESH_METRICS_TOKEN);
    receiverServer = await require('./m15-01-alert-receiver').start({ eventsFile: cfg.alert_events_file });
    report.alert_receiver = {
      listener: '0.0.0.0:18080',
      event_path_under_runner_temp: true,
      purpose: 'CI-only webhook route verification; not production paging'
    };

    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
    const pgInfo = await pool.query('SELECT version() AS version, current_database() AS database');
    report.database.version = String(pgInfo.rows[0].version).split(' ').slice(0, 2).join(' ');
    const migrationInfo = await pool.query('SELECT count(*)::int AS count, max(version) AS latest FROM schema_migrations');
    report.database.migrations = { applied: Number(migrationInfo.rows[0].count), latest: String(migrationInfo.rows[0].latest || '') };
    if (report.database.migrations.applied < 26 || report.database.migrations.latest !== '026') throw new Error('current_migration_ledger_incomplete');

    const databaseResources = containerSummary(cfg.database_container);
    if (!databaseResources.running || databaseResources.run_instance !== cfg.run_instance
        || !resourceLimitsMatch(databaseResources, DB_RESOURCE_LIMIT)) {
      throw new Error('database_container_resource_limits_or_run_ownership_not_verified');
    }
    const apiBoot = await bootApi(cfg, cfg.api_container, cfg.base, runtimeState, {});
    report.resource_isolation = {
      mode: 'separate Docker containers and cgroup CPU/memory/PID limits; one shared ephemeral runner host',
      physical_hosts_separate: false,
      database_container: {
        name: databaseResources.name,
        image: databaseResources.image,
        running: databaseResources.running,
        cpu_cores: databaseResources.nano_cpus / 1000000000,
        memory_bytes: databaseResources.memory_bytes,
        pids_limit: databaseResources.pids_limit,
        limits_verified_by_docker_inspect: true
      },
      api_container_runs: [{
        name: apiBoot.container.name,
        image: apiBoot.container.image,
        user: apiBoot.container.user,
        host_pid: apiBoot.container.host_pid,
        cpu_cores: apiBoot.container.nano_cpus / 1000000000,
        memory_bytes: apiBoot.container.memory_bytes,
        pids_limit: apiBoot.container.pids_limit,
        network_mode: apiBoot.container.network_mode,
        limits_verified_by_docker_inspect: true
      }],
      load_generator: {
        image: cfg.api_image,
        cpu_cores: LOAD_RESOURCE_LIMIT.nano_cpus / 1000000000,
        memory_bytes: LOAD_RESOURCE_LIMIT.memory_bytes,
        pids_limit: LOAD_RESOURCE_LIMIT.pids_limit,
        network_mode: LOAD_RESOURCE_LIMIT.network_mode,
        per_route_runs: [],
        limits_verified_by_docker_inspect: true
      }
    };
    report.application = {
      container: apiBoot.container.name,
      container_host_pid: apiBoot.container.host_pid,
      ready_status: apiBoot.readiness.status,
      database_driver: apiBoot.readiness.database_driver,
      redis_driver: apiBoot.readiness.redis_driver,
      worker_interval_ms: cfg.worker_interval_ms,
      worker_timer_active_on_boot: apiBoot.health.worker_active === true,
      worker_timer_started_at: apiBoot.health.worker_last_tick_at,
      worker_last_tick_age_ms_on_boot: apiBoot.health.worker_last_tick_age_ms,
      worker_timer_ticks_not_waited_for: true,
      private_worker_test_hook_used: false
    };
    report.redis.ping = { connected: true, ping: true, driver: apiBoot.readiness.redis_driver, verified_by: '/api/readiness', mode: cfg.redis_mode };

    const queueRuntime = await initializeQueueRuntime(report);
    queueRuntimeDb = queueRuntime.db;
    queueOutbox = queueRuntime.outbox;
    await exerciseQueueRetention(queueOutbox, pool, report);
    await pool.query('ANALYZE users');
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM schools) AS schools,
      (SELECT count(*)::int FROM attendance) AS attendance,
      (SELECT count(*)::int FROM grades) AS grades,
      (SELECT count(*)::int FROM server_outbox) AS outbox`);
    report.database.row_counts_before_synthetic_plan_data = counts.rows[0];

    await verifyMetricsSecurity(cfg, metricsToken, report);
    const initialMetricsResult = await getMetrics(cfg.base, metricsToken);
    const initialMetrics = parseMetricText(initialMetricsResult.text);
    for (const name of ['payesh_db_up', 'payesh_redis_up']) {
      if (metricValue(initialMetrics, name, {}) !== 1) throw new Error(name + '_not_up');
    }
    report.runtime_gauges = Object.fromEntries(EXPECTED_METRICS.map((name) => [name, metricValue(initialMetrics, name, {})]));

    const receiverHealth = await fetchText(cfg.receiver, {}, 5000);
    if (!receiverHealth.response.ok) throw new Error('alert_receiver_not_ready');
    const promReady = await waitFor(async () => {
      const { response } = await fetchText(new URL('/-/ready', cfg.prometheus), {}, 5000);
      return response.ok;
    }, 60000, 'prometheus_ready');
    report.prometheus.ready = !!promReady;
    const promBuild = await prometheusApi(cfg.prometheus, '/api/v1/status/buildinfo');
    report.prometheus.version = String(promBuild.version || 'unknown');
    const alertmanagerReady = await waitFor(async () => {
      const { response } = await fetchText(new URL('/-/ready', cfg.alertmanager), {}, 5000);
      return response.ok;
    }, 60000, 'alertmanager_ready');
    report.alertmanager.ready = !!alertmanagerReady;

    const ruleNames = await waitFor(async () => {
      const data = await prometheusApi(cfg.prometheus, '/api/v1/rules?type=alert');
      const names = [];
      for (const group of data.groups || []) for (const rule of group.rules || []) if (rule.name) names.push(rule.name);
      return names.length ? names : null;
    }, 90000, 'prometheus_alert_rules_loaded');
    report.prometheus.alert_rule_names = ruleNames;
    if (!ruleNames.includes('RedisDown')) throw new Error('prometheus_redis_down_rule_missing');

    const upSeries = await waitFor(async () => {
      const rows = await prometheusQuery(cfg.prometheus, 'up{job="payesh-api"}');
      return rows.length && Number(rows[0].value[1]) === 1 ? rows[0] : null;
    }, 90000, 'prometheus_payesh_target_up');
    report.prometheus.target_up = Number(upSeries.value[1]) === 1;

    const principal = await findDatabaseManagerPrincipal(pool);
    report.database.manager_principal_scope = assertManagerPrincipalSchoolInSeed(principal);
    report.database.manager_principal_province_scope = await verifyManagerPrincipalProvinceScope(pool, principal);
    const latestAttendance = await pool.query('SELECT max(date) AS latest_date FROM attendance WHERE school_id = $1;', [principal.school_id]);
    const fixtureAttendanceDate = latestAttendance.rows[0] && latestAttendance.rows[0].latest_date;
    if (!fixtureAttendanceDate) throw new Error('seeded_manager_attendance_date_missing');
    const reportMonth = jalaliMonthForIsoDate(fixtureAttendanceDate);
    const attendanceRoutePath = '/api/v1/reports/attendance?school_id='
      + encodeURIComponent(String(principal.school_id)) + '&jy=' + reportMonth.year + '&jm=' + reportMonth.month;
    const login = await fetchText(new URL('/api/auth/login', cfg.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ phone: String(principal.phone), code: '0000', national_id: String(principal.national_id) })
    }, 10000);
    if (login.response.status !== 200) throw new Error('staging_only_login_http_' + login.response.status);
    let loginBody;
    try { loginBody = JSON.parse(login.text); } catch (_) { throw new Error('login_response_invalid_json'); }
    if (!loginBody.user || String(loginBody.user.id) !== String(principal.id) || loginBody.user.role !== 'manager') {
      throw new Error('phone_auth_route_identity_mismatch');
    }
    const setCookies = typeof login.response.headers.getSetCookie === 'function'
      ? login.response.headers.getSetCookie() : [login.response.headers.get('set-cookie') || ''];
    const cookie = setCookies.map((x) => String(x).split(';')[0]).find((x) => x.startsWith('payesh_session='));
    if (!cookie) throw new Error('session_cookie_missing');
    const me = await fetchText(new URL('/api/auth/me', cfg.base), { headers: { accept: 'application/json', cookie } }, 10000);
    if (me.response.status !== 200) throw new Error('authenticated_me_http_' + me.response.status);
    const meBody = JSON.parse(me.text);
    if (!meBody.user || String(meBody.user.id) !== String(principal.id)) throw new Error('session_identity_mismatch');
    report.authentication = {
      test_principal_role: 'manager',
      development_otp_bypass: true,
      login_identity_verified: true,
      session_identity_verified: true,
      phone_or_national_id_recorded: false,
      cookie_value_recorded: false
    };

    await testRouteBoundaries(cfg.base, cookie, report);
    const attendanceRoute = { name: 'attendance_report', path: attendanceRoutePath, template: '/api/v1/reports/attendance' };
    const attendancePreflight = await fetchText(new URL(attendanceRoute.path, cfg.base), {
      headers: { accept: 'application/json', cookie }
    }, 15000);
    let attendanceBody;
    try { attendanceBody = JSON.parse(attendancePreflight.text); }
    catch (_) { throw new Error('attendance_report_fixture_response_invalid_json'); }
    report.database.manager_attendance_report = Object.assign({
      http_status: attendancePreflight.response.status,
      jalali_year: reportMonth.year,
      jalali_month: reportMonth.month,
      fixture_date_source: 'max(attendance.date) for the authenticated PostgreSQL manager school'
    }, assertAttendanceReportMatchesPrincipal(attendancePreflight.response.status, attendanceBody, principal, reportMonth));
    const routeSeconds = Math.max(2, Math.min(20, Number(process.env.M15_ROUTE_SECONDS) || 5));
    const concurrency = Math.max(1, Math.min(8, Number(process.env.M15_ROUTE_CONCURRENCY) || 2));
    const routes = [
      { name: 'auth_me', path: '/api/auth/me', template: '/api/auth/me' },
      { name: 'bootstrap', path: '/api/v1/bootstrap', template: '/api/v1/bootstrap' },
      { name: 'pull', path: '/api/v1/pull?since=2020-01-01T00%3A00%3A00.000Z', template: '/api/v1/pull' },
      attendanceRoute,
      { name: 'academic_report', path: '/api/v1/reports/academic', template: '/api/v1/reports/academic' }
    ];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex];
      await warmRoute(cfg.base, cookie, route);
      const beforeResponse = await getMetrics(cfg.base, metricsToken);
      if (!beforeResponse.response.ok) throw new Error(route.name + '_baseline_metrics_http_' + beforeResponse.response.status);
      const beforeMetrics = parseMetricText(beforeResponse.text);
      const before = metricValue(beforeMetrics, 'payesh_http_requests_total', { route: route.template, method: 'GET', code: '200' });
      if (before == null) throw new Error(route.name + '_http_counter_missing_before');
      const result = measureRouteInContainer(cfg, route, cookie, routeSeconds, concurrency, routeIndex, runtimeState);
      const afterResponse = await getMetrics(cfg.base, metricsToken);
      if (!afterResponse.response.ok) throw new Error(route.name + '_after_metrics_http_' + afterResponse.response.status);
      const afterMetrics = parseMetricText(afterResponse.text);
      const after = metricValue(afterMetrics, 'payesh_http_requests_total', { route: route.template, method: 'GET', code: '200' });
      result.server_counter_before = before;
      result.server_counter_after = after;
      result.server_counter_delta = after == null ? null : after - before;
      if (!counterDeltaMatches(before, after, result.successes)) throw new Error(route.name + '_http_counter_delta_mismatch');
      report.resource_isolation.load_generator.per_route_runs.push({
        container_name: result.container_name,
        user: result.resource_limits.user,
        cpu_cores: result.resource_limits.cpu_cores,
        memory_bytes: result.resource_limits.memory_bytes,
        pids_limit: result.resource_limits.pids_limit,
        network_mode: result.resource_limits.network_mode,
        container_exit_code: result.resource_limits.container_exit_code,
        limits_verified_by_docker_inspect: result.resource_limits.limits_verified_by_docker_inspect
      });
      report.routes.push(result);
    }
    report.route_load = {
      duration_seconds_each: routeSeconds,
      concurrency_each: concurrency,
      generator_process: 'separate Docker container with cgroup CPU, memory, and PID limits',
      api_generator_database_resource_separation_verified: true,
      physical_host_shared: true,
      principal: 'seeded manager with isolated development OTP bypass',
      rps_is_ci_microbenchmark_only: true
    };

    const pullRoute = report.routes.find((x) => x.route_template === '/api/v1/pull');
    const targetCounter = 'payesh_http_requests_total{route="/api/v1/pull",method="GET",code="200"}';
    const observedRoute = await waitFor(async () => {
      const rows = await prometheusQuery(cfg.prometheus, targetCounter);
      return rows.length && Number(rows[0].value[1]) >= Number(pullRoute.server_counter_after) ? rows[0] : null;
    }, 90000, 'prometheus_route_counter');
    report.prometheus.route_counter_observed = !!observedRoute;
    report.prometheus.route_counter_value = Number(observedRoute.value[1]);
    report.prometheus.application_counter_value = pullRoute.server_counter_after;

    await explainPhoneLookup(pool, report, principal);
    const queueRun = await exerciseOutbox(cfg, pool, queueOutbox, report);
    await exerciseRedisAlert(cfg, metricsToken, report, runtimeState);
    await exerciseRestartReplay(cfg, pool, queueRun, report, runtimeState);
    queueRun.replayIds = report.queue.replay_instance_ids;

    report.status = 'PASS';
    report.completed_at = new Date().toISOString();
    report.exit_code = 0;
    report.successful_route_runs = report.routes.length;
    report.command_output_summary = {
      route_results: report.routes.map((route) => ({
        route_template: route.route_template,
        requests: route.successes,
        rps: route.rps,
        p50_ms: route.latency_ms.p50,
        p95_ms: route.latency_ms.p95,
        p99_ms: route.latency_ms.p99,
        http_counter_delta: route.server_counter_delta
      })),
      queue: report.queue,
      queue_retention_probe: report.queue_retention_probe,
      redis_alert_firing_and_recovery: {
        redis_down_observed: !!(report.redis.failure_injection && report.redis.failure_injection.down_metric === 0),
        firing_webhook_delivered: report.alertmanager.webhook_delivered,
        redis_recovered: !!(report.redis.recovery && report.redis.recovery.redis_up === 1),
        prometheus_rule_resolved: report.alertmanager.prometheus_rule_resolved,
        resolved_webhook_delivered: report.alertmanager.webhook_resolved_delivered
      }
    };
    report.test_run_ids = { queue_origin: queueRun.origin, replay_instances: queueRun.replayIds };
  } catch (err) {
    exitCode = 1;
    report.status = 'FAIL';
    const rawMessage = String(err && err.message || err || 'unknown');
    const rawCode = err && err.code || rawMessage.split(/[:\s]/)[0] || err && err.name || 'error';
    report.failure = {
      code: redactErrorCode(rawCode, process.env),
      message: redactError(rawMessage, process.env)
    };
    report.completed_at = new Date().toISOString();
    report.exit_code = 1;
  } finally {
    if (runtimeState.redisStopped) {
      try {
        if (!containerOwnedByRun(runtimeState.redisContainer, runtimeState.runInstance)) {
          throw new Error('redis_restart_ownership_mismatch');
        }
        execFileSync('docker', ['start', runtimeState.redisContainer], { stdio: 'pipe', timeout: 15000 });
        runtimeState.redisStopped = false;
        report.cleanup_redis_restarted = true;
      } catch (_) {
        report.cleanup_redis_restart_failed = true;
        exitCode = 1;
        report.status = 'FAIL';
        report.failure = { code: 'cleanup_redis_restart', message: 'ephemeral Redis container could not be restarted after failure injection' };
        report.exit_code = 1;
      }
    }
    const markCleanupFailure = (code) => {
      exitCode = 1;
      report.status = 'FAIL';
      if (!report.failure) report.failure = { code: 'cleanup_' + code, message: 'temporary E3 artifacts could not be cleaned from the ephemeral test environment' };
      report.exit_code = 1;
    };
    report.cleanup = report.cleanup || {};
    report.cleanup.api_containers = [];
    for (const name of Array.from(runtimeState.apiContainers)) {
      try {
        const stopped = stopApiContainer(name, runtimeState);
        report.cleanup.api_containers.push({ name, stopped: true, exit_code: stopped.exit_code });
      } catch (_) {
        report.cleanup.api_containers.push({ name, stopped: false });
        markCleanupFailure('api_container');
        try {
          if (containerExists(name) && containerOwnedByRun(name, runtimeState.runInstance)) {
            execFileSync('docker', ['rm', '-f', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
          }
        } catch (_) {}
        runtimeState.apiContainers.delete(name);
      }
    }
    report.cleanup.load_generator_containers = [];
    for (const name of Array.from(runtimeState.loadContainers)) {
      try {
        if (containerExists(name)) {
          if (!containerOwnedByRun(name, runtimeState.runInstance)) throw new Error('load_generator_cleanup_ownership_mismatch');
          execFileSync('docker', ['rm', '-f', name], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
        }
        report.cleanup.load_generator_containers.push({ name, removed: true });
      } catch (_) {
        report.cleanup.load_generator_containers.push({ name, removed: false });
        markCleanupFailure('load_generator_container');
      }
      runtimeState.loadContainers.delete(name);
    }
    if (pool && report.database && report.database.synthetic_plan_data_cleanup_marker) {
      try {
        const cleaned = await pool.query('DELETE FROM users WHERE full_name LIKE $1 || \'%\';', [report.database.synthetic_plan_data_cleanup_marker]);
        report.database.synthetic_plan_rows_deleted = Number(cleaned.rowCount || 0);
        if (report.database.synthetic_plan_rows_inserted != null
            && report.database.synthetic_plan_rows_deleted !== Number(report.database.synthetic_plan_rows_inserted)) {
          report.cleanup_synthetic_plan_rows = 'row_count_mismatch';
          markCleanupFailure('synthetic_rows');
        }
      } catch (_) {
        report.cleanup_synthetic_plan_rows = 'failed_in_ephemeral_database';
        markCleanupFailure('synthetic_rows');
      }
    }
    if (pool && report.queue && report.queue.test_origin) {
      try {
        const deleted = await pool.query("DELETE FROM server_outbox WHERE payload->>'origin' = $1;", [report.queue.test_origin]);
        const instanceIds = [process.env.PAYESH_INSTANCE_ID].concat(report.queue.replay_instance_ids || []).filter(Boolean);
        const watermarks = instanceIds.length
          ? await pool.query('DELETE FROM server_outbox_watermark WHERE instance_id::text = ANY($1::text[]);', [instanceIds])
          : { rowCount: 0 };
        report.queue.cleanup = { outbox_rows_deleted: Number(deleted.rowCount || 0), worker_watermarks_deleted: Number(watermarks.rowCount || 0) };
      } catch (_) {
        report.cleanup_queue_artifacts = 'failed_in_ephemeral_database';
        markCleanupFailure('queue_rows');
      }
    }
    if (pool && report.queue_retention_probe) {
      try {
        const probe = report.queue_retention_probe;
        const dlq = probe.dlq_row_id != null
          ? await pool.query('DELETE FROM server_outbox_dlq WHERE id = $1;', [probe.dlq_row_id])
          : { rowCount: 0 };
        const outbox = probe.processed_outbox_id != null
          ? await pool.query('DELETE FROM server_outbox WHERE id = $1;', [probe.processed_outbox_id])
          : { rowCount: 0 };
        const watermarks = await pool.query('DELETE FROM server_outbox_watermark WHERE instance_id = ANY($1::text[]);',
          [[probe.stale_watermark_instance_id, probe.current_watermark_instance_id]]);
        probe.cleanup = {
          dlq_rows_deleted: Number(dlq.rowCount || 0),
          processed_outbox_rows_deleted_if_not_already_reaped: Number(outbox.rowCount || 0),
          watermark_rows_deleted: Number(watermarks.rowCount || 0)
        };
      } catch (_) {
        report.cleanup_queue_retention_probe = 'failed_in_ephemeral_database';
        markCleanupFailure('queue_retention_probe');
      }
    }
    if (pool) {
      try { await pool.end(); }
      catch (_) { report.cleanup_database_query_pool = 'close_failed'; markCleanupFailure('database_query_pool'); }
    }
    if (queueRuntimeDb) {
      try { await queueRuntimeDb.close(); }
      catch (_) { report.cleanup_queue_runtime_database = 'close_failed'; markCleanupFailure('queue_runtime_database'); }
    }
    if (receiverServer && receiverServer.listening) {
      try { await new Promise((resolve, reject) => receiverServer.close((error) => error ? reject(error) : resolve())); }
      catch (_) { report.cleanup_alert_receiver = 'close_failed'; markCleanupFailure('alert_receiver'); }
    }
    report.exit_code = exitCode;
    if (!report.completed_at) report.completed_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    } catch (e) {
      console.error('M15 evidence report could not be written: ' + (e && e.message || 'unknown'));
      exitCode = 1;
      report.status = 'FAIL';
      report.exit_code = 1;
    }
    console.log('M15-01 isolated runtime evidence: ' + report.status + ' · SHA=' + (report.source_sha || 'unbound')
      + ' · exit=' + exitCode + (report.failure ? ' · ' + report.failure.code : ''));
    if (report.failure && report.failure.message) {
      console.log('M15_FAILURE_MESSAGE=' + report.failure.message);
    }
    if (report.status === 'PASS') {
      for (const route of report.routes || []) {
        console.log('ROUTE ' + route.route_template + ' requests=' + route.successes + ' rps=' + route.rps
          + ' p50=' + route.latency_ms.p50 + 'ms p95=' + route.latency_ms.p95 + 'ms p99=' + route.latency_ms.p99 + 'ms');
      }
      console.log('QUEUE persisted=' + report.queue.event_persisted_pending + ' timer_processed=' + report.queue.timer_path_tested
        + ' restart_status=' + report.queue.status_after_restart_timer
        + ' replay_consumers=' + report.queue.independent_replay.consumers);
      console.log('QUEUE_RETENTION stale_pin=' + report.queue_retention_probe.stale_watermark_observation.processed_row_retained
        + ' dlq_30d_retained=' + report.queue_retention_probe.dlq_retention_observation.row_survived_processed_reaper
        + ' capacity_claimed=false');
      console.log('ALERT firing_webhook=' + report.alertmanager.webhook_delivered
        + ' resolved_webhook=' + report.alertmanager.webhook_resolved_delivered
        + ' receiver=' + report.alertmanager.webhook_receiver
        + ' recovered=' + (report.redis.recovery && report.redis.recovery.redis_up === 1));
    }
  }
  process.exitCode = exitCode;
}
function redactError(message, env) {
  const { redactText } = require('./m15-01-log-redactor');
  let out = redactText(String(message || 'unknown'), env || {});
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
  out = out.replace(/\bhttps?:\/\/[^\s"'`<>]+/gi, '[REDACTED_URL]');
  // Error-only numeric identifiers and formatted phone numbers can lack field labels.
  out = out.replace(/\+?\d(?:[\d .()/-]*\d){7,}/g, '[REDACTED_NUMERIC_IDENTIFIER]');
  return out.replace(/[\r\n\t ]+/g, ' ').trim().slice(0, 240);
}

function redactErrorCode(value, env) {
  const safe = redactError(String(value || 'error'), env)
    .replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
  return safe || 'error';
}

if (require.main === module) run();

module.exports = {
  PHONE_AUTH_SQL,
  PHONE_AUTH_ARGS_PATTERN,
  parseLabels,
  parseMetricText,
  metricValue,
  percentile,
  summarizeSamples,
  parseLocalUrl,
  assertLocalDsn,
  isBelow,
  counterDeltaMatches,
  phoneAuthQueryContractMatches,
  assertManagerPrincipalSchoolInSeed,
  assertManagerPrincipalProvinceScope,
  verifyManagerPrincipalProvinceScope,
  jalaliMonthForIsoDate,
  assertAttendanceReportMatchesPrincipal,
  resourceLimitsMatch,
  REDIS_RESOURCE_LIMIT,
  cacheWorkerTimerContractMatches,
  redactError,
  redactErrorCode,
  readAlertEvents,
  validateEnvironment
};
