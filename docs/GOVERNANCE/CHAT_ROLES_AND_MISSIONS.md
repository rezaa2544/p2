# CHAT ROLES AND MISSION CONTROL

## Purpose
این سند مرجع تقسیم مسئولیت سه جریان کاری مستقل Chat 1، Chat 2 و Chat 3 است.

**اصل حاکمیتی:**
- سه چت مستقل عمل می‌کنند.
- هیچ چتی مالک تصمیم یا وظیفه چت دیگر نیست.
- تبادل اطلاعات فقط از طریق گزارش‌ها و برنامه‌های ثبت‌شده انجام می‌شود.
- هیچ PASS یا Production Ready بدون شواهد تست و بررسی واقعی صادر نمی‌شود.

---

# Chat 1 — Chief System Architect & Development Roadmap Controller

## مسئولیت اصلی
هدایت مسیر توسعه کامل سامانه از فاز فعلی تا پایان Roadmap.

## وظایف
1. بررسی وضعیت فعلی توسعه.
2. تعیین فازهای تکمیل‌شده و فازهای باقی‌مانده.
3. طراحی برنامه اجرای فازهای بعدی.
4. تعریف Architecture Decision و Gateهای هر فاز.
5. هماهنگی سطح معماری بین توسعه، رفع مشکل و تست.
6. ثبت برنامه توسعه در اسناد Governance.

## محدوده کار
- Roadmap کامل پروژه
- معماری کلان
- اولویت‌بندی فازها
- تعریف Acceptance Gate
- برنامه‌ریزی کارهای Chat 2 و Chat 3 پس از هر مرحله

## ممنوعیت‌ها
- عدم جایگزینی کار Chat 2 در اصلاح کد.
- عدم اجرای تست تخریبی به جای Chat 3.
- عدم اعلام موفقیت بدون Evidence.

## مسیر مستندات
```
docs/GOVERNANCE/
docs/ROADMAP/
docs/ARCHITECTURE/
```

---

# Chat 2 — Remediation Engineering Team

## مسئولیت اصلی
رفع اشکالات کشف‌شده در سیستم و پیاده‌سازی اصلاحات تاییدشده.

## وظایف
1. دریافت Bug/Finding از گزارش‌های تست و ممیزی.
2. تحلیل ریشه‌ای مشکل.
3. طراحی Fix Plan.
4. اجرای تغییرات کد یا Migration طبق دستور Chat 1.
5. ارائه گزارش تغییرات، تست و Evidence.

## دامنه فعلی مشکلات شناخته‌شده
- OCC و Version Enforcement
- Race Conditionها
- Lost Update
- Multi Pod Consistency
- OTP Architecture
- Event Persistence
- Database Safety
- هر مشکل جدید کشف‌شده توسط Chat 3

## چرخه کاری
```
Finding دریافت شد
        ↓
Root Cause Analysis
        ↓
Implementation Plan
        ↓
Code Change
        ↓
Test Evidence
        ↓
تحویل برای Validation
```

## مسیر مستندات
```
docs/REMEDIATION/
docs/BUGS/
docs/MIGRATIONS/
```

## ممنوعیت‌ها
- اصلاح بدون Evidence.
- حذف یا تضعیف تست برای سبز شدن.
- استفاده از Mock به جای Production Behavior.

---

# Chat 3 — Adversarial Testing & System Validation Team

## مسئولیت اصلی
تست سخت‌گیرانه عملکرد، امنیت، پایداری و رفتار واقعی سیستم.

## وظایف
برای پایان هر فاز:

## مرحله اول — Phase Attack Test
تست مستقل همان فاز:
- بررسی قابلیت جدید.
- تست فشار.
- تست Race Condition.
- تست Failure Injection.
- تست رفتار واقعی Runtime.

## مرحله دوم — Full Regression Attack
پس از پایان تست همان فاز:
- تست تمام فازهای قبلی.
- پیدا کردن اثرات جانبی.
- کشف Regression.
- ثبت مشکلات جدید.

## سناریوهای اجباری
- Load Test
- Memory Exhaustion
- Database Failure
- Redis Failure
- Multi Pod Simulation
- Concurrency Attack
- Data Integrity Test
- Event Loss Simulation

## خروجی
```
RED TEAM REPORT
FINDINGS
REPRODUCTION STEPS
SEVERITY
REQUIRED FIX
```

## مسیر مستندات
```
docs/RED_TEAM/
docs/TEST_REPORTS/
docs/SECURITY_AUDIT/
```

---

# ارتباط بین چت‌ها

```
Chat 1
  |
  | Development Plan / Phase Gate
  v
Chat 2
  |
  | Fixed Implementation
  v
Chat 3
  |
  | Test Findings
  v
Chat 2
  |
  | New Remediation
  v
Chat 1
  |
  | Next Phase Approval
```

---

# Phase Completion Rule

هیچ فازی کامل محسوب نمی‌شود مگر اینکه:

1. Chat 1 برنامه و Gate را تایید کند.
2. Chat 2 اصلاحات لازم را انجام دهد.
3. Chat 3 تست مستقل فاز و Regression کامل انجام دهد.
4. مشکلات جدید وارد برنامه Chat 2 شوند.
5. Chat 1 Gate مرحله بعد را صادر کند.

Status Rule:

🔴 RED — مشکلات تاییدنشده وجود دارد

🟡 CONDITIONAL — اصلاح انجام شده ولی Validation کامل نیست

🟢 APPROVED — توسعه، اصلاح و تست کامل شده است
