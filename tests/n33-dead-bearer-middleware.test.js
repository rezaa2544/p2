#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n33-dead-bearer-middleware.test.js — N-33 regression guard
   -------------------------------------------------------------------
   N-33 (شدت: LOW): server/middleware/auth.js یک میان‌افزارِ احرازِ
   هویت با مسیرِ Authorization: Bearer <token> بود که هرگز در هیچ‌کجایِ
   سرور import نمی‌شد. سرورِ زنده فقط cookie را می‌خواند
   (auth.sessionFrom). نتیجه: یک کدِ مرده که یک قابلیتِ امنیتیِ
   (احرازِ Bearer) را که وجود نداشت، مستند می‌کرد — خطرِ واقعی‌اش
   این است که توسعه‌دهنده‌ای به آن اتکا کند یا بعداً به‌اشتباه فعالش
   کند (مسیرِ Bearer درخواست‌های API را بدونِ SameSite/cookie حفاظت
   باز می‌کند).

   اصلاح: فایلِ مرده حذف شد. این تست اثبات می‌کند که (الف) Bearer
   هیچ‌گاه احراز هویت نمی‌کرده، (ب) فایل حذف شده و در گرافِ ماژولِ
   سرور نیست.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n33-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

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
  /* خودِ توکنِ session را برایِ تزریقِ به‌عنوان Bearer استخراج می‌کنیم */
  const token = cookie.replace(/^payesh_session=/, '');

  console.log('\n🔍 N-33: dead Bearer middleware removed; Bearer never authenticated');

  /* N33-1 — مانیفستِ خطا: مسیرِ Bearer که فایلِ مرده ادعا می‌کرد،
     هرگز در سرورِ زنده وجود نداشت. یک Authorization: Bearer معتبر
     نباید دسترسی بدهد (احرازِ هویت فقط از cookie می‌آید). */
  await test('N33-1: a valid session token in the Bearer header does NOT authenticate', async () => {
    const r = await req('GET', '/api/v1/students', { headers: { authorization: 'Bearer ' + token } });
    assert.strictEqual(r.status, 401, 'Bearer نباید دسترسی بدهد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
    assert.strictEqual(r.json.code, 'unauthorized');
  });

  /* N33-2 — کنترلِ مثبت: همان توکن در cookie درست کار می‌کند. */
  await test('N33-2: the same token in the cookie authenticates', async () => {
    const r = await req('GET', '/api/v1/students', { cookie });
    assert.strictEqual(r.status, 200, 'cookie باید 200 باشد ولی ' + r.status + ' بود');
  });

  /* N33-3 — فایلِ مرده حذف شده. */
  await test('N33-3: server/middleware/auth.js no longer exists', async () => {
    const p = path.join(ROOT, 'server', 'middleware', 'auth.js');
    assert.ok(!fs.existsSync(p), 'فایلِ میان‌افزارِ مرده باید حذف شده باشد: ' + p);
  });

  /* N33-4 — در گرافِ ماژولِ بارگذاری‌شدهٔ سرور نیست (اگر کسی آن را
     بعداً برگرداند و import کند، این تست او را متوقف می‌کند). */
  await test('N33-4: nothing in the server module graph exports createAuthMiddleware', async () => {
    const ids = Object.keys(require.cache).filter(f => f.indexOf(path.join('server', 'middleware')) !== -1);
    for (const f of ids) {
      const m = require.cache[f];
      const exp = m && m.exports;
      assert.ok(!exp || typeof exp.createAuthMiddleware !== 'function',
        'هیچ میان‌افزاری نباید createAuthMiddleware صادر کند: ' + f);
    }
    /* و ایجادِ مستقیمِ routeها هم آن را نمی‌سازد */
    assert.ok(typeof require('../server/index.js').createAuthMiddleware !== 'function',
      'سرور نباید createAuthMiddleware را افشا کند');
  });

  /* N33-5 — قراردادِ واقعیِ سرور: احرازِ هویت فقط cookie است. هر
     ترکیبِ ممکن از سرآیندهایِ Authorization (پسوندِ توکن، حالت‌های
     مختلف) نباید هیچ مسیرِ محافظت‌شده‌ای را باز کند. این رفتار را روی
     چند مسیرِ متمرکز بررسی می‌کنیم تا نبودِ مسیرِ Bearer اثبات شود. */
  await test('N33-5: no Authorization variant opens any protected route', async () => {
    const variants = [
      { authorization: 'Bearer ' + token },
      { authorization: 'bearer ' + token },
      { authorization: 'Bearer ' + token + '; ' + cookie.replace('payesh_session=', 'session=') },
      { Authorization: 'Bearer ' + token, cookie: 'payesh_session=' }
    ];
    const routes = [
      ['GET', '/api/v1/students'],
      ['GET', '/api/v1/students/' + (store.users.find(u => u.role === 'student' && u.school_id === 1) || {}).id],
      ['GET', '/api/auth/me']
    ];
    for (const h of variants) {
      for (const [m, p] of routes) {
        const r = await req(m, p, { headers: h });
        assert.strictEqual(r.status, 401,
          m + ' ' + p + ' با Authorization باید 401 باشد ولی ' + r.status + ' بود (' + JSON.stringify(h).slice(0, 60) + ')');
      }
    }
  });

  console.log(`\nN-33 Dead Middleware Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
