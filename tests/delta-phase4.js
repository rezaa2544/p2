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
