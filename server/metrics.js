/* ═══════════════════════════════════════════════════════════════════
   server/metrics.js — PayeshMetrics: a dependency-free Prometheus
   text-exposition endpoint for Wave 14 live deployment.

   Zero new runtime deps (node stdlib only). All instruments are O(1)
   in the request path; the expensive pulls (redis ping, db health,
   outbox count) run AT SCRAPE TIME only and are individually guarded —
   one dead subsystem must never take /metrics down (it degrades to
   *_up=0 series, which is exactly what the alerts consume).

   Metric surface (names are pinned by tests/observability-*.js —
   alert-rules.yml and the Grafana dashboards speak the same names):
     payesh_http_requests_total{method,route,status}      counter
     payesh_http_request_duration_seconds{route}         histogram(+_sum/_count)
     payesh_redis_up                                       gauge 0/1
     payesh_redis_ping_latency_ms                          gauge
     payesh_db_up{driver}                                  gauge
     payesh_db_query_latency_ms                            gauge   (scrape-time sample)
     payesh_db_pool_total / _idle / _waiting{pool}         gauges
     payesh_sync_queue_depth                               gauge
     payesh_cache_hits_total / payesh_cache_misses_total  counters (L1)
     payesh_eventloop_lag_ms{q="p50|p95|p99"}              gauges
     payesh_process_heap_bytes{kind="used|total|limit"}    gauges
     payesh_process_rss_bytes / _uptime_seconds            gauges
     payesh_process_gc_total                                counter
   Cardinality guards: method ∈ {GET,POST,PATCH,PUT,DELETE,OTHER}; route
   normalized to /api/<resource>; status ∈ {2xx,3xx,4xx,5xx,1xx}.

   /metrics contract with the edge: nginx proxies ONLY /api/ and /, where
   / is static files — /metrics never leaves the process host unless the
   operator routes it; scrape from the LAN side or via Prometheus
   host.docker.internal. Optional shared secret: METRICS_TOKEN env turns
   the endpoint into 401-unless-X-Metrics-Token-matches mode.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const v8 = require('v8');
const { monitorEventLoopDelay } = require('perf_hooks');

const ROUTE_LABEL = /^\/api\/([a-z-]+)(?:\/|$)/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const HIST_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]; /* seconds */

const state = {
  http: new Map(),          /* method|route|cls → {sum, count, buckets[]} */
  eld: null,                /* interval histogram */
  gcCount: 0,
  started: Date.now()
};

/* cardinality guard: bounded resource-name charset + length cap, everything
   unknown folds into /api/other — unbounded user-controlled labels never
   reach the map. */
const ROUTE_RESOURCE = /^[a-z][a-z0-9_-]{0,23}$/;
function routeOf(p) {
  const s = String(p || '/').split('?')[0];
  const m = s.match(ROUTE_LABEL);
  const r = m && m[1];
  return r && ROUTE_RESOURCE.test(r) ? '/api/' + r : '/api/other';
}
function statusClass(code) {
  const c = Number(code) || 0;
  if (c >= 500) return '5xx';
  if (c >= 400) return '4xx';
  if (c >= 300) return '3xx';
  if (c >= 200) return '2xx';
  return '1xx';
}

function observeHttp(method, path, code, ms) {
  const m = METHODS.has(method) ? method : 'OTHER';
  const key = m + '|' + routeOf(path) + '|' + statusClass(code);
  let e = state.http.get(key);
  if (!e) {
    e = { sum: 0, count: 0, buckets: HIST_BUCKETS.map(() => 0) };
    state.http.set(key, e);
  }
  e.sum += ms; e.count++;
  const s = ms / 1000;
  for (let i = 0; i < HIST_BUCKETS.length; i++) if (s <= HIST_BUCKETS[i]) e.buckets[i]++;
}

/* attach(server): one 'request' listener that times responses.
   createServer's own listener is registered first, and 'finish' fires on
   the next tick at the earliest — the tap cannot miss the response. */
