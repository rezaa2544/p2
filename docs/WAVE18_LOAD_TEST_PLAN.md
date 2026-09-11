# Wave 18 — طرح تست بار ملی (10 میلیون کاربر)

_چت ۳ — ۲۰/۰۶/۱۴۵ (2026-09-09) — مکملِ `docs/LOAD_TESTING_PLAN.md` (طرحِ پایهٔ فاز ۵: ابزار، SLO، مقیاس‌های پله‌پله) — این سند: **دادهٔ آزمایشیِ مقیاسِ ملی + چهار سناریویِ اجرایی + نقشهٔ راهِ اجرا**_

---

## ۱. دادهٔ آزمایشیِ ملی — `tools/generate-national-dataset.js`

ابزارِ تازهٔ این موج؛ فقط-stdlib، **قطعی** (seed ⇒ بایت-به-بایت تکرارپذیر) و **پخش‌شده** (حافظهٔ ثابت ~50MB).

> ⚠️ **یادداشت هماهنگی (ممیزی ۲۰۲۶-۰۹-۱۰):** ابعاد جدول زیر با ابعاد مصوب
> `docs/LOAD_TEST_PLAN.md` §۲.۱ (مشتق از مدل ظرفیت) **یکسان نیست** — تفاوت‌ها:
> کلاس‌ها 1,000,000 در برابر ۲۱۴ هزار؛ دانش‌آموزان 8,000,000 در برابر ≈۷.۵ میلیون؛
> اولیا 900,000 در برابر ≈۱.۸ میلیون؛ نمره‌ها 20,000,000 در برابر ۲۸۸ میلیون.
> مرجع رسمی، طرح بار ملی است؛ هم‌ترازسازی مولد در `docs/DOCS_CONSISTENCY_REPORT.md`
> ثبت شده است.

### مقیاس و نسبت‌ها (بر اساسِ الگویِ واقعیِ ایران)

| مجموعه | تعداد (scale=1) | مبنایِ نسبت |
|---|---:|---|
| schools | **100,000** | ≈ تعدادِ واقعیِ مدارسِ کشور |
| classes | **1,000,000** | 10 کلاس در هر مدرسه |
| users | **10,000,000** | تفکیکِ زیر |
| — students | 8,000,000 | 80 دانش‌آموز در هر مدرسه (≈ میانگینِ واقعیِ ایران) |
| — teachers | 1,000,000 | 1 کلاس‌سرپرست در هر کلاس |
| — parents | 900,000 | ≈ 11٪ فعال‌سازیِ پنلِ اولیا در سالِ اول (محافظه‌کارانه) |
| — admins | 99,900 | مدیر + معاون در هر مدرسه |
| — edu_office | 99 | اداراتِ کل/شهرستان/منطقه |
| — superadmin | 1 | |
| attendance | **50,000,000** | 6 روزِ مدرسه + ۲۵٪ دانش‌آموزان یک روزِ بیشتر (میانگین 6.25) |
| grades | **20,000,000** | 2 آزمون + 50٪ دانش‌آموزان یک آزمونِ بیشتر (میانگین 2.5) |
| parent_links | 900,000 | 1 پیوند در هر ولی |

**واقع‌گرایی و امنیت:** 31 استانِ واقعی (نام)، تلفن‌هایِ 09…، شناسهٔ ملی با **رقمِ کنترلِ معتبر** (الگوریتمِ رسمی) — همه **مصنوعی و تکرارناپذیر** (تابعِ دو-یک-یک از id)؛ هیچ فردِ واقعی در داده نیست.

### استفاده

```bash
node tools/generate-national-dataset.js --plan                          # فقط جدولِ مقیاسِ ملی
node tools/generate-national-dataset.js --scale 1 --out data/national/full   # مقیاسِ کامل (~10GB، ~3 دقیقه)
node tools/generate-national-dataset.js --scale 0.001 --out /tmp/w18   # ~10 هزار کاربر (CI/dev، زیر 1s)
```

خروجی: 6 فایلِ CSV (PG COPY-ready + قابل‌خوانشِ مستقیم در k6) + `stats.json` (تعدادها + **sha256** هر فایل) + `README.md` (دستورالعملِ بارگذاری).

### بارگذاری در PostgreSQL

