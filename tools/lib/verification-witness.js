'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   tools/lib/verification-witness.js — ONE binding rule, shared by every reader

   WHY THIS FILE EXISTS
   M15-01 shipped two tools that disagreed about what "evidence is bound" means:

     tools/strict-verification-gate.js   compared head_sha to checkout HEAD and,
                                         for a registry-only metadata commit, to
                                         its parent. It knew nothing else.
     tools/registry-provenance.js        kept its own hard-coded DEPENDENCY_SETS
                                         and its own `provenance.dependency_hash`
                                         field, which the gate never reads and
                                         which no registry item ever carried.

   Measured consequences on main (fff1beae, 2026-10-27):
     gate       633 pass / 65 fail — every item bound to bf263bf2 while HEAD had
                moved on; NOT VERIFIED, exit 1
     provenance exit 2 — 29 items UNBOUND, head_bound mismatch

   Both are the same defect seen twice: a scalar SHA binding cannot survive any
   later commit, so a repository whose main moves (docs commits, dependency
   bumps) is permanently red, and the two tools report that redness in
   incompatible vocabularies.

   THE RULE (used by the gate, the provenance audit and the registry builder)

     Evidence is produced on an immutable source commit A. Every file that the
     evidence actually depends on is enumerated as a *witness set* W. The
     registry records, for A:

         witness.paths  = sorted W
         witness.blobs  = { path: git blob sha1 at A }

     The binding is VALID at checkout HEAD when

         (1) A is a real commit and an ancestor of HEAD (or A === HEAD),
         (2) witness.paths equals the witness set COMPUTED FROM THE REGISTRY
             (so a registry cannot shrink its own scope after the fact),
         (3) every recorded blob equals the blob at A, and
         (4) every recorded blob equals the blob at HEAD.

     (4) is the whole point: evidence stays valid across commits that touch
     nothing it depends on (docs, dependency bumps) and dies the instant a file
     it depends on changes. It is not a weakening of SHA binding — the same
     bytes are required, just addressed by content instead of by a moving
     scalar — and it is strictly harder to satisfy than "head_bound === HEAD"
     alone, because a forged or stale registry must also reproduce a witness set
     that the gate recomputes independently.

   MODES
     legacy  : registry has no witness. Gate requires head_bound === evidence
               head exactly (the pre-M15-01 rule); provenance reports UNBOUND.
     lineage : registry carries binding_mode:'lineage' + witness. The four
               conditions above apply.
   ═══════════════════════════════════════════════════════════════════════════ */
const cp = require('child_process');
const path = require('path');

const REGISTRY_REL = 'docs/verification/VERIFICATION_REGISTRY.json';
const POLICY_REL = 'docs/STRICT_VERIFICATION_GATE.md';
const SCHEMA_REL = 'docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json';
const GATE_REL = 'tools/strict-verification-gate.js';
const WITNESS_REL = 'tools/lib/verification-witness.js';

/* Paths that define the *meaning* of a run and are therefore always in W. They
   are not optional: a change to the gate, the policy, the schema or the test
   runner can turn a green run into a meaningless one without touching any file
   that a single evidence command cites. */
const ALWAYS = [POLICY_REL, SCHEMA_REL, GATE_REL, WITNESS_REL, 'package.json', 'tests/run.js'];

