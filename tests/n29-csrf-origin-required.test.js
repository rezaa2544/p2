#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n29-csrf-origin-required.test.js — N-29 regression guard
   -------------------------------------------------------------------
   N-29 (شدت: HIGH): دروازهٔ CSRF درخواست‌هایِ نوشتاریِ بدونِ Origin و
   بدونِ Referer را مجاز می‌شمرد (csrf.js: header_absent → ok). یک
   مرورگرِ واقعی همیشه حداقل یکی از این دو را رویِ POST/PUT/PATCH/DELETE
   می‌فرستد، پس غیبتِ هر دو مسیرِ جعلِ کوکی (یا کلاینتِ غیرِمرورگری)
   است که SameSite=Lax آن را پوشش نمی‌دهد.

   اصلاح: fail-closed در production (یا PAYESH_STRICT_CSRF=1) + سیگنالِ
   تکمیلیِ Sec-Fetch-Site. رفتارِ قدیمی با PAYESH_STRICT_CSRF=0 قابلِ
   بازگرداندن است.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n29-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

const { server, store } = require('../server/index.js');
const csrf = require('../server/csrf.js');

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, opts) {
  const options = opts || {};
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.cookie ? { Cookie: options.cookie } : {},
      options.headers || {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', {
    body: { phone },
    headers: { origin: 'http://127.0.0.1:0' }
  });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  const nid = String(user.national_id);
  r = await req('POST', '/api/auth/login', {
    body: { phone, code, national_id: nid },
    headers: { origin: 'http://127.0.0.1:0' }
  });
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

