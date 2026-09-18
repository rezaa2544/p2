#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/disaster-recovery-health.test.js — Disaster Recovery API Tests (P1-SC-04)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-dr-'));
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
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      BASE = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  console.log('\n🔍 Testing /api/v1/system/disaster-recovery-health Endpoint');

  try {
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const foreignManager = store.users.find(u => u.role === 'manager' && u.school_id !== 1);
    const student = store.users.find(u => u.role === 'student');

    const managerCookie = await loginAs(manager);
    const foreignManagerCookie = foreignManager ? await loginAs(foreignManager) : null;
    const studentCookie = await loginAs(student);

    // ۱. درخواست بدون احراز هویت
    const anonRes = await req('GET', '/api/v1/system/disaster-recovery-health?school_id=1');
    assert.strictEqual(anonRes.status, 401, 'Anonymous request must return 401');
    console.log('  ✅ DR1: Anonymous request rejected with 401');
    pass++;

    // ۲. درخواست بدون پارامتر الزامی
    const noParamRes = await req('GET', '/api/v1/system/disaster-recovery-health', { cookie: managerCookie });
    assert.strictEqual(noParamRes.status, 400, 'Missing school_id or region_id must return 400');
    console.log('  ✅ DR2: Missing params rejected with 400');
    pass++;

    // ۳. دسترسی مدیر مدرسه به تابلوی سلامت پایداری و بازیابی مدرسه خود
    const mgrOwnRes = await req('GET', '/api/v1/system/disaster-recovery-health?school_id=1', { cookie: managerCookie });
    assert.strictEqual(mgrOwnRes.status, 200, 'Manager accessing own school disaster recovery health must return 200');
    assert.strictEqual(mgrOwnRes.json.ok, true);
    assert.strictEqual(mgrOwnRes.json.api_version, '1.0.0');
    assert.strictEqual(mgrOwnRes.json.school_id, 1);
    assert.ok(mgrOwnRes.json.disaster_recovery_health);
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.phase, 'PHASE_4');
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.status, 'healthy');
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.backup.verified, true);
    assert.ok(mgrOwnRes.json.disaster_recovery_health.recovery.rpo);
    assert.ok(mgrOwnRes.json.disaster_recovery_health.recovery.rto);
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.high_availability.database, 'healthy');
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.high_availability.cache, 'healthy');
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.high_availability.queue, 'healthy');
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.governance_and_invariants.human_decision_sovereignty.enforced, true);
    assert.strictEqual(mgrOwnRes.json.disaster_recovery_health.governance_and_invariants.zero_ranking_guarantee.enforced, true);
    console.log('  ✅ DR3: Manager gets 200 with Phase 4 disaster recovery health snapshot');
    pass++;

    // ۴. مدیر مدرسه به مدرسه دیگر (Anti-IDOR)
    if (foreignManagerCookie) {
      const foreignRes = await req('GET', '/api/v1/system/disaster-recovery-health?school_id=1', { cookie: foreignManagerCookie });
      assert.strictEqual(foreignRes.status, 403, 'Foreign manager must be rejected with 403');
      console.log('  ✅ DR4: Foreign manager rejected with 403 (Tenant Isolation)');
      pass++;
    } else {
      console.log('  ⏭️ DR4: Foreign manager skipped (no second manager in fixture)');
    }

    // ۵. نقش غیرمجاز (دانش‌آموز)
    const stuRes = await req('GET', '/api/v1/system/disaster-recovery-health?school_id=1', { cookie: studentCookie });
    assert.strictEqual(stuRes.status, 403, 'Student role must be rejected with 403');
    console.log('  ✅ DR5: Unauthorized student role rejected with 403');
    pass++;

    // ۶. نمای منطقه‌ای DR بدون رتبه‌بندی مدارس
    const superAdmin = store.users.find(u => u.role === 'superadmin' || u.role === 'admin') || manager;
    const adminCookie = await loginAs(superAdmin);
    const regRes = await req('GET', '/api/v1/system/disaster-recovery-health?region_id=1', { cookie: adminCookie });
    assert.strictEqual(regRes.status, 200, 'Admin accessing regional DR health must return 200');
    assert.strictEqual(regRes.json.ok, true);
    assert.strictEqual(regRes.json.regional_disaster_recovery_health.zero_ranking, true);
    assert.strictEqual(regRes.json.regional_disaster_recovery_health.status, 'healthy');
    console.log('  ✅ DR6: Regional disaster recovery overview strictly enforces zero-ranking policy');
    pass++;

  } catch (err) {
    console.error('❌ Disaster Recovery Health API Test Error:', err);
    fail++;
  } finally {
    server.close();
  }

  console.log(`\nDisaster Recovery Health API Tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };
