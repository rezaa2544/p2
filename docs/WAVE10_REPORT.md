# گزارش نهایی — Wave 10: Database Scale

**شاخه:** `feat/db-scale-wave10` (پایه: `main @ 7567607`) · **تاریخ:** ۲۰۲۶-۰۹-۱۱
**تأییدیهٔ پوش:** ✅ `git push` موفق → `git ls-remote origin feat/db-scale-wave10` = **`84b8a642f159a76f68436a9e250b909bed436f45`** (دقیقاً HEAD محلی)

---

## جدول گام‌ها

| گام | خروجی | وضعیت | تست |
|---|---|---|---|
| ۱ · **Read Replica Routing** | راستی‌آزمایی پیاده‌سازی نوبت اول (چت ۲): `db.queryRead` + مسیریابی `executePagedList` + `poolStats`/health + fallback شفاف به primary؛ خوانش‌های صحتِ پول عمداً روی primary | ✅ تحویل/راستی‌آزمایی‌شده | wave10-db-scale **۲۶/۲۶** |
| ۲ · **PgBouncer** | زیرساخت compose HA (نوبت موج ۱۶) + **تست قرارداد جدید** که پیکربندی را قفل کرد: transaction pooling، `max_client_conn=2000`، pool ‏25/5/5، `DEALLOCATE ALL`، auth_query بدون راز، پورت فقط 127.0.0.1، جفتِ `payesh`/`payesh-readonly` با `DATABASE_URL`/`READ_DATABASE_URL` | ✅ قفل‌شده با تست | wave10-pgbouncer **۲۲/۲۲** |
| ۳ · **طراحی Partitioning (grades/attendance)** | طراحی نهایی در `WAVE10_DB_SCALE.md` §۳: RANGE(created_at) سالانه + DEFAULT، PK ⇒ (id, created_at)، بازسازی همهٔ ایندکس‌ها، retention با تأیید وزارتی. **یافتهٔ مسدودکننده:** `persistOp` با `ON CONFLICT (id)` روی جدول پارتیشن‌شده نمی‌تواند ⇒ طرح چهارفازی (A: بازنویسی مسیر نوشتن → B: ساخت/کپی → C: swap → D: parity/drop) | 🟡 طراحی نهایی ✅ · اجرا pending (پیش‌نیاز فاز A + PG زنده) | — (قراردادی) |
| ۴ · **۱۴ ایندکس chg_id برای دلتا** | `migrations/008_delta_chg_id.sql` (+down): سکوئنس مشترک + ستون + تریگر idempotent + backfill + **۱۴ ایندکس `(chg_id)`** روی ۱۴ جدول تراکنشی دلتا · سازندهٔ `deltaRowsByChgSql` · `stripInternalColumns` (ستون داخلی هرگز به کلاینت نمی‌رسد) | ✅ کامل | wave10-chg-id **۳۱/۳۱** + جهش **۸/۸** |

## کامیت‌های شاخه (۳)

```
84b8a64 docs: Wave 10 — roadmap row 10 → in-progress + HANDOFF entry
caf00e1 feat(db): PgBouncer contract locked + final partitioning design for grades/attendance (steps 2+3)
87a4006 feat(db): delta change-ID infrastructure — migration 008 + 14 chg_id indexes + builder + row-shape parity (step 4)
```

## گیت‌های حیاتی (پس از هر مرحله + نهایی — همه سبز)

| گیت | نتیجه |
|---|---|
| smoke.js | **547/547** ✅ |
| check-authz.js | **0** ✅ |
| secret-scan.js | **11/11** ✅ |
| `node build.js --check` | ✅ |
| migration-sequence | **19/19** ✅ (ردیف ۰۰8 در MIGRATION_GUIDE §۸؛ `migrate-helper --next` = 009) |
| رگرسیون‌ها | db-engineering 14/14 · wave1-reads 18/18 · wave3-query 13/13 · wave4-sync · delta-sync-hardening 19/19 · pull-bootstrap 12/12 ✅ |

## تصمیم‌های مهندسی مهم (شفاف)

1. **۱۴ جدول = فهرست مهاجرت ۰۰۵ منهای `schools` و `bell_schedules`** — جداول تراکنشیِ per-school دلتا (users, classes, subjects, schedule, enrollments, attendance, grades, discipline, leaves, notifications, announcements, hw_submissions, counselor_refs, counselor_msgs).
2. **صداقت دربارهٔ ایندکس‌های chg_id:** هیچ کوئری production هنوز آن‌ها را نمی‌خواند — وصل‌کردن (cursor v3 با watermark) کار موج بعدی است و صریحاً در سند ثبت شد. تحویل‌شده: مهاجرت + سازندهٔ تست‌شده + پریتی شکل سطر.
3. **پارتیشن‌بندی اجرا نشد — با دلیل فنی مستند:** `ON CONFLICT (id)` با PK جدید `(id, created_at)` هم خطا می‌دهد (هدف conflict بی‌تطبیق) هم با فرم دوم idempotency را می‌شکند (id تکراری با created_at متفاوت). اجرای نابهنگام = خرابی upsert لایه DB. بازنویسی persistOp (فاز A) پیش‌نیاز است.
4. **تریگر chg_id روی مسیر upsert هم فعال است** (BEFORE INSERT OR UPDATE روی ON CONFLICT DO UPDATE) ⇒ persistOp بدون هیچ تغییری کار می‌کند و هر نسخهٔ سطر watermark تازه می‌گیرد.

## حوادث

- **`.git` و `node_modules` در بازیابی سندباکس از بین رفته بودند** — بازسازی از remote (init + fetch + checkout `origin/main`) و `npm install`؛ هیچ داده/تاریخی از دست نرفت (شاخه از `7567607` ساخته شد).

## پس‌ماندهای ثبت‌شده (صداقت کامل)

- تأیید مهاجرت ۰۰۸ و اجرای پارتیشن‌بندی بر **PostgreSQL زنده** (سندباکس PG ندارد) — همان قید نوبت اول موج.
- وصل‌کردن chg_id به پروتکل پول (cursor v3) — موج بعدی.
- بازبینی/مرج PR برای شاخهٔ `feat/db-scale-wave10` (آمادهٔ PR).

---

# نوبتِ سوم — Partitioning زنده + chg_id↔Cursor v3

**تاریخ:** ۲۰۲۶-۰۹-۱۱ · پایه: نوبتِ دوم (همان شاخه)

| قلم | خروجی | تست |
|---|---|---|
| **۵ · Partitioning (اجرا)** | `migrations/009_partition_grades_attendance.sql` +down — چهارفازی، تأییدِ زنده بر PG 17.11 با 180k سطر (کپی ~۵.۳s، EXPLAIN pruning، وارون‌سازیِ کامل)؛ persistOp با `PAYESH_PARTITIONED_TABLES` (UPDATE→INSERT→23505) | partitioning **۴۲/۴۲** |
| **۶ · chg↔cursor v3** | توکنِ v3 (+cw) · pre-read watermark · فیدِ byChg بدونِ time-guard · سازگاریِ v1/v2 · سقوط‌های نرم · دو فیکسِ coercion (cw=0 و type-strict verify) | chg_id_cursor **۳۳/۳۳** · delta-phase4 **۲۳/۲۳** (+جهش ۲۰/۲۰) |

برون‌یابیِ مقیاس: ~۳۵k سطر/s ⇒ ۵۰M ≈ ۲۴ دقیقه (مرتبهٔ بزرگی؛ §۷.۴ سند).
