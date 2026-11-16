# کارت ران‌بورد — راه‌اندازیِ staging (E4) و چرخشِ credentialها (SI-013)

| | |
|---|---|
| شناسه | RC-027-E4 |
| ردیف‌های صف | ۱ (E4) · ۲ (SI-013) |
| بودجهٔ زمانی | ≤۱۲۰ دقیقه پس از فراهم‌شدنِ سرورها |
| مرجع | [PG-HA](../../infra/postgres/docker-compose.ha.yml) · [Redis Sentinel](../../infra/redis/docker-compose.sentinel.yml) · [Observability](../observability/README.md) · [Multi-instance](../MULTI_INSTANCE_ARCHITECTURE.md) · [برگهٔ معماری](../M15_ARCHITECTURE_SIGNOFF.md) |

**Trigger (محرک):** تصمیمِ مالک به شروعِ فازِ M15 عملیاتی — تأمینِ ۳ نود (VM/کلاود) انجام شده باشد (اقدامِ انحصاریِ مالک: خرید/ساختِ سرور و شبکه).
**Impact (تأثیر):** باز شدنِ همهٔ گیت‌هایِ مالکیِ M15 (25/26/27/22 و در ادامهٔ زنجیرهٔ گواهینامه).

## پیش‌نیازها (مالک — قبل از شروع)

1. سه نود با دسترسیِ SSH، پورت‌هایِ داخلی باز (5432 فقط داخلی، 6379 فقط داخلی، 3000/9090 برای اپراتور)، Docker ≥ 24.
2. داشتنِ دسترسیِ کنسولِ Redis/RabbitMQ-managed/DB در صورتِ استفاده از سرویسِ managed (برایِ چرخش).
3. **هیچ secretای در چت یا issue نوشته نمی‌شود** — همه از طریقِ فایلِ `.env` روی سرور با `0600` (الگویِ `infra/postgres/env.ha.example`).

## Steps (گام‌ها)

1. **PG-HA را بالا بیاورید (نودهایِ ۱ و ۲):** `infra/postgres/docker-compose.ha.yml` با `.env.ha` (کپی از `env.ha.example` — رمزِ تازه، نه مثال).
   **تأیید:** `./post-checks.sh` سبز؛ `psql` با رمزِ جدید از هر دو نود وصل می‌شود.
2. **Redis Sentinel را بالا بیاورید (نود ۳):** `infra/redis/docker-compose.sentinel.yml` با `.env.sentinel` — **`REDIS_TLS=1`** و در صورتِ گواهیِ self-signed، `REDIS_TLS_CA` (سیم‌کشیِ M15-07 — SHA d00326a2).
   **تأیید:** `redis-checks.sh` سبز؛ `redis-cli --tls -a <pass> ping` = PONG؛ اتصالِ **بدونِ** TLS رد می‌شود.
3. **چرخشِ credentialها (SI-013):** رمزِ تازه برای Redis (requirepass + sentinel) و PG (نقشِ اپ) و هر سرویسِ managed؛ مقادیرِ قدیمی باطل شوند.
   **تأیید:** اتصال با رمزِ قدیمی = رد؛ با رمزِ جدید = موفق — از دو نودِ متفاوت.
4. **API را با ستونِ جدید بالا بیاورید (حداقل ۲ instance برای اثباتِ multi-instance):** `DATABASE_URL`، `REDIS_URL`/`REDIS_SENTINELS`، `REDIS_PASSWORD`، `JWT_SECRET`، `PAYESH_FIELD_ENC_KEYS` (تولیدِ کلیدِ تازه ۳۲بایتی base64) و `PAYESH_FIELD_ENC_KID` — فقط از env.
   **تأیید:** `GET /api/readiness` روی هر دو instance = 200؛ `GET /api/health` pidهایِ متفاوت؛ لاگ بدونِ FATAL.
5. **مهاجرت‌ها و آینهٔ WORM audit:** migrationها تا 027 اجرا شوند؛ سپس `node tools/audit-worm-import.js` و `node tools/audit-worm-import.js --verify` (خروجی: `broken=0`).
   **تأیید:** تلاشِ `UPDATE audit_events_worm SET actor='x' WHERE id=1` = خطایِ `AUDIT_WORM_IMMUTABLE`.
6. **استکِ Observability:** `infra/observability/docker-compose.observability.yml` + provisioningِ Grafana؛ bearerِ `/metrics` تنظیم شود (fail-closed تولید).
   **تأیید:** Prometheus targets سبز؛ داشبوردِ payesh-main داده دارد؛ یک آلارمِ تستی شلیک و در Alertmanager دیده شود.
7. **ثبتِ نتیجه در صف:** ردیفِ ۱ (E4) و ردیفِ ۲ (SI-013) → DONE با تاریخ و SHAیِ image/commit؛ ردیف‌هایِ ۲۵/۲۶/۲۷/۲۲ از «مالکی» به «قابلِ راستی‌آزمایی» می‌روند.
   **تأیید:** خروجیِ steps در همان ردیف‌های Notion ثبت شود (بدونِ هیچ secret).

## Rollback

هر استکِ compose با `docker compose down` پایین می‌آید؛ داده‌هایِ staging = قابلِ نابودی. چرخشِ credentialها در staging برگشت‌پذیر است (رمزِ قبلی را تا تأییدِ نهایی نگه دارید).

> پس از این کارت: گیتِ «صفرِ critical» (M15-12) با اولین اجرایِ واقعیِ اسکن‌ها و سپس زنجیرهٔ گواهینامه (ردیف‌های ۳۹→۴۰→۴۲ طبق `docs/M15_GOVERNANCE_ACCEPTANCE.md`).
