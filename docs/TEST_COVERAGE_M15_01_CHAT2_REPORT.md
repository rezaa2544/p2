# M15-01 — CHAT 2 · گزارش پوشش تست و حذف سبزِ کاذب

**ماموریت:** Test Coverage & False-Green Elimination
**شاخه:** `arena/0008c4f4-p2`
**SHA مبنا:** `6612f58133451c97605b115faf97878266863d28` (`origin/main`، 2026-10-26)
**تاریخ اندازه‌گیری:** 2026-10-26 · **محیط:** Node `v22.22.3` / npm `10.9.8`، بدون PostgreSQL، بدون Redis، بدون Docker، بدون Chromium

---

## ۱. وضعیت مخزن در آغاز

```
$ git status --porcelain        # خالی (working tree clean)
$ git log -1 --format='%H %s'   # 6612f58… Merge pull request #481 …
$ git ls-remote origin main     # 6612f58133451c97605b115faf97878266863d28
```

هیچ تغییرِ Chat 1 در این شاخه بازنویسی نشد؛ دامنهٔ تغییرات این گزارش فقط
`tests/api/**`، `tests/ci-test-parity-contract.js`، `tests/false-green-defense.test.js`،
`docs/TEST_CI_PARITY_CONTRACT.md`، همین سند و یک step در `.github/workflows/node.js.yml` است.

---

## ۲. آنچه اجرا شد (فرمان، exit code، نتیجه)

| فرمان | exit | نتیجه |
|---|---|---|
| `node tests/run.js` | 0 | **39/39** — شامل `build.js --check` (یکسانی بیت‌به‌بیت `index.html`) |
| `node tests/api/runner.js` (پس از اصلاح) | 0 | **32/32** سوئیت، **242** assertion، همه با شاهدِ اجرا |
| `node --expose-gc --max-old-space-size=2048 tests/smoke.js` | 0 | **547/547** |
| `npm test` (پس از اصلاح) | 0 | 39/39 + 32/32 + 547/547 |
| `node tests/ci-test-parity-contract.js` | 0 | **47/47** (پیش از اصلاح: 33/33 با بودجهٔ ۴۸۵) |
| `node tests/false-green-defense.test.js` | 0 | **39/39** (پیش از اصلاح: 29/29؛ C10–C16 تازه‌اند) |
| `node tests/zero-suite-fail-closed.test.js` | 0 | 4/4 |
| `node tests/semantic-layer/runner.js` | 0 | 33/33 |
| `bash scripts/run-all-tests.sh` | **اجرا نشد** | نیازمند PostgreSQL/Redis/Chromium و حدود ۱۵–۲۰ دقیقه؛ در این sandbox موجود نیست — بخش ۱۰ |

### ۲.۱ مورد «34/35»

مورد تاریخی «۳۴/۳۵» مربوط به شکستِ `خروجی build با index.html بیت‌به‌بیت یکسان است`
بود. روی `6612f58` این شکست **وجود ندارد** (`tests/run.js` الان ۳۹ بررسی دارد و ۳۹/۳۹
سبز است؛ `node build.js --check` → exit 0). یعنی از این بابت اصلاح لازم نبود و
«۳۴/۳۵» دیگر معیار جاری نیست. هر سندی که این عدد را به‌عنوان وضعیت جاری نقل کند،
کهنه است (اسناد `docs/audit/*` تاریخی‌اند و بازنویسی نشدند).

---

## ۳. فهرست کامل سوئیت‌های API و وضعیت هرکدام

آرایهٔ `API_TESTS` در `tests/api/runner.js`: **۳۲ ورودی**. موجودی دیسک با پیمایش
بازگشتی `tests/api/**/*.test.js`: **۳۲ فایل**. عدد تاریخی «۳۰» (hard-coded) و سپس «۳۱»
(پیمایشِ فقط-flat) هر دو کهنه بودند.

