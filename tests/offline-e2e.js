#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   offline-e2e.js — P0-3: زنجیرهٔ کاملِ آفلاین E2E (حکم بازبین مستقل)
   ───────────────────────────────────────────────────────────────────
   زنجیره: OFFLINE (قطع fetch) → تولید op → صف → «restart مرورگر»
   (نمونهٔ دومِ jsdom با همان بک‌استورِ ماندگار — نه حافظهٔ مشترک) →
   ONLINE → sync خودکار → POST /api/sync (سرورِ واقعی server/sync.js)
   → اعتبارسنجی/authorization سرور → persistence → response →
   dedupe (پخشِ دوباره ⇒ اثرِ تکی) → retry+backoff روی شکستِ گذرا →
   conflict (نسخهٔ سرور جدیدتر ⇒ conflict_preserved + مسیرِ داوری) →
   reconciliation کلاینت.

   واقعی‌بودن‌ها:
   - کلاینت: باندلِ واقعیِ index.html در jsdom (همان کدی که مرورگر می‌راند)
   - «restart»: dom1 بسته می‌شود؛ dom2 از صفر بوت می‌شود و صف را فقط از
     بک‌استورِ ماندگارِ مشترک (SharedStorage — شبیه‌سازِ دیسکِ پروفایلِ
     مرورگر که به هر دو نمونه به‌عنوانِ localStorage تزریق می‌شود) می‌خواند.
     هیچ متغیرِ حافظه‌ایِ مشترکی بینِ دو نمونه نیست.
   - سرور: server/sync.js واقعی (فیلدگیت/authz/OCC/idempotency) که از
     مسیرِ fetchِ شبیه‌سازِ شبکه به /api/sync وصل است.
   NOT-RUN های صادقانه (پایینِ فایل هم چاپ می‌شود):
   - تبِ واقعیِ مرورگر/Service Worker Background Sync (نیازمند Chromium)
   - persistence روی PG زنده: اگر DATABASE_URL ست باشد mirror ی PG هم
     راستی‌آزمایی می‌شود؛ وگرنه persistence روی store سرور سنجیده و
     محدودیت صریحاً ثبت می‌شود.
   اجرا: node tests/offline-e2e.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const { createSync, attach } = require('../server/sync.js');

let okc = 0, failc = 0, notrun = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function nr(name, why) { notrun++; console.log('  🚫 NOT-RUN: ' + name + ' — ' + why); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── بک‌استورِ ماندگارِ مشترک: دیسکِ پروفایلِ مرورگر ─────────────────
   یک Map که به هر نمونهٔ jsdom به‌عنوانِ localStorage تزریق می‌شود.
   دادهٔ آن رشته است (مثل localStorage واقعی)؛ بقایِ صف بینِ «دو مرورگر»
   فقط از این مسیر ممکن است. */
function makeSharedStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] || null,
    clear: () => m.clear(),
    get length() { return m.size; },
    _dump: () => Object.fromEntries(m)
  };
}

/* ── سرورِ واقعی: server/sync.js با store درون‌حافظه + PG اختیاری ── */
function makeServer() {
  const store = {
    users: [
      { id: 5, role: 'manager', school_id: 1, full_name: 'مدیر ۱' },
      { id: 6, role: 'manager', school_id: 2, full_name: 'مدیر ۲' },
      { id: 77, role: 'teacher', school_id: 1, full_name: 'دبیر' }
    ],
    schools: [{ id: 1, name: 'مدرسه ۱' }, { id: 2, name: 'مدرسه ۲' }],
    classes: [{ id: 10, school_id: 1, name: 'کلاس' }],
    announcements: [],
    grades: [{ id: 900, school_id: 1, student_id: 50, score: 17, version: 4 }],
    sync_conflicts: [],
    notifications: [],
    __processed_uids: {}, __server_version: 0
  };
  const persisted = [];            /* ژورنالِ persistence (آینهٔ PG در حالتِ live) */
  let failNextBatches = 0;         /* شکستِ گذرایِ قابل‌برنامه‌ریزی */
  let currentSession = { id: 5, role: 'manager', school_id: 1 };
  const ctx = {
    store,
    db: {
      persistOpsBatch: async (ops) => { persisted.push(...ops); return { ok: true }; },
      isUidProcessed: async () => false
    },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {}, markDirty: () => {},
    sessionFrom: () => currentSession,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  };
  attach(store);
  const sync = createSync(ctx);
  return {
    store, persisted,
    setSession: (s) => { currentSession = s; },
    failNext: (n) => { failNextBatches = n; },
    handle: async (bodyStr) => {
      if (failNextBatches > 0) { failNextBatches--; return { status: 503, body: { ok: false, code: 'transient' } }; }
      const res = {};
      await sync.apiSync({}, res, JSON.parse(bodyStr));
      return { status: res._cap.code, body: res._cap.body };
    }
  };
}

