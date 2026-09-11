#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/users.test.js — Users Resource Endpoint Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-usr-'));
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

  console.log('\n🔍 Testing /api/v1/users Endpoints');

  await test('USR1: GET /api/v1/users returns paginated list with role filtering', async () => {
    const r = await req('GET', '/api/v1/users?role=teacher', { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.ok(r.json.data.every(u => u.role === 'teacher'));
  });

  await test('USR2: Role projection on GET /api/v1/users/:id (Teacher sees masked NID, Manager sees full)', async () => {
    const rMgr = await req('GET', `/api/v1/users/${student1.id}`, { cookie: cookieMgr1 });
    assert.strictEqual(rMgr.status, 200);
    assert.strictEqual(rMgr.json.data.national_id, student1.national_id);

    const rTch = await req('GET', `/api/v1/users/${student1.id}`, { cookie: cookieTch1 });
    assert.strictEqual(rTch.status, 200);
    assert.strictEqual(rTch.json.data.national_id, undefined);
    assert.ok(rTch.json.data.national_id_masked.includes('***'));
  });

  let createdUserId = null;
  await test('USR3: POST /api/v1/users (Role escalation prevention guard)', async () => {
    // Manager cannot create a superadmin
    const rEscalate = await req('POST', '/api/v1/users', {
      body: { full_name: 'سوپرادمین نامعتبر', role: 'superadmin' },
      cookie: cookieMgr1
    });
    assert.strictEqual(rEscalate.status, 403);
    assert.strictEqual(rEscalate.json.code, 'role_escalation');

    // Manager creates teacher
    const rOk = await req('POST', '/api/v1/users', {
      body: { full_name: 'دبیر ریاضی جدید', role: 'teacher', phone: '09129998877', national_id: '0019998877' },
      cookie: cookieMgr1
    });
    assert.strictEqual(rOk.status, 201);
    assert.strictEqual(rOk.json.data.role, 'teacher');
    createdUserId = rOk.json.data.id;
  });

  await test('USR4: PATCH /api/v1/users/:id updates profile', async () => {
    const r = await req('PATCH', `/api/v1/users/${createdUserId}`, {
      body: { full_name: 'دبیر ریاضی ویرایش شده' },
      cookie: cookieMgr1
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.full_name, 'دبیر ریاضی ویرایش شده');
  });

  await test('USR5: DELETE /api/v1/users/:id removes user', async () => {
    const r = await req('DELETE', `/api/v1/users/${createdUserId}`, { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
  });

  /* BUG-3 (باگ‌هانت چت ۵): مدل users.upd فقط-مدیر است؛ خودبه‌روزرسانیِ
     غیرمدیر در REST (حتی رکوردِ خودش) باید 403 بدهد — مثلِ role_denied
     در sync. وگرنه phone/national_id/active/status قابلِ جعل است. */
  await test('USR6: PATCH self by student/teacher is denied (manager-only, like sync)', async () => {
    const origName = student1.full_name;
    const origPhone = teacher1.phone;
    const rStd = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { full_name: 'نامِ جعلی', phone: '09000000000', national_id: '0000000000', active: false, status: 'x' },
      cookie: cookieStd1
    });
    assert.strictEqual(rStd.status, 403);
    const rTch = await req('PATCH', `/api/v1/users/${teacher1.id}`, {
      body: { phone: '09000000001' },
      cookie: cookieTch1
    });
    assert.strictEqual(rTch.status, 403);
    const back = await req('GET', `/api/v1/users/${student1.id}`, { cookie: cookieMgr1 });
    assert.strictEqual(back.json.data.full_name, origName);
    const backT = await req('GET', `/api/v1/users/${teacher1.id}`, { cookie: cookieMgr1 });
    assert.strictEqual(backT.json.data.phone, origPhone);
  });

  await test('USR7: PATCH self by manager still works (positive control)', async () => {
    const r = await req('PATCH', `/api/v1/users/${manager1.id}`, {
      body: { full_name: manager1.full_name },
      cookie: cookieMgr1
    });
    assert.strictEqual(r.status, 200);
  });

  console.log(`\nUsers API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
