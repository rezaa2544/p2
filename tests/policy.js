#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/policy.js — سیاستِ یکپارچهٔ دسترسیِ REST (P0-03)
   -------------------------------------------------------------------
   پوشش:
   • هر ۵ ماژولِ routes/v1 از authorize() می‌گذرد (ایستا + رفتاری)
   • نقش از AUTHZ مرکزی (role_denied) نه چکِ دستی (forbidden)
   • قلمرو 404-not-403 (بیرونِ قلمرو لو نمی‌رود)
   • aliasهایِ REST (late/base_version/type/profile_picture/email)
   • validate: ردِ فیلدِ ناشناخته و مقدارِ بدشکل
   • exc=self (خودبه‌روزرسانی) و exc=iep (فقط از مسیر students)
   • tenancy اداره (استان/شهرستان/ناحیه) در scope
   اجرا:  node tests/policy.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-pol-'));
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
const { createPolicy } = require(path.join(ROOT, 'server', 'policy.js'));

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
  const otherStudent = store.users.find(u => u.role === 'student' && u.school_id === 1 && u.id !== student1.id);

  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);
  const cookieStu1 = await loginAs(student1);

  console.log('\n🔍 P0-03 Policy Tests (REST authorization via server/policy.js)');

  await test('POL1: teacher POST /students denied via central role model (role_denied)', async () => {
    const r = await req('POST', '/api/v1/students', {
      body: { full_name: 'تست', national_id: '0012998877' }, cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, 'role_denied');
  });

  await test('POL2: manager PATCH cross-school class → 404 not 403 (scope hides out-of-scope)', async () => {
    const foreign = store.classes.find(c => c.school_id !== manager1.school_id);
    assert.ok(foreign, 'seed must have a class outside school 1');
    const r = await req('PATCH', `/api/v1/classes/${foreign.id}`, {
      body: { capacity: 99 }, cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.json.code, 'not_found');
  });

  await test('POL3: REST alias attendance.late accepted (validate knows REST fields)', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: student1.id, class_id: 1, date: '2026-09-09', status: 'late', late: 15 },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.data.late, 15);
  });

  await test('POL4: unknown field rejected with unknown_field (validate wired)', async () => {
    const r = await req('POST', '/api/v1/classes', {
      body: { name: 'کلاس تست', grade: 10, bogus_field_xyz: 1 }, cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, 'unknown_field');
  });

  await test('POL5: teacher IEP via /students 200 but via /users 403', async () => {
    const rOk = await req('PATCH', `/api/v1/students/${student1.id}`, {
      body: { iep_notes: 'یادداشت IEP تستی' }, cookie: cookieTch1,
    });
    assert.strictEqual(rOk.status, 200);
    const rNo = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { iep_notes: 'یادداشت IEP تستی' }, cookie: cookieTch1,
    });
    assert.strictEqual(rNo.status, 403);
  });

  await test('POL6: self-update allowed (self exc), other-user update 403', async () => {
    const rSelf = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { full_name: student1.full_name }, cookie: cookieStu1,
    });
    assert.strictEqual(rSelf.status, 200);
    const rOther = await req('PATCH', `/api/v1/users/${otherStudent.id}`, {
      body: { full_name: 'دست‌کاری' }, cookie: cookieStu1,
    });
    assert.strictEqual(rOther.status, 403);
  });

  await test('POL7: every v1 route handler calls policy.authorize (no bypass)', async () => {
    const expect = { attendance: 4, grades: 4, students: 5, classes: 5, users: 5 };
    for(const [name, min] of Object.entries(expect)){
      const src = fs.readFileSync(path.join(ROOT, 'server', 'routes', name + '.js'), 'utf8');
      assert.ok(src.includes("require('../policy')"), `${name}.js does not require ../policy`);
      const n = (src.match(/policy\.authorize/g) || []).length;
      assert.ok(n >= min, `${name}.js has ${n} authorize calls, want ≥${min}`);
    }
  });

  await test('POL8: sync/REST parity — teacher attendance scope in own vs foreign class', async () => {
    const policy = createPolicy({ store });
    const own = policy.authorize(teacher1, 'ins', { coll: 'attendance' },
      { student_id: student1.id, class_id: 1, school_id: 1 });
    assert.strictEqual(own.ok, true, 'teacher must record attendance in own class');
    const foreignStudent = store.users.find(u => u.role === 'student' && u.school_id !== 1);
    assert.ok(foreignStudent, 'seed must have a student outside school 1');
    const fr = policy.authorize(teacher1, 'ins', { coll: 'attendance' },
      { student_id: foreignStudent.id, school_id: foreignStudent.school_id });
    assert.strictEqual(fr.ok, false);
    assert.strictEqual(fr.status, 404);
  });

  await test('POL9: office tenancy scope — province/county/district levels', async () => {
    const policy = createPolicy({ store });
    const prov = store.users.find(u => u.id === 1026); /* استان ۱ */
    const county = store.users.find(u => u.id === 1027); /* شهرستان ۲ استان ۱ */
    const district = store.users.find(u => u.id === 1028); /* ناحیه ۱ */
    assert.ok(prov && county && district, 'seed office users 1026..1028 must exist');
    /* استان ۱: مدرسه‌های ۱،۲،۵ داخل؛ مدرسه ۳ (استان ۲) بیرون */
    assert.strictEqual(policy.scope(prov, { coll: 'classes', data: { school_id: 1 } }), true);
    assert.strictEqual(policy.scope(prov, { coll: 'classes', data: { school_id: 5 } }), true);
    assert.strictEqual(policy.scope(prov, { coll: 'classes', data: { school_id: 3 } }), false);
    /* شهرستان ۲: فقط مدرسه ۵ */
    assert.strictEqual(policy.scope(county, { coll: 'classes', data: { school_id: 5 } }), true);
    assert.strictEqual(policy.scope(county, { coll: 'classes', data: { school_id: 1 } }), false);
    assert.strictEqual(policy.scope(county, { coll: 'classes', data: { school_id: 3 } }), false);
    /* ناحیه ۱: فقط مدرسه ۱ */
    assert.strictEqual(policy.scope(district, { coll: 'classes', data: { school_id: 1 } }), true);
    assert.strictEqual(policy.scope(district, { coll: 'classes', data: { school_id: 2 } }), false);
  });

  await test('POL10: malformed value rejected with invalid (shape validation)', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: student1.id, class_id: 1, date: '2026-09-09', status: 12345 },
      cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.code, 'invalid');
  });

  console.log(`\nPolicy Tests: ${pass}/${pass + fail} passed`);
  server.close();
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