| # | سوئیت | assertion | ms |
|---|---|---|---|
| 1 | `n01-server-entry.test.js` | 5 | ~370 |
| 2 | `bootstrap.test.js` | 5 | ~470 |
| 3 | `students.test.js` | 7 | ~620 |
| 4 | `classes.test.js` | 5 | ~590 |
| 5 | `attendance.test.js` | 6 | ~620 |
| 6 | `grades.test.js` | 6 | ~590 |
| 7 | `users.test.js` | 7 | ~600 |
| 8 | `cache.test.js` | 7 | ~440 |
| 9 | `quality-governance.test.js` | 6 | ~480 |
| 10 | `longitudinal-intelligence.test.js` | 6 | ~510 |
| 11 | `recommendation-action-planning.test.js` | 6 | ~520 |
| 12 | `feedback-learning-memory.test.js` | 6 | ~540 |
| 13 | `intelligence-governance.test.js` | 6 | ~450 |
| 14 | `policy-simulation.test.js` | 6 | ~490 |
| 15 | `decision-intelligence-command.test.js` | 6 | ~480 |
| 16 | `operational-intelligence-execution.test.js` | 6 | ~510 |
| 17 | `outcome-evaluation-optimization.test.js` | 6 | ~490 |
| 18 | `intelligence-platform.test.js` | 6 | ~480 |
| 19 | `intelligence-certification.test.js` | 6 | ~470 |
| 20 | `scalability-health.test.js` | 6 | ~490 |
| 21 | `event-processing-health.test.js` | 6 | ~490 |
| 22 | `observability-health.test.js` | 6 | ~450 |
| 23 | `disaster-recovery-health.test.js` | 6 | ~500 |
| 24 | `pilot-deployment-health.test.js` | 6 | ~460 |
| 25 | `security-health.test.js` | 6 | ~510 |
| 26 | `phase4-certification.test.js` | 7 | ~480 |
| 27 | `phase5-pilot.test.js` | 13 | ~500 |
| 28 | `phase5-pilot/index.test.js` **(تازه وصل شد)** | 13 | ~570 |
| 29 | `phase5-provincial-pilot.test.js` | 15 | ~560 |
| 30 | `phase5-national-infrastructure.test.js` | 14 | ~520 |
| 31 | `phase5-production-readiness.test.js` | 18 | ~530 |
| 32 | `phase5-national-capacity.test.js` | 12 | ~500 |

جمع: **242 assertion**.

### ۳.۱ تقسیم‌بندی خواسته‌شده

| دسته | وضعیت |
|---|---|
| **در CI اجرا می‌شوند** | همهٔ ۳۲ سوئیت، از مسیر `npm test` (step «`npm test`» در `node.js.yml`) و `npm run test:all` → `scripts/run-all-tests.sh` که `tests/api/runner.js` را وارد می‌کند |
| **فقط محلی اجرا می‌شوند** | هیچ‌کدام. (پیش از اصلاح: `tests/api/phase5-pilot/index.test.js` در هیچ‌جا اجرا نمی‌شد) |
| **اصلاً فراخوانی نمی‌شوند** | در لایهٔ API: صفر. (پیش از اصلاح: ۱ فایل تودرتو) |
| **با 503 / خطای محیطی شکست می‌خورند** | هر ۳۲ سوئیت اگر **بیرون از runner** تک‌به‌تک اجرا شوند؛ ۲۸ مورد از ۳۱ موردِ قبلی قرمز می‌شد (بخش ۴) |
| **صفر/skip را موفق می‌گرفتند** | هیچ سوئیتی در حال حاضر skip نمی‌کند؛ ولی **runner** هر exit 0 را سبز می‌گرفت — این همان سوراخِ اصلی بود (بخش ۵). شکافِ حسابداریِ واقعی: `phase5-pilot.test.js` با ۱۳ تست، بنر «✅» چاپ می‌کرد که شمارشِ ساده را یکی جابه‌جا می‌کرد |

---

## ۴. علت شکست ۵۰۳ (بازتولیدشده)

