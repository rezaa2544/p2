#!/usr/bin/env node
'use strict';
/* PAYESH STRICT VERIFICATION GATE — A-30 hardened (V-01..V-12)
   Fail-closed: incomplete registry, wrong SHA, missing Arena review/evidence, vacuous/self-attested/injectable claims, or
   inability to prove an assertion => NOT VERIFIED + exit 1. No green fallback. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const REG = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
const ALLOW = path.join(ROOT, 'docs', 'verification', 'FALSE_GREEN_ALLOWLIST.json');
const SCHEMA = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json');
const ALERT_RULES = path.join(ROOT, 'infra', 'observability', 'alert-rules.yml');

/* canonical contracts (pinned — must equal the schema file, see V-12 below) */
const CANONICAL_STATUSES = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'];
const REVIEWERS = ['arena'];
const REVIEWER_VERDICTS = ['PASS', 'FAIL', 'BLOCKED'];
const EVIDENCE_KINDS = ['positive_test', 'negative_test', 'adversarial_test', 'runtime_evidence', 'failure_recovery_evidence', 'data_evidence', 'review_note'];
const POSITIVE_KINDS = ['positive_test', 'runtime_evidence', 'data_evidence'];
const ADVERSARIAL_KINDS = ['negative_test', 'adversarial_test', 'failure_recovery_evidence'];
/* OWNER RULING 2026-10-27 (docs/STRICT_VERIFICATION_GATE.md § OWNER RULINGS): a human
   sign-off recorded inside the registry is NOT a condition for passing this gate — direct
   owner oversight of the project continues without a per-registry signature. `human_governance`
   is therefore not a required key and no check reads it; a registry may still record a decision
   there as an annotation. Everything that rejects a claim stays: V-02 binding + artifact hashes,
   V-14/V-06 ancestry, V-11/V-12 schema + evidence completeness, G14/V-01 completeness,
   V-17 witness scoping, V-18 status reach, V-15/V-15b headline ceilings, V-16, G7 false-green. */
const REQUIRED_REGISTRY_KEYS = ['schema_version', 'policy', 'status', 'head_bound', 'required_reviewers', 'allowed_statuses', 'reviews_recorded', 'expected_ids', 'items'];
const REQUIRED_ITEM_KEYS = ['id', 'status', 'requirement', 'head_sha', 'reviews', 'known_limitations', 'evidence'];
const REQUIRED_EVIDENCE_KEYS = ['reviewer', 'kind', 'command', 'exit_code', 'checks_total', 'checks_passed', 'artifact', 'sha256', 'head_sha', 'runtime', 'ts'];
/* M15-01 addendum: an honestly BLOCKED item must be representable. Without a
   machine-readable block state the only ways to record "not verified" were to
   fabricate a PASS or to drop the item from the registry (which G14b then hides
   behind a shorter expected_ids). */
const BLOCKED_ITEM_KEYS = ['blocked', 'blocked_reason', 'owner_decision_required'];
const STATUS_RANK = { UNKNOWN: 0, TESTED: 1, RUNTIME_VERIFIED: 2, ADVERSARIAL_VERIFIED: 3, INDEPENDENTLY_VERIFIED: 4, CERTIFIED: 5 };
const VERIFYING_MIN_RANK = 2; /* RUNTIME_VERIFIED and above */
const SELF_CERT_SOURCES = /(?:^|\s)(?:server\/analytics\/intelligence-release-certification\.js|server\/infrastructure\/phase4-release-certification\.js)(?=\s|$)/;

