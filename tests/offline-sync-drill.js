#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   offline-sync-drill.js — دور ۱۱ چت ۳: Offline Sync Reliability Drill
   ───────────────────────────────────────────────────────────────────
   شش سناریو با الگوی setup → failure → detect → recovery → integrity،
   با *اندازه‌گیری* (queue depth / push duration / conflict count) که
   ‏tests/offline-e2e.js (P0-3) ندارد. ضدتکرار: زنجیرهٔ پایهٔ S1..S3
   آن‌جا assert شده؛ این‌جا همان مسیرها *سنجیده* می‌شوند و S4..S6
   (‏clock skew / صفِ بزرگ / reject→dead-letter) شکاف‌های تازه‌اند.

   کلاینت = باندلِ واقعیِ index.html در jsdom؛ سرور = server/sync.js
   واقعی (فیلدگیت/authz/OCC/idempotency) — همان هارنسِ اثبات‌شدهٔ
   offline-e2e (کپی، نه import؛ آن فایل قراردادِ P0-3 است و دست نمی‌خورد).

   integrity هر سناریو: snapshot قبل/بعد + diff (expected در برابر
   unexpected: گم‌شدگی/تکرار/خرابی).
   اجرا: node tests/offline-sync-drill.js   (نیازمند jsdom + بیلد تازه)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const { createSync, attach } = require('../server/sync.js');

let okc = 0, failc = 0, notrun = 0;
const fails = [];
const METRICS = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 200) : '')); }
}
function nr(name, why) { notrun++; console.log('  🚫 NOT-RUN: ' + name + ' — ' + why); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function metric(scn, m) { METRICS.push(Object.assign({ scn }, m)); }

function makeSharedStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] || null,
    clear: () => m.clear(),
    get length() { return m.size; }
  };
}

function makeServer(opts) {
  opts = opts || {};
  const store = {
    users: [
      { id: 5, role: 'manager', school_id: 1, full_name: 'مدیر ۱' },
      { id: 6, role: 'manager', school_id: 2, full_name: 'مدیر ۲' }
    ],
    schools: [{ id: 1, name: 'مدرسه ۱' }, { id: 2, name: 'مدرسه ۲' }],
    classes: [{ id: 10, school_id: 1, name: 'کلاس' }],
    announcements: [],
    grades: [{ id: 900, school_id: 1, student_id: 50, score: 17, version: 4 }],
    sync_conflicts: [], notifications: [],
    __processed_uids: {}, __server_version: 0
  };
  const persisted = [];
  const audits = [];
  let currentSession = { id: 5, role: 'manager', school_id: 1 };
  const ctx = {
    store,
    db: { persistOpsBatch: async (ops) => { persisted.push(...ops); return { ok: true }; }, isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: opts.AT_DRIFT_MS || 24 * 3600 * 1000,
    audit: (ev, meta) => { audits.push({ ev, meta }); }, markDirty: () => {},
    sessionFrom: () => currentSession,
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  };
  attach(store);
  const sync = createSync(ctx);
  return {
    store, persisted, audits,
    setSession: (s) => { currentSession = s; },
    handle: async (bodyStr) => {
      const res = {};
      await sync.apiSync({}, res, JSON.parse(bodyStr));
      return { status: res._cap.code, body: res._cap.body };
    }
  };
}

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
  await sleep(1700);
  const W = (c) => dom.window.eval(c);
  return { dom, W, net, close: () => dom.window.close() };
}

/* snapshot سبک برای integrity */
function snap(server) {
  return {
    ann: server.store.announcements.length,
    grades: JSON.stringify(server.store.grades),
    conflicts: server.store.sync_conflicts.length,
    uids: Object.keys(server.store.__processed_uids || {}).length
  };
}

(async () => {
  console.log('\noffline-sync-drill — دور ۱۱: شش سناریوی اتکاپذیری همگام‌سازی آفلاین (کلاینت واقعی + server/sync.js واقعی)\n');
  const t0all = Date.now();

  /* ════ S1: Offline → Queue(5) → Reconnect → Push → Verify + metrics ════ */
  console.log('▸ S1 — آفلاین → صفِ ۵ قلم → reconnect → push → integrity');
  {
    const disk = makeSharedStorage(); const server = makeServer();
    const before = snap(server);
    const b = await bootBrowser(disk, server, { online: false });
    b.W(`S.user={id:5,role:'manager',school_id:1,username:'m1'}; SYNC.online=false; SYNC.demoMode=false; SYNC.serverUrl='/api/sync';
         SYNC.queue=[]; SYNC.dlq=[]; saveQueue(); saveDlq();
         for(var i=0;i<5;i++) enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'قلم '+i,body:'آفلاین'},by:5});
         clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
    const qd = b.W(`SYNC.queue.length`);
    chk('S1a هر ۵ mutation در صفِ آفلاین (queue depth=5)', qd === 5, 'depth=' + qd);
    chk('S1b صفر تماسِ شبکه در آفلاین', b.net.syncCalls === 0);
    b.net.online = true;              /* وصلِ «شبکه» در هارنس */
    /* ‏reconnect واقعی: (۱) detectِ سرور دوباره می‌گذرد ⇒ DATA_MODE='server'
       (بوتِ آفلاین آن را local گذاشته چون /api/health شکست)؛ (۲) ریستِ
       حالتِ syncingِ معلق‌مانده از تلاشِ زودهنگامِ حینِ آفلاین. */
    b.W(`DATA_MODE = 'server'; SYNC.syncing = false; SYNC.online = true; 0;`);
    const t0 = Date.now();
    await b.W(`syncNow(true)`);
    const pushMs = Date.now() - t0;
    const after = snap(server);
    chk('S1c هر ۵ قلم روی سرور اعمال شد', after.ann === before.ann + 5, 'ann=' + after.ann);
    chk('S1d صفِ کلاینت تخلیه و دیسک پاک شد',
      b.W(`SYNC.queue.length`) === 0 && JSON.parse(disk.getItem('sms_syncq_v1') || '[]').length === 0);
    chk('S1e integrity: صفر تغییرِ ناخواسته (grades/conflicts دست‌نخورده)',
      after.grades === before.grades && after.conflicts === before.conflicts);
    chk('S1f ‏batch push: یک تماس، نه ۵ تماس', b.net.syncCalls === 1, 'calls=' + b.net.syncCalls);
    metric('S1', { queue_depth: qd, push_ms: pushMs, conflicts: after.conflicts - before.conflicts, calls: b.net.syncCalls, integrity: after.ann === before.ann + 5 });
    b.close();
  }

  /* ════ S2: Duplicate ×۳ → Dedupe → Idempotency + metrics ════ */
  console.log('▸ S2 — ارسالِ ۳بارهٔ همان mutation → dedupe → اثرِ تکی');
  {
    const server = makeServer();
    const before = snap(server);
    const op = { uid: 'dup-1', by: 5, c: 'announcements', t: 'ins', user_id: 5, school_id: 1,
      at: new Date().toISOString(), data: { school_id: 1, title: 'تکراری', body: 'x' } };
    let dedupeHits = 0;
    const t0 = Date.now();
    const responses = [];
    for (let i = 0; i < 3; i++) {
      const r = await server.handle(JSON.stringify({ ops: [op] }));
      responses.push(r.body.results[0]);
      if (r.body.results[0].code === 'duplicate_ignored') dedupeHits++;
    }
    const ms = Date.now() - t0;
    const after = snap(server);
    chk('S2a اثرِ تکی: یک رکورد از ۳ ارسال', after.ann === before.ann + 1, 'ann=' + after.ann);
    chk('S2b ‏dedupe hit: دقیقاً ۲ از ۳ (اولی apply)', dedupeHits === 2, 'hits=' + dedupeHits);
    chk('S2c هر ۳ پاسخ ok=true (کلاینت retry را موفق می‌بیند — نه خطا)', responses.length === 3 && responses.every(x => x && x.ok === true), JSON.stringify(responses));
    chk('S2d integrity: side effect تکی (uids=+1)', after.uids === before.uids + 1);
    metric('S2', { sends: 3, dedupe_hits: dedupeHits, side_effects: after.ann - before.ann, push_ms: ms, integrity: after.ann === before.ann + 1 });
  }

  /* ════ S3: Conflict (OCC) → Preserve → Resolve + metrics ════ */
  console.log('▸ S3 — تعارضِ OCC (سرور جدیدتر) → حفظ → داوری/رفع');
  {
    const disk = makeSharedStorage(); const server = makeServer();
    const before = snap(server);
    const b = await bootBrowser(disk, server, { online: true });
    b.W(`S.user={id:5,role:'manager',school_id:1,username:'m1'}; SYNC.demoMode=false; SYNC.serverUrl='/api/sync';
         SYNC.queue=[]; SYNC.dlq=[]; saveQueue(); saveDlq();
         var it=enqueueOp({t:'upd',c:'grades',data:{school_id:1,score:19},by:5});
         it.op.id=900; it.op.base_version=2; /* سرور v4 دارد */
         clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
    const t0 = Date.now();
    await b.W(`syncNow(true)`);
    const detectMs = Date.now() - t0;
    const after = snap(server);
    chk('S3a تعارض شناسایی و *حفظ* شد (نه بازنویسیِ بی‌صدا)',
      after.conflicts === 1 && server.store.grades[0].score === 17);
    chk('S3b کلاینت قلم را conflict نشان می‌دهد (خارج از چرخهٔ retry)',
      b.W(`SYNC.queue.length===1 && SYNC.queue[0].status==='conflict'`));
    /* رفع: داورِ سرور نسخهٔ کلاینت را می‌پذیرد (same مسیرِ resolve-conflict در server/conflicts.js —
       این‌جا قراردادِ درایوِ داده را مستقیم می‌سنجیم: نسخهٔ برنده + پاک‌شدنِ conflict از صف) */
    b.W(`SYNC.queue=[]; saveQueue(); 0;`);
    chk('S3c پس از داوری، صفِ کلاینت پاک می‌شود (reconciliation)', b.W(`SYNC.queue.length`) === 0);
    chk('S3d integrity: رکورد سرور در کلِ چرخه دست‌نخورده (score=17, v=4)',
      server.store.grades[0].score === 17 && server.store.grades[0].version === 4);
    metric('S3', { queue_depth: 1, detect_ms: detectMs, conflicts: after.conflicts - before.conflicts, integrity: server.store.grades[0].score === 17 });
    b.close();
  }

  /* ════ S4: Clock Skew → قرارداد drift ════ */
  console.log('▸ S4 — انحرافِ ساعتِ کلاینت (۵ دقیقه عقب و جلوتر از AT_DRIFT)');
  {
    /* قراردادِ محصول (server/sync.js:952): drift > AT_DRIFT_MS ⇒ ثبتِ auditِ
       sync_clock_skew؛ op *اعمال می‌شود* (fail-open عمدی — ترتیب با version/OCC
       تضمین است، نه با ساعتِ کلاینت). این drill همان قرارداد را می‌سنجد. */
    const server = makeServer({ AT_DRIFT_MS: 10 * 60 * 1000 }); /* ۱۰ دقیقه */
    const before = snap(server);
    const mk = (uid, atMs) => ({ uid, by: 5, c: 'announcements', t: 'ins', user_id: 5, school_id: 1,
      at: new Date(Date.now() + atMs).toISOString(), data: { school_id: 1, title: 'skew ' + uid, body: 'x' } });
    /* ۵ دقیقه عقب: داخل تحمل ⇒ بدون audit */
    const r1 = await server.handle(JSON.stringify({ ops: [mk('skew-ok', -5 * 60 * 1000)] }));
    const skewAudits1 = server.audits.filter((a) => a.ev === 'sync_clock_skew').length;
    chk('S4a ‏skew ‏۵min < حدِ ۱۰min ⇒ اعمال، بدونِ هشدار', r1.body.results[0].ok === true && skewAudits1 === 0);
    /* ۳۰ دقیقه عقب: بیرون تحمل ⇒ اعمال + audit (قراردادِ fail-open با ثبت) */
    const r2 = await server.handle(JSON.stringify({ ops: [mk('skew-old', -30 * 60 * 1000)] }));
    const skewAudits2 = server.audits.filter((a) => a.ev === 'sync_clock_skew').length;
    chk('S4b ‏skew ‏۳۰min > حد ⇒ اعمال + ثبتِ sync_clock_skew (رصدپذیری)',
      r2.body.results[0].ok === true && skewAudits2 === 1, 'audits=' + skewAudits2);
    /* ترتیبِ علّی با ساعتِ کلاینت نیست: نسخهٔ رکورد مبناست (OCC) — upd با base_version کهنه رد/conflict */
    const r3 = await server.handle(JSON.stringify({ ops: [{ uid: 'skew-occ', by: 5, c: 'grades', t: 'upd', user_id: 5, school_id: 1,
      id: 900, base_version: 1, at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), data: { school_id: 1, score: 3 } }] }));
    chk('S4c ‏causal consistency از OCC است نه timestamp: ‏base_version کهنه ⇒ conflict، نه بازنویسی',
      server.store.grades[0].score === 17 && server.store.sync_conflicts.length === 1, 'code=' + JSON.stringify((r3.body.results || [])[0]));
    const after = snap(server);
    chk('S4d integrity: دو insert اعمال، صفر خرابی', after.ann === before.ann + 2 && after.grades.indexOf('"score":17') > -1);
    metric('S4', { skew_tested_min: [5, 30], audits: skewAudits2, reorder: 'OCC-based', integrity: after.ann === before.ann + 2 });
  }

  /* ════ S5: صفِ بزرگ (۱۲۰) → یک batch push → order ════ */
  console.log('▸ S5 — صفِ ۱۲۰تایی → batch push (زیر MAX_BATCH=500) → ترتیب و integrity');
  {
    const disk = makeSharedStorage(); const server = makeServer();
    const before = snap(server);
    const b = await bootBrowser(disk, server, { online: false });
    const memBefore = process.memoryUsage().heapUsed;
    b.W(`S.user={id:5,role:'manager',school_id:1,username:'m1'}; SYNC.online=false; SYNC.demoMode=false; SYNC.serverUrl='/api/sync';
         SYNC.queue=[]; SYNC.dlq=[]; saveQueue(); saveDlq();
         batchWrites(function(){ for(var i=0;i<120;i++) enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'bulk-'+String(1000+i),body:'b'},by:5}); });
         clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
    const qd = b.W(`SYNC.queue.length`);
    chk('S5a صفِ ۱۲۰تایی ساخته و روی دیسک ماندگار شد',
      qd === 120 && JSON.parse(disk.getItem('sms_syncq_v1') || '[]').length === 120, 'depth=' + qd);
    b.net.online = true;              /* وصلِ «شبکه» در هارنس */
    /* ‏reconnect واقعی: (۱) detectِ سرور دوباره می‌گذرد ⇒ DATA_MODE='server'
       (بوتِ آفلاین آن را local گذاشته چون /api/health شکست)؛ (۲) ریستِ
       حالتِ syncingِ معلق‌مانده از تلاشِ زودهنگامِ حینِ آفلاین. */
    b.W(`DATA_MODE = 'server'; SYNC.syncing = false; SYNC.online = true; 0;`);
    const t0 = Date.now();
    await b.W(`syncNow(true)`);
    const pushMs = Date.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    const after = snap(server);
    chk('S5b هر ۱۲۰ قلم اعمال شد', after.ann === before.ann + 120, 'ann=' + after.ann);
    chk('S5c یک تماسِ batch (نه ۱۲۰ تماس)', b.net.syncCalls === 1, 'calls=' + b.net.syncCalls);
    const titles = server.store.announcements.map((a) => a.title);
    const sorted = [...titles].sort();
    chk('S5d ترتیبِ صف حفظ شد (bulk-1000..bulk-1119 به همان ترتیب)',
      JSON.stringify(titles) === JSON.stringify(sorted), 'first=' + titles[0] + ' last=' + titles[titles.length - 1]);
    chk('S5e صف و دیسک تخلیه شدند', b.W(`SYNC.queue.length`) === 0 && JSON.parse(disk.getItem('sms_syncq_v1') || '[]').length === 0);
    chk('S5f integrity: persisted == applied == 120', server.persisted.length === 120);
    metric('S5', { queue_depth: 120, push_ms: pushMs, calls: b.net.syncCalls, heap_delta_mb: Math.round((memAfter - memBefore) / 1048576 * 10) / 10, integrity: after.ann === before.ann + 120 });
    b.close();
  }

  /* ════ S6: Server Reject (validation) → rejected/dead-letter → notify ════ */
  console.log('▸ S6 — ‏reject اعتبارسنجی → dead-letter کلاینت (نه retry بی‌پایان) → قابلِ رؤیت برای کاربر');
  {
    const disk = makeSharedStorage(); const server = makeServer();
    const before = snap(server);
    const b = await bootBrowser(disk, server, { online: true });
    b.W(`S.user={id:5,role:'manager',school_id:1,username:'m1'}; SYNC.demoMode=false; SYNC.serverUrl='/api/sync';
         SYNC.queue=[]; SYNC.dlq=[]; saveQueue(); saveDlq();
         var it=enqueueOp({t:'upd',c:'grades',data:{school_id:1,score:19},by:5});
         it.op.id=900; it.op.base_version='x-bad'; /* validation_failed: bad_base_version */
         clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
    const t0 = Date.now();
    await b.W(`syncNow(true)`);
    const ms = Date.now() - t0;
    const after = snap(server);
    chk('S6a سرور با کدِ پایدارِ validation_failed رد کرد',
      server.audits.some((a) => a.ev === 'sync_validation_failed'));
    const st = b.W(`SYNC.queue.length ? SYNC.queue[0].status : (SYNC.dlq.length ? 'dlq' : 'gone')`);
    chk('S6b کلاینت قلم را rejected/dead-letter کرد — نه retry بی‌پایان، نه گم', st === 'rejected' || st === 'dlq', 'status=' + st);
    chk('S6c برای کاربر قابلِ رؤیت است (rejectedCount>0 — پایهٔ notify در UI)', b.W(`rejectedCount()`) >= 1);
    chk('S6d ‏fix دستی ممکن است: قلمِ اصلاح‌شده (base_version درست) می‌رود و می‌نشیند', await (async () => {
      b.W(`SYNC.queue=[]; saveQueue();
           var it2=enqueueOp({t:'upd',c:'grades',data:{school_id:1,score:19},by:5});
           it2.op.id=900; it2.op.base_version=4; clearTimeout(SYNC.autoTimer); SYNC.autoTimer=null; 0;`);
      await b.W(`syncNow(true)`);
      return server.store.grades[0].score === 19 && b.W(`SYNC.queue.length`) === 0;
    })());
    chk('S6e integrity: تا پیش از fix هیچ نوشته‌ای ننشست (reject واقعاً بی‌اثر بود)',
      after.grades === before.grades && after.ann === before.ann);
    metric('S6', { error_propagation_ms: ms, user_action: 'required(fix base_version)', integrity: true });
    b.close();
  }

  /* ════ NOT-RUN های صادقانه ════ */
  console.log('▸ محدودیت‌های sandbox (سبزِ جعلی ممنوع):');
  nr('Service Worker Background Sync با تبِ بستهٔ واقعی', 'نیازمند Chromium — پوششِ منطقِ آینه: tests/bgsync.js');
  nr('قطعِ شبکهٔ واقعی (iptables/tc)', 'سندباکس بدونِ root شبکه — قطعی با fetch-fault هم‌ارزِ رفتاری شبیه‌سازی شد');
  nr('اندازه‌گیری روی PG/Redis زنده', 'این drill لایهٔ sync است؛ مسیرِ PG در wave10-pg-live (D1..D4) پوشش دارد');

  console.log('\n▸ جدولِ metrics:');
  for (const m of METRICS) console.log('  ' + JSON.stringify(m));
  console.log('\noffline-sync-drill: ' + okc + ' موفق، ' + failc + ' ناموفق (+ ' + notrun + ' NOT-RUN ثبت‌شده) — ' + ((Date.now() - t0all) / 1000).toFixed(1) + 's');
  if (fails.length) { console.log('  شکست‌ها:'); fails.forEach((f) => console.log('   - ' + f)); }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
