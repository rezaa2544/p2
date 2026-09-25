#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/idor-runtime-r4.js — PHASE-2 (2026-09-25) LIVE PG GATE:
   regression pins for the IDOR / object-ownership audit, re-issued:
   A-19 (student-timeline student_id ownership), A-21 (class_id /
   homeroom_teacher_id ownership), W-1/W-2 (IEP non-taught write),
   R-5 (attendance create — missing `late` column ⇒ 503 in PG mode),
   R-6 (identity-sequence desync ⇒ PK collision ⇒ silent overwrite).

   Same convention as tests/idor-runtime.js: production-topology gate,
   in-process server against PostgreSQL + Redis, demo-code logins,
   audit fixture (payesh_db_idor). Every defect case asserts the SECURE
   behavior; while the defect is present the case FAILS (red pin).
   Do NOT weaken assertions to go green — green means fixed.

   Required env: DATABASE_URL, REDIS_URL. Single-writer: stop other
   payesh instances on this DB before running.
   Exit: 0 = all secure · 1 = pinned defect red · 2 = BLOCKED.
   Evidence → /home/user/idor-evidence-pins-r4.jsonl (or $PIN_EVID).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const EVID_PATH = process.env.PIN_EVID || '/home/user/idor-evidence-pins-r4.jsonl';

if (!process.env.DATABASE_URL) { console.error('BLOCKED: DATABASE_URL required (PG-only gate)'); process.exit(2); }
if (!process.env.REDIS_URL)   { console.error('BLOCKED: REDIS_URL required (OTP state)');   process.exit(2); }

delete process.env.NODE_ENV;
delete process.env.PAYESH_ENV;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-idor-r4-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_JWT_SECRET = 'idor-r4-test-secret-0123456789abcdef0123456789';

const { server } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;
const EVID = [];
function log(id, desc, status, expect, extra) {
  const ok = expect.indexOf(status) !== -1;
  const row = { id, desc, status, expect, ok, extra: extra ? String(extra).slice(0, 300) : undefined, t: new Date().toISOString() };
  EVID.push(row);
  fs.appendFileSync(EVID_PATH, JSON.stringify(row) + '\n');
  console.log((ok ? '  \u2705 ' : '  \u274C ') + id + ' [' + status + ' expect ' + expect.join('/') + '] ' + desc +
    (ok ? '' : ' — ' + String(extra).slice(0, 300)));
  if (ok) pass++; else fail++;
}
async function req(method, p, { body, cookie } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, headers: res.headers };
}
async function login(phone, nationalId) {
  const sc = await req('POST', '/api/auth/send-code', { body: { phone } });
  if (sc.status !== 200) throw new Error('send-code failed ' + phone + ' -> ' + sc.status + ' ' + sc.text.slice(0, 120));
  const demoCode = sc.json && (sc.json.demo_code || (sc.json.data || {}).demo_code);
  if (!demoCode) throw new Error('no demo_code for ' + phone + ' (NODE_ENV must be non-production)');
  const ln = await req('POST', '/api/auth/login', { body: { phone, code: String(demoCode), national_id: nationalId } });
  const cookie = (ln.headers.get('set-cookie') || '').match(/payesh_session=([^;]+)/);
  if (!cookie) throw new Error('login failed ' + phone + ' -> ' + ln.status + ' ' + ln.text.slice(0, 160));
  return 'payesh_session=' + cookie[1];
}

/* direct PG (fixture ensure + pin internals) */
const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
async function pg(sql, params) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await c.query(sql, params); } finally { await c.end(); }
}

