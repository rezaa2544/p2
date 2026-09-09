# راه‌اندازیِ ردیابیِ توزیع‌شده (Jaeger + OpenTelemetry)

**وضعیت:** پیاده‌سازی‌شده و تست‌شده (شاخهٔ `feat/tracing-chat3`)
**نسخه‌ها:** Jaeger ‎`v2.20.0`، SDK ردیابی ‎`2.11.0`، صادرکنندهٔ OTLP/HTTP ‏`0.222.0`

---

## ۱. این چیست

ردیابیِ Tier-1 برای سرورِ پایش: هر درخواستِ HTTP (به‌جز سلامت) یک اسپنِ
سرور می‌گیرد، شناسهٔ رد (`trace_id`) در سرآیندِ پاسخ، لاگِ ممیزی و `req.context`
منتشر می‌شود و اسپن‌ها با OTLP/HTTP به Jaeger می‌روند.

| قطعه | فایل | نقش |
|---|---|---|
| پیکربندی/نمونه‌بردار/پاک‌سازی | `server/tracing.js` | init، sampler، redact، `withSpan` |
| سیم‌کشیِ درخواست | `server/index.js` | init اولِ بوت + سرآیندِ `X-Trace-Id` |
| همبستگیِ ممیزی | `server/audit.js` | افزودنِ `trace_id` به خطِ JSON |
| زیرساخت | `infra/tracing/` | compose توسعه/پروداکشن + کالکتور |

## ۲. متغیرهای محیطی

