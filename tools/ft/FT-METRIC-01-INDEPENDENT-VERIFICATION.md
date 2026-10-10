# PAYESH — FT-METRIC-01 — INDEPENDENT READ-ONLY VERIFICATION
# بررسی مستقل انحصاری مبتنی بر شواهد

**Role:** Hermes — Independent Verification Engine
**Mission:** FT-METRIC-01
**Baseline HEAD:** `fd83a39927300e65396bfef57980c71abdb87c9d`
**Mode:** STRICT READ-ONLY — هیچ فایل **tracked** یا کدِ پروژه‌ای ویرایش نشد (`git diff --stat HEAD` خالی است، ۰ ورودی `M` در `git status --porcelain`)، هیچ commit/push/merge‌ای ساخته نشد

> **اصلاحیهٔ دقت (۲۰۲۶-۱۰-۱۰):** عبارت فوق‌السطر «هیچ فایلی ویرایش نشد» به‌طور تحت‌اللفظی دقیق نیست. این سندِ خودْ بررسی، که یک فایل **untracked** است، در طول مأموریت چندبار ویرایش شد: اصلاح شمارش فایل (۴→۵→۶، طبق §H.۷) و افزودن بخش‌های §H.۱–§H.۷ (پاسخ به یادآوری نظارتی ۲ هرمس). همچنین سه فایل untracked جدید ساخته شد: `FT-METRIC-01-PERMANENT-CONTROLS.md`، `FT-METRIC-01-FINAL-REPORT.md`، و `tools/ft/tests/` (همراه با `mutation-test.sh`). هیچ‌کدام تأثیری بر `git diff HEAD` ندارند زیرا untracked‌اند. منظور از «READ-ONLY» صفر-تغییر در **درخت tracked** است، که با `git diff --stat HEAD` خالی تأیید می‌شود.
**Date:** 2026-10-08

---

## A. Verdict نهایی

```
FIXED-SCOPED
```

**علت:** معیار v2 واقعاً ساخته، اعتبارسنجی و با آزمون‌های مخرب اثبات شده است. اما سه مورد وجود دارد که مانع `VERIFIED` کامل می‌شوند:

1. گزارش Atria گزارهٔ B (نیاز به داده خام) را به‌عنوان واقعیت بیان کرده (§C-F3)
2. یک تناقض تعداد فایل (۴ در برابر ۶) در گزارش وجود دارد — گزارش اصلی «۴ فایل» گفت، بررسی مستقل ابتدا «۵»، و شمارش نهایی **۶** است چون خودِ فایل بررسی مستقل هم untracked است (COR-2)
3. تعدادی از نتایج به دلیل عدم وجود «خروجی خام استنتاج» (raw inference outputs) قابل تأیید نیستند

---

## B. محیط و HEAD

