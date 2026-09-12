# پیگیری پیشرفت نقشه راه ملی پایش

**مرجع اصلی:** `docs/ROADMAP.md` — National Scale Master Roadmap

**مکمل الزام‌آور:** `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` — اجرای Waves بدون رعایت آن مجاز نیست.

**قاعده Addendum:** فقط Status کافی نیست؛ هر ردیف باید Owner، Risk، Dependency و Evidence داشته باشد.

| Wave | عنوان | Owner | Status | Risk | Dependency | Evidence |
|---:|---|---|---|---|---|---|
| -1 | Architecture Discovery | Arena 5 / همه Arenaها | ✅ | High | پیش‌نیاز همه Waves | کامل شد: Dependency/Data/Auth/Sync Flow + docs/THREAT_MODEL.md + docs/BOTTLENECK_MAP.md |
| 0 | Baseline و Freeze | Arena 1 + Arena 5 | ✅ | Medium | Wave -1 کامل | Part 1: docs/NATIONAL_BASELINE.md؛ Part 2: docs/NATIONAL_BASELINE_PART2.md؛ Part 3: docs/NATIONAL_BASELINE_PART3.md؛ Part 4: docs/NATIONAL_BASELINE_PART4.md؛ tag national-baseline-start (Part 4 بازسازی شد — commit اولیهٔ 0245515 هرگز push نشده بود) |
| 1 | PostgreSQL Source of Truth [P0] | Arena 1 | 🟡 | Critical | Wave -1 و Wave 2 (✅)؛ تصمیم ناظر روی تداخل با پیاده‌سازی چت ۳ | P0 کامل و راستی‌آزمایی‌شده روی arena/01a08a2e-p2 (۱۳ کامیت c16b178..c3bf3a1): migration 004، بوتِ PG-authoritative، ۵ روت + sync دوفازی + سرویس‌ها PG-first؛ tests/wave1-multi-instance.js ‏33/33‏، tools/wave1-gate.js ‏35/35‏، رگرسیون ‏243/247‏ با تعیین‌تکلیف هر ۴ قرمز (HANDOFF.md). باقی: ~~push نهایی (۲ کامیت محلی — احراز GitHub) + چرخاندن ruflo + PR~~ انجام شد: push ‏dd14330‏ + ruflo ‏wave1_status=completed‏ + PR ‏#48‏ به main. هشدار: پیاده‌سازی writes چت ۳ روی origin/arena/01a08545-p2 همچنان منتظر ریبیس است — ادغام/انتخاب بین دو پیاده‌سازی با ناظر |
| 2 | Database Engineering | Arena 1 | ✅ | High | Wave -1 برای کشف کامل؛ Wave 1 برای PG-only شدن تولید | docs/DATABASE_ARCHITECTURE.md؛ migrations/؛ tests/db-engineering.js |
| 3 | Query و Performance [P0] | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2 | در انتظار شروع |
| 4 | Sync / A01 | Arena 3 | 🟡 | High | Wave 1/2/5 | فاز ۴ همگام‌سازی با PR #71 (`e5c9b27`) مرج شد: backpressure، فشرده‌سازی delta، cursor warmup پایدار، sync metrics و cursor چندمنطقه‌ای؛ `delta-phase4` ‏23/23 و mutation ‏20/20. تکمیل باقی‌ماندهٔ Wave 4 و اجرای ملی هنوز باز است |
| 5 | Authorization و Tenant Isolation [P0] | Arena 2 | ✅ | Critical | Wave -1 و مدل واحد policy | مدل یکتای `server/policy.js` (Sync+REST+PG هم‌قرارداد)؛ `docs/WAVE5_AUTHZ.md` + `docs/AUTHORIZATION_MODEL.md`؛ wave5-authz 37/37، جهش‌ها 5/5، هم‌ارزی 93,024/۰، smoke 547/547، api 7/7 — commits 8472f17..d5230b7 |
| 6 | Redis و Distributed State [P0] | Arena 4 | ⏳ | High | Wave 1 و سیاست production readiness | در انتظار شروع |
| 7 | Offline-first | Arena 3 | ⏳ | Medium | Wave 4/6 | در انتظار شروع |
| 8 | Async Architecture | Arena 4 | ⏳ | Medium | Wave 1/2 و Outbox | در انتظار شروع |
| 9 | Application Performance | Arena 4 | 🟡 | High | Wave 3 و baseline عملکرد (Part 2/3 ✅) | شروع شد: heavy worker برایِ persist/backup/report + ممیزیِ پس‌زمینه + L1 محدود + کشِ استاتیک (docs/WAVE9_PERFORMANCE.md؛ tests/wave9-performance.js ‏39/39؛ بلاکِ event-loop بکاپ ~۴۶ms→۰٫۶ms). باقی‌مانده: ایندکسِ مسیرهای فیلترِ O(n) (وابسته به Wave 1) |
| 10 | Database Scale | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2/3 و benchmark | در انتظار شروع |
| 11 | Cache | Arena 4 | ⏳ | Medium | Wave 3/6 و benchmark | در انتظار شروع |
| 12 | Network / Edge | Arena 4 | ✅ | Medium | استقرار production و TLS/CDN/WAF | PR #43 مرج شد (463233c): بلاک‌های لبه nginx + اسناد CDN/WAF + ci/pending CodeQL + wave12 24/24 و جهش 5/5؛ رفعِ braceِ رگکس‌های map در nginx -t رانر؛ باقی‌مانده: اِعمال پچ CodeQL با توکن workflow |
| 13 | Security Program | Arena 2 + Arena 5 | ⏳ | Critical | Wave 5 و threat model | در انتظار شروع |
| 14 | Observability | Arena 4 + Arena 5 | 🟡 | High | Wave -1 و deployment model | فاز۱ tracing مرج (PR #22) + فاز۲ استقرارِ زنده: metrics.js (exporter بدونِ وابستگی، ۵۵/۵۵ config + ۳۰/۳۰ dashboards + جهش ۶/۶)، استک compose (Prometheus/Grafana/Alertmanager/Loki/Promtail/OTel/Jaeger)، ۷ قانونِ بحرانی + داشبوردها؛ **پی‌آر #۵۱ (رصدپذیری) مرج شد (2026-09-10، بستهٔ هفت‌گانه @ cd484c3)** — اجرایِ واقعیِ compose/تستِ webhook روی میزبان باقی |
| 15 | Health / Deployment | Arena 4 | 🟡 | High | Wave 14 و stateless API | شروع شد: **پی‌آر #۳۱ (شاخص سلامت مدرسه، بند ج.۱) مرج شد (2026-09-10 @ cd484c3)** — `GET /api/health-index` فقط-سوپرادمین، امتیاز ۰–۱۰۰ + رنگ + دلیل (`docs/HEALTH_INDEX_MODULE.md`)؛ استقرار/دیپلوی باقی |
| 16 | Disaster Recovery | Arena 4 + Arena 5 | 🟡 | Critical | Wave 10/15 و RPO/RTO | P0#3 زیرساخت-as-Code+Runbook آماده (infra/postgres HA، infra/redis sentinel، tools/pitr-*/failover-*، docs/DR_RUNBOOK.md با RPO/RTO مصوب RELIABILITY_DR_PLAN؛ تست 92/92 + 38/38 + جهش 7/7)؛ **پی‌آر #۴۶ (بستهٔ موج‌های ۱۴/۱۶/۱۷/۱۸) مرج شد (2026-09-10 @ cd484c3)** — اجرای مانور روی استیجینگ باقی |
| 17 | Testing Pyramid | Arena 5 | 🟡 | High | همه Waveها | شروع شد: **پی‌آر #۴۶ مرج شد (2026-09-10 @ cd484c3)** — سوئیت‌های موج‌های ۳/۶/۷/۱۸/۱۹ روی `main` (`tests/wave3-keyset.js`، `wave6-redis.js`، `wave7-offline-queue.js`، `wave18-load-test.js`، `wave18w19-multinode-live.js`، `wave19-chaos.js` + `tools/chaos-test.sh`/`dast-live.sh`)؛ **PR #77 (A11y Keyboard Navigation) در 2026-09-11 مرج شد (`2c7097d`)** و `a11y-keyboard` ‏92/92 + `a11y-regressions` ‏46/46 را افزود؛ **زیرساختِ نگهداریِ خودِ مستندات اضافه شد (2026-09-12، `tools/docs-stats-sync.js`):** شمارِ تست‌ها و اسناد دیگر دستی نوشته نمی‌شود — ابزار از دیسک می‌سازدشان و `--check` کهنه‌بودن را با exit 1 گزارش می‌کند؛ سه تستِ `docs-metrics`/`documentation-map-coverage`/`test-coverage-report-coverage` که با هر سند یا تستِ تازه قرمز می‌شدند، اکنون با یک دستور همگام می‌مانند؛ **بدهیِ مستندات جغجغه‌ای شد (2026-09-12، `tools/docs-refs-check.js`):** ارجاعِ سند به فایلِ ناموجود دیگر بی‌صدا نمی‌ماند — ۱۱۸ موردِ تاریخی در `tools/docs-refs-baseline.json` قفل شد و فقط ارجاعِ **تازه** گیت را قرمز می‌کند (`tests/docs-refs-check.js` ‏۱۹/۱۹)؛ **مهاجرتِ ۰۰۸ (موج ۲۳)** که ردیفِ §۸ راهنما و پینِ `docs-consistency-check.sh` را کهنه کرده بود رفع و آن پین‌ها از دیسک مشتق شد؛ سنجهٔ `a11y-regressions` از متنِ سورس به **رفتاری** تبدیل شد (۴۵/۱ → ۵۴/۵۴، پنج جهش کشته شد)؛ تکمیل هرم باقی |
| 18 | National Load Testing | Arena 5 + Arena 4 | 🟡 | High | Capacity Model (✅ `docs/CAPACITY_MODEL.md` — چت ۶)، Wave 3/10/14 | شروع شد: **پی‌آر #۴۶ مرج شد (2026-09-10 @ cd484c3)** — مولد دیتاست ملی `tools/generate-national-dataset.js` + `tests/wave18-load-test.js` ‏38/38 روی `main`؛ ⚠️ واگرایی ابعاد مولد با §۲.۱ طرح بار همچنان باز (قلم ۲ `docs/DOCS_CONSISTENCY_REPORT.md`)؛ اجرای رسمی منوط به استیجینگ |
| 19 | Chaos / Failure Testing | Arena 5 + Arena 4 | 🟡 | Critical | Wave 15/16 و Observability | PR #78 (WAL disk-full drill) در 2026-09-11 با merge commit `94d3ac2` مرج شد؛ `docs/WAVE19_WAL_DRILL_REPORT.md` و زیرساخت/هارنس افزوده شد؛ static gate ‏7/7 و mutation ‏2/2؛ اجرای زندهٔ مستقل در این sandbox به PostgreSQL 17 و root/tmpfs نیاز داشت و NOT-RUN ماند |
| 20 | چهار Arena + Arena پنجم | همه Arenaها | ⏳ | Medium | Addendum اعمال‌شده | Arena 5 ثبت شد؛ تقسیم مالکیت به‌روز شد |
| 23 | سیستم گزارش‌دهی پیشرفته | چت ۳ | ✅ | Medium | مدل‌های موجود grades/attendance/tuitions + زیرساخت CSV (۳۷) و چاپ A4 (۳۳) + صف آفلاین | **PR [#88](https://github.com/rezaa2544/p2/pull/88) مرج شد (2026-09-12 @ `0a45c13`؛ ⚠️ CI به‌دلیل انسداد بیلینگ گیت‌هاب اجرا نشد — ۳ تلاش/صفر step؛ به‌جای آن همهٔ گیت‌ها محلی روی head سبز شدند، سند: `docs/WAVE23_IMPLEMENTATION_REPORT.md`)**: چهار endpoint `/api/v1/reports/*` (`server/routes/reports.js`) با مهار اجاره‌ای fail-closed؛ مجموعهٔ همگام‌شوندهٔ `report_logs` (model+write-perms+EO_SCOPE_GATED+schema+migration 008±down)؛ صفحهٔ `reports` (`src/js/77-reports.js`) با ۴ تب و خروجی CSV/چاپ A4؛ ۳۵ تست تازه (`tests/reports-{basic,tenant-isolation,offline,export}.js` — شامل PDF واقعی با playwright)؛ سند `docs/REPORTING_SYSTEM_GUIDE.md`؛ گیت‌ها: run 35/35، smoke 547/547 |
| 21 | پشتیبانی از مدارس روستایی و چندپایه | چت ۳ | ✅ | Medium | مدلِ موجودِ has_multigrade/c.multigrade + لایهٔ پیش‌نویسِ حضور (دور ۴۲/۷۷) | **PR [#85](https://github.com/rezaa2544/p2/pull/85) مرج شد (2026-09-11 @ `d1a0bf2`، هر ۷ چک CI سبز)**: نمای ماتریسی `multigrade` (سطر=دانش‌آموز، ستون=پایه) برای حضور (حاضر/غایب/مرخصی + ثبتِ گروهیِ هر پایه با یک ضربه + فیلتر پایه + وضعیت فعلی) و نمرهٔ گروهی؛ Offline-First حفظ شد (پیش‌نویسِ Store + att-review→att-commit؛ نمره از insert→صف)؛ `src/js/76-multigrade.js` + `docs/MULTI_GRADE_GUIDE.md`؛ `tests/multi-grade.js` ‏34/34 + mutation ×۳؛ گیت‌ها: smoke ‏547/547، check-authz تطبیق کامل، secret-scan ‏11/11، a11y-keyboard ‏92/92، build --check سبز |

## بندهای ادغام‌شده در بستهٔ هفت‌گانه (2026-09-10 @ cd484c3)

> هفت پی‌آر تیمی در `main` مرج شدند؛ بندهای زیر «موج» نیستند ولی در نقشهٔ ملی
> اثر دارند. مرجع جزئیات فنی: پیوست `docs/ROADMAP.md` + سند هر بند.

| بند | موضوع | پی‌آر | سند | وضعیت ادغام |
|---|---|---|---|---|
| ب.۳ | ارزشیابی ناشناس معلم | #۳۵ | پیوست `docs/ROADMAP.md` بخش آ | ✅ مرج |
| د.۲ | کارت امتیازی منطقه (۵ بعد + CSV) | #۳۵ | پیوست `docs/ROADMAP.md` بخش آ | ✅ مرج |
| د.۳ | اطلاعیه فوری/بحرانی اداره (`severity`+`office_id`) | #۳۵ | پیوست `docs/ROADMAP.md` بخش آ | ✅ مرج |
| د.۴ | نمای کمبود نیروی انسانی (جدول `staff_posts`) | #۳۵ | پیوست `docs/ROADMAP.md` بخش آ | ✅ مرج |
| ج.۱ | شاخص سلامت مدرسه (فقط-سوپرادمین) | #۳۱ | `docs/HEALTH_INDEX_MODULE.md` | ✅ مرج |
| ئ.۲ | کارآموزی هنرستان (روی جدول `internships`) | #۳۴ | `docs/INTERNSHIP_MODULE.md` | ✅ مرج |
| ئ.۳ | گیمیفیکیشن رفتاری دبستان (روی `discipline`+`dojo_types`) | #۳۳ | `docs/BEHAVIOR_GAMIFICATION.md` | ✅ مرج |
| ئ.۵ | اموال | #۳۲ | — (سندش در اسنپ‌شات محلی نیست؛ تأیید از ابلاغ تیمی) | ✅ مرج |
| ویو ۱۴/۱۶/۱۷/۱۸ | بستهٔ موج‌ها (رصد/بازیابی/هرم تست/بار ملی) | #۴۶ | ردیف‌های ۱۴–۱۸ جدول بالا | ✅ مرج |
| رصدپذیری | تکمیل کد رصد (مکمل ویو ۱۴) | #۵۱ | `docs/OBSERVABILITY.md` | ✅ مرج |

**قید صداقت:** شش پی‌آر از هفت‌گانه (همه جز #۳۱) پس از اسنپ‌شات محلیِ `origin/main`
مرج شده‌اند و کدشان در این کلون نیست؛ وضعیت‌های بالا از ابلاغ تیمی و آثار موجود در
اسنپ‌شات (اسناد بندها + پیوست نقشه) گرفته شده، نه از وارسی کدِ آن پی‌آرها.

## Arenaها

| Arena | مالکیت | وضعیت | توضیح | Evidence |
|---|---|---|---|---|
| Arena 1 — Database/Core | PostgreSQL، schema، migrations، queries، indexes، transactions، OCC | 🟡 | Wave 2 کامل؛ Wave 1/3/10 باقی | `docs/DATABASE_ARCHITECTURE.md` |
| Arena 2 — Security | Auth، RBAC، Tenant isolation، session، rate limiting، security tests | 🟡 | Wave 5 کامل (ویو ۵)؛ Wave 13 باقی | `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` |
| Arena 3 — Sync/Offline | A01، Pull/Push، tombstone، cursor، offline queue، conflict resolution، IndexedDB | ⏳ | منتظر Wave 4/7 | `docs/ROADMAP.md` |
| Arena 4 — Performance/Infra | Redis، cache، workers، observability، load tests، deployment | ⏳ | منتظر Wave 6/8/9/14/15 | `docs/ROADMAP.md` |
| Arena 5 — QA / Reliability Engineering | Test Strategy، Regression، Load/Stress/Spike/Soak/Chaos، Recovery Validation، Release Gate | 🟡 | Wave 20 مرج شد (351bd10)؛ مالک quality gate همهٔ Waves (فعال) | `docs/ARENA5_QA_RELIABILITY.md` |

## راهنمای وضعیت

- ⏳ در انتظار شروع
- 🟡 در حال انجام
- ✅ کامل
- 🔴 مسدود/نیازمند تصمیم

## قرارداد به‌روزرسانی

پس از هر task مرتبط با یک Wave، همین فایل باید با وضعیت جدید، Owner، Risk، Dependency، Evidence، خلاصه اثر معماری/دیتابیس/امنیت/کارایی و لینک commit/PR به‌روز شود.
