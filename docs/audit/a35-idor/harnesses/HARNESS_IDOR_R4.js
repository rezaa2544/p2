#!/usr/bin/env node
/* Run-4 (2026-09-25, fresh env): full ID-object matrix + A-19/A-21 independent repro.
   Objects: student, parent, teacher, class, homeroom, school, attendance, grades, intervention, reports.
   Dimensions: owner / non-owner / same-tenant / diff-tenant / same-school / diff-school / diff-role × R/W/D.
   Expectations = SECURE model. MISMATCH row = defect candidate (or wrong expectation — triaged manually). */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const OUT = '/home/user/idor-evidence-run4.jsonl';
fs.writeFileSync(OUT, '');

async function api(p, { method = 'GET', cookie, body, ip } = {}) {
  const h = {};
  if (body) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  if (ip) h['x-forwarded-for'] = ip;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid, ip) {
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone }, ip });
  if (sc.status !== 200) throw new Error('send-code ' + phone + ' -> ' + sc.status);
  await new Promise(r => setTimeout(r, 200));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  if (!doc.codes[phone]) doc.codes[phone] = { at: Date.now(), tries: 0 };
  doc.codes[phone].h = crypto.createHash('sha256').update(CODE + '|' + phone).digest('hex');
  doc.codes[phone].at = Date.now() + 2;
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid }, ip });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 120));
  return 'payesh_session=' + m[1];
}
const C = {};
let n = 0, bad = 0;
async function rec(id, actor, method, url, body, expect, note) {
  const r = await api(url, { method, cookie: C[actor], body });
  const op = r.json && r.json.results ? (r.json.results[0] && (r.json.results[0].code || (r.json.results[0].ok ? 'ok' : '?'))) : (r.json && r.json.code) || '';
  const ok = expect.includes(r.status);
  const row = { id, actor, method, url, body, expect, actual: r.status, op_code: op, verdict: ok ? 'OK' : 'MISMATCH', note, evidence: r.text.slice(0, 300), t: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  n++;
  if (!ok) bad++;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ' [' + (actor || 'ANON') + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + ' actual=' + r.status + (op ? ' (' + op + ')' : '') + '  // ' + note);
  if (!ok) console.log('        BODY: ' + r.text.slice(0, 220));
  return r;
}

