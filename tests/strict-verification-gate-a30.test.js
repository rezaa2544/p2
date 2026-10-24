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
const ART_BODIES = {
  'artifacts/cg.log': 'chatgpt independent runtime proof\n',
  'artifacts/ar.log': 'arena independent adversarial proof\n',
  'artifacts/at.log': 'atria independent runtime proof\n'
};
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
  const eCg = ev(head, 'chatgpt', 'runtime_evidence', 'artifacts/cg.log', 'https://example.invalid/run/cg-1');
  const eAr = ev(head, 'arena', 'adversarial_test', 'artifacts/ar.log', 'https://example.invalid/run/ar-1');
  const eAt = ev(head, 'atria', 'positive_test', 'artifacts/at.log', 'https://example.invalid/run/at-1');
  return {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'INDEPENDENTLY_VERIFIED',
    head_bound: head,
    expected_ids: ['A30-T'],
    required_reviewers: ['chatgpt', 'arena', 'atria'],
    reviews_recorded: { chatgpt: ['cg-1'], arena: ['ar-1'], atria: ['at-1'] },
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
      reviews: ['chatgpt', 'arena', 'atria'],
      known_limitations: [],
      evidence: [eCg, eAr, eAt],
      chatgpt: { status: 'PASS', head_sha: head, independent: true, run_id: 'cg-1', evidence: [eCg] },
      arena: { status: 'PASS', head_sha: head, independent: true, run_id: 'ar-1', evidence: [eAr] },
      atria: { status: 'PASS', head_sha: head, independent: true, run_id: 'at-1', evidence: [eAt] }
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
  'V03-reviewer-not-independent': () => {
    const dup = { ...reg.items[0].evidence[0], reviewer: 'arena' };
    reg.items[0].evidence[1] = dup;
    reg.items[0].arena.evidence = [dup];
  },
  'V04-invalid-status': () => { reg.items[0].status = 'PASS'; },
  'V05-blocked-until': () => { reg.status = 'BLOCKED_UNTIL_THREE_AI_AGREEMENT'; },
  'V06-head-mismatch': () => { reg.head_bound = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; },
  'V08-self-attested-cert': () => {
    const sc = 'node server/analytics/intelligence-release-certification.js';
    reg.items[0].evidence.forEach((e) => { e.command = sc; });
    reg.items[0].chatgpt.evidence[0].command = sc;
    reg.items[0].arena.evidence[0].command = sc;
    reg.items[0].atria.evidence[0].command = sc;
  },
  'V09-cert-input-injection': () => { reg.items[0].chatgpt.evidence[0].reviewer = 'arena'; },
  'V10-missing-human-fields': () => { delete reg.human_governance; },
  'V11-zero-ranking': () => { reg.items[0].evidence.forEach((e) => { e.checks_total = 0; e.checks_passed = 0; }); },
  'V12-provenance-missing': () => { delete reg.items[0].evidence[0].runtime; }
};
for (const [name, mut] of Object.entries(cases)) {
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
