# ران‌بوک‌هایِ عملیات (Runbooks)

> پاسخ‌گوییِ گام‌به‌گام برایِ استقرار، عیب‌یابی، بازیابی، مانیتورینگ و امنیت.
> قرارداد: هر دستور کپی‌پیستی است؛ هر ران‌بوک «علائم ← تشخیص ← اقدام ← راستی‌آزمایی» دارد؛
> هرجا ابزار هنوز نیست، به‌جایِ وانمود، «شکافِ ثبت‌شده» می‌بینید.
> سیاستِ کلان (RTO زیرِ ۱۵ دقیقه، RPO زیرِ ۵ دقیقه): `RELIABILITY_DR_PLAN.md` — این سند، گام‌هایِ اجراییِ همان سیاست است.

## ۰. مشترکات (پیش از هر ران‌بوک)

### ۰-۱. شدت (Severity)

| سطح | تعریف | نمونه | واکنش |
|---|---|---|---|
| SEV1 | سرویس خوابیده یا داده در خطر | health قرمز، دیسک پر، نشتِ داده | همین حالا، همهٔ دست‌ها |
| SEV2 | افتِ محسوس ولی سرویس بالا | p95 بالایِ SLO، صفِ sync بادکرده | همان روز، با مالک |
| SEV3 | هشدارِ زودهنگام | دیسک ۷۰٪، یک 5xx پراکنده | همان هفته |

### ۰-۲. مسیرها و ابزارِ مشترک (تک‌باکسِ `DEPLOY.md`)

```bash
sudo -iu payesh
cd /home/payesh/p2
HEALTH=https://payesh.example/api/health
curl -fsS $HEALTH | head -c 200; echo          # باید ok:true بدهد
journalctl -u payesh -n 50 --no-pager          # لاگِ سرویس
tail -n 100 /home/payesh/data/audit.log        # آدیتِ append-only (بدونِ phone/nid)
ls -la /home/payesh/data/ /home/payesh/backups/ | head -20
```

## ۱-۱. استقرارِ نسخهٔ تازه (Deployment)

### پیش‌چک‌ها (همه اجباری — رویِ کدی که قرار است برود)

```bash
git status --porcelain                 # باید خالی باشد
node build.js --check                 # بایت‌به‌بایت + مُهرِ راهنما + مانیفست + مجوزها
node tests/smoke.js                   # ۵۴۷/۵۴۷
node tools/check-authz.js             # ۰ (تطبیقِ کامل)
df -h /home/payesh | tail -1          # فضایِ کافی برایِ بکاپ
```

### الف) تک‌باکس (پیش‌فرضِ امروز)

```bash
# ۱) بکاپِ پیشِ‌استقرار (فایل‌سطح — سریع‌ترین)
cp /home/payesh/data/payesh.json /home/payesh/backups/pre-deploy-$(date +%Y%m%d-%H%M%S).json
# ۲) کد + بیلد + ری‌استارت
git pull --ff-only
node build.js
sudo systemctl restart payesh
# ۳) راستی‌آزمایی (۳ دقیقه)
for i in 1 2 3; do curl -fsS $HEALTH && echo " ok $i"; sleep 60; done
# ۴) یک ورودِ تستی + شمارشِ رکوردها با قبل (بخشِ «شمارش» در §۶ DEPLOY)
```

### ب) مقیاسِ ملی (مسیرِ PG + دو رنگ)

ترتیبِ الزامی (جزئیات در `CANARY_DEPLOYMENT.md` §۱-۶):

```bash
npm run migrate:status --prefix /home/payesh/p2-green   # باید سبز باشد
sudo bash scripts/canary-deploy.sh        # canary مرحله‌ای (PG) — هر گیتِ قرمز = abort خودکار
# یا رویِ JSON:
sudo bash scripts/canary-deploy.sh --cutover
```

### Rollback (وقتی چیزی بویِ سوختگی می‌دهد)

