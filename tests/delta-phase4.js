#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/delta-phase4.js — Delta Sync Phase 4 (پنج شکاف)
   ─────────────────────────────────────────────────────────────────
   گپ ۱ — Sync Backpressure (نرخِ op + رفتارِ کلاینت):
     BP1 بدونِ دروازه (تست‌های قدیمی) مسیرِ عادی سالم می‌ماند
     BP2 درونِ بودجه: ۴۰۰ op ← ۲۰۰ و همه اعمال
     BP3 برستِ ۱۰۰۰ op در سقفِ ۱۰۰۰ ← همه سبز؛ ۱ op بعدی ← 429
     BP4 429: کد sync_backpressure + retry_after_s + سرآیندِ
        Retry-After + هیچ op اعمال نمی‌شود + شمارندهٔ متریک
     BP5 خطای موتورِ نرخ = fail-open (۲۰۰)
     BP6 کلاینت (jsdom): 429 ← opها pending می‌مانند (نه failed/DLQ)،
        زمان‌بندیِ دوباره، و بهبود با پاسخِ ۲۰۰

   گپ ۲ — Delta Compression:  (CM گروه، فازِ بعد افزوده می‌شود)
   گپ ۳ — Cursor Warmup:      (CW گروه، فازِ بعد افزوده می‌شود)
   گپ ۴ — Sync Metrics:       (MX گروه، فازِ بعد افزوده می‌شود)
   گپ ۵ — Multi-Region:       (MR گروه، فازِ بعد افزوده می‌شود)

   Run: node tests/delta-phase4.js   (exit 0 = all green)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const { createSync, attach } = require(path.join(ROOT, 'server', 'sync'));
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { createCursor } = require(path.join(ROOT, 'server', 'cursor'));
const zlib = require('zlib');
const os = require('os');
const { spawn } = require('child_process');
const metrics = require(path.join(ROOT, 'server', 'metrics'));
const { opX } = require('./helpers/opx');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const iso = (t) => new Date(t).toISOString();
const counterValue = (name) => {
  const snap = metrics.snapshot()[name];
  if (!snap || !Array.isArray(snap.series)) return 0;
  return snap.series.reduce((a, s) => a + (Number(s.value) || 0), 0);
};

/* ═══════════════ هارنس سرور (الگوی delta-sync-hardening) ═══════════════ */
function makeSyncCtx(o) {
  o = o || {};
  const store = {
    visitors: [],
    users: [{ id: 5, role: 'manager', school_id: 1 }],
    __processed_uids: {}, __server_version: 0
  };
  const ctx = {
    store,
    db: { persistOpsBatch: async () => ({ ok: true }), isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {},
    sessionFrom: async () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {},
    rateLimit: o.rateLimit || null,
    syncOpsPerMin: o.syncOpsPerMin
  };
  attach(store);
  return { ctx, store };
}
const mkRes = () => {
  const r = { _headers: {} };
  r.setHeader = (k, v) => { r._headers[String(k).toLowerCase()] = String(v); };
  return r;
};
const mkOps = (n, tag) => Array.from({ length: n }, () =>
  opX({ by: 5, collection: 'visitors', type: 'ins', data: { school_id: 1, name: tag } }));
const runSync = async (ctx, ops) => {
  const res = mkRes();
  await ctx.apiSync ? null : null;
  return res;
};

/* شمارندهٔ وزن‌دارِ جعلی — همان قراردادِ rate-limit.js */
function fakeLimiter(limit, reset) {
  let count = 0;
  const fn = async ({ prefix, identifier, limit: _l, windowSeconds, weight }) => {
    count += Math.max(1, Math.trunc(Number(weight) || 1));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), reset: reset != null ? reset : 42, limit };
  };
  fn.count = () => count;
  return fn;
}

