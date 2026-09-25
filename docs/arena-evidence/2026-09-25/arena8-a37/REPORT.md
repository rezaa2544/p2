# Arena 8 — A-37: ممیزی صداقت تست و پوشش repository

## حکم

**اسکن ایستای کل repository انجام شد؛ این نتیجه به معنی اجرای همهٔ تست‌ها یا تأیید همهٔ رفتارها نیست.**

- HEAD بررسی‌شده: `ea75623dd1a5cb06d72549703204601a5413425f`.
- وضعیت Strict Gate فعلی: **NOT VERIFIED**؛ 65 بررسی موفق، 120 ناموفق، exit **1**.
- **۵ گروه نقص مشخص** شناسایی شد: چهار گروه با probe اجرایی محدود بازتولید شدند؛ یک ضعف assertion با بررسی مستقیم کد تأیید شد. ردیف‌های تکراری inventory، نقص مستقل شمرده نمی‌شوند.
- موارد نیازمند بازبینی معنایی در inventory صریحاً `needs-review` دارند؛ **نه PASS هستند و نه defect قطعی**.
- business code، تست‌ها، CI و gate در repository تغییر نکردند. **commit اصلاحی جدید وجود ندارد.**

## دامنه و منشأ

`git ls-files` همراه فایل‌های untracked غیرignored مبنای scan بود: **۲۳۴۲ مسیر**، **۲۳۳۹ فایل متنی UTF-8**، دو PNG باینری با hash ثبت‌شده و یک فایل از قبل حذف‌شده (`monitoring/alert-rules.yml`). تمام متن‌ها برای markerها بررسی شدند. **۱۲۲۸ فایل JS/MJS/CJS** با Acorn، با fallback صحیح script/module، parse شدند؛ خطای parse نهایی **صفر** بود.

