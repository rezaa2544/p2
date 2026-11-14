# M15-20 — Smoke/Health: راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت‌ها:** ۲/۲ محلی سبز + CI · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (روی HEAD)

| لایه | فایل/سوئیت | نقش |
|---|---|---|
| دودِ کامل | `tests/smoke.js` (509KB) | سوئیتِ دودِ canonical — در هر رانِ CI |
| شاخصِ سلامت | `server/health-index.js` (13KB) + `/api/health` (index.js L1243، GET/HEAD) | سلامتِ PG/Redis/circuit-breaker (M15-10 status()) |
| جهشِ شاخص | `tests/health-index.js` ۳۲/۳۲ + `health-index-mutations.js` ۵/۵ کشته | اثباتِ منفی |
| فرونشستنِ سیاه | `a-next-health-blackhole.js`، `b-pg-health-blackhole.js` (CI) | رفتارِ health در سیاه‌شدنِ وابستگی‌ها |
| سلامتِ اسناد | `docs-health.js` | قراردادِ اسنادِ سلامت |

## راستی‌آزماییِ روی HEAD (2026-11-14)

- health-index ۳۲/۳۲ ✓ + mutations ۵/۵ ✓ (محلی)
- smoke.js و blackholeها در CI سبز (رانِ 43556332277-success روی 61060c52)

## نتیجه

/api/health با شاخصِ چند-وابستگیِ جهش‌کُشته + سوئیتِ دودِ canonical در هر push.
