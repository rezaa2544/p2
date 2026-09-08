# سند جامع راهبرد حافظه موقت (Cache Strategy Design)
## سامانه پایش — لایه کشینگ توزیع‌شده Redis برای مقیاس ۱۰ میلیون کاربر

**سند مرجع:** `02_SCALE_ARCHITECTURE.docx` (بند ۶)  
**نسخه سند:** ۱.۰.۰  
**تاریخ تدوین:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت:** مصوب معماری داده (Data & Caching Architecture)  

---

## ۱. اهداف و شاخص‌های کلیدی لایه کشینگ (Executive Goals)

در مقیاس ۱۰ میلیون دانش‌آموز و ۵ میلیون کاربر هم‌زمان، هدایت تمامی درخواست‌های خواندن (Read-Heavy Queries) به پایگاه‌داده اصلی موجب اشباع دیسک، قفل‌های I/O و شکست سیستم می‌شود.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   اهداف کلیدی عملکرد لایه کشینگ                         │
├───────────────────────────────────┬────────────────────────────────────┤
│ نرخ اصابت به کش (Cache Hit Rate)  │ بیش از ۸۵٪ (هدف: > 90%)            │
│ کاهش بار پایگاه‌داده (DB Offload) │ کاهش ۸۰٪ کوئری‌های تکراری خواندن   │
│ زمان پاسخ از کش (Cache Latency)   │ p95 < 2ms (در مقایسه با 45ms دیتابیس)│
│ زمان بازسازی پس از Restart        │ کمتر از ۶۰ ثانیه برای ۱۰٪ مدارس داغ│
│ سیاست مدیریت حافظه (Eviction)     │ volatile-lru / allkeys-lru         │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## ۲. طبقه‌بندی داده‌ها و استراتژی کش (Data Classification Matrix)

داده‌های سامانه پایش بر اساس فراوانی خواندن و نرخ تغییرات به ۴ دسته تقسیم می‌شوند:

```
┌─────────────────────┬───────────────────┬──────────────────┬──────────────┬───────────────────────────┐
│ دسته داده           │ مجموعه‌های داده    │ الگوی کشینگ      │ طول عمر (TTL)│ روش ابطال (Invalidation)  │
├─────────────────────┼───────────────────┼──────────────────┼──────────────┼───────────────────────────┤
│ داده‌های ثابت/پایه   │ provinces, geo    │ Read-Through /   │ ۲۴ ساعت      │ ابطال دستی با بروزرسانی   │
│ (Static Reference)  │ subjects, plans   │ Pre-Warmed       │ (86400s)     │ ساختار وزارت‌خانه         │
├─────────────────────┼───────────────────┼──────────────────┼──────────────┼───────────────────────────┤
│ داده‌های ساختاری     │ schools, classes  │ Cache-Aside +    │ ۶ ساعت       │ Write-Through + رویداد    │
│ مدرسه‌ای (Structural)│ bell_schedules    │ Pub/Sub Inval    │ (21600s)     │ Pub/Sub در زمان ویرایش    │
├─────────────────────┼───────────────────┼──────────────────┼──────────────┼───────────────────────────┤
│ برش داده کاربر      │ user_scope,       │ Cache-Aside      │ ۱۵ دقیقه     │ ابطال اتمیک در زمان Sync  │
│ (User Scoped Scope) │ dashboard_summary │ (Short TTL)      │ (900s)       │ یا دریافت تغییر جدید      │
├─────────────────────┼───────────────────┼──────────────────┼──────────────┼───────────────────────────┤
│ داده‌های داغ بلادرنگ│ bell_now,         │ Fast In-Memory   │ ۶۰ ثانیه     │ انقضای خودکار زمانی       │
│ (Ephemeral Dynamic) │ online_visitors   │ Aggregation      │ (60s)        │ (Auto-Expiry Sliding)     │
└─────────────────────┴───────────────────┴──────────────────┴──────────────┴───────────────────────────┘
```

---

## ۳. الگوهای معماری کشینگ (Caching Architecture Patterns)

