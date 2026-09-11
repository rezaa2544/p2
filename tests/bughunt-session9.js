#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   bughunt-session9.js — Bug Hunt چت ۵، نشست ۹
   آدیتِ PR #71 (Delta Phase 4) · PR #77 (a11y keyboard) · PR #78 (WAL drill)
   ───────────────────────────────────────────────────────────────────
   گروه A — S9-1: ترتیبِ верdict در کرسرِ v2 (fail-closed)
     A1 توکنِ جعلیِ v2 با rgِ منطقهٔ دیگر ⇒ cursor_invalid (نه region_mismatch)
        — امضا باید *پیش از* هر داوریِ معنایی بررسی شود (قراردادِ خودِ ماژول:
        «signature first — expired-but-forged is invalid»). پیش از رفع: قرمز.
     A2 توکنِ اصیلِ بین‌منطقه‌ای ⇒ همچنان region_mismatch (رگرسیون‌گارد)
     A3 توکنِ v2 هم‌منطقه ⇒ ok
     A4 سطحِ pull: توکنِ جعلیِ بین‌منطقه ⇒ 401 cursor_invalid و شمارندهٔ
        payesh_cursor_region_mismatch_total **تکان نمی‌خورد** (مسموم‌سازیِ
        متریکِ سلامت با توکنِ جعلی بسته شود). پیش از رفع: قرمز.
     A5 توکنِ v1 در دورهٔ گذار ⇐ همچنان پذیرفته می‌شود
     A6 توکنِ منقضی ⇒ cursor_expired (سطحِ verify و سطحِ pull)
     A7 توکنِ بدساخت/غیررشته‌ای/سرآیندِ غلط ⇒ cursor_invalid؛ بی‌کلید ⇒ cursor_unavailable
   گروه B — S9-2: مذاکرهٔ Accept-Encoding باید q=0 را بفهمد
     B1 gzip;q=0 ⇒ هیچ (پیش از رفع: gzip می‌فرستاد — نقضِ صریحِ کلاینت)
     B2 gzip;q=0, br ⇒ br (پیش از رفع: gzip)
     B3 br;q=0 ⇒ هیچ (پیش از رفع: br)
     B4 حروفِ بزرگ (GZIP) ⇒ gzip (پیش از رفع: هیچ)
     B5 * ⇒ gzip · *;q=0 ⇒ هیچ
     B6 مسیرهای مثبتِ پیشین دست‌نخورده (gzip, deflate, br ⇒ gzip · br ⇒ br)
   گروه C — S9-3: فشرده‌سازی نباید حلقهٔ رویداد را قفل کند (بار بالا)
     C~ sendJsonCompressed باید async باشد و بینِ کار به حلقهٔ رویداد نفس بدهد
        (gzipSync روی دلتای ده‌ها مگابایتی صدها میلی‌ثانیه قفل می‌کرد).
        پیش از رفع: قرمز.
     C2 درستیِ خروجی: gunzip ⇒ همان JSON · Vary/Content-Encoding · اعدادِ متریک
     C3 هارنسِ قدیمی (بدونِ writeHead) ⇒ همان مسیرِ sendJson (سازگاری)
     C4 بدنهٔ سریال‌نشدنی ⇒ fallbackِ نافشرده (پاسخ هرگز نمی‌میرد)
     C5 کرشِ میانهٔ نوشتن (writeHead پرتاب) ⇒ همان fallback
     C6 مسیرِ کاملِ pull: awaitِ فشرده‌سازی + بازشدنِ بدنه + سنجه‌های حجم
     C7 مسیرِ brotli (کیفیت ۵) و C8 آستانهٔ کمینه (min bytes)
   گروه D — پینِ رگرسیونِ سطوحِ آدیت‌شده (سبزِ پایه — محافظت از کدِ سالم)
     D1 429 backpressure: کد + Retry-After + هیچ op اعمال نمی‌شود
     D2 checkRateLimit وزن‌دار: weight=N مصرفِ N واحد (fallbackِ حافظه)
     D3 incrByWithTtl: کلمپِ مقدار + برگرداندنِ عدد
     D4 خطای موتورِ نرخ = fail-open (۲۰۰)
   اجرا: node tests/bughunt-session9.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const { createCursor, resolveSecret } = require(path.join(ROOT, 'server', 'cursor'));
