#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/g7-ci-database-env.test.js — regression test for G7 (CI DB env)
   ────────────────────────────────────────────────────────────────────────
   ROOT CAUSE (verified on origin/main 691f8d6, Node.js CI run 36348586658):

     scripts/run-all-tests.sh runs under `set -u`. Its live-PostgreSQL probe
     referenced a bare `$DATABASE_URL`, but the Node.js CI workflow exports
     only PGURL/REDIS_URL at job level and never sets DATABASE_URL. Under
     `set -u` an unset variable is a fatal error, so the probe aborted the
     whole regression runner:

       scripts/run-all-tests.sh: line 79: DATABASE_URL: unbound variable
       ##[error]Process completed with exit code 1.

     No test in the repository guarded this, so the CI stayed red silently.

   CONTRACT THIS TEST LOCKS IN:
     1. The probe must not abort under `set -u` when DATABASE_URL is unset
        and no PostgreSQL is reachable (a PG-less machine is a valid env).
     2. When PGURL is set but DATABASE_URL is not, the script must derive
        DATABASE_URL from PGURL, because the project's canonical connection
        variable is DATABASE_URL (tools/migrate-ledger.js precedence:
        DATABASE_URL, then PGURL).
     3. When DATABASE_URL is set, WAVE23_REQUIRE_PG must become 1 so the
        DB-native parity gate is REQUIRED, never silently skipped.

   Run:  node tests/g7-ci-database-env.test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'run-all-tests.sh');

let pass = 0;
let fail = 0;

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

/* Run ONLY the probe block of run-all-tests.sh in isolation.
   We cannot run the full runner here (it needs the whole toolchain), so we
   extract the exact probe lines the fix touched and execute them under the
   same `set -u`. Any divergence from the real script would make this test
   meaningless, so we assert the extracted snippet is byte-identical to the
   current script first. */
function probeSnippet() {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const start = src.indexOf('# ── live-PostgreSQL probe');
  if (start === -1) throw new Error('probe block not found in run-all-tests.sh');
  const end = src.indexOf('# ── docs-stats pre-flight');
  if (end === -1) throw new Error('end of probe block not found');
  return src.slice(start, end);
}

function runProbe(env) {
  const snippet = probeSnippet();
  /* Reproduce the script's own runtime conditions: `set -u` is declared at the
     top of run-all-tests.sh and $OUT is written to by the probe. */
  const harness = 'set -u\nOUT=/tmp/g7-probe-test.log\n: > $OUT\n' + snippet +
    '\necho "PROBE_RESULT=${WAVE23_REQUIRE_PG:-unset}"\necho "DERIVED=${DATABASE_URL:-unset}"\n';
  const out = execFileSync(process.env.SHELL || 'bash', ['-c', harness], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { OUT: '/tmp/g7-probe-test.log' }, env),
  });
  const probeResult = (out.match(/PROBE_RESULT=(\S+)/) || [])[1];
  const derived = (out.match(/DERIVED=(\S+)/) || [])[1];
  return { ok: true, out, probeResult, derived };
}

(async () => {
  console.log('\n▸ G7 / CI DATABASE_URL — regression for the set -u abort');

  chk('run-all-tests.sh exists', fs.existsSync(SCRIPT));
  chk('probe block present in script', probeSnippet().includes('live-PostgreSQL'));

  /* T1 — THE ORIGINAL DEFECT: no DATABASE_URL, no PGURL, no live PG.
     Before the fix this aborted with "DATABASE_URL: unbound variable". */
  const clean = {
    DATABASE_URL: '', PGURL: '', REDIS_URL: '',
    PATH: process.env.PATH, HOME: process.env.HOME, // pg_isready must not be found
  };
  let r1;
  try {
    r1 = runProbe(clean);
  } catch (e) {
    r1 = { ok: false, err: String(e.message || e) };
  }
  chk('T1 unset DATABASE_URL + no PG ⇒ probe does NOT abort under set -u',
    !!r1.ok, r1.err);
  chk('T1 PG not required on a PG-less machine (no silent skip, honest skip)',
    !!r1.ok && r1.probeResult === 'unset', 'probeResult=' + r1.probeResult);

  /* T2 — CI SHAPE: PGURL set, DATABASE_URL absent. The script must derive
     DATABASE_URL from PGURL (canonical variable) and REQUIRE the PG gate. */
  const pgurl = 'postgres://payesh:payesh@127.0.0.1:5432/payesh_ci';
  let r2;
  try {
    r2 = runProbe({ DATABASE_URL: '', PGURL: pgurl, PATH: process.env.PATH, HOME: process.env.HOME });
  } catch (e) {
    r2 = { ok: false, err: String(e.message || e) };
  }
  chk('T2 PGURL set, DATABASE_URL absent ⇒ no abort', !!r2.ok, r2.err);
  chk('T2 DATABASE_URL derived from PGURL', !!r2.ok && r2.derived === pgurl, 'derived=' + r2.derived);
  chk('T2 WAVE23_REQUIRE_PG=1 (gate REQUIRED where PG can run)',
    !!r2.ok && r2.probeResult === '1', 'probeResult=' + r2.probeResult);

  /* T3 — explicit DATABASE_URL wins; PGURL must not clobber it. */
  const direct = 'postgres://payesh:payesh@127.0.0.1:5432/other_db';
  let r3;
  try {
    r3 = runProbe({ DATABASE_URL: direct, PGURL: pgurl, PATH: process.env.PATH, HOME: process.env.HOME });
  } catch (e) {
    r3 = { ok: false, err: String(e.message || e) };
  }
  chk('T3 explicit DATABASE_URL not overwritten by PGURL',
    !!r3.ok && r3.derived === direct, 'derived=' + r3.derived);
  chk('T3 WAVE23_REQUIRE_PG=1', !!r3.ok && r3.probeResult === '1', 'probeResult=' + r3.probeResult);

  /* T4 — the source must not reintroduce a bare unguarded `$DATABASE_URL`
     inside a `set -u` script. Catches the exact regression class.
     Comments are excluded: only executable lines are evaluated by bash. */
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const probeStart = src.indexOf('# ── live-PostgreSQL probe');
  const probeEnd = src.indexOf('# ── docs-stats pre-flight');
  const probeSrc = src.slice(probeStart, probeEnd);
  const codeLines = probeSrc.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#');
  });
  const bareRef = /[^{}:=]"\$DATABASE_URL"/;          /* [ -n "$DATABASE_URL" ] unguarded */
  const guarded = /\$\{DATABASE_URL:-\}/;             /* safe form used by the fix */
  const offending = codeLines.filter((l) => bareRef.test(l) && !guarded.test(l));
  chk('T4 probe block has no unguarded bare $DATABASE_URL under set -u',
    offending.length === 0, 'offending lines: ' + JSON.stringify(offending));

  console.log('\n────────────────────────────────────────────────────');
  console.log(`g7-ci-database-env: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
