# F-QA-04 — SCANNER GOVERNANCE DOSSIER — Codacy & Fortify

**Priority:** P2 (governance/configuration — **not** a vulnerability)
**Measured at:** `755715bda367ceb32341c5cea231decdd9ccc32d`
**Date:** 2026-09-21
**Evidence level:** **E3** (root cause reproduced locally with the identical exception)

---

## ۰. خلاصهٔ اجرایی

| پرسش مأموریت | پاسخ کوتاه | سطح شاهد |
|---|---|---|
| علت دقیق شکست Codacy چیست؟ | **نقص ابزار** — `MalformedInputException` در فرمت‌کنندهٔ SARIF هنگام خواندنِ دوبارهٔ فایل‌های سورس | **E3 — بازتولید محلی** |
| آیا `CODACY_PROJECT_TOKEN` لازم است؟ | **خیر** برای سناریوی فعلی (code-scanning). token فقط برای سناریوی upload لازم است | E1 — مستندات رسمی action |
| آیا خودِ workflow مشکل دارد؟ | **بله، دو مورد** (پایین) — ولی هیچ‌کدام علتِ شکست جاری نیست | E1/E2 |
| یا باید policy رسمی عوض شود؟ | **بله — این تصمیم اصلی است** | — |
| آیا سیگنال امنیتی تولید می‌شود؟ | **خیر. صفر یافته، SARIF هرگز آپلود نشده** | E2 |

> **هیچ `continue-on-error`، `|| true` یا skip برای سبزکردن مصنوعی اضافه نشد.**
> Codacy عمداً **قرمز و صادق** باقی می‌ماند.

---

## ۱. Codacy — علت دقیق شکست

### ۱.۱ وضعیت قابل مشاهده

```
workflow : Codacy Security Scan  (.github/workflows/codacy.yml)
تاریخچه  : ۳۱ اجرای اخیر = ۳۱ شکست، صفر موفقیت
step 3   : Run Codacy Analysis CLI  = failure   (~۲۵۶ ثانیه)
step 4   : Upload SARIF results file = skipped  ← همیشه
یافتهٔ امنیتی در لاگ‌ها : صفر (grep برای CWE/vulnerability = ۰)
```

### ۱.۲ خطای کُشنده

```
Exception in thread "main" java.nio.charset.MalformedInputException: Input length = 1
  at sun.nio.cs.StreamDecoder.implRead(StreamDecoder.java:339)
  at java.nio.file.Files.readAllLines(Files.java:3205)
  at better.files.File.lines(File.scala:282)
  at com.codacy.analysis.cli.formatter.Sarif.$anonfun$createResults$3(Sarif.scala:146)
  at com.codacy.analysis.cli.formatter.Sarif.createResults(Sarif.scala:145)
##[error]Process completed with exit code 1.
```

خطا **در مرحلهٔ تحلیل نیست** — در مرحلهٔ **تولید SARIF** است. یعنی ابزار تحلیل را تمام
می‌کند و بعد هنگام ساختن خروجی می‌میرد. به همین دلیل مرحلهٔ Upload همیشه skipped است.

### ۱.۳ بازتولید محلی — E3 (نه حدس)

`Sarif.createResults` فایل‌هایی را که نتیجه تولید کرده‌اند **دوباره از روی دیسک
می‌خواند** (`1189` نتیجهٔ metrics + `528` نتیجهٔ duplication). `Files.readAllLines`
جاوا از یک `CharsetDecoder` **سخت‌گیر** استفاده می‌کند که به‌جای جایگزینی بایت خراب،
استثنا پرتاب می‌کند.

با همان مخزن و همان الگوی کد، محلی بازتولید شد:

| ورودی | decoder | نتیجه |
|---|---|---|
| `tools/redis-backup.sh` | UTF-8 سخت‌گیر | `OK lines=128` |
| `tools/redis-backup.sh` | US-ASCII سخت‌گیر | **`MalformedInputException: Input length = 1`** |
| `store/icon-512.png` | UTF-8 سخت‌گیر | **`MalformedInputException: Input length = 1`** |

