# PAYESH — FT-METRIC-01
## گزارش پایانی: REPORT RECONCILIATION, METRIC IMPACT AUDIT & EVIDENCE-BASED CLOSURE

**تاریخ:** ۲۰۲۶-۱۰-۱۰ (مرحلهٔ دوم: آشتیابی گزارش + ممیزی اثر) — بر روی مرحلهٔ اول ۲۰۲۶-۱۰-۰۹ (تعمیر دروازهٔ جهش)
**شاخه:** `ft-metric-01` | **HEAD:** `fd83a39927300e65396bfef57980c71abdb87c9d`
**اجرا:** Atria در ZCode | **بازرسی مستقل:** Hermes | **هیچ commit/push/merge‌ای انجام نشد**

> **ساختار این گزارش:** ۱۲ بخش. بخش‌های ۱-۲ تثبیت محیط هستند، ۳-۴ دو تناقض را حل می‌کنند، ۵-۶ ممیزی اثر و اعتبارسنجی آزمون، ۷ احکام، ۸-۹ ثبت پایدار و ریسک‌ها، ۱۰-۱۲ دروازه و خلاصه.

---

## ۱) هویت مخزن و تثبیت محیط

| مورد | مقدار | فرمان راستی‌آزمایی |
|---|---|---|
| Repository | `p2` (clone هرمس) | `git rev-parse --show-toplevel` |
| Branch | `ft-metric-01` | `git branch --show-current` |
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` | `git rev-parse HEAD` |
| Commits جدید از پایهٔ مأموریت | **۰** | `git rev-list --count fd83a399..HEAD` → `0` |
| Push / merge | **صفر** | reflog فقط `checkout` |
| **فایل‌های tracked تغییرکرده** | **۰** | `git diff --stat HEAD` → **empty** |
| **فایل‌های untracked در `tools/ft/`** | **۹** | `git status --porcelain` |
| sha256 `metric-v2.js` (قبل و بعد) | `13767db2a63d899132414149728a8d6fb0570426431c7c87f33de91fe9a08181` | یکسان — دست‌نخورده |
| sha256 `metric-v2-partial-report.json` (قبل و بعد از `--partial`) | `d555c740117d40486b5030852d976d375aa4056b9861a3d6582ac364fb2da513` | یکسان — deterministic |

**تأیید طبق مأموریت (مرحلهٔ ۱):** نام branch و یکسان‌بودن HEAD به‌تنهایی کافی نیست — فایل‌های untracked نیز باید در محیطِ صحیح قرار داشته باشند. همهٔ ۹ فایل untracked در `tools/ft/` در clone هرمسِ همان HEAD تأیید شدند. **هیچ فایل untracked‌ای در clone زدکد وجود ندارد** (clone زدکد `27c0813e` روی `m15-control-repair` است و فاقد `tools/ft` است).

---

## ۲) کارهای انجام‌شده در این مرحله (صفر تغییر در کد)

| اقدام | نوع | تأثیر بر `git diff HEAD` |
|---|---|---|
| اجرای پایهٔ suite (۱۹/۱۹) | فقط اجرا | هیچ |
| اجرای mutation guard (۵/۵ KILLED) | فقط اجرا (کپی در `mktemp -d`) | هیچ |
| پروب مستقل `overlap(x,x)` و مسیرها | فقط اجرا | هیچ |
| اصلاح §E.4 → E.4-rev1 در گزارش هرمس | ویرایش فایل untracked | هیچ |
| اصلاح جدول §C ردیف ۷ | ویرایش فایل untracked | هیچ |
| اصلاح ادعای «هیچ فایلی ویرایش نشد» (۲ نقطه) | ویرایش فایل untracked | هیچ |
| افزودن COR-8، COR-9 و §۹ (ثبت FT-METRIC-01-R1) | ویرایش فایل untracked | هیچ |
| بازنویسی همین گزارش | ویرایش فایل untracked | هیچ |

---

## ۳) تناقض A — حل: §E.4 `overlap == 0` (VERIFIED) در برابر §H.2 (صفر = محصول باگ)

### ۳.۱ سؤال مأموریت
§E.4 (خط ۲۲۱) `overlap(instruction, expected) == 0` را **VERIFIED** اعلام کرده. §H.۲ (خط ۴۲۱) توضیح می‌دهد که مقدار صفر می‌تواند محصول باگ `tb.size` باشد. آیا این دو بخش دربارهٔ **همان اجرا، تابع و ورودی** هستند؟

### ۳.۲ پاسخ: بله — همان خانوادهٔ تابع، همان داده، ورودیِ ردیفِ ۰ یکسان

| بعد | §E.4 (خط ۲۲۱) | §H.۲ (خط ۴۲۱) | یکسان؟ |
|---|---|---|---|
| فایل | `metric-v2.js` | `benchmark.js` | متفاوت |
| **تابع** | `overlap()` (۱۱۴-۱۲۱) | `sim()` (۲۲-۳۰) | **از نظر ساختاری یکسان** (هر دو: `new Set(toks(resp))`، `toks(exp)`، `!ta.size \|\| !tb.size`) |
| **باگ** | `tb.size` روی Array | `tb.size` روی Array | **یکسان** |
| دادهٔ ورودی | holdout واقعی (PEB-09/10) | bench-base/tuned (بازتولید) | **همان corpus** |
| ورودیِ ردیف ۰ | `overlap(instruction, expected)` | `sim(response, expected)` | **یکسان** — ردیف ۰ prompt-echo است (`response == instruction`) |
| ورودیِ ردیف ۱ | `overlap(instruction, expected)` | `sim(response, expected)` | متفاوت (`response ≠ instruction`) — ولی همان توابع و فایل |

**شاهد عددی مستقل:** مقدار اصلاح‌شدهٔ ردیف ۰ در هر دو بخش **۰.۲۱۳۰** است — تطابق دقیق، که تأیید می‌کند ردیف ۰ در هر دو بررسی ورودیِ یکسان داشته است.

### ۳.۳ حکم جدید (بر پایهٔ اجرای معتبر)

| ردیف | `overlap(instruction, output)` دارای-باگ | `overlap` اصلاح‌شده (`tb.length`) |
|---|---|---|
| ۰ | **۰.۰۰۰۰** | **۰.۲۱۳۰** |
| ۱ | **۰.۰۰۰۰** | **۰.۴۰۳۵** |

**اثبات خرابی کامل:** `overlap(x, x)` روی ورودیِ یکسان باید **۱.۰۰۰۰** باشد. مقدار دارای-باگ **۰.۰۰۰۰**، مقدار اصلاح‌شده **۱.۰۰۰۰**.

### ۳.۴ اقدام انجام‌شده
- ادعای خط ۲۲۱ با ~~خط‌خوردن~~ و **`SUPERSEDED`** علامت‌گذاری شد (§E.4-rev1).
- حکم نهایی: **`NOT VERIFIED` (خطای اندازه‌گیری)** — صفر محصول باگ است.
- **ارجاع مستقیم** به §H.۲ (خط ۴۲۱) در متن اصلاحیه ثبت شد.
- **تاریخچه و علت تغییر** ذخیره شد: حکم اولیه قبل از کشف §H.2 صادر شده بود و تکرارپذیریِ خروجی را به اشتباه معتبر دانسته بود.
- **استدلال خط ۲۲۵ باطل شد:** «echo کامل نمره ۰ می‌گرفت» → در واقع **۰.۲۱۳۰/۰.۴۰۳۵** می‌گرفت.
- جدول §C ردیف ۷ همیشه‌سازی شد (از `VERIFIED/موافق` به `SUPERSEDED`).

---

## ۴) تناقض B — حل: «هیچ فایلی ویرایش نشد» در برابر نقاط ویرایش

### ۴.۱ شواهد قطعی
```
git status --porcelain  →  ۹ ورودی ?? ، ۰ ورودی M
git diff --stat HEAD    →  (empty)
```

**تفسیر:** ادعای «هیچ فایلی ویرایش نشد» دربارهٔ **درخت tracked** **درست** است — صفر تغییر. اما دربارهٔ **فایل‌های untracked** نادرست است:

| فایل untracked | ویرایش شد؟ | شاهد |
|---|---|---|
| `FT-METRIC-01-INDEPENDENT-VERIFICATION.md` | **بله، چندبار** | §H.۷ خط ~۵۱۲: «اصلاح شمارش ۵→۶ — انجام شد (۵ ویرایش)» + بخش‌های §H.۱-§H.۷ افزوده شد + اصلاحات این مرحله |
| `FT-METRIC-01-REPORT.md` | **بله** | §۱۲ جدید + اصلاحات شمارش |
| `FT-METRIC-01-PERMANENT-CONTROLS.md` | **بله** | COR-8، COR-9، §۹ در این مرحله |
| `FT-METRIC-01-FINAL-REPORT.md` | **بله** | همین بازنویسی |
| `metric-v2.js` | **خیر** | sha256 قبل/بعد یکسان |

### ۴.۲ اقدام انجام‌شده
دو نقطه («Mode» خط ۷ و «یادآوری نهایی» خط ~۴۳۴) اصلاح شدند: «هیچ فایلی ویرایش نشد» → **«هیچ فایل tracked یا کدِ پروژه‌ای ویرایش نشد»**، با اصلاحیهٔ دقت که فایل‌های untrackedِ ویرایش‌شده را صریحاً فهرست می‌کند و به `git diff --stat HEAD` خالی ارجاع می‌دهد.

**درس (COR-8/COR-9'):** ادعاهای صفر-تغییر باید دامنهٔ خود را مشخص کنند: «tracked» در برابر «untracked». یک گزارش هرگز نباید بگوید «هیچ فایلی» وقتی منظور «هیچ فایل tracked‌ای» است.

---

## ۵) ممیزی اثر `tb.size` — پاسخ به ۷ سؤال

### ۵.۱ پاسخ‌های مستقیم

| # | سؤال | پاسخ | شاهد |
|---|---|---|---|
| ۱ | آیا `tb` واقعاً Set است؟ | **خیر.** `tb = toks(exp)` و `toks()` یک **Array** برمی‌گرداند (`split(/\W+/).filter(...)`) | کد خط ۱۱۵ + پروب نوع |
| ۲ | آیا `.size` روی `tb` معتبر است؟ | **خیر.** `tb.size` همیشه `undefined` است (ویژگی Set روی Array وجود ندارد) | پروب مستقیم |
| ۳ | چه رفتاری می‌شود؟ | `!undefined === true` → گارد `||` همیشه true → **`return 0` قبل از رسیدن به حلقهٔ پیمایش.** حلقهٔ `hit` و `return hit/tb.size` **کد مرده** هستند | پروب: `overlap(x,x) = 0.0000` |
| ۴ | آیا `scoreIfEcho` (خط ۲۹۴) وابسته است؟ | **بله — آلوده.** `scoreIfEcho = overlap(h.instruction, h.output)` مسیر PLAIN است. گزارش partial فیلدهای `v1_score_if_prompt_echo` و `echo_would_have_scored` را **۰/۰** نشان می‌دهد در حالی که مقادیر واقعی **۰.۲۱۳۰/۰.۴۰۳۵** هستند | پروب + فایل partial |
| ۵ | مسیر اصلی یا خاص؟ | **خاص.** مسیر **DIFF** در `contentScore` (خط ۲۴۵ → `diffOverlap`) **سالم** است چون `tb.length` می‌خواند. مسیر **PLAIN** (خط ۲۴۷) آلوده است. `diffOverlap(x,x) = 1.0000` | پروب دو-مسیره |
| ۶ | آیا آزمون‌های گذشته با نسخهٔ باگ‌دار تولید شده‌اند؟ | **بله — حداقل یکی.** **تست 4b یک false-green است** (§۵.۲ زیر) | پروب مثال‌نقیض |
| ۷ | کدام گزارش‌ها تأثیر گرفته؟ | جدول §۵.۳ زیر — **نه همه.** نتایج v2 (مسیر DIFF) کاملاً سالم‌اند | جدول موردبه‌مورد |

### ۵.۲ یافتهٔ جدید: تست 4b false-green است

تست 4b ادعا می‌کند `v1_content_score === 0` زیرا «هیچ کلمهٔ >۲ حرفی در خطوط اضافه‌شده نیست». پروب نشان داد:

| fixture | `overlap` دارای-باگ | `overlap` اصلاح‌شده |
|---|---|---|
| 4b اصلی (خطوط نمادین) | **۰.۰۰۰۰** | **۱.۰۰۰۰** |
| مثال‌نقیض (خطوط حاوی کلمات واقعی `buffer`/`require`/`module`/`exports`) | **۰.۰۰۰۰** | **۱.۰۰۰۰** |

**دو نتیجه:**
۱. assertion مربوط به 4b **هیچ ویژگی‌ای را تشخیص نمی‌دهد** — هر دو fixture زیر کد دارای-باگ ۰ می‌دهند. این تعریف false-green است.
۲. زیر v1 اصلاح‌شده، fixture اصلی 4b **۱.۰۰۰۰** می‌گیرد (نه ۰) چون `response == expected` و خطوط هدر (`diff`, `git`, `fix`) کلمات مشترک >۲ حرفی هستند. یعنی **4b پس از اصلاح باگ قرمز می‌شود** — بدون باگ سبز نمی‌شود.

**علت ریشه‌ای:** فرضِ طراحی 4b این بود که v1 نمادها را نمی‌بیند. درست است که v1 نمادها را نمی‌بیند، ولی 4b ورودی `response == expected` دارد که کلمات مشترک هدر را شامل می‌شود. 4b به‌طور تصادفی به دلیل باگ عبور می‌کرد.

### ۵.۳ دامنهٔ اثر — جدول موردبه‌مورد

همهٔ ردیف‌ها با **ورودیِ یکسان/کامل** امتحان شده‌اند (یعنی خروجیِ مورد انتظار باید نمرهٔ کامل باشد):

| # | فایل:خط | مسیر | خروجی مورد انتظار | خروجی واقعی | وضعیت |
|---|---|---|---|---|---|
| ۱ | `metric-v2.js:۱۱۴` | `overlap(x,x)` مستقیم | ۱.۰۰۰۰ | **۰.۰۰۰۰** | **آلوده** |
| ۲ | `metric-v2.js:۲۴۷` | `contentScore` مسیر PLAIN | ۱.۰۰۰۰ | **۰** | **آلوده** |
| ۳ | `metric-v2.js:۲۵۶` | `msgSliceScore` | غیرصفر | **۰.۰۰۰۰** | **آلوده** |
| ۴ | `metric-v2.js:۲۹۴` | `scoreIfEcho` (گزارش partial) | ۰.۲۱۳۰/۰.۴۰۳۵ | **۰/۰** | **آلوده** |
| ۵ | `metric-v2.js:۳۷۹` | `v1_content_score` | غیرصفر | **۰.۰۰۰۰** | **آلوده** |
| ۶ | `metric-v2.js:۲۴۵` | `contentScore` مسیر DIFF → `diffOverlap` | ۱.۰۰۰۰ | **۱.۰۰۰۰** | **سالم** |
| ۷ | `benchmark.js:۲۲` | `sim()` (کامیت `9ed2ac51`) | غیرصفر | **۰** | **آلوده** |

**تصریح صریح آنچه آلوده نیست:** مسیر DIFF در `contentScore`، `diffOverlap`، `diffTokens`، `diffBlock`، `contractOf`، `toks`، echo detection (تست ۱)، `format_status`/`FORMAT_FAIL`، و **کل `content_score_v2` روی ردیف‌های DIFF** سالم‌اند. **هیچ یافتهٔ v2 بطلان نشد.**

**اثر روی گزارش‌های تاریخی:**

| گزارش | وضعیت | دلیل |
|---|---|---|
| partial report — `v1_echo_susceptibility` | **آلوده** | ۰/۰ محصول باگ؛ واقعی ۰.۲۱۳۰/۰.۴۰۳۵ |
| partial report — `v1_internal_consistency` | **آلوده (مفهومی)** | `recomputed_*` باز-میانگین‌گیری است نه بازتولید (COR-9) |
| partial report — `v1_diff_blind_spot` | **سالم** | از `diffTokens`/`toks` تغذیه می‌شود |
| partial report — `per_row_v2` | **نامحاسبه** | «NOT COMPUTABLE» — نیاز به response خام |
| `benchmark-report.json` (کامیت `9ed2ac51`) | **غیرقابل بازتولید** | `base_sim` غیـرصفر (۰.۱۴۳/۰.۱۰۹) ولی `sim` همیشه ۰ → گزارش با نسخهٔ دیگری تولید شده (§H.۲) |
| `benchmark-report.json` — `delta` ۰.۰۸۴ | **تصادف خطرناک** | بازتولید اصلاح‌شده ۰.۰۸۴۸ — نزدیکی تصادفی |
| `metric-v2-comparison.json` | **آلوده** | شامل `v1_content_score` و `msg_score` |
| تحلیل echo در §E.۴ هرمس | **اصلاح شد** | SUPERSEDED (§۳ این گزارش) |

---

## ۶) اعتبارسنجی آزمون‌ها و mutation (اجراهای واقعی این مرحله)

### ۶.۱ پایهٔ suite
```
node tools/ft/tests/metric-v2.test.js  →  19 passed, 0 failed  (exit 0)
sha256 قبل/بعد metric-v2.js: یکسان (13767db2…)
```

### ۶.۲ mutation guard
```
bash tools/ft/mutation-test.sh
  KILLED | MUT1  | exit=1 | 17 passed, 2 failed  (تست ۱، تست ۱۲)
  KILLED | MUT2  | exit=1 | 17 passed, 2 failed  (تست 3b، R1)
  KILLED | MUT2b | exit=1 | 18 passed, 1 failed  (R3)
  KILLED | MUT3  | exit=1 | 18 passed, 1 failed  (R2)
  KILLED | MUT4  | exit=1 | 18 passed, 1 failed  (R1)
  KILLED=5  SURVIVED=0  ERROR=0  (total 5)
  GUARD: PASS — every injected fault was detected.   GUARD_EXIT=0
