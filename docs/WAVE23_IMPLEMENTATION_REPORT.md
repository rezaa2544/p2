# 📑 گزارش پیاده‌سازی ویو ۲۳ — سیستم گزارش‌دهی پیشرفته (چت ۳)

**تاریخ:** 2026-09-12 · **شاخه:** `feat/wave23-advanced-reporting` (پایه `main@9e7da2c`)
**PR:** [#88](https://github.com/rezaa2544/p2/pull/88) — **مرج شد @ `0a45c13` (2026-09-12)**
**وضعیت:** پیاده‌سازی کامل ✅ · گیت‌های محلی همه سبز ✅ (دو بار: پیش و پس از push، روی همان head) ·
CI اجرا نشد — انسداد **بیلینگ گیت‌هاب** (۳ تلاش، صفر step؛ §۵) · merge بدون چک انجام شد چون
مخزن branch protection ندارد و شکست CI ربطی به کد نداشت

---

## ۱) خلاصهٔ تحویل

هر شش مرحلهٔ بریف اجرا شد، هر مرحله یک کامیت مستقل:

| # | کامیت | مرحله | محتوا |
|---|---|---|---|
| ۱ | `f303687` | APIها | `server/routes/reports.js` — ۴ endpoint فقط‌خواندنی `/api/v1/reports/{attendance,academic,finance,teachers}` |
| ۲ | `8244fb3` | مدل/آفلاین | مجموعهٔ همگام‌شوندهٔ `report_logs`: model + write-perms + `EO_SCOPE_GATED` + demo-db + `schema.sql` + **migration 008** (±down) |
| ۳ | `c5f2594` | UI + خروجی | `src/js/77-reports.js` — روت `reports` با ۴ تب، CSV، چاپ A4، ثبت ژورنال آفلاین |
| ۴ | `44e36b5` | تست‌ها | ۴ سوئیت / ۳۵ تست: basic ۹ · tenant-isolation ۱۱ · offline ۱۰ · export ۵ |
| ۵ | `7f2cb68` | اسناد | `docs/REPORTING_SYSTEM_GUIDE.md` + `NATIONAL_ARCHITECTURE.md` §۵ + roadmap + HANDOFF |

## ۲) چهار گزارش

1. **حضور و غیاب ماهانه** — per-class، ماه شمسی (jy/jm)، نرخ حضور؛ CSV + چاپ A4.
2. **پیشرفت تحصیلی** — میانگین نرمال‌شده بر ۲۰، نرخ قبولی، روند ترمی، توصیه‌های
   قاعده‌محور (شفاف/قابل‌آزمون)؛ counselor هم در لایهٔ API مجاز.
3. **مالی مدارس شهریه‌دار** (شاهد/غیرانتفاعی/…) — شهریه/تخفیف/اقساط (معوق‌سنجی)/
   بورسیه/نرخ وصول؛ فقط `hasCap('has_tuition')`؛ درخواست صریحِ بدون‌شهریه = 400.
4. **عملکرد معلمان** — حضور کادر + جانشینی (ماهانه) + دوره‌های ضمن خدمت (تجمیعی).

## ۳) معماری کلیدی

- **مهار اجاره‌ای fail-closed در هر دو لایه:** superadmin آزاد؛ manager/counselor
  فقط مدرسهٔ خود؛ edu_office فقط هندسهٔ اداره (`policy.officeCoversSchool`)؛
  درخواست برون‌دامنه = **403، نه لیست خالی**؛ سایر نقش‌ها 403.
- **آفلاین‌اول واقعی:** تجمیع کلاینت آینهٔ سرور است و روی `db` محلی بدون شبکه
  اجرا می‌شود؛ هر خروجی‌گیری (CSV/چاپ) ردیف `report_logs` می‌سازد که از
  `insert→applyOp→enqueueOp` وارد صف sync شده و آنلاین‌شدن خودکار می‌بَرَدش.
  تأیید عملی: op صف‌شده `{t:'ins', c:'report_logs', …}` در JSDOM آفلاین.
- **`financial_profiles` وجود نداشت** — بریف به دادهٔ مالی موجود
  (`tuitions/installments/scholarships`) نگاشت شد (راهنما §۷).
- **`report_logs` عضو `EO_SCOPE_GATED`** شد (نوشتنِ اداره = مهار هندسی) —
  invariant آزمون T15 حفظ و جهش‌بان دوم در سوئیت tenant-isolation اضافه شد.

## ۴) نتیجهٔ گیت‌ها (محلی، همین سشن)

| گیت | نتیجه |
|---|---|
| tests/run.js | **35/35 ✅** |
| tests/smoke.js | **547 ✅ / 0 ❌** (NAV_EXPECT سه نقش به‌روز شد) |
| build --check | ✅ بیت‌به‌بیت |
| tools/check-authz | ✅ تطبیق کامل |
| tests/wave5-authz | **37/37 ✅** (T15 با report_logs) |
| tests/db-engineering | **14/14 ✅** (migration 008 پیوسته + down) |
| tests/data-dictionary-coverage | **30/30 ✅** |
| tests/secret-scan | **11/11 ✅** |
| tests/a11y-keyboard | **«جمع: 92 قبول، 0 رد» ✅** (خط شمارش، نه exit code) |
| tests/multi-grade (رگرسیون ویو ۲۱) | **34/34 ✅** |
| tests/reports-basic | **9/9 ✅** |
| tests/reports-tenant-isolation | **11/11 ✅** |
| tests/reports-offline | **10/10 ✅** |
| tests/reports-export | **5/5 ✅** — شامل تولید **PDF واقعی با playwright+chromium** (امضای `%PDF-` وارسی شد) |
| tests/authz-model | ۲۵۵ سبز / **۱ قرمزِ pre-existing** (`t_depth` از `wave14-observability.js` — روی baseline قبل از تغییرات هم قرمز بود؛ بی‌ربط به این ویو) |

**قید صداقت (سبز جعلی ممنوع):** playwright و chromium در این سشن با موفقیت نصب
شدند و تست PDF واقعاً اجرا شد. اگر در محیط دیگری playwright نباشد،
`reports-export.js` به‌جای سبزِ ساختگی، `SKIP` صریح چاپ می‌کند.

## ۵) وضعیت CI — 🔴 مسدودِ بیلینگ (خارج از کد)

هر ۷ چکِ PR #88 با این پیام رسمی گیت‌هاب شکست:

> "The job was not started because recent account payments have failed or
> your spending limit needs to be increased. Please check the 'Billing &
> plans' section in your settings"

- هر دو run (Node.js CI و Security Program) روی `7f2cb68` با **صفر step
  اجراشده** failed شدند؛ rerun هم همان نتیجه را داد (attempt 2، صفر step).
- شاهد مقایسه‌ای: همین دو workflow روی `6ab013c` (دیروز، همین شاخه) **success**
  بودند — یعنی مشکل از دیروز تا امروز در حساب صاحب مخزن رخ داده، نه در کد.
- **اقدام لازم از صاحب مخزن (rezaa2544):** Settings → Billing & plans →
  پرداخت ناموفق/سقف هزینه را اصلاح کند، سپس روی PR #88 «Re-run all jobs».
  کد تغییری لازم ندارد.

## ۶) ruflo

طبق تصمیم قبلی نصب نشد (OOM 137 — تلاش مجدد ممنوع در دفترچه). این سشن بدون آن اجرا شد.

## ۷) نتیجهٔ نهایی و گام بعد

- **merge انجام شد:** PR #88 → `main@0a45c13` (2026-09-12). پیش از merge، همهٔ
  گیت‌ها یک‌بار دیگر محلی روی همان head (`3756d97`) اجرا و سبز شدند (جدول §۴).
- ردیف Wave 23 در `NATIONAL_ROADMAP_PROGRESS.md` = ✅ (با ثبت صریح ماجرای CI).
- **تنها کار باقی‌مانده (صاحب مخزن):** اصلاح Billing & plans در حساب rezaa2544؛
  اولین push یا re-run بعدی روی `main` سبزِ رسمی CI را روی `0a45c13` ثبت می‌کند.
