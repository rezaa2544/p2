#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   capacity-saturation-probe.js — کاوشگرِ نقطهٔ اشباع (بسته ۲ نقشه راه)
   ───────────────────────────────────────────────────────────────────
   مالک: چت ۴ (Capacity Engineering) · طرحِ هم‌زمانِ docs/CAPACITY_WORKLOAD_MODEL.md
   خروجی: پاکتِ ظرفیت در قالب docs/CAPACITY_ENVELOPE_TEMPLATE.md

   چه می‌کند (روی staging چندنودی — بسته ۱):
     ۱. نردبانِ بارِ پله‌ای (closed-loop): هر پله = تعداد کارگرِ هم‌زمان.
     ۲. هر پله: p50/p95/p99 و throughput و نرخ خطا به‌تفکیک اندپوینت.
     ۳. اسکراپِ `/metrics` قبل/بعدِ هر پله (counters → دلتا؛ gauges → لحظه‌ای):
        pool/queue/cache/slow-queries/auth — نام‌ها از server/metrics.js.
     ۴. کشفِ زانو (knee): سه نامزدِ مستند —
        (a) slo      : اولین پلهٔ p95 > SLO (پیش‌فرض 300ms از CAPACITY_MODEL §۵)
        (b) plateau  : اولین پله‌ای که بهرهٔ حاشیه‌ای throughput نسبت به
                       بهرهٔ حاشیه‌ای concurrency < 50٪ شود
        (c) errors   : اولین پلهٔ نرخ 5xx > 1٪ (۱۰× بودجهٔ خطا)
        زانو = قدیمی‌ترینِ نامزدهای آشکار؛ خروجی شامل همهٔ نامزدهاست (شفافیت).
     ۵. پاکتِ JSON (پرچمِ NOT-COLLECTED برای جمع‌آورِ غایب — هرگز جعل نمی‌شود).

   چه «نمی‌کند» (صادقانه):
     • اجرا در این سندباکس — طراحی/آماده‌سازی است؛ اجرا NOT-RUN تا staging.
     • بازپخشِ الگوی زمانیِ کامل — هر اجرا یک «حالتِ پایدار» را می‌سنجد
       (mixed-national | read-browse | write-burst — مدل بار §۳–۴).

   اجرا:
     node tools/capacity-saturation-probe.js --validate          ← آفلاین؛ بدون شبکه
     node tools/capacity-saturation-probe.js \
        --target https://staging.example.internal --confirm-staging \
        --profile mixed-national --staircase 50,100,200,400,800,1600 \
        --step-seconds 120 --out capacity-envelope.json
   زوایای ایمنی: بدون --confirm-staging اجرا نمی‌شود (محافظ production) ·
   توقفِ اضطراری اگر نرخ 5xx از --abort-error-rate (پیش‌فرض 5٪) گذرد.
   احراز: --token یا PAYESH_PROBE_TOKEN (bearer) · اسکراپ: PAYESH_METRICS_TOKEN.
   بارِ مفیدِ POST: پیش‌فرض = حداقلی؛ واقعی‌اش را با --payloads <file> بدهید
   (یک JSON از مسیر→بدنه؛ بدون آن، پاسخِ اعتبارسنجیِ 4xx هم سیگنالِ مسیر است
   ولی «نوشتنِ واقعی» را نمی‌سنجد — در پاکت ثبت می‌شود).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { performance } = require('perf_hooks');

