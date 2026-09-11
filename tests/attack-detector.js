#!/usr/bin/env node
/* Attack-pattern detector, abuse-guard, and live server integration test.
   Run: node tests/attack-detector.js */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createAttackDetector } = require('../server/attack-detector');
const { createAbuseGuard } = require('../server/abuse-guard');
const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function test(name, condition, detail) {
  if (condition) { pass += 1; console.log('  ✅ ' + name); }
  else { fail += 1; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
function request(port, method, target, payload) {
  return new Promise((resolve) => {
    const body = payload == null ? null : JSON.stringify(payload);
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      let data = ''; res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { let json; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    if (body) req.write(body);
    req.end();
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('\n▸ Attack pattern signatures');
  const detections = [];
  const detector = createAttackDetector({
    windowMs: 60000, enumerationThreshold: 4, loginDistinctThreshold: 3,
    crossSchoolThreshold: 3, bulkExportThreshold: 2,
    onDetect: (event) => detections.push(event)
  });

  [101, 102, 103, 104].forEach((id, i) => detector.observeRequest({ sessionId: 'private-session', path: '/api/students/' + id, status: 404, at: i * 100 }));
  test('AD-01 sequential ID enumeration is detected', detections.some((entry) => entry.pattern === 'sequential_id_enumeration'));

  ['person-a', 'person-b', 'person-c'].forEach((subject, i) => detector.observeLoginFailure({ source: '198.51.100.24', subject, at: 1000 + i * 100 }));
  test('AD-02 rapid login failures across distinct users are detected', detections.some((entry) => entry.pattern === 'rapid_login_failures'));

  [0, 1, 2].forEach((n) => detector.observeCrossSchool({ sessionId: 'private-session', at: 2000 + n * 100 }));
  test('AD-03 repeated cross-school access attempts are detected', detections.some((entry) => entry.pattern === 'cross_school_access'));

  detector.observeBulkExport({ sessionId: 'private-session', at: 3000 });
  detector.observeBulkExport({ sessionId: 'private-session', at: 3100 });
  test('AD-04 repeated bulk export requests are detected', detections.some((entry) => entry.pattern === 'bulk_export'));

  detector.observeSyncResult({ sessionId: 'private-session', code: 'forged_by', at: 4000 });
  test('AD-05 forged sync metadata is detected immediately', detections.some((entry) => entry.pattern === 'forged_sync_metadata'));

  const rendered = JSON.stringify(detections);
  test('AD-06 detections contain no raw session, IP, subject, path, or record ID', !rendered.includes('private-session') && !rendered.includes('198.51.100.24') && !rendered.includes('person-a') && !rendered.includes('101'));
  test('AD-07 one pattern is emitted once per actor/window', detections.filter((entry) => entry.pattern === 'forged_sync_metadata').length === 1);

  const audits = [];
  const metricCalls = [];
  const webhooks = [];
  const runtime = { markAttackPatternBlocked: (pattern, session, at) => ({ pattern, session, at }), markSuspicious: () => {} };
  const guard = createAbuseGuard({
    audit: (event, data) => audits.push({ event, data }),
    metrics: { inc: (name, labels) => metricCalls.push({ name, labels }) },
    runtimeMonitor: runtime,
    webhook: async (payload) => { webhooks.push(payload); }
  });
  await guard.report(detections.find((entry) => entry.pattern === 'forged_sync_metadata'));
  test('AD-08 abuse guard writes a redacted audit event, bounded metric, and webhook payload',
    audits.length === 1 && audits[0].event === 'attack_pattern_detected' && metricCalls.length === 1 && metricCalls[0].name === 'payesh_attack_patterns_detected_total' && webhooks.length === 1 && !JSON.stringify(audits[0]).includes('private-session'));
  test('AD-09 health summary reports 24-hour blocked-pattern count', detector.snapshot(4100).attack_patterns_blocked >= 5);

  /* Integration regression: index.js must forward real failed logins into the
     detector and surface the guard's counter through its public health route. */
  const seed = path.join(ROOT, 'server', 'data', 'payesh.json');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-attack-detector-'));
  const port = await freePort();
  fs.copyFileSync(seed, path.join(tmp, 'store.json'));
  const users = JSON.parse(fs.readFileSync(seed, 'utf8')).users.slice(0, 5);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', PAYESH_STORE: path.join(tmp, 'store.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp.json'), PAYESH_AUDIT: path.join(tmp, 'audit.log'), PAYESH_KEY: path.join(tmp, 'jwt.key') }),
    stdio: 'ignore'
  });
  try {
    let health = { status: 0 };
    for (let i = 0; i < 50; i += 1) { health = await request(port, 'GET', '/api/health'); if (health.status === 200) break; await sleep(100); }
    const failed = [];
    for (const user of users) failed.push(await request(port, 'POST', '/api/auth/login', { phone: user.phone, code: '000000', national_id: user.national_id }));
    health = await request(port, 'GET', '/api/health');
    const audit = fs.existsSync(path.join(tmp, 'audit.log')) ? fs.readFileSync(path.join(tmp, 'audit.log'), 'utf8') : '';
    test('AD-10 live login failures reach detector, guard audit, metric-backed health counter, and retain no submitted phone',
      failed.every((result) => result.status === 401) && health.status === 200 && health.json.attack_patterns_blocked >= 1 && audit.includes('attack_pattern_detected') && !audit.includes(String(users[0].phone)));
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\nattack-detector: ' + pass + '/' + (pass + fail) + ' checks' + (fail ? ' — FAILED' : ' ✅'));
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error('FATAL', err && err.stack || err); process.exit(1); });