| مسیر | دستور | اثر |
|---|---|---|
| ملی (دو رنگ) | `npm run rollback` | ترافیک به Blue + اسنپ‌شاتِ پیشِ‌برگشت (هرگز `migrate:down` نمی‌زند) |
| تک‌باکس (کد) | `git log --oneline -3` ← `git checkout <قبلی>` + `node build.js` + `sudo systemctl restart payesh` | برگشتِ کد (داده دست نمی‌خورد) |
| تک‌باکس (داده خراب شد) | §۱-۳ (بازیابیِ JSON) | برگشتِ داده |

پس از هر استقرار/برگشت: ۱۵ دقیقه `tail -f` آدیت + health، و ثبتِ «چه نسخه‌ای، کی، چرا» در لاگِ عملیات.

## ۱-۲. عیب‌یابی (Troubleshooting)

### API High Latency (‏p95‏ بالایِ SLO)

```
۱) scope: همه‌جا یا یک مسیر؟
   nginx: p95 از لاگ (روشِ §۱-۳ CANARY) ← اگر فقط /api/sync: برو «صفِ sync»؛ اگر فقط لاگین: برو rate-limit/OTP.
۲) box:  top (node بالایِ ۷۰٪؟) + free (swap؟) + دیسک (پر؟) + journalctl (OOM/ری‌استارت؟)
۳) store: ls -la payesh.json (رشدِ ناگهانی؟ هر نوشتن = سریالایزِ کلِ فایل در مسیرِ JSON)
۴) PG (فقط مسیرِ PG): §«Database» پایین
۵) Redis: redis-cli -u "$REDIS_URL" --latency + journalctl (هشدارِ fallback؟)
```

- **Tracing:** کارِ چت ۳ (Jaeger/OpenTelemetry) هنوز در جریان است — تا آن روز،
  جایگزین: `audit.log` (رویدادهایِ `sync_*` با زمان) + لاگِ nginx (`request_time` + `upstream_addr`).
- **Logging:** کارِ چت ۲ (ELK/Loki) در جریان است — تا آن روز: `journalctl -u payesh` +
  `grep '"ev":"sync_validation_failed"' audit.log | tail` (و الگوهایِ مشابه برایِ هر `ev` در §۱-۴).
- اقدام‌هایِ رایج: ری‌استارتِ برنامه‌ریزی‌شده (نشتِ موقت) ← scale-up باکس ←
  (اگر ریشه store است) مهاجرت به PG (`MIGRATION_SETUP.md`) — نه برعکس.

### Database High CPU

**مسیرِ JSON (پیش‌فرض):** «CPU دیتابیس» یعنی خودِ پروسهٔ node (تک‌نخی!).

```bash
ls -la /home/payesh/data/payesh.json        # چند MB؟ رشدِ روزانه چقدر؟
grep -c '"ev":"sync_ok"' /home/payesh/data/audit.log   # نرخِ نوشتن (تقریبی)
top -b -n1 | head -15                       # node چند٪؟ load چند؟
```

ریشه‌هایِ معمول: استورِ بزرگ (سریالایزِ هر نوشتن) + نرخِ sync بالا. اقدام: پنجرهٔ کم‌بار +
ری‌استارت؛ درمانِ ریشه‌ای = مسیرِ PG.

**مسیرِ PG (وقتی `DATABASE_URL` ست است):** ران‌تایم پولِ واقعی دارد
(`server/db.js`: پیش‌فرضِ ‏min 2 / max 20‏، تایم‌اوتِ ۳ ثانیه؛ `PG_POOL_MIN/MAX/TIMEOUT_MS`).

```sql
-- ۱) کی، چی را نگه داشته؟ (قفل‌ها و کوئری‌هایِ فعال)
SELECT pid, usename, state, wait_event_type, LEFT(query, 120)
FROM pg_stat_activity WHERE datname = current_database() ORDER BY state;
-- ۲) ده کوئریِ کندِ برتر (نیازمندِ pg_stat_statements: shared_preload + restart — یک‌بار)
SELECT LEFT(query, 100), calls, round(total_exec_time::numeric,1) AS total_ms
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
```

