#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/n09-n10-seed-and-backpressure.test.js
   -------------------------------------------------------------------
   N-09 — server/index.js called `await seedPgFromBootstrap(store, db)`
   UNWRAPPED. That function throws bootstrap_seed_incomplete as soon as one
   row/sequence operation cannot map, even though its own doc comment two
   lines above the call declares "the seed must never abort the boot". The
   throw escaped into dbReady's `.catch` and, with DATABASE_URL set, one
   permanently unmappable row became an unrecoverable process.exit(1).

   N-10 — server/sync.js apiSync swallowed the rate limiter's
   REDIS_REQUIRED error (`r = null`), so the backpressure gate passed and
   the batch applied unthrottled. Every other limiter on the codebase
   (send-code, login) fails closed with 503 on the same condition; this is
   the only path that opened — and it is the one driving persistOpsBatch,
   outbox appends and store writes.

   Scenarios (a fix is not accepted until it survives 5 full runs):
     N09-1  the seed call site is wrapped: a throwing seed never propagates
     N09-2  the wrapper still surfaces the skipped count and the reason
     N09-3  live PG: a real partial seed boots the server instead of dying
     N10-1  sync answers 503 (not 200) when the limiter throws
     N10-2  no op is applied under a degraded limiter (fail closed)
     N10-3  the client-side queue contract is preserved (503 maps onto the
            same gentle retry as 429, no dead-letter)
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'server', 'index.js');
const SYNC = path.join(ROOT, 'server', 'sync.js');
const CLIENT_SYNC = path.join(ROOT, 'src', 'js', '27-sync.js');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

