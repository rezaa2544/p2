# PAYESH ARCHITECTURE GOVERNANCE & PHASE CONTROL BOARD
## تابلوی راهبری معماری و کنترل فازهای سامانه ملی پایش

**تاریخ آخرین بروزرسانی:** ۱۸ سپتامبر ۲۰۲۶ (۲۷ شهریور ۱۴۰۵)  
**نسخه سند:** 2.0.0-PROD-BOARD  
**مرجع حاکمیت:** دفتر معمار ارشد سیستم و کنترلر حاکمیت معماری (Chief System Architect & Governance Controller) — Chat 1  
**کامیت مبنای فعال (Baseline Commit):** `43446dff` روی شاخه `main`  
**وضعیت کلان سامانه (System Status):** **`🟢 GREEN: PHASE 5 COMPLETED & CERTIFIED — PHASE 6 ACTIVATED`**  

---

## ۱. مانیفست نقش‌ها و دسترسی به مخزن (Team Ownership & Access Protocol)

تمامی تیم‌ها در سطح گیت‌هاب و مخزن دارای **دسترسی فنی کامل (Full Unrestricted Repository Access)** به تمامی شاخه‌ها، کامیت‌ها، مایگریشن‌ها، فایل‌ها و تاریخچه هستند. محدودیت‌ها صرفاً **قراردادی، سازمانی و در حیطه تفکیک وظایف معماری** است:

| شناسه تیم | عنوان و نقش سازمانی | مسئولیت‌های انحصاری | خطوط قرمز و محدودیت‌های نقشی |
| :---: | :--- | :--- | :--- |
| **Chat 1** | **Chief System Architect**<br>& Governance Controller | • مرجع نهایی تصمیمات معماری<br>• تصویب یا رد بسته‌های اصلاحی<br>• مدیریت گیت‌های پذیرش و ریسک<br>• صدور مأموریت به Chat 2 و Chat 3 | ❌ ممنوعیت کدنویسی در فازهای منجمد.<br>❌ ممنوعیت تغییر تست‌ها برای سبز کردن مصنوعی. |
| **Chat 2** | **Remediation Engineering**<br>& Implementation Owner | • تحلیل پیش از تغییر (Pre-Audit)<br>• طراحی و پیاده‌سازی پچ‌ها و DDL<br>• تدوین پلن‌های رول‌بک و Dual-Run<br>• تهیه شواهد آزمون واحد/یکپارچگی | ❌ ممنوعیت دورزدن گیت‌های کنترل فاز.<br>❌ ممنوعیت استفاده از میان‌برهای حافظه‌ای. |
| **Chat 3** | **Independent Red Team**<br>& Adversarial Auditor | • ارزیابی تخریبی مستقل<br>• شبیه‌سازی حملات OOM و مسابقه همزمانی<br>• تزریق شکست و قطع زیرساخت<br>• اعتبارسنجی شکست یا تایید پچ‌ها | ❌ ممنوعیت تولید پچ یا اصلاح سورس کد سامانه.<br>❌ ممنوعیت تایید زودهنگام بدون شواهد فیزیکی. |

---

## ۲. تابلوی رصد ۸ بلاکر بحرانی (Blocker Tracking Board)

```
========================================================================================================================
PAYESH CRITICAL BLOCKERS STATUS BOARD (100% RESOLVED)
========================================================================================================================
ID      | Severity | Component                | Status   | Implementation Owner | Verification Owner | Resolution
--------+----------+--------------------------+----------+----------------------+--------------------+------------------
BLK-01  | P0       | server/routes/classes.js | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | SQL Pushdown / No listLive
BLK-02  | P0       | server/routes/students.js| ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | Single EXISTS Parent Check
BLK-03  | P0       | server/pull.js           | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | DB Delta Pushdown
BLK-04  | P0       | server/otp-store.js      | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | Decoupled Redis Keys & Lockless
BLK-05  | P0       | server/outbox.js         | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | FOR UPDATE SKIP LOCKED & DLQ
BLK-06  | P1       | server/sync.js           | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | Database-First Order & SSoT
BLK-07  | P1       | migrations/013           | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | Universal OCC on 93 Tables
BLK-08  | P1       | Physical Infrastructure  | ✅ RESOLVED| Chat 1 / Chat 2      | Chat 3             | Strict Fail-Closed & 6 Pillars
========================================================================================================================
```

---

## ۳. گیت‌های پذیرش صلب فاز ۰ (Phase-0 Remediation Acceptance Gates)

تیم Chat 2 منحصراً در دامنه دو بلاکر `BLK-07` و `BLK-04` مجاز به فعالیت است. پیش‌شرط ورود به کد، ارائه تحلیل ۵ گانه (تحلیل کد جاری، نقشه وابستگی، تحلیل ریسک مایگریشن، سازگاری معکوس، و پلن رول‌بک) است.