function git(root, args, opts) {
  return cp.spawnSync('git', args, Object.assign({ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, opts || {}));
}

function blobAt(root, rev, rel) {
  const r = git(root, ['rev-parse', rev + ':' + rel]);
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
}

function isSha1(v) { return typeof v === 'string' && /^[0-9a-f]{40}$/.test(v); }

/* Repo paths cited by an evidence command (the same shape the gate's G15a/G15b
   already treat as a reproducible pointer). */
const CITED = /(?:tests|tools|server|src|docs|infra|migrations)\/[A-Za-z0-9_\-./]+/g;

function collectEvidence(reg) {
  const out = [];
  const push = (item, entries) => {
    if (!Array.isArray(entries)) return;
    for (const e of entries) if (e && typeof e === 'object') out.push({ item: item, e: e });
  };
  for (const item of (reg && Array.isArray(reg.items) ? reg.items : [])) {
    push(item && item.id, item && item.evidence);
    if (item && item.arena) push(item.id, item.arena.evidence);
    if (item && item.chatgpt) push(item.id, item.chatgpt.evidence);
    if (item && item.atria) push(item.id, item.atria.evidence);
  }
  return out;
}

/* The witness set the REGISTRY ITSELF implies. The gate and the audit both call
   this, so neither can be satisfied by a scope the other would reject. */
function requiredWitness(reg) {
  const paths = new Set(ALWAYS);
  for (const { e } of collectEvidence(reg)) {
    if (typeof e.artifact === 'string' && e.artifact.trim()) paths.add(e.artifact.trim());
    if (typeof e.command === 'string') {
      for (const m of e.command.match(CITED) || []) paths.add(m.replace(/[.,;:]+$/, ''));
    }
  }
  return [...paths].sort();
}

function witnessBlobs(root, rev, paths) {
  const blobs = {};
  const missing = [];
  for (const p of paths) {
    const b = blobAt(root, rev, p);
    if (b === null) missing.push(p);
    else blobs[p] = b;
  }
  return { blobs: blobs, missing: missing };
}

/* Does `rev` resolve to a commit, and is it an ancestor of (or equal to) head? */
function ancestry(root, rev, head) {
  if (!isSha1(rev)) return { isCommit: false, isAncestor: false };
  const isCommit = git(root, ['cat-file', '-e', rev + '^{commit}']).status === 0;
  const isAncestor = isCommit ? (rev === head || git(root, ['merge-base', '--is-ancestor', rev, head]).status === 0) : false;
  return { isCommit: isCommit, isAncestor: isAncestor };
}

/* Verify the registry's binding against a checkout.
   Returns { mode, evidenceSha, ok, problems[], witness:{paths, blobs, computed, missingAtSource, changedSinceSource} }

   `metadataEvidenceHead` is the parent SHA the gate derives for a single-parent
   registry-only commit; it is passed in so this module never re-implements the
   two-phase rule (the gate owns that, and its adversarial fixtures pin it). */
function verifyBinding(root, reg, head, metadataEvidenceHead, metadataOnly) {
  const problems = [];
  if (!reg || typeof reg !== 'object') return { mode: 'none', evidenceSha: '', ok: false, problems: ['registry absent'], witness: null };

  const evidenceSha = String(reg.head_bound || '');
  const mode = reg.binding_mode === 'lineage' ? 'lineage' : 'legacy';
  const anc = ancestry(root, evidenceSha, head || '');
  if (!anc.isCommit) problems.push('head_bound is not a commit in this repository: ' + (evidenceSha || '(none)'));
  else if (!anc.isAncestor) problems.push('head_bound is not an ancestor of the checkout: ' + evidenceSha);

  if (mode === 'legacy') {
    /* Exactly the pre-M15-01 rule: bind to the evidence head or fail. */
    const expected = metadataOnly ? metadataEvidenceHead : head;
    if (evidenceSha !== expected) problems.push('legacy binding requires head_bound === ' + expected + ', got ' + evidenceSha);
    return {
      mode: 'legacy', evidenceSha: evidenceSha, ok: problems.length === 0, problems: problems,
      witness: { paths: [], blobs: {}, computed: requiredWitness(reg), missingAtSource: [], changedSinceSource: [] }
    };
  }

  /* ── lineage ─────────────────────────────────────────────────────────── */
  const declared = reg.witness && typeof reg.witness === 'object' ? reg.witness : null;
  const declaredPaths = declared && Array.isArray(declared.paths) ? declared.paths.map(String) : [];
  const declaredBlobs = declared && declared.blobs && typeof declared.blobs === 'object' ? declared.blobs : {};
  const computed = requiredWitness(reg);

  if (!declared) problems.push('binding_mode is lineage but the registry carries no witness block');
  const sortedDeclared = declaredPaths.slice().sort();
  if (JSON.stringify(sortedDeclared) !== JSON.stringify(computed)) {
    const missing = computed.filter((p) => !sortedDeclared.includes(p));
    const extra = sortedDeclared.filter((p) => !computed.includes(p));
    problems.push('witness.paths must equal the set the registry implies; missing=' + JSON.stringify(missing.slice(0, 8)) +
      ' extra=' + JSON.stringify(extra.slice(0, 8)));
  }

  const atSource = witnessBlobs(root, evidenceSha, sortedDeclared);
  const atHead = witnessBlobs(root, head || '', sortedDeclared);
  const changedSinceSource = [];
  for (const p of sortedDeclared) {
    if (atSource.blobs[p] === undefined) { problems.push('witness path absent at the evidence commit: ' + p); continue; }
    if (declaredBlobs[p] !== atSource.blobs[p]) {
      problems.push('witness blob does not match the evidence commit: ' + p);
      continue;
    }
    if (atHead.blobs[p] === undefined) { problems.push('witness path absent at the checkout: ' + p); continue; }
    if (atHead.blobs[p] !== atSource.blobs[p]) changedSinceSource.push(p);
  }
  if (changedSinceSource.length) {
    problems.push('witness content changed after the evidence commit (stale evidence for): ' + changedSinceSource.slice(0, 8).join(', '));
  }

  return {
    mode: 'lineage', evidenceSha: evidenceSha, ok: problems.length === 0, problems: problems,
    witness: {
      paths: sortedDeclared, blobs: declaredBlobs, computed: computed,
      missingAtSource: atSource.missing, changedSinceSource: changedSinceSource
    }
  };
}

/* Compute the witness block a registry should carry, for the builder. */
function buildWitness(root, reg, sourceSha) {
  const paths = requiredWitness(reg);
  const w = witnessBlobs(root, sourceSha, paths);
  if (w.missing.length) return { ok: false, missing: w.missing, witness: null };
  return { ok: true, missing: [], witness: { paths: paths, blobs: w.blobs } };
}

module.exports = {
  REGISTRY_REL, POLICY_REL, SCHEMA_REL, GATE_REL, WITNESS_REL, ALWAYS, CITED,
  requiredWitness, verifyBinding, buildWitness, witnessBlobs, blobAt, ancestry
};

/* self-check helper used by tests: a stable digest of a witness set */
module.exports.witnessDigest = function witnessDigest(w) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  for (const p of (w && w.paths ? w.paths : []).slice().sort()) h.update(p + '\0' + String((w.blobs || {})[p] || '') + '\n');
  return h.digest('hex');
};

void path;
