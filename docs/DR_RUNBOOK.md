# 🧯 DR Runbook — سناریوهایِ عملیاتیِ بازیابی و failover

> بازویِ اجراییِ `docs/RELIABILITY_DR_PLAN.md` (اهدافِ مصوب: SLA ۹۹٫۹۵٪ ·
> **RTO ≤ ۱۵ دقیقه** · **RPO ≤ ۵ دقیقه** · failover خودکار ≤ ۳۰ ثانیه).
> ابزارها همه در این ریپو: `infra/postgres/docker-compose.ha.yml`،
> `infra/redis/docker-compose.sentinel.yml`، `tools/failover-postgres.sh`،
> `tools/failover-redis.sh`، `tools/pitr-restore.sh`، `tools/pitr-verify.sh`،
> `infra/postgres/post-checks.sh`، `infra/redis/redis-checks.sh`.
> هر سناریو: **نشانه‌ها → تشخیص → اقدام → تأیید → بازگشت → ثبتِ drill**.
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

## ۷) مالکیت و طرحِ روتیشنِ تماس

- On-call اول: Arena 2 (Security/Infra) — ثانیه: Arena 1 (Database/Core)
- اعلامِ وضعیتِ بحران: `docs/COMPLETE_REPORT_FOR_CLOUD.md` الگو را دارد؛
  به‌روزرسانیِ HANDOFF در انتهای هر سناریو الزامی است (`docs:` کامیت با
  `dr: scenario=<n> date=...` در سوژه).
