/* ═══════════════════════════════════════════════════════════════════
   server/tracing.js — Distributed Tracing (OpenTelemetry → Jaeger/OTLP)
   -------------------------------------------------------------------
   Tier-1 observability: every HTTP request gets a W3C trace; spans export
   over OTLP/HTTP to Jaeger v2 (OTLP-native; the old thrift/jaeger-agent
   path is retired upstream, so this module speaks OTLP only).
   - Auto-instrumentation: vanilla-Node http server spans (this server
     has no framework; instrumentation-http wraps http.createServer).
   - Correlation: getTraceId() feeds req.context, the X-Trace-Id response
     header and the trace_id field of audit.log JSON lines (what Loki ships).
   - Sampling: 100% in dev, parent-based 10% in production; set
     TRACING_SAMPLE_ALL=1 when a collector does tail sampling downstream.
   - No-PII contract: span attributes go through redactForSpan() (audit.js
     masking + span-specific drops); request URLs through redactUrl().
   - Fail-open: ANY tracing failure (missing deps, dead endpoint, bad env)
     degrades to a disabled stub — telemetry must never break the app.
     (Fail-closed applies to authz decisions, not to observability.)
   Env: TRACING_ENABLED (default true), OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
     | TRACING_OTLP_ENDPOINT (default http://localhost:4318/v1/traces),
     OTEL_SERVICE_NAME | TRACING_SERVICE_NAME (default payesh-api),
     OTEL_RESOURCE_ATTRIBUTES, OTEL_EXPORTER_OTLP_TRACES_HEADERS,
     OTEL_TRACES_SAMPLER / OTEL_TRACES_SAMPLER_ARG, TRACING_SAMPLE_ALL=1.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { sanitizeData } = require('./audit');

/* Span-specific drops on top of audit.js masking (HTTP-ish secrets that
   audit.js SENSITIVE_KEYS does not cover). NOTE to supervisor: consider
   adopting the same keys in audit.js for uniform coverage. */
const SPAN_DROP_KEYS = /^(?:authorization|cookie|set-cookie|api[_-]?key|x-api-key|private[_-]?key|client[_-]?secret|password|passwd|pwd|secret|token)$/i;
/* Query-string keys whose VALUES must not land in span URL attributes. */
const URL_DROP_KEYS = /^(?:password|pass|passwd|pwd|secret|token|jwt|otp|code|api[_-]?key|national_id|nid|melli_code|phone|mobile|tel)$/i;

let state = null; /* { enabled, provider, tracer, sampler, endpoint, serviceName, instrumentation, sdk } */

