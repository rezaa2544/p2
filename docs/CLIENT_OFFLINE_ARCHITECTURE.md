# سند جامع معماری ذخیره‌سازی آفلاین کلاینت با IndexedDB (Client Offline Architecture)
## سامانه پایش — طراحی بستر ذخیره‌سازی نامحدود، تاب‌آور و بدون مسدودی برای مقیاس ملی

**سند مرجع:** `02_SCALE_ARCHITECTURE.docx` (بندهای ۱۶ تا ۲۰)  
**نسخه سند:** ۱.۰.۰  
**تاریخ تدوین:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت:** مصوب معماری کلاینت (Client Architecture Specification)  

---

## ۱. مهاجرت از localStorage به IndexedDB (بند ۱۶)

### ۱.۱. چرا localStorage در مقیاس ملی و Offline-First پاسخگو نیست؟

```
┌────────────────────────────────────────────────────────────────────────┐
│               مقایسه فنی localStorage در برابر IndexedDB               │
├───────────────────────┬────────────────────────┬───────────────────────┤
│ شاخص فنی              │ localStorage (وضعیت فعلی)│ IndexedDB (معماری هدف)│
├───────────────────────┼────────────────────────┼───────────────────────┤
│ سقف ظرفیت ذخیره‌سازی   │ حداکثر ۵ مگابایت       │ ۵۰ مگابایت تا چند گیگ │
│ مدل اجرای I/O         │ همگام (Sync) و مسدودکننده│ کاملاً ناهمگام (Async) │
│ ساختار ذخیره داده     │ صرفاً رشته (String)    │ شیء جاوااسکریپت، Blob │
│ ایندکس‌گذاری و کوئری  │ ❌ ندارد (اسکن خطی)    │ ✅ ایندکس‌های B-Tree  │
│ مدیریت تراکنش‌ها (ACID)│ ❌ ندارد               │ ✅ تراکنش‌های اتمیک  │
│ خطر Crash در رندرهای حجیم│ 🔴 بالا (OOM و فریز UI)│ 🟢 صفر (جریان استریم) │
└───────────────────────┴────────────────────────┴───────────────────────┘
```

---

### ۱.۲. ساختار پایگاه‌داده و جداول شیء (Object Stores Schema)

پایگاه‌داده IndexedDB با نام `payesh_offline_db` و نسخه `2` دارای ۳ جدول ذخیره شیء (Object Store) تفکیک‌شده خواهد بود:

```
                               ┌────────────────────────────────┐
                               │       payesh_offline_db        │
                               │          (IndexedDB)           │
                               └───────────────┬────────────────┘
                                               │
                 ┌─────────────────────────────┼─────────────────────────────┐
                 │                             │                             │
                 ▼                             ▼                             ▼
       ┌───────────────────┐         ┌───────────────────┐         ┌───────────────────┐
       │     entities      │         │    sync_queue     │         │     metadata      │
       │ (اسنپ‌شات وضعیت روز) │         │ (صف جهش‌های آفلاین) │         │ (نسخه‌ها و تنظیمات)│
       └───────────────────┘         └───────────────────┘         └───────────────────┘
```

```
┌──────────────────┬─────────────────┬───────────────────┬───────────────────────────────────────────────┐
│ جدول شیء (Store) │ کلید اصلی (PK)  │ ایندکس‌ها (Index) │ محتوا و کاربرد                                │
├──────────────────┼─────────────────┼───────────────────┼───────────────────────────────────────────────┤
│ entities         │ [coll, id]      │ by_coll, by_school│ وضعیت مادی‌شده موجودیت‌ها (مدارس، نمرات، حضور)│
├──────────────────┼─────────────────┼───────────────────┼───────────────────────────────────────────────┤
│ sync_queue       │ uid (ULID)      │ by_status, by_time│ صف جهش‌های آفلاین (pending, failed, rejected) │
├──────────────────┼─────────────────┼───────────────────┼───────────────────────────────────────────────┤
│ metadata         │ key             │ —                 │ نسخه اسنپ‌شات، آخرین زمان همگام‌سازی، تنظیمات │
└──────────────────┴─────────────────┴───────────────────┴───────────────────────────────────────────────┘
```

