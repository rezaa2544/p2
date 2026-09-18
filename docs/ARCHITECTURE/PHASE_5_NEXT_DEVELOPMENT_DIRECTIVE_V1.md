# ابلاغیه رسمی هدایت مسیر توسعه فاز ۵ سامانه ملی پایش
## PHASE 5 NEXT DEVELOPMENT DIRECTIVE (V1.0)

**صادرکننده:** دفتر معمار ارشد سیستم و مالک نقشه راه توسعه (Chief System Architect & Development Roadmap Owner) — Chat 1  
**تاریخ صدور و ابلاغ:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 1.0.0-DEV-DIRECTIVE  
**کامیت رسمی مبنا:** `0add81fbc8a7f7888f7072096ef67938d8a5a006`  
**وضعیت حاکمیتی مسیر توسعه:** **`🟡 ACTIVE DEVELOPMENT — WAITING_GATE_08`**  

---

# ۱. خلاصه مدیریتی و هدف ابلاغیه (Executive Objective)

این ابلاغیه مسیر توسعه فاز ۵ را پس از تدوین فونداسیون معماری به مرحله **مدیریت ترتیبی گام‌ها و کنترل صلب وابستگی‌ها** هدایت می‌کند:
1. **گام ۰۸ (`P2-NI-06`):** وضعیت گیت `GATE-08` رسماً در سند `docs/ARCHITECTURE/STEP_08_GATE_TRACKING_V1.md` مستقر و در انتظار تحویل کارهای Chat 2 و آزمون‌های Chat 3 قرار گرفت.
2. **گام ۰۹ (`P2-NI-07`):** برنامه اجرایی و معماری استحکام لایه داده REST و پروتکل همگام‌سازی دیتابیس-محور در سند `docs/ARCHITECTURE/STEP_09_EXECUTION_PLAN_V1.md` آماده‌سازی شد و تا زمان احراز گیت ۰۸ در حالت **انجماد صلب (FROZEN)** باقی می‌ماند.
3. **تفکیک کامل وظایف:** صف‌های کاری Chat 2 و صف‌های آزمون Chat 3 رسماً تثبیت شدند.

---

# ۲. تابلوی صف وظایف آتی تیم پیاده‌سازی (Chat 2 Task Queue)

Chat 2 منحصراً مجاز به دریافت و اجرای وظایف از این صف به صورت ترتیبی است:

```
========================================================================================
CHAT 2 OFFICIAL DISPATCHED QUEUE
========================================================================================

[TASK-REM-01: Universal OCC Migration 013]
  OWNER: Chat 2
  SCOPE: migrations/013_universal_occ_and_sequences.sql, migrations/013_...down.sql
  TARGET FILES: migrations/013_universal_occ_and_sequences.sql
  FORBIDDEN CHANGES: دست‌کاری در جداول موجود بدون IF NOT EXISTS؛ ایجاد قفل انحصاری جدول.
  REQUIRED EVIDENCE: خروجی کاتالوگ دیتابیس روی ۹۳ جدول؛ گزارش تست رول‌بک تمیز.
  ACCEPTANCE GATE: GATE-08 (Part A & B).

----------------------------------------------------------------------------------------
[TASK-REM-02: Distributed OTP Decoupling & Redis Key Splitting]
  OWNER: Chat 2
  SCOPE: server/otp-store.js, server/auth.js, server/cache.js
  TARGET FILES: server/otp-store.js, server/auth.js
  FORBIDDEN CHANGES: حفظ کلید سراسری payesh:otp:state؛ تنزل به فایل محلی در قطعی ردیس.
  REQUIRED EVIDENCE: لاگ دستورات اتمیک ردیس بر مبنای هش شماره؛ تست Fail-Closed.
  ACCEPTANCE GATE: GATE-08 (Part C, D, E).

----------------------------------------------------------------------------------------
[TASK-REM-03: REST Data Access Hardening (FROZEN UNTIL GATE-08)]
  OWNER: Chat 2
  SCOPE: server/routes/classes.js, server/routes/students.js, server/routes/analytics.js
  TARGET FILES: server/routes/classes.js, server/routes/students.js, server/routes/analytics.js
  FORBIDDEN CHANGES: لود کامل کاربران با listLive یا readCollection؛ کش کردن در رم.
  REQUIRED EVIDENCE: تست بار مشاهده کلاس با افزایش حافظه Heap کمتر از ۲ مگابایت.
  ACCEPTANCE GATE: GATE-09 (Part A).

----------------------------------------------------------------------------------------
[TASK-REM-04: Database-First Sync Engine (FROZEN UNTIL GATE-08)]
  OWNER: Chat 2
  SCOPE: server/sync.js, server/pull.js, server/conflicts.js
  TARGET FILES: server/sync.js, server/pull.js, server/conflicts.js
  FORBIDDEN CHANGES: صدور پاسخ موفق قبل از COMMIT دیتابیس؛ استفاده از store.users در دلتا.
  REQUIRED EVIDENCE: تست ثبت در پاد A و دریافت آنی در پاد B بدون اشتراک حافظه.
  ACCEPTANCE GATE: GATE-09 (Part B).
========================================================================================
```

---

# ۳. تابلوی صف آزمون‌های تخریبی ردتیم (Chat 3 Validation Queue)

