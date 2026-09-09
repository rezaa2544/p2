# طراحیِ Rate Limiting توزیع‌شده (Redis)

> هدف: سقفِ نرخِ OTP در استقرارِ **چندنمونه‌ای** درست اعمال شود — مهاجم با پخشِ
> درخواست بینِ نمونه‌ها نتواند سقف را دور بزند — و افتِ Redis به خود-DDoS تبدیل نشود.

## ۱. معماری

```
                    ┌─────────┐  ┌─────────┐
                    │ app  A  │  │ app  B  │   (هر تعداد نمونه)
                    └────┬────┘  └────┬────┘
                         │  INCR+EXPIRE │  (اتمیک، یک RTT)
                         ▼            ▼
                    ┌──────────────────────┐
                    │  Redis (شمارنده‌ها)  │  rate:<prefix>:<id>  (TTL=پنجره)
                    └──────────────────────┘
                         │  خرابی → fail-open (مجاز) + لبه (nginx) سقفِ سخت
```

- **کد:** `server/rate-limit.js` — `getKey(prefix, id)` + `checkRateLimit({prefix, identifier, limit, windowSeconds})`.
- **درایور:** `server/redis.js` (متدهای `incr/expire/ttl`؛ همان الگوی try-native→fallback).
  با `REDIS_URL` ← Redis واقعی (توزیع‌شده)؛ وگرنه fallback درون‌حافظه‌ای (تک‌پروسه، dev/test).
- **چرا INCR؟** شمارندهٔ اتمیک زیرِ burstِ همزمان lost-update ندارد؛
  الگوی GET+SET در Node چندپروسه‌ای/چندنمونه‌ای مسابقه دارد (تستِ `ATOMIC-a`: دویستِ همزمان ← دقیقاً ۲۰۰).
- **fail-open آگاهانه:** خطایِ غیرمنتظره ← `allowed:true`. سقفِ واقعیِ لبه (nginx limit_req،
  نگاه کنید به `docs/WAF_DDOS_SETUP.md`) مستقل می‌ماند؛ افتِ Redis نباید ورودِ همه را ببندد.

## ۲. کلیدها و TTL

| سقف | prefix | identifier | limit (پیش‌فرض) | پنجره |
|---|---|---|---|---|
| ارسال/روزانه (هر phone) | `otp:send:phone:day` | phone | `PAYESH_SMS_DAILY_MAX` = ۲۰ | ۸۶۴۰۰s (غلتانِ ۲۴ساعته) |
| ارسال/IP | `otp:send:ip` | IP | `PAYESH_SMS_IP_MAX` = ۱۰ | `PAYESH_SMS_WINDOW_S` = ۹۰۰s |
| ارسال/phone | `otp:send:phone` | phone | `PAYESH_SMS_PHONE_MAX` = ۵ | ۹۰۰s |
| ورود/IP | `otp:login:ip` | IP | `PAYESH_LOGIN_IP_MAX` = ۱۰ | ۹۰۰s |

- شکلِ کلید: `rate:<prefix>:<identifier>`؛ TTL روی اولین INCR ست می‌شود (پنجرهٔ ثابت).
- **آنچه در Redis نیست:** کدِ OTP (هش)، cooldown، و تأخیرِ تصاعدیِ login در `otp.json` ماندند
  (چرخهٔ عمرِ کد تک‌مالکیتی است؛ cooldown را R8 روی فایلِ مشترک نگه می‌دارد).

## ۳. تغییرِ رفتاریِ ثبت‌شده (تنها یکی)

- سقفِ روزانه قبلاً «روزِ تقویمیِ UTC» بود؛ حالا «۲۴ ساعتِ غلتان». سخت‌گیرانه‌تر و قابلِ
  پیش‌بینی‌تر زیرِ مرزِ نیمه‌شب؛ قراردادِ `429/rate_limited` و همهٔ shapeها دست‌نخورده.

## ۴. سناریوها

- **دو نمونه + مسیریابیِ پروکسی:** A و B یک `REDIS_URL` دارند؛ سه ارسال از A + دو ارسال از B
  روی یک phone ← ششمی (از هر نمونه) ۴۲۹ (`DIST-a`)؛ همین برای IP (`DIST-b`) و login (`DIST-c`).
- **Redis خوابیده:** نمونه‌ها با fallback بالا می‌آیند (هشدار در لاگِ بوت)؛ سقف‌ها تک‌نمونه‌ای
  ولی فعال‌اند (`FB-a`)؛ با وصل‌شدنِ Redis، توزیع‌شدگی خودکار برمی‌گردد.
- **خرابیِ میانیِ عملیات:** استثنای incr ← مجاز (fail-open) و درخواست ادامه می‌یابد (`RL-g`).

## ۵. بهره‌برداری

- `REDIS_URL=redis://…` را روی همهٔ نمونه‌ها یکسان ست کنید؛ نمونهٔ Redis را جدا از app نگه دارید.
- `redis-cli --latency` و `INFO stats` (کلیدهای `rate:*`) را مانیتور کنید؛ رشدِ نامتعارفِ
  `rate:otp:send:ip:*` = نشانهٔ حملهٔ پخشی.
- کلیدها خودپاک‌شوند (TTL)؛ نیازی به جاروی دستی نیست.

## ۶. معیارِ موفقیت

- `tests/rate-limit-distributed.js`: ‏۱۶/۱۶ سبز (واحد ۷/۷ با `--unit-only` برای CIِ بدونِ Redis).
- `tests/rate-limit-mutations.js`: ‏۴/۴ کشته + سبزِ نهایی.
- رگرسیون: `tests/otp-ratelimit.js` سبز می‌ماند (۴۹/۴۹)؛ گیت‌های repo (smoke/authz/secret/build) سبز.