/* ── پروفایل‌های بار (از docs/CAPACITY_WORKLOAD_MODEL.md §۳ — A1) ── */
const PROFILES = {
  'mixed-national': [ /* اوج صبحگاهی: ~79٪ خواندن / 12.5٪ نوشتن / 8.5٪ احراز */
    { w: 47.5, method: 'GET',  path: '/api/v1/pull',      kind: 'read' },
    { w: 12.5, method: 'GET',  path: '/api/v1/bootstrap', kind: 'read' },
    { w: 11.5, method: 'GET',  path: '/api/v1/reports/attendance', kind: 'read' },
    { w: 7.5,  method: 'GET',  path: '/api/health-index', kind: 'read' },
    { w: 9,    method: 'POST', path: '/api/sync',         kind: 'write' },
    { w: 2,    method: 'POST', path: '/api/v1/attendance', kind: 'write' },
    { w: 1,    method: 'POST', path: '/api/v1/grades',    kind: 'write' },
    { w: 0.5,  method: 'POST', path: '/api/v1/students',  kind: 'write' },
    { w: 4.25, method: 'POST', path: '/api/auth/send-code', kind: 'auth' },
    { w: 4.25, method: 'POST', path: '/api/auth/login',   kind: 'auth' },
  ],
  'read-browse': [ /* درون‌روز: خواندن‌محور */
    { w: 55, method: 'GET',  path: '/api/v1/pull',      kind: 'read' },
    { w: 20, method: 'GET',  path: '/api/v1/reports/attendance', kind: 'read' },
    { w: 15, method: 'GET',  path: '/api/v1/reports/academic', kind: 'read' },
    { w: 10, method: 'GET',  path: '/api/auth/me',      kind: 'read' },
  ],
  'write-burst': [ /* دورهٔ امتحان: فشار نوشتن */
    { w: 40, method: 'POST', path: '/api/sync',         kind: 'write' },
    { w: 35, method: 'POST', path: '/api/v1/grades',    kind: 'write' },
    { w: 15, method: 'POST', path: '/api/v1/attendance', kind: 'write' },
    { w: 10, method: 'GET',  path: '/api/v1/pull',      kind: 'read' },
  ],
};

/* متریک‌هایی که از /metrics خوانده می‌شوند (نام‌ها = server/metrics.js) */
const SCRAPE = {
  counters: ['payesh_http_requests_total', 'payesh_sync_requests_total',
    'payesh_cache_hits_total', 'payesh_cache_misses_total', 'payesh_cache_lookups_total',
    'payesh_db_query_errors_total', 'payesh_db_slow_queries_total',
    'payesh_auth_login_total', 'payesh_auth_otp_requests_total',
    'payesh_sync_backpressure_rejections_total', 'payesh_sync_conflicts_total'],
  gauges: ['payesh_sync_queue_depth', 'payesh_db_pool_total', 'payesh_db_pool_idle',
    'payesh_db_pool_waiting', 'payesh_db_up'],
};

