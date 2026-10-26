# TEST / CI PARITY CONTRACT — قرارداد هم‌ترازی تست و CI

**Finding:** F-QA-05
**وضعیت:** قرارداد صریح و ماشین‌خوان — اجراشده توسط `tests/ci-test-parity-contract.js`
**بازاندازه‌گیری‌شده روی:** `6612f58133451c97605b115faf97878266863d28` (`origin/main`، 2026-10-26)
**اندازه‌گیری اولیه روی:** `6b627a8f56f958de81579a336341689db9d7a551` (2026-09-21)
**آخرین بازنگری:** 2026-10-26 — M15-01 / Chat 2 (پوشش تست و حذف سبزِ کاذب)

---

## ۱. مسئله به زبان ساده

`npm test` سبز می‌شود. این **به‌معنای سبزبودن کل مخزن نیست** و هرگز نبوده.

تا پیش از این قرارداد، هیچ‌جا نوشته نشده بود که `npm test` دقیقاً چه چیزی را اجرا
می‌کند. نتیجه‌اش این بود که یک اجرای سبزِ محلی به‌سادگی به‌عنوان «همهٔ تست‌ها سبزند»
گزارش می‌شد. این fake-green نیست — هیچ تستی حذف یا skip نشده — ولی یک **شکاف
اندازه‌گیری‌نشده** است که به‌راحتی به ادعای اشتباه تبدیل می‌شود.

## ۲. اعداد واقعی (اندازه‌گیری‌شده، نه تخمینی)

اندازه‌گیری ۲۰۲۶-۱۰-۲۶ روی `6612f58`:

| سنجه | مقدار | روش |
|---|---|---|
| فایل تست سطح‌اول `tests/*.js` | **۶۲۵** | `ls tests/*.js` |
| سوئیت API (`tests/api/**/*.test.js`) | **۳۲** | ۳۱ فایل flat + ۱ aggregator تودرتو |
| زیردرخت‌های `tests/<sub>/` | **۹** | ۶ تستی/۳ پشتیبان |
| سرویس‌های declarative-unwired (aggregator) | **۱۹** | فهرست `DECLARED_UNWIRED_NESTED_AGGREGATORS` |
| ورودی‌های `npm test` | **۳** | `tests/run.js` + `tests/api/runner.js` + `tests/smoke.js` |
| **سطح‌بالا و اجرانشده توسط هیچ اتوماسیونی** | **۰** | `ORPHAN_BUDGET = 0` |

> ⚠️ عدد تاریخی «۵۲۰ تست» در گزارش‌های قبلی، **شمارش فایل** بود نه شمارش سوئیت،
> و زیرپوشه‌ها را هم نمی‌دید. اعداد قدیمیِ این سند (۹۳۱ فایل بازگشتی، ۴۸۵ فایل
> اجرانشده، ۲ ورودی `npm test`) **تاریخی‌اند و دیگر معتبر نیستند**؛ اعداد معتبر در
> جدول بالا و در خروجی `node tests/ci-test-parity-contract.js` آمده است.
>
> بازهٔ ۲۰۲۶-۱۰-۲۶: ۶۲۵ فایل سطح‌اول همه از طریق `npm run test:all`
> (`scripts/run-all-tests.sh`) یا ارجاع مستقیم workflow اجرا می‌شوند. تنها دو فایلی
> که عمداً به‌عنوان suite اجرا نمی‌شوند، worker child هستند:
> `tests/server11-child.js` و `tests/wave15-child.js` (والدشان آن‌ها را با
> `<root> <mode>` spawn می‌کند). این دو در `DESIGN_EXCLUDED_ORPHANS` صریحاً نام‌برده
> شده‌اند و وجودشان هم بررسی می‌شود.

## ۳. قرارداد

### ۳.۱ آنچه `npm test` تضمین می‌کند

```
npm test
  ⇒ node tests/run.js                    (ساختار/build/آفلاین — ۳۹ بررسی)
  && node tests/api/runner.js            (۳۲ سوئیت REST API + قرارداد شاهدِ اجرا)
  && node --expose-gc --max-old-space-size=2048 tests/smoke.js   (۵۴۷ بررسی دودی)
```

