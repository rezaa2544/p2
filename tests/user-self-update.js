#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/user-self-update.js — allowlist خودبه‌روزرسانی (P0-06)
   -------------------------------------------------------------------
   • غیر-مدیر رویِ خودش فقط: full_name / profile_picture / email
   • بقیهٔ فیلدها (phone/national_id/role/school_id/...) → 403 field_denied
   • مدیر از allowlist معاف است (رویِ خودش و دیگران)
   • sync دست‌نخورده: self در sync هم‌چنان role_denied (رفتارِ M3d)
   اجرا:  node tests/user-self-update.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const { opX } = require('./helpers/opx');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-usu-'));
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

/* F-CSRF-01: نگهبانِ مرکزیِ CSRF سرور، جهش‌های احراز‌شده را بدونِ
   X-CSRF-Token رد می‌کند. تست هم مثلِ مرورگر عمل می‌کند: کوکیِ csrf_token
   را از شیشهٔ کوکی می‌خواند و در سرآیند بازمی‌گرداند (double-submit). */
const csrfHdr = (c) => { const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(String(c || '')); return m ? { 'X-CSRF-Token': m[1] } : {}; };
const jarOf = (h) => (Array.isArray(h) ? h.join(', ') : String(h || ''))
  .split(/,(?=\s*[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/)
  .map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? Object.assign({ Cookie: cookie }, csrfHdr(cookie)) : {}
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
  if (!m) return null;
  const ct = sc.match(/csrf_token=[^;,]+/);
  return ct ? m[0] + '; ' + ct[0] : m[0];
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
  const parent1  = store.users.find(u => u.role === 'parent' && u.school_id === 1);

  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);
  const cookieStu1 = await loginAs(student1);
  const cookiePrn1 = await loginAs(parent1);

  console.log('\n🔍 P0-06 Self-Update Tests (SELF_ALLOWED_FIELDS)');

  await test('USU1: student self full_name → 200 and persisted', async () => {
    const r = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { full_name: 'نام تازهٔ تستی' }, cookie: cookieStu1,
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.full_name, 'نام تازهٔ تستی');
  });

  await test('USU2: student self phone → 403 field_denied', async () => {
    const r = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { phone: '09120000000' }, cookie: cookieStu1,
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, 'field_denied');
  });

  await test('USU3: student self role/national_id/school_id → 403', async () => {
    for(const body of [{ role: 'teacher' }, { national_id: '0012000000' }, { school_id: 2 }]){
      const r = await req('PATCH', `/api/v1/users/${student1.id}`, { body, cookie: cookieStu1 });
      assert.strictEqual(r.status, 403, JSON.stringify(body));
    }
  });

  await test('USU4: teacher self email + profile_picture → 200 and applied', async () => {
    const r = await req('PATCH', `/api/v1/users/${teacher1.id}`, {
      body: { email: 'tch1@example.com', profile_picture: 'avatars/t1.png' }, cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 200);
    const back = store.users.find(u => u.id === teacher1.id);
    assert.strictEqual(back.email, 'tch1@example.com');
    assert.strictEqual(back.profile_picture, 'avatars/t1.png');
  });

  await test('USU5: parent self full_name → 200 (self parity)', async () => {
    const r = await req('PATCH', `/api/v1/users/${parent1.id}`, {
      body: { full_name: parent1.full_name }, cookie: cookiePrn1,
    });
    assert.strictEqual(r.status, 200);
  });

  await test('USU6: manager self phone → 200 (manager exempt)', async () => {
    const r = await req('PATCH', `/api/v1/users/${manager1.id}`, {
      body: { phone: manager1.phone }, cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 200);
  });

  await test('USU7: manager updates other phone → 200 (regression)', async () => {
    const r = await req('PATCH', `/api/v1/users/${student1.id}`, {
      body: { phone: student1.phone }, cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 200);
  });

  await test('USU8: sync self users.upd still role_denied (M3d behavior pinned)', async () => {
    const r = await req('POST', '/api/sync', { cookie: cookieTch1, body: { ops: [opX({
      uid: 'usu8', by: teacher1.id, collection: 'users', type: 'upd', id: teacher1.id,
      data: { full_name: 'تلاش از سینک' },
    })] } });
    assert.strictEqual(r.json.results[0].ok, false);
    assert.strictEqual(r.json.results[0].code, 'role_denied');
  });

  console.log(`\nSelf-Update Tests: ${pass}/${pass + fail} passed`);
  server.close();
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
