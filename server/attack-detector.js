/* ═══════════════════════════════════════════════════════════════════
   server/attack-detector.js — privacy-preserving runtime attack signatures

   Signatures are small state machines over bounded, TTL-pruned maps. Inputs
   may contain sessions/IPs/record IDs, but emitted events contain only a fixed
   pattern name, severity, counter, and timestamp. Raw identifiers never enter
   logs, metrics labels, webhook payloads, or health output.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');
const DAY_MS = 24 * 60 * 60 * 1000;
const PATTERNS = new Set(['sequential_id_enumeration', 'rapid_login_failures', 'cross_school_access', 'bulk_export', 'forged_sync_metadata', 'waf_blocked']);
function hash(value) { return crypto.createHash('sha256').update(String(value == null ? '' : value)).digest('hex').slice(0, 16); }
function boundedInt(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback; }

function createAttackDetector(options = {}) {
  const windowMs = boundedInt(options.windowMs, 2 * 60 * 1000, 1000, DAY_MS);
  const maxActors = boundedInt(options.maxActors, 5000, 32, 100000);
  const thresholds = {
    enumeration: boundedInt(options.enumerationThreshold, 8, 3, 100),
    loginDistinct: boundedInt(options.loginDistinctThreshold, 5, 2, 100),
    crossSchool: boundedInt(options.crossSchoolThreshold, 3, 1, 100),
    bulkExport: boundedInt(options.bulkExportThreshold, 3, 1, 100)
  };
  const onDetect = typeof options.onDetect === 'function' ? options.onDetect : () => {};
  const actors = new Map();
  const events = [];
  function atOf(value) { return Number.isFinite(Number(value)) ? Number(value) : Date.now(); }
  function prune(at) {
    const stale = at - windowMs;
    for (const [key, item] of actors) if (item.at < stale) actors.delete(key);
    while (actors.size > maxActors) actors.delete(actors.keys().next().value);
    const day = at - DAY_MS;
    while (events.length && events[0].at < day) events.shift();
  }
  function state(namespace, identity, at) {
    const key = namespace + ':' + hash(identity || 'anonymous');
    let item = actors.get(key);
    if (!item || at - item.at > windowMs) item = { at, actor: hash(identity || 'anonymous'), count: 0, emitted: new Set(), lastId: null, sequential: 0, subjects: new Set() };
    else actors.delete(key); /* LRU */
    item.at = at;
    actors.set(key, item);
    prune(at);
    return item;
  }
  function emit(pattern, item, count, at) {
    if (!PATTERNS.has(pattern) || item.emitted.has(pattern)) return null;
    item.emitted.add(pattern);
    /* actor is a process-local one-way digest; never the supplied session/IP. */
    const event = { pattern, severity: pattern === 'forged_sync_metadata' ? 'high' : 'medium', count, at, actor: item.actor };
    events.push(event);
    try { onDetect(event); } catch (_) {}
    return event;
  }
  function observeRequest(event = {}) {
    const at = atOf(event.at);
    const result = [];
    const match = /^\/api\/students\/(\d+)$/.exec(String(event.path || '').split('?')[0]);
    if (match) {
      const item = state('enum', event.sessionId || event.source, at);
      const id = Number(match[1]);
      item.sequential = item.lastId != null && id === item.lastId + 1 ? item.sequential + 1 : 1;
      item.lastId = id;
      const emitted = item.sequential >= thresholds.enumeration ? emit('sequential_id_enumeration', item, item.sequential, at) : null;
      if (emitted) result.push(emitted);
    }
    if (/\/export(?:\/|$)/.test(String(event.path || ''))) result.push(...observeBulkExport({ sessionId: event.sessionId || event.source, at }));
    return result;
  }
  function observeLoginFailure(event = {}) {
    const at = atOf(event.at);
    const item = state('login', event.source, at);
    item.subjects.add(hash(event.subject || 'unknown'));
    item.count += 1;
    const emitted = item.subjects.size >= thresholds.loginDistinct ? emit('rapid_login_failures', item, item.subjects.size, at) : null;
    return emitted ? [emitted] : [];
  }
  function observeCrossSchool(event = {}) {
    const at = atOf(event.at);
    const item = state('cross-school', event.sessionId || event.source, at);
    item.count += 1;
    const emitted = item.count >= thresholds.crossSchool ? emit('cross_school_access', item, item.count, at) : null;
    return emitted ? [emitted] : [];
  }
  function observeBulkExport(event = {}) {
    const at = atOf(event.at);
    const item = state('export', event.sessionId || event.source, at);
    item.count += 1;
    const emitted = item.count >= thresholds.bulkExport ? emit('bulk_export', item, item.count, at) : null;
    return emitted ? [emitted] : [];
  }
  function observeSyncResult(event = {}) {
    const code = String(event.code || '');
    if (!['forged_by', 'user_mismatch', 'school_mismatch', 'ownership_forge'].includes(code)) return [];
    const at = atOf(event.at);
    const item = state('sync-forgery', event.sessionId || event.source, at);
    item.count += 1;
    const emitted = emit('forged_sync_metadata', item, item.count, at);
    return emitted ? [emitted] : [];
  }
  function observeWafBlock(event = {}) {
    if (!event || !event.blocked) return [];
    const at = atOf(event.at);
    const item = state('waf', event.sessionId || event.source || 'anonymous', at);
    item.count += 1;
    const emitted = emit('waf_blocked', item, item.count, at);
    return emitted ? [emitted] : [];
  }
  function snapshot(atValue) {
    const at = atOf(atValue);
    prune(at);
    return { attack_patterns_blocked: events.filter((event) => event.at >= at - DAY_MS).length, recent_patterns: Array.from(new Set(events.filter((event) => event.at >= at - DAY_MS).map((event) => event.pattern))).sort() };
  }
  return { observeRequest, observeLoginFailure, observeCrossSchool, observeBulkExport, observeSyncResult, observeWafBlock, snapshot };
}
module.exports = { PATTERNS, createAttackDetector };
