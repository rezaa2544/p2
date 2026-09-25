# پایش — نقشه جامع ارتقاها و قابلیت‌های آینده

وضعیت: CANONICAL / ACTIVE / FUTURE-ONLY
تاریخ ثبت: 2026-09-25
قانون: هیچ مورد این سند به‌معنای پیاده‌شده یا تأییدشده نیست.

## 1. هدف
این سند فهرست واحد قابلیت‌ها و ارتقاهای آینده است تا قابلیت‌های قبلی گم نشوند، پیشنهادهای معماری جدید کنار backlog قبلی ثبت شوند، و توسعه‌دهنده برای هر قابلیت دامنه، پیش‌نیاز، محل پیاده‌سازی و معیار پذیرش روشن داشته باشد.
مرجع زمان‌بندی اجرای فعلی همچنان docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md است. این سند مرجع فهرست و ساختار آینده است، نه مجوز شروع کار.

## 2. وضعیت جاری
پروژه در زمان ثبت این سند در HARDENING / ROOT-CAUSE REMEDIATION — NOT VERIFIED است.
- ابتدا یافته‌های Atria-1 با 37 مورد، F1..F5 و A-01..A-39 تطبیق داده می‌شوند.
- این backlog نباید باعث شروع بازنویسی معماری در میانه اصلاحات Atria شود.
- هر قابلیت آینده فقط بعد از تثبیت، تست و evidence مستقل status می‌گیرد.

## 3. قابلیت‌های قبلی ثبت‌شده در نقشه راه
| ID | قابلیت | مرجع |
|---|---|---|
| FUT-CAP-01 | نمره عملی/کارگاهی هنرستان | ROADMAP.md / E.1 |
| FUT-CAP-02 | ثبت ساعت کارآموزی هنرستان | ROADMAP.md / E.2 |
| FUT-CAP-03 | گیمیفیکیشن رفتاری دبستان | ROADMAP.md / E.3 |
| FUT-CAP-04 | مدیریت کتابخانه مدرسه | ROADMAP.md / E.4 |
| FUT-CAP-05 | مدیریت اموال/انبار مدرسه | ROADMAP.md / E.5 |
| FUT-CAP-06 | تولید خودکار برنامه هفتگی | ROADMAP.md / E.6 |
| FUT-CAP-07 | گردش کار امتحانات شهریور/تجدیدی | ROADMAP.md / E.7 |
| FUT-CAP-08 | کلاس‌های تابستانی | ROADMAP.md / E.8 |
| FUT-CAP-09 | مدیریت مراجعین | ROADMAP.md / E.9 |
| FUT-CAP-10 | شاخص سلامت مدرسه | ROADMAP.md / E.10 |
| FUT-CAP-11 | پایگاه دانش کاربر نهایی | ROADMAP.md / E.11 |
| FUT-CAP-12 | صفحه وضعیت عمومی سرویس | ROADMAP.md / E.12 |

وضعیت واقعی هر مورد باید از کد و سند وضعیت جاری خوانده شود؛ این جدول backlog را نگه می‌دارد و ادعای پیاده‌سازی نمی‌کند.

## 4. قابلیت‌های محصول آینده
### FUT-PROD-01 — سازمان/مالک مشترک چندمدرسه‌ای
اتصال چند مدرسه به یک سازمان و گزارش‌گیری مشترک. پیش‌نیاز: authorization و tenant isolation پایدار. نقطه طراحی موجود: organization_id.

### FUT-PROD-02 — پروفایل قابلیت‌های مدرسه
کلیدهایی مانند has_dorm، has_iep و has_workshop باید capability flag باقی بمانند و ماژول‌ها از قرارداد مشترک استفاده کنند، نه شرط‌های پراکنده.

### FUT-PROD-03 — گواهی رسمی قابل استعلام
صدور سمت سرور، شناسه قابل اعتبارسنجی و endpoint استعلام؛ ساختار certificates تا وقتی Architecture Review خلاف آن را ثابت نکرده حفظ شود.

### FUT-PROD-04 — اتصال سرویس‌های واقعی
اتصال درگاه واقعی پیامک و استعلام هویت/کد ملی با provider boundary، timeout، retry، idempotency و audit.

### FUT-PROD-05 — نقش پذیرش مستقل
در صورت نیاز واقعی مدارس، نقش مستقل پذیرش برای Visitor Management اضافه شود بدون شکستن مدل visitors.

### FUT-PROD-06 — گسترش گیمیفیکیشن
مدل امتیازدهی و رفتار توسعه‌پذیر باشد و source of truth دوم برای discipline ایجاد نشود.

### FUT-PROD-07 — Object Storage عملیاتی
برای فایل‌های واقعی: Object Storage، رکورد کسب‌وکاری در PostgreSQL، checksum، دسترسی موقت و audit.

## 5. ارتقای Frontend
### FUT-FE-01 — TypeScript
مهاجرت تدریجی؛ ابتدا shared types، data contracts و ماژول‌های جدید، سپس بخش‌های کم‌ریسک. بازنویسی یک‌باره در hardening ممنوع.

### FUT-FE-02 — React + Next.js
ساخت UI مدرن برای vertical sliceهای جدید یا بخش‌هایی که واقعاً به آن نیاز دارند. مسیر: coexistence محدود، vertical slice جدید، سپس مهاجرت تدریجی. قرارداد PWA/offline/sync باید حفظ شود.

### FUT-FE-03 — Design System
componentهای مشترک، RTL، typography، فرم، جدول، modal، notification و accessibility؛ جلوگیری از ساخت component مشابه در فایل‌های متعدد.

### FUT-FE-04 — Three.js فقط در صورت نیاز واقعی
Three.js فناوری پیش‌فرض نیست؛ فقط برای visualization سه‌بعدی یا تجربه آموزشی سه‌بعدی واقعی وارد شود.

## 6. ارتقای Backend
### FUT-BE-01 — Modular Monolith + Vertical Slices
مرز روشن دامنه‌ها و قابلیت‌ها با یک deployable application. مسیر مفهومی: route → application/service → policy/domain → data.

### FUT-BE-02 — Event-Driven Architecture
رویدادهای دامنه مانند AssessmentCreated، AttendanceUpdated، InterventionCreated و IntelligenceUpdated با قرارداد event و consumer مستقل.

### FUT-BE-03 — Transactional Outbox
تغییر PostgreSQL و ثبت event در یک transaction؛ سپس worker برای publish/retry.

### FUT-BE-04 — OpenTelemetry / End-to-End Tracing
ردگیری API → Auth → Policy → PostgreSQL/Redis → Queue → Worker → Intelligence.

### FUT-BE-05 — Policy-as-Code
role، tenant scope، object ownership، operation و field permission از یک قرارداد سیاستی قابل تست و audit تغذیه شوند.

### FUT-BE-06 — Go برای سرویس‌های منتخب
فقط وقتی bounded context نیاز اثبات‌شده به throughput، latency، isolation یا deployment مستقل داشته باشد. الگو: Modular Monolith → Candidate Service → Go Service، نه Node → Go rewrite.

### FUT-BE-07 — Microservices
فقط وقتی scale مستقل، failure isolation، deployment مستقل یا مرز سازمانی ارزش واقعی ایجاد کند.

## 7. Database / Data Platform
### FUT-DB-01 — PostgreSQL Source of Truth
اصل ثابت است؛ فناوری جدید نباید بی‌دلیل جایگزین آن شود.

### FUT-DB-02 — Redis
برای distributed cache، ephemeral state، rate limiting و coordination/locks در موارد لازم. Redis منبع حقیقت نیست.

### FUT-DB-03 — Elasticsearch
برای full-text search، جست‌وجوی سریع گزارش‌ها و workloadهای مناسب analytics/search؛ نه جایگزین PostgreSQL تراکنشی.

### FUT-DB-04 — Distributed Database
فقط بعد از capacity model، نیاز جغرافیایی/SLA و Architecture Review.

### FUT-DB-05 — Selective CQRS
فقط برای read workloadهای سنگین Analytics/Reporting/Intelligence که مدل read مستقل واقعاً لازم دارد.

## 8. Reliability / Scale
- FUT-SCALE-01: Horizontal API scaling و stateless deployment.
- FUT-SCALE-02: Capacity model بر پایه DAU، peak concurrent، RPS، writes/sec، DB TPS، Redis ops/sec و sync records/sec.
- FUT-SCALE-03: load، stress، spike، soak، chaos و recovery testing.
- FUT-SCALE-04: HA PostgreSQL، PITR، restore drill، failover drill و RPO/RTO واقعی.
- FUT-SCALE-05: Kubernetes فقط با نیاز عملیاتی اثبات‌شده.
- FUT-SCALE-06: Service Mesh فقط پس از topology چندسرویسی واقعی و نیاز به mTLS/traffic policy/observability.

## 9. Intelligence / Analytics
- FUT-AI-01: اتصال واقعی موتورهای آموزشی orphan به runtime.
- FUT-AI-02: semantic/certification integrity برای خروجی‌های هوشمندی.
- FUT-AI-03: read model مستقل فقط برای workloadهایی که مدل تراکنشی PostgreSQL را تحت فشار می‌گذارند.
- FUT-AI-04: هر مدل دارای provenance، version، audit، confidence/limitations و reproducibility.

## 10. کارت اجباری هر قابلیت آینده
```text
ID / TITLE / DOMAIN / USER-ROLE
BUSINESS PROBLEM / CURRENT STATE / TARGET STATE
IN-SCOPE / OUT-OF-SCOPE / DEPENDENCIES
DATA MODEL / API-CONTRACT / AUTHORIZATION
OFFLINE-SYNC / OBSERVABILITY / PERFORMANCE
MIGRATION / ROLLBACK / TESTS / ADVERSARIAL TESTS
ACCEPTANCE EVIDENCE / DOCUMENTATION / OWNER / STATUS / CURRENT HEAD
```

Statusهای مجاز: PLANNED، DESIGNING، BLOCKED، IMPLEMENTING، TESTED، RUNTIME_VERIFIED، INDEPENDENTLY_VERIFIED، CERTIFIED، DEFERRED، REJECTED.

## 11. ترتیب کلان ارتقا
```text
Atria / Root-Cause Hardening
→ Current Architecture Stabilization
→ Codebase Structure Enforcement
→ Modular Monolith + Vertical Slices
→ Event-Driven + Transactional Outbox
→ OpenTelemetry
→ Policy-as-Code
→ TypeScript + Design System
→ Selective CQRS / Search
→ Next.js/React vertical slices
→ Go candidate services
→ Selective Microservices
→ Kubernetes / Service Mesh (conditional)
```

این ترتیب وابستگی معماری است، نه برنامه زمانی قطعی؛ evidence و Architecture Review می‌توانند آن را تغییر دهند.

## 12. Architecture Gate
Problem → Evidence → Architecture Decision → Bounded Design → Implementation → Contract Tests → Regression → Adversarial Tests → Runtime Evidence → Independent Review

مدرن بودن فناوری به‌تنهایی evidence نیست.

## 13. اسناد هم‌خانواده
- docs/ROADMAP.md
- docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md
- docs/ARCHITECTURE_EVOLUTION_ROADMAP.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/CODEBASE_STRUCTURE_STANDARD.md
- docs/OPEN_WORK.md و docs/OPEN_ITEMS.md
- docs/CURRENT_WORK_EXECUTION_PLAN.md