const { sendJsonCompressed, negotiateEncoding } = require(path.join(ROOT, 'server', 'compress'));
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { createSync, attach } = require(path.join(ROOT, 'server', 'sync'));
const redis = require(path.join(ROOT, 'server', 'redis'));
const metrics = require(path.join(ROOT, 'server', 'metrics'));
const { opX } = require('./helpers/opx');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
const group = (t) => console.log(`\n▸ ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (t) => new Date(t).toISOString();
/* هم شمارنده (value) و هم هیستوگرام (count/sum) را می‌فهمد — سنجه‌های حجمی
   هیستوگرام‌اند و جمعِ «sum» معنا دارد. */
const counterValue = (name, field) => {
  const snap = metrics.snapshot()[name];
  if (!snap || !Array.isArray(snap.series)) return 0;
  return snap.series.reduce((a, s) => a + (Number(s[field || 'value'] ?? s.sum) || 0), 0);
};
const b64u = (s) => Buffer.from(s).toString('base64url');
/* ساختِ توکنِ دلخواه با کلیدِ مشتق‌شده — برای سناریوهای جعل (آدم‌ورزی) */
const mintToken = (secret, payloadObj) => {
  const key = resolveSecret(secret);
  const body = b64u(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', key).update('pc1.' + body).digest();
  return 'pc1.' + body + '.' + Buffer.from(sig).toString('base64url');
};
const SECRET = 's9-secret-'.repeat(6);            /* >=۳۲ بایت */
const REGION_A = 'region-a';
const oldRegion = process.env.PAYESH_REGION;

(async () => {

/* ═══════════════ A — S9-1: ترتیبِ داوریِ کرسرِ v2 ═══════════════ */
group('S9-1 — ترتیبِ verify در کرسرِ v2 (امضا پیش از داوریِ منطقه)');
process.env.PAYESH_REGION = REGION_A;

await test('A1 توکنِ جعلیِ v2 با rgِ منطقهٔ دیگر ⇒ cursor_invalid (نه region_mismatch)', async () => {
  const c = createCursor({ secret: SECRET });
  const nowS = Math.floor(Date.now() / 1000);
  const forged = 'pc1.' + b64u(JSON.stringify({ v: 2, since: iso(Date.now() - 3600e3), iat: nowS, exp: nowS + 3600, jti: 'aa'.repeat(8), rg: 'region-b' }))
    + '.' + b64u('forged-signature-not-valid!');
  const v = c.verify(forged);
  assert(v.ok === false, 'must be rejected');
  assert(v.code === 'cursor_invalid', 'امضا نامعتبر است ⇒ باید cursor_invalid باشد، نه ' + v.code);
});

await test('A2 توکنِ اصیلِ بین‌منطقه‌ای (امضای درست، rgِ دیگر) ⇒ region_mismatch', async () => {
  const c = createCursor({ secret: SECRET });
  const nowS = Math.floor(Date.now() / 1000);
  const genuineOtherRegion = mintToken(SECRET, { v: 2, since: iso(Date.now() - 3600e3), iat: nowS, exp: nowS + 3600, jti: 'bb'.repeat(8), rg: 'region-b' });
  const v = c.verify(genuineOtherRegion);
  assert(v.ok === false && v.code === 'region_mismatch', 'توکنِ اصیلِ منطقهٔ دیگر باید region_mismatch بدهد، گرفت: ' + JSON.stringify(v));
});

await test('A3 توکنِ v2 هم‌منطقه ⇒ ok و since سالم', async () => {
  const c = createCursor({ secret: SECRET });
  const since = iso(Date.now() - 600e3);
  const v = c.verify(c.sign(since));
  assert(v.ok === true && v.payload.since === since && v.payload.rg === REGION_A, 'roundtrip v2 بایست سالم باشد: ' + JSON.stringify(v).slice(0, 160));
});

await test('A4 سطحِ pull: توکنِ جعلیِ بین‌منطقه ⇒ 401 cursor_invalid و متریکِ منطقه دست‌نخورده', async () => {
  const before = counterValue('payesh_cursor_region_mismatch_total');
  const store = { __deleted_records: [], __server_version: 1, grades: [] };
  const controller = createPull({
    store, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    cursor: createCursor({ secret: SECRET })
  });
  const nowS = Math.floor(Date.now() / 1000);
  const forged = 'pc1.' + b64u(JSON.stringify({ v: 2, since: iso(Date.now() - 3600e3), iat: nowS, exp: nowS + 3600, jti: 'cc'.repeat(8), rg: 'region-b' }))
    + '.' + b64u('forged-signature-not-valid!');
  const res = {};
  await controller.apiPull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(forged), headers: {} }, res);
  assert(res._cap && res._cap.code === 401, 'باید 401 بدهد، گرفت: ' + JSON.stringify(res._cap && res._cap.code));
  assert(res._cap.body.code === 'cursor_invalid', 'کدِ خطا باید cursor_invalid باشد، نه ' + res._cap.body.code);
  const after = counterValue('payesh_cursor_region_mismatch_total');
  assert(after === before, 'متریکِ region_mismatch نباید با توکنِ جعلی جلو برود (' + before + '→' + after + ')');
});

await test('A5 توکنِ v1 (دورهٔ گذار) ⇒ همچنان پذیرفته می‌شود', async () => {
  const c = createCursor({ secret: SECRET });
  const nowS = Math.floor(Date.now() / 1000);
  const v1 = mintToken(SECRET, { v: 1, since: iso(Date.now() - 600e3), iat: nowS, exp: nowS + 3600, jti: 'dd'.repeat(8) });
  const v = c.verify(v1);
  assert(v.ok === true, 'v1 باید در گذار پذیرفته شود: ' + JSON.stringify(v));
});

await test('A6 توکنِ منقضی (TTL گذشته) ⇒ cursor_expired — و در سطحِ pull هم 401 با همان کد', async () => {
  /* ساعتِ امضاکننده ۲ ساعت عقب: توکن با ttl=۶۰ ثانیه صادر شده و بی‌تردید منقضی است */
  const past = createCursor({ secret: SECRET, ttlS: 60, now: () => Math.floor(Date.now() / 1000) - 7200 });
  const tok = past.sign(iso(Date.now() - 7200e3));
  const v = createCursor({ secret: SECRET }).verify(tok);
  assert(v.ok === false && v.code === 'cursor_expired', 'توکنِ منقضی باید cursor_expired بدهد: ' + JSON.stringify(v));
  const store = { __deleted_records: [], __server_version: 1, grades: [] };
  const ctl = createPull({
    store, db: null, sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    cursor: createCursor({ secret: SECRET })
  });
  const res = {};
  await ctl.apiPull({ url: '/api/v1/pull?cursor=' + encodeURIComponent(tok), headers: {} }, res);
  assert(res._cap && res._cap.code === 401 && res._cap.body.code === 'cursor_expired',
    'pull باید 401/cursor_expired بدهد: ' + JSON.stringify(res._cap && res._cap.code + '/' + (res._cap.body && res._cap.body.code)));
});

await test('A7 توکنِ بدساخت/غیررشته‌ای/سرآیندِ غلط ⇒ cursor_invalid (fail-closed)', async () => {
  const c = createCursor({ secret: SECRET });
  const cases = [
    [null, 'null'], [undefined, 'undefined'], [12345, 'number'], ['', 'empty'],
    ['not-a-token', 'no dots'], ['pc9.' + b64u('{}') + '.x', 'wrong prefix'],
    ['pc1.' + b64u('not-json') + '.' + b64u('sig'), 'payload not JSON'],
    ['pc1.' + b64u('{"v":2}') + '.', 'empty signature'],
    ['pc1.' + b64u(JSON.stringify({ v: 9, since: iso(Date.now()), iat: 0, exp: 9999999999, jti: 'x' })) + '.' + b64u('sig'), 'unknown version'],
    ['x'.repeat(5000), 'over-long'],
  ];
  for (const [tok, label] of cases) {
    const v = c.verify(tok);
    assert(v.ok === false && v.code === 'cursor_invalid', label + ' ⇒ انتظار cursor_invalid، گرفت: ' + JSON.stringify(v));
  }
  const off = createCursor({ secret: '' });
  const v2 = off.verify('pc1.abc.def');
  assert(v2.ok === false && v2.code === 'cursor_unavailable', 'بدونِ کلید ⇒ cursor_unavailable (هرگز اعتمادِ خاموش): ' + JSON.stringify(v2));
});

if (oldRegion === undefined) delete process.env.PAYESH_REGION; else process.env.PAYESH_REGION = oldRegion;

/* ═══════════════ B — S9-2: مذاکرهٔ Accept-Encoding ═══════════════ */
group('S9-2 — مذاکرهٔ Accept-Encoding (احترام به q=0)');

await test('B1 «gzip;q=0» ⇒ کلاینت صریحاً gzip را رد کرده ⇒ هیچ فشرده‌سازی', async () => {
  assert(negotiateEncoding('gzip;q=0') === null, 'گرفت: ' + negotiateEncoding('gzip;q=0'));
  assert(negotiateEncoding('gzip; q=0.0, deflate') === null, 'گرفت: ' + negotiateEncoding('gzip; q=0.0, deflate'));
});

await test('B2 «gzip;q=0, br» ⇒ fallback به brotli', async () => {
  assert(negotiateEncoding('gzip;q=0, br') === 'br', 'گرفت: ' + negotiateEncoding('gzip;q=0, br'));
});

await test('B3 «br;q=0» ⇒ هیچ', async () => {
  assert(negotiateEncoding('br;q=0') === null, 'گرفت: ' + negotiateEncoding('br;q=0'));
});

await test('B4 حروفِ بزرگ (GZIP) ⇒ gzip (هدرها case-insensitive)', async () => {
  assert(negotiateEncoding('GZIP') === 'gzip', 'گرفت: ' + negotiateEncoding('GZIP'));
});

await test('B5 «*» ⇒ gzip (سیاستِ gzip-ارجح) · «*;q=0» ⇒ هیچ', async () => {
  assert(negotiateEncoding('*') === 'gzip', 'گرفت: ' + negotiateEncoding('*'));
  assert(negotiateEncoding('*;q=0') === null, 'گرفت: ' + negotiateEncoding('*;q=0'));
});

await test('B6 مسیرهای مثبتِ پیشین دست‌نخورده‌اند', async () => {
  assert(negotiateEncoding('gzip, deflate, br') === 'gzip', 'gzip باید ارجح بماند');
  assert(negotiateEncoding('br') === 'br', 'br تنها ⇒ br');
  assert(negotiateEncoding('deflate') === null, 'deflate تنها ⇒ هیچ (سیاستِ موجود)');
  assert(negotiateEncoding('') === null && negotiateEncoding(undefined) === null, 'تهی ⇒ هیچ');
});

/* ═══════════════ C — S9-3: فشرده‌سازیِ ناهمگام ═══════════════ */
group('S9-3 — فشرده‌سازی بدونِ قفلِ حلقهٔ رویداد (بار بالا)');

const bigJson = () => {
  const rows = [];
  for (let i = 0; i < 40000; i++) rows.push({ id: i, school_id: 1, student_id: 1000 + i, score: i % 21, note: 'ردیفِ فیکسچرِ فشرده‌سازی — تکرارشونده برای نسبتِ خوب ' + (i % 40) });
  return { ok: true, collections: { grades: rows } };
};
const mkRes = () => {
  const r = { _chunks: [], _head: null };
  r.setHeader = (k, v) => { (r._headers = r._headers || {})[String(k).toLowerCase()] = String(v); };
  r.writeHead = (status, headers) => { r._head = { status, headers: headers || {} }; };
  r.end = (buf) => { r._chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))); };
  Object.defineProperty(r, '_body', { get() { return Buffer.concat(this._chunks); } });
  return r;
};

await test('C1 فشرده‌سازی به حلقهٔ رویداد نفس می‌دهد (async، نه sync-blocking)', async () => {
  const body = bigJson();
  const raw = JSON.stringify(body);
  assert(raw.length > 2e6, 'فیکسچر باید بزرگ باشد (>2MB)، بود: ' + raw.length);
  const res = mkRes();
  let ticked = false;
  const t = setTimeout(() => { ticked = true; }, 0);
  const out = sendJsonCompressed(res, { headers: { 'accept-encoding': 'gzip' } }, 200, body, (r2, c, o) => { r2._cap = { c, o }; });
  const isThenable = !!(out && typeof out.then === 'function');
  await out;
  clearTimeout(t);
  assert(isThenable, 'sendJsonCompressed باید Promise برگرداند (کارِ zlib باید ناهمگام باشد)');
  assert(ticked === true, 'تایمرِ ۰ms باید پیش از پایانِ فشرده‌سازی اجرا شود — یعنی حلقهٔ رویداد قفل نشده');
  assert(res._head && res._head.headers['Content-Encoding'] === 'gzip', 'پاسخ باید gzip باشد');
});

await test('C2 درستیِ خروجی: gunzip ⇒ همان JSON + سرآیندها + اعدادِ متریک', async () => {
  const body = bigJson();
  const res = mkRes();
  const info = await sendJsonCompressed(res, { headers: { 'accept-encoding': 'gzip' } }, 200, body, (r2, c, o) => { r2._cap = { c, o }; });
  assert(res._head.status === 200 && res._head.headers['Vary'] === 'Accept-Encoding', 'Vary/status');
  const back = JSON.parse(zlib.gunzipSync(res._body).toString('utf8'));
  assert(back.collections.grades.length === body.collections.grades.length, 'محتوای بازگشتی یکسان');
  assert(info && info.encoding === 'gzip', 'encInfo.encoding=gzip');
  assert(info.rawBytes > info.wireBytes && info.wireBytes > 0, 'حجمِ سیم باید کوچک‌تر از خام باشد: ' + JSON.stringify(info));
});

await test('C3 هارنسِ قدیمی (بدونِ writeHead) ⇒ همان مسیرِ sendJson (سازگاری)', async () => {
  const res = {};
  const out = await sendJsonCompressed(res, { headers: { 'accept-encoding': 'gzip' } }, 200, bigJson(), (r2, c, o) => { r2._cap = { c, o }; });
  assert(res._cap && res._cap.c === 200 && Array.isArray(res._cap.o.collections.grades), 'sendJson باید بدنهٔ کامل را بدهد');
  assert(out.encoding === null, 'encoding=null در مسیرِ هارنسِ قدیمی');
});

await test('C4 بدنهٔ سریال‌نشدنی (دایره‌ای) ⇒ fallbackِ نافشرده، بدونِ پرتاب', async () => {
  const cyc = { ok: true }; cyc.self = cyc;
  const res = mkRes();
  const out = await sendJsonCompressed(res, { headers: { 'accept-encoding': 'gzip' } }, 200, cyc, (r2, c, o) => { r2._cap = { c, o }; });
  assert(out.encoding === null, 'بدونِ فشرده‌سازی');
  assert(res._cap && res._cap.c === 200, 'پاسخ از مسیرِ sendJson رفت');
});

await test('C5 شبیه‌سازیِ کرشِ میانهٔ نوشتن (writeHead پرتاب می‌کند) ⇒ fallbackِ نافشرده، بدونِ رد شدنِ Promise', async () => {
  const res = mkRes();
  res.writeHead = () => { throw new Error('EPIPE: client gone'); };
  const out = await sendJsonCompressed(res, { headers: { 'accept-encoding': 'gzip' } }, 200, bigJson(),
    (r2, c, o) => { r2._cap = { c, o }; });
  assert(out.encoding === null, 'کرشِ نوشتن نباید پاسخ را بکشد؛ encoding=' + JSON.stringify(out.encoding));
  assert(res._cap && res._cap.c === 200 && res._cap.o && res._cap.o.ok === true,
    'بدنهٔ کامل از مسیرِ نافشرده (sendJson) باید برود');
});

await test('C6 مسیرِ کاملِ pull: فشرده‌سازی *await* می‌شود (بدنه و متریک‌ها پیش از بازگشت کامل‌اند)', async () => {
  const rows = [];
  for (let i = 1; i <= 3000; i++) rows.push({ id: i, school_id: 1, class_id: i % 30, student_id: 1000 + i,
    score: (i * 7) % 20, ref: 's9-e2e-row-' + i, note: 'توضیحِ تکرارشونده برای فشرده‌شدنِ خوب ' + (i % 40),
    created_at: iso(Date.now() - 30 * 864e5), updated_at: iso(Date.now() - 30 * 864e5) });
  const store = { __deleted_records: [], __server_version: 7, grades: rows };
  const res = mkRes();
  const controller = createPull({
    store, db: null,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (r2, c, o) => { r2._head = { status: c, headers: {} }; r2._chunks = [Buffer.from(JSON.stringify(o))]; },
    cursor: createCursor({ secret: SECRET })
  });
  const beforeSize = counterValue('payesh_sync_delta_size_bytes', 'sum');
  await controller.apiPull({ url: '/api/v1/pull', headers: { 'accept-encoding': 'gzip' } }, res);
  assert(res._head && res._head.status === 200, 'پاسخ باید پیش از بازگشتِ هندلر نوشته شده باشد');
  assert(res._head.headers['Content-Encoding'] === 'gzip', 'gzip مذاکره شد');
  const back = JSON.parse(zlib.gunzipSync(res._body).toString('utf8'));
  assert(Array.isArray(back.collections.grades) && back.collections.grades.length === 3000, 'بدنهٔ بازشده کامل است');
  const afterSize = counterValue('payesh_sync_delta_size_bytes', 'sum');
  assert(afterSize > beforeSize, 'سنجهٔ حجمِ خام باید با عددِ واقعی ثبت شود (' + beforeSize + '→' + afterSize + ')');
});

await test('C7 مسیرِ brotli: مذاکرهٔ br ⇒ بدنهٔ brotliِ بازشدنی (کیفیت ۵، نه پیش‌فرضِ ۱۱)', async () => {
  const body = bigJson();
  const res = mkRes();
  const info = await sendJsonCompressed(res, { headers: { 'accept-encoding': 'br' } }, 200, body, () => {});
  assert(info.encoding === 'br' && res._head.headers['Content-Encoding'] === 'br', 'br باید مذاکره شود');
  const back = JSON.parse(zlib.brotliDecompressSync(res._body).toString('utf8'));
  assert(back.collections.grades.length === body.collections.grades.length, 'بدنهٔ brotli کامل بازمی‌گردد');
  assert(info.wireBytes < info.rawBytes, 'brotli باید کوچک‌تر باشد');
});

await test('C8 آستانهٔ کمینه: بدنهٔ کوچک نافشرده می‌ماند و با min=0 فشرده می‌شود', async () => {
  const small = { ok: true, collections: { grades: [{ id: 1 }] } };
  const keep = process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES;
  try {
    delete process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES;
    const res1 = mkRes();
    const i1 = await sendJsonCompressed(res1, { headers: { 'accept-encoding': 'gzip' } }, 200, small, (r, c, o) => { r._cap = { c, o }; });
    assert(i1.encoding === null && res1._cap && res1._cap.c === 200, 'بدنهٔ کوچک باید نافشرده از مسیرِ sendJson برود');
    assert(!res1._head, 'هیچ سرآیندِ فشرده‌سازی نباید نوشته شود');
    process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES = '0';
    const res2 = mkRes();
    const i2 = await sendJsonCompressed(res2, { headers: { 'accept-encoding': 'gzip' } }, 200, small, () => {});
    assert(i2.encoding === 'gzip', 'با min=0 همان بدنهٔ کوچک هم باید فشرده شود: ' + JSON.stringify(i2.encoding));
    assert(JSON.parse(zlib.gunzipSync(res2._body).toString('utf8')).ok === true, 'بدنهٔ بازشده سالم است');
  } finally {
    if (keep === undefined) delete process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES;
    else process.env.PAYESH_DELTA_COMPRESS_MIN_BYTES = keep;
  }
});

/* ═══════════════ D — پینِ رگرسیونِ سطوحِ آدم‌یت‌شدهٔ سالم ═══════════════ */
group('D — پینِ رگرسیون: backpressure/rate-limit (سطوحِ آدیت‌شده)');

function makeSyncCtx(o) {
  o = o || {};
  const store = { visitors: [], users: [{ id: 5, role: 'manager', school_id: 1 }], __processed_uids: {}, __server_version: 0 };
  const ctx = {
    store,
    db: { persistOpsBatch: async () => ({ ok: true }), isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {}, sessionFrom: async () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {},
    rateLimit: o.rateLimit || null, syncOpsPerMin: o.syncOpsPerMin
  };
  attach(store);
  return { ctx, store };
}
const mkOps = (n, tag) => Array.from({ length: n }, () => opX({ by: 5, collection: 'visitors', type: 'ins', data: { school_id: 1, name: tag } }));
const mkHttpRes = () => { const r = { _headers: {} }; r.setHeader = (k, v) => { r._headers[String(k).toLowerCase()] = String(v); }; return r; };

await test('D1 ردِ 429: کدِ sync_backpressure + Retry-After + هیچ op اعمال نشود', async () => {
  const lim = async () => ({ allowed: false, remaining: 0, reset: 37, limit: 100 });
  const { ctx, store } = makeSyncCtx({ rateLimit: lim, syncOpsPerMin: 100 });
  const s = createSync(ctx);
  const res = mkHttpRes();
  await s.apiSync({}, res, { ops: mkOps(3, 'd1') });
  assert(res._cap && res._cap.code === 429, 'باید 429 بدهد، گرفت: ' + JSON.stringify(res._cap && res._cap.code));
  assert(res._cap.body.code === 'sync_backpressure', 'کدِ ماشینی: ' + res._cap.body.code);
  assert(res._cap.body.retry_after_s === 37, 'retry_after_s از TTLِ پنجره: ' + res._cap.body.retry_after_s);
  assert(res._headers['retry-after'] === '37', 'سرآیندِ Retry-After: ' + JSON.stringify(res._headers));
  assert(store.visitors.length === 0, 'هیچ opی نباید اعمال شود (بود: ' + store.visitors.length + ')');
});

await test('D2 checkRateLimit وزن‌دار: weight=N مصرفِ N واحد (fallbackِ حافظه)', async () => {
  const id = 's9-' + process.pid + '-' + Date.now();
  const r1 = await redis.incrByWithTtl('rate:test:' + id, 60, 5);
  const r2 = await redis.incrByWithTtl('rate:test:' + id, 60, 5);
  assert(r1 === 5 && r2 === 10, 'وزن‌دار شمارش کند: ' + r1 + ',' + r2);
  const ttl = await redis.ttl('rate:test:' + id);
  assert(ttl > 0 && ttl <= 60, 'TTL باید تنظیم شود: ' + ttl);
  const clamped = await redis.incrByWithTtl('rate:test:' + id + '-z', 60, 0);
  assert(clamped === 1, 'وزنِ صفر/نامعتبر ⇒ ۱ (رفتارِ پیشین): ' + clamped);
});

await test('D3 دروازهٔ وزن‌دارِ واقعی: عبورِ اول مجاز، مصرفِ پنجره بعدی رد', async () => {
  const { checkRateLimit } = require(path.join(ROOT, 'server', 'rate-limit'));
  const id = 's9rl-' + process.pid + '-' + Date.now();
  const ok1 = await checkRateLimit({ prefix: 's9', identifier: id, limit: 10, windowSeconds: 60, weight: 6 });
  assert(ok1.allowed === true && ok1.remaining === 4, '۶ از ۱۰ ⇒ مجاز با باقی‌ماندهٔ ۴: ' + JSON.stringify(ok1));
  const ok2 = await checkRateLimit({ prefix: 's9', identifier: id, limit: 10, windowSeconds: 60, weight: 6 });
  assert(ok2.allowed === false, '۶+۶ > ۱۰ ⇒ رد: ' + JSON.stringify(ok2));
});

await test('D4 خطای موتورِ نرخ = fail-open (۲۰۰) و اعمالِ opها', async () => {
  const boom = async () => { throw new Error('limiter down'); };
  const { ctx, store } = makeSyncCtx({ rateLimit: boom, syncOpsPerMin: 100 });
  const s = createSync(ctx);
  const res = mkHttpRes();
  await s.apiSync({}, res, { ops: mkOps(2, 'd4') });
  assert(res._cap && res._cap.code === 200, 'خطای موتور نباید سرویس را ببندد: ' + JSON.stringify(res._cap && res._cap.code));
  assert(store.visitors.length === 2, 'opها اعمال شوند: ' + store.visitors.length);
});

await sleep(50);
console.log('');
console.log('────────────────────────────────────────────────────');
if (fail) console.log('bughunt-session9: ' + pass + '/' + (pass + fail) + ' موفق ❌\n' + failures.map((f) => '   ' + f.name + ' — ' + f.msg).join('\n'));
else console.log('bughunt-session9: ' + pass + '/' + pass + ' موفق ✅');
console.log('────────────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1); });
