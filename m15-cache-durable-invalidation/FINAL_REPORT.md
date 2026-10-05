# گزارشِ نهایی — M15-05 / M15-CACHE-PACMA
## Durable Cross-Instance Cache Invalidation
### ATRIA / IMPLEMENT + VERIFY / P0 — ۲۰۲۶-۱۰-۰۴

> **شناسهٔ اصلی: M15-CACHE-PACMA / M15-05.** این مأموریت با نامِ N-36 هم شناخته می‌شود، اما N-36 یک برخوردِ نام‌گذاری دارد: N-36 اصلی (API/Test-CI parity، در `docs/control-plane/ATRIA_MISSION_M13_F3_FINAL_REPORT.md`) **هنوز باز است** و دست‌نخورده باقی ماند. رفعِ ابهاد در همان فایل ثبت شد.

---

## ۱. خلاصهٔ اجرایی

قبل از این مأموریت، ابطالِ کش بینِ نمونه‌ها فقط از **یک مسیرِ non-durable** می‌آمد: Redis Pub/Sub. اگر یک نمونه در لحظهٔ publish قطع بود، پیام برای همیشه گم می‌شد و کشِ آن نمونه تا انقضایِ TTL (۶۰s برای L1، ۳۰۰s برای L2) دادهٔ کهنه می‌خواند. `pendingInvalidations` یک safety mechanism بود ولی **process-local** بود — یعنی در restart یا crash هیچ چیزی برای بازیابی وجود نداشت.

این مأموریت یک **مسیرِ دوام‌دار** اضافه کرد: رویدادهایِ ابطال داخلِ `server_outbox` (PostgreSQL) نوشته می‌شوند و هر نمونه آن‌ها را برایِ L1/L2 خودش بازپخش می‌کند. Pub/Sub همچنان مسیرِ سریع (fast path) است؛ outbox تضمینِ نهایی را می‌دهد.

**نتیجه:** ۶۰/۶۰ تست (۲۰ سناریوی شکست + regression guard) رویِ PG/Redis زنده، produce ۵۱۱ رویداد/ثانیه، consume ۷۳۱ رویداد/ثانیه، latency ۵ms. **سه باگِ واقعی** حینِ تست کشف شد — از جمله یکی که بدونِ probing مستقیمِ PG قابل‌مشاهده نبود.

## ۲. حقیقتِ زمینه (Ground Truth) — بخش ۱۸

| مورد | مقدار |
|---|---|
| HEADِ شروع | `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` |
| شاخه | `main` (محلی) |
| `origin/main` | `1b19449f` — محلی و remote دقیقاً برابر (۰ جلو / ۰ عقب) |
| HEADِ پایان | [در §۱۸ پایین] |
| زیرساخت | PostgreSQL 16 + Redis 5.0.14 واقعی روی همین box |
| Working tree | فقط فایل‌های این مأموریت stage شدند (لیست در §۱۷) |

قانونِ COMMIT: قبل از کار `git status` / `HEAD` / `remote -v` / `fetch` انجام شد. هیچ force-push، rebase، یا destructive operation‌ای استفاده نشد.

## ۳. معماریٔ پیاده‌سازی‌شده

### ۳.۱ مسیرِ تولید (Producer)
هر mutation که کش را کهنه می‌کند، حالا **دو** کار می‌کند:
1. مسیرِ سریعِ قبلی: `cache.invalidateUser/invalidateSchool/invalidateCollection` (Pub/Sub) — بدون تغییر.
2. مسیرِ دوام‌دار: `cacheEvents.appendDurable(outbox, event)` — رویداد را داخلِ `server_outbox` می‌نویسد.

**اتمی بودن (بخش ۶):** در مسیرهایِ PG-trasnsactional (sync، REST از طریقِ `persistOpsBatch`/`persistSyncBatch`)، append داخلِ **همان تراکنش** رویِ همان `client` اجرا می‌شود. اگر commit رول‌بک شود، رویداد هم رول‌بک می‌شود. اگر insert خودش شکست کند، کلِ تراکنش رول‌بک می‌شود. **commit بدونِ event غیرممکن است.**

