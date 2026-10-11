# PAYESH — POST FT-METRIC-01 — ROADMAP STATUS

**تاریخ:** 2026-10-10
**نوع سند:** ارزیابی read-only — بازگشت به نقشهٔ راه اصلی پس از بستن FT-METRIC-01
**دامنه:** تعیین حقیقت مخزن، بازسازی وضعیت کلان، پیشنهاد دقیقاً یک مأموریت بعدی
**محدودیت‌های اجرا شده:** هیچ fetch/pull/checkout/reset/clean/commit/push انجام نشد. هیچ فایل یا شاخه‌ای تغییر نیافت. هیچ سند مرکزی ویرایش نشد. هیچ آزمونی اجرا نشد.

---

## ۱. حقیقت فعلی مخزن

| فیلد | مقدار | روش تأیید |
|---|---|---|
| مسیر مطلق | `C:\Users\R.M\AppData\Local\hermes\sandboxes\docker\default\workspace\p2` | `pwd` |
| Remote | `origin https://github.com/rezaa2544/p2.git` | `git remote -v` |
| شاخهٔ جاری | `ft-metric-01` | `git branch --show-current` |
| HEAD شاخهٔ جاری | `979bbb40c8657dd6150518a35e59434416c381c6` | `git rev-parse HEAD` |
| آیا `979bbb40` وجود دارد؟ | **بله** — دقیقاً همان کامیت گزارش‌شده در SAFE-COMMIT | `git rev-parse ft-metric-01` |
| HEAD شاخهٔ `main` محلی | `fd83a39927300e65396bfef57980c71abdb87c9d` | `git rev-parse main` |
| `origin/main` در برابر `main` محلی | **یکسان** — `0 ← / → 0`؛ main محلی همگام با remote | `git rev-list --left-right --count main...origin/main` |
| رابطهٔ `ft-metric-01` با `main` | **دقیقاً ۱ کامیت جلوتر** (`0 ← / → 1`)؛ diverged نیست، behind نیست | `git rev-list --left-right --count main...ft-metric-01` |
| رابطهٔ `ft-metric-01` با `origin/main` | **دقیقاً ۱ کامیت جلوتر** (`0 ← / → 1`) | `git rev-list --left-right --count origin/main...ft-metric-01` |
| درخت کاری | تمیز به‌جز یک فایل untracked: `tools/ft/FT-METRIC-01-SAFE-COMMIT-REPORT.md` (گزارش پس از کامیت — مورد انتظار) | `git status --porcelain` |
| آخرین کامیت `main` | `fd83a399` — `docs: reconcile fine-tuning completion queue with executed training state` (2026-10-08 11:43 +0330) | `git log main` |

### خلاصهٔ توپولوژی

```
origin/main ── fd83a399 ── (main محلی = همین)
                  │
                  └── 979bbb40  ← ft-metric-01 (شاخه جاری، +۱ کامیت، push نشده)
```

کامیت `979bbb40` شامل تمام کارهای FT-METRIC-01 است (میتریک v2، رفع `tb.size`، mutation guard، suite تست، بستهٔ تأیید، گزارش closure). این کامیت **روی شاخهٔ `ft-metric-01` است و روی `main` نیست** — هیچ‌یک از فایل‌های FT-METRIC-01 در `main` وجود ندارند (با `git cat-file -e main:<path>` بررسی شد).

---

## ۲. وضعیت FT-METRIC-01

| فیلد | مقدار | منبع |
|---|---|---|
| حکم نهایی | **`CLOSED — VERIFIED WITH NON-BLOCKING FOLLOW-UP`** | `tools/ft/FT-METRIC-01-FINAL-CLOSURE.md` |
| تأیید مستقل | Hermes — ۶/۶ سؤال تأیید شد (با اجرای مستقل دستورات توسط Hermes) | همان سند، §۶ |
| ریشهٔ عیب | `.size` روی Array → `undefined` → `NaN` برای هر امتیاز v1 | `tools/ft/benchmark.js` (تغییر یافته)، `tools/ft/metric-v2.js`، `tools/ft/compare.js` |
| کامیت | `979bbb40` روی شاخهٔ `ft-metric-01` — **push نشده، upstream ندارد** | `git log ft-metric-01` |
| فایل‌های tracked تغییرکرده در کامیت | ۱ (`tools/ft/benchmark.js`) + ۹ فایل untracked که stage شدند | SAFE-COMMIT-REPORT |
| `benchmark-report.json` | **تغییر نکرد** — محتویات ثابت (`base 0.126 / tuned 0.21 / n=2 / delta 0.084`) | خواندن مستقیم فایل |
| پیگیری غیرمسدودکننده | باز اجرای بنچمارک ناممکن است (ورودی‌های `bench-*.jsonl` در `.gitignore` هستند و هرگز commit نشدند) | `FT-METRIC-01-CLOSURE.md` |