```bash
$ node tests/api/students.test.js          # بیرون از runner
503 !== 200
Students API Tests: 0/7 passed             # exit 1

$ PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1 node tests/api/students.test.js
Students API Tests: 7/7 passed             # exit 0
```

**ریشه:** `server/infrastructure/authority/postgres-authority.js` تابع `isExplicitDevOptIn()`
(خط ۴۷) فقط وقتی حافظهٔ توسعه را مجاز می‌داند که `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY === '1'`
باشد، در محیط production نباشد و `DATABASE_URL` ست نشده باشد. بدون آن، `assertAuthorityAttached`
خطای `AUTHORITY_UNAVAILABLE` می‌دهد که در لایهٔ HTTP به **503** ترجمه می‌شود.

**نتیجه‌گیری صریح:** این ۳۲ سوئیت **JSON-store** هستند و مسیر مجازشان `tests/api/runner.js`
است که خودش `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1` را ست و `DATABASE_URL/PGURL/READ_DATABASE_URL/REDIS_URL`
را حذف می‌کند (`configureTestEnvironment`). اجرای مستقیمِ هر فایل، خارج از قرارداد است.
پوشش مسیر PostgreSQL کار سوئیت‌های live-PG است، نه این لایه — این محدودیت در سند parity
هم ثبت شد تا «۳۲/۳۲ API سبز» به‌اشتباه «پوشش PG» خوانده نشود.

بازتولید سنجش کلی: ۳۱ فایل flat بدون runner → ۲۸ قرمز (۲۵ با exit 1، ۳ مورد سبز:
`n01`, `observability-health`, `security-health`)، همه با پیامِ `503 !== 200` یا
`AUTHORITY_UNAVAILABLE`.

---

## ۵. سبزِ کاذب: کلاس‌های یافت‌شده و بسته‌شدنشان

| کلاس | وضعیت پیش از این کار | اصلاح |
|---|---|---|
| exit 0 = pass، بدون هیچ شاهدی از اجرای assertion | **باز** — runner فقط exit code را می‌دید | قرارداد شاهدِ اجرا (E1–E7) در `tests/api/suite-contract.js` + `tests/api/runner.js` |
| skip به‌عنوان pass | **باز** (هیچ قاعده‌ای skip را رد نمی‌کرد) | `skip > 0` ⇒ RED (`SKIP_REPORTED`) |
| `fail` شمرده‌شده ولی exit 0 (فراموشی `process.exit(1)`) | **باز** | `fail > 0` ⇒ RED (`FAIL_REPORTED`) |
| suite با صفر assertion | **باز** | `pass === 0` ⇒ RED (`ZERO_PASS`) |
| ادعای تعداد بیش از واقعیت (شاهد متورم) | **باز** | `pass` باید با تعداد خطوط `✅` برابر باشد (`EVIDENCE_MISMATCH`) |
| سوئیت معلق | job را تا ۱۸۰ دقیقه بلوکه می‌کرد | timeout هر سوئیت (پیش‌فرض ۳۰۰ ثانیه، `PAYESH_API_SUITE_TIMEOUT_MS`) ⇒ `TIMEOUT` |
| از دست رفتن علتِ RED | فقط stdout چاپ می‌شد، stderr حذف می‌شد | هر دو stream (کران‌دار) در شکست چاپ می‌شوند |
| فایل تودرتو خارج از هر گیت | **باز** — `tests/api/phase5-pilot/index.test.js` | به رجیستری اضافه شد + پیمایش بازگشتی در parity (P6a/P6c) |
| بودجهٔ ۴۸۵ برای ۲ فایل اجرانشده | **باز** — گیتِ عملاً بی‌اثر | `ORPHAN_BUDGET = 0` + `DESIGN_EXCLUDED_ORPHANS` صریح (P6/P6e) |
| درخت‌های تست تودرتو خارج از شمارش | **باز** — ۱۰۴ فایل `tests/infrastructure` و … | رجیستری درخت‌ها (P19a–P19d) + رجیستری aggregatorها (P14–P18) |

