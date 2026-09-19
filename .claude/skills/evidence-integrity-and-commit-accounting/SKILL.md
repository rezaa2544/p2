---
name: evidence-integrity-and-commit-accounting
description: Enforce strict evidence integrity, commit accounting, and runtime vs mock separation across all engineering, audit, testing, and handoff reports. Must be activated before executing any Phase.
allowed-tools: Read, Grep, Glob, Bash
---

# Evidence Integrity & Commit Accounting

## هدف
تضمین اینکه تمام گزارش‌های مهندسی، تست، ممیزی و تحویل دارای:
1. شواهد قابل بازتولید (Reproducible Evidence)
2. تفکیک دقیق کد، تست و مستندات
3. گزارش صحیح SHA و تاریخچه Git
4. جلوگیری از ادعاهای غیرقابل اثبات
باشند.

---

## Rule Set 1 — Evidence Integrity (سخت‌گیری شواهد)

### اصل پایه
هیچ جمله‌ای در گزارش مجاز نیست مگر اینکه یکی از این سه نوع evidence پشت آن باشد:

#### Type A — Runtime Evidence
نمونه:
```text
COMMAND:
node tests/server17.js

ENV:
NODE_ENV=production
DATABASE_URL=postgres://...
REDIS_URL=redis://...

RESULT:
70 PASS / 0 FAIL

EXIT CODE:
0
```
- **مجاز:** `server17 passed 70/70 under PostgreSQL 17 + Redis 8.0`
- **غیرمجاز:** «سیستم امن است» / «تست‌ها پاس شدند» (بدون جزییات)

#### Type B — Source Evidence
هر ادعای معماری باید مسیر فایل و خط دقیق داشته باشد.
فرمت اجباری:
```text
CLAIM:
Canary weight update is atomic

SOURCE:
server/infrastructure/phase6-canary-engine.js

LINES:
317-350

EVIDENCE:
authority.updateCanaryWeightWithAudit()
```
- **بدون مسیر فایل و خط:** ❌ رد قطعی

#### Type C — Git Evidence
هر تغییر کد باید ثبت رسمی داشته باشد:
```text
COMMIT:
abc123

BRANCH:
main

PARENT:
previous_sha

FILES:
server/a.js
server/b.js

git status:
clean
```

---

## Rule Set 2 — Mock Evidence Separation
هر تست باید برچسب نوع اجرا داشته باشد:
یکی از:
- `[REAL-PRODUCTION]`
- `[REAL-DATABASE]`
- `[MOCK]`
- `[UNIT]`
- `[INTEGRATION]`

**مثال:**
- **مجاز:**
  ```text
  HTTP Trace Test
  Type: [REAL-PRODUCTION]
  Database: PostgreSQL 17.11
  Redis: 8.0.2
  ```
- **غیرمجاز:**
  `HTTP Trace Verified` وقتی داخل تست شیء `mockTraceDb` یا `mockAuditFailDb` استفاده شده است.

---

## Rule Set 3 — Evidence Strength Level
هر نتیجه و ادعا باید تراز اعتباری داشته باشد:

- **E0 — ادعا (Unsubstantiated):** بدون تست («I think fixed»). اعتبار: **❌ صفر**.
- **E1 — Source Checked:** فقط بررسی سورس کد (`grep confirmed`). اعتبار: **کم**.
- **E2 — Automated Test:** اجرای تست خودکار یونیت/ماک در محیط ایزوله (`PASS`). اعتبار: **متوسط**.
- **E3 — Runtime Proof:** سرویس واقعی با دیتابیس و ردیس زنده (`Node + PostgreSQL + Redis`). اعتبار: **بالا**.
- **E4 — Independent Red Team:** آزمون تیم مستقل با تزریق شکست و تلاش برای نفوذ (`Attack attempted / Failure reproduced`). اعتبار: **بالاترین**.

⚠️ **قانون اکید:** هیچ گزارشی نباید ادعای E1 یا E2 را با ادبیات E3 یا E4 بیان کند.

---

## Rule Set 4 — Commit Accounting (گزارش تفکیک‌شدهٔ SHA)

⛔ **ممنوع:** یک commit برای همه چیز:
```text
Commit: abc123
Changes: code + docs + report
```
این کار موجب ابهام و پنهان شدن تغییرات می‌شود.

**فرمت اجباری:**
```text
CODE COMMIT
CODE_COMMIT_SHA: abc123
Contains: server/, tests/
Purpose: Implementation change

DOCUMENTATION COMMIT
DOC_COMMIT_SHA: def456
Contains: docs/, HANDOFF.md, reports/
Purpose: Documentation only

TEST ARTIFACT COMMIT (در صورت تفکیک)
TEST_COMMIT_SHA: 789xyz
Contains: tests/
Purpose: Test suites & fixtures
```

---

## Rule Set 5 — Git Diff Verification
پیش از انتشار هر گزارش یا تحویل فاز، اجرای این دستورات و درج خروجی آن‌ها اجباری است:
```bash
git status --short
git diff --stat HEAD^
git show --stat HEAD
git rev-parse HEAD
```

---

## Rule Set 6 — Claim Validation (تست بازتولیدپذیری)
قبل از نوشتن واژگان `VERIFIED`، `PASS`، `COMPLETE`، `READY` یا `SECURE`، این پرسش باید پاسخ داده شود:
> **آیا یک مهندس دیگر می‌تواند با استفادهٔ صِرف از دستورات و اطلاعات این گزارش، همین نتیجه را بازتولید کند؟**
- **بله:** کلمه مجاز است.
- **خیر:** کلمه باید به سطوح پایین‌تر (مانند `PARTIALLY TESTED` یا `UNVERIFIED`) تنزل یابد.

---

## Rule Set 7 — Final Report Template
هر گزارش فاز باید قالب زیر را رعایت کند:
```text
=====================================
PHASE X REPORT
=====================================

Implementation:
CODE_SHA: xxxx

Documentation:
DOC_SHA: xxxx

Environment:
Node: v20.x
PostgreSQL: 17.x
Redis: 8.x

Evidence:

1. Runtime: [E3]
Command: ...
Result: ...

2. Source: [E1]
File: ...
Lines: ...

3. Independent Red Team: [E4]
Finding: ...

Known Risks:
- ...

Verification Status:
NOT VERIFIED (Pending Independent Review) / VERIFIED
```

---

## Rule Set 8 — Red Flag Detection
وجود هر یک از این موارد به منزلهٔ **FAIL فوری** گزارش است:
- ❌ ارائه‌ی شبیه‌سازی (Mock) به عنوان رفتار Production واقعی
- ❌ عدم تفکیک SHA کد و مستندات
- ❌ فقدان خروجی `git status`
- ❌ فقدان دستور و لاگ اجرایی (Command Output)
- ❌ فقدان مشخصات دقیق Environment
- ❌ صدور گواهی `VERIFIED` بدون تست مستقل E3/E4
- ❌ استفاده از فایل تست به عنوان مدرک رفتار زمان اجرا در پروداکشن

---

## دستور استفاده برای Chat2 و تمام عامل‌های سیستم
پیش از اجرای هر فاز یا پاسخگویی به هر تسک:
1. اسکیل `evidence-integrity-and-commit-accounting` را مطالعه و فعال کنید.
2. تمام خروجی‌ها و گزارش‌ها باید بر مبنای این اسکیل تولید شوند.
3. تمرکز اصلی بر: **کیفیت شواهد**، **تفکیک SHAها**، **جداسازی Mock از Runtime واقعی**، و **بازتولیدپذیری** باشد.
4. **هیچ گواهی VERIFIED بدون شواهد E3/E4 صادر نشود.**
