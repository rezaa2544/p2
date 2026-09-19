---
name: evidence-integrity-and-commit-accounting
description: Enforce rigorous evidence integrity, mock vs runtime separation, evidence strength levels (E0-E4), strict commit/SHA accounting, and reproducible verification in engineering reports and audits.
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
DATABASE_URL=...
REDIS_URL=...

RESULT:
70 PASS / 0 FAIL

EXIT CODE:
0
```
- **مجاز:** `server17 passed 70/70`
- **غیرمجاز:** «سیستم امن است»

#### Type B — Source Evidence
هر ادعای معماری باید مسیر فایل و خط داشته باشد.
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
- **بدون مسیر فایل:** ❌ رد

#### Type C — Git Evidence
هر تغییر کد باید دارای مشخصات کامل باشد:
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

هر تست باید برچسب داشته باشد: یکی از:
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
  ```text
  HTTP Trace Verified
  (وقتی داخل تست mockTraceDb است)
  ```

---

## Rule Set 3 — Evidence Strength Level

هر نتیجه یک Level دارد:

| Level | عنوان | شرح | اعتبار |
| :--- | :--- | :--- | :--- |
| **E0** | ادعا | بدون تست (`I think fixed`) | ❌ صفر |
| **E1** | Source Checked | فقط بررسی کد (`grep confirmed`) | کم |
| **E2** | Automated Test | تست اجرا شده (`PASS`) | متوسط |
| **E3** | Runtime Proof | سرویس واقعی (`Node` + `PostgreSQL` + `Redis`) | بالا |
| **E4** | Independent Red Team | تیم جدا (`Attack attempted`, `Failure reproduced`) | بالاترین |

⚠️ هیچ گزارشی نباید **E1** را با زبان **E3** بیان کند.

---

## Rule Set 4 — Commit Accounting (گزارش SHA)

**ممنوع:** یک SHA برای همه چیز (ابهام ایجاد می‌کند):
```text
Commit: abc123
Changes: code + docs + report
```

**فرمت اجباری:**

### CODE COMMIT
```text
CODE_COMMIT_SHA: abc123
Contains:
  server/
  tests/
Purpose:
  Implementation change
```

### DOCUMENTATION COMMIT
```text
DOC_COMMIT_SHA: def456
Contains:
  docs/
  HANDOFF.md
  reports/
Purpose:
  Documentation only
```

### TEST ARTIFACT
اگر فایل تست جدا commit شده:
```text
TEST_COMMIT_SHA: 789xyz
Contains:
  tests/
```

---

## Rule Set 5 — Git Diff Verification

قبل از گزارش، اجرای این دستورها و ثبت خروجی اجباری است:
```bash
git status --short
git diff --stat HEAD^
git show --stat HEAD
git rev-parse HEAD
```

---

## Rule Set 6 — Claim Validation

قبل از نوشتن واژگان قطعی (`VERIFIED`, `PASS`, `COMPLETE`, `READY`, `SECURE`)، این پرسش باید پاسخ داده شود:
> **Question:** Can another engineer reproduce this result using only this report?
- **YES:** مجاز
- **NO:** تنزل لحن ادعا (Downgrade wording)

---

## Rule Set 7 — Final Report Template

هر گزارش فاز باید از این قالب پیروی کند:

```text
=====================================
PHASE X REPORT
=====================================

Implementation:
CODE_SHA: xxxx

Documentation:
DOC_SHA: xxxx

Environment:
Node:
PostgreSQL:
Redis:

Evidence:

1. Runtime: [E3]
Command: ...
Result: ...

2. Source: [E1]
File: ...
Lines: ...

3. Independent: [E4]
Finding: ...

Known Risks:
- ...

Verification Status:
NOT VERIFIED (Pending Independent Review)
```

---

## Rule Set 8 — Red Flag Detection

اگر هرکدام از این موارد وجود داشته باشد، گزارش باید **FAIL** شود:
- ❌ Mock presented as production
- ❌ Missing SHA separation
- ❌ No git status
- ❌ No command output
- ❌ No environment details
- ❌ "Verified" without independent test
- ❌ Test file used as proof of runtime behavior

---

## دستور استفاده
قبل از اجرای هر فاز یا گزارش، اسکیل `evidence-integrity-and-commit-accounting` را فعال کنید. تمام خروجی‌ها باید طبق این اسکیل تولید شوند.
**تمرکز اصلی:**
- Evidence Quality
- SHA Accounting
- Runtime vs Mock separation
- Reproducibility
- عدم صدور ادعای کاذب `VERIFIED` بدون شواهد کافی
