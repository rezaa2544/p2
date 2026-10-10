# PAYESH — FT-METRIC-01 / Scoped Remediation Mission
## گزارش پایانی: Metric Correctness, Test Validity & Mutation Guard

**تاریخ:** ۲۰۲۶-۱۰-۱۰ | **شاخه:** `ft-metric-01` | **HEAD مبنا:** `fd83a39927300e65396bfef57980c71abdb87c9d`
**اجرا:** Atria در ZCode | **بازرسی مستقل:** Hermes | **هیچ commit/push/merge‌ای انجام نشد**

> **رابطه با سندهای قبلی:** این گزارش مربوط به مأموریت **Scoped Remediation** (اصلاح سه‌محوری) است و سند `FT-METRIC-01-FINAL-REPORT.md` (فاز آشتیابی گزارش + کشف باگ، که با *صفر تغییر کد* تمام شد) را **بازنویسی نمی‌کند** — آن سند به‌عنوان شاهد تاریخی دست‌نخورده باقی می‌ماند. تفاوت‌های وضعیت بین دو سند در §۸ تشریح شده است.

---

## ۱) Environment & Repo Truth

| مورد | مقدار | فرمان راستی‌آزمایی |
|---|---|---|
| Repository | `p2` (clone هرمس) | `git rev-parse --show-toplevel` |
| Branch | `ft-metric-01` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` (**یکسان با مبنا**) | `git rev-parse HEAD` |
| Remote | `https://github.com/rezaa2544/p2.git` | `git remote get-url origin` |
| Commits جدید از مبنا | **۰** | `git rev-list --count fd83a399..HEAD` → `0` |
| Push / merge | **صفر** | reflog فقط `checkout` |
| **فایل‌های tracked تغییرکرده** | **۱** (`tools/ft/benchmark.js`) | `git diff --stat HEAD` |
| **فایل‌های untracked در `tools/ft/`** | **۹** | `git status --porcelain` |
| پلتفرم | `win32 10.0.22631 x64`، **Git Bash واقعی** | `uname -a` |
| `cygpath` | موجود (`/usr/bin/cygpath`) | `command -v cygpath` |

**لیست کامل untracked (دست‌نخورده مگر سه فایل ویرایش‌شده در §۳):**

```
?? tools/ft/FT-METRIC-01-FINAL-REPORT.md
?? tools/ft/FT-METRIC-01-INDEPENDENT-VERIFICATION.md
?? tools/ft/FT-METRIC-01-PERMANENT-CONTROLS.md
?? tools/ft/FT-METRIC-01-REPORT.md
?? tools/ft/metric-v2-comparison.json
?? tools/ft/metric-v2-partial-report.json
?? tools/ft/metric-v2.js          ← ویرایش‌شده (محور ۱)
?? tools/ft/mutation-test.sh      ← ویرایش‌شده (محور ۳)
?? tools/ft/tests/                ← ویرایش‌شده (محور ۲: metric-v2.test.js)
```

هیچ فایل untrackery حذف یا overwrite نشد. `benchmark-report.json` (tracked) در `git status` ظاهر نشد → **دست‌نخورده**.

---

## ۲) Initial Evidence (وضعیت پیش از ویرایش)

| فایل | sha256 پیش از اصلاح | sha256 پس از اصلاح |
|---|---|---|
| `metric-v2.js` | `13767db2a63d899132414149728a8d6fb0570426431c7c87f33de91fe9a08181` | `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` |
| `benchmark.js` (blob base در HEAD) | `8f105e83` (git blob) | `eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff` |
| `tests/metric-v2.test.js` | — | `c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e` |
| `mutation-test.sh` | — | `e224f3a1d3ea7989c9afdcf74dd81160d30805f0d868466a36f572a0de4edd3f` |

**باگ تأییدشده پیش از اصلاح** (ثبت‌شده به‌عنوان `FT-METRIC-01-R1` در `FT-METRIC-01-PERMANENT-CONTROLS.md` §۹):

```javascript
function overlap(resp, exp) {
  const ta = new Set(toks(resp));
  const tb = toks(exp);        // Array — .size نامعتبر است
  if (!ta.size || !tb.size) return 0;   // !undefined === true → همیشه return 0
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / tb.size;                  // dead code
}
```

`toks()` یک **Array** برمی‌گرداند؛ `.size` روی Array همیشه `undefined` است؛ `!undefined === true` پس گارد `||` همیشه `true` می‌شود و تابع **قبل از پیمایش** `0` برمی‌گرداند. حلقه و `return` پایانی هرگز اجرا نمی‌شدند.

