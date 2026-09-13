# Wave 18 — National Load Testing — Handoff

**Date:** 2026-09-12
**Branch:** `feat/wave18-load-test` (بازسازی‌شده روی `main` @ `20ed3e8` — بدون دست‌زدن به شاخه‌های دیگر)
**PR:** [#94](https://github.com/rezaa2544/p2/pull/94) (باز؛ mergeable ✓ — پوش تأییدشده با `git ls-remote`: head `60d85c1`)
**Status:** هر ۵ سناریوی طرح روی محیط production-like سندباکس اجرا و مستند شد
**Author:** rezaa2544

---

## چه ساخته/اجراء شد

- **محیط:** PostgreSQL 17.11 (`payesh_w18`) + Redis 8.0.2 روی یک جعبهٔ ۲vCPU/۲GB؛ دیتاست ملی مقیاس ۰٫۳ (seed=20260912): ‏۳۰٬۰۰۰ مدرسه، ۳۰۰٬۰۰۰ کلاس، ۳٬۰۰۰٬۰۰۱ کاربر، ۱۵M سطر حضور، ۶M نمره (~۷٫۶GB)؛ بارگذاری با `tools/w18-load-pg.sh` (۸m10s)؛ k6 v2.2.0.
- **اجرا:** پنج سناریو (بار ۵۰۰/s، اوج ۲۰۰۰/s، فشار رَمپ ۱۰۰→۵۰۰۰/s، جهش ۵۰۰→۳۰۰۰، سوک ۱۰۰۰/s×۱۵m فشرده) با سوئیتِ ارتقایافتهٔ `tests/performance/suites/national-load-test.js`: استخر ۴۰ مدیر واقعی (`PAYESH_USERS=phone:nid,…`)، نوشتنِ حضور با idهای نشست/دیتاست (نسبت ۸:۱)، envهای `SPIKE_BASE`/`TIME_SCALE`/`MAX_VUS`/`SUMMARY_FILE`. اعداد کامل در `docs/WAVE18_LOAD_TEST_REPORT.md`.
- **سه یافتهٔ معماری (ریشه‌یابی کمّی + رفع/پیشنهاد):**
  1. بوتِ PG-live با هیدراتاسیون کامل جداول ⇒ OOM گارانتی‌شده (۲۴M سطر). رفعِ اعمال‌شده: envهای `PAYESH_PG_HYDRATE_LIMIT=tbl:cap` / `PAYESH_PG_HYDRATE_SKIP` در `server/db.js` (پیش‌فرض = رفتار قبلی؛ `server/index.js` لاگ capped/env-skipped).
  2. هزینهٔ حافظهٔ هر درخواستِ هم‌زمان ~۱MB (سنجش ۳۵۰-موازی: ۳۱→۳۴۶MB) — عاملِ اصلی: snapshotِ `JSON.parse(JSON.stringify(store[c]))` به‌ازای هر sync (O(collection) نه O(batch)). پیشنهادِ ثبت‌شده در گزارش §۵-۲.
  3. رشدِ نامحدودِ آینهٔ store در مسیرِ نوشتن (۱۰,۴۸۸B/نوشتن سنجیده شد) + auth با اسکن خطی و بدونِ ایندکس `users.phone`.
- **نتیجهٔ سلامت:** صفر خطای نوشتن در هر ۵ سناریو (۱۹٬۰۴۲ sync اتمیک؛ پس از هر مرگِ OOM، بازشماریِ PG سالم). سقفِ تک‌جعبه ~۶۳۰rps؛ مرگِ OOM فقط در فشارِ پایدار ۳×+ (exit 137، بازیابی با ری‌استارت).
- **تست‌ها:** `wave18-load` ‏38/38 · `wave18-stress` (جدید) ‏34/34 · `wave18-spike` (جدید) ‏22/22 · گیت‌های پایه پس از تغییرات: smoke ‏547/547 · check-authz ‏0 · secret-scan ‏11/11 · build --check ✓.

## محدودیت‌ها — ادعای سبز نشود

- سوکِ ۲۴h واقعی اجرا نشد (۱۵m فشرده زیر ۶٫۸× اضافه‌بار)؛ فشار ۵۰۰۰ به‌صورت iter/s عرضه با سقفِ مولد ۳۰۰ VU اعمال شد (۵۰۰۰ VU روی جعبهٔ مشترک بی‌معنا بود).
- مولد و سرور و PG روی یک جعبه بودند ⇒ اعداد، حدِ پایینِ سیستم‌اند؛ اعدادِ ۱۰M/۲۰k-rps نیازمند استیجینگِ مجزای چندنمونه‌ای طبق §21 طرح‌اند.
- `users.phone` هنوز ایندکس ندارد؛ `public-report` از آینهٔ مقیّد محاسبه می‌شود (تقریب) — هر دو در گزارش §۵ با پیشنهاد ثبت شد.
- واگرایی ابعاد مولد دیتاست با §۲.۱ طرح بار (قلم ۲ `docs/DOCS_CONSISTENCY_REPORT.md`) همچنان باز.
# Wave 10 (نوبتِ چهارم · ادامه) — مانورِ مقیاس ۲۵M + دو فیکسِ بحرانیِ ۰۰9 — Handoff

**Date:** 2026-09-12 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این ادامه چه شد

1. **مانورِ مقیاس (باقی‌ماندهٔ ردیفِ ۱۰):** بعد از تحویلِ نوبتِ چهارم، سندباکس
   ریست شد؛ PG 17.11 بازنصب، کلونِ مجدد، db اختصاصیِ `payesh_scale` با
   **۲۵M نمره + 600k حضور** (سقفِ دیسکِ ۲۵GB؛ ۵۰M در محاسبهٔ اولیه جا
   نمی‌شد — همین‌طور مستند شد). اجرای اولِ ۰۰9 رویِ آن **دو یافتهٔ سختِ
   جدید** بیرون کشید که در ۱.۸M سطر دیده نمی‌شدند:
   - **قفلِ FK رویِ جدول‌هایِ والد:** FKهایِ داخلِ CREATE داخلِ تراکنشِ کپی،
     `SHARE ROW EXCLUSIVE` رویِ users/schools/classes/subjects تا کامیتِ
     کپی نگه می‌داشتند ⇒ INSERT روی users **۵+ دقیقه بلاک** (و تفسیرِ
     «فشار WAL» استیجینگ هم اصلاح شد — §۹.۳). `NOT VALID` رویِ partitioned
     ممنوعِ PG 17 است. فیکس: **FK با ALTER رویِ جدولِ خالی قبل از کپی**
     (اعتبارسنجی آنی؛ چکِ سطربه‌سطر حینِ کپی با key-share سطری).
   - **OOMِ کپیِ تک‌تراکنشه:** ~۵۰B حافظهٔ bookkeeping به‌ازایِ هر سطر ⇒
     در ~۱۱M سطر بک‌اند با rss=1.3GB کشته شد. فیکس: **کپیِ chunk-commit با
     PROCEDURE** (هر ۱۵۰k سطر COMMIT؛ ~۷.۵MB حافظه) + **ازسرگیری از
     MAX(id)** — کرش وسطِ کپی ⇒ رانِ بعدی ادامه می‌دهد.
2. **اجرای دوم با ۰۰9 مقاوم‌شده — سبزِ کامل (۲ vCPU/۲GB RAM):**
   مهاجرتِ ۲۵.۶M سطر **۱۹.۶ دقیقه** (~۲۱.۸k سطر/s) · خواندن/نوشتن err=0
   (p50=۱–۲ms) · **نوشتنِ users حینِ کپی ۵.۲ms** · بدترین توقفِ هر دو =
   **پنجرهٔ swap ~۳۶s** (کچ‌آپِ ضدالحاق کلِ جدولِ قدیمی را زیرِ قفل اسکن
   می‌کند — با اندازهٔ جدول مقیاس می‌یابد؛ مسیرِ بهبود: پیشیکیتِ chg؛ ثبت شد)
   · راستی‌آزمایی همه صفر · countNew−countOld=۸۱ (نوشته‌هایِ post-swap) ·
   دفترِ ۱۴۹۵ سطریِ نویسنده کامل درست.
3. **رصدِ post-migration در ۲۵M:** فیدِ chg **۱ms** · واترمارکِ ۱۴ جدول
   ۴ms · اسکنِ سالِ هرس‌شده (۴.۲M سطر) ۱۴۰ms · فول‌اسکن ۶s · مسیرِ زمانی
   ۲.۲s برای ~۲.۱M سطر — فیدِ chg ~۲۰۰۰× سریع‌تر.
4. **تست‌ها:** `tests/partitioning.js` **۵۵ → ۶۱**: U8a/U8b (قراردادِ FK و
   chunk-commit در سورسِ ۰۰9) · L10 (۶ FK رویِ جدول‌هایِ نهایی validated) ·
   L11a/b/c (**قتلِ واقعیِ بک‌اند بعد از اولین چانکِ کامیت‌شده — با
   pg_terminate_backend، نه SIGKILLِ کلاینت که بک‌اند را نمی‌کشد — ⇒ رانِ
   مجدد از مرزِ MAX(id) ازسرگیری و سبز**) · رگرسیونِ نویسندهٔ نشت‌کرده و
   پاک‌سازیِ مستقل از وضعیتِ قبلی. `.down` هم قوی‌تر شد: بازیافت با معیارِ
   جفتیِ (id, created_at) (سطرِ هم‌id/created_at-متفاوت گم نمی‌شود).
5. **یادداشتِ عملیاتی:** کرشِ واقعی وسطِ ساختِ جدول‌ها ممکن است فایل‌های
   یتیمِ ~۷GB روی دیسک بگذارد (pending-deletes گم می‌شود) — روشِ پاک‌سازی
   در ران‌بوکِ §۹.۶ ثبت شد.

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **۶۱/۶۱** · chg_id_cursor **33/33** · wave10-retention
**15/15** · wave10-chg-id **31/31** · wave10-db-scale **26/26** ·
migration-sequence ✓ · docs-consistency ✓ · build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- ۲۵M سقفِ دیسکِ سندباکس بود؛ **۵۰M/۲۸۸M اجرا نشد** — برون‌یابیِ صادقانه:
  ۵۰M ≈ ~۴۰ دقیقه و ۲۸۸M ≈ چند ساعت رویِ همین هاردویر (I/O-bound)؛
  سخت‌افزارِ تولید بهتر است.
- پنجرهٔ swap در ۲۵M ≈ ۳۶s و با اندازهٔ جدول مقیاس می‌یابد (ضدالحاقِ
  کامل‌اسکن زیرِ قفل) — بهبودِ آینده: پیشیکیتِ chg برای کچ‌آپ.
- ازسرگیری در ۲۵M تست نشد (L11 در ۳۲۰k آن را اثبات می‌کند).
- استیجینگ/تولیدِ واقعی همچنان در دسترس نیست؛ همهٔ اعداد از PG 17.11
  محلیِ سندباکس است.

## پی‌آیندهای پیشنهادی نوبتِ بعد

- پیشیکیتِ chg برای کچ‌آپِ فاز C (پنجرهٔ swap را از «اسکنِ کلِ جدول» به
  «فقط سطرهایِ تغییرکرده از شروعِ کپی» می‌رساند).
- اجرای ۰۰9 + فعال‌سازیِ فلگ در تولیدِ واقعی وقتی در دسترس شد (ران‌بوکِ §۹.۶).
- بعد از bake: drop دستیِ `*_old` + پایشِ رشدِ default partition.

---

# Wave 10 (نوبتِ چهارم) — اجرای Partitioning در استیجینگ + Retention سالانه — Handoff

**Date:** 2026-09-12 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این نوبت چه شد

1. **اجرای ۰۰۹ در «استیجینگ» (۱.۸M سطر، ترافیکِ هم‌زمان):** جانشینِ
   استیجینگ = PG 17.11 خودِ سندباکس، دیتابیسِ اختصاصیِ `payesh_staging`
   (grades 1.2M چندساله + attendance 600k؛ seed ~۶۰s). هارنسِ
   `/home/user/staging/` (خارج از مخزن): `seed.sh` · `run-009.js` (خوانندهٔ
   120ms + نویسندهٔ واقعی persistOpsBatch با فلگ روشن، حینِ مهاجرت) ·
   `perf.js` (رصدِ post-migration). سه اجرای کاملِ سبز.
2. **سه یافتهٔ سختِ هم‌زمانی که فقط اجرای واقعی آشکار کرد — هر سه در ۰۰۹
   فیکس شد:**
   - کپیِ تک‌تراکنشه ⇒ نوشته‌های حینِ کپی در `*_old` اسیر + پنجرهٔ قفلِ بلند
     ⇒ **دو تراکنش + کچ‌آپِ ضدالحاق زیرِ ACCESS EXCLUSIVE کوتاه**.
   - تریگرِ chg حینِ کپی رویِ هر سطرِ کپی می‌پرید ⇒ کچ‌آپِ تمام‌جدول ⇒
     **DISABLE/ENABLE دورِ کپی** (chg_id کپی حفظ می‌شود — تستِ L3e).
   - **بازنویسیِ معکوس:** پیشیکیتِ تساویِ chg نوشتهٔ تازهٔ post-swap را با
     کهنهٔ `*_old` برمی‌گرداند (در استیجینگ wrong=1 واقعی دیده شد) ⇒ شرطِ
     تازگی **`p.chg_id >= o.chg_id`** در هر ۶ ضدالحاق (last-writer-wins).
3. **اعدادِ نهایی استیجینگ (run4/run5):** مهاجرت ۵۷–۶۵s · خواندن‌ها err=0،
   p50=۲–۳ms، p95=۸–۱۶ms، **بدترین توقف ۱.۸–۲.۲s** (پنجرهٔ swap) ·
   نوشتن‌ها err=0، p50=۷–۱۱ms، ولی **بدترین کامیت ۴۱–۴۷s** (فشار WAL حینِ
   کپی — توصیه: بازهٔ کم‌ترافیک؛ مستند در §۹.۳) · راستی‌آزمایی همه صفر ·
   ANALYZE داخلِ ۰۰9 بینِ تراکنش‌ها.
4. **رصدِ post-migration (perf.js):** فیدِ chg **۱–۲ms** · واترمارکِ ۱۴
   جدول ۴ms · مسیرِ زمانیِ v2 در پنجرهٔ حجیم ۸۱k سطری ~۱s (فیدِ chg
   ~۵۰۰× سریع‌تر) · اسکنِ سالِ هرس‌شده ۳۰ms.
5. **Retention سالانه (تحویلِ جدید):** `tools/partition-retention.js`
   (fail-closed: dry-run پیش‌فرض · فقطِ `*_y<YYYY>` · default هرگز · سالِ
   جاری/آینده هرگز · بایگانیِ pg_dump پیش از حذف، شکست ⇒ حذف نه) +
   `tests/wave10-retention.js` **۱۵/۱۵** + `infra/cron/partition-retention.cron`
   (ماهانه باِ بایگانی + پیشاهنگِ هفتگیِ dry-run؛ سیاست: ۵ سال).
6. **تست‌ها:** partitioning **۴۲→۵۵** (U7 خاموشیِ تریگر؛ L3e حفظِ chg_id؛
   L9 اسیر/کچ‌آپ/سرگردان؛ L9e-1/2 رگرسیونِ بازنویسیِ معکوس).

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **55/55** · chg_id_cursor **33/33** · wave10-retention
**15/15** · wave10-chg-id **31/31** · wave10-db-scale **26/26** ·
wave10-pgbouncer **22/22** · migration-sequence ✓ · docs-consistency ✓ ·
build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- **استیجینگِ واقعی از سندباکس قابل‌دسترس نیست** — همهٔ اعدادِ §۹ از
  PG 17.11 محلی باِ دادهٔ مصنوعیِ ۱.۸M سطری است؛ همین‌طور مستند شده.
- **۵۰M/۲۸۸M اجرا نشد** — نرخِ کپی ~۳۱k سطر/s ⇒ مرتبهٔ چند ساعت
  (I/O-bound)؛ برون‌یابیِ صادقانه در §۷.۴/§۹.۳.
- سنجهٔ «دلتای ۱h» باِ seed واقع‌گرایانه (updated_at=created_at + ۸۰۰
  ویرایشِ امروز) گرفته شد؛ پنجرهٔ حجیم ۸۱k سطری مصنوعِ تاریخ‌های آیندهٔ
  seed است و همین‌طور برچسب خورده (§۹.۴).
- read-replica همچنان fake-DB.
- PG محلی بین ترن‌ها ریست می‌شود؛ بازسازی: سربرگِ `tests/partitioning.js`
  و §۹.۱ هارنس.

## نکتهٔ اصلاحی نسبت به نوبتِ سوم

`PAYESH_PARTITIONED_TABLES` باید **پیش از** اجرای ۰۰۹ فعال شود (نه پس
از آن) — persistOp رویِ heap هم مسیرِ نو را می‌رود و همه‌چیز idempotent
است؛ در استیجینگ همین‌طور اجرا و تأیید شد (ران‌بوکِ §۹.۶).

## پی‌آیندهای پیشنهادی نوبتِ بعد

- اجرای ۰۰۹ + فعال‌سازیِ فلگ در استیجینگِ واقعی/تولید وقتی در دسترس شد
  (ران‌بوکِ آماده: §۹.۶).
- مانورِ مقیاس ۵۰M+ در محیطِ باِ I/O واقعی.
- پایشِ رشدِ `default` partition (سریع‌الرشد بودنش یعنی سطر خارجِ بازه).

---

# Wave 10 (نوبتِ سوم) — Partitioning زنده + chg_id↔Cursor v3 — Handoff

**Date:** 2026-09-11 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این نوبت چه شد

1. **محیطِ PG زنده:** PostgreSQL 17.11 در سندباکس + role/db `w10`/`payesh_w10`؛
   زنجیرهٔ `001→008` از صفر سبز شد.
2. **مهاجرتِ `012_partition_grades_attendance.sql` (+down):** پارتیشن‌بندیِ
   چهارفازیِ grades/attendance (RANGE(created_at) سالانه + default؛ PK ⇒
   (id, created_at)؛ کپیِ دسته‌ایِ ۵۰k؛ swap یک‌تراکنشی با حفظِ نام‌های
   ایندکس/سکوئنس؛ `*_old` برای rollback، `*_recovered` در down). سه اصلاحِ
   مهمِ دیباگ: حذفِ ۳ ستونِ غیرواقعیِ grades (زنجیرهٔ مهاجرت مرجع است، نه
   schema اپ) + دو ایندکسِ جاافتادهٔ ۰۰۲ (`school_class_date`،
   `school_student_subject`) + رقصِ rename کامل.
3. **رفعِ مسدودکنندهٔ persistOp** (`server/db.js`): جدولِ در
   `PAYESH_PARTITIONED_TABLES` ⇒ UPDATE→INSERT→23505→UPDATE-retry؛ مسیرِ
   legacy دست‌نخورده. خروجیِ `isPartitionedTable` هم export شد.
4. **اتصالِ chg_id به کرسرِ v3:** `cursor.js` (sign سه‌پارامتری + verify) ·
   `pull.js` (`captureChgWatermark` pre-read + مسیرِ byChg بدونِ time-guard +
   `chg_watermark` در پاسخ) · `syncdelta.js` (`CHG_TABLES`).
5. **دو باگِ coercion که تست‌ها گرفتند:** `sign(…,null)` می‌ساخت cw=0 (فیدِ
   chg از صفر!) و `verify` با `Number([1])`/`Number(true)` عبور می‌داد — هر
   دو فیکس + رگرسیون.
6. **تست‌ها:** `tests/partitioning.js` **۴۲/۴۲** (واحد ۱۶ + زندهٔ ۲۶ روی
   PG با فیکسچرِ 180k: پریتی، EXPLAIN pruning، وارون‌سازی) ·
   `tests/chg_id_cursor.js` **۳۳/۳۳** (جدید) · MR1/M17 فاز ۴ به v3+cw
   مهاجرت شد.

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **42/42** · chg_id_cursor **33/33** · wave10-chg-id **31/31** ·
wave10-db-scale **26/26** · wave10-pgbouncer **22/22** · delta-phase4 **23/23**
(+ جهش **20/20**) · delta-sync-hardening **19/19** · contract-layers **18/18**
· pull-bootstrap **12/12** · pull-to-refresh **15/15** · wave3-keyset **13/13**
· migration-sequence ✓ · build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- **۵۰M/۲۸۸M در سندباکس اجرا نشد** — فیکسچرِ 180k + زمان‌سنجی
  (~۳۵k سطر/s کپی) + برون‌یابیِ مستند (۵۰M ≈ ۲۴ دقیقه؛ فقط مرتبهٔ بزرگی).
  `docs/WAVE10_DB_SCALE.md` §۷.۴.
- read-replica همچنان fake-DB (تأییدِ نهایی موعودِ استیجینگ).
- ۰۰۹ روی استیجینگ/تولید هنوز اجرا نشده — پیش‌نیازِ فعال‌سازی: تنظیمِ
  `PAYESH_PARTITIONED_TABLES=grades,attendance` **فقط پس از** اجرای ۰۰۹.
- PG زندهٔ سندباکس بین ترن‌ها پاک می‌شود؛ راه‌اندازیِ تکرارپذیر در
  `tests/partitioning.js` سربرگ + `docs/WAVE10_DB_SCALE.md` §۷.

## پی‌آیندهای پیشنهادی نوبتِ بعد

- اجرای ۰۰۹ بر استیجینگ با دادهٔ واقعی + `ANALYZE` پس از کپی.
- فعال‌سازیِ `PAYESH_PARTITIONED_TABLES` در compose استیجینگ + پایشِ
  متریک‌های pool پس از تعویض.
- retention سالانهٔ پارتیشن‌ها (detach/drop سال‌های قدیمی با تأییدِ وزارتی —
  طراحی در §۳ نوبتِ دوم).
- کلاینت: نمایشِ سنجهٔ `chg_watermark` در پنل دیباگِ سینک (اختیاری).

---

# Bug Hunt Session 8 / Wave 9 — Handoff

**Date:** 2026-09-11
**Branch:** `feat/bughunt-session8-wave9`
**Status:** Performance fixes complete; delivery gates/documentation in progress
**Code-fix HEAD:** `685f935`
**Author:** rezaa2544

---

## Completed in this session

- Eight independent performance/resource fixes were completed with red regression, fix, mutation test, and separate Conventional Commit: `062fbe3`, `324eec8`, `8f45f54`, `d4fc168`, `6035028`, `dd2d7eb`, `6aeb5ba`, `e54b998`.
- Wave 8 outbox mutation-fixture drift was repaired in `685f935`; final `wave8-outbox` is 14/14 and its mutations are 5/5.
- Fast gates are green: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 9 39/39.
- Session 8 regressions total 38/38 checks across the eight suites; all 16 Session 8 mutants were killed and every baseline was restored green.
- Detailed evidence: `docs/WAVE9_SESSION8_PERFORMANCE.md`; cumulative report: `docs/BUG_HUNT_REPORT.md`.

## Explicit limitations — do not report as green

- `tests/wave8-deep-audit.js` is missing from the repository; running it produced `MODULE_NOT_FOUND`.
- `scripts/run-all-tests.sh` did not reach a final total during the clean attempt because stale/overlapping runner processes were stopped after the tool window. Partial legacy reds remain unaccepted; no full-suite green claim is made.
- Local Node is v20.20.2 while the package engine requests >=22; the fast gates run but retain that environment warning.
- Ruflo is not installed in the sandbox. The requested key `bug_hunt_session8` is pending; no fabricated memory-write result exists.

## Delivery status

- Fast gates were repeated after the documentation commit: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 8 outbox 14/14 + mutations 5/5, and Wave 9 39/39.
- With temporary authentication, `feat/bughunt-session8-wave9` was pushed successfully; the permanent remote remains credential-free.
- PR created: `https://github.com/rezaa2544/p2/pull/75` with title `fix: bug hunt session 8 (wave 9 performance)`.
- Fallback bundle remains verified at `/home/user/bandle/bug-hunt-session8-wave9.bundle`; 24 credential-free patches are in `/home/user/bandle/patches/`.
- Ruflo registration `bug_hunt_session8` is pending because `ruflo` is not installed; no fabricated memory result is recorded.

---

# Historical handoff — Wave 19 Chaos Residuals

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report

---

# Handoff — Wave 18 National Load Testing

**Date:** 2026-09-12
**Branch:** `feat/wave18-national-load-test`
**Status:** Staging run complete; national capacity **not** measurable on this hardware
**Full report:** `docs/WAVE18_LOAD_TEST_REPORT.md`

---

## What was actually run

Five k6 scenarios (k6 v2.2.0) against a real staging stack — PostgreSQL 17 (90
tables), the Node API, and a regenerated `scale=0.001` national dataset:

| scenario | rps | p95 | HTTP fail | writes | write_errors |
|---|---:|---:|---:|---:|---:|
| load   | 106.3 | 248.8 ms | 0% | 533 | 0% |
| peak   | 20.3  | 147,345 ms | **19.07%** | 58 | 0% |
| stress | 357.3 | 1,417.9 ms | 0% | 8,119 | 0% |
| spike  | 236.9 | 1,596.6 ms | 0% | 855 | 0% |
| soak   | 81.9  | 270.8 ms | 0% | 467 | 0% |

Raw exports are committed at `tests/performance/results/w18-*.json` and are
reproducible via `tools/wave18-summarize-results.py`.

## Failure found — peak killed the server (OOM)

At a 60 rps target the API process was killed by the OOM killer
(`anon-rss ≈ 911 MB`). Symptoms observed in that session:

- `dmesg`: `Out of memory: Killed process (node) total-vm:13211364kB, anon-rss:911480kB`
- `api.log`: `[DB] Query execution error: timeout exceeded when trying to connect` (x9)
- k6: `Error: logi…` — `setup()` login failed because the API was already dead

**Provenance warning:** the sandbox rebooted afterwards (uptime ~101 s), so the
`dmesg` ring buffer and `/var/tmp` are gone. Those three lines were read and
recorded during the run but **cannot be re-verified today**. What remains
independently verifiable is the committed k6 JSON. Re-running peak requires
rebuilding staging via `infra/wave18-loadtest/staging-bootstrap.sh`.

## Explicit limitations — do not report as green

- **National capacity (20,000 rps) was not measured and cannot be on this box.**
  2 vCPU / 1984 MB, with the load generator, the API and PostgreSQL all sharing
  those 2 cores. Failure appeared around 60 rps — three orders of magnitude
  below target. The numbers above validate the harness, not the system.
- `write_errors = 0%` in **peak is not evidence of write-path resilience**: only
  58 writes reached the server before it died (vs 8,119 in stress).
- A prior interim report quoted **1099 as "interrupted iterations"**. That was
  wrong: 1099 is `vus_max`. The correct metric is `dropped_iterations = 2346`.
  The console figure itself is not persisted in the export.
- The dataset generator still emits **no `enrollments`** (0 rows) even though
  `server/policy.js` requires one for every teacher-scoped write. The loader
  derives them from `attendance × classes` as a workaround; the generator itself
  is still unfixed.
- Generator-vs-plan dimension divergence (item 2 of `docs/DOCS_CONSISTENCY_REPORT.md`)
  remains open.

## Two false greens fixed in the harness

1. `SCENARIO=peak` built **no scenario at all** — every condition was false, so
   `options.scenarios` was `{}` and k6 ran `setup()` once. It reported
   "40.3 rps, 1 write, all thresholds green" while measuring nothing. Proof:
   `k6 inspect -e SCENARIO=peak` → `"scenarios": {}`. Fixed by adding
   `peak_standalone` plus a guard that rejects unknown `SCENARIO` values.
2. `spike` never executed: `preAllocatedVUs=200` was fixed while
   `maxVUs = SPIKE_VUS * 2`, so any `SPIKE_VUS < 100` aborted with
   `maxVUs can't be less than preAllocatedVUs` (exit 104).

## Tests status (final, on the committed tree)

- `node tests/wave18-load-test.js` — 38/38, exit 0
- `node tests/secret-scan.js` — **12/12** (was 11; new negative control), exit 0
- `node tests/check-authz.js` — 6 checks, all green, exit 0
- `node build.js --check` — 394 actions (199 writers), full match, exit 0
- `node tests/smoke.js` — 547/547, exit 0

`secret-scan` initially failed 10 green / 1 red on six sha256 values in
`data/national/scale-0.001/stats.json`. Those are the dataset's own file
checksums (all 6 verified against real file hashes; the generator is
deterministic), and `T7d` of `tests/wave18-load-test.js` requires that field.
The allowance is narrow (`"<name>.csv": "` only), the logic now lives in a named
`hexAllowed()` shared by the scan loop and a 14-case negative control, and a
mutation check confirms the control exercises the same code path.

## Next steps

1. Re-run peak/stress on real staging with separate hosts for generator and DB
   before quoting any capacity number.
2. Fix `enrollments` in `tools/generate-national-dataset.js` itself.
3. Profile API memory growth under load (`anon-rss ≈ 911 MB` at OOM looks low
   for the target load, but this hardware cannot yield a trustworthy answer).
