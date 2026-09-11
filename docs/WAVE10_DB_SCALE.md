# Wave 10 — Database Scale: Partitioning · Read Replica · Connection Pooling

> موج ۱۰ (چت ۲) — تاریخ: ۲۰۲۶-۰۹-۰۹ · شاخه: `arena/01a085ca-p2` · PR #39
> **نوبتِ دوم (Arena/Agent Mode):** ۲۰۲۶-۰۹-۱۱ · شاخه: `feat/db-scale-wave10` —
> تکمیلِ موج: قراردادِ PgBouncer قفل شد (§۴) · **مهاجرتِ ۰۰۸ chg_id + ۱۴ ایندکسِ
> دلتا** (§۶) · طراحیِ نهاییِ پارتیشن‌بندیِ grades/attendance با یافتهٔ مسدودکنندهٔ
> upsert (§۳).
>
> **نوبتِ سوم (Arena/Agent Mode):** ۲۰۲۶-۰۹-۱۱ — **اجرا و تأییدِ زنده بر PostgreSQL
> 17.11**: مهاجرتِ `009_partition_grades_attendance` (چهارفازی، با دادهٔ 180k)
> + رفعِ مسدودکنندهٔ persistOp (§۷) + **اتصالِ chg_id به کرسرِ v3** (§۸).
>
> **تصمیمِ کاربر (پاسخ به سؤالِ دامنه):** کدِ DB-layer (read-replica pool +
> routing + pool observability) با fake-DB پیاده و تست شد؛ **پارتیشن‌بندی فقط
> به‌صورت طراحی در این سند** ثبت شد (pending برایِ PG زنده). هیچ DDLِ مهاجرتیِ
> پارتیشن روی schema.sql موجود انجام نشد — بدونِ PG زنده قابلِ اجرا/تأیید نیست و
> smoke/run (jsdom) خطایِ DDL را نمی‌گیرد.

---

## ۱) خلاصهٔ وضعیت (قبل و بعد)

| مورد | وضعیتِ قبل | تغییرِ این موج |
|---|---|---|
| **Connection Pooling** | موجود — `server/db.js` از `pg.Pool` واقعی با min2/max20، timeout، auto-reconnect استفاده می‌کند | تقویت‌شده: pool هایِ primary و read-replica + مشاهده‌پذیری (`poolStats`/health) |
| **Read Replica** | **نبود** — هیچ `READ_*`، هیچ pool خواندنی، همهٔ خوانش‌ها روی pool نوشتن | **افزوده شد** — pool رپلیکای اختیاری (`READ_DATABASE_URL`) + `queryRead()` |
| **Partitioning** | **نبود** — `attendance`/`grades`/`notifications` جداولِ heap ساده‌اند | **اجرا و تأییدِ زنده (نوبت ۳):** مهاجرتِ ۰۰۹ — grades/attendance → `PARTITION BY RANGE (created_at)` سالانه + DEFAULT؛ persistOp با env-flag مسیرِ پارتیشن‌شده گرفت (§۷) |
| **PgBouncer** | **نبود** (سندِ RELIABILITY_DR_PLAN به آن به‌عنوان لایهٔ استقرار اشاره دارد) | ثبت در §۴ (استقرارِ pending) |

`server/db.js` همچنان تنها seamِ دسترسی به PG است — هیچ route مستقیماً به
`pg`/`pool` نمی‌رسد؛ این تک‌نقطه، افزودنِ رپلیکا را امن و کم‌ریسک کرد.

---

## ۲) Read Replica (افزوده — کد، تست‌شده با fake-DB)

### معماری و امنیتِ مسیریابی
- **نوشتن همیشه روی primary** می‌ماند: `persistOp`, `persistOpsBatch`/`transaction`
  (پایهٔ آینهٔ اتمیک P1-14) هرگز به رپلیکا نمی‌روند — رپلیکا read-only است.