**اثر عملی (بازتولید مستقل):** زیر کد باگ‌دار، `v1_content_score` برای **هر پنج ردیف آزمون** (هویتی، جزئی، مجزا، خالی-resp، خالی-exp) برابر `0.0000` بود — صرف نظر از ورودی. این بازتولید مستقلِ ادعای §H.۲ گزارش هرمس است.

---

## ۳) Changed Files

سه فایل ویرایش شدند — هر کدام فقط در محدودهٔ یکی از سه محور:

| فایل | محور | ماهیت تغییر | سطرها |
|---|---|---|---|
| `tools/ft/metric-v2.js` | ۱ | `overlap()`: `tb.size` → `tb.length` (۲ مورد) | ۱۱۷، ۱۲۰ |
| `tools/ft/benchmark.js` | ۱ | `sim()`: `tb.size` → `tb.length` (۲ مورد) | ۲۵، ۲۸ |
| `tools/ft/tests/metric-v2.test.js` | ۲ | بازطراحی کامل تست 4b | یک تست جایگزین شد |
| `tools/ft/mutation-test.sh` | ۳ | ۵ تغییر (§۶) | سراسری |

**تغییرات tracked (تنها `benchmark.js`):**

```diff
-  const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);
-  if (!ta.size || !tb.size) return 0;
+  const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);  // Array — .length (FT-METRIC-01-R1)
+  if (!ta.size || !tb.length) return 0;
   let hit = 0;
   for (const w of tb) if (ta.has(w)) hit++;
-  return hit / tb.size;
+  return hit / tb.length;
```

`git diff --stat HEAD` → `1 file changed, 3 insertions(+), 3 deletions(-)`. **هیچ فایل tracked دیگری لمس نشد.**

---

## ۴) محور ۱ — اصلاح باگ Metric

### ۴.۱ دو تابع آلوده، یک علت ریشه‌ای

`overlap()` در `metric-v2.js:114-121` و `sim()` در `benchmark.js:22-29` از نظر ساختاری **یکسان** بودند (هر دو: `new Set(toks(resp))`، `toks(exp)`، `!ta.size || !tb.size`). هر دو از یک منبع واحد کپی شده بودند. اصلاح فقط مقادیر آلوده را عوض کرد و ساختار را حفظ کرد.

### ۴.۲ مسیرهای مصرف‌کننده

| مصرف‌کننده | تابع | وضعیت |
|---|---|---|
| `contentScore()` سطر ۲۴۵ (`metric-v2.js`) | `diffOverlap()` | **سالم بود** (`tb.length` از قبل) — مسیر DIFF |
| `contentScore()` سطر ۲۴۷ | `overlap()` | آلوده بود → اصلاح شد — مسیر PLAIN |
| `v1_content_score` سطر ۳۷۹ | `overlap()` | اصلاح شد |
| `benchmark.js` `runMode()` | `sim()` | اصلاح شد |

**نکتهٔ مهم:** مسیر DIFF (`diffOverlap`) هرگز آلوده نبود — این مسیر از `diffTokens()` (line-oriented) استفاده می‌کند و از `tb.length` استفاده می‌کرد. فقط مسیر PLAIN آلوده بود. هیچ تغییری در مسیر سالم DIFF داده نشد (محدودیت مأموریت رعایت شد).

### ۴.۳ آزمون‌های ضروری (همگی از طریق CLI واقعی، نه ارزیابی دستی توابع)

| حالت | v1_content_score (اصلاح‌شده) | v1_content_score (باگ‌دار) | finite? |
|---|---|---|---|
| **هویتی** `overlap(x,x)` | **۱.۰۰۰۰** ✔ | ۰.۰۰۰۰ | بله |
| جزئی (زیرمجموعه از exp) | **۰.۵۵۶۰** (۵/۹) | ۰.۰۰۰۰ | بله |
| مجزا (بدون توکن مشترک) | **۰.۰۰۰۰** | ۰.۰۰۰۰ | بله |
| response خالی | **۰.۰۰۰۰** | ۰.۰۰۰۰ | بله |
| expected خالی | **۰.۰۰۰۰** | ۰.۰۰۰۰ | بله |

