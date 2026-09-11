# استقرار — راهنمای عملیاتی Wave 15 (Health / Deployment)

_چت ۳ — ۲۰/۰۶/۱۴۵ (2026-09-09) — مکملِ `docs/DEPLOY.md` (نصبِ تک‌سرور، TLS، systemd، بکاپ) — این سند: چند-نسخه، پروب‌ها، Graceful Shutdown، Rolling Deployment و Rollback_

## ۱. Endpointهایِ سلامت

سه endpoint با سه رفتارِ **متفاوت و عمدی**:

| Endpoint | معنی | 200 وقتی... | 503 وقتی... |
|---|---|---|---|
| `GET /api/liveness` | فرایند زنده است و event-loop پاسخ می‌دهد | همیشه (اگر process زنده است) | هرگز — حتی در drain |
| `GET /api/readiness` | آمادهٔ پذیرشِ ترافیک است | store لود + pingِ DB + pingِ Redis (و در تولید: Redisِ زنده) | یکی از وابستگی‌ها ناکار / در حالِ drain |
| `GET /api/health` | گزارشِ کامل (برایِ انسان/دیتا‌داجست) | درگاهِ P0-13 (قراردادِ server13) | درگاهِ P0-13 |

**چرا این تفاوت؟** اگر liveness به وابستگی‌ها وابسته باشد، قطعِ موقتِ Redis کلِ فلاست را restart می‌کند (طوفانِ ری‌استارت) — درحالی‌که کشِ memory-fallback سرور را کاربردی نگه می‌دارد. readiness به‌صورتِ دقیق همین تشخیص را می‌دهد تا load-balancer/کوبرنت ترافیک را بگیرد بدونِ آن‌که کاتل را بکشد.

### نمونه‌ها

```bash
curl -s http://payesh:3000/api/liveness
# {"ok":true,"status":"live","name":"payesh-server","pid":4123,"uptime_s":86400,"draining":false}

curl -s http://payesh:3000/api/readiness
# dev:     {"ok":true,"status":"ready","db":{"driver":"memory","alive":true},"redis":{"driver":"memory","alive":true,"live":false,"required":false},"draining":false,"time":"..."}
# prod:    {"ok":true,"status":"ready","db":{"driver":"postgres","alive":true},"redis":{"driver":"redis","alive":true,"live":true,"required":true},"draining":false,"time":"..."}

curl -s http://payesh:3000/api/health
# قراردادِ قدیمی (ok/name/phase/version/pid/cache) + گزارشِ کاملِ Wave 15:
# db {driver,alive,pool{total,idle,pending}} · redis {driver,alive} ·
# queue {outbox,notify_pending,in_flight} · cache_l1 · uptime_s · memory{heap_used_kb}
```

**قاعدهٔ Wave 15 (سفت):** `PAYESH_ENV=production` + Redis قطع ⇒ `readiness = 503` — در هر لحظه (استارت یا حینِ پرواز). در استارت، قبل از readiness، درگاهِ سخت‌ترِ P0-13 کار می‌کند: فرایند اصلاً بالا نمی‌آید (`[FATAL] Cache readiness failed` + exit 1). در توسعه، فال‌بکِ حافظه قابل‌قبول است و readiness 200 می‌دهد.

**در حالِ drain:** پس از SIGTERM، `readiness` فوراً 503 می‌شود (`draining:true`) تا LB ترافیکِ تازه نفرستد؛ `liveness` همچنان 200 (فرایند هنوز زنده و در حالِ خاتمهٔ تمیز است).

## ۲. پروب‌ها (Kubernetes)

```yaml
spec:
  terminationGracePeriodSeconds: 30        # > مهلتِ drain (پیش‌فرض 10s) + حاشیه
  containers:
  - name: payesh
    image: payesh:1.0.1
    ports: [{ containerPort: 3000 }]
    startupProbe:                          # حاشیهٔ استارت (seed/PG/Redis)
      httpGet: { path: /api/readiness, port: 3000 }
      periodSeconds: 5
      failureThreshold: 24                 # ۱۲ ثانیه
    livenessProbe:                         # فقط زنده‌بودن — وابستگی نمی‌بیند
      httpGet: { path: /api/liveness, port: 3000 }
      periodSeconds: 10
      failureThreshold: 3
    readinessProbe:                        # ترافیک فقط وقتی همه‌چیز آماده است
      httpGet: { path: /api/readiness, port: 3000 }
      periodSeconds: 5
      failureThreshold: 2
      successThreshold: 2
    lifecycle:
      preStop:                             # به کوبرنَت وقت می‌دهد endpoint را
        exec: { command: ["sh", "-c", "sleep 5"] }   # از endpoints بکشد
    envFrom:
    - secretRef: { name: payesh-env }      # PAYESH_ENV, REDIS_URL, DATABASE_URL, ...
```

### Docker / systemd

