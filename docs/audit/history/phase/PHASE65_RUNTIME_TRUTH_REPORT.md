# Phase 6.5 — Runtime Truth Reconstruction & Zero Trust Remediation

تاریخ: 2026-09-19  
نقش: Chat 2 (Remediation) — Principal Production Architect  
قانون: هیچ PASS قبلی قبول نشد. هر ادعا با HTTP واقعی + PostgreSQL واقعی + Redis واقعی اثبات شد.

## Verdict

**PHASE 6.5 VERIFIED**

مجموعهٔ پذیرش Red Team: `tests/phase65-runtime-truth.js` → **۳۷/۳۷**

## زنجیرهٔ Runtime که اثبات شد

```
Real HTTP Request
        ↓
HTTP Router (server/index.js)
        ↓
Canary Middleware (server/middleware/canary.js)
        ↓
Decision Engine (routeRequestSoT ← SELECT phase6_canary_configs)
        ↓
PostgreSQL Transaction (weight/version/ledger)
        ↓
Audit Record (phase6_audit_events)
        ↓
HTTP Response Evidence (X-Canary-ID / X-Canary-Cluster / X-Canary-Version)
```

## Phase A — Runtime Wiring

| حلقه | قبل | بعد | شاهد |
|---|---|---|---|
| هدر اجباری | `X-Payesh-Canary-*` فقط | `X-Canary-ID` + `X-Canary-Cluster` + `X-Canary-Version` از هر درخواست | RT-01: 10000/10000 |
| مسیریابی | `this.clusters` RAM | `routeRequestSoT` قبل از تصمیم cache را از PG می‌خواند | RT-01 canary=2370 @25% (σ طبیعی) |
| middleware | inline در handler | `server/middleware/canary.js` | کد + هدر |

وزن ۲۵٪ روی `ir-isfahan-1`، استان `04`، ۱۰۰۰۰ درخواست واقعی:
- canary = 2370 (بازهٔ قبول 2000–3000)
- baseline = 7630
- هر پاسخ سه هدر اجباری داشت

`approved === true` به‌تنهایی → **403 PHASE6_APPROVAL_REQUIRED** (نه 200).

## Phase B — PostgreSQL تنها SoT

جداول:

- `phase6_canary_configs` — `id, region_id, weight, traffic_weight, version, status, updated_by, updated_at`
- `phase6_audit_events` — `event_type, actor, payload, signature, created_at` (+ ستون‌های سازگار)
- `phase6_replay_ledger` — `nonce PK, signature_hash UNIQUE, expires_at, created_at`

مهاجرت: `015` (نصب تازه) + `017` (additive).

RAM (`Map`/`Set`) فقط cache است. `setTrafficWeight` اول PG را می‌نویسد، بعد cache.

شاهد kill -9: وزن ۵۰ بعد از SIGKILL و بوت مجدد از PG آمد (RT-02).

## Phase C — Split-brain

دو فرآیند واقعی، یک PostgreSQL:

1. A: promote weight=50 (Ed25519)
2. B: GET `/api/v1/system/phase6/canary/status` → `getSnapshotFromSoT`

نتیجه: **A=50 B=50 PG=50**

## Phase D — Replay واقعی (ADR-012)

ممنوع: `approved === true` به‌تنهایی.

الزام: Ed25519 + nonce + timestamp + expiry.

```
Operator sign → verify public key → INSERT phase6_replay_ledger
  → unique nonce/signature_hash → execute
```

- payload اول: 200
- همان payload: **403 REPLAY_ATTACK_DETECTED**
- بعد از kill -9 + restart: همچنان **403**
- دفتر: `SELECT COUNT(*) FROM phase6_replay_ledger` = 2

کلید: `PAYESH_GOVERNANCE_ED25519_PUBLIC_KEY` (SPKI DER base64). بدون کلید در مسیر DB: 503 `GOVERNANCE_KEY_UNAVAILABLE`.

## Phase E — NOC Metrics Truth

حذف fallbackهای 65 / 185 / 120 / 320 / 3500.

NOC (`GET /api/v1/system/national/health`) از `getAggregatedMetrics()` روی نمونه‌های واقعی درخواست می‌خواند.

بعد از ۵۰۰۰ HTTP:
- `is_live: true`
- `p95_ms = 14` (نه 65/185)
- آستانهٔ اختلاف رعایت شد

