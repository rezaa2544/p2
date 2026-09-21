/* ═══════════════════════════════════════════════════════════════════
   server/metrics.js — Wave 14 (Observability): metrics signal
   ─────────────────────────────────────────────────────────────────
   A dependency-free metrics registry (Node stdlib only) that exposes
   the Prometheus text exposition format 0.0.4 on `GET /metrics`.

   Why not prom-client / OTel Metrics SDK?
     - the server's contract is "Runtime deps: Node stdlib only"
       (server/index.js header); tracing already pulls OTel for the
       *trace* signal, and adding a second metrics pipeline would give
       us two sources of truth for the same numbers.
     - the exposition format is ~40 lines of code; the value of this
       module is the *discipline* around it (bounded cardinality,
       label redaction, fail-closed scraping), not the format writer.

   Design rules (all enforced by tests/wave14-observability.js):
     R1  Observability NEVER breaks the request path. Every recorder
         swallows its own errors and counts them instead of throwing.
     R2  Bounded cardinality. A metric has a hard cap on label-series
         (PAYESH_METRICS_MAX_SERIES, default 1024). Overflow is DROPPED
         and counted in payesh_metrics_dropped_series_total — a hostile
         or buggy caller can never grow the registry without bound.
     R3  No PII / no raw URLs in labels. Paths are reduced to a closed
         allowlist of route templates by routeTemplate(); anything
         unmatched collapses to "api_unmatched" / "static_other".
         Free-form strings (SQL text, phone, nid, ip) are never labels.
     R4  Fail-closed scraping. In production /metrics requires a bearer
         token; without one the endpoint does not exist (404).
     R5  Labels are declared per metric. An unknown label key or a bad
         metric/label name drops the observation (counted), never throws.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/* Prometheus default buckets, in seconds — good for HTTP/DB round trips. */
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function clampInt(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/* ── label-value / help escaping (exposition format) ───────────────── */
function escLabelValue(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}
function escHelp(h) {
  return String(h || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/* ── registry ──────────────────────────────────────────────────────── */
function createRegistry(opts) {
  const options = opts || {};
  const maxSeries = clampInt(options.maxSeries, 1024, 8, 100000);
  const metrics = new Map();          /* name -> metric record */
  const dropCounts = new Map();       /* `${name}|${reason}` -> count */

  function bumpDrop(name, reason) {
    const k = name + '|' + reason;
    dropCounts.set(k, (dropCounts.get(k) || 0) + 1);
  }

  function droppedSeriesTotal() {
    let t = 0;
    for (const [k, v] of dropCounts) if (k.indexOf('|series_overflow') > 0) t += v;
    return t;
  }

  /* Validate + normalize a label set against the metric's declared keys.
     Returns null when the observation must be dropped (R5). */
  function normalize(m, labels) {
    const names = m.labelNames;
    const out = new Array(names.length);
    const src = labels || {};
    if (typeof src !== 'object') return null;
    for (let i = 0; i < names.length; i++) {
      const v = src[names[i]];
      out[i] = (v == null ? '' : String(v));
    }
    /* unknown label key → drop (fail-closed, R5) */
    for (const k of Object.keys(src)) {
      if (names.indexOf(k) < 0) { bumpDrop(m.name, 'unknown_label'); return null; }
    }
    return out;
  }

  function seriesKey(vals) { return vals.join('\u0000'); }

  function declare(type, name, help, labelNames, buckets) {
    if (typeof name !== 'string' || !METRIC_NAME_RE.test(name)) {
      bumpDrop(String(name), 'bad_metric_name');
      return null;
    }
    const existing = metrics.get(name);
    if (existing) return existing;
    const labels = (labelNames || []).filter((n) => typeof n === 'string' && LABEL_NAME_RE.test(n) && n.indexOf('__') !== 0);
    if ((labelNames || []).length !== labels.length) bumpDrop(name, 'bad_label_name');
    const m = {
      type,
      name,
      help: help || '',
      labelNames: labels,
      series: new Map(),
      buckets: type === 'histogram' ? (buckets || DEFAULT_BUCKETS).slice().sort((a, b) => a - b) : null
    };
    metrics.set(name, m);
    return m;
  }

  function getSeries(m, vals, create) {
    const key = seriesKey(vals);
    let s = m.series.get(key);
    if (s) return s;
    if (!create) return null;
    if (m.series.size >= maxSeries) { bumpDrop(m.name, 'series_overflow'); return null; }
    s = m.type === 'histogram'
      ? { values: vals, counts: new Array(m.buckets.length).fill(0), count: 0, sum: 0 }
      : { values: vals, value: 0 };
    m.series.set(key, s);
    return s;
  }

  /* ── public recorders ──────────────────────────────────────────── */
  function counter(name, help, labelNames) { declare('counter', name, help, labelNames); return api; }
  function gauge(name, help, labelNames) { declare('gauge', name, help, labelNames); return api; }
  function histogram(name, help, labelNames, buckets) { declare('histogram', name, help, labelNames, buckets); return api; }

  function inc(name, labels, by) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'counter') { bumpDrop(name, 'not_a_counter'); return; }
      const vals = normalize(m, labels);
      if (!vals) return;
      const s = getSeries(m, vals, true);
      if (!s) return;
      const d = by == null ? 1 : Number(by);
      if (!Number.isFinite(d) || d < 0) { bumpDrop(name, 'bad_value'); return; }
      s.value += d;
    } catch (e) { bumpDrop(name, 'exception'); }
  }

  function set(name, labels, value) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'gauge') { bumpDrop(name, 'not_a_gauge'); return; }
      const v = Number(value);
      if (!Number.isFinite(v)) { bumpDrop(name, 'bad_value'); return; }
      const vals = normalize(m, labels);
      if (!vals) return;
      const s = getSeries(m, vals, true);
      if (!s) return;
      s.value = v;
    } catch (e) { bumpDrop(name, 'exception'); }
  }

  function add(name, labels, by) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'gauge') { bumpDrop(name, 'not_a_gauge'); return; }
      const d = Number(by);
      if (!Number.isFinite(d)) { bumpDrop(name, 'bad_value'); return; }
      const vals = normalize(m, labels);
      if (!vals) return;
      const s = getSeries(m, vals, true);
      if (!s) return;
      s.value += d;
    } catch (e) { bumpDrop(name, 'exception'); }
  }

  function observe(name, labels, valueSeconds) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'histogram') { bumpDrop(name, 'not_a_histogram'); return; }
      const v = Number(valueSeconds);
      if (!Number.isFinite(v) || v < 0) { bumpDrop(name, 'bad_value'); return; }
      const vals = normalize(m, labels);
      if (!vals) return;
      const s = getSeries(m, vals, true);
      if (!s) return;
      for (let i = 0; i < m.buckets.length; i++) if (v <= m.buckets[i]) s.counts[i]++;
      s.count++;
      s.sum += v;
    } catch (e) { bumpDrop(name, 'exception'); }
  }

  /* Timer helper: const done = timer('x'); ...; done({route:'r'}, ms) */
  function startTimer() { return process.hrtime.bigint(); }
  function elapsedSeconds(startNs) {
    try { return Number(process.hrtime.bigint() - startNs) / 1e9; }
    catch (e) { return 0; }
  }

  /* Prometheus histogram_quantile() equivalent: linear interpolation
     inside the bucket that contains the q-th observation. */
  function quantile(name, labels, q) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'histogram') return null;
      const vals = normalize(m, labels);
      if (!vals) return null;
      const s = m.series.get(seriesKey(vals));
      if (!s || s.count === 0) return null;
      const rank = q * s.count;
      let prevCount = 0, prevBound = 0;
      for (let i = 0; i < m.buckets.length; i++) {
        if (s.counts[i] >= rank) {
          const bound = m.buckets[i];
          const span = bound - prevBound;
          const inner = s.counts[i] - prevCount;
          if (inner <= 0) return bound;
          return prevBound + span * ((rank - prevCount) / inner);
        }
        prevCount = s.counts[i];
        prevBound = m.buckets[i];
      }
      return m.buckets[m.buckets.length - 1];   /* beyond the last bucket */
    } catch (e) { return null; }
  }

  function value(name, labels) {
    try {
      const m = metrics.get(name);
      if (!m) return null;
      const vals = normalize(m, labels);
      if (!vals) return null;
      const s = m.series.get(seriesKey(vals));
      return s ? s.value : null;
    } catch (e) { return null; }
  }

  function histSummary(name, labels) {
    try {
      const m = metrics.get(name);
      if (!m || m.type !== 'histogram') return null;
      const vals = normalize(m, labels);
      if (!vals) return null;
      const s = m.series.get(seriesKey(vals));
      if (!s) return { count: 0, sum: 0, p50: null, p95: null, p99: null };
      return {
        count: s.count,
        sum: s.sum,
        p50: quantile(name, labels, 0.5),
        p95: quantile(name, labels, 0.95),
        p99: quantile(name, labels, 0.99)
      };
    } catch (e) { return null; }
  }

  /* ── exposition ────────────────────────────────────────────────── */
  function render() {
    /* Keep the self-monitoring counter in the registry (not synthesized in
       text) so it is part of the declared catalogue and shows up in
       snapshot()/drift guards like any other metric. */
    const ds = metrics.get('payesh_metrics_dropped_series_total');
    if (ds) {
      const s = getSeries(ds, [], true);
      if (s) s.value = droppedSeriesTotal();
    }
    const out = [];
    for (const m of metrics.values()) {
      if (m.series.size === 0) continue;
      out.push('# HELP ' + m.name + ' ' + escHelp(m.help));
      out.push('# TYPE ' + m.name + ' ' + m.type);
      for (const s of m.series.values()) {
        const lbl = m.labelNames.map((n, i) => n + '="' + escLabelValue(s.values[i]) + '"');
        if (m.type === 'histogram') {
          for (let i = 0; i < m.buckets.length; i++) {
            const all = lbl.concat(['le="' + m.buckets[i] + '"']).join(',');
            out.push(m.name + '_bucket{' + all + '} ' + s.counts[i]);
          }
          const inf = lbl.concat(['le="+Inf"']).join(',');
          out.push(m.name + '_bucket{' + inf + '} ' + s.count);
          out.push(m.name + '_sum{' + lbl.join(',') + '} ' + s.sum);
          out.push(m.name + '_count{' + lbl.join(',') + '} ' + s.count);
        } else {
          out.push(m.name + (lbl.length ? '{' + lbl.join(',') + '}' : '') + ' ' + s.value);
        }
      }
    }
    return out.join('\n') + '\n';
  }

  /* Plain-JSON view (tests + /api/health debug), never for scraping. */
  function snapshot() {
    const o = {};
    for (const m of metrics.values()) {
      const arr = [];
      for (const s of m.series.values()) {
        const labels = {};
        m.labelNames.forEach((n, i) => { labels[n] = s.values[i]; });
        if (m.type === 'histogram') {
          arr.push({ labels, count: s.count, sum: s.sum, p50: quantile(m.name, labels, 0.5), p95: quantile(m.name, labels, 0.95), p99: quantile(m.name, labels, 0.99) });
        } else {
          arr.push({ labels, value: s.value });
        }
      }
      o[m.name] = { type: m.type, help: m.help, series: arr };
    }
    return o;
  }

  function reset() { metrics.clear(); dropCounts.clear(); declareAll(api); declareSelfMonitor(); }

  function stats() {
    const o = { max_series_per_metric: maxSeries, dropped: {}, dropped_series_total: droppedSeriesTotal() };
    for (const [k, v] of dropCounts) o.dropped[k] = v;
    return o;
  }

  /* Self-monitoring: the cardinality guard must be observable even in a
     brand-new registry, before any recorder has run — otherwise a scrape
     cannot tell "guard never fired" from "guard metric missing". */
  function declareSelfMonitor() {
    declare('counter', 'payesh_metrics_dropped_series_total',
      'Observations dropped by the cardinality guard (R2). A non-zero rate is a code bug.', []);
  }
  declareSelfMonitor();

  const api = {
    counter, gauge, histogram,
    inc, set, add, observe,
    startTimer, elapsedSeconds, quantile, value, histSummary,
    render, snapshot, reset, stats,
    maxSeries
  };
  return api;
}