### ۵.۱ مدرکِ منفی (تست‌های واقعی، نه mock)

`tests/false-green-defense.test.js` موارد **C10–C16** را به **runner واقعی** می‌دهد:

| مورد | fixture | انتظار | نتیجه |
|---|---|---|---|
| C10 | exit 0 بدون assertion و بدون شاهد | RED | ✅ |
| C11 | `skip: 1` اعلام‌شده | RED | ✅ |
| C12 | `fail: 1` با exit 0 | RED | ✅ |
| C13 | `pass: 0` | RED | ✅ |
| C14 | `pass: 5` ولی فقط ۱ خط `✅` | RED | ✅ |
| C15 | سوئیت معلق (۶۰۰ ثانیه) | RED کران‌دار | ✅ |
| C16 | سوئیت صادق با شاهد منطبق | **GREEN** (کنترل) | ✅ |
| C16b | هر ۳۲ سوئیت ثبت‌شده شاهد اعلام می‌کنند | GREEN | ✅ |
| C16c/d | رجیستری ↔ دیسک بازگشتی | GREEN | ✅ |

اگر کسی `evaluateSuiteResult` را ضعیف کند (مثلاً E4/E5/E7 را بردارد)، C11/C12/C14 قرمز
می‌شوند؛ اگر پیمایش بازگشتی حذف شود، C16d قرمز می‌شود.

نمونهٔ واقعی که همین قرارداد گرفت: `phase5-pilot.test.js` با `pass=13` بنرِ حاوی `✅`
چاپ می‌کرد و شمارشِ خام ۱۴ می‌شد ⇒ `EVIDENCE_MISMATCH`. این کشف باعث شد شمارش فقط
روی **خطوط نتیجه** (`^\s*✅`) انجام شود — یعنی شاهد به معنای واقعی «assertion اجراشده».

### ۵.۲ «skip = سبز» بیرون از لایهٔ API (کشف و ثبت، بدون تغییر رفتار)

سه مورد با اجرای واقعی در همین محیط بازتولید شد:

| سوئیت | خروجی واقعی | exit |
|---|---|---|
| `tests/redis-sentinel-failover.js` | `9/9 موفق · ردشده: 1 — بدون خطا ✅` | **0** |
| `tests/m15-03-aggregate-pg.js` | `⏭ NOT-RUN — PostgreSQL در دسترس نیست` | **0** |
| `tests/chat9-behavior-regression.js` | skip فقط وقتی store/pin نباشد؛ در این محیط ۰ | 0 |

`redis-sentinel-failover` در `scripts/run-all-tests.sh` جزو `LIVE_INFRA_SUITES` است و
در CI «GREEN» ثبت می‌شود، در حالی که یکی از تست‌هایش (شبیه‌سازی واقعی failover) اجرا
نشده است. `m15-03-aggregate-pg` هیچ‌جا `M1503_REQUIRE_PG=1` نمی‌گیرد، پس روی ماشینی که
PG ندارد همیشه «سبز» است (در CI که PG دارد، فقط اگر اتصال موفق باشد واقعاً اجرا می‌شود).

این موارد **تغییر رفتار داده نشدند** چون الزام‌کردنشان بدون PostgreSQL/Redis واقعی در
این sandbox قابل تأیید نبود و ریسک قرمزکردن CI بدون مدرک وجود داشت. به‌جای آن:

- هر ۱۱ سوئیت با همین الگو در `DECLARED_SKIP_TOLERANT_SUITES` (قرارداد parity) اعلام
  شدند؛ افزودن مورد تازه بدون اعلان، CI را قرمز می‌کند (`P20`).
- پیشنهاد مالک: `M1503_REQUIRE_PG=1` در `run_live_one` وقتی PG زنده دیده شد، و
  غیرقابل‌قبول‌کردن `skipped > 0` در `redis-sentinel-failover` وقتی
  `P0_HA_REQUIRE_REDIS=1` ست است.

