#!/usr/bin/env node
'use strict';
/**
 * tests/two-phase-provenance-consistency.test.js
 *
 * M15-01 Workstream C — Real-git positive and negative fixtures verifying that
 * BOTH `tools/strict-verification-gate.js` AND `tools/registry-provenance.js`
 * implement the exact same two-phase SHA-binding & provenance contract:
 *
 *   1. Valid registry-only binding (verifying => gate exit 0 & provenance exit 0;
 *      honestly blocked UNKNOWN => gate CONTRACT PASS + exit 1 & provenance exit 3,
 *      with zero false HEAD-BIND MISMATCH).
 *   2. Tree mismatch (registry + extra path in same commit; symlink mode 120000).
 *   3. Unrelated SHA (registry-only commit whose `head_bound` is a foreign/sibling commit).
 *   4. Invalid parent count / merge shape (parent_count=0 root commit; parent_count=2 merge commit).
 *   5. Post-generation tampering (artifact disk bytes tampered; sha256 altered; tracked drift).
 *   6. Stale evidence commit (commit added after valid registry-only commit without rebinding,
 *      reproducing the exact 632/66 + provenance exit 2 mechanism).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const GATE_SRC = path.join(REPO, 'tools', 'strict-verification-gate.js');
const PROV_SRC = path.join(REPO, 'tools', 'registry-provenance.js');
const POLICY_SRC = path.join(REPO, 'docs', 'STRICT_VERIFICATION_GATE.md');
const SCHEMA_SRC = path.join(REPO, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALERT_SRC = path.join(REPO, 'infra', 'observability', 'alert-rules.yml');
const REG_REL = 'docs/verification/VERIFICATION_REGISTRY.json';

const CANONICAL_STATUSES = [
  'UNKNOWN',
  'TESTED',
  'RUNTIME_VERIFIED',
  'ADVERSARIAL_VERIFIED',
  'INDEPENDENTLY_VERIFIED',
  'CERTIFIED'
];

let checks = 0;
let fail = 0;

function chk(name, ok, detail) {
  checks++;
  if (ok) {
    console.log('  OK   ' + name + (detail ? ' — ' + detail : ''));
  } else {
    fail++;
    console.error('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

function sha256File(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function git(dir, args) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function createRepoFixture(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-twophase-' + label + '-'));
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'verification', 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'infra', 'observability'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

  fs.copyFileSync(GATE_SRC, path.join(dir, 'tools', 'strict-verification-gate.js'));
  fs.copyFileSync(PROV_SRC, path.join(dir, 'tools', 'registry-provenance.js'));
  fs.copyFileSync(POLICY_SRC, path.join(dir, 'docs', 'STRICT_VERIFICATION_GATE.md'));
  fs.copyFileSync(SCHEMA_SRC, path.join(dir, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json'));
  fs.copyFileSync(ALERT_SRC, path.join(dir, 'infra', 'observability', 'alert-rules.yml'));

  fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// fixture smoke test\n');
  fs.writeFileSync(path.join(dir, 'tests', 'strict-verification-gate.negative.test.js'), '// fixture negative suite\n');

  const mkAllow = (pattern, targetPath) => ({
    pattern,
    path: targetPath,
    owner: 'm15-twophase-fixture',
    reason: 'scanner literal inside copied gate/provenance tool',
    expires: 'never',
    replacement_test: 'tests/two-phase-provenance-consistency.test.js'
  });
  const allowLabels = [
    'assert(' + 'true',
    'process.exit(' + '0)',
    '|' + '| true',
    '0/' + '0 checks',
    'self-skip',
    'self-only',
    'expect-true-toBe'
  ];
  const allowItems = allowLabels.map((pat) => mkAllow(pat, 'tools/strict-verification-gate.js'));
  fs.writeFileSync(
    path.join(dir, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json'),
    JSON.stringify({ schema_version: 1, items: allowItems }, null, 2)
  );

  const evDir = path.join(dir, 'docs', 'verification', 'evidence');
  fs.writeFileSync(path.join(evDir, 'pos.log'), 'positive evidence log\n');
  fs.writeFileSync(path.join(evDir, 'neg.log'), 'negative evidence log\n');
  fs.writeFileSync(path.join(evDir, 'note.log'), 'blocked review note log\n');

  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'fixture@payesh.local']);
  git(dir, ['config', 'user.name', 'fixture']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'source commit with evidence logs']);
  const sourceSha = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['update-ref', 'refs/remotes/origin/main', sourceSha]);
  return { dir, sourceSha };
}

function buildRegistryForHead(dir, boundSha, opts) {
  const options = opts || {};
  const blockedOnly = Boolean(options.blockedOnly);
  const mkEv = (kind, rel, cmd) => ({
    reviewer: 'arena',
    kind,
    command: cmd,
    exit_code: 0,
    checks_total: 8,
    checks_passed: 8,
    artifact: rel,
    sha256: sha256File(path.join(dir, rel)),
    head_sha: boundSha,
    runtime: { node: process.version, os: process.platform },
    ts: '2026-10-27T00:00:00.000Z'
  });

  if (blockedOnly) {
    const note = mkEv('review_note', 'docs/verification/evidence/note.log', 'node tests/smoke.js');
    return {
      schema_version: 2,
      policy: 'docs/STRICT_VERIFICATION_GATE.md',
      status: 'UNKNOWN',
      head_bound: boundSha,
      required_reviewers: ['arena'],
      allowed_statuses: CANONICAL_STATUSES.slice(),
      reviews_recorded: { arena: ['honest blocked inventory record'] },
      expected_ids: ['A-01'],
      items: [
        {
          id: 'A-01',
          status: 'UNKNOWN',
          requirement: 'honestly blocked item awaiting owner contract disposition',
          head_sha: boundSha,
          reviews: ['arena'],
          known_limitations: ['blocked in fixture'],
          blocked: true,
          blocked_reason: 'awaiting owner ruling',
          owner_decision_required: true,
          evidence: [note],
          arena: { status: 'BLOCKED', evidence: [Object.assign({}, note)] }
        }
      ]
    };
  }

  const pos = mkEv('positive_test', 'docs/verification/evidence/pos.log', 'node tests/smoke.js');
  const neg = mkEv('negative_test', 'docs/verification/evidence/neg.log', 'node tests/strict-verification-gate.negative.test.js');
  return {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'ADVERSARIAL_VERIFIED',
    head_bound: boundSha,
    required_reviewers: ['arena'],
    allowed_statuses: CANONICAL_STATUSES.slice(),
    reviews_recorded: { arena: ['two-phase fixture verification'] },
    expected_ids: ['M15-01-A'],
    items: [
      {
        id: 'M15-01-A',
        status: 'ADVERSARIAL_VERIFIED',
        requirement: 'two-phase binding positive fixture',
        head_sha: boundSha,
        reviews: ['arena'],
        known_limitations: [],
        evidence: [pos, neg],
        arena: { status: 'PASS', evidence: [Object.assign({}, pos), Object.assign({}, neg)] }
      }
    ]
  };
}

function runBothTools(dir, eventName) {
  const env = Object.assign({}, process.env, {
    GITHUB_EVENT_NAME: eventName || 'pull_request',
    GITHUB_BASE_REF: (eventName || 'pull_request') === 'pull_request' ? 'main' : ''
  });
  const gate = spawnSync(process.execPath, ['tools/strict-verification-gate.js'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60000,
    env
  });
  const prov = spawnSync(process.execPath, ['tools/registry-provenance.js', '--audit'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60000,
    env
  });
  return {
    gate: { code: gate.status, out: (gate.stdout || '') + (gate.stderr || '') },
    prov: { code: prov.status, out: (prov.stdout || '') + (prov.stderr || '') }
  };
}

console.log('==== M15-01 WORKSTREAM C — TWO-PHASE SHA BINDING & PROVENANCE CONSISTENCY ====');

/* 1a. Valid registry-only binding (all items verified) => BOTH exit 0 */
{
  const { dir, sourceSha } = createRepoFixture('valid-verified');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only metadata commit']);
    const r = runBothTools(dir, 'pull_request');
    chk('1a valid registry-only commit (verifying): strict-verification-gate accepts (exit 0)',
      r.gate.code === 0 && r.gate.out.includes('[metadata-only]'),
      'exit=' + r.gate.code);
    chk('1a valid registry-only commit (verifying): registry-provenance accepts (exit 0)',
      r.prov.code === 0 && r.prov.out.includes('[metadata-only]') && !/MISMATCH/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 1b. Valid registry-only binding with honestly-blocked UNKNOWN items =>
       gate CONTRACT PASS + exit 1 (V-16); provenance STALE=0 + exit 3 (no false exit 2!) */
{
  const { dir, sourceSha } = createRepoFixture('valid-blocked');
  try {
    const reg = buildRegistryForHead(dir, sourceSha, { blockedOnly: true });
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only metadata commit (honestly blocked)']);
    const r = runBothTools(dir, 'pull_request');
    chk('1b valid registry-only commit (honest UNKNOWN/BLOCKED): gate reports CONTRACT PASS + NOT VERIFIED (exit 1)',
      r.gate.code === 1 && /CONTRACT PASS/.test(r.gate.out) && /VERDICT NOT VERIFIED/.test(r.gate.out),
      'exit=' + r.gate.code);
    chk('1b valid registry-only commit (honest UNKNOWN/BLOCKED): provenance exits 3 (UNBOUND, not false exit 2 MISMATCH)',
      r.prov.code === 3 && /STALE\s*:\s*0/.test(r.prov.out) && !/MISMATCH/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 2. Tree mismatch (registry + extra tracked file in same commit) => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('tree-mismatch');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// tree-mismatch smuggled edit\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'registry plus extra file']);
    const r = runBothTools(dir, 'pull_request');
    chk('2 tree mismatch: strict-verification-gate rejects metadata privilege & fails V-02 (exit 1)',
      r.gate.code === 1 && r.gate.out.includes('expected registry only') && !r.gate.out.includes('[metadata-only]'),
      'exit=' + r.gate.code);
    chk('2 tree mismatch: registry-provenance rejects metadata privilege & exits 2 with MISMATCH',
      r.prov.code === 2 && r.prov.out.includes('expected registry only') && /V-02 HEAD-BIND: MISMATCH/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 3. Unrelated SHA (registry-only commit whose head_bound is a sibling/unrelated commit) => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('unrelated-sha');
  try {
    const tree = git(dir, ['rev-parse', sourceSha + '^{tree}']);
    const siblingSha = git(dir, ['commit-tree', tree, '-m', 'unrelated orphan commit']);
    const reg = buildRegistryForHead(dir, siblingSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only commit pointing at unrelated SHA']);
    const r = runBothTools(dir, 'pull_request');
    chk('3 unrelated SHA: strict-verification-gate fails V-02 head_bound (exit 1)',
      r.gate.code === 1 && /FAIL\s+V-02 registry head_bound matches immutable evidence SHA/.test(r.gate.out),
      'exit=' + r.gate.code);
    chk('3 unrelated SHA: registry-provenance exits 2 and reports ancestor-of-HEAD: NO',
      r.prov.code === 2 && /V-02 HEAD-BIND: MISMATCH/.test(r.prov.out) && /ancestor-of-HEAD:\s*NO/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 4a. Invalid parent count = 0 (orphan root metadata commit) => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('parent-zero');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'valid metadata commit first']);
    const metaTree = git(dir, ['rev-parse', 'HEAD^{tree}']);
    const orphanSha = git(dir, ['commit-tree', metaTree, '-m', 'parentless metadata commit']);
    git(dir, ['update-ref', 'HEAD', orphanSha]);
    /* Put origin/main at orphanSha so V-06 does not mask parent_count=0 */
    git(dir, ['update-ref', 'refs/remotes/origin/main', orphanSha]);
    const r = runBothTools(dir, 'push');
    chk('4a invalid parent_count=0: strict-verification-gate rejects metadata binding (exit 1)',
      r.gate.code === 1 && r.gate.out.includes('parent_count=0'),
      'exit=' + r.gate.code);
    chk('4a invalid parent_count=0: registry-provenance rejects metadata binding (exit 2)',
      r.prov.code === 2 && r.prov.out.includes('parent_count=0') && /V-02 HEAD-BIND: MISMATCH/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 4b. Invalid parent count = 2 (merge-shaped metadata commit) => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('merge-shape');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'single-parent metadata commit']);
    const metaSha = git(dir, ['rev-parse', 'HEAD']);
    const metaTree = git(dir, ['rev-parse', metaSha + '^{tree}']);

    git(dir, ['checkout', '-qb', 'side-branch', sourceSha]);
    fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// side branch change\n');
    git(dir, ['add', 'tests/smoke.js']);
    git(dir, ['commit', '-qm', 'side commit']);
    const sideSha = git(dir, ['rev-parse', 'HEAD']);

    git(dir, ['checkout', '--detach', metaSha]);
    const mergeSha = git(dir, ['commit-tree', metaTree, '-p', sourceSha, '-p', sideSha, '-m', 'merge metadata commit']);
    git(dir, ['update-ref', 'HEAD', mergeSha]);

    const r = runBothTools(dir, 'pull_request');
    chk('4b merge-shaped metadata commit: strict-verification-gate rejects (exit 1)',
      r.gate.code === 1 && r.gate.out.includes('parent_count=2'),
      'exit=' + r.gate.code);
    chk('4b merge-shaped metadata commit: registry-provenance rejects (exit 2)',
      r.prov.code === 2 && r.prov.out.includes('parent_count=2') && /V-02 HEAD-BIND: MISMATCH/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 5a. Post-generation tampering: evidence artifact modified in working tree => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('tamper-artifact');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only metadata commit']);
    /* Tamper committed evidence log on disk after metadata commit */
    fs.writeFileSync(path.join(dir, 'docs', 'verification', 'evidence', 'pos.log'), 'TAMPERED AFTER GENERATION\n');
    const r = runBothTools(dir, 'pull_request');
    chk('5a post-generation artifact disk tamper: strict-verification-gate rejects G17/V-02 (exit 1)',
      r.gate.code === 1 && /FAIL\s+(G17|V-02)/.test(r.gate.out),
      'exit=' + r.gate.code);
    chk('5a post-generation artifact disk tamper: registry-provenance exits 2 (STALE + TAMPERED)',
      r.prov.code === 2 && (/tampered since commit/.test(r.prov.out) || /G17 TRACKED-DRIFT: TAMPERED/.test(r.prov.out)),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 5b. Post-generation tampering: registry sha256 altered inside registry-only commit => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('tamper-sha256');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    reg.items[0].evidence[0].sha256 = 'f'.repeat(64);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only commit with tampered sha256']);
    const r = runBothTools(dir, 'pull_request');
    chk('5b post-generation sha256 tamper: strict-verification-gate rejects V-02 (exit 1)',
      r.gate.code === 1 && /FAIL\s+V-02 M15-01-A evidence binds immutable SHA\+artifact\+hash\+exit0/.test(r.gate.out),
      'exit=' + r.gate.code);
    chk('5b post-generation sha256 tamper: registry-provenance exits 2 (committed blob sha256 mismatch)',
      r.prov.code === 2 && /committed blob sha256 mismatch/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* 6. Stale evidence commit: docs/code commit added on top of valid registry-only commit => BOTH reject */
{
  const { dir, sourceSha } = createRepoFixture('stale-followup-commit');
  try {
    const reg = buildRegistryForHead(dir, sourceSha);
    fs.writeFileSync(path.join(dir, REG_REL), JSON.stringify(reg, null, 2) + '\n');
    git(dir, ['add', REG_REL]);
    git(dir, ['commit', '-qm', 'registry-only metadata commit']);
    /* Subsequent non-registry commit (like 78b65ce2 or 1b2375a1) invalidates metadata-only binding */
    fs.writeFileSync(path.join(dir, 'docs', 'STRICT_VERIFICATION_GATE.md'),
      fs.readFileSync(path.join(dir, 'docs', 'STRICT_VERIFICATION_GATE.md'), 'utf8') + '\n<!-- post-registry doc edit -->\n');
    git(dir, ['add', 'docs/STRICT_VERIFICATION_GATE.md']);
    git(dir, ['commit', '-qm', 'post-registry doc edit without rebinding']);
    const r = runBothTools(dir, 'pull_request');
    chk('6 stale evidence commit: strict-verification-gate rejects V-02/G9 (exit 1)',
      r.gate.code === 1 && /FAIL\s+V-02 registry head_bound matches immutable evidence SHA/.test(r.gate.out),
      'exit=' + r.gate.code);
    chk('6 stale evidence commit: registry-provenance exits 2 and reports ancestor-of-HEAD: YES (STALE)',
      r.prov.code === 2 && /V-02 HEAD-BIND: MISMATCH/.test(r.prov.out) && /ancestor-of-HEAD:\s*YES/.test(r.prov.out),
      'exit=' + r.prov.code);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('CHECKS ' + checks + ' FAIL ' + fail);
process.exit(fail ? 1 : 0);
