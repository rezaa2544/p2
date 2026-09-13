# 📑 راهنمای سیستم گزارش‌دهی پیشرفته — ویو ۲۳

> چهار گزارش استاندارد وزارتی با خروجی CSV/چاپ‌A4(PDF)، آفلاین‌اول، با مهار
> اجاره‌ای دو‌لایه (سرور + کلاینت). این سند مرجع فنی و کاربری ماژول است.

## ۱. چهار گزارش

| # | گزارش | داده‌های منبع | بازه | نقش‌های مجاز |
|---|---|---|---|---|
| ۱ | حضور و غیاب ماهانه | `attendance` + `classes` | ماه شمسی (jy/jm) | manager / edu_office / superadmin |
| ۲ | پیشرفت تحصیلی | `grades` (نرمال‌شده بر ۲۰) | کل یا ترم (`term`) | manager / **counselor** / edu_office / superadmin |
| ۳ | مالی مدارس شهریه‌دار | `tuitions` + `installments` + `scholarships` | کل داده | manager / edu_office / superadmin |
| ۴ | عملکرد معلمان | `staff_attendance` + `substitutions` + `training_courses` | ماه شمسی | manager / edu_office / superadmin |

نکته‌ها:

- **گزارش مالی فقط برای مدارس شهریه‌دار** است: `hasCap(schoolId,'has_tuition')`
  (پیش‌فرضِ نوع‌های شاهد/غیرانتفاعی/نمونه/شبانه‌روزی/هنرستان — `09-schools.js`).
  درخواستِ صریح مدرسهٔ بدون شهریه در API پاسخ `400` می‌گیرد تا UI پیام روشن بدهد.
- «مربی تحصیلی» = نقش `counselor`؛ فقط به گزارش پیشرفت تحصیلی (لایهٔ API) دسترسی
  دارد — روتِ UI برای counselor باز نشده (سیاست حداقلیِ منوی مشاور حفظ شد).
- «ناظر منطقه» = نقش `edu_office`؛ دامنه‌اش هندسهٔ ادارهٔ خودش است.
- در گزارش ۲، **توصیه‌ها قاعده‌محورند** (شفاف و قابل آزمون): میانگین مدرسه <۱۰ ⇒
  برنامهٔ تقویتی؛ میانگین کلاس <۱۰ ⇒ کلاس جبرانی؛ نرخ قبولی کلاس <۷۰٪ ⇒ بازبینی
  روش تدریس؛ وگرنه «روند فعلی حفظ شود».
- در گزارش ۴، جانشینی/حضور «ماهانه» و ساعاتِ دوره‌های ضمن خدمت «تجمیع کل» است
  (دورهٔ آموزشی شاخص ماهانه نیست).

## ۲. لایهٔ سرور — `server/routes/reports.js`

چهار endpoint فقط‌خواندنی (GET)، با الگوی factory استاندارد
(`createReportsRoutes(ctx)`) و اتصال در `server/index.js`:

```
GET /api/v1/reports/attendance ?jy=&jm=&school_id=&class_id=
GET /api/v1/reports/academic   ?school_id=&class_id=&term=
GET /api/v1/reports/finance    ?school_id=
GET /api/v1/reports/teachers   ?jy=&jm=&school_id=
```

- `jy/jm` شمسی؛ پیش‌فرض = ماه جاری سرور. `jm` خارج از ۱..۱۲ یا `jy` خارج از
  ۱۳۰۰..۱۵۰۰ ⇒ `400 bad_request`.
- **اعتبارسنجی استاندارد (P2، تکمیل Wave 23):** `school_id`/`class_id` باید
  عددِ صحیحِ مثبت باشند و `term` رشتهٔ چاپیِ ≤۶۰ کاراکتر؛ ورودیِ خراب در **هر ۴**
  endpoint و در **هر دو مسیر** (حافظه/PG) ⇒ `400 bad_request` — نه NaN خاموش،
  نه خطای ۵۰۰ از دیتابیس. parserها: `server/reports-sql.js`
  (`parsePositiveInt`/`parseOptionalPositiveInt`/`validateTerm`/`validateSchoolId`).
- پاسخ: `{ ok, kind, …, schools: [ { school_id, school_name, … } ] }` —
  ساختار دقیق هر گزارش در `tests/reports-basic.js` سندِ اجرایی دارد.
- **حالتِ دوگانه (Wave 23):** با PostgreSQL زنده (`db.isPostgres()`)، **هر
  چهار** گزارش DB-native می‌شوند (تجمیع/صفحه‌بندی در SQL، خواندن از
  `queryRead`)؛ پاسخ `source: 'postgresql'` و `pagination` (keyset،
  ‏`limit`/`cursor`/`next_cursor`/`has_more`) می‌گیرد. بدونِ PG، مسیرِ حافظه
  بایت‌به‌بایت همان است. جزئیات: `docs/WAVE23_DB_NATIVE_REPORTS.md` §۹.
- هر فراخوانی موفق یک رویداد `report_generated` در audit ثبت می‌کند.

### مهار اجاره‌ای (fail-closed)

| نقش | دامنه |
|---|---|
| superadmin | همهٔ مدارس (فیلتر `school_id` آزاد) |
| manager / counselor | فقط `user.school_id` |
| edu_office | فقط مدارسِ هندسهٔ اداره (`policy.officeCoversSchool`) |
| هر نقش دیگر | `403` |

درخواستِ صریح مدرسهٔ خارج از دامنه ⇒ **`403`، نه لیست خالی** (تمایز عمدی:
خالی یعنی «داده نیست»، رد یعنی «حق نداری»).

## ۳. لایهٔ کلاینت — `src/js/77-reports.js`

- روت `reports` («گزارش‌های پیشرفته») در منوی مدیر/اداره/سوپرادمین؛ گیت با
  `canRoute` (خودکار از NAV).
- **آفلاین‌اول**: همهٔ تجمیع‌ها روی `db` محلی انجام می‌شود؛ هیچ فراخوان شبکه‌ای
  ندارد. توابع `rptAttendanceData/rptAcademicData/rptFinanceData/rptTeachersData`
  آینهٔ همان تجمیع‌های سرورند.
- ناوبری ماه شمسی (`toJalali`/`J_MONTHS`)، نمودار درصدی با `bar()`، مبالغ با
  `rial` (فرمت فارسی).

## ۴. خروجی‌ها (Export)

- **CSV**: `rptCsvData()` → `downloadCSV` (BOM `\uFEFF` برای اکسل فارسی) با
  سلول‌های `csvCell` (خنثی‌سازی تزریق فرمول — `=`/`+`/`-`/`@`).
- **چاپ / PDF**: `rptPrint()` → `printableDoc` (پنجرهٔ A4 استاندارد،
  RTL/Vazirmatn، ردیف امضا — همان مسیر رسمی کارنامه/گواهی). جدول‌های عریض
  (>۷ ستون) خودکار landscape می‌شوند. کاربر از پنجرهٔ چاپ، PDF ذخیره می‌کند؛
  تولید PDF بدون مرورگر (playwright) فقط در تست‌هاست.

## ۵. ژورنال آفلاین → همگام‌سازی — مجموعهٔ `report_logs`

هر خروجی‌گیری (CSV یا چاپ) یک ردیف در مجموعهٔ همگام‌شوندهٔ `report_logs`
می‌نویسد که از مسیر عادی `insert → applyOp → enqueueOp` عبور می‌کند و با
برقراری اتصال، خودکار به سرور می‌رسد:

```js
{ school_id, kind: 'attendance|academic|finance|teachers',
  format: 'csv|pdf', status: 'generated', generated_by: '<user id>',
  meta: { jy, jm, term }, created_at }
```

- **مدل مجوز** (`authz/model.json`): ins = manager/counselor/edu_office/
  superadmin؛ upd/del = manager/superadmin.
- نوشتنِ `edu_office` مهار هندسی دارد: `report_logs` عضو `EO_SCOPE_GATED`
  در `server/policy.js` است (آزمون T15 در `tests/wave5-authz.js` این را
  از سورس regex می‌سنجد؛ جهش‌بانِ دوم در `tests/reports-tenant-isolation.js`).
- **PG**: جدول در `server/schema.sql` + مهاجرت `migrations/008_wave23_report_logs.sql`
  (+ `.down.sql`) با ایندکس‌های `school_id` / `created_at DESC` / `updated_at`
  (سطح delta-pull، سیاست 005/006).

## ۶. تست‌ها

| فایل | پوشش | تعداد |
|---|---|---|
| `tests/reports-basic.js` | ساختار پاسخ‌ها + تجمیع در برابر شمارش مستقل + فیلترها + 400 | ۹ |
| `tests/reports-tenant-isolation.js` | 401/403، دامنهٔ مدیر/اداره/سوپرادمین، sync report_logs، جهش‌بان EO_SCOPE_GATED | ۱۱ |
| `tests/reports-offline.js` | JSDOM با fetch قطع: رندر ۴ تب، تجمیع=شمارش مستقل، صف sync، canRoute | ۱۰ |
| `tests/reports-export.js` | CSV (هم‌طولی + ضدتزریق)، سند چاپی A4/RTL، ثبت report_logs، **PDF واقعی با playwright** | ۵ |

اجرا:

```bash
node tests/reports-basic.js
node tests/reports-tenant-isolation.js
node tests/reports-offline.js          # نیازمند jsdom
node tests/reports-export.js           # jsdom + playwright (بدون playwright: SKIP صریح)
```

## ۷. تصمیم‌های طراحی

1. **`financial_profiles` وجود ندارد** — منظورِ بریف همان دادهٔ مالی موجود است:
   `tuitions` + `installments` + `scholarships` (تأیید با بررسی مدل داده).
2. endpoint‌ها **فقط‌خواندنی**‌اند؛ ژورنالِ تولید گزارش از مسیر sync (نه REST)
   می‌آید تا مسیر آفلاین یکتا بماند.
3. تجمیع‌ها **دوبار** پیاده شده‌اند (سرور + کلاینت) — عمدی، برای آفلاین‌اول واقعی؛
   هر دو سو با آزمونِ «تجمیع = شمارش مستقل» قفل شده‌اند تا واگرایی آشکار شود.
4. تبدیل شمسی سمت سرور کپیِ کوچکِ الگوریتم `22-jalali-calendar.js` است
   (سرور به عمد بدون وابستگی به کد کلاینت می‌ماند — الگوی `server/README.md`).
