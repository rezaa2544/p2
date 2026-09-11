#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Red-team exercise Q3 2026 — real HTTP attacks against an isolated server.
   The suite intentionally models an attacker, not an implementation detail.
   Run: node tests/red-team.js [--csrf-only]
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { opX } = require('./helpers/opx');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const SEED = path.join(ROOT, 'server', 'data', 'payesh.json');
const CSRF_ONLY = process.argv.includes('--csrf-only');
let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log('  ✅ ' + name);
  } else {
    fail += 1;
    const msg = name + (detail ? ' — ' + detail : '');
    failures.push(msg);
    console.log('  ❌ ' + msg);
  }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function request(port, method, requestPath, opts = {}) {
  return new Promise((resolve) => {
    const body = opts.body === undefined ? null : JSON.stringify(opts.body);
    const headers = Object.assign({}, opts.headers || {});
    if (body !== null) headers['content-type'] = 'application/json';
    if (opts.cookie) headers.cookie = opts.cookie;
    const req = http.request({ host: '127.0.0.1', port, method, path: requestPath, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', (err) => resolve({ status: 0, headers: {}, raw: String(err.message), json: null }));
    if (body !== null) req.write(body);
    req.end();
  });
}
function cookieOf(response) {
  const source = response.headers['set-cookie'];
  const cookie = Array.isArray(source) ? source[0] : source;
  const found = String(cookie || '').match(/payesh_session=[^;]+/);
  return found ? found[0] : null;
}
function createUnsignedJwt(payload) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(payload) + '.';
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = await request(port, 'GET', '/api/health');
    if (health.status === 200 && health.json && health.json.ok) return true;
    if (child.exitCode !== null) return false;
    await sleep(200);
  }
  return false;
}

