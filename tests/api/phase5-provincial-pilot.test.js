#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-provincial-pilot.test.js — Provincial Pilot API Tests (P2-PL-02)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-p5prov-'));
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

async function run() {
  await new Promise(r => {
    if (server.listening) {
      const a = server.address();
      BASE = `http://127.0.0.1:${a.port}`;
      return r();
    }
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      BASE = `http://127.0.0.1:${a.port}`;
      r();
    });
  });

  try {
    const superadmin = store.users.find(u => u.role === 'superadmin');
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const student = store.users.find(u => u.role === 'student');

    const superCookie = await loginAs(superadmin);
    const managerCookie = await loginAs(manager);
    const studentCookie = await loginAs(student);

    console.log('--- آزمون‌های پایانه GET /api/v1/system/phase5/provincial-pilots ---');

    // ۱. دسترسی بدون لاگین -> 401
    const anonGet = await req('GET', '/api/v1/system/phase5/provincial-pilots');
    assert.strictEqual(anonGet.status, 401);
    console.log('  ✅ PROV-1: رد درخواست فاقد لاگین (401)');
    pass++;

    // ۲. دسترسی دانش‌آموز غیرمجاز -> 403
    const studentGet = await req('GET', '/api/v1/system/phase5/provincial-pilots', { cookie: studentCookie });
    assert.strictEqual(studentGet.status, 403);
    console.log('  ✅ PROV-2: مسدودسازی دسترسی نقش غیرمجاز (403)');
    pass++;

    // ۳. دریافت فهرست استان‌ها توسط سوپرادمین -> 200
    const listProvinces = await req('GET', '/api/v1/system/phase5/provincial-pilots', { cookie: superCookie });
    assert.strictEqual(listProvinces.status, 200);
    assert.strictEqual(listProvinces.json.ok, true);
    assert.ok(listProvinces.json.total >= 31);
    console.log('  ✅ PROV-3: دریافت موفق فهرست استان‌های پایلوت (200)');
    pass++;

    // ۴. دریافت جزئیات یک استان خاص -> 200
    const singleProv = await req('GET', '/api/v1/system/phase5/provincial-pilots?province_id=tehran', { cookie: managerCookie });
    assert.strictEqual(singleProv.status, 200);
    assert.strictEqual(singleProv.json.province.province_id, 'tehran');
    assert.strictEqual(singleProv.json.province.province_name, 'تهران');
    console.log('  ✅ PROV-4: واکشی موفق مشخصات استان تهران (200)');
    pass++;

    // ۵. استان نامعتبر -> 404
    const notFoundProv = await req('GET', '/api/v1/system/phase5/provincial-pilots?province_id=nonexistent_xyz', { cookie: managerCookie });
    assert.strictEqual(notFoundProv.status, 404);
    assert.strictEqual(notFoundProv.json.error_code, 'PHASE5_PILOT_SCOPE_VIOLATION');
    console.log('  ✅ PROV-5: مدیریت صحیح استان ناموجود با 404');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/phase5/provincial-pilots/capacity ---');

    // ۶. ظرفیت بدون لاگین -> 401
    const anonCap = await req('GET', '/api/v1/system/phase5/provincial-pilots/capacity');
    assert.strictEqual(anonCap.status, 401);
    console.log('  ✅ CAP-1: رد دریافت ظرفیت بدون لاگین (401)');
    pass++;

    // ۷. تابلوی ظرفیت پایلوت استانی با ادمین -> 200
    const adminCap = await req('GET', '/api/v1/system/phase5/provincial-pilots/capacity', { cookie: superCookie });
    assert.strictEqual(adminCap.status, 200);
    assert.strictEqual(adminCap.json.ok, true);
    assert.strictEqual(adminCap.json.capacity.overview_id, 'CAP-PHASE5-PROVINCIAL-PILOT');
    assert.strictEqual(adminCap.json.capacity.human_governance.requires_human_approval, true);
    assert.strictEqual(adminCap.json.capacity.zero_ranking_guarantee.enforced, true);
    console.log('  ✅ CAP-2: بازگشت موفق تابلوی ظرفیت و مقیاس‌پذیری پایلوت (200)');
    pass++;

    console.log('--- آزمون‌های پایانه POST /api/v1/system/phase5/provincial-pilots/activate ---');

    // ۸. فعال‌سازی بدون لاگین -> 401
    const anonAct = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      body: { province_id: 'tehran' }
    });
    assert.strictEqual(anonAct.status, 401);
    console.log('  ✅ ACT-1: رد فعال‌سازی بدون احراز هویت (401)');
    pass++;

    // ۹. فعال‌سازی توسط کاربر غیرمجاز (دانش‌آموز) -> 403
    const studentAct = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      cookie: studentCookie,
      body: { province_id: 'tehran', approved: true }
    });
    assert.strictEqual(studentAct.status, 403);
    console.log('  ✅ ACT-2: مهار فعال‌سازی توسط نقش غیرمجاز (403)');
    pass++;

    // ۱۰. فعال‌سازی با مداخله خودکار ممنوعه -> 422
    const autoAct = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        approved: true,
        automated_decision: true
      }
    });
    assert.strictEqual(autoAct.status, 422);
    assert.strictEqual(autoAct.json.error_code, 'PHASE5_ROLLOUT_APPROVAL_REQUIRED');
    console.log('  ✅ ACT-3: مهار تصمیم خودکار با 422 PHASE5_ROLLOUT_APPROVAL_REQUIRED');
    pass++;

    // ۱۱. فعال‌سازی حاوی واژه ممنوعه رتبه‌بندی -> 400 ZERO_RANKING_VIOLATION
    const rankAct = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        approved: true,
        league_table: ['tehran', 'isfahan']
      }
    });
    assert.strictEqual(rankAct.status, 400);
    assert.strictEqual(rankAct.json.error_code, 'ZERO_RANKING_VIOLATION');
    console.log('  ✅ ACT-4: مهار رتبه‌بندی با 400 ZERO_RANKING_VIOLATION');
    pass++;

    // ۱۲. فعال‌سازی موفق با تایید اپراتور انسانی -> 200
    const validAct = await req('POST', '/api/v1/system/phase5/provincial-pilots/activate', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(validAct.status, 200);
    assert.strictEqual(validAct.json.ok, true);
    assert.strictEqual(validAct.json.province.pilot_status, 'PROVISIONING');
    console.log('  ✅ ACT-5: فعال‌سازی موفق پایلوت استان تهران (200)');
    pass++;

    console.log('--- آزمون‌های پایانه POST /api/v1/system/phase5/provincial-pilots/traffic-rollout ---');

    // ۱۳. ترافیک با درصد نامعتبر (مثلاً ۴۲٪) -> 422 PHASE5_TRAFFIC_POLICY_FAILURE
    const invalidTraffic = await req('POST', '/api/v1/system/phase5/provincial-pilots/traffic-rollout', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        rollout_pct: 42,
        approved: true
      }
    });
    assert.strictEqual(invalidTraffic.status, 422);
    assert.strictEqual(invalidTraffic.json.error_code, 'PHASE5_TRAFFIC_POLICY_FAILURE');
    console.log('  ✅ TRF-1: رد درصد ترافیک غیرمجاز با 422 PHASE5_TRAFFIC_POLICY_FAILURE');
    pass++;

    // ۱۴. ترافیک قناری ۱۰٪ معتبر با تایید انسانی -> 200 CANARY_ACTIVE
    const canaryTraffic = await req('POST', '/api/v1/system/phase5/provincial-pilots/traffic-rollout', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        rollout_pct: 10,
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(canaryTraffic.status, 200);
    assert.strictEqual(canaryTraffic.json.province.traffic_rollout_pct, 10);
    assert.strictEqual(canaryTraffic.json.province.pilot_status, 'CANARY_ACTIVE');
    console.log('  ✅ TRF-2: تنظیم موفق ۱۰٪ ترافیک قناری (200 CANARY_ACTIVE)');
    pass++;

    // ۱۵. ترافیک کامل ۱۰۰٪ معتبر -> 200 ACTIVE
    const fullTraffic = await req('POST', '/api/v1/system/phase5/provincial-pilots/traffic-rollout', {
      cookie: superCookie,
      body: {
        province_id: 'tehran',
        rollout_pct: 100,
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(fullTraffic.status, 200);
    assert.strictEqual(fullTraffic.json.province.traffic_rollout_pct, 100);
    assert.strictEqual(fullTraffic.json.province.pilot_status, 'ACTIVE');
    console.log('  ✅ TRF-3: ارتقای ترافیک به ۱۰۰٪ سراسری (200 ACTIVE)');
    pass++;

    console.log(`\nکل آزمون‌های API پایلوت استانی: ${pass} آزمون موفق — بدون خطا ✅`);
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
