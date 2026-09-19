# Phase 7 — Baseline Freeze + Root Cause Map

**وضعیت مأموریت:** فقط کشف. هیچ کد production تغییر نکرد.
**حکم پیاده‌سازی Phase 7:** هنوز شروع نشده → موفقیت production = `NOT VERIFIED` تا Evidence سه‌گانهٔ Runtime+DB+HTTP+CI بعد از پیاده‌سازی ثبت شود.

ادعاهای فاز ۶.۵/۶.۶، PASS تست، و commit message **معتبر نیستند** مگر با Evidence همین فایل.

---

## 0) Baseline Freeze (اجباری، زنده)

| مورد | Evidence |
|---|---|
| HEAD | `6e1b5adbcc719a086599cbac2ae320e3a33613b3` |
| branch | `main`، working tree **تمیز**، `git remote -v` خالی (پوش قبلی با URL توکن) |
| log -4 | `6e1b5adb` phase66 → `269161f6` phase65 → `224112f2` hardening → `1e2aa96d` phase2 |
| npm test | `tests/run.js` **۳۵/۳۵** + `tests/smoke.js` **۵۴۷/۵۴۷** — این **فرانت تک‌فایلی** است نه سرور. سوئیت production در `npm test` نیست. |
| فایل تست | ۹۱۹ فایل زیر `tests/` |
| migrations | ۱۸ UP + ۱۸ DOWN، شمارهٔ پیوسته 001–018، همه BEGIN/COMMIT |
| PostgreSQL | 17.11 accepting `127.0.0.1:5432` نقش `payesh` |
| Redis | PONG `:6379` |
| Node | سیستم v20.20.2 ؛ سوئیت‌ها v22.22.0 در `/tmp/node-v22.22.0-linux-x64` |
| boot | `npm start` → `server/index.js` (`package.json`). `require.main` → `startListening` → `server.listen` حدود 1740. production: صبر `dbReady` سپس listen. غیر production: listen فوری (خط 1762). |
| CI | `.github/workflows/node.js.yml` — PG17+Redis سرویس؛ chain UP/DOWN/UP؛ phase65؛ `tools/production-truth-gate.js`؛ سپس `npm test`. **این اجرا CI را دوباره نزد.** |
| لایه authority | `server/infrastructure/authority/` **وجود ندارد** |
| `tools/production-verifier.sh` | **وجود ندارد** (نزدیک‌ترین: `tools/production-truth-gate.js`) |

---

## 1) Runtime path discovery (کد، نه ادعا)

### Boot

```
node server/index.js
 → loadStore() از PAYESH_STORE / server/data/payesh.json
 → db.init(store)  [dbReady]
 → cache.init() / redis
 → canaryHydrated = dbReady.then(initDb)
 → اگر production: await dbReady سپس startListening
 → وگرنه startListening فوری
 → try await canaryHydrated catch: WARN و ادامه با وزن ناشناخته  (index.js:1737)
```

### Canary (مسیر کامل)

```
HTTP (هر درخواست)
 → index.js:792 applyCanaryRouting
 → middleware/canary.js:15 province = header x-province-code || '07'
 → engine.routeRequestSoT → refreshCacheFromPg (catch خاموش → RAM کهنه)
 → routeRequest از this.clusters (Map)
 → هدرهای X-Canary-*
```

Promote:

```
POST /api/v1/system/phase6/canary/promote
 → system.js phase6CanaryPromote
 → setTrafficWeight → assertGovernanceApproval (Ed25519 + INSERT phase6_replay_ledger)
 → UPSERT phase6_canary_configs
```

حلقهٔ قطع‌شده / ضعیف:

1. استان پیش‌فرض `'07'` اگر هدر نباشد — تصمیم routing از هویت PG نیست.
2. refresh شکست → routing از RAM.
3. hydrate شکست در boot → listen ادامه.

### Tenant

```
فقط pathname /api/v1/* و فقط اگر school_id یا x-province-code باشد
 → assertTenantBoundary (کد ثابت + school از store RAM)
 → 403 PHASE6_TENANT_ISOLATION_BREACH
```

قطع:

- `/api/sync` و `/api/students/:id` این گارد را ندارند.
- بدون هدر استان، گارد استان اجرا نمی‌شود.
- جدول `tenant_policy` در migrations **نیست**.

### Replay

```
همان promote → INSERT phase6_replay_ledger UNIQUE(nonce)
 → rowCount 0 ⇒ 403 REPLAY_ATTACK_DETECTED
```

Wired است برای canary promote. برای provincial/change-request **نیست**.

### Redis / rate-limit

```
POST /api/auth/send-code|/login
 → auth.js rateLimit.checkRateLimit
 → REDIS_URL ست و Redis مرده ⇒ 503 REDIS_UNAVAILABLE
 بدون REDIS_URL ⇒ allowed:true fallback:true  (rate-limit.js:56)
```

---

## 2) Migration audit (فایل، نه اجرای سه‌چرخه در این فریز)