(async () => {

/* ═══════════════ گپ ۱ — Sync Backpressure ═══════════════ */
group('گپ ۱ — Backpressure (نرخِ op + رفتارِ کلاینت)');

await test('BP1 بدونِ دروازه، مسیرِ عادیِ sync دست‌نخورده است', async () => {
  const { ctx, store } = makeSyncCtx({});
  const s = createSync(ctx);
  const res = mkRes();
  await s.apiSync({}, res, { ops: mkOps(3, 'bp1') });
  assert(res._cap.code === 200, 'status 200, got ' + res._cap.code);
  assert(store.visitors.length === 3, '3 ops applied, got ' + store.visitors.length);
});

await test('BP2 درونِ بودجه: ۴۰۰ op در سقفِ ۱۰۰۰ ← ۲۰۰ و همه اعمال', async () => {
  const lim = fakeLimiter(1000);
  const { ctx, store } = makeSyncCtx({ rateLimit: lim, syncOpsPerMin: 1000 });
  const s = createSync(ctx);
  const res = mkRes();
  await s.apiSync({}, res, { ops: mkOps(400, 'bp2') });
  assert(res._cap.code === 200, 'status 200, got ' + res._cap.code);
  assert(store.visitors.length === 400, '400 applied, got ' + store.visitors.length);
  assert(lim.count() === 400, 'limiter counted ops (weight), got ' + lim.count());
});

await test('BP3 برستِ ۱۰۰۰ op در سقفِ ۱۰۰۰ ← همه سبز؛ ۱ op بعدی ← 429', async () => {
  const lim = fakeLimiter(1000);
  const { ctx, store } = makeSyncCtx({ rateLimit: lim, syncOpsPerMin: 1000 });
  const s = createSync(ctx);
  const r1 = mkRes(); await s.apiSync({}, r1, { ops: mkOps(500, 'bp3a') });
  assert(r1._cap.code === 200, 'first 500 ok, got ' + r1._cap.code);
  const r2 = mkRes(); await s.apiSync({}, r2, { ops: mkOps(500, 'bp3b') });
  assert(r2._cap.code === 200, 'second 500 ok (exactly at budget), got ' + r2._cap.code);
  assert(store.visitors.length === 1000, 'burst of 1000 applied, got ' + store.visitors.length);
  const r3 = mkRes(); await s.apiSync({}, r3, { ops: mkOps(1, 'bp3c') });
  assert(r3._cap.code === 429, '1 op over budget => 429, got ' + r3._cap.code);
  assert(store.visitors.length === 1000, 'the rejected op must NOT be applied');
});

await test('BP4 429: sync_backpressure + retry_after_s + Retry-After + متریک، بدونِ اعمال', async () => {
  const before = counterValue('payesh_sync_backpressure_rejections_total');
  const lim = fakeLimiter(600, 42);
  const { ctx, store } = makeSyncCtx({ rateLimit: lim, syncOpsPerMin: 600 });
  const s = createSync(ctx);
  const r1 = mkRes(); await s.apiSync({}, r1, { ops: mkOps(500, 'bp4a') });
  assert(r1._cap.code === 200, 'first batch ok');
  const beforeN = store.visitors.length;
  const r2 = mkRes(); await s.apiSync({}, r2, { ops: mkOps(500, 'bp4b') });
  assert(r2._cap.code === 429, 'second batch over budget => 429, got ' + r2._cap.code);
  const b = r2._cap.body || {};
  assert(b.ok === false && b.code === 'sync_backpressure', 'machine-readable code, got ' + JSON.stringify(b));
  assert(b.retry_after_s === 42, 'retry_after_s from window TTL, got ' + b.retry_after_s);
  assert(r2._headers['retry-after'] === '42', 'Retry-After header, got ' + JSON.stringify(r2._headers));
  assert(store.visitors.length === beforeN, 'no op from the rejected batch applied');
  const after = counterValue('payesh_sync_backpressure_rejections_total');
  assert(after === before + 1, 'backpressure metric +1 (' + before + '→' + after + ')');
});

await test('BP5 خطای موتورِ نرخ = fail-open (۲۰۰)، مثلِ قراردادِ rate-limit.js', async () => {
  const boom = async () => { throw new Error('redis down'); };
  const { ctx, store } = makeSyncCtx({ rateLimit: boom, syncOpsPerMin: 100 });
  const s = createSync(ctx);
  const res = mkRes();
  await s.apiSync({}, res, { ops: mkOps(5, 'bp5') });
  assert(res._cap.code === 200, 'fail-open 200, got ' + res._cap.code);
  assert(store.visitors.length === 5, 'ops applied');
});

await test('BP6 کلاینت (jsdom): 429 ← opها pending می‌مانند و دوباره زمان‌بندی می‌شوند', async () => {
  const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.__mode = 'bp429';
      w.__attempts = 0;
      w.fetch = function (url, o) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        if (p === '/api/sync') {
          w.__attempts += 1;
          if (w.__mode === 'bp429')
            return Promise.resolve(jres({ ok: false, code: 'sync_backpressure', retry_after_s: 3 }, 429));
          let body = null; try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) {}
          const ops = (body && body.ops) || [];
          return Promise.resolve(jres({ results: ops.map(op => ({ uid: op.uid, ok: true })) }, 200));
        }
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);
  assert(W('SYNC.demoMode') === false && W('SYNC.serverUrl') === '/api/sync', 'server mode precondition');
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' }; SYNC.online = true;`);
  const uids = JSON.parse(W(`JSON.stringify((function(){
    var u=[]; for(var i=0;i<4;i++){ u.push(enqueueOp({t:'ins',c:'visitors',data:{school_id:1,name:'bp6-'+i},by:5}).uid); }
    return u; })())`));
  const statusOf = (uid) => W(`(function(){ var x=SYNC.queue.find(function(y){ return y.uid==='${uid}'; }); return x?x.status:'gone'; })()`);
  /* دورِ اول: 429 */
  W(`window.__sc=false; syncNow(true).then(function(){window.__sc=true;},function(){window.__sc='err';});`);
  for (let i = 0; i < 200 && W('window.__sc') !== true; i++) await sleep(100);
  assert(W('window.__sc') === true, 'first sync cycle completed');
  assert(W('window.__attempts') === 1, 'one POST was made, got ' + W('window.__attempts'));
  assert(uids.every(u => statusOf(u) === 'pending'), 'all ops stay PENDING (not failed/DLQ), got ' + JSON.stringify(uids.map(statusOf)));
  assert(W('SYNC.attempts') >= 1, 'attempts counter advanced for backoff, got ' + W('SYNC.attempts'));
  assert(W('SYNC.autoTimer') !== null && W('SYNC.autoTimer') !== undefined, 'a retry was scheduled');
  assert(String(W('SYNC.lastError')).indexOf('فشار') > -1, 'lastError mentions backpressure, got ' + W('SYNC.lastError'));
  /* دورِ دوم: بهبود — سرور جوابِ ۲۰۰ می‌دهد */
  W(`window.__mode='ok';`);
  W(`clearTimeout(SYNC.autoTimer); window.__sc=false; syncNow(true).then(function(){window.__sc=true;},function(){window.__sc='err';});`);
  for (let i = 0; i < 200 && W('window.__sc') !== true; i++) await sleep(100);
  assert(W('window.__sc') === true, 'recovery cycle completed');
  assert(uids.every(u => statusOf(u) === 'gone'), 'all ops synced and removed from queue, got ' + JSON.stringify(uids.map(statusOf)));
  dom.window.close();
});


