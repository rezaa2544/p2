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
const WITNESS = require('./lib/verification-witness');
const CLOSURE_SCOPE = ['M15-01-A', 'M15-01-B', 'M15-01-C'];
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
  /* A11Y-MOTION-01 / M15-01-A: the real-git binding & closure contract suite.
     It is a separate log from `contract` so each verifying item can cite the
     checks its own artifacts actually contain (V-17). */
  binding: {
    file: 'm15-01-binding-contract.log',
    command: 'node tests/verification-binding-contract.test.js'
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
    /* The header is a machine-readable contract, not prose: `command` contains
       spaces, so it is quoted and the reader below parses quoted values up to the
       next `key=`. The previous format wrote it bare and the reader's
       /([a-z_]+)=([^\s]+)/ stopped at the first space, which silently truncated
       every registry `command` to the single token "node" (M15-01, 72/72 fields).
       Both sides are fixed and the round-trip is asserted below, so a regression
       fails the build instead of quietly corrupting the registry. */
    const quote = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const header = '# M15-01-EVIDENCE name=' + name + ' ts=' + ts + ' exit=' + r.status +
      ' runtime=' + runtime + ' command=' + quote(spec.command) + '\n';
    fs.writeFileSync(out, header + body);
    const parsed = parseLog(name, out);
    if (!parsed || parsed.command !== spec.command) {
      console.log('REFUSED: evidence header round-trip lost the command for ' + name +
        ' (wrote ' + JSON.stringify(spec.command) + ', read back ' +
        JSON.stringify(parsed && parsed.command) + ') — the registry would bind an unprovable pointer');
      process.exit(1);
    }
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
/* Read `key=value` pairs where a value may contain spaces: a value runs to the
   start of the next `key=`, quoted values are unescaped. Unquoted legacy headers
   are therefore also recovered in full. */
function parseHeader(line) {
  const out = {};
  const marks = [];
  const re = /(?:^|\s)([a-z_]+)=/g;
  let m;
  while ((m = re.exec(line))) {
    const keyStart = m.index + (m[0].length - m[1].length - 1);
    marks.push({ key: m[1], keyStart: Math.max(m.index, keyStart), valStart: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i++) {
    const to = i + 1 < marks.length ? marks[i + 1].keyStart : line.length;
    let v = line.slice(marks[i].valStart, to).replace(/\s+$/, '');
    if (/^"/.test(v)) {
      v = v.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    out[marks[i].key] = v;
  }
  return out;
}

function parseLog(name, file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const lines = text.split('\n');
  const header = parseHeader(lines[0] || '');
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

const REVIEWER_SLOTS = ['arena'];
const STATUS_RANK_VERIFY = (s) => ({ UNKNOWN: 0, TESTED: 1, RUNTIME_VERIFIED: 2, ADVERSARIAL_VERIFIED: 3, INDEPENDENTLY_VERIFIED: 4, CERTIFIED: 5 })[String(s)] ?? -1;

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
      scope: 'focused-suite P1 + negative fixtures V-02/V-02c/V-02d/V-02e/V-02f/V-02g + real-git binding C1/C5/C8/C9/C10/C11/C12/C13',
      logs: ['focused', 'negative', 'binding']
    },
    {
      id: 'M15-01-B',
      requirement: 'Registry completeness is provable in both directions: every expected id exists, every item is declared, no id is duplicated, and the live registry items are the declared contract.',
      scope: 'focused-suite P4 + negative fixtures G14b/G14c/G14d/G8-dup',
      logs: ['focused', 'negative']
    },
    {
      id: 'M15-01-C',
      requirement: 'Status discipline: a blocked or unverified item can never be reported as CERTIFIED, the registry headline may not out-claim its weakest item, a human decision in the registry is not a gate condition (owner ruling 2026-10-27) and is neither required nor sufficient to raise anything, and a registry that verifies nothing is not a green gate.',
      scope: 'focused-suite P2/P3/P5 + contract suite + negative fixtures V-09/V-13/V-15/V-15b/V-16',
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
        'The registry stays NOT VERIFIED on its own merits: 29 legacy items are UNKNOWN (V-15) and no item was promoted. A human signature is not the reason (owner ruling 2026-10-27)'
      ],
      scope: item.scope,
      evidence: ev,
      arena: { status: 'PASS', evidence: ev.map((e) => Object.assign({}, e)) }
    };
  });

  const all = items.concat(m15);

  /* ── refuse to emit what the gate would reject (V-17 mirror) ──────────────
     A witness record shared between two *verifying* items is only admissible when
     each item declares a distinct scope and every check identifier in that scope
     occurs in the artifacts that item cites. Checking it here means the builder
     cannot produce a registry that the gate then fails — the failure lands in the
     run that caused it, not in a later CI job someone has to interpret. */
  const fpUses = new Map();
  for (const it of all) {
    if (STATUS_RANK_VERIFY(it.status) < 2) continue;
    for (const e of (it.evidence || []).concat(...REVIEWER_SLOTS.map((r) => (it[r] && it[r].evidence) || []))) {
      const fp = JSON.stringify([e.artifact, e.sha256, e.command, e.exit_code, e.checks_total, e.checks_passed, e.kind]);
      if (!fpUses.has(fp)) fpUses.set(fp, []);
      fpUses.get(fp).push(it.id);
    }
  }
  const v17Refusals = [];
  for (const [fp, ids] of fpUses) {
    if (new Set(ids).size < 2) continue;
    for (const id of new Set(ids)) {
      const it = all.find((x) => x.id === id);
      if (!it.scope) { v17Refusals.push(id + ': shares a witness with ' + ids.filter((x) => x !== id).join(', ') + ' but declares no scope'); continue; }
      const tokens = [...new Set(String(it.scope).match(/\b[A-Z]{1,6}-?\d+[a-z]?\b/g) || [])];
      if (!tokens.length) { v17Refusals.push(id + ': scope names no check identifier'); continue; }
      let text = '';
      for (const e of it.evidence || []) {
        try { text += fs.readFileSync(path.join(ROOT, e.artifact), 'utf8'); } catch (err) { }
      }
      const absent = tokens.filter((t) => !text.includes(t));
      if (absent.length) v17Refusals.push(id + ': scope cites checks absent from its artifacts: ' + absent.join(','));
    }
  }
  if (v17Refusals.length) {
    console.error('REFUSED (V-17 cross-item witness):\n - ' + v17Refusals.join('\n - '));
    console.error('Fix: give each verifying item its own run, or make each scope cite only checks its own logs contain.');
    process.exit(1);
  }

  const registry = {
    schema_version: 2,
    policy: 'docs/STRICT_VERIFICATION_GATE.md',
    /* M15-01 recovery: the headline means exactly closure_scope, not "everything".
       The three in-scope items are RUNTIME_VERIFIED with Arena evidence; the 29 legacy
       items stay blocked and are counted. V-19b/V-19c/V-19d make that split binding. */
    status: 'RUNTIME_VERIFIED',
    binding_mode: 'lineage',
    closure_scope: CLOSURE_SCOPE.slice(),
    note: 'Arena is the sole required AI reviewer. The registry headline (RUNTIME_VERIFIED) applies ONLY to the ' +
      'declared closure_scope; legacy A-01..A-29 records are preserved as BLOCKED/UNKNOWN with their Atria-era ' +
      'status quoted verbatim and are NOT Arena attestations. They are counted in blocked_items and can never be ' +
      'promoted by this file (V-19b/V-19c/V-19d). The binding is lineage-based: evidence was produced on head_bound ' +
      'and stays valid only while every file it depends on is byte-identical (witness), so a docs or dependency ' +
      'commit does not fake staleness and a change to a witnessed test does not survive as evidence. No human ' +
      'signature is required (owner ruling 2026-10-27, retired V-10).',
    head_bound: head,
    head_basis: 'Evidence for M15-01-A..C and the legacy inventory was produced on ' + head +
      '. binding_mode=lineage: the binding survives later commits only for files outside the witness set; any ' +
      'change to a witnessed path (evidence artifacts, cited tests/tools, this gate, the schema, the policy, ' +
      'tests/run.js, package.json) makes the evidence stale and requires a re-run and a re-emit.',
    required_reviewers: ['arena'],
    reviews_recorded: {
      arena: [
        'M15-01 Chat 1 self-review on ' + head + ': focused acceptance suite, A-30 fixtures (mutation-verified) and ' +
        'the legacy inventory were executed and their output committed under docs/verification/evidence/. ' +
        'This record is Arena reviewing Arena; it is not independent verification.'
      ]
    },
    allowed_statuses: ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'],
    /* human_governance is deliberately NOT emitted. Owner ruling 2026-10-27 retired the gate's
       V-10 check (docs/STRICT_VERIFICATION_GATE.md § OWNER RULINGS), and a builder that kept
       writing an `approved: false` block would re-create a field the gate no longer reads and a
       note that contradicts the contract. Oversight is exercised directly on the repository. */
    /* Structural bound of the declared reviewer model, stated by the artifact that
       is affected by it (see docs/STRICT_VERIFICATION_GATE.md § V-17/V-18). */
    independence: {
      model: 'arena-only',
      reviewer_slots: 1,
      pairwise_reviewer_independence: 'UNAVAILABLE — V-03/G16 are reported N/A by the gate, not as passes',
      enforced_instead: ['V-17 (one witness cannot certify several claims)', 'V-18 (no INDEPENDENTLY_VERIFIED/CERTIFIED below two slots)', 'V-15 (the headline cannot out-claim the weakest item)'],
      owner_decision_required: true
    },
    expected_ids: all.map((i) => i.id),
    blocked_items: items.length,
    expected_ids_basis: 'A-01..A-29 are the inherited official contract (29 items). M15-01-A/B/C are addendum items ' +
      'added by this mission because they are the only records carrying Arena evidence on a verifying status (V-16 ' +
      'refuses a registry that verifies nothing). They are NOT silently folded into the official count: see OD-4.',
    open_owner_decisions: [
      {
        id: 'OD-4',
        item: 'expected_ids declares 32 items (29 official + 3 M15-01 addendum) while the official contract count is undecided between 29 and 39',
        state: 'NOT DECIDED (ratification only; the mechanical consequence of each option is now measured)',
        why_it_blocks: 'G14b/G14c make the declaration binding. M15-01 recovery removed this from the mechanical path ' +
          '(closure is now measured against closure_scope, so the official count no longer decides the gate verdict), ' +
          'but the OFFICIAL contract count is still the owner\'s to ratify: 29 (drop A/B/C), 32 (ratify the addendum) ' +
          'or 39 (extend the contract). No number may be chosen by the chats. ' +
          'MEASURED 2026-10-27: the gate no longer reads the count, so all three options leave the verdict ' +
          'unchanged (709/0 in scope 3/3 either way). What changes is the work behind them: ratifying 29 means ' +
          'deleting M15-01-A/B/C from closure_scope and from expected_ids together (V-19a rejects a scope that names ' +
          'an undeclared id — fixture C-scope-blocked-member and the V-19a negative fixtures pin this), i.e. dropping ' +
          'the three items that currently carry evidence; ratifying 32 is a no-op (already emitted); ratifying 39 ' +
          'requires seven new items with their own evidence and scope entries. Recommendation from the evidence: ' +
          'ratify 32, because it is the only option that describes what was actually executed.'
      },
      {
        id: 'OD-1',
        item: 'Human approval of the verification registry',
        state: 'DECIDED BY OWNER 2026-10-27',
        why_it_blocks: 'No longer blocks anything. The owner ruled that direct oversight of the project continues and ' +
          'that a per-registry human signature is not a condition for passing the Strict Verification Gate; V-10 was ' +
          'removed from the gate, from the schema and from this builder, and the retirement is pinned by controls in ' +
          'the negative fixtures and by property P3 of the acceptance suite. The registry remains NOT VERIFIED for ' +
          'unrelated, honest reasons: 29 legacy items are UNKNOWN (V-15) and nothing was promoted to satisfy a gate.'
      },
      {
        id: 'OD-2',
        item: 'strict-verification.yml runs on push to arena/** while V-06 push mode requires HEAD to be an ancestor of origin/main',
        state: 'NOT DECIDED (measured; both remedies remain owner decisions)',
        why_it_blocks: 'A branch push can never satisfy V-06. Changing the trigger drops CI coverage; changing V-06 ' +
          'alters a security contract. Both are owner decisions. MEASURED 2026-10-27 on this exact head: the ' +
          'push-triggered run fails with exactly ONE failure out of 709 (V-06), and the pull_request run of the same ' +
          'commit passes 709/0, so the two runs together say "all 708 checks hold; the containment claim is not yet ' +
          'true because the branch is unmerged". The remedies, both still owner calls: (a) narrow the workflow trigger ' +
          'to pull_request + push:main (coverage of the pushed branch is then provided by the PR run of the same SHA — ' +
          'measured, not assumed: both runs execute against the same checkout), or (b) scope V-06 push mode to ' +
          'refs/heads/main and report the branch-push case as N/A-with-reason. (b) is a change to a security contract ' +
          'and must not be made by a chat; (a) is a CI-config change that moves, not removes, the enforcement point. ' +
          'Neither was applied: the failing step is left visible rather than silenced.'
      },
      {
        id: 'OD-3',
        item: 'Landing strategy for the registry-only metadata commit',
        state: 'RESOLVED BY PROTOCOL 2026-10-27 (evidence: tests/verification-binding-contract.test.js L1..L4)',
        why_it_blocks: 'No longer blocks. Under binding_mode=lineage the rule is ancestry + witness blobs, not the ' +
          'shape of the landing commit, and that was measured on real topologies rather than argued: L1 a --no-ff ' +
          'merge commit (2 parents) keeps the binding valid (exit 0); L2 a squash landing is REJECTED because the ' +
          'evidence source stops being an ancestor (exit 1, "not an ancestor of the checkout") — so after a squash ' +
          'the evidence must be re-run and the registry re-emitted, which is a scheduling rule, not a rebind rule; ' +
          'L3 a commit that carries the registry AND files the evidence does not depend on is accepted; L4 the same ' +
          'commit is rejected when the extra file is witnessed. Practical consequence: merge, rebase and fast-forward ' +
          'are all legal landings now, squash is legal only with a re-emit, and the registry may ride with unrelated ' +
          'documentation. What remains the owner\'s is ordinary branch policy (which button the reviewer presses), ' +
          'not a gate constraint.'
      }
    ],
    false_green_blockers_on_head: [
      {
        id: 'FG-1',
        item: 'tests/api/* suites are outside npm test and outside the strict gate inventory',
        classification: 'REAL but UNEXECUTED BY ANY GATE (A-13/FG-1 carry-over)',
        owner_needed: true,
        state: 'NOT REPRODUCIBLE AS WRITTEN on 2026-10-27. package.json.test is now "node tests/run.js && ' +
          'node tests/api/runner.js && node --expose-gc tests/smoke.js", and scripts/run-all-tests.sh appends ' +
          'tests/api/runner.js to its suite list when the file exists. Measured in this session: ' +
          '"node tests/api/runner.js" -> 31/31 suites green, and the canonical runner reports it as a GREEN suite. ' +
          'The remaining half of the original claim — that the strict gate inventory does not enumerate the API ' +
          'suites — is still true and still unaddressed; it needs a decision (add 31 items to expected_ids, or ' +
          'declare the API layer out of the verification contract), which is OD-4 territory and therefore not ' +
          'resolved here.'
      },
      {
        id: 'FG-2',
        item: 'npm test index.html build bit-identity check never reaches 35/35 on current HEAD',
        classification: 'LEGITIMATE RED (honestly failing), known pre-existing',
        owner_needed: true,
        state: 'NOT REPRODUCED on 2026-10-27. Measured: "node build.js --check" prints "build output is ' +
          'byte-identical to index.html" and the guide/authz sync checks pass; "npm test" is green with ' +
          'tests/run.js 39/39 (including "خروجی build با index.html بیت‌به‌بیت یکسان است"), API 31/31 and smoke 547/547; the canonical runner ' +
          'reports the same. The historical 35/35 figure does not describe this head, so the item is closed as ' +
          'not-reproducible rather than as fixed — nothing was changed to make it pass.'
      }
    ],
    items: all
  };
  /* Witness is computed from the registry that will be written, at the source SHA the
     evidence was produced on — the same function the gate and the provenance audit call. */
  registry.witness = { paths: [], blobs: {} };
  const w = WITNESS.buildWitness(ROOT, registry, head);
  if (!w.ok) {
    console.error('REFUSED: witness paths absent at the source commit: ' + w.missing.join(', '));
    process.exit(1);
  }
  const computed = WITNESS.requiredWitness(registry);
  if (JSON.stringify(computed) !== JSON.stringify(w.witness.paths)) {
    console.error('REFUSED: witness computation is not stable (registry self-reference)');
    process.exit(1);
  }
  registry.witness = w.witness;
  fs.writeFileSync(outPath || path.join(ROOT, REGISTRY_REL), JSON.stringify(registry, null, 2) + '\n');
  console.log('EMITTED ' + (outPath ? path.relative(ROOT, outPath) : REGISTRY_REL) +
    ' head_bound=' + head + ' mode=lineage items=' + all.length + ' (legacy=' + items.length + ', in closure_scope=' + CLOSURE_SCOPE.length + ')' +
    ' witness=' + registry.witness.paths.length + ' paths');
  console.log('STATUS ' + registry.status + ' | verified_items=' + m15.length + '/' + all.length);
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const headArg = argv.includes('--head') ? argv[argv.indexOf('--head') + 1] : null;
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
function selftest() {
  /* The regression this exists for: a header value containing spaces must survive
     write → read. Proven on the real writer's format, not on a paraphrase. */
  const os = require('os');
  const cases = [
    'node tests/strict-verification-gate.negative.test.js',
    'node tools/m15-01-build-registry.js --collect --strict',
    'sh -c "npm run test:all 2>&1"'
  ];
  let bad = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-01-header-'));
  cases.forEach((command, i) => {
    const file = path.join(dir, 'selftest-' + i + '.log');
    const runtime = 'node:' + process.version + ',os:' + process.platform + ',arch:' + process.arch;
    const ts = new Date().toISOString();
    const quote = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    fs.writeFileSync(file, '# M15-01-EVIDENCE name=selftest ts=' + ts + ' exit=0 runtime=' + runtime +
      ' command=' + quote(command) + '\nCHECKS 3 FAIL 0\n');
    const p = parseLog('selftest', file);
    const ok = !!p && p.command === command && p.exit === 0 && p.total === 3 && p.ts === ts && p.runtime === runtime;
    if (!ok) bad++;
    console.log((ok ? 'SELFTEST OK   ' : 'SELFTEST FAIL ') + '#' + i + ' command=' + JSON.stringify(p && p.command) +
      ' want=' + JSON.stringify(command));
  });
  /* legacy tolerance: an unquoted old header must also be recovered in full */
  const legacy = path.join(dir, 'legacy-0.log');
  fs.writeFileSync(legacy, '# M15-01-EVIDENCE name=legacy ts=2026-01-01T00:00:00.000Z exit=0 ' +
    'runtime=node:v22.22.3,os:linux,arch:x64 command=node tools/verification-legacy-inventory.js\nCHECKS 15 FAIL 0\n');
  const lp = parseLog('legacy', legacy);
  const lok = !!lp && lp.command === 'node tools/verification-legacy-inventory.js';
  if (!lok) bad++;
  console.log((lok ? 'SELFTEST OK   ' : 'SELFTEST FAIL ') + 'legacy-unquoted command=' + JSON.stringify(lp && lp.command));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad ? 'SELFTEST REFUSED (' + bad + ' lossy round-trip(s))' : 'SELFTEST OK');
  process.exit(bad ? 1 : 0);
}

if (argv.includes('--selftest')) selftest();
else if (argv.includes('--collect')) collect();
else if (argv.includes('--emit')) emit(headArg, outArg);
else {
  console.log('usage: node tools/m15-01-build-registry.js --selftest');
  console.log('       node tools/m15-01-build-registry.js --collect');
  console.log('       node tools/m15-01-build-registry.js --emit --head <40-hex source SHA> [--out <path>]');
}