### قید صریح

طبق دستور مأموریت، FT-METRIC-01 **دوباره ممیزی نمی‌شود**. حکم ثبت‌شده پذیرفته می‌شود و این سند صرفاً وضعیت آن را در بستر نقشهٔ راه کلی ثبت می‌کند.

یک نکتهٔ حقیقت‌سنجی که باید ثبت شود: چون `979bbb40` روی `main` نیست و push نشده، کار FT-METRIC-01 از دیدگاه `main`/`origin/main` **وجود ندارد**. این یک حقیقت مخزن است، نه یک ادعای بازگشت به عقب — و در بخش ۸ (ناشناخته‌ها) به‌عنوان شکاف evidence ثبت شده است.

---

## ۳. اسناد مرکزی و نقشهٔ راه

اسناد کلیدی خوانده شدند (read-only، بدون ویرایش):

| سند | نقش | وضعیت برنامه‌ای که ثبت می‌کند |
|---|---|---|
| `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` | لایهٔ Ground Truth تاریخی +-chain از reconciliation ها | Phase 8.2 Exit = NOT VERIFIED · Phase 8.3 = BLOCKED · Production GO = NOT DECLARED |
| `docs/CURRENT_WORK_EXECUTION_PLAN.md` (۱۸۶۹ خط) | **برنامهٔ اجرایی متعارف** — جدیدترین سند برنامه | HARDENING / ARCHITECTURE UPGRADE / RECONCILIATION — NOT VERIFIED / NOT CERTIFIED |
| `docs/P0_BLOCKER_TRACKER.md` | ردیاب موانع P0 go-live (مبنا 2026-09-10) | ۶ مانع: ۱ رفع‌شده، ۴ در حال رفع، ۱ بلاک‌شده |
| `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md` | ثبت‌نامهٔ نقص‌های متعارف | صف P0/P1 + نگاشت NCR-01..NCR-27 + B-01..B-07 |
| `docs/STRICT_VERIFICATION_GATE.md` | سیاست fail-closed گواهی | registry عمداً خالی → NOT VERIFIED |
| `docs/verification/VERIFICATION_REGISTRY.json` | registry گواهی | `head_bound = e4584806...` — **به HEAD فعلی بسته نشده** |
| `TODO_BEFORE_PRODUCTION.md` | هدایت تاریخی (compatibility redirect) | مرجع نیست |
| `docs/daily-missions/Chat9/ACTIVE.md` | مأموریت روزانه | مبنا 2026-09-14 — قدیمی |

### زنجیرهٔ معتبر تصمیم

بر اساس بخش «MASTER CLOSURE RECONCILIATION — 2026-10-07» (جدیدترین بخش متعارف):

```
MASTER EVIDENCE/REGISTRY
  ↓
A-30..A-39 + خانواده‌های نقص بحرانی باقی‌مانده
  ↓
M15-01 → M15-02
  ↓
موازی: M15-17 + M15-12 + M15-09
  ↓
M15-03/04/05/06/07/08/10/11/13/14/15/16
  ↓
M15-18 → M15-19 + M15-20
  ↓
تصمیمات M15-21/22/23/24
  ↓
Capability Matrix → Role Matrix → E2E
  ↓
Failure/Recovery → Performance/Scale
  ↓
توافق ChatGPT + Arena + Atria روی current-head
  ↓
تأیید مستقل Hermes
  ↓
M15-25 — گواهی نهایی ۱۰M+ روی یک HEAD دقیق
```

### موقعیت پروژه در یک نگاه

**وضعیت کلان:** `HARDENING / ARCHITECTURE UPGRADE / RECONCILIATION — NOT VERIFIED / NOT CERTIFIED`

مأموریت جاری طبق §۱۱ cross-session handoff:
> *Current mission = M15-01 (static reconciliation complete, runtime pending). Next missions = M15-02 (+ M15-17/M15-12 in parallel) and M15-09 independent verification.*

خط وضعیت متعارف:
> *M15 = OPEN / V2 DESIGN INTEGRATED / NOT IMPLEMENTED / NOT CERTIFIED*

---

## ۴. وضعیت تفکیکی صف‌ها

### تکمیل‌شده (با evidence بسته به SHA خودشان)

| مورد | یادداشت |
|---|---|
| Phase 8.1 | VERIFIED به‌نوبهٔ خودش — ولی شواهد تاریخی است، نه current-head revalidation |
| F-EI-01 (۸ موتور orphan) | بسته — ۲۱/۲۱ runtime-wired |
| N-01..N-35 + PUB-01 | ۳۶ نقص رفع شد (تا `5e527a4c`) |
| OTP 0000 bypass | opt-in شد (M14-A02، push شد) |
| B-PG (F-1/F-2) | تأیید مستقل Hermes روی `5712020b` |
| M13-F3, M14-A01/A02/B01/B02/C01, M15-04, M15-05 | push شدند و SHA remote تأیید شد |
| Fine-tuning pipeline | IMPLEMENTED & TRAINED — بهبود **UNPROVEN** در سطح آماری (holdout n=2) |
| FT-METRIC-01 | CLOSED روی شاخهٔ `ft-metric-01` (محلی) |

### فعال / در حال اجرا

| مورد | یادداشت |
|---|---|
| **M15-01** | static reconciliation کامل (مبنا `1b19449` rebase روی `bb0b5fa`)؛ **runtime inventory و observability/DR sweep معوق** |
| صف صفر — Evidence debt | ۶ قلم: registry stale، three-AI ناقص، strict-gate registry، false-green inventory، current-head invalidation، final evidence ledger |

### مسدودشده

| مورد | نوع مانع |
|---|---|
| M15-02 → M15-25 (زنجیرهٔ کامل) | وابسته به تکمیل M15-01 runtime |
| Phase 8.2 Exit / S3 / S4 | EXTERNAL BLOCKER — محیط E4 چندمیزبانه، receiver/on-call واقعی، S3/off-site |
| Phase 8.3 | BLOCKED BY Phase 8.2 Exit |
| M15-06 | OWNER DECISION — global-ID در برابر composite key |
| M15-15 | OWNER DECISION — off-site/immutable backup target |
| M15-18/19/20 | staging چندنوده (external) |

### شروع‌نشده

| مورد | یادداشت |
|---|---|
| M15-02 Capacity baseline | NOT STARTED — تنها یک اندازه‌گیری جزئی وجود دارد (511/731 events/s) |
| M15-04 Admission/load shedding | NOT FOUND — فقط static national gate |
| M15-08 Redis role separation | NOT FOUND |
| M15-12 Retry/deadline | NOT FOUND — هیچ jitter/budget/deadline‌ای وجود ندارد |
| Three-AI agreement | NOT VERIFIED — ChatGPT + Arena + Atria روی final SHA کامل نشده |

---

## ۵. ریسک‌ها و وابستگی‌های باز

### ریسک‌های اصلی

