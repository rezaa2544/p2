#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/n31-teacher-iep-write-scope.test.js — N-31 regression guard
   -------------------------------------------------------------------
   N-31 (شدت: MEDIUM): مسیرِ نوشتنِ IEP دبیر (PATCH /api/v1/students/:id)
   فقط «هم‌مدرسه بودن» دانش‌آموز را چک می‌کرد، در حالی که دروازهٔ خواندن
   (GET /api/v1/students/:id و policy.studentRecordOk) مالکیتِ کلاس را
   الزام می‌کند: دبیر فقط شاگردانِ کلاس‌هایی که واقعاً تدریس می‌کند را
   می‌بیند. ناهم‌ترازی یعنی یک دبیر می‌توانست iep_notes هر دانش‌آموزِ
   مدرسه را تحریف کند — رکوردی که حتی اجازهٔ خواندنش را ندارد.

   اصلاح: هر دو مسیر از policy.restReadGate(store, user, 'students', ...)
   می‌گذرند — یک دروازهٔ واحد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-n31-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

const T_STORE = path.join(TMP, 'store.json');
fs.copyFileSync(REAL_STORE, T_STORE);

process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_DEMO_CODE = '1';
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
  assert.strictEqual(r.status, 200, 'send-code ناموفق: ' + r.status);
  const code = r.json.demo_code;
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: String(user.national_id) } });
  assert.strictEqual(r.status, 200, 'login ناموفق: ' + r.status);
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

