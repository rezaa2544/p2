#!/usr/bin/env node
/**
 * tests/strict-verification-gate.negative.test.js
 * A-30 — V-01..V-12 adversarial fixtures for the Strict Verification Gate.
 *
 * هر کیس یک registry/درختِ ساختگی می‌سازد که Gateِ اصلی آن را می‌پذیرفت
 * (exit 0 = defect). این تست انتظار دارد Gateِ hardening‌شده همان exploit را
 * رد کند (exit 1 + نامِ check). کیس GOOD کنترل است: اگر Gateِ اصلاح‌شده
 * حتی registry سالم را رد کند، تست قرمز می‌شود (مانعِ «همیشه fail» شدن).
 *
 * اجرا: node tests/strict-verification-gate.negative.test.js
 * خروجی: per-case ACCEPTED/REJECTED + summary؛ exit 1 اگر exploitی پذیرفته شود.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
/* A30_GATE_SRC / A30_ONLY exist so a caller can run ONE fixture against a
   deliberately weakened copy of the gate (tests/m15-01-registry-strict-verification.test.js
   uses this to prove the fixtures are not vacuous). Defaults are unchanged. */
const GATE_SRC = process.env.A30_GATE_SRC
  ? path.resolve(process.env.A30_GATE_SRC)
  : path.join(REPO, 'tools', 'strict-verification-gate.js');
