# پروتکل همگام‌سازی (Sync / A01) — طراحی DB-native پایش

> **شواهد اتکاپذیری (دورهای ۱۱-۱۲ چت ۳):** ده سناریوی drill با integrity کامل + ۵ جهش کشته — [`SYNC_RELIABILITY_EVIDENCE.md`](SYNC_RELIABILITY_EVIDENCE.md)

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

| جزء | وضعیت | باقی‌مانده (پی‌وآیند) |
|---|---|---|
| Pull دلتا | ✅ DB-native (time-pushed؛ پشت `db.isPostgres()` + fallback) | ✅ **تأییدِ واقعی بر PG 18.4 زنده انجام شد** (فاز ۲ — §۶ همین سند + `docs/DELTA_HARDENING.md`) |
| Cursor/keyset `(updated_at,id)` | ✅ builder (`deltaKeysetSql`) + تست | ✅ **فاز ۲:** کرسرِ امضاشدهٔ pull با TTL + renewal سیم شد (`server/cursor.js`) |
| Clock-skew | ✅ تای-بریکرِ id در builder (تست) | ✅ تأییدِ واقعی بر PG (فاز ۲ — کوئری‌های دلتا از builder واقعی اجرا شدند) |
| Tombstone جدول (`server_tombstones`) | ✅ آماده (schema + builder) | **فعال‌سازی:** تا وقتی push/delete به PG ننویسد، pull همچنان سنگ‌قبر را از store می‌فرستد تا دادهٔ حذف گم نشود |
| Push در یک تراکنشِ PG | 🔲 **pending** (مستند) | بازنویسی با گیتِ امنیت/validation/OCC/audit در یک تراکنش + تأییدِ واقعی بر PG |

---

## ۶. Delta Hardening — فاز ۲ (۲۰۲۶-۰۹-۱۱)

سندِ کامل: **`docs/DELTA_HARDENING.md`** (طراحی + شواهد + اجرای زنده). خلاصهٔ قراردادی:

### ۶.۱ دلتای کهنه (گپ ۱)
`since` کهنه‌تر از `PAYESH_DELTA_MAX_AGE_DAYS` (پیش‌فرض ۷ روز) ⇒ پاسخ **خودِ اسنپ‌شات کامل** است +
`full_snapshot_required: true` + `full_snapshot_reason: 'since_too_old'`؛ تومب‌استون‌های بعد از `since`
همچنان برمی‌گردند (کلاینتِ قدیمی هم جمع می‌شود). کلاینت در اسنپ‌شاتِ کامل مجموعه‌ها را **جایگزین** می‌کند
(ردیف‌های صفِ آفلاین محفوظ). `server_time`/کرسرِ بعدی از **لحظهٔ شروعِ خواندن** بریده می‌شود.

### ۶.۲ کرسرِ امضاشده با TTL (گپ ۲)
- توکن `pc1.<b64>.<hmac-sha256>` با payload `{v:1, since, iat, exp, jti}` — ماژول `server/cursor.js`.
- TTL پیش‌فرض **۱ ساعت** (`PAYESH_CURSOR_TTL_S`؛ clamp ۶۰..۸۶۴۰۰). کلید: `PAYESH_CURSOR_SECRET` یا
  اشتقاقِ domain-separated از کلید JWT. بدون کلید ⇒ کرسر غیرفعال (fail-closed)، ‏`since` legacy سالم.
- `GET /api/v1/pull?cursor=<token>`: منقضی ⇒ ‏**401 `cursor_expired`** · دستکاری‌شده ⇒ ‏**401
  `cursor_invalid`** (+ `cursor_renewal: 'full_pull'`). sinceِ توکن بر `?since=` ادعایی مقدم است.
- هر ۲۰۰ پاسخ: `next_cursor` تازه + `cursor_ttl_s`. کلاینت خودکار تمدید می‌کند (یک pull کامل، بدون حلقه).

