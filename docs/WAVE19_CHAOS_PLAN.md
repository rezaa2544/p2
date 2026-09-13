# Wave 19 — طرح تست آشوب و شکست (Chaos Testing)

_چت ۳ — ۲۰/۰۶/۱۴۵ (2026-09-09) — ابزارِ همراه: `tools/chaos-test.sh` · سوئیتِ k6 (فاز ۵): `tests/performance/suites/chaos-redis-test.js` · مبنا: Graceful Shutdown و پروب‌های Wave 15_

---

## ۱. روش‌شناسی (Chaos Engineering)

برایِ هر سناریو: (۱) **وضعیتِ پایدار** تعریف می‌شود (readiness=200، p95 خطِ پایه)؛ (۲) **فرضیهٔ تاب‌آوری** نوشته می‌شود (از روی معماری — نه حدس)؛ (۳) خرابی **تزریق** و ترافیکِ هم‌زمان (k6) ادامه دارد؛ (۴) **اندازه‌گیری** روی تایم‌لاینِ پروب‌ها (`timeline.csv` در `tests/chaos-output/`)؛ (۵) **بازگشت** و تأییدِ سلامتِ پایانی.

**مبانیِ معماری که فرضیه‌ها از آن‌ها می‌آیند:**

| لایه | منبعِ حقیقت | رفتارِ شکست (تأییدشده در کد) |
|---|---|---|
| store (payesh.json) | **اصلی** — offline-first | نوشتِ atomik (tmp+rename ⇒ هرگز خراب نمی‌شود) + persist هر 2s + GC |
| PostgreSQL | آینهٔ نوشت‌ها (mirror) | sync: شکست mirror ⇒ audit `sync_mirror_failed` + **کلاینت بی‌خبر (200)**؛ `scheduleReconnect` خودکار |
| Redis | کش + stateِ گذرا | P0-13: در تولید الزامی (استارت بدونِ آن = fail-fast)؛ خطاها: rate-limit **fail-open**، خوانش‌ها **فال‌بک به حافظه**، OTP state در حافظه می‌ماند |
| API instance | — | Wave 15: SIGTERM ⇒ drain + persist ⇒ exit 0؛ readiness در حینِ drain ⇒ 503 |

---

## ۲. پنج سناریویِ آشوب

### S1 — کشتنِ یک نمونهٔ API (`kill-api`, SIGKILL)

**تزریق:** `kill -9 $API_PID` (بدونِ drain — crash consistency).

| فرضیه | چرا (مکانیزم) |
|---|---|
| درخواست‌هایِ در‌حالت‌پروازِ همان نمونه abort می‌شوند؛ کلاینت‌ها retry می‌کنند | TCP reset؛ صفِ همگام‌سازیِ offline-first ایدمپوتان است (`__processed_uids`) |
| نمونه‌هایِ دیگر دست‌نخورده‌اند (liveness=200) | state هر نمونه مستقل است |
| **خوابِ store خراب نمی‌شود** | نوشتِ atomik (tmp+rename) — یا کهنهٔ کامل، یا تازهٔ کامل |
| **با PG زنده: از دست رفتنِ داده = صفر** | هر عملِ ack‌شده **پیش از پاسخ** mirror شده (`persistOpsBatch` قبلِ `sendJson 200` در sync) |
| بدترین حالت (PG هم قطع): فقط پنجرهٔ flush‌نشدهٔ ≤2s | persistStore هر 2s؛ عمل‌هایِ non-ack خودِ کلاینت دوباره می‌فرستد |

**تفاوتِ کلیدی با SIGTERM (Wave 15):** SIGTERM ⇒ drain + persist ⇒ **صفر** از دست رفتن؛ SIGKILL = تستِ «crash consistency». ارکستراتور همیشه SIGTERM ترجیح می‌دهد؛ SIGKILL فقط برایِ اثباتِ crash-safe بودن است.

