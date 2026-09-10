# National Baseline — Wave 0 / Part 4

**موضوع:** dependency و deployment inventory
**تاریخ اجرا:** ۱۸/۰۶/۱۴۰۵ — 2026-09-09
**شاخه کاری Arena:** `arena/01a08648-p2`
**محدوده:** مستندسازی inventory؛ بدون تغییر کد runtime/schema/test.
**Commit هنگام ثبت:** مبنا `781a47174cbe22cbcc3ed1bf67f6d0c9bd93cf5e`

> **یادداشتِ شفافیت:** نسخهٔ اولِ این Part در نشستِ قبلی (`arena/01a085da-p2`)
> با commit محلیِ `0245515` تهیه شد اما هرگز push نشد و در sandbox آن نشست
> باقی ماند (تأیید: `gh api repos/rezaa2544/p2/commits/0245515` → 404).
> این سند، **بازسازیِ همان Part 4** روی درختِ فعلی است — محتوا از همان
> چک‌لیستِ نقشهٔ راه (Wave 0: «dependency و deployment inventory ساخته شود»)
> و از کدِ واقعیِ همین commit استخراج شد.

---

## 1. روش استخراج

- منبعِ حقیقت: خودِ repository در commit مبنا (`git grep` روی
  `process.env.`، خواندنِ `package.json`/lock، فایل‌های استقرار).
- بدون اجرایِ تغییر؛ فقط فهرست‌برداری.
- هر ادعا به مسیرِ فایل ارجاع می‌دهد (قاعدهٔ Evidence در Addendum).

---

## 2. وابستگی‌های اجرایی (Runtime Dependencies)

**سرور به‌طورِ ذاتی فقط Node stdlib است** (http/crypto/fs/path/worker_threads)؛
پکیج‌هایِ زیر در `package.json` فقط برایِ قابلیت‌هایِ **اختیاریِ** تولید فعال‌اند
و در نبودشان fallback توسعه‌ای بالا می‌آید (به‌جزِ production که fail-fast است —
P0-13 برایِ Redis):

| پکیج | نسخهٔ قفل‌شده | نقش | فعال‌سازی | رفتارِ نبودِ آن |
|---|---|---|---|---|
| `pg` | 8.23.0 | درایورِ PostgreSQL (منبعِ حقیقتِ آینده — Wave 1) | `DATABASE_URL` | fallback حافظه/JSON (`server/db.js`) |
| `ioredis` | 6.0.0 | کشِ توزیع‌شده + قفل + Pub/Sub | `REDIS_URL` | در تولید: 503/خروج (`server/redis.js`، P0-13)؛ در توسعه: fallback حافظه |
| `@opentelemetry/*` (۶ پکیج) | 2.11.0 / 0.222.0 / 1.43.0 | ردیابیِ توزیع‌شده (P-Trace) | `OTEL_EXPORTER_OTLP_ENDPOINT` | صادرکنندهٔ حافظه‌ای (no-op عملی) |
| `jsdom` (devDep) | 30.0.1 | فقط build/seed/آزمون‌ها — در runtime سرور نیست | — | — |

**نتیجهٔ inventory:** core سرور **صفر وابستگیِ اجباریِ خارجی** دارد؛ سه قابلیتِ
اختیاریِ تولید (PG، Redis، Tracing) هرکدام env و سندِ خود را دارند.

## 3. سرویس‌های بیرونی (External Services)

| سرویس | الزام | مرجع |
|---|---|---|
| PostgreSQL | اختیاریِ امروز / الزامیِ Wave 1 | `server/schema.sql`، `docs/DATABASE_ARCHITECTURE.md` |
| Redis | الزامی در production (P0-13) | `docs/CACHE_STRATEGY_DESIGN.md` |
| Jaeger + OTel Collector | اختیاری (tracing) | `infra/tracing/*` (composeهای dev/prod) |
| درگاهِ پیامک | الزامیِ go-live واقعی | `server/sms.js` (`PAYESH_SMS_PROVIDER`) — تا آن‌وقت `PAYESH_DEMO_CODE` |
| Object Storage (آروان‌کلاود) | بکاپِ بیرونی — تصمیمِ قفل‌شده | `docs/DEPLOY.md` §6 |

## 4. دارایی‌های استقرار (Deployment Assets)

| دارایی | مسیر | توضیح |
|---|---|---|
| سرورِ تک‌پروسه | `server/index.js` | http/https + تمامِ `/api/*` + استاتیک + بکاپِ خودکار |
| دستورِ کارِ استقرار | `docs/DEPLOY.md` | systemd، TLS، go-live checklist (۹ بند) |
| لبهٔ POC | `nginx/nginx.conf` | WAF سبک + ضدِ DDoS سطحِ ۷؛ هدفِ واقعی: Cloudflare/WAF |
| Tracing | `infra/tracing/` | jaeger-dev/prod compose + otelcol-tail |
| CI | `.github/workflows/node.js.yml` | ماتریسِ 18/20/22 — **نکتهٔ inventory: `engines` پکیج `>=22` است؛ ردیف‌های 18/20 قدیمی‌اند و باید با ماتریسِ واقعی هم‌تراز شوند** |
| CI | `.github/workflows/security.yml`، `npm-publish-github-packages.yml` | امنیت + انتشارِ پکیجِ GitHub |
| PWA | `manifest.json` + `sw.js` | Cache-First استاتیک / Network-First API |
| اندروید (TWA) | `android/` + `tools/build-android.js` | `docs/ANDROID_BUILD_PLAN.md` |
| پایشِ عملکرد | `run-benchmarks.sh` + `tests/performance/` | سناریوها/سوئیت‌هایِ بنچمارک |