```dockerfile
# Dockerfile — HEALTHCHECK روی readiness (نه liveness):
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/readiness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

```ini
# systemd — StopSignal پیش‌فرض SIGTERM است (همان چیزی که Graceful Shutdown گوش می‌دهد):
[Service]
ExecStart=/usr/bin/node /home/payesh/p2/server/index.js
TimeoutStopSec=30
```

## ۳. Graceful Shutdown (پیاده‌شده در `server/index.js`)

توالیِ SIGTERM/SIGINT:

```
SIGTERM ─► 1) draining=true            /api/readiness ⇒ 503 (draining:true)
         ─► 2) closeIdleConnections()   اتصالاتِ keep-aliveٔ خالی بسته می‌شوند
              server.close()            پذیرشِ اتصالِ تازه متوقف (ECONNREFUSED)
         ─► 3) در انتظارِ in-flight     poll 50ms تا شمارندهٔ درخواست = 0
              (مهلت: PAYESH_SHUTDOWN_TIMEOUT_MS، پیش‌فرض 10s)
         ─► 4) persistStore()           همگام — آخرین نوشت‌هایِ dirty به‌دور نمی‌افتند
              db.close()                PG pool (اگر فعال)
              redis.close()             client + subscriber
         ─► 5) process.exit(0)
نگهبانِ زور: drain > مهلت + 2s ⇒ process.exit(1) (در مانیتورینگ قرمز)
```

- در‌حالت‌پرواز **کامل می‌شود، نه abort** — پاسخِ درِ راه تا آخر می‌رسد.
- بدونِ listener (تستِ درون‌فرایند) توالی بی‌اثرِ close هم انجام می‌شود و exit 0.
- این شاخه **worker** ندارد (outbox/worker در main است) — seamِ توقفِ worker در همان مرحلهٔ ۴ آماده است.
- `PAYESH_SHUTDOWN_TIMEOUT_MS` را هم‌همدستی با `terminationGracePeriodSeconds`/`TimeoutStopSec` تنظیم کنید: همیشه **مهلتِ container > مهلتِ drain**.

## ۴. Rolling Deployment (استقرار تدریجی)

### A. Kubernetes (توصیه‌شده)

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # یک podِ تازهٔ اضافه
      maxUnavailable: 0    # هیچ‌وقت زیر ظرفیتِ فعلی نیاییم
```

چرخهٔ هر pod:

1. کوبرنَت podِ جدید را می‌سازد → `startupProbe` تا `readiness=200` صبر می‌کند (store seed/لود + Redis).
2. podِ جدید وارد endpoints می‌شود (readiness 200) → ترافیکِ تازه به هر دو pod.
3. کوبرنَت `preStop` (sleep 5) را روی podِ کهنه می‌زند → endpoints از k8s کشیده می‌شود (readiness هم 503 می‌شود) → **هیچ ترافیکِ تازه‌ای** به podِ کهنه نمی‌رسد.
4. SIGTERM → drain (بند ۳) → خروجِ تمیز → حذف.

**نتیجه:** صفرِ در دسترس‌نبودی؛ هیچ درخواستی abort نمی‌شود.

### B. دو سرور پشتِ nginx (دستی)

```
nginx upstream: payesh-old:3000  payesh-new:3000  (least_conn)
```

1. روی `payesh-new` نسخهٔ تازه را deploy کنید و `curl /api/readiness` = 200 را ببینید.
2. در `nginx.conf` upstream را به هر دو اضافه کنید + `nginx -s reload`.
3. ترافیک را پراکنده کنید؛ روی `payesh-old` `kill -TERM <pid>` بزنید (drain 10s) — nginx درخواست‌هایِ در‌حالت‌پرواز را نگه می‌دارد، تازه‌ها به new می‌روند.
4. پس از خاتمه، `payesh-old` را از upstream حذف + reload.

### C. PM2 (تک‌مخاطب، بدونِ در دسترس‌نبودی)

```bash
pm2 deploy ecosystem.config.js production update --update-env   # چند-نسخه: max_memory_restart + restart policy
# یا دستی دو-نسخه:
pm2 start server/index.js --name payesh-new --env production
curl -fsS http://127.0.0.1:3000/api/readiness   # صبر تا 200
pm2 stop payesh-old && pm2 delete payesh-old
```

## ۵. Rollback (بازگشت به نسخهٔ قبلی)