- **هویت = ۱.۰** برقرار است (COR-8: `f(x,x) === 1.0`).
- **هیچ NaN یا مقدار نامتناهی** در هیچ حالتی.
- حالت جزئی ۰.۵۵۶ = ۵ توکن مشترک از ۹ توکن exp — با دستی محاسبه‌شده مطابق است.
- تفاوت کلیدی: زیر کد باگ‌دار **همه** ۰ می‌شوند؛ اصلاح رفتار را به ضرایب واقعی بازگرداند.

### ۴.۴ حفظ قرارداد سایر موارد

- suite کامل **۱۹/۱۹ PASS** زیر کد اصلاح‌شده (§۷).
- تست ۷ (byte-identical `benchmark-report.json` با اعداد تاریخی ۰.۱۲۶/۰.۲۱/۰.۰۸۴/n=2) همچنان **PASS** است → اعداد تاریخی بازنویسی نشدند.
- `diffOverlap()` و کل مسیر DIFF دست‌نخورده.

---

## ۵) محور ۲ — بازطراحی تست 4b

### ۵.۱ چرا تست قدیمی false-green بود

تست 4b قدیمی ادعای «v1 به payload نمادین کور است» را به‌صورت `assert.strictEqual(score, 0)` می‌ساخت. زیر باگ `tb.size`، **همه** scoreها ۰ بودند، پس این ادعا به‌طور **تصادفی** برقرار می‌شد — تست باگ را تأیید می‌کرد، نه اینکه آن را بشکافد.

### ۵.۲ تست جدید: کنترل مثبت + کنترل منفی

| fixture | payload | v1 | v2 | format |
|---|---|---|---|---|
| **مثبت** (response دقیقاً payload را بازتولید می‌کند) | `x = { a: 1 }; y = [ 2, 3 ];` | **۱.۰۰۰۰** | **۱.۰۰۰۰** | FORMAT_OK |
| **منفی** (همان metadata، payload متفاوت) | `p = { q: 9 }; r = [ 8, 7 ];` | **۱.۰۰۰۰** | **۰.۳۳۳۰** | FORMAT_OK |

هر دو fixture شامل `diff --git a/f.js b/f.js`، `@@ -1,3 +1,5 @@` و پیام commit یکسان (`fix`) هستند — تفاوت **تنها** در دو سطر payload نمادین است.

### ۵.۳ چهار ادعای تست (هر کدام یک خاصیت مجزا)

```javascript
// (۱) هر دو قرارداد DIFF را برآورده می‌کنند (diff --git به‌عنوان content line حساب می‌شود)
assert.strictEqual(p.format_status, 'FORMAT_OK', ...);
assert.strictEqual(n.format_status, 'FORMAT_OK', ...);
// (۲) کنترل مثبت: v1 باید واژه‌های مشترک header (fix/diff/git) را ببیند
assert.ok(p.v1_content_score > 0, ...);
// (۳) نقطهٔ کوری: v1 برای payload بازتولیدشده و payload جایگزین‌شده یکسان است
assert.strictEqual(p.v1_content_score, n.v1_content_score, ...);
// (۴) v2 کور نیست: payload بازتولیدشده بالاتر امتیاز می‌گیرد
assert.ok(p.content_score_v2 > n.content_score_v2, ...);
```

### ۵.۴ اثبات قابلیت تشخیص (discriminating power)

| اجرا | نتیجه | معنی |
|---|---|---|
| suite روی **کپی باگ‌دار** | **۱۸ passed، ۱ failed** — فقط 4b قرمز | تست جدید زیر کد باگ‌دار **قرمز** می‌شود → false-green حذف شد |
| suite روی **کد اصلاح‌شده** | **۱۹ passed، ۰ failed** | زیر کد سالم سبز است |
| suite روی کد اصلاح‌شده با MUT5 تزریق‌شده | 4b قرمز | به یک رگرشن guard واقعی تبدیل شد |

**دو نتیجهٔ کلیدی:**
1. فقط **4b** زیر کد باگ‌دار شکست خورد → هیچ تست دیگری به رفتار باگ‌دار وابسته نبود (هیچ false-green دیگری در suite نیست).
2. `assert.ok(p.v1_content_score > 0)` زیر باگ (v1 همیشه ۰) شکست می‌خورد → تست **نمی‌تواند** تصادفی سبز شود.

### ۵.۵ واژه‌های header نتیجه را تعیین نمی‌کنند — بلکه موضوع آزمون‌اند

