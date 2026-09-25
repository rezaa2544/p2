# ROOT CAUSE REAPPEARANCE / DEFECT RECURRENCE ELIMINATION PROGRAM
## 2026-09-25

### Purpose
این سند برای مسئله‌ای است که در گزارش‌های متوالی دیده شد: یک مورد در یک گزارش FIXED می‌شود، اما در ممیزی بعدی همان invariant یا همان خانوادهٔ خطا دوباره شکسته می‌شود. هدف، بستن «آیتم» نیست؛ هدف حذف مکانیزمی است که اجازه می‌دهد defect دوباره در مسیر دیگری، روی HEAD دیگری، یا بعد از merge دوباره ظاهر شود.

**حکم:** از این تاریخ، «FIXED» برای مواردی که فقط نقطهٔ مشاهده‌شده را اصلاح کرده‌اند، closure ریشه‌ای محسوب نمی‌شود. Closure ریشه‌ای فقط وقتی ممکن است که invariant در همهٔ مسیرهای مرتبط، روی current/final HEAD، با negative/adversarial regression و independent review اثبات شود.

---

## 1. الگوی تکرارشونده‌ای که گزارش‌ها اثبات می‌کنند

### Pattern A — Fix موضعی به‌جای invariant سراسری
**نمونه:** A-20.
- در یک ممیزی قبلی OCC عمدتاً در مسیر grades دیده شد و وضعیت به‌عنوان مشکل عمومی در همهٔ PATCHها تثبیت نشده بود.
- ممیزی مستقل بعدی تمام پنج PATCH موجود را بررسی کرد و stale-write/asymmetry را در مسیرهای دیگر بازتولید کرد؛ سپس 34/34 regression روی fix اجرا شد.
- نتیجه: مشکل اصلی فقط یک checkOcc نبود؛ **قرارداد OCC در سطح mutation inventory به‌صورت سراسری enforce نشده بود.**

**Root cause:** scope فنیِ fix برابر با scope واقعی invariant نبود + inventory کامل mutation قبل از closure وجود نداشت.

**Permanent control:** برای هر security/data-integrity invariant یک inventory machine-readable از تمام entrypointها، REST، sync، worker و direct persistence ساخته شود و gate بدون پوشش کامل اجازهٔ closure ندهد.

### Pattern B — «Not a defect» یا PASS قبل از adversarial reproduction
**نمونه:** A-20 و A-22.
- A-20 در یک مرحله NOT A DEFECT گزارش شد، سپس re-audit stale-write را در پنج entity بازتولید کرد.
- A-22 بعداً یک boot hole در REDIS_URL-only + نبود commandTimeout را نشان داد؛ بعد fix شد و residual صریح باقی ماند.
- نتیجه: **طبقه‌بندی اولیه قبل از بازتولید adversarial و مسیرهای configuration matrix ممکن است زودهنگام باشد.**

**Root cause:** triage بر اساس کد/سناریوی معمول، نه بر اساس complete configuration × failure-mode matrix.

**Permanent control:** هیچ NOT A DEFECT یا ACCEPTED RISK بدون reproduction attempt ثبت‌شده، negative case، configuration matrix و reviewer مستقل معتبر نیست.

### Pattern C — evidence روی SHA قدیمی، کد روی SHA جدید
**نمونه:** A-18/A-20/A-24 و Registry.
- گزارش‌ها evidence قوی روی branch/SHA جدا تولید کردند.
- بعد main جلو رفت و registry همچنان به audit SHA قبلی متصل ماند.
- بنابراین چیزی که «قبلاً fixed» بوده لزوماً روی current HEAD ثابت نشده است.
- Arena current-head نیز صریحاً global invariant را NOT VERIFIED نگه داشت، با وجود targeted passes.

**Root cause:** evidence lifecycle از code lifecycle جدا بوده و rebind اجباری پس از merge وجود نداشته است.

**Permanent control:** هر material merge → invalidate current certification bindings → current-head regression → registry rebind فقط بعد از evidence.

