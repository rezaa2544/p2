# آزمون خصمانهٔ API — Arena

وضعیت کلی: **CERTIFIED نیست**. هیچ route فقط با بازبینی کد قبول نشده است. PostgreSQL در این sandbox نبود؛ نتیجهٔ زیر جایگزین شواهد E4 یا Production نیست.

- SHA آزمایش‌شده: `4bff3bcb757162f040e82ffa26f3d40e46eb7a36`
- سرور: `server/index.js` روی `127.0.0.1:3017`، فروشگاه JSON دمو، بدون `DATABASE_URL`
- برای اینکه گارد v1 قبل از کنترلر به 503 نرسد، `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1` روشن بود
- سرور دوم بدون آن پرچم، روی پورت 3018: `/api/v1/students` و `/api/v1/reports/finance` و `/api/v1/users` با نشست معتبر → **503 `AUTHORITY_UNAVAILABLE`**
- ورود واقعی با کد دمو انجام شد. شماره، کد ملی، نام و خودِ توکن در این گزارش نیست
- ماتریس اول: 99 route، 1320 درخواست. بعد از `POST /api/auth/logout` نشستِ بازیگرها باطل شد؛ نتیجه‌های 401 بعد از آن آلوده بودند و مسیرهای حساس دوباره با نشست تازه زده شدند

## موجودی routeهای حساس

همهٔ این‌ها با درخواست HTTP زده شدند، نه با خواندن کد به‌تنهایی.

| گروه | Route |
|---|---|
| نشست | `POST /api/auth/send-code`، `POST /api/auth/login`، `GET /api/auth/me`، `POST /api/auth/logout`، `POST /api/auth/delete-account` |
| دادهٔ فردی | `GET /api/students/:id`، `GET/POST /api/v1/students`، `GET/PATCH/DELETE /api/v1/students/:id`، `GET/POST /api/v1/users`، `GET/PATCH/DELETE /api/v1/users/:id` |
| آموزش | `GET/POST /api/v1/classes`، `GET/POST /api/v1/attendance`، `GET/POST /api/v1/grades`، `GET /api/v1/bootstrap`، `GET /api/v1/pull` |
| گزارش | `GET /api/v1/reports/attendance`، `academic`، `finance`، `teachers`، `GET /api/public-report` |
| تحلیل | 13 مسیر `/api/v1/analytics/*` از جمله `student-timeline`، `parent-360`، `attendance-risk`، `intervention-warnings`، `teacher-evidence` |
| همگام‌سازی | `POST /api/sync`، `GET /api/sync/conflicts`، `POST /api/sync/resolve-conflict` |
| عملیات | `POST /api/admin/backup`، `POST /api/admin/restore`، `POST /api/sms/send`، `GET /api/health-index`، canary، phase5، national، `GET /api/v1/system/national/write-smoothing` |
| سطح سرویس | `GET /api/health`، `/api/liveness`، `/api/readiness`، `GET /metrics` |

برای هر route این موردها فرستاده شد: happy، بدون نشست، نقش دانش‌آموز، مدرسهٔ دیگر، مالک دیگر، بدنه/پرس‌وجوی بدشکل، مقدار مرزی، تکرار، کوکی بعد از logout، شناسهٔ جعلی، محتوای غیرمنتظره، method دیگر به‌اضافهٔ `X-HTTP-Method-Override`، توکن `alg=none`. روی نوشتن‌ها `Origin: https://evil.example` هم زده شد.

## نقص‌ها

### D1 — توکن نشست داخل بدنهٔ bootstrap

