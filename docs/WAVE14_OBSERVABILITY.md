# ویو ۱۴ — Observability (سابقهٔ اجرا)

## فازِ ۱ (چت ۳ — مرج‌شده در PR #22): Tracing
OTel در `server/tracing.js` — W3C trace برای هر درخواست، `X-Trace-Id`،
`trace_id` در خطوطِ JSON لاگ ممیزی، no-PII (`redactForSpan`/`redactUrl`)،
fail-open، export OTLP/HTTP. ایمیج‌های Jaeger در `infra/tracing/`.

## فازِ ۲ (۲۰۲۶-۰۹-۱۰ — این سشن): Metrics + استقرارِ زنده
**چرا فازِ ۲ لازم بود:** چک‌لیستِ Production Readiness سه ❌ روی محور
Observability داشت (dashboards / alerts / live deployment) — کدِ tracing
بود اما هیچ scrape target و هیچ استکِ قابل‌اجرایِ واقعی نداشت.

| بخش | تحویل |
|---|---|
| Exporter | `server/metrics.js` — Prometheus text، صفرِ وابستگیِ جدید؛ http histogram/counters با tapِ `res finish`، guardهایِ کاردینالیتی (route bounded، self-scrape حذف)، lag با `monitorEventLoopDelay`، GC با `PerformanceObserver`، heap با `v8`؛ pullsِ زمان-اسکرپ (redis ping / db healthCheck / outbox count) تک‌تک guard شده ⇒ سرویسِ مرده = `*_up=0` نه /metrics شکسته. وایرینگ `index.js`: مسیرِ `/metrics` (+ دروازهٔ اختیاریِ `METRICS_TOKEN`) و `metrics.attach(server)` |
| استک | `infra/observability/docker-compose.observability.yml` — prometheus v2.54.1، alertmanager v0.27.0، grafana 11.2.0، loki/promtail 3.1.1، otelcol-contrib 0.100.0، jaeger 1.59؛ همۀ bind‌ها 127.0.0.1؛ env-file (`GRAFANA_PASSWORD` اجباری) |
| قوانین | `alert-rules.yml` هفت‌گانهٔ بحرانی با آستانه‌هایِ مصوب — نام‌های متریک با metrics.js قفلِ متقابل |
| داشبورد | `dashboards/payesh-main.json` (۱۰ پنل) + `payesh-logs.json` (جست‌وجوی trace_id) + provisioningِ دیتاسورس‌ها با uidهایِ `payesh-prom/loki/jaeger` و لینکِ exemplar→Jaeger |
| تست | `tests/observability-config.js` **55/55** · `tests/observability-dashboards.js` **30/30** · `tests/observability-config-mutations.js` **6/6** (M1 حذفِ قانون، M2 رانشِ p95، M3 رانشِ پورت OTLP، M4 رانشِ مسیرِ اسکرپ، M5 رانشِ نامِ متریک + خط‌پایه) |

**نکاتِ طراحی:**
1. **ضدرانشِ سه‌جانبه:** تست‌ها نامِ متریک را بینِ `metrics.js ⇄ alert-rules ⇄ dashboards` و پورتِ OTLP را بینِ `tracing.js ⇄ compose` می‌پایند — تغییرِ یک‌طرفه CI را می‌شکند (این دقیقاً همان چیزی است که M3/M4/M5 اثبات می‌کنند).
2. **امنی:** edge هرگز `/metrics` را روت نمی‌کند (nginx فقط `/api/` و استاتیک)؛ اسکرپ از داخلِ میزبان/شبکه؛ توکن اختیاری.
3. **هزینه:** تاپِ درخواست ≈ ۲ فراخوانیِ hrtime در `finish`؛ کارهایِ گران فقط زمانِ اسکرپ (۱۵ث). smoke بدونِ تغییرِ رفتار سبز ماند (۵۴۷/۵۴۷).
4. **راهنمای استقرار + Import:** `docs/OBSERVABILITY_DEPLOYMENT.md`.

## باقی‌مانده (محیطِ واقعی)
- اجرایِ compose روی میزبان + تأییدِ targets UP در `/targets`
- تنظیمِ __WEBHOOK_URL__ واقعی و یک آلتِ تست (`amtool` یا injectِ خطایِ مصنوعی)
- در صورتِ نیازِ دیتاسنتر-دومی: scrape config با targetهایِ منطقه (مستند در prometheus.yml)
