# M15-01 — CHAT 3: شواهدِ حوزهٔ sync / data-write روی SHA دقیق

**نقش:** Chat 3 — Sync / data-write reliability · **تاریخ:** 2026-10-29
**SHA اجرا:** `344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272` (PR source tip) · `origin/main` = `aa16c62b6ce64dc8c99068945e762caf82d4e934`
**مجوز:** `docs/daily-missions/Chat3/ACTIVE.md` — **Status: ACTIVE**، شاملِ `M1…M4` و این جمله: «After M4, continue unresolved write-path, sync, test and evidence work within this Mission…» و «If P0-1 implementation choice is ambiguous, stop that implementation and continue independent tests/evidence work.»
**پوشهٔ شاهد:** `docs/verification/evidence/m15-01-chat3-write-domain-2026-10-29/` (`logs/`, `mutations/`, `WRITE_DOMAIN_RESULTS.tsv`, `MANIFEST.sha256`, `branches-sync-offline.txt`)

> **حکمِ این دور:** از ۲۹ آیتمِ `UNKNOWN`، **۷ آیتم** واقعاً به حوزهٔ sync/write تعلق دارد.
> روی `344a9db` برای ۵ آیتم شاهدِ مثبتِ **غیرِ‌mock** تولید شد (E3)، برای A-24 شاهدِ
> جزئی، و برای A-25 هر شاهدِ موجود **mock/static** است و مسیرِ واقعی‌اش
> `BLOCKED (real PG)`. **هیچ status رجیستری تغییر نکرد**؛ رجیستری با sha256 یکسان و
> بدونِ هیچ diff باقی ماند. یک **پرچمِ P0-1** (شاخهٔ واگرا در همان مسیرِ نوشتن) شناسایی و
> **به داوری سپرده شد، نه حل**.

---

## ۱. شناساییِ محدوده: کدام UNKNOWN واقعاً sync/write است؟

معیار: آیتم باید دربارهٔ **نوشتن/ماندگاری/همزمانی/همگام‌سازی** باشد، نه تحلیل، CI، امنیت یا مستندات.

| # | آیتم | چرا در حوزهٔ من است | مدرکِ اجرا امروز |
|---|---|---|---|
| A-04 | تولیدِ شناسهٔ یکتا زیرِ نوشتنِ هم‌زمان (`ids.js`) | کلیدِ اصلیِ هر insert؛ رقابت = overwrite | ✅ ۳/۳ |
| A-06 | ایدمپوتانسِ ارسالِ پیامک و شمارشِ سهمیه (`sms.js`) | نوشتنِ مالی/پیامکی؛ تکرار = هزینهٔ دوباره | ✅ ۱۸/۱۸ |
| A-18 | حلِ تعارض با نسخهٔ یکنوا (`conflicts.js`) | نوشتنِ برنده؛ عقب‌رفتنِ نسخه = از دست رفتنِ داده | ✅ ۱۲/۱۲ |
| A-20 | OCC رویِ هر ۵ مسیرِ PATCH (`occ.js` + routes) | stale-write = نابودیِ ویرایشِ هم‌زمان | ✅ ۳۴/۳۴ + ۴۰/۴۰ + ۱۸/۱۸ |
| A-21 | اعتبارسنجیِ FK هنگامِ نوشتن (classes/attendance/grades) | نوشتن با FKِ بیگانه = آلودگیِ cross-tenant | ✅ ۱۶/۱۶ |
| A-24 | صحتِ sync/offline (صف، بسته‌بندیِ اتمیک، replay) | مستقیماً sync | ✅ ۷ اجرا مثبت · ⛔ ۲ اجرا BLOCKED |
| A-25 | outbox/worker/DLQ (ماندگاری پس از crash) | مسیرِ نوشتنِ رویدادها | ⚠️ فقط mock/static · ⛔ ۲ اجرا BLOCKED |