سؤال مأموریت: «واژه‌های مشترک در headerهایی مثل `diff --git` نباید نتیجه را ناخواسته تعیین کنند.» در این طراحی، حضور واژه‌های مشترک header **خودِ خاصیت آزمون** است، نه یک عامل مخدوش‌کننده: ادعا (۳) می‌گوید v1 **فقط** همان واژه‌های header را می‌بیند و به payload کور است، و ادعا (۴) می‌گوید v2 فراتر از header را می‌بیند. اگر headerها نتیجه را «ناخواسته» تعیین می‌کردند، ادعا (۳) برقرار نمی‌شد — چون v1 باید payload را هم می‌دید.

---

## ۶) محور ۳ — اصلاح mutation-test.sh

پنج تغییر، همه برای قابل‌اعتماد بودن در Windows/Git Bash:

| # | تغییر | مشکل حل‌شده |
|---|---|---|
| ۱ | تشخیص خوانا نبودن مسیر tmp توسط Node + تبدیل دفاعی `cygpath -w` + fail-loud اگر cygpath نباشد (سطرهای ۴۳-۵۷) | msys path `/tmp/...` ممکن است توسط Node بومی Windows رد شود → همه ERROR می‌شدند |
| ۲ | بازنویسی جدول mutation از آرایهٔ pipe-delimited به `MUT_IDS` + متغیرهای مستقل `*_N`/`*_R` (سطرهای ۶۰-۹۰) | جداکنندهٔ `\|` با عملگر `\|\|` در needle یک MUT5 تداخل داشت → **SyntaxError واقعی در کپی جهش‌یافته** (توسط probe کشف شد) |
| ۳ | تشخیص شکست `cp` با `\|\| { N_ERROR++; continue; }` (سطر ۱۳۷) | یک stage ناموفق ERROR گزارش نمی‌شد |
| ۴ | **Liveness probe** قبل از اجرای suite (سطرهای ۱۵۴-۱۷۶) | یک کپی دارای SyntaxError exit ۱ با «N passed, M failed» می‌داد و classifier آن را **KILLED** می‌نامید — در حالی که مأموریت صریحاً خطای syntax را به‌عنوان تشخیص ممنوع کرده است |
| ۵ | شمارش نهایی `${#MUT_IDS[@]}` (سطر ۲۱۱) | اضافه‌شدن MUT5 شمارش total را هم نگه می‌دارد |

**حفظ‌اشده‌ها (دست‌نخورده):** مدل ایمنی کپی + `verify_original()` با sha256 بعد از هر mutation، classification سه‌حاله (KILLED/SURVIVED/ERROR)، hook `FT_METRIC_V2_PATH` که فایل تست را هرگز کپی/ویرایش نمی‌کند، `trap cleanup` در EXIT.

### ۶.۱ MUT5 — پوشش مسیر PLAIN

موتاسیون جدید `if (!ta.size || !tb.length) return 0;` → `!tb.size` دقیقاً باگ FT-METRIC-01-R1 را دوباره تزریق می‌کند. این needle **دقیقاً یک‌بار** رخ می‌دهد (مهم) چون `diffOverlap()` شکل گارد متفاوتی دارد. MUT5 توسط تست **4b** کشته می‌شود → 4b یک رگرشن guard واقعی برای این باگ است.

### ۶.۲ نتایج نهایی guard

```
KILLED | MUT1 | exit=1 | 17 passed, 2 failed   → tests 1, 12
KILLED | MUT2 | exit=1 | 17 passed, 2 failed   → tests 3b, R1
KILLED | MUT2b| exit=1 | 18 passed, 1 failed   → test R3
KILLED | MUT3 | exit=1 | 17 passed, 2 failed   → tests 4b, R2
KILLED | MUT4 | exit=1 | 18 passed, 1 failed   → test R1
KILLED | MUT5 | exit=1 | 18 passed, 1 failed   → test 4b

KILLED=6  SURVIVED=0  ERROR=0  (total 6)
GUARD: PASS — every injected fault was detected.
```

sha256 `metric-v2.js` قبل و بعد از guard: `1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309` (ثابت).

### ۶.۳ پذیرش الزامات خاص مأموریت