(async () => {
  const actors = [
    ['SA', '09121000001', '1000000001', '10.9.20.1'], ['M1', '09121000010', '1000000010', '10.9.20.2'],
    ['M2', '09121000011', '1000000011', '10.9.20.3'], ['T1', '09121000020', '1000000020', '10.9.20.4'],
    ['T2', '09121000021', '1000000021', '10.9.20.5'], ['ST6', '09121000101', '1000000101', '10.9.20.6'],
    ['EO', '09121000019', '1000000004', '10.9.20.7'], ['PA', '09121000016', '1000000201', '10.9.20.8'],
    ['PB', '09121000017', '1000000202', '10.9.20.9'], ['PC', '09121000018', '1000000203', '10.9.20.10'],
  ];
  for (const [k, p, nid, ip] of actors) C[k] = await login(p, nid, ip);
  console.log('logins OK: ' + Object.keys(C).length);

  // live versions / ids via SA
  const g = await api('/api/v1/grades?limit=100', { cookie: C.SA });
  const gmap = {};
  for (const x of (g.json && g.json.data) || []) gmap[x.student_id + ':' + x.subject_id] = x;
  const a = await api('/api/v1/attendance?limit=100', { cookie: C.SA });
  const amap = {};
  for (const x of (a.json && a.json.data) || []) { if (!amap[x.student_id]) amap[x.student_id] = x; }
  const cls = {};
  for (const cid of [1, 2]) { const r = await api('/api/v1/classes/' + cid, { cookie: C.SA }); cls[cid] = r.json && r.json.data; }
  const u20 = (await api('/api/v1/users/20', { cookie: C.SA })).json.data;
  const enr = (await api('/api/v1/users/20', { cookie: C.SA })).json.data; // enrollment id fetched via SQL below if needed
  console.log('fixtures: g6=' + (gmap['6:1'] && gmap['6:1'].id) + ' g20=' + (gmap['20:1'] && gmap['20:1'].id) +
    ' a6=' + (amap[6] && amap[6].id) + ' a20=' + (amap[20] && amap[20].id) +
    ' c1v=' + (cls[1] && cls[1].version) + ' c2v=' + (cls[2] && cls[2].version) + ' u20v=' + (u20 && u20.version));

  console.log('\n════ A-19 — student-timeline / parent-360 student_id ownership (independent repro)');
  await rec('A19-01', 'T1', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=20', null, [403, 404], 'teacher → NON-taught student 20 (A-19 core; expect deny, defect=200)');
  await rec('A19-02', 'T1', 'GET', '/api/v1/analytics/parent-360?school_id=1&student_id=20', null, [403, 404], 'teacher → parent-360 of NON-taught student 20');
  await rec('A19-03', 'T1', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, [200], 'control: teacher → own-homeroom student 6');
  await rec('A19-04', 'T2', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, [403, 404], 'diff-school teacher → school-1 student (tenant guard)');
  await rec('A19-05', 'T2', 'GET', '/api/v1/analytics/student-timeline?school_id=2&student_id=11', null, [200], 'control: T2 → own-class student 11');
  await rec('A19-06', 'M2', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, [403, 404], 'cross-tenant manager → school-1 student');
  await rec('A19-07', 'PA', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, [200], 'control: parent → own child 6');
  await rec('A19-08', 'PA', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=8', null, [403, 404], 'parent → NON-child student 8');
  await rec('A19-09', 'T1', 'GET', '/api/v1/analytics/intervention-warnings?school_id=1', null, [200], 'teacher own-school intervention-warnings (school-level)');
  await rec('A19-10', 'T2', 'GET', '/api/v1/analytics/intervention-warnings?school_id=1', null, [403, 404], 'cross-tenant intervention-warnings');

  console.log('\n════ A-21 — class_id / homeroom_teacher_id ownership (independent repro)');
  const c2v = cls[2] && cls[2].version, c1v = cls[1] && cls[1].version;
  await rec('A21-01', 'M1', 'PATCH', '/api/v1/classes/2', { homeroom_teacher_id: 5, base_version: c2v }, [403, 404, 422], 'A-21 core: manager sets homeroom = DIFFERENT-SCHOOL teacher (5, S2) on S1 class');
  await rec('A21-02', 'M1', 'PATCH', '/api/v1/classes/2', { homeroom_teacher_id: 20, base_version: c2v }, [403, 404, 422], 'homeroom = STUDENT (20) — role validation?');
  await rec('A21-03', 'M1', 'PATCH', '/api/v1/classes/2', { homeroom_teacher_id: 999999, base_version: c2v }, [403, 404, 422], 'homeroom = NON-EXISTENT user (dangling ref)');
  await rec('A21-04', 'M1', 'POST', '/api/v1/classes', { name: 'کلاس تست A21', school_id: 1, homeroom_teacher_id: 5 }, [403, 404, 422], 'create class with cross-school homeroom (5, S2)');
  await rec('A21-05', 'M2', 'PATCH', '/api/v1/classes/1', { homeroom_teacher_id: 5, base_version: c1v }, [403, 404], 'cross-tenant class write (M2 → S1 class 1)');
  await rec('A21-06', 'T1', 'PATCH', '/api/v1/classes/1', { name: 'x', base_version: c1v }, [403], 'teacher role → class write (role gate)');
  await rec('A21-07', 'T1', 'POST', '/api/sync', { ops: [{ uid: 'r4-a21-7', c: 'classes', t: 'upd', id: 2, data: { homeroom_teacher_id: 5 } }] }, [403], 'teacher sync class write (role gate)');
  await rec('A21-08', 'M1', 'PATCH', '/api/v1/classes/2', { name: 'کلاس 1-2 (audit)', base_version: c2v }, [200], 'control: manager owner-class write');
  await rec('A21-09', 'T1', 'DELETE', '/api/v1/classes/2', null, [403], 'teacher role → class delete');
  await rec('A21-10', 'M2', 'DELETE', '/api/v1/classes/1', null, [403, 404], 'cross-tenant class delete');
  await rec('A21-11', 'M2', 'POST', '/api/sync', { ops: [{ uid: 'r4-a21-11', c: 'classes', t: 'del', id: 1, base_version: c1v }] }, [403], 'cross-tenant class delete via sync');

  // enrollment class_id (cross-tenant class_id write) — enrollment id for student 20 via SQL-less trick: use sync by data
  const e20 = await api('/api/v1/students?limit=50', { cookie: C.SA });
  console.log('\n── enrollment/class_id probes');
  await rec('A21-12', 'M1', 'POST', '/api/sync', { ops: [{ uid: 'r4-a21-12', c: 'enrollments', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1 } }] }, [403, 404], 'enrollment with class_id=3 (S2 class) for S1 student — cross-tenant class_id');
  await rec('A21-13', 'T1', 'POST', '/api/sync', { ops: [{ uid: 'r4-a21-13', c: 'enrollments', t: 'ins', data: { student_id: 20, class_id: 1, school_id: 1 } }] }, [403], 'teacher role → enrollment write (role gate)');

  console.log('\n════ school object (R/W/D)');
  await rec('SC-01', 'M2', 'GET', '/api/v1/reports/attendance?school_id=1', null, [403, 404], 'cross-tenant school report');
  await rec('SC-02', 'M1', 'GET', '/api/v1/reports/attendance?school_id=1', null, [200], 'control: owner school report');
  await rec('SC-03', 'T1', 'GET', '/api/v1/reports/attendance?school_id=1', null, [403], 'teacher role → school report');
  await rec('SC-04', 'M1', 'POST', '/api/sync', { ops: [{ uid: 'r4-sc-4', c: 'schools', t: 'upd', id: 2, data: { name: 'hacked-s2' } }] }, [403], 'cross-tenant school write (name)');
  await rec('SC-05', 'M1', 'POST', '/api/sync', { ops: [{ uid: 'r4-sc-5', c: 'schools', t: 'del', id: 2 }] }, [403], 'cross-tenant school delete');
  await rec('SC-06', 'M2', 'POST', '/api/sync', { ops: [{ uid: 'r4-sc-6', c: 'schools', t: 'upd', id: 1, data: { name: 'hacked-s1' } }] }, [403], 'cross-tenant school write (reverse)');
  await rec('SC-07', 'EO', 'GET', '/api/v1/analytics/school-intelligence?school_id=2', null, [403, 404], 'edu_office (geometry S1) → school-2 intelligence');

  console.log('\n════ student object (R/W/D) — re-verify on fresh env');
  await rec('ST-01', 'PA', 'GET', '/api/v1/students/6', null, [200], 'owner: parent → own child');
  await rec('ST-02', 'PA', 'GET', '/api/v1/students/8', null, [403, 404], 'non-owner same-tenant parent → other child');
  await rec('ST-03', 'PB', 'GET', '/api/v1/students/6', null, [403, 404], 'parent w/o children → student');
  await rec('ST-04', 'PC', 'GET', '/api/v1/students/6', null, [403, 404], 'different-tenant parent → S1 student');
  await rec('ST-05', 'T1', 'GET', '/api/v1/students/20', null, [403, 404], 'teacher NON-taught student read');
  await rec('ST-06', 'T1', 'GET', '/api/v1/students/6', null, [200], 'control: teacher own-class read');
  await rec('ST-07', 'M2', 'GET', '/api/v1/students/6', null, [403, 404], 'cross-tenant manager read');
  await rec('ST-08', 'ST6', 'GET', '/api/v1/students/6', null, [200], 'control: student self read');
  await rec('ST-09', 'T1', 'PATCH', '/api/v1/students/20', { iep_notes: 'ROUND4-W1' }, [403, 404], 'W-1 re-verify: teacher IEP write NON-taught (defect=200+PG)');
  await rec('ST-10', 'M2', 'PATCH', '/api/v1/students/6', { full_name: 'x' }, [403, 404], 'cross-tenant student write');
  await rec('ST-11', 'PA', 'PATCH', '/api/v1/students/6', { full_name: 'x' }, [403], 'S-2 re-verify: parent write own child (expect 403 role, defect=404)');
  await rec('ST-12', 'ST6', 'PATCH', '/api/v1/students/6', { full_name: 'دانش‌آموز 1-1' }, [200, 403], 'student self-edit (self allowlist) — record behavior');
  await rec('ST-13', 'T1', 'DELETE', '/api/v1/students/20', null, [403], 'teacher role → student delete');
  await rec('ST-14', 'M2', 'DELETE', '/api/v1/students/6', null, [403, 404], 'cross-tenant student delete');
  await rec('ST-15', 'PA', 'DELETE', '/api/v1/students/6', null, [403], 'parent → delete own child');
  // owner create+delete roundtrip (destructive-safe: fresh doomed student)
  const cr = await api('/api/v1/students', { method: 'POST', cookie: C.M1, body: { full_name: 'audit-doomed', school_id: 1 } });
  const did = cr.json && cr.json.data && cr.json.data.id;
  console.log('  (M1 created doomed student id=' + did + ' status=' + cr.status + ')');
  if (did) {
    await rec('ST-16', 'M1', 'DELETE', '/api/v1/students/' + did, null, [200, 204], 'control: manager owner create→delete roundtrip');
    await rec('ST-17', 'T1', 'DELETE', '/api/v1/students/' + (did), null, [403, 404], 'after owner delete: teacher delete of gone record');
  }

  console.log('\n════ parent / teacher objects via /api/v1/users/:id (R/W/D)');
  await rec('US-01', 'M1', 'GET', '/api/v1/users/17', null, [200], 'manager → own-school parent (directory)');
  await rec('US-02', 'M2', 'GET', '/api/v1/users/17', null, [403, 404], 'cross-tenant manager → S1 parent');
  await rec('US-03', 'PA', 'GET', '/api/v1/users/17', null, [200], 'control: parent self read');
  await rec('US-04', 'ST6', 'GET', '/api/v1/users/17', null, [403, 404], 'student → parent record (role view) — record behavior');
  await rec('US-05', 'M1', 'GET', '/api/v1/users/4', null, [200], 'manager → own-school teacher');
  await rec('US-06', 'T2', 'GET', '/api/v1/users/4', null, [403, 404], 'cross-tenant teacher → S1 teacher');
  await rec('US-07', 'T1', 'GET', '/api/v1/users/4', null, [200], 'control: teacher self read');
  await rec('US-08', 'M1', 'PATCH', '/api/v1/users/17', { job: 'audit-job' }, [200, 403], 'manager → own-school parent PII write (model: manager users-upd) — record');
  await rec('US-09', 'T1', 'PATCH', '/api/v1/users/17', { iep_notes: 'iep-on-parent' }, [403, 404], 'teacher IEP on PARENT record (W-1 extension: non-student user) — expect deny');
  await rec('US-10', 'M2', 'PATCH', '/api/v1/users/17', { full_name: 'x' }, [403, 404], 'cross-tenant user write');
  await rec('US-11', 'T1', 'DELETE', '/api/v1/users/4', null, [403], 'teacher self-delete via REST (role)');
  await rec('US-12', 'M2', 'DELETE', '/api/v1/users/2', null, [403, 404], 'cross-tenant manager delete');
  await rec('US-13', 'M1', 'DELETE', '/api/v1/users/18', null, [200, 403], 'manager → own-school parent (PB, no children) delete — record behavior');

  console.log('\n════ attendance (R/W/D)');
  const a6 = amap[6], a20 = amap[20];
  await rec('AT-01', 'T1', 'PATCH', '/api/v1/attendance/' + (a6 && a6.id), { status: 'present', base_version: a6 && a6.version }, [200], 'control: teacher own-class attendance write');
  await rec('AT-02', 'T1', 'PATCH', '/api/v1/attendance/' + (a20 && a20.id), { status: 'present', base_version: a20 && a20.version }, [403], 'teacher NON-taught attendance write');
  await rec('AT-03', 'M2', 'PATCH', '/api/v1/attendance/' + (a6 && a6.id), { status: 'present', base_version: a6 && a6.version }, [403, 404], 'cross-tenant attendance write');
  await rec('AT-04', 'ST6', 'PATCH', '/api/v1/attendance/' + (a6 && a6.id), { status: 'present', base_version: a6 && a6.version }, [403], 'student role → attendance write');
  await rec('AT-05', 'T1', 'DELETE', '/api/v1/attendance/' + (a20 && a20.id), null, [403], 'teacher NON-taught attendance delete');
  await rec('AT-06', 'M2', 'DELETE', '/api/v1/attendance/' + (a6 && a6.id), null, [403, 404], 'cross-tenant attendance delete');
  await rec('AT-07', 'T1', 'POST', '/api/v1/attendance', { student_id: 20, class_id: 5, school_id: 1, status: 'present', date: '1405-01-03' }, [403, 404], 'teacher CREATE attendance for NON-taught student — expect deny');
  await rec('AT-08', 'T1', 'POST', '/api/v1/attendance', { student_id: 6, class_id: 1, school_id: 1, status: 'late', date: '1405-01-03' }, [200, 201], 'control: teacher CREATE own-class attendance');

  console.log('\n════ grades (R/W/D)');
  const g6 = gmap['6:1'], g20 = gmap['20:1'];
  await rec('GR-01', 'T1', 'PATCH', '/api/v1/grades/' + (g6 && g6.id), { score: '19.5', base_version: g6 && g6.version }, [200], 'control: teacher own-class grade write');
  await rec('GR-02', 'T1', 'PATCH', '/api/v1/grades/' + (g20 && g20.id), { score: '19', base_version: g20 && g20.version }, [403], 'teacher NON-taught grade write');
  await rec('GR-03', 'M2', 'PATCH', '/api/v1/grades/' + (g6 && g6.id), { score: '0', base_version: g6 && g6.version }, [403, 404], 'cross-tenant grade write');
  await rec('GR-04', 'T1', 'DELETE', '/api/v1/grades/' + (g20 && g20.id), null, [403], 'teacher NON-taught grade delete');
  await rec('GR-05', 'M2', 'DELETE', '/api/v1/grades/' + (g6 && g6.id), null, [403, 404], 'cross-tenant grade delete');
  await rec('GR-06', 'T1', 'POST', '/api/v1/grades', { student_id: 20, class_id: 5, school_id: 1, subject_id: 1, score: '15', max_score: 20 }, [403, 404], 'teacher CREATE grade for NON-taught student — expect deny');

  console.log('\n════ intervention / discipline (R/W/D)');
  await rec('IV-01', 'T1', 'POST', '/api/sync', { ops: [{ uid: 'r4-iv-1', c: 'discipline', t: 'ins', data: { student_id: 20, class_id: 5, school_id: 1, kind: 'warning', title: 'audit-iv', points: 1, date: '1405-01-01' } }] }, [403], 'teacher discipline on NON-taught student — expect scope deny');
  await rec('IV-02', 'T1', 'POST', '/api/sync', { ops: [{ uid: 'r4-iv-2', c: 'discipline', t: 'ins', data: { student_id: 6, class_id: 1, school_id: 1, kind: 'praise', title: 'audit-iv-ok', points: 0, date: '1405-01-01' } }] }, [200], 'control: teacher discipline on own-class student');
  await rec('IV-03', 'M2', 'POST', '/api/sync', { ops: [{ uid: 'r4-iv-3', c: 'discipline', t: 'ins', data: { student_id: 6, class_id: 1, school_id: 1, kind: 'warning', title: 'x', points: 1, date: '1405-01-01' } }] }, [403], 'cross-tenant discipline write');
  await rec('IV-04', 'T1', 'POST', '/api/sync', { ops: [{ uid: 'r4-iv-4', c: 'interventions', t: 'ins', data: { student_id: 6, school_id: 1, kind: 'audit' } }] }, [400, 403], "'interventions' not in authz model — expect reject (unknown collection/role)");
  await rec('IV-05', 'T1', 'DELETE', '/api/v1/analytics/intervention-warnings', null, [404, 405], 'no DELETE surface on intervention-warnings (probe)');

  console.log('\n════ reports (R) + sync conflicts (R/W)');
  await rec('RP-01', 'M2', 'GET', '/api/v1/reports/academic?school_id=1', null, [403, 404], 'cross-tenant academic report');
  await rec('RP-02', 'M1', 'GET', '/api/v1/reports/academic?school_id=1', null, [200], 'control: owner academic report');
  await rec('RP-03', 'T1', 'GET', '/api/v1/reports/teachers?school_id=1', null, [403], 'teacher role → teachers report');
  const cf1 = await rec('CF-01', 'M1', 'GET', '/api/sync/conflicts', null, [200], 'own-school conflicts list');
  const cf2 = await rec('CF-02', 'M2', 'GET', '/api/sync/conflicts', null, [200], 'S2 manager own conflicts list — verify content tenant-scoped');
  await rec('CF-03', 'M2', 'GET', '/api/sync/conflicts?school_id=1', null, [403, 404, 200], 'explicit school_id=1 on S2 manager — record behavior');

  console.log('\nrun-4: ' + n + ' cases, ' + bad + ' MISMATCH');
  await redis.quit();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
