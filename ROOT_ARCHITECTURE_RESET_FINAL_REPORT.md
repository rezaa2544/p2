# Phase 7 — Root Architecture Reset — گزارش نهایی

**تاریخ (محلی):** 2026-09-19  
**SHA پایهٔ discovery:** `6e1b5adbcc719a086599cbac2ae320e3a33613b3`  
**ابزار حکم:** `tools/production-verifier.sh` (T1–T7) — fail-closed، بدون skip/mock.

```
VERDICT: VERIFIED
Evidence: Runtime + PostgreSQL + HTTP + GitHub Actions
local production-verifier.sh → 36 pass / 0 fail (on 136151e6)
Node.js CI build (22.x) → success (on a672c6e1) including Phase 7 T1–T7
```

- معماری فاز ۷ روی `136151e6d638bf554e5a35b3883b632c7b5f9216` نشست.
- حکم سازمانی روی Actions: run [35439364762](https://github.com/rezaa2544/p2/actions/runs/35439364762) / SHA `a672c6e1e90d46baf5c7a366f36e124f13037530` — **success**. Step «Phase 7 production verifier T1–T7» = success.
- کلون مستقل `origin/main` = همان SHA.

---

## چه عوض شد (کد، نه ادعا)

1. **لایهٔ `server/infrastructure/authority/`**  
   PostgreSQL تنها مرجع تصمیم است. RAM Mapها cache هستند.  
   `putState` / `getState` / `listState` → جدول `authority_state`.  
   `getTenantPolicy` → `tenant_policy`.  
   `consumeNonce` → همان `phase6_replay_ledger` (۱۵/۱۷). بدون جدول موازی.

2. **بدون Dual Schema**  
   `canary_state` و `governance_ledger` = **VIEW** روی `phase6_canary_configs` و `phase6_replay_ledger`.  
   Evidence T1: `relkind=v`، صفر جدول فیزیکی هم‌نام.

3. **کنترل‌پلن فاز ۵** (provincial / region / change / reservation / NOC / event idempotency)  
   نوشتن HTTP → persist در `authority_state`؛ GET از نمونهٔ دوم بعد از `refresh*FromSoT`.  
   Evidence T2: `REGION_STATE=MAINTENANCE` در PG و روی instance B؛ استان اصفهان `PROVISIONING`.

4. **گارد HTTP از `tenant_policy`**  
   `assertTenantBoundary` ناهمگام؛ بدون ردیف سیاست یا نقض استان → `PHASE6_TENANT_ISOLATION_BREACH`.  
   Evidence T3: معلم + `x-province-code: 04` → HTTP 403.

5. **Redis فقط cache**  
   `authority/cache-adapter.js` اگر `REDIS_URL` ست باشد و Redis زنده نباشد → `REDIS_UNAVAILABLE`.  
   Evidence T4: send-code زنده ۲۰۰؛ بعد از kill ردیس اختصاصی → ۵۰۳ بدون `fallback:true`/`allowed:true`.

6. **Boot**  
   با `DATABASE_URL`: attach + `hydrateControlPlane` اجباری؛ شکست → **listen نمی‌شود**.  
   Evidence T5: DB بدون migration 019 → FATAL، سوکت بسته.  
   قناری هم با `DATABASE_URL` دیگر warn-and-listen نیست.

7. **Nonce قناری فقط از authority**  
   Evidence T6: promote Ed25519 → وزن ۲۵ روی A=B=PG؛ replay و kill-9 → `REPLAY_ATTACK_DETECTED`؛ یک ردیف در `phase6_replay_ledger`.

---

## T1–T7 (اجرای زنده همین دور)

| دروازه | نتیجه |
|---|---|
| T1 Schema / VIEW / seed `tenant_policy` | PASS |
| T2 Persist کنترل‌پلن + همگرایی دو نمونه | PASS |
| T3 Tenant HTTP از DB | PASS |
| T4 Redis fail-closed | PASS |
| T5 Refuse listen بدون hydrate | PASS |
| T6 Canary + replay + kill-9 | PASS |
| T7 Honesty / wiring | PASS |

پورت‌ها: A=3511، B=3512، Redis اختصاصی T4 روی پورت پویا (نه ۶۳۷۹ ثابت).

---

## باقی‌ماندهٔ صادقانه

- آینهٔ JSON در dev هنوز fork می‌سازد اگر `DATABASE_URL` نباشد (عمدیِ dev).
- گارد `tenant_policy` روی `/api/v1/*` است وقتی `school_id` یا `x-province-code` هست؛ `/api/sync` هنوز گارد جدا دارد.
- Telemetry/auto-rollback قناری روی مسیر درخواست catch می‌شود (از قبل).
- `npm test` همچنان فرانت تک‌فایلی است — معیار این حکم نیست.
- CI Actions روی SHA جدید در این محیط دیده نشد.

---

## حکم

```
VERDICT: VERIFIED
```
