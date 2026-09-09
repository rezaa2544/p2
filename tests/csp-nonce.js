#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/csp-nonce.js — P5: تطابقِ nonce در CSP و HTML
   - nonce داخلِ سرآیندِ CSP با nonce رویِ <script>/<style> یکی است
   - هر درخواست nonce تازه می‌گیرد (بازپخش بی‌اثر)
   - جای‌نگهدارِ __PAYESH_NONCE__ در پاسخ نمانده
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-nonce-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server } = require(path.join(ROOT, 'server', 'index.js'));

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

async function getRoot() {
  const r = await fetch(BASE + '/');
  const html = await r.text();
  const csp = r.headers.get('content-security-policy') || '';
  return { html, csp };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('\n🔐 Testing CSP nonce binding (P5)');

  await test('N1: nonce سرآیند با nonce رویِ script/style یکی است', async () => {
    const { html, csp } = await getRoot();
    const m = csp.match(/'nonce-([^']+)'/);
    assert.ok(m, 'no nonce in CSP header');
    const nonce = m[1];
    assert.ok(html.includes('<script nonce="' + nonce + '"'), 'script tag not nonced');
    assert.ok(html.includes('<style nonce="' + nonce + '"'), 'style tag not nonced');
  });

  await test('N2: هر درخواست nonce تازه می‌گیرد', async () => {
    const a = await getRoot();
    const b = await getRoot();
    const na = (a.csp.match(/'nonce-([^']+)'/) || [])[1];
    const nb = (b.csp.match(/'nonce-([^']+)'/) || [])[1];
    assert.ok(na && nb, 'missing nonce');
    assert.notStrictEqual(na, nb, 'nonce reused across requests!');
  });

  await test('N3: جای‌نگهدار در پاسخ نمانده', async () => {
    const { html, csp } = await getRoot();
    assert.ok(!html.includes('__PAYESH_NONCE__'), 'placeholder leaked in HTML');
    assert.ok(!csp.includes('__PAYESH_NONCE__'), 'placeholder leaked in CSP');
  });

  await test('N4: nonce به‌اندازهٔ کافی تصادفی است (base64ِ ۱۶ بایت)', async () => {
    const { csp } = await getRoot();
    const n = (csp.match(/'nonce-([^']+)'/) || [])[1] || '';
    assert.ok(/^[A-Za-z0-9+/]{22}==$/.test(n), 'weak nonce shape: ' + n);
  });

  console.log(`\nCSP Nonce Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