| ریسک | چرا مهم است |
|---|---|
| **M15-01 نصفه مانده** | static کافی است تا نقشهٔ M15 را بسازد، ولی runtime inventory پیش‌نیاز همهٔ مأموریت‌های بعدی است. هر تأخیری کل زنجیرهٔ ۲۵ آیتمی را عقب می‌اندازد. |
| **Verification Registry به SHA قدیمی بسته است** | `head_bound = e4584806` در حالی که main روی `fd83a399` است. هیچ گواهی current-head‌ای ممکن نیست تا زمانی که registry بازسازی شود. |
| **تکثر صف‌های نقص** | A-01..A-29 + NCR-01..NCR-27 + A-30..A-39 + N-01..N-35 + B-01..B-07 + QUEUE-* + V2-F01..F22. بدون یک register یکپارچهٔ current-head، خطر شمارش مضاعف یا گم‌شدن یافته‌ها بالاست. |
| **هیچ اتاق E4 ای وجود ندارد** | ۰ از ۶ معیار E4 (طبق reconciliation 2026-09-22). تمام ادعاهای ملی (۱۰M کاربر، ۲۰k RPS) بدون evidence باقی می‌مانند. |
| **False-green / test integrity** | ~۵۱۳ ZERO-CHECK، ~۳۱۱ ORPHAN، ~۵۴ MOCK، ~۴۰ swallowed catch (طبق A-37). `NOT RUN` ≠ PASS. |
| **Cascading skip در CI** | شکست یک step باعث skip شدن gateهای بعدی می‌شود (A-40) و evidence runtime را پنهان می‌کند. |
| **کار محلی push نشده** | کامیت `979bbb40` روی `ft-metric-01` بدون upstream. اگر شاخه گم شود، کار از بین می‌رود. |

### وابستگی‌های خارجی (مالک خارج از مخزن)

- provisioning محیط staging چندنره (PG replica + WAL archive + Redis)
- receiver/on-call/acknowledgment واقعی برای S3 alerting
- S3/off-site storage + credentials
- پیمانکار pentest خارجی
- تصمیمات مالک: global-ID در برابر composite key؛ off-site backup target؛ آستانه‌های رسمی RPO/RTO

---

## ۶. مأموریت پیشنهادی بعدی

**تنها یک مأموریت پیشنهاد می‌شود.**

### شناسه

**`M15-01-RUNTIME`** — تکمیل بخش runtime مأموریت M15-01 (Current-head architecture reconciliation)

### چرا این مأموریت (دلیل بر اساس شواهد)

۱. **مأموریت جاری نصفه است.** بخش static کامل شده (Gap Audit "V2 Reconciliation"، مبنا `1b19449` rebase روی `bb0b5fa`)، ولی طبق فیلد Current status در صف M15 V2:
   > *Runtime inventory (hot paths by RPS, query plans) PENDING; observability/DR sweep PARTIAL.*

۲. **پیش‌نیاز همه چیز است.** طبق dependency graph مستند:
   ```
   M15-01 ─► M15-02 ─► M15-03/04/05
   M15-01 ─► M15-12 ─► M15-11
   M15-01 ─► M15-13 ─► M15-14 ─► M15-16
   M15-01 ─► M15-17
   ```
   هیچ‌یک از ۲۴ مأموریت دیگر بدون M15-01 کامل قابل شروع نیستند.

۳. **بدون پیش‌نیاز خارجی.**Blocking condition در صف صریحاً `"None (read-only)"` است. این مأموریت برخلاف Phase 8.2 Exit، E4 staging، یا M15-06 نیازی به تصمیم مالک یا provisioning ندارد.

۴. **بدون نیاز به merge.** چون read-only است، شاخهٔ `ft-metric-01` می‌تواند همان‌طور که هست باقی بماند و کار روی شاخهٔ اصلی/جاری ادامه یابد.

۵. **جلوگیری از mission drift.** شروع مأموریت جدید قبل از تکمیل مأموریت جاری دقیقاً نوع خطایی است که «MISSION DRIFT / GOAL-LOCK / COMPLETION GUARD» (2026-10-08) آن را ممنون می‌کند.

۶. **SHA از زمان static کار جلو رفته است.** static روی `bb0b5fa` بسته شده؛ `main` اکنون `fd83a399` است. پذیرش Rule 26/31 (sync/reconcile) ایجاب می‌کند که register دوباره روی HEAD فعلی بسته شود.

### پیش‌نیازها

- HEAD دقیق ضبط شود (`fd83a399` روی `main` یا HEAD شاخهٔ کاری) — بدون مبنا‌گذاری روی SHA تاریخی
- فهرست commitهای بعد از `bb0b5fa` استخراج و بررسی شود (delta: fine-tuning pipeline، docs reconciliation)
- هیچ کدی تغییر نمی‌یابد — این مأموریت صرفاً read-only inventory است
- PG و Redis محلی (موجود روی این ماشین) برای query-plan extraction در صورت اجرای پروب‌ها

