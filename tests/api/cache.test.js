#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/cache.test.js — Redis Caching, Invalidation & Rate Limit Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-cch-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';

const redis = require(path.join(ROOT, 'server', 'redis.js'));
const cache = require(path.join(ROOT, 'server', 'cache.js'));
const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: cookie } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch(e) {}
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  const nid = String(user.national_id);
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: nid } });
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

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
  await cache.init();

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const cookieMgr1 = await loginAs(manager1);

  console.log('\n🔍 Testing Redis Caching & Invalidation Layer (Phase 4)');

  await test('CCH1: Basic Set / Get / Del operations', async () => {
    await redis.set('test:key1', 'hello-world', 'EX', 10);
    const val = await redis.get('test:key1');
    assert.strictEqual(val, 'hello-world');
    await redis.del('test:key1');
    const afterDel = await redis.get('test:key1');
    assert.strictEqual(afterDel, null);
  });

  await test('CCH2: Bootstrap Caching (Cache Miss -> Cache Hit)', async () => {
    // Invalidate first
    await cache.invalidateUser(manager1.id);

    // 1st request -> computes and caches
    const r1 = await req('GET', '/api/v1/bootstrap', { cookie: cookieMgr1 });
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.json.ok, true);

    // 2nd request -> fast cache hit
    const r2 = await req('GET', '/api/v1/bootstrap', { cookie: cookieMgr1 });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.json.server_time, r1.json.server_time); // Cached object matches
  });

  await test('CCH3: Cache Invalidation on Mutation', async () => {
    await cache.invalidateSchool(1);
    const cached = await cache.getBootstrapCache(manager1.id);
    assert.strictEqual(cached, null);
  });

  await test('CCH4: Distributed Rate Limiting (checkRateLimit)', async () => {
    const ip = '192.168.1.50';
    // First 3 allowed
    for (let i = 0; i < 3; i++) {
      const rl = await cache.checkRateLimit(ip, 'test_action', 3, 10);
      assert.strictEqual(rl.allowed, true);
    }
    // 4th is blocked
    const rlBlocked = await cache.checkRateLimit(ip, 'test_action', 3, 10);
    assert.strictEqual(rlBlocked.allowed, false);
    assert.strictEqual(rlBlocked.remaining, 0);
  });

  await test('CCH5: Distributed Idempotency (isProcessedUid & markProcessedUid)', async () => {
    const uid = 'test-uid-uuid-12345';
    const before = await cache.isProcessedUid(uid);
    assert.strictEqual(before, false);

    await cache.markProcessedUid(uid, 60);
    const after = await cache.isProcessedUid(uid);
    assert.strictEqual(after, true);
  });

  await test('CCH6: Distributed Mutex Lock (atomic acquire, token release)', async () => {
    const lockKey = 'school:sync:1';
    const token = await cache.acquireLock(lockKey, 5);
    assert.ok(typeof token === 'string' && token.length > 0, 'acquire returns owner token');

    // second acquirer must lose while held
    const second = await cache.acquireLock(lockKey, 5);
    assert.strictEqual(second, null);

    // release with wrong token must not free the lock
    const wrongRelease = await cache.releaseLock(lockKey, 'wrong-token');
    assert.strictEqual(wrongRelease, false);
    assert.strictEqual(await cache.acquireLock(lockKey, 5), null, 'lock still held after wrong-token release');

    // owner release succeeds
    const released = await cache.releaseLock(lockKey, token);
    assert.strictEqual(released, true);
    const reAcquire = await cache.acquireLock(lockKey, 5);
    assert.ok(reAcquire, 'lock free after owner release');
    await cache.releaseLock(lockKey, reAcquire);
  });

  await test('CCH7: Pub/Sub Event Delivery', async () => {
    let received = null;
    await redis.subscribe('test:channel', (msg) => {
      received = msg;
    });

    await redis.publish('test:channel', { event: 'ping', time: Date.now() });
    await new Promise(r => setTimeout(r, 50));
    assert.ok(received !== null);
  });

  console.log(`\nCache Layer Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
