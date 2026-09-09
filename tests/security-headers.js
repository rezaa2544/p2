#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/security-headers.js — P5: security headers hardening
   - هر پاسخ: CSP (nonce، بدونِ unsafe-inline) + DENY + nosniff +
     Referrer + Permissions-Policy
   - HSTS فقط رویِ https (با preload)؛ در development CSP دارایِ
     unsafe-eval است و در production نه (buildCsp خالص، هر دو شاخه)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-hdr-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
delete process.env.PAYESH_ENV;   /* شبیهِ development */
delete process.env.PAYESH_HTTPS; /* شبیهِ httpِ مستقیم */

const { server, buildCsp } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (err) {
    fail++;
    console.error('  ❌ ' + name + '\n     ' + err.message);
  }
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('\n🛡️ Testing security headers (P5)');

  await test('H1: CSP با nonce، بدونِ unsafe-inline، با unsafe-eval در dev', async () => {
    const r = await fetch(BASE + '/');
    const csp = r.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("'nonce-"), 'no nonce in CSP');
    assert.ok(!csp.includes('unsafe-inline'), 'unsafe-inline leaked');
    assert.ok(csp.includes("'unsafe-eval'"), 'dev must allow unsafe-eval');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'no frame-ancestors');
  });

  await test('H2: DENY + nosniff + Referrer + Permissions-Policy', async () => {
    const r = await fetch(BASE + '/');
    assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(r.headers.get('referrer-policy'), 'same-origin');
    assert.strictEqual(r.headers.get('permissions-policy'), 'geolocation=(), microphone=(), camera=()');
  });

  await test('H3: بدونِ https، HSTS صادر نمی‌شود', async () => {
    const r = await fetch(BASE + '/');
    assert.strictEqual(r.headers.get('strict-transport-security'), null);
  });

  await test('H4: با PAYESH_HTTPS=1، HSTS با preload صادر می‌شود', async () => {
    process.env.PAYESH_HTTPS = '1';
    const r = await fetch(BASE + '/');
    assert.strictEqual(r.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains; preload');
    delete process.env.PAYESH_HTTPS;
  });

  await test('H5: buildCsp خالص — prod بدونِ unsafe-eval، dev با آن', async () => {
    const p = buildCsp('NONCE123', true);
    const d = buildCsp('NONCE123', false);
    assert.ok(p.includes("'nonce-NONCE123'") && !p.includes('unsafe-eval'), 'prod CSP: ' + p);
    assert.ok(d.includes("'nonce-NONCE123'") && d.includes("'unsafe-eval'"), 'dev CSP: ' + d);
    assert.ok(!p.includes('unsafe-inline') && !d.includes('unsafe-inline'));
  });

  await test('H6: پاسخ‌هایِ JSON هم سرآیند می‌گیرند', async () => {
    const r = await fetch(BASE + '/api/health');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((r.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  });

  console.log(`\nSecurity Headers Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