### دامنه

۱. **Runtime hot-path inventory** — نگاشت هر لایه (HTTP routes → handlers → DB queries → Redis ops → outbox/worker) با `file:line`.
۲. **Query plans** — `EXPLAIN ANALYZE` برای endpointهای داغ روی کاردینالیتی ملی (در صورت اجرای روی live PG).
۳. **Observability/DR sweep** — تکمیل بخش PARTIAL: پوشش metricها، alert rules، ابزارهای DR روی HEAD فعلی.
۴. **Re-bind روی HEAD فعلی** — register خروجی باید دقیقاً به SHA جاری بسته شود، نه `bb0b5fa` یا `e4584806`.
۵. **Delta listing** — فهرست صریح commitهای بالادست از آخرین اجرای static.

### خارج از دامنه (Non-Goals)

- اصلاح هرگونه نقص کشف‌شده (ثبت در صف متعارف، بازگشت به Primary Objective)
- باز کردن FT-METRIC-01
- باز اجرای بنچمارک
- ساخت یا تغییر اسناد مرکزی (فقط سند خروجی مأموریت ساخته می‌شود)
- هرگونه ادعای ظرفیت ملی (این مأموریت inventory است، نه measurement)

### تحویل‌ها

- سند `M15-01-RUNTIME-REPORT.md` شامل:
  - جدول کامل hot-pathها با `file:line` و اولویت RPS تقریبی (از تحلیل کد + پروب‌های محلی)
  - خروجی `EXPLAIN ANALYZE` برای top endpointها (در صورت اجرای روی live PG)
  - چکیدهٔ observability/DR sweep
  - فهرست commitهای بالادست از `bb0b5fa`
  - SHA مبنا + دستورات دقیق اجرا
  - فهرست نقص‌های کشف‌شده (برای صف متعارف، نه برای اصلاح در این مأموریت)

### معیارهای پذیرش

| # | معیار | روش بررسی |
|---|---|---|
| ۱ | register تمام لایه‌ها را با `file:line` پوشش می‌دهد | بازبینی مستقل — نمونه‌گیری تصادفی ≥۱۰ مدخل و تأیید وجود مسیر در آن خط |
| ۲ | register به HEAD دقیق اجرا بسته است، نه SHA تاریخی | تطبیق SHA در سند با `git rev-parse HEAD` |
| ۳ | تمام commitهای بالادست از `bb0b5fa` فهرست شده‌اند | `git log bb0b5fa..HEAD --oneline` |
| ۴ | query planها برای ≥۵ endpoint داغ ارائه شده یا دلیل صریح برای عدم اجرا داده شده | خروجی خام یا یادداشت محیطی |
| ۵ | observability/DR sweep از PARTIAL به COMPLETE رسیده و وجوه ناقص صراحتاً برچسب خورده‌اند | مقایسه با چکیدهٔ قبلی |
| ۶ | هیچ کد تغییری نکرده | `git status` تمیز (به‌جز فایل‌های سند مأموریت) |
| ۷ | هیچ `NOT RUN` به‌عنوان PASS ثبت نشده | بازبینی هر مدخل — صراحتاً برچسب NOT-RUN خورده باشد |

---

## ۷. معیارهای پذیرش و طرح تأیید مستقل

### طرح تأیید مستقل (Hermes)

Hermes به‌عنوان تأییدکنندهٔ مستقل، این سؤالات را بررسی می‌کند:

| # | سؤال | شواهد مورد نیاز |
|---|---|---|
| ۱ | آیا register واقعاً تمام لایه‌ها را پوشش می‌دهد؟ | نمونه‌گیری تصادفی ≥۱۰ `file:line` — بررسی وجود مسیر در خط اشاره‌شده |
| ۲ | آیا SHA مبنا واقعاً HEAD اجرا است؟ | تطبیق با `git rev-parse HEAD` در زمان اجرای Hermes |
| ۳ | آیا فهرست commitهای بالادست کامل است؟ | مقایسه با `git log bb0b5fa..HEAD --oneline` |
| ۴ | آیا query planها واقعی هستند (در صورت ارائه)؟ | بررسی دستور `EXPLAIN ANALYZE` و تطبیق با schema فعلی |
| ۵ | آیا هیچ کد تغییری نکرده؟ | `git diff` تمیز |
| ۶ | آیا مدخل‌ها به‌درستی برچسب‌گذاری شده‌اند (MEASURED / ASSUMED / NOT-RUN)؟ | بازبینی نمونه‌ای |

