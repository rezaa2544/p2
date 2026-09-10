# گزارش دور ۱۰۸ (چت ۳) — Wave 15: Health / Deployment

**تاریخ:** ۲۰/۰۶/۱۴۵ (2026-09-09)
**شاخه:** `arena/01a08545-p2`
**مأموریت (ناظر):** تکمیل endpointهایِ سلامت (Liveness/Readiness/Health) با رفتارِ صحیح، پیاده‌سازی Graceful Shutdown و مستنداتِ کاملِ استقرار (Rolling Deployment/Rollback).

---

## ۱. Audit وضعیتِ پیشین + ۳ شکافِ پیدا و رفع‌شده

| # | شکاف | وضعیتِ پیشین | رفع (این دور) |
|---|---|---|---|
| ۱ | **دو endpoint نداشتیم** | فقط `/api/health` (درگاهِ P0-13: `redis.ready()` ⇒ 200/503)؛ liveness/readiness نبودند | سه endpoint با **سه رفتارِ عمدی** (جدولِ بندِ ۲) — `liveness` عمداً وابستگی نمی‌بیند تا طوفانِ ری‌استارت نشود؛ `readiness` تشخیصِ دقیقِ «ترافیک بپذیرم؟» |
| ۲ | **health گزارش‌ده نبود** | بدنهٔ ۷ فیلد (ok/name/phase/time/version/pid/cache)؛ وضعیتِ DB/queue/pool/حافظه نامرئی | بدنهٔ کامل: `db{driver,alive,pool{total,idle,pending}}`، `redis{driver,alive}`، `queue{outbox,notify_pending,in_flight}`، `cache_l1`، `uptime_s`، `memory` — **کدِ وضعیت دست نخورد** (قراردادِ server1 S1 + server13 T2b/T3b در production) |
| ۳ | **Shutdown بی‌drain بود** | `SIGTERM/SIGINT → persistStore + db.close + redis.close + exit(0)` — بدونِ `server.close()`؛ درخواستِ در‌حالت‌پرواز **abort** می‌شد؛ `db.close`/`redis.close` در رویدادِ `exit` async بودند و هرگز به‌جا نمی‌رسیدند | توالیِ کاملِ Graceful Shutdown (بندِ ۳) + در‌حالت‌پرواز **کامل می‌شود** + exit handler فقط کارِ همگام |

## ۲. سه endpoint، سه رفتارِ عمدی

| Endpoint | 200 وقتی... | 503 وقتی... |
|---|---|---|
| `GET /api/liveness` | همیشه (فرایند زنده + event-loop پاسخ) — حتی در drain | هرگز |
| `GET /api/readiness` | store لود + pingِ DB + pingِ Redis — در dev فال‌بکِ حافظه قابل‌قبول | یک وابستگی ناکار / **در حینِ drain** (فوراً پس از SIGTERM تا LB ترافیکِ تازه نفرستد) |
| `GET /api/health` | درگاهِ P0-13 (قدیمی) | درگاهِ P0-13 (قدیمی) |

**قاعدهٔ ناظر (سفت، پیاده + تست‌شده):** `PAYESH_ENV=production` (یا `NODE_ENV=production`) + Redis قطع ⇒ `readiness = 503` — در استارت **و** حینِ پرواز. در استارت، درگاهِ سخت‌ترِ P0-13 زودتر می‌زند: فرایند اصلاً بالا نمی‌آید (`[FATAL]` + exit 1 — تست S3).

**توضیحِ دو درگاهِ production:** `/api/health` روی `NODE_ENV` (درگاهِ P0-13ِ پیشین — تغییرش قراردادِ server13 را می‌شکست: T2b production را با Redisِ memory-fallback استارت می‌کند و 200 می‌خواهد) و `/api/readiness` روی `PAYESH_ENV` یا `NODE_ENV` (سپکِ Wave 15). هر دو در `docs/DEPLOYMENT_GUIDE.md` مستند است.

## ۳. Graceful Shutdown (SIGTERM / SIGINT)

```
1) draining=true            /api/readiness ⇒ 503 (draining:true)
2) closeIdleConnections()   keep-aliveٔ خالی بسته می‌شوند
   server.close()           اتصالِ تازه ⇒ ECONNREFUSED
3) در انتظارِ in-flight     poll 50ms تا شمارنده = 0 (مهلت PAYESH_SHUTDOWN_TIMEOUT_MS، پیش‌فرض 10s)
4) seamِ worker             (این شاخه worker ندارد؛ تایمرِ بکاپ unref است)
5) persistStore() + db.close() + redis.close()
6) process.exit(0)
نگهبانِ زور: drain > مهلت + 2s ⇒ process.exit(1)  (غیرصفر = قرمز در مانیتورینگ)
```

- شمارشِ in-flight: `res.on('close')` — پس از flush کامل، حتی روی اتصالِ keep-alive (Node ≥ 15).
- بدونِ listener (تستِ درون‌فرایند) توالی کامل انجام می‌شود و exit 0.
- **حساسیتِ جهش (مهم برایِ بعد):** خط `if(BACKUP_EVERY_MS > 0) admin.startAutoBackup(BACKUP_EVERY_MS);` **verbatim** مانده — جهشِ M18 روی همین الگو است؛ پیشوندِ `backupTimer =` یک‌بار 17/20 را به 16/20 افتاند و برچیده شد.

## ۴. تغییراتِ کد

| فایل | تغییر |
|---|---|
| `server/index.js` | +146/−9: سه endpoint + `/api/__slow` (فقط-تست، env-gated) + درامشِ in-flight + `handleShutdown` + جایگزینیِ handlerهایِ قدیمی + `__drainForTests` |
| `server/cache.js` | `stats()` (L1 + single-flight) برایِ `/api/health` |
| `tests/wave15-health.js` | سوئیتِ تازه — 10 بررسی |
| `tests/wave15-child.js` | فرایندِ فرزند برایِ سیگنالِ واقعی (الگویِ server11-child) |
| `docs/DEPLOYMENT_GUIDE.md` | راهنمایِ کامل (تازه) |
| `docs/AI_PROMPT.md` §0.5.33 / `docs/ROADMAP.md` B.6 / `HANDOFF.md` | به‌روزرسانی |

## ۵. تست‌ها — `tests/wave15-health.js` (10/10 سبز)

**H1–H7 درون‌فرایند** (سرورِ واقعی روی پورتِ گذرا):
- H1 liveness: 200 + live + pid + uptime (GET/HEAD)
- H2 readiness (dev): 200 + ready + گزارشِ db/redis
- H3 health: قراردادِ قدیمی سالم (server1 S1) + گزارشِ کامل
- H4 **PAYESH_ENV=production + بدونِ Redis ⇒ readiness 503** (liveness 200، health قراردادِ P0-13)
- H5 production + Redisِ زنده (fake قراردادسازگار) 200 → **مرگِ runtime ⇒ 503** → dev ⇒ 200
- H6 in-flight: ۴ هم‌زمان → صفر
- H7 404s: POST liveness / `__slow` بدونِ env

**S1–S3 فرایندِ فرزند** (سیگنالِ واقعی):
- S1 SIGTERM بدونِ ترافیک → **exit 0** + مارکرهایِ `[shutdown] SIGTERM` / `clean` / `exit 0`
- S2 SIGTERM در حینِ درخواستِ 1.5s → در‌حالت‌پرواز **کامل شد (200)** + اتصالِ تازه **reject** + exit 0
- S3 production + Redisِ مرده → **fail-fast exit 1 + `[FATAL]`** (استارت نشد)

## ۶. گیت‌ها + رگرسیون

| گیت/سوئیت | نتیجه |
|---|---|
| `tests/smoke.js` | **547/547** ✅ |
| `tools/check-authz.js` | **0** ✅ |
| `tests/secret-scan.js` | **11/11** ✅ |
| `build.js --check` | rc=0 ✅ |
| `tests/wave15-health.js` | **10/10** ✅ |
| server1 / server13 / server17 | 31/31 · **9/9 (production)** · 70 ✅ |
| wave6-redis / wave11-cache | 22 ✅ · 20 ✅ |
| redis-fallback / otp-redis / lock-atomic | 10/10 · 16/16 · 12/12 ✅ |
| pull-bootstrap | 12/12 ✅ |
| server-mutations (زمینه) | **17/20 = بازهٔ پیشین** (M1/M14/M15 پیشین — بدونِ رگرسیون) |

## ۷. Commitها

| Commit | محتوا |
|---|---|
| `c707e12` | feat(wave15): health/liveness/readiness + graceful shutdown (core + تست‌ها) |
| `49da6cb` | docs(wave15): DEPLOYMENT_GUIDE + AI_PROMPT 0.5.33 + ROADMAP B.6 + HANDOFF |
| (این گزارش) | docs: گزارشِ دور ۱۰۸ |

**تأییدیهٔ پوش:** خروجیِ `git ls-remote origin arena/01a08545-p2` در پیامِ تحویلِ این گزارش آمده است (hashِ خودِ کامیتِ گزارش داخلِ فایل قابلِ ثبت نیست).

## ۸. نکات برایِ سوپروایزر

- **Worker:** این شاخه `server/worker.js` ندارد (outbox/worker در main است) — seamِ توقفِ worker در توالیِ shutdown آماده است؛ **بعد از merge این شاخه به main**، worker باید در همان seam (مرحلهٔ ۴) ایستاده شود.
- **`PAYESH_TEST_SLOW_MS`** فقط-تست است (default خاموش) — در envِ استقرار هرگز تنظیم نشود (در چک‌لیستِ DEPLOYMENT_GUIDE §7).
- **pending:** Redis/PGِ زنده در ساندباکس نیست — readiness/health با fake قراردادسازگار + fail-fastِ واقعی (پورتِ مرده) تست شده‌اند؛ پروب‌های k8s باید روی staging با envِ واقعی راستی‌آزمایی شوند.