| مورد | مقدار | شواهد |
|---|---|---|
| Repo root | `/workspace/p2` | `pwd` |
| Remote | `https://github.com/rezaa2544/p2.git` | `git remote -v` |
| Branch | `ft-metric-01` | `git branch --show-current` |
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` | `git rev-parse HEAD` |
| origin/main | `fd83a39927300e65396bfef57980c71abdb87c9d` | `git rev-parse origin/main` |
| HEAD == baseline? | **YES — دقیقاً برابر** | مقایسه مستقیم |
| HEAD == origin/main? | **YES** | همان SHA |
| Modified tracked files | **۰** | `git status --short` |
| Deleted files | **۰** | همان |
| Untracked files | **۶** | همان — ۵ فایل پروژه + خودِ این گزارش (COR-2) |
| Commits beyond baseline | **۰** | `git rev-list --count fd83a399..HEAD` → 0 |
| Reflog | فقط checkout از main | `git reflog` — هیچ commit‌ای نیست |

**محدودیت محیط:** checkout محلی در دسترس است. GitHub از طریق همون clone قابل دسترسی است. هیچ محدودیتی برای این بررسی وجود ندارد.

---

## C. جدول ادعاها

| # | ادعا | نتیجهٔ مستقل | مسیر/فرمان | exit | اختلاف با گزارش Atria |
|---|---|---|---|---|---|
| 1 | F1: محاسبات میانگین v1 | **VERIFIED** | `node -e` روی `benchmark-report.json` | 0 | **مغایرت:** گزارش گفت «درست است» ولی به این اشاره نکرد که این فقط سازگاری داخلی است، نه بازتولید از داده خام |
| 2 | F2: برابری PEB-09 | **NOT VERIFIED** | مقایسه `base_sim==tuned_sim==0.143` | 0 | **مغایرت:** گزارش «سازگار با» گفت ولی «اثبات» هم ضمناً مطرح کرد. اثبات نیاز به خروجی خام دارد |
| 3 | F3: نقص معیار v1 | **VERIFIED** (گزاره A) / **NOT VERIFIED** (گزاره B) | پروب مستقل ۱۰ ورودی + mutation testing | 0 | **مغایرت مهم:** گزارش گزاره B را به‌عنوان واقعیت بیان کرد |
| 4 | F4: ترتیب dataset و loss | **VERIFIED** (همبستگی) / **NOT VERIFIED** (علت قطعی) | تحلیل ۵۷ مرحله loss + ترتیب dataset | 0 | **مغایرت:** گزارش «علت» گفت، باید «همبستگی» می‌گفت |
| 5 | F5: نادرستی registry | **VERIFIED** | `git show fd83a399:docs/MODEL_REGISTRY.md` | 0 | **مغایرت جزئی:** گزارش گفت «converged from ~5.6 نادرست است» ولی مشخص نکرد که «converged» خودش هم غلط است |
| 6 | U1: نبود خروجی خام | **VERIFIED** | `ls` + `git log --all` + `git check-ignore` | 0 | **موافق** |
| 7 | U2: overlap(instr,expected)==0 | ~~**VERIFIED**~~ → **SUPERSEDED** (§E.4-rev1) | `node -e` روی holdout واقعی | 0 | **مغایرت جدید:** صفر محصول باگ `tb.size` است، نه یک یافته. مقدار واقعی: ۰.۲۱۳۰ / ۰.۴۰۳۵. §H.۲ را ببینید |
| 8 | 16/16 آزمون | **VERIFIED** | `node tools/ft/tests/metric-v2.test.js` | **0** | **موافق** |
| 9 | آزمون 4b | **VERIFIED** | پروب ایزوله مستقل | 0 | **موافق** |
| 10 | آزمون 7 | **VERIFIED** | md5 قبل/بعد هدایت‌شده | 0 | **موافق** — hash واقعی استفاده شد |
| 11 | عدم تغییر benchmark-report.json | **VERIFIED** | md5 قبل/بعد + `git diff --stat` | 0 | **موافق** |
| 12 | تعداد فایل‌های جدید | **FAIL** (تناقض گزارش) | `git status --untracked-files=all` | 0 | **مغایرت:** گزارش گفت «۴ فایل» ولی **۶** فایل موجود است — ۵ فایل پروژه + خودِ این گزارش بررسی (COR-2) |
| 13 | عدم commit/push | **VERIFIED** | reflog + rev-list | 0 | **موافق** |
| 14 | نبود ادعای بهبود عمومی | **VERIFIED** | grep در گزارش | 0 | **موافق** |

---

## D. بررسی کد V2

### D.1 تشخیص echo — VERIFIED

فرمول واقعی از کد (نه از گزارش):

```javascript
function echoStatus(instruction, response) {
  if (resp.trim() === instr.trim()) return { status: 'EXACT' };
  if (resp.includes(instr)) {
    const rest = resp.replace(instr, '');
    const material = materialTokens(rest).length;
    if (material <= ECHO_MAX_EXTRA) return { status: 'CONTAINED' };
  }
  return { status: 'NONE' };
}
```

**تأیید:** echo پاسخ را با **instruction** مقایسه می‌کند، نه با expected. درست است.

**آستانه:** `ECHO_MAX_EXTRA = 0` — **۰.۵ نیست**. مأموریت §۴.۱ پرسید آیا ۰.۵ یک heuristics است. پاسخ: هیچ ۰.۵‌ای وجود ندارد. آستانه ۰ است و در کد با شواهد توجیه شده (ground truth برای PEB یک commit message + diff است، نه instruction).

**materialTokens:** کلمات >۲ کاراکتر به جز scaffolding (im_end, endoftext, response, instruction, system, user, assistant).

**false positive بررسی:**
- پاسخ خالی → `NONE` (به اشتباه echo نمی‌شود)
- پاسخ کوتاه ولی واقعی → `NONE` (مثلاً پروب ۷: prose معتبر برای task غیر-diff → echo=NONE)

**false negative بررسی:**
- echo جزئی (instruction + محتوای واقعی) → `NONE` گزارش می‌شود. این یک محدودیت واقعی است که در فایل مستند هم ذکر شده: «echo فقط containmentverbatim را تشخیص می‌دهد — paraphrase معنایی نیاز به embedding model دارد».

### D.2 تشخیص قالب diff — VERIFIED

قواعد واقعی از کد:

| ورودی | نتیجه | علت |
|---|---|---|
| ۱. diff معتبر با فایل واقعی | `FORMAT_OK` | 1 hunk, 7 content lines |
| ۲. prose بدون diff | `FORMAT_FAIL` | no fenced ```diff block |
| ۳. code block جعلی با +++/---/@@ | `FORMAT_FAIL` | 0 content lines, need >= 3 |
| ۴. diff ناقص | `FORMAT_FAIL` | 1 content line, need >= 3 |
| ۵. diff بدون نام فایل | `FORMAT_FAIL` | 2 content lines, need >= 3 |
| ۶. پاسخ خالی | `FORMAT_FAIL` | no fenced block |
| ۷. prose معتبر برای task غیر-diff | `FORMAT_OK` | PLAIN contract درست اعمال شد |
| ۸. prose اضافه قبل/بعد diff | `FORMAT_OK` | diff block داخل متن پیدا شد |
| ۹. echo + markers diff | echo=NONE, `FORMAT_FAIL` | هر دو سیگنال مستقل بررسی شدند |
| ۱۰. markers با فاصله/قالب‌بندی متفاوت | `FORMAT_FAIL` | regex `^@@` به خط می‌چسبد، فاصله شکست می‌خورد |

**نتیجهٔ کلیدی:** معیار صرفاً وجود چند نشانهٔ متنی را نمی‌سنجد — **ساختار patch را اعتبارسنجی می‌کند**: hunk header با regex خط‌آغاز، content lines با حداقل تعداد، و تشخیص فایل از ---/+++.

### D.3 امتیاز نهایی — VERIFIED با یک توضیح

**سؤال مأموریت §۴.۳: آیا شکست format همیشه امتیاز نهایی را صفر می‌کند؟**

**پاسخ: نه.** این یک تصمیم طراحی است، نه defect. کد:

```javascript
out.push({
  v1_content_score: round(overlap(resp, exp)),   // حتی با FORMAT_FAIL محاسبه می‌شود
  format_status: fmt.status,
  content_score_v2: round(cs.score),             // حتی با FORMAT_FAIL محاسبه می‌شود
  fail_reason: fmt.status === 'FORMAT_FAIL' ? `FORMAT_FAIL: ${fmt.clause}` : ...
});
```

پروب مستقل: یک ردیف `FORMAT_FAIL` داشت ولی `content_score_v2 = 0.6` گزارش شد.

**ارزیابی:** این درست است — دو سیگنال مستقل باید جدا گزارش شوند تا صفر کردن خودکار یک پاسخِ «قالب خراب ولی محتوای درست» را پنهان نکند. اما گزارش Atria باید صریح‌تر می‌گفت که FORMAT_FAIL نمره را صفر نمی‌کند. در فایل کد این مستند شده ولی در گزارش نهایی واضح نیست.

**task غیر-diff جریمه نمی‌شود:** پروب ۷ تایید کرد که PLAIN contract فقط تعداد کلمات را می‌سنجد و هیچ الزام diffی اعمال نمی‌کند.

**دادهٔ گمشده با صفر اشتباه گرفته نمی‌شود:** در `--partial` حالت، `per_row_v2` صریحاً `"NOT COMPUTABLE"` می‌گوید، نه ۰.

### D.4 آزمون‌ها — VERIFIED با Mutation Testing

```
node tools/ft/tests/metric-v2.test.js
16 passed, 0 failed     EXIT=0
```

**تعداد assertion واقعی:** ۴۳ `assert.*` call site در ۱۶ `check()` scenario. پس ۱۶ عنوان نیست — ۱۶ سناریو با ۴۳ assertion واقعی.

**Mutation testing (بررسی اینکه آیا تست‌ها واقعاً قرمز می‌شوند):**

| Mutation | نتیجهٔ تست | exit |
|---|---|---|
| غیرفعال‌سازی echo EXACT | 15 passed, **1 failed** | 1 |
| غیرفعال‌سازی hunk-count check | 7 passed, **9 failed** | 1 |
| جایگزینی diffTokens با tokenizer v1 | 15 passed, **1 failed** | 1 |

**نتیجه:** هر جهش کشف شد. تست‌ها real assertions هستند، نه hardcode.

---

## E. بازتولید V1 و دادهٔ خام

### E.1 آنچه قابل بازتولید است

**v1 arithmetic — VERIFIED:**
```
base:  (0.143 + 0.109)/2 = 0.126  == reported 0.126  ✓
tuned: (0.143 + 0.277)/2 = 0.210  == reported 0.21   ✓
delta: 0.210 − 0.126     = 0.084  == reported 0.084  ✓
n:     2                  == 2                       ✓
```

**v1 tokenizer blind spot — VERIFIED (گزاره A):**

پروب مستقل روی holdout واقعی PEB-09:
```
diff block: 3068 chars, 214 v1 tokens
v1 first tokens: ["diff","git","server","index","server","index","index","bee28ada",...]
any token starting with +/-?  false
```

پروب ایزوله: identical expected/response با added lines کاملاً نمادین:
```
v1_content_score: 0     ← برای یک پاسخ کامل!
content_score_v2: 1
```

**نتیجهٔ مستقل:** v1 ساختار patch را اعتبارسنجی نمی‌کند. **گزاره A ثابت شد.**

### E.2 آنچه قابل بازتولید نیست

```
tools/ft/bench-base.jsonl   MISSING
tools/ft/bench-tuned.jsonl  MISSING
git log --all -- "tools/ft/bench-*.jsonl"   (empty — never tracked on any branch)
git check-ignore                              (both IGNORED — .gitignore line 79)
```

**نتیجه:** خروجی خام inference در هیچ commit‌ای در هیچ branchی وجود ندارد و توسط .gitignore مستثنی شده.

### E.3 تمایز حیاتی (مأموریت §۶)

| گزاره | قابل اثبات از کد؟ | نتیجه |
|---|---|---|
| A. «v1 تضمین نمی‌کند پاسخ diff معتبر باشد» | **YES** | **VERIFIED** |
| B. «delta +0.084 فقط از واژگان commit message ناشی شده» | **NO — نیاز به response خام** | **NOT VERIFIED** |

**مغایرت با گزارش Atria:** گزارش در F3 (خط ۵۸ و ۹۹) گزاره B را به‌عنوان واقعیت بیان کرد:
> «یعنی «بهبود» گزارش‌شدهٔ delta=+0.084 **شامل سیگنال patch نیست** — فقط واژگان نثر است.»
> «روی سطرهای DIFF فقط واژگان commit-message prose اندازه‌گیری می‌شود.»

گزاره A ثابت است. گزاره B ثابت نیست — ممکن است پاسخ‌های واقعی دارای diff‌های درست باشند که واژگان commit message آن‌ها هم overlapping است. بدون response خام نمی‌توان این را تصمیم گرفت.

**الزام:** گزارش باید به این شکل اصلاح شود:
> «v1 ساختار diff را اعتبارسنجی نمی‌کند (ثابت). آیا delta گزارش‌شده شامل سیگنال patch بوده یا نه، بدون خروجی خام قابل تعیین نیست.»

### E.4 یافته‌های قابل تأیید دربارهٔ PEB-09

- `base_sim == tuned_sim == 0.143` — **VERIFIED** (از benchmark-report.json)
- ~~`overlap(instruction, expected) == 0` روی هر دو ردیف — **VERIFIED**~~ → **SUPERSEDED** (اصلاحیهٔ ۲۰۲۶-۱۰-۱۰، §E.4-rev1؛ دلیل و حکم جدید در ادامه)
- «پاسخ‌های PEB-09 در BASE و TUNED یکسان هستند» — **NOT VERIFIED** (نیاز به response خام)
- «پاسخ PEB-09 یک prompt-echo است» — **NOT VERIFIED** (نیاز به response خام)

