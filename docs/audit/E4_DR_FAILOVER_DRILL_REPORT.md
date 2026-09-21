# E4 — Disaster Recovery / Failover Drill Report (Chat 4, مستقل)

**SHA (HEAD در زمان اجرا):** `be05905d9747f51647e87813f4e374793421122b`
**تاریخ اجرا:** 2026-09-21 (UTC)
**نقش:** Chat 4 — Verification مستقل بخش E4 DR/Failover (Phase 8.2 evidence reconciliation)
**دامنه:** M2 — PostgreSQL/pgBackRest · Redis/Sentinel

> این گزارش با Gateهای قبلی Chat 4 (F-QA-01/04/05/07) اشتباه گرفته نشود؛ آن‌ها governance/CI بودند و
> اینجا صرفاً DR/Failover است.

---

## ۰. جمع‌بندی وضعیت (خلاصهٔ اجرایی)

| حوزه | وضعیت |
|---|---|
| pgBackRest — backup/verify/restore/PITR | **PARTIAL** (اجرای واقعی موفق، اما در سطح **E3** نه E4) |
| Redis/Sentinel — failover/recovery | **PARTIAL** (اجرای واقعی موفق، اما در سطح **E3** نه E4) |
| encrypted **S3** offsite repository | **EXTERNAL BLOCKER / OWNER DECISION REQUIRED** |
| **E4 (production-equivalent) به‌طور کلی** | **NOT VERIFIED** |

**علت رسمی:** طبق `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` **Rule 7**:

> «آزمون‌های محلی، mockها، شبیه‌سازی‌ها و دیتابیس‌های تک‌نودی سطح **E3** هستند. سطح **E4** مستلزم
> استقرار فیزیکی کلاستر چندنودی با تزریق خطای واقعی است. در غیاب E4، وضعیت رسماً `E4 NOT VERIFIED` درج می‌شود.»

همهٔ drillهای زیر روی **یک کرنل/یک هاست** (`e2b.local`, nproc=2) اجرا شدند. نقش‌ها با
datadir/port/process جدا شدند (چند-instance واقعی)، اما **چند-هاست فیزیکی نیستند** ⇒ طبق Rule 7
نمی‌توان آن‌ها را E4 نامید. این محدودیت **دور زده نشد** و به‌عنوان بلاکر ثبت شده است.

**آنچه واقعاً اثبات شد (E3، با موتور واقعی نه mock):** pgBackRest 2.55.1 و PostgreSQL 17.11 و
Redis 8.0.2 + Sentinel واقعاً نصب و اجرا شدند؛ backup رمزنگاری‌شده، verify چک‌سام، restore هویت‌محور،
PITR پس از حذف مخرب و `kill -9`، و failover واقعی Sentinel با کشتن master.

---

## ۱. محیط و توپولوژی

```
host            : e2b.local (single kernel) — nproc=2, mem≈1984MB
postgres        : PostgreSQL 17.11 (Debian 17.11-0+deb13u1)
pgbackrest      : pgBackRest 2.55.1
redis           : Redis 8.0.2  +  redis-sentinel
docker/kubectl  : ABSENT  (⇒ multi-host physical topology غیرممکن)
aws cli / creds : ABSENT  (⇒ S3 offsite غیرممکن)
```

**توپولوژی PostgreSQL (multi-instance، single-host):**

| نقش | datadir | port |
|---|---|---|
| primary | `/tmp/e4/pg1` | 55501 |
| restore target ۱ | `/tmp/e4/restore1` | 55511 |
| PITR target | `/tmp/e4/restore2` | 55512 |
| restore target ۲ (run 2) | `/tmp/e4/restore3` | 55513 |

**توپولوژی Redis (multi-instance، single-host):** master `56001` + replica `56002` + replica `56003`
و سه Sentinel روی `56011/56012/56013` با `quorum=2`، `down-after=2000ms`.

**پیکربندی pgBackRest (رمزنگاری واقعی):**

```ini
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=<redacted>
repo1-bundle=y
repo1-block=y
repo1-retention-full=2
```

---

## ۲. DRILL M2-1 — Full backup + integrity + checksum

| قلم | مقدار |
|---|---|
| **SHA** | `be05905d` |
| **topology** | primary `:55501` → repo رمزنگاری‌شده `/tmp/e4/repo` |
| **exact command** | `pgbackrest --config=/tmp/e4/pgbackrest.conf --stanza=payesh --type=full backup` |
| **environment** | PostgreSQL 17.11 · pgBackRest 2.55.1 · AES-256-CBC |
| **failure injection** | — (این drill پایه است) |
| **expected** | backup موفق + همهٔ checksumها معتبر + عدم نشت plaintext |
| **actual** | `exit=0`; `new backup label = 20260921-144806F`; `full backup size = 29.2MB, file total = 974`; repo size 3.9MB |
| **recovery result** | n/a |
| **RPO / RTO** | n/a |
| **run count** | ۲ (full در run 1، incr `20260921-144806F_20260921-144919I` در run 2) |
| **evidence** | `pgbackrest verify` → `exit=0`، «verify command end: completed successfully»؛ `info` → `status: ok`, `cipher: aes-256-cbc` |
| **status** | **PARTIAL** (اجرای واقعی ✅، ولی E3 — هاست واحد) |

**اثبات رمزنگاری در حالت سکون:** بایت‌های ابتدای فایل مخزن `Salted__ 214 341 372 030 …`
(هدر OpenSSL) و جست‌وجوی plaintext (`students`, متن فارسی) در ۵۱۲ بایت اول **هیچ تطبیقی نداشت**.

**یک شکست واقعی که رخ داد و رفع شد (نه دور زدن):** اولین `pgbackrest check` با
`FATAL: role "user" does not exist` شکست خورد، چون pgBackRest با کاربر OS وصل می‌شد.
با افزودن `pg1-user=postgres` و `pg1-database=postgres` به stanza رفع شد؛ سپس
`check OK` ⇒ صحت `archive_command` به‌صورت end-to-end اثبات شد.

---

## ۳. DRILL M2-2 — Cross-host restore + restore identity

| قلم | مقدار |
|---|---|
| **SHA** | `be05905d` |
| **topology** | repo → **instance مقصد مجزا** (`/tmp/e4/restore1`, port 55511) — datadir/port/process متفاوت از مبدأ |
| **exact command** | `pgbackrest … --pg1-path=/tmp/e4/restore1 --type=default restore` سپس `pg_ctl -D … start` |
| **environment** | همان بالا |
| **failure injection** | — |
| **expected** | دیتاست بازیابی‌شده **بیت‌به‌بیت** با مبدأ یکسان باشد |
| **actual** | run1: `exit=0`, rows=**50000**, checksum `b3135052591b38b9179e16a965c3e638` = مبدأ ✅ · run2: rows=**37500**, checksum `47a0e647f2150f34160e02c02a6b78cd` = مبدأ ✅ |
| **recovery result** | هر دو instance بالا آمدند و کوئری دادند |
| **RPO** | ۰ ردیف |
| **RTO** | run1 = **407ms** · run2 = **564ms** |
| **run count** | **۲ اجرای مستقل موفق** |
| **evidence** | `restore size = 29.2MB, file total = 974`; مقایسهٔ `md5(string_agg(...))` مبدأ/مقصد |
| **status** | **PARTIAL** (هویت اثبات شد ✅، ولی «cross-host» در اینجا cross-instance است نه cross-machine ⇒ E3) |

> **صداقت روش:** «cross-host» واقعی نیازمند دو ماشین جداست. آنچه اجرا شد جداسازی کامل
> datadir/port/process روی یک کرنل است. این تفاوت پنهان نشده و دلیل PARTIAL بودن است.

**خطای خودم که ثبت می‌کنم:** در تلاش اول، `postgresql.auto.conf` را **overwrite** کردم و
`restore_command` ساختهٔ pgBackRest را پاک کردم ⇒ استارت با
`FATAL: must specify "restore_command" when standby mode is not enabled` شکست خورد.
با **append به‌جای overwrite** اصلاح و RTO صادقانه دوباره اندازه‌گیری شد.

---

## ۴. DRILL M2-3 — PITR با تزریق خطای مخرب + measured RPO/RTO

| قلم | مقدار |
|---|---|
| **SHA** | `be05905d` |
| **topology** | primary `:55501` (قربانی) → PITR به `/tmp/e4/restore2` (`:55512`) |
| **exact command** | `pgbackrest … --pg1-path=/tmp/e4/restore2 --type=time --target="2026-09-21 14:48:49.724284+00" --target-action=promote restore` |
| **environment** | همان بالا |
| **failure injection** | ۱) `DELETE FROM students WHERE province='04'` (حذف **۱۷۵۰۰** ردیف) ۲) `kill -9 <postmaster>` (crash ناتمیز) |
| **expected** | بازگشت به لحظهٔ پیش از حذف؛ هر ۵۵۰۰۰ ردیف برگردد؛ حذف مخرب خنثی شود |
| **actual** | پس از فاجعه روی primary: **37500** ردیف · پس از PITR: **55000** ردیف؛ checksum هدف `4b448535164da9cc294099ca5ffb065d` == بازیابی ✅ |
| **recovery result** | `pg_is_in_recovery()=f` (promote موفق)؛ لاگ: `recovery stopping before commit of transaction 743` |
| **RPO** | **۰ تراکنش از دست رفته** (۵۵۰۰۰/۵۵۰۰۰) |
| **RTO** | **720ms** |
| **run count** | ۱ برای PITR زمان‌محور + ۱ restore مستقل دیگر (M2-2 run2) ⇒ مجموعاً ۲ مسیر بازیابی مستقل |
| **evidence** | `/tmp/e4/log/r2.log`، خروجی `pg_is_in_recovery`, شمارش ردیف و md5 |
| **status** | **PARTIAL** (PITR واقعی اثبات شد ✅؛ E3) |

**crash recovery مستقل:** primaryِ `kill -9`‌شده دوباره استارت شد و بدون مداخله بالا آمد
(۳۷۵۰۰ ردیف، منطبق با وضعیت پس از فاجعه) ⇒ durability پس از کشته‌شدن ناتمیز اثبات شد.

---

## ۵. DRILL R-1/R-2 — Redis Sentinel: kill-master، failover، recovery

| قلم | مقدار |
|---|---|
| **SHA** | `be05905d` |
| **topology** | master `:56001` + replicas `:56002`,`:56003` + sentinels `:56011-13` (quorum 2) |
| **exact command** | `kill -9 $(redis-cli -p <master> info server \| grep process_id)` سپس polling روی `redis-cli -p 56011 sentinel get-master-addr-by-name payesh-master` |
| **environment** | Redis 8.0.2، `appendonly yes`, `appendfsync everysec`, `down-after-milliseconds=2000` |
| **failure injection** | کشتن master با `-9` (بدون shutdown تمیز) — دو بار، روی دو master متفاوت |
| **expected** | Sentinel خودکار master جدید انتخاب کند، نوشتن ازسر گرفته شود، داده از دست نرود |
| **actual — run 1** | `56001 → 56003`; **RTO=4325ms**; کلیدها 2001/2000 ⇒ **RPO=0** |
| **actual — run 2** | `56003 → 56002`; **RTO=3341ms**; کلیدها 3002/3001 ⇒ **RPO=0** |
| **recovery result** | هر دو master جدید بلافاصله `write` پذیرفتند (`role:master`) |
| **run count** | **۲ اجرای مستقل موفق** |
| **evidence** | خروجی `sentinel get-master-addr-by-name` قبل/بعد، `dbsize`، `info replication` |
| **status** | **PARTIAL** (failover واقعی ✅؛ E3 — همهٔ نودها روی یک هاست) |

### stale state / rejoin
نود کشته‌شده پس از restart **به‌درستی به replica تنزل یافت** و کلیدی را که *بعد از مرگش* نوشته
شده بود بازخواند:

```
:56001 role:slave master_port:56002 master_link_status:up failover-probe='ok' dbsize=3002
:56003 role:slave master_port:56002 master_link_status:up probe2='ok'
sentinel authoritative master = 127.0.0.1:56002
```

⚠️ **یک مثبت کاذب که خودم اصلاح کردم:** اندازه‌گیری اول «STALE STATE DETECTED» داد، چون
**زودتر از اتمام reconfigure توسط Sentinel** خوانده بودم. با polling صحیح، زمان واقعی
reconfigure **۱۵۱۹۲ms** اندازه‌گیری شد و نتیجه **NO STALE STATE** است. نتیجهٔ نادرست اول
حذف نشد و همین‌جا ثبت می‌شود.

### dependency failure — از دست رفتن quorum (fail-closed)
دو Sentinel از سه‌تا با `-9` کشته شدند (تنها `:56013` زنده، quorum=2 غیرقابل‌حصول)، سپس master کشته شد:

```
sentinels alive : 56013
master killed   : 56002
sentinel reports: 127.0.0.1:56002  (بدون تغییر)
⇒ هیچ failoverی رخ نداد — رفتار fail-closed صحیح ✅ (بدون انتخاب خودسرانه/split-brain)
```

---

## ۶. سوئیت‌های DR خود مخزن (۲ اجرای مستقل، E2/E3)

| suite | run 1 | run 2 |
|---|---|---|
| `tests/disaster-recovery-coverage.js` | `47/47` exit 0 | `47/47` exit 0 |
| `tests/db-replica-recovery.js` | `11/11` exit 0 | `11/11` exit 0 |
| `tests/backup-snap.js` | **SKIPPED** (jsdom نصب نیست) | **SKIPPED** |

> `backup-snap.js` **PASS محسوب نمی‌شود**؛ skip ≠ pass.

---

## ۷. EXTERNAL BLOCKER / OWNER DECISION REQUIRED

| # | بلاکر | شاهد | چرا دور زده نشد |
|---|---|---|---|
| **E4-B1** | **encrypted S3 offsite repository** اجرا نشد | `aws` نصب نیست، `AWS_ACCESS_KEY_ID` غایب؛ مخزن `PB_REPO_S3_BUCKET` را در `infra/postgres/docker-compose.ha.yml` تعریف کرده ولی اعتبارنامه‌ای وجود ندارد | ساختن یک S3 قلابی/لوکال، «offsite رمزنگاری‌شده» را اثبات **نمی‌کند**؛ ادعای دروغ می‌شد |
| **E4-B2** | **کلاستر چندهاستی فیزیکی** غیرممکن | `docker`/`kubectl` ABSENT، تک‌کرنل `e2b.local`، nproc=2 | طبق Rule 7 تک‌نود = E3؛ نامیدنش E4 ارتقای غیرمجاز سطح شواهد است |
| **E4-B3** | **RTO/RPO تولیدی** قابل تعمیم نیست | اعداد روی دیتاست ۲۹.۲MB و بدون latency شبکه/دیسک تولیدی | برون‌یابی به مقیاس 10M دانش‌آموز شواهد ساختگی است |

هیچ‌کدام bypass نشد و هیچ `continue-on-error`/`|| true`/skip برای سبزسازی اضافه نشد.

---

## ۸. جدول نهایی وضعیت

| Drill | RPO | RTO | runs | status |
|---|---|---|---|---|
| M2-1 full/incr backup + verify + AES-256 | n/a | n/a | ۲ | **PARTIAL** |
| M2-2 restore identity (cross-instance) | ۰ ردیف | 407ms / 564ms | ۲ | **PARTIAL** |
| M2-3 PITR پس از DELETE مخرب + `kill -9` | **۰ تراکنش** | 720ms | ۲ مسیر | **PARTIAL** |
| R-1/R-2 Sentinel kill-master failover | **۰ کلید** | 4325ms / 3341ms | ۲ | **PARTIAL** |
| Redis rejoin / stale-state | n/a | 15192ms reconfig | ۱ (پس از تصحیح) | **PARTIAL** |
| Redis quorum-loss fail-closed | n/a | n/a | ۱ | **PARTIAL** |
| encrypted S3 offsite | — | — | ۰ | **BLOCKED** |
| multi-host physical cluster | — | — | ۰ | **BLOCKED** |
| **E4 Disaster Recovery / Failover (کلی)** | — | — | — | **NOT VERIFIED** |

---

## ۹. وضعیت فازها (بدون تغییر)

```
E4 Disaster Recovery / Failover = NOT VERIFIED
Phase 8.2 Exit                  = NOT VERIFIED
Phase 8.3                       = BLOCKED
Production GO                   = NOT DECLARED
```

هیچ ادعای `VERIFIED` ثبت نشد، هیچ تگی ساخته/جابه‌جا نشد، و هیچ finding بسته‌ای بازگشایی نشد.
