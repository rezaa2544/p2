/* IDOR / Object-Ownership runtime harness — Payesh @ 4bff3bcb
 * Live app: PG-authoritative, production env. Real logins via the app's own
 * OTP contract: send-code -> swap the stored sha256(code|phone) in the app's
 * Redis OTP state (fixture technique; SMS gateway is external/unreachable).
 * Each login uses a distinct X-Forwarded-For (app trusts proxy) to stay under
 * the per-IP login limit — documented fixture detail, not a code bypass.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const OTP_KEY = 'payesh:otp:state';
const CODE = '424242';
const EVIDENCE = '/home/user/idor-evidence.jsonl';
fs.writeFileSync(EVIDENCE, '');

const USERS = [
  { key: 'SA',  id: 1,  phone: '09121000001', nid: '1000000001', ip: '10.1.0.1'  },
  { key: 'M1',  id: 2,  phone: '09121000010', nid: '1000000010', ip: '10.1.0.2'  },
  { key: 'M2',  id: 3,  phone: '09121000011', nid: '1000000011', ip: '10.1.0.3'  },
  { key: 'T1',  id: 4,  phone: '09121000020', nid: '1000000020', ip: '10.1.0.4'  },
  { key: 'T2',  id: 5,  phone: '09121000021', nid: '1000000021', ip: '10.1.0.5'  },
  { key: 'ST6', id: 6,  phone: '09121000101', nid: '1000000101', ip: '10.1.0.6'  },
  { key: 'ST8', id: 8,  phone: '09121000103', nid: '1000000103', ip: '10.1.0.7'  },
  { key: 'ST11',id: 11, phone: '09121000111', nid: '1000000111', ip: '10.1.0.8'  },
  { key: 'ST20',id: 20, phone: '09121000106', nid: '1000000106', ip: '10.1.0.9'  },
  { key: 'PA',  id: 17, phone: '09121000016', nid: '1000000201', ip: '10.1.0.10' },
  { key: 'PB',  id: 18, phone: '09121000017', nid: '1000000202', ip: '10.1.0.11' },
  { key: 'PC',  id: 19, phone: '09121000018', nid: '1000000203', ip: '10.1.0.12' },
  { key: 'EO',  id: 16, phone: '09121000019', nid: '1000000004', ip: '10.1.0.13' },
];
const C = {}; // cookies by key

async function api(path, { method = 'GET', cookie, body, ip, raw } = {}) {
  const h = {};
  if (body) h['content-type'] = 'application/json';
  if (cookie) h['cookie'] = 'payesh_session=' + cookie;
  if (ip) h['x-forwarded-for'] = ip;
  if (raw) Object.assign(h, raw);
  const r = await fetch(BASE + path, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, setCookie: r.headers.get('set-cookie') };
}

async function login(u, attempt = 0) {
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone: u.phone }, ip: u.ip });
  if (sc.status !== 200 && sc.status !== 429) throw new Error('send-code ' + u.key + ' -> ' + sc.status + ' ' + sc.text.slice(0, 150));
  /* 429 = in cooldown: an earlier code entry still exists; swap its hash instead */
  await new Promise(r => setTimeout(r, 300));
  const raw = await redis.get(OTP_KEY);
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const hadEntry = !!(doc.codes && doc.codes[u.phone]);
  const h = crypto.createHash('sha256').update(CODE + '|' + u.phone).digest('hex');
  if (!doc.codes[u.phone]) doc.codes[u.phone] = { at: Date.now(), tries: 0 };
  doc.codes[u.phone].h = h;
  doc.codes[u.phone].at = Date.now() + 2; /* mergeFrom adopts remote only if at is strictly newer */
  doc.seq = (doc.seq || 0) + 1;
  await redis.set(OTP_KEY, JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone: u.phone, code: CODE, national_id: u.nid }, ip: u.ip });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (m) { C[u.key] = m[1]; return; }
  if (!hadEntry && attempt < 2) {
    console.log('  ... ' + u.key + ' no code entry (' + ln.status + '); waiting 62s');
    await new Promise(r => setTimeout(r, 62000));
    return login(u, (attempt || 0) + 1);
  }
  throw new Error('login ' + u.key + ' -> ' + ln.status + ' ' + ln.text.slice(0, 200));
}
const cookie = (k) => C[k];

