#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n26-provincial-scope.test.js — N-26 regression guard
   -------------------------------------------------------------------
   N-26 (شدت: HIGH): مسیرهایِ کنترل‌پلینِ پایلوتِ استانی province_idیِ
   بدنه را بدونِ هیچ مقایسه‌ای با منطقهٔ بازیگر می‌پذیرفتند. یک edu_office
   می‌توانست پایلوتِ هر استانی (در هر منطقه) را فعال یا ترافیکش را تنظیم
   کند. لایهٔ زیرین فقط وقتی operator.region_id حقیقت‌دار بود مقایسه می‌کرد
   — یعنی اداره‌هایِ بدونِ region_id (مثلِ همهٔ داده‌های نمونه) به‌صورتِ
   fail-open به همهٔ استان‌ها دسترسی داشتند. علاوه بر این، allowedRoles یک
   نقشِ ناموجود ('admin') را می‌پذیرفت که در مدلِ نقشِ سامانه وجود ندارد.

   دروازهٔ جدید (fail-closed): superadmin هر استانی؛ edu_office فقط استانِ
   هم‌منطقه، و نبودِ region_id یعنی *هیچ* استانی.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n26-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
/* REST-writing suites need this or every write 503s (see tests/api/runner.js). */
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

const OK_APPROVAL = {
  approved: true,
  automated_decision: false,
  automated_execution: false,
  requires_human_approval: true
};

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const superadmin = store.users.find(u => u.role === 'superadmin');
  const eoNoRegion = store.users.find(u => u.role === 'edu_office' && !u.region_id);
  const eoTehran = store.users.find(u => u.role === 'edu_office' && !u.region_id && u.id !== (eoNoRegion && eoNoRegion.id));
  const eoIsfahan = store.users.find(u => u.role === 'edu_office' && !u.region_id
    && u.id !== (eoNoRegion && eoNoRegion.id) && u.id !== (eoTehran && eoTehran.id));
  assert.ok(superadmin, 'دادهٔ نمونه superadmin نیست');
  assert.ok(eoNoRegion && eoTehran && eoIsfahan, 'سه ادارهٔ نمونه لازم است');

  /* req.user در هر درخواست از store بازخوانی می‌شود، پس تخصیصِ region_id
     رویِ رکوردِ store کافی است. */
  eoTehran.region_id = 'ir-tehran-1';
  eoIsfahan.region_id = 'ir-isfahan-1';

  const cookieSuper = await loginAs(superadmin);
  const cookieNoRegion = await loginAs(eoNoRegion);
  const cookieTehran = await loginAs(eoTehran);
  const cookieIsfahan = await loginAs(eoIsfahan);
  assert.ok(cookieSuper && cookieNoRegion && cookieTehran && cookieIsfahan, 'ورود ناموفق بود');

  console.log('\n🔍 N-26: Provincial control-plane scope');

  /* N26-1 — مانیفستِ خطا: ادارهٔ بدونِ region_id نباید بتواند هیچ استانی را
     فعال کند (fail-closed). قبلاً این مسیر باز بود. */
  await test('N26-1: edu_office without region_id cannot activate any province', async () => {
    const r = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      body: Object.assign({ province_id: 'tehran' }, OK_APPROVAL),
      cookie: cookieNoRegion
    });
    assert.ok(r.status === 403, 'activate باید 403 باشد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.code, 'forbidden', 'code باید forbidden باشد ولی ' + r.json.code + ' بود');
    assert.strictEqual(r.json.error_code, 'PHASE5_PILOT_SCOPE_VIOLATION');
  });

  /* N26-2 — مانیفستِ خطا: ادارهٔ منطقهٔ اصفهان نباید بتواند پایلوتِ تهران را
     فعال کند. */
  await test('N26-2: edu_office cannot activate a province in another region', async () => {
    const r = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      body: Object.assign({ province_id: 'tehran' }, OK_APPROVAL),
      cookie: cookieIsfahan
    });
    assert.ok(r.status === 403, 'activate باید 403 باشد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.error_code, 'PHASE5_PILOT_SCOPE_VIOLATION');
  });

  /* N26-3 — کنترلِ مثبت: ادارهٔ منطقهٔ تهران می‌تواند استانی در منطقهٔ خودش
     (البرز) را فعال کند. دروازه نباید عملیاتِ مشروع را بشکند. */
  await test('N26-3: edu_office can activate a province in its own region', async () => {
    const r = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      body: Object.assign({ province_id: 'alborz' }, OK_APPROVAL),
      cookie: cookieTehran
    });
    assert.strictEqual(r.status, 200, 'فعال‌سازیِ هم‌منطقه باید 200 باشد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
    assert.strictEqual(r.json.ok, true);
  });

  /* N26-4 — کنترلِ مثبت: superadmin همچنان می‌تواند هر استانی را فعال کند. */
  await test('N26-4: superadmin can activate any province (positive control)', async () => {
    const r = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      body: Object.assign({ province_id: 'semnan' }, OK_APPROVAL),
      cookie: cookieSuper
    });
    assert.strictEqual(r.status, 200, 'superadmin باید 200 بگیرد ولی ' + r.status + ' بود: ' + JSON.stringify(r.json));
    assert.strictEqual(r.json.ok, true);
  });

  /* N26-5 — مسیرِ دومِ نوشتن (traffic-rollout) + خواندنِ capacity: ادارهٔ
     منطقهٔ اصفهان نمی‌تواند ترافیکِ تهران را تنظیم کند؛ و نمایِ capacityِ
     ادارهٔ بدونِ منطقه نباید نماییِ ملی نشت کند. */
  await test('N26-5: traffic-rollout is region-scoped; capacity view leaks nothing', async () => {
    const r = await req('POST', '/api/v1/system/phase5/provincial-pilots/traffic-rollout', {
      body: Object.assign({ province_id: 'tehran', rollout_pct: 10 }, OK_APPROVAL),
      cookie: cookieIsfahan
    });
    assert.ok(r.status === 403, 'rollout باید 403 باشد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.error_code, 'PHASE5_PILOT_SCOPE_VIOLATION');

    /* خواندن: ادارهٔ بدونِ منطقه نباید هیچ استانی را ببیند. */
    const cap = await req('GET', '/api/v1/system/phase5/provincial-pilots/capacity', { cookie: cookieNoRegion });
    assert.strictEqual(cap.status, 200);
    assert.strictEqual(cap.json.ok, true);
    assert.strictEqual(cap.json.capacity.total_provinces, 0,
      'ادارهٔ بدونِ منطقه نباید نمایِ ملی ببیند ولی ' + cap.json.capacity.total_provinces + ' استان دید');

    /* ادارهٔ تهران فقط استان‌هایِ منطقهٔ خودش را می‌بیند، نه همهٔ ملی. */
    const capTehran = await req('GET', '/api/v1/system/phase5/provincial-pilots/capacity', { cookie: cookieTehran });
    assert.strictEqual(capTehran.status, 200);
    assert.ok(capTehran.json.capacity.total_provinces > 0, 'ادارهٔ تهران باید استان‌هایِ منطقهٔ خودش را ببیند');
    assert.ok(capTehran.json.capacity.total_provinces < 31,
      'ادارهٔ تهران نباید همهٔ استان‌های کشور را ببیند');

    /* region_idیِ بدنه نباید بتواند مهار را دور بزند. */
    const capSpoof = await req('GET', '/api/v1/system/phase5/provincial-pilots/capacity?region_id=ir-khorasan-1', { cookie: cookieTehran });
    assert.strictEqual(capSpoof.status, 200);
    assert.strictEqual(capSpoof.json.capacity.total_provinces, capTehran.json.capacity.total_provinces,
      'region_idیِ بدنه نباید دیدِ اداره را گسترش دهد');
  });

  console.log(`\nN-26 Provincial Scope Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
