#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/grades.test.js — Grades Resource Endpoint Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-grd-'));
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

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const teacher1 = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student1 = store.users.find(u => u.role === 'student' && u.school_id === 1);

  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);
  const cookieStd1 = await loginAs(student1);

  console.log('\n🔍 Testing /api/v1/grades Endpoints');

  await test('GRD1: GET /api/v1/grades lists grades for Manager with subject names', async () => {
    const r = await req('GET', '/api/v1/grades?limit=10', { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.ok(Array.isArray(r.json.data));
    assert.ok(r.json.data[0].subject_name !== undefined);
  });

  await test('GRD2: Student can only view their own grades', async () => {
    const r = await req('GET', '/api/v1/grades', { cookie: cookieStd1 });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.every(g => g.student_id === student1.id));
  });

  let createdGradeId = null;
  await test('GRD3: POST /api/v1/grades creates grade score', async () => {
    const subject = (store.subjects || [])[0];
    const payload = {
      student_id: student1.id,
      subject_id: subject.id,
      score: 18.5,
      type: 'midterm',
      term: 'term1'
    };

    const r = await req('POST', '/api/v1/grades', { body: payload, cookie: cookieTch1 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.data.score, 18.5);
    assert.strictEqual(r.json.data.version, 1);
    createdGradeId = r.json.data.id;
  });

  await test('GRD4: PATCH /api/v1/grades/:id optimistic concurrency control (OCC conflict test)', async () => {
    // Attempt update with wrong base_version
    const rConflict = await req('PATCH', `/api/v1/grades/${createdGradeId}`, {
      body: { score: 19.5, base_version: 99 },
      cookie: cookieMgr1
    });
    assert.strictEqual(rConflict.status, 409);
    assert.strictEqual(rConflict.json.code, 'conflict');

    // Update with correct base_version = 1
    const rOk = await req('PATCH', `/api/v1/grades/${createdGradeId}`, {
      body: { score: 19.5, base_version: 1 },
      cookie: cookieMgr1
    });
    assert.strictEqual(rOk.status, 200);
    assert.strictEqual(rOk.json.data.score, 19.5);
    assert.strictEqual(rOk.json.data.version, 2);
  });

  await test('GRD5: DELETE /api/v1/grades/:id removes grade record', async () => {
    const r = await req('DELETE', `/api/v1/grades/${createdGradeId}`, { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
  });

  console.log(`\nGrades API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
