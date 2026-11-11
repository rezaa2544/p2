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
  },
  /* The legacy revalidation harness (A-01..A-29) on the bound HEAD. When the
     local staging stacks are up, their connection envs (composed ONLY from the
     repo-tracked staging env files infra/postgres/.env.ha and
     infra/redis/.env.sentinel — local-only containers, no production secret)
     let the A-25 real-PG crash/DLQ drill run inside the harness; the header
     records the env SOURCE FILES, never the values. Without the stacks the
     harness still runs (in-memory modes) and A-25 honestly stays RUNTIME-PENDING,
     which maps to no promotion for that item. */
  legacy_reval: {
    file: 'm15-01-legacy-reval.log',
    command: 'node tools/legacy-revalidation.js',
    stagingEnv: true,
    timeoutMs: 900000
  },
  /* Negative proof for the legacy revalidation harness itself (V-11: a
     verifying item must carry BOTH positive and adversarial evidence): the
     mutation matrix proves each harness check flips red when its evidence
     source is absent/broken and no collateral check moves. */
  legacy_reval_neg: {
    file: 'm15-01-legacy-reval-negative.log',
    command: 'node tests/legacy-reval-negative.test.js',
    timeoutMs: 600000
  }
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ── --collect ──────────────────────────────────────────────────────────── */
/* Staging env composition for specs that declare stagingEnv: reads ONLY the
   repo-tracked staging env files (local container credentials) and composes
   the connection strings in memory. Values are never written to the evidence
   header or any artifact — only the source file names are recorded. */
function stagingEnvs() {
  const out = {};
  const read = (rel) => {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
  };
  const pgEnv = read('infra/postgres/.env.ha');
  const rdEnv = read('infra/redis/.env.sentinel');
  const one = (text, key) => { const m = text && text.match(new RegExp('^' + key + '=(.*)$', 'm')); return m ? m[1].trim() : null; };
  const pgPw = one(pgEnv, 'PGHA_PASSWORD');
  const rdPw = one(rdEnv, 'REDIS_PASSWORD');
  if (pgPw) out.DATABASE_URL = 'postgres://postgres:' + encodeURIComponent(pgPw) + '@127.0.0.1:15432/payesh';
  if (rdPw) out.REDIS_URL = 'redis://:' + encodeURIComponent(rdPw) + '@127.0.0.1:16379/0';
  return out;
}

