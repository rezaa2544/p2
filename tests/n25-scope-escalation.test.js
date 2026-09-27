#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n25-scope-escalation.test.js — N-25 regression guard
   -------------------------------------------------------------------
   N-25 (شدت: MEDIUM): یک manager تک‌مدرسه‌ای می‌توانست حسابِ کاربری با
   نقشِ edu_office بسازد. ROLE_LEVEL یک سلسله‌مراتبِ *مدرسه‌محور* است
   (edu_office=3 < manager=4)، در حالی که edu_office یک ناظرِ *منطقه‌ای*
   است که قدرتش از office_id و officeCoversSchool می‌آید — و policy.inScope
   برایِ edu_office رویِ مجموعه‌هایِ غیرِ دروازه‌شده «true» برمی‌گرداند
   (اختیارِ بین‌مدرسه‌ای). مقایسهٔ عددی به این تفاوتِ دامنه نابیناست.

   دروازهٔ جدید: نقش‌هایِ ممتازِ دامنه (edu_office، superadmin) فقط توسط
   superadmin قابلِ ایجاد/ارتقاست — هم در POST /api/v1/users و هم در
   مسیرِ ارتقایِ نقشِ PATCH /api/v1/users/:id.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n25-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';
/* REST-writing suites need this or every write 503s (see tests/api/runner.js). */
process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1';

const { server, store } = require('../server/index.js');

let BASE = '';
let pass = 0, fail = 0;