- `tests/run.js` یک سوئیت **ساختاری/یکپارچگی build** است، نه orchestrator.
- `tests/api/runner.js` رجیستری صریح `API_TESTS` را اجرا می‌کند (نه glob).
- `tests/smoke.js` سوئیت دودِ زمان‌اجراست.
- `npm test` **Node ≥ ۲۲ را اجباری می‌کند** و روی نسخهٔ قدیمی‌تر عمداً قرمز می‌شود
  (`tests/run.js` خطوط ۱۴–۲۲) تا skipِ پنهان رخ ندهد.

**بنابراین: `npm test` سبز = این سه سوئیت سبزند. نه بیشتر.**

### ۳.۲ آنچه CI تضمین می‌کند

CI مرجعِ واقعیِ پوشش است، نه `npm test`:

- `node.js.yml` — `npm run test:all` (canonical runner) + ۶۰+ گیتِ صریح، با سرویس‌های
  واقعی `postgres:17` و `redis:8`.
- `security.yml`، `strict-verification.yml`، `runtime-reliability.yml`،
  `observability-regression.yml` و `.circleci/config.yml` — گیت‌های تکمیلی.

### ۳.۳ قواعد الزام‌آور

1. **هیچ تستی برای سبزشدن حذف یا skip نمی‌شود.** اگر تستی قرمز است، یا رفع می‌شود یا
   به‌عنوان یافتهٔ باز ثبت می‌شود.
2. **هر ارجاع تستی در workflowها باید روی دیسک وجود داشته باشد.** ارجاع مرده =
   گیتِ خاموش (P4).
3. **سقف تست‌های اجرانشده = `ORPHAN_BUDGET = 0`.** پیش‌تر این عدد ۴۸۵ بود در حالی
   که اندازه‌گیری واقعی ۲ بود — یعنی ۴۸۳ فایل حاشیه و عملاً هیچ گیتی. اکنون هر فایل
   سطح‌اولی که به گیت وصل نباشد CI را قرمز می‌کند، مگر در
   `DESIGN_EXCLUDED_ORPHANS` (فقط worker childها) صریحاً نام‌برده شود.
4. **هیچ گزارشی حق ندارد بنویسد «همهٔ تست‌ها سبزند»** مگر با استناد به run id مشخص و
   شمارش واقعی.
5. **سبزیِ لایهٔ API فقط با شاهدِ اجرا پذیرفته می‌شود** (بخش ۵).

## ۴. اجرای قرارداد و بررسی‌ها

```bash
node tests/ci-test-parity-contract.js
```

در CI به‌عنوان مرحلهٔ «TEST/CI parity contract» و پیش از `npm test` اجرا می‌شود.

| بررسی | موضوع |
|---|---|
| P1–P3 | ورودی‌های `npm test` (دقیقاً ۳ ورودی، بدون ورودی اعلام‌نشده) |
| P4–P5 | سلامت ارجاع‌های workflow |
| P6 / P6a–P6e | سقف `ORPHAN_BUDGET = 0`؛ موجودی بازگشتی `tests/api/**` در برابر رجیستری runner |
| P7–P10 | critical orphanها و گیت‌های false-green |
| P11–P13 | وجود و صحت همین سند (شامل بودجه) |
| P14–P18 | رجیستری aggregatorهای تودرتو: کشف بازگشتی، wired/unwired، reachability از runnerهای wired، وجود سوئیت‌های رجیستری‌شده |
| P19a–P19d | رجیستری درخت‌های تودرتو: هر زیرپوشهٔ `tests/` با وضعیت و شمار فایل اعلام‌شده؛ drift شمارش = قرمز |

## ۵. قرارداد شاهدِ اجرا برای لایهٔ API (M15-01 / Chat 2)

پیش از این قرارداد، `tests/api/runner.js` فقط **exit code** را معیار می‌گرفت. exit code
به‌تنهایی نمی‌تواند این حالت‌ها را از هم جدا کند:

- سوئیتی که ۷ assertion واقعی اجرا کرده (سبز واقعی)؛
- سوئیتی که همهٔ تست‌هایش skip شده و exit 0 داده (سبز کاذب)؛
- سوئیتی که branch تستش هرگز وارد نشده (سبز کاذب)؛
- سوئیتی که `fail` را شمرده ولی `process.exit(1)` را جا انداخته (سبز کاذب)؛
- سوئیتی که بنر «✅ همه سالم» چاپ می‌کند بدون assertion (سبز کاذب).

اکنون هر سوئیت باید از طریق `tests/api/suite-contract.js` شمارش خود را اعلام کند و
runner تنها وقتی سبز می‌دهد که **همهٔ** شرایط زیر برقرار باشد (`evaluateSuiteResult`):

| قاعده | شرط سبز |
|---|---|
| E1 | exit code صفر و بدون signal/timeout |
| E2 | دقیقاً یک خط `PAYESH_SUITE_RESULT {…}` معتبر |
| E3 | `file` در شاهد با فایل اجراشده یکی باشد (شاهد کپی‌نشده) |
| E4 | `fail === 0` — شکستِ شمرده‌شده هرگز سبز نیست |
| E5 | `skip === 0` — assertionِ skip‌شده هرگز سبز نیست |
| E6 | `pass > 0` — صفر assertion اجراشده سبز نیست |
| E7 | `pass ===` تعداد خطوط نتیجهٔ `✅` چاپ‌شده |

هر تخطی، RED صریح با کد دلیل است (`NO_EVIDENCE`، `SKIP_REPORTED`، `FAIL_REPORTED`،
`ZERO_PASS`، `EVIDENCE_MISMATCH`، `TIMEOUT`، …). timeout هر سوئیت به‌صورت پیش‌فرض
۳۰۰ ثانیه است (`PAYESH_API_SUITE_TIMEOUT_MS`) تا سوئیت معلق، RED کران‌دار شود نه اینکه
کل job را ۱۸۰ دقیقه بلوکه کند. stderr نیز در گزارش شکست چاپ می‌شود (پیش‌تر حذف
می‌شد و علت RED در لاگ CI پیدا نبود).

مدرک منفی: `tests/false-green-defense.test.js` موارد C10–C16 را اجرا می‌کند و هر
کلاس بالا را با fixture واقعی به runner می‌دهد؛ همه باید RED شوند و فقط fixture صادق
(C16) سبز شود. اگر کسی قرارداد را ضعیف کند، همان موارد قرمز می‌شوند.

## ۶. موجودی API — بازنگری ۲۰۲۶-۱۰-۲۶ (جانشین بخش ۶ قبلی)

- **آرایهٔ رجیستری `API_TESTS`: ۳۲ ورودی** (۳۱ فایل flat + `phase5-pilot/index.test.js`).
- **موجودی دیسک: ۳۲ فایل** با پیمایش بازگشتی `tests/api/**/*.test.js`.
- عدد تاریخی «۳۰» و سپس «۳۱» هر دو کهنه بودند: `30` یک عدد hard-coded بود و `31`
  فایل تودرتو را نمی‌دید. اکنون هیچ عددی pin نمی‌شود؛ دیسک و رجیستری با هم مقایسه
  می‌شوند (P6a/P6c) و پیمایش **بازگشتی** است.
- `tests/api/phase5-pilot/index.test.js` پیش از این نه در `scripts/run-all-tests.sh`
  (که فقط `tests/*.js` را می‌بیند) و نه در رجیستری runner بود — یعنی **هیچ‌جا اجرا
  نمی‌شد**. اکنون در رجیستری است و شاهدِ اجرای فرزندش را منتقل می‌کند.
- رفتار محیطی این لایه صریح مستند است: این ۳۲ سوئیت **JSON-store** هستند
  (`PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1`، بدون `DATABASE_URL`/`REDIS_URL`). اجرای
  تک‌به‌تک آن‌ها بیرون از runner با `503 SERVICE/AUTHORITY UNAVAILABLE` شکست می‌خورد؛
  مسیر مجاز اجرا، runner است (که همین env را تنظیم می‌کند). پوشش مسیر PostgreSQL
  دغدغهٔ سوئیت‌های live-PG است، نه این لایه.

