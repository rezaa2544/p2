# Offline-First — لایهٔ همگام‌سازی و تجربهٔ آفلاین (client-offline-v2)

> شاخه: `feat/client-offline-v2` · تاریخ: ۲۰۲۶-۰۹-۱۱
>
> این سند وضعیتِ کاملِ قابلیت‌هایِ Offline-First کلاینت را پس از پنج شکافِ
> «موج ۸» (W8-1 تا W8-5) توصیف می‌کند. زیرساختِ قبلی (صف، سقف‌ها، DLQ) در
> `docs/WAVE7_OFFLINE_QUEUE.md` و معماریِ IndexedDB در
> `docs/CLIENT_OFFLINE_ARCHITECTURE.md` مستند است.

## ۱) نمایِ کلی

```
      نوشتنِ کاربر (insert/update/remove)
                   │
                   ▼
   ┌────────────────────────────────┐
   │  صفِ ارسال — SYNC.queue        │  localStorage: sms_syncq_v1
   │  سقف‌ها/DLQ (P1-10) + نسخه‌ها  │
   └───────┬──────────────┬─────────┘
           │              │  W8-1: آینهٔ debounce شده
           ▼              ▼
     syncNow()      IndexedDB payesh_offline_v2 → sync_queue
   (تبِ باز، تکه‌تکه)        │
           │                 ▼
           │        Service Worker (sw.js)
           │        رویدادِ sync «payesh-sync-queue»
           │        bgFlushQueue() — حتی با تبِ بسته
           ▼                 │
        /api/sync ◄──────────┘   (کوکیِ HttpOnly؛ SW توکن ندارد)
```

## ۲) شکاف ۱ — Background Sync (W8-1)

**مسئله:** SW فقط cache را مدیریت می‌کرد؛ اگر دبیر آفلاین ثبت می‌کرد و تب را
می‌بست، صف تا بازشدنِ بعدیِ برنامه می‌ماند.

**راه‌حل:**
- کلاینت (`src/js/27-sync.js`):
  - `bgMirrorQueue()` — قلم‌هایِ `pending/failed` صف را (با debounce ۴۰۰ms)
    در IndexedDB (`payesh_offline_v2` → `sync_queue`) آینه می‌کند و قلم‌هایِ
    synced/حذف‌شده را از آینه پاک می‌کند تا SW قلمِ مرده نفرستد.
  - `bgRegisterSync()` — در هر `enqueueOp` برچسبِ one-shot
    `payesh-sync-queue` را ثبت می‌کند (`registration.sync.register`).
  - `bgListen()`/`bgApplyResult()` — پیامِ `payesh-bgsync-done` از SW را
    می‌گیرد و صفِ محلی را آشتی می‌دهد (synced حذف + جلوبردنِ lastSync؛
    rejected برچسب می‌خورد و در پنل مرئی می‌ماند).
- Service Worker (`sw.js`):
  - `sync` event → `bgFlushQueue()`: خواندنِ قلم‌ها از IDB، ارسالِ
    تکه‌تکه (۲۰۰تایی) به `/api/sync` با `credentials:'include'` —
    هیچ توکنی در SW ذخیره نمی‌شود.
  - کدهایِ ردِّ پایدار (هم‌راستا با `SYNC_DEAD_CODES`) → `rejected`؛
    خطایِ گذرا → `attempts+1` تا سقفِ ۵؛ شکستِ شبکه → reject کلِ sync
    تا مرورگر خودش با backoff دوباره بزند.
  - مسیرِ جایگزین بدونِ SyncManager: پیامِ `payesh-flush-now`.

**تستِ «بستنِ تب»:** رویدادِ sync مرورگر به‌تعریف مستقل از عمرِ تب است؛ در
jsdom قابلِ شبیه‌سازیِ واقعی نیست، پس `tests/bgsync.js` قراردادِ دوطرف را
می‌سنجد: (الف) قلمِ enqueue شده واقعاً در IDB می‌نشیند (این همان چیزی است
که پس از بستنِ تب باقی می‌ماند)، (ب) sw.js شنوندهٔ sync/فلاش/اعلام نتیجه
دارد، (ج) نتیجهٔ پس‌زمینه صفِ محلی را درست آشتی می‌دهد.

