#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/idor-runtime.js — LIVE PG GATE: runtime regression-pin for the
   2026-09-24 IDOR / object-ownership audit (arena agent).
   ───────────────────────────────────────────────────────────────────
   This is the production-topology gate (cf. tests/wave23-reports-pg.js).
   It boots the real server in-process against PostgreSQL + Redis and
   drives it over HTTP with demo-code logins against the audit fixture
   (payesh_db_idor topology). Every case asserts the SECURE behavior;
   while a defect is present the case FAILS (red pin). Do not weaken
   assertions to go green — green means the product is fixed.

   The /api/v1 REST boundary REQUIRES attached PostgreSQL authority to
   evaluate tenant_policy (memory mode returns 503 AUTHORITY_UNAVAILABLE
   for those routes), so this gate is PG-only by design. For CI-runnable,
   deterministic coverage of the shared policy root cause (no DB needed),
   see tests/idor-regression.js.

   Required env:
     DATABASE_URL   postgres://… (the audit DB; must be seeded with the
                    fixture topology below — see docs/idor-audit-…)
     REDIS_URL      redis://…    (OTP state)
     PAYESH_DEMO_CODE=1 is set by this file (dev echo of the code).
   NODE_ENV / PAYESH_ENV must NOT be production for demo_code to echo;
   this file clears them.

   Execution:
     DATABASE_URL=postgres://… REDIS_URL=redis://… node tests/idor-runtime.js

   Single-writer requirement: no other payesh instance may be attached to
   the same DATABASE_URL/REDIS_URL while this gate runs (the sync mirror
   is single-writer; a concurrent second instance makes sync ops fail
   closed with sync_mirror_failed). Stop other instances first.

   Exit codes: 0 = all secure (defects fixed) · 1 = pinned defect red
   · 2 = BLOCKED (infra unavailable, NOT VERIFIED — no fake green).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');

if (!process.env.DATABASE_URL) { console.error('BLOCKED: DATABASE_URL required (PG-only gate)'); process.exit(2); }
if (!process.env.REDIS_URL)   { console.error('BLOCKED: REDIS_URL required (OTP state)');   process.exit(2); }

/* ── env BEFORE requiring the server ─────────────────────────────── */
delete process.env.NODE_ENV;      // dev → demo_code echo (repo convention)
delete process.env.PAYESH_ENV;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-idor-rt-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });
process.env.PAYESH_KEY = path.join(TMP, 'jwt.key');
process.env.PAYESH_AUDIT = path.join(TMP, 'audit.log');
process.env.PAYESH_DEMO_CODE = '1';
process.env.PAYESH_JWT_SECRET = 'idor-rt-test-secret-0123456789abcdef0123456789';

const { server } = require(path.join(ROOT, 'server', 'index.js'));

