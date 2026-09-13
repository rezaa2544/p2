#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   sync-del-mirror.js — S7-8 (باگ‌هانت چت ۵، نشست ۷)

   آینهٔ IndexedDB برای Background Sync (W8-1) باید هم‌گام با صفِ زنده بماند:
   خودِ `bgMirrorQueue()` در شاخهٔ حذف صریح می‌گوید قلم‌هایی که «دیگر در صفِ
   زنده نیستند (synced/rejected/حذف‌شده) از آینه پاک شوند». اما اکشنِ
   «حذفِ دستی» (`sync-del`) فقط صف و DLQ را می‌ریخت و save می‌کرد و هیچ
   مسیری به آینه نداشت — و برخلافِ `sync-retry` هیچ `scheduleSync()` هم
   برنامه‌ریزی نمی‌کرد. نتیجه: قلمِ حذف‌شده در IDB با status= pending/failed
   می‌ماند و رویدادِ بعدیِ sync (تبِ بسته) آن را دوباره می‌فرستد — یعنی
   کاربر چیزی را که صریحاً حذف کرده بود، سرور اعمال می‌کند.

   این سوئیت آن ناوردایی را می‌سنجد:
     D1  enqueue → قلم در آینه هست (سنجهٔ سلامت)
     D2  sync-del → از صفِ زنده حذف شد
     D3  و آینه هم پاک شد                     ← پیش از رفع: قرمز
     D4  حذفِ قلمِ DLQ هم آینه را پاک می‌کند  ← پیش از رفع: قرمز
     D5  کنترلِ منفی: قلمِ نامرتبطِ pending در آینه می‌ماند (حذفِ بی‌رویه نه)
     D6  sync-retry → آینه وضعِ pending را نشان می‌دهد (هم‌گامیِ مسیرِ بازگشت)
   اجرا: node tests/sync-del-mirror.js (jsdom · بدونِ سرور/پورت)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jres = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, headers: { get: () => null } });

