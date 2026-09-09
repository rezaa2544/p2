#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/csrf.js — F-CSRF-01: integration tests (ephemeral server)
   - جهشِ دارای نشست بدونِ X-CSRF-Token ← 403
   - توکنِ نادرست ← 403؛ توکنِ درست ← عبور
   - GET و مسیرهای پیش‌احراز (send-code/login) معاف‌اند
   - delete-account بدونِ code ← 400؛ code نادرست ← 401؛
     جریانِ کامل (send-code → delete با همان code) ← 200 + purge
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-csrf-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_SMS_COOLDOWN_S = '0';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, { body, cookie, csrf } = {}) {
  const headers = Object.assign(
    body ? { 'Content-Type': 'application/json' } : {},
    cookie ? { Cookie: cookie } : {},
    csrf ? { 'X-CSRF-Token': csrf } : {}
  );
  const res = await fetch(BASE + p, {
    method,
    headers,
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
  assert.ok(m, 'session cookie missing');
  assert.ok(c, 'csrf cookie missing');
  return { cookie: m[0], csrf: c[1], phone };
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

  const teacher = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const victim = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const other = store.users.find(u => u.role === 'student' && u.school_id === 1 && u.id !== victim.id);

  console.log('\n🛡️ Testing CSRF guard + delete-account re-auth');

  /* C1: پیش‌احراز بدونِ سرآیند عبور می‌کند (در loginAs اثبات شد) */
  const sesA = await loginAs(teacher);
  await test('C1: login بدونِ X-CSRF-Token ← ۲۰۰ (معافیتِ پیش‌احراز)', async () => {
    assert.ok(sesA.cookie && sesA.csrf);
  });

  await test('C2: GET دارای نشست بدونِ سرآیند ← ۲۰۰', async () => {
    const r = await req('GET', '/api/auth/me', { cookie: sesA.cookie });
    assert.strictEqual(r.status, 200);
  });

  await test('C3: جهش بدونِ سرآیند ← ۴۰۳ csrf_required', async () => {
    const r = await req('POST', '/api/auth/logout', { cookie: sesA.cookie });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, 'csrf_required');
  });

  await test('C4: توکنِ نادرست ← ۴۰۳ csrf_mismatch', async () => {
    const r = await req('POST', '/api/auth/logout', { cookie: sesA.cookie, csrf: '0'.repeat(64) });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.json.code, 'csrf_mismatch');
  });

  await test('C5: جهش روی v1 بدونِ سرآیند ← ۴۰۳', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      cookie: sesA.cookie,
      body: { student_id: victim.id, class_id: 1, date: '2026-09-08', status: 'present' }
    });
    assert.strictEqual(r.status, 403);
  });

  await test('C6: همان جهش با توکنِ درست ← ۲۰۱', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      cookie: sesA.cookie, csrf: sesA.csrf,
      body: { student_id: victim.id, class_id: 1, date: '2026-09-08', status: 'present' }
    });
    assert.strictEqual(r.status, 201);
  });

  await test('C7: خروج با توکنِ درست ← ۲۰۰ و نشست می‌میرد', async () => {
    const r = await req('POST', '/api/auth/logout', { cookie: sesA.cookie, csrf: sesA.csrf });
    assert.strictEqual(r.status, 200);
    const me = await req('GET', '/api/auth/me', { cookie: sesA.cookie });
    assert.strictEqual(me.status, 401);
  });

  /* ── delete-account: احرازِ مجدّد (قربانی آخر می‌میرد) ── */
  const sesV = await loginAs(victim);

  await test('C8: حذف بدونِ code ← ۴۰۰', async () => {
    const r = await req('POST', '/api/auth/delete-account', { cookie: sesV.cookie, csrf: sesV.csrf, body: {} });
    assert.strictEqual(r.status, 400);
  });

  await test('C9: حذف با code نادرست ← ۴۰۱ bad_code', async () => {
    const r = await req('POST', '/api/auth/delete-account', { cookie: sesV.cookie, csrf: sesV.csrf, body: { code: '000000' } });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.json.code, 'bad_code');
  });

  await test('C10: جریانِ کامل (کدِ تازه → حذف) ← ۲۰۰', async () => {
    const sc = await req('POST', '/api/auth/send-code', { body: { phone: sesV.phone } });
    assert.strictEqual(sc.status, 200);
    assert.ok(sc.json.demo_code);
    const r = await req('POST', '/api/auth/delete-account', { cookie: sesV.cookie, csrf: sesV.csrf, body: { code: sc.json.demo_code } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.deleted, true);
  });

  await test('C11: پس از حذف: نشست مرده + شماره ناشناخته (بدون demo_code)', async () => {
    const me = await req('GET', '/api/auth/me', { cookie: sesV.cookie });
    assert.strictEqual(me.status, 401);
    const sc = await req('POST', '/api/auth/send-code', { body: { phone: sesV.phone } });
    assert.strictEqual(sc.status, 200);
    assert.strictEqual(sc.json.code, 'sent');
    assert.ok(!sc.json.demo_code);
  });

  await test('C12: کاربرِ دیگر دست‌نخورده است', async () => {
    const s = await loginAs(other);
    const me = await req('GET', '/api/auth/me', { cookie: s.cookie });
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.json.user.id, other.id);
  });

  console.log(`\nCSRF Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
