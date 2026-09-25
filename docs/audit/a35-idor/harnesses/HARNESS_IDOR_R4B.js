#!/usr/bin/env node
/* Run-4b (2026-09-25): fixes + honest-`by` sync re-probes (run-4 sync ops lacked `by` => forged_by, invalid as authz evidence). */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const OUT = '/home/user/idor-evidence-run4b.jsonl';
fs.writeFileSync(OUT, '');

async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {};
  if (body) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid) {
  await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  await new Promise(r => setTimeout(r, 150));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  if (!doc.codes[phone]) doc.codes[phone] = { at: Date.now(), tries: 0 };
  doc.codes[phone].h = crypto.createHash('sha256').update(CODE + '|' + phone).digest('hex');
  doc.codes[phone].at = Date.now() + 2;
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 150));
  return 'payesh_session=' + m[1];
}
const C = {}, UID = { M1: 2, M2: 3, T1: 4, T2: 5, ST6: 6, EO: 16, PA: 17, PB: 18, PC: 19 };
let n = 0, bad = 0;
async function rec(id, actor, method, url, body, expect, note) {
  const r = await api(url, { method, cookie: C[actor], body });
  const res0 = r.json && Array.isArray(r.json.results) && r.json.results[0];
  const op = res0 ? (res0.code || (res0.ok ? 'ok' : '?')) : (r.json && r.json.code) || '';
  const ok = expect.includes(r.status);
  const row = { id, actor, method, url, body, expect, actual: r.status, op_code: op, verdict: ok ? 'OK' : 'MISMATCH', note, evidence: r.text.slice(0, 320), t: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  n++; if (!ok) bad++;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ' [' + (actor || 'ANON') + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + ' actual=' + r.status + (op ? ' (' + op + ')' : '') + '  // ' + note);
  if (!ok) console.log('        BODY: ' + r.text.slice(0, 240));
  return r;
}
const sync = (actor, ops) => ({ ops: ops.map(o => Object.assign({ by: UID[actor] }, o)) });

(async () => {
  for (const [k, p, nid] of [['M1','09121000010','1000000010'],['M2','09121000011','1000000011'],['T1','09121000020','1000000020'],['T2','09121000021','1000000021'],['ST6','09121000101','1000000101'],['PA','09121000016','1000000201']]) C[k] = await login(p, nid);
  console.log('logins OK: ' + Object.keys(C).length);

  // fresh class-2 version (after A21-01 set homeroom=5, version=2)
  const c2 = (await api('/api/v1/classes/2', { cookie: C.M1 })).json.data;
  const v2 = c2.version;
  console.log('class2: homeroom=' + c2.homeroom_teacher_id + ' v=' + v2);

  console.log('\n════ A-21 completion (fresh OCC versions)');
  await rec('A21-02b', 'M1', 'PATCH', '/api/v1/classes/2', { homeroom_teacher_id: 20, base_version: v2 }, [403, 404, 422], 'homeroom = STUDENT (20) — role validation?');
  const c2b = (await api('/api/v1/classes/2', { cookie: C.M1 })).json.data;
  await rec('A21-03b', 'M1', 'PATCH', '/api/v1/classes/2', { homeroom_teacher_id: 999999, base_version: c2b.version }, [403, 404, 422], 'homeroom = NON-EXISTENT user (dangling ref)');
  const c2c = (await api('/api/v1/classes/2', { cookie: C.M1 })).json.data;
  await rec('A21-04b', 'M1', 'POST', '/api/v1/classes', { name: 'کلاس تست A21', grade: 10, school_id: 1, homeroom_teacher_id: 5 }, [403, 404, 422], 'CREATE class with cross-school homeroom (5, S2)');
  // restore class 2 homeroom to fixture value (NULL)
  await api('/api/v1/classes/2', { method: 'PATCH', cookie: C.M1, body: { homeroom_teacher_id: null, base_version: c2c.version } });
  console.log('  (restored class 2 homeroom → NULL)');

  console.log('\n════ sync re-probes with honest by=actor');
  await rec('W2b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-w2', c: 'users', t: 'upd', id: 20, data: { iep_notes: 'ROUND4-W2' } }]), [403], 'W-2 on current HEAD: teacher sync IEP on NON-taught student 20 (defect=200+PG)');
  await rec('A21-07b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-a21-7', c: 'classes', t: 'upd', id: 2, data: { homeroom_teacher_id: 5 } }]), [403], 'teacher sync classes upd (model: manager/SA only) — role gate');
  await rec('A21-11b', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: 'r4b-a21-11', c: 'classes', t: 'del', id: 1 }]), [403], 'cross-tenant classes del via sync (M2 → S1 class 1)');
  await rec('A21-12b', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: 'r4b-a21-12', c: 'enrollments', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1 } }]), [403, 404], 'cross-tenant class_id: enroll S1 student 20 into S2 class 3');
  await rec('A21-13b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-a21-13', c: 'enrollments', t: 'ins', data: { student_id: 20, class_id: 1, school_id: 1 } }]), [403], 'teacher sync enrollments ins (role gate)');
  await rec('SC-04b', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: 'r4b-sc-4', c: 'schools', t: 'upd', id: 2, data: { name: 'hacked-s2' } }]), [403], 'cross-tenant school name write');
  await rec('SC-05b', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: 'r4b-sc-5', c: 'schools', t: 'del', id: 2 }]), [403], 'cross-tenant school delete');
  await rec('SC-06b', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: 'r4b-sc-6', c: 'schools', t: 'upd', id: 1, data: { name: 'hacked-s1' } }]), [403], 'cross-tenant school write (reverse)');
  await rec('IV-01b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-iv-1', c: 'discipline', t: 'ins', data: { student_id: 20, class_id: 5, school_id: 1, kind: 'warning', title: 'audit-iv', points: 1, date: '1405-01-01' } }]), [403], 'teacher discipline on NON-taught student 20 (scope)');
  const iv2 = await rec('IV-02b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-iv-2', c: 'discipline', t: 'ins', data: { student_id: 6, class_id: 1, school_id: 1, kind: 'praise', title: 'audit-iv-ok', points: 0, date: '1405-01-01' } }]), [200], 'control: teacher discipline on own-class student 6');
  const iv2id = iv2.json && iv2.json.results && iv2.json.results[0] && iv2.json.results[0].id;
  await rec('IV-03b', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: 'r4b-iv-3', c: 'discipline', t: 'ins', data: { student_id: 6, class_id: 1, school_id: 1, kind: 'warning', title: 'x', points: 1, date: '1405-01-01' } }]), [403], 'cross-tenant discipline write (M2, school stamp 1)');
  await rec('IV-04b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-iv-4', c: 'interventions', t: 'ins', data: { student_id: 6, school_id: 1, kind: 'audit' } }]), [400, 403], "'interventions' collection not in authz model — record reject code");
  if (iv2id) await rec('IV-06b', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: 'r4b-iv-6', c: 'discipline', t: 'del', id: iv2id }]), [403], 'teacher discipline DELETE (model del: manager/SA only) — role gate');

  console.log('\n════ student D-dimension: owner create→delete roundtrip');
  const cr = await api('/api/v1/students', { method: 'POST', cookie: C.M1, body: { full_name: 'audit-doomed', national_id: '1000009999' } });
  const did = cr.json && cr.json.data && cr.json.data.id;
  console.log('  (M1 created doomed student id=' + did + ' status=' + cr.status + ')');
  if (did) {
    await rec('ST-16b', 'M1', 'DELETE', '/api/v1/students/' + did, null, [200, 204], 'control: manager owner create→delete roundtrip');
    await rec('ST-17b', 'T1', 'DELETE', '/api/v1/students/' + did, null, [403, 404], 'teacher delete of deleted record');
    await rec('ST-18b', 'M2', 'DELETE', '/api/v1/students/' + did, null, [403, 404], 'cross-tenant delete of gone record');
  }

  console.log('\n════ sync-conflicts tenant scoping (3 S1 conflicts exist now)');
  const cfM1 = await api('/api/sync/conflicts', { cookie: C.M1 });
  console.log('  (M1 sees ' + (cfM1.json && cfM1.json.conflicts ? cfM1.json.conflicts.length : '?') + ' conflicts)');
  const cfM2 = await rec('CF-04', 'M2', 'GET', '/api/sync/conflicts', null, [200], 'S2 manager list — must NOT contain S1 class-2 conflicts');
  const cfM2s1 = await rec('CF-05', 'M2', 'GET', '/api/sync/conflicts?school_id=1', null, [403, 404, 200], 'S2 manager explicit school_id=1 — record (200 must be empty of S1 data)');
  console.log('  CF-04 body: ' + (cfM2.text || '').slice(0, 200));
  console.log('  CF-05 body: ' + (cfM2s1.text || '').slice(0, 200));

  console.log('\n════ legacy surface (S-1 family, prod env)');
  await rec('LG-01', 'PA', 'GET', '/api/students/6', null, [200], 'legacy /api/students/:id parent own child (prod; S-1 defect=404)');
  await rec('LG-02', 'T1', 'GET', '/api/students/6', null, [200, 404], 'legacy teacher own-class read — record');

  console.log('\nrun-4b: ' + n + ' cases, ' + bad + ' MISMATCH');
  await redis.quit();
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