- Request: `GET /api/v1/bootstrap` با کوکی دانش‌آموز، و جدا با کوکی مدیر
- Expected: پروفایل بدون رمز نشست. کوکی HttpOnly نباید در JSON تکرار شود
- Actual: هر دو 200. شیء `user` کلیدهای `token`، `jti`، `national_id`، `phone` را دارد. `token` یک JWT سه‌بخشی است. `password` در پاسخ نبود. `GET /api/auth/me` همان توکن را برنمی‌گرداند
- Evidence: همان مقدار `user.token` به‌عنوان کوکی روی `GET /api/auth/me` گذاشته شد و 200 با همان نقش برگشت. تکرار bootstrap برای دانش‌آموز همان شکل را داد
- Root cause: `sessionFrom` توکن خام را روی شیء نشست می‌گذارد. `getBootstrapFromMemory` همان شیء را به `projectUserByRole(..., true)` می‌دهد و آن تابع برای خودِ کاربر همه‌چیز را جز `password` کپی می‌کند
- Regression: درخواست دوم bootstrap همان کلیدها را داشت؛ بازاستفادهٔ توکن هم 200 بود
- وضعیت: **REPRODUCED**

### D2 — JSON نامعتبر روی چند route نوشتن، 500 می‌دهد

- Request: `POST` با بدنهٔ `{` و `Content-Type: application/json`، یک‌بار بدون کوکی و یک‌بار با نشست مدیر
- Expected: 400، بدون 500
- Actual:

| Route | بدون نشست | با نشست | تکرار |
|---|---:|---:|---:|
| `/api/sync` | 500 `server_error` | 500 | 500 |
| `/api/sync/resolve-conflict` | 500 | 500 | 500 |
| `/api/admin/restore` | 500 | 500 | 500 |
| `/api/sms/send` | 500 | 500 | 500 |
| `/api/v1/students` | 401 `unauthorized` | 500 | 500 |

- Evidence: بدنهٔ پاسخ فقط `{ok:false, code:"server_error"}` بود و stack به کلاینت نیامد. لاگ ممیزی مسیرها را با `msg: bad_json` ثبت کرد
- Root cause: `readBody` روی JSON بد `Error('bad_json')` را reject می‌کند. catch بیرونی فقط `too_large` را به 413 نگاشت می‌کند و بقیه، از جمله `bad_json`، 500 می‌شوند. در چهار route اول، خواندن بدنه قبل از بررسی نشست است
- Regression: هر مسیر بالا یک بار دیگر 500 داد
- وضعیت: **REPRODUCED**. دور زدن احراز هویت نیست؛ خطا به‌جای 400 است و روی چهار route بدون نشست هم رخ می‌دهد

### D3 — write-smoothing برای هر نشست معتبر 500 است

- Request: `GET /api/v1/system/national/write-smoothing` بدون کوکی، سپس با دانش‌آموز، مدیر و superadmin
- Expected: بدون نشست 401؛ نقش غیرمجاز 403؛ نقش مجاز یا 200 یا ردِ ساخت‌یافته
- Actual: بدون نشست 401. هر سه نقش 500 `server_error`. تکرار superadmin هم 500
- Evidence: لاگ ممیزی: `msg: authenticateSysadmin is not defined` روی همین مسیر
- Root cause: `nationalWriteSmoothing` تابعی را صدا می‌زند که در این فایل تعریف نشده. استثنا به catch عمومی می‌رسد و 500 می‌شود. گارد v1 قبل از آن، بی‌نشست را 401 می‌کند
- Regression: درخواست دوم superadmin باز 500
- وضعیت: **REPRODUCED**. نشت داده در بدنه دیده نشد

### D4 — تکرار ساخت دانش‌آموز با همان کد ملی، رکورد دوم می‌سازد