بدون نمونه: `NOT_VERIFIED` / `samples=0` — هرگز عدد ساختگی.

## Phase F — Tenant / Province Isolation

زنجیره: Request → Auth → Tenant Guard → Province Guard → Controller

معلم مدرسه ۳ (استان تهران / `07`) درخواست `GET /api/v1/students?province=04`:

**403 PHASE6_TENANT_ISOLATION_BREACH** — نه 200.

`superadmin` مستثنی است. استان بازیگر از `schools.province_id` + جدول `provinces` حل می‌شود. اگر استان عامل نامعلوم و هدف صریح باشد: fail-closed.

## Phase G — Redis Fail Closed

Production / `REDIS_URL` بدون Redis زنده:

- throw `REDIS_UNAVAILABLE`
- HTTP: `503 { code: redis_required, error_code: REDIS_UNAVAILABLE }`
- هیچ `allowed:true` / `fallback:true`

شاهد RT-05: redis-server واقعی → 200 → SIGKILL → 503 REDIS_UNAVAILABLE.

## Phase H — Migration Truth

دیتابیس کاملاً خالی:

| مرحله | نتیجه |
|---|---|
| UP 001→017 | 107 جدول، ۰ خطا |
| DOWN 017→001 | **0 جدول (ZERO RESIDUE)** |
| UP دوباره | 107 = 107 |

`phase6_replay_ledger` و ستون‌های `weight`/`region_id` در زنجیره هستند.

## Phase I / RT-10 — حذف Green Fake

اسکنر خط‌به‌خط `tests/`:
- `DATABASE_URL` غایب → `exit(0)` 
- `describe.skip` / `it.skip` / `test.skip`
- `catch { process.exit(0) }`

نتیجه: **۰ مورد**.

`tests/wave3-parity-mutations.js` که قبلاً بدون DATABASE_URL با exit(0) سبز می‌شد → حالا **exit(1)**.

مجموعهٔ پذیرش بدون DATABASE_URL: **exit(1)**.

## Phase J — Red Team Acceptance (خام)

| ID | آزمون | نتیجه |
|---|---|---|
| RT-01 | Canary live routing 10000 HTTP @25% | ✅ 2370 canary، 10000/10000 هدر |
| RT-02 | Kill-9 persistence | ✅ weight=50 از PG |
| RT-03 | Replay after restart | ✅ 403 + ledger n=2 |
| RT-04 | Two instance consistency | ✅ A=50 B=50 |
| RT-05 | Redis outage | ✅ 503 REDIS_UNAVAILABLE |
| RT-06 | Postgres outage | ✅ نوشت 401 fail-closed، ۰ RAM-ack؛ recovery 201 |
| RT-07 | Migration clean DB | ✅ 107 → 0 → 107 |
| RT-08 | Tenant breach | ✅ 403 PHASE6_TENANT_ISOLATION_BREACH |
| RT-09 | NOC vs 5000 samples | ✅ p95=14 live |
| RT-10 | Fake green scanner | ✅ 0 |

## فایل‌های کلیدی

- `server/infrastructure/phase6-canary-engine.js` — PG-first weight، Ed25519، ledger
- `server/infrastructure/phase6-governance.js` — canonical payload + sign/verify
- `server/middleware/canary.js` — هدرهای اجباری
- `server/infrastructure/phase6-production-hardening.js` — province guard
- `migrations/015_phase6_canary_configs.sql` + `017_phase6_runtime_truth.sql`
- `tests/phase65-runtime-truth.js`
- `.github/workflows/node.js.yml` — گام CI جدید

OpenAPI drift: **۰ (۸۳/۸۳)**.

## Environment (این اجرا)

- Node 22.22.0 (`/tmp/node-v22.22.0-linux-x64`)
- PostgreSQL 17.11 (کلاستر `17 main`)
- Redis 8 / redis-server اختصاصی برای RT-05
- DSN تست: `postgres://payesh@127.0.0.1:5432/payesh_p65` (+ `payesh_p65mig`)

## ممنوعیت‌هایی که رعایت شد

- تست برای پاس‌کردن کد ساخته نشد؛ تست بعد از اتصال Runtime نوشته شد
- Mock اضافه نشد
- ادعای اصلاح بدون HTTP evidence نشد
- `approved === true` دیگر در مسیر Production کافی نیست