/* ═══════════════════════════════════════════════════════════════════
   Route templating (R3). Closed allowlist — mirrors server/index.js.
   tests/wave14-observability.js T7 asserts the two stay in sync, so a
   new /api/ route cannot silently become an "api_unmatched" label.
   ═══════════════════════════════════════════════════════════════════ */
const ROUTE_EXACT = new Set([
  '/api/health',
  '/api/auth/send-code', '/api/auth/login', '/api/auth/me',
  '/api/auth/logout', '/api/auth/delete-account',
  '/api/sync', '/api/sync/conflicts', '/api/sync/resolve-conflict',
  '/api/bell/now', '/api/public-report',
  '/api/admin/backup', '/api/admin/restore',
  '/api/sms/send',
  '/api/health-index', /* G.1 (main — PR #31) */
  /* Wave 15 (main) — Health/Deployment endpoints */
  '/api/liveness', '/api/readiness', '/api/__slow',
  '/api/v1/bootstrap', '/api/v1/pull',
  '/api/v1/students', '/api/v1/classes', '/api/v1/attendance',
  '/api/v1/grades', '/api/v1/users',
  /* Wave 23 (f303687) — چهار endpointِ گزارشِ وزارتی (routes/reports.js).
     ممیزی دور ۲: این‌ها از allowlist جا مانده بودند ⇒ T7a قرمز و هر
     فراخوانی برچسبِ fail-closedِ api_unmatched می‌گرفت (کوریِ سنجه). */
  '/api/v1/reports/attendance', '/api/v1/reports/academic',
  '/api/v1/reports/finance', '/api/v1/reports/teachers',
  /* Canary & System endpoints */
  '/api/system/canary/status', '/api/system/canary/promote',
  '/api/system/canary/weight', '/api/system/canary/rollback', '/api/system/canary/circuit-breaker',
  /* Analytics endpoints */
  '/api/v1/analytics/school-intelligence', '/api/v1/analytics/regional-intelligence',
  '/api/v1/analytics/quality-governance', '/api/v1/analytics/longitudinal-intelligence',
  '/api/v1/analytics/action-recommendations', '/api/v1/analytics/feedback-learning-memory',
  '/api/v1/analytics/intelligence-governance', '/api/v1/analytics/policy-simulation',
  '/api/v1/analytics/decision-command', '/api/v1/analytics/operational-execution',
  '/api/v1/analytics/outcome-evaluation', '/api/v1/analytics/intelligence-platform',
  '/api/v1/analytics/intelligence-certification',
  /* System Health & Certification endpoints */
  '/api/v1/system/scalability-health', '/api/v1/system/event-processing-health',
  '/api/v1/system/observability-health', '/api/v1/system/disaster-recovery-health',
  '/api/v1/system/pilot-deployment-health', '/api/v1/system/security-health',
  '/api/v1/system/phase4-certification', '/api/v1/system/scalability-certification',
  /* Phase 5 Federation & Provincial Pilot endpoints */
  '/api/v1/system/phase5/regions', '/api/v1/system/phase5/federation-health',
  '/api/v1/system/phase5/resource-governance', '/api/v1/system/phase5/pilot-approval',
  '/api/v1/system/phase5/provincial-pilots', '/api/v1/system/phase5/provincial-pilots/capacity',
  '/api/v1/system/phase5/provincial-pilots/activate', '/api/v1/system/phase5/provincial-pilots/traffic-rollout',
  /* National Control Plane endpoints */
  '/api/v1/system/national/regions', '/api/v1/system/national/capacity',
  '/api/v1/system/national/capacity/reservations', '/api/v1/system/national/capacity/reservation',
  '/api/v1/system/national/health', '/api/v1/system/national/traffic',
  '/api/v1/system/national/operations', '/api/v1/system/national/readiness',
  '/api/v1/system/national/load-test', '/api/v1/system/national/incidents',
  '/api/v1/system/national/change-request', '/api/v1/system/national/write-smoothing',
  /* Phase 6 Canary endpoints */
  '/api/v1/system/phase6/canary/status', '/api/v1/system/phase6/canary/promote',
  '/api/v1/system/phase6/canary/weight', '/api/v1/system/phase6/canary/rollback',
  '/api/v1/system/phase6/canary/circuit-breaker',
  '/metrics'
]);
const ROUTE_PATTERNS = [
  { re: /^\/api\/students\/\d+$/, route: '/api/students/:id' },
  { re: /^\/api\/v1\/students\/\d+$/, route: '/api/v1/students/:id' },
  { re: /^\/api\/v1\/classes\/\d+$/, route: '/api/v1/classes/:id' },
  { re: /^\/api\/v1\/attendance\/\d+$/, route: '/api/v1/attendance/:id' },
  { re: /^\/api\/v1\/grades\/\d+$/, route: '/api/v1/grades/:id' },
  { re: /^\/api\/v1\/users\/\d+$/, route: '/api/v1/users/:id' }
];
const STATIC_EXACT = new Set([
  '/', '/index.html', '/USER_GUIDE.html', '/guide.html',
  '/account-deletion.html', '/account-deletion', '/privacy.html', '/privacy'
]);

