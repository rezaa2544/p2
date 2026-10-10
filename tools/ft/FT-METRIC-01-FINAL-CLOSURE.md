# FT-METRIC-01 — FINAL CLOSURE

**Verdict: `CLOSED — VERIFIED WITH NON-BLOCKING FOLLOW-UP`**

**Date:** 2026-10-10
**Executor:** Atria / ZCode
**Independent verifier:** Hermes (Verification Engine) — see §۶
**Baseline HEAD:** `fd83a39927300e65396bfef57980c71abdb87c9d`

---

## ۱. وضعیت واقعی مخزن

| Field | Value |
|---|---|
| مسیر مطلق | `C:\Users\R.M\AppData\Local\hermes\sandboxes\docker\default\workspace\p2` |
| branch واقعی | `ft-metric-01` |
| HEAD کامل | `fd83a39927300e65396bfef57980c71abdb87c9d` |
| مطابقت با baseline | **بله** — HEAD == `fd83a399` |
| فایل‌های tracked تغییرکرده | **۱** (`tools/ft/benchmark.js` — ۳ insertions / ۳ deletions؛ از مأموریت ۱، این مأموریت دست نخورده) |
| remote | `origin https://github.com/rezaa2544/p2.git` — از این جعبه **غیرقابل دسترس** |
| محیط | MINGW64_NT-10.0-22631 (Git Bash واقعی ویندوز)، Node v24.21.0، `cygpath` موجود |

**فایل‌های untracked مرتبط با `tools/ft/`** (۱۲ فایل — شمارش نهایی پس از افزودن بسته شواهد):

| گروه | فایل‌ها |
|---|---|
| **A — ضروری برای عملکرد/آزمون** | `metric-v2.js`، `mutation-test.sh`، `tests/metric-v2.test.js` |
| **B — گزارش/شواهد ثبت نتیجه** | `FT-METRIC-01-REMEDIATION-REPORT.md`، `FT-METRIC-01-INDEPENDENT-VERIFICATION.md`، `FT-METRIC-01-FINAL-REPORT.md`، `FT-METRIC-01-PATH-FIX-REPORT.md`، `FT-METRIC-01-PERMANENT-CONTROLS.md`، `FT-METRIC-01-VERIFICATION-PACKAGE.md`، `FT-METRIC-01-FINAL-CLOSURE.md` (همین فایل) |
| **C — خروجی موقت/غیرضروری** | `metric-v2-comparison.json`، `metric-v2-partial-report.json` |

هیچ فایلی حذف یا overwrite نشد. هیچ فایل untracked‌ای صرفاً به‌خاطر untracked بودن نادیده گرفته نشد.

---

## ۲. اصلاحات انجام‌شده

دو اصلاح داخل دامنه، که هر دو در checkout واقعی موجود و تأییدشده‌اند:

**اصلاح ۱ — باگ `tb.size` (FT-METRIC-01-R1).** `toks()` یک `Array` برمی‌گرداند؛ `.size` روی Array مقدار `undefined` دارد، پس کد قدیمی `hit / undefined` = `NaN` برای هر امتیاز برمی‌گرداند. اصلاح: `.length` در سه تابع مستقل:
- `overlap()` — `tools/ft/metric-v2.js:117,120`
- `sim()` — `tools/ft/benchmark.js:25,28`
- `sim()` — `tools/ft/compare.js:21,24`

**اصلاح ۲ — تبدیل مسیر probe-based (`node_readable()`).** در `tools/ft/mutation-test.sh` خطوط ۳۸–۶۴: ابتدا با `node -e 'require("fs").readFileSync(...)'` می‌سنجد آیا Node مسیر را می‌خواند؛ فقط در صورت شکست با `cygpath -m` تبدیل می‌کند؛ اگر cygpath نباشد یا مسیر تبدیل‌شده هنوز خوانا نباشد، با پیام `FATAL` و exit 2 متوقف می‌شود. این راهکار جایگزین پیشنهاد تبدیل بی‌قیدوشرط هرمس شد، با دلیل فنی: تبدیل بی‌قیدوشرط در محیط‌های سالم رفتار را تغییر می‌داد و مسیر fail-closed نداشت.

---

## ۳. فایل‌های تغییرکرده و untracked