| الزام | نتیجه | شاهد |
|---|---|---|
| `ERROR > 0` باید exit non-zero دهد | **تأیید** — `if [ "$N_SURVIVED" -gt 0 ] \|\| [ "$N_ERROR" -gt 0 ]; then exit 1` (سطر ۲۱۷) | شبیه‌سازی `N_ERROR=5` → `SIM_EXIT=1`؛ `N_ERROR=0,N_KILLED=6` → `SIM_EXIT=0` |
| `KILLED=0 SURVIVED=0 ERROR=5` نباید exit 0 | **تأیید** | همان بلوک |
| mutation اجرا‌نشده/خطاداده `PASS` گزارش نشود | **تأیید** — probe قبل از suite | کپی دارای SyntaxError: probe exit=1, json=none → **ERROR** (نه KILLED) |
| cleanup در موفقیت و شکست | **تأیید** | `trap 'rm -rf "$WORK_DIR"' EXIT` + `rm -rf` صریح در سطر ۲۱۵؛ هیچ `ftmut.*` در `/tmp` باقی نماند |
| شکست با `\|\| true` پنهان نشود | **تأیید** | هیچ `\|\| true` در اسکریپت وجود ندارد (grep تأیید کرد) |
| اگر `cygpath` استفاده می‌شود، وجودش بررسی شود | **تأیید** | `command -v cygpath` قبل از استفاده (سطر ۴۹) |

### ۶.۴ ثبت صادقانهٔ دو ادعای هرمس که در این محیط قابل بازتولید نبودند

1. **«مسیر tmp توسط Node با ENOENT رد می‌شود»** — در این Git Bash، Node.js مسیر `/tmp/...` را **خواند** (`node -e 'fs.statSync(...)'` exit ۰). این ادعا در این محیط قابل بازتولید نبود. با این حال تبدیل دفاعی `cygpath` به‌عنوان محافظت برای محیط‌های دیگر (که Node بومی Windows ممکن است مسیر msys را نپذیرد) اضافه شد و fail-loud است.
2. **`ERROR=5 → exit 0`** — در نسخهٔ فعلی این ادعا **نادرست** است؛ `N_ERROR>0` همیشه exit ۱ می‌دهد (سطر ۲۱۷). اگر این ادعا مربوط به نسخهٔ قدیمی‌تری از اسکریپت بوده، اکنون برطرف شده است.

**هر دو نکته در این گزارش ثبت شدند تا هرمس بتواند وضعیت واقعی را راستی‌آزمایی کند، نه ادعای من.**

---

## ۷) Test Matrix

| # | فرمان | محیط | نتیجه | exit code |
|---|---|---|---|---|
| ۱ | `node tools/ft/tests/metric-v2.test.js` | کد اصلاح‌شده | **۱۹ passed, 0 failed** | **۰** |
| ۲ | `bash tools/ft/mutation-test.sh` | کد اصلاح‌شده | **۶/۶ KILLED, 0 SURVIVED, 0 ERROR** | **۰** |
| ۳ | `bash tools/ft/mutation-test.sh` با `TMPDIR="/tmp/ft space dir"` | مسیر دارای فاصله | **۶/۶ KILLED** | **۰** |
| ۴ | suite روی کپی باگ‌دار (تزریق `tb.size` در `overlap`) | کد باگ‌دار | **۱۸ passed, 1 failed** (فقط 4b) | **۱** |
| ۵ | `node metric-v2.js --rows ft-identity-rows.jsonl` | کد اصلاح‌شده | identity=1.0, partial=0.556, disjoint=0, empties=0 — همه finite | **۰** |
| ۶ | همان ردیف‌ها روی کپی باگ‌دار | کد باگ‌دار | **همه ۰.۰۰۰۰** | **۰** |
| ۷ | probe روی کپی دارای SyntaxError | سناریوی خطا | probe exit=1, json=none → **ERROR** | guard **۱** |
| ۸ | شبیه‌سازی `N_KILLED=0 N_SURVIVED=0 N_ERROR=5` | بلوک تصمیم exit | `GUARD: FAIL` | **۱** |
| ۹ | شبیه‌سازی `N_KILLED=6 N_SURVIVED=0 N_ERROR=0` | بلوک تصمیم exit | `GUARD: PASS` | **۰** |
| ۱۰ | تست 4b اعداد دقیق (POSITIVE vs NEGATIVE) | کد اصلاح‌شده | v1: 1.0 vs 1.0 (کور)؛ v2: 1.0 vs 0.333 (تشخیص) | **۰** |
| ۱۱ | `node metric-v2.js --partial` | determinism | sha256 report ثابت | **۰** |

**NOT RUN (صراحتاً):** هیچ تستی روی Linux/macOS اجرا نشد. تمام اجراهای محیطی در **Git Bash واقعی روی win32 10.0.22631** بود — مطابق الزام مأموریت («از Linux نتیجهٔ Windows را استنباط نکن»). مسیر tmp با `cygpath` در این محیط فعال نشد چون Node مسیر msys را خواند (§۶.۴).

---

## ۸) Historical Impact

