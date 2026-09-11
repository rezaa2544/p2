/* ═══════════════════════════════════════════════════════════════════
   sw.js — Service Worker for Payesh PWA & Offline Support
   -------------------------------------------------------------------
   Caches HTML, static assets, and fonts for 100% offline functionality.
   Network-First for APIs, Cache-First for static assets and shell.
   W8-1 (client-offline-v2): Background Sync — صفِ همگام‌سازی حتی وقتی
   تب بسته است تخلیه می‌شود. کلاینت صفِ localStorage را در IndexedDB
   (payesh_offline_v2 → sync_queue) آینه می‌کند (SW به localStorage
   دسترسی ندارد) و رویداد sync مرورگر، flush را در پس‌زمینه می‌راند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const CACHE_NAME = 'payesh-pwa-v1.1.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/USER_GUIDE.html',
  '/privacy.html',
  '/account-deletion.html'
];

/* ---------- W8-1: Background Sync — ثابت‌ها ---------- */
const BGSYNC_TAG   = 'payesh-sync-queue';
const BGSYNC_DB    = 'payesh_offline_v2';
const BGSYNC_STORE = 'sync_queue';
const BGSYNC_URL   = '/api/sync';
const BGSYNC_CHUNK = 200;          /* هم‌راستا با SYNC_CHUNK کلاینت (سقفِ سرور ۵۰۰) */
const BGSYNC_MAX_TRIES = 5;        /* هم‌راستا با SYNC_QUEUE_CAPS.maxTries */
/* کدهایِ ردِّ پایدار — هم‌راستا با SYNC_DEAD_CODES در src/js/27-sync.js:
   دوباره‌ارسال بی‌فایده است؛ قلم rejected می‌شود تا کلاینت در پنل ببیند. */
const BGSYNC_DEAD = {
  field_denied: 1, malformed_op: 1, role_denied: 1, out_of_scope: 1,
  forged_by: 1, user_mismatch: 1, school_mismatch: 1,
  unknown_field: 1, unknown_collection: 1, role_escalation: 1, ownership_forge: 1,
  conflict_preserved: 1, stale_base: 1, validation_failed: 1, oversized_op: 1
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ---------- W8-1: رویدادِ sync — تخلیهٔ صف حتی با تبِ بسته ----------
   مرورگر پس از registration.sync.register(BGSYNC_TAG) این رویداد را
   وقتی اتصال برگردد می‌راند — حتی اگر هیچ تبی باز نباشد. اگر flush
   ناتمام بماند (reject)، مرورگر خودش با backoff دوباره تلاش می‌کند. */
self.addEventListener('sync', (event) => {
  if (event.tag === BGSYNC_TAG) {
    event.waitUntil(bgFlushQueue());
  }
});

/* پیامِ مستقیم از کلاینت (مسیرِ جایگزین وقتی SyncManager نیست) */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'payesh-flush-now') {
    const p = bgFlushQueue();
    if (event.waitUntil) event.waitUntil(p);
  }
});

