# نقشه راه جامع تکمیل فاز ۵ سامانه ملی پایش
## PHASE 5 MASTER COMPLETION ROADMAP: STEP 08 THROUGH STEP 12 (V1.0)

**مقام صادرکننده:** دفتر معمار ارشد سیستم و مالک نقشه راه توسعه (Chief System Architect & Development Roadmap Owner) — Chat 1  
**تاریخ صدور:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 1.0.0-MASTER-COMPLETION  
**کامیت مبنای مخزن:** `0c85c9ea` روی شاخه `main`  
**وضعیت کلان سامانه:** **`PAYESH DEVELOPMENT STATUS: 🟡 ACTIVE DEVELOPMENT — STEP 08 REMEDIATION CONTINUING`**  

---

# ۱. وضعیت لحظه‌ای توسعه سامانه (Master Real-Time Development State)

سامانه ملی پایش در حساس‌ترین نقطه گذار زیرساختی خود قرار دارد. وضعیت دقیق فازها و مولفه‌ها به شرح زیر است:

```
┌─────────────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ فاز / گام                       │ وضعیت        │ شرح موقعیت حاکمیتی                                     │
├─────────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ Phase 0: Governance & Schema    │ ✅ COMPLETED │ استقرار PostgreSQL به عنوان مرجع یگانه حقیقت (SSoT)    │
│ Phase 1: Core Infrastructure    │ ✅ COMPLETED │ احراز هویت اولیه، توکن‌های JWT و لایه داده بنیادین     │
│ Phase 2: Semantic Layer         │ ✅ COMPLETED │ هوش تجاری مدارس، پرونده جامع، تحلیل حضور و نمرات        │
│ Phase 3: Offline Synchronization│ ✅ COMPLETED │ پروتکل دلتا و همگام‌سازی آفلاین کلاینت‌های مرزی        │
│ Phase 4: Scalability & ZT       │ ✅ COMPLETED │ سقف بار ۵۰k کاربر، لایه Zero Trust، کش توزیع‌شده ردیس │
│ Phase 5: Steps 01 to 07         │ ✅ COMPLETED │ موتور فدراسیون استانی، سقف ترافیک ملی و شبیه‌ساز بار  │
├─────────────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ Phase 5: Step 08 (P2-NI-06)     │ 🟡 ACTIVE    │ زیرساخت هویت و OCC؛ در حال رفع نقص‌های V-01 و V-02     │
│ Phase 5: Step 09 (P2-NI-07)     │ ❄️ FROZEN    │ استحکام لایه داده REST و همگام‌سازی دیتابیس-محور      │
│ Phase 5: Step 10 (P2-NI-08)     │ ❄️ FROZEN    │ صف پایدار رویدادها (Transactional Outbox & Worker)     │
│ Phase 5: Step 11 (P2-NI-09)     │ ❄️ FROZEN    │ فدراسیون کلاستر ملی و تابلوی عملیاتی NOC               │
│ Phase 5: Step 12 (P2-NI-10)     │ ❄️ FROZEN    │ گواهی نهایی Mode B و احراز آمادگی تولید ملی            │
└─────────────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

# ۲. ماتریس تصمیمات کلیدی معماری (Architectural Decisions Index)

کلیه گام‌های توسعه فاز ۵ مقید به ۱۳ اصل مصوب زیر هستند و هرگونه انحراف از آن‌ها به منزله شکست گیت محسوب می‌شود:
* **ADR-001 (PostgreSQL SSoT):** پایگاه داده PostgreSQL یگانه مرجع حقیقت است. حافظه رم پادها فاقد هرگونه مرجعیت است.
* **ADR-002 / ADR-006 (Decoupled Redis OTP):** حذف قفل‌های سراسری متمرکز و مهاجرت به کلیدهای مجزای هش‌شده.
* **ADR-003 (Strict Isolation):** ایزولاسیون کامل استان‌ها و تننت‌ها در کوئری‌های دیتابیس.
* **ADR-004 (Zero-Downtime Migration):** استقرار مایگریشن‌ها بدون ایجاد قفل انحصاری جدول (`ACCESS EXCLUSIVE`).
* **ADR-005 (Transactional Outbox Engine):** ثبت رویدادها در همان تراکنش دیتابیس جهت تضمین RPO=0s.
* **ADR-007 (Rate Limiting on Critical Paths):** محدودسازی درخواست‌های سنگین در لایه گیت‌وی و وب‌سرور.
* **ADR-008 (Absolute Fail-Closed Truth):** قطع زیرساخت پایدار باید بلافاصله منجر به پاسخ صلب ۵۰۳ شود.
* **ADR-009 (Sequential Phase Unlocking):** ممنوعیت مطلق ورود به گام بعدی قبل از تصویب رسمی گیت جاری.
* **ADR-010 (Zero Test Tampering):** ممنوعیت هرگونه دست‌کاری، تضعیف یا نادیده‌گرفتن تست‌های اعتبارسنجی.
* **ADR-011 (Outbox vs Event Stream Boundary):** جداسازی فیزیکی جدول Outbox از پایپ‌لاین انتشار رویداد Kafka/Redis.
* **ADR-012 (Mandatory Human Authorization for Evacuation):** تخلیه ترافیک استانی فقط با امضای کریپتوگرافیک اپراتور.
* **ADR-013 (Universal Runtime OCC & Zero-Naked-Update Invariant):** الزام به اجرای الگوی `SET version = version + 1 WHERE id = $id AND version = $base` در تمام جهش‌ها و منسوخ‌سازی کامل رویه LWW و مقایسه رم.

---

# ۳. برنامه تفکیکی گام‌های ۰۸ تا ۱۲ (Step-by-Step Execution Plan)

```
========================================================================================================
STEP 08: DISTRIBUTED IDENTITY & UNIVERSAL OCC HARDENING (P2-NI-06)
========================================================================================================
هدف معماری:
  ریشه‌کنی رونویسی تصادفی نمرات (Lost Updates) و تضمین مقیاس‌پذیری ورود کاربران به ۲۰,۰۰۰ لاگین در ثانیه.

