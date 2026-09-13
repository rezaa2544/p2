# 🧯 DR Runbook — سناریوهایِ عملیاتیِ بازیابی و failover

> بازویِ اجراییِ `docs/RELIABILITY_DR_PLAN.md` (اهدافِ مصوب: SLA ۹۹٫۹۵٪ ·
> **RTO ≤ ۱۵ دقیقه** · **RPO ≤ ۵ دقیقه** · failover خودکار ≤ ۳۰ ثانیه).
> ابزارها همه در این ریپو: `infra/postgres/docker-compose.ha.yml`،
> `infra/redis/docker-compose.sentinel.yml`، `tools/failover-postgres.sh`،
> `tools/failover-redis.sh`، `tools/pitr-restore.sh`، `tools/pitr-verify.sh`،
> `infra/postgres/post-checks.sh`، `infra/redis/redis-checks.sh`.
> هر سناریو: **نشانه‌ها → تشخیص → اقدام → تأیید → بازگشت → ثبتِ drill**.
> **کارت‌های سریع on-call:** نسخهٔ فشردهٔ A4 سناریوهای این سند در `docs/RUNBOOK_CARDS/` است (احیای ردیس، فیلاور پستگرس، بازیابی نقطه‌ای، بازیابی پشتیبان).
> خروجیِ همهٔ چک‌ها fail-closed است؛ FAIL بدونِ «تأییدِ سبز» یعنی بحران تمام نشده.

## ۰) جدولِ RPO/RTO (مصوبِ RELIABILITY_DR_PLAN — این‌ها سقف‌اند، نه هدفِ میانگین)

| # | سناریو | RPO (اتلاف داده) | RTO (زمان بازگشت) | مسیرِ اقدام |
|---|---|---|---|---|
| ۱ | خرابی Primary PostgreSQL | ≤ ۵ دقیقه (پنجرهٔ واقعی: ثانیه‌ها با sync archive) | ≈ ۴ دقیقه (promoteِ دستیِ تأییدشده) | §۱ |
| ۲ | خرابی Redis Master | ≈ ۱ ثانیه (AOF everysec) — کشِ stateless: ۰ ریسک داده | < ۳۰ ثانیه خودکار / ≤ ۲ دقیقه دستی | §۲ |
| ۳ | خرابی Data Center (منطقه‌ای) | ≤ ۵ دقیقه | ≈ ۸ دقیقه تا failover منطقه + ≤ ۱۵ دقیقه کلِ بازگشت | §۳ |
| ۴ | فساد/تخریبِ داده (بدافزار، حذفِ عمدی، مهاجرتِ خراب) | تا آخرین archive (معمولاً < ۱ دقیقه) | ≈ ۱۴ دقیقه (PITRِ چک‌شده در محیط جدای) | §۴ |

## ۱) سناریو ۱ — خرابی Primary PostgreSQL

**نشانه‌ها:** سلامتِ `/api/health` قرمز (503 کش/دیتابیس)، لاگِ `server/db.js`
با `connection refused`/`read-only`، `post-checks.sh` خطِ `walsender` قرمز.

**تشخیص (۶۰ ثانیه):**
```bash
pg_isready -h <PRIMARY> -p 5432          # سه بار با فاصله — قطعیِ تأییدشده؟
docker compose -f infra/postgres/docker-compose.ha.yml ps pg-primary
```
اگر primary زنده است ولی برنامه وصل نمی‌شود ⇒ شبکه/PgBouncer، **نه failover**.

**اقدام (≤ ۴ دقیقه):**
```bash
tools/failover-postgres.sh --dry-run     # گاردها: split-brain، lag، مرگِ primary
tools/failover-postgres.sh               # SELECT pg_promote(wait=>true)
```
**تأیید:** `psql "host=<STANDBY> port=<P> dbname=payesh" -c 'SELECT pg_is_in_recovery()'` ⇒ `f`؛
`post-checks.sh` (پیکربندیِ مجددِ سرویس‌ها بعد از upِ تازه) سبز؛ `/api/health` سبز؛
`tools/check-authz.js` و سوئیتِ API نیفتد (تطبیقِ نوشتن).

