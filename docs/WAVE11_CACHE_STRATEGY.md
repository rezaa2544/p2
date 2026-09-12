# Wave 11 — استراتژی کشینگ (Cache Hierarchy)

_چت ۳ — ۲۰/۰۶/۱۴۰ (2026-09-09)_

## معماری

```
درخواست bootstrap
   │
   ▼
L1 — حافظهٔ فرایند (LRU + سقف + TTL 60s)   ← میکروثانیه‌ای؛ بدون I/O
   │ miss
   ▼
L2 — Redis `payesh:cache:bootstrap:<userId>` (TTL = 300s)
   │ miss
   ▼
single-flight ──► build (خوانش از store/PG) ──► نوشت L1 + L2
   (N هم‌زمان = یک build)
```

## قوانین

### 1. TTL (هر کلید کش TTL دارد — هیچ کلیدِ دائمی نیست)

| کلید | TTL | توضیح |
|---|---|---|
| `payesh:cache:bootstrap:<userId>` (L2) | **۳۰s (۵ دقیقه)** | سقفِ تازگی برایِ دادهٔ bootstrap |
| L1 (هر ورودی) | **۶۰s** | حتی اگر L2 زنده باشد |
| `payesh:cache:school:<sid>` (ایندکسِ انقضا) | بدونِ TTL | فقط شناسهٔ کاربرانی که L2 کش دارند؛ حجم = تعدادِ کاربرانِ کش‌شده (ناچیز)؛ کلیدهایِ عضو با TTLِ خود انقضا می‌کنند |

> سیاستِ کلان: bootstrap = ۵ دقیقه. اگر روزی کشِ گزارش اضافه شود،
> طبقِ پرامپتِ Wave 11: **گزارش‌ها ۱ ساعت** (در حال حاضر کشی برایِ گزارش
> وجود ندارد — `public-report` بدونِ کش است؛ این سیاست برایِ افزودنِ بعدی
> ثبت می‌شود).

### 2. Invalidation (پس از هر نوشت، کشِ مرتبط پاک می‌شود)

مسیرهایِ نوشتِ سرور همه `cache.invalidateCollection(col, schoolId)` را
می‌زنند (فشل‌آمیز: خطا هرگز نوشت را نمی‌شکند):

| مسیر | پوشش |
|---|---|
| **sync** (opsِ کلاینت) | هر op (از قبل) — `invalidateCollection(op.c, op.data.school_id)` |
| **REST routes** (این دور) | هر ۱۶ نقطه نوشت: attendance/classes/grades/students/users — ins + upd + del |

رویدادها از channel `payesh:pubsub:inval` به **همهٔ نمونه‌ها** منتشر
می‌شوند (user/school/all). انقضایِ کامل:

- `user` ⇒ L1ِ محلی + **کلیدِ L2** + پخش (این دور: پیش‌تر L2 پاک نمی‌شد!)
- `school` ⇒ L1هایِ محلیِ آن مدرسه + **`purgeSchoolL2`** — ایندکسِ
  مشترکِ `payesh:cache:school:<sid>` (SADD هنگامِ کش‌کردن) ⇒ **همهٔ
  کاربرانِ کش‌شدهٔ آن مدرسه** از L2 پاک می‌شوند — حتی اگر در L1ِ این
  نمونه نباشند (این دور؛ پیش‌تر فقط L1-resident پاک می‌شدند و بقیه تا
  TTL کشِ کهنه می‌خوردند)
- `all` ⇒ L1ِ محلی (L2 با TTL انقضا می‌کند)

### 3. Eviction (سقف و سیاست)

- L1: **LRU با سقف** — `PAYESH_CACHE_L1_MAX` (پیش‌فرض ۱۰۰۰۰)؛ با هر
  دسترسی، ورودی به انتهای صف می‌رود؛ هنگامِ پرشدن، قدیمی‌ترین خارج
  می‌شود. (این دور؛ پیش‌تر Map بی‌سقف بود = نشتِ حافظه در مقیاس ملی.)
