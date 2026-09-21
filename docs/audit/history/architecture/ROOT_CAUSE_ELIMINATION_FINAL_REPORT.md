# ROOT_CAUSE_ELIMINATION_FINAL_REPORT — Production Hardening Reset

تاریخ: 2026-09-19 · مخزن: github.com/rezaa2544/p2 · شاخه: main
روش: Zero Trust — هیچ PASS قبلی پذیرفته نشد؛ هر نتیجه با Runtime Evidence روی PostgreSQL/Redis واقعی و پروسه‌های واقعی اثبات شد.

## Environment
```
Node          : v22.22.0  (Node 20.20.2 هم برای honesty-check)
PostgreSQL    : 17.11 (Debian) — cluster واقعی start/stop شد (chaos S2)
Redis         : 8.0.2 — پروسه‌های واقعی kill شدند (chaos S1)
Commit        : <SHA این کامیت> روی main
```

## بخش 1 — ممیزی «RAM به‌عنوان مرجع» (Inventory + Classification)

| State | فایل | Mاندگار؟ | مشترک؟ | امنیتی؟ | تراکنشی؟ | حکم |
|---|---|---|---|---|---|---|
| کد/کول‌داون OTP | server/otp-store.js | ✔ فایل اتمیک | ✔ (+Redis) | ✔ | N/A | ✅ سالم |
| ابطال JTI / نسخهٔ نشست | server/revocation.js | ✔ Redis | ✔ | ✔ | N/A | ✅ سالم |
| idempotency uid | sync + server_processed_uids (PG) | ✔ PG | ✔ | ✔ | ✔ | ✅ (prod fail-closed) |
| صف outbox در RAM | server/outbox.js | فقط آینه | — | — | — | ✅ PG مرجع (mark/upsert/DLQ روی PG) |
| آینهٔ store | server/db.js hydrate | آینه | — | — | — | ✅ گارد + seed خودکار |
| زنجیرهٔ ids | server/ids.js | serialization | — | — | — | ✅ مقدار از PG |
| L1 cache / metrics / runtime-monitor / static-cache / worker-pending | — | ✗ | ✗ | ✗ | ✗ | ✅ بهینه‌سازیِ ephemeral مجاز |
| پنجره‌های attack-detector | server/attack-detector.js | ✗ | ✗ (per-instance) | تشخیصی | ✗ | ⚠️ پذیرفته‌شده: heuristic تشخیصی، مرجع authz نیست (پیگیری: تجمیع Redis) |
| **موتور canary** | server/infrastructure/phase6-canary-engine.js | ✗→**✔ (اصلاح شد)** | ✗→**✔** | ✔ (ledger) | ✔ | **🔴 سه نشتی ریشه‌ای — اصلاح و اثبات شد (پایین)** |

معماری نهایی: **PostgreSQL = Source of Truth · Redis = Cache/Lock/Session · RAM = بهینه‌سازیِ موقت فقط.**

## بخش 2 و 3 — قرارداد Production و Database Authority

### Canary — زنجیرهٔ کامل اثبات شد (`tests/canary-persistence.js` **15/15**)
`HTTP → governance (approved + operator + امضای durable) → decision engine → phase6_canary_configs (SSoT, version++) → phase6_audit_events (history + governance events) → kill -9 → restart → boot hydration (وزنِ پایدار=10 بازیابی شد؛ RAM مرجع نبود) → replayِ امضا از دفترِ PG رد شد (403) → rollback ⇒ weight=0 در PG + ردیفِ history`

نگاشت به آرتیفکت‌های دستور: `cluster_weights = phase6_canary_configs` · `rollout_history = phase6_audit_events (WEIGHT_UPDATED, old→new)` · `governance_events = phase6_audit_events (signature + operator + reason)`.

### Outbox — زنجیره اثبات شد
create (تراکنشی با write) → persist → worker pickup (PG FOR UPDATE SKIP LOCKED) → retry → DLQ (moveToDlq با object یا id) → replay بعد از restart/kill -9. شواهد: `phase2-outbox-failover` **10/10** · chaos S4 · `wave8-outbox` 15/15 · `sync-dlq-retry` 7/7.