**۲۲ آیتمِ دیگر صادقانه خارج از حوزه‌اند** (نمی‌توانم و نباید شاهد بسازم): A-01/02/03 (تحلیل و fallback،
همه read-only)، A-05 (پشتیبان‌گیری)، A-07/08/14/15/16/17/23 (تست/instrumentation/تحلیل)،
A-09/10/11/13/26 (CI و اسکنرهای vendor)، A-12 (اجرای suites)، A-19/22 (IP/handle امنیتی —
یدی‌گر و revoke)، A-27/28/29 (محیطِ multi-host و مستندات).

---

## ۲. شرایطِ اجرا (قابلِ بازتولید)

```
worktree /tmp/wt-src @ 344a9dbf82fe9dafc0b8bf9fa5ed2b5334998272   (read-only، بدونِ هیچ edit)
node v22.22.3 · npm 10.9.8 · git 2.39.5 · Linux 6.1
npm ci → 194 packages (jsdom + pg لازمِ همین suites هستند)
node server/seed.js → server/data/payesh.json (gitignored، مستند در docs/DEVELOPMENT.md)
git status --porcelain --untracked-files=no → خالی  (هیچ فایلِ tracked تغییر نکرد)
```

دو اجرای نخستِ مجموعه **محیطی** شکست خوردند (`Cannot find module 'jsdom'` / `'pg'`) چون
`node_modules` نصب نبود؛ پس از `npm ci` همان فرمان‌ها اجرا و لاگ‌ها **بازنویسی** شدند.
آن شکست‌ها در گزارش به‌عنوان شاهد ثبت **نشده‌اند**.

---

## ۳. شواهد به‌ازای هر آیتم (فرمان · exit · runtime · sha256 · نتیجه)

جدولِ ماشین‌خوان: `WRITE_DOMAIN_RESULTS.tsv` (شاملِ sha256 هر stdout/stderr).

### A-20 — OCC رویِ ۵ مسیرِ PATCH  → **مثبت (قوی‌ترین شاهد)**

| فرمان | exit | ms | نتیجه |
|---|---|---|---|
| `node tests/reaudit-occ-stale-write.js` | 0 | 1271 | ۳۴/۳۴ — سرورِ **واقعیِ spawn‌شده** + HTTP؛ ۵ موجودیت × (عادی/STRICT): پایهٔ کهنه ۴۰۹، بدونِ `base_version` در STRICT ۴۰۰ `missing_base_version` |
| `node tests/a20-occ-production-invariant.test.js` | 0 | 30 | ۴۰/۴۰ — ۸ پاس: production/flag/env، پذیرشِ `base_version` درست، ردِ مقادیر بی‌معنا (string/bool/0/منفی/float/empty/null/undefined-key) |
| `node tests/occ.js` | 0 | 533 | ۱۸/۱۸ — سرورِ واقعی + HTTP، شاملِ «دو نوشتِ هم‌زمان → یکی ۲۰۰ یکی ۴۰۹» |

نکتهٔ صادقانه: مسیرِ default (dev/test) **عمداً** نوشتنِ بدونِ نسخه را می‌پذیرد
(`occ.js:20-21`، سازگاریِ مستند) و همان تست هم `reaudit` خطِ «B بدونِ base_version ⇒ ۲۰۰
(ناامن)» را در حالتِ عادی ثبت می‌کند. این نقص نیست؛ قراردادِ مستند است و مسیرِ production
fail-closed است (T1/T3 سبز).

### A-04 / A-06 / A-18 / A-21 — **مثبت (E3، بدونِ mock)**