- L2: انقضا با TTL خودِ Redis (بدونِ نیاز به eviction دستی).
- خروج از L1 هرگز دسترسی را نمی‌بندد — L2 پاسخ می‌دهد.

### 4. Stampede Protection (single-flight)

`cache.withSingleFlight(key, fn)` — اگر build یک کلید در حال انجام باشد،
درخواست‌هایِ هم‌زمانِ بعدی همان Promise را می‌گیرند: **N cache-missِ
هم‌زمانِ یک کلید ⇒ یک build/یک نوشتِ کش** (نه N خوانش از store/DB).
مسیرِ `bootstrap` با آن پوشانده شده. (بافتِ هر فرایند مستقل است —
در مقیاسِ چندنمونه‌ای، L2 هنوز حداکثرِ N-instance build را می‌بیند که
قابلِ قبول است؛ قفلِ توزیع‌شده برایِ هر miss هزینهٔ اضافه می‌سازد.)

## تغییراتِ این دور

1. `server/cache.js` — L1 به LRU با سقف + TTL تبدیل شد؛ ایندکسِ
   «مدرسه ⇒ کاربرانِ کش‌شده» (`sAdd` هنگامِ نوشت)؛ `purgeSchoolL2` در
   `invalidateSchool` و شنوندهٔ pub/sub؛ انقضایِ L2 در رویدادِ `user`؛
   `withSingleFlight` + `__l1ForTests`/`__inflightForTests`.
2. `server/redis.js` — دستوراتِ Set: `sAdd`/`sMembers`/`sRem` (با
   فال‌بکِ حافظه).
3. `server/routes/bootstrap.js` — build با single-flight پوشانده شد.
4. `server/routes/{attendance,classes,grades,students,users}.js` —
   ۱۶ نقطهٔ نوشت (ins/upd/del) با `invalidateCollection` مجهز شدند.

## تست‌ها

`tests/wave11-cache.js` — **20 بررسی (C1–C6)** با fake clientِ سازگار با
قرارداد (mini-redis: TTL + SET/EX/NX + Set + اسکرپت‌ها):

- C1 TTL: L2 با EX + ایندکس + L1 بدونِ رفتن به L2 + بازگرداندن از L2
- C2 Invalidation: انقضایِ L2 مدرسهٔ تغییریافته از ایندکس + PUBLISH +
  اثرِ نداشتن روی مدرسهٔ دیگر
- C3 انقضایِ کاملِ L2 بیرونِ L1 (باگِ پیشین)
- C4 LRU: سقف + refresh با دسترسی + L2 به‌عنوانِ پس‌پناه
- C5 Single-flight: ۱۰ هم‌زمان ⇒ یک build + آزادشدنِ کلید بعداً
- C6 bootstrap route: ۲ هم‌زمانِ سرد ⇒ یک set + پاسخِ یکسان +
  `cached:true` در سوم + انقضایِ مدرسه ⇒ تازه‌سازی

## قید — بسته شد (۲۰۲۶-۰۹-۱۲، چت ۳)

~~ردیسِ زنده در ساندباکس نیست~~ — با همان زیرساختِ گیتِ زندهٔ موج ۶
(`tests/wave6-11-redis-live.js`، Redis واقعی ۷.۴.۲)، بخشِ C همین سوئیت
سلسله‌مراتبِ کش را روی L2ِ واقعی سبز کرد: کلیدِ L2 واقعاً در Redis
می‌نشیند و TTL منطقی دارد؛ `invalidateUser`/`invalidateSchool` (با ایندکسِ
sAdd) خوانشِ بعدی را miss می‌کنند؛ **stampede**: ۵۰ خوانندهٔ سردِ
هم‌زمان ⇒ فقط ۱ تولید (`withSingleFlight`)؛ و **W11-2**: ورودیِ خالص-L2ِ
کهنه پس از ابطال با اعتبارسنجیِ epoch رد می‌شود (سناریو با بازگرداندنِ
پاکتِ کهنه به L2 بازسازی شد). جهش‌ها: ابطالِ خنثی، epochِ خاموش و حذفِ
single-flight همه کشته می‌شوند (۵/۵ در سوئیتِ جهشِ مشترک).
