#!/usr/bin/env node
/* tests/tracing-integration.js — راستی‌آزماییِ سرتاسریِ ردیابی:
   Part A (همیشه): سرآیندِ X-Trace-Id، تداومِ W3C، نادیده‌گرفتنِ health،
                   همبستگیِ audit↔trace، رفتارِ TRACING_ENABLED=false.
   Part B (Jaeger واقعی یا پرشِ بلند): نصب/اجرا + پرس‌وجو از API + بدونِ PII.
   اجرا: node tests/tracing-integration.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const JAEGER_VERSION = 'v2.20.0';
const JAEGER_CACHE = path.join(__dirname, '.cache-jaeger');

let pass = 0, fail = 0, skip = 0;
const failures = [];
function grp(t) { console.log('\n▸ ' + t); }
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '\n     ' + extra : '')); }
}
function skp(name, why) { skip++; console.log('  ⏭️  ' + name + ' — ' + why); }

function hex(n) {
  let s = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < n; i++) s += chars[(Math.random() * 16) | 0];
  return s;
}
function traceparent(tid) { return '00-' + tid + '-' + hex(16) + '-01'; }
function isHex32(s) { return typeof s === 'string' && /^[0-9a-f]{32}$/.test(s); }

function portFree(port) {
  return new Promise((resolve) => {
    const s = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
      res.resume(); s.destroy(); resolve(false);
    });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
  });
}
async function pickPort(base) {
  for (let p = base; p < base + 30; p++) { if (await portFree(p)) return p; }
  throw new Error('پورتِ آزاد یافت نشد از ' + base);
}

const children = [];
function spawnNode(args, env, tag) {
  const child = cp.spawn(process.execPath, args, {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'ignore', 'pipe']
  });
  child.tag = tag;
  child.stderrText = '';
  if (child.stderr) child.stderr.on('data', (d) => {
    child.stderrText = (child.stderrText + d.toString('utf8')).slice(-4000);
  });
  children.push(child);
  return child;
}
function killAll() {
  children.forEach((c) => { try { if (!c.killed) c.kill('SIGKILL'); } catch (e) {} });
}

function apiRequest(port, method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}
async function waitForHealth(port, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await apiRequest(port, 'GET', '/api/health', {});
      if (r.status === 200) return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const SEED_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
function seedStore(target) {
  if (!fs.existsSync(SEED_STORE)) throw new Error('seed store نیست: node server/seed.js را اجرا کنید');
  fs.copyFileSync(SEED_STORE, target);
}
/* بوت با یک تلاشِ مجدد (گذرای محیطی)؛ شکستِ هر دو = خطای واقعی. */
async function bootServer(tmp, names, extraEnv, basePort, tag) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const port = await pickPort(basePort);
    const storeP = path.join(tmp, names.store);
    try { seedStore(storeP); } catch (e) { console.log('  … seed ناموفق: ' + e.message); return null; }
    const child = spawnNode([SERVER], Object.assign({
      PORT: String(port), PAYESH_STORE: storeP,
      PAYESH_AUDIT: path.join(tmp, names.audit), PAYESH_KEY: path.join(tmp, names.key)
    }, extraEnv), tag);
    if (await waitForHealth(port, 20000)) {
      if (attempt === 2) console.log('  … ' + tag + ' با تلاشِ دوم بالا آمد (پورت ' + port + ')');
      return { child: child, port: port, audit: path.join(tmp, names.audit) };
    }
    console.log('  … ' + tag + ' تلاشِ ' + attempt + ' ناموفق: ' + (child.stderrText || '(بی‌صدا)').slice(-200));
    try { child.kill('SIGKILL'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

function readAppendedJsonLines(file, sizeBefore) {
  try {
    if (!fs.existsSync(file)) return [];
    const st = fs.statSync(file);
    if (st.size < sizeBefore) sizeBefore = 0;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.max(0, st.size - sizeBefore));
    fs.readSync(fd, buf, 0, buf.length, sizeBefore);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }
}

/* ── Part A ─────────────────────────────────────────────── */
async function partA() {
  grp('A — سرآیند/همبستگی/حالت‌ها (بدونِ Jaeger)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-trA-'));

  /* بوتِ E: ردیابی فعال */
  const bE = await bootServer(tmp, { store: 'store-E.json', audit: 'audit-E.log', key: 'jwt-E.key' },
    { TRACING_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:14999' }, 18771, 'app-E');
  if (!bE) { chk('A0 بوتِ سرورِ E', false, 'دو تلاش ناموفق'); killAll(); return false; }
  const portE = bE.port, auditE = bE.audit, srvE = bE.child;
  chk('A0 بوتِ سرورِ E', true);

  const r1 = await apiRequest(portE, 'POST', '/api/sync', { 'content-type': 'application/json' }, '{}');
  chk('A1 مسیرِ ردیابی‌شده 401 + سرآیندِ معتبر', r1.status === 401 && isHex32(r1.headers['x-trace-id']),
    'status=' + r1.status + ' hdr=' + r1.headers['x-trace-id']);

  const tid2 = hex(32);
  const r2 = await apiRequest(portE, 'POST', '/api/sync',
    { 'content-type': 'application/json', traceparent: traceparent(tid2) }, '{}');
  chk('A2 تداومِ W3C (سرآیند = trace_idِ ورودی)', r2.headers['x-trace-id'] === tid2,
    'got=' + r2.headers['x-trace-id'] + ' want=' + tid2);

  const rh = await apiRequest(portE, 'GET', '/api/health', {});
  chk('A3 سلامت 200 و بدونِ سرآیند', rh.status === 200 && !rh.headers['x-trace-id']);

  const tid4 = hex(32);
  const sizeBefore = fs.existsSync(auditE) ? fs.statSync(auditE).size : 0;
  const big = 'x'.repeat(1024 * 1024 + 100);
  const r4 = await apiRequest(portE, 'POST', '/api/sync',
    { 'content-type': 'application/json', traceparent: traceparent(tid4) }, big);
  const lines = readAppendedJsonLines(auditE, sizeBefore);
  const btl = lines.find((l) => l.event === 'body_too_large' || l.type === 'body_too_large');
  chk('A4 بدنهٔ بزرگ 413 + سرآیند = ورودی', r4.status === 413 && r4.headers['x-trace-id'] === tid4,
    'status=' + r4.status + ' hdr=' + r4.headers['x-trace-id']);
  chk('A4b ممیزی همان trace_id را دارد (همبستگی)', !!btl && btl.trace_id === tid4,
    btl ? JSON.stringify(btl).slice(0, 160) : 'خطِ body_too_large یافت نشد (' + lines.length + ' خط)');
  try { srvE.kill('SIGKILL'); } catch (e) {}

  /* بوتِ D: ردیابی خاموش */
  const bD = await bootServer(tmp, { store: 'store-D.json', audit: 'audit-D.log', key: 'jwt-D.key' },
    { TRACING_ENABLED: 'false' }, 18781, 'app-D');
  if (!bD) { chk('A5 بوتِ سرورِ D', false, 'دو تلاش ناموفق'); killAll(); return false; }
  const portD = bD.port, auditD = bD.audit, srvD = bD.child;
  const rd = await apiRequest(portD, 'POST', '/api/sync', { 'content-type': 'application/json' }, '{}');
  chk('A5 خاموش = بدونِ سرآیند', rd.status === 401 && !rd.headers['x-trace-id'],
    'status=' + rd.status + ' hdr=' + rd.headers['x-trace-id']);
  const sizeD = fs.existsSync(auditD) ? fs.statSync(auditD).size : 0;
  await apiRequest(portD, 'POST', '/api/sync', { 'content-type': 'application/json' }, big);
  const linesD = readAppendedJsonLines(auditD, sizeD);
  const btlD = linesD.find((l) => l.event === 'body_too_large' || l.type === 'body_too_large');
  chk('A5b ممیزیِ خاموش کلیدِ trace_id ندارد', !!btlD && !('trace_id' in btlD),
    btlD ? JSON.stringify(btlD).slice(0, 160) : 'خط یافت نشد');
  try { srvD.kill('SIGKILL'); } catch (e) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  return true;
}

/* ── Part B: Jaeger ─────────────────────────────────────── */
function jaegerPlatform() {
  const p = process.platform, a = process.arch;
  if (p === 'linux' && a === 'x64') return 'linux-amd64';
  if (p === 'linux' && a === 'arm64') return 'linux-arm64';
  if (p === 'darwin' && a === 'x64') return 'darwin-amd64';
  if (p === 'darwin' && a === 'arm64') return 'darwin-arm64';
  return null;
}
function ensureJaegerBinary() {
  const plat = jaegerPlatform();
  if (!plat) return { bin: null, why: 'سکوی ' + process.platform + '/' + process.arch + ' پشتیبانی نمی‌شود' };
  const dir = path.join(JAEGER_CACHE, JAEGER_VERSION + '-' + plat);
  const bin = path.join(dir, 'jaeger');
  if (fs.existsSync(bin)) return { bin };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const url = 'https://github.com/jaegertracing/jaeger/releases/download/' + JAEGER_VERSION +
      '/jaeger-' + JAEGER_VERSION.slice(1) + '-' + plat + '.tar.gz';
    const tgz = path.join(dir, 'dl.tar.gz');
    cp.execFileSync('curl', ['-fsSL', '--max-time', '120', '-o', tgz, url], { timeout: 130000 });
    cp.execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1'], { timeout: 60000 });
    try { fs.unlinkSync(tgz); } catch (e) {}
    if (!fs.existsSync(bin)) return { bin: null, why: 'استخراج ناموفق' };
    try { fs.chmodSync(bin, 0o755); } catch (e) {}
    return { bin };
  } catch (e) {
    return { bin: null, why: 'دانلود/استخراج ناموفق: ' + String((e && e.message) || e).slice(0, 120) };
  }
}
function jaegerConfig() {
  return [
    'service:',
    '  extensions: [jaeger_storage, jaeger_query]',
    '  pipelines:',
    '    traces:',
    '      receivers: [otlp]',
    '      processors: [batch]',
    '      exporters: [jaeger_storage_exporter]',
    '  telemetry:',
    '    logs: {level: error}',
    '    metrics: {level: none}',
    'extensions:',
    '  jaeger_query: {storage: {traces: test_store}}',
    '  jaeger_storage:',
    '    backends: {test_store: {memory: {max_traces: 1000}}}',
    'receivers:',
    '  otlp:',
    '    protocols:',
    '      grpc: {endpoint: 127.0.0.1:4317}',
    '      http: {endpoint: 127.0.0.1:4318}',
    'processors: {batch: {}}',
    'exporters:',
    '  jaeger_storage_exporter: {trace_storage: test_store}',
    ''
  ].join('\n');
}
function jaegerGetJson(urlPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 16686, path: urlPath, timeout: 8000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(d)); } catch (e) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
function normalizeTrace(doc) {
  if (!doc || doc.data == null) return null;
  const arr = Array.isArray(doc.data) ? doc.data : [doc.data];
  return arr.length ? arr[0] : null;
}
async function findTrace(tid, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let tr = normalizeTrace(await jaegerGetJson('/api/traces/' + tid));
    if (!tr) {
      const q = await jaegerGetJson('/api/traces?service=payesh-api');
      if (q && Array.isArray(q.data)) tr = q.data.find((t) => t && t.traceID === tid) || null;
    }
    if (tr) return tr;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function partB() {
  grp('B — Jaeger واقعی (یا پرشِ بلند)');
  if (!await portFree(4318) || !await portFree(16686)) {
    ['B1', 'B2', 'B3', 'B4', 'B5'].forEach((b) => skp(b, 'پورتِ 4318/16686 اشغال است'));
    return;
  }
  const ens = ensureJaegerBinary();
  if (!ens.bin) {
    ['B1', 'B2', 'B3', 'B4', 'B5'].forEach((b) => skp(b, ens.why));
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-trB-'));
  const cfgFile = path.join(tmp, 'jaeger-test.yaml');
  fs.writeFileSync(cfgFile, jaegerConfig());
  const jlog = path.join(tmp, 'jaeger.log');
  const jl = fs.openSync(jlog, 'w');
  const jg = cp.spawn(ens.bin, ['--config', cfgFile], {
    cwd: tmp, stdio: ['ignore', jl, jl]
  });
  children.push(jg);
  let uiOk = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const h = await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: 16686, path: '/', timeout: 3000 }, (res) => {
        res.resume(); resolve(res.statusCode);
      });
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.on('error', () => resolve(0));
    });
    if (h === 200) { uiOk = true; break; }
    if (jg.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!uiOk) {
    let tail = '';
    try { tail = fs.readFileSync(jlog, 'utf8').slice(-400); } catch (e) {}
    ['B1', 'B2', 'B3', 'B4', 'B5'].forEach((b) => skp(b, 'Jaeger بالا نیامد: ' + tail.slice(-120)));
    try { jg.kill('SIGKILL'); } catch (e) {}
    return;
  }
  console.log('  … Jaeger بالا است (ui :16686، otlp :4318)');

  const bB = await bootServer(tmp, { store: 'store-B.json', audit: 'audit-B.log', key: 'jwt-B.key' },
    { TRACING_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      OTEL_TRACES_SAMPLER: 'always_on' }, 18791, 'app-B');
  if (!bB) {
    chk('B0 بوتِ اپ با OTLP زنده', false, 'دو تلاش ناموفق');
    try { jg.kill('SIGKILL'); } catch (e) {}
    killAll(); return;
  }
  const portB = bB.port;
  let srv = bB.child;
  chk('B0 بوتِ اپ با OTLP زنده', true);

  /* B1: سرتاسریِ ورود */
  const tid1 = hex(32);
  await apiRequest(portB, 'GET', '/api/sync/conflicts', { traceparent: traceparent(tid1) });
  const tr1 = await findTrace(tid1, 45000);
  chk('B1 رد در Jaeger پیدا شد (ورودِ سرتاسری)', !!tr1);

  /* B2: ساختارِ اسپن */
  const sp1 = tr1 && tr1.spans && tr1.spans[0];
  const tagKeys = sp1 && Array.isArray(sp1.tags) ? sp1.tags.map((t) => t.key) : [];
  chk('B2 نامِ عملیات + تگِ http دارد', !!sp1 && /GET/.test(sp1.operationName || '') &&
    tagKeys.some((k) => /http\./.test(k) || k === 'url.path'),
    sp1 ? sp1.operationName + ' tags=' + tagKeys.slice(0, 8).join(',') : 'اسپنی نیست');

  /* B3: بدونِ PII */
  const tid3 = hex(32);
  await apiRequest(portB, 'GET', '/api/sync/conflicts?password=SecretPW123&token=tok_ABC&q=09121234567',
    { traceparent: traceparent(tid3), authorization: 'Bearer HDR-SECRET-999' });
  const tr3 = await findTrace(tid3, 45000);
  const dump3 = tr3 ? JSON.stringify(tr3) : '';
  const badKeys = tr3 && tr3.spans ? tr3.spans.flatMap((s) => (s.tags || []).map((t) => t.key))
    .filter((k) => /^(password|passwd|token|secret)$/i.test(k)) : ['?'];
  chk('B3 ردِ PII در Jaeger نیست', !!tr3 && dump3.indexOf('SecretPW123') < 0 &&
    dump3.indexOf('tok_ABC') < 0 && dump3.indexOf('09121234567') < 0 &&
    dump3.indexOf('HDR-SECRET-999') < 0 && badKeys.length === 0,
    tr3 ? 'badKeys=' + JSON.stringify(badKeys) : 'رد یافت نشد');

  /* B4: خطایِ 401 دیده می‌شود */
  const tid4 = hex(32);
  const r401 = await apiRequest(portB, 'POST', '/api/sync',
    { 'content-type': 'application/json', traceparent: traceparent(tid4) }, '{}');
  const tr4 = await findTrace(tid4, 45000);
  const dump4 = tr4 ? JSON.stringify(tr4) : '';
  chk('B4 وضعیتِ 401 در رد ثبت است', r401.status === 401 && !!tr4 && dump4.indexOf('401') >= 0,
    'status=' + r401.status + (tr4 ? '' : ' رد یافت نشد'));

  /* B5: سیم‌کشیِ نمونه‌بردار (احتمالِ صفر = هیچ ردی) */
  try { srv.kill('SIGKILL'); } catch (e) {}
  await new Promise((r) => setTimeout(r, 800));
  const bB5 = await bootServer(tmp, { store: 'store-B.json', audit: 'audit-B.log', key: 'jwt-B.key' },
    { TRACING_ENABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      OTEL_TRACES_SAMPLER: 'always_off' }, 18791, 'app-B5');
  let b5done = false;
  if (bB5) {
    srv = bB5.child;
    const tid5 = hex(32);
    await apiRequest(bB5.port, 'GET', '/api/sync/conflicts', { traceparent: traceparent(tid5) });
    const tr5 = await findTrace(tid5, 8000);
    chk('B5 نمونه‌برداریِ صفر = رد صادر نشد', !tr5);
    b5done = true;
  }
  if (!b5done) chk('B5 نمونه‌برداریِ صفر = رد صادر نشد', false, 'بوتِ دوم ناموفق');

  try { jg.kill('SIGKILL'); } catch (e) {}
  killAll();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

