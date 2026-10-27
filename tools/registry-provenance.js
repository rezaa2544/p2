#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/registry-provenance.js — two-phase SHA & artifact provenance auditor
   ────────────────────────────────────────────────────────────────────────
   Implements the exact same two-phase SHA-binding & provenance contract as
   `tools/strict-verification-gate.js` (`docs/STRICT_VERIFICATION_GATE.md` §3):

     1. Single-commit binding: `reg.head_bound === HEAD` and all evidence
        blobs exist in `HEAD` with matching SHA-256 digests.
     2. Two-phase registry-only metadata commit (`Issue #472`):
        `HEAD` has `parent_count === 1` (non-merge, non-root), modifies
        strictly and only regular file `100644`
        `docs/verification/VERIFICATION_REGISTRY.json` (`--no-renames`),
        non-registry git tree matches `HEAD~1`, and `reg.head_bound === HEAD~1`.
        In that case `evidenceHead = HEAD~1`.
     3. Rejects tree mismatches, unrelated/diverged SHAs, root or merge commits,
        post-generation artifact or working-tree tampering, stale evidence
        commits, nonzero exit codes, incomplete check counts, and `expected_ids`
        completeness drift.

   Exit codes:
     0 — Provenance & two-phase SHA binding valid AND every declared item is
         verified (non-UNKNOWN, non-BLOCKED, reviewer PASS).
     1 — Registry missing, unreadable JSON, or invalid CLI arguments.
     2 — Stale/mismatched `head_bound`, invalid two-phase commit shape, tree
         mismatch, unrelated SHA, post-generation tampering, or completeness
         failure (gate contract FAIL).
     3 — Provenance & two-phase SHA binding valid (`0` stale / `0` tampered),
         but one or more declared items remain `UNKNOWN` / `BLOCKED` / unverified
         (honest `NOT VERIFIED` under `V-15` / `V-16`).

   USAGE
     node tools/registry-provenance.js --audit          audit current registry
     node tools/registry-provenance.js --bind <item>    emit a provenance block
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.PAYESH_REPO_ROOT
  ? path.resolve(process.env.PAYESH_REPO_ROOT)
  : path.resolve(__dirname, '..');
const REGISTRY_REL = 'docs/verification/VERIFICATION_REGISTRY.json';
const REGISTRY = path.join(ROOT, 'docs', 'verification', 'VERIFICATION_REGISTRY.json');
const STATUS_RANK = {
  UNKNOWN: 0,
  TESTED: 1,
  RUNTIME_VERIFIED: 2,
  ADVERSARIAL_VERIFIED: 3,
  INDEPENDENTLY_VERIFIED: 4,
  CERTIFIED: 5
};

function isSha1(v) {
  return typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
}

function isSha256(v) {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

function gitOut(args) {
  try {
    const r = cp.spawnSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024
    });
    if (r.status !== 0) return null;
    return String(r.stdout || '').trim();
  } catch (_e) {
    return null;
  }
}

function gitOk(args) {
  try {
    const r = cp.spawnSync('git', args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return r.status === 0;
  } catch (_e) {
    return false;
  }
}

function blobSha256At(rev, relPath) {
  if (!isSha1(rev) || typeof relPath !== 'string' || !relPath) return null;
  try {
    const r = cp.spawnSync('git', ['cat-file', 'blob', rev + ':' + relPath], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024
    });
    if (r.status !== 0 || !Buffer.isBuffer(r.stdout)) return null;
    return crypto.createHash('sha256').update(r.stdout).digest('hex');
  } catch (_e) {
    return null;
  }
}

function nonRegistryTreeDigest(rev) {
  const listing = gitOut(['ls-tree', '-r', rev]);
  if (listing === null) return null;
  const filtered = listing
    .split(/\r?\n/)
    .filter((line) => line && !line.endsWith('\t' + REGISTRY_REL))
    .join('\n');
  return crypto.createHash('sha256').update(filtered, 'utf8').digest('hex');
}

