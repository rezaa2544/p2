# Wave 10 — Database Scale: Partitioning · Read Replica · Connection Pooling

> موج ۱۰ (چت ۲) — تاریخ: ۲۰۲۶-۰۹-۰۹ · شاخه: `arena/01a085ca-p2` · PR #39
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
| **Partitioning** | **نبود** — `attendance`/`grades`/`notifications` جداولِ heap ساده‌اند | **طراحی ثبت شد** (پیاده‌سازی pending بر PG زنده) |
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

## ۳) پارتیشن‌بندی (DESIGN-ONLY — پیاده‌سازی pending بر PG زنده)

هیچ جدولِ بزرگی امروز پارتیشن نیست. طراحیِ پیشنهادی برای موجِ دارای PG:

### ۳.۱ جدول‌هایِ نامزد و کلیدِ پارتیشن
- `attendance`، `grades`، `notifications`، `staff_attendance`، `vclass_attendance`
  → **پارتیشنِ بازه‌ایِ زمانی** روی `created_at`/`date`.
- کلیدِ درستِ «دسترسی مدرسه» یعنی `school_id` در همهٔ این جدول‌ها هست، اما
  پارتیشنِ BY LIST روی `school_id` با ده‌ها هزار مدرسهٔ ملی پراکندگیِ بد می‌دهد
  (پارتیشن‌هایِ کج). بنابراین **پارتیشنِ RANGE بر مبنایِ زمان** (مثلاً ماهانه/
  سالانه) به‌علاوهٔ ایندکس‌هایِ موجودِ `(school_id, ...)` توصیه می‌شود.

### ۳.۲ شکلِ DDL پیشنهادی (برای اجرا در موجِ PG زنده)
```sql
-- جدولِ پایه باید به پارتیشن‌شده تبدیل شود (خلقِ جدید + migrate + dropِ قدیم):
CREATE TABLE attendance (
  id BIGSERIAL, school_id INTEGER, student_id INTEGER, class_id INTEGER,
  date TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, /* … */
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE attendance_y2024 PARTITION OF attendance
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE attendance_y2025 PARTITION OF attendance
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
/* … پارتیشن‌هایِ دوره‌ای + جدولِ DEFAULT برایِ آیندهٔ ناشناخته */
```
- با وجودِ PRIMARY KEY، کلیدِ پارتیشن باید داخلِ PK باشد → `PRIMARY KEY (id, created_at)`.
- FK هایِ فرزند (مثل `fk_attendance_school`) باید روی جدولِ پارتیشن‌شدهٔ والد بمانند.
- نگهداشتِ پارتیشن (archive/drop پارتیشن‌هایِ قدیمی، افزودنِ پارتیشنِ آینده) کارِ
  cron/مهاجرتِ جداگانه است.

> 🔴 **قید:** اجرایِ این DDL رویِ جدول‌هایِ موجود بدونِ PG زنده و بدونِ تستِ
> میگرِش تأیید **نشده** و نباید در این سندباکس اجرا شود. به موجِ دارای PG موکول شد.

---

## ۴) PgBouncer و لایهٔ استقرار (pending)

- App-side pooling (`pg.Pool`) در کد هست و بهینه‌سازی‌شده. در مقیاس ملی، توصیهٔ
  استاندارد افزودنِ **PgBouncer در حالت transaction** بین سرورهای Node و PostgreSQL
  است تا اتصالاتِ DB ثابت بماند (به‌ویژه با پاتریونی که در
  `RELIABILITY_DR_PLAN.md` تصویر شده).
- این لایه جزءِ استقرار/تأمین است، نه کدِ repo؛ به‌عنوانِ pending برایِ موجِ
  استقرار ثبت می‌شود. `READ_DATABASE_URL` به‌خوبی با مسیرِ PgBouncerِ خواندنی
  (replica) جفت می‌شود.

---

## ۵) دروازه‌ها و قیدها

- **تستِ این موج:** `tests/wave10-db-scale.js` → **۲۶/۲۶**.
- سایرِ دروازه‌ها (کدِ server تغییر کرد، پس سهمند اجرا شد): smoke **۵۴۷/۵۴۷**
  (jsdom، جدا از کدِ server) · `tools/check-authz.js` → **۰** ·
  `tests/secret-scan.js` → **۱۱/۱۱** · `build.js --check`.
- تست‌هایِ وابسته به db/dbquery سبز ماندند: wave1-reads، wave3-query(+2)، wave4-sync.
- **قیدِ صداقت:** اجرایِ واقعیِ read-replica و پارتیشن‌بندی بر PostgreSQL **pending**
  است (در سندباکس PG زنده وجود ندارد). این موج با fake-DB راستی‌آزماییِ انضباطِ
  مسیریابی (نوشتن→primary، GET-list سنگین→رپلیکا، fallback) را انجام می‌دهد.