/* ---------- W8-1: دسترسی به IndexedDB از درونِ SW ---------- */
function bgOpenDb() {
  return new Promise((resolve) => {
    try {
      /* بدونِ version — اگر DB نبود، نسخهٔ خالی می‌سازد و store نبودنش
         در bgReadPending با contains() امن مدیریت می‌شود (fail-closed). */
      const req = indexedDB.open(BGSYNC_DB);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}
function bgReadPending(db) {
  return new Promise((resolve) => {
    try {
      if (!db || !db.objectStoreNames.contains(BGSYNC_STORE)) return resolve([]);
      const tx = db.transaction([BGSYNC_STORE], 'readonly');
      const req = tx.objectStore(BGSYNC_STORE).getAll();
      req.onsuccess = (e) => {
        const all = e.target.result || [];
        const out = all.filter((x) => x && (x.status === 'pending' || x.status === 'failed'));
        out.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
        resolve(out);
      };
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}
function bgDeleteItem(db, uid) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([BGSYNC_STORE], 'readwrite');
      const req = tx.objectStore(BGSYNC_STORE).delete(uid);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}
function bgPutItem(db, item) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([BGSYNC_STORE], 'readwrite');
      const req = tx.objectStore(BGSYNC_STORE).put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

/* ---------- W8-1: تخلیهٔ صف در پس‌زمینه ----------
   - قلم‌هایِ pending/failed به دسته‌هایِ ۲۰۰تایی به /api/sync می‌روند
     (کوکیِ HttpOnly نشست با credentials:'include' می‌رود؛ توکنی در SW نیست).
   - ok/duplicate_ignored → حذف از صفِ IDB
   - کدِ ردِّ پایدار (BGSYNC_DEAD) → rejected (کلاینت در پنل می‌بیند)
   - خطایِ گذرا → attempts+1؛ پس از ۵ تلاش rejected (retry_exhausted)
   - خطایِ شبکه → reject کلِ sync تا مرورگر خودش دوباره زمان‌بندی کند */
async function bgFlushQueue() {
  const db = await bgOpenDb();
  if (!db) return;
  const items = await bgReadPending(db);
  if (!items.length) return;

  const syncedUids = [];
  const rejectedUids = [];
  let networkFailed = false;

  for (let i = 0; i < items.length && !networkFailed; i += BGSYNC_CHUNK) {
    const chunk = items.slice(i, i + BGSYNC_CHUNK);
    let body = null;
    try {
      const resp = await fetch(BGSYNC_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: chunk.map((x) => Object.assign({ uid: x.uid }, x.op)) })
      });
      if (resp.status === 401) { networkFailed = true; break; } /* نشست نیست — تلاشِ بعدی پس از ورود */
      if (resp.status >= 500) { networkFailed = true; break; }
      body = await resp.json().catch(() => null);
    } catch (e) { networkFailed = true; break; }

    const results = (body && body.results) || [];
    const byUid = {};
    results.forEach((r) => { if (r && r.uid) byUid[r.uid] = r; });

    for (const item of chunk) {
      const r = byUid[item.uid];
      if (r && (r.ok || r.code === 'duplicate_ignored')) {
        await bgDeleteItem(db, item.uid);
        syncedUids.push(item.uid);
      } else if (r && BGSYNC_DEAD[r.code]) {
        item.status = 'rejected';
        item.last_error = r.message || r.code;
        await bgPutItem(db, item);
        rejectedUids.push(item.uid);
      } else {
        item.attempts = (item.attempts || 0) + 1;
        item.last_error = (r && r.message) || 'پاسخِ سرور برایِ این تغییر نبود';
        if (item.attempts >= BGSYNC_MAX_TRIES) { item.status = 'rejected'; rejectedUids.push(item.uid); }
        else item.status = 'failed';
        await bgPutItem(db, item);
      }
    }
  }

  if (syncedUids.length || rejectedUids.length) {
    await bgNotifyClients({ synced: syncedUids, rejected: rejectedUids });
  }
  /* شکستِ شبکه با قلمِ باقی‌مانده → reject تا مرورگر sync را دوباره بزند */
  if (networkFailed && syncedUids.length + rejectedUids.length < items.length) {
    throw new Error('bgsync-retry');
  }
}

/* آگاه‌سازیِ تب‌هایِ باز (اگر بودند) تا نشانگر و صفِ محلی تازه شود */
async function bgNotifyClients(payload) {
  try {
    const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    cs.forEach((c) => c.postMessage(Object.assign({ type: 'payesh-bgsync-done' }, payload)));
  } catch (e) { /* بدونِ تبِ باز — بی‌صدا */ }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: Network-First with offline queue fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ ok: false, code: 'offline', message: 'دستگاه در حالت آفلاین است' }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8' }, status: 503 }
        );
      })
    );
    return;
  }

  // Static Assets / HTML Shell: Cache-First, fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline fallback to root index.html
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
