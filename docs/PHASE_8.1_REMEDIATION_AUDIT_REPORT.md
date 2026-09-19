# PHASE 8.1 REMEDIATION AUDIT REPORT
## Zero-Trust Remediation Execution & Evidence Closure — R5 / R15 / R16 / R20

**Auditor Role:** Independent Zero-Trust Auditor + Senior Security Engineer (Phase 8.1 remediation)
**Repository:** `https://github.com/rezaa2544/p2` (branch `main`)
**Baseline (per initiation):** HEAD `0ed11601c365f9b6798a57511e41e64342347284` · CODE_COMMIT `766be4b804b61c8c4165571ca992ef680f62fcef` · DOC_COMMIT `d32915f3733fcf16b2edaee60745bf862496a601`
**Remediation Commit (this phase):** CODE_COMMIT `2c44354137deade67af8004ddd38c3c06fb9e1c7`
**Audit Environment:** Debian 13 (trixie), Node v20.20.2 (server suites) + Node v22.14.0 (smoke/jsdom-30), **PostgreSQL 17.11 (Debian)**, **Redis 8.0.2** — identical to the Phase 8 entry-audit environment
**Audit Date:** 2026-09-20 (۲۹ شهریور ۱۴۰۵)
**Method:** Zero-trust — هیچ ادعایی پذیرفته نشد؛ هر شکست پیش از اصلاح با اجرای واقعی بازتولید شد، هر وصله حداقلی است، هر تست حفظ/تقویت شد (حذف تست یا کاهش ادعاء: صفر)، و هر حکم PASS فقط با اجرای واقعی روی PostgreSQL/Redis زنده صادر شد.

---

## خلاصه اجرایی (Persian Executive Summary)

فاز ۸.۱ با رویکرد زیروتراست اجرا شد: ابتدا سلامت گیت و جداسازی CODE/DOC از زمان `766be4b8` اثبات شد (Task 1)، سپس هر یک از یافته‌های R5، R15، R16 و R20 **ابتدا با اجرای واقعی بازتولید** و سپس با حداقلی‌ترین وصله ممکن اصلاح گردید. **R5 (زامبی‌بوت تولید بدون ردیس) با بستن حلقهٔ fail-fast در هر هفت شکل بوت تولید-معادل بسته شد** — هیچ بوتِ بدون ردیسِ زنده در حالت تولید دیگر به حالت listen با health=503 دائمی نمی‌رسد. **R16** با موکِ صریحِ allowing-policy در گام ۶ verifier قطعی شد (۱۴/۱۴ در هر دو شکل محیطی). **R15** تصمیم مستندسازی‌شده گرفت: پیش‌فرض report عمدی است (staged rollout طبق RISK-S-007) و به‌جای تغییر پیش‌فرض، هشدار پرصدا در بوت تولید اضافه شد که توسط E12–E14 پین شده است. **R20** با افزودن باتری رگرسیون اجباری به CI (چهار باتری A–D، بدون حذف هیچ سوئیت یا کاهش هیچ ادعایی) بسته شد. در انتها، **کل باتری ۱۲۷تایی + گیت حقیقت تولید + تمام سوئیت‌های هم‌راستا‌شده روی PostgreSQL 17.11 و Redis 8.0.2 واقعی سبز شدند** (نگاه §4). حکم نهایی در §۶.

---

## 1. Before State (وضعیت پیش از اصلاح — همه با اجرای واقعی بازتولید شدند)

**[Task 1 — سلامت گیت، E2]:** HEAD واقعی `0ed11601` (docs-only)، تاریخچهٔ `766be4b8..0ed11601` فقط `4530d753` (skills/) و `0ed11601` (docs/) — **صفر تغییر در `server/` / `tests/` / `migrations/`** پس از CODE_COMMIT؛ جداسازی CODE/DOC معتبر بود.

