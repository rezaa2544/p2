#!/usr/bin/env node
/* experiments/registry-headline-reachability.js — M15-01 Chat 3 (2026-10-29)

   SYNTHETIC experiment. It says nothing about whether the project's own items are
   verified; it answers one structural question about the gate's rules:

     Can a registry that still contains an honestly BLOCKED/UNKNOWN item ever
     reach `VERDICT VERIFIED` + exit 0, once every binding check passes?

   The rules under test (tools/strict-verification-gate.js, unchanged):
     V-15   registry headline <= the weakest item's status rank
     V-15b  any blocked item caps the registry headline at TESTED or below
     V-16   a registry whose headline is below RUNTIME_VERIFIED is refused
            ("conforms to the schema but verifies nothing")

   The experiment builds three throwaway registry-only landing commits on real git
   history, with genuine artifacts (bytes committed at the evidence commit) so that
   V-02/G9/V-12 binding is satisfied rather than bypassed:

     A  one blocked UNKNOWN item + one RUNTIME_VERIFIED item, headline UNKNOWN
     B  no blocked item, one RUNTIME_VERIFIED item, headline RUNTIME_VERIFIED
     C  case A with the headline raised to RUNTIME_VERIFIED

   Measured outcome: A passes the entire contract and is refused by V-16; B is
   green; C is refused by V-15b. So while one item is blocked, the maximum legal
   headline is TESTED, which is below the verifying band V-16 demands.

   B must be green; if A or C were also green, binding and headline rules would be
   broken. The expected (and measured) result is A red on V-15b, C red on V-15,
   i.e. no headline satisfies both families while a blocked item exists.

   usage: node experiments/registry-headline-reachability.js
   exit 0 = the documented behaviour was reproduced on every case.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

/* locate the repository root by walking up until the gate is found, so the
   experiment also runs when this evidence directory is copied elsewhere */
const ROOT = (() => {
  let d = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(d, 'tools', 'strict-verification-gate.js'))) return d;
    d = path.dirname(d);
  }
  throw new Error('repository root not found from ' + __dirname);
})();
const GATE_SRC = path.join(ROOT, 'tools', 'strict-verification-gate.js');
const COPY = [
  ['tools/strict-verification-gate.js', 'tools/strict-verification-gate.js'],
  ['docs/STRICT_VERIFICATION_GATE.md', 'docs/STRICT_VERIFICATION_GATE.md'],
  ['docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json', 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'],
  ['docs/verification/FALSE_GREEN_ALLOWLIST.json', 'docs/verification/FALSE_GREEN_ALLOWLIST.json'],
  ['infra/observability/alert-rules.yml', 'infra/observability/alert-rules.yml']
];
const ARTIFACT = 'docs/verification/evidence/synthetic-run.log';
const EVIDENCE_TEXT = 'SYNTHETIC fixture run — 5 of 5 checks passed, exit 0.\n';

const GIT_ENV = Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'f@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'f@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GITHUB_EVENT_NAME: 'push'
});