### ۶.۳ ایندکس‌های دلتا (گپ ۳ — یافتهٔ اجرای زنده)
`migrations/005_delta_sync_updated_at_indexes.sql` (+down): شانزده ایندکس `updated_at` — قبل از آن
پلنِ دلتا Parallel Seq Scan بود (۳۷.۴ms روی grades با ۳۲۳K ردیف؛ زیر بارِ ۱۰۰۰ درخواست ‏p50≈۴s)؛ بعد از
آن BitmapOr روی `(created_at ∪ updated_at)` — ‏**p50=۴۷۲ms و ۱٬۱۵۷ req/s در همان burst** (A/B کامل در
`docs/DELTA_HARDENING.md` §۳). قید: روی تولید با `CONCURRENTLY` اعمال شود.

### ۶.۴ سنجهٔ تعارض (گپ ۴)
هیستوگرام `payesh_sync_conflict_detection_seconds{outcome=conflict|stale|clean}` (باکت‌های میلی‌ثانیه‌ای)
در `server/sync.js` روی گیتِ OCC ثبت می‌شود — زمانِ یافتن+مقایسه، پیش از ثبتِ تعارض؛ R1 رعایت شده.
شاهد دو-کلاینتِ موازی: `tests/delta-sync-hardening.js` DH15–DH17.

---

## ۶. فاز ۴ — Backpressure · Compression · Warmup · Metrics · Region (2026-09-11)

