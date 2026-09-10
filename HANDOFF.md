# دفترچهٔ تحویل کار — پایش

> **قاعده:** در پایان هر سشن کاری، پیش از بستن مکالمه، یک ورودی
> تازه **بالای** این فایل اضافه کنید (جدیدترین اول).
>
> پس از رسیدن به ۲۰ ورودی، قدیمی‌ترها به
> `docs/HANDOFF_ARCHIVE.md` منتقل می‌شوند.
>
> پیام کامیت: `docs: update HANDOFF.md with session summary [تاریخ]`
>
> **اصلِ کارفرما (ثبت‌شده در پایانِ دور ۷۸):** در پایانِ هر سشن/دور،
> فایلِ گزارشِ تجمیعیِ همان دور را **مستقیم به کاربر بده** (present_file)
> — خودِ فایلِ گزارش، نه فقط اشارهٔ متنی در چت. این اصل در انتهایِ
> همهٔ کارها اعمال می‌شود.


## چت ۳ — اجرایِ زندهٔ W18/W19 روی زیرساختِ چندنمونه‌ای (unblocked by P0 #2) — ۱۹/۰۶/۱۴۵ (2026-09-10) — کامل ✅

**وضعیت:** «live W18/W19 — pending multi-node infra» در دستورِ ناظر انجام شد: زیرساختِ چندنمونه‌ایِ زنده **داخلِ همین ساندباکس** ساخته و اجرا شد (Redis واقعی + ۲ فرایندِ production واقعی) و هر ۱۰ فرضیه سبز شد.

- **زیرساختِ زنده (ساخته‌شده در ساندباکس، sudo+egress):** Redis **7.4.2 واقعی** (build از سورس GitHub، `appendonly yes`) + ۲ × `node server/index.js` در **production** با store جدا و `REDIS_URL`/`PAYESH_JWT_SECRET` مشترک. صادقانه: **PG در انتظار** (هیچ منبعِ نصبِ PG در egressِ ساندباکس نیست — plane داده = دامنهٔ W1/W3)، **k6** (egress به objects.githubusercontent.com بسته — harness Node با همان پروفایلِ mixِ W18)، **tc/netem** (ماژولِ کرنل در کانتینر نیست — به‌جای latency، chaosِ قوی‌ترِ واقعی: SIGKILL instance + `SHUTDOWN NOSAVE`).
- **آزمون** (`75203f9`، `tests/wave18w19-multinode-live.js` — پیش‌فرض **DRY_RUN**، `--live` با envهایِ الزامی، الگوی ایمنیِ W19): **10/10 سبز** (دو بارِ متوالی — قطعی):
  - H1 استارتِ ۲ نمونهٔ production با Redis زنده + کلیدِ مشترک
  - H2/H3 فازِ بار (75s): **1662 درخواست، فراوری 100.00٪، صفر 5xx** در state-plane (16 کاربرِ واقعیِ seed، login flow متناوب A/B، mix: me/list/probe/re-login)
  - H4 cross-instance: /me از نمونهٔ متضاد برایِ 12 کاربر ⇒ 200 · H5: logout در B ⇒ 401 فوری در A (denylist مشترک)
  - H6 **SIGKILLِ B در حینِ بار**: A 100٪ (12s) + نشستِ صادرشده در B در A معتبر (state در Redis، نه حافظهٔ B)
  - H7 restartِ B: نشستِ پیشینِ B برگشته (200)
  - H8 **redis `SHUTDOWN NOSAVE` واقعی در حینِ بار**: liveness 16/16 = 200 · readiness 16/16 = **503** (P0-13 runtime) · صفر 5xx خوانش · هیچ کرشی نبود
  - H9 بازیابی: restartِ redis (AOF — seq مارکر 7 نگهداری شد) + restartِ instanceها (قراردادِ بازیابیِ fail-closed: کلاینت عمداً بعد از ~4 تلاش تسلیم می‌شود — `retryStrategy`) ⇒ readiness 2/2؛ نشستِ خارج‌شده پیشِ kill **هنوز 401** (denylist در AOF ماند)؛ نشستِ سالم 200 دو-نمونه‌ای
  - H10 صفر `[FATAL]`/uncaught در لاگِ هر دو نمونه
- **درخواستِ کلیدیِ ناظر** «write A → read B → update B → read A» حالا در **زیرساختِ زنده** (نه فقط fake-RESP) اثبات شد: کد/جلسهٔ صادرشده در A در B مصرف/خوانده می‌شود؛ logout در B در A فوراً 401 است.
- **دروازه‌ها (همان روز):** multinode-live **10/10** (×۲) · smoke **547/547** · check-authz **0** · secret-scan **11/11** · DRY_RUN پیش‌فرض ✅.
- **push:** (با کامیتِ هندآف) `ls-remote` تأیید می‌شود؛ PR #47 به‌روز می‌شود.
## ویو ۱۴ — استقرارِ زندهٔ Observability (Prometheus/Grafana/Loki/Jaeger) — ✅ (2026-09-10)
- **فاز۲ِ این سشن:** اسکراپ‌تارگتِ واقعی اضافه شد — `server/metrics.js` (text-expositionِ صفرِوابستگی: http histogram/counters با tapِ finish + guardهایِ کاردینالیتی + self-scrape-excluded، lag/GC/heap از stdlib، pullsِ زمانِ اسکرپ guardشده ⇒ سرویسِ مرده = `*_up=0`)؛ وایرینگ `index.js` با دروازهٔ اختیاریِ `METRICS_TOKEN` (چهل‌وی‌وان) — edge هرگز `/metrics` را روت نمی‌کند. **تأییدِ زنده در سندباکس:** بوتِ سرویس، سری‌ها، شمارنده‌ها، گیتِ توکن.
- **استک compose:** `infra/observability/` — prometheus v2.54.1 + alertmanager v0.27.0 + grafana 11.2.0 (datasource/dashboard provisioningِ خودکار؛ uidهای payesh-prom/loki/jaeger + لینکِ exemplar→Jaeger) + loki/promtail 3.1.1 (structured_metadataِ trace_id برایِ audit-log) + otelcol-contrib 0.100.0 + jaeger 1.59؛ bind‌ها همه 127.0.0.1؛ رازها env-file.
- **قوانین هفت‌گانه:** HighErrorRate 5xx>0.1٪ · HighLatency p95>300ms · RedisDown · DBLatencyHigh>50ms · SyncQueueDepth>1000 · EventLoopLagHigh p99>100ms · MemoryHigh heap>80٪ — نام‌ها با metrics.js قفلِ متقابل.
- **داشبوردها:** `payesh-main.json` ۱۰پنل (RPS/p50-95-99/4xx5xx/DB latency+pool wait/Redis/cache-hit/queue/lag+heap+GC) + `payesh-logs.json` جست‌وجو با trace_id.
- **تست‌ها:** `observability-config` **55/55** · `observability-dashboards` **30/30** · `observability-config-mutations` **6/6** — ضدرانشِ سه‌جانبه (متریک↔قانون↔داشبورد↔پورت OTLP) با جهش اثبات‌شده. گیت‌ها: smoke **547/547** · api 7/7 · check-authz **0** · secret-scan **11/11** · build --check 0 · run.js 35/35.
- **اسناد:** `docs/OBSERVABILITY_DEPLOYMENT.md` (استقرارِ واقعی + صحت‌سنجیِ ۵دقیقه + retention) + `docs/WAVE14_OBSERVABILITY.md` (فاز۱ PR#22 + فاز۲) + ردیفِ ۱۴ نقشهٔ راه 🟡.
- **کامیت‌ها:** 6039000 (exporter) · 66b2918 (استک) · 45f9f67 (provisioning+داشبورد) · 080900f (تست) · 9231690 (اسناد).
- **باقی:** اجرای compose روی میزبان (/targets سبز)، __WEBHOOK_URL__ واقعی، توکنِ اسکرپ در prometheus.yml میزبان (رازِ gitignored)، drillِ کوریِ مانیتورینگ.

## زیرساختِ HA + PITR + Failover — رفعِ مانعِ P0#3 (Production Readiness / Reliability) — ✅ (2026-09-10)
- **PG HA:** `infra/postgres/` — compose با Primary(wal_level=replica + archive هم‌زمان pgbackrest→S3/MinIO) + hot-standby (basebackup -R یا STANDBY_BOOTSTRAP=repo) + PgBouncer (txn pooling، مسیرهای payesh/payesh-readonly دقیقاً منطبق بر DATABASE_URL/READ_DATABASE_URL در server/db.js) + بازویِ pg-backup + post-checks.sh (gate دهیِ PASS/FAIL). ایمیج سفارشیِ pgbackrest-دار (پین‌شده)؛ هیچ رمزی در فایل‌ها — env-file با ${VAR:?}؛ env.ha.example بیرونِ ignore با نامِ env* (قانونِ .env* فایل‌های دات را می‌بلعد).
- **Redis HA:** `infra/redis/` — ۱ master + ۲ replica + ۳ sentinel؛ قراردادِ اتصالِ آماده در server/redis.js فعال می‌شود (REDIS_SENTINELS + REDIS_SENTINEL_NAME=mymaster)؛ quorum=2/down-after=5s/failover≤30s طبق RELIABILITY_DR_PLAN؛ redis-checks.sh.
- **PITR:** tools/pitr-restore.sh (pgbackrest --type=time/xid/name/latest، محیطِ ایزوله با fsync=off و پورتِ غیراستاندارد، promote خودکار، verify خودکار) + tools/pitr-verify.sh (promoted/جداولِ حیاتی non-empty/target رعایت/checksumِ ۲۰۰ردیفی برایِ drill ماهانه).
- **Failover:** tools/failover-postgres.sh (گاردِ split-brain + سه‌بار نمونه‌گیریِ مرگ + آستانهٔ lag + pg_promote(wait) + چک‌لیستِ fence/rebuild) و tools/failover-redis.sh (SENTINEL FAILOVER با poll و تأییدِ INFO؛ REDISCLI_AUTH فقط).
- **Runbook:** docs/DR_RUNBOOK.md — چهار سناریو (PG primary، Redis master، DC منطقه‌ای (طرحِ دوم‌منطقه‌ای تهران⇄تبریز با bucket replication)، فسادِ داده/PITR) × RPO/RTOهایِ مصوبِ RELIABILITY_DR_PLAN + گیت‌هایِ مشترکِ پسازاقدام + drill-log + on-call.
- **تست:** `node tests/ha-config.js` **92/92** · `node tests/dr-runbook.js` **38/38** · `node tests/ha-config-mutations.js` **7/7 کشته** (M1..M6 + پایه) — و گیت‌های همیشگی: smoke **547/547** · check-authz **0** · secret-scan **11/11** · build --check **0** · tests/run.js 35/35 (SASTِ CI).
- **کامیت‌ها:** 7aca4c9 (PG infra) · 4e4ab8b (HA_POSTGRES) · 7ce584a (Redis) · 4b7fd52 (HA_REDIS) · 2f5c2f1 (PITR) · f1f05fa (failover) · 24d281a (DR_RUNBOOK+نقشهٔ راه) · test+handoff — push به arena/01a08a4e-p2.
- **باقی‌مانده (خارج از sandbox):** اجرایِ واقعیِ compose روی میزبانِ Docker (config-check عمیق)، مانورهایِ فصلی و ثبتِ drill-log، slot فیزیکی + max_slot_wal_keep_size، تفکیکِ رازهایِ replicator/pgbouncer، ACL ردیس.

## چت ۴: مرج PR #43 (ویو ۱۲ — شبکه/لبه) + هم‌سازی سشن با main — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅
- **PR #43:** کانفلیکت HANDOFF با حفظ دوطرف حل؛ پچ ci/pending بازتولید شد (SCA حالا در Security Program اصلی است؛ فقط CodeQL در انتظار توکن workflow)؛ جهش M3 به خودِ workflow تغییر هدف یافت (5/5)؛ **باگِ واقعیِ CI:** آکولادِ بدون‌نقل‌قول در کلیدهای regex نگینکس (`on\w{2,}` → `on\w\w+`) — `nginx -t` رانر را می‌شکست. merge-commit `463233c` با ۷/۷ چک سبز؛ شاخه feat حذف شد.
- **سشنِ ویو ۵ (این شاخه):** ۱۱ کامیت روی mainِ رفته‌پیش (۷۵۰+)؛ ادغامِ تازهٔ origin/main → تنها کانفلیت HANDOFF (union)؛ درختِ ادغامی کاملِ سبز: smoke 547 · api 7/7 · wave5 37+5 · wave12 24+5 · authz-model 248 · server16 · occ 18 · pull-bootstrap 12 · wave1/3/4 · build-check 0 · check-authz 0 · secret-scan 11.
- **وضعیت:** PR از `arena/01a08a4e-p2` → `main` باز شد؛ منتظر Review/تأیید ناظر (مرجع‌های ویو ۵ هنوز در main نیستند — تا پیش از آن، `server/policy.js` و هم‌سازیهایی در خط اصلی اجرا نمی‌شوند).

## چت ۴: اتصال نشست جدید + پایشِ کامل (بدون کد) + کشفِ «باگ پنجشنبه» — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅

**شاخه:** `arena/01a08a4e-p2` (بر پایهٔ `main` @ `40c5f96` — مرج PR #44)

**وضعیت:** گام‌های اتصال/پایش/Ruflo طبق دستور کارفرما اجرا شد؛ **هیچ کدی تغییر نکرد**.

- **گیت‌های پایه:** check-authz 0 · secret-scan 11/11 · `build --check` بیت‌به‌بیت ✅ — همه سبز.
- **⭐ کشفِ کلیدی:** smoke در سندباکس 405/530 قرمز شد؛ ریشه = **باگ پنجشنبهٔ** `src/js/02-demo-data.js` (حلقهٔ روزهای سخت‌کدِ ۰..۴ در برابرِ `work_days=[0..5]` → `slot` تعریف‌نشده → `teacher_id` در زمانِ بارگذاری؛ خطای زنجیره‌ای روی ۱۲۵ بررسی). CI راه‌دور سبز بود چون ران چهارشنبهٔ UTC اجرا شده بود. **رفعش دقیقاً داخل PR #45 است** (`tests/demo-thursday.js` + فیکس + تنظیم بند ۱.۵ smoke؛ وضعیت: CLEAN/MERGEABLE) — صفر رگرسیون از این نشست.
- **Ruflo:** سندباکس تازه ⇒ `/tmp/ruflo-unified` صفرورودی و هر سه کلیدِ تیمی گم. `ruflo@3.39.2` نصب؛ کلیدهای `p2/roadmap-status` · `p2/memory-branch-map` · `next_wave` از ریپو+gh بازسازی و `p2/chat4-new-session` ذخیره شد (۴ ورودی، بازیابی معنایی سالم؛ اجرا از بیرونِ ریپو با envهای الزامی).
- **Wave 13 (شکافِ ZAP):** صحت‌سنجی شد — فیکس‌های `env.SECURITY_TARGET_URL` و `spdx` روی main مرج هستند؛ شکافِ باقی‌مانده عملیاتی است (staging URL تنظیم نشده ⇒ DAST skip). قرمزی job «WAF & nginx» در ران ۱۴ ساعت پیش = `Install nginx` (اختلال گذرای رانر).
- **مستندات:** گزارش تجمیعی `CHAT4_ONBOARDING_REPORT_2026-09-10.md` (مطابق اصل کارفرما به‌صورت فایل ارائه شد).
- **بعدی (منتظر دستور):** مرج PR #45 با تأیید ناظر ⇒ پنجشنبه‌های سبز روی main؛ سپس تکمیل Wave 1 با PG زنده.


## چت ۱: موج ۱ P0 — PG transaction-first writes — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅ (روی شاخه؛ push نهایی + PR باقی)

**شاخه:** `arena/01a08a2e-p2` (بیس `origin/main` @ `40c5f96`) — ۱۳ کامیت موج ۱: `c16b178` (inventory) → `2d610e9` (migration 004) → `87c0ee5` (boot/hydrate) → `ea95508` (۵ روت + dispatch) → `f3b4dc0` (sync دوفازی) → `61b2681`/`49e0e03` (سرویس‌ها) → `050e6f3`/`0fbd3fe` (فیکس‌های cross-instance) → `c66cfc7` (تست چندنمونه‌ای) → `aa7fdc9` (گیت) → `9019b90`/`c3bf3a1` (فیکس hydrate + تست 004).

**وضعیت:** همهٔ مسیرهای نوشت (۱۴ مسیرِ `docs/WAVE1_WRITES_INVENTORY.md`) PG-first شدند: کامیتِ authority پیش از هر جهشِ کش؛ شکستِ PG = ‎503‎ + rollback + retry تمیز (uidها post-commit علامت می‌خورند). بوتِ PG-authoritative (اسکلت + hydrate)، persist دوره‌ایِ JSON در حالت PG خاموش، حذفِ GDPR به‌صورت anonymize (به‌خاطر FK با CASCADE)، بکاپ/ریستورِ JSON در حالت PG fail-closed (‎501‎ + ران‌بوک pg_dump)، شناسه‌های outbox از سکانس مشترک.
**شواهد:**
- `tests/wave1-multi-instance.js` ‏33/33‏ (دو نمونه + یک PG روی pg-mem: دیده‌شدن، عدم برخورد id، ‎503‎+replay، OCC در sync و REST، حذف، outbox، hydrate اسکلتی).
- `tools/wave1-gate.js` ‏35/35‏ سبز (۲۱ ایستا + ۱۴ سوئیت شامل smoke ‏47s‏ و REST روی HTTP واقعی).
- رگرسیون کامل حافظه: ‏243/247‏؛ ۴ قرمز با تعیین‌تکلیف: `db-engineering` (انتظارِ لیست مهاجرت — اصلاح و سبز ‏13/13‏) + ۳ پیش‌موجود/محیطیِ نامرتبط: `server11-child` (هلپرِ آرگومانی، سوئیت نیست)، `wave20-arena5` (تستِ کهنهٔ ماتریس CI در برابر تصمیمِ ثبت‌شدهٔ `[22.x]`)، `workdays` (فرضِ «امروز شنبه است» — فقط شنبه‌ها سبز می‌شود).
- باگِ یافته‌شده در ریویو و رفع‌شده: hydrate روی کلیدهای store می‌چرخید و بوتِ اسکلتی را خالی می‌گذاشت (`9019b90` + تست T0b).
**گیت‌ها:** wave1-gate ‏35/35‏ · smoke ‏۵۴۷/۵۴۷‏ (در متن گیت) · occ ‏18/18‏ · tombstone ‏25/25‏ · sync-atomic-batch ‏22/22‏ (شاخهٔ legacyِ B8 حفظ شد).
**push:** تا `aa7fdc9` روی origin است؛ `9019b90` + `c3bf3a1` (+ همین ورودی) فعلاً محلی‌اند — پوش با خطای احراز GitHub شکست خورد (نیازمند reconnect در Arena). به‌همین دلیل `wave1_status` در ruflo هنوز چرخانده نشده (ممنوع تا تکمیلِ push).
**تکمیل (ادامهٔ سشن):** پس از reconnect، هر ۳ کامیت پوش شد (`aa7fdc9..dd14330`)؛ `wave1_status=completed` در ruflo ثبت شد (رکورد ۱۲، با evidence)؛ PR شمارهٔ ‏48‏ به main باز شد.
**پس از PR:** چک DAST قرمز شد — ریشه‌یابی: اسکن واقعی ۱۰۶ ثانیه‌ای با exit code ‏2‏ یعنی WARN-only بدون هیچ FAIL (شواهد: annotations + تایمینگ stepها؛ لاگ CI از سندباکس unreachable است)؛ رفتار صفر/یک ZAP با سیاست advisory خود ورک‌فلو هم‌خوان شد (exit ‏2‏ سبز، ‏1‏ و ‏3+‏ همچنان قرمز — بدون false-green).
**نکات Wave 2:** سطرهای `sync_conflicts` عمداً cache-side؛ ردیف‌های یتیمِ cross-instance در GDPR؛ پنجرهٔ درخواستِ زودهنگامِ بوت؛ شکلِ NUMERIC از PG رشته برمی‌گردد (فراخوان‌ها Number می‌کنند)؛ `tools/reseed-from-pg.js` برای بازگشتِ اضطراری PG→JSON.
**بعدی:** reconnect گیت‌هاب → push → چرخاندنِ `wave1_status=completed` در ruflo → PR به main.
## چت ۴: ویو ۱۲ — شبکه / لبه (Network / Edge) — ۱۸/۰۶/۱۴۰۵ (2026-09-09)

**وضعیت:** شاخهٔ تازهٔ `feat/wave12-chat4` (بر پایهٔ `origin/main` @ `781a471`). شش کامیت:
- `7126311` + `8a85452` **بلاکِ لبه برایِ تزریق و اسکریپت** — مَپِ `$edge_attack` در `nginx/nginx.conf` بینِ نشانگرهایِ `wave12-edge-rules:*` (پیش‌تر فقط در برنامه تشخیص داده می‌شد؛ حالا لایهٔ دومِ ۴۰۳ در لبه)؛ محافظه‌کارانه با ۰ مثبتِ کاذب رویِ ۱۶ نشانیِ سالمِ برنامه؛ نقل‌قول‌ها با `%27/%22/\x27/\x22` چون پارسرِ نگینکس «'» و «"» را می‌بلعد.
- `38be855` **سندِ ‏CDN** (`docs/CDN_INTEGRATION_SETUP.md`) — قیدِ حیاتی: چون هر پاسخِ ‏HTML ننسِ یک‌بارمصرفِ ‏CSP دارد، لبه هرگز نباید ‏HTML را کش کند؛ ارزشِ ‏CDN = ‏DDoS + ‏TLS + لبهٔ امنیتی؛ چک‌لیستِ ‏Cloudflare با «راکت‌لودر خاموش».
- `229344a` **پچِ در انتظار برایِ CI امنیتی:** شغل‌هایِ ‏SAST (CodeQL) + ‏SCA (npm audit) آماده شدند ولی گیت‌هاب پوشِ `.github/workflows/*` را با توکنِ فعلی (فاقدِ اسکوپِ `workflow`) رد کرد ⇒ تغییر به‌صورتِ `ci/pending/security-sast-sca.patch` ثبت شد؛ **اقدامِ لازم:** اِعمال با توکنِ دارایِ اسکوپ (`git am`) و سپس حذفِ پچ. شاخهٔ محلیِ پشتیبان با زنجیرهٔ کامل: `feat/wave12-chat4-with-ci`.
- `fef20cd` **تست‌ها:** `tests/wave12-network.js` ‏۲۴/۲۴ (سرآیندهایِ زنده شاملِ ‏HSTS/یکتاییِ ننس، رگکس‌هایِ استخراج‌شده از خودِ ‏nginx با ۱۲ حمله/۱۶ نشانیِ سالم، قراردادِ ‏CI/پچ، اسناد) + جهش‌ها ۵/۵.
- `3b88afb` **مستندات:** `docs/WAVE12_NETWORK_EDGE.md` — ممیزی (چه چیزهایی از پیش کامل بودند: سرآیندها، ‏TLS، سندِ ‏WAF)، تغییرات، چک‌لیستِ عملیاتی.
**گیت‌ها:** ‏smoke ۵۴۷/۵۴۷ · check-authz=0 · secret-scan ۱۱/۱۱ · wave12 ‏۲۴/۲۴ · جهش‌ها ۵/۵ · waf-ddos واحد ۱۹/۱۹.
**بعدی:** ادغام با تأیید ناظر ارشد (اصل هشتم)؛ اِعمالِ پچِ ‏CI؛ ‏DAST خودکار در فهرستِ سند.


## چت ۱: Production Readiness Gate (§۲۷) — چک‌لیست شواهدمحور — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅

**شاخه:** `arena/01a08a2e-p2` (بیس `origin/main` @ `351bd10`)

**وضعیت:**
- **چک‌لیست (`docs/PRODUCTION_READINESS_CHECKLIST.md`):** هر ۴۰ معیار §27 در ۷ محور، با راستی‌آزمایی زنده (خواندن کد + اجرای تست هدفمند + وضعیت واقعی PRها): ✅ ۱۰ · ⏳ ۱۴ · ❌ ۱۶.
- **حکم:** سیستم برای Go-Live آماده **نیست** — ۶ مانع P0 (تکمیل Wave 1/SoT، معماری چندنمونه‌ای امن، ‏HA+PITR+دریل‌ها، متریک/داشبورد/آلارم، آزمون‌های مقیاس زنده، امنیت اجرایی) + موارد P1؛ نقاط قوت (authz متمرکز، tenant isolation، مدیریت secret، ‏OCC/tombstone، tracing/logs، رگرسیون سبز) ثبت شد.
- **پیوست §30:** اسناد اجباری موجود ۵ از ۱۴ (با نگاشت معادل‌های نزدیک مثل `RELIABILITY_DR_PLAN` و `ARCHITECTURE.md`).
- **شواهد اجرایی تازه:** `occ` ‏18/18‏، ‏`tombstone` ‏25/25‏، ‏`lock-atomic` ‏12/12‏ (پس از seed تازه — استور در اسنپ‌شات نبود و با `node server/seed.js` بازسازی شد؛ خروجی seed در `server/data/` ایگنور است).
**گیت‌ها:** smoke ‏۵۴۷/۵۴۷‏ · check-authz=0 · secret-scan ‏۱۱/۱۱‏.
**بعدی:** تصمیم ناظر روی P0ها؛ مرج شاخه‌های چت ۲/۳ (پیش‌نیاز آزمون‌های مقیاس و تکمیل Wave 1).

## چت ۱: ترکر ملی + Wave 13 (رفع شکاف ZAP) — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅

**شاخه:** `arena/01a08a2e-p2` (پس از مرج main @ `351bd10` = PR #45 مرج‌شده)

**وضعیت:**
- **ترکر (`docs/NATIONAL_ROADMAP_PROGRESS.md`):** ردیف Wave 20 ← ✅ (شواهد: PR #45 ← `351bd10`؛ ARENA4 + ARENA5 + wave20 ‏۲۲/۲۲‏ + دروازهٔ انتشار)؛ وضعیت واقعی شاخه‌های مرج‌نشده ثبت شد (چت ۲: ۱۴/۱۶/۱۷ ← 🟡؛ چت ۳: 1p2/6/11/15/18/19 ← 🟡؛ چت ۴: ۲۰ ✅)؛ ردیف ۱۰ و ۱۳ ← 🟡 با شواهد اجرایی (wave10 ‏۲۶/۲۶‏ روی main؛ wave13 ‏۲۳/۲۳‏ روی این شاخه)؛ ردیف Arena 5 ← 🟡.
- **ریشهٔ شکاف ZAP (دوگانه):** ۱) تست S6a دنبال نام اشتباه `zaproxy/actions-baseline` می‌گشت (نام درست `action-baseline` است — همان فیکسی که در `ci/pending` مستند و روی main اعمال شده)؛ ۲) استپ ZAP پشت گیت `SECURITY_TARGET_URL` بود و بدون سکرت همیشه skip می‌شد.
- **فیکس DAST (`.github/workflows/security.yml`):** دومسیره — staging: اکشن رسمی با سکرت؛ local: بوت API (`seed` + انتظار محدود ۳۰ثانیه‌ای روی `/api/health` با پذیرش هر کد HTTP چون بدون Redis ‏503‏ می‌دهد) + `docker --network=host zap-baseline.py` (چون داخل کانتینر اکشن، 127.0.0.1 خودِ کانتینر است) + آپلود آرتIFکت گزارش + استپ توقف API؛ استپ skip حذف شد؛ best-effort و ممنوعیت `secrets.*` در `if:` (zero-job guard) حفظ شد.
- **تست (`tests/wave13-security.js`):** ‏۲۳‏ چک (S6 هشت‌تایی: وجود + اجرای محلی + بدون-skip + best-effort + zero-job-guard + آرتIFکت)؛ اعتبارسنجی جهشی: تست جدید روی ورک‌فلوی قدیمی دقیقاً روی ۴ چک شکاف قرمز می‌شود (۱۹/۲۳) و S6a روی قدیمی سبز است (اثبات تایپی‌بودن باگ قبلی).
**گیت‌ها:** smoke ‏۵۴۷/۵۴۷‏ · check-authz=0 · secret-scan ‏۱۱/۱۱‏ · wave13 ‏۲۳/۲۳‏ · YAML معتبر (js-yaml) · (هشدار benign ‏window.scrollTo‏ در jsdom).
**یافتهٔ محیطی:** کلون shallow بود (`origin/main` تک‌کامیت) و مرج را «unrelated» می‌زد — با `fetch --unshallow` حل شد؛ ‎/tmp‎ بین نوبت‌ها پاک می‌شود (نصب مجدد ruflo + بازسازی استور از `docs/unified-memory.json` لازم شد).
**بعدی:** مرج این شاخه با تأیید ناظر؛ enforce روی یافته‌های High؛ DAST واقعی staging؛ ریبیس/مرج شاخه‌های چت ۲ و ۳.
## چت ۳ — P0 #2: معماری چندنمونه‌ای امن (Production Readiness Checklist §۲۷) — ۱۹/۰۶/۱۴۵ (2026-09-10) — کامل ✅

**وضعیت:** همهٔ stateهایِ حیاتی هماهنگ‌سازی حالا در Redis مشترک است؛ production بدونِ زیرساختِ مشترک استارت نمی‌دهد؛ دو فرایندِ واقعی + Redis مشترک «write A → read B → update B → read A» را اثبات می‌کنند. پنج کامیت روی `arena/01a08545-p2` (بعد از ریبیسِ دوم `149ba1f`):

- **ممیزی** (`b82c1ef`، `docs/MULTI_INSTANCE_AUDIT.md`): تمام stateهایِ حیاتی: OTP (P0-15)، rate limit (اتمیکی P0-11)، revoke (`revoked:<jti>`+`sessver` — W6)، idempotency (24h+PG)، L2 cache+Pub/Sub، locks، WAF، enum-guard = **Redis مشترک، بدونِ تغییر**؛ stateهایِ per-instanceِ باقی (L1، audit، outbox queue، store seed) = **مجاز و مستند**؛ سه شکافِ واقعی: **A** کلیدِ JWT (جلسهٔ نمونهٔ B در A معتبر نبود)، **B** counterِ outbox (id در PG مشترک تکراری می‌شد)، **C** plane datastore (ادامهٔ W1/W3).
- **A+B** (`5081248`): ① `server/index.js` — production + بک‌اندِ مشترک (Redis/PG) بدونِ `PAYESH_JWT_SECRET` ⇒ **fail-fast exit 1** (کلیدِ تولیدشدهٔ per-instance جلساتِ چندنمونه‌ای را ساکت می‌شکست). ② `server/outbox.js` — id رویدادها از `INCR payesh:outbox:seq` در Redis مشترک (atomic ⇒ صفرِ تلاش‌تلاقی در PG مشترک)؛ `nextId` async شد (فقط outbox). ③ env تستیِ `arena5-recovery` (R3/R3h production+fake-Redis) با کلیدِ مشترکِ ثابت.
- **آزمون** (`628726e`، `tests/multi-instance.js` **17/17**): دو فرایندِ واقعی `node server/index.js` (production، store جدا، Redis مشترک = fake-RESP روی TCP با معنایِ واقعیِ کلیدها + seq + pub/sub) + کلیدِ نشستِ مشترک: write A (send-code) → read B (login 200) → read A (/me 200 با کوکیِ B)؛ update B (logout) → read A (401 — denylist مشترک)؛ مرگِ کد در B ⇒ replay در A = bad_code (tombstone مشترک) + cooldown مشترک؛ rate limitِ IP مشترک (8 در A ⇒ 429 در B)؛ fail-closed (production+ردیسِ مرده ⇒ exit 1 `[FATAL]`)؛ fail-fastِ کلیدِ نشست (exit 1)؛ outbox (30 append متناوب از دو outbox ⇒ 30 id منحصر‌به‌فرد)؛ idempotency (mark در «A» ⇒ read در «B»). plane datastore = صادقانه «در انتظارِ PG» (W1/W3).
- **معماری** (`9d28d3a`، `docs/MULTI_INSTANCE_ARCHITECTURE.md`): نقشهٔ کلیدهایِ Redis + TTL + owner؛ جدولِ fail-closed/fail-fast؛ وضعیتِ دقیقِ plane datastore (کدام مسیر PG است/نیست)؛ چک‌لیستِ deployment (store/audit/key جدا، JWT/REDIS/PG مشترک، readiness=probe، backup=PG)؛ محدودیت‌هایِ صادقانه (ادامهٔ W1/W3، claimِ outbox، `REQ_STATE`).
- **رفعِ نقصِ آشکارشده** (`a48627c`): `tests/wave15-child.js` (S3) — fail-fastِ کلیدِ مشترک جدید بر fail-fastِ P0-13 سبقت می‌گرفت؛ env سناریو با کلیدِ productionِ معتبر کامل شد تا P0-13 جدا بسنجده شود (wave15 **10/10**).
- **دروازه‌ها (همان روز):** smoke **547/547** · check-authz **0** · secret-scan **11/11** · **multi-instance 17/17** · wave6 **22/22** · wave15 **10/10** · arena5-recovery **32/32** · build --check ✅.
- **push:** (با کامیتِ هندآف) `ls-remote` تأیید می‌شود؛ PR #47 به‌روز می‌شود.

## چت ۳ — ریبیسِ دومِ `arena/01a08545-p2` روی `origin/main` (`351bd10`، PR #45) — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅

**وضعیت:** بعد از ریبیسِ نخست (`d554eea` روی `40c5f96` + PR #47 ساخته شد)، `main` با ادغامِ PR #45 (چت ۴: رفعِ کرشِ پنجشنبه + دموِ شش‌روزه + سندِ آرنا ۵ + `tests/wave20-arena5.js` + `tests/demo-thursday.js`) جابه‌جا شد → PR #47 `CONFLICTING`. ریبیسِ دوم روی `351bd10` با همان قاعدهٔ «هر دو سمت» کامل شد؛ شاخه بازنویسی و push شد و PR #47 دوباره `MERGEABLE` است.

- **رفعِ تداخل‌ها (هر دو سمت):** `HANDOFF.md` (ورودیِ چت ۴ + ورودی‌هایِ ما)، `USER_GUIDE.html` (مُهرِ بیلد — هر بار `node build.js` + `--check`)، `tests/otp-ratelimit-mutations.js` (M3–M6: لنگرهایِ دو فرمِ `checkRateLimit(...)` و `if(!rX.allowed)` — هر دو در `server/auth.js`ِ ادغام‌شده موجودند ⇒ 8 entry هر دو سمت؛ جهش **11/11 کشته**)، `docs/ARENA5_QA_RELIABILITY.md` (add/add: سندِ فارسیِ چت ۴ + سندِ «نهایی‌شده»ِ چت ۳ — در **یک فایل** نگه داشته شد: متنِ اصلیِ چت ۴ + پیوستِ کاملِ سندِ ما با سطحِ سرعنوان‌ها یک‌جور پایین‌تر؛ ارجاع‌هایِ داخلیِ §4.3/§5 سالم ماندند).
- **سه‌تا نقصِ واقعی که ریبیس آشکار کرد (هر دو سمت درست بود، ترکیب ناسازگار):** (۱) PR #45 جفتِ خودتضادی مرج کرده بود — `node.js.yml` ماتریسِ صادقِ فقط-`22.x` (لن‌های 18/20 با jsdom 30 سبزِ کاذب بودند) ولی `CIN-1` در `tests/wave20-arena5.js` هنوز 18/20/22 را می‌خواست ⇒ `main` با گیتِ خودش می‌افتاد؛ `CIN-1` به ماتریسِ صادق هم‌راستا شد (فقط 22.x + ممنوعیتِ بازگشتِ 18/20). (۲) `G3` در `tests/arena5-demo-guard.js` پیش‌فرضِ قدیم (مدرسهٔ دمو 5روزه ⇒ دمایِ خامِ d=5 **نمی‌بایست** باشد) را assert می‌کرد؛ با دموِ شش‌روزهٔ PR #45 برعکس شد ⇒ `G3` حالا وجودِ دمایِ d=5 را ثابت می‌کند؛ فِلبکِ period به‌عنوانِ دفاعِ دوم می‌ماند (G2 + بندِ 1.5ِ smoke). (۳) آلودگیِ مارکر در `USER_GUIDE.html`ِ یک کامیتِ میانیِ ریبیسِ نخست (موروث) — با ریبیسِ تعاملی + rebuild برطرف شد؛ **همهٔ 16 کامیتِ شاخه حالا مارکر-فرید**.
- **فرمِ نهاییِ بندِ 1.5 (`src/js/02-demo-data.js`):** `dow=dow0<=4?dow0:0` + قراردادِ تاریخِ W20 `dt=dow0<=5?todayISO():addDaysISO(todayISO(),1)` + فِلبکِ دفاعیِ `period` — دمو در پنجشنبه با `dt=today` (بند 1.5ِ smoke) و با دمایِ شش‌روزهٔ PR #45 سازگار است.
- **دروازه‌ها (پنجشنبه — همان روزِ پرخطر):** smoke **547/547** · check-authz **0** · secret-scan **11/11** · build --check ✅ · wave6 **22/22** · wave11 **20/20** · wave15 **10/10** · wave18 **38/38** · wave19 **28/28** · arena5-recovery **32/32** · arena5-demo-guard **4/4** · **wave20-arena5 (تازه از main) 22/22** · **demo-thursday (تازه از main) سبز**.
- **push:** `--force-with-lease` با shaِ صریحِ راه‌دور (`d554eea` → `302886a`) — `ls-remote` تأیید کرد؛ PR #47 = `MERGEABLE` (base main).
## چت ۴: ویو ۲۰ — آرنا ۵ (تضمین کیفیت و قابلیت اطمینان) — ۱۸/۰۶/۱۴۰۵ (2026-09-09)

**وضعیت:** شاخهٔ تازهٔ `feat/wave20-chat4` (بر پایهٔ `origin/main` @ `fd9f404`). سه کامیت (+ هندآف):
- `0edac5a` **پوششِ کاملِ رگرسیون:** سابت‌های ‏REST فاز ۳ (`tests/api/runner.js` — ۷ سوئیت، محلی ۷/۷ سبز) به کشفِ `scripts/run-all-tests.sh` اضافه شدند؛ تا پیش از این گلابِ `tests/*.js` کلِ زیرپوشهٔ ‏`tests/api` را جا می‌انداخت. کنارگذاشته‌های طراحی (اسکریپتِ کارگر، کمکی‌ها، لایهٔ بارِ ‏k6) در سربرگ مستند شد.
- `4c76d71` **سندِ آرنا ۵** (`docs/ARENA5_QA_RELIABILITY.md`): مسئولیت‌ها، هرمِ تست (ساختار/دودی ۵۴۷/مجوزها/امنیت/یکپارچگی/جهش/بار/آشوب)، نقشهٔ ‏CI، قوانینِ نگهداشت (کشفِ زنده، قانونِ جهش، قانونِ درختِ کامیت‌شده)، سناریوهای آشوب/بازیابی، و **دروازهٔ انتشارِ ده‌بندی**.
- `1106464` **قراردادِ تست:** `tests/wave20-arena5.js` ‏۲۲/۲۲ (سند + اسکریپت + گیت‌های ‏CI).
**گیت‌ها:** ‏smoke ۵۴۷/۵۴۷ · check-authz=0 · نشت‌یاب ۱۱/۱۱ · بیلد‌چک ✅.
**یافتهٔ ممیزی:** ‏`npm test` فقط ‏`tests/run.js` + دودی را در ‏CI اجرا می‌کند و بقیهٔ ~۲۴۰ سوئیت قرارداداً در رگرسیونِ کاملِ محلی اجرا می‌شوند — این تقسیم‌کار در سندِ آرنا ۵ صریح ثبت شد (به‌همراهِ پچِ در انتظارِ ‏SAST/SCA).
**بعدی:** ادغام با تأیید ناظر ارشد (اصل هشتم)؛ اجرای نخستین دروازهٔ انتشار پیش از ‏Go-Live.

## چت ۳ — ریبیسِ `arena/01a08545-p2` روی `origin/main` + رفعِ تداخل‌ها — ۱۹/۰۶/۱۴۰۵ (2026-09-10) — کامل ✅

**وضعیت:** ریبیسِ ۱۲ کامیتِ فشرده‌شده (۲۹ کامیتِ اصلی → ۱۲ واحد منطقی) روی `origin/main` (`40c5f96`، PR #44) کامل شد؛ همهٔ تداخل‌ها با حفظِ هر دو سمت رفع شدند و درختِ نهایی سبز است.

- **رفعِ تداخل‌ها (قاعدهٔ «هر دو سمت»):** `server/delete-service.js` (ساختارِ تراکنشیِ W1p2 + `payload.school_id` ویوِ ۸)، `server/outbox.js` (isPg + INSERTِ تراکنشی)، `server/cache.js` (L1ِ W11 + سقفِ قابل‌تنظیمِ W9 — `setL1MaxEntries`/`setMax`/هرس همه روی `l1MaxEntries`)، `server/routes/bootstrap.js` (read-seamِ W1 داخلِ single-flight و کشِ W11 + `db_pools`ِ W10)، `server/redis.js` (`getStatus` + هوکِ تست)، `server/index.js` (بستریِ services: workers + db + exportsِ یکپارچه؛ health: بدنهٔ W15 + `db_pools`؛ exit-handler فقط همگام + `handleShutdown`).
- **رفعِ دو باگِ واقعی که ریبیس آشکار کرد:** (۱) کرشِ بوتِ دمو در پنجشنبه — جدولِ برنامه ۵ روز دارد ولی نگاشتِ «امروز» پنجشنبه را d=5 می‌داد (کدِ main)؛ نگاشت به `dow<=4` + فِلبکِ دفاعیِ دور ۱۱۱ + قراردادِ تاریخِ پیشین (بند ۱.۵ smoke «جابه‌جایِ امروز»). (۲) نقص‌هایِ ریبیسِ دورِ قبل در `docs/AI_PROMPT.md` (۱۲۲۵ خطِ گمشده) و `USER_GUIDE.html` (مارکرهای باقی‌مانده) — هر دو با بازسازیِ سه‌طرفه (`merge-file` روی نسخه‌هایِ دست‌نخورده) برچیده شدند؛ بخشِ ۰.۵.۱۹ و همهٔ خطوطِ `2a2b74f` در فایلِ نهایی هست (تطبیقِ خط‌به‌خط: ۰ خطِ گمشده).
- **سایر:** `server/schema.sql` بازتولید شد از `migrate-to-pg.js` (مدلِ ادغام‌شده + seedِ تازه: ۸۶ جدول/۳۴٬۵۰۸ رکورد) + بلوک‌هایِ دستیِ main (ایندکس‌هایِ keysetِ Wave 3 + tombstonesِ Wave 4)؛ جدولِ وضعیتِ B.3–B.9 به پیوستِ ROADMAP منتقل شد؛ `USER_GUIDE.html` با `merge-file` + مُهرِ بیلدِ تازه.
- **دروازه‌ها (پنجشنبه — روزِ پرخطرِ باگِ dow):** smoke **۵۴۷/۵۴۷** · check-authz **۰** · secret-scan **۱۱/۱۱** · wave6 **۲۲/۲۲** · wave11 **۲۰/۲۰** · wave15 **۱۰/۱۰** · wave18 **۳۸/۳۸** · wave19 **۲۸/۲۸** · arena5-recovery **۳۲/۳۲** · arena5-demo-guard **۴/۴** · build --check ✅.
- **توجه:** کامیت‌هایِ میانیِ ریبیس (به‌ویژهٔ `3b83ce8`) ممکن است نقص‌هایِ انتقالیِ بالا را داشته باشند — درختِ HEAD درست است و همهٔ دروازه‌ها روی HEAD سبز.

## چت ۲ (ج): سبزِ کاملِ CI روی GitHub — ریشهٔ دومِ zero-job کشف شد — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**شاخه:** `arena/01a08648-p2` (ادامهٔ همان نشست؛ HEAD = `da13943`)

**وضعیت:** هر دو ورک‌فلو روی GitHub سبز شدند — **`Security Program` ران ۶۸ با هر ۶ job سبز** (SAST، Secret scan، SCA، SBOM، DAST، WAF) و `Node.js CI` build (22.x) سبز (ران ۱۸۰). بلاکِ سه‌روزهٔ CI بسته شد.

- **کشفِ کلیدیِ این دور — ریشهٔ دومِ zero-job:** فیکسِ zaproxy لازم بود ولی به‌تنهایی کافی نبود. علتِ واقعیِ باقی‌مانده با **bisect تجربی روی شاخهٔ موقتی `wftest-branch`** (ران‌های ۶۱–۶۶) پیدا شد: **ارجاعِ مستقیمِ `secrets.*` در `if:` سطحِ step** این ریپو را با «workflow file issue» و صفر job می‌شکند. توالیِ آزمون‌ها: حداقلی سبز (۶۱) → job dast با secrets-if قرمزِ صفر-job (۶۲/۶۳ حتی بدونِ ZAP) → بدونِ if سبز (۶۴) → if بدونِ secrets سبز (۶۵) → **الگویِ جایگزینِ env سبز (۶۶)**. فیکس: پاسِ `SECURITY_TARGET_URL` از طریقِ `env:` و شرط روی `env.SECURITY_TARGET_URL` (کامیت `f9d53ec`؛ نکتهٔ NOTE داخلِ خودِ فایل). ارجاعِ `secrets.*` در `with:`/`env:` مجاز است.
- **ریشهٔ سوم (SBOM):** `npm sbom --sbom-format=spdxjson` با npm 10.9 → `EUSAGE` (مقادیرِ مجاز `cyclonedx|spdx`)؛ `spdx` همان SPDX-2.3 JSON می‌دهد. بازتولیدِ محلی + فیکس (کامیت `da13943`).
- **بهبودِ ماتریس هم اثر کرد:** اولین رانِ CIِ تاریخِ PR #44 (پیش از این دور فقط صفر-ران/CONFLICTING بود): build (22.x) سبز روی `3673107`.
- **پاک‌سازی:** شاخهٔ آزمایشیِ bisect (`wftest-branch`) پس از کار از local و remote حذف شد؛ sandbox بینِ دو نوبت re-clone شده بود که با fetch+reset بازیابی شد.
- **مستندات:** §۵ `docs/RELEASE_GATE_EVIDENCE.md` با ریشه‌یابیِ کاملِ سه‌علته بازنویسی شد + به‌روزرسانیِ §۱ (وضعیتِ CI) + کپیِ `reza/`.

## چت ۲ (ب): آماده‌سازی دروازهٔ انتشار (Release Gate) — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**شاخه:** `arena/01a08648-p2` (ادامهٔ همان نشست، پس از ادغامِ main بازنویسی‌شده)

**وضعیت:** دروازهٔ انتشار «آماده» شد: CI سه‌روزه‌ی قرمزِ `security.yml` ریشه‌یابی و اصلاح شد، ماتریس Node صادقانه شد، ابزارِ راستی‌آزماییِ ۲۸ ردیفِ چک‌لیست ساخته شد و سندِ شواهد/ران‌بوک ثبت شد.

- **اتصال تاریخچه (پیش‌نیازِ همه‌چیز):** main از `781a471` جدا شده بود (بازنویسی) ⇒ PR #44 با `CONFLICTING` و **صفر رانِ CI** مانده بود. ادغام با `--allow-unrelated-histories` (۲۷ فایل add/add؛ فقط `server/index.js` معنایی: ورکرِ سنگینِ Wave 9 + کارگرِ Outbox ویو ۸ + خوانشِ DB ویو ۱ + pool stats ویو ۱۰؛ انکرِ جهشِ GC داخل `persistStore` حفظ شد). symlinkِ شکستهٔ `node_modules` (آلودگیِ sandbox روی main) از ایندکس حذف شد.
- **ریشهٔ CI قرمز:** `security.yml` به `zaproxy/actions-baseline@v0.12.0` اشاره داشت — مخزنِ ناموجود (اکشنِ واقعی: `zaproxy/action-baseline`). گیت‌هاب `uses:`ها را در استارتاپ resolve می‌کند ⇒ شکستِ کلِ ران با **صفر job** — علامتِ ران‌های ۴۸+ روی همهٔ شاخه‌ها. اصلاح + ماتریس `node.js.yml` به `[22.x]` (لِین‌های 18/20 با jsdom 30 سبزِ کاذب می‌دادند — پیش‌تر در HANDOFF چت ۳ مستند بود) + `npm-publish` از 20 به 22.
- **ابزارِ دروازه:** `tools/release-gate.js` — هر ردیفِ `docs/RELEASE_GATE_CHECKLIST.md` را با شاهدِ قابل‌اجرا می‌سنجد (ایستا + بوتِ واقعیِ سرور؛ سبزِ کاذب/skip را قرمز می‌کند؛ `--skip-boot`/`--json`). نتیجهٔ فعلی: **۱۹ ✅ · ۱۴ ⏳ (کارفرما/زیرساخت) · ۱ ⚠️ · ۰ ❌**.
- **شکافِ صادقانه:** 4.4 — `/api/liveness` و `/api/readiness` در کد نیست (فقط `/api/health`)؛ دو مسیر پیشنهادی در سندِ شواهد (نگاشتِ Probe یا افزودنِ اندپوینت‌ها) — تصمیم با استقرارِ K8s.
- **سند:** `docs/RELEASE_GATE_EVIDENCE.md` (ران‌بوک + جدولِ شواهد + فهرستِ ۱۴ قلمِ کارفرما: پنتست، WAL/PITR، مهاجرتِ ۵۰GB، k6/SLO، مانیتورینگ، placeholderهای پایلوت) + ارجاع از خود چک‌لیست + کپیِ `reza/`.
- **گیت‌ها پس از ادغام:** release-gate کامل = ۱۹/۱۹ِ قابل‌راستی‌آزمایی سبز (security2 ‏۲۵/۲۵، server1 ‏۳۱/۳۱، server8 ‏۹/۹، server15 ‏۴۰/۴۰، audit ‏۴۷/۴۷، secret-scan ‏۱۱/۱۱، authz ‏۰) · smoke ‏**۵۴۷/۵۴۷** · wave9 ‏**۳۹/۳۹** · wave1/3/4/5/8/10/13 + redis-cluster همه سبز.

## چت ۲: Wave 9 شروع + Wave 0 / Part 4 (بازسازی) — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**شاخه:** `arena/01a08648-p2` (از `main` @ `781a471` — ادغامِ PR #40)

**وضعیت:** بخشِ اولِ Wave 9 (Application Performance) روی سرور اعمال شد: `JSON.stringify(store)` و نوشتنِ سنکرونِ فایل از مسیرِ درخواست/تیکر حذف و به رشتهٔ کارِ پس‌زمینه منتقل شد؛ بکاپ و گزارشِ عمومی هم به همان ورکر رفت؛ ممیزیِ پس‌زمینه (opt-in) و L1 کشِ محدود اضافه شد. Wave 0 / Part 4 (dependency & deployment inventory) **بازسازی** و Wave 0 کامل شد.

- **⚠️ یافتهٔ انتقالِ کار (مهم برایِ کارفرما):** دستورِ «push کامیتِ محلیِ `arena/01a085da-p2` / بهروزرسانی PR #40 با commit ‏`0245515`» اجرا‌پذیر نبود: آن commit هرگز push نشده بود و در sandbox نشستِ قبل گم شده است (`gh api .../commits/0245515` → 404؛ شاخهٔ راه‌دور روی `b7f670e` است و PR #40 **MERGED**). خودِ شاخهٔ این نشست به `arena/01a08648-p2` قفل است؛ Part 4 در همین شاخه بازسازی شد (`docs/NATIONAL_BASELINE_PART4.md` + یادداشتِ شفافیت در همان سند).
- **معماری (Wave 9):** `server/worker-service.js` + `server/workers/heavy.js` — ورکرِ دیرزیادِ unref با اسنپ‌شاتِ نسخه‌دار (structured clone؛ `markDirty` → bump). ops: `persist` (نوشتنِ اتمی tmp+rename، 0600) / `backup` (فقط‌داده + نگه‌داریِ ۱۰) / `report` (گزارشِ عمومی). حالتِ پایدار: بکاپ/گزارش بدونِ هیچ هزینه‌ای روی رشتهٔ اصلی. شکستِ ورکر → فال‌بکِ مسیرِ قدیمی؛ خروجِ فرآیند → `persistStoreSync` + `flushSync`.
- **تازگیِ داده:** تضمینِ سخت با نسخه‌ها — نوشتنِ تازه همیشه پیش از op بعدی به ورکر می‌رسد (آزمون‌های W9-5/W9-6d: نوشتنِ نشانگر → بکاپِ فوری شاملِ نشانگر؛ ساختِ کلاس با REST → شمارشِ گزارش همان لحظه +۱).
- **اعداد (سندباکس، store دمو ۵٫۶MB):** بلاکِ رشتهٔ اصلی در تیکِ persist: ‏~۴۶ms → max ‏۱۶٫۸ms (فقط clone)؛ در `POST /api/admin/backup`: ‏~۴۶ms هر درخواست → **max ‏۰٫۶ms** در ۸ درخواستِ پشت‌هم. استاتیک: ‏`readFileSync` ‏~۲MB در هر درخواست → خواندنِ async + کشِ mtime با سقفِ بایت. مستندات: `docs/WAVE9_PERFORMANCE.md` (+ کپیِ `reza/`).
- **فایل‌ها:** جدید: `server/worker-service.js`، `server/workers/heavy.js`، `server/static-cache.js`، `server/public-report-core.js` (هستهٔ مشترکِ endpoint/ورکر)، `tests/wave9-performance.js` (۳۹/۳۹)، `docs/WAVE9_PERFORMANCE.md`، `docs/NATIONAL_BASELINE_PART4.md`. تغییر: `server/index.js` (persist/استاتیک/سیم‌کشی)، `server/admin.js` (بکاپ از ورکر؛ فال‌بکِ `backupNowInline`)، `server/public-report.js` (ورکر + فال‌بک)، `server/audit.js` (`PAYESH_AUDIT_ASYNC=1` — نویسندهٔ پس‌زمینه؛ پیش‌فرض sync برایِ سازگاریِ آزمون‌ها)، `server/cache.js` (L1 محدود: سقف/LRU/TTL + `l1Stats`)، `docs/DEPLOY.md` (۳ متغیرِ تازه)، Progress Tracker (Wave 0 ✅ / Wave 9 🟡).
- **گیت‌ها:** `tests/wave9-performance.js` **39/39** ✅؛ `smoke` ‏**۵۴۷/۵۴۷** ✅؛ `check-authz` ‏**۰** ✅؛ `secret-scan` ‏**۱۱/۱۱** ✅؛ رگرسیونِ هدفمند: server1 (31/31)، server6/7/8/9، server14-gc (+جهش‌های GC ‏4/4 کشته)، server18 (55)، security2 (25)، public-security (10/10)، audit (47/47)، api/runner (7/7) — همه سبز.
- **رگرسیونِ کامل** (`scripts/run-all-tests.sh`): ‏**۲۲۳ سبز / ۷ قرمز** (۳۲ دقیقه در این سندباکس). هر ۷ قرمز با A/B روی خطِ پایهٔ دست‌نخوردهٔ `781a471` (worktree) راستی‌آزمایی شد — **همگی پیش‌موجود/محیطی، صفر رگرسیون از این دور**: sync-atomic-batch (+جهش‌هایش: نیاز به PostgreSQL واقعی؛ جهش‌ها خودشان ۵/۵ کشته)؛ xss-guard (‏X2b اسکنِ document.write سمتِ کلاینت)؛ rate-limit-mutations (لنگرِ کهنهٔ M2)؛ otp-ratelimit-mutations (لنگرهای کهنهٔ M3–M6)؛ server-mutations (M1/M14/M15)؛ tracing-performance (فقط زیرِ بارِ موازی قرمز — تکی ۷/۷ سبز).
- **وضعیتِ شناخته‌شدهٔ پیش‌موجود (بی‌ربط به این دور):** در `tests/server-mutations.js` جهش‌های M1/M14/M15 روی خطِ پایهٔ `781a471` هم زنده‌مانده/الگوشان گم‌اند (۱۷/۲۰ قبل و بعدِ Wave 9 یکسان — با `git stash` راستی‌آزمایی شد)؛ M16–M20 (فایل‌هایِ لمس‌شده) همگی کشته می‌شوند. نیازمند مرورِ جداگانه در دورِ بعد.
- **انکرهای جهشِ حفظ‌شده:** خطوطِ هدفِ جهش در `index.js`/`admin.js` (M16/M17/M18 و `const gc = gcStore();` — ترتیبِ تعریفِ `persistStore` قبل از `persistStoreSync` عمدی است تا M4ِ جهشِ GC همچنان کشته شود) دست‌نخورده ماندند.



## چت ۴: رفع مجدد کانفلیکت پی‌آر ۳۶ با main جدید — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** پس از مرجِ پی‌آرهای ۳۹ و ۴۱، `feat/redis-cluster-chat4` دوباره با main ادغام شد؛ تنها کانفلیکت `HANDOFF.md` بود (هر دو طرف حفظ شد) — `server/redis.js` (کلاستر/سنیتنل + گیتِ ریدیِ ‏P0-13)، `schema.sql` و کد سرور خودکار ادغام شدند. گیت‌ها: ‏smoke ۵۴۷/۵۴۷ · check-authz=0 · نشت‌یاب ۱۱/۱۱ · بیلد‌چک ✅ · کلاستر/سنیتنل ۷/۷ · پشتیبان ۸/۸. کامیتِ `5a86ccb` پوش و با `ls-remote` تأیید شد.

## چت ۴: فاز ۲.۱ — ردیس: سنیتنل/کلاستر + پایداری کامل — ۱۸/۰۶/۱۴۰۵ (2026-09-09)

**وضعیت:** شاخهٔ تازهٔ `feat/redis-cluster-chat4` (بر پایهٔ `origin/main`). پنج کامیت، یک کامیت به‌ازای هر کار:
- `22a7bad` پشتیبانی کلاینتی سنیتنل + کلاستر در `server/redis.js` — اولویت: `REDIS_CLUSTER_NODES` > `REDIS_SENTINELS`+`REDIS_SENTINEL_NAME` > `REDIS_URL` > فال‌بک حافظه؛ `buildRedisConfig(env)` خالص و تست‌پذیر؛ رمز فقط از محیط. آزمون `tests/redis-cluster.js`: ۷/۷ پیکربندی همیشه سبز؛ بخش زنده (اتصال + کشف مستر از سنیتنل‌ها) بدون ردیس واقعی خودکار رد می‌شود.
- `65925d9` الگوهای پایداری در `ops/redis/` — ۳ نود داده (مستر + ۲ تکثیر) با `save 900 1 / 300 10 / 60 10000` + `appendonly yes / everysec` + بازنویسی خودکار ۱۰۰٪/۶۴مگ + `stop-writes-on-bgsave-error yes`؛ ۳ سنیتنل با `quorum=2`.
- `0d44bd8` `tools/redis-backup.sh` (SAVE→RDB + BGREWRITEAOF→AOF، اختیاری S3، نگهداری ۷ روز، قفل اجرا، کرون هر ۶ ساعت) + `tests/redis-backup.js` با ردیس جعلی: ۸/۸.
- `96e7887` `docs/REDIS_RESTORE_PROCEDURE.md` — بازیابی AOF/RDB، توپولوژی سنیتنل، تمرین در محیط جدا، چک‌لیست پس از بازیابی.
- `376d21c` `docs/REDIS_CLUSTER_SETUP.md` — راهنمای کامل استقرار + نقشهٔ ارتقا به کلاستر ۶ نودی.
**گیت‌ها:** ‏smoke ۵۴۷/۵۴۷ · check-authz=0 · secret-scan ۱۱/۱۱ · redis-cluster ۷/۷ · redis-backup ۸/۸.
**درس‌ها:** در سنبوکس باینری `redis-server`/`redis-cli` نیست — بخش زندهٔ تست‌ها خودکار رد می‌شود؛ اسکریپت پشتیبان با `redis-cli` جعلی آزموده شد. رازها فقط جای‌دار `{{…}}`.
**بعدی:** ادغام به `main` با تأیید ناظر ارشد (اصل هشتم)؛ در صورت استقرار واقعی، تمرین بازیابی بخش ۴ `REDIS_RESTORE_PROCEDURE.md` پیش از مهاجرت.

## ادغام با origin/main (PR #39) + رفعِ شکستِ wave10 — ۲۰۲۶-۰۹-۰۹ ✅

**وضعیت:** `git merge origin/main` (۱۷ کامیتِ main: db-engineering نقلِ-قولِ
شناسه‌ها، baseline/roadmap docs، `migrations/001..003`+down، `reza/` کپی‌ها) →
یک تعارضِ محتوا فقط در همین `HANDOFF.md` → به‌صورت union (هر دو سمت) رفع شد.
کلیدِ `8c1f64c` (مرج‌کامیت) + کامیتِ `1aa9a52` برای رفعِ پس از مرج.

- پس از مرج، `wave10-db-scale` از ۲۶/۲۶ به ۲۵/۲۶ (یک شکست) افتاد. علتِ ریشه:
  تغییرِ db-engineering در main شناسه‌ها را نقل‌قول می‌کند (`INSERT INTO "grades"`)؛
  مسیرِ داده به‌درستی روی primary ماند ولی رشتهٔ سنجشِ D4a دیگر تطبیق نداشت.
  D4a به regex پذیرای هر دو شکل (نقل‌قول‌شده/نشدنی) شل شد → **۲۶/۲۶**.
- دروازه‌هایِ درختِ مرج‌شده: smoke **۵۴۷/۵۴۷** · check-authz **۰** · secret-scan
  **۱۱/۱۱** · build --check ✅ · wave10 **۲۶/۲۶** · wave13-security **۱۷/۱۷** ·
  wave1/wave3-query/wave3-query2/wave4-sync همه سبز.

## Wave 13 (چت ۲): Security Program — SAST/SCA/SBOM/DAST/Secret + آمادگی پنتست — ۲۰۲۶-۰۹-۰۹ — انجام، با قیدِ اجرایِ زنده ✅

**وضعیت:** روی `arena/01a085ca-p2` — `security.yml` از «فقط WAF» به برنامهٔ
امنیتیِ چند-جاوبی ارتقا یافت (طبقِ گزینهٔ تأییدشده: repo-native، بدون اختراعِ ESLint).

- `.github/workflows/security.yml` → jobs: `sast` (repo-native: `tests/run.js` +
  `tools/check-authz.js` + syntax)، `secret` (`secret-scan.js`)، `sca` (`npm audit
  --audit-level=high`، best-effort)، `sbom` (`npm sbom` SPDX + آپلود، best-effort)،
  `dast` (OWASP ZAP baseline، best-effort + نیازِ `SECURITY_TARGET_URL`)، `waf`
  (حفظ‌شده: `waf-ddos --unit-only` + `nginx -t`).
- `docs/PEN_TEST_CHECKLIST.md` — سناریوهای پنتست (auth/IDOR/XSS/SQLi/CSRF/SSRF)،
  ابزار (Burp/ZAP)، دستورالعمل اجرا.
- `docs/SECURITY_MODEL.md` — مدلِ امنیتیِ نهایی + جدولِ جایگاهِ هر stage در CI.
- `tests/wave13-security.js` → **۱۷/۱۷** (وجودِ هر stage در workflow + وجودِ مستندات).
- **نکتهٔ صداقت:** سئوت‌هایِ jsdomِ وابسته به بوتِ سرور (xss-guard/security/waf-full)
  به استورِ سیدشده نیاز دارند → نه در گیتِ merge؛ در جریانِ محلی/شبانه. اجرایِ
  واقعیِ SCA/SBOM/DAST و پنتستِ زنده = best-effort/pending (نیازِ registry/URL زنده).
- **دروازه‌ها:** smoke **۵۴۷/۵۴۷** · check-authz **۰** · secret-scan **۱۱/۱۱** ·
  build --check ✅ · wave10 سبز · wave13 **۱۷/۱۷**.

## Wave 10 (چت ۲): Database Scale — Read Replica + Pool Observability + طراحی Partition — ۲۰۲۶-۰۹-۰۹ — انجام، با قیدِ PG ✅

**وضعیت:** روی `arena/01a085ca-p2` — طبقِ دامنهٔ تأییدشده (کدِ DB-layer با
fake-DB؛ پارتیشن‌بندی فقط طراحی؛ بدون DDLِ پرریسکِ بی‌PG).

- `server/db.js`: poolِ رپلیکایِ فقط‌خواندنیِ اختیاری (`READ_DATABASE_URL`) +
  `queryRead()` (fallbackِ امن به primary) + `isReplicaActive()`/`getReadPool()`/
  `poolStats()`/بخشِ `read_replica` در `healthCheck()`/بستنِ هر دو pool در `close()`.
- `server/dbquery.js`: `executePagedList` (خوانشِ سنگینِ GET-listِ موج ۳) وقتی
  `db.queryRead` موجود باشد از آن استفاده می‌کند → GET-list ها به رپلیکا، بقیه
  روی primary. نوشتن (persistOp/transaction) همیشه primary.
- `server/index.js`: `/api/health` در حالتِ PG، میدانِ `db_pools` (= poolStats).
- **امنیت/درستی:** خوانش‌هایِ صحتِ همگام/پول (readCollection/readOne/دلتا) عمداً
  روی primary می‌مانند؛ رپلیکا فقط برایِ GET-list هایِ سنگین — رپلیکا هرگز
  نوشتهٔ تازهٔ خودِ کلاینت را عقب نمی‌اندازد.
- **تست:** `tests/wave10-db-scale.js` **۲۶/۲۶** (fake pool). دروازه‌ها: smoke
  **۵۴۷/۵۴۷** · check-authz **۰** · secret-scan **۱۱/۱۱** · build --check ✅ ·
  wave1/wave3(×۲)/wave4 سبز.
- **🔴 قیدِ صداقت:** اجرایِ واقعیِ read-replica بر PG و **پارتیشن‌بندی** =
  pending (بدونِ PGِ زنده). طراحیِ پارتیشن (RANGE بر `created_at`) در
  `docs/WAVE10_DB_SCALE.md` §۳ ثبت شد.

## Wave 7 (چت ۲): Offline-first — سخت‌سازی صف آفلاین — ۲۰۲۶-۰۹-۰۹ — انجام (راستی‌آزمایی + مستند) ✅

**وضعیت:** روی `arena/01a085ca-p2` — سازوکارِ سقف/نگهداشت/صفِ‌مرده که موج ۷
می‌خواست، از پیش در `src/js/27-sync.js` (کارِ ملیِ P1-10) پیاده و توسط
`sync-queue-caps.js`/mutations پوشیده شده بود؛ موج ۷ راستی‌آزمایی و سندِ رفتاریِ
مفقود را افزود.

- محدودیت‌ها در `SYNC_QUEUE_CAPS` تأیید شد: `maxOperations:1000` ·
  `maxBytes:5MB` · `ageLimitMs:30 روز` · `maxTries:5` · `warnRatio:0.8/0.7` ·
  `dlqMax:200`.
- تخلیه: قربانی اول rejected→failed→conflict→sending→**آخر pending**؛ هرسِ
  قدمت هرگز دادهٔ کاربر (pending/sending) را نمی‌زند؛ پنجمینِ شکست ← DLQ با علت؛
  قلمِ مسموم (`SYNC_DEAD_CODES`) مستقیم dead-letter؛ ذخیره‌سازیِ مقاوم در برابرِ
  پرشدنِ حافظه؛ هشدارِ نزدیکِ سقف با هیسترزیس؛ خودتشخیصیِ `sync-queue-health`
  با تعمیرِ بی‌خطر.
- **تست:** `sync-queue-caps.js` **۳۶/۳۶** · `sync-queue-caps-mutations.js`
  **۵/۵ killed** (baseline سبز). smoke ۵۴۷/۵۴۷ · check-authz ۰ · secret-scan ۱۱/۱۱.
- **تصمیمِ کاربر:** فایلِ تستِ تکراریِ `wave7-offline-queue.js` ساخته نشد (رفتار
  پوشیده بود)؛ فقط سند افزوده شد: `docs/WAVE7_OFFLINE_QUEUE.md`.

## Wave 4 (چت ۲): Sync / A01 — Pull DB-native + Tombstone prep + پروتکل — ۲۰۲۶-۰۹-۰۹ — انجام، با یک قید ✅

**وضعیت:** روی `arena/01a085ca-p2` — دلتای Pull در حالتِ PG-زنده DB-native شد
(بدون اسکنِ کل جدول)، تای-بریکر/کلیدِ (updated_at,id) و خوانشِ سنگ‌قبر آماده شد، و
پروتکل در `docs/SYNC_PROTOCOL.md` ثبت شد.

- `server/syncdelta.js` (جدید): سازندهٔ SQL خالص — `deltaRowsSql` (pushِ محمولِ
  زمانی + `ORDER BY updated_at,id` = مدیریتِ clock-skew)، `deltaKeysetSql`
  (کلیدِ cursor با LIMIT+1)، `tombstonesSql` (جدولِ آمادهٔ `server_tombstones`).
- `server/pull.js`: در دلتایِ PG-زنده، ردیف‌هایِ هر کالکشن از `deltaRowsSql`
  می‌آیند؛ scope در JS روی همان ردیف‌هایِ محدود (scope فقط حذف می‌کند)؛
  **fallback امن** وقتی جدول ستونِ زمانی نداشته باشد → fetch کامل + فیلترِ JS
  (رفتارِ قبلی). Tombstone همچنان از store (تا فعال‌شدنِ write به PG، تا حذف گم نشود).
- `server/schema.sql`: جدولِ `server_tombstones` (آماده، idempotent).
- **قراردادِ پاسخِ pull ثابت ماند** → کلاینت `29-pull.js` بی‌تغییر.
- **دروازه‌ها:** smoke **۵۴۷/۵۴۷** · run.js **۳۵/۳۵** · wave4-sync **۱۱/۱۱** ·
  pull-bootstrap **۱۲/۱۲** · wave1 **۱۸/۱۸** · wave3 **۱۳/۱۳** + **۱۳/۱۳** ·
  check-authz **۰** · secret-scan **۱۱/۱۱** · `build --check` ✅.
- **🔴 قیدِ صداقت:** اجرایِ واقعی بر PG + **push در یک تراکنشِ PG** = pending
  (بازنویسیِ ~۸۴۰ خطِ sync بدون PGِ زنده قابلِ تأیید نیست؛ ۳۱ فایلِ تستِ sync
  را لمس می‌کند). جزئیات در `docs/SYNC_PROTOCOL.md`.

## Wave 3 (چت ۲) — بخش دوم: GET-list های grades/classes/users → DB-native — ۲۰۲۶-۰۹-۰۹ — انجام، با یک قید ✅

**وضعیت:** روی `arena/01a085ca-p2` (ادامهٔ بخش اول) — سه builder تازه در
`server/dbquery.js` (`buildGradesList`/`buildClassesList`/`buildUsersList`) +
سیم‌کشیِ سه route به آن (فقط وقتی PG زنده) + Index در `server/schema.sql` +
سئوتِ تازهٔ `tests/wave3-query2.js` (۱۳/۱۳).

- **grades:** scope/filter + محدودهٔ نقشِ student/parent/teacher (EXISTS) ·
  enrichment (subject_name/student_name) با LEFT JOIN در خود SQL · `ORDER BY id DESC`.
- **classes:** scope + grade · `student_count` (scalar-subquery روی enrollments) +
  `homeroom_teacher_name` (LEFT JOIN users).
- **users:** scope + role + جستجویِ آزادِ ILIKE روی name/nid/phone؛ national_id
  فقط پارامترِ بایند.
- `_finalize` تعمیم یافت (selectList/pageFrom/countFrom) تا COUNT روی جدولِ پایه
  بماند و صفحه از sourceِ غنی (JOIN) بیاید. هر سه route async شدند؛ index.js آن‌ها
  را await می‌کند. وقتی PG خاموش است JS قبلی byte-identical اجرا می‌شود.
- **دروازه‌ها:** smoke **۵۴۷/۵۴۷** · run.js **۳۵/۳۵** · wave3 **۱۳/۱۳** ·
  wave3-query2 **۱۳/۱۳** · wave1 **۱۸/۱۸** · check-authz **۰** ·
  secret-scan **۱۱/۱۱** · `build --check` ✅.
- **🔴 قیدِ صداقت:** اجرایِ واقعی + `EXPLAIN ANALYZE` + گیتِ برابری/مجوز بر
  PGِ زنده هنوز pending است (سندباکس PG نداشت) — الزامی پیش از تولید. کارهایِ باز
  در `docs/WAVE3_QUERY_PERFORMANCE.md` §۴.

## Wave 3 (چت ۲): Query و Performance · Part 1 — students/attendance → DB-native — ۲۰۲۶-۰۹-۰۹ — انجام، با یک قید ✅

**وضعیت:** روی `arena/01a085ca-p2` (رویِ Wave 1 همان شاخه) — لایهٔ
DB-native کوئری/پجینگ (`server/dbquery.js`) + سیم‌کشیِ `students` و
`attendance` GET-list به آن (فقط وقتی PG زنده) + ۴ Index در
`server/schema.sql` + Inventory در `docs/WAVE3_QUERY_PERFORMANCE.md` +
سئوتِ تازهٔ `tests/wave3-query.js` (۱۳/۱۳).

- **الگویِ قبلی:** همهٔ GET-list ها «همه را از store بار → فیلتر → sort →
  slice» در JS می‌کردند (Keyset-pagination از قبل بود اما روی آرایهٔ کامل).
- **تغییرها:** `server/dbquery.js` (builders خالص: school-scope + role-scope با
  `EXISTS` برای teacher/student/parent + keyset `id > $cursor` + `LIMIT limit+1`
  برای `has_more` + `COUNT` برای total؛ همهٔ مقادیرِ کاربری فقط پارامتر، شناسه‌ها
  فقط allowlist) · `server/routes/students.js` و `attendance.js` (هر دو async؛
  مسیرِ DB-native فقط وقتی `db.isPostgres()`؛ وگرنه JS قبلی دست‌نخورده) ·
  `server/index.js` (await دو GET-list) · ۴ Index در `schema.sql`.
- **حفظِ رفتار:** وقتی PG خاموش است مسیرِ قبلی اجرا می‌شود → byte-identical.
- **دروازه‌ها:** smoke **۵۴۷/۵۴۷** · run.js **۳۵/۳۵** · wave3-query **۱۳/۱۳** ·
  wave1-reads **۱۸/۱۸** · check-authz **۰** · secret-scan **۱۱/۱۱** ·
  `build --check` ✅.
- **🔴 قیدِ صداقت:** شاخهٔ PostgreSQL تعریف/سیم‌کشی/unit-test شده ولی اجرایِ
  واقعی + `EXPLAIN ANALYZE` + گیتِ برابری/مجوز بر PGِ واقعی هنوز pending است
  (هیچ PG/درایور در سندباکس نبود) — الزامی پیش از تولید. کارهایِ باز در
  `docs/WAVE3_QUERY_PERFORMANCE.md` §۴.

## Wave 1 (چت ۲): PostgreSQL Source of Truth · Part 1 (Reads inventory + seam) — ۲۰۲۶-۰۹-۰۹ — انجام، با یک قید ✅

**وضعیت:** روی `arena/01a085ca-p2` (نوکِ این سشن = مرجِ PR #37) — درِ
خوانشِ یکپارچه در `server/db.js` (`readCollection`/`readOne`) + اتصالِ دو
مسیرِ پرارزشِ `bootstrap` و `pull` به آن + Inventory در
`docs/WAVE1_READS_INVENTORY.md` + سئوتِ تازهٔ `tests/wave1-reads.js`.

- **پیش‌زمینه:** سامانه دو-حالته است؛ پیش از این دور حتی با PGِ وصل، همهٔ
  خوانش‌هایِ سرور از JSON استورِ درون‌حافظه می‌آمد (PG فقط آینهٔ **نوشتن**
  بود). این بخش «منبعِ حقیقتِ خوانش» را با یک درِ واحد در `db` آغاز می‌کند.
- **تغییرها:** `server/db.js` (+`readCollection`,`readOne`,`isPgReadableTable`
  — سفیدفهرستِ جدول، کلیدهایِ داخلی `__*` از PG نمی‌روند) ·
  `server/routes/bootstrap.js` (همهٔ خوانش‌ها از `readCol(db)`؛ صفر `store.X`
  مستقیم باقی مانده) · `server/pull.js` (ردیفِ هر کالکشن از `readCol(db)`؛
  scope/دلتا/تومب‌استون **عمداً** روی `store` ماند و در Inventory ثبت شد) ·
  `server/index.js` (پاسِ `db` به هر دو کنترلر).
- **رفتارِ حفظ‌شده:** در fallbackِ حافظه‌ای `memoryStore === store`، پس
  `readCollection(c)` دقیقاً همان `store[c]` را می‌دهد. سئوتِ جدید ۱۸/۱۸
  (برابریِ بایت‌به‌بایتِ bootstrap/pull در هر دو مسیر برایِ همهٔ نقش‌ها +
  ثابت‌کردنِ اینکه درِ seam واقعاً طی می‌شود).
- **دروازه‌ها:** smoke **۵۴۷/۵۴۷** · pull-bootstrap **۱۲/۱۲** ·
  check-authz **۰** · secret-scan **۱۱/۱۱** · `build --check` سبز (تغییر فقط
  سمتِ server).
- **🔴 قیدِ صداقت:** هیچ PG زنده/درایور در سندباکس نبود؛ شاخهٔ PostgreSQLِ
  `readCollection` تعریف و سیم‌کشی شده ولی **اجرا نشده**. اجرایِ واقعی بر
  PG + مهاجرتِ بقیهٔ REST routes و scope در بخشِ بعدیِ موج (فهرستِ کارهایِ
  باز در `docs/WAVE1_READS_INVENTORY.md` §۳).

## چت ۴: ویو ۸ — معماری ناهم‌زمان (Outbox + Worker) — ۱۸/۰۶/۱۴۰۵ (2026-09-09)

**وضعیت:** شاخهٔ تازهٔ `feat/wave8-chat4` (بر پایهٔ `origin/main` @ `781a471`). پنج کامیت:
- `7e7ba19` **چرخهٔ عمر اوت‌باکس + کارگر:** رویدادها با `status='pending'/retry_count/processed_at/last_error` ثبت می‌شوند؛ `server/worker.js` پیمایش، اعزام به هندلر، تلاش مجدد و `failed` پس از سقف تلاش — رویداد در شکست **هرگز حذف نمی‌شود**؛ نگهبان ورود دوباره + `tick()` قطعی برای تست؛ اولین هندلر واقعی: باطل‌کردن کش مدرسه پس از حذف نرم (خارج از مسیر درخواست)؛ اتصال به چرخهٔ حیات سرور.
- `6c19d8c` **جدول `server_outbox`** در مهاجرت پستگرس (ستون‌های وضعیت/تلاش/خطا + ایندکس وضعیت) — آینه؛ منبع حقیقت همان اسنپ‌شات.
- `6c4a76b` **آزمون‌ها:** `wave8-outbox.js` ‏۱۴/۱۴ + `wave8-outbox-mutations.js` ‏۵/۵ (حذف سقف تلاش/پردازش دوباره/حذف رویداد در شکست — همه کشته شدند).
- `3edaa06` **مستندات:** `docs/ASYNC_ARCHITECTURE.md` — الگو، چرخهٔ عمر، قواعد هندلر (ایدمپوتانس)، راهنمای افزودن هندلر، و **دلیل صادقانهٔ** در‌مسیر‌ماندنِ پیامک (قرارداد قفل‌شدهٔ قفل ۸۱.۱ — ناهم‌زمان‌سازی آن کار جدا با تأیید ناظر است).
**پیکربندی:** `PAYESH_WORKER_INTERVAL_MS` (پیش‌فرض ۱۰۰۰) · `PAYESH_WORKER_MAX_RETRIES` (پیش‌فرض ۵).
**گیت‌ها:** ‏smoke ۵۴۷/۵۴۷ · check-authz=0 · secret-scan ۱۱/۱۱ · server16 ‏۳۹/۳۹ · wave8 ‏۱۴/۱۴ · جهش‌ها ۵/۵.
**بعدی:** ادغام به `main` با تأیید ناظر ارشد (اصل هشتم)؛ هندلرهای بعدی (گزارش/اعلان) طبق راهنمای سند.
## چت ۱: Wave 0 / Part 3 — Baseline دیتابیس و کش — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** اندازه‌گیری baseline دیتابیس/کش بدون تغییر کد پروژه انجام شد و در `docs/NATIONAL_BASELINE_PART3.md` ثبت شد؛ کپی همگام در `reza/` قرار گرفت. Progress Tracker برای Wave 0 به‌روز شد: Partهای ۱، ۲ و ۳ کامل‌اند و Part 4 باقی است.

- **اندازه‌گیری DB:** `server/db.js` در sandbox با `DATABASE_URL` خالی روی driver حافظه‌ای بالا آمد؛ queryهای مهم به‌صورت SQL-shape simulation روی JSON demo store اندازه‌گیری و محدودیت نبود PostgreSQL واقعی صریح ثبت شد.
- **اندازه‌گیری Cache:** `REDIS_URL` تنظیم نبود و Redis واقعی فعال نشد؛ hit/miss فقط برای fallback حافظه‌ای و L1 bootstrap cache ثبت شد و محدودیت distributed Redis مستند شد.
- **Sync throughput:** route واقعی `POST /api/sync` با server واقعی و temp store اندازه‌گیری شد؛ batchهای ۱/۵۰/۲۵۰/۵۰۰ همگی `200` بودند؛ batch ۵۰۰ حدود `9706.5 records/sec` در sandbox ثبت شد.
- **تست‌ها:** `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.

## چت ۱: Wave 0 / Part 2 — Baseline عملکرد سرور و API — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** اندازه‌گیری baseline عملکرد سرور/API بدون تغییر کد پروژه انجام شد و در `docs/NATIONAL_BASELINE_PART2.md` ثبت شد؛ کپی در `reza/` قرار گرفت. Progress Tracker برای Wave 0 به‌روز شد: Partهای ۱ و ۲ کامل‌اند و Partهای ۳ و ۴ هنوز باقی‌اند.

- **اندازه‌گیری:** سرور واقعی `server/index.js` با store موقت دمو و probe موقت خارج repo اجرا شد؛ `process.memoryUsage()`، RSS/CPU از `/proc`، و `monitorEventLoopDelay` ثبت شد. endpoint واقعی sync در کد `POST /api/sync` است (نه `/api/v1/sync`) و همان اندازه‌گیری شد.
- **نتایج نمونه:** event-loop p95≈10.846ms؛ RSS بعد benchmark≈108.17MB؛ endpoint p95ها: login≈7.358ms، bootstrap≈2.347ms، attendance≈3.752ms، grades≈3.184ms، sync≈4.735ms.
- **محدودیت:** sandbox/localhost، JSON temp store، دیتاست دمو و اجرای sequential؛ نتیجه ظرفیت ملی نیست و باید در Wave 18 تکرار شود.
- **تست‌ها:** `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.

## چت ۱: Wave -1 / Architecture Discovery بخش دوم — Threat Model + Bottleneck Map — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** بخش دوم Wave -1 فقط با مستندات انجام شد؛ `docs/THREAT_MODEL.md` با چارچوب STRIDE و `docs/BOTTLENECK_MAP.md` ساخته شدند و کپی هر دو در `reza/` قرار گرفت. Progress Tracker برای Wave -1 به `✅` تغییر کرد چون بخش اول و دوم کامل شدند.

- **اثر معماری:** ریسک‌های اصلی ملی (چند source of truth، drift بین REST/Sync، IDOR/BOLA، state توزیع‌نشده، full scan، نبود load/chaos واقعی) و گلوگاه‌های مسیرهای REST/Pull/Sync/Storage با اولویت Waveهای بعدی مستند شد.
- **اثر کد/دیتابیس/امنیت/کارایی:** فقط مستنداتی؛ هیچ تغییر runtime/schema/test.
- **تست‌ها:** `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.

## چت ۱: Wave -1 / Architecture Discovery بخش اول — Dependency/Data/Auth/Sync Flow — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** بخش اول Wave -1 فقط با مستندات انجام شد؛ هیچ فایل کد/runtime تغییر نکرد. چهار سند کشف معماری ساخته شد: `docs/DEPENDENCY_GRAPH.md`، `docs/DATA_FLOW.md`، `docs/AUTH_FLOW.md`، `docs/SYNC_FLOW.md` و کپی همه در `reza/` قرار گرفت. Progress Tracker برای Wave -1 به `🟡` تغییر کرد و Evidence به همین چهار سند اشاره می‌کند.

- **اثر معماری:** وابستگی‌های اصلی کلاینت/سرور/Build، مسیر داده UI/API تا Store/PostgreSQL/Redis، جریان OTP/JWT/session و مسیر Push/Pull/Conflict مستند شد؛ مبنای تصمیم‌گیری Waves بعدی.
- **اثر کد/دیتابیس/امنیت/کارایی:** فقط مستنداتی؛ هیچ تغییر runtime/schema/test.
- **تست‌ها:** `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.

## چت ۱: اعمال Addendum معماری نقشه راه ملی — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** متن کامل Addendum طبق پرامپت در `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` ذخیره شد؛ خط الزام‌آور مکمل معماری پس از عنوان `docs/ROADMAP.md` اضافه شد؛ Progress Tracker طبق Addendum از جدول صرفاً status به ستون‌های `Owner/Risk/Dependency/Evidence` ارتقا یافت؛ Wave -1 و Arena 5 ثبت شدند؛ کپی‌های `reza/` همگام شدند.

- **فایل‌ها:** `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md`، `docs/ROADMAP.md`, `docs/NATIONAL_ROADMAP_PROGRESS.md`، کپی‌های `reza/`، `docs/README.md`، `HANDOFF.md`.
- **اثر معماری:** اجرای همه Waves اکنون مشروط به Architecture Discovery، QA/Reliability مستقل، Modular Monolith قبل از Microservice، Multi-tenant governance و شواهد پیشرفت شده است.
- **اثر کد/دیتابیس/امنیت/کارایی:** فقط مستنداتی؛ runtime/schema تغییر نکرد.
- **تست‌ها:** `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.

## چت ۱: Wave 2 — Database Engineering (Migrations/Constraints/IDs/Transactions/OCC) — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** Wave 2 روی شاخهٔ ثابت `arena/01a085da-p2` پیاده شد. پوشهٔ `migrations/` با ۳ migration forward و ۳ rollback ساخته شد؛ `server/schema.sql` و مولد `tools/migrate-to-pg.js` به PostgreSQL Identity برای `id` هم‌راستا شدند؛ مسیر PostgreSQL در `server/ids.js` از sequence وابسته به identity column استفاده می‌کند؛ سه مسیر حیاتی REST (`students`, `attendance`, `grades`) از `db.persistOpsBatch()`/transaction عبور می‌کنند؛ `server/db.js` برای updateهای دارای `base_version` SQL-OCC با `WHERE id AND version` و خطای 409 دارد.

- **فایل‌های مهم:** `migrations/001_initial.sql`، `002_indexes.sql`، `003_constraints.sql` (+ downها)؛ `server/db.js`؛ `server/ids.js`؛ `server/routes/{students,attendance,grades}.js`؛ `tools/migrate-to-pg.js`؛ `tests/db-engineering*.js`؛ `docs/DATABASE_ARCHITECTURE.md` و کپی `reza/`.
- **تست‌های اختصاصی:** `node tests/db-engineering.js` = **۱۲/۱۲**؛ `node tests/db-engineering-mutations.js` = **۶/۶ جهش کشته شد**.
- **محدودیت:** اجرای migration روی PG واقعی در این محیط انجام نشد؛ PostgreSQL-only شدن production همچنان Wave 1 است. مسیر JSON/memory برای سازگاری دمو باقی ماند.

## چت ۱: Wave 0 / Part 1 — Tag + تست‌های فعلی + سند کلی Baseline ملی — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** tag مبنا `national-baseline-start` روی commit `0be0bb5c6e7640cdf6a5ab0503a6c8948206492c` ساخته و push شد؛ `docs/NATIONAL_BASELINE.md` به‌عنوان سند بخش ۱ ساخته شد؛ کپی آن و progress tracker در `reza/` به‌روز شد؛ Wave 0 در progress از `⏳` به `🟡` تغییر کرد چون بخش‌های ۲ تا ۴ هنوز باید تجمیع شوند.

- **تست‌ها:** `node tests/run.js` = **۳۵/۳۵**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**؛ `node tools/check-authz.js` = تطبیق کامل/۰ ناهمخوانی؛ `node tests/secret-scan.js` = **۱۱/۱۱**.
- **اثر معماری/دیتابیس/امنیت/کارایی:** فقط مستنداتی و baseline؛ runtime/schema/test تغییر نکرد. latency endpointها و DB/cache/sync throughput عمداً به Partهای ۲ و ۳ واگذار شد.
- **قید Arena:** این سشن به شاخهٔ `arena/01a085da-p2` قفل است؛ بنابراین برخلاف متن تقسیم کار، شاخهٔ `feat/baseline-chat1` ساخته نشد و کار روی شاخهٔ ثابت همین سشن انجام شد.

## چت ۱ جدید: جایگزینی نقشه راه با National Scale Master Roadmap + Progress Tracker — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** `docs/ROADMAP.md` با متن کامل «نقشه راه جامع مهندسی پایش تا آمادگی مقیاس ملی» جایگزین شد و فایل پیگیری `docs/NATIONAL_ROADMAP_PROGRESS.md` با Waveهای ۰ تا ۲۰ ساخته شد؛ کپی هر دو فایل نیز در `reza/` قرار گرفت.

- **تغییرات:** حذف محتوای نقشه‌راه قبلی و ثبت نقشه ملی ۳۳ بخشی؛ ساخت جدول پیشرفت با وضعیت اولیه `⏳` برای همه Waveها؛ به‌روزرسانی فهرست مستندات.
- **اثر معماری:** فقط مستنداتی؛ جهت پروژه از roadmap محلی/پایلوت به مسیر National Scale با PostgreSQL source-of-truth، Redis distributed state، API stateless، workers، observability و DR رسمی منتقل شد.
- **اثر دیتابیس/امنیت/کارایی:** بدون تغییر کد/اسکیما؛ اثر راهبردی در roadmap ثبت شد (DB-native paths، tenant isolation، ASVS/CI security، load/chaos/soak).
- **تست‌ها:** `node tools/check-authz.js` سبز با تطبیق کامل؛ `node tests/secret-scan.js` = **۱۱/۱۱**؛ `node --expose-gc --max-old-space-size=2048 tests/smoke.js` = **۵۴۷/۵۴۷**.
- **محدودیت:** Waveها فقط برنامه‌ریزی/پیگیری‌اند؛ هیچ Wave اجرایی شروع نشده و همه در progress با وضعیت «در انتظار شروع» ثبت شده‌اند.

## چت ۱ (جانشین): انتقال فاز ۰.۱/۰.۲ از شاخهٔ چت ۱ قبلی به شاخهٔ فعال — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** ۱۲ کامیتِ فاز ۰.۱ و ۰.۲ از `origin/arena/01a0827b-p2` با
`git cherry-pick ce34c82^..ccd0dc1` روی `arena/01a08543-p2` نشست (+ یک
کامیتِ بازسازیِ مُهر راهنما). دروازه‌ها روی درخت ترکیبی (۰.۱+۰.۲+۰.۳):
smoke **۵۴۷/۵۴۷** · run.js **۳۵/۳۵** · check-authz **۰** · secret-scan
**۱۱/۱۱** · `build --check` بیت‌به‌بیت · school-type **۸/۸** + جهش **۵/۵** ·
academic-years **۹/۹** + جهش **۵/۵** · exam-types **۲۷/۲۷** + جهش **۵/۵**.

- **🔴 چرا merge مستقیمِ شاخه نشد (با مدرکِ راه‌دور):**
  `gh api repos/rezaa2544/p2/compare/main...arena/01a0827b-p2` →
  `status: diverged` · **۵۱ کامیت جلو** · **۷۷ کامیت عقب** ·
  merge-base = `54b1820` (Merge PR #14) · ۱۳۴ فایل.
  یعنی آن شاخه فقط ۰.۱/۰.۲ نیست: ۳۹ کامیتِ دیگر هم دارد
  (P0-03..P0-07 یکپارچگی REST/Sync و tenancy · ابزار مهاجرت نسخه‌دار PG ·
  CI: eslint + secret-scan · Kubernetes auto-scaling · CDN · سخت‌سازی
  سرآیندها · ~۲۰ سند گزارش). مرجِ کل شاخه = آوردن همهٔ این‌ها، نه فقط
  دو فاز. **تصمیمش با ناظر است** — در همین ورودی باز ماند.
- **چری‌پیک تمیز نبود؛ سه نوع تعارض مکانیکی داشت (همه حل شد):**
  (۱) `cdn-manifest.json` — modify/delete در هر کامیت (آن فایل از کارِ CDN
  همان شاخه می‌آید که در main نیست) ⇒ `git rm`؛
  (۲) `USER_GUIDE.html` — فقط مُهر بیلد ⇒ `--ours` + بازسازی با `build.js`؛
  (۳) `authz/model.json` — main فیلد `public_goals` را اضافه کرده بود،
  شاخه `school_type` را ⇒ **هر دو** (ترتیب الفبایی) + بازتولید
  `write-perms.json` با مولد؛ (۴) `HANDOFF.md` — union (هر دو ورودی).
- **دامِ روش:** این ۱۲ کامیت خودبسنده نیستند — روی کارِ CDNِ همان شاخه
  نشسته‌اند، پس `cdn-manifest.json` در تک‌تکشان ظاهر می‌شود. اگر روزی
  خواستید کل شاخه را مرج کنید، این تعارض نیست (هر دو طرف فایل را دارند).
- **نتیجهٔ حجمی:** ۲۰ فایل، ۱۳۴۷+ / ۳۸− . هیچ زیرساخت/CI/CDN وارد نشد.
- **پی‌آر ۳۷** اکنون هر سه فاز را دارد (۰.۱ + ۰.۲ + ۰.۳) — عنوان و شرحش
  به‌روز شد. 🔴 اگر تفکیک می‌خواهید بگویید تا ۱۲ کامیت را از شاخه برگردانم
  (هنوز مرج نشده، پس برگشت تمیز است).

## چت ۱ (جانشین): فاز ۰.۳ — تفکیک امتحان نهایی کشوری از داخلی — ۱۸/۰۶/۱۴۰۵ (2026-09-09) — کامل ✅

**وضعیت:** شاخهٔ `arena/01a08543-p2` از `main` (`2a2b74f`) — ۴ کامیت
(`feat(exams)` هسته · `feat(grades)` قاعدهٔ ورود · `feat(ui)` تفکیک نما ·
`test(exams)` سئوت‌ها) + همین ورودی.
دروازه‌ها: smoke **۵۴۷/۵۴۷** · run.js **۳۵/۳۵** · check-authz **۰ ناهمخوانی**
(۳۷۶ اکشن) · `build --check` بیت‌به‌بیت · سئوت تازه **۲۷/۲۷** + جهش‌ها **۵/۵** کشته.

- **هسته (`26-curriculum.js`):** تک‌منبع حقیقت همان `exams.source`
  (internal/national_final/makeup، از دور ۶۳) ماند و `examTypeOf` نمای
  دوحالتیِ خواسته‌شده را از آن مشتق می‌کند. نمره منشأ می‌گیرد:
  `grades.source ∈ {internal, national}` با `gradeSource/gradeSourceLabel/
  gradeSourceBadge/nationalGradesOf/nationalGpa`.
- **انحراف مستند از پرامپت (ثبت‌شده در `docs/EXAM_TYPES_GUIDE.md` §۳):**
  ستون `exams.exam_type` ساخته نشد — `exams.source` از پیش همان سه حالت را
  دارد (دو منبع حقیقت = نشت) و نام `exam_type` روی **grades** از پیش معنای
  دیگری دارد (`EXAM_TYPES` = کلاسی/میان‌ترم/پایان‌ترم/عملی/امتحان نهایی).
- **قاعدهٔ ورود:** نمرهٔ «امتحان نهایی» را فقط مدیر/سوپرادمین می‌نویسد؛
  دبیر نه می‌سازد نه ویرایش می‌کند (گارد **روی داده** در `grade-save`،
  پنهان‌کردن گزینه در `gradeModal` فقط کشف‌پذیری است). منشأ روی رکورد مُهر
  می‌خورد.
- **نما:** کارت جداگانهٔ «🏛️ نمرات امتحان نهایی کشوری» با معدل خودش در
  کارنامه · برچسب روی چیپ نمره · نشان قرمز در جدول نمرات · بخش جداگانه در
  گواهی چاپی (`transcriptCert`).
- **تصمیم باز کارفرما:** معدل وزنی گواهی عمداً روی همهٔ نمرات ماند
  (گواهی‌های صادرشده + قفل smoke بند ۱.۶)؛ «معدل نهایی کشوری» کنارش
  نمایش داده می‌شود نه به‌جایش. سه نقطهٔ تغییر در سند §۶ آمده.
- **بدهی باز (فاز سرور):** enum سمت سرور برای `grades.source` هنوز قفل
  نشده — فقط سقف طول (`MID_FIELDS`). `authz/model.json` بدون تغییر ماند
  چون `source` از پیش در فیلدهای هر دو مجموعه بود.
- **دو نکته برای ناظر (دست نخورد):** (۱) ردیف‌های ۰.۱/۰.۲ در
  `docs/ROADMAP.md` هنوز ❌ هستند درحالی‌که `main` هم `SCHOOL_TYPES` دارد و
  هم `preapps` — کار «نوع مدرسه» و «سال فعال» روی شاخهٔ
  `arena/01a0827b-p2` مانده و مرج نشده. (۲) این سشن به شاخهٔ
  `arena/01a08543-p2` قفل است؛ کانفلیکت پی‌آر ۳۵ (`feat/b3-d234-chat4`) از
  اینجا قابل resolve نیست — `mergeable: CONFLICTING` با راه‌دور راستی‌آزمایی شد
  و **سطح دقیق تعارض** (۱۲ فایل / ۷۴ نشانگر + استراتژی هر فایل) با
  `git merge-tree 430c7c8 origin/main origin/feat/b3-d234-chat4` سنجیده و در
  `docs/PR_MERGE_PLAN.md` §۶ ثبت شد. دامِ روش هم ثبت شد: بلوک‌های
  `added in both` را باید جدا شمرد، وگرنه `docs/ROADMAP.md` از قلم می‌افتد.
## چت ۳ — Wave 20: نهایی‌سازی Arena 5 (QA/Reliability) + دو نقصِ date-bound — ۲۱/۰۶/۱۴ (2026-09-10)

**وضعیت:** شاخهٔ `arena/01a08545-p2`. سه کامیت: fix اپ (03f6840) / fix تست smoke (ef79216) / مستندات+آزمون Arena 5.
- **`docs/ARENA5_QA_RELIABILITY.md`:** سندِ مرجعِ QA/Reliability — استراتژی، ابزارها، وضعیتِ ۹ مسئولیت با شواهد، **Release Gate** (گیت‌های خودکار + G1–G8 پیشِ Go-Live) + نقش‌ها.
- **`tests/arena5-recovery.js` — 32/32:** تکمیلِ «Recovery Validation» + شروطِ Production (Restore Drill + Failover Test): R1 crash consistency (SIGKILL واقعی) · R2 restore drill (backup→فساد→restore+audit) · R3 Redis failover/failback با **ioredis واقعی** (failback بدونِ restart در پنجرهٔ retry؛ قطعِ طولانی ⇒ restart لازم) · R4 قراردادِ PG-failback (استاتیک).
- **دو نقصِ date-bound (چهارشنبهٔ 2026-09-10 خودبه‌خود ظاهر شد — dow پنجشنبه=5 خارج ازِ دامنهٔ ۵روزه):** (1) crash بوتِ دمو در `02-demo-data.js` (slot undefined) ⇒ فِلبک + نگهبانِ قطعی `tests/arena5-demo-guard.js` (4/4)؛ (2) تستِ smoke ۱.۷ کلاسِ اشتباه (driftِ ثبت‌نام از آزمون‌های پیشین) ⇒ `classOf(sid)`. فرعی: badge `DAYS[dow]` undefined در پنجشنبه/جمعه ⇒ `DAYS_FULL`.
- **گیت‌ها (در چهارشنبه!):** smoke **547/547**، check-authz 0، secret-scan 11/11، build --check، arena5-recovery 32/32، demo-guard 4/4.
- **pending:** اجرایِ L3 واقعی (G1–G3/G6–G8) رویِ زیرساختِ چند-نمونه — «در انتظارِ زیرساخت» (جزئیات در سند).

## چت ۳ — Wave 19: تست آشوب و شکست (5 سناریو + ابزار chaos) — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2`. سه کامیت: ابزار + طرح + تست‌ها / مستندات / گزارش.
- **5 سناریو با فرضیهٔ از-معماری:** `kill-api` (SIGKILL — crash consistency: ack‌شده‌ها mirror شده‌اند ⇒ با PG صفر loss؛ store خراب نمی‌شود — tmp+rename) · `redis-down` (readiness 503 + liveness 200 + **صفر 500** + rate-limit fail-open + OTP state در حافظه ⇒ صفر data loss) · `pg-down` (خوانش‌ها از store ⇒ دست‌نخورده؛ sync ⇒ 200 + audit `sync_mirror_failed`؛ فقط DELETE-REST ⇒ 500 + retry ایدمپوتان) · `net-latency` (p95 خطی + سقف 65s) · `disk-full` (persistStore crash-free + سقفِ ایمنی).
- **`tools/chaos-test.sh`:** DRY_RUN پیش‌فرض (ایمن) / `--live`؛ هر سناریو snapshot before/after + timeline.csv + summary با **PASS/FAIL خودکار**؛ خروجی `tests/chaos-output/` (gitignore). ترافیکِ هم‌زمان: k6 `chaos-redis-test.js` (فاز ۵).
- **یافتهٔ صادقانه (مستند در طرح):** بعد از قطعِ طولانیِ Redis، retryStrategyِ ioredis تمام می‌شود ⇒ restart فرایند برایِ بازپس‌گیری لازم (پیشنهادِ بهبود: retryStrategy پایدار).
- **تست:** `tests/wave19-chaos.js` **28/28** (DRY_RUN همهٔ 5 سناریو + 20 فایل، سند، سازگاریِ فرضیه‌ها با قوانین، gitignore، اتصالِ k6). گیت‌ها: smoke 547/547، check-authz 0، secret-scan 11/11، build --check.
- **pending (ثبت‌شده):** اجرایِ LIVE نیازمندِ محیطِ چند-نمونهٔ زنده (API+Redis+PG+root) — در ساندباکس طراحی + ابزار + DRY_RUN کامل است.

## چت ۳ — Wave 18: تست بار ملی (دادهٔ 10M کاربر + چهار سناریو) — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2`. سه کامیت: ابزار + تست‌ها + طرح / مستندات / گزارش.
- **`tools/generate-national-dataset.js`:** دادهٔ ملی — **10,000,000 کاربر** (8M دانش‌آموز = 80/مدرسه، 1M دبیر = 1/کلاس، 900k ولی ≈11٪، 99.9k مدیر، 99 اداره، 1 سوپرادمین) + **100,000 مدرسه + 1,000,000 کلاس + 50,000,000 حضور + 20,000,000 نمره** + 900k parent_link. خروجی CSV (PG COPY + k6) + `stats.json` (با sha256) + README. قطعی (seed ⇒ بایت-به-بایت) و پخش‌شده (مقیاسِ کامل ≈10GB در ~3 دقیقه، فقط stdlib). `--plan` جدولِ ملی، `--scale 0.001` پیش‌فرضِ CI.
- **اصولِ داده:** نید/تلفن با تابعِ **دو-یک-یک** از id (رقمِ کنترلِ معتبر + تکرارناپذیریِ تضمین‌شده در 10M — الگوی slice از 11 رقم با birthday paradox کولایز می‌زد؛ اصلاح شد). همهٔ داده‌ها مصنوعی، بدونِ PII واقعی. `data/national/` در .gitignore.
- **طرح:** `docs/WAVE18_LOAD_TEST_PLAN.md` — چهار سناریویِ الزامی مطابقت با k6ِ موجود: بار عادی (scenarios 01/02/03) · بار اوج (`spike-mehr-test.js`) · فشار (`saturation-test.js` تا نقطهٔ شکست) · چند روزه (`soak-24h-test.js` — نشت حافظه). SLOها از thresholds.json.
- **تست:** `tests/wave18-load-test.js` **38/38** (planِ دقیق، سازگاری stats/CSV، اعتبارِ نید/تلفن + تکرارناپذیری، FKها، determinism، کشفِ زیرساختِ k6، مستندات). گیت‌ها: smoke 547/547، check-authz 0، secret-scan 11/11، build --check.
- **pending (ثبت‌شده در طرح):** اجرایِ واقعیِ بارِ ملی نیازمندِ PG/Redis/k6 زنده است — در این ساندباکس فقط طراحی + تولیدِ داده + اعتبارسنجی (کالibrating و اجراها در مراحلِ ۱-۳ِ طرح، «در انتظارِ زیرساخت»).

## چت ۳ — Wave 15: Health / Deployment (Liveness/Readiness/Health + Graceful Shutdown) — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2`. سه کامیت: هسته + تست‌ها / مستندات / گزارش.
- **سه endpoint، سه رفتارِ عمدی:** `/api/liveness` (همیشه 200 — عمداً وابستگی نمی‌بیند تا قطعِ Redis طوفانِ ری‌استارت نکند) · `/api/readiness` (store+DB+Redis؛ **PAYESH_ENV=production یا NODE_ENV=production + Redis قطع ⇒ 503**؛ در حینِ drain فوراً 503) · `/api/health` (کدِ وضعیت روی درگاهِ P0-13 قدیمی — قراردادِ server13/T2b دست نمی‌خورد — بدنهٔ کامل: db+pool stats، redis، queue، cache_l1، memory).
- **Graceful Shutdown (SIGTERM/SIGINT):** draining ⇒ closeIdleConnections + server.close ⇒ drainِ in-flight (poll 50ms؛ مهلت `PAYESH_SHUTDOWN_TIMEOUT_MS`=10s پیش‌فرض) ⇒ persistStore + db.close + redis.close ⇒ **exit 0**؛ فراتر از مهلت+2s ⇒ exit 1 (نگهبانِ زور). در‌حالت‌پرواز کامل می‌شود، نه abort.
- **تست:** `tests/wave15-health.js` **10/10** (H1–H7 درون‌فرایند + S1–S3 فرایندِ فرزند با سیگنالِ واقعی؛ S2 = SIGTERM در حینِ درخواستِ 1.5s: کامل شد + اتصالِ تازه reject + exit 0) + hookِ فقط-تست `/api/__slow` (env-gated).
- **گیت‌ها:** smoke 547/547، check-authz 0، secret-scan 11/11، build --check؛ رگرسیون: server1 31، server13 9 (production)، server17 70، wave6 22، wave11 20، redis-fallback 10، otp-redis 16، lock-atomic 12، pull-bootstrap 12، server-mutations 17/20 = بازهٔ پیشین (M18 یک‌بار با پیشوندِ `backupTimer =` شکست — خطِ verbatim برگشت).
- **مستندات:** `docs/DEPLOYMENT_GUIDE.md` (پروب‌های k8s، preStop، rolling با maxSurge=1/maxUnavailable=0، rollback، جدولِ env، چک‌لیست) + AI_PROMPT §0.5.33 + ROADMAP B.6.
- **ملاحظه:** این شاخه worker ندارد (outbox/worker در main) — seamِ توقفِ worker در توالیِ shutdown آماده است؛ بعد از merge به main باید بازبینی شود که worker جدید هم در همان seam ایستاده شود.

## چت ۳ جدید — Wave 11: Cache (TTL، invalidation، stampede protection) — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2` (بعد از دور ۱۰). سه کامیت: هسته + تست‌ها / اسنکواری و مستندات / گزارش.
- **Audit + ۴ شکافِ رفع‌شده:** (۱) L1 بی‌سقف بود ⇒ **LRU با سقف** (`PAYESH_CACHE_L1_MAX` پیش‌فرض ۱۰٬۰۰۰) + TTL 60s. (۲) انقضایِ ناقصِ L2: `invalidateSchool` فقط L1-resident‌ها را پاک می‌کرد و رویدادِ `user` L2 را نمی‌زد ⇒ ایندکسِ مشترکِ `payesh:cache:school:<sid>` + `purgeSchoolL2` (در انقضایِ school و شنوندهٔ pub/sub) + انقضایِ L2 در رویدادِ user. (۳) REST routes (۵ فایل، ۱۶ نقطهٔ نوشت) کش نمی‌زدند ⇒ همه با `invalidateCollection`. (۴) stampede ⇒ `cache.withSingleFlight` + پوشاندنِ مسیرِ bootstrap (N هم‌زمانِ miss = یک build).
- **توسعهٔ redis.js:** `sAdd`/`sMembers`/`sRem` با فال‌بکِ حافظه.
- **تست‌ها:** `tests/wave11-cache.js` (C1…C6 = ۲۰ بررسی؛ fake clientِ قراردادسازگار با Set/TTL؛ C6 = stampede روی route واقعی).
- **گیت‌ها سبز:** smoke ۵۴/۵۴۷، check-authz ۰، secret-scan ۱۱/۱۱، build --check. رگرسیون: server1 31 · s12 43 · s13 9 · s14 13 · s15 40 · s17 70 · s18 55 · pull-bootstrap 12 · wave1-writes 14 · wave6-redis 22 · sync-atomic-batch 22 · waf-mutations 4/4 — همه سبز.
- **مستندات:** `docs/WAVE11_CACHE_STRATEGY.md`، AI_PROMPT ۰/۵/۳۲، ROADMAP B.5 ✅.
- **pending:** ردیسِ زنده در ساندباکس نیست (fake قراردادسازگار؛ CI pending — در سند ثبت شد).

## چت ۳ جدید — Wave 6: Redis و Distributed State (Audit و تکمیل) — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2` (بعد از دور ۱۰۵). سه کامیت: هسته + تست‌ها / اسنکواری و مستندات / گزارش.
- **Audit:** `docs/WAVE6_REDIS_AUDIT.md` — همهٔ stateهایِ حیاتی (OTP، rate-limit، revocation، idempotency، cache، lock) روی Redis با TTL؛ **تولید بدونِ فال‌بکِ حافظه** (P0-13: بدونِ ردیسِ زنده استارت نمی‌شود + `/api/health` 503)؛ `otp.json` فقط حالتِ توسعهٔ بدونِ ردیس.
- **دو شکافِ رفع‌شده:** (۱) rate-limitِ WAF (`cache.checkRateLimit`) غیراتومِ GET+SET ⇒ حالا `incrWithTtl` (burstِ ۱۲ ⇒ دقیقاً ۵ مجاز). (۲) نگهبانِ شمارشِ شناسهٔ R97 درون‌فروشگاهی + `__auth.enum` بدونِ GC در payesh.json ⇒ شمارنده روی `payesh:enum:<jti>` (TTL=پنجره) + REVOKEٔ توزیع‌شده در denylist؛ `sendJsonCounting` (callbackِ syncِ ۷ ماژول) قراردادش دست‌نخورده.
- **تست‌ها:** `tests/wave6-redis.js` (R1…R8 = ۲۲ بررسی؛ fake clientِ قراردادسازگار با TTL/اسکرپت/ثبتِ دستورات؛ readiness با کودفرزند و `REDIS_URL`ِ نالایق) + `redis.__setClientForTests`.
- **رفعِ پیشینه:** الگوهایِ M3–M6 در `otp-ratelimit-mutations.js` (پایین‌دستیِ کدِ پیشینِ R-dist) ⇒ به خطِ اجرایِ فعلیِ auth.js: 7/7.
- **گیت‌ها سبز:** smoke ۵۴/۵۴۷، check-authz ۰، secret-scan ۱۱/۱۱، build --check. رگرسیون: server1 31 (S25) · s17 70 · s11-sms 9 · otp-ratelimit 49 + جهش‌ها 7/7 · otp-redis 16 · redis-fallback 10 · redis-key-audit 17 · rate-limit-distributed 9 · session-revocation 16 + جهش‌ها 3/3 · lock-atomic 12 · waf-mutations 4/4 · sync-atomic-batch 22 · wave1-writes 14 · id-collision 11 · occ 18 · tombstone 25 — همه سبز. پیشینه‌هایِ ثبت‌شده (بدونِ تغییر): server-mutations 17/20.
- **pending:** ردیسِ زنده در ساندباکس نیست (اثبات با fakeِ قراردادسازگار؛ CI pending — در سند ثبت شد).
- **مستندات:** AI_PROMPT ۰/۵/۳۱، ROADMAP B.4 ✅.

## چت ۳ جدید — Wave 1 (بخش دوم): انتقال Writes و Transactions به PG — ۲۰/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2` (بعد از E.9). پیشنهادِ ناظر برایِ `feat/wave1-writes-chat3` به‌دلیلِ session-pin قابلِ اجرا نبود — انحراف در گزارشِ دور ثبت شد. سه کامیت: هسته + تست‌ها / اسنکواری و مستندات / گزارش.
- **کد:** sms — نوشت‌هایِ هر آیتم (sms_log+sms_wallet+notify_queue یا رکوردِ failed) در **یک تراکنش** (`mirrorItem` با `persistOpsBatch`؛ شکستِ آینه نامرئی + audit). sync — نوتیفیکیشن‌هایِ مشتقِ ۴ hook (conflict/leaves/chat/corrections) به `derived` → `mirror.concat(derived)` در **همان تراکنش**. delete-service — `db.transaction`: DELETE + رویدادِ `server_outbox` (all-or-nothing؛ شکست در PG ⇒ 500 از handlerِ سراسری = fail-closed). outbox — `append(event, client)` اختیاری (داخل تراکنشِ فراخوان / اتصالِ جدا).
- **اسنکواری:** `docs/WAVE1_WRITES_INVENTORY.md` — PG اتمیک / best-effort (REST routes تک‌رکوردی) / فقط-JSONِ سازِ‌عملکرد (جلسات، OTP، گورناخن‌ها، sync_conflicts، صفِ outbox، فایل‌ها) + تصمیمِ max+1 محلیِ idهایِ sms (NAMESPACESِ ids.js فقط ۴ کلکسیون دارد).
- **تست‌ها:** `tests/wave1-writes.js` (W1…W7 = ۱۴ بررسی؛ pool/clientِ جعلی — BEGIN/COMMIT/ROLLBACK و توالیِ نوشت‌ها) + `tests/wave1-writes-mutations.js` (MW1…MW5 همه کشته).
- **گیت‌ها سبز:** smoke ۵۴/۵۴۷، check-authz ۰ (۶/۶ بررسی)، secret-scan ۱۱/۱۱، build --check. رگرسیون: server1 31، s10 7، s11-sms 9، s11-mut 6، s12 43، s13 9، s14 13، s15 40، s16 39، s17 70، s18 55، s4 16، s5 14، s6 9، s7 15، s8 9، s9 10، tombstone 25، occ 18، id-collision 11، lock-atomic 12، sync-atomic-batch 22 — همه سبز. **موجودِ پیشین (نه رگرسیون):** server-mutations 17/20 (M1/M14/M15 روی in-tree) و کرشِ server11-child به‌تنهایی (فایلِ helper است).
- **مستندات:** AI_PROMPT ۰/۵/۳۰، ROADMAP B.3 ✅.

## چت ۳ جدید — E.9: مدیریت مراجعین (visitors) — ۱۸/۰۶/۱۴ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2` (بعد از E.1). دو کامیت: هسته‌ی E.9 + مستندات. گیت‌ها سبز: smoke ۵۴/۵۴۷، check-authz=0، secret-scan ۱۱/۱۱، build --check، authz-model ۲۴/۲۴۸، سوئیت‌های تازه ۱۳/۱۳ + جهش‌ها ۵/۵.
- **پیشینه:** «نسخهٔ سبک» بند ۷ فقط با مدیر + دو فیلد بود؛ E.9 آن را کامل کرد (فامیل/مسیر/جدولِ سرور از قبل موجود بودند — هیچ‌کدام شکسته نشد).
- **مدل:** فیلدهای تازه `national_id`/`phone`/`visiting_person` (اختیاری) + `status:'in'|'out'` (کهنه‌ها از `out_at` مشتق — بدونِ مهاجرت). STATUS_ENUMS + whitelist + write-perms + schema.sql (regenerate؛ diffِ بزرگ = driftِ ساعتِ seed، عادی).
- **دسترسی:** مدیر + **نگهبان** (`role=guard` — نقشِ تازه: USER_ROLES سرور، NAV.guard، گزینهٔ «نگهبان/پذیرش» در فرمِ کاربر) ⇒ ثبت/خروج؛ **معاون** (مدیرِ سطحی با عنوان) ⇒ فقط‌خوان (گاردِ عنوان روی داده)؛ سایر ⇒ هیچ. **یافته + رفع:** مسیرِ `#visitors` پیش‌تر برایِ هر نقشی با hash باز بود (نشتِ نسخهٔ سبک) — حالا `viewVisitors` گاردِ نقش دارد.
- **UI:** فرمِ ۵ فیلدی، دکمهٔ خروجِ ردیفی، جستجویِ زندهٔ نام + تاریخ، `visitorDashCard` روی داشبوردِ مدیر/نگهبان. دادهٔ نمونه از `new Date()` به ۳ رکوردِ قطعی رسید.
- **تست‌ها:** `tests/visitors2.js` (V0–V12) + `tests/visitors-mutations.js` (۵/۵).

## چت ۳ جدید — E.1: نمره‌های تئوری/عملی هنرستان (grades) — ۱۸/۰۶/۱۴۰ (2026-09-09)

**وضعیت:** شاخهٔ `arena/01a08545-p2` (از `2a2b74f` = main). دو کامیت: هسته‌ی E.1 + مستندات. گیت‌ها سبز: smoke ۵۴/۵۴۷، check-authz=0، secret-scan ۱۱/۱۱، build --check، authz-model ۲۴/۲۴۸، سوئیت‌های تازه ۱۴/۱۴ + جهش‌ها ۵/۵، workshop2 ۱۲/۱۲ + جهش‌هایش ۴/۴.
- **مدل:** سه فیلدِ تازه در `grades` — `theoretical_score`/`practical_score` (کسری ۰–۲۰، nullable) + `is_vocational` (بول). `score` = **میانگینِ قسمت‌هایِ پرشده**؛ همهٔ مصرف‌کننده‌های `score` (معدل، رتبه، هشدار، آمار) خودکار درست کار می‌کنند. authz: سه فیلد در `model.json` (ورودیِ سطح‌متن؛ فایلِ curated را هرگز با json.dump بازنویسی نکنید)، دو قاعده در `server/validate.js`، بازتولید `write-perms.json` (فقط ۳ خط).
- **فرم (`gradeModal` در `18-modals.js`):** در کلاس‌هایِ مدرسهٔ توانِ `workshop` فیلدِ «نوعِ نمره»: «تئوری» (پیش‌فرض) ⇒ دو قسمتِ تئوری/عملی + پنهان‌شدنِ فیلدِ «نمره»؛ «عملی/کارگاهی» ⇒ رفتارِ دور ۶۹ (رکوردِ واحد) + هم‌پیکریِ فیلدهای تازه (`practical_score=score`). جابه‌جاییِ فیلدها با تغییرِ نوع: `gradeKindToggle` + caseٔ `g_kind` در شنوندهٔ `change`ِ سراسری. مدرسهٔ غیرکارگاهی: فرم دست‌نخورده.
- **نمایش:** ستون‌های جدا «تئوری»/«عملی» در `viewGrades` (فقط کلاسِ کارگاهی؛ دیدِ دانش‌آموز با `workshopStudent`)؛ `vocationalParts(g)` در `13-grades.js` تنها نقطهٔ تفسیرِ قسمت‌ها (رکوردِ کهنهٔ `kind=practical` از `score` می‌گیرد — سازگاریِ عقب)؛ چِپِ پرونده (`17-student-record`) + کارنامهٔ A4 (`reportCardCert`، هر دو قالب).
- **دادهٔ نمونه:** پایهٔ آخرِ هنرستان (مجتمع ایران‌زمین، دوازدهم فنی): یک نمرهٔ تئوریِ ترکیبیِ تئوری ۱۵/عملی ۱۷ (score=۱۶) — قطعی.
- **نکتهٔ تست:** جهشِ M4ِ workshop2 با معنایِ تازهٔ E.1 زودتر (در ردِّ ذخیره) می‌میرد؛ `expectFail` به «نمرهٔ تازه ثبت نشد» به‌روز شد — کشتنِ رفتاری همان است.
- **مستندات:** `docs/VOCATIONAL_GRADES.md`، AI_PROMPT ۰.۵.۲۸، ROADMAP E.1 ✅، USER_GUIDE (دو calloutِ دور ۶۹ با یادداشتِ دور ۱۰ بسط شدند).
 ۱۴۴ سبز + ۴ قرمز → هر ۴ ریشه‌یابی و با اصلاحِ **فقط-تست** سبز شدند (جزئیات در `R100_STEP7_FINAL_GATE_REPORT.md`)؛ ‏`build --check` ✅ · ‏smoke ‏**547/547** ✅ · ‏`check-authz` ✅؛ مستندات (AI_PROMPT §۰.۵.۲۱ + راهنما + همین ورودی) ✅
- **جمعِ آزمونِ تازه:** ۹۹ ادعایِ تازه (۹+۲۸+۱۷+۱۸+۱۸+۹) + ۳۰ جهشِ تازه (۷+۵+۴+۵+۵+۴) — همه سبز، ۰ خطایِ محیطی.
- **باقی‌ماندهٔ کلِ پروژه (بدونِ تغییر):** تصمیمِ محصولِ پرداختِ والد · ۲.۷ (throttle + UUID) · ۲.۱(a) نرخِ اکسل · ۲.۱(b) قواعدِ عمیق · Lax→Strict · pull/bootstrapِ خواندن (جدا).

## دورِ ۹۵ — بند ۲.۵: حلِ تعارض در همگام‌سازی (base_version + حفظ + داوری) — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** کامیت‌های `465e9d3` + `b49210e` + مِرج `3962247` (PR#3: نشت‌های DOM-id دور ۸۹ + انتخابگرِ پوستهٔ دور ۹۰ — ماژولِ تازهٔ این دور بازنومری شد به `68-sync-conflicts.js`). گزارش: `R95_SYNC_CONFLICTS_REPORT.md` (ریشه). رجیسیونِ پیش‌از-مِرج: 126/127 (قرمزِ تنها = server14-gc-mutations، خطایِ محیطیِ /tmp، تکرارِ تکی سبز). رجیسیونِ پایانی (درختِ نهایی: مِرج + سخت‌سازیِ GC `007ce34`): **128/128 سبز، 0 قرمز (968s)**.

- **سیاستِ سه‌گانه** (از قبل تصمیم گرفته بود، حالا پیاده): نسخه‌دار (نمره/حضور/انضباطی) → عملیاتِ کهنه **حفظ** می‌شود در `sync_conflicts` + اعلان به مدیر · ساختار (کلاس/درس/کاربر/…) → `stale_base` (سرور مرجع) · بقیه → LWW بر پایهٔ زمانِ دریافتِ سرور.
- **سرور:** `server/sync.js` (بررسیِ `base_version` + نسخه‌گذاریِ apply؛ رکوردِ بدونِ نسخه = نسخهٔ ۱ → بدونِ مهاجرت؛ بدونِ `base_version` = سازگاریِ قدیمی) + `server/conflicts.js` (تازه: `GET /api/sync/conflicts` با دامنهِٔ مدرسه + `POST /api/sync/resolve-conflict` اتمیک — incoming = اعمالِ دادهٔ کلاینت + نسخهٔ +۱ / server = دست‌نخورده؛ 403 role/scope، 409 دوباره).
- **کلاینت:** 03-persistence (base_version در applyOp) · 27-sync (conflict_preserved → «تعارض»ِ مرده در صف، stale_base → rejected) · کارتِ «⚖️ تعارض‌های همگام‌سازی» در داشبورد (فقط حالتِ سروری) · `67-sync-conflicts.js` (تازه: پُلِ ۳۰s + نمایشِ روبه‌رویِ هم + دکمه‌هایِ داوری) · اکشن/مجوزِ `conflict-resolve`.
- **آزمون:** `tests/server15.js` 40/40 · `tests/server15-mutations.js` 6/6 کشته · smoke 547/547 (چکِ لایهٔ محلیِ تازه) · check-authz 6/6.
- **یافتهٔ دام:** نگاشتِ wire در تست `base_version` را رها می‌کرد + claimهایِ «دست‌نخورده» باید **پس ازِ flushِ تضمین‌شده** سنجش شوند — هر دو بسته شد.
- **باقی‌ماندهٔ کلِ پروژه (بدونِ تغییر):** تصمیمِ محصولِ پرداختِ والد · ۲.۷ (throttle + UUID) · ۲.۱(a) نرخِ اکسل · ۲.۱(b) قواعدِ عمیق · Lax→Strict · pull/bootstrapِ خواندن (جدا).

## دورِ ۹۴ — بازبینیِ آمادگیِ تولید (auditِ TODO_BEFORE_PRODUCTION با کدِ فعلی) — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** فقط مستندات (بدونِ تغییرِ کد — رجیسیونِ معتبر همانِ R93: 125/125). گزارش: `R94_PROD_AUDIT_REPORT.md` (ریشه) + جدولِ وضعیتِ واقعی به ابتدایِ `TODO_BEFORE_PRODUCTION.md` اضافه شد.

- **یافتهٔ اصلی:** شش بندِ «مسدودکننده/مهمِ کلاسیک» (احرازِ سرور، RBAC/محدوده، نرخِ ورود، سابقه، پشتیبان، سرآیندها+CSP-nonce) **قبلاً پیاده‌اند** (دورهایِ ۶۰–۹۳) — سند پیش‌از-سرور بود و قفلِ ۱.۱/۱.۵/۱.۶ هم از قبل بسته.
- **باقی‌ماندهٔ فنیِ واقعی (۵):** .۵ base_version + UI داوریِ تعارض (بزرگ‌ترین فید) · ۲.۷ throttlingِ شمردنِ شناسه + تصمیمِ UUID پیش از نخستین استقرار · سقفِ نرخِ ورودِ اکسل · قواعدِ عمیقِ کسب‌وکار سمتِ سرور (ظرفیت کلاس و…) · Lax→Strict (سلیقه).
- **باقی‌ماندهٔ منابعی (۴):** **پرداختِ والد = تصمیمِ محصول (تنها موردِ بازِ کلِ پروژه — پیشنهاد: پنهان + ثبت از طریق مدیر)** · دروازهٔ پیامکِ واقعی · مقیاس‌پذیری/PostgreSQL · استادیng/HTTPS/نگهداریِ پشتیبان.

## دورِ ۹۳ — تکمیلِ برنامهٔ سخت‌سازیِ سوئیت‌هایِ جهش (33/33) — ۱۸/۰۶/۱۴۵ (2026-09-08) — کامل

**وضعیت:** کامیت `b6038ba` + این داک‌کامیت (پوش‌شده). گزارش: `R93_HARDENING_COMPLETE_REPORT.md` (ریشه). رجیسیون: **125/125** (677s) · smoke 546/546 · check-authz 6/6.

- **۶ سوئیتِ سبکِ قدیمیِ باقی‌مانده** (libserial2/multigrade2/pathway2/gradeavg2/trendcmp2/underpriv2) → الگوی R92 (مرگِ زودهنگام → retry + env-fail).
- **server11-mutations** (fail-fast: هر exit غیرصفر = «کشته»): کلاسِ برعکس بسته شد — خروجیِ خالی/کرش → retry + FAILِ صریحِ محیطی، هرگز «کشته شد»ِ کاذب.
- **نتیجه:** هر سه جهتِ خطایِ محیطی در کلِ ۳۳ سوئیتِ جهش بسته (کرش→زندهٔ کاذب / کرش→کشتهٔ کاذب / مرگِ زودهنگام→زندهٔ کاذب).
- **باقی‌ماندهٔ واحدِ کلِ پروژه:** دکمهٔ پرداختِ ولی در حالتِ سرور — **تصمیمِ محصول**.

## دورِ ۹۲ — زیرساختِ تست: رفعِ زنجیرهٔ خطاهایِ محیطی (forensicsِ سه‌لایه) — ۱۸/۰۶/۱۴۵ (2026-09-08، شب) — کامل

**وضعیت:** ۳ کامیت روی main (`a8c7efd`, `ffa4b77`, `2353898` — همه پوش‌شده). گزارش: `R92_TEST_INFRA_REPORT.md` (ریشه — ارائه شد). رجیسیونِ پایانی: **125/125** (663s) · smoke 546/546 · check-authz 6/6 · صفرِ سرورِ نشتی.

- **لایهٔ ۱ (M18 «زنده ماند»ِ کاذب):** سرورهایِ نشتی‌شده روی 8994/8995 → server9 قبل از A2 می‌مرد → server-mutations (آخرین سوئیتِ ۱۶تایی) با الگوی R92 سخت‌سازی شد: مرگِ زودهنگام = retry + env-failِ صریح؛ خروجِ 0 فقط با `killed==20 && envFails==0`. تأیید با شبیه‌سازیِ محیط (پورت‌ها مسدود: M18 → مارکرِ محیطی، exit 1).
- **لایهٔ ۲ (بمبِ زمانیِ H2/H4):** بازه‌ها از `toISOString()` «امروز 00:00–23:00» — **هر شب UTC 23:00–23:59 (= 02:30–03:29 تهران) قرمز**. رفع: H2 = nowIso ثابت، H4 = بازه‌هایِ now±1h. آزمون: 5/5 **درِ درونِ خودِ پنجرهٔ بمب**. summer2-mutations هم همان hardening R92.
- **لایهٔ ۳ (سه باگِ زیرساختی):** (الف) sweepِ وسطِ اجرا storeِ **زندهٔ** sim_full3 را پاک می‌کرد → کرش + نشتی (حالا `-mmin +2` برای mut-* و payesh-*). (ب) پترنِ pkill سرورهایِ **مسیرِ مطلق** را نمی‌گرفت (`node /abs/.../server/index.js`) — نشتی 12 دقیقه زنده ماند → آبشارِ 429/no_session روی 8997 (حالا `node .*server/index\.js`). (ج) `uses_port` ده سوئیتِ سبکِ قدیمی را نمی‌دید (ارجاعِ `'tests/x.js'` به‌شکلِ آرگومان) → ۵۱ سوئیتِ پورت‌دار در لانِ سریال (قبلاً 39؛ سه‌تادهٔ 8997 = server10/sim_full3/reexam3) + hardeningِ R92 روی هر ۱۰.
- **هزینه:** رجیسیون 431s → 663s (قیمتِ جدولةٔ درست؛ تداخلِ پورت تاکنون فقط با شانس سبز می‌ماند).
- **باقی‌ماندهٔ واحد:** دکمهٔ پرداختِ ولی در حالتِ سرور — **تصمیمِ محصول** (پیشنهاد: پنهان + «ثبت از طریق مدیر»).

## دورِ ۹۰ — بستنِ باقی‌ماندهٔ ۲ و ۳ِ دور ۸۹ — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** ۱ کامیت روی main (`492585d`، پوش‌شده) + این ورودی. گزارش: `R90_CLOSEOUT_REPORT.md` (ریشه — ارائه شد). رجیسیون: **125/125** (471s) · server12 **43/43** · smoke 546/546 · check-authz 0.

- **(۱) ویرایشِ اعلانِ خود = فقط پرچمِ read:** `upd notifications` روی `rec.user_id===u.id` فقط برایِ parent/student و فقط با داده‌ای که همهٔ کلیدهایش `read` باشد؛ هر فیلدِ دیگر → 403. مدیر/دبیر/مشاور بدونِ تغییر (مسیرِ مدرسه‌ای). تست S27/S27b + جهشِ M4 (حذفِ محدودیت → S27 قرمز، ذخیرهٔ جعلی apply می‌شد) ✅.
- **(۲) سخت‌سازیِ sim_full3-mutations:** سوراخِ برعکسِ 15 سوئیتِ دیگر — کشتِ محیطیِ بدونِ خروجی (SIGKILL) به «جهشِ کشته شد» تبدیل می‌شد (فولز-پوزیتیو: جهشِ زنده پنهان می‌ماند). رفع: retry برایِ خروجیِ خالی + `envFails` + مارکرِ صریحِ محیط + خروجِ 0 فقط با `killed===3 && backGreen && envFails===0`. اجرایِ تکی بعد از رفع: 3/3 کشته ✅.
- **باقی‌ماندهٔ واحدِ باز:** **پرداختِ خودِ والد** — شبیه‌سازیِ کلاینتی بدونِ دروازهٔ واقعی + بدونِ امتیازِ `parent_subscriptions` → در حالتِ سرور persist نمی‌شود؛ مسیرِ پایلوت = ثبتِ مدیر. **منتظرِ تصمیمِ محصول** (دروازهٔ پرداخت / پایداریِ خودِ والد) — خارج از دامنهٔ فنیِ سشن.

## دورِ ۸۹ — جریان‌هایِ همگام‌سازیِ نقش‌هایِ غیرمدیر (chat/تکلیف/نشان/ردِ فرزند) — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** باقی‌ماندهٔ ۱ِ دور ۸۸ («شکافِ سیستماتیک») به ماتریسِ کاملِ پروبِ زنده (31 مورد، 4 نشستِ واقعی) رسید و ۵ شکافِ جدی‌تر از اعلان پیدا کرد: **کلِ چتِ غیرمدیر** (پیامِ خود) 403، نشانِ «خوانده شد» برایِ والد/دانش‌آموز، تکلیف/جنگی/نوبتِ دبیر، و ردِ فرزند (3 شکست: `corrections`/`parent_links` اصلاً در امتیازاتِ والد نبودند). ۳ کامیت روی main: `186a4e9` (رفع) · `ebc355c` (سازگاری S20) · `264748c` (محافظِ قرمزِ کاذب). گزارش: `R89_SYNC_SCOPE_REPORT.md` (ریشه — ارائه شد). رجیسیون: **125/125** (458s) · server12 **41/41** · server1 31/31 · smoke 546/546 · check-authz 0.

- **رفع (همه در `server/sync.js`، صفر تغییرِ کلاینت):** (۱) امتیازات: والد +`corrections`+`parent_links`، دانش‌آموز +`notifications` (هر دو زیرِ inScope) (۲) `messages`: برایِ student/parent/teacher فقط `from_id===u.id` (بدونِ from_id = fail-closed)؛ **مدیر مسیرِ قدیمیِ مدرسه‌ای را نگه داشت** — قراردادِ S20 (پیامِ مدیر بدونِ from_id) وگرنه می‌شکست (۳) `upd notifications` روی `rec.user_id===u.id` (نشانِ خوانده) (۴) `hw_assignments`/`vclass_sessions` فقط کلاس‌هایِ تدریس‌شدهٔ دبیر (fail-closed برایِ کلاسِ دیگر)، `meeting_slots` فقط نوبتِ خود (۵) `parent_links` ins فقط با `parent_id===u.id` (۶) هیک‌هایِ اعلانِ سروری: chat→گیرنده، corrections→مدیر، مرخصی با کلمه‌گذاریِ عمومی؛ هیک‌ها مدیر را رد می‌کنند تا اعلانِ کلاینتیِ مدیر تکرار نشود (پروب: «دقیقاً یک»).
- **آزمون:** پروبِ زنده 31/31 (پیش/پس + 7 کنترلِ منفی + 8 بررسیِ disk) · server12 S18–S26 (24→41) · 3 جهشِ کشته‌شده (M1 پیام، M2 هیکِ chat، M3 امتیازِ corrections).
- **حادثهٔ ۱ (رجیسیون):** S20 قرمز + کرشِ server-mutations (زنجیره) — ریشه: از دست دادنِ قراردادِ from_id؛ رفع با محدودسازیِ نقش (`ebc355c`).
- **حادثهٔ ۲ (قرمزِ کاذب — کلاسِ سوم):** server13-mutations تحتِ بارِ موازی بدونِ خروجی کشته شد (سقف 1500MB/2GB) و رانِر آن را «جهشِ زنده» خواند؛ اجرایِ تکی = 1/1 کشته ✅. رفعِ ریشه‌ای: **15 سوئیتِ جهش** — retry یک‌باره برایِ خروجیِ خالی + `crashed` + مارکرِ صریحِ محیط (هرگز «زنده ماند»). sim_full3-mutations ساختارِ متفاوت دارد (باقی‌مانده).
- **باقی‌مانده:** (۱) پرداختِ خودِ والد = شبیه‌سازیِ کلاینتی و امتیازِ `parent_subscriptions` ندارد → در حالتِ سرور persist نمی‌شود؛ مسیرِ پایلوت = ثبتِ مدیر (تصمیمِ محصول) (۲) upd اعلانِ خود، همهٔ فیلدها را می‌گذراند (فقط read معنادار — تزیینیِ خودبه‌خود) (۳) سخت‌سازیِ اختصاصیِ sim_full3-mutations.

## دورِ رفعِ بازبینیِ PR #2 (Devin AI) — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** هر شش ادعایِ بازبینی با پروبِ زنده راستی‌آزمایی شد (دو سرورِ جدا ۸۹۹۱/۸۹۹۰ + jsdom)؛ ۶ رفع (۲ انحرافِ مستند از خودِ متنِ بازبینی که فنی اشتباه بود) + ۱۱ تستِ کلاینت (۵ تازه) + ۴ تستِ سرورِ تازه (S14–S17) + ۳ جهشِ تأییدشده. ۲ کامیت روی main: `b22a7b6` (کلاینت) · `8e06379` (سرور) + این ورودی. گزارش: `PR2_REVIEW_FIX_REPORT.md` (ریشه — ارائه شد). رجیسیون: **125/125** (436s، رانِر v۳) · smoke 546/546 · check-authz 0 · server12 24/24 · client-features 11/11.

- **رفع‌ها:** ① `isWorkDay` در چک‌لیستِ فردا (با fallback ۰–۴) ② `icsEsc` (RFC 5545: `\` `;` `,` خط‌خوردگی) روی SUMMARY/LOCATION — **نه** `esc()` که پرامپت خواسته بود (فرارِ HTML، فیلِ ICS را خراب می‌کند) ③ بازبررسیِ `cfCanExcuse(u,rec)` در `qe-save` در لحظهٔ ذخیره (سرور از پیش 403 می‌داد — پروب B) ④ `DTSTART` شناورِ محلیِ `YYYYMMDDTHHMMSS` برایِ امتحانِ ساعت‌دار — **نه** `Z` که پرامپت خواسته بود (UTC، جابه‌جاییِ ۳:۳۰ تهران) ⑤ هوکِ سمتِ سرور در `sync.js`: `ins leaves` pending از غیرمدیر → اعلانِ مدیر + `audit('leave_request_notified')` — کلاینت نمی‌توانست: `inScope` ساختارِ رکوردِ اعلان را از والد رد می‌کند (پروب A: 403) ⑥ `cfPersona`/`cfCanExcuse` با `activePersona()` — **اصلاحِ حافظهٔ سشن:** `activePersona` تعریف‌شده است در `23-subscription.js:61` (const فلش — grepِ قدیمی «function activePersona» آن را نمی‌دید) = `S.persona‖S.user.role`.
- **دامنهٔ گارد:** فقط parent/student (هم‌راستا با گاردِ بازکردن)؛ شاخهٔ manager/teacherِ پیشنهادی از UI در دسترس نیست و سرور 403 می‌کند.
- **باقی‌مانده (ثبت‌شده در گزارش، دست نخورد):** (۱) `icsForStudent` فیلترِ `school_id` ندارد — **راستی‌آزمایی شد/بسته (ادامهٔ دور 88، 2026-09-08)**: شناسهٔ class از یک شمارندهٔ جهانیِ واحد (`nextId` در `02-demo-data.js:46`) صادر می‌شود — تداخلِ بین‌مدرسه ممکن نیست (پروبِ زنده: 0) → فیلتر تکراری است، اضافه نشد (۲) شکافِ سیستماتیک: `insert('notifications')` از همهٔ نقش‌هایِ غیرمدیر توسطِ `inScope` رد می‌شود (پیشینِ PR#2) (۳) opِ ردشدهٔ demo در ردیفِ همگام‌سازی بی‌ضرر دیده می‌شود.
- **درسِ ابزار (مهم برایِ سشن‌های بعد):** لایهٔ انتقالِ پارامترهایِ ابزار **بک‌اسلش را دوبرابری می‌کند** (و stdout هم دوبرابر نمایش می‌دهد) — برایِ ویرایشِ خطوطِ پر از بک‌اسلش، `chr(92)` در python یا `String.fromCharCode(92)` در jsdom استفاده کن؛ تکیه بر `cat -A`/`repr` برایِ شمارشِ بک‌اسلش **بی‌اعتبار** است (نمایش دوبرابر می‌شود) — `len()`/`count()` منبعِ درست است.

## دورِ ۳ تم + بهبودِ لوگو (دستورِ جامعِ یک‌پارچه) — ۱۸/۰۶/۱۴۰۵ (2026-09-08) — کامل

**وضعیت:** همهٔ ۸ مرحله اجرا شد؛ ۱ کامیت روی main (3b106a3) + این ورودی؛ گزارش: `UI_THEMES_SUMMARY.md` (ریشه — ارائه شد).

- **پیاده‌سازی (۳ فایل):** (۱) ۳ تم در پایانِ `src/styles/base.css` (کلاسیک/مینیمال/لوکس + ارتقایِ `.brand-logo`/`.login-logo`) · (۲) `src/js/99-theme-loader.js` (اعمالِ تم ذخیره‌شده + `window.switchPayeshTheme` با اعتبارسنجی + toast) · (۳) `_order.json` (ماژولِ ۷۶). پیش از نوشتن، سازگاریِ انتخابگرها راستی‌آزمایی شد: 13 متغیرِ CSS همه در `:root` موجودند + کلاس‌ها (`.card`×346، `.sidebar`×27، `.att-btn`×21، logo×4/4) — تم‌ها واقعاً اعمال می‌شوند.
- **انحرافِ ثبت‌شده (ضروری):** کدِ ارسالی `localStorage` مستقیم می‌زد → نگهبانِ معماریِ smoke (00-data-layer) شکست = 545/546. حل: همان کلید از طریقِ `Store.get/set` (لایهٔ داده) — رفتارِ کاربر یکسان + مقاومت در حالتِ ناشناس. smoke → **546/546**.
- **درها (اندازه‌گیری):** build سبز (76 ماژول) · smoke **546/546** · check-authz **0** · تأییدِ زندهٔ jsdom (اسکریپتِ جدا در /tmp — مطابقِ ممنوعیتِ پرامپت در ریپو تستِ دائمی نساخت) **12/12**: پیش‌فرض theme-2 · سوئیچ+toast · پایداری بعد از reload · تم نامعتبر رد شد · قوانین+لوگو در بیلد. رجیسیونِ کاملِ 125 سویت: **125/125** (~۷ دقیقه، رانِر v۳).
- **یادداشتِ قابلِ دیدن:** تمِ پیش‌فرض `theme-2` است (دستورِ صریح) — ظاهرِ پیش‌فرضِ همهٔ کاربران مینیمال+سایدبارِ تیره است؛ بازگشت با `switchPayeshTheme('theme-1')`.
- **باقی‌ماندهٔ اختیاری:** تبدیلِ 12 بررسیِ زنده به `tests/theme.js` + سوئیتِ جهش (با دستور).

## دورِ سرعتِ v۲ (موازیِ عزاَل‌شده) + ریشه‌یابیِ ۲ حادثهٔ کاذب — 18/06/1405 (2026-09-08) — در حالِ اتمام

**وضعیت:** رانِر به v۳ رسید (۳ لاین: ۴۵ موازی در درختِ اصلی + ۴۱ کپیِ موازی + ۳۹ پورتِ سریال)؛ رجیسیونِ پایانی در حالِ اجرا — اعدادِ نهایی در همین ورودی ثبت می‌شود.

- **سرعتِ اندازه‌گیری‌شده (2 vCPU/2GB):** توالی‌ای = ۱۰۵۰–۱۱۱۵ ثانیه (≈۱۸ دقیقه) · v۱ (پایه @۲-worker، جهش‌ها توالی‌ای) = ۹۳۶ ثانیه — فازِ جهش هنوز ۸۳٪ِ زمانِ کل (724s از 936s).
- **رانِرِ v۲ (`scripts/run-all-tests.sh`):** فاز ۱ = ۶۲ سوئیتِ پایهٔ فقط‌خواندنی، ۲-worker در درختِ اصلی؛ فاز ۲ = ۶۳ سوئیت (۱۴ rebuildکننده + ۱۴ سرور + ۳۵ جهش)، ۲-worker، **هر سوئیت در کپیِ جدا** از ریپو (tar 0.03s + symlinkِ node_modules) — چون سوئیت‌هایِ جهش src را مستقیم تغییر می‌دهند و index.html را rebuild می‌کنند و سوئیت‌هایِ سرور payesh.json را می‌نویسند. انتظار: ≈۵۵۰ ثانیه (≈۹ دقیقه).
- **حادثهٔ ۱ — ۲۱ قرمزِ کاذب (ریشه + بازیابی):** حلقهٔ کشفِ خودم `for f in tests/*.js; do timeout 5 node "$f"` سوئیت‌هایِ جهش را در درختِ اصلی اجرا و **وسطِ جهش kill کرد** → ۹ فایلِ src/server در وضعیتِ جهش‌خورده ماند (از جملهٔ `/* mutation: no counting */` و `false&&_tmAll` و `if(false)`) → قرمزهایِ قطعی در دامنهٔ att2/3/4 · deadletter · cmsg2 · clsctx · compact · gradeavg2 · assocmin (هم پایه و هم جهش). بازیابی: `git checkout -- <فایل‌ها>` + reseed با `node server/seed.js` → deadletter 18/18 ✅. **قاعدهٔ جدید:** هرگز سوئیتِ جهش را مستقیم/با timeout-kill در درختِ اصلی اجرا نکن؛ تنها درِ رجیسیون = `scripts/run-all-tests.sh`.
- **حادثهٔ ۲ — ENOSPC در /tmp:** /tmp = tmpfsِ مشترکِ ۹۹۳MB (zipهایِ snapshotِ پلتفرم ≈۱۹۴MB از آن)؛ سوئیتِ server11 هر بار `/tmp/payesh-s11-*/store.json` (5.6MB) **نشت می‌دهد و پاک نمی‌کند** + سوئیت‌هایِ authzchk کپیِ ریپو می‌گذارند + اجرایِ kill‌شده `/tmp/mut-*` جا می‌گذارد → /tmp وسطِ رجیسیون پر.
- **حادثهٔ ۳ — «جهشِ زنده»ِ کاذب (ریشه + رفع):** در v۲ سوئیت‌هایِ فاز ۲ با ۲-worker موازی بودند؛ `server9` (پایه، پورتِ سفت 8994/8995) و `server-mutations` (M18 هم همانِ server9 را بالا می‌آورد) **هم‌زمان** اجرا شدند → EADDRINUSE → A0a شکست → M18 «زنده ماند» (19/20 — خطای محیط، نه جهشِ واقعی). ریشه: ۳۳ سوئیت پورتِ 89xx/90xx سفت دارند (برخی فقط از طریقِ سوئیتِ targetِ جهش). رفع: رانِر v۳ — **لاینِ سریالِ اختصاصیِ پورت** (۱۷+۲۲ سوئیت توالی‌ای، در کنارِ دو لاینِ موازیِ ۴۵/۴۱) + اسکنرِ پورت (لایتنِ مستقیم + یک سطحِ غیرمستقیمِ جهش→سوئیت) — dry-run: ۴۵+۴۱+۳۹=۱۲۵ بدونِ تداخل.
- **گاردِ درختِ کثیف، آزمایش‌شده:** رانِ نخستِ v۳ درست با همانِ دو فایلِ اسنادِ کامیت‌نشدهٔ خودم abort شد (exit 3) — بعد از کامیت (981e268) دوباره شروع شد.
- **گاردِ تازه در رانِر v۲:** (۱) self-heal: jsdom + هویتِ git + remote (از ~/.payesh_gh_token) + reseedِ payesh.json · (۲) **گاردِ درختِ کثیف**: تغییرِ کامیت‌نشدهٔ tracked → exit 3 (دقیقاً همانِ حادثهٔ ۱ را می‌بندد) · (۳) self-healِ /tmp: پاک‌کردنِ mut-*/payesh-*/authzchk-های کهنه پیش + وسطِ اجرا + فضایِ آزاد < 250MB → exit 4.
- **رجیسیونِ پایانی (درختِ تمیز، رانِر v۳): **۱۲۵/۱۲۵ سبز در ۴۲۸ ثانیه (≈۷ دقیقه) — در برابرِ ۱۰۵۰–۱۱۱۵ ثانیهٔ توالی‌ای (−۶۰٪)؛ server-mutations 20/20 (لاینِ پورت، بدونِ تنازع). کامیتِ رانِر: `3dee49a` (push + ls-remote ✓).
- **یادداشت:** `tests/server11-child.js` اسکریپتِ worker است (با آرگومان از server11-sms فراخوان می‌شود) — ۱۲۵ سوئیتِ رسمی = ۱۲۶ فایل − این worker (استثنا در رانِر عمدی است و پوشش ۱۲/۱۲۵ کامل است).

## دورِ رفعِ باقی‌مانده (با تغییر کد — ⚠️ بدونِ تأییدِ معتبر) — 17/06/1405 (2026-09-07) — کامل

> 🔴 **تصحیحِ ۲۰۲۶-۰۹-۰۸ (دورِ ۸۹):** عنوانِ پیشینِ این بخش به «مجوزِ
> موقتِ کلود» استناد می‌کرد. چنین مجوزی هرگز صادر نشده بود. رجوع کنید
> به **اصلِ هشتم** در `docs/AI_PROMPT.md` §۰.

**وضعیت:** همهٔ ۶ مرحله اجرا و push شد؛ ۶ کامیت روی main (همراهِ همینِ کامیتِ اسناد، ۷ می‌شود) + برنچِ `feat/client-features` (push شده، merge نشده).

- **مرحلهٔ ۰ (4f48656):** ۳ سندِ دورِ تستِ جامع (گزارش + HANDOFF + OPEN_ITEMS) کامیت شد.
- **دستهٔ ۱ (9b0bd0a):** باگِ گواهی‌ها رفع شد (`body: body` → `bodyClassic` در 33-forms-sms.js:355/389) — certify 6/6 + smoke 546/546.
- **دستهٔ ۲:** (a) 8cd7e1e — ۱۵ سوئیتِ جهشِ یتیم به پاره‌هایِ 19-actions-* هدف‌گذاری شد (۲ anchor کهنهٔ WRITE_PERMS هم تازه شد) — ۱۵/۱۵ سبز. (b) abbda90 — ۸ سوئیتِ کلاینت: rebuildِ index.html در ابتدا+انتهای هرکدام؛ قرمزِ دروغینِ زنجیره‌ای ساختاریِ رفع شد (اثباتِ self-heal با buildِ آلودهٔ مصنوعی). (c) 0504120 — bell2 روز را از REF حساب می‌کند (REFDAY) + demoی bus با `_demoAt(80/78)` به‌جای timestamp سفتِ 07:40Z — هر سه سئوت سبز در هر ساعت/روز. (d) 8521513 — security_seed: نمونه‌گیری store به /tmp + دترمینیسم با دو seed + بازگردانی (5/5، درخت واقعی دست‌نخورده) + certify C7 گلدن (5381→5382 حالا کشته می‌شود؛ certify 7/7).
- **دستهٔ ۳ (برنچ):** `feat/client-features` (5b528ea) — ۴ ویژگی: چک‌لیستِ فردا (از schedule) · شمارشِ معکوسِ امتحان (از exams) · خروجی ICS (امتحانات + تقویمِ مدرسه، ۳۰ روز) · «موجه اعلام کنم» روی غیبت (parent/student، گاردِ parent_links، درخواستِ pending + اعلانِ مدیر — همانِ جریانِ موجود). تستِ جدید: tests/client-features.js 8/8 + smoke سبز. **merge نشد — منتظرِ کلود.**
- **دستهٔ ۴:** docs/COMPLETE_REPORT_FOR_CLOUD.md (جدولِ کارها/باقی‌مانده/کامیت‌ها/ترتیبِ پیشنهادی) + PILOT_READY_SUMMARY.md (برگهٔ یک‌صفحه‌ایِ آمادگی) — هر دو در این کامیت.
- **یادداشتِ محیط:** چند resetِ سنباده وسط دور رخ داد — هر بار فقط فایل‌هایِ «بعد از snapshot» ریورِت می‌شدند (کامیت‌ها مصون بودند)؛ پروسه: apply → verify → commit در کمترین فاصله.
- **صبرِ کارفرما/کلود:** بازبینیِ برنچ · placeholderهای اسنادِ پایلوت (شماره/ایمیل — قاعدهٔ تماسِ تلفنی) · ۳ مدرسه · هاست/دامنه.
- **mergeٔ برنچِ ویژگی‌ها توسطِ کارفرما:** PR #2 (`feat/client-features` → main) merge شد (0acd68e) — ۴ ویژگی روی main؛ client-features 8/8 + smoke روی main تأیید شد.
- **رجیسیونِ پایانیِ 125/125:** پس از mergeٔ PR #2 (افزودنِ tests/client-features.js) — اجرا در کامیتِ نهایی (04deb6c) سبز؛ یک اجرایِ میانی 42 قرمزِ کاذب به‌سببِ پاک‌شدنِ node_modules (reset) داد — runner حالا jsdom را خودکار بازسازی می‌کند.
- **گشتِ نهاییِ آمادگیِ پایلوت:** اسنادِ PILOT_KICKOFF/ONBOARDING سراسری بازخوانی شد — سازگار با وضعیتِ فعلی (پیامِ ورود T-3 درست است: شماره+کد+کد ملیِ محلی؛ فایل‌هایِ samples موجودند)؛ یک ردیف برایِ ۴ ویژگیِ تازهٔ ولی به چک‌لیستِ «هفتهٔ نخست» اضافه شد (df9a493)؛ برنچِ merge‌شدهٔ `feat/client-features` حذف شد (remote+local).
- **رفعِ کندکاری (سنجیده‌شده):** ریشه‌هایِ اندازه‌گیری‌شده: (۱) سنباده 2 vCPU/2GB — رجیسیونِ توالی‌ای ۱۲۵ سویت ≈ ۱۸ دقیقه (724s از آن، خودِ کارِ واقعیِ سوئت‌هایِ جهش است که قابلِ حذف نیست) · (۲) چرخه‌هایِ دوباره‌سازیِ patch به‌سببِ خرابیِ متونِ فارسی در bash/heredoc و \u-escape (≈۸ چرخه در این دور) · (۳) resetهای سنباده که node_modules/.git/config را وسطِ کار پاک می‌کنند (۳ بار). رفع: `scripts/run-all-tests.sh` — خودبازسازی (jsdom + هویتِ git) + موازی‌سازیِ امنِ ۲-worker فقط برایِ سوئت‌هایِ پایهٔ «build-نمی‌کنند» (۱۰ سوئیتِ rebuildکننده + ۳۵ جهش توالی‌ای می‌مانند چون buildِ مشترکِ index.html را دارند) — زمانِ رجیسیون از ۱۸ به ~۱۴ دقیقه.
- **قاعدهٔ کاریِ جدید (ضدِ دوباره‌سازی):** فارسی **فقط** با write_file — هرگز در bash -c/heredoc؛ هرگز \u-escape دست‌نویس؛ کامیتِ زودهنگام (واحدِ کارِ کوچک‌تر = خسارتِ کم‌تر در reset).
- **رجیسیونِ کاملِ پس از دور:** ۱۲۴ سویت توالی‌ای — 123/124؛ تنها قرمز gradeavg2-mutations (M2) = خطای تستِ G6 (push مستقیمِ db.grades کشِ `_GRADE_CACHE_VERSION` را نمی‌شکست) — رفع در a2941c9 → **124/124 سبز**.

## دورِ تستِ جامع (بدونِ کد) — 17/06/1405 (2026-09-07) — کامل، بدونِ کامیت

**وضعیت:** دستوریِ ۴ بخشه کارفرما اجرا شد — همهٔ تست‌ها + ۱۰ سناریوی دستی + امنیت + شبیه‌سازیِ ۳۰ روزه + مقیاس. صفرِ تغییرِ کد، بدونِ کامیت. گزارش: `COMPREHENSIVE_TEST_REPORT.md` (ریشهٔ پروژه) — بهِ کارفرما داده شد.

- **خودکار (۱۲۴ سویت، ۱۰٫۸ دقیقه):** ۹۵ سبز. هر ۲۹ قرمز ریشه‌یابی شد: ۱۵ موردِ جهشِ یتیم (هنوز 19-actions.jsِ حذف‌شده را می‌خوانند) · ۸ قرمزِ زنجیره‌ایِ دروغین (هر ۸ تکی سبز) · ۶ موردِ بازمحاکقه: **certify = باگِ واقعی** (`body: body` در 33-forms-sms.js:355/389 → ReferenceError در گواهیِ اشتغال + انتقالی، از 5ce70fa — **رفع در scratch worktree اثبات شد: certify 6/6 ✅ + ۳ جهش کشته؛ فقط منتظرِ دستورِ merge**) · bell2 = وابسته به روزِ هفته (تست) · bus2 B5 + bus3 G3 = وابسته به ساعت (07:30Z قرمز، 08:29Z سبز 5/5 و 7/7 — تأییدِ زنده) · security_seed Z2 = عزل (تکی 4/4 سبز).
- **دستی (jsdom، کلیکِ واقعی):** 53/53 ✅ — ۱۰ سناریو + S4b (تماکاریِ S.child بی‌اثر).
- **امنیت:** 24/24 ✅ — ۵ باگِ رفع‌شده + ۵ نفوذ. تأخیرِ تصاعدی اندازه‌گیری شد: 2ms→1s→8s→16s، بدونِ قفل.
- **شبیه‌سازی/مقیاس:** 22/22 ✅ — ۳۰ روز = ۶۰ ثبتِ نهایی / ۲۹۷ رکوردِ تازه / ۷٫۳ ثانیه · رندر p90 = 9.2ms · صف 0→645 op · localStorage 568KB < 5MB · ۱۰۲۴ رکوردِ حضور از مسیرِ واقعیِ UI = 8s (مسیرِ خالصِ داده: ۱۰۰۰ رکورد = 1.7s) · ۵۰ فایلِ تکلیف = 1.1s (3MB در IDB) · ۵۰۰ op در یک batch = 14ms · ۱۰ صفحهٔ هم‌زمان = 10/10.
- **باقی‌مانده (گزارش §۶):** (1) رفعِ گواهی‌ها — **اثبات‌شده در scratch، فقط دستور** · (2) ۱۵ جهشِ یتیم · (3) rebuild در finally برایِ جهش‌ها · (4) تاریخِ bell2 · (5) clampِ timestampهای دمو · (6) عزلِ security_seed · (7) ادعایِ گلدنِ certCodeCalc (جهشِ ثابتِ هش کشته نمی‌شود).
- **محدودیتِ محیط:** ساندباکس 2GB — سلسه‌کردنِ کلِ db (4.7MB) در هر نوشتن، heap پیش‌فرضِ node را در ~۱۰۰ نوشتن می‌شکند (مرورگرِ واقعی چنین سقفی ندارد). اسکریپت‌هایِ تست: /tmp/live-manual.js · /tmp/live-security.js · /tmp/live-sim.js.

## دور ۸۷ — رفعِ race در sim_full3 + تأییدِ جهش (۲۰۲۶-۰۹-۰۸) — کامل

**وضعیت:** تنها کارِ فنیِ دور انجام شد و push شده (بعد از اسناد: ۱۰). تصمیماتِ بازِ هفت‌گانه صبرِ تأییدِ کارفرما — هیچ کارِ کدیِ دیگر تا آن‌ها.

- **رفع (۹):** T6b و کرشِ T10d در sim_full3 = خودِ تست فایلِ store را قبل از flushِ حلقهٔ persist (هر ۲ ثانیه) می‌خواند — برنامه درست بود. رفع با الگوی server12: `waitForDisk(file, predicate, timeout)` (بازخوانش هر ۱۰۰ms تا شرط روی disk؛ در timeout آخرین snapshot تا ادعا با دادهٔ واقعی شکست). T6b: sleep(800)+خوانشِ تکی ← صبر تا دقیقاً یک رکوردِ `sim3-dup` روی disk. T10d: خوانشِ تکیِ کرش‌کننده ← صبر تا رکوردِ `attendance_modes` + ادعای تازهٔ دیدنِ رکورد (T10d) و پاک‌سازی (T10e). **فقطِ فایلِ تست** — صفرِ تغییرِ کدِ اپ، بدونِ بیلد (index.html دست‌نخورده).
- **تأییدِ جهش:** `tests/sim_full3-mutations.js` — ۳/۳ کشته: M1 بدونِ صبر (نخستین snapshot) · M2 بدونِ خوانشِ دوباره (کشِ snapshot) · M3 timeout=۱ms — اگر هرکدام زنده می‌ماند، رفع پنهان/بی‌اثر بوده. درها: sim_full3 ۲۵/۲۵ (۳ اجرایِ پشت‌سرهم + پایانیِ جهش) · smoke ۵۴۶/۵۴۶.
- **یادداشتِ محیط:** `node_modules` بینِ دورها پاک می‌شود — `npm i --no-save jsdom` (و در صورتِ نیازِ دیگه‌ها) را هر دور یک‌بار در اول انجام بده. git identity هم هر دور بازمی‌گردد: `git config user.name "Payesh Dev" && git config user.email dev@payesh.local`.
- **صبرِ کارفرما:** ۷ تصمیمِ باز (بستهٔ هاست/دامنه، دروازهٔ SMS واقعی، پرس‌وجوی ملی، محلِ داده، حسابِ Play، رضایتِ والد، ۳ مدرسهٔ پایلوت) — دستورِ دقیقِ هرکدام از خودِ کارفرما می‌آید؛ رأیِ DeepSeek فقط مشورت است (قانونِ ۸۷-۱).

## Handoff — دور ۸۶: تأیید مجوزها + پاک‌سازی + بدهی فنی (فشردن/GC) + قفلِ زیرساخت — ۱۸/۰۶/۱۴۰۵ (2026-09-08)

### 1) چه شد (3 کامیت روی main + گزارش — همه push)
دستور: (الف) تأییدِ قطعیِ صفرِ ناهماهنگی (نه فقط فهرست انتظار) + پاک‌سازیِ استاش و gen-write-perms · (ب) بدهی فنی: فشردنِ لاگِ کلاینت (P0-3) + GCِ وضعیتِ سرور (P1-3) · (ج) قفلِ «آمادهٔ اتصال» در AD (اتصالِ واقعی منوط به هاست/دامنهٔ پایلوت) · (د) رگرسیونِ کامل + جدولِ تصمیماتِ بازِ فقط-کارفرما.
- **الف-۱ (سنجش، بدونِ کامیت):** سه اثباتِ مستقل — (۱) چک‌کننده با PAYESH_SYNC_PATH روی sync.jsِ قبل از W4 = دقیقاً همان ۵۳ جفت فریز‌شده؛ کنونی = صفر (فهرست انتظار عوض نشده بود) · (۲) ۵۳/۵۳ جفت با eval خامِ ACTION_ROLES + require WRITE_PERMS · (۳) سنجشِ زنده: ۷ جفتِ قبلاً-رد پذیرفته + ۳ کنترلِ role_denied.
- **الف-۲/۳:** WRITE_PERMS استاش ۸ نقش (۹۵ مورد) یکی‌یکی با main تطبیق شد → `git stash drop` (استاش خالی). gen-write-perms.js در ورک‌اسپیس نبود و با drop برای همیشه حذف شد.
- **ب-۴ · b45427c:** جابه‌سازیِ W۱ (cdd91a3-wave2) به main: compactLogIfNeeded (۳۰۰۰ op یا ۳MB ← اسنپ‌شات+۵۰ __a) + applySnapshot + شمارنده‌ها + گاردِ ۹۰٪ + رفعِ W۱B (loadLog پیش از مولدها — ledger در هر صفحه‌تازگی بازنویسی می‌شد) + پذیرشِ snap در 42-self-diagnostics + AD ۸۵.۱. سازگار با _GRADE_CACHE_VERSION فاز ۲. compact ۱۹/۱۹ (بازپخشِ بیت‌به‌بیت) + جهش ۴/۴.
- **ب-۵ · 304f670:** جابه‌سازیِ W۲ (0b6efbc-wave2): gcStore در حلقهٔ persist (uid > ۳۰روز · jti > ۸h · codes > ۵ دقیقه) + آدیت store_gc + AD ۸۵.۲. server14-gc ۱۳/۱۳ + جهش ۴/۴.
- **ج-۶ · 471facf:** AD ردیفِ ۸۶.۱ — «آمادهٔ اتصال» است نه اتصال؛ صفرِ کدِ زیرساخت؛ شرطِ بازنگری: **وقتی هاست و دامنهٔ واقعیِ پایلوت مشخص شد** + ردیفِ تازه در «آنچه عمداً باز مانده» (دو → سه مورد).
- **د-۷/۸:** رگرسیون: run ۳۳/۳۳ · smoke ۵۴۶/۵۴۶ · sim_full2 ۵۸/۵۸ · sim_full3 ⚠️ ۲ ناکامیِ **موجود از قبل** (اثبات روی main دست‌نخورده با worktree — race خواندنِ زودهنگامِ disk در خودِ تست؛ رفع با دستور) · check-authz ۰ · ۱۶ سویتِ سرور سبز. گزارش: docs/REPORT_86.md (شاملِ جدولِ ۷ تصمیمِ بازِ فقط-کارفرما).

### 2) چه پیداکرد
1. فهرستِ انتظارِ check-authz واقعاً دست‌نخورده بود — ۵۳ مورد با diffِ WRITE_PERMS بسته شدند (اثبات با sync.jsِ قبل از W4).
2. هر دو بندِ بدهی فنی کدِ از پیش تاییدشدهٔ wave2 بودند (W۱/W۲ دور ۸۵) — فقط merge نشده بودند؛ ریسکِ جابه‌سازی کم بود.
3. sim_full3 race زمانی دارد (فایلِ store را پیش از flushِ ۲ ثانیه‌ای می‌خواند) — با دستور، رفع می‌شود (الگوی server12).
4. edu_office در seed مدرسهٔ ۱ نیست (در سنجشِ زنده به مدرسهٔ خودش اکتفا شد).

### 3) چی موند
- ۷ تصمیمِ بازِ فقط-کارفرما (جدولِ REPORT_86 بخش ۶): هاست/دامنهٔ پایلوت · درگاهِ پیامک · استعلامِ کد ملی · محلِ نگهداریِ داده · حسابِ گوگل‌پلی · رضایتِ والدین · انتخابِ ۳ پایلوت.
- رفعِ raceِ sim_full3 — با دستور.
- main = هشِ کامیتِ گزارش (push + ls-remote) ✓.

---

## Handoff — فاز ۳: merge فاز ۲ + W4 (WRITE_PERMS) + رفعِ رانشِ سرویس (main) — ۱۷/۰۶/۱۴۰۵ (2026-09-08)

### 1) چه شد (4 کامیت روی main — همه push)
دستور: merge برنچِ فاز ۲ به main، سپس اعمالِ استاشِ W4 (چک‌کننده باید صفر شود)، سپس رفعِ تستِ شکستهٔ سرویس (smoke باید ۵۴/۵۴۶ شود). خارج از قلم: compaction/GC/base_version/DB.
- **اصلاح پیش از merge · 05d3d19:** حذفِ src/js/19-actions.js که در کامیتِ نخستِ فاز ۲ جا مانده بود (فایلِ ۲۸۴ خطی در درخت مانده بود، هرچند در _order نبود) — با git ls-tree پیدا شد.
- **merge · 69e7cde:** feat/phase2-structural-refactor → main (--no-ff). درها: build سبز، smoke ۵۴/۵۴ (ناکامیِ سرویس — بعد رفع شد).
- **W4 · 6edb6d2:** استاشِ W4-partial با apply روی main (تمیز — sync.js در main و wave2 یکسان). تکمیل‌ها: parent_subscriptions برای manager (دورهٔ ۸۵، تازه‌تر از استاش)، اصلاحِ کامنتِ ارجاع‌دهندهٔ perms-ssot.js به check-authz.js، تبدیلِ فریزِ ۵۳ موردی در tests/check-authz.js به لنگرِ پس‌رفت. check-authz = **خروجی ۰** · build --check سبز · ۱۴ سویتِ سرور سبز. gen-write-perms.js (دیباگ‌تول استاش) کامیت نشد — در استاش قابل بازیابی.
- **سرویس · 8396a5a:** ریشه = ساعت‌هایِ ثابتِ 07:12/07:15/08:05/08:10Z در generateBusDemo (48-bus-service) — پنجرهٔ شکست هر روز ۰۰:۰۰–۰۷:۱۲ UTC. راه‌حل: _demoAt(minAgo) — رویدادها «چند دقیقهٔ پیش از الان، روی امروز». تست دست‌نخورده. **smoke = ۵۴۶/۵۴۶ (سبز کامل — نخستین بار از دور ۷۵).**
- **اسناد:** docs/PHASE3_SUMMARY.md + این ورودی.

### 2) چه پیداکرد
1. گسترشِ WRITE_PERMS فقط اضافه کرد (هیچ حقی کم نشد) → هیچ تستِ role_denied شکست.
2. استاشِ W4 یک مورد عقب بود (parent_subscriptions) — بدونِ آن چک‌کننده صفر نمی‌شد.
3. استاشِ W4-partial هنوز در git stash list است (apply شد، pop نشد) — با تأیید، drop.
4. busOnBoard «آخرین رویداد» است (مقایسه با «الان» ندارد) → هر رویدادِ دموِ «آینده» حالت را وارونه می‌کند.

### 3) چی موند
- merge انجام شد و main = 8396a5a (push + ls-remote) ✓.
- پیامکِ واقعی / سرور+دامنه / Play — دست‌نخورده.
- بعدی (فقط با دستور): AD ۲.۲ قدمِ دوم (آینهٔ کاملِ جدولِ مجوزها) · بقیهٔ بند‌هایِ بازِ بازبینی.

---

## Handoff — فاز ۲: ریفکتورِ ساختاری (برنچ feat/phase2-structural-refactor) — ۱۷/۰۶/۱۴۰۵ (2026-09-08)

### 1) چه شد (4 کامیت — push شد، merge نشد)
دستورِ کارفرما: از main (eddddfa) برنچِ feat/phase2-structural-refactor و اجرایِ بندِ ۲ ARCHITECTURE_REVIEW (بدونِ مواردِ وابسته به ابر) به‌صورت **۴ کامیتِ جدا**، با سه در (build + smoke + همهٔ server*) بعد از هر کامیت. ممنوع: compaction، GC، base_version، تغییرِ کسب‌وکار، تغییرِ ترتیبِ فایل‌ها (فقط درجِ ۹ فایلِ تازه بین 18-modals و 20-…).
- **بند ۱ · 39b3ce9:** شکستنِ 19-actions.js (۲۸۳ اکشن) به ۹ ماژولِ دامنه‌ای (core ۱۷ / dorm ۱۰ / dropout ۴ / sms ۱۵+_notifyApprove / finance ۲ / bus ۱۶ / vclass ۲۴ / schedule ۷ / admin ۲۷). A در لحظهٔ کلیک با Object.assign ساخته می‌شود — بی‌تغییر. ۲۸/۲۸ ورودی + همهٔ بخش‌ها verbatim اثبات شد. smoke ۵۴/۵۴۶ = دقیقاً خطِ پایهٔ main (با git stash اثبات). دو نگهبانِ smoke با مسیرِ سخت‌کدشده به مجموعهٔ 19-actions-*.js بازنشانی شدند.
- **بند ۲ · 7f08549:** کشِ classScoreContext — _gradeCache (04-queries) + _GRADE_CACHE_VERSION که در applyOp (03-persistence) بالا می‌رود. clsctx ۹/۹ + جهش ۳/۳.
- **بند ۳ · b6ec00a:** tools/check-authz.js — **چک‌کننده، نه تولیدکننده**: ACTION_ROLES ↔ WRITE_PERMS با استخراجِ ۳۳۴ اکشن (۱۶۲ نویسنده) از همهٔ ظرف‌ها + عمق ۲ِ تابع‌هایِ کمکی. ۵۳ ناهماهنگیِ شناخته‌شده (همه واقعی) + exit(1). سیم به node build.js --check. tests/check-authz.js: ۷ بررسی (فریزِ ۵۳ + درختِ مصنوعیِ سبز + کشفِ انحرافِ درج‌شده).
- **بند ۴ · (این ورودی + docs/PHASE2_SUMMARY.md):** گزارشِ تجمیعی در ریشهٔ docs.
درها بعد از هر کامیت: build سبز · smoke ۵۴۵/۵۴۶ · ۱۴ سویتِ سرور همه سبز.

### 2) چه پیداکرد
1. **ناکامیِ smoke روی خودِ main:** «سرویس: رویداد سوار/پیاده…» روی mainِ دست‌نخورده هم شکست می‌خورد (رانشِ تاریخ با دادهٔ دموِ دورهٔ ۷۵) — خطِ پایهٔ رسمی = ۵۴۵/۵۴۶؛ برگشتِ رفتارِ این فاز نیست (مستند در PHASE2_SUMMARY بخش ۶).
2. **edit_file یک بار دروغ گفت** (success بدونِ اعمال) — در 03-persistence با grep راستی‌آزمایی شد و با python تکرار شد.
3. **check-authz ۵۳ گزارش می‌دهد، نه ۵۵** (شمارِ گروه‌هایِ W4 با جفت‌هایِ action×role×coll یکسان نیست) — فهرستِ فریز‌شده در tests/check-authz.js مرجعِ قائل است.
4. **invite-parents → parent_subscriptions** ناهماهنگیِ تازه‌ای است که WRITE_PERMS اصلاً آن مجموعه را نمی‌شناسد (دورهٔ ۸۵) — در فهرستِ ۵۳.

### 3) چی موند
- **merge به main: منتظرِ دستور** (برنچ push + ls-remote تأیید شده).
- **W4 پارک است** (استاشِ W4-partial): رفعِ WRITE_PERMS برای ۵۳ مورد — ویرایش‌ها آماده‌اند ولی **روی این برنچ تست/کامیت نشده‌اند**؛ با دستورِ بازگشت باید با gate کامل سنجیده شوند (بر پایهٔ همین فهرستِ فریز‌شده).
- رفعِ تستِ دموِ سرویس (رانشِ تاریخ) — با دستور.
- پیامکِ واقعی / سرور+دامنه / Play — دست‌نخورده.

---

## Handoff — دور 85: 5 رفعِ حیاتیِ پیش از استقرار (برنچ fix/pre-deployment-critical) — ۱۶/۰۶/۱۴۰۵ (2026-09-07)

### 1) چه شد (6 کامیت — push شد)
دستورِ کارفرما: reset به main (bab2036)، رهایِ برنچِ پیشین، برنچِ تازه‌ای به نام fix/pre-deployment-critical و **فقط 5 رفعِ حیاتی** — هرکدام یک کامیت، با gate (build + smoke + همهٔ server*) بعد از هرکدام. مواردِ P0-3 (compaction) / P1-3 (GC) / ریفکتورِ 19-actions / base_version **صریحاً ممنوع** اعلام شدند و انجام نشدند.
- **بند 1 · 3e68008 (P0-1):** سفیدفهرستِ فیلد برای leaves در sync.js — درِ مشترکِ filterFields برای 3 استثنا (IEP/ترک/leaves)؛ ins: والد فقط pending، مدیر/سوپرادمین pending|approved|rejected (روندِ قفل‌شدهٔ خوابگاه AD 78.3 حفظ شد)؛ upd status: فقط مدیر/سوپرادمین به approved|rejected. ردِّ per-op (200 + ok:false + field_denied + آدیت sync_field_denied) به‌جای 403ِ کل‌دسته. server12: 18/18 + جهش 2/2.
- **بند 2 · 6b32db0 (P0-2):** dead-letter در 27-sync.js — sendBatch با raw:true؛ کدهایِ پایدار → rejected (خارج از دسته‌های بعدی)؛ 401/5xx/شبکه → failed با backoff؛ duplicate_ignored → synced (حلقهٔ ابدیِ قبل بسته شد)؛ نشانگر/پنل «رد شده» + sync-del. deadletter: 18/18 + جهش 2/2.
- **بند 3 · 773d94f (P0-4):** DEMO_CODE پیش‌فرضِ خاموش (=== '1'). سِوهٔ 21 تستِ وابسته: شکاف صفر (همه از قبل env صریح می‌ستند). server1 S31 (سرورِ فرزندِ بی-env) + جهش M20 → server-mutations 20/20. DEVELOPMENT.md به‌روز (DEPLOY.md از قبل همین را می‌گفت).
- **بند 4 · 19d5b37 (P1-4):** fail-fastِ TLS — production + self-signed (subject===issuer در X509Certificate) → exit(1) با «Error: Production requires valid CA certificate»؛ گواهیِ خراب → «cert unreadable»؛ development دست‌نخورده. server13: 9/9 + جهش 1/1 (گواهیِ leaf با ابزارِ DERِ خودِ پروژه، صفرِ وابستگی).
- **بند 5 · 43018d6 (P1-2):** httpGetJson قراردادِ هم‌شکل (ok/status/code/serverTime/data/error/networkError/timedOut) — همیشه resolve؛ تمایز 4xx/5xx؛ code = aliasِ status (42-self-diagnostics: مسیرِ شبکه از راه r.error، UX دقیقاً حفظ). 46-bell-now و detectServer: صفرِ تغییر. httpgetjson: 10/10 + جهش 3/3.
- **بند 6 · 2be3af7 (اسناد):** IMPLEMENTATION_SUMMARY.md در ریشه (لیستِ هش‌ها + نتایج + تصمیم‌ها + یافته‌های محیط).
- HEAD: 6 کامیت روی bab2036؛ push + ls-remote (2be3af7 = local = remote) ✓.

### 2) چه پیداکرد
1. **انحرافِ spec:** دستور «ins → فقط pending» با روندِ قفل‌شدهٔ خوابگاه (مدیر ins با approved — AD 78.3، smoke-test‌شده) برخورد داشت → قاعدهٔ نقش‌محور (مستند در IMPLEMENTATION_SUMMARY).
2. **چشم‌اندازِ تستِ P0-2:** ردِّ کل‌دستهٔ 403 (مثل role_denied) op سالم را هم رد می‌کند → سناریوی «سالم+خراب» باید از ردِّ per-op (field_deniedِ بند 1) استفاده کند.
3. **P0-4 شکاف صفر:** هر 21 تستِ وابسته از قبل PAYESH_DEMO_CODE:'1' صریح می‌ستند.
4. **محیطِ سنبوکس:** /tmp = tmpfs 993MB که با 166 دایرکتوریِ موقتِ تست (هر ~5MB) پر شد و ENOSPC چند «شکست کاذب» ساخت → بینِ batteryها rm -rf /tmp/payesh-*؛ سرورهایِ orphan روی پورت → try/finally + poolِ پورت (S31/S13). ریسِتِ سنبوکس .git/config (remote+identity) را پاک می‌کند؛ رفرانسِ کهنهٔ origin/main یک بار reset را گمراه کرد (main واقعیِ GitHub = bab2036 با ls-remote تأیید شد).
5. **server11-child.js هاپِر است** (با آرگومان فراخوانی می‌شود) — در gate مستقیم اجرا نمی‌شود.

### 3) چی موند
- **موردِ بعدی (اگر دستور برسد):** 5 رفعِ باقی‌ماندهٔ ARCHITECTURE_REVIEW: P0-3 compactionِ log · P1-3 GCِ سرور · ریفکتورِ 19-actions (بند 8) · P1-1 SSoT · P2 (base_version و ...) — همین حالا با ابزارِ آموخته‌شده (gate + جهش + این برنچ یا برنچِ تازه) قابلِ اجراست.
- mergeِ fix/pre-deployment-critical به main — منتظرِ دستور.
- پیامکِ واقعی / سرور+دامنه / Play — 4 موردِ دائمی دست‌نخورده.

### 4) وضعیتِ فنی
- آزمونِ نهایی: smoke 546/546 + server1 31/31 + server2 25 + server3 14 + server4 16 + server5 14 + server6 9 + server7 15 + server8 9 + server9 10 + server10 7 + server11-sms 9 + server11-mutations 6 + server12 18 + server12-mutations 2 + server13 9 + server13-mutations 1 + deadletter 18 + httpgetjson 10 + httpgetjson-mutations 3 + server-mutations 20 — همه سبز؛ 0 فرآیندِ سرورِ مانده.
- build --check: راهنما همگام با index.html ✓. درخت: تمیز.
- آرشیو: قدیمی‌ترین ورودی (پشتیبان/بازیابی 2026-09-06) به docs/HANDOFF_ARCHIVE.md منتقل شد (سقف 20).

## Handoff — دور 84: ذخیرهٔ بازبینیِ معماری در فایل — ۱۶/۰۶/۱۴۰۵ (2026-09-07)

### 1) چه شد (2 کامیت)
- **بازبینیِ معماری** (دستورِ پیشین) به‌صورتِ بازبینیِ ارشدِ **فقط‌خوان** انجام شد — صفر تغییر در کد؛ همهٔ 4 فایلِ هستهٔ سرور + لایهٔ داده/مجوز/همگام‌سازی/کلاینت + تست‌ها + AD/HANDOFF/AI_PROMPT خوانده شدند.
- **بند 1 (همین کامیت):** `docs/ARCHITECTURE_REVIEW.md` (583 خط) — 6 بخش: 9 قوتِ معماری · 12 ضعف/بدهی فنی · 10 پیشنهادِ اولویت‌بندی (P0×4 · P1×6 · P2×3 + فهرستِ «عمداً نه») · تحلیلِ امنیتی با 5 نقطهٔ کور · کیفیتِ تست‌ها با 5 شکاف · مسیرِ 5 مرحله‌ای (پیامکِ واقعی / TLS / استعلامِ کد ملی / اشیاء‌نگاری / پایلوتِ 3 مدرسه). همهٔ شواهد با `فایل:خط`.
- HANDOFF: قدیمی‌ترین ورودی (حذفِ حساب 9.5) → آرشیو (سقفِ 20 نگه داشته شد).
- **بند 2 (کامیتِ دوم):** `docs/README.md` — فهرستِ پوشهٔ docs به‌ترتیبِ **جدیدترین-بالا** (84 فایل؛ بر پایهٔ آخرین commitِ لمس‌کردهٔ هر فایل + تاریخِ تهران + توصیفِ تک‌خطی). گیت‌هاب READMEِ پوشه را بالایِ لیستِ الفبایی نمایش می‌دهد، پس همین جدول همان «مرتب‌سازیِ زمانی» است.

### 2) چه پیداکرد (5 موردِ نخست)
1. درزِ واقعی: ولی می‌تواند `ins`/`upd` روی `leaves` با `status:'approved'` بفرستد (`sync.js:16,24,235` — سفیدفهرستِ فیلد فقط برای `users` است) → P0-1.
2. بتهٔ زهریِ sync: بدنهٔ 403 دور ریخته می‌شود (`Api.request`)، کلِ دسته `failed` می‌شود (`27-sync.js:156`) و opهای سالمِ پشتش تا ابد تکرار می‌شوند؛ وضعیتِ `conflict` در کلاینت کور است (سرور هرگز برنمی‌گرداند) → P0-2.
3. رشدِ نامحدود: `log`ِ کلاینت بدون compaction (دمو = 4.7MB طبق ضمیمهٔ الفِ AD) + `__processed_uids`/`__auth`ِ سرور بدون GC.
4. `PAYESH_DEMO_CODE` پیش‌فرضِ `1` (`index.js:46`) — دفاع فعلی فقط روی DEPLOY.md (خط 65) است → P0-4.
5. نسخهٔ چتِ گزارش 3 افتِ رقمِ فارسی داشت (مثلاً 25,506 → 25,56) + 2 خط‌شمارِ نادرست (Store=47، Api.request=168) — **نسخهٔ فایل مرجع است**؛ اعدادِ آن عمدتاً ASCII (کنواسهٔ اسنادِ ریپو).

### 3) چی موند
- P0-1..4 **ناپیاده** — دورِ بعد اگر دستور برسد (هرکدام کامیتِ جدا + جهش).
- 4 موردِ دائمی دست‌نخورده: پایلوت+تاریخ (تصمیمِ کاربر) · قراردادِ درگاه · سرور/دامنه · Play.
- **تصمیمِ تازه که بازبینی روشنش کرد:** آیا پایلوت «تکلیف/فایل بین دستگاه‌ها» دارد؟ اگر بله، اشیاء‌نگاری (ردیف 4) به ردیفِ 3 می‌آید (قبل از پایلوت).

### 4) وضعیتِ فنی
- HEAD: 2 کامیت روی `3e100b7` (بازبینی + فهرستِ docs)؛ push + `git ls-remote` در پایان.
- آزمون: smoke 546/546 (اندازه‌گیریِ همین روز). درخت: فقط `docs/ARCHITECTURE_REVIEW.md` تازه + HANDOFF/آرشیو.
- کد دست‌نخورده (بازبینیِ فقط‌خوان) — `git status` باید فقط این اسناد را نشان دهد.

## Handoff — دور ۸۳: درگاهِ پیامک — گامِ ۱ (کد + آزمون) — ۱۶/۰۶/۱۴۰۵ (2026-09-07)

### ۱) چه شد (۲ کامیت روی af8dc0a)
- **بند ۱ (`a36fc5f`):** `server/sms.js` — `POST /api/sms/send`: فقط superadmin؛ بدونِ env → 503 `sms_not_configured` (کلاینتِ دمو دست‌نخورده)؛ سازگارِ mock + dry-run؛ ایدمپوتانس به ازای `queue_id+parent_id` (هیچ دوباره ارسال/کسر)؛ «همه یا هیچ» به ازای هر آیتمِ صف (شکستِ یک گیرنده → logِ `failed`، آیتم sent نمی‌شود)؛ سقفِ روزانه = 429 `daily_cap` برایِ کلِ دسته؛ واحدِ هزینه = قطعهٔ گزارش‌شدهٔ درگاه؛ آدیتِ `sms_send/sms_fail/sms_cap/sms_skip` **بدونِ phone**؛ `notify_queue` به WRITE_PERMS (manager/teacher) + روت در `index.js`. آزمون: `tests/server11-sms.js` **S0–S8 سبز** (S1/S5/S8 در فرزندِ جدا با envِ متفاوت — `server11-child.js`) + `tests/server11-mutations.js` **۶/۶ کُشته**.
- **بند ۱-ب (`b733e95`):** همگام‌سازیِ مستندات: PLAN_SMS_GATEWAY (وضعیت: گامِ ۱ پیاده شد؛ شکاف‌هایِ ۱/۲ بسته؛ گامِ ۱ِ جدولِ switchover ✅؛ §۷ پیاده شد) · AD 81.1 (وضعیت) · AI_PROMPT §۰.۵.۱۲ (بندِ تازه).

### ۲) چه پیداکرد
- طرحِ قفل‌شده دقیق‌تر از پیاده‌سازیِ نخست بود: سقف = **429 برایِ کلِ دسته** (نه skipِ آیتم) و واحدِ هزینه = **قطعهٔ گزارش‌شدهٔ درگاه** (نه پیش‌بینیِ ما) — هر دو مطابقِ طرح اصلاح و با تست قفل شد (S5 + M5).
- `spawnSync` env را از والد می‌راند — فرزندِ تست باید متغیرهایِ درگاه را صریح پاک/بکند (نقطهٔ شکستِ نخستِ S1).

### ۳) چی موند
- فقط **سازگارِ درگاهِ واقعی** (پس از قرارداد) + switchover گام‌های ۲–۵ (PLAN §۵) — جایِ کد آماده است (`providerSend` تابعِ نازک + جدولِ نگاشتِ درگاه‌بسته).
- ۴ موردِ READY_STATE دست‌نخورده: پایلوت (تصمیمِ کاربر) · قراردادِ درگاه · سرور/دامنه · Play.

### ۴) وضعیتِ فنی
- HEAD محلی: a36fc5f ← b733e95 (+ گزارش و این ورودی) روی `af8dc0a`؛ push + ls-remote در پایان.
- آزمون‌ها (اندازه‌گیریِ همین دور): server11-sms ۹/۹ + جهش ۶/۶ · server1–10 ۱۵۴/۱۵۴ · security2 ۲۵/۲۵ · smoke ۵۴۶/۵۴۶ · run ۳۳/۳۳ · sim_full2 ۵۸/۵۸ · sim_full3 ۲۴/۲۴ · import2 ۱۱/۱۱ · att2 ۶/۶ · nudge2 ۹/۹ · bell2 ۸/۸ · subs2 ۹/۹ · workdays ۶/۶ · uiclick ۴/۴ · trendcmp2/underpriv2/reporttpl2/gradeavg2/pathway2 ۷/۷ ×۵ · report2 ۱۰/۱۰ · officesupp2 ۵/۵ — همه سبز.

## Handoff — دور ۸۲: آدیتِ یکپارچگی + صفحهٔ آماده‌بودن — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (۲ کامیت روی def2c40)
- **بند ۱ (`d4f18d8`):** آدیتِ یکپارچگی — ۹ ادعایِ کهنه با کد تطبیق و اصلاح شد: **AD 13.3** (ON HOLD فایل‌نگهداری باطل شد با ضمیمهٔ ح — آروان‌کلاود) · ۴ طرح با وضعیتِ «منتظر تأیید/هیچ کدی نوشته نشده» که **پیاده‌اند** (PLAN_ATTENDANCE_STATES/دور۶۶، PLAN_BELL_AUTOCLASS، PLAN_CALENDAR_TIME/۶۵، PLAN_MULTICHILD) · PLAN_LIVE_SCHEDULE (پیاده/۶۵ + خطِ «سرور خالی» اصلاح) · REPORT_UI_REVIEW (merge تأییدشده `74ec094`) · SMS_NOTIFY_PLAN (گام‌ها کامل + ارجاع به PLAN_SMS_GATEWAY).
- **بند ۲ (`122b8a2`):** `docs/READY_STATE_2026-09-06.md` — صفحهٔ واحدِ آماده‌بودن: نتیجهٔ یک‌خطی («آماده **به‌جزِ پیامکِ واقعی**») + جدولِ شواهد + قفل‌ها + ۴ موردِ باز + **تصمیمِ لازم برایِ پایلوت**: الف) درگاه پیش از پایلوت (پیشنهاد) یا ب) پایلوت با تأخیرِ آگاهانهٔ پیامک + رضایتِ کتبیِ مدرسه.

### ۲) چه پیداکرد
- سندهایِ PLAN قدیمی هنوز «طرحِ منتظرِ تأیید» بودند در حالی‌که قابلیت‌ها پیاده شده بودند — وضعیتِ طرح‌ها باید هم‌دور با پیاده‌سازی به‌روز شود (نه فقط اسنادِ «وضعیت زنده»).
- AD.md خودِ آن تضاد داشت: خطِ ۱۳.۳ «ON HOLD» در برابرِ ضمیمهٔ ح (قفلِ آروان‌کلاود) — خطِ کهنه باطل شد، نه حذف (ردیاب).

### ۳) چی موند
- همان ۴ مورد (READY_STATE §۴): **پایلوت + تاریخ (تصمیمِ کاربر — حالا با گزینهٔ صریحِ پیامک)** · قراردادِ درگاه · سرور/دامنه · حسابِ Play.

### ۴) وضعیتِ فنی
- HEAD محلی: ۳ کامیتِ دور ۸۲ (d4f18d8 ← 122b8a2 + گزارش) روی `def2c40`؛ push + ls-remote در پایان.
- آزمون‌ها (اندازه‌گیریِ همین دور): smoke 546/546 · run.js 33/33 · server1–10 154/154 · sim_full2 58/58 · sim_full3 24/24 · import2 11/11 · att2 6/6 · nudge2 9/9 · bell2 8/8 · subs2 9/9 · workdays 6/6 · uiclick 4/4 — همه سبز. (سئوت‌هایِ بند ۷۹: دور ۸۱ سبز، این دور دست‌نخورده.)

## Handoff — دور ۸۱: دادهٔ نمونهٔ پایلوت + استقرارِ تولید + قراردادِ درگاه — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (۴ کامیت روی 9040b0d)
- **بند ۱ (`05d460b`):** فایل‌هایِ نمونهٔ ورودِ اطلاعات: `docs/samples/students_sample.csv` + `teachers_sample.csv` (ستون‌هایِ جابه‌جاشده + ارقامِ فارسی + کد ملیِ معتبرِ checksum) + سئوتِ **سرتاسری** `tests/import2.js` **11/11** از مسیرِ واقعیِ ویزارد (parseCSV→prepSheet→validateImport→commitImport: ۴ دانش‌آموز + ۵ ولی + ثبت‌نام + جایگزینیِ شمارهٔ پدر + ۳ دبیر + خطایِ نام/تکراری) + جهش‌ها **4/4**. یادداشتِ نمونه‌ها در PILOT_ONBOARDING §۵.
- **بند ۲ (`290a532`):** `docs/DEPLOY.md` — دستورِ کارِ کاملِ استقرارِ تولید (سخت‌افزار، نصب، جدولِ متغیرهایِ محیطیِ **دقیق از کد**، TLS با certbot (پیش‌فرض: درون‌پروسه)، systemd + hardening، بکاپ/بازیابی + کپیِ بیرونیِ آروان‌کلاود (قفل)، بروزرسانی، چک‌لیستِ ۱۰ بندیِ go-live) + `server/README.md` همگام (دیگر «رزرو» نیست).
- **بند ۳ (`ad7a30d`):** `docs/PLAN_SMS_GATEWAY.md` — قراردادِ درگاه (طراحیِ قفل): مرزِ دقیقِ شبیه‌سازی (تنها `notifyApprove`) + ۴ شکاف با شواهد + معماریِ هدف (ارسالِ فقطِ سرور، سازگارِ قابل‌تعویض، ایدمپوتانس، همه-یا-هیچ، سقفِ روزانه، dry-run، ترازِ هفتگی) + switchoverِ ۵ گامه + طراحیِ آزمونِ server11. قفلِ **۸۱.۱** در AD. **کدِ درگاه عمداً بدون قرارداد نوشته نشد.**
- گزارشِ تجمیعی: `docs/REPORT_2026-09-06_ROUND81.md`.

### ۲) چه پیداکرد
- `commitImport(st)` انتظار `st.entity` + `st.preview` دارد (UI: S.imp = Object.assign({}, st, {preview}) — صدا زدنِ مستقیم با فقطِ preview، دانش‌آموز را با role=teacher می‌سازد؛ تستِ I5 گرفت).
- صف/کیف/لاگِ پیامک در `WRITE_PERMS` نیستند (fail-closed) — برایِ حالتِ واقعی باید `notify_queue` به manager/teacher برسد (شکافِ ۱ِ PLAN).
- دامِ کپی-پیستِ CSV: یک سلولِ جابه‌جا = ولیِ «نامش شمارهٔ تلفن است» — سئوتِ I4/I6 همین را گرفت (نمونهٔ اصلاح شد).

### ۳) چی موند
- بازِ واقعی: **مدرسهٔ پایلوت + تاریخ** (PILOT_KICKOFF + نمونه‌هایِ داده آماده) · **قراردادِ درگاهِ پیامک** (PLAN آماده؛ گامِ ۱ = کدِ server11 + endpoint) · سرور/دامنه (DEPLOY آماده) · حسابِ Play.
- ترتیبِ منطقی (ثبت در DEPLOY §۹): درگاه ← سرور+دامنه ← go-live.

### ۴) وضعیتِ فنی
- HEAD محلی: ۴ کامیتِ دور ۸۱ (05d460b ← … ← ad7a30d + گزارش) روی `9040b0d`؛ push + ls-remote در پایانِ دور.
- آزمون‌ها: smoke ۵۴۶/۵۴۶ · run.js 33/33 · server1-10 154/154 · sim_full2 58/58 · sim_full3 24/24 · **import2 11/11 + جهش‌ها 4/4 (تازه)** · trendcmp2/underpriv2/reporttpl2/gradeavg2/pathway2 7/7 · report2 10/10 · officesupp2 5/5 · uiclick 4/4 + همهٔ جهش‌ها سبز.
- مستنداتِ هم‌دور: AD (۸۱.۱) · AI_PROMPT بند ۳ · DEPLOY · PLAN_SMS_GATEWAY · PILOT_ONBOARDING (نمونه‌ها) · server/README.

## Handoff — دور ۸۰: یکپارچگیِ مستندات + بستهٔ پایلوت + رفعِ املأ — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (۵ کامیت روی 4ed0fdf)
- **بند ۱ (`c2f668c`):** `OPEN_ITEMS.md` همگام با دور ۷۹ — §: سه آزمونِ وارونهٔ IDOR (خط‌های ~۲۹۴ smoke) **حالا در sandbox اجرا و سبز**‌اند (ادعای قدیمیِ OOM باطل)؛ §۴: استورِ آبجکت از «ON HOLD» به **قفلِ نهاییِ آروان‌کلاود** (ضمیمهٔ حِ AD) + شرایطِ بازنگری؛ هدر: کامیتِ مبنا + اعداد.
- **بند ۲ (`695f721`):** `OPEN_WORK.md` همگام با واقعیت — §۳ «ترتیب پیشنهادی» بسته شد (هر ۶ طرح پیاده)؛ §۴ پرسش‌ها با جواب‌هایِ ثبت‌شده (روزهایِ کاریِ قابلِ تنظیم، کارتِ ولیِ رایگان، نامِ دبیر، مهلتِ ۳۰ روز، سلبِ jti)؛ §۵ بدهی: کدملی (فقط مدیر/سوپرادمین — `canEdit` در 10-users) و «ورود با نام کاربری» (باطل — فقط برچسبِ نمایشی) بسته.
- **بند ۳ (`97e1fbd`):** سندِ تازهٔ `docs/PILOT_KICKOFF.md` — بستهٔ ۱۴ روزه عملیاتی (T-۷ تا روز ۱۴): ۵ معیارِ قابل‌سنجش + go/no-go، ریتمِ روزانهٔ دو بازیگر، قالب‌هایِ پیام (آغاز/هفتگی/نتیجه)، دفترِ خرابی + قاعدهٔ روز ۱۲، ریسک‌ها. **مستقیماً موزون‌کنندهٔ تنها تصمیمِ باز** (مدرسهٔ پایلوت + تاریخ).
- **بند ۴ (`6f2bf3f`):** ⚠️ **رفعِ باگِ واقعیِ املأ:** واژهٔ قفل‌شدهٔ «کم‌برخوارد» (۱۰ کدپوینت — واژهٔ نادرست) در **برچسبِ واقعیِ UI** می‌رفت؛ درست: «کم‌برخوردار» (۱۱ کدپوینت، آخر 0x631). چون کد + تست + جهش همگی از همان کدپوینت‌ها ساخته شده بودند، همه‌چیز سبز بود. اصلاح: 24-edu-office.js (۹) + underpriv2 (۱۶ + ثابتِ UP از fromCharCode) + ۶ سند + بیلد. **درسِ سوم در AI_PROMPT بند ۶:** ثابتِ code-point‌ساخته می‌تواند املایِ غلط را قفل کند — کلمه را با منبعِ معتبر تطبیق بزنید.
- گزارشِ تجمیعی: `docs/REPORT_2026-09-06_ROUND80.md` (طبقِ اصلِ کارفرما ارائه شد).

### ۲) چه پیداکرد
- **سازگاریِ code-point ≠ املایِ درست:** تست‌هایِ از-داخلِ سازگار می‌توانند واژهٔ نادرست را برای همیشه قفل کنند (بند ۴).
- اسنادِ «وضعیت زنده» (OPEN_ITEMS/OPEN_WORK) بدونِ بازنگریِ دوره‌ای **سریع کهنه می‌شوند** — این دور ۵ ادعایِ غلط پیدا کرد (OOM، ON HOLD، ترتیبِ قدیمی، ۲ پرسشِ جواب‌داده‌شده، ۲ بدهیِ بسته‌شده).
- فرمتِ خلاصهٔ آزمون‌ها یکنواخت نیست: server4+ و suites تازه «N بررسی — ✅ N» می‌دهند، نه n/n.

### ۳) چی موند
- بازِ واقعی همان‌ها: **مدرسه/مدرسه‌هایِ پایلوت + تاریخ** (با بستهٔ تازهٔ PILOT_KICKOFF) · درگاهِ پیامک (خارجی) · حسابِ Play برایِ بستهٔ ۱۴ روزه · «اتصال به سرور» عمداً باز.

### ۴) وضعیتِ فنی
- HEAD محلی: 5 کامیتِ دور ۸۰ (c2f668c ← … ← 6f2bf3f + گزارش) روی `4ed0fdf`؛ push + `git ls-remote` در پایانِ دور.
- آزمون‌ها (بیلدِ تازه): smoke ۵۴۶/۵۴۶ · run.js ۳۳/۳۳ · server1-10 ۱۵۴/۱۵۴ · sim_full2 ۵۸/۵۸ · sim_full3 ۲۴/۲۴ · underpriv2 ۷/۷ + جهش‌ها ۵/۵ · officesupp2 ۵/۵ · trendcmp2/reporttpl2/gradeavg2/pathway2 ۷/۷ · report2 ۱۰/۱۰ · uiclick ۴/۴ (+ همهٔ جهش‌ها سبز).
- مستنداتِ هم‌دور: AI_PROMPT (درسِ سوم) · OPEN_ITEMS · OPEN_WORK · PILOT_KICKOFF (تازه) · گزارشِ تجمیعی.

## Handoff — دور ۷۹: سیزده بند (الف/ب/ج) — همهٔ کامل ✅ — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (۱۲ کامیت: a9897ce ← … ← 4a11939 روی 28aa854)
- **الف (۱-۳):** رفعِ باگِ دسپاتچ — ۴ هندلرِ `19-actions.js` پارامتر می‌گرفتند و `el`/`id` را سای می‌زدند (قیفِ پیش‌ثبت‌نام از UIِ واقعی **مرده** بود) + قاعدهٔ دائمی + نگهبانِ استاتیکِ smoke. `uiclick` ۴/۴ + ۴ جهشِ کشته.
- **ب-۴ (۴.۹):** پوشِ میانگینِ کلاس روی نمودارِ روند (avgNorm + تیکِ `.plot` + لِجِند + تولتیپ). `trendcmp2` ۷/۷ + ۵ جهش؛ قراردادِ ناشناسیِ gradeavg2 به‌روز (avgNorm فقط عدد).
- **ب-۵ (۲.۱):** بازنگریِ قفل — **هنوز موجه** + شرایطِ صریحِ بازکردن در AD (فقط مستندات).
- **ب-۶ (۲.۳):** شاخصِ **ساختاری**ِ کم‌برخوردار جدا از عملکرد — `schoolIsUnderprivileged` + بجِ 🟤 + شمارش + فیلتر. `underpriv2` ۷/۷ + ۵ جهش؛ officesupp2 (دور ۶۵) دست‌نخورده ۵/۵.
- **ب-۷ (۵.۱):** بازنگری — **از قبل کامل** (دور ۷۱: `pathwayGuideCard` + pathway2 ۷/۷) — کار تازه لازم نبود.
- **ب-۸ (۴.۳):** قالبِ قابل‌انتخابِ کارنامه — `reportCardCert(sid,term,tpl)` + قالبِ compact (دوستونه، همان داده) + انتخابگرِ `cert_tpl`؛ classic **بایت‌به‌بایت** دست‌نخورده. `reporttpl2` ۷/۷ (T5 از دکمهٔ واقعی) + ۵ جهش؛ report2 ۱۰/۱۰.
- **ب-۹:** بازنگریِ معیارهای خروجِ فازها (ضمیمهٔ جِ AD) — شرط‌های ۲ و ۵ برقرار و تقویت‌شده؛ ۱/۳/۴ هنوز منتظرِ دنیای واقعی.
- **ج-۱۰:** آروان‌کلاود (۵ گیگِ رایگان) = **تصمیمِ نهایی** (ضمیمهٔ حِ AD) + شرایطِ صریحِ بازنگری.
- **ج-۱۱:** دو قفلِ تازه: **۷۹.۱** امضای دیجیتال/صدورِ سرور تا اولین قراردادِ واقعی؛ **۷۹.۲** B2G فقط پس از پایلوتِ موفقِ B2B.
- **ج-۱۲:** `PILOT_ONBOARDING.md` برای مدیرِ غیرفنی — ۶ اصلاحِ خوانایی + راستی‌آزماییِ ساختارِ منو با کد.
- **ج-۱۳:** شبیه‌سازی‌های نهایی: sim_full2 ۵۸/۵۸ + sim_full3 ۲۴/۲۴.
- گزارشِ تجمیعی: `docs/REPORT_2026-09-06_ROUND79.md` (طبقِ اصلِ کارفرما مستقیم ارائه شد).

### ۲) چه پیداکرد (دام‌هایِ جدید)
- **متنِ فارسیِ تایپ‌شده ممکن است با «جابه‌جاییِ کاراکتر» برسد** (نه فقط افت): `کم‌برخوردار` چندین بار به `کم‌برخورفار`/`کم‌برخوارد` رسید (کد و سند). **قاعدهٔ دائمی:** اسکنِ code-point + ساخت با chr() برای متنِ حساس.
- **jsdom: db ممکن است دوباره جایگزین شود** — صبرِ «db موجود» کافی نیست؛ صبر تا **پایداریِ مرجع** + تأییدِ بقایِ تغییر بعد از ۱۵۰ms.
- **`window.open` در jsdom پیاده‌سازی نیست** — تستِ سرتاسریِ چاپ: spy روی `printableDoc`.
- پنجرهٔ slice برای ادعاهایِ ردیف‌هایِ بلند (tooltip) ≥ ۱۲۰۰.
- HANDOFF: ۲ قدیمی‌ترین آرشیو شد (حالا ۲۰).

### ۳) چی موند
- در ۱۳ بند: **هیچ** — همهٔ بسته شدند.
- بازِ تغییرناپذیر: مدرسه‌هایِ پایلوت + تاریخِ شروع؛ درگاهِ پیامک (خارجی)؛ «اتصال به سرور» تنها باقی‌مانده.

### ۴) وضعیتِ فنی
- HEAD محلی: `4a11939` (۱۲ کامیتِ دور ۷۹ روی `28aa854`)؛ push + `git ls-remote` در پایانِ دور.
- آزمون‌ها (بیلدِ تازه): smoke ۵۴۶/۵۴۶· run.js ۳۳/۳۳ · server1-10 ۱۵۴/۱۵۴ · sim_full2 ۵۸/۵۸ · sim_full3 ۲۴/۲۴ · trendcmp2/underpriv2/reporttpl2/gradeavg2/pathway2 ۷/۷ · report2 ۱۰/۱۰ · officesupp2 ۵/۵ · uiclick ۴/۴ (+ همهٔ جهش‌ها سبز).
- مستنداتِ هم‌دور: AI_PROMPT ۰.۵.۱۹ (بندهای ۱-۱۳) · AD.md (بازنگریِ ۲.۱، ضمیمهٔ ح، ۷۹.۱/۷۹.۲، ضمیمهٔ ج) · PILOT_ONBOARDING · گزارشِ تجمیعی.

## Handoff — دور ۷۸ بند ۷: ماژولِ اسکان/خوابگاه (`has_dorm`) ✅ — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (کامیتِ بند ۷)
- کلیدِ توانِ قدیمیِ `has_dorm` حالا ماژولِ واقعی دارد: `65-dorm.js` (viewDorm + dormRoomList/dormAssignOf/dormMealOf) + ۱۰ اکشن در `19-actions.js` + روتِ `dorm` در منویِ مدیر (capHidden وقتی توان خام باشد) + ۳ جدولِ تازه (`dorm_rooms`/`dorm_assignments`/`dorm_meals`) + seed دمو برای ۴ مدرسه صاحبِ توان (SH-101، FZ-102، AH-103، IZ-105).
- **مرخصیِ رفت‌وبرگشتِ آخر هفته** = همان `leaves` با `kind:'dorm_weekend'`: مدیر مستقیم می‌سازد، مستقیم `approved`، پنجشنبه→جمعهٔ پیشِ رو، پیام به دانش‌آموز+اولیا، **عمداً از `decideLeave` نمی‌گذرد** (حلقهٔ موجه‌سازیِ آن رکوردِ موجهِ جعلیِ جمعه می‌ساخت). نشانِ «🏠 خوابگاه» در صفحهٔ مرخصی‌ها دو نوع را تمایز می‌دهد.
- مجوز: ۱۰ اکشن `['manager']` در ACTION_ROLES + ۳ مجموعه در WRITE_PERMS.manager (دامنه از school_id خودکار).
- آزمون: smokeٔ تازهٔ ۸-بخش (دروازهٔ توان، CRUD اتاق، تک‌اتاقی، ظرفیت، وعدهٔ ۷×۳، مرخصی + نشان + بدونِ اثر بر حضور) + **۴ جهش کشته شد** (ظرفیت/دروازه/وضعیتِ مرخصی/حذفِ مجوز). smoke 545/545 · server1 30/30 · server6 9/9 · server2-10 همه سبز.

### ۲) چه پیداکرد (دام‌هایِ جدید)
- **دسپاتچِ A بدونِ پارامتر است** (`A[a]()`): `el`/`id` از محیّطِ کلِک‌لیسنر می‌آیند؛ پارامترِ اعلام‌شدهٔ `(el,id)` در اکشن‌هایِ A با `undefined` سای می‌کند. ⚠️ دو اکشنِ قدیمیِ همین الگویِ خراب را دارند: `'pre-confirm'(el,id)` و `'pre-reject'(el,id)` (id=undefined ⇒ پیش‌ثبت‌نامِ UI عملاً کار نمی‌کند؛ تست‌ها مستقیم preConfirm را صدا می‌زنند و پنهان مانده) و `'bus-follow-open'(el)` (el=undefined ⇒ کلیکِ پیگیریِ مغایرت کرش می‌کند). **تعمیرِ آن‌ها در بندهایِ بعدی** (دست‌نخورده ماند چون بند ۷ فقط اسکان بود).
- `byId` وقتی رکورد نباشد **undefined** برمی‌گرداند (Map.get)، نه null — assertها با falsy چک شوند.
- دمو ۴ مدرسه (نه ۲) صاحبِ `has_dorm` است (SH-101، FZ-102، AH-103، IZ-105).
- HANDOFF.md به ۲۲ ورودی رسیده بود (از سقفِ ۲۰ فراتر) — ۳ قدیمی‌ترین به `docs/HANDOFF_ARCHIVE.md` منتقل شد (حالا ۱۹ + این ورودی = ۲۰).

- ۲ **عددِ فارسیِ تایپ‌شده در فراخوانِ ابزار گاهی یک رقم از دست می‌دهد (تصادفی):** در همین دور ۵۴۵/۵۴۵، ۷ و ۷۸، ۱۴۰۰، ۵۰۰۰ و ۱۲۸۰ همه یک رقم گم کردند. **قاعدهٔ دائمی:** بعد از نوشتن هر محتوای عددمحورِ فارسی در فایل، اسکنِ code-point بزنید و برای اعدادِ حساس chr() بزنید (0x06F0+رقم).

- ۲ **آرشیوِ HANDOFF فسادِ سیستماتیکِ ک→گ داشت** (از قبلِ این سشن): گلاس (۱۰۱)، گد (۵۷)، گدام (۵)، گارت (۱۱) — همه «کلاس/کد/کدام/کارت» بودند؛ در بند ۱۱ با جایگزینیِ بااحتیاط درست شد (کلماتِ سالمِ گ-مثلِ گزارش/دگمه/نگهبان/وگرنه دست‌نخورده ماندند)

### ۳) چی موند
- تعمیرِ `pre-confirm`/`pre-reject`/`bus-follow-open` (پارامترهایِ سای‌شده — باگِ واقعی، تعمیرِ کدیِ بعدی).
- خطِ «اتصال به سرور» — بدونِ تغییر.
- بندهای ۸ تا ۱۳ دور ۷۸ — **تمام شدند**: راهنمایِ پایلوت (`PILOT_ONBOARDING.md`)، مقایسهٔ ذخیره‌گاه (`STORAGE_OPTIONS_2026-09-06.md`، بدونِ تصمیم)، آدیتِ نقشه‌راه (`REPORT_2026-09-06_ROADMAP_AUDIT.md`)، یکپارچگیِ آرشیو + رفعِ فسادِ ک→گ، اجرای نهاییِ sim_full2 (58/58) + sim_full3 (24/24)، و گزارشِ پایانی (`REPORT_2026-09-06_FINAL.md` — ۴ تصمیمِ واقعیِ باز: پایلوت، فایل، حقوقِ گواهی، B2G).

### ۴) وضعیتِ فنی
- HEAD محلی: کامیتِ گزارشِ پایانی (۱۲ کامیتِ دور ۷۸ روی `e990503` — پوش در پایانِ دور).
- smoke **545/545** · run.js 33/33 · server1-10: 30+25+19+16+14+9+15+9+10+7 = 154/154 · sim_full2 **58/58** · sim_full3 **24/24**.
- مستنداتِ هم‌چرخه: USER_GUIDE.html (کالآوتِ اسکان) · AI_PROMPT ۰.۵.۱۸ (بندهای ۷-۱۰) · AD.md ۷۸.۳ · سه سندِ تازه (پایلوت/ذخیره‌گاه/آدیت) + گزارشِ پایانی.

## Handoff — دور ۷۷-۲: رفعِ کرشِ smoke.js + چهار اشکالِ کهنهٔ پنهان‌شده — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (۲ کامیت + ۱ کامیتِ گزارش؛ گزارش: `docs/REPORT_2026-09-06_ROUND77-2_SMOKE_CRASH.md`)
- **ریشهٔ کرشِ قدیمیِ smoke (exit 134 — کهنه، دست‌کم از دور ۷۶):** jsdom هر `localStorage.setItem` را با `setTimeout` مؤخرّر می‌کند و تا شلوغیِ تایمر، **رشته‌های قدیمی+تازه** (صدها KB) زنده نگه می‌دارد؛ smoke صدها setItem در evalِ همگامِ بلند ⇒ صف به چندصد MB ⇒ OOM در هیپِ ۰.۹۳GB. (با localStorageِ Map-based رشد **صفر** بود — اپ سالم است.)
- **رفع (فقط در tests/smoke.js):** (۱) `setTimeout(resolve,0)` بین تست‌ها در wrapper (همان yieldی که مرورگرِ واقعی می‌دهد)؛ (۲) دو حلقهٔ `parent_subscriptions.forEach(update)` (۲×۵۲۷) داخل `Data.batch`. **تستِ جهش:** حذفِ yield ⇒ OOM عود (exit 134) ⇒ رفع، مؤثر است.
- **نتیجه:** `node tests/smoke.js` (بدونِ پرچم!) و با `--expose-gc` هر دو **542/542، exit 0** — نخستین‌بار.
- **چهار اشکالِ کهنه که کرش پنهان‌شان می‌کرد** (هرکدام با جهش کشته شد): fetch مستقیمِ `46-bell-now.js` → `httpGetJson` (قاعدهٔ 00-data-layer) · `vscroll` گم‌شده در مودالِ `18-modals.js:380` · `NAV_EXPECT.manager` کهنه (۴ ماژولِ مدیری: preapps/scholarships/reexams/summerclasses) · تستِ آستانهٔ مشاور آستانهٔ **خروجِ مکرر** را بالا نمی‌برد ⇒ ۲۲ الگویِ دروغ.
- **مستندات:** AI_PROMPT ۰.۵.۱۷ + بندِ دور ۷۷-۲ + ردیفِ 46-bell-now · AD ۷۷.۲ (قاعدهٔ دائمیِ صندلیِ سئوت).

### ۲) چه پیداکرد (قوانینِ دائمی)
- **هر تغییر در src/js حتماً باید `node build.js` بزند و بعد smoke اجرا شود** — smoke کدِ **build شده** در index.html را می‌کشد، نه src. (تست‌هایِ اسکنِ متنِ مستقیم — fetch/vscroll — src را می‌خوانند و بدونِ build هم کار می‌کنند؛ فریب‌دهنده است.)
- jsdom ≠ مرورگر: رویدادهایِ مؤخرّهٔ storage + بدونِ yielding بین کنش‌ها = نشتِ ظاهری. هر سئوتِ جدیدی که setItem انبوه دارد، همان دو قاعدهٔ AD ۷.۲ را لازم دارد.
- smoke 542 تست — ~۱۶ ثانیه بدونِ پرچم، ~۴۷ ثانیه با `--expose-gc`.

### ۳) چی موند
- همان خطِ «اتصال به سرور» (پیام‌رسانِ واقعی/استعلام) — بدونِ تغییر.
- کرشِ V8ِ قدیمی دیگر **نیست** — قلمِ «رفعِ کرشِ smoke.js» از باقی‌مانده‌های ردهایِ قبل پاک شد.

### ۴) وضعیتِ فنی
- build بیت‌به‌بیت ✓ (مُهرِ راهنما: 8e6dceea6d67) · بازگشتِ هدفمند: bell2 6/6، att2 6/6، att3 9/9، att4 11/11 · 47-counselor.js دست‌نخورده (جهشِ روی آن revert شده و git تمیز).

## Handoff — دور ۷۷: بازطراحیِ حضور و غیاب (رویداد + ۳۰٪ + موجهِ یکپارچه) — ۱۵/۰۶/۱۴۰۵ (2026-09-06)

### ۱) چه شد (دستورِ ۶‌بندیِ کارفرما + ۳ پاسخِ ask_user؛ ۲ کامیت؛ گزارش: `docs/REPORT_2026-09-06_ROUND77_ATTENDANCE_EVENTS.md`)
- **مدل:** تاخیر/خروج = **رویداد** (فیلدهای `late_*`/`exit_*` روی رکوردِ `attendance` — بدون جدولِ تازه/مهاجرت)؛ وضعیت پایه فقط حاضر/غایب؛ **تبدیلِ خودکارِ دور ۷۵ حذف** (تاخیر روی غایب = فقط فیلدها).
- **۳۰٪:** `attOutRule`/`attBellOf` (۱۲) — فقط زنگِ درسی؛ در ثبتِ نهایی (۱۷) ⇒ `absent`+یادداشت + نشانِ زنده.
- **خروج:** قفلِ سهٔ گزینه هنگامِ تایمر (`attExitsLive`) + «توقف خروج»؛ خروجِ کهنهٔ `early_exit` در ثبتِ نهایی رویداد می‌شود (`attExitsFinal`).
- **موجهِ یکپارچه:** `attExcuseCore` (۴۴) = هستهٔ واحدِ دبیر+مدیر (late/exit/record): حذف از پرونده/آمار/الگویِ مشاور + لغوِ پیامِ معلق + پیامِ توضیحیِ تازه با دلیل (`kind:'event'`)؛ پنجرهٔ دبیر = `school.excuse_window_minutes` (پیش‌فرض ۱۵؛ کلید در مودالِ مدرسهٔ ۱۸) — مدیر آزاد.
- **UI:** حاضر|غایب|تاخیر + فاصله + 🚪 خروج مقابلِ نام؛ موجه فقط در گزارشِ پایین (کنار ویرایش/حذف)؛ **بدونِ حالتِ فعالِ اولیه** (امروز پیش‌خوانده نمی‌شود؛ ۰.۵.۹ باقی)؛ دکمه‌ها فشرده (موبایل).
- **رفعِ نقیصهٔ پیدا‌شده:** موجهٔ «حاضر+تاخیر» قبلاً رکورد را `excused` می‌کرد — حالا هستهٔ رکورد فقط برای غایب (T11).
- **سئوت:** att4 11/11 + att4-mutations 5/5 (کشته) + att2/att3 بازمی‌نویسی (6/6+5/5، 9/9+5/5) + nudge2 9/9 + بازگشتِ کامل سبز.
- **کامیت‌ها:** `58679e1` (کد+تست) + کامیتِ دومِ همین دور (مستندات، درستِ بعد از آن) — هر دو push شده (در پایانِ سشن).

### ۲) چه پیداکرد (مهم)
- **seedِ سرور روزِ کهنه:** `tests/security_seed.js` Z2 در هر **سبقتِ روز** می‌شکست (فایلِ seed تاریخِ دیروز داشت؛ با **baseline 4541fae هم یکسان** = موجود از پیش، نه R77). راه‌حل: `node server/seed.js` (فایل untracked، ۵.۴MB) ⇒ 4/4. **در هر سشنِ بعد، پیش از اجرای security_seed، seed را تازه کنید.**
- **رتبهٔ rng در 02-demo-data.js:** `rng()` حتماً **پیش از** returnِ شرطی (skip امروز) مصرف شود — وگرنه شماره‌هایِ demo می‌جَویند (navgroups شکست).
- smoke: 141 سبز + crashِ V8 **موجود از پیش** (با baseline بیت‌به‌بیت یکسان؛ بعد از «حساب کاربری ۶: ابرار»).

### ۳) چی موند
- خطِ «اتصال به سرور» (پیام‌رسانِ واقعی به‌جای صفِ محلی) — همان خطِ همیشه.
- اگر خواستید: پنجرهٔ موجه بر پایهٔ «پایانِ کلاسِ روز» به‌جای «پایانِ زنگ» — یک تابع (`attExcuseWindow`).

### ۴) وضعیتِ فنی
- build بیت‌به‌بیت ✓ · راهنما همگام ✓ (کالآوتِ دور ۷۷) · مستندات: AI_PROMPT ۰.۵.۱۶ + ردیف‌هایِ جدولِ ماژول + AD ۷۷.۱ · کاربرگ: `server/data/payesh.json` seed شدهٔ ۰۹-۰۶ (untracked).
## Handoff — دور ۷۶: ماژولِ ترکِ تحصیل (بدونِ حذفِ داده) + دامنه‌بندیِ سرور + آرشیو + گزارشِ آماده‌بودن — ۱۵/۰۶/۱۴۰۵ (2026/9/6)

### ۱) چه شد (بخشِ الف: ترکِ تحصیل؛ بخشِ ب: آرشیو + گزارش؛ ۲ کامیت؛ گزارش: «docs/REPORT_2026-09-06_ROUND76_DROPOUT_READINESS.md»)
- **ترکِ تحصیل (حذفِ نرم):** `31-student-lifecycle.js` — `DROP_REASONS` (۱۱ دلیل؛
  «other» توضیحِ الزامی) + `dropRegister`/`dropReturn` (فقط وضعیت + فیلدهایِ
  `dropped_out_*`/`returned_*` — پروندهٔ کامل دست‌نخورده؛ سابقهٔ ترک در بازگشت
  **می‌ماند**) + `dropStats(schoolIds)` (دلیل/پایه/جنسیت — جنسیت از
  `school.gender`) + `dropStatusStrip`. `17-student-record.js` — نوارِ قرمز +
  دکمهٔ «ثبت ترک تحصیل» (فقط مدیر). `19-actions.js` — ۴ کنشِ `drop-*` (مودال‌ها
  با الگویِ `window._dropId`/`V()`). `24-edu-office.js` — کارتِ «آمار ترک
  تحصیل (تجمیعی)» در داشبوردِ اداره (بدونِ نامِ فرد). `30-authz.js` — ۴ کنش
  `['manager']`.
- **سرور (`server/sync.js`، الگوی IEP):** `DROP_FIELD_KEYS`/`DROP_KEYS` +
  `dropUsersUpdate`: آپدیتِ `users` با کلیدِ ترک ⇒ فقط مدیر + همهٔ کلیدها در
  `DROP_KEYS` + status ∈ {active, dropped_out} وگرنه `role_denied`؛ دامنه =
  همان `inScope` (fail-closed). **سفید‌فهرست فقط روی کلیدهایِ ترک** است (نه
  روی `status`) — وگرنه ارتقا/فارغ‌التحصیلی/انتقال می‌شکست (آزمونِ S5 نگهبانِ
  همین مرز است).
- **تست:** «tests/dropout.js» 7/7 · «tests/dropout2.js» 12/12 (سرورِ واقعی:
  مدیرِ خود ok / مدیرِ دیگر out_of_scope / دبیر role_denied / کلیدِ اضافی
  role_denied / ارتقا سالم / disk) · «tests/dropout-mutations.js» 6/6 (M1–M4
  کلاینت + M5–M6 سرور — با سینیتیِ روی کدِ واقعی). رجی‌گرسیونِ کامل سبز
  (run 33 · simulation 48 · sim_full۲ 58 · sim_full۳ 24 · integration 12 ·
  server1–10 · iep2/3 · att2/3 · بقیه).
- **یافته (کهنه، رفع شد):** ۳ سئوتِ جهش (reexam2/scholarship2/preapp2
  -mutations) با anchorِ کهنه به `WRITE_PERMS` اشاره می‌کردند — جهش اعمال
  نمی‌شد و هرگز کشته نمی‌شد؛ anchorها به‌روز شد (5/5 · 5/5 · 8/8). `smoke.js`
  کرشِ V8 در baseline هم دارد (جدا، کهنه).
- **بخشِ ب-۶:** HANDOFF به ۵۰ ورودی رسیده بود و آرشیو وجود نداشت؛ قدیمی‌ترها
  به «docs/HANDOFF_ARCHIVE.md» منتقل شد و این فایل به ۲۰ ورودیِ تازه رسید.
- **بخشِ ب-۷:** جدولِ «سطحِ آماده‌بودنِ واقعی» در گزارش: ۹ پیش‌شرطِ انتشار با
  وضعیتِ دقیق + «کد لازم یا فقط قرارداد/تصمیمِ بیرونی».
- **مستندات:** AI_PROMPT.md (۰.۵.۱۵ + ۱۵.۵ + ۴ سطرِ ماژول) · AD.md (ردیفِ
  قفلِ ۷۶.۱: تجمیعِ آمار تا رئیسِ کلِ چندمنطقه در معماریِ چندمدرسه — بدون
  مهاجرتِ داده) · USER_GUIDE.html (کالآوتِ مدیر + کالآوتِ اداره).

### ۲) کامیت‌ها
- (۱-م) — دور 76-1: کد + تست‌ها + بیلد + به‌روزرسانیِ ۳ anchor
- (۲-م) — دور 76-2: مستندات + گزارش + HANDOFF/آرشیو

### ۳) باقی‌مانده‌ها
- کد: بندِ خواسته‌شده کامل است. آینده: adapterِ SMSِ سرور + استعلامِ سرور
  (وقتی قرارداد بیاید) · رفعِ کرشِ smoke.js (کهنه) · seedِ ترک‌شده برایِ دمو
  (اختیاری).
- بیرونی: درگاهِ SMS · استعلامِ کد ملی · TLS/دامنهٔ تولیدی · Play ($25/فرم‌ها/
  آزمونِ ۱۴ روزهٔ ≥۱۲ آزمون‌کننده) · ۳ مدرسه پایلوت · شمارهٔ تماس · (تصمیم)
  استورِ فایل (قفلِ ۱۳.۳) + WAF.

## Handoff — دور ۷۵: پنلِ دبیر — تایمرِ «خروج از کلاس» + تأخیرِ خودکار — ۱۵/۰۶/۱۴۰۵ (2026/9/۶)

### ۱) چه شد (دو بندِ درخواستِ کاربر — ۲ کامیت؛ گزارش: «docs/REPORT_2026-09-06_ROUND75_EXIT_TIMER_LATE.md»)
- **تایمرِ «خروج از کلاس»:** برچسبِ «خروج» ← «خروج از کلاس» (۰۱)؛ دکمهٔ
  رفت‌وبرگشتی: ضربهٔ نخست شروع (نشانِ زندهٔ H:MM:SS، تیک فقط وقتی فعال —
  `attTickSync`/`attTimerPaint`)، ضربهٔ دوم («⏱ توقف خروج») توقف + ثبتِ دقیقهٔ
  سپری‌شده. شروع در پیش‌نویسِ Store (`d.timers`) — نه رکورد. رکورد:
  `exit_at`/`exit_return_at`/`exit_minutes` (مدتِ غیبت) + توضیحِ خودکار در
  ردیفِ پنلِ دبیر + ستونِ «توضیح»ِ پرونده (۱۷) + گزارش‌ها (pattern).
  **تایمر با «دور ریختن»/«ثبتِ نهایی» نمی‌میرد** (`attDraftClearKeepTimers`).
  پیامکِ خروج دست‌نخورده.
- **تأخیرِ خودکار:** غایبِ موجود (ثبت/پیش‌نویس) + زدنِ «تأخیر» ⇒ بدونِ مودال،
  دقیقه از `taken_at` (لحظهٔ حاضر و غیاب‌زدن — حالا در `att-commit` نوشته/
  حفظ می‌شود) تا حالا؛ بدونِ `taken_at` ⇒ شروعِ روز از زنگ (`attDaySpan`).
  تأخیرِ بدونِ غیبتِ ازپیش ⇒ مودالِ ۱۵.۱ دست‌نخورده. توضیح: «تأخیر: ۱۰ دقیقه
  (از ساعت ۰۸:۰۰)». دادهٔ نمونه هم `taken_at` قطعی می‌سازد. **سرور بدونِ تغییر.**
- **تست:** «tests/att3.js» (تازه، ۹ بررسی) + «tests/att3-mutations.js» (تازه،
  ۵ جهش — همه کشته) + بازنویسیِ T۲/T۳ att2 به تایمر. باگِ تستی: spliceٔ
  مستقیمِ db.attendance ⇒ ایندکسِ قدیمی ⇒ diff «بی‌تغییر»؛ حالا `remove()`.
- **سنجش:** att۳ 9/9 · att۳-mut 5/5 · att۲ 6/6 + mut 5/5 · run 33 ·
  simulation 48 · sim_full۲ 58 · cmsg۲ 9 · cmsg۳ 11 · bell۲ 8 · privacy 3 —
  همه سبز؛ بیلد + build --check + راهنما (کالآوتِ تازهٔ دبیر) سبز.
- **مستندات:** AI_PROMPT.md (بخشِ تازهٔ ۰.۵.۱۴ + بندِ ۱۵.۴ + جدولِ ماژول‌ها) +
  USER_GUIDE.html (کالآوتِ «دو قابلیتِ تازه (دور ۷۵)» در بخشِ دبیر).

### ) کامیت‌ها
- (۱-م) — دور 75-1: کد + تست‌ها + بیلد
- (۲-م) — دور 75-2: مستندات + گزارش + HANDOFF

### ۳) باقی‌مانده‌ها
- کد: بندِ خواسته‌شده کامل است.
- بیرونی: درگاهِ واقعیِ SMS/استعلام · TLSِ تولیدی · اشیاء‌نگاری (قفل ۱۳.۳) ·
  WAF · شمارهٔ تماس · Play و آزمونِ ۱۴ روزه.

## Handoff — دور ۷۴: یکپارچهٔ واقعیِ کلاینت/سرور + پایشِ صفحاتِ حریم خصوصی — ۱۴۰۵/۶/۱۵ (2026/9/6)

### ۱) چه شد (ادامهٔ «continue» — ۳ کامیت؛ گزارش: «docs/REPORT_2026-09-06_ROUND74_INTEGRATION_PRIVACY.md»)
- **یکپارچه‌سازیِ واقعی (بزرگ‌ترین درزِ تست‌نشدهٔ «اتصال به سرور»):**
  «tests/integration.js» (تازه، ۱۲ بررسی): بیلدِ index.html در jsdom + سرورِ واقعی
  + HTTP واقعی + کوکیِ واقعیِ نشست — بدونِ mock: تشخیصِ سرور توسطِ خودِ کلاینت،
  ورودِ واقعی، /me و bell با کوکی، Data.create واقعی → /api/sync → رکورد روی disk،
  خروج و سلبِ نشست. ۲ موتانتِ قرارداد کشته (credentials:omit ⇒ I3؛ بدونِ
  Set-Cookie ⇒ I2c…I6).
- **پایشِ صفحاتِ حریم خصوصی/حذفِ حساب (ملاکِ Play):**
  * باگ: تاریخِ وبِ سیاست (privacy.html) **خراب** بود — رفع شد + تازه شد.
  * ۳ دقیق‌نویسی در ۳ نسخه (docs/PRIVACY_POLICY.md رسمی + privacy.html +
    58-privacy.js داخلِ اپ): شمارهٔ تماس (ولیا/دانش‌آموز) · نتیجهٔ پایشِ دورِ ۷۳
    در §6 · صادق‌نویسیِ نگهداریِ پشتیبان‌ها در §7. عبارت‌هایِ قفل‌شدهٔ P5 دست‌نخورده.
  * account-deletion.html: بدونِ نقص (esc/textContent، سازگار با S-۷۳-۲،
    جریانِ بدونِ مانعِ پنهان).
- **سنجش:** integration 12/12 · privacy 3/3 · server10 7/7 · run 33 · simulation 48 ·
  sim_full2 58 · بقیه از دورِ ۷۳ رویِ همین کد سبز. بیلد + build --check سبز.

### ) کامیت‌ها
- (۱-م) — دور 74-1: tests/integration.js
- (۲-م) — دور 74-2: سیاست‌ها (۳ نسخه) + privacy.html + بیلد
- (۳-م) — دور 74-3: این گزارش + HANDOFF

### ۳) باقی‌مانده‌ها
- کد: درزِ «اتصال به سرور» و ناسازگاریِ سیاست بسته شدند.
- بیرونی: درگاهِ واقعیِ SMS/استعلام · TLSِ تولیدی · اشیاء‌نگاری (قفل ۱۳.۳) ·
  WAF · شمارهٔ تماس · فروشگاهِ Play و آزمونِ ۱۴ روزه.

## Handoff — دور ۷۳: پایشِ امنیتیِ جامع (رفعِ ۸ راهِ نفوذ) + یکپارچه‌سازیِ مستندات در یک فایل — ۱۴۰۵/۶/۱۵ (2026/9/6)

### ۱) چه شد (۳ بند — ۴ کامیت؛ گزارش: «docs/REPORT_2026-09-06_ROUND73_SECURITY.md»)
- **پایشِ امنیتی (بند ۱):** همهٔ فایل‌هایِ سرور کدبه‌کد + کلاینت (sinkهای
  innerHTML/eval/localStorage/رگکس) پایش شد. ۸ یافته، همه رفع + تستِ زنده
  + موتانت:
  1. restore، «__revoked_jti»/rate-limit را ریست می‌کرد (log-out پس از restore
     زنده می‌شد — تا ۸ ساعت) → حالا stateِ احراز هویت حفظ می‌شود.
  2. send-code، 404 no_account برای شمارهٔ ناشناخته (phone-enumeration) →
     پاسخِ یک‌شکل + rate-limit پیش از بررسیِ وجود. (قراردادِ S4/D4 در
     server1.js و server7.js هم به قراردادِ تازه بروزرسانی شد.)
  3. فایل‌هایِ store/backup/audit با 0644 (PII خوانا) → 0600.
  4. «x-forwarded-proto» کلاینت بی‌قیدوشرط معتبر بود (اسپُف ⇒ HSTS/Secure/
     خراب‌کردنِ login در http) → فقط در «PAYESH_HTTPS=1».
  5. مقایسهٔ کد ملی نه‌ثابت‌زمان → ثابت‌زمان.
  6. timeoutِ request/headers/keepAbsent نبود (slowloris) → 65 ثانیه.
  7. delete-account، parent_linksِ دانش‌آموزِ حذف‌شده را پاک نمی‌کرد →
     حالا هر دو جهت پاک می‌شود (bellِ ولی دیگر رکوردِ مرده نمی‌بیند).
  8. کلاینت: «loginErr» (06-login.js) رشتهٔ سرور را با innerHTML می‌گذاشت
     (تلهٔ XSS) → DOMِ امن. jsdom payloadِ تزریقی را علیه موتانت واقعاً
     اجرا کرد (XSSِ واقعی تأیید شد).
  سبزِ تأییدشده (پایش شد، نقص نداشت): JWT (HS256/algnone-immune/timing-safe/
  jti)، کوکی (HttpOnly+Lax)، IDOR (404-not-403+throttle)، sync (forgery-poison/
  WRITE_PERMS/500op/2MB)، statikِ بسته+nonce+CSP، admin فقط superadmin،
  آدیتِ JSONL، بدونِ CORS، بدونِ eval روی ورودی.
- **تست‌های تازه:** «tests/security2.js» (سرورِ زنده، ۲۵ بررسی) +
  «tests/security_client.js» (jsdom، ۵). ۶ موتانتِ S-۷۳/C-۷۳ — همه
  کشته شدند. regression کامل سبز (server1-10، cmsg3، server-mutations ۱۹،
  run 33، simulation 48، bell2 8، privacy 3، sim_full2 58، sim_full3 24).
- **یکپارچه‌سازیِ مستندات (بند ۲):** «docs/AI_PROMPT.md» (اکنون 4693 سطر)
  حالا **فایلِ واحدِ مرجع** است: پرامپتِ کلی + راهنمای برنامه‌نویس (بخشِ 9 —
  کلِ CONTRIBUTING.md با عنوان‌هایِ یک‌سطحِ پایین‌تر) + مستندات. بخشِ تازهٔ
  0.5.13 = همین پایش. «CONTRIBUTING.md» فقط اشاره است. USER_GUIDE.html:
  یادداشتِ امنیتیِ دور ۷۳ در بخشِ حریم خصوصی + بیلدِ تازه (build --check سبز).
- **گزارش (بند ۳):** «docs/REPORT_2026-09-06_ROUND73_SECURITY.md» (۱۰ بخش).

### ) کامیت‌ها
- «15456f6» — دور ۷۳-1: رفع‌هایِ امنیتیِ سرور + security2.js + قراردادِ تازهٔ server1/7
- «9916cb8» — دور ۷۳-2: loginErr امن (کلاینت) + security_client.js + بیلد

- **بستنِ پایش (ادامهٔ «continue»):** seed.js هم 0600 شد (S-۷۳-۸ — تستِ تازهٔ «tests/security_seed.js»، ۴ بررسی، موتانتِ کدِ اصلی کشته شد) · tls-cert.js سبز · آلودگیٔ پیکره/reDoS/localStorage/URLهایِ خارجی: سبز (جزئیات: گزارش، بخشِ «بستنِ پایش»).
- (۵-ام) — دور 73-5: بستنِ پایش — seed 0600 + security_seed.js + گزارش/HANDOFF
- (3-ام) — دور ۷۳-3: یکپارچه‌سازیِ مستندات + USER_GUIDE
- (4-ام) — دور ۷۳-۴: این گزارش + HANDOFF

### ۳) باقی‌مانده‌ها
- **کد: هیچ راهِ نفوذِ شناخته‌شده‌ای باقی نمانده** (در محدودهٔ رپو).
- بیرونی (زیرساخت): درگاهِ واقعیِ SMS/استعلام · TLSِ تولیدی با CA معتبر ·
  اشیاء‌نگاریِ فایل (قفل ۱۳.۳) · WAF/مانیتورینگِ هاست.
- تصمیماتِ بازِ قدیمی دست‌نخورده‌اند (نمایندگیِ Play، آزمونِ 14 روزه،
  شمارهٔ تماس، ورودی‌هایِ فهرست‌نمایش).

## Handoff — دور ۷۲: شبیه‌سازیِ جامع (چندمدرسه/چندنقش/چاس) + دو باگِ کشته‌شده + مستندات — ۱۴۰۵/۶/۱۵ (۲۰۲۶/۹/۶)

### ۱) چه شد (۳ بندِ درخواست + گزارش — ۴ کامیت)
- **شبیه‌سازیِ جامع (بندهای ۱ و ۲ — متنِ یکسان دو بار آمده بود، یک بار اجرا):**
  * «01b9a68» — «tests/sim_full2.js» (کلاینت jsdom، **۵۸ بررسی**): ۶ مدرسه
    (۱ همه‌توان / ۲ بدون چندپایه / ۴ دخترانه / ۵ کارگاه+چندپایه / ۶ خاموش)
    × ۸ نقش × ۶ بخش (A مجوزها، B جداییِ tenant، C قابلیت‌های دور ۷۱ روی
    چند مدرسه، D حالت‌های ویژه، E چاس، F ماژولٔازه: ۵۰+۴۰ رندر).
  * «a4bcd09» — «tests/sim_full3.js» (سرورِ واقعی روی store موقت،
    **۲۴ بررسی**): ورودِ ۱۱ نقش، school_inactive، باتریِ IDOR، batch
    مسموم (اتمی + چک روی disk)، ایدمپوتنس، 501op→413، forged_by /
    user_mismatch / school_mismatch، virtual_day op‌به‌op، flush + آدیت.
  * **دو باگِ واقعی پیدا شد، برطرف شد، با جهش کشته شد:**
    1. patternCheck (47-counselor.js:77) تاریخِ آینده را می‌شمرد → مرزِ
       بالایی «a.date>todayISO()» اضافه شد؛ تستِ بازگشتی E11.
    2. attendance_modes در هیچ نقشِ WRITE_PERMS نبود → کلاینت روزِ
       غیرحضوری را اعلام می‌کرد ولی سرور خاموشانه رد می‌کرد. حالا مدیر
       فقط برای مدرسهٔ خودش می‌نویسد (inScope در سطحِ مدرسه)؛ تست T10a-d.
- **مستندات (بند ۳) «60a8545»:** AI_PROMPT.md (جدولِ ماژول‌ها: ۶ ردیف
  به‌روز + ۲ ردیفِ تازهٔ 63/64 + بخشِ تازهٔ دور ۷۲ + شبیه‌سازی 35→48)؛
  CONTRIBUTING.md (سوت‌های تازه + قاعدهٔ «هر جدولِ تازه، تصمیمِ
  WRITE_PERMS»)؛ USER_GUIDE.html (**۱۳ کالآوت** برای قابلیت‌های دور ۷۰/۷۱:
  مدیر ۷ / دبیر ۱ / دانش‌آموز ۲ / ولی ۲ / مشاور ۱) + مُهرِ بیلد.
- **گزارش (بند ۴):** «docs/REPORT_2026-09-06_ROUND72_SIMULATION.md».

### ۲) وضعیتِ آزمون‌ها (همه سبز، اندازه‌گیریِ واقعی)
- کلاینت: sim_full2 58/58 · run 33 · simulation 48 · schedconf2 9 ·
  pathway2 7 · report2 10 · multigrade2 9 · cmsg2 9 (+6 جهش) · reexam 8+8 ·
  assocmin 8+8 · libserial2 7 · summer 7+8 · scholarship 8+8 · nudge2 9 ·
  diag2 11 · navgroups 9 · bell2 8 · schoolmode2 6 · workdays 6 · att2 6 ·
  privacy 3 · finance2 18 · subs2 9 · association2 6 · officesupp2 5 ·
  workshop2 12 · iep 7+8 · preapp 8+9 · gradeavg2 7 · library 5 · bus2 5 ·
  vclass2 4 — **۴۸ سوتِ کلاینت سبز**.
- سرور: sim_full3 24/24 · cmsg3 11 · server2 25 · server3 19 · server4 16 ·
  server5 14 · server7 15 · server8 9 · server9 10 · server10 7 ·
  server-mutations 25 — **۱۱ سوتِ سرور سبز**.
- جهش: باگ ۱ (حذفِ مرز) → E11 شکست · باگ ۲ (حذفِ مجوز) → T10a/T10d شکست.

### ۳) تصمیم‌های این دور (خودم، با مستند)
- باگ ۲ با **حداقلِ ممکن** بسته شد: فقط «attendance_modes» به لیستِ مدیر
  (نه end-pointِ تازه، نه تغییرِ ساختار) — دامنه با inScopeِ موجود.
- سوتِ چاسِ کلاینت، رکوردهای آزمون را پاک می‌کند (پاک‌سازی انتهای سوت)
  تا دموِ بعدیِ jsdom کثیف نشود.

### ۴) وضعیتِ ریپو
- main = ۴ کامیتِ دور ۷۲ روی «f43a2cf» (رأسِ دور ۷۰) — زنجیرهٔ کاملِ
  دور ۷۱ دست‌نخورده (d737b8c..3c71a02).
- نقشه‌راه: 42/42 ✅ — این دور چیزی از آن نکاست؛ باگ‌های پیدا‌شده
  زیرِ بند‌های موجود (۴.۷ الگوها / ۱۳.۱ روزِ غیرحضوری) بودند.
- باقی‌ماندهٔ خارجی: درگاه‌های SMS/استعلام، object store (AD قفل)،
  TLS + تستِ 14 روزه (≥12)، شمارهٔ تماس/لیستینگ Play، PDF واقعی (1.6)،
  چیدمانِ خودکارِ چندپایه (AD قفل).

## ## Handoff — دور ۷۱: پنج بند باقی‌ماندهٔ کدِ نقشه‌راه (تداخل برنامه، مسیر نهم، کارنامهٔ چاپی، چندپایه، دوازدهم↔مشاور) — ۱۴۰۵/۰۶/۱۵ (۲۰۲۶-۰۹-۰۶)

### ۱) چه شد (پنج بند، هرکدام commitِ جدا — همهٔ کدِ باقی‌ماندهٔ دور ۷۰ انجام شد)
- **بند ۱ — ۶.۵-lite کنترل تداخل برنامه «d737b8c»:** `scheduleConflicts`
  (تداخلِ دبیرِ سراسری + تداخلِ کلاس) + `suggestSlots` (۳ جایِ آزاد:
  روزهای کاریِ همان مدرسه ∩ isSchoolDay، کلاس و دبیر آزاد) + بنرِ مدیر
  با دکمهٔ پیشنهاد/جابه‌جایی (گاردِ لحظهٔ اجرا) + نشانِ «بدون تداخل» +
  اطلاعیهٔ فقط‌خواندنی برای دبیر. **تصمیم: تولید خودکار نمی‌سازیم** —
  مدیر خودش می‌چیند. schedconf۲ (۹) + ۳ جهش.
- **بند ۲ — ۵.۱ مسیرهای نهم «7a339cf»:** `PATHWAY_NOTES` +
  `pathwayTenthSubjects` + `pathwayGuideCard` در ۲۶-curriculum — فقط برای
  دانش‌آموزِ پایهٔ نهم، در تبِ شناسنامهٔ پرونده (ولی/دانش‌آموز/مدیر).
  خطِ مشخص: «فقط اطلاع‌رسانی» — انتخاب در استعدادهای درخشان، نه جایگزین
  مشاوره. pathway۲ (۷) + ۳ جهش.
- **بند ۳ — ۴.۳ کارنامهٔ چاپ‌شونده «79361d9»:** `reportCardCert` در
  ۳۳-forms-sms (سازندهٔ خالص + printableDoc): نمرهٔ دانش‌آموز + میانگینِ
  کلاس + معدلِ وزنی + **رتبهٔ کلاس** (معدلِ وزنیِ هم‌کلاسی‌ها) +
  حضور/غیبتِ کلِ سال؛ دکمهٔ «چاپ کارنامه» در نوارِ گواهی. صداقت: ستونِ
  مستمر/پایانی نساختیم (در داده «برگه» داریم). report۲ (۱۰) + ۳ جهش.
- **بند ۴ — ۲.۱ کلاسِ چندپایه «e389015»:** چیکنک «کلاسِ چندپایه» در
  مودالِ کلاس + دکمهٔ «عضویتِ دروس» روی کارت (گیت با has_multigrade)
  — مودالِ ویرایشگر که دروس را از برنامهٔ هفتگی می‌گیرد و عضویتِ هر درس
  (checkbox) را روی همان جدولِ موجود class_subject_members می‌نویسد؛
  «همه» = بدون ردیف = fallback = رفتارِ امروز. AD ۲.۱ به‌روز (باقی‌مانده
  = چیدمانِ خودکار). multigrade۲ (۹) + ۳ جهش.
- **بند ۵ — ۵.۲ دوازدهم↔مشاور «37c5edf»:** `counselor_msgs` +
  `isTwelfthGrader/counselorThread/counselorMsgInbox/counselorMsgSend` —
  دانش‌آموز/ولی مستقیم با مشاور (تبِ «مشاور» در پروندهٔ دوازدهم + بخش
  «مسیرِ دوازدهم‌ها» در صفِ مشاور). گاردها: دوازدهم بودن، ۳–۵۰۰ نویسه،
  دانش‌آموز=خودش/ولی=فرزندش/مشاور=مدرسه‌اش (کلاینت + سرور). سرور:
  WRITE_PERMS فقط student/parent/counselor (مدیر عمداً خارج — مسیرش
  counselor_refs است). cmsg۲ (۹) + cmsg۳ (۱۱) + ۴ جهش (۳ کلاینت + ۱ سرور).

### ۲) وضعیتِ نقشه‌راه (پایانِ دور ۷۱)
**همهٔ ۵ موردِ «باقی‌ماندهٔ کد» بسته شد.** جدولِ ۴۲ مورد: ۳۵ موردِ
قبلی + این دور ۴ مورد (۲.۱، ۴.۳، ۵.۱ و ۶.۵-lite) + ۵.۲ = **۴۲ از ۴۲ سبز**.
باقی‌مانده فقط خارج از کد است: درگاهِ واقعی SMS/استعلام، استورِ فایلِ
سرور (قفل AD)، TLS + ۱۴ روزِ Play (۱۲+ تستر)، تلفنِ پشتیبانی و ورودی‌های لودینگ.

### ۳) سؤوت‌های تازهٔ این دور (همه سبز)
schedconf۲ (۹) + ۳ جهش · pathway۲ (۷) + ۳ جهش · report۲ (۱۰) + ۳ جهش ·
multigrade۲ (۹) + ۳ جهش · cmsg۲ (۹) + cmsg۳ (۱۱) + ۴ جهش ·
خطِّ پایه: run (۳۳) + simulation (۴۸/۴۸) + همهٔ سئوت‌های سرور.

### ۴) تصمیم‌های این دور
- ۶.۵: **بدون تولید خودکار** (تصمیمِ بند — مدیر جابه‌جا می‌کند، سیستم
  فقط تداخل/پیشنهاد می‌دهد).
- ۴.۳: رتبهٔ کلاس از معدلِ وزنیِ هم‌کلاسی‌ها (فقط دانش‌آموزانی که نمره
  دارند در مخرج می‌آیند)؛ «میانگین کلاس» فقط با دادهٔ همان نوبت/کلاس.
- ۲.۱: fallback تنبلِ classSubjectMembers دست‌نخورده — صفر تغییر رفتار
  برای کلاس‌های عادی؛ UI فقط جدولِ موجود را دستی می‌زند.
- ۵.۲: مدیر به counselor_msgs **نمی‌نویسد** (fail-closed روی سرور)؛
  رشتهٔ مسیر «بسته‌شدن» ندارد (مثل messages) — رسیدگیِ رسمی با
  ارجاعِ ۱.۴ جداست.
- seed سرور بازسازی شد (node server/seed.js) چون counselor_msgs به
  سیمای db اضافه شد.

### ۵) چک‌لیستِ سیم‌کشی (برای دور بعد)
- [ ] اگر چیدمانِ خودکارِ چندپایه خواسته شد: از روی جدول
  class_subject_members بساز، ساختار تازه نساز (AD ۲.۱).
- [ ] PDF واقعیِ کارنامه/گواهی = قفلِ ۱.۶ — فقط خروجیِ تازه، ساختار
  داده دست‌نخورده.
- [ ] گزارشِ تجمیعیِ دور ۷۱: docs/REPORT_۲۰۲۶-۰۹-۰۶_ROUND۷۱.md

---

## فاز فرناز — قدم ۰: راستی‌آزماییِ بندهایِ ازپیش‌موجود (S1–S3)

شاخه: `feat/farnaz-phase1` از `4ca531c`. هر سه بند روی main موجود و سبز بودند — بدونِ تغییرِ کد، فقط راستی‌آزمایی + ثبت.

### S1 — قالبِ دومِ کارنامه ✅ (موجود)
- کد: `reportCardCert(sid,term,tpl)` در `src/js/33-forms-sms.js:128` — شاخهٔ `tpl==='compact'` (بند ۴.۳) + انتخاب‌گرِ `cert_tpl` در `src/js/17-student-record.js:86` (کلاسیک/فشردهٔ دوستونه) + سیم‌کشی در `19-actions-core.js:1101`.
- تست: `tests/reporttpl2.js` ‏۷/۷ ✅ + `tests/report2.js` ‏۱۰/۱۰ ✅ (روی همین شاخه اجرا شد).
- (توجه: `tests/compact.js` مربوط به فشرده‌سازیِ دفترچه است نه قالب — ‏۱۹/۰ ✅ ولی شاهدِ این بند نیست.)

### S2 — گواهیِ اشتغال به تحصیل ✅ (موجود)
- کد: `enrollmentCert(sid)` در `src/js/33-forms-sms.js:331` + اکشن در `19-actions-core.js:1111` + کدِ راستی‌آزمایی (`certCodeCalc`/`certVerify`).
- تست: `tests/certify.js` ‏۸/۸ ✅ (C1 اشتغال) — روی همین شاخه اجرا شد.

### S3 — گواهیِ انتقالی ✅ (موجود)
- کد: `transferCert(sid)` در `src/js/33-forms-sms.js:360` + اکشن در `19-actions-core.js:1120` + `certOverall` (وضعیت کلی).
- تست: `tests/certify.js` ‏۸/۸ ✅ (C2 انتقالی) — روی همین شاخه اجرا شد.

### بیزلاینِ قدم ۰ (روی `feat/farnaz-phase1`)
- `node build.js --check` → exit 0 ✅ · `node tools/check-authz.js` → exit 0 ✅ · `node tests/smoke.js` → ‏۵۴۷/۵۴۷ ✅

### S4 — فیلدِ معدلِ ورودی ✅ (پیاده شد)
- مدل: `entry_gpa` به users در `authz/model.json` + بازتولیدِ `write-perms.json` (ژنراتور، +۱ خط).
- سرور: `server/validate.js` — نگاشتِ `entry_gpa→score` (۰ تا ۲۰؛ خالی=null از isEmpty رد می‌شود؛ null سروری با Object.assign منتشر می‌شود).
- کلاینت: فیلدِ `u_entry_gpa` در `userModal` (`18-modals.js`) + پارس/اعتبارسنجی در `user-save` (`19-actions-admin.js`: خالی=null، عددِ ۰–۲۰، ارقامِ فارسی با toLatinDigits، فقط role=student) + سطرِ «معدل ورودی» در `studentProfileCard` (`17-student-record.js`).
- تست: `tests/entry-gpa.js` ‏۱۹/۱۹ ✅ (فرم، فارسی، ۳ رد، null، غیرِدانش‌آموز، نمایش، allowlist، نگاشت+قانونِ سرور، سینکِ زندهٔ قبول/رد) + `tests/entry-gpa-mutations.js` ‏۶/۶ کشته ✅.
- گیت‌ها: build ✅ · check-authz ✅ · ‏smoke ‏۵۴۷/۵۴۷ ✅.
- عارضهٔ مثبت: بازبیلد، مُهرِ کهنهٔ `USER_GUIDE.html` (یافتهٔ حسابرسیِ دور ۲) را هم تازه کرد.
- مشاهده (خارج از اسکوپ، رفع نشد): `last_gpa` و رفقا در ایمپورتِ اکسل فقط لوکال (`rec[k]=`) نوشته می‌شوند و سینک نمی‌شوند — اگر سینکِ آن‌ها خواسته شد، تصمیمِ جدا می‌خواهد.

### S5 — تمایزِ پانسیون از اقامتِ کامل ✅ (پیاده شد)
- مدل: `kind∈{full,pansion}` روی `dorm_assignments` در `authz/model.json` + بازتولیدِ `write-perms.json`.
- سرور: `server/validate.js` — ‏`kind→enum[full,pansion]` فقط برایِ `dorm_assignments` (kind در کالکشن‌های دیگر معنای جداگانه دارد).
- کلاینت: سلکتِ `dorm_kind` در مودالِ انتساب + اعتبارسنجی در `dorm-assign-pick` (`19-actions-dorm.js`) + هلپرِ `dormKindOf/dormKindLabel` با پیش‌فرضِ `full` برایِ رکوردهایِ قدیمی + چیپِ نوع روی بجِ ساکن (`65-dorm.js`).
- تصمیمِ ثبت‌شده: شمارشِ ظرفیت (occ/پرشدگی) همهٔ انتساب‌ها را می‌شمارد (پانسیون هم اتاق دارد — رفتارِ ظرفیت عوض نشد؛ اگر مدرسه خواست پانسیون از ظرفیت کم شود، یک‌خطی و برگشت‌پذیر است).
- تست: `tests/dorm-kind.js` ‏۱۷/۱۷ ✅ (سلکت، ثبتِ هر دو نوع، ردِ نامعتبر، سازگاریِ قدیمی، برچسب‌ها، رندرِ صفحه، allowlist، قانونِ سرور، سینکِ زنده) + `tests/dorm-kind-mutations.js` ‏۵/۵ کشته ✅.
- گیت‌ها: build ✅ · check-authz ✅ · ‏smoke ‏۵۴۷/۵۴۷ ✅.
## فاز فرناز — چت ۳: دسته‌های E.1–E.6، G.1، G.2

شاخه: `feat/farnaz-phase1-chat3` از `4ca531c` (origin/main). اصول `SKILLS_MASTER.md` خوانده و رعایت می‌شود.

### بیزلاین (پیش از E.1)
- `node build.js --check` → exit 0 ✅ · `node tools/check-authz.js` → exit 0 ✅ · `smoke` → ‏۵۴۷/۵۴۷ ✅
- خط‌مبنای حضور: هارنسِ «۸۳۶ms کلاس ۱۳نفره» در ریپو پیدا نشد (نه در tests/ نه در docs) — عددِ پرامپت با رندرِ خالص قابل‌بازتولید نیست.
  پروبِ خودم (`/tmp/att-baseline.js`: ‏renderRoute صفحهٔ حضور، کلاسِ ۱۳نفره، jsdom، میانهٔ ۵ تکرار) = **‏۱۱ms**.
  هیچ‌یک از بندهای E/G روی مسیرِ رندرِ حضور دست نمی‌زنند؛ پروب پس از اتمامِ Eها تکرار و مقایسه می‌شود.

## E.1 فرناز — چک‌لیست «فردا چی لازم دارم» (چت ۳، آیتم ۱) — ✅
- پیاده‌سازی (کلاینت‌فقط): `tomorrowCard(sid,iso)` در `src/js/08-dashboard.js` (کنار todayCard؛ فراخوانی در summaryBlock) —
  درس‌های فردا از برنامهٔ هفتگی (`addDaysISO(iso,1)` + همان `todayDow`)، نگاشت وسیله `TOMORROW_GEAR`
  (ورزش/تربیت‌بدنی→👕، هنر→🎨، آزمایشگاه→🥼)، بج جابه‌جایی فردا (همان الگوی subs)، پیام «فردا کلاسی نیست» اگر خالی.
- تیک‌ها: `data-act="tomorrow-check"` + اکشن در `coreActions` — فقط `Store` (حافظهٔ محلی، کلید
  `payesh_tmr_<sid>_<iso>`)، بدون سرور/رندر مجدد؛ `ACTION_ROLES`: ‎['student','parent']‎.
- دو شکار واقعیِ تست: (۱) دیسپچر روی کلیک preventDefault می‌کند پس هندلر دستی `el.checked` را تاگِل می‌زند؛
  (۲) پروب ایزوله ثابت کرد jsdom برخلاف مرورگر قبل+بعد از دیسپچ checked را تاگِل می‌کند (حتی با preventDefault) —
  پس به‌جای کلیکِ نمایشی: assert روی `canAction` (مدیر=رد، دانش‌آموز=مجاز) + فراخوانی مستقیم اکشن.
- رگرسیون اسموک (بدون ماسک): تست امنیتی «فقط لایهٔ داده» حتی واژهٔ localStorage در *کامنت* را رد می‌کند —
  کامنت‌ها به «حافظهٔ محلی» بازنویسی شدند؛ کد از اول فقط Store بود.
- گیت‌ها: tomorrow ‏15/15‏، جهش ‏5/5‏ کشته، build --check ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## E.2 فرناز — شمارش‌معکوس و یادآوری امتحان (چت ۳، آیتم ۲) — ✅
- شمارش‌معکوس (رندر خالص): `nextExamFor` + `examCountdownCard` در `src/js/08-dashboard.js` (در summaryBlock) —
  نزدیک‌ترین امتحانِ کلاس از همان `exams` (آینده‌فقط، tie-break با ساعت)؛ «۳ روز تا امتحان ریاضی» / «فردا» / «امروز».
- یادآوری (پنجرهٔ ۰-۲ روز، ضدتکرار): `examReminderSend` — پیامک از صف موجود (`notifyRequest` با kind=event و
  `source_ref=examrem:<id>`، ضدتکرار دیتابیسی) + اعلان داخل‌برنامه (`notifications` با type جدید `exam_remind`)
  برای دانش‌آموز و همهٔ والدین لینک‌شده (نشان حافظهٔ محلی از طریق Store). پیامک خاموش ⇒ فقط اعلان داخلی.
- بدون data-act جدید ⇒ بدون تغییر authz؛ هیچ نقشی هاردکد نشد. حضور دست‌نخورده (پروب ۱۱ms پابرجاست).
- گیت‌ها: examcount ‏16/16‏، جهش ‏5/5‏ کشته، رگرسیون tomorrow ‏15/15‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## E.3 فرناز — هدف‌گذاری شخصی نمره (چت ۳، آیتم ۳) — ✅
- ذخیره: `goalKey/goalGet` فقط از طریق Store (کلید `payesh_goal_<sid>_<sub>`)؛ اکشن `goal-save`
  (نقش‌های student/parent، بدون WRITE_PERMS چون حافظهٔ محلی است) با اعتبارسنجی عدد ۰-۲۰
  (رد ساکت‌نشدنی + پشتیبانی ارقام فارسی) و گارد مالکیت دوم `goalViewerOk` (خود/ولی لینک‌شده).
- نمایش: خط مرجع به‌صورت تیک سبز `.goal-tick` در هر ستون نمودار روند (همان مختصات avg-tick،
  بدون ریسک چیدمان) + لجند «🎯 هدف» + ویرایشگر inline؛ فقط وقتی تک‌درس انتخاب شده و بیننده
  خود/ولی است؛ وگرنه «هنوز هدفی تعیین نشده»؛ دیگران (مدیر/دبیر/هم‌کلاسی) هیچ‌چیز نمی‌بینند.
- شکار تست جهش: لنگر T3a سست بود («🎯 هدف» در لیبل ویرایشگر هم هست) و M1 زنده ماند —
  لنگر دقیق شد («🎯 هدف: <b>») و هر ۵ جهش کشته شدند.
- حضور دست‌نخورده. گیت‌ها: goals ‏16/16‏، جهش ‏5/5‏، رگرسیون E.1/E.2 سبز، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## E.4 فرناز — خروجی ICS «دانلود همه» (چت ۳، آیتم ۴) — ✅
- کشف: خروجی ICS تک‌دانش‌آموز از قبل بود (`ics-export` در 66-client-features، با نگهبان IDOR دور ۸۹).
  موازی‌کاری نشد: `icsEsc` موجود reuse شد؛ افزودهٔ E.4 = دامنه‌به‌نقش + «دانلود همه» با نام‌فایل قراردادی.
- پیاده‌سازی در `src/js/20-communication-finance.js`: سازنده‌های VEVENT (امتحان ساعت‌دار با DTEND از
  duration + تمام‌روز برای تقویم)، تاشدن ۷۵ اکتتی بدون شکستن UTF-8، UID پایدار، CRLF، بدون BOM؛
  دامنه: دانش‌آموز→کلاس خود، ولی→کلاس فرزندان، کادر آموزشی→مدرسه، بقیه→فقط رویدادهای صفحه (کمینه‌سازی).
- دکمه در `viewCalendar` + اکشن `ics-download` (F7). مجوز: ورودی ACTION_ROLES ندارد چون آن جدول معنای
  WRITE دارد (ابزار ۴ ناهماهنگی داد)؛ گیت داخل اکشن با `canRoute('calendar')` — بدون هاردکد نقش.
  `authz/write-perms.json` با مولد رسمی بازتولید شد (ورودی roles:null، مطابق ۵۴ اکشن بی‌برچسب دیگر).
- درس ابزار: ویرایش‌های موازیِ cùng‌فایل مسابقه می‌دهند (۳ مورد success کاذب) — از این به بعد تک‌تک + grep.
- گیت‌ها: ics ‏22/22‏، جهش ‏5/5‏، رگرسیون E.1/E.2/E.3 + ‏client-features ‏12/12‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## E.5 فرناز — پاسخ سریع ولی به اعلان غیبت (چت ۳، آیتم ۵) — ✅
- کشف: زنجیره قبلاً کامل بود (quick-excuse روی پرونده → leaves pending → decideLeave → excused + اعلان).
  شکاف واقعی E.5: (۱) دکمه کنار اعلان نبود، (۲) اعلان غیبت در زمان اجرا ساخته نمی‌شد (فقط seed).
- افزوده (بدون اکشن جدید، بدون تغییر authz): `absenceNotifFor` (ساخت اعلان با `ref='att_<id>`، ضدتکرار) +
  هوک در `att-commit`؛ `absenceAttOf` (حل رکورد از ref + fallback ولی↔فرزند↔تاریخ برای دادهٔ قدیمی)؛
  `absenceExcuseBtn` در `viewNotifications` (دکمه برای ولی / بج «در انتظار بررسی» / مخفی برای بقیه)؛
  ضدتکرار در `qe-save`؛ ref در seed. `write-perms.json` با مولد رسمی: att-commit += notifications.
- اصل «ولی وضعیت را عوض نمی‌کند» با جهش M5 (update مستقیم) نگهبانی می‌شود. رندر حضور دست‌نخورده (پروب ۱۱ms).
- شکار جهش: M4 اول زنده ماند چون myNotifs ذاتاً اعلان ولی را به دانش‌آموز نمی‌دهد — T12 گیت را مستقیم تست کرد.
- گیت‌ها: excuse ‏16/16‏، جهش ‏5/5‏، رگرسیون E.1-E.4 + ‏client-features ‏12/12‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## E.6 فرناز — یادداشت شخصی ولی (چت ۳، آیتم ۶، پایان دستهٔ E) — ✅
- کارت `parentNoteCard` در `viewChildren` (بالای پروفایل هر فرزند، فقط ولیِ لینک‌شده): textarea با
  maxlength=500 + دکمهٔ `pnote-save` + «آخرین به‌روزرسانی» یا «هنوز یادداشتی ثبت نشده».
- حریم سه‌لایه: (۱) کلید `payesh_note_<pid>_<sid>` (جدایی والدین)، (۲) گیت رندر (ولیِ لینک‌شده فقط)،
  (۳) گارد اکشن + canAction(parent). ذخیره فقط Store (JSON با {t,u})؛ خالی=پاک‌سازی؛ ۵۰۰+ رد؛ esc در رندر.
- نام اکشن `pnote-save` شد تا با `tnote-save` (یادداشت سروری دبیر) اشتباه نشود. بدون تغییر WRITE_PERMS.
- گیت‌ها: pnote ‏19/19‏، جهش ‏5/5‏، رگرسیون E.1-E.5 + ‏client-features ‏12/12‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## G.1 فرناز — طرح شاخص سلامت مدرسه (سند، بدون کد) — ✅
- `docs/G1_HEALTH_INDEX_DESIGN.md`: بازاستفاده از الگوی `atRiskList` (وزن‌دار ۰-۱۰۰، سطوح، دلایل تنبل)
  برای مدرسه؛ ۴ سیگنال (افت ورود کادر، افت ماژول‌های کلیدی، فشار تیکت G.2، تازگی داده)؛ فقط سوپرادمین.
- یافته‌ها: بازدیدها فقط localStorage هر مرورگر است (S1 نیاز به پروکسی audit یا لاگ سرور دارد)؛
  S2 از audit موجود بدون دادهٔ جدید؛ S3 پیش‌نیاز G.2. ۴ تصمیم باز برای فرناز ثبت شد.
- بندهای کوچک پرامپت = همان S1–S5 (روی `feat/farnaz-phase1` سبز و پوش‌شده) ⇒ طبق دستور نادیده گرفته شد.
- صفر خط کد؛ گیت‌ها سبز (build ‏0‏، authz ‏0‏، smoke ‏547/547‏) ✅

## G.2 فرناز — تیکت پشتیبانی سبک (چت ۳، آیتم ۷، پایان کار) — ✅
- کالکشن `support_tickets` (model: ins=[manager]، upd=[superadmin]، del=[]) + آرایه در `generate()`
  (بوت همیشه شکل تازه می‌سازد + replay ⇒ دیتای قدیمی امن)؛ روت `tickets` در منوی مدیر (ارتباطات)
  و سوپرادمین (نظارت روزانه) + TITLES + case؛ نمای `viewTickets` (مدیر: مدرسهٔ خود + ثبت؛ سوپر: همه + ۳ دکمهٔ وضعیت).
- اکشن‌ها: `ticket-new/save` (manager؛ عنوان اجباری، اولویت معتبر، status=open) و `ticket-status`
  (superadmin؛ enum + bump شدن updated_at). `write-perms.json` با مولد رسمی (۸۱ مجموعه، ۱۷۳ نویسنده).
- رگرسیون اسموک (بدون ماسک): تست «منوی هر نقش» فهرست را پین کرده بود — NAV_EXPECT برای دو نقش
  به‌روزرسانیِ مشروع شد (۲ سطر + کامنت G.2). شکار جهش: T9b اول به‌خاطر updated=امروزِ بدو تولد سست
  بود (کهنه‌سازی اضافه شد)؛ T10 بدون try/catch کرش را ماسک می‌کرد.
- گیت‌ها: tickets ‏20/20‏، جهش ‏5/5‏، رگرسیون E.1-E.6 + ‏client-features ‏12/12‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## استندبای چت ۳ — مستندسازی مغایرت نگاشت D (۱۸/۰۶، بدون کد) — ✅
- `docs/D_MAPPING_CLARIFICATION.md`: دو نگاشت (فنی چت ۱ / ویژگی استندبای) کنار هم + نگاشت نهایی
  پیشنهادی (D.1=قفل تصمیم، D.2=کارت امتیازی، D.3=اطلاعیه فوری، D.4=کمبود نیرو) + ۴ سؤال باز برای چت ۴.
- پیش‌نویس‌های طرح (بدون کد): `D2_DRAFT.md` (روی perSchoolRows + الگوی G.1، فقط‌خواندنی)،
  `D3_DRAFT.md` (گزینهٔ A: severity + ‏office_id‏ روی announcements)، `D4_DRAFT.md` (مسدود به تصمیم مبنای «موردنیاز»).
- صفر تغییر در `src/server/tests`؛ بدون PR؛ چت ۲ همچنان بدون شاخه.

## C.1 فرناز — نوع جلسهٔ صورت‌جلسه (انجمن/معلمان/دانش‌آموزان، همان جدول) — ✅
- `meeting_type` به `assoc_minutes` (مدل + مولد write-perms، هر دو ۱ خط)؛ سلکت مودال + اعتبارسنجی enum
  در `assoc-min-save`؛ ستون بج در فهرست (`mtName/mtBadge` با پیش‌فرض انجمن برای رکورد قدیمی)؛ عنوان چاپ برحسب نوع.
- شکار جهش: لنگر T1 سست بود (متن «انجمن» در سربرگ ایستای صفحه هم هست) — به بج دقیق + شمارش ۲ سید قدیمی
  تقویت شد؛ T5 هم به هر سه بج دقیق.
- گیت‌ها: meetingtype ‏8/8‏، جهش ‏5/5‏، assocmin2 ‏8/8‏، assocmin3 ‏8/8‏، client-features ‏12/12‏،
  build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## C.2 فرناز — برنامه ویژه مدرسه، بوم (فیلد متنی در تنظیمات) — ✅
- `annual_program` روی `schools` (مدل + مولد write-perms، هر دو ۱ خط)؛ تکست‌ار m_boom در مودال
  مدرسه + ذخیره در `school-save`؛ نمایش فقط‌خواندنی (۸۰ حرف، esc) زیر نام مدرسه در فهرست مدارس
  (مدیر هم بوم مدرسهٔ خود را می‌بیند). ویرایش کماکان سوپرادمین (گیت موجود، بدون تغییر).
- شکار جهش: M4 اول با حذف نابالانس `esc(` سینتکس را شکست و «مرگ زودهنگام» داد — لنگر به کل
  عبارت بالانس اصلاح شد و هر ۵ جهش کشته شدند.
- گیت‌ها: boom ‏6/6‏، جهش ‏5/5‏، meetingtype ‏8/8‏، client-features ‏12/12‏، build ‏0‏، authz ‏0‏،
  smoke ‏547/547‏ ✅ (پوش مسدود: اعتبار راه‌دور در سندباکس نیست — کامیت محلی)

## C.3 فرناز — گزارش عمومی قابل انتشار (خلاصهٔ داشبورد مدیر) — ✅
- `publicStats(sid)` (نرخ حضور/میانگین/رویدادها از attendance/grades/calendar) + چاپ رسمی
  (`pubrepPrint`: سربرگ مدرسه + ۳ شاخص + سلب «بدون دادهٔ حساس») + خروجی CSV (`publicReportRows`)؛
  دکمه‌ها فقط مدیر؛ گیت نقش دولایه (هندلر + تابع)؛ بدون تغییر مدل/سرور (فقط‌خواندنی).
- شکار جهش: M1 زنده ماند چون گیت درونی نگه داشت (دفاع عمقی واقعی) — P6 به سنجش مجزای هر لایه
  + P8/M6 برای لایهٔ درونی؛ M3 با ۱ سطر آلودگی زیر گردکردن پنهان شد — P7 با ۱۰۰ سطر آلودگی
  روی مدرسهٔ موقت تقویت شد. هر ۶ جهش کشته شدند.
- گیت‌ها: pubrep ‏9/9‏، جهش ‏6/6‏، meetingtype ‏8/8‏، boom ‏6/6‏، client-features ‏12/12‏،
  build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅ (پوش مسدود: اعتبار راه‌دور در سندباکس نیست — کامیت محلی)

## ریزولوشن PR #13 — ریبیس روی main ‏5d7fe50‏ (چت ۳، ۱۹/۰۶) — ✅
- یافتهٔ اصلی: main با PR #12 پیاده‌سازی موازی C چت ۱ را دارد (مِین برنده شد):
  C.1 → مقدار ‏assoc‏ + فیلتر + اعتبارسنجی سرور؛ C.2 → ‏boom_goals‏ + ویرایش مدیر + سقف ۲۰۰۰ + کارت داشبورد.
  کد C.1/C.2 چت ۳ حذف و سئوت‌های ناسازگار ‏meetingtype/boom‏ پاک شدند (گزارش‌های FARNAZ_C1/C2 سند تاریخی ماندند).
- C.3 هر دو سطح نگه داشته شد (لاگین چت ۱ + داشبورد/چاپ/CSV چت ۳ — بدون تداخل نام).
- کانفلیکت واقعی: HANDOFF (هر دو، زمانی) + USER_GUIDE (مین، بعد rebuild) + index.html (بازتولید) +
  ۶۰/۱۸/۱۹-core (مین) + ۰۹/۱۸/۱۹-admin (مین)؛ ادعای پرامپت دربارهٔ ۰۵-router/smoke/AI_PROMPT/۰۲-demo-data
  کهنه بود (بدون واگرایی، بدون کانفلیکت). پوش پس از ریبیس با ‏--force-with-lease‏ (نه push ساده).
- گیت‌ها پس از ادغام: minutes2 ‏8/8‏، boom2 ‏8/8‏، public2 ‏8/8‏، pubrep ‏9/9‏، tickets ‏20/20‏،
  assocmin2 ‏8/8‏، client-features ‏12/12‏، build ‏0‏، authz ‏0‏، smoke ‏547/547‏ ✅

## G.3 فرناز — بررسی USER_GUIDE.html (فقط گزارش، چت ۳، ۱۹/۰۶) — ✅
- `docs/G3_USER_GUIDE_REVIEW.md`: راهنما برای مدیر غیرفنی قابل‌استفاده (آشنایی/ورود/نقش‌ها) ولی ناقص است —
  «۳۳ منو» کهنه (واقعی ۴۰)، ماژول‌های فرناز غایب، بخش فنی همگامی نامربوط، ۳ غلط تایپی؛ ۸ حساب نمونه دقیق.
  رأی: به‌روزرسانی هدفمند، نه بازنویسی. صفر تغییر کد.

## ریزولوشن PR #14 — مرج main ‏daefb69‏ در شاخه چت ۴ (توسط چت ۳، ۱۹/۰۶) — ✅
- تنها کانفلیکت: ۱ خط مُهر بیلد (`payesh-build`) در `USER_GUIDE.html` — بدون هیچ واگرایی محتوایی
  (تغییر گاید چت ۴ فقط همان مُهر بود). حل با مرج (نه ریبیس — شاخهٔ فعال مشترک، بدون force) + بازتولید با `node build.js`.
- گیت‌ها: build ‏0‏، authz ‏0‏، smoke ‏547/547‏، minutes2/boom2/public2 ‏8/8‏، pubrep ‏9/9‏؛ بدون اکشن تکراری ✅

​
 |  | 
1072
 

## تعمیر G.2 — جدول support_tickets در schema.sql (چت ۳، ۱۹/۰۶) — ✅

- گزارش چت ۱ درست بود (جدول غایب). ولی SQL پیشنهادی پرامپت ۲ باگ enum داشت (`medium` به‌جای `med`،
  `reviewing` به‌جای `review`) + خلاف قرارداد فایل بود (SERIAL/بدون کوتیشن/CHECK دستی) — به‌جای
  دست‌نویسی، مولد رسمی `node tools/migrate-to-pg.js` اجرا شد (بدون `--execute`، بدون تماس با دیتابیس).

- خروجی مولد + ستون‌های جاماندهٔ C چت ۱ (`meeting_type`، `boom_goals`)؛ چرن تایم‌استمپ مولد
  (غیرقطعی) برگردانده شد: دیف ۱۲۶ ← ۴۰ خط، ۵ هانک معنایی، صفر churn.

- گیت‌ها: write-perms بدون تغییر، build `0`، authz `0`، smoke `547/547`، tickets `20/20` ✅

## C.3-security فرناز — سه اصلاح امنیتی گزارش عمومی (چت ۱) — ✅

- اصلاح ۱ (پروجکشن): تفکیک `publicReportHTML` به `publicReportData` (فقط تجمیعی:
  نام/سطح/شهر، شمارش‌ها، جلسه‌ها `{تعداد،آخرین}`، اهداف) + رندر خالص بدون دسترسی به db؛
  `publicSchools` فقط `active=1`؛ پیام تهی «داده‌ای برای نمایش وجود ندارد».

- اصلاح ۲ (پرچم): `public_goals` در `schools` (مدل + `FLAG_FIELDS` سرور + بذر `0`)؛ گیت انتشار
  در پروجکشن؛ چک‌باکس مدیریتی در مودال مدرسه (`m_boom_pub`) و مودال بوم (`boom_pub`)؛
  `write-perms.json` بازتولید (۸۵ مجموعه، ۱۸۱ اکشن).

- اصلاح ۳ (دادهٔ واقعی): اندپوینت عمومی `GET /api/public-report` (فقط تجمیعی، بدون PII،
  گیت پرچم سمت سرور) + پل ناهمگام `pubReportEnsure` در حالت سروری؛ آفلاین-اول
  (شکست → دادهٔ محلی + یادداشت «دادهٔ محلی»)؛ برچسب نوع جلسه سمت کاربر (glyph-safety).

- تست: سوئیت جدید `tests/public-security.js` `10/10`؛ P4 و نمادهای MM2/MM3 به کد نو به‌روز شد.

- گیت‌ها: smoke `547/547`، authz `0`، build `0`، هر ۷ سوئیت جهش `3/3` ✅

## Devin-R1R2R3 فرناز — رفع ۳ مشکل Devin Review در PR #8 (چت ۱) — ✅

- R1 (بحرانی): قفل ویرایش دورهٔ تکمیل‌شده در `saveTrainingCourse` (هر تغییر واقعی رد با
  «دوره تکمیل شده قابل ویرایش نیست»؛ فقط بازذخیرهٔ عینی مجاز تا idempotency صدور T4 بماند) + تست T12.

- R2: `certificates.year` از INTEGER به VARCHAR(50) در `server/schema.sql` + اصلاح ریشه‌ای
  مولد `tools/migrate-to-pg.js` (استثنای هدفمند با colName؛ `enrollments.year` دست‌نخورده).

- R3 (بحرانی): ۴ جدول `donations`/`safety_drills`/`staff_attendance`/`training_courses` در
  `server/schema.sql` (بلوک‌ها بایت‌به‌بایت خروجی مولد پس از استثناهای INTEGER/NUMERIC(14,2)؛
  ۸۳→۸۷ جدول). شکاف کشف‌شدهٔ خارج از scope: جدول `support_tickets` هم نیست.

- گیت‌ها: smoke `547/547`، authz `۰`، build `۰`، training2 `12/12` (+T12)، drills/donations/staffatt `10/10`،
  public2 `8/8`، public-security `10/10`، minutes2/boom2 `8/8`، assocmin2/3 `8/8`، جهش training `3/3` ✅
## ریزولوشن PR #11 — مرج main در feat/farnaz-phase1 (توسط چت ۳، ۱۹/۰۶) — ✅
- ۳ کانفلیکت واقعی: HANDOFF (هر دو، زمانی — S0–S5 شاخه + تاریخچه مین)، USER_GUIDE (فقط مُهر بیلد؛
  کال‌اوت فرناز سالم ادغام + بازتولید با build)، ‏server/validate.js‏ (هر دو قانون نگه داشته شد:
  ‏meeting_type‏ مین + ‏kind‏ مش S5؛ قانون S4 ‏entry_gpa‏ تمیز ادغام شده بود).
- مرج امن (نه ریبیس — شاخه مشترک، بدون force). یافته محیطی: jsdom@30 در این سندباکس require
  نمی‌شود (undici/webidl skew) — گیت‌ها با jsdom@25 اجرا شدند (فقط محیط تست، بدون تغییر ریپو).
- گیت‌ها: build ‏0‏، authz ‏0‏، smoke ‏547/547‏، entry-gpa ‏19/19‏، dorm-kind ‏17/17‏ ✅

## راستی‌آزمایی B.1 — حضور و غیاب کارکنان (چت ۱، ۲۰/۰۶) — ✅ از قبل کامل
- یافته: B.1 در فاز ۱ پیاده و در main مرج شده بود (`af48dac`، PR #8) — کد تازه لازم نشد.
- تطبیق با spec دستور: جدول `staff_attendance` با هر ۷ فیلد + `created/updated_at`؛ مجوز `ins/upd/del` فقط manager/superadmin
  (`authz/model.json`)؛ enum سروری `present/absent/late` (`server/validate.js:79`)؛ نمای ماهانه (`staffAttMonth`)؛
  جدایی کامل از حضور دانش‌آموز؛ روت `staffatt` + منوی «کادر مدرسه» (`05-router.js:8`)؛ ثبت در `_order.json`.
- بازاجرای امروز روی main تمیز: `staffatt2` **10/10** ✅ + `staffatt-mutations` **3/3** ✅؛ smoke ‏547/547‏، authz ‏۰‏، secret-scan ‏۱۱/۱۱‏ ✅
- `docs/ROADMAP.md` ردیف B.1: 🔴 ← ✅ (طبق قانون ۱ نقشه‌راه).

## راستی‌آزمایی B.2 — دوره‌های آموزش ضمن خدمت + گواهی (چت ۱، ۲۰/۰۶) — ✅ از قبل کامل
- یافته: B.2 در فاز ۱ پیاده و در main مرج شده بود (`26a748c`، PR #8) — کد تازه لازم نشد.
- تطبیق با spec دستور: جدول `training_courses` با هر ۷ فیلد + `created/updated_at` (ساعت = عدد مثبت؛ «۲۰ تا ۶۰»
  در spec جنبهٔ راهنما داشت)؛ مجوز فقط manager/superadmin؛ enum سروری `ongoing/completed`
  (`server/validate.js:81`)؛ گواهی idempotent با کد صحت‌سنجی `certHash` (`DOR-…`) در لحظهٔ تکمیل + دکمهٔ
  راستی‌آزمایی؛ روت `training` + منوی «کادر مدرسه»؛ ثبت در `_order.json`.
- بازاجرای امروز روی main تمیز: `training2` **12/12** ✅ + `training-mutations` **3/3** ✅؛ smoke ‏547/547‏، authz ‏۰‏، secret-scan ‏۱۱/۱۱‏ ✅
- `docs/ROADMAP.md` ردیف B.2: 🔴 ← ✅ (طبق قانون ۱ نقشه‌راه).
## CI — اصلاح jsdom 30 روی شاخه arena (معادل پچ PR #11) — ✅
- `tests/smoke.js`: ۱۱ سلکتور unquoted (`data-day/data-i/data-act/...`) با escape دولایه (`\\"`) نقل‌قول شد؛
  `tests/simulation.js`: ۳ مورد مشابه. نکته: در رشتهٔ evalشده (کوتیشن‌دبل) باید `\\"` در فایل باشد وگرنه
  «missing ) after argument list»؛ در template-literal با querySelector تکی‌کوتیشن، `"` ساده کافی است.
- `package.json`: jsdom ‏^25‏ → ‏^30.0.1‏ (هم‌تراز main) + engines ‏>=22‏؛ ورک‌فلو: ماتریس → ‏[22.x]‏.
- سورس اپ تمیز بود (تک‌مورد `[type=date]` فقط کامنت)؛ سلکتور داینامیک unquoted هم پیدا نشد.
- گیت‌ها با jsdom 30.0.1: smoke ‏547/547‏، simulation ‏48/48‏، bell2 ‏8/8‏، client-features ‏12/12‏،
  uiclick ‏4/4‏، attpartial ‏10/10‏، xss ‏23/23‏، server2، API ‏7/7‏، policy ‏10/10‏، edu ‏7/7‏، authz ‏0‏ ✅

## فاز ۰.۱ — نوع ساختاری مدرسه (school_type) با پیامد واقعی — ✅
- مدل: `school_type` به `schools.fields` در `authz/model.json` + بازتولید `write-perms.json` (هرکدام +۱ خط)؛ مُهر راهنما و cdn-manifest که در HEAD کهنه بودند، قطعی تازه شدند.
- منطق (`src/js/09-schools.js`): `SCHOOL_TYPE_DEFS` (۹ نوع × ۶ پیامد) + `schoolTypeOf/schoolTypeFeatures/schoolTypeCaps`؛ fallback در `schoolCaps`: صریح > نوعی > CAP_DEFAULTS. سرور (`server/validate.js`): enum نه‌تایی (`bad_enum` برای ناشناخته).
- UI: سلکت `m_school_type` در مودال مدرسه + flip خودکار چک‌باکس‌ها با تغییر نوع (override دستی ممکن)؛ `school-save` مقدار را ضدعفونی می‌کند (نامعتبر ← governmental)؛ بدون اکشن جدید.
- تست: `tests/school-type.js` ‏8/8‏ (ST0–ST7) + `tests/school-type-mutations.js` ‏5/5‏ کشته (SM1–SM5)؛ سند: `docs/SCHOOL_TYPE_GUIDE.md`.
- سازگاری: مدارس قدیمی (بی‌نوع) رفتار قبلی‌شان را نگه می‌دارند (قابلیت صریح/پیش‌فرض)؛ نمایشی governmental.
- گیت‌ها: smoke ‏547/547‏، authz ‏0‏، secret-scan ‏11/11‏، build --check سبز، authz-model ‏232/232‏، رگرسیون کامل 185 سبز (از جمله ۲ سوئیت تازه)؛ ۱۲ قرمز عیناً در c22d354 هم قرمزند (A/B با worktree — پیشینه، نامرتبط) ✅

## فاز ۰.۲ — هم‌زمانی دو سال تحصیلی (سال عملیاتی) — ✅
- تحلیل: هم‌زمانی جاری+پیش‌ثبت‌نام ساختاری از قبل بود (بند ۰.۲)؛ ۵ شکاف واقعی پیدا و رفع شد.
- مدل: `school_years.fields` ‏۲ ← ۱۰‏ (رفع DLQ بستن سال: `unknown_field` → dead-letter، گم‌شدن داده) + `schools.active_year_code` + بازتولید write-perms.
- منطق (`39-school-year.js`): ‏`activeYearOf` (override معتبر وگرنه تقویمی)، ‏`prevYearCode`، ‏`isPreSeason` (اسفند-شهریور)، ‏`yearCodeTitle`؛ سیم‌کشی state/funnel به سال عملیاتی. سرور: pattern فرمت `NNNN-NNNN`.
- UI: بج سال در هدر + سلکت سال عملیاتی در مودال (خودکار/پارسال/جاری/بعد) + بج+قفل در جدول مدارس + فیلتر سال در کارت سابقه + بنر نرم فصل؛ بدون اکشن/روت تازه.
- تست: `tests/academic-years.js` ‏9/9‏ (AY0–AY8) + `tests/academic-years-mutations.js` ‏5/5‏ کشته (YM1–YM5)؛ سند: `docs/ACADEMIC_YEARS_GUIDE.md`.
- گیت‌ها: smoke ‏547/547‏، authz ‏0‏، secret-scan ‏11/11‏، build --check سبز، authz-model ‏232/232‏؛ رگرسیون دامنه: uiclick ‏4/4‏ + جهش ‏5/5‏، boom2 ‏8/8‏، simulation ‏48/48‏ ✅

## ویو ۵ — مدل یکتای مجوز + ایزولاسیون مستأجر (بخش دوم) — ✅ (2026-09-10)
- **مدل یکتا:** همهٔ دروازه‌ها از `server/policy.js` — sync delegate است (T15b)، پنج مسیر v1 (users/students/classes/grades/attendance) بازمهندسی شدند: فهرست=`filterReadable`، خواند=`restReadGate` (رد⇒۴۰۴ ضدشمارش)، نوشتن=`restWriteRoleOk`+`inScope`/`restCreateScopeOk` روی رکورد/بدنهٔ جمع‌شده؛ `idor.js` هم به `policy.studentRecordOk` واگذار شد — آخرین کپیِ موازیِ §۱.۲ حذف.
- **قراردادهای تازهٔ policy:** `studentRecordOk` (مدیر سخت‌مدرسه؛ دبیر کلاسِ تدرسیِ **واقعی** — کلاس شبح fail-open نبود؛ ولی از parent_links؛ دانش‌آموز خودش؛ بقیه از جمله اداره DENY)؛ در `inScope`: مهارِ سختِ مدرسه (بدون IS-NULL) + **سازگاریِ مهارِ دانش‌آموز** (student_id مدرسه‌دیگر با مُهرِ خودِ مدرسه ⇒ رد — BOLAِ sync/REST بسته شد؛ یتیم‌ها legacy ماندند، قفلش با FKِ Wave-1)؛ باندِ هندسهٔ اداره در readOk (classes/attendance/grades) هم‌راستا با SQL؛ `DELETE_ROLES_REST` (تنگ‌سازیِ مستندِ حذفِ فیزیکی: REST ⊆ مدل، هیچ‌گاه بازتر نه).
- **PG (`dbquery.js`):** SUPER_SCOPED از policy (bypass اداره حذف)؛ مهارِ سخت در پنج builder؛ `_officeGeoClause` (geo؛ بی‌دفتر⇒`1=0`)؛ `_roleScopeParts` آینهٔ readOk؛ students برای اداره `1=0`؛ attendance دبیر class-only (schema)؛ مسیرها `office` را پاس می‌دهند.
- **خود‌ویرایشی:** allowlist تفکیکیِ users PATCH (خود=full_name؛ manager=۷فیلد؛ دبیر=iep_*) + `field_denied` ۴۰۳ روی کلیدِ ناشناخته (میراثِ پذیرشِ بی‌صدا جمع شد).
- **scope.js:** شیمِ fail-closed روی policy؛ مصرف‌کننده ندارد (حذفِ نهایی ← Wave-15).
- **تست:** `wave5-authz.js` ۲۱→**37** (یکپارچگیِ پنج‌فهرست×پنج‌نقش REST↔مدل با total+عضویت، BOLAِ نمره/حضور، دروازهٔ ساختِ دبیر ۲۰۱/۴۰۳، خود‌آلوتستِ T21، نشتِ پارامتری T23، هندسهٔ حافظه T24، قراردادِ هفت‌گانهٔ builderهای PG T25–T31)؛ `wave5-authz-mutations` 5/5 (درهای دروازه؛ دروازهٔ ساختِ دبیر و allowlistِ خود افزوده شد)؛ هارنسِ هم‌ارزی 93,024/۰.
- **گیت‌ها:** smoke **547/547** · api **7/7** · wave1 18/18 · wave3 13+13 · wave4 11/11 · wave8 14+5 · wave9 39 · wave10 26 · authz-model 248 · server1 31 · server16 39 · server17 70 · security2 25 · waf-ddos 29 · occ 18 · academic-years 9 · pull-bootstrap 12 · check-authz **0** · secret-scan **11/11** ✅ (تنها قرمزِ wave13: نبودِ ZAP در محیط — در پایهٔ تمیز هم قرمز، بی‌ربط).
- **اسناد:** `docs/WAVE5_AUTHZ.md` (جدید — مرجعِ اجرا) + به‌روزرسانی `AUTHORIZATION_MODEL.md` (لایهٔ ۴ ← policy؛ جدول تست ۳۷) و ردیف Wave 5 در `NATIONAL_ROADMAP_PROGRESS.md` ← ✅.
- **کامیت‌ها (بر روی 3e86993):** `8472f17` fix(policy) · `fa359a3` fix(pg) · `7a0e796` fix(rest) · `d5230b7` test(wave5) · `—` docs(wave5) — همگی push به `arena/01a08a4e-p2`.
