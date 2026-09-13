/* ═══════════════════════════════════════════════════════════════════
   server/abuse-guard.js — one safe egress point for runtime detections

   Converts detector findings into a redacted audit record, bounded metric,
   optional HTTPS webhook, and runtime-health counter. The detector never
   blocks a request directly: authorization/WAF/rate controls remain the
   enforcement point, while this guard makes suspicious activity observable.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const https = require('https');

const PATTERNS = new Set(['sequential_id_enumeration', 'rapid_login_failures', 'cross_school_access', 'bulk_export', 'forged_sync_metadata', 'waf_blocked']);
const RUNTIME_SIGNALS = new Set(['request_rate', 'auth_error_rate', 'response_bytes', 'tenant_switch_rate', 'sync_ops_rate']);
function safePattern(pattern) { return PATTERNS.has(pattern) ? pattern : 'unknown'; }
function safeSignal(signal) { return RUNTIME_SIGNALS.has(signal) ? signal : 'unknown'; }
function validWebhookTarget(value) {
  try {
    const target = new URL(String(value || ''));
    if (target.protocol !== 'https:' || !target.hostname || target.username || target.password) return null;
    const host = target.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || /^127\./.test(host) || /^0\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return null;
    return target;
  } catch (_) { return null; }
}
function httpsWebhook(url) {
  const target = validWebhookTarget(url);
  if (!target) return async () => false;
  return async (payload) => new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(target, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: 3000 }, (res) => {
      res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end(body);
  });
}
function createAbuseGuard(options = {}) {
  const audit = typeof options.audit === 'function' ? options.audit : () => {};
  const metrics = options.metrics && typeof options.metrics.inc === 'function' ? options.metrics : { inc: () => {} };
  const runtimeMonitor = options.runtimeMonitor && typeof options.runtimeMonitor.markAttackPatternBlocked === 'function' ? options.runtimeMonitor : null;
  const webhook = typeof options.webhook === 'function' ? options.webhook : httpsWebhook(process.env.PAYESH_RUNTIME_ALERT_WEBHOOK);
  async function report(event = {}) {
    const pattern = safePattern(event.pattern);
    const severity = event.severity === 'high' ? 'high' : 'medium';
    const count = Math.max(1, Math.min(1000000, Number(event.count) || 1));
    const at = Number.isFinite(Number(event.at)) ? Number(event.at) : Date.now();
    const compact = { pattern, severity, count, at };
    try { audit('attack_pattern_detected', compact); } catch (_) {}
    try { metrics.inc('payesh_attack_patterns_detected_total', { pattern, severity }); } catch (_) {}
    /* `actor` is already a detector digest, never a raw session/IP; the
       monitor hashes it again for its own bounded session keyspace. */
    try { if (runtimeMonitor) runtimeMonitor.markAttackPatternBlocked(pattern, event.actor, at); } catch (_) {}
    try { await webhook({ type: 'attack_pattern', ...compact }); } catch (_) {}
    return compact;
  }
  async function reportAnomaly(event = {}) {
    const signal = safeSignal(event.metric);
    const role = ['superadmin', 'manager', 'teacher', 'student', 'parent', 'edu_office', 'counselor', 'driver', 'anonymous'].includes(event.role) ? event.role : 'anonymous';
    const at = Number.isFinite(Number(event.at)) ? Number(event.at) : Date.now();
    const compact = { signal, role, severity: 'medium', at };
    try { audit('runtime_anomaly_detected', compact); } catch (_) {}
    try { metrics.inc('payesh_runtime_anomalies_total', { signal }); } catch (_) {}
    try { if (runtimeMonitor && typeof runtimeMonitor.markSuspicious === 'function') runtimeMonitor.markSuspicious(event.sessionId, at); } catch (_) {}
    try { await webhook({ type: 'runtime_anomaly', ...compact }); } catch (_) {}
    return compact;
  }
  return { report, reportAnomaly };
}
module.exports = { PATTERNS, RUNTIME_SIGNALS, validWebhookTarget, createAbuseGuard };
