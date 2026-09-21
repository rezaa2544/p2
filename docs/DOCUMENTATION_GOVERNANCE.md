# حاکمیت مستندات مخزن

## هدف

هر فرد یا Agent باید بتواند بدون پرس‌وجوی قبلی بفهمد:

- پروژه چیست؟
- چه خدماتی دارد؟
- معماری چیست؟
- کد اصلی کجاست؟
- برای تغییر هر موضوع کجا باید برود؟
- چه چیزهایی هنوز اثبات نشده‌اند؟
- قوانین کار و Verification چیست؟
- وضعیت جاری و next action چیست؟

## hierarchy

### Level 0 — ورود

Root `README.md`، `CONTRIBUTING.md`، `AGENTS.md` و `CLAUDE.md`.

### Level 1 — Orientation

`docs/README.md`، `PROJECT_OVERVIEW.md`، `REPOSITORY_MAP.md`.

### Level 2 — Engineering

`ARCHITECTURE.md`، `DEVELOPMENT_GUIDE.md`، `CODE_STYLE.md`، `TESTING_GUIDE.md`، API/OpenAPI.

### Level 3 — Governance

Engineering Policy، Security، Capacity/SLO، Roadmap و Ground Truth.

### Level 4 — Evidence

`docs/audit/` و گزارش‌های تاریخی.

## قواعد نگهداری

1. Current truth در یک سند وضعیت جاری متمرکز بماند.
2. Historical report فقط evidence تاریخی است.
3. هر تغییر مهم architecture/API/schema باید docs مربوط را reconcile کند.
4. سند طولانی نباید جای index/navigation را بگیرد.
5. generated artifacts و source files از هم جدا باشند.
6. نام فایل باید purpose را توضیح دهد.
7. لینک داخلی ترجیحاً relative باشد.
8. duplicate canonical guides ایجاد نشود؛ اگر سند قدیمی است، آن را به canonical source ارجاع دهید.

## Technical debt فعلی

Root repository تعداد زیادی گزارش تاریخی با نام‌های Chat/Round/Phase دارد. آن‌ها باید پس از inventory و reference audit به `docs/audit/history/` منتقل شوند. این کار عمداً در این مرحله بدون بررسی referenceها انجام نشده تا لینک‌ها و provenance شکسته نشوند.
