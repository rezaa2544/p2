# CHAT 4 — E4 Disaster Recovery Verification (Rule 15: ۵ تسک × ۵ راستی‌آزمایی)

**Current SHA:** `885f91178f5e4c382f898d1014729a7cb3a95dc6`
**تاریخ اجرا:** 2026-09-21 (UTC) · **Agent:** Chat 4 — E4 DR Verification (Phase 8.2)
**سیاست مرجع:** `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` **v1.2.0** (Rule 1–28، SKILL-01–25)

---

## ۰. حکم نهایی

# E4 NOT VERIFIED

**مبنای رسمی — Rule 7 (عیناً):**

> «آزمون‌های محلی، mockها، شبیه‌سازی‌ها و دیتابیس‌های تک‌نودی سطح **E3 (Integrated Runtime)** هستند.
> سطح **E4 (Production-Equivalent)** مستلزم استقرار فیزیکی کلاستر چندنودی با تزریق خطای واقعی (Chaos)
> است. در غیاب E4، وضعیت رسماً `E4 NOT VERIFIED` درج می‌شود.»

**واقعیت محیط:** `hostname=e2b.local`, `kernel=6.1.158+`, `nproc=2` — همهٔ نقش‌ها روی **یک کرنل**؛
`docker`/`kubectl`/`aws` **ABSENT**. بنابراین کلاستر چندنودی فیزیکی **غیرممکن** است.

**آنچه انجام شد:** موتورهای **واقعی** (PostgreSQL 17.11، pgBackRest 2.55.1، Redis 8.0.2 + Sentinel)
نصب و اجرا شدند و خطای **واقعی** تزریق شد (`kill -9`، `DELETE` مخرب، خرابی بایت‌های مخزن، قطع quorum).
این شواهد **E3 قوی** است، نه E4. هیچ محیط قلابی برای سبز کردن Gate ساخته نشد.

---

## ۱. Topology (Rule 25)

```
host: e2b.local — single kernel 6.1.158+, nproc=2, mem≈1984MB   ⇒ E3 ceiling

PostgreSQL (multi-instance، تک‌هاست):
  primary        /tmp/e4/pg1  :55501   (data-checksums=on, archive_mode=on)
  restore-1      /tmp/e4/r1   :55511
  PITR-1         /tmp/e4/p1   :55512
  PITR-2         /tmp/e4/p2   :55513
  repo           /tmp/e4/repo  posix + aes-256-cbc + bundle + block

Redis (multi-instance، تک‌هاست):
  master/replica :56001 :56002 :56003   (appendonly=yes, appendfsync=everysec)
  sentinels      :56011 :56012 :56013   (quorum=2, down-after=2000ms)
```

---

## ۲. TASK 1 — PostgreSQL Backup & Integrity

| # | بُعد | دستور دقیق | انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|
| V1 | Functional | `pgbackrest --stanza=payesh --type=full backup` | full موفق | `exit=0` · `20260921-193337F` · 29.2MB/974 file | **E3 PASS** |
| V2 | Boundary | `--type=incr backup` بدون هیچ تغییر داده | delta باید ناچیز شود | `exit=0` · **8.3KB**/974 file | **E3 PASS** |
| V3 | Integrity | `pgbackrest verify` + بازرسی بایت‌ها | چک‌سام سالم + رمزنگاری | `exit=0` · `cipher: aes-256-cbc` · magic `Salted__` · **صفر** plaintext | **E3 PASS** |
| V4 | **Failure Injection** | `dd` خرابی ۱۶ بایت در فایل مخزن، سپس `verify` و `restore` | خرابی باید شناسایی و مانع بازیابی شود | `invalid checksum` · `973/974 valid` · **اما `verify exit=0`** · `restore exit=29` | **PARTIAL — یافتهٔ باز** |
| V5 | Independent re-run | full دوم + `info --output=json` | تکرارپذیری | `20260921-193428F` · `status: ok` | **E3 PASS** |

### 🔴 یافتهٔ DR-01 (P1) — `pgbackrest verify` خرابی را می‌بیند ولی **exit 0** برمی‌گرداند

بازتولید **۲ بار مستقل**:

```
trial 1: exit=0  'invalid checksum' lines=1  status: invalid
trial 2: exit=0  'invalid checksum' lines=1  status: invalid
```

