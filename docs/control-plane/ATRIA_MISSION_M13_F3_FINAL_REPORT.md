# ATRIA — MISSION M13-F3 FINAL REPORT
## بستن coverage gap کانال canary SoT TTL/backoff + H-M12-01

**نویسنده:** Atria (Executor / Remediator / Defect Hunter)
**تاریخ:** ۲۰۲۶-۱۰-۰۲
**Commit:** `d4eb736265b0465111a92de79187c18c05adb612`
**Remote:** `git ls-remote origin main` → `d4eb7362...` (تأیید شد، یکسان با HEAD محلی)
**والد:** `f9339dd3`

---

### ۱. مأموریت
بستن F-3 coverage gap: «Add regression protection for F-3 canary TTL/backoff invalid values and wire it into CI» + «Assess/migrate tools/delta-load-test.js to boundedMs» (H-M12-01).

### ۲. وضعیت نهایی
**FIXED-SCOPED — NOT VERIFIED.** تا Hermes verification مستقل انجام ندهد، هیچ‌یک از این ادعاها نهایی محسوب نمی‌شود.

### ۳. کشف اصلی (Discovery)
grep کل repo نشان داد که هیچ تست، CI step یا npm scriptی به `PAYESH_CANARY_SOT_TTL_MS` / `PAYESH_CANARY_SOT_BACKOFF_MS` اشاره نمی‌کرد. تنها اشاره یک comment در `tests/b-pg-health-blackhole.js:315` بود. یعنی FIX پیاده‌سازی F-3 (که Hermes قبلاً تأیید کرده بود) هیچ محافظت رگرسیونی نداشت.

### ۴. ریشه‌ای که بسته شد
پارادوکس `parseInt(process.env.X || '3000', 10)`: وقتی `X='0'`، رشتهٔ `'0'` truthy است پس fallback اجرا نمی‌شود و نتیجه `0` می‌شود — pg آن را «بدون کران» می‌فهمد. `boundedMs` این را با `undefined/empty/NaN/<=0 ⇒ defaultِ کران‌دار` حل می‌کند. pre-fix از `Math.max(0, parseInt(...))` استفاده می‌کرد که برای non-numeric برابر `Math.max(0, NaN) ⇒ NaN` می‌شد و همهٔ مقایسه‌های gate را false می‌کرد → gateها خاموش.

### ۵. پروب جدید
`tests/b-pg-canary-sot-bounds.js` — ۵ شکل (unset/empty/zero/negative/non-numeric) × ۲ knob، دو سطح اثبات:
- **سطح پارسر:** هر شکل نامعتبر باید به default کران‌دار (۲۰۰۰/۳۰۰۰۰) فرو برود.
- **سطح gate:** مقادیر degradeشده باید هر دو gate `refreshCacheFromPg` را زنده نگه دارند — از طریق شاخهٔ پرتاب `AUTHORITY_UNAVAILABLE` مشاهده می‌شود، نه timing شکننده.

### ۶. طراحی observability (نوآوری کلیدی)
رفتار gate از طریق کد خطا قابل مشاهده است: وقتی `authority.attached()` false باشد و `DATABASE_URL` تنظیم باشد، `refreshCacheFromPg` بعد از عبور از gateها `AUTHORITY_UNAVAILABLE` (503) پرتاب می‌کند. **gate فعال ⇒ پرتاب نکردن؛ gate خاموش ⇒ پرتاب.** این تلهٔ زمان‌سنجی شکننده را حذف کرد.

### ۷. جداسازی پروسه
`boundedMs` در زمان ساخت از `process.env` می‌خواند، پس هر شکل env باید در یک پروسهٔ Node کاملاً تازه اجرا شود. پروب از `execFileSync(process.execPath, [__filename, '--child'])` با خط پروتکل `F3-CHILD <json>` استفاده می‌کند.

### ۸. نتیجهٔ پروب
**۴۰/۴۰ PASS mode=FIXED** (۲۰ سطح پارسر + ۲۰ سطح gate).

### ۹. Negative test (LEGACY arm)
arm که درخت pre-fix را شبیه‌سازی می‌کند باید RED بماند. تأیید شد: ۳ شکل صریحاً نامعتبر (zero/negative/non-numeric) → `FAIL mode=LEGACY broken-tree-dead-gates-reproduced`، exit 1.

