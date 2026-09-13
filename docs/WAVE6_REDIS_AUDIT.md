# Wave 6 — Audit: Redis و Distributed State

_چت ۳ — ۲۰/۰۶/۱۴۰ (2026-09-09)_

## نتیجهٔ کوتاه

همهٔ stateهایِ حیاتیِ توزیع‌شده (OTP، rate limit، session revocation،
idempotency، cache، lock، و نگهبانِ شمارشِ شناسه) حالا روی **Redis** با TTL
است. در **تولید** هیچ پس‌زمینهٔ حافظه‌ای وجود ندارد (P0-13: بدونِ ردیسِ زنده
سرور «آماده» نمی‌شود و استارت نمی‌کند). در **توسعه** درایورِ حافظهٔ
`server/redis.js` (تک‌پروسه، Zero-Disruption) فعال است و `otp.json` فقط در
همان حالت مسیرِ حیاتی است.

## ماتریسِ stateها

| state | کلیدِ Redis | TTL | اتمیک؟ | وضعیت |
|---|---|---|---|---|
| OTP codes/cooldown/delay/tombstones | `payesh:otp:state` (مستندِ سریالی‌شده با seq) | ۵دقیقهٔ عمرِ کد درونِ مستند | ✅ (فلاش زیر قفلِ توزیع‌شده + ادغامِ سنگ‌قبر) | ✅ P0-15 از قبل |
| سقفِ OTP (روزانه/phone/IP در ارسال + IP در login) | `rate:otp:send:phone:day:<p>`، `rate:otp:send:ip:<ip>`، `rate:otp:send:phone:<p>`، `rate:otp:login:ip:<ip>` | پنجره (۸۶۴۰۰/۶۰) | ✅ `incrWithTtl` (INCR+EXPIRE در یک اسکرپت — P0-TTL) | ✅ از قبل |
| **WAF rate limit (ip/audit)** | `payesh:rl:<action>:<id>` | پنجره | ✅ **این دور** — پیش‌تر GET+SET غیراتوم (زیر burst سقف رد می‌شد) | 🆕 Wave 6 |
| **نگهبانِ شمارشِ شناسه (R97)** | `payesh:enum:<jti>` | ۶۰۰s (پنجرهٔ ۱۰دقیقه) | ✅ `incrWithTtl` | 🆕 Wave 6 — پیش‌تر درون‌فروشگاهی (چرخشِ حمله بین نمونه‌ها شمارش را صفر می‌کرد) + رشدِ بی‌پایانِ `__auth.enum` در payesh.json بدونِ GC |
| ابطالِ نشست (jti) | `revoked:<jti>` | باقیِ عمرِ توکن | ✅ (SET EX) | ✅ از قبل + در این دور مرحلهٔ REVOKEٔ نگهبان هم به همین denylist وصل شد (پیش‌تر فقط محلی) |
| نسخهٔ نشست (revoke-all) | `sessver:<userId>` | — (رو به رشد، `INCR`) | ✅ | ✅ از قبل |
| Idempotency (sync uids) | `payesh:idempotency:<uid>` | ۸۶۰۰s | ✅ (SET EX؛ خطِ اول) + کپیِ محلی + `server_processed_uids` در PG | ✅ از قبل |
| کشِ bootstrap | `payesh:cache:bootstrap:<userId>` | ۳۰s | — (کش) | ✅ از قبل (L1 حافظهٔ میکروثانیه‌ای + L2 Redis + انقضای pub/sub) |
| انقضای کش بین نمونه‌ها | channel `payesh:pubsub:inval` | — | ✅ (PUB/SUB) | ✅ از قبل |
| قفل‌هایِ توزیع‌شده (ids/otp-flush/…) | `payesh:lock:<name>` | ۵–۱۰s | ✅ `SET … EX … NX` + رهاکردنِ CAS (Lua) — token | ✅ P0-14 از قبل |

## `otp.json` — آیا هنوز در مسیرِ حیاتی است؟

**در حالتِ ردیس: نه.** boot فایل را نمی‌خواند (guardِ `!useRedis()`)،
`save()` = فلاشِ سریالی به ردیس زیر قفل، `reloadIfChanged()` = خواندن از
ردیس. فایل فقط در **توسعهٔ بدونِ ردیس** (درایورِ حافظهٔ تک‌پروسه) منبع است.

## قفل‌ها: NX + EX؟

بله — `acquireLock` = `SET payesh:lock:<k> <token> EX <ttl> NX` (اتمیک؛
فوق‌العادهٔ `SET NX` در دو مرحله وجود ندارد). رهاکردن فقط با tokenِ مالک
(CAS: `if get == token then del`) — قفلِ منقضی‌شده هرگز توسطِ مالکِ کهنه
حذف نمی‌شود. `incrWithTtl` هم اتمیک است (کلیدِ یتیمِ بی‌TTL از کرشِ میانِ
INCR و EXPIRE خوددرمانی می‌شود).

## Readiness (P0-13) — «اگر ردیس قطع شد، سرور آماده نیست»

- `NODE_ENV=production` بدونِ `REDIS_URL` یا بدونِ ioredis ⇒ `init()` شکست ⇒
  بوت `process.exit(1)`.