### Pattern D — مسیرهای دوتایی / twin gates
**نمونه:** A-34/A-35 و A-18.
REST، sync، conflict، worker و client گاهی policy مشابه را جداگانه پیاده می‌کنند.

**Root cause:** یک policy/invariant چند implementation مستقل دارد؛ fix در یکی الزاماً دیگری را اصلاح نمی‌کند.

**Permanent control:** authorization/ownership/OCC باید یک authoritative policy contract داشته باشد و همهٔ entrypointها آن را مصرف کنند؛ test matrix باید تمام adapters را همزمان پوشش دهد.

### Pattern E — compatibility / fallback مسیر دوم می‌سازد
**نمونه:** Sync/OCC current-head.
در strict/production رفتار جدید enforce می‌شود، اما legacy/LWW بدون base عمداً باقی مانده و 30 cell failure در global invariant دیده شد.

**Root cause:** compatibility mode عملاً یک semantic branch مستقل است و invariant سراسری دیگر روی آن برقرار نیست.

**Permanent control:** برای هر compatibility mode یک قرارداد مستقل، scope صریح، expiry و test suite مستقل لازم است. compatibility نباید ناخواسته داخل certification invariant عمومی شمرده شود.

### Pattern F — false-green و test integrity اجازهٔ تکرار می‌دهد
**نمونه:** A-07/A-08/A-09..A-17 و A-37.
assert(true)، process.exit(0)، skipهای environment، mock-only و suiteهای خارج از gate باعث می‌شوند defect یا regression به‌موقع دیده نشود.

**Root cause:** test existence با test effectiveness اشتباه گرفته شده است؛ certification path همهٔ test-like artifacts را enforce نمی‌کند.

**Permanent control:** هر test certification-critical باید prerequisite failure را NOT-RUN/FAIL کند، assertion مؤثر داشته باشد، target واقعی را اجرا کند، exit code معتبر داشته باشد، evidence artifact بسازد و در gate ثبت شود.

---

## 2. ریشهٔ مشترک بالاتر از A-18..A-39

گزارش‌های جدید و قدیمی یک ریشهٔ سیستمی مشترک نشان می‌دهند:

> **سامانه برای «رفع defect» بهتر شده، اما هنوز برای «حفظ invariant پس از تغییرات، mergeها، configurationها و مسیرهای جایگزین» به‌اندازهٔ کافی خودکار و اجباری نشده است.**

این ریشه به چهار ضعف تبدیل می‌شود:

1. **Scope weakness:** fix نقطه‌ای، invariant سراسری نیست.
2. **Change-boundary weakness:** merge باعث invalidate شدن evidence نمی‌شود مگر اینکه انسان آن را انجام دهد.
3. **Path-completeness weakness:** همهٔ route/config/worker/client variants الزاماً همزمان تست نمی‌شوند.
4. **Certification weakness:** gate و test inventory هنوز در حال سخت‌تر شدن هستند.

بنابراین برنامهٔ ریشه‌کنی باید این چهار لایه را همزمان اصلاح کند.

---

## 3. برنامهٔ ریشه‌کنی — اولویت P0

### P0-1 — Invariant Registry
برای هر invariant امنیتی/داده‌ای یک رکورد ایجاد شود:
- invariant دقیق
- owner
- تمام entrypointها
- تمام state transitions
- تمام configuration modes
- positive cases
- negative cases
- adversarial cases
- failure/restart cases
- persistence readback
- exact current SHA
- required independent reviewers

A-18, A-20, A-22, A-24, A-34, A-35 ابتدا روی این مدل قرار گیرند.

### P0-2 — Automatic evidence invalidation
بعد از هر merge کد:
- evidence SHA قبلی برای claimهای affected stale شود؛
- registry status به REVALIDATION_REQUIRED برود؛
- فقط اجرای دوباره روی SHA جدید اجازهٔ promotion بدهد.