**اثر عملیاتی:** هر گیت CI که فقط به exit code تکیه کند، **پشتیبان خراب را سبز رد می‌کند**.
**عامل نجات:** `restore` روی همان backup خراب **fail-closed** است (`exit=29`,
`zlib threw error: [-3] data error`) ⇒ بازیابی خاموشِ ناقص رخ نمی‌دهد.
**اقدام:** گزارش شد؛ طبق Rule 20 (حداقل‌گرایی) و چون این رفتار **ابزار بیرونی** است،
هیچ patch در مخزن اعمال نشد. برای گیت آینده باید خروجی `verify` از نظر
`status: invalid` / `invalid checksum` پارس شود، نه صرفاً exit code.

### ⚠️ S3 — ادعا نشد
`repo1-path=/tmp/e4/repo`، **صفر** ورودی `repo1-type=s3`، `aws` نصب نیست، credential وجود ندارد.
⇒ مخزن **POSIX محلی** است و صراحتاً **S3 اعلام نمی‌شود**. (`EXTERNAL BLOCKER`)

---

## ۳. TASK 2 — Restore Identity / PITR

| # | بُعد | دستور دقیق | انتظار | نتیجهٔ واقعی | RPO | RTO | وضعیت |
|---|---|---|---|---|---|---|---|
| V1 | Functional | `restore --pg1-path=/tmp/e4/r1` → `:55511` | md5 یکسان | rows=50000 · md5 `b3135052…` == مبدأ | ۰ | **400ms** | **E3 PASS** |
| V2 | Boundary | `pg_stat_database.checksum_failures` + null-scan | صفر خرابی | `checksum_failures=0` · `null-violations=0` | — | — | **E3 PASS** |
| V3 | **Failure Injection** | `DELETE province='04'` (**۱۷۵۰۰** ردیف) + `kill -9 postmaster` + PITR `--type=time` | بازگشت کامل | 37500 → **55000/55000** · md5 `f6fd3372…` | **۰** | **963ms** | **E3 PASS** |
| V4 | Resilience | استارت مجدد primaryِ `kill -9` شده | crash recovery خودکار | بالا آمد در **244ms** · rows=37500 (منطبق با پس از فاجعه) | — | 244ms | **E3 PASS** |
| V5 | **Independent re-run** | PITR دوم به `:55513` با همان target time | نتیجهٔ یکسان | **55000/55000** · md5 `f6fd3372…` **عیناً برابر RUN1** | **۰** | **871ms** | **E3 PASS** |

**دو اجرای مستقل بحرانی ✅** — PITR دو بار روی دو مقصد مجزا با md5 یکسان بازتولید شد.

---

## ۴. TASK 3 — Redis Sentinel Failover

| # | بُعد | دستور دقیق | انتظار | نتیجهٔ واقعی | RPO | RTO | وضعیت |
|---|---|---|---|---|---|---|---|
| V1 | Functional | `info replication` + `sentinel master` | ۱ master + ۲ replica + quorum | `connected_slaves:2` · `num-other-sentinels=2` · `quorum=2` | — | — | **E3 PASS** |
| V2 | Boundary | ۲۰۰۰ کلید + `WAIT 2 2000` | هر دو replica ack دهند | `WAIT → 2` · replicaها 2000/2000 | — | — | **E3 PASS** |
| V3 | **Failure Injection** | `kill -9 <master pid>` (RUN 1) | failover خودکار | `56001 → 56003` · نوشتن پذیرفته شد | **۰ کلید** (2001/2000) | **3289ms** | **E3 PASS** |
| V4 | Resilience | ۱۰۰۰ نوشتن دیگر + `kill -9` دوم (RUN 2) | write recovery | `56003 → 56002` | **۰ کلید** (3002/3001) | **3327ms** | **E3 PASS** |
| V5 | **Independent re-run** | پرس‌وجو از Sentinel **متفاوت** (`:56012`, `:56013`) | توافق کامل | هر دو `127.0.0.1:56002` — **CONSISTENT** | — | — | **E3 PASS** |

**دو اجرای مستقل بحرانی ✅** — دو failover واقعی روی دو master متفاوت، هر دو با **RPO=0**.

---

## ۵. TASK 4 — Recovery / Failure Conditions

