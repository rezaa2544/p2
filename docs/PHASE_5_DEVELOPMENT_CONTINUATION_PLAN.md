# طرح جامع ادامه توسعه فاز ۵ سامانه ملی پایش
## PHASE 5 DEVELOPMENT CONTINUATION PLAN (v1.0)

**مقام تصویب‌کننده:** دفتر معمار ارشد سیستم و مالک نقشه راه توسعه (Chief System Architect & Development Roadmap Owner) — Chat 1  
**تاریخ تدوین:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 1.0.0-DEV-CONTINUATION  
**کامیت مبنای توسعه (Baseline Commit):** `0add81fbc8a7f7888f7072096ef67938d8a5a006`  
**وضعیت مسیر توسعه:** **`PAYESH DEVELOPMENT STATUS: 🟡 ACTIVE DEVELOPMENT`**  

---

# ۱. وضعیت فعلی فاز ۵ (Current Phase Status)

```
========================================================================================
PHASE 5 CURRENT DEVELOPMENT STATUS
========================================================================================
Phase:         Phase 5 — National Pilot, Multi-Region Federation & Production Infrastructure
Active Step:   Transitioning from Step 07 to Step 08 (P2-NI-06)
Baseline:      Commit 0add81fb (Merge of feat/phase5-step07-production-truth-remediation)

Completed Steps:
  ✅ Step 01 (P2-PL-01): Multi-Region Cloud Federation & Provincial Pilot Provisioning
  ✅ Step 02 (P2-PL-02): Provincial Pilot Activation & Canary Traffic Scaling
  ✅ Step 03 (P2-NI-01): National Infrastructure Foundation & Production Fabric
  ✅ Step 04 (P2-NI-02): National Production Readiness NOC & Controlled Scale Activation
  ✅ Step 05 (P2-NI-03): National Production Fabric Validation & Real Capacity Enforcement
  ✅ Step 06 (P2-NI-04): National E2E Production Simulation Capacity Proof & Hardening
  ✅ Step 07 (P2-NI-05): Production Truth Remediation & Real Infrastructure Validation

Remaining Steps:
  ⏳ Step 08 (P2-NI-06): Distributed Identity & Universal OCC Foundation
  ⏳ Step 09 (P2-NI-07): REST & Sync Data Access Hardening (Zero-RAM Pushdown)
  ⏳ Step 10 (P2-NI-08): Distributed Event Infrastructure & Durable Outbox Engine
  ⏳ Step 11 (P2-NI-09): 31-Province Federation Cutover & Live Pilot Orchestration
  ⏳ Step 12 (P2-NI-10): Phase 5 Master Production Certification & National NOC Handoff

Blocked By:
  🔒 ورود به پیاده‌سازی Step 09 منوط به اتمام TASK-REM-01 و TASK-REM-02 توسط Chat 2
     و تاییدیه آزمون‌های تخریبی TEST-ADV-01 و TEST-ADV-02 توسط Chat 3 است.
========================================================================================
```

---

# ۲. ادامه نقشه راه توسعه فاز ۵ (Development Roadmap Continuation)

مسیر توسعه کلان فاز ۵ در ۵ گام تکمیلی ساخت‌یافته ادامه می‌یابد:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 5 CONTINUATION PIPELINE                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Step 08 (P2-NI-06): Distributed Identity & Universal OCC Foundation                    │
│    │                                                                                   │
│    ▼                                                                                   │
│ Step 09 (P2-NI-07): REST & Sync Data Access Hardening (Zero-RAM Pushdown)              │
│    │                                                                                   │
│    ▼                                                                                   │
│ Step 10 (P2-NI-08): Distributed Event Infrastructure & Durable Outbox Engine           │
│    │                                                                                   │
│    ▼                                                                                   │
│ Step 11 (P2-NI-09): 31-Province Federation Cutover & Live Pilot Orchestration           │
│    │                                                                                   │
│    ▼                                                                                   │
│ Step 12 (P2-NI-10): Phase 5 Master Production Certification & National NOC Handoff     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 08 (P2-NI-06): زیرساخت توزیع‌شده هویت و کنترل همزمانی سراسری
* **Objective:** استقرار سراسری ستون نسخه (`version`) و دنباله‌های سخت‌افزاری بر روی تمامی ۹۳ جدول پایگاه داده و بازطراحی سرویس احراز هویت بدون قفل متمرکز در کلاستر ردیس.
* **Architecture Impact:** حذف کامل رونویسی‌های تصادفی داده‌ها (Lost Updates) در سطح کشور و از میان برداشتن گلوگاه قفل سراسری ورود در ساعات پیک صبحگاهی مدارس.
* **Required Components:**
  - `migrations/013_universal_occ_and_sequences.sql` و فایل متناظر `.down.sql`.
  - ماژول بازطراحی‌شده `server/otp-store.js` بر پایه کلیدهای تفکیک‌شده `payesh:otp:{sha256(phone)}`.
  - ماژول `server/ids.js` با حذف کامل تنزل به حافظه در محیط تولید.
* **Dependencies:** Step 07 (`b803d00b`).
* **Owner:** Chat 1 (هدایت معماری) + Chat 2 (پیاده‌سازی پچ) + Chat 3 (ردتیم).
* **Acceptance Criteria:**
  1. استعلام کاتالوگ دیتابیس اثبات کند دقیقاً ۹۳ جدول دارای ستون `version` و دنباله یکتای شناسه هستند.
  2. ارسال ۲,۰۰۰ درخواست ورود همزمان به ردیس بدون رخداد حتی ۱ خطای Lock Timeout پردازش شود.

---

### STEP 09 (P2-NI-07): استحکام لایه داده REST و پروتکل همگام‌سازی دلتا
* **Objective:** حذف کامل متدهای بارگذاری سراسری (`readCollection`, `listLive`) در کنترلرهای کلاس‌ها و دانش‌آموزان و انتقال کامل فیلترهای دامنه نشست در پروتکل Sync Pull به درون SQL.
* **Architecture Impact:** ریشه‌کنی قطعی خطای سرریز حافظه فرآیند (Node.js Heap OOM) در هنگام مشاهده کلاس‌ها و استقلال کامل همگام‌سازی کلاینت‌ها از حافظه پاد میزبان در کلاستر چندپادی.
* **Required Components:**
  - بازنویسی `server/routes/classes.js` (استفاده از JOIN مستقیم با `enrollments`).
  - بازنویسی `server/routes/students.js` (استفاده از تک‌کوئری `EXISTS` برای پیوند اولیا).
  - بازنویسی توابع `filterCollectionForSession` در `server/pull.js`.
  - اصلاح توالی ثبت در `server/sync.js` به الگوی صلب Database-First.
* **Dependencies:** تکمیل موفق Step 08.
* **Owner:** Chat 1 (هدایت معماری) + Chat 2 (پیاده‌سازی).
* **Acceptance Criteria:**
  1. مشاهده جزییات کلاس با ۵۰ دانش‌آموز، حافظه Heap فرآیند را کمتر از ۲ مگابایت افزایش دهد.
  2. جهش ثبت‌شده در پاد A، بلافاصله در بسته دلتای دریافتی از پاد B بدون اشتراک حافظه رم ظاهر شود.

---

### STEP 10 (P2-NI-08): زیرساخت توزیع‌شده رویدادها و صف پایدار Outbox
* **Objective:** استقرار کارگر صف دیتابیس با قفل ردیفی همروند (`FOR UPDATE SKIP LOCKED`)، ایجاد جدول Dead Letter Queue (DLQ)، و پیاده‌سازی مکانیزم بازپخش (Replay) رویدادها.
* **Architecture Impact:** حذف سوختن پیامک‌ها و رویدادهای تحصیلی در صورت سقوط پادها، تضمین قطعی RPO = 0s در بار امتحانات نهایی (۹,۷۵۰ TPS) و تلطیف امن تا سقف ۲,۵۰۰ TPS دیتابیس.
* **Required Components:**
  - مایگریشن `014_outbox_distributed_queue_dlq.sql`.
  - بازنویسی چرخه پردازش در `server/worker.js`.
  - روت مدیریتی امن `/api/v1/system/national/outbox/dlq/replay` در `server/routes/system.js`.
* **Dependencies:** تکمیل موفق Step 09.
* **Owner:** Chat 1 (هدایت معماری) + Chat 2 (پیاده‌سازی).
* **Acceptance Criteria:**
  1. ارسال سیگنال `SIGKILL` به پادهای کارگر در اوج بار، با صفر پیام گم‌شده یا تکراری همراه باشد.
  2. رخدادهای معیوب پس از ۵ بار تلاش به صورت خودکار به DLQ منتقل شده و صف مسدود نشود.

---

### STEP 11 (P2-NI-09): سوییچ نهایی ۳۱ استان و اجرای پایلوت زنده فدراسیون
* **Objective:** اتصال زنده ترافیک قناری تمامی ۳۱ استان کشور به کلاسترهای منطقه‌ای ۷ گانه (تهران، اصفهان، تبریز، شیراز، مشهد، اهواز، کرمانشاه) بر بستر زیرساخت بازسازی‌شده.
* **Architecture Impact:** فعال‌سازی کامل ترافیک ملی در دنیای واقعی با ایزولاسیون جغرافیایی و هدایت بار با وزن‌های کنترل‌شده.
* **Required Components:**
  - `server/infrastructure/national-traffic-fabric.js`.
  - `server/infrastructure/national-region-control-plane.js`.
  - ماژول‌های مانیتورینگ NOC در `server/operations/national-operations-center.js`.
* **Dependencies:** تکمیل موفق Step 10.
* **Owner:** Chat 1 (راهبری کلان معماری) + تیم‌های عملیات.
* **Acceptance Criteria:**
  1. توزیع متوازن ترافیک بر روی کلاسترهای منطقه‌ای بر اساس اوزان مصوب بدون نشت داده‌های بین‌استانی.
  2. پایداری کامل شاخص‌های SLO در رصدخانه ملی پایش.

---

### STEP 12 (P2-NI-10): اخذ تاییدیه نهایی تولید و تحویل عملیاتی به NOC
* **Objective:** اجرای پروتکل رسمی ارزیابی ۶ گانه آمادگی تولید بر روی کلاستر فیزیکی واقعی (Mode B) و صدور تاییدیه رسمی Production Certification.
* **Architecture Impact:** خروج رسمی سامانه از وضعیت قرمز و اخذ وضعیت سبز جهت بهره‌برداری رسمی آموزش و پرورش.
* **Required Components:**
  - گزارش نهایی تاییدیه فیزیکی `docs/FINAL_PRODUCTION_READINESS_CERTIFICATE.md`.
  - تابلوی تحویل به مرکز عملیات ملی (NOC Operations Handoff).
* **Dependencies:** تکمیل موفق تمامی گام‌های ۱ تا ۱۱.
* **Owner:** Chat 1 + Chat 3 (تایید مستقل).
* **Acceptance Criteria:** قبولی کامل و ۱۰۰٪ در آزمون‌های Mode B و سناریوهای تخریبی ردتیم.

---

# ۳. صف وظایف تیم مهندسی بازسازی (Chat 2 Task Queue)

Chat 2 موظف است وظایف زیر را بر اساس توالی DAG و بدون تخطی از دامنه فایل‌های مجاز انجام دهد:

```
========================================================================================
CHAT 2 REMEDIATION TASK QUEUE
========================================================================================

[TASK-REM-01: BLK-07 Universal OCC & Sequences Migration]
  Problem: ۸۴ جدول از ۹۳ جدول پایگاه داده فاقد ستون version هستند؛ ریسک رونویسی تصادفی داده‌ها.
  Scope: migrations/013_universal_occ_and_sequences.sql و فایل متناظر .down.sql.
  Allowed Files: migrations/013_universal_occ_and_sequences.sql, migrations/013_universal_occ_and_sequences.down.sql.
  Expected Fix: افزودن ستون version با پیش‌فرض ۱ و ایندکس updated_at به کلیه ۸۴ جدول با DDL بدون قفل انحصاری.
  Required Tests: تست کاتالوگ information_schema روی ۹۳ جدول؛ تست رول‌بک و تست اجرای تکراری (Idempotent).
  Acceptance Gate: تاییدیه ۱۰۰٪ پوشش جداول و عدم مشاهده Lock Timeout در اجرای DDL.

----------------------------------------------------------------------------------------
[TASK-REM-02: BLK-04 Distributed OTP Architecture & Key Splitting]
  Problem: کلید متمرکز payesh:otp:state و قفل سراسری otp-state در ردیس باعث گلوگاه احراز هویت در ساعات پیک می‌شود.
  Scope: server/otp-store.js, server/auth.js.
  Allowed Files: server/otp-store.js, server/auth.js.
  Expected Fix: حذف کلید متمرکز؛ ذخیره‌سازی مجزا بر پایه هش تلفن: payesh:otp:{sha256(phone)} با TTL ۱۲۰ ثانیه.
  Required Tests: تست ورود همزمان ۲,۰۰۰ شماره مجزا؛ تست شکست ردیس و رفتار صلب Fail-Closed.
  Acceptance Gate: تاخیر ورود P99 زیر ۳۰ms و صفر خطای Distributed Lock Timeout.

----------------------------------------------------------------------------------------
[TASK-REM-03: BLK-01 & BLK-02 REST Data Access Hardening]
  Problem: متد getClassById کل ۱۰ میلیون کاربر کشور را در رم لود می‌کند؛ گارد اولیا کل جدول پیوندها را واکشی می‌کند.
  Scope: server/routes/classes.js, server/routes/students.js, server/routes/analytics.js.
  Allowed Files: server/routes/classes.js, server/routes/students.js, server/routes/analytics.js.
  Expected Fix: تبدیل به کوئری‌های مقید به مستأجر (WHERE school_id = $1) با INNER JOIN و حذف کامل listLive.
  Required Tests: تست بار مشاهده همزمان ۵۰۰ کلاس و ثبت تغییرات حافظه Heap.
  Acceptance Gate: مصرف حافظه فرآیند Node.js در مشاهده کلاس کمتر از ۲ مگابایت افزایش یابد.

----------------------------------------------------------------------------------------
[TASK-REM-04: BLK-03 & BLK-06 Distributed Sync Database-First Engine]
  Problem: پروتکل Push ابتدا در رم می‌نویسد؛ پروتکل Pull برای فیلتر دامنه به آرایه‌های رم وابسته است.
  Scope: server/sync.js, server/pull.js, server/conflicts.js.
  Allowed Files: server/sync.js, server/pull.js, server/conflicts.js.
  Expected Fix: تغییر توالی به Database-First Commit در sync.js و pushdown کامل فیلترهای نقش به کوئری‌های SQL دلتا.
  Required Tests: تست همزمانی چندپادی (ثبت در پاد A و دریافت آنی در بسته دلتای پاد B).
  Acceptance Gate: صفر مورد استعلام از آرایه‌های رم در مسیر همگام‌سازی و تضمین تمامیت چندپادی.

----------------------------------------------------------------------------------------
[TASK-REM-05: BLK-05 Distributed Outbox Queue Engine & DLQ]
  Problem: کارگر صف رویدادها از آرایه محلی store.outbox در رم می‌خواند؛ در کرش پاد رویدادها می‌سوزند.
  Scope: migrations/014_outbox_dlq.sql, server/worker.js, server/outbox.js.
  Allowed Files: migrations/014_outbox_dlq.sql, migrations/014_outbox_dlq.down.sql, server/worker.js, server/outbox.js.
  Expected Fix: استفاده از کوئری FOR UPDATE SKIP LOCKED روی دیتابیس؛ انتقال رخدادهای معیوب پس از ۵ بار شکست به DLQ.
  Required Tests: تست ارسال SIGKILL به نیمی از پادهای کارگر زیر بار ۹,۷۵۰ TPS نمرات.
  Acceptance Gate: صفر پیام گمشده و تصفیه ۱۰۰٪ پیام‌های سالم بدون توقف صف.
========================================================================================
```

---

# ۴. صف آزمون‌های تخریبی تیم ردتیم (Chat 3 Validation Queue)

Chat 3 موظف است حملات و سناریوهای تخریبی زیر را بر روی خروجی‌های تحویلی Chat 2 اجرا نماید:

```
========================================================================================
CHAT 3 ADVERSARIAL VALIDATION QUEUE
========================================================================================

[TEST-ADV-01: Universal OCC Race & Naked UPDATE Injection]
  Target: جداول به‌روزرسانی‌شده در مایگریشن ۰۱۳ (پایگاه داده PostgreSQL).
  Attack Scenario: ارسال همزمان ۵۰ جهش متقاطع با نسخه پایه ۱ روی یک ردیف در جدول schools و ارسال کوئری‌های فاقد ستون version.
  Expected Secure Result: دقیقاً ۱ درخواست موفق شده و ۴۹ درخواست دیگر با خطای صلب ۴۰۹ پس زده شوند؛ هرگونه تلاش برای Naked UPDATE رد شود.
  Evidence Required: لاگ دیتابیس حاوی Rows Affected و تاییدیه ثبت رکورد در جدول تعارضات.

----------------------------------------------------------------------------------------
[TEST-ADV-02: OTP Concurrency Flood & Redis Disconnect Fail-Closed]
  Target: ماژول احراز هویت توزیع‌شده (server/otp-store.js و server/auth.js).
  Attack Scenario: شلیک ۳,۰۰۰ درخواست دریافت کد ورود در ثانیه برای ۱,۰۰۰ شماره مجزا؛ همزمان قطع موقت اتصال کلاستر ردیس.
  Expected Secure Result: پردازش بدون صف بستن کدهای ورود؛ در زمان قطع ردیس، سیستم فوراً پاسخ صلب ۵۰۳ بدهد و هرگز به رم تنزل نکند (Fail-Closed).
  Evidence Required: نمودار توزیع تاخیر P99 در ردیس و اثبات عدم نشت شماره‌های تماس در لاگ‌ها.

----------------------------------------------------------------------------------------
[TEST-ADV-03: Class & Student Heap Memory OOM Bomb]
  Target: روت‌های REST مشاهده کلاس و پرونده دانش‌آموز (classes.js و students.js).
  Attack Scenario: شلیک مداوم ۱۰۰ درخواست همزمان مشاهده کلاس‌های دارای ۱۰۰ دانش‌آموز توسط مدیران مدارس مختلف.
  Expected Secure Result: اجرای روان کوئری با Index Scan؛ تغییر حافظه Heap زیر ۵ مگابایت؛ زمان پاسخ‌دهی زیر ۳۰ms.
  Evidence Required: فایل Dump ابزار Heap Profiler فرآیند Node.js قبل و بعد از تست بار.

----------------------------------------------------------------------------------------
[TEST-ADV-04: Multi-Pod Delta Sync State Drift & Ghost Records]
  Target: پروتکل همگام‌سازی دلتا و یکپارچگی چندپادی (pull.js و sync.js).
  Attack Scenario: ثبت یک نمره انضباطی جدید در پاد ۱ و ارسال فوری درخواست دلتا به پاد ۲ از سوی ولی دانش‌آموز.
  Expected Secure Result: دریافت بدون تاخیر رکورد جدید در بسته دلتای پاد ۲ بدون نیاز به دسترسی به حافظه پاد ۱.
  Evidence Required: مقایسه هش رمزنگاری‌شده داده‌های ثبت‌شده در دیتابیس با بسته دلتای دریافتی کلاینت.

----------------------------------------------------------------------------------------
[TEST-ADV-05: Outbox Worker Kill & Poison Pill DLQ Isolation]
  Target: کارگر صف رویدادها و صف پیام‌های مرده (worker.js و server_outbox_dlq).
  Attack Scenario: تزریق بار ۹,۷۵۰ TPS به صف و ارسال همزمان سیگنال SIGKILL به نیمی از پادهای پردازشگر؛ تزریق ۱ پیام معیوب به صف.
  Expected Secure Result: پادهای دیگر با SKIP LOCKED بقیه پیام‌ها را بردارند؛ پیام معیوب به DLQ منتقل شود و بقیه بدون تاخیر پردازش شوند.
  Evidence Required: تطبیق شمارنده رکوردهای تولیدشده در برابر رکوردهای پردازش‌شده (تضمین صفر داده سوخته).
========================================================================================
```

---

# ۵. دفتر ثبت تصمیمات کلیدی معماری (Architecture Decision Records)

```
========================================================================================
ARCHITECTURE DECISION LOG (ADR CONTINUATION)
========================================================================================

[ADR-005] Mandatory Keyset Pagination for National Core Entities:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: ممنوعیت قطعی کلمه کلیدی OFFSET برای واکشی رکوردهای کاربران، کلاس‌ها، نمرات و حضور و غیاب.
          الزام به استفاده از صفحه‌بندی پایدار کلیدمحور (Keyset Cursor Pagination) با توپل (updated_at, id).
  - دلیل: کاهش نمایی کارایی دیتابیس در آفست‌های بالا (O(N) Scan) و مصرف غیرخطی حافظه سرور.
  - اثر: تضمین اجرای کوئری‌ها در زمان ثابت O(1) حتی در صفحات انتهایی رکوردهای ۱۰ میلیونی.

[ADR-006] Decoupled Ephemeral Redis Key Schema for OTP:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: حذف کلید تجمیعی payesh:otp:state و استقرار کلیدهای مجزا به ازای هر شماره با قالب
          payesh:otp:{sha256(phone)} با زمان انقضای سخت‌افزاری (TTL) ۱۲۰ ثانیه در ردیس.
  - دلیل: رفع کامل بن‌بست قفل سراسری (Global Lock Contention) در اول صبح مدارس.
  - اثر: مقیاس‌پذیری افقی احراز هویت تا بیش از ۲۰,۰۰۰ لاگین در ثانیه بدون تداخل.

[ADR-007] SKIP LOCKED Database-Driven Distributed Message Queue:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: مهاجرت کامل کارگر صف رویدادها از آرایه‌های حافظه به کوئری همروند دیتابیس با قفل ردیفی:
          SELECT id FROM server_outbox WHERE status = 'pending' ... FOR UPDATE SKIP LOCKED.
  - دلیل: مهار کامل خطر گم شدن رویدادها در زمان کرش پاد و توزیع متوازن بار صف بین ۲۰۰ پاد.
  - اثر: تضمین شاخص RPO = 0s و حذف رخدادهای تکراری یا بلاتکلیف.

[ADR-008] Absolute Disqualification of RAM in Authorization Boundaries:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: هیچ تصمیمی در حوزه بررسی محدوده مدرسه (School Scope)، نقش کاربر (Role Verification)
          و مالکیت داده (Ownership) حق استعلام از شیء store در رم را ندارد.
  - دلیل: جلوگیری از نشت داده‌های بین‌مدارس در استقرار چندپادی کانتینرها.
  - اثر: تحقق ۱۰۰٪ استانداردهای Zero-Trust در زیرساخت حاکمیتی کشور.
========================================================================================
```

---

# ۶. وضعیت اعلامی نهایی معماری توسعه پایش

پیرو تحلیل‌های پیش‌رو و وابستگی‌های مهندسی میان فازها:

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     PAYESH DEVELOPMENT LIFECYCLE STATUS:                           ║
║                                                                                    ║
║                           🟡 ACTIVE DEVELOPMENT                                    ║
║                                                                                    ║
║               PHASE 5 STEP 08 (P2-NI-06) OFFICIALLY PROVISIONED                    ║
║               TASK QUEUES FOR CHAT 2 & CHAT 3 DISPATCHED IN DAG                    ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### خلاصه دستورات حاکمیتی Chat 1:
1. سند **`docs/PHASE_5_DEVELOPMENT_CONTINUATION_PLAN.md`** به عنوان مرجع قطعی هدایت توسعه فاز ۵ در مخزن به ثبت رسید.
2. تیم **Chat 2** موظف است وظایف خود را منحصراً از **بخش ۳ (Chat 2 Task Queue)** بر اساس اولویت `TASK-REM-01` و `TASK-REM-02` تحویل دهد.
3. تیم **Chat 3** مأموریت دارد ابزارهای شبیه‌سازی حمله را بر اساس **بخش ۴ (Chat 3 Validation Queue)** جهت به چالش کشیدن پچ‌ها آماده نماید.
4. مسیر توسعه فعال است؛ گام‌های آتی گام‌به‌گام و پس از عبور موفقیت‌آمیز از گیت‌های پذیرش معماری فعال خواهند شد.
