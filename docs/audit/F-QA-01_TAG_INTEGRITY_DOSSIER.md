# F-QA-01 — TAG INTEGRITY DOSSIER — `phase8.2-verified`

**Priority:** P1
**Measured at:** `6b627a8f56f958de81579a336341689db9d7a551`
**Date:** 2026-09-21
**Status:** evidence complete · **BLOCKED — OWNER DECISION REQUIRED** (tag deliberately NOT moved)

---

## ۱. تگ دقیقاً کجاست

```
refs/tags/phase8.2-verified -> 401d02b2ab9a6011e09e2dec1517a99fe2de21cd
object type   : commit      (lightweight tag — نه annotated)
tagger        : ندارد
tag message   : ندارد
signature     : ندارد
commit subject: docs(phase8.2): publish final verification report
commit author : opencode <opencode@users.noreply.github.com>
commit date   : 2026-09-21 02:26:25 +0330
commit diff   : 1 file changed, 22 insertions(+)
                docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md
reachable from main : YES
distance from HEAD  : ۷۷ کامیت عقب
```

**نکتهٔ اول:** این یک **lightweight tag** است. یعنی حتی متادیتای «چه کسی، کِی، چرا این را
verified اعلام کرد» هم وجود ندارد. یک برچسبِ بی‌امضا روی یک کامیت.

**نکتهٔ دوم:** آن کامیت **هیچ کدی را تغییر نداده** — فقط یک سند ۲۲ خطی اضافه کرده است.
یعنی تگ، وضعیتِ یک *ادعا* را علامت‌گذاری می‌کند، نه وضعیتِ یک *نرم‌افزار تأییدشده*.

## ۲. آیا آن SHA شواهد معتبر CI دارد؟ — خیر

پرس‌وجوی مستقیم از Actions API برای `head_sha=401d02b2...`:

| workflow | run | نتیجه |
|---|---|---|
| `.github/workflows/fortify.yml` | #284 `id=35543671024` | **failure** |
| `.github/workflows/fortify.yml` | #283 `id=35543159931` | **failure** |
| **Node.js CI** | — | **هیچ اجرایی وجود ندارد** |
| **Security Program** | — | **هیچ اجرایی وجود ندارد** |
| **Codacy** | — | **هیچ اجرایی وجود ندارد** |

```
total runs on 401d02b2 : 2
successful runs        : 0
test runs              : 0
```

**حکم:** تگی به نام `verified` روی کامیتی نشسته که **صفر تست روی آن اجرا شده** و
**تنها شواهد موجودش دو شکست است**. این برچسب، شاهد نیست.

## ۳. ارتباط تگ با گزارش‌های verification فعلی

کامیت `401d02b2` همان کامیتی است که سند
`docs/audit/PHASE_8_2_FINAL_VERIFICATION_REPORT.md` را با این محتوا ایجاد کرد:

```
Commit: b0b55a13539dc917779d39053bfb8d2277428cc0
Status: VERIFIED
```

زنجیرهٔ ادعا سه حلقه دارد و **هر سه حلقه شکسته‌اند**:

1. تگ `phase8.2-verified` → کامیت `401d02b2` که **هیچ CI ندارد**.
2. سند داخل آن کامیت → به `b0b55a13` استناد می‌کرد که **Node.js CI #1074 آن failure بود**.
3. سند هیچ run_id، شمارش تست، یا کد خروجی نداشت.

**وضعیت امروز:** همان سند در HEAD **بازنویسی و ادعایش رسماً پس گرفته شده** (کامیت
`0d245b9c`) و اکنون ۱۲۳ خط با run id و شمارش واقعی است. یعنی:

> تگ `phase8.2-verified` اکنون به نسخه‌ای از سندی اشاره می‌کند که **محتوایش در HEAD
> باطل اعلام شده است**. تگ، یک ادعای بازپس‌گرفته‌شده را در تاریخ منجمد کرده است.

## ۴. آیا چیزی به این تگ وابسته است؟

```
grep -rn "phase8.2-verified" tools/ tests/ .github/ scripts/   →  صفر نتیجه
grep -rnE "git tag|describe --tags" tools/*.js .github/**.yml  →  صفر نتیجه
```

**هیچ ابزار، تست یا workflowای این تگ را نمی‌خواند.** فقط ۷ سند به آن ارجاع می‌دهند و
همگی آن را به‌عنوان *یافتهٔ باز* توصیف می‌کنند، نه به‌عنوان شاهد.

**پیامد عملی:** حذف یا تغییر نام این تگ **هیچ چیزی را نمی‌شکند**. این یک تصمیم
حاکمیتی است، نه فنی.

## ۵. چرا تگ در این بسته جابه‌جا نشد

سه دلیل مستقل:

1. **دستور مأموریت:** «`do not move tags` (audit, not cosmetics)» و در roadmap مخزن:
   «اصلاح `phase8.2-verified` فقط پس از داشتن SHA + CI evidence معتبر».
2. **جابه‌جاکردن تگ، مسئله را حل نمی‌کند — پنهانش می‌کند.** اگر همین حالا تگ را روی
   `6b627a8f` (که Node.js CI #1156 سبز دارد) ببریم، برچسب «verified» درست به نظر
   می‌رسد در حالی که **Phase 8.2 همچنان NOT VERIFIED است**. این دقیقاً همان
   fake-greenی است که این ممیزی علیه آن است.
3. **یک CI سبز ≠ یک فاز تأییدشده.** Node.js CI #1156 فقط می‌گوید ۲۸ مرحله سبز شدند.
   گیت ۸.۲ به شواهد E4 (M1/M2/M3) نیاز دارد که هنوز وجود ندارند.

## ۶. تصمیم موردنیاز مالک

**BLOCKED — OWNER DECISION REQUIRED**

| گزینه | کار | ارزیابی |
|---|---|---|
| **A — تغییر نام (توصیه‌شده)** | تگ تازهٔ annotated مثل `phase8.2-report-published` روی همان `401d02b2` + حذف `phase8.2-verified` | تاریخ حفظ می‌شود، ادعای کاذب حذف می‌شود. برچسب همان چیزی را می‌گوید که واقعاً هست: «گزارش منتشر شد»، نه «تأیید شد» |
| **B — حذف ساده** | `git push origin :refs/tags/phase8.2-verified` | سریع و بی‌خطر (هیچ اتوماسیونی وابسته نیست)؛ ولی نشانهٔ تاریخی از بین می‌رود |
| **C — جابه‌جایی به SHA دارای CI سبز** | تگ روی `6b627a8f` (#1156 ✅ ۲۸/۲۸) | ❌ **توصیه نمی‌شود** — کلمهٔ «verified» را بدون شواهد E4 مشروع جلوه می‌دهد |
| **D — بدون تغییر** | فقط مستندسازی | وضعیت فعلی؛ ریسک: هر خوانندهٔ تازه دوباره تگ را شاهد فرض می‌کند |

**توصیهٔ ممیز: گزینهٔ A.** دلیل: تنها گزینه‌ای است که هم‌زمان (۱) ادعای بی‌پشتوانه را
برمی‌دارد، (۲) تاریخ را پاک نمی‌کند، و (۳) هیچ برچسب verifiedی بدون شاهد باقی نمی‌گذارد.

دستورهای دقیق در صورت تصویب مالک (اجرا **نشده‌اند**):

```bash
git tag -a phase8.2-report-published 401d02b2 \
  -m "Phase 8.2 verification report published (claim later retracted at 0d245b9c). Not a verification gate."
git push origin phase8.2-report-published
git push origin :refs/tags/phase8.2-verified
git tag -d phase8.2-verified
```

## ۶.۵ چه شرایطی اجازهٔ ایجاد تگ جدید می‌دهد؟ (معیارهای الزام‌آور)

این بخش پاسخ صریح به پرسش «چه زمانی می‌توان تگ تازه ساخت» است. **هر پنج شرط** باید
هم‌زمان برقرار باشند؛ نقض حتی یکی یعنی تگ ساخته نمی‌شود.

### الف) برای هر تگ (عمومی)

| # | شرط | روش بررسی (ماشینی) |
|---|---|---|
| **T1** | تگ باید **annotated** باشد، نه lightweight — تا tagger و دلیل ثبت شود | `git cat-file -t <tag>` باید `tag` بدهد، نه `commit` |
| **T2** | SHA هدف باید یک اجرای **موفق Node.js CI** داشته باشد | `GET /actions/runs?head_sha=<sha>` ⇒ حداقل یک `Node.js CI` با `conclusion=success` |
| **T3** | آن اجرا باید **همهٔ مراحل** را اجرا کرده باشد، نه با skip رد شده باشد | تعداد `skipped` در jobs API = **صفر** |
| **T4** | SHA باید از `origin/main` قابل دسترس باشد | `git merge-base --is-ancestor <sha> origin/main` |
| **T5** | نام تگ باید همان چیزی را بگوید که هست | تگ «verified» فقط با شواهد تأیید؛ در غیر این‌صورت `-report-published` / `-snapshot` |

### ب) اضافه بر آن، برای تگ انتشار `vX.Y.Z`

| # | شرط | بررسی |
|---|---|---|
| **R1** | `package.json` آن کامیت باید **دقیقاً** `X.Y.Z` باشد | `git show <tag>:package.json` — اکنون توسط `tests/release-version-contract.js` (بررسی V6) اجباری شده |
| **R2** | `package-lock.json` باید با آن هم‌خوان باشد | بررسی V2/V3 همان تست |
| **R3** | تگ منتشرشده **هرگز جابه‌جا نمی‌شود** | در صورت اشتباه، تگ تازه با نام تازه |

### ج) اضافه بر آن، برای هر تگی که کلمهٔ «verified» را حمل می‌کند

| # | شرط |
|---|---|
| **V-1** | یک سند verification با **run id، شمارش تست، و کد خروجی** واقعی وجود داشته باشد |
| **V-2** | آن سند به همان SHAیی استناد کند که تگ روی آن می‌نشیند (نه یک SHA تاریخی) |
| **V-3** | گیت مربوطه واقعاً باز شده باشد — برای Phase 8.2 یعنی شواهد **E4** برای M1/M2/M3 |

**وضعیت امروز در برابر این معیارها:**

| معیار | `phase8.2-verified` فعلی |
|---|---|
| T1 annotated | ❌ lightweight |
| T2 CI موفق | ❌ **صفر اجرای Node.js CI** |
| T3 بدون skip | ❌ غیرقابل ارزیابی (اجرایی وجود ندارد) |
| T4 روی main | ✅ (۸۲ کامیت عقب) |
| T5 نام صادق | ❌ «verified» بدون تأیید |
| V-1..V-3 | ❌ سندش باطل شده است |

⇒ **۵ شرط از ۶ نقض شده.** اگر همین امروز بخواهیم تگی با این نام بسازیم، مجاز نیست.

> نکتهٔ مهم: `6b627a8f` و `755715bd` شرط‌های T2/T3/T4 را برآورده می‌کنند
> (Node.js CI #1156 و #1158، هر دو success با صفر skip). یعنی برای یک تگ **snapshot**
> یا **report** کاندیدای معتبری وجود دارد — ولی هیچ‌کدام V-1..V-3 را برآورده نمی‌کنند،
> پس **هیچ تگ verifiedی مجاز نیست.**

## ۷. یافتهٔ جانبی — سایر تگ‌ها

| تگ | SHA | نوع | شواهد CI |
|---|---|---|---|
| `phase8.2-verified` | `401d02b2` | lightweight | **۰ اجرای تست؛ ۲ شکست Fortify** |
| `phase8.2-final-main` | `fbe178be` | lightweight | متناقض: #1093 ✅ (PR) و #1095 ❌ (push) روی همان SHA |
| `v1.0.1` | `522afe8f` | lightweight | **صفر اجرا — هیچ CIای وجود ندارد** |
| `v1.0.0` | `b2428ad2` | lightweight | — |
| `national-baseline-start` | `e551 53d4` → `88509732` | **annotated** | — |

**نکته:** تنها تگ annotated مخزن `national-baseline-start` است. تگ انتشار `v1.0.1`
هم هیچ شاهد CI ندارد — همان الگوی `phase8.2-verified`، این بار روی یک تگ انتشار.
این در `docs/RELEASE_VERSION_CONTRACT.md` به‌عنوان قاعدهٔ ۲ پوشش داده شد.

**یافتهٔ تازهٔ این بسته (F-QA-07 با F-QA-01 تلاقی می‌کند):** تگ `v1.0.1` نه‌تنها CI ندارد،
بلکه **عددش هم پشتوانه ندارد**. `package.json` در کامیت `522afe8f` مقدار **`1.0.0`** را
نشان می‌دهد، نه `1.0.1`:

```
git show v1.0.0:package.json  -> version = 1.0.0   ✅ همخوان
git show v1.0.1:package.json  -> version = 1.0.0   ❌ ناهمخوان
git log -S'"version": "1.0.1"' -- package.json  ->  (خالی)
```

آخرین دستور ثابت می‌کند نسخهٔ `1.0.1` **هرگز در تاریخچهٔ `package.json` وجود نداشته**.
یعنی یک تگ انتشار روی عددی زده شده که هیچ‌وقت در کد نبوده. طبق قاعدهٔ R3 قرارداد،
این تگ **جابه‌جا نمی‌شود**؛ فقط ثبت شد و گیت `tests/release-version-contract.js`
(بررسی V6) از این پس تکرارش را در تگ‌های آینده می‌گیرد.

### علت شکست #1095 (برای کامل‌بودن پرونده)

روی `fbe178be` همان SHA در دو event نتیجهٔ متفاوت داد. علت دقیق:

```
مرحلهٔ ۱۶: "Production Truth Gate — 5 gates, VERIFIED or NOT VERIFIED"  = failure
سپس ۹ مرحله skipped (شامل خودِ npm test و npm run build)
```

یعنی در اجرای push، گیت truth شکست و **`npm test` اصلاً اجرا نشد**؛ در اجرای PR هر
۲۸ مرحله سبز بود. این «CI ناپایدار» نیست — تفاوت واقعیِ رفتار بین دو event است و
دلیل دیگری است بر اینکه یک اجرای سبز روی یک SHA، تأییدِ آن SHA نیست.