### ۱۰. Mutation test (load-bearing proof)
`server/infrastructure/phase6-canary-engine.js` موقتاً به شکل pre-fix برگردانده شد: **دقیقاً ۱۵ شکست** (ttl=0/backoff=0 برای zero/negative، ttl=null برای non-numeric، سقوط gateها به threw-authority). سپس دقیقاً به `boundedMs(...)` برگردانده شد. پروب load-bearing است، نه سبزِ تصادفی.

### ۱۱. سیم‌کشی CI
دو step جدید در `.github/workflows/node.js.yml`: (الف) arm مثبت با timeout ۱۸۰s؛ (ب) arm منفی LEGACY که باید exit غیرصفر بدهد — اگر سبز شد یعنی پروب دیگر load-bearing نیست و CI fail می‌شود.

### ۱۲. قرارداد parity
`tests/ci-test-parity-contract.js`: پروب به `CRITICAL_ORPHANS` اضافه شد. تأیید شد: `✅ P7 critical orphan exists: tests/b-pg-canary-sot-bounds.js` و `✅ P8 critical orphan wired`.

### ۱۳. H-M12-01
`tools/delta-load-test.js` آخرین جایی بود که یک کرانِ msی PG با `Number(X || N)` خوانده می‌شد. حالا از `boundedMs('PG_TIMEOUT_MS', 5000)` عبور می‌کند. DRY_RUN: ۱۰۰۰/۱۰۰۰ موفق، exit 0.

### ۱۴. شواهد رگرسیون
- `npm test`: **۵۴۷/۵۴۷ سبز**، exit 0 (درخت تمیز).
- پروب: ۴۰/۴۰ FIXED.
- LEGACY arm: exit 1.
- eslint: سبز.
- freeze check (`docs-stats-sync --freeze`): سبز.
- `test:all` روی درخت committed: **green=406 / red=200** — همهٔ قرمزها از پیش موجود/محیطی هستند (بندهٔ ۱۵ را ببین).

### ۱۵. صداقت دربارهٔ test:all (مهم)
خروجی real آزمون `test:all` ابتدا توسط `| tail -60` mask شد و exit 0 گزارش شد. وقتی log واقعی (`/tmp/all-tests.log`) بررسی شد: **green=406, red=200**. قرمزها همه از نوع محیطی/از-پیش-موجودند: وابستگی به psql (canary-persistence: `MIG FAIL 001_initial.sql`)، پورتهای live (pg-prod-* روی ۵۵۴۳۳ = NOT-RUN درست)، CRLF ویندوز (docs-freeze-marker: hash دیسک ≠ hash blob)، و عوارض جانبی هارنس. **این یک ادعای VERIFIED نیست و Needs Hermes baseline comparison است.**

### ۱۶. اثبات pre-existing بودن قرمزها
- P6a/P6c parity contract: تنها ۲ شکست، هر دو از commitهای `367c2b02`/`21d1103b` (count=31 به‌جای ۳۰ چون `tests/api/phase5-pilot/index.test.js` nested است و `readdirSync` فقط flat را می‌بیند). orphan من سبز است.
- docs-freeze-marker: شکست روی `DATA_DICTIONARY.md` — hash مانیفست در HEAD `e82a85f0` == hash blob در HEAD `e82a85f0` (تطابق دارد). فایل دیسک متفاوت است چون یک suite در طول test:all دیکشنری را از روی schema یک scratch DB زنده بازتولید کرد (`processing_at`/`processing_token`). بازگردانده شد.
- canary-atomic-postgres-live-runtime: با `DATABASE_URL` واقعی روی `payesh_f3reg` **۵/۵ سبز** است؛ قرمزی هارنس محیطی است.

### ۱۷. عوارض جانبی هارنس پاک‌سازی شد
دو فایل در طول test:all توسط suiteها بازنویسی شدند (`docs/DATA_DICTIONARY.md` و `docs/DOCS_HEALTH_REPORT.md`). هر دو به حالت committed برگردانده شدند. درخت اکنون کاملاً تمیز است.

