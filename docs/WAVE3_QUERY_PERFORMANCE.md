# Wave 3 — Query و Performance · Part 1 (students/attendance → DB-native)

- **برنچ:** `arena/01a085ca-p2` (همان PR #39)
- **تاریخ:** ۲۰۲۶-۰۹-۰۹ (تهران)
- **چت:** چت ۲
- **دامنه (تصویب‌شده):** بخش اول: تبدیل `students` و `attendance` به مسیرِ
  DB-native + Index + Inventory. **بخش دوم (این‌جا):** تبدیل `grades`، `classes`
  و `users` GET-list به همان الگو.

> ⚠️ **وضعیتِ صداقت (مهم):** هیچ PostgreSQL زنده/درایور در سندباکس نبود؛
> «سازندهٔ SQL» به‌صورت خالص تستِ واحد شد (ساختار/بایندِ پارامتر/allowlist) و
> مسیرِ route ها طوری سیم‌کشی شد که **فقط وقتی PG زنده باشد اجرا شود**
> (`db.isPostgres()`). اجرایِ واقعی + `EXPLAIN ANALYZE` + گیتِ برابری/مجوز بر
> PGِ واقعی **الزامی پیش از تولید** است و در این سند صریح ثبت می‌شود.

---

## ۱. Inventory — endpointهای پرترافیک و الگویِ فعلی (JS)

پیش از این دور، **همهٔ** GET-list ها از `store` «همه را بار می‌کرد → در JS فیلتر
می‌کرد → sort → slice». (پایهٔ Keyset-pagination از قبل در
`server/middleware/pagination.js` بود ولی روی آرایهٔ کامل اعمال می‌شد.)

| Endpoint | فایل | بارِ JS فعلی | filter/sort/slice در JS | این دور |
|---|---|---|---|---|
| `GET /api/v1/students` | `routes/students.js` | `users`(کلِ school) | role scope · class_id (joins) · grade · search · teacher-scope (joins) · sort id · slice | ✅ DB-native (وقتی PG زنده) |
| `GET /api/v1/attendance` | `routes/attendance.js` | `attendance`(کلِ school) | school scope · date · class_id · student_id · role(student/parent) · sort date DESC,id · slice | ✅ DB-native (وقتی PG زنده) |
| `GET /api/v1/classes` | `routes/classes.js` | classes + enrollments/users (enrich) | school scope · grade · enrich(student_count/teacher) · sort · slice | ✅ **بخش دوم: DB-native** |
| `GET /api/v1/grades` | `routes/grades.js` | grades + joins | school scope · filters · sort · slice | ✅ **بخش دوم: DB-native** |
| `GET /api/v1/users` | `routes/users.js` | users | school scope · role · search · sort · slice | ✅ **بخش دوم: DB-native** |

---

## ۲. طراحیِ DB-native (این بخش)

### `server/dbquery.js` — سازندهٔ کوئریِ خالص (pure) و اجراگر

- `buildStudentsList({user, classId, grade, search, limit, cursor})`
  → `{ page:{sql,params}, count:{sql,params} }`
  - `WHERE u.role='student'` + (به‌جز superadmin/edu_office) محدودهٔ `school_id`
  - `class_id`/teacher-scope از راهِ `EXISTS` روی `enrollments/classes/schedule`
  - `search` → `CAST(...) ILIKE $n` (فقط پارامتر)
  - `ORDER BY u.id ASC` · Keyset: `u.id > $cursor` · `LIMIT limit+1`
  - `COUNT(*)` دوقلو برایِ `total` پایدار (بدون OFFSET)
- `buildAttendanceList({user, date, classId, studentId, limit, cursor})`
  → همان؛ مرتب‌سازی `date DESC, id ASC`، محدودهٔ نقشِ `student/parent` با
  `EXISTS` روی `parent_links`.
- `executePagedList(db, built, {limit, cursor})` — اجرا و شکل‌دهیِ خروجی دقیقاً
  هم‌شکلِ `paginateArray` (بخش B در تست).
- **امنیت:** همهٔ مقادیرِ کاربری فقط در `params`؛ شناسه‌ها فقط از allowlistِ
  داخلیِ جداول. کلیدهایِ داخلی/غیرمجاز هرگز به SQL راه نمی‌یابند.

### سیم‌کشی route ها (students.js / attendance.js)

```js
// هر دو getXList حالا async هستند.
if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
  const built = buildStudentsList({ user, classId, grade, search, limit, cursor });
  const res = await executePagedList(db, built, { limit, cursor });
  res.data = res.data.map(s => projectUserByRole(s, user.role));
  return { ok: true, ...res };
}
/* else: مسیرِ JS قبلی، دست‌نخورده (runtimeِ فعلی) */
```

- `index.js`: دو هندلرِ GET-list حالا `await` می‌شوند.
- **وقتی PG خاموش است، رفتار کاملاً همان است که بود** → دروازه‌هایِ موجود سبز.

### Index (server/schema.sql — افزوده‌شده، idempotent)

| Index | چرا |
|---|---|
| `users (school_id, role, id)` | students: scope + role + keyset ORDER BY id |
| `users (role, school_id, id)` | سوپرادمین/فیلترِ role اوّل |
| `attendance (school_id, date DESC, id)` | مرتب‌سازیِ date DESC,id + scope |
| `attendance (student_id, date DESC, id)` | scopeِ دانش‌آموز/والدین |

(برخی Index هایِ موجود از دورهایِ پیش: `users(school_id,role)`،
`attendance(school_id,class_id,date)`، `attendance(school_id,student_id)`.)

---

## ۲.ب. بخش دوم — grades / classes / users

### `server/dbquery.js` — سه builder تازه

- `buildGradesList({user, studentId, subjectId, classId, limit, cursor})`
  - `FROM "grades" g`؛ scope؛ فیلترهای student/subject/class (بایند)
  - محدودهٔ نقش با `EXISTS`: student → `g.student_id=id` ·
    parent → `parent_links` · teacher → `g.teacher_id=id OR schedule.subject_id`
  - **Enrichment در خود SQL:** `LEFT JOIN subjects` و `users` →
    `subject_name` / `student_name` (COUNT فقط روی `grades` — پیوست‌ها many-to-one)
  - `ORDER BY g.id DESC` + keyset
- `buildClassesList({user, grade, limit, cursor})`
  - scope + فیلتر grade · **`student_count`** با scalar-subquery روی `enrollments`
    و **`homeroom_teacher_name`** با `LEFT JOIN users`؛ COUNT روی `classes`
- `buildUsersList({user, role, search, limit, cursor})`
  - scope + فیلتر role + جستجویِ آزادِ `ILIKE` روی full_name/national_id/phone
    — **national_id فقط پارامترِ بایند، هرگز در WHERE تعبیه نمی‌شود**

`_finalize` برای این‌ها تعمیم یافت تا `selectList`/`pageFrom` (با JOIN) و یک
`countFrom` (بدون JOIN) بپذیرد — صفحه از source غنی، COUNT از جدولِ پایه.

### سیم‌کشی route ها
`grades.js`/`classes.js`/`users.js` — `getXList` حالا `async` و در صورت
`db.isPostgres()` از builder + `executePagedList` می‌روند (users پس از پجینگ
projection می‌زند)؛ وگرنه همان JS قبلی، دست‌نخورده. `index.js` سه GET-list را
`await` می‌کند.

### Index (schema.sql — بخش دوم، idempotent)
`grades(school_id, id DESC)` · `grades(school_id, student_id, id DESC)` ·
`classes(school_id, grade, id)` (ایندکسِ users(school_id,role,id) از بخش اول
فیلتر role را پوشش می‌دهد.)

### آزمایشِ این بخش
`tests/wave3-query2.js` — **۱۳/۱۳**: ساختار/allowlist/bayندِ سه builder +
injection-safe بودنِ national_id/search · شکلِ `executePagedList` + عبورِ
enrichment · parity مسیرِ memory برایِ هر سه route · PG گاردشده (skip).

## ۳. آزمایش و Benchmark

### انجام‌شده در این سندباکس (بدون PG)
- `tests/wave3-query.js` (بخش اول) — **۱۳/۱۳** · `tests/wave3-query2.js` (بخش دوم) — **۱۳/۱۳**
  - ساختار/بایندِ SQL + injection-safe بودن (search/national_id فقط در params) ·
    allowlistِ جدول/اتصال‌ها
  - شکلِ `executePagedList` با dbِ جعلی: `has_more` از LIMIT+1، `next_cursor`،
    `total` از COUNT · عبورِ enrichment (subject/student name · student_count/teacher name)
  - parity مسیرِ memory برایِ هر پنج route (students/attendance/grades/classes/users)
  - اجرایِ PG گاردشده → skip (بدون DB زنده)

### `EXPLAIN ANALYZE` — اجرا شد ✅ (۲۰۲۶-۰۹-۱۰، PostgreSQL ۱۸.۴ زنده)

بخش «pending» قبلی بسته شد. سندباکس PostgreSQL نداشت و `apt` هم به مخزن
نرسید، پس یک کلاستر **واقعی** از راهِ `embedded-postgres` (خارج از ریپو، در
`/home/user/pgtool`) بالا آورده شد و `migrations/` روی آن اعمال گردید.

**دیتاستِ آزمون (۲.۱۹M ردیف):**

| جدول | ردیف | | جدول | ردیف |
|---|---:|---|---|---:|
| users | 90,911 | | grades | 720,000 |
| students | 60,000 | | attendance | 1,200,000 |
| classes | 2,000 | | parent_links | 60,000 |
| enrollments | 60,000 | | schedule | 60,000 |
| subjects | 120 | | schools | 10 |

هر ۱۳ کوئری از **خودِ builderهای `server/dbquery.js`** ساخته و اجرا شد، نه
SQLِ دست‌نویس. همه اجرا شدند؛ هیچ‌کدام خطا نداد.

| کوئری | Execution Time |
|---|---:|
| students — محدودهٔ مدیر، صفحهٔ keyset | 0.083 ms |
| students — مدیر + فیلتر کلاس (`EXISTS`) | 0.193 ms |
| students — مدیر + جست‌وجوی `ILIKE` | 0.083 ms |
| students — محدودهٔ **دبیر** (`EXISTS` روی enrollments/classes/schedule) | **28.1 ms** |
| attendance — مدیر، یک تاریخ، `date DESC, id ASC` | 0.232 ms |
| attendance — محدودهٔ **ولی** (`EXISTS` روی parent_links) | 0.057 ms |
| attendance — محدودهٔ دانش‌آموز | 0.027 ms |
| grades — محدودهٔ مدیر، صفحهٔ keyset | **104.9 ms** 🔴 |
| grades — محدودهٔ دانش‌آموز | 0.047 ms |
| grades — محدودهٔ ولی | 0.099 ms |
| classes — مدیر + زیرکوئریِ `student_count` | 1.020 ms |
| users — مدیر + فیلتر نقش | 0.089 ms |
| users — سوپرادمین، بدون محدوده | 0.037 ms |

هیچ Seq Scan روی جدولِ پایه در کوئری‌های صفحه‌بندی‌شده دیده نشد (`B7`).

#### 🔴 یافتهٔ ۱ — `grades` با محدودهٔ مدیر ۱۰۵ میلی‌ثانیه است و هیچ Index نجاتش نمی‌دهد

```
Index Scan Backward using grades_pkey on grades g
  Filter: ((school_id IS NULL) OR (school_id = 1))
  Rows Removed by Filter: 648000        ← کلِ جدول پیمایش شد تا ۵۱ ردیف پیدا شود
  Buffers: shared hit=7831
Execution Time: 112.5 ms
```

`school_id` فقط یک **Filter** است، هرگز **Index Cond**. چهار حالت اندازه‌گیری شد:

| حالت | Execution |
|---|---:|
| الف) فعلی: `(school_id IS NULL OR school_id = $1)` | 177 ms |
| ب) + index جزئی روی `school_id IS NULL` | 128 ms |
| پ) + جابه‌جاییِ ترتیبِ دو بازو | 122 ms |
| **ت) فقط `school_id = $1`** | **0.285 ms** ← ~۳۷۰ برابر سریع‌تر |