**۹۶۷ فایل JS/CJS زیر tests/** وجود دارد: ۹۶۴ JS و سه CJS؛ تعداد JSهای سطح اول **۵۵۳** است. `.git`، dependencies و خروجی‌های ignored خارج از مفهوم current source repository هستند؛ نسخه‌های generated که tracked بودند از scan حذف نشدند و جدا طبقه‌بندی شدند.

۲۳ تغییر قبلی در working tree، عمدتاً mode و حذف فایل مذکور، دست‌نخورده باقی ماندند. بنابراین binding فقط SHA نیست: `repository-manifest.csv` hash هر فایل و `evidence/pre-existing.patch` تغییرات اولیه را ثبت می‌کنند. hash diff ابتدا و انتهای audit یکسان است.

## اعداد تاریخی 513 / 311 / 54 / ~40

**این چهار عدد را به عنوان آمار معتبر current repository تأیید نمی‌کنم.** منبعی که دقیقاً این tuple را با نام متریک، دامنه، الگوریتم و SHA تعریف کند پیدا نشد. از شمارهٔ خط، عدد fixture یا عددی مشابه نمی‌توان provenance ساخت.

| عدد تاریخی | حکم |
|---|---|
| 513 | **NOT VERIFIED**؛ تعریف و SHA تاریخی مشخص نیست. اگر منظور نبود `assert` باشد، شمارش فعلی با تعریف صریح زیر 470 است، نه513. |
| 311 | **NOT VERIFIED**؛ اگر منظور unwired سطح اول مطابق parity فعلی باشد، عدد امروز486 است، نه311. orphan در graph تعریف دیگری دارد. |
| 54 | **NOT VERIFIED**؛ «mock» تعریف یکتا ندارد: 67 فایل تست دارای واژهٔ mock، 137 دارای mock/stub/fake و30 دارای call-name mock/stub/fake در AST هستند. |
| ~40 | **NOT VERIFIED از نظر معنایی**؛ 38 literal متنی `0/0` وجود دارد، اما این فقط یک نزدیکی عددی است، نه اثبات40 تست صفر-check یا skip. |

این مقایسه‌های شرطی، نسبت‌دادن قطعی نام متریک به اعداد کاربر نیستند. **کاربرد tuple قدیمی برای current clearance رد می‌شود؛ صحت آن در یک commit تاریخی بدون شاهد نه اثبات شده و نه رد تاریخی شده است.** منبعِ audit تعریف‌کنندهٔ این چهار عدد: `NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT`.

## اندازه‌گیری‌های دقیق current

| دسته | نتیجه | واحد و محدودیت |
|---|---:|---|
| ZERO-CHECK — فاقد الگوی خام `assert(` یا `assert.` | 470 | فایل تست؛ **نه470 تست بی‌assertion** |
| فاقد call با نام‌های شناخته‌شدهٔ check/assert/expect | 154 | فایل؛ helper، runner و wrapperهای سفارشی هم در این شمارش‌اند |
| فاقد oracle شناسایی‌شده توسط heuristic تکمیلی | 4 | هر چهار مورد با review مشخص شدند: سه oracle غیرهم‌نام و یک helper؛ defect صفر-check از این عدد نتیجه نمی‌شود |
| ORPHAN — معیار خود `ci-test-parity-contract.js` | 486 | فایل JS سطح اول بدون wiring مستقیم در مدل متنی آن؛ بودجه485 و exit1 |
| CI graph: مسیر احتمالی قابل بازیابی | 285 / 967 | شامل dependency و child runner؛ اثبات اجرای واقعی CI نیست |
| CI graph: بدون مسیر شناسایی‌شده | 682 | **candidate**، نه682 orphan قطعی؛ dispatch پویا و شرط‌های CI محدودیت تحلیل‌اند |
| MOCK — markerهای خام | 2567 در532 فایل | شامل docs، comments، jsdom، fixture و generated |
| MOCK — call-name در AST | 144 در31 فایل | 30 فایل تست؛ object injection با نام‌های دیگر نیز ممکن است |
| swallowed catch — AST | 1819 در510 فایل | 1045 handler خالی؛ بقیه fallbackهای فاقد escalation شناخته‌شده؛ همگی defect نیستند |
| swallowed catch در tests/ | 1119 | نیازمند تفکیک cleanup، negative fixture و بلعیدن شکست واقعی |
| `assert(true)` | 11 hit متنی؛ **2 call اجرایی** | یک cleanup ضعیف؛ یک smoke no-throw مشروع |
| `process.exit(0)` | 149 hit متنی؛ **99 call اجرایی** | موفقیت guarded، shutdown و worker نیز در شمارش هستند |
| `0/0` | 38 hit در30 فایل | یک مسیر 0/0 سبز واقعاً بازتولید شد؛ 38 را تعداد defects نخوانید |
| `|| true` | 100 hit در43 فایل | چهار expression جاوااسکریپت؛ سایر hitها شامل shell، کامنت و مستندات‌اند |
| hidden skip — AST candidates | 90 | 73 conditional return و17 skip-named call؛ benign API نام‌مشابه و exclusions باید جدا شوند |

نکته: graph شامل مسیرهای بالقوه و شرطی است، نه execution ledger. حتی «reachable» نیز به معنای اجرای مورد در یک CI run نیست. شمارش literalها، AST constructs و ردیف‌های تجمیع‌شدهٔ inventory واحدهای متفاوتی دارند.

## نقص‌ها و blockerهای اولویت‌دار

| ID | شدت | فایل و خط | نتیجه / اصلاح پیشنهادی |
|---|---|---|---|
| B01 | P1 | `tests/migration-009-live.js:62–65` | نبود PG prerequisite → چاپ0/0 و exit0. اجرای واقعی همین مسیر ثبت شد. required mode باید nonzero و NOT VERIFIED بدهد. |
| B02 | P1 | `tests/smoke.js:33–60,640–647` | fixture غایب → return → wrapper یک PASS با **صفر assertion** ثبت می‌کند. fixture اجباری یا نتیجهٔ NOT-RUN جداگانه لازم است. |
| B03 | P1 | `tools/strict-verification-gate.js:28–40` | registry خالی در fixture کنترل‌شده، با gate بدون تغییر، خروجی سبز می‌دهد. مجموعهٔ requirementهای مورد انتظار و nonempty بودن باید الزام شود. |
| B04 | P1 | `tools/strict-verification-gate.js:23–26` | allowlist در سطح pattern است؛ یک فایل جدیدِ تأییدنشده هم بی‌بررسی معاف شد. file/hash، owner، reason، expiry و آزمون جایگزین لازم است. |
| B05 | P2 | `tests/report2.js:151–158` | `assert(true)` حذف واقعی داده را نمی‌سنجد. absence رکوردهای ساخته‌شده و روابط باید assert شود. کل suite الزاماً بی‌check نیست. |
| B06 | P1 | `tests/infrastructure/phase6/persistence.test.js:20–30` | mock با Map و `isPostgres:()=>true`، شاهد دوام PostgreSQL یا restart کانتینر نیست. برای واحد مشروع است؛ برای ادعای live یک blocker است. |
| B07 | P1 | `tests/infrastructure/phase6/master-phase6-suite.test.js:40–41` | exit0 فرزند به ادعای کلی production ارتقا می‌یابد. سطح شاهد، پیش‌نیازها و تعداد واقعی checkها باید aggregate شوند. |
| B08 | P1 | `tools/test-discovery-verifier.sh:8–30` | شمارش discover با اجرای سه entrypoint برابر اجرای همهٔ فایل‌ها نیست. ledger هر suite و exclusion رسمی لازم است. |
| B09 | P1 | `.github/workflows/strict-verification.yml:30–35` | truth gate وابسته به env/secret است؛ نبود پیش‌نیاز نباید شاهد release را سبز کند. |
| B10 | P2 | `tests/ci-test-parity-contract.js:12,31–35` | 486 unwired از بودجه485 بیشتر است. بالا بردن بودجه، حل پوشش نیست. |
| B11 | P1 | فایل‌ها/خطوط دقیق در `blockers.csv` | negative test مدیر مدرسهٔ دیگر در نبود fixture حذف می‌شود. مدیر دوم باید seed و حداقل assertion اجباری شود. |

### شواهد probeها و مرز آن‌ها

1. **Migration:** اجرای خود تست با Node22 و بدون پیش‌نیاز PG؛ stdout شامل0/0 و exit ثبت‌شده **0**. این success ابزار، معنای موفقیت تست ندارد.
2. **Smoke:** wrapper و callback دقیق از فایل جاری استخراج و در VM با W کنترل‌شده اجرا شدند. fixture غایب: **pass1/fail0/assertions0**؛ کنترل منفی با عبور از guard: **pass0/fail1/assertions1**. این اثبات سازوکار false-green است، **نه اجرای کامل app یا کل smoke suite**.
3. **Gate:** کد gate بدون تغییر، با hash برابر، در repository مصنوعی جدا اجرا شد. registry بدون item و allowlistهای pattern-wide باعث exit0 شدند؛ افزودن مسیر جدید خارج از تأیید نیز همچنان exit0 داد. **gate واقعی این repository هنوز exit1 است**؛ این‌ها bypassهای نهفته در منطق verifier هستند، نه ادعای سبز بودن HEAD اصلی.
4. **Parity:** اجرای مستقیم current checker: **553 top-level / 68 wired در مدل خود checker / 486 unwired**، 25pass/1fail. اختلاف عدد wired با تحلیل graph ناشی از تعریف متنی/کامنت/زیرپوشه است؛ این عدد تعداد تست اجراشده نیست.

## false positiveهای مهم که defect اعلام نشدند

- `tests/client-features.js:145` و `tests/multigrade2.js:181`: عبارت assert(true) در **کامنت اصلاح قبلی** است؛ assertion مشاهده‌پذیر بعد از آن وجود دارد.
- `tests/simulation.js:531`: assertion ثابت پس از چند دور navigation، با scope صریح **no-throw smoke**؛ اثبات صحت محتوا نیست، اما صرف این عبارت defect نیست.
- `.github/workflows/observability-regression.yml:100–109`: `|| true` در polling محدود؛ پس از پایان مهلت و نبود streamهای لازم exit1 دارد. masking نهایی نیست.
- `tests/server11-child.js:74`: exit0 متعلق به **worker protocol** است؛ parent باید پاسخ را بسنجد، نه فقط exit را.
- `tests/semantic-layer/attendance-intelligence/index.test.js`: runnerِ delegate است؛ نداشتن assert مستقیم به معنی نبود check نیست.
- `tests/a11y-interactive.js` و `tests/a11y-runtime.js`: شرط critical/serious و exit ناموفق، oracle هستند.
- `tests/demo-thursday.js`: بررسی خطا/DOM دارد؛ `tests/pg-outage-control.js` ابزار کنترل fault است، نه standalone suite.
- `tests/chat9-behavior-regression.js`: census اختیاری با NOT-RUN جداگانه گزارش می‌شود؛ خود skip پنهان نیست. این بخش را نمی‌توان verified شمرد.
- mockها، mutation payloadها و generated HTMLها به طور خودکار نقص یا شاهد production تلقی نشدند.

## طبقه‌بندی inventory

**7934 ردیف دسته‌بندی‌شده** با `file`, `line`, snippet، منشأ، شدت، classification، confidence و suggested_fix تحویل شد. یک محل می‌تواند چند نوع marker داشته باشد؛ این تعدادِ نقص مستقل نیست.

| classification | ردیف |
|---|---:|
| legitimate | 3464 |
| certification blocker | 2530 |
| generated | 338 |
| helper | 265 |
| fixture | 1325 |
| real defect | 12 |

**2002 ردیف needs-review هستند.** برچسب certification blocker در inventory برای این ردیف‌ها شرطی است: تا وقتی اثر marker بر ادعای موردنظر بررسی نشده، clearance نمی‌دهیم؛ آن را defect اثبات‌شده نمی‌نامیم. `static-candidate` نیز تأیید دستی یا رفتار اجرایی نیست. فهرست کوچک‌ترِ `blockers.csv` اولویت‌های بررسی‌شده را جدا می‌کند.

## تحویل و بازتولید

- **inventory.xlsx**: همهٔ findingها با فیلتر، sheet اولویت blockerها و inventory تک‌تک967 فایل تست.
- **inventory.csv.gz**: همان ردیف‌ها برای پردازش ماشینی.
- **test-inventory.csv**: تفکیک direct CI، graph، runner دستی، assertion/throw و helper.
- **repository-manifest.csv**: فایل‌ها، حالت موجود/حذف‌شده/باینری و SHA256.
- **summary.json**: تعاریف عددی current؛ **blockers.csv**: اولویت و اصلاح پیشنهادی.
- **ast-scan.cjs / scan.py / probe-smoke-wrapper.cjs**: اسکنر و probe قابل تکرار، خارج از business repository.
- **evidence/**: exitها، stdout، manifest gate fixture، snapshot تغییرات قبلی و reference graph.

اجرای scan پس از نصب Node22، acorn/acorn-walk و openpyxl:
```sh
mkdir -p /var/tmp/arena8-a37/evidence
NODE_PATH=/var/tmp/arena8-a37-tools/node_modules \
/var/tmp/arena8-a37-tools/node_modules/.bin/node \
  /home/user/arena8-a37/ast-scan.cjs /home/user/p2 \
  /home/user/arena8-a37/evidence/text-files.json \
  /var/tmp/arena8-a37/evidence/ast.json
python /home/user/arena8-a37/scan.py
```

لیست text-files و manifest به snapshot این audit تعلق دارد؛ برای HEAD دیگر باید مجدداً `git ls-files` و hashها تولید شوند. اسکنر heuristic است، نه اثبات نبود تمام انواع false-green. code تولیدشده در string، dispatch پویا، external CI و مسیرهای وابسته به محیط محدودیت تحلیل‌اند. کل967 تست اجرا نشده؛ mock یا کمبود پیش‌نیاز به runtime PASS ارتقا نیافته است.

## اقدام بعدی / حاکمیت

- **Test/CI owner:** B01/B02، minimum-check accounting و outcomeهای جداگانه PASS/FAIL/NOT-RUN.
- **Verification owner:** B03/B04 و قرارداد evidence؛ approval سراسری pattern ممنوع، requirementهای خالی fail-closed.
- **Runtime/infra owner:** B06/B07؛ شاهد واقعی PG/restart و نقش دقیق fixtureها.
- **Tenant/API owner:** B11؛ negative fixture اجباری.
- **Tech Lead:** reconciliation پوشش و review مستقل؛ بدون promotion خودکار roadmap.

**Roadmap Reconciliation Required. A-37 clearance: NOT VERIFIED.** audit read-only بود؛ SHA اصلاحی جدید و PR/merge وجود ندارد. تغییرات قبلی کاربر عیناً حفظ شده‌اند.