| فایل | sha256 | وضعیت در این مأموریت |
|---|---|---|
| `tools/ft/metric-v2.js` | `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` | تغییر نکرد |
| `tools/ft/tests/metric-v2.test.js` | `c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e` | تغییر نکرد |
| `tools/ft/benchmark.js` | `eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff` | تغییر نکرد (ویرایش pre-existing از مأموریت ۱) |
| `tools/ft/mutation-test.sh` | `fe5f0577176555ccced1d3096bdf6db1ccee5660793ae33b71f8c95910a5dcfc` | تغییر نکرد در این مأموریت (اصلاح در مأموریت ۲) |
| `tools/ft/FT-METRIC-01-VERIFICATION-PACKAGE.md` | جدید | ساخته‌شد — بسته شواهد هرمس |
| `tools/ft/FT-METRIC-01-FINAL-CLOSURE.md` | جدید | ساخته‌شد — همین گزارش |

هیچ فایل tracked‌ای در این مأموریت ویرایش نشد. هیچ فایلی stage یا commit نشد.

---

## ۴. جدول معیارهای پذیرش

### مرحله ۲.۱ — قرارداد `overlap()` و `sim()` (آزمون جداگانه، ۲۴/۲۴ PASS)

| معیار | نتیجه | شواهد |
|---|---|---|
| هویت ورودی معتبر → `1.0` | PASS | `overlap(x,x) === 1`؛ `sim(x,x) === 1` در هر دو پیاده‌سازی |
| هم‌پوشانی جزئی | PASS | `0.75` = ۳ توکن مشترک از ۴ (۳/۴) |
| بدون هم‌پوشانی → ۰ | PASS | `overlap('alpha bravo charlie','delta echo foxtrot') === 0` |
| ورودی خالی → ۰ | PASS | پاسخ خالی، expected خالی، هر دو خالی: هر سه `0` |
| خروجی finite، بدون NaN | PASS | ۳۶ ترکیب از ۶ نمونه؛ همه finite، هیچ NaN |
| بررسی جداگانه دو تابع | PASS | `overlap` در metric-v2.js، `sim` در benchmark.js و compare.js — هر سه جدا تست شدند و `.length` در همه تأیید شد |

### مرحله ۲.۲ — مسیرهای PLAIN و DIFF

| معیار | نتیجه | شواهد |
|---|---|---|
| مسیر PLAIN از پیاده‌سازی صحیح | PASS | row 0: `format_kind: PLAIN`، `FORMAT_OK`، `content_score_v2: 1` |
| مسیر DIFF سالم | PASS | row 1: `format_kind: DIFF`، `FORMAT_OK`، `content_score_v2: 1` |
| اصلاح یک مسیر دیگری را خراب نکرده | PASS | هر دو مسیر در یک اجرا سبز؛ خروجی `content_slice` صحیح (`full` برای PLAIN، `diff` برای DIFF) |
| وابستگی‌های مستقیم شناسایی | PASS | `contractOf()` نوع را تعیین می‌کند؛ `thresholds` در خروجی نمایان |

### مرحله ۲.۳ — آزمون 4b

| معیار | نتیجه | شواهد |
|---|---|---|
| سبز روی کد اصلاح‌شده | PASS | `PASS 4b...`، ۱۹ passed / ۰ failed |
| شکست با تزریق باگ در کپی موقت | PASS | `FAIL 4b...`، ۱۸ passed / ۱ failed، suite exit 1 |
| کنترل مثبت و منفی معنادار | PASS | کنترل مثبت: payload دقیقاً بازتولید می‌شود؛ کنترل منفی: metadata یکسان، payload جایگزین — v1 باید کور باشد (`v1_pos === v1_neg`) ولی v2 تفاوت را ببیند (`v2_pos > v2_neg`) |
| فایل‌های اصلی دست‌نخورده | PASS | هش قبل و بعد: `1f7937e5...` |

### مرحله ۳ — Mutation Guard (۱۰ معیار)

