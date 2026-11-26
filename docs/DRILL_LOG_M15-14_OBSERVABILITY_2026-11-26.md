# گزارش مانور Observability — M15-14 (E3 محلی) — ۲۰۲۶-۱۱-۲۶

**هدف:** اثباتِ عملیِ سه معیارِ پذیرشِ M15-14 روی میزبانِ واحد (E3) با عللِ واقعی — به‌عنوانِ پایهٔ پیش از استقرارِ تولید (E4-06/E4-07 = مالک).
**HEAD مبنا:** `e430ce3f2e47fbac37be95b63cc567deea34958a` (قبل از کامیتِ این سند). **محیط:** Docker 29.8.2 + استک `infra/observability/docker-compose.observability.yml` + اپ production-drill (`PAYESH_ENV=production`, `PAYESH_BEHIND_PROXY=1`, DATABASE_URL→PG-HA 15432, REDIS_URL→master 16379 با auth).

## زنجیرهٔ پایه — VERIFIED
- هر ۷ کانتینر استک Up؛ Prometheus scrape از `payesh-api` (bearer از فایل 0600) health=up بدون خطا؛ prometheus-self up؛ ۱۱ قانون (پیش از افزودن ApiDown) در گروه `payesh-critical`.
- Alertmanager با گاردِ production: placeholder `__WEBHOOK_URL__` رد می‌شود (exit 78 — همان قرارداد CI)؛ receiver واقعیِ محلی = گیرندهٔ webhook روی `127.0.0.1:5001` (JSONL شواهد).
- متریک‌های زنده: `payesh_redis_up 1`، `payesh_db_up 1`، `payesh_sync_queue_depth 0→1101`، http_requests_total با برچسب route/method/code.

## آلارم‌ها — شلیک با علت واقعی + تحویل به گیرندهٔ بیرونی (UTC)

| آلارم | علتِ واقعی | firing (receipt) | resolved (receipt) |
|---|---|---|---|
| HighErrorRate (critical) | قطعِ واقعی Redis → 503 طبق سپک Wave-15 | 17:23:46 | 16:59:46 (نوسانِ پیشین)* |
| RedisDown (critical) | `docker stop` مستر Redis-HA | 17:22:46 | — |
| HighLatency (warning) | مسیرِ 450ms (`/api/__slow`) | 16:53:16 | 17:17:01 |
| SyncQueueDepth (warning) | ۱۱۰۱ سطرِ واقعی pending در server_outbox | 16:52:31 | 17:54:01 |
| SuspiciousSession (warning) | نشستِ مشکوکِ واقعی WAF (enforce) | 16:50:01، 16:59:01 | 16:55:01، 17:24:01 |
| DiskSpaceLow (warning) | دیسکِ میزبان واقعاً ۸۵٪ پُر | 16:48:31 | 16:58:31 |
| MemoryHigh (warning) | heap واقعی زیر بارِ slow-route | 16:46:46، 17:14:31 | 16:51:46، 17:19:31 |

\* نخستین شلیکِ HighErrorRate (16:49:46) از نویزِ هارنسِ فازِ ۱ بود (heartbeatِ worker با interval عمداً کُند برای پنجرهٔ SyncQueueDepth) — ثبت و «دور انداخته» شد؛ شلیکِ معتبر = هنگامِ قطعِ واقعی Redis (17:23:46). این تفکیک عمداً شفاف مستند می‌شود (REPORT=PROOF نیست).

**یافتهٔ طراحی:** `AttackPatternSignature` با ۵۰۰+ بلاکِ واقعی WAF شلیک نشد — شمارندهٔ `payesh_attack_patterns_detected_total{pattern="waf_blocked"}` episode-bounded است (با هر الگو فقط یک‌بار بالا می‌رود؛ increase در پنجره ≈ 0). این رفتار آگاهانه است (ضدِ flood) ولی به این معناست که آلارم فقط با «الگویِ تازه» شلیک می‌شود — در گزارش مانور ثبت شد.

## معیار ۱ — kill monitoring → app SLO unchanged: **PASS**
Prometheus + Alertmanager از 21:00:31 تا 21:02:37 (+03:30) متوقف شدند؛ سلامتِ اپ در t+30/60/90/120s هر بار **HTTP 200** — SLO اپ مستقل از صفحهٔ مانیتورینگ است (failure domain جدا در E3).

## معیار ۲ — kill app → external alert fires: **GAP اثبات شد، سپس بسته شد**
- **قبل:** اپ در 21:05:06 کشته شد؛ `up{job="payesh-api"} = 0` ولی **هیچ آلارمی شلیک نشد** (alerts خالی) — dead-man نبود (همان‌طور که ledger نوشته بود).
- **اصلاح:** قانونِ canonicalِ جدید `ApiDown` (critical، `up{job="payesh-api"} == 0 for 1m`) به `infra/observability/alert-rules.yml` — کاتالوگ ۱۱→۱۲.
- **بعد (re-drill):** اپ در 21:22:00 کشته شد → ApiDown pending → **firing 21:23:30** → **دریافت در گیرندهٔ بیرونی 17:53:31.760Z** ✓

## معیار ۳ — بودجهٔ cardinality
پیلود `/metrics` ≈ ۸KB ≈ ۵۰ سری — خیلی پایین‌تر از هر بودجهٔ معقول؛ floodِ label با route-template (بدون id) کنترل می‌شود (موجود از قبل).

## گیت‌ها پس از تغییر
`tests/observability-config.js` **31/31** · `tests/observability-semantic-guard.js` PASS · `tests/wave14-observability.js` PASS (M10d یک‌بار ناپایدارِ timing بود — re-run سبز) · freeze/docs-consistency/parity در همان چرخه.

## باقی‌مانده (مالک)
استقرارِ تولیدی روی میزبانِ جدا (E4-06)، receiver واقعی on-call + ردیابی MTTA/MTTR (E4-07)، بودجهٔ retention/disk در مقیاس.
