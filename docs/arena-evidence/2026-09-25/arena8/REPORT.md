# Arena 8 — Performance Analyst

## Identity و دامنه
- تاریخ: 2026-09-22؛ مخزن: `rezaa2544/p2`؛ Branch: `main`.
- Current HEAD و origin/main پس از fetch و بررسی نهایی: `ecc8b40b5d533d77c6ebad63ca0854119873c504`.
- Working tree: clean در شروع و پایان؛ هیچ فایل پروژه تغییر نکرد، commit/push انجام نشد.
- محیط آزمون: Linux x86_64 sandbox؛ Node `v22.23.2` نصب‌شده جداگانه در `arena8/runtime`؛ Node پیش‌فرض محیط v20 بود و برای بازتولید استفاده نشد.
- دامنه: اعتبار ابزار ظرفیت، نمونه‌های k6، provenance/CI، مسیرهای منابع و نیازهای benchmark. اجرای CLI واقعی مخزن علیه HTTP fixture مستقل loopback؛ نه اجرای برنامه، نه benchmark ظرفیت، نه staging.
- فایل قرارداد: `PLAN.md`. شواهد: `evidence/`؛ بازتولید: `probe-audit.cjs`.

## 1. Current Measurements

**هیچ اندازه‌گیری معتبر جاری برای ظرفیت خود برنامه در این مأموریت تولید نشده است.** latency، RPS قابل‌تحمل، CPU/RAM برنامه، سقف کاربران و بازده scale-out همگی **NOT VERIFIED** هستند. اعداد موجود در مدل ظرفیت یا گزارش تاریخی را به measurement فعلی تبدیل نکرده‌ام؛ گزارش‌های Chat خارج از 1 تا 4 سابقه معتبر تلقی نشده‌اند.

اندازه‌گیری‌های زیر صرفاً خروجی آزمون صحت ابزارند، نه عملکرد محصول. هر حالت در دو subprocess مستقل با fixture تازه اجرا شد:

| ورودی fixture/CLI | نتیجهٔ واقعی CLI | Runs | وضعیت |
|---|---|---:|---|
| HTTP 200، concurrency=2 | درخواست ثبت شد، خطا صفر، exit=0 | 2 | PARTIALLY VERIFIED: کنترل عادی ابزار، نه صحت کسب‌وکار |
| `--staircase 0` | صفر درخواست، p95=null، verdictP95=PASS، exit=0 | 2 | REPRODUCED |
| `--staircase abc` | صفر درخواست، p95=null، verdictP95=PASS، exit=0 | 2 | REPRODUCED |
| `--step-seconds -1` | صفر درخواست اندازه‌گیری، verdictP95=PASS، exit=0 | 2 | REPRODUCED |
| قطع socket برای تمام درخواست‌ها | در هر اجرا 250 درخواست و 250 transportErrors؛ errorRatePct=0، verdictP95=PASS، exit=0 | 2 | REPRODUCED |
| HTTP 200 با بدنه کوتاه‌تر از Content-Length و قطع اتصال | 46 و 44 درخواست؛ transportErrors=0 و errorRatePct=0، exit=0 | 2 | REPRODUCED |
| HTTP 401 برای همه درخواست‌ها | errorRatePct=0، verdictP95=PASS، exit=0 | 2 | REPRODUCED؛ محدودیت شمارش goodput |
| HTTP 503 برای همه درخواست‌ها | errorRatePct=100، توقف اضطراری، ولی exit=0 و مقدار maxSustainableRps منتشر می‌شود | 2 | REPRODUCED |
| `--validate --staircase 0` و `abc` | هرکدام exit=1؛ در تضاد با مسیر اجرای واقعی همان ورودی | 1 برای هر ورودی | REPRODUCED |

**قید مهم:** `verdictP95` فقط verdict تأخیر است و پاکت خود را «پیش‌نویس تا بازبینی انسانی» معرفی می‌کند. پس نگفته‌ام ابزار verdict نهایی سلامت صادر می‌کند. با این حال صفرنمونه، خطای انتقال حذف‌شده و مقدار sustainable برای پلهٔ مردود، استفاده از آن برای اثبات ظرفیت را نامعتبر می‌کنند.

### Evidence Matrix
SHA و محیط مشترک بالا به همه ردیف‌ها اعمال می‌شود. فرمان کامل هر subprocess، stderr/stdout، exit و ورودی در `evidence/<case>-<run>.log` ثبت شده؛ خروجی خام در JSON هم‌نام است.