### ۳.۲ مسیرِ مصرف (Consumer)
یک tickِ جدید در `server/worker.js` به نام `tickReplicate`:
- رویدادهایِ `cache.*` با `id > watermarkِ این نمونه` را به ترتیبِ صعودی می‌خواند (بدونِ claim).
- handler را اجرا می‌کند → همان عملیاتِ idempotentِ Pub/Sub.
- watermark را جلو می‌برد.
- در بوت: `replayPendingFromPg` یک‌بار تمامِ pendingها را بازپخش می‌کند.

### ۳.۳ watermark
جدولِ جدید `server_outbox_watermark` (PK = `instance_id`, `last_id`, `updated_at`). هر نمونه با `PAYESH_INSTANCE_ID` یا `hostname:pid` شناسایی می‌شود. پیشروی با `GREATEST(last_id, EXCLUDED.last_id)` یک‌طرفه است.

**چرا claim نه:** ابطالِ کش idempotent است و باید رویِ **هر** نمونه اجرا شود. `FOR UPDATE SKIP LOCKED` باعث می‌شد فقط یک نمونه رویداد را بخورد. این تصمیم، یادداشتِ قدیمیِ `MULTI_INSTANCE_AUDIT.md` (row G) را نقض کرد — آنجا نوشته بود «handlerِ سراسری باید claim توزیع‌شده بگیرد». آن پیش‌بینی نادرست از آب درآمد. به‌روزرسانی در همان فایل ثبت شد.

### ۳.۴ user-scope epoch (بخش ۸ — تصمیم: REQUIRED)
پکتِ L2 حالا یک فیلدِ `ue` (user epoch) دارد. `invalidateUser` علاوه بر Pub/Sub، `payesh:cache:epoch:user:<id>` را هم جلو می‌برد. قبل از این، انتقالِ کاربر بینِ مدارس می‌توانست کشِ bootstrap را کهنه نگه دارد — school epoch و global epoch هر دو درست بودند ولی هیچ‌کدام user-scoped نبودند.

## ۴. طرحِ رویداد (Event Schema)

```json
{
  "type": "cache.user_changed | cache.school_changed | cache.collection_changed",
  "collection": "students",
  "record_id": 200,
  "actor_id": 1,
  "version": 1,
  "payload": { "scope": "user|school|global", "user_id": 5, "school_id": 3 }
}
```
`payload.scope` **الزامی** است. scope ناشناخته = fail-closed به DLQ، نه سقوط به ابطالِ سراسری.

## ۵. مدلِ retry / idempotency / ordering

| ویژگی | پیاده‌سازی |
|---|---|
| Retry | شمارندهٔ `retry_count`، حداکثر `PAYESH_WORKER_MAX_RETRIES` (پیش‌فرض ۵)، سپس DLQ |
| Idempotency | handlerها idempotent‌اند (epochها فقط جلو می‌روند) + watermark یک‌بار‌اجرا را تضمین می‌کند + first-writer-wins در `mark` |
| Ordering | PG sequence (سراسری، monotonic) + اسکنِ صعودی + watermarkِ یک‌طرفه (I11) |
| Redis outage | رویداد علامت نمی‌خورد، `retry_count` افزایش نمی‌یابد، cursor ثابت می‌ماند (I7) |
| Unknown handler | DLQ، نه تخریبِ دستی (fail-closed) |
| Retention | `reapProcessed` فقط ردیف‌هایِ processed را پس از عبورِ **هر** instance (watermark-floor) حذف می‌کند |

## ۶. سه باگِ واقعی کشف‌شده حینِ تست

این مهم‌ترین بخشِ مأموریت است: تست‌ها برای شکستنِ سیستم نوشته شدند و سیستم واقعاً شکست.

