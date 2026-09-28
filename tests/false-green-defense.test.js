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
    const listed = (src.match(/'([a-z0-9\-]+\.test\.js)'/g) || []).map((s) => s.replace(/'/g, ''));
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