function fakeIdb() {
  const stores = { entities: new Map(), sync_queue: new Map(), metadata: new Map() };
  const keyOf = (store, v) => store === 'entities' ? JSON.stringify([v.c, v.id]) : (store === 'sync_queue' ? v.uid : v.key);
  function mkReq(result) {
    const r = { onsuccess: null, onerror: null, result };
    setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
    return r;
  }
  const db = {
    objectStoreNames: { contains: (n) => !!stores[n] },
    transaction(names) {
      return { objectStore(n) {
        const m = stores[n];
        return {
          index: () => null, indexNames: { contains: () => false },
          put(v) { m.set(keyOf(n, v), JSON.parse(JSON.stringify(v))); return mkReq(true); },
          get(k) { return mkReq(m.get(k) || null); },
          getAll() { return mkReq(Array.from(m.values())); },
          delete(k) { m.delete(k); return mkReq(true); },
          clear() { m.clear(); return mkReq(true); }
        };
      } };
    },
    close() {}
  };
  return {
    _stores: stores,
    open() {
      const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db };
      setTimeout(() => { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
      return r;
    }
  };
}

(async () => {
  console.log('\n▸ S7-8 — حذف/بازگردانیِ صف باید آینهٔ IDB را هم‌گام نگه دارد (jsdom)');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = function (url) {
        const p = String(url).split('?')[0];
        if (p === '/api/health') return Promise.resolve(jres({ ok: true }));
        if (p === '/api/auth/me') return Promise.resolve(jres({ ok: false, code: 'no_session' }, 401));
        return Promise.resolve(jres({}, 404));
      };
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);

  const idb = fakeIdb();
  dom.window.__S7IDB = idb;                    /* setBackend باید از جهانِ صفحه دیده شود */
  W('offlineStorage.setBackend(window.__S7IDB); 0;');
  await sleep(200);

  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false; SYNC.demoMode = true;
     SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq(); 0;`);

  const mirrorHas = (uid) => {
    let hit = false;
    idb._stores.sync_queue.forEach((v, k) => { if (k === uid) hit = true; });
    return hit;
  };

  /* ── D1: enqueue → آینه ── */
  const uidA = W(`(function(){ var it = enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'حذف‌شدنی'},by:5}); return it.uid; })()`);
  await sleep(700);
  chk('D1 قلمِ enqueue‌شده در آینهٔ IDB هست', mirrorHas(uidA) && idb._stores.sync_queue.size === 1,
    'size=' + idb._stores.sync_queue.size);

  /* ── D2/D3: حذفِ دستی → صف و آینه هر دو ── */
  W(`SYNC_ACTIONS['sync-del']({dataset:{uid:'${uidA}'}}); 0;`);
  chk('D2 قلم از صفِ زنده حذف شد', W('SYNC.queue.length') === 0 && W('SYNC.dlq.length') === 0);
  await sleep(700);
  chk('D3 آینهٔ IDB هم پاک شد (SW قلمِ حذف‌شده را نمی‌فرستد)',
    !mirrorHas(uidA) && idb._stores.sync_queue.size === 0,
    'size=' + idb._stores.sync_queue.size + ' has=' + mirrorHas(uidA));

  /* ── D4: قلمِ مرده (status=rejected) عمداً آینه نمی‌شود؛ حذفش هم چیزی جا نمی‌گذارد ── */
  const uidB = W(`(function(){ var it = enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'مرده'},by:5});
    for(var i=0;i<5;i++) noteOpFailed(it, 'قطع '+i);
    return it.uid; })()`);
  const dupB = W(`(function(){ var it = enqueueOp({t:'upd',c:'grades',data:{score:17},by:5}); return it.uid; })()`);
  await sleep(700);
  chk('D4a قلمِ مرده در آینه نیست (SW نباید قلمِ rejected بفرستد) و قلمِ زنده هست',
    !mirrorHas(uidB) && mirrorHas(dupB) && idb._stores.sync_queue.size === 1,
    'size=' + idb._stores.sync_queue.size);
  W(`SYNC_ACTIONS['sync-del']({dataset:{uid:'${uidB}'}}); 0;`);
  await sleep(700);
  chk('D4b حذفِ قلمِ مرده از DLQ آینه را دست‌نخورده نگه می‌دارد',
    !mirrorHas(uidB) && mirrorHas(dupB),
    'size=' + idb._stores.sync_queue.size);

  /* ── D5: کنترلِ منفی — حذفِ نامرتبط نباید قلمِ زنده را از آینه بردارد ── */
  W(`SYNC_ACTIONS['sync-del']({dataset:{uid:'uid-ناموجود'}}); 0;`);
  await sleep(700);
  chk('D5 کنترلِ منفی: قلمِ زندهٔ دیگر در آینه ماند', mirrorHas(dupB));

  /* ── D6: sync-retry → آینه وضعِ pending را نشان می‌دهد ── */
  const uidC = W(`(function(){ var it = enqueueOp({t:'upd',c:'grades',data:{score:18},by:5});
    for(var i=0;i<5;i++) noteOpFailed(it, 'قطع '+i);
    return it.uid; })()`);
  await sleep(700);
  W(`SYNC_ACTIONS['sync-retry']({dataset:{uid:'${uidC}'}}); 0;`);
  await sleep(700);
  const recC = (() => { let v = null; idb._stores.sync_queue.forEach((x, k) => { if (k === uidC) v = x; }); return v; })();
  chk('D6 پس از retry، آینه قلم را با وضعِ pending نشان می‌دهد',
    !!recC && recC.status === 'pending' && W('SYNC.queue.length') === 2,
    'rec=' + JSON.stringify(recC && { status: recC.status }));

  console.log('');
  console.log('────────────────────────────────────────────────────');
  if (failc) { console.log('sync-del-mirror: ' + okc + '/' + (okc + failc) + ' موفق ❌\n' + fails.map((f) => '   ' + f).join('\n')); }
  else console.log('sync-del-mirror: ' + okc + '/' + okc + ' موفق ✅');
  console.log('────────────────────────────────────────────────────');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL: ' + (e && e.stack || e)); process.exit(1); });