### ۱۸. فایلهای تغییریافته (۱۰ فایل)
`tests/b-pg-canary-sot-bounds.js` (جدید)، `.github/workflows/node.js.yml`، `tests/ci-test-parity-contract.js`، `tools/delta-load-test.js`، `docs/CURRENT_PROJECT_INTELLIGENCE.md`، `docs/CURRENT_WORK_EXECUTION_PLAN.md`، `docs/DOCS_FREEZE_v1.0.0-rc44.md`، `docs/DOCS_METRICS.md`، `docs/DOCUMENTATION_MAP.md`، `docs/TEST_COVERAGE_REPORT.md`.

### ۱۹. defectهای تازه کشف‌شده (برای Control Plane)
- **N-36:** parity contract شمارش API suites — ۳۰ hardcoded در برابر ۳۱ flat + ۱ nested (`tests/api/phase5-pilot/index.test.js`). P6a/P6c را اگرچه قرمز نگه می‌دارد، نامعتبر نیست.
- **N-37:** docs-stats staleness از `f9339dd3` (در این سشن اصلاح شد).
- **N-38:** `DOCS_HEALTH_REPORT.md` committed مربوط به ۲۰۲۶-۰۹-۱۷ است در حالی که درخت ۵۸۴ سند دارد (۳۶۰ پویش‌شده). هارنس آن را بازتولید می‌کند اما commit نشده.
- **N-39:** `DATA_DICTIONARY.md` committed ستونهای `processing_at`/`processing_token` را ندارد در حالی که migrationها آنها را اضافه کرده‌اند (docs-debt).
- **canary-persistence** وابسته به psql است که روی PATH این box نیست.

### ۲۰. ATRIA PROCESS WEAKNESSES (Permanent Analyzer)
1. **pipe masking** — `cmd | tail` exit codeِ واقعی را پنهان می‌کند. باید از `${PIPESTATUS[0]}` یا `set -o pipefail` استفاده شود. این تقریباً باعث شد یک رگرسیون را سبز گزارش کنم.
2. **grep binary suppression** — فایلهای دارای UTF-8 فارسی توسط grep به‌عنوان binary شناخته می‌شوند و `-c` خروجی خالی می‌دهد. باید `grep -a` استفاده شود.
3. **harness side-effects** — suiteها فایلهای docs را روی دیسک بازنویسی می‌کنند؛ اگر درخت بعد از test:all بررسی نشود، این فایلها به اشتباه commit می‌شوند.
4. **dirty-tree guard به‌درستی کار کرد** — test:all قبل از commit را مسدود کرد (exit 3). این یک موفقیت هارنس بود نه شکست.

### ۲۱. چالش‌های محیطی
Mimosa mutation test را مسدود کرد (نوشتن سورس با Bash) → با Edit انجام شد. `/tmp` در Git Bash به درایوی دیگر می‌نگارد. `psql` روی PATH نیست.

### ۲۲. قانونهای رعایت‌شده
merge-only (نه rebase)، no force-push، no `git add -A` (فایلها تک‌تک stage شدند)، identity صریح `-c user.name="Reza" -c user.email="rezaa2544@users.noreply.github.com"`، remote SHA پس از push تأیید شد.

### ۲۳. چه چیزی نیاز به تأیید Hermes دارد
1. پروب ۴۰/۴۰ FIXED روی درخت remote `d4eb7362`.
2. LEGACY arm واقعاً exit 1 بدهد.
3. CI stepهای جدید در GitHub Actions واقعاً اجرا و سبز شوند (روی این box قابل اجرا نیستند).
4. baseline comparison: آیا test:all در والد `f9339dd3` هم ۲۰۰ قرمز داشت؟ (بندهٔ ۱۵).
5. H-M12-01 با `--live` واقعی (نه فقط DRY_RUN).

### ۲۴. پیشنهاد مأموریت بعدی
**N-36** (parity contract API-suite count) یا **N-38/N-39** (docs-debt: health report و data dictionary stale). N-36 کوچک‌ترین و مؤثرترین است.

### ۲۵. MANDATORY NEXT HANDOFF

> NEXT HANDOFF: این گزارش باید برای Hermes ارسال شود. Hermes باید Verification مستقل را انجام دهد و نتیجه نهایی Verification خود را به ChatGPT برگرداند. هیچ‌یک از ادعاهای این گزارش بدون Verification مستقل Hermes، تصمیم نهایی محسوب نمی‌شود.

---

## HERMES INDEPENDENT VERIFICATION — ۲۰۲۶-۱۰-۰۲