| # | جداول جدید مرتبط با مرجعیت |
|---|---|
| 001 | دامنهٔ مدرسه (~۹۰ جدول) + FK زیاد |
| 014 | `server_outbox`, `server_outbox_dlq` |
| 015 | `phase6_canary_configs`, `phase6_audit_events`, `phase6_replay_ledger` |
| 017 | همان ledger/ستون‌های weight,region_id (IF NOT EXISTS) |
| 018 | `phase6_ops_kv` (KV جنریک) |

**وجود دارد امروز:** canary config + audit + replay ledger + ops_kv.
**وجود ندارد:** `canary_state`, `governance_ledger`, `tenant_policy`, `system_audit` با before/after.

### خطر Phase C اگر کور اجرا شود

ساخت `canary_state` و `governance_ledger` **موازی** با 015/017 = Dual Schema = همان کلاس Dual State در لایهٔ DB.

Root cause map می‌گوید: SoT قناری باید **همان** `phase6_canary_configs` (+ ستون‌های لازم) باشد، نه جدول سوم. Replay باید **همان** `phase6_replay_ledger` (UNIQUE nonce از قبل هست). Audit باید به `phase6_audit_events` یا جدول جدید با مهاجرت داده وصل شود، نه ledger دوم بی‌سیم.

سه‌چرخهٔ UP/DOWN در این فریز **اجرا نشد** (ممنوعیت تغییر/ایجاد DB جدید برای پیاده‌سازی؛ audit فایل کافی است). اجرای زندهٔ ۳ چرخه مالِ verifier بعد از مجوز پیاده‌سازی است. آخرین Evidence زندهٔ ۳ چرخه روی clone `6e1b5adb` در مأموریت ۶.۶ بود — **این فریز آن را دوباره اثبات نمی‌کند.**

---

## 3) Root causes (کلاس، نه علامت)

```
RC-1  هیچ Authority Layer واحد نیست.
      هر ماژول خود Map/PG/Redis/JSON را انتخاب می‌کند.

RC-2  Dual State دامنه: payesh.json + store RAM + PostgreSQL.
      hydrate دیر؛ listen غیرتولید پیش از dbReady.

RC-3  Dual State کنترل‌پلن فاز۵: provincial / region / capacity / NOC / change / idempotency
      از HTTP نوشته می‌شوند و در PG نیستند.

RC-4  Dual State قناری/فابریک: PG persist هست ولی تصمیم runtime می‌تواند از RAM کهنه بیاید
      (catch خاموش، default استان، boot warn-and-listen).

RC-5  Tenant policy در کد است نه در DB؛ گارد ناقص روی سطح API.

RC-6  Redis همه‌جا CACHE-ONLY نیست. Dev fail-open در rate-limit؛ WAF timeout→null.

RC-7  Verification دائمی ناقص است.
      npm test = فرانت. production-verifier.sh نیست.
      بعضی تست‌های زنده (wave10-pg-live.js:87) بدون باینری PG → process.exit(0).
      CI گام truth-gate دارد اما این فریز اجرای CI را ندید.

RC-8  ساخت جداول هم‌نام مأموریت ۷ بدون حذف مسیرهای قدیمی = تکرار Dual State.
```

---

## 4) Before (معماری فعلی) / After (هدف ۷ — هنوز پیاده نشده)

```
قبل:
  Client → HTTP → index.js
                 ├─ Map RAM (فاز۵)
                 ├─ JSON store
                 ├─ Redis یا memCache
                 └─ PostgreSQL (بعضی مسیرها)

بعد (الزام، پیاده‌سازی ممنوع تا تأیید این نقشه):
  Client → HTTP → Middleware → Service → authority/ → PostgreSQL
                                      ↳ Redis فقط cache
                                      ↳ audit ledger همان تراکنش
```

---

## 5) کارهای مجاز بعد از تأیید نقشه (هنوز انجام نشده)

1. معرفی `server/infrastructure/authority/` و مهاجرت **تصمیم‌ها** نه ساخت جدول تکراری.
2. HTTP-mutable فاز۵ → ردیف‌های typed در PG (نه فقط JSON blob در ops_kv مگر به‌عنوان پل موقت با hydrate اجباری قبل از خواندن).
3. Tenant از جدول `tenant_policy` + گارد روی همهٔ `/api/*` نه فقط v1+هدر.
4. Redis: هیچ `{fallback:true, allowed:true}` وقتی REDIS_URL یا production.
5. `tools/production-verifier.sh` که T1–T7 را **fail-closed** اجرا کند؛ تست‌های `exit(0)` روی وابستگی غایب → exit 1.
6. Boot: بدون hydrate موفق قناری/authority → listen نشود.

---

## 6) Remaining risks (صادقانه)

- آینهٔ JSON در dev هنوز fork می‌سازد.
- Canary telemetry/auto-rollback روی مسیر درخواست catch می‌شود.
- OCC/sync از این فریز خارج است مگر به‌عنوان دامنهٔ store.
- بدون اجرای تازهٔ triple-migration و CI روی SHA بعدی، Production readiness = NOT VERIFIED.

## حکم همین مرحله

```
BASELINE FROZEN
ROOT CAUSE MAP COMPLETE
PRODUCTION CODE UNCHANGED
IMPLEMENTATION: NOT STARTED
VERDICT: NOT VERIFIED
```