async function ensureFixture() {
  /* idempotent audit overlay (same as the 2026-09-25 provisioning) */
  await pg(`INSERT INTO provinces (id, code, name) VALUES (1,'01','اصفهان'),(2,'02','البرز') ON CONFLICT (id) DO NOTHING`);
  await pg(`INSERT INTO counties (id, province_id, name) VALUES (1,1,'شهرستان تست ۱'),(2,2,'شهرستان تست ۲') ON CONFLICT (id) DO NOTHING`);
  await pg(`UPDATE schools SET county_id=1 WHERE id=1`);
  await pg(`UPDATE schools SET province_id=2, county_id=2 WHERE id=2`);
  await pg(`INSERT INTO users (id, phone, national_id, role, school_id, full_name, active) VALUES
      (16,'09121000019','1000000004','edu_office',NULL,'دفتر الف',true),
      (17,'09121000016','1000000201','parent',1,'Parent A (S1)',true),
      (18,'09121000017','1000000202','parent',1,'Parent B (S1)',true),
      (19,'09121000018','1000000203','parent',2,'Parent C (S2)',true),
      (20,'09121000106','1000000106','student',1,'دانش‌آموز 1-6',true)
    ON CONFLICT (id) DO NOTHING`);
  await pg(`INSERT INTO offices (id, name, province_id, county_id, user_id, level, active)
      SELECT 1,'اداره تست',1,1,16,'province',true
    WHERE NOT EXISTS (SELECT 1 FROM offices WHERE id=1)`);
  await pg(`UPDATE users SET office_id=1 WHERE id=16`);
  await pg(`INSERT INTO classes (id, school_id, name, grade) VALUES (5,1,'کلاس 1-3',11) ON CONFLICT (id) DO NOTHING`);
  await pg(`UPDATE classes SET homeroom_teacher_id=4 WHERE id=1 AND homeroom_teacher_id IS NULL`);
  await pg(`INSERT INTO schedule (teacher_id, class_id, school_id, subject_id)
      SELECT v.t, v.c, v.s, v.sub FROM (VALUES (4,2,1,1),(5,3,2,1),(5,4,2,2)) AS v(t,c,s,sub)
    WHERE NOT EXISTS (SELECT 1 FROM schedule)`);
  await pg(`INSERT INTO enrollments (student_id, class_id, school_id)
      SELECT 20,5,1 WHERE NOT EXISTS (SELECT 1 FROM enrollments WHERE student_id=20 AND class_id=5)`);
  await pg(`INSERT INTO attendance (student_id, class_id, school_id, status, date)
      SELECT 20,5,1,'present','1405-01-01' WHERE NOT EXISTS (SELECT 1 FROM attendance WHERE student_id=20)`);
  /* sequence sync (R-6 fix prerequisite; without it the pin's fixture is self-destructing) */
  for (const t of ['users', 'classes', 'enrollments', 'attendance', 'grades']) {
    try { await pg(`SELECT setval(pg_get_serial_sequence($1,'id'), (SELECT max(id) FROM ${t}))`, [t]); } catch (e) {}
  }
}