function parseKeyValues(s) {
  const out = {};
  String(s || '').split(',').forEach(function(pair){
    const i = pair.indexOf('=');
    if(i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
  return out;
}

function pkgVersion() {
  try { return require('../package.json').version || '1.0.0'; }
  catch(e){ return '1.0.0'; }
}

/* Pure: traces OTLP endpoint (standard precedence; the generic base URL
   gains /v1/traces exactly like the exporters do when they read it). */
function tracesEndpoint(env) {
  env = env || {};
  if(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if(env.TRACING_OTLP_ENDPOINT) return env.TRACING_OTLP_ENDPOINT;
  if(env.OTEL_EXPORTER_OTLP_ENDPOINT){
    const b = String(env.OTEL_EXPORTER_OTLP_ENDPOINT).replace(/\/+$/, '');
    return /\/v1\/traces$/.test(b) ? b : b + '/v1/traces';
  }
  return 'http://localhost:4318/v1/traces';
}

/* Pure: env -> config (unit-tested; no side effects). */
function readConfig(env) {
  env = env || {};
  const enabled = !(env.TRACING_ENABLED === 'false' || env.TRACING_ENABLED === '0');
  const sampler = selectSampler(env);
  return {
    enabled: enabled,
    endpoint: tracesEndpoint(env),
    serviceName: env.OTEL_SERVICE_NAME || env.TRACING_SERVICE_NAME || 'payesh-api',
    serviceVersion: pkgVersion(),
    resourceAttrs: parseKeyValues(env.OTEL_RESOURCE_ATTRIBUTES),
    headers: parseKeyValues(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS),
    sampler: sampler
  };
}

/* Pure: env -> { name, arg } sampler selection. */
function selectSampler(env) {
  env = env || {};
  if(env.TRACING_SAMPLE_ALL === '1') return { name: 'always_on', arg: 1 };
  const n = String(env.OTEL_TRACES_SAMPLER || '').toLowerCase().trim();
  const a = parseFloat(env.OTEL_TRACES_SAMPLER_ARG);
  const arg = isNaN(a) ? 0.1 : Math.min(1, Math.max(0, a));
  if(n === 'always_on') return { name: 'always_on', arg: 1 };
  if(n === 'always_off') return { name: 'always_off', arg: 0 };
  if(n === 'traceidratio') return { name: 'ratio', arg: arg };
  if(n === 'parentbased_always_on') return { name: 'parentbased_on', arg: 1 };
  if(n === 'parentbased_always_off') return { name: 'parentbased_off', arg: 0 };
  if(n === 'parentbased_traceidratio' || n === 'parentbased_ratio') return { name: 'parentbased_ratio', arg: arg };
  if(n) return null; /* unknown standard name: fall through to env default (never crash on config) */
  /* BUG-5 (باگ‌هانت چت ۵؛ پیش‌تر در PR_MERGE_PLAN §۱ triage شده بود):
     تشخیص تولیدِ سرور PAYESH_ENV است (گیت TLS در index.js) — اگر فقط
     NODE_ENV خوانده شود، استقرارِ PAYESH_ENV=production با نمونه‌برداریِ
     ۱۰۰٪ (always_on) به‌جایِ ۱۰٪ والد-محور بالا می‌آید. */
  if(env.PAYESH_ENV === 'production') return { name: 'parentbased_ratio', arg: 0.1 };
  if(env.NODE_ENV === 'production') return { name: 'parentbased_ratio', arg: 0.1 };
  return { name: 'always_on', arg: 1 };
}

/* Build an SDK sampler from a selection (sdk injectable for tests). */
function createSampler(sel, sdk) {
  sdk = sdk || safeSdk();
  if(!sdk) throw new Error('OpenTelemetry SDK not available');
  switch(sel && sel.name){
    case 'always_off': return new sdk.AlwaysOffSampler();
    case 'ratio': return new sdk.TraceIdRatioBasedSampler(typeof sel.arg === 'number' ? sel.arg : 1);
    case 'parentbased_on': return new sdk.ParentBasedSampler({ root: new sdk.AlwaysOnSampler() });
    case 'parentbased_off': return new sdk.ParentBasedSampler({ root: new sdk.AlwaysOffSampler() });
    case 'parentbased_ratio': return new sdk.ParentBasedSampler({ root: new sdk.TraceIdRatioBasedSampler(typeof sel.arg === 'number' ? sel.arg : 0.1) });
    case 'always_on':
    default: return new sdk.AlwaysOnSampler();
  }
}

function safeSdk() {
  try{
    return {
      api: require('@opentelemetry/api'),
      NodeTracerProvider: require('@opentelemetry/sdk-trace-node').NodeTracerProvider,
      BatchSpanProcessor: require('@opentelemetry/sdk-trace-node').BatchSpanProcessor,
      SimpleSpanProcessor: require('@opentelemetry/sdk-trace-node').SimpleSpanProcessor,
      AlwaysOnSampler: require('@opentelemetry/sdk-trace-node').AlwaysOnSampler,
      AlwaysOffSampler: require('@opentelemetry/sdk-trace-node').AlwaysOffSampler,
      ParentBasedSampler: require('@opentelemetry/sdk-trace-node').ParentBasedSampler,
      TraceIdRatioBasedSampler: require('@opentelemetry/sdk-trace-node').TraceIdRatioBasedSampler,
      OTLPTraceExporter: require('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter,
      resourceFromAttributes: require('@opentelemetry/resources').resourceFromAttributes,
      semconv: require('@opentelemetry/semantic-conventions'),
      HttpInstrumentation: require('@opentelemetry/instrumentation-http').HttpInstrumentation,
      AsyncLocalStorageContextManager: require('@opentelemetry/context-async-hooks').AsyncLocalStorageContextManager
    };
  }catch(e){
    return null;
  }
}

/* Deep-drop span-specific secret keys (cycle-safe), then audit.js masking. */
function dropSpanKeys(val, seen) {
  if(val === null || val === undefined) return val;
  if(typeof val !== 'object') return val;
  seen = seen || new WeakSet();
  if(seen.has(val)) return '[CIRCULAR]';
  seen.add(val);
  if(Array.isArray(val)) return val.map(function(x){ return dropSpanKeys(x, seen); });
  const out = {};
  Object.keys(val).forEach(function(k){
    out[k] = SPAN_DROP_KEYS.test(k) ? '[REDACTED]' : dropSpanKeys(val[k], seen);
  });
  return out;
}

/* Pure: arbitrary object -> PII-scrubbed span-safe attributes. */
function redactForSpan(obj) {
  return sanitizeData(dropSpanKeys(obj || {}));
}

/* OTel attribute values must be primitives (or arrays); stringify the rest. */
function toSpanAttributes(obj) {
  const clean = redactForSpan(obj);
  const out = {};
  Object.keys(clean).forEach(function(k){
    const v = clean[k];
    if(v === undefined || typeof v === 'function' || typeof v === 'symbol') return;
    if(v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if(Array.isArray(v)) out[k] = v.map(function(x){ return (x !== null && typeof x === 'object') ? JSON.stringify(x) : x; });
    else { try{ out[k] = JSON.stringify(v); }catch(e){ out[k] = '[UNSTRINGIFIABLE]'; } }
  });
  return out;
}

/* Pure: redact sensitive query values from a URL (keeps keys + path). */
function redactUrl(raw) {
  if(!raw) return raw;
  const q = String(raw).indexOf('?');
  if(q < 0) return raw;
  const path = String(raw).slice(0, q);
  const red = String(raw).slice(q + 1).split('&').map(function(p){
    const i = p.indexOf('=');
    const k = (i < 0 ? p : p.slice(0, i)).trim();
    if(URL_DROP_KEYS.test(k)) return k + '=[REDACTED]';
    return p;
  }).join('&');
  return path + '?' + red;
}

/* Pure: redact sensitive values inside a bare query string (no leading '?'). */
function redactQuery(qs) {
  return String(qs || '').split('&').map(function(p){
    const i = p.indexOf('=');
    const k = (i < 0 ? p : p.slice(0, i)).trim();
    if(URL_DROP_KEYS.test(k)) return k + '=[REDACTED]';
    return p;
  }).join('&');
}

/* Scrub every URL-bearing attribute on a span: sensitive query keys via
   redactQuery/redactUrl plus phone/national-id patterns via audit's
   sanitizeString. Safe to call with a fake span in tests. */
function scrubUrlAttributes(span) {
  if(!span || typeof span.setAttribute !== 'function') return;
  let sanitize = null;
  try{ sanitize = require('./audit.js').sanitizeString; }catch(e){ sanitize = null; }
  const cleanQuery = function(v){ let s = redactQuery(v); if(sanitize){ try{ s = sanitize(s); }catch(e){} } return s; };
  const cleanUrl = function(v){ let s = redactUrl(String(v)); if(sanitize){ try{ s = sanitize(s); }catch(e){} } return s; };
  try{
    const attrs = span.attributes || {};
    ['url.query', 'http.target'].forEach(function(k){
      if(attrs[k] != null && String(attrs[k]).length > 0){
        const v = String(attrs[k]);
        span.setAttribute(k, v.indexOf('?') >= 0 ? cleanUrl(v) : cleanQuery(v));
      }
    });
    ['url.full', 'http.url'].forEach(function(k){
      if(attrs[k] != null && String(attrs[k]).indexOf('?') >= 0) span.setAttribute(k, cleanUrl(attrs[k]));
    });
  }catch(e){}
}

/* Idempotent init. opts (all optional, mainly for tests):
   { env, exporter, processor: 'batch'|'simple', enableHttp: bool }. */
function initTracing(opts) {
  if(state) return state;
  opts = opts || {};
  const env = opts.env || process.env;
  const cfg = readConfig(env);
  const disabled = { enabled: false, provider: null, tracer: null, sampler: null,
    endpoint: cfg.endpoint, serviceName: cfg.serviceName, shutdown: async function(){}, _disabled: true };
  if(!cfg.enabled){ state = disabled; return state; }
  const sdk = safeSdk();
  if(!sdk){ state = disabled; return state; }
  try{
    const api = sdk.api;
    try{ api.context.setGlobalContextManager(new sdk.AsyncLocalStorageContextManager()); }catch(e){}
    try{ api.context.getGlobalContextManager().enable(); }catch(e){}
    const attrs = {};
    attrs[sdk.semconv.ATTR_SERVICE_NAME] = cfg.serviceName;
    attrs[sdk.semconv.ATTR_SERVICE_VERSION] = cfg.serviceVersion;
    Object.keys(cfg.resourceAttrs).forEach(function(k){ attrs[k] = cfg.resourceAttrs[k]; });
    const sampler = createSampler(cfg.sampler, sdk);
    const exporter = opts.exporter || new sdk.OTLPTraceExporter({ url: cfg.endpoint, headers: cfg.headers });
    const useSimple = opts.processor === 'simple' || !!opts.exporter;
    const processor = useSimple ? new sdk.SimpleSpanProcessor(exporter) : new sdk.BatchSpanProcessor(exporter);
    const provider = new sdk.NodeTracerProvider({
      resource: sdk.resourceFromAttributes(attrs),
      sampler: sampler,
      spanProcessors: [processor]
    });
    provider.register();
    let instrumentation = null;
    if(opts.enableHttp !== false){
      instrumentation = new sdk.HttpInstrumentation({
        ignoreIncomingRequestHook: function(req){ return (req && req.url && req.url.split('?')[0]) === '/api/health'; },
        requestHook: function(span, request){
          try{
            if(request && request.url && request.url.indexOf('?') >= 0){
              const red = redactUrl(request.url);
              span.setAttribute('url.full', red);
              span.setAttribute('http.url', red);
            }
            scrubUrlAttributes(span);
          }catch(e){}
        },
        responseHook: function(span){
          try{ scrubUrlAttributes(span); }catch(e){}
        }
      });
      instrumentation.enable();
    }
    const tracer = api.trace.getTracer('payesh-server', cfg.serviceVersion);
    state = { enabled: true, provider: provider, tracer: tracer, sampler: sampler,
      endpoint: cfg.endpoint, serviceName: cfg.serviceName, instrumentation: instrumentation,
      sdk: sdk, shutdown: async function(){ try{ await provider.shutdown(); }catch(e){} } };
    return state;
  }catch(err){
    try{ console.warn('[tracing] init failed, continuing without tracing:', err.message); }catch(e){}
    state = disabled;
    return state;
  }
}

function getTracer() {
  return state && state.tracer ? state.tracer : null;
}

/* Current active span's trace id, or null (safe to call anywhere). */
function getTraceId() {
  try{
    if(!state || !state.enabled || !state.sdk) return null;
    const api = state.sdk.api;
    const span = api.trace.getSpan(api.context.active());
    if(!span) return null;
    const sc = span.spanContext();
    if(!sc || !sc.traceId || /^0+$/.test(sc.traceId)) return null;
    return sc.traceId;
  }catch(e){
    return null;
  }
}

function setSafeAttributes(span, obj) {
  if(!span || typeof span.setAttributes !== 'function') return;
  try{ span.setAttributes(toSpanAttributes(obj)); }catch(e){}
}

/* Run fn inside an active span (passthrough when tracing is off). */
async function withSpan(name, attrs, fn) {
  if(typeof attrs === 'function'){ fn = attrs; attrs = null; }
  const tracer = getTracer();
  if(!tracer || !state.sdk) return fn(undefined);
  const api = state.sdk.api;
  return tracer.startActiveSpan(String(name), async function(span){
    try{
      if(attrs) setSafeAttributes(span, attrs);
      return await fn(span);
    }catch(err){
      try{
        span.recordException(err);
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: String((err && err.message) || err) });
      }catch(e){}
      throw err;
    }finally{
      try{ span.end(); }catch(e){}
    }
  });
}

async function shutdownTracing() {
  if(state && typeof state.shutdown === 'function'){
    try{ await state.shutdown(); }catch(e){}
  }
}

/* Test seam: fully reset module state (also unregisters the global provider). */
async function __resetForTests() {
  try{ await shutdownTracing(); }catch(e){}
  try{
    const api = require('@opentelemetry/api');
    if(api && api.trace && typeof api.trace.disable === 'function') api.trace.disable();
  }catch(e){}
  state = null;
}

module.exports = {
  initTracing,
  getTracer,
  getTraceId,
  withSpan,
  setSafeAttributes,
  shutdownTracing,
  readConfig,
  selectSampler,
  createSampler,
  redactForSpan,
  toSpanAttributes,
  redactUrl,
  redactQuery,
  scrubUrlAttributes,
  __resetForTests
};

async function shutdownTracing() {
  if(state && typeof state.shutdown === 'function'){
    try{ await state.shutdown(); }catch(e){}
  }
}

/* Test seam: fully reset module state (also unregisters the global provider). */
async function __resetForTests() {
  try{ await shutdownTracing(); }catch(e){}
  try{
    const api = require('@opentelemetry/api');
    if(api && api.trace && typeof api.trace.disable === 'function') api.trace.disable();
  }catch(e){}
  state = null;
}
