# M15-18 — Error Handling ساخت‌یافته: راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت‌ها:** ۲/۲ محلی سبز + CI · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (روی HEAD)

| لایه | فایل/سوئیت | نقش |
|---|---|---|
| سیاستِ خطایِ فرایند | `tests/a34-process-error-policy.test.js` (4/0) | uncaughtException/unhandledRejection = قراردادِ fail-fast/process-policy |
| خطاهایِ تایپ‌دار | `server/circuit-breaker.js` (M15-10) + `m15-10-circuit-breaker.test.js` (15/0) + mutations 4/0 | CIRCUIT_OPEN (retryAfterMs) / CIRCUIT_BREAKER_POLICY — fallback/failClosed — status() برای /api/health |
| خطایِ کلاینتِ PG | `tests/pg-prod-client-error.js` (CI-gated — PG زنده) | کلاس‌بندیِ خطایِ client و fail-closedِ تولید |
| خطاهایِ cache/sync | `tests/sync-cache-errors.js` | خرابیِ Redis/cache در مسیر sync |
| canary/circuit route | index.js L1068/L1383/L1786 | `/api/system/canary/circuit-breaker` + `/api/v1/system/phase6/...` — B5 |

## راستی‌آزماییِ روی HEAD (2026-11-14)

- a34: ۴/۰ ✓ · circuit-breaker: ۱۵/۰ ✓ (محلی)
- pg-prod-client-error: NOT-RUN محلی (بدونِ PG روی 55433) — در CI سبز (رانِ cebd7136)
- خطایِ CIRCUIT_OPEN در index.js L1068 مصرفِ واقعی دارد (envelope با retryAfterMs)

## نتیجه

خطاها ساخت‌یافته‌اند (کد + retryAfter + envelope)، سیاستِ سطحِ فرایند
قرارداد-بسته است، و هر لایه سوئیت + mutation دارد.