/* Complete dependency sets across all 32 declared registry items (A-01..A-29 +
   M15-01-A..C). Never self-reference docs/verification/VERIFICATION_REGISTRY.json
   here because writing the registry would invalidate its own dependency hash. */
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
  'A-12': ['tools/strict-verification-gate.js', 'docs/STRICT_VERIFICATION_GATE.md', 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json'],
  'A-13': ['tests/api/runner.js', 'tests/ci-test-parity-contract.js'],
  'A-14': ['server/db.js', 'tools/migrate-ledger.js'],
  'A-15': ['server/index.js', 'server/auth.js'],
  'A-16': ['server/policy.js', 'authz/model.json'],
  'A-17': ['server/audit.js'],
  'A-18': ['server/sync.js', 'server/conflicts.js'],
  'A-19': ['server/routes/students.js', 'server/policy.js'],
  'A-20': ['server/occ.js', 'server/db.js', 'server/routes/students.js',
    'server/routes/classes.js', 'server/routes/attendance.js',
    'server/routes/grades.js', 'server/routes/users.js'],
  'A-21': ['server/rate-limit.js', 'server/auth.js'],
  'A-22': ['server/redis.js', 'server/revocation.js', 'server/otp-store.js',
    'server/auth.js', 'server/sync.js'],
  'A-23': ['server/sync.js', 'server/db.js'],
  'A-24': ['server/conflicts.js', 'server/conflict-transaction.js'],
  'A-25': ['infra/observability/alert-rules.yml'],
  'A-26': ['server/index.js'],
  'A-27': ['server/index.js'],
  'A-28': ['server/index.js'],
  'A-29': ['server/index.js'],
  'M15-01-A': ['tools/strict-verification-gate.js', 'tools/registry-provenance.js', 'tests/m15-01-registry-strict-verification.test.js', 'tests/strict-verification-gate.negative.test.js'],
  'M15-01-B': ['tools/strict-verification-gate.js', 'tools/m15-01-build-registry.js', 'tests/m15-01-registry-strict-verification.test.js', 'tests/strict-verification-gate.negative.test.js'],
  'M15-01-C': ['tools/strict-verification-gate.js', 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json', 'tests/m15-01-registry-strict-verification.test.js', 'tests/strict-verification-gate-a30.test.js']
};

function dependencyHashAt(files, rev) {
  const h = crypto.createHash('sha256');
  const missing = [];
  for (const rel of files) {
    let data = null;
    if (isSha1(rev)) {
      const r = cp.spawnSync('git', ['cat-file', 'blob', rev + ':' + rel], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024
      });
      if (r.status === 0 && Buffer.isBuffer(r.stdout)) data = r.stdout;
    } else {
      const abs = path.join(ROOT, rel);
      if (fs.existsSync(abs)) data = fs.readFileSync(abs);
    }
    if (!data) {
      missing.push(rel);
      continue;
    }
    h.update(rel + '\0' + data.length + '\0');
    h.update(data);
  }
  return { hash: h.digest('hex').slice(0, 16), missing };
}

function resolveTwoPhaseBinding(head) {
  if (!isSha1(head)) {
    return {
      evidenceHead: head,
      metadataOnlyBinding: false,
      reason: 'HEAD is not a valid 40-hex commit SHA'
    };
  }
  const parentLine = gitOut(['rev-list', '--parents', '-n', '1', 'HEAD']) || '';
  const commitAndParents = parentLine ? parentLine.split(/\s+/) : [];
  const parentCount = Math.max(0, commitAndParents.length - 1);
  if (parentCount !== 1) {
    return {
      evidenceHead: head,
      metadataOnlyBinding: false,
      reason: 'metadata-only binding requires a non-merge commit with exactly one parent; parent_count=' + parentCount
    };
  }
  const parent = commitAndParents[1];
  const rawDiffOut = gitOut(['diff-tree', '--no-commit-id', '--raw', '--no-renames', '-r', parent, 'HEAD']);
  const rawDiff = rawDiffOut ? rawDiffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  const changed = rawDiff.map((line) => {
    const tab = line.indexOf('\t');
    return tab >= 0 ? line.slice(tab + 1).trim() : line;
  }).sort();
  const regOnlyRegularFile = rawDiff.length === 1
    && /^:[0-7]{6}\s+100644\s+[0-9a-f]+\s+[0-9a-f]+\s+[AM]\tdocs\/verification\/VERIFICATION_REGISTRY\.json$/i.test(rawDiff[0]);
  if (!isSha1(parent) || changed.length !== 1 || changed[0] !== REGISTRY_REL || !regOnlyRegularFile) {
    return {
      evidenceHead: head,
      metadataOnlyBinding: false,
      reason: 'changed paths=' + JSON.stringify(changed) + '; expected registry only'
    };
  }
  const parentTreeDigest = nonRegistryTreeDigest(parent);
  const headTreeDigest = nonRegistryTreeDigest(head);
  if (!parentTreeDigest || parentTreeDigest !== headTreeDigest) {
    return {
      evidenceHead: head,
      metadataOnlyBinding: false,
      reason: 'non-registry subtree digest mismatch between parent and HEAD'
    };
  }
  return {
    evidenceHead: parent,
    metadataOnlyBinding: true,
    reason: 'single-parent registry-only metadata commit; evidence binds parent ' + parent
  };
}