/* ── CLI ── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const opt = {
  target: arg('--target', process.env.PAYESH_BASE_URL || ''),
  profile: arg('--profile', 'mixed-national'),
  staircase: String(arg('--staircase', '50,100,200,400,800,1600')),
  stepSeconds: Number(arg('--step-seconds', 120)) || 120,
  warmupSeconds: Number(arg('--warmup-seconds', 15)) || 15,
  sloP95ms: Number(arg('--slo-p95-ms', 300)) || 300,
  abortErrorRate: Number(arg('--abort-error-rate', 5)) || 5,
  reqTimeoutMs: Number(arg('--req-timeout-ms', 10000)) || 10000,
  metricsPath: arg('--metrics-path', '/metrics'),
  metricsToken: arg('--metrics-token', process.env.PAYESH_METRICS_TOKEN || ''),
  token: arg('--token', process.env.PAYESH_PROBE_TOKEN || ''),
  out: arg('--out', 'capacity-envelope.json'),
  payloads: arg('--payloads', ''),
  datasetScale: arg('--dataset-scale', ''),
  nodes: arg('--nodes', ''),
};

function validate() {
  const errs = [];
  if (!PROFILES[opt.profile]) errs.push('پروفایل ناشناخته: ' + opt.profile + ' (مجاز: ' + Object.keys(PROFILES).join(' | ') + ')');
  const steps = opt.staircase.split(',').map((s) => Number(s.trim()));
  if (!steps.length || steps.some((n) => !Number.isFinite(n) || n < 1 || !Number.isInteger(n))) errs.push('نردبان نامعتبر: ' + opt.staircase);
  else if (steps.some((n, i) => i && n <= steps[i - 1])) errs.push('نردبان باید اکیداً صعودی باشد');
  const wsum = PROFILES[opt.profile] ? PROFILES[opt.profile].reduce((a, e) => a + e.w, 0) : 0;
  if (PROFILES[opt.profile] && Math.abs(wsum - 100) > 0.01) errs.push('وزن پروفایل ≠ ۱۰۰: ' + wsum);
  if (opt.sloP95ms < 1) errs.push('SLO نامعتبر');
  if (!Number.isFinite(opt.stepSeconds) || opt.stepSeconds <= 0) errs.push('مدت پله نامعتبر: ' + opt.stepSeconds);
  if (!Number.isFinite(opt.warmupSeconds) || opt.warmupSeconds < 0) errs.push('مدت گرم‌کردن نامعتبر: ' + opt.warmupSeconds);
  if (!Number.isFinite(opt.abortErrorRate) || opt.abortErrorRate < 0) errs.push('آستانه توقف خطا نامعتبر: ' + opt.abortErrorRate);
  if (!Number.isFinite(opt.reqTimeoutMs) || opt.reqTimeoutMs <= 0) errs.push('timeout نامعتبر: ' + opt.reqTimeoutMs);
  console.log('── طرحِ اجرا (آفلاین؛ هیچ شبکه‌ای در کار نیست) ──');
  console.log('پروفایل: ' + opt.profile + ' (Σوزن=' + wsum + ')');
  console.log('نردبان: ' + (steps.length ? steps.join(' → ') : '—') + ' · هر پله ' + opt.stepSeconds + 's (+گرم‌کردن ' + opt.warmupSeconds + 's)');
  console.log('SLO پذیرش: p95 < ' + opt.sloP95ms + 'ms · توقف اضطراری: 5xx > ' + opt.abortErrorRate + '٪');
  console.log('نامزدهای زانو: slo | plateau (بهرهٔ حاشیه‌ای < ۵۰٪) | errors (5xx > 1٪)');
  console.log('جمع‌آورها: HTTP+‪/metrics‬ (هسته) · redis-info (اختیاری، RESP) · pg-direct (اختیاری، ماژول pg)');
  if (errs.length) { errs.forEach((e) => console.error('  ✗ ' + e)); process.exit(1); }
  console.log('  ✓ طرح معتبر — برای اجرا: --target <url> --confirm-staging');
  process.exit(0);
}

/* ── انتخابِ وزنیِ اندپوینت ── */
function pick(profile) {
  let r = Math.random() * 100;
  for (const e of profile) { if ((r -= e.w) <= 0) return e; }
  return profile[profile.length - 1];
}

/* ── اسکراپِ Prometheus text 0.0.4 ── */
function parseProm(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-z_][a-z0-9_]*)(\{[^}]*\})?\s+([^\s]+)/i);
    if (!m) continue;
    const labels = {};
    if (m[2]) m[2].slice(1, -1).replace(/([a-z_]+)="([^"]*)"/g, (_, k, v) => { labels[k] = v; return ''; });
    out[m[1] + (m[2] ? JSON.stringify(labels) : '')] = { name: m[1], labels, value: Number(m[3]) };
  }
  return out;
}

async function scrapeMetrics() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opt.reqTimeoutMs);
  try {
    const res = await fetch(opt.target.replace(/\/$/, '') + opt.metricsPath, {
      headers: Object.assign({}, opt.metricsToken ? { authorization: 'Bearer ' + opt.metricsToken } : {}),
      signal: ctl.signal,
    });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    return { series: parseProm(await res.text()) };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { clearTimeout(t); }
}

/* جمع‌آورِ اختیاریِ Redis — RESP روی سوکتِ خام (صفر وابستگی) */
async function redisInfo() {
  const url = arg('--redis-url', process.env.PAYESH_REDIS_URL || '');
  if (!url) return { status: 'NOT-COLLECTED (بدون --redis-url)' };
  const m = url.match(/^redis:\/\/([^:]+):(\d+)/); if (!m) return { status: 'NOT-COLLECTED (URL نامعتبر)' };
  const net = require('net');
  return new Promise((resolve) => {
    const s = net.connect(Number(m[2]), m[1]);
    let buf = '';
    const done = (r) => { try { s.destroy(); } catch (_) {} resolve(r); };
    const t = setTimeout(() => done({ status: 'NOT-COLLECTED (timeout)' }), 3000);
    s.on('connect', () => s.write('*1\r\n$4\r\nINFO\r\n'));
    s.on('data', (d) => {
      buf += d.toString();
      if (!buf.includes('\r\n') || !buf.endsWith('\r\n')) return;
      clearTimeout(t);
      const kv = {};
      for (const line of buf.split('\r\n')) { const i = line.indexOf(':'); if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1); }
      done({
        status: 'OK',
        used_memory_bytes: Number(kv.used_memory) || null,
        keyspace_hits: Number(kv.keyspace_hits) || 0,
        keyspace_misses: Number(kv.keyspace_misses) || 0,
        connected_clients: Number(kv.connected_clients) || null,
      });
    });
    s.on('error', (e) => { clearTimeout(t); done({ status: 'NOT-COLLECTED (' + e.message + ')' }); });
  });
}