## ۷. رجیستری درخت‌های تودرتو — `NESTED_TREE_REGISTER` (۹ درخت)

| درخت | وضعیت | شمار فایل `.js` | اجرا توسط |
|---|---|---|---|
| `tests/api` | wired | ۳۴ | `tests/api/runner.js` |
| `tests/semantic-layer` | wired | ۲۱۵ | `tests/semantic-layer/runner.js` (node.js.yml + CircleCI) |
| `tests/infrastructure` | **unwired** | ۱۱۳ | هیچ گیتی ارجاع نمی‌دهد |
| `tests/deployment` | **unwired** | ۹ | هیچ گیتی ارجاع نمی‌دهد |
| `tests/monitoring` | **unwired** | ۱۰ | هیچ گیتی ارجاع نمی‌دهد |
| `tests/security` | **unwired** | ۱۱ | هیچ گیتی ارجاع نمی‌دهد |
| `tests/fixtures` | support | ۰ | دادهٔ fixture |
| `tests/helpers` | support | ۶ | helper مشترک |
| `tests/performance` | support | ۱۹ | harness بار k6 (دستی، طبق طراحی) |

**۱۹ aggregator تودرتو** در `DECLARED_UNWIRED_NESTED_AGGREGATORS` نام‌برده شده‌اند:
۱۰ مورد در اجرای دستی ۲۰۲۶-۱۰-۲۶ سبز بودند، ۹ مورد قرمز. این اعلان یعنی «شناخته‌شده و
اجرانشده»، نه «سبز». هر aggregator تازه‌ای که بدون اعلان اضافه شود، CI را قرمز می‌کند
(P14)، و شمارش فایل‌های هر درخت هم ثابت نگه داشته می‌شود (P19b).

**BLOCKED — OWNER DECISION REQUIRED:** اتصال درخت‌های **unwired** به گیت نیازمند تصمیم
مالک است، چون ۹ aggregator از ۱۹ مورد در همین مخزن قرمزند (بیشترشان `AUTHORITY_UNAVAILABLE`
/ نیازمند PostgreSQL واقعی، دو مورد assertion واقعی) و اتصال بی‌قید آن‌ها CI را قرمز
می‌کند. گزارش کامل با فرمان‌ها در `docs/TEST_COVERAGE_M15_01_CHAT2_REPORT.md`.

## ۸. رجیستری سوئیت‌های «skip-محور» — `DECLARED_SKIP_TOLERANT_SUITES` (۱۱ مورد)

سوئیتی که شمارندهٔ `skip`/`NOT-RUN` را بالا می‌برد و **باز هم exit 0** می‌دهد، در
حالی «سبز» گزارش می‌شود که بخشی از آن اجرا نشده است — همان کلاسی که لایهٔ API با
قاعدهٔ E5 رد می‌کند. این ۱۱ سوئیت سطح‌اول پیش از قرارداد نوشته شده‌اند و به
زیرساختی وابسته‌اند که این مخزن نمی‌تواند همه‌جا الزام کند (باینری‌های Redis Sentinel،
PostgreSQL زنده، store دانه‌شده).

| سوئیت | شرطِ skip |
|---|---|
| `tests/chat9-behavior-regression.js` | نبود/خرابی `server/data/payesh.json` یا خوانده‌نشدن `tests/donations2.js` |
| `tests/redis-sentinel-failover.js` | نبود `ioredis` یا باینری‌های Redis |
| `tests/m15-03-aggregate-pg.js` | نبود PostgreSQL (exit 0 مگر `M1503_REQUIRE_PG=1`) |
| `tests/bell2.js`، `reports-export.js`، `reports-pdf-e2e.js`، `seed-completeness.js`، `server16.js`، `tracing-integration.js`، `wave1-reads.js`، `wave3-query2.js` | مسیرهای skip داخلی سوئیت |

`P20` تضمین می‌کند سوئیت تازه‌ای با الگوی «شمارندهٔ skip + exit 0» بدون اعلانِ صریح
اضافه نشود. مدرک زمان‌اجرا و پیشنهاد رفع در
`docs/TEST_COVERAGE_M15_01_CHAT2_REPORT.md` §۵.۲ آمده است.