**اندازه‌گیری:** تایم‌لاینِ پروب‌ها — probe روی نمونهٔ کشته ⇒ `ERR`/refused؛ `after` ⇒ نمونهٔ restart‌شده (توسطِ k8s/systemd) readiness=200.

### S2 — قطعِ Redis (`redis-down`)

**تزریق:** `redis-cli SHUTDOWN NOSAVE` (یا قطعِ پورت/کلاستر) در حینِ ترافیکِ k6 (`chaos-redis-test.js`: 30 VU، 45s، thresholds: **هیچ 500** + p95<400 + صحتِ نشست‌ها).

| فرضیه | چرا (مکانیزم) |
|---|---|
| readiness ⇒ **503** در کمتر از یک دورهٔ پروب (Wave 15) | `redis.ping` می‌شکند ⇒ `not_ready`؛ LB نمونه را از ترافیک می‌کَنَد |
| liveness ⇒ **200** تا مرگِ نمونه | فرایند زنده است — عمداً وابستگی نمی‌بیند (نه طوفانِ ری‌استارت) |
| خوانش‌ها (bootstrap/...) ⇒ **200، بدونِ 500** | L1 ≤60s جواب می‌دهد؛ L2 ⇒ `redis.get` فال‌بکِ حافظه (try/catch در redis.js)؛ miss ⇒ rebuild از store (single-flight) |
| rate-limit ⇒ **fail-open** (allowed:true) | خطایِ Redis = سکوت/اجازه — افتِ Redis به خود-DDoS تبدیل نمی‌شود؛ لبهٔ سخت (nginx/CF) کنترلِ نرخِ سخت را نگه می‌دارد |
| OTP/لاگین ⇒ جریان می‌ماند | state در حافظه می‌ماند + flashِ فایل retry می‌کند؛ کدهایِ صادرشدهٔ حینِ قطع گم می‌شوند ⇒ کاربر دوباره request می‌کند (UX؛ **بدونِ PII loss**) |
| **از دست رفتنِ داده = صفر** | store منبعِ حقیقت است؛ Redis فقط کش + stateِ گذرا |

**محدودیتِ شناخته‌شده (مستند):** بعد از قطعِ طولانی، `retryStrategy`ِ ioredis تمام شده (3 تلاش) و client بسته می‌ماند ⇒ برایِ **بازپس‌گرفتنِ Redis، restart فرایند لازم است** (k8s: rolling restart پس از سالم‌شدنِ Redis). پیشنهادِ بهبود (خارجِ این موج): retryStrategy پایدار + readiness-driven restart.

### S3 — قطعِ PostgreSQL (`pg-down`)

**تزریق:** `pg_ctl stop -m immediate` (یا cloud pause) در حینِ ترافیک.

| فرضیه | چرا (مکانیزم) |
|---|---|
| **خوانش‌ها دست‌نخورده** | همهٔ خوانش‌ها (bootstrap/list/...) از **store** می‌آیند — PG آینهٔ نوشت است |
| sync writes ⇒ **200 + audit `sync_mirror_failed`** | mirror در try/catch؛ کلاینت بی‌خبر؛ store (اصل) نشسته |
| DELETE از REST ⇒ **500 + audit** (فقط این مسیر) | `db.transaction` throw می‌کند؛ tombstone در store می‌ماند؛ retryِ کلاینت ایدمپوتان است |
| readiness ⇒ **503** (حالتِ محافظه‌کارانه) | `db.ping` می‌شکند؛ در پیکربندیِ ملی PG برایِ یکپارچگیِ رابطه‌ای لازم فرض می‌شود — نمونه از چرخهٔ ترافیک خارج می‌شود (trade-off: ظرفیت در برابرِ یکپارچگی) |
| **از دست رفتنِ داده = صفر** | store سالم؛ mirror عقب می‌ماند و با `scheduleReconnect` ادامه می‌یابد |

