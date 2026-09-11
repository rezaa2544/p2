/* ─────────────────────────────────────────────────────────────
   bgsync.js — شکاف ۱ (client-offline-v2): Background Sync
   - آینهٔ صف در IndexedDB: enqueue → قلم در sync_queue می‌نشیند؛
     synced/حذف → از آینه پاک می‌شود (وگرنه SW قلمِ مرده می‌فرستد).
   - bgApplyResult: پیامِ SW پس از تخلیهٔ پس‌زمینه، صفِ محلی را
     آشتی می‌دهد (synced حذف، rejected برچسب می‌خورد، lastSync جلو می‌رود).
   - sw.js: رویدادِ sync با برچسبِ payesh-sync-queue ثبت شده و
     flush به /api/sync با credentials می‌رود (بدونِ توکنِ ذخیره).
   اجرا: node tests/bgsync.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const SW = fs.readFileSync(__dirname + '/../sw.js', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* شبیه‌سازِ سبکِ IndexedDB (فقط آنچه OfflineStorage لازم دارد) */
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
  console.log('\n▸ شکاف ۱ — Background Sync (صفِ آینه در IDB + آشتیِ نتیجهٔ SW)');

  /* ── بخشِ ایستا: sw.js ── */
  chk('S1 sw.js شنوندهٔ sync با برچسبِ payesh-sync-queue دارد',
    /addEventListener\('sync'/.test(SW) && /payesh-sync-queue/.test(SW));
  chk('S2 sw.js صف را از IndexedDB (payesh_offline_v2/sync_queue) می‌خواند',
    /payesh_offline_v2/.test(SW) && /sync_queue/.test(SW));
  chk('S3 sw.js با credentials include به /api/sync می‌فرستد (کوکیِ HttpOnly، بدونِ توکن)',
    /credentials:\s*'include'/.test(SW) && /\/api\/sync/.test(SW) && !/Authorization/i.test(SW));
  chk('S4 sw.js کدهایِ ردِّ پایدار را dead می‌داند (نه retryِ ابدی)',
    /validation_failed/.test(SW) && /stale_base/.test(SW) && /BGSYNC_MAX_TRIES/.test(SW));
  chk('S5 sw.js شکستِ شبکه را reject می‌کند تا مرورگر دوباره sync بزند',
    /bgsync-retry/.test(SW));
  chk('S6 sw.js نتیجه را به تب‌هایِ باز پیام می‌دهد (payesh-bgsync-done)',
    /payesh-bgsync-done/.test(SW) && /postMessage/.test(SW));

  /* ── بخشِ زنده: jsdom ── */
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = (url) => Promise.resolve({ ok: false, status: 404, json: async () => ({}), headers: { get: () => null } });
    }
  });
  const W = (c) => dom.window.eval(c);
  await sleep(1700);

  /* آینه را با بک‌اندِ ساختگی فعال کن */
  const idb = fakeIdb();
  dom.window.offlineStorage.setBackend(idb);
  W(`S.user = { id: 5, role: 'manager', school_id: 1, username: 'm' };
     SYNC.online = false; SYNC.demoMode = true;
     SYNC.queue = []; SYNC.dlq = []; saveQueue(); saveDlq(); 0;`);

  /* ۱) enqueue → آینهٔ IDB */
  W(`enqueueOp({t:'ins',c:'announcements',data:{school_id:1,title:'آینه'},by:5}); 0;`);
  await sleep(700); /* debounce 400ms + گذرِ async */
  chk('B1 قلمِ pending در آینهٔ IDB نشست',
    idb._stores.sync_queue.size === 1, 'size=' + idb._stores.sync_queue.size);
  const mirrored = Array.from(idb._stores.sync_queue.values())[0];
  chk('B2 آینه uid و op و status را نگه می‌دارد',
    mirrored && mirrored.uid === W('SYNC.queue[0].uid') && mirrored.status === 'pending' && mirrored.op && mirrored.op.c === 'announcements');

  /* ۲) bgApplyResult: synced → حذف از صف + آینه؛ lastSync جلو می‌رود */
  const uid1 = W('SYNC.queue[0].uid');
  W(`bgApplyResult({ synced: ['${uid1}'], rejected: [] }); 0;`);
  await sleep(700);
  chk('B3 قلمِ syncedِ پس‌زمینه از صفِ محلی حذف شد', W('SYNC.queue.length') === 0);
  chk('B4 آینهٔ IDB هم پاک شد (SW قلمِ مرده نمی‌فرستد)',
    idb._stores.sync_queue.size === 0, 'size=' + idb._stores.sync_queue.size);
  chk('B5 lastSync جلو رفت', W('SYNC.lastSync != null'));

  /* ۳) bgApplyResult: rejected → برچسبِ rejected می‌ماند (مرئی در پنل) */
  W(`enqueueOp({t:'upd',c:'grades',data:{score:19},by:5}); 0;`);
  const uid2 = W('SYNC.queue[0].uid');
  W(`bgApplyResult({ synced: [], rejected: ['${uid2}'] }); 0;`);
  chk('B6 قلمِ ردشدهٔ پس‌زمینه rejected شد و از صف حذف نشد (کاربر می‌بیند)',
    W('SYNC.queue.length') === 1 && W('SYNC.queue[0].status') === 'rejected');

  /* ۴) initSync آینه و شنونده را راه می‌اندازد */
  chk('B7 initSync آینه (bgMirrorQueue) و شنوندهٔ SW (bgListen) را صدا می‌زند',
    W('initSync.toString()').includes('bgMirrorQueue') && W('initSync.toString()').includes('bgListen'));
  chk('B8 enqueueOp ثبتِ Background Sync را می‌خواهد (bgRegisterSync)',
    W('enqueueOp.toString()').includes('bgRegisterSync'));

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
