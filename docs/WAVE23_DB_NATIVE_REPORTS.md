# موج ۲۳ — گزارش‌های DB-native (تجمیع در دیتابیس، نه در حافظه)

**تاریخ:** ۲۰۲۶-۰۹-۱۲ · **شاخه:** `fix/wave23-db-native-reports` · **وضعیت:** یک گزارش از چهار گزارش پیاده شد؛ سه گزارش طراحی‌شده و آمادهٔ پیاده‌سازی

---

## ۱. مسئله

`server/routes/reports.js` (موج ۲۳) چهار گزارشِ استاندارد وزارتی را با **پویشِ کاملِ
`ctx.store` در حافظه** می‌سازد. هر درخواست، مستقل از اینکه چه چیزی خواسته شده، کلِ
جدول را می‌پوید:

| # | گزارش | پویشِ حافظه در هر درخواست |
| :- | :--- | :--- |
| ۱ | `/api/v1/reports/attendance` | کلِ `store.attendance` (همهٔ ماه‌ها) + کلِ `store.users` |
| ۲ | `/api/v1/reports/academic` | کلِ `store.grades` (همهٔ ترم‌ها) |
| ۳ | `/api/v1/reports/finance` | کلِ `store.tuitions` + `store.installments` + `store.scholarships` |
| ۴ | `/api/v1/reports/teachers` | کلِ `store.staff_attendance` + `store.substitutions` + `store.training_courses` + ساختِ نقشهٔ همهٔ کاربران |

سه ایرادِ ساختاری:

1. **پیچیدگی با تاریخچه رشد می‌کند.** هزینهٔ گزارشِ «یک ماه» با مجموعِ ماه‌های
   گذشته زیاد می‌شود، نه با حجمِ همان ماه.
2. **نتیجه bounded نیست.** هیچ صفحه‌بندی‌ای وجود ندارد؛ خروجی به‌اندازهٔ
   (مدرسه × کلاس) یا (مدرسه × کادر) بزرگ می‌شود.
3. **`db` تزریق شده ولی استفاده نمی‌شود.** ‏`server/index.js:491` همین حالا
   ‏`createReportsRoutes({ store, db, … })` را صدا می‌زند؛ مسیرِ گزارش `db` را
   نادیده می‌گرفت.

این همان الگویی است که `SKILLS_MASTER.md` برای مسیرهای سنگین ممنوع کرده:
تجمیعِ in-memory ممنوع، DB-native با ایندکس و نتیجهٔ bounded.

---

## ۲. معماریِ هدف

```
        ┌──────────────────────────┐
req ───▶│  role gate + scope       │  policy.js (بدونِ تغییر)
        │  (school_id ← SQL ANY)   │
        └────────────┬─────────────┘
                     ▼
        ┌──────────────────────────┐        ┌────────────────────┐
        │ server/reports-sql.js    │───────▶│ parameterized SQL  │
        │ سازندهٔ خالصِ کوئری       │        │ + keyset LIMIT n+1 │
        └────────────┬─────────────┘        └─────────┬──────────┘
                     ▼                                ▼
        ┌──────────────────────────┐   READ_DATABASE_URL؟
        │ db.queryRead()           │──────▶ رپلیکای فقط‌خواندنی
        │ (fallback → primary)     │──────▶ وگرنه پرماری
        └──────────────────────────┘
```

چهار اصل:

| اصل | چگونه |
| :--- | :--- |
| **تجمیع در SQL** | ‏`count(x) FILTER (WHERE …)` به‌جای حلقهٔ JS؛ `GROUP BY` به‌جای `Map` |
| **ایندکس** | الگوی دسترسی `(school_id, class_id, date)` — ایندکسِ `idx_attendance_school_class_date` از مهاجرتِ ۰۰۲ **همین حالا** آن را پوشش می‌دهد؛ ایندکسِ تازه لازم نشد |
| **bounded + صفحه‌بندی** | keyset روی `(school_id, class_id)` با `LIMIT n+1` (بدونِ `OFFSET`)؛ سقفِ سخت `MAX_PAGE = 5000` |
| **رپلیکای خواندن** | همهٔ خواندن‌ها از `db.queryRead()` — اگر رپلیکا نبود، خودِ `queryRead` به پرماری برمی‌گردد |

