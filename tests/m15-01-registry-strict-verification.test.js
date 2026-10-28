#!/usr/bin/env node
'use strict';
/**
 * tests/m15-01-registry-strict-verification.test.js
 *
 * M15-01 — Registry & Strict Verification repair: the five acceptance properties.
 *
 * The A-30 fixture suite (tests/strict-verification-gate.negative.test.js) owns the
 * per-exploit fixtures. This suite is the acceptance view on top of it: it groups
 * those fixtures by the property they defend, adds the properties that had no
 * fixture at all, and — most importantly — proves the fixtures are not vacuous by
 * running each one against a *deliberately weakened* copy of the gate. A fixture
 * that still "passes" when its check is disabled is not evidence.
 *
 * Properties:
 *   P1  evidence bound to a stale / foreign / uncommitted SHA is not accepted
 *   P2  the absence of Arena evidence never reads as PASS
 *   P3  a human approval that did not happen is never hidden
 *   P4  a missing, duplicated or undeclared item is detectable
 *   P5  a BLOCKED / NOT VERIFIED item can never become CERTIFIED
 *
 * Run: node tests/m15-01-registry-strict-verification.test.js
 * Exit: 0 only if every property holds AND every property is mutation-verified.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools', 'strict-verification-gate.js');
const NEGATIVE_SUITE = path.join(ROOT, 'tests', 'strict-verification-gate.negative.test.js');

let checks = 0, fail = 0;
const failures = [];
function chk(name, ok, detail) {
  checks++;
  if (ok) console.log('  OK   ' + name + (detail ? ' — ' + detail : ''));
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function runNegativeSuite(env, gateSrc) {
  const e = Object.assign({}, process.env, env || {});
  if (gateSrc) e.A30_GATE_SRC = gateSrc;
  const r = cp.spawnSync(process.execPath, [NEGATIVE_SUITE], {
    cwd: ROOT, encoding: 'utf8', timeout: 240000, env: e
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('==== M15-01 REGISTRY & STRICT VERIFICATION — ACCEPTANCE PROPERTIES ====');

/* ── 1. the five properties, each proven by named fixtures ──────────────── */
const PROPERTIES = [
  {
    name: 'P1 stale/foreign-SHA evidence is rejected',
    cases: ['V-02', 'V-02c', 'V-02d', 'V-02e'],
    note: 'forged evidence head_sha, registry head_bound mismatch, artifact edited after the commit, artifact never committed'
  },
  {
    name: 'P2 absence of Arena evidence is not PASS',
    cases: ['G10-no-arena-slot', 'V-09', 'V-09b'],
    note: 'Arena slot deleted, empty reviews_recorded, item.reviews omits the claimant'
  },
  {
    name: 'P4 missing/duplicate/undeclared items are detectable',
    cases: ['G14b', 'G14c', 'G14d', 'G8-dup'],
    note: 'declared id absent, undeclared item rides along, duplicate declaration, duplicate item'
  },
  {
    name: 'P5 BLOCKED/NOT VERIFIED cannot become CERTIFIED',
    cases: ['V-13a', 'V-13c', 'V-15', 'V-15b'],
    note: 'blocked item keeps a verifying status, BLOCKED verdict with verifying status, headline out-claims items, block buried under a green headline'
  },
  {
    name: 'P6 one witness cannot certify several claims',
    cases: ['V-17', 'V-17b', 'V-17c'],
    note: 'a byte-identical evidence record reused under another item id, the same tactic under an identical scope, and scopes citing check identifiers no cited log contains; the GOOD-SCOPED-SHARED control proves distinct scoped citations stay admissible'
  },
  {
    name: 'P7 a failing or empty run is never evidence (falsified in the A-30 fixtures)',
    cases: ['V-02f', 'V-02g', 'V-11', 'V-11b'],
    note: 'exit_code != 0, checks_passed != checks_total, zero-total and zero-passed evidence — the false-green path that made main report VERIFIED for a registry whose every run had failed'
  }
];
/* V-18 is only registered by the fixture when the contract declares a single reviewer
   slot, so this property list must match that condition rather than assume it. */