- **خوانش‌هایِ صحتِ همگام/پول** (`readCollection`, `readOne`, دلتای pull) عمداً روی
  primary می‌مانند تا رپلیکا هرگز «نوشتهٔ تازهٔ خودِ کلاینت» را عقب نیندازد (بدون
  از دست رفتن در پول/همگام).
- **فقط خوانش‌هایِ سنگینِ GET-list** (مسیرِ DB-nativeِ موج ۳ = `dbquery.executePagedList`)
  از طریق `db.queryRead` به رپلیکا مسیردهی می‌شوند — همان‌ها که در مقیاس ملی پرهزینه‌اند.
- `queryRead()` **فقط SQLِ خواندنی** می‌گیرد؛ اگر رپلیکا پیکربندی/زنده نباشد یا
  خطا دهد، شفاف به primary برمی‌گردد (رفتار دقیقاً قبل).

### API جدید در `server/db.js`
- `queryRead(sql, params)` — کوئریِ read-only روی رپلیکا (fallback به primary).
- `isReplicaActive()` / `getReadPool()` — وضعیت و دسترسی.
- `poolStats()` — خلاصهٔ هر دو pool + پرچمِ `routing_reads_to_replica`.
- `healthCheck()` — بخشِ `read_replica` با شمارِ کل/آزاد/درانتظار.
- `init()` — بازکردنِ best-effort رپلیکا (شکست هرگز فاجعه نیست؛ به primary می‌افتد).
- `close()` — بستنِ هر دو pool.

### متغیرهای محیطی
```
DATABASE_URL        # primary (همان قبل)
READ_DATABASE_URL   # (جدید) رپلیکایِ فقط‌خواندنی — اگر نباشد، queryRead به primary می‌رود
READ_POOL_MIN       # (جدید) پیش‌فرض 2
READ_POOL_MAX       # (جدید) پیش‌فرض 10
```

### مسیرِ رفتِ خوانش‌هایِ GET-list (موج ۳)
`executePagedList` در `server/dbquery.js` اکنون وقتی `db.queryRead` موجود باشد از آن
استفاده می‌کند (page + count) وگرنه به `db.query` برمی‌گردد — سازگار با dbهایِ
جعلی/قدیمیِ تست.

### مشاهده‌پذیری در `/api/health`
هنگامِ PG زنده، پاسخِ `/api/health` میدانِ `db_pools` (= `poolStats()`) را دارد.

### تست (سبز، بدون PG — fake pool)
`node tests/wave10-db-scale.js` → **۲۶/۲۶**
- D0 memory fallback و رپلیکای خاموش · D1 فعال‌سازی · D2 مسیریابیِ read به رپلیکا
  (primary دست نمی‌خورد) · D3 fallback در شکستِ رپلیکا · D4 نوشتن همیشه primary
  · D5 readCollection/readOne روی primary · D6 executePagedList مسیرِ خوانشِ سنگین
  را به رپلیکا می‌برد + سازگاری db بدون queryRead · D7 poolStats/health · D8 close.

---

## ۳) پارتیشن‌بندی grades و attendance — طراحیِ نهایی (نوبتِ دوم)

اهداف بر پایهٔ `docs/CAPACITY_MODEL.md`: **grades ≈ ۲۸۸M رکورد/سال** و
**attendance ≈ ۵۰M رکورد/سال** — پرحجم‌ترین جداولِ تراکنشیِ per-school. هر دو
time-oriented هستند و الگویِ خواندنِشان (دلتای pull، گزارشِ ترم، کارنامه)
پنجرهٔ زمانی دارد ⇒ کاندیدای استانداردِ **RANGE پارتیشن روی `created_at`**.

### ۳.۱ قواعدِ طراحی (قفل‌شده)

1. **کلیدِ پارتیشن: `created_at` سالانه** (+ پارتیشنِ DEFAULT برایِ آیندهٔ
   ناشناخته — نوشتن هرگز به‌خاطرِ نبودِ پارتیشن نمی‌میرد). ماهانه در سالِ اولِ
   رول‌آوت اگرگرید می‌شود؛ ۲۸۸M/سال ÷ ۱۲ = پارتیشن‌هایِ ۲۴Mیی هنوز درشت‌اند —
   سالانه شروع، تقسیمِ بعدی با تصمیمِ benchmark.