```bash
\copy users (id,role,full_name,username,national_id,phone,active,school_id,subject_id,job)
  FROM 'users.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
# + schools/classes/parent_links/attendance/grades — دستوراتِ کامل در READMEِ خروجی
```

بعد از COPY: `ANALYZE` روی همهٔ جداول (planner) + بررسیِ `EXPLAIN ANALYZE` برایِ کوئری‌هایِ bootstrap (بندِ سناریویِ ۲).

---

## ۲. چهار سناریویِ الزامی (مطابقت با اسکریپت‌هایِ k6 موجود)

زیرساختِ k6 از فاز ۵ حاضر است: `tests/performance/scenarios/01..06` (ورود، bootstrap، حضور، نمره، اعلان، sync) + `suites/` + `config/thresholds.json` (SLOها) + `config/environments.json` (local/staging/production/cluster) + `run-benchmarks.sh`.

### سناریویِ ۱ — بار عادی (ورود و استفادهٔ روزانه)

| پارامتر | مقدار |
|---|---|
| اسکریپت‌ها | `scenarios/01-login.js` + `02-bootstrap.js` + `03-attendance.js` (ترکیبِ وزنی: 40/40/20) |
| VUs / RPS | 100,000 VUs ≈ 15,000 RPS (مرحلهٔ ۲ِ LOAD_TESTING_PLAN §4) |
| مدت | 45 دقیقه (ثابت) |
| داده | نمونهٔ 100k کاربر از `users.csv` در fixtures |
| SLO | `thresholds.json` → login p95<150ms، bootstrap p95<180ms، attendance p95<250ms، error<1٪ |
| معیارِ قبولی | همهٔ SLOها در **میانگینِ ۳ اجرا** — بدونِ degradationِ تدریجی در طولِ 45 دقیقه |

### سناریویِ ۲ — بار اوج (شروع سال تحصیلی — جهشِ اول مهر)

| پارامتر | مقدار |
|---|---|
| اسکریپت | `suites/spike-mehr-test.js` (رamping-vus: 15 → **150 VU در 15 ثانیه** — جهش ۱۰ برابر) |
| داده | bootstrapِ 10k کلاسِ تازه (دادهٔ classes/schools از dataset) |
| SLO | در اوجِ ضربه: error < 0.1٪، p95 < 500ms |
| معیارِ قبولی | **بدونِ collapse**: پیکِ p95 کمتر از 3 برابرِ خطِ پایه؛ بازگشت به پایدار در < 2 دقیقه؛ صفرِ 5xxِ حاشیه‌ای (circuit-break) |

### سناریویِ ۳ — فشار (افزایش تدریجی تا نقطهٔ شکست — Saturation)

| پارامتر | مقدار |
|---|---|
| اسکریپت | `suites/saturation-test.js` |
| روش | پلهٔ 20٪ هر 5 دقیقه (از 15k تا 650k RPS) تا یکی از guardrailها بشکند |
| Guardrailها | p95 > 1200ms **یا** error > 5٪ **یا** CPU > 90٪ |
| داده | dataset کامل (10M users / 50M attendance) در PG + کلاستر Redis |
| خروجیِ الزامی | **نقطهٔ شکستِ سنجیده** (RPS شکست + first-failing SLO + پروفایلِ bottleneck: CPU/PG-pool/Redis/درام) + رفتارِ Graceful (Wave 15: در فشار، readiness 503 شود نه کرش) |

### سناریویِ ۴ — چند روزه (Soak 24h — کشف نشت حافظه)

| پارامتر | مقدار |
|---|---|
| اسکریپت | `suites/soak-24h-test.js` |
| بار | 60٪ از خطِ پایهٔ سناریویِ ۱ (ثابت، 24 ساعت) |
| پایش | heap/RSS هر نمونه (prometheus/Grafana) + cache-hit + PG pool idle + Redis memory + L1 cache size (Wave 11: سقف LRU) |
| SLO | error < 0.1٪، p95 < 200ms در **تمامِ بازه** |
| معیارِ قبولی (نشت) | روندِ heap در 6 ساعتِ آخر: **شیب ≈ صفر** (regression < 2٪/ساعت)؛ RSS پایدار؛ `cache_l1` زیرِ سقف؛ `queue.in_flight` بازگشت به صفر در دره‌های ترافیک |