async function req(method, p, opts) {
  const options = opts || {};
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      options.body ? { 'Content-Type': 'application/json' } : {},
      options.cookie ? { Cookie: options.cookie } : {}
    ),
    body: options.body ? JSON.stringify(options.body) : undefined,
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
  const nid = String(user.national_id);
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: nid } });
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (err) {
    fail++;
    console.error('  ❌ ' + name + '\n     ' + err.message);
  }
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const manager1 = store.users.find(u => u.role === 'manager' && u.school_id === 1);
  const manager2 = store.users.find(u => u.role === 'manager' && u.school_id === 2);
  const superadmin = store.users.find(u => u.role === 'superadmin');
  assert.ok(manager1, 'دادهٔ نمونه manager مدرسهٔ ۱ نیست');
  assert.ok(manager2, 'دادهٔ نمونه manager مدرسهٔ ۲ نیست');
  assert.ok(superadmin, 'دادهٔ نمونه superadmin نیست');

  const cookieMgr1 = await loginAs(manager1);
  const cookieMgr2 = await loginAs(manager2);
  const cookieSuper = await loginAs(superadmin);
  assert.ok(cookieMgr1 && cookieMgr2 && cookieSuper, 'ورود به سیستم ناموفق بود');

  console.log('\n🔍 N-25: Scope escalation via role minting');

  /* N25-1 — مانیفستِ خطا: manager نباید بتواند ناظرِ منطقه‌ای بسازد، حتی
     که عددِ نقش (۳) از سطحِ خودش (۴) پایین‌تر است. */
  await test('N25-1: manager cannot mint an edu_office (regional regulator)', async () => {
    const r = await req('POST', '/api/v1/users', {
      body: { full_name: 'کارشناس جعلی اداره', role: 'edu_office', office_id: 1 },
      cookie: cookieMgr1
    });
    assert.strictEqual(r.status, 403, 'POST باید 403 باشد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.code, 'role_escalation', 'code باید role_escalation باشد ولی ' + r.json.code + ' بود');
    const made = (store.users || []).some(u => u.full_name === 'کارشناس جعلی اداره');
    assert.ok(!made, 'هیچ رکوردی نباید ساخته شود');
  });

  /* N25-2 — مسیرِ جایگزینِ ارتقا: manager نباید بتواند کاربری هم‌مدرسه‌ای را
     به edu_office ارتقا دهد. این دروازه قبل از allow-list می‌آید. */
  await test('N25-2: manager cannot promote a peer to edu_office via PATCH', async () => {
    const target = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
    assert.ok(target, 'دادهٔ نمونه دبیر مدرسهٔ ۱ نیست');
    const r = await req('PATCH', '/api/v1/users/' + target.id, {
      body: { role: 'edu_office', base_version: target.version || 1 },
      cookie: cookieMgr1
    });
    assert.ok(r.status === 403, 'PATCH باید 403 باشد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.code, 'role_escalation', 'code باید role_escalation باشد ولی ' + r.json.code + ' بود');
  });

  /* N25-3 — کنترلِ مثبت: superadmin هنوز می‌تواند edu_office بسازد. دروازه
     نباید مسیرِ مشروع را بشکند. */
  await test('N25-3: superadmin can still mint edu_office (positive control)', async () => {
    const r = await req('POST', '/api/v1/users', {
      body: { full_name: 'کارشناس رسمی اداره', role: 'edu_office', school_id: 1, office_id: 1 },
      cookie: cookieSuper
    });
    assert.strictEqual(r.status, 201, 'superadmin باید 201 بگیرد ولی ' + r.status + ' بود');
    assert.strictEqual(r.json.data.role, 'edu_office');
    assert.ok(r.json.data.id, 'id باید برگردد');
  });

  /* N25-4 — مانیفستِ خطا (peer minting): manager نباید بتواند مدیرِ
     مدرسهٔ *دیگر* بسازد. school_id بدنه توسطِ non-superadmin نادیده گرفته
     می‌شود و همیشه مدرسهٔ خودش بسته می‌شود. */
  await test('N25-4: manager cannot mint a manager bound to another school', async () => {
    const before = (store.users || []).filter(u => u.role === 'manager').length;
    const r = await req('POST', '/api/v1/users', {
      body: { full_name: 'مدیر جعلی مدرسهٔ دیگر', role: 'manager', school_id: 2 },
      cookie: cookieMgr1
    });
    assert.strictEqual(r.status, 201, 'ایجادِ مدیرِ هم‌مدرسه‌ای مجاز است');
    assert.strictEqual(r.json.data.school_id, manager1.school_id,
      'school_id بدنه باید نادیده گرفته شود و به مدرسهٔ بازیگر بسته شود');
    const after = (store.users || []).filter(u => u.role === 'manager').length;
    assert.strictEqual(after, before + 1, 'دقیقاً یک مدیر جدید');
    const fresh = (store.users || []).find(u => u.id === r.json.data.id);
    assert.strictEqual(Number(fresh.school_id), Number(manager1.school_id),
      'رکوردِ ذخیره‌شده باید متعلق به مدرسهٔ خود manager باشد');
  });

  /* N25-5 — نقش‌های عادی هنوز کار می‌کنند و نقشِ نامعتبر همچنان 400 است.
     (edu_office خودش کلاً نمی‌تواند کاربر بسازد — users.ins فقط
     manager/superadmin است.) */
  await test('N25-5: legitimate lower roles still mintable; invalid role still 400', async () => {
    const rTeacher = await req('POST', '/api/v1/users', {
      body: { full_name: 'دبیرِ مشروع N25', role: 'teacher' },
      cookie: cookieMgr1
    });
    assert.strictEqual(rTeacher.status, 201, 'ایجادِ دبیر باید مجاز باشد ولی ' + rTeacher.status + ' بود');
    assert.strictEqual(rTeacher.json.data.role, 'teacher');
    assert.strictEqual(Number(rTeacher.json.data.school_id), Number(manager1.school_id));

    const rBad = await req('POST', '/api/v1/users', {
      body: { full_name: 'نقش نامعتبر', role: 'wizard' },
      cookie: cookieMgr1
    });
    assert.strictEqual(rBad.status, 400);
    assert.strictEqual(rBad.json.code, 'invalid_role');

    const rEo = await req('POST', '/api/v1/users', {
      body: { full_name: 'تلاشِ edu_office', role: 'teacher' },
      cookie: cookieSuper
    });
    assert.strictEqual(rEo.status, 201);
  });

  console.log(`\nN-25 Scope Escalation Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