پنج شکافِ مقیاس‌پذیری روی شاخهٔ `feat/delta-phase4` (پایه: main @ `6dbef89`، PR #68).
جزئیاتِ کامل و اعداد در **`docs/DELTA_HARDENING_PHASE4.md`**؛ خلاصه:

1. **Backpressure:** پنجرهٔ op وزن‌دار per-session (`sync:ops`، 60s،
   `PAYESH_SYNC_OPS_PER_MIN` پیش‌فرض ۵۰۰۰) — رد ⇒ 429 `sync_backpressure` +
   `retry_after_s`/`Retry-After` بدونِ اعمال؛ کلاینت pending می‌ماند و با
   `max(retry_after, backoff)` دوباره می‌آید؛ `incrByWithTtl` اتمیک (Lua/حافظه).
2. **Compression:** `server/compress.js` — gzip ارجح/br جایگزین، آستانهٔ ۱KB،
   fallback به sendJson (هارنس قدیمی/خطای zlib)، `Vary: Accept-Encoding`؛
   868.9KB → 51.8KB gzip (۶٪) در فیکسچرِ ۳۰۰۰ ردیف.
3. **Warmup:** کلیدِ کرسر از پیش پایدار بود (keyfile/env)؛ حالا دیده می‌شود:
   `cursor.keySource`، لاگِ بوت، `/api/health` ⇒ `cursor:{enabled,persistent,
   key_source}`، هشدارِ رازِ کوتاه؛ تستِ بوتِ واقعی ×۲ همان keyfile.
4. **Metrics:** `/api/health` ⇒ `sync:{pulls_total, pulls_delta, pulls_full,
   pushes_total, conflicts_total, backpressure_rejections_total,
   cursor_expired_total, cursor_region_mismatch_total, delta_size_bytes_avg,
   delta_wire_bytes_avg, compressions_total}`.
5. **Region:** کرسرِ v2 با `rg` از `PAYESH_REGION`؛ توکنِ بین‌منطقه‌ای ⇒ 401
   `region_mismatch` + `cursor_renewal:'full_pull'` (کلاینت بدونِ تغییر)؛ v1 تا
   TTL گذار.

گیت‌ها: smoke 547/547 · check-authz 0 · secret-scan 11/11 · build --check ·
delta-sync-hardening 19/19 · wave4 13/13 · wave10 14/14 · pull-bootstrap 12/12 ·
contract-layers 18/18 · delta-schema-gaps 12/12 · **delta-phase4 23/23 ·
mutations 20/20** ✅

---

## ۷. کرسرِ v3 — دلتای change-ID (Wave 10 · 2026-09-11)

توکنِ **v3 = v2 + `cw`**: payload `{v:3, since, cw?, iat, exp, jti, rg}`.
`cw` (نشانگرِ آبِ change-ID = بیشینهٔ `chg_id` دیده‌شده؛ مهاجرتِ ۰۰۸) غایب
باشد ⇒ توکن عیناً مسیرِ زمانیِ v2 می‌رود.

### ۷.۱ قراردادِ سیم (wire)

- هر پاسخِ ۲۰۰ pull که کرسر فعال است، دو فیلدِ additive دارد:
  - `chg_watermark: <int>` — pre-read شده پیش از خواندنِ داده (`MAX(chg_id)`
    روی ۱۴ جدولِ chg دار؛ انضباطِ `startedAtIso`: دوباره‌خواندنِ حداکثری،
    گم‌شدنِ صفر).
  - `next_cursor` — توکنِ v3؛ اگر pre-read ممکن نشد، بدونِ `cw` صادر می‌شود.
- کلاینتِ v3 در دلتای بعدی `?cursor=` همان توکن را می‌فرستد ⇒ جدول‌های chg
  دار از فیدِ `WHERE chg_id > cw ORDER BY chg_id, id` می‌آیند و
  **فیلترِ زمانیِ JS برایشان اجرا نمی‌شود** — آب مرجع است، نه ساعت
  (نوشتهٔ عقب‌بازگردِ `updated_at` سطر را گم نمی‌کند).
- شکلِ سطر ثابت ماند: `chg_id` هرگز از لایهٔ DB بیرون نمی‌رود
  (`stripInternalColumns`).

### ۷.۲ ماتریسِ سازگاری (همه تست‌شده — `tests/chg_id_cursor.js` ۳۳/۳۳)

| کلاینت | رفتار |
|---|---|
| v3 با cw | فیدِ chg برایِ ۱۴ جدولِ chg دار؛ جدول‌های دیگر (schools/…) مسیرِ زمانی |
| v3 بدون cw | مسیرِ زمانی (سقوطِ نرم: شکستِ pre-read) |
| v2 | مسیرِ زمانی؛ `next_cursor`ِ دریافتی v3+cw است (opaque) ⇒ دفعهٔ بعد خودکار فیدِ chg |
| v1 | گذارِ استقرار — تا TTL خودش پذیرفته می‌شود |
| `?since=` legacy | مثلِ همیشه (بدونِ توکن ⇒ بدونِ فیدِ chg) |

خطاها: cw بدشکل در payload ⇒ ‏401 `cursor_invalid` (نوعِ JSON باید خودِ
number باشد) · منطقهٔ دیگر ⇒ 401 `region_mismatch` — هر دو با
`cursor_renewal:'full_pull'`.

### ۷.۳ سقوط‌های نرم (fail-open روی داده، fail-closed روی امنیت)

- شکستِ `MAX(chg_id)` (ستون نیست/DB سرفه کرد) ⇒ کلِ ویژگی در همان پاسخ خاموش:
  بدونِ `chg_watermark`، توکنِ بعدی بدونِ cw. فیدِ chg با cwِ **توکنِ
  امضاشده** همچنان کار می‌کند (cw از پیش معتبر است).
- شکستِ فیدِ chg روی یک جدول ⇒ همان جدول از مسیرِ زمانی (داده گم نمی‌شود).

جزئیاتِ کامل: `docs/WAVE10_DB_SCALE.md` §۸.

---

## ۵. دروازه‌ها (این موج)

smoke **۵۴۷/۵۴۷** · tests/run.js **۳۵/۳۵** · wave4-sync **۱۱/۱۱** ·
pull-bootstrap **۱۲/۱۲** · wave1-reads **۱۸/۱۸** · wave3-query **۱۳/۱۳** ·
wave3-query2 **۱۳/۱۳** · check-authz **۰** · secret-scan **۱۱/۱۱** ·
`build --check` ✅

> ⚠️ `node_modules` بین ترن‌ها در سندباکس ناپایدار است؛ برایِ سئوت‌های jsdom
> (`pull-bootstrap`، smoke) `npm ci` دوباره اجرا شد.