1. **Kubernetes:** `kubectl rollout undo deployment/payesh` — کوبرنَت تصاویرِ قبلی را به‌عنوانِ deploymentِ تازه می‌آورد (همان چرخهٔ probe/readiness). در صورتِ تکرار: `kubectl rollout history` + `kubectl rollout undo --to-revision=N`.
2. **دستی/PM2:** همان Rolling Deploymentِ بند ۴B/C — این‌بار با تصویرِ **قبلی** — و pod/سرورِ جدید را می‌بندید.
3. **داده:** rollbackِ کد به‌خودی‌خود داده را برنمی‌گرداند. سازگاری:
   - اسکیمایِ store (payesh.json) فقط-افزوده است (فیلد/کالکشنِ جدید) — نسخهٔ کهنه فیلدهایِ ناشناخته را نادیده می‌گیرد.
   - اگر نسخهٔ تازه migrationِ **تخریبی** داشته باشد (که در این پروژه نداریم)، قبل از rollout: `POST /api/admin/backup` (superadmin) یا بکاپِ دوره‌ای (`PAYESH_BACKUP_EVERY_HOURS`) — restore از `docs/DEPLOY.md §6`.
   - PG: migrations در `migrations/` با `.down.sql` — در صورتِ نیاز `node tools/migrate-to-pg.js down <n>`.
4. **تأیید پس از rollback:** `readiness` 200 + یک smoke سرتاسری (`node tests/smoke.js` روی نمونهٔ staging).

## ۶. متغیرهایِ محیطیِ مرتبط

> **مرجع کامل:** فهرست همهٔ ۱۲۸ متغیر محیطی با پیش‌فرض/الزامی/مثال، حالت‌های شکست و روش چرخش
> در `docs/CONFIGURATION_REFERENCE.md` است؛ جدول زیر فقط متغیرهای مؤثر بر استقرار موج ۱۵ را نشان می‌دهد.

| متغیر | پیش‌فرض | نقش در Wave 15 |
|---|---|---|
| `PAYESH_ENV` | — | `production` ⇒ readiness سخت‌گیرانه (Redis الزامی) + fail-fast استارت (P0-13) + TLS الزامی (DEPLOY.md §TLS) |
| `NODE_ENV` | — | همان سخت‌گیری روی درگاهِ `redis.ready()`/`/api/health` (قراردادِ پیشین) |
| `REDIS_URL` | — | در production الزامی؛ در dev ⇒ فال‌بکِ حافظه |
| `PAYESH_SHUTDOWN_TIMEOUT_MS` | `10000` | مهلتِ drain در Graceful Shutdown |
| `PAYESH_BACKUP_EVERY_HOURS` / `_MS` | خاموش | بکاپِ خودکارِ دوره‌ای (unref — خروج را نگه نمی‌دارد) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | شنیدار — برایِ چند-نسخه هر نمونه پورتِ جدا (یا Service کوبرنَت) |
| `PAYESH_BEHIND_PROXY` | — | `1` = پشتِ TLS reverse-proxy (fail-fastِ TLS نمی‌زند) |
| `PAYESH_TEST_SLOW_MS` | خاموش | **فقط-تست**: مسیرِ `/api/__slow` برایِ اثباتِ قطعیِ drain (`tests/wave15-health.js` S2) — در production هرگز تنظیم نشود |

## ۷. چک‌لیستِ پیش از rollout

- [ ] `curl /api/readiness` روی نمونهٔ جدید = 200 (با همان envِ productionِ واقعی: REDIS_URL، DATABASE_URL)
- [ ] `curl /api/health` — `db.alive` و `redis.alive` هر دو true؛ `queue.outbox` معقول
- [ ] `terminationGracePeriodSeconds` (یا `TimeoutStopSec`) > `PAYESH_SHUTDOWN_TIMEOUT_MS`
- [ ] بکاپِ تازهٔ store گرفته شده (rollbackِ داده ممکن است)
- [ ] `PAYESH_TEST_SLOW_MS` در envِ استقرار **نباشد**
- [ ] smoke در staging: `node tests/smoke.js` = 547/547

## ۸. تست‌ها

`tests/wave15-health.js` — ۱۰ بررسی (H1–H7 درون‌فرایند + S1–S3 فرایندِ فرزند با سیگنالِ واقعی):

| # | سناریو |
|---|---|
| H1 | liveness: 200 + live + pid + uptime (GET/HEAD) |
| H2 | readiness (dev): 200 + ready + گزارشِ db/redis |
| H3 | health: قراردادِ قدیمی دست‌نخورده + db/redis/queue/pool/cache/memory |
| H4 | `PAYESH_ENV=production` + بدونِ Redis ⇒ readiness **503** (liveness 200، health قراردادِ P0-13) |
| H5 | production + Redisِ زنده (fake) 200 → مرگِ runtime ⇒ 503 → dev ⇒ 200 |
| H6 | in-flight: ۴ درخواستِ هم‌زمان → شمارنده به صفر |
| H7 | POST liveness / `__slow` بدونِ env ⇒ 404 |
| S1 | child: SIGTERM بدونِ ترافیک → exit 0 + مارکرهایِ `[shutdown]` |
| S2 | child: SIGTERM در حینِ درخواستِ 1.5s ⇒ در‌حالت‌پرواز کامل شد + اتصالِ تازه reject + exit 0 |
| S3 | child: production + Redisِ مرده ⇒ fail-fast exit 1 + `[FATAL]` (استارت نشد) |