| # | بُعد | دستور دقیق | انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|
| V1 | Functional | خواندن نقش بلافاصله (t=+2s) پس از restart | — | `role:master`, probe خالی ⇒ **FALSE POSITIVE** | **ثبت‌شده، پنهان نشد** |
| V2 | Boundary | polling تا همگرایی Sentinel | تنزل به replica | همگرایی در **13482ms** · `role:slave` · `master_port:56002` · `link:up` · probe=`ok` ⇒ **NO STALE STATE** | **E3 PASS** |
| V3 | **Failure Injection** | `kill -9` دو Sentinel از سه، سپس `kill -9` master | بدون quorum هیچ failoverی نشود | فقط `:56013` زنده · گزارش بدون تغییر `56002` ⇒ **FAIL-CLOSED** | **E3 PASS** |
| V4 | Split-brain | تلاش نوشتن روی نودهای بازمانده | هیچ self-promotion | `:56001 role:slave` → `READONLY You can't write against a read only replica` · صفر نود مدعی master | **E3 PASS** |
| V5 | **Independent re-run** | بازگرداندن دو Sentinel (بازیابی quorum) | خودترمیمی | master جدید `:56001` در **64004ms** · نوشتن برقرار · **۳۰۰۳ کلید حفظ شد** | **E3 PASS** |

### ⚠️ Positive False — با صراحت ثبت شد (Rule 25 / SKILL-21)
در نشست قبل «STALE STATE DETECTED» گزارش کرده بودم. اینجا **عمداً بازتولیدش کردم** تا ثابت شود
یک **آرتیفکت زمان‌بندی** بود: خواندن در t=+2s نتیجهٔ غلط می‌دهد، چون Sentinel هنوز reconfigure
را تمام نکرده. زمان واقعی همگرایی **۱۳۴۸۲ms** است و نتیجهٔ درست **NO STALE STATE**.
نتیجهٔ غلط حذف نشد و در همین جدول باقی است.

---

## ۶. TASK 5 — E4 Classification & Evidence Package

| Drill | Topology | Command | Failure | Expected | Actual | RPO | RTO | Runs | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 full/incr backup | single-host، repo رمز | `pgbackrest --type=full\|incr backup` | — | موفق | `exit=0`، 29.2MB / 8.3KB | — | — | ۲ | `20260921-193337F`, `…193428F` | **E3** |
| T1 encryption at rest | همان | بازرسی بایت + `info` | — | ciphertext | `Salted__`، `aes-256-cbc`، صفر plaintext | — | — | ۱ | magic bytes | **E3** |
| T1 corruption detect | همان | `dd` + `verify` | خرابی ۱۶ بایت | verify باید **قرمز** شود | شناسایی شد ولی **exit=0** | — | — | ۲ | `973/974 valid` | **PARTIAL (DR-01)** |
| T1 corrupt restore block | همان | `restore --set=<corrupt>` | همان | fail-closed | **`exit=29`** zlib data error | — | — | ۱ | لاگ restore | **E3** |
| T2 restore identity | `:55511` مستقل | `restore --pg1-path=…/r1` | — | md5 یکسان | 50000 rows، md5 مطابق | ۰ | 400ms | ۱ | md5 مقایسه | **E3** |
| T2 PITR ×۲ | `:55512`, `:55513` | `restore --type=time --target-action=promote` | DELETE ۱۷۵۰۰ + `kill -9` | بازگشت کامل | **55000/55000** هر دو بار، md5 یکسان | **۰** | 963 / 871ms | **۲** | `recovery stopping before commit 754` | **E3** |
| T2 crash recovery | primary | `pg_ctl start` پس از `kill -9` | crash ناتمیز | بازیابی خودکار | 244ms، rows=37500 | — | 244ms | ۱ | لاگ pg1 | **E3** |
| T3 failover ×۲ | 3 نود + 3 sentinel | `kill -9 <master>` | مرگ master | انتخاب خودکار | `56001→56003`, `56003→56002` | **۰** | 3289 / 3327ms | **۲** | `sentinel get-master-addr` | **E3** |
| T4 stale/rejoin | همان | restart + polling | تنزل به replica | `role:slave`, probe=`ok` | همگرایی 13482ms | — | — | ۱ | `info replication` | **E3** |
| T4 quorum loss | ۱ از ۳ sentinel | `kill -9` ۲ sentinel + master | بدون failover | **FAIL-CLOSED** تأیید شد | — | — | ۱ | گزارش sentinel | **E3** |
| T4 split-brain | بازماندگان | `SET` روی replica | رد نوشتن | `READONLY …` | — | — | ۱ | پاسخ Redis | **E3** |
| T4 quorum heal | بازگرداندن ۲ sentinel | restart sentinelها | خودترمیمی | master `:56001`، ۳۰۰۳ کلید سالم | ۰ | 64004ms | ۱ | dbsize | **E3** |
| repo DR suites | node runtime | `node tests/disaster-recovery-coverage.js` · `db-replica-recovery.js` | — | سبز | `47/47` و `11/11` — هرکدام **۲ بار** | — | — | ۲ | exit=0 | **E2/E3** |
| **encrypted S3 offsite** | — | — | — | — | اجرا نشد | — | — | **۰** | `aws` و credential غایب | **EXTERNAL BLOCKER** |
| **physical multi-node** | — | — | — | — | اجرا نشد | — | — | **۰** | docker/kubectl غایب، تک‌کرنل | **EXTERNAL BLOCKER** |
| **E4 DR/Failover (کلی)** | — | — | — | — | — | — | — | — | Rule 7 | **E4 NOT VERIFIED** |

