#!/usr/bin/env node
/* A-35 round 2: corrected field types (schedule.day=string, grades.score=number),
   parent-link reassignment chains, foreign-class leak surface, stale-OTP & stale-OCC probes. */
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
const PGC = (s) => execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c ' + JSON.stringify(s));
const OUT = '/home/user/idor-evidence-a35-round2.jsonl';
fs.writeFileSync(OUT, '');
let n = 0, bad = 0;
async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid) {
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  if (sc.status !== 200) throw new Error('send-code ' + phone + ' -> ' + sc.status);
  await new Promise(r => setTimeout(r, 200));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const ckey = String(phone).replace(/\D/g, '').slice(-10);
  const prev = doc.codes[ckey] || { at: Date.now(), tries: 0 };
  doc.codes[ckey] = Object.assign({}, prev, { h: crypto.createHash('sha256').update(CODE + '|' + (String(phone).replace(/\D/g,'').slice(-10))).digest('hex'), at: Date.now() + 2 });
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 150));
  return 'payesh_session=' + m[1];
}
const C = {}, UID = { M1: 2, M2: 3, T1: 4, T2: 5, PA: 17, PB: 18, PC: 19 };
const sync = (actor, ops) => ({ ops: ops.map(o => Object.assign({ by: UID[actor] }, o)) });
async function rec(id, actor, method, url, body, expect, note, opExpect, contentCheck) {
  const r = await api(url, { method, cookie: actor ? C[actor] : undefined, body });
  const res0 = r.json && Array.isArray(r.json.results) && r.json.results[0];
  const op = res0 ? (res0.code || (res0.ok ? 'ok' : '?')) : (r.json && r.json.code) || '';
  let ok = expect.includes(r.status) && (!opExpect || opExpect.includes(op));
  if (ok && contentCheck) { const cj = contentCheck(r.json || {}); if (cj !== true) { ok = false; note += ' | CONTENT-FAIL: ' + cj; } }
  const row = { id, actor, method, url, body, expect, expectOp: opExpect || null, actual: r.status, op_code: op, verdict: ok ? 'OK' : 'MISMATCH', note, evidence: r.text.slice(0, 350), t: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  n++; if (!ok) bad++;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ' [' + (actor || 'ANON') + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + (opExpect ? '/' + JSON.stringify(opExpect) : '') + ' actual=' + r.status + ' (' + op + ')  // ' + note);
  if (!ok) console.log('        BODY: ' + r.text.slice(0, 260));
  return r;
}