---

## ۳. SLOهای مرجع (از `thresholds.json` + LOAD_TESTING_PLAN §5)

| شاخص | آستانه | در کدام سناریو سخت‌تر می‌شود |
|---|---|---|
| خوانش‌ها p95 | < 300ms (global < 250) | — |
| نوشت‌ها p95 | < 500ms | spike: اوج ضربه |
| p99 | < 1200ms | saturation: guardrailِ شکست |
| error rate | < 0.1٪ | soak: کلِ 24h |
| cache hit | > 80٪ | همه (به‌خصوص bootstrap — Wave 11) |
| نشت حافظه | صفر (پایدار) | soak |

## ۴. نقشهٔ راهِ اجرا (از کوچک به ملی)

```
[مرحلهٔ ۰ — همین ساندباکس] ✅ انجام‌شده در این موج
   تولیدِ داده (scale کوچک برای CI) + طراحیِ سناریوها + اعتبارسنجیِ ابزار
        │
[مرحلهٔ ۱ — staging]  ⏳ در انتظار
   dataset scale=0.001 (10k کاربر) → PG تک‌نود → کالibratingِ SLOها
   (کالیبراسیون: SLOها روی latencyِ واقعیِ شبکهٔ staging تنظیم می‌شوند)
        │
[مرحلهٔ ۲ — کلاستر]  ⏳ در انتظار
   dataset scale=1 (10M/50M/20M) → PG کلاستر + Redis کلاستر
   → سناریوهای ۱ و ۲ → سپس ۳ (نقطهٔ شکست)
        │
[مرحلهٔ ۳ — soak ملی]  ⏳ در انتظار
   سناریوی ۴ (24h) روی همان کلاستر + پایشِ نشت
```

**ابزارِ اجرای k6:** `k6 run --env BASE_URL=https://staging.payesh.ir <script>` (on-prem) یا k6 Cloud (VUs > 50k). برایِ مقیاسِ ملی: `k6 scale` multi-region یا کلاسترِ k6.

## ۵. وضعیتِ «در انتظار» (نکتهٔ صادقانه)

اجرای **واقعی** تستِ بارِ ملی نیازمندِ زیرساختِ زنده است که در این ساندباکس نیست:

- ❌ PostgreSQL زنده (datasetِ ~10GB لود نشده)
- ❌ Redis cluster زنده
- ❌ کلاسترِ k6 / k6 Cloud
- ❌ k6 binary (در ساندباکس نصب نیست — اسکریپت‌ها در CI/کلاستر اجرا می‌شوند)

**بنابراین در این موج:** ابزارِ تولیدِ داده + طراحیِ چهار سناریو + اعتبارسنجیِ خودکارِ زیرساخت (tests/wave18-load-test.js) **کامل شد**؛ اجراهایِ مرحلهٔ ۱-۳ **در انتظارِ زیرساخت** ثبت شدند. چک‌لیستِ شروعِ مرحلهٔ ۱: dataset scale=0.001 تولید، PG با migrations، `run-benchmarks.sh` روی staging.

## ۶. تست‌هایِ این موج — `tests/wave18-load-test.js`

| # | بررسی |
|---|---|
| T1 | ابزار وجود دارد + `--help` سالم |
| T2 | `--plan` اعدادِ دقیقِ ملی (10M/100k/1M/50M/20M) |
| T3 | تولیدِ مقیاسِ کوچک: فایل‌ها/`stats.json` سازگار، شمارهٔ ملی معتبر (رقمِ کنترل)، تلفن 12 رقمی، نیدهای تکرارناپذیر، FKهایِ homeroom/student/teacher، دامنهٔ وضعیت‌هایِ حضور |
| T4 | قطعی بودن: دو اجرا = sha256 یکسان |
| T5 | زیرساختِ k6: 6 سناریو + 4 سوئیت + helpers + config (thresholds/environments) + runner |
| T6 | مستندات: LOAD_TESTING_PLAN + این سند (چهار سناریو + ارجاع‌ها + pending) |
| T7 | READMEِ خروجی: PG COPY + k6 + هشدارِ امنیتی + sha256 در stats |
