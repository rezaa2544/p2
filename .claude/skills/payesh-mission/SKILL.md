---
name: payesh-mission
description: Use this skill on ANY mission/feature/bugfix in the Payesh (پایش) project. It enforces the 10-phase evidence-driven mission protocol (UNDERSTAND → INSPECT → PLAN → BASELINE → IMPLEMENT → TEST → NEGATIVE PROOF → REGRESSION → DOCUMENT → REPORT), the false-green law, and the standard mission-report format. Invoke it before writing any code in this repository.
---

# اسکیل اجرای Mission — Payesh (پایش)

این اسکیل **روش اجرای هر Mission** را تثبیت می‌کند. مافوقِ قوانین کد
(که در `payesh-standards` است) — اینجا دربارهٔ **چگونه کار کردن** است.

اگر فاقد evidence هستی، این اسکیل را طی کن.

## قانون طلایی

**REPORT = PROOF نیست.** هر ادعا باید اینچنین تأیید شود:

```
CLAIM → EVIDENCE → REPRODUCTION → CURRENT HEAD → VERIFICATION
```

ادعای بدون evidence = ممنوع. حدس = `UNKNOWN`.

---

## فاز ۱ — UNDERSTAND

قبل از هر خط کد، این‌ها را بدست بیاور:

1. `git status` / `git branch` / `git rev-parse HEAD` / `git rev-parse origin/main`
2. مأموریت فعلی چیست؟ scope آن چیست؟
3. کدام فایل‌ها مرتبط‌اند؟ (source، tests، callers)
4. آیا findingهای قبلی روی همین موضوع وجود دارد؟

**خروجی فاز:** یک پاراگراف تعریف Mission + فهرست IN SCOPE / OUT OF SCOPE.

**اگر نمی‌دانی:** بگو `UNKNOWN` — حدس نزن.

## فاز ۲ — INSPECT

source را بخوان، نه فقط گزارش‌ها را. پاسخ این سوالات:

- کد کجا شکست می‌خورد؟ (نه کجا پیام خطا نشان داده می‌شود)
- failure path واقعی چیست؟
- چه contract ای بین لایه‌ها برقرار است؟
- آیا باگ واقعی است یا symptom از مشکل بالاتر؟

**خطر:** patch کردن symptom به‌جای root cause = ممنوع (§۳۵ پرامپت اصلی).

## فاز ۳ — PLAN

قبل از implementation، plan مکتوب:

- چه تغییراتی لازم است (فایل به فایل)
- چه test‌هایی لازم است (تازه یا تغییر)
- negative proof چگونه انجام می‌شود
- baseline فعلی چیست (تا قبل/بعد قابل مقایسه باشد)
- riskها و rollback path

**مهم:** این فاز جای اندیشیدن است، نه فاز IMPLEMENT.

## فاز ۴ — BASELINE

قبل از تغییر، رفتار فعلی را ثبت کن:

- اجرای testها و ضبط نتیجه (پاس/FAIL)
- اگر test NOT-RUN است (مثلاً jsdom نصب نیست)، **بدون ابتدا baseline
  valid، هیچ بهبودی قابل اثبات نیست** — این را در گزارش بیاور.

**NOT-RUN ≠ PASS.** این مهم‌ترین تلهٔ false-green است.

## فاز ۵ — IMPLEMENT

تغییر را انجام بده. قوانین `payesh-standards`:

- `esc()` روی ورودی کاربر
- تغییر داده فقط از طریق journal/applyOp
- `index.html` خروجی build است — دست‌نخورده
- بدون وابستگی خارجی
- commit ای کوچک و focused

**بهترین روش:** یک تغییر یک commit. فایل unrelated را در commit نگذار.

## فاز ۶ — TEST

testها را اجرا کن و **exit code** را بررسی کن.

- آیا test واقعاً target code را اجرا کرد؟
- آیا assertion واقعاً چیزی را بررسی کرد؟
- آیا environment مناسب بود؟
- آیا mock جای runtime proof را نگرفت؟

**خطر بزرگ:** testی که از روی اسم یا exit 0 سبز به‌نظر برسد اما
target را اجرا نکرده باشد.

## فاز ۷ — NEGATIVE PROOF (اجباری)

برای هر test مهم:

1. کد را عمداً خراب کن (جهش)
2. test باید **FAIL** کند
3. کد را بازگردان و test باید دوباره **PASS** کند