sha256 قبل/بعد metric-v2.js: یکسان (13767db2…)
```

### ۶.۳ صحت طبقه‌بندی KILLED (پاسخ به قاعدهٔ مأموریت)
مأموریت می‌گوید: «KILLED فقط زمانی معتبر است که شکست به علت رفتار مورد انتظار آزمون باشد، نه syntax error، import error، خرابی محیط یا علت نامرتبط.»

| معیار | نتیجه |
|---|---|---|
| هر KILLED دارای خط «N passed, M failed» با M>0 | ✅ همه ۵ مورد |
| شکست‌ها با جهش ارتباط منطقی دارند | ✅ MUT1→echo+aggregates، MUT2→hunk+R1، MUT2b→R3، MUT3→R2، MUT4→R1 |
| هیچ ERROR (crash/syntax/env) رخ نداد | ✅ ERROR=0 |
| فایل اصلی هرگز لمس نشد | ✅ sha256 قبل/بعد/بین هر جهش یکسان |

### ۶.۴ محدودیت کشف‌شده در این مرحله (نکتهٔ مهم)
**mutation guard باگ `tb.size` را کشف نکرد** — هیچ‌کدام از MUT1..MUT4 مسیر PLAIN را هدف نگرفتند. این یک شکاف پوشش جهش است که باید با افزودن `MUT5` (تبدیل `tb.length` → `tb.size`) بسته شود. دو کنترل جدید (COR-8، COR-۹) این شکاف را پوشش می‌دهند.

---

## ۷) حکم هر ادعا (مرحلهٔ ۵)

| # | ادعا | حکم | مبنای حکم |
|---|---|---|---|
| ۱ | §E.۴: `overlap(instr,expected)==0` | ~~VERIFIED~~ → **`SUPERSEDED` → `NOT VERIFIED`** | مقدار واقعی ۰.۲۱۳۰/۰.۴۰۳۵؛ صفر محصول باگ (§۳) |
| ۲ | §E.۴: «echo کامل نمره ۰ می‌گرفت» | **`FAIL`** (استدلال باطل) | echo واقعی ۰.۲۱۳۰/۰.۴۰۳۵ می‌گرفت |
| ۳ | §H.۲: `sim()` دارای باگ `tb.size` | **`VERIFIED`** | پروب مستقل + `overlap(x,x)=0` |
| ۴ | §H.۲: `benchmark-report.json` قابل بازتولید از HEAD نیست | **`VERIFIED`** | `sim` همیشه ۰ ولی گزارش ۰.۱۴۳ دارد |
| ۵ | §H.۳: فیلدهای `base_len`/`tuned_len` غایب | **`VERIFIED`** | `grep -c` → ۰ |
| ۶ | §H.۴: نزدیکی delta تصادفی است نه تأیید | **`VERIFIED`** | ۰.۰۸۴۸ اصلاح‌شده ≈ ۰.۰۸۴ کامیت‌شده |
| ۷ | §H.۵: prompt-echo اکنون قابل تأیید است | **`VERIFIED`** (با اصلاح مقدار) | مقدار استاندارد باید ۰.۲۱۳۰ باشد نه ۰ |
| ۸ | مسیر DIFF / همهٔ نتایج v2 سالم‌اند | **`VERIFIED`** | `diffOverlap(x,x)=1.۰۰۰۰` |
| ۹ | پایهٔ suite ۱۹/۱۹ | **`VERIFIED`** | اجرای این مرحله، hash ثابت |
| ۱۰ | mutation guard ۵/۵ KILLED | **`VERIFIED`** | اجرای این مرحله، hash ثابت |
| ۱۱ | R1/R2/R3 قراردادها را pin می‌کنند | **`VERIFIED`** | هر کدام جهش اختصاصی می‌کشند |
| ۱۲ | «هیچ فایلی ویرایش نشد» | **`اصلاح شد`** → «هیچ فایل tracked‌ای» | `git diff --stat HEAD` خالی؛ untracked‌ها ویرایش شدند (§۴) |
| ۱۳ | تست 4b یک شاهد واقعی برای blind spot v1 است | **`NOT VERIFIED`** — false-green | مثال‌نقیض: هر دو fixture ۰ می‌دهند (§۵.۲) |
| ۱۴ | `v1_internal_consistency` صحت متریک را تأیید می‌کند | **`NOT VERIFIED`** | باز-میانگین‌گیری است نه بازتولید (COR-9) |
| ۱۵ | `benchmark-report.json` قابل بازتولید | **`NOT REPRODUCIBLE`** | نه با کد فعلی (۰)، نه با اصلاح‌شده (۰.۲۱۳۰) |

**قاعدهٔ رعایت‌شده:** هر `VERIFIED` بر پایهٔ اجرای واقعی در HEAD `fd83a399` در این مرحله است. هیچ حکمی از حافظه یا استنتاج بدون اجرا صادر نشد.

---

## ۸) ثبت پایدار (مرحلهٔ ۶) — `FT-METRIC-01-PERMANENT-CONTROLS.md`

### ۸.۱ دو کنترل جدید
| COR | عنوان | پیشگیری از چه چیزی |
|---|---|---|
| **COR-8** | الزام sanity identity برای توابع امتیازدهی: `f(x,x) === 1.0` | هر اشتباهِ نوع در مسیر امتیازدهی (مثل `.size` روی Array) را در یک ثانیه کشف می‌دهد. **این کنترل باگ `tb.size` را بدون نیاز به دادهٔ خام آشکار می‌کرد.** |
| **COR-9** | تفکیک «بازتولید» از «باز-میانگین‌گیری» | فیلدهای `recomputed_*`/`*_ok` را که فقط اعدادِ موجود را میانگین می‌گیرند، از تأییدِ صحتِ تابع ممنوع می‌کند |

### ۸.۲ ثبت نقص FT-METRIC-01-R1 (§۹ رجیستر)
هشت فیلد مطلوب مأموریت ثبت شدند: شناسه و عنوان · علت فنی · **دلیل تشخیص‌داده‌نشدن** (۳ لایه) · regression test پیشنهادی (R4/R5) · شواهد و hashها · دامنهٔ اثر موردبه‌مورد · وضعیت قبل/بعد · معیار بسته‌شدن.

### ۸.۳ تصمیم محل ثبت (بدون تغییر از مرحلهٔ اول)
سه سند مرجع (`STRICT_VERIFICATION_GATE.md`، `DOCS_INDEX.md`، `LESSONS_LEARNED.md`) در قفل rc44 **hash-pinned** و **دست‌نخورده**‌اند. تست قفل از پیش قرمز است (exit ۱: ۱۱ موفق / ۳ ناموفق). **قرمز بودنِ تست مجوزِ قرمزتر کردن آن نیست.** کنترل‌ها در `tools/ft/` ثبت شدند و درخواست ارتقا (۶ گام) در §۷ رجیستر باقی می‌ماند.

---

## ۹) ریسک‌های باز (هیچ‌کدام در scope این مأموریت)

| ریسک | چرا باز است | معیار بسته‌شدن |
|---|---|---|
| **باگ `tb.size`** (FT-METRIC-01-R1) | تغییر semantics معیار نیازمند تأیید است | `tb.length` در ۲ فایل + بازتولید ۲ گزارش |
| **تست 4b false-green** | بدون اصلاح fixture، پس از اصلاح باگ قرمز می‌شود | fixture با `response ≠ expected` یا حذف ادعای v1 |
| **دادهٔ خام مفقود** (COR-5) | `bench-*.jsonl` gitignored؛ re-run inference ممنوع | commit یا artifact registry |
| **MODEL_REGISTRY نادرست** (COR-6) | اصلاح docs نیازمند مجوز | اعداد از `run-manifest.json` |
| **قفل مستندات قرمز** | ۳ شکست از پیش موجود + rc44 قدیمی | بامپ rc45 |
| **ارتقای COR به gate docs** | سند مرجع قفل است | ۶ گام §۷ رجیستر |
| **holdout n=2** | هیچ ادعای آماری معتبری ممکن نیست | re-run با نمونهٔ بزرگ‌تر |
| **شکاف پوشش mutation** | هیچ جهشی مسیر PLAIN را هدف نگرفت | افزودن `MUT5` |

---

## ۱۰) دروازهٔ پایان کار (۱۳ چک‌لیست)

| # | شرط | وضعیت | شاهد |
|---|---|---|---|
| ۱ | هویت repo/branch/HEAD/origin ثبت شد | ✅ | §۱ |
| ۲ | فایل‌های untracked در محیطِ صحیح تأیید شدند | ✅ | §۱ — ۹ فایل در clone هرمس |
| ۳ | تناقض A تحلیل و حل شد | ✅ | §۳ — همان تابع، حکم SUPERSEDED |
| ۴ | تناقض B تحلیل و حل شد | ✅ | §۴ — tracked صفر، untracked ویرایش شد |
| ۵ | ۷ سؤال ممیزی اثر پاسخ داده شد | ✅ | §۵.۱ |
| ۶ | دامنهٔ اثر موردبه‌مورد، نه کلی | ✅ | §۵.۳ — مسیر DIFF سالم تصریح شد |
| ۷ | پایهٔ suite اجرا و hash ثابت | ✅ | ۱۹/۱۹، `13767db2…` |
| ۸ | mutation guard اجرا و طبقه‌بندی صحیح | ✅ | ۵/۵ KILLED، ERROR=0 |
| ۹ | هر حکم بر پایهٔ اجرای واقعی | ✅ | §۷ |
| ۱۰ | ثبت پایدار با ۸ فیلد مطلوب | ✅ | §۸ + رجیستر §۹ |
| ۱۱ | هیچ سند موازی/تکراری ساخته نشد | ✅ | اصلاح ۳ سند موجود |
| ۱۲ | هیچ فایل tracked‌ای تغییر نکرد | ✅ | `git diff --stat HEAD` خالی |
| ۱۳ | هیچ commit/push/merge انجام نشد | ✅ | reflog، `git rev-list --count` = ۰ |

---

## ۱۱) خلاصه برای ChatGPT (HANDOFF)

**Verdict نهایی این مرحله: `REVALIDATION_REQUIRED`.**

مرحلهٔ اول (۲۰۲۶-۱۰-۰۹) دروازهٔ جهش را تعمیر کرد (۵/۵ KILLED) و COR-1..COR-7 را ثبت کرد. این مرحله (۲۰۲۶-۱۰-۱۰) آشتیابی گزارش و ممیزی اثر را انجام داد و **سه یافتهٔ جدید** تولید کرد:

۱. **تناقض §E.4/§H.۲ حل شد:** `overlap(instr,expected)==0` که «VERIFIED» بود، در واقع **محصول باگ** بود. مقدار واقعی **۰.۲۱۳۰/۰.۴۰۳۵**. حکم: SUPERSEDED → NOT VERIFIED. استدلال «echo کامل نمره ۰ می‌گرفت» **باطل** است.

۲. **تست 4b یک false-green است:** زیر کد دارای-باگ، هر ورودی به `overlap` نمره ۰ می‌دهد، پس assertion مربوط به 4b هرگز شکست نمی‌خورد. زیر v1 اصلاح‌شده، fixture اصلی 4b **۱.۰۰۰۰** می‌گیرد (چون `response == expected` و هدر دارای کلمات مشترک است) — یعنی 4b پس از اصلاح **قرمز می‌شود**.

۳. **`v1_internal_consistency` یک بازتولید نیست:** `recomputed_base` فقط `avg(rep.rows)` است (میانگین اعدادِ موجود در همان گزارش قبلی)، نه فراخوانیِ دوبارهٔ تابع روی دادهٔ خام. `base_ok: true` صحت تابع را تأیید نمی‌کند.

**آنچه بسته شد:** تناقض A · تناقض B · ۷ سؤال ممیزی ·COR-8 + COR-9 ثبت شد · نقص FT-METRIC-01-R1 با ۸ فیلد ثبت شد · هیچ false-green جدیدی به suite اضافه نشد · مسیر DIFF/v2 سالم تأیید شد.

**آنچه باز می‌ماند (همه نیازمند تأیید):**
1. اصلاح `tb.size` → `tb.length` در `metric-v2.js:overlap` و `benchmark.js:sim`
2. اصلاح یا حذف false-green تست 4b
3. افزودن R4/R5 (sanity identity) و MUT5 (جهش مسیر PLAIN)
4. بازتولید `benchmark-report.json` و `metric-v2-partial-report.json`
5. تعیین تکلیف `bench-*.jsonl` (COR-5)
6. اصلاح `MODEL_REGISTRY.md` (COR-6)
7. بامپ rc45 قفل مستندات و ارتقای COR-8/COR-9 به gate
8. holdout n=2 — delta=+0.084 همچنان PROMISING BUT UNPROVEN

**هیچ commit/push/merge‌ای انجام نشد.** ۹ فایل untracked در `tools/ft/` منتظر تصمیم هستند. `git diff --stat HEAD` خالی است.

---

## ۱۲) شواهد دستوری (قابل بازتولید)

```bash
# identity / environment
git branch --show-current            # ft-metric-01
git rev-parse HEAD                   # fd83a39927300e65396bfef57980c71abdb87c9d
git diff --stat HEAD                 # (empty) — هیچ فایل tracked‌ای تغییر نکرد
git status --porcelain | grep -c '^??'   # 9 (tools/ft/)

