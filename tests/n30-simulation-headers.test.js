#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n30-simulation-headers.test.js — N-30 regression guard
   -------------------------------------------------------------------
   N-30 (شدت: HIGH): دروازهٔ مهارِ ظرفیتِ ملی سرآیندهای x-simulated-*
   را بدون هیچ opt-in صریحی در مسیرِ production می‌پذیرفت. یک مهاجم
   می‌توانست با x-simulated-rps:999999 یک 429 کاذب روی writes تولید کند
   (انکارِ سرویس) یا با x-simulated-rps:0 اندازه‌گیرِ واقعی را تحریف کند.

   اصلاح: این سرآیندها فقط با PAYESH_SIMULATION_HEADERS=1 (opt-in صریحِ
   dev/test) خوانده می‌شوند. در نبودِ آن، اندازه‌گیرهایِ واقعیِ rolling
   window مرجع‌اند و سرآیندها کاملاً بی‌اثرند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n30-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';
/* توجه: PAYESH_SIMULATION_HEADERS عمداً set نمی‌شود — حالتِ پیش‌فرض
   (production) خودِ موضوعِ تست است. */

const { server, store } = require('../server/index.js');

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
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200, 'send-code ناموفق: ' + r.status);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200, 'login ناموفق: ' + r.status);
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

  const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  assert.ok(manager, 'دادهٔ نمونه manager نیست');
  const cookie = await loginAs(manager);
  assert.ok(cookie, 'ورود ناموفق بود');

  console.log('\n🔍 N-30: simulation headers not trusted without explicit opt-in');

  /* N30-1 — مانیفستِ خطا: یک مهاجم با x-simulated-rps:999999 روی یک
     مسیرِ گیت‌دار (students) نباید 429 کاذب تولید کند. بدونِ اصلاح،
     این سرآیند مستقیماً واردِ observedMetrics.rps می‌شد و سرویس را
     برایِ همه قطع می‌کرد. */
  await test('N30-1: forged x-simulated-rps cannot 429 a gated read route', async () => {
    const r = await req('GET', '/api/v1/students', {
      cookie,
      headers: { 'x-simulated-rps': '999999' }
    });
    assert.strictEqual(r.status, 200, 'GET students باید 200 باشد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
    assert.strictEqual(r.json.ok, true);
  });

  /* N30-2 — مانیفستِ خطا (جهتِ دوم): x-simulated-writes روی مسیرِ sync
     نباید یک write را به 429 کاذب تبدیل کند (انکارِ سرویس). */
  await test('N30-2: forged x-simulated-writes cannot 429 a gated write route', async () => {
    const r = await req('POST', '/api/sync', {
      body: { ops: [] },
      cookie,
      headers: { 'x-simulated-writes': '999999999' }
    });
    assert.notStrictEqual(r.status, 429, 'نباید 429 کاذب بخورد: ' + JSON.stringify(r.json));
    assert.strictEqual(r.status, 200, 'sync خالی باید 200 باشد ولی ' + r.status + ' بود');
  });

  /* N30-3 — کنترلِ مثبت: با PAYESH_SIMULATION_HEADERS=1 مسیرِ شبیه‌سازی
     دوباره کار می‌کند (این یک ابزارِ dev/test است، نه حفره). */
  await test('N30-3: PAYESH_SIMULATION_HEADERS=1 re-enables the headers', async () => {
    const saved = process.env.PAYESH_SIMULATION_HEADERS;
    try {
      process.env.PAYESH_SIMULATION_HEADERS = '1';      const rGet = await req('GET', '/api/v1/students', {
        cookie,
        headers: { 'x-simulated-rps': '999999' }
      });
      assert.strictEqual(rGet.status, 429, 'با opt-in، rpsِ شبیه‌سازی باید 429 بدهد ولی ' + rGet.status + ' بود');
      assert.strictEqual(rGet.json.code, 'PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH');
      const rWrite = await req('POST', '/api/sync', {
        body: { ops: [] },
        cookie,
        headers: { 'x-simulated-writes': '999999999' }
      });
      assert.strictEqual(rWrite.status, 429, 'با opt-in، writesِ شبیه‌سازی باید 429 بدهد ولی ' + rWrite.status + ' بود');
    } finally {
      /* process.env.X = undefined آن را به رشتهٔ 'undefined' تبدیل می‌کند
         (truthy) — باید با delete برگردانده شود. */
      if (saved === undefined) delete process.env.PAYESH_SIMULATION_HEADERS;
      else process.env.PAYESH_SIMULATION_HEADERS = saved;
    }
  });

  /* N30-4 — پس از برداشتنِ opt-in، همان سرآیندها دوباره بی‌اثرند.
     این سناریو اثبات می‌کند که env در هر درخواست خوانده می‌شود، نه
     یک‌بار در boot-time cache شود. */
  await test('N30-4: dropping the flag mid-process makes headers inert again', async () => {
    assert.ok(!process.env.PAYESH_SIMULATION_HEADERS, 'فلگ نباید set باشد');
    const rGet = await req('GET', '/api/v1/students', {
      cookie,
      headers: { 'x-simulated-rps': '999999' }
    });
    assert.strictEqual(rGet.status, 200, 'بدونِ opt-in باید 200 باشد ولی ' + rGet.status + ' بود');
    const rWrite = await req('POST', '/api/sync', {
      body: { ops: [] },
      cookie,
      headers: { 'x-simulated-writes': '999999999' }
    });
    assert.strictEqual(rWrite.status, 200, 'بدونِ opt-in sync باید 200 باشد ولی ' + rWrite.status + ' بود');
  });

  /* N30-5 — سرآیندهای نیمه‌معتبر، خالی، غیرعددی و منفی روی مسیرهای
     گیت‌دار نباید گیت را ناپایدار کنند یا تبدیل به 429/500 کنند. */
  await test('N30-5: malformed simulation headers do not destabilize the gate', async () => {
    const cases = [
      { 'x-simulated-rps': '' },
      { 'x-simulated-rps': 'abc' },
      { 'x-simulated-rps': '-5' },
      { 'x-simulated-writes': 'NaN' },
      { 'x-simulated-concurrent-users': '1e308' },
      { 'x-simulated-db-connections': '0' },
      { 'x-simulated-rps': '999999', 'x-simulated-writes': '999999' }
    ];
    for (const h of cases) {
      const rGet = await req('GET', '/api/v1/students', { cookie, headers: h });
      assert.strictEqual(rGet.status, 200,
        'GET با سرآیندِ نامعتبر باید 200 باشد (' + JSON.stringify(h) + ') ولی ' + rGet.status + ' بود');
      const rWrite = await req('POST', '/api/sync', { body: { ops: [] }, cookie, headers: h });
      assert.strictEqual(rWrite.status, 200,
        'POST sync با سرآیندِ نامعتبر باید 200 باشد (' + JSON.stringify(h) + ') ولی ' + rWrite.status + ' بود');
    }
  });

  console.log(`\nN-30 Simulation Headers Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