| سند / داده | وضعیت |
|---|---|
| `benchmark-report.json` (tracked) | **دست‌نخورده** — تست ۷ byte-identical را تأیید می‌کند (۰.۱۲۶/۰.۲۱/۰.۰۸۴/n=2) |
| `FT-METRIC-01-REPORT.md` | **دست‌نخورده** |
| `FT-METRIC-01-INDEPENDENT-VERIFICATION.md` | **دست‌نخورده** |
| `FT-METRIC-01-PERMANENT-CONTROLS.md` | **دست‌نخورده** (رجیستر COR-1..COR-9 + §۹) |
| `FT-METRIC-01-FINAL-REPORT.md` | **دست‌نخورده** — سند فاز قبلی، شاهد تاریخی باقی می‌ماند |
| `metric-v2-comparison.json`, `metric-v2-partial-report.json` | **دست‌نخورده** |

**تفاوت‌های وضعیت نسبت به `FT-METRIC-01-FINAL-REPORT.md` (فاز قبلی) — صریح:**

| بعد | فاز قبلی (آشتیابی) | این مأموریت (اصلاح) |
|---|---|---|
| فایل‌های tracked تغییرکرده | **۰** | **۱** (`benchmark.js`) |
| sha256 `metric-v2.js` | `13767db2...` (دست‌نخورده) | `1f7937e5...` (اصلاح‌شده) |
| باگ `tb.size` | **کشف و ثبت شد** (FT-METRIC-01-R1)، اصلاح نشد | **اصلاح شد** |
| تست 4b | وجود داشت (false-green) | **بازطراحی شد** (کنترل مثبت/منفی) |
| mutation guard | ۵/۵ KILLED | **۶/۶ KILLED** (MUT5 اضافه شد) + probe + تبدیل مسیر |
| `overlap(x,x)` | ۰.۰۰۰۰ (باگ) | **۱.۰۰۰۰** |

**تفاوت مهم «بازمحاسبهٔ عدد» و «اجرای مجدد واقعی»:** اعداد `benchmark-report.json` در این مأموریت **بازمحاسبه نشدند** — فایل دست‌نخورده است. suite فقط روی کد اصلاح‌شده اجرا شد و تطابق byte-identical گزارش تاریخی تأیید شد. **هیچ ادعایی دربارهٔ بهبود مدل از اصلاح metric مطرح نیست** — اصلاح، خروجی metric را از «همیشه صفر» به «ضرایب واقعی» تغییر داد، که معنایش این است که اعداد v1 در گزارش‌های قبلی **همگی به‌صورت کاذب صفر بوده‌اند**، نه اینکه مدل بد بوده باشد.

---

## ۹) Residual Risks

| # | ریسک | شدت | توضیح |
|---|---|---|---|
| R-۱ | اعداد v1 در تمام گزارش‌های تاریخی کذب صفر بوده‌اند | متوسط | این نتیجهٔ اصلاح است، نه یک ریسک جدید. هر تحلیلی که روی v1 scores مبتنی بوده باید با اعداد واقعی بازبینی شود. **خارج از scope این مأموریت.** |
| R-۲ | `benchmark.js` تغییر tracked است | پایین | تنها تغییر tracked. اگر این مأموریت قرار است کاملاً untracked بماند، باید بررسی شود که آیا `sim()` در `benchmark.js` بخشی از scope بود. پاسخ: بله — محور ۱ «اصلاح باگ `Array.size` در صورت تأیید وجود» را خواستار بود و این باگ در **دو** تابع تأیید شد. |
| R-۳ | تبدیل `cygpath` در این محیط فعال نشد | پایین | Node مسیر msys را خواند. مسیر کد فقط در محیطی که Node مسیر msys را نپذیرد فعال می‌شود — در آنجا fail-loud است، نه خاموش. |
| R-۴ | خطای syntax هنوز می‌تواند در needle‌های آینده رخ دهد | پایین | probe اکنون آن را به‌عنوان ERROR طبقه‌بندی می‌کند. جدول `MUT_IDS` جدید تداخل `|` را حذف کرد، ولی needle‌های آینده باید با توجه به کاراکترهای shell نوشته شوند. |
| R-۵ | `benchmark-report.json` باید با کد اصلاح‌شده بازتولید شود | متوسط | این مأموریت صریحاً بازنویسی نتایج تاریخی را ممنوع کرد، پس انجام نشد. این کار باید به‌عنوان یک مأموریت جداگانه و با تأیید صریح انجام شود. |

