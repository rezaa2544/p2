#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n35-region-resolver-no-implicit-one.test.js — N-35 regression guard
   -------------------------------------------------------------------
   N-35 (شدت: LOW): هشت فراخوان در server/routes/analytics.js از
   `user.region_id || 1` استفاده می‌کردند. در دادهٔ واقعی هیچ کاربری
   region_id ندارد — پس خروجیِ هر گواهیِ انتشار به‌صورتِ ضمنی به
   «منطقهٔ ۱» گره می‌خورد. نتیجه: گواهیِ مدرسه‌ای در تهران یا کردستان
   به منطقهٔ ۱ نسبت داده می‌شد و قابلیتِ تشخیصِ منطقهٔ واقعی از بین
   می‌رفت.

   اصلاح: resolveReportRegion اول منطقهٔ خودِ کاربر، سپس منطقهٔ مدرسهٔ
   هدف را برمی‌دارد و اگر هیچ‌کدام نبود null (نامشخص) برمی‌گرداند —
   نه ۱. موتور هم null را حفظ می‌کند (پیش‌فرضِ ۱ فقط برای کلیدِ غایب).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n35-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

const { server, store } = require('../server/index.js');
const { createAnalyticsRoutes } = require('../server/routes/analytics.js');

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
  assert.ok(manager.region_id == null, 'مدیرِ نمونه نباید region_id داشته باشد (پیش‌شرط)');

  const cookie = await loginAs(manager);
  assert.ok(cookie, 'ورود ناموفق بود');

  console.log('\n🔍 N-35: no implicit region 1 for unscoped users');

  /* N35-1 — مانیفستِ خطا: گواهیِ یک کاربرِ بدونِ منطقه نباید
     region_id:1 داشته باشد. قبلاً `user.region_id || 1` همیشه ۱ می‌داد. */
  await test('N35-1: certification for an unscoped user reports null, not region 1', async () => {
    const r = await req('GET', '/api/v1/analytics/intelligence-certification?school_id=1', { cookie });
    assert.strictEqual(r.status, 200, 'گواهی 200 نبود: ' + r.status);
    const cert = r.json.intelligence_certification;
    assert.ok(Object.prototype.hasOwnProperty.call(cert, 'region_id'), 'گواهی باید کلید region_id داشته باشد');
    assert.strictEqual(cert.region_id, null, 'منطقهٔ نامشخص باید null باشد نه ۱: ' + JSON.stringify(cert.region_id));
  });

  /* N35-2 — زنجیرهٔ e2e هم منطقه را صادقانه حفظ می‌کند. */
  await test('N35-2: the e2e chain inside the certificate carries no fabricated region', async () => {
    const r = await req('GET', '/api/v1/analytics/intelligence-certification?school_id=1', { cookie });
    const chain = r.json.intelligence_certification.e2e_chain_execution;
    assert.ok(chain, 'e2e chain یافت نشد');
    const ids = [];
    (function find(o) {
      if (o && typeof o === 'object') {
        if (Object.prototype.hasOwnProperty.call(o, 'region_id')) ids.push(o.region_id);
        for (const k of Object.keys(o)) find(o[k]);
      }
    })(chain);
    assert.ok(ids.length > 0, 'زنجیره باید منطقه داشته باشد');
    for (const x of ids) assert.strictEqual(x, null, 'هیچ مرحله‌ای نباید منطقهٔ ۱ داشته باشد: ' + JSON.stringify(ids));
  });

  /* N35-3 — کنترلِ مثبت: اگر کاربر واقعاً region_id داشت، همان می‌نشیند. */
  await test('N35-3: a user with a real region_id keeps it in the certificate', async () => {
    manager.region_id = 7; /* mutate in-memory store; session هر درخواست دوباره می‌خواند */
    try {
      const r = await req('GET', '/api/v1/analytics/intelligence-certification?school_id=1', { cookie });
      assert.strictEqual(r.status, 200, 'گواهی 200 نبود: ' + r.status);
      assert.strictEqual(r.json.intelligence_certification.region_id, 7,
        'منطقهٔ ۷ کاربر باید در گواهی بنشیند');
    } finally {
      delete manager.region_id;
    }
  });

  /* N35-4 — اولویت: منطقهٔ کاربر بر منطقهٔ مدرسه مقدم است. */
  await test('N35-4: user region wins over the school region', async () => {
    const routes = createAnalyticsRoutes({ store, db: null });
    const school = store.schools.find(s => s.id === 1);
    school.region_id = 5;
    try {
      const v = routes.__resolveReportRegionForTest({ role: 'manager', school_id: 1, region_id: 9 }, 1);
      assert.strictEqual(v, 9, 'منطقهٔ کاربر (۹) باید مقدم باشد');
    } finally {
      delete school.region_id;
    }
  });

  /* N35-5 — اگر کاربر منطقه‌ای نداشت، منطقهٔ مدرسه استفاده می‌شود؛
     و اگر هیچ‌کدام نبود null (نه ۱). */
  await test('N35-5: school region is the fallback; nothing resolves to 1', async () => {
    const routes = createAnalyticsRoutes({ store, db: null });
    const school = store.schools.find(s => s.id === 1);
    school.region_id = 4;
    try {
      const v = routes.__resolveReportRegionForTest({ role: 'manager', school_id: 1 }, 1);
      assert.strictEqual(v, 4, 'منطقهٔ مدرسه (۴) باید استفاده شود');
    } finally {
      delete school.region_id;
    }
    const none = routes.__resolveReportRegionForTest({ role: 'manager', school_id: 1 }, 1);
    assert.strictEqual(none, null, 'بدونِ منطقهٔ کاربر و مدرسه باید null باشد نه ۱');
    /* کاربرِ بدونِ مدرسه و منطقه */
    assert.strictEqual(routes.__resolveReportRegionForTest({ role: 'manager' }, null), null);
  });

  console.log(`\nN-35 Implicit Region Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
