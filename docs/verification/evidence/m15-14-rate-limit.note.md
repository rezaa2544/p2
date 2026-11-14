# M15-14 — Rate Limiting (API/DDoS): راستی‌آزماییِ روی HEAD

**تاریخ:** 2026-11-14 · **سوئیت‌ها:** ۶/۶ سبز روی HEAD · **کد:** بدونِ تغییر (تحویلِ کاملِ موجود)

## نقشهٔ تحویلِ موجود (همه روی HEAD)

| لایه | فایل | محدوده |
|---|---|---|
| شمارنده‌های توزیع‌شده | `server/rate-limit.js` | getKey/checkRateLimit/checkSlidingWindow/**checkTenantRateLimit** — Redis اتمیک |
| OTP send/login | `server/auth.js` | per-phone/per-IP/دِیلی (۵ فراخوانی) — 429 `rate_limited` |
| همگام‌سازی | `server/sync.js` L670 | ctx.rateLimit تزریق‌شده (index.js L844) — مسیرِ pull/push |
| A-35 tenant | `server/index.js` L1441 | `/api/v1/*` per-tenant sliding-window 600/60s (`PAYESH_TENANT_API_LIMIT/WINDOW_S`) — Redis-down = fail-closed 503 (قرارداد B5)؛ باگِ limiter = fail-open مستند |
| WAF/DDoS | `server/waf.js` (14KB) + `abuse-guard.js` + `attack-detector.js` | لبهٔ هر درخواست (index.js L731-1109) — anomaly → audit/metric/webhook |

## راستی‌آزماییِ روی HEAD (2026-11-14)

| سوئیت | نتیجه |
|---|---|
| tests/otp-ratelimit.js | ۴۹ ✅ / ۰ ❌ |
| tests/rate-limit-distributed.js | exit 0 |
| tests/a35-tenant-rate-limit.test.js | ۱۱/۰ |
| tests/waf-ddos.js | exit 0 |
| tests/rate-limit-mutations.js | ۴/۴ جهشِ کشته‌شده |
| tests/otp-ratelimit-mutations.js | همهٔ جهش‌ها کشته شدند |

## نتیجه

بدونِ شکافِ اجرایی: هر مسیرِ حساس (OTP/sync/v1) لایهٔ rate-limit دارد؛ لبهٔ شبکه
(WAF + attack-detector + abuse-guard) DDoS را می‌بندد؛ هر دو مسیرِ خرابیِ Redis
(fail-closed برایِ حدِ tenant، fail-open مستند برایِ باگ) قراردادِ A-35/B5 هستند.
اثباتِ منفی: دو سوئیتِ mutation — هیچ guardی «سبزِ بی‌دندانه» نیست.
