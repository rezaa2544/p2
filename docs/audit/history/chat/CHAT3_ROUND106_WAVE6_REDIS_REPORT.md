# گزارش دور ۱۰۶ (چت ۳) — Wave 6: Redis و Distributed State (Audit و تکمیل)

**تاریخ:** ۲۰/۰۶/۱۴۰ (2026-09-09)
**شاخه:** `arena/01a08545-p2`
**مأموریت (ناظر):** Audit وضعیت Redis (OTP، rate limit، session، idempotency، cache، lock)؛ اطمینان از اینکه هیچ state حیاتی به‌صورت fallback حافظه‌ای باقی نمانده؛ تست‌های جدید با fake/Redis واقعی؛ اسنکواری.

---

## ۱. نتیجه Audit

ماتریسِ کامل در **`docs/WAVE6_REDIS_AUDIT.md`**. خلاصه:

| state | کلید | TTL | وضعیت |
|---|---|---|---|
| OTP (codes/cooldown/delay/tombstones) | `payesh:otp:state` + seq + قفل توزیع‌شده | درون‌مستند | ✅ از قبل (P0-15) — **ردیس منبعِ حقیقت**؛ `otp.json` فقط توسعهٔ بدونِ ردیس |
| سقف‌های OTP (روزانه/phone/IP×۲) | `rate:otp:*` | پنجره | ✅ از قبل — اتمیک (`incrWithTtl`) |
| **WAF rate limit** | `payesh:rl:<action>:<id>` | پنجره | 🆕 **این دور** — پیش‌تر GET+SET **غیراتوم** |
| **نگهبانِ شمارشِ شناسه (R97)** | `payesh:enum:<jti>` | ۶۰۰s | 🆕 **این دور** — پیش‌تر درون‌فروشگاهی + رشدِ بی‌پایان در payesh.json |
| ابطالِ نشست | `revoked:<jti>` / `sessver:<uid>` | باقیِ توکن / — | ✅ از قبل (P0-13-era) |
| Idempotency | `payesh:idempotency:<uid>` | ۸۶۴۰s | ✅ از قبل (+کپیِ محلی + PG) |
| کشِ bootstrap | `payesh:cache:bootstrap:<uid>` + pub/sub | ۳۰s | ✅ از قبل |
| قفل‌ها | `payesh:lock:<name>` | ۵–۱۰s | ✅ از قبل — **`SET … EX … NX` + رهاکردنِ CAS** (سؤالِ ناظر: بله) |

**`otp.json` در مسیرِ حیاتی؟:** در حالتِ ردیس **نه** — boot فایل را نمی‌خواند،
`save()` فلاش به ردیس است، `reloadIfChanged()` از ردیس می‌خواند. فایل فقط
در حالتِ توسعهٔ بدونِ ردیس (درایورِ حافظهٔ تک‌پروسه) فعال است.

**فال‌بکِ حافظه‌ای در state حیاتی؟** در **تولید نه** — P0-13 از قبل:
`NODE_ENV=production` بدونِ ردیسِ زنده (یا بدونِ REDIS_URL/ioredis) ⇒
بوت `process.exit(1)` و `/api/health` ⇒ **503** (`ready(): false`). در
**توسعه** درایورِ حافظهٔ `redis.js` (Zero-Disruption، تک‌پروسه) مجاز است.
این رفتار همین دور **تست** شد (R7 با کودفرزند و `REDIS_URL`ِ نالایق:
`init: ok=false` + `ready=false`).

## ۲. دو شکافِ پیدا و رفع‌شده

1. **rate-limitِ WAF غیراتوم بود** (`cache.checkRateLimit` با GET+SET —
   زیر burstِ همزمان دو خوانشِ موازی هم‌نفره می‌خواندند و سقف رد می‌شد).
   حالا `incrWithTtl` (INCR+EXPIRE در یک اسکرپت) — همان کلید/TTL/قرارداد،
   خطا = fail-open. تست: burstِ ۱۲ هم‌زمان با سقفِ ۵ ⇒ **دقیقاً ۵ مجاز**.
2. **نگهبانِ شمارشِ شناسه (R97) درون‌فروشگاهی بود** — چرخشِ حمله بین
   نمونه‌ها شمارش را صفر می‌کرد؛ هم‌چنین `store.__auth.enum` بدونِ GC در
   `payesh.json` رشدِ بی‌پایان داشت. حالا شمارنده روی `payesh:enum:<jti>`
   (TTL = پنجرهٔ ۱۰دقیقه، اتمیک) و مرحلهٔ REVOKE علاوه بر ابطالِ محلی،
   **denylistِ Redis** را هم می‌زند (توزیع‌شده). `sendJsonCounting`
   (callbackِ sync که ۷ ماژول استفاده می‌کنند) قراردادش دست‌نخورده ماند؛
   شمارش async و بدونِ مسدودکردنِ پاسخ می‌رود.

## ۳. تغییراتِ کد (۳ فایل + ۲ تست)

