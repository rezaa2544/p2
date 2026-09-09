#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/grades-scope.js — قلمروِ دبیر برای نمرات (P0-05)
   -------------------------------------------------------------------
   • دبیر در GET فقط نمره‌هایِ درس‌هایِ تدریسی‌اش (یا ثبت‌شدهٔ خودش) را می‌بیند
   • دبیر در نوشتن (REST و sync): اگر class_id بیگانه باشد → رد
     (همان سوراخِ مسیرِ sid که در P0-04 برای حضور بسته شد)
   • رویِ subject سخت‌گیری نیست (رفتارِ پذیرفته‌شده در server15: C5a/C10a)
   • مدیر محدود نمی‌شود (قلمروِ مدرسه سر جایش است)
   اجرا:  node tests/grades-scope.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const { opX } = require('./helpers/opx');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-grds-'));
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

const CSRF_JAR = {}; /* F-CSRF-01: نگاشتِ نشست ← توکن (تزریقِ خودکار) */
async function req(method, p, { body, cookie, csrf } = {}) {
  const jar = csrf || (cookie ? CSRF_JAR[cookie] : null);
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: cookie } : {},
      jar ? { 'X-CSRF-Token': jar } : {}
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
  const c = sc.match(/csrf_token=([^;]+)/);
  if(m && c) CSRF_JAR[m[0]] = c[1];
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
  const teacher1 = store.users.find(u => u.role === 'teacher' && u.school_id === 1);
  const student1 = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const foreignStudent = store.users.find(u => u.role === 'student' && u.school_id !== 1);

  const taughtClasses = new Set();
  store.classes.filter(c => c.homeroom_teacher_id === teacher1.id).forEach(c => taughtClasses.add(c.id));
  store.schedule.filter(s => s.teacher_id === teacher1.id).forEach(s => taughtClasses.add(s.class_id));
  const taughtSubjects = new Set(store.schedule.filter(s => s.teacher_id === teacher1.id).map(s => s.subject_id));
  const ownClass = [...taughtClasses][0];
  const ownSubject = [...taughtSubjects][0];
  const foreignClass = store.classes.find(c => c.school_id === 1 && !taughtClasses.has(c.id));
  assert.ok(ownClass != null && ownSubject != null && foreignClass, 'seed must give taught + untaught classes');

  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);

  console.log('\n🔍 P0-05 Grades Scope Tests (teacher class-scope)');

  await test('GRDS1: teacher GET /grades sees only taught subjects or own records', async () => {
    const r = await req('GET', '/api/v1/grades?limit=100', { cookie: cookieTch1 });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.data.length > 0, 'teacher must see some grades');
    assert.ok(r.json.data.every(g => taughtSubjects.has(g.subject_id) || g.teacher_id === teacher1.id),
      'every grade must be a taught subject or own record');
  });

  await test('GRDS2: teacher POST own student + foreign class_id → 404', async () => {
    const r = await req('POST', '/api/v1/grades', {
      body: { student_id: student1.id, subject_id: ownSubject, class_id: foreignClass.id, score: 15, term: 'term1' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 404);
  });

  await test('GRDS3: teacher POST foreign-school student → 404', async () => {
    const r = await req('POST', '/api/v1/grades', {
      body: { student_id: foreignStudent.id, subject_id: ownSubject, class_id: ownClass, score: 15, term: 'term1' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 404);
  });

  await test('GRDS4: teacher POST own student + own class + taught subject → 201', async () => {
    const r = await req('POST', '/api/v1/grades', {
      body: { student_id: student1.id, subject_id: ownSubject, class_id: ownClass, score: 17, term: 'term1' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 201);
  });

  await test('GRDS5: manager POST any in-school class → 201 (teacher-only tightening)', async () => {
    const r = await req('POST', '/api/v1/grades', {
      body: { student_id: student1.id, subject_id: ownSubject, class_id: foreignClass.id, score: 16, term: 'term1' },
      cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 201);
  });

  await test('GRDS6: sync parity — teacher grade with foreign class_id rejected', async () => {
    const bad = await req('POST', '/api/sync', { cookie: cookieTch1, body: { ops: [opX({
      uid: 'grds6-bad', by: teacher1.id, collection: 'grades', type: 'ins',
      data: { school_id: 1, student_id: student1.id, class_id: foreignClass.id, subject_id: ownSubject, term: 't', score: 10 },
    })] } });
    assert.strictEqual(bad.json.results[0].ok, false, 'foreign class_id must be rejected in sync');
    const good = await req('POST', '/api/sync', { cookie: cookieTch1, body: { ops: [opX({
      uid: 'grds6-good', by: teacher1.id, collection: 'grades', type: 'ins',
      data: { school_id: 1, student_id: student1.id, class_id: ownClass, subject_id: ownSubject, term: 't', score: 10 },
    })] } });
    assert.strictEqual(good.json.results[0].ok, true, 'own class must be accepted in sync');
  });

  console.log(`\nGrades Scope Tests: ${pass}/${pass + fail} passed`);
  server.close();
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
