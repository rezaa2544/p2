#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-national-infrastructure.test.js
   National Production Fabric API Tests (P2-NI-01)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-p5nat-'));
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

    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/regions ---');

    // ۱. بدون احراز هویت -> 401
    const anonReg = await req('GET', '/api/v1/system/national/regions');
    assert.strictEqual(anonReg.status, 401);
    console.log('  ✅ NAT-REG-1: رد دسترسی بدون لاگین (401)');
    pass++;

    // ۲. نقش غیرمجاز (دانش‌آموز) -> 403
    const studentReg = await req('GET', '/api/v1/system/national/regions', { cookie: studentCookie });
    assert.strictEqual(studentReg.status, 403);
    console.log('  ✅ NAT-REG-2: مسدودسازی دسترسی دانش‌آموز (403)');
    pass++;

    // ۳. واکشی ۷ کلاستر ملی توسط سوپرادمین -> 200
    const adminReg = await req('GET', '/api/v1/system/national/regions', { cookie: superCookie });
    assert.strictEqual(adminReg.status, 200);
    assert.strictEqual(adminReg.json.ok, true);
    assert.strictEqual(adminReg.json.total, 7);
    console.log('  ✅ NAT-REG-3: بازگشت موفق فهرست ۷ کلاستر ملی (200)');
    pass++;

    // ۴. واکشی کلاستر خاص تهران -> 200
    const singleReg = await req('GET', '/api/v1/system/national/regions?region_id=ir-tehran-1', { cookie: managerCookie });
    assert.strictEqual(singleReg.status, 200);
    assert.strictEqual(singleReg.json.region.cluster_id, 'cluster-tehran-prod-01');
    console.log('  ✅ NAT-REG-4: واکشی مشخصات کلاستر تهران (200)');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/capacity ---');

    // ۵. ظرفیت بدون لاگین -> 401
    const anonCap = await req('GET', '/api/v1/system/national/capacity');
    assert.strictEqual(anonCap.status, 401);
    console.log('  ✅ NAT-CAP-1: رد دریافت ظرفیت بدون لاگین (401)');
    pass++;

    // ۶. مدل ظرفیت ملی با ادمین -> 200
    const adminCap = await req('GET', '/api/v1/system/national/capacity', { cookie: superCookie });
    assert.strictEqual(adminCap.status, 200);
    assert.strictEqual(adminCap.json.capacity.model_id, 'CAP-MODEL-PHASE5-NATIONAL-OFFICIAL');
    assert.strictEqual(adminCap.json.capacity.national_targets.peak_rps_target, 20000);
    assert.strictEqual(adminCap.json.capacity.human_governance.requires_human_approval, true);
    console.log('  ✅ NAT-CAP-2: بازگشت موفق مدل جامع ظرفیت ملی (200)');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/health ---');

    // ۷. رصدپذیری سلامت با ادمین -> 200
    const adminHealth = await req('GET', '/api/v1/system/national/health', { cookie: superCookie });
    assert.strictEqual(adminHealth.status, 200);
    assert.strictEqual(adminHealth.json.dashboard.dashboard_id, 'DASHBOARD-PHASE5-NATIONAL-OPERATIONS');
    assert.strictEqual(adminHealth.json.dashboard.zero_ranking_guarantee.enforced, true);
    console.log('  ✅ NAT-HLT-1: بازگشت موفق تابلوی رصدپذیری ملی و پایش SLO (200)');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/traffic ---');

    // ۸. فابریک ترافیک ملی با ادمین -> 200
    const adminTrf = await req('GET', '/api/v1/system/national/traffic', { cookie: superCookie });
    assert.strictEqual(adminTrf.status, 200);
    assert.strictEqual(adminTrf.json.traffic.fabric_id, 'TRAFFIC-FABRIC-PHASE5-NATIONAL');
    assert.strictEqual(adminTrf.json.traffic.total_regions, 7);
    console.log('  ✅ NAT-TRF-1: بازگشت موفق فابریک ترافیک ملی (200)');
    pass++;

    console.log('--- آزمون‌های پایانه POST /api/v1/system/national/change-request ---');

    // ۹. درخواست تغییر بدون لاگین -> 401
    const anonChange = await req('POST', '/api/v1/system/national/change-request', {
      body: { change_type: 'TRAFFIC_WEIGHT' }
    });
    assert.strictEqual(anonChange.status, 401);
    console.log('  ✅ NAT-CR-1: رد درخواست تغییر بدون لاگین (401)');
    pass++;

    // ۱۰. درخواست تغییر با نقش غیرمجاز (دانش‌آموز) -> 403
    const studentChange = await req('POST', '/api/v1/system/national/change-request', {
      cookie: studentCookie,
      body: { change_type: 'TRAFFIC_WEIGHT', approved: true }
    });
    assert.strictEqual(studentChange.status, 403);
    console.log('  ✅ NAT-CR-2: مهار تغییر توسط نقش غیرمجاز (403)');
    pass++;

    // ۱۱. درخواست تغییر خودکار ممنوعه -> 422
    const autoChange = await req('POST', '/api/v1/system/national/change-request', {
      cookie: superCookie,
      body: {
        change_type: 'TRAFFIC_WEIGHT',
        region_id: 'ir-tehran-1',
        target_weight: 50,
        approved: true,
        automated_decision: true
      }
    });
    assert.strictEqual(autoChange.status, 422);
    assert.strictEqual(autoChange.json.error_code, 'PHASE5_NATIONAL_CHANGE_APPROVAL_REQUIRED');
    console.log('  ✅ NAT-CR-3: مهار مداخله خودکار در زیرساخت ملی با 422');
    pass++;

    // ۱۲. درخواست حاوی فیلد ممنوعه رتبه‌بندی -> 400
    const rankChange = await req('POST', '/api/v1/system/national/change-request', {
      cookie: superCookie,
      body: {
        change_type: 'CONFIG_UPDATE',
        region_id: 'ir-tehran-1',
        approved: true,
        best_school: 'School-1'
      }
    });
    assert.strictEqual(rankChange.status, 400);
    assert.strictEqual(rankChange.json.error_code, 'ZERO_RANKING_VIOLATION');
    console.log('  ✅ NAT-CR-4: مهار رتبه‌بندی رقابتی با 400 ZERO_RANKING_VIOLATION');
    pass++;

    // ۱۳. تغییر موفق وزن ترافیک قناری -> 200
    const validTrfChange = await req('POST', '/api/v1/system/national/change-request', {
      cookie: superCookie,
      body: {
        change_type: 'TRAFFIC_WEIGHT',
        region_id: 'ir-tehran-1',
        target_weight: 50,
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(validTrfChange.status, 200);
    assert.strictEqual(validTrfChange.json.ok, true);
    console.log('  ✅ NAT-CR-5: ثبت موفق تغییر وزن ترافیک ملی (200)');
    pass++;

    // ۱۴. تغییر موفق وضعیت کلاستر منطقه‌ای -> 200
    const validStateChange = await req('POST', '/api/v1/system/national/change-request', {
      cookie: superCookie,
      body: {
        change_type: 'REGION_STATE',
        region_id: 'ir-tehran-1',
        target_state: 'MAINTENANCE',
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(validStateChange.status, 200);
    assert.strictEqual(validStateChange.json.ok, true);

    // بازگردانی وضعیت به ACTIVE
    await req('POST', '/api/v1/system/national/change-request', {
      cookie: superCookie,
      body: {
        change_type: 'REGION_STATE',
        region_id: 'ir-tehran-1',
        target_state: 'ACTIVE',
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    console.log('  ✅ NAT-CR-6: ثبت موفق تغییر وضعیت کلاستر ملی (200)');
    pass++;

    console.log(`\nکل آزمون‌های API زیرساخت ملی: ${pass} آزمون موفق — بدون خطا ✅`);
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
