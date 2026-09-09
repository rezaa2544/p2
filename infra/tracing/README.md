# زیرساختِ ردیابی

| فایل | کاربرد |
|---|---|
| `jaeger-dev.compose.yaml` + `jaeger-dev.yaml` | توسعه: all-in-one با حافظه |
| `jaeger-prod.compose.yaml` + `jaeger-prod.yaml` | پروداکشن: Jaeger ‎2.20.0 + Elasticsearch ‎8.19.21 |
| `otelcol-tail.yaml` | کالکتورِ contrib با tail sampling (خطاها همیشه، کندها، ۱۰٪ بقیه) |

## اجرا

```sh
docker compose -f infra/tracing/jaeger-dev.compose.yaml up -d
ELASTIC_PASSWORD='...' docker compose -f infra/tracing/jaeger-prod.compose.yaml up -d
```

اپ با پیش‌فرض‌ها (`http://localhost:4318`) به هر دو وصل می‌شود؛
در پروداکشن صادرکننده را به کالکتور بدهید و `TRACING_SAMPLE_ALL=1` بگذارید
(راهنمای کامل: `docs/TRACING_SETUP.md`).

## نکته‌های پروداکشن

- `ELASTIC_PASSWORD` اجباری است (fail-closed)؛ آن را در secret manager نگه دارید، نه در فایل.
- ایندکس‌ها روزانه rollover می‌شوند (`payesh-prod-*`)؛ retention را با ILM بچینید.
- تک‌گره با `replicas: 0` است؛ برای چندگره shards/replicas را زیاد کنید.
- به‌جای ES می‌توان OpenSearch گذاشت (بک‌اندِ `opensearch`، نسخهٔ آزموده‌شده `2.14.0`).
- UI را پشتِ احراز/شبکهٔ داخلی نگه دارید.
