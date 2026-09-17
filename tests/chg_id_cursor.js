#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/chg_id_cursor.js — Wave 10 (نوبتِ سوم)، اتصالِ chg_id به کرسرِ v3
   ─────────────────────────────────────────────────────────────────
   توکنِ v3 = v2 + cw (نشانگرِ آبِ change-ID). کلاینت‌های قدیمی (v1/v2
   یا ?since= خالی) عیناً مسیرِ زمانیِ قبل می‌روند — سازگاریِ کامل.

     K1  sign سه‌پارامتری: v3 با cw — شکلِ payload + verify
     K2  sign بدونِ cw ⇒ توکنِ v3 با مسیرِ زمانی (cw حذف می‌شود)
     K3  cw منفی/غیرعددی ⇒ حذف (نه خطا — سقوطِ نرم به مسیرِ زمانی)
     K4  cw اعشاری ⇒ truncate به صحیح
     K5  سازگاریِ v1 (گذارِ استقرار): verify ok — بدونِ rg
     K6  سازگاریِ v2: verify ok؛ v2 از منطقهٔ دیگر ⇒ region_mismatch
     K7  v3 با cw بدشکل (رشته/منفی/اعشار) ⇒ cursor_invalid (fail-closed)
     K8  v3 منقضی ⇒ cursor_expired؛ امضای غلط/زباله ⇒ cursor_invalid

     P1  pull با v3+cw: جدولِ chg دار از فیدِ chg_id می‌آید؛ فیلترِ
         زمانی اجرا نمی‌شود (سطر با timestamp قدیمی هم می‌رسد)
     P2  watermark در پاسخ (pre-read) + next_cursor از v3 با cw تازه
     P3  ترتیبِ calls: MAX(chg_id) قبل از هر خواندنِ داده (pre-read)
     P4  v2 (بدونِ cw) ⇒ همان جدول از مسیرِ زمانی؛ next_cursor ارتقا
         می‌یابد به v3+cw (کلاینت توکن را opaque می‌داند)
     P5  v1 ⇒ مسیرِ زمانی (سازگاریِ گذار)
     P6  جدولِ بدونِ chg (schools) با توکنِ v3+cw ⇒ مسیرِ زمانی
     P7  شکستِ captureChgWatermark ⇒ chg_watermark نیست، next_cursor
         بدونِ cw؛ ولی فیدِ chg با cwِ توکن همچنان کار می‌کند
     P8  شکستِ فیدِ chg (NULL) ⇒ سقوط به مسیرِ زمانی (rows گم نمی‌شوند)
     P9  فول‌پول ⇒ watermark گرفته می‌شود و next_cursor از v3+cw است
     P10 v3 با cw بدشکل در pull ⇒ 401 + cursor_renewal=full_pull
     P11 v3 از منطقهٔ دیگر ⇒ 401 (region_mismatch)

   Run: node tests/chg_id_cursor.js   (exit 0 = green)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const { createCursor, regionName } = require(path.join(ROOT, 'server', 'cursor'));
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { CHG_TABLES } = require(path.join(ROOT, 'server', 'syncdelta'));

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const SECRET = 'k'.repeat(64);
const KEY = crypto.createHash('sha256').update('payesh.cursor.v1|' + SECRET).digest('hex');

/* ساختِ توکنِ دستی با همان کلیدِ createCursor — برای v1/v2 و payloadهای خراب */
function craft(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', KEY).update('pc1.' + body).digest();
  return 'pc1.' + body + '.' + sig.toString('base64url');
}
const NOW = Math.floor(Date.now() / 1000);
const basePayload = (over) => Object.assign({ since: new Date(NOW * 1000 - 3600 * 1000).toISOString(), iat: NOW, exp: NOW + 3600, jti: 't' + crypto.randomBytes(16).toString('hex'), rg: regionName() }, over);

/* ── دیتابیسِ جعلیِ PG: فقط شکلِ کوئری‌ها را می‌شناسد ── */
function fakeDb(cfg) {
  cfg = cfg || {};
  const calls = [];
  const tOf = (sql) => (sql.match(/FROM "(\w+)"/) || [])[1];
  return {
    calls,
    isPostgres: () => true,
    async query(sql, params) {
      if (/COALESCE\(MAX\(chg_id\)/.test(sql)) {
        if (cfg.failWatermark) { calls.push('max!'); throw new Error('column chg_id does not exist'); }
        calls.push('max:' + tOf(sql));
        return { rows: [{ m: String((cfg.maxByTable || {})[tOf(sql)] || 0) }] };
      }
      if (/chg_id > \$1/.test(sql)) {
        if (cfg.failChgFeed) { calls.push('chgFeed!:' + tOf(sql)); throw new Error('chg feed boom'); }
        calls.push('chgFeed:' + tOf(sql) + ':' + params[0]);
        return { rows: (cfg.chgRows || {})[tOf(sql)] || [] };
      }
      if (/created_at > \$1|updated_at > \$1/.test(sql)) {
        calls.push('timeFeed:' + tOf(sql));
        return { rows: (cfg.timeRows || {})[tOf(sql)] || [] };
      }
      calls.push('other:' + sql.slice(0, 24));
      return { rows: [] };
    },
    async readCollection(c) { calls.push('full:' + c); return (cfg.fullRows || {})[c] || []; },
    stripInternalColumns(rows) { return rows.map((r) => { const o = Object.assign({}, r); delete o.chg_id; return o; }); }
  };
}

/* ── هارنسِ pull (الگوی delta-phase4) ── */
function makeHarness(db) {
  const cursor = createCursor({ secret: SECRET });
  const store = { __deleted_records: [], __server_version: 3 };
  const controller = createPull({
    store, db,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._head = { status: code, headers: { 'Content-Type': 'application/json' } }; res._chunks = [Buffer.from(JSON.stringify(body))]; },
    cursor
  });
  const rawRes = () => {
    const r = { _chunks: [], _head: null, _headers: {} };
    r.setHeader = (k, v) => { r._headers[String(k).toLowerCase()] = String(v); };
    r.writeHead = (status, headers) => { r._head = { status, headers: headers || {} }; };
    r.end = (buf) => { r._chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf))); };
    Object.defineProperty(r, '_body', { get() { return Buffer.concat(this._chunks); } });
    return r;
  };
  return { cursor, pull: async (u) => { const r = rawRes(); await controller.apiPull({ url: u, headers: {} }, r); return r; } };
}

const bodyOf = (res) => JSON.parse(res._body.toString('utf8'));

