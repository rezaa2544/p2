#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-pilot.test.js — Phase 5 National Pilot API Suite (P2-PL-01)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-phase5-'));
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
    const eduOffice = store.users.find(u => u.role === 'edu_office');
    const student = store.users.find(u => u.role === 'student');

    const superCookie = await loginAs(superadmin);
    const managerCookie = await loginAs(manager);
    const eduOfficeCookie = eduOffice ? await loginAs(eduOffice) : null;
    const studentCookie = await loginAs(student);

    console.log('--- آزمون‌های پایانه GET /api/v1/system/phase5/regions ---');

    // ۱. دسترسی بدون احراز هویت -> 401
    const anonRegions = await req('GET', '/api/v1/system/phase5/regions');
    assert.strictEqual(anonRegions.status, 401, 'Anonymous request must return 401');
    console.log('  ✅ REG-1: رد درخواست فاقد احراز هویت (401)');
    pass++;

    // ۲. دریافت فهرست کلاسترها توسط مدیر سیستم -> 200
    const listRegions = await req('GET', '/api/v1/system/phase5/regions', { cookie: superCookie });
    assert.strictEqual(listRegions.status, 200);
    assert.strictEqual(listRegions.json.ok, true);
    assert.strictEqual(listRegions.json.total, 7);
    assert.ok(Array.isArray(listRegions.json.regions));
    console.log('  ✅ REG-2: بازگشت موفق فهرست ۷ کلاستر ملی (200)');
    pass++;

    // ۳. واکشی کلاستر خاص با شناسه منطقه
    const singleRegion = await req('GET', '/api/v1/system/phase5/regions?region_id=ir-tehran-1', { cookie: managerCookie });
    assert.strictEqual(singleRegion.status, 200);
    assert.strictEqual(singleRegion.json.region.region_id, 'ir-tehran-1');
    assert.strictEqual(singleRegion.json.region.name, 'کلاستر مرکزی تهران و توابع');
    console.log('  ✅ REG-3: واکشی مشخصات کلاستر خاص تهران (200)');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/phase5/federation-health ---');

    // ۴. سلامت فدراسیون بدون احراز هویت -> 401
    const anonHealth = await req('GET', '/api/v1/system/phase5/federation-health');
    assert.strictEqual(anonHealth.status, 401);
    console.log('  ✅ FED-1: رد مانیتورینگ فدراسیون بدون لاگین (401)');
    pass++;

    // ۵. سلامت فدراسیون با نقش غیرمجاز دانش‌آموز -> 403
    const studentHealth = await req('GET', '/api/v1/system/phase5/federation-health', { cookie: studentCookie });
    assert.strictEqual(studentHealth.status, 403);
    console.log('  ✅ FED-2: مسدودسازی دسترسی دانش‌آموز به وضعیت فدراسیون (403)');
    pass++;

    // ۶. سلامت فدراسیون با نقش ادمین -> 200
    const adminHealth = await req('GET', '/api/v1/system/phase5/federation-health', { cookie: superCookie });
    assert.strictEqual(adminHealth.status, 200);
    assert.strictEqual(adminHealth.json.ok, true);
    assert.strictEqual(adminHealth.json.federation_health.federation_status, 'HEALTHY');
    assert.strictEqual(adminHealth.json.governance.zero_ranking_guarantee, true);
    console.log('  ✅ FED-3: بازگشت موفق وضعیت سلامت فدراسیون کلاسترها (200)');
    pass++;

    console.log('--- آزمون‌های پایانه GET /api/v1/system/phase5/resource-governance ---');

    // ۷. حاکمیت منابع با کاربر غیرمجاز -> 403
    const studentGov = await req('GET', '/api/v1/system/phase5/resource-governance', { cookie: studentCookie });
    assert.strictEqual(studentGov.status, 403);
    console.log('  ✅ GOV-1: مهار دسترسی غیرمجاز به حاکمیت منابع (403)');
    pass++;

    // ۸. تابلوی حاکمیت منابع با ادمین -> 200
    const adminGov = await req('GET', '/api/v1/system/phase5/resource-governance', { cookie: superCookie });
    assert.strictEqual(adminGov.status, 200);
    assert.strictEqual(adminGov.json.resource_governance.governance_id, 'GOV-PHASE5-PILOT-NATIONAL');
    assert.strictEqual(adminGov.json.resource_governance.human_governance.requires_human_approval, true);
    console.log('  ✅ GOV-2: بازگشت موفق تابلوی حاکمیت منابع پایلوت ملی (200)');
    pass++;

    console.log('--- آزمون‌های پایانه POST /api/v1/system/phase5/pilot-approval ---');

    // ۹. اقدام تاییدیه بدون لاگین -> 401
    const anonApproval = await req('POST', '/api/v1/system/phase5/pilot-approval', {
      body: { action_type: 'QUOTA_SCALE' }
    });
    assert.strictEqual(anonApproval.status, 401);
    console.log('  ✅ APPV-1: رد درخواست تاییدیه بدون احراز هویت (401)');
    pass++;

    // ۱۰. اقدام تاییدیه توسط نقش غیرمجاز (دانش‌آموز) -> 403
    const studentApproval = await req('POST', '/api/v1/system/phase5/pilot-approval', {
      cookie: studentCookie,
      body: { action_type: 'QUOTA_SCALE', approved: true }
    });
    assert.strictEqual(studentApproval.status, 403);
    console.log('  ✅ APPV-2: رد صدور تاییدیه توسط دانش‌آموز (403)');
    pass++;

    // ۱۱. اقدام تاییدیه با رفتار خودکار ممنوعه -> 422
    const autoApproval = await req('POST', '/api/v1/system/phase5/pilot-approval', {
      cookie: superCookie,
      body: {
        action_type: 'QUOTA_SCALE',
        approved: true,
        automated_decision: true
      }
    });
    assert.strictEqual(autoApproval.status, 422);
    assert.strictEqual(autoApproval.json.error_code, 'PHASE5_HUMAN_APPROVAL_REQUIRED');
    console.log('  ✅ APPV-3: مهار صلب مداخله الگوریتمی خودکار با 422');
    pass++;

    // ۱۲. اقدام حاوی واژه ممنوعه رتبه‌بندی -> 400 ZERO_RANKING_VIOLATION
    const rankingApproval = await req('POST', '/api/v1/system/phase5/pilot-approval', {
      cookie: superCookie,
      body: {
        action_type: 'ADJUST_LEAGUE_TABLE',
        target_region: 'ir-tehran-1',
        approved: true,
        rank: 1
      }
    });
    assert.strictEqual(rankingApproval.status, 400);
    assert.strictEqual(rankingApproval.json.error_code, 'ZERO_RANKING_VIOLATION');
    console.log('  ✅ APPV-4: مهار صلب رتبه‌بندی رقابتی با خطای 400 ZERO_RANKING_VIOLATION');
    pass++;

    // ۱۳. صدور موفق تاییدیه معتبر اپراتور انسانی -> 200
    const validApproval = await req('POST', '/api/v1/system/phase5/pilot-approval', {
      cookie: superCookie,
      body: {
        action_type: 'CAPACITY_EXPANSION_PILOT',
        target_region: 'ir-tehran-1',
        target_school: 1,
        approved: true,
        automated_decision: false,
        automated_execution: false,
        requires_human_approval: true
      }
    });
    assert.strictEqual(validApproval.status, 200);
    assert.strictEqual(validApproval.json.ok, true);
    assert.strictEqual(validApproval.json.approval_receipt.status, 'APPROVED');
    assert.strictEqual(validApproval.json.approval_receipt.human_verified, true);
    console.log('  ✅ APPV-5: صدور موفق رسید تاییدیه اپراتور انسانی پایلوت ملی (200)');
    pass++;

    console.log(`\nکل آزمون‌های فاز ۵ پایلوت ملی: ${pass} آزمون موفق — بدون خطا ✅`);
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