هیچ ترفندِ Index‌سازی بازیابی‌اش نمی‌کند؛ فقط حذفِ بازوی `IS NULL` جواب
می‌دهد. **و آن حذف، تغییرِ معناست**، نه بهینه‌سازی:

```js
// server/middleware/scope.js:48
if (targetSchoolId == null) return true;          // checkSchoolScope
return records.filter(r => r.school_id == null || ...)  // filterByScope
```

یعنی مسیرِ JS عمداً ردیفِ بدونِ مدرسه را در محدودهٔ **همه** می‌داند و SQL
هم همان را آینه کرده. حذفِ یک‌طرفهٔ آن بازو، برابریِ دو مسیر را می‌شکند
(که `tests/wave3-query.js` می‌سنجد) و یک تصمیمِ tenancy است. **عمداً انجام
نشد.** پیشنهاد: یا `school_id NOT NULL` شود (که `IS NULL` همیشه خالی است —
در این دیتاست `grades` با `school_id IS NULL` = **۰** ردیف از ۷۲۰٬۰۰۰)، یا
مسیرِ JS و SQL هم‌زمان تغییر کنند. هر دو باید در یک موجِ هماهنگ انجام شوند.

**بازسنجیِ ۲۰۲۶-۰۹-۱۰ (کمینهٔ ۵ اجرا، نه تک‌اجرا):**