### ۳.۱. الگوی کنارگذر کش (Cache-Aside Pattern)
برای کوئری‌های عمومی و برش داده‌های کاربر:
1. کلاینت درخواست داده می‌کند.
2. سرور برنامه ابتدا کلید را در Redis بررسی می‌کند (`GET payesh:cache:<domain>:<id>`).
3. در صورت اصابت (**Cache Hit**): داده مستقیماً و با تاخیر زیر ۲ میلی‌ثانیه به کلاینت تحویل داده می‌شود.
4. در صورت عدم اصابت (**Cache Miss**): داده از پایگاه‌داده واکشی‌شده، در Redis با TTL مشخص ذخیره می‌شود و به کلاینت پاسخ داده می‌شود.

```
[کلاینت] ──(۱. درخواست)──► [سرور برنامه] ──(۲. بررسی کلید)──► [Redis]
                                │                              │ (Cache Hit: < 2ms)
                                │                              ▼
                                │ (Cache Miss)            [پاسخ فوری]
                                ▼
                       [پایگاه‌داده اصلی]
                                │ (۴. خواندن و ذخیره در Redis)
                                ▼
                             [Redis]
```

---

### ۳.۲. الگوی ابطال رویدادمحور (Event-Driven Invalidation via Pub/Sub)
برای جلوگیری از ارائه داده‌های کهنه (Stale Data) بدون ایجاد گلوگاه:
* هنگام اعمال هرگونه جهش (`ins`, `upd`, `del`) در تابع `applyOp`:
  1. رکورد در پایگاه‌داده ذخیره می‌شود.
  2. کلید مربوطه در Redis حذف می‌شود (`DEL payesh:cache:school:<school_id>`).
  3. پیام ابطال روی کانال `payesh:pubsub:invalidation` منتشر می‌شود تا کش‌های محلی حافظه L1 تمامی نودهای سرور نیز بلافاصله پاک شوند.

```javascript
/* نمونه منطق ابطال کش رویدادمحور */
async function invalidateEntityCache(redisClient, collection, entityId, schoolId) {
  const keys = [
    `payesh:cache:${collection}:${entityId}`,
    schoolId ? `payesh:cache:school_roster:${schoolId}` : null
  ].filter(Boolean);

  if (keys.length > 0) {
    await redisClient.del(...keys);
    // انتشار پیام به تمام نودهای کلاستر
    await redisClient.publish('payesh:cache:inval_channel', JSON.stringify({ collection, entityId, schoolId }));
  }
}
```

---

## ۴. مهار طوفان کش و ضربه‌های ترافیکی (Cache Stampede / Thundering Herd Prevention)

در ساعات پیک صبحگاهی (ساعت ۸:۰۰ صبح)، انقضای همزمان کش یک مدرسه پرجمعیت (مثلاً ۲,۰۰۰ دانش‌آموز) می‌تواند منجر به هجوم همزمان صدها درخواست به پایگاه‌داده شود.

برای جلوگیری از این بحران، از دو مکانیزم مهندسی استفاده می‌شود:

### ۴.۱. قفل توزیع‌شده با الگوی Singleflight (Mutex Lock on Cache Miss)
هنگامی که کش منقضی می‌شود، تنها یک درخواست مجاز به فراخوانی دیتابیس است و بقیه درخواست‌ها منتظر نتیجه می‌مانند:

```javascript
async function getOrFetchWithLock(redis, key, fetchFromDbFn, ttlSeconds = 300) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `payesh:lock:fetch:${key}`;
  // تلاش برای دریافت قفل به مدت ۵ ثانیه
  const acquired = await redis.set(lockKey, '1', 'EX', 5, 'NX');

  if (acquired === 'OK') {
    try {
      const freshData = await fetchFromDbFn();
      await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
      return freshData;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // بقیه درخواست‌ها ۵۰ میلی‌ثانیه صبر کرده و مجدد کش را می‌خوانند
    await new Promise(r => setTimeout(r, 50));
    return getOrFetchWithLock(redis, key, fetchFromDbFn, ttlSeconds);
  }
}
```

