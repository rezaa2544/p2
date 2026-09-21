# نقشهٔ مخزن

این سند پاسخ سریع به سؤال «برای این تغییر کجا بروم؟» است.

| مسیر | مسئولیت | چه زمانی وارد شوید |
|---|---|---|
| `src/` | منبع client و ماژول‌های UI | تغییر رفتار/رابط وب |
| `public/` | دارایی‌های عمومی | assetهای قابل سرو وب |
| `templates/` | templateهای خروجی/وب | تغییر template |
| `index.html` | artifact توزیعی build شده | معمولاً مستقیماً ویرایش نشود |
| `build.js` | pipeline ساخت client | تغییر build یا integrity |
| `server/` | backend، API، domain services، workers | تغییر منطق سرور |
| `server/routes/` | routeهای API | افزودن/تغییر endpoint |
| `server/schema.sql` | snapshot/تعریف schema سرور | بررسی ساختار داده |
| `migrations/` | تکامل schema | هر تغییر persistent schema |
| `authz/` | مدل و قرارداد authorization | نقش، scope و permission |
| `tests/` | تست‌های runtime و regression | هر تغییر رفتاری |
| `tools/` | ابزارهای build/validation/audit | عملیات توسعه و verification |
| `scripts/` | اسکریپت‌های توسعه/اجرایی | workflowهای محلی |
| `infra/` | زیرساخت و topology | deployment/infrastructure |
| `monitoring/` | metrics/alerting/observability config | عملیات و SLO |
| `nginx/` | edge/reverse proxy | routing/TLS/HTTP edge |
| `ops/` | عملیات و runbookهای اجرایی | deploy/recovery/maintenance |
| `android/` | مسیر build/بسته‌بندی Android | Android |
| `data/` | داده‌های توسعه/نمونه | داده، fixture و seed |
| `store/` | storage artifacts/runtime storage support | persistence محلی/عملیاتی |
| `skills/` | مهارت‌های verification پروژه | اجرای مأموریت‌های مهندسی |
| `.agent/`, `.claude/` | integration/skill configuration برای agentها | فقط هنگام تغییر integration همان ابزار |
| `.github/` | GitHub workflows/templates/config | CI و collaboration |
| `docs/` | مستندات canonical و historical evidence | قبل/بعد از هر تغییر مهم |

## 1. مسیر تغییر بر اساس موضوع

### UI / client
`src/js` → `src/styles` → `build.js` → `index.html` → تست‌های build/runtime.

### API
`server/routes` → domain/service مورد استفاده → `docs/openapi.yaml` → API docs → tests → drift check.

### Database
`migrations/` → server query/service → migration ledger/tests → backup/rollback evidence.

### Authorization
`authz/` + server authorization boundary → client visibility فقط به‌عنوان UX → negative/security tests.

### Worker / Outbox / Sync
`server/worker*.js`, `server/outbox.js`, `server/sync*.js` → concurrency/replay/failure tests → observability.

### Production / DR
`infra/`, `monitoring/`, `ops/`, server DR modules → E4 evidence؛ E3 را با E4 اشتباه نگیرید.

## 2. فایل‌های root

Root باید محل entrypointها، تنظیمات اصلی و اسناد کوتاه و discoverable باشد. گزارش‌های تاریخی حجیم باید در `docs/audit/` یا دستهٔ تاریخی مناسب نگهداری شوند؛ در حال حاضر بخشی از گزارش‌های قدیمی هنوز در root وجود دارند و به‌عنوان **technical debt سازمان‌دهی** ثبت شده‌اند. جابه‌جایی آن‌ها باید با بررسی referenceها و یک migration مستقل انجام شود تا لینک‌های تاریخی نشکنند.

## 3. قانون artifact

فایل generated یا distribution artifact را با source code قاطی نکنید. source را تغییر دهید، build را اجرا کنید و سپس artifact را با verification لازم به‌روزرسانی کنید.
