# 🔭 راه‌اندازی زندهٔ استک رصدپذیری — OBSERVABILITY_LIVE_SETUP

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۰ | **مالک:** چت ۶ (مستندات و انتشار)
**وضعیت:** راهنمای عملیاتی میزبان — مکمل `docs/OBSERVABILITY.md` (معماری) و `docs/OBSERVABILITY_DEPLOYMENT.md` (استقرار موج ۱۴).
**مرجع‌ها:** `infra/observability/docker-compose.observability.yml` · `infra/observability/prometheus.yml` · `infra/observability/alert-rules.yml` · `server/metrics.js` · `server/tracing.js` · `docs/WAVE14_OBSERVABILITY.md`

> **تفکیک اسناد:** معماری و مدل متریک/لاگ/تریس در `OBSERVABILITY.md`؛ سیاست آلارم و
> اس‌ال‌آی هم همان‌جا؛ این سند فقط «چطور روی میزبان واقعی بالا بیاوریم، تأیید کنیم و بخوابانیم».

---

## ۱) پیش‌نیازها

| مورد | مقدار |
|---|---|
| داکر | Docker Engine + Compose v2 (همهٔ سرویس‌ها کانتینری‌اند؛ حالت باینریِ بدون داکر پشتیبانی نمی‌شود) |
| شبکه | همهٔ پورت‌ها فقط روی `127.0.0.1` بسته می‌شوند؛ برای دسترسی ریموت، تونل امن بزنید (هرگز پورت را عمومی نکنید) |
| پورت‌ها | پرومتهوس ۹۰۹۰ · آلرت‌منیجر ۹۰۹۳ · گرافانا ۳۰۰۱ · جیگر ۱۶۶۸۶ · او‌تی‌ال‌پی‌اچ‌تی‌تی‌پی ۴۳۱۸ (کلکتور) |
| برنامهٔ پایش | در حال اجرا روی پورت ۳۰۰۰ با `TRACING_ENABLED=1` (پیش‌فرض فعال) و متغیرهای `server/index.js` معمول |
| فایل محیط | `GRAFANA_PASSWORD` اجباری است؛ بدون آن گرافانا بالا نمی‌آید (طعمیِ تعمدی برای جلوگیری از استقرار ناامن) |

> **اختلاف با ابلاغ (صداقت):** اسکریپت‌های `tools/observability-up.sh` / `observability-down.sh`
> در ریپو **وجود ندارند**؛ مسیر سریع همان دستورات داکر کامپوز زیر است (معادل همان اسکریپت‌ها).
> ساخت اسکریپت‌ها قلم آیندهٔ §۷ همین سند و فهرست آیندهٔ نمایه است.

---

## ۲) راه‌اندازی سریع (۵ دقیقه)

```bash
# 1) فایل محیط (فقط یک‌بار؛ فایل واقعی 0600 و بیرون گیت است)
cp infra/observability/env.observability.example infra/observability/.env.observability
$EDITOR infra/observability/.env.observability
#    GRAFANA_PASSWORD=<گذرواژهٔ قوی>
#    PAYESH_LOG_DIR=/var/log/payesh        # یا در ریپو: server/data

# 2) بالا آوردن استک (از ریشهٔ ریپو)
docker compose -f infra/observability/docker-compose.observability.yml \
  --env-file infra/observability/.env.observability up -d

# 3) برنامه را با پیش‌فرض‌های ترسینگ اجرا کنید
TRACING_ENABLED=1 node server/index.js    # OTLP → http://127.0.0.1:4318/v1/traces

# 4) یک نگاه سریع
curl -s http://127.0.0.1:9090/-/ready && echo prom-ok
```

اختیاری سخت‌شده: `METRICS_TOKEN=<توکن>` روی همهٔ نمونه‌های برنامه، و در `prometheus.yml`
میزبان `authorization: { credentials: "<توکن>" }` برای اسکرپ (عمداً در فایل ریپو نیست تا راز در گیت ننشیند).

---

## ۳) گام‌به‌گام دستی (اگر کامپوز کار نکرد)

ترتیب اهمیت سرویس‌ها: پرومتهوس ← آلرت‌منیجر ← گرافانا ← (لوکی/پروم‌تیل و کلکتور/جیگر).

