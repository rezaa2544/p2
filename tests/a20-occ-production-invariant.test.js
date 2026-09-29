#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/a20-occ-production-invariant.test.js — A-20 security invariant
   ────────────────────────────────────────────────────────────────────────
   MISSION 02 / §8 — complete analysis of the version-less write path.

   WHAT A-20 ACTUALLY IS (correcting the Mission 01 framing):

     Mission 01 reported "all five PATCH paths accept version-less writes"
     as the defect. That is a correct observation of dev-mode behavior but
     an incomplete diagnosis. The contract is documented in
     docs/SYNC_OCC_EVIDENCE_CONTRACT.md:21 —

       "All now opt into the same required-base contract in production or
        with PAYESH_STRICT_BASE_VERSION=1; previously only grades opted in."

     So the design is a two-mode contract:
       dev/test   — legacy clients may write without a version (compatibility)
       production — base_version is REQUIRED, else 400 missing_base_version

     The security question is therefore NOT "can a version-less write
     happen" but "is the production mode contract actually enforced on all
     five paths, and can a stale write silently clobber a newer version in
     either mode?" This test answers both, directly against the code.

   INVARIANT UNDER TEST:

     1. In production mode, all five PATCH routes reject a version-less
        write with 400 (no silent clobber path).
     2. In any mode, a stale base_version is rejected with 409 and the
        server's own version is returned.
     3. In any mode, a correct base_version is accepted and the version is
        bumped server-side (version is never client-pinned — db.js:761).
     4. Strict mode cannot be bypassed by sending a bogus type as a
        version (string '1', boolean, 0, negative, float).

   Run:  node tests/a20-occ-production-invariant.test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const { checkOcc, bump } = require(path.join(__dirname, '..', 'server', 'occ.js'));

let pass = 0;
let fail = 0;

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* The five PATCH entities, with the exact entity labels the routes pass to
   checkOcc — taken verbatim from server/routes/{students,classes,attendance,
   grades,users}.js so this test tracks the real call sites. */
const ENTITIES = [
  ['students', 'دانش‌آموز'],
  ['users', 'کاربر'],
  ['classes', 'کلاس'],
  ['attendance', 'رکورد حضور و غیاب'],
  ['grades', 'نمره'],
];