### قوانین حاکم بر تأیید

- **NOT RUN ≠ PASS** — هر مدخل بدون شواهد اجرا باید صراحتاً NOT-RUN باشد
- هیچ ارتقای status بدون evidence امکان‌پذیر نیست
- گزارش Hermes به‌تنهایی گواهی نیست — نیاز به توافق ChatGPT + Arena + Atria دارد
- شواهد تاریخی به‌طور خودکار به current-head evidence ارتقا نمی‌یابد

### شرط توقف

- توقف پس از تحویل سند و معیارهای ۱–۷
- اگر پروب‌های runtime روی live PG ناممکن باشند: ثبت دلیل صریح، برچسب NOT-RUN، ادامهٔ بخش‌های static، و توقف
- اگر نقص بحرانی کشف شود: ثبت در صف متعارف، بازگشت به Primary Objective، بدون اصلاح در این مأموریت

### تعریف Done

مأموریت وقتی Done است که:
۱. هر دو بخش (runtime inventory + observability/DR sweep) کامل شده یا دلیل صریح برای عدم تکمیل ثبت شده باشد؛
۲. register به HEAD دقیق بسته شده باشد؛
۳. معیارهای پذیرش ۱–۷ همگی برقرار باشند؛
۴. Hermes تأیید مستقل انجام داده باشد؛
۵. حکم نهایی یکی از `VERIFIED / COMPLETE`، `PROMISING BUT UNPROVEN`، `BLOCKED`، یا `NOT COMPLETE` با شواهد صریح باشد.

---

## ۸. ناشناخته‌ها و شواهد مفقود

این موارد صراحتاً به‌عنوان شکاف ثبت می‌شوند — هیچ فرضی ساخته نشد:

| # | مورد ناشناخته | وضعیت شواهد |
|---|---|---|
| ۱ | **کار FT-METRIC-01 روی `main`/`origin/main` وجود ندارد** | کامیت `979bbb40` فقط روی شاخهٔ محلی `ft-metric-01` است. push مجوز جداگانه می‌خواهد و این مأموریت مجاز به آن نبود. این یک شکاف evidence است، نه یک ادعای بازگشت به عقب. |
| ۲ | **وضعیت CI روی HEAD فعلی نامشخص** | طبق Ground Truth: «GitHub Actions workflow runs for this exact SHA: none returned». این برای `fd83a399` بررسی نشد چون به دسترسی GitHub نیاز دارد (read-only محلی). |
| ۳ | **npm test روی این checkout اجرا نشد** | این مأموریت read-only بود. وضعیت suite تست فعلی تأیید نشده. |
| ۴ | **درصد پیشرفت کلی پروژه اعلام نمی‌شود** | `P0_BLOCKER_TRACKER.md` عدد ۵۷٪ را ثبت کرده ولی مبنا آن 2026-09-10 است و صف‌های بعدی (M15 V2، A-30..A-39، NCR، B) را پوشش نمی‌دهد. ساختن درصد جدید = جعل شماره. |
| ۵ | **وضعیت واقعی ~۲۰ شاخهٔ `origin/arena-*` و `origin/alert-autofix-*`** | روی remote موجودند ولی reconciliation آن‌ها با `main` در این مأموریت بررسی نشد. |
| ۶ | **خروجی runtime inventory هرگز اجرا نشده** | طبق صف: runtime PENDING. هیچ شواهدی از قبل وجود ندارد که پیش‌بینی کند زمان یا نتایج آن را. |
| ۷ | **آیا پروب‌های live PG روی این ماشین در دسترس هستند** | PG 16 + Redis محلی موجودند (طبق حافظهٔ پروژه)، ولی اتصال در این مأموریت امتحان نشد. |

---

## ۹. تصمیم نهایی