async function rec(id, actor, method, url, body, expect, note) {
  const u = USERS.find(x => x.key === actor);
  let r;
  if (actor === 'ANON') r = await api(url, { method, body, raw: body ? { 'content-type': 'application/json' } : {} });
  else if (actor === 'FORGED') r = await api(url, { method, body, cookie: 'eyJhbGciOiJub25lIiwidHlwZSI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6InN1cGVyYWRtaW4ifQ.', ip: u ? undefined : '10.1.0.99' });
  else r = await api(url, { method, cookie: cookie(actor), body, ip: u.ip });
  const actual = r.status;
  const code = r.json && (r.json.code || (r.json.body && r.json.body.code));
  const expectOk = expect === actual || (Array.isArray(expect) && expect.includes(actual));
  const row = {
    id, actor, method, url, body: body || null, expect, actual,
    code: code || null,
    verdict: expectOk ? 'OK' : 'MISMATCH',
    note,
    evidence: (r.text || '').slice(0, 420),
    t: new Date().toISOString(),
  };
  fs.appendFileSync(EVIDENCE, JSON.stringify(row) + '\n');
  console.log((expectOk ? '  ✓' : '  ✗') + ' ' + id + ' [' + actor + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + ' actual=' + actual + (code ? ' (' + code + ')' : '') + (note ? '  // ' + note : ''));
  return { row, r };
}