/* ── main ───────────────────────────────────────────────── */
(async function main() {
  try {
    const okA = await partA();
    if (okA && !process.env.TRACING_MUTS) {
      const passB = pass, failB = fail, nfB = failures.length;
      let bErr = null;
      try { await partB(); } catch (e) { bErr = e; }
      /* زیرِ بارِ موازیِ رگرسیون (رمِ ~۲ گیگ)، بوتِ همزمانِ اپ+‏Jaeger گاه
         با کُندی/کشتارِ منابع شکست می‌خورد یا می‌میرد. یک تلاشِ دوم با بوتِ
         تازه؛ اگر باز هم شکست خورد قرمزِ واقعی است. پرش‌ها شکست نیستند. */
      if (bErr || fail > failB) {
        if (bErr) { fail++; failures.push('crash: ' + String((bErr && bErr.message) || bErr)); }
        console.log('  … بخشِ B زیرِ بار شکست خورد؛ تلاشِ دوم با بوتِ تازه');
        try { killAll(); } catch (e) {}
        await new Promise((r) => setTimeout(r, 3000));
        pass = passB; fail = failB; failures.length = nfB;
        await partB();
      }
    }
    else if (okA) console.log('\n(بخشِ B با TRACING_MUTS پرش شد)');
  } catch (e) {
    fail++;
    failures.push('crash: ' + String((e && e.message) || e));
    console.log('  ❌ کرش: ' + String((e && e.stack) || e).slice(0, 400));
  }
  try { killAll(); } catch (e) {}
  console.log('\n' + '─'.repeat(52));
  console.log('جمع: ' + pass + ' موفق، ' + fail + ' ناموفق از ' + (pass + fail) +
    (skip ? ' (' + skip + ' پرش)' : ''));
  if (failures.length) console.log('ناموفق‌ها: ' + failures.join(' | ').slice(0, 400));
  console.log('─'.repeat(52) + '\n');
  /* بستنِ دسته‌ایِ صادرکننده‌ها پیش از خروج */
  await new Promise((r) => setTimeout(r, 300));
  process.exit(fail ? 1 : 0);
})();
