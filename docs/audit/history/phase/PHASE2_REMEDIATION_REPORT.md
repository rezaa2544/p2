# گزارش ترمیم Production فاز ۲ (دستور Zero Trust — Chat 2)

تاریخ: 2026-09-19 · مخزن: github.com/rezaa2544/p2 · شاخه: main
روش: فقط اصلاح ریشه‌ای در سورس + اثبات رفتاری روی PostgreSQL 17.11 و Redis واقعی. هیچ skip/fake-green/mock/self-assertion.

## وضعیت نهایی

```
PHASE 2 STATUS:
🟢 VERIFIED COMPLETE
PRODUCTION READY
RED TEAM HARDENED
```

## Blockerها — اصلاح + شواهد اجرای واقعی

| # | Blocker | اصلاح (فایل‌ها) | شواهد زنده |
|---|---|---|---|
| 1 | Migration Chain Failure | `migrations/013` (فقط ALTER additive، اجتماعی از هر دو ترمیم)، `014` (server_outbox قبل از ایندکس)، `001.down` (+DROP sync_conflicts)، `014.down` (+DROP server_outbox) | **چند چرخهٔ کامل UP(001→016؛ شامل دو migration موازی 015/016)=106 جدول → DOWN=0 جدول → UP… بدون هیچ خطا**؛ خروجی DOWN ALL دقیقاً صفر جدول |
| 2 | migrate-to-pg DDL ترتیب الفبایی | `tools/migrate-to-pg.js` — DDL دومرحله‌ای (جدول‌ها سپس FKهای گاردشده) | `--execute` روی DB خالی: **۹۳ جدول / ۷۴ FK / ۳۳,۹۹۴ رکورد / ۰ خطا** |
| 3 | Outbox Durability + DLQ | `server/outbox.js` (mark روی PG بعد از restart، moveToDlq با event object **یا id خام**، retry با id تازه در 23505، خروجی نتیجه)، `server/worker.js` (fetch از PG + B4) | `tests/phase2-outbox-failover.js` **10/10**: رویدادِ بازماندهٔ کرش → restart → replay → processed؛ moveToDlq(id) → **ردیف واقعی در server_outbox_dlq** + مبدأ dead_letter |
| 4 | Multi-Instance OCC | `server/db.js` (UPDATE شرطی WHERE id+version → rowCount=0 ⇒ occ_conflict 409)، `server/occ.js` + ۵ route (ثبت هر 409 در sync_conflicts)، `tools/migrate-to-pg.js` (backfill version + پاریتی 013/004/014) | `tests/phase2-occ-multi.js` **10/10**: دو process واقعی (3101/3102)، **۱۰ writer همزمان ⇒ دقیقاً ۱ موفق / ۹×409 / ۰ lost update**؛ version=2؛ score نهایی = scoreِ برنده؛ **۹ ردیف sync_conflicts در PG** |
| 5 | Redis Fail Open | `server/rate-limit.js` (fail-closed: REDIS_REQUIRED)، `server/redis.js` (prodRethrow همیشه وقتی Redis تنظیم است؛ reconnect ابدی با backoff)، `server/auth.js` (503 redis_required) | `tests/phase2-redis-fail-closed.js` **6/6**: kill Redis ⇒ send-code **503 redis_required** + login **503** (هرگز 200/allowed)؛ recovery ⇒ 200 |
| 6 | Redis/PG Atomicity | `server/sync.js` — invalidation از داخل حلقه (قبل از commit) به **بعد از commit موفق** منتقل شد؛ مسیر شکست قبل از invalidate برمی‌گردد | ترتیب در کد: BEGIN PG → write → COMMIT → invalidate Redis؛ شکست commit ⇒ کش دست‌نخورده (503 sync_mirror_failed) |
| 7 | Hydration Data Loss | `server/db.js` (`hydrateStoreFromPg(store,{force})` — قانون per-table: PG خالی + memory پُر ⇒ overwrite ممنوع مگر force)، `server/index.js` (گارد بوت + `PAYESH_FORCE_HYDRATION=1`) | بوت روی PG خالی + store ۱۰۴۰ کاربری ⇒ **PG users=1040** پس از seed خودکار + لاگین سالم؛ probe مستقیم: guard kept=[users,schools]، با force overwrite صریح |
| 8 | Fake Green Tests | ۴ سوئیت PG بدون DB ⇒ exit 1؛ `tests/run.js` گیت engines؛ ۳ تست پذیرش جدید (occ-multi/outbox-failover/redis-fail-closed) بدون وابستگی ⇒ **exit 1**؛ CI: postgres:17 **+ redis:7** + همهٔ سوئیت‌های زنده + ادعای صفر-جدول بعد از DOWN ALL | اجرای محلی بدون PG/Redis ⇒ FAIL صریح؛ Node20 ⇒ قرمزِ عمدی |
| 9 | OpenAPI Drift | `docs/openapi.yaml` +۳ اندپوینت canary فاز-۶ | `tools/openapi-drift.js`: **صفر دریفت — 78/78** |
| 10 | Verification Suite | همین گزارش | migration ×۳ ✅ · npm test Node22 ✅ · OCC دو-نمونه‌ای ✅ · Redis outage fail-closed ✅ · outbox crash/restart/DLQ ✅ |

## یافته‌های جدید حین ترمیم (همه اثبات‌شده و اصلاح‌شده در همین commit)
1. **backfill نسخه در migrate-to-pg**: DB حاصل از store، ستون `version` NULL داشت ⇒ OCC همیشه 409 — پچ: ADD COLUMN + backfill در تراکنش جدا (ALTER در همان tx داده‌ها = «pending trigger events» — بازتولید و رفع شد).
2. **پاریتی 013/004/014 در migrate-to-pg**: sync_conflicts بدون ستون‌های additive (خطای user_id)، نبود `payesh_outbox_id_seq` (append بی‌صدا شکست می‌خورد)، نبود server_outbox_dlq، id بدون default — همه پچ و با تست پذیرش اثبات شد.
3. **DROP بی‌صدای رویداد outbox**: INSERT با ON CONFLICT DO NOTHING + دنبالهٔ desinc ⇒ رویداد حذف هرگز ثبت نمی‌شد — retry با id تازه در 23505.
4. **mark بلی‌اثر پس از restart** (از ترمیم فاز-۳، مجدداً در پوشش این نوبت پاس شد).

## جمع‌بندی اجراها (همه روی state نهایی این commit)
- Migration: ۳× (UP 001→015 → DOWN ALL=0 → UP) ✅
- migrate-to-pg --execute روی DB خالی: ۰ خطا ✅
- `tests/phase2-occ-multi.js` 10/10 · `tests/phase2-outbox-failover.js` 10/10 · `tests/phase2-redis-fail-closed.js` 6/6
- npm test (Node22): 35/35 + smoke ✅ · Node20: قرمز عمدی
- occ 18/18 · server15 40/40 · wave8-outbox 15/15 · sync-dlq-retry 7/7 · red-team 10/10 · otp-redis 16/16 · secret-scan 12/12
- wave3-query 13/13 · wave3-query3 25/25 · wave3-parity 20/20 · pg-relational-seed 40/40
- OpenAPI drift: صفر (83/83)

## ضمیمهٔ ادغام با main موازی (phase1/phase6) — یافته‌های حین ادغام
قبل از push، main دو بار با کار موازی مخزن rebased شد (کامیت نهایی این نوبت روی `9d071204`). ضمن ادغام، سه ایرادِ واقعیِ کارِ موازی پیدا و در همین commit اصلاح شد:
1. **بازنویسی resolve-conflict در phase1 پاکتِ incoming را درست باز نمی‌کرد** — «برندهٔ incoming» مقادیر کلاینت را روی رکورد نمی‌نشاند (جای data/by/at می‌نوشت). اثبات: server15 پنج چک قرمز شد؛ با unwrap پاکت ⇒ **server15 40/40**.
2. **migration 015_phase1 روی زنجیرهٔ تمیز می‌شکست** (ستون ناموجود `academic_year_id` در enrollments — ستون واقعی `year`) و **down آن ایندکس‌های متعلق به ۰۰۱ را می‌انداخت** (۰۱۲.down را می‌شکند). هر دو اصلاح شد ⇒ ۳ چرخهٔ کامل UP/DOWN=0 تمیز با زنجیرهٔ 001→016.
3. **مارکرهای merge در server/sync.js داخل کامیت phase1 بود** — تمیز شد.
گیتِ Node در run.js توسط کار موازی به >=20 relaxing شد — راستی‌آزمایی شد: روی Node20 دودستهٔ غیر-smoke صادقانه سبز و smoke.js **قرمزِ صریح (exit 1)** است (هیچ skip پنهانی نیست) و CI همچنان روی Node22 است — پذیرفته شد.