- **کُندیِ کوئری:** `EXPLAIN ANALYZE` ← ایندکسِ گمشده؟ (مرجع: `002_indexes.sql`) ←
  افزودن با migration تازه؛ رویِ جدولِ بزرگ، `CREATE INDEX CONCURRENTLY` در پنجرهٔ نگهداری
  (داخلِ تراکنشِ تکی‌فایل اجرا نمی‌شود — یا مایگریشنِ جدا یا پنجره).
- **پول:** صفِ انتظارِ بالایِ ۳ ثانیه + `pg_stat_activity` پر = یا کوئریِ کند (درمانِ بالا)
  یا سقفِ کم (`PG_POOL_MAX` بالاتر + ری‌استارت)؛ در مقیاس: PgBouncer.
- **کانکشنِ سرگردان:** `SELECT pg_terminate_backend(pid)` فقط برایِ `idle in transaction`
  قدیمی و شناخته‌شده — هرگز کور.

### Redis Out of Memory

```bash
redis-cli -u "$REDIS_URL" INFO memory | grep -E 'used_memory_human|maxmemory|evicted_keys|expired_keys'
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
```

- **سیاستِ تخلیه:** پیشنهاد `allkeys-lru` (کشِ bootstrap قربانیِ اول — امن، چون بازساخته می‌شود).
  ⚠️ کلیدهایِ idempotency (۲۴ ساعته) نباید زود بپَرند وگرنه عملیاتِ تکراری دوباره اعمال می‌شود؛
  اگر `evicted_keys` رشد کرد و رفتارِ تکرار دیده شد: یا حافظه بیشتر، یا دیتابیسِ جدا برایِ idempotency.
- **اگر `noeviction` + پر:** نوشتن‌ها خطا می‌خورند — اپ fallback حافظه می‌گیرد ولی کشِ مشترک می‌خوابد؛
  اقدامِ فوری: حافظه/سیاست، بعد `redis-cli ping` + چکِ `isRedis` در لاگ.
- **رشدِ بی‌رویه:** `redis-cli --bigkeys` + TTLها (`bootstrap` ۳۰۰s، ‏idempotency‏ ۸۶۴۰۰s — اگر ماندگارِ بی‌TTL
  پیدا شد، باگِ کد است نه عملیات).
- **کلاستر:** وقتی تک‌نود سقف خورد: Redis Cluster (sharding) — دستی، با پنجره (دادهٔ کش قابلِ بازسازی است؛
  idempotency را در مهاجرت نگه دارید یا پنجرهٔ ۲۴ ساعته را بپذیرید).

### Sync Queue Backlog (صفِ همگام‌سازی بادکرده)

```bash
# نبضِ سرور در ۱۵ دقیقهٔ اخیر (الگو؛ evها واقعی‌اند):
for ev in sync_ok sync_validation_failed sync_authz_fail sync_field_denied sync_forge_by sync_clock_skew; do
  printf '%s: ' "$ev"; grep -c "\"ev\":\"$ev\"" /home/payesh/data/audit.log
done
grep '"ev":"sync_conflict_preserved"' /home/payesh/data/audit.log | tail -5
```

- **`sync_validation_failed` بالا:** کلاینت‌هایِ قدیمی/خراب — نسخهٔ کلاینت‌ها را چک کنید، نه سرور را.
- **`sync_authz_fail` / `sync_field_denied` بالا:** تغییرِ مجوز/مدلِ تازه؟ (`git log` همین امروز) ←
  در غیرِ این صورت حمله/سوءاستفاده (IPها از لاگِ nginx).