- `server/cache.js` — `checkRateLimit` اتمیک (سقفِ WAF)
- `server/index.js` — نگهبانِ R97 روی Redis + REVOKEٔ توزیع‌شده + پاک‌سازیِ
  `__auth.enum` کهنه + خروجیِ `__enumForTests`
- `server/redis.js` — `__setClientForTests` (hookِ تست؛ الگویِ `db.__setPoolForTests`)
- `tests/wave6-redis.js` — **تازه** (۲۲ بررسی، R1–R8)
- `tests/otp-ratelimit-mutations.js` — رفعِ پیشینه (زیر)

## ۴. تست‌ها

**`tests/wave6-redis.js` — 22/22 سبز** با **fake clientِ سازگار با
قرارداد** (mini-redis: TTL واقعی + دو اسکرپتِ معروف + ثبتِ دستورات —
بدونِ ردیسِ زنده در ساندباکس):

- R1 OTP: فلاش/ادغام/سنگ‌قبر بین دو نمونهٔ جعلی (کدِ مصرف‌شده همه‌جا می‌میرد)
- R2 سقفِ OTP: ۳ از ۵ مجاز + مسیرِ اتمیک (EVAL) + TTL
- R3 WAF: burstِ ۱۲ ⇒ دقیقاً ۵ مجاز + TTL
- R4 revocation: denylist با TTL + sessver اتمیک
- R5 idempotency: ثبت با TTL ۲۴ساعته
- R6 lock: `EX`+`NX` در دستور + دومین نفر قفل نمی‌گیرد + رهاکردنِ CAS (token)
- R7 readiness: production بدونِ ردیسِ زنده ⇒ `ok=false`/`ready=false`؛
  dev ⇒ memory/ready (کودفرزند)
- R8 نگهبانِ R97: شمارنده روی ردیس + TTL + مراحلِ تأخیر + REVOKEٔ توزیع‌شده

## ۵. رفعِ پیشینه (نه رگرسیون)

الگوهایِ **M3–M6** در `tests/otp-ratelimit-mutations.js` با کدِ پیشینِ
«R dist» (آرایه‌هایِ درون‌حافظه‌ایِ `daily[phone]`/`rli[ip]`/…)
الگوبرداری می‌شدند که دیگر در auth.js نیستند ⇒ «الگو پیدا نشد» (3/7).
**پیشینه** بودن تأیید شد (الگوها ۰ بار در auth.js؛ diffِ من auth.js را
نزنده؛ هر دو فایل از commit 2a2b74f = main). الگوها به خطِ اجرایِ فعلی
(`if(!rX.allowed) …`) منتقل شدند ⇒ **7/7 کشته**.
هم‌چنین پیشینهٔ `server-mutations.js` = 17/20 بدونِ تغییر (M1/M14/M15).

## ۶. دروازه‌هایِ سلامت

| دروازه | نتیجه |
|---|---|
| smoke | **547/547** ✅ |
| check-authz | **0** (۶/۶) ✅ |
| secret-scan | **11/11** ✅ |
| build --check | ✅ |

**رگرسیون:** server1 31/31 (شاملِ S25 نگهبان) · server17 70 ·
server11-sms 9 · otp-ratelimit 49 + جهش‌ها 7/7 · otp-redis 16/16 ·
redis-fallback 10/10 · redis-key-audit 17/17 · rate-limit-distributed 9/9 ·
session-revocation 16/16 + جهش‌ها 3/3 · lock-atomic 12/12 · waf-mutations 4/4 ·
sync-atomic-batch 22/22 · wave1-writes 14/14 · id-collision 11 · occ 18 ·
tombstone 25 — **همه سبز**.

## ۷. کامیت‌ها و فشار (push)

| کامیت | هش |
|---|---|
| feat (هسته + تست‌ها) | `e0c0308` |
| docs (اسنکواری + AI_PROMPT 0.5.31 + ROADMAP B.4 + HANDOFF) | `a4ffe27` |
| report | این گزارش |

- **فشار و تأیید:** `git push origin arena/01a08545-p2` موفق
  (`9902a03..a4ffe27`)؛ `git ls-remote origin arena/01a08545-p2` =
  `a4ffe2738a206e2cd8c7cdf4cc2c5efbe3e1eec3` = HEAD در لحظهٔ تأیید
  (کامیتِ این گزارش در همان پوشِ بعدی قرار گرفت).

## ۸. قید (pending) — ثبت‌شده طبق دستور

- در ساندباکس **ردیسِ زنده‌ای نیست**. همهٔ رفتارها با fake clientِ
  سازگار با قرارداد و برایِ «ردیسِ قطع» با `REDIS_URL`ِ نالایق (کودفرزند)
  اثبات شده‌اند. اتصالِ واقعی به `redis-server` (مثلاً service در CI)
  **pending** است؛ منطقِ درایورِ ioredis 6 از قبل پوشش دارد
  (redis-fallback 10/10، session-revocation 16/16 — بخشِ redis-server
  با skip).