**حالتِ دوگانه:** مسیرِ SQL فقط وقتی `db.isPostgres()` فعال است. وگرنه مسیرِ حافظهٔ
موج ۲۳ **بدونِ هیچ تغییری** کار می‌کند، پس حالتِ JSON و کلاینتِ آفلاین دست‌نخورده‌اند.

### نکتهٔ تقویم
فیلترِ ماه شمسی است ولی `attendance.date` از نوع `VARCHAR(50)` با قالب `YYYY-MM-DD`.
برای این قالب، مقایسهٔ واژه‌نامه‌ای همان مقایسهٔ زمانی است، پس یک بازهٔ
**نیمه‌باز** `[from, to)` با دو پارامترِ مقید کافی است و ایندکس btree هم آن را
می‌گیرد. ‏`jalaliMonthRange()` وارونِ تقویم را می‌دهد و کرانهٔ بالا را «روزِ اولِ
ماه بعد» می‌گیرد، پس هیچ شمارشِ سالِ کبیسه‌ای لازم نیست.

---

## ۳. آنچه پیاده شد — گزارش ۱: حضور و غیاب

سه کوئری، ثابت، مستقل از حجمِ داده:

| کوئری | کار | کرانه |
| :--- | :--- | :--- |
| صفحهٔ کلاس‌ها | ‏`classes LEFT JOIN attendance` با شرطِ ماه **داخلِ JOIN** + `GROUP BY` | ‏`LIMIT n+1` |
| جمعِ مدرسه | ‏`attendance JOIN classes` با `GROUP BY school_id` | به‌اندازهٔ مدارسِ پاسخ |
| شمارِ دانش‌آموز | ‏`users … GROUP BY school_id` | به‌اندازهٔ مدارسِ پاسخ |

دو تصمیمِ طراحی که آزمون‌ها وادارشان کردند:

- **صفحه روی `classes` کلید می‌خورد، نه روی تجمیع.** گزارشِ حافظه برای هر کلاسِ
  دامنه یک ردیف می‌دهد حتی اگر در آن ماه حضوری نداشته باشد. اگر صفحه را روی
  خروجیِ تجمیع می‌بردیم، کلاسِ صفر ناپدید می‌شد. با `LEFT JOIN` و گذاشتنِ شرطِ ماه
  **داخلِ شرطِ JOIN** (نه `WHERE`)، کلاسِ بدونِ حضور با صفر می‌آید.
- **جمع‌ها برای همهٔ مدارسِ پاسخ گرفته می‌شوند، نه فقط مدارسِ دارای ردیف در صفحه.**
  وگرنه مدرسه‌ای که در این صفحه ردیف ندارد `students=0` می‌گرفت.

پاسخ `pagination` به‌صورت **افزودنی** اضافه شده؛ شکلِ `schools[]` بدونِ تغییر است.

---

## ۴. سه گزارشِ باقی‌مانده — طراحیِ آمادهٔ پیاده‌سازی

| گزارش | تجمیعِ SQL | ایندکسِ لازم | کرانه |
| :--- | :--- | :--- | :--- |
| `academic` | ‏`grades` → `avg(score/max_score*20)` و `count(*) FILTER (WHERE norm>=10)` با `GROUP BY class_id`؛ روند با `GROUP BY school_id, term` | ‏`(school_id, class_id)` موجود؛ برای روند `(school_id, term)` **بررسی شود** | صفحه روی `classes` |
| `finance` | سه تجمیعِ جدا با `FILTER` روی `tuitions`/`installments`/`scholarships`؛ «سررسیدِ گذشته» با `due_date < CURRENT_DATE AND status IN ('pending','partial')` | ‏`(school_id)` موجود؛ `(school_id, status)` بررسی شود | صفحه روی مدارسِ شهریه‌دار |
| `teachers` | ‏`staff_attendance` با `GROUP BY staff_id` + `substitutions` و `training_courses` به‌عنوان تجمیعِ جدا و `LEFT JOIN` | ‏`(school_id, date)` برای `staff_attendance` **نبود؛ بررسی شود** | صفحه روی کادر |

هر سه باید همان قراردادِ گزارشِ ۱ را داشته باشند: سازندهٔ خالص در
`server/reports-sql.js` · مسیرِ SQL فقط با `db.isPostgres()` · خواندن با `queryRead` ·
سنجهٔ هم‌ارزی در `tests/wave23-reports-pg.js`.

---

## ۵. Evidence

### ۵.۱ هم‌ارزی روی PostgreSQLِ واقعی
‏`tests/wave23-reports-pg.js` — ‏**۳۰/۳۰ سبز**. دیتابیسِ واقعی، ۸ مهاجرتِ خودِ مخزن
اعمال‌شده، ۳۶٬۰۰۰ رکورد. خروجیِ دو مسیر **بایت‌به‌بایت** مقایسه می‌شود
(۵ سناریو: کلِ دامنه، یک مدرسه، فیلترِ کلاس، ماهِ دیگر، اسفندِ کبیسه).

### ۵.۲ نقشهٔ اجرا
```
Nested Loop Left Join
  ->  Seq Scan on classes c                       (۳۰ ردیف)
  ->  Index Scan using idx_attendance_school_class_date on attendance a
        Index Cond: (school_id = c.school_id) AND (class_id = c.id)
                    AND date >= '2025-08-23' AND date < '2025-09-23'
Execution Time: 0.603 ms   (روی ۳۶٬۰۰۰ رکورد)
```
‏`Seq Scan on attendance` در هیچ‌کدام از سناریوها رخ نداد.

### ۵.۳ سنجهٔ پیش/پس
‏`tools/bench-reports-attendance.js` — میانهٔ ۳۰ (و ۱۵) تکرار:

| سناریو | ۳۶٬۰۰۰ رکورد: حافظه | DB-native | سرعت | ۲۰۰٬۰۰۰ رکورد: حافظه | DB-native | سرعت |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| همهٔ مدارس (سوپرادمین) | ۲۱.۵۴ ms | ۸.۴۵ ms | **۲.۵×** | ۱۱۳.۰۰ ms | ۲۳.۹۲ ms | **۴.۷×** |
| یک مدرسه (مدیر) | ۱.۸۱ ms | ۲.۰۳ ms | **۰.۹×** ⚠ | ۹.۴۴ ms | ۳.۲۵ ms | **۲.۹×** |
| همهٔ مدارس + صفحهٔ ۵۰۰ | ۲۱.۴۳ ms | ۸.۳۶ ms | **۲.۶×** | ۱۱۳.۲۶ ms | ۲۳.۸۲ ms | **۴.۸×** |

**یافتهٔ منفی، صریح:** در ۳۶٬۰۰۰ رکورد، سناریوی «یک مدرسه» با مسیرِ DB-native
‏**کمی کندتر** است (۰.۹×) — سه رفت‌وبرگشت به دیتابیس از پویشِ ۳۶ هزار ردیف در RAM
گران‌تر است. مزیتِ DB-native با رشدِ داده ظاهر می‌شود: در ۲۰۰٬۰۰۰ رکورد همان سناریو
‏۲.۹× سریع‌تر است. مسیرِ حافظه **خطی** با کلِ جدول رشد می‌کند (۲۱.۵ → ۱۱۳ ms برای
‏۵.۵× داده)، مسیرِ SQL فقط ردیف‌های همان ماه را لمس می‌کند.

هزینهٔ پنهانِ مسیرِ حافظه که در این سنجه نیست: برای رسیدن به آن ۲۱ ms باید
‏**۱۶.۶ MiB JSON** در RAM باشد (۳۲۲ ms بارگذاری در ۲۰۰٬۰۰۰ رکورد).