| متغیر | پیش‌فرض | اثر |
|---|---|---|
| `TRACING_ENABLED` | `true` | `‎false/0` یعنی صفر اثر (بدون سرآیند، بدون اسپن) |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | — | نشانیِ کامل (اولویت اول) |
| `TRACING_OTLP_ENDPOINT` | — | نشانیِ کامل (اولویت دوم) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | نشانیِ پایه؛ `‎/v1/traces` خودکار می‌چسبد |
| `OTEL_SERVICE_NAME` / `TRACING_SERVICE_NAME` | `payesh-api` | نامِ سرویس در Jaeger |
| `OTEL_TRACES_SAMPLER` / `…_ARG` | توسعه: `always_on`؛ پروداکشن: `parentbased_traceidratio/0.1` | [نام‌های استاندارد OTEL](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#general-sdk-configuration) |
| `TRACING_SAMPLE_ALL` | — | `1` یعنی همیشه‌روشن (وقتی کالکتور tail sampling می‌کند) |
| `OTEL_RESOURCE_ATTRIBUTES` | — | `k=v,k2=v2` برای منبع |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS` | — | سرآیندِ احرازِ صادرکننده (`Authorization=Bearer …`) |

نکته: در پروداکشن (`NODE_ENV=production`) نمونه‌برداریِ پیش‌فرض ۱۰٪ والد-محور
است؛ با tail sampling در کالکتور (`infra/tracing/otelcol-tail.yaml`) همهٔ
اسپن‌ها صادر و خطاها/کندها نگه داشته می‌شوند (`TRACING_SAMPLE_ALL=1`).

## ۳. انتشارِ `trace_id`

1. **ورودی W3C:** سرآیندِ `traceparent` پذیرفته و ادامه داده می‌شود.
2. **خروجی:** هر پاسخِ ردیابی‌شده سرآیندِ `X-Trace-Id` (هگزِ ۳۲رقمی) دارد.
3. **کانتکست:** `req.context.trace_id` برای کدِ برنامه.
4. **ممیزی:** خطِ JSON ممیزی فیلدِ `trace_id` دارد (همان شناسهٔ سرآیند).
5. **نادیده‌گرفته‌شده:** `GET/HEAD /api/health` اسپن و سرآیند ندارد.

## ۴. قراردادِ بدونِ PII

- کلیدهای حساسِ کوئری (`password، token، secret، otp، phone، national_id` و…)
  در `url.query` و `http.target` و `url.full` به `[REDACTED]` می‌روند.
- الگوی تلفن/کدملی در **مقادیر** هم ماسک می‌شود (`0912***4567`).
- سرآیندها (`authorization` و…) هرگز به اسپن نمی‌روند.
- بدنهٔ درخواست هرگز به اسپن یا ممیزی نمی‌رود (خطای `body_too_large` فقط مسیر را ثبت می‌کند).
- اثباتِ زنده: تستِ `B3` با Jaeger واقعی.

## ۵. شروعِ سریع (توسعه)

```sh
# ۱) Jaeger all-in-one با حافظه
docker compose -f infra/tracing/jaeger-dev.compose.yaml up -d
# ۲) سرور (پیش‌فرض‌ها کافی‌اند)
node server/index.js
# ۳) چند درخواست بزنید و UI را ببینید
curl http://127.0.0.1:3000/api/sync/conflicts
# http://127.0.0.1:16686 — جست‌وجو با service = payesh-api
```

بدونِ داکر: تستِ یکپارچگی باینریِ `v2.20.0` را در `tests/.cache-jaeger/`
(نادیده‌گرفته‌شده در گیت) دانلود و با پیکربندیِ حداقلی اجرا می‌کند.

## ۶. پروداکشن

```sh
docker compose -f infra/tracing/jaeger-prod.compose.yaml up -d   # Jaeger + Elasticsearch
# صادرکنندهٔ اپ → کالکتورِ tail sampling:
OTEL_EXPORTER_OTLP_ENDPOINT=http://otelcol:4318 TRACING_SAMPLE_ALL=1 NODE_ENV=production node server/index.js
```

جزئیاتِ نگه‌داری/امنیتِ ES و سیاستِ tail در `infra/tracing/README.md`.

## ۷. تست‌ها (۴ فایل، مستقل از `npm test`)

```sh
node tests/tracing-sampling.js      # ۳۱ تست: پیکربندی/سمپلر/پاک‌سازی (سریع)
node tests/tracing-performance.js   # ۷ تست: سربارِ اسپن و مسیرها
node tests/tracing-integration.js   # ۱۴ تست: A همیشه + B با Jaeger واقعی یا پرشِ بلند
node tests/tracing-mutations.js     # ۵ جهش (M1–M5)؛ هر ۵ باید کشته شوند
TRACING_MUTS=1 node tests/tracing-integration.js  # فقط بخشِ A (بدونِ Jaeger)
```

بخشِ B پورت‌های `4318/16686` را می‌خواهد؛ اگر اشغال باشند (یا دانلود ناممکن
باشد) هر ۵ تست با دلیلِ بلند **پرش** می‌خورند، نه شکست.

## ۸. سربارِ اندازه‌گیری‌شده (محلی، ۲۰۲۶-۰۹-۰۹)

| سنجه | مقدار |
|---|---|
| اسپنِ `withSpan` (میانگین، n=2000) | ‎0.047ms |
| اسپن (صدکِ ۹۹) | ‎0.260ms |
| `GET /api/health` (میانه/صدکِ ۹۹، n=30) | ‎0.9ms / ‎11.8ms |
| مسیرِ ردیابی‌شدهٔ `401` (صدکِ ۹۹، n=5) | ‎5.8ms |

آستانه‌های تست: میانگینِ اسپن < ‎1ms، صدکِ ۹۹ اسپن < ‎10ms، صدکِ ۹۹ مسیرها < ‎1000ms.

## ۹. عیب‌یابی

| علامت | علت/راه‌حل |
|---|---|
| Jaeger با خطای `bind 8888` بالا نمی‌آید | پورتِ متریکِ پیش‌فرض اشغال است؛ پیکربندیِ تست (`metrics: {level: none}`) یا compose را ببینید |
| `total: 0` ولی `data` پر است | رفتارِ API نسخهٔ ۲ است؛ به `data[]` اعتماد کنید، نه `total` |
| ردی خالی از سرویسِ دیگری می‌بینید | `service.name` را با `OTEL_SERVICE_NAME` یکتا کنید |
| اسپنی صادر نمی‌شود | `TRACING_ENABLED`، نمونه‌بردار (`always_off`؟) و نشانیِ OTLP را بررسی کنید؛ خطای exporter فقط warn می‌دهد (fail-open) |
| تستِ B پرش می‌خورد | دلیل چاپ می‌شود (پورت/دانلود)؛ بخشِ A پوششِ اصلی است |

## ۱۰. یادداشتِ امنیتی

- توکنِ OTLP (در صورت نیاز) فقط از `OTEL_EXPORTER_OTLP_TRACES_HEADERS`؛ هرگز در فایل/کامیت.
- UI پروداکشن را پشتِ احراز بگذارید (compose پیش‌فرض احراز ندارد).
- ممیزی (`server/data/audit.log`) سطحِ دسترسیِ `0600` دارد؛ `trace_id` شناسهٔ فنی است، نه PII.
