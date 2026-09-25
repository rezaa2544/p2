#!/usr/bin/env node
/* A-35 round 3: post-restart EFFECTIVENESS of accepted foreign rows + cross-tenant reassignment.
   Run AFTER: (a) foreign schedule row exists (M2: teacher 4 → class 3), (b) link 1 reassigned 17→19,
   (c) app restarted (store re-hydrated from PG). */
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
const OUT = '/home/user/idor-evidence-a35-round3.jsonl';
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
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status);
  return 'payesh_session=' + m[1];
}
const C = {}, UID = { M1: 2, M2: 3, T1: 4, PA: 17, PB: 18, PC: 19 };
const sync = (actor, ops) => ({ ops: ops.map(o => Object.assign({ by: UID[actor] }, o)) });
async function rec(id, actor, method, url, body, expect, note, contentCheck) {
  const r = await api(url, { method, cookie: actor ? C[actor] : undefined, body });
  const res0 = r.json && Array.isArray(r.json.results) && r.json.results[0];
  const op = res0 ? (res0.code || (res0.ok ? 'ok' : '?')) : (r.json && r.json.code) || '';
  let ok = expect.includes(r.status);
  if (ok && contentCheck) { const cj = contentCheck(r.json || {}); if (cj !== true) { ok = false; note += ' | CONTENT-FAIL: ' + cj; } }
  const row = { id, actor, method, url, body, expect, actual: r.status, op_code: op, verdict: ok ? 'OK' : 'MISMATCH', note, evidence: r.text.slice(0, 400), t: new Date().toISOString() };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  n++; if (!ok) bad++;
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + id + ' [' + (actor || 'ANON') + ' ' + method + ' ' + url + '] expect=' + JSON.stringify(expect) + ' actual=' + r.status + ' (' + op + ')  // ' + note);
  if (!ok) console.log('        BODY: ' + r.text.slice(0, 300));
  return r;
}