**اندازه‌گیری:** `timeline.csv` — readiness 503 حینِ fault؛ صفرِ 500 در endpointهایِ سلامت؛ پس از `pg_ctl start` ⇒ readiness 200 بدونِ restart.

### S4 — کندی شبکه (`net-latency`)

**تزریق:** `tc qdisc add dev $IFACE root netem delay 500ms 100ms` (client→API) یا toxiproxy (API→Redis/PG)؛ در سمتِ بار هم k6 `ramping-vus` با `sleep`.

| فرضیه | چرا (مکانیزم) |
|---|---|
| p95 به‌اندازهٔ تأخیرِ تزریق‌شده بدتر می‌شود (خطی) | تأخیرِ additive |
| سقفِ سخت: `requestTimeout` 65s (S-73-6) | سوکتِ stalled تا ابد نگه نمی‌ماند (سطحِ slowloris) |
| Redis commands bounded | `maxRetriesPerRequest: 2` |
| **بدونِ از دست رفتنِ داده** | صفِ syncِ کلاینت offline-first؛ ایدمپوتانسیِ uid؛ تأخیر = UX |

**SLO:** p95 < خطِ پایه + (delay × 1.5) و error rate < 0.1٪ در کلِ بازه.

### S5 — پر شدنِ دیسک (`disk-full`)

**تزریق:** `fallocate -l $DISK_FILL_GB` (پیش‌فرض **5GB سقفِ ایمنی**) روی دایرکتوریِ داده — در بازگشت حذف می‌شود.

| فرضیه | چرا (مکانیزم) |
|---|---|
| **سرور کرش نمی‌کند، 500 نمی‌دهد** | `persistStore` در try/catch («never crash»); ENOSPC ⇒ dirty در حافظه می‌ماند و هر 2s retry |
| audit خودمحدود است | rotation 10MB/1000 رویداد (R96) |
| بکاپِ خراب نوشته **نمی‌شود** | backupNow شکست ⇒ آخرین بکاپِ سالم می‌ماند + audit |
| بدترین حالت (disk-full + crash هم‌زمان): پنجرهٔ flush‌نشدهٔ ≤2s | همان edge سناریویِ S1 با PG قطع |
| GC نگهبانِ رشد است | `store_gc` (uid 30 روز، jti 8 ساعت) در هر persist |

**برنامه‌ریزیِ مقیاسِ ملی:** store ≈ 3-5GB + **10 بکاپ** نگه‌داشته + audit ⇒ دیسکِ دادهٔ **حداقل 50GB** + هشدار 80٪/بحرانی 90٪.

---

## ۳. اجرا — `tools/chaos-test.sh`

```bash
# ۱) DRY_RUN (پیش‌فرض — ایمن، هیچ کارِ ویرانگری نمی‌کند):
tools/chaos-test.sh all --out-dir tests/chaos-output

# ۲) اجرایِ زنده (فقط روی محیطِ تست — هرگز production):
tools/chaos-test.sh all --live \
  --base-url http://127.0.0.1:3000 \
  --api-pid 4123 \
  --redis-host 127.0.0.1 --redis-port 6379 \
  --pg-host 127.0.0.1 --pg-data /var/lib/postgresql/data \
  --duration 60

# ترافیکِ هم‌زمان (توصیه‌شده برایِ redis-down):
k6 run tests/performance/suites/chaos-redis-test.js --env BASE_URL=http://127.0.0.1:3000 &
```

**خروجیِ هر سناریو** (در `tests/chaos-output/` — gitignore شده):
- `<name>-before.json` / `<name>-after.json` — سه پروب (liveness/readiness/health) قبل/بعد
- `<name>-timeline.csv` — هر 5 ثانیه: ts,endpoint,status,ms
- `<name>-summary.txt` — **PASS/FAIL خودکار** روی فرضیه‌ها (grep بر timeline)