function attach(server) {
  if (!server || typeof server.on !== 'function') return;
  server.on('request', (req, res) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const u = req.url || '/';
      if (String(u).split('?')[0] === '/metrics') return; /* self-scrape: no feedback loop */
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      try { observeHttp(req.method, u, res.statusCode, ms); } catch (e) {}
    });
  });
}

/* event-loop lag: one shared interval histogram */
try {
  state.eld = monitorEventLoopDelay({ resolution: 20 });
  state.eld.enable();
} catch (e) { state.eld = null; }
/* GC counter via PerformanceObserver (best-effort; never fatal) */
try {
  const { PerformanceObserver } = require('perf_hooks');
  new PerformanceObserver((list) => { state.gcCount += list.getEntries().length; }).observe({ entryTypes: ['gc'] });
} catch (e) {}

function lagPercentiles() {
  if (!state.eld) return { p50: 0, p95: 0, p99: 0 };
  const h = state.eld;
  return {
    p50: h.percentile(50) / 1e6,
    p95: h.percentile(95) / 1e6,
    p99: h.percentile(99) / 1e6
  };
}

/* ── scrape-time pulls — each independently guarded ── */
async function safe(fn, fallback) { try { return await fn(); } catch (e) { return fallback; } }

async function redisBlock() {
  const out = { up: 0, pingMs: 0 };
  const redis = await safe(() => require('./redis'), null);
  if (redis && typeof redis.isRedis === 'function' && redis.isRedis()) {
    out.up = 1;
    if (typeof redis.ping === 'function') {
      const t0 = process.hrtime.bigint();
      const ok = await safe(() => redis.ping(), false);
      out.pingMs = Number(process.hrtime.bigint() - t0) / 1e6;
      if (!ok) out.up = 0;
    }
  }
  return out;
}

async function dbBlock() {
  const out = { up: 0, latencyMs: 0, pools: [] };
  const db = await safe(() => require('./db'), null);
  if (!db) return out;
  if (typeof db.isPostgres === 'function' && db.isPostgres()) {
    out.up = 1; out.driver = 'postgres';
    const h = await safe(() => db.healthCheck(), null);
    if (h) out.latencyMs = Number(h.latency_ms) || 0;
    const s = await safe(() => db.poolStats(), null);
    if (s) {
      if (s.primary) out.pools.push({ name: 'primary', total: s.primary.total_count, idle: s.primary.idle_count, waiting: s.primary.waiting_count });
      if (s.read_replica && s.read_replica.active) out.pools.push({ name: 'read_replica', total: s.read_replica.total_count, idle: s.read_replica.idle_count, waiting: s.read_replica.waiting_count });
    }
    /* sync/outbox queue depth: pending rows in server_outbox (PG mode).
       memory mode = single process, flush inline → 0. */
    if (typeof db.query === 'function') {
      const r = await safe(() => db.query("SELECT count(*)::int AS n FROM server_outbox WHERE status = 'pending'"), null);
      out.queueDepth = r && r.rows && r.rows[0] ? Number(r.rows[0].n) : 0;
    }
  } else { out.up = 1; out.driver = 'memory'; out.queueDepth = 0; }
  return out;
}

function cacheBlock() {
  const out = { hits: 0, misses: 0, size: 0, max: 0 };
  try {
    const cache = require('./cache');
    if (typeof cache.l1Stats === 'function') { const s = cache.l1Stats(); out.hits = s.hits | 0; out.misses = s.misses | 0; out.size = s.size | 0; out.max = s.max | 0; }
  } catch (e) {}
  return out;
}