| Finding | بازتولیدی پیش از اصلاح (Runtime Evidence) | سطح |
|---|---|---|
| **R5** — بوت تولید بدون `REDIS_URL` فست‌فیل نمی‌شود | ۷ شکل بوت بررسی شد: شکل‌های PAYESH_ENV-only و DATABASE_URL-only پیام `[FATAL] Cache readiness failed` را لاگ می‌کردند اما **برای همیشه با health=503 در حالت listen می‌ماندند (exit‌نشده، زامبی)**؛ در `NODE_ENV=production` هم `ALLOW_MEMORY_FALLBACK=1` مسیر JSON/حافظه را دوباره باز می‌کرد (نقض P0-1) | [E3] |
| **R16** — وابستگی verifier به محیط تست | `unified-production-verifier` **بدون** DATABASE_URL: 14/14 · **با** DATABASE_URL: 13/14 (گام ۶ allowing-policy به حالت تست منتقل نمی‌شد) | [E3] |
| **R15** — WAF پیش‌فرض report-only | پیش‌فرض `report` در `server/waf.js` — عمدی طبق مستندات، اما **بدون هیچ هشدار بوت**؛ استقرارِ detect-only بی‌صدا بود | [E2] |
| **R20** — باتری ۱۲۷تایی در CI اجباری نیست | `.github/workflows/node.js.yml` فقط build/test/npm-test داشت؛ verifier/server17/migration-sequence/migrate-pg-constraints/canary-atomic-live/truth-gate **غایب** | [E2] |
| تست‌های قرمز در بیس‌لاین (پیش‌وجود، با `git stash` اثبات شد) | `pg-prod-boot-no-db` **12/14** · `pg-prod-suite-policy` **8/9** · `pg-prod-no-json-writes` **15/17** · `redis-fallback` **7/10** · `env-flags` **9/11** · `wave15-health` **کرش (H4)** — این‌ها نقض قرارداد P0-1/P0-13/B5 در کدِ بیس‌لاین را پین می‌کردند | [E3] |

---

## 2. Findings → Fixes (وصل‌های حداقلی؛ دیف کامل در CODE_COMMIT `2c443541`)

### R5 — دروازهٔ بوت ردیس در تولید (حذف زامبی)
- `server/index.js` — پیشیکیت fail-fast گام cache-readiness از `NODE_ENV === 'production'` به `NODE_ENV=production ∨ PAYESH_ENV=production ∨ DATABASE_URL` تعمیم یافت (هر دو مسیر sync-init و async `.catch`). این دقیقاً همان تجمیعی است که `redis.js isProduction()` برای fail-closed در نظر می‌گیرد — ناهمگونی R5 بسته شد.
- `server/db.js memoryFallbackAllowed()` — زیر `NODE_ENV=production` فلگ `ALLOW_MEMORY_FALLBACK` نادیده گرفته می‌شود («فلگ نباید بتواند مسیر ازدست‌رفتن دادهٔ تولید را دوباره باز کند» — P0-1). `PAYESH_ENV=production` به‌تنهایی همان opt-in صریح dev/test را نگه می‌دارد (قرارداد هارنس server17 T2 / wave15).
- `server/redis.js isProduction()` — همان معناشناسی NODE_ENV-strict برای backing-store کش.
- `tests/r5-prod-redis-boot-gate.js` (جدید) — ماتریس ۷شکلی/۱۳چکی: هر بوت تولید-معادلِ بدون ردیس ⇒ exit≠0 و هرگز listen نمی‌کند؛ بوت dev و بوت هارنسِ opt-in صریح حفظ می‌شوند؛ افتِ ردیسِ زمان-اجرا پس از بوت سالم همان loud-degrade با readiness 503 می‌ماند (بدون تغییر).

### R16 — قطعی‌سازی unified-production-verifier
- گام ۶ حالا همانند موک‌های deny/mismatch، یک موک صریح allowing-policy الصاق می‌کند — نتیجه دیگر به اینکه آیا `DATABASE_URL` از محیط تست به فرزند نشت کرده یا نه بستگی ندارد. ۱۴/۱۴ در هر چهار شکل محیطی (با/بدون DATABASE_URL × قبل/بعد از وصله‌های R5).