2. **PK باید کلیدِ پارتیشن را شامل شود** ⇒ `PRIMARY KEY (id, created_at)`؛
   تمامِ unique indexها هم همین‌طور. یکتاییِ «خالصِ id» در سطحِ جدولِ
   پارتیشن‌شده **قابل‌اجبار نیست** (محدودیتِ ذاتیِ PostgreSQL).
3. **FKهای خارج‌شونده** (attendance→schools، grades→schools/users/classes/
   subjects) روی جدولِ پارتیشن‌شدهٔ والد می‌مانند (PG اجازه می‌دهد). **هیچ
   FKای به این دو جدول اشاره نمی‌کند** (با grep روی schema.sql اثبات شد) ⇒
   تبدیل، FK-گیر نیست.
4. **ایندکس‌های موجود همه بازسازی می‌شوند** روی والدِ پارتیشن‌شده:
   `(school_id)`، `(school_id, student_id)`، `(school_id, class_id)`،
   `(created_at DESC)`، `(updated_at)` (۰۰۵)، `(school_id, date DESC, id)` /
   `(school_id, id DESC)` (۰۰۷)، و **`(chg_id)` (۰۰۸)** — پارتیشن‌بندی ایندکس
   را به ازایِ پارتیشن تکرار می‌کند و prune + index-scan هم‌زمان ممکن می‌ماند.
5. **Retention با DROP PARTITION** (لحظه‌ای به‌جای DELETE میلیونی) — ولی برایِ
   نمرات محدودیتِ قانونیِ نگهداریِ مدرک هست: **هیچ پارتیشنی بدونِ تأییدِ سیاستِ
   آرشیوِ وزارتی حذف نمی‌شود**؛ پیش‌فرض = detach + archive (pg_dump پارتیشن) و
   نگهداری.

### ۳.۲ 🔴 یافتهٔ مسدودکننده — upsertِ لایهٔ DB

`persistOp` (server/db.js) با `INSERT … ON CONFLICT (id) DO UPDATE SET …`
آینه‌ی اتمیک push را می‌نویسد. روی جدولِ پارتیشن‌شده:

- `ON CONFLICT (id)` دیگر به constraintی اشاره نمی‌کند (PK حالا `(id,
  created_at)` است) ⇒ **خطای «no unique or exclusion constraint matching»**.
- `ON CONFLICT (id, created_at)` از نظرِ语法 معتبر است ولی **معنا عوض می‌شود**:
  سطرِ موجود با `created_at` متفاوت conflict نمی‌گیرد ⇒ همان id دو بار insert
  می‌شود — شکستنِ idempotency (تکراری‌شدنِ op در پوشِ دوباره) و خرابیِ شکلِ
  داده.

**نتیجه:** پارتیشن‌بندیِ این دو جدول **بدونِ بازنویسیِ مسیرِ نوشتن ممکن نیست**.
پیش‌نیازِ صریح (فاز A): persistOp برایِ جداولِ پارتیشن‌شده به الگویِ
UPDATE-then-INSERT (یا upsertِ plpgsql با قفلِ advisory) تغییر کند، پشتِ
پرچمِ `PAYESH_PARTITIONED_TABLES=grades,attendance` تا rollout تدریجی ممکن باشد.

### ۳.۳ طرحِ مهاجرتِ چهارفازی (zero-downtime، هنگامِ اجرا)

- **فاز A (کد):** بازنویسیِ persistOp پشتِ پرچم + تست‌های جهشی. بدونِ DDL.
- **فاز B (ساخت):** `attendance_p`/`grades_p` پارتیشن‌شده + پارتیشن‌هایِ سالانه
  از `MIN(created_at)` (از 001 برایِ سالِ جاری و دو سالِ آینده) + همهٔ
  ایندکس‌ها؛ کپیِ دسته‌ای با id-range (هر دسته ≤ ۱M ردیف، commit جدا)؛
  `ANALYZE`.
- **فاز C (جا‌به‌جایی):** در یک تراکنشِ کوتاه: `ALTER TABLE attendance RENAME
  TO attendance_old` → `attendance_p RENAME TO attendance` → بازسازیِ FKهای
  خارج‌شونده → `setval` جایگاهِ identity. `attendance_old` برایِ rollback
  می‌ماند.
- **فاز D (راستی‌آزمایی و پاک‌سازی):** parity (count/max(id)/checksum)،
  EXPLAIN با فیلترِ created_at (prune به پارتیشن‌هایِ مرتبط)، بعد ازِ دورهٔ
  اطمینان `DROP TABLE attendance_old`.

Down-migration: swapِ معکوس از `*_old` (فقط در پنجرهٔ C/D، قبل از drop).

### ۳.۴ شکلِ DDL (برای فاز B — اجرا فقط روی PG زنده)

```sql
CREATE TABLE attendance_p (
  id INTEGER GENERATED BY DEFAULT AS IDENTITY,
  school_id INTEGER, student_id INTEGER, class_id INTEGER,
  date VARCHAR(50), status VARCHAR(255), /* … ستون‌های 001 … */
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ,
  chg_id BIGINT,                                   /* مهاجرتِ ۰۰۸ */
  PRIMARY KEY (id, created_at),
  CONSTRAINT fk_attendance_school FOREIGN KEY (school_id) REFERENCES schools(id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
) PARTITION BY RANGE (created_at);
CREATE TABLE attendance_y2026 PARTITION OF attendance_p
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE attendance_default PARTITION OF attendance_p DEFAULT;
CREATE INDEX ON attendance_p (school_id, student_id);   /* … همهٔ ۳.۱.۴ */
CREATE TRIGGER trg_attendance_chg BEFORE INSERT OR UPDATE ON attendance_p
  FOR EACH ROW EXECUTE FUNCTION payesh_chg_bump();
```

> 🔴 **قید (پابرجا از نوبتِ اول):** اجرایِ این DDL بدونِ PG زنده و بدونِ
> تأییدِ فاز A تأیید نشده و در این سندباکس اجرا نمی‌شود. ثبتِ وضعیت:
> **طراحیِ نهایی ✅ · اجرا pending بر فاز A + PG زنده + benchmark**.

## ۴) PgBouncer — تحویل‌شده (زیرساختِ compose HA) + قراردادِ قفل‌شده

نوبتِ اول این بخش را «pending استقرار» ثبت کرد؛ نوبتِ دوم (۲۰۲۶-۰۹-۱۱) وضعیت را
به **تحویل‌شده** ارتقا داد — زیرساخت از موج ۱۶ (PR #46) در `infra/postgres/`
موجود است و این موج قراردادش را قفل کرد:

- `infra/postgres/pgbouncer/pgbouncer.ini` — **transaction pooling**،
  `max_client_conn=2000`، `default/min/reserve pool = 25/5/5`،
  `server_reset_query=DEALLOCATE ALL`، `server_lifetime=3600`،
  `query_timeout=300`؛ احرازِ هویت با `auth_query` به pg_shadow (هیچ رازی در
  فایل نیست).
- `infra/postgres/docker-compose.ha.yml` — سرویسِ pgbouncer (edoburu v1.23.1)،
  مونتِ read-only، پورتِ 6432 **فقط به 127.0.0.1**، healthcheck با pg_isready،
  وابستگیِ سالم به pg-primary.
- **جفتِ رپلیکا:** `payesh = pg-primary:5432` و `payesh-readonly =
  pg-standby:5432` — دقیقاً همان دو در که `DATABASE_URL` /
  `READ_DATABASE_URL`ِ `server/db.js` (§۲) می‌خوانند: روتینگِ رپلیکا و
  استخرِ اتصال در یک لایهٔ ورود جمع می‌شوند.
- قرارداد فازی: session-level features (LISTEN/NOTIFY، advisory lock، temp
  table) در حالتِ transaction گران/نادرست‌اند — برنامه در مسیرِ داغ این‌ها را
  ندارد (docs/HA_POSTGRES.md §۴).
- **تستِ نگه‌دارنده:** `tests/wave10-pgbouncer.js` — **۲۲/۲۲** (P1–P7: پارس،
  هر دو پایگاه، سقف‌های اتصال، auth بدونِ راز، سیم‌کشیِ compose، هم‌خوانی با
  کد، اسکنِ نبودِ راز).



---

## ۵) دروازه‌ها و قیدها (به‌روزِ نوبتِ دوم)

- **تست‌های این موج:**
  - `tests/wave10-db-scale.js` → **۲۶/۲۶** (نوبتِ اول: رپلیکا/روتینگ/pool)
  - `tests/wave10-pgbouncer.js` → **۲۲/۲۲** (نوبتِ دوم: قراردادِ PgBouncer)
  - `tests/wave10-chg-id.js` → **۳۱/۳۱** (نوبتِ دوم: مهاجرتِ ۰۰۸ + سازنده + پریتی)
  - `tests/wave10-chg-id-mutations.js` → همهٔ جهش‌ها کشته شوند
  - `tests/migration-sequence.js` → با ۰۰۸ سبز بماند
  - `tests/partitioning.js` → **۴۲/۴۲** (نوبتِ سوم: U1–U6 واحد + L1–L8 زنده بر PG 17.11)
  - `tests/chg_id_cursor.js` → **۳۳/۳۳** (نوبتِ سوم: کرسرِ v3 + سازگاریِ v1/v2 + pull)
- گیت‌های حیاتی پس از هر مرحله: smoke **۵۴۷/۵۴۷** · `tools/check-authz.js` →
  **۰** · `tests/secret-scan.js` → **۱۱/۱۱** · `build.js --check`.
- رگرسیون‌های سهممند: wave1-reads، wave3-query(+2)، wave4-sync،
  delta-sync-hardening، pull-bootstrap.
- **قیدِ صداقت (به‌روزِ نوبتِ سوم):** read-replica همچنان fake-DB است (تأییدِ
  نهایی موعودِ استیجینگ)؛ اما **پارتیشن‌بندی و مهاجرتِ ۰۰۸ دیگر pending
  نیستند** — روی PostgreSQL 17.11 زندهٔ سندباکس با فیکسچرِ نمایندهٔ 180k سطر
  (60k حضور + 120k نمره) اجرا و وارون‌سازی شدند (§۷). اجرای ۵۰M/۲۸۸M در
  سندباکس شدنی نیست؛ زمان‌سنجیِ اندازه‌گیری‌شده و برون‌یابیِ صادقانه در §۷.۴.

## ۶) دلتای مبتنی بر change-ID — مهاجرتِ ۰۰۸ (نوبتِ دوم، تحویل‌شده)

**چرا:** دلتای فعلی روی wall-clock است (`created_at|updated_at > since`) —
آسیب‌پذیر به clock-skew و وابسته به ساعتِ مناطق (فاز ۲ با keyset tie-breaker
نشانه را درمان می‌کند، علت را نه). یک شناسهٔ تغییرِ یکنواخت (monotonic) زمان را
از معادله حذف می‌کند: هر نسخهٔ سطر (INSERT یا UPDATE) یک مقدار از سکوئنسِ مشترک
می‌گیرد؛ فیدِ دلتا می‌شود `WHERE chg_id > $watermark` — مرتب، بدونِ skew.

**تحویل (کامیتِ این نوبت):**
- `migrations/008_delta_chg_id.sql` (+ `.down.sql`): سکوئنسِ `payesh_chg_seq` +
  ستونِ `chg_id BIGINT` + تریگرِ `BEFORE INSERT OR UPDATE` (روی مسیرِ
  `ON CONFLICT DO UPDATE` هم فعال می‌ماند ⇒ persistOp دست‌نخورده) + backfill +
  **۱۴ ایندکسِ `(chg_id)`** روی ۱۴ جدولِ تراکنشیِ دلتا (فهرستِ ۰۰۵ منهای
  schools/bell_schedules).
- `server/syncdelta.js` — `deltaRowsByChgSql(table, {afterChgId})`: سازندهٔ
  آمادهٔ فیدِ chg (همان allowlist).
- `server/db.js` — `stripInternalColumns`: ستونِ داخلیِ `chg_id` هرگز از لایهٔ
  DB بیرون نمی‌رود (readCollection/readOne/دلتای pull) — شکلِ سطرِ PG با حالتِ
  حافظه بایت‌به‌بایت یکی می‌ماند و هرگز به op کلاینت نمی‌رسد (validate.js آن را
  unknown_field می‌گرفت).
- **تست‌ها:** `tests/wave10-chg-id.js` **۳۱/۳۱** (C1–C7: قراردادِ مهاجرت،
  وارون‌سازی، سازنده، strip واحد/نشت‌نکردن، یکپارچگیِ pull) + جهش‌ها
  (`tests/wave10-chg-id-mutations.js`).

**صداقتِ کامل (سبزِ جعلی ممنوع):** این ۱۴ ایندکس **هنوز توسط هیچ کوئریِ
production خوانده نمی‌شوند** — وصل‌کردن (cursor v3 با watermarkِ chg_id،
سوئیچِ pull به `deltaRowsByChgSql`) کارِ موجِ بعدی است و همین‌جا ثبت شد. آنچه
امروز تحویل شد: زیرساختِ مهاجرت + سازندهٔ تست‌شده + پریتیِ شکل. سکوئنس با هر
نوشتن پیش می‌رود، پس watermarkهای آینده از همان روزِ مهاجرت معتبرند.

**ملاحظهٔ backfill در تولید:** جدولِ موجودِ عظیم (مثلاً ۱۰M+ ردیف) باید
backfill را دسته‌ای با id-range در پنجرهٔ نگهداری اجرا کند، نه تک-تراکنشِ
مهاجرت — در سربرگِ ۰۰۸ ثبت شد.

---

---

## ۷) پارتیشن‌بندی grades/attendance — اجرا و تأییدِ زنده (نوبتِ سوم)

**محیط:** PostgreSQL 17.11 زندهٔ سندباکس (`payesh_w10`)، چینِ کاملِ
`001→008` سپس `009` روی همان دیتابیس — دقیقاً مثلِ تولید: فیکسچر روی
**heap** درج شد و بعد ۰۰۹ اجرا شد تا مسیرِ کپیِ واقعی تست شود.

### ۷.۱ مهاجرتِ `009_partition_grades_attendance.sql` (+ `.down.sql`)

- **Phase A (attendance):** ساختِ `attendance_p` به‌صورتِ
  `PARTITION BY RANGE (created_at)` + پارتیشن‌های سالانهٔ `y2025`/`y2026`/`y2027`
  + `attendance_default` (ردیفِ ناشناخته ⇒ هرگز خطای routing نمی‌گیریم) ·
  کپیِ دسته‌ایِ ۵۰k-تایی با id-range · بازسازیِ **همهٔ ایندکس‌های زنجیره** روی
  والد (کلونِ خودکار به پارتیشن‌ها) · `setval` جایگاهِ identity.
- **Phase B (grades):** همان قرارداد؛ PK ⇒ **`(id, created_at)`** (تکرارِ id
  بین سال‌ها مجاز) + ایندکسِ غیر یکتای `(id)` برای مسیرِ UPDATE-by-id ·
  FKهای پنج‌گانه به schools/users/classes/subjects (DEFERRABLE INITIALLY
  DEFERRED) · **`created_at` روی هر دو جدول `NOT NULL`** و کپی با
  `COALESCE(created_at, updated_at, epoch)` (زنجیرهٔ قدیمی NULL مجاز داشت).
- **Phase C (swap در یک تراکنش):** `grades→grades_old`، `grades_p→grades`
  + رقصِ rename ایندکس‌ها/سکوئنس‌ها به نام‌های نهایی — نام‌هایی که
  `002/005/007/008` ساخته‌اند عیناً حفظ می‌شوند (کوئری‌های اپ بدونِ تغییر
  کار می‌کنند). `*_old` نگه داشته می‌شود (rollback بی‌درز).
- **تریگرِ `chg_id`** روی والدِ پارتیشن‌شده بازسازی شد (قراردادِ ۰۰۸) — تریگرِ
  partitioned table به همهٔ پارتیشن‌ها اعمال می‌شود.
- **`.down.sql`:** وارون‌سازیِ کامل — نوشته‌های پس از swap که در `*_old`
  نیستند اول به `*_recovered` نجات داده می‌شوند (چیزی بی‌صدا گم نمی‌شود)،
  بعد swap معکوس + حذفِ جدول‌های پارتیشن‌شده + پیش‌بردنِ identity.

### ۷.۲ رفعِ مسدودکنندهٔ `persistOp` (فاز A طراحیِ نوبتِ دوم)

مسیرِ legacy برای جدول‌های heap دست‌نخورده ماند. جدولِ نام‌برده در
`PAYESH_PARTITIONED_TABLES` (CSV؛ پیش‌فرض: خالی = رفتارِ قبل):

```
UPDATE … WHERE id=$id  → rowCount>0 ⇒ تمام
                       ↘ 0 ⇒ INSERT … (بدون ON CONFLICT)
                            ↘ SQLSTATE 23505 + id ⇒ UPDATE دوباره (باید بگیرد؛ وگرنه throw)
```

این همان idempotencyِ push را حفظ می‌کند: پوشِ دوبارهٔ همان op ⇒ UPDATE، نه
سطرِ دوم. سطرِ بدونِ id ⇒ INSERT مستقیم.

### ۷.۳ تأییدِ زنده (`tests/partitioning.js` — ۴۲/۴۲)

واحد (۱۶): persistOp با fake-client در هر ۵ حالت (legacy/update-only/
insert-only/23505/بدون-id) + قراردادِ متنِ ۰۰۹/۰۰9.down.
زنده (۲۶): چینِ 001→008 + فیکسچرِ heap (60k+120k در ~۵s) + ۰۰۹ (کپی+swap
~۵.۳s) ⇒ هر دو جدول `relkind=p` با PK جدید · پریتیِ شمار/MAX(id)/chg_id/
created_at · UPDATE ⇒ chg_id تازه · درج/upsert/حذفِ persistOpsBatch روی
پارتیشن‌شده · **EXPLAIN: هرسِ پارتیشن (فقط y2026 خوانده شد)** · فیدِ chg از
ایندکس (`…_chg_id_idx` روی هر پارتیشن؛ Index Scan، نه Seq) · فول‌پول ⇒
`chg_watermark` · وارون‌سازیِ کامل + بازیابیِ سطرِ پس از swap در
`grades_recovered`.

### ۷.۴ صداقتِ مقیاس — زمان‌سنجی و برون‌یابی

| اندازه‌گیری (PG 17.11 سندباکس) | عدد |
|---|---|
| درجِ فیکسچر heap (180k سطر، تریگرهای chg فعال) | ~۴.۷–۵.۰s |
| ۰۰۹: کپیِ 180k + ایندکس/FK/تریگر + swap | ~۵.۲–۵.۳s |
| نرخِ مؤثر کپی (با نگهداریِ ایندکس) | ~۳۵k سطر/s |

برون‌یابیِ خطی به **۵۰M سطر ≈ ۲۴ دقیقه** و ۲۸۸M ≈ ~۲.۳ ساعت — این فقط
مرتبهٔ بزرگی است، نه SLA: در تولید، I/O و shared_buffers و پراکندگیِ واقعیِ
created_at حاکم‌اند. توصیهٔ اجرایی: پنجرهٔ نگهداری + پایشِ لاگِ دسته‌ایِ ۰۰۹
(پیشرفتِ id-range) + `ANALYZE` پس از کپی. ۵۰M/۲۸۸M در سندباکس اجرا نشد و
ادعای سبزی برایش وجود ندارد.

### ۷.۵ درس‌های دیباگ (ثبت برای آینده)

1. **مرجعِ واقعیتِ دیتابیس، زنجیرهٔ `migrations/` است — نه `server/schema.txt`
   و نه schema اپ.** سه ستونِ grades فقط در اپ بود؛ DDL با آن‌ها شکست.
2. `EXPLAIN` روی جدولِ کوچک/بدون آمار: planner به‌جای ایندکس Sort می‌گیرد؛
   برای تستِ قطعیِ index-scan اول `ANALYZE` بعد واترمارک نزدیک MAX.
3. ایندکس‌های والدهای پارتیشن‌شده در EXPLAIN با نامِ فرزند ظاهر می‌شوند
   (`grades_y2026_chg_id_idx`) — تستِ قراردادی باید الگوی نام را ببیند.

## ۸) اتصالِ chg_id به کرسرِ v3 (نوبتِ سوم)

توکنِ **v3 = v2 + `cw`** (نشانگرِ آبِ change-ID): payload
`{v:3, since, cw?, iat, exp, jti, rg}` — `cw` غایب ⇒ مسیرِ زمانیِ v2.

- **pre-read:** پیش از هر خواندنِ داده، `MAX(chg_id)` هر ۱۴ جدولِ chg دار
  گرفته می‌شود (`captureChgWatermark`) — همان انضباطِ `startedAtIso`: ردیفی
  که وسطِ pull می‌آید حداکثر دوباره خوانده می‌شود، هرگز گم نمی‌شود. خروجی در
  پاسخ: `chg_watermark` + داخلِ `next_cursor`.
- **فید:** توکنِ v3ِ امضاشده با cw + جدولِ chg دار ⇒ `deltaRowsByChgSql`
  (`WHERE chg_id > $1 ORDER BY chg_id, id`) و **فیلترِ زمانیِ JS اجرا نمی
  شود** — آب مرجع است، نه ساعت (نوشتهٔ عقب‌بازگردِ updated_at سطر را گم
  نمی‌کند).
- **سازگاری (تست‌شده):** v1 تا TTL گذار · v2 مسیرِ زمانی · `?since=` legacy ·
  کلاینتِ v2 که `next_cursor` v3 می‌گیرد آن را opaque می‌داند و دفعهٔ بعد
  خودکار از فیدِ chg می‌آید — بدونِ هیچ تغییری در کلاینت.
- **سقوطِ نرم:** شکستِ pre-read ⇒ پاسخ بدونِ `chg_watermark` و توکنِ بعدی
  بدونِ cw (مسیرِ زمانی)؛ شکستِ فیدِ chg روی یک جدول ⇒ همان جدول از مسیرِ
  زمانی (داده گم نمی‌شود).
- **دو باگِ معنایی که تست‌های این نوبت گرفتند و همان‌جا فیکس شد:**
  1. `sign(…, null)` با coercionِ JS می‌ساخت **cw=0** ⇒ توکنِ بعدی فیدِ chg
     را از صفر می‌خواند (دلتای تمام‌جدول). حالا null ⇒ حذفِ cw.
  2. `verify` با `Number([1])===1` و `Number(true)===1` عبور می‌داد ⇒ حالا
     نوعِ JSON باید خودِ number باشد (fail-closed روی شکل).
- تست: `tests/chg_id_cursor.js` **۳۳/۳۳** (K: واحدِ v1/v2/v3 + cw بدشکل؛
  P: یکپارچگیِ pull با db جعلی — ۱۱ سناریو).