#### E.4-rev1 — اصلاحیهٔ حکم `overlap(instruction, expected) == 0`

**دلیل تغییر حکم:** حکم اولیه (`VERIFIED`) در تاریخ ۲۰۲۶-۱۰-۰۹ صادر شد، **قبل از کشف باگ `tb.size` در §H.2** (همان تاریخ، بعدتر در همین سند). بازبینی متقابل این دو بخش نشان داد که آن‌ها دربارهٔ **همان خانوادهٔ تابع** و **همان دادهٔ واقعی** صحبت می‌کنند، و مقدار «صفر»ی که §E.4 به‌عنوان یک یافتهٔ معتبر ثبت کرده بود، در واقع **محصول همان باگ** بود که §H.2 آن را توضیح می‌دهد. حکم اولیه بر اساس اجرای کدِ دارای-باگ صادر شده بود؛ چون کد میانه `overlap()` در بازهٔ بین دو بررسی تغییر نکرده بود، خروجیِ بازتولیدشده تکرارپذیر بود و به اشتباه به‌عنوان «VERIFIED» ثبت شد — در حالی که ثباتِ خروجی، ثباتِ **یک باگ** را نشان می‌داد، نه ثباتِ یک اندازه‌گیری درست.

**بررسی یکسان‌بودن تابع و ورودی (پاسخ به مأموریت مرحلهٔ ۲-A):**

1. **آیا همان تابع است؟** بله — از نظر ساختاری. `benchmark.js:sim()` (§H.2، خطوط ۲۲-۳۰) و `metric-v2.js:overlap()` (خطوط ۱۱۴-۱۲۱) یک شکل هستند:
   ```javascript
   // هر دو تابع، به‌طور یکسان:
   const ta = new Set(toks(resp));
   const tb = toks(exp);              // Array در هر دو
   if (!ta.size || !tb.size) return 0; // tb.size === undefined → همیشه true
   ```
   تفاوت تنها در نام و محل است، نه در منطق. `overlap()` نسخهٔ منتقل‌شدهٔ `sim()` در metric-v2 است.

2. **آیا همان ورودی‌ها هستند؟** برای **ردیف ۰ بله، به‌طور دقیق**. §H.2 مقدار `sim(response, expected)` را گزارش می‌دهد و §E.4 مقدار `overlap(instruction, expected)` را. در ردیف ۰ این دو **یکسان** هستند زیرا پاسخِ ردیف ۰ خود یک prompt-echo است (`response == instruction`) — که همین تناظرِ عددی نیز آن را تأیید می‌کند (۰.۲۱۳۰ در هر دو). برای ردیف ۱ ورودی‌ها متفاوت‌اند (`response ≠ instruction`)، ولی هر دو از **همان فایلِ holdout واقعی** (`tools/ft/dataset/payesh-sft-holdout.jsonl`) و **همان توابع** تغذیه می‌شوند.

3. **آیا همان اجرا است؟** خروجیِ حکم اولیه با کد دارای-باگ تولید شد و این کد از آن زمان تاکنون ثابت مانده است (sha256 `13767db2a63d...`)، پس «صفر» تکرارپذیر است — اما تکرارپذیریِ یک خروجیِ غلط، آن را درست نمی‌کند.

**حکم جدید (بر پایهٔ اجرای معتبر):** مقادیر واقعیِ `overlap(instruction, output)` روی holdout واقعی، با اصلاحِ `tb.size` → `tb.length`:

| ردیف | `overlap` دارای-باگ (`.size` روی Array) | `overlap` اصلاح‌شده (`.length`) |
|---|---|---|
| ۰ | ۰.۰۰۰۰ | **۰.۲۱۳۰** |
| ۱ | ۰.۰۰۰۰ | **۰.۴۰۳۵** |

**اثبات خرابی کامل (sanity):** `overlap(x, x)` روی یک ورودیِ یکسان باید ۱.۰۰۰۰ باشد. مقدار دارای-باگ **۰.۰۰۰۰** است و مقدار اصلاح‌شده **۱.۰۰۰۰**. این یک اثبات ساختاری است: تابع تحتِ باگ حتی برای ورودیِ یکسان نیز ۰ برمی‌گرداند.

**نتیجهٔ اصلاح:** `overlap(instruction, expected) == 0` دیگر یک یافتهٔ معتبر نیست — این صفر **محصول باگ `tb.size`** است (ارجاع: §H.۲، خط ۴۲۱). حکم نهایی این ادعا از `VERIFIED` به **`NOT VERIFIED` (خطای اندازه‌گیری)** تغییر می‌کند.

**اثر روی استدلال خط ۲۲۵ (اصلًا):** استدلال پیشین می‌گفت «`overlap == 0` ثابت می‌کند یک echo کامل نمره ۰ می‌گرفت». این استدلال اکنون **باطل** است: یک echo کامل در واقع **۰.۲۱۳۰** (ردیف ۰) و **۰.۴۰۳۵** (ردیف ۱) نمره می‌گرفت — یعنی متریک v1 برای echo کامل نقاط می‌داد، هرچند ناچیز. شاخه‌های تحلیلی که از آن صفر استنتاج شده بودند باید دوباره بررسی شوند.