- Request: `POST /api/v1/students` با نشست مدیر مدرسهٔ 1، دو بار، با یک کد ملی ساختگی و `school_id` مدرسهٔ 3
- Expected: یا ردِ تکرار، یا حداقل نساختن رکورد دوم؛ `school_id` درخواست نباید مدرسه را عوض کند
- Actual: هر دو 201. شناسه‌های ساخته‌شده 1041 و 1042. `school_id` هر دو رکورد 1 ماند، نه 3
- Evidence: بعد از دو پاسخ 201، فروشگاه زنده دو کاربر با همان کد ملی ساختگی داشت
- Root cause: تزریق مدرسه در این حالت اعمال نشد، چون کد مدرسهٔ نشست را می‌گذارد. یکتایی کد ملی قبل از insert چک نشد
- Regression: خودِ درخواست دوم، تکرارِ نقص است
- وضعیت: **REPRODUCED** برای تکرار. تزریق مدرسه در این درخواست **اعمال نشد**

## چیزی که نقص عبوردهی نبود

این‌ها اجرا شدند. «قبول» یا CERTIFIED نیستند.

- بدون نشست روی `/api/v1/*` → 401. توکن `alg=none` و امضای دست‌خورده → 401
- دانش‌آموز روی `/api/v1/reports/finance` → 403. روی `/api/students/506` و `/api/v1/students/506` → 404
- مدیر مدرسهٔ 1 روی دانش‌آموز 506، مالی مدرسهٔ 3، و `X-School-Id: 3` → 404 یا 403 `PHASE6_TENANT_ISOLATION_BREACH`
- مدیر مدرسهٔ 3 روی دانش‌آموز مدرسهٔ 1 → 404؛ مالی مدرسهٔ 1 → 403
- معلم، مشاور و والدِ بدون پیوند روی دانش‌آموز خارج از محدوده → 404. والدِ پیوندخورده روی فرزند خودش 200 و روی دانش‌آموز مدرسهٔ دیگر 404
- `POST /api/v1/users` با `role: superadmin` از مدیر → 403 `role_escalation`، دو بار
- `POST /api/sync` با `school_id` مدرسهٔ دیگر و `by` برابر خودِ مدیر → 403 `school_mismatch`، دو بار
- 27 نوشتن با `Origin` بیگانه → 403 `csrf_origin_mismatch`
- `GET` با `X-HTTP-Method-Override: DELETE` دانش‌آموز 16 را حذف نکرد
- نمرات دانش‌آموز 28 ردیف و حضور 27 ردیف بود؛ همه `student_id` خودش بود
- فهرست `/api/v1/users` برای دانش‌آموز فقط یک رکورد، خودش، بود
- `GET /api/public-report` بدون نشست 200 است و کلید `national_id` ندارد؛ شمار دانش‌آموز/معلم و نام مدرسه را می‌دهد. این افشای PII فردی نبود
- `GET /metrics` از loopback 200 و حدود 289KB بود؛ در متن آن `national_id`، `password` و JWT دیده نشد
- `POST /api/auth/logout` بدون کوکی 200 `{ok:true}` است و داده‌ای برنمی‌گرداند. این دور زدن نیست؛ no-op است
- ادارهٔ آموزش با `school_id=3` صفحهٔ مدرسهٔ 1 را گرفت، نه مدرسهٔ 3. خواندن تکی دانش‌آموز 506 → 404 و مالی مدرسهٔ 3 → 403. نشت مدرسهٔ دیگر دیده نشد؛ پارامتر `school_id` برای این نقش اعمال نشد

## اجرا نشد

این‌ها PASS نیستند.

- `POST /api/auth/delete-account` روی حساب واقعی، `POST /api/admin/restore` روی بکاپ معتبر، و `DELETE` دانش‌آموز موجود: عمداً زده نشد تا فروشگاه آزمون نابود نشود. **NOT EXECUTED**
- حالت PostgreSQL زنده زده نشد. گارد v1 بدون پرچم dev روی حافظه، 503 است. احرازِ tenant روی PostgreSQL واقعی **NOT VERIFIED**
- نتیجهٔ 401 روی نوشتن‌ها در ماتریس اول، بعد از logout همان کوکی، شاهد نقش نیست

سرور آزمون خاموش شد. PII دمو در گزارش و در فایل پایدار کپی نشده است.