1. **پرومتهوس:** `docker run -d --name prom -p 127.0.0.1:9090:9090 --add-host host.docker.internal:host-gateway -v $PWD/infra/observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro -v $PWD/infra/observability/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro prom/prometheus:v2.54.1 --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.retention.time=30d --web.enable-lifecycle`
2. **آلرت‌منیجر:** همین الگو با `prom/alertmanager:v0.27.0` و پورت ۹۰۹۳؛ کانفیگ `alertmanager.yml` فقط مانت شود.
3. **گرافانا:** `grafana/grafana:11.2.0` با پورت میزبان ۳۰۰۱ به ۳۰۰۰ کانتینر؛ `GF_SECURITY_ADMIN_PASSWORD` از محیط؛ دو مانت: `grafana/provisioning` و `dashboards` (هر دو `:ro`).
4. **لوکی + پروم‌تیل:** `grafana/loki:3.1.1` با `loki-config.yml`؛ پروم‌تیل همان نسخه با `promtail.yml` و برچسب `PAYESH_LOG_DIR`.
5. **کلکتور + جیگر:** `otel/opentelemetry-collector-contrib:0.100.0` با `otelcol-config.yml` (پذیرش او‌تی‌ال‌پی روی ۴۳۱۸) و `jaegertracing/all-in-one:1.59` با یو‌آی ۱۶۶۸۶.
6. **اتصال برنامه:** اگر کلکتور دور از میزبان برنامه است، `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` را روی برنامه تنظیم کنید؛ ورنه پیش‌فرض `server/tracing.js` همین آدرس محلی است.

---

## ۴) تأیید سلامت

| چه‌چیزی | کجا | انتظار |
|---|---|---|
| تارگت‌ها | `http://127.0.0.1:9090/targets` | `payesh-api` وضعیت UP با سری‌های `payesh_*` (دست‌کم ۲۰ سری) |
| توان | کوئری `sum(rate(payesh_http_requests_total[1m]))` | عدد > ۰ پس از چند درخواست |
| قوانین | `http://127.0.0.1:9090/rules` | هر ۷ قانون گروه `payesh-critical` با `for` حاضر |
| داشبورد | گرافانا → پوشهٔ «Payesh» | `payesh-main.json` (۱۰ پنل) + `payesh-logs.json` بدون خطای دیتاسورس |
| لاگ زنجیر | گرافانا → Explore → `payesh-loki` → `{service="payesh"}` | خطوط جی‌سان با فیلد `trace_id` |
| تریس | `http://127.0.0.1:16686` | سرویس `payesh-api` با اسپن‌های بدون پی‌آی‌آی |
| اعلان‌دهی | `http://127.0.0.1:9093` | صفحهٔ آلرت‌ها باز؛ وب‌هوک هنوز `__WEBHOOK_URL__` واقعی نشده |

---

## ۵) تزریق آلرت تستی (تأیید انتها-به-انتها)

```bash
# الف) از جنس آلرت‌های واقعی (ترجیحاً) — یک قانون را با دادهٔ مصنوعی تحریک کنید؛
#    مثال ساده: فشارِ صف همگام‌سازی با توقف موقت مصرف‌کننده، یا:
docker exec -it <نام کانتینر آلرت‌منیجر> sh
amtool alert add payesh-e2e-test severity=critical \
  --annotation=summary="تست انتها-به-انتها" --expires=10m

# ب) مسیر وب‌هوک: در alertmanager.yml مقدار __WEBHOOK_URL__ را با آدرس واقعی
#    (مثلاً کانال حوادث) جایگزین کنید، سپس با --web.enable-lifecycle پرومتهوس
#    یا بازآغاز آلرت‌منیجر اعمال شود؛ تحویل اعلان را در مقصد تأیید کنید.
```

معیار پذیرش: آلرت تستی در گرافانا/مقصد وب‌هوک دیده شود و پس از `--expires` خودبه‌خود
بسته شود. نتیجهٔ دریل را در جدول دریل `docs/DR_RUNBOOK.md` §۶ ثبت کنید.

---

## ۶) خواباندن استک (Teardown)

```bash
# نگه‌داشتن داده‌ها (پرومتهوس/گرافانا) برای ادامهٔ بعدی:
docker compose -f infra/observability/docker-compose.observability.yml down

# حذف کامل همراه داده‌های مانده (دریل «کوری مانیتورینگ» یا محیط تست):
docker compose -f infra/observability/docker-compose.observability.yml down -v
```

