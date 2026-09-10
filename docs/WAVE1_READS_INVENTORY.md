# Wave 1 — PostgreSQL Source of Truth · Part 1 — Reads Inventory

- **برنچ:** `arena/01a085ca-p2` (این سشن؛ PR از همین شاخه)
- **تاریخ:** ۲۰۲۶-۰۹-۰۹ (تهران)
- **دور/چت:** Wave 1 (بخش اول) — چت ۲
- **حوزه:** Inventory کاملِ مسیرهای خواندن سرور + انتقال `bootstrap` و `pull`

> ⚠️ **وضعیتِ صداقت (مهم):** تستِ واقعیِ PostgreSQL در این سندباکس انجام
> **نشده** — نه سرورِ PG در دسترس بود نه درایور `pg`؛ خواسته شد از fallback
> حافظه‌ای استفاده شود و قیدِ «آزمایشِ واقعی با PG = بعداً» صریح بماند.
> «درستکردنِ کد» (مهاجرتِ خوانش به لایهٔ یکپارچهٔ `db`) انجام و روی fallback
> حافظه‌ای سبز شده است؛ اجرای واقعیِ شاخهٔ PostgreSQL در دستورِ کارِ دورِ
> بعدی است (به بخش «اقداماتِ باقی‌مانده» بروید).

---

## ۰. خلاصهٔ یک‌صفحه‌ای

سامانه در حالتِ فعلی **دو-حالته** است (فایل `server/db.js`):

| حالت | منبعِ حقیقت | خوانش | نوشتن |
|---|---|---|---|
| بدون `DATABASE_URL` | JSON استور (`server/data/payesh.json`، در حافظه) | `store[...]` | روی JSON استور |
| با `DATABASE_URL` + درایور `pg` | PostgreSQL (آینهٔ نوشتن) | **پیش از این دور: همچنان `store`** | `db.persistOp*` → PG |

یعنی پیش از این دور، حتی وقتی PG وصل بود، **همهٔ خوانش‌های سرور از JSON استورِ
درون‌حافظه** می‌آمد — PG فقط آینهٔ **نوشتن** بود (sync + endpoint های نوشتاریِ
REST از راهِ `persistOp`). این موج می‌خواهد خوانش‌ها هم به PG منتقل شود.

این بخش (Part 1) این کار را با یک **درِ خوانشِ یکپارچه** در `db.js`
(`readCollection` / `readOne`) و اتصالِ دو مسیرِ پرارزشِ `bootstrap` و `pull`
به آن شروع می‌کند. بقیهٔ مسیرها در فهرستِ بخش ۳ «باقی‌مانده» ثبت و برای
بخش‌های بعدیِ موج مشخص شده‌اند.

---

## ۱. معماریِ فعلیِ خوانش (شواهدِ کد)

همهٔ کنترلرها از `server/index.js` با `ctx.store` ساخته می‌شوند و رکوردها را
مستقیم از آرایه‌هایِ استور می‌خوانند، مثلاً:

```
server/index.js:88   const store = loadStore();          // JSON → حافظه
server/index.js:92   db.init(store);                     // آینهٔ PG (اگر وصل)
server/index.js:299.. createSync/…({ store, db, … })
server/index.js:313.. create*Routes({ store, db, … })
server/index.js:318   createBootstrapRoute({ store, db })   // این دور: db اضافه شد
server/index.js:319   createPull({ store, db, … })          // این دور: db اضافه شد
```

`server/db.js` فقط مسیرِ **نوشتن** را پیاده داشت (`persistOp`, `persistOpsBatch`,
`isUidProcessed`, …) و متدِ عمومیِ `query()` در حالتِ حافظه‌ای `{rows:[],rowCount:0}`
برمی‌گرداند — یعنی برای خوانش از PG هیچ درِ آماده‌ای نبود.

### این دور اضافه شد (server/db.js)

```js
async function readCollection(name)   // PG: SELECT * FROM "<table>" · memory: (memoryStore[name]||[])
async function readOne(name, id)      // یافتن بر اساس id از readCollection
function isPgReadableTable(name)      // فقط جدول‌های واقعی؛ کلیدهای داخلی(__*) هرگز از PG نمی‌آیند
```

- در حالتِ memory، `memoryStore === store` است؛ بنابراین `readCollection(c)` دقیقاً
  همان آرایه‌ای را می‌دهد که پیش‌تر `store[c]` می‌داد → **رفتار حفظ شد**.
- در حالتِ PG، جدولِ `"c"` را `SELECT *` می‌کند (نامِ جدول با regex سفیدفهرستِ
  `^[a-z][a-z0-9_]*$` و ممنوعیتِ پیشوندِ `__` مهار می‌شود؛ بدون binder برای
  شناسه، پس سفیدفهرست امنیتِ SQL-injection را می‌دهد).
- کلیدهایِ داخلی استور (`__deleted_records`, `__server_version`, `__processed_uids`,
  …) **عمداً** از راهِ PG نمی‌روند و از خودِ استور سرو می‌شوند (این‌ها متادیتایِ
  runtime/سنگ‌قبر هستند، نه جدولِ رابطه‌ای).

### این دور اضافه شد (server/routes/bootstrap.js)

- `readCol(c)` — درِ خوانش: اگر `db.readCollection` موجود باشد از آن، وگرنه از `store`.
- در ابتدای `getBootstrapData`، همهٔ مجموعه‌های موردنیاز یک‌جا و به‌موازاتِ هم از
  `readCol` بار می‌شوند؛ همهٔ ارجاع‌هایِ مستقیمِ `store.X` حذف شد (بررسی: صفر موردِ
  `store.col` در فایل باقی مانده).

### این دور اضافه شد (server/pull.js)

- `readCol(c)` — همان درِ خوانش.
- واکشیِ ردیف‌هایِ هر کالکشنِ مقصد از `store[c]` به `await readCol(c)` تغییر کرد.
- **عمداً روی `store` ماند (مستند):** (الف) واکشیِ کلیدهایِ داخلیِ
  `__deleted_records`/`__server_version`؛ (ب) نگاه‌هایِ میان‌مجموعه‌ایِ
  `filterCollectionForSession` که «محدودهٔ نقشِ» جلسه را از
  `store.users`/`store.schedule`/`store.enrollments` می‌سازد. این‌ها کمکیِ
  scope هستند نه بارِ داده‌ایِ پاسخ؛ انتقالِ کامل‌شان به PG در بخشِ بعدیِ موج است.

---

## ۲. Inventory — هر endpoint و منبعِ خوانش

ستون‌ها: `فعلی` = این‌کجا می‌خواند پیش از این دور؛ `این‌دور` = پس از این دور؛
`بعدی` = آیا برایِ بخشِ بعدیِ موج باز است.

| # | Endpoint / تابع | فایل | خوانش‌هایِ اصلی | فعلی | این‌دور (Part 1) |
|---|---|---|---|---|---|
| 1 | `GET /api/v1/bootstrap` | `server/routes/bootstrap.js` | schools, notifications, classes, bell_schedules, subjects, sync_conflicts, schedule, enrollments, parent_links, users | `store` | ✅ **از راهِ `readCol` (db)** |
| 2 | `GET /api/v1/pull` (و دلتا/تومب‌استون) | `server/pull.js` | همهٔ کالکشن‌هایِ استانداردِ pull | `store` | ✅ **ردیف‌هایِ مقصد از `readCol` (db)** · scope/delta/تومب‌استون روی `store` (بعدی) |
| 3 | `GET /api/v1/students` | `server/routes/students.js` | users(role=student), enrollments, classes, schedule | `store` | 🔲 بعدی |
| 4 | `GET /api/v1/students/:id` | `server/routes/students.js` | users, parent_links | `store` | 🔲 بعدی |
| 5 | `GET /api/v1/classes` · `/:id` | `server/routes/classes.js` | classes, schedule, enrollments | `store` | 🔲 بعدی |
| 6 | `GET /api/v1/attendance` | `server/routes/attendance.js` | attendance, classes, schedule | `store` | 🔲 بعدی |
| 7 | `GET /api/v1/grades` · `/:id` | `server/routes/grades.js` | grades, classes, enrollments | `store` | 🔲 بعدی |
| 8 | `GET /api/v1/users` · `/:id` | `server/routes/users.js` | users | `store` | 🔲 بعدی |
| 9 | `GET /api/students/:id` (IDOR-گیت) | `server/idor.js` | users, parent_links | `store` | 🔲 بعدی |
| 10 | `GET /api/sync/conflicts` | `server/conflicts.js` | sync_conflicts, users | `store` | 🔲 بعدی |
| 11 | `GET /api/bell/now` | `server/bell.js` | bell_schedules, classes | `store` | 🔲 بعدی |
| 12 | `GET /api/public-report` | `server/public-report.js` | (تجمیعیِ مصوب) | `store` | 🔲 بعدی |
| 13 | `POST /api/admin/backup` (خواندن برای dump) | `server/admin.js` | کلِ استور | `store` | 🔲 بعدی (عمداً: بکاپ باید خودِ منبعِ حقیقت را بگیرد) |
| 14 | `POST /api/sms/send` (خواندنِ الگو/اولیا) | `server/sms.js` | users, notifications | `store` | 🔲 بعدی |
| 15 | `POST /api/auth/*` (خواندنِ کاربر) | `server/auth.js` · `server/middleware/auth.js` | users | `store` | 🔲 بعدی |
| 16 | `POST /api/sync` (persist به PG؛ UID-چک) | `server/sync.js` | خوانشِ محدود (UID, users برای scope) | `store`(+PG-write) | 🔲 بعدی |
| 17 | `delete-service` / `gdpr` / `outbox` / `revocation` | `server/*.js` | خوانشِ حذف/سنگ‌قبر/جعبه | `store` | 🔲 بعدی |

