#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   idor-regression — REGRESSION-PIN (repro) tests for the 2026-09-24
   IDOR / object-ownership audit (arena agent). RUNS RED BY DESIGN:
   every pinned case asserts the SECURE behavior; while the defect is
   present the assertion FAILS. Do not "fix" by weakening an
   assertion — the test file must turn green only when the product is
   fixed (Bug packages in docs/idor-audit-2026-09-24.md).
   ───────────────────────────────────────────────────────────────────
   Pinned defects (runtime evidence: /home/user/idor-evidence*.jsonl):
     W-1/W-2  teacher IEP write on a student of a class the teacher
              does NOT teach — users records fall through to a
              school-only match in inScope (no student_id → no class
              check). REST (students.js) and sync (sync.js) share the
              root cause. PG-persisted writes reproduced.
     W-3      parent forges parent_links.parent_id (any user, incl.
              other-tenant users and managers) on insert: for `ins`
              ops policy.js sets rec = data, so the Round-89
              self-ownership guard (`!rec && parent_id !== u.id`) is
              dead code for inserts. Cross-tenant read amplification
              demonstrated (school-2 parent read school-1 student PII).
     W-4      projectUserByRole full-clone branch (self / manager /
              edu_office) copies req.user verbatim except `password` —
              the live session JWT reaches the GET /api/v1/bootstrap
              response body and the 5-minute Redis bootstrap cache.
     S-2      parent REST write on own child (users record) cannot be
              evaluated in PG mode: inScope parent branch falls back
              to rec.parent_id which does not exist on PG user rows →
              deny surfaces as 404 not_found instead of 403 (unit
              pin here asserts the deterministic deny; the 403/404
              mapping is pinned in tests/idor-runtime.js).
   Execution: node tests/idor-regression.js   (exit 0 = product fixed)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const policy = require('../server/policy');
const { projectUserByRole } = require('../server/middleware/projection');

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2705 ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 220) : '')); console.log('  \u274C ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 220) : '')); }
}

/* ── synthetic store mirroring the payesh_db_idor fixture topology ──
   S1: T1=4 (homeroom class 1, schedule class 2), ST6=6 (class 1),
   ST8=8 (class 2), ST20=20 (class 5), PA=17 (parent → {6,7}),
   M2=3 (manager S2). S2: PC=19 (parent → {11}). */
const store = {
  users: [
    { id: 4,  role: 'teacher', school_id: 1 },
    { id: 6,  role: 'student', school_id: 1 },
    { id: 8,  role: 'student', school_id: 1 },
    { id: 20, role: 'student', school_id: 1 },
    { id: 7,  role: 'student', school_id: 1 },
    { id: 11, role: 'student', school_id: 2 },
    { id: 17, role: 'parent',  school_id: 1 },
    { id: 19, role: 'parent',  school_id: 2 },
    { id: 3,  role: 'manager', school_id: 2 },
  ],
  classes: [
    { id: 1, school_id: 1, homeroom_teacher_id: 4 },
    { id: 2, school_id: 1, homeroom_teacher_id: null },
    { id: 5, school_id: 1, homeroom_teacher_id: null },
  ],
  schedule: [{ teacher_id: 4, class_id: 2 }],
  enrollments: [
    { student_id: 6, class_id: 1 },
    { student_id: 8, class_id: 2 },
    { student_id: 20, class_id: 5 },
  ],
  parent_links: [
    { parent_id: 17, student_id: 6 },
    { parent_id: 17, student_id: 7 },
    { parent_id: 19, student_id: 11 },
  ],
};
const T1 = { id: 4, role: 'teacher', school_id: 1 };
const PA = { id: 17, role: 'parent', school_id: 1 };
const ST20 = { id: 20, role: 'student', school_id: 1 };
const ST6  = { id: 6,  role: 'student', school_id: 1 };

console.log('── W-1/W-2: teacher IEP write on users record (cross-class)');
{
  // sync path: inScope(session, store, coll, recId, data)
  const r = policy.inScope(T1, store, 'users', 20,
    Object.assign({}, ST20, { iep_notes: 'regression-w2' }));
  chk('W-2 sync inScope denies teacher IEP on non-taught student (class 5)', r === false,
    'inScope returned ' + r + ' — teacher 4 (classes 1,2) may write IEP on student 20 (class 5)');
  // REST path: restWriteGate(store, session, coll, t, rec, bodyKeys)
  const g = policy.restWriteGate(store, T1, 'users', 'upd',
    Object.assign({}, ST20), ['iep_notes']);
  chk('W-1 REST restWriteGate denies teacher IEP on non-taught student', g.ok === false,
    'gate returned ' + JSON.stringify(g));
  // control: own-homeroom student still allowed (school match passes today;
  // keep as behavior anchor — must stay true after a fix too).
  const g2 = policy.restWriteGate(store, T1, 'users', 'upd',
    Object.assign({}, ST6), ['iep_notes']);
  chk('control: teacher IEP on own-homeroom student stays allowed', g2.ok === true,
    'gate returned ' + JSON.stringify(g2));
}

