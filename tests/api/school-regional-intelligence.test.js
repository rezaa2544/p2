#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/api/school-regional-intelligence.test.js
   آزمون HTTP زنده پایانه‌های P0-EI-09 و P0-EI-10
   (school-intelligence / regional-intelligence)
   پوشش: احراز هویت، ایزولاسیون مستأجر (D7)، پارامتر نامعتبر (D5)،
   و No-Data Masking (مدرسه بدون داده نباید سنجه ساختگی بگیرد)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-api-si-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);

/* اجرای تست روی JSON store بدون PostgreSQL (فقط dev/test) */
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, json, headers: res.headers };
}

async function loginAs(user) {
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert.strictEqual(r.status, 200);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200);
  const m = (r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function run() {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  console.log('\n🔍 Testing /api/v1/analytics/school-intelligence + regional-intelligence (P0-EI-09/10)');

  try {
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const foreignManager = store.users.find(u => u.role === 'manager' && u.school_id !== 1 && u.school_id != null);
    const admin = store.users.find(u => u.role === 'admin' || u.role === 'superadmin');

    const managerCookie = await loginAs(manager);
    const foreignCookie = foreignManager ? await loginAs(foreignManager) : null;
    const adminCookie = admin ? await loginAs(admin) : null;

    /* SI1: بدون لاگین */
    let r = await req('GET', '/api/v1/analytics/school-intelligence?school_id=1');
    ok('SI1: بدون لاگین ⇒ 401', r.status === 401, 'status=' + r.status);

    /* SI2: مدیر مدرسه خودش */
    r = await req('GET', '/api/v1/analytics/school-intelligence?school_id=1', { cookie: managerCookie });
    ok('SI2: مدیر مدرسه ۱ ⇒ 200 + snapshot', r.status === 200 && r.json && r.json.ok && r.json.snapshot, 'status=' + r.status);
    if (r.status === 200) {
      const snap = r.json.snapshot;
      ok('SI3: اسنپ‌شات دارای بلوک data_quality است', snap.data_quality && typeof snap.data_quality.status === 'string', JSON.stringify(snap.data_quality));
      ok('SI4: timestamp تولید معتبر است', !isNaN(Date.parse(snap.generated_at)), String(snap.generated_at));
      const noGrades = snap.data_quality && snap.data_quality.grades_count === 0;
      if (noGrades) {
        ok('SI5: بدون نمره واقعی، معدل جعل نمی‌شود (null)', snap.academic_summary.average_gpa === null, JSON.stringify(snap.academic_summary));
      } else {
        ok('SI5: معدل عددی از داده واقعی', typeof snap.academic_summary.average_gpa === 'number', JSON.stringify(snap.academic_summary));
      }
    }

    /* SI6 (D7): مدیر مدرسه دیگر */
    if (foreignCookie) {
      r = await req('GET', '/api/v1/analytics/school-intelligence?school_id=1', { cookie: foreignCookie });
      ok('SI6: مدیر مدرسه بیگانه ⇒ 403', r.status === 403, 'status=' + r.status);
    }

    /* SI7 (D5): پارامتر نامعتبر — برای مدیر، گارد Zero-Trust فاز۶ زودتر 403 می‌دهد (fail-closed)؛
       هر دو پاسخ 400/403 قابل قبول است، 200/500 هرگز */
    r = await req('GET', '/api/v1/analytics/school-intelligence?school_id=abc', { cookie: managerCookie });
    ok('SI7: school_id=abc (مدیر) ⇒ 400/403 و هرگز 200', r.status === 400 || r.status === 403, 'status=' + r.status);

    /* SI7b (D5): ادمین گارد Zero-Trust را دور می‌زند — اعتبارسنجی handler باید 400 بدهد (بستن fail-open NaN) */
    if (adminCookie) {
      r = await req('GET', '/api/v1/analytics/school-intelligence?school_id=abc', { cookie: adminCookie });
      ok('SI7b: school_id=abc (ادمین) ⇒ 400 نه 200', r.status === 400, 'status=' + r.status);
    }
    r = await req('GET', '/api/v1/analytics/school-intelligence', { cookie: managerCookie });
    ok('SI8: بدون school_id ⇒ 400', r.status === 400, 'status=' + r.status);

    /* RI: نمای منطقه‌ای */
    if (adminCookie) {
      r = await req('GET', '/api/v1/analytics/regional-intelligence?region_id=1', { cookie: adminCookie });
      ok('RI1: ادمین ⇒ 200/404 معتبر (بدون 500)', r.status === 200 || r.status === 404 || r.status === 400, 'status=' + r.status);
    }
    r = await req('GET', '/api/v1/analytics/regional-intelligence?region_id=1', { cookie: managerCookie });
    ok('RI2: مدیر مدرسه از نمای منطقه‌ای منع می‌شود (403)', r.status === 403, 'status=' + r.status);
  } catch (e) {
    fail++;
    console.log('  ❌ EXCEPTION: ' + e.message);
  }

  server.close();
  console.log(`\nنتیجه: ${pass} موفق / ${fail} ناموفق`);
  process.exit(fail ? 1 : 0);
}

run();