### P0-3 — Mutation / Route / Configuration inventory
سه inventory اجباری:
- Mutation inventory: REST + sync + workers + direct DB writes
- Auth inventory: role × tenant × ownership × endpoint
- Failure/config inventory: Redis/PG/provider/env/legacy/strict/restart

### P0-4 — Reappearance regression
برای هر defect قدیمی که دوباره پیدا شده:
- baseline reproduction
- root cause
- fix
- mutation test / kill test
- alternate-path test
- post-merge current-head test

یک Reappearance Suite دائمی ساخته شود؛ حذف آن ممنوع مگر با جایگزین قوی‌تر.

### P0-5 — Single-source policy
برای OCC، ownership، tenant scope، revocation و conflict:
- یک authoritative policy implementation
- adapterهای REST/sync/client فقط caller باشند
- اختلاف policy در code review به‌عنوان defect معماری شناخته شود.

---

## 4. برنامهٔ موردی

| مورد | recurrence mechanism | ریشه | اقدام ریشه‌ای |
|---|---|---|---|
| A-18 | conflict fix vs current sync/offline invariant | state decision در چند لایه + stale evidence | transaction invariant + sync/client current-head matrix |
| A-20 | grades-only assumption → later five-route stale write | ناقص بودن mutation inventory | تمام PATCH inventory + universal OCC contract |
| A-22 | initial Redis handling → later REDIS_URL-only boot hole | config matrix ناقص | failure/config matrix + boot gate test |
| A-24 | duplicate/OCC fixes scoped to branch | multi-process/client persistence boundaries | UID/OCC invariant across HTTP+sync+browser+restart |
| A-31 | semantic engine fixes but new residual defaults | fallback/self-attestation | causal metric provenance + no-data semantics |
| A-34 | REST/sync ownership divergence | twin authorization gates | shared policy + cross-path matrix |
| A-35 | strong 15/15 result but current-head revalidation still needed | evidence tied to audit/base SHA | merge invalidation + current-head re-run |
| A-37 | many test-like artifacts not enforcing gates | test inventory debt | certification-critical test registry |

---

## 5. Definition of Root-Cause Closure

یک مورد فقط وقتی **ROOT-CAUSE-CLOSED** است که همهٔ این‌ها برقرار باشند:

- defect reproduced;
- trigger identified;
- contributing architectural cause identified;
- fix applied at source, not symptom;
- alternate paths audited;
- negative/adversarial regression;
- restart/failure regression where applicable;
- current final SHA evidence;
- no false-green mechanism;
- independent ChatGPT review;
- independent Arena review;
- independent Atria review;
- registry re-bound to same SHA.

در غیر این صورت وضعیت فقط یکی از این‌هاست:
FIXED-SCOPED, PARTIALLY VERIFIED, BLOCKED, ACCEPTED RISK, REVALIDATION_REQUIRED, یا NOT VERIFIED.

---

## 6. اولویت اجرایی جدید

**قبل از گسترش certification:**
1. A-30 gate hardening
2. ساخت Invariant Registry و Reappearance Suite
3. A-31..A-36 با root-cause closure
4. A-37 اتصال test inventory به gate
5. freeze final hardening SHA
6. current-head full regression
7. A-38 registry rebind
8. سه review مستقل
9. A-39 E4
10. سپس Capability/Role/E2E/Failure-Recovery/Performance

### گزینه‌های اجرایی
**گزینه A — Root-cause first (پیش‌فرض):** تمام P0ها قبل از certification.  
**گزینه B — Parallel preparation:** ساخت E4 و inventory همزمان، بدون promotion.  
**گزینه C — Blocked investigation:** اگر زیرساخت/دسترسی مانع است، reproduction + root cause + unblocker ثبت شود و مورد BLOCKED بماند.

---

## 7. Rule for all future reports

هیچ گزارش آینده نباید فقط بگوید «X fixed».

فرمت اجباری:
**What failed → Where reproduced → Why it happened → Why previous fix did not prevent recurrence → Source-level fix → Other paths checked → Regression → Current SHA → Independent review → Remaining boundary.**
