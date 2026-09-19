# Phase 6.6 — Production Truth Gate

تاریخ اجرا (محلی): 2026-09-19. حکم فقط `VERIFIED` یا `NOT VERIFIED` است.
ادعاهای PASS/گزارش/کامیت قبلی نامعتبرند مگر با Evidence همین فایل و خروجی `tools/production-truth-gate.js`.

## حکم این اجرا (روی درختِ پیش از کامیت ۶.۶)

```
PRODUCTION TRUTH GATE: 44/44
VERDICT: VERIFIED
مدت: ~57s
DATABASE_URL: postgres://payesh:payesh_test@127.0.0.1:5432/postgres
Node: v22.22.0
```

پس از کامیت+پوش، همان گیت باید روی **clone تازه** از `github.com/rezaa2544/p2` تکرار شود. حکمِ SHAی پوش‌شده فقط از آن اجرا معتبر است.

## کلاس خطای حذف‌شده (نه پچ موضعی)

1. **نبود گیت دائمی** → `tools/production-truth-gate.js` (۵ گیت؛ وابستگی غایب = exit 1؛ بدون skip/mock). CI: گام `Production Truth Gate` در `.github/workflows/node.js.yml`. اسکریپت: `npm run truth-gate`.
2. **Redis outage در `cache.checkRateLimit` → RAM fallback `{fallback:true}`** در حالی که مسیر auth (`rate-limit.js`) fail-closed بود. حالا با `REDIS_URL` یا `NODE_ENV=production` پرتاب `REDIS_UNAVAILABLE` (503). fallback RAM فقط بدون Redis و خارج از تولید.
3. **فابریک ترافیک ملی RAM-authority** (`_nationalTrafficWeights`) → جدول `phase6_ops_kv` (migration 018، BEGIN/COMMIT). GET هیدراته می‌شود؛ POST persist می‌کند؛ قطع PG/عدم attach = 503.
4. **مدارشکن قناری HTTP فقط RAM** → `persistCircuitBreaker` روی `phase6_canary_configs`.
5. **نبود اثبات سه‌چرخهٔ migration و سه‌نمونه** → Gate 2 و Gate 4.

## پنج گیت (Evidence زنده، اجرای ۴۴/۴۴)

| گیت | چه چیزی | Evidence |
|---|---|---|
| G1 Git | HEAD چهل‌نویسه؛ dirty ثبت شد (مانع VERIFIED نیست مگر `GATE_REQUIRE_CLEAN=1`) | HEAD محلی در اجرا `269161f6` (والد ۶.۵) |
| G2 Schema | ۱۸ UP == ۱۸ DOWN؛ همه BEGIN/COMMIT؛ **۳ چرخه** UP→108 جدول (شامل `phase6_ops_kv`) → DOWN **ZERO RESIDUE 0** | cycle 1/2/3 tables=108 سپس 0 |
| G3 HTTP | promote بدون Ed25519 = 403؛ با امضا = 200؛ ۴۰۰/۴۰۰ سرآیند X-Canary-*؛ tenant 403؛ replay 403 | ir-isfahan-1 weight=25 در PG |
| G4 Chaos | سه نمونه A=B=C=PG weight=25؛ فابریک A=B=C=ops_kv=50؛ kill-9 وزن ۲۵ ماند؛ Redis kill → 503 REDIS_UNAVAILABLE بدون fallback:true؛ PG stop → نوشت غیر 2xx (401) | پورت‌های 3411/3412/3413 |
| G5 Honesty | صفر `it.skip` / `DATABASE_URL→exit(0)` در tests؛ cache و rate-limit fail-closed | باقی‌ماندهٔ RAM پایین ثبت شد |

### سه‌نمونه (کلاس split-brain)

```
A == B == C == PostgreSQL  canary weight=25
A == B == C == phase6_ops_kv  traffic allocated_weight=50
```

### Redis fail-closed

بدنهٔ واقعی پس از `SIGKILL` ردیس اختصاصی:

```
503 {"ok":false,"code":"redis_required","error_code":"REDIS_UNAVAILABLE"}
```

هیچ `fallback:true` / `allowed:true`.

## باقی‌ماندهٔ صادقانه (پنهان نشد)

این Mapها هنوز RAM هستند و از HTTP فاز۵ قابل تغییرند؛ گیت آن‌ها را پنهان نکرد:

- `provincial-pilot-scaling._provincialStateStore`
- `change-management.changeRegistry`
- `national-capacity-enforcement.activeReservations`
- `national-operations-center.activeIncidents`
- `event-processing-layer.processedIdempotencyKeys`

مسیر تولیدِ مسیریابی (قناری + فابریک ترافیک + auth rate-limit) دیگر RAM-authority نیست.

## فایل‌های این مأموریت

- `tools/production-truth-gate.js`
- `server/infrastructure/ops-kv.js`
- `migrations/018_phase6_ops_kv.sql` + `.down.sql`
- `server/cache.js` (fail-closed)
- `server/infrastructure/national-traffic-fabric.js` (SoT)
- `server/routes/system.js` (hydrate/persist/circuit-breaker)
- `server/index.js` (attach ops-kv در dbReady)
- `.github/workflows/node.js.yml` + `package.json` script `truth-gate`

## نحوهٔ تکرار روی clone تازه

```
git clone https://github.com/rezaa2544/p2.git /tmp/p2-truth
cd /tmp/p2-truth
export DATABASE_URL=postgres://…   # الزامی؛ نبودش = NOT VERIFIED
node tools/production-truth-gate.js
# حکم باید VERIFIED و exit 0 باشد
```
