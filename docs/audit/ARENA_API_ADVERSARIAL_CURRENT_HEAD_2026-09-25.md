# آزمون خصمانهٔ API روی current HEAD

CERTIFIED نیست. ادعای FIXED یک ممیزی دیگر برای A-20 پذیرفته نشد. فقط پاسخ HTTP همین SHA و وضعیت فروشگاه بعد از آن نوشته شده است.

- SHA: `4938631633c9c578db2679905fd46c4daaedd80a`
- سرور: `127.0.0.1:3017` بدون strict، و `127.0.0.1:3018` با `PAYESH_STRICT_BASE_VERSION=1`
- هر دو: فروشگاه JSON، بدون PostgreSQL، `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1`
- `NODE_ENV=production` بالا نیامد. همان بولینی که در production روشن می‌شود با پرچم strict سنجیده شد، نه خودِ فرآیند production
- PII در این گزارش نیست

## موجودی

Dispatcher در `server/index.js` این خانواده‌ها را دارد:

- نشست: `/api/auth/send-code`، `login`، `me`، `logout`، `delete-account`
- فردی: `/api/students/:id`، `/api/v1/students` و `/:id`، `/api/v1/users` و `/:id`
- PATCH/OCC: `PATCH /api/v1/students/:id`، `users/:id`، `classes/:id`، `attendance/:id`، `grades/:id`
- گزارش و تحلیل: چهار گزارش، `public-report`، سیزده analytics قدیمی، هشت semantic analytics
- عملیات: backup، restore، sms، sync، canary، phase5، national از جمله `write-smoothing`
- سطح: health، liveness، readiness، metrics

ماتریس دوازده‌موردی روی 43 route حساس اجرا شد. هر پنج PATCH جداگانه در هر دو حالت سرور زده شد. بقیهٔ analytics/system فقط inventory شدند و دوازده درخواست زنده نگرفتند: **NOT VERIFIED**، نه قبول.

## A-20 — PATCH و OCC

قرارداد A-20: نوشتن بدون `base_version` نباید ویرایشِ تازه‌تر را بی‌صدا له کند، و این رفتار باید روی هر پنج PATCH یکسان باشد.

### حالت strict

| موجودیت | نسخهٔ درست | نسخهٔ کهنه بعد از bump | بدون نسخه | تکرار بدون نسخه |
|---|---:|---:|---:|---:|
| students | 200، version=2 | 409 `conflict` | 400 `missing_base_version` | 400 |
| classes | 200، version=2 | 409 | 400 | 400 |
| attendance | 200، version=2 | 409 | 400 | 400 |
| grades | 200، version=2 | 409 | 400 | 400 |
| users | 409 | 409 | 400 | 400 |

`users` همان رکورد دانش‌آموز را می‌نویسد. PATCH دانش‌آموز قبلاً نسخه را به 2 رسانده بود، پس `base_version: 1` باید 409 می‌شد. این شکستِ happy path نیست.

بعد از suite، فروشگاه strict مقدار نسخهٔ اول را نگه داشت: نام کلاس نسخهٔ A ماند، یادداشت حضور A ماند، نمره 17.5 ماند. مقدار B که بدون نسخه فرستاده شده بود نوشته نشد.

دو PATCH هم‌زمان روی کلاس 2 با یک `base_version`: 200 و 409. هر دو 200 نشدند. این یک تلاش است، نه اثباتِ همهٔ زمان‌بندی‌ها.

نقش دانش‌آموز روی classes/attendance/grades: 403. روی students/users: 409، چون OCC قبل از شاخهٔ نقش اجرا شد و نسخه کهنه بود. نوشتنِ موفق با نقش دانش‌آموز دیده نشد. تکرار با نسخهٔ مطابق، بعد از پر شدن پنجرهٔ OTP، اندازه‌گیری نشد: **NOT VERIFIED**.

مدرسهٔ دیگر: 404. شناسهٔ 99999999: 404. بدون نشست: 401. بدنهٔ `{`: 500 `server_error` روی هر پنج PATCH.

### حالت غیر strict

بدون نسخه، هر پنج مسیر 200 دادند و تکرار هم 200 بود. فروشگاه بعد از آن نسخهٔ B را داشت: نام کلاس `A20-C-B` با version=4، یادداشت حضور `A20-N-B` با version=4، نمره 3.5 با version=4. یعنی نوشتنِ بدون نسخه، نوشتنِ نسخه‌دار قبلی را له کرد.

نسخهٔ کهنه بعد از bump همچنان 409 بود. مسابقهٔ هم‌زمان: 200 و 409.

### جمع A-20

- ناهمگونی grades در برابر چهار مسیر دیگر، زیر پرچم strict، در این اجرا دیده نشد. هر پنج مسیر بدون نسخه 400 شدند.
- له شدنِ نوشتنِ جدید با PATCH بدون نسخه، در حالت پیش‌فرض غیر strict، روی هر پنج موجودیت **REPRODUCED** است.
- این را FIXED یا PASS نمی‌نامم. بستنِ A-20 به روشن بودنِ همان predicate وابسته است. بوت production خودش اجرا نشد.