- **413 (بستهٔ بزرگ):** کلاینت خودش می‌شکافد (۲۰۰تایی + شکافتِ بازگشتی)؛ اگر ماندگار شد: dead-letter.
- **dead-letter (سمتِ کاربر):** opهایِ «رد شده» در پنلِ sync با اکشنِ `sync-del` پاک می‌شوند؛
  اگر یک الگو تکرار می‌شود (مثلاً یک کالکشن)، ریشه کد/مدل است نه عملیات.
- **`sync_conflict_preserved` بادکرده:** موجِ ویرایشِ هم‌زمان (شروعِ مهر؟) — صفِ داوریِ مدیر
  (`GET /api/sync/conflicts`) را خالی کنید؛ اگر بی‌رویه شد، `base_version` کلاینت‌ها قدیمی است.
- **کُندیِ دیسک:** persist هر ۲ ثانیه؛ اگر دیسک کند/پر است، apply عقب می‌ماند — `df` و `iostat` اول.

## ۱-۳. بازیابی (Recovery)

### JSON Restore (مسیرِ امروز — سریع‌ترین)

```bash
# الف) از API (superadmin، وقتی سرور بالاست):
curl -s -X POST https://payesh.example/api/admin/backup -H "Cookie: <نشستِ سوپرادمین>"
curl -s -X POST https://payesh.example/api/admin/restore \
  -H 'Content-Type: application/json' -H "Cookie: <نشستِ سوپرادمین>" \
  -d '{"file":"<نامِ فایل از data/backups>"}'
# ب) فایل‌سطح (وقتی سرور خواب است):
sudo systemctl stop payesh
cp /home/payesh/data/payesh.json /home/payesh/backups/broken-$(date +%Y%m%d-%H%M%S).json
cp /home/payesh/backups/<سالم> /home/payesh/data/payesh.json
sudo systemctl start payesh
# راستی‌آزمایی (هر دو روش): health سبز + یک ورود + شمارشِ users/schools با قبلِ حادثه
```

### PostgreSQL Restore + PITR (مسیرِ ملی)

پیش‌نیاز (یک‌بار، قبلِ حادثه!): بایگانیِ WAL (WAL-G/pgBackRest هر ۵ دقیقه — همان RPO زیرِ ۵ دقیقه در DR).

```bash
sudo systemctl stop payesh-blue payesh-green   # قطعِ نویسنده‌ها
# بازیابیِ base + WAL تا لحظهٔ T (دستورِ دقیق بسته به ابزار؛ الگو):
# wal-g backup-fetch /var/lib/postgresql/restore LATEST
# + recovery_target_time = '2026-.. ..:..' در پیکربندی + start
npm run migrate:status --prefix /home/payesh/p2-blue   # اسکیما باید سبز باشد
# شمارشِ users/schools با انتظار + smoke محدود، بعد روشن‌کردنِ Blue و سپس canary به Green
```

اگر WAL ندارید، RPO شما «آخرینِ pg_dump» است نه ۵ دقیقه — این را صادقانه به ذی‌نفع بگویید.

### Redis Restore (RDB/AOF)

```bash
sudo systemctl stop redis-server   # یا managed: پنجرهٔ ارائه‌دهنده
# بازیابیِ dump.rdb / appendonlydir از بکاپ، بعد start +:
redis-cli ping                        # PONG
redis-cli INFO persistence | grep -E 'rdb_last_save|aof_last_rewrite'
```

نکتهٔ اپ: پایش با Redis خوابیده هم بالا می‌ماند (fallback حافظه) — پس بازیابیِ Redis
می‌تواند آنلاین باشد؛ بعدش لاگ را برایِ «برگشت به Redis» چک کنید (کشِ bootstrap در ۵ دقیقه
خودش گرم می‌شود؛ idempotency بیست‌وچهارساعته در صورتِ از دست رفتن، پنجرهٔ تکرار باز می‌کند —
اگر دقیقاً وسطِ موجِ sync هستید، اول §«Sync Backlog» را بخوانید).

### Full System Recovery (خرابیِ کامل — هدف: RTO زیرِ ۱۵ دقیقه)