### گیت پذیرش BLK-07 (Universal OCC & Schema Sequences Gate):
صدور گواهی **PASS** منوط به احراز قطعی تمامی ۸ شرط زیر با شواهد مستند است:
* [ ] **Gate 7.1:** اجرای موفق و بدون خطای مایگریشن در کانتینر دارای پایگاه داده واقعی PostgreSQL.
* [ ] **Gate 7.2:** استعلام `information_schema.columns` و اثبات اینکه تمام ۹۳ جدول سامانه دارای ستون `version INTEGER NOT NULL DEFAULT 1` هستند (خروجی استعلام صفر جدول فاقد نسخه).
* [ ] **Gate 7.3:** اثبات اتصال دنباله‌های اتمیک سخت‌افزاری (`nextval`) به ستون کلید اصلی (`id`) برای تمام ۹۳ جدول.
* [ ] **Gate 7.4:** اجرای آزمون مسابقه همزمانی (OCC Race Test) با ۵۰ تراکنش متقاطع و اثبات اینکه دقیقاً یک تراکنش کامیت شده و ۴۹ تراکنش با کد ۴۰۹ پس زده شده‌اند.
* [ ] **Gate 7.5:** اجرای تست رونویسی خاموش (Lost Update Simulation) و اثبات صفر بودن رخداد رونویسی.
* [ ] **Gate 7.6:** اجرای موفق اسکریپت رول‌بک (`013_universal_occ_and_sequences.down.sql`) و بازگشت تمیز اسکیمای دیتابیس به نسخه ۰۱۲ بدون خطا.
* [ ] **Gate 7.7:** تست پایداری تکرار (Idempotency): اجرای دوباره مایگریشن بدون شکست و بدون تغییر در ساختار موجود (`IF NOT EXISTS`).
* [ ] **Gate 7.8:** ثبت کامیت رسمی در گیت‌هاب با شناسه هش معتبر بدون دست‌کاری تست‌های قدیمی.

### گیت پذیرش BLK-04 (Distributed OTP Decoupling Gate):
صدور گواهی **PASS** منوط به احراز قطعی تمامی ۶ شرط زیر با شواهد مستند است:
* [ ] **Gate 4.1:** حذف ۱۰۰٪ رشته‌های `payesh:otp:state` و قفل سراسری `otp-state` از کل کدهای سرور (اثبات با خروجی grep).
* [ ] **Gate 4.2:** پیاده‌سازی ذخیره‌سازی کلید مجزا به ازای هر شماره تلفن بر پایه هش امن: `payesh:otp:{sha256(phone)}` با انقضای سخت‌افزاری ۱۲۰ ثانیه (`SET ... EX 120 NX`).
* [ ] **Gate 4.3:** اجرای آزمون هجوم همزمان (Race & Flood Test) با ۲,۰۰۰ درخواست ورود در بازه ۲۰۰ میلی‌ثانیه برای شماره‌های مختلف و اثبات تاخیر P99 زیر ۳۰ms بدون حتی یک خطای قفل توزیع‌شده.
* [ ] **Gate 4.4:** آزمون رفتار صلب در قطعی ردیس (Redis Failure Injection): اثبات صدور پاسخ ۵۰۳ یا ۴۲۹ و عدم تنزل پنهانی به فایل‌های موقت یا رم فرآیند (Fail-Closed).
* [ ] **Gate 4.5:** حفظ و اعمال دقیق محدودیت‌های نرخ مصرف (Rate Limiting) و Cooldown ۶۰ ثانیه‌ای به ازای هر شماره تلفن.
* [ ] **Gate 4.6:** اثبات سازگاری معکوس (Backward Compatibility) با توکن‌های نشست صادرشده قبلی.

---

## ۴. تاریخچه تصمیمات معماری (Architecture Decision Records - ADR)

```
========================================================================================
ARCHITECTURE DECISION LOG (ADR)
========================================================================================
[ADR-001] Single Source of Truth Enforcement:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: پایگاه داده PostgreSQL یگانه منبع حقیقت داده‌ها و مجوزهاست. شیء store در رم
          صرفاً یک کش L1 دورریختنی است و حق صدور تصمیمات احراز هویت، OCC و Scope را ندارد.

[ADR-002] Decoupled OTP Key Schema:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: حذف کلید سراسری payesh:otp:state و حرکت به سمت ساختار تفکیک‌شده کلیدها در ردیس
          با پیشوند payesh:otp:{sha256(phone)} جهت حذف کامل Global Lock Contention.

[ADR-003] Database-First Two-Phase Commit Sync:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: معکوس‌سازی فازهای همگام‌سازی در sync.js؛ صدور پاسخ به کلاینت منحصراً پس از
          کامیت قطعی تراکنش روی دیسک دیتابیس مجاز است.

[ADR-004] Zero-Downtime Migration Policy:
  - تاریخ: ۲۰۲۶-۰۹-۱۸ | وضعیت: APPROVED
  - تصمیم: کلیه دستورات DDL باید بدون ایجاد Table Lock انحصاری اجرا شوند. مقادیر پیش‌فرض
          باید آنی تعریف شده و مقداردهی رکوردهای تاریخی در دسته‌های کوچک پس‌زمینه صورت گیرد.
========================================================================================
```

---

## ۵. دفتر ثبت کامیت‌های تاییدشده (Approved Commits Log)

```
========================================================================================
VERIFIED COMMIT AUDIT TRAIL
========================================================================================
Commit Hash | Branch | Author    | Gate Passed | Status   | Scope / Note
------------+--------+-----------+-------------+----------+-----------------------------
0add81fb    | main   | rezaa2544 | Phase 5 S07 | BASELINE | PR #334 Merge (Current Head)
b803d00b    | feat/..| rezaa2544 | Remediation | AUDITED  | Initial Step 07 Remediation
7bca0068    | main   | rezaa2544 | Step 06     | HISTORIC | E2E Simulation Hardening
========================================================================================
```

---

## ۶. مانیفست وضعیت نهایی

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                     PAYESH NATIONAL INFRASTRUCTURE STATUS:                         ║
║                                                                                    ║
║                                    🔴 RED                                          ║
║                                                                                    ║
║                     CURRENT VERDICT: NOT PRODUCTION READY                          ║
║                    PHASE-0 REMEDIATION OFFICIALLY ACTIVATED                        ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```
