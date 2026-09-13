# HA — PostgreSQL: Primary + Standby + Archive (PITR) + PgBouncer

> مرجعِ زیرساختِ `infra/postgres/` برایِ رفعِ موانعِ P0#3 (HA دیتابیس، PITR،
> Restore-Drill، Failover-Drill). سندِ بالادستیِ اهدافِ RPO/RTO:
> `docs/RELIABILITY_DR_PLAN.md` (SLA ۹۹٫۹۵٪ · RTO≤۱۵د · RPO≤۵د · failover≤۳۰ث)
> — این سند همان اعداد را با ابزارهایِ این ریپو **قابلِ اجرا** می‌کند.
> سناریوهایِ عملیاتی و چک‌لیست‌ها: `docs/DR_RUNBOOK.md`.

## ۱) توپولوژی

```
            ┌──────────────┐  wal archiving (pgbackrest, sync)   ┌───────────────┐
 client ──▶ │  PgBouncer   │──▶ pg-primary (read/write) ────────▶│ S3/MinIO repo │
            │  :6432 txn   │         │ streaming (async)          │ full+diff+WAL │
            └──────────────┘         ▼                           └───────┬───────┘
                              pg-standby (hot_standby, read-only) ◀─────┘
                              :5433 ↩ READ_DATABASE_URL (کارت‌خوانِ سنگین/گزارش)
```

| سرویس | نقش | نکته |
|---|---|---|
| `pg-primary` | نوشتن یکتا | `wal_level=replica`، `archive_mode=on`، `archive_command=pgbackrest --stanza=payesh archive-push %p` |
| `pg-standby` | hot-standby | bootstrap با `pg_basebackup -R` (یا `STANDBY_BOOTSTRAP=repo`)؛ `restore_command` برایِ شکاف‌های شبکه |
| `pgbouncer` | استخرِ اتصال | transaction pooling؛ فایلِ `pgbouncer/pgbouncer.ini` هر دو مسیر `payesh` (primary) و `payesh-readonly` (standby) را دارد |
| `pg-backup` | بازویِ بکاپ | همان ایمیج + pgbackrest؛ cronِ میزبان (پایین §۵) |
| `minio` (اختیاری) | فضای شیئی | اگر S3 ابری دارید همین متغیرها را به endpoint واقعی بدهید |

## ۲) شروعِ سریع (روی میزبانِ Docker-capable)

```bash
cp infra/postgres/env.ha.example infra/postgres/.env.ha
# مقدارهای env.ha را پر کن (0600) — هیچ رازی در ریپو نیست؛ secret-scan نگهبان است
docker compose -f infra/postgres/docker-compose.ha.yml --env-file infra/postgres/.env.ha up -d --build
docker compose -f infra/postgres/docker-compose.ha.yml --env-file infra/postgres/.env.ha exec pg-backup \
  pgbackrest --stanza=payesh stanza-create
docker compose ... exec pg-backup pgbackrest --stanza=payesh check
docker compose ... exec pg-backup pgbackrest --stanza=payesh --type=full backup
bash infra/postgres/post-checks.sh        # walsender/walreceiver/lag/archiver → PASS
```

پس از بالا آمدن، برنامه فقط **دو** متغیر محیط لازم دارد (`server/db.js`):

```
DATABASE_URL=postgres://app:<pw>@127.0.0.1:6432/payesh          # نوشتن/خواند‌نِ اصلی ← PgBouncer
READ_DATABASE_URL=postgres://ro:<pw>@127.0.0.1:6432/payesh-readonly   # کارت‌خوانِ گزارش/سنگین ← standby (Wave-10)
```

## ۳) معیارها ⇄ تحقق

| معیارِ P0#3 | ابزارِ همین ریپو | سنجه |
|---|---|---|
| HA دیتابیس | استندبایِ streaming + promote با `tools/failover-postgres.sh` | `post-checks.sh` (walreceiver streaming) |
| PITR | pgbackrest full/diff + WAL archive؛ `tools/pitr-restore.sh --time` | بازیابی در محیطِ جدایِ سبز ⇒ PITR |
| Restore-Drill | همان مسیرِ PITR + `tools/pitr-verify.sh` (§۶) | ماهانه خودکار (`RELIABILITY_DR_PLAN` خطِ drill) |
| Failover-Drill | `--dry-run` رویِ کلاسترِ زنده + مانورِ §۷ | RTO ≤ ۱۵د / RPO ≤ ۵د |

## ۴) PgBouncer — قواعدِ transaction pooling

- `pool_mode=transaction`: هر ترنزکشن به یک سرور قفل می‌شود ⇒ **نباید** به
  `LISTEN/NOTIFY`، advisory-lockِ بلندمدت، temp-table یا `SET`ِ sessionی
  تکیه کنید. مسیرهایِ فعلیِ پایش این‌ها را در چرخهٔ داغ ندارند (رجوع:
  `docs/AUTHORIZATION_MODEL.md` برایِ قراردادِ sync). اگر اکشنِ تازه‌ای
  notify می‌خواهد: آن را به `payesh-events` queue/Outbox ببرید (Wave-8).