/* Delta Phase 4 (gap 4): جمعِ سنجه‌هایِ sync برایِ /api/health —
   سری‌های برچسب‌دار (pulls{mode}، compressions{encoding}) جمع می‌شوند و
   برایِ هیستوگرام‌های حجم، میانگینِ sum/count گزارش می‌شود. خروجی فقط
   عدد صحیح/اعشاریِ محدود است (قاعدهٔ Q3 — هیچ دادهٔ session/tenant بیرون
   نمی‌رود). */
function syncHealthStats(snap) {
  snap = snap || {};
  const total = (name, labelKey, labelVal) => {
    const m = snap[name];
    if (!m || !Array.isArray(m.series)) return 0;
    return m.series
      .filter((x) => !labelKey || (x.labels && x.labels[labelKey] === labelVal))
      .reduce((a, x) => a + (Number(x.value) || 0), 0);
  };
  const avg = (name) => {
    const m = snap[name];
    if (!m || !Array.isArray(m.series) || !m.series.length) return null;
    let sum = 0, cnt = 0;
    for (const x of m.series) { sum += Number(x.sum) || 0; cnt += Number(x.count) || 0; }
    return cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : null;
  };
  return {
    pulls_total: total('payesh_sync_pulls_total'),
    pulls_delta: total('payesh_sync_pulls_total', 'mode', 'delta'),
    pulls_full: total('payesh_sync_pulls_total', 'mode', 'full'),
    pushes_total: total('payesh_sync_pushes_total'),
    conflicts_total: total('payesh_sync_conflicts_total'),
    backpressure_rejections_total: total('payesh_sync_backpressure_rejections_total'),
    cursor_expired_total: total('payesh_cursor_expired_total'),
    cursor_region_mismatch_total: total('payesh_cursor_region_mismatch_total'),
    delta_size_bytes_avg: avg('payesh_sync_delta_size_bytes'),
    delta_wire_bytes_avg: avg('payesh_sync_delta_wire_bytes'),
    compressions_total: total('payesh_sync_delta_compressions_total')
  };
}