**بازگشت منظم:** primaryِ کهنه **fence** شود (متوقف تا هرگز برنگردد) →
`STANDBY_BOOTSTRAP=repo` standbyِ تازه را از archive بازسازی کن → `DATABASE_URL`
رویِ endpointِ برنامه/سیکرت تازه → آینه‌سازیِ مجددِ slotها.
**ثبتِ drill:** خطِ جدید در §۶ (RTO اندازه‌گرفته‌شده، گاردِ ردشده، امضا).

## ۲) سناریو ۲ — خرابی Redis Master

**نشانه‌ها:** لاگِ re-connectهایِ پشت‌سرهم؛ در cutoverِ دستی/مانور:
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster   # آدرس عوض شده؟
bash infra/redis/redis-checks.sh                               # نقش‌ها + دیدنِ replicas
```

**تشخیص:** Sentinel خودش پس از down-after=5000ms و quorum=2 خودکار promote
می‌کند (RTO ≤ ۳۰ث). اگر خودکار انجام **نشد** (معمولاً از‌دست‌رفتنِ quorum ⇒
بحرانِ بزرگتر §۳):
```bash
tools/failover-redis.sh --dry-run   # تاییدِ مرگ masterِ ثبتی
tools/failover-redis.sh            # SENTINEL FAILOVER + poll تا ۴۵ث
```

**تأیید:** `NEW_MASTER=` چاپ‌شده ⇒ `redis-checks.sh` سبز؛ برنامه (لایهٔ
sentinel در `server/redis.js`) بدونِ ری‌بوت مهاجرت می‌کند؛ rate-limitها/
idempotency صف‌ها warm شوند (چند دقیقه اول ترافیک عادی است).

**بازگشت:** masterِ کهنه را فقط به‌عنوان replica برگردان (`replicaof`)؛
هرگز دو master زنده نماند. **RPO:** کش/قفلِ stateless ⇒ عملاً صفر؛ صف
pub/subِ از‌دست‌رفته با outbox (Wave-8) جبران می‌شود — اگر outbox قرمز شد،
`docs/ASYNC_ARCHITECTURE.md`.

## ۳) سناریو ۳ — خرابی Data Center (فاجعهٔ منطقه‌ای؛ طراحیِ مستندِ دوم‌منطقه‌ای)

مطابق `RELIABILITY_DR_PLAN` §۳ (تهران⇄تبریز): منطقهٔ دوم نسخهٔ آینه‌ایِ
**همین فایل‌ها** را با سه اختلاف اجرا می‌کند:
1. `PB_REPO_S3_ENDPOINT` به **replicationِ bucket** (S3 CRR/MinIO site-replication) —
   archive در هر دو منطقه خوانا؛ standby منطقهٔ دوم با `STANDBY_BOOTSTRAP=repo`
   از فضای مشترک بالا می‌آید (فاصلهٔ WAL ≤ پنجرهٔ CRR ≈ ۵ دقیقه ⇒ همان RPO).
2. DNS/VIP فقط در سطحِ edge جابه‌جا می‌شود (nginx `upstream payesh` در
   `nginx/nginx.conf` — لایهٔ WAF/edge از ویو ۱۲).
3. Secretها از vault منطقه‌ای (نه env-file) تزریق می‌شوند.

**اقدام (RTO ≤ ۸ دقیقه تا سرویس + ≤ ۱۵ دقیقه کل):**
```bash
# منطقهٔ دوم:
docker compose -f infra/postgres/docker-compose.ha.yml --env-file .env.ha.secondary up -d
tools/failover-postgres.sh                    # standby منطقه → primary
tools/failover-redis.sh                        # sentinel‌های منطقهٔ دوم master دارند
bash infra/postgres/post-checks.sh && bash infra/redis/redis-checks.sh
# edge: سوییچِ DNS/VIP + تأییدِ /api/health از لبه
```
**تأیید:** سلامتِ API از منطقهٔ دوم؛ `pg_stat_archiver` رویِ new primary سبز
(بازگشتِ archive حیاتی است — وگرنه PITRِ آینده می‌میرد)؛ سناریوهایِ
sync/آفلاینِ کلاینت (tombstone/cursor) ادامه‌دار باشند (Wave-4/7).
**ممنوعیات:** بوت‌کردنِ منطقهٔ اول با standbyِ گمشده (split-brain) — تا
fence شدنِ رسمی، primaryِ منطقهٔ اول **برگردانده نمی‌شود**.

## ۴) سناریو ۴ — فسادِ داده / تخریبِ عمدی (PITRِ نقطه‌ای)

**نشانه‌ها:** آمارِ غیرمنطقی (پاک‌شدنِ گروهی نمره‌ها)، لاگِ migration/بکاپِ
سازمان‌یافته، گزارشِ کلاینتِ آفلاینِ هم‌سو با «حذفِ انبوه».

**اقدام:**
```bash
# ۱) فوریتِ کشفِ نقطهٔ قبلِ فساد:
tools/pitr-restore.sh --time "2026-09-10 08:55:00+03:30"   # محیطِ جدایِ سنجش
# ۲) تأییدِ خودکار:
PGHOST=<run>/run PGPORT=54329 PGDATABASE=payesh tools/pitr-verify.sh \
  --host-dir <run>/run --port 54329 --expect-before '2026-09-10 08:55:00'