const CAP_PROPS = [];
try {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'verification', 'VERIFICATION_EVIDENCE_SCHEMA.json'), 'utf8'));
  if (!Array.isArray(schema.reviewers) || schema.reviewers.length < 2) {
    CAP_PROPS.push({
      name: 'P8 independence the reviewer contract cannot support is unreachable',
      cases: ['V-18'],
      note: 'INDEPENDENTLY_VERIFIED/CERTIFIED require a second reviewer slot; with one slot the gate caps them (V-18) and reports the vacuous V-03/G16 as N/A instead of counting them as passes'
    });
  }
} catch (e) { /* missing schema: the gate itself fails G15/V-12 first */ }

for (const prop of PROPERTIES.concat(CAP_PROPS)) {
  const r = runNegativeSuite({ A30_ONLY: prop.cases.join(',') });
  const missing = prop.cases.filter((c) => !new RegExp('^\\s+OK\\s+' + c + ' rejected', 'm').test(r.out));
  chk(prop.name, r.code === 0 && missing.length === 0,
    (missing.length ? 'not rejected: ' + missing.join(',') + ' ' : '') + 'exit=' + r.code);
  console.log('       ↳ ' + prop.note);
}

/* ── P3, rewritten by the owner ruling of 2026-10-27 (docs/STRICT_VERIFICATION_GATE.md
       § OWNER RULINGS): a human decision recorded inside the registry is not a gate
       condition. Asserted in BOTH directions, because a single "it is accepted now" line
       would also be satisfied by a gate that stopped checking anything. ────────────────── */
{
  const GATE_FILE = path.join(ROOT, 'tools', 'strict-verification-gate.js');
  const gateSrc = fs.readFileSync(GATE_FILE, 'utf8');
  chk('P3a no human-governance check is registered in the gate',
    !/chk\(\s*'V-10/.test(gateSrc) && !/'human_governance'/.test(gateSrc.split('REQUIRED_REGISTRY_KEYS = [')[1].split('];')[0]),
    'the gate still registers a V-10 check or requires the key');

  const a = runNegativeSuite({ A30_ONLY: 'GOOD,GOOD-NO-HUMAN-GOVERNANCE,GOOD-HUMAN-APPROVAL-FALSE' });
  const accepted = (a.out.match(/^\s+OK\s+GOOD control accepted/gm) || []).length;
  chk('P3b a registry with no human decision, or an unapproved one, is accepted (exit 0)',
    a.code === 0 && accepted === 3, 'accepted=' + accepted + ' exit=' + a.code);

  /* Non-vacuity: re-inject the retired requirement into a COPY of the gate and prove that the
     two new controls are precisely what turns red — while the fully valid GOOD control stays
     green under the same gate. This is the mutation-matrix discipline pointed at the deletion
     itself instead of at a surviving check. */
  const ANCHOR = "  const top = String(reg.status || '');";
  const occurrences = gateSrc.split(ANCHOR).length - 1;
  chk('P3c mutation anchor is unique in the gate', occurrences === 1, 'occurrences=' + occurrences);
  if (occurrences === 1) {
    const injected = gateSrc.replace(ANCHOR, ANCHOR +
      "\n  if (!isObj(reg.human_governance) || reg.human_governance.human_approved !== true || !isStr(reg.human_governance.approver)) { chk('V-10 human governance (re-injected)', false, 'no human approval recorded'); }");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-01-v10-'));
    try {
      const file = path.join(dir, 'gate-with-human-requirement.js');
      fs.writeFileSync(file, injected);
      /* One case per run so the verdict is the exit code itself, not a substring of a
         gate report that prints hundreds of lines. */
      const inv = (id) => runNegativeSuite({ A30_ONLY: id }, file);
      const good = inv('GOOD');
      const gone = inv('GOOD-NO-HUMAN-GOVERNANCE');
      const no = inv('GOOD-HUMAN-APPROVAL-FALSE');
      chk('P3d re-adding a human-approval requirement turns EXACTLY the two human controls red',
        good.code === 0 && gone.code !== 0 && no.code !== 0,
        'GOOD exit=' + good.code + ' no-block exit=' + gone.code + ' unapproved exit=' + no.code);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best-effort cleanup */ }
    }
  }
  console.log('       \u21b3 owner oversight continues directly on the repository; a per-registry signature is neither required nor able to raise a status. Independence stays capped by V-18 and the headline by V-15, both still asserted above.');
}

