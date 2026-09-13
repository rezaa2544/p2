#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/reports-tenant-isolation.js — Wave 23: مهار اجاره‌ای گزارش‌ها
   ───────────────────────────────────────────────────────────────────
   fail-closed در هر دو لایه:
   - API: نقش‌های غیرمجاز 403؛ مدیر فقط مدرسهٔ خودش (درخواست صریحِ
     مدرسهٔ دیگر = 403 نه لیست خالی)؛ edu_office فقط هندسهٔ اداره؛
     superadmin همه.
   - sync (نوشتنِ report_logs): معلم رد؛ نوشتن برون‌مستأجری رد.
   اجرا: node tests/reports-tenant-isolation.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-rpt-tenant-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

fs.copyFileSync(REAL_STORE, path.join(TMP, 'store.json'));
process.env.PAYESH_STORE = path.join(TMP, 'store.json');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));
const policy = require(path.join(ROOT, 'server', 'policy.js'));

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
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function test(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (err) { fail++; console.error('  ❌ ' + name + '\n     ' + err.message); }
}

const KINDS = ['attendance', 'academic', 'finance', 'teachers'];

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n▸ Wave 23 — گزارش‌ها: مهار اجاره‌ای');

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const teacher1 = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student1 = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const parent1 = store.users.find(u => u.role === 'parent');
  const superadmin = store.users.find(u => u.role === 'superadmin');
  const eduUser = store.users.find(u => u.role === 'edu_office' && u.office_id);

  const cMgr = await loginAs(manager1);
  const cTch = await loginAs(teacher1);
  const cStu = await loginAs(student1);
  const cPar = await loginAs(parent1);
  const cSup = await loginAs(superadmin);
  const cEdu = await loginAs(eduUser);

  /* ── لایهٔ API ─────────────────────────────────────────────────── */

  await test('بدون احراز هویت: هر چهار گزارش 401', async () => {
    for (const k of KINDS) {
      const r = await req('GET', '/api/v1/reports/' + k);
      assert.strictEqual(r.status, 401, k + ': ' + r.status);
    }
  });

  await test('teacher/student/parent: هر چهار گزارش 403 (fail-closed)', async () => {
    for (const cookie of [cTch, cStu, cPar]) {
      for (const k of KINDS) {
        const r = await req('GET', '/api/v1/reports/' + k, { cookie });
        assert.strictEqual(r.status, 403, k + ': ' + r.status);
      }
    }
  });

  await test('manager: فقط مدرسهٔ خودش در هر چهار گزارش', async () => {
    for (const k of KINDS) {
      const r = await req('GET', '/api/v1/reports/' + k, { cookie: cMgr });
      assert.strictEqual(r.status, 200, k);
      for (const s of r.json.schools) assert.strictEqual(s.school_id, 1, k + ': نشتی مدرسهٔ ' + s.school_id);
    }
  });

  await test('manager: درخواست صریح مدرسهٔ دیگر = 403 (نه لیست خالی)', async () => {
    for (const k of KINDS) {
      const r = await req('GET', '/api/v1/reports/' + k + '?school_id=2', { cookie: cMgr });
      assert.strictEqual(r.status, 403, k + ': ' + r.status);
    }
  });

  await test('edu_office: فقط مدارس هندسهٔ اداره', async () => {
    const office = (store.offices || []).find(o => Number(o.id) === Number(eduUser.office_id));
    const inScope = store.schools.filter(s => policy.officeCoversSchool(office, s)).map(s => s.id).sort();
    assert.ok(inScope.length > 0, 'ادارهٔ آزمون باید مدرسه داشته باشد');
    const outOfScope = store.schools.map(s => s.id).filter(id => inScope.indexOf(id) === -1);
    const r = await req('GET', '/api/v1/reports/attendance', { cookie: cEdu });
    assert.strictEqual(r.status, 200);
    const got = r.json.schools.map(s => s.school_id).sort();
    assert.deepStrictEqual(got, inScope, 'دامنهٔ اداره: ' + got + ' ≠ ' + inScope);
    /* درخواست صریح مدرسهٔ بیرون از هندسه = 403 */
    if (outOfScope.length) {
      const r2 = await req('GET', '/api/v1/reports/attendance?school_id=' + outOfScope[0], { cookie: cEdu });
      assert.strictEqual(r2.status, 403);
    }
  });

  await test('superadmin: همهٔ مدارس + فیلتر school_id آزاد', async () => {
    const r = await req('GET', '/api/v1/reports/attendance', { cookie: cSup });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.schools.length, store.schools.length);
    const r2 = await req('GET', '/api/v1/reports/attendance?school_id=2', { cookie: cSup });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.json.schools.length, 1);
    assert.strictEqual(r2.json.schools[0].school_id, 2);
  });

  await test('finance: مدرسهٔ بدون قابلیت شهریه = 400 با پیام روشن', async () => {
    /* مدرسه‌ای بدون has_tuition پیدا کن */
    const noTuition = store.schools.find(s => !(s.capabilities && s.capabilities.has_tuition));
    if (!noTuition) return; /* دنیای دمو همه شهریه‌دار؟ رد نکن */
    const r = await req('GET', '/api/v1/reports/finance?school_id=' + noTuition.id, { cookie: cSup });
    assert.strictEqual(r.status, 400);
  });

  /* ── لایهٔ sync (نوشتنِ report_logs) ──────────────────────────── */

  const mkOp = (uid, by, schoolId) => ({
    uid, t: 'ins', c: 'report_logs', by,
    data: { school_id: schoolId, kind: 'attendance', format: 'csv', status: 'generated',
      generated_by: String(by), meta: { jy: 1405, jm: 6 }, created_at: new Date().toISOString() },
    at: new Date().toISOString()
  });

  await test('sync: مدیر ثبت report_logs مدرسهٔ خودش = OK', async () => {
    const r = await req('POST', '/api/sync', { cookie: cMgr, body: { ops: [mkOp('rt-ok-1', manager1.id, 1)] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.results[0].ok, true);
    assert.ok((store.report_logs || []).some(x => x && x.kind === 'attendance'), 'ردیف در store');
  });

  await test('sync: معلم ثبت report_logs = رد (role/scope)', async () => {
    const r = await req('POST', '/api/sync', { cookie: cTch, body: { ops: [mkOp('rt-deny-1', teacher1.id, 1)] } });
    assert.strictEqual(r.status, 403, 'status=' + r.status);
  });

  await test('sync: مدیر ثبت برای مدرسهٔ دیگر = رد (out_of_scope)', async () => {
    const before = (store.report_logs || []).length;
    const r = await req('POST', '/api/sync', { cookie: cMgr, body: { ops: [mkOp('rt-deny-2', manager1.id, 2)] } });
    assert.strictEqual(r.status, 403);
    assert.strictEqual((store.report_logs || []).length, before, 'هیچ ردیفی اضافه نشد');
  });

  /* ── جهش (mutation guard): T15 — نوشتنِ اداره باید مهارِ هندسی داشته باشد ── */
  await test('جهش‌بان: report_logs در EO_SCOPE_GATED است (policy.js)', async () => {
    assert.ok(policy.EO_SCOPE_GATED.indexOf('report_logs') > -1,
      'report_logs از EO_SCOPE_GATED حذف شده — نوشتنِ اداره بی‌مهار می‌شود');
  });

  server.close();
  console.log('');
  console.log('────────────────────────────────────────────────────');
  console.log(`reports-tenant-isolation: ${pass} سبز / ${fail} قرمز ${fail ? '❌' : '✅'}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
