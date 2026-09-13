#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   route-url-guard.js — S7-1 (Bug Hunt session 7): a malformed request
   target must never take the process down.

   Before the fix, `server/index.js` parsed the request target at the top of
   the async handler (`new URL(req.url, 'http://localhost')`) with no guard and
   without a rejection handler on the awaited wrapper. A single raw request
   line such as `GET //[ HTTP/1.1` therefore produced ERR_INVALID_URL →
   unhandled promise rejection → process exit 1: unauthenticated remote DoS.

   This suite models the attacker (raw socket, no client normalization) and
   asserts (a) the process survives, (b) the request gets a clean 4xx instead
   of a silently dropped connection, and (c) normal routing is unaffected.

   Run: node tests/route-url-guard.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED = path.join(ROOT, 'server', 'data', 'payesh.json');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) { pass += 1; console.log('  ✅ ' + name); }
  else { fail += 1; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function get(port, requestPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: requestPath, timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, err: e.code }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, err: 'timeout' }); });
  });
}
/* Raw socket: sends the request-target exactly as an attacker would (no client-side
   normalization), which is the only way to reach these targets. */
function rawRequest(port, target, method) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write((method || 'GET') + ' ' + target + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nConnection: close\r\n\r\n');
    });
    let data = '';
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    socket.on('data', (c) => { data += c; });
    socket.on('close', () => done({ kind: 'closed', data }));
    socket.on('error', (e) => done({ kind: 'error', code: e.code, data }));
    setTimeout(() => { try { socket.destroy(); } catch (e) {} done({ kind: 'timeout', data }); }, 4000);
  });
}
function statusOf(raw) {
  const m = /^HTTP\/1\.[01] (\d{3})/.exec(String(raw || ''));
  return m ? Number(m[1]) : 0;
}

async function main() {
  /* S7-split: دانهٔ نمایشی نیست ⇒ صریحاً NOT-RUN. نه ادعای سبز می‌کنیم و نه
     آزمون را FATAL می‌کنیم؛ خروجیِ ۲ = «اجرا نشد» (هم‌قاعده با tests/wal-disk-full.js
     که سناریوهای نیازمندِ زیرساخت را NOT-RUN می‌زند). */
  if (!fs.existsSync(SEED)) {
    console.log('\n⏭️  SKIP — دانهٔ نمایشی موجود نیست: ' + path.relative(ROOT, SEED));
    console.log('   این آزمون سرورِ واقعی را با استورِ دانه‌شده بالا می‌آورد؛ اول `node server/seed.js`.');
    console.log('   NOT-RUN ≠ موفق.');
    process.exit(2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-url-guard-'));
  const storePath = path.join(tmp, 'store.json');
  fs.copyFileSync(SEED, storePath);
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1', PAYESH_STORE: storePath,
      PAYESH_AUDIT: path.join(tmp, 'audit.log'), PAYESH_KEY: path.join(tmp, 'jwt.key'),
      PAYESH_OTP_FILE: path.join(tmp, 'otp.json'), PAYESH_DEMO_CODE: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (c) => { serverLog += c; });
  child.stderr.on('data', (c) => { serverLog += c; });
  const cleanup = () => {
    if (child.exitCode === null) { try { child.kill('SIGKILL'); } catch (e) {} }
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  process.on('exit', cleanup);

  const alive = () => child.exitCode === null && child.signalCode === null;

  try {
    let ready = false;
    for (let i = 0; i < 50; i += 1) {
      const h = await get(port, '/api/health');
      if (h.status === 200) { ready = true; break; }
      if (!alive()) break;
      await sleep(200);
    }
    if (!ready) throw new Error('Server did not boot: ' + serverLog.slice(-400));

    console.log('\n▸ S7-1 route/URL guard — malformed request-target (raw socket)');

    const malformed = ['//[', '///', '//@'];
    for (let i = 0; i < malformed.length; i += 1) {
      const target = malformed[i];
      const response = await rawRequest(port, target);
      await sleep(400);
      const survived = alive();
      const status = statusOf(response.data);
      check('RG-' + (i + 1) + ' server survives request-target ' + JSON.stringify(target) + ' (no process exit)',
        survived,
        survived ? '' : 'process exited: exitCode=' + child.exitCode + ' — ' + serverLog.split('\n').slice(-3).join(' | ').slice(0, 220));
      check('RG-' + (i + 1) + 'b malformed target ' + JSON.stringify(target) + ' answered with 4xx (not dropped/hung)',
        !survived ? false : (status >= 400 && status < 500),
        'kind=' + response.kind + ' status=' + status + ' bytes=' + (response.data ? response.data.length : 0));
      if (!survived) break;
    }

    const healthAfter = await get(port, '/api/health');
    check('RG-4 regular routing still healthy after malformed targets', healthAfter.status === 200, 'status=' + healthAfter.status);

    const unknown = await get(port, '/definitely-not-a-route');
    check('RG-5 unknown well-formed path still answers 404 (routing unchanged)', unknown.status === 404, 'status=' + unknown.status);

    const apiUnknown = await get(port, '/api/not-a-route');
    check('RG-6 unknown /api path still answers 404 JSON', apiUnknown.status === 404 && String(apiUnknown.body).includes('not_found'), 'status=' + apiUnknown.status + ' body=' + String(apiUnknown.body).slice(0, 80));
  } finally {
    cleanup();
  }

  const total = pass + fail;
  console.log('\nroute-url-guard: ' + pass + '/' + total + (fail ? ' — ' + fail + ' FAILED' : ' ✅'));
  if (fail) { failures.forEach((f) => console.log('  — ' + f)); process.exit(1); }
}

main().catch((err) => { console.error('FATAL:', (err && err.stack) || err); process.exit(1); });