function routeTemplate(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return 'static_other';
  const p = pathname.length > 512 ? pathname.slice(0, 512) : pathname;
  if (ROUTE_EXACT.has(p)) return p;
  for (let i = 0; i < ROUTE_PATTERNS.length; i++) {
    if (ROUTE_PATTERNS[i].re.test(p)) return ROUTE_PATTERNS[i].route;
  }
  if (STATIC_EXACT.has(p)) return 'static';
  /* Fail-closed: never promote an arbitrary path (query strings, ids,
     traversal attempts) into a label value. */
  return p.indexOf('/api/') === 0 ? 'api_unmatched' : 'static_other';
}

/* ═══════════════════════════════════════════════════════════════════
   The process-wide registry + the declared metric catalogue.
   ═══════════════════════════════════════════════════════════════════ */
const registry = createRegistry({
  maxSeries: clampInt(process.env.PAYESH_METRICS_MAX_SERIES, 1024, 8, 100000)
});

function declareAll(r) {
  /* ── HTTP ── */
  r.counter('payesh_http_requests_total', 'HTTP requests served, by route template, method and status code.', ['route', 'method', 'code']);
  r.histogram('payesh_http_request_duration_seconds', 'HTTP request latency in seconds.', ['route', 'method'], [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]);
  r.counter('payesh_http_responses_bytes_total', 'Response body bytes written (size signal for payload regressions).', ['route']);
  /* ── Auth / abuse ── */
  r.counter('payesh_auth_otp_requests_total', 'OTP send-code requests by outcome.', ['outcome']);
  r.counter('payesh_auth_login_total', 'Login attempts by outcome.', ['outcome']);
  r.counter('payesh_auth_rejections_total', 'Session-scoped rejections (401/403/404) counted by the enumeration guard.', ['stage']);
  /* ── Runtime security monitoring (Q3) ── */
  r.counter('payesh_runtime_anomalies_total', 'Rolling-baseline runtime anomalies by bounded signal.', ['signal']);
  r.counter('payesh_attack_patterns_detected_total', 'Runtime attack signatures detected by bounded pattern and severity.', ['pattern', 'severity']);
  r.gauge('payesh_suspicious_sessions', 'Distinct suspicious runtime sessions in the last 24 hours.', []);
  r.gauge('payesh_attack_patterns_blocked', 'Detected attack patterns associated with blocked/denied attempts in the last 24 hours.', []);
  /* ── Sync / A01 ── */
  r.counter('payesh_sync_requests_total', 'POST /api/sync requests by status code.', ['code']);
  r.histogram('payesh_sync_batch_ops', 'Ops per sync push (offline queue drain size).', [], [1, 5, 10, 25, 50, 100, 250, 500]);
  r.counter('payesh_sync_conflicts_total', 'Sync conflicts detected (optimistic concurrency).', ['collection']);
  /* Delta Hardening Phase 2 (gap 4): OCC base_version gate latency — the
     detection step (locate record + version compare) on every versioned
     write. Labels are a closed set: conflict | stale | clean. */
  r.histogram('payesh_sync_conflict_detection_seconds', 'OCC conflict-detection time (base_version gate).', ['outcome'],
    [0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25]);
  /* ── Delta Phase 4 — backpressure / compression / observability / region ── */
  r.counter('payesh_sync_backpressure_rejections_total', 'Sync batches rejected with 429 sync_backpressure (per-session op window exceeded).', []);
  r.counter('payesh_sync_pulls_total', 'Pull requests served, by mode (delta | full).', ['mode']);
  r.counter('payesh_sync_pushes_total', 'Sync pushes received (POST /api/sync with a non-empty ops batch).', []);
  r.histogram('payesh_sync_delta_size_bytes', 'Pull response JSON size before compression (bytes).', [],
    [256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304]);
  r.histogram('payesh_sync_delta_wire_bytes', 'Pull response bytes actually put on the wire (post-compression when negotiated).', [],
    [256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304]);
  r.counter('payesh_sync_delta_compressions_total', 'Pull responses compressed, by encoding (gzip | br).', ['encoding']);
  r.counter('payesh_cursor_expired_total', 'Pull cursors rejected as expired (TTL).', []);
  /* ── پ۳ تله‌متری بریدگی/resume — سنجشِ معیارِ بازفعال‌سازی #۱ دوزیهٔ کش
     (REPORT_CACHE_ISOLATION_DOSSIER §۵). کاردینالیته کران‌دار: برچسبِ
     collection فقط از مجموعهٔ ثابتِ سنگین + 'other' (pull.js تحمیل می‌کند). */
  r.counter('payesh_pull_partial_collections_total',
    'Collections delivered truncated (row-cap or byte-budget) in a pull response.', ['collection']);
  r.counter('payesh_pull_full_snapshot_required_total',
    'Truncated-delta collections flagged full_snapshot_required (client must resume).', ['collection']);
  r.counter('payesh_pull_resume_snapshot_total',
    'Bounded full-snapshot pulls served for a client resume (resume=1).', ['collection']);
  r.counter('payesh_cursor_region_mismatch_total', 'Pull cursors rejected because they were issued by another region (cursor v2 rg binding).', []);
  /* ── Database ── */
  r.histogram('payesh_db_query_duration_seconds', 'SQL round-trip latency.', ['op', 'target']);
  r.counter('payesh_db_query_errors_total', 'SQL errors by op and target.', ['op', 'target']);
  r.counter('payesh_db_slow_queries_total', 'SQL round trips slower than PAYESH_DB_SLOW_MS.', ['op', 'target']);
  r.gauge('payesh_db_pool_connections', 'Pool connections by state.', ['pool', 'state']);
  r.gauge('payesh_db_pool_waiting', 'Clients waiting for a pool connection.', ['pool']);
  /* ── Audit & Authority Observability (S2 Remediation) ── */
  r.counter('payesh_audit_write_failures_total', 'Failures writing structured audit log entries.', ['sink', 'reason']);
  r.counter('payesh_authority_unavailable_total', 'Authority queries or assertions failing due to database detachment or connection drop.', ['subsystem', 'reason']);
  /* ── Cache / Redis ── */
  r.counter('payesh_cache_lookups_total', 'Bootstrap cache lookups by layer and outcome.', ['layer', 'outcome']);
  r.counter('payesh_cache_invalidations_total', 'Cache invalidations by scope.', ['scope']);
  r.counter('payesh_rate_limit_decisions_total', 'Distributed rate-limit decisions.', ['action', 'decision']);
  /* ── Queue / worker ── */
  r.gauge('payesh_outbox_depth', 'Pending outbox events (async queue depth).', ['status']);
  r.counter('payesh_worker_events_total', 'Worker event processing outcome.', ['outcome']);
  /* ── Runtime ── */
  r.gauge('payesh_node_heap_used_bytes', 'Node heap used.', []);
  r.gauge('payesh_node_heap_total_bytes', 'Node heap total.', []);
  r.gauge('payesh_node_rss_bytes', 'Process RSS.', []);
  r.gauge('payesh_node_eventloop_lag_seconds', 'Event-loop scheduling lag (sampled).', []);
  /* Declared a GAUGE on purpose: startRuntimeCollector() `set`s an absolute
     seconds value from process.cpuUsage(). Declaring it a counter and then
     setting it would both lie in the exposition format AND be silently
     dropped by set() (not_a_gauge) — the CPU series would never appear. */
  r.gauge('payesh_node_cpu_seconds_total', 'Process CPU time in seconds (absolute, sampled).', ['mode']);
  r.gauge('payesh_node_uptime_seconds', 'Process uptime.', []);
  r.gauge('payesh_build_info', 'Build/deploy identity (always 1).', ['version', 'phase']);
  /* قراردادِ exposition (فرمتِ Prometheus): هیستوگرام‌ها علاوه بر خودِ نام،
     سری‌هایِ payesh_http_request_duration_seconds_bucket و _sum و _count را
     می‌سازند (رندررِ پایین، خطِ m.name + '_bucket'). */
  /* ── main-stack compatibility series (چت ۵ live-deploy: alert-rules.yml و
        dashboards/payesh-main.json این نام‌ها را می‌خوانند). مقادیر در
        زمانِ scrape توسط publishRuntimeProbes() تازه می‌شوند. نام‌ها عمداً
        همان‌هایِ استکِ زندهٔ main هستند تا زنجیرهٔ alert/dashboard نشکند. ── */
  r.gauge('payesh_redis_up', 'Redis reachable (scrape-time probe).', []);
  r.gauge('payesh_redis_ping_latency_ms', 'Redis PING round-trip in ms (scrape-time probe).', []);
  r.gauge('payesh_db_up', 'Database engine reachable (scrape-time probe).', []);
  r.gauge('payesh_db_query_latency_ms', 'DB health-check latency in ms (scrape-time probe).', []);
  r.gauge('payesh_db_pool_total', 'Pool connections (total) by pool.', ['pool']);
  r.gauge('payesh_db_pool_idle', 'Pool connections (idle) by pool.', ['pool']);
  r.gauge('payesh_sync_queue_depth', 'Pending outbox rows (sync queue depth).', []);
  r.gauge('payesh_cache_hits_total', 'L1 cache hits (compat alias of l1Stats).', []);
  r.gauge('payesh_cache_misses_total', 'L1 cache misses (compat alias of l1Stats).', []);
  r.gauge('payesh_eventloop_lag_ms', 'Event-loop lag in ms (compat alias of the sampled seconds gauge).', []);
  r.gauge('payesh_process_heap_bytes', 'Process heap used (compat alias).', []);
  r.gauge('payesh_process_rss_bytes', 'Process RSS (compat alias).', []);
  r.gauge('payesh_process_uptime_seconds', 'Process uptime (compat alias).', []);
  r.gauge('payesh_process_gc_total', 'GC cycles since collector start (best-effort).', []);
  /* ── دیسک (F5) — فضای فایل‌سیستمِ مسیرِ داده. statfs نیتیوِ Node، بدون وابستگیِ تازه.
       این سه سری با قاعدهٔ DiskSpaceLow در infra/observability/alert-rules.yml (تنها
       فایلی که prometheus.yml rule_files بارگذاری می‌کند) و با ردیفِ متناظر در آرایهٔ
       RULES در tests/observability-config.js قفلِ متقابل دارند. این سه فایل باید با هم
       land شوند: آن تست ruleBlocks.length === RULES.length را می‌سنجد، پس افزودنِ
       قاعده بدونِ افزودنِ ردیف، گیت را قرمز می‌کند. ── */
  r.gauge('payesh_disk_total_bytes', 'Total bytes of the filesystem holding the data directory (statfs blocks*bsize).', []);
  r.gauge('payesh_disk_avail_bytes', 'Non-privileged available bytes on the data filesystem (statfs bavail*bsize).', []);
  r.gauge('payesh_disk_used_ratio', 'Used ratio 0..1 of the data filesystem (node_exporter convention: root-reserved blocks excluded).', []);
}

