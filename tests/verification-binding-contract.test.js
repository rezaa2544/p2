#!/usr/bin/env node
'use strict';
/**
 * tests/verification-binding-contract.test.js
 * M15-01 recovery — the binding rule and the closure scope, on real git histories.
 *
 * WHY A SEPARATE SUITE
 * tools/strict-verification-gate.js and tools/registry-provenance.js disagreed about
 * what "evidence is bound" meant: the gate compared a scalar SHA, the audit compared a
 * hard-coded dependency hash that no registry item carried. On main fff1beae that showed
 * up as 633 pass / 65 fail (gate) and 29 UNBOUND / exit 2 (audit) for the same registry.
 * Both now call tools/lib/verification-witness.js. This suite pins that rule and proves
 * that a weakening of it is detectable, using real commits rather than mocks.
 *
 * CASE SHAPES
 *   lineage-valid            unrelated later commit          -> ACCEPTED
 *   lineage-docs-commit      docs-only commit on top         -> ACCEPTED
 *   lineage-witness-changed  a cited test edited on top      -> REJECTED (stale evidence)
 *   lineage-shrunk           witness.paths narrowed          -> REJECTED
 *   lineage-forged-blob      witness blob rewritten          -> REJECTED
 *   lineage-extra-path       witness.paths inflated          -> REJECTED
 *   lineage-not-ancestor     head_bound on a sibling line    -> REJECTED
 *   lineage-legacy-registry  binding_mode legacy + moved HEAD-> REJECTED (unchanged rule)
 *   scope-blocked-member     blocked item inside the scope   -> REJECTED
 *   scope-off-scope-claim    verifying item outside scope    -> REJECTED
 *   scope-empty-but-green    empty scope, green headline     -> REJECTED (V-16)
 *   scope-blocked-count-lie  blocked_items understated       -> REJECTED
 *   scope-certified-blocked  CERTIFIED with blocked items    -> REJECTED
 *   scope-weakest-headline   headline above weakest in scope -> REJECTED
 *   provenance-agrees        audit and gate reach the same verdict in both directions
 *
 * Run: node tests/verification-binding-contract.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..');
const GATE_SRC = path.join(REPO, 'tools', 'strict-verification-gate.js');
const WITNESS_SRC = path.join(REPO, 'tools', 'lib', 'verification-witness.js');
const PROVENANCE_SRC = path.join(REPO, 'tools', 'registry-provenance.js');
const SCHEMA_SRC = path.join(REPO, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALLOW_SRC = path.join(REPO, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');

const WITNESS = require(WITNESS_SRC);

let checks = 0, fail = 0;
const failures = [];
function chk(name, ok, detail) {
  checks++;
  if (ok) console.log('  OK   ' + name + (detail ? ' — ' + detail : ''));
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const git = (dir, args) => cp.execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const ARTIFACTS = {
  'docs/verification/evidence/x-positive.log': 'arena positive runtime proof\n',
  'docs/verification/evidence/x-negative.log': 'arena adversarial proof\n'
};

/* ── fixture repo ───────────────────────────────────────────────────────── */
function mkFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-' + name.replace(/[^a-z0-9]+/gi, '-') + '-'));
  for (const d of ['tools/lib', 'docs/verification/evidence', 'tests', 'infra/observability']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.copyFileSync(GATE_SRC, path.join(dir, 'tools/strict-verification-gate.js'));
  fs.copyFileSync(WITNESS_SRC, path.join(dir, 'tools/lib/verification-witness.js'));
  fs.copyFileSync(PROVENANCE_SRC, path.join(dir, 'tools/registry-provenance.js'));
  fs.copyFileSync(SCHEMA_SRC, path.join(dir, 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'));
  fs.writeFileSync(path.join(dir, 'docs/STRICT_VERIFICATION_GATE.md'), '# fixture policy\n');
  fs.writeFileSync(path.join(dir, 'infra/observability/alert-rules.yml'), 'groups: []\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"vb-fixture","scripts":{"test":"node tests/run.js"}}\n');
  fs.writeFileSync(path.join(dir, 'tests/run.js'), '// fixture runner\n');
  fs.writeFileSync(path.join(dir, 'tests/witnessed-suite.js'), '// fixture witnessed suite v1\n');
  for (const [rel, body] of Object.entries(ARTIFACTS)) fs.writeFileSync(path.join(dir, rel), body);
  /* allowlist: the gate's own source contains the scanner literals */
  const allow = JSON.parse(fs.readFileSync(ALLOW_SRC, 'utf8'));
  allow.items = allow.items.filter((a) => a.path === 'tools/strict-verification-gate.js' || a.path === 'tools/lib/verification-witness.js');
  if (!allow.items.length) {
    allow.items = ['assert(true', 'process.exit(0)', '|| true', '0/0 checks', 'self-skip', 'self-only', 'expect-true-toBe'].map((pattern) => ({
      pattern: pattern, path: 'tools/strict-verification-gate.js', owner: 'vb-fixture',
      reason: 'gate source embeds its scanner literals', expires: 'never',
      replacement_test: 'tests/verification-binding-contract.test.js'
    }));
  }
  fs.writeFileSync(path.join(dir, 'docs/verification/FALSE_GREEN_ALLOWLIST.json'), JSON.stringify(allow, null, 2));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'vb@test.local']);
  git(dir, ['config', 'user.name', 'vb-fixture']);
  return dir;
}

function evidence(sourceSha, kind, artifact, checksTotal) {
  return {
    reviewer: 'arena',
    kind: kind,
    command: 'node tests/witnessed-suite.js',
    exit_code: 0,
    checks_total: checksTotal || 7,
    checks_passed: checksTotal || 7,
    artifact: artifact,
    sha256: sha256(Buffer.from(ARTIFACTS[artifact] || '')),
    head_sha: sourceSha,
    runtime: { node: process.version, os: process.platform },
    ts: '2026-10-27T00:00:00.000Z'
  };
}

function makeRegistry(sourceSha, dir) {
  const ePos = evidence(sourceSha, 'positive_test', 'docs/verification/evidence/x-positive.log');
  const eNeg = evidence(sourceSha, 'negative_test', 'docs/verification/evidence/x-negative.log');
  ePos.sha256 = sha256(fs.readFileSync(path.join(dir, 'docs/verification/evidence/x-positive.log')));
  eNeg.sha256 = sha256(fs.readFileSync(path.join(dir, 'docs/verification/evidence/x-negative.log')));
  return {
    schema_version: 3,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'RUNTIME_VERIFIED',
    head_bound: sourceSha,
    binding_mode: 'lineage',
    witness: { paths: [], blobs: {} },
    closure_scope: ['VB-1'],
    blocked_items: 1,
    required_reviewers: ['arena'],
    allowed_statuses: ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'],
    reviews_recorded: { arena: ['vb run'] },
    expected_ids: ['VB-1', 'VB-2'],
    items: [
      {
        id: 'VB-1', status: 'RUNTIME_VERIFIED', requirement: 'binding contract fixture', head_sha: sourceSha,
        reviews: ['arena'], known_limitations: ['fixture'], evidence: [ePos, eNeg],
        arena: { status: 'PASS', evidence: [ePos, eNeg] }
      },
      {
        id: 'VB-2', status: 'UNKNOWN', requirement: 'honestly blocked fixture', head_sha: sourceSha,
        reviews: ['arena'], known_limitations: ['fixture'], blocked: true,
        blocked_reason: 'fixture: owner decision required', owner_decision_required: true,
        evidence: [Object.assign({}, eNeg, { kind: 'review_note', checks_total: 1, checks_passed: 1 })],
        arena: { status: 'BLOCKED', evidence: [Object.assign({}, eNeg, { kind: 'review_note', checks_total: 1, checks_passed: 1 })] }
      }
    ]
  };
}

/* Emit the registry, then commit ONLY it (metadata-only landing), then optionally add
   later commits. `mutateReg` runs before the witness is computed so a case can tamper
   with the declaration; `afterWitness` runs after, so a case can tamper with the result. */
