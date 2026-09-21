# CHAT 4 — E4 DR/HA Reconciliation & Blocker Gate

**Current HEAD (اجرا روی همین SHA):** `be16cbe96e31e640b7d78cbe21fb06e9dc04a591`
**گزارش قبلی روی:** `885f91178f5e4c382f898d1014729a7cb3a95dc6` — تأیید شد که **ancestor of origin/main** است.
**تاریخ:** 2026-09-21 (UTC) · **سیاست:** `ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` v1.2.0 (Rule 1–28، SKILL-01–25)

---

## ۰. حکم

# E4 NOT VERIFIED

**۰ از ۶ معیار E4 برقرار است** (اثبات تجربی در Task 4). طبق **Rule 7** هیچ ارتقایی مجاز نیست.
همهٔ شواهد زیر با **موتور واقعی** تولید شده‌اند (PostgreSQL 17.11، pgBackRest 2.55.1، Redis 8.0.2 + Sentinel)
و **E3 قوی** محسوب می‌شوند — نه E4. هیچ محیط قلابی ساخته نشد.

**Topology واقعی این اجرا**

```
host e2b.local · kernel 6.1.158+ · nproc=2 · همهٔ نقش‌ها روی یک کرنل  ⇒ سقف E3
PG   primary :55501 (data-checksums=on) · restore :55511 · PITR-1 :55512 · PITR-2 :55513
repo /tmp/e4/repo  posix + aes-256-cbc + bundle + block   (S3 نیست)
Redis :56001 :56002 :56003  +  Sentinel :56011 :56012 :56013 (quorum=2, down-after=2000ms)
```

---

## ۱. TASK 1 — PostgreSQL Backup Integrity + DR-01

| Pass | بُعد | Command | Expected | Actual | Runs | Status |
|---|---|---|---|---|---|---|
| P1 | Functional | `pgbackrest --stanza=payesh --type=full backup` | موفق | `exit=0` · `20260921-195854F` | ۲ | **E3 PASS** |
| P2 | Boundary | `pgbackrest verify` روی مخزن سالم | صفر خطا | `exit=0` · `invalid-lines=0` | ۱ | **E3 PASS** |
| P3 | **Failure Injection** | `dd` ۱۶ بایت خرابی + `verify` | باید **قرمز** شود | `status: invalid` · `972/973 valid` · **`exit=0`** | **۳** | **PARTIAL (DR-01)** |
| P4 | Resilience | `restore --set=<corrupt>` | fail-closed | **`exit=29`** zlib data error | **۲** | **E3 PASS** |
| P5 | Independent re-run | full دوم + `info --output=json` | تکرارپذیر | `20260921-195938F` · `status: ok` · `cipher: aes-256-cbc` | ۲ | **E3 PASS** |

### DR-01 — وضعیت روی HEAD فعلی: **CONFIRMED / OPEN**

```
trial 1: exit=0 | invalid checksum ×1 | status: invalid | total valid files: 972
trial 2: exit=0 | invalid checksum ×1 | status: invalid | total valid files: 972
trial 3: exit=0 | invalid checksum ×1 | status: invalid | total valid files: 972
```

سه پرسش تسک، پاسخ قطعی:
1. **آیا `status invalid` می‌دهد؟** بله — هم `status: invalid` و هم `invalid checksum`.
2. **exit code چه می‌شود؟** **صفر** — یعنی هر گیتی که فقط exit code را ببیند، سبز می‌شود.
3. **آیا restore fail-closed می‌شود؟** **بله** — `exit=29` در هر دو تلاش.

### آیا باید parser/guard حداقلی به مخزن اضافه شود؟ — **نه اکنون (OWNER DECISION)**

بررسی واقعی مخزن:

```
scripts invoking 'pgbackrest verify'  = 0
scripts invoking pgbackrest at all    = 6  (entrypoints ×3، tests ×2، tools/pitr-restore.sh)
tools/pitr-verify.sh                  → پس از restore اعتبارسنجی می‌کند (اتصال + sample-checksum)، نه verify
```