| ID | Check / Command | Expected | Actual | Runs | Evidence | Status |
|---|---|---|---|---:|---|---|
| E01 | `git rev-parse HEAD origin/main`; `git status --porcelain=v1`; `git ls-remote origin refs/heads/main` | هویت یکسان و tree بدون تغییر | SHA یکسان و خروجی status خالی؛ exit=0 | ابتدا و انتها | Git؛ `final-identity-and-ci.json` | VERIFIED، فقط هویت نسخه |
| E02 | `/home/user/arena8/runtime/node_modules/.bin/node /home/user/arena8/probe-audit.cjs` | ورودی نامعتبر رد؛ انتقال ناقص خطا؛ بدون نمونه فاقد PASS | جدول بالا؛ خود harness exit=0 یعنی پایان ثبت شواهد، نه PASS ابزار | 1 harness، هر حالت runtime دوبار | E3 محدود به CLI+fixture؛ `summary.json` و logs | REPRODUCED |
| E03 | `bash run-benchmarks.sh --scenario 01-login` | اجرای k6 با dependencies واقعی | k6 موجود نیست؛ exit=1؛ تست بار اجرا نشد | 1 | `k6-attempt.log` | BLOCKED |
| E04 | `nl -ba <file>` برای مسیرهای Findings | تطبیق رفتار با کد جاری | root causeهای زیر | 1 مرور هر مسیر | ایستا؛ `source-evidence.txt` | PARTIALLY VERIFIED |
| E05 | `grep -nE 'capacity-saturation|run-benchmarks|k6' .github/workflows/* tests/run.js scripts/run-all-tests.sh` | تعیین coverage مستقیم | benchmark k6 در runner به‌صراحت دستی/خارج regression است؛ entry مستقیم در workflowهای بررسی‌شده پیدا نشد؛ exit=0 به‌سبب match در scripts | 1 | ایستا؛ `final-identity-and-ci.json` | MEASUREMENT GAP |

نبود match اثبات نبود هر نوع اجرای غیرمستقیم CI نیست. وضعیت آخرین اجرای GitHub Actions از سرویس GitHub بررسی نشد؛ تست‌های عمومی، full regression، live PG/Redis و k6 اجرا نشده‌اند.

## 2. Missing Benchmarks

| شکاف | benchmark لازم و خروجی موردنیاز | مالک / وضعیت |
|---|---|---|
| ظرفیت API احراز‌شده | workload واقعی چند tenant با نسبت خواندن/نوشتن، تأیید persistence؛ throughput موفق جدا از 4xx/5xx/transport؛ p50/p95/p99 per route | Coding + Performance؛ MEASUREMENT GAP |
| اشباع و scale-out | arrival-rate کنترل‌شده و staircase؛ offered/achieved/goodput، dropped iterations، latency و صف؛ تکرار مستقل با topology ثبت‌شده | Tech Lead/Infra؛ EXTERNAL BLOCKER برای محیط E4 |
| PostgreSQL | dataset/cardinality/skew مصوب؛ EXPLAIN ANALYZE BUFFERS، pool wait، lock wait، I/O/WAL و query count per request | DB team؛ NOT VERIFIED |
| Redis و cold cache | cold/warm/invalidation burst، hot tenant، reconnect و outage تحت بار با assertion fail-closed مناسب | Backend/Infra؛ NOT VERIFIED |
| Worker | تولید بار بیش از نرخ مصرف، age/depth صف، handler کند/متوقف، crash و restart، duplicate/retry و drain پس از بازیابی | Backend؛ NOT VERIFIED |
| منابع/soak | time series CPU، RSS/heap، GC pause، event-loop lag، DB/Redis و load-generator resources؛ طول اجرای مصوب، نه اجرای کوتاه با نام 24h | Performance/Infra؛ MEASUREMENT GAP |
| کلاینت | مرورگر واقعی و دستگاه هدف، dataset واقع‌نما، render و memory و long-task؛ مستقل از server latency | Frontend؛ NOT VERIFIED |

`docs/LOAD_TEST_RESULTS.md:1–35` همچنان قالب و TBD دارد و `docs/CAPACITY_MODEL.md:1–9` خودش مدل اثبات‌نشده است. این اسناد فقط شاهد وضعیت مستندات جاری‌اند، نه پذیرش گزارش تاریخی. benchmarkهای حاضر را گمشده اعلام نمی‌کنم؛ هیچ تست یا Evidence غایبی بازسازی نشده است.

## 3. Bottlenecks / Findings