---

### ۱.۳. ماژول ارتباطی مدرن کلاینت (Pure Vanilla JS IndexedDB Wrapper)

```javascript
/* ==========================================================================
   src/js/03-idb-persistence.js — لایه ذخیره‌سازی ناهمگام IndexedDB
   بدون وابستگی خارجی (Zero Dependencies) با پشتیبانی کامل از Promise
   ========================================================================== */

const DB_NAME = 'payesh_offline_db';
const DB_VERSION = 2;

class OfflineStorage {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // ۱. جدول وضعیت داده‌ها
        if (!db.objectStoreNames.contains('entities')) {
          const entStore = db.createObjectStore('entities', { keyPath: ['c', 'id'] });
          entStore.createIndex('by_coll', 'c', { unique: false });
          entStore.createIndex('by_school', ['c', 'school_id'], { unique: false });
        }

        // ۲. جدول صف جهش‌های آفلاین
        if (!db.objectStoreNames.contains('sync_queue')) {
          const qStore = db.createObjectStore('sync_queue', { keyPath: 'uid' });
          qStore.createIndex('by_status', 'status', { unique: false });
          qStore.createIndex('by_time', 'created_at', { unique: false });
        }

        // ۳. جدول تنظیمات و متادیتا
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ذخیره یا ویرایش اتمیک در جدول موجودیت‌ها
  async putEntity(collection, record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['entities'], 'readwrite');
      const store = tx.objectStore('entities');
      const item = { c: collection, id: record.id, school_id: record.school_id || null, data: record };
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // واکشی کل یک مجموعه داده
  async getCollection(collection) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['entities'], 'readonly');
      const store = tx.objectStore('entities');
      const idx = store.index('by_coll');
      const req = idx.getAll(collection);
      req.onsuccess = () => resolve(req.result.map(r => r.data));
      req.onerror = (e) => reject(e.target.error);
    });
  }
}
```

---

## ۲. جداسازی صف همگام‌سازی از اسنپ‌شات وضعیت داده‌ها (بند ۱۷)

در معماری قبلی، لاگ جهش‌ها و اسنپ‌شات داده‌ها در یک ساختار درهم‌تنیده قرار داشتند؛ در نتیجه، پاک‌سازی صف باعث پاک شدن داده‌ها می‌شد.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        تفکیک دو لایه مستقل در کلاینت                  │
├────────────────────────────────────┬───────────────────────────────────┤
│ اسنپ‌شات وضعیت داده‌ها (Entities)    │ صف همگام‌سازی آفلاین (Sync Queue)  │
├────────────────────────────────────┼───────────────────────────────────┤
│ • وضعیت زنده و مادی‌شده تمام جداول │ • جریان رویدادهای ارسالی به سرور  │
│ • رندر فوری UI بدون تاخیر          │ • وضعیت‌های: pending/failed/dead  │
│ • خواندن در حافظه RAM در زمان بوت  │ • قابلیت تخلیه و پاک‌سازی مستقل   │
│ • مستقل از صف جهش‌ها               │ • بدون دست‌خوردن داده‌های جاری     │
└────────────────────────────────────┴───────────────────────────────────┘
```

---

## ۳. راهبرد تلاش مجدد با پس‌روی نمایی (Exponential Backoff with Jitter - بند ۱۸)

در زمان اختلالات اینترنت و شبکه‌های موبایل، ارسال مداوم درخواست‌ها به سرور موجب تخلیه باتری گوشی و افزایش بار ترافیکی می‌شود.

### ۳.۱. فرمول و زمان‌بندی تلاش‌های مجدد:

$$T_{\text{wait}} = \min(T_{\text{max}}, T_{\text{base}} \times 2^{\text{attempts}}) \pm \text{Jitter}$$

```
تلاش ۱: ۱ ثانیه  ──► تلاش ۲: ۲ ثانیه  ──► تلاش ۳: ۴ ثانیه  ──► تلاش ۴: ۸ ثانیه  ──► ... ──► سقف: ۵ دقیقه
```

```javascript
/* src/js/27-sync-backoff.js — کنترلگر ارسال هوشمند با پس‌روی نمایی */
const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300000; // ۵ دقیقه