/* جمع‌آورِ اختیاریِ مستقیمِ PG — فقط اگر --pg-dsn داده شود و ماژول pg موجود باشد.
   CPU پایگاه‌داده از SQL درنمی‌آید (لایهٔ OS) — صادقانه NOT-COLLECTED ثبت می‌شود. */
async function pgStats() {
  const dsn = arg('--pg-dsn', process.env.PAYESH_PG_DSN || '');
  if (!dsn) return { status: 'NOT-COLLECTED (بدون --pg-dsn)' };
  let Pool; try { ({ Pool } = require('pg')); } catch (_) { return { status: 'NOT-COLLECTED (ماژول pg نصب نیست)' }; }
  const pool = new Pool({ connectionString: dsn, connectionTimeoutMillis: 3000 });
  try {
    const db = (await pool.query("SELECT xact_commit, xact_rollback, blks_read, blks_hit, deadlocks, conflicts FROM pg_stat_database WHERE datname = current_database()")).rows[0];
    const act = (await pool.query("SELECT count(*) FILTER (WHERE wait_event_type = 'Lock') AS lock_waiting, count(*) AS connections FROM pg_stat_activity")).rows[0];
    const lk = (await pool.query("SELECT count(*) AS not_granted FROM pg_locks WHERE NOT granted")).rows[0];
    return {
      status: 'OK', db_cpu: 'NOT-COLLECTED (لایهٔ OS — از exporter نود)',
      xact_commit: +db.xact_commit, xact_rollback: +db.xact_rollback,
      blks_read: +db.blks_read, blks_hit: +db.blks_hit,
      block_hit_ratio_pct: +(100 * db.blks_hit / Math.max(1, db.blks_hit + db.blks_read)).toFixed(1),
      deadlocks: +db.deadlocks, conflicts: +db.conflicts,
      lock_waiting: +act.lock_waiting, connections: +act.connections, locks_not_granted: +lk.not_granted,
    };
  } catch (e) { return { status: 'NOT-COLLECTED (' + (e.message || e) + ')' }; }
  finally { await pool.end().catch(() => {}); }
}

/* استخراجِ دلتا/مقادیر از دو اسکراپِ قبل/بعدِ پله */
function extractMetrics(before, after) {
  if (before.error || after.error) return { status: 'SCRAPE-FAILED', before: before.error || 'ok', after: after.error || 'ok' };
  const sum = (series, name) => Object.values(series).filter((s) => s.name === name)
    .reduce((a, s) => a + (Number.isFinite(s.value) ? s.value : 0), 0);
  const exposed = (series, name) => Object.values(series).some((s) => s.name === name);
  const gauge = (series, name) => { const s = Object.values(series).find((x) => x.name === name); return s ? s.value : null; };
  const o = { status: 'OK' };
  for (const c of SCRAPE.counters) {
    o[c + '_delta'] = (exposed(before.series, c) && exposed(after.series, c))
      ? +(sum(after.series, c) - sum(before.series, c)).toFixed(0) : 'NOT-EXPOSED';
  }
  for (const g of SCRAPE.gauges) o[g] = exposed(after.series, g) ? gauge(after.series, g) : 'NOT-EXPOSED';
  const h = o.payesh_cache_hits_total_delta, m = o.payesh_cache_misses_total_delta;
  o.cache_hit_ratio_pct = (Number.isFinite(h) && Number.isFinite(m) && h + m > 0)
    ? +(100 * h / (h + m)).toFixed(1) : 'NOT-COMPUTABLE';
  return o;
}