### A8-01 — High — پذیرش اجرای بدون نمونه
- **Location:** `tools/capacity-saturation-probe.js:103–120,309–319,345`.
- **Reproduction:** harness، حالت‌های `zero`, `invalid`, `negative-duration`؛ CLI دقیق در log هر حالت.
- **Expected:** ورودی نامعتبر پیش از بار رد شود؛ بدون نمونه verdict نامعتبر/غیرقابل‌اندازه‌گیری باشد.
- **Actual:** صفر درخواست اندازه‌گیری با PASS و exit صفر؛ دو بار برای هر حالت.
- **Root cause:** validate فقط در حالت `--validate/--help` اجرا می‌شود؛ مسیر اصلی صرفاً target و confirmation را می‌سنجد؛ p95=null شرط PASS را ارضا می‌کند.
- **Impact:** خطر Fake Green برای benchmark تهی.
- **Remediation:** validator مشترک بدون exit داخلی، اعداد finite/positive و staircase معتبر؛ حداقل نمونه و منع PASS بدون نمونه.
- **Regression:** ورودی معتبر، صفر، رشته، منفی، ترتیب نامعتبر و صفرنمونه در مسیر اصلی CLI؛ validate و run باید قرارداد یکسان داشته باشند.
- **Evidence/Ownership:** REPRODUCED؛ E3 ابزار/fixture، نه برنامه؛ Coding team. Fix و post-fix regression انجام نشده.

### A8-02 — High — خطاهای شبکه/بدنه از ارزیابی ظرفیت حذف می‌شوند
- **Location:** همان فایل `231–244,278–302,334`.
- **Expected:** شکست دریافت بدنه یا انتقال، درخواست موفق شمرده نشود؛ در failure budget/abort و goodput منعکس شود.
- **Actual:** socket failures در transportErrors ثبت می‌شوند اما errorRatePct صفر است؛ truncated body حتی transportErrors هم تولید نمی‌کند.
- **Root cause:** `res.arrayBuffer().catch(() => {})` خطای بدنه را می‌بلعد؛ numerator نرخ خطا فقط err5 است؛ همه attempts وارد throughput می‌شوند.
- **Impact:** نرخ تکمیل کسب‌وکار و ظرفیت پایدار از این اعداد قابل استنتاج نیست.
- **Remediation:** مصرف کامل بدنه الزامی؛ تفکیک attempted/completed/validated-success؛ احتساب transport/protocol errors در بودجه و توقف؛ گزارش status distribution.
- **Regression:** connection refused/reset، timeout قبل/بعد header، partial body و پاسخ کامل کنترل؛ تکرار concurrent و بازیابی.
- **Evidence/Ownership:** REPRODUCED در دو اجرای مستقل هر failure؛ E3 CLI/fixture؛ Coding team.

### A8-03 — Medium — خروجی ظرفیت پایدار حتی با شکست اولین پله
- **Location:** همان فایل `250–266,334,345–351`.
- **Expected:** اگر اولین پله شرایط قبولی را ندارد، sustainable capacity نامعلوم باشد؛ exit/final verdict قرارداد صریح داشته باشد.
- **Actual:** پاسخ 503 در همه درخواست‌ها، errorRatePct=100 و abort؛ با این حال exit=0 و maxSustainableRps عدد دارد.
- **Root cause:** fallback در انتخاب sustained، خود پله مردود را برمی‌گرداند؛ exit همواره صفر است. PASS تأخیر را با PASS سلامت اشتباه نمی‌گیریم؛ defect اصلی برچسب ظرفیت پایدار است.
- **Remediation:** فقط آخرین پلهٔ واقعاً پذیرفته‌شده؛ اگر وجود ندارد null همراه علت؛ verdict مرکب و nonzero exit برای اجرای نامعتبر/failed براساس قرارداد مصوب.
- **Regression:** failure اولین پله، failure پله بعد، عدم نمونه، healthy کنترل؛ post-fix انجام نشده.
- **Evidence/Ownership:** REPRODUCED، E3 CLI/fixture؛ Coding team.