**توضیح (بازنویسی‌شده):** `base_sim == tuned_sim == 0.143` نشان می‌دهد نمرهٔ گزارش‌شده برای ردیف ۰ نه ۰ و نه ۰.۲۱۳۰ است. چون `benchmark-report.json` با نسخهٔ فعلیِ `sim()` قابل تولید نیست (§H.۲) و با نسخهٔ اصلاح‌شده نیز ۰.۲۱۳۰ می‌دهد، مقدار ۰.۱۴۳ از **نسخهٔ سومی** از کد می‌آید که دیگر موجود نیست. بدون response خام، تعیین اینکه ۰.۱۴۳ ناشی از محتوای واقعی است یا echo جزئی، ممکن نیست.

---

## F. loss و registry

### F.1 محاسبات loss — VERIFIED

از `run-manifest.json` (۵۷ مقدار loss_curve):

| مقدار | مقدار واقعی | ادعای registry | وضعیت |
|---|---|---|---|
| steps | 57 | 57 | ✓ |
| first loss | **3.0985** | ~5.6 («converged from») | **نادرست** |
| final loss | **6.7020** | 6.70 | ✓ |
| mean | **4.3822** | ~4.0 | **نادرست** |
| min | 1.8135 (step 46) | — | — |
| max | 7.4011 (step 19) | — | — |

**per-epoch means:**
```
epoch 1: 4.5106
epoch 2: 4.3722
epoch 3: 4.2637
```

**first-half vs second-half هر epoch (مأموریت §۷):**
```
epoch 1 | rows 0-8: 3.387 | rows 9-18: 5.522
epoch 2 | rows 0-8: 3.350 | rows 9-18: 5.292
epoch 3 | rows 0-8: 3.311 | rows 9-18: 5.121
```

**ترتیب dataset — VERIFIED:**
```
idx 0-7:  PEB-long  (2636..13116 chars) — row 3 = 13116 CONFIRMED
idx 8-18: PEES-short (67..235 chars)
```

**shuffle — VERIFIED وجود ندارد:**
```
grep -n "shuffle\|random" train-lean.py → NO MATCH
```

**max_len=768 — VERIFIED:**
```python
enc = tok(text, truncation=True, max_length=a.max_len, ...)
```
این truncation را روی **کل متن** (instruction + response) اعمال می‌کند. پس برای row 3 (۱۳۱۱۶ کاراکتر)، فقط ۷۶۸ توکن اول دیده می‌شود — تقریباً تمام response بریده می‌شود.

### F.2 تمایز علیت (مأموریت §۷)

| گزاره | قابل اثبات؟ | نتیجه |
|---|---|---|
| «ترتیب dataset با تفاوت loss همبستگی دارد» | **YES** | **VERIFIED** |
| «ترتیب dataset علت قطعی افزایش loss است» | **NO — نیاز به آزمون کنترل‌شده** | **NOT VERIFIED** |

**شواهد همبستگی:** در هر سه epoch، rows 0-8 (PEB-long) ~3.3 و rows 9-18 (PEES-short) ~5.3. الگو ۳/۳ epoch تکرار می‌شود.

**اما:** الگو **کاملاً تفکیک‌شده نیست**. آزمون pairwise: ۸ تخلف از ۲۷۰ جفت. پس برخی steps در نیمهٔ دوم از برخی steps در نیمهٔ اول کمترند. این همبستگی قوی است ولی **اثبات علیت نیست** — یک آزمون shuffle-vs-no-shuffle نیاز است که ممنوع است.

**مغایرت با گزارش Atria:** گزارش F4 گفت:
> «افزایش loss ناشی از نظم داده است، نه divergence.»

این گزارهٔ علی است. باید می‌گفت: «با نظم داده همبستگی دارد و با آن سازگار است». علت قطعی بدون آزمون کنترل‌شده قابل اعلام نیست.

### F.3 وضعیت MODEL_REGISTRY.md

**عبارت در baseline (و در working tree — تغییر نکرده):**
```
| final_loss | 6.70 (loss curve in run-manifest.json; mean ~4.0, converged from ~5.6) |
```

**وضعیت اصلاح:** **اصلاح نشده — و نباید هم اصلاح می‌شد** (مأموریت فقط شواهد را بررسی می‌کند).
```
git diff fd83a399 -- docs/MODEL_REGISTRY.md  →  (empty)
```

**نقص مستنداتی — CONFIRMED:**
1. `mean ~4.0` → واقعی **4.38** (اختلاف ۰.۳۸)
2. `converged from ~5.6` → واقعی **شروع از 3.10**. علاوه بر این، run در ۶.۷۰ **تمام می‌شود** — یعنی loss **افزایشی** است، پس کلمه «converged» کلاً غلط است.
3. `final_loss 6.70` → **درست**.

**ارزش درست (فقط بر اساس محاسبات واقعی، بدون توضیح علی):**
> `final_loss 6.70 (mean 4.38; loss rose from 3.10 to 6.70 over 57 steps — see run-manifest.json)`

---

## G. نقص‌های باز