let pass = 0;
let fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function git(repo, args) {
  const r = cp.spawnSync('git', args, { cwd: repo, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' @ ' + repo + ': ' + (r.stderr || ''));
  return String(r.stdout || '').trim();
}

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function evidenceRecord(headSha, kind) {
  return {
    reviewer: 'arena',
    kind: kind,
    command: 'node experiments/synthetic-run.js',
    exit_code: 0,
    checks_total: 5,
    checks_passed: 5,
    artifact: ARTIFACT,
    sha256: null,                       /* filled with the committed artifact's hash */
    head_sha: headSha,
    runtime: { node: process.version, os: 'linux', arch: process.arch },
    ts: new Date().toISOString()
  };
}

function buildCase(name, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-fixture-'));
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [from, to] of COPY) {
    const dst = path.join(dir, to);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, from), dst);
  }
  fs.mkdirSync(path.join(dir, 'docs/verification/evidence'), { recursive: true });
  fs.writeFileSync(path.join(dir, ARTIFACT), EVIDENCE_TEXT);
  fs.writeFileSync(path.join(dir, 'README.md'), 'synthetic fixture\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'source with committed evidence artifact']);
  const F = git(dir, ['rev-parse', 'HEAD']);
  const artSha = sha256(path.join(dir, ARTIFACT));

  const items = [];
  const expected = [];
  if (opts.blocked) {
    const r = evidenceRecord(F, 'review_note');
    r.sha256 = artSha;
    items.push({
      id: 'S-BLOCKED',
      status: 'UNKNOWN',
      requirement: 'synthetic honestly blocked item',
      head_sha: F,
      reviews: ['arena'],
      known_limitations: ['synthetic fixture item; asserts nothing'],
      blocked: true,
      blocked_reason: 'synthetic fixture: deliberately not verified',
      owner_decision_required: true,
      evidence: [r],
      arena: { status: 'BLOCKED', evidence: [r] }
    });
    expected.push('S-BLOCKED');
  }
  const r2 = evidenceRecord(F, 'positive_test');
  r2.sha256 = artSha;
  /* V-11 refuses a verifying status whose evidence is positive-only: an item that
     claims to be verified must also carry a negative/adversarial record. */
  const r3 = evidenceRecord(F, 'negative_test');
  r3.sha256 = artSha;
  items.push({
    id: 'S-VERIFIED',
    status: 'RUNTIME_VERIFIED',
    requirement: 'synthetic item with a real bound artifact',
    head_sha: F,
    reviews: ['arena'],
    known_limitations: ['synthetic fixture item'],
    scope: 'synthetic S1',
    evidence: [r2, r3],
    arena: { status: 'PASS', evidence: [r2, r3] }
  });
  expected.push('S-VERIFIED');

  const registry = {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: opts.headline,
    head_bound: F,
    required_reviewers: ['arena'],
    reviews_recorded: { arena: ['synthetic fixture review record'] },
    allowed_statuses: ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'],
    expected_ids: expected,
    items
  };
  const regPath = path.join(dir, 'docs/verification/VERIFICATION_REGISTRY.json');
  fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'registry-only metadata commit']);
  const L = git(dir, ['rev-parse', 'HEAD']);

  /* V-06 needs a remote reference. The fixture's landing commit is its own
     origin/main, which is the post-landing state the real gate is run in. */
  git(dir, ['update-ref', 'refs/remotes/origin/main', L]);
  const shape = git(dir, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
  const changed = git(dir, ['diff', '--name-only', '--no-renames', F, L]).split('\n').filter(Boolean);
  chk(name + ' fixture really is a single-parent registry-only landing',
    shape.length === 2 && changed.length === 1 && changed[0] === 'docs/verification/VERIFICATION_REGISTRY.json',
    'parents=' + shape.length + ' changed=' + JSON.stringify(changed));

  const r = cp.spawnSync(process.execPath, [path.join(dir, 'tools/strict-verification-gate.js')],
    { cwd: dir, env: GIT_ENV, encoding: 'utf8' });
  const out = String(r.stdout || '') + String(r.stderr || '');
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out };
}

console.log('\n▸ registry headline reachability with an honestly blocked item (synthetic)');

const a = buildCase('A', { blocked: true, headline: 'UNKNOWN' });
chk('A every structural check passes — binding is satisfied, not bypassed',
  /^CONTRACT PASS$/m.test(a.out),
  a.out.split('\n').filter((l) => /^ {2}FAIL/.test(l)).slice(0, 2).join(' | '));
chk('A V-15b already caps the headline at UNKNOWN under a blocked item',
  /^ {2}OK V-15b/m.test(a.out), a.out.split('\n').filter((l) => /V-15b/.test(l))[0] || '');
chk('A is still refused by V-16 (schema-valid registry that verifies nothing)',
  /V-16 registry conforms to the schema but verifies nothing/.test(a.out),
  a.out.split('\n').filter((l) => /V-16/.test(l))[0] || '');
chk('A exits 1', a.code === 1, 'exit=' + a.code);

const b = buildCase('B', { blocked: false, headline: 'RUNTIME_VERIFIED' });
chk('B (no blocked item) reaches VERDICT VERIFIED', /VERDICT VERIFIED/.test(b.out),
  b.out.split('\n').filter((l) => /^VERDICT/.test(l))[0] || '');
chk('B exits 0 — the harness can be green, so the experiment is not always-red', b.code === 0, 'exit=' + b.code);

const c = buildCase('C', { blocked: true, headline: 'RUNTIME_VERIFIED' });
chk('C raising the headline is refused (V-15/V-15b out-claim)',
  /^ {2}FAIL V-15b?/m.test(c.out), c.out.split('\n').filter((l) => /^ {2}FAIL V-15/.test(l))[0] || '');
chk('C exits 1', c.code === 1, 'exit=' + c.code);

console.log('\n──────────────────────────────────────────');
console.log('reachability experiment: ' + pass + ' successful / ' + fail + ' failed (' + (pass + fail) + ' total)');
if (fail) process.exit(1);
console.log('Conclusion reproduced: while any item is blocked/UNKNOWN, the legal headline');
console.log('ceiling is TESTED, which V-16 refuses — exit 0 is unreachable for such a registry.');