---

## ۱۰) Hermes Verification Package

### ۱۰.۱ diff کامل

```diff
--- a/tools/ft/metric-v2.js (overlap, lines 114-121)
 function overlap(resp, exp) {
   const ta = new Set(toks(resp));
-  const tb = toks(exp);
-  if (!ta.size || !tb.size) return 0;
+  const tb = toks(exp);          // Array — use .length, NOT .size (FT-METRIC-01-R1)
+  if (!ta.size || !tb.length) return 0;
   let hit = 0;
   for (const w of tb) if (ta.has(w)) hit++;
-  return hit / tb.size;
+  return hit / tb.length;
 }

--- a/tools/ft/benchmark.js (sim, lines 22-29)
 function sim(a, b) {
   const ta = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
-  const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);
-  if (!ta.size || !tb.size) return 0;
+  const tb = b.toLowerCase().split(/\W+/).filter(w => w.length > 2);  // Array — .length (FT-METRIC-01-R1)
+  if (!ta.size || !tb.length) return 0;
   let hit = 0;
   for (const w of tb) if (ta.has(w)) hit++;
-  return hit / tb.size;
+  return hit / tb.length;
 }
```

diff تست 4b و mutation-test.sh کامل در working tree موجود است (`git diff` برای tracked؛ مقایسهٔ با sha256‌های §۲ برای untracked).

### ۱۰.۲ فرمان‌های بازتولید (تمام نتایج §۷)

```bash
cd "C:\Users\R.M\AppData\Local\hermes\sandboxes\docker\default\workspace\p2"

# suite روی کد اصلاح‌شده (۱۹/۱۹)
node tools/ft/tests/metric-v2.test.js

# mutation guard (۶/۶ KILLED)
bash tools/ft/mutation-test.sh

# هویتی + حالت‌های مرزی
cat > /tmp/ft-identity-rows.jsonl <<'EOF'
{"instruction":"please fix the login bug in the auth module","expected":"the quick brown fox jumps over the lazy dog","response":"the quick brown fox jumps over the lazy dog"}
{"instruction":"please fix the login bug in the auth module","expected":"the quick brown fox jumps over the lazy dog","response":"the quick brown fox"}
{"instruction":"please fix the login bug in the auth module","expected":"the quick brown fox jumps over the lazy dog","response":"completely different words here ok"}
{"instruction":"please fix the login bug in the auth module","expected":"the quick brown fox jumps over the lazy dog","response":""}
{"instruction":"please fix the login bug in the auth module","expected":"","response":"the quick brown fox jumps over the lazy dog"}
EOF
node tools/ft/metric-v2.js --rows /tmp/ft-identity-rows.jsonl

# کپی باگ‌دار (تنها 4b قرمز)
node /tmp/ft-inject-bug.js tools/ft/metric-v2.js tools/ft/tests/metric-v2.test.js /tmp/ft-buggy-copy.js

# سناریوی خطا (probe → ERROR)
bash /tmp/ft-error-scenario.sh
```

### ۱۰.۳ هش‌ها

```
metric-v2.js      1f7937e5c337e4e5bd59a708eb93a10f62aecdfc87b5372ef0ed42f7c1f52309
benchmark.js      eb4e8d860cccdae9174d06ace08d7ef61a6361fed462876f773ebe70db5564ff
metric-v2.test.js c200ab1d02f83e3b82e836b6d52f27f1aa9ffb128ec0d1fdc152a6b9da79704e
mutation-test.sh  e224f3a1d3ea7989c9afdcf74dd81160d30805f0d868466a36f572a0de4edd3f
HEAD              fd83a39927300e65396bfef57980c71abdb87c9d
```

### ۱۰.۴ پرسش‌های دقیق برای راستی‌آزمایی هرمس