**نتیجه:** هیچ گیت repository-owned‌ای امروز `pgbackrest verify` را صدا نمی‌زند، پس **هیچ گیتی
در حال حاضر فریب نمی‌خورد**. افزودن guard یعنی ساختن گیت برای دستوری که مخزن اجرا نمی‌کند
(نقض **Rule 20 — Change Minimality**) و رفع نقص ابزار بیرونی در مخزن (نقض **Rule 8**).
مسیر اجرایی واقعی (`restore`) هم از پیش fail-closed است.

**الزام آینده (ثبت‌شده برای مالک):** هر گیتی که در آینده `pgbackrest verify` را وارد CI کند
**باید خروجی را پارس کند** — شکست بر پایهٔ `status: invalid` یا وجود `invalid checksum` — و
هرگز صرفاً به exit code تکیه نکند.

---

## ۲. TASK 2 — Restore Identity / PITR

| Pass | بُعد | Command | Expected | Actual | RPO | RTO | Status |
|---|---|---|---|---|---|---|---|
| P1 | Functional | `restore --pg1-path=…/r1` → `:55511` | md5 یکسان | rows=50000 · identity **PASS** | ۰ | **392ms** | **E3 PASS** |
| P2 | Boundary | `pg_stat_database` + null/dup scan | صفر تخطی | `checksum_failures=0` · `null=0` · `dup=0` | — | — | **E3 PASS** |
| P3 | **Failure Injection** | `DELETE province='04'` (۱۷۵۰۰ ردیف) + `kill -9` + `restore --type=time --target-action=promote` | بازگشت کامل | 37500 → **55000/55000** · identity PASS | **۰** | **602ms** | **E3 PASS** |
| P4 | Resilience | `pg_ctl start` روی primary کشته‌شده | crash recovery خودکار | بالا آمد **123ms** · rows=37500 (مطابق پس از فاجعه) | — | 123ms | **E3 PASS** |
| P5 | **Independent re-run** | PITR دوم → `:55513`، همان target | نتیجهٔ یکسان | **55000/55000** · md5 `49facd3b…` **عیناً برابر RUN1** | **۰** | **628ms** | **E3 PASS** |

**دو اجرای مستقل بحرانی ✅.** اعداد **فقط برای همین محیط** معتبرند و طبق دستور تسک
**به مقیاس ۱۰M تعمیم داده نمی‌شوند** (دیتاست ۲۹.۲MB، بدون latency شبکه/دیسک تولیدی).

---

## ۳. TASK 3 — Redis Sentinel

| Pass | بُعد | Command | Expected | Actual | RPO | RTO | Status |
|---|---|---|---|---|---|---|---|
| P1 | Functional | `info replication` · `sentinel master` | ۱ master + ۲ replica | `connected_slaves:2` · `quorum=2` · `other-sentinels=2` | — | — | **E3 PASS** |
| P2 | Boundary | ۲۰۰۰ کلید + `WAIT 2 2000` | هر دو ack | `WAIT→2` · replicaها 2000/2000 | — | — | **E3 PASS** |
| P3 | **Failure Injection** | `kill -9 <master>` (RUN 1) | promotion خودکار | `56001 → 56003` · نوشتن پذیرفته | **۰** (2001/2000) | **3252ms** | **E3 PASS** |
| P4 | Resilience | ۱۰۰۰ نوشتن + `kill -9` دوم (RUN 2) | write recovery | `56003 → 56002` | **۰** (3002/3001) | **3214ms** | **E3 PASS** |
| P5 | **Independent re-run** | پرس‌وجو از `:56012` و `:56013` | توافق | هر دو `127.0.0.1:56002` — CONSISTENT | — | — | **E3 PASS** |

### کنترل false positive (الزام صریح تسک)

```
روش غلط (snapshot در t=+2s) : role:master · probe2=''   ⇒ FALSE POSITIVE
روش درست (convergence window): همگرایی در 13169ms → role:slave · link:up · probe2='ok'
⇒ NO STALE STATE
```

نتیجهٔ غلط حذف نشد؛ هر دو ثبت شده‌اند تا ادعای split-brain نادرست تکرار نشود.

---

## ۴. TASK 4 — E4 Infrastructure Classification