function collect() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  let failures = 0;
  for (const [name, spec] of Object.entries(EVIDENCE)) {
    const out = path.join(EVIDENCE_DIR, spec.file);
    const env = Object.assign({}, process.env, spec.stagingEnv ? stagingEnvs() : {});
    const r = cp.spawnSync(process.execPath, spec.command.replace(/^node\s+/, '').split(/\s+/), {
      cwd: ROOT, encoding: 'utf8', timeout: spec.timeoutMs || 600000, env
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
    const envFrom = spec.stagingEnv
      ? ' envFrom=infra/postgres/.env.ha+infra/redis/.env.sentinel'
      : '';
    const header = '# M15-01-EVIDENCE name=' + name + ' ts=' + ts + ' exit=' + r.status +
      ' runtime=' + runtime + envFrom + ' command=' + quote(spec.command) + '\n';
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

function legacyItems(head, archive, note, reval) {
  const items = [];
  /* Per-check verdicts from the reval harness log: each check prints
     `A-XX <VERDICT> — <detail>`; the promotion reads ONLY this measured
     artifact (the builder never invents a verdict). */
  const verdicts = {};
  if (reval && reval.text) {
    for (const m of reval.text.matchAll(/^(A-\d+) (PASS|DEFECT-OPEN|PRESENCE-OK|DOCS-OK|RUNTIME-PENDING|RUNTIME-VERIFIED|FAIL)/gm)) {
      verdicts[m[1]] = { verdict: m[2], detailLine: m[0].trim() };
    }
  }
  const PROMOTABLE = { 'PASS': 1, 'DOCS-OK': 1, 'PRESENCE-OK': 1, 'RUNTIME-VERIFIED': 1 };
  for (const it of archive.items) {
    const id = String(it.id);
    const atria = String(it.atria_status || '(none recorded)');
    const state = String(it.current_head || it.evidence || '(no state recorded)');
    const v = verdicts[id];
    const promote = !!(v && PROMOTABLE[v.verdict]);
    if (promote) {
      const evObj = Object.assign({}, reval.evidence, { kind: 'positive_test' });
      const evNeg = Object.assign({}, revalNeg.evidence, { kind: 'negative_test' });
      const limitations = [
        'Executed and reviewed by the same Arena session — self-review, not an independent review',
        'Verified on the bound HEAD by the legacy-revalidation harness (scope token ' + id +
          ' in the evidence log); per-check measured detail is quoted in the log line for this id'
      ];
      if (/known limitation/.test(v.detailLine)) {
        limitations.push('Original vendor-gated scope is NOT exercised and stays a declared known limitation — ' +
          v.detailLine.replace(/^A-\d+ \S+ — /, ''));
      }
      if (v.verdict === 'DOCS-OK' || v.verdict === 'PRESENCE-OK') {
        limitations.push('Requirement shape is documentation/presence; verified by the executed exit-0 harness check, not by runtime behavior');
      }
      items.push({
        id,
        status: 'RUNTIME_VERIFIED',
        requirement: 'Legacy carry-over ' + id + ': ' + state.replace(/\s+/g, ' ').slice(0, 400),
        scope: 'legacy-reval ' + id,
        head_sha: head,
        reviews: ['arena'],
        known_limitations: limitations,
        blocked: false,
        owner_decision_required: false,
        evidence: [evObj, evNeg],
        arena: { status: 'PASS', evidence: [Object.assign({}, evObj), Object.assign({}, evNeg)] },
        legacy_record: {
          source: LEGACY_ARCHIVE_REL,
          atria_status: atria,
          previous_verdict: it.previous_verdict || null
        }
      });
      continue;
    }
    const blockedReason = 'Legacy Atria-era record (' + atria + '). It carries no Arena attestation, no machine ' +
      'status, no HEAD binding and no evidence object — see ' + LEGACY_ARCHIVE_REL +
      '. It cannot be promoted to PASS/CERTIFIED without Arena evidence reproduced on the recorded SHA, ' +
      'and the disposition it needs (fix / accept risk with owner+expiry / block) is an owner decision.' +
      (v ? ' Current reval verdict on HEAD: ' + v.verdict + ' (no promotion from a non-verifying state).' : '');
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

  /* The legacy reval log: parsed numbers + full text (the promotion reads the
     per-check verdict lines from the same committed artifact the registry cites). */
  const revalLogPath = path.join(EVIDENCE_DIR, EVIDENCE.legacy_reval.file);
  const revalText = fs.readFileSync(revalLogPath, 'utf8');
  const reval = { parsed: parsed.legacy_reval, text: revalText, evidence: evidenceObject(head, parsed.legacy_reval, 'positive_test') };
  const revalNeg = { evidence: evidenceObject(head, parsed.legacy_reval_neg, 'negative_test') };

  const items = legacyItems(head, archive, legacyNote, reval);
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
        'Legacy items carry their own legacy-revalidation evidence on this HEAD; the headline equals the weakest item (V-15)'
      ],
      scope: item.scope,
      evidence: ev,
      arena: { status: 'PASS', evidence: ev.map((e) => Object.assign({}, e)) }
    };
  });

  const all = items.concat(m15);

  /* ── headline: bounded by the weakest recorded item (V-15 mirror) ──
     The registry status is computed, never claimed: it is the minimum rank
     across all items, so it can never out-claim its own records. */
  const rankOfStatus = (s) => ({ UNKNOWN: 0, TESTED: 1, RUNTIME_VERIFIED: 2, ADVERSARIAL_VERIFIED: 3, INDEPENDENTLY_VERIFIED: 4, CERTIFIED: 5 })[String(s)] ?? -1;
  const minRank = Math.min.apply(null, all.map((i) => rankOfStatus(i.status)));
  const blockedCount = all.filter((i) => i.blocked === true).length;
  const promotedCount = all.filter((i) => rankOfStatus(i.status) >= 2).length;
  const headline = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'][Math.max(0, minRank)] || 'UNKNOWN';

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
    status: headline,
    note: 'Arena is the sole required AI reviewer. Legacy A-01..A-29 were re-validated on the bound HEAD by the ' +
      'legacy-revalidation harness (docs/verification/evidence/m15-01-legacy-reval.log): each item carries that ' +
      'harness run as its evidence with a per-item scope token, and items whose harness verdict is a verifying ' +
      'state are emitted RUNTIME_VERIFIED. Items whose verdict is DEFECT-OPEN / RUNTIME-PENDING / FAIL stay ' +
      'BLOCKED/UNKNOWN — the builder never promotes a non-verifying state. The registry headline equals the ' +
      'weakest recorded item (V-15) and is computed from the items, never claimed. The vendor-gated scopes ' +
      '(A-11 Fortify credentials, A-26 vendor SaaS credentials) remain declared known limitations (VENDORS task); ' +
      'the verified requirement for those ids is the documented-skip substitute contract, which the harness ' +
      'exercises on this HEAD. No human signature is required for any of this (owner ruling 2026-10-27, retired V-10).',
    head_bound: head,
    head_basis: 'Evidence for M15-01-A..C, the legacy inventory and the legacy revalidation was produced on ' + head +
      ', the source commit that this registry-only metadata commit follows. Any code/test change after that SHA ' +
      'invalidates the binding and the tests must be re-run before the registry is rebound.',
    required_reviewers: ['arena'],
    reviews_recorded: {
      arena: [
        'M15-01 Chat 1 self-review on ' + head + ': focused acceptance suite, A-30 fixtures (mutation-verified), ' +
        'the legacy inventory and the legacy revalidation harness were executed and their output committed under ' +
        'docs/verification/evidence/. This record is Arena reviewing Arena; it is not independent verification.'
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
    expected_ids_basis: 'A-01..A-29 are the inherited official contract (29 items). M15-01-A/B/C are addendum items ' +
      'added by this mission because they are the only records carrying Arena evidence on a verifying status (V-16 ' +
      'refuses a registry that verifies nothing). They are NOT silently folded into the official count: see OD-4.',
    open_owner_decisions: [
      {
        id: 'OD-4',
        item: 'expected_ids declares 32 items (29 official + 3 M15-01 addendum) while the official contract count is undecided between 29 and 39',
        state: 'NOT DECIDED',
        why_it_blocks: 'G14b/G14c make the declaration binding, so the addendum items can be kept only by owner ratification; ' +
          'dropping them instead leaves no Arena-evidenced verifying item and the gate stays NOT VERIFIED by V-16. ' +
          'No number may be chosen by the chats: the owner picks 29 (drop A/B/C), 32 (ratify the addendum) or 39 (extend the contract).'
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
        state: 'NOT DECIDED',
        why_it_blocks: 'A branch push can never satisfy V-06. Changing the trigger drops CI coverage; changing V-06 ' +
          'alters a security contract. Both are owner decisions.'
      },
      {
        id: 'OD-3',
        item: 'Landing strategy for the registry-only metadata commit',
        state: 'NOT DECIDED',
        why_it_blocks: 'Only a single-parent landing (fast-forward) preserves the two-phase binding; a merge commit ' +
          'or a squash invalidates V-02/G9 by construction and the registry must be rebuilt after landing.'
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
    ' head_bound=' + head + ' items=' + all.length + ' (legacy=' + items.length +
    ', arena-evidenced=' + m15.length + ', promoted=' + promotedCount + ', blocked=' + blockedCount + ')');
  console.log('STATUS ' + registry.status + ' | verified_items=' + promotedCount + '/' + all.length);
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
