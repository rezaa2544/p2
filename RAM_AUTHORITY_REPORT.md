# RAM Authority Report — Phase 7 Freeze

تاریخ اسکن: 2026-09-19. درخت: `6e1b5adb` روی `main` (working tree تمیز).
**هیچ کد production در این مرحله تغییر نکرد.** اسکن زندهٔ `server/` است، نه گزارش فاز ۶.

طبقه‌بندی:

- **FORBIDDEN** — business / security / routing / governance / version / tenant authority در RAM (قابل مشاهده از HTTP یا تصمیم میان‌نمونه).
- **ALLOWED** — شمارندهٔ درخواست، کش TTL، single-flight/promise dedupe، مجموعهٔ ثابت، تجمیع داخل یک درخواست.
- **DUAL** — PostgreSQL ادعا می‌شود SoT است ولی RAM هنوز تصمیم می‌گیرد یا hydrate ناقص است.

`new Map()` در `server/`: **۵۹**. `new Set()`: **۷۵**. `global.`: **۰**. `let state`: **۱** (`server/tracing.js:35` — SDK OTel، ALLOWED).

---

## FORBIDDEN — مرجعیت RAM (کلاس Dual State)

| فایل:خط | نماد | HTTP / تصمیم | SoT واقعی امروز |
|---|---|---|---|
| `server/infrastructure/provincial-pilot-scaling.js:370` | `_provincialStateStore` | POST `/api/v1/system/phase5/provincial-pilots/{activate,traffic-rollout}` | فقط RAM. `phase6_ops_kv` برای این کلید نوشته نمی‌شود. |
| `server/infrastructure/change-management.js:39` | `changeRegistry` | POST `/api/v1/system/national/change-request` (غیر TRAFFIC_WEIGHT) | RAM |
| `server/infrastructure/national-capacity-enforcement.js:45` | `activeReservations` | POST `/api/v1/system/national/capacity/reservation` | RAM |
| `server/operations/national-operations-center.js:54` | `activeIncidents` | change-request `INCIDENT` / GET incidents | RAM |
| `server/infrastructure/national-region-control-plane.js:168` | `_nationalRegionStore` | GET national/regions؛ POST change-request `REGION_STATE` → `updateNationalRegionState` | RAM + ثابت `CANONICAL_NATIONAL_REGIONS` |
| `server/infrastructure/event-processing-layer.js:61` | `processedIdempotencyKeys` | مسیر پردازش رویداد | RAM Set — تکرار میان‌نمونه ممکن |
| `server/infrastructure/event-processing-layer.js:60` | `eventHandlersRegistry` | ثبت handler | RAM |
| `server/infrastructure/phase6-production-hardening.js:74–118` | `IRAN_PROVINCE_BY_NAME` + `store.schools` | tenant guard | **جدول `tenant_policy` وجود ندارد.** سیاست استان در کد سخت و آینهٔ JSON است. |
| `server/index.js:85` + `loadStore()` | `store` (payesh.json) | تقریباً همهٔ REST/sync تا hydrate | Dual: فایل JSON + آرایه‌های RAM؛ PG hydrate در `dbReady` (`index.js:260`). غیر production بدون انتظار dbReady گوش می‌دهد (`index.js:1762`). |
| `server/redis.js:31–34` | `memCache`, `memExpiry`, `memSets`, `subscriptions` | OTP/rate/cache وقتی `REDIS_URL` نیست | RAM به‌عنوان Redis. با `REDIS_URL` باید fail-closed باشد (auth هست؛ مسیرهای دیگر نه لزوماً). |
| `server/cache.js:41` | `localFallbackRateLimits` | `cache.checkRateLimit` اگر Redis خطا و **نه** REDIS_URL/production | هنوز موجود. WAF از همین تابع استفاده می‌کند (`server/waf.js`). |
| `server/rate-limit.js:55–56` | `{allowed:true, fallback:true}` | بدون `REDIS_URL` و غیر production | Dev fail-open. کامنت فایل هنوز «fail-open» می‌گوید؛ کد با REDIS_URL پرتاب می‌کند. |
| `server/middleware/canary.js:15` | پیش‌فرض استان `'07'` | هر درخواست بدون `x-province-code` | تصمیم routing از هدر/ثابت، نه از هویت نشست در PG. |
| `server/infrastructure/phase6-canary-engine.js:132–136` | `clusters`, `metrics`, `rollbackSnapshots`, `seenSignatures` | routing + telemetry + replay cache | **DUAL.** وزن/circuit در `phase6_canary_configs` persist می‌شود. `routeRequestSoT` در خطای refresh، **کش کهنه** را برای routing استفاده می‌کند (catch خاموش حدود ۴۸۰). `seenSignatures` اگر ledger در دسترس نباشد RAM است. |
| `server/infrastructure/national-traffic-fabric.js:49` | `_nationalTrafficWeights` | GET/POST national traffic | **DUAL.** persist به `phase6_ops_kv` (`national_traffic_weights`). RAM هنوز cache+default ۱۰۰٪ است تا hydrate. |
| `server/index.js:1737–1738` | boot canary | listen | اگر `initDb` شکست → **listen ادامه با وزن ناشناخته** (warn، نه exit). |

### مسیرهایی که HTTP می‌نویسد و PG نمی‌نویسد

شواهد از `server/routes/system.js`:

- `activateProvincialPilot` ~1129
- `updateProvincialTrafficRollout` ~1191
- `createCapacityReservation` ~1378
- `updateNationalRegionState` ~1724
- `registerChangeRequest` / `recordNocIncident` / `transitionNocState` در همان handler

نمونهٔ A این‌ها را می‌بیند؛ نمونهٔ B با همان DB نمی‌بیند → کلاس split-brain.

---

## ALLOWED — کش / شمارنده / ثابت / تجمیع یک‌درخواست

| نماد | دلیل |
|---|---|
| `cache.js` `localUserBootstrapCache`, `inflight` | L1 TTL + single-flight. SoT داده bootstrap در PG است (با caveat hydrate). |
| `metrics.js` Mapها | شمارندهٔ Prometheus |
| `ids.js` `chains` | mutex فرایندی per-namespace |
| `worker-service.js` `pending` | promise dedupe |
| `static-cache.js` | فایل استاتیک LRU |
| `attack-detector.js` / `runtime-monitor.js` | سیگنال امنیتی کران‌دار، نه authorization |
| `reports.js` / `analytics/*` / `routes/classes.js` / `grades.js` Mapهای محلی | تجمیع داخل یک handler |
| `policy.js` / `csrf.js` / `db.js` Setهای ثابت | allowlist کد، نه state |
| `tracing.js` `let state` | SDK |
| `public-report-core.js` meetingStats | تجمیع گزارش |

---

## لایهٔ Authority — وضعیت فعلی

```
server/infrastructure/authority/   → وجود ندارد
```

امروز تصمیم‌ها پراکنده‌اند:

```
HTTP → index.js router → module (canary / hardening / provincial / cache / rate-limit)
                         ↳ بعضی: PostgreSQL
                         ↳ بعضی: Redis
                         ↳ بعضی: Map RAM
                         ↳ بعضی: payesh.json
```

`ops-kv.js` فقط یک KV جنریک است؛ سرویس‌ها هنوز مستقیم Map می‌نویسند.

---

## Redis: CACHE ONLY؟

| مسیر | رفتار قطع Redis |
|---|---|
| `server/auth.js:259,314` + `rate-limit.js` | 503 `REDIS_UNAVAILABLE` اگر REDIS_URL ست باشد |
| `cache.checkRateLimit` | throw اگر REDIS_URL یا production |
| بدون REDIS_URL (dev) | `{allowed:true, fallback:true}` در rate-limit.js:56 — **ممنوعِ مأموریت ۷ اگر به تولید نشت کند** |
| `waf.js` | timeout → null (fail-open روی شمارش advisory) |
| OTP store | وابسته به redis.js؛ با REDIS_URL زنده باید توزیع‌شده باشد |

---

## Tenant / Permission authority

- گارد فقط روی پیشوند `/api/v1/` و **فقط اگر** `school_id` یا `x-province-code` باشد (`index.js:1108–1130`).
- `/api/students/:id` و `/api/sync` این گارد را ندارند (مسیرهای قدیمی policy/idor).
- `superadmin` از گارد استان عبور می‌کند.
- هویت استان از JWT + `store.schools` (RAM/JSON)، نه جدول `tenant_policy`.

---

## جمع‌بندی کلاس

حذف `new Map` هدف نیست. هدف حذف **مرجعیت**. امروز حداقل **۸ سطح کنترل‌پلن فاز۵** و **آینهٔ JSON store** هنوز RAM-authority هستند. قناری و فابریک ترافیک Dual هستند نه Single.

تا این کلاس حذف نشود، ساخت جدول‌های موازی `canary_state` / `governance_ledger` بدون بازنشانی مسیر HTTP فقط Dual State را **دو برابر** می‌کند.