## ۳) شکاف ۲ — Conflict Resolution UI (W8-2)

**مسئله:** اگر دو دستگاه هم‌زمان یک رکورد را تغییر دهند، سرور تغییرِ دیرهنگام
را `conflict_preserved`/`stale_base` می‌کند ولی کاربر نمی‌دید کدام نسخه برنده شد.

**راه‌حل (`src/js/27-sync.js`):**
- `syncConflictModal(uid)` — مودالِ «نسخهٔ شما رد شد» / «تعارضِ همگام‌سازی»:
  نسخهٔ محلی و نسخهٔ سرور فیلدبه‌فیلد روبه‌رویِ هم؛ تفاوت‌ها برجسته؛
  برچسب‌هایِ فارسیِ فیلد؛ همهٔ مقادیر با `esc/escAttr` (XSS بسته — تستِ C11).
- نتیجهٔ `conflict_preserved` حالا `r.server` را رویِ قلم نگه می‌دارد تا
  مقایسه دادهٔ واقعی داشته باشد. `stale_base` پیامِ روشنِ «نسخهٔ سرور برنده
  است» می‌گیرد.
- در پنلِ همگام‌سازی، قلم‌هایِ conflict/rejected دکمهٔ «⚖️ مقایسهٔ دو نسخه»
  دارند (اکشنِ `sync-conflict-view`).
- داوریِ نهاییِ مدیر (پذیرش/نگه‌داشتن) همان مسیرِ R95 در
  `src/js/68-sync-conflicts.js` است (`/api/sync/resolve-conflict`).

## ۴) شکاف ۳ — Offline Indicator (W8-3)

**مسئله:** نشانگرِ آفلاین فقط «آفلاین + عدد» بود.

**راه‌حل (`src/js/27-sync.js`):**
- `queueBreakdown()`/`queueBreakdownFa()` — تفکیکِ صف: «۵ ثبت، ۱ ویرایش، ۲ حذف».
- `syncRelTime()` — زمانِ نسبیِ فارسی: «همین حالا»، «۳ دقیقه پیش»، «۲ ساعت پیش».
- `estimateSyncSeconds()/estimateSyncFa()` — تخمینِ زمانِ ارسال از تعدادِ
  تکه‌ها (`SYNC_CHUNK`): «حدود ۲ ثانیه» تا «حدود N دقیقه».
- Tooltip نشانگرِ آفلاین: تفکیک + آخرین همگام‌سازیِ نسبی + تخمینِ ارسال
  پس از اتصال. پنلِ همگام‌سازی: تفکیک کنارِ شمارش + سطرِ «⏱️ زمانِ تخمینی».

## ۵) شکاف ۴ — Storage Quota Management (W8-4)

**مسئله:** با پرشدنِ سهمیهٔ IndexedDB/مرورگر، نوشتن‌ها ساکت شکست می‌خورند.

**راه‌حل (`src/js/27-sync.js`):**
- `checkStorageQuota()` — پس از هر enqueue (async، بیرونِ مسیرِ نوشتن)
  `navigator.storage.estimate` را می‌خواند؛ هشدار با هیسترزیس: ۸۵٪ هشدار،
  ریست زیرِ ۷۰٪؛ بدونِ API → سکوت (نه کرش، نه هشدارِ کاذب).
- `storageQuotaModal()` — نوارِ مصرف (اندازه‌هایِ فارسی با `quotaSizeFa`) +
  دو پاک‌سازیِ **انتخابی**:
  - `quotaClearDlq()` — کلِ صفِ مرده (سرور رد کرده / دفن‌شده).
  - `quotaPruneTerminal()` — قلم‌هایِ rejected/failed/conflict کهنه‌تر از ۷ روز.
  - **دادهٔ ارسال‌نشدهٔ کاربر (pending/sending) هرگز گزینهٔ پاک‌سازی نیست** —
    در UI هم صریح گفته می‌شود.