/* ═══════════════ گپ ۲ — Delta Compression ═══════════════ */
group('گپ ۲ — فشرده‌سازیِ پاسخِ دلتا (gzip/brotli)');

/* فیکسچر بزرگ: پاسخِ کامل چند صد کیلوبایت JSON پرتکرار (شبیهِ دلتای واقعی) */
function bigStore() {
  const store = { __deleted_records: [], __server_version: 42 };
  const rows = [];
  for (let i = 1; i <= 3000; i++) {
    rows.push({ id: i, school_id: 1, class_id: i % 30, student_id: 1000 + i,
      subject_id: i % 12, teacher_id: 20 + (i % 7), score: (i * 7) % 20,
      ref: 'grade-row-' + i + '-of-big-fixture', note: 'توضیح تکرارشونده برای فشرده‌شدن خوب ' + (i % 40),
      created_at: iso(Date.now() - 30 * 864e5), updated_at: iso(Date.now() - 30 * 864e5) });
  }
  store.grades = rows;
  return store;
}
function mkPullCtx(o) {
  o = o || {};
  const store = o.store || bigStore();
  const cap = {};
  const rawRes = () => {
    const r = { _chunks: [], _head: null, _headers: {} };
    r.setHeader = (k, v) => { r._headers[String(k).toLowerCase()] = String(v); };
    r.writeHead = (status, headers) => { r._head = { status, headers: headers || {} }; };
    r.end = (buf) => { r._chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))); };
    Object.defineProperty(r, '_body', { get() { return Buffer.concat(this._chunks); } });
    return r;
  };
  const controller = createPull({
    store, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._head = { status: code, headers: { 'Content-Type': 'application/json' } }; res._chunks = [Buffer.from(JSON.stringify(body))]; },
    cursor: createCursor({ secret: 'k'.repeat(64) })
  });
  return { store, cap, rawRes, pull: async (req) => { const r = rawRes(); await controller.apiPull(req || { url: '/api/v1/pull', headers: {} }, r); return r; } };
}

await test('CM1 پاسخِ بزرگ با Accept-Encoding: gzip ← فشرده و بازشدنی', async () => {
  const { pull } = mkPullCtx();
  const res = await pull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert(res._head && res._head.status === 200, 'status 200');
  assert(res._head.headers['Content-Encoding'] === 'gzip', 'Content-Encoding: gzip');
  assert(res._head.headers['Vary'] === 'Accept-Encoding', 'Vary header for caches');
  const body = zlib.gunzipSync(res._body);
  const parsed = JSON.parse(body.toString('utf8'));
  assert(parsed.ok === true && Array.isArray(parsed.collections.grades) && parsed.collections.grades.length === 3000,
    'gunzip => same JSON with 3000 grade rows');
  const raw = body.length, wire = res._body.length;
  assert(wire < raw / 4, `gzip must cut size at least 4x (raw=${raw}, wire=${wire})`);
  const t0 = process.hrtime.bigint();
  JSON.parse(body.toString('utf8'));
  const parseMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`     حجم: خام=${(raw / 1024).toFixed(1)}KB · gzip=${(wire / 1024).toFixed(1)}KB (${(100 * wire / raw).toFixed(0)}%) · parse=${parseMs.toFixed(1)}ms`);
});