let BASE = '';
let pass = 0, fail = 0;
const EVID = [];
function log(id, desc, status, expect, extra) {
  const ok = expect.indexOf(status) !== -1;
  const row = { id, desc, status, expect, ok, extra: extra ? String(extra).slice(0, 300) : undefined };
  EVID.push(row);
  console.log((ok ? '  \u2705 ' : '  \u274C ') + id + ' [' + status + ' expect ' + expect.join('/') + '] ' + desc +
    (ok ? '' : (extra ? ' — ' + String(extra).slice(0, 300) : '')));
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

/* fixture actors (must exist in the seeded DATABASE_URL) */
const ACTORS = {
  SA: { id: 1,  phone: '09121000001', nid: '1000000001' },
  M1: { id: 2,  phone: '09121000010', nid: '1000000010' },
  M2: { id: 3,  phone: '09121000011', nid: '1000000011' },
  T1: { id: 4,  phone: '09121000020', nid: '1000000020' },
  PA: { id: 17, phone: '09121000016', nid: '1000000201' },
  PC: { id: 19, phone: '09121000018', nid: '1000000203' },
};
async function loginAs(key) {
  const a = ACTORS[key];
  let r = await req('POST', '/api/auth/send-code', { body: { phone: a.phone } });
  if (r.status !== 200 || !r.json || !r.json.demo_code)
    throw new Error('send-code ' + a.phone + ' → ' + r.status + ' ' + r.text.slice(0, 120) + ' (demo_code missing)');
  r = await req('POST', '/api/auth/login', { body: { phone: a.phone, code: r.json.demo_code, national_id: a.nid } });
  if (r.status !== 200) throw new Error('login ' + a.phone + ' → ' + r.status + ' ' + r.text.slice(0, 160));
  const m = (r.headers.get('set-cookie') || '').match(/payesh_session=[^;]+/);
  if (!m) throw new Error('login ' + a.phone + ': no session cookie');
  return m[0];
}
async function waitReady(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE + '/api/health'); if (r.status === 200) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
async function pgQuery(sql, params) {
  const pg = require(path.join(ROOT, 'node_modules', 'pg'));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { const r = await client.query(sql, params); return r.rows; } finally { await client.end(); }
}
/* count existing forged/attack rows so a "must not be persisted" pin is
   relative to a clean baseline; the audit DB may already carry prior
   repro rows, so we snapshot before the op and require NO NEW row. */
async function linkCount(pid, sid) {
  const rows = await pgQuery('SELECT count(*)::int AS n FROM parent_links WHERE parent_id = $1 AND student_id = $2', [pid, sid]);
  return rows[0].n;
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  const ready = await waitReady(90000); // PG hydration of ~87 collections can take a while
  if (!ready) { console.error('BLOCKED: server not ready (health never 200 within 90s)'); process.exit(2); }

  let C = {};
  try {
    for (const k of ['SA', 'M1', 'M2', 'T1', 'PA', 'PC']) C[k] = await loginAs(k);
  } catch (e) {
    console.error('BLOCKED: demo-code login failed: ' + e.message);
    process.exit(2);
  }

  console.log('\n── write-path pins (expect DENY while defect present)');
  {
    const marker = 'REGRESSION-W1-' + Date.now(); // unique per run: same-value re-writes would be undetectable
    const before = await pgQuery('SELECT iep_notes FROM users WHERE id = 20').then(r => r[0] && r[0].iep_notes);
    const r = await req('PATCH', '/api/v1/students/20', { body: { iep_notes: marker }, cookie: C.T1 });
    log('W-1', 'T1 PATCH /api/v1/students/20 {iep_notes} (non-taught student)', r.status, [403, 404],
      'expected denial; body: ' + r.text.slice(0, 200));
    const after = await pgQuery('SELECT iep_notes FROM users WHERE id = 20').then(r => r[0] && r[0].iep_notes);
    log('W-1d', 'PG: user 20 iep_notes unchanged after W-1 attempt', String(after) === String(before) ? 200 : 403, [200],
      'db value before/after: ' + before + ' → ' + after);
  }
  {
    const before = await pgQuery('SELECT iep_notes FROM users WHERE id = 20').then(r => r[0] && r[0].iep_notes);
    const uid = 'rt-w2-' + Date.now();   // unique per run: fixed uid would be idempotency-ignored on re-run
    const r = await req('POST', '/api/sync', {
      body: { ops: [{ uid, c: 'users', t: 'upd', id: 20, data: { iep_notes: 'REGRESSION-W2' }, by: 4, user_id: 4, school_id: 1 }] },
      cookie: C.T1,
    });
    const code = r.json && r.json.results && r.json.results[0] && r.json.results[0].code;
    const denied = r.status === 403 || (code && /out_of_scope|denied|forbidden/i.test(code));
    log('W-2', 'T1 sync users/20 iep_notes (non-taught student)', denied ? 403 : r.status, [403],
      'op code: ' + (code || (r.json && r.json.code) || 'ok'));
    const after = await pgQuery('SELECT iep_notes FROM users WHERE id = 20').then(r => r[0] && r[0].iep_notes);
    log('W-2d', 'PG: user 20 iep_notes unchanged after W-2 attempt', String(after) === String(before) ? 200 : 403, [200],
      'db value before/after: ' + before + ' → ' + after);
  }
  {
    /* Target (19→7): 7 is PA's own child (so the defective inScope passes on
       "own child") but parent_id 19 ≠ PA(17) — the Round-89 self-ownership
       guard must reject it. (19→6) is avoided: an earlier manual exploit
       already persisted it, which would make the "new link" check ambiguous.
       Normalize the baseline so the gate is re-runnable. */
    const VICTIM = 7, FORGER = 19;
    await pgQuery('DELETE FROM parent_links WHERE parent_id = $1 AND student_id = $2', [FORGER, VICTIM]);
    const before = await linkCount(FORGER, VICTIM);
    const uid = 'rt-w3-' + Date.now();   // unique per run
    const r = await req('POST', '/api/sync', {
      body: { ops: [{ uid, c: 'parent_links', t: 'ins', data: { parent_id: FORGER, student_id: VICTIM, relation: 'father' }, by: 17, user_id: 17, school_id: 1 }] },
      cookie: C.PA,
    });
    const code = r.json && r.json.results && r.json.results[0] && r.json.results[0].code;
    const denied = r.status === 403 || (code && /out_of_scope|denied|forbidden/i.test(code));
    log('W-3', 'PA sync parent_links ins {parent_id:19, student_id:7} (forged-to user)', denied ? 403 : r.status, [403],
      'op code: ' + (code || (r.json && r.json.code) || 'ok'));
    const after = await linkCount(FORGER, VICTIM);
    log('W-3d', 'PG: no NEW parent_link (19→7) persisted', after === before ? 200 : 403, [200],
      'link count before/after: ' + before + ' → ' + after);
  }
  {
    const r = await req('GET', '/api/v1/bootstrap', { cookie: C.PA });
    if (r.status !== 200) log('W-4', 'PA GET /api/v1/bootstrap (auth must work)', r.status, [200], r.text.slice(0, 150));
    else {
      const hasToken = !!(r.json && r.json.user && (typeof r.json.user.token === 'string' && r.json.user.token.length > 20));
      log('W-4', 'PA GET /api/v1/bootstrap — body must not contain session JWT', hasToken ? 403 : 200, [200],
        hasToken ? 'user.token present in GET body (exposed to logs/cache)' : '');
    }
  }

  console.log('\n── read-path pins (R-1)');
  {
    const r = await req('GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=20', { cookie: C.T1 });
    log('R-1a', 'T1 student-timeline of NON-taught student 20 (same school)', r.status, [403, 404],
      'expected denial; body: ' + r.text.slice(0, 200));
  }
  {
    const r = await req('GET', '/api/v1/analytics/parent-360?school_id=1&student_id=20', { cookie: C.T1 });
    log('R-1b', 'T1 parent-360 of NON-taught student 20 (same school)', r.status, [403, 404],
      'expected denial; body: ' + r.text.slice(0, 200));
  }

  console.log('\n── functional pins (S-1/S-2) — PG mode');
  {
    const r1 = await req('GET', '/api/students/6', { cookie: C.PA });
    log('S-1', 'PA legacy GET /api/students/6 (own child) must work in PG mode', r1.status, [200],
      'body: ' + r1.text.slice(0, 200));
  }
  {
    const r2 = await req('PATCH', '/api/v1/students/6', { body: { full_name: 'regression-s2' }, cookie: C.PA });
    log('S-2', 'PA PATCH /api/v1/students/6 (own child, role-denied) must be 403 not 404', r2.status, [403],
      'body: ' + r2.text.slice(0, 200));
  }

  console.log('\n── behavior controls (must stay GREEN)');
  {
    const r = await req('PATCH', '/api/v1/attendance/5', { body: { status: 'present' }, cookie: C.T1 });
    log('CTRL-1', 'T1 PATCH attendance/5 (own homeroom student 6) stays allowed', r.status, [200], r.text.slice(0, 160));
  }
  {
    const r = await req('PATCH', '/api/v1/attendance/51', { body: { status: 'present' }, cookie: C.T1 });
    log('CTRL-2', 'T1 PATCH attendance/51 (non-taught student 20) stays denied', r.status, [403, 404], r.text.slice(0, 160));
  }
  {
    const r = await req('GET', '/api/v1/students/6', { cookie: C.PA });
    log('CTRL-3', 'PA GET /api/v1/students/6 (own child) stays readable', r.status, [200], r.text.slice(0, 160));
  }
  {
    const r = await req('GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', { cookie: C.T1 });
    log('CTRL-4', 'T1 student-timeline of own homeroom student 6 stays readable', r.status, [200], r.text.slice(0, 160));
  }
  {
    const r = await req('GET', '/api/v1/analytics/student-timeline?school_id=1&student_id=6', { cookie: C.M2 });
    log('CTRL-5', 'M2 (school 2) timeline of school-1 student stays tenant-denied', r.status, [403, 404], r.text.slice(0, 160));
  }

  console.log('\nidor-runtime (PG): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) {
    console.log('PINNED DEFECTS STILL PRESENT (expected red until product fix):');
    EVID.filter(r => !r.ok).forEach(r => console.log('  - ' + r.id + ' [' + r.status + '] ' + r.desc + (r.extra ? ' — ' + r.extra : '')));
    process.exit(1);
  }
  console.log('ALL SECURE — the audit defects are fixed at runtime (PG gate green).');
  process.exit(0);
}

main().catch(e => {
  console.error('BLOCKED/ERROR: ' + (e && e.stack || e));
  process.exit(2);
});
