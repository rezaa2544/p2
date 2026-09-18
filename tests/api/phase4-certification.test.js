#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/phase4-certification.test.js — Phase 4 Certification API Tests (P1-SC-07)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-cert4-'));
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
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const foreignManager = store.users.find(u => u.role === 'manager' && u.school_id !== 1);
    const student = store.users.find(u => u.role === 'student');

    const managerCookie = await loginAs(manager);
    const foreignManagerCookie = foreignManager ? await loginAs(foreignManager) : null;
    const studentCookie = await loginAs(student);

    // ۱. درخواست بدون احراز هویت
    const anonRes = await req('GET', '/api/v1/system/phase4-certification?school_id=1');
    assert.strictEqual(anonRes.status, 401, 'Anonymous request must return 401');
    console.log('  ✅ CERT4-1: Anonymous request rejected with 401');
    pass++;

    // ۲. درخواست بدون پارامتر الزامی توسط کاربر غیرادمین
    const noParamRes = await req('GET', '/api/v1/system/phase4-certification', { cookie: managerCookie });
    assert.strictEqual(noParamRes.status, 400, 'Missing school_id or region_id must return 400');
    console.log('  ✅ CERT4-2: Missing params rejected with 400 for non-admin');
    pass++;

    // ۳. دسترسی مدیر مدرسه به گواهی انتشار و آمادگی فاز ۴ مدرسه خود
    const mgrOwnRes = await req('GET', '/api/v1/system/phase4-certification?school_id=1', { cookie: managerCookie });
    assert.strictEqual(mgrOwnRes.status, 200, 'Manager accessing own school phase4 certification must return 200');
    assert.strictEqual(mgrOwnRes.json.ok, true);
    assert.strictEqual(mgrOwnRes.json.phase, 'PHASE_4');
    assert.strictEqual(mgrOwnRes.json.certification_status, 'CERTIFIED');
    assert.strictEqual(mgrOwnRes.json.release_ready, true);
    assert.strictEqual(mgrOwnRes.json.readiness_index, 100);
    assert.strictEqual(mgrOwnRes.json.national_go_decision, 'GO');
    assert.strictEqual(mgrOwnRes.json.governance.human_decision_sovereignty, true);
    assert.strictEqual(mgrOwnRes.json.governance.zero_ranking_guarantee, true);
    assert.strictEqual(mgrOwnRes.json.governance.tenant_isolation, true);
    assert.ok(mgrOwnRes.json.certificate);
    assert.strictEqual(mgrOwnRes.json.certificate.certificate_id, 'CERT-PAYESH-PHASE4-SCALE-OFFICIAL-20260918');
    assert.strictEqual(mgrOwnRes.json.certificate.sha256_certificate_digest.length, 64);
    assert.strictEqual(mgrOwnRes.json.layers.summary.total_present, 6);
    assert.strictEqual(mgrOwnRes.json.readiness_gates.total_gates, 7);
    console.log('  ✅ CERT4-3: Manager gets 200 with certified Phase 4 release certificate');
    pass++;

    // ۴. دسترسی به مسیر هم‌ارز scalability-certification
    const mgrAliasRes = await req('GET', '/api/v1/system/scalability-certification?school_id=1', { cookie: managerCookie });
    assert.strictEqual(mgrAliasRes.status, 200, 'Alias route /api/v1/system/scalability-certification must return 200');
    assert.strictEqual(mgrAliasRes.json.certification_status, 'CERTIFIED');
    console.log('  ✅ CERT4-4: Scalability certification alias route verified');
    pass++;

    // ۵. مدیر مدرسه به مدرسه دیگر (Anti-IDOR)
    if (foreignManagerCookie) {
      const foreignRes = await req('GET', '/api/v1/system/phase4-certification?school_id=1', { cookie: foreignManagerCookie });
      assert.strictEqual(foreignRes.status, 403, 'Foreign manager must be rejected with 403');
      console.log('  ✅ CERT4-5: Foreign manager rejected with 403 (Tenant Isolation)');
      pass++;
    } else {
      console.log('  ⏭️ CERT4-5: Foreign manager skipped (no second manager in fixture)');
    }

    // ۶. نقش غیرمجاز (دانش‌آموز)
    const stuRes = await req('GET', '/api/v1/system/phase4-certification?school_id=1', { cookie: studentCookie });
    assert.strictEqual(stuRes.status, 403, 'Student role must be rejected with 403');
    console.log('  ✅ CERT4-6: Unauthorized student role rejected with 403');
    pass++;

    // ۷. نمای منطقه‌ای و ملی بدون رتبه‌بندی مدارس
    const superAdmin = store.users.find(u => u.role === 'superadmin' || u.role === 'admin') || manager;
    const adminCookie = await loginAs(superAdmin);
    const regRes = await req('GET', '/api/v1/system/phase4-certification?region_id=1', { cookie: adminCookie });
    assert.strictEqual(regRes.status, 200, 'Admin accessing regional certification must return 200');
    assert.strictEqual(regRes.json.ok, true);
    assert.strictEqual(regRes.json.governance.zero_ranking_guarantee, true);
    assert.strictEqual(regRes.json.national_go_decision, 'GO');
    console.log('  ✅ CERT4-7: Regional certification overview strictly enforces zero-ranking policy');
    pass++;

  } catch (err) {
    console.error('❌ Phase 4 Certification API Test Error:', err);
    fail++;
  } finally {
    server.close();
  }

  console.log(`\nPhase 4 Certification API Tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };
