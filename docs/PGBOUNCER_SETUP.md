# راه‌اندازی PgBouncer برای پایش

**نسخه:** ۱.۰.۰  
**تاریخ:** ۱۸ شهریور ۱۴۰۵ (2026-09-09)  
**وضعیت:** ✅ فاز ۲.۳ — Connection Pooling آماده استقرار

---

## ۱. هدف و اصل معماری

در مقیاس پایلوت، `server/db.js` با `pg.Pool` مستقیماً به PostgreSQL وصل می‌شود. در مقیاس چندمدرسه‌ای/ملی، اتصال مستقیم همهٔ نودهای Node.js به PostgreSQL باعث رشد سریع connection، مصرف حافظهٔ سرور دیتابیس و صف انتظار می‌شود. PgBouncer لایهٔ سبک pooling جلوی PostgreSQL است و اتصال‌های زیاد کلاینت را به تعداد محدودی اتصال واقعی دیتابیس نگاشت می‌کند.

```
Application Nodes (Node.js) → PgBouncer (Pooling) → PostgreSQL Primary
```

قاعدهٔ پایش:

- اپلیکیشن همچنان فقط `DATABASE_URL` را می‌شناسد.
- در تولید، `DATABASE_URL` به PgBouncer اشاره می‌کند، نه مستقیم به PostgreSQL.
- PostgreSQL فقط از PgBouncer اتصال می‌پذیرد؛ نودهای اپلیکیشن نباید مستقیم به پورت `5432` دسترسی داشته باشند.

---

## ۲. توپولوژی پیشنهادی

### ۲.۱. پایلوت تک‌سرور

```
Node.js :3000  →  PgBouncer :6432  →  PostgreSQL :5432
```

- `listen_addr = 127.0.0.1` اگر Node و PgBouncer روی همان ماشین‌اند.
- `listen_addr = *` فقط وقتی لازم است که چند نود اپلیکیشن از شبکه خصوصی وصل شوند؛ در این حالت firewall باید فقط subnet خصوصی اپلیکیشن را مجاز کند.

### ۲.۲. تولید چندنودی

```
Node A ┐
Node B ├── private network ── PgBouncer pair ── PostgreSQL Primary
Node C ┘
```

برای شروع، یک PgBouncer کافی است؛ برای HA می‌توان PgBouncer را کنار هر نود اپلیکیشن یا پشت TCP load balancer داخلی قرار داد. در هر دو حالت، PostgreSQL primary باید سقف اتصال واقعی کنترل‌شده داشته باشد.

---

## ۳. فایل نمونه `pgbouncer.ini`

> مقادیر زیر نقطهٔ شروع امن هستند. پس از تست فشار، فقط با عدد واقعی latency و `SHOW POOLS` تغییر کنند.

```ini
[databases]
payesh = host=localhost port=5432 dbname=payesh

[pgbouncer]
pool_mode = transaction
default_pool_size = 20
max_client_conn = 1000
min_pool_size = 5
reserve_pool_size = 10
reserve_pool_timeout = 3
server_idle_timeout = 600
server_lifetime = 3600
server_connect_timeout = 5
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
listen_addr = *
listen_port = 6432
```

### ۳.۱. نکته امنیتی درباره `listen_addr = *`

این مقدار فقط برای معماری چندنودی در شبکه خصوصی مناسب است. اگر PgBouncer روی همان سرور اپ اجرا می‌شود، مقدار امن‌تر این است:

```ini
listen_addr = 127.0.0.1
```

در هر دو حالت، پورت `6432` نباید عمومی باشد. فقط نودهای اپلیکیشن مجازند به آن وصل شوند.

---

## ۴. احراز هویت PgBouncer

فایل `/etc/pgbouncer/userlist.txt` نباید در Git باشد و باید owner-only باشد:

```bash
sudo install -o pgbouncer -g pgbouncer -m 0600 /dev/null /etc/pgbouncer/userlist.txt
```

