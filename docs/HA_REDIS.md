# HA — Redis: ۱ Master + ۲ Replica + ۳ Sentinel

> لایهٔ کشِ وضعیتِ توزیع‌شدهٔ پایش (rate-limit، idempotency، mutex، pub/sub —
> `server/cache.js`). سندِ بالادستی: `docs/RELIABILITY_DR_PLAN.md`
> (failover خودکار ≤ ۳۰ث؛ سناریوی ۴ = split-brain شبکه در RTO ۲د) و
> اجرای عملیاتی: `docs/DR_RUNBOOK.md §۲`.

## ۱) توپولوژی

```
redis-master:6379 (requirepass, AOF everysec) ─┬─ redis-replica-1 (replicaof)
                                               └─ redis-replica-2 (replicaof)
sentinel-1/2/3 :26379 (quorum=2, down-after=5000, failover-timeout=15000)
        monitor name=mymaster — همان نامِ پیش‌فرضِ server/redis.js
```

| فایل | کار |
|---|---|
| `infra/redis/docker-compose.sentinel.yml` | ۶ سرویس؛ sedِ sentinel.conf از template در بوتِ هر sentinel |
| `infra/redis/sentinel.conf.template` | placeholderهای `__MASTER_NAME__/__REDIS_PASSWORD__/…` — هیچ رازی در فایل نیست |
| `infra/redis/redis-checks.sh` | role:master/slaveها + دیدنِ هر replica توسط sentinel‌ها |

## ۲) اتصالِ برنامه — قراردادِ موجود در `server/redis.js`

کدِ سرور **از قبل** سه لایه را می‌شناسد (اولویت‌دار):

1. `REDIS_CLUSTER` (اگر استفاده می‌کنید)
2. **`REDIS_SENTINELS="host1:26379,host2:26379,host3:26379"` + `REDIS_SENTINEL_NAME=mymaster`** ← این فاز
3. **`REDIS_SENTINELS` + `REDIS_SENTINEL_NAT_MAP`** — حالت `sentinel-nat` (سخت‌سازیِ announce-ip برای کلاینتِ هاست‌سمت)
4. `REDIS_URL` standalone (dev)

رمز فقط از `REDIS_PASSWORD` یا داخل URL؛ retry/reconnectِ sentinel-aware با
`retryStrategy` **نامحدود و backoffِ سقف‌دار** پیاده شده است (قراردادِ
یکسان برایِ standalone/cluster/sentinel در `server/redis.js` — M14-C01).
توضیح: strategy هرگز `null` برنمی‌گرداند، زیرا non-number در ioredis یعنی
تسلیمِ دائمی (`status='end'`) و فقط restartِ فرایند بازیابی می‌کرد. با
backoffِ سقف‌دارِ ≤۱.۵s (sentinel) / ≤۲s (cluster)، هر قطعیِ کوتاه خودکار
بازیابی می‌شود و پس از failover (~۵–۱۵ث) برنامه **بی‌ریبوت** به masterِ نو
مهاجرت می‌کند. توجه: اگر سرور در قطعی بی‌پاسخ بمانَد، هر فرمانِ منفرد با
`commandTimeout` محدود می‌شود، ولی خودِ اتصال هرگز رها نمی‌شود.
تستِ این رفتار در `tests/m14-c01-retry-exhaustion.js` (لایهٔ قرارداد +
blackhole واقعی + negative proof با `C01_MUTATE=VULN`) و `tests/api/cache.test.js`
و مانورِ §۴ پایین ثبت می‌شود.

### ۲.۱) حالت `sentinel-nat` — سخت‌سازیِ announce-ip (کلاینتِ هاست‌سمت)

**زمینهٔ واقعی (2026-11-24):** پس از یک فیلاورِ واقعی، مستر به یکی از
replicaها نقل کرد که پورت منتشرشدهٔ هاست نداشت؛ سنتینل‌ها همچنان آدرسِ
داخلیِ `172.18.x.x:6379` را گزارش می‌کردند و کلاینتِ ioredisِ سنتینلی
(و هر کلاینتِ سمتِ هاست) به آدرسِ دست‌نرس می‌افتد. سخت‌سازی:

1. **compose:** هر سه گره پورت هاست دارند (`16379/16380/16381` —
   replica-1/2 از قبل بدون پورت بودند؛ این تعمیر اضافه شد).