# ۳) تصمیمِ بازگشت: یا promoteِ محیطِ سبز و سوییچِ DATABASE_URL (برشِ کامل،
#    از‌دست‌رفتنِ نوشتن‌هایِ پس از هدف) یا استخراجِ delta و replayِ انتخابیِ
#    رکوردها (sync/merge با OCC — base_version خطِ دفاعِ دوم، P0-18).
```
**RTO ≈ ۱۴ دقیقه** (بستهٔ اندازهٔ بکاپ)؛ **RPO** = پنجرهٔ بینِ فاجعه تا آخرین
archive. محیطِ PITR ایزوله است (`fsync=off`، socket لوکال، پورتِ غیراستاندارد)
و تا promote شدنِ صریح، خطِ تولید را لمس نمی‌کند.

## ۵) گیت‌هایِ مشترکِ همهٔ سناریوها (قبلِ اعلامِ «بحران تمام»)

```bash
node tests/smoke.js >/dev/null 2>&1 && echo PASS || echo FAIL   # رفتارِ برنامه سالم (۵۴۷/۵۴۷)
node tools/check-authz.js >/dev/null 2>&1 && echo PASS || echo FAIL
node tests/secret-scan.js | grep 11/11                          # نشتی حینِ دست‌کاریِ env؟
curl -sf http://127.0.0.1:3000/api/health | grep '"ok":true'    # یا endpointِ منطقه
bash infra/postgres/post-checks.sh && bash infra/redis/redis-checks.sh
```

## ۶) جدولِ drill-log (پر شود — ماهانه خودکار؛ فصلیِ کامل)

| تاریخ | سناریو | RTO واقعی | RPO واقعی | نتیجه/اقدامِ اصلاحی | امضا |
|---|---|---|---|---|---|
| _(نمونهٔ قالب)_ 2026-10-05 | §۱ stop-primary | ۳د۴۰ث | ۴ث | سبز؛ افزودنِ alertِ pg_stat_archiver | ناظر ارشد |
| 2026-09-11 | WAL disk-full (§۸) — PG17، `pg_wal` روی tmpfsِ ۱۰۰MB | **۳۰٫۲ث** | **۰** | سبز؛ PANIC واقعی ثبت شد. اقدامِ اصلاحیِ باز: **آلارمِ بیرونیِ دیسکِ WAL** (PG در ۸۰٪ ساکت است) + افزودنِ گامِ «آزادسازیِ فضا پیش از restart» به رویه. شاهد: `docs/WAVE19_WAL_DRILL_REPORT.md` | Arena |
| 2026-09-13 | WAL disk-full (§۸) — بازاجرای کامل روی PG ‏17.10 (باینری‌های userspace؛ سندباکس با sudo/tmpfs) | **۳۰٫۲ث** | **۰** | سبز **23/23** (پیش از این 20/21)؛ PANIC واقعی + replica با `pg_basebackup` (catch-up≈0.1s، ‏6000=6000). شاهد: `docs/daily-reports/2026-09-13.md` §چت۴ | چت ۴ |
| 2026-09-13 | disk-full سطحِ اپ + kill-api + pg-down (ابزار chaos؛ store/audit/otp روی tmpfsِ ۱۴MB) | n/a (کرشی رخ نداد) | **۰** | سبز: جهش در دیسکِ پُر → ‏200 (`otp.json.tmp` صفربایتی = ENOSPC مستقیم)، کل timeline ‏200، صفر 500؛ پس از آزادسازی، ‏`otp.json` بازنویسی و store سالم. kill-api: detect≤5s/recover ‏15s · pg-down: detect≈173ms/recover≈507ms. شاهد: همان گزارش | چت ۴ |

> **قیدِ صداقتِ ردیفِ بالا:** RPO=0 با «شمارِ رکوردها» تأیید شد نه checksumِ
> سطر‌به‌سطر؛ PITR از آرشیو و سناریوی منطقه‌ای در این مانور آزمایش **نشد**؛
> و `wal_segment_size` برایِ شتاب‌دهیِ مانور ۱MB بود، پس عددِ مطلقِ RTO
> مستقیماً به تولید تعمیم داده نشود. جزئیات در گزارشِ مانور §۵.

## ۷) مالکیت و طرحِ روتیشنِ تماس

- On-call اول: Arena 2 (Security/Infra) — ثانیه: Arena 1 (Database/Core)
- اعلامِ وضعیتِ بحران: `docs/COMPLETE_REPORT_FOR_CLOUD.md` الگو را دارد؛
  به‌روزرسانیِ HANDOFF در انتهای هر سناریو الزامی است (`docs:` کامیت با
  `dr: scenario=<n> date=...` در سوژه).

---

## ۸) سناریو ۸ — پر شدنِ دیسکِ WAL (ENOSPC روی `pg_wal`)

> مانورِ واقعیِ این سناریو در ۲۰۲۶-۰۹-۱۱ اجرا شد: `docs/WAVE19_WAL_DRILL_REPORT.md`
> (PG17، `pg_wal` روی tmpfsِ ۱۰۰MB، PANICِ واقعی، RTO=۳۰٫۲ث، RPO=۰).

**چگونه خودش را نشان می‌دهد** — سه چهره دارد و هر سه در مانور دیده شد:

| چهره | پیام | حالتِ سرویس |
|---|---|---|
| الف | `PANIC: could not write to file "pg_wal/xlogtemp.NNNN": No space left on device` | خاموشیِ فوریِ کلاستر |
| ب | همان پیام با سطحِ `FATAL` + `shutting down due to startup process failure` | بالا نمی‌آید |
| پ | همان پیام با سطحِ `ERROR`، هر ~۱ ثانیه تکرار | **زنده ولی بی‌فایده** — `pg_isready` سبز می‌دهد ولی هیچ نوشتنی پیش نمی‌رود |

**⚠ چهرهٔ «پ» خطرناک‌ترین است** چون آلارمِ «PG بالاست» آن را رد می‌کند.

**ترتیبِ اجباریِ بازیابی — گامِ ۱ قابلِ جهش نیست:**

```bash
# ۱) اول فضا آزاد کن. restart با دیسکِ پُر «ناموفق است»، چون خودِ crash
#    recovery برایِ نوشتنِ xlogtemp به فضا نیاز دارد (در مانور تأیید شد).
df -h /var/lib/postgresql/17/main/pg_wal          # تأییدِ پُری
sudo -u postgres psql -c 'select pg_walfile_name(pg_current_wal_lsn())'  # اگر بالا می‌آید
#    - اگر آرشیو سالم است: مقصدِ archive_command را درست/باز کن
#    - وگرنه: سگمنت‌های «قدیمیِ» غیرلازم را حذف کن (هرگز سگمنتِ جاری/آینده)

# ۲) حالا restart
sudo -u postgres /usr/lib/postgresql/17/bin/pg_ctl \
  -D /var/lib/postgresql/17/main -w start

# ۳) راستی‌آزمایی
sudo -u postgres psql -c 'select pg_is_in_recovery(), pg_current_wal_lsn()'
sudo -u postgres psql -c 'checkpointer'   # نبودِ ERROR در لاگِ تازه
```

**پیشگیری (قلمِ باز — از مانور بیرون آمد):**
- آلارمِ **بیرونیِ** مصرفِ دیسکِ `pg_wal` روی آستانهٔ ۷۰٪ (هشدار) و ۸۵٪ (بحرانی).
  PostgreSQL خودش در ۸۰٪ **هیچ هشداری نمی‌دهد**؛ نخستین نشانهٔ درون‌سیستمی،
  PANIC است.
- ظرفیتِ `pg_wal` ≥ `max_wal_size × 3` + فضایِ آرشیوِ معوق.
- رصدِ `pg_stat_archiver.failed_count` — آرشیوِ معوق، دیسکِ WAL را پُر می‌کند.

---