function escapeLabel(v) { return String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"'); }

/* ── exposition ── */
async function renderText() {
  const L = [];
  const push = (s) => L.push(s);
  push('# HELP payesh_build_info Build info label (constant 1).');
  push('# TYPE payesh_build_info gauge');
  push('payesh_build_info{version="' + escapeLabel(require('../package.json').version || '0') + '"} 1');

  push('# HELP payesh_http_requests_total HTTP requests total.');
  push('# TYPE payesh_http_requests_total counter');
  for (const [k, e] of state.http) {
    const [method, route, cls] = k.split('|');
    push('payesh_http_requests_total{method="' + method + '",route="' + escapeLabel(route) + '",status="' + cls + '"} ' + e.count);
  }
  push('# HELP payesh_http_request_duration_seconds HTTP latency histogram.');
  push('# TYPE payesh_http_request_duration_seconds histogram');
  for (const [k, e] of state.http) {
    const [method, route] = k.split('|');
    const lb = ',method="' + method + '",route="' + escapeLabel(route) + '"';
    let cum = 0;
    for (let i = 0; i < HIST_BUCKETS.length; i++) { cum = e.buckets[i]; push('payesh_http_request_duration_seconds_bucket{le="' + HIST_BUCKETS[i] + '"' + lb + '} ' + cum); }
    push('payesh_http_request_duration_seconds_bucket{le="+Inf"' + lb + '} ' + e.count);
    push('payesh_http_request_duration_seconds_sum' + lb + ' ' + e.sum / 1000);
    push('payesh_http_request_duration_seconds_count' + lb + ' ' + e.count);
  }

  const redis = await redisBlock();
  push('# HELP payesh_redis_up Redis reachability (1 live).');
  push('# TYPE payesh_redis_up gauge');
  push('payesh_redis_up ' + redis.up);
  push('# TYPE payesh_redis_ping_latency_ms gauge');
  push('payesh_redis_ping_latency_ms ' + Number(redis.pingMs || 0).toFixed(3));

  const db = await dbBlock();
  push('# TYPE payesh_db_up gauge');
  push('payesh_db_up{driver="' + (db.driver || 'unknown') + '"} ' + db.up);
  push('# TYPE payesh_db_query_latency_ms gauge');
  push('payesh_db_query_latency_ms ' + (Number(db.latencyMs) || 0));
  push('# TYPE payesh_db_pool_total gauge');
  push('# TYPE payesh_db_pool_idle gauge');
  push('# TYPE payesh_db_pool_waiting gauge');
  (db.pools || []).forEach((p) => {
    push('payesh_db_pool_total{pool="' + p.name + '"} ' + (p.total | 0));
    push('payesh_db_pool_idle{pool="' + p.name + '"} ' + (p.idle | 0));
    push('payesh_db_pool_waiting{pool="' + p.name + '"} ' + (p.waiting | 0));
  });
  push('# TYPE payesh_sync_queue_depth gauge');
  push('payesh_sync_queue_depth ' + (Number(db.queueDepth) || 0));

  const c = cacheBlock();
  push('# TYPE payesh_cache_hits_total counter');
  push('payesh_cache_hits_total ' + c.hits);
  push('# TYPE payesh_cache_misses_total counter');
  push('payesh_cache_misses_total ' + c.misses);
  push('# TYPE payesh_cache_l1_size gauge');
  push('payesh_cache_l1_size ' + c.size);
  push('payesh_cache_l1_max ' + c.max);

  const lag = lagPercentiles();
  push('# TYPE payesh_eventloop_lag_ms gauge');
  push('payesh_eventloop_lag_ms{q="p50"} ' + lag.p50.toFixed(2));
  push('payesh_eventloop_lag_ms{q="p95"} ' + lag.p95.toFixed(2));
  push('payesh_eventloop_lag_ms{q="p99"} ' + lag.p99.toFixed(2));

  const h = v8.getHeapStatistics();
  push('# TYPE payesh_process_heap_bytes gauge');
  push('payesh_process_heap_bytes{kind="used"} ' + h.used_heap_size);
  push('payesh_process_heap_bytes{kind="total"} ' + h.total_heap_size);
  push('payesh_process_heap_bytes{kind="limit"} ' + h.heap_size_limit);
  push('# TYPE payesh_process_rss_bytes gauge');
  push('payesh_process_rss_bytes ' + process.memoryUsage().rss);
  push('# TYPE payesh_process_uptime_seconds gauge');
  push('payesh_process_uptime_seconds ' + ((Date.now() - state.started) / 1000).toFixed(0));
  push('# TYPE payesh_process_gc_total counter');
  push('payesh_process_gc_total ' + state.gcCount);
  push('');
  return L.join('\n');
}

module.exports = { observeHttp, attach, renderText, routeOf, statusClass, HIST_BUCKETS };
