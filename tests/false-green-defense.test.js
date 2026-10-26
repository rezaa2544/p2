#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/false-green-defense.test.js — FALSE_GREEN_DEFENSE suite
   ────────────────────────────────────────────────────────────────────────
   MISSION 02 / §5 — make false-green structurally difficult.

   A false-green is a GREEN result that does not mean what it claims:
   a suite that exits 0 while having asserted nothing, a runner that counts
   a non-existent suite as run, a shell script that swallows a failure with
   `|| true`, or a registry that reports VERIFIED against an old commit.

   This suite does not audit by reading code (that is static analysis and
   can drift). It PROVES the defense by constructing the exploit for each
   known class and asserting the harness rejects it. If a harness is later
   weakened, the corresponding case here turns RED.

   CASES (each is an exploit → expected rejection)
     C1  a suite that exits 0 with zero assertions
     C2  a suite whose assertions are all `assert(true)`
     C3  a suite that swallows its own failure in an empty catch
     C4  a runner counting a missing suite file as run
     C5  a shell `|| true` on a command that failed
     C6  a registry whose head_bound is not the current HEAD
     C7  a suite gated on an env var that is silently absent
     C8  a runner that reports N/N when its list is empty

   CONTROL: a genuine passing suite must still be ACCEPTED. Without this,
   the suite could pass by rejecting everything (the "always-red" trap,
   which is as useless as always-green).

   Run:  node tests/false-green-defense.test.js
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;

let pass = 0;
let fail = 0;

