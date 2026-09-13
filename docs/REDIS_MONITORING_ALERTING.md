# Redis — پایش و هشداردهی (Monitoring & Alerting) برای استقرار ملی

> فاز ۲ چت ۴ — سند عملیاتی و قابل‌اجرا (۲۰۲۶-۰۹-۰۹)
> همراه: `docs/REDIS_HA_FAILOVER.md` (دسترس‌پذیری) و `docs/REDIS_KEY_OPTIMIZATION.md` (کلیدها و نشت)
> فایل‌های اجرایی: `monitoring/alert-rules.yaml` · `monitoring/grafana-redis-dashboard.json` · `tools/redis-metrics.js`

---

## ۰. معماری پایش در یک نگاه

```text
   ┌────────────────┐        ┌──────────────────────────────────────┐
   │  Redis (مستر/  │◄───    │  ردیف اول:  redis_exporter رسمی      │
   │  کپی/نگهبان)   │  INFO  │  (متریک‌های بومی ردیس: حافظه/کلاینت/…) │
   └────────────────┘        └──────────────┬───────────────────────┘
   ┌────────────────┐        ┌──────────────┴───────────────────────┐
   │  نمونه‌های اپ   │        │        ردیف دوم: جمع‌آور پروژه        │
   │  (سرور پایش)    │        │  tools/redis-metrics.js --serve 9122 │
   │                 │        │  (لایهٔ کشِ اپ + شمار کلید + بی‌TTL‌ها) │
   └────────────────┘        └──────────────┬───────────────────────┘
                                            │  /metrics (اسکریپ هر ۱۵ ثانیه)
                                            ▼
                              ┌──────────── Prometheus ────────────┐
                              │  alert-rules.yaml  →  Alertmanager │
                              └──────────────┬─────────────────────┘
                                             ▼
                                       Grafana (داشبورد)
```

چرا دو ردیف؟ `redis_exporter` استانداردِ صنعت برای متریک‌های بومی ردیس است
(روی هر گره ردیس/نگهبان نصب می‌شود) و جمع‌آور پروژه فقط چیزهایی را می‌سنجد
که اکسپورتر نمی‌داند: زنده‌بودنِ **لایهٔ کشِ اپ**، شمار کلیدها و کلیدهای
بی‌انقضا (اتصال به ممیزی `tools/redis-audit.js`).

---

## ۱.۱ متریک‌های کلیدی

| متریک | توضیح | منبع (اکسپورتر / جمع‌آور) | آستانهٔ هشدار |
|---|---|---|---|
| `redis_up` | زنده‌بودن خود ردیس | اکسپورتر | `== 0` بیش از ۱ دقیقه ⇒ بحرانی |
| `redis_memory_used_bytes` / `redis_memory_max_bytes` | حافظهٔ مصرف نسبت به سقف | اکسپورتر | `> ۸۰٪` هشدار · `> ۹۰٪` بحرانی |
| `redis_memory_used_peak_bytes` | اوج حافظه (تشخیص رشد تدریجی/نشت) | اکسپورتر | `> ۹۰٪` سقف |
| `redis_connected_clients` | کلاینت‌های متصل | اکسپورتر | `> ۱۰۰۰` ⇒ نشت اتصال اپ |
| `redis_blocked_clients` | کلاینت‌های مسدود (دستورهای بازدارنده) | اکسپورتر | `> ۱۰` |
| `redis_instantaneous_ops_per_sec` | عملیات بر ثانیه | اکسپورتر | انحراف `> ۵۰٪` از میانگین یک‌ساعته |
| نرخ اصابت (از `redis_keyspace_hits_total`/`misses`) | کیفیت کش | اکسپورتر | `< ۸۰٪` برای ۱۵ دقیقه |
| تأخیر کپی‌سازی (`redis_master_last_io_seconds_ago` روی کپی) | عقب‌ماندگی از مستر | اکسپورتر | `> ۵ ثانیه` (در فیل‌اُوور این بازه گم می‌شود) |
| `redis_uptime_in_seconds` | آپ‌تایم | اکسپورتر | `< ۱ ساعت` ⇒ ری‌استارت ناخواسته؟ |
| `redis_sentinel_ok_sentinels` | نگهبان‌های سالم | اکسپورتر (پورت نگهبان) | `< ۲` ⇒ خطر از دست رفتن اکثریت |
| `payesh_redis_up` | زنده‌بودن لایهٔ کش از دید اپ | جمع‌آور | `== 0` بیش از ۱ دقیقه ⇒ بحرانی |
| `payesh_redis_mode{mode}` | حالت راننده (حافظه/مستقل/سنتینل) | جمع‌آور | در تولید باید `sentinel` یا `standalone` باشد، نه `memory` |
| `payesh_redis_keys_total` | شمار کلیدها | جمع‌آور | رشد پیوسته بدون فروکش ⇒ نشت |
| `payesh_redis_keys_no_ttl` | کلیدهای بی‌انقضا | جمع‌آور (`PAYESH_METRICS_KEYS=full`) | `> ۱` (جز حالت ورود که دائمیِ مجاز است) |

