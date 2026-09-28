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

  console.log('══ REGISTRY PROVENANCE AUDIT ══');
  console.log('  registry head_bound : ' + reg.head_bound);
  console.log('  local HEAD          : ' + head);
  console.log('  origin/main         : ' + remote);
  const boundIsAncestor = reg.head_bound && reg.head_bound !== head
    ? !!(sh('merge-base --is-ancestor ' + reg.head_bound + ' ' + head) === '' ? false : true)
    : true;

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

  if (reg.head_bound !== head) {
    console.log('');
    console.log('  V-02 HEAD-BIND: MISMATCH (registry ' + reg.head_bound.slice(0, 10) +
      ' vs HEAD ' + head.slice(0, 10) + ')');
    console.log('    ancestor-of-HEAD: ' + (boundIsAncestor ? 'YES (evidence is STALE, not lost)' : 'NO (diverged — re-verify from scratch)'));
  }

  /* exit 2 = stale or head-mismatch (the gate would be red); exit 3 =
     unbound items present (registry cannot self-prove provenance at all). */
  const bad = stale > 0 || reg.head_bound !== head;
  process.exit(bad ? 2 : (unbound > 0 ? 3 : 0));
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
