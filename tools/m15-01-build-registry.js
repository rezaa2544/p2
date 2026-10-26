#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   tools/m15-01-build-registry.js — reproducible registry builder (metadata only)

   The registry is not hand-edited. It is emitted from measured runs so that the
   numbers in it (checks_total / checks_passed / exit_code) and the artifact
   hashes are produced by the same steps a reviewer can re-run:

     node tools/m15-01-build-registry.js --collect
         runs each evidence command, writes its full output to
         docs/verification/evidence/<name>.log with a one-line header carrying
         the timestamp, exit code and runtime, and refuses to continue if any
         run reports a failure.

     node tools/m15-01-build-registry.js --emit --head <sha> [--out <path>]
         reads those logs, derives every evidence field from them, and writes
         the registry bound to <sha>.

   The builder never invents a verdict. Legacy items are emitted as BLOCKED /
   UNKNOWN because that is what the archive proves, and human governance is
   emitted as NOT APPROVED because no human decision exists. If that makes the
   gate red, the gate is right — the file is metadata, not a green light.

   Two-phase binding (docs/STRICT_VERIFICATION_GATE.md): run --collect and commit
   the logs, then run --emit and commit ONLY the registry. The emitted head_bound
   is the source commit the evidence describes, which is the parent of the
   registry-only commit.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verification', 'evidence');
const LEGACY_ARCHIVE_REL = 'docs/verification/legacy/VERIFICATION_REGISTRY.atria-6612f58.json';
const REGISTRY_REL = 'docs/verification/VERIFICATION_REGISTRY.json';

const EVIDENCE = {
  focused: {
    file: 'm15-01-focused-suite.log',
    command: 'node tests/m15-01-registry-strict-verification.test.js'
  },
  negative: {
    file: 'm15-01-negative-fixtures.log',
    command: 'node tests/strict-verification-gate.negative.test.js'
  },
  contract: {
    file: 'm15-01-contract-suite.log',
    command: 'node tests/strict-verification-gate-a30.test.js'
  },
  legacy: {
    file: 'm15-01-legacy-inventory.log',
    command: 'node tools/verification-legacy-inventory.js'
  }
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ── --collect ──────────────────────────────────────────────────────────── */
function collect() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  let failures = 0;
  for (const [name, spec] of Object.entries(EVIDENCE)) {
    const out = path.join(EVIDENCE_DIR, spec.file);
    const r = cp.spawnSync(process.execPath, spec.command.replace(/^node\s+/, '').split(/\s+/), {
      cwd: ROOT, encoding: 'utf8', timeout: 600000
    });
    const body = (r.stdout || '') + (r.stderr || '');
    const ts = new Date().toISOString();
    const runtime = 'node:' + process.version + ',os:' + process.platform + ',arch:' + process.arch;
    const header = '# M15-01-EVIDENCE name=' + name + ' ts=' + ts + ' exit=' + r.status +
      ' runtime=' + runtime + ' command=' + spec.command + '\n';
    fs.writeFileSync(out, header + body);
    const parsed = parseLog(name, out);
    const ok = r.status === 0 && parsed && parsed.fail === 0 && parsed.total > 0;
    if (!ok) failures++;
    console.log((ok ? 'COLLECTED ' : 'COLLECT-FAILED ') + name + ' exit=' + r.status +
      (parsed ? ' checks=' + parsed.total + ' fail=' + parsed.fail : ' unparsed') + ' → ' + path.relative(ROOT, out));
  }
  if (failures) {
    console.log('REFUSED: ' + failures + ' evidence run(s) failed — no registry emitted from failed runs');
    process.exit(1);
  }
  console.log('COLLECT OK (' + Object.keys(EVIDENCE).length + ' runs, all exit 0 with zero failing checks)');
}

/* ── log parsing (the numbers in the registry come from here) ───────────── */
function parseLog(name, file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const lines = text.split('\n');
  const header = {};
  const h = lines[0] || '';
  for (const m of h.matchAll(/([a-z_]+)=([^\s]+)/g)) header[m[1]] = m[2];
  let total = null, fail = null;
  const chk = text.match(/CHECKS\s+(\d+)\s+FAIL\s+(\d+)/);
  const neg = text.match(/NEGATIVE RESULT\s+(\d+)\s+pass\s*\/\s*(\d+)\s+fail/);
  if (chk) { total = Number(chk[1]); fail = Number(chk[2]); }
  else if (neg) { total = Number(neg[1]) + Number(neg[2]); fail = Number(neg[2]); }
  if (total === null) return null;
  return {
    name, total, fail, passed: total - fail,
    ts: header.ts || null,
    exit: Number(header.exit),
    runtime: header.runtime || null,
    command: header.command || EVIDENCE[name].command,
    sha256: sha256(fs.readFileSync(file)),
    rel: path.relative(ROOT, file).split(path.sep).join('/')
  };
}