(async () => {
  for (const [k, p, nid] of [['M1', '09121000010', '1000000010'], ['M2', '09121000011', '1000000011'], ['T1', '09121000020', '1000000020'], ['T2', '09121000021', '1000000021'], ['PA', '09121000016', '1000000201'], ['PB', '09121000017', '1000000202'], ['PC', '09121000018', '1000000203']]) C[k] = await login(p, nid);
  console.log('logins OK');

  console.log('\n═══ 0. verify round-1 foreign-class row (A35-20 residue)');
  const f20 = PGQ("SELECT id, student_id, class_id, school_id FROM attendance WHERE student_id=20 AND class_id=3");
  console.log('  A35-20 residue row: ' + (f20 || '(none)'));
  if (f20) {
    const aid = Number(f20.split("|")[0]);
    await rec('A35-20b', 'T2', 'GET', '/api/v1/attendance?class_id=3&limit=100', null, [200], 'S2 teacher 2 lists class 3 attendance — foreign S1 student row visible? (leak check)', null,
      (j) => { const rows = j.data || []; const leak = rows.filter(x => Number(x.student_id) === 20); return leak.length ? 'LEAK: S1 student 20 in S2 class-3 attendance' : true; });
    PGC("DELETE FROM attendance WHERE id=" + aid + ";");
    console.log('  (foreign attendance row ' + aid + ' removed)');
  }

  console.log('\n═══ B. FOREIGN TEACHER chain (day/period as strings)');
  const f1 = await rec('A35-10r', 'M2', 'POST', '/api/sync', sync('M2', [{ uid: u('a35-10r'), c: 'schedule', t: 'ins', data: { teacher_id: 4, class_id: 3, school_id: 2, subject_id: 1, day: '1', period: '1' } }]), [200], 'M2 assigns S1 teacher 4 to S2 class 3 (foreign teacher)', ['out_of_scope', 'validation_failed', 'unknown_field', 'school_mismatch']);
  const schedOk = f1.json && f1.json.results && f1.json.results[0] && f1.json.results[0].ok === true;
  if (schedOk) {
    console.log('  !! FOREIGN SCHEDULE ACCEPTED — scope-expansion chain as T1:');
    await rec('A35-11r', 'T1', 'GET', '/api/v1/classes/3', null, [404], 'T1(S1)→class 3(S2) read (secure: 404)');
    await rec('A35-12r', 'T1', 'GET', '/api/v1/students/11', null, [404], 'T1→student 11(S2) read (secure: 404)');
    await rec('A35-13r', 'T1', 'GET', '/api/v1/students?limit=100', null, [200], 'T1 students list — no S2 students (11-15) allowed', null,
      (j) => { const rows = j.data || j.students || []; const leak = rows.filter(x => Number(x.id) >= 11 && Number(x.id) <= 15); return leak.length ? 'LEAK: ' + leak.map(x => x.id).join(',') : true; });
    await rec('A35-14r', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-14r'), c: 'grades', t: 'ins', data: { student_id: 11, class_id: 3, school_id: 2, subject_id: 1, score: 10 } }]), [200], 'T1 grade ins on S2 student 11 (class 3 now taught by T1)', ['school_mismatch', 'out_of_scope']);
    await rec('A35-15r', 'T1', 'PATCH', '/api/v1/students/11', { iep_notes: 'A35-CT-IEP' }, [403, 404], 'T1 REST IEP write on S2 student 11');
    await rec('A35-16r', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-16r'), c: 'hw_assignments', t: 'ins', data: { class_id: 3, school_id: 2, subject_id: 1, title: 'A35-hw', due_date: '2026-10-01' } }]), [200], 'T1 hw assignment on S2 class 3', ['school_mismatch', 'out_of_scope']);
    await rec('A35-17r', 'T1', 'POST', '/api/sync', sync('T1', [{ uid: u('a35-17r'), c: 'attendance', t: 'ins', data: { student_id: 11, class_id: 3, school_id: 2, status: 'present', date: '2026-03-01' } }]), [200], 'T1 attendance ins on S2 student 11', ['school_mismatch', 'out_of_scope']);
    PGC("DELETE FROM schedule WHERE teacher_id=4 AND class_id=3;");
    console.log('  (foreign schedule row removed)');
  }

  console.log('\n═══ C. FOREIGN class refs in writes (corrected types)');
  await rec('A35-21r', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-21r'), c: 'grades', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1, subject_id: 1, score: 10 } }]), [200], 'M1 grade ins: S1 student 20 + S2 class 3 (foreign class ref)', ['out_of_scope', 'school_mismatch']);
  await rec('A35-23r', 'M1', 'POST', '/api/sync', sync('M1', [{ uid: u('a35-23r'), c: 'schedule', t: 'ins', data: { teacher_id: 5, class_id: 1, school_id: 1, subject_id: 1, day: '2', period: '1' } }]), [200], 'M1 assigns S2 teacher 5 to S1 class 1 (foreign teacher, reverse)', ['out_of_scope', 'school_mismatch']);
  const g21 = PGQ("SELECT id FROM grades WHERE student_id=20 AND class_id=3 LIMIT 1");
  if (g21) PGC("DELETE FROM grades WHERE id=" + g21 + ";");
  PGC("DELETE FROM schedule WHERE teacher_id=5 AND class_id=1;");

  console.log('\n═══ D. parent-link REASSIGNMENT chains');
  const linkId = Number(PGQ("SELECT id FROM parent_links WHERE parent_id=17 AND student_id=6 LIMIT 1") || 0);
  const forged = PGQ("SELECT id FROM parent_links WHERE parent_id=19 AND student_id=6");
  console.log('  link(17→6) id=' + linkId + ', forged(19→6) id=' + (forged || '(none)'));
  if (linkId) {
    const ra1 = await rec('A35-36r', 'PA', 'POST', '/api/sync', sync('PA', [{ uid: u('a35-36r'), c: 'parent_links', t: 'upd', id: linkId, data: { parent_id: 18 } }]), [200], 'PA reassigns OWN child 6 to same-school parent 18 (PB; cross-family transfer)', ['out_of_scope', 'school_mismatch']);
    console.log('  PG parent_id now: ' + PGQ("SELECT parent_id FROM parent_links WHERE id=" + linkId));
    // cross-tenant reassignment: remove round-1 forged link first (M1 manager del), then reassign to 19
    if (forged) { PGC("DELETE FROM parent_links WHERE id=" + forged + ";"); console.log('  (round-1 forged link removed)'); }
    await rec('A35-36s', 'PA', 'POST', '/api/sync', sync('PA', [{ uid: u('a35-36s'), c: 'parent_links', t: 'upd', id: linkId, data: { parent_id: 19 } }]), [200], 'reassign child 6 to FOREIGN-school parent 19 (PC, S2) — cross-tenant ownership transfer', ['out_of_scope', 'school_mismatch']);
    console.log('  PG parent_id now: ' + PGQ("SELECT parent_id FROM parent_links WHERE id=" + linkId));
  }
  console.log('  → PA (original parent) should have LOST access; PB/PC state set for post-restart effectiveness probe (round 3)');

  console.log('\n═══ F. replay / stale (corrected)');
  const cv = Number(PGQ("SELECT version FROM classes WHERE id=2") || 1);
  await rec('A35-61a', 'M1', 'PATCH', '/api/v1/classes/2', { name: 'v-bump', base_version: cv }, [200], 'bump class 2 version (valid OCC)');
  const cv2 = Number(PGQ("SELECT version FROM classes WHERE id=2") || cv + 1);
  await rec('A35-61b', 'M1', 'PATCH', '/api/v1/classes/2', { name: 'stale-w', base_version: Math.max(1, cv2 - 1) }, [409], 'STALE base_version (cv2-1) → 409 OCC (secure: reject)');
  // OTP replay with correct injection (preserve user_id)
  await api('/api/auth/send-code', { method: 'POST', body: { phone: '09121000018' } });
  await new Promise(r => setTimeout(r, 200));
  let raw = await redis.get('payesh:otp:state');
  let doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const pcRec = doc.codes['09121000018'] || { at: Date.now(), tries: 0 };
  doc.codes['9121000018'] = Object.assign({}, pcRec, { h: crypto.createHash('sha256').update(CODE + '|' + '9121000018').digest('hex'), at: Date.now() + 2 });
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  await rec('A35-62c', 'PC', 'POST', '/api/auth/login', { phone: '09121000018', code: CODE, national_id: '1000000203' }, [200], 'OTP first use (PC re-login)');
  await rec('A35-62d', 'PC', 'POST', '/api/auth/login', { phone: '09121000018', code: CODE, national_id: '1000000203' }, [401], 'OTP REPLAY of consumed code (secure: 401)');

  console.log('\nA-35 round2: ' + n + ' probes, ' + bad + ' MISMATCH');
  await redis.quit();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message + '\n' + (e.stack || '').slice(0, 400)); process.exit(1); });
