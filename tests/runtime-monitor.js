#!/usr/bin/env node
/* Runtime monitoring regression + health-contract test.
   Run: node tests/runtime-monitor.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRuntimeMonitor } = require('../server/runtime-monitor');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
function test(name, condition, detail) {
  if (condition) { pass += 1; console.log('  ✅ ' + name); }
  else { fail += 1; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
  });
}
function request(port, target) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: target }, (res) => {
      let data = ''; res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { let json; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
  });
}

async function main() {
  console.log('\n▸ Runtime security monitor');
  const findings = [];
  const monitor = createRuntimeMonitor({
    bucketMs: 1000, baselineBuckets: 5, minSamples: 3, sigma: 3,
    sessionTtlMs: 5000, maxSessions: 2,
    onAnomaly: (finding) => findings.push(finding)
  });

  /* Three quiet minute-equivalents form a zero-variance baseline. The fourth
     window spikes above mean + 3σ and must alert exactly once per series. */
  [0, 1000, 2000].forEach((at) => monitor.recordSignal('request_rate', 2, { role: 'teacher', sessionId: 'session-a', at }));
  const spike = monitor.recordSignal('request_rate', 8, { role: 'teacher', sessionId: 'session-a', at: 3000 });
  test('RM-01 rolling baseline detects a >3σ role-rate anomaly', spike.length === 1 && spike[0].metric === 'request_rate' && spike[0].value === 8);
  monitor.recordSignal('request_rate', 8, { role: 'teacher', sessionId: 'session-a', at: 3000 });
  test('RM-02 anomaly is deduplicated within its time bucket', findings.length === 1);

  [0, 1000, 2000].forEach((at) => monitor.recordSignal('auth_error_rate', 1, { role: 'anonymous', at }));
  const authSpike = monitor.recordSignal('auth_error_rate', 7, { role: 'anonymous', sessionId: 'session-b', at: 3000 });
  test('RM-03 authentication-error anomaly is detected', authSpike.length === 1 && authSpike[0].metric === 'auth_error_rate');

  const responseMonitor = createRuntimeMonitor({ bucketMs: 1000, baselineBuckets: 5, minSamples: 3, sigma: 3 });
  [0, 1000, 2000].forEach((at) => responseMonitor.recordRequest({ role: 'manager', status: 200, responseBytes: 100, syncOps: 1, at }));
  for (let i = 0; i < 8; i += 1) responseMonitor.recordRequest({ role: 'manager', status: 403, responseBytes: 5000, syncOps: 20, sessionId: 'session-c', tenantId: '1', at: 3000 });
  const signals = responseMonitor.snapshot(3000).series;
  test('RM-04 request recorder tracks role, auth, response-size, and sync-rate signals',
    signals.some((s) => s.metric === 'request_rate') && signals.some((s) => s.metric === 'auth_error_rate') && signals.some((s) => s.metric === 'response_bytes') && signals.some((s) => s.metric === 'sync_ops_rate'));

  const switches = createRuntimeMonitor({ bucketMs: 1000, baselineBuckets: 5, minSamples: 3, sigma: 3, maxSessions: 2 });
  switches.recordRequest({ role: 'manager', status: 200, sessionId: 'switch-1', tenantId: '1', at: 0 });
  switches.recordRequest({ role: 'manager', status: 200, sessionId: 'switch-1', tenantId: '2', at: 1000 });
  switches.recordRequest({ role: 'manager', status: 200, sessionId: 'switch-1', tenantId: '1', at: 2000 });
  test('RM-05 tenant switching is counted without exposing tenant identifiers', switches.snapshot(2000).series.some((s) => s.metric === 'tenant_switch_rate') && !JSON.stringify(switches.snapshot(2000)).includes('switch-1'));

  monitor.markAttackPatternBlocked('forged_sync', 'session-a', 3100);
  monitor.markAttackPatternBlocked('idor_enumeration', 'session-b', 3200);
  const health = monitor.snapshot(3200);
  test('RM-06 health snapshot contains required bounded security counters', health.anomalies_detected_24h >= 2 && health.suspicious_sessions >= 2 && health.attack_patterns_blocked === 2);
  monitor.recordRequest({ role: 'student', status: 200, sessionId: 'third', tenantId: '1', at: 3300 });
  test('RM-07 session tracker remains bounded', monitor.debugState().sessions <= 2);
  test('RM-08 24-hour anomaly window expires old events', monitor.snapshot(24 * 60 * 60 * 1000 + 4000).anomalies_detected_24h === 0);

  /* HTTP integration: the public health document must include the three
     operational counters, not only the internal Prometheus registry. */
  const seed = path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(seed)) throw new Error('server/data/payesh.json is required; run node server/seed.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-runtime-health-'));
  const port = await freePort();
  fs.copyFileSync(seed, path.join(tmp, 'store.json'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', PAYESH_STORE: path.join(tmp, 'store.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp.json'), PAYESH_AUDIT: path.join(tmp, 'audit.log'), PAYESH_KEY: path.join(tmp, 'jwt.key') }),
    stdio: 'ignore'
  });
  try {
    let live = null;
    for (let i = 0; i < 50; i += 1) { live = await request(port, '/api/health'); if (live.status === 200) break; await sleep(150); }
    test('RM-09 /api/health exposes anomaly, suspicious-session, and attack-block counters', live && live.status === 200 && ['anomalies_detected_24h', 'suspicious_sessions', 'attack_patterns_blocked'].every((key) => Number.isInteger(live.json && live.json[key])));
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\nruntime-monitor: ' + pass + '/' + (pass + fail) + ' checks' + (fail ? ' — FAILED' : ' ✅'));
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error('FATAL', err && err.stack || err); process.exit(1); });