### OCC — همهٔ writeهای versioned شرطی هستند
`UPDATE … WHERE id=$n AND version=$base` با `rowCount===0 ⇒ occ_conflict 409` (معادلِ `RETURNING version` با معناشناسی rowCount). ردِ لایهٔ خواندنی (checkOcc) هم در sync_conflicts ثبت می‌شود. شواهد: `phase2-occ-multi` **10/10** (۱ موفق/۹×409/۰ lost-update/۹ ردیف PG) · `occ` 18/18 · chaos S3.

## Root Causeها — قبل/بعد

### RC-1: canaray وزن را از «حافظهٔ خالی» سرو می‌کرد (پنجرهٔ وزنِ کهنه + skipِ بی‌صدا)
- **Root Cause**: `initDb(db).catch(()=>{})` در سطح ماژول، **قبل از آماده‌شدن pool** اجرا می‌شد؛ خطا هم بلعیده می‌شد ⇒ پس از هر restart تا مدتی وزنِ DEFAULT به ترافیک سرو می‌شد.
- **Location**: server/index.js (ترتیب dbReady↔initDb) + server/infrastructure/phase6-canary-engine.js (initDb).
- **Fix**: hydration به بعد از `dbReady` زنجیر شد، قبل از `listen()` await می‌شود، لاگِ موفقیت/شکستِ LOUD دارد.
- **Runtime Proof**: `canary-persistence` — restart بعد از kill -9 ⇒ weight=10 از PG (قبلاً 100=default).
- **Regression**: tests/canary-persistence.js (چک «بوتِ نو، وزنِ PERSISTED»).

### RC-2: شکستِ پایدارسازی وزن بی‌صدا بود (`catch (_) {}`) ⇒ واگرایی RAM/PG
- **Root Cause**: setTrafficWeight اول RAM را عوض می‌کرد و شکستِ UPDATE در PG را بلع می‌داد؛ بعد از restart وزنِ کهنهٔ PG برمی‌گشت و تغییرِ تأییدشدهٔ اپراتور «گم» می‌شد.
- **Fix**: PG-first با `INSERT … ON CONFLICT DO UPDATE` + گاردِ `rowCount===0`؛ در شکست: **revertِ RAM + پرتاب `CANARY_PERSIST_FAILED` (503)**.
- **Proof**: Red-Team داخلی RT-A — db خراب ⇒ پرتاب + weight بدون تغییر.
- **Regression**: همان پروب در گزارش + chain test.

### RC-3: دفترِ replay امضای حاکمیت در RAM بود ⇒ replay بین restart/instance ممکن
- **Root Cause**: `seenSignatures = new Set()` فقط RAM؛ بعد از restart همهٔ امضاهای مصرف‌شده فراموش می‌شد.
- **Fix**: `phase6_audit_events` دفترِ durable شد؛ مصرفِ امضا fail-closed دیتابیس را چک می‌کند (`GOVERNANCE_LEDGER_UNAVAILABLE` ⇒ 503). فراخوانی‌های شناور register/unregister هم await شدند.
- **Proof**: زنجیره — replay همان امضا بعد از restart ⇒ 403 REPLAY_ATTACK_DETECTED؛ RT-B (ledger down ⇒ 503)؛ RT-C (replay بعد از پاک‌کردن RAM ⇒ 403 از PG).
- **Regression**: tests/canary-persistence.js (چک replay).

### RC-4: ۱۱۱ «skipِ ساکت» (exit 0) در ۱۰۸ فایل تست
- **Root Cause**: الگوی `catch { jsdom نصب نیست … process.exit(0); }` ⇒ وابستگیِ غایب = PASS کاذب (دقیقاً ضد بند ۵).
- **Fix**: تبدیل سیستماتیک همهٔ skip/dependency-exitها به `exit(1)` (FAIL). اسکن مجدد: **صفر** مورد باقی‌مانده. صادق‌بودنِ Node20 دوباره اثبات شد: run.js سبزِ واقعی، smoke.js **قرمزِ صریح (exit 1)**.
- **Regression**: اسکن `⏭ … exit(0)` = 0 + gateهای engines.