| معیار E4 | موجود؟ | شاهد |
|---|---|---|
| physical multi-host | **NO** | تک‌کرنل `6.1.158+`، `hostname=e2b.local` |
| independent failure domains | **NO** | همهٔ پروسه‌ها در یک kernel/PID namespace |
| real network path | **NO** | تمام ترافیک روی `127.0.0.1` loopback |
| S3 offsite | **NO** | `repo1-path=/tmp/e4/repo` · `s3 entries=0` |
| real credentials | **NO** | `AWS_ACCESS_KEY_ID=ABSENT` · `aws cli=ABSENT` |
| production-equivalent topology | **NO** | `docker=ABSENT` · `kubectl=ABSENT` · `nproc=2` |

**۰ از ۶ ⇒ E4 NOT VERIFIED (Rule 7).**

سایر پوشش‌های Task 4: quorum loss ⇒ **FAIL-CLOSED** (هیچ failoverی با ۱ از ۳ sentinel) ·
split-brain ⇒ replica نوشتن را با `READONLY` رد کرد و **صفر نود** مدعی master شد ·
rejoin/heal ⇒ پس از بازگرداندن quorum، master جدید `:56001` در **23274ms** و **۳۰۰۳ کلید حفظ شد**.

---

## ۵. TASK 5 — E4 Gate Matrix

| بخش | محتوا |
|---|---|
| **E3 Evidence** | full/incr backup + `verify exit=0` روی مخزن سالم · AES-256-CBC در حالت سکون · restore identity (md5، RTO 392ms) · PITR ×۲ (RPO=0، RTO 602/628ms، md5 یکسان) · crash recovery 123ms · failover ×۲ (RPO=0، RTO 3252/3214ms) · fail-closed در quorum loss · بدون split-brain · heal با حفظ ۳۰۰۳ کلید · سوئیت‌های مخزن: `disaster-recovery-coverage 47/47`، `db-replica-recovery 11/11`، `redis-backup 11/11` (هرکدام ۲ اجرا) |
| **E4 Evidence** | **هیچ.** ۰ از ۶ معیار زیرساخت برقرار نیست |
| **Missing Evidence** | استقرار چندهاستی فیزیکی · دامنه‌های خرابی مستقل · مسیر شبکهٔ واقعی (نه loopback) · backup رمزنگاری‌شدهٔ offsite روی S3 · failover تحت پارتیشن شبکه · RTO/RPO در مقیاس تولید |
| **External Blocker** | **B1** S3 + credential واقعی · **B2** کلاستر چندنودی فیزیکی (docker/kubectl/aws غایب) · **B3** RTO/RPO مقیاس تولید · **B4** پارتیشن شبکهٔ واقعی روی loopback ناممکن |
| **Owner Decision** | **D1 (DR-01)** پذیرش ریسک exit-code یا الزام پارس خروجی در هر گیت آیندهٔ `verify` · **D2** تأمین S3 و credential · **D3** تأمین محیط E4 · **D4** تعریف SLO رسمی RPO/RTO برای سنجش |
| **Next Required Drill** | روی محیط چندهاستی واقعی: (۱) backup/restore با مخزن S3 رمزنگاری‌شده و credential واقعی · (۲) PITR بین‌هاستی از راه شبکه · (۳) failover Sentinel تحت پارتیشن شبکه (نه فقط `kill -9`) · (۴) اندازه‌گیری RPO/RTO در مقیاس تولید — هرکدام **حداقل ۲ اجرای مستقل** |

---

## ۶. Phase 8.2 Exit

**صادر نمی‌شود.** Exit Criteria بسته نشده است: E4 برقرار نیست، DR-01 باز است، و بلاکرهای
بیرونی B1–B4 پابرجا هستند.

```
E4 Disaster Recovery / HA = E4 NOT VERIFIED
DR-01                     = CONFIRMED / OPEN (owner decision)
Phase 8.2 Exit            = NOT VERIFIED   (صادر نشد)
Phase 8.3                 = BLOCKED
Production GO             = NOT DECLARED
```

هیچ `E4 VERIFIED` بدون شواهد production-equivalent صادر نشد · هیچ محیط قلابی ساخته نشد ·
هیچ تگی ساخته/جابه‌جا نشد · هیچ `continue-on-error`/`|| true`/skip اضافه نشد.
