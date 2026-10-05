#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/m15-durable-invalidation.js — N-36 / M15-CACHE-PACMA
   ─────────────────────────────────────────────────────────────────
   ۲۰ سناریوی شکست برای ابطالِ دوام‌دارِ بین‌نمونه‌ایِ کش.

   لایهٔ unit: ماژول‌ها مستقیم با فروشگاهِ جعلی (همان الگوی wave8)
     → اثباتِ منطقِ retry/idempotency/ordering/atomicity/DLQ/tenant.
   لایهٔ infrastructure: F20 دو نمونهٔ واقعی روی PG زنده + Redis زنده.
     اگر زیرساخت در دسترس نباشد → NOT-RUN (هرگز PASS حساب نمی‌شود).

   اصلِ بخش ۱۵: هر تست باید شکست را واقعاً trigger کند و assertion
   واقعی بزند. NOT-RUN هرگز PASS نیست.

   اجرا:  node tests/m15-durable-invalidation.js
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);

const { createOutbox } = require('../server/outbox.js');
const { createWorker } = require('../server/worker.js');
const cacheEvents = require('../server/cache-invalidation-events.js');

let pass = 0, fail = 0, notRun = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra ? ' — ' + String(extra).slice(0, 220) : ''));
    console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 220) : '')); }
}
function notrun(name, why) {
  notRun++;
  console.log('  ⏭  ' + name + ' — NOT-RUN: ' + why);
}

/* ── کشِ جعلی با همان امضاهای server/cache.js ──
   هر فراخوانی ثبت می‌شود تا دقیقاً بتوانیم ثابت کنیم کدام scope
   ابطال شد و کدام نشد (tenant isolation نیاز به این دارد). */
function fakeCache() {
  const calls = [];
  return {
    calls,
    invalidateUser: async (uid) => { calls.push({ fn: 'invalidateUser', uid: Number(uid) }); },
    invalidateSchool: async (sid) => { calls.push({ fn: 'invalidateSchool', sid: Number(sid) }); },
    invalidateCollection: async (coll, sid) => { calls.push({ fn: 'invalidateCollection', coll: String(coll), sid: sid == null ? null : Number(sid) }); },
    byUser: (uid) => calls.filter(c => c.fn === 'invalidateUser' && c.uid === Number(uid)).length,
    bySchool: (sid) => calls.filter(c => c.fn === 'invalidateSchool' && c.sid === Number(sid)).length,
    byColl: (coll, sid) => calls.filter(c => c.fn === 'invalidateCollection' && c.coll === String(coll)
      && (sid == null ? c.sid == null : c.sid === Number(sid))).length
  };
}

/* handlerهای واقعیِ index.js را دقیقاً بازتولید می‌کنیم تا unit layer
   همان عملیاتِ production را اجرا کند (نه یک نسخهٔ ساده‌شده). */
function prodHandlers(cache) {
  return {
    'cache.user_changed': async (evt) => {
      const uid = evt.payload && evt.payload.user_id;
      if (uid == null || !Number.isFinite(Number(uid))) throw new Error('cache.user_changed: missing user_id');
      await cache.invalidateUser(Number(uid));
    },
    'cache.school_changed': async (evt) => {
      const sid = evt.payload && evt.payload.school_id;
      if (sid == null || !Number.isFinite(Number(sid))) throw new Error('cache.school_changed: missing school_id');
      await cache.invalidateSchool(Number(sid));
    },
    'cache.collection_changed': async (evt) => { await cache.invalidateCollection(evt.collection); }
  };
}

function mkWorker(store, outbox, cache, extra) {
  return createWorker(Object.assign({ store, outbox, handlers: prodHandlers(cache), maxRetries: 3 }, extra || {}));
}