- `auth_query` با کاربرِ `pgbouncer` (ساخته‌شده در `init/01-replication.sh`):
  رمزِ برنامه‌ها مستقیم به postgres رفرنس می‌شود و در userlist ذخیره نمی‌شود.
  تنگ‌سازیِ آگاهانه: هر دو حسابِ `pgbouncer` و `replicator` فعلاً با
  `PGHA_REPLICATION_PASSWORD` ساخته می‌شوند؛ برایِ پروداکشنِ صلب،
  پچِ بعدیِ §۸ این را تفکیک می‌کند.
- failoverِ دستیِ endpoint فقط یک `sed` رویِ ini + `kill -HUP` است —
  استخرهایِ سمتِ برنامه قطع نمی‌شوند.

## ۵) بکاپ‌گیری زمان‌بندی‌شده (cronِ میزبان)

```cron
# full یکشنبه ۰۲:۰۰ · diff هر روز ۰۲:۰۰ (۷ عددِ retain در repo1-retention-full=7)
0 2 * * 0   docker compose -f /opt/payesh/infra/postgres/docker-compose.ha.yml exec -T pg-backup pgbackrest --stanza=payesh --type=full backup    >> /var/log/payesh-backup.log 2>&1
0 2 * * 1-6 docker compose -f /opt/payesh/infra/postgres/docker-compose.ha.yml exec -T pg-backup pgbackrest --stanza=payesh --type=diff backup     >> /var/log/payesh-backup.log 2>&1
*/30 * * * *  (اختیاری) post-checks.sh | grep -c '^FAIL' && alert
```
`archive_command` هم‌زمان WAL را پیوسته می‌فرستد ⇒ پنجرهٔ از‌دست‌رفتنِ
داده = حداکثر چند ثانیه (RPO≤۵د مطمئناً برآورده).

## ۶) Restore-Drill (سناریویِ ۴ — «پشتیبان بی‌آزمون، پشتیبان نیست»)

```bash
# الف) نقطه‌ایِ قبلِ فاجعهٔ شبلی (یا --latest برایِ تمرینِ روتین):
tools/pitr-restore.sh --time "2026-09-10 09:00:00+03:30"
#   ⇒ PITR_READY dir=... port=54329 ; خروجیِ verify را در لاگِ drill ثبت کن
# ب) تأییدِ خودکار:
PGHOST=<run>/run PGPORT=54329 PGDATABASE=payesh tools/pitr-verify.sh \
  --host-dir <run>/run --port 54329 --expect-before '2026-09-10 09:00:00'
# پ) جمع‌آوری: pg_ctl stop && rm -rf run_dir
```
`pitr-verify` چک می‌کند: promote شده، جدول‌های حیاتی غیرخالی، replay به
تاریخِ هدف رسیده و checksumِ ۲۰۰ ردیف اولِ هر جدول (برایِ مقایسه با
drill ماهِ قبل). تکرارِ **ماهانه** طبق `RELIABILITY_DR_PLAN` §۳ (drillِ خودکارِ
مانه) و ثبتِ نتیجه در `docs/DR_RUNBOOK.md` جدولِ drill-log.

## ۷) Failover-Drill (مانورِ فصلیِ P0#3)

```bash
# ۱) شبیه‌سازیِ کشتنِ primary رویِ استیجینگ:
docker compose -f infra/postgres/docker-compose.ha.yml stop pg-primary pgbouncer
# ۲) مانورِ promote (تایمر روشن — هدف: RTO≤۱۵د؛ سناریو ۱: ~۴د):
tools/failover-postgres.sh            # گاردها؛ سپس SELECT pg_promote(...)
# ۳) بازگشتِ منظمِ نقش‌ها: fence primaryِ کهنه، rebuild standby (§۸)،
#    DATABASE_URL را به سرویسِ تازه هم‌راستا/تأیید کن، post-checks.sh سبز.
```

## ۸) پس از این فاز (پیگیری‌ها)

- پچِ CodeQL در `ci/pending/security-sast-sca.patch` (توکنِ `workflow` لازم است).
- تفکیکِ رمزِ `replicator` و `pgbouncer` (envِ مستقل + روتیشن).
- replication slotِ فیزیکی + `max_slot_wal_keep_size` برایِ پنجرهٔ قطعیِ بلند
  (امروز `wal_keep_size=1GB` — مانده از تنظیمِ compose).
- `pause_at_recovery_target` منسوخ است؛ روی PG16 با `recovery_target_action=promote`
  کار می‌شود (`recovery.conf.template` فقط الگویِ انسانی است).