## 5. متغیرهای محیطی — فهرستِ کامل (از کد، `git grep process.env`)

۴۸ متغیر؛ دسته‌بندی:

- **هویت و نشست:** `PAYESH_JWT_SECRET`، `PAYESH_JWT_SECRET_PREV`، `PAYESH_KEY`
- **داده:** `PAYESH_STORE`، `PAYESH_OTP_FILE`، `PAYESH_AUDIT`، `DATABASE_URL`، `PG_POOL_MIN/MAX`، `PG_TIMEOUT(_MS)`، `REDIS_URL`
- **شبکه/TLS:** `PORT`، `HOST`، `PAYESH_HTTPS`، `PAYESH_TLS_CERT`، `PAYESH_TLS_KEY`، `PAYESH_BEHIND_PROXY`
- **حالتِ اجرا:** `NODE_ENV`، `PAYESH_ENV`، `PAYESH_DEMO_CODE`، `PAYESH_ROOT`، `PAYESH_SYNC_PATH`، `PAYESH_AUTHZ_SRC`
- **ممیزی:** `PAYESH_AUDIT_ASYNC`*، `PAYESH_AUDIT_MAX_EVENTS`، `PAYESH_AUDIT_MAX_BYTES`
- **بکاپ:** `PAYESH_BACKUP_EVERY_HOURS`، `PAYESH_BACKUP_EVERY_MS`
- **کارایی (Wave 9):** `PAYESH_L1_MAX_ENTRIES`*، `PAYESH_WORKER_TIMEOUT_MS`*
- **پیامک:** `PAYESH_SMS_PROVIDER`، `PAYESH_SMS_DRY_RUN`، `PAYESH_SMS_MOCK_FAIL`، `PAYESH_SMS_COOLDOWN_S`، `PAYESH_SMS_WINDOW_S`، `PAYESH_SMS_DAILY_CAP`، `PAYESH_SMS_MAX_PER_DAY`، `PAYESH_SMS_PHONE_LIMIT`، `PAYESH_SMS_IP_LIMIT`
- **ورود/نرخ:** `PAYESH_LOGIN_IP_LIMIT`، `PAYESH_LOGIN_TRIES`، `PAYESH_ENUM_WARN/SLOW1/SLOW2/REVOKE`

(\* سه متغیرِ ستاره‌دار هم‌زمان با همین Part در Wave 9 افزوده شدند؛ فهرست
برایِ کامل بودنِ inventory از کدِ همین شاخه برداشته شده است.)

## 6. توپولوژیِ استقرارِ پشتیبانی‌شده

1. **تک‌پروسه + TLS درون‌پروسه** (`PAYESH_TLS_CERT/KEY` — گواهیِ CA در تولید)
2. **تک‌پروسه پشتِ reverse-proxyِ TLS** (`PAYESH_BEHIND_PROXY=1` یا `PAYESH_HTTPS=1`)
3. **چند نمونه** — نیازمندِ Redis مشترک (stateless بودن: P0-13..P0-16)؛
   ملاحظات در `docs/MULTI_INSTANCE_READINESS.md`

## 7. ریسک‌ها و شکاف‌هایِ شناسایی‌شده (خروجیِ اصلیِ inventory)

| # | یافته | شدت | پیوند |
|---|---|---|---|
| R1 | ماتریسِ CI (18/20/22) با `engines: >=22` و jsdom 30 ناهم‌خوان است | متوسط | `.github/workflows/node.js.yml` |
| R2 | بکاپِ خودکار درونِ همان پروسهٔ سرویس‌دهنده است — تا پیش از Wave 9 حتی `JSON.stringify` کل store در مسیرِ درخواست؛ اکنون سنگینیِ آن به رشتهٔ کارِ پس‌زمینه رفت | متوسط (کاهش یافت) | `docs/WAVE9_PERFORMANCE.md` |
| R3 | درگاهِ پیامک و استعلامِ کدملی همچنان خریداری/انتخاب نشده‌اند — پیش‌نیازِ go-live | بالا | `docs/DEPLOY.md` §9 |
| R4 | استقرارِ چندنمونه‌ای هنوز staging ندارد؛ fallbackها فقط در توسعه آزموده می‌شوند | متوسط | Wave 18/19 |

## 8. وضعیت Wave 0 پس از Part 4

| Part | موضوع | سند | وضعیت |
|---|---|---|---|
| 1 | tag + تست‌ها + baseline کلی | `docs/NATIONAL_BASELINE.md` | ✅ |
| 2 | CPU/RAM/event-loop/latency | `docs/NATIONAL_BASELINE_PART2.md` | ✅ |
| 3 | دیتابیس/کش/sync throughput | `docs/NATIONAL_BASELINE_PART3.md` | ✅ |
| 4 | dependency و deployment inventory | همین سند | ✅ |

**Wave 0 (Baseline و Freeze) با این Part کامل شد.** پیش‌نیازِ شروعِ Waves بعدی
(به‌ویژه Wave 9 که هم‌زمان با همین Part شروع شد) برقرار است.