---

## ۷. Blockers

| # | بلاکر | نوع | چرا bypass نشد |
|---|---|---|---|
| E4-B1 | مخزن **S3 رمزنگاری‌شدهٔ offsite** | **EXTERNAL BLOCKER / OWNER DECISION REQUIRED** | ساختن S3 محلی «offsite» را اثبات نمی‌کند؛ ادعای کاذب می‌شد |
| E4-B2 | **کلاستر چندنودی فیزیکی** | **EXTERNAL BLOCKER** | تک‌کرنل؛ طبق Rule 7 نامیدن آن E4 ارتقای غیرمجاز سطح شواهد است |
| E4-B3 | **RTO/RPO در مقیاس تولید** | **EXTERNAL BLOCKER** | اعداد روی ۲۹.۲MB و بدون latency شبکه/دیسک تولیدی؛ تعمیم به ۱۰M شواهد ساختگی است |
| DR-01 | `verify` خرابی را می‌بیند ولی `exit 0` | **OWNER DECISION REQUIRED** (نقص ابزار بیرونی) | اصلاح pgBackRest خارج از مخزن است؛ گیت آینده باید خروجی را پارس کند |

---

## ۸. Corrections (SKILL-21 — خوداظهاری خطا)

1. **False positive «stale state»** — در نشست قبل گزارش شده بود؛ اینجا بازتولید و **رد** شد
   (آرتیفکت زمان‌بندی؛ همگرایی واقعی ۱۳۴۸۲ms). در جدول Task 4 باقی ماند و پاک نشد.
2. **`postgresql.auto.conf` overwrite** (نشست قبل) — `restore_command` را از بین می‌برد؛
   در این اجرا از **append** استفاده شد و همهٔ RTOها با روش درست اندازه‌گیری شدند.
3. **محیط بین نشست‌ها پاک می‌شود** — `pgbackrest`/`postgres`/`redis` و `/tmp/e4` از بین رفته بودند
   و از نو نصب شدند؛ بنابراین اعداد این گزارش **از اجرای تازه روی SHA فعلی** است، نه بازاستفادهٔ تاریخی (Rule 5).

---

## ۹. وضعیت نهایی

```
TASK 1 Backup & Integrity      = E3 PASS (با یافتهٔ باز DR-01 → PARTIAL)
TASK 2 Restore Identity / PITR = E3 PASS  (۲ اجرای مستقل، RPO=0)
TASK 3 Redis Sentinel Failover = E3 PASS  (۲ اجرای مستقل، RPO=0)
TASK 4 Recovery / Failure      = E3 PASS  (fail-closed و بدون split-brain)
TASK 5 Classification          = تکمیل شد

E4 Disaster Recovery / Failover = E4 NOT VERIFIED
Phase 8.2 Exit                  = NOT VERIFIED
Phase 8.3                       = BLOCKED
Production GO                   = NOT DECLARED
```

هیچ ادعای `VERIFIED` بدون شواهد ثبت نشد · هیچ تگی ساخته/جابه‌جا نشد ·
هیچ `continue-on-error`/`|| true`/skip اضافه نشد · هیچ محیط قلابی ساخته نشد.