**چک‌لیستِ پیش‌ازِ اجرا:** backupِ store تازه (POST /api/admin/backup) · محیطِ TEST (نه production) · مانیتورِ heap/CPU/PG-pool/Redis-memory · دسترسیِ بازگشت (restart redis/pg/نمونه) · سقفِ disk-full بررسی‌شده.

## ۴. معیارهایِ پذیرش (خلاصه)

| سناریو | پذیرش = |
|---|---|
| kill-api | هیچ crash/خوابِ خرابی؛ ack‌شده‌ها در mirror (PG)؛ نمونهٔ restart readiness=200 |
| redis-down | readiness 503 (≤1 probe)؛ liveness 200؛ **صفر 500**؛ صفر data loss؛ (restart برایِ بازپس‌گیری مستند) |
| pg-down | خوانش‌ها 200؛ sync 200+audit؛ صفر data loss؛ readiness 503؛ بازگشت بدونِ restart |
| net-latency | p95 < base + 1.5×delay؛ error < 0.1٪؛ صفر loss |
| disk-full | صفر crash/500 در health؛ صفر بکاپِ خراب؛ alert‌هایِ دیسک فعال |

## ۵. وضعیتِ «در انتظار» (نکتهٔ صادقانه)

اجرایِ واقعیِ آشوب نیازمندِ **محیطِ زندهٔ چند-نمونه** است: API چند-نود + Redis + PostgreSQL + دسترسیِ root برایِ `tc`/`fallocate` + k6. در این ساندباکس: **طراحی + ابزار + اعتبارسنجیِ خودکار** (`tests/wave19-chaos.js`) کامل شد؛ اجراهایِ LIVE «در انتظارِ زیرساخت» ثبت شدند (DRY_RUNِ همهٔ سناریوها در CI قابلِ اجراست).

## ۶. تست‌هایِ این موج — `tests/wave19-chaos.js`

بررسیِ وجود/اعتبارِ اسکریپت (syntax، help، DRY_RUNِ هر 5 سناریو + خروجی‌ها)، پوششِ 5 سناریویِ الزامی در سند، سازگاریِ فرضیه‌ها با قوانینِ پروژه (atomik store، fail-open rate-limit، 503ِ readiness، صفر data loss، crash-free disk-full)، gitignore شدنِ `tests/chaos-output/` و اتصالِ سند به سوئیتِ k6ِ فاز ۵.
## S6 ? ?????? ???? (AZ Partition)

**??:** Network partition between availability zones using tc + netem + toxiproxy.
| ?? | ?? |
|---|---|
| AZ partition | tc qdisc add dev IFACE root netem loss 100% between API and Redis/PG |
| Readiness | **503** (Wave 15) |
| Liveness | **200** |
| Failover | Auto-promote standby PG (RPO < 1s, RTO < 30s) |
| Data loss | **No** (sync mirror + WAL archiving) |
| Reconnect | scheduleReconnect + readiness-driven restart |

**??:** AZ partition detection أ¢â€ â€™ promote standby أ¢â€ â€™ readiness 200 أ¢â€ â€™ data integrity check.

## S7 ? WAL-disk-full (PANIC + Recovery + RTO)

**??:** Fill WAL disk with fallocate -l 5G to trigger PostgreSQL PANIC, then measure recovery time.
| ?? | ?? |
|---|---|
| WAL disk full | fallocate -l DISK_FILL_GB /var/lib/postgresql/data/pg_wal |
| PostgreSQL state | **PANIC** shutdown |
| Recovery mode | Automatic crash recovery on restart |
| RTO measurement | Time from PANIC to readiness=200 |
| Data integrity | WAL archive recovery + PITR verification |
| Audit | wal_full event logged |
| RTO objective | < 900s (D1a) |

**??:** Fill WAL disk أ¢â€ â€™ PG PANIC أ¢â€ â€™ restart أ¢â€ â€™ crash recovery أ¢â€ â€™ PITR أ¢â€ â€™ readiness=200 أ¢â€ â€™ verify data integrity أ¢â€ â€™ measure RTO.