| آیتم | فرمان | exit | ms | نتیجه |
|---|---|---|---|---|
| A-04 | `node tests/phase-c-id-race.js` | 0 | 58 | ۳/۳ — سه موجِ هم‌زمان، یکتایی و صعودِ شناسه، و شناسهٔ سوخته پس از درجِ ناموفق |
| A-06 | `node tests/phase-c-sms-quota-complexity.js` | 0 | 297 | ۱۸/۱۸ — سقفِ روزانه، ۴۲۹ + `daily_cap`، sprint ۵۰۰ رویِ ۲۰۰k ردیف در ۱۶۰ms، dedupe با `sentIndex` |
| A-18 | `node tests/phase-c-conflict-resolution.js` | 0 | 51 | ۱۲/۱۲ — تعارضِ کهنه ۴۰۹، نسخه عقب نمی‌رود، مدیرِ بیگانه ۴۰۳، تعارضِ هم‌مدرسه ۲۰۰ و نسخه ۳ |
| A-21 | `node tests/phase-c-unvalidated-fks.js` | 0 | 604 | ۱۶/۱۶ — ردِ دبیرِ بیگانه ۴۰۰ `invalid_homeroom_teacher`، ردِ `class_id` غیرِثبت‌نام ۴۰۳، و ۱۰۴۶۰/۱۰۴۶۰ + ۱۲۵۵۵/۱۲۵۵۵ رکوردِ seed بدونِ نقض |

### A-24 — sync/offline  → **مثبتِ جزئی (۷ اجرا) + ۲ BLOCKED**

| فرمان | exit | ms | نتیجه |
|---|---|---|---|
| `node tests/offline-sync-drill.js` | 0 | 11023 | ۲۹ موفق / ۰ ناموفق **+ ۳ NOT-RUN صادقانه** (Background Sync با تبِ بسته = نیازمندِ Chromium؛ قطعِ شبکهٔ واقعی = بدونِ root؛ اندازه‌گیری رویِ PG/Redisِ زنده = خارج از این drill) |
| `node tests/wave7-offline-queue.js` | 0 | 4199 | ۷/۷ — صفِ آفلاینِ کلاینت (jsdom) |
| `node tests/sync-chunk.js` | 0 | 6516 | ۲۸/۲۸ — تقسیمِ ۵۰۱ op و ۴۱۳ |
| `node tests/sync-conflict-storm-drill.js` | 0 | 103 | طوفانِ تعارض/partial failure/retry storm رویِ `server/sync.js` واقعی (بدونِ PG) |
| `node tests/sync-dup-claim.js` | 0 | 52 | ادعایِ اتمیکِ `uid` (idempotency) |
| `node tests/sync-atomic-batch.js` | 0 | 76 | **صرفاً** مسیرِ بدونِ PG + شکلِ SQL — نه اجرای PG |
| `node tests/sync-occ-adversarial-live.js` | **1** | 128 | BLOCKED: `SYNC_TEST_DATABASE_URL required; missing real PG is failure, never skip` |
| `node tests/sync-replay-adversarial-live.js` | **1** | 107 | BLOCKED: `SYNC_TEST_DATABASE_URL required` |

### A-25 — outbox  → **هیچ شاهدِ عملیاتی ندارم**

| فرمان | exit | ms | چرا عملیاتی نیست |
|---|---|---|---|
| `node tests/outbox-runtime-reliability.test.js` | 0 | 87 | `createOutbox({ store, db: null })` با `store = { outbox: [] }` ⇒ **in-memory mock**؛ crash/lease فقط با `setImmediate`/tickِ ساختگی شبیه‌سازی می‌شود |
| `node tests/outbox-dlq-atomicity.test.js` | 0 | 50 | `store` دستی + `db` تزریق‌شده ⇒ **شبیه‌سازی** (rollbackِ اتمیک را ثابت می‌کند، ماندگاریِ واقعی را نه) |
| `node tests/outbox-lease-fencing.test.js` | 0 | 33 | **static contract** روی source، بدونِ اجرای worker |
| `node tests/phase2-outbox-failover.js` | **1** | 37 | BLOCKED: `DATABASE_URL required — dependency missing = FAIL (exit 1)` |
| `node tests/outbox-lease-race-live.js` | **1** | 39 | BLOCKED: `DATABASE_URL required — live PostgreSQL dependency missing; FAIL, never skip` |