| ID | شدت | نقص | مدرک | اقدام لازم | وضعیت |
|---|---|---|---|---|---|
| **G1** | **بالا** | گزارش Atria گزارهٔ B را (که نیاز به داده خام دارد) به‌عنوان واقعیت بیان کرد | گزارش خط ۵۸، ۹۹ | اصلاح به گزاره A + ذکر صریح اینکه B قابل تعیین نیست | **OPEN** |
| **G2** | **بالا** | گزارش گفت «۴ فایل جدید» ولی ۶ فایل موجود است | `git status --untracked-files=all` → ۶ | اصلاح شمارش (شامل خودِ فایل گزارش) | **OPEN** |
| **G3** | متوسط | گزارش F4 گفت «علت» برای loss ولی باید «همبستگی» می‌گفت | گزارش F4 | اصلاح به «همبستگی + نیاز به آزمون کنترل‌شده» | **OPEN** |
| **G4** | متوسط | گزارش واضح نمی‌گوید که FORMAT_FAIL نمره را صفر نمی‌کند | پروب مستقل §D.3 | اضافه کردن توضیح صریح | **OPEN** |
| **G5** | متوسط | `MODEL_REGISTRY.md` هنوز عبارت نادرست را دارد | خط ۲۲، baseline = working tree | اصلاح مستندات در یک commit جدا (خارج از scope این مأموریت) | **OPEN — ثبت به‌عنوان defect** |
| **G6** | پایین | خروجی خام inference هرگز commit نشد | `.gitignore` line 79 | پیشنهاد: ثبت `bench-*.jsonl` در repo | **OPEN — ثبت به‌عنوان پیشنهاد** |
| **G7** | پایین | F5 مشخص نکرد که کلمه «converged» خودش هم غلط است (نه فقط ~5.6) | §F.3 | اصلاح توضیح | **OPEN** |
| **G8** | **بالا** | **تست 4b یک false-green است** — `v1_content_score === 0` زیر باگ `tb.size` برای *هر* ورودی برقرار است؛ fixture مورد نظر از یک fixture حاوی کلمات واقعی تشخیص داده نمی‌شود. زیر کد اصلاح‌شده، fixture اصلی 4b **۱.۰۰۰۰** می‌گیرد (نه ۰) → 4b پس از اصلاح باگ **قرمز** می‌شود | پروب مستقل: هر دو fixture زیر کد دارای-باگ ۰.۰۰۰۰، زیر کد اصلاح‌شده ۱.۰۰۰۰ | دوباره‌سازی fixture 4b با `response ≠ expected`، یا حذف assertionِ v1 | **OPEN — ثبت به‌عنوان defect (FT-METRIC-01-R1 §۹.۶)** |

---

## H. تصمیم دربارهٔ آمادگی فایل‌ها

```
آماده نیست؛ نیازمند اصلاح
```

**علت:** فایل‌ها از نظر فنی سالم هستند — معیار کار می‌کند، آزمون‌ها واقعی هستند، داده‌های تاریخی حفظ شده‌اند. اما **گزارش نهایی** (FT-METRIC-01-REPORT.md) شامل G1 و G2 و G3 است که قبل از ارائه به مرحلهٔ بعد باید اصلاح شوند:

- G1 (گزاره B) یک **نقص شواهد** است — ادعایی بدون پشتیبانی داده خام
- G2 (شمارش فایل) یک **تناقض واقعی** است
- G3 (علت loss) یک **ادعای علی اثبات‌نشده** است

**کد خودش (metric-v2.js + tests) آماده است.** فقط گزارش نیاز به اصلاح دارد. هیچ کد قابل‌تأییدی مشکلی ندارد.

**پس از اصلاح G1-G4:** فایل‌ها آماده ارائه به مرحلهٔ بعد مشروط به ثبت در شاخهٔ مجزا با تأیید کاربر هستند.

---

## I. گزارش خلاصه برای ChatGPT

**آنچه واقعاً تأیید شد:**
۱. معیار v2 واقعاً کار می‌کند — ۱۰ پروب مستقل همه رفتار درست نشان دادند
۲. آزمون‌ها real هستند — ۴۳ assertion در ۱۶ سناریو، و mutation testing سه‌گانه همگی قرمز کردند
۳. v1 ساختار diff را نمی‌بیند — ثابت با پروب ایزوله (پاسخ کامل → v1=0)
۴. حفظ داده تاریخی با md5 قبل/بعد تأیید شد
۵. overlap(instruction, expected) == 0 روی هر دو holdout — تایید شد
۶. میانگین‌های v1 از نظر داخلی سازگارند — تایید شد
۷. ترتیب dataset (۸ long سپس ۱۱ short) با loss همبستگی دارد — تایید شد
۸. نبود shuffle، وجود max_len=768، و ۱۳۱۱۶ کاراکتر row 3 — همه تایید شدند
۹. MODEL_REGISTRY.md هنوز عبارت نادرست را دارد — تایید شد
۱۰. هیچ commit/push/merge‌ای انجام نشد — تایید شد

**آنچه تأیید نشد:**
۱. گزاره B (delta فقط از واژگان نثر) — نیاز به response خام
۲. برابری پاسخ‌های PEB-09 — نیاز به response خام
۳. prompt-echo بودن PEB-09 — نیاز به response خام
۴. علت قطعی افزایش loss — نیاز به آزمون shuffle کنترل‌شده
۵. امتیاز سطر-به-سطر v2 — نیاز به response خام

**مغایرت با گزارش Atria:**
۱. **مهم:** گزاره B به‌عنوان واقعیت بیان شد (باید «قابل تعیین نیست» می‌گفت)
۲. **مهم:** شمارش فایل ۴ بود ولی ۵ است
۳. **متوسط:** «علت» loss گفته شد ولی فقط همبستگی ثابت است
۴. **متوسط:** مشخص نشد که FORMAT_FAIL نمره را صفر نمی‌کند
۵. **جزئی:** «converged» خودش هم غلط است، نه فقط ۵.۶

**آیا فایل‌ها آمادهٔ commit هستند؟**
**خیر.** کد آماده است ولی گزارش نهایی نیاز به اصلاح G1-G4 دارد. پس از آن، آماده برای شاخهٔ مجزا با تأیید کاربر.