/* ── یک درخواست با زمان‌سنجی ── */
async function fire(ep, payloads, headers) {
  const body = ep.method === 'POST' ? JSON.stringify(payloads[ep.path] || {}) : undefined;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opt.reqTimeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(opt.target.replace(/\/$/, '') + ep.path, {
      method: ep.method, body, signal: ctl.signal,
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
    });
    await res.arrayBuffer().catch(() => {});
    return { ok: true, ms: performance.now() - t0, status: res.status, ep };
  } catch (e) { return { ok: false, ms: performance.now() - t0, status: 0, ep, err: String(e.message || e) }; }
  finally { clearTimeout(t); }
}

function pct(sorted, p) { if (!sorted.length) return null; const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1); return +sorted[Math.max(0, i)].toFixed(1); }

/* ── کشفِ زانو ── */
function detectKnee(steps, sloMs) {
  const cands = [];
  steps.forEach((s, i) => {
    if (s.p95 != null && s.p95 > sloMs) cands.push({ method: 'slo', stepIndex: i, concurrency: s.concurrency, detail: 'p95=' + s.p95 + 'ms > SLO=' + sloMs + 'ms' });
    if (i > 0 && steps[i - 1].throughput != null && s.throughput != null) {
      const dC = s.concurrency - steps[i - 1].concurrency;
      const dT = s.throughput - steps[i - 1].throughput;
      if (dC > 0 && dT / dC < 0.5) cands.push({ method: 'plateau', stepIndex: i, concurrency: s.concurrency, detail: 'Δthroughput/Δconcurrency=' + (dT / dC).toFixed(2) + ' < 0.5' });
    }
    if (s.errorRatePct != null && s.errorRatePct > 1) cands.push({ method: 'errors', stepIndex: i, concurrency: s.concurrency, detail: '5xx=' + s.errorRatePct + '٪ > 1٪' });
  });
  const first = cands.length ? cands.reduce((a, b) => (a.stepIndex <= b.stepIndex ? a : b)) : null;
  const sustained = first ? (steps[first.stepIndex - 1] || steps[first.stepIndex]) : steps[steps.length - 1];
  return {
    knee: first || { method: 'none', stepIndex: -1, concurrency: null, detail: 'در بازهٔ نردبان اشباع دیده نشد — نردبان را گسترش بده' },
    maxSustainableRps: sustained ? sustained.goodputRps : null,
    candidates: cands,
  };
}

