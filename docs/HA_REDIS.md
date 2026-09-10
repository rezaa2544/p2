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
3. `REDIS_URL` standalone (dev)

رمز فقط از `REDIS_PASSWORD` یا داخل URL؛ retry/reconnectِ sentinel-aware با
`retryStrategy` محدود (۵ تلاش) پیاده شده است — پس پس از failover،
برنامه **بی‌ریبوت** به masterِ نو مهاجرت می‌کند. تستِ این رفتار در
`tests/api/cache.test.js` و مانورِ §۴ پایین ثبت می‌شود.

## ۳) شروعِ سریع

```bash
export REDIS_PASSWORD='<قوی>'          # یا --env-file (0600)
docker compose -f infra/redis/docker-compose.sentinel.yml up -d
bash infra/redis/redis-checks.sh       # همه PASS ⇒ آماده
# برنامه روی همان میزبان:
REDIS_SENTINELS=127.0.0.1:26379,127.0.0.1:26380,127.0.0.1:26381 \
REDIS_SENTINEL_NAME=mymaster REDIS_PASSWORD=... server/index.js
```

## ۴) Failover-Drill (مانورِ فصلی + سناریوی ۲/۴)

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
