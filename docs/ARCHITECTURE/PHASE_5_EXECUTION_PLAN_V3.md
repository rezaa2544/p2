# سند برنامه اجرایی و توسعه فاز ۵ سامانه ملی پایش (نسخه ۳)
## PHASE 5 EXECUTION PLAN & ARCHITECTURAL GOVERNANCE (V3.0)

**صادرکننده:** دفتر معمار ارشد سیستم و مالک نقشه راه توسعه (Chief System Architect & Development Roadmap Owner) — Chat 1  
**تاریخ صدور:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 3.0.0-EXEC-PLAN  
**کامیت مبنای توسعه (Baseline Commit):** `0add81fbc8a7f7888f7072096ef67938d8a5a006`  
**وضعیت چرخه توسعه:** **`🟡 ACTIVE DEVELOPMENT`**  
*(مسیر توسعه، معماری و طراحی قابلیت‌های ملی فعال است؛ هر فاز منحصراً پس از تایید گیت‌های پذیرش ردتیم قفل‌گشایی می‌شود).*

---

# ۱. موقعیت جاری چرخه توسعه (Current Development Position)

سامانه ملی پایش مدارس در نقطه عطف انتقال از فازهای پایه‌ای و ممیزی حقیقت (Truth Remediation) به فاز اجرای صلب و یکپارچه در سطح کلاسترهای ملی قرار دارد:

```
========================================================================================
CURRENT PHASE 5 DEVELOPMENT POSITION
========================================================================================
Project Track:       National Scale Mission-Critical Education Platform (10M+ Users)
Phase:               Phase 5 — National Pilot, Multi-Region Federation & Production Fabric
Active Step:         Step 08 (P2-NI-06) — Distributed Identity & Universal OCC Foundation
Status:              Architecture Design Complete / Implementation in Progress by Chat 2
Pending Steps:       Step 09, Step 10, Step 11, Step 12

Team Interfaces:
  - Chat 1: Development Roadmap Owner & Architectural Governance Controller
  - Chat 2: Implementation Owner (Remediation Tasks dispatched via DAG)
  - Chat 3: Independent Red Team (Adversarial Testing & Failure Verification)

Baseline State:      0add81fbc8a7f7888f7072096ef67938d8a5a006
Active Blockers:     BLK-07 & BLK-04 (In Progress by Chat 2)
Frozen Blockers:     BLK-01, BLK-02, BLK-03, BLK-05, BLK-06, BLK-08 (Awaiting Gate 08)
========================================================================================
```

---

# ۲. فازهای تکمیل‌شده سامانه (Completed Phases)

کلیه فازهای پیشین سامانه پایش طبق مستندات و تست‌های ثبت‌شده به پایان رسیده‌اند:

```
┌──────────────┬────────────────────────────────────────────────┬────────────────────────┐
│ فاز          │ عنوان و دستاورد کلیدی مهندسی                   │ وضعیت حاکمیتی         │
├──────────────┼────────────────────────────────────────────────┼────────────────────────┤
│ PHASE 0      │ تثبیت چارچوب کنترل معماری و Control Matrix      │ ✅ COMPLETED           │
│ PHASE 1      │ پایداری وب‌سرور، پایگاه‌داده و بیلد ایزوله     │ ✅ COMPLETED           │
│ PHASE 2      │ لایه معنایی، پایش تحصیلی و هوش آموزشی          │ ✅ COMPLETED           │
│ PHASE 3      │ پروتکل همگام‌سازی آفلاین کلاینت‌ها و داوری     │ ✅ COMPLETED           │
│ PHASE 4      │ مقیاس‌پذیری ردیس، امنیت Zero-Trust و پایش W3C   │ ✅ COMPLETED           │
│ PHASE 5 S01  │ فدراسیون ابری چندمنطقه‌ای (P2-PL-01)          │ ✅ COMPLETED           │
│ PHASE 5 S02  │ پایلوت استانی و ترافیک قناری (P2-PL-02)        │ ✅ COMPLETED           │
│ PHASE 5 S03  │ شالوده زیرساخت ملی و فابریک تولید (P2-NI-01)   │ ✅ COMPLETED           │
│ PHASE 5 S04  │ مرکز عملیات ملی NOC و مدیریت تغییرات (P2-NI-02)│ ✅ COMPLETED           │
│ PHASE 5 S05  │ مهار ظرفیت ملی و سهمیه‌بندی (P2-NI-03)         │ ✅ COMPLETED           │
│ PHASE 5 S06  │ شبیه‌سازی سال تحصیلی و آزمون فشار E2E (P2-NI-04)│ ✅ COMPLETED           │
│ PHASE 5 S07  │ بازسازی حقیقت تولید و رفع اولیه OOM (P2-NI-05) │ ✅ COMPLETED           │
└──────────────┴────────────────────────────────────────────────┴────────────────────────┘
```

---

# ۳. نقشه راه باقیمانده فاز ۵ (Phase 5 Remaining Roadmap)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 5 REMAINING ROADMAP PIPELINE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 08 (P2-NI-06): Distributed Identity & Universal OCC Foundation (ACTIVE)          │
│    │                                                                                   │
│    ▼                                                                                   │
│ STEP 09 (P2-NI-07): REST Data Access Hardening & Database-First Sync Engine            │
│    │                                                                                   │
│    ▼                                                                                   │
│ STEP 10 (P2-NI-08): Distributed Event Infrastructure & Durable Outbox Queue            │
│    │                                                                                   │
│    ▼                                                                                   │
│ STEP 11 (P2-NI-09): 31-Province Federation Cutover & Live Pilot Orchestration           │
│    │                                                                                   │
│    ▼                                                                                   │
│ STEP 12 (P2-NI-10): Phase 5 Master Certification & Production Readiness Handoff        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# ۴. گیت و ماتریس تکمیل گام ۰۸ (Step 08 Completion Matrix)

گام ۰۸ (`P2-NI-06`) فونداسیون کنترل همزمانی داده‌ها و احراز هویت توزیع‌شده است. جدول زیر نیازمندی‌ها، تصمیمات معماری، پیاده‌سازی و گیت پذیرش آن را مشخص می‌کند:

```
========================================================================================================================
STEP-08 COMPLETION MATRIX (P2-NI-06)
========================================================================================================================
Requirement               | Architecture Decision | Required Implementation      | Owner  | Dep.     | Acceptance Gate
--------------------------+-----------------------+------------------------------+--------+----------+------------------
کنترل همزمانی روی ۹۳ جدول | ADR-001 (Postgres SSoT| migrations/013_universal_   | Chat 2 | Baseline | GATE-08 (Part A):
(Universal OCC Column)    | & Universal Version)  | occ_and_sequences.sql        |        | 0add81fb | استعلام ۹۳ جدول
--------------------------+-----------------------+------------------------------+--------+----------+------------------
دنباله سخت‌افزاری شناسه‌ها | ADR-004 (Zero-Downtime| تعبیه SEQUENCE برای ستون id  | Chat 2 | Baseline | GATE-08 (Part B):
(Atomic Sequences)        | Migration Strategy)   | در تمام ۹۳ جدول مایگریشن ۰۱۳ |        | 0add81fb | nextval اتصال شناسه
--------------------------+-----------------------+------------------------------+--------+----------+------------------
تفکیک کلیدهای OTP در ردیس | ADR-006 (Decoupled    | بازنویسی server/otp-store.js | Chat 2 | Baseline | GATE-08 (Part C):
(Per-Phone Key Isolation) | Per-Phone Key Schema) | و server/auth.js             |        | 0add81fb | حذف payesh:otp:state
--------------------------+-----------------------+------------------------------+--------+----------+------------------
حذف کامل قفل سراسری ورود   | ADR-006 (Elimination  | حذف کامل acquireLock         | Chat 2 | Baseline | GATE-08 (Part D):
(Zero Global Lock)        | of Lock Contention)   | برای کلید otp-state          |        | 0add81fb | صفر خطای Lock Timeout
--------------------------+-----------------------+------------------------------+--------+----------+------------------
رفتار صلب در قطعی ردیس     | ADR-008 (Fail-Closed  | صدور پاسخ ۵۰۳ و عدم تنزل     | Chat 2 | Baseline | GATE-08 (Part E):
(Fail-Closed Verification)| Architecture Truth)   | به فایل موقت یا حافظه رم     |        | 0add81fb | تست قطع ردیس (CH-01)
--------------------------+-----------------------+------------------------------+--------+----------+------------------
راستی‌آزمایی ردتیم مستقل    | ADR-009 (Sequential   | اجرای تست‌های تخریبی         | Chat 3 | Chat 2   | تاییدیه کتبی
(Red Team Sign-off)       | Phase Unlocking)      | TEST-ISO-01 و TEST-ISO-02    |        | Artifacts| Red Team Report
========================================================================================================================
```

---

# ۵. برنامه تفصیلی گام ۰۹ (Step 09 Plan — P2-NI-07)
## استحکام لایه داده REST و پروتکل همگام‌سازی دلتا

* **هدف:** ریشه‌کنی قطعی خطای سرریز حافظه فرآیند (Heap OOM) ناشی از واکشی‌های ۱۰ میلیونی، استقرار صفحه‌بندی کلیدمحور (Keyset Pagination)، و معکوس‌سازی ترتیب کامیت در پروتکل Sync به الگوی Database-First.
* **معماری:**
  - حذف کامل توابع `listLive` و `readCollection` بدون مرز تننت.
  - واکشی کلاس‌ها با اتصال مستقیم (`INNER JOIN enrollments`) به صورت مقید به مدرسه (`school_id = $session_school_id`).
  - ارزیابی دسترسی اولیا با تک‌کوئری `EXISTS` روی جدول `parent_links`.
  - معکوس‌سازی تراکنش `server/sync.js`: ابتدا کامیت روی دیسک PostgreSQL، سپس صدور تاییدیه (ACK) به کلاینت.
  - پوش‌دان کامل فیلترهای دامنه نقش در `server/pull.js` به درون SQL و حذف اتکا به آرایه‌های `store.users`.
* **وابستگی‌ها:** عبور ۱۰۰٪ از گیت `GATE-08`.
* **وظایف Chat 2 (Remediation Tasks):**
  - `TASK-REM-03`: بازنویسی `server/routes/classes.js`، `server/routes/students.js` و `server/routes/analytics.js`.
  - `TASK-REM-04`: بازنویسی چرخه کامیت در `server/sync.js` و فیلترهای دلتا در `server/pull.js`.
* **وظایف Chat 3 (Validation Tasks):**
  - `TEST-ISO-03`: حمله بمب حافظه (OOM Bomb) با ارسال ۵۰۰ درخواست موازی به کلاس‌های حجیم.
  - `TEST-ADV-04`: سناریوی ناهماهنگی چندپادی در دلتای همگام‌سازی و بررسی ارواح رکوردی (Ghost Records).
* **گیت پذیرش (GATE-09):**
  - افزایش حافظه Heap در زمان مشاهده کلاس کمتر از ۲ مگابایت باشد.
  - صفر مورد استعلام از آرایه‌های رم در مسیر همگام‌سازی و زمان پاسخ‌دهی P99 < 30ms.

---

# ۶. برنامه تفصیلی گام ۱۰ (Step 10 Plan — P2-NI-08)
## زیرساخت توزیع‌شده رویدادها و صف پایدار Outbox

* **هدف:** استقرار صف پیام پایدار با قفل ردیفی همروند در دیتابیس، تضمین قطعی صفر داده سوخته (RPO = 0s) در بار امتحانات نهایی (۹,۷۵۰ TPS)، و تفکیک پیام‌های سمی در Dead Letter Queue (DLQ).
* **معماری:**
  - ثبت رویداد و جهش داده در همان تراکنش واحد اتمیک دیتابیس (`Atomic Outbox Pattern`).
  - کارگر صف توزیع‌شده با کوئری `SELECT ... FOR UPDATE SKIP LOCKED` بدون تداخل بین ۲۰۰ پاد.
  - انتقال خودکار پیام‌ها پس از ۵ بار شکست متوالی به جدول ایزوله `server_outbox_dlq`.
  - پیاده‌سازی روت مدیریتی امن جهت بازپخش رویدادها (Replay API).
* **وابستگی‌ها:** عبور ۱۰۰٪ از گیت `GATE-09`.
* **وظایف Chat 2 (Remediation Tasks):**
  - `TASK-REM-05`: تدوین مایگریشن `014_outbox_dlq.sql` و بازنویسی `server/worker.js` و `server/outbox.js`.
* **وظایف Chat 3 (Validation Tasks):**
  - `TEST-ADV-05`: آزمون تزریق بار ۹,۷۵۰ TPS و ارسال همزمان `SIGKILL` به پادهای کارگر؛ بررسی بقای ۱۰۰٪ داده‌ها.
  - `TEST-POISON-01`: تزریق رخداد معیوب و اثبات انتقال آن به DLQ بدون انسداد صف عمومی.
* **گیت پذیرش (GATE-10):**
  - نرخ تخلیه رویدادها به دیتابیس در سقف ۲,۵۰۰ TPS مهار شود.
  - شاخص RPO = 0s با اثبات برابری تعداد رکوردهای ثبت‌شده با رکوردهای پردازش‌شده (`Ingested == Drained`).

---

# ۷. برنامه تفصیلی گام ۱۱ (Step 11 Plan — P2-NI-09)
## سوییچ نهایی ۳۱ استان و اجرای پایلوت زنده فدراسیون

* **هدف:** اتصال ترافیک قناری تمامی ۳۱ استان کشور به کلاسترهای منطقه‌ای ۷ گانه بر بستر زیرساخت بازسازی‌شده با ایزولاسیون جغرافیایی و مانیتورینگ بلادرنگ NOC.
* **معماری:**
  - توزیع ترافیک بر اساس اوزان قناری (۱۰٪، ۲۵٪، ۵۰٪، ۱۰۰٪) تحت مدیریت فابریک ترافیک ملی.
  - تضمین عدم رتبه‌بندی رقابتی مدارس (Zero-Ranking Protection) و مهار واژگان ممنوعه.
  - هماهنگی خودکار سلامت مناطق (Health Sync) و ایزولاسیون کلاسترهای بحران‌زده.
* **وابستگی‌ها:** عبور ۱۰۰٪ از گیت `GATE-10`.
* **وظایف Chat 2 (Remediation Tasks):**
  - `TASK-DEV-06`: یکپارچه‌سازی تله‌متری فدراسیون در `server/infrastructure/national-traffic-fabric.js`.
* **وظایف Chat 3 (Validation Tasks):**
  - `TEST-GEO-01`: آزمون نشت داده‌های بین‌منطقه‌ای و بررسی اقامت داده‌ها (Data Residency).
  - `TEST-RANK-01`: آزمون تزریق کلیدواژه‌های ممنوعه رتبه‌بندی و اثبات بلاک شدن درخواست‌ها با کد ۴۰۰.
* **گیت پذیرش (GATE-11):**
  - توزیع موفق ترافیک ۳۱ استان با انطباق خطای زیر ۱٪ نسبت به وزن‌های مصوب قناری.
  - سبز بودن تمامی شاخص‌های سطح خدمت (SLO) در رصدخانه ملی عملیات.

---

# ۸. برنامه تفصیلی گام ۱۲ (Step 12 Plan — P2-NI-10)
## اعتبارسنجی نهایی زیرساخت فیزیکی و تحویل رسمی تولید

* **هدف:** اجرای پروتکل رسمی آزمون‌های یکپارچگی شبکه و دیسک در محیط فیزیکی استیجینگ (Mode B)، تایید ۶ ستون آمادگی تولید و تحویل رسمی سامانه به مرکز عملیات ملی.
* **معماری:**
  - استقرار ۴ پاد کانتینری، کلاستر ۳ گره‌ای PostgreSQL، ردیس سنتینل و کلاستر تزریق بار k6.
  - شبیه‌سازی تاخیرهای دیسک سخت و افت پکت شبکه.
  - ارزیابی رسمی شاخص‌های: تاخیر P95 < 300ms، تاخیر P99 < 1000ms، و توان عملیاتی ۲۰,۰۰۰ RPS.
* **وابستگی‌ها:** عبور ۱۰۰٪ از گیت‌های ۰۸ تا ۱۱.
* **گیت نهایی آمادگی تولید (GATE-12: Master Production Certification):**
  - تاییدیه مستقل Chat 3 مبنی بر قبولی در آزمون بار ۲۰k RPS متصل به سرور فیزیکی.
  - صدور سند نهایی **`🟢 PRODUCTION CERTIFIED`** با امضای مشترک معمار سیستم و ردتیم.

---

# ۹. گراف جامع وابستگی فاز ۵ (Phase 5 Development DAG)

```
[Baseline Commit: 0add81fb]
          │
          ▼
   [STEP 08 (P2-NI-06)]
   ├─► BLK-07 (Universal OCC on 93 Tables)
   └─► BLK-04 (Decoupled Redis OTP Keying)
          │
          ▼ [GATE-08 Passed]
   [STEP 09 (P2-NI-07)]
   ├─► BLK-01 / BLK-02 (REST Data Access Hardening)
   └─► BLK-03 / BLK-06 (Database-First Sync Engine)
          │
          ▼ [GATE-09 Passed]
   [STEP 10 (P2-NI-08)]
   └─► BLK-05 (Distributed Outbox SKIP LOCKED & DLQ)
          │
          ▼ [GATE-10 Passed]
   [STEP 11 (P2-NI-09)]
   └─► 31-Province Live Federation Traffic Cutover
          │
          ▼ [GATE-11 Passed]
   [STEP 12 (P2-NI-10)]
   └─► BLK-08 (Mode B Physical Cluster Validation)
          │
          ▼ [GATE-12 Passed]
[🟢 PRODUCTION READY CERTIFICATION]
```

---

# ۱۰. تصمیمات جدید معماری و گیت بعدی معمار (Architecture Decisions & Next Gate)

```
========================================================================================
NEW ARCHITECTURE DECISION RECORDS (ADR-011 & ADR-012)
========================================================================================

[ADR-011] Strict Boundary Isolation between Transactional Outbox and Event Stream:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: پایگاه داده PostgreSQL منحصراً وظیفه بافر و تضمین دوام رخدادها را بر عهده دارد.
          ارسال پیامک‌ها، نوتفیکیشن‌ها و پردازش‌های سنگین نباید درون تراکنش اصلی کلاینت اجرا شوند.
  - دلیل: جلوگیری از طولانی شدن زمان قفل تراکنش‌ها (Lock Hold Time) در دیتابیس Primary.
  - اثر: آزادسازی آنی کانکشن‌های استخر اتصالات و حفظ توان عملیاتی اینگرس در سقف ۲۰,۰۰۰ RPS.

[ADR-012] Mandatory Human Authorization for Cross-Region Evacuation:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: هیچ فرآیند خودکاری حق انتقال کامل ترافیک یک استان به استان دیگر را در زمان بحران ندارد؛
          انتقال ترافیک منطقه‌ای منحصراً نیازمند تایید دومرحله‌ای اپراتور مجاز NOC در سیستم است.
  - دلیل: مهار خطاهای آبشاری (Cascading Failures) و جلوگیری از سرریز بار به کلاسترهای مجاور.
  - اثر: تضمین صلب حاکمیت انسانی بر زیرساخت ملی آموزش و پرورش.
========================================================================================
```

---

# ابلاغیه وضعیت نهایی معماری توسعه پایش

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     PAYESH DEVELOPMENT LIFECYCLE STATUS:                           ║
║                                                                                    ║
║                           🟡 ACTIVE DEVELOPMENT                                    ║
║                                                                                    ║
║               PHASE 5 EXECUTION PLAN V3.0 OFFICIALLY REGISTERED                    ║
║               AWAITING CHAT 2 IMPLEMENTATION ARTIFACTS FOR GATE-08                 ║
║               CHAT 3 ADVERSARIAL HARNESS STANDBY FOR STAGE 1 ATTACKS               ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

1. سند **`docs/ARCHITECTURE/PHASE_5_EXECUTION_PLAN_V3.md`** به عنوان مرجع قطعی هدایت و قفل‌گشایی گام‌های ۰۸ تا ۱۲ در مخزن به ثبت رسید.
2. تیم **Chat 2** موظف است پچ‌های اجرایی `TASK-REM-01` و `TASK-REM-02` را جهت ارزیابی در گیت `GATE-08` ارائه دهد.
3. تیم **Chat 3** بر روی کدهای مبنا و پچ‌های دریافتی، سناریوهای تخریبی `TEST-ISO-01` و `TEST-ISO-02` را اجرا خواهد نمود.
4. مسیر توسعه فعال است و با عبور از هر گیت، گام بعدی به صورت ترتیبی فعال خواهد شد.