### A8-04 — Medium — شکاف assertions و تزریق خرابی در k6
- **Location:** `tests/performance/suites/saturation-test.js:27–42`؛ فایل‌های `chaos-redis-test.js` و `soak-24h-test.js`؛ `helpers/auth-helper.js` بخش setupAllSessions؛ `tests/performance/run-benchmarks.sh` بخش اجرای suite all.
- **Evidence:** مرور ایستا: return زودهنگام در نبود session؛ thresholds عمدتاً HTTP duration/failure هستند، نه checks یا حداقل business operations؛ chaos suite به‌تنهایی Redis را قطع نمی‌کند و وقوع outage را اثبات نمی‌کند؛ suite-all زمان soak را کوتاه می‌کند.
- **Impact:** اجرای suite به‌تنهایی اثبات بار واقعی، صحت پاسخ، outage یا endurance نیست. Fake Green runtime این k6ها در این مأموریت بازتولید نشده است.
- **Remediation:** setup fail-fast، حداقل عملیات موفق، threshold برای checks و correctness، ثبت تزریق/بازیابی بیرونی، تمایز smoke از soak واقعی.
- **Regression requirement:** بدون session؛ HTTP200 با body غلط؛ outage واقعاً مشاهده‌شده و recovery؛ soak با duration واقعی ثبت‌شده.
- **Status/Evidence/Owner:** PARTIALLY VERIFIED / ایستا؛ runtime BLOCKED به‌دلیل k6 غایب و سرویس آماده‌نشده؛ QA/Performance.

### گلوگاه‌های برنامه: فقط کاندیدای profiling، نه گلوگاه اثبات‌شده
1. **Boot hydration و RAM:** `server/index.js:297` و `server/db.js:547–577`؛ در نبود cap، readCollection فراخوانی می‌شود (`db.js:491`: SELECT *). رشد dataset ممکن است boot/RSS هر replica را محدود کند؛ رفتار تنظیمات deployment و منابع باید اندازه‌گیری شود. OOM بازتولید نشده است.
2. **Head-of-line در worker:** `server/worker.js:49–74`؛ tick هم‌زمان رد می‌شود و handlerها در حلقه await می‌شوند. یک handler کند می‌تواند همان worker را معطل کند؛ سقف throughput و اثر چند worker اندازه‌گیری نشده.
3. **فشار connection pool:** `server/db.js:62–63,179–180`؛ تنظیم محدود pool وجود دارد. مقدار config ظرفیت نیست؛ افزایش replica بدون pool/DB budget باید benchmark شود.
4. **مصرف حافظه خود load generator:** `capacity-saturation-probe.js:272–294` همه latencyها را در آرایه‌های سراسری و per-endpoint نگه می‌دارد و مرتب می‌کند. در اجرای طولانی مصرف خود ابزار ممکن است سنجش را منحرف کند؛ profiling آن انجام نشده.
5. **شکاف جمع‌آوری منابع:** probe در `:71–78` فقط مجموعه‌ای محدود از متریک‌ها را scrape می‌کند؛ `:200` DB CPU را NOT-COLLECTED معرفی می‌کند. وجود exporterهای RSS/CPU در `server/metrics.js:524–555,709–715` به معنی ثبت time series در benchmark نیست.

**نتیجهٔ گلوگاه برنامه: NOT VERIFIED.** هیچ رتبه‌بندی بر مبنای حدس یا عدد ظرفیت ارائه نمی‌شود.

## 4. Recommendations

### اولویت اقدام
1. Coding team: A8-01 و A8-02 و A8-03 را بدون تغییر اهداف ظرفیت اصلاح کند؛ harness مستقل حاضر و regression اختصاصی روی SHA جدید اجرا شوند. این ابزار تا آن زمان مبنای پذیرش ظرفیت نباشد.
2. QA/Performance: قرارداد benchmark موفق را بر goodput و correctness بنا کند؛ negative controls برای ابزار و k6 اضافه شود. کنترل 401 فعلی به‌تنهایی نقص مستندنشده نیست: ابزار محدودیت 4xx را در header ذکر کرده، ولی باید از business capacity جدا شود.
3. Tech Lead: workload، SLO، dataset، topology و مجوز fault injection را مصوب کند؛ محیط E4، PG/Redis و instrumentation را تخصیص دهد. **EXTERNAL BLOCKER / OWNER DECISION REQUIRED** برای این زیرساخت.
4. Performance: baseline واقع‌نما و پروفایل منابع را در cold/warm، spike، soak و recovery ثبت کند؛ سپس فقط گلوگاه اثبات‌شده بهینه شود. فعلاً افزایش cache/pool/replica به‌عنوان راه‌حل تأیید نمی‌شود.
5. Evidence owner: SHA، image/runtime، مشخصات dataset، زمان واقعی هر step، offered/achieved/goodput، error classes، per-route latency، مصرف load generator و سرورها، raw artifacts و تکرار مستقل را ضمیمه کند. probe فعلی throughput را بر زمان configured تقسیم می‌کند (`:290,299`)، نه elapsed واقعی؛ این مورد review ایستا است و اثر عددی آن اندازه‌گیری نشده.