فرمت نمونه برای `auth_type = md5`:

```text
"payesh_user" "md5<md5(password + username)>"
```

تولید مقدار md5 بدون چاپ رمز در history:

```bash
read -rsp 'PostgreSQL password: ' PGPASS; echo
printf '"payesh_user" "md5%s"\n' "$(printf '%s' "${PGPASS}payesh_user" | md5sum | awk '{print $1}')" | sudo tee /etc/pgbouncer/userlist.txt >/dev/null
unset PGPASS
sudo chmod 0600 /etc/pgbouncer/userlist.txt
```

---

## ۵. یکپارچه‌سازی با `server/db.js`

### ۵.۱. متغیرهای محیطی اپلیکیشن

در محیط تولید، آدرس اتصال اپلیکیشن را از PostgreSQL مستقیم:

```bash
DATABASE_URL=postgresql://payesh_user:***@postgres:5432/payesh
```

به PgBouncer تغییر دهید:

```bash
DATABASE_URL=postgresql://payesh_user:***@pgbouncer:6432/payesh
PGBOUNCER=1
PGBOUNCER_POOL_MODE=transaction
PG_POOL_MIN=0
PG_POOL_MAX=20
PG_TIMEOUT_MS=3000
PG_IDLE_TIMEOUT_MS=10000
```

`server/db.js` همچنان از `pg.Pool` استفاده می‌کند. وقتی `PGBOUNCER=1` یا پورت `6432` در `DATABASE_URL` دیده شود، تنظیمات سازگار با PgBouncer فعال می‌شود:

- `PG_POOL_MIN` پیش‌فرض در حالت PgBouncer برابر `0` است تا Node اتصال‌های بی‌دلیل نگه ندارد.
- `PG_POOL_MAX` سقف اتصال هر نود اپلیکیشن به PgBouncer است، نه سقف اتصال واقعی PostgreSQL.
- `PGBOUNCER_POOL_MODE=transaction` در health و تست‌ها گزارش می‌شود.
- health check دیتابیس، `total_count`، `idle_count` و `waiting_count` را برای تشخیص اشباع pool برمی‌گرداند.

### ۵.۲. چرا `pool_mode = transaction`؟

پایش عملیات‌های نوشتن حساس را از `db.transaction(callback)` عبور می‌دهد و queryهای عادی هم stateless هستند. بنابراین transaction pooling بهترین نسبت ظرفیت/ایمنی را می‌دهد.

ممنوعیت‌ها در transaction pooling:

- استفاده از session state مثل `SET search_path` بدون reset ممنوع است.
- prepared statement نام‌دار و session-pinned نباید استفاده شود.
- advisory lockهای session-level ممنوع‌اند؛ اگر لازم شد از transaction-level استفاده شود.

در کد فعلی، `pg` بدون prepared statement نام‌دار استفاده شده و تراکنش‌ها با `BEGIN/COMMIT/ROLLBACK` روی client lease شده انجام می‌شود؛ این الگو با transaction pooling سازگار است.

---

## ۶. تنظیم PostgreSQL پشت PgBouncer

در `postgresql.conf`:

```conf
max_connections = 100
shared_buffers = 25% RAM
idle_in_transaction_session_timeout = 30000
statement_timeout = 30000
```

در `pg_hba.conf` فقط IP یا socket مربوط به PgBouncer را مجاز کنید:

```conf
host    payesh    payesh_user    10.0.0.0/24    md5
```

اتصال مستقیم اپلیکیشن به PostgreSQL باید در firewall بسته باشد.

---

## ۷. مانیتورینگ و آستانه‌ها

دستورات PgBouncer:

```bash
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c 'SHOW POOLS;'
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c 'SHOW STATS;'
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c 'SHOW CLIENTS;'
psql -h pgbouncer -p 6432 -U pgbouncer pgbouncer -c 'SHOW SERVERS;'
```

