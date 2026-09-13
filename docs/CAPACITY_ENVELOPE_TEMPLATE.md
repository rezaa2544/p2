# قالب پاکت ظرفیت «پایش» — CAPACITY_ENVELOPE_TEMPLATE

**نسخه:** ۰٫۱٫۰ (Readiness) | **تاریخ:** ۲۰۲۶-۰۹-۱۳ | **مالک:** چت ۴ (Capacity Engineering — بسته ۲ نقشه راه)
**وضعیت:** **قالب خالی — پر شدن منوط به اجرای واقعی روی staging چندنودی (بسته ۱).**
**مرجع‌ها:** `docs/CAPACITY_WORKLOAD_MODEL.md` (مدل بار) · `tools/capacity-saturation-probe.js` (کاوشگر — خروجی JSON این قالب را پر می‌کند)

> **قانون:** هر عدد در این قالب یا از اجرای واقعی می‌آید (با تاریخ/commit/محیط) یا با برچسب
> **NOT-RUN / NOT-COLLECTED** ثبت می‌شود. جای خالیِ بی‌برچسب = نقضِ این قالب. پاکتِ پرشده
> بدون امضای بازبینیِ انسانی، «پیش‌نویس» است.

---

## ۰. شناسنامهٔ اجرا

| فیلد | مقدار |
|---|---|
| تاریخ/ساعت اجرا | NOT-RUN |
| اپراتور | NOT-RUN |
| commit اپ + commit دیتاست | NOT-RUN |
| محیط (تعداد نود، منابع هر نوت، PG/Redis نسخه) | NOT-RUN (پیش‌نیاز: بسته ۱) |
| پروفایل بار (`mixed-national` / `read-browse` / `write-burst`) | NOT-RUN |
| دیتاست (مقیاس مولد، seed) | NOT-RUN (پیش‌فرض طرح: scale=1، seed=20260901) |
| نردبان همزمانی + مدت پله | NOT-RUN |

## ۱. نتیجهٔ پله‌ها (یک ردیف به‌ازای هر پله)

| پله | همزمانی | throughput (rps) | p50 | p95 | p99 | 5xx ٪ | خطای انتقال |
|---|---|---|---|---|---|---|---|
| ۱..n | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN |

## ۲. P50/P95/P99 به‌تفکیک اندپوینت (پلهٔ هدف/اوج)

| اندپوینت | تعداد | p50 | p95 | p99 | خطا |
|---|---|---|---|---|---|
| `GET /api/v1/pull` · `GET /api/v1/bootstrap` · `GET /api/v1/reports/*` · `POST /api/sync` · `POST /api/v1/attendance` · `POST /api/v1/grades` · `POST /api/auth/*` | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN | NOT-RUN |

**قاعدهٔ حکم (Load):** ‏p95 < SLO (300ms) برای **همهٔ** اندپوینت‌ها = PASS؛ یک استثنا = BREACHED + آیتم باز.

## ۳. متریک‌های پایگاه‌داده (به‌ازای پله؛ از `/metrics` + جمع‌آورِ اختیاری مستقیم)

| متریک | منبع | مقدار |
|---|---|---|
| `payesh_db_pool_{total,idle,waiting}` (gauge) | `/metrics` | NOT-RUN |
| `payesh_db_query_errors_total` / `payesh_db_slow_queries_total` (Δ) | `/metrics` | NOT-RUN |
| `payesh_db_up` | `/metrics` | NOT-RUN |
| xact_commit/rollback · blks_read/hit · deadlocks · lock_waiting · locks_not_granted | `--pg-dsn` (اختیاری) | NOT-COLLECTED تا اجرا |
| CPU پایگاه‌داده | exporter نود (لایهٔ OS) | NOT-COLLECTED تا اجرا |

## ۴. متریک‌های کش

| متریک | منبع | مقدار |
|---|---|---|
| `payesh_cache_{hits,misses,lookups}_total` (Δ) + نسبت اصابت | `/metrics` | NOT-RUN |
| used_memory · connected_clients | `--redis-url` (RESP `INFO`، اختیاری) | NOT-COLLECTED تا اجرا |

**SLO کش:** نسبت اصابت > ۸۰٪ (‏`CAPACITY_MODEL.md` §۵).

## ۵. متریک‌های صف/همگام‌سازی

| متریک | منبع | مقدار |
|---|---|---|
| `payesh_sync_queue_depth` (gauge — عمق outbox) | `/metrics` | NOT-RUN |
| `payesh_sync_requests_total` / `backpressure_rejections` / `conflicts` (Δ) | `/metrics` | NOT-RUN |
| موفقیت همگام‌سازی ≥ ۹۹٫۵٪ (بدون دادهٔ گم‌شده) | محاسبه از Δها | NOT-RUN |

## ۶. نقطهٔ اشباع (Stress)

| فیلد | مقدار |
|---|---|
| روش کشف (‏slo / plateau / errors — قدیمی‌ترین نامزد) | NOT-RUN |
| همزمانیِ زانو + جزئیات نامزد | NOT-RUN |
| **حداکثر throughput پایدار** (rps) | NOT-RUN |
| نردبان تا عبور از زانو گسترش یافت؟ | NOT-RUN |

## ۷. جهش و خیساندن (جداگانه ثبت شود)

- **Spike:** بازیابی p95 به زیر SLO < ۳۰s پس از جهش؟ NOT-RUN
- **Soak:** روند RSS/heap در ۲۴h (نشتی = خط قرمز)؟ NOT-RUN

## ۸. حکم نهایی

| حالت | حکم |
|---|---|
| همهٔ SLOها + زانوی مستند + صحت داده زیر بار | **VERIFIED (capacity برای این محیط/پروفایل)** |
| هر جمع‌آورِ غایب | همان قلم **NOT-COLLECTED** می‌ماند — حذف/جعل ممنوع |
| بدون اجرا | **NOT-RUN — ظرفیت ملی اثبات‌نشده (KNOWN UNKNOWN دائمی)** |

**امضای بازبینی:** ______ (تاریخ: ______) — بدون امضا، پاکت = پیش‌نویس.