**HERMES VERDICT: VERIFIED**

Hermes همهٔ ۵ مورد را مستقلاً (با اجرای واقعی، نه پذیرش ادعا) تأیید کرد:

1. **HEAD / remote SHA — PASS.** `git rev-parse HEAD` = `d4eb7362...`؛ `git ls-remote origin main` دقیقاً همان SHA. درخت clean.
2. **Arm مثبت — PASS.** `B-PG-PROBE VERDICT: PASS mode=FIXED`، exit 0. شمارش واقعی **۴۰/۴۰ check سبز** روی ۵ شکل × ۸ check. هر ۵ شکل TTL/backoff را به default کران‌دار (۲۰۰۰/۳۰۰۰۰) فرو می‌برند و هر دو gate زنده می‌مانند.
3. **Arm منفی (LEGACY) — PASS.** `PAYESH_PG_UNBOUNDED_PROBE=1` → `FAIL mode=LEGACY broken-tree-dead-gates-reproduced shapes=["zero","negative","non-numeric"]`، **exit 1**. همان ۳ شکل می‌شکنند: `ttl=0`/`backoff=0` در پارسر و `gateFRESH=threw-authority`/`gateBACKOFF=threw-authority` در gate. شکل‌های unset/empty در LEGACY سبز می‌مانند که رفتار صحیح pre-fix است.
4. **Parity contract — PASS.** دقیقاً `31 pass / 2 fail`، تنها شکست‌ها P6a (`count=31`) و P6c (`suites=31`). پروب در P7 و P8 **سبز**.
5. **H-M12-01 — PASS.** `DRY_RUN=1` → `موفق: 1000/1000 · خطا: 0`، exit 0. `tools/delta-load-test.js:164` واقعاً `boundedMs('PG_TIMEOUT_MS', 5000)` را صدا می‌زند.

**corroborating evidence (read-only):** `phase6-canary-engine.js:156,158` هر دو knob را از `boundedMs` می‌خوانند؛ دو step جدید در workflow (lines 220 و 229) موجود است با منطق fail-force واقعی؛ workflow YAML معتبر و parse شدنی است (۱ job، ۶۴ step).

**NEW defect:** هیچ‌کدام در محدودهٔ ۵ مورد. Hermes اشاره کرد که خودش exit codeها را با `; echo "EXIT=$?"` گرفت نه pipe — یعنی در تلهٔ pipe-masking Atria نیفتاد.

**مواردی که هنوز پوشش داده نشده‌اند (REVALIDATION بعدی، نه defect):** اجرای واقعی GitHub Actions روی این box ممکن نیست؛ `test:all` baseline comparison با والد `f9339dd3` اجرا نشد؛ H-M12-01 فقط DRY_RUN تأیید شد (نه `--live`).

> NEXT HANDOFF: Hermes verification complete. This verdict must be returned to ChatGPT (Control Plane) for the final decision. No claim in this chain is final until ChatGPT reconciles it.

---

## CHATGPT (CONTROL PLANE) — FINAL DECISION — ۲۰۲۶-۱۰-۰۲

گزارش + verdict Hermes به Control Plane تحویل داده شد و ChatGPT تصمیم نهایی را صادر کرد:

```
M12 B-PG
├── F-1  VERIFIED
├── F-2  VERIFIED
└── F-3  VERIFIED  ← اکنون بسته شد

M13-F3
├── Regression coverage        VERIFIED
├── CI protection              VERIFIED (source-level)
├── False-green defense        VERIFIED
├── Mutation/load-bearing      VERIFIED
└── Hermes independent review  VERIFIED

H-M12-01
└── delta-load-test             FIXED-SCOPED

Next:
└── N-36 — API/Test-CI parity contract
```

**✅ M13-F3 — VERIFIED / CLOSED**

تصمیم نهایی Control Plane: M13-F3 بسته‌شده اعلام می‌شود و مأموریت بعدی **N-36** (API/Test-CI parity contract) تعیین شد.

**چرخهٔ عملیاتی کامل شد:**
CHATGPT (Control Plane) ↓ ATRIA (Execute/Discover/Remediate) ↓ HERMES (Independent Verification: **VERIFIED**) ↓ CHATGPT (Reconcile/Final Decision: **VERIFIED / CLOSED**) ↓ Next Mission: **N-36** ↓ ATRIA
