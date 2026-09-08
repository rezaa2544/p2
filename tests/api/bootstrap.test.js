#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/bootstrap.test.js — Scoped Bootstrap Endpoint API Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-bs-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';

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

  const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const teacher = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const parent  = store.users.find(u => u.role === 'parent' && u.school_id === 1);

  console.log('\n🔍 Testing GET /api/v1/bootstrap');

  await test('BS1: Anonymous request rejected with 401', async () => {
    const r = await req('GET', '/api/v1/bootstrap');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.ok, false);
  });

  await test('BS2: Manager bootstrap contains classes, bell_schedules, and subjects', async () => {
    const cookie = await loginAs(manager);
    const r = await req('GET', '/api/v1/bootstrap', { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.user.role, 'manager');
    assert.strictEqual(r.json.school.id, 1);
    assert.ok(Array.isArray(r.json.classes));
    assert.ok(Array.isArray(r.json.subjects));
    assert.ok(Array.isArray(r.json.bell_schedules));
  });

  await test('BS3: Teacher bootstrap contains only taught classes and schedule', async () => {
    const cookie = await loginAs(teacher);
    const r = await req('GET', '/api/v1/bootstrap', { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.user.role, 'teacher');
    assert.ok(Array.isArray(r.json.classes));
    assert.ok(Array.isArray(r.json.schedule));
  });

  await test('BS4: Student bootstrap contains enrolled class and student schedule', async () => {
    const cookie = await loginAs(student);
    const r = await req('GET', '/api/v1/bootstrap', { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.user.role, 'student');
    assert.ok(r.json.class !== undefined);
  });

  await test('BS5: Parent bootstrap contains children records', async () => {
    const cookie = await loginAs(parent);
    const r = await req('GET', '/api/v1/bootstrap', { cookie });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.user.role, 'parent');
    assert.ok(Array.isArray(r.json.children));
  });

  console.log(`\nBootstrap API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