async function main() {
  if (!fs.existsSync(SEED)) throw new Error('Missing server/data/payesh.json; run node server/seed.js first.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-red-team-'));
  const storePath = path.join(tmp, 'store.json');
  const auditPath = path.join(tmp, 'audit.log');
  fs.copyFileSync(SEED, storePath);
  const fixture = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1',
      PAYESH_STORE: storePath, PAYESH_AUDIT: auditPath, PAYESH_KEY: path.join(tmp, 'jwt.key'),
      PAYESH_OTP_FILE: path.join(tmp, 'otp.json'), PAYESH_DEMO_CODE: '1',
      PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_DAILY_CAP: '1000000',
      PAYESH_SMS_PHONE_LIMIT: '2', PAYESH_SMS_IP_LIMIT: '1000000',
      PAYESH_LOGIN_IP_LIMIT: '1000000', PAYESH_LOGIN_PHONE_LIMIT: '20', PAYESH_LOGIN_TRIES: '5',
      PAYESH_WAF_MODE: 'enforce'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (chunk) => { serverLog += String(chunk); });
  child.stderr.on('data', (chunk) => { serverLog += String(chunk); });

  const cleanup = () => {
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  process.on('exit', cleanup);

  try {
    const ready = await waitForServer(port, child);
    if (!ready) throw new Error('Server did not boot: ' + serverLog.slice(-500));

    async function login(user) {
      assert(user && user.active, 'active user fixture is required');
      const phone = String(user.phone).replace(/[\s\-()]/g, '');
      const sent = await request(port, 'POST', '/api/auth/send-code', { body: { phone } });
      assert(sent.status === 200 && sent.json && sent.json.demo_code, 'send-code failed for fixture');
      const logged = await request(port, 'POST', '/api/auth/login', {
        body: { phone, code: sent.json.demo_code, national_id: String(user.national_id) }
      });
      assert(logged.status === 200 && logged.json && logged.json.ok, 'login failed for fixture');
      const cookie = cookieOf(logged);
      assert(cookie, 'login did not provide session cookie');
      return cookie;
    }

    const manager1 = fixture.users.find((u) => u.active && u.role === 'manager' && Number(u.school_id) === 1);
    const teacher1 = fixture.users.find((u) => u.active && u.role === 'teacher' && Number(u.school_id) === 1);
    const student1 = fixture.users.find((u) => u.active && u.role === 'student' && Number(u.school_id) === 1);
    const student2 = fixture.users.find((u) => u.active && u.role === 'student' && Number(u.school_id) === 2);
    assert(manager1 && teacher1 && student1 && student2, 'required multi-tenant seed fixtures are absent');

    console.log('\n▸ Red Team Exercise — 10 attack paths');

    /* 1. Session replay after logout. */
    if (!CSRF_ONLY) {
      const session = await login(teacher1);
      const logout = await request(port, 'POST', '/api/auth/logout', { cookie: session });
      const replay = await request(port, 'GET', '/api/auth/me', { cookie: session });
      check('RT-01 Session replay after logout is rejected', logout.status === 200 && replay.status === 401 && replay.json.code === 'no_session', 'logout=' + logout.status + ', replay=' + replay.status);
    }

    /* 2. JWT alg:none plus forged superadmin role. */
    if (!CSRF_ONLY) {
      const forged = createUnsignedJwt({ sub: teacher1.id, role: 'superadmin', iss: 'payesh', aud: 'payesh-web', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, jti: 'rt-forged' });
      const response = await request(port, 'GET', '/api/auth/me', { cookie: 'payesh_session=' + forged });
      check('RT-02 JWT alg:none / role forgery is rejected', response.status === 401 && response.json.code === 'no_session', 'status=' + response.status);
    }

    /* 3. Tenant boundary / IDOR: use an authentic manager session against school 2. */
    let managerSession;
    if (!CSRF_ONLY) {
      managerSession = await login(manager1);
      const idor = await request(port, 'GET', '/api/students/' + student2.id, { cookie: managerSession });
      check('RT-03 Cross-tenant student lookup is indistinguishable from not-found', idor.status === 404 && idor.json.code === 'not_found', 'status=' + idor.status + ' code=' + (idor.json && idor.json.code));
    }

    /* 4. Privilege escalation through a sync user-create operation. */
    if (!CSRF_ONLY) {
      const teacherSession = await login(teacher1);
      const op = opX({ by: teacher1.id, collection: 'users', type: 'ins', user_id: teacher1.id, school_id: teacher1.school_id, data: { school_id: teacher1.school_id, role: 'student' }, uid: 'rt-privilege-' + Date.now() });
      const privilege = await request(port, 'POST', '/api/sync', { cookie: teacherSession, body: { ops: [op] } });
      const result = privilege.json && privilege.json.results && privilege.json.results[0];
      const denied = (privilege.status === 403 && privilege.json && ['role_denied', 'out_of_scope'].includes(privilege.json.code)) ||
        (privilege.status === 200 && result && result.ok === false && ['role_denied', 'out_of_scope'].includes(result.code));
      check('RT-04 Teacher cannot create a user via sync', denied, 'status=' + privilege.status + ' response=' + privilege.raw.slice(0, 150));
    }

    /* 5. OTP tampering: a real code paired with another national-id must fail. */
    if (!CSRF_ONLY) {
      const phone = String(student1.phone).replace(/[\s\-()]/g, '');
      const sent = await request(port, 'POST', '/api/auth/send-code', { body: { phone } });
      const wrongNid = String(student1.national_id) === '0000000000' ? '1111111111' : '0000000000';
      const otp = await request(port, 'POST', '/api/auth/login', { body: { phone, code: sent.json && sent.json.demo_code, national_id: wrongNid } });
      check('RT-05 OTP cannot be used with a mismatched identity', sent.status === 200 && otp.status === 401 && otp.json.code === 'nid_mismatch', 'send=' + sent.status + ', login=' + otp.status + '/' + (otp.json && otp.json.code));
    }

    /* 6. Rate-limit probing with a never-registered number. */
    if (!CSRF_ONLY) {
      const unknown = '09990000001';
      const attempts = [];
      for (let i = 0; i < 3; i += 1) attempts.push(await request(port, 'POST', '/api/auth/send-code', { body: { phone: unknown } }));
      check('RT-06 OTP send endpoint rate-limits enumeration attempts', attempts[0].status === 200 && attempts[1].status === 200 && attempts[2].status === 429 && attempts[2].json.code === 'rate_limited', attempts.map((r) => r.status).join(','));
    }

    /* 7. Forged sync actor assertion poisons the complete request. */
    if (!CSRF_ONLY) {
      const op = opX({ by: manager1.id + 99999, collection: 'announcements', type: 'ins', user_id: manager1.id, school_id: manager1.school_id, data: { school_id: manager1.school_id, title: 'red-team-forgery' }, uid: 'rt-sync-forgery-' + Date.now() });
      const forged = await request(port, 'POST', '/api/sync', { cookie: managerSession, body: { ops: [op] } });
      check('RT-07 Sync forged-by assertion is rejected for the whole batch', forged.status === 403 && forged.json.code === 'forged_by', 'status=' + forged.status + ' code=' + (forged.json && forged.json.code));
    }

    /* 8. SQL injection signature: enforce mode must stop it before routing. */
    if (!CSRF_ONLY) {
      const payload = encodeURIComponent("1' OR 1=1--");
      const sqli = await request(port, 'GET', '/api/students/' + student1.id + '?q=' + payload);
      check('RT-08 SQL injection signature is WAF-blocked', sqli.status === 403 && sqli.json && sqli.json.code === 'waf_blocked' && sqli.json.rule === 'sqli' && !sqli.raw.includes('OR 1=1'), 'status=' + sqli.status + ' body=' + sqli.raw.slice(0, 120));
    }

    /* 9. CSRF: a foreign Origin may not perform a cookie-authenticated logout. */
    /* Reuse the authenticated manager session in the full suite so OTP limits
       remain a tested boundary rather than a test-fixture side effect. */
    const csrfSession = CSRF_ONLY ? await login(teacher1) : managerSession;
    const csrf = await request(port, 'POST', '/api/auth/logout', { cookie: csrfSession, headers: { origin: 'https://attacker.invalid' } });
    const stillLive = await request(port, 'GET', '/api/auth/me', { cookie: csrfSession });
    const sameOrigin = await request(port, 'POST', '/api/auth/logout', { cookie: csrfSession, headers: { origin: 'http://127.0.0.1:' + port } });
    check('RT-09 Cross-origin cookie write is blocked; exact origin remains usable', csrf.status === 403 && csrf.json && csrf.json.code === 'csrf_origin_mismatch' && stillLive.status === 200 && sameOrigin.status === 200, 'csrf=' + csrf.status + '/' + (csrf.json && csrf.json.code) + ', session=' + stillLive.status + ', same-origin=' + sameOrigin.status);

    /* 10. Information disclosure: unauthenticated IDs must reveal neither existence nor PII. */
    if (!CSRF_ONLY) {
      const anonymous = await request(port, 'GET', '/api/students/' + student1.id);
      const body = anonymous.raw;
      check('RT-10 Anonymous student request discloses no record or PII', anonymous.status === 401 && anonymous.json.code === 'no_session' && !body.includes(String(student1.phone)) && !body.includes(String(student1.national_id)) && !body.includes(String(student1.full_name)), 'status=' + anonymous.status + ' body=' + body.slice(0, 150));
    }
  } finally {
    cleanup();
  }

  const total = pass + fail;
  console.log('\nred-team: ' + pass + '/' + total + ' blocked' + (fail ? ' — ' + fail + ' FAILED' : ' ✅'));
  if (fail) {
    failures.forEach((entry) => console.log('  — ' + entry));
    process.exit(1);
  }
}

main().catch((err) => { console.error('FATAL:', err && err.stack || err); process.exit(1); });
