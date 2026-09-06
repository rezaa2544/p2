#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   سئوتِ سرور (مرحلهٔ اول اتصال) — HTTP واقعی روی پورتِ گذرا
   پوشش: docs/SERVER_SECURITY_CONTRACT.md بندهای ۱٫۲، ۲، ۳، ۵٫۵، ۵٫۶، ٫۷
   اجرا: node tests/server1.js  (نیازمند seed: node server/seed.js)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
if(!fs.existsSync(REAL_STORE)){
  console.log('⏭️  store موجود نیست — اول: node server/seed.js');
  process.exit(0);
}

/* ── isolated data files for this run ─────────────────────────────── */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-srv-'));
const T_STORE = path.join(TMP, 'store.json');
const T_AUDIT = path.join(TMP, 'audit.log');
const T_KEY   = path.join(TMP, 'jwt.key');
fs.copyFileSync(REAL_STORE, T_STORE);
process.env.PAYESH_STORE = T_STORE;
process.env.PAYESH_AUDIT = T_AUDIT;
process.env.PAYESH_KEY   = T_KEY;
process.env.PAYESH_DEMO_CODE = '1';

const { server, store } = require(path.join(ROOT, 'server', 'index.js'));

let pass = 0, fail = 0;
const errors = [];
let seq = Promise.resolve();
function test(name, fn){
  seq = seq.then(() => new Promise(resolve => {
    Promise.resolve(fn()).then(
      () => { pass++; console.log('  ✅ ' + name); resolve(); },
      (e) => { fail++; errors.push(name + ': ' + (e && e.message)); console.log('  ❌ ' + name + '\n     ' + (e && e.message)); resolve(); }
    );
  }));
}
function assert(cond, msg){ if(!cond) throw new Error(msg || 'assert'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let BASE = '';
const cookies = {}; /* phone -> cookie header */

async function req(method, p, { body, cookie } = {}){
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(
      body ? { 'Content-Type': 'application/json' } : {},
      cookie ? { Cookie: cookie } : {}
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try{ json = await res.json(); }catch(e){}
  return { status: res.status, json, headers: res.headers };
}
function cookieOf(res){
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/payesh_session=[^;]+/);
  return m ? m[0] : null;
}
async function loginAs(user, { badCode, badNid } = {}){
  const phone = String(user.phone).replace(/[\s\-()]/g, '');
  let r = await req('POST', '/api/auth/send-code', { body: { phone } });
  assert(r.status === 200 && r.json.ok, 'send-code failed: ' + r.status);
  const code = badCode ? '0000' : r.json.demo_code;
  const nid = badNid ? String(Number(user.national_id) + 1).padStart(10, '0') : String(user.national_id);
  r = await req('POST', '/api/auth/login', { body: { phone, code, national_id: nid } });
  return r;
}
const byUser = (username) => store.users.find(u => u.username === username);
const byRole = (role, school) => store.users.find(u => u.role === role && (school == null || u.school_id === school));

async function main(){
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  const manager1 = byRole('manager', 1);
  const manager2 = byRole('manager', 2);
  const teacher1 = byRole('teacher', 1);
  const parent1  = byRole('parent', 1);
  const student1 = byRole('student', 1);
  const superad  = byRole('superadmin');

  /* a student of manager1's school and of manager2's school (for IDOR) */
  const stOwn  = store.users.find(u => u.role === 'student' && u.school_id === 1);
  const stAway = store.users.find(u => u.role === 'student' && u.school_id === 2);
  /* a child of parent1 */
  const kid1 = store.parent_links.find(l => l.parent_id === parent1.id);
  /* a teacher who teaches stOwn's class */
  const enrOwn = store.enrollments.find(e => e.student_id === stOwn.id);
  const clsOwn = store.classes.find(c => c.id === enrOwn.class_id);
  const teachesOwn = (store.schedule || []).some(q => q.class_id === clsOwn.id) || clsOwn.homeroom_teacher_id != null;
  const teachOwn = (store.schedule || []).find(q => q.class_id === clsOwn.id);
  const teacherOfOwn = teachOwn ? store.users.find(u => u.id === teachOwn.teacher_id) : store.users.find(u => u.id === clsOwn.homeroom_teacher_id);

  /* ── S1 health ─────────────────────────────────────────────────── */
  test('S1 health: 200 + ok', async () => {
    const r = await req('GET', '/api/health');
    assert(r.status === 200 && r.json.ok === true, 'health: ' + r.status);
    assert(r.json.name === 'payesh-server', 'name');
  });

  /* ── S2 static + per-request CSP nonce (contract §5.6.2) ───────── */
  test('S2 static: index.html served, nonce injected, no placeholder left', async () => {
    const r = await fetch(BASE + '/');
    const html = await r.text();
    const csp = r.headers.get('content-security-policy') || '';
    const m = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
    assert(m, 'CSP has no nonce: ' + csp.slice(0, 80));
    assert(html.indexOf('nonce="' + m[1] + '"') > -1, 'html lacks the request nonce');
    assert(html.indexOf('__PAYESH_NONCE__') === -1, 'placeholder left in html');
    const r2 = await fetch(BASE + '/');
    const csp2 = r2.headers.get('content-security-policy') || '';
    const m2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/);
    assert(m2 && m2[1] !== m[1], 'nonce did not change between requests');
  });

  /* ── S3 security headers (contract §5.6.1) ─────────────────────── */
  test('S3 security headers on API + static', async () => {
    const r = await req('GET', '/api/health');
    assert(r.headers.get('x-frame-options') === 'DENY', 'XFO');
    assert(r.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
    const csp = r.headers.get('content-security-policy') || '';
    assert(csp.indexOf('frame-ancestors \'none\'') > -1, 'frame-ancestors');
    assert(csp.indexOf('unsafe-inline') === -1, 'no unsafe-inline');
    assert(r.headers.get('permissions-policy') && r.headers.get('referrer-policy') === 'same-origin', 'pp/rp');
  });

  /* ── S4 send-code: unknown phone → 404 ─────────────────────────── */
  test('S4 send-code unknown phone → 404 no_account', async () => {
    const r = await req('POST', '/api/auth/send-code', { body: { phone: '09129999999' } });
    assert(r.status === 404 && r.json.code === 'no_account', r.status + ' ' + JSON.stringify(r.json));
  });

  /* ── S5 send-code: real phone → 200 + demo_code ────────────────── */
  test('S5 send-code real phone → 200 + demo_code', async () => {
    const phone = String(manager1.phone).replace(/[\s\-()]/g, '');
    const r = await req('POST', '/api/auth/send-code', { body: { phone } });
    assert(r.status === 200 && r.json.ok, r.status);
    assert(/^\d{4}$/.test(r.json.demo_code || ''), 'demo_code missing');
  });

  /* ── S6 send-code rate limit (contract §5.5) ───────────────────── */
  test('S6 send-code 6th within window → 429', async () => {
    const phone = String(manager2.phone).replace(/[\s\-()]/g, '');
    let last = null;
    for(let i = 0; i < 6; i++) last = await req('POST', '/api/auth/send-code', { body: { phone } });
    assert(last.status === 429 && last.json.code === 'rate_limited', 'got ' + last.status);
  });

  /* ── S7 login wrong code → 401 ─────────────────────────────────── */
  test('S7 login wrong code → 401 bad_code', async () => {
    const r = await loginAs(teacher1, { badCode: true });
    assert(r.status === 401 && r.json.code === 'bad_code', r.status + ' ' + JSON.stringify(r.json));
  });

  /* ── S8 login wrong national id → 401 nid_mismatch ─────────────── */
  test('S8 login wrong national id → 401 nid_mismatch', async () => {
    const r = await loginAs(teacher1, { badNid: true });
    assert(r.status === 401 && r.json.code === 'nid_mismatch', r.status + ' ' + JSON.stringify(r.json));
  });

  /* ── S9 login ok → 200 + HttpOnly/Lax cookie (contract §2.1) ───── */
  test('S9 login ok → cookie HttpOnly; SameSite=Lax; Path=/; Max-Age=28800', async () => {
    const r = await loginAs(manager1);
    assert(r.status === 200 && r.json.ok, r.status + ' ' + JSON.stringify(r.json));
    const c = r.headers.get('set-cookie') || '';
    assert(c.indexOf('HttpOnly') > -1, 'HttpOnly missing: ' + c);
    assert(c.indexOf('SameSite=Lax') > -1, 'SameSite=Lax missing');
    assert(c.indexOf('Path=/') > -1 && c.indexOf('Max-Age=28800') > -1, 'Path/Max-Age missing');
    assert(r.json.user && r.json.user.role === 'manager', 'user role');
    assert(JSON.stringify(r.json).indexOf(String(manager1.national_id)) === -1, 'nid leaked in response');
    cookies.manager1 = cookieOf(r);
  });

  /* ── S10 me ────────────────────────────────────────────────────── */
  test('S10 /api/auth/me with cookie → 200 same user', async () => {
    const r = await req('GET', '/api/auth/me', { cookie: cookies.manager1 });
    assert(r.status === 200 && r.json.user.id === manager1.id, JSON.stringify(r.json));
  });

  /* ── S11 logout revokes (jti) ──────────────────────────────────── */
  test('S11 logout → me 401 (jti actually revoked)', async () => {
    const r = await loginAs(superad);
    const ck = cookieOf(r);
    let m = await req('GET', '/api/auth/me', { cookie: ck });
    assert(m.status === 200, 'me before logout');
    await req('POST', '/api/auth/logout', { cookie: ck });
    m = await req('GET', '/api/auth/me', { cookie: ck });
    assert(m.status === 401, 'me after logout: ' + m.status);
  });

  /* ── S12 alg:none rejected (contract §2.2) ─────────────────────── */
  test('S12 alg:none token → 401', async () => {
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const fake = b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ sub: manager1.id, role: 'superadmin', school_id: 1, exp: Math.floor(Date.now() / 1000) + 600, jti: 'jt_fake_none' }) + '.';
    const r = await req('GET', '/api/auth/me', { cookie: 'payesh_session=' + fake });
    assert(r.status === 401, 'got ' + r.status);
  });

  /* ── S13 tampered signature → 401 ──────────────────────────────── */
  test('S13 tampered signature → 401', async () => {
    const r0 = await loginAs(superad);
    const ck = cookieOf(r0);
    const tok = ck.replace('payesh_session=', '');
    const parts = tok.split('.');
    const body = Buffer.from(parts[1], 'base64url').toString('utf8');
    const evil = JSON.parse(body); evil.sub = stOwn.id; /* different subject, same signature */
    parts[1] = Buffer.from(JSON.stringify(evil)).toString('base64url');
    const r = await req('GET', '/api/auth/me', { cookie: 'payesh_session=' + parts.join('.') });
    assert(r.status === 401, 'got ' + r.status);
  });

  /* ── S14 expired token → 401 ───────────────────────────────────── */
  test('S14 expired token → 401', async () => {
    /* craft an HS256 token signed with the live key file but exp in the past */
    const secret = fs.readFileSync(T_KEY, 'utf8').trim();
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = b64u({ alg: 'HS256', typ: 'JWT' });
    const payload = b64u({ sub: manager1.id, role: 'manager', school_id: 1, iat: 1, exp: 10, jti: 'jt_expired' });
    const sig = b64u(require('crypto').createHmac('sha256', secret).update(header + '.' + payload).digest());
    const r = await req('GET', '/api/auth/me', { cookie: 'payesh_session=' + [header, payload, sig].join('.') });
    assert(r.status === 401, 'got ' + r.status);
  });

  /* ── S15 sync without session → 401 ────────────────────────────── */
  test('S15 sync without session → 401', async () => {
    const r = await req('POST', '/api/sync', { body: { ops: [{ uid: 'u1', t: 'ins', c: 'announcements', by: manager1.id, data: { school_id: 1, title: 'x' } }] } });
    assert(r.status === 401, 'got ' + r.status);
  });

  /* ── S16 sync ins in scope → applied ───────────────────────────── */
  test('S16 sync ins in scope → 200 + record in store', async () => {
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't16', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, at: new Date().toISOString(), data: { school_id: 1, title: 'test-ann' } }] } });
    assert(r.status === 200 && r.json.ok, r.status + ' ' + JSON.stringify(r.json));
    assert(r.json.results[0].ok === true, 'result not ok');
    const rec = store.announcements.find(a => a.title === 'test-ann');
    assert(rec, 'record not applied');
  });

  /* ── S17 ins with foreign school_id in data → 403, nothing applied ─ */
  test('S17 ins data.school_id foreign → 403 out_of_scope, nothing applied', async () => {
    const before = store.announcements.length;
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [
      { uid: 't17a', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, data: { school_id: 1, title: 'ok-ann' } },
      { uid: 't17b', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, data: { school_id: 2, title: 'evil-ann' } },
    ] } });
    assert(r.status === 403 && r.json.code === 'out_of_scope', r.status + ' ' + JSON.stringify(r.json));
    assert(store.announcements.length === before, 'batch was applied despite 403');
  });

  /* ── S18 forged `by` → whole batch 403 (contract §3.2 #1) ──────── */
  test('S18 forged by → 403 forged_by, WHOLE batch rejected', async () => {
    const before = store.announcements.length;
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [
      { uid: 't18a', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, data: { school_id: 1, title: 'innocent-ann' } },
      { uid: 't18b', t: 'ins', c: 'announcements', by: manager2.id, user_id: manager1.id, school_id: 1, data: { school_id: 1, title: 'forged-ann' } },
    ] } });
    assert(r.status === 403 && r.json.code === 'forged_by', r.status + ' ' + JSON.stringify(r.json));
    assert(store.announcements.length === before, 'innocent op was applied');
    assert(!store.announcements.some(a => a.title === 'innocent-ann'), 'innocent op leaked in');
  });

  /* ── S19 uid idempotency (contract §3.3) ───────────────────────── */
  test('S19 repeated uid → duplicate_ignored, no double record', async () => {
    const op = { uid: 't19', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, at: new Date().toISOString(), data: { school_id: 1, title: 'idem-ann' } };
    let r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [op] } });
    assert(r.status === 200, 'first send: ' + r.status);
    r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [op] } });
    assert(r.status === 200 && r.json.results[0].code === 'duplicate_ignored', JSON.stringify(r.json.results[0]));
    const n = store.announcements.filter(a => a.title === 'idem-ann').length;
    assert(n === 1, 'double record: ' + n);
  });

  /* ── S20 role may not write the collection → 403 ───────────────── */
  test('S20 teacher ins users → 403 role_denied', async () => {
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't20', t: 'ins', c: 'messages', by: manager1.id, user_id: manager1.id, school_id: 1, data: { school_id: 1, student_id: stOwn.id } }] } });
    assert(r.status === 200, 'manager ins message should pass: ' + r.status + ' ' + JSON.stringify(r.json));
    /* now a teacher writing users */
    const rt = await loginAs(teacher1);
    const ck = cookieOf(rt);
    const r2 = await req('POST', '/api/sync', { cookie: ck, body: { ops: [{ uid: 't20b', t: 'ins', c: 'users', by: teacher1.id, user_id: teacher1.id, school_id: 1, data: { school_id: 1, role: 'student' } }] } });
    assert(r2.status === 403 && r2.json.code === 'role_denied', r2.status + ' ' + JSON.stringify(r2.json));
  });

  /* ── S21 batch > 500 → 413 ─────────────────────────────────────── */
  test('S21 batch over 500 → 413', async () => {
    const ops = [];
    for(let i = 0; i < 501; i++) ops.push({ uid: 't21' + i, t: 'ins', c: 'announcements', by: manager1.id, data: { school_id: 1, title: 'x' + i } });
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops } });
    assert(r.status === 413 && r.json.code === 'batch_too_large', r.status + ' ' + JSON.stringify(r.json));
  });

  /* ── S22 IDOR: manager scope (contract §1.2 — 404, not 403) ────── */
  test('S22 IDOR: own school 200 / other school 404 / sanitized', async () => {
    const r = await req('GET', '/api/students/' + stOwn.id, { cookie: cookies.manager1 });
    assert(r.status === 200 && r.json.student.id === stOwn.id, 'own: ' + r.status);
    const body = JSON.stringify(r.json);
    assert(body.indexOf(String(stOwn.national_id)) === -1, 'national_id leaked');
    assert(body.indexOf(String(stOwn.phone)) === -1, 'phone leaked');
    const r2 = await req('GET', '/api/students/' + stAway.id, { cookie: cookies.manager1 });
    assert(r2.status === 404 && r2.json.code === 'not_found', 'away: ' + r2.status + ' ' + JSON.stringify(r2.json));
  });

  /* ── S23 parent: own child 200 / foreign child 404 ─────────────── */
  test('S23 parent: child 200 / not-child 404', async () => {
    const rp = await loginAs(parent1);
    const ck = cookieOf(rp);
    const r = await req('GET', '/api/students/' + kid1.student_id, { cookie: ck });
    assert(r.status === 200, 'child: ' + r.status);
    const other = store.parent_links.find(l => l.parent_id !== parent1.id);
    const r2 = await req('GET', '/api/students/' + other.student_id, { cookie: ck });
    assert(r2.status === 404, 'foreign child: ' + r2.status);
  });

  /* ── S24 teacher: taught student 200 / unrelated 404 ───────────── */
  test('S24 teacher: taught student 200 / unrelated 404', async () => {
    const rt = await loginAs(teacherOfOwn);
    const ck = cookieOf(rt);
    const r = await req('GET', '/api/students/' + stOwn.id, { cookie: ck });
    assert(r.status === 200, 'taught: ' + r.status + ' ' + JSON.stringify(r.json));
    const r2 = await req('GET', '/api/students/' + stAway.id, { cookie: ck });
    assert(r2.status === 404, 'unrelated: ' + r2.status);
  });

  /* ── S25 enumeration guard (contract §5.7) ─────────────────────── */
  test('S25 >100 student reads / min → enum_warn in audit', async () => {
    const rs = await loginAs(superad);
    const ck = cookieOf(rs);
    const ids = store.users.filter(u => u.role === 'student').slice(0, 105);
    let first = 0, last = 0;
    for(let i = 0; i < ids.length; i++){
      const t0 = Date.now();
      await req('GET', '/api/students/' + ids[i].id, { cookie: ck });
      if(i === 0) first = Date.now() - t0;
      last = Date.now() - t0;
    }
    const auditTxt = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
    assert(auditTxt.indexOf('"enum_warn"') > -1, 'no enum_warn in audit');
    assert(last >= 40, 'no slowdown on request #105: ' + last + 'ms');
  });

  /* ── S26 audit log contains no phone / nid ─────────────────────── */
  test('S26 audit log has no phone / national_id', async () => {
    const auditTxt = fs.existsSync(T_AUDIT) ? fs.readFileSync(T_AUDIT, 'utf8') : '';
    for(const u of [manager1, teacher1, parent1, student1, superad]){
      assert(auditTxt.indexOf(String(u.national_id)) === -1, 'nid in audit');
      if(u.phone) assert(auditTxt.indexOf(String(u.phone).replace(/[\s\-()]/g, '')) === -1, 'phone in audit');
    }
  });

  /* ── S27 upd: in scope ok / out of scope 403 ───────────────────── */
  test('S27 upd own-school grade ok / other-school 403', async () => {
    const gOwn = store.grades.find(g => g.student_id === stOwn.id && g.school_id === 1) || store.grades.find(g => g.school_id === 1);
    const gAway = store.grades.find(g => g.school_id === 2);
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't27a', t: 'upd', c: 'grades', by: manager1.id, user_id: manager1.id, school_id: 1, id: gOwn.id, data: { value: 20 } }] } });
    assert(r.status === 200, 'own upd: ' + r.status + ' ' + JSON.stringify(r.json));
    assert(store.grades.find(g => g.id === gOwn.id).value === 20, 'not applied');
    const r2 = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't27b', t: 'upd', c: 'grades', by: manager1.id, user_id: manager1.id, school_id: 1, id: gAway.id, data: { value: 21 } }] } });
    assert(r2.status === 403 && r2.json.code === 'out_of_scope', 'away upd: ' + r2.status + ' ' + JSON.stringify(r2.json));
    assert(store.grades.find(g => g.id === gAway.id).value !== 21, 'away record was changed');
  });

  /* ── S28 del in scope ──────────────────────────────────────────── */
  test('S28 del own announcement → removed', async () => {
    const rec = store.announcements.find(a => a.title === 'test-ann');
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't28', t: 'del', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, id: rec.id }] } });
    assert(r.status === 200, r.status + ' ' + JSON.stringify(r.json));
    assert(!store.announcements.some(a => a.id === rec.id), 'not deleted');
  });

  /* ── S29 clock skew: >24h `at` → accepted + logged ─────────────── */
  test('S29 clock-skew op accepted and logged', async () => {
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't29', t: 'ins', c: 'announcements', by: manager1.id, user_id: manager1.id, school_id: 1, at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(), data: { school_id: 1, title: 'skew-ann' } }] } });
    assert(r.status === 200 && r.json.results[0].ok, r.status + ' ' + JSON.stringify(r.json));
    const auditTxt = fs.readFileSync(T_AUDIT, 'utf8');
    assert(auditTxt.indexOf('"sync_clock_skew"') > -1, 'no clock-skew log');
  });

  /* ── S30 unknown collection → fail closed ──────────────────────── */
  test('S30 unknown collection → 403 role_denied (fail closed)', async () => {
    const r = await req('POST', '/api/sync', { cookie: cookies.manager1, body: { ops: [{ uid: 't30', t: 'ins', c: 'totally_unknown_coll', by: manager1.id, data: { school_id: 1 } }] } });
    assert(r.status === 403 && r.json.code === 'role_denied', r.status + ' ' + JSON.stringify(r.json));
  });

  await seq;
  await sleep(10);
  server.close();
  console.log('\n' + '─'.repeat(52));
  console.log(`سرور (مرحلهٔ اول): ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق ❌` : '  —  بدون خطا ✅'));
  errors.slice(0, 8).forEach(e => console.log('   ' + e));
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