---

## ۶. درخت‌های تودرتو: آنچه هنوز اجرا نمی‌شود

`find tests -name '*.test.js'` → ۳۸۰ فایل تودرتو که تا پیش از این کار در هیچ شمارشی
نبودند. وضعیت اندازه‌گیری‌شده (اجرای دستی، ۲۰۲۶-۱۰-۲۶):

| درخت | فایل `.js` | وضعیت | گیت |
|---|---|---|---|
| `tests/api` | ۳۴ | wired | `tests/api/runner.js` |
| `tests/semantic-layer` | ۲۱۵ | wired | `tests/semantic-layer/runner.js` (۳۳/۳۳ سبز) |
| `tests/infrastructure` | ۱۱۳ | **unwired** | هیچ |
| `tests/deployment` | ۹ | **unwired** | هیچ |
| `tests/monitoring` | ۱۰ | **unwired** | هیچ |
| `tests/security` | ۱۱ | **unwired** | هیچ |
| `tests/fixtures` / `helpers` / `performance` | ۰ / ۶ / ۱۹ | support | — |

۲۰ aggregator غیرِ‌semantic اجرا شد؛ **۱۰ سبز، ۱۰ قرمز**:

| aggregator | exit | علت |
|---|---|---|
| `tests/deployment/pilot/index.test.js` | 0 | ۸/۸ سبز |
| `tests/infrastructure/certification/index.test.js` | 0 | 9/9 |
| `tests/infrastructure/disaster-recovery/index.test.js` | 0 | ۸/۸ |
| `tests/infrastructure/phase5/federation/index.test.js` | 0 | 3/3 |
| `tests/infrastructure/phase5/national-load/index.test.js` | 0 | 2/2 |
| `tests/infrastructure/phase5/operational-slo/index.test.js` | 0 | 1/1 |
| `tests/infrastructure/phase5/region-isolation/index.test.js` | 0 | 3/3 |
| `tests/infrastructure/phase5/resource-governance/index.test.js` | 0 | 4/4 |
| `tests/infrastructure/scalability/index.test.js` | 0 | ۷/۷ |
| `tests/security/zero-trust/index.test.js` | 0 | ۱۰/۱۰ |
| `tests/infrastructure/event-processing/index.test.js` | 1 | `AUTHORITY_UNAVAILABLE: PostgreSQL authority is not attached` |
| `tests/infrastructure/phase5/national-capacity-enforcement/index.test.js` | 1 | نیازمند PostgreSQL واقعی |
| `tests/infrastructure/phase5/national-e2e/index.test.js` | 1 | `OPS_KV_UNAVAILABLE` |
| `tests/infrastructure/phase5/national/index.test.js` | 1 | `national-region.test.js` قرمز (assertion) |
| `tests/infrastructure/phase5/pilot-scaling/index.test.js` | 1 | `provincial-registry.test.js` قرمز |
| `tests/infrastructure/phase5/production-readiness/index.test.js` | 1 | نیازمند PostgreSQL واقعی |
| `tests/infrastructure/phase5/remediation/index.test.js` | 1 | `Every generated ID must be globally unique` |
| `tests/infrastructure/phase5/traffic-enforcement/index.test.js` | 1 | `OPS_KV_UNAVAILABLE` |
| `tests/monitoring/observability/index.test.js` | 1 | AssertionError (strict equal) |

این‌ها **قرمزِ پنهان** هستند: چون هیچ گیتی اجرا نمی‌کند، مخزن سبز به‌نظر می‌رسد. به همین
دلیل اتصال بی‌قیدشان به گیت انجام **نشد** (CI را قرمز می‌کرد بدون تصمیم مالک) و به‌جای
آن به‌صورت صریح و شمارش‌شده در قرارداد ثبت شدند (`DECLARED_UNWIRED_NESTED_AGGREGATORS`،
۱۹ مورد؛ `NESTED_TREE_REGISTER`، ۹ درخت). افزودن هر aggregator یا فایل تازه در این
درخت‌ها، CI را تا زمان به‌روزرسانی آگاهانهٔ رجیستری قرمز می‌کند.