const ONLY = (process.env.A30_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
const POLICY_SRC = path.join(REPO, 'docs', 'STRICT_VERIFICATION_GATE.md');
const SCHEMA_SRC = path.join(REPO, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALERT_SRC = path.join(REPO, 'infra', 'observability', 'alert-rules.yml');

const CANONICAL_STATUSES = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'];
/* ── reviewer contract (M15-01) ───────────────────────────────────────────
   The operating model is Arena-only (docs/STRICT_VERIFICATION_GATE.md); the retired
   trio (chatgpt/arena/atria) is gone from the contract, so these fixtures must speak
   the current contract — otherwise every case would "pass" for the wrong reason (G5
   failing on the fixture's own required_reviewers instead of the exploit under test).
   The list is read from the pinned evidence schema — the same file the gate validates
   its own contract against (V-12) — so fixtures and contract cannot drift apart again. */
function reviewerContract() {
  let schema;
  try { schema = JSON.parse(fs.readFileSync(SCHEMA_SRC, 'utf8')); } catch (e) { schema = null; }
  if (!schema || !Array.isArray(schema.reviewers) || schema.reviewers.length === 0) {
    throw new Error('VERIFICATION_EVIDENCE_SCHEMA.json: reviewers[] is missing — cannot build fixtures');
  }
  return schema.reviewers.map(String);
}
const TRIO = reviewerContract();
/* Cases that assert pairwise cross-reviewer independence are only meaningful when the
   contract declares more than one reviewer; they re-activate automatically if it widens. */
const MULTI_REVIEWER = TRIO.length >= 2;

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let pass = 0, fail = 0;
const failures = [];
function rec(id, ok, detail) {
  if (ok) { pass++; console.log('  OK   ' + id + (detail ? ' — ' + detail : '')); }
  else { fail++; failures.push(id + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
}

/* ── evidence builder (schema-valid, distinct per reviewer) ─────────────── */
function mkEvidence(reviewer, kind, head, opts, fixtureDir) {
  opts = opts || {};
  const artifact = opts.artifact || ('docs/verification/evidence/a30-' + reviewer + '-' + kind + '.log');
  let hash = opts.sha256;
  if (!hash && fixtureDir) {
    const abs = path.join(fixtureDir, artifact);
    hash = fs.existsSync(abs) ? sha256(abs) : 'e'.repeat(64);
  }
  return {
    reviewer,
    kind,
    command: opts.command || ('node tests/smoke.js --reviewer ' + reviewer),
    exit_code: opts.exit_code !== undefined ? opts.exit_code : 0,
    checks_total: opts.checks_total !== undefined ? opts.checks_total : 12,
    checks_passed: opts.checks_passed !== undefined ? opts.checks_passed : 12,
    artifact,
    sha256: hash || 'e'.repeat(64),
    head_sha: opts.head_sha !== undefined ? opts.head_sha : head,
    runtime: opts.runtime || { node: 'v22.14.0', os: 'linux' },
    ts: opts.ts || '2026-09-25T10:00:00.000Z'
  };
}

/* ── GOOD registry: satisfies every hardening check ─────────────────────── */
function goodRegistry(head, mutate, fixtureDir) {
  const evidenceByReviewer = {};
  for (const r of TRIO) {
    evidenceByReviewer[r] = [
      mkEvidence(r, 'positive_test', head, { command: 'node tests/smoke.js --reviewer ' + r }, fixtureDir),
      mkEvidence(r, 'negative_test', head, {
        command: 'node tests/strict-verification-gate.negative.test.js --reviewer ' + r
      }, fixtureDir),
      mkEvidence(r, 'runtime_evidence', head, {
        command: 'node tools/strict-verification-gate.js --reviewer ' + r
      }, fixtureDir)
    ];
  }
  const reg = {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'ADVERSARIAL_VERIFIED',
    head_bound: head,
    required_reviewers: TRIO.slice(),
    allowed_statuses: CANONICAL_STATUSES.slice(),
    reviews_recorded: {
      arena: ['A-30 adversarial runtime run']
    },
    human_governance: {
      requires_human_approval: true,
      human_approved: true,
      approver: 'release-owner-human',
      decided_at: '2026-09-25T10:30:00.000Z',
      head_sha: head
    },
    false_green_blockers_on_head: [],
    items: [
      {
        id: 'A-30-DEMO',
        status: 'ADVERSARIAL_VERIFIED',
        requirement: 'Strict Verification Gate rejects V-01..V-12 registry exploits',
        head_sha: head,
        reviews: TRIO.slice(),
        known_limitations: ['fixtures only; full registry rebuild happens in A-38'],
        evidence: [
          mkEvidence('arena', 'positive_test', head, { command: 'node tests/strict-verification-gate.negative.test.js' }, fixtureDir),
          mkEvidence('arena', 'negative_test', head, { command: 'node tests/strict-verification-gate.negative.test.js --adversarial' }, fixtureDir),
          mkEvidence('arena', 'runtime_evidence', head, { command: 'node tools/strict-verification-gate.js' }, fixtureDir)
        ],
        arena: { status: 'PASS', evidence: evidenceByReviewer.arena }
      }
    ]
  };
  if (mutate) mutate(reg, fixtureDir);
  return reg;
}

/* ── fixture tree ───────────────────────────────────────────────────────── */
function mkFixture(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a30-' + name + '-'));
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs', 'verification', 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'infra', 'observability'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.copyFileSync(GATE_SRC, path.join(dir, 'tools', 'strict-verification-gate.js'));
  /* G15b: the commands GOOD evidence cites must exist inside the fixture repo */
  fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// a30 fixture smoke stub\n');
  fs.writeFileSync(path.join(dir, 'tests', 'strict-verification-gate.negative.test.js'),
    '// a30 fixture negative-suite stub\n');
  fs.copyFileSync(POLICY_SRC, path.join(dir, 'docs', 'STRICT_VERIFICATION_GATE.md'));
  if (fs.existsSync(SCHEMA_SRC)) fs.copyFileSync(SCHEMA_SRC, path.join(dir, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json'));
  if (fs.existsSync(ALERT_SRC)) fs.copyFileSync(ALERT_SRC, path.join(dir, 'infra', 'observability', 'alert-rules.yml'));
  else fs.writeFileSync(path.join(dir, 'infra', 'observability', 'alert-rules.yml'), 'groups: []\n');
  /* allowlist covers the gate's own scanner-pattern literals (self-reference
     resolves through approved-label suppression); full owner/reason/expiry so
     the hardened allowlist validation also passes. */
  const SELF = 'tools/strict-verification-gate.js';
  const mk = (pattern) => ({
    pattern, path: SELF,
    owner: 'a30-fixture',
    reason: 'gate source embeds its own scanner pattern literals',
    expires: 'never',
    replacement_test: 'tests/strict-verification-gate.negative.test.js'
  });
  const allow = {
    schema_version: 1,
    items: ['assert(true', 'process.exit(0)', '|| true', '0/0 checks', 'self-skip', 'self-only', 'expect-true-toBe'].map(mk)
  };
  fs.writeFileSync(path.join(dir, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json'), JSON.stringify(allow, null, 2));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'a30@test.local']);
  git(dir, ['config', 'user.name', 'a30-negative']);
  git(dir, ['commit', '-qm', 'init', '--allow-empty']); /* parent commit so V-06 can point origin/main at HEAD~1 */
  return dir;
}

/* evidence artifacts referenced by the GOOD registry (committed before HEAD read) */
function writeArtifacts(dir) {
  const evDir = path.join(dir, 'docs', 'verification', 'evidence');
  for (const r of TRIO) {
    for (const k of ['positive_test', 'negative_test', 'runtime_evidence', 'review_note']) {
      fs.writeFileSync(path.join(evDir, 'a30-' + r + '-' + k + '.log'), 'A-30 fixture evidence ' + r + ' ' + k + '\n');
    }
  }
}

const PLACEHOLDER = 'a'.repeat(40); /* rewritten to the real HEAD; forged values (V-02*) survive */
function finishFixture(dir, reg) {
  /* G14a contract: declare every item id the fixture registry intends to ship
     (V-01's emptied registry then fails G14a as well — fail-closed stays red). */
  reg.expected_ids = Array.isArray(reg.items) ? reg.items.map((x) => String((x && x.id) || '')) : [];
  fs.writeFileSync(path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'a30 fixture']);
  const head = git(dir, ['rev-parse', 'HEAD']);
  /* default: origin/main == HEAD (same line). rewrite PLACEHOLDER head fields
     in the WORKING TREE (no new commit → HEAD stable); forged heads stay forged. */
  if (reg.head_bound === PLACEHOLDER) reg.head_bound = head;
  if (reg.human_governance && reg.human_governance.head_sha === PLACEHOLDER) reg.human_governance.head_sha = head;
  const fix = (e) => { if (e && typeof e === 'object' && e.head_sha === PLACEHOLDER) e.head_sha = head; return e; };
  for (const it of (reg.items || [])) {
    if (it.head_sha === PLACEHOLDER) it.head_sha = head;
    if (Array.isArray(it.evidence)) it.evidence = it.evidence.map(fix);
    for (const r of TRIO) if (it[r] && Array.isArray(it[r].evidence)) it[r].evidence = it[r].evidence.map(fix);
  }
  fs.writeFileSync(path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
  git(dir, ['update-ref', 'refs/remotes/origin/main', head]);
  return head;
}

function runGate(dir, eventName) {
  const r = spawnSync(process.execPath, ['tools/strict-verification-gate.js'], {
    cwd: dir, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, GITHUB_EVENT_NAME: eventName || 'push', GITHUB_BASE_REF: eventName === 'pull_request' ? 'main' : '' }
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ── cases ──────────────────────────────────────────────────────────────── */
const cases = [];
function addCase(id, expectFail, description, mutate, extra) {
  cases.push({ id, expectFail, description, mutate, extra });
}

/* V-01: empty / missing items registry is accepted today */
addCase('V-01', 'V-01', 'registry with zero items', (r) => { r.items = []; });
addCase('V-01b', 'V-01', 'registry without items key', (r) => { delete r.items; });

/* V-02: evidence not bound to head/artifact/hash */
addCase('V-02', 'V-02', 'evidence head_sha forged (not gate head)', (r) => {
  r.items[0].evidence[0].head_sha = '0'.repeat(40);
});
addCase('V-02b', 'V-02', 'evidence sha256 does not match artifact bytes', (r) => {
  r.items[0].arena.evidence[1].sha256 = 'f'.repeat(64);
});
addCase('V-02c', 'V-02', 'registry head_bound mismatches HEAD', (r) => { r.head_bound = 'dead'.repeat(10); });

/* V-03: under the Arena-only model there is one reviewer slot, so the
   pairwise-distinct check is structurally vacuous. What must NOT be possible is
   re-injecting a retired reviewer slot to manufacture the appearance of an
   independent second opinion — that is now caught by the slot contract (V-12)
   and by V-18 (a one-slot contract cannot reach INDEPENDENTLY_VERIFIED/CERTIFIED). Human
   corroboration is NOT a substitute and is no longer required: the owner ruling of
   2026-10-27 retired V-10, so an absent or unapproved human_governance block is inert. */
addCase('V-03', 'V-12', 'retired reviewer slots resurrected to look independent', (r) => {
  const clone = JSON.parse(JSON.stringify(r.items[0].arena.evidence[0]));
  r.items[0].chatgpt = { status: 'PASS', evidence: [{ ...clone, reviewer: 'chatgpt' }] };
  r.items[0].atria = { status: 'PASS', evidence: [{ ...clone, reviewer: 'atria' }] };
  r.items[0].reviews = ['chatgpt', 'arena', 'atria'];
  r.items[0].status = 'INDEPENDENTLY_VERIFIED';
});
/* V-03b (independence claimed with no human decision behind it, asserted against V-10) was
   REMOVED with the retired check. The claim it guarded against is still refused — by V-18,
   whose own case sits next to the status-cap block below — and refusing it no longer depends
   on a human signature existing or being fabricated. */

/* V-04: status machine not enforced */
addCase('V-04', 'V-04', 'item status outside allowed_statuses', (r) => {
  r.items[0].status = 'GREENWASHED';
});
addCase('V-04b', 'V-04', 'registry allowed_statuses tampered to shrink policy', (r) => {
  r.allowed_statuses = ['CERTIFIED'];
});

/* V-05: top-level BLOCKED ignored */
addCase('V-05', 'V-05', 'top-level BLOCKED_UNTIL status while items look green', (r) => {
  r.status = 'BLOCKED_UNTIL_THREE_AI_AGREEMENT';
});

addCase('V-05b', 'V-05', 'top-level status invented (not in machine, not BLOCKED)', (r) => {
  r.status = 'VERIFIED_MADE_UP';
});

/* V-06: local-only HEAD binding — handled in extra (needs divergent origin) */
addCase('V-06', 'V-06', 'HEAD not contained in origin/main (unpushed local line)', null, { divergentOrigin: true });

addCase('V-06b', 'V-06', 'origin/main ref missing (cannot prove remote binding)', null, { noOrigin: true });

/* V-07: scanner misses shell false-greens */
addCase('V-07', 'G7 || true has no unapproved hits', 'false-green || true hidden in a .sh test', null, { addFile: { path: 'tests/fake-green.sh', content: '#!/bin/sh\ncmd_volatile || true\necho "all good"\n' } });

/* V-08: certification evidence solely from self-attesting module */
addCase('V-08', 'V-08', 'all evidence commands run the self-certification module', (r) => {
  const cmd = 'node server/analytics/intelligence-release-certification.js';
  const it = r.items[0];
  for (const e of it.evidence) e.command = cmd;
  for (const rev of TRIO) for (const e of it[rev].evidence) e.command = cmd;
});

/* V-09: injected reviewer PASS without recorded corroboration */
addCase('V-09', 'V-09', 'reviewer PASS claims while reviews_recorded is empty', (r) => {
  r.reviews_recorded = { arena: [] };
});
addCase('V-09b', 'V-09', 'item.reviews omits the reviewer that claims PASS', (r) => {
  r.items[0].reviews = [];
});

/* V-11: vacuous zero-check compliance / no adversarial evidence */
addCase('V-11', 'V-11', 'evidence claims 0/0 checks (vacuous pass)', (r) => {
  for (const e of r.items[0].evidence) { e.checks_total = 0; e.checks_passed = 0; }
});
addCase('V-11b', 'V-11', 'item has no negative/adversarial evidence (empty compliance)', (r) => {
  const it = r.items[0];
  it.evidence = it.evidence.filter((e) => e.kind === 'positive_test' || e.kind === 'runtime_evidence');
  for (const rev of TRIO) {
    it[rev].evidence = it[rev].evidence.filter((e) => e.kind === 'positive_test' || e.kind === 'runtime_evidence');
  }
});

/* V-12: weak/missing schema on registry/item/evidence */
addCase('V-12', 'V-12', 'evidence entries are bare strings (no schema)', (r) => {
  r.items[0].evidence = ['looks fine', 'trust me'];
  for (const rev of TRIO) r.items[0][rev].evidence = ['ok'];
});
addCase('V-12b', 'V-12', 'registry missing schema keys (no policy/status/allowed_statuses)', (r) => {
  delete r.policy; delete r.allowed_statuses; delete r.reviews_recorded;
});

addCase('V-12c', 'V-12', 'schema file weakened (evidence keys stripped) — pinned contract must notice', null, { tamperSchema: true });


/* ── M15-01 addendum: stale / uncommitted / failing evidence must not bind ── */
addCase('V-02d', 'V-02', 'artifact bytes edited after the evidence commit (stale artifact)', null, {
  afterFinish: (dir) => {
    const rel = 'docs/verification/evidence/a30-arena-positive_test.log';
    fs.writeFileSync(path.join(dir, rel), 'A-30 fixture evidence arena positive_test EDITED AFTER COMMIT\n');
    git(dir, ['add', rel]);
    git(dir, ['commit', '-qm', 'artifact edited after the evidence was filed']);
  }
});
addCase('V-02e', 'V-02', 'artifact never committed (hash covers uncommitted bytes)', null, {
  afterFinish: (dir) => {
    fs.writeFileSync(path.join(dir, 'docs', 'verification', 'evidence', 'uncommitted.log'), 'never committed\n');
    const regPath = path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const e = reg.items[0].arena.evidence[0];
    e.artifact = 'docs/verification/evidence/uncommitted.log';
    e.sha256 = sha256(path.join(dir, 'docs', 'verification', 'evidence', 'uncommitted.log'));
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  }
});
addCase('V-02f', 'V-02', 'evidence records a failing run (exit_code 1)', (r) => {
  r.items[0].evidence[0].exit_code = 1;
});
addCase('V-02g', 'V-02', 'evidence records 9 of 12 checks passing', (r) => {
  r.items[0].evidence[1].checks_passed = 9;
});

/* ── M15-01 addendum: item inventory (missing / duplicate / unknown) ─────── */
addCase('G14c', 'G14c', 'an item rides along without being declared in expected_ids', null, {
  afterFinish: (dir) => {
    const regPath = path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const clone = JSON.parse(JSON.stringify(reg.items[0]));
    clone.id = 'A-30-SMUGGLED';
    reg.items.push(clone);
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  }
});
addCase('G14d', 'G14d', 'expected_ids declares the same id twice', null, {
  afterFinish: (dir) => {
    const regPath = path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.expected_ids.push(reg.expected_ids[0]);
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  }
});
addCase('G8-dup', 'G8', 'duplicate item id in the registry', null, {
  afterFinish: (dir) => {
    const regPath = path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.items.push(JSON.parse(JSON.stringify(reg.items[0])));
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  }
});

/* ── M15-01 addendum: BLOCKED / NOT VERIFIED may not be dressed as CERTIFIED ── */
addCase('V-13a', 'V-13', 'a blocked item keeps a verifying status', (r) => {
  const it = r.items[0];
  it.blocked = true; it.blocked_reason = 'needs owner decision'; it.owner_decision_required = true;
});
addCase('V-13b', 'V-13', 'blocked item without a reason and without owner flag', (r) => {
  const it = r.items[0];
  it.status = 'UNKNOWN'; it.blocked = true;
  it.arena.status = 'BLOCKED';
});
addCase('V-13c', 'V-13', 'BLOCKED verdict recorded next to a verifying status', (r) => {
  r.items[0].arena.status = 'BLOCKED';
});
addCase('V-15', 'V-15', 'registry headline out-claims its items', (r) => {
  r.status = 'CERTIFIED';
});
addCase('V-15b', 'V-15b', 'blocked item buried under a green registry headline', (r, fixtureDir) => {
  const it = r.items[0];
  it.status = 'UNKNOWN'; it.blocked = true; it.blocked_reason = 'owner decision pending';
  it.owner_decision_required = true; it.arena.status = 'BLOCKED';
  it.evidence = [mkEvidence('arena', 'review_note', r.head_bound, { checks_total: 1, checks_passed: 1 }, fixtureDir)];
  r.status = 'ADVERSARIAL_VERIFIED';
});
addCase('V-09d', 'V-09b', 'reviews_recorded names a retired reviewer slot', (r) => {
  r.reviews_recorded.chatgpt = ['legacy review borrowed from the Atria era'];
});
addCase('G17', 'G17', 'tracked source file modified but never committed', null, {
  afterFinish: (dir) => {
    fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// uncommitted drift in the test that produced the evidence\n');
  }
});

/* ── M15-01 acceptance properties, as named fixtures ─────────────────────
   P2: absence of Arena evidence must never read as PASS.
   P4: an item declared but absent must be detectable (G14b).
   P3 was a human-approval case; the owner ruling of 2026-10-27 retired that condition, and
   the two GOOD controls at the bottom of this file are what pins the new contract. */
addCase('G10-no-arena-slot', 'G10', 'Arena reviewer slot deleted (no Arena evidence at all)', (r) => {
  delete r.items[0].arena;
  r.items[0].reviews = ['arena'];      /* the record still claims Arena reviewed it */
  r.reviews_recorded = { arena: ['claimed but unattested'] };
});
addCase('G14b', 'G14b', 'a declared item is missing from the registry', null, {
  afterFinish: (dir) => {
    const regPath = path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.expected_ids = ['A-30-DEMO', 'A-30-DECLARED-BUT-ABSENT'];
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  }
});

/* GOOD control: must stay accepted in push/main context and PR context. */
cases.push({ id: 'GOOD', expectFail: null, description: 'fully valid registry stays VERIFIED', mutate: null, extra: {} });
cases.push({ id: 'GOOD-PR-ANCESTRY', expectFail: null, description: 'valid PR HEAD descends from origin/main', mutate: null, extra: { prContext: true } });
/* OWNER RULING 2026-10-27 — the negative test that V-10 is really gone. Two states that the
   retired check used to turn RED must now be accepted with exit 0, and nothing else about the
   registry changes: (a) no human_governance block at all, (b) one that is explicitly unapproved
   (the exact shape main's registry carried for this whole mission). These are controls, not
   rejections: tests/m15-01-registry-strict-verification.test.js property P3 re-injects a
   human-approval requirement into a copy of the gate and asserts that these two, and only
   these two, flip to red — so neither a re-added V-10 nor a gate that accepts everything
   can satisfy them. */
cases.push({ id: 'GOOD-NO-HUMAN-GOVERNANCE', expectFail: null,
  description: 'absent human_governance is a legitimate state, not a gate failure',
  mutate: (r) => { delete r.human_governance; }, extra: {} });
cases.push({ id: 'GOOD-HUMAN-APPROVAL-FALSE', expectFail: null,
  description: 'an explicitly unapproved human_governance block is not a gate failure',
  mutate: (r) => {
    r.human_governance = {
      requires_human_approval: true,
      human_approved: false,
      approver: null,
      decided_at: null,
      head_sha: r.head_bound
    };
  }, extra: {} });
/* GOOD-BLOCKED: an honestly blocked item must remain recordable and must keep the
   whole registry out of the verifying band without failing the gate. If the new
   blocked-state rules made honest blocking impossible, this control goes red. */
cases.push({
  id: 'GOOD-BLOCKED', expectFail: null, description: 'honest BLOCKED item is recordable', extra: { contractOnly: true },
  mutate: (r, fixtureDir) => {
    const note = mkEvidence('arena', 'review_note', r.head_bound, {
      command: 'node tests/strict-verification-gate.negative.test.js --blocked-note',
      checks_total: 1, checks_passed: 1
    }, fixtureDir);
    const it = r.items[0];
    r.status = 'UNKNOWN';
    it.status = 'UNKNOWN';
    it.blocked = true;
    it.blocked_reason = 'owner decision required before this claim can be made';
    it.owner_decision_required = true;
    it.evidence = [note];
    it.arena = { status: 'BLOCKED', evidence: [note] };
  }
});
addCase('V-06-PR-DIVERGENT', 'V-06 PR base contained in HEAD', 'PR HEAD does not descend from origin/main', null, { prContext: true, divergentPrOrigin: true });

/* V-17 (M15-01): one witness may not certify several claims by copying.
   The per-reviewer checks (V-03/G16) are structurally vacuous in a one-slot contract;
   cross-ITEM reuse is not, so it must stay policed. A shared record is admissible only
   with a distinct per-item scope whose cited check identifiers really occur in the
   artifacts that item cites. */
addCase('V-17', 'V-17', 'identical evidence record certifies a second item with no scope', (r) => {
  const clone = JSON.parse(JSON.stringify(r.items[0]));
  clone.id = 'A-30-CLONE';
  r.items.push(clone);
});
addCase('V-17b', 'V-17', 'two items share one witness under the same scope text', (r) => {
  const clone = JSON.parse(JSON.stringify(r.items[0]));
  clone.id = 'A-30-CLONE';
  r.items[0].scope = 'A-30 fixture evidence';
  clone.scope = 'A-30 fixture evidence';
  r.items.push(clone);
});
addCase('V-17c', 'V-17', 'scopes differ but cite check ids no cited log contains', (r) => {
  const clone = JSON.parse(JSON.stringify(r.items[0]));
  clone.id = 'A-30-CLONE';
  r.items[0].scope = 'A-30 fixture evidence P9';
  clone.scope = 'A-30 fixture evidence P8';
  r.items.push(clone);
});
addCase('V-02h', 'V-02', 'evidence timestamp lies ahead of the run that recorded it', (r) => {
  r.items[0].evidence[0].ts = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
});
/* V-18: a status whose meaning requires a second reviewer is unreachable while the
   contract declares one slot. Registered only in that situation, so widening the
   contract removes the assertion instead of leaving a stale expectation behind. */
if (!MULTI_REVIEWER) {
  addCase('V-18', 'V-18', 'item claims INDEPENDENTLY_VERIFIED under a one-slot reviewer contract', (r) => {
    r.items[0].status = 'INDEPENDENTLY_VERIFIED';
  });
}
/* Controls for the two rules above: without them the cases would be satisfied by a
   gate that rejects every shared witness and every raised status, valid or not. */
cases.push({ id: 'GOOD-SCOPED-SHARED', expectFail: null, description: 'two items may share one log when each scopes its own claim',
  mutate: (r) => {
    const clone = JSON.parse(JSON.stringify(r.items[0]));
    clone.id = 'A-30-CLONE';
    r.items[0].scope = 'A-30 DEMO evidence';
    clone.scope = 'A-30 CLONE evidence';
    r.items.push(clone);
    r.expected_ids = r.items.map((x) => String(x.id));
  }, extra: {} });

/* ── runner ─────────────────────────────────────────────────────────────── */
console.log('==== A-30 V-01..V-12 NEGATIVE GATE FIXTURES ====');
for (const c of cases) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  const dir = mkFixture(c.id);
  try {
    writeArtifacts(dir);
    const reg = goodRegistry(PLACEHOLDER, c.mutate || undefined, dir);
    if (c.extra && c.extra.addFile) {
      fs.writeFileSync(path.join(dir, c.extra.addFile.path), c.extra.addFile.content);
    }
    const head = finishFixture(dir, reg); void head;
    /* M15-01: mutations that must be applied AFTER expected_ids is derived from
       the item list (undeclared items, duplicate declarations, artifacts that are
       edited or never committed). The registry file itself is exempt from G17, so
       rewriting it here is legitimate; anything else is not. */
    if (c.extra && typeof c.extra.afterFinish === 'function') c.extra.afterFinish(dir);
    if (c.extra && c.extra.prContext) {
      if (c.extra.divergentPrOrigin) {
        /* Create a sibling commit directly so the fixture's rewritten registry
           in the working tree is not disturbed by checkout/stash operations. */
        const parent = git(dir, ['rev-parse', 'HEAD~1']);
        const tree = git(dir, ['rev-parse', parent + '^{tree}']);
        const divergent = git(dir, ['commit-tree', tree, '-p', parent, '-m', 'divergent origin main']);
        git(dir, ['update-ref', 'refs/remotes/origin/main', divergent]);
      } else {
        /* Valid PR context: origin/main is the parent of this PR HEAD. */
        git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD~1']);
      }
    }
    if (c.extra && c.extra.divergentOrigin) {
      /* Push/main negative fixture: HEAD is a local-only child beyond origin/main. */
      git(dir, ['update-ref', 'refs/remotes/origin/main', 'HEAD~1']);
    }
    if (c.extra && c.extra.noOrigin) {
      git(dir, ['update-ref', '-d', 'refs/remotes/origin/main']);
    }
    if (c.extra && c.extra.tamperSchema) {
      const sp = path.join(dir, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
      if (fs.existsSync(sp)) {
        const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
        sc.required_evidence_keys = ['command']; /* strip the whole evidence contract */
        fs.writeFileSync(sp, JSON.stringify(sc, null, 2));
      }
    }
    const r = runGate(dir, c.extra && c.extra.prContext ? 'pull_request' : 'push');
    /* A30_VERBOSE=1 prints the gate's own FAIL lines for the case — needed when a
       fixture "passes" and you must know which other check rejected it. */
    if (process.env.A30_VERBOSE) {
      const lines = r.out.split('\n').filter((l) => /^\s+(FAIL|VERDICT)/.test(l));
      if (lines.length) console.log('       [gate] ' + lines.join('\n       [gate] '));
    }
    if (c.expectFail === null) {
      /* M15-01 V-16: a fully honest registry whose items are all blocked is CONTRACT
         PASS but must never be reported VERIFIED — the control asserts that shape
         instead of a green exit code. */
      if (c.extra && c.extra.contractOnly) {
        const okShape = r.code !== 0 && /CONTRACT PASS/.test(r.out) && /verifies nothing/.test(r.out) && /VERDICT NOT VERIFIED/.test(r.out);
        rec('CONTROL contract-only registry conforms but stays NOT VERIFIED', okShape, 'exit=' + r.code);
      } else {
        rec('GOOD control accepted (exit 0)', r.code === 0, 'exit=' + r.code + (r.code !== 0 ? '\n' + r.out.split('\n').slice(-30).join('\n') : ''));
      }
    } else {
      /* M15-01: a case counts as rejected only when the NAMED check is the one that
         FAILED. Matching the label anywhere in the output let any other blocker
         (e.g. a new exit-code rule) stand in for the check under test, which would
         have marked a vacuous fixture as green. */
      const namedFailure = new RegExp('^\\s+FAIL\\s+' + String(c.expectFail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
      const rejected = r.code !== 0 && namedFailure.test(r.out);
      const detail = 'exit=' + r.code + (rejected ? '' : (r.code === 0 ? ' — ACCEPTED by gate (defect)' : ' — exit1 but expected check missing: ' + c.expectFail));
      rec(c.id + ' rejected (' + c.description + ')', rejected, detail);
    }
  } catch (e) {
    rec(c.id + ' harness error', false, String(e && e.message || e));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

/* Issue #472: exercise the two-phase registry binding using a real temporary git history.
   A valid metadata commit must bind to its immutable source parent. A merge commit
   with the same registry-only first-parent tree delta must be rejected explicitly. */
function runMetadataBindingFixture(name, mergeCommit) {
  const dir = mkFixture('metadata-' + name);
  try {
    writeArtifacts(dir);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'immutable source evidence commit']);
    const sourceSha = git(dir, ['rev-parse', 'HEAD']);

    const reg = goodRegistry(sourceSha, null, dir);
    reg.expected_ids = reg.items.map((it) => String(it.id));
    fs.writeFileSync(path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
    git(dir, ['add', 'docs/verification/VERIFICATION_REGISTRY.json']);
    git(dir, ['commit', '-qm', 'registry-only metadata commit']);
    const metadataSha = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['update-ref', 'refs/remotes/origin/main', sourceSha]);

    if (mergeCommit) {
      /* A merge commit whose final tree differs from first parent only by registry
         must still be rejected for metadata binding because multi-parent history is
         not the protocol's allowed evidence-finalization shape. */
      git(dir, ['checkout', '-qb', 'side-source', sourceSha]);
      fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// side-parent source mutation\n');
      git(dir, ['add', 'tests/smoke.js']);
      git(dir, ['commit', '-qm', 'side parent source change']);
      const sideSha = git(dir, ['rev-parse', 'HEAD']);
      git(dir, ['checkout', '--detach', metadataSha]);
      const tree = git(dir, ['rev-parse', metadataSha + '^{tree}']);
      const mergeSha = git(dir, ['commit-tree', tree, '-p', sourceSha, '-p', sideSha, '-m', 'merge-shaped metadata commit']);
      git(dir, ['update-ref', 'HEAD', mergeSha]);
    }

    const result = runGate(dir, 'pull_request');
    if (mergeCommit) {
      rec('Issue #472 merge commit rejected for metadata binding',
        result.code !== 0 && result.out.includes('metadata-only binding requires a non-merge commit'),
        'exit=' + result.code);
    } else {
      rec('Issue #472 single-parent registry-only commit binds immutable parent',
        result.code === 0,
        'exit=' + result.code + (result.code !== 0 ? '\n' + result.out.split('\n').filter((l) => l.includes('FAIL') || l.includes('BLOCKERS')).slice(0, 12).join('\n') : ''));
    }
  } catch (e) {
    rec('Issue #472 metadata fixture harness error (' + name + ')', false, String(e && e.message || e));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}
if (!ONLY.length) runMetadataBindingFixture('positive', false);
if (!ONLY.length) runMetadataBindingFixture('merge-negative', true);

/* ── Issue #472 hardening — every *other* metadata-commit shape must fail closed ──
   The two cases above pin the allowed shape (single parent, registry as the sole
   changed path) and the merge rejection. These four pin the smuggle vectors that a
   weaker reading of "registry-only" would accept:
     extra-path            registry + one source file in the same commit
     rename-into-registry  rename whose post-image is the registry path (a deletion of
                           an unrelated path is hidden when rename detection is on)
     empty-metadata        an empty commit after a real metadata commit must not
                           inherit the metadata-only privilege
     root-no-parent        a parentless commit has no immutable parent to bind to
   Each asserts the gate (a) refuses the binding, (b) says why, and (c) therefore
   binds evidence to checkout HEAD, which cannot match a head_bound written earlier. */
const REG_PATH = 'docs/verification/VERIFICATION_REGISTRY.json';

function runBindingShapeFixture(shape) {
  const dir = mkFixture('shape-' + shape);
  try {
    writeArtifacts(dir);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'immutable source evidence commit']);
    const sourceSha = git(dir, ['rev-parse', 'HEAD']);
    const reg = goodRegistry(sourceSha, null, dir);
    reg.expected_ids = reg.items.map((it) => String(it.id));
    const writeReg = () => fs.writeFileSync(path.join(dir, REG_PATH), JSON.stringify(reg, null, 2));
    git(dir, ['update-ref', 'refs/remotes/origin/main', sourceSha]);

    if (shape === 'extra-path') {
      writeReg();
      fs.writeFileSync(path.join(dir, 'tests', 'smoke.js'), '// smuggled source change inside the metadata commit\n');
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', 'metadata commit smuggling a source change']);
    } else if (shape === 'rename-into-registry') {
      fs.writeFileSync(path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY_PREVIOUS_NAME.json'), JSON.stringify(reg, null, 2));
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', 'registry under its previous path']);
      git(dir, ['mv', 'docs/verification/VERIFICATION_REGISTRY_PREVIOUS_NAME.json', REG_PATH]);
      git(dir, ['commit', '-qm', 'rename-shaped metadata commit']);
    } else if (shape === 'empty-metadata') {
      writeReg();
      git(dir, ['add', REG_PATH]);
      git(dir, ['commit', '-qm', 'registry-only metadata commit']);
      git(dir, ['commit', '--allow-empty', '-qm', 'empty commit right after the metadata commit']);
    } else if (shape === 'root-no-parent') {
      writeReg();
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', 'everything in one parentless commit']);
      git(dir, ['checkout', '--orphan', 'orphan-metadata']);
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', 'parentless metadata commit']);
    }

    const result = runGate(dir, 'pull_request');
    const expectMsg = shape === 'root-no-parent' ? 'parent_count=0' : 'expected registry only';
    const rejected = result.code !== 0 && result.out.includes(expectMsg) && result.out.indexOf('[metadata-only]') === -1;
    rec('Issue #472 ' + shape + ' commit fails closed for metadata binding', rejected,
      'exit=' + result.code + (rejected ? '' : ' — ACCEPTED by gate (defect)'));
  } catch (e) {
    rec('Issue #472 ' + shape + ' fixture harness error', false, String((e && e.message) || e));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp cleanup is best-effort */ }
  }
}
if (!ONLY.length) {
  for (const shape of ['extra-path', 'rename-into-registry', 'empty-metadata', 'root-no-parent']) {
    runBindingShapeFixture(shape);
  }
}

console.log('==== A-30 NEGATIVE RESULT ' + pass + ' pass / ' + fail + ' fail ====');
if (fail) {
  console.log('BLOCKERS');
  for (const f of failures) console.log(' - ' + f);
}
process.exit(fail ? 1 : 0);