اگر جهش هم سبز ماند → **TEST INVALID است** و ارزش اثباتی ندارد.

> درس واقعی پروژه (wave17): دفاع لایه‌ایِ main جهش تک‌خطی را بی‌اثر می‌کرد.
> راه‌حل: helper `mutateMulti` که هر دو لایه را با هم جهش می‌دهد. اگر
> test با جهش ساده سبز ماند، لایه‌ی دیگری محافظت می‌کند — جهش قوی‌تر نیاز است.

## فاز ۸ — REGRESSION

- آیا تعداد testها کاهش یافته؟ (نباید، مگر با دلیل موجه)
- آیا suiteهای همسایه (related tests) هنوز سبزند؟
- آیا baseline حفظ شد؟
- آیا تغییر، رفتار دیگری را شکست؟

**مهم:** regression باید روی **current HEAD** باشد نه SHA قدیمی.

## فاز ۹ — DOCUMENT

برای تغییرات مهم، بررسی کن آیا این‌ها نیاز به به‌روزرسانی دارند:

- `docs/ARCHITECTURE.md`
- `HANDOFF.md`
- `docs/AI_PROMPT.md`
- `CONTRIBUTING.md` / `PROJECT_NOTES.md`
- `TODO_BEFORE_PRODUCTION.md` (اگر نقض جدید پذیرفته‌شده‌ای وارد شد)

در همین commit کد، مستندات را به‌روز کن.

## فاز ۱۰ — REPORT

گزارش نهایی با این ساختار (اجباری):

```markdown
# MISSION REPORT

## Mission
## Current HEAD
## Objective
## Scope
## Initial State
## Findings
## Root Cause
## Changes
## Tests
## Negative Proof
## Regression
## Evidence
## Remaining Risks
## Documentation
## Git State
## Verdict
## Recommended Next Action
```

گزارش تجمیعی → فایل `docs/REPORT_*.md` + commit + push + تأیید `git ls-remote`.
در چت فقط اشارهٔ کوتاه.

---

## STATUS VOCABULARY (اجباری)

استفاده کن: `VERIFIED` · `FIXED-SCOPED` · `REVALIDATION_REQUIRED` ·
`NOT VERIFIED` · `UNKNOWN` · `BLOCKED` · `FAIL`

ممنوع: "probably fixed"، "looks good"، "should be fine"

## CURRENT HEAD RULE

تمام findings نسبت به **CURRENT HEAD**. Historical PASS برای SHA قدیمی معتبر
نیست مگر دوباره verify شود.

## SCOPE DISCIPLINE

finding خارج از scope: از دست نده، severity بده، evidence ثبت کن، target mission
پیشنهاد بده. بدون اجازه scope را گسترش نده.

## NO FALSE COMPLETION

هرگز نگوی «کار تمام شد» اگر: test NOT-RUN، evidence ناقص، current HEAD
mismatch، regression failure، known blocker، unverified assumption.

---

## تله‌های شناخته‌شده (افزوده‌ی تجربه)

| تله | علائم | پیشگیری |
| :--- | :--- | :--- |
| False-green | test سبز است اما target را اجرا نکرده | negative proof اجباری |
| NOT-RUN ↔ PASS | test اجرا نشده اما سبز گزارش شده | exit code + خروجی واقعی |
| Patch symptom | پیام خطا برطرف شد، root cause باقی ماند | فاز ۲ کامل |
| Historical verdict | PASS از SHA قدیمی استفاده شد | re-verify روی HEAD |
| Mock جای runtime | mock موفق شد، کد واقعی اجرا نشد | اجرای واقعی روی کد هدف |
| Working tree کثیف | فایل unrelated در commit | `git status` قبل commit |
| Scope creep | findingهای بیرون از scope Fix شد | ثبت finding + ماندن در scope |

---

## دستورالعمل سریع

```
UNDERSTAND  →  Mission چیست؟ scope چیست؟
INSPECT     →  source واقعی را بخوان
PLAN        →  تغییر + test + negative proof را بنویس
BASELINE    →  رفتار فعلی را ثبت کن
IMPLEMENT   →  تغییر را انجام بده (payesh-standards)
TEST        →  اجرا + exit code + assertions
NEGATIVE    →  جهش → FAIL → بازگردان → PASS
REGRESSION  →  suiteها + baseline روی current HEAD
DOCUMENT    →  docs + HANDOFF
REPORT      →  docs/REPORT_*.md + commit + push + ls-remote
```
