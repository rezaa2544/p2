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

  /* ── C6: a registry whose head_bound is not the current HEAD ──────
     M15-01 recovery note. Until 2026-10-27 this case ran the audit against the
     LIVE registry and relied on that registry happening to be stale. That made
     the defense depend on the defect it was defending against: the moment the
     registry became correctly bound (lineage, 0 changed witnessed paths), the
     audit legitimately exited 0 and this case went red — a real red, reported
     by the canonical runner on 06ba3da3, not a flake. The defense now builds
     the stale registry itself, so it proves the rule instead of hoping for a
     stale file, and a separate control proves the audit can still say VALID. */
  {
    function fixtureRegistry(over) {
      const d = tmpDir('c6');
      fs.mkdirSync(path.join(d, 'tools', 'lib'), { recursive: true });
      fs.mkdirSync(path.join(d, 'docs', 'verification'), { recursive: true });
      fs.mkdirSync(path.join(d, 'tests'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'tools', 'registry-provenance.js'), path.join(d, 'tools', 'registry-provenance.js'));
      fs.copyFileSync(path.join(ROOT, 'tools', 'lib', 'verification-witness.js'), path.join(d, 'tools', 'lib', 'verification-witness.js'));
      fs.writeFileSync(path.join(d, 'docs', 'STRICT_VERIFICATION_GATE.md'), '# fixture policy\n');
      fs.writeFileSync(path.join(d, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json'), '{}\n');
      fs.writeFileSync(path.join(d, 'tests', 'run.js'), '// fixture runner\n');
      fs.writeFileSync(path.join(d, 'package.json'), '{}\n');
      run('git init -q .', { cwd: d });
      run('git config user.email fg@test.local && git config user.name fg', { cwd: d });
      run('git add -A && git commit -qm one', { cwd: d });
      const first = run('git rev-parse HEAD', { cwd: d }).out.trim();
      fs.writeFileSync(path.join(d, 'later.txt'), 'second commit changes the tree\n');
      run('git add -A && git commit -qm two', { cwd: d });
      const second = run('git rev-parse HEAD', { cwd: d }).out.trim();
      const reg = Object.assign({
        schema_version: 2,
        status: 'RUNTIME_VERIFIED',
        binding_mode: 'legacy',
        head_bound: second,
        closure_scope: ['X-1'],
        blocked_items: 0,
        items: [{ id: 'X-1', status: 'RUNTIME_VERIFIED', reviews: ['arena'], arena: { status: 'PASS' }, evidence: [] }]
      }, over || {});
      fs.writeFileSync(path.join(d, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
      return { dir: d, first: first, second: second };
    }

    /* 1) stale: evidence belongs to the parent, checkout has moved on. */
    const stale = fixtureRegistry({ head_bound: null });
    const regPath = path.join(stale.dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const regJson = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    regJson.head_bound = stale.first;
    fs.writeFileSync(regPath, JSON.stringify(regJson, null, 2));
    const r = run('"' + NODE + '" tools/registry-provenance.js --audit', { cwd: stale.dir });
    chk('C6 a stale legacy registry is rejected by the audit (exit != 0)',
      r.code !== 0, 'audit exited 0 on a stale registry — defense failed');
    chk('C6 the audit names it as a head_bound mismatch, not a generic failure',
      /MISMATCH/i.test(r.out), r.out.split('\n').filter((l) => /MISMATCH/.test(l))[0] || r.out.slice(0, 160));

    /* 2) control: the same fixture, correctly bound, must be ACCEPTED — otherwise
       case 1 could pass by rejecting everything. */
    const fresh = fixtureRegistry({ head_bound: null });
    const freshPath = path.join(fresh.dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const freshJson = JSON.parse(fs.readFileSync(freshPath, 'utf8'));
    freshJson.head_bound = fresh.second;
    fs.writeFileSync(freshPath, JSON.stringify(freshJson, null, 2));
    const rOk = run('"' + NODE + '" tools/registry-provenance.js --audit', { cwd: fresh.dir });
    chk('C6 CONTROL a correctly bound registry is accepted (exit 0, PROVENANCE VALID)',
      rOk.code === 0 && /PROVENANCE VALID/.test(rOk.out), 'code=' + rOk.code + ' ' + rOk.out.slice(-160));

    /* 3) the gate and the audit must never disagree about the LIVE repository —
       asserted as an invariant, not against an assumed registry state. */
    const live = run('"' + NODE + '" tools/registry-provenance.js --audit');
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), 'utf8'));
    const head = run('git rev-parse HEAD').out.trim();
    chk('C6 live registry carries a comparable head_bound and binding mode',
      typeof reg.head_bound === 'string' && /^[0-9a-f]{40}$/.test(reg.head_bound) && typeof head === 'string',
      'head_bound=' + reg.head_bound + ' head=' + head);
    chk('C6 the live audit verdict is one of the defined codes (0 valid / 2 invalid or stale / 3 no scope)',
      [0, 2, 3].indexOf(live.code) !== -1, 'code=' + live.code);
    chk('C6 a valid live binding is never reported as MISMATCH (and vice versa)',
      /PROVENANCE VALID/.test(live.out) ? live.code === 0 : live.code !== 0,
      'code=' + live.code + ' verdict=' + (live.out.match(/VERDICT\s*:\s*(.+)/) || [])[1]);
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
