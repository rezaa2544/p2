#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/registry-provenance.js — evidence-bound verification provenance
   ────────────────────────────────────────────────────────────────────────
   MISSION 02 / §4 — fix the stale-registry class of defect structurally.

   THE DEFECT (reproduced Mission 01, HEAD 691f8d6):

     docs/verification/VERIFICATION_REGISTRY.json carried
       head_bound: e4584806...
     while real origin/main was 691f8d6...  The gate's V-02 check compares
     head_bound to local HEAD, so the mismatch was DETECTED — but only by a
     human choosing to run the gate. Nothing made the staleness automatic,
     and a stale registry still parses as a well-formed registry.

   ROOT CAUSE:

     head_bound is a single scalar. Either it matches HEAD (green) or it does
     not (red). There is no middle state that says "this evidence was
     produced on an ancestor of HEAD and is therefore STALE-not-INVALID,
     pending re-run." So the registry can only ever be hand-edited to the new
     SHA — and a hand edit is exactly the operation that can be skipped.

   DESIGN (see the discussion of binding in §58 Evidence Ledger):

     Evidence should bind to the TREE STATE it was produced against, not to a
     scalar that must be rewritten by hand. This tool computes a content hash
     over the source files that an evidence item actually depends on, so:

       * evidence bound to an unchanged dependency set stays valid when the
         SHA moves but the relevant code did not (no false staleness), and
       * evidence bound to a changed dependency set is detected as STALE the
         instant the tree changes (no false freshness).

     That is stronger provenance than a single head_bound: it is stable
     across unrelated commits and precise about what the evidence covers.

   USAGE
     node tools/registry-provenance.js --audit          audit current registry
     node tools/registry-provenance.js --bind <item>    emit a provenance block
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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
  const head = sh('git rev-parse HEAD') || '(unknown HEAD)';
  const remote = (sh('git ls-remote origin refs/heads/main') || '').split(/\s+/)[0] || '(unreachable)';

  /* EVIDENCE COMMIT — mirror the strict gate exactly (tools/strict-verification-gate.js).
     A registry cannot store the SHA of the commit that contains it, so the documented
     protocol binds evidence to the PARENT of a registry-only, single-parent commit.
     This tool used to compare head_bound against the checkout HEAD only, so on a valid
     metadata-only landing commit it reported MISMATCH/UNBOUND while the gate correctly
     reported CONTRACT PASS — the two tools disagreed about the same commit. */
  let evidenceHead = head;
  let metadataOnlyBinding = false;
  let bindingNote = 'checkout HEAD (not a metadata-only commit)';
  try {
    const parentLine = cp.execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    const parts = parentLine ? parentLine.split(/\s+/) : [];
    if (parts.length === 2) {
      const changed = cp.execFileSync('git', ['diff', '--name-only', '--no-renames', parts[1], 'HEAD'],
        { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort();
      if (changed.length === 1 && changed[0] === 'docs/verification/VERIFICATION_REGISTRY.json') {
        evidenceHead = parts[1];
        metadataOnlyBinding = true;
        bindingNote = 'metadata-only registry commit; evidence binds parent ' + evidenceHead;
      }
    }
  } catch (e) { bindingNote = 'parent/diff unreadable: ' + String(e.message || e); }

  console.log('══ REGISTRY PROVENANCE AUDIT ══');
  console.log('  registry head_bound : ' + reg.head_bound);
  console.log('  local HEAD          : ' + head);
  console.log('  evidence commit     : ' + evidenceHead + '  (' + bindingNote + ')');
  console.log('  origin/main         : ' + remote);

  /* Ancestry, measured properly. The old expression ran a command without the `git`
     prefix (always throwing) and mapped the throw to "ancestor = true", so it printed
     the reassuring "STALE, not lost" line for EVERY input, including a SHA that does
     not exist. spawnSync status is the only trustworthy signal here. */
  const gitOk = (args) => {
    const r = cp.spawnSync('git', args, { cwd: ROOT });
    return r.status === 0;
  };
  const boundExists = !!reg.head_bound && gitOk(['cat-file', '-e', reg.head_bound + '^{commit}']);
  let bindState;
  if (!boundExists) bindState = 'INVALID (registry cites a SHA that is not a commit in this repository)';
  else if (reg.head_bound === evidenceHead) bindState = 'MATCH (head_bound equals the evidence commit)';
  else if (gitOk(['merge-base', '--is-ancestor', reg.head_bound, evidenceHead])) {
    bindState = 'STALE (evidence was produced on an ancestor of the evidence commit — re-run required)';
  } else bindState = 'DIVERGED (head_bound is not in the history of the evidence commit — re-verify from scratch)';

  let stale = 0;
  let current = 0;
  let unbound = 0;
  const rows = [];

  for (const item of (reg.items || [])) {
    const id = item.id;
    const files = DEPENDENCY_SETS[id];
    if (!files) { unbound++; rows.push({ id, state: 'NO_DEP_SET', note: 'add a dependency set' }); continue; }
    const dh = dependencyHash(files);
    const recorded = item.provenance && item.provenance.dependency_hash;
    if (!recorded) {
      unbound++;
      rows.push({ id, state: 'UNBOUND', note: 'hash ' + dh.hash + (dh.missing.length ? ' (missing ' + dh.missing.join(',') + ')' : '') });
      continue;
    }
    if (recorded === dh.hash) { current++; rows.push({ id, state: 'CURRENT', note: dh.hash }); }
    else { stale++; rows.push({ id, state: 'STALE', note: 'recorded ' + recorded + ' ≠ tree ' + dh.hash }); }
  }

  for (const r of rows) console.log('  ' + r.state.padEnd(12) + ' ' + r.id + ' — ' + r.note);
  console.log('────────────────────────────────────────');
  console.log('  CURRENT : ' + current);
  console.log('  STALE   : ' + stale + (stale ? '  ← re-run these items\' verification' : ''));
  console.log('  UNBOUND : ' + unbound + (unbound ? '  ← bind with --bind <id>' : ''));

  /* A per-item dependency hash is an OPTIONAL second layer (--bind). Its absence is
     not by itself a contradiction with the gate, which binds whole artifacts by
     sha256 at the evidence commit; it only means this weaker layer cannot vouch.
     Say which one it is instead of implying the registry is broken. */
  if (!metadataOnlyBinding) {
    console.log('');
    console.log('  BINDING MODE: checkout HEAD is not a registry-only metadata commit, so the');
    console.log('    two-phase protocol cannot bind here. Evidence MUST be produced on the');
    console.log('    parent of such a commit (docs/STRICT_VERIFICATION_GATE.md steps 1-8).');
  }
  console.log('');
  console.log('  V-02 HEAD-BIND: ' + bindState.replace('STALE (','MISMATCH — STALE (').replace('DIVERGED (','MISMATCH — DIVERGED (').replace('INVALID (','MISMATCH — INVALID ('));
  if (!boundExists) console.log('    (the gate reports the same condition as a SHA-binding failure)');
  else if (reg.head_bound !== evidenceHead) {
    console.log('    ancestor-of-evidence: ' + (gitOk(['merge-base', '--is-ancestor', reg.head_bound, evidenceHead]) ? 'YES' : 'NO'));
  }
  console.log('  EVIDENCE_SHA ' + evidenceHead + (metadataOnlyBinding ? ' (metadata-only registry commit)' : ''));
  console.log('  AGREES-WITH-GATE: ' + ((boundExists && reg.head_bound === evidenceHead) ? 'YES (same evidence SHA)' : 'NO (gate would also fail V-02)'));

  /* exit 0 = bound to the evidence commit AND no stale item AND nothing unbound.
     exit 2 = stale / mismatch / diverged / invalid (the gate is red for the same reason).
     exit 3 = provenance cannot be self-proved: unbound items or no metadata-only binding. */
  const hardFail = !boundExists || reg.head_bound !== evidenceHead || stale > 0;
  if (hardFail) process.exit(2);
  process.exit(unbound > 0 || !metadataOnlyBinding ? 3 : 0);
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
