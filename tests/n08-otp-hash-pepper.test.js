#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n08-otp-hash-pepper.test.js — N-08 regression guard
   -------------------------------------------------------------------
   server/auth.js stored OTP codes as an unkeyed sha256(code + '|' + phone)
   in otp.json. A one-time code is only ~20 bits of entropy (6 digits), so
   anyone who read otp.json — backup, disk image, log misconfiguration —
   could brute-force the code offline in milliseconds, or precompute a
   rainbow table for a known phone number. The fix HMACs the code with a
   server-held pepper, so a leaked store verifies nothing.

   The test boots the real server with a known JWT secret (which the fix
   uses as the pepper fallback), issues a code through the live send-code
   endpoint, reads the persisted record BEFORE consuming it, and proves the
   crypto property — then logs in to prove verification still works.

   N08-1  send-code works and the hash lands in otp.json (keyed by the
          canonical last-10 digits of the phone)
   N08-2  the stored hash is NOT the old unkeyed sha256 of the code
   N08-3  the stored hash IS HMAC-SHA256(pepper, code|phone)
   N08-4  offline brute force of every 6-digit code against the leaked
          hash (assuming the old algorithm, or a guessed pepper) finds
          nothing
   N08-5  the real code still verifies (login 200), a wrong code is
          rejected, and a foreign pepper cannot reproduce the hash
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

/* Known pepper: with no PAYESH_OTP_PEPPER the fix falls back to JWT_SECRET. */
const PEPPER = 'n08-test-pepper-0123456789abcdef0123456789abcdef0123456789';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n08-'));
const OTP_FILE = path.join(TMP, 'otp.json');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));

process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_OTP_FILE = OTP_FILE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_JWT_SECRET = PEPPER;
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
/* keep the rate limiters out of the way of a repeat send-code */
process.env.PAYESH_SMS_COOLDOWN_S = '0';
process.env.PAYESH_SMS_IP_LIMIT = '100000';
process.env.PAYESH_SMS_PHONE_LIMIT = '10000';
process.env.PAYESH_SMS_DAILY_CAP = '10000';
process.env.PAYESH_LOGIN_IP_LIMIT = '100000';
process.env.PAYESH_LOGIN_PHONE_LIMIT = '10000';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wait until the OTP file holds the record for `key`. */
async function readOtpRecord(key) {
  for (let i = 0; i < 40; i++) {
    try {
      const doc = JSON.parse(fs.readFileSync(OTP_FILE, 'utf8'));
      if (doc && doc.codes && doc.codes[key] && doc.codes[key].h) return doc.codes[key];
    } catch (e) {}
    await sleep(100);
  }
  return null;
}

async function main() {
  console.log('\n🔍 N-08 regression: peppered OTP hash');

  const { server, store } = require('../server/index.js');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  const req = async (method, p, { body, cookie } = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, headers: res.headers };
  };

  const manager = store.users.find((u) => u.role === 'manager' && u.school_id === 1);
  const phone = String(manager.phone).replace(/[\s\-()]/g, '');
  /* canonicalPhone() keeps the last 10 digits; the OTP store is keyed by it. */
  const key10 = phone.length > 10 ? phone.slice(-10) : phone;

  let code = null;
  let rec = null;
  await test('N08-1: send-code works and the hash is persisted in otp.json', async () => {
    const r = await req('POST', '/api/auth/send-code', { body: { phone } });
    assert.strictEqual(r.status, 200, 'send-code failed: ' + r.status);
    assert.ok(r.json && r.json.demo_code, 'demo_code missing');
    code = String(r.json.demo_code);
    assert.ok(/^\d{6}$/.test(code), 'unexpected code format: ' + code);
    rec = await readOtpRecord(key10);
    assert.ok(rec && rec.h, 'OTP record missing from ' + OTP_FILE + ' (key ' + key10 + ')');
  });

  await test('N08-2: stored hash is not the old unkeyed sha256 of the code', () => {
    const oldStyle = crypto.createHash('sha256').update(code + '|' + key10).digest('hex');
    assert.notStrictEqual(rec.h, oldStyle, 'stored hash is still plain sha256 — the N-08 regression is back');
  });

  await test('N08-3: stored hash is HMAC-SHA256(pepper, code|phone)', () => {
    const expected = crypto.createHmac('sha256', PEPPER).update(code + '|' + key10).digest('hex');
    assert.strictEqual(rec.h, expected, 'stored hash is not the peppered HMAC');
    const otherCode = crypto.createHmac('sha256', PEPPER).update('999999' + '|' + key10).digest('hex');
    assert.notStrictEqual(rec.h, otherCode, 'hash does not depend on the code');
  });

  await test('N08-4: offline brute force of every 6-digit code finds nothing', () => {
    /* Attacker model: they stole otp.json, know the phone, and assume the
       OLD algorithm. Scanning all 900 000 codes must not reproduce the hash
       — which only holds because the digest is now keyed. */
    let hits = 0;
    for (let n = 100000; n < 1000000; n++) {
      const cand = String(n);
      const digest = crypto.createHash('sha256').update(cand + '|' + key10).digest('hex');
      if (digest === rec.h) hits++;
    }
    assert.strictEqual(hits, 0, 'old-algorithm brute force matched the stored hash');
    /* same scan under a guessed (wrong) pepper also fails */
    let wrongPepperHits = 0;
    for (let n = 100000; n < 1000000; n++) {
      const cand = String(n);
      const digest = crypto.createHmac('sha256', 'wrong-pepper').update(cand + '|' + key10).digest('hex');
      if (digest === rec.h) wrongPepperHits++;
    }
    assert.strictEqual(wrongPepperHits, 0, 'a wrong pepper reproduced the stored hash');
  });

  await test('N08-5: real code verifies; wrong code rejected; foreign pepper cannot verify', async () => {
    const ok = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(manager.national_id) } });
    assert.strictEqual(ok.status, 200, 'login with the real code failed: ' + ok.status);
    assert.ok(/payesh_session=[^;]+/.test(ok.headers.get('set-cookie') || ''), 'no session cookie');
    /* a wrong code must not authenticate */
    const bad = await req('POST', '/api/auth/login', { body: { phone, code: '000000', national_id: String(manager.national_id) } });
    assert.notStrictEqual(bad.status, 200, 'login with a wrong code succeeded');
    /* pepper isolation: a second instance with a different JWT secret cannot
       verify a hash minted under PEPPER */
    const foreign = crypto.createHmac('sha256', 'another-instance-secret-key-0123456789').update(code + '|' + key10).digest('hex');
    assert.notStrictEqual(foreign, rec.h, 'hash verified under a foreign pepper');
  });

  server.close();
  console.log('\nN-08 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });
