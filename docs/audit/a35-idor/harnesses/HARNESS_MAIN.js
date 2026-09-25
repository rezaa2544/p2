#!/usr/bin/env node
/* A-35 main attack matrix (mission A-35: review A-AUTHZ-03/04/05; mandated scenarios:
   teacher A→school B, manager A→school B, parent A→student B, NULL school, foreign class,
   foreign teacher, phone normalized/un-normalized [separate harness], replay/stale).
   Every probe asserts the SECURE model; MISMATCH = defect candidate. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const RUN = String(Date.now());
const u = (n) => n + '-' + RUN;
const PGQ = (s) => execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -t -A -c ' + JSON.stringify(s)).toString().trim();
const PGC2 = (s) => execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c ' + JSON.stringify(s));
const OUT = '/home/user/idor-evidence-a35-main.jsonl';
fs.writeFileSync(OUT, '');
let n = 0, bad = 0;
async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid, ip) {
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  if (sc.status !== 200) throw new Error('send-code ' + phone + ' -> ' + sc.status);
  await new Promise(r => setTimeout(r, 200));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const ckey = String(phone).replace(/\D/g, '').slice(-10);
  if (!doc.codes[ckey]) doc.codes[ckey] = { at: Date.now(), tries: 0 };
  doc.codes[ckey].h = crypto.createHash('sha256').update(CODE + '|' + ckey).digest('hex');
  doc.codes[ckey].at = Date.now() + 2;
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 150));
  return 'payesh_session=' + m[1];
}
const C = {}, UID = { SA: 1, M1: 2, M2: 3, T1: 4, T2: 5, ST6: 6, EO: 16, PA: 17, PB: 18, PC: 19 };
const sync = (actor, ops) => ({ ops: ops.map(o => Object.assign({ by: UID[actor] }, o)) });
async function rec(id, actor, method, url, body, expect, note, contentCheck) {
  const r = await api(url, { method, cookie: actor ? C[actor] : undefined, body });
  const res0 = r.json && Array.isArray(r.json.results) && r.json.results[0];
  const op = res0 ? (res0.code || (res0.ok ? 'ok' : '?')) : (r.json && r.json.code) || '';
  let ok = expect.includes(r.status);
  if (ok && contentCheck) {
    const cj = contentCheck(r.json || {});
    if (cj !== true) { ok = false; note += ' | CONTENT-FAIL: ' + cj; }
  }
  const row = { id, actor, method, url, body, expect, actual: r.status, op_code: op, verdict: ok ? 'OK' : 'MISMATCH', note, evidence: r.text.slice(0, 350), t: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  n++; if (!ok) bad++;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ' [' + (actor || 'ANON') + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + ' actual=' + r.status + (op ? ' (' + op + ')' : '') + '  // ' + note);
  if (!ok) console.log('        BODY: ' + r.text.slice(0, 260));
  return r;
}

(async () => {
  const actors = [
    ['SA', '09121000001', '1000000001'], ['M1', '09121000010', '1000000010'],
    ['M2', '09121000011', '1000000011'], ['T1', '09121000020', '1000000020'],
    ['T2', '09121000021', '1000000021'], ['ST6', '09121000101', '1000000101'],
    ['EO', '09121000019', '1000000004'], ['PA', '09121000016', '1000000201'],
    ['PC', '09121000018', '1000000203'],
  ];
  for (const [k, p, nid] of actors) C[k] = await login(p, nid);
  console.log('logins OK: ' + Object.keys(C).length);

  console.log('\n════ A. teacher A → school B (direct; controls)');
  await rec('A35-01', 'T2', 'GET', '/api/v1/students/6', null, [404], 'T2(S2)→student 6(S1) read — cross-tenant');
  await rec('A35-02', 'T2', 'GET', '/api/v1/classes/1', null, [404], 'T2(S2)→class 1(S1) read — cross-tenant');
  const glist = await rec('A35-03', 'T2', 'GET', '/api/v1/grades?limit=100', null, [200], 'T2 grades list — must contain NO S1 class rows (1,2)',
    (j) => { const rows = j.data || j.grades || []; const leak = rows.filter(x => Number(x.class_id) === 1 || Number(x.class_id) === 2); return leak.length ? 'LEAK: ' + leak.length + ' S1-class grades' : true; });
  await rec('A35-04', 'T2', 'POST', '/api/sync', sync('T2', [{ uid: u('a35-04'), c: 'grades', t: 'ins', data: { student_id: 6, class_id: 1, school_id: 1, subject_id: 1, score: 0 } }]), [403], 'T2 sync grade ins stamped school_id=1 (≠ S2)');
  const g1 = Number(PGQ("SELECT min(id) FROM grades WHERE school_id=1") || 0);
  if (g1) await rec('A35-05', 'T2', 'PATCH', '/api/v1/grades/' + g1, { score: '0', base_version: 1 }, [403, 404], 'T2 REST PATCH S1 grade ' + g1);
  await rec('A35-06', 'T2', 'GET', '/api/v1/users/4', null, [404], 'T2→T1 (cross-teacher directory)');

  console.log('\n════ B. FOREIGN TEACHER via schedule (exploit chain 1)');
  const f1 = await rec('A35-10', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: u('a35-10'), c: 'schedule', t: 'ins', data: { teacher_id: 4, class_id: 3, school_id: 2, subject_id: 1, day: '3', period: '1' } }]), [403], 'M2 assigns S1 TEACHER (4) to S2 class 3 (foreign teacher; secure: reject)');
  const schedOk = f1.json && f1.json.results && f1.json.results[0] && f1.json.results[0].ok === true;
  if (schedOk) {
    console.log('  !! foreign schedule row ACCEPTED — running scope-expansion chain as T1');
    await rec('A35-11', 'T1', 'GET', '/api/v1/classes/3', null, [404], 'T1(S1)→class 3(S2) read after foreign assignment (secure: 404)');
    await rec('A35-12', 'T1', 'GET', '/api/v1/students/11', null, [404], 'T1→student 11(S2, class 3) read (secure: 404)');
    await rec('A35-13', 'T1', 'GET', '/api/v1/students?limit=100', null, [200], 'T1 students list — must NOT contain S2 students 11-15',
      (j) => { const rows = j.data || j.students || []; const leak = rows.filter(x => Number(x.id) >= 11 && Number(x.id) <= 15); return leak.length ? 'LEAK: S2 students ' + leak.map(x => x.id).join(',') : true; });
    await rec('A35-14', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-14'), c: 'grades', t: 'ins', data: { student_id: 11, class_id: 3, school_id: 2, subject_id: 1, score: 0 } }]), [403], 'T1 sync grade ins on S2 student 11 (class 3 now "taught" by T1)');
    await rec('A35-15', 'T1', 'PATCH', '/api/v1/students/11', { iep_notes: 'A35-CT-IEP' }, [403, 404], 'T1 REST IEP write on S2 student 11');
    await rec('A35-16', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-16'), c: 'hw_assignments', t: 'ins', data: { class_id: 3, school_id: 2, subject_id: 1, title: 'A35-hw', due_date: '2026-10-01' } }]), [403], 'T1 sync hw assignment on S2 class 3');
    await rec('A35-17', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-17'), c: 'attendance', t: 'ins', data: { student_id: 11, class_id: 3, school_id: 2, status: 'present', date: '2026-03-01' } }]), [403], 'T1 sync attendance ins on S2 student 11');
    // cleanup foreign schedule row
    execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c "DELETE FROM schedule WHERE teacher_id=4 AND class_id=3;"');
    console.log('  (foreign schedule row removed)');
  }

  console.log('\n════ C. FOREIGN class/teacher references in writes');
  await rec('A35-20', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-20'), c: 'attendance', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1, status: 'present', date: '2026-03-02' } }]), [403], 'M1 attendance ins: S1 student 20 with S2 class 3 (foreign class ref)');
  await rec('A35-21', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-21'), c: 'grades', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1, subject_id: 1, score: 10, max_score: 20 } }]), [403], 'M1 grade ins: S1 student 20 with S2 class 3 (foreign class ref)');
  await rec('A35-22', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: u('a35-22'), c: 'schedule', t: 'ins', data: { teacher_id: 5, class_id: 3, school_id: 2, subject_id: 1, day: '6', period: '1' } }]), [200], 'control: M2 assigns OWN-school teacher 5 to S2 class 3');
  await rec('A35-23', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-23'), c: 'schedule', t: 'ins', data: { teacher_id: 5, class_id: 1, school_id: 1, subject_id: 1, day: '2', period: '2' } }]), [403], 'M1 assigns S2 TEACHER (5) to S1 class 1 (foreign teacher, reverse)');
  execSync(`psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c "DELETE FROM schedule WHERE teacher_id=5 AND class_id=3 AND day='6';" -c "DELETE FROM schedule WHERE teacher_id=5 AND class_id=1;"`);

  console.log('\n════ D. parent A → student B (exploit chains 2/3)');
  await rec('A35-30', 'PA', 'GET', '/api/v1/students/8', null, [404], 'control: PA→non-child student 8');
  await rec('A35-31', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-31'), c: 'parent_links', t: 'ins', data: { parent_id: 19, student_id: 6, relation: 'father' } }]), [403], 'M1 forges link PC(S2 parent)→student 6(S1) (cross-tenant link; secure: reject)');
  const linkOk = (() => { try { return PGQ("SELECT count(*) FROM parent_links WHERE parent_id=19 AND student_id=6") === '1'; } catch (e) { return false; } })();
  if (linkOk) {
    console.log('  !! cross-tenant parent link ACCEPTED — running cross-tenant read chain as PC (S2)');
    await rec('A35-32', 'PC', 'GET', '/api/students/6', null, [404], 'PC(S2) legacy read student 6(S1) via forged link (secure: 404)');
    await rec('A35-33', 'PC', 'GET', '/api/v1/users/6', null, [404], 'PC(S2) users read student 6(S1)');
    await rec('A35-34', 'PC', 'GET', '/api/v1/grades?student_id=6&limit=50', null, [403, 404], 'PC(S2) grades list of S1 student 6',
      (j) => { const rows = j.data || j.grades || []; return rows.length ? 'LEAK: ' + rows.length + ' grades' : true; });
    await rec('A35-35', 'PC', 'GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', null, [403, 404], 'PC(S2) timeline of S1 student 6');
  }
  const linkId = Number(PGQ("SELECT id FROM parent_links WHERE parent_id=17 AND student_id=6 LIMIT 1") || 0);
  if (linkId) {
    const ra = await rec('A35-36', 'PA', 'POST', '/api/sync', sync('PA', [{ uid: u('a35-36'), c: 'parent_links', t: 'upd', id: linkId, data: { parent_id: 19 } }]), [403], 'PA reassigns OWN child 6 link to foreign parent 19(S2) (secure: reject)');
    const reassigned = PGQ("SELECT parent_id FROM parent_links WHERE id=" + linkId);
    if (String(reassigned) === '19') {
      console.log('  !! link REASSIGNED to parent 19 — PC read chain:');
      await rec('A35-36b', 'PC', 'GET', '/api/students/6', null, [404], 'PC(S2) legacy read student 6 after reassignment (secure: 404)');
      execSync(`psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c "UPDATE parent_links SET parent_id=17, version=version+1, updated_at=now() WHERE id=${linkId};"`);
      console.log('  (link restored to 17)');
    }
    await rec('A35-37', 'PA', 'POST', '/api/sync', sync('PA', [{ uid: u('a35-37'), c: 'parent_links', t: 'upd', id: linkId, data: { relation: 'mother' } }]), [200], 'control: PA edits own link field (relation)');
    if (PGQ("SELECT relation FROM parent_links WHERE id=" + linkId) !== 'father') execSync(`psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c "UPDATE parent_links SET relation='father', version=version+1, updated_at=now() WHERE id=${linkId};"`);
  }
  await rec('A35-39', 'PC', 'GET', '/api/v1/students/11', null, [200], 'control: PC→own child 11');

  console.log('\n════ E. NULL school (EO / national accounts / geometry)');
  await rec('A35-40', 'EO', 'GET', '/api/v1/students?school_id=1&limit=50', null, [200, 403], 'EO students list (NULL school; expect empty/role-denied)',
    (j) => { const rows = j.data || j.students || []; return rows.length ? 'LEAK: ' + rows.length + ' students visible' : true; });
  await rec('A35-41', 'EO', 'POST', '/api/sync', sync('EO', [{ uid: u('a35-41'), c: 'users', t: 'ins', data: { full_name: 'eo-x', national_id: '1000008888', phone: '09121008888', role: 'student', school_id: 1 } }]), [403], 'EO sync users ins (role: manager/SA only)');
  await rec('A35-42', 'EO', 'POST', '/api/sync', sync('EO', [{ uid: u('a35-42'), c: 'parent_links', t: 'ins', data: { parent_id: 17, student_id: 8 } }]), [403], 'EO sync parent_links ins (role: mgr/parent/SA)');
  await rec('A35-43', 'EO', 'POST', '/api/sync', sync('EO', [{ uid: u('a35-43'), c: 'discipline', t: 'ins', data: { student_id: 6, school_id: 1, kind: 'warning', title: 'eo', points: 1, date: '2026-03-03' } }]), [403], 'EO sync discipline ins (role: mgr/teacher/SA)');
  await rec('A35-44', 'EO', 'POST', '/api/sync', sync('EO', [{ uid: u('a35-44'), c: 'notifications', t: 'ins', data: { user_id: 6, school_id: 1, title: 'eo-note', body: 'x', type: 'info' } }]), [200], 'control: EO notification to S1 user (geometry covers S1)');
  await rec('A35-45', 'EO', 'POST', '/api/sync', sync('EO', [{ uid: u('a35-45'), c: 'notifications', t: 'ins', data: { user_id: 11, school_id: 2, title: 'eo-note2', body: 'x', type: 'info' } }]), [403], 'EO notification to S2 user (geometry EXCLUDES S2; secure: reject)');
  await rec('A35-49', 'M1', 'GET', '/api/v1/users/16', null, [404], 'M1 directory read of NULL-school user (EO 16) (secure: 404)');
  await rec('A35-48', 'EO', 'GET', '/api/v1/users/16', null, [200], 'control: EO self read (NULL school)');

  console.log('\n════ F. replay / stale requests');
  const u17 = Number(PGQ("SELECT id FROM users WHERE id=17"));
  await rec('A35-60', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-60'), c: 'users', t: 'upd', id: 17, data: { job: 'a35-job' } }]), [200], 'M1 users upd uid=a35-60 (first apply)');
  await rec('A35-60b', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-60'), c: 'users', t: 'upd', id: 17, data: { job: 'a35-job-replay' } }]), [200], 'REPLAY same uid — expect op-level duplicate_ignored (no re-apply)');
  const c2v = Number(PGQ("SELECT version FROM classes WHERE id=2") || 1);
  await rec('A35-61a', 'M1', 'PATCH', '/api/v1/classes/2', { name: 'v-bump', base_version: c2v }, [200], 'bump class 2 version (valid OCC)');
  const c2v2 = Number(PGQ("SELECT version FROM classes WHERE id=2") || c2v + 1);
  await rec('A35-61b', 'M1', 'PATCH', '/api/v1/classes/2', { name: 'stale-w', base_version: Math.max(1, c2v2 - 1) }, [409], 'STALE base_version → 409 OCC');
  PGC2('UPDATE classes SET name=\'۱۰-الف\' WHERE id=2;');
  // OTP replay
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone: '09121000017' } });
  await new Promise(r => setTimeout(r, 200));
  const raw2 = await redis.get('payesh:otp:state');
  const doc2 = raw2 ? JSON.parse(raw2) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const prev17 = doc2.codes['9121000017'] || { at: Date.now(), tries: 0 };
  doc2.codes['9121000017'] = Object.assign({}, prev17, { at: Date.now() + 2, h: crypto.createHash('sha256').update(CODE + '|' + '9121000017').digest('hex') });
  doc2.seq = (doc2.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc2));
  const l1 = await api('/api/auth/login', { method: 'POST', body: { phone: '09121000017', code: CODE, national_id: '1000000202' } });
  await rec('A35-62a', 'PB', 'POST', '/api/auth/login', { phone: '09121000017', code: CODE, national_id: '1000000202' }, [200], 'OTP first use (PB login)');
  const l2 = await api('/api/auth/login', { method: 'POST', body: { phone: '09121000017', code: CODE, national_id: '1000000202' } });
  await rec('A35-62b', 'PB', 'POST', '/api/auth/login (replay)', { phone: '09121000017', code: CODE, national_id: '1000000202' }, [401], 'OTP REPLAY after successful login (secure: 401)');
  // session reuse after logout
  const me1 = await api('/api/auth/me', { cookie: C.T1 });
  await api('/api/auth/logout', { method: 'POST', cookie: C.T1 });
  const me2 = await api('/api/auth/me', { cookie: C.T1 });
  {
    const ok = me1.status === 200 && (me2.status === 401 || me2.status === 403);
    const row = { id: 'A35-63', actor: 'T1', method: 'GET', url: '/api/auth/me (post-logout)', body: null, expect: [401, 403], actual: me2.status, op_code: me2.json && me2.json.code || '', verdict: ok ? 'OK' : 'MISMATCH', note: 'STALE session reuse after logout (me1=' + me1.status + ' me2=' + me2.status + ')', evidence: me2.text.slice(0, 200), t: new Date().toISOString() };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n'); n++; if (!ok) bad++;
    console.log((ok ? '  \u2713 ' : '  \u2717 ') + 'A35-63 [T1] actual=' + me2.status + ' // ' + row.note);
  }
  C.T1 = await login('09121000020', '1000000020');
  // role downgrade staleness
  await rec('A35-64', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-64'), c: 'users', t: 'upd', id: 4, data: { role: 'student' } }]), [200], 'M1 downgrades T1 role teacher→student (no-escalation allowed)');
  await rec('A35-64b', 'T1', 'GET', '/api/v1/students/6', null, [403, 404], 'T1 stale cookie: teacher-scope read AFTER downgrade (secure: immediate 403/404 via PG session re-check)');
  await rec('A35-64c', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-64c'), c: 'users', t: 'upd', id: 4, data: { role: 'teacher' } }]), [200], 'restore T1 role=teacher');

  console.log('\n════ G. cross-tenant controls (re-verify)');
  await rec('A35-70', 'M2', 'GET', '/api/v1/reports/attendance?school_id=1', null, [403, 404], 'cross-tenant report');
  await rec('A35-71', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: u('a35-71'), c: 'classes', t: 'del', id: 1 }]), [403], 'cross-tenant class del');
  await rec('A35-72', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: u('a35-72'), c: 'schools', t: 'upd', id: 1, data: { name: 'hacked' } }]), [403], 'cross-tenant school upd');

  console.log('\nA-35 main: ' + n + ' probes, ' + bad + ' MISMATCH');
  await redis.quit();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message + '\n' + (e.stack || '').slice(0, 400)); process.exit(1); });