/* ── registry construction ─────────────────────────────────────────────── */
function runtimeObject(runtime) {
  const out = {};
  for (const part of String(runtime || '').split(',')) {
    const [k, v] = part.split(':');
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length ? out : { node: process.version, os: process.platform };
}

function evidenceObject(head, parsed, kind) {
  return {
    reviewer: 'arena',
    kind,
    command: parsed.command,
    exit_code: parsed.exit,
    checks_total: parsed.total,
    checks_passed: parsed.passed,
    artifact: parsed.rel,
    sha256: parsed.sha256,
    head_sha: head,
    runtime: runtimeObject(parsed.runtime),
    ts: parsed.ts || new Date().toISOString()
  };
}

function legacyItems(head, archive, note) {
  const items = [];
  for (const it of archive.items) {
    const id = String(it.id);
    const atria = String(it.atria_status || '(none recorded)');
    const state = String(it.current_head || it.evidence || '(no state recorded)');
    const blockedReason = 'Legacy Atria-era record (' + atria + '). It carries no Arena attestation, no machine ' +
      'status, no HEAD binding and no evidence object — see ' + LEGACY_ARCHIVE_REL +
      '. It cannot be promoted to PASS/CERTIFIED without Arena evidence reproduced on the recorded SHA, ' +
      'and the disposition it needs (fix / accept risk with owner+expiry / block) is an owner decision.';
    items.push({
      id,
      status: 'UNKNOWN',
      requirement: 'Legacy carry-over ' + id + ': ' + state.replace(/\s+/g, ' ').slice(0, 400),
      head_sha: head,
      reviews: ['arena'],
      known_limitations: [
        'Atria-era record only; not re-verified on this HEAD',
        'No Arena evidence exists for this item, so no status above UNKNOWN is claimed',
        'Disposition (fix / accepted risk with owner+expiry / block) still needs an owner decision'
      ],
      blocked: true,
      blocked_reason: blockedReason,
      owner_decision_required: true,
      evidence: [Object.assign({}, note)],
      arena: { status: 'BLOCKED', evidence: [Object.assign({}, note)] },
      legacy_record: {
        source: LEGACY_ARCHIVE_REL,
        atria_status: atria,
        previous_verdict: it.previous_verdict || null
      }
    });
  }
  return items;
}

function emit(head, outPath) {
  if (!/^[0-9a-f]{40}$/.test(String(head || ''))) {
    console.error('--emit requires --head <40-hex source SHA>');
    process.exit(2);
  }
  const parsed = {};
  for (const name of Object.keys(EVIDENCE)) {
    const p = parseLog(name, path.join(EVIDENCE_DIR, EVIDENCE[name].file));
    if (!p) { console.error('missing or unparsable evidence log: ' + EVIDENCE[name].file + ' (run --collect first)'); process.exit(2); }
    if (p.fail !== 0 || p.exit !== 0) { console.error('evidence log reports a failure: ' + EVIDENCE[name].file); process.exit(2); }
    parsed[name] = p;
  }
  const archive = JSON.parse(fs.readFileSync(path.join(ROOT, LEGACY_ARCHIVE_REL), 'utf8'));
  const legacyNote = evidenceObject(head, parsed.legacy, 'review_note');

  const items = legacyItems(head, archive, legacyNote);
  const m15 = [
    {
      id: 'M15-01-A',
      requirement: 'Evidence binds to the immutable SHA it was produced on: every artifact must exist in that commit with the declared sha256, exit_code must be 0 and checks_passed must equal checks_total. A stale or foreign SHA is rejected, not warned about.',
      scope: 'focused-suite P1 + negative fixtures V-02/V-02c/V-02d/V-02e/V-02f/V-02g',
      logs: ['focused', 'negative']
    },
    {
      id: 'M15-01-B',
      requirement: 'Registry completeness is provable in both directions: every expected id exists, every item is declared, no id is duplicated, and the live registry items are the declared contract.',
      scope: 'focused-suite P4 + negative fixtures G14b/G14c/G14d/G8-dup',
      logs: ['focused', 'negative']
    },
    {
      id: 'M15-01-C',
      requirement: 'Status discipline: a blocked or unverified item can never be reported as CERTIFIED, the registry headline may not out-claim its weakest item, an absent human decision is never hidden, and a registry that verifies nothing is not a green gate.',
      scope: 'focused-suite P2/P3/P5 + contract suite + negative fixtures V-09/V-10/V-13/V-15/V-15b/V-16',
      logs: ['focused', 'contract', 'negative']
    }
  ].map((item) => {
    const ev = item.logs.map((name) => evidenceObject(head, parsed[name], name === 'negative' ? 'negative_test' : 'positive_test'));
    return {
      id: item.id,
      status: 'RUNTIME_VERIFIED',
      requirement: item.requirement,
      head_sha: head,
      reviews: ['arena'],
      known_limitations: [
        'Executed and reviewed by the same Arena session — self-review, not an independent review',
        'Independence is not claimed: the Arena-only model has a single reviewer slot',
        'Evidence logs are shared between the M15-01 items; each item records which checks back it (scope)',
        'Human approval for the registry as a whole is still absent, so the registry stays NOT VERIFIED'
      ],
      scope: item.scope,
      evidence: ev,
      arena: { status: 'PASS', evidence: ev.map((e) => Object.assign({}, e)) }
    };
  });

  const all = items.concat(m15);
  const registry = {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    status: 'UNKNOWN',
    note: 'Arena is the sole required AI reviewer. Legacy A-01..A-29 records are preserved as BLOCKED/UNKNOWN with their ' +
      'Atria-era status quoted verbatim; they are NOT Arena attestations and MUST NOT be read as PASS/CERTIFIED. ' +
      'Only M15-01-A..C carry Arena evidence on this HEAD. The registry headline is UNKNOWN because the weakest ' +
      'recorded item is UNKNOWN, and human approval has not been granted.',
    head_bound: head,
    head_basis: 'Evidence for M15-01-A..C and the legacy inventory was produced on ' + head +
      ', the source commit that this registry-only metadata commit follows. Any code/test change after that SHA ' +
      'invalidates the binding and the tests must be re-run before the registry is rebound.',
    required_reviewers: ['arena'],
    reviews_recorded: {
      arena: [
        'M15-01 Chat 1 self-review on ' + head + ': focused acceptance suite, A-30 fixtures (mutation-verified) and ' +
        'the legacy inventory were executed and their output committed under docs/verification/evidence/. ' +
        'This record is Arena reviewing Arena; it is not independent verification.'
      ]
    },
    allowed_statuses: ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'],
    human_governance: {
      requires_human_approval: true,
      human_approved: false,
      approver: null,
      decided_at: null,
      head_sha: head,
      note: 'No human decision has been recorded for this HEAD. This field is deliberately false and the gate is ' +
        'expected to fail V-10 until the project owner records an approval (approver must be a human, not the AI reviewer).'
    },
    expected_ids: all.map((i) => i.id),
    open_owner_decisions: [
      {
        id: 'OD-1',
        item: 'Human approval of the verification registry',
        state: 'NOT DECIDED',
        why_it_blocks: 'V-10 is mandatory and unconditional; no amount of automated evidence satisfies it.'
      },
      {
        id: 'OD-2',
        item: 'strict-verification.yml runs on push to arena/** while V-06 push mode requires HEAD to be an ancestor of origin/main',
        state: 'NOT DECIDED',
        why_it_blocks: 'A branch push can never satisfy V-06. Changing the trigger drops CI coverage; changing V-06 ' +
          'alters a security contract. Both are owner decisions.'
      },
      {
        id: 'OD-3',
        item: 'Landing strategy for the registry-only metadata commit',
        state: 'NOT DECIDED',
        why_it_blocks: 'Only a single-parent landing (fast-forward) preserves the two-phase binding; a merge commit ' +
          'or a squash invalidates V-02/G9/V-10 by construction and the registry must be rebuilt after landing.'
      }
    ],
    false_green_blockers_on_head: [
      {
        id: 'FG-1',
        item: 'tests/api/* suites are outside npm test and outside the strict gate inventory',
        classification: 'REAL but UNEXECUTED BY ANY GATE (A-13/FG-1 carry-over)',
        owner_needed: true,
        state: 'NOT RE-VERIFIED in M15-01; no evidence was produced for it and no status is claimed'
      },
      {
        id: 'FG-2',
        item: 'npm test index.html build bit-identity check never reaches 35/35 on current HEAD',
        classification: 'LEGITIMATE RED (honestly failing), known pre-existing',
        owner_needed: true,
        state: 'NOT RE-VERIFIED in M15-01; no status is claimed'
      }
    ],
    items: all
  };
  fs.writeFileSync(outPath || path.join(ROOT, REGISTRY_REL), JSON.stringify(registry, null, 2) + '\n');
  console.log('EMITTED ' + (outPath ? path.relative(ROOT, outPath) : REGISTRY_REL) +
    ' head_bound=' + head + ' items=' + all.length + ' (legacy=' + items.length + ', arena-evidenced=' + m15.length + ')');
  console.log('STATUS ' + registry.status + ' | human_approved=' + registry.human_governance.human_approved +
    ' | verified_items=' + m15.length + '/' + all.length);
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const headArg = argv.includes('--head') ? argv[argv.indexOf('--head') + 1] : null;
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
if (argv.includes('--collect')) collect();
else if (argv.includes('--emit')) emit(headArg, outArg);
else {
  console.log('usage: node tools/m15-01-build-registry.js --collect');
  console.log('       node tools/m15-01-build-registry.js --emit --head <40-hex source SHA> [--out <path>]');
}
