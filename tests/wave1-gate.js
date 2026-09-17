#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave1-gate.js — دروازهٔ جامع راستی‌آزمایی موج ۱ (Wave 1 Gate)
   ───────────────────────────────────────────────────────────────────
   Verifies Wave 1 PostgreSQL Source of Truth and P0-1 requirements:
     1. Static checks: migrations, critical server files parse cleanly
     2. Multi-instance proof: tests/wave1-multi-instance.js (47 checks)
     3. Wave 1 read/write behavioral suites
     4. Fail-closed production security invariants
     5. Regression & mutation suites

   Run: node tests/wave1-gate.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUITE_TIMEOUT_MS = 300000;

const STATIC_FILES = [
  'migrations/001_initial.sql',
  'migrations/004_wave1_version_seq.sql',
  'migrations/004_wave1_version_seq.down.sql',
  'server/auth.js',
  'server/idor.js',
  'server/index.js',
  'server/policy.js',
  'tests/wave1-multi-instance.js'
];

const PARSE_FILES = [
  'server/db.js', 'server/index.js', 'server/sync.js', 'server/auth.js',
  'server/idor.js', 'server/policy.js',
  'server/routes/grades.js', 'server/routes/attendance.js', 'server/routes/classes.js',
  'server/routes/users.js', 'server/routes/students.js',
  'server/delete-service.js', 'server/conflicts.js',
  'server/outbox.js', 'server/admin.js', 'server/ids.js',
  'tools/reseed-from-pg.js', 'tests/wave1-multi-instance.js',
  'tests/wave1-reads.js', 'tests/wave1-writes.js', 'tests/wave1-writes-mutations.js',
  'tools/wave1-gate.js', 'tests/wave1-gate.js'
];

const SUITES = [
  'tests/wave1-multi-instance.js',   /* T1-T10 multi-instance PG authority proof */
  'tests/wave1-regression-gate.js',  /* regression gate: no production memory authority */
  'tests/wave1-reads.js',            /* unified read seam */
  'tests/wave1-writes.js',           /* transactional writes */
  'tests/wave1-writes-mutations.js', /* mutation tests for writes */
  'tests/sync-atomic-batch.js',      /* atomic batch sync */
  'tests/sync-queue-caps.js',        /* sync queue caps & idempotency */
  'tests/tombstone.js',              /* tombstone deletion */
  'tests/occ.js',                    /* optimistic concurrency control */
  'tests/server7.js',                /* delete account & GDPR */
  'tests/session-revocation.js',     /* session revocation */
  'tests/security2.js',              /* security visibility rules */
  'tests/audit.js',                  /* audit trail */
  'tests/server15.js',               /* sync/authz mutations */
  'tests/server18.js',               /* sync/authz mutations */
  'tests/check-authz.js',            /* endpoint authorization */
  'tests/api/runner.js',             /* REST routes */
  'tests/smoke.js'                   /* full end-to-end smoke */
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
  console.log('\n▸ Wave 1 Gate — Static Invariants');
  try {
    require('pg-mem');
    ok('pg-mem available (multi-instance stand-in)');
  } catch (e) { bad('pg-mem available', e.message); }

  for (const f of STATIC_FILES) {
    if (fs.existsSync(path.join(ROOT, f))) ok('exists: ' + f);
    else bad('exists: ' + f);
  }

  for (const f of PARSE_FILES) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) ok('parse: ' + f);
    else bad('parse: ' + f, String(r.stderr || '').split('\n')[0]);
  }

  console.log('\n▸ Wave 1 Gate — Behavioral & Regression Suites');
  for (const s of SUITES) runSuite(s);

  console.log(`\n  جمعِ گیت: ${pass} موفق، ${fail} ناموفق`);
  if (fail) {
    console.log('  مواردِ ناموفق:\n   - ' + failures.join('\n   - '));
    console.log('\n  ⛔ GATE RED — Wave 1 P0 verification incomplete.');
    process.exit(1);
  }
  console.log('\n  🟢 GATE GREEN — Wave 1 P0 completely verified.');
  process.exit(0);
})();
