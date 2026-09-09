#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/classes.test.js — Classes Resource Endpoint Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-cls-'));
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

const CSRF_JAR = {}; /* F-CSRF-01: نگاشتِ نشست ← توکن (تزریقِ خودکار در req) */
async function req(method, p, { body, cookie, csrf } = {}) {
  const jar = csrf || (cookie ? CSRF_JAR[cookie] : null);
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: cookie } : {},
      jar ? { 'X-CSRF-Token': jar } : {}
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
  const c = sc.match(/csrf_token=([^;]+)/);
  if(m && c) CSRF_JAR[m[0]] = c[1];
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

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const teacher1 = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);

  console.log('\n🔍 Testing /api/v1/classes Endpoints');

  await test('CLS1: GET /api/v1/classes returns enriched classes of school 1', async () => {
    const r = await req('GET', '/api/v1/classes', { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.ok(Array.isArray(r.json.data));
    assert.ok(r.json.data.length > 0);
    assert.ok(r.json.data[0].student_count !== undefined);
  });

  const sampleClass = store.classes.find(c => c.school_id === 1);
  await test('CLS2: GET /api/v1/classes/:id returns class detail with student list', async () => {
    const r = await req('GET', `/api/v1/classes/${sampleClass.id}`, { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.id, sampleClass.id);
    assert.ok(Array.isArray(r.json.data.students));
  });

  let createdClassId = null;
  await test('CLS3: POST /api/v1/classes creates new class (Manager only)', async () => {
    const payload = { name: 'کلاس دهم الف جدید', grade: 10, capacity: 32 };
    
    // Teacher rejected
    const rTch = await req('POST', '/api/v1/classes', { body: payload, cookie: cookieTch1 });
    assert.strictEqual(rTch.status, 403);

    // Manager succeeds
    const rMgr = await req('POST', '/api/v1/classes', { body: payload, cookie: cookieMgr1 });
    assert.strictEqual(rMgr.status, 201);
    assert.strictEqual(rMgr.json.ok, true);
    assert.strictEqual(rMgr.json.data.name, payload.name);
    createdClassId = rMgr.json.data.id;
  });

  await test('CLS4: PATCH /api/v1/classes/:id updates capacity', async () => {
    const r = await req('PATCH', `/api/v1/classes/${createdClassId}`, { body: { capacity: 35 }, cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.capacity, 35);
  });

  await test('CLS5: DELETE /api/v1/classes/:id deletes class', async () => {
    const r = await req('DELETE', `/api/v1/classes/${createdClassId}`, { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);

    const rCheck = await req('GET', `/api/v1/classes/${createdClassId}`, { cookie: cookieMgr1 });
    assert.strictEqual(rCheck.status, 404);
  });

  console.log(`\nClasses API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