آستانه‌های هشدار پیشنهادی:

| شاخص | هشدار | اقدام |
|---|---:|---|
| `cl_waiting` در `SHOW POOLS` | بیشتر از ۰ برای ۳ دقیقه | افزایش تدریجی `default_pool_size` یا کاهش query کند |
| `waiting_count` در `/api/health` | بیشتر از ۰ پایدار | بررسی سقف `PG_POOL_MAX` و اشباع PgBouncer |
| `avg_query` در `SHOW STATS` | رشد ناگهانی | بررسی index و lock |
| اتصال مستقیم به `5432` از نود اپ | هر مقدار | خطای امنیتی/firewall |

---

## ۸. Runbook استقرار

۱. نصب PgBouncer:

```bash
sudo apt-get update
sudo apt-get install -y pgbouncer
```

۲. نوشتن `/etc/pgbouncer/pgbouncer.ini` و `/etc/pgbouncer/userlist.txt`.

۳. تست اتصال از خود سرور:

```bash
psql 'postgresql://payesh_user:***@127.0.0.1:6432/payesh' -c 'SELECT 1;'
```

۴. تغییر env اپلیکیشن:

```bash
DATABASE_URL=postgresql://payesh_user:***@127.0.0.1:6432/payesh
PGBOUNCER=1
PGBOUNCER_POOL_MODE=transaction
```

۵. restart سرویس:

```bash
sudo systemctl restart pgbouncer
sudo systemctl restart payesh
curl -fsS https://payesh.example/api/health
```

۶. مشاهده وضعیت:

```bash
journalctl -u pgbouncer -n 50 --no-pager
journalctl -u payesh -n 50 --no-pager
```

---

## ۹. تست‌های مخزن

تست اختصاصی این فاز:

```bash
node tests/pgbouncer-pooling.js
```

گیت‌های عمومی قبل از تحویل:

```bash
node build.js --check
node tools/check-authz.js
node tests/secret-scan.js
node --expose-gc --max-old-space-size=2048 tests/smoke.js
```

`tests/pgbouncer-pooling.js` عمداً PgBouncer واقعی لازم ندارد؛ قرارداد پیکربندی، مستندات، و سازگاری `server/db.js` با `DATABASE_URL` پورت `6432` و `PGBOUNCER_POOL_MODE=transaction` را بررسی می‌کند. تست اتصال واقعی باید در محیط staging با PgBouncer نصب‌شده اجرا شود.

---

## ۱۰. سناریوهای شکست و پاسخ

| سناریو | نشانه | پاسخ |
|---|---|---|
| PgBouncer down | خطای اتصال، fallback در dev، fail در production بسته به readiness | restart PgBouncer، بررسی `userlist.txt` و firewall |
| pool اشباع | `cl_waiting` یا `waiting_count > 0` | query کند را پیدا کنید؛ سپس sizing را تغییر دهید |
| رمز اشتباه | `auth failed` در لاگ PgBouncer | بازتولید md5 و reload |
| transaction طولانی | اتصال‌های server مشغول می‌مانند | timeoutها و queryهای lockدار را بررسی کنید |
| اتصال مستقیم به PostgreSQL | رشد connection روی `5432` | rule شبکه را اصلاح کنید؛ اپ باید فقط `6432` ببیند |

---

## ۱۱. چک‌لیست پذیرش فاز ۲.۳

- [x] سند معماری PgBouncer موجود است.
- [x] نمونه `pgbouncer.ini` شامل `pool_mode = transaction` و سقف‌هاست.
- [x] `DATABASE_URL` تولید به `:6432` اشاره می‌کند.
- [x] `server/db.js` با `pg.Pool` و تنظیمات PgBouncer سازگار است.
- [x] تست `tests/pgbouncer-pooling.js` قرارداد را قفل می‌کند.
- [x] گیت‌های build/authz/secret/smoke سبز هستند.
