#!/usr/bin/env node
/* A-35 regression pins — authorization bypasses & leaks confirmed during the A-35 audit
   (PIN 4bff3bcb). Each SEC-* case is a live exploit that MUST be rejected; CTRL-* cases are
   legitimate operations that MUST keep working. Run against a live instance on :3000 with
   the A-35 fixture (2 schools, 20 users, parent_links 17→6/17→7, 19→11).
   Exit 0 = all PASS (or only documented SKIP); exit 1 = any FAIL.
   No fake green: SKIP is counted and printed, never as PASS. */
'use strict';
const crypto = require('crypto');
const { execSync } = require('child_process');
const Redis = require('/home/user/p2/node_modules/ioredis');
const redis = new Redis('redis://127.0.0.1:6379');
const BASE = 'http://127.0.0.1:3000';
const CODE = '424242';
const PGQ = (s) => execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -t -A -c ' + JSON.stringify(s)).toString().trim();
const PGC = (s) => execSync('psql "postgres://payesh:payesh@127.0.0.1:5432/payesh_db_idor" -c ' + JSON.stringify(s));
let nPass = 0, nFail = 0, nSkip = 0;
const results = [];
function report(id, status, detail) {
  results.push({ id, status, detail });
  const mark = status === 'PASS' ? '\u2713' : status === 'FAIL' ? '\u2717' : '\u25CB';
  console.log(mark + ' ' + id + ' ' + status + (detail ? ' — ' + detail : ''));
  if (status === 'PASS') nPass++; else if (status === 'FAIL') nFail++; else nSkip++;
}
async function api(p, { method = 'GET', cookie, body } = {}) {
  const h = {}; if (body) h['content-type'] = 'application/json'; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, text: t, setCookie: r.headers.get('set-cookie') };
}
async function login(phone, nid) {
  const sc = await api('/api/auth/send-code', { method: 'POST', body: { phone } });
  if (sc.status !== 200) throw new Error('send-code ' + phone + ' -> ' + sc.status);
  await new Promise(r => setTimeout(r, 150));
  const raw = await redis.get('payesh:otp:state');
  const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
  const ckey = String(phone).replace(/\D/g, '').slice(-10);
  const prev = doc.codes[ckey] || { at: Date.now(), tries: 0 };
  /* keep send-code's user_id binding (login verifies rec.user_id === user.id) */
  doc.codes[ckey] = Object.assign({}, prev, { h: crypto.createHash('sha256').update(CODE + '|' + (String(phone).replace(/\D/g,'').slice(-10))).digest('hex'), at: Date.now() + 2 });
  doc.seq = (doc.seq || 0) + 1;
  await redis.set('payesh:otp:state', JSON.stringify(doc));
  const ln = await api('/api/auth/login', { method: 'POST', body: { phone, code: CODE, national_id: nid } });
  const m = ln.setCookie && ln.setCookie.match(/payesh_session=([^;]+)/);
  if (!m) throw new Error('login ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 120));
  return 'payesh_session=' + m[1];
}
const UID = { SA: 1, M1: 2, M2: 3, T1: 4, T2: 5, EO: 16, PA: 17, PB: 18, PC: 19 };
const RUN = String(Date.now()); /* unique uid prefix per run — uid dedup must not mask verdicts */
const uid = (n) => 'a35reg-' + n + '-' + RUN;
const sync = (actor, ops) => ({ ops: ops.map(o => Object.assign({ by: UID[actor] }, o)) });
const opOk = (r) => r.json && Array.isArray(r.json.results) && r.json.results[0] && r.json.results[0].ok === true;
const opCode = (r) => r.json && Array.isArray(r.json.results) && r.json.results[0] ? (r.json.results[0].code || (r.json.results[0].ok ? 'ok' : '?')) : '?';
function assertDenied(id, label, r, note) {
  const denied = !opOk(r);
  report(id, denied ? 'PASS' : 'FAIL', label + ' → actual: ' + r.status + ' op=' + opCode(r) + (note ? ' (' + note + ')' : ''));
  return denied;
}
function assertAllowed(id, label, r) {
  report(id, opOk(r) ? 'PASS' : 'FAIL', label + ' → actual: ' + r.status + ' op=' + opCode(r));
}

(async () => {
  // ── preflight: app + PG + fixture ─────────────────────────────────────────
  const h = await api('/api/health');
  if (h.status !== 200) throw new Error('app not healthy');
  if (PGQ('SELECT count(*) FROM users') !== '20') throw new Error('fixture users != 20 (run a35-overlay.js)');
  if (PGQ('SELECT count(*) FROM parent_links') < '3') throw new Error('fixture parent_links missing');
  const linkA = Number(PGQ("SELECT id FROM parent_links WHERE parent_id=17 AND student_id=6 LIMIT 1") || 0);
  if (!linkA) throw new Error('fixture link 17→6 missing');
  const flush = async () => { await redis.del('payesh:otp:state'); for (const k of await redis.keys('rate:*')) await redis.del(k); };
  await flush();
  // pre-clean: remove any foreign rows from earlier audit rounds (test must start clean)
  PGC("DELETE FROM parent_links WHERE parent_id=19 AND student_id=6;");
  PGC("DELETE FROM schedule WHERE teacher_id=4 AND class_id=3;");
  PGC("DELETE FROM schedule WHERE teacher_id=5 AND class_id=1;");
  PGC("DELETE FROM grades WHERE student_id=20 AND class_id=3;");
  PGC("DELETE FROM attendance WHERE student_id=20 AND class_id=3;");
  PGC("DELETE FROM parent_links WHERE parent_id=18 AND student_id=8;");

  const C = {};
  for (const [k, p, nid] of [['M1', '09121000010', '1000000010'], ['M2', '09121000011', '1000000011'],
    ['T1', '09121000020', '1000000020'], ['T2', '09121000021', '1000000021'],
    ['EO', '09121000019', '1000000004'], ['PA', '09121000016', '1000000201'], ['PC', '09121000018', '1000000203']]) {
    C[k] = await login(p, nid);
  }

  // ── SEC: cross-tenant write vectors (all MUST be rejected) ─────────────────
  assertDenied('A35-SEC-1', 'M2 schedule ins: S1 teacher 4 → S2 class 3 (foreign teacher)',
    await api('/api/sync', { method: 'POST', cookie: C.M2, body: sync('M2', [{ uid: uid('1'), c: 'schedule', t: 'ins', data: { teacher_id: 4, class_id: 3, school_id: 2, subject_id: 1, day: '5', period: '1' } }]) }));
  assertDenied('A35-SEC-2', 'M1 parent_links ins: S2 parent 19 → S1 student 6 (cross-tenant link)',
    await api('/api/sync', { method: 'POST', cookie: C.M1, body: sync('M1', [{ uid: uid('2'), c: 'parent_links', t: 'ins', data: { parent_id: 19, student_id: 6, relation: 'father' } }]) }));
  // SEC-3: parent reassigns own child to foreign-school parent (single op; restore after)
  const r3 = await api('/api/sync', { method: 'POST', cookie: C.PA, body: sync('PA', [{ uid: uid('3'), c: 'parent_links', t: 'upd', id: linkA, data: { parent_id: 19 } }]) });
  assertDenied('A35-SEC-3', 'PA reassigns own child 6 → S2 parent 19 (cross-tenant transfer)', r3);
  if (PGQ("SELECT parent_id FROM parent_links WHERE id=" + linkA) !== '17') PGC("UPDATE parent_links SET parent_id=17 WHERE id=" + linkA + ";");
  assertDenied('A35-SEC-4', 'M1 attendance ins: S1 student 20 + S2 class 3 (foreign class ref)',
    await api('/api/sync', { method: 'POST', cookie: C.M1, body: sync('M1', [{ uid: uid('4'), c: 'attendance', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1, status: 'present', date: '2026-03-05' } }]) }));
  assertDenied('A35-SEC-5', 'M1 grades ins: S1 student 20 + S2 class 3 (foreign class ref)',
    await api('/api/sync', { method: 'POST', cookie: C.M1, body: sync('M1', [{ uid: uid('5'), c: 'grades', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1, subject_id: 1, score: 10 } }]) }));
  assertDenied('A35-SEC-6', 'M1 schedule ins: S2 teacher 5 → S1 class 1 (foreign teacher, reverse)',
    await api('/api/sync', { method: 'POST', cookie: C.M1, body: sync('M1', [{ uid: uid('6'), c: 'schedule', t: 'ins', data: { teacher_id: 5, class_id: 1, school_id: 1, subject_id: 1, day: '5', period: '2' } }]) }));

  // ── SEC-7: phone canonicalization — variant forms must share the per-phone bucket ──
  {
    await flush();
    await api('/api/auth/send-code', { method: 'POST', body: { phone: '09121000010' } });
    await api('/api/auth/send-code', { method: 'POST', body: { phone: '+989121000010' } });
    /* window buckets only — exclude the :day: rolling counters (different window) */
    const keys = (await redis.keys('rate:otp:send:phone:*')).filter(k => /^rate:otp:send:phone:[0-9]+$/.test(k) && /9121000010$/.test(k));
    const cnts = {};
    for (const k of keys) cnts[k] = Number(await redis.get(k));
    const total = Object.values(cnts).reduce((a, b) => a + b, 0);
    if (keys.length <= 1 && total >= 2) {
      report('A35-SEC-7', 'PASS', 'both formats counted in ONE canonical bucket (keys=' + JSON.stringify(cnts) + ')');
    } else {
      report('A35-SEC-7', 'FAIL', 'bucket split across variants: ' + JSON.stringify(cnts));
    }
  }

  // ── SEC-8: OTP single-use — replay of a consumed code must fail ────────────
  {
    await flush();
    await api('/api/auth/send-code', { method: 'POST', body: { phone: '09121000017' } });
    await new Promise(r => setTimeout(r, 150));
    const raw = await redis.get('payesh:otp:state');
    const doc = raw ? JSON.parse(raw) : { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {}, seq: 0 };
    const ckey = '9121000017';
    const prev = doc.codes[ckey] || { at: Date.now(), tries: 0 };
    doc.codes[ckey] = Object.assign({}, prev, { h: crypto.createHash('sha256').update(CODE + '|' + ckey).digest('hex'), at: Date.now() + 2 });
    doc.seq = (doc.seq || 0) + 1;
    await redis.set('payesh:otp:state', JSON.stringify(doc));
    const l1 = await api('/api/auth/login', { method: 'POST', body: { phone: '09121000017', code: CODE, national_id: '1000000202' } });
    const l2 = await api('/api/auth/login', { method: 'POST', body: { phone: '09121000017', code: CODE, national_id: '1000000202' } });
    report('A35-SEC-8', l1.status === 200 && l2.status === 401 ? 'PASS' : 'FAIL', 'OTP first use=' + l1.status + ', replay=' + l2.status + ' (expect 200 then 401)');
  }

  // ── CTRL: legitimate operations MUST keep working ──────────────────────────
  assertAllowed('A35-CTRL-1', 'M2 schedule ins: own-school teacher 5 → S2 class 3 (control)',
    await api('/api/sync', { method: 'POST', cookie: C.M2, body: sync('M2', [{ uid: uid('c1'), c: 'schedule', t: 'ins', data: { teacher_id: 5, class_id: 3, school_id: 2, subject_id: 1, day: '6', period: '1' } }]) }));
  PGC("DELETE FROM schedule WHERE teacher_id=5 AND class_id=3 AND day='6';");
  {
    const r = await api('/api/sync', { method: 'POST', cookie: C.PA, body: sync('PA', [{ uid: uid('c2'), c: 'parent_links', t: 'upd', id: linkA, data: { relation: 'mother' } }]) });
    report('A35-CTRL-2', opOk(r) ? 'PASS' : 'FAIL', 'PA edits own link field (relation) → ' + r.status + ' op=' + opCode(r));
    if (PGQ("SELECT relation FROM parent_links WHERE id=" + linkA) !== 'father') PGC("UPDATE parent_links SET relation='father' WHERE id=" + linkA + ";");
  }
  {
    const r = await api('/api/v1/students/6', { cookie: C.PA });
    report('A35-CTRL-3', r.status === 200 ? 'PASS' : 'FAIL', 'PA reads own child 6 → ' + r.status);
  }
  {
    const r = await api('/api/v1/classes/3', { cookie: C.T2 });
    report('A35-CTRL-4', r.status === 200 ? 'PASS' : 'FAIL', 'T2 reads own-school class 3 → ' + r.status);
  }
  {
    const r = await api('/api/sync', { method: 'POST', cookie: C.M1, body: sync('M1', [{ uid: uid('c5'), c: 'parent_links', t: 'ins', data: { parent_id: 18, student_id: 8, relation: 'father' } }]) });
    report('A35-CTRL-5', opOk(r) ? 'PASS' : 'FAIL', 'M1 creates same-school link 18→8 → ' + r.status + ' op=' + opCode(r));
    PGC("DELETE FROM parent_links WHERE parent_id=18 AND student_id=8;");
  }
  {
    const r = await api('/api/v1/users/16', { cookie: C.EO });
    report('A35-CTRL-6 (F4)', r.status === 200 ? 'PASS' : 'FAIL', 'EO self-read users/16 (NULL school) → ' + r.status);
  }
  {
    const r = await api('/api/v1/students/6', { cookie: C.T1 });
    report('A35-CTRL-7', r.status === 200 ? 'PASS' : 'FAIL', 'T1 (homeroom c1) reads student 6 → ' + r.status);
  }

  // ── post-state sanity ──────────────────────────────────────────────────────
  const links = PGQ('SELECT parent_id||chr(45)||student_id FROM parent_links ORDER BY id');
  console.log('\nfinal parent_links: ' + links.split('\n').join(' '));
  console.log('\nA-35 REGRESSION: ' + nPass + ' PASS, ' + nFail + ' FAIL, ' + nSkip + ' SKIP');
  await redis.quit();
  process.exit(nFail > 0 ? 1 : 0);
})().catch(e => { console.error('ABORT: ' + e.message); process.exit(2); });