وضعیت کنونی:
  طراحی معماری ۱۰۰٪ انجام شده؛ رفع نقص‌های اعتبارسنجی V-01 و V-02 در جریان است.

چه چیزی انجام شده (Done):
  - طراحی مانیفست مایگریشن ۰۱۳ برای تمام ۹۳ جدول.
  - تدوین ساختار کلیدهای تفکیک‌شده ردیس بر پایه sha256(phone).
  - تصویب ADR-013 جهت ریشه‌کنی UPDATEهای برهنه.

چه چیزی باقی مانده (Remaining):
  - تکمیل پیاده‌سازی مایگریشن ۰۱۳ و اسکریپت رول‌بک تمیز.
  - اعمال اصلاحات پروب‌های سلامت /api/health و /api/readiness (Fail-Closed).
  - حذف UPDATEهای برهنه در server/db.js و server/sync.js.
  - پایدارسازی تضادها در جدول sync_conflicts دیتابیس.

تقسیم وظایف تیم‌ها:
  - Chat 2 Tasks:
    * TASK-REM-01: Universal OCC Migration 013 (DDL + Sequences)
    * TASK-REM-02: Distributed OTP Decoupling (Redis Key Splitting)
    * TASK-REM-05: Strict Fail-Closed Health & Readiness Probes (V-01)
    * TASK-REM-06: Universal Runtime OCC Enforcement & Zero Naked Updates (V-02)
    * TASK-REM-07: SSoT Conflict Persistence in PostgreSQL
  - Chat 3 Validation:
    * TEST-ISO-01: 50-Thread Concurrent OCC Race Condition & Naked Update Injection
    * TEST-ISO-02: 3,000 req/s OTP Concurrency Flood & Network Kill Probes
    * TEST-REG-ALL: Full Regression Suite Verification

وابستگی‌ها (Dependencies):
  - کامیت مبنا 0add81fb و لایه اتصال pg/redis.

گیت پذیرش (Acceptance Gate):
  - GATE-08 (احراز ۱۰۰٪ موارد ۱۸ گانه چک‌لیست STEP_08_GATE_TRACKING_V1.md).

--------------------------------------------------------------------------------------------------------
STEP 09: REST DATA ACCESS HARDENING & DATABASE-FIRST SYNC ENGINE (P2-NI-07)
========================================================================================================
هدف معماری:
  ریشه‌کنی سرریز حافظه فرآیند (Heap OOM) و قطع اتکای همگام‌سازی دلتا به حافظه رم پادها.

وضعیت کنونی:
  ❄️ FROZEN (در انتظار تاییدیه قطعی GATE-08).

چه چیزی انجام شده (Done):
  - تدوین سند اجرایی STEP_09_EXECUTION_PLAN_V1.md.
  - شناسایی خطوط بحرانی classes.js:105 و students.js:114 و pull.js:170-229.

چه چیزی باقی مانده (Remaining):
  - بازنویسی کوئری‌های واکشی اعضای کلاس با JOIN مستقیم SQL و شروط صلب تننت.
  - اعتبارسنجی تک‌کوئری EXISTS برای دسترسی اولیا به دانش‌آموزان.
  - معکوس‌سازی ترتیب کامیت در sync.js (Database-First: ابتدا COMMIT سپس پاسخ به کلاینت).
  - انتقال فیلترهای نقش به درون کوئری‌های SQL دلتا در pull.js (SQL Pushdown).

تقسیم وظایف تیم‌ها:
  - Chat 2 Tasks:
    * TASK-REM-03: REST Data Access Hardening (classes.js, students.js, analytics.js)
    * TASK-REM-04: Database-First Sync Engine & SQL Pushdown (sync.js, pull.js)
  - Chat 3 Validation:
    * TEST-ISO-03: Class & Student Heap Memory OOM Bomb (500 parallel queries, heap delta < 2MB)
    * TEST-ADV-04: Multi-Pod Delta State Drift & Ghost Records Interception

وابستگی‌ها (Dependencies):
  - GATE-08 Approved (مایگریشن ۰۱۳ فعال و ستون version در تمام جداول حاضر باشد).

گیت پذیرش (Acceptance Gate):
  - GATE-09 (دلتا رم زیر ۲MB، حذف ۱۰۰٪ متدهای listLive، تاخیر P99 زیر ۳۰ms).

--------------------------------------------------------------------------------------------------------
STEP 10: DURABLE TRANSACTIONAL OUTBOX & RESILIENT ASYNC PIPELINE (P2-NI-08)
========================================================================================================
هدف معماری:
  تضمین عدم اتلاف پیام‌ها (Zero Event Loss)، دستیابی به RPO=0s و ریشه‌کنی رقابت در واکشی رویدادها.

وضعیت کنونی:
  ❄️ FROZEN (در انتظار تاییدیه قطعی GATE-09).

چه چیزی انجام شده (Done):
  - طراحی معماری Transactional Outbox در سند PHASE_5_ROADMAP_CONTINUATION_V2.md.
  - مشخصات فنی کوئری SELECT ... FOR UPDATE SKIP LOCKED.

چه چیزی باقی مانده (Remaining):
  - پیاده‌سازی دیتابیس-محور ورکر Outbox در server/outbox-worker.js.
  - استفاده از الگوی SKIP LOCKED جهت توزیع کار بین پادها بدون ایجاد Lock Contention.
  - حذف کامل آرایه ناپایدار store.outbox از رم سرور.
  - پیاده‌سازی جدول صف پیام‌های مرده (Dead-Letter Queue - DLQ) با عقب‌نشینی نمایی و Jitter.

تقسیم وظایف تیم‌ها:
  - Chat 2 Tasks:
    * TASK-REM-08: PostgreSQL SKIP LOCKED Outbox Poller & Zero-RAM Queue
    * TASK-REM-09: Dedicated Dead-Letter Queue (DLQ) & Exponential Retry Engine
  - Chat 3 Validation:
    * TEST-ISO-04: Outbox Worker Crash & Abrupt SIGKILL Recovery (Zero Duplicate/Lost Events)
    * TEST-ADV-05: Poison Pill Injection & DLQ Routing Validation

وابستگی‌ها (Dependencies):
  - GATE-09 Approved (پروتکل همگام‌سازی دیتابیس-محور پایدار باشد).

گیت پذیرش (Acceptance Gate):
  - GATE-10 (پردازش بیش از ۲,۵۰۰ پیام در ثانیه، RPO=0s، عدم قفل شدن جدول رویدادها).

--------------------------------------------------------------------------------------------------------
STEP 11: NATIONAL FEDERATION, MULTI-CLUSTER FABRIC & NOC OBSERVABILITY (P2-NI-09)
========================================================================================================
هدف معماری:
  مدیریت بلادرنگ کلاسترهای ۳۱ استان کشور، روتینگ هوشمند ترافیک و جداسازی کامل حوادث منطقه‌ای.

وضعیت کنونی:
  ❄️ FROZEN (در انتظار تاییدیه قطعی GATE-10).

چه چیزی انجام شده (Done):
  - تدوین قراردادهای توپولوژی کلاستر و شاخص‌های سلامت در national-region-control-plane.js.
  - طراحی معماری تابلوی پایش عملیات ملی (NOC).

چه چیزی باقی مانده (Remaining):
  - پیاده‌سازی کنترلر فدراسیون کلاسترها در server/federation-controller.js.
  - اتصال درگاه‌های رصد بلادرنگ کلاسترها به مرکز عملیات ملی (NOC Dashboard).
  - اعمال سناریوهای Failover خودکار بین دیتاسنتر اصلی و ثانویه در کمتر از ۶۰ ثانیه.
  - استقرار فیوزهای حفاظتی ترافیک جهت جلوگیری از سرایت بحران استانی به سطح ملی.

تقسیم وظایف تیم‌ها:
  - Chat 2 Tasks:
    * TASK-DEV-01: Multi-Cluster Federation Controller & Weight Distributor
    * TASK-DEV-02: NOC Telemetry Aggregator & Automated Failover Engine
  - Chat 3 Validation:
    * TEST-ISO-05: Regional Data Center Blackout & Traffic Evacuation Drill
    * TEST-ADV-06: Split-Brain Prevention Drill under Network Partitioning

وابستگی‌ها (Dependencies):
  - GATE-10 Approved (پایپ‌لاین رویدادهای ملی پایدار و بدون اتلاف باشد).

گیت پذیرش (Acceptance Gate):
  - GATE-11 (تغییر مسیر ترافیک استان در کمتر از ۶۰ ثانیه، انحراف صفر در شمارش رویدادهای فدرال).

--------------------------------------------------------------------------------------------------------
STEP 12: MODE B PRODUCTION READINESS & FINAL NATIONAL CERTIFICATION (P2-NI-10)
========================================================================================================
هدف معماری:
  صدور گواهی قطعی بهره‌برداری ملی با اعتبارسنجی ۱۰۰٪ روی زیرساخت واقعی بدون ماک (Mode B).

وضعیت کنونی:
  ❄️ FROZEN (در انتظار تاییدیه قطعی GATE-11).

چه چیزی انجام شده (Done):
  - استقرار ماژول ارزیابی ۶ ستون آمادگی تولید (national-production-readiness.js).
  - تدوین مشخصات تست بار ملی ۱۰۰,۰۰۰ کاربر همزمان.

چه چیزی باقی مانده (Remaining):
  - اجرای تست بار پیوسته (Soak Test) به مدت ۲ ساعت با بار کامل ملی روی کانتینرهای واقعی.
  - ممیزی نهایی عدم وجود تست‌های جعلی، ماک در محیط عملیاتی و رد پای Fallback حافظه.
  - اعتبارسنجی انطباق ۱۰۰٪ با پروتکل‌های Zero Trust و استانداردهای رمزنگاری ملی.
  - صدور سند نهایی گواهی آزادی انتشار (Production Release Certificate).

تقسیم وظایف تیم‌ها:
  - Chat 2 Tasks:
    * TASK-CERT-01: Production Hardening, Environment Lockdown & Config Sanitization
  - Chat 3 Validation:
    * TEST-FULL-MODE-B: 100,000 Concurrent User Simulation & 31-Province Chaos Drill
    * TEST-AUDIT-FINAL: Cryptographic Verification of Codebase Integrity & Zero Fake Greens

وابستگی‌ها (Dependencies):
  - احراز کامل تمام گیت‌های قبلی (GATE-08 تا GATE-11).

گیت پذیرش (Acceptance Gate):
  - GATE-12 & FINAL PHASE 5 CERTIFICATION (۱۰۰٪ آزمون‌ها سبز روی دیتابیس فیزیکی).
========================================================================================================
```

---

# ۴. گراف وابستگی و توالی ترتیبی وظایف (Sequential Execution DAG)

توسعه فاز ۵ در خط لوله متوالی زیر بدون توقف و با حفظ استقلال نقش‌ها جریان دارد:

```
[CURRENT POINT: Step 08 Remediation]
                 │
                 ├──► Chat 2: TASK-REM-05 (Health Fail-Closed)
                 ├──► Chat 2: TASK-REM-06 (Universal Runtime OCC)
                 └──► Chat 2: TASK-REM-07 (Conflict SSoT Persistence)
                             │
                             ▼
                 [Chat 3 Red Team Verification: TEST-ISO-01 & 02]
                             │
                             ▼
                   [GATE-08 SIGN-OFF]
                             │
                             ▼
                 [STEP 09 UNLOCKED: P2-NI-07]
                             │
                 ├──► Chat 2: TASK-REM-03 (REST Hardening)
                 └──► Chat 2: TASK-REM-04 (Database-First Sync)
                             │
                             ▼
                 [Chat 3 Verification: TEST-ISO-03 & ADV-04]
                             │
                             ▼
                   [GATE-09 SIGN-OFF]
                             │
                             ▼
                 [STEP 10 UNLOCKED: P2-NI-08]
                             │
                 ├──► Chat 2: TASK-REM-08 (SKIP LOCKED Outbox)
                 └──► Chat 2: TASK-REM-09 (DLQ & Jitter Retries)
                             │
                             ▼
                 [Chat 3 Verification: TEST-ISO-04 & ADV-05]
                             │
                             ▼
                   [GATE-10 SIGN-OFF]
                             │
                             ▼
                 [STEP 11 UNLOCKED: P2-NI-09]
                             │
                 ├──► Chat 2: TASK-DEV-01 (Cluster Federation)
                 └──► Chat 2: TASK-DEV-02 (NOC Operations Engine)
                             │
                             ▼
                 [Chat 3 Verification: TEST-ISO-05 & ADV-06]
                             │
                             ▼
                   [GATE-11 SIGN-OFF]
                             │
                             ▼
                 [STEP 12 UNLOCKED: P2-NI-10]
                             │
                 ├──► Chat 2: TASK-CERT-01 (Production Lockdown)
                 └──► Chat 3: TEST-FULL-MODE-B (100k National Soak Test)
                             │
                             ▼
          [GATE-12 & PHASE 5 MASTER COMPLETION SIGN-OFF]
                             │
                             ▼
                 [ENTER PHASE 6: NATIONAL GO-LIVE]
```

---

# ۵. معیارهای صلب پایان فاز ۵ (Non-Negotiable Completion Criteria)

پایان فاز ۵ سامانه پایش و ورود به فاز ۶ تنها در صورتی رسماً اعلام می‌شود که شرایط زیر به طور تام محقق شده باشد:
1. **۱۰۰٪ گیت‌های پنج‌گانه (GATE-08 تا GATE-12) پاس شده باشند.**
2. **پایگاه داده PostgreSQL در تمام سناریوها یگانه مرجع حقیقت (SSoT) باشد** و حتی یک بایت داده هویتی، نمره، حضور و تضاد در حافظه موقت ذخیره نگردد.
3. **حفظ استانداردهای بهره‌برداری:** تاخیر پاسخ‌دهی P99 در شرایط ترافیک سنگین کمتر از ۵۰ میلی‌ثانیه، RPO=0s و RTO کمتر از ۶۰ ثانیه اثبات شود.
4. **تاییدیه رسمی مستقل ردتیم:** گزارش ممیزی Chat 3 مبنی بر قبولی کامل تست‌های Mode B بدون اتکا به ماک.

---

# ۶. اعلامیه حاکمیتی مسیر توسعه (Official Roadmap Declaration)

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     OFFICIAL ROADMAP CONTINUATION DIRECTIVE                        ║
║                                                                                    ║
║           STATUS: 🟡 ACTIVE DEVELOPMENT — STEP 08 REMEDIATION CONTINUING          ║
║                                                                                    ║
║  1. نقشه پایان فاز ۵ تا گام ۱۲ به صورت تفصیلی، ترتیبی و گیت‌محور تثبیت گردید.       ║
║  2. هیچ توقفی در برنامه‌ریزی توسعه وجود ندارد؛ مسیر گام‌های بعدی کاملاً هموار است. ║
║  3. گام‌های ۰۹ تا ۱۲ به صورت صلب در حالت انجماد حاکمیتی منتظر عبور گیت‌ها هستند.     ║
║  4. وضعیت سامانه ملی پایش: NOT PRODUCTION READY UNTIL VERIFIED BY CHAT 3.          ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```
