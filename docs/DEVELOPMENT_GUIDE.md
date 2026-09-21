# راهنمای توسعه

## قبل از هر تغییر

1. Current HEAD را ثبت کنید.
2. [ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md](ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md) را بخوانید.
3. [ROADMAP.md](ROADMAP.md) و Master Schedule را بررسی کنید.
4. architecture، dependency و owner تغییر را مشخص کنید.
5. برای task، Objective / Scope / Out of Scope / Acceptance Criteria / Evidence / Verification Plan تعیین کنید.
6. نقطهٔ rollback را برای تغییرات حساس مشخص کنید.

## نصب و اجرا

پیش‌نیاز اصلی Node.js نسخهٔ 22 یا بالاتر است.

```bash
npm ci
npm test
npm run build
npm run build:check
```

برای backend:

```npm
npm start
```

تنظیمات محیطی را از `.env.example` بررسی کنید و secret واقعی را commit نکنید.

## چرخهٔ تغییر

```
Understand → Plan → Change → Test → Adversarial Verify → Regression → Document → Reconcile → Commit/Push → Re-verify
```

### تغییر client

منبع `src/` است. خروجی `index.html` artifact است. ترتیب ماژول‌های JS در `src/js/_order.json` بخشی از قرارداد build است.

### تغییر server

از entrypointها و routeها شروع کنید، dependencyهای PG/Redis/external را بررسی کنید، سپس behavior را در runtime اثبات کنید.

### تغییر API

کد route + `docs/openapi.yaml` + API reference + drift tests باید هم‌زمان بررسی شوند.

### تغییر schema

migration جدید، مسیر rollback، اثر روی queryها و evidence runtime لازم است. تغییر مستقیم schema تولید بدون migration و rollback contract پذیرفته نیست.

## خروجی هر مأموریت

گزارش باید حداقل شامل این موارد باشد:

- Current HEAD و SHA نهایی
- تغییرات دقیق فایل‌ها
- تست‌ها و commandهای دقیق
- Functional / Boundary / Negative / Concurrency-or-Resilience / Independent Regression evidence
- یافته‌های جدید و وضعیت آن‌ها
- blocker و owner
- roadmap reconciliation
- commit/push verification

## چیزی که نباید انجام شود

- ادعای VERIFIED بر اساس گزارش قدیمی
- skip یا fake-green برای عبور CI
- تغییر معماری بدون نیاز و دلیل
- refactor نامرتبط در کنار bugfix
- مخلوط کردن historical evidence با current truth
- معرفی E3 به‌عنوان E4
