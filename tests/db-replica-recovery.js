#!/usr/bin/env node
/* رگرسیون S3-1 (باگ‌هانت چت ۵، نشست ۳، موج ۱۰): مدیریتِ شکستِ رپلیکایِ خوانش.
   ─────────────────────────────────────────────────────────────
   هر خطایی در queryRead — حتی یک SQL بد (42P01) که ربطی به سلامتِ رپلیکا
   ندارد — مسیریابی را برایِ همیشه خاموش می‌کرد و هیچ مسیرِ بازگشتی نبود
   (برخلافِ پرماری که scheduleReconnect دارد): منفعتِ کلِ موج ۱۰ بی‌صدا
   از دست می‌رفت و بار رویِ پرماری می‌ماند.
   حالا: (۱) خطایِ خودِ کوئری (کلاس‌هایِ 22/23/42) مسیریابی را نمی‌خواباند؛
   (۲) خطایِ اتصال می‌خواباند ولی کاوشِ خودکارِ زمان‌بندی‌شده رپلیکا را
   برمی‌گرداند. fallback به پرماری و پینِ D3c (ابهامِ بی‌کد = خاموش) سرِ جاست.
   اجرا: node tests/db-replica-recovery.js (جعلی، بدونِ PG) */
'use strict';
const db = require('../server/db.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakePool(tag, { failWith = null, rows = null } = {}) {
  const p = {
    tag, calls: [],
    totalCount: 4, idleCount: 2, waitingCount: 0,
    failWith,
    query: async function (t) {
      if (this.failWith) { const e = new Error(this.failWith.message); e.code = this.failWith.code; throw e; }
      this.calls.push(String(t));
      return { rows: rows ? rows(String(t)) : [{ ok: tag }], rowCount: 1 };
    },
    connect: async function () {
      if (this.failWith) { const e = new Error(this.failWith.message); e.code = this.failWith.code; throw e; }
      return { query: async () => ({ rows: [{ ping: 1 }] }), release: () => {} };
    },
    end: async function () { this.ended = true; }
  };
  return p;
}
const qErr = (code) => ({ code, message: 'query bug ' + code });
const cErr = (code) => ({ code, message: 'conn down ' + code });

(async () => {
  console.log('\n▸ S3-1 — شکستِ رپلیکا: طبقه‌بندی + بازگشت');
  db.__setPoolForTests(null);
  db.__setReadPoolForTests(null);
  db.__setReprobeDelayForTests(50);

  /* ── ۱) خطایِ کوئری مسیریابی را نمی‌کشد ── */
  {
    const prim = fakePool('primary');
    const repl = fakePool('replica', { failWith: qErr('42P01') });
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(repl);
    let code = null;
    try { await db.queryRead('SELECT * FROM nope'); } catch (e) { code = e.code; }
    chk('R1a خطایِ کوئری از fallback بالا آمد (همان خطا)', code === '42P01' || prim.calls.length === 1, 'code=' + code);
    chk('R1b رپلیکا همچنان فعال است', db.isReplicaActive() === true);
    repl.failWith = null;
    await db.queryRead('SELECT 1');
    chk('R1c کوئریِ بعدی دوباره به رپلیکا رفت', repl.calls.length === 1, JSON.stringify(repl.calls));
  }

  /* ── ۲) خطایِ اتصال می‌خواباند (پینِ D3c هم سرِ جاست) ── */
  {
    const prim = fakePool('primary');
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(fakePool('replica', { failWith: cErr('ECONNREFUSED') }));
    await db.queryRead('SELECT 1');
    chk('R2a خطایِ اتصال: fallback به پرماری', prim.calls.length === 1);
    chk('R2b خطایِ اتصال: مسیریابی خوابید', db.isReplicaActive() === false);
  }
  {
    const prim = fakePool('primary');
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(fakePool('replica', { failWith: { code: undefined, message: 'boom' } }));
    await db.queryRead('SELECT 1');
    chk('R3 خطایِ بی‌کد: خاموش (سازگار با D3c)', db.isReplicaActive() === false);
  }

  /* ── ۳) بازگشتِ خودکار پس از بهبودی ── */
  {
    const prim = fakePool('primary');
    const repl = fakePool('replica', { failWith: cErr('ETIMEDOUT') });
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(repl);
    await db.queryRead('SELECT 1');
    chk('R4a پس از قطع: خوابیده', db.isReplicaActive() === false);
    repl.failWith = null; /* رپلیکا خوب شد */
    await sleep(300);     /* تأخیرِ تست ۵۰ms — چند چرخه فرصت */
    chk('R4b کاوشِ خودکار رپلیکا را برگرداند', db.isReplicaActive() === true);
    repl.calls.length = 0;
    await db.queryRead('SELECT 1');
    chk('R4c پس از بازگشت، خوانش به رپلیکا می‌رود', repl.calls.length === 1);
  }

  /* ── ۴) کلاسِ دومِ خطایِ کوئری + مسابقهٔ تایمر/بستن ── */
  {
    const prim = fakePool('primary');
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(fakePool('replica', { failWith: qErr('42703') }));
    try { await db.queryRead('SELECT bad_col FROM t'); } catch (e) {}
    chk('R5 ستونِ ناشناخته هم مسیریابی را نمی‌کشد', db.isReplicaActive() === true);
  }
  {
    const prim = fakePool('primary');
    db.__setPoolForTests(prim);
    db.__setReadPoolForTests(fakePool('replica', { failWith: cErr('ECONNREFUSED') }));
    await db.queryRead('SELECT 1');
    db.__setReadPoolForTests(null); /* بستن پیش از آتشِ تایمر */
    await sleep(200);
    chk('R6 تایمرِ کاوش پس از حذفِ pool بی‌اثرِ بی‌کرش است', db.isReplicaActive() === false);
  }

  db.__setReprobeDelayForTests(10000);
  db.__setPoolForTests(null);
  db.__setReadPoolForTests(null);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
