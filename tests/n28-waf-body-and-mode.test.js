#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n28-waf-body-and-mode.test.js — N-28 regression guard
   -------------------------------------------------------------------
   N-28 (شدت: HIGH): WAF فقط URL و User-Agent را بررسی می‌کرد و بدنهٔ
   درخواست را هرگز نمی‌دید؛ ضمناً حالتِ پیش‌فرض report (فقط-تشخیص) بود،
   یعنی حتی در production هم مسدود نمی‌کرد مگر با تنظیمِ دستی.

   دو نیمهٔ اصلاح:
     ۱) پیش‌فرض در production اکنون enforce است (قابلِ ابطال با report).
     ۲) بدنهٔ POST/PUT/PATCH بررسی می‌شود — بدنه کامل خوانده، روی req
        نگه داشته و توسط readBody بازپخش می‌شود تا مسیرها بدنهٔ کامل
        ببینند (unshift بعد از رویدادِ end مجاز نیست).

   payload های مهاجمتی از fixtures/n28-payloads.json خوانده می‌شوند تا
   الگویِ متنیِ خطرناک در منبعِ تست ظاهر نشود.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n28-'));
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
const PL = require('./fixtures/n28-payloads.json');

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, opts) {
  const options = opts || {};
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.cookie ? { Cookie: options.cookie } : {}
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
  const waf = require('../server/waf.js');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  assert.ok(manager, 'دادهٔ نمونه manager نیست');
  const cookie = await loginAs(manager);
  assert.ok(cookie, 'ورود ناموفق بود');

  console.log('\n🔍 N-28: WAF body inspection + production mode');

  /* N28-1 — مانیفستِ خطا: تزریقِ SQL در بدنهٔ POST شناسایی می‌شود. */
  await test('N28-1: SQLi in POST body is detected', async () => {
    const v = waf.evaluateBody(JSON.stringify({ note: PL.sqli_or }));
    assert.ok(v, 'بدنهٔ مخرب باید verdict بدهد');
    assert.strictEqual(v.field, 'body');
    const v2 = waf.evaluateBody(JSON.stringify({ q: PL.sqli_union }));
    assert.ok(v2, 'UNION SELECT در بدنه باید شناسایی شود');
    assert.strictEqual(v2.rule, 'sqli_body');
  });

  /* N28-2 — مانیفستِ خطا: XSS در بدنه شناسایی می‌شود ولی بدنهٔ عادی
     (نامِ فارسی، یادداشتِ عادی) نباید false-positive بدهد. */
  await test('N28-2: XSS in body detected; benign Persian body stays clean', async () => {
    const v = waf.evaluateBody(JSON.stringify({ title: PL.xss_script }));
    assert.ok(v, 'script در بدنه باید شناسایی شود');
    assert.strictEqual(v.rule, 'xss_body');
    const clean = waf.evaluateBody(JSON.stringify({ title: PL.benign_title, note: PL.benign_note }));
    assert.strictEqual(clean, null, 'بدنهٔ عادی نباید verdict بدهد');
  });

  /* N28-3 — حفظِ بدنه برای مسیر: یک POSTِ مشروع باید هنوز کار کند —
     یعنی readBody بدنهٔ کاملی که WAF خوانده را بازپخش می‌کند. این
     حیاتی‌ترین کنترل است: اگر بدنه گم شود کلِ API می‌شکند. */
  await test('N28-3: legitimate POST body still reaches the route (replay)', async () => {
    const r = await req('POST', '/api/v1/users', {
      body: { full_name: 'کاربرِ تستِ N-28', role: 'teacher' },
      cookie
    });
    assert.strictEqual(r.status, 201, 'POST باید 201 باشد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
    assert.strictEqual(r.json.data.full_name, 'کاربرِ تستِ N-28');
    assert.strictEqual(r.json.data.role, 'teacher');
  });

  /* N28-4 — مانیفستِ خطا: حالتِ پیش‌فرض در production باید enforce باشد،
     در dev/test همچنان report. */
  await test('N28-4: default mode is enforce in production, report otherwise', async () => {
    const saved = {
      mode: process.env.PAYESH_WAF_MODE,
      env: process.env.PAYESH_ENV,
      node: process.env.NODE_ENV
    };
    try {
      process.env.PAYESH_WAF_MODE = '';
      process.env.PAYESH_ENV = 'production';
      process.env.NODE_ENV = '';
      assert.strictEqual(waf.detectWafMode(), 'enforce', 'production باید enforce باشد');
      process.env.PAYESH_ENV = '';
      process.env.NODE_ENV = 'production';
      assert.strictEqual(waf.detectWafMode(), 'enforce', 'NODE_ENV=production هم باید enforce باشد');
      process.env.PAYESH_ENV = 'development';
      process.env.NODE_ENV = 'test';
      assert.strictEqual(waf.detectWafMode(), 'report', 'dev/test باید report بماند');
      process.env.PAYESH_WAF_MODE = 'report';
      process.env.PAYESH_ENV = 'production';
      assert.strictEqual(waf.detectWafMode(), 'report', 'تنظیمِ صریحِ report باید production را بیازارد');
      process.env.PAYESH_WAF_MODE = 'enforce';
      process.env.PAYESH_ENV = 'development';
      assert.strictEqual(waf.detectWafMode(), 'enforce', 'تنظیمِ صریحِ enforce معتبر است');
    } finally {
      process.env.PAYESH_WAF_MODE = saved.mode;
      process.env.PAYESH_ENV = saved.env;
      process.env.NODE_ENV = saved.node;
    }
  });

  /* N28-5 — مسیرهای بدنه‌دار متعدد: users POST (در N28-3) + attendance
     PATCH هر دو باید با بدنهٔ معتبر کار کنند (پوششِ replay رویِ چند مسیر).
     از کوکیِ همان جلسه استفاده می‌شود تا دربِ OTP-cooldown باز نماند. */
  await test('N28-5: multiple body routes work (users POST + attendance PATCH)', async () => {
    const rUser = await req('POST', '/api/v1/users', {
      body: { full_name: 'کاربرِ تستِ N-28 پنج', role: 'counselor' },
      cookie
    });
    assert.strictEqual(rUser.status, 201, 'POST باید 201 باشد ولی ' + rUser.status + ' بود: ' + JSON.stringify(rUser.json));
    assert.strictEqual(rUser.json.data.role, 'counselor');

    const student = store.users.find(u => u.role === 'student' && u.school_id === 1);
    const att = (store.attendance || []).find(a => a.student_id === student.id);
    assert.ok(att, 'دادهٔ نمونه attendance نیست');
    const rPatch = await req('PATCH', '/api/v1/attendance/' + att.id, {
      body: { note: 'یادداشتِ تستِ N-28', base_version: att.version || 1 },
      cookie
    });
    assert.ok(rPatch.status === 200 || rPatch.status === 403,
      'PATCH باید 200 یا 403 (scope) باشد ولی ' + rPatch.status + ' بود');
  });

  console.log(`\nN-28 WAF Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