| حالت | min | median | max |
|---|---:|---:|---:|
| فعلی: `(school_id IS NULL OR school_id = $1)` | 103.627 ms | **105.168 ms** | 113.556 ms |
| فقط `school_id = $1` | 0.181 ms | **0.219 ms** | 0.344 ms |

یعنی ~**۴۸۰ برابر** روی میانه (جدولِ بالا که ~۳۷۰ برابر می‌گوید از
تک‌اجراها بود). plan بازسنجی‌شده هم همان است:
`Rows Removed by Filter: 648000`، `Buffers: shared hit=7831`.

#### ✅ یافتهٔ ۲ — cursor جدولِ `attendance` ترکیبی نبود و ۹۵٪ داده را دور می‌ریخت

`ORDER BY date DESC, id ASC` با cursorِ `id > $cursor` — یعنی cursor با
ترتیبِ مرتب‌سازی هم‌خوان نبود. اندازه‌گیری روی ۱۲۰٬۰۰۰ ردیفِ در محدوده،
صفحه‌های ۵۰۰تایی:

| | قبل | بعد |
|---|---:|---:|
| صفحهٔ پیمایش‌شده | ۱۳ | **۲۴۰** |
| ردیفِ یکتای رسیده | ۶٬۰۰۰ | **۱۲۰٬۰۰۰** |
| هرگز قابلِ دسترسی | ۱۱۴٬۰۰۰ (**۹۵.۰٪**) | **۰** |