declareAll(registry);

/* ═══════════════════════════════════════════════════════════════════
   Runtime collector — started explicitly by server/index.js so that
   merely requiring this module (tests) has no timers and no side effects.
   ═══════════════════════════════════════════════════════════════════ */
let runtimeTimers = null;


/* ═══════════════════════════════════════════════════════════════════
   publishRuntimeProbes — کشفِ لحظهٔ scrape برای سری‌های سازگاریِ استکِ main
   (منتقل از metrics.js قدیمیِ main — چت ۵؛ هر بلوک مستقل fail-safe است).
   ═══════════════════════════════════════════════════════════════════ */
async function _safe(fn, fallback) { try { return await fn(); } catch (e) { return fallback; } }

async function publishRuntimeProbes() {
  /* Redis */
  try {
    const redisMod = await _safe(() => require('./redis'), null);
    let up = 0, pingMs = 0;
    if (redisMod && typeof redisMod.isRedis === 'function' && redisMod.isRedis()) {
      up = 1;
      if (typeof redisMod.ping === 'function') {
        const t0 = process.hrtime.bigint();
        const ok = await _safe(() => redisMod.ping(), false);
        pingMs = Number(process.hrtime.bigint() - t0) / 1e6;
        if (!ok) up = 0;
      }
    }
    registry.set('payesh_redis_up', [], up);
    registry.set('payesh_redis_ping_latency_ms', [], pingMs);
  } catch (e) {}
  /* DB (engine up + health latency + pools + outbox depth) */
  try {
    const dbMod = await _safe(() => require('./db'), null);
    if (dbMod && typeof dbMod.isPostgres === 'function' && dbMod.isPostgres()) {
      registry.set('payesh_db_up', [], 1);
      const h = await _safe(() => dbMod.healthCheck(), null);
      registry.set('payesh_db_query_latency_ms', [], (h && Number(h.latency_ms)) || 0);
      const s = await _safe(() => dbMod.poolStats(), null);
      if (s) {
        const pools = [];
        if (s.primary) pools.push(['primary', s.primary]);
        if (s.read_replica && s.read_replica.active) pools.push(['read_replica', s.read_replica]);
        for (const [nm, ps] of pools) {
          registry.set('payesh_db_pool_total', [nm], Number(ps.total_count) || 0);
          registry.set('payesh_db_pool_idle', [nm], Number(ps.idle_count) || 0);
        }
      }
      const r = await _safe(() => dbMod.query("SELECT count(*)::int AS n FROM server_outbox WHERE status = 'pending'"), null);
      registry.set('payesh_sync_queue_depth', [], r && r.rows && r.rows[0] ? Number(r.rows[0].n) : 0);
    } else {
      registry.set('payesh_db_up', [], 1); /* memory mode: process-local, inline flush */
      registry.set('payesh_sync_queue_depth', [], 0);
    }
  } catch (e) { try { registry.set('payesh_db_up', [], 0); } catch (e2) {} }
  /* Cache L1 (compat aliases) */
  try {
    const cacheMod = await _safe(() => require('./cache'), null);
    if (cacheMod && typeof cacheMod.l1Stats === 'function') {
      const s = cacheMod.l1Stats() || {};
      registry.set('payesh_cache_hits_total', [], s.hits | 0);
      registry.set('payesh_cache_misses_total', [], s.misses | 0);
    }
  } catch (e) {}
  /* Process compat aliases */
  try {
    const mu = process.memoryUsage();
    registry.set('payesh_process_heap_bytes', [], mu.heapUsed || 0);
    registry.set('payesh_process_rss_bytes', [], mu.rss || 0);
    registry.set('payesh_process_uptime_seconds', [], process.uptime() || 0);
    const lagS = Number(registry.value('payesh_node_eventloop_lag_seconds', []) || 0);
    registry.set('payesh_eventloop_lag_ms', [], lagS * 1000);
    if (typeof gcCounter === 'number') registry.set('payesh_process_gc_total', [], gcCounter);
  } catch (e) {}
  /* Disk (F5) — statfs on the filesystem holding the data directory.
     Native fs.promises.statfs (Node >=19.6; fs.statfs since >=18.15) — no new dependency.
     Fail-soft by design: any error leaves the series unset instead of breaking the scrape,
     matching the try/catch discipline of every other probe in this function. */
  try {
    const fsMod = await _safe(() => require('fs'), null);
    const pathMod = await _safe(() => require('path'), null);
    if (fsMod && pathMod && fsMod.promises && typeof fsMod.promises.statfs === 'function') {
      const dataDir = process.env.PAYESH_DATA_DIR || pathMod.join(__dirname, 'data');
      /* server/data may not exist before the first seed — walk up to the nearest existing
         ancestor so the probe reports the filesystem that would hold the data rather than
         throwing ENOENT and silently publishing nothing. */
      let probe = pathMod.resolve(dataDir);
      while (!fsMod.existsSync(probe)) {
        const up = pathMod.dirname(probe);
        if (up === probe) break; /* filesystem root */
        probe = up;
      }
      const st = await _safe(() => fsMod.promises.statfs(probe), null);
      const bsize = st ? Number(st.bsize) : 0;
      const blocks = st ? Number(st.blocks) : 0;
      if (bsize > 0 && blocks > 0) {
        const total = blocks * bsize;
        const free = Number(st.bfree) * bsize;
        const avail = Number(st.bavail) * bsize;
        const used = Math.max(0, total - free);
        /* node_exporter convention: the denominator excludes root-reserved blocks
           (bfree - bavail), so the ratio matches what operators compare against. */
        const denom = used + avail;
        registry.set('payesh_disk_total_bytes', [], total);
        registry.set('payesh_disk_avail_bytes', [], avail);
        registry.set('payesh_disk_used_ratio', [], denom > 0 ? used / denom : 0);
      }
    }
  } catch (e) {}
}