**پیام استثنا بایت‌به‌بایت با CI یکسان است.**

هر دو ماشهٔ ممکن در این مخزن حاضرند:

- **۲۱۳۶ از ۲۲۳۰** فایل ردیابی‌شده (**۹۵٪**) غیر‌ASCII‌اند (متن فارسی) ⇒ اگر JVM داخل
  کانتینر با locale غیر‌UTF-8 بالا بیاید، همان استثنا رخ می‌دهد.
- **۲ فایل واقعاً غیر‌UTF-8**: `store/feature-1024x500.png` و `store/icon-512.png`
  (باینری). قاعدهٔ `**/*.png` در `.codacy.yml` نجات‌دهنده نیست، چون exclusion به فاز
  metrics/duplication — که SARIF بعداً روی نتایجش راه می‌رود — اعمال نمی‌شود.

**حکم:** این یک **نقص ابزار در `codacy-analysis-cli 4.0.0`** است، نه نقص کد این مخزن و
نه آسیب‌پذیری.

### ۱.۴ تصحیح یک ادعای نادرست از نشست قبل

در کامیت `755715bd` نوشته بودم «این فایل اصلاً توسط action خوانده نمی‌شود». **این غلط
بود و اینجا رسماً پس گرفته می‌شود.** لاگ هر دو اجرا خلافش را نشان می‌دهد:

```
AnalyseExecutor:195 - Found local extra configuration for pmd          ×3
AnalyseExecutor:195 - Found local extra configuration for pmd-legacy   ×3
```

حقیقتِ دقیق‌تر و محدودتر این است: فایل **خوانده می‌شود**، ولی `engines.<tool>.enabled`
اثری ندارد — طبق مستندات خود Codacy، فعال/غیرفعال‌کردن ابزار **فقط** از صفحهٔ
Code patterns در UI ممکن است. به همین دلیل pmd و pmd-legacy با وجود `enabled: false`
همچنان اجرا می‌شوند.

### ۱.۵ سه پرسش مأموریت — پاسخ مستند

**الف) آیا `CODACY_PROJECT_TOKEN` لازم است؟ — خیر، برای سناریوی فعلی.**

طبق README رسمی action، سه سناریو وجود دارد. سناریوی فعلی این مخزن
«Integration with GitHub code scanning» است که نمونهٔ رسمی‌اش **هیچ token ندارد**.
token فقط در سناریوی سوم («upload به Codacy») لازم است، که `upload: true` می‌خواهد و
اینجا تنظیم نشده.

شاهد سمت مخزن (REST API):

```
GET /repos/rezaa2544/p2/actions/secrets    -> total_count: 0
GET /repos/rezaa2544/p2/actions/variables  -> total_count: 0
```

**هیچ secret و هیچ variableای در کل مخزن تعریف نشده** — نه `CODACY_PROJECT_TOKEN`، نه
`FOD_*`، نه `SSC_*`. پس `project-token: ${{ secrets.CODACY_PROJECT_TOKEN }}` در
`codacy.yml:47` همیشه به رشتهٔ خالی resolve می‌شود.
**اما این علتِ شکست نیست** — بدون token هم سناریوی code-scanning باید کار کند.

**ب) آیا workflow مشکل دارد؟ — بله، دو ضعف واقعی، ولی هیچ‌کدام علت شکست جاری نیست:**

| # | مشکل | محل | اثر |
|---|---|---|---|
| ۱ | `max-allowed-issues: 2147483647` | `codacy.yml:55` | گیت شمارش را عملاً بی‌اثر می‌کند. **اگر** ابزار روزی موفق شود، هیچ تعداد issue باعث قرمزی نمی‌شود |
| ۲ | `project-token` به secretای اشاره می‌کند که وجود ندارد | `codacy.yml:47` | بی‌اثر/گمراه‌کننده؛ القا می‌کند یکپارچگی Codacy Cloud برقرار است |