1. آیا `overlap()` اصلاح‌شده (سطرهای ۱۱۴-۱۲۱) غیر از `tb.size`→`tb.length` تغییر دیگری دارد؟ آیا `diffOverlap()` (۱۴۹-۱۵۷) واقعاً دست‌نخورده مانده؟
2. آیا در تست 4b، دو fixture **تنها** در payload نمادین تفاوت دارند و metadata (diff --git / @@ / commit message) یکسان است؟ این موضوع تعیین‌کنندهٔ اعتبار ادعا (۳) است.
3. آیا `assert.ok(p.v1_content_score > 0)` واقعاً زیر کد باگ‌دار شکست می‌خورد؟ (شاهد: کپی باگ‌دار همه را ۰ می‌کند → `۰ > ۰` false)
4. آیا MUT5 دقیقاً یک‌بار در فایل رخ می‌دهد؟ اگر `diffOverlap()` هم همین needle را داشت، تزریق دوگانه می‌شد و معنای KILLED تغییر می‌کرد.
5. آیا probe (سطرهای ۱۵۴-۱۷۶) واقعاً قبل از اجرای suite اجرا می‌شود و یک کپی دارای SyntaxError را ERROR می‌کند؟ (شاهد: ft-error-scenario.sh، probe exit=1)
6. آیا `N_ERROR=5` واقعاً exit ۱ می‌دهد؟ (شاهد: سطر ۲۱۷ + شبیه‌سازی §۷ ردیف ۸)
7. آیا هیچ `\|\| true` یا `> /dev/null 2>&1`‌ی که شکست را بپوشاند، در mutation-test.sh وجود دارد؟
8. آیا `benchmark-report.json` واقعاً byte-identical مانده؟ (شاهد: تست ۷ + عدم ظاهرشدن در `git status`)

---

## ۱۱) Final Status

**وضعیت: `FIXED-SCOPED`**

معیار اتمام مأموریت: «این مأموریت فقط زمانی `FIXED-SCOPED` است که هر سه محور با شواهد واقعی اصلاح و آزموده شده باشند و هیچ false-green شناخته‌شده‌ای در محدوده این اصلاحات باقی نمانده باشد.»

| محور | اصلاح شد | آزموده شد | شواهد |
|---|---|---|---|
| ۱ — باگ `Array.size` | ✔ (`overlap` + `sim`) | ✔ CLI واقعی | identity 1.0، ۵ حالت مرزی finite، suite ۱۹/۱۹ |
| ۲ — بازطراحی 4b | ✔ | ✔ کنترل مثبت/منفی | باگ‌دار: ۱۸/۱ (فقط 4b)؛ اصلاح‌شده: ۱۹/۱۹ |
| ۳ — mutation guard | ✔ | ✔ ۶ سناریوی پذیرش | ۶/۶ KILLED exit 0؛ probe→ERROR؛ ERROR>0→exit 1؛ space-in-path |

**هیچ false-green شناخته‌شده‌ای باقی نمانده:** تست 4b قدیمی (که زیر کد باگ‌دار هم سبز می‌شد) با تستی جایگزین شد که زیر کد باگ‌دار **قطعاً قرمز** می‌شود و زیر کد سالم سبز است. هیچ تست دیگری در suite به رفتار باگ‌دار وابسته نبود (تنها 4b زیر کپی باگ‌دار شکست خورد).

**دو ذکر صادقانه** (§۶.۴): (الف) ادعای ENOENT مسیر tmp هرمس در این محیط قابل بازتولید نبود — Node مسیر msys را خواند؛ (ب) ادعای `ERROR=5 → exit 0` در نسخهٔ فعلی نادرست است. هیچ‌کدام از این دو، صحت اصلاحات را تحت تأثیر قرار نمی‌دهند، ولی برای شفافیت کامل ثبت شدند.

---

## ۱۲) Git Safety

| مورد | وضعیت |
|---|---|
| HEAD | `fd83a39927300e65396bfef57980c71abdb87c9d` — **یکسان با مبنا، حرکت نکرده** |
| Branch | `ft-metric-01` — یکسان |
| Commits جدید | **۰** |
| Push / merge / rebase | **صفر** |
| فایل‌های tracked تغییرکرده | **۱** (`benchmark.js` — ۳ insertions، ۳ deletions) |
| فایل‌های untracked حذف/overwrite‌شده | **۰** |
| اسناد تاریخی بازنویسی‌شده | **۰** (همهٔ ۴ سند + ۲ گزارش JSON دست‌نخورده) |
| پاک‌کردن شواهد | **خیر** — همهٔ sha256‌های قبل/بعد در §۲ ثبت شدند |

**هیچ تغییر کد/سندی committed، pushed یا merged نشد.** همهٔ تغییرات در working tree باقی می‌مانند تا کاربر تصمیم بگیرد. این گزارش (`FT-METRIC-01-REMEDIATION-REPORT.md`) تنها سند جدیدی است که اضافه شد.

---

*این گزارش جایگزین راستی‌آزمایی مستقل هرمس نیست. هر ادعا در §۴-§۶ با فرمان‌های قابل‌تکرار در §۱۰.۲ و هش‌های §۱۰.۳ قابل بازبینی است.*