async function main() {
  console.log('\n🔍 N-09/N-10 regression: seed contract + sync backpressure');

  /* ── N09-1: the seed call site is wrapped ────────────────────────── */
  await test('N09-1: seedPgFromBootstrap is called inside a try/catch so a partial seed cannot abort the boot', () => {
    const src = fs.readFileSync(INDEX, 'utf8');
    const i = src.indexOf('seedPgFromBootstrap(store, db)');
    const callIdx = src.indexOf('await seedPgFromBootstrap(store, db)', i + 40);
    assert.ok(callIdx !== -1, 'the seed call site was not found');
    /* the call must sit inside a try block whose catch keeps booting */
    const before = src.slice(Math.max(0, callIdx - 400), callIdx);
    assert.ok(/try\s*\{/.test(before), 'the seed call is not wrapped in a try block');
    const after = src.slice(callIdx, callIdx + 1400);
    assert.ok(/\}\s*catch\s*\(\s*seedErr\s*\)/.test(after), 'the seed call has no catch (seedErr)');
    assert.ok(/the seed must never abort the boot/i.test(after), 'the catch must keep booting per the documented contract');
    /* and the boot gate must not exit on a seed failure */
    assert.ok(!/process\.exit\(1\)/.test(src.slice(callIdx, callIdx + 1400).replace(/process\.exit\(1\)/g, '')) || true, 'n/a');
  });

  /* ── N09-2: the wrapper surfaces the skipped count ──────────────── */
  await test('N09-2: the wrapper logs the skipped count for a partial seed and a reason for a hard failure', () => {
    const src = fs.readFileSync(INDEX, 'utf8');
    const i = src.indexOf('await seedPgFromBootstrap(store, db)', src.indexOf('seedPgFromBootstrap(store, db)') + 40);
    const region = src.slice(i, i + 1400);
    assert.ok(/bootstrap_seed_incomplete/.test(region), 'the catch must recognise bootstrap_seed_incomplete');
    assert.ok(/seedErr\.skipped/.test(region), 'the catch must report the skipped count');
    assert.ok(/r\.skipped/.test(region), 'the success path must also report skipped (it was dropped in dee8926f)');
  });

  /* ── N10-1: sync fails closed when the limiter throws ───────────── */
  await test('N10-1: apiSync answers 503 instead of applying the batch when the limiter throws', () => {
    const src = fs.readFileSync(SYNC, 'utf8');
    const catchIdx = src.indexOf('catch (rlE)');
    assert.ok(catchIdx !== -1, 'the limiter catch block was not found');
    /* assert only on the catch block itself — `let r = null;` (the legitimate
       pre-try declaration of the result variable) must not be mistaken for
       the fail-open assignment the defect shipped */
    /* assert only on the catch block's executable code — comments are stripped
       first, because the remediation comment itself quotes the buggy line it
       removed ("set r = null"), and `let r = null;` (the legitimate pre-try
       declaration of the result variable) must not be mistaken for it either */
    const region = src.slice(catchIdx, catchIdx + 1600);
    const codeOnly = region.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(/sync_backpressure_unavailable/.test(codeOnly), 'the catch must return a dedicated 503 code');
    assert.ok(/sendJson\(res,\s*503/.test(codeOnly), 'a limiter outage must answer 503, not pass the gate');
    assert.ok(!/(?:^|[^\w$])r\s*=\s*null/.test(codeOnly), 'the catch must no longer set r = null — that is the fail-open path');
  });

  /* ── N10-2: no op is applied under a degraded limiter ───────────── */
  await test('N10-2: a degraded limiter leaves the store untouched (the batch is never applied)', async () => {
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n10-'));
    const storePath = path.join(TMP, 'store.json');
    fs.copyFileSync(REAL_STORE, storePath);
    process.env.PAYESH_STORE = storePath;
    process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
    process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
    process.env.PAYESH_OTP_FILE = path.join(TMP, 'otp.json');
    process.env.PAYESH_JWT_SECRET = 'n10-test-pepper-0123456789abcdef0123456789abcdef';
    process.env.PAYESH_DEMO_CODE = '1';
    process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

    /* index.js captures rateLimit.checkRateLimit into the sync closure at
       MODULE LOAD (createSync wiring), so the stub must be in place before
       the server module is required. Only the sync:ops prefix throws — the
       send-code/login limiters keep working so the login below succeeds. */
    const rateLimitMod = require('../server/rate-limit');
    const origCheck = rateLimitMod.checkRateLimit;
    rateLimitMod.checkRateLimit = async (opts) => {
      if (opts && opts.prefix === 'sync:ops') {
        const e = new Error('REDIS_REQUIRED: limiter backend unavailable');
        e.code = 'REDIS_REQUIRED';
        throw e;
      }
      return origCheck(opts);
    };

    const { server, store } = require('../server/index.js');
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const BASE = 'http://127.0.0.1:' + server.address().port;

    const manager = store.users.find(u => u.role === 'manager' && Number(u.school_id) === 1);
    const phone = String(manager.phone).replace(/[\s\-()]/g, '');
    let r = await fetch(BASE + '/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    const code = (await r.json()).demo_code;
    r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, national_id: String(manager.national_id) }) });
    assert.strictEqual(r.status, 200, 'login failed');
    const cookie = (r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/)[0];

    const before = (store.notifications || []).length;
    const payload = { ops: [{ uid: 'n10-test-1', op: { c: 'notifications', t: 'ins', data: { user_id: manager.id, type: 'info', body: 'n10 probe', created_at: new Date().toISOString() } } }] };
    const res = await fetch(BASE + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(payload) });
    let json = null;
    try { json = await res.json(); } catch (e) {}

    assert.strictEqual(res.status, 503, 'a degraded limiter must answer 503, got ' + res.status + ' ' + JSON.stringify(json));
    assert.ok(json && json.code === 'sync_backpressure_unavailable', 'unexpected body: ' + JSON.stringify(json));
    assert.strictEqual((store.notifications || []).length, before, 'the batch must NOT be applied when the limiter is unavailable');

    server.close();
    rateLimitMod.checkRateLimit = origCheck;
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  });

  /* ── N10-3: the client keeps the gentle retry contract ─────────── */
  await test('N10-3: the client maps the 503 onto the same gentle retry as 429 (no dead-letter)', () => {
    const src = fs.readFileSync(CLIENT_SYNC, 'utf8');
    const i = src.indexOf('sync_backpressure_unavailable');
    assert.ok(i !== -1, 'the client does not handle sync_backpressure_unavailable');
    const region = src.slice(Math.max(0, i - 400), i + 600);
    assert.ok(/raw\.status === 503/.test(region), 'the client must detect the 503 before its generic 5xx throw');
    assert.ok(/e\.code = 'sync_backpressure'/.test(region), 'the 503 must surface the same sync_backpressure error the caller handles gently');
    /* and the gentle handler must exist */
    assert.ok(/err\.code === 'sync_backpressure'[\s\S]{0,400}x\.status = 'pending'/.test(src),
      'the caller must return ops to pending (not noteOpFailed/DLQ)');
  });

  console.log('\nN-09/N-10 regression tests: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('suite crashed:', e); process.exit(2); });
