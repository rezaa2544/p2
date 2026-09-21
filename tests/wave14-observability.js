/* ─────────────────────────────────────────────────────────────
   wave14-observability.js — Wave 14: Observability (metrics signal)
   ─────────────────────────────────────────────────────────────
   Verifies server/metrics.js and its wiring, and the two drift guards
   that keep the docs/infra honest against the code.

   M1  registry basics — counter/gauge/histogram + exposition format
   M2  route templating (R3) — closed allowlist, no raw paths
   M3  no PII in labels — a national id in a URL never reaches /metrics
   M4  R1 — recorders never throw, they count
   M5  R2 — cardinality cap drops and counts (bounded memory)
   M6  exposition always carries the self-monitoring counter
   M7  R5 — unknown label / bad name / bad value are dropped, not thrown
   M8  R4 — scrapeGate matrix (production, token, disabled, loopback)
   M9  histogram maths — cumulative buckets, _count/_sum, p50/p95/p99
   M10 runtime collector populates gauges and leaves no live timers
   M11 outbox.depth() — closed label set, correct counts
   M12 db.js instrumentation really records (fake pool injected)
   M13 cache.js instrumentation really records (memory redis fallback)
   M14 worker.js instrumentation really records
   T7  drift guard — every /api/ route in server/index.js is templated
   T8  drift guard — every metric named in infra/observability exists
   T9  docs — WAVE14_OBSERVABILITY.md exists and carries the catalogue
   ───────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const metrics = require('../server/metrics.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\n▸ Wave 14 — Observability (metrics registry, policy, wiring, drift guards)');

  /* ═══ M1 — registry basics + exposition format ═══ */
  {
    const r = metrics.createRegistry();
    r.counter('t_requests_total', 'Requests served.', ['route', 'code']);
    r.gauge('t_depth', 'Queue depth.', ['status']);
    r.histogram('t_latency_seconds', 'Latency.', ['route'], [0.1, 1]);

    r.inc('t_requests_total', { route: '/a', code: '200' });
    r.inc('t_requests_total', { route: '/a', code: '200' }, 3);
    r.set('t_depth', { status: 'pending' }, 7);
    r.add('t_depth', { status: 'pending' }, -2);
    r.observe('t_latency_seconds', { route: '/a' }, 0.05);
    r.observe('t_latency_seconds', { route: '/a' }, 0.5);

    const txt = r.render();
    chk('M1a HELP + TYPE emitted for counters', /# HELP t_requests_total Requests served\./.test(txt) && /# TYPE t_requests_total counter/.test(txt));
    chk('M1b counter accumulates inc(v) increments', /t_requests_total\{route="\/a",code="200"\} 4/.test(txt), txt.split('\n').find(l => l.indexOf('t_requests_total{') === 0));
    chk('M1c gauge set + add(-) compose', /t_depth\{status="pending"\} 5/.test(txt));
    chk('M1d histogram buckets are cumulative', /t_latency_seconds_bucket\{route="\/a",le="0\.1"\} 1/.test(txt) && /t_latency_seconds_bucket\{route="\/a",le="1"\} 2/.test(txt));
    chk('M1e histogram emits +Inf, _sum and _count', /t_latency_seconds_bucket\{route="\/a",le="\+Inf"\} 2/.test(txt)
      && /t_latency_seconds_sum\{route="\/a"\} 0\.55/.test(txt)
      && /t_latency_seconds_count\{route="\/a"\} 2/.test(txt));
    chk('M1f label values are escaped', (() => {
      r.counter('t_esc', '', ['v']);
      r.inc('t_esc', { v: 'a"b\\c\nd' });
      return /t_esc\{v="a\\"b\\\\c\\nd"\} 1/.test(r.render());
    })());
    chk('M1g exposition ends with a newline (Prometheus text format)', r.render().endsWith('\n'));
  }

  /* ═══ M2 — route templating (R3) ═══ */
  {
    const rt = metrics.routeTemplate;
    chk('M2a known literal route is kept verbatim', rt('/api/health') === '/api/health');
    chk('M2b param routes collapse to a template', rt('/api/v1/students/42') === '/api/v1/students/:id'
      && rt('/api/students/7') === '/api/students/:id'
      && rt('/api/v1/grades/1000') === '/api/v1/grades/:id');
    chk('M2c unknown /api/* collapses to api_unmatched', rt('/api/nope') === 'api_unmatched' && rt('/api/v1/secret/1') === 'api_unmatched');
    chk('M2d non-allowlisted non-api path collapses to static_other', rt('/../../etc/passwd') === 'static_other' && rt('/admin') === 'static_other');
    chk('M2e allowlisted static pages map to "static"', rt('/index.html') === 'static' && rt('/privacy') === 'static');
    chk('M2f /metrics itself is templated (scrapes are counted too)', rt('/metrics') === '/metrics');
    chk('M2g a 4 KB garbage path cannot become a label', rt('/api/' + 'x'.repeat(4096)) === 'api_unmatched');
    chk('M2h non-string input is safe', rt(null) === 'static_other' && rt(undefined) === 'static_other' && rt(42) === 'static_other');
  }

  /* ═══ M3 — no PII in labels ═══ */
  {
    metrics.reset();
    /* A national id and a phone number embedded in a path — the exact shape
       of an IDOR probe. Neither may reach the exposition. */
    metrics.observeHttpRequest({ route: '/api/students/0012345678', method: 'GET', status: 404, durationSeconds: 0.01 });
    metrics.observeHttpRequest({ route: '/api/auth/login?phone=09121234567', method: 'POST', status: 401, durationSeconds: 0.01 });
    const txt = metrics.render();
    chk('M3a record id never appears in the exposition', txt.indexOf('0012345678') < 0);
    chk('M3b phone number never appears in the exposition', txt.indexOf('09121234567') < 0);
    chk('M3c the id probe is counted as a templated route', /route="\/api\/students\/:id"/.test(txt));
    /* SQL text must never be a label either */
    metrics.observeDb('query', 'primary', 0.001, false, false);
    chk('M3d db labels are op/target only, never SQL text', (() => {
      const snap = metrics.snapshot()['payesh_db_query_duration_seconds'];
      const keys = Object.keys(snap.series[0].labels).sort().join(',');
      return keys === 'op,target';
    })());
    metrics.reset();
  }

  /* ═══ M4 — R1: recorders never throw ═══ */
  {
    const r = metrics.createRegistry();
    r.counter('t_ok', '', ['a']);
    let threw = false;
    try {
      r.inc(undefined, null, 1);
      r.inc('t_missing', { a: '1' }, 1);
      r.inc('t_ok', { a: '1' }, 'not-a-number');
      r.inc('t_ok', { a: '1' }, -5);
      r.inc('t_ok', null, NaN);
      r.observe('t_ok', null, -1);
      r.observe('t_ok', null, NaN);
      r.set('t_ok', null, Infinity);
      r.value('t_nope', null);
      r.quantile('t_nope', null, 0.5);
      r.observe('t_ok', { a: '1' }, 1);   /* wrong type */
      r.inc('t_ok', { a: '1' }, 1);        /* right one, must still work */
    } catch (e) { threw = true; }
    chk('M4a no recorder throws on garbage input', threw === false);
    chk('M4b valid observations still land after garbage', r.value('t_ok', { a: '1' }) === 1);
    chk('M4c garbage is counted, not silently swallowed', Object.keys(r.stats().dropped).length > 0, JSON.stringify(r.stats().dropped));
  }

  /* ═══ M5 — R2: cardinality cap (the availability attack) ═══ */
  {
    const r = metrics.createRegistry({ maxSeries: 8 });
    r.counter('t_unbounded', '', ['id']);
    for (let i = 0; i < 50; i++) r.inc('t_unbounded', { id: 'id-' + i });
    const snap = r.snapshot()['t_unbounded'];
    chk('M5a series count is capped at maxSeries', snap.series.length === 8, 'got ' + snap.series.length);
    chk('M5b overflow is counted for alerting', r.stats().dropped_series_total === 42, 'got ' + r.stats().dropped_series_total);
    chk('M5c cap is configurable and clamped', metrics.createRegistry({ maxSeries: 1 }).maxSeries === 8
      && metrics.createRegistry({ maxSeries: 1e9 }).maxSeries === 100000
      && metrics.createRegistry({ maxSeries: 'junk' }).maxSeries === 1024);
    /* The real registry must carry the same guard */
    chk('M5d the process registry has a bounded cap too', metrics.registry.maxSeries >= 8 && metrics.registry.maxSeries <= 100000);
  }

  /* ═══ M6 — self-monitoring counter always present ═══ */
  {
    const empty = metrics.createRegistry();
    chk('M6a an empty registry still exposes the drop counter', /payesh_metrics_dropped_series_total 0/.test(empty.render()));
    metrics.reset();
    chk('M6b after reset the drop counter is back to 0', /payesh_metrics_dropped_series_total 0/.test(metrics.render()));
  }

  /* ═══ M7 — R5: declared labels only ═══ */
  {
    const r = metrics.createRegistry();
    r.counter('t_declared', '', ['a', 'b']);
    r.inc('t_declared', { a: '1', b: '2', evil: '3' });
    chk('M7a unknown label key drops the whole observation', r.snapshot()['t_declared'].series.length === 0);
    chk('M7b the drop is attributed (name|unknown_label)', r.stats().dropped['t_declared|unknown_label'] === 1, JSON.stringify(r.stats().dropped));
    r.inc('t_declared', { a: '1', b: '2' });
    chk('M7c a well-formed observation after a drop still lands', r.value('t_declared', { a: '1', b: '2' }) === 1);
    /* bad metric / label names */
    const before = Object.keys(r.snapshot()).length;
    r.counter('t_bad name', '', ['a']);
    r.counter('t_bad_label', '', ['__secret', 'ok']);
    chk('M7d an invalid metric name is not registered', Object.keys(r.snapshot()).filter(k => k.indexOf('t_bad name') === 0).length === 0);
    chk('M7e reserved (__) label names are stripped, valid ones kept', (() => {
      r.inc('t_bad_label', { ok: 'x' });
      const s = r.snapshot()['t_bad_label'];
      return s && s.series.length === 1 && Object.keys(s.series[0].labels).join(',') === 'ok';
    })());
    chk('M7f the registry survived the bad declarations', Object.keys(r.snapshot()).length >= before);
  }

  /* ═══ M8 — R4: fail-closed scrape gate ═══ */
  {
    const saved = Object.assign({}, process.env);
    const reqLoop = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const reqRemote = { headers: {}, socket: { remoteAddress: '203.0.113.9' } };
    const bearer = (t) => ({ headers: { authorization: 'Bearer ' + t }, socket: { remoteAddress: '203.0.113.9' } });
    /* A gate that throws is a failure, not a crash: in production the router's
       try/catch would turn it into a 500 + an audit error, which both leaks
       "the endpoint exists" and pages someone for a bad token. Report it. */
    const gate = (req) => {
      try { return { res: metrics.scrapeGate(req), threw: false }; }
      catch (e) { return { res: null, threw: true, err: e.code || e.message }; }
    };
    try {
      delete process.env.PAYESH_METRICS;
      delete process.env.PAYESH_METRICS_TOKEN;

      process.env.PAYESH_ENV = 'production';
      const a = gate(reqLoop);
      chk('M8a production without a token → 404 even from loopback',
        a.threw === false && a.res.ok === false && a.res.status === 404, JSON.stringify(a));

      process.env.PAYESH_METRICS_TOKEN = 'correct horse battery staple';
      const b = gate(bearer('correct horse battery staple'));
      chk('M8b production with the right bearer token → allowed', b.threw === false && b.res.ok === true, JSON.stringify(b));
      const c = gate(bearer('wrong'));
      chk('M8c production with a wrong token → 403', c.threw === false && c.res.ok === false && c.res.status === 403, JSON.stringify(c));
      const d = gate(reqRemote);
      chk('M8d production with no Authorization header → 403', d.threw === false && d.res.ok === false && d.res.status === 403, JSON.stringify(d));
      const e = gate({ headers: { authorization: 'Basic YWJj' }, socket: {} });
      chk('M8e a non-Bearer scheme is not accepted', e.threw === false && e.res.ok === false, JSON.stringify(e));
      const gLen = gate(bearer('x'));
      chk('M8f a wrong-length token yields 403 and never throws',
        gLen.threw === false && gLen.res && gLen.res.ok === false && gLen.res.status === 403,
        JSON.stringify(gLen));
      const gEmpty = gate(bearer(''));
      chk('M8g an empty bearer value is rejected, not treated as "no token"',
        gEmpty.threw === false && gEmpty.res.ok === false, JSON.stringify(gEmpty));

      delete process.env.PAYESH_ENV;
      delete process.env.PAYESH_METRICS_TOKEN;   /* the no-token dev path is what is under test */
      chk('M8h development from loopback without a token → allowed', gate(reqLoop).res.ok === true);
      const h = gate(reqRemote);
      chk('M8i development from a remote address without a token → 403',
        h.threw === false && h.res.ok === false && h.res.status === 403, JSON.stringify(h));
      chk('M8j IPv6 loopback is accepted in development',
        gate({ headers: {}, socket: { remoteAddress: '::1' } }).res.ok === true);
      chk('M8k IPv4-mapped loopback is accepted in development',
        gate({ headers: {}, socket: { remoteAddress: '::ffff:127.0.0.1' } }).res.ok === true);

      process.env.PAYESH_METRICS = '0';
      chk('M8l PAYESH_METRICS=0 disables the endpoint outright', gate(reqLoop).res.status === 404);
      process.env.PAYESH_METRICS_TOKEN = 't';
      chk('M8m PAYESH_METRICS=0 wins over a valid token', gate(bearer('t')).res.status === 404);
    } finally {
      for (const k of Object.keys(process.env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }

  /* ═══ M9 — histogram maths ═══ */
  {
    const r = metrics.createRegistry();
    r.histogram('t_h', '', [], [0.1, 0.2, 0.3, 0.4, 0.5]);
    const vals = [0.05, 0.15, 0.15, 0.25, 0.25, 0.25, 0.35, 0.45, 0.45, 0.99];
    for (const v of vals) r.observe('t_h', null, v);
    const s = r.histSummary('t_h', null);
    /* 0.05+0.15+0.15+0.25+0.25+0.25+0.35+0.45+0.45+0.99 = 3.34 */
    chk('M9a count and sum are exact', s.count === 10 && Math.abs(s.sum - 3.34) < 1e-9, JSON.stringify(s));
    chk('M9b percentiles are monotonic (p50 ≤ p95 ≤ p99)', s.p50 <= s.p95 && s.p95 <= s.p99, JSON.stringify(s));
    chk('M9c p50 lands in the bucket that really holds the median', s.p50 > 0.2 && s.p50 <= 0.3, 'p50=' + s.p50);
    chk('M9d p99 is clamped to the last bucket bound', s.p99 === 0.5, 'p99=' + s.p99);
    chk('M9e an empty series reports nulls, not NaN', (() => {
      r.histogram('t_empty', '', [], [1]);
      const e = r.histSummary('t_empty', null);
      return e.count === 0 && e.p50 === null;
    })());
    chk('M9f out-of-range values are rejected, not clamped silently', (() => {
      r.observe('t_h', null, -1);
      return r.histSummary('t_h', null).count === 10;
    })());
  }

  /* ═══ M10 — runtime collector ═══ */
  {
    metrics.reset();
    const t = metrics.startRuntimeCollector(250);
    chk('M10a the collector reports its (clamped) interval', t.intervalMs >= 250);
    const snap1 = metrics.snapshot();
    chk('M10b heap / rss / uptime gauges are populated immediately',
      snap1.payesh_node_heap_used_bytes.series[0].value > 0
      && snap1.payesh_node_rss_bytes.series[0].value > 0
      && snap1.payesh_node_uptime_seconds.series[0].value >= 0);
    await new Promise((r) => setTimeout(r, 320));
    const lag = metrics.value('payesh_node_eventloop_lag_seconds', null);
    chk('M10c event-loop lag is sampled and never negative', typeof lag === 'number' && lag >= 0, 'lag=' + lag);
    const cpuU = metrics.value('payesh_node_cpu_seconds_total', { mode: 'user' });
    const cpuS = metrics.value('payesh_node_cpu_seconds_total', { mode: 'system' });
    /* typeof check matters: `null >= 0` is true in JS, so a dropped series
       would otherwise pass. This assertion is what caught the metric being
       declared a counter (set() silently drops non-gauges). */
    chk('M10d cpu seconds are really recorded per mode',
      typeof cpuU === 'number' && cpuU > 0 && typeof cpuS === 'number' && cpuS >= 0,
      'user=' + cpuU + ' system=' + cpuS);
    chk('M10e cpu metric is declared a gauge (we set, never inc)', metrics.snapshot().payesh_node_cpu_seconds_total.type === 'gauge');
    const again = metrics.startRuntimeCollector(250);
    chk('M10f start is idempotent — a second call returns the same collector', again === t);
    metrics.stopRuntimeCollector();
    chk('M10g stop is idempotent too', (metrics.stopRuntimeCollector(), true));
  }

  /* ═══ M11 — outbox depth (queue growth) ═══ */
  {
    const { createOutbox } = require('../server/outbox.js');
    const store = { outbox: [] };
    const ob = createOutbox({ store, db: null });
    store.outbox.push({ id: 1, status: 'pending' }, { id: 2, status: 'pending' },
      { id: 3, status: 'processed' }, { id: 4, status: 'failed' }, { id: 5 });
    const d = ob.depth();
    chk('M11a depth counts every lifecycle state', d.total === 5 && d.pending === 2 && d.processed === 1 && d.failed === 1 && d.legacy === 1, JSON.stringify(d));
    metrics.reset();
    metrics.publishOutboxDepth(d);
    const snap = metrics.snapshot().payesh_outbox_depth;
    chk('M11b publishOutboxDepth uses the closed label set only',
      snap.series.map((s) => s.labels.status).sort().join(',') === 'failed,legacy,pending,processed,total',
      JSON.stringify(snap.series.map((s) => s.labels.status)));
    metrics.publishOutboxDepth({ bogus: 9, pending: 1 });
    chk('M11c an unexpected key cannot create a new label value',
      metrics.snapshot().payesh_outbox_depth.series.every((s) => s.labels.status !== 'bogus'));
    chk('M11d garbage input is ignored, not thrown', (metrics.publishOutboxDepth(null), metrics.publishOutboxDepth('x'), true));
    metrics.reset();
  }

  /* ═══ M12 — db.js instrumentation really records (fake pool) ═══ */
  {
    const db = require('../server/db.js');
    metrics.reset();
    const calls = [];
    let failNext = false;
    const fakePool = {
      totalCount: 3, idleCount: 1, waitingCount: 2,
      query: async (t) => { calls.push(String(t)); if (failNext) throw new Error('boom'); return { rows: [{ n: 1 }], rowCount: 1 }; },
      connect: async () => ({
        query: async (t) => { calls.push(String(t)); if (failNext) throw new Error('boom'); return { rows: [], rowCount: 0 }; },
        release: () => {}
      }),
      end: async () => {}
    };
    db.__setPoolForTests(fakePool);
    db.__setReadPoolForTests(null);

    await db.query('SELECT 1');
    const h = metrics.histSummary('payesh_db_query_duration_seconds', { op: 'query', target: 'primary' });
    chk('M12a db.query records a latency sample on primary', h && h.count === 1, JSON.stringify(h));
    chk('M12b a successful query records no error', metrics.value('payesh_db_query_errors_total', { op: 'query', target: 'primary' }) === null);

    failNext = true;
    let threw = false;
    try { await db.query('SELECT 2'); } catch (e) { threw = true; }
    chk('M12c a failing query still records latency AND the error', threw
      && metrics.value('payesh_db_query_errors_total', { op: 'query', target: 'primary' }) === 1
      && metrics.histSummary('payesh_db_query_duration_seconds', { op: 'query', target: 'primary' }).count === 2);

    failNext = false;
    await db.transaction(async () => 'ok');
    chk('M12d transactions are recorded under op=transaction',
      metrics.histSummary('payesh_db_query_duration_seconds', { op: 'transaction', target: 'primary' }).count === 1);

    /* replica path */
    db.__setReadPoolForTests({ query: async () => ({ rows: [{ id: 1 }], rowCount: 1 }), end: async () => {} });
    await db.queryRead('SELECT 3');
    chk('M12e replica reads are labelled target=replica',
      metrics.histSummary('payesh_db_query_duration_seconds', { op: 'query_read', target: 'replica' }).count === 1);

    /* slow-query counter — the threshold is env-driven and read at module
       load, so re-require db.js with a 1 ms threshold and a fake pool that
       deterministically burns 8 ms (a 0 threshold would fall back to the
       250 ms default: Number('0') > 0 is false). */
    const slowPool = {
      totalCount: 1, idleCount: 0, waitingCount: 0,
      query: async () => { const end = Date.now() + 8; while (Date.now() < end) { /* burn */ } return { rows: [], rowCount: 0 }; },
      end: async () => {}
    };
    process.env.PAYESH_DB_SLOW_MS = '1';
    delete require.cache[require.resolve('../server/db.js')];
    const db2 = require('../server/db.js');
    metrics.reset();
    db2.__setPoolForTests(slowPool);
    await db2.query('SELECT 4');
    chk('M12f the slow-query counter fires above PAYESH_DB_SLOW_MS',
      metrics.value('payesh_db_slow_queries_total', { op: 'query', target: 'primary' }) === 1,
      JSON.stringify(metrics.stats()));
    db2.__setPoolForTests(fakePool);
    metrics.reset();
    await db2.query('SELECT 5');
    chk('M12g a fast query is NOT counted as slow',
      metrics.value('payesh_db_slow_queries_total', { op: 'query', target: 'primary' }) === null);
    delete process.env.PAYESH_DB_SLOW_MS;
    db2.__setPoolForTests(null);
    db.__setPoolForTests(null);
    db.__setReadPoolForTests(null);
    metrics.reset();
  }

  /* ═══ M13 — cache.js instrumentation really records ═══ */
  {
    const cache = require('../server/cache.js');
    metrics.reset();
    const r1 = await cache.checkRateLimit('1.2.3.4', 'send_code', 2, 60);
    const r2 = await cache.checkRateLimit('1.2.3.4', 'send_code', 2, 60);
    const r3 = await cache.checkRateLimit('1.2.3.4', 'send_code', 2, 60);
    chk('M13a the limiter behaves as before (2 allowed, 3rd denied)',
      r1.allowed === true && r2.allowed === true && r3.allowed === false, JSON.stringify([r1.allowed, r2.allowed, r3.allowed]));
    chk('M13b allowed decisions are counted by action',
      metrics.value('payesh_rate_limit_decisions_total', { action: 'send_code', decision: 'allowed' }) === 2);
    chk('M13c denied decisions are counted by action',
      metrics.value('payesh_rate_limit_decisions_total', { action: 'send_code', decision: 'denied' }) === 1);
    chk('M13d the identifier is NOT a label', (() => {
      const s = metrics.snapshot().payesh_rate_limit_decisions_total.series;
      return s.every((x) => Object.keys(x.labels).join(',') === 'action,decision')
        && metrics.render().indexOf('1.2.3.4') < 0;
    })());

    const miss = await cache.getBootstrapCache(999001);
    chk('M13e a cold bootstrap read counts a miss', miss === null
      && metrics.value('payesh_cache_lookups_total', { layer: 'l2_redis', outcome: 'miss' }) === 1);
    await cache.setBootstrapCache(999001, { school: { id: 1 } }, 60);
    const hit = await cache.getBootstrapCache(999001);
    chk('M13f a warm bootstrap read counts an L1 hit', !!hit
      && metrics.value('payesh_cache_lookups_total', { layer: 'l1_memory', outcome: 'hit' }) === 1);
    await cache.invalidateCollection('students', 1);
    await cache.invalidateCollection('students');
    chk('M13g invalidations are counted with a closed scope label',
      metrics.value('payesh_cache_invalidations_total', { scope: 'school' }) === 1
      && metrics.value('payesh_cache_invalidations_total', { scope: 'global' }) === 1);
    metrics.reset();
  }

  /* ═══ M14 — worker.js instrumentation really records ═══ */
  {
    const { createWorker } = require('../server/worker.js');
    const { createOutbox } = require('../server/outbox.js');
    metrics.reset();
    const store = { outbox: [] };
    const ob = createOutbox({ store, db: null });
    let boom = false;
    const w = createWorker({
      store, outbox: ob,
      handlers: { 'x.run': async () => { if (boom) throw new Error('nope'); } },
      maxRetries: 2
    });
    await ob.append({ type: 'x.run', collection: 'students', record_id: 1 });
    await w.tick();
    chk('M14a a processed event is counted', metrics.value('payesh_worker_events_total', { outcome: 'processed' }) === 1);

    boom = true;
    await ob.append({ type: 'x.run', collection: 'students', record_id: 2 });
    await w.tick();   /* retry 1 → still pending */
    chk('M14b a retried event is counted as retry, not failed',
      metrics.value('payesh_worker_events_total', { outcome: 'retry' }) === 1
      && metrics.value('payesh_worker_events_total', { outcome: 'failed' }) === null);
    await w.tick();   /* retry 2 > maxRetries → failed */
    chk('M14c an exhausted event is counted as failed',
      metrics.value('payesh_worker_events_total', { outcome: 'failed' }) === 1);
    chk('M14d the error message is not a label', metrics.render().indexOf('nope') < 0);
    metrics.reset();
  }

  /* ═══ T7 — drift guard: router ↔ route allowlist ═══ */
  {
    const src = read('server/index.js');
    const literals = [...new Set([...src.matchAll(/'\/api\/[^']*'/g)].map((m) => m[0].slice(1, -1)))];
    const concrete = literals.filter((p) => p.length > 5 && !p.endsWith('/'));
    const missing = concrete.filter((p) => metrics.routeTemplate(p) === 'api_unmatched');
    chk('T7a every literal /api/ route in index.js is templated (' + concrete.length + ' routes)',
      missing.length === 0, 'untemplated: ' + missing.join(', '));
    chk('T7b the scan actually found routes (guard against a broken regex)', concrete.length >= 15, 'found ' + concrete.length);

    const RE = /\/\^\\\/api\\\/[^\n]*?\$\//g;
    const regexes = [...new Set([...src.matchAll(RE)].map((m) => m[0]))];
    const samples = regexes.map((r) => r.slice(1, -1)
      .replace(/^\^/, '').replace(/\$$/, '')
      .replace(/\\\//g, '/').replace(/\\d\+/g, '42'));
    const rmissing = samples.filter((p) => metrics.routeTemplate(p) === 'api_unmatched');
    chk('T7c every parametric /api/ route regex is templated (' + samples.length + ' patterns)',
      rmissing.length === 0 && samples.length >= 5, 'untemplated: ' + rmissing.join(', '));
  }

  /* ═══ T8 — drift guard: infra ↔ metric catalogue ═══ */
  {
    metrics.reset();
    /* reset() re-declares the whole catalogue, so every metric name is
       present even if its recorder has not run in this process */
    const catalogue = new Set(Object.keys(metrics.snapshot()));
    const strip = (n) => n.replace(/_(bucket|sum|count)$/, '');
    const referenced = (file) => [...new Set([...read(file).matchAll(/\bpayesh_[a-z0-9_]+/g)].map((m) => strip(m[0])))];
    for (const f of ['infra/observability/alerts.yml', 'infra/observability/payesh-dashboard.json', 'infra/observability/prometheus.yml']) {
      const refs = referenced(f);
      const unknown = refs.filter((n) => !catalogue.has(n));
      chk('T8 ' + path.basename(f) + ' references only declared metrics (' + refs.length + ')',
        unknown.length === 0, 'unknown: ' + unknown.join(', '));
    }
    chk('T8d the catalogue is non-trivial', catalogue.size >= 25, 'size=' + catalogue.size);
    chk('T8e alert rules cover the roadmap signals', (() => {
      const a = read('infra/observability/alerts.yml');
      return ['payesh_http_requests_total', 'payesh_http_request_duration_seconds',
        'payesh_db_query_errors_total', 'payesh_db_pool_waiting', 'payesh_cache_lookups_total',
        'payesh_outbox_depth', 'payesh_node_eventloop_lag_seconds', 'payesh_metrics_dropped_series_total']
        .every((m) => a.indexOf(m) >= 0);
    })());
  }

  /* ═══ T9 — docs ═══ */
  {
    const doc = 'docs/WAVE14_OBSERVABILITY.md';
    chk('T9a ' + doc + ' exists', fs.existsSync(path.join(ROOT, doc)));
    const d = read(doc);
    chk('T9b the doc names all three signals', ['Metrics', 'Logs', 'Traces'].every((s) => d.indexOf(s) >= 0));
    chk('T9c the doc states RPO-style SLO targets', /p95/.test(d) && /99\.95/.test(d));
    chk('T9d the doc documents the fail-closed scrape matrix', /PAYESH_METRICS_TOKEN/.test(d) && /404/.test(d));
    chk('T9e the doc records an honest verification gap', /Honest gap/i.test(d));
  }

  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc));
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('wave14-observability crashed:', e); process.exit(1); });