Chat 3 موظف است سناریوهای تخریبی را به صورت دومرحله‌ای اجرا کند:

```
========================================================================================
CHAT 3 OFFICIAL VALIDATION QUEUE
========================================================================================

[TEST-ISO-01: Universal OCC Race & Naked UPDATE Injection]
  OBJECTIVE: جلوگیری از رونویسی تصادفی نمرات و اطلاعات مدارس.
  INPUT: ۵۰ جهش موازی همزمان به یک رکورد با version = 1.
  ATTACK METHOD: Concurrent Race Condition Injection via HTTP / DB Client.
  EXPECTED SECURE BEHAVIOR: دقیقاً ۱ درخواست اعمال شود و ۴۹ درخواست با کد ۴۰۹ مسدود شوند.
  FAILURE CONDITION: پذیرش بیش از ۱ درخواست یا جهش نسخه به مقداری به جز ۲.
  REQUIRED EVIDENCE: لاگ پایگاه داده PostgreSQL و شمارش سطرهای تغییریافته.

----------------------------------------------------------------------------------------
[TEST-ISO-02: OTP Concurrency Flood & Redis Disconnect Fail-Closed]
  OBJECTIVE: اثبات حذف قفل سراسری و مقیاس‌پذیری افقی ورود.
  INPUT: ۳,۰۰۰ درخواست ورود در ثانیه برای ۱,۰۰۰ شماره مجزا.
  ATTACK METHOD: Distributed Lock Contention Flood & Network Disconnect.
  EXPECTED SECURE BEHAVIOR: تاخیر زیر ۳۰ms؛ در زمان قطع ردیس پاسخ صلب ۵۰۳ صادر شود.
  FAILURE CONDITION: ایجاد تاخیر بیش از ۵۰ms به دلیل قفل مشترک یا نشت کدها.
  REQUIRED EVIDENCE: گراف تاخیر P99 ردیس و لاگ پکت‌های ردوبدل‌شده.

----------------------------------------------------------------------------------------
[TEST-ISO-03: Class & Student Heap Memory OOM Bomb (STANDBY FOR STEP 09)]
  OBJECTIVE: اثبات عدم سقوط فرآیند در مشاهده کلاس‌ها.
  INPUT: ۵۰۰ درخواست همزمان مشاهده کلاس‌های ۱۰۰ نفره.
  ATTACK METHOD: Parallel Large-Entity Heap Exhaustion.
  EXPECTED SECURE BEHAVIOR: مصرف حافظه Heap زیر ۲ مگابایت افزایش یابد؛ P99 < 30ms.
  FAILURE CONDITION: رخداد خطای Heap Out of Memory یا افزایش یکنواخت رم فرآیند.
  REQUIRED EVIDENCE: لاگ Heap Profiler و تفکیک فضای اشغال‌شده اشیاء V8.

----------------------------------------------------------------------------------------
[TEST-ADV-04: Multi-Pod Delta State Drift (STANDBY FOR STEP 09)]
  OBJECTIVE: تضمین همگام‌سازی واقعی در کلاستر چندپادی بدون اشتراک حافظه.
  INPUT: ثبت رکورد در پاد ۱ و استعلام همگام‌سازی دلتا از پاد ۲.
  ATTACK METHOD: Split-Pod Delta Request Interception.
  EXPECTED SECURE BEHAVIOR: بازگشت قطعی رکورد ثبت‌شده در پاد ۱ توسط پاد ۲.
  FAILURE CONDITION: گم شدن رکورد در پاد ۲ یا بازگشت نسخه منقضی.
  REQUIRED EVIDENCE: هش اعتبارسنجی بسته‌های دلتا قبل و بعد از جهش.
========================================================================================
```

---

# ۴. تصمیم رسمی حاکمیت معماری (Official Architecture Decision)

دفتر معمار ارشد سیستم تصمیم زیر را رسماً صادر و ابلاغ می‌نماید:

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     OFFICIAL ARCHITECTURE DECISION RECORD                          ║
║                                                                                    ║
║                 STATUS: 🟡 ACTIVE DEVELOPMENT — WAITING_GATE_08                    ║
║                                                                                    ║
║   1. گام ۰۸ (P2-NI-06) در وضعیت فعال و در انتظار دریافت شواهد است.                ║
│   2. ورود به گام ۰۹ منحصراً منوط به صدور تاییدیه GATE-08 است.                     │
│   3. هرگونه دست‌کاری تست‌ها یا شبیه‌سازی ماک بدون زیرساخت واقعی مردود است.        │
║   4. وضعیت سامانه تا پایان فاز ۵: NOT PRODUCTION READY UNTIL VERIFIED              ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

### خلاصه دستورات پایانی:
* **تیم Chat 2:** خروجی‌های پیاده‌سازی `TASK-REM-01` و `TASK-REM-02` را جهت ارزیابی در گیت `GATE-08` تحویل دهد.
* **تیم Chat 3:** بر اساس سناریوهای `TEST-ISO-01` و `TEST-ISO-02` به پچ‌های تحویلی حمله نموده و شواهد را ثبت کند.
* **مسیر توسعه فاز ۵:** در آمادگی کامل برای گام‌های ۰۹ تا ۱۲ مستقر گردید.