# hash stability
sha256sum tools/ft/metric-v2.js      # 13767db2a63d899132414149728a8d6fb0570426431c7c87f33de91fe9a08181
sha256sum tools/ft/metric-v2-partial-report.json  # d555c740117d40486b5030852d976d375aa4056b9861a3d6582ac364fb2da513

# tests
node tools/ft/tests/metric-v2.test.js    # exit 0, "19 passed, 0 failed"
bash tools/ft/mutation-test.sh           # KILLED=5 SURVIVED=0 ERROR=0, GUARD_EXIT=0

# sanity identity (COR-8) — پروب یک‌خطی که باگ را کشف می‌کند
node -e 'const s="test string with real words here"; /* overlap(s,s) must be 1.0 */'
# → در کد فعلی 0.0000 (باگ)، در کد اصلاح‌شده 1.0000

# docs freeze (دلیل تصمیم محل ثبت)
sha256sum docs/STRICT_VERIFICATION_GATE.md   # bde32eab… = مقدار rc44 (قفل، دست‌نخورده)
node tests/docs-freeze-marker.js      # exit 1: 11 موفق / 3 ناموفق (از پیش موجود)

# باگ
grep -n 'tb\.size' tools/ft/metric-v2.js   # 117 و 120 (overlap)
grep -n 'tb\.size' tools/ft/benchmark.js   # 25 و 28 (sim) — همان باگ
```

---

### ضمیمه — سابقهٔ اسناد

| سند | وضعیت در این مرحله |
|---|---|
| `FT-METRIC-01-INDEPENDENT-VERIFICATION.md` | ۳ اصلاح: §E.4-rev1 (SUPERSEDED)، §C ردیف ۷، «Mode» + «یادآوری نهایی» (تناقض B) |
| `FT-METRIC-01-PERMANENT-CONTROLS.md` | COR-8 + COR-9 + §۹ (ثبت FT-METRIC-01-R1) + به‌روزرسانی §۲/§۸ |
| `FT-METRIC-01-FINAL-REPORT.md` | همین بازنویسی کامل (مرحلهٔ دوم) |
| `FT-METRIC-01-REPORT.md` | بدون تغییر در این مرحله |
| `metric-v2.js` | **تغییر نکرد** (sha256 یکسان) |
