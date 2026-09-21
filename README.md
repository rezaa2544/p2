# پایش (Payesh)

سامانه مدیریت مدرسه با رابط فارسی/RTL، تقویم جلالی، نقش‌ها و مجوزهای تفکیک‌شده، قابلیت‌های آموزشی و مدیریتی، و معماری دوگانه برای توزیع وب آفلاین و پلتفرم سروری یکپارچه.

> شروع سریع: ابتدا این README، سپس [مستندات پروژه](docs/README.md) و [نقشه مخزن](docs/REPOSITORY_MAP.md) را بخوانید. وضعیت جاری فقط از Current HEAD و Ground Truth تعیین می‌شود.

## پروژه چیست؟

- مدیریت مدارس، کاربران، نقش‌ها و مجوزها
- دانش‌آموزان، کلاس‌ها، دروس، حضور و غیاب و نمرات
- برنامه هفتگی و تقویم جلالی
- اطلاعیه‌ها، زنگ و گزارش‌های عمومی
- احراز هویت، نشست و حذف حساب
- همگام‌سازی و حل تعارض
- API، health/readiness، metrics و tracing
- PostgreSQL برای persistence و Redis برای cache/coordination
- worker/outbox، backup/restore و مسیرهای DR
- امنیت، audit و کنترل دامنه داده
- قابلیت‌های اشتراک/Paywall و مدیریتی

این فهرست نقشه سطح‌بالاست؛ وضعیت واقعی هر قابلیت را با کد و roadmap جاری و evidence تطبیق دهید.

## معماری

```text
PAYESH
├── Web / Offline: src + templates + public -> build.js -> index.html
└── Server Platform: server + routes -> PostgreSQL / Redis / workers / observability / DR
```

Client منبعش در `src/` و build آن در `build.js` است؛ `index.html` artifact توزیعی است و ترتیب ماژول‌ها در `src/js/_order.json` قرار دارد.

Server در `server/` است؛ routeها در `server/routes/`، migrationها در `migrations/` و authorization در `authz/` قرار دارند.

> توجه: توصیف قدیمی پروژه که کل مخزن را «بدون backend» معرفی می‌کرد با وضعیت فعلی مخزن همخوان نیست؛ معماری فعلی در بالا تفکیک شده است.

## ساختار مهم

```text
.
├── src/                 # source client
├── server/              # backend + API + workers
├── migrations/          # database migrations
├── authz/               # authorization contracts
├── tests/               # tests and verification
├── tools/               # validation/audit tools
├── scripts/             # development scripts
├── infra/               # infrastructure
├── monitoring/          # observability
├── nginx/               # edge configuration
├── ops/                 # operational assets
├── android/             # Android path
├── docs/                # canonical docs + evidence
├── .github/             # GitHub automation
├── .agent/              # agent integration
├── .claude/             # Claude integration
├── build.js             # client build
├── index.html           # distribution artifact
└── package.json         # project manifest
```

برای اینکه بدانید هر تغییر را کجا انجام دهید: [REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md).

## توسعه

پیش‌نیاز: Node.js `>=22`.

```bash
npm ci
npm test
npm run build
npm run build:check
npm start
```

جزئیات: [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md).

## مستندات اصلی

| نیاز | سند |
|---|---|
| شروع و شناخت | [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) |
| نقشه فایل‌ها | [REPOSITORY_MAP](docs/REPOSITORY_MAP.md) |
| معماری | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| توسعه | [DEVELOPMENT_GUIDE](docs/DEVELOPMENT_GUIDE.md) |
| سبک کدنویسی | [CODE_STYLE](docs/CODE_STYLE.md) |
| تست | [TESTING_GUIDE](docs/TESTING_GUIDE.md) |
| API | [API_REFERENCE](docs/API_REFERENCE.md) + [OpenAPI](docs/openapi.yaml) |
| قوانین | [Engineering Policy](docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md) |
| نقشه راه | [ROADMAP](docs/ROADMAP.md) |
| برنامه اجرایی | [Master Schedule](docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md) |
| حقیقت جاری | [Current Ground Truth](docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md) |
| حاکمیت مستندات | [DOCUMENTATION_GOVERNANCE](docs/DOCUMENTATION_GOVERNANCE.md) |

## کیفیت

Rule 15 برای هر task معنادار پنج Pass مستقل می‌خواهد: Functional، Boundary، Negative/Failure Injection، Concurrency/Replay/Resilience و Independent Regression/Environment Re-run. پنج تکرار یک command، پنج Pass نیست.

هیچ گزارش تاریخی جای Current HEAD را نمی‌گیرد. گزارش ناقص/blocked/not-verified باید با Roadmap و Ground Truth reconcile شود.

## مشارکت

قبل از تغییر [CONTRIBUTING.md](CONTRIBUTING.md) و [AGENTS.md](AGENTS.md) را بخوانید.

گزارش‌های تاریخی و audit evidence باید از راهنمای canonical جدا بمانند؛ قرارداد آن در [DOCUMENTATION_GOVERNANCE.md](docs/DOCUMENTATION_GOVERNANCE.md) است.