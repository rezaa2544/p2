# پروتکل همگام‌سازی (Sync / A01) — طراحی DB-native پایش

- **برنچ:** `arena/01a085ca-p2` (همان PR #39)
- **تاریخ:** ۲۰۲۶-۰۹-۰۹ (تهران)
- **چت:** چت ۲ · **موج:** Wave 4 (بخش قابل‌انجامِ امن)

> این سند، پروتکلِ هدفِ همگام‌سازی را تعریف می‌کند و وضعیتِ هر بخش را با صداقت
> ثبت می‌کند. **قیدِ کلیدی:** سندباکس هیچ PostgreSQL زنده/درایوری نداشت؛ بنابراین
> بخشِ «تأییدِ واقعی بر PG» و «بازنویسیِ push در یک تراکنش» این‌جا به‌عنوان
> **pending (الزامی پیش از تولید)** ثبت می‌شوند.

---

## ۱. معماریِ فعلی (پیش از این موج — خلاصه)

- **Pull** (`GET /api/v1/pull`): در حالتِ PG، از Wave 1 هر کالکشن از درِ
  `readCollection` (SELECT * از جدول) می‌آید؛ دلتا (`updated_at|created_at > since`)
  و scope در JS اعمال می‌شود.
- **Push** (`POST /api/sync`): لایهٔ عظیمِ امنیتیِ JS روی JSON استور (validation ·
  field-gate · scope · idempotency · OCC/base_version · conflict-preservation ·
  hookهای اعلان · virtual-day · dropout/IEP · audit). در پایان، عملیاتِ اعمال‌شده با
  `db.persistOpsBatch` **به‌صورت اتمیک به PG آینه** می‌شود (mirror؛ not source).
- **تومب‌استون:** حذفِ نرم در `store.tombstones` (سرویس REST) و `__deleted_records`
  (در sync) نگه‌داری می‌شود؛ pull در دلتا، `__deleted_records` را می‌فرستد.

---

## ۲. تغییراتِ این موج (Wave 4 — بخشِ امنِ قابل‌انجام)

### Pull → دلتای DB-native

- ماژولِ `server/syncdelta.js` — سازندهٔ SQL خالص:
  - `deltaRowsSql(table, {sinceISO, lastUpdatedAt?, lastId?})` — pushِ محمولِ
    `(created_at > $since OR updated_at > $since)` + ترتیبِ پایدارِ
    `ORDER BY updated_at ASC, id ASC` (تای-بریکرِ id برایِ هم‌مقدارِ
    `updated_at` = مدیریتِ **Clock Skew**، بدون ازدست‌دادنِ داده در مرزِ صفحه).
  - `deltaKeysetSql(...)` — کلیدِ ترکیبیِ `(updated_at, id)` با `LIMIT limit+1`
    برایِ پیجینگِ پایدارِ cursor (سنگ‌بنایِ حالتِ آیندهٔ pull کرسوری).
  - `tombstonesSql(...)` — خوانشِ سنگ‌قبر از جدولِ آمادهٔ `server_tombstones`.
- `server/pull.js` — در دلتایِ PG-زنده، ردیف‌هایِ هر کالکشنِ مقصد از `deltaRowsSql`
  می‌آیند (نه اسکنِ کل جدول). scope همچنان در JS روی همان ردیف‌هایِ محدود اعمال
  می‌شود (scope فقط حذف می‌کند، پس نمی‌تواند ردیفی خارج از پنجرهٔ دلتا اضافه کند).
- **Fallback امن:** اگر جدولی ستونِ زمان‌داشت نداشته باشد، کوئری خطا می‌دهد و
  pull شفاف به fetch کامل + فیلترِ JS دلتا برمی‌گردد (رفتار قبلی، بی‌تغییر).
- `server/schema.sql` — جدولِ آمادهٔ `server_tombstones` (idempotent).

> **چرا push را در یک تراکنشِ PG بازنویسی نکردیم (این دور):**
> `server/sync.js` (~۸۴۰ خط) موتورِ امنیتیِ push است که همهٔ گِیت‌ها را بر
> JSON استور می‌زند؛ تبدیلش به «همه‌چیز در یک تراکنشِ PG» بازنویسیِ عمیق و
> پرریسکی است که ۳۱ فایلِ تست sync را لمس می‌کند و بدون PGِ زنده **قابلِ تأیید
> نیست**. این را در §۴ به‌عنوان pending ثبت کرده‌ایم تا در محیطِ دارای PG (موجِ
> Writes) انجام شود.

---

## ۳. قراردادِ پاسخِ pull (ثابت می‌ماند)

```
GET /api/v1/pull?since=<iso>&collections=<c1,c2,…>
→ 200 {
    ok, server_time, since, full_snapshot,
    server_version,
    collections: { c: [ …rows after since, role-scoped ] },
    deleted: [ { c, id, at } ]            // tombstones (دلتا)
  }
```
کلاینت (`src/js/29-pull.js`) این قرارداد را درک می‌کند؛ تغییرِ سمتِ سرورِ این
موج، **قرارداد را نمی‌شکند** (همان شکلِ پاسخ، فقط منبعِ دلتا DB-native شد).

---

## ۴. وضعیتِ اجزا و کارهایِ باقی‌مانده

| جزء | وضعیت این موج | باقی‌مانده (پی‌وآیند) |
|---|---|---|
| Pull دلتا | ✅ DB-native (time-pushed؛ پشت `db.isPostgres()` + fallback) | تأییدِ واقعی بر PG |
| Cursor/keyset `(updated_at,id)` | ✅ builder (`deltaKeysetSql`) + تست | حالتِ pull کرسوری در پروتکل + کلاینت |
| Clock-skew | ✅ تای-بریکرِ id در builder (تست) | تأییدِ واقعی بر PG |
| Tombstone جدول (`server_tombstones`) | ✅ آماده (schema + builder) | **فعال‌سازی:** تا وقتی push/delete به PG ننویسد، pull همچنان سنگ‌قبر را از store می‌فرستد تا دادهٔ حذف گم نشود |
| Push در یک تراکنشِ PG | 🔲 **pending** (مستند) | بازنویسی با گیتِ امنیت/validation/OCC/audit در یک تراکنش + تأییدِ واقعی بر PG |

---

## ۵. دروازه‌ها (این موج)

smoke **۵۴۷/۵۴۷** · tests/run.js **۳۵/۳۵** · wave4-sync **۱۱/۱۱** ·
pull-bootstrap **۱۲/۱۲** · wave1-reads **۱۸/۱۸** · wave3-query **۱۳/۱۳** ·
wave3-query2 **۱۳/۱۳** · check-authz **۰** · secret-scan **۱۱/۱۱** ·
`build --check` ✅

> ⚠️ `node_modules` بین ترن‌ها در سندباکس ناپایدار است؛ برایِ سئوت‌های jsdom
> (`pull-bootstrap`، smoke) `npm ci` دوباره اجرا شد.