### ۵.۴ جهش‌ها
۸ جهش، **۸ کشته** (`/tmp/mutate-w23.js` در طولِ کار؛ خلاصه در گزارش):

| جهش | کشته با |
| :--- | :--- |
| حذفِ بازهٔ ماه از JOIN | ۱ |
| ‏`LEFT JOIN` → `JOIN` | ۲ |
| حذفِ `a.school_id = c.school_id` | ۴ |
| ‏`count(a.id)` → `count(*)` | ۳ |
| حذفِ catch-all «غایب» | ۳ |
| ‏`queryRead` → `query` | ۲ |
| تغییرِ فرمولِ نرخ | ۴ |
| ‏`LIMIT n+1` → `LIMIT n` | ۳ |

---

## ۶. تفاوتِ معناییِ ثبت‌شده میان دو مسیر

مسیرِ حافظه رکوردِ حضور را با `class_id` سطل‌بندی می‌کند و **بررسی نمی‌کند** که
`school_id`ِ همان رکورد با مدرسهٔ آن کلاس یکی باشد. مسیرِ SQL شرط
‏`a.school_id = c.school_id` را در JOIN می‌گذارد. روی دادهٔ سازگار دو مسیر یکی‌اند
(سنجهٔ هم‌ارزی)؛ روی رکوردِ ناسازگار، SQL آن را حساب نمی‌کند. این تفاوت **عمدی**
و سخت‌گیرانه‌تر است و در `tests/wave23-reports-pg.js` بخشِ `W23-JOIN` قفل شده.

---

## ۷. فایل‌ها

| فایل | نقش |
| :--- | :--- |
| `server/reports-sql.js` | سازنده‌های خالصِ SQL + وارونِ تقویم (بدونِ وابستگی به دیتابیس) |
| `server/routes/reports.js` | مسیرِ DB-native برای گزارشِ ۱، با حفظِ مسیرِ حافظه |
| `tests/wave23-reports-sql.js` | ‏۵۱ سنجهٔ رفتاری روی سازنده‌ها (همیشه اجرا می‌شود) |
| `tests/wave23-reports-pg.js` | ‏۳۰ سنجهٔ هم‌ارزی/مهار/صفحه‌بندی/نقشهٔ اجرا روی PostgreSQLِ واقعی |
| `tools/bench-reports-attendance.js` | سنجهٔ پیش/پس + `EXPLAIN ANALYZE` |

---

## ۸. قلم‌های باز

1. ~~سه گزارشِ دیگر هنوز in-memory‌اند (§۴).~~ **بسته شد (۲۰۲۶-۰۹-۱۲، تکمیلِ
   P0-1 چت ۳):** هر سه گزارش (`academic`/`finance`/`teachers`) DB-native
   شدند — §۹ همین سند.
2. ~~**باگِ تأییدشده (رفع‌نشده):** ‏`schoolHasTuition()`…~~ **رفع شد (red-first):**
   نوعِ ساختاری حالا از هر دو شکل خوانده می‌شود
   (`school.school_type ?? school.type` — ‏`school_type` در تعارض برنده است،
   چون نامِ store/validate.js است). بازتولیدِ قرمز پیش از رفع:
   ‏`financeReport` روی `{type:'shahed'}` → **۴۰۰**؛ پس از رفع → **۲۰۰** و
   درخواستِ صریحِ مدرسهٔ governmental همچنان **۴۰۰**. سنجهٔ قفل:
   ‏`tests/wave23-reports-pg.js` بخشِ `W23-TUITION`؛ جهشِ M8 (برگرداندنِ باگ)
   کشته می‌شود.
3. `tests/wave23-reports-pg.js` در محیطِ بدونِ PostgreSQL با برچسبِ NOT-RUN رد
   می‌شود؛ `scripts/run-all-tests.sh` وقتی PostgreSQLِ در دسترس بیابد
   ‏`WAVE23_REQUIRE_PG=1` می‌گذارد تا آن‌جا تست الزامی شود.