**مهم‌ترین گام بعدی:**
۱. اصلاح گزارش (G1: گزاره A/B، G2: شمارش، G3: همبستگی vs علت، G4: FORMAT_FAIL)
۲. سپس: ثبت `tools/ft/bench-*.jsonl` در repo (G6) — این بزرگ‌ترین گسست شواهد است
۳. سپس: اصلاح `MODEL_REGISTRY.md` در یک commit جدا (G5)

---

## J. منابع و شواهد

| شماره | شاهد | مسیر/فرمان |
|---|---|---|
| J1 | repo state | `git status`, `git rev-parse`, `git reflog` |
| J2 | ۶ فایل untracked | `git status --untracked-files=all` |
| J3 | v1 formula | `sed -n '20,30p' tools/ft/benchmark.js` |
| J4 | v1 blind spot | پروب مستقل `/tmp/iv_probe.js` (پاک شد) |
| J5 | v2 code | `sed -n '108,250p' tools/ft/metric-v2.js` |
| J6 | ۱۰ پروب قالب | پروب مستقل (§D.2) |
| J7 | آزمون‌ها | `node tools/ft/tests/metric-v2.test.js` exit=0 |
| J8 | mutation testing | سه جهش، همگی قرمز (§D.4) |
| J9 | hash preservation | `md5sum` قبل/بعد `--partial` |
| J10 | نبود خام | `ls` + `git log --all` + `git check-ignore` |
| J11 | loss stats | `node -e` روی `run-manifest.json` |
| J12 | registry | `git show fd83a399:docs/MODEL_REGISTRY.md` |

**یادآوری نهایی:** این بررسی صرفاً اعتبار معیار و مستندات را بررسی کرد. هیچ ادعایی دربارهٔ بهبود عمومی مدل مطرح نمی‌شود. هیچ فایل **tracked** یا کدِ پروژه‌ای تغییر نکرد (`git diff --stat HEAD` خالی، ۰ ورودی `M`). خودِ این سند و سایر خروجی‌های مأموریت فایل‌های untracked هستند و ویرایش آن‌ها درخت tracked را تحت تأثیر قرار نمی‌دهد (جزئیات: خط ۷، اصلاحیهٔ دقت).

---

## §H — بازتولید خروجی خام (پاسخ به یادآوری نظارتی ۲ هرمس، ۲۰۲۶-۱۰-۰۹)

هرمس در یادآوری نظارتی خواستار بازتولید `tools/ft/bench-*.jsonl` شد. این بازتولید انجام شد و **دو یافتهٔ بحرانی** آشکار کرد.

### H.۱ — روش بازتولید

| مورد | مقدار |
|---|---|
| container | `82cedb345e56` (sandbox هرمس) |
| محیط | torch 2.7.0+cpu / transformers 4.55.4 / peft 0.21.2 |
| base model | `Qwen/Qwen2.5-0.5B` (۹۸۸MB، gitignored) |
| adapter | `runs/payesh-sft-005/adapter_model.safetensors` |
| اسکریپت | `tools/ft/infer.py` با `do_sample=False` (greedy، قطعی) |
| خروجی | `bench-base.jsonl` (۲ ردیف، ۱۲.۸KB) + `bench-tuned.jsonl` (۲ ردیف، ۱۲.۵KB) |

**توجه:** `benchmark.js` اجرا نشد چون `benchmark-report.json` کامیت‌شده را بازنویسی می‌کند (در main()، خط ۷۱-۷۲). فقط بخش خواندن/تحلیل مجزا استفاده شد.

### H.۲ — یافتهٔ بحرانی ۱: باگ `sim()` در `benchmark.js` کامیت‌شده

تابع `sim()` در `benchmark.js` (خط ۲۲-۳۰، کامیت `9ed2ac51`):

```javascript
const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);
if (!ta.size || !tb.size) return 0;   // tb یک Array است
```

`tb` یک **Array** است، نه Set. `tb.size` همیشه `undefined` است. `!undefined === true`، پس شرط `||` همیشه true است و تابع **همیشه ۰ برمی‌گرداند**.

پروب مستقل روی دادهٔ واقعی تأیید کرد:

| ردیف | sim کامیت‌شده (base) | sim اصلاح‌شده (base) |
|---|---|---|
| ۰ | **۰** | ۰.۲۱۳۰ |
| ۱ | **۰** | ۰.۱۱۷۰ |

**نتیجهٔ منطقی:** `benchmark-report.json` کامیت‌شده (با base ۰.۱۲۶ / tuned ۰.۲۱ / delta ۰.۰۸۴) **نمی‌تواند** توسط همان `benchmark.js` کامیت‌شده تولید شده باشد — چون آن کد همیشه ۰ تولید می‌کند. هر دو فایل در **یک کامیت واحد** (`9ed2ac51`) هستند.

### H.۳ — یافتهٔ بحرانی ۲: عدم تطابق ساختار فایل

`benchmark.js` کامیت‌شده در هر row فیلدهای `base_len` و `tuned_len` می‌نویسد (خط ۵۷-۵۸). اما `benchmark-report.json` کامیت‌شده **این فیلدها را ندارد**:

```
$ git show HEAD:tools/ft/benchmark-report.json | grep -c "base_len\|tuned_len"
0
```

این دومین مدرک مستقل است که گزارش با کد کامیت‌شده همخوانی ندارد — گزارش توسط **نسخهٔ دیگری** از کد تولید شده که دیگر وجود ندارد یا هرگز کامیت نشده است.