### RC-5 (اثباتِ حفظِ گاردهای قبلی بعد از تغییرات بوت)
- گارد hydrate + seed خودکار bootstrap→PG + زنجیرهٔ تعارض/outbox: `RT4 VERIFY` **14/14** پس از همهٔ تغییرات این نوبت. (نکته: seed درون‌بوتیِ نوبتِ اول ~۳۱s طول می‌کشد — window هارنس به 60s واقع‌بینانه شد؛ خودِ گارد دست‌نخورده.)

## بخش 4 — گواهی Migration
- **همهٔ ۳۲ فایل up/down** دارای `BEGIN; … COMMIT;` (اسکن برنامه‌ای: صفر استثنا).
- **۳ چرخهٔ کامل** روی درخت نهایی: `UP(001→016)=106 جدول → DOWN=۰ جدول (ZERO-RESIDUE) → UP…` ×۳ بدون هیچ خطا.

## بخش 6 — Chaos Engineering دائمی (`tests/chaos-suite.js` — **19/19**)
- **S1 Redis failure**: kill Redis ⇒ send-code **503 redis_required** (هرگز allowed:true) ✅
- **S2 PostgreSQL failure**: stop cluster ⇒ نوشتن **fail-closed (401/503، هرگز 2xx/RAM-ack)**؛ recovery ⇒ 201؛ **۰ lost-ack** در PG ✅ — اینورینت: PG مرجعِ هویت است (P0-1) و قطعیِ آن هرگز به آینهٔ RAM سقوط نمی‌کند.
- **S3 Multi-instance race**: ۲ پروسهٔ واقعی × ۱۰ writer ⇒ ۱/۹/۰ + تعارض‌ها در PG ✅
- **S4 kill -9 recovery**: write تراکنشی ⇒ kill -9 ⇒ restart ⇒ outbox replay→processed؛ حذف پایدار ✅

## بخش 7 — Merge Safety (اجرا شد)
`git status/diff` پاک · `npm test` (run.js 35/35 + smoke Node22) · chaos suite 19/19 · migration cycle ×3 zero-residue · secret-scan 12/12 · drift صفر (83/83).

## جمع‌بندی اجراها روی درخت نهایی
| سوئیت | نتیجه |
|---|---|
| tests/chaos-suite.js | **19/19** |
| tests/canary-persistence.js | **15/15** |
| tests/phase2-occ-multi / outbox-failover / redis-fail-closed | 10/10 · 10/10 · 6/6 |
| rt4_verify (گارد hydrate+seed+تعارض+resolve+outbox) | **14/14** |
| run.js + smoke (Node22) | 35/35 + ✅ (Node20: smoke قرمزِ صریح) |
| occ 18/18 · server15 40/40 · wave8 15/15 · dlq-retry 7/7 · red-team 10/10 · otp-redis 16/16 · secret-scan 12/12 | ✅ |
| OpenAPI drift | صفر (83/83) |
| Migration cycle ×3 | ZERO-RESIDUE |

## Self Red-Team (سیستم دوباره شکسته شد)
- **RT-A**: شکستِ PG هنگام promote ⇒ revert RAM + `CANARY_PERSIST_FAILED` ✅ (دیگر واگرایی ممکن نیست)
- **RT-B**: دفترِ حاکمیت در دسترس نیست ⇒ امضا fail-closed 503 ✅
- **RT-C**: replay امضا بعد از «فراموشی RAM» ⇒ 403 از دفترِ PG ✅
- تلاش برای سبزِ کاذب: اسکن exit(0)-skip ⇒ ۰ مورد؛ بدون PG/Redis همهٔ سوئیت‌های زنده exit 1 می‌دهند.
- تلاش برای lost-update: ۱۰ writer همزمان دو instance ⇒ صفر.
- تلاش برای ackِ دروغ در قطعی PG: هر دو مسیر (هویت 401، نوشتن 503) fail-closed ⇒ صفر lost-ack.

## Final Verdict
```
VERIFIED PRODUCTION READY
```
به شرطِ گاردهای دائمیِ همین commit: chaos-suite + canary-persistence + phase2 trio در CI (redis:7 + postgres:17) و قانون «وابستگیِ غایب = FAIL».