await test('CM2 فقط brotli ← br فشرده می‌کند (کیفیت ۵)', async () => {
  const { pull } = mkPullCtx();
  const res = await pull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'br' } });
  assert(res._head.headers['Content-Encoding'] === 'br', 'Content-Encoding: br');
  const body = zlib.brotliDecompressSync(res._body);
  const parsed = JSON.parse(body.toString('utf8'));
  assert(parsed.collections.grades.length === 3000, 'brotli roundtrip');
  console.log(`     brotli=${(res._body.length / 1024).toFixed(1)}KB در برابر خام=${(body.length / 1024).toFixed(1)}KB`);
});

await test('CM3 بدونِ Accept-Encoding ← نافشرده (سازگاریِ کلاینتِ قدیمی)', async () => {
  const { pull } = mkPullCtx();
  const res = await pull({ url: '/api/v1/pull', headers: {} });
  assert(res._head.status === 200, 'status 200');
  assert(!res._head.headers['Content-Encoding'], 'no Content-Encoding');
  const parsed = JSON.parse(res._body.toString('utf8'));
  assert(parsed.collections.grades.length === 3000, 'plain JSON served');
});

await test('CM4 پاسخِ کوچک زیرِ آستانه ← نافشرده (سربارِ هدر بی‌صرفه)', async () => {
  const store = { __deleted_records: [], __server_version: 1, grades: [{ id: 1, school_id: 1, created_at: iso(Date.now()), updated_at: iso(Date.now()) }] };
  const { pull } = mkPullCtx({ store });
  const res = await pull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'gzip' } });
  assert(res._head.status === 200, 'status 200');
  assert(!res._head.headers['Content-Encoding'], 'small body stays uncompressed');
});

await test('CM5 res بدونِ writeHead (هارنس قدیمی) ← sendJson نافشرده', async () => {
  const store = bigStore();
  const controller = createPull({
    store, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    cursor: createCursor({ secret: 'k'.repeat(64) })
  });
  const res = {}; /* هارنسِ موج ۴ — بدون writeHead/end */
  await controller.apiPull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'gzip' } }, res);
  assert(res._cap && res._cap.code === 200, 'legacy harness still works via sendJson');
  assert(Array.isArray(res._cap.body.collections.grades), 'full JSON body delivered');
});

await test('CM6 متریک‌های حجم: خام/سیم ثبت شدند و فشرده شمرده شد', async () => {
  const beforeC = counterValue('payesh_sync_delta_compressions_total');
  const { pull } = mkPullCtx();
  await pull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'gzip' } });
  const afterC = counterValue('payesh_sync_delta_compressions_total');
  assert(afterC > beforeC, 'compressions_total{gzip} incremented (' + beforeC + '→' + afterC + ')');
  const sizeSnap = metrics.snapshot()['payesh_sync_delta_size_bytes'];
  const wireSnap = metrics.snapshot()['payesh_sync_delta_wire_bytes'];
  assert(sizeSnap && sizeSnap.series.length > 0, 'delta_size_bytes observed');
  assert(wireSnap && wireSnap.series.length > 0, 'delta_wire_bytes observed');
});


/* ═══════════════ گپ ۳ — Cursor Warmup ═══════════════ */
group('گپ ۳ — کلیدِ کرسرِ پایدار (restart-safe)');

await test('CW1 شبیه‌سازیِ restart: توکنِ boot1 در boot2 هنوز verify می‌شود؛ TTL هم می‌میرد', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-cw1-'));
  const keyFile = path.join(tmp, 'jwt.key');
  /* دقیقاً جریانِ index.js: read-or-create با mode 600 */
  const bootKey = () => {
    if (fs.existsSync(keyFile)) return fs.readFileSync(keyFile, 'utf8').trim();
    const k = require('crypto').randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, k, { mode: 0o600 });
    return k;
  };
  const k1 = bootKey();                     /* boot 1 — keyfile ساخته می‌شود */
  const c1 = createCursor({ secret: k1 });
  assert(c1.enabled && c1.keySource === 'explicit', 'boot1 cursor enabled');
  const since = iso(Date.now() - 60e3);
  const tok = c1.sign(since);
  assert(!!tok, 'boot1 signed a cursor');
  const k2 = bootKey();                     /* boot 2 — همان keyfile خوانده می‌شود */
  assert(k1 === k2, 'keyfile is the SAME key across boots (persistence)');
  const c2 = createCursor({ secret: k2 });
  const v = c2.verify(tok);
  assert(v.ok === true && v.payload.since === since, 'boot2 verifies boot1 token — warmup gap closed');
  /* TTL پس از restart هم اعمال می‌شود (ساعتِ جلو‌رفته) */
  const c3 = createCursor({ secret: k2, ttlS: 60, now: () => Math.floor(Date.now() / 1000) + 7200 });
  const vExpired = c3.verify(tok);
  assert(vExpired.ok === false && vExpired.code === 'cursor_expired', 'expired token still rejected after restart, got ' + JSON.stringify(vExpired));
  fs.rmSync(tmp, { recursive: true, force: true });
});

