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
const cp = require('child_process');

const REPO = path.join(__dirname, '..');
const GATE_SRC = path.join(REPO, 'tools', 'strict-verification-gate.js');
const POLICY_SRC = path.join(REPO, 'docs', 'STRICT_VERIFICATION_GATE.md');
const SCHEMA_SRC = path.join(REPO, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALERT_SRC = path.join(REPO, 'infra', 'observability', 'alert-rules.yml');

const CANONICAL_STATUSES = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'];
const TRIO = ['chatgpt', 'arena', 'atria'];

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git = (dir, args) => cp.execSync('git ' + args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

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
        command: 'node tools/strict-verification-gate.negative.test.js --reviewer ' + r
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
    required_reviewers: ['chatgpt', 'arena', 'atria'],
    allowed_statuses: CANONICAL_STATUSES.slice(),
    reviews_recorded: {
      chatgpt: ['A-30 architecture review'],
      arena: ['A-30 adversarial runtime run'],
      atria: ['A-30 independent repro']
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
        reviews: ['chatgpt', 'arena', 'atria'],
        known_limitations: ['fixtures only; full registry rebuild happens in A-38'],
        evidence: [
          mkEvidence('arena', 'positive_test', head, { command: 'node tests/strict-verification-gate.negative.test.js' }, fixtureDir),
          mkEvidence('atria', 'negative_test', head, { command: 'node tests/strict-verification-gate.negative.test.js --adversarial' }, fixtureDir),
          mkEvidence('chatgpt', 'runtime_evidence', head, { command: 'node tools/strict-verification-gate.js' }, fixtureDir)
        ],
        chatgpt: { status: 'PASS', evidence: evidenceByReviewer.chatgpt },
        arena: { status: 'PASS', evidence: evidenceByReviewer.arena },
        atria: { status: 'PASS', evidence: evidenceByReviewer.atria }
      }
    ]
  };
  if (mutate) mutate(reg);
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
    items: ['assert(true', 'process.exit(0)', '|| true', '0/0 checks'].map(mk)
  };
  fs.writeFileSync(path.join(dir, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json'), JSON.stringify(allow, null, 2));
  git(dir, 'init -q');
  git(dir, 'config user.email a30@test.local');
  git(dir, 'config user.name a30-negative');
  git(dir, 'commit -qm "init" --allow-empty'); /* parent commit so V-06 can point origin/main at HEAD~1 */
  return dir;
}

/* evidence artifacts referenced by the GOOD registry (committed before HEAD read) */
function writeArtifacts(dir) {
  const evDir = path.join(dir, 'docs', 'verification', 'evidence');
  for (const r of TRIO) {
    for (const k of ['positive_test', 'negative_test', 'runtime_evidence']) {
      fs.writeFileSync(path.join(evDir, 'a30-' + r + '-' + k + '.log'), 'A-30 fixture evidence ' + r + ' ' + k + '\n');
    }
  }
}

const PLACEHOLDER = 'a'.repeat(40); /* rewritten to the real HEAD; forged values (V-02*) survive */
function finishFixture(dir, reg) {
  fs.writeFileSync(path.join(dir, 'docs', 'verification', 'VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2));
  git(dir, 'add -A');
  git(dir, 'commit -qm "a30 fixture"');
  const head = git(dir, 'rev-parse HEAD');
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
  git(dir, 'update-ref refs/remotes/origin/main ' + head);
  return head;
}

function runGate(dir) {
  const r = cp.spawnSync(process.execPath, ['tools/strict-verification-gate.js'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
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
  r.items[0].chatgpt.evidence[1].sha256 = 'f'.repeat(64);
});
addCase('V-02c', 'V-02', 'registry head_bound mismatches HEAD', (r) => { r.head_bound = 'dead'.repeat(10); });

/* V-03: cloned evidence across reviewers (no independence) */
addCase('V-03', 'V-03', 'arena/atria evidence byte-cloned from chatgpt', (r) => {
  const src = r.items[0].chatgpt.evidence;
  r.items[0].arena.evidence = JSON.parse(JSON.stringify(src));
  r.items[0].atria.evidence = JSON.parse(JSON.stringify(src));
});

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
addCase('V-07', 'fake-green.sh', 'false-green || true hidden in a .sh test', null, { addFile: { path: 'tests/fake-green.sh', content: '#!/bin/sh\ncmd_volatile || true\necho "all good"\n' } });

/* V-08: certification evidence solely from self-attesting module */
addCase('V-08', 'V-08', 'all evidence commands run the self-certification module', (r) => {
  const cmd = 'node server/analytics/intelligence-release-certification.js';
  const it = r.items[0];
  for (const e of it.evidence) e.command = cmd;
  for (const rev of TRIO) for (const e of it[rev].evidence) e.command = cmd;
});

/* V-09: injected reviewer PASS without recorded corroboration */
addCase('V-09', 'V-09', 'reviewer PASS claims while reviews_recorded is empty', (r) => {
  r.reviews_recorded = { chatgpt: [], arena: [], atria: [] };
});
addCase('V-09b', 'V-09', 'item.reviews omits a reviewer that claims PASS', (r) => {
  r.items[0].reviews = ['arena', 'atria'];
});

/* V-10: human governance absent / fail-open on absent fields */
addCase('V-10', 'V-10', 'human_governance object absent', (r) => { delete r.human_governance; });
addCase('V-10b', 'V-10', 'human_approved field absent (fail-open on missing key)', (r) => { delete r.human_governance.human_approved; });
addCase('V-10c', 'V-10', 'human approver is one of the AI reviewers', (r) => { r.human_governance.approver = 'chatgpt'; });

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

/* GOOD control: must stay accepted */
cases.push({ id: 'GOOD', expectFail: null, description: 'fully valid registry stays VERIFIED', mutate: null, extra: {} });

/* ── runner ─────────────────────────────────────────────────────────────── */
console.log('==== A-30 V-01..V-12 NEGATIVE GATE FIXTURES ====');
for (const c of cases) {
  const dir = mkFixture(c.id);
  try {
    writeArtifacts(dir);
    const reg = goodRegistry(PLACEHOLDER, c.mutate || undefined, dir);
    if (c.extra && c.extra.addFile) {
      fs.writeFileSync(path.join(dir, c.extra.addFile.path), c.extra.addFile.content);
    }
    const head = finishFixture(dir, reg);
    if (c.extra && c.extra.divergentOrigin) {
      /* local-only line: origin/main stays on the PARENT commit while HEAD is the
         crafted child — original gate never consults origin/main (V-06). */
      git(dir, 'update-ref refs/remotes/origin/main HEAD~1');
    }
    if (c.extra && c.extra.noOrigin) {
      git(dir, 'update-ref -d refs/remotes/origin/main');
    }
    if (c.extra && c.extra.tamperSchema) {
      const sp = path.join(dir, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
      if (fs.existsSync(sp)) {
        const sc = JSON.parse(fs.readFileSync(sp, 'utf8'));
        sc.required_evidence_keys = ['command']; /* strip the whole evidence contract */
        fs.writeFileSync(sp, JSON.stringify(sc, null, 2));
      }
    }
    const r = runGate(dir);
    if (c.expectFail === null) {
      rec('GOOD control accepted (exit 0)', r.code === 0, 'exit=' + r.code + (r.code !== 0 ? '\n' + r.out.split('\n').filter((l) => l.includes('FAIL') || l.includes('BLOCKERS')).slice(0, 12).join('\n') : ''));
    } else {
      const rejected = r.code !== 0 && r.out.includes(c.expectFail);
      const detail = 'exit=' + r.code + (rejected ? '' : (r.code === 0 ? ' — ACCEPTED by gate (defect)' : ' — exit1 but expected check missing: ' + c.expectFail));
      rec(c.id + ' rejected (' + c.description + ')', rejected, detail);
    }
  } catch (e) {
    rec(c.id + ' harness error', false, String(e && e.message || e));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

console.log('==== A-30 NEGATIVE RESULT ' + pass + ' pass / ' + fail + ' fail ====');
if (fail) {
  console.log('BLOCKERS');
  for (const f of failures) console.log(' - ' + f);
}
process.exit(fail ? 1 : 0);