/* شمارشِ GC فقط با اجرایِ کلکتور (بدون side-effect در require) */
let gcCounter = 0;
let gcObserverInstalled = false;
function installGcObserver() {
  if (gcObserverInstalled) return;
  gcObserverInstalled = true;
  try {
    const { PerformanceObserver } = require('perf_hooks');
    new PerformanceObserver((list) => { gcCounter += list.getEntries().length; }).observe({ entryTypes: ['gc'] });
  } catch (e) {}
}
function startRuntimeCollector(intervalMs) {
  installGcObserver();
  if (runtimeTimers) return runtimeTimers;
  const ms = clampInt(intervalMs || process.env.PAYESH_METRICS_INTERVAL_MS, 5000, 250, 600000);

  /* Event-loop lag: schedule a timer, measure how late it actually fired. */
  let last = process.hrtime.bigint();
  const lag = setInterval(() => {
    try {
      const now = process.hrtime.bigint();
      const deltaS = Number(now - last) / 1e9;
      last = now;
      const lagS = deltaS - ms / 1000;
      registry.set('payesh_node_eventloop_lag_seconds', null, lagS > 0 ? lagS : 0);
    } catch (e) { /* R1 */ }
  }, ms);

  const sample = setInterval(() => {
    try {
      const mu = process.memoryUsage();
      registry.set('payesh_node_heap_used_bytes', null, mu.heapUsed);
      registry.set('payesh_node_heap_total_bytes', null, mu.heapTotal);
      registry.set('payesh_node_rss_bytes', null, mu.rss);
      const cpu = process.cpuUsage();
      registry.set('payesh_node_cpu_seconds_total', { mode: 'user' }, cpu.user / 1e6);
      registry.set('payesh_node_cpu_seconds_total', { mode: 'system' }, cpu.system / 1e6);
      registry.set('payesh_node_uptime_seconds', null, process.uptime());
    } catch (e) { /* R1 */ }
  }, ms);
  /* cpu counters are monotonic; declare them as gauges to stay format-honest
     (we `set` an absolute seconds value, we never `inc`). */

  if (lag.unref) lag.unref();
  if (sample.unref) sample.unref();
  runtimeTimers = { lag, sample, intervalMs: ms };
  /* one immediate sample so a fresh scrape is never empty */
  try {
    const mu = process.memoryUsage();
    registry.set('payesh_node_heap_used_bytes', null, mu.heapUsed);
    registry.set('payesh_node_rss_bytes', null, mu.rss);
    registry.set('payesh_node_uptime_seconds', null, process.uptime());
  } catch (e) {}
  return runtimeTimers;
}