## نقص‌های دیگر، با درخواست واقعی

### توکن نشست در bootstrap

- Request: `GET /api/v1/bootstrap` با نشست دانش‌آموز
- Expected: بدنه توکن HttpOnly را تکرار نکند
- Actual: 200 و `user.token` یک JWT سه‌بخشی بود. همان مقدار به‌عنوان کوکی روی `GET /api/auth/me` گذاشته شد و 200 با نقش student برگشت
- Root cause: شیء نشست، که توکن خام را دارد، به `projectUserByRole(..., true)` داده می‌شود و آن تابع جز `password` همه‌چیز را کپی می‌کند
- Regression: بازاستفادهٔ توکن 200 بود
- وضعیت: **REPRODUCED**

### JSON نامعتبر → 500

- Request: `POST` با بدنهٔ `{`
- Expected: 400
- Actual: `/api/sync`، `/api/sync/resolve-conflict`، `/api/admin/restore`، `/api/sms/send`، canary، pilot-approval، change-request و rollback حتی در ماتریس 500 `server_error` دادند. `/api/v1/students` بدون نشست 401 و با نشست 500، و تکرار هم 500. هر پنج PATCH هم با `{` مقدار 500 دادند
- Root cause: `readBody` خطای `bad_json` می‌دهد و catch بیرونی فقط `too_large` را به 413 تبدیل می‌کند
- Regression: تکرار 500
- وضعیت: **REPRODUCED**. دور زدن احراز هویت نیست

### write-smoothing

- Request: `GET /api/v1/system/national/write-smoothing`
- Expected: بدون نشست 401؛ با نشست 403 یا بدنهٔ ساخت‌یافته
- Actual: بدون نشست 401. دانش‌آموز، مدیر و superadmin هر کدام 500. تکرار superadmin هم 500
- Evidence: ممیزی `authenticateSysadmin is not defined`
- Root cause: تابع صدا زده می‌شود ولی در این فایل تعریف نشده است
- Regression: درخواست دوم 500
- وضعیت: **REPRODUCED**. نشت در بدنه دیده نشد

### تکرار ساخت دانش‌آموز

- Request: دو بار `POST /api/v1/students` با یک کد ملی ساختگی و `school_id` مدرسهٔ 3، از مدیر مدرسهٔ 1
- Expected: ردِ تکرار، یا نساختن رکورد در مدرسهٔ دیگر
- Actual: 201 و 201. شناسه‌ها 1041 و 1042. `school_id` هر دو 1 ماند
- Root cause: تزریق مدرسه اعمال نشد. یکتایی کد ملی قبل از insert چک نشد
- Regression: خودِ پاسخ دوم
- وضعیت: **REPRODUCED** برای تکرار. تزریق مدرسه در این درخواست اعمال نشد

### ارتقای نقش

- Request: `POST /api/v1/users` با `role: superadmin` از مدیر، دو بار
- Expected: 403
- Actual: 403 `role_escalation`، هر دو بار
- این قبولِ کلِ route نیست. فقط همین درخواست رد شد

## ردهایی که در این اجرا دیده شد

شاهدشان کد وضعیت همین SHA است. قبولِ route نیستند.

- `GET /api/v1/reports/finance`: بدون نشست 401، دانش‌آموز 403، مدیر با `school_id=3` مقدار 403 `PHASE6_TENANT_ISOLATION_BREACH`
- `GET /api/students/506`: بدون نشست 401؛ دانش‌آموز، مدیر مدرسهٔ 1 و والدِ بدون پیوند 404
- `GET /api/v1/students/506`: بدون نشست 401، دانش‌آموز 404، مدیر با هدر مدرسهٔ دیگر 403
- `POST /api/admin/backup`: بدون نشست 401، دانش‌آموز 403، `Origin` بیگانه 403 `csrf_origin_mismatch`
- نه CSRFِ نوشتن در ماتریس اول 403 `csrf_origin_mismatch` بود
- توکن `alg=none` روی routeهای محافظت‌شدهٔ همین ماتریس 401 بود
- کوکی بعد از logout روی route محافظت‌شده 401 بود
- `GET /api/public-report` بدون نشست 200 است. این route عمومی است؛ در این اجرا کلید PII فردی شمرده نشد

`GET /api/v1/users` برای دانش‌آموز 200 بود. تعداد رکورد و وجود کد ملی در این SHA دوباره شمرده نشد. نه نشت اعلام می‌شود، نه قبول.

## اجرا نشد

- `POST /api/auth/delete-account` روی حساب واقعی، restore یک بکاپ معتبر، و DELETE رکورد موجود: **NOT EXECUTED**
- PostgreSQL زنده: **NOT VERIFIED**
- analytics و systemهایی که در فهرست بالا نیستند و در ماتریس 43تایی نبودند: **NOT VERIFIED**
- دانش‌آموز با `base_version` دقیقاً جاری روی PATCH دانش‌آموز: **NOT VERIFIED**

سرور آزمون خاموش شد.