/* ── 2. controls: the gate must still accept conformant and honestly-blocked
       registries, otherwise every property above would be satisfied by a gate
       that simply rejects everything. ──────────────────────────────────────── */
{
  const r = runNegativeSuite({ A30_ONLY: 'GOOD,GOOD-PR-ANCESTRY' });
  const accepted = (r.out.match(/GOOD control accepted \(exit 0\)/g) || []).length;
  chk('C1 conformant registries are accepted (verifying + PR ancestry)',
    r.code === 0 && accepted === 2, 'accepted=' + accepted + ' exit=' + r.code);
  /* V-16 control: a schema-valid registry that verifies nothing is CONTRACT PASS,
     but it must not exit 0 and must never print VERDICT VERIFIED. */
  const b = runNegativeSuite({ A30_ONLY: 'GOOD-BLOCKED' });
  chk('C2 a registry that verifies nothing is not reported VERIFIED (V-16)',
    b.code === 0 && /CONTROL contract-only registry conforms but stays NOT VERIFIED/.test(b.out),
    'exit=' + b.code);
}

/* ── 3. mutation matrix: disable one check, the matching fixture must go red.
       If a fixture stays green with its check removed, the fixture proves nothing
       and this suite fails. ────────────────────────────────────────────────── */
const MUTATIONS = [
  /* `edits` lists every check that has to be switched off for the fixture to be
     accepted. A single entry means "this check is the only defence"; more than one
     means the fixture is defence-in-depth and the named neighbours also catch it —
     both are reported, neither is hidden. */
  { id: 'V-02 artifact bytes at the evidence SHA', fixture: 'V-02e', edits: [['const atSha = artifactShaAt(evidenceHead, e.artifact);', 'const atSha = e.sha256;']] },
  { id: 'V-02 exit_code', fixture: 'V-02f', edits: [['if (e.exit_code !== 0) bindErrs.push(', 'if (false) bindErrs.push(']] },
  { id: 'V-02 checks_passed == checks_total', fixture: 'V-02g', edits: [['if (isInt(e.checks_total) && isInt(e.checks_passed) && e.checks_passed !== e.checks_total) {', 'if (false) {']] },
  { id: 'V-13 blocked state (+V-15b/V-19b/V-19d/V-19e also catch it)', fixture: 'V-13a', edits: [
    ['if (blockedFlag) {', 'if (false) {'],
    ["chk('V-19b every in-scope item is verified with an Arena PASS', inScopeUnverified.length === 0 && inScopeBlocked.length === 0 && scopeMissing.length === 0,", "chk('V-19b every in-scope item is verified with an Arena PASS', true,"],
    ["chk('V-19d blocked items are outside closure_scope', blockedInScope.length === 0,", "chk('V-19d blocked items are outside closure_scope', true,"],
    ["chk('V-19e declared blocked_items count matches the registry', reg.blocked_items === blockedItems.length,", "chk('V-19e declared blocked_items count matches the registry', true,"],
    ["chk('V-15b a registry with blocked items cannot be CERTIFIED', blockedItems.length === 0 || topRank < STATUS_RANK.CERTIFIED,", "chk('V-15b a registry with blocked items cannot be CERTIFIED', true,"]
  ] },
  { id: 'V-13 non-PASS ceiling (+V-15b/V-19b/V-19d/V-19e also catch it)', fixture: 'V-13c', edits: [
    ["chk('V-19b every in-scope item is verified with an Arena PASS', inScopeUnverified.length === 0 && inScopeBlocked.length === 0 && scopeMissing.length === 0,", "chk('V-19b every in-scope item is verified with an Arena PASS', true,"],
    ["chk('V-19d blocked items are outside closure_scope', blockedInScope.length === 0,", "chk('V-19d blocked items are outside closure_scope', true,"],
    ["chk('V-19e declared blocked_items count matches the registry', reg.blocked_items === blockedItems.length,", "chk('V-19e declared blocked_items count matches the registry', true,"],
    ["if (arenaVerdict && arenaVerdict !== 'PASS' && itemRank >= VERIFYING_MIN_RANK) {", 'if (false) {'],
    ["} else if (arenaVerdict === 'BLOCKED') {", '} else if (false) {'],
    ["chk('V-15b a registry with blocked items cannot be CERTIFIED', blockedItems.length === 0 || topRank < STATUS_RANK.CERTIFIED,", "chk('V-15b a registry with blocked items cannot be CERTIFIED', true,"],
    ['process.exit(fail || nothingVerified ? 1 : 0);', 'process.exit(fail ? 1 : 0);']
  ] },
  { id: 'V-15 headline ceiling', fixture: 'V-15', edits: [["chk('V-15 registry status is bounded by its weakest in-scope item', topRank >= 0 && (scope.length === 0 ? topRank === 0 : topRank <= minScopeRank),", "chk('V-15 registry status is bounded by its weakest in-scope item', true,"]] },
  { id: 'V-15b blocked headline (+V-15 and V-16 also catch it)', fixture: 'V-15b', edits: [
    ["chk('V-15b a registry with blocked items cannot be CERTIFIED', blockedItems.length === 0 || topRank < STATUS_RANK.CERTIFIED,", "chk('V-15b a registry with blocked items cannot be CERTIFIED', true,"],
    ["chk('V-15 registry status is bounded by its weakest in-scope item', topRank >= 0 && (scope.length === 0 ? topRank === 0 : topRank <= minScopeRank),", "chk('V-15 registry status is bounded by its weakest in-scope item', true,"],
    ['process.exit(fail || nothingVerified ? 1 : 0);', 'process.exit(fail ? 1 : 0);']
  ] },
  { id: 'V-11 adversarial coverage', fixture: 'V-11b', edits: [["if (needsCoverage && !hasAdv) vac.push('no negative/adversarial evidence for a verifying status');", '']] },
  { id: 'G14c undeclared items (+V-19c and V-17 also catch the cloned rider)', fixture: 'G14c', edits: [
    ["chk('V-19c no item claims a verifying status outside closure_scope', offScopeClaims.length === 0,", "chk('V-19c no item claims a verifying status outside closure_scope', true,"],
    ["chk('V-17 ' + id + ' shared witness is scoped per item, not copied', v17.length === 0,", "chk('V-17 ' + id + ' shared witness is scoped per item, not copied', true,"],
    ["chk('G14c no undeclared/unknown items', undeclared.length === 0,", "chk('G14c no undeclared/unknown items', true,"]
  ] },
  { id: 'G14d duplicate declarations', fixture: 'G14d', edits: [["chk('G14d expected_ids has no duplicate entries', dupExpected.length === 0,", "chk('G14d expected_ids has no duplicate entries', true,"]] },
  { id: 'G14b missing declared item', fixture: 'G14b', edits: [["chk('G14b all declared items present (' + expected.length + ')', missing.length === 0,", "chk('G14b all declared items present (' + expected.length + ')', true,"]] },
  { id: 'G10 evidence-free verdict (+V-16 and V-19b also catch it)', fixture: 'G10-no-arena-slot', edits: [["chk('G10 ' + id + ' ' + r + ' verdict + evidence', REVIEWER_VERDICTS.includes(v.status) && evidenceOk,", "chk('G10 ' + id + ' ' + r + ' verdict + evidence', true,"],
    ["chk('V-19b every in-scope item is verified with an Arena PASS', inScopeUnverified.length === 0 && inScopeBlocked.length === 0 && scopeMissing.length === 0,", "chk('V-19b every in-scope item is verified with an Arena PASS', true,"],
    ['process.exit(fail || nothingVerified ? 1 : 0);', 'process.exit(fail ? 1 : 0);']
  ] },
  { id: 'V-09b retired reviewer slot', fixture: 'V-09d', edits: [["chk('V-09b reviews_recorded only uses known reviewer slots', rrUnknown.length === 0,", "chk('V-09b reviews_recorded only uses known reviewer slots', true,"]] },
  { id: 'V-16 nothing-verified exit', fixture: 'GOOD-BLOCKED', edits: [['process.exit(fail || nothingVerified ? 1 : 0);', 'process.exit(fail ? 1 : 0);']], expect: 'CONTROL' },
  { id: 'G17 uncommitted drift', fixture: 'G17', edits: [["chk('G17 no uncommitted tracked drift outside the registry', drift.length === 0,", "chk('G17 no uncommitted tracked drift outside the registry', true,"]] },
  { id: 'V-17 cross-item witness scoping (+V-19c also catches the clone)', fixture: 'V-17', edits: [["chk('V-17 ' + id + ' shared witness is scoped per item, not copied', v17.length === 0,", "chk('V-17 ' + id + ' shared witness is scoped per item, not copied', true,"],
    ["chk('V-19c no item claims a verifying status outside closure_scope', offScopeClaims.length === 0,", "chk('V-19c no item claims a verifying status outside closure_scope', true,"]] },
  { id: 'V-17 scope-token verification (fabricated citation) (+V-19c also catches the clone)', fixture: 'V-17c', edits: [
    ["const absent = tokens.filter((t) => !myText.includes(t));", "const absent = [];"],
    ["chk('V-19c no item claims a verifying status outside closure_scope', offScopeClaims.length === 0,", "chk('V-19c no item claims a verifying status outside closure_scope', true,"]
  ] },
  { id: 'V-18 status cap under a one-slot contract', fixture: 'V-18', edits: [["itemRank < 0 || itemRank <= capRank,", "true,"]] },
  { id: 'V-02 future timestamp', fixture: 'V-02h', edits: [["if (isDate(e.ts) && new Date(e.ts).getTime() > Date.now() + 15 * 60 * 1000) bindErrs.push(f.where + ': ts is in the future');", '']] }
];