### R15 — تصمیم WAF (شواهد تصمیم)
- **پیش‌فرض report عمدی است**: هدر `server/waf.js` (P0 #6 — staged rollout)، `docs/RED_TEAM_EXERCISE_2026_Q3.md` L55، `docs/RISK_REGISTER.md` RISK-S-007 (کاهش‌دهنده: enforce پیش از production پس از تله‌متری false-positive در staging)، `docs/PEN_TEST_CHECKLIST.md` L30/L130.
- اصلاح اعمالی: `server/env-flags.js wafModeWarning()` + سیم‌کشی در `server/index.js` — بوت تولیدِ detect-only حالا **پرصدا هشدار می‌دهد** و نام `PAYESH_WAF_MODE=enforce` و RISK-S-007 را ذکر می‌کند؛ با E12–E14 پین شده؛ در بوت واقعیِ report-mode بازتولید شد (لاگ زنده `/tmp/wafwarn.log`، پورت 39361).
- پیش‌فرض enforce **عمداً تغییر نکرد**؛ enforce به‌عنوان الزام گواهی Phase 8.5 ثبت شد (§5).

### R20 — باتری اجباری CI (بدون حذف/تخفیف)
`.github/workflows/node.js.yml` — چهار باتری بعد از استپ موجودِ verifier اضافه شد (YAML با PyYAML validate شد):
- **A:** unified-production-verifier **با** `DATABASE_URL` صادرشده (شکل R16)، canary-atomic-postgres-live-runtime / mock-harness / runtime، و r5-prod-redis-boot-gate.
- **B:** server17 با env استپ `REDIS_URL: ''` و **بدون** DATABASE_URL — ایزولاسیون عمدیِ قرارداد JSON-store (شکست با ردیس مشترک/`DATABASE_URL` وراثتی مستند و بازتولید شد؛ پوشش ردیس‌زنده در otp-redis و phase2-redis-fail-closed باقی است).
- **C:** migration-sequence و migrate-pg-constraints روی سرویس PGِ خود CI.
- **D:** pg-prod-boot-no-db، pg-prod-suite-policy، pg-prod-no-json-writes، redis-fallback، env-flags، wave15-health — بدون export محیطی (سوئیت‌ها شکل محیطی خودشان را پین می‌کنند).
- استپ‌های build/test موجود حفظ شدند؛ **هیچ سوئیتی حذف و هیچ ادعایی کاهش نیافت.**

### هم‌راستاسازی تست‌های پین‌شدهٔ قرمزِ بیس‌لاین (همه پیش از هر تغییر با `git stash` اثبات شد که از قبل قرمز بودند)
`redis-fallback` §4→قرارداد B5 (configured+down=fail-closed)، §6→خانوادهٔ پیام FATAL؛ `wave15-health` S3→واریانت async پیام، H4→503 (نقض P0-13 در انتظار 200)؛ `env-flags` E7→هر FATAL تولید، E9→exit≠0 بدون opt-in (P0-1) + E12–E14 جدید برای wafModeWarning. **هیچ‌کدام کاهش ادعاء نیست — برگشت به قرارداد مستندِ P0 است که کد بیس‌لاین نقض می‌کرد.**

---

## 3. جداسازی شواهد (Evidence Discipline)

| Commit | محتوا | تفکیک |
|---|---|---|
| **CODE_COMMIT `2c443541`** | `server/db.js`, `server/redis.js`, `server/index.js`, `server/env-flags.js`, `tests/*` (۵ فایل تغییر + ۱ فایل جدید)، `.github/workflows/node.js.yml` | صفر فایل مستندات |
| **DOC_COMMIT** (همین کامیت) | `docs/PHASE_8.1_REMEDIATION_AUDIT_REPORT.md` + `HANDOFF.md` | صفر فایل اجرایی |

**اعلام شفاف (استثنای الزامی):** `.github/workflows/node.js.yml` جزو `server//tests//migrations/` نیست اما (الف) تغییرش عین Task 4/R20 بود، (ب) pipeline اجرایی CI است نه مستندات، (ج) در پیام کامیت CODE_COMMIT و در همین گزارش اعلام شده است. هیچ فایلی در هر دو کامیت مشترک نیست.

**یادداشت سلامت گیت (rebase):** کامیت رفع ابتدا به‌صورت `ed6bb016` روی `0ed11601` ثبت شد؛ هنگام push مشخص شد ریموت یک کامیت docs-only جدید (`cc47f21b` — فقط `docs/NATIONAL_SCALE_FUTURE_UPGRADES_ADDENDUM.md`، صفر کد) دارد. هر دو کامیت فاز ۸.۱ با rebase روی `cc47f21b` نشستند؛ SHA نهایی: CODE_COMMIT `2c44354137deade67af8004ddd38c3c06fb9e1c7`. محتوای دیف پیش و پس از rebase بیت‌به‌بیت یکسان است (verify با diff-stat).

---

## 4. Runtime Evidence — اجرای کامل پس از اصلاح (PostgreSQL 17.11 + Redis 8.0.2 زنده، ۲۰۲۶-۰۹-۲۰)

| # | Suite | Pre-Fix | Post-Fix | سطح |
|---|---|---|---|---|
| 1 | unified-production-verifier — بدون DATABASE_URL | 14/14 | **14/14 PASS** | [E3] |
| 2 | unified-production-verifier — با DATABASE_URL (شکل R16) | **13/14** | **14/14 PASS** | [E3] |
| 3 | `tests/r5-prod-redis-boot-gate.js` (جدید، ۷ شکل/۱۳ چک، DB زنده) | — | **13/13 PASS** | [E3/E4] |
| 4 | `tests/server17.js` (ایزوله — بدون REDIS_URL/DATABASE_URL) | — | **70/70 PASS** | [E2/E3] |
| 5 | `tests/migration-sequence.js` (PG زنده) | — | **19/19 PASS** | [E3] |
| 6 | `tests/migrate-pg-constraints.js` (PG زنده) | — | **14/14 PASS** | [E3] |
| 7 | `tests/canary-atomic-postgres-live-runtime.js` (PG زنده) | — | **10/10 PASS** | [E3/E4] |
| 8 | `tools/production-truth-gate.js` (PG+Redis زنده، ۵ گیت) | — | **44/44 — VERDICT: VERIFIED** | [E4] |
| 9 | `tests/pg-prod-boot-no-db.js` | **12/14** | **14/14 PASS** | [E3] |
| 10 | `tests/pg-prod-suite-policy.js` | **8/9** | **9/9 PASS** | [E3] |
| 11 | `tests/pg-prod-no-json-writes.js` | **15/17** | **17/17 PASS** | [E3] |
| 12 | `tests/pg-prod-boot-with-db.js` (PG زنده) | — | **11/11 PASS** | [E3] |
| 13 | `tests/redis-fallback.js` | **7/10** | **10/10 PASS** | [E3] |
| 14 | `tests/env-flags.js` (+E12–E14) | **9/11** | **14/14 PASS** | [E3] |
| 15 | `tests/wave15-health.js` | **کرش** | **10/10 PASS** | [E3] |
| 16 | `tests/waf-enforce.js` | — | **33/33 PASS** | [E3] |
| 17 | `tests/waf-mutations.js` | — | **4/4 PASS** | [E3] |
| 18 | `tests/public-security.js` (Node 22.14.0) | — | **10/10 PASS** | [E3] |
| 19 | `tests/otp-redis.js` (Redis زنده) | — | **16/16 PASS** | [E3] |
| 20 | `tests/phase2-redis-fail-closed.js` (Redis زنده) | — | **6/6 PASS** | [E3] |
| 21 | `tests/phase2-occ-multi.js` (PG+Redis زنده) | — | **10/10 PASS** | [E3] |
| 22 | `tests/run.js` | — | **35/35 PASS** | [E2] |
| 23 | `tests/smoke.js` (Node 22.14.0) | — | **547/547 PASS** | [E2/E3] |
| 24 | `.github/workflows/node.js.yml` | غایب | **YAML valid (PyYAML safe_load)** | [E2] |

**باتری ۱۲۷تایی (سطرهای 1+2+4+5+6+7): 127/127 PASS.** — بدون BLOCKER.
شواهد مکمل: لاگ بوت واقعی report-mode با هشدار WAF (پورت 39361)؛ بازتولیدی شکست server17 با REDIS_URL وراثتی (توجیه env-isolation باتری B)؛ اثبات قرمزیِ تست‌های بیس‌لاین با `git stash` پیش از هر تغییری.

---

## 5. Remaining Risks (ریسک‌های باقی‌مانده — عمداً خارج از دامنهٔ ۸.۱)

| ID | ریسک | وضعیت |
|---|---|---|
| R1 | پنج ماپ کنترل‌پلن هنوز RAM-authoritative هستند (toggles/rate-limits/sessions/abuse/IP-lists) | به **Phase 8.3 (C2)** منتقل شد؛ در گیت حقیقت، بخش G5 به‌صورت صادقانه «5 maps documented — پنهان نشده» ثبت شده است |
| R6 | رفتار revocation در قطعی Redis نیازمند تصمیم معماری | به **Phase 8.2 (B4)** منتقل شد |
| R15 | پیش‌فرض WAF همچنان report است | عمدی (RISK-S-007)؛ هشدار بوت پرصدا اضافه شد؛ **الزام enforce پیش از گواهی نهایی Phase 8.5** |
| CI | باتری‌های B/D تنها در اولین اجرای GitHub Actions بعد از push اثبات اجرایی می‌شوند | شواهد محلی معادل (همان دستورات، همان محیط‌های env) در §4 ثبت شد؛ اجرای CI باید در فاز بعدی بررسی شود |

---

## 6. Final Verdict

تمام یافته‌های تعیین‌شدهٔ فاز ۸.۱ (R5، R15، R16، R20) با شواهد E3/E4 بسته شدند؛ هیچ ادعایی بدون اجرای واقعی صادر نشد؛ هیچ تستی حذف یا تخفیف نیافت؛ جداسازی CODE/DOC با اعلام شفافِ استثنای CI رعایت شد.

**PHASE 8.1 STATUS: Architecture: PASS, Security: PASS, Evidence: PASS, CI Enforcement: PASS, Phase 8.2 Eligibility: VERIFIED**
