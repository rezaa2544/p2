#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/edu-scope.js — tenancy رسمیِ اداره (P0-07)
   -------------------------------------------------------------------
   • پایانِ global-pass اداره در خوانش (filter/checkSchoolScope) و sync (inScope)
   • استان ۱ (١٠٢٦): مدرسه‌های {۱،۲،۵} • شهرستان ۲ (١٠٢٧): {۵}
     ناحیه ۱ (١٠٢٨): {۱} • استان ۲ (١٠٢٩): {۳،۶}
   اجرا:  node tests/edu-scope.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const { opX } = require('./helpers/opx');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-edu-'));
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

  const offProv1 = store.users.find(u => u.id === 1026);
  const offCounty = store.users.find(u => u.id === 1027);
  const offDistrict = store.users.find(u => u.id === 1028);
  const offProv2 = store.users.find(u => u.id === 1029);
  assert.ok(offProv1 && offCounty && offDistrict && offProv2, 'seed office users 1026..1029 must exist');

  const cProv1 = await loginAs(offProv1);
  const cCounty = await loginAs(offCounty);
  const cDistrict = await loginAs(offDistrict);
  const cProv2 = await loginAs(offProv2);

  console.log('\n🔍 P0-07 Office Tenancy Tests (edu_office scope)');

  await test('EDU1: province office GET /students sees exactly schools {1,2,5}', async () => {
    const r = await req('GET', '/api/v1/students?limit=100', { cookie: cProv1 });
    assert.strictEqual(r.status, 200);
    const want = new Set([1, 2, 5]);
    assert.ok(r.json.data.length > 0, 'office must see students');
    assert.ok(r.json.data.every(s => want.has(s.school_id)), 'every student must be in-province');
    const expected = store.users.filter(u => u.role === 'student' && want.has(u.school_id)).length;
    assert.strictEqual(r.json.pagination.total, expected, 'total must equal in-tenancy count');
  });

  await test('EDU2: province office GET student by id — in-tenancy 200, foreign 404', async () => {
    const own = store.users.find(u => u.role === 'student' && u.school_id === 1);
    const fr = store.users.find(u => u.role === 'student' && u.school_id === 3);
    assert.ok(own && fr, 'seed needs students in schools 1 and 3');
    const rOwn = await req('GET', `/api/v1/students/${own.id}`, { cookie: cProv1 });
    assert.strictEqual(rOwn.status, 200);
    const rFr = await req('GET', `/api/v1/students/${fr.id}`, { cookie: cProv1 });
    assert.strictEqual(rFr.status, 404);
  });

  await test('EDU3: county office GET /classes sees only school 5', async () => {
    const r = await req('GET', '/api/v1/classes?limit=100', { cookie: cCounty });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.length > 0, 'county office must see classes');
    assert.ok(r.json.data.every(c => c.school_id === 5), 'every class must be school 5');
  });

  await test('EDU4: district office GET /attendance sees only school 1', async () => {
    const r = await req('GET', '/api/v1/attendance?limit=100', { cookie: cDistrict });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.length > 0, 'district office must see records');
    assert.ok(r.json.data.every(a => a.school_id === 1), 'every record must be school 1');
  });

  await test('EDU5: province-2 office GET /grades sees only schools {3,6}', async () => {
    const r = await req('GET', '/api/v1/grades?limit=100', { cookie: cProv2 });
    assert.strictEqual(r.status, 200);
    const want = new Set([3, 6]);
    assert.ok(r.json.data.length > 0, 'office must see grades');
    assert.ok(r.json.data.every(g => want.has(g.school_id)), 'every grade must be in-province');
  });

  await test('EDU6: office GET /users — in-tenancy or null-school only', async () => {
    const r = await req('GET', '/api/v1/users?limit=100', { cookie: cProv1 });
    assert.strictEqual(r.status, 200);
    const want = new Set([1, 2, 5]);
    assert.ok(r.json.data.every(u => u.school_id == null || want.has(u.school_id)),
      'no foreign-school user may leak');
    const expected = store.users.filter(u => u.school_id == null || want.has(u.school_id)).length;
    assert.strictEqual(r.json.pagination.total, expected, 'total must equal in-tenancy (+null) count');
    assert.ok(expected > store.users.filter(u => u.school_id === 1).length,
      'cross-school visibility inside tenancy must work');
  });

  await test('EDU7: sync parity — office write in-tenancy ok, foreign out_of_scope', async () => {
    const good = await req('POST', '/api/sync', { cookie: cProv1, body: { ops: [opX({
      uid: 'edu7-good', by: offProv1.id, collection: 'announcements', type: 'ins',
      data: { school_id: 1, title: 'اطلاعیه اداره', body: 'تست', audience: 'all' },
    })] } });
    assert.strictEqual(good.json.results[0].ok, true, JSON.stringify(good.json.results[0]).slice(0, 200));
    const bad = await req('POST', '/api/sync', { cookie: cProv1, body: { ops: [opX({
      uid: 'edu7-bad', by: offProv1.id, collection: 'announcements', type: 'ins',
      data: { school_id: 3, title: 'اطلاعیه اداره', body: 'تست', audience: 'all' },
    })] } });
    assert.strictEqual(bad.json.results[0].ok, false);
    assert.strictEqual(bad.json.results[0].code, 'out_of_scope');
  });

  console.log(`\nOffice Tenancy Tests: ${pass}/${pass + fail} passed`);
  server.close();
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