نکتهٔ عملیاتی: چون سیاست اخراج (`maxmemory-policy`) باید `noeviction` باشد
(کلیدهای حالتِ ما نباید بی‌صدا بپرند)، پر شدن حافظه = خطای نوشت در اپ — پس
هشدارهای حافظه را جدی بگیرید و پیش از ۹۰٪ اقدام کنید.

---

## ۱.۲ یکپارچه‌سازی با پرومتئوس

### الف) ردیف اول — `redis_exporter` (توصیهٔ رسمی)

```bash
# روی هر گره ردیس/نگهبان:
REDIS_ADDR=redis://127.0.0.1:6379 ./redis_exporter \
  --web.listen-address=:9121

# اسکریپ در پرومتئوس:
# - job_name: redis
#   static_configs: [ { targets: ['node1:9121','node2:9121','node3:9121'] } ]
# - job_name: sentinel
#   static_configs: [ { targets: ['s1:9131','s2:9131','s3:9131'] } ]
```

### ب) ردیف دوم — جمع‌آور پروژه (صفر وابستگی، همین مخزن)

`tools/redis-metrics.js` متریک‌های `payesh_*` را در قالب متنی پرومتئوس
بیرون می‌دهد — یا یک‌بار (برای کرون/بررسی دستی) یا به‌صورت سرویس:

```bash
# سرویس برای اسکریپ پرومتئوس:
node tools/redis-metrics.js --serve 9122
# اسکریپ:
# - job_name: payesh-redis-layer
#   static_configs: [ { targets: ['app1:9122','app2:9122'] } ]
```

این ابزار با همان درایور `server/redis.js` وصل می‌شود؛ پس در محیط توسعه
(درایور حافظه) هم خروجی دارد و پایش از همان‌جا تمرین می‌شود.

### ج) گزینهٔ `/metrics` درون اپ با `prom-client` (برای آینده)

اگر روزی خواستیم متریک‌ها را از درون فرایند سرور ارائه کنیم، الگوی مرجع
با `prom-client` این است (هنوز فعال نشده — نیازمند تصویب وابستگی تازه):

```js
// server/metrics.js — مرجعِ پیاده‌سازیِ آینده
const client = require('prom-client');
const redis = require('./redis');
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'payesh_node_' });

new client.Gauge({
  name: 'payesh_redis_up', help: 'Redis layer reachable (1/0)',
  async collect() {
    const p = await redis.ping();
    this.set(p && p.ok ? 1 : 0);
  }
});
// در مسیر /api/metrics (فقط با شبکهٔ داخلی/احراز): 
// res.end(await client.register.metrics())
```

دلیل توقف در حد مستند: فلسفهٔ پروژه کمینه‌کردن وابستگی‌هاست و ردیفِ
الف+ب همین حالا کامل و قابل‌اجراست؛ افزودن `prom-client` فقط وقتی لازم است
که متریک‌های فرایندی (هیپ‌ست، حلقهٔ رویداد) هم بخواهیم.

---

## ۱.۳ قوانین هشداردهی

فایل اجرایی: **`monitoring/alert-rules.yaml`** (۱۲ قانون). خلاصه:

| قانون | شرط | مدت | شدت |
|---|---|---|---|
| `RedisDown` | `redis_up == 0` | ۱ دقیقه | بحرانی |
| `RedisMemoryHigh` | `> ۸۰٪` سقف | ۵ دقیقه | هشدار |
| `RedisMemoryCritical` | `> ۹۰٪` سقف | ۲ دقیقه | بحرانی |
| `RedisReplicationLag` | `> ۵ ثانیه` (کپی) | ۲ دقیقه | هشدار |
| `RedisTooManyClients` | `> ۱۰۰۰` کلاینت | ۵ دقیقه | هشدار |
| `RedisBlockedClients` | `> ۱۰` | ۲ دقیقه | هشدار |
| `RedisOpsAnomaly` | انحراف `> ۵۰٪` از میانگین ۱س | ۱۰ دقیقه | هشدار |
| `RedisHitRateLow` | `< ۸۰٪` | ۱۵ دقیقه | هشدار |
| `RedisRestartedRecently` | آپ‌تایم `< ۱ ساعت` | — | اطلاع |
| `RedisSentinelQuorumLost` | نگهبان سالم `< ۲` | ۱ دقیقه | بحرانی |
| `PayeshRedisLayerDown` | `payesh_redis_up == 0` | ۱ دقیقه | بحرانی |
| `PayeshRedisOrphanKeys` | `payesh_redis_keys_no_ttl > 1` | ۱۰ دقیقه | هشدار |