2. **`REDIS_SENTINEL_NAT_MAP='172.18.0.2:6379=127.0.0.1:16379,...'`:**
   سرور خودش مستر را از سنتینل‌ها می‌پرسد (پروبِ RESP خام، ۲ث برای هر
   سنتینل)، آدرسِ گزارش‌شده را از نقشهٔ NAT ترجمه و **standalone** وصل
   می‌شود (`mode='sentinel-nat'`)؛ نگهبانِ ۵ثانیه‌ای جابه‌جاییِ مستر
   (فیلاور) را کشف و هر دو کلاینت (اصلی + Pub/Sub) را به مسترِ نو وصل
   می‌کند — بدونِ ری‌بوت.
3. **fail-closed:** نقشهٔ خراب = ردِ کل نقشه (مسیر پیش‌فرضِ sentinel حفظ
   می‌شود و خطای اتصال واقعی دیده می‌شود)؛ هیچ سنتینلی پاسخ ندهد =
   `sentinel-nat: no sentinel answered` در بوت — هیچ حدسِ مستر ممنوع.
4. بدونِ این متغیر کد دقیقاً مسیرِ قبلی را می‌رود (هیچ تغییر رفتاری).

تست: `tests/sentinel-nat.test.js` — ۱۵/۱۵ (پارسِ نقشه، سیم‌کشی،
sentinel جعلیِ RESP واقعی-TCP، fail-closed، ترجمهٔ end-to-end).

## ۳) شروعِ سریع

```bash
export REDIS_PASSWORD='<قوی>'          # یا --env-file (0600)
docker compose -f infra/redis/docker-compose.sentinel.yml up -d
bash infra/redis/redis-checks.sh       # همه PASS ⇒ آماده
# برنامه روی همان میزبان:
REDIS_SENTINELS=127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381 \
REDIS_SENTINEL_NAME=mymaster REDIS_PASSWORD=... server/index.js
```

## ۴) Failover-Drill (مانورِ فصلی + سنجهٔ ۲/۴)

```bash
# ۱) خودکار (سکوتِ ۵ ثانیه‌ایِ master ⇒ ارتقایِ sentinel):
docker inspect -f '{{.State.Pid}}' "$(docker compose -f infra/redis/docker-compose.sentinel.yml ps -q redis-master)" | xargs -r kill -STOP   # یا stop
# ۲) RTO سنجش: پس از ≤۱د باید آدرسِ نو بیاید:
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster   # (با -a REDIS_PASSWORD)
# ۳) تحریکِ دستی (maintenance window):
tools/failover-redis.sh --dry-run && tools/failover-redis.sh
# ۴) بازگشتِ masterِ کهنه به‌عنوان replica (SENTINEL failover دوباره یا
#    `replicaof <new-master> 6379` دستی) — هرگز دو master نگه ندار.
```

## ۵) RPO/RTO و نکاتِ داده

- `appendfsync everysec` ⇒ RPOِ بدترین ≈ ۱ ثانیه؛ کشِ پایش stateless-core
  است (منابعِ حیاتی در PostgreSQL) — خالی‌شدنِ کلِ خوشه = warm-upِ مجددِ
  کش/نرخ‌ها، نه از‌دست‌رفتنِ دادهٔ کاربری (اصلِ Stateless Core، SKILLS §۱).
- `maxmemory-policy noeviction`: صف/قفل‌ها بی‌صدا دور ریخته نمی‌شوند؛
  اگر پر شد FAIL می‌شود و مانیتورینگِ `OOM` alert را می‌زند — ظرفیت از
  `docs/CAPACITY.md` (§Redis) بازبینی شود.
- idempotency/قفل‌ها TTL دارند؛ در پنجرهٔ قطعیِ >۳۰ث، fail-closedِ
  سرور (نه کش) مرجع است (رجوع: `server/cache.js`).

## ۶) پس از این فاز

- TLS به sentinel/masterها (شبکهٔ داخلیِ جدا فعلاً کافی است — مستندِ
  `WAF_DDOS_SETUP.md` مرزِ edge را نگه می‌دارد).
- ACL کاربریِ جدا برایِ master/replica/sentinel (جایِ requirepassِ مشترک).
- خودکارسازیِ مانور با cronِ `redis-checks.sh` + alarm.