```
۱) باکسِ تازه ← DEPLOY §۱ تا §۵ (کاربر، کد، env، TLS، سرویس) — ۵ دقیقه
۲) داده: JSON (فایلِ backups) یا PG (PITR بالا) — ۵ دقیقه
۳) رازها: jwt.key از بکاپِ امن (اگر نیست: تازه ساخته می‌شود و همه دوباره لاگین می‌کنند — قابلِ قبول، ولی ثبت شود)
۴) Redis: managed وصل یا RDB بالا (§ قبل)
۵) ماتریسِ سبز: health + لاگینِ ۳ نقش + شمارشِ users/schools/attendance + audit می‌چرخد
۶) برگرداندنِ DNS/ترافیک + اعلامِ پایان + پست‌مورتمِ ۲۴ ساعته (بدونِ سرزنش)
```

## ۱-۴. مانیتورینگ و هشدار (Monitoring & Alerting)

**آنچه امروز هست (نه بیشتر):** ‏`Restart=always`‏ + پینگِ خارجیِ `/api/health` +
`journalctl` + ‏`audit.log`‏ + لاگِ nginx. چتِ ۲ (Logging) و چتِ ۳ (Tracing) در جریان‌اند؛
تا آن روز، «داشبورد» همین دستورهاست:

```bash
# کرونِ پیشنهادیِ حداقلی (هر ۵ دقیقه — خارج از ریپو، رویِ ایستگاهِ مانیتور):
# curl -fsS --max-time 10 https://payesh.example/api/health || echo "PAYESH DOWN" | <پیام‌رسانِ اپراتور>
# نبضِ ۵ دقیقه‌ایِ آدیت:
tail -n 2000 /home/payesh/data/audit.log | grep -o '"ev":"[a-z_]*"' | sort | uniq -c | sort -rn | head
```

| هشدار | آستانه (از اسنادِ مرجع) | شدت | واکنشِ اول |
|---|---|---|---|
| health قرمز/تایم‌اوت | ۲ پینگِ پیاپی | SEV1 | §۱-۳ (بازیابی) |
| ‏5xx‏ در nginx | ‏> ۱٪‏ در ۵ دقیقه (آستانهٔ rollback در CANARY) | SEV1 | rollback + §«API Latency» |
| ‏p95‏ بالا | ‏> ۵۰۰ms‏ در ۵ دقیقه (همان‌جا) | SEV1/2 | §«API Latency» |
| CPU باکس | ‏> ۷۰٪‏ پنج‌دقیقه‌ای (آستانهٔ HPA) | SEV2 | §«Database» (مسیرِ JSON) |
| دیسکِ data | ‏> ۸۰٪‏ | SEV2 | بکاپ‌هایِ کهنه + رشدِ استور |
| `evicted_keys` ردیس | رشدِ پیوسته | SEV2 | §«Redis OOM» |
| dead-letter کاربر | گزارشِ تکراریِ یک الگو | SEV3→2 | §«Sync Backlog» |

قاعده: آستانه‌ها در همین جدول‌اند (تک‌منبع)؛ تغییرشان = PR رویِ همین فایل + ثبتِ دلیل.
(فایلِ `prometheus/alert.rules` هنوز در ریپو نیست — وقتی چتِ ۲/۳ به ثمر رسید، این جدول به آنجا ترجمه می‌شود.)

## ۱-۵. رویه‌هایِ امنیتی (Security Procedures)

### چرخشِ کلیدِ JWT (Key Rotation)

اثرِ اعلام‌شده: **همهٔ نشست‌ها می‌میرند و همه دوباره لاگین می‌کنند** (امضایِ HS256 عوض می‌شود).
در پنجرهٔ کم‌بار + اطلاعِ قبلی انجام شود.