پس برخلافِ عبارتِ legacy («outbox present and wired; tests exist»)، وضعیتِ واقعیِ امروز:
**کد سیم‌کشی‌شده است** (`server/index.js:70,854-859`، ۱۹ ارجاع) **ولی رفتارِ عملیاتیِ آن در
این محیط اثبات‌شدنی نیست.** «TEST EXISTS ≠ TEST VALID» — و برای A-25، آزمونِ معتبر
همان دو تایی است که BLOCKED شدند.

---

## ۴. غیرِ‌توخالی‌بودنِ شواهد: ۶ جهش، ۶ کشته

روش: هر جهش رویِ کپیِ تمیزِ `344a9db`، سپس **بازگردانی** (`git checkout --`)، و
`git status --untracked-files=no` خالی برای اثباتِ بازگشت. لاگ‌ها: `mutations/`.

| جهش | جای تغییر | تست | نتیجه |
|---|---|---|---|
| `mut-a20-students-isVersioned` | `routes/students.js`: `checkOcc(..., true)` → `false` | `reaudit-occ-stale-write` | **exit 1** — «[students/STRICT] بدونِ base_version ⇒ ۴۰۰» گرفـت ۲۰۰ |
| `mut-a20` (۲ موردِ دیگر پوشش: users/grades/classes/attendance همان الگو) | — | — | با یک جهش کافی است چون تست هر ۵ مسیر را جدا گزارش می‌کند |
| `mut-a18-nextver-rewind` | `conflicts.js`: `+1` از `nextVer` حذف | `phase-c-conflict-resolution` | **exit 1** — «نسخه ۳ شد — version=2» (۱۱/۱۲) |
| `mut-a04-ids-no-lastIssued` | `ids.js`: `Math.max(localMax, lastIssued)` → `localMax` | `phase-c-id-race` | **exit 1** — `duplicate ids: [102,102,102]` |
| `mut-a21-homeoomb-teacher-check` | `routes/classes.js`: گاردِ `invalid_homeroom_teacher` بی‌اثر | `phase-c-unvalidated-fks` | **exit 1** — «دبیرِ مدرسهٔ دیگر رد می‌شود» شکست (۱۴/۱۶) |
| `mut-a06-sms-dedupe` | `sms.js`: `sentIndex.has(...)` → `false` | `phase-c-sms-quota-complexity` | **exit 1** — `sent rows: [10,10,11]` (۱۶/۱۸) |

⇒ شواهدِ مثبتِ بالا **توخالی نیستند**: با برداشتنِ هر اصلاح، تستِ متناظر قرمز می‌شود.

---

## ۵. شکافِ سیم‌کشی (اندازه‌گیری‌شده، در حوزهٔ من)

| تست | `tests/run.js` | `scripts/run-all-tests.sh` | workflow |
|---|---|---|---|
| phase-c-id-race | ✗ | ✗ | ✗ |
| phase-c-sms-quota-complexity | ✗ | ✗ | ✗ |
| phase-c-conflict-resolution | ✗ | ✗ | ✗ |
| a20-occ-production-invariant | ✗ | ✗ | ✗ |
| phase-c-unvalidated-fks | ✗ | ✗ | ✗ |
| offline-sync-drill | ✗ | ✗ | ✗ |
| wave7-offline-queue | ✗ | ✗ | ✗ |
| sync-conflict-storm-drill | ✗ | ✗ | ✗ |
| sync-chunk | ✗ | ✗ | ✗ |
| reaudit-occ-stale-write | ✗ | ✓ | `node.js.yml` |
| occ | ✗ | ✓ | `node.js.yml` |
| outbox-runtime-reliability / dlq-atomicity / lease-fencing | ✗ | ✗ | `node.js.yml` + `runtime-reliability.yml` |
| sync-dup-claim / sync-atomic-batch | ✗ | ✗ | `node.js.yml` |