| # | معیار | نتیجه |
|---|---|---|
| ۱ | Node می‌تواند مسیرهای واقعی METRIC/TEST را بخواند | PASS |
| ۲ | مسیر خوانا بدون تبدیل غیرضروری کار می‌کند | PASS — probe موفق، مسیر دست‌نخورده باقی ماند |
| ۳ | نتیجه تبدیل دوباره بررسی می‌شود | PASS — `readFileSync` روی مسیر تبدیل‌شده |
| ۴ | تبدیل ناممکن → exit غیرصفر | PASS — `FATAL` + exit 2 |
| ۵ | هیچ ERROR به‌عنوان KILLED شمرده نشود | PASS — probe زنده‌بافی جدا می‌کند |
| ۶ | SURVIVED > 0 → شکست | PASS — `KILLED=6 SURVIVED=1` → exit 1 |
| ۷ | ERROR > 0 → شکست | PASS — `ERROR=6` → exit 1 |
| ۸ | GUARD: PASS فقط با موفقیت واقعی | PASS |
| ۹ | خروجی چاپی با exit code تناقض ندارد | PASS |
| ۱۰ | cleanup در موفقیت و شکست | PASS — هیچ دایرکتوری `/tmp/ftmut*` پس از اجرای نهایی (۱۹:۲۸) باقی نماند |

### مرحله ۴ — benchmark

| معیار | نتیجه |
|---|---|
| ورودی خام برای بازاجرای موجود است؟ | **خیر** — `bench-base.jsonl` و `bench-tuned.jsonl` هرگز commit نشده‌اند (`.gitignore:79`) |
| گزارش تاریخی overwrite شد؟ | خیر — `benchmark-report.json` دست‌نخورده |
| اعداد از داخل JSON بازمحاسبه شدند؟ | خیر — به‌عنوان عدد تاریخی ثبت شدند |

---

## ۵. فرمان‌ها، خروجی‌ها و exit codeها

تمام اجراها در MINGW64_NT-10.0-22631، Node v24.21.0، در مسیر ریشه مخزن.

**CMD 1 — `node tools/ft/tests/metric-v2.test.js`**
- ورودی: `tools/ft/tests/metric-v2.test.js` (۱۹ check)
- خروجی: `19 passed, 0 failed`
- **exit code: 0**
- موفق: ۱۹ / ناموفق: ۰

**CMD 2 — `bash tools/ft/mutation-test.sh`**
- ورودی: `tools/ft/metric-v2.js` + `tools/ft/tests/metric-v2.test.js` (۶ mutation)
- خروجی: `KILLED | MUT1..MUT5` هر کدام exit=1؛ `KILLED=6 SURVIVED=0 ERROR=0 (total 6)`؛ `GUARD: PASS`
- **exit code: 0**
- موفق: ۶ mutation کشته / ناموفق: ۰

**CMD 3 — کنترل منفی 4b** (`node "$TEMP/ft-inject-bug.js" metric test copy`)
- ورودی: کپی موقت metric با `tb.length`→`tb.size` تزریق‌شده
- خروجی: `FAIL 4b. v1 word-overlap is blind to symbol-only patch payload`؛ `18 passed, 1 failed`
- **suite exit code: 1**
- هش metric واقعی پس از اجرا: `1f7937e5...` (تغییر نکرد)

**CMD 4 — fail-closed** (`bash "$TEMP/ft-failclosed-test.sh"`)
- ورودی: کپی موقت metric با خطای syntax (`function 123diffTokens`)
- خروجی: `KILLED=0 SURVIVED=0 ERROR=6 (total 6)`؛ `GUARD: FAIL`
- **GUARD exit code: 1**
- *نکته ثبت‌شده توسط هرمس:* بلوک verbatim این گزارش شامل خط `cleanup: OK` بود که در اجرای مجدد هرمس چاپ نشد — این خط از خروجی ترکیبی دو آزمون درون یک اسکریپت می‌آید و بر هیچ ادعایی تأثیر ندارد.

**CMD 5 — کنترل SURVIVED** (`bash "$TEMP/ft-surviving-test.sh"`)
- ورودی: کپی دقیق metric + mutation بی‌ضرر (ویرایش کامنت)
- خروجی: `SURVIVED | MUTHARMLESS | exit=0 | 19 passed, 0 failed`؛ `KILLED=6 SURVIVED=1 ERROR=0 (total 7)`؛ `GUARD: FAIL`
- **GUARD exit code: 1**
- هش metric واقعی پس از اجرا: `1f7937e5...` (تغییر نکرد)

**آزمون قرارداد overlap/sim** (`node "$TEMP/ft-closure-contract.js"`)
- ورودی: سورس واقعی سه فایل در scope ایزوله (فقط خواندن)
- خروجی: `OVERLAP_PASS=24 OVERLAP_FAIL=0`
- **exit code: 0**