(async () => {
  fs.writeFileSync(EVID_PATH, '');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  console.log('phase-2 gate: server on ' + BASE);
  const ready = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch(BASE + '/api/health'); if (r.status === 200) return true; } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  })();
  if (!ready) { console.error('BLOCKED: server not ready (health never 200 within 90s)'); process.exit(2); }
  try {
    await ensureFixture();
    const C = {};
    C.M1 = await login('09121000010', '1000000010');
    C.M2 = await login('09121000011', '1000000011');
    C.T1 = await login('09121000020', '1000000020');
    C.PA = await login('09121000016', '1000000201');

    /* ── A-19: student-timeline / parent-360 student_id ownership ── */
    let r = await req('GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=20', { cookie: C.T1 });
    log('P2-A19a', 'A-19 teacher→student-timeline of NON-taught student 20 (secure: deny)', r.status, [403, 404], r.text);
    r = await req('GET', '/api/v1/analytics/parent-360?school_id=1&student_id=20', { cookie: C.T1 });
    log('P2-A19b', 'A-19 teacher→parent-360 of NON-taught student 20 (secure: deny)', r.status, [403, 404], r.text);
    r = await req('GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', { cookie: C.T1 });
    log('P2-A19c', 'control: teacher→timeline of TAUGHT student 6 (secure: 200)', r.status, [200], r.text);

    /* ── A-21: homeroom_teacher_id / class_id ownership ── */
    const c5 = (await pg(`SELECT id, version FROM classes WHERE id=5`)).rows[0];
    r = await req('PATCH', '/api/v1/classes/5', { body: { homeroom_teacher_id: 5, base_version: c5.version }, cookie: C.M1 });
    log('P2-A21a', 'A-21 manager sets homeroom = DIFFERENT-SCHOOL teacher (5, S2) (secure: reject)', r.status, [403, 404, 422], r.text);
    const c5b = (await pg(`SELECT homeroom_teacher_id FROM classes WHERE id=5`)).rows[0];
    if (Number(c5b.homeroom_teacher_id) !== 0 && c5b.homeroom_teacher_id != null) {
      await pg(`UPDATE classes SET homeroom_teacher_id=NULL, version=version+1 WHERE id=5`);
      console.log('  (fixture restored: class 5 homeroom → NULL after A21a)');
    }
    r = await req('POST', '/api/sync', { cookie: C.M1, body: { ops: [{ uid: 'p2-a21b-' + Date.now(), c: 'enrollments', t: 'ins', data: { student_id: 20, class_id: 3, school_id: 1 }, by: 2 }] } });
    const a21b = r.json && r.json.results && r.json.results[0];
    log('P2-A21b', 'A-21 sync enrollment of S1 student 20 into S2 class 3 (cross-tenant class_id; secure: reject)',
      r.status === 403 || (a21b && a21b.ok === false) ? 403 : r.status, [403], r.text);
    await pg(`DELETE FROM enrollments WHERE student_id=20 AND class_id=3`);

    /* ── W-1 / W-2: IEP write on non-taught student ── */
    r = await req('PATCH', '/api/v1/students/20', { body: { iep_notes: 'PIN-W1' }, cookie: C.T1 });
    log('P2-W1', 'W-1 teacher REST IEP write on NON-taught student 20 (secure: deny)', r.status, [403, 404], r.text);
    r = await req('POST', '/api/sync', { cookie: C.T1, body: { ops: [{ uid: 'p2-w2-' + Date.now(), c: 'users', t: 'upd', id: 20, data: { iep_notes: 'PIN-W2' }, by: 4 }] } });
    const w2 = r.json && r.json.results && r.json.results[0];
    log('P2-W2', 'W-2 teacher sync IEP write on NON-taught student 20 (secure: deny)',
      r.status === 403 || (w2 && w2.ok === false) ? 403 : r.status, [403], r.text);
    await pg(`UPDATE users SET iep_notes=NULL WHERE id IN (6,20)`);

    /* ── R-5: attendance CREATE in PG mode (missing `late` column) ── */
    const uniqDate = '2026-02-01';
    r = await req('POST', '/api/v1/attendance', { body: { student_id: 6, class_id: 1, school_id: 1, status: 'present', date: uniqDate }, cookie: C.T1 });
    log('P2-R5', 'R-5 teacher CREATE attendance (own class; secure: 201 — PG schema lacks `late` column ⇒ 503)', r.status, [200, 201], r.text);
    await pg(`DELETE FROM attendance WHERE student_id=6 AND date=$1`, [uniqDate]);

    /* ── R-6: identity-sequence desync ⇒ PK collision ⇒ silent overwrite ── */
    const ts = Date.now();
    await pg(`INSERT INTO users (id, phone, national_id, role, school_id, full_name, active)
              VALUES (9001, '09121009001', '1000900001', 'student', 1, 'R6-VICTIM', true)
              ON CONFLICT (id) DO UPDATE SET full_name='R6-VICTIM', active=true, deleted_at=NULL`);
    /* simulate sequence lag: next nextval() must return the VICTIM's id (9001).
       3-arg setval(seq, 9000, true) ⇒ nextval ⇒ 9001. (Out-of-band explicit-id
       seeds leave the identity sequence behind exactly like this.) */
    await pg(`SELECT setval(pg_get_serial_sequence('users','id'), 9000, true)`);
    r = await req('POST', '/api/v1/students', { body: { full_name: 'R6-NEW-' + ts, national_id: '1000909901' }, cookie: C.M1 });
    const newId = r.json && r.json.data && r.json.data.id;
    log('P2-R6a', 'R-6 create student with lagged sequence (secure: 201, id must NOT be 9001)', r.status, [201], 'newId=' + newId + (Number(newId) === 9001 ? ' — COLLIDES with victim id' : ''));
    const victim = (await pg(`SELECT full_name FROM users WHERE id=9001`)).rows[0];
    log('P2-R6b', 'R-6 victim row (id 9001) intact after create (secure: still R6-VICTIM — defect: silently overwritten)',
      victim && victim.full_name === 'R6-VICTIM' ? 200 : 500, [200], 'victim=' + (victim && victim.full_name) + ' newId=' + newId);
    await pg(`DELETE FROM users WHERE id IN (9000, 9001, 9002) OR national_id IN ('1000909901','1000900001')`);
    await pg(`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT max(id) FROM users))`);

    /* ── controls (secure behavior — must stay green) ── */
    r = await req('GET', '/api/v1/reports/attendance?school_id=1', { cookie: C.M2 });
    log('P2-CTL1', 'control: cross-tenant school report denied', r.status, [403, 404], r.text);
    r = await req('GET', '/api/v1/students/8', { cookie: C.PA });
    log('P2-CTL2', 'control: parent→NON-child student denied', r.status, [403, 404], r.text);
    r = await req('GET', '/api/v1/students/6', { cookie: C.PA });
    log('P2-CTL3', 'control: parent→own child allowed', r.status, [200], r.text);
    r = await req('PATCH', '/api/v1/classes/1', { body: { name: 'x' }, cookie: C.T1 });
    log('P2-CTL4', 'control: teacher class write role-denied', r.status, [403], r.text);

    console.log('\nphase-2 gate: ' + (pass + fail) + ' cases, ' + pass + ' secure-green, ' + fail + ' RED (defects pinned)');
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error('GATE ERROR: ' + e.message);
    process.exit(2);
  }
})();