نکتهٔ مهم دربارهٔ #۱: عدد `2147483647` **به‌تنهایی اثبات always-green نیست** — و در عمل
اینجا اصلاً به آن نمی‌رسیم، چون CLI پیش از ارزیابی آن crash می‌کند. پس طبق قاعدهٔ
مأموریت به‌عنوان **ضعف پیکربندی/حاکمیتی** ثبت می‌شود، نه آسیب‌پذیری.

**ج) یا باید policy رسمی تغییر کند؟ — بله. این تصمیم اصلی است.**

وضعیت امروز بدترین حالت ممکن است: یک گیت امنیتی که **همیشه قرمز** است، هیچ‌کس را
مطلع نمی‌کند و هیچ سیگنالی — نه مثبت نه منفی — تولید نمی‌کند. چنین گیتی از نبودش هم
بدتر است، چون نویز تولید می‌کند و حساسیت تیم را می‌کُشد.

### ۱.۶ چرا اینجا «رفع» نشد

گزینه‌های فنیِ در دسترس همگی یا fake-green‌اند یا تصمیم مالک:

| کار ممکن | چرا انجام **نشد** |
|---|---|
| `continue-all-error: true` یا `\|\| true` | ❌ **سبزکردن مصنوعی** — صریحاً ممنوع شده |
| حذف مرحله/workflow | ❌ تصمیم مالک؛ حذف یک گیت امنیتی کار ممیز نیست |
| `tool: eslint` برای محدودکردن دامنه | ❌ نیازمند ESLint config که در مخزن **وجود ندارد** |
| ارتقای نسخهٔ action | ⚠️ محتمل‌ترین راه‌حل واقعی، ولی تغییر supply-chain است و باید مالک تأیید کند |
| افزودن `.eslintrc` | ❌ خارج از دامنهٔ این ممیزی (تصمیم سبک کدنویسی) |

---

## ۲. Fortify — وضعیت فعلی و شفافیت

### ۲.۱ قبل / بعد

| | قبل (تا `6b627a8f`) | بعد (از `8e4d2c8b`) |
|---|---|---|
| اعتبار فایل | **INVALID** — `secrets` در `if:` سطح step | **VALID** — actionlint تمیز |
| اجرا | هر بار **failure با صفر job** | **success** با jobهای واقعی |
| شاخهٔ skip | **هرگز اجرا نمی‌شد** | اجرا می‌شود و پیام می‌دهد |
| تاریخچه | ۳۰/۳۰ شکست | **#351 = success** |

شاهد گام‌به‌گام اجرای #351 (`id=35584035425`):

```
1. Set up job                                            = success
2. Check Out Source Code                                 = success
3. Skip Fortify Scan without credentials or on forked PRs= success
4. Run Fortify Scan                                      = skipped   ← اسکن واقعی انجام نشد
```

و در لاگ:

```
Skipping Fortify scan because required credentials are not available or the PR comes
from a fork. Configure repository secrets for Fortify and rerun the workflow.
```

### ۲.۲ ریسک باقی‌مانده که در این بسته بسته شد

اجرای #351 **سبز** است در حالی که **هیچ اسکنی انجام نشده**. یک تیکِ سبز کنار نام
«Fortify AST Scan» به‌سادگی به «Fortify اسکن کرد و چیزی پیدا نکرد» تعبیر می‌شود.
این دقیقاً همان الگوی misleading-success است که در F-QA-08 رفع شد.

**اصلاح اعمال‌شده (بدون تغییر رفتار امنیتی):** هر دو مسیر اکنون نتیجه را با واژگان
صریح در `$GITHUB_STEP_SUMMARY` می‌نویسند:

- مسیر skip ⇒ `Fortify AST Scan — NOT EXECUTED` · `**Scan status:** NOT SCANNED` ·
  «A green check mark here means the workflow completed, **not** that the code was analysed.»
- مسیر اجرا ⇒ `Fortify AST Scan — EXECUTED` · `**Scan status:** SCANNED`.

