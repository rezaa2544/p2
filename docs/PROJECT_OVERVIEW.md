# نمای کلی پروژه پایش

## 1. پایش چیست؟

پایش یک سامانه مدیریت مدرسه با رابط فارسی/RTL، تقویم جلالی، نقش‌های چندگانه، مدیریت مدرسه و داده‌های آموزشی است. پروژه دو سطح اجرایی دارد:

- **Client / Offline distribution:** رابط وب ماژولار که با build به یک فایل مستقل `index.html` تبدیل می‌شود و برای سناریوی آفلاین طراحی شده است.
- **Server / Integrated platform:** سرویس Node.js برای API، احراز هویت، همگام‌سازی، دادهٔ PostgreSQL، cache/coordination با Redis، observability و عملیات پشتیبان‌گیری/بازیابی.

این تفکیک مهم است: «خروجی وب تک‌فایلی و آفلاین» به معنی «کل مخزن بدون backend» نیست.

## 2. حوزه‌های اصلی خدمت

- مدیریت چند مدرسه و کاربران
- نقش‌ها و مجوزهای تفکیک‌شده
- دانش‌آموز، کلاس و درس
- حضور و غیاب و نمرات
- برنامه هفتگی و تقویم جلالی
- اطلاعیه، زنگ و گزارش عمومی
- همگام‌سازی و حل تعارض
- احراز هویت و مدیریت نشست
- گزارش‌ها و قابلیت‌های مدیریتی
- اشتراک/Paywall برای برخی قابلیت‌ها
- API، سلامت، metrics و tracing
- backup/restore و مسیرهای DR
- قابلیت‌های امنیتی، audit و کنترل دامنهٔ داده

فهرست دقیق قابلیت‌ها را باید با کد، API reference و roadmap جاری تطبیق داد؛ این صفحه نقشهٔ مفهومی است نه ادعای کامل بودن.

## 3. معماری در یک نگاه

```
src/ + public/templates
        │
        ├── build.js ──> index.html  (offline distribution)
        │
        └── browser runtime

server/
  ├── HTTP/API + auth + routes
  ├── domain/data services
  ├── PostgreSQL (authoritative persistence)
  ├── Redis (cache/ephemeral/coordination)
  ├── workers/outbox/sync
  └── observability + DR

migrations/ ──> PostgreSQL schema evolution
authz/       ──> authorization model/contracts
tests/       ──> runtime/unit/integration verification
tools/       ──> build, validation, audit and operational tooling
docs/        ──> architecture, governance, roadmap and evidence
```

برای جزئیات، [ARCHITECTURE.md](ARCHITECTURE.md) و [REPOSITORY_MAP.md](REPOSITORY_MAP.md) مرجع بعدی هستند.

## 4. منابع حقیقت

ترتیب اعتماد برای کار فنی:

1. Current HEAD
2. Runtime behavior + current tests/CI
3. Configuration and machine-readable contracts
4. Current roadmap/ground-truth
5. Human documentation
6. Historical reports

هیچ گزارش تاریخی یا سندی به‌تنهایی وضعیت جاری را تعیین نمی‌کند.
