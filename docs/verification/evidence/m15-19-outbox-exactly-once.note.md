# M15-19 — Outbox Exactly-Once: راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت‌ها:** ۵/۵ محلی سبز + CI · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (روی HEAD)

| لایه | فایل/سوئیت | نقش |
|---|---|---|
| موتورِ outbox | `server/outbox.js` (35KB) | enqueue idempotent + lease/fencing: ادعایِ پردازش با token؛ workerِ کهنه با leaseِ قدیم نمی‌تواند رویدادِ جدیدتر را تغییر دهد (L152-208) |
| DLQ اتمیک | `tests/outbox-dlq-atomicity.test.js` (2/2) | انتقالِ DLQ بدونِ گم‌شدنِ رویداد |
| Fencing ایستا | `tests/outbox-lease-fencing.test.js` (17/17) | قراردادِ stale-token guard |
| رِیسِ زنده | `tests/outbox-lease-race-live.js` (CI — PG زنده) | مسابقهٔ واقعیِ workerها |
| قابلیتِ اطمینانِ runtime | `tests/outbox-runtime-reliability.test.js` (7 گذرِ مستقل) | رگرسیونِ DLQ/Redis |
| failover | `tests/phase2-outbox-failover.js` (15KB) | سقوطِ worker و ادامهٔ پردازش |
| جهش‌ها | `tests/wave8-outbox.js` ۱۷/۱۷ + `wave8-outbox-mutations.js` ۵/۵ | اثباتِ منفیِ گاردها |

## راستی‌آزماییِ روی HEAD (2026-11-14)

هر پنج سوئیتِ محلی exit 0 با اعداد بالا؛ lease-race-live در CI سبز (PG سرویس).

## نتیجه

exactly-once به معنایِ عملیاتی: enqueue idempotent + claim دو-مرحله‌ای + fencing
token + DLQ اتمیک — با جهش‌کُشی.