`has_more` زودتر `false` می‌شد و بقیهٔ داده برای همیشه از دسترس خارج
می‌ماند. کنترل: فهرستِ `students` (که `ORDER BY id` و cursor روی `id` است)
همیشه ۰ ردیفِ گم‌شده داشت — یعنی باگ مختصِ مرتب‌سازیِ ترکیبی بود.

**اصلاح:** `compositeCursorKey()` در `server/dbquery.js` — cursor به
`"<date>|<id>"` کدگذاری می‌شود و WHERE به مقایسهٔ ردیف‌ارزش باز می‌شود:

```sql
((date < $1) OR (date = $2 AND id > $3))
```

`id` با `cast: Number` بایند می‌شود تا ستونِ integer رشته نگیرد. cursor عددیِ
ساده (کلاینت‌های قدیمی) به همان `id > $n` تنزل می‌کند — هرگز بدتر از قبل.
چهار فهرستِ دیگر چون `ORDER BY id` دارند دست‌نخورده‌اند (`A12`).

#### ✅ یافتهٔ ۳ — `migrations/001_initial.sql` روی یک دیتابیسِ خالی اصلاً اجرا نمی‌شد

۴۹ ارجاعِ `FOREIGN KEY … REFERENCES schools(id)` پیش از
`CREATE TABLE schools` (خطِ ۱۰۸۹) آمده بودند و چون کلِ فایل در یک تراکنش است:

```
ERROR: relation "schools" does not exist
```

همین برای `subjects` و `users` هم صادق بود. یعنی **migration هرگز روی
PostgreSQL واقعی اجرا نشده بود.** سه جدول به ابتدای فایل منتقل شدند
(ترتیبِ وابستگی: `schools ← subjects ← users ← بقیه`)؛ بازبررسیِ خودکار
اکنون **۰ ارجاعِ جلو** و هر ۹۰ جدول را تأیید می‌کند.

#### 🟡 یافتهٔ ۴ — هفت Index ویو ۳ در `schema.sql` بود ولی در `migrations/` نبود

`server/schema.sql` از ویو ۳ این هفت را داشت، `migrations/` هیچ‌کدام را —
پس دیتابیسی که از migration ساخته می‌شد **هیچ‌کدام** را نداشت. در
`migrations/007_wave3_query_indexes.sql` (+ `.down.sql`) افزوده شد.
(نخست با شمارهٔ `۰۰۴` ثبت شده بود که با `004_wave1_version_seq.sql` تصادم داشت؛ در ۲۰۲۶-۰۹-۱۱ به `۰۰۷` شماره‌گذاریِ مجدد شد — `docs/MIGRATION_DECISION.md`.)

