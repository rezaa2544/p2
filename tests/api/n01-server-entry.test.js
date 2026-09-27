#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/api/n01-server-entry.test.js — N-01 regression guard
   -------------------------------------------------------------------
   The server entry point (server/index.js) shipped broken for the entire
   repo history: a truncated string literal at the per-row seed fallback plus
   ~1748 lines of appended duplicate content made the module unparseable, so
   EVERY server-side test failed to boot ("SyntaxError: Invalid or unexpected
   token"). These five scenarios pin the fix and catch any regression.

   N01-1  the module parses and loads (require throws SyntaxError otherwise)
   N01-2  the loaded module exposes its documented surface (server + store)
   N01-3  the HTTP server boots and the request pipeline answers (401 gate)
   N01-4  a full authenticated login round-trip works end to end
   N01-5  structural guard: one module.exports, no orphaned continuation,
          balanced braces (catches any re-duplication of the file tail)
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const ENTRY = path.join(ROOT, 'server', 'index.js');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

/* Isolated store/audit/key so this suite never touches developer data and
   never needs PostgreSQL (same dev-store convention as the other suites). */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n01-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

async function main() {
  console.log('\n🔍 N-01 regression: server entry point');

  /* N01-1 + N01-2 — loading the module proves it parses (a SyntaxError
     propagates out of require) and that its top-level wiring completes.
     Static relative path: this suite lives in tests/api/. */
  let server, store;
  await test('N01-1: server/index.js parses and loads without a SyntaxError', () => {
    const loaded = require('../../server/index.js');
    assert.ok(loaded, 'module exported nothing');
    ({ server, store } = loaded);
  });

  await test('N01-2: loaded module exposes its documented surface', () => {
    assert.ok(server && typeof server.listen === 'function', 'http server missing');
    assert.ok(store && Array.isArray(store.users), 'store/users missing');
  });

  /* N01-3 + N01-4 — boot the server on an ephemeral port and exercise the
     request pipeline (anonymous gate + full login round-trip). */
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

  await test('N01-3: HTTP pipeline answers — anonymous request gated with 401', async () => {
    const r = await req('GET', '/api/v1/bootstrap');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.ok, false);
  });

  await test('N01-4: full authenticated login round-trip returns 200', async () => {
    const manager = store.users.find((u) => u.role === 'manager' && u.school_id === 1);
    const phone = String(manager.phone).replace(/[\s\-()]/g, '');
    let r = await req('POST', '/api/auth/send-code', { body: { phone } });
    assert.strictEqual(r.status, 200);
    const code = r.json.demo_code;
    r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(manager.national_id) } });
    assert.strictEqual(r.status, 200);
    const sc = r.headers.get('set-cookie') || '';
    assert.ok(/payesh_session=[^;]+/.test(sc), 'session cookie missing');
    const cookie = sc.match(/payesh_session=[^;]+/)[0];
    r = await req('GET', '/api/v1/bootstrap', { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.user.role, 'manager');
  });

  /* N01-5 — structural guard: the duplication must not come back. Exactly one
     module.exports block, no orphaned continuation line, balanced braces. */
  await test('N01-5: single module.exports, no orphaned continuation, balanced braces', () => {
    const src = fs.readFileSync(ENTRY, 'utf8').replace(/\r/g, '');
    const exportsBlocks = src.match(/^module\.exports\s*=\s*\{/gm) || [];
    assert.strictEqual(exportsBlocks.length, 1, 'expected exactly 1 module.exports, found ' + exportsBlocks.length);
    const orphans = src.match(/^[ \t]*\+\s*\(n \+ 1\)\)\.join/gm) || [];
    assert.strictEqual(orphans.length, 0, 'orphaned continuation line present: ' + JSON.stringify(orphans));
    const opens = (src.match(/{/g) || []).length;
    const closes = (src.match(/}/g) || []).length;
    assert.strictEqual(opens, closes, 'brace imbalance: ' + opens + ' { vs ' + closes + ' }');
  });

  server.close();
  console.log('\nN-01 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });
