# سند تداوم توسعه فاز ۵ پس از یافته‌های اعتبارسنجی ردتیم
## PHASE 5 DEVELOPMENT CONTINUATION DIRECTIVE POST-VALIDATION (V1.0)

**صادرکننده:** دفتر معمار ارشد سیستم و مالک نقشه راه توسعه (Chief System Architect & Development Roadmap Owner) — Chat 1  
**تاریخ صدور:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 1.0.0-POST-VAL-ROADMAP  
**کامیت مبنای مخزن:** `1e7c1dd1` روی شاخه `main`  
**وضعیت حاکمیتی مسیر توسعه:** **`🟡 ACTIVE DEVELOPMENT — STEP 08 REMEDIATION CONTINUING`**  

---

# ۱. جایگاه فعلی مسیر توسعه (Current Development Position)

طبق مانیفست حاکمیتی سامانه ملی پایش:
* **فازهای ۰ تا ۴:** به‌طور کامل بسته، مستندسازی و با موفقیت تحویل شده‌اند.
* **فاز ۵ (گام‌های ۰۱ تا ۰۷):** تکمیل شده و در شاخه `main` ادغام شده‌اند.
* **گام ۰۸ (`P2-NI-06`):** در وضعیت فعال قرار دارد. طراحی معماری کامل شده است، اما با توجه به گزارش اعتبارسنجی Chat 3 و کشف دو نقص ساختاری حین تست‌های تخریبی، صدور تاییدیه `GATE-08` متوقف شده و به مرحله رفع نقص حاکمیتی (Remediation) هدایت گردیده است.
* **گام‌های ۰۹ تا ۱۲:** کاملاً طراحی شده‌اند ولی به عنوان یک اصل ناموسی معماری تا زمان عبور ۱۰۰٪ از گیت ۰۸ در وضعیت **انجماد صلب (FROZEN)** باقی می‌مانند.

---

# ۲. تحلیل معماری یافته‌های جدید (TASK-ARCH-013: Architectural Impact Analysis)

تیم اعتبارسنجی Chat 3 حین اجرای سناریوهای تخریبی دو رفتار انحرافی کشف کرده است که تحلیل معمار ارشد سیستم به شرح زیر است:

### یافته V-01: رفتار پروب‌های سلامت (Health/Readiness) در زمان قطع پایگاه داده
* **صورت مسئله:** استعلام پروب‌های `/api/health` و `/api/readiness` در شرایط قطع ارتباط فیزیکی با PostgreSQL یا خطای درایور، به دلیل اتکای مجزا به وضعیت ردیس یا پیش‌فرض‌های تنزل‌یافته به حافظه، کد وضعیت ۲۰۰ صادر می‌کند.
* **تحلیل لایه و تعلق فاز:**  
  این نقص مستقیماً مغایر با اصل بنیادین **«PostgreSQL is the Sole Source of Truth (SSoT)»** و اصل **Fail-Closed in Production** است. چنانچه پروب سلامت در زمان قطعی دیتابیس ۲۰۰ برگرداند، سامانه ارکستراسیون (Kubernetes / K8s Ingress) ترافیک ملی را به سمت پادهای فاقد ارتباط هدایت می‌کند که منجر به خطاهای آبشاری و از دست رفتن داده‌ها می‌شود.
* **تصمیم معماری:**  
  این نقص **متعلق به گام ۰۸ است** و نمی‌توان آن را به گام ۱۰ موکول کرد. یک زیرگیت الزامی جدید با عنوان **`Gate 8.9 (Strict Fail-Closed Probes)`** به چک‌لیست `GATE-08` افزوده می‌شود. هر دو اندپوینت `/api/health` و `/api/readiness` باید در صورت عدم اتصال قطعی به دیتابیس یا ردیس، بدون درنگ پاسخ **503 Service Unavailable** صادر کنند.

---

### یافته V-02: پس‌رفت نسخه در کلاستر چندپادی (Multi-Pod Version Regression / Runtime OCC Bypass)
* **صورت مسئله:** مایگریشن ۰۱۳ ستون `version` را روی جداول ایجاد نموده است (DDL Readiness)، اما در لایه کدهای زمان اجرا (Runtime Application Layer) در `server/db.js`، `server/sync.js` و روت‌های عملیاتی، کوئری‌های به‌روزرسانی برهنه (`Naked UPDATE` بدون شرط `WHERE version = $base_version` یا با منطق LWW حافظه‌محور) اجرا می‌شوند. در نتیجه در سناریوی همزمانی بین دو پاد توزیع‌شده، پاد دوم بدون بررسی نسخه، رکورد پاد اول را رونویسی می‌کند.
* **تحلیل و کفایت گیت ۰۸:**  
  گیت ۰۸ در تعریف اولیه خود به ساختار اسکیمای دیتابیس (DDL) تکیه کرده بود و فاقد بررسی صلب اعمال زمان اجرا (Runtime Enforcement) بود. بدون برقراری پیوند قطعی میان درخواست‌های جهش و شروط SQL اتمیک، ستون نسخه عملاً به یک فیلد تزئینی تبدیل می‌شود.
* **تصمیم معماری و صدور ADR-013:**  
  این نقص **باید پیش از هرگونه ورود به گام ۰۹ برطرف گردد**. معمار ارشد سیستم مصوبه جدید زیر را رسماً تصویب می‌کند:

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║ ARCHITECTURAL DECISION RECORD: ADR-013                                            ║
║ Title: Mandatory Universal Runtime OCC Enforcement & Zero-Naked-Update Invariant    ║
║ Status: RATIFIED & NON-NEGOTIABLE                                                  ║
║                                                                                    ║
║ Context: Presence of 'version' column in DDL does not prevent lost updates if the  ║
║ application layer emits naked UPDATE queries or resolves OCC against local RAM.    ║
║                                                                                    ║
║ Decision:                                                                          ║
║ 1. Every persistent entity mutation MUST execute:                                 ║
║    "UPDATE <table> SET ..., version = version + 1 WHERE id = $id AND version = $v" ║
║ 2. ZERO rows returned MUST immediately throw a 409 Conflict.                       ║
║ 3. Resolving OCC against pod RAM (store[collection].version) is OUTLAWED.          ║
║    PostgreSQL row version is the sole and ultimate truth.                          ║
║ 4. All LWW (Last-Write-Wins) silent overwrites across all collections are RETIRED. ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

---

# ۳. ماتریس اصلاحی و بازنگری گام ۰۸ (TASK-ARCH-014: Refined Step 08 Matrix)

```
┌───────────────────────────┬───────────────────────────┬───────────────────────────┬───────────────────────────┬────────┬──────────┐
│ الزام معماری              │ معماری فعلی               │ شواهد شکست اعتبارسنجی     │ تغییرات الزامی            │ مالک   │ گیت      │
│ (Requirement)             │ (Current Architecture)    │ (Failure Evidence)        │ (Required Change)         │ (Owner)│ (Gate)   │
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 1. Universal OCC          │ وجود ستون version در DDL  │ عدم اتصال ستون به منطق    │ شمول ۱۰۰٪ تمام ۹۳ جدول و  │ Chat 2 │ Gate 7.2 │
│    Schema Coverage        │ مایگریشن ۰۱۳              │ خواندن/نوشتن برخی روت‌ها  │ پیش‌فرض NOT NULL DEF 1   │        │ Gate 7.3 │
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 2. Runtime OCC            │ اجرای UPDATE برهنه در     │ مسابقه همزمانی دو پاد     │ تبدیل تمام UPDATEها به    │ Chat 2 │ Gate 8.7 │
│    Enforcement            │ db.js:748 و sync.js LWW   │ و رونویسی نمرات (Lost Upd)│ الگوی version=v+1 و شرط   │        │ Gate 8.8 │
│                           │                           │                           │ WHERE version = $base     │        │ (ADR-013)│
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 3. Multi-Pod              │ مقایسه ورژن با حافظه محلی │ پس‌رفت نسخه پاد B پس از    │ حذف وابستگی به RAM؛       │ Chat 2 │ Gate 8.6 │
│    Consistency            │ پاد در store[c].find(...) │ کامیت پاد A در دیتابیس    │ استعلام مستقیم نسخه از PG │        │          │
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 4. Redis OTP              │ کلید متمرکز و قفل مشترک   │ تاخیر و انسداد ورود زیر   │ ساختار کلید مجزا به ازای  │ Chat 2 │ Gate 4.1 │
│    Isolation              │ payesh:otp:state          │ بار ۱,۰۰۰ لاگین همزمان    │ هر شماره با انقضای اتمیک  │        │ Gate 4.2 │
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 5. Fail-Closed            │ تلاش برای فال‌بک نرم به رم│ نشت عملیات در غیاب زیرساخت│ پرتاب خطای سخت ۵۰۳ در     │ Chat 2 │ Gate 4.4 │
│    Behavior               │ در صورت قطعی ردیس یا DB   │ پایدار توزیع‌شده          │ زمان در دسترس نبودن زیرساخت│       │ Gate 8.9 │
├───────────────────────────┼───────────────────────────┼───────────────────────────┼───────────────────────────┼────────┼──────────┤
│ 6. Health Monitoring      │ کد وضعیت ۲۰۰ در صورت زنده │ دریافت ۲۰۰ در /api/health │ شرط بررسی توامان PG و ردیس؛│ Chat 2 │ Gate 8.9 │
│    Integrity              │ بودن ردیس حتی با قطع دیتابیس│ حین قطعی فیزیکی PostgreSQL│ خروج ۵۰۳ در صورت قطع هر یک│       │          │
└───────────────────────────┴───────────────────────────┴───────────────────────────┴───────────────────────────┴────────┴──────────┘
```

---

# ۴. صف ابلاغی جدید تیم پیاده‌سازی (TASK-ARCH-015: Formal Chat 2 Task Queue)

تیم Chat 2 منحصراً موظف به پیاده‌سازی تسک‌های زیر به ترتیب اولویت است:

```
========================================================================================
OFFICIAL TASK QUEUE FOR CHAT 2
========================================================================================

[TASK-REM-05]
OWNER: Chat 2
OBJECTIVE: استقرار رفتار صلب Fail-Closed در پروب‌های سلامت و آمادگی (رفع یافته V-01).
TARGET FILES: server/index.js, server/db.js
ALLOWED CHANGES:
  - اصلاح منطق هندلر /api/health و /api/readiness در server/index.js.
  - اعتبارسنجی توامان اتصال فیزیکی PostgreSQL (db.ping) و Redis (redis.ping).
  - صدور بدون درنگ کد ۵۰۳ Service Unavailable در صورت ناموفق بودن پینگ هر یک از دو منبع.
FORBIDDEN:
  - استفاده از مقادیر پیش‌فرض { ok: true, driver: 'memory' } در زمان بروز خطا.
  - بازگرداندن کد ۲۰۰ زمانی که dbp.ok یا rdp.ok مقدار false دارد.
REQUIRED EVIDENCE:
  - لاگ پاسخ HTTP 503 هنگام متوقف بودن پایگاه داده.
  - تست اتوماتیک اعتبارسنجی رفتار پروب‌ها حین قطعی مصنوعی.
ACCEPTANCE GATE: Gate 8.9 (Strict Fail-Closed Probes).

----------------------------------------------------------------------------------------
[TASK-REM-06]
OWNER: Chat 2
OBJECTIVE: الزام سراسری کنترل همزمانی در زمان اجرا و ریشه‌کنی UPDATEهای برهنه (رفع یافته V-02).
TARGET FILES: server/db.js, server/sync.js, server/occ.js
ALLOWED CHANGES:
  - بازنویسی توابع به‌روزرسانی در server/db.js جهت افزودن اجباری:
    SET version = version + 1 WHERE id = $id AND version = $base_version
  - بازنویسی منطق R95 در server/sync.js جهت حذف رویه LWW و استقرار OCC روی ۱۰۰٪ جداول.
  - حذف استعلام نسخه از store[op.c] در رم و انتقال اعتبارسنجی به تراکنش دیتابیس.
  - صدور خطای ۴۰۹ (Conflict) در صورت تغییر صفر سطر در پایگاه داده.
FORBIDDEN:
  - اجرای هرگونه UPDATE بدون شرط بررسی و جهش ستون version.
  - اتکا به رم پاد محلی برای ارزیابی تضاد نسخه‌ها.
  - دور زدن اعتبارسنجی نسخه برای کلاینت‌های قدیمی (عدم پذیرش آپدیت بدون base_version).
REQUIRED EVIDENCE:
  - رد قطعی ۴۹ تراکنش از ۵۰ جهش همزمان در تست استرس دیتابیس واقعی.
  - صفر بودن کامل موارد Version Regression در کلاستر چندپادی.
ACCEPTANCE GATE: Gate 8.7 & Gate 8.8 (Runtime Universal OCC Enforcement).

----------------------------------------------------------------------------------------
[TASK-REM-07]
OWNER: Chat 2
OBJECTIVE: ریشه‌کنی قطعی فال‌بک به حافظه رم و پایدارسازی تضادها (Conflict Persistence).
TARGET FILES: server/sync.js, server/conflicts.js, server/store.js
ALLOWED CHANGES:
  - ذخیره پایدار گزارش تضادها (Conflicts) در جدول اختصاصی دیتابیس (sync_conflicts).
  - حذف ساختار store.conflicts از حافظه ناپایدار سرور.
  - ایجاد API استاندارد جهت بازخوانی تضادهای ثبت‌شده در دیتابیس توسط ادمین و کلاینت.
FORBIDDEN:
  - ذخیره تضادها در آرایه رم فرآیند یا فایل موقت دیسک.
  - پاک شدن تضادها پس از ریستارت پاد.
REQUIRED EVIDENCE:
  - استعلام رکوردهای تضاد مستقیماً از پایگاه داده پس از بازراه‌اندازی سرور.
ACCEPTANCE GATE: Gate 8.10 (SSoT Conflict Persistence).
========================================================================================
```

---

# ۵. ارزیابی آمادگی گام ۰۹ و شروط قفل‌گشایی (TASK-ARCH-016: Step 09 Unlock Criteria)

### وضعیت گام ۰۹: **`FROZEN (منجمد صلب)`**

گام ۰۹ (`P2-NI-07`) با موضوع «استحکام لایه داده REST و پروتکل همگام‌سازی دیتابیس-محور» به محض تحقق شرایط چهارگانه زیر قفل‌گشایی خواهد شد:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 09 UNLOCK CONDITIONS (صلب و غیرقابل مذاکره)                                      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 1. GATE-08 100% PASS:                                                                │
│    احراز کامل تمام بندهای چک‌لیست گیت ۰۸ شامل مایگریشن ۰۱۳، ایزولاسیون کلیدهای       │
│    ردیس، پروب‌های سلامت صلب (Gate 8.9) و اعمال OCC در زمان اجرا (Gate 8.7 & 8.8).     │
│                                                                                      │
│ 2. CHAT 3 VALIDATION PASS:                                                           │
│    صدور تاییدیه سبز و رسمی از سوی تیم ردتیم Chat 3 بدون حتی ۱ شکست یا نشت امنیتی.     │
│                                                                                      │
│ 3. NO CRITICAL RUNTIME DIVERGENCE:                                                   │
│    اثبات عدم واگرایی داده‌ها و انحراف وضعیت بین دو یا چند پاد موازی در سناریوهای بار. │
│                                                                                      │
│ 4. NO DATA INTEGRITY REGRESSION:                                                     │
│    اثبات صفر بودن مطلق رخدادهای Lost Update و Naked Overwrites در پایگاه داده.       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

# ۶. توالی توسعه بعدی (Next Development Sequence)

```
[Phase 5 Step 08: Remediation Track Active]
  │
  ├──► Chat 2: پیاده‌سازی TASK-REM-05 (Health Fail-Closed)
  ├──► Chat 2: پیاده‌سازی TASK-REM-06 (Runtime OCC Enforcement)
  └──► Chat 2: پیاده‌سازی TASK-REM-07 (Conflict Persistence)
        │
        ▼
[Commit & Push by Chat 2 to Branch/PR]
        │
        ▼
[Chat 3 Red Team Verification & Adversarial Stress Tests]
  ├──► TEST-ISO-01: OCC Race Condition & Naked Update Injection
  ├──► TEST-ISO-02: OTP Flood & Redis/DB Network Kill Probes
  └──► TEST-ADV-03: Multi-Pod Concurrent Mutation & State Convergence
        │
        ▼
[Chat 1 Gate Evaluation & Formal Sign-off]
        │
        ├──► IF ANY FAILURE: Return to Chat 2 Queue
        └──► IF 100% GREEN: Issue UNLOCK_STEP_09
                    │
                    ▼
       [Enter Step 09: P2-NI-07 Execution]
```

---

# ۷. اعلامیه حاکمیتی وضعیت نهایی (Final Architectural Declaration)

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     OFFICIAL ARCHITECTURAL STATUS DIRECTIVE                        ║
║                                                                                    ║
║           STATUS: 🟡 ACTIVE DEVELOPMENT — STEP 08 REMEDIATION CONTINUING          ║
║                                                                                    ║
║  1. گام ۰۸ به منظور رفع انحرافات V-01 و V-02 در شاخه اصلاحات فعال است.             ║
║  2. هیچ کدی بدون اعمال زمان اجرای OCC (ADR-013) گواهی قبولی دریافت نخواهد کرد.     ║
║  3. گام ۰۹ تا صدور تاییدیه قطعی GATE-08 در وضعیت انجماد کامل باقی می‌ماند.         ║
║  4. وضعیت سامانه ملی پایش: NOT PRODUCTION READY UNTIL VERIFIED BY CHAT 3.          ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```