4. CI روی GitHub به‌دلیلِ صورتحسابِ حساب اجرا نمی‌شود؛ همهٔ Evidence بالا محلی است.

---

## ۹. تکمیلِ P0-1 (۲۰۲۶-۰۹-۱۲): سه گزارشِ باقی‌مانده DB-native شدند

پیاده‌سازی دقیقاً طبقِ طرح‌هایِ §۴ و با همان دکترینِ گزارشِ حضور: سازندهٔ
خالص در `server/reports-sql.js` · مسیرِ SQL فقط با `db.isPostgres()` · مسیرِ
حافظه بایت‌به‌بایت دست‌نخورده · همهٔ خواندن‌ها `queryRead` · صفحه‌بندیِ keyset
با `LIMIT n+1` · مهارِ اجاره‌ای در SQL (`school_id = ANY($1)`).

### ۹.۱ آنچه ساخته شد

| گزارش | سازنده‌ها | صفحه | نکتهٔ هم‌ارزی |
| :--- | :--- | :--- | :--- |
| `academic` | `buildAcademicClassPage` + `buildAcademicSchoolTotals` + `buildAcademicTrend` | روی `classes` — کلاسِ بی‌نمره با count=0 می‌ماند | نرمال‌سازیِ `score*20/max_score` در SQL با گاردِ VARCHAR خراب (هم‌ارزِ `Number()||20`)؛ میانگینِ مدرسه وزنِ **میانگینِ گردشدهٔ** کلاس را می‌گیرد (آینهٔ فرمولِ حافظه)؛ روند از **همهٔ** ترم‌ها با ترتیبِ نخستین-دیدار (`min(id)`) |
| `finance` | `buildFinanceTuitions` + `buildFinanceInstallments` + `buildFinanceScholarships` | bounded به مدارسِ شهریه‌دارِ دامنه | ستون‌هایِ پولیِ VARCHAR (`discount`/`payable`/`paid`/`paid_amount`) با castِ regex-گارد — junk مثل `Number()||0` صفر می‌شود؛ «امروز»ِ overdue پارامتر است نه `CURRENT_DATE` تا دو مسیر روی «حالا» یکی باشند |
| `teachers` | `buildTeachersStaffPage` + `buildTeachersSchoolTotals` + `buildUsersByIds` | keyset روی `(school_id, staff_id)` از سه CTE با FULL JOIN | حضورِ کادر و جانشینی ماه-مقید؛ ضمنِ خدمت کل-تاریخ (رفتارِ حافظه)؛ نام/نقش فقط برای staffهای صفحه (`ANY($1)`) |

**اعتبارسنجیِ استاندارد (P2):** ‏`parsePositiveInt` / `parseOptionalPositiveInt` /
`validateTerm` / `validateSchoolId` در `server/reports-sql.js` و روی **هر ۴**
endpoint (شاملِ حضورِ چت ۶). ورودیِ خراب ⇒ `400 bad_request` در **هر دو مسیر**
(نه NaN خاموشِ حافظه، نه ۵۰۰ از PG).

### ۹.۲ Evidence (Measured، محلی، PostgreSQL 18.4 embedded)

- ‏`tests/wave23-reports-sql.js` → **۱۱۰/۱۱۰** (۵۱ قبلی + ۵۹ برای سازنده‌های
  جدید و parserها؛ ناوردایِ «هر پارامتر مصرف می‌شود» روی هر ۱۰ سازنده).
- ‏`tests/wave23-reports-pg.js` → **۷۳/۷۳** روی PG واقعی (۳۰ قبلی دست‌نخورده +
  ۴۳ جدید): هم‌ارزیِ بایت‌به‌بایتِ ۱۰ سناریو برای سه گزارشِ جدید · `W23-TUITION`
  (رفعِ باگ) · مهار/۴۰۰های P2 · پیمایشِ کاملِ cursor (academic/teachers) ·
  ثباتِ جمع‌ها زیرِ صفحه‌بندی · فقط-queryRead با شمارِ ثابتِ کوئری (۳ برای هر
  گزارش) · bounded در خودِ PG (کوئریِ صفحه ≤ limit+1 ردیف برمی‌گرداند) ·
  `W23C-JOIN` نمرهٔ ناسازگار.