await test('CW2 keySource: explicit / env_cursor / env_jwt / none + هشدارِ رازِ کوتاه', async () => {
  const hadC = process.env.PAYESH_CURSOR_SECRET, hadJ = process.env.PAYESH_JWT_SECRET;
  const warns = [];
  const origWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    process.env.PAYESH_CURSOR_SECRET = ''; delete process.env.PAYESH_CURSOR_SECRET;
    process.env.PAYESH_JWT_SECRET = ''; delete process.env.PAYESH_JWT_SECRET;
    let c = createCursor({});
    assert(c.enabled === false && c.keySource === 'none', 'none => disabled, got ' + c.keySource);

    process.env.PAYESH_JWT_SECRET = 'j'.repeat(45);
    c = createCursor({});
    assert(c.enabled === true && c.keySource === 'env_jwt', 'env_jwt wins when no cursor secret, got ' + c.keySource);

    process.env.PAYESH_CURSOR_SECRET = 'c'.repeat(50);
    c = createCursor({});
    assert(c.enabled === true && c.keySource === 'env_cursor', 'env_cursor has priority over env_jwt, got ' + c.keySource);

    c = createCursor({ secret: 'x'.repeat(33) });
    assert(c.enabled === true && c.keySource === 'explicit', 'explicit wins overall, got ' + c.keySource);

    /* رازِ کوتاه: سقوط به منبعِ بعدی + هشدارِ بلند */
    process.env.PAYESH_CURSOR_SECRET = 'short';
    c = createCursor({});
    assert(c.enabled === true && c.keySource === 'env_jwt', 'short cursor secret falls through, got ' + c.keySource);
    assert(warns.some(w => w.indexOf('PAYESH_CURSOR_SECRET') > -1 && w.indexOf('32') > -1), 'misconfig warning emitted, got ' + JSON.stringify(warns));
  } finally {
    console.warn = origWarn;
    if (hadC != null) process.env.PAYESH_CURSOR_SECRET = hadC; else { process.env.PAYESH_CURSOR_SECRET = ''; delete process.env.PAYESH_CURSOR_SECRET; }
    if (hadJ != null) process.env.PAYESH_JWT_SECRET = hadJ; else { process.env.PAYESH_JWT_SECRET = ''; delete process.env.PAYESH_JWT_SECRET; }
  }
});

/* بوتِ واقعیِ سرور به‌عنوان فرآیندِ جدا — دوبار، با همان keyfile */
function bootServer(tmp, port) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, {
      PAYESH_STORE: path.join(tmp, 'store.json'),
      PAYESH_AUDIT: path.join(tmp, 'audit.log'),
      PAYESH_KEY: path.join(tmp, 'jwt.key'),
      PORT: String(port),
      PAYESH_DEMO_CODE: '1',
      PAYESH_ENV: '', REDIS_URL: '', NODE_ENV: ''
    });
    delete env.PAYESH_CURSOR_SECRET; delete env.PAYESH_JWT_SECRET;
    delete env.PAYESH_ENV; delete env.REDIS_URL; delete env.NODE_ENV;
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('boot timeout: ' + out.slice(-300))); } }, 25000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (!done && out.indexOf(':' + port) > -1) { done = true; clearTimeout(t); resolve({ child, log: out }); }
    });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('exit', (code) => { if (!done) { done = true; clearTimeout(t); reject(new Error('early exit ' + code + ': ' + out.slice(-300))); } });
  });
}
const killServer = (c) => new Promise((r) => { if (!c || c.exitCode != null) return r(); c.on('exit', r); try { c.kill('SIGTERM'); } catch (e) { try { c.kill('SIGKILL'); } catch (e2) { r(); } } setTimeout(r, 5000); });