```bash
sudo -iu payesh
cd /home/payesh/p2
cp /home/payesh/data/jwt.key /home/payesh/backups/jwt.key.$(date +%Y%m%d)   # اگر فایلی است
openssl rand -hex 32 > /home/payesh/data/jwt.key   # یا مقدارِ تازه در PAYESH_JWT_SECRET
chmod 600 /home/payesh/data/jwt.key
sudo systemctl restart payesh
curl -fsS $HEALTH && echo OK
# راستی‌آزمایی: توکنِ قدیمی باید 401 بدهد، لاگینِ تازه ۲۰۰
```

### Revoke توکنِ لو رفته (Token Revocation)

- **واقعیتِ امروز (شکافِ ثبت‌شده):** ای‌پی‌آیِ مدیریتیِ «باطل‌کردنِ یک توکن» نداریم؛
  فقط خودِ کاربر با logout، ‏jti‏ خودش را باطل می‌کند (`__revoked_jti`، TTL هشت‌ساعته).
- **تک‌توکنِ لو رفته (break-glass):** با دانستنِ ‏jti‏ (از لاگِ nginx/audit): توقفِ سرور ←
  افزودنِ دستیِ ‏jti‏ به `__revoked_jti` در کپیِ استور ← اعتبارسنجیِ JSON ← جایگزینی ←
  استارت ← تستِ 401 با همان توکن. پرریسک؛ فقط SEV1 و دونفره (یکی اجرا، یکی نظارت).
- **نشتِ گسترده/نامشخص:** چرخشِ کلید (بالا) — تمیزتر و سریع‌تر از شکارِ تکی.
- **کارِ آینده:** ای‌پی‌آیِ `POST /api/admin/revoke` (درمانِ ریشه‌ایِ این شکاف).

### پاسخ به نشتِ داده (Data Breach Response)

```
۱) contain (ساعتِ صفر): اگر بردارِ حمله فعال است — بستنِ منفذ (revoke/rotate/مسدودیتِ IP در فایروال)؛
   اگر نه، هیچ‌چیز را «تمیز» نکنید (شواهد!).
۲) scope: audit.log (JSONL، بدونِ phone/nid — حریم نگه داشته شده) + لاگِ nginx (IP/زمان/مسیر) +
   جدولِ users (آخرینِ login_fail/enum_revokeها). چه رکوردهایی، کی، از کجا.
۳) eradicate/recover: چرخشِ همهٔ رازها (JWT + بکاپ‌ها)؛ اگر داده دست‌کاری شده: §۱-۳.
۴) notify: طبقِ سیاستِ حریمِ خصوصی (`docs/PRIVACY_POLICY.md`) و تعهدِ قراردادی — متنِ آماده نداریم،
   با مشاورِ حقوقی؛ رکوردِ «کی به کی چه گفت» نگه دارید.
۵) lessons: پست‌مورتمِ ۷۲ ساعته + ایشویِ پیگیری برایِ هر یافته (بدونِ استثنا).
```

## ۲. تمرین‌ها (Drills — برنامهٔ پیشنهادی)

| تمرین | بسامد | معیارِ قبولی |
|---|---|---|
| بازیابیِ JSON رویِ staging (§۱-۳) | ماهانه (خواستهٔ DR) | RTO زیرِ ۱۵ دقیقه + شمارش برابر |
| ‏DRY_RUN‏ رولبکِ canary | ماهانه (خواستهٔ CANARY) | exit ‏۰‏ + مسیرِ echo کامل |
| چرخشِ کلید رویِ staging | فصلی | همه لاگینِ مجدد + صفر خطایِ ماندگار |
| میزگردِ breach (کاغذی) | فصلی | هر نقش بداند قدمِ ۱ تا ۵ را |

> قاعدهٔ پایانیِ همهٔ ران‌بوک‌ها: اگر ران‌بوک با واقعیت نخواند، **واقعیت درست است** —
> اقدام کن، بعد همین فایل را با PR اصلاح کن. ران‌بوکِ کهنه از نداشتن بدتر است.
