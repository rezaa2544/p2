'use strict';

/* Version vectors for offline-first conflict detection.
   A vector is a small JSON map: { node_id: positive_integer_version }.
   The functions are pure and fail-closed: malformed vectors are rejected by
   validateVector() before sync uses them for conflict decisions. */

const DEFAULT_NODE_ID = 'server';
const NODE_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_NODES = 32;
const MAX_VERSION = Number.MAX_SAFE_INTEGER;

function cleanNodeId(id) {
  const s = String(id || DEFAULT_NODE_ID).trim();
  return NODE_RE.test(s) ? s : DEFAULT_NODE_ID;
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function validateVector(v) {
  if (!isPlainObject(v)) return { ok: false, code: 'bad_vector', reason: 'not_object' };
  const keys = Object.keys(v);
  if (keys.length > MAX_NODES) return { ok: false, code: 'bad_vector', reason: 'too_many_nodes' };
  for (const k of keys) {
    if (!NODE_RE.test(k)) return { ok: false, code: 'bad_vector', reason: 'bad_node' };
    const n = v[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_VERSION) {
      return { ok: false, code: 'bad_vector', reason: 'bad_version', node: k };
    }
  }
  return { ok: true };
}

function normalizeVector(v) {
  if (!isPlainObject(v)) return {};
  const out = {};
  for (const k of Object.keys(v).sort()) {
    const n = Number(v[k]);
    if (NODE_RE.test(k) && Number.isInteger(n) && n >= 0 && n <= MAX_VERSION) out[k] = n;
  }
  return out;
}

function mergeVectors(a, b) {
  const aa = normalizeVector(a), bb = normalizeVector(b), out = {};
  for (const k of Object.keys(aa)) out[k] = aa[k];
  for (const k of Object.keys(bb)) out[k] = Math.max(out[k] || 0, bb[k]);
  return out;
}

function vectorsEqual(a, b) {
  const aa = normalizeVector(a), bb = normalizeVector(b);
  const keys = Array.from(new Set(Object.keys(aa).concat(Object.keys(bb)))).sort();
  for (const k of keys) if ((aa[k] || 0) !== (bb[k] || 0)) return false;
  return true;
}

/* true when every component of base is <= current. */
function isAncestor(base, current) {
  const bb = normalizeVector(base), cc = normalizeVector(current);
  const keys = Array.from(new Set(Object.keys(bb).concat(Object.keys(cc))));
  for (const k of keys) if ((bb[k] || 0) > (cc[k] || 0)) return false;
  return true;
}

function compareVectors(a, b) {
  const aLeB = isAncestor(a, b);
  const bLeA = isAncestor(b, a);
  if (aLeB && bLeA) return 'equal';
  if (aLeB) return 'ancestor';
  if (bLeA) return 'descendant';
  return 'concurrent';
}

function vectorOfRecord(record, nodeId) {
  if (record && isPlainObject(record.version_vector)) return normalizeVector(record.version_vector);
  if (record && record.version != null) {
    const n = Number(record.version || 1);
    return { [cleanNodeId(nodeId)]: Number.isInteger(n) && n >= 0 ? n : 1 };
  }
  return { [cleanNodeId(nodeId)]: 0 };
}

function bumpVector(vector, nodeId, nextVersion) {
  const node = cleanNodeId(nodeId);
  const out = normalizeVector(vector);
  const n = Number(nextVersion);
  out[node] = Number.isInteger(n) && n >= 0 ? Math.max(out[node] || 0, n) : ((out[node] || 0) + 1);
  return out;
}

/* Conflict policy used by sync.js:
   - equal: safe to apply.
   - ancestor: client edited an older state; preserve conflict for VERSIONED.
   - descendant/concurrent: invalid/future or divergent claim; preserve conflict. */
function needsConflict(baseVector, currentVector) {
  return compareVectors(baseVector, currentVector) !== 'equal';
}

function resolveConflict(base, current, incoming, policy) {
  const p = policy || 'manual';
  const baseVector = normalizeVector(base && base.version_vector);
  const currentVector = normalizeVector(current && current.version_vector);
  const incomingVector = normalizeVector(incoming && incoming.version_vector);
  if (p === 'lww') {
    const ct = Date.parse((current && (current.updated_at || current.at)) || 0) || 0;
    const it = Date.parse((incoming && (incoming.updated_at || incoming.at)) || 0) || 0;
    return it >= ct ? { winner: 'incoming', record: incoming, reason: 'lww' } : { winner: 'current', record: current, reason: 'lww' };
  }
  if (!needsConflict(baseVector, currentVector)) {
    return { winner: 'incoming', record: Object.assign({}, current || {}, incoming || {}), reason: 'fast_forward' };
  }
  return { winner: 'manual', conflict: true, base, current, incoming, incoming_relation: compareVectors(baseVector, currentVector) };
}

module.exports = {
  DEFAULT_NODE_ID,
  MAX_NODES,
  cleanNodeId,
  validateVector,
  normalizeVector,
  mergeVectors,
  vectorsEqual,
  isAncestor,
  compareVectors,
  vectorOfRecord,
  bumpVector,
  needsConflict,
  resolveConflict
};