> ستونِ «فعلی» برای همه «`store`» است چون **پیش از این دور حتی با PGِ وصل،
> هیچ مسیرِ خوانشِ سروری از PG نمی‌خواند.** PG فقط آینهٔ نوشتن بود.

---

## ۳. کارهایِ باقی‌مانده برای بخش‌هایِ بعدیِ موج

1. **انتقالِ خوانشِ scope در `pull`:** نگاه‌هایِ میان‌مجموعه‌ایِ
   `filterCollectionForSession` (users/schedule/enrollments) و دلتا/تومب‌استون
   نیز از `readCol`/جدول‌هایِ PG بیایند.
2. **همهٔ REST route ها (۳–۸)** و **idor/bell/public-report/conflicts/auth/sms**
   به درِ `readCol` مهاجرت کنند (همان الگویِ bootstrap/pull).
3. **هم‌گامیِ schema و داده:** `server/schema.sql` (۸۰ جدول) باید با استورِ JSON
   همگام و seed شود تا خوانشِ PG، دادهٔ منطبق با JSON بدهد. (ابزارهایِ موجود:
   `tools/migrate-to-pg.js`, `server/seed.js`).
4. **بکاپ/بازیابی:** تصمیم که بکاپ از PG گرفته شود یا همچنان از منبعِ حقیقت.
5. **آزمایشِ واقعیِ PG:** اجرایِ شاخهٔ PostgreSQLِ `readCollection` و کل
   سناریوهایِ موج روی یک PGِ زنده (گیتِ آتی).

---

## ۴. تغییراتِ این بخش

| فایل | تغییر |
|---|---|
| `server/db.js` | افزودن `readCollection`, `readOne`, `isPgReadableTable` (درِ خوانشِ یکپارچه) + export |
| `server/routes/bootstrap.js` | خواندن از راهِ `readCol(db)`؛ حذفِ `store.X` مستقیم |
| `server/pull.js` | واکشیِ ردیفِ هر کالکشن از `readCol(db)`؛ بقیهٔ scope عمداً روی `store` |
| `server/index.js` | پاس دادنِ `db` به `createBootstrapRoute` و `createPull` |
| `tests/wave1-reads.js` | سئوتِ جدیدِ این بخش (۱۸ بررسی) |

---

## ۵. تست‌ها و گیت‌ها

| گیت | نتیجه |
|---|---|
| `node tests/wave1-reads.js` (جدید) | ✅ ۱۸/۱۸ |
| `node tests/pull-bootstrap.js` (موجود، pull را می‌سنجد) | ✅ ۱۲/۱۲ |
| `node tests/smoke.js` | ✅ (در پرانتزِ این گزارش ثبت شد) |
| `node tools/check-authz.js` | ✅ خروجی ۰ |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ |
| `node build.js --check` | ✅ |

> **نکتهٔ دقت:** چون تغییرها فقط سمتِ `server/` است، `build.js --check`
> (یکسانیِ `index.html`) دست‌نخورده است؛ اما برایِ رعایتِ گیت، اجرا شد و سبز است.

## ۶. اقداماتِ باقی‌مانده (به صراحت این‌جا انجام نشد)
- اجرایِ واقعی بر روی PostgreSQL زنده (هیچ PG/درایور در سندباکس نبود).
- انتقالِ همهٔ REST routes و scope در pull (بخش‌هایِ ۲ و ۳ موج).
- هم‌گامی/seedِ schema با استور.