**`NOT RUN` ثبت‌شده:** اجرای Guard با یک Node بومی‌ویندوز واقعی (native Windows Node build) — چنین باینری روی این جعبه نصب نیست؛ فقط با یک fake `node` که `/c/*` را رد می‌کرد شبیه‌سازی شد. نتیجه لینوکس به‌جای ویندوز معرفی نشد.

---

## ۶. نتیجه مستقل Hermes

هرمس بسته شواهد `tools/ft/FT-METRIC-01-VERIFICATION-PACKAGE.md` را دریافت کرد، فقط ۵ فایل نام‌برده به‌علاوه `benchmark-report.json`/`.gitignore`/`git status` را بررسی کرد، و فرمان‌های بازتولید را مستقل اجرا کرد. پاسخ هر ۶ سؤال:

| # | سؤال | پاسخ هرمس |
|---|---|---|
| ۱ | آیا اصلاحات در فایل‌های checkout فعلی وجود دارند؟ | **VERIFIED** — ۴ هش مطابق؛ `tb.length` در metric-v2.js:117,120 و benchmark.js:25,28 و compare.js:21,24؛ هیچ `tb.size` باقی‌نمانده نیست؛ `node_readable()` در ۳۸–۶۴ |
| ۲ | آیا معیارهای پذیرش برقرارند؟ | **VERIFIED** — ۱۹ passed/0 failed exit 0؛ KILLED=6/SURVIVED=0/ERROR=0 exit 0 |
| ۳ | آیا Guard fail-closed است؟ | **VERIFIED** — هر دو مسیر خطا exit غیرصفر |
| ۴ | آیا 4b باگ را تشخیص می‌دهد؟ | **VERIFIED** — تزریق باگ → دقیقاً `FAIL 4b`، ۱۸/۱، exit ۱؛ هش سورس ثابت |
| ۵ | آیا گزارش با فایل‌ها/خروجی‌ها تناقض دارد؟ | **VERIFIED** — هیچ تناقض ماهوری؛ دو شکاف ظاهری (شمارش untracked ۱۲ نه ۱۱ به‌خاطر خود بسته؛ خط `cleanup: OK` در CMD 4) که بر هیچ ادعایی تأثیر ندارند |
| ۶ | آیا مانع دیگری در دامنه باقی مانده است؟ | **VERIFIED** — هیچ مانع پنهانی؛ دو محدودیت صریحاً اعلام شده‌اند |

**دو نکته ظاهری هرمس، هر دو پردازش شد:**
1. شمارش untracked: ۱۲ است نه ۱۱، زیرا خود `FT-METRIC-01-VERIFICATION-PACKAGE.md` پس از شمارش اولیه نوشته شد. این گزارش شمارش نهایی ۱۲ را ثبت می‌کند.
2. خط `cleanup: OK` در بلوک CMD 4: از خروجی ترکیبی اسکریپت می‌آید و در اجرای مجدد هرمس چاپ نشد. بر هیچ ادعایی تأثیر ندارد.

---

## ۷. وضعیت benchmark تاریخی

`tools/ft/benchmark-report.json` (۴۰۸ بایت، tracked، **دست‌نخورده**):
- `base_mean_similarity: 0.126`
- `tuned_mean_similarity: 0.21`
- `n: 2`
- `delta: 0.084`

**بازتولید واقعی ممکن نیست.** ورودی‌های خام لازم (`bench-base.jsonl`، `bench-tuned.jsonl`) در مخزن وجود ندارند — `.gitignore` خط ۷۹ آن‌ها را نادیده می‌گرفت و هرگز commit نشدند. `payesh-sft-holdout.jsonl` تنها ۲ خط دارد و بازتولید به inference نیاز دارد که مأموریت ممنوع کرد. اعداد تاریقی به‌صورت as-is گزارش شده‌اند، از داخل JSON بازمحاسبه نشده‌اند، و به‌عنوان نتیجهٔ اجرای تازه معرفی نشده‌اند. **این اعداد نباید به‌عنوان اثبات اعتبار یا بهبود مدل تعبیر شوند** — باگ `tb.size` نشان می‌دهد که امتیازهای v1 تاریخی به‌طور بنیادی قابل اعتماد نبوده‌اند.

---