نکتهٔ بازیابی: استک رصد در مسیر دادهٔ برنامه نیست (ترسینگ شکست‌باز؛ متریک‌ها فقط
زمان اسکرپ) — خواباندن آن هیچ اثری روی سرویس ندارد؛ ولی «کوری مانیتورینگ» حادثهٔ
جدی است و فقط در دریل برنامه‌ریزی‌شده مجاز است (`docs/RELIABILITY_DR_PLAN.md` §۳).

---

## ۷) عیب‌یابی

| علامت | ریشهٔ محتمل | اقدام |
|---|---|---|
| `port is already allocated` | پورت ۹۰۹۰/۹۰۹۳/۳۰۰۱ اشغال است | `ss -ltnp | grep -E '9090|9093|3001'`؛ سرویس متعارض را جابه‌جا یا پورت میزبان را در کامپوز عوض کنید |
| گرافانا بالا نمی‌آید | `GRAFANA_PASSWORD` خالی | کامپوز عمداً با خطای `?` شکست می‌دهد؛ فایل محیط را پر کنید |
| تارگت `payesh-api` پایین | برنامه اجرا نیست یا `host.docker.internal` حل نمی‌شود | `curl -s 127.0.0.1:3000/api/health` را چک کنید؛ `extra_hosts: host-gateway` در کامپوز هست — روی میزبان‌های غیرلینوکسی معادلش را بگذارید |
| تارگت بالا ولی سری صفر | `METRICS_TOKEN` بین برنامه و پرومتهوس یکی نیست | توکن را در هر دو سمت هم‌کلید کنید یا هر دو را بردارید |
| تریس در جیگر نیست | `TRACING_ENABLED` خاموش یا پورت ۴۳۱۸ کلکتور پایین | `curl -s 127.0.0.1:4318/` باید پاسخ کلکتور بدهد؛ لاگ برنامه خطای صادرات را چاپ می‌کند (شکست‌باز — سرویس نمی‌افتد) |
| لوکی لاگ ندارد | `PAYESH_LOG_DIR` خالی یا غلط | مسیر را به دایرکتوری واقعی لاگ ممیزی تنظیم و پروم‌تیل را بازآغاز کنید |
| کرش مکرر یک کانتینر | کمبود دیسک/حافظه یا کانفیگ مانت‌شدهٔ خراب | `docker logs <نام>`؛ کانفیگ‌ها با `tests/observability-config.js` (۵۵/۵۵) پیش‌تست شده‌اند — اول آن را اجرا کنید |

---

## ۸) تفاوت با سی‌آی (چه چیزی کجا اجرا می‌شود)

| لایه | سی‌آی (هر مرج) | میزبان واقعی (این سند) |
|---|---|---|
| پیکربندی استک | `tests/observability-config.js` ۵۵/۵۵ + `tests/observability-config-mutations.js` ۶/۶ — صحت کانفیگ/قوانین/پورت‌ها بدون داکر | اجرای واقعی کامپوز و اسکرپ زنده |
| داشبوردها | `tests/observability-dashboards.js` ۳۰/۳۰ — پروویژنینگ و جی‌سان پنل‌ها | رندر واقعی در گرافانا |
| متریک‌ها/تریس | دود ۵۴۷ بدون استک (رفتار برنامه تغییر نمی‌کند) | اسکرپ ۱۵ ثانیه‌ای + او‌تی‌ال‌پی |
| دی‌ای‌اس‌تی | `tools/dast-live.sh` فقط خشک/آفلاین در سی‌آی | اجرای زنده با `--live` (پ0-۴؛ استیجینگ) |
| آستانه‌های اس‌ال‌او | `tests/performance/config/thresholds.json` روی کی‌شش (هرگز در سی‌آی اجرا نشده — کی‌شش نصب نیست) | بنچمارک موج ۱۸ روی استیجینگ |

اصل: سی‌آی هیچ‌وقت داکر یا شبکهٔ بیرونی نمی‌خواهد؛ هرچه زنده است فقط روی میزبان
واقعی اجرا می‌شود تا مرج‌های موازی چند چت سریع و قطعی بمانند.
