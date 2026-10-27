#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────

   tools/registry-provenance.js — evidence-bound verification provenance

   WHAT THIS TOOL IS
     A per-item ledger (IN-SCOPE / OUT-SCOPE / BLOCKED) plus the binding, the
     witness and the closure arithmetic: a human-readable second opinion on the
     same question tools/strict-verification-gate.js answers.

   ONE RULE, ONE IMPLEMENTATION
     The rule lives in tools/lib/verification-witness.js and is called here, by
     the gate and by tools/m15-01-build-registry.js. That is not a style choice.
     Until 2026-10-27 this tool carried its own DEPENDENCY_SETS keyed by legacy
     ids plus a `provenance.dependency_hash` that no registry item ever carried
     and that the gate never read. Measured on main fff1beae, one registry gave

        gate  → 633 pass / 65 fail, exit 1  (every failure V-02/G9 head_bound vs evidence_sha)
        audit → 29 UNBOUND,         exit 2  (matching a field nothing writes)

     Two implementations of one contract is two contracts, and "which tool is
     right?" became a question a human had to answer. Now the module decides and
     both tools report the same verdict.

   WHAT THE BINDING MEANS (docs/STRICT_VERIFICATION_GATE.md § M15-01 RECOVERY)
     binding_mode "legacy"  head_bound must equal the evidence head (old rule).
     binding_mode "lineage" head_bound is the immutable SOURCE commit: a real
                            commit and an ancestor of the checkout, with every
                            witnessed path byte-identical at the source commit
                            (blob sha1 in witness.blobs) and at HEAD. Unrelated
                            docs or dependency commits keep the evidence valid;
                            an edit to a witnessed file makes it stale, and stale
                            is rejected, never warned about.

   EXIT CODES
     0  binding valid and the closure scope is consistent
     1  registry file missing — nothing to audit
     2  binding invalid/stale, or scope arithmetic fails (the gate is red for the
        same reason and names the same problem)
     3  the registry declares no closure scope, i.e. it cannot say what it proves

   USAGE
     node tools/registry-provenance.js --audit          audit the current registry
     node tools/registry-provenance.js --bind <item>    print a dependency-hash block
                                                        for a legacy id (historical)
   ───────────────────────────────────────────────────────────────────────
 */
'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WITNESS = require('./lib/verification-witness');
const REGISTRY = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');

function sh(cmd) {
  try {
    return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) { return null; }
}

/* The dependency sets are declared per item id, using the code paths the
   registry itself cites in each item's `current_head` / `evidence` fields.
   Keep this map beside the items it covers — if an item's evidence moves to
   different files, update the set, which is itself an audit trail entry. */
const DEPENDENCY_SETS = {
  'A-01': ['server/routes/analytics.js', 'server/db.js'],
  'A-02': ['server/routes/analytics.js'],
  'A-03': ['server/routes/attendance.js', 'server/db.js'],
  'A-04': ['server/routes/grades.js', 'server/db.js'],
  'A-05': ['server/cache.js', 'server/redis.js'],
  'A-06': ['server/sms.js', 'server/redis.js', 'server/otp-store.js', 'server/sync.js'],
  'A-07': ['tests/run.js'],
  'A-08': ['tests/api/runner.js'],
  'A-09': ['package.json', 'tests/run.js'],
  'A-10': ['tools/docs-refs-check.js'],
  'A-11': ['tools/docs-stats-sync.js'],
  'A-12': ['docs/verification/VERIFICATION_REGISTRY.json'],
  'A-18': ['server/sync.js', 'server/conflicts.js'],
  'A-19': ['server/routes/students.js', 'server/policy.js'],
  'A-20': ['server/occ.js', 'server/db.js', 'server/routes/students.js',
           'server/routes/classes.js', 'server/routes/attendance.js',
           'server/routes/grades.js', 'server/routes/users.js'],
  'A-22': ['server/redis.js', 'server/revocation.js', 'server/otp-store.js',
           'server/auth.js', 'server/sync.js'],
  'A-24': ['server/conflicts.js', 'server/conflict-transaction.js'],
  'A-26': ['server/index.js'],
  'A-27': ['server/index.js'],
  'A-28': ['server/index.js'],
  'A-29': ['server/index.js'],
};

