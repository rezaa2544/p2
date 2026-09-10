#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tools/wave1-gate.js — دروازهٔ موج ۱ (P0: PG transaction-first writes)
   ───────────────────────────────────────────────────────────────────
   Verifies the Wave 1 P0 order:
     1. Static: migration 004 present, touched server files parse.
     2. P0 proof: tests/wave1-multi-instance.js (two instances, one PG).
     3. No-regression: every memory-mode suite covering a touched path
        (sync mirror, delete/OCC services, GDPR delete-account, authz,
        REST routes over HTTP, full smoke).

   Exit 0 = gate green; exit 1 = list of failures. Any failure blocks
   `wave1_status=completed` in ruflo.

   اجرا: node tools/wave1-gate.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE_TIMEOUT_MS = 300000;

const STATIC_FILES = [
  'migrations/004_wave1_version_seq.sql',
  'migrations/004_wave1_version_seq.down.sql',
  'tests/wave1-multi-instance.js'
];
const PARSE_FILES = [
  'server/db.js', 'server/index.js', 'server/sync.js',
  'server/routes/grades.js', 'server/routes/attendance.js', 'server/routes/classes.js',
  'server/routes/users.js', 'server/routes/students.js',
  'server/delete-service.js', 'server/conflicts.js', 'server/auth.js',
  'server/outbox.js', 'server/admin.js', 'server/ids.js',
  'tools/reseed-from-pg.js', 'tests/wave1-multi-instance.js', 'tools/wave1-gate.js'
];
/* Behavioral suites: the P0 proof first, then every touched-path suite. */
const SUITES = [
  'tests/wave1-multi-instance.js', /* P0 proof: two instances, one PG */
  'tests/sync-atomic-batch.js',    /* B1–B8 mirror contract (B8 legacy branch) */
  'tests/sync-queue-caps.js',      /* uid/idempotency paths (uid marking moved) */
  'tests/tombstone.js',            /* delete-service contract */
  'tests/occ.js',                  /* OCC service contract */
  'tests/server7.js',              /* delete-account incl. disk assertions */
  'tests/session-revocation.js',   /* session death after delete-account */
  'tests/security2.js',            /* delete-account visibility rules */
  'tests/audit.js',                /* account_deleted audit trail */
  'tests/server15.js',             /* sync/authz mutations over HTTP */
  'tests/server18.js',             /* sync/authz mutations over HTTP */
  'tests/check-authz.js',          /* endpoint authz incl. admin */
  'tests/api/runner.js',           /* REST routes (C3) over real HTTP */
  'tests/smoke.js'                 /* full end-to-end */
];

let pass = 0, fail = 0;
const failures = [];
function ok(name) { pass++; console.log('  ✅ ' + name); }
function bad(name, extra) {
  fail++;
  failures.push(name + (extra ? ' — ' + extra : ''));
  console.log('  ❌ ' + name + (extra ? ' — ' + extra : ''));
}

function runSuite(rel) {
  const args = rel.endsWith('smoke.js')
    ? ['--expose-gc', '--max-old-space-size=2048', rel]
    : [rel];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT, encoding: 'utf8', timeout: SUITE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024
  });
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const out = String(r.stdout || '') + String(r.stderr || '');
  if (r.status === 0) { ok(`${rel} (${ms}s)`); return true; }
  const errLines = out.split('\n').filter(l => /❌|FATAL|Error/.test(l)).slice(0, 3).join(' | ').slice(0, 220);
  bad(`${rel} (exit ${r.status}, ${ms}s)`, errLines || 'no error lines captured');
  return false;
}

(async () => {
  console.log('\n▸ Wave 1 gate — static');
  try {
    require('pg-mem');
    ok('pg-mem available (multi-instance stand-in)');
  } catch (e) { bad('pg-mem available (multi-instance stand-in)', e.message); }
  for (const f of STATIC_FILES) {
    if (fs.existsSync(path.join(ROOT, f))) ok('exists: ' + f);
    else bad('exists: ' + f);
  }
  for (const f of PARSE_FILES) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) ok('parse: ' + f);
    else bad('parse: ' + f, String(r.stderr || '').split('\n')[0]);
  }

  console.log('\n▸ Wave 1 gate — behavioral suites');
  for (const s of SUITES) runSuite(s);

  console.log(`\n  جمعِ گیت: ${pass} موفق، ${fail} ناموفق`);
  if (fail) {
    console.log('  مواردِ ناموفق:\n   - ' + failures.join('\n   - '));
    console.log('\n  ⛔ GATE RED — wave1_status must stay non-completed in ruflo.');
    process.exit(1);
  }
  console.log('\n  🟢 GATE GREEN — Wave 1 P0 verified.');
  process.exit(0);
})();