console.log('── W-3: parent forges parent_links.parent_id on insert');
{
  const r = policy.inScope(PA, store, 'parent_links', null, { parent_id: 19, student_id: 6 });
  chk('W-3a inScope denies parent inserting link with parent_id=19 (not self)', r === false,
    'inScope returned ' + r + ' — parent 17 may link user 19 (other school!) as parent of student 6');
  const r2 = policy.inScope(PA, store, 'parent_links', null, { parent_id: 3, student_id: 6 });
  chk('W-3b inScope denies parent inserting link with parent_id=3 (manager, S2)', r2 === false,
    'inScope returned ' + r2 + ' — parent 17 may link manager 3 as parent of student 6 (role-elevation forge)');
  const r3 = policy.inScope(PA, store, 'parent_links', null, { parent_id: 17, student_id: 6 });
  chk('control: parent inserting own link to own child stays allowed', r3 === true,
    'inScope returned ' + r3);
  const r4 = policy.inScope(PA, store, 'parent_links', null, { parent_id: 17, student_id: 8 });
  chk('control: parent own-link to NON-child student stays denied', r4 === false,
    'inScope returned ' + r4);
}

console.log('── W-4: session JWT must never leave the user projection');
{
  const rec = { id: 17, role: 'parent', full_name: 'P', national_id: '1000000201',
    phone: '09121000016', token: 'JWT-SECRET-SESSION-TOKEN' };
  const self = projectUserByRole(rec, 'parent', true);
  chk('W-4a self-bootstrap projection strips session token', self && !('token' in self),
    'projection contains token: ' + (self && self.token));
  const mgr = projectUserByRole(rec, 'manager', false);
  chk('W-4b manager-view projection strips session token', mgr && !('token' in mgr),
    'projection contains token: ' + (mgr && mgr.token));
  const eo = projectUserByRole(rec, 'edu_office', false);
  chk('W-4c edu_office-view projection strips session token', eo && !('token' in eo),
    'projection contains token: ' + (eo && eo.token));
}

console.log('── S-2: parent write-scope on a users record is a deterministic deny');
{
  // Parent has no users.upd right at all (model) → inScope must return a
  // stable false (the route must then answer 403, not 404 — see runtime pin).
  const r = policy.inScope(PA, store, 'users', 6, Object.assign({}, ST6));
  chk('S-2 inScope(parent, users upd, own child row) is deterministically false', r === false,
    'inScope returned ' + r);
  const g = policy.restWriteGate(store, PA, 'users', 'upd', Object.assign({}, ST6), ['full_name']);
  chk('S-2 REST restWriteGate denies parent write on child users row', g.ok === false,
    'gate returned ' + JSON.stringify(g));
}

/* ── S-1: parent scope resolution must not depend on the absent
   users.parent_id column (PG schema drift). In production the error is
   rethrown → legacy /api/students/:id 404s for parents. Simulate a PG
   authority whose users table has no parent_id (like the real schema)
   and require the parent path to resolve without throwing. ─────────── */
async function s1Pin() {
  console.log('── S-1: parent scope resolution on PG without users.parent_id');
  // A PG-like db: parent_links works; the legacy users.parent_id query throws
  // exactly as the real schema does (column absent).
  const pgDb = {
    isPostgres: () => true,
    query: async (sql, params) => {
      if (/FROM\s+parent_links/i.test(sql)) return { rows: [{ student_id: 6 }, { student_id: 7 }] };
      if (/FROM\s+users/i.test(sql) && /parent_id/.test(sql))
        throw new Error('column "parent_id" does not exist'); // mirrors real PG schema
      return { rows: [] };
    },
  };
  const savedNode = process.env.NODE_ENV;
  const savedPay = process.env.PAYESH_ENV;
  process.env.NODE_ENV = 'production';      // prod rethrows the scope error (S-1 trigger)
  process.env.PAYESH_ENV = 'production';
  let threw = null, opts = null;
  try {
    opts = await policy.resolveStudentScopeOpts(pgDb, store,
      { id: 17, role: 'parent', school_id: 1 }, { id: 6, role: 'student', school_id: 1 });
  } catch (e) { threw = e; }
  process.env.NODE_ENV = savedNode;
  process.env.PAYESH_ENV = savedPay;
  chk('S-1u resolveStudentScopeOpts(parent) resolves on PG without users.parent_id',
    threw === null && opts && opts.parentChildIds && opts.parentChildIds.has(6),
    threw ? ('threw: ' + threw.message) : ('parentChildIds=' + (opts && opts.parentChildIds && opts.parentChildIds.size)));
}

s1Pin().then(() => {
  console.log('');
  console.log('idor-regression: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) {
    console.log('PINNED DEFECTS STILL PRESENT (expected red until product fix):');
    errors.forEach(e => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ALL SECURE — the audit defects are fixed.');
});
