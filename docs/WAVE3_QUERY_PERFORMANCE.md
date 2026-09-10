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

### `EXPLAIN ANALYZE` — ثبت‌نشده (pending) 🔴
هیچ PG زنده نبود تا `EXPLAIN ANALYZE` اجرا شود. دستورِ کاریِ مدل:
```sql
EXPLAIN ANALYZE SELECT * FROM users u
WHERE u.role='student' AND (u.school_id IS NULL OR u.school_id=1)
ORDER BY u.id ASC LIMIT 51;
```
این گام به‌همراهِ گیتِ برابری/مجوز بر PG واقعی، در محیطِ دارای PG (موج بعد) اجرا
می‌شود و نتیجه این‌جا به‌روز خواهد شد.

### دروازه‌ها (این دور — بخش دوم)
smoke **۵۴۷/۵۴۷** · tests/run.js **۳۵/۳۵** · wave3-query **۱۳/۱۳** ·
wave3-query2 **۱۳/۱۳** · wave1-reads **۱۸/۱۸** · check-authz **۰** ·
secret-scan **۱۱/۱۱** · `build --check` ✅

---

## ۴. اقداماتِ باقی‌مانده (به صراحت این‌جا انجام نشد)
- اجرایِ واقعی بر PG زنده + `EXPLAIN ANALYZE` + گیتِ برابریِ بایت‌به‌بایت و
  امنیتِ دامنه بر PG (الزامی پیش از تولید). اکنون **هر پنج** GET-listِ
  پرترافیک (students/attendance/grades/classes/users) به DB-native مجهزند؛
  تأییدِ runtime بر PGِ واقعی در محیطِ موج بعد انجام می‌شود.
- (اختیاری) افزودنِ COUNTهایِ مجزا برایِ گریدهایِ کوچک به‌جای full-list.