await test('CW3 بوتِ واقعی ×۲ با همان keyfile: /api/health بلوکِ cursor می‌دهد و کلید بینِ restart یکی است', async () => {
  const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(REAL_STORE)) { console.log('     ⏭️  store موجود نیست (node server/seed.js) — طبقِ الگوی wave15 رد می‌شود'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-cw3-'));
  fs.copyFileSync(REAL_STORE, path.join(tmp, 'store.json'));
  const port = 41700 + Math.floor(Math.random() * 200);
  let b1, b2;
  try {
    b1 = await bootServer(tmp, port);
    assert(b1.log.indexOf('cursor : enabled') > -1 && b1.log.indexOf('key=keyfile') > -1, 'boot1 log announces cursor key source, got: ' + b1.log.split('\n').filter(l => l.indexOf('cursor') > -1).join(' | '));
    let r = await fetch('http://127.0.0.1:' + port + '/api/health');
    let body = await r.json();
    assert(body.cursor && body.cursor.enabled === true && body.cursor.persistent === true && body.cursor.key_source === 'keyfile',
      'boot1 health cursor block, got ' + JSON.stringify(body.cursor));
    /* توکنِ صادرشده در دورِ boot1 (با کلیدِ keyfile) */
    const key1 = fs.readFileSync(path.join(tmp, 'jwt.key'), 'utf8').trim();
    const c1 = createCursor({ secret: key1 });
    const tok = c1.sign(iso(Date.now() - 30e3));
    await killServer(b1.child);

    b2 = await bootServer(tmp, port);      /* restart — همان keyfile، همان پورت */
    r = await fetch('http://127.0.0.1:' + port + '/api/health');
    body = await r.json();
    assert(body.cursor && body.cursor.enabled === true && body.cursor.key_source === 'keyfile', 'boot2 identical cursor block, got ' + JSON.stringify(body.cursor));
    const key2 = fs.readFileSync(path.join(tmp, 'jwt.key'), 'utf8').trim();
    const c2 = createCursor({ secret: key2 });
    const v = c2.verify(tok);
    assert(v.ok === true, 'cursor issued before the restart still verifies after it (within TTL)');
  } finally {
    await killServer(b1 && b1.child); await killServer(b2 && b2.child);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


/* ═══════════════ گپ ۴ — Sync Metrics ═══════════════ */
group('گپ ۴ — سنجه‌های sync در سلامت');

await test('MX1 helper واحد: جمعِ سری‌ها + میانگینِ هیستوگرام + صفرِ ایمن', async () => {
  const fakeSnap = {
    'payesh_sync_pulls_total': { series: [
      { labels: { mode: 'delta' }, value: 7 },
      { labels: { mode: 'full' }, value: 3 }
    ] },
    'payesh_sync_pushes_total': { series: [{ labels: {}, value: 12 }] },
    'payesh_sync_delta_size_bytes': { series: [{ labels: {}, count: 2, sum: 3072 }] },
    'payesh_sync_delta_wire_bytes': { series: [] }
  };
  const st = metrics.syncHealthStats(fakeSnap);
  assert(st.pulls_total === 10 && st.pulls_delta === 7 && st.pulls_full === 3, 'labeled series summed, got ' + JSON.stringify(st.pulls_total) + '/' + st.pulls_delta + '/' + st.pulls_full);
  assert(st.pushes_total === 12, 'pushes summed');
  assert(st.delta_size_bytes_avg === 1536, 'histogram avg = sum/count, got ' + st.delta_size_bytes_avg);
  assert(st.delta_wire_bytes_avg === null, 'empty histogram => null (not NaN)');
  assert(st.conflicts_total === 0 && st.cursor_expired_total === 0, 'missing metrics => 0');
  const empty = metrics.syncHealthStats({});
  assert(empty.pulls_total === 0 && empty.delta_size_bytes_avg === null, 'empty snapshot => safe zeros');
});

await test('MX2 پول: full و delta هر دو شمرده می‌شوند + حجم دلتا مشاهده شد', async () => {
  const { pull } = mkPullCtx();
  const before = metrics.syncHealthStats(metrics.snapshot());
  await pull({ url: '/api/v1/pull', headers: {} });                        /* بدونِ since = full */
  const mid = metrics.syncHealthStats(metrics.snapshot());
  assert(mid.pulls_full === before.pulls_full + 1, 'full pull counted, got ' + before.pulls_full + '→' + mid.pulls_full);
  const c = createCursor({ secret: 'k'.repeat(64) });
  const tok = c.sign(iso(Date.now() - 5000));
  await pull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(tok), headers: {} }); /* کرسرِ تازه = delta */
  const after = metrics.syncHealthStats(metrics.snapshot());
  assert(after.pulls_delta === mid.pulls_delta + 1, 'delta pull counted');
  assert(after.delta_size_bytes_avg != null && after.delta_size_bytes_avg > 0, 'delta size observed, got ' + after.delta_size_bytes_avg);
});

await test('MX3 پوشِ غیرخالی شمرده می‌شود؛ خالی نه؛ کرسرِ منقضی شمرده می‌شود', async () => {
  const { ctx } = makeSyncCtx({});
  const s = createSync(ctx);
  const before = metrics.syncHealthStats(metrics.snapshot());
  const r0 = mkRes(); await s.apiSync({}, r0, { ops: [] });
  assert(r0._cap.code === 200, 'empty batch is a 200');
  let now = metrics.syncHealthStats(metrics.snapshot());
  assert(now.pushes_total === before.pushes_total, 'empty batch must NOT count as a push, got ' + before.pushes_total + '→' + now.pushes_total);
  const r1 = mkRes(); await s.apiSync({}, r1, { ops: mkOps(3, 'mx3') });
  assert(r1._cap.code === 200, 'non-empty batch 200');
  now = metrics.syncHealthStats(metrics.snapshot());
  assert(now.pushes_total === before.pushes_total + 1, 'non-empty push counted');
  /* کرسرِ منقضی: امضا با ttl کوتاه + ساعتِ جلو */
  const c = createCursor({ secret: 'k'.repeat(64), ttlS: 60, now: () => Math.floor(Date.now() / 1000) - 7200 });
  const tok = c.sign(iso(Date.now() - 7200e3));
  const { pull } = mkPullCtx();
  const beforeExp = metrics.syncHealthStats(metrics.snapshot());
  const ctl = createPull({
    store: { __deleted_records: [], __server_version: 1, grades: [] }, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    cursor: createCursor({ secret: 'k'.repeat(64) })
  });
  const res = { _cap: null };
  await ctl.apiPull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(tok), headers: {} }, res);
  assert(res._cap.code === 401 && res._cap.body.code === 'cursor_expired', 'expired cursor rejected 401, got ' + JSON.stringify(res._cap && res._cap.body));
  const afterExp = metrics.syncHealthStats(metrics.snapshot());
  assert(afterExp.cursor_expired_total === beforeExp.cursor_expired_total + 1, 'cursor_expired counted');
});

