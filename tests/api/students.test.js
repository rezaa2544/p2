#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/students.test.js — Students Resource Endpoint Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-st-'));
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
  const manager2 = store.users.find(u => u.role === 'manager' && u.school_id === 2);
  const teacher1 = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student1 = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const parent1  = store.users.find(u => u.role === 'parent' && u.school_id === 1);

  const cookieMgr1 = await loginAs(manager1);
  const cookieMgr2 = await loginAs(manager2);
  const cookieTch1 = await loginAs(teacher1);
  const cookiePrn1 = await loginAs(parent1);

  console.log('\n🔍 Testing /api/v1/students Endpoints');

  await test('ST1: GET /api/v1/students returns paginated students of own school', async () => {
    const r = await req('GET', '/api/v1/students?limit=10', { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.ok(Array.isArray(r.json.data));
    assert.ok(r.json.data.length <= 10);
    assert.ok(r.json.pagination.has_more !== undefined);
    assert.ok(r.json.data.every(s => s.school_id === 1));
  });

  await test('ST2: GET /api/v1/students with search query', async () => {
    const r = await req('GET', '/api/v1/students?q=' + encodeURIComponent(student1.full_name.slice(0, 3)), { cookie: cookieMgr1 });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.some(s => s.id === student1.id));
  });

  await test('ST3: GET /api/v1/students/:id (own school 200 vs other school 404)', async () => {
    const rOwn = await req('GET', `/api/v1/students/${student1.id}`, { cookie: cookieMgr1 });
    assert.strictEqual(rOwn.status, 200);
    assert.strictEqual(rOwn.json.data.id, student1.id);

    const rOther = await req('GET', `/api/v1/students/${student1.id}`, { cookie: cookieMgr2 });
    assert.strictEqual(rOther.status, 404);
  });

  await test('ST4: Parent IDOR guard on GET /api/v1/students/:id', async () => {
    const kid = store.parent_links.find(l => l.parent_id === parent1.id);
    const myKidId = kid.student_id;
    const rKid = await req('GET', `/api/v1/students/${myKidId}`, { cookie: cookiePrn1 });
    assert.strictEqual(rKid.status, 200);

    const otherStudent = store.users.find(u => u.role === 'student' && u.school_id === 1 && u.id !== myKidId);
    const rOther = await req('GET', `/api/v1/students/${otherStudent.id}`, { cookie: cookiePrn1 });
    assert.strictEqual(rOther.status, 404);
  });

  let createdStudentId = null;
  await test('ST5: POST /api/v1/students creates new student (Manager only)', async () => {
    const payload = {
      full_name: 'دانش‌آموز تستی جدید',
      national_id: '0012998877',
      phone: '09121112233',
      grade_level: 11
    };

    const rTch = await req('POST', '/api/v1/students', { body: payload, cookie: cookieTch1 });
    assert.strictEqual(rTch.status, 403);

    const rMgr = await req('POST', '/api/v1/students', { body: payload, cookie: cookieMgr1 });
    assert.strictEqual(rMgr.status, 201);
    assert.strictEqual(rMgr.json.ok, true);
    assert.strictEqual(rMgr.json.data.full_name, payload.full_name);
    createdStudentId = rMgr.json.data.id;
  });

  await test('ST6: PATCH /api/v1/students/:id (Teacher IEP update vs Manager full update)', async () => {
    // Teacher updates IEP notes
    const rIep = await req('PATCH', `/api/v1/students/${createdStudentId}`, {
      body: { iep_notes: 'یادداشت ویژه تحصیلی دانش‌آموز' },
      cookie: cookieTch1
    });
    assert.strictEqual(rIep.status, 200);
    assert.strictEqual(rIep.json.data.iep_notes, 'یادداشت ویژه تحصیلی دانش‌آموز');

    // Manager updates grade level
    const rMgr = await req('PATCH', `/api/v1/students/${createdStudentId}`, {
      body: { grade_level: 12 },
      cookie: cookieMgr1
    });
    assert.strictEqual(rMgr.status, 200);
    assert.strictEqual(rMgr.json.data.grade_level, 12);
  });

  await test('ST7: DELETE /api/v1/students/:id removes student', async () => {
    const rDel = await req('DELETE', `/api/v1/students/${createdStudentId}`, { cookie: cookieMgr1 });
    assert.strictEqual(rDel.status, 200);

    const rCheck = await req('GET', `/api/v1/students/${createdStudentId}`, { cookie: cookieMgr1 });
    assert.strictEqual(rCheck.status, 404);
  });

  console.log(`\nStudents API Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