یعنی **۹ از ۱۶** اجرای این حوزه در هیچ CI‌ای اجرا نمی‌شوند؛ شاهدِ آن‌ها فقط محلی است.
این را **ثبت** می‌کنم و تغییر نمی‌دهم (سیم‌کشیِ CI خارج از دامنهٔ مأموریتِ امروز و
نیازمندِ تصمیم دربارهٔ زمان/هزینهٔ CI است).

---

## ۶. دو تصحیحِ شاهدِ تاریخی (بدونِ هیچ ارتقا)

### ۶-۱. A-24: گزارهٔ «No sync/offline remediation branch exists on origin (only main)» دیگر درست نیست

`git ls-remote origin` امروز **۲۱** شاخهٔ مرتبط با sync/offline دارد (`branches-sync-offline.txt`).
وضعیت نسبت به `main` (API مقایسه، read-only):

| شاخه | status | ahead | behind | تفسیر |
|---|---|---|---|---|
| `feat/chat3-sync-reliability-evidence` | behind | 0 | 1867 | محتوا در main هست |
| `feat/chat3-offline-sync-drill` | behind | 0 | 1878 | همان |
| `feat/chat3-conflict-storm-drill` | behind | 0 | 1869 | همان |
| `feat/client-offline-v2` | behind | 0 | 2400 | همان |
| **`arena-sync/offline-occ-20260924`** | **diverged** | **1** | 738 | **یک کامیتِ حل‌نشده در همان مسیرِ نوشتن** |

### ۶-۲. 🚩 پرچمِ P0-1 — ثبت شد، **حل نشد**

کامیتِ `4b577701b42fd33b61babdacab346b449e11c580`
(«`fix(sync): preserve OCC and conflict state across concurrent writes and replay`»، 2026-09-24)
این فایل‌ها را لمس می‌کند: `server/occ.js`، `server/conflicts.js`، `server/sync.js`،
`server/db.js` و `routes/{students,users,classes,attendance}.js`. یعنی **همان مسیرِ P0-1 من**.

آزمونِ بی‌طرفِ «آیا محتوایش در درختِ candidate هست؟» (اعمالِ معکوسِ patch، read-only):

```
PRESENT_IN_TREE   server/routes/attendance.js
PRESENT_IN_TREE   server/routes/students.js
PRESENT_IN_TREE   server/routes/users.js
NOT_PRESENT       server/conflicts.js
NOT_PRESENT       server/db.js
NOT_PRESENT       server/occ.js
NOT_PRESENT       server/routes/classes.js
NOT_PRESENT       server/sync.js
```

⇒ **جذبِ جزئی**: ۳ از ۸ فایل محتوای آن شاخه را دارند، ۵ فایل نه. **تصمیم دربارهٔ این که
این بی‌ضرر است یا یک ناسازگاری، داوریِ مالک/control-plane است، نه من.** طبقِ قانونِ
مأموریت (`ACTIVE.md`)، آن پیاده‌سازی را متوقف کردم و merge/rebase/pick نکردم.

شفاف‌سازیِ مهم: با وجودِ این پرچم، **هیچ ناسازگاریِ رفتاریِ فعالی اندازه‌گیری نشد** —
`a20-occ-production-invariant` هر ۵ مسیر را در production/flag/dev یکسان می‌بیند (۴۰/۴۰).
پس این یک **ریسکِ آینده** است، نه یک نقصِ اثبات‌شدهٔ امروز؛ و بدونِ اثبات، کد تغییر نکرد.

---

## ۷. آنچه **انجام نشد** و چرا

| کار | چرا | وضعیت |
|---|---|---|
| تغییرِ status رجیستری | مأموریت صریحاً منع کرده؛ و شاهد امروز در worktreeِ scratch است، نه در همین SHA | **انجام نشد** |
| کامیتِ شاهدِ جدید در رجیستری | churnِ `head_bound` که کارِ OD-3 است و تصمیمش با مالک | **انجام نشد** |
| حل/mergeِ شاخهٔ `arena-sync/offline-occ-20260924` | P0-1 = داوری؛ `ACTIVE.md` صریح | **متوقف، پرچم زده شد** |
| اثباتِ A-25 با PG | نیازمندِ `DATABASE_URL`/سرویسِ PG؛ در sandbox نیست و «skip» جایز نیست | **BLOCKED** |
| سیم‌کشیِ ۹ تست به CI | تغییرِ فرایندِ CI، خارج از دامنهٔ امروز | **ثبت شد، انجام نشد** |
| هر تغییری در E4، vendor scanners، OD-2/3/4، #468/M15-02 | خارج از مأموریت | **دست نزدم** |