بارگذاری در پرومتئوس:

```yaml
# prometheus.yml
rule_files:
  - /etc/prometheus/rules/alert-rules.yaml   # همین فایلِ مخزن
alerting:
  alertmanagers:
    - static_configs: [{ targets: ['alertmanager:9093'] }]
```

مسیرهای هشدار پیشنهادی: بحرانی‌ها → پیام‌رسانِ آن‌کال + تماس؛ هشدارها →
کانال عملیات؛ `RedisDown` و `PayeshRedisLayerDown` چون برابر «قطعی محصول»‌اند،
همیشه صفحه‌شکن (paging) باشند.

---

## ۱.۴ داشبورد گرافانا

فایل قابل‌ایمپورت: **`monitoring/grafana-redis-dashboard.json`**
(Dashboards → New → Import). پنل‌های اصلی — دقیقاً پنج‌تای خواسته‌شده — به
اضافهٔ وضعیت/آپ‌تایم/کلیدها:

| پنل | کوئری کلیدی |
|---|---|
| Memory Usage (سنجی٪ + سری زمانی بایت) | `redis_memory_used_bytes / redis_memory_max_bytes * 100` |
| OPS per Second | `redis_instantaneous_ops_per_second` |
| Hit Rate | `rate(hits[5m]) / (rate(hits[5m]) + rate(misses[5m])) * 100` |
| Connected Clients (+blocked) | `redis_connected_clients` |
| Replication Lag | `redis_master_last_io_seconds_ago` |

---

## ۲. ران‌بوک هشدارهای مهم

| هشدار | اقدام نخست |
|---|---|
| `RedisDown` / `PayeshRedisLayerDown` | وضعیت نگهبان‌ها (`sentinel get-master-addr-by-name`) → اگر فیل‌اُوور نشد، ران‌بوک دستیِ `REDIS_HA_FAILOVER.md` §۳. |
| `RedisMemoryHigh/Critical` | `node tools/redis-audit.js` (نشت بی‌TTL؟) → `INFO memory` → بررسی `maxmemory` و سیاست اخراج (باید `noeviction` بماند). |
| `RedisReplicationLag` | شبکه بین گره‌ها + بار نوشت روی مستر؛ در آستانهٔ فیل‌اُوور، پنجرهٔ گم‌شدن داده همین تأخیر است. |
| `RedisHitRateLow` | آیا کلیدها زودتر از مصرف منقضی می‌شوند؟ آیا حجم «یک‌بارمصرف‌ها» (نرخ/ایدِ‌امپوتِنسی) غالب شده؟ |
| `RedisTooManyClients` | هر نمونهٔ اپ فقط ۲ اتصال (کلاینت + اشتراک) باید داشته باشد — نشت اتصال در نمونه‌ای تازه‌استقرار را پیدا کنید. |
| `PayeshRedisOrphanKeys` | خروجی ممیزی را ببینید؛ کلید یتیم با اولین برخوردِ `incrWithTtl` خوددرمانی می‌شود — اگر نشد، دستی حذفش کنید. |

## ۳. چک‌لیست استقرار پایش

- [ ] نصب `redis_exporter` روی همهٔ گره‌های ردیس و نگهبان‌ها.
- [ ] اجرای `node tools/redis-metrics.js --serve 9122` کنار هر نمونهٔ اپ
      (سرویس‌منیجر/داکر) با `PAYESH_METRICS_KEYS=full` فقط در پنجره‌های ممیزی.
- [ ] افزودن دو شغلِ اسکریپ به پرومتئوس + `rule_files`.
- [ ] ایمپورت داشبورد گرافانا و اتصال به دیتاسورس.
- [ ] تست هشدار: `ALERTS` با خاموش‌کردن موقت یک نمونه (در محیط تست) دیده شود.
- [ ] مسیرهای اطلاع‌رسانی بحرانی (پیجر/پیام‌رسان) تأیید شوند.