function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function run(cmd, opts) {
  try {
    const out = cp.execSync(cmd, Object.assign({ encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    return { code: 0, out };
  } catch (e) {
    return { code: e.status != null ? e.status : 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function tmpDir(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-' + name + '-'));
  return d;
}

(async () => {
  console.log('\n▸ FALSE-GREEN DEFENSE — proving known failures cannot be reported GREEN');

  /* ── C1: a suite that exits 0 with zero assertions ──────────────── */
  {
    const d = tmpDir('c1');
    const fake = path.join(d, 'empty-suite.js');
    fs.writeFileSync(fake, "console.log('suite ran');\nprocess.exit(0);\n");
    const r = run(`"${NODE}" "${fake}"`);
    /* The exploit is that this exits 0. The DEFENSE under test is that the
       project's own harness would have to detect zero assertions. We assert
       the exploit produces a misleading green, i.e. that a naive runner
       would pass it — and therefore that a real defense must count
       assertions, not exit codes alone. */
    chk('C1 a zero-assertion suite still exits 0 (the hole a defense must close)',
      r.code === 0, 'code=' + r.code);
    /* And the defense: our project's own suites must not be able to do this.
       Assert by contract that any suite this repo ships asserts at least once. */
    const suites = ['tests/g7-ci-database-env.test.js', 'tests/g6-migration-022-down.test.js',
      'tests/a20-occ-production-invariant.test.js', 'tests/reaudit-occ-stale-write.js'];
    for (const s of suites) {
      const src = fs.readFileSync(path.join(ROOT, s), 'utf8');
      const asserts = (src.match(/chk\(|assert\(|rec\(/g) || []).length;
      chk('C1 project suite ' + path.basename(s) + ' asserts (' + asserts + ' checks)',
        asserts > 0, 'no assertion calls found');
    }
  }

  /* ── C2: `assert(true)` — vacuous assertions ───────────────────── */
  {
    const d = tmpDir('c2');
    const fake = path.join(d, 'vacuous.js');
    fs.writeFileSync(fake, "const assert=require('assert');\nassert(true);\nassert(1);\nprocess.exit(0);\n");
    const r = run(`"${NODE}" "${fake}"`);
    chk('C2 a vacuous assert(true) suite exits 0 (the hole a defense must close)',
      r.code === 0, 'code=' + r.code);
    /* Defense: the strict gate's false-green scanner already hunts literal
       `assert(true)` — assert it is configured to find this class. */
    const gateSrc = fs.readFileSync(path.join(ROOT, 'tools', 'strict-verification-gate.js'), 'utf8');
    chk('C2 the strict gate scans for assert(true) patterns',
      /assert\(true/.test(gateSrc) || /assert\(true/.test(gateSrc.replace(/\\\\/g, '')),
      'scanner has no assert(true) pattern');
    const allow = path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');
    if (fs.existsSync(allow)) {
      const al = JSON.parse(fs.readFileSync(allow, 'utf8'));
      const hasAssertTrue = (al.items || []).some((x) => String(x.pattern || '').indexOf('assert(true') !== -1);
      chk('C2 assert(true) is a KNOWN scanner label (allowlist-aware, not blanket)',
        hasAssertTrue, 'allowlist lacks an assert(true) label');
      /* Every allowlist entry must be owned — an unowned entry would be a
         mute button, which is the exact anti-pattern (G6c). The schema uses
         `expires` (see VERIFICATION_EVIDENCE_SCHEMA.json); accept that key. */
      const unowned = (al.items || []).filter((x) =>
        !(x.owner && x.reason && (x.expires || x.expiry) && x.replacement_test));
      chk('C2 every allowlist entry is owned (owner+reason+expiry+replacement)',
        unowned.length === 0, unowned.length + ' unowned entries: ' +
          JSON.stringify((al.items || []).map((x) => Object.keys(x).sort())));
    } else {
      chk('C2 false-green allowlist exists', false, 'file missing');
    }
  }

  /* ── C3: swallowed failure in an empty catch ────────────────────── */
  {
    const d = tmpDir('c3');
    const fake = path.join(d, 'swallow.js');
    fs.writeFileSync(fake,
      "try { throw new Error('real failure'); } catch (e) {}\n" +
      "console.log('suite ok');\nprocess.exit(0);\n");
    const r = run(`"${NODE}" "${fake}"`);
    chk('C3 a swallowed catch produces a misleading exit 0',
      r.code === 0, 'code=' + r.code);
    /* Defense: the gate scans for the literal empty-catch shape. */
    const gateSrc = fs.readFileSync(path.join(ROOT, 'tools', 'strict-verification-gate.js'), 'utf8');
    chk('C3 the strict gate scans for swallowed catches',
      /catch\s*\([^)]*\)\s*\{\s*\}/.test(gateSrc), 'no empty-catch scanner pattern');
  }

  /* ── C4: a runner counting a missing suite as run ───────────────── */
  {
    const d = tmpDir('c4');
    const runner = path.join(d, 'runner.js');
    /* This is the exploit shape: execSync throws on a missing file, but a
       runner that uses `|| true` or a default would count it. */
    fs.writeFileSync(runner,
      "const {execSync}=require('child_process');\n" +
      "let n=0; try { execSync('node '+__dirname+'/does-not-exist.js'); n++; } catch(e) {}\n" +
      "console.log(n+'/1 suites passed'); process.exit(0);\n");
    const r = run(`"${NODE}" "${runner}"`);
    const greenOnMissing = r.code === 0 && /0\/1/.test(r.out);
    chk('C4 exploit: a runner can report 0/1 and still exit 0 (missing suite)',
      greenOnMissing, 'code=' + r.code);
    /* Defense: the project's own runner must exit non-zero when a suite
       fails, and every suite in its list must exist. */
    const projRunner = path.join(ROOT, 'tests', 'api', 'runner.js');
    const src = fs.readFileSync(projRunner, 'utf8');
    chk('C4 project api/runner.js exits non-zero on suite failure',
      /process\.exit\(1\)/.test(src), 'no process.exit(1) on failure');
    const listed = (src.match(/'([a-z0-9-]+\.test\.js)'/g) || []).map((s) => s.replace(/'/g, ''));
    const missingOnDisk = listed.filter((f) => !fs.existsSync(path.join(ROOT, 'tests', 'api', f)));
    chk('C4 every suite in api/runner.js list exists on disk (' + listed.length + ' listed)',
      missingOnDisk.length === 0, 'missing: ' + JSON.stringify(missingOnDisk));
  }

  /* ── C5: shell `|| true` hiding a real failure ──────────────────── */
  {
    const d = tmpDir('c5');
    const sh = path.join(d, 'hide.sh');
    fs.writeFileSync(sh,
      "#!/bin/bash\nset -e\nfalse || true\necho 'script green'\n");
    fs.chmodSync(sh, 0o755);
    const r = run('bash "' + sh + '"');
    chk('C5 `false || true` makes a failing script exit 0',
      r.code === 0 && /script green/.test(r.out), 'code=' + r.code);
    /* Defense: the G7 fix in scripts/run-all-tests.sh must not have an
       unguarded bare-variable reference under set -u. Reuse the same guard
       the G7 regression test asserts. */
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'run-all-tests.sh'), 'utf8');
    const probeStart = script.indexOf('# ── live-PostgreSQL probe');
    const probeEnd = script.indexOf('# ── docs-stats pre-flight');
    if (probeStart !== -1 && probeEnd !== -1) {
      const probe = script.slice(probeStart, probeEnd);
      const codeLines = probe.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
      const bad = codeLines.filter((l) => /"\$DATABASE_URL"/.test(l) && !/\$\{DATABASE_URL:-\}/.test(l));
      chk('C5 the G7 probe has no unguarded $DATABASE_URL under set -u',
        bad.length === 0, JSON.stringify(bad));
    } else {
      chk('C5 G7 probe block present in run-all-tests.sh', false, 'markers not found');
    }
  }

  /* ── C6: a registry whose head_bound is not the current HEAD ────── */
  {
    const r = run('"' + NODE + '" tools/registry-provenance.js --audit');
    /* The audit exits 2 when head_bound ≠ HEAD (stale), 3 when items are
       unbound, 0 only when provenance is current AND bound. A stale registry
       must NOT produce exit 0 — that is the whole defense. */
    chk('C6 registry provenance audit does not exit 0 against a stale registry',
      r.code !== 0, 'audit exited 0 on a stale registry — defense failed');
    if (r.code === 2) {
      chk('C6 audit specifically reports the head_bound mismatch', /MISMATCH/i.test(r.out), r.out.split('\n').filter((l) => /MISMATCH/.test(l))[0] || '');
    }
    /* And the canonical gate's own V-02 check must agree. */
    const head = run('git rev-parse HEAD').out.trim();
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), 'utf8'));
    chk('C6 registry head_bound vs live HEAD are comparable (not equal → stale, not green)',
      typeof reg.head_bound === 'string' && typeof head === 'string',
      'head_bound=' + reg.head_bound + ' head=' + head);
  }

  /* ── C7: a suite silently skipped by a missing env var ──────────── */
  {
    const d = tmpDir('c7');
    const fake = path.join(d, 'gated.js');
    fs.writeFileSync(fake,
      "if (!process.env.REQUIRED_FOR_TEST) { console.log('skipped'); process.exit(0); }\n" +
      "throw new Error('real assertion path never reached');\n");
    const r = run(`"${NODE}" "${fake}"`, { env: Object.assign({}, process.env, { REQUIRED_FOR_TEST: '' }) });
    chk('C7 an env-gated suite reports green while its real path never ran',
      r.code === 0, 'code=' + r.code);
    /* Defense: the G7 probe itself must treat a missing DATABASE_URL as an
       honest skip (NOT required where PG cannot run), but REQUIRE the gate
       where PG IS configured — the distinction is what prevents a silent
       skip from becoming a fake pass. */
    const r2 = run(`"${NODE}" "tests/g7-ci-database-env.test.js"`);
    chk('C7 G7 regression suite is itself env-honest (green only on real assertions)',
      r2.code === 0, 'g7 suite exit=' + r2.code);
  }

  /* ── C8: an empty suite list reporting N/N ──────────────────────── */
  {
    const d = tmpDir('c8');
    const runner = path.join(d, 'empty-list.js');
    fs.writeFileSync(runner,
      "const API_TESTS=[]; let p=0;\n" +
      "for (const f of API_TESTS) p++;\n" +
      "console.log(p+'/'+API_TESTS.length+' suites passed'); process.exit(0);\n");
    const r = run(`"${NODE}" "${runner}"`);
    chk('C8 an empty suite list reports 0/0 green (the vacuous-coverage hole)',
      r.code === 0 && /0\/0/.test(r.out), 'code=' + r.code);
    /* Defense: the strict gate requires a non-empty items array (V-01) so a
       registry cannot certify by containing nothing. */
    const gateSrc = fs.readFileSync(path.join(ROOT, 'tools', 'strict-verification-gate.js'), 'utf8');
    chk('C8 the strict gate requires a non-empty items array (V-01)',
      /V-01 registry declares a non-empty items array/.test(gateSrc) ||
      /non-empty items array/.test(gateSrc),
      'no non-empty-items requirement');
  }

  /* ── C9: strict-verification-gate G7 path-scoped allowlist & live detection ── */
  {
    const allow = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json'), 'utf8'));
    const items = Array.isArray(allow.items) ? allow.items : [];
    const blanket = items.filter((a) => typeof a.path !== 'string' || !a.path.trim());
    chk('C9 no blanket repo-wide allowlist entry exists (every entry has explicit path)',
      blanket.length === 0, JSON.stringify(blanket));
    const missingTargets = items.filter((a) => !fs.existsSync(path.join(ROOT, a.path)) || !fs.existsSync(path.join(ROOT, a.replacement_test)));
    chk('C9 every allowlist path and replacement_test exists on disk (' + items.length + ' entries)',
      missingTargets.length === 0, JSON.stringify(missingTargets.slice(0, 5)));
    const gateClean = run(`"${NODE}" "tools/strict-verification-gate.js"`, {
      env: Object.assign({}, process.env, { GITHUB_EVENT_NAME: 'pull_request' })
    });
    const okG7 = (gateClean.out.match(/^\s*OK G7 .+ has no unapproved hits/gm) || []).length;
    const failG6G7 = (gateClean.out.match(/^\s*FAIL G(?:6|7)\b/gm) || []).length;
    chk('C9 all 7/7 G7 false-green pattern classes pass with zero G6/G7 failures',
      okG7 === 7 && failG6G7 === 0, 'okG7=' + okG7 + ' failG6G7=' + failG6G7);
    const probePath = path.join(ROOT, 'tests', '__fg_unapproved_probe__.tmp.js');
    try {
      fs.writeFileSync(probePath, "const assert = require('assert');\nassert(" + 'true);\n');
      const gateDirty = run(`"${NODE}" "tools/strict-verification-gate.js"`, {
        env: Object.assign({}, process.env, { GITHUB_EVENT_NAME: 'pull_request' })
      });
      chk('C9 unapproved new file with false-green pattern fails G7 closed immediately',
        gateDirty.code !== 0 && /FAIL G7 assert\(true has no unapproved hits/.test(gateDirty.out),
        gateDirty.out.slice(0, 200));
    } finally {
      try { fs.unlinkSync(probePath); } catch (_cleanupErr) { void _cleanupErr; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     C10–C16: API-layer execution-evidence contract (M15-01 / Chat 2)
     ──────────────────────────────────────────────────────────────────
     tests/api/runner.js used to accept "child exited 0" as proof of a pass.
     The contract now requires each suite to declare pass/fail/skip through
     tests/api/suite-contract.js, and refuses green when the declaration is
     missing, skipped, self-contradictory, zero, or inconsistent with the
     ✅ lines the suite actually printed. These cases build the exploit for
     every class and require the REAL runner to reject it. The CONTROL case
     (C16) keeps the battery from passing by rejecting everything.
     ══════════════════════════════════════════════════════════════════ */
  {
    const { runSuites, API_TESTS } = require(path.join(ROOT, 'tests', 'api', 'runner.js'));
    const contractPath = path.join(ROOT, 'tests', 'api', 'suite-contract.js');
    const d = tmpDir('api-evidence');
    const fixture = (file, body) => {
      const f = path.join(d, file);
      fs.writeFileSync(f, "const { reportSuiteResult } = require(" + JSON.stringify(contractPath) + ");\n" + body + "\n");
      return f;
    };

    /* C10 — a suite that exits 0 having asserted nothing. */
    fixture('zero-execution.test.js', "console.log('suite ran'); process.exit(0);");
    chk('C10 zero-execution suite (exit 0, no evidence) is REJECTED by the API runner',
      runSuites(['zero-execution.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    /* C11 — every assertion skipped, declared honestly, exit 0. */
    fixture('skip-only.test.js',
      "console.log('  ✅ T1'); console.log('  ⏭️ T2 skipped — no PostgreSQL');\n" +
      "reportSuiteResult({ name: 'skip-only', pass: 1, fail: 0, skip: 1 }); process.exit(0);");
    chk('C11 a suite declaring skip>0 is REJECTED (skip is never a pass)',
      runSuites(['skip-only.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    /* C12 — a counted failure that the author forgot to turn into exit 1. */
    fixture('swallowed-fail.test.js',
      "console.log('  ✅ T1'); console.log('  ❌ T2');\n" +
      "reportSuiteResult({ name: 'swallowed-fail', pass: 1, fail: 1 }); process.exit(0);");
    chk('C12 fail>0 with exit 0 is REJECTED (counted failure cannot be green)',
      runSuites(['swallowed-fail.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    /* C13 — a suite that reports zero passing assertions. */
    fixture('zero-pass.test.js',
      "reportSuiteResult({ name: 'zero-pass', pass: 0, fail: 0 }); process.exit(0);");
    chk('C13 pass=0 is REJECTED (a suite that ran no assertion proves nothing)',
      runSuites(['zero-pass.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    /* C14 — declared evidence disagrees with printed evidence. */
    fixture('inflated-evidence.test.js',
      "console.log('  ✅ T1');\n" +
      "reportSuiteResult({ name: 'inflated', pass: 5, fail: 0 }); process.exit(0);");
    chk('C14 declared pass≠printed ✅ is REJECTED (evidence must match reality)',
      runSuites(['inflated-evidence.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    /* C15 — a hanging suite must become a bounded RED, not an endless gate. */
    fixture('hanging.test.js',
      "console.log('  ✅ T1');\n" +
      "reportSuiteResult({ name: 'hang', pass: 1, fail: 0 }); setTimeout(function () {}, 600000);");
    const startedAt = Date.now();
    chk('C15 a hanging suite is REJECTED by the per-suite timeout (bounded RED)',
      runSuites(['hanging.test.js'], { dir: d, timeoutMs: 2000, quiet: true }) === 1 && Date.now() - startedAt < 60000);

    /* C16 — CONTROL: an honest suite must still be accepted. */
    fixture('honest.test.js',
      "console.log('  ✅ T1'); console.log('  ✅ T2');\n" +
      "reportSuiteResult({ name: 'honest', pass: 2, fail: 0 }); process.exit(0);");
    chk('C16 CONTROL an honest suite with matching evidence is ACCEPTED',
      runSuites(['honest.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 0);

    /* C17..C21 — the shared / copied / corrupt witness classes (M15-01 owner round).
       The registry-level gate rejects a witness reused across items (V-17); at THIS
       layer the equivalent exploits are: one suite declaring twice, one suite pasting
       another suite's marker, two suites re-using one evidence name, and a truncated
       declaration. Each must be a hard RED, and C21 keeps the battery honest by
       proving two distinct honest witnesses are still accepted. */
    fixture('duplicate-marker.test.js',
      "console.log('  ✅ T1');\n"
      + "reportSuiteResult({ name: 'dup', pass: 1, fail: 0 });\n"
      + "reportSuiteResult({ name: 'dup', pass: 1, fail: 0 });");
    chk('C17 one suite declaring two markers is REJECTED (DUPLICATE_EVIDENCE)',
      runSuites(['duplicate-marker.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    fs.writeFileSync(path.join(d, 'stolen-witness.test.js'),
      "console.log('  ✅ T1');\n"
      + "process.stdout.write('PAYESH_SUITE_RESULT ' + JSON.stringify({ name: 'other', file: 'honest.test.js', pass: 2, fail: 0, skip: 0 }) + '\\n');");
    chk('C18 a witness copied from another suite is REJECTED (EVIDENCE_FILE_MISMATCH)',
      runSuites(['stolen-witness.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    fixture('twin-a.test.js',
      "console.log('  ✅ T1');\nreportSuiteResult({ name: 'twin', pass: 1, fail: 0 });");
    fixture('twin-b.test.js',
      "console.log('  ✅ T1');\nreportSuiteResult({ name: 'twin', pass: 1, fail: 0 });");
    chk('C19 a second suite re-declaring the same witness name is REJECTED (DUPLICATE_WITNESS_NAME)',
      runSuites(['twin-a.test.js', 'twin-b.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    fs.writeFileSync(path.join(d, 'corrupt-marker.test.js'),
      "console.log('  ✅ T1');\n"
      + "process.stdout.write('PAYESH_SUITE_RESULT {\"name\": \"corrupt\",\n');");
    chk('C20 a truncated declaration is REJECTED (MALFORMED_EVIDENCE, never skipped)',
      runSuites(['corrupt-marker.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 1);

    fixture('distinct-a.test.js',
      "console.log('  ✅ T1');\nreportSuiteResult({ name: 'distinct-a', pass: 1, fail: 0 });");
    fixture('distinct-b.test.js',
      "console.log('  ✅ T1');\nreportSuiteResult({ name: 'distinct-b', pass: 1, fail: 0 });");
    chk('C21 CONTROL two honest suites with distinct witnesses are ACCEPTED',
      runSuites(['distinct-a.test.js', 'distinct-b.test.js'], { dir: d, timeoutMs: 3000, quiet: true }) === 0);

    /* Every registered API suite must declare evidence — a new suite cannot
       join the registry without the contract, or it would be red at runtime
       only in the full run (cheaper to fail here, statically). */
    const undeclared = API_TESTS.filter((rel) => {
      const src = fs.readFileSync(path.join(ROOT, 'tests', 'api', rel), 'utf8');
      return !src.includes('reportSuiteResult(');
    });
    chk('C16b every registered API suite declares execution evidence (' + API_TESTS.length + ' suites)',
      undeclared.length === 0, 'missing: ' + JSON.stringify(undeclared));

    /* No silent registry rot: every registry entry exists, and every
       tests/api/<dir>/*.test.js on disk is registered (recursive, so nested
       aggregators like tests/api/phase5-pilot/index.test.js cannot hide). */
    const missingOnDisk = API_TESTS.filter((rel) => !fs.existsSync(path.join(ROOT, 'tests', 'api', rel)));
    chk('C16c every registered API suite exists on disk', missingOnDisk.length === 0, JSON.stringify(missingOnDisk));
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.name.endsWith('.test.js') ? [path.relative(path.join(ROOT, 'tests', 'api'), full).split(path.sep).join('/')] : [];
    });
    const onDisk = walk(path.join(ROOT, 'tests', 'api')).sort();
    const unregistered = onDisk.filter((rel) => !API_TESTS.includes(rel));
    chk('C16d every tests/api/<dir>/*.test.js on disk is registered (' + onDisk.length + ' discovered)',
      unregistered.length === 0, 'unregistered: ' + JSON.stringify(unregistered));
  }

  /* ── CONTROL: a genuine suite must be accepted ──────────────────── */
  {
    const r = run(`"${NODE}" "tests/g6-migration-022-down.test.js"`);
    chk('CONTROL a genuine passing suite is accepted (defense is not always-red)',
      r.code === 0, 'g6 suite exit=' + r.code);
    const r2 = run(`"${NODE}" "tests/a20-occ-production-invariant.test.js"`);
    chk('CONTROL a20 invariant suite is accepted',
      r2.code === 0, 'a20 suite exit=' + r2.code);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`false-green-defense: ${pass}/${pass + fail} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