### رد گزینه‌های رقیب

| گزینه | چرا رد شد |
|---|---|
| **M15-02 Capacity baseline** | وابسته به M15-01 (ناقص). شروع آن نقض وابستگی مستند است. |
| **M15-17 Configuration safety** | وابسته به M15-01. گرچه «execute early» و کوچک است، اولویت M15-01 تکمیل‌نشده مقدم است. کاندیدای قوی برای مأموریت بعد از M15-01. |
| **M15-12 Retry/deadline** | وابسته به M15-01. شامل migration (دادهٔ `next_attempt_at`) است که در read-only محیط نامناسب است. |
| **M15-09 تأیید invalidation** | نیاز به اجرای دو-instance روی live PG+Redis دارد. ممکن است، ولی اولویت پایین‌تر از تکمیل پیش‌نیاز اصلی. |
| **باز کردن FT-METRIC-01** | صراحتاً توسط دستور مأموریت ممنون شد. |
| **push/merge کارهای محلی** | بدون مجوز جداگانه مجاز نیست. |
| **اصلاح نقص F1/F2/F4** | اینها P0/P1 هستند ولی در صف متعارف تعیین تکلیف شده‌اند و مالکیت Atria-1 دارند. شروع آن‌ها بدون مأموریت اجرایی صریح نقض حاکمیت است. |

### حکم

**`READY FOR NEXT MISSION`**

مأموریت پیشنهادی: **`M15-01-RUNTIME`** — تکمیل بخش runtime مأموریت M15-01 (read-only، بدون پیش‌نیاز خارجی، پیش‌نیاز تمام ۲۴ مأموریت بعدی M15 V2).

این مأموریت بدون تأیید اضافی قابل شروع است چون:
- تمام اطلاعات لازم از اسناد مرکزی استخراج شده است؛
- هیچ وابستگی خارجی یا تصمیم مالک ندارد؛
- read-only است و هیچ تغییر state‌ای ایجاد نمی‌کند؛
- در محیط فعلی (single box) قابل اجراست.

---

### یادداشت صحت‌سنجی این سند

- تمام حقایق مخزن با دستورات `git` مستقیماً روی این checkout تأیید شدند (جدول بخش ۱ روش هر کدام را ثبت می‌کند).
- تمام وضعیت‌های برنامه‌ای از اسناد مرکزی خوانده شدند — نه از حافظه، نه از استنتاج.
- هیچ درصد پیشرفتی ساخته نشد.
- هیچ فایل یا شاخه‌ای تغییر نیافت؛ `git status` پیش و پس از این سند یکسان است (تنها یک فایل untracked: همین سند).
- این سند یک سند وضعیت است، نه گواهی. هیچ `VERIFIED`‌ای داده نشده است.


---

## Control-plane priority update — 2026-10-11 (queued, not execution evidence)

Following the expert recommendation tracked in Issue #443, the next primary workstream is M15-02: measured capacity baseline. M15-09 (live two-instance PostgreSQL + Redis verification through the real timer), M15-12 (jittered backoff and next_attempt_at), and M15-17 (config validation, including NaN rejection) may run in parallel only with explicit ownership and separated scope. Fine-tuning/PEB/Experience Store is SUPPORTING/DEFERRED unless new evidence warrants reprioritization. M15-10/S9 and QUEUE-CAPACITY-1 remain supporting queue items.

Mandatory gates: record exact commands, output, exit code, SHA, environment and limitations; NOT-RUN/NOT AVAILABLE/BLOCKED/synthetic-only is never PASS; mutation-test important regression tests; no 10M-scale or production-ready claims before M15-25; freeze/rebuild Verification Registry only on the final SHA. Re-run docs-index-coverage, documentation-map-coverage, and onboarding-coverage against current main. Review QUEUE-CAPACITY-1 for unbounded outbox/dead-letter growth, watermark and stale-instance behavior, and restart/replay. Operational DB evidence remains NOT AVAILABLE unless access is actually established; synthetic tests must be labelled accordingly.

**Review trigger:** independent Hermes verification once M15-02 and M15-09/12/17 each reach verified evidence or a clearly documented blocker. This roadmap note records the required order only; it does not claim execution or completion.