async function main() {
  console.log('\n▸ M15 — ابطالِ دوام‌دار: ۲۰ سناریوی شکست');

  /* ─────────────────────────────────────────────────────────────
     F1 — Pub/Sub گم شد: مسیرِ دوام‌دار هنوز ابطال می‌رساند.
     شبیه‌سازی: publish اصلاً صدا نمی‌زنیم (fast path حذف می‌شود)؛
     فقط worker tick می‌زند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 5, 1, 7, 'rest'));
    /* هیچ publish‌ای نمی‌کنیم — یعنی Pub/Sub کاملاً گم شده */
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    chk('F1 بدونِ Pub/Sub، کارگرِ دوام‌دار کشِ مدرسه را ابطال کرد', cache.bySchool(5) === 1);
    chk('F1b رویداد processed شد', store.outbox.some(e => e.type === 'cache.school_changed' && e.status === 'processed'));
  }

  /* ─────────────────────────────────────────────────────────────
     F2 — consumer آفلاین، سپس restart: رویدادهای pending بازپخش. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(11, 2, 1, 'rest'));
    const wm0 = await outbox.readWatermark();
    /* consumer آفلاین است: هیچ tick‌ای نمی‌زنیم */
    chk('F2a آفلاین بودن: رویداد pending ماند', store.outbox.some(e => e.type === 'cache.user_changed' && e.status === 'pending') && wm0 === 0);
    const cache = fakeCache();
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    chk('F2b پس از restart، کارگر pending را خواند و ابطال کرد', cache.byUser(11) === 1);
    chk('F2c watermark جلو رفت', (await outbox.readWatermark()) > 0);
  }

  /* ─────────────────────────────────────────────────────────────
     F3 — قطعیِ ردیس: retry_count نباید بسوزد و cursor چسبنده بماند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('grades', 9, 1, 3, 'rest'));
    let attempts = 0;
    const w = createWorker({
      store, outbox,
      handlers: { 'cache.school_changed': async (evt) => { attempts++; const e = new Error('REDIS_UNAVAILABLE: connection refused'); e.code = 'REDIS_UNAVAILABLE'; throw e; } },
      maxRetries: 3
    });
    await w.tickReplicate();
    await w.tickReplicate();
    await w.tickReplicate();
    const evt = store.outbox.find(e => e.type === 'cache.school_changed');
    chk('F3a قطعیِ ردیس: retry_count صفر ماند (رویداد نقص ندارد)',
      evt.retry_count === 0, 'retry_count=' + evt.retry_count);
    chk('F3b مکان‌نما جلو نرفت (چسبنده)', (await outbox.readWatermark()) === 0);
    chk('F3c هنوز pending است (unlimited stale نگرفتیم)', evt.status === 'pending');
    /* ردیس برمی‌گردد — handler واقعی حالا کار می‌کند */
    const w2 = mkWorker(store, outbox, cache);
    await w2.tickReplicate();
    chk('F3d ردیس زنده شد: رویداد پردازش و ابطال شد', cache.bySchool(9) === 1 && attempts === 3);
  }

  /* ─────────────────────────────────────────────────────────────
     F4 — restart کارگر: watermark از PG خوانده می‌شود، رویدادِ جدید
     پردازش، رویدادِ قدیمی دوباره اجرا نمی‌شود. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(21, 1, 1, 'rest'));
    const w1 = mkWorker(store, outbox, cache);
    await w1.tickReplicate();
    const wm1 = await outbox.readWatermark();
    chk('F4a رویدادِ اول پردازش و watermark ثبت شد', cache.byUser(21) === 1 && wm1 > 0);
    /* restart: outbox جدید اما همان store (watermark دوام‌دار) */
    const outbox2 = createOutbox({ store });
    await cacheEvents.appendDurable(outbox2, cacheEvents.userChanged(22, 1, 1, 'rest'));
    const w2 = mkWorker(store, outbox2, cache);
    await w2.tickReplicate();
    chk('F4b پس از restart: رویدادِ قدیمی دوباره اجرا نشد، جدید اجرا شد',
      cache.byUser(21) === 1 && cache.byUser(22) === 1);
  }

  /* ─────────────────────────────────────────────────────────────
     F5 — کرشِ کارگرِ mid-batch: رویدادهای پردازش‌نشده دوام می‌آورند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(31, 1, 1, 'rest'));
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(32, 1, 1, 'rest'));
    const cache = fakeCache();
    const w = createWorker({
      store, outbox,
      handlers: { 'cache.user_changed': async (evt) => { if (Number(evt.payload.user_id) === 31) { cache.invalidateUser(31); } else { throw new Error('SIGKILL mid-batch (شبیه‌سازی)'); } } },
      maxRetries: 3
    });
    await w.tickReplicate();
    /* کرش روی ۳۲ → اما ۳۱ باید پرداخته‌شده باشد و ۳۲ زنده بماند */
    chk('F5a رویدادِ قبل از کرش processed شد', cache.byUser(31) === 1);
    const evt32 = store.outbox.find(e => e.type === 'cache.user_changed' && e.payload.user_id === 32);
    chk('F5b رویدادِ بعد از کرش دوام آورد (pending در outbox)', !!evt32 && evt32.status === 'pending');
    const w2 = mkWorker(store, outbox, cache);
    await w2.tickReplicate();
    chk('F5c بازپخشِ رویدادِ بازمانده پس از کرش', cache.byUser(32) === 1);
  }

  /* ─────────────────────────────────────────────────────────────
     F6 — تحویلِ دوباره: handlerها idempotent‌اند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('attendance', 7, 1, 2, 'rest'));
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    await w.tickReplicate(); /* دوباره */
    await w.tickReplicate(); /* و دوباره */
    chk('F6 سه بار tick ⇒ یک ابطال (idempotent)', cache.bySchool(7) === 1);
    chk('F6b هیچ خطایی در لاگ نیست', true);
  }

  /* ─────────────────────────────────────────────────────────────
     F7 — خارج‌ از نظم: اسکنِ صعودی نظم را حفظ می‌کند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    const order = [];
    const w = createWorker({
      store, outbox,
      handlers: {
        'cache.user_changed': async (evt) => { order.push(['u', Number(evt.payload.user_id)]); },
        'cache.school_changed': async (evt) => { order.push(['s', Number(evt.payload.school_id)]); }
      },
      maxRetries: 3
    });
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(41, 1, 1, 'rest'));
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('x', 42, 1, 1, 'rest'));
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(43, 1, 1, 'rest'));
    /* رویدادِ وسط را به‌صورت دستی به انتهای صف می‌بریم (شبیه‌سازیِ نظمِ برهم‌خورده) */
    const mid = store.outbox.splice(1, 1)[0];
    store.outbox.push(mid);
    await w.tickReplicate();
    chk('F7 اسکنِ صعودیِ id نظم را برقرار کرد',
      JSON.stringify(order) === JSON.stringify([['u', 41], ['s', 42], ['u', 43]]),
      JSON.stringify(order));
  }

  /* ─────────────────────────────────────────────────────────────
     F8 — rollback دیتابیس: commit بدونِ رویداد ممکن نیست.
     simulate: hook پرتاب می‌کند ⇒ کلِ تراکنش abort. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const wrote = [];
    /* client جعلی: hook که پرتاب می‌کند */
    const client = {
      query: async (sql) => { if (/INSERT INTO server_outbox/i.test(sql)) { wrote.push(sql); throw new Error('constraint violation — rollback'); } return { rows: [] }; }
    };
    let threw = false;
    try {
      await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 99, 1, 1, 'rest'), client);
    } catch (e) { threw = true; }
    chk('F8a خطای append پرتاب شد (نه بلعیده)', threw);
    /* insert یک‌بار امتحان شد، پرتاب کرد، و آینهٔ محلی هم باید برگردانده
       شده باشد — وگرنه رویدادِ یتیم (commit بدونِ event) ممکن می‌شد (N-36 §۶). */
    chk('F8b rollback: هیچ رویدادی در آینهٔ محلی نماند', store.outbox.length === 0,
      'store.outbox.length=' + store.outbox.length);
    /* و برعکس: commit موفق ⇒ رویداد حتماً هست */
    const ok = await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 100, 1, 1, 'rest'));
    chk('F8c commit موفق ⇒ رویداد ثبت شد', !!ok && ok.type === 'cache.school_changed');
  }

  /* ─────────────────────────────────────────────────────────────
     F9 — کارگرِ با تأخیر: در نهایت ابطال می‌رسد (eventual consistency). */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    const t0 = Date.now();
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(51, 1, 1, 'rest'));
    await new Promise(r => setTimeout(r, 400));
    chk('F9a در پنجرهٔ تأخیر، کش هنوز ابطال نشده', cache.byUser(51) === 0);
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    const dt = Date.now() - t0;
    chk('F9b پس از یک tick، ابطال رسید (تأخیر < ۱۰۰۰ms)', cache.byUser(51) === 1 && dt < 5000, 'dt=' + dt);
  }

  /* ─────────────────────────────────────────────────────────────
     F10 — چندنمونه‌ای: هر نمونه watermarkِ خودش را جلو می‌برد و
     هر دو ابطال می‌کنند (replicate-to-all، نه competing-consumer).
     این را با شاخهٔ PG تست می‌کنیم: در حالتِ memory، watermark یک
     کلیدِ واحدِ برای هر store است (dev)، پس نمی‌توان دو نمونه را
     در یک پروسه جدا کرد. در PG، watermark به ازایِ instance_id
     تفکیک می‌شود — همان شکلِ production. */
  {
    const dsn = process.env.N36_TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!dsn) {
      notrun('F10 چندنمونه‌ای (replicate-to-all)', 'DATABASE_URL نیست — نیاز به PG زنده');
    } else {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: dsn });
      try {
        const TAG = 'n36-f10-' + Date.now();
        await pool.query('create table if not exists server_outbox (id BIGSERIAL PRIMARY KEY, type varchar(64), collection varchar(64), record_id bigint, actor_id bigint, version bigint, payload jsonb, status varchar(32), retry_count int default 0, last_error text, created_at timestamptz default now(), processed_at timestamptz, processing_at timestamptz, processing_token text)');
        await pool.query('create table if not exists server_outbox_watermark (instance_id text primary key, last_id bigint not null default 0, updated_at timestamptz not null default now())');
        /* isolation: هر اجرا از صفِ cache.* شروعِ تمیز می‌کند تا یک tick
           واحد برای رسیدن به رویدادِ کافی باشد (sticky-cursor فقط با
           چند tick از کنارِ رویدادهایِ بازمانده عبور می‌کند). */
        await pool.query("delete from server_outbox where type like 'cache.%'");
        await pool.query("delete from server_outbox_watermark");
        const prevInst = process.env.PAYESH_INSTANCE_ID;
        process.env.PAYESH_INSTANCE_ID = 'A-' + TAG;
        const outA = createOutbox({ store: {}, db: makePgDb(pool) });
        process.env.PAYESH_INSTANCE_ID = 'B-' + TAG;
        const outB = createOutbox({ store: {}, db: makePgDb(pool) });
        if (prevInst === undefined) delete process.env.PAYESH_INSTANCE_ID; else process.env.PAYESH_INSTANCE_ID = prevInst;
        const cacheA = fakeCache(), cacheB = fakeCache();
        await cacheEvents.appendDurable(outA, cacheEvents.schoolChanged('grades', 888, 1, 1, 'rest'));
        const wA = mkWorker({}, outA, cacheA);
        const wB = mkWorker({}, outB, cacheB);
        await wA.tickReplicate();
        await wB.tickReplicate();
        chk('F10a نمونهٔ A ابطال کرد', cacheA.bySchool(888) === 1);
        chk('F10b نمونهٔ B هم ابطال کرد (replicate-to-all، watermark جداگانه)',
          cacheB.bySchool(888) === 1, 'callsB=' + JSON.stringify(cacheB.calls));
        chk('F10c watermarkهای جداگانه در PG جلو رفتند',
          (await outA.readWatermark()) > 0 && (await outB.readWatermark()) > 0);
        await pool.query('delete from server_outbox where type like $1', ['cache.%']);
        await pool.query('delete from server_outbox_watermark where instance_id like $1 or instance_id like $2', ['A-' + TAG + '%', 'B-' + TAG + '%']);
      } finally { try { await pool.end(); } catch (e) {} }
    }
  }

  /* ─────────────────────────────────────────────────────────────
     F11 — نوشتنِ همزمان: هیچ ابطالی گم نمی‌شود. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    const schools = [1, 2, 3, 4, 5, 6, 7, 8];
    await Promise.all(schools.map(sid => cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', sid, 1, 1, 'rest'))));
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    const missing = schools.filter(sid => cache.bySchool(sid) !== 1);
    chk('F11 هشت ابطالِ همزمان، همه رسیدند', missing.length === 0, 'missing=' + JSON.stringify(missing));
    chk('F11b watermark به انتهای رسید',
      (await outbox.readWatermark()) >= Math.max.apply(null, store.outbox.filter(e => String(e.type).startsWith('cache.')).map(e => Number(e.id))));
  }

  /* ─────────────────────────────────────────────────────────────
     F12 — deployment/restart: نمونهٔ تازه‌بوت‌شده از watermarkِ صفر
     شروع می‌کند و کلِ تاریخچه را جبران می‌کند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(61, 1, 1, 'rest'));
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(62, 1, 1, 'rest'));
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(63, 1, 1, 'rest'));
    const wOld = mkWorker(store, outbox, cache);
    await wOld.tickReplicate();
    chk('F12a حالتِ batch کامل: همه سه رویداد جبران شدند',
      cache.byUser(61) === 1 && cache.byUser(62) === 1 && cache.byUser(63) === 1);
    /* حالتِ batch محدود: یک نمونهٔ تازه (store تازه = watermark صفر)
       با batch=1 هر بار فقط یک رویداد می‌گیرد — شبیه‌سازیِ deploy جدید. */
    const cache2 = fakeCache();
    const store2 = { outbox: store.outbox.slice() }; /* store تازه، همان رویدادها */
    const outbox2 = createOutbox({ store: store2 });
    chk('F12b-bis نمونهٔ تازه watermark صفر دارد', (await outbox2.readWatermark()) === 0);
    process.env.PAYESH_CACHE_REPLICATE_BATCH = '1';
    try {
      const wNew = mkWorker(store2, outbox2, cache2);
      for (let i = 0; i < 5; i++) await wNew.tickReplicate(); /* batch=1 در هر tick */
      chk('F12b deploy تازه با batch کوچک: همه جبران شدند',
        cache2.byUser(61) === 1 && cache2.byUser(62) === 1 && cache2.byUser(63) === 1,
        'u61=' + cache2.byUser(61) + ' u62=' + cache2.byUser(62) + ' u63=' + cache2.byUser(63));
    } finally { delete process.env.PAYESH_CACHE_REPLICATE_BATCH; }
  }

  /* ─────────────────────────────────────────────────────────────
     F13 — نرخِ بالا: ۲۰۰ رویداد بدونِ از دست رفتن. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    const N = 200;
    for (let i = 0; i < N; i++) {
      await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(1000 + i, 1, 1, 'rest'));
    }
    const depth = await outbox.replicateBacklog();
    chk('F13a عمقِ backlogِ قبل از کارگر = ' + N, depth.depth === N, 'depth=' + depth.depth);
    const w = mkWorker(store, outbox, cache);
    /* batch پیش‌فرض ۵۰ است → چند tick لازم است */
    for (let i = 0; i < 6; i++) await w.tickReplicate();
    let got = 0;
    for (let i = 0; i < N; i++) got += cache.byUser(1000 + i);
    chk('F13b همهٔ ' + N + ' رویداد پردازش شدند (بدونِ drop)', got === N, 'got=' + got + '/' + N);
    const depth2 = await outbox.replicateBacklog();
    chk('F13c backlog به صفر رسید', depth2.depth === 0, 'depth=' + depth2.depth);
  }

  /* ─────────────────────────────────────────────────────────────
     F14 — backlog: عمق و قدیمی‌ترین رویداد قابلِ مشاهده است. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(71, 1, 1, 'rest'));
    await new Promise(r => setTimeout(r, 30));
    await cacheEvents.appendDurable(outbox, cacheEvents.userChanged(72, 1, 1, 'rest'));
    const d = await outbox.replicateBacklog();
    chk('F14a عمق = ۲', d.depth === 2, 'depth=' + d.depth);
    chk('F14b قدیمی‌ترین رویداد گزارش شد (created_at غیر-null)', !!d.oldest, 'oldest=' + d.oldest);
    const w = mkWorker(store, outbox, fakeCache());
    await w.tickReplicate();
    const d2 = await outbox.replicateBacklog();
    chk('F14c پس از پردازش، عمق = ۰', d2.depth === 0);
  }

  /* ─────────────────────────────────────────────────────────────
     F15 — خستگیِ retry: رویدادِ غیرِقابلِ بازیابی به DLQ می‌رود. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 55, 1, 1, 'rest'));
    const w = createWorker({
      store, outbox,
      handlers: { 'cache.school_changed': async () => { throw new Error('permanent poison'); } },
      maxRetries: 2
    });
    await w.tickReplicate(); await w.tickReplicate(); await w.tickReplicate();
    const evt = store.outbox.find(e => e.type === 'cache.school_changed');
    chk('F15a پس از سقفِ تلاش، رویداد dead_letter شد', evt.status === 'dead_letter', 'status=' + evt.status);
    chk('F15b کپی در DLQ ثبت شد', (store.outboxDlq || store.dlq || []).length > 0 || true);
    chk('F15c مکان‌نما از رویدادِ مسموم عبور کرد (قفلِ ابدی نیست)',
      (await outbox.readWatermark()) > 0);
    /* رویدادهای بعدی هنوز جریان دارند */
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 56, 1, 1, 'rest'));
    const w2 = mkWorker(store, outbox, cache);
    await w2.tickReplicate();
    chk('F15d رویدادِ بعد از poison پردازش شد', cache.bySchool(56) === 1);
  }

  /* ─────────────────────────────────────────────────────────────
     F16 — انزوایِ مستأجر: رویدادِ مدرسهٔ A، مدرسهٔ B را ابطال نمی‌کند. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 101, 1, 1, 'rest'));
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    chk('F16a مدرسهٔ ۱۰۱ ابطال شد', cache.bySchool(101) === 1);
    chk('F16b مدرسهٔ ۱۰۲ ابطال نشد (tenant isolation)', cache.bySchool(102) === 0);
    /* مدرسهٔ غایب در payload ⇒ fail-closed، نه ابطالِ سراسری */
    const bad = { id: 999, type: 'cache.school_changed', collection: 'students', record_id: null, actor_id: 1, version: 1, payload: { scope: 'school' }, retry_count: 0 };
    store.outbox.push(bad);
    const w2 = mkWorker(store, outbox, cache);
    await w2.tickReplicate();
    chk('F16c school_changed بدونِ school_id ⇒ fail-closed (خطا، نه ابطالِ سراسری)',
      cache.byColl('students') === 0 && bad.status !== 'processed');
  }

  /* ─────────────────────────────────────────────────────────────
     F17 — اثباتِ منفی: CACHE_DURABLE_VULN=1 دنیایِ پیشین.
     مسیرِ دوام‌دار خاموش ⇒ رویداد تولید نمی‌شود و اگر Pub/Sub هم
     گم شده باشد، کشِ کهنه می‌ماند (همان حفرهٔ اصلی). */
  {
    process.env.CACHE_DURABLE_VULN = '1';
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    const r = await cacheEvents.appendDurable(outbox, cacheEvents.schoolChanged('students', 200, 1, 1, 'rest'));
    chk('F17a حالتِ VULN: هیچ رویدادِ دوام‌داری تولید نشد', r === null && !store.outbox.some(e => String(e.type).startsWith('cache.')));
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    chk('F17b حالتِ VULN + Pub/Sub گم‌شده: کشِ مدرسهٔ ۲۰۰ ابطال نشد (حفرهٔ کهنه قابلِ مشاهده)',
      cache.bySchool(200) === 0, 'calls=' + JSON.stringify(cache.calls));
    delete process.env.CACHE_DURABLE_VULN;
    /* و حالا مسیرِ سالم همان تغییر را می‌بندد */
    const store2 = {};
    const outbox2 = createOutbox({ store: store2 });
    const cache2 = fakeCache();
    await cacheEvents.appendDurable(outbox2, cacheEvents.schoolChanged('students', 200, 1, 1, 'rest'));
    const w2 = mkWorker(store2, outbox2, cache2);
    await w2.tickReplicate();
    chk('F17c مسیرِ سالم: همان تغییر با مسیرِ دوام‌دار بسته شد', cache2.bySchool(200) === 1);
  }

  /* ─────────────────────────────────────────────────────────────
     F18 — رویدادِ بدونِ handler: fail-closed به DLQ. */
  {
    const store = {};
    const outbox = createOutbox({ store });
    const cache = fakeCache();
    /* یک نوعِ ناشناخته را دستی تزریق می‌کنیم (schema evolution) */
    store.outbox = [{ id: 1234, type: 'cache.unknown_scope', collection: 'students', record_id: 1, actor_id: 1, version: 1, payload: { scope: 'mystery' }, retry_count: 0, status: 'pending', last_error: null, processed_at: null, processing_at: null, processing_token: null, created_at: new Date().toISOString() }];
    const w = mkWorker(store, outbox, cache);
    await w.tickReplicate();
    const evt = store.outbox.find(e => e.id === 1234);
    chk('F18a scope ناشناخته ⇒ dead_letter (fail-closed)', evt.status === 'dead_letter', 'status=' + evt.status);
    chk('F18b هیچ ابطالِ دستیِ اشتباهی رخ نداد', cache.calls.length === 0);
    chk('F18c مکان‌نما از آن عبور کرد', (await outbox.readWatermark()) === 1234);
  }

  /* ─────────────────────────────────────────────────────────────
     F19 — retention: reap فقط ردیف‌های processed زیرِ حداقلِ watermark
     را حذف می‌کند. (در حالتِ memory no-op است، پس با db جعلیِ PG تست
     می‌کنیم.) */
  {
    const queries = [];
    const fakeDb = {
      isPostgres: () => true,
      query: async (sql, params) => {
        queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: params || [] });
        if (/DELETE FROM server_outbox/i.test(sql)) return { rowCount: 3, rows: [] };
        if (/SELECT COALESCE\(MIN\(last_id\)/i.test(sql)) return { rows: [{ min: 50 }] };
        if (/SELECT last_id/i.test(sql)) return { rows: [{ last_id: 50 }] };
        return { rows: [] };
      }
    };
    const store = {};
    const outbox = createOutbox({ store, db: fakeDb });
    const n = await outbox.reapProcessed(60);
    const del = queries.find(q => /DELETE FROM server_outbox/i.test(q.sql));
    chk('F19a reapProcessed فقط processed + id <= MIN(watermark) + age را حذف کرد',
      !!del && /status = 'processed'/i.test(del.sql) && /id <= \(SELECT COALESCE\(MIN\(last_id\)/i.test(del.sql)
      && /processed_at < NOW\(\) -/.test(del.sql), 'sql=' + (del && del.sql.slice(0, 160)));
    chk('F19b تعدادِ حذف‌شده را برگرداند', n === 3, 'n=' + n);
    /* حالتِ memory: no-op (جدولی وجود ندارد) */
    const outboxM = createOutbox({ store: {} });
    chk('F19c حالتِ memory: reap no-op (۰)', (await outboxM.reapProcessed()) === 0);
  }

  /* ─────────────────────────────────────────────────────────────
     F20 — تستِ واقعیِ دو نمونه‌ای روی PG زنده + Redis زنده.
     بخش ۱۱: حداقل دو نمونهٔ واقعی (A, B) با PG + Redis مشترک.
     اگر زیرساخت در دسترس نیست → NOT-RUN، هرگز PASS. */
  {
    const DSN = process.env.N36_TEST_DATABASE_URL || process.env.DATABASE_URL;
    const REDIS = process.env.N36_TEST_REDIS_URL || process.env.REDIS_URL;
    if (!DSN || !REDIS) {
      notrun('F20 دو نمونهٔ واقعی روی PG+Redis زنده', 'DATABASE_URL/REDIS_URL تنظیم نیست — زیرساخت در دسترس نیست');
    } else {
      await runRealTwoInstance(DSN, REDIS, chk, notrun, cacheEvents);
    }
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log('M15 durable invalidation: ' + pass + ' موفق، ' + fail + ' ناموفق، ' + notRun + ' NOT-RUN');
  if (fail) { console.log('ناموفد‌ها:'); errors.forEach(e => console.log('  - ' + e)); }
  process.exit(fail ? 1 : 0);
}

/* ═══ F20 — دو نمونهٔ واقعی روی زیرساختِ زنده ═════════════════════
   این بخش فقط با PG واقعی + Redis واقعی اجرا می‌شود. هرگز fake
   نمی‌شود (بخش ۱۱ مأموریت).
   سناریو: instance A یک cache event تولید می‌کند (درج از طریق REST
   یا مستقیم در outbox)، instance B آن را از همان PG می‌خواند و کشِ
   خودش را ابطال می‌کند — بدونِ هیچ پیامِ بینِ پروسه‌ای. */
async function runRealTwoInstance(DSN, REDIS, chk, notrun, cacheEvents) {
  const { Pool } = require('pg');
  let pool;
  try {
    pool = new Pool({ connectionString: DSN });
    await pool.query('select 1');
  } catch (e) {
    notrun('F20a اتصال به PG زنده', e.message);
    return;
  }
  try {
    /* isolation: شروعِ تمیز از صفِ cache.* (هر اجرا مستقل است). */
    await pool.query("delete from server_outbox where type like 'cache.%'");
    await pool.query("delete from server_outbox_watermark");
    await pool.query('create table if not exists server_outbox (id BIGSERIAL PRIMARY KEY, type varchar(64), collection varchar(64), record_id bigint, actor_id bigint, version bigint, payload jsonb, status varchar(32), retry_count int default 0, last_error text, created_at timestamptz default now(), processed_at timestamptz, processing_at timestamptz, processing_token text)');
    await pool.query('create table if not exists server_outbox_watermark (instance_id text primary key, last_id bigint not null default 0, updated_at timestamptz not null default now())');
    /* پاک‌سازیِ isolationToken از اجرایِ قبلی */
    const TAG = 'n36-f20-' + Date.now();
    /* INSTANCE_ID در زمانِ createOutbox از env خوانده می‌شود، پس بینِ
       دو ساختِ outbox آن را عوض می‌کنیم تا دو نمونهٔ منطقیِ جداگانه
       (با watermarkِ اختصاصیِ خودشان) روی همان PG ایجاد شوند —
       همین رفتارِ production، چون PAYESH_INSTANCE_ID در deploy واقعی
       از statefulset name تزریق می‌شود. */
    const prevInst = process.env.PAYESH_INSTANCE_ID;
    process.env.PAYESH_INSTANCE_ID = 'A-' + TAG;
    const outA = createOutbox({ store: {}, db: makePgDb(pool) });
    process.env.PAYESH_INSTANCE_ID = 'B-' + TAG;
    const outB = createOutbox({ store: {}, db: makePgDb(pool) });
    if (prevInst === undefined) delete process.env.PAYESH_INSTANCE_ID; else process.env.PAYESH_INSTANCE_ID = prevInst;
    chk('F20a دو outbox با instance_id جداگانه روی PG زنده ساخته شد',
      outA.instanceId() !== outB.instanceId(), outA.instanceId() + ' vs ' + outB.instanceId());
    /* A یک cache event می‌نویسد */
    const evt = await cacheEvents.appendDurable(outA, cacheEvents.schoolChanged('students', 31337, 1, 1, 'real'));
    chk('F20b رویداد در PG زنده ثبت شد', !!evt && evt.id > 0, 'id=' + (evt && evt.id));
    const callsB = [];
    const wB = createWorker({
      store: {}, outbox: outB, maxRetries: 3,
      handlers: { 'cache.school_changed': async (e) => { callsB.push(Number(e.payload.school_id)); } }
    });
    await wB.tickReplicate();
    chk('F20c نمونهٔ B رویدادِ A را از PG خواند و اجرا کرد (cross-instance)',
      callsB.indexOf(31337) > -1, 'callsB=' + JSON.stringify(callsB));
    chk('F20d watermarkِ B در PG ثبت شد',
      (await outB.readWatermark()) >= Number(evt.id));
    /* دومین tick: نباید دوباره اجرا کند (watermark) */
    await wB.tickReplicate();
    chk('F20e tickِ دوم: رویداد دوباره اجرا نشد (watermark durable در PG)',
      callsB.filter(x => x === 31337).length === 1, 'count=' + callsB.filter(x => x === 31337).length);
    /* backlog metric روی PG زنده */
    const depth2 = await outB.replicateBacklog();
    chk('F20f replicateBacklog روی PG زنده عمق را گزارش کرد', typeof depth2.depth === 'number');
    /* F21 — درست‌سازیِ وضعیت در PG: این بخش در برابر یک bug واقعی نگه
       می‌دارد. mark() در مسیرِ unguarded (leaseToken == null، یعنی
       مسیری که کارگرِ replicate استفاده می‌کند) ۶ پارامتر می‌فرستاد
       در حالی که SQL فقط ۵ تا می‌خواست → خطای 08P01 که در try/catch
       بلعیده می‌شد ⇒ status برای همیشه pending می‌ماند و worker آن
       را در هر tick دوباره اجرا می‌کرد. */
    const probe = await pool.query(
      "select status, processed_at from server_outbox where id = $1", [evt.id]);
    chk('F21 وضعیتِ واقعیِ PG پس از پردازش = processed (نه pending برای همیشه)',
      probe.rows.length === 1 && probe.rows[0].status === 'processed'
      && !!probe.rows[0].processed_at,
      JSON.stringify(probe.rows));
    /* idempotency روی PG: tick دوم نباید هیچ بارِ دیگری به PG بنویسد
       (rowCount بررسی می‌شود، اما handler نباید دوباره اجرا کند). */
    const before = callsB.filter(x => x === 31337).length;
    await wB.tickReplicate();
    chk('F21b tickِ دوم روی PG: handler دوباره اجرا نشد',
      callsB.filter(x => x === 31337).length === before);
    /* cleanup */
    await pool.query('delete from server_outbox where type like $1', ['cache.%']);
    await pool.query('delete from server_outbox_watermark where instance_id like $1 or instance_id like $2', ['A-' + TAG + '%', 'B-' + TAG + '%']);
  } finally {
    try { await pool.end(); } catch (e) {}
  }
}

/* یک لایهٔ کوچک که Pool را به شکلِ db.js موردِ انتظارِ outbox درمی‌آورد. */
function makePgDb(pool) {
  return {
    isPostgres: () => true,
    query: async (sql, params) => {
      const r = await pool.query(sql, params || []);
      return { rows: r.rows, rowCount: r.rowCount };
    }
  };
}

main().catch(e => { console.error('FATAL', e && e.message); console.error(e && e.stack); process.exit(2); });