### Five-Task / Five-Pass ledger
این جدول ادعای تکمیل 25 Pass نیست. مرور سند/کد جای آزمون runtime را نمی‌گیرد؛ دوبار اجرای حالت مشابه فقط تکرارپذیری است، نه دو Pass متفاوت.

| Task | P1 Normal | P2 Boundary | P3 Negative | P4 Concurrency/Recovery | P5 Independent regression |
|---|---|---|---|---|---|
| T1 Measurement provenance/CI | هویت HEAD و قالب‌ها بررسی شد | مرز model/history/current جدا شد | غیبت k6 با exit=1 مشاهده شد | CI زنده/موازی NOT VERIFIED؛ دسترسی artifact در scope اجرا نشد | fetch نهایی همان SHA؛ GitHub run و full regression NOT VERIFIED |
| T2 Probe integrity | fixture200 اجرا شد | zero/abc/negative اجرا شد | socket/partial-body/401/503 اجرا شد | concurrency=2 اجرا شد؛ crash/recovery برنامه NOT VERIFIED، برنامه اجرا نشده | validate CLI کنترل مستقل؛ fresh-process rerun؛ post-fix NOT VERIFIED چون fix انجام نشد |
| T3 k6 integrity | setup/threshold ایستا بررسی شد | کوتاه‌سازی soak و session guard بررسی شد | failure contract ایستا بررسی شد | outage/chaos runtime BLOCKED، k6 و سرویس آماده نیست | اجرای k6 exit=1؛ regression runtime BLOCKED |
| T4 Resources/bottlenecks | مسیر DB/worker/metrics بررسی شد | cap/pool و retention ابزار بررسی شد | OOM/slow-handler runtime NOT VERIFIED؛ deployment آماده نیست | load/restart/queue-drain NOT VERIFIED؛ زیرساخت اجرا نشده | resource baseline مستقل NOT VERIFIED؛ telemetry benchmark موجود نیست |
| T5 Scalability/reconciliation | مدل از proof جدا شد | tenant/data scale benchmark NOT VERIFIED | dependency failure زیر بار NOT VERIFIED | multi-node E4 BLOCKED؛ زیرساخت/مجوز فراهم نشده | roadmap/current SHA بررسی شد؛ benchmark مستقل E4 BLOCKED |

### Cross-Agent Conflicts و Roadmap Impact
- نتیجه مستقل Agent دیگری با raw runtime evidence برای مقایسه مستقیم در اختیار این مأموریت نبود؛ اختلافی را ساختگی اعلام نمی‌کنم.
- اسناد performance قدیمی، حتی وقتی در HEAD هستند، Evidence runtime جاری محسوب نمی‌شوند.
- در Current HEAD، `docs/ROADMAP.md:1389–1394` Phase8.2 Exit را NOT VERIFIED و Phase8.3 را BLOCKED ثبت می‌کند. این صرفاً مشاهده سند است، نه re-verification همه gates.
- **Roadmap Reconciliation Required:** A8-01..04، measurement gaps و محدودیت benchmark/CI باید توسط Tech Lead ثبت و با کارهای ظرفیت تطبیق داده شوند. Arena وضعیت Roadmap را تغییر نداده است.

## 5. Status / Final Verdict

**MEASUREMENT GAP**

- نقص‌های ابزار سنجش: **REPRODUCED**؛ اصلاح نشده‌اند.
- ظرفیت، گلوگاه واقعی و مصرف منابع برنامه: **NOT VERIFIED**.
- benchmark k6 این محیط: **BLOCKED**؛ missing dependency را PASS نشمرده‌ایم.
- **E4 NOT VERIFIED — EXTERNAL BLOCKER / OWNER DECISION REQUIRED**.
- هیچ Production GO، هیچ مقدار ظرفیت معتبر و هیچ ادعای سلامت کلی صادر نمی‌شود.

### بازتولید و ادامه
```bash
# پس از provision کردن Node 22؛ بدون تغییر فایل پروژه
/home/user/arena8/runtime/node_modules/.bin/node /home/user/arena8/probe-audit.cjs
```
نصب runtime و node_modules در snapshot تضمین نمی‌شود؛ در صورت نیاز با `npm install --prefix /home/user/arena8/runtime --no-audit --no-fund node@22` نصب شود و نسخه دقیق ثبت شود. fixture فقط loopback است و پس از هر case بسته می‌شود. برای اجرای روی SHA متفاوت ابتدا هویت آن را ثبت و نتیجه را Evidence جدید محسوب کنید. artifactهای loopback حاوی عدد latency/throughput هستند، اما **استفاده از آن‌ها به‌عنوان benchmark برنامه ممنوع است**.