function mkReq(headers, method, url) {
  return { method: method || 'POST', url: url || '/api/sync', headers: headers || {} };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  const origin = 'http://127.0.0.1:' + server.address().port;

  console.log('\n🔍 N-29: CSRF origin-required gate');

  /* N29-1 — مانیفستِ خطا: در strict mode یک نوشتنِ بدونِ Origin و Referer
     باید رد شود (fail-closed). */
  await test('N29-1: strict mode rejects writes with no Origin and no Referer', async () => {
    const saved = { s: process.env.PAYESH_STRICT_CSRF, e: process.env.PAYESH_ENV, n: process.env.NODE_ENV };
    try {
      process.env.PAYESH_STRICT_CSRF = '1';
      const d = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1' }));
      assert.ok(!d.ok, 'باید رد شود ولی ' + JSON.stringify(d) + ' شد');
      assert.strictEqual(d.code, 'csrf_origin_required', 'code باید csrf_origin_required باشد ولی ' + d.code + ' شد');
    } finally {
      process.env.PAYESH_STRICT_CSRF = saved.s;
      process.env.PAYESH_ENV = saved.e;
      process.env.NODE_ENV = saved.n;
    }
    /* بدونِ strict mode رفتارِ قدیمی حفظ می‌شود (dev/test). */
    const d2 = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1' }));
    assert.ok(d2.ok, 'در dev باید header_absent مجاز بماند ولی ' + JSON.stringify(d2) + ' شد');
    assert.strictEqual(d2.code, 'header_absent');
  });

  /* N29-2 — پیش‌فرض در production: NODE_ENV/PAYESH_ENV=production کافی
     است؛ تنظیمِ صریحِ 0 آن را بیازارد. */
  await test('N29-2: production env defaults to strict; explicit 0 opts out', async () => {
    const saved = { s: process.env.PAYESH_STRICT_CSRF, e: process.env.PAYESH_ENV, n: process.env.NODE_ENV };
    try {
      process.env.PAYESH_STRICT_CSRF = '';
      process.env.PAYESH_ENV = 'production';
      process.env.NODE_ENV = '';
      assert.ok(csrf.strictCsrfEnabled(), 'PAYESH_ENV=production باید strict باشد');
      assert.ok(!csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1' })).ok, 'باید رد شود');
      process.env.PAYESH_ENV = '';
      process.env.NODE_ENV = 'production';
      assert.ok(csrf.strictCsrfEnabled(), 'NODE_ENV=production باید strict باشد');
      process.env.PAYESH_STRICT_CSRF = '0';
      assert.ok(!csrf.strictCsrfEnabled(), 'تنظیمِ صریحِ 0 باید ابطال کند');
      assert.ok(csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1' })).ok, 'با 0 باید مجاز شود');
    } finally {
      process.env.PAYESH_STRICT_CSRF = saved.s;
      process.env.PAYESH_ENV = saved.e;
      process.env.NODE_ENV = saved.n;
    }
  });

  /* N29-3 — کنترلِ مثبت: یک Originِ همسان هنوز مجاز است (اصلاح نباید
     مرورگرِ واقعی را بشکند). */
  await test('N29-3: same-origin writes still pass in strict mode', async () => {
    const saved = { s: process.env.PAYESH_STRICT_CSRF, e: process.env.PAYESH_ENV, n: process.env.NODE_ENV };
    try {
      process.env.PAYESH_STRICT_CSRF = '1';
      const d = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1', origin: 'http://127.0.0.1' }));
      assert.ok(d.ok, 'Originِ همسان باید مجاز باشد ولی ' + JSON.stringify(d) + ' شد');
      assert.strictEqual(d.code, 'origin_match');
      const d2 = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1', referer: 'http://127.0.0.1/api/x' }));
      assert.ok(d2.ok, 'Refererِ همسان باید مجاز باشد ولی ' + JSON.stringify(d2) + ' شد');
      assert.strictEqual(d2.code, 'referer_match');
    } finally {
      process.env.PAYESH_STRICT_CSRF = saved.s;
      process.env.PAYESH_ENV = saved.e;
      process.env.NODE_ENV = saved.n;
    }
  });

  /* N29-4 — مانیفستِ خطا (پویا): یک POSTِ واقعیِ بدونِ Origin/Referer
     با strict mode از طریق HTTP رد می‌شود (نه فقط تابعِ خالص). */
  await test('N29-4: live strict-mode POST with no headers is denied', async () => {
    const saved = { s: process.env.PAYESH_STRICT_CSRF, e: process.env.PAYESH_ENV, n: process.env.NODE_ENV };
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    try {
      process.env.PAYESH_STRICT_CSRF = '1';
      const cookie = await loginAs(manager);
      assert.ok(cookie, 'ورود ناموفق بود');
      /* بدونِ سرآیندِ Origin/Referer — fetchِ Node هیچکدام را نمی‌فرستد. */
      const r = await req('POST', '/api/sync', { body: { ops: [] }, cookie });
      assert.ok(r.status === 403, 'sync باید 403 باشد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
      assert.strictEqual(r.json.code, 'csrf_origin_required',
        'code باید csrf_origin_required باشد ولی ' + r.json.code + ' شد');
    } finally {
      process.env.PAYESH_STRICT_CSRF = saved.s;
      process.env.PAYESH_ENV = saved.e;
      process.env.NODE_ENV = saved.n;
    }
    /* پس از بازگرداندنِ تنظیم، همان مسیر دوباره قابلِ دسترسی است. */
    const r2 = await req('GET', '/api/health');
    assert.ok(r2.status === 200, 'GET باید همیشه مجاز باشد ولی ' + r2.status + ' بود');
  });

  /* N29-5 — Sec-Fetch-Site: یک درخواستِ cross-site صراحتاً flagged حتی
     اگر Origin/Referer غایب باشند (defense-in-depth). و GET ها تحتِ
     تأثیر نیستند. */
  await test('N29-5: Sec-Fetch-Site cross-site is denied; safe methods unaffected', async () => {
    const d = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1', 'sec-fetch-site': 'cross-site' }));
    assert.ok(!d.ok, 'cross-site باید رد شود ولی ' + JSON.stringify(d) + ' شد');
    assert.strictEqual(d.code, 'csrf_fetch_site_cross-site');
    const d2 = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1', 'sec-fetch-site': 'same-origin' }));
    assert.ok(d2.ok, 'same-origin نباید رد شود ولی ' + JSON.stringify(d2) + ' شد');
    const dGet = csrf.checkCsrfOrigin(mkReq({ host: '127.0.0.1' }, 'GET'), undefined);
    assert.ok(dGet.ok, 'GET باید not_applicable باشد');
    assert.strictEqual(dGet.code, 'not_applicable');
  });

  console.log(`\nN-29 CSRF Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
