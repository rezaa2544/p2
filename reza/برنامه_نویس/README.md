# 💻 راهنمای اختصاصی تیم فنی و برنامه‌نویسی سامانه «پایش»

## منبع حقیقت جاری
- [Current Ground Truth](../../docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md)
- [Master Execution Schedule](../../docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md)
- [Report Catalog](../../docs/REPORT_CATALOG.md)

> **وضعیت 2026-09-21:** Phase 8.2 = PARTIAL / Exit NOT VERIFIED. Phase 8.3 = PLANNED / BLOCKED BY 8.2 EXIT. گزارش‌های تاریخی فقط برای provenance هستند.

## 📑 فهرست مستندات فنی
1. **[معماری و مستندات فنی](معماری_و_مستندات_فنی.md)** — معماری کلاینت/سرور، داده، IndexedDB و Sync.
2. **[راهنمای کدنویسی و توسعه ماژول‌ها](راهنمای_کدنویسی_و_توسعه_ماژول‌ها.md)** — استاندارد توسعه و ثبت ماژول.
3. **[مستند امنیت و مجوزها](مستند_امنیت_و_مجوزها.md)** — RBAC، tenant isolation و کنترل اکشن‌ها.
4. **[راهنمای تصویری معماری](راهنمای_تصویری_معماری_سیستم.html)** — نمای تعاملی معماری.

## 🚀 اجرای پایه
```bash
node build.js
node tools/check-authz.js
node tests/run.js
npm test
```

## قاعده مستندسازی
گزارش‌ها و شواهد فنی در `docs/` منبع اصلی‌اند. از ایجاد کپی بیت‌به‌بیت در `reza/` خودداری کنید؛ در صورت نیاز به بسته مخاطب‌محور، فقط سند اختصاصی ایجاد کنید و به منبع اصلی لینک دهید.