/* ── اجرای یک پله ── */
async function runStep(concurrency, seconds, payloads, headers) {
  const lat = []; const perEp = {};
  let done = 0, goodput = 0, err5 = 0, err0 = 0, authDenied = 0, clientErrors = 0;

  const deadline = performance.now() + seconds * 1000;
  async function worker() {
    while (performance.now() < deadline) {
      const ep = pick(PROFILES[opt.profile]);
      const r = await fire(ep, payloads, headers);
      done++;
      lat.push(r.ms);
      const k = ep.method + ' ' + ep.path;
      perEp[k] = perEp[k] || { n: 0, p95sorted: [], errors: 0 };
      perEp[k].n++;
      perEp[k].p95sorted.push(r.ms);
      if (r.status >= 200 && r.status < 300) goodput++;
      else if (r.status === 401 || r.status === 403) authDenied++;
      else if (r.status >= 500 || r.status === 0) { if (r.status >= 500) err5++; if (r.status === 0) err0++; perEp[k].errors++; }
      else if (r.status >= 400) { clientErrors++; perEp[k].errors++; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const sorted = [...lat].sort((a, b) => a - b);
  const secs = seconds;
  const byEp = {};
  for (const [k, v] of Object.entries(perEp)) {
    const s = v.p95sorted.sort((a, b) => a - b);
    byEp[k] = { count: v.n, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), errors: v.errors };
  }
  const failureCount = err5 + err0 + clientErrors;
  return {
    concurrency, seconds,
    requests: done,
    goodputRequests: goodput,
    throughput: +(done / secs).toFixed(1),
    goodputRps: +(goodput / secs).toFixed(1),
    p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99),
    errorRatePct: done ? +(100 * ((err5 + err0) / done)).toFixed(3) : null,
    failureRatePct: done ? +(100 * (failureCount / done)).toFixed(3) : null,
    serverErrorRatePct: done ? +(100 * (err5 / done)).toFixed(3) : null,
    transportErrors: err0,
    authDeniedRequests: authDenied,
    clientErrorRequests: clientErrors,
    status: done > 0 ? 'OK' : 'NO-SAMPLES',
    perEndpoint: byEp,
  };
}

/* ── اصلی ── */
(async () => {
  if (has('--validate') || has('--help')) validate();

  const problems = [];
  if (!opt.target) problems.push('--target لازم است (یا PAYESH_BASE_URL)');
  if (!has('--confirm-staging')) problems.push('این ابزار فقط برای staging است — --confirm-staging بدهید');
  if (problems.length) { problems.forEach((p) => console.error('✗ ' + p)); process.exit(2); }

  let payloads = {};
  if (opt.payloads) payloads = JSON.parse(require('fs').readFileSync(opt.payloads, 'utf8'));
  const headers = opt.token ? { authorization: 'Bearer ' + opt.token } : {};
  const steps = opt.staircase.split(',').map((s) => Number(s.trim()));

  console.log('کاوشگر اشباع — ' + opt.target + ' · پروفایل ' + opt.profile);
  const stepResults = [];
  let runFailed = false;
  for (const c of steps) {
    console.log('── پلهٔ ' + c + ' هم‌زمان (گرم‌کردان ' + opt.warmupSeconds + 's…)');
    await runStep(Math.min(c, 10), opt.warmupSeconds, payloads, headers); /* گرم‌کردن سبک */
    const mBefore = await scrapeMetrics();
    const r = await runStep(c, opt.stepSeconds, payloads, headers);
    const mAfter = await scrapeMetrics();
    r.metrics = extractMetrics(mBefore, mAfter);
    r.pg = await pgStats();
    r.redis = await redisInfo();
    console.log('   throughput=' + r.throughput + '/s · goodput=' + r.goodputRps + '/s · p50/p95/p99=' + r.p50 + '/' + r.p95 + '/' + r.p99 + 'ms · 5xx/transport=' + r.serverErrorRatePct + '/' + r.transportErrors + ' · 401/403=' + r.authDeniedRequests);
    stepResults.push(r);
    if (r.status === 'NO-SAMPLES') { console.error('   ✗ هیچ sample واقعی ثبت نشد — PASS ممنوع است'); runFailed = true; break; }
    if (r.errorRatePct > opt.abortErrorRate) { console.log('   ⚠ نرخ خطای 5xx/transport > ' + opt.abortErrorRate + '٪ — توقفِ اضطراری (ایمنی)'); runFailed = true; break; }
  }

  const knee = detectKnee(stepResults, opt.sloP95ms);
  const envelope = {
    schema: 'CAPACITY_ENVELOPE/1',
    meta: { date: new Date().toISOString(), target: opt.target, profile: opt.profile, datasetScale: opt.datasetScale || 'NOT-RECORDED', nodes: opt.nodes || 'NOT-RECORDED', args: argv.join(' ') },
    workload: { profile: opt.profile, weights: PROFILES[opt.profile], payloadsFile: opt.payloads || 'پیش‌فرضِ حداقلی (نوشتنِ واقعی سنجه نشده)' },
    staircase: steps,
    steps: stepResults,
    knee,
    slo: { p95ms: opt.sloP95ms, verdictP95: stepResults.length > 0 && stepResults.every((s) => s.status === 'OK' && s.p95 != null && s.p95 <= opt.sloP95ms) ? 'PASS' : 'BREACHED' },
    verdictStatus: runFailed || stepResults.length !== steps.length ? 'FAILURE' : 'MEASURED',
    verdict: 'این پاکت تا بازبینیِ انسانی «پیش‌نویس» است — قواعد حکم در docs/CAPACITY_ENVELOPE_TEMPLATE.md',
  };
  require('fs').writeFileSync(opt.out, JSON.stringify(envelope, null, 2));
  console.log('── زانو: ' + knee.knee.method + (knee.knee.concurrency != null ? ' @ concurrency=' + knee.knee.concurrency : '') + ' · پایدارِ بیشینه ≈ ' + knee.maxSustainableRps + ' rps');
  console.log('پاکت: ' + opt.out);
  process.exit(runFailed || stepResults.length !== steps.length ? 1 : 0);
})().catch((e) => { console.error('خطای کاوشگر: ' + (e.stack || e)); process.exit(1); });
