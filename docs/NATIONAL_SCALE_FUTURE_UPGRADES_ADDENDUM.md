# الحاقات نقشه راه ملی پایش — پیشنهادهای ارزشمند تحقیق معماری

**منبع:** تحلیل معماری مقیاس ملی (۱۰ میلیون کاربر) — بررسی به عنوان ورودی تحقیقاتی، نه گزارش وضعیت کد.

**هدف:** تبدیل پیشنهادهای دارای ارزش مهندسی به آیتم‌های آینده نقشه راه، بدون فرض اینکه زیرساخت عملیاتی آن‌ها هم‌اکنون وجود دارد.

---

## موارد پذیرفته‌شده برای نقشه راه آینده

### Phase 8.6 — National Scale Edge & Resilience Hardening

**اولویت: P1**

کارهای آینده:

- استقرار لایه Edge شامل CDN/WAF/DDoS protection.
- سیاست‌های سخت‌گیرانه‌تر برای OTP:
  - rate limit چندلایه
  - تشخیص رفتار غیرعادی
  - محدودسازی هزینه پیامک
  - پشتیبانی چند ارائه‌دهنده پیامک.
- تکمیل هدرهای امنیتی Production:
  - CSP سخت‌گیرانه
  - HSTS
  - Cookie policy

Evidence مورد نیاز:

- تست نفوذ لایه Edge
- گزارش rate-limit
- مانیتور هزینه و abuse

---

### Phase 8.7 — CQRS و تفکیک OLTP/Analytics

**اولویت: P1**

هدف:

جلوگیری از فشار گزارش‌های سنگین روی PostgreSQL تراکنشی.

کارهای آینده:

- تعریف مسیر Read Replica برای گزارش‌ها.
- بررسی جداسازی workload تحلیلی.
- بررسی Event pipeline برای انتقال داده به موتورهای تحلیلی (مانند ClickHouse در صورت نیاز واقعی).

اصل معماری:

PostgreSQL همچنان Source of Truth باقی می‌ماند.

---

### Phase 8.8 — Event Driven Processing

**اولویت: P1**

کارهای آینده:

- توسعه Transactional Outbox به پردازش گسترده‌تر.
- صف مستقل برای:
  - SMS
  - Notification
  - Report generation
  - Analytics jobs
- Workerهای مستقل از API.

Acceptance:

هیچ عملیات سنگین پس‌زمینه‌ای نباید request اصلی کاربر را block کند.

---

### Phase 9 — National Deployment Architecture

**اولویت: P2**

تحقیقات و طراحی:

- Stateless API deployment.
- Container orchestration.
- Horizontal scaling.
- Multi-zone deployment.
- Disaster Recovery drills.

توجه:

Sharding استانی PostgreSQL به عنوان گزینه آینده بررسی شود و قبل از اجرا نیازمند benchmark واقعی workload است.

---

### Phase 9.2 — National Load & Soak Validation

**اولویت: P1 قبل از ادعای مقیاس ملی**

کارها:

- تست k6 با داده مصنوعی بزرگ.
- سناریوهای:
  - Load
  - Stress
  - Spike
  - Soak
- اندازه‌گیری:
  - RPS
  - DB TPS
  - latency p95/p99
  - queue growth
  - memory leak

---

## مواردی که فعلاً وارد اجرای مستقیم نشدند

- Microservice rewrite کامل: فعلاً ارزش ریسک مهاجرت ندارد.
- Sharding فوری: فقط پس از اثبات گلوگاه واقعی.
- جایگزینی PostgreSQL به عنوان SoT: رد شد؛ با اصول فعلی ناسازگار است.

---

## نتیجه

این سند به عنوان ورودی رسمی Phase 8/9 نقشه راه ثبت شد. موارد فوق قابلیت‌های آینده هستند و وضعیت فعلی Production را تغییر نمی‌دهند.