let pass = 0, fail = 0, failures = [];
function chk(n, ok, d) { if (ok) { pass++; console.log('  OK ' + n + (d ? ' — ' + d : '')); } else { fail++; failures.push({ n: n, d: d }); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isInt(v) { return typeof v === 'number' && Number.isInteger(v); }
function isSha256(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }
function isSha1(v) { return typeof v === 'string' && /^[0-9a-f]{40}$/.test(v); }
function isDate(v) { return isStr(v) && !Number.isNaN(Date.parse(v)); }
const norm = (v) => JSON.stringify(v);

let head = '';
try { head = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (e) { }

/* Two-phase binding: a registry commit may bind evidence to its immutable parent
   only when the registry is the sole changed path. This avoids self-reference
   (editing the registry changes HEAD) without allowing code/workflow/test drift
   after evidence collection. All ancestry checks continue to use checkout HEAD. */
let evidenceHead = head;
let metadataOnlyBinding = false;
let metadataBindingReason = 'registry commit is not proven metadata-only';
try {
  /* Reject merge commits: a first-parent diff alone does not prove the second
     parent introduced no source changes. A metadata-only binding is a single-
     parent commit with exactly one changed path, the registry itself. */
  const parentLine = cp.execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const commitAndParents = parentLine ? parentLine.split(/\s+/) : [];
  if (commitAndParents.length !== 2) {
    metadataBindingReason = 'metadata-only binding requires a non-merge commit with exactly one parent; parent_count=' + Math.max(0, commitAndParents.length - 1);
  } else {
    const parent = commitAndParents[1];
    const changed = cp.execFileSync('git', ['diff', '--name-only', '--no-renames', parent, 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort();
    if (isSha1(parent) && changed.length === 1 && changed[0] === 'docs/verification/VERIFICATION_REGISTRY.json') {
      evidenceHead = parent;
      metadataOnlyBinding = true;
      metadataBindingReason = 'single-parent registry-only metadata commit; evidence binds parent ' + parent;
    } else {
      metadataBindingReason = 'changed paths=' + JSON.stringify(changed) + '; expected registry only';
    }
  }
} catch (e) {
  metadataBindingReason = 'no verifiable parent/diff: ' + String(e.message || e);
}
console.log('==== PAYESH STRICT VERIFICATION GATE ====');
chk('G1 current HEAD known', /^[0-9a-f]{40}$/.test(head), head);
chk('V-02 evidence binding mode explicit', !metadataOnlyBinding || evidenceHead !== head, metadataBindingReason);

/* ── V-14: the evidence SHA must be a real commit on THIS history line.
   A registry may not point its binding at a SHA that does not exist here (fetched
   or not), or at a commit that is not an ancestor of the checkout. Without this,
   the only defence against a foreign/stale SHA is the V-02 equality test, which
   reports "mismatch" but cannot distinguish a typo from an old release line. */
let evidenceShaIsCommit = false;
if (isSha1(evidenceHead)) {
  const isCommit = cp.spawnSync('git', ['cat-file', '-e', evidenceHead + '^{commit}'], { cwd: ROOT });
  const isAncestor = isCommit.status === 0
    ? cp.spawnSync('git', ['merge-base', '--is-ancestor', evidenceHead, head], { cwd: ROOT })
    : { status: 1 };
  evidenceShaIsCommit = isCommit.status === 0 && isAncestor.status === 0;
}
chk('V-14 evidence SHA is a commit in this history line', evidenceShaIsCommit,
  'evidence_sha=' + (evidenceHead || '(none)') + ' checkout_head=' + (head || '(none)'));
chk('G2 mandatory policy exists', fs.existsSync(path.join(ROOT, 'docs', 'STRICT_VERIFICATION_GATE.md')));
chk('G3 registry exists', fs.existsSync(REG));
let reg = null; try { reg = JSON.parse(read(REG)); } catch (e) { }
chk('G4 registry valid JSON', !!reg);
chk('G5 Arena is the sole required AI reviewer', !!reg && norm(reg.required_reviewers) === norm(REVIEWERS));
/* Honest disclosure, not a check: with a single reviewer slot the pairwise-distinct
   checks (V-03, G16) cannot fail. Independence is therefore not obtainable from AI
   review under this model; the compensating controls are G5 (one slot only), V-15 (the
   headline cannot out-claim the items), V-17 (one witness cannot certify several claims)
   and V-18 (no item may claim a status the reviewer contract cannot support). The vacuity
   is reported as N/A, never as a passed check. Human approval is NOT one of these controls:
   the owner ruled on 2026-10-27 that oversight is exercised directly on the project and not
   through a registry signature, so the gate neither requires nor rewards a human_governance
   block (retired V-10) — independence claims are refused by V-18 alone. */
if (REVIEWERS.length < 2) {
  console.log('  NOTE V-03/G16 independence checks are vacuous with ' + REVIEWERS.length +
    ' reviewer slot — reported as N/A (never as a pass) and capped by V-18; bounded additionally by G5/V-15/V-17/V-18');
  console.log('  NOTE cross-ITEM witness copying is not vacuous at N=1 and is policed by V-17');
}
let allowed = null; try { allowed = JSON.parse(read(ALLOW)); } catch (e) { }
chk('G6 explicit false-green allowlist exists', !!allowed && Array.isArray(allowed.items));
chk('G6a canonical alert rules exists', fs.existsSync(ALERT_RULES), path.relative(ROOT, ALERT_RULES));

/* ── V-12: evidence schema file exists and is pinned to the canonical contract ── */
let schema = null; try { schema = JSON.parse(read(SCHEMA)); } catch (e) { }
chk('V-12 schema file exists & valid JSON', !!schema, path.relative(ROOT, SCHEMA));
chk('V-12 schema matches canonical contract',
  !!schema &&
  norm(schema.required_registry_keys) === norm(REQUIRED_REGISTRY_KEYS) &&
  norm(schema.required_item_keys) === norm(REQUIRED_ITEM_KEYS) &&
  norm(schema.required_evidence_keys) === norm(REQUIRED_EVIDENCE_KEYS) &&
  norm(schema.evidence_kinds) === norm(EVIDENCE_KINDS) &&
  norm(schema.blocked_item_keys) === norm(BLOCKED_ITEM_KEYS) &&
  norm(schema.allowed_statuses) === norm(CANONICAL_STATUSES) &&
  norm(schema.reviewers) === norm(REVIEWERS) &&
  norm(schema.reviewer_verdicts) === norm(REVIEWER_VERDICTS));

/* ── V-07: false-green scanner (wider walk + own/only patterns + owned allowlist) ── */
function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|yml|yaml|sh|ts|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
const pats = [
  ['assert(true', /assert\s*\(\s*true\b/gi],
  ['process.exit(0)', /process\.exit\(\s*0\s*\)/g],
  ['|| true', /\|\|\s*true\b/g],
  ['0/0 checks', /0\s*\/\s*0\s*(?:checks?|tests?)/gi],
  ['self-skip', /\b(?:it|test|describe|suite)\s*\.\s*skip\s*\(/g],
  ['self-only', /\b(?:it|test|describe|suite)\s*\.\s*only\s*\(/g],
  ['expect-true-toBe', /\bexpect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\b/g]
];
const KNOWN_LABELS = new Set(pats.map((p) => p[0]));
/* G6b (upstream contract) — an allowlist entry only buys exemption when it carries the
   owner, the reason and a real (never-or-future) expiry that the policy demands.
   A bare {"pattern":...,"expires":"never"} blanket-silences a pattern across the whole
   repo: that is a mute button, not an allowlist. */
function allowlistValid(x) {
  return !!x && typeof x.owner === 'string' && x.owner.trim().length > 0 &&
    typeof x.reason === 'string' && x.reason.trim().length > 0 &&
    (x.expires === 'never' || (!isNaN(new Date(x.expires).getTime()) && new Date(x.expires) > new Date()));
}
let rawAllowed = 0, badAllow = [];
if (allowed && Array.isArray(allowed.items)) {
  for (const x of allowed.items) {
    rawAllowed++;
    if (allowlistValid(x)) { /* counted as structurally owned */ } else badAllow.push(String(x.pattern));
  }
}
chk('G6b allowlist entries carry owner+reason+valid expiry', rawAllowed === 0 || badAllow.length === 0,
  badAllow.length ? 'invalid: ' + badAllow.join(', ') : '');
/* G6c (A-30 superset) — allowlist entries are only honored when fully owned
   (owner/reason/expiry/replacement_test), a KNOWN scanner label, and optionally
   path-scoped so the gate's own scanner literals cannot blanket-approve the repo. */
const validAllow = [];
if (allowed && Array.isArray(allowed.items)) {
  allowed.items.forEach((a, i) => {
    const ok = isObj(a) && KNOWN_LABELS.has(String(a.pattern)) && isStr(a.owner) && isStr(a.reason) &&
      isStr(a.replacement_test) && (a.expires === 'never' || isDate(a.expires)) &&
      (a.path === undefined || isStr(a.path));
    chk('G6c allowlist entry ' + i + ' complete & owned', ok, ok ? a.pattern : JSON.stringify(a).slice(0, 160));
    if (ok) validAllow.push(a);
  });
}
const expired = (a) => a.expires !== 'never' && !(new Date(a.expires) > new Date());
const ALLOW_REL = 'docs/verification/FALSE_GREEN_ALLOWLIST.json';
const approved = (label, rel) => {
  const relN = rel.split('\\').join('/');
  const scoped = validAllow.some((a) => a.pattern === label && !expired(a) && (a.path === undefined || a.path === relN));
  if (scoped) return true;
  /* the allowlist file is self-describing: declaring a label inside it is not a use */
  return relN === ALLOW_REL && validAllow.some((a) => a.pattern === label && !expired(a));
};
function readRaw(p) { return fs.readFileSync(p, 'utf8'); }
for (const pair of pats) {
  const label = pair[0], re = pair[1];
  const hits = [];
  for (const f of walk(ROOT)) {
    const s = readRaw(f);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) hits.push(path.relative(ROOT, f) + ':' + (s.slice(0, m.index).split('\n').length));
  }
  const bad = hits.filter((h) => !approved(label, h.split(':')[0]));
  chk('G7 ' + label + ' has no unapproved hits', bad.length === 0, bad.slice(0, 15).join(', '));
}

/* ── V-06: prove the checkout is related to the remote in the correct direction.
   On main/push, HEAD must not be a local-only line beyond origin/main.
   On pull_request, the base (origin/main) must be an ancestor of the PR HEAD.
   Requiring PR HEAD to be an ancestor of main makes every unmerged PR fail by
   construction; branch-aware ancestry preserves the remote-binding contract. */
const rev = cp.spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
const originMain = (rev.status === 0 ? (rev.stdout || '').trim() : '');
chk('V-06 origin/main resolvable', isSha1(originMain) && originMain.length === 40, originMain || 'missing');
const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';
let contained = false;
if (isSha1(originMain)) {
  const ancestry = isPullRequest
    ? ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']
    : ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'];
  const anc = cp.spawnSync('git', ancestry, { cwd: ROOT });
  contained = anc.status === 0;
}
const ancestryLabel = isPullRequest
  ? 'V-06 PR base contained in HEAD'
  : 'V-06 HEAD contained in origin/main (not a local-only line)';
chk(ancestryLabel, contained, 'head=' + head + ' origin/main=' + originMain);

/* ── G17: the evidence must describe the committed tree.
   A run whose code was uncommitted proves nothing about the SHA it is filed
   under: the artifact hash can match while the test that produced it does not
   exist in the commit. The registry itself is exempt because a metadata commit
   is written *after* its evidence (two-phase binding above). */
const REG_REL = 'docs/verification/VERIFICATION_REGISTRY.json';
let drift = [];
try {
  const porcelain = cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' });
  drift = porcelain.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .map((line) => line.replace(/^[A-Z?!]{1,2}\s+/, '').replace(/^.*\s->\s/, ''))
    .filter((p) => p !== REG_REL);
} catch (e) {
  drift = ['<git status unavailable: ' + String(e.message || e) + '>'];
}
chk('G17 no uncommitted tracked drift outside the registry', drift.length === 0, drift.slice(0, 6).join(' | '));

/* ── V-02s: the artifact must exist *in the evidence commit*, not merely on disk.
   Previously only the working-tree bytes were hashed, so a log could be hashed
   against uncommitted content: the SHA binding then pointed at a commit that
   never contained the artifact. The bytes are now read out of git itself. */
const blobCache = new Map();
function artifactShaAt(rev, rel) {
  const key = rev + ':' + rel;
  if (blobCache.has(key)) return blobCache.get(key);
  let out = null;
  try {
    const r = cp.spawnSync('git', ['cat-file', 'blob', key], { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
    if (r.status === 0 && r.stdout) out = crypto.createHash('sha256').update(r.stdout).digest('hex');
  } catch (e) { out = null; }
  blobCache.set(key, out);
  return out;
}

if (reg && isObj(reg)) {
  /* ── registry-level machine: V-01, V-04a, V-05, V-02 ── */
  chk('V-01 registry declares a non-empty items array', Array.isArray(reg.items) && reg.items.length > 0,
    Array.isArray(reg.items) ? 'items=' + reg.items.length : 'items=' + typeof reg.items);
  chk('V-04 allowed_statuses is the canonical status machine', norm(reg.allowed_statuses) === norm(CANONICAL_STATUSES),
    norm(reg.allowed_statuses));
  const top = String(reg.status || '');
  chk('V-05 top-level status in machine & not BLOCKED*', CANONICAL_STATUSES.includes(top) && !/^BLOCKED/i.test(top), top || '(absent)');
  chk('V-02 registry head_bound matches immutable evidence SHA', reg.head_bound === evidenceHead, 'head_bound=' + reg.head_bound + ' evidence_sha=' + evidenceHead + ' checkout_head=' + head + (metadataOnlyBinding ? ' [metadata-only]' : ''));
  /* V-10 (human governance) retired here by the owner ruling of 2026-10-27 — see the note on
     REQUIRED_REGISTRY_KEYS and docs/STRICT_VERIFICATION_GATE.md. No check reads human_governance
     any more, so neither its absence nor an unapproved block can redden the gate, and equally:
     nothing here is unlocked by it. The registry still cannot become green by claiming less —
     V-16 refuses a registry that verifies nothing and V-15 caps the headline at its weakest item
     (main's registry is UNKNOWN with 29 legacy items, so it stays NOT VERIFIED on its own merits).
     The controls GOOD-NO-HUMAN-GOVERNANCE / GOOD-HUMAN-APPROVAL-FALSE in
     tests/strict-verification-gate.negative.test.js, plus property P3 of
     tests/m15-01-registry-strict-verification.test.js (which re-injects a human-approval
     requirement into a copy of this file and asserts EXACTLY those controls go red), keep this
     retirement from silently reverting. */
  chk('V-12 registry has all required keys', REQUIRED_REGISTRY_KEYS.every((k) => k in reg),
    REQUIRED_REGISTRY_KEYS.filter((k) => !(k in reg)).join(',') || 'complete');

  /* G14 (upstream contract) — completeness. An empty or partial registry must NOT be green:
     the registry declares the contract it intends to satisfy (expected_ids), then every
     declared id must be present. */
  if (Array.isArray(reg.items)) {
    const expected = Array.isArray(reg.expected_ids) ? reg.expected_ids.map(String) : [];
    chk('G14a registry declares its expected item contract', expected.length > 0,
      expected.length ? expected.length + ' ids declared' : 'expected_ids missing — cannot prove completeness');
    const present = new Set(reg.items.map((x) => String(isObj(x) ? x.id || '' : '')));
    if (expected.length) {
      const missing = expected.filter((e) => !present.has(e));
      chk('G14b all declared items present (' + expected.length + ')', missing.length === 0,
        'missing: ' + missing.slice(0, 10).join(', '));
      /* M15-01 addendum — completeness is a two-way contract. G14b only proves
         that declared ids exist; it silently accepted an item that rides along
         without ever being declared (an unbudgeted/unknown claim). Both
         directions, plus duplicate declarations, are named here. */
      const declared = new Set(expected);
      const undeclared = [...present].filter((x) => !declared.has(x));
      chk('G14c no undeclared/unknown items', undeclared.length === 0,
        'undeclared: ' + undeclared.slice(0, 10).join(', '));
      const dupExpected = expected.filter((x, i) => expected.indexOf(x) !== i);
      chk('G14d expected_ids has no duplicate entries', dupExpected.length === 0,
        dupExpected.join(', '));
    }
  }

  /* ── V-15: the registry may not out-claim its own items.
     Without this, a registry whose 29 items are all UNKNOWN could still carry
     status CERTIFIED at the top, and a single blocked item could be buried under
     a green headline. The headline is bounded by the weakest recorded item. */
  const rankOf = (s) => (Object.prototype.hasOwnProperty.call(STATUS_RANK, String(s)) ? STATUS_RANK[String(s)] : -1);
  const topRank = rankOf(reg.status);
  const itemRanks = Array.isArray(reg.items) ? reg.items.map((it) => rankOf(isObj(it) ? it.status : undefined)) : [];
  const minItemRank = itemRanks.length ? Math.min(...itemRanks) : -1;
  chk('V-15 registry status is bounded by its weakest item', topRank >= 0 && minItemRank >= 0 && topRank <= minItemRank,
    'top=' + reg.status + '(' + topRank + ') weakest_item_rank=' + minItemRank);
  const blockedItems = Array.isArray(reg.items)
    ? reg.items.filter((it) => isObj(it) && (it.blocked === true || (isObj(it.arena) && it.arena.status === 'BLOCKED')))
    : [];
  chk('V-15b blocked items cap the registry below the verifying band', blockedItems.length === 0 || topRank <= STATUS_RANK.TESTED,
    'blocked_items=' + blockedItems.length + ' top=' + reg.status);

  /* ── V-09b/V-09c: recorded reviews must be attributable to a known slot and be
     real, distinct records. A reviewer slot invented in reviews_recorded (the
     legacy chatgpt/atria names, or a duplicate of the Arena record) must not buy
     corroboration for a PASS. */
  const rr = isObj(reg.reviews_recorded) ? reg.reviews_recorded : {};
  const rrUnknown = Object.keys(rr).filter((k) => !REVIEWERS.includes(k));
  chk('V-09b reviews_recorded only uses known reviewer slots', rrUnknown.length === 0, rrUnknown.join(', '));
  const rrBad = REVIEWERS.filter((r) => rr[r] !== undefined &&
    (!Array.isArray(rr[r]) || rr[r].some((x) => !isStr(x)) || new Set(rr[r]).size !== rr[r].length));
  chk('V-09c reviews_recorded records are distinct non-empty entries', rrBad.length === 0, rrBad.join(', '));

  /* ── V-17 support: fingerprint every evidence record and index it by item.
     Two records match only when artifact bytes, command, exit code and check counts
     all agree — a genuinely different run is a different witness. */
  const fpOf = (e) => norm([e.artifact, e.sha256, e.command, e.exit_code, e.checks_total, e.checks_passed, e.kind]);
  const witnessIndex = new Map();
  if (Array.isArray(reg.items)) {
    for (const it0 of reg.items) {
      if (!isObj(it0) || rankOf(it0.status) < VERIFYING_MIN_RANK) continue;
      const id0 = String(it0.id || '');
      const recs = [];
      if (Array.isArray(it0.evidence)) recs.push(...it0.evidence);
      for (const r of REVIEWERS) if (isObj(it0[r]) && Array.isArray(it0[r].evidence)) recs.push(...it0[r].evidence);
      for (const e of recs) {
        if (!isObj(e)) continue;
        const fp = fpOf(e);
        if (!witnessIndex.has(fp)) witnessIndex.set(fp, []);
        const uses = witnessIndex.get(fp);
        if (!uses.some((u) => u.id === id0)) uses.push({ id: id0, scope: isStr(it0.scope) ? it0.scope : '', artifact: String(e.artifact || '') });
      }
    }
  }

  if (Array.isArray(reg.items)) {
    const ids = new Set();
    for (const item of reg.items) {
      const id = isObj(item) ? String(item.id || '') : '';
      chk('G8 unique item ' + id, !!id && !ids.has(id));
      ids.add(id);
      chk('G9 ' + id + ' binds immutable evidence SHA', item.head_sha === evidenceHead, 'item=' + item.head_sha + ' evidence_sha=' + evidenceHead + ' checkout_head=' + head);
      /* G10 (M15-01) — the Arena slot must exist, carry a machine verdict, and carry
         evidence. A FAIL/BLOCKED verdict is a legitimate *non-green* outcome: it is
         recorded, it is evidence-backed, and V-13 caps the item status accordingly.
         It never becomes PASS, and a PASS is never inferred from missing evidence. */
      for (const r of REVIEWERS) {
        const v = isObj(item[r]) ? item[r] : {};
        const evidenceOk = Array.isArray(v.evidence) && v.evidence.length > 0;
        chk('G10 ' + id + ' ' + r + ' verdict + evidence', REVIEWER_VERDICTS.includes(v.status) && evidenceOk,
          (v.status || 'missing') + (evidenceOk ? '' : ' [no evidence]'));
        if (v.status !== undefined && !REVIEWER_VERDICTS.includes(v.status)) chk('V-04 ' + id + ' ' + r + ' verdict in machine', false, v.status);
      }
      if (item.status === 'CERTIFIED') {
        chk('G11 ' + id + ' certified with 3 PASS', REVIEWERS.every((r) => item[r] && item[r].status === 'PASS'));
        chk('G12 ' + id + ' has evidence', Array.isArray(item.evidence) && item.evidence.length >= 3);
      } else {
        /* G13 was a tautology: "not CERTIFIED implies not CERTIFIED". It is replaced by
           the real property — a non-CERTIFIED item must not claim certification through
           its reviewer verdicts or through an unsupported status rank (V-13). */
        const claims = REVIEWERS.filter((r) => isObj(item[r]) && item[r].status === 'PASS' && rankOf(item.status) >= STATUS_RANK.CERTIFIED);
        chk('G13 ' + id + ' non-certified item does not claim certification', claims.length === 0,
          claims.length ? 'status=' + item.status + ' with PASS verdict' : '');
      }
      chk('V-04 ' + id + ' status in machine', CANONICAL_STATUSES.includes(String(item.status)), String(item.status));

      /* ── V-13: verdict, status and block state must agree.
         The legacy registry had no status field at all, so every legacy item simply
         vanished from the machine (all 29 items failed V-04/V-12) and a reader could
         only see a prose `atria_status` string. A blocked item is now a first-class,
         machine-checked record: it must stay UNKNOWN and say why, and a BLOCKED/FAIL
         verdict can never sit next to a verifying status. */
      const v13 = [];
      const arenaVerdict = isObj(item.arena) ? String(item.arena.status || '') : '';
      const itemRank = rankOf(item.status);
      const blockedFlag = item.blocked === true;
      if (arenaVerdict && arenaVerdict !== 'PASS' && itemRank >= VERIFYING_MIN_RANK) {
        v13.push('verdict ' + arenaVerdict + ' cannot carry status ' + item.status);
      }
      if (blockedFlag) {
        if (item.status !== 'UNKNOWN') v13.push('blocked item must stay UNKNOWN, got ' + item.status);
        if (arenaVerdict !== 'BLOCKED') v13.push('blocked=true requires the Arena verdict BLOCKED, got ' + (arenaVerdict || 'missing'));
        const missingBlocked = BLOCKED_ITEM_KEYS.filter((k) => !(k in item));
        if (missingBlocked.length) v13.push('blocked item missing ' + missingBlocked.join(','));
        else {
          if (!isStr(item.blocked_reason)) v13.push('blocked_reason must be a non-empty string');
          if (typeof item.owner_decision_required !== 'boolean') v13.push('owner_decision_required must be boolean');
        }
      } else if (arenaVerdict === 'BLOCKED') {
        v13.push('verdict BLOCKED requires blocked=true (a hidden block is not a record)');
      }
      chk('V-13 ' + id + ' verdict/status/block state consistent', v13.length === 0, v13.join(' | '));


      /* G15 (upstream contract, object-aware merge) — evidence must be reproducible, not prose.
         Each reviewer entry has to point at a repo artifact or a command/URL, and any
         tests|tools path it cites must actually exist on this HEAD — a citation to a file
         that is not there is a fabricated result, not evidence. Structured (object)
         evidence is normalized to its string values before the pointer test. */
      const evText = (e) => {
        if (isObj(e)) {
          const vals = [];
          (function collect(v) {
            if (typeof v === 'string') vals.push(v);
            else if (Array.isArray(v)) v.forEach(collect);
            else if (isObj(v)) Object.values(v).forEach(collect);
          })(e);
          return vals.join(' ').trim();
        }
        return String(e || '').trim();
      };
      for (const r of REVIEWERS) {
        const v = item[r] || {};
        if (!Array.isArray(v.evidence)) continue;
        for (const e of v.evidence) {
          const t = evText(e);
          chk('G15a ' + id + ' ' + r + ' evidence is reproducible pointer',
            /(?:^|[\s,;])(?:(?:tests|tools|server|docs|infra|migrations|src)\/[^\s,;)]+|(?:^|\s)node\s+|\bhttps?:\/\/)/i.test(t),
            t.slice(0, 70));
          const m = t.match(/(?:tests|tools)\/[A-Za-z0-9_\-./]+\.(?:js|mjs|cjs)/);
          if (m) chk('G15b ' + id + ' ' + r + ' cited file exists', fs.existsSync(path.join(ROOT, m[0])), m[0]);
        }
      }
      /* G16 (upstream contract, object-aware merge) — independence. Three reviewers quoting
         the same text are one review; the three-AI rule is void if evidence is copied
         between reviewers. Structured evidence is compared as normalized JSON. */
      const texts = REVIEWERS.map((r) => {
        const v = item[r];
        return v && Array.isArray(v.evidence)
          ? v.evidence.map((e) => (isObj(e) ? norm(e) : String(e || '').trim())).join('\n')
          : null;
      }).filter((x) => x !== null);
      const dupes = texts.filter((x, i) => texts.indexOf(x) !== i);
      /* Vacuity is disclosed, never counted: with one reviewer slot there is no pair to
         compare, so G16 has no assertion value here. It re-activates automatically if the
         reviewer contract widens; V-17 is what actually polices copied witnesses at N=1. */
      if (REVIEWERS.length >= 2) {
        chk('G16 ' + id + ' reviewer evidence is not duplicated', dupes.length === 0,
          dupes.length ? 'identical evidence across reviewers' : '');
      } else console.log('  N/A  G16 ' + id + ' cross-reviewer duplication — vacuous at ' + REVIEWERS.length + ' reviewer slot');

      /* evidence slots: item-level + per reviewer */
      const slots = [{ slot: 'item', entries: Array.isArray(item.evidence) ? item.evidence : null }];
      for (const r of REVIEWERS) slots.push({ slot: r, entries: isObj(item[r]) && Array.isArray(item[r].evidence) ? item[r].evidence : null });
      const flat = [];
      for (const s of slots) if (s.entries) for (let i = 0; i < s.entries.length; i++) flat.push({ where: s.slot + '[' + i + ']', e: s.entries[i] });

      /* ── V-17 (M15-01): one witness may not certify several claims by copying.
         Cross-ITEM reuse is not excused by a single-reviewer model: the defect is not
         "two reviewers agreed" but "one run was pasted under two ids". A byte-identical
         evidence record may back more than one *verifying* item only when each item
         declares a `scope` that (a) differs from every co-user's scope and (b) names
         check identifiers that actually occur in the artifacts that item cites. A scope
         citing a check no cited log contains is a fabricated citation, so it fails.
         Blocked/UNKNOWN items are exempt: they assert nothing, and forcing a per-item
         log for 29 honest non-claims would push authors to invent one. */
      const v17 = [];
      if (itemRank >= VERIFYING_MIN_RANK) {
        const myFps = new Set(flat.filter((f) => isObj(f.e)).map((f) => fpOf(f.e)));
        const myText = (() => {
          let t = '';
          for (const f of flat) {
            if (!isObj(f.e) || !isStr(f.e.artifact)) continue;
            const ap = path.resolve(ROOT, f.e.artifact);
            if (!ap.startsWith(ROOT + path.sep) || !fs.existsSync(ap)) continue;
            try { t += fs.readFileSync(ap, 'utf8'); } catch (e) { /* V-02 reports unreadable artifacts */ }
          }
          return t;
        })();
        for (const fp of myFps) {
          const uses = witnessIndex.get(fp) || [];
          const others = uses.filter((u) => u.id !== id);
          if (!others.length) continue;
          const mine = uses.find((u) => u.id === id);
          const shared = others.map((o) => o.id).join(', ');
          if (!isStr(mine.scope)) { v17.push('record ' + mine.artifact + ' is shared with ' + shared + ' and this item declares no scope'); continue; }
          for (const o of others) if (o.scope === mine.scope) v17.push('record ' + mine.artifact + ' is shared with ' + o.id + ' under an identical scope');
          const tokens = [...new Set(String(mine.scope).match(/\b[A-Z]{1,6}-?\d+[a-z]?\b/g) || [])];
          if (!tokens.length) v17.push('scope names no check identifier: ' + String(mine.scope).slice(0, 70));
          else {
            const absent = tokens.filter((t) => !myText.includes(t));
            if (absent.length) v17.push('scope cites checks absent from this item\'s artifacts: ' + absent.slice(0, 6).join(','));
          }
        }
      }
      chk('V-17 ' + id + ' shared witness is scoped per item, not copied', v17.length === 0,
        v17.slice(0, 3).join(' | ') || 'no cross-item witness reuse');

      /* ── V-18 (M15-01): a status may not claim more reviewers than exist.
         INDEPENDENTLY_VERIFIED and CERTIFIED mean "corroborated by another reviewer".
         With one declared slot that meaning is unattainable, so those ranks are
         unreachable — the cap is enforced here instead of being bought back by a
         vacuous V-03/G16 pass. */
      const capRank = REVIEWERS.length >= 2 ? STATUS_RANK.CERTIFIED : STATUS_RANK.ADVERSARIAL_VERIFIED;
      chk('V-18 ' + id + ' status reachable with ' + REVIEWERS.length + ' reviewer slot(s)',
        itemRank < 0 || itemRank <= capRank,
        itemRank > capRank ? 'status=' + item.status + ' requires >=2 reviewer slots; unreachable under this contract' : item.status);
      /* V-02: binding — every evidence object must bind head + existing artifact + real
         hash + bytes that exist AT THE EVIDENCE SHA + a run that actually succeeded.
         A hash of uncommitted bytes, a non-zero exit_code, or "N of M checks" is not
         evidence: it describes something other than the commit it is filed under. */
      const bindErrs = [];
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) { bindErrs.push(f.where + ': not an object'); continue; }
        if (e.head_sha !== evidenceHead) bindErrs.push(f.where + ': head_sha mismatch (expected evidence SHA ' + evidenceHead + ')');
        if (!isStr(e.artifact) || !isSha256(e.sha256)) { bindErrs.push(f.where + ': artifact/sha256 missing'); continue; }
        const ap = path.resolve(ROOT, e.artifact);
        if (!ap.startsWith(ROOT + path.sep) || !fs.existsSync(ap)) { bindErrs.push(f.where + ': artifact not in repo: ' + e.artifact); continue; }
        const actual = crypto.createHash('sha256').update(fs.readFileSync(ap)).digest('hex');
        if (actual !== e.sha256) bindErrs.push(f.where + ': sha256 mismatch (working tree)');
        const atSha = artifactShaAt(evidenceHead, e.artifact);
        if (atSha === null) bindErrs.push(f.where + ': artifact absent from evidence commit ' + String(evidenceHead).slice(0, 12) + ': ' + e.artifact);
        else if (atSha !== e.sha256) bindErrs.push(f.where + ': bytes at evidence SHA differ from declared sha256 (stale or tampered): ' + e.artifact);
        if (e.exit_code !== 0) bindErrs.push(f.where + ': exit_code=' + e.exit_code + ' (a failing run is not evidence)');
        if (isDate(e.ts) && new Date(e.ts).getTime() > Date.now() + 15 * 60 * 1000) bindErrs.push(f.where + ': ts is in the future');
        if (isInt(e.checks_total) && isInt(e.checks_passed) && e.checks_passed !== e.checks_total) {
          bindErrs.push(f.where + ': checks_passed ' + e.checks_passed + ' != checks_total ' + e.checks_total);
        }
      }
      chk('V-02 ' + id + ' evidence binds immutable SHA+artifact+hash+exit0', bindErrs.length === 0, bindErrs.slice(0, 4).join(' | '));

      /* V-03: the three reviewers' evidence must be independent (not byte-clones) */
      const reviewerSlots = REVIEWERS.map((r) => ({ r, entries: slots.find((s) => s.slot === r).entries }));
      const hashes = reviewerSlots.map((s) => norm(s.entries));
      const distinct = new Set(hashes).size === hashes.length;
      if (REVIEWERS.length >= 2) {
        chk('V-03 ' + id + ' reviewer evidence independent (pairwise distinct)', distinct, reviewerSlots.map((s) => s.r + ':' + (Array.isArray(s.entries) ? s.entries.length : 'none')).join(' '));
      } else console.log('  N/A  V-03 ' + id + ' pairwise reviewer independence — vacuous at ' + REVIEWERS.length + ' reviewer slot; V-17/V-18 apply instead');

      /* V-08: self-attesting certification modules may not be the sole evidence source */
      const cmds = flat.filter((f) => isObj(f.e) && isStr(f.e.command)).map((f) => String(f.e.command));
      const selfOnly = cmds.length > 0 && cmds.every((c) => SELF_CERT_SOURCES.test(c));
      chk('V-08 ' + id + ' not certified by self-attesting sources alone', !selfOnly,
        selfOnly ? 'all ' + cmds.length + ' commands are self-certification modules' : cmds.length + ' commands checked');

      /* V-09: injected reviewer PASS must be corroborated by recorded review + item.reviews + slot identity */
      const inj = [];
      for (const r of REVIEWERS) {
        const v = item[r] || {};
        if (v.status !== 'PASS') continue;
        const rec = isObj(reg.reviews_recorded) ? reg.reviews_recorded[r] : undefined;
        if (!Array.isArray(rec) || rec.length === 0) inj.push(r + ': not in reviews_recorded');
        if (!Array.isArray(item.reviews) || !item.reviews.includes(r)) inj.push(r + ': not in item.reviews');
        if (Array.isArray(v.evidence)) for (let i = 0; i < v.evidence.length; i++) {
          const e = v.evidence[i];
          if (isObj(e) && e.reviewer !== undefined && e.reviewer !== r) inj.push(r + ': evidence[' + i + '] reviewer=' + e.reviewer);
        }
      }
      chk('V-09 ' + id + ' reviewer PASS corroborated (recorded + reviews + identity)', inj.length === 0, inj.join(' | '));

      /* V-11: no vacuous 0/0 evidence. The positive+adversarial coverage requirement
         applies to items that CLAIM a verifying status (RUNTIME_VERIFIED and above):
         a blocked/untested record is allowed to carry only the review note that
         explains why — that is a recorded non-claim, not empty compliance. */
      const vac = [];
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) continue;
        if (!isInt(e.checks_total) || e.checks_total < 1) vac.push(f.where + ': checks_total=' + e.checks_total);
        if (!isInt(e.checks_passed) || e.checks_passed < 0 || (isInt(e.checks_total) && e.checks_passed > e.checks_total)) vac.push(f.where + ': checks_passed=' + e.checks_passed);
      }
      const kinds = flat.filter((f) => isObj(f.e)).map((f) => f.e.kind);
      const hasPos = kinds.some((k) => POSITIVE_KINDS.includes(k));
      const hasAdv = kinds.some((k) => ADVERSARIAL_KINDS.includes(k));
      const needsCoverage = itemRank >= VERIFYING_MIN_RANK;
      if (flat.length === 0) vac.push('no evidence entries at all');
      if (needsCoverage && !hasPos) vac.push('no positive/runtime evidence for a verifying status');
      if (needsCoverage && !hasAdv) vac.push('no negative/adversarial evidence for a verifying status');
      chk('V-11 ' + id + ' evidence non-vacuous' + (needsCoverage ? ' & adversarially covered' : ' (non-verifying status)'),
        vac.length === 0, vac.slice(0, 4).join(' | '));

      /* V-12: item + evidence schema */
      const sch = [];
      const missingItem = REQUIRED_ITEM_KEYS.filter((k) => !(k in item));
      if (missingItem.length) sch.push('item missing: ' + missingItem.join(','));
      if (!Array.isArray(item.reviews) || !REVIEWERS.every((r) => item.reviews.includes(r))) sch.push('reviews must cover the three reviewers');
      if (Array.isArray(item.reviews)) {
        const unknownSlots = item.reviews.filter((r) => !REVIEWERS.includes(r));
        if (unknownSlots.length) sch.push('unknown reviewer slot(s) in item.reviews: ' + unknownSlots.join(','));
        const dupSlots = item.reviews.filter((r, i) => item.reviews.indexOf(r) !== i);
        if (dupSlots.length) sch.push('duplicate item.reviews entries: ' + dupSlots.join(','));
      }
      if (!Array.isArray(item.known_limitations)) sch.push('known_limitations not an array');
      if (!isStr(item.requirement)) sch.push('requirement missing');
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) sch.push('item.evidence missing/empty');
      for (const f of flat) {
        const e = f.e;
        if (!isObj(e)) { sch.push(f.where + ': evidence not an object'); continue; }
        const miss = REQUIRED_EVIDENCE_KEYS.filter((k) => !(k in e));
        if (miss.length) { sch.push(f.where + ': missing ' + miss.join(',')); continue; }
        if (!REVIEWERS.includes(e.reviewer)) sch.push(f.where + ': reviewer not in trio');
        if (!EVIDENCE_KINDS.includes(e.kind)) sch.push(f.where + ': bad kind ' + e.kind);
        if (!isStr(e.command)) sch.push(f.where + ': command');
        if (typeof e.exit_code !== 'number') sch.push(f.where + ': exit_code');
        if (!isInt(e.checks_total)) sch.push(f.where + ': checks_total');
        if (!isInt(e.checks_passed)) sch.push(f.where + ': checks_passed');
        if (!isStr(e.artifact)) sch.push(f.where + ': artifact');
        if (!isSha256(e.sha256)) sch.push(f.where + ': sha256');
        if (!isSha1(e.head_sha)) sch.push(f.where + ': head_sha');
        if (!isObj(e.runtime) || Object.keys(e.runtime).length === 0) sch.push(f.where + ': runtime');
        if (!isDate(e.ts)) sch.push(f.where + ': ts');
      }
      chk('V-12 ' + id + ' item+evidence schema', sch.length === 0, sch.slice(0, 5).join(' | '));
    }
  }
}

const certified = reg && Array.isArray(reg.items) ? reg.items.filter((x) => x && x.status === 'CERTIFIED').length : 0;
/* ── V-16 (M15-01): contract conformance is not verification.
   A registry whose items are all UNKNOWN used to print "VERDICT VERIFIED" and exit 0
   as long as every structural check passed — i.e. a perfectly honest "we have done
   nothing" registry read as a green gate. An incomplete registry is NOT VERIFIED by
   the policy, so the gate now refuses both the verdict and the exit code until at
   least one item is in the verifying band and carries an Arena PASS. */
const itemList = reg && Array.isArray(reg.items) ? reg.items : [];
const rankOfStatus = (s) => (Object.prototype.hasOwnProperty.call(STATUS_RANK, String(s)) ? STATUS_RANK[String(s)] : -1);
const verifiedItems = itemList.filter((x) => isObj(x) &&
  rankOfStatus(x.status) >= VERIFYING_MIN_RANK && isObj(x.arena) && x.arena.status === 'PASS');
const registryRank = reg ? rankOfStatus(reg.status) : -1;
const nothingVerified = fail === 0 && (verifiedItems.length === 0 || registryRank < VERIFYING_MIN_RANK);
console.log('RESULT ' + pass + ' pass / ' + fail + ' fail');
console.log('HEAD ' + head);
console.log('EVIDENCE_SHA ' + evidenceHead + (metadataOnlyBinding ? ' (metadata-only registry commit)' : ''));
console.log('CERTIFIED ' + certified);
console.log('CONTRACT ' + (fail ? 'FAIL' : 'PASS'));
console.log('VERIFIED_ITEMS ' + verifiedItems.length + '/' + itemList.length + ' at registry status ' + String(reg && reg.status));
console.log('VERDICT ' + (fail || nothingVerified ? 'NOT VERIFIED' : 'VERIFIED'));
if (fail) { console.log('BLOCKERS'); failures.forEach((x) => console.log(' - ' + x.n + (x.d ? ' — ' + x.d : ''))); }
if (nothingVerified) console.log('BLOCKER — V-16 registry conforms to the schema but verifies nothing (no item in the verifying band)');
process.exit(fail || nothingVerified ? 1 : 0);