function stopRuntimeCollector() {
  if (!runtimeTimers) return;
  clearInterval(runtimeTimers.lag);
  clearInterval(runtimeTimers.sample);
  runtimeTimers = null;
}

/* ═══════════════════════════════════════════════════════════════════
   Scrape gate (R4) — fail-closed.
     PAYESH_METRICS=0                     → disabled (404)
     production && no token               → disabled (404, endpoint hidden)
     token configured                     → Authorization: Bearer <token>
                                            (timing-safe) else 403
     no token, non-production             → loopback remote address only
   ═══════════════════════════════════════════════════════════════════ */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

function scrapeGate(req) {
  const env = process.env;
  if (env.PAYESH_METRICS === '0') return { ok: false, status: 404, code: 'not_found' };
  const token = env.PAYESH_METRICS_TOKEN;
  const isProd = env.PAYESH_ENV === 'production';
  if (token) {
    const h = (req && req.headers && req.headers.authorization) || '';
    const m = /^Bearer\s+(.+)$/.exec(h);
    const provided = m ? m[1] : '';
    const a = Buffer.from(String(token), 'utf8');
    const b = Buffer.from(String(provided), 'utf8');
    const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
    return ok ? { ok: true } : { ok: false, status: 403, code: 'forbidden' };
  }
  if (isProd) return { ok: false, status: 404, code: 'not_found' };
  const addr = (req && (req.socket && req.socket.remoteAddress)) || '';
  return LOOPBACK.has(addr) ? { ok: true } : { ok: false, status: 403, code: 'forbidden' };
}

