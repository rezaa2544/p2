# گزارش دور ۱۰۷ (چت ۳) — Wave 11: Cache (TTL، invalidation، stampede protection)

**تاریخ:** ۲۰/۰۶/۱۴۰ (2026-09-09)
**شاخه:** `arena/01a08545-p2`
**مأموریت (ناظر):** بررسی/تکمیل استراتژی کشینگ برای مقیاسِ ملی — TTL برای همهٔ کلیدها، invalidation پس از تغییر داده، max size و eviction policy، stampede protection.

---

## ۱. Audit وضعیتِ پیشین + ۴ شکافِ پیدا و رفع‌شده

| # | شکاف | وضعیتِ پیشین | رفع (این دور) |
|---|---|---|---|
| ۱ | **L1 بی‌سقف** | Mapِ فقط‌رشد در هر فرایند (نشتِ حافظه در مقیاسِ ملی) | **LRU با سقف** — `PAYESH_CACHE_L1_MAX` (پیش‌فرض ۱۰۰۰۰) + TTL 60s برایِ هر ورودی؛ دسترسی ⇒ جایگاهِ تازه |
| ۲ | **انقضایِ ناقصِ L2** | `invalidateSchool` فقط کاربرانی را از L2 پاک می‌کرد که در L1ِ همان نمونه بودند (بقیه تا TTL دادهٔ کهنه می‌خوردند)؛ رویدادِ `user` اصلاً کلیدِ L2 را نمی‌زد | **ایندکسِ مشترک** `payesh:cache:school:<sid>` (SADD هنگامِ کش‌کردن) + `purgeSchoolL2` در انقضایِ school **و** شنوندهٔ pub/sub (نمونه‌هایِ خواهر) + انقضایِ کلیدِ L2 در رویدادِ user |
| ۳ | **REST routes کش نمی‌زدند** | فقط opsِ sync می‌زدند؛ ثبتِ نمره/حضور از مسیرِ REST تا ۵ دقیقه کشِ کهنه می‌داد | هر **۱۶ نقطهٔ نوشت** (ins/upd/del در ۵ فایل) با `cache.invalidateCollection(col, schoolId)` مجهز |
| ۴ | **Stampede** | N درخواستِ هم‌زمانِ cold-cache ⇒ N build/N خوانش | `cache.withSingleFlight(key, fn)` — N هم‌زمانِ یک کلید ⇒ **یک build/یک نوشت**؛ مسیرِ bootstrap پوشانده شد |

**TTL:** همهٔ کلیدهایِ کش TTL دارند — bootstrap (L2) = **۳۰۰s (۵ دقیقه)**،
L1 = 60s. سیاستِ «گزارش‌ها ۱ ساعت» در سند ثبت شد (در حال حاضر کشی برایِ
گزارش وجود ندارد — `public-report` بدونِ کش است). کلیدِ دائمی: ندارد
(فقط ایندکسِ انقضایِ `payesh:cache:school:<sid>` بدونِ TTL است — حجمش
تعدادِ کاربرانِ کش‌شده و کلیدهایِ عضو با TTLِ خود می‌میرند).

## ۲. تغییراتِ کد

- **`server/cache.js`** — LRU+سقف، ایندکسِ مدرسه، `purgeSchoolL2`،
  انقضایِ L2 در رویدادِ user، `withSingleFlight` + `__l1ForTests`/
  `__inflightForTests`
- **`server/redis.js`** — `sAdd`/`sMembers`/`sRem` (با فال‌بکِ حافظه)
- **`server/routes/bootstrap.js`** — build با single-flight
- **`server/routes/{attendance,classes,grades,students,users}.js`** —
  ۱۶ نقطهٔ نوشت + `require('../cache')`

## ۳. تست‌ها — `tests/wave11-cache.js` (20/20 سبز)

با **fake clientِ سازگار با قرارداد** (mini-redis: TTL واقعی +
SET/EX/NX + دستوراتِ Set + اسکرپت‌ها — بدونِ ردیسِ زنده):

- **C1 TTL/سلسله‌مراتب:** L2 با EX (≤300s) + عضویتِ ایندکس + L1 بدونِ
  رفتن به L2 + بازگرداندن از L2 پس از خالی‌شدنِ L1
- **C2 Invalidation:** تغییرِ collection با school_id ⇒ انقضایِ L2
  کاربرانِ همان مدرسه (از ایندکس) + PUBLISH + اثرِ نداشتن روی مدرسهٔ دیگر
- **C3 باگِ پیشین:** انقضایِ کاملِ L2 حتی برایِ کاربرانی که در L1ِ
  این نمونه نیستند (فقط با ایندکس)
- **C4 LRU/eviction:** سقف ⇒ خروجِ قدیمی‌ترین + refresh با دسترسی +
  خروج از L1 = دسترسی بسته نمی‌شود (L2 می‌دهد)
- **C5 Single-flight:** ۱۰ فراخوانِ هم‌زمانِ یک کلید ⇒ **دقیقاً یک
  build** + همه همان نتیجه + کلید بعداً دوباره آزاد
- **C6 route واقعی (bootstrap):** ۲ درخواستِ هم‌زمانِ سرد ⇒ **یک
  set** + پاسخِ یکسان + `cached:true` در سوم + انقضایِ مدرسه (مثلِ ثبتِ
  نمره) ⇒ پاسخِ تازهٔ چهارم

## ۴. دروازه‌هایِ سلامت

| دروازه | نتیجه |
|---|---|
| smoke | **547/547** ✅ |
| check-authz | **0** (۶/۶) ✅ |
| secret-scan | **11/11** ✅ |
| build --check | ✅ |

**رگرسیون:** server1 31/31 · server12 43 · server13 9 · server14 13 ·
server15 40 · server17 70 · server18 55 · pull-bootstrap 12/12 ·
wave1-writes 14/14 · wave6-redis 22/22 · sync-atomic-batch 22/22 ·
waf-mutations 4/4 — همه سبز. پیشینه‌ها بدونِ تغییر: server-mutations 17/20.

## ۵. کامیت‌ها و فشار (push)

| کامیت | هش |
|---|---|
| feat (هسته + تست‌ها) | `ea827cf` |
| docs (استراتژی + AI_PROMPT 0.5.32 + ROADMAP B.5 + HANDOFF) | `d695eb7` |
| report | این گزارش |

- **فشار و تأیید:** `git push origin arena/01a08545-p2` موفق
  (`cd3fe5b..d695eb7`)؛ `git ls-remote origin arena/01a08545-p2` =
  `d695eb7b497ec44f4eaf506c53fe93b58b9c1177` = HEAD در لحظهٔ تأیید
  (کامیتِ این گزارش در همان پوشِ بعدی قرار گرفت).

## ۶. قید (pending)

ردیسِ زنده در ساندباکس نیست — همه با fake قراردادسازگار اثبات شد
(همان قیدِ Wave 6)؛ رفتارِ درایورِ واقعی (ioredis 6) از قبل در
`redis-fallback.js` (10/10) پوشش دارد.
