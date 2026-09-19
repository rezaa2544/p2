# گزارش ترمیم فاز ۳ — Phase 3 Remediation (P0/P1/P2)
**مالک ترمیم:** Chat 2 — بر مبنای گزارش بازبینی مستقل (`CHAT2_INDEPENDENT_ARCHITECTURE_AND_RUNTIME_AUDIT`) و یافته‌های Red Team
**تاریخ:** ۲۰۲۶-۰۹-۱۹ · **شاخه:** `main` · **قاعده:** هیچ «سبز شدن تستی» بدون رفتار واقعی روی PostgreSQL/Redis واقعی پذیرفته نیست.

## فایل‌های تغییر یافته

| # | فایل | تغییر | Blocker |
|---|---|---|---|
| 1 | `migrations/013_universal_occ_and_sequences.sql` | حذف CREATE TABLE موازی با شکل متفاوت؛ شکل پایهٔ ۰۰۱ + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` برای ستون‌های فاز ۵ (شامل `updated_at`)؛ ایندکس‌ها بعد از ALTER | P0-BUG-02 |
| 2 | `migrations/013_..._down.sql` | حذف `DROP TABLE sync_conflicts` (جدول متعلق به ۰۰۱ است) → drop فقط ستون‌های افزودنی؛ بازگرداندن `attendance` و `grades` به لیست حذف version (UP/DOWN متقارن: ۸۷/۸۷) | P0-BUG-02 |
| 3 | `migrations/014_outbox_dlq.sql` | ساخت idempotent جدول `server_outbox` (هم‌شکل schema.sql و خوان/نوش outbox.js) + ایندکس پایه، پیش از DLQ/ایندکس پارشیال | P0-BUG-01 |
| 4 | `migrations/012_partition_grades_attendance.sql` | حذف متاکامند psql (`\gset`/`:w0`) → دو DO-block با `format()`؛ مرز `w0` همچنان لیترالِ زمانِ پلان؛ داخل همان تراکنش قفل‌دار | P2-012 |
| 5 | `tools/migrate-to-pg.js` | FKها دو-فازی شدند (فاز ۱: CREATE همهٔ جداول، فاز ۲: ALTER ADD CONSTRAINT با گارد pg_constraint) + گارد `--write-schema` (دیگر schema.sql پیگیری‌شده را بازنویسی نمی‌کند) | P0-BUG-03 |
| 6 | `server/index.js` | گارد hydrate: PG خالی + bootstrap JSON پر ⇒ hydration skip (دیگر فروش bootstrap با آرایهٔ خالی بازنویسی/نابود نمی‌شود) | P0-BUG-04 |
| 7 | `server/sync.js` | ردیف تعارض به فاز ۲ (persistOpsBatch در همان تراکنش) وصل شد — تعارض واقعاً در PG می‌نشیند | P0 (مکمل BUG-02) |
| 8 | `server/conflicts.js` | ثبت داوری (resolve) در PG با fail-closed 503 | P0 (مکمل) |
| 9 | `server/schema.sql` | هم‌ترازی شکل canonical `sync_conflicts` با ۰۱۳ | P0-BUG-02 |
| 10 | `tests/run.js` | اعمال سخت engines ≥22 (Node کهنه ⇒ قرمز، نه skip پنهان) | P1-GAP-02 |
| 11 | `tests/smoke.js` | نبود/خرابی jsdom ⇒ exit 1 با تشخیص (قبلاً exit 0) | P1-GAP-01/02 |
| 12 | `tests/wave3-query.js`, `tests/wave3-query3.js`, `tests/wave3-parity.js` | بدون PostgreSQL ⇒ FAIL (exit 1)، نه skip | P1-GAP-01 |
| 13 | `tests/pg-relational-seed.js` | exit 2 → exit 1؛ ادعای «012 NOT-RUN» به «012 اعمال‌شده با SQL استاندارد» تغییر یافت | P1-GAP-01, P2-012 |
| 14 | `tools/relational-seed-manifest.json` | بازتولید با زنجیرهٔ سالم (012 اعمال‌شده) و self-hash معتبر | P2-012 |
| 15 | `docs/openapi.yaml` | ۱۳ مسیر `/api/v1/analytics/*` با اسکیمای درخواست/پاسخ/خطاها + پوشش کامل ۷۵/۷۵ مسیر (دریفت صفر) | P2-OpenAPI |
| 16 | `.github/workflows/node.js.yml` | سرویس `postgres:17` + Migration Clean + Rollback + سوئیت‌های PG-live در CI | P1-GAP-01 |

## شواهد اجرای واقعی (اعداد نهایی — PostgreSQL 17.11 و Redis واقعی در سندباکس ایزوله)

| آزمون | نتیجه واقعی |
|---|---|
| Migration Clean (psql، DB خالی، 001→014) | **14/14 بدون خطا** · 104 جدول · 99 ستون version · `SELECT * FROM sync_conflicts` سبک · `idx_sync_conflicts_user` موجود |
| Rollback (014→001، هر down با ON_ERROR_STOP) | **بدون خطا** (فقط جدول نشانگر `mig009_w0` طبق طراحی می‌ماند) |
| `tools/seed-relational-small.js` (رانر Node) | **14/14 applied · 0 NOT-RUN** (012 با SQL استاندارد اجرا می‌شود) + manifest بازتولید با self-hash |
| اجرای دوباره seeder (بدون reset) | exit 0 — پروتکل `ALREADY_APPLIED` (012 idempotent-skip) |
| `tools/migrate-to-pg.js --execute` روی DB خالی | **موفق** — 93 جدول، **74 FK (فاز ۲)**، 11k+ رکورد؛ schema.sql دیگر بازنویسی نمی‌شود |
| Runtime PG-live (RT4 VERIFY) | **14/14**: گارد hydrate + seed خودکار bootstrap→PG · تعارض **در PG (pg_count=1)** · حذف کامل store ⇒ بازیابی تعارض از PG · resolve در PG (status=resolved) · outbox append+processed در PG |
| بدون PostgreSQL: wave3-query / query3 / parity / pg-relational-seed | هر چهار: **exit 1 (FAIL صریح)** — skip ممنوع |
| با PostgreSQL: wave3-query (35/35)، query3 (**25/25**)، parity (20/20)، pg-relational-seed (**40/40**) | سبز واقعی |
| `npm test` روی Node 22 | run.js **35/35** + smoke **547/547** |
| `npm test` روی Node 20 | **قرمز عمدی (exit 1)** — گیت engines در run.js |
| Redis واقعی (REDIS_URL ست‌شده) | boot: `cache:"redis"`, `redis.alive=true`، کلیدهای `payesh:*` در سرور واقعی · `tests/otp-redis.js` **16/16** |
| رگرسیون‌های رفتاری پس از تغییر sync/conflicts | occ **18/18** · server15 (R95) **40/40** · wave8-outbox **14/14** · sync-dlq-retry **7/7** · red-team **10/10** |
| OpenAPI drift | **صفر — 75/75 مسیر** (۱۳ اندپوینت analytics با اسکیمای کامل + پوشش reports/* و system/*) |
| secret-scan | 12/12 پاک — هیچ رازی در مخزن نیست |

## نتیجه
Phase 3 در مرزهای تعریف‌شدهٔ این دستور به **VERIFIED COMPLETE** رسید: هر Blocker با رفتار واقعی سیستم روی PostgreSQL/Redis واقعی اثبات شد، نه با سبز شدن تست‌ها. تمام یافته‌های جدید حین ترمیم (implicit-transaction رانر، varchar سرریز، تاریخ‌های غیرISO، auto-config جدول‌های پارتیشن‌شده، seed خودکار bootstrap→PG) نیز در همین commit اصلاح و اثبات شدند.

## ضمیمهٔ ادغام (rebase روی main موازی) + دو باگ جدید که در همین نوبت اصلاح شد
قبل از push، main با تغییرات موازیِ مخزن (phase2/phase6/red-team B1-B10) rebased شد (`5e69dc3e`). ادغامِ 013/014/sync.js به‌صورت «اجتماعِ هر دو ترمیم» انجام شد (ستون‌های incoming_version/current_version + ترتیب in-flight) و کل شواهد بالا **دوباره روی state ادغام‌شده اجرا شد**. ضمن آن دو باگ واقعی دیگر پیدا و اثبات و اصلاح شد:

1. **`outbox.mark` پس از restart روی PG نمی‌نشست** — mark اول در صفِ RAM جستجو می‌کند؛ در PG-live صفِ RAM بعد از restart عمداً خالی است (F3) ⇒ رویدادِ پردازش‌شده برای همیشه `pending` می‌ماند و هر بوت دوباره «replayed» می‌شد (اثبات زنده: `pending|0` بعد از ۱۲ ثانیه تماشا). پچ: fallback مستقیم روی PG. اثبات پس از پچ: RT4 «outbox در PG و processed» سبز.
2. **قرارداد B4 در `wave8-outbox`** — worker پس از ادغام در `rc >= maxRetries` رویداد را failed و به DLQ می‌برد (عمدی، commit موازی). رفتار واقعی با پروبِ زنده استخراج شد (t1: pending/1 → t2: failed/2 + کپیِ DLQ → t3: بدون تلاشِ مجدد) و چک‌های O3 با قرارداد جدید بازنویسی شدند ⇒ **15/15**.

## شواهد نهایی پس از ادغام (تکرار کامل روی state نهایی)
Migration Clean ✅ · Rollback ✅ · seeder 14/14 + manifest جدید (sha256=eaedc293…) self-consistent · pg-relational-seed **40/40** · wave3-query exit 0 · wave3-query3 **25/25** · wave3-parity **20/20** · RT4 runtime **14/14** · npm test Node22 **35/35 + smoke** ✅ (Node20 قرمزِ عمدی) · otp-redis **16/16** · red-team **10/10** · occ **18/18** · server15 **40/40** · wave8-outbox **15/15** · sync-dlq-retry **7/7** · secret-scan **12/12 پاک**.