---

## ۸. وضعیتِ رجیستری: دست‌نخورده (اثبات)

```
git show HEAD:docs/verification/VERIFICATION_REGISTRY.json | sha256sum
→ f5d1348825af1dab4f48bf338a563f8c88994f81e8c52915b619ffb6c099364c
git diff --stat fff1beae09ff45d69e554f8c000a9d15b75d968c HEAD -- docs/verification/VERIFICATION_REGISTRY.json
→ (خالی)
```

`status: UNKNOWN` · ۳۲ آیتم · ۲۹ `UNKNOWN` · ۳ `RUNTIME_VERIFIED` · `head_bound: bf263bf2…` — **بی‌تغییر**.

---

## ۹. جمع‌بندی برای Chat 1

جدولِ زیر **وضعیتِ محلیِ من روی `344a9db`** است و **هم‌ارزِ status رجیستری نیست** (واژگانِ
`AGENTS.md`: VERIFIED / NOT VERIFIED / BLOCKED / REVALIDATION_REQUIRED).

| آیتم | شاهدِ امروز | وضعیتِ محلی | چه چیزی برای ارتقا لازم است |
|---|---|---|---|
| A-04 | ۳/۳ + جهشِ کشته | **VERIFIED (E3, single-instance)** | شاهدِ PG برای حالتِ multi-instance |
| A-06 | ۱۸/۱۸ + جهشِ کشته | **VERIFIED (E3)** | — (شاهدِ کافی برای این دامنه) |
| A-18 | ۱۲/۱۲ + جهشِ کشته | **VERIFIED (E3)** | شاهدِ PG برای `sync_conflicts` (مسیرِ PG جدا از JSON) |
| A-20 | ۳۴/۳۴ + ۴۰/۴۰ + ۱۸/۱۸ + جهشِ کشته | **VERIFIED (E3)** | شاهدِ دو-نمونه‌ای PG (`phase2-occ-multi`) |
| A-21 | ۱۶/۱۶ + جهشِ کشته | **VERIFIED (E3)** | — |
| A-24 | ۷ اجرا مثبت + ۳ NOT-RUN + ۲ BLOCKED | **VERIFIED (E3) برای لایهٔ کلاینت/سینک؛ `REVALIDATION_REQUIRED` برای لایهٔ PG و «only main» که کهنه شد** | PG live + تصحیحِ متنِ legacy (§۶-۱) |
| A-25 | فقط mock/static؛ ۲ BLOCKED | **NOT VERIFIED — BLOCKED (real PG)** | یک اجرای `DATABASE_URL` + `outbox-lease-race-live` |

**اقدامِ مشخصِ بعدی (به‌ترتیب):**
1. تصمیم دربارهٔ پرچمِ P0-1 (§۶-۲) — مالک/control-plane، نه چت.
2. اگر `DATABASE_URL`/PG در محیطِ دیگری موجود است: `phase2-outbox-failover`، `outbox-lease-race-live`، `sync-occ-adversarial-live`، `sync-replay-adversarial-live` و `phase2-occ-multi` — همان پنج اجرایی که امروز BLOCKED شدند — تنها چیزی هستند که A-25 و بخشِ PGِ A-18/A-20/A-24 را می‌بندند.
3. برای ثبتِ رسمی، شاهد باید در **همان SHAی منجمد** بازتولید و کامیت شود (نه از این worktree)؛ فرمان‌ها و sha256 همه در `WRITE_DOMAIN_RESULTS.tsv` آماده است.