**هیچ چیزی سرکوب نشد:** نه `continue-on-error`، نه `|| true`. اگر اسکن واقعی روزی
اجرا شود و شکست بخورد، job همچنان قرمز می‌شود. تأیید ماشینی:

```
job-level continue-on-error : ABSENT
step 'Check Out Source Code'                 -> ABSENT
step 'Skip Fortify Scan ...'                 -> ABSENT
step 'Record that a real Fortify scan ...'   -> ABSENT
step 'Run Fortify Scan'                      -> ABSENT
```

### ۲.۳ نبودِ credential = tooling state

طبق دستور مأموریت، نبودِ `FOD_*` به‌عنوان **وضعیت ابزار** ثبت می‌شود، نه نقص امنیتی و
نه یافتهٔ باز. مخزن **صفر secret** دارد؛ تا وقتی مالک credential تنظیم نکند، Fortify
به‌درستی و با اعلام صریح skip می‌شود.

> ⚠️ **هشدار حاکمیتی صریح:** تا زمانی که Fortify اسکن نمی‌کند و Codacy هیچ SARIFی
> آپلود نمی‌کند، **هیچ شاهد SAST معتبری برای این مخزن وجود ندارد.** رفع F-QA-04
> «امنیت را تأیید نمی‌کند» — فقط ابزار را صادق می‌کند.

---

## ۳. تصمیم‌های موردنیاز مالک

### ۳.۱ Codacy — **BLOCKED — OWNER DECISION REQUIRED**

| گزینه | کار | ارزیابی ممیز |
|---|---|---|
| **A — ارتقای action** | نسخهٔ `codacy-analysis-cli-action` به جدیدترین نسخه و آزمودن رفع باگ charset | محتمل‌ترین رفع واقعی؛ تغییر supply-chain، نیازمند تأیید |
| **B — بازنشستگی** | حذف workflow و اتکا به «Security Program» که **success** است | صادقانه؛ یک گیتِ همیشه‌قرمزِ بی‌سیگنال حذف می‌شود |
| **C — یکپارچگی کامل Codacy Cloud** | تنظیم `CODACY_PROJECT_TOKEN` + `upload: true` + پیکربندی ابزارها در UI | بیشترین ارزش، بیشترین هزینه |
| **D — بدون تغییر** | قرمز بماند | وضعیت فعلی؛ نویز دائمی و حساسیت‌کُش |

**توصیهٔ ممیز: A، و اگر جواب نداد B.** در هر حالت `max-allowed-issues` باید به عددی
معنادار برسد، **مشروط بر اینکه** ابزار ابتدا اجرا شود.

### ۳.۲ Fortify — **BLOCKED — OWNER DECISION REQUIRED**

یا `FOD_USER`/`FOD_PAT`/`FOD_TENANT` (یا `FOD_CLIENT_ID`/`FOD_CLIENT_SECRET`) تنظیم شود
تا اسکن واقعی اجرا گردد، یا workflow رسماً بازنشسته شود. وضعیت فعلی (اجرا + skip شفاف)
یک **حالت انتظار قابل‌دفاع** است، نه راه‌حل نهایی.

نکتهٔ فنی برای زمان تنظیم: شرط `env` به `FOD_CLIENT_ID` و `FOD_USER` نگاه می‌کند، ولی
`FOD_CLIENT_ID` در خطوط ۷۷–۷۸ **کامنت شده** است. اگر مالک مسیر client-id را انتخاب کند
باید آن دو خط از کامنت خارج شوند.

---

## ۴. جمع‌بندی وضعیت گیت‌ها

```
Phase 8.2 Exit = NOT VERIFIED
Phase 8.3      = BLOCKED
Production GO  = NOT DECLARED
```

F-QA-04 **بسته نمی‌شود**؛ از «ضعف حاکمیتی نامشخص» به **«علت ریشه‌ای اثبات‌شده +
دو تصمیم مشخص مالک»** ارتقا می‌یابد. هیچ ادعای VERIFIED و هیچ ادعای امنیتی ثبت نشد.
