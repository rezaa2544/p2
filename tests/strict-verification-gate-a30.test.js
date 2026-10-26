#!/usr/bin/env node
'use strict';
/**
 * tests/strict-verification-gate-a30.test.js
 *
 * A-30 contract suite for tools/strict-verification-gate.js, migrated to the
 * Arena-only operating model (M15-01). One reviewer slot = one independent
 * evidence chain; the retired chatgpt/atria slots are gone from the contract, so
 * a fixture that still speaks the old trio would fail for the wrong reason.
 *
 * Every case builds a throw-away repository. The positive control must be
 * accepted (a gate that rejects everything proves nothing) and each exploit must
 * be rejected by the named check.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools', 'strict-verification-gate.js');
const SCHEMA = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALLOW = path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');
let checks = 0, fail = 0;
function chk(name, ok, detail) { checks++; if (!ok) { fail++; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); } else console.log('OK ' + name); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function run(dir) {
  return cp.spawnSync(process.execPath, [path.join(dir, 'tools', 'strict-verification-gate.js')],
    { cwd: dir, env: { ...process.env }, encoding: 'utf8' });
}
const ART_BODIES = {
  'artifacts/ar-positive.log': 'arena independent positive runtime proof\n',
  'artifacts/ar-adversarial.log': 'arena independent adversarial proof\n',
  'artifacts/ar-runtime.log': 'arena independent runtime proof (second run)\n'
};
function base() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-a30-'));
  fs.mkdirSync(path.join(d, 'tools'));
  fs.mkdirSync(path.join(d, 'docs/verification'), { recursive: true });
  fs.mkdirSync(path.join(d, 'infra/observability'), { recursive: true });
  fs.mkdirSync(path.join(d, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(d, 'tests'), { recursive: true });
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
  /* G15b: every tests|tools path cited by evidence must exist in the fixture */
  fs.writeFileSync(path.join(d, 'tests/m15-01-registry-strict-verification.test.js'), '// a30 fixture stub\n');
  fs.writeFileSync(path.join(d, 'tests/strict-verification-gate.negative.test.js'), '// a30 fixture stub\n');
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
function ev(head, kind, rel, cmd) {
  return {
    reviewer: 'arena',
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
  const ePos = ev(head, 'positive_test', 'artifacts/ar-positive.log', 'node tests/m15-01-registry-strict-verification.test.js');
  const eAdv = ev(head, 'adversarial_test', 'artifacts/ar-adversarial.log', 'node tests/strict-verification-gate.negative.test.js');
  const eRun = ev(head, 'runtime_evidence', 'artifacts/ar-runtime.log', 'node tools/strict-verification-gate.js');
  return {
    schema_version: 3,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'INDEPENDENTLY_VERIFIED',
    head_bound: head,
    expected_ids: ['A30-T'],
    required_reviewers: ['arena'],
    reviews_recorded: { arena: ['ar-1'] },
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
      reviews: ['arena'],
      known_limitations: ['single reviewer slot: independence is not obtainable from AI review alone'],
      evidence: [ePos, eAdv, eRun],
      arena: { status: 'PASS', head_sha: head, independent: true, run_id: 'ar-1', evidence: [ePos, eAdv, eRun] }
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
  'V02b-stale-artifact-hash': () => { reg.items[0].arena.evidence[1].sha256 = 'f'.repeat(64); },
  'V03-retired-reviewer-slot': () => {
    /* the old trio must not be resurrected to manufacture a second opinion */
    reg.items[0].reviews = ['chatgpt', 'arena', 'atria'];
    reg.items[0].chatgpt = { status: 'PASS', evidence: [reg.items[0].arena.evidence[0]] };
  },
  'V04-invalid-status': () => { reg.items[0].status = 'PASS'; },
  'V05-blocked-until': () => { reg.status = 'BLOCKED_UNTIL_THREE_AI_AGREEMENT'; },
  'V06-head-mismatch': () => { reg.head_bound = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; },
  'V08-self-attested-cert': () => {
    const sc = 'node server/analytics/intelligence-release-certification.js';
    reg.items[0].evidence.forEach((e) => { e.command = sc; });
    reg.items[0].arena.evidence.forEach((e) => { e.command = sc; });
  },
  'V09-cert-input-injection': () => { reg.items[0].arena.evidence[0].reviewer = 'chatgpt'; },
  'V10-missing-human-fields': () => { delete reg.human_governance; },
  'V11-zero-ranking': () => { reg.items[0].evidence.forEach((e) => { e.checks_total = 0; e.checks_passed = 0; }); },
  'V12-provenance-missing': () => { delete reg.items[0].evidence[0].runtime; },
  'V13-blocked-with-verifying-status': () => {
    reg.items[0].blocked = true;
    reg.items[0].blocked_reason = 'owner decision pending';
    reg.items[0].owner_decision_required = true;
  },
  'G14c-undeclared-item': () => {
    const clone = JSON.parse(JSON.stringify(reg.items[0]));
    clone.id = 'A30-UNDECLARED';
    reg.items.push(clone);
  },
  'G14d-duplicate-declaration': () => { reg.expected_ids.push('A30-T'); }
};
for (const [name, mut] of Object.entries(cases)) {
  reg = validReg(head); mut(); write();
  chk(name + ' fails closed', run(d).status !== 0);
}
/* an honestly blocked item must remain recordable and must keep the registry non-green */
reg = validReg(head);
reg.status = 'UNKNOWN';
reg.items[0].status = 'UNKNOWN';
reg.items[0].blocked = true;
reg.items[0].blocked_reason = 'owner decision pending';
reg.items[0].owner_decision_required = true;
reg.items[0].arena = { status: 'BLOCKED', evidence: [ev(head, 'review_note', 'artifacts/ar-runtime.log', 'node tools/strict-verification-gate.js')] };
reg.items[0].evidence = reg.items[0].arena.evidence;
write();
const blockedRun = run(d);
/* V-16: the blocked shape is CONTRACT PASS (it is recordable and schema-valid) but it
   must not be reported as VERIFIED, and the gate must not exit 0 on it. */
chk('honestly blocked registry conforms to the contract', /CONTRACT PASS/.test(blockedRun.stdout), 'exit=' + blockedRun.status);
chk('honestly blocked registry is never reported VERIFIED', blockedRun.status !== 0 && /VERDICT NOT VERIFIED/.test(blockedRun.stdout));
if (!/CONTRACT PASS/.test(blockedRun.stdout)) console.error(blockedRun.stdout + blockedRun.stderr);
reg = validReg(head); write();
fs.writeFileSync(path.join(d, 'scanner-target.js'), 'const x = ' + 'assert' + '(true);\n');
chk('V07 scanner catches injected false-green pattern', run(d).status !== 0);
fs.unlinkSync(path.join(d, 'scanner-target.js'));
cp.execFileSync('git', ['commit', '--allow-empty', '-qm', 'unpushed-local-commit'], { cwd: d });
chk('V06 external intended-head mismatch fails closed', run(d).status !== 0);
try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* temp cleanup is best-effort */ }
console.log('CHECKS ' + checks + ' FAIL ' + fail);
if (fail) process.exit(1);