function build(name, opts) {
  opts = opts || {};
  const dir = mkFixture(name);
  const sourceSha = (() => {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'source: evidence produced here']);
    return git(dir, ['rev-parse', 'HEAD']);
  })();
  const reg = makeRegistry(sourceSha, dir);
  if (opts.mutateReg) opts.mutateReg(reg, dir);
  const w = WITNESS.buildWitness(dir, reg, sourceSha);
  if (w.ok) reg.witness = w.witness;
  if (opts.afterWitness) opts.afterWitness(reg, dir);
  fs.writeFileSync(path.join(dir, 'docs/verification/VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
  git(dir, ['add', 'docs/verification/VERIFICATION_REGISTRY.json']);
  git(dir, ['commit', '-qm', 'registry: metadata-only']);
  git(dir, ['update-ref', 'refs/remotes/origin/main', git(dir, ['rev-parse', 'HEAD'])]);
  if (opts.later) opts.later(dir, sourceSha);
  /* origin/main follows every later commit so V-06 stays satisfied and only the
     binding rule under test can decide the outcome */
  const head = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['update-ref', 'refs/remotes/origin/main', head]);
  return { dir, sourceSha: sourceSha, head: head };
}

function runGate(dir, event) {
  const r = cp.spawnSync(process.execPath, ['tools/strict-verification-gate.js'], {
    cwd: dir, encoding: 'utf8', timeout: 120000,
    env: Object.assign({}, process.env, { GITHUB_EVENT_NAME: event || 'push' })
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function runAudit(dir) {
  const r = cp.spawnSync(process.execPath, ['tools/registry-provenance.js', '--audit'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const failedNamed = (out, label) => new RegExp('^\\s+FAIL\\s+' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm').test(out);

console.log('==== M15-01 BINDING & CLOSURE CONTRACT (real git) ====');

/* ── 1. lineage control: the protocol must actually work ────────────────── */
{
  const f = build('valid');
  const g = runGate(f.dir);
  chk('C1 lineage binding accepts a registry-only commit (exit 0)', g.code === 0,
    'exit=' + g.code + (g.code ? '\n' + g.out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 6).join('\n') : ''));
  const a = runAudit(f.dir);
  chk('C2 provenance audit agrees with the gate (exit 0)', a.code === 0, 'exit=' + a.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 2. the reason lineage exists: an unrelated later commit ─────────────── */
{
  const f = build('later-docs', {
    later: (dir) => {
      /* the policy/schema/gate are deliberately IN the witness set: editing the rule
         invalidates evidence about the rule. "Unrelated" means a file the evidence does
         not depend on. */
      fs.writeFileSync(path.join(dir, 'README.md'), '# fixture readme\nlater note\n');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'docs: unrelated note']);
    }
  });
  const g = runGate(f.dir);
  chk('C3 binding survives an unrelated documentation commit', g.code === 0,
    'exit=' + g.code + (g.code ? ' | ' + (g.out.match(/FAIL V-02[^\n]*/) || [''])[0] : ''));
  const a = runAudit(f.dir);
  chk('C4 provenance audit agrees after the unrelated commit', a.code === 0, 'exit=' + a.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 2b. LANDING STRATEGY (OD-3): what a merge, a squash and a mixed commit do
   to the binding. The old two-phase rule required the registry to land as a
   single-parent, exactly-one-path metadata commit — which is why OD-3 existed.
   Under binding_mode=lineage the rule is ancestry + witness blobs, so the
   *shape* of the landing commit stops mattering and the *content* starts
   mattering. That is a testable claim, so it is tested rather than assumed. */
{
  /* Build: a main line, then a work branch carrying the evidence commit and the
     registry-only commit, then land it three different ways. */
  function landingFixture(name) {
    const dir = mkFixture(name);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'main: base']);
    const mainBranch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']); /* git may default to master */
    const base = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['checkout', '-q', '-b', 'work']);
    fs.writeFileSync(path.join(dir, 'docs/verification/evidence/x-positive.log'), 'arena positive runtime proof\nwork branch\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'work: evidence produced here']);
    const sourceSha = git(dir, ['rev-parse', 'HEAD']);
    const reg = makeRegistry(sourceSha, dir);
    const w = WITNESS.buildWitness(dir, reg, sourceSha);
    if (!w.ok) throw new Error('landing fixture: witness build failed: ' + w.missing.join(','));
    reg.witness = w.witness;
    fs.writeFileSync(path.join(dir, 'docs/verification/VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
    git(dir, ['add', 'docs/verification/VERIFICATION_REGISTRY.json']);
    git(dir, ['commit', '-qm', 'registry: bound to ' + sourceSha]);
    return { dir, base, mainBranch: mainBranch, sourceSha, workHead: git(dir, ['rev-parse', 'HEAD']) };
  }
  const finish = (dir) => {
    const head = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['update-ref', 'refs/remotes/origin/main', head]);
    return head;
  };

  /* L1 — merge commit landing (--no-ff): lineage must survive it. */
  {
    const f = landingFixture('land-merge');
    git(f.dir, ['checkout', '-q', f.mainBranch]);
    fs.writeFileSync(path.join(f.dir, 'CHANGELOG.md'), 'unrelated main-line note\n');
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'main: concurrent unrelated note']);
    git(f.dir, ['merge', '-q', '--no-ff', 'work', '-m', 'merge work into main']);
    const head = finish(f.dir);
    const parents = git(f.dir, ['rev-list', '--parents', '-n', '1', head]).split(' ').length - 1;
    const g = runGate(f.dir);
    chk('L1 a merge-commit landing preserves the lineage binding (2 parents, exit 0)',
      parents === 2 && g.code === 0,
      'parents=' + parents + ' exit=' + g.code + ' ' + (g.out.match(/FAIL V-02[^\n]*/) || [''])[0]);
    fs.rmSync(f.dir, { recursive: true, force: true });
  }

  /* L2 — squash landing: the source commit stops being an ancestor, so the
     evidence can no longer be shown to describe this line. Must be rejected. */
  {
    const f = landingFixture('land-squash');
    git(f.dir, ['checkout', '-q', f.mainBranch]);
    fs.writeFileSync(path.join(f.dir, 'CHANGELOG.md'), 'unrelated main-line note\n');
    git(f.dir, ['add', '-A']);
    git(f.dir, ['commit', '-qm', 'main: concurrent unrelated note']);
    git(f.dir, ['merge', '-q', '--squash', 'work']);
    git(f.dir, ['commit', '-qm', 'squashed work']);
    finish(f.dir);
    const g = runGate(f.dir);
    chk('L2 a squash landing is rejected (the evidence source is no longer an ancestor)',
      g.code === 1 && /not an ancestor/.test(g.out),
      'exit=' + g.code + ' ' + (g.out.match(/witness content changed[^\n]*|not an ancestor[^\n]*/) || [''])[0]);
    fs.rmSync(f.dir, { recursive: true, force: true });
  }

  /* L3 — the registry may ride in a commit that also carries files the evidence
     does not depend on. Under the old rule this was illegal by construction;
     under lineage it is a non-event, and saying so is what retires OD-3. */
  {
    const dir = mkFixture('land-mixed');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'source: evidence produced here']);
    const sourceSha = git(dir, ['rev-parse', 'HEAD']);
    const reg = makeRegistry(sourceSha, dir);
    const w = WITNESS.buildWitness(dir, reg, sourceSha);
    reg.witness = w.witness;
    fs.writeFileSync(path.join(dir, 'docs/verification/VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
    fs.writeFileSync(path.join(dir, 'README.md'), 'unrelated documentation riding along\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'registry + unrelated docs in one commit']);
    const head = finish(dir);
    const changed = git(dir, ['diff', '--name-only', '--no-renames', sourceSha, head]).split('\n').filter(Boolean);
    const g = runGate(dir);
    chk('L3 a registry commit that also carries non-witnessed files is accepted (OD-3 retired)',
      changed.length === 2 && g.code === 0,
      'changed=' + JSON.stringify(changed) + ' exit=' + g.code + ' ' + (g.out.match(/FAIL V-02[^\n]*/) || [''])[0]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  /* L4 — but the same mixed commit is refused if the extra file IS witnessed:
     the rule is not "anything may ride along", it is "nothing the evidence
     depends on may change". */
  {
    const dir = mkFixture('land-mixed-witnessed');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'source: evidence produced here']);
    const sourceSha = git(dir, ['rev-parse', 'HEAD']);
    const reg = makeRegistry(sourceSha, dir);
    const w = WITNESS.buildWitness(dir, reg, sourceSha);
    reg.witness = w.witness;
    fs.writeFileSync(path.join(dir, 'docs/verification/VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
    fs.writeFileSync(path.join(dir, 'tests/witnessed-suite.js'), '// fixture witnessed suite v2 (changed)\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'registry + a changed witnessed suite']);
    finish(dir);
    const g = runGate(dir);
    chk('L4 the same commit is rejected when the extra file is witnessed (control for L3)',
      g.code === 1 && /stale evidence for\): tests\/witnessed-suite\.js/.test(g.out),
      'exit=' + g.code + ' ' + (g.out.match(/stale evidence[^\n]*/) || [''])[0]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ── 3. …and the reason it is not a weakening: a witnessed file changes ──── */
{
  const f = build('witness-changed', {
    later: (dir) => {
      fs.writeFileSync(path.join(dir, 'tests/witnessed-suite.js'), '// fixture witnessed suite v2 — behaviour changed\n');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'test: change the cited suite']);
    }
  });
  const g = runGate(f.dir);
  chk('C5 changing a witnessed test makes the evidence stale (rejected)',
    g.code !== 0 && failedNamed(g.out, 'V-02 registry binding valid (lineage mode)'),
    'exit=' + g.code);
  chk('C6 the rejection names the stale path', /witness content changed after the evidence commit/.test(g.out),
    (g.out.match(/witness content changed[^\n]*/) || ['(no detail)'])[0].slice(0, 120));
  const a = runAudit(f.dir);
  chk('C7 provenance audit agrees that the binding is invalid (exit 2)', a.code === 2, 'exit=' + a.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 4. witness tampering, in both directions ───────────────────────────── */
{
  const f = build('witness-shrunk', {
    afterWitness: (reg) => {
      reg.witness.paths = reg.witness.paths.filter((p) => !p.includes('witnessed-suite') && p !== 'tests/run.js');
      const keep = {};
      for (const p of reg.witness.paths) keep[p] = reg.witness.blobs[p];
      reg.witness.blobs = keep;
    }
  });
  const g = runGate(f.dir);
  chk('C8 a narrowed witness is rejected (scope cannot be shrunk after the fact)',
    g.code !== 0 && /must equal the set the registry implies; missing=/.test(g.out), 'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}
{
  const f = build('witness-extra', {
    afterWitness: (reg) => {
      reg.witness.paths = reg.witness.paths.concat(['tests/extra-unwitnessed.js']).sort();
      reg.witness.blobs['tests/extra-unwitnessed.js'] = '0'.repeat(40);
    }
  });
  const g = runGate(f.dir);
  chk('C9 an inflated witness is rejected', g.code !== 0 && /extra=/.test(g.out), 'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}
{
  const f = build('witness-forged', {
    afterWitness: (reg) => {
      const p = reg.witness.paths.find((x) => x === 'tests/witnessed-suite.js');
      reg.witness.blobs[p] = 'a'.repeat(40);
    }
  });
  const g = runGate(f.dir);
  chk('C10 a forged witness blob is rejected', g.code !== 0 && /witness blob does not match the evidence commit/.test(g.out), 'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 5. ancestry ────────────────────────────────────────────────────────── */
{
  const f = build('not-ancestor', {
    afterWitness: (reg, dir) => {
      /* a sibling commit on the same parent: it exists, it is a commit, but it is not
         an ancestor of the checkout */
      const parent = git(dir, ['rev-parse', 'HEAD']);
      const tree = git(dir, ['rev-parse', parent + '^{tree}']);
      const sibling = git(dir, ['commit-tree', tree, '-p', parent, '-m', 'sibling line']);
      reg.head_bound = sibling;
    }
  });
  const g = runGate(f.dir);
  chk('C11 a non-ancestor head_bound is rejected', g.code !== 0 && failedNamed(g.out, 'V-14 evidence SHA is a commit on this history line'),
    'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}
{
  const f = build('legacy-moved', {
    mutateReg: (reg) => { reg.binding_mode = 'legacy'; },
    afterWitness: (reg) => { reg.witness = { paths: [], blobs: {} }; },
    later: (dir) => {
      fs.writeFileSync(path.join(dir, 'docs/note.md'), 'unrelated\n');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'docs: later']);
    }
  });
  const g = runGate(f.dir);
  chk('C12 legacy mode keeps the old strict rule (a later commit invalidates it)',
    g.code !== 0 && failedNamed(g.out, 'V-02 registry binding valid (legacy mode)'), 'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 6. closure scope ───────────────────────────────────────────────────── */
const scopeCases = [
  { id: 'scope-blocked-member', label: 'V-19d blocked items are outside closure_scope', mutate: (reg) => { reg.blocked_items = 0; reg.items[0].blocked = true; reg.items[0].status = 'UNKNOWN'; reg.items[0].arena = { status: 'BLOCKED', evidence: reg.items[0].arena.evidence }; reg.closure_scope = ['VB-1']; } },
  { id: 'scope-off-scope-claim', label: 'V-19c no item claims a verifying status outside closure_scope', mutate: (reg) => { reg.closure_scope = []; reg.status = 'UNKNOWN'; } },
  { id: 'scope-empty-but-green', label: null, mutate: (reg) => {
    /* every item honestly unverified: no scope, no raised status, blocked ones counted */
    reg.closure_scope = []; reg.status = 'UNKNOWN'; reg.blocked_items = 2;
    for (const it of reg.items) { it.status = 'UNKNOWN'; it.blocked = true; it.blocked_reason = 'fixture: nothing verified yet'; it.owner_decision_required = true; it.arena = { status: 'BLOCKED', evidence: it.arena.evidence }; }
  }, expectVerdict: 'V-16' },
  { id: 'scope-blocked-count-lie', label: 'V-19e declared blocked_items count matches the registry', mutate: (reg) => { reg.blocked_items = 0; } },
  { id: 'scope-certified-blocked', label: 'V-15b a registry with blocked items cannot be CERTIFIED', mutate: (reg) => { reg.status = 'CERTIFIED'; reg.items[0].status = 'CERTIFIED'; } },
  { id: 'scope-weakest-headline', label: 'V-15 registry status is bounded by its weakest in-scope item', mutate: (reg) => { reg.closure_scope = ['VB-1', 'VB-2']; reg.status = 'RUNTIME_VERIFIED'; } }
];
for (const c of scopeCases) {
  const f = build(c.id, { mutateReg: c.mutate });
  const g = runGate(f.dir);
  if (c.label) chk('C-' + c.id + ' rejected by its named check', g.code !== 0 && failedNamed(g.out, c.label), 'exit=' + g.code);
  else chk('C-' + c.id + ' conforms but is never reported VERIFIED',
    g.code !== 0 && /CONTRACT PASS/.test(g.out) && /VERDICT NOT VERIFIED/.test(g.out) && /V-16/.test(g.out), 'exit=' + g.code);
  fs.rmSync(f.dir, { recursive: true, force: true });
}

/* ── 7. the two tools must not disagree (the reported defect) ────────────── */
{
  const ok = build('agree-ok');
  const gOk = runGate(ok.dir).code === 0;
  const aOk = runAudit(ok.dir).code === 0;
  chk('C13 gate and provenance audit agree on a valid registry', gOk && aOk, 'gate=' + gOk + ' audit=' + aOk);
  fs.rmSync(ok.dir, { recursive: true, force: true });

  const bad = build('agree-bad', {
    afterWitness: (reg) => { reg.closure_scope = ['VB-1', 'VB-2']; }
  });
  const gBad = runGate(bad.dir);
  const aBad = runAudit(bad.dir);
  chk('C14 gate and provenance audit agree on an invalid one (both reject)',
    gBad.code !== 0 && aBad.code !== 0 && /in-scope item below the verifying band/.test(aBad.out),
    'gate=' + gBad.code + ' audit=' + aBad.code);
  fs.rmSync(bad.dir, { recursive: true, force: true });
}

/* ── 8. mutation matrix: the rule must be able to fail ──────────────────────
       tools/lib/verification-witness.js is itself part of every witness set, so a
       weakened copy cannot be smuggled into a fixture through git — committing it would
       invalidate the very binding under test. The mutation is therefore applied to the
       module in-process: the real module and the weakened module are asked the same
       question about the same real fixture, and they must disagree. If they agree, the
       rule is not what is doing the work and the fixture proves nothing. */
{
  const src = fs.readFileSync(WITNESS_SRC, 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-mut-'));
  const scenarios = [
    {
      id: 'witness-changed',
      lib: 'if (atHead.blobs[p] !== atSource.blobs[p]) changedSinceSource.push(p);',
      weakened: '',
      later: (dir) => {
        fs.writeFileSync(path.join(dir, 'tests/witnessed-suite.js'), '// changed\n');
        git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'change witnessed test']);
      }
    },
    { id: 'witness-forged', lib: 'if (declaredBlobs[p] !== atSource.blobs[p]) {', weakened: 'if (false) {', tamper: (reg) => { reg.witness.blobs['tests/witnessed-suite.js'] = 'a'.repeat(40); } },
    { id: 'witness-shrunk', lib: 'if (JSON.stringify(sortedDeclared) !== JSON.stringify(computed)) {', weakened: 'if (false) {', tamper: (reg) => { reg.witness.paths = reg.witness.paths.filter((p) => p !== 'tests/run.js'); delete reg.witness.blobs['tests/run.js']; } },
    {
      id: 'not-ancestor',
      lib: 'else if (!anc.isAncestor) problems.push(',
      weakened: 'else if (false) problems.push(',
      tamper: (reg, dir) => {
        const parent = git(dir, ['rev-parse', 'HEAD']);
        const tree = git(dir, ['rev-parse', parent + '^{tree}']);
        reg.head_bound = git(dir, ['commit-tree', tree, '-p', parent, '-m', 'sibling line']);
      }
    }
  ];
  try {
    for (const sc of scenarios) {
      const n = src.split(sc.lib).length - 1;
      if (n !== 1) { chk('C15 ' + sc.id + ' mutation target unique', false, 'occurrences=' + n); continue; }
      const libPath = path.join(tmp, 'mut-' + sc.id + '.js');
      fs.writeFileSync(libPath, src.split(sc.lib).join(sc.weakened));
      const f = build('mut-' + sc.id, {
        afterWitness: sc.tamper ? (reg, dir) => sc.tamper(reg, dir) : undefined,
        later: sc.later
      });
      const reg = JSON.parse(fs.readFileSync(path.join(f.dir, 'docs/verification/VERIFICATION_REGISTRY.json'), 'utf8'));
      const real = WITNESS.verifyBinding(f.dir, reg, f.head, f.head, false);
      const weak = require(libPath).verifyBinding(f.dir, reg, f.head, f.head, false);
      chk('C15 ' + sc.id + ' the rule is what rejects it (real=false, weakened=true)',
        real.ok === false && weak.ok === true,
        'real=' + real.ok + ' weakened=' + weak.ok + ' why=' + (real.problems[0] || '').slice(0, 80));
      fs.rmSync(f.dir, { recursive: true, force: true });
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
}

console.log('CHECKS ' + checks + ' FAIL ' + fail);
if (fail) { console.log('BLOCKERS'); for (const f of failures) console.log(' - ' + f); }
process.exit(fail ? 1 : 0);