| # | باگ | علائم | اثر |
|---|---|---|---|
| ۱ | شاخهٔ حافظهٔ `fetchReplicateBatch` به `id` sort نمی‌کرد | F7: `[["u",41],["u",43],["s",42]]` به‌جای ترتیبِ درج | ordering invariant (I11) فقط روی PG برقرار بود؛ حالتِ توسعه می‌توانست رویدادها را به ترتیبِ نادرست اجرا کند |
| ۲ | رویداد در رول‌بک یتیم می‌ماند | F8b: `store.outbox.length === 0` در حالی که باید ۱ می‌بود | commit بدونِ event ممکن بود — نقضِ مستقیمِ بخش ۶ |
| ۳ | **`mark()` ۶ پارامتر می‌فرستاد ولی SQL ۵ تا می‌خواست** (SQLSTATE 08P01) | F21: status برای همیشه `pending` | خطا در `catch (e) { return null; }` بلعیده می‌شد → worker در هر tick دوباره اجرا می‌کرد، consuming throughput **۲۰/s** |

باگِ سوم **بدونِ probing مستقیمِ PG زنده قابل‌مشاهده نبود** — try/catch آن را پنهان می‌کرد و هیچ تستی که وضعیتِ واقعیِ PG را بخواند وجود نداشت. پس از اصلاح، consuming throughput از ۲۰/s به **۷۳۱/s** پرید. تستِ F21 به‌عنوانِ regression guard دائمی اضافه شد تا دوباره پنهان نشود.

## ۷. اثباتِ منفی (بخش ۱۲) — VULNERABLE mode

`CACHE_DURABLE_VULN=1` مسیرِ دوام‌دار را خاموش می‌کند. تستِ F17 نشان می‌دهد:
- با `CACHE_DURABLE_VULN=1`: **هیچ رویدادِ دوام‌داری تولید نمی‌شود** و پس از از دست رفتنِ Pub/Sub، کشِ مدرسهٔ ۲۰۰ **ابطال نمی‌شود** — حفرهٔ کهنه قابلِ مشاهده است.
- بدون آن: رویداد تولید می‌شود و worker کش را ابطال می‌کند.

این اثباتِ دوسویه است: هم سالم بودنِ feature را و هم این که feature واقعاً چیزی را اصلاح می‌کرده، نشان می‌دهد.

## ۸. تستِ cross-instance واقعی (بخش ۱۱)

**NOT-RUN ≠ PASS.** بدونِ `DATABASE_URL` تست‌هایِ PG (F10, F20) به‌درستی `NOT-RUN` گزارش می‌دهند و exit code همچنان ۰ است. با PG زنده:

- **F10 (شاخهٔ PG):** دو outbox با `PAYESH_INSTANCE_ID` جدا روی PG مشترک → هر دو نمونه ابطال را دیدند.
- **F20 (زنده):** دو نمونهٔ واقعی رویِ PG + Redis زنده با isolation کامل (`DELETE FROM server_outbox WHERE type LIKE 'cache.%'` + `DELETE FROM server_outbox_watermark` قبل از هر سناریو).
- **F21:** probe مستقیمِ `SELECT status, processed_at FROM server_outbox` — نه از طریقِ API.

هیچ تستی با fake Redis به‌تنهایی certification نشد. همهٔ سناریوها هم روی PG زنده و هم روی حالتِ حافظه اجرا می‌شوند.

## ۹. ظرفیتِ اندازه‌گیری‌شده (بخش ۹) — بدونِ ادعایِ national-scale

اندازه‌گیری رویِ PG زنده با `tools/m15-outbox-capacity.js`:

| متریک | مقدار |
|---|---|
| Produce throughput | ۵۰۰ رویداد در ۹۷۸ms = **۵۱۱ رویداد/ثانیه** |
| Consume throughput | ۵۰۰ رویداد در ۶۸۴ms (۱۰ tick) = **۷۳۱ رویداد/ثانیه** |
| Latency تک‌رویداد | **۵ms** |
| Backlog زیرِ فشار | ۳۰۰ تولید متوالی → depth=۳۰۰ (در ۴۸۳ms)، سپس تخلیه |
| Retention reap | watermark-floor تأیید شد |

**محدودیتِ صریح:** این اعداد فقط برای **مسیرِ invalidation** رویِ این box (یک نمونهٔ PG، یک نمونهٔ Redis، بدونِ بارِ هم‌زمانِ production) هستند. هیچ ادعایی دربارهٔ national-scale صادر نمی‌شود. `OUTBOX_CAP=1000` را تغییر ندادیم — ابتدا schema، indexها، cleanup، processed rows، retry retention، DLQ و worker throughput بررسی شدند (بخش ۹)، و ظرفیتِ اندازه‌گیری‌شده برای بارِ فعلی کافی است.

## ۱۰. Observability (بخش ۱۳)

۶ metric جدید. **نکتهٔ مهم:** همهٔ این‌ها ابتدا `inc()`/`set()` صدا زده می‌شدند ولی در registry **declare نشده بودند** — `inc()` آن‌ها را در سکوت `bumpDrop` می‌کرد. بخش ۱۳ رویِ کاغذ سبز بود ولی هیچ داده‌ای produce نمی‌شد. پس از declare کردن، همه رویِ **ماژول‌های واقعی** verify شدند:

| Metric | نوع | verify |
|---|---|---|
| `payesh_cache_outbox_events_produced_total{scope}` | counter | `=1` پس از یک append واقعی |
| `payesh_cache_outbox_events_processed_total{outcome}` | counter | `=2` پس از tick واقعیِ worker |
| `payesh_cache_outbox_redis_unavailable_total` | counter | `=1` + `retry_count 0→0` |
| `payesh_cache_outbox_retention_deleted_total` | counter | `=3` |
| `payesh_cache_outbox_backlog_depth` | gauge | `1 → 0` پس از advance |
| `payesh_cache_outbox_oldest_age_seconds` | gauge | timestamp واقعی |

**Cardinality کنترل‌شده:** labelها از مجموعه‌هایِ بسته می‌آیند (`scope ∈ {user,school,global,unknown}`، `outcome ∈ {processed,retried,dead_letter}`، یا بدونِ label). هیچ نامِ collection یا id وارد label نمی‌شود.

## ۱۱. طبقه‌بندیِ رگرسیون‌ها (بخش ۱۶)

هر RED با evidence طبقه‌بندی شد. هیچ رگرسیونی با برچسبِ pre-existing مخفی نشد.

| تست | علت | طبقه‌بندی | evidence |
|---|---|---|---|
| `wave8-outbox` O5a | `store.outbox.length === 1` → ۲ | **NEW / EXPECTED-BEHAVIOR** | حذفِ کاربر حالا دو رویداد می‌سازد — درست همان رفتارِ مطلوب. تست اصلاح شد + ۲ assertion جدید. |
| `wave1-multi-instance` T1a | همان شکست رویِ clean HEAD | **PRE-EXISTING** | stash + checkout HEAD → همان FAIL |
| `multi-instance.js` MI-1 | NODE_ENV=production ولی DATABASE_URL حذف شده | **PRE-EXISTING** | همان شکست رویِ clean HEAD. این فایل در CI اجرا نمی‌شود. |
| `phase2-outbox-failover` | "DATABASE_URL required" | **ENVIRONMENTAL** | با PG زنده درست شد |
| `phase2-outbox-failover` | migration 015 FATAL | **ENVIRONMENTAL** | `psql` روی PATH نبود → `/c/Program Files/PostgreSQL/16/bin` |
| `cache-l2-epoch`, `wave11-cache`, `sync-cache-errors` | `isProductionEnv()` با REDIS_URLِ env | **ENVIRONMENTAL** | `unset REDIS_URL` → هر سه سبز. (ابتدا PRE-EXISTING به‌نظر می‌رسیدند؛ تمایز مهم است: پیش از REGRESSION باید env control شود.) |
| `migrate-to-pg` SQLSTATE 23502 | INSERT NULL صریح با وجودِ DEFAULT 1 | **PRE-EXISTING** | دادهٔ seed قدیمی فاقد `version` است. fix: NULL → `'1'`. |

**درسِ این بخش:** سه تست اول به‌نظر REGRESSION می‌رسیدند. stash + clean-HEAD comparison برای wave1/MI-1 PRE-EXISTING را ثابت کرد، و برای cache suites، کنترلِ env ENVIRONMENTAL را ثابت کرد. هیچ‌کدام واقعاً REGRESSION نبودند — اما این فقط با **active disproof** مشخص شد، نه با فرض.

## ۱۲. invariantها (I1–I16)

هر ۱۶ invariant طراحی، یک تستِ واقعی دارند (نگاشتِ کامل در `DESIGN.md` §Q). نمونه‌ها:
- **I2 (not Pub/Sub only)** → F1: Pub/Sub گم می‌شود، کش همچنان ابطال می‌شود.
- **I6 (duplicate safe)** → F6: رویدادِ تکراری، ابطالِ تکراری تولید نمی‌کند.
- **I11 (ordering)** → F7: رویدادها به ترتیبِ درج اجرا می‌شوند.
- **I14 (Redis failure ≠ DB failure)** → F3: قطعِ Redis، نوشتِ PG را متوقف نمی‌کند.

## ۱۳. مرزهایِ scope — صریحاً در این مأموریت نیست

- هیچ زیرساختِ صفِ جدیدی (Kafka، Redis Streams، RabbitMQ) — خودِ PG outbox صف است.
- پیاده‌سازیِ PACMA Policy Registry (M15-CACHE-02) — خیر.
- admission-control / hot-key / quota (M15-CACHE-03/06) — خیر.
- load/soak certification (M15-08) — خیر، capacity claims با NOT VERIFIED به تعویق افتاد.
- هیچ تغییری در response contractِ sync/REST/client.
- `session_revocation` همچنان Pub/Sub-only است (این، کش نیست؛ الگوی epoch/watermark آنالوگِ بدیعی است ولی خارج از scope).

## ۱۴. مهاجرت و rollback

- `migrations/026_outbox_cache_invalidation.sql` + `.down.sql` — DDL-only، idempotent.
- جدول‌هایِ جدید: `server_outbox_watermark`. ستون‌هایِ جدید در `server_outbox`: موجود نبودند — همهٔ ستون‌هایِ موردنیار از قبل (Wave 8) وجود داشتند.
- Rollback: حذفِ جدولِ watermark. مسیرِ Pub/Sub دست‌نخورده باقی می‌ماند → سیستم به حالتِ قبلی برمی‌گردد.
- **بدونِ مهاجرتِ داده:** هیچ دادهٔ موجودی بازنویسی نشد.

## ۱۵. یکپارچگیِ تست (بخش ۱۵)

- هر تست واقعاً failure را trigger می‌کند (نه فقط assert رویِ حالتِ سالم).
- NOT-RUN هرگز PASS حساب نمی‌شود.
- هیچ timeout/hang‌ای وجود ندارد.
- probe مستقیمِ PG (F21) از طریقِ API نمی‌گذرد — `SELECT` مستقیم.
- اثباتِ منفی (F17) نشان می‌دهد feature واقعاً چیزی را اصلاح می‌کرده.

## ۱۶. سلامتِ رگرسیون

| Suite | نتیجه |
|---|---|
| `tests/m15-durable-invalidation.js` | **۶۰/۶۰ PASS** (۳ اجرای متوالی پایدار) |
| `tests/wave8-outbox.js` | ۱۷/۱۷ |
| `tests/outbox-lease-fencing.js` | ۱۷/۱۷ |
| `tests/outbox-dlq-atomicity.js` | ۲/۲ |
| `tests/m14-b01-*.js` | ۲۷/۲۷ |
| `tests/m14-c01-*.js` | ۹/۹ |
| `tests/m14-b02-*.js` | ۲۸/۲۸ |
| `tests/cache-l2-epoch.js` | ۸/۸ |
| `tests/h02-update-user-cache-invalidation.js` | ۳۰/۳۰ |
| `tests/wave11-cache.js` | ۳۵/۳۵ |
| `tests/sync-cache-errors.js` | ۷/۷ |
| `tests/phase2-outbox-failover.js` (PG زنده) | ۱۰ سبز |
| `npm test` کامل | **۳۸/۳۸ PASS, exit 0** |
| `tests/m15-durable-invalidation.js` رویِ HEADِ تمیز | **۶۰/۶۰** (با PG+Redis زنده)؛ بدونِ REDIS_URL → ۵۲ pass + ۱ NOT-RUN (رفتارِ درست) |

## ۱۷. فایل‌هایِ تغییر یافته

**Server (۱۵):** `cache.js` (جدید: user epoch)، `cache-invalidation-events.js` (جدید)، `db.js` (hookِ تراکنشی)، `delete-service.js`، `index.js` (handlerها + retention)، `metrics.js` (۶ metric)، `outbox.js` (۳ باگ‌فیکس + watermark + activeBacklog)، `revocation.js`، `routes/{attendance,classes,grades,students,users}.js`، `sync.js`، `worker.js` (tickReplicate).

**Migrations (۲):** `026_outbox_cache_invalidation.sql` + `.down.sql`.

**Tests (۲):** `m15-durable-invalidation.js` (جدید، ~۶۳۰ خط)، `wave8-outbox.js` (O5).

**Tools (۲):** `m15-outbox-capacity.js` (جدید)، `migrate-to-pg.js` (null-version fix).

**Docs (۸):** `CURRENT_PROJECT_INTELLIGENCE.md`، `CURRENT_WORK_EXECUTION_PLAN.md`، `DOCS_FREEZE_v1.0.0-rc44.md`، `DOCS_INDEX.md`، `MULTI_INSTANCE_AUDIT.md`، `PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md`، `audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md`، `control-plane/ATRIA_MISSION_M13_F3_FINAL_REPORT.md` (رفعِ ابهامِ N-36).

**Design (۲):** `m15-cache-durable-invalidation/DESIGN.md`، `m15-cache-durable-invalidation/FINAL_REPORT.md` (این فایل).

قوانینِ stage: فقط فایل‌هایِ این مأموریت stage شدند. فایل‌هایِ مأموریت‌هایِ دیگر (`experience-store`، `AGENTS.md`، `docs/AGENT_PATTERNS.md`، `FINAL_REPORT_FA.md`، `.zcode/`، `.mimosa/`) عمداً **خارج** نگه داشته شدند.

## ۱۸. وضعیتِ git

| مورد | مقدار |
|---|---|
| HEADِ شروع | `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` |
| `origin/main`ِ شروع | `1b19449f` (۰ جلو / ۰ عقب) |
| HEADِ پایان (محلی) | `ec4f88d6` |
| `origin/main`ِ پایان | `1b19449f` — **push توسط دروازهٔ Mimosa مسدود شد** (جزئیات پایین) |
| کامیت‌های محلی | ۵: `0538383a` (feat)، `573adb33` + `a51eb2cc` + `3af9ceff` + `ec4f88d6` |
| `npm test` کامل | **۳۸/۳۸ تست موفق، exit 0** |
| نوعِ push | fast-forwardِ پیش‌بینی‌شده، بدونِ rebase یا force-push |

### مسدود شدنِ push — طبقه‌بندی: PRE-EXISTING / BLOCKING-INFRA

دروازهٔ Mimosa پیش از push پروژه را اسکن می‌کند و ۴۵۸ یافتهٔ high + ۱۰۶ medium را مسدود می‌کند. **هیچ‌کدام از این یافته‌ها مربوط به کارِ من نیستند.** evidence:

- ۶ از ۷ فایلِ پرچم‌دار **صفر کامیت** از مبنای `1b19449f` دارند (`server/waf.js`، `server/seed.js`، `src/js/42-self-diagnostics.js`، `tests/b-pg-migration-midflight-kill.js`، `tools/branch-preflight.js`، `tools/capacity-saturation-probe.js`) — یعنی از قبل روی HEAD موجود بودند.
- فایلِ هفتم (`tools/experience-benchmark.js`) **untracked** است و در هیچ‌کدام از کامیت‌های من نیست — اسکنِ دروازه شاملِ فایل‌های untracked می‌شود.

این همان رفتارِ ثابت‌شدهٔ ثبت‌شده در memory است: دروازه نمونه‌برداری می‌کند و فقط کاربر می‌تواند آن را غیرفعال کند. **من Mimosa را غیرفعال نکردم، `--no-verify` نزدم، و هیچ یافته‌ای را suppress نکردم.**

### اصلاحِ اشتباهِ stage (شفافیت کامل)
commit دومِ من (`573adb33`) به‌طور ناخواسته ۱۲ فایلِ خارجی را با خود برد: فایل‌های untrackedِ مأموریتِ experience-store (از sessionهای قبلی) توسط یک `git add` در طول `npm test` stage شده بودند و من آن‌ها را ندیدم. commit سوم (`3af9ceff`) آن‌ها را از شاخه حذف کرد و دو فایلِ tracked که diffشان فقط به‌خاطرِ آن فایل‌ها بود را به `0538383a` برگرداند. **هیچ rebase یا force-push‌ای استفاده نشد** — فقط یک commitِ اصلاحیِ افزاینده.

---

## Verdict

**IMPLEMENTED + VERIFIED ON LIVE INFRA, COMMITTED LOCALLY, PUSH BLOCKED BY PRE-EXISTING GATE.** مسیرِ durable cross-instance invalidation کار می‌کند، اثباتِ منفی نشان می‌دهد که قبل از آن حفره واقعی وجود داشته، سه باگِ واقعی حینِ تست کشف و اصلاح شدند، و ظرفیتِ واقعی اندازه‌گیری شد. `npm test` کامل **۳۸/۳۸** سبز است.

**آنچه درست نیست / ادعا نمی‌شود:**
- این فقط زیرمجموعهٔ **M15-05** است. M15-01..04 و 06..09 دست‌نخورده‌اند.
- هیچ ادعایِ national-scale یا 10M+ صادر نمی‌شود — اعدادِ §۹ فقط برای مسیرِ invalidation رویِ این box هستند.
- retention زیرِ بارِ طولانی‌مدت اندازه‌گیری نشده.
- soak/chaos certification (M15-11) انجام نشده.
- **push انجام نشد** — دروازهٔ Mimosa روی یافته‌هایِ pre-existing مسدود کرد. این یک محدودیتِ زیرساختی است که فقط کاربر می‌تواند آن را حل کند، نه یک نقص در کارِ من.

**قیودِ صریحِ UPDATE شده:** N-36 اصلی (API/Test-CI parity) **هنوز باز است** و نباید بسته حساب شود.

## Next Action (یک مورد)

**برای کاربر:** دروازهٔ Mimosa push را روی ۴۵۸ یافتهٔ high مسدود کرده است که همگی pre-existing هستند (۶ فایل صفر کامیت از `1b19449f` + ۱ فایل untracked از مأموریتِ experience-store). دو گزینه: (الف) غیرفعال‌کردنِ موقتِ دروازه برای این push، یا (ب) منتظر ماندن تا مأموریتِ experience-store کامل و یافته‌های pre-existing رسیدگی شوند. پس از push، تأیید با `git ls-remote origin refs/heads/main` (قانونِ §۱۸).

سپس: **M15-02 (Global Capacity Model)** — چون ظرفیتِ مسیرِ invalidation اکنون اندازه‌گیری‌شده است، M15-02 می‌تواند آن را به‌عنوانِ یک نقطهٔ دادهٔ واقعی وارد کند.