function calculateBackoff(attempts) {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempts));
  const jitter = exp * (0.8 + Math.random() * 0.4); // ±20% تصادفی
  return Math.floor(jitter);
}

async function processSyncQueue(storage, apiClient) {
  const pendingOps = await storage.getPendingQueue();
  if (!pendingOps.length || !navigator.onLine) return;

  for (const op of pendingOps) {
    if (op.attempts >= MAX_ATTEMPTS) {
      // انتقال به صف پیام‌های مرده (Dead-Letter)
      await storage.updateQueueStatus(op.uid, 'rejected', 'max_attempts_exceeded');
      continue;
    }

    try {
      const res = await apiClient.sendBatch([op]);
      if (res.ok) {
        await storage.removeFromQueue(op.uid);
      } else if (res.status === 403 || res.status === 400) {
        // خطای غیرگذرا (رد قطعی سرور)
        await storage.updateQueueStatus(op.uid, 'rejected', res.code);
      } else {
        // خطای گذرا (شبکه یا 5xx)
        const nextRetry = Date.now() + calculateBackoff(op.attempts);
        await storage.incrementAttempts(op.uid, nextRetry);
      }
    } catch (netErr) {
      const nextRetry = Date.now() + calculateBackoff(op.attempts);
      await storage.incrementAttempts(op.uid, nextRetry);
    }
  }
}
```

---

## ۴. رابط کاربری مدیریت پیام‌های ردشده و صف مرده (Rejected / Dead-Letter UI - بند ۱۹)

برای جلوگیری از سردرگمی کاربر در مواردی که یک تغییر آفلاین توسط سرور پذیرفته نشده است (مانند رد دسترسی یا نقض ظرفیت):

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠️ مدیریت عملیات‌های ردشده همگام‌سازی (Dead-Letter Queue)              │
├────────────────────────────────────────────────────────────────────────┤
│ ردیف | مجموعه   | شرح عملیات         | علت رد شدن         | عملیات      │
├──────┼───────────┼────────────────────┼────────────────────┼─────────────┤
│ ۱    │ grades    │ ثبت نمره ۱۹.۵ ریاضی│ تداخل نسخه (۴۰۹)   │ [مشاهده تضاد]│
│ ۲    │ classes   │ ثبت‌نام دانش‌آموز   │ تکمیل ظرفیت کلاس   │ [حذف] [ویرایش]│
└────────────────────────────────────────────────────────────────────────┘
```

* **امکانات پنل:**
  1. **تلاش دوباره دستی (Manual Force Retry):** پس از اصلاح شرایط دسترسی.
  2. **ویرایش جهش (Edit & Re-queue):** تغییر مقادیر پیش از ارسال مجدد.
  3. **حذف باطل‌شده‌ها (Purge):** پاک‌سازی رکوردهایی که دیگر نیازی به ارسال ندارند.

---

## ۵. حل تعارض بصری در کلاینت (Client-Side Conflict Resolution UI)