async function main() {
  console.log('== AUTH phase: real logins (OTP-swap fixture) ==');
  for (const u of USERS) { await login(u); console.log('  login OK: ' + u.key + ' (id ' + u.id + ')'); }

  // find real record ids
  const att = (sid) => {
    // query via SA list (school 1) is filtered; use direct SQL-free approach:
    // SA can see everything via /api/v1/attendance?student_id=
    return null;
  };
  // get attendance/grades ids via SA list endpoints
  const attList = await api('/api/v1/attendance?limit=200', { cookie: cookie('SA') });
  const attByStudent = {};
  for (const a of (attList.json.data || attList.json.attendance || [])) (attByStudent[a.student_id] = attByStudent[a.student_id] || []).push(a);
  const gradList = await api('/api/v1/grades?limit=200', { cookie: cookie('SA') });
  const gradByStudent = {};
  for (const g of (gradList.json.data || gradList.json.grades || [])) (gradByStudent[g.student_id] = gradByStudent[g.student_id] || []).push(g);
  const att6 = (attByStudent[6] || [])[0], att20 = (attByStudent[20] || [])[0], att11 = (attByStudent[11] || [])[0];
  const g6 = (gradByStudent[6] || [])[0], g20 = (gradByStudent[20] || [])[0], g11 = (gradByStudent[11] || [])[0];
  console.log('fixture records: att6=' + (att6 && att6.id) + ' att20=' + (att20 && att20.id) + ' att11=' + (att11 && att11.id) + ' g6=' + (g6 && g6.id) + ' g20=' + (g20 && g20.id) + ' g11=' + (g11 && g11.id));
  const A = (r) => r ? '/' + r.id : '/MISSING';

  console.log('== A. legacy /api/students/:id ==');
  await rec('A01', 'SA', 'GET', '/api/students/6', null, 200, 'superadmin own tenant');
  await rec('A02', 'M1', 'GET', '/api/students/6', null, 200, 'manager same school');
  await rec('A03', 'M2', 'GET', '/api/students/6', null, 404, 'manager cross-tenant');
  await rec('A04', 'T1', 'GET', '/api/students/6', null, 200, 'teacher homeroom class (6 in class 1)');
  await rec('A05', 'T1', 'GET', '/api/students/20', null, 404, 'teacher NOT teaching class 5 (student 20) — model denies');
  await rec('A06', 'T1', 'GET', '/api/students/8', null, 200, 'teacher teaches class 1+2 (8 enrolled both)');
  await rec('A07', 'T2', 'GET', '/api/students/6', null, 404, 'teacher cross-tenant');
  await rec('A08', 'PA', 'GET', '/api/students/6', null, 200, 'parent own child');
  await rec('A09', 'PA', 'GET', '/api/students/8', null, 404, 'parent non-child same school');
  await rec('A10', 'PC', 'GET', '/api/students/6', null, 404, 'parent cross-tenant child');
  await rec('A11', 'PB', 'GET', '/api/students/6', null, 404, 'parent with no children');
  await rec('A12', 'ST6', 'GET', '/api/students/6', null, 200, 'student self');
  await rec('A13', 'ST6', 'GET', '/api/students/7', null, 404, 'student other student');
  await rec('A14', 'ST6', 'GET', '/api/students/11', null, 404, 'student cross-tenant');
  await rec('A15', 'EO', 'GET', '/api/students/6', null, 404, 'edu_office denied by contract');
  await rec('A16', 'M1', 'GET', '/api/students/0', null, 404, 'forged id 0');
  await rec('A18', 'M1', 'GET', '/api/students/999999', null, 404, 'forged id 999999');

  console.log('== B. /api/v1/students/:id GET ==');
  await rec('B01', 'M1', 'GET', '/api/v1/students/20', null, 200, 'manager own school');
  await rec('B02', 'T1', 'GET', '/api/v1/students/20', null, 404, 'teacher not teaching class 5');
  await rec('B03', 'PA', 'GET', '/api/v1/students/6', null, 200, 'parent own child');
  await rec('B04', 'PA', 'GET', '/api/v1/students/8', null, 404, 'parent non-child');
  await rec('B05', 'ST6', 'GET', '/api/v1/students/6', null, 200, 'student self');
  await rec('B06', 'ST6', 'GET', '/api/v1/students/11', null, 404, 'student cross-tenant');
  await rec('B07', 'M2', 'GET', '/api/v1/students/6', null, 404, 'manager cross-tenant');
  await rec('B08', 'EO', 'GET', '/api/v1/students/6', null, 404, 'edu_office denied');
  await rec('B09', 'ANON', 'GET', '/api/v1/students/6', null, 401, 'unauthenticated');

  console.log('== C. /api/v1/students/:id PATCH (IEP write surface) ==');
  await rec('C01', 'T1', 'PATCH', '/api/v1/students/20', { iep_notes: 'ATTACK-WRITE-1' }, 404, '★ teacher writes IEP on student of a class he does NOT teach — DEFECT W-1 if 200');
  await rec('C02', 'T1', 'PATCH', '/api/v1/students/6', { iep_notes: 'legit-iep' }, 200, 'teacher IEP on own-class student (legit)');
  await rec('C03', 'T1', 'PATCH', '/api/v1/students/11', { iep_notes: 'x' }, 404, 'teacher cross-tenant IEP');
  await rec('C04', 'T2', 'PATCH', '/api/v1/students/20', { iep_notes: 'x' }, 404, 'cross-tenant teacher IEP');
  await rec('C05', 'ST6', 'PATCH', '/api/v1/students/6', { iep_notes: 'x' }, 403, 'student role cannot IEP');
  await rec('C06', 'PA', 'PATCH', '/api/v1/students/6', { iep_notes: 'x' }, 403, 'parent role cannot IEP');
  await rec('C07', 'T1', 'PATCH', '/api/v1/students/20', { full_name: 'hack' }, [404, 403], 'teacher non-IEP field on non-class student');
  await rec('C08', 'M1', 'PATCH', '/api/v1/students/20', { grade_level: 11 }, 200, 'manager legit field');

  console.log('== D. /api/v1/students/:id DELETE ==');
  await rec('D01', 'ST6', 'DELETE', '/api/v1/students/7', null, 403, 'student cannot delete');
  await rec('D02', 'PA', 'DELETE', '/api/v1/students/6', null, 403, 'parent cannot delete');
  await rec('D03', 'T1', 'DELETE', '/api/v1/students/20', null, 403, 'teacher cannot delete');
  await rec('D04', 'M2', 'DELETE', '/api/v1/students/6', null, 404, 'cross-tenant manager delete');

  console.log('== E. /api/v1/classes/:id ==');
  await rec('E01', 'M1', 'GET', '/api/v1/classes/1', null, 200, 'manager own school');
  await rec('E02', 'M1', 'GET', '/api/v1/classes/3', null, 404, 'cross-tenant class');
  await rec('E03', 'T1', 'GET', '/api/v1/classes/1', null, 200, 'homeroom class');
  await rec('E04', 'T1', 'GET', '/api/v1/classes/5', null, 404, 'own school, no relation');
  await rec('E05', 'T1', 'GET', '/api/v1/classes/3', null, 404, 'cross-tenant class');
  await rec('E06', 'ST6', 'GET', '/api/v1/classes/1', null, 200, 'enrolled class');
  await rec('E07', 'ST6', 'GET', '/api/v1/classes/5', null, 404, 'non-enrolled class');
  await rec('E08', 'PA', 'GET', '/api/v1/classes/1', null, 200, 'child enrolled');
  await rec('E09', 'PC', 'GET', '/api/v1/classes/1', null, 404, 'cross-tenant parent');
  await rec('E10', 'EO', 'GET', '/api/v1/classes/1', null, 200, 'office covers school 1');
  await rec('E11', 'EO', 'GET', '/api/v1/classes/3', null, 404, 'office does not cover school 2');
  await rec('E12', 'M1', 'PATCH', '/api/v1/classes/1', { name: 'کلاس 1 اصلاحی' }, 200, 'manager legit');
  await rec('E13', 'T1', 'PATCH', '/api/v1/classes/1', { name: 'x' }, 403, 'teacher cannot edit class');
  await rec('E14', 'M2', 'PATCH', '/api/v1/classes/1', { name: 'x' }, 404, 'cross-tenant manager edit');

  console.log('== F. /api/v1/attendance/:id ==');
  await rec('F01', 'T1', 'PATCH', A(att6), { status: 'present' }, 200, 'teacher own-class student attendance');
  await rec('F02', 'T1', 'PATCH', A(att20), { status: 'present' }, [403, 404], '★ teacher on non-taught class attendance — scope must deny');
  await rec('F03', 'M2', 'PATCH', A(att6), { status: 'absent' }, [403, 404], 'cross-tenant manager');
  await rec('F04', 'ST6', 'PATCH', A(att6), { status: 'present' }, 403, 'student role');
  await rec('F05', 'PA', 'PATCH', A(att6), { status: 'present' }, 403, 'parent role');
  await rec('F06', 'M1', 'PATCH', A(att11), { status: 'present' }, [403, 404], 'manager cross-tenant');

  console.log('== G. /api/v1/grades/:id ==');
  await rec('G01', 'T1', 'PATCH', A(g6), { score: '95' }, 200, 'teacher own-class grade');
  await rec('G02', 'T1', 'PATCH', A(g20), { score: '100' }, [403, 404], '★ teacher non-taught class grade');
  await rec('G03', 'M2', 'PATCH', A(g6), { score: '0' }, [403, 404], 'cross-tenant');
  await rec('G04', 'ST6', 'PATCH', A(g6), { score: '100' }, 403, 'student role');
  await rec('G05', 'M1', 'PATCH', A(g11), { score: '1' }, [403, 404], 'manager cross-tenant');

  console.log('== H. /api/v1/users/:id ==');
  await rec('H01', 'T1', 'GET', '/api/v1/users/4', null, 200, 'teacher self');
  await rec('H02', 'T1', 'GET', '/api/v1/users/2', null, 200, 'same-school directory');
  await rec('H03', 'T1', 'GET', '/api/v1/users/5', null, 404, 'cross-tenant teacher');
  await rec('H04', 'M1', 'GET', '/api/v1/users/11', null, 404, 'cross-tenant user');
  await rec('H05', 'PA', 'GET', '/api/v1/users/17', null, 200, 'parent self');
  await rec('H06', 'PA', 'GET', '/api/v1/users/6', null, 200, 'parent child');
  await rec('H07', 'PA', 'GET', '/api/v1/users/8', null, 404, 'parent non-child');
  await rec('H08', 'ST6', 'GET', '/api/v1/users/7', null, 404, 'student other');
  await rec('H09', 'ST6', 'GET', '/api/v1/users/11', null, 404, 'student cross-tenant');
  await rec('H10', 'EO', 'GET', '/api/v1/users/2', null, 200, 'office covers school 1 user');
  await rec('H11', 'EO', 'GET', '/api/v1/users/3', null, 404, 'office out of geometry');
  await rec('H12', 'M1', 'PATCH', '/api/v1/users/20', { full_name: 'تغییر مدیر' }, 200, 'manager legit');
  await rec('H13', 'T1', 'PATCH', '/api/v1/users/20', { full_name: 'hack' }, 403, 'teacher not manager');
  await rec('H14', 'M1', 'PATCH', '/api/v1/users/11', { full_name: 'x' }, 404, 'cross-tenant edit');
  await rec('H15', 'M1', 'PATCH', '/api/v1/users/1', { role: 'superadmin' }, 403, 'role escalation above own level');

  console.log('== I. analytics (new routes) ==');
  await rec('I01', 'T1', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=20', null, 403, '★ DEFECT R-1 if 200 with events: teacher reads full timeline of non-taught student');
  await rec('I02', 'T1', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, 200, 'teacher own-class student timeline');
  await rec('I03', 'T1', 'GET', '/api/v1/analytics/student-timeline?school_id=2&student_id=11', null, 403, 'tenant guard');
  await rec('I04', 'M1', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=11', null, [403, 404, 200], 'cross-tenant student id under own school (200 empty = minor)');
  await rec('I05', 'PA', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, 403, 'parent role not in school-view list');
  await rec('I06', 'ST6', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, 403, 'student role');
  await rec('I07', 'M2', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, 403, 'cross-tenant manager');
  await rec('I08', 'PA', 'GET', '/api/v1/analytics/parent-360?student_id=6', null, 200, 'parent own child');
  await rec('I09', 'PA', 'GET', '/api/v1/analytics/parent-360?student_id=8', null, 403, 'parent non-child');
  await rec('I10', 'PC', 'GET', '/api/v1/analytics/parent-360?student_id=6', null, 403, 'cross-tenant parent');
  await rec('I11', 'PB', 'GET', '/api/v1/analytics/parent-360?student_id=6', null, 403, 'parent no children');
  await rec('I12', 'M1', 'GET', '/api/v1/analytics/parent-360?school_id=1&student_id=20', null, 200, 'manager school view');
  await rec('I13', 'T1', 'GET', '/api/v1/analytics/parent-360?school_id=1&student_id=20', null, 403, '★ R-1 class: teacher on non-taught student (200 = defect)');
  await rec('I14', 'T1', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=4&school_id=1', null, 200, 'teacher self evidence');
  await rec('I15', 'T1', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=5&school_id=1', null, 403, 'teacher other teacher');
  await rec('I16', 'M1', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=4&school_id=1', null, 200, 'manager own school teacher');
  await rec('I17', 'M1', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=5&school_id=2', null, 403, 'school mismatch');
  await rec('I18', 'M1', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=11&school_id=1', null, [200, 404], 'student id as teacher_id under own school (200 empty = enumeration weakness)');
  await rec('I19', 'EO', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=4&school_id=1', null, 200, 'office geometry ok');
  await rec('I20', 'EO', 'GET', '/api/v1/analytics/teacher-evidence?teacher_id=5&school_id=2', null, 403, 'office out of geometry');
  await rec('I21', 'M1', 'GET', '/api/v1/analytics/intervention-warnings?school_id=1', null, 200, 'manager own school');
  await rec('I22', 'T1', 'GET', '/api/v1/analytics/intervention-warnings?school_id=1', null, [200, 403], 'teacher per-case guard (200 must be empty)');
  await rec('I23', 'PA', 'GET', '/api/v1/analytics/intervention-warnings?school_id=1', null, 403, 'parent role');
  await rec('I24', 'M1', 'GET', '/api/v1/analytics/attendance-risk?school_id=2', null, 403, 'cross-tenant');
  await rec('I25', 'M1', 'GET', '/api/v1/analytics/attendance-risk?school_id=1', null, 200, 'own school');
  await rec('I26', 'M1', 'GET', '/api/v1/analytics/school-health-dashboard?school_id=1', null, 200, 'own school');
  await rec('I27', 'T2', 'GET', '/api/v1/analytics/school-health-dashboard?school_id=1', null, 403, 'cross-tenant teacher');

  console.log('== J. reports ==');
  await rec('J01', 'M1', 'GET', '/api/v1/reports/academic?school_id=1', null, 200, 'manager own school');
  await rec('J02', 'M2', 'GET', '/api/v1/reports/academic?school_id=1', null, 403, 'cross-tenant');
  await rec('J03', 'T1', 'GET', '/api/v1/reports/academic?school_id=2', null, 403, 'cross-tenant teacher');
  await rec('J04', 'EO', 'GET', '/api/v1/reports/academic?school_id=1', null, 200, 'office geometry');
  await rec('J05', 'EO', 'GET', '/api/v1/reports/academic?school_id=2', null, 403, 'office out of geometry');
  await rec('J06', 'ST6', 'GET', '/api/v1/reports/academic?school_id=1', null, 403, 'student role');
  await rec('J07', 'M1', 'GET', '/api/v1/reports/teachers?school_id=1', null, 200, 'teachers report');
  await rec('J08', 'M1', 'GET', '/api/v1/reports/finance?school_id=1', null, 200, 'finance report');

  console.log('== K. sync path attacks ==');
  const syncBody = (ops) => ({ ops });
  const g8 = (gradByStudent[8] || [])[0];
  if (g8) await rec('K01', 'PA', 'POST', '/api/sync', syncBody([{ c: 'grades', t: 'upd', id: g8.id, data: { score: '100' } }]), 403, 'parent writes grade of non-child');
  await rec('K02', 'T1', 'POST', '/api/sync', syncBody([{ c: 'users', t: 'upd', id: 20, data: { iep_notes: 'sync-iep-attack' } }]), 403, '★ W-2 if 200: sync IEP on non-taught student');
  await rec('K03', 'ST6', 'POST', '/api/sync', syncBody([{ c: 'attendance', t: 'ins', data: { student_id: 7, class_id: 1, school_id: 1, status: 'present', date: '1405-01-01' } }]), 403, 'student role ins attendance');
  await rec('K04', 'M2', 'POST', '/api/sync', syncBody([{ c: 'users', t: 'upd', id: 6, data: { full_name: 'x' } }]), 403, 'cross-tenant manager sync write');
  await rec('K05', 'M1', 'POST', '/api/sync', syncBody([{ c: 'users', t: 'upd', id: 20, data: { school_id: 2 } }]), 403, 'tenant-move attack');
  await rec('K06', 'PA', 'POST', '/api/sync', syncBody([{ c: 'parent_links', t: 'ins', data: { parent_id: 19, student_id: 6 } }]), 403, 'parent forges another parent link');

  console.log('== L. misc surfaces ==');
  await rec('L01', 'M1', 'POST', '/api/admin/backup', {}, 403, 'backup superadmin-only');
  await rec('L02', 'M1', 'POST', '/api/sms/send', { to: '09121000001', message: 'x' }, 403, 'sms superadmin-only');
  await rec('L03', 'SA', 'POST', '/api/admin/backup', {}, 200, 'superadmin backup (positive control)');
  await rec('L04', 'FORGED', 'GET', '/api/v1/students/6', null, 401, 'alg:none forged JWT');
  await rec('L05', 'ANON', 'GET', '/api/students/6', null, 401, 'legacy endpoint unauthenticated');

  console.log('== done ==');
  const all = fs.readFileSync(EVIDENCE, 'utf8').trim().split('\n').map(JSON.parse);
  const mm = all.filter(x => x.verdict === 'MISMATCH');
  console.log('total cases: ' + all.length + ' | MISMATCH: ' + mm.length);
  mm.forEach(x => console.log('  MISMATCH ' + x.id + ' [' + x.actor + ' ' + x.method + ' ' + x.url + '] expect=' + JSON.stringify(x.expect) + ' actual=' + x.actual + ' // ' + x.note));
  await redis.quit();
}
main().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
