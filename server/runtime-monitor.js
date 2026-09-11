/* ═══════════════════════════════════════════════════════════════════
   server/runtime-monitor.js — bounded rolling runtime security signals

   Five fixed-duration buckets form an in-process rolling baseline. The
   monitor never records raw URLs, user IDs, IPs, tenant IDs, or JWTs. Session
   keys are one-way process-local hashes and its maps have hard bounds.

   This module is deliberately dependency-free and side-effect-free on import.
   A Redis/telemetry transport can consume its callback without changing the
   request path; recorder errors are swallowed by callers (observability must
   never break serving traffic).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const crypto = require('crypto');

const KNOWN_ROLES = new Set(['superadmin', 'manager', 'teacher', 'student', 'parent', 'edu_office', 'counselor', 'driver', 'anonymous']);
const DAY_MS = 24 * 60 * 60 * 1000;
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}
function safeRole(value) {
  const role = String(value || 'anonymous');
  return KNOWN_ROLES.has(role) ? role : 'anonymous';
}
function keyHash(value) {
  if (value == null || value === '') return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}
function mean(values) { return values.reduce((sum, item) => sum + item, 0) / values.length; }
function stddev(values, average) {
  return Math.sqrt(values.reduce((sum, item) => sum + Math.pow(item - average, 2), 0) / values.length);
}

function createRuntimeMonitor(options = {}) {
  const bucketMs = clampInt(options.bucketMs, 60 * 1000, 1000, 60 * 60 * 1000);
  const baselineBuckets = clampInt(options.baselineBuckets, 5, 3, 60);
  const minSamples = clampInt(options.minSamples, 3, 3, baselineBuckets);
  const sigma = Math.max(1, Number(options.sigma) || 3);
  const sessionTtlMs = clampInt(options.sessionTtlMs, DAY_MS, 1000, 7 * DAY_MS);
  const maxSessions = clampInt(options.maxSessions, 5000, 1, 100000);
  const maxSeries = clampInt(options.maxSeries, 128, 16, 2048);
  const onAnomaly = typeof options.onAnomaly === 'function' ? options.onAnomaly : () => {};
  const series = new Map();
  const sessions = new Map();
  const anomalyEvents = [];
  const blockedEvents = [];

  function nowOf(value) { return Number.isFinite(Number(value)) ? Number(value) : Date.now(); }
  function trimEvents(now) {
    const cutoff = now - DAY_MS;
    while (anomalyEvents.length && anomalyEvents[0].at < cutoff) anomalyEvents.shift();
    while (blockedEvents.length && blockedEvents[0].at < cutoff) blockedEvents.shift();
    for (const [id, item] of sessions) if (item.at < now - sessionTtlMs) sessions.delete(id);
    while (sessions.size > maxSessions) sessions.delete(sessions.keys().next().value);
  }
  function touchSession(sessionId, at) {
    const id = keyHash(sessionId);
    if (!id) return null;
    const old = sessions.get(id) || {};
    sessions.delete(id); /* Map insertion order = LRU order. */
    sessions.set(id, Object.assign({}, old, { at }));
    trimEvents(at);
    return id;
  }
  function makeSeriesKey(metric, role) { return metric + '|' + role; }
  function rotate(item, slot) {
    if (item.slot === slot) return;
    if (slot < item.slot) return; /* late events never rewrite an already-alerted bucket */
    const gap = Math.min(baselineBuckets + 1, slot - item.slot);
    item.history.push(item.value);
    for (let i = 1; i < gap; i += 1) item.history.push(0);
    while (item.history.length > baselineBuckets) item.history.shift();
    item.value = 0;
    item.slot = slot;
    item.alertedSlot = null;
  }
  function getSeries(metric, role, slot) {
    const key = makeSeriesKey(metric, role);
    let item = series.get(key);
    if (!item) {
      if (series.size >= maxSeries) return null;
      item = { metric, role, slot, value: 0, history: [], alertedSlot: null };
      series.set(key, item);
    }
    rotate(item, slot);
    return item;
  }
  function recordSignal(metric, value, meta = {}) {
    const at = nowOf(meta.at);
    const role = safeRole(meta.role);
    const delta = Number(value);
    if (!Number.isFinite(delta) || delta < 0 || typeof metric !== 'string' || !/^[a-z_]{2,48}$/.test(metric)) return [];
    const item = getSeries(metric, role, Math.floor(at / bucketMs));
    if (!item) return [];
    item.value += delta;
    const sessionKey = touchSession(meta.sessionId, at);
    const findings = [];
    if (item.history.length >= minSamples && item.alertedSlot !== item.slot) {
      const average = mean(item.history);
      const deviation = stddev(item.history, average);
      const threshold = average + sigma * deviation;
      if (item.value > threshold) {
        const finding = {
          kind: 'runtime_anomaly', metric: item.metric, role: item.role,
          value: item.value, mean: average, stddev: deviation, threshold,
          samples: item.history.length, at
        };
        item.alertedSlot = item.slot;
        anomalyEvents.push({ at, metric: item.metric, sessionKey });
        if (sessionKey) markSuspicious(sessionKey, at, true);
        try { onAnomaly(finding); } catch (_) {}
        findings.push(finding);
      }
    }
    trimEvents(at);
    return findings;
  }
  /* `alreadyHashed` is only internal: public callers pass session IDs. */
  function markSuspicious(sessionId, atValue, alreadyHashed) {
    const at = nowOf(atValue);
    const id = alreadyHashed ? sessionId : touchSession(sessionId, at);
    if (!id) return false;
    const item = sessions.get(id) || { at };
    item.at = at;
    item.suspicious = true;
    sessions.delete(id);
    sessions.set(id, item);
    trimEvents(at);
    return true;
  }
  function recordTenant(sessionId, tenantId, meta = {}) {
    if (sessionId == null || tenantId == null) return [];
    const at = nowOf(meta.at);
    const id = touchSession(sessionId, at);
    if (!id) return [];
    const item = sessions.get(id);
    const tenant = keyHash(tenantId); /* no tenant identifier leaves the module */
    const switched = item.tenant && tenant && item.tenant !== tenant;
    item.tenant = tenant;
    item.at = at;
    return switched ? recordSignal('tenant_switch_rate', 1, { role: meta.role, sessionId, at }) : [];
  }
  function recordRequest(event = {}) {
    const at = nowOf(event.at);
    const meta = { role: safeRole(event.role), sessionId: event.sessionId, at };
    const findings = [];
    findings.push(...recordSignal('request_rate', 1, meta));
    if (Number(event.status) === 401 || Number(event.status) === 403) findings.push(...recordSignal('auth_error_rate', 1, meta));
    const bytes = Number(event.responseBytes);
    if (Number.isFinite(bytes) && bytes >= 0) findings.push(...recordSignal('response_bytes', bytes, meta));
    const syncOps = Number(event.syncOps);
    if (Number.isFinite(syncOps) && syncOps > 0) findings.push(...recordSignal('sync_ops_rate', syncOps, meta));
    if (event.sessionId != null && event.tenantId != null) findings.push(...recordTenant(event.sessionId, event.tenantId, meta));
    return findings;
  }
  function markAttackPatternBlocked(pattern, sessionId, atValue) {
    const at = nowOf(atValue);
    const safePattern = /^[a-z_]{2,48}$/.test(String(pattern || '')) ? String(pattern) : 'unknown';
    const sessionKey = touchSession(sessionId, at);
    if (sessionKey) markSuspicious(sessionKey, at, true);
    blockedEvents.push({ at, pattern: safePattern, sessionKey });
    trimEvents(at);
    return { pattern: safePattern, at };
  }
  function snapshot(atValue) {
    const at = nowOf(atValue);
    trimEvents(at);
    const cutoff = at - DAY_MS;
    const suspicious = Array.from(sessions.values()).filter((item) => item.suspicious && item.at >= cutoff).length;
    return {
      anomalies_detected_24h: anomalyEvents.filter((item) => item.at >= cutoff).length,
      suspicious_sessions: suspicious,
      attack_patterns_blocked: blockedEvents.filter((item) => item.at >= cutoff).length,
      series: Array.from(series.values()).map((item) => ({ metric: item.metric, role: item.role, current: item.value, baseline_samples: item.history.length }))
    };
  }
  function debugState() { return { series: series.size, sessions: sessions.size, anomalies: anomalyEvents.length, blocked: blockedEvents.length }; }
  return { recordSignal, recordRequest, recordTenant, markSuspicious, markAttackPatternBlocked, snapshot, debugState };
}
module.exports = { KNOWN_ROLES, createRuntimeMonitor };