### H.۴ — یافتهٔ بحرانی ۳: تصادف خطرناک در delta

| | base | tuned | delta |
|---|---|---|---|
| گزارش کامیت‌شده | ۰.۱۲۶ | ۰.۲۱ | **۰.۰۸۴** |
| بازتولید با sim اصلاح‌شده | ۰.۱۶۵۰ | ۰.۲۴۹۸ | **۰.۰۸۴۸** |

delta بازتولیدشده (۰.۰۸۴۸) به‌طرز چشمگیری به delta کامیت‌شده (۰.۰۸۴) نزدیک است. **اما این یک تصادف خطرناک است، نه تأیید بازتولیدپذیری:**

- مقادیر per-row اصلاً مطابقت ندارند: ۰.۲۱۳۰ در برابر ۰.۱۴۳ (ردیف ۰)، ۰.۱۱۷۰ در برابر ۰.۱۰۹ (ردیف ۱).
- دلیل تطابق delta: **۱۰۰٪ بهبود از یک ردیف می‌آید**. ردیف ۰ (PEB-09) base و tuned **دقیقاً یکسان** هستند (هر دو prompt-echo)، پس delta صفر. کل delta از ردیف ۱ (PEB-10) می‌آید.
- میانگین دو ردیف، اختلاف مکانی را پنهان می‌کند: (۰ + ۰.۱۶۹۶) / ۲ = ۰.۰۸۴۸.

**هشدار:** هر تحلیلی که delta=۰.۰۸۴ را به‌عنوان تأیید بازتولیدپذیری تفسیر کند، اشتباه می‌کند. میانگین‌گیری روی n=۲ که یکی از ردیف‌ها صفر است، همواره نتیجه را نصفِ مقدار تک‌ردیف می‌کند.

### H.۵ — یافتهٔ مثبت: prompt-echo اکنون قابل تأیید است

یادآوری هرمس گفت prompt-echo بودن «قابل تأیید نیست». اکنون قابل تأیید است:

| ردیف | PEB | base prompt-echo? | tuned prompt-echo? |
|---|---|---|---|
| ۰ | PEB-09 | **بله** — response length ۳۲۲ == instruction length ۳۲۲ | **بله** — base و tuned **یکسان** |
| ۱ | PEB-10 | خیر (۹۶۹ chars) | خیر (۶۸۹ chars) |

ردیف ۰: مدل base کل instruction را به‌عنوان response برمی‌گرداند (حرف‌به‌حرف). مدل tuned **همین کار را می‌کند** — LoRA روی PEB-09 هیچ تغییری ایجاد نکرده است.

گزارهٔ «برابری پاسخ‌های PEB-09»: **رد شد**. `tuned.response === expected` برای **هر دو** ردیف `false` است.

### H.۶ — بررسی حساسیت و حجم (پیش‌شرط سیاست انتشار)

هرمس خواستار خارج کردن bench files از `.gitignore` بود. پیش از هر اقدام، بررسی حساسیت انجام شد:

| بررسی | نتیجه |
|---|---|
| حجم | ۱۲.۸KB + ۱۲.۵KB = ۲۵.۳KB (۲ ردیف) — قابل انتشار |
| الگوهای secret/token | فقط مقادیر test-fixture: `PAYESH_OTP_PEPPER: 'otp-ratelimit-shared-pepper'` و `"secret_key"` در یک پاسخِ degenerate — اسرار واقعی نیستند، از corpus خود repo آمده‌اند |
| PII فارسی (کد ملی/تلفن/نام) | **یافت نشد** |
| مالکیت | محتوای diff از commit‌های خود پروژه است (A-02) |

**اما: این فایل‌ها کامیت نشدند.** مأموریت صراحتاً می‌گوید: «پس از پایان، تغییرات را commit یا push نکن.» و «فایل‌های خام بنچمارک را بدون بررسی حساسیت، حجم و سیاست انتشار وارد Git نکن». بررسی انجام شد و فایل‌ها قابل انتشار هستند، اما **قفل commit توسط همان دستور مأموریت نگه داشته شده است**. تصمیم کامیت بر عهدهٔ کاربر است، نه من.

### H.۷ — وضعیت نهایی

| تکلیف یادآوری | وضعیت |
|---|---|
| نکته ۱: اصلاح شمارش ۵→۶ | **انجام شد** (§های قبلی، ۵ ویرایش) |
| نکته ۲: بازتولید bench-*.jsonl | **انجام شد** — و ۳ یافتهٔ بحرانی جدید |
| نکته ۲: کامیت bench files | **BLOCKED** — ممنوعیت commit در مأموریت |
| نکته ۳: false-green تست 4b | **کشف شد** (G8) — یک یافتهٔ تکمیلی از ممیزی اثر `tb.size`: خودِ suite آزمون نیز به باگ وابسته است |

**verdict نهایی برای §H:** `REVALIDATION_REQUIRED`.

دلیل: `benchmark-report.json` کامیت‌شده با کدی که در همان کامیت است قابل تولید نیست (باگ `tb.size` + نبود فیلدهای `base_len`/`tuned_len`). ارقام اصلی قابل بازتولید نیستند — نه با کد فعلی (که ۰ می‌دهد) و نه با کد اصلاح‌شده (که ارقام متفاوتی می‌دهد). فقط delta به‌طور تصادفی نزدیک است.

**توصیه:** ارقام `benchmark-report.json` باید دوباره تولید و دوباره کامیت شوند (توسط کسی که اجازهٔ commit دارد)، همراه با bench files. این یک defect جدید و خارج از scope این بررسی است.
