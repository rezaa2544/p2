#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase5-production-readiness.test.js
   Phase 5 Step 4 (P2-NI-02): National Production Readiness & Operations
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-p5noc-'));
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
    // 1. GET /api/v1/system/national/operations
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/operations ---');

    {
      const r = await req('GET', '/api/v1/system/national/operations');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ NOC-OPS-1: رد دسترسی بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/operations', { cookie: studentCookie });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ NOC-OPS-2: مسدودسازی دسترسی نقش غیرمجاز دانش‌آموز (403)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/operations', { cookie: managerCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(r.json.operations.noc_state);
      assert.strictEqual(r.json.operations.sovereign_governance.single_source_of_truth, 'PostgreSQL');
      console.log('  ✅ NOC-OPS-3: دریافت موفق تابلوی مرکز عملیات ملی (200)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/operations?ranking_score=1', { cookie: managerCookie });
      assert.strictEqual(r.status, 400);
      console.log('  ✅ NOC-OPS-4: مهار رتبه‌بندی رقابتی با خطای 400 ZERO_RANKING_VIOLATION');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. GET /api/v1/system/national/readiness
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/readiness ---');

    {
      const r = await req('GET', '/api/v1/system/national/readiness');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ NOC-RED-1: رد ارزیابی آمادگی بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/readiness', { cookie: studentCookie });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ NOC-RED-2: مسدودسازی دسترسی دانش‌آموز به گیت آمادگی (403)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/readiness', { cookie: superCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(['GO', 'NO_GO'].includes(r.json.readiness.overall_verdict));
      assert.ok(r.json.readiness.pillars.infrastructure_ready);
      console.log('  ✅ NOC-RED-3: دریافت موفق گزارش گیت آمادگی انتشار (200)');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. GET /api/v1/system/national/load-test
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/load-test ---');

    {
      const r = await req('GET', '/api/v1/system/national/load-test');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ NOC-LOAD-1: رد شبیه‌سازی بار بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/load-test', { cookie: studentCookie });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ NOC-LOAD-2: مسدودسازی دسترسی دانش‌آموز به تست بار (403)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/load-test', { cookie: superCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(r.json.load_test_suite.total_scenarios, 3);
      console.log('  ✅ NOC-LOAD-3: بازگشت موفق مجموعه شبیه‌سازی بار ۳ سناریوی ملی (200)');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 4. GET /api/v1/system/national/incidents
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه GET /api/v1/system/national/incidents ---');

    {
      const r = await req('GET', '/api/v1/system/national/incidents');
      assert.strictEqual(r.status, 401);
      console.log('  ✅ NOC-INC-1: رد دریافت رخدادها بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('GET', '/api/v1/system/national/incidents', { cookie: managerCookie });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(Array.isArray(r.json.incidents));
      console.log('  ✅ NOC-INC-2: دریافت موفق فهرست رخدادهای مرکز عملیات (200)');
      pass++;
    }

    // ─────────────────────────────────────────────────────────────────
    // 5. POST /api/v1/system/national/change-request
    // ─────────────────────────────────────────────────────────────────
    console.log('--- آزمون‌های پایانه POST /api/v1/system/national/change-request ---');

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        body: { change_type: 'NOC_STATE', target_state: 'WARNING' }
      });
      assert.strictEqual(r.status, 401);
      console.log('  ✅ NOC-CR-1: رد درخواست تغییر بدون لاگین (401)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        cookie: studentCookie,
        body: { change_type: 'NOC_STATE', target_state: 'WARNING' }
      });
      assert.strictEqual(r.status, 403);
      console.log('  ✅ NOC-CR-2: مهار تغییر توسط نقش غیرمجاز (403)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        cookie: superCookie,
        body: {
          change_type: 'NOC_STATE',
          target_state: 'WARNING',
          automated_execution: true,
          approved: false
        }
      });
      assert.strictEqual(r.status, 422);
      console.log('  ✅ NOC-CR-3: مهار مداخله خودکار بدون تایید با 422');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        cookie: superCookie,
        body: {
          change_type: 'NOC_STATE',
          target_state: 'WARNING',
          approved: true,
          requires_human_approval: true,
          automated_decision: false,
          automated_execution: false,
          approval_id: 'appv-test-101',
          reason: 'Testing NOC state shift'
        }
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      console.log('  ✅ NOC-CR-4: ثبت موفق انتقال وضعیت مرکز عملیات ملی (200)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        cookie: superCookie,
        body: {
          change_type: 'INCIDENT',
          approved: true,
          requires_human_approval: true,
          automated_decision: false,
          automated_execution: false,
          approval_id: 'appv-test-inc',
          reason: 'Incident logged',
          incident_data: {
            incident_id: 'INC-API-01',
            title: 'Fiber cut on southern backbone',
            severity: 'P2_HIGH',
            region_id: 'ir-fars-1'
          }
        }
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      console.log('  ✅ NOC-CR-5: ثبت موفق رخداد عملیاتی در مرکز عملیات (200)');
      pass++;
    }

    {
      const r = await req('POST', '/api/v1/system/national/change-request', {
        cookie: superCookie,
        body: {
          change_type: 'REGISTER_CHANGE',
          title: 'Upgrade ingress firewall rules',
          risk_level: 'MEDIUM',
          rollback_plan: 'Restore iptables rules from git config',
          approved: true,
          requires_human_approval: true,
          automated_decision: false,
          automated_execution: false,
          approval_id: 'appv-reg-1'
        }
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      console.log('  ✅ NOC-CR-6: ثبت رسمی درخواست تغییر همراه با طرح بازگشت (200)');
      pass++;
    }

    console.log(`\nکل آزمون‌های API آمادگی بهره‌برداری ملی: ${pass} آزمون موفق — بدون خطا ✅`);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

run();