/* Content hash over the listed paths as they exist in the CURRENT TREE.
   Blob SHAs would be equivalent; hashing content keeps the tool usable
   outside a git repo (e.g. an extracted tarball of a release). */
function dependencyHash(files) {
  const h = crypto.createHash('sha256');
  const missing = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { missing.push(rel); continue; }
    const data = fs.readFileSync(abs);
    h.update(rel + '\0' + data.length + '\0');
    h.update(data);
  }
  return { hash: h.digest('hex').slice(0, 16), missing };
}

function audit() {
  if (!fs.existsSync(REGISTRY)) {
    console.error('REGISTRY-ABSENT: ' + REGISTRY);
    process.exit(1);
  }
  const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const head = sh('git rev-parse HEAD') || '';
  const remote = (sh('git ls-remote origin refs/heads/main') || '').split(/\s+/)[0] || '(unreachable)';

  console.log('══ REGISTRY PROVENANCE AUDIT ══');
  console.log('  registry head_bound : ' + reg.head_bound);
  console.log('  local HEAD          : ' + head);
  console.log('  origin/main         : ' + remote);
  console.log('  binding_mode        : ' + (reg.binding_mode || 'legacy'));

  /* ONE rule, shared with the gate: tools/lib/verification-witness.js.
     The previous version of this tool kept its own DEPENDENCY_SETS keyed by legacy ids
     and its own `provenance.dependency_hash`, which no registry item ever carried and
     which the gate never read. That is why the gate and this audit could disagree and
     why the audit reported 29 UNBOUND items while the gate reported 65 binding failures
     for the same registry (measured on main fff1beae). Both now call the same code. */
  const binding = WITNESS.verifyBinding(ROOT, reg, head, head, false);
  const scope = Array.isArray(reg.closure_scope) ? reg.closure_scope.map(String) : [];
  const items = Array.isArray(reg.items) ? reg.items : [];
  const blocked = items.filter((it) => it && (it.blocked === true || (it.arena && it.arena.status === 'BLOCKED')));
  const byId = new Map(items.filter((it) => it && it.id).map((it) => [String(it.id), it]));

  const rows = [];
  for (const it of items) {
    const id = String(it && it.id);
    if (!it) continue;
    if (it.blocked === true || (it.arena && it.arena.status === 'BLOCKED')) { rows.push({ id: id, state: 'BLOCKED', note: String(it.blocked_reason || '').slice(0, 90) }); continue; }
    if (scope.includes(id)) { rows.push({ id: id, state: 'IN-SCOPE', note: String(it.status) }); continue; }
    rows.push({ id: id, state: 'OUT-SCOPE', note: String(it.status || '(none)') });
  }
  for (const r of rows) console.log('  ' + r.state.padEnd(10) + ' ' + r.id + ' — ' + r.note);

  /* closure-scope arithmetic, identical to V-19b/V-19c/V-19d/V-19e */
  const problems = [];
  for (const p of binding.problems) problems.push('binding: ' + p);
  if (!scope.length) problems.push('closure_scope absent or empty');
  for (const id of scope) {
    const it = byId.get(id);
    if (!it) { problems.push('closure_scope names an absent item: ' + id); continue; }
    if (it.blocked === true) problems.push('blocked item inside closure_scope: ' + id);
    const rank = ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'].indexOf(String(it.status));
    if (rank < 2) problems.push('in-scope item below the verifying band: ' + id + '=' + it.status);
    if (!it.arena || it.arena.status !== 'PASS') problems.push('in-scope item without an Arena PASS: ' + id);
  }
  const rankOf = (s) => ['UNKNOWN', 'TESTED', 'RUNTIME_VERIFIED', 'ADVERSARIAL_VERIFIED', 'INDEPENDENTLY_VERIFIED', 'CERTIFIED'].indexOf(String(s));
  const offScope = items.filter((it) => it && rankOf(it.status) >= 2 && !scope.includes(String(it.id))).map((it) => String(it.id));
  if (offScope.length) problems.push('items claim a verifying status outside closure_scope: ' + offScope.join(','));
  if (reg.blocked_items !== blocked.length) problems.push('blocked_items declared ' + reg.blocked_items + ' but ' + blocked.length + ' are blocked');
  const scopeRanks = scope.map((id) => (byId.get(id) ? rankOf(byId.get(id).status) : -1)).filter((r) => r >= 0);
  const minScope = scopeRanks.length ? Math.min.apply(null, scopeRanks) : -1;
  if (rankOf(reg.status) < 0 || (minScope >= 0 && rankOf(reg.status) > minScope)) {
    problems.push('registry status ' + reg.status + ' out-claims the weakest in-scope item (rank ' + minScope + ')');
  }
  if (blocked.length && rankOf(reg.status) >= rankOf('CERTIFIED')) problems.push('a registry with blocked items cannot be CERTIFIED');

  console.log('────────────────────────────────────────');
  /* The word MISMATCH is part of the audit's contract: tests/false-green-defense.js
     C6 asserts that a stale registry is not merely rejected but *named* as a
     head_bound mismatch, so a future rewrite cannot turn a real defect into a
     generic "invalid". */
  console.log('  HEAD-BIND  : ' + (binding.ok
    ? 'VALID (' + binding.mode + ')'
    : 'MISMATCH/INVALID (' + binding.mode + ')'));
  if (binding.witness) {
    console.log('  WITNESS    : ' + binding.witness.paths.length + ' path(s); ' +
      binding.witness.changedSinceSource.length + ' changed since ' + String(reg.head_bound).slice(0, 10));
  }
  console.log('  IN-SCOPE   : ' + scope.length + '   BLOCKED: ' + blocked.length + '   ITEMS: ' + items.length);
  console.log('  VERDICT    : ' + (problems.length ? 'PROVENANCE INVALID — ' + problems.length + ' problem(s)' : 'PROVENANCE VALID'));

  /* exit 0 = binding valid and scope consistent; exit 2 = binding invalid or stale
     (the gate would be red for the same reason); exit 3 = the registry declares no
     closure scope, i.e. it cannot state what it proves at all. */
  for (const p of problems) console.log('  PROBLEM    : ' + p);
  const bad = !binding.ok || problems.some((p) => !/^closure_scope absent/.test(p));
  process.exit(!binding.ok || bad ? 2 : (!scope.length ? 3 : 0));
}

function bind(itemId) {
  const files = DEPENDENCY_SETS[itemId];
  if (!files) {
    console.error('BIND-FAIL: no dependency set for ' + itemId);
    console.error('  add one to DEPENDENCY_SETS in this tool first — that is the audit trail.');
    process.exit(1);
  }
  const dh = dependencyHash(files);
  const head = sh('git rev-parse HEAD') || '(unknown HEAD)';
  const block = {
    provenance: {
      bound_head: head,
      dependency_hash: dh.hash,
      dependencies: files,
      bound_at: new Date().toISOString(),
      agent: process.env.HERMES_AGENT_LABEL || 'hermes',
    },
  };
  console.log(JSON.stringify(block, null, 2));
  if (dh.missing.length) {
    console.error('WARN: missing dependencies for ' + itemId + ': ' + dh.missing.join(','));
  }
  process.exit(dh.missing.length ? 3 : 0);
}

const mode = process.argv[2];
if (mode === '--audit') audit();
else if (mode === '--bind') bind(process.argv[3]);
else {
  console.error('usage: node tools/registry-provenance.js --audit | --bind <item-id>');
  process.exit(1);
}
