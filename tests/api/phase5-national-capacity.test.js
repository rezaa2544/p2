#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-national-capacity.test.js
   Phase 5 Step 5 (P2-NI-03): National Capacity Enforcement API Tests
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-p5cap-'));
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

    // ─────────────────────────────────────────────────────────────────
    // 1. GET /api/v1/system/national/capacity
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/capacity ---');

    {
      const r = await req('GET', '/api/v1/system/national/capacity');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ CAP-1: رد دریافت ظرفیت بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/capacity', { cookie: studentCookie });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ CAP-2: مسدودسازی دسترسی دانش‌آموز (403)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/capacity', { cookie: managerCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(r.json.enforcement_limits);
      assert.strictEqual(r.json.enforcement_limits.MAX_RPS, 20000);
      assert.strictEqual(r.json.enforcement_limits.MAX_WRITE_TPS, 2500);
      console.log('  ✅ CAP-3: بازگشت موفق مدل و سقف‌های اجبار ظرفیت ملی (200)');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. GET /api/v1/system/national/capacity/reservations
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/capacity/reservations ---');

    {
      const r = await req('GET', '/api/v1/system/national/capacity/reservations');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ RES-GET-1: رد دریافت رزروها بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/capacity/reservations', { cookie: studentCookie });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ RES-GET-2: مسدودسازی دسترسی دانش‌آموز به رزروها (403)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/capacity/reservations', { cookie: managerCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(Array.isArray(r.json.reservations));
      console.log('  ✅ RES-GET-3: بازگشت موفق فهرست رزروهای سهمیه ظرفیت (200)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/capacity/reservations?ranking_score=10', { cookie: managerCookie });
      assert.strictEqual(r.status, 400);
      console.log('  ✅ RES-GET-4: مهار رتبه‌بندی رقابتی با خطای 400 ZERO_RANKING_VIOLATION');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. POST /api/v1/system/national/capacity/reservation
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه POST /api/v1/system/national/capacity/reservation ---');

    {
      const r = await req('POST', '/api/v1/system/national/capacity/reservation', {
        body: { region_id: 'ir-isfahan-1', tenant_id: 'school-1' }
      });
      assert.strictEqual(r.status, 401);
      console.log('  ✅ RES-POST-1: رد درخواست رزرو بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/capacity/reservation', {
        cookie: managerCookie,
        body: { region_id: 'ir-isfahan-1', tenant_id: 'school-1' }
      });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ RES-POST-2: مهار رزرو توسط مدیر مدرسه (صرفاً ادمین مجاز است) (403)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/capacity/reservation', {
        cookie: superCookie,
        body: {
          region_id: 'ir-isfahan-1',
          tenant_id: 'school-1',
          approved: false
        }
      });
      assert.strictEqual(r.status, 422);
      console.log('  ✅ RES-POST-3: مهار رزرو بدون تاییدیه با 422');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/capacity/reservation', {
        cookie: superCookie,
        body: {
          region_id: 'ir-isfahan-1',
          tenant_id: 'school-1',
          ranking_score: 95,
          approved: true,
          operator_id: 'op-1',
          approval_id: 'appv-1'
        }
      });
      assert.strictEqual(r.status, 400);
      console.log('  ✅ RES-POST-4: مهار رتبه‌بندی رقابتی در بدنه رزرو با 400 ZERO_RANKING_VIOLATION');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/capacity/reservation', {
        cookie: superCookie,
        body: {
          reservation_id: 'res-api-exam-01',
          region_id: 'ir-isfahan-1',
          tenant_id: 'school-1',
          requested_capacity: { rps: 400, concurrent_users: 50000, db_connections: 50 },
          duration_minutes: 180,
          approved: true,
          approval_id: 'appv-api-exam',
          reason: 'Provincial exam evaluation period'
        }
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(r.json.reservation.reservation_id, 'res-api-exam-01');
      console.log('  ✅ RES-POST-5: رزرو موفق سهمیه ظرفیت با تایید اپراتور انسانی (200)');
      pass++;
    }

    console.log(`\nکل آزمون‌های API اجبار ظرفیت ملی: ${pass} آزمون موفق — بدون خطا ✅`);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

run();