- **جهش‌کشی:** `tests/wave23-reports-mutations.js` → **۱۰/۱۰ کشته** (حذفِ
  GROUP BY روند، JOIN بدونِ تطبیقِ مدرسه، حذفِ فیلترِ tenant مالی، تغییرِ فرمولِ
  نرمال‌سازی، حذفِ LIMIT n+1، حذفِ گاردِ P2، حذفِ queryRead، برگرداندنِ باگِ
  has_tuition، حذفِ catch-all قسط، LIMIT در totals). دو جهشِ M2/M5 در دورِ
  اول **زنده ماندند** و با دو سنجهٔ تازه (W23C-JOIN و bounded-at-PG) کشته شدند
  — تست ضعیف نشد، قوی شد.
- **EXPLAIN (ANALYZE, BUFFERS)** روی هر کوئریِ جدید (36k حضور + 24k نمره):
  academic صفحه ‏۷.۸ms — `grades` با ایندکس، **یافتهٔ ثبت‌شده: Seq Scan روی
  `classes`** (جدولِ ۲۰۰ ردیفی؛ برنامه‌ریز درست انتخاب می‌کند — ایندکسِ تازه
  **NOT-ADD**) · finance شهریه ‏۱.۳ms و اقساط ‏۱.۳ms — بدونِ Seq Scan
  (idx_tuitions_school_id/idx_installments_school_id) · teachers صفحه ‏۰.۹ms —
  بدونِ Seq Scan (idx_staff_attendance_school_id). **هیچ ایندکسِ تازه‌ای لازم
  نشد** — طبقِ قاعدهٔ «ایندکس فقط با اثبات»، NOT-ADD مستند.
- **هم‌زمانی (P1-7 سبک):** `tools/bench-reports-concurrency.js` — ۵۰ درخواستِ
  هم‌زمانِ ترکیبی (هر ۴ گزارش) روی PG زنده، Pool(max=10)، **Measured @ 200k
  حضور/60k نمره**: حافظه p50≈104–108ms · p95≈185–238ms؛ DB-native
  p50≈226–321ms · p95≈364–416ms؛ خطا ۰/۵۰ در هر دو. **یافتهٔ منفیِ صریح:**
  در این مقیاس و با store ازپیش-در-RAM، زیرِ هم‌زمانی مسیرِ حافظه سریع‌تر است
  (CPU-bound روی ۲ هسته؛ رفت‌وبرگشت‌هایِ شبکه/Pool جمع می‌شوند). مزیتِ DB-native
  همان است که §۵.۳ نشان داد: حافظه **خطی با کلِ جدول** رشد می‌کند و ۱۶.۶MiB+
  RAM per store می‌خواهد؛ در مقیاسِ ملی full-scan اصلاً گزینه نیست.
  **Target≠Measured:** هدفِ بریف scale=0.01 (~100k کاربر/1.4GB) در sandbox
  با ~1GB RAM اجرا-نشدنی بود ⇒ **NOT-RUN** با همین دلیل.

### ۹.۳ فایل‌هایِ این تکمیل

| فایل | تغییر |
| :--- | :--- |
| `server/reports-sql.js` | +۱۳ سازنده/parser جدید (خالص، تست‌پذیر) |
| `server/routes/reports.js` | سه مسیرِ DB-native + P2 روی هر ۴ endpoint + رفعِ has_tuition |
| `tests/wave23-reports-sql.js` | ۵۱ → ۱۱۰ سنجه |
| `tests/wave23-reports-pg.js` | ۳۰ → ۷۳ سنجه |
| `tests/wave23-reports-mutations.js` | جدید — ۱۰ جهش، اجرایِ گیتِ زنده |
| `tools/bench-reports-concurrency.js` | جدید — بنچِ هم‌زمانی |