const GATE_SRC_TEXT = fs.readFileSync(GATE, 'utf8');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm15-01-mutations-'));
try {
  for (const m of MUTATIONS) {
    let weakened = GATE_SRC_TEXT;
    let unique = true;
    for (const [from, to] of m.edits) {
      const occurrences = weakened.split(from).length - 1;
      if (occurrences !== 1) { unique = false; chk('M ' + m.id + ' mutation target is unique in the gate', false, 'occurrences=' + occurrences + ' for ' + JSON.stringify(from.slice(0, 60))); break; }
      weakened = weakened.split(from).join(to);
    }
    if (!unique) continue;
    const file = path.join(tmpRoot, 'gate-' + m.id.replace(/[^A-Za-z0-9]+/g, '-') + '.js');
    fs.writeFileSync(file, weakened);
    const r = runNegativeSuite({ A30_ONLY: m.fixture }, file);
    /* expected: with the check disabled the fixture reports the exploit as ACCEPTED */
    const detected = r.code !== 0 && (/ACCEPTED by gate \(defect\)/.test(r.out) || /FAIL CONTROL contract-only/.test(r.out));
    chk('M ' + m.id + ' → fixture ' + m.fixture + ' is not vacuous', detected,
      detected ? 'weakened gate accepted the exploit' : 'fixture stayed green with its check removed');
  }
} finally {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) { /* temp cleanup is best-effort */ }
}

/* NOTE ON SCOPE (deliberate)
   This suite asserts only about gate behaviour on isolated fixtures. It does NOT
   assert anything about the live docs/verification/VERIFICATION_REGISTRY.json,
   because its output is captured as the evidence artifact for a registry that is
   written in a later metadata-only commit — an assertion about "the current
   registry" would then describe a file that no longer exists at that path.
   Live-registry conformance is the gate's own job: run
   `node tools/strict-verification-gate.js` on the committed registry and read its
   per-check verdict (that run is reported with its exit code, never embedded here).
   The two directional invariants that ARE stable are proven on fixtures above:
   a registry that verifies nothing can never be reported VERIFIED (V-15/V-16),
   and a blocked item can never carry a raised status (V-13/V-15b). Human approval is
   no longer one of the invariants: the owner ruled on 2026-10-27 that it is not a gate
   condition, and P3 above proves both that its absence is accepted and that re-adding
   the requirement is caught. */

console.log('CHECKS ' + checks + ' FAIL ' + fail);
if (fail) {
  console.log('BLOCKERS');
  for (const f of failures) console.log(' - ' + f);
}
process.exit(fail ? 1 : 0);