**اما اندازه‌گیریِ A/B صادقانه:** در این توزیعِ داده تأثیرِ قابلِ اندازه‌گیری
نداشت. دورِ اول (۲۰۲۶-۰۹-۱۰) تک‌اجرا بود و ۱.۰–۱.۴ برابر داد؛ چون در
زیرِ میلی‌ثانیه تک‌اجرا نویز است، **دورِ دوم با کمینهٔ ۵ اجرا روی هر ۱۳
کوئری** تکرار شد. Indexها با `migrations/007_wave3_query_indexes.down.sql`
حذف (۰ از ۷ باقی) و بعد دوباره اعمال شدند (۷ از ۷):

| کوئری | بدون ۰۰۴ | با ۰۰۴ | نسبت |
|---|---:|---:|---:|
| students مدیر | 0.069 ms | 0.067 ms | 1.03× |
| students مدیر + class (EXISTS) | 0.197 ms | 0.147 ms | 1.34× |
| students مدیر + ILIKE | 0.077 ms | 0.074 ms | 1.04× |
| students معلم | 27.445 ms | 27.885 ms | 0.98× |
| attendance مدیر + تاریخ | 0.220 ms | 0.229 ms | 0.96× |
| attendance ولی | 0.087 ms | 0.055 ms | 1.58× |
| attendance دانش‌آموز | 0.028 ms | 0.030 ms | 0.93× |
| grades مدیر | 106.204 ms | 105.497 ms | 1.01× |
| grades دانش‌آموز | 0.048 ms | 0.042 ms | 1.14× |
| grades ولی | 0.103 ms | 0.112 ms | 0.92× |
| classes مدیر | 1.019 ms | 1.611 ms | 0.63× |
| users مدیر + نقش | 0.078 ms | 0.106 ms | 0.74× |
| users superadmin | 0.034 ms | 0.045 ms | 0.76× |

بازهٔ **۰.۶۳ تا ۱.۵۸ برابر** — یعنی در هر دو جهت نویز؛ سه مورد حتی با
Index **کندتر** شدند. پس نه تنها ادعای بهبود نمی‌کنیم، بلکه اگر کسی این
هفت Index را «بهینه‌سازی» بخواند، اندازه‌گیری اینجا خلافش را می‌گوید.

دلیلش در plan پیداست: با `ORDER BY id` و `LIMIT 51` برنامه‌ریز
`*_pkey` را ترجیح می‌دهد، چون با ۱۰ مدرسه حدود ۱۰٪ ردیف‌ها مربوط به
مدرسهٔ ۱ است و ۵۱ ردیف بعد از ~۵۱۰ پیمایش پیدا می‌شود. migration همچنان
درست است (drift بینِ `schema.sql` و `migrations/` را از بین می‌برد و وقتی
تعدادِ مدرسه‌ها زیاد شود — یا دادهٔ یک مدرسه در ابتدای بازهٔ id متمرکز
باشد — ضروری می‌شود)، ولی **ادعای بهبودِ عملکرد نمی‌کند.**

### گیتِ زنده — `tests/wave3-query3.js`

هیچ‌یک از `wave3-query.js`/`wave3-query2.js` باگِ cursor را نگرفتند، چون
**شکلِ** cursor را روی dbِ جعلی می‌سنجیدند نه پیمایشِ واقعیِ صفحه‌ها را.
سوئیتِ تازه دو بخش دارد:

- **A (بدونِ دیتابیس، ۱۸ چک):** جبرِ cursor — encoding، شکلِ `(a < v1) OR (a = v1 AND b > v2)`،
  بایندِ پارامتر، جهتِ `DESC/ASC` از spec، سازگاریِ عقب‌رو با cursor عددی،
  cursorِ خراب → بدونِ predicate، و اینکه `COUNT` هرگز cursor نمی‌گیرد.
- **B (با `DATABASE_URL`، ۷ چک، وگرنه self-skip):** هر ۸ builder اجرا
  می‌شود · **پیمایشِ `next_cursor` به همهٔ ردیف‌ها می‌رسد** · هیچ ردیفی دوباره
  برنمی‌گردد · کنترلِ `students` · مدیر هرگز ردیفِ مدرسهٔ دیگر را نمی‌گیرد ·
  جست‌وجوی متخاصم بی‌اثر است و جدول survives · هیچ Seq Scan روی جدولِ پایه.

```
node tests/wave3-query3.js                       →  ۱۸/۱۸  (۱ skip)
DATABASE_URL=postgres://… node tests/wave3-query3.js  →  ۲۵/۲۵
```

