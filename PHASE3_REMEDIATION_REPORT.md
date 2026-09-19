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