(async () => {
  console.log('\n▸ Wave 10 · chg_id ↔ کرسرِ v3 — واحد (cursor.js)');

  /* ══ K: واحد ══ */
  const cur = createCursor({ secret: SECRET });
  const sinceIso = new Date(NOW * 1000 - 3600 * 1000).toISOString();

  const t1 = cur.sign(sinceIso, null, 5150);
  const v1r = cur.verify(t1);
  chk('K1a sign(since, null, cw) ⇒ توکنِ v3', !!(v1r.ok && v1r.payload.v === 3), JSON.stringify(v1r.ok ? v1r.payload.v : v1r));
  chk('K1b cw داخلِ payload همان عدد است', !!(v1r.ok && v1r.payload.cw === 5150), String(v1r.ok && v1r.payload.cw));

  const t2 = cur.sign(sinceIso, null);
  const v2r = cur.verify(t2);
  chk('K2 sign بدونِ cw ⇒ v3 با مسیرِ زمانی (cw نیست)', !!(v2r.ok && v2r.payload.v === 3 && v2r.payload.cw == null), JSON.stringify(v2r.ok && 'cw=' + v2r.payload.cw));

  const t3 = cur.sign(sinceIso, null, -7);
  const t3b = cur.sign(sinceIso, null, 'abc');
  chk('K3 cw منفی/غیرعددی ⇒ حذف (سقوطِ نرم)', cur.verify(t3).ok && cur.verify(t3).payload.cw == null && cur.verify(t3b).payload.cw == null);

  const t4 = cur.sign(sinceIso, null, 12.9);
  chk('K4 cw اعشاری ⇒ truncate (12)', cur.verify(t4).ok && cur.verify(t4).payload.cw === 12, String(cur.verify(t4).ok && cur.verify(t4).payload.cw));

  const v1tok = craft({ v: 1, since: sinceIso, iat: NOW, exp: NOW + 3600, jti: 'x1' });
  chk('K5 سازگاریِ v1 (گذارِ استقرار): پذیرفته می‌شود', cur.verify(v1tok).ok === true);

  const v2tok = craft(basePayload({ v: 2 }));
  chk('K6a سازگاریِ v2: پذیرفته می‌شود', cur.verify(v2tok).ok === true);
  const v2far = craft(basePayload({ v: 2, rg: 'tehran-1' }));
  chk('K6b v2 از منطقهٔ دیگر ⇒ region_mismatch', cur.verify(v2far).code === 'region_mismatch', String(cur.verify(v2far).code));

  let bad = 0;
  for (const cwv of ['abc', -1, 1.5, { x: 1 }, [1], true]) {
    if (cur.verify(craft(basePayload({ v: 3, cw: cwv }))).code !== 'cursor_invalid') bad++;
  }
  chk('K7 v3 با cw بدشکل ⇒ cursor_invalid (۶ حالت، fail-closed)', bad === 0, 'failures=' + bad);

  const expired = craft(basePayload({ v: 3, cw: 10, exp: NOW - 10 }));
  chk('K8a v3 منقضی ⇒ cursor_expired', cur.verify(expired).code === 'cursor_expired');
  chk('K8b زباله/امضای غلط ⇒ cursor_invalid', cur.verify('pc1.x.y').code === 'cursor_invalid' && cur.verify(t1 + 'z').code === 'cursor_invalid');
  chk('K8c cw=null در v3 ⇒ معتبر (مسیرِ زمانی)', cur.verify(craft(basePayload({ v: 3, cw: null }))).ok === true);

  /* ══ P: یکپارچگیِ pull با db جعلی ══ */
  console.log('\n▸ Wave 10 · chg_id ↔ کرسرِ v3 — pull (db جعلیِ PG)');

  const OLD = '2020-01-01T00:00:00.000Z';       /* قدیمی — اگر فیلترِ زمانی اجرا شود حذف می‌شود */
  const since1h = new Date(Date.now() - 3600 * 1000).toISOString();

  /* P1+P2+P3: v3+cw روی جدولِ chg دار */
  {
    const db = fakeDb({
      maxByTable: { grades: 99, users: 3 },
      chgRows: { grades: [{ id: 1, school_id: 1, student_id: 100, score: 20, updated_at: OLD, created_at: OLD, chg_id: 60 }] },
      timeRows: { grades: [{ id: 2, school_id: 1, student_id: 100, score: 5, updated_at: OLD, created_at: OLD }] }
    });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(cur.sign(since1h, null, 50)));
    const b = bodyOf(res);
    const rows = (b.collections && b.collections.grades) || [];
    chk('P1a v3+cw ⇒ سطر از فیدِ chg_id (timestamp قدیمی هم می‌رسد)', rows.length === 1 && rows[0].id === 1 && Number(rows[0].score) === 20, JSON.stringify(rows));
    chk('P1b سطرِ دلتا بدونِ chg_id (شکلِ سطر)', rows.length === 1 && !('chg_id' in rows[0]));
    chk('P1c فیدِ زمانی برایِ جدولِ chg دار اجرا نشد', !db.calls.some((c) => c.startsWith('timeFeed:')), JSON.stringify(db.calls));
    chk('P2a chg_watermark در پاسخ (pre-read: MAX)', b.chg_watermark === 99, String(b.chg_watermark));
    const nv = cur.verify(b.next_cursor);
    chk('P2b next_cursor ⇒ v3 با cw=99', !!(nv.ok && nv.payload.v === 3 && nv.payload.cw === 99), JSON.stringify(nv.ok ? { v: nv.payload.v, cw: nv.payload.cw } : nv));
    const nMax = db.calls.filter((c) => c.startsWith('max:')).length;
    chk('P3a pre-read: MAX(chg_id) روی همهٔ ۱۴ جدول', nMax === 14, String(nMax));
    const firstData = db.calls.findIndex((c) => !c.startsWith('max:'));
    const lastMax = db.calls.map((c) => c.startsWith('max:')).lastIndexOf(true);
    chk('P3b همهٔ MAXها قبل از خواندنِ داده', lastMax < firstData, 'lastMax=' + lastMax + ' firstData=' + firstData);
    chk('P3c فیدِ chg با پارامترِ cwِ توکن (50)', db.calls.some((c) => c === 'chgFeed:grades:50'), JSON.stringify(db.calls.filter((c) => c.startsWith('chgFeed'))));
  }

  /* P4: v2 (بدونِ cw) ⇒ مسیرِ زمانی + ارتقای next_cursor به v3+cw */
  {
    const db = fakeDb({
      maxByTable: { grades: 99 },
      timeRows: { grades: [
        { id: 7, school_id: 1, student_id: 100, score: 10, updated_at: new Date(Date.now() - 30 * 1000).toISOString(), created_at: new Date(Date.now() - 30 * 1000).toISOString() },
        { id: 8, school_id: 1, student_id: 100, score: 11, updated_at: OLD, created_at: OLD }
      ] }
    });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(craft(basePayload({ v: 2 }))));
    const b = bodyOf(res);
    const rows = (b.collections && b.collections.grades) || [];
    chk('P4a v2 ⇒ مسیرِ زمانی (سطرِ تازه بله، قدیمی نه)', rows.length === 1 && rows[0].id === 7, JSON.stringify(rows.map((r) => r.id)));
    chk('P4b فیدِ chg برایِ v2 اجرا نشد', !db.calls.some((c) => c.startsWith('chgFeed')));
    const nv = cur.verify(b.next_cursor);
    chk('P4c next_cursor ⇒ v3 با cw (ارتقا؛ توکن opaque است)', !!(nv.ok && nv.payload.v === 3 && nv.payload.cw === 99), JSON.stringify(nv.ok ? { v: nv.payload.v, cw: nv.payload.cw } : nv));
  }

  /* P5: v1 ⇒ مسیرِ زمانی */
  {
    const db = fakeDb({ maxByTable: { grades: 4 }, timeRows: { grades: [{ id: 9, school_id: 1, student_id: 100, score: 3, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] } });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(v1tok));
    const b = bodyOf(res);
    chk('P5 v1 ⇒ پذیرفته + مسیرِ زمانی', res._head.status === 200 && ((b.collections.grades) || []).some((r) => r.id === 9) && !db.calls.some((c) => c.startsWith('chgFeed')), 'status=' + res._head.status);
  }

  /* P6: جدولِ بدونِ chg (schools) با v3+cw ⇒ مسیرِ زمانی */
  {
    const db = fakeDb({ maxByTable: {}, timeRows: { schools: [{ id: 1, name: 'مدرسه', updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] } });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=schools&cursor=' + encodeURIComponent(cur.sign(since1h, null, 50)));
    const b = bodyOf(res);
    chk('P6 جدولِ غیر-chg (schools) ⇒ مسیرِ زمانی', db.calls.some((c) => c === 'timeFeed:schools') && !db.calls.some((c) => c.startsWith('chgFeed')) && ((b.collections.schools) || []).length === 1, JSON.stringify(db.calls));
  }

  /* P7: شکستِ captureChgWatermark ⇒ ویژگیِ cw خاموش در پاسخ؛ فید با cwِ توکن کار می‌کند */
  {
    const db = fakeDb({
      failWatermark: true,
      chgRows: { grades: [{ id: 11, school_id: 1, student_id: 100, score: 8, updated_at: OLD, created_at: OLD, chg_id: 61 }] },
      timeRows: { grades: [{ id: 12, school_id: 1, student_id: 100, score: 9, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] }
    });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(cur.sign(since1h, null, 50)));
    const b = bodyOf(res);
    const nv = cur.verify(b.next_cursor);
    chk('P7a شکستِ watermark ⇒ chg_watermark نیست و next_cursor بدونِ cw', b.chg_watermark === undefined && !!(nv.ok && nv.payload.cw == null), 'wm=' + b.chg_watermark + ' cw=' + (nv.ok && nv.payload.cw));
    chk('P7b فیدِ chg با cwِ توکنِ امضاشده همچنان فعال', db.calls.some((c) => c === 'chgFeed:grades:50') && ((b.collections.grades) || []).some((r) => r.id === 11), JSON.stringify(db.calls));
  }

  /* P8: شکستِ فیدِ chg ⇒ سقوط به مسیرِ زمانی */
  {
    const db = fakeDb({
      maxByTable: { grades: 99 },
      failChgFeed: true,
      timeRows: { grades: [{ id: 13, school_id: 1, student_id: 100, score: 6, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] }
    });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(cur.sign(since1h, null, 50)));
    const b = bodyOf(res);
    chk('P8 شکستِ فیدِ chg ⇒ سقوط به زمانی (سطر گم نمی‌شود)', db.calls.some((c) => c === 'chgFeed!:grades') && db.calls.some((c) => c === 'timeFeed:grades') && ((b.collections.grades) || []).some((r) => r.id === 13), JSON.stringify(db.calls));
  }

  /* P9: فول‌پول ⇒ watermark + next_cursor v3+cw */
  {
    const db = fakeDb({ maxByTable: { grades: 77 }, fullRows: { grades: [{ id: 1, school_id: 1, student_id: 100, score: 1 }] } });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades');
    const b = bodyOf(res);
    const nv = cur.verify(b.next_cursor);
    chk('P9a فول‌پول ⇒ خواندنِ کامل (readCollection)', db.calls.some((c) => c === 'full:grades') && !db.calls.some((c) => c.startsWith('chgFeed') || c.startsWith('timeFeed')), JSON.stringify(db.calls));
    chk('P9b فول‌پول ⇒ chg_watermark=77 و next_cursor v3+cw', b.chg_watermark === 77 && !!(nv.ok && nv.payload.v === 3 && nv.payload.cw === 77), 'wm=' + b.chg_watermark);
  }

  /* P10: cw بدشکل در pull ⇒ 401 + cursor_renewal */
  {
    const db = fakeDb({ maxByTable: {} });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(craft(basePayload({ v: 3, cw: 'evil' }))));
    const b = bodyOf(res);
    chk('P10 v3 با cw بدشکل ⇒ 401 + cursor_renewal=full_pull', res._head.status === 401 && b.cursor_renewal === 'full_pull', 'status=' + res._head.status + ' renewal=' + b.cursor_renewal);
  }

  /* P11: منطقهٔ دیگر ⇒ 401 */
  {
    const db = fakeDb({ maxByTable: {} });
    const h = makeHarness(db);
    const res = await h.pull('/api/v1/pull?collections=grades&cursor=' + encodeURIComponent(craft(basePayload({ v: 3, cw: 5, rg: 'shiraz-2' }))));
    const b = bodyOf(res);
    chk('P11 v3 از منطقهٔ دیگر ⇒ 401 (region_mismatch)', res._head.status === 401 && b.code === 'region_mismatch', 'status=' + res._head.status + ' code=' + b.code);
  }

  /* قراردادِ جدول‌هایِ chg — همان ۱۴ جدولِ ۰۰۸ */
  chk('PC چg_TABLES = ۱۴ جدولِ قراردادی', CHG_TABLES.size === 14 && CHG_TABLES.has('grades') && CHG_TABLES.has('users') && !CHG_TABLES.has('schools'), 'size=' + CHG_TABLES.size);

  console.log('\n────────────────────────────────────────────');
  if (failc === 0) console.log(`chg_id_cursor: ${okc}/${okc} — بدون خطا ✅`);
  else {
    console.log(`chg_id_cursor: ${okc}/${okc + failc} — ${failc} خطا ❌`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