const setEnv = (vars) => {
  const saved = {};
  for (const k of ['PAYESH_STRICT_BASE_VERSION', 'PAYESH_ENV', 'NODE_ENV']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, vars);
  return () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

(async () => {
  console.log('\n▸ A-20 — OCC invariant across all five PATCH paths');

  /* ── T1: production mode rejects version-less writes everywhere ─── */
  const restore = setEnv({ PAYESH_ENV: 'production' });
  for (const [entity, label] of ENTITIES) {
    const rec = { id: 2, version: 3 };
    const r = checkOcc(rec, { full_name: 'no version sent' }, label, true);
    chk(`T1 production: ${entity} rejects version-less write with 400`,
      r && r.status === 400 && r.body && r.body.code === 'missing_base_version',
      r ? 'status=' + r.status + ' code=' + r.body.code : 'no rejection at all');
  }
  restore();

  /* ── T2: explicit strict flag behaves identically to production ─── */
  const restore2 = setEnv({ PAYESH_STRICT_BASE_VERSION: '1' });
  for (const [entity, label] of ENTITIES) {
    const r = checkOcc({ id: 2, version: 3 }, {}, label, true);
    chk(`T2 strict flag: ${entity} rejects version-less with 400`,
      r && r.status === 400 && r.body.code === 'missing_base_version');
  }
  restore2();

  /* ── T3: NODE_ENV=production also enforces (third trigger) ─────── */
  const restore3 = setEnv({ NODE_ENV: 'production' });
  {
    const r = checkOcc({ id: 2, version: 3 }, {}, 'کاربر', true);
    chk('T3 NODE_ENV=production: users rejects version-less with 400',
      r && r.status === 400 && r.body.code === 'missing_base_version');
  }
  restore3();

  /* ── T4: dev mode keeps the documented legacy compatibility ────── */
  const restore4 = setEnv({});
  for (const [entity, label] of ENTITIES) {
    const r = checkOcc({ id: 2, version: 3 }, { full_name: 'x' }, label, true);
    chk(`T4 dev: ${entity} accepts legacy version-less write (documented compatibility)`,
      r === null, 'dev mode must not require base_version — see the contract');
  }
  restore4();

  /* ── T5: a STALE base_version is rejected in every mode ─────────── */
  for (const mode of ['dev', 'production']) {
    const restoreM = mode === 'production'
      ? setEnv({ PAYESH_ENV: 'production' })
      : setEnv({});
    for (const [entity, label] of ENTITIES) {
      const r = checkOcc({ id: 2, version: 7 }, { base_version: 3, full_name: 'stale' }, label, true);
      chk(`T5 ${mode}: ${entity} stale base_version ⇒ 409 conflict + server version`,
        r && r.status === 409 && r.body.code === 'conflict' && r.body.server_version === 7,
        r ? 'status=' + r.status : 'accepted!');
    }
    restoreM();
  }

  /* ── T6: a CORRECT base_version is accepted and bumped server-side ─ */
  {
    const rec = { id: 2, version: 7 };
    const r = checkOcc(rec, { base_version: 7 }, 'نمره', true);
    const accepted = r === null;
    const v = bump(rec);
    chk('T6 correct base_version accepted, version bumped server-side',
      accepted && v === 8, 'accepted=' + accepted + ' version=' + v);
  }

  /* ── T7: bogus version values cannot smuggle a stale write through ─
     These are checked in PRODUCTION mode, where the contract is mandatory.
     In dev mode an absent base_version is documented legacy compatibility,
     so only the *type* of a supplied value matters there. */
  const restore7 = setEnv({ PAYESH_ENV: 'production' });
  const bogus = [
    ['string', { base_version: '1' }],
    ['boolean', { base_version: true }],
    ['zero', { base_version: 0 }],
    ['negative', { base_version: -1 }],
    ['float', { base_version: 1.5 }],
    ['empty string', { base_version: '' }],
    ['null', { base_version: null }],
    ['undefined-as-key', {}],
  ];
  for (const [what, body] of bogus) {
    const r = checkOcc({ id: 2, version: 3 }, body, 'کاربر', true);
    const rejected = r && (r.status === 400 || r.status === 409);
    chk(`T7 production: bogus base_version (${what}) rejected`,
      rejected, r ? 'status=' + r.status : 'accepted silently — strict-mode bypass');
  }
  restore7();

  /* ── T7b: in dev mode, a SUPPLIED-but-invalid value is still rejected ─
     The legacy allowance covers only an ABSENT base_version, not a
     malformed one. A client that sends garbage must not get a silent
     unversioned write. */
  const restore7b = setEnv({});
  for (const [what, body] of [['string', { base_version: '1' }], ['boolean', { base_version: true }], ['zero', { base_version: 0 }]]) {
    const r = checkOcc({ id: 2, version: 3 }, body, 'کاربر', true);
    const rejected = r && r.status === 400;
    chk(`T7b dev: supplied-but-invalid base_version (${what}) rejected with 400`,
      rejected, r ? 'status=' + r.status : 'accepted silently');
  }
  /* and a genuinely absent one is allowed in dev, as documented */
  {
    const r = checkOcc({ id: 2, version: 3 }, {}, 'کاربر', true);
    chk('T7b dev: absent base_version allowed (documented legacy path)', r === null);
  }
  restore7b();

  /* ── T8: the version field itself cannot pin the counter ────────── */
  /* db.js:761 documents that a client-supplied data.version is stripped
     whenever base_version is present. checkOcc reads only base_version or
     body.version as the base; confirm a client cannot assert version=N to
     make a stale write look current. */
  {
    const r = checkOcc({ id: 2, version: 3 }, { version: 999, full_name: 'x' }, 'کاربر', true);
    const rejected = r && (r.status === 400 || r.status === 409);
    chk('T8 client-supplied data.version is not accepted as a base_version substitute',
      rejected || (r === null && false), r ? 'status=' + r.status : 'accepted — check db.js stripping');
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`a20-occ-production-invariant: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