### دروازه‌ها (این دور)
smoke **۵۴۷/۵۴۷** · tests/run.js **۳۵/۳۵** · wave3-query **۱۳/۱۳** ·
wave3-query2 **۱۳/۱۳** · wave1-reads **۱۸/۱۸** · check-authz **۰** ·
secret-scan **۱۱/۱۱** · `build --check` ✅

---

## ۴. اقداماتِ باقی‌مانده

### ✅ انجام شد — ۲۰۲۶-۰۹-۱۰ (همین موج)
- **اجرایِ واقعی بر PG زنده + `EXPLAIN ANALYZE`** روی هر ۱۳ کوئریِ builder
  (§۳). این بند که در نسخهٔ چت ۲ «در محیطِ موج بعد» موکول شده بود، اکنون
  بسته است: PostgreSQL ۱۸.۴، `migrations/` اعمال‌شده، ۲.۱۹M ردیف، هیچ
  Seq Scan روی جدولِ پایه.
- **امنیتِ دامنه بر PG:** بخشِ B سوئیت `tests/wave3-query3.js` می‌سنجد که
  مدیر هرگز ردیفِ مدرسهٔ دیگر را نمی‌گیرد و جست‌وجوی متخاصم بی‌اثر است
  (۲۵/۲۵ با `DATABASE_URL`).

### ✅ انجام شد — ۲۰۲۶-۰۹-۱۲ (چت ۳)
- **گیتِ برابریِ فیلد‌به‌فیلدِ مسیرِ JS و مسیرِ SQL** — `tests/wave3-parity.js`:
  route-handlerهای واقعیِ `server/routes/*.js` دو بار صدا می‌خورند (یک‌بار
  `db=null` → مسیرِ JS؛ یک‌بار PG زنده → مسیرِ SQL از `dbquery`) و خروجی‌ها
  فیلد‌به‌فیلد مقایسه می‌شوند: id، ترتیب، فیلدهای غنی‌سازی (subject_name/
  student_name/student_count/homeroom_teacher_name)، و pagination (has_more/
  next_cursor/count/total) — از جمله پیمایشِ کاملِ چندصفحه‌ای با next_cursor
  روی هر چهار خانوادهٔ کرسر (id ASC، id DESC، مرکبِ date|id).
  اجرای زنده: PostgreSQL ۱۸.۴ (embedded، بیرونِ ریپو)، ۸ مهاجرت اعمال‌شده،
  ~۱۰۱k کاربر / ۳۶k حضور / ۱۵۷k نمره / ۳۰k کلاس در ۳ مدرسه —
  **۲۰/۲۰ سبز** (۱۶ سناریوی صفحهٔ اول + ۴ walk تا ۲۰هزار ردیف).
  گیت با جهش راستی‌آزمایی شد (`tests/wave3-parity-mutations.js` — **۵/۵ کشته**:
  ترتیبِ برعکس، نشتِ مهارِ مدرسه، غنی‌سازیِ خراب، کرسرِ مرکبِ شکسته،
  has_moreِ دروغین). بدونِ `DATABASE_URL` هر دو self-skip می‌شوند (الگوی
  بخشِ B) تا CI بدونِ دیتابیس قرمز نشود.
  همان دور، بخشِ B سوئیت `wave3-query3` هم روی این کلاستر **۲۵/۲۵** سبز شد
  (در مقیاسِ کوچک‌تر B7 به‌حق Seq Scan می‌دید — planner درست ایندکس را در
  جدول‌های چندهزارتایی به‌صرفه نمی‌داند؛ با ۳۰k کلاس/۱۰۰k کاربر سبز).

### ⏳ هنوز باز (به صراحت انجام نشد)
- **🔴 تصمیمِ tenancy دربارهٔ `school_id IS NULL`** (یافتهٔ ۱) — ۱۰۵ms تا
  ۰.۲۲ms، ولی یک‌طرفه قابلِ برداشتن نیست.
- **🟡 اجرایِ بخشِ B در CI** با یک سرویسِ PostgreSQL (الان self-skip می‌شود
  و در CI فقط ۱۸ چکِ بخشِ A می‌دود).
- **🟡 `CONCURRENTLY` برای Indexهای `004` روی دیتابیسِ تولیدی** — migration
  عمداً بدونِ آن است (در تراکنش اجرا می‌شود).
- (اختیاری) افزودنِ COUNTهایِ مجزا برایِ گریدهایِ کوچک به‌جای full-list.
