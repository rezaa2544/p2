# 📡 استقرارِ زندهٔ استکِ Observability (ویو ۱۴)

> فایل‌ها همه `infra/observability/`؛ متریک‌ها `server/metrics.js`؛ قوانین
> `alert-rules.yml`؛ داشبوردها `dashboards/*.json` (خودکار import با provisioning).
> سناریوهایِ اضطراری به `docs/DR_RUNBOOK.md §۵` وصل‌اند (اعلانِ alertmanager
> دقیقاً همان چک‌لیست‌ها را صدا می‌زند).

## ۱) پیش‌نیازها
- میزبانِ Docker Compose v2؛ شبکهٔ داخلیِ قابل‌اسکرپ (Prometheus از داخلِ کانتینر به `host.docker.internal:3000` می‌رسد — `extra_hosts: host-gateway` در compose ست)
- برنامه با envهایِ ترسینگ (پیش‌فرض‌ها کار می‌کنند):
  `TRACING_ENABLED=1` — export به `http://127.0.0.1:4318/v1/traces` (پیش‌فرضِ `server/tracing.js`)؛ برایِ collector دور از localhost: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=...`
- اختیاریِ سخت‌شده: `METRICS_TOKEN=<توکن>` روی همهٔ instanceها؛ آنگاه Prometheus هم باید هدرِ `X-Metrics-Token` بفرستد (scrape_config → `authorization: { credentials: "<توکن>" }` در prometheus.yml میزبان — عمداً در فایلِ ریپو نیاورده‌ایم تا راز در git ننشیند)

## ۲) بالا آوردن
```bash
cp infra/observability/env.observability.example infra/observability/.env.observability
$EDITOR infra/observability/.env.observability    # GRAFANA_PASSWORD (+PAYESH_LOG_DIR)
docker compose -f infra/observability/docker-compose.observability.yml \
  --env-file infra/observability/.env.observability up -d
curl -s http://127.0.0.1:9090/-/ready && echo prom-ok
```

## ۳) پنج دقیقهٔ اولِ صحت‌سنجی
| چه‌چیزی | کجا | انتظار |
|---|---|---|
| targets UP | `127.0.0.1:9090/targets` | `payesh-api` با series `payesh_*` (حداقل ۲۰) |
| متریک‌هایِ HTTP | `127.0.0.1:9090/query` → `sum(rate(payesh_http_requests_total[1m]))` | عدد > ۰ پس از چند درخواست |
| قوانین فعال | `.../rules` | هر ۷ قانونِ payesh-critical با `for` نمایش داده شود |
| لاگ زنجیر | Grafana → Explore → payesh-loki → `{service="payesh", log_source="audit-log"}` | خطوطِ JSON با فیلدِ trace_id |
| Trace | `127.0.0.1:16686` → service `payesh-api` | اسپن‌هایِ http با تگِ no-PII |
| اعلانِ خودِ تستی | `127.0.0.1:9093` | خالی؛ `amtool alert add test severity=critical` ⇒ webhook |

**از پنل تا Trace:** در dashboard اصلی، روی نمودارِ p95 نقطهٔ exemplar ⇒ پرش به Jaeger (provisioningِ `exemplarTraceIdDestinations`)؛ در خطوطِ Loki، لینکِ `trace_id` (derivedFields) همان کار را می‌کند.

## ۴) داشبوردها
`grafana/provisioning/dashboards/payesh.yaml` پوشهٔ mount شده را خودکار import می‌کند (پوشهٔ «Payesh») — نیازی به import دستی نیست. اگر Grafana بیرونِ compose اجرا می‌شود:
Dashboards → Import → upload → `infra/observability/dashboards/payesh-main.json` (datasourceها با uid پیش‌بینی شده‌اند؛ اگر uid خودتان هست، select دستی).

## ۵) چرخشِ مسئولیت و دامنهٔ نگهداری
- retention: prom 30 روز (compose flag) · loki 30 روز (`retention_period: 720h`) — ظرفیتِ دیسکِ ۱۰G را برایِ ۵۰۰k-دانش‌آموزیِ `CAPACITY.md` کافی بدانید؛ بیشترش = S3/TSDB remote-write (مستندِ طراحی، اجرا نشده)
- scrape_interval=15s؛ پنجرهٔ rate/q=5m؛ برایِ اسکرپِ منطقهٔ دوم، targetها را اضافه کنید (نمونه در `prometheus.yml` کامنت)
- **هیچ رازی در این ریپو نیست** (webhook/email با placeholder؛ env-fileها ۰۶۰۰ و بیرونِ git) — secret-scan CI پاس است

## ۶) خرابیِ خودِ استک
استک observability در مسیرِ داده نیست (tracing fail-open؛ metrics pull فقط زمانِ اسکرپ؛ `/metrics` کرش نکند، سرویس نمی‌افتد). مرگِ Prometheus/Grafana هیچ اثری روی API ندارد؛ سناریوی «کوریِ مانیتورینگ» را در drill فصلی با قطعِ استک تست کنید (برنامهٔ RELIABILITY_DR_PLAN §۳).