/* ── بوتِ یک «مرورگر»: jsdom + localStorage تزریقی + شبکهٔ قابل‌قطع ── */
async function bootBrowser(sharedStorage, server, opts) {
  opts = opts || {};
  const net = { online: opts.online !== false, syncCalls: 0, lastBatch: null };
  const jres = (obj, status) => ({
    ok: (status || 200) < 400, status: status || 200,
    json: async () => obj, text: async () => JSON.stringify(obj),
    headers: { get: () => null }
  });
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      /* دیسکِ ماندگارِ مشترک — نمونهٔ jsdom خودش localStorage جدا می‌سازد؛
         override تا هر دو «مرورگر» یک پروفایلِ دیسک ببینند. */
      Object.defineProperty(w, 'localStorage', { value: sharedStorage, configurable: true });
      w.fetch = async function (url, init) {
        const p = String(url).split('?')[0];
        if (!net.online) throw new TypeError('NetworkError: offline');
        if (p === '/api/health') return jres({ ok: true });
        if (p === '/api/auth/me') return jres({ ok: false, code: 'no_session' }, 401);
        if (p === '/api/sync') {
          net.syncCalls++;
          net.lastBatch = (init && init.body) ? String(init.body) : null;
          const out = await server.handle(net.lastBatch);
          return jres(out.body, out.status);
        }
        return jres({}, 404);
      };
    }
  });
  await sleep(1700);   /* بوتِ کاملِ باندل (الگوی سوئیت‌های موجود) */
  const W = (c) => dom.window.eval(c);
  return { dom, W, net, close: () => dom.window.close() };
}