function taughtStudentIds(teacherId) {
  const cls = new Set(((store.schedule) || []).filter(s => Number(s.teacher_id) === teacherId).map(s => Number(s.class_id)));
  (store.classes || []).forEach(c => { if (Number(c.homeroom_teacher_id) === teacherId) cls.add(Number(c.id)); });
  const real = new Set((store.classes || []).map(c => Number(c.id)));
  const out = new Set();
  (store.enrollments || []).forEach(e => {
    if (cls.has(Number(e.class_id)) && real.has(Number(e.class_id))) out.add(Number(e.student_id));
  });
  return out;
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const teacher = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  assert.ok(teacher, 'دادهٔ نمونه teacher نیست');
  const taught = taughtStudentIds(teacher.id);
  assert.ok(taught.size > 0, 'باید دانش‌آموزِ تدریسی وجود داشته باشد');
  const schoolStudents = store.users.filter(u => u.role === 'student' && Number(u.school_id) === 1);
  const untaught = schoolStudents.find(s => !taught.has(Number(s.id)));
  assert.ok(untaught, 'باید دانش‌آموزِ هم‌مدرسهٔ غیرتدریسی وجود داشته باشد');
  const taughtOne = schoolStudents.find(s => taught.has(Number(s.id)));
  assert.ok(taughtOne, 'باید دانش‌آموزِ تدریسی وجود داشته باشد');

  const cookie = await loginAs(teacher);
  assert.ok(cookie, 'ورودِ دبیر ناموفق بود');

  console.log('\n🔍 N-31: teacher IEP write scope == read scope');
  console.log('   دبیر id=' + teacher.id + ' | تدریسی: ' + taughtOne.id + ' | هم‌مدرسهٔ غیرتدریسی: ' + untaught.id);

  /* N31-1 — مانیفستِ خطا: دبیر نباید بتواند IEP دانش‌آموزِ هم‌مدرسه‌ای
     که کلاسش را ندارد بنویسد. قبل از اصلاح، شرطِ «هم‌مدرسه» عبورش می‌داد. */
  await test('N31-1: teacher cannot write IEP of a same-school untaught student', async () => {
    const rGet = await req('GET', '/api/v1/students/' + untaught.id, { cookie });
    assert.strictEqual(rGet.status, 404, 'خواندن باید 404 باشد (مالکیتِ کلاس) ولی ' + rGet.status + ' بود');
    const rPatch = await req('PATCH', '/api/v1/students/' + untaught.id, {
      body: { iep_notes: 'تزریقِ IEP توسط دبیرِ غیرمجاز' },
      cookie
    });
    assert.strictEqual(rPatch.status, 404, 'نوشتن هم باید 404 باشد ولی ' + rPatch.status + ' بود: ' + JSON.stringify(rPatch.json));
    assert.strictEqual(rPatch.json.code, 'not_found');
    /* و واقعاً نوشته نشده */
    const after = store.users.find(u => u.id === untaught.id);
    assert.ok(!after.iep_notes || after.iep_notes.indexOf('تزریق') === -1, 'IEP تحریف شده!');
  });

  /* N31-2 — کنترلِ مثبت: دبیر می‌تواند IEP شاگردِ کلاسِ خودش را بنویسد. */
  await test('N31-2: teacher can write IEP of own taught student', async () => {
    const rGet = await req('GET', '/api/v1/students/' + taughtOne.id, { cookie });
    assert.strictEqual(rGet.status, 200, 'خواندنِ شاگردِ تدریسی باید 200 باشد ولی ' + rGet.status + ' بود');
    const rPatch = await req('PATCH', '/api/v1/students/' + taughtOne.id, {
      body: { iep_notes: 'IEP معتبر توسط دبیرِ کلاس', iep_staff: 'دبیر ' + teacher.id },
      cookie
    });
    assert.strictEqual(rPatch.status, 200, 'نوشتن باید 200 باشد ولی ' + rPatch.status + ' بود: ' + JSON.stringify(rPatch.json));
    assert.strictEqual(rPatch.json.data.iep_notes, 'IEP معتبر توسط دبیرِ کلاس');
    const after = store.users.find(u => u.id === taughtOne.id);
    assert.strictEqual(after.iep_notes, 'IEP معتبر توسط دبیرِ کلاس');
    assert.ok(after.iep_updated, 'iep_updated باید set شود');
  });

  /* N31-3 — دبیرِ مدرسهٔ ۱ نباید به دانش‌آموزِ مدرسهٔ ۲ دسترسی داشته باشد. */
  await test('N31-3: teacher cannot touch a different school\'s student', async () => {
    const other = store.users.find(u => u.role === 'student' && Number(u.school_id) === 2);
    assert.ok(other, 'دانش‌آموزِ مدرسهٔ ۲ نیست');
    const rPatch = await req('PATCH', '/api/v1/students/' + other.id, {
      body: { iep_notes: 'دسترسیِ بین‌مدرسه‌ای' },
      cookie
    });
    assert.strictEqual(rPatch.status, 404, 'نباید به مدرسهٔ دیگر دسترسی داشته باشد ولی ' + rPatch.status + ' بود');
  });

  /* N31-4 — مدیر همچنان به کلِ مدرسه دسترسی دارد (اصلاح نباید دامنهٔ
     مدیر را تنگ کند). */
  await test('N31-4: manager still reaches every student in the school', async () => {
    const manager = store.users.find(u => u.role === 'manager' && u.school_id === 1);
    const mgrCookie = await loginAs(manager);
    assert.ok(mgrCookie, 'ورودِ مدیر ناموفق بود');
    const rGet = await req('GET', '/api/v1/students/' + untaught.id, { cookie: mgrCookie });
    assert.strictEqual(rGet.status, 200, 'مدیر باید بتواند بخواند ولی ' + rGet.status + ' بود');
    const rPatch = await req('PATCH', '/api/v1/students/' + untaught.id, {
      body: { iep_notes: 'IEP توسطِ مدیر', full_name: untaught.full_name },
      cookie: mgrCookie
    });
    assert.strictEqual(rPatch.status, 200, 'مدیر باید بتواند بنویسد ولی ' + rPatch.status + ' بود: ' + JSON.stringify(rPatch.json));
  });

  /* N31-5 — دبیر نمی‌تواند از طریقِ IEP، فیلدهایِ غیرِ IEP را هم
     بنویسد (آینهٔ isTeacherIepUpdate — یک کنترلِ مجزا روی همان مسیر). */
  await test('N31-5: teacher IEP path rejects non-IEP fields', async () => {
    const rPatch = await req('PATCH', '/api/v1/students/' + taughtOne.id, {
      body: { full_name: 'تغییرِ نامِ غیرمجاز', phone: '09999999999' },
      cookie
    });
    assert.strictEqual(rPatch.status, 200, 'PATCH باید 200 باشد (فیلدهایِ IEP نادیده گرفته می‌شوند) ولی ' + rPatch.status + ' بود');
    const after = store.users.find(u => u.id === taughtOne.id);
    assert.notStrictEqual(after.full_name, 'تغییرِ نامِ غیرمجاز', 'نباید بتواند نام را تغییر دهد');
    assert.notStrictEqual(after.phone, '09999999999', 'نباید بتواند تلفن را تغییر دهد');
  });

  console.log(`\nN-31 Teacher IEP Write Scope Tests: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
  server.close();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
