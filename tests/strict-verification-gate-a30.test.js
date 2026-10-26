#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools', 'strict-verification-gate.js');
const SCHEMA = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALLOW = path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');
let checks = 0, fail = 0;
function chk(name, ok) { checks++; if (!ok) { fail++; console.error('FAIL ' + name); } else console.log('OK ' + name); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function run(dir) {
  return cp.spawnSync(process.execPath, [path.join(dir, 'tools', 'strict-verification-gate.js')],
    { cwd: dir, env: { ...process.env }, encoding: 'utf8' });
}
/* ── reviewer contract (M15-01 CI-UNBLOCK fix) ────────────────────────────────
   This suite used to hard-code the retired 3-AI trio ['chatgpt','arena','atria'].
   PR #481 moved the gate, the policy doc and the evidence schema to the
   Arena-only model (`REVIEWERS = ['arena']`) but left these fixtures behind, so
   the "positive valid contract passes" control went red on G5 ("Arena is the
   sole required AI reviewer") and V-12 ("reviewer not in trio") even though the
   gate was behaving correctly.

   The reviewer list is now read from the pinned evidence schema — the same file
   the gate validates its own contract against (V-12) — so the fixtures and the
   contract cannot drift apart again. */
const REVIEWERS = (() => {
  const s = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  if (!Array.isArray(s.reviewers) || s.reviewers.length === 0) {
    throw new Error('VERIFICATION_EVIDENCE_SCHEMA.json: reviewers[] is missing — cannot build fixtures');
  }
  return s.reviewers.map(String);
})();
/* cross-reviewer independence is only expressible with >=2 reviewer slots */
const MULTI_REVIEWER = REVIEWERS.length >= 2;
const artRel = (r) => 'artifacts/' + r + '.log';
const ART_BODIES = Object.fromEntries(
  REVIEWERS.map((r) => [artRel(r), r + ' independent runtime/adversarial proof\n'])
);
function base() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a30-'));
  fs.mkdirSync(path.join(d, 'tools'));
  fs.mkdirSync(path.join(d, 'docs/verification'), { recursive: true });
  fs.mkdirSync(path.join(d, 'infra/observability'), { recursive: true });
  fs.mkdirSync(path.join(d, 'artifacts'), { recursive: true });
  fs.copyFileSync(GATE, path.join(d, 'tools/strict-verification-gate.js'));
  fs.copyFileSync(SCHEMA, path.join(d, 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'));
  const allowJson = JSON.parse(fs.readFileSync(ALLOW, 'utf8'));
  for (const pat of ['assert(true', 'process.exit(0)', '|| true', '0/0 checks']) {
    allowJson.items.push({
      pattern: pat,
      path: 'tools/strict-verification-gate.js',
      owner: 'arena-a30',
      reason: 'gate scanner patterns in copied gate runner',
      expires: '2027-09-25',
      replacement_test: 'tests/strict-verification-gate-a30.test.js'
    });
  }
  fs.writeFileSync(path.join(d, 'docs/verification/FALSE_GREEN_ALLOWLIST.json'), JSON.stringify(allowJson, null, 2));
  fs.writeFileSync(path.join(d, 'docs/STRICT_VERIFICATION_GATE.md'), 'policy');
  fs.writeFileSync(path.join(d, 'infra/observability/alert-rules.yml'), 'groups: []\n');
  for (const [rel, body] of Object.entries(ART_BODIES)) fs.writeFileSync(path.join(d, rel), body);
  cp.execFileSync('git', ['init', '-q'], { cwd: d });
  cp.execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: d });
  cp.execFileSync('git', ['config', 'user.name', 'test'], { cwd: d });
  cp.execFileSync('git', ['add', '.'], { cwd: d });
  cp.execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: d });
  const h = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf8' }).trim();
  cp.execFileSync('git', ['update-ref', 'refs/remotes/origin/main', h], { cwd: d });
  return { d, head: h };
}
function ev(head, reviewer, kind, rel, cmd) {
  return {
    reviewer,
    kind,
    runtime: { node: process.version, os: process.platform },
    head_sha: head,
    command: cmd,
    exit_code: 0,
    checks_total: 4,
    checks_passed: 4,
    artifact: rel,
    sha256: sha256(ART_BODIES[rel]),
    ts: '2026-10-22T00:00:00Z'
  };
}
function validReg(head) {
  /* one positive, one adversarial and one runtime entry per declared reviewer.
     Commands embed the reviewer name so the per-reviewer slots are pairwise
     distinct (G16/V-03) for any reviewer count. */
  const slots = {};
  const itemEvidence = [];
  REVIEWERS.forEach((r, i) => {
    const entries = [
      ev(head, r, 'positive_test', artRel(r), 'https://example.invalid/run/' + r + '-pos'),
      ev(head, r, 'adversarial_test', artRel(r), 'https://example.invalid/run/' + r + '-adv'),
      ev(head, r, 'runtime_evidence', artRel(r), 'https://example.invalid/run/' + r + '-rt')
    ];
    slots[r] = { status: 'PASS', head_sha: head, independent: true, run_id: r + '-1', evidence: entries };
    /* item-level slot carries the full set for the first reviewer only, so it
       still holds >=1 positive AND >=1 adversarial entry (V-11) without cloning
       any reviewer slot wholesale. */
    if (i === 0) itemEvidence.push(...entries);
  });
  const reviewsRecorded = Object.fromEntries(REVIEWERS.map((r) => [r, [r + '-1']]));
  return {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'INDEPENDENTLY_VERIFIED',
    head_bound: head,
    expected_ids: ['A30-T'],
    required_reviewers: REVIEWERS.slice(),
    reviews_recorded: reviewsRecorded,
    human_governance: {
      requires_human_approval: true,
      human_approved: true,
      approver: 'owner-human-1',
      decided_at: '2026-10-22T00:00:00Z',
      head_sha: head
    },
    allowed_statuses: ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'],
    items: [{
      id: 'A30-T',
      requirement: 'strict gate contract verification',
      status: 'INDEPENDENTLY_VERIFIED',
      head_sha: head,
      reviews: REVIEWERS.slice(),
      known_limitations: [],
      evidence: itemEvidence,
      ...slots
    }]
  };
}
const { d, head } = base();
let reg = validReg(head);
function write() { fs.writeFileSync(path.join(d, 'docs/verification/VERIFICATION_REGISTRY.json'), JSON.stringify(reg, null, 2)); }
write();
const pos = run(d);
if (pos.status !== 0) console.error(pos.stdout + pos.stderr);
chk('positive valid contract passes', pos.status === 0);
const cases = {
  'V01-empty-registry': () => { reg.items = []; },
  'V02-weak-evidence': () => { reg.items[0].evidence = ['ok']; },
  /* Inapplicable at N=1: the gate's V-03 compares reviewer slots pairwise, so
     with a single declared reviewer there is no second slot to clone into. */
  'V03-reviewer-not-independent': MULTI_REVIEWER ? () => {
    const target = REVIEWERS[1];
    const cloned = JSON.parse(JSON.stringify(reg.items[0][REVIEWERS[0]].evidence));
    cloned.forEach((e) => { e.reviewer = target; });
    reg.items[0][target].evidence = cloned;
  } : null,
  'V04-invalid-status': () => { reg.items[0].status = 'PASS'; },
  'V05-blocked-until': () => { reg.status = 'BLOCKED_UNTIL_THREE_AI_AGREEMENT'; },
  'V06-head-mismatch': () => { reg.head_bound = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; },
  'V08-self-attested-cert': () => {
    const sc = 'node server/analytics/intelligence-release-certification.js';
    reg.items[0].evidence.forEach((e) => { e.command = sc; });
    for (const r of REVIEWERS) reg.items[0][r].evidence.forEach((e) => { e.command = sc; });
  },
  'V09-cert-input-injection': () => { reg.items[0][REVIEWERS[0]].evidence[0].reviewer = 'intruder'; },
  'V10-missing-human-fields': () => { delete reg.human_governance; },
  'V11-zero-ranking': () => { reg.items[0].evidence.forEach((e) => { e.checks_total = 0; e.checks_passed = 0; }); },
  'V12-provenance-missing': () => { delete reg.items[0].evidence[0].runtime; }
};
console.log('contract reviewers: [' + REVIEWERS.join(', ') + '] (from docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json)');
for (const [name, mut] of Object.entries(cases)) {
  if (typeof mut !== 'function') {
    /* Report the contract-inapplicable case explicitly — never silently drop it.
       It re-activates automatically if the reviewer contract widens again. */
    console.log('N/A ' + name + ' — contract declares a single reviewer ('
      + REVIEWERS.join(',') + '); pairwise cross-reviewer independence is vacuous at N=1');
    continue;
  }
  reg = validReg(head); mut(); write();
  chk(name + ' fails closed', run(d).status !== 0);
}
reg = validReg(head); write();
fs.writeFileSync(path.join(d, 'scanner-target.js'), 'const x = ' + 'assert' + '(true);\n');
chk('V07 scanner catches injected false-green pattern', run(d).status !== 0);
fs.unlinkSync(path.join(d, 'scanner-target.js'));
cp.execFileSync('git', ['commit', '--allow-empty', '-qm', 'unpushed-local-commit'], { cwd: d });
chk('V06 external intended-head mismatch fails closed', run(d).status !== 0);
console.log('CHECKS ' + checks + ' FAIL ' + fail);
if (fail) process.exit(1);