await test('MX4 بوتِ واقعی: /api/health بلوکِ sync با کلِ شکل می‌دهد', async () => {
  const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
  if (!fs.existsSync(REAL_STORE)) { console.log('     ⏭️  store موجود نیست — رد می‌شود'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-mx4-'));
  fs.copyFileSync(REAL_STORE, path.join(tmp, 'store.json'));
  const port = 41700 + Math.floor(Math.random() * 200);
  let b1;
  try {
    b1 = await bootServer(tmp, port);
    const r = await fetch('http://127.0.0.1:' + port + '/api/health');
    const body = await r.json();
    assert(body.sync && typeof body.sync === 'object', 'health.sync present, got ' + JSON.stringify(body.sync));
    for (const k of ['pulls_total', 'pulls_delta', 'pulls_full', 'pushes_total', 'conflicts_total',
                     'backpressure_rejections_total', 'cursor_expired_total', 'cursor_region_mismatch_total',
                     'delta_size_bytes_avg', 'delta_wire_bytes_avg', 'compressions_total']) {
      assert(body.sync[k] === 0 || body.sync[k] === null || typeof body.sync[k] === 'number', 'sync.' + k + ' is numeric/null, got ' + JSON.stringify(body.sync[k]));
    }
    assert(body.cursor && body.cursor.key_source, 'cursor block still present alongside sync');
  } finally {
    await killServer(b1 && b1.child);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


/* ═══════════════ گپ ۵ — Multi-Region Ready ═══════════════ */
group('گپ ۵ — کرسرِ region-aware (v2)');

const SECRET5 = 'r'.repeat(64);
const withRegion = (rg, fn) => {
  const had = process.env.PAYESH_REGION;
  if (rg === null) { delete process.env.PAYESH_REGION; } else { process.env.PAYESH_REGION = rg; }
  try { return fn(); } finally {
    if (had != null) process.env.PAYESH_REGION = had; else delete process.env.PAYESH_REGION;
  }
};
const decodeTok = (tok) => JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8'));
const v1Token = (secret, sinceIso, ttlS, iatOffsetS) => {
  /* توکنِ v1ِ دست‌ساز دقیقاً با طرحِ مستندِ فاز ۲ (بدونِ rg) */
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('payesh.cursor.v1|' + secret).digest('hex');
  const iat = Math.floor(Date.now() / 1000) + (iatOffsetS || 0);
  const payload = { v: 1, since: sinceIso, iat, exp: iat + (ttlS || 3600), jti: crypto.randomBytes(8).toString('hex') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update('pc1.' + body).digest().toString('base64url');
  return 'pc1.' + body + '.' + sig;
};

await test('MR1 امضا: payload v3 (rg از PAYESH_REGION + cw اختیاری Wave 10)', async () => {
  const tok = withRegion('eu-1', () => createCursor({ secret: SECRET5 }).sign(iso(Date.now() - 1000)));
  const pl = decodeTok(tok);
  assert(pl.v === 3 && pl.rg === 'eu-1', 'v3 payload with rg=eu-1, got ' + JSON.stringify(pl));
  assert(pl.since && pl.iat && pl.exp && pl.jti, 'v1 fields all preserved');
  assert(!('cw' in pl), 'sign بدونِ cw ⇒ کلید نیست (مسیرِ زمانی), got ' + JSON.stringify(pl));
  const tokCw = withRegion('eu-1', () => createCursor({ secret: SECRET5 }).sign(iso(Date.now() - 1000), null, 4711));
  const plCw = decodeTok(tokCw);
  assert(plCw.v === 3 && plCw.cw === 4711, 'sign با cw ⇒ v3+cw, got ' + JSON.stringify(plCw));
  const tokDef = withRegion(null, () => createCursor({ secret: SECRET5 }).sign(iso(Date.now() - 1000)));
  assert(decodeTok(tokDef).rg === 'default', 'default region when env unset, got ' + decodeTok(tokDef).rg);
});

await test('MR2 توکنِ v2 در منطقهٔ دیگر ← 401 region_mismatch + full_pull + متریک', async () => {
  const tok = withRegion('eu-1', () => createCursor({ secret: SECRET5 }).sign(iso(Date.now() - 1000)));
  /* verify در منطقهٔ دیگر */
  const v = withRegion('ap-1', () => createCursor({ secret: SECRET5 }).verify(tok));
  assert(v.ok === false && v.code === 'region_mismatch', 'cross-region v2 rejected, got ' + JSON.stringify(v));
  const vSame = withRegion('eu-1', () => createCursor({ secret: SECRET5 }).verify(tok));
  assert(vSame.ok === true, 'same-region v2 still verifies');
  /* مسیرِ کاملِ pull — قراردادِ 401 که کلاینتِ 29-pull.js عمومی پردازشش می‌کند */
  const before = metrics.syncHealthStats(metrics.snapshot());
  const store = { __deleted_records: [], __server_version: 1, grades: [] };
  const ctl = withRegion('ap-1', () => createPull({
    store, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    cursor: createCursor({ secret: SECRET5 })
  }));
  const res = { _cap: null };
  await ctl.apiPull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(tok), headers: {} }, res);
  assert(res._cap.code === 401, 'pull rejects with 401, got ' + res._cap.code);
  assert(res._cap.body.code === 'region_mismatch' && res._cap.body.cursor_renewal === 'full_pull',
    'machine contract: region_mismatch + cursor_renewal full_pull, got ' + JSON.stringify(res._cap.body));
  const after = metrics.syncHealthStats(metrics.snapshot());
  assert(after.cursor_region_mismatch_total === before.cursor_region_mismatch_total + 1, 'region_mismatch metric counted');
});

await test('MR3 دورهٔ گذار: توکنِ v1 (بدونِ rg) تا TTL خودش قبول می‌شود', async () => {
  const tok = v1Token(SECRET5, iso(Date.now() - 1000), 3600);
  const v = withRegion('ap-1', () => createCursor({ secret: SECRET5 }).verify(tok));
  assert(v.ok === true && v.payload.v === 1, 'v1 token accepted during grace in ANY region, got ' + JSON.stringify(v));
  const tokDead = v1Token(SECRET5, iso(Date.now() - 7200e3), 3600, -7200); /* iat در گذشته ⇒ exp گذشته */
  const vDead = withRegion('ap-1', () => createCursor({ secret: SECRET5 }).verify(tokDead));
  assert(vDead.ok === false && vDead.code === 'cursor_expired', 'v1 grace is still TTL-bound, got ' + JSON.stringify(vDead));
});

await test('MR4 v2 بدونِ rg یا با rg غیررشته‌ای ← cursor_invalid (نه mismatch)', async () => {
  /* دست‌کاری‌شده: v2 بدونِ rg ولی با امضای معتبر — باید invalid بخورد */
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('payesh.cursor.v1|' + SECRET5).digest('hex');
  const iat = Math.floor(Date.now() / 1000);
  const payload = { v: 2, since: iso(Date.now() - 1000), iat, exp: iat + 3600, jti: 'deadbeefdeadbeef' };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update('pc1.' + body).digest().toString('base64url');
  const v = withRegion('eu-1', () => createCursor({ secret: SECRET5 }).verify('pc1.' + body + '.' + sig));
  assert(v.ok === false && v.code === 'cursor_invalid', 'v2 without rg => invalid (fail-closed), got ' + JSON.stringify(v));
});

/* ═══════════════ خلاصه ═══════════════ */
console.log('\n────────────────────────────────────────────────────────');
if (fail === 0) {
  console.log(`نتیجه Delta Phase 4: ${pass}/${pass}  —  بدون خطا ✅`);
} else {
  console.log(`نتیجه Delta Phase 4: ${pass}/${pass + fail}  —  ${fail} خطا ❌`);
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.msg}`);
}
process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
