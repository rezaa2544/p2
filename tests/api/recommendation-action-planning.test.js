#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/recommendation-action-planning.test.js — Recommendation API Tests (P0-EI-13)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-rec-'));
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

  console.log('\n🔍 Testing /api/v1/analytics/action-recommendations Endpoint');

  try {
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const foreignManager = store.users.find(u => u.role === 'manager' && u.school_id !== 1);
    const student = store.users.find(u => u.role === 'student');

    const managerCookie = await loginAs(manager);
    const foreignManagerCookie = foreignManager ? await loginAs(foreignManager) : null;
    const studentCookie = await loginAs(student);

    // ۱. درخواست بدون احراز هویت
    const anonRes = await req('GET', '/api/v1/analytics/action-recommendations?school_id=1');
    assert.strictEqual(anonRes.status, 401, 'Anonymous request must return 401');
    console.log('  ✅ REC1: Anonymous request rejected with 401');
    pass++;

    // ۲. درخواست بدون پارامتر الزامی
    const noParamRes = await req('GET', '/api/v1/analytics/action-recommendations', { cookie: managerCookie });
    assert.strictEqual(noParamRes.status, 400, 'Missing school_id or region_id must return 400');
    console.log('  ✅ REC2: Missing params rejected with 400');
    pass++;

    // ۳. مدیر مدرسه به مدرسه خودش
    const mgrOwnRes = await req('GET', '/api/v1/analytics/action-recommendations?school_id=1', { cookie: managerCookie });
    assert.strictEqual(mgrOwnRes.status, 200, 'Manager accessing own school recommendations must return 200');
    assert.strictEqual(mgrOwnRes.json.ok, true);
    assert.strictEqual(mgrOwnRes.json.api_version, '1.0.0');
    assert.ok(Array.isArray(mgrOwnRes.json.recommendations));
    assert.ok(mgrOwnRes.json.action_board);
    assert.strictEqual(mgrOwnRes.json.action_board.zero_ranking_policy_enforced, true);
    assert.strictEqual(mgrOwnRes.json.action_board.is_ranked, false);
    console.log('  ✅ REC3: Manager gets 200 with recommendations and principal action board');
    pass++;

    // ۴. مدیر مدرسه به مدرسه دیگر (Anti-IDOR)
    if (foreignManagerCookie) {
      const foreignRes = await req('GET', '/api/v1/analytics/action-recommendations?school_id=1', { cookie: foreignManagerCookie });
      assert.strictEqual(foreignRes.status, 403, 'Foreign manager must be rejected with 403');
      console.log('  ✅ REC4: Foreign manager rejected with 403 (Tenant Isolation)');
      pass++;
    } else {
      console.log('  ⏭️ REC4: Foreign manager skipped (no second manager in fixture)');
    }

    // ۵. نقش غیرمجاز (دانش‌آموز)
    const stuRes = await req('GET', '/api/v1/analytics/action-recommendations?school_id=1', { cookie: studentCookie });
    assert.strictEqual(stuRes.status, 403, 'Student role must be rejected with 403');
    console.log('  ✅ REC5: Unauthorized student role rejected with 403');
    pass++;

    // ۶. سوپرادمین به پیشنهادات منطقه‌ای
    const superadmin = store.users.find(u => u.role === 'superadmin');
    if (superadmin) {
      const adminCookie = await loginAs(superadmin);
      const regRes = await req('GET', '/api/v1/analytics/action-recommendations?region_id=1', { cookie: adminCookie });
      assert.strictEqual(regRes.status, 200);
      assert.strictEqual(regRes.json.api_version, '1.0.0');
      assert.ok(regRes.json.action_board);
      assert.strictEqual(regRes.json.action_board.zero_ranking_policy_enforced, true);
      assert.strictEqual(regRes.json.action_board.is_ranked, false);
      assert.strictEqual(regRes.json.action_board.league_table, null);
      assert.strictEqual(regRes.json.action_board.best_school, null);
      assert.strictEqual(regRes.json.action_board.worst_school, null);
      console.log('  ✅ REC6: Regional action board strictly enforces zero-ranking policy');
      pass++;
    }

  } catch (err) {
    console.error('❌ Failed recommendation API tests:', err);
    fail++;
  } finally {
    server.close();
  }

  console.log(`\nAction Recommendations API Tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