(async () => {
  // pre-state: create foreign schedule (M2), cross-tenant reassignment (M1), then caller restarts app
  const args = process.argv.slice(2);
  if (args[0] === 'setup') {
    // cleanup stale foreign rows
    PGC("DELETE FROM grades WHERE student_id=20 AND class_id=3;");
    PGC("DELETE FROM schedule WHERE teacher_id=5 AND class_id=1;");
    const fk = PGQ("SELECT count(*) FROM schedule WHERE teacher_id=4 AND class_id=3");
    if (fk !== '1') {
      // create via M2
      const M2 = await login('09121000011', '1000000011');
      const r = await api('/api/sync', { method: 'POST', cookie: M2, body: sync('M2', [{ uid: u('a35-r3fs'), c: 'schedule', t: 'ins', data: { teacher_id: 4, class_id: 3, school_id: 2, subject_id: 1, day: '3', period: '1' } }]) });
      console.log('foreign schedule ins: ' + r.status + ' ' + (r.json && r.json.results[0].code || (r.json && r.json.results[0].ok === true ? 'ok' : '?')));
    } else console.log('foreign schedule row already present');
    // cross-tenant reassignment: link 1 → parent 19 (single op from PA session while PA still owns)
    const pid = Number(PGQ("SELECT parent_id FROM parent_links WHERE id=1 AND student_id=6"));
    console.log('link 1 parent_id before: ' + pid);
    if (pid === 18) PGC("UPDATE parent_links SET parent_id=17 WHERE id=1;"); // restore to PA first
    const PA = await login('09121000016', '1000000201');
    const r2 = await api('/api/sync', { method: 'POST', cookie: PA, body: sync('PA', [{ uid: u('a35-r3ct'), c: 'parent_links', t: 'upd', id: 1, data: { parent_id: 19 } }]) });
    console.log('cross-tenant reassignment 17→19: ' + r2.status + ' ' + (r2.json && r2.json.results[0].code || (r2.json && r2.json.results[0].ok === true ? 'ok' : '?')));
    console.log('link 1 parent_id after: ' + PGQ("SELECT parent_id FROM parent_links WHERE id=1 AND student_id=6"));
    await redis.quit();
    process.exit(0);
  }
  // post-restart probes
  for (const [k, p, nid] of [['T1', '09121000020', '1000000020'], ['T2', '09121000021', '1000000021'], ['PA', '09121000016', '1000000201'], ['PB', '09121000017', '1000000202'], ['PC', '09121000018', '1000000203']]) C[k] = await login(p, nid);
  console.log('logins OK (post-restart)');

  console.log('\n═══ T1 scope expansion via foreign schedule (post-hydration)');
  await rec('A35-11s', 'T1', 'GET', '/api/v1/classes/3', null, [404], 'T1(S1)→class 3(S2) single read after hydration (secure: 404)');
  await rec('A35-13s', 'T1', 'GET', '/api/v1/classes?limit=100', null, [200], 'T1 classes list — must NOT contain S2 classes (3,4)', null,
    (j) => { const rows = j.data || j.classes || []; const leak = rows.filter(x => Number(x.id) >= 3 && Number(x.id) <= 4); return leak.length ? 'LEAK: S2 classes ' + leak.map(x => x.id).join(',') : true; });
  await rec('A35-12s', 'T1', 'GET', '/api/v1/students/11', null, [404], 'T1→student 11(S2) single read (secure: 404)');
  await rec('A35-13b', 'T1', 'GET', '/api/v1/students?limit=100', null, [200], 'T1 students list — must NOT contain S2 students (11-15)', null,
    (j) => { const rows = j.data || j.students || []; const leak = rows.filter(x => Number(x.id) >= 11 && Number(x.id) <= 15); return leak.length ? 'LEAK: ' + leak.map(x => x.id).join(',') : true; });
  await rec('A35-14s', 'T1', 'GET', '/api/v1/attendance?class_id=3&limit=50', null, [403, 404], 'T1 attendance list of S2 class 3 (secure: reject)');
  await rec('A35-14t', 'T1', 'GET', '/api/v1/grades?class_id=3&limit=50', null, [403, 404], 'T1 grades list of S2 class 3 (secure: reject)');

  console.log('\n═══ cross-tenant reassignment effectiveness (post-hydration)');
  const pidNow = PGQ("SELECT parent_id FROM parent_links WHERE id=1 AND student_id=6");
  console.log('  link 1 parent_id: ' + pidNow);
  if (pidNow === '19') {
    await rec('A35-36t', 'PC', 'GET', '/api/v1/users/6', null, [404], 'PC(S2)→users/6 (S1) after cross-tenant transfer (secure: 404)');
    await rec('A35-36u', 'PC', 'GET', '/api/students/6', null, [404], 'PC(S2) legacy students/6 after transfer (secure: 404)');
    await rec('A35-36v', 'PC', 'GET', '/api/v1/grades?student_id=6&limit=50', null, [200, 403, 404], 'PC(S2) grades of S1 student 6 (secure: empty)', null,
      (j) => { const rows = j.data || j.grades || []; return rows.length ? 'LEAK: ' + rows.length + ' rows' : true; });
    await rec('A35-36w', 'PA', 'GET', '/api/v1/users/6', null, [404], 'PA (original parent) lost access to own child (expected 404 = damage confirmed)');
  }
  await rec('A35-36x', 'PA', 'GET', '/api/v1/users/7', null, [200], 'control: PA still reads own remaining child 7');

  console.log('\n═══ cleanup');
  PGC("DELETE FROM schedule WHERE teacher_id=4 AND class_id=3;");
  PGC("UPDATE parent_links SET parent_id=17 WHERE id=1 AND student_id=6;");
  console.log('  foreign schedule removed; link 1 restored to 17; state: ' + PGQ("SELECT parent_id||'->'||student_id FROM parent_links ORDER BY id"));
  await redis.quit();
  console.log('\nA-35 round3: ' + n + ' probes, ' + bad + ' MISMATCH');
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
