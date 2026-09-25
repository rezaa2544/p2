#!/usr/bin/env node
'use strict';
/* Focused: bootstrap→PG path — WHICH tables lose rows and WHY; and does the
 * un-advanced identity sequence collide on the first create? */
const crypto = require('crypto');
process.env.NODE_PATH = '/tmp/repo-node_modules';
require('module').Module._initPaths();
const L = require('/home/user/repo/tests/chaos-drill-lib');
const CHILD_NODE_PATH = '/tmp/repo-node_modules';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function recoverCode(infra, phone) {
  for (let i = 0; i < 25; i++) {
    const raw = infra.redis(['get', 'payesh:otp:state']);
    if (raw && !raw.startsWith('ERR') && raw !== '(nil)' && raw !== '') {
      try {
        const d = JSON.parse(raw);
        const r = d.codes && d.codes[phone];
        if (r && r.h) for (let n = 100000; n < 1000000; n++) if (sha256(String(n) + '|' + phone) === r.h) return String(n);
      } catch (e) {}
    }
    await sleep(90);
  }
  return null;
}
async function login(port, infra, phone, nid) {
  const jar = L.makeJar();
  const s = await L.httpReq(port, 'POST', '/api/auth/send-code', { phone }, { jar, timeoutMs: 10000 });
  if (s.status !== 200) return { jar, ok: false };
  const code = await recoverCode(infra, phone);
  if (!code) return { jar, ok: false };
  const l = await L.httpReq(port, 'POST', '/api/auth/login', { phone, code, national_id: nid }, { jar, timeoutMs: 10000 });
  return { jar, ok: l.status === 200 };
}

(async () => {
  const infra = await L.Infra.start();
  const api = await L.startApi({ infra, extraEnv: { NODE_PATH: CHILD_NODE_PATH, PAYESH_SMS_PROVIDER: 'mock' } });

  const ps = (q) => infra.psql(q);
  console.log('users count/max:', ps('SELECT COUNT(*), MAX(id) FROM users'));
  console.log('classes count/max:', ps('SELECT COUNT(*), MAX(id) FROM classes'));
  console.log('attendance:', ps('SELECT COUNT(*), MAX(id) FROM attendance'));
  console.log('grades:', ps('SELECT COUNT(*), MAX(id) FROM grades'));
  console.log('users_id_seq:', ps("SELECT last_value, is_called FROM users_id_seq"));
  console.log('classes_id_seq:', ps("SELECT last_value, is_called FROM classes_id_seq"));
  console.log('attendance_id_seq:', ps("SELECT last_value, is_called FROM attendance_id_seq"));

  // WHY classes skipped? try one raw insert copying seed value
  const gradeproof = ps("INSERT INTO classes (id, name, grade, school_id, homeroom_teacher_id) VALUES (9001, 'probe', 'دهم', 1, 4)");
  console.log('raw insert grade string proof:', gradeproof.replace(/\n/g, ' | '));
  const gradeok = ps("INSERT INTO classes (id, name, grade, school_id, homeroom_teacher_id) VALUES (9001, 'probe', 10, 1, 4)");
  console.log('raw insert grade int:', gradeok);

  // create user on bootstrap path → id collision?
  const mgr = await login(api.port, infra, '09992630039', '9995270358');
  console.log('manager login:', mgr.ok);
  const cu = await L.httpReq(api.port, 'POST', '/api/v1/users', { full_name: 'کاربر تازه', role: 'teacher', phone: '09990000001', national_id: '0000000001' }, { jar: mgr.jar });
  console.log('create user (bootstrap):', cu.status, JSON.stringify(cu.json).slice(0, 140));
  console.log('users count/max after:', ps('SELECT COUNT(*), MAX(id) FROM users'));

  // create student (users namespace too)
  const cs = await L.httpReq(api.port, 'POST', '/api/v1/students', { full_name: 'دانش‌آموز تازه', national_id: '0000000002' }, { jar: mgr.jar });
  console.log('create student (bootstrap):', cs.status, JSON.stringify(cs.json).slice(0, 140));

  // attendance create (attendance namespace)
  const att = await L.httpReq(api.port, 'POST', '/api/v1/attendance', { student_id: 16, date: '2026-09-25', status: 'present' }, { jar: mgr.jar });
  console.log('create attendance (bootstrap):', att.status, JSON.stringify(att.json).slice(0, 160));

  api.stop(); infra.stop();
})().catch((e) => { console.error('ERR', e.stack || e); process.exit(1); });