function audit() {
  if (!fs.existsSync(REGISTRY)) {
    console.error('REGISTRY-ABSENT: ' + REGISTRY);
    process.exit(1);
  }
  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  } catch (e) {
    console.error('REGISTRY-INVALID-JSON: ' + String(e && e.message || e));
    process.exit(1);
  }

  const head = gitOut(['rev-parse', 'HEAD']) || '';
  const originMain = gitOut(['rev-parse', '--verify', '--quiet', 'origin/main']) || '(missing)';
  const binding = resolveTwoPhaseBinding(head);
  const evidenceHead = binding.evidenceHead;

  console.log('══ REGISTRY PROVENANCE AUDIT ══');
  console.log('  registry head_bound : ' + reg.head_bound);
  console.log('  local HEAD          : ' + (head || '(unknown HEAD)'));
  console.log('  evidence HEAD       : ' + (evidenceHead || '(unknown)') + (binding.metadataOnlyBinding ? ' [metadata-only]' : ''));
  console.log('  binding mode        : ' + binding.reason);
  console.log('  origin/main         : ' + originMain);

  const headBound = String(reg.head_bound || '');
  const boundCommitExists = isSha1(headBound) && gitOk(['cat-file', '-e', headBound + '^{commit}']);
  const boundIsAncestor = boundCommitExists && isSha1(head)
    ? gitOk(['merge-base', '--is-ancestor', headBound, head])
    : false;
  const evidenceShaValid = isSha1(evidenceHead)
    && gitOk(['cat-file', '-e', evidenceHead + '^{commit}'])
    && gitOk(['merge-base', '--is-ancestor', evidenceHead, head]);

  /* Check uncommitted tracked drift outside VERIFICATION_REGISTRY.json (mirrors G17) */
  let trackedDrift = [];
  const porcelain = gitOut(['status', '--porcelain', '--untracked-files=no']);
  if (porcelain === null) {
    trackedDrift = ['<git status unavailable>'];
  } else if (porcelain.length > 0) {
    trackedDrift = porcelain
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[A-Z?!]{1,2}\s+/, '').replace(/^.*\s->\s/, ''))
      .filter((p) => p !== REGISTRY_REL);
  }

  /* Check completeness (G14 / V-01) */
  const items = Array.isArray(reg.items) ? reg.items : [];
  const expectedIds = Array.isArray(reg.expected_ids) ? reg.expected_ids.map(String) : [];
  const itemIds = items.map((it) => String((it && it.id) || ''));
  const missingDeclared = expectedIds.filter((id) => !itemIds.includes(id));
  const undeclaredItems = itemIds.filter((id) => !expectedIds.includes(id));
  const duplicateDeclared = expectedIds.filter((id, i) => expectedIds.indexOf(id) !== i);
  const duplicateItems = itemIds.filter((id, i) => itemIds.indexOf(id) !== i);
  const completenessBad = items.length === 0
    || missingDeclared.length > 0
    || undeclaredItems.length > 0
    || duplicateDeclared.length > 0
    || duplicateItems.length > 0;

  const reviewerSlots = Array.isArray(reg.required_reviewers) && reg.required_reviewers.length > 0
    ? reg.required_reviewers.map(String)
    : ['arena'];

  let current = 0;
  let stale = 0;
  let unbound = 0;
  const rows = [];

  for (const item of items) {
    const id = String((item && item.id) || '(unnamed)');
    const itemErrors = [];

    if (!item || typeof item !== 'object') {
      stale++;
      rows.push({ id, state: 'INVALID', note: 'item is not an object' });
      continue;
    }

    if (item.head_sha !== evidenceHead) {
      itemErrors.push('item.head_sha=' + String(item.head_sha || '').slice(0, 10) + ' != ' + String(evidenceHead || '').slice(0, 10));
    }

    const evEntries = [];
    if (Array.isArray(item.evidence)) {
      item.evidence.forEach((e, idx) => evEntries.push({ where: 'evidence[' + idx + ']', e }));
    } else {
      itemErrors.push('item.evidence missing/empty');
    }
    for (const slot of reviewerSlots) {
      const revObj = item[slot];
      if (!revObj || typeof revObj !== 'object' || !Array.isArray(revObj.evidence) || revObj.evidence.length === 0) {
        itemErrors.push(slot + '.evidence missing/empty');
      } else {
        revObj.evidence.forEach((e, idx) => evEntries.push({ where: slot + '.evidence[' + idx + ']', e }));
      }
    }

    if (evEntries.length === 0) {
      itemErrors.push('no evidence entries');
    }

    for (const { where, e } of evEntries) {
      if (!e || typeof e !== 'object') {
        itemErrors.push(where + ' not an object');
        continue;
      }
      if (e.head_sha !== evidenceHead) {
        itemErrors.push(where + ' head_sha!=' + String(evidenceHead || '').slice(0, 10));
      }
      if (e.exit_code !== 0) {
        itemErrors.push(where + ' exit_code=' + e.exit_code);
      }
      if (!Number.isInteger(e.checks_total) || e.checks_total < 1 || e.checks_passed !== e.checks_total) {
        itemErrors.push(where + ' checks=' + e.checks_passed + '/' + e.checks_total);
      }
      if (!isSha256(e.sha256) || typeof e.artifact !== 'string' || !e.artifact) {
        itemErrors.push(where + ' invalid artifact/sha256');
      } else {
        const committedSha = blobSha256At(evidenceHead, e.artifact);
        if (!committedSha) {
          itemErrors.push(where + ' artifact missing at ' + String(evidenceHead || '').slice(0, 10) + ':' + e.artifact);
        } else if (committedSha !== e.sha256) {
          itemErrors.push(where + ' committed blob sha256 mismatch');
        } else {
          const absArt = path.join(ROOT, e.artifact);
          if (!fs.existsSync(absArt)) {
            itemErrors.push(where + ' working-tree artifact missing: ' + e.artifact);
          } else {
            const diskSha = crypto.createHash('sha256').update(fs.readFileSync(absArt)).digest('hex');
            if (diskSha !== e.sha256) {
              itemErrors.push(where + ' working-tree artifact tampered since commit');
            }
          }
        }
      }
    }

    /* Optional legacy dependency_hash check when recorded on item.provenance */
    const depFiles = DEPENDENCY_SETS[id];
    const recordedDepHash = item.provenance && item.provenance.dependency_hash;
    if (recordedDepHash && depFiles) {
      const dh = dependencyHashAt(depFiles, evidenceHead);
      if (recordedDepHash !== dh.hash) {
        itemErrors.push('dependency_hash ' + recordedDepHash + ' != ' + dh.hash);
      }
    }

    if (itemErrors.length > 0) {
      stale++;
      rows.push({ id, state: 'STALE', note: itemErrors.slice(0, 3).join('; ') });
      continue;
    }

    const rank = Object.prototype.hasOwnProperty.call(STATUS_RANK, String(item.status))
      ? STATUS_RANK[String(item.status)]
      : -1;
    const allReviewersPass = reviewerSlots.every((slot) => item[slot] && item[slot].status === 'PASS');
    if (rank < 2 || item.blocked === true || !allReviewersPass) {
      unbound++;
      const dhNote = depFiles ? ('dep=' + dependencyHashAt(depFiles, evidenceHead).hash) : 'no-dep-map';
      rows.push({
        id,
        state: 'UNBOUND',
        note: 'status=' + item.status + (item.blocked ? ' (BLOCKED)' : '') + ' ' + dhNote
      });
    } else {
      current++;
      const dhNote = depFiles ? ('dep=' + dependencyHashAt(depFiles, evidenceHead).hash) : 'verified';
      rows.push({ id, state: 'CURRENT', note: 'status=' + item.status + ' ' + dhNote });
    }
  }

  for (const r of rows) console.log('  ' + r.state.padEnd(12) + ' ' + r.id + ' — ' + r.note);
  console.log('────────────────────────────────────────');
  console.log('  CURRENT : ' + current);
  console.log('  STALE   : ' + stale + (stale ? '  ← re-run verification & re-emit registry' : ''));
  console.log('  UNBOUND : ' + unbound + (unbound ? '  ← honestly UNKNOWN/BLOCKED items (V-15/V-16)' : ''));

  const headMismatch = !evidenceShaValid || headBound !== evidenceHead;
  if (headMismatch) {
    console.log('');
    console.log('  V-02 HEAD-BIND: MISMATCH (registry ' + (headBound ? headBound.slice(0, 10) : '(none)') +
      ' vs evidenceHead ' + (evidenceHead ? evidenceHead.slice(0, 10) : '(none)') +
      ', checkout ' + (head ? head.slice(0, 10) : '(none)') + ')');
    console.log('    commit-exists   : ' + (boundCommitExists ? 'YES' : 'NO (unknown/foreign SHA)'));
    console.log('    ancestor-of-HEAD: ' + (boundIsAncestor ? 'YES (evidence is STALE, not lost)' : 'NO (unrelated/diverged — re-verify from scratch)'));
  }
  if (trackedDrift.length > 0) {
    console.log('  G17 TRACKED-DRIFT: TAMPERED (' + trackedDrift.slice(0, 6).join(', ') + ')');
  }
  if (completenessBad) {
    console.log('  G14 COMPLETENESS: FAIL (items=' + items.length +
      ' missing=' + JSON.stringify(missingDeclared) +
      ' undeclared=' + JSON.stringify(undeclaredItems) +
      ' dupExpected=' + JSON.stringify(duplicateDeclared) +
      ' dupItems=' + JSON.stringify(duplicateItems) + ')');
  }

  const bad = headMismatch || stale > 0 || trackedDrift.length > 0 || completenessBad;
  const exitCode = bad ? 2 : (unbound > 0 || current === 0 ? 3 : 0);
  process.exit(exitCode);
}

function bind(itemId) {
  const files = DEPENDENCY_SETS[itemId];
  if (!files) {
    console.error('BIND-FAIL: no dependency set for ' + itemId);
    console.error('  add one to DEPENDENCY_SETS in this tool first — that is the audit trail.');
    process.exit(1);
  }
  const head = gitOut(['rev-parse', 'HEAD']) || '(unknown HEAD)';
  const dh = dependencyHashAt(files, isSha1(head) ? head : null);
  const block = {
    provenance: {
      bound_head: head,
      dependency_hash: dh.hash,
      dependencies: files,
      bound_at: new Date().toISOString(),
      agent: process.env.ARENA_AGENT_LABEL || 'arena'
    }
  };
  console.log(JSON.stringify(block, null, 2));
  if (dh.missing.length) {
    console.error('WARN: missing dependencies for ' + itemId + ': ' + dh.missing.join(','));
  }
  const bindExit = dh.missing.length ? 3 : 0;
  process.exit(bindExit);
}

const mode = process.argv[2];
if (mode === '--audit') audit();
else if (mode === '--bind') bind(process.argv[3]);
else {
  console.error('usage: node tools/registry-provenance.js --audit | --bind <item-id>');
  process.exit(1);
}