- دکمهٔ «🗄️ حافظه» در پنلِ همگام‌سازی.
- تستِ quota near-full: استابِ estimate با ۹۰٪ مصرف (`tests/storage-quota.js`).

## ۶) شکاف ۵ — Pull-to-Refresh (W8-5)

**مسئله:** رویِ موبایل کشیدنِ صفحه به پایین کاری نمی‌کرد.

**راه‌حل (`src/js/27-sync.js` + `src/styles/mobile.css`):**
- شنونده‌هایِ لمسیِ passive رویِ `document` (یک‌بار در `initSync`) —
  چون `.content` ظرفِ همهٔ روت‌هاست، در **همهٔ viewها** کار می‌کند و از
  رندرِ مجدد جان به در می‌برد.
- شروع فقط از `scrollTop === 0` و بیرونِ مودال؛ مقاومتِ کشسانی (×۰.۵۵،
  سقف ۱۴۰px)؛ آستانهٔ رهاسازی ۷۰px.
- `ptrTrigger()` — `syncNow(true)` + در حالتِ سروری `pullFromServer()`؛
  `PTR.busy` تا پایانِ کلِ refresh بالا می‌ماند: **کشیدنِ دوم وسطِ کار
  هیچ‌کاره است (ضدِ double-trigger — تست‌هایِ P7–P9)**.
- نشانگرِ `#ptr-indicator` سه حالت دارد: «↓ بکشید» / «↻ رها کنید» /
  «⏳ در حال همگام‌سازی…».

## ۷) تست‌ها

| سوئیت | پوشش | نتیجه |
|---|---|---|
| `tests/bgsync.js` | W8-1: قراردادِ SW + آینهٔ IDB + آشتیِ نتیجه | ۱۴/۱۴ |
| `tests/sync-conflict-ui.js` | W8-2: مودالِ مقایسه + XSS + اکشن‌ها | ۱۲/۱۲ |
| `tests/offline-indicator.js` | W8-3: تفکیک/زمانِ نسبی/تخمین/نشانگر | ۱۲/۱۲ |
| `tests/storage-quota.js` | W8-4: near-full/هیسترزیس/پاک‌سازیِ امن | ۱۴/۱۴ |
| `tests/pull-to-refresh.js` | W8-5: آستانه/گاردها/ضدِ double-trigger | ۱۵/۱۵ |
| `tests/wave7-offline-queue.js` | رگرسیونِ صفِ قبلی | ۷/۷ |
| `tests/smoke.js` | رگرسیونِ کامل UI | ۵۴۷/۵۴۷ |

گیت‌هایِ ثابت: `build.js --check` سبز، `tests/check-authz.js` خروجی ۰،
`tests/secret-scan.js` ۱۱/۱۱.

## ۸) تصمیم‌هایِ معماری و محدودیت‌ها

- **دو مخزنِ صف (localStorage + آینهٔ IDB):** صفِ اصلی برایِ سازگاری با
  همهٔ مسیرهایِ موجود در localStorage ماند؛ IDB فقط آینهٔ read-model برایِ
  SW است. منبعِ حقیقت همیشه صفِ اصلی است و آشتی همیشه از سمتِ کلاینت
  انجام می‌شود (`bgApplyResult`).
- **امنیتِ SW:** هیچ توکن/نشانه‌ای در SW یا IDB ذخیره نمی‌شود؛ احراز فقط
  کوکیِ HttpOnly است (`credentials:'include'`) — هم‌راستا با
  `docs/SERVER_SECURITY_CONTRACT.md`.
- **iOS Safari:** SyncManager را پشتیبانی نمی‌کند؛ `bgSyncSupported()`
  آن را تشخیص می‌دهد و مسیرِ عادیِ «تبِ باز + رویدادِ online» مثلِ قبل
  کار می‌کند (تنزلِ نرم).
- **تخمینِ زمانِ ارسال** heuristic است (۱.۵ ثانیه بر تکهٔ ۲۰۰تایی) و فقط
  برایِ حسِ انتظار — قولِ SLA نیست.