/* ═══════════════════════════════════════════════════════════════════
   Convenience recorders used by server/index.js
   ═══════════════════════════════════════════════════════════════════ */
function observeHttpRequest(o) {
  /* خوداسکرپ حذف شده (ضدفیدبک‌لوپ — قراردادِ استکِ زندهٔ main): شمردنِ
     خودِ /metrics یعنی هر scrape سریِ http را بزرگ‌تر می‌کند؛ هرگز شمرده نمی‌شود. */
  if (o && o.route === '/metrics') return;
  try {
    const route = routeTemplate(o && o.route);
    const method = String((o && o.method) || 'GET').toUpperCase().slice(0, 8);
    const code = String((o && o.status) || 0).slice(0, 3);
    registry.inc('payesh_http_requests_total', { route, method, code });
    const d = Number(o && o.durationSeconds);
    if (Number.isFinite(d) && d >= 0) registry.observe('payesh_http_request_duration_seconds', { route, method }, d);
    const bytes = Number(o && o.bytes);
    if (Number.isFinite(bytes) && bytes >= 0) registry.inc('payesh_http_responses_bytes_total', { route }, bytes);
  } catch (e) { /* R1 */ }
}

function observeAuth(event, outcome) {
  try {
    if (event === 'otp') registry.inc('payesh_auth_otp_requests_total', { outcome: String(outcome || 'unknown').slice(0, 32) });
    else if (event === 'login') registry.inc('payesh_auth_login_total', { outcome: String(outcome || 'unknown').slice(0, 32) });
    else if (event === 'rejection') registry.inc('payesh_auth_rejections_total', { stage: String(outcome || 'unknown').slice(0, 32) });
  } catch (e) { /* R1 */ }
}

function observeSyncBatch(opCount) {
  try {
    const n = Number(opCount);
    if (!Number.isFinite(n) || n < 0) return;
    registry.observe('payesh_sync_batch_ops', null, n);
  } catch (e) { /* R1 */ }
}

function observeDb(op, target, durationSeconds, errored, slow) {
  try {
    const labels = { op: String(op || 'query').slice(0, 32), target: String(target || 'primary').slice(0, 16) };
    const d = Number(durationSeconds);
    if (Number.isFinite(d) && d >= 0) registry.observe('payesh_db_query_duration_seconds', labels, d);
    if (errored) registry.inc('payesh_db_query_errors_total', labels);
    if (slow) registry.inc('payesh_db_slow_queries_total', labels);
  } catch (e) { /* R1 */ }
}

/* Outbox / async queue depth — closed label set (see outbox.depth()). */
function publishOutboxDepth(d) {
  try {
    if (!d || typeof d !== 'object') return;
    for (const k of ['pending', 'processed', 'failed', 'legacy', 'total']) {
      const v = Number(d[k]);
      if (Number.isFinite(v)) registry.set('payesh_outbox_depth', { status: k }, v);
    }
  } catch (e) { /* R1 */ }
}

function publishDbPools(stats) {
  try {
    if (!stats) return;
    const pools = [['primary', stats.primary], ['read_replica', stats.read_replica]];
    for (const [pname, p] of pools) {
      if (!p || p.active === false) continue;
      registry.set('payesh_db_pool_connections', { pool: pname, state: 'total' }, p.total_count || 0);
      registry.set('payesh_db_pool_connections', { pool: pname, state: 'idle' }, p.idle_count || 0);
      registry.set('payesh_db_pool_waiting', { pool: pname }, p.waiting_count || 0);
    }
  } catch (e) { /* R1 */ }
}

module.exports = {
  createRegistry,
  registry,
  /* recorders */
  inc: registry.inc,
  set: registry.set,
  add: registry.add,
  observe: registry.observe,
  startTimer: registry.startTimer,
  elapsedSeconds: registry.elapsedSeconds,
  quantile: registry.quantile,
  value: registry.value,
  histSummary: registry.histSummary,
  /* exposition */
  render: registry.render,
  snapshot: registry.snapshot,
  stats: registry.stats,
  reset: registry.reset,
  /* helpers */
  syncHealthStats,
  routeTemplate,
  observeHttpRequest,
  observeAuth,
  observeSyncBatch,
  observeDb,
  publishDbPools,
  publishOutboxDepth,
  publishRuntimeProbes,
  scrapeGate,
  startRuntimeCollector,
  stopRuntimeCollector,
  /* introspection (tests + docs drift guard) */
  ROUTE_EXACT,
  ROUTE_PATTERNS,
  STATIC_EXACT,
  DEFAULT_BUCKETS,
  __declareAll: declareAll
};