## ۸. محدودیت‌ها و پیگیری‌های غیرمسدودکننده

۱. **اجرا با Node بومی‌ویندوز: `NOT RUN`.** نقص `ENOENT` روی مسیر `/c/...` با Node واقعی این جعبه (که MSYS را می‌خواند) قابل بازتولید نیست. منطق `node_readable()` با شبیه‌سازی تأیید شد. اگر یک باینری Node بومی‌ویندوز در دسترس قرار گیرد، `bash tools/ft/mutation-test.sh` زیر آن تنها بررسی کمکی است. **غیرمسدودکننده برای اصلاح کد و Guard.**

۲. **بازتولید benchmark: غیرممکن.** به‌خاطر فقدان داده خام (§۷). **غیرمسدودکننده برای اصلاح کد و Guard.** پیگیری جداگانه: اگر بخواهیم اعداد معتبر داشته باشیم، باید inference از ابتدا با داده کامل دوباره اجرا شود — خارج از دامنه این پرونده.

۳. **`benchmark.js` ویرایش pre-existing در working tree** (۳ خط، از مأموریت ۱) که uncommitted باقی مانده. هنگام commit بعدی باید به‌درستی منتسب شود.

۴. **هیچ receipt از commit وجود ندارد** — همه اصلاحات در فایل‌های untracked هستند. هش‌های §۳ receipt رسمی هستند.

۵. **remote از این جعبه غیرقابل دسترس است**، پس تأیید `origin` ممکن نبود.

---

## ۹. حکم نهایی و دلیل

### **`CLOSED — VERIFIED WITH NON-BLOCKING FOLLOW-UP`**

**دلیل:**

- **اصلاحات کد و Guard تأیید شده‌اند:** باگ `tb.size` در هر سه تابع مستقل (`overlap`، دو `sim`) رفع شده، با شواهد هش و آزمون ۲۴/۲۴ قرارداد + کنترل منفی تزریق باگ.
- **آزمون‌های ضروری موفق‌اند:** ۱۹/۰ suite، ۶/۶ mutation KILLED، exit 0.
- **خطاها به false-green تبدیل نمی‌شوند:** `ERROR=6` → exit 1؛ `SURVIVED=1` → exit 1؛ هیچ‌کدام `GUARD: PASS` چاپ نمی‌کنند.
- **هرمس شواهد نهایی را مستقل تأیید کرده است:** ۶ از ۶ سؤال VERIFIED، با بازتولید مستقل فرمان‌ها.
- **هیچ مانع حل‌نشده‌ای در دامنه باقی نمانده است.**
- **دلیل non-blocking follow-up (و نه CLOSED — VERIFIED کامل):** بازتولید benchmark تاریخی به‌دلیل فقدان داده خام ممکن نیست (§۷). این محدودیت روشن و مستند است و به‌عنوان اثبات اعتبار اعداد تاریخی تعبیر نمی‌شود.

این پرونده بسته می‌شود. باز کردن مجدد آن تنها با شواهد جدید و مشخص از یک نقص واقعی داخل همین دامنه مجاز است.

---

## ۱۰. تأیید صریح عدم انجام commit/push/merge

تأیید می‌شود که در طول این مأموریت:

- **هیچ `git commit` انجام نشد.**
- **هیچ `git push` انجام نشد.**
- **هیچ `git merge`، `git rebase`، `git tag` یا انتشار نسخه‌ای انجام نشد.**
- **هیچ فایلی stage نشد** (`git add` هرگز اجرا نشد).
- HEAD در ابتدا `fd83a39927300e65396bfef57980c71abdb87c9d` بود و در پایان **دقیقاً یکسان** است.
- تنها فایل tracked با تغییر working-tree (`benchmark.js`) دقیقاً همان‌طور که پیدا شد باقی ماند — لمس نشد، stage نشد، revert نشد.
- هیچ فایل untracked حذف یا overwrite نشد.
- **هیچ فایل اصلی‌ای حین mutation تغییر نکرد** — همه آزمون‌های تزریق از کپی‌های موقت در `/tmp` یا `%TEMP%` استفاده کردند و هش سورس قبل/بعد هر اجرا ثبت شد.
- اسکن کل پروژه انجام نشد. آموزش مجدد مدل انجام نشد. هیچ عدد یا نتیجه ساختگی تولید نشد.