- `NODE_ENV=production` با `REDIS_URL`ِ نالایق (وصل‌نشدنی) ⇒ همان،
  فال‌بک به حافظه **ممنوع** است (واگرائیِ بین‌نمونه‌ای).
- `/api/health` در تولید بدونِ ردیسِ زنده ⇒ **503** (`ready(): false`).
- توسعه (بدون REDIS_URL) ⇒ درایورِ حافظه، `ready(): true` (Zero-Disruption).
- **تستِ این رفتار (R7)** با کودفرزند و `REDIS_URL=redis://127.0.0.1:9`
  اثبات می‌شود: `init: ok=false` + `ready=false`.

## تغییراتِ این دور (Wave 6)

1. **`server/cache.js`** — `checkRateLimit` (مسیرِ WAF) با `incrWithTtl`
   اتمیک شد (همین قرارداد/کلید/TTL؛ خطا = fail-open مثلِ `rate-limit.js`).
2. **`server/index.js`** — نگهبانِ R97 روی Redis:
   `enumTouch`/`enumRead` با `incrWithTtl`/`get` روی `payesh:enum:<jti>`
   (TTL=پنجره)؛ `enumStage` در REVOKE علاوه بر ابطالِ محلی،
   `revocation.revokeSession` (denylistِ Redis) را هم می‌زند.
   `sendJsonCounting` هم‌چنان **sync** است (callbackِ ۷ ماژول) — شمارش
   async و بدونِ مسدودکردنِ پاسخ می‌رود. نسخهٔ کهنهٔ `store.__auth.enum`
   (فقط‌رشد، بدونِ GC) از store پاک شد.
3. **`server/redis.js`** — `__setClientForTests(c)` برای تست با
   clientِ جعلیِ سازگار با قرارداد (الگویِ `db.__setPoolForTests`).
4. **`tests/otp-ratelimit-mutations.js`** — الگوهایِ M3–M6 با کدِ پیشینِ
   «R dist» (آرایه‌هایِ درون‌حافظه‌ایِ حذف‌شده) الگوبرداری نمی‌شدند و
   «پیدا نشد» می‌گرفتند (پیشینهٔ از قبل، تأیید روی in-treeٔ تمیز). حالا
   خطِ اجرایِ فعلیِ `if(!rX.allowed) …` در auth.js را جهش می‌دهند: **7/7**.

## تست‌ها

`tests/wave6-redis.js` — ۲۲ بررسی (R1–R8) با **fake client**
(mini-redis: TTL واقعی + دو اسکرپتِ معروف + ثبتِ دستورات):
- R1 OTP state: فلاش/ادغام/سنگ‌قبر بین دو نمونهٔ جعلی
- R2 سقفِ OTP: دقیق (۳ از ۵) + مسیرِ اتمیک + TTL
- R3 burstِ WAF: ۱۲ درخواست هم‌زمان ⇒ دقیقاً ۵ مجاز + TTL
- R4 revocation: denylist با TTL + sessver اتمیک
- R5 idempotency: ثبت با TTL ۲۴ساعته
- R6 lock: `EX`+`NX` در دستور + قفلِ دومین نفر + CASِ غیرواقع
- R7 readiness: production بدونِ ردیسِ زنده ⇒ `ok=false`/`ready=false`
  (کودفرزند) + dev ⇒ memory/ready
- R8 نگهبانِ R97: شمارنده روی ردیس + TTL + مراحل + REVOKEٔ توزیع‌شده

## قید — بسته شد (۲۰۲۶-۰۹-۱۲، چت ۳)

- ~~در این ساندباکس ردیسِ زنده‌ای نیست~~ — **Redis واقعی ۷.۴.۲** (بیلد از
  سورس، بیرونِ ریپو) بالا آمد و `tests/wave6-11-redis-live.js` همهٔ
  قراردادهایی را که تا امروز فقط با fake سنجیده می‌شدند روی سرورِ واقعی
  سبز کرد (**۱۶/۱۶**): init/isRedis، انقضای EX واقعی، `incrWithTtl`
  (پنجرهٔ لغزانِ واقعی)، قفلِ NX با **دقیقاً یک برنده از ۲۰ رقیبِ
  هم‌زمان**، CAS-del فقط-صاحب (Lua)، sAdd/sMembers/sRem،
  **pub/sub بین دو کلاینتِ کاملاً جدا**، و denylist ابطالِ نشست
  (`revoked:<jti>` با TTL = باقیِ عمر). گروهِ DIST سوئیتِ
  `session-revocation` هم برای اولین بار بدونِ skip سبز شد (**۱۸/۱۸**).
  گیت با جهش راستی‌آزمایی شد (`tests/wave6-11-redis-live-mutations.js` —
  **۵/۵ کشته**). بدونِ `redis-server` در PATH ⇒ self-skip (الگوی موج ۳)؛
  اجرا در CI همچنان منوطِ به رفعِ انسدادِ بیلینگ است.
- `sessver:<userId>` بدونِ TTL است (طراحیِ از قبل — نسخهٔ رو به رشد؛
  حجمش = تعدادِ کاربران، ناچیز).