**BLOCKED — OWNER DECISION REQUIRED:** اتصال `tests/infrastructure`(۱۱۳)،
`tests/deployment`(۹)، `tests/monitoring`(۱۰) و `tests/security`(۱۱) به گیت، و رفع ۹
aggregator قرمز، نیازمند تصمیم مالک و در دسترس بودن PostgreSQL واقعی در CI است.

---

## ۷. تغییرات

| فایل | تغییر |
|---|---|
| `tests/api/suite-contract.js` (**جدید**) | تولید/تحلیل نشانگر `PAYESH_SUITE_RESULT` و شمارش خطوط نتیجهٔ `✅` |
| `tests/api/runner.js` | قرارداد شاهدِ اجرا (E1–E7)، timeout هر سوئیت، چاپ stderr، خلاصهٔ assertionها، رجیستری ۳۲ سوئیتی با aggregator تودرتو |
| `tests/api/*.test.js` (۳۱ فایل) | افزودن `reportSuiteResult({ name, pass, fail })` پس از جمع‌بندی؛ هیچ assertion‌ای حذف/ضعیف نشد |
| `tests/api/phase5-pilot/index.test.js` | بازنویسی: انتقال شاهدِ فرزند به‌جای ادعای «۱۰۰٪ موفق» از روی exit code |
| `tests/false-green-defense.test.js` | موارد C10–C16 (+C16b–d) برای قرارداد API |
| `tests/ci-test-parity-contract.js` | پیمایش بازگشتی API، `ORPHAN_BUDGET = 0` + استثناهای صریح، رجیستری aggregatorها (P14–P18) و درخت‌ها (P19a–P19d) |
| `.github/workflows/node.js.yml` | گیت صریح `if: always()` برای `tests/false-green-defense.test.js` |
| `docs/TEST_CI_PARITY_CONTRACT.md` | بازنویسی اندازه‌گیری‌ها، بودجهٔ ۰، قرارداد شاهدِ اجرا، رجیستری درخت‌ها |
| `docs/TEST_COVERAGE_M15_01_CHAT2_REPORT.md` | همین سند |

**هیچ تستی حذف، skip یا ضعیف نشد؛ هیچ سقف خطایی بالا نرفت.** تنها عددی که تغییر کرد
سقفِ اجرانشده‌ها بود که از ۴۸۵ به **۰** **کاهش** یافت.

---

## ۸. آنچه این گزارش **ادعا نمی‌کند**

- «همهٔ تست‌ها سبزند» — ۱۹ aggregator و ۱۴۳ فایل `.js` در چهار درخت همچنان اجرا نمی‌شوند
  و ۹ aggregator از ۱۹ مورد قرمزند.
- «CI سبز است» — اجرای GitHub Actions در این sandbox مشاهده نشد؛ فقط گیت‌های محلیِ
  قابل‌اجرا اجرا شدند.
- «پوشش PostgreSQL لایهٔ API» — این ۳۲ سوئیت JSON-store‌اند.
- «`scripts/run-all-tests.sh` سبز است» — اجرا نشد (بخش ۹).

---

## ۹. موانع محیطی

| مانع | اثر |
|---|---|
| نبود PostgreSQL/Redis | `scripts/run-all-tests.sh`، سوئیت‌های live-PG و ۵ aggregator زیرساخت قابل اجرا نبودند |
| نبود Docker | گیت‌های `promtool`/`amtool`/observability در workflow محلی اجرا نشد |
| نبود Chromium/Playwright | سوئیت‌های a11y و `reports-pdf-e2e` اجرا نشدند |
| زمان/منابع | `npm run test:all` (۶۲۵ فایل سطح‌اول) اجرا نشد |
| نبود شبکه به GitHub Actions | نتیجهٔ CI برای همین SHA قابل استناد نیست |
