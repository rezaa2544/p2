# M15-10 — graceful degradation + circuit breaker — evidence note

تاریخ: 2026-11-13 · HEADِ شواهد: کامیتِ ci-repair-4/m15-10 (رجیستریِ دو-فازه به همان head بسته می‌شود)

## CLAIM
ماژولِ کلیدِ مدارِ per-dependency با سه وضعیت (closed/open/half-open) و degrade اختیاری، به‌عنوان زیرساختِ مقاومت M15 اضافه شد.

## EVIDENCE
- `server/circuit-breaker.js` — `createCircuitBreaker({failureThreshold, resetTimeoutMs, halfOpenProbes, windowMs})` با پیش‌فرض‌های `PAYESH_BREAKER_*` (مستند در CONFIGURATION_REFERENCE §۲.۵)؛ خطاهای نوع‌دار `CIRCUIT_OPEN` (با `retryAfterMs`) و `CIRCUIT_BREAKER_POLICY`؛ `execute(name, fn, {fallback, failClosed})` → `{value, degraded, reason, error}`؛ `status()` برای /api/health؛ پروبِ نیمه‌بازِ محدود؛ پنجرهٔ لغزان خطا؛ تایمر unref.
- `tests/m15-10-circuit-breaker.test.js` — ۱۵ چک (C1..C15) درون‌حافظه، بدونِ زیرساخت، بدونِ الگوی NOT-RUN (قرارداد P20) — نتیجهٔ محلی: **15/0 سبز**.
- `tests/m15-10-circuit-breaker-mutations.js` — اثبات منفی (False-Green Law):
  - M0 کنترل: سوئیت اصلی روی سورس سالم = سبز
  - M1 جهشِ «مدار هرگز باز نمی‌شود» (خنثی‌سازی شاخهٔ گذار به open در recordFailure) **کشته شد** — سوئیت قرمز
  - M2 چک‌های وضعیت مدار (C2 و هم‌خانواده) شکستند
  - M3 sha256 سورس پیش/پس = یکسان (الگوی BH-mut — سورس هرگز بازنویسی نشد)

## SCOPE / OWNERSHIP
افزودنیِ صرف — هیچ ماژولِ موجود رفتارش عوض نشده؛ سیم‌کشی به redis.js/sms.js به‌عنوان گام بعدی مستقل ثبت می‌شود (مثل ABAC/M15-04).

## NOT VERIFIED
رفتار تحتِ بار واقعی (soak) — بعد از سیم‌کشی به مسیرهای داغ.
