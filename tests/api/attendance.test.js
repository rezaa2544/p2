#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/attendance.test.js — Attendance Resource Endpoint Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-att-'));
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

  console.log('\n🔍 Testing /api/v1/attendance Endpoints');

  await test('ATT1: GET /api/v1/attendance lists records for Manager', async () => {
    const r = await req('GET', '/api/v1/attendance?limit=10', { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.ok(Array.isArray(r.json.data));
  });

  await test('ATT2: Student can only view their own attendance', async () => {
    const r = await req('GET', '/api/v1/attendance', { cookie: cookieStd1 });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.every(a => a.student_id === student1.id));
  });

  let createdAttId = null;
  await test('ATT3: POST /api/v1/attendance records attendance entry (Teacher/Manager)', async () => {
    const payload = {
      student_id: student1.id,
      class_id: 1,
      date: '2026-09-08',
      status: 'late',
      late: 15,
      note: 'تأخیر به دلیل ترافیک'
    };

    const r = await req('POST', '/api/v1/attendance', { body: payload, cookie: cookieTch1 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.data.status, 'late');
    assert.strictEqual(r.json.data.late, 15);
    createdAttId = r.json.data.id;
  });

  await test('ATT4: PATCH /api/v1/attendance/:id updates status', async () => {
    const r = await req('PATCH', `/api/v1/attendance/${createdAttId}`, {
      body: { status: 'present', late: 0 },
      cookie: cookieMgr1
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.status, 'present');
  });

  await test('ATT5: DELETE /api/v1/attendance/:id removes record', async () => {
    const r = await req('DELETE', `/api/v1/attendance/${createdAttId}`, { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
  });

  console.log(`\nAttendance API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