### ۴.۲. انقضای زودهنگام احتمالی (Probabilistic Early Expiration — XFetch Algorithm)
محاسبه زمان انقضای پویا به گونه‌ای که پیش از مرگ قطعی کلید، یک درخواست در پس‌زمینه به صورت تصادفی کش را بازسازی کند:

$$\Delta t \propto -\beta \times \ln(\text{random}())$$

---

## ۵. استراتژی گرم‌کردن اولیه کش (Cache Warm-Up Strategy)

پس از استقرار نسخه جدید یا راه‌اندازی مجدد کلاستر Redis، برای جلوگیری از افت کارایی و بار ناگهانی به دیتابیس:

```
[استارت سرور / ارتقا] ──► [اجرای اسکریپت tools/cache-warmup.js] ──► [تکمیل بارگذاری مدارس داغ در < ۶۰ ثانیه]
```

### مراحل اجرایی Warm-Up:
1. **فاز ۱ (داده‌های کشوری):** بارگذاری جداول پایه (استان‌ها، شهرستان‌ها، مناطق و پایه‌های درسی).
2. **فاز ۲ (۱۰٪ مدارس پرجمعیت و فعال):** شناسایی مدارس فعال با بیشترین فعالیت در ۲۴ ساعت گذشته و بارگذاری چارت کلاسی، دروس و برنامه هفتگی آن‌ها در Redis.
3. **فاز ۳ (تنظیمات سراسری سامانه):** بارگذاری تقویم رسمی، ایام تعطیل و زمان‌بندی زنگ‌های مدارس.

```javascript
/* tools/cache-warmup.js — اسکریپت گرم‌کردن کش پایش */
async function warmUpCache(db, redis) {
  console.log('🚀 شروع گرم‌کردن کش سامانه پایش...');
  
  // ۱. کش کردن داده‌های ساختاری پایه
  const subjects = await db.collection('subjects').find({}).toArray();
  await redis.set('payesh:cache:subjects:all', JSON.stringify(subjects), 'EX', 86400);

  // ۲. کش کردن مدارس فعال و برنامه هفتگی
  const activeSchools = await db.collection('schools').find({ active: true }).limit(5000).toArray();
  for (const school of activeSchools) {
    const classes = await db.collection('classes').find({ school_id: school.id }).toArray();
    await redis.set(`payesh:cache:school_classes:${school.id}`, JSON.stringify(classes), 'EX', 21600);
  }
  
  console.log('✅ گرم‌کردن کش با موفقیت پایان یافت.');
}
```

---

## ۶. تنظیمات و پیکربندی حافظه Redis در مقیاس ملی

برای مدیریت بهینه مصرف حافظه در کلاستر Redis:

```ini
# redis.conf پیکربندی بهینه برای سرورهای پایش
maxmemory 32gb
maxmemory-policy volatile-lru
maxmemory-samples 10
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
```

* **سیاست `volatile-lru`:** در شرایط پر شدن حافظه، فقط کلیدهایی که دارای TTL هستند و کمترین استفاده را داشته‌اند حذف می‌شوند (کلیدهای دائمی و نشست‌ها دست‌نخورده می‌مانند).
* **آزادسازی تنبل (Lazy Freeing):** حذف کلیدهای حجیم در یک نخ (Thread) پس‌زمینه انجام می‌شود تا هیچ تاخیری روی پردازش درخواست‌های اصلی ایجاد نگردد.

---

## ۷. جمع‌بندی و دستاوردها

| شاخص | قبل از پیاده‌سازی کش | بعد از پیاده‌سازی کش Redis |
|---|---|---|
| **تعداد کوئری دیتابیس در اوج** | ۶۵۰,۰۰۰ QPS | **کمتر از ۹۰,۰۰۰ QPS** |
| **زمان پاسخگویی خواندن (Read p95)** | ۱۸۰ میلی‌ثانیه | **زیر ۱۵ میلی‌ثانیه** |
| **ظرفیت هم‌زمانی روی سخت‌افزار یکسان** | ۵۰۰,۰۰۰ کاربر | **بیش از ۵,۰۰۰,۰۰۰ کاربر** |
