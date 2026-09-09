#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/attendance-scope.js — قلمروِ کلاسیِ دبیر برای حضور (P0-04)
   -------------------------------------------------------------------
   • دبیر در GET فقط رکوردهایِ کلاس‌هایِ تدریسی‌اش را می‌بیند
   • دبیر در نوشتن (REST و sync): اگر class_id بیگانه باشد → رد
     (حتی وقتی دانش‌آموز خودی است — سوراخِ مسیرِ sid بسته شد)
   • مدیر محدود نمی‌شود (قلمروِ مدرسه سر جایش است)
   اجرا:  node tests/attendance-scope.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const { opX } = require('./helpers/opx');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-atts-'));
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

  const taught = new Set();
  store.classes.filter(c => c.homeroom_teacher_id === teacher1.id).forEach(c => taught.add(c.id));
  store.schedule.filter(s => s.teacher_id === teacher1.id).forEach(s => taught.add(s.class_id));
  const ownClass = [...taught][0];
  const foreignClass = store.classes.find(c => c.school_id === 1 && !taught.has(c.id));
  assert.ok(ownClass != null && foreignClass, 'seed must give taught + untaught classes in school 1');

  const cookieMgr1 = await loginAs(manager1);
  const cookieTch1 = await loginAs(teacher1);

  console.log('\n🔍 P0-04 Attendance Scope Tests (teacher class-scope)');

  await test('ATTS1: teacher GET /attendance sees only taught classes', async () => {
    const rT = await req('GET', '/api/v1/attendance?limit=100', { cookie: cookieTch1 });
    assert.strictEqual(rT.status, 200);
    assert.ok(rT.json.data.length > 0, 'teacher must see some records');
    assert.ok(rT.json.data.every(a => taught.has(a.class_id)),
      'every record must belong to a taught class');
    const rM = await req('GET', '/api/v1/attendance?limit=1', { cookie: cookieMgr1 });
    assert.ok(rM.json.pagination.total > rT.json.pagination.total,
      'manager sees strictly more than teacher (filter is active)');
  });

  await test('ATTS2: teacher POST own student + foreign class_id → 404', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: student1.id, class_id: foreignClass.id, date: '2026-09-09', status: 'present' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 404);
  });

  await test('ATTS3: teacher POST foreign-school student → 404', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: foreignStudent.id, class_id: ownClass, date: '2026-09-09', status: 'present' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 404);
  });

  await test('ATTS4: teacher POST own student + own class → 201', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: student1.id, class_id: ownClass, date: '2026-09-09', status: 'present' },
      cookie: cookieTch1,
    });
    assert.strictEqual(r.status, 201);
  });

  await test('ATTS5: manager POST any in-school class → 201 (teacher-only tightening)', async () => {
    const r = await req('POST', '/api/v1/attendance', {
      body: { student_id: student1.id, class_id: foreignClass.id, date: '2026-09-08', status: 'present' },
      cookie: cookieMgr1,
    });
    assert.strictEqual(r.status, 201);
  });

  await test('ATTS6: sync parity — teacher attendance with foreign class_id rejected', async () => {
    const bad = await req('POST', '/api/sync', { cookie: cookieTch1, body: { ops: [opX({
      uid: 'atts6-bad', by: teacher1.id, collection: 'attendance', type: 'ins',
      data: { student_id: student1.id, class_id: foreignClass.id, school_id: 1, date: '2026-09-09', status: 'present' },
    })] } });
    assert.strictEqual(bad.json.results[0].ok, false, 'foreign class_id must be rejected in sync');
    const good = await req('POST', '/api/sync', { cookie: cookieTch1, body: { ops: [opX({
      uid: 'atts6-good', by: teacher1.id, collection: 'attendance', type: 'ins',
      data: { student_id: student1.id, class_id: ownClass, school_id: 1, date: '2026-09-07', status: 'present' },
    })] } });
    assert.strictEqual(good.json.results[0].ok, true, 'own class must be accepted in sync');
  });

  console.log(`\nAttendance Scope Tests: ${pass}/${pass + fail} passed`);
  server.close();
  if (fail > 0) process.exit(1);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