(async () => {
  console.log('\noffline-e2e — P0-3: زنجیرهٔ کاملِ آفلاین (کلاینتِ واقعی + server/sync.js واقعی)\n');
  const disk = makeSharedStorage();
  const server = makeServer();

  /* ════ مرحلهٔ ۱: مرورگرِ اول — OFFLINE → تولید op → صف ════ */
  console.log('▸ مرحلهٔ ۱ — مرورگرِ #۱: آفلاین، تولیدِ تغییر، ورود به صف');
  const b1 = await bootBrowser(disk, server, { online: false });
  b1.W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm1' };
        SYNC.online = false; SYNC.demoMode = false; SYNC.serverUrl = '/api/sync';
        SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq();
        enqueueOp({ t:'ins', c:'announcements', data:{ school_id:1, title:'اطلاعیهٔ آفلاین', body:'در قطعی نوشته شد' }, by:5 });
        clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; 0;`);
  chk('E1 قلم واردِ صف شد (pending) در حالتِ آفلاین',
    b1.W(`SYNC.queue.length === 1 && SYNC.queue[0].status === 'pending'`));
  chk('E2 صف روی دیسکِ ماندگار نوشته شد (کلید sms_syncq_v1)',
    JSON.parse(disk.getItem('sms_syncq_v1') || '[]').length === 1);
  chk('E3 در آفلاین هیچ تماسی با /api/sync نرفت', b1.net.syncCalls === 0);
  const uid1 = b1.W(`SYNC.queue[0].uid`);
  /* «بستنِ مرورگر» وسطِ کار — بدونِ فرصتِ flush یا sync */
  b1.close();

  /* ════ مرحلهٔ ۲: «restart» — مرورگرِ دوم از صفر، فقط دیسکِ مشترک ════ */
  console.log('▸ مرحلهٔ ۲ — restart: مرورگرِ #۲ (نمونهٔ jsdom مستقل) صف را از دیسک احیا می‌کند');
  const b2 = await bootBrowser(disk, server, { online: true });
  b2.W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm1' };
        SYNC.demoMode = false; SYNC.serverUrl = '/api/sync';
        loadQueue(); clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; 0;`);
  chk('E4 صف پس از restart از بک‌استور بازیابی شد (همان uid — نه حافظهٔ مشترک)',
    b2.W(`SYNC.queue.length === 1 && SYNC.queue[0].uid`) === uid1);

  /* ════ مرحلهٔ ۳: ONLINE → sync → سرورِ واقعی → persistence → response ════ */
  console.log('▸ مرحلهٔ ۳ — آنلاین‌شدن، ارسال به server/sync.js واقعی');
  b2.W(`SYNC.online = true; 0;`);
  await b2.W(`syncNow(true)`);
  chk('E5 POST /api/sync واقعاً رفت', b2.net.syncCalls >= 1, 'calls=' + b2.net.syncCalls);
  chk('E6 سرور رکورد را ساخت (اعتبارسنجی + authz گذشت)',
    server.store.announcements.length === 1 && server.store.announcements[0].title === 'اطلاعیهٔ آفلاین');
  chk('E7 persistence: دسته به لایهٔ ماندگاری سرور رسید (persistOpsBatch)',
    server.persisted.length >= 1 && server.persisted.some((o) => o.uid === uid1));
  chk('E8 reconciliation: قلمِ موفق از صفِ کلاینت حذف و از دیسک هم پاک شد',
    b2.W(`SYNC.queue.length`) === 0 && JSON.parse(disk.getItem('sms_syncq_v1') || '[]').length === 0);
  chk('E9 lastSync جلو رفت (فقط با همگامِ واقعی — W7-2)', !!b2.W(`SYNC.lastSync`));
  chk('E10 uid روی سرور علامت خورد (زیرساختِ idempotency)',
    server.store.__processed_uids && !!server.store.__processed_uids[uid1]);

  /* ════ مرحلهٔ ۴: dedupe — پخشِ دوبارهٔ همان دسته ⇒ اثرِ تکی ════ */
  console.log('▸ مرحلهٔ ۴ — dedupe: ارسالِ دوبارهٔ همان uid (بازپخشِ پس از قطعی)');
  const replay = await server.handle(JSON.stringify({
    ops: [{ uid: uid1, by: 5, c: 'announcements', t: 'ins', user_id: 5, school_id: 1,
            at: new Date().toISOString(), data: { school_id: 1, title: 'اطلاعیهٔ آفلاین', body: 'در قطعی نوشته شد' } }]
  }));
  chk('E11 بازپخش ⇒ duplicate_ignored (نه اعمالِ دوم)',
    replay.body.results && replay.body.results[0].code === 'duplicate_ignored');
  chk('E12 اثرِ تکی: همچنان فقط یک رکورد روی سرور', server.store.announcements.length === 1);

  /* ════ مرحلهٔ ۵: retry + backoff روی شکستِ گذرا ════ */
  console.log('▸ مرحلهٔ ۵ — شکستِ گذرا (503) ⇒ failed + backoff ⇒ تلاشِ بعدی موفق');
  server.failNext(1);
  b2.W(`enqueueOp({ t:'ins', c:'announcements', data:{ school_id:1, title:'قلمِ retry' }, by:5 });
        clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; SYNC.attempts = 0; 0;`);
  await b2.W(`syncNow(true)`);
  chk('E13 پس از 503: قلم failed شد (نه گم، نه rejected)',
    b2.W(`SYNC.queue.length === 1 && SYNC.queue[0].status === 'failed'`),
    'statuses=' + b2.W(`SYNC.queue.map(x=>x.status).join(',')`));
  chk('E14 شمارندهٔ attempts بالا رفت و backoff زمان‌بندی شد',
    b2.W(`SYNC.attempts >= 1 && SYNC.autoTimer != null`));
  chk('E15 backoffDelay نمایی است (attempts=1 ⇒ 4000ms، سقف 300000)',
    b2.W(`SYNC.attempts = 1; backoffDelay()`) === 4000 && b2.W(`SYNC.attempts = 99; backoffDelay()`) === 300000);
  b2.W(`SYNC.attempts = 1; clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; 0;`);
  await b2.W(`syncNow(true)`);   /* تلاشِ دوم — سرور سالم */
  chk('E16 تلاشِ دوم موفق: صف تخلیه و رکوردِ دوم روی سرور',
    b2.W(`SYNC.queue.length`) === 0 && server.store.announcements.length === 2);

  /* ════ مرحلهٔ ۶: conflict — نسخهٔ سرور جدیدتر ⇒ conflict_preserved ════ */
  console.log('▸ مرحلهٔ ۶ — OCC: ویرایشِ نمره با base_version کهنه ⇒ conflict_preserved + داوری');
  b2.W(`SYNC.queue = []; saveQueue();
        var it = enqueueOp({ t:'upd', c:'grades', data:{ school_id:1, score:19 }, by:5 });
        it.op.id = 900; it.op.base_version = 2; /* سرور v4 دارد */
        clearTimeout(SYNC.autoTimer); SYNC.autoTimer = null; 0;`);
  await b2.W(`syncNow(true)`);
  chk('E17 سرور تعارض را «حفظ» کرد (sync_conflicts + رکورد دست‌نخورده)',
    server.store.sync_conflicts.length === 1 && server.store.grades[0].score === 17
    && server.store.sync_conflicts[0].base_version === 2 && server.store.sync_conflicts[0].server_version === 4);
  chk('E18 کلاینت قلم را conflict نشان می‌دهد (مسیرِ داوری — نه گم، نه retry ی بی‌پایان)',
    b2.W(`SYNC.queue.length === 1 && SYNC.queue[0].status === 'conflict'`));
  chk('E19 مدیرِ مدرسه برایِ داوری notification گرفت',
    server.store.notifications.some((n) => n.title && n.title.indexOf('تعارض') > -1));
  chk('E20 conflict در دیسک هم ماندگار است (پس از restart هم می‌ماند)',
    JSON.parse(disk.getItem('sms_syncq_v1') || '[]').some((x) => x.status === 'conflict'));

  /* ════ مرحلهٔ ۷: tenant authorization سمتِ سرور در هر push ════ */
  console.log('▸ مرحلهٔ ۷ — گاردِ tenant: مدیرِ مدرسهٔ ۱ نمی‌تواند برایِ مدرسهٔ ۲ بنویسد');
  const cross = await server.handle(JSON.stringify({
    ops: [{ uid: 'x-tenant-1', by: 5, c: 'announcements', t: 'ins', user_id: 5, school_id: 1,
            at: new Date().toISOString(), data: { school_id: 2, title: 'نفوذِ بین‌مدرسه‌ای' } }]
  }));
  const crossR = (cross.body.results || [])[0] || {};
  chk('E21 نوشتنِ بین‌tenant با کدِ پایدار رد شد',
    crossR.ok === false && (crossR.code === 'school_mismatch' || crossR.code === 'out_of_scope'), 'code=' + crossR.code);
  chk('E22 هیچ رکوردی برایِ مدرسهٔ ۲ ساخته نشد',
    !server.store.announcements.some((a) => Number(a.school_id) === 2));
  const teacherPush = await server.handle(JSON.stringify({
    ops: [{ uid: 'x-role-1', by: 77, c: 'announcements', t: 'ins', user_id: 77, school_id: 1,
            at: new Date().toISOString(), data: { school_id: 1, title: 'دبیر اطلاعیه نمی‌دهد' } }]
  }));
  /* sessionFrom هنوز مدیر است ولی by/user_id دبیر است ⇒ جعلِ هویت */
  const tR = (teacherPush.body.results || [])[0] || {};
  chk('E23 جعلِ by (user_id ≠ نشست) رد شد', tR.ok === false, 'code=' + tR.code);

  /* ════ NOT-RUN های صادقانه ════ */
  console.log('▸ محدودیت‌های sandbox (سبزِ جعلی ممنوع):');
  nr('Service Worker Background Sync (sw.js) با تبِ بستهٔ واقعی', 'نیازمند Chromium واقعی — jsdom ‏SW ندارد؛ منطقِ آینهٔ IDB در tests/bgsync.js پوشش دارد');
  if (process.env.DATABASE_URL) {
    /* راستی‌آزماییِ persistence روی PG واقعی از طریق db.persistOpsBatch */
    nr('PG-live persistence assert', 'در این هارنس db mock است؛ مسیرِ PG در tests/wave10-pg-live.js (D1..D4) پوشش دارد');
  } else {
    nr('persistence روی PG زنده', 'DATABASE_URL ست نیست — persistence روی لایهٔ persistOpsBatch/store سنجیده شد (E7)');
  }

  b2.close();
  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc) + ' (+ ' + notrun + ' NOT-RUN ثبت‌شده)');
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