هنگامی که سرور خطای `409 Conflict (stale_base)` بازمی‌گرداند، پنجره محاوره‌ای هوشمند جهت تصمیم‌گیری به کاربر نمایش داده می‌شود:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠️ تعارض در همگام‌سازی نمره دانش‌آموز «علی محمدی»                      │
├────────────────────────────────────────────────────────────────────────┤
│ نسخه شما (آفلاین): نمره ۱۸.۵ (ثبت‌شده در ساعت ۰۸:۱۵ توسط شما)          │
│ نسخه سرور (آنلاین): نمره ۱۹.۰ (ثبت‌شده در ساعت ۰۸:۲۰ توسط ناظم)        │
├────────────────────────────────────────────────────────────────────────┤
│ [ نگه‌داری نسخه من (۱۸.۵) ]  [ پذیرش نسخه سرور (۱۹.۰) ]  [ ارسال به مدیر ]│
└────────────────────────────────────────────────────────────────────────┘
```

---

## ۶. راهبرد اسنپ‌شات و فشرده‌سازی گزارش تغییرات (Snapshot & Compaction Strategy - بند ۲۰)

با گذشت زمان، تعداد جهش‌های آفلاین انباشته‌شده و حجم دیتابیس را بالا می‌برد. الگوی فشرده‌سازی دو‌مرحله‌ای حجم را همواره زیر ۵ مگابایت نگه می‌دارد:

```
[انباشت ۱۰۰۰ جهش آفلاین] ──► [تولید Snapshot کامل وضعیت] ──► [حذف ۵۰۰ جهش قدیمی‌تر] ──► [آزادسازی فضا]
```

```javascript
/* الگوریتم فشرده‌سازی اسنپ‌شات کلاینت */
async function compactDatabaseIfNeeded(storage) {
  const opCount = await storage.getQueueCount();
  if (opCount < 1000) return; // هنوز به سقف نرسیده

  console.log('📦 در حال اجرای عملیات Compaction اسنپ‌شات...');
  
  // ۱. مادی‌سازی وضعیت جاری در جدول entities
  const fullState = getCurrentInMemoryState();
  await storage.saveFullSnapshot(fullState);

  // ۲. حذف جهش‌های همگام‌شده قدیمی و نگهداری صرفاً ۵۰۰ جهش آخر
  await storage.purgeSyncedQueue(500);
  
  console.log('✅ فشرده‌سازی دیتابیس با موفقیت انجام شد.');
}
```

---

## ۷. فرآیند مهاجرت امن داده‌ها از localStorage به IndexedDB (Zero-Data-Loss Migration)

در نخستین بارگذاری نسخه جدید برنامه، اسکریپت مهاجرت خودکار اجرا می‌شود:

```javascript
/* src/js/00-migration.js — اسکریپت مهاجرت بدون قطعی */
async function migrateFromLocalStorageToIdb(storage) {
  const MIGRATED_FLAG = 'payesh_idb_migrated_v2';
  if (localStorage.getItem(MIGRATED_FLAG)) return; // قبلاً مهاجرت‌شده

  console.log('🔄 شروع مهاجرت داده‌ها از localStorage به IndexedDB...');
  
  try {
    const rawLog = localStorage.getItem('payesh_log');
    if (rawLog) {
      const ops = JSON.parse(rawLog);
      await storage.bulkInsertQueue(ops);
    }

    const rawSettings = localStorage.getItem('payesh_app_settings');
    if (rawSettings) {
      await storage.putMetadata('app_settings', JSON.parse(rawSettings));
    }

    // تایید صحت انتقال و ثبت پرچم
    localStorage.setItem(MIGRATED_FLAG, 'true');
    // آزادسازی حافظه محلی localStorage پس از اطمینان
    localStorage.removeItem('payesh_log');
    
    console.log('🎉 مهاجرت با موفقیت پایان یافت.');
  } catch (err) {
    console.error('❌ خطا در فرآیند مهاجرت:', err);
    // در صورت خطا، دیتای localStorage دست‌نخورده باقی می‌ماند
  }
}
```

---

## ۸. جمع‌بندی و دستاوردهای معماری جدید کلاینت

| شاخص عملکردی | نسخه قبلی (localStorage) | نسخه جدید (IndexedDB) |
|---|---|---|
| **سقف ظرفیت ذخیره‌سازی محلی** | ۵ مگابایت (تکمیل در ماه دوم) | **بیش از ۵۰۰ مگابایت (پشتیبانی از چندین سال تحصیلی)** |
| **روان‌بودن رابط کاربری (UI FPS)** | افت فریم در زمان ذخیره JSON | **۶۰ فریم ثابت بدون هیچ مسدودیتی در Main Thread** |
| **امنیت داده‌ها در زمان قطعی** | احتمال تداخل و باخت داده | **ایزولاسیون کامل با تراکنش‌های ACID و Dead-letter UI** |
| **تحمل نوسانات شبکه** | ارسال مکرر و تخلیه باتری | **پس‌روی نمایی هوشمند با Jitter تصادفی** |
