# M15-01 current-head revalidation — مستندات و شواهد محلی — ۲۰۲۶-۱۰-۱۹

**Mission:** اجرای ترتیبِ صریحِ مالک، M15-01 سپس M15-02 · **HEAD مبنا:** `8f6e7d5f0a823a70a58f85f7803a4d956db350ab` · **شاخه:** `arena/c33a022c-p2`.

## وضعیت و شواهد

- بازپیوندِ ایستای معماری با HEAD و ممیزیِ hot pathها در `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md` ثبت است؛ این کار، اندازه‌گیری زنده نیست.
- شواهدِ route RPS، query plan روی schema جاری، observability/alerting مستقر، و DR restore/failover جاری **NOT RUN** هستند. محیطِ API+PostgreSQL+Redis ایزوله و قابل‌دسترسی از sandbox پیدا نشد؛ Production هدفِ بار نبود و هیچ ترافیکی به آن فرستاده نشد.
- بررسیِ محلیِ اخیر: `DATABASE_URL` و متغیرهای PG/Redis unset؛ Docker/Podman/PostgreSQL/Redis/k6 نصب نیستند. اجرای `npm test` از JSON/in-memory store استفاده می‌کند؛ نتیجه‌اش فقط regression code/harness است، نه evidence دیتابیس یا ظرفیت.
- ایرادهای مستنداتیِ پیدا‌شده بسته شدند: نمایه و release note موجودی ۲۶ مهاجرت (۰۰۱–۰۲۶) را از ادعاهای تاریخی جدا می‌کنند؛ قاعدهٔ ممیزیِ عددِ ۵ میلیون دیگر مقدار معتبر ۲٫۵ میلیون را false-positive نمی‌گیرد. اختلاف شمار وضعیت ریشه‌یابی شد: آمارگیر قبلی فقط ۴۴ فایلِ قفل را «منجمد» می‌شمرد و متادیتا به‌علت fallback نام‌پایه، سه README زیرپوشه را از README ریشه ارث‌بری می‌داد. اکنون مسیرهای زیرپوشه دقیق‌اند و هر دو ابزار با طبقه‌بندی کانونیک ۵۳۰ فعال / ۴۵ منجمد / ۳ زنده / ۲۰ آرشیو هم‌راستا هستند؛ شمارِ نمایهٔ جستجوی تولیدی ۴۰۰۱ توکن است (با ۷۸ سند روزانه)؛ گزارش هماهنگی صفر تعارض دارد.

## تصمیمِ وضعیت

**M15-01: BLOCKED / REVALIDATION_REQUIRED** — بازبینیِ ایستا تکمیل است، اما معیارهای عملیاتی بالا بازند؛ این مأموریت DONE/CERTIFIED نیست. **M15-02: NOT STARTED** — طبق ترتیبِ خواسته‌شده تا تکمیل M15-01 نگه داشته شد؛ هیچ عددِ synthetic/برآوردی به‌عنوان ظرفیتِ اندازه‌گیری‌شده ثبت نشد. برای ادامه، محیطِ staging ایزوله و دسترسیِ امنِ لازم باید در اختیارِ اجرا باشد؛ سپس command/input/output/exit/SHA/environment/run-count ثبت شود.

## کنترل‌های محلی

تست‌های مستنداتِ همان نوبت: docs index 75/75، map 23/23 با صفر یتیم، onboarding 30/30، maintenance 45/45، handoff 4/4، docs health 9/9، docs consistency 22/22، docs metrics 25/25، docs metadata 18/18 و freeze marker 14/14؛ `docs-stats-sync --check --freeze` صفر. `npm test` نیز exit 0 (suite اصلی 39/39، REST API suites 31/31، و smoke 547/547). این سبزی‌ها **هیچ‌یک** جایگزین E3 runtime evidence نیستند.

---

# بستنِ چهار آیتمِ باز + تثبیتِ مجوزِ دائمیِ push/merge (#454 · #443 · #441؛ #433/#434 باز ماندند) — ۲۰۲۶-۱۰-۱۶

**Mission:** رسیدگی/بستنِ Issueهای #454 · #443 · #434 · #433 و PR #441 · **Owner:** OpenCode (executor) · **Control Plane:** کاربر · **HEAD مبنا:** `origin/main` = `31010ebd` · **شاخه:** `docs/session-closeout-2026-10-16`.

## تصمیمِ حاکمیتی (به‌روزرسانیِ H1)

طبقِ دستورِ صریحِ مالک (۲۰۲۶-۱۰-۱۶): از این پس **push و merge به `main`** و **بستنِ issue/PR** بدونِ توقف برای تأیید مجاز است؛ همواره «درست‌ترین راه با کمترین ریسک». نگهبان‌های ضدِریسک دست‌نخورده: force-push ممنوع · بدون token · شواهد + جهش · تأییدِ انتشار با `ls-remote`.

## نتیجهٔ بستن (تصمیمِ کم-ریسک)

| آیتم | اقدام | دلیل |
|---|---|---|
| **#454** ممیزیِ دروازهٔ CI | **بسته** | اصلاحات با PR #465 روی `main@31010ebd` نشست؛ بندهای ۱·۳·۵·۶·۷·۸·۹ رفع/تأیید؛ بند۴ (۱۳ فایلِ skip) بازبینی و **false-positive** تشخیص داده شد؛ بند۲ دروازهٔ طراحی و بند۱۰ کارِ بهداشتی |
| **#443** اولویتِ Control-Plane | **بسته** | خروجی (تثبیتِ اولویت در مستنداتِ کانونیک) با PR #444 **ادغام‌شده** |
| **#441** PR «bounded reads» | **بسته (superseded)** | ۱۰ روز بی‌تغییر + CONFLICTING؛ **تست‌هایش در هیچ دروازه‌ای سیم‌کشی نشده** ⇒ شواهد هرگز در CI اجرا نمی‌شد؛ `n22-hydrate-cap` روی پورت ۵۴۳۳ قفل؛ بدنهٔ `server/db.js` و `server/sync.js` سطحِ ریسکِ tenant-isolation. بازنشانیِ تازه از `main` لازم است (شاخهٔ `m15-04` حفظ شد) |
| **#433** دروازهٔ طراحیِ کش M15 | **باز** + کامنتِ وضعیت | DESIGN ONLY؛ سندِ کانونیک موجود است ولی شاهدِ بازبینیِ مستقل ثبت نشده ⇒ ارتقای وضعیت بدونِ شاهد ممنوع (H14/H17) |
| **#434** اپیکِ M15 | **باز** + کامنتِ وضعیت | اپیکِ بلوغِ سیستم؛ گواهیِ current-head محقق نشده ⇒ بستن = false-green |

## یافتهٔ عملیِ کلیدی

دقیقاً همان الگویِ false-coverage که #465 رفع کرد در #441 زنده بود: تست‌ها **موجود ولی بی‌سیم** ⇒ «TEST EXISTS ≠ TEST RUNS». این باید معیارِ دروازهٔ بستن/ادغامِ PRهای آینده شود.

## عدد سنجیده‌شده (E3 — اجرای واقعی محلی + تأییدِ GitHub)

- `origin/main` = `31010ebd37680e5408e8076bede15354f8a4303f` (mergeِ #465، ادغام‌شده توسط مالک).
- وضعیت پس از اجرا در GitHub بازخوانی شد: #454=CLOSED · #443=CLOSED · #441=CLOSED · #433=OPEN · #434=OPEN.
- شواهدِ سبزِ #465 روی همان HEAD/شاخه: build:check=0 · npm test=0 (smoke ۵۴۷/۵۴۷) · lint=0 · docs-stats-sync --check=0 · migrate-helper --check=0 · docs-freeze-marker=۱۴/۱۴ · zero-suite=۴/۴.

## چه باز ماند

- #433 (بازبینیِ مستقلِ معماریِ کش)، #434 (گواهیِ M15) — عمداً باز.
- بند۴ #454: توصیهٔ registryِ متمرکز برای شمارنده‌های skip در سوئیت‌های بی‌سیم.
- بند۱۰ #454: مهاجرتِ `tools/ft/runs/payesh-sft-005/adapter/tokenizer.json` (۱۱٫۴MB) به artifact store.

## قدم بعدی

1. M15: بازنشانیِ #441 از `main` + سیم‌کشیِ تست‌ها به CI + پارامتریک‌کردنِ پورتِ n22.
2. بازبینیِ مستقلِ `docs/PAYESH_ADAPTIVE_CACHE_ARCHITECTURE.md` ⇒ بستنِ #433.
3. مهاجرتِ `tokenizer.json` به artifact store.

**Status:** `VERIFIED` برای اقدام‌های GitHub (وضعیت بازخوانی شد) · مستندات در همین نوبت به‌روز شد (H11/H12).

---

# Issue #454 — بازممیزی و اصلاحِ دروازهٔ CI/تست — ۲۰۲۶-۱۰-۱۶

**Mission:** بازممیزیِ ده‌بندیِ Issue #454 روی HEAD منجمد و رفعِ مواردِ باز، به‌صورتِ **شاخهٔ پیشنهادیِ ادغام‌نشده** · **Owner:** OpenCode (executor) · **Control Plane:** کاربر · **HEAD مبنا:** `0e389391` = `origin/main` · **شاخه:** `fix/454-ci-test-gate-remediation` (ادغام‌نشده — اصل هشتم §۰).

## چه انجام شد

| بند #454 | وضعیت روی HEAD | اقدام |
|---|---|---|
| ۱ decouple lint | از قبل رفع‌شده (lint آخرین گام، خط ۴۸۷) | بدون تغییر |
| ۲ cascade در strict-verification | **باز** | `if: always()` روی Core tests + `always() &&` روی truth gate |
| ۳ zero-suite در API runner | **باز** | گاردِ fail-closed + `runSuites()` + تستِ رگرسیون |
| ۴ شمارنده‌های skip (۱۳ فایل) | باز | **تعمداً دست‌نخورده** (نیازمند فهرستِ ممیزیِ خارجی؛ ریسک شکستن ۵۹ سوئیت) |
| ۵ ردیف مهاجرت `026` | **باز** | افزودن به `docs/MIGRATION_GUIDE.md` §۸ |
| ۶ صفر-سوئیت در `run-all-tests.sh` | **باز** | `[ "$GREEN" -eq 0 ] ⇒ exit 1` |
| ۷ lint سبز | از قبل سبز | بدون تغییر (۰ خطا · ۱۳۷۱ هشدار ≤ ۱۳۷۹) |

**VERIFIED on current HEAD (`0e389391` + تغییرات) — E3 (اجرای واقعی محلی):** `npm run build:check`=0 · `npm test`=0 (smoke ۵۴۷/۵۴۷) · `npm run lint`=0 · `node tools/docs-stats-sync.js --check`=0 · `node tools/migrate-helper.js --check`=0 (شمارهٔ بعدی ۰۲۷) · `node tests/zero-suite-fail-closed.test.js`=۴/۴ exit 0 · `bash -n scripts/run-all-tests.sh`=0.

**Negative proof (جهش):** حذفِ گاردِ صفر-سوئیت ⇒ تست **exit 1** با سطرِ قرمزِ «empty registry fails closed» و بازتولیدِ همان false-green اصلی (`0/0 سوئیت موفق — بدون خطا ✅`)؛ فایل بایت‌به‌بایت بازگردانده شد ⇒ **TEST VALID**.

**مستندات (H11):** `docs/AI_PROMPT.md` + `CONTRIBUTING.md` در همان نوبت به‌روز شدند.

**OPEN/NEXT:** بندِ ۴ و بندِ ۱۰ نیازمندِ تصمیمِ control-plane · گیتِ `strict-verification` تا بازسازیِ رژیم روی SHA نهایی **سرخ می‌ماند** (fail-closed طراحیی؛ علت: schema پین‌شدهٔ گیت A-30 — `status/requirement/head_sha/reviews/expected_ids/human_governance` — و `head_bound=e4584806`؛ سبزِ مصنوعی ساخته نشد) · یافتهٔ جانبی: `tests/handoff-integrity.js` **کهنه/بی‌سیم** است (به `HANDOFF.md` ریشه اشاره می‌کند که در `2f3b23c3` آرشیو شد؛ روی HEAD قرمز است و به `run.js` سیم‌کشی نشده) · تنها secret موجود `NOTION_API_KEY` است ⇒ `DATABASE_URL` نیست ⇒ truth-gate همواره skip.

**Status:** `FIXED-SCOPED` (نیازمندِ verification مستقل/CI و مجوزِ ادغامِ ناظر).

---

# OpenCode/Atria Bootstrap Reconciliation — 2026-10-06

**Mission:** P0 bootstrap reconciliation + current-head synchronization · **Owner:** Atria (executor) · **Control Plane:** ChatGPT · **HEAD:** `bb0b5fa6` = `origin/main`
**Before:** stale clone on `feat/a11y-rebuild` @ `24cc5e1` (old line; merge-base `458867e`; 977 local-only vs 3064 remote-only commits) → synced via `checkout main` + `reset --hard origin/main` (no tracked work lost; old line preserved on `feat/a11y-rebuild` + `feat/agents-md-activation` @ `081448a`).

**DONE:** `AGENTS.md` ← Atria operating model (roles · Current HEAD Rule · False-Green Law · negative proof · scope/parallel-session discipline · status vocabulary · task-observer activation · N-36 dual-identity warning) · `.claude/skills/payesh-mission/SKILL.md` added (10-phase mission protocol; 2 corrupted strings fixed) · `.gitignore` ← `skill-observations/` · experience memory live (`skill-observations/log.md`, Observations 1–3).

**Verified on current HEAD:** canonical docs ALL PRESENT · N-36 dual identity — original N-36 (API/Test-CI parity) = OPEN/NOT-RUN; N-36/M15-CACHE-PACMA/M15-05 durable invalidation = IMPLEMENTED + VERIFIED on live PG/Redis 2026-10-04 (60/60 tests, produce 511/s, consume 731/s, latency 5ms), completion commit = current HEAD · M15-01 discovery artifact present (scale/reliability gap audit 2026-10-05) · M15-02/03/04/06–09 OPEN · control-plane claim "M15-03 VERIFIED/FIXED-SCOPED" has NO evidence artifact on current main → **NOT VERIFIED** · task-observer activation VERIFIED behaviorally (session-start invoke + observations written this session).

**OPEN/NEXT:** M15-02 identified, NOT started (Control Plane decision) · M15-03 needs evidence or downgrade · parallel-session report `docs/REPORT_OPENCODE_BOOTSTRAP_2026-10-06.md` left untracked (not ours to commit).

---

# Wave 18 — National Load Testing — Handoff

**Date:** 2026-09-12
**Branch:** `feat/wave18-load-test` (بازسازی‌شده روی `main` @ `20ed3e8` — بدون دست‌زدن به شاخه‌های دیگر)
**PR:** [#94](https://github.com/rezaa2544/p2/pull/94) (باز؛ mergeable ✓ — پوش تأییدشده با `git ls-remote`: head `60d85c1`)
**Status:** هر ۵ سناریوی طرح روی محیط production-like سندباکس اجرا و مستند شد
**Author:** rezaa2544

---

## چه ساخته/اجراء شد

- **محیط:** PostgreSQL 17.11 (`payesh_w18`) + Redis 8.0.2 روی یک جعبهٔ ۲vCPU/۲GB؛ دیتاست ملی مقیاس ۰٫۳ (seed=20260912): ‏۳۰٬۰۰۰ مدرسه، ۳۰۰٬۰۰۰ کلاس، ۳٬۰۰۰٬۰۰۱ کاربر، ۱۵M سطر حضور، ۶M نمره (~۷٫۶GB)؛ بارگذاری با `tools/w18-load-pg.sh` (۸m10s)؛ k6 v2.2.0.
- **اجرا:** پنج سناریو (بار ۵۰۰/s، اوج ۲۰۰۰/s، فشار رَمپ ۱۰۰→۵۰۰۰/s، جهش ۵۰۰→۳۰۰۰، سوک ۱۰۰۰/s×۱۵m فشرده) با سوئیتِ ارتقایافتهٔ `tests/performance/suites/national-load-test.js`: استخر ۴۰ مدیر واقعی (`PAYESH_USERS=phone:nid,…`)، نوشتنِ حضور با idهای نشست/دیتاست (نسبت ۸:۱)، envهای `SPIKE_BASE`/`TIME_SCALE`/`MAX_VUS`/`SUMMARY_FILE`. اعداد کامل در `docs/WAVE18_LOAD_TEST_REPORT.md`.
- **سه یافتهٔ معماری (ریشه‌یابی کمّی + رفع/پیشنهاد):**
  1. بوتِ PG-live با هیدراتاسیون کامل جداول ⇒ OOM گارانتی‌شده (۲۴M سطر). رفعِ اعمال‌شده: envهای `PAYESH_PG_HYDRATE_LIMIT=tbl:cap` / `PAYESH_PG_HYDRATE_SKIP` در `server/db.js` (پیش‌فرض = رفتار قبلی؛ `server/index.js` لاگ capped/env-skipped).
  2. هزینهٔ حافظهٔ هر درخواستِ هم‌زمان ~۱MB (سنجش ۳۵۰-موازی: ۳۱→۳۴۶MB) — عاملِ اصلی: snapshotِ `JSON.parse(JSON.stringify(store[c]))` به‌ازای هر sync (O(collection) نه O(batch)). پیشنهادِ ثبت‌شده در گزارش §۵-۲.
  3. رشدِ نامحدودِ آینهٔ store در مسیرِ نوشتن (۱۰,۴۸۸B/نوشتن سنجیده شد) + auth با اسکن خطی و بدونِ ایندکس `users.phone`.
- **نتیجهٔ سلامت:** صفر خطای نوشتن در هر ۵ سناریو (۱۹٬۰۴۲ sync اتمیک؛ پس از هر مرگِ OOM، بازشماریِ PG سالم). سقفِ تک‌جعبه ~۶۳۰rps؛ مرگِ OOM فقط در فشارِ پایدار ۳×+ (exit 137، بازیابی با ری‌استارت).
- **تست‌ها:** `wave18-load` ‏38/38 · `wave18-stress` (جدید) ‏34/34 · `wave18-spike` (جدید) ‏22/22 · گیت‌های پایه پس از تغییرات: smoke ‏547/547 · check-authz ‏0 · secret-scan ‏11/11 · build --check ✓.

## محدودیت‌ها — ادعای سبز نشود

- سوکِ ۲۴h واقعی اجرا نشد (۱۵m فشرده زیر ۶٫۸× اضافه‌بار)؛ فشار ۵۰۰۰ به‌صورت iter/s عرضه با سقفِ مولد ۳۰۰ VU اعمال شد (۵۰۰۰ VU روی جعبهٔ مشترک بی‌معنا بود).
- مولد و سرور و PG روی یک جعبه بودند ⇒ اعداد، حدِ پایینِ سیستم‌اند؛ اعدادِ ۱۰M/۲۰k-rps نیازمند استیجینگِ مجزای چندنمونه‌ای طبق §21 طرح‌اند.
- `users.phone` هنوز ایندکس ندارد؛ `public-report` از آینهٔ مقیّد محاسبه می‌شود (تقریب) — هر دو در گزارش §۵ با پیشنهاد ثبت شد.
- واگرایی ابعاد مولد دیتاست با §۲.۱ طرح بار (قلم ۲ `docs/DOCS_CONSISTENCY_REPORT.md`) همچنان باز.
# Wave 10 (نوبتِ چهارم · ادامه) — مانورِ مقیاس ۲۵M + دو فیکسِ بحرانیِ ۰۰9 — Handoff

**Date:** 2026-09-12 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این ادامه چه شد

1. **مانورِ مقیاس (باقی‌ماندهٔ ردیفِ ۱۰):** بعد از تحویلِ نوبتِ چهارم، سندباکس
   ریست شد؛ PG 17.11 بازنصب، کلونِ مجدد، db اختصاصیِ `payesh_scale` با
   **۲۵M نمره + 600k حضور** (سقفِ دیسکِ ۲۵GB؛ ۵۰M در محاسبهٔ اولیه جا
   نمی‌شد — همین‌طور مستند شد). اجرای اولِ ۰۰9 رویِ آن **دو یافتهٔ سختِ
   جدید** بیرون کشید که در ۱.۸M سطر دیده نمی‌شدند:
   - **قفلِ FK رویِ جدول‌هایِ والد:** FKهایِ داخلِ CREATE داخلِ تراکنشِ کپی،
     `SHARE ROW EXCLUSIVE` رویِ users/schools/classes/subjects تا کامیتِ
     کپی نگه می‌داشتند ⇒ INSERT روی users **۵+ دقیقه بلاک** (و تفسیرِ
     «فشار WAL» استیجینگ هم اصلاح شد — §۹.۳). `NOT VALID` رویِ partitioned
     ممنوعِ PG 17 است. فیکس: **FK با ALTER رویِ جدولِ خالی قبل از کپی**
     (اعتبارسنجی آنی؛ چکِ سطربه‌سطر حینِ کپی با key-share سطری).
   - **OOMِ کپیِ تک‌تراکنشه:** ~۵۰B حافظهٔ bookkeeping به‌ازایِ هر سطر ⇒
     در ~۱۱M سطر بک‌اند با rss=1.3GB کشته شد. فیکس: **کپیِ chunk-commit با
     PROCEDURE** (هر ۱۵۰k سطر COMMIT؛ ~۷.۵MB حافظه) + **ازسرگیری از
     MAX(id)** — کرش وسطِ کپی ⇒ رانِ بعدی ادامه می‌دهد.
2. **اجرای دوم با ۰۰9 مقاوم‌شده — سبزِ کامل (۲ vCPU/۲GB RAM):**
   مهاجرتِ ۲۵.۶M سطر **۱۹.۶ دقیقه** (~۲۱.۸k سطر/s) · خواندن/نوشتن err=0
   (p50=۱–۲ms) · **نوشتنِ users حینِ کپی ۵.۲ms** · بدترین توقفِ هر دو =
   **پنجرهٔ swap ~۳۶s** (کچ‌آپِ ضدالحاق کلِ جدولِ قدیمی را زیرِ قفل اسکن
   می‌کند — با اندازهٔ جدول مقیاس می‌یابد؛ مسیرِ بهبود: پیشیکیتِ chg؛ ثبت شد)
   · راستی‌آزمایی همه صفر · countNew−countOld=۸۱ (نوشته‌هایِ post-swap) ·
   دفترِ ۱۴۹۵ سطریِ نویسنده کامل درست.
3. **رصدِ post-migration در ۲۵M:** فیدِ chg **۱ms** · واترمارکِ ۱۴ جدول
   ۴ms · اسکنِ سالِ هرس‌شده (۴.۲M سطر) ۱۴۰ms · فول‌اسکن ۶s · مسیرِ زمانی
   ۲.۲s برای ~۲.۱M سطر — فیدِ chg ~۲۰۰۰× سریع‌تر.
4. **تست‌ها:** `tests/partitioning.js` **۵۵ → ۶۱**: U8a/U8b (قراردادِ FK و
   chunk-commit در سورسِ ۰۰9) · L10 (۶ FK رویِ جدول‌هایِ نهایی validated) ·
   L11a/b/c (**قتلِ واقعیِ بک‌اند بعد از اولین چانکِ کامیت‌شده — با
   pg_terminate_backend، نه SIGKILLِ کلاینت که بک‌اند را نمی‌کشد — ⇒ رانِ
   مجدد از مرزِ MAX(id) ازسرگیری و سبز**) · رگرسیونِ نویسندهٔ نشت‌کرده و
   پاک‌سازیِ مستقل از وضعیتِ قبلی. `.down` هم قوی‌تر شد: بازیافت با معیارِ
   جفتیِ (id, created_at) (سطرِ هم‌id/created_at-متفاوت گم نمی‌شود).
5. **یادداشتِ عملیاتی:** کرشِ واقعی وسطِ ساختِ جدول‌ها ممکن است فایل‌های
   یتیمِ ~۷GB روی دیسک بگذارد (pending-deletes گم می‌شود) — روشِ پاک‌سازی
   در ران‌بوکِ §۹.۶ ثبت شد.

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **۶۱/۶۱** · chg_id_cursor **33/33** · wave10-retention
**15/15** · wave10-chg-id **31/31** · wave10-db-scale **26/26** ·
migration-sequence ✓ · docs-consistency ✓ · build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- ۲۵M سقفِ دیسکِ سندباکس بود؛ **۵۰M/۲۸۸M اجرا نشد** — برون‌یابیِ صادقانه:
  ۵۰M ≈ ~۴۰ دقیقه و ۲۸۸M ≈ چند ساعت رویِ همین هاردویر (I/O-bound)؛
  سخت‌افزارِ تولید بهتر است.
- پنجرهٔ swap در ۲۵M ≈ ۳۶s و با اندازهٔ جدول مقیاس می‌یابد (ضدالحاقِ
  کامل‌اسکن زیرِ قفل) — بهبودِ آینده: پیشیکیتِ chg برای کچ‌آپ.
- ازسرگیری در ۲۵M تست نشد (L11 در ۳۲۰k آن را اثبات می‌کند).
- استیجینگ/تولیدِ واقعی همچنان در دسترس نیست؛ همهٔ اعداد از PG 17.11
  محلیِ سندباکس است.

## پی‌آیندهای پیشنهادی نوبتِ بعد

- پیشیکیتِ chg برای کچ‌آپِ فاز C (پنجرهٔ swap را از «اسکنِ کلِ جدول» به
  «فقط سطرهایِ تغییرکرده از شروعِ کپی» می‌رساند).
- اجرای ۰۰9 + فعال‌سازیِ فلگ در تولیدِ واقعی وقتی در دسترس شد (ران‌بوکِ §۹.۶).
- بعد از bake: drop دستیِ `*_old` + پایشِ رشدِ default partition.

---

# Wave 10 (نوبتِ چهارم) — اجرای Partitioning در استیجینگ + Retention سالانه — Handoff

**Date:** 2026-09-12 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این نوبت چه شد

1. **اجرای ۰۰۹ در «استیجینگ» (۱.۸M سطر، ترافیکِ هم‌زمان):** جانشینِ
   استیجینگ = PG 17.11 خودِ سندباکس، دیتابیسِ اختصاصیِ `payesh_staging`
   (grades 1.2M چندساله + attendance 600k؛ seed ~۶۰s). هارنسِ
   `/home/user/staging/` (خارج از مخزن): `seed.sh` · `run-009.js` (خوانندهٔ
   120ms + نویسندهٔ واقعی persistOpsBatch با فلگ روشن، حینِ مهاجرت) ·
   `perf.js` (رصدِ post-migration). سه اجرای کاملِ سبز.
2. **سه یافتهٔ سختِ هم‌زمانی که فقط اجرای واقعی آشکار کرد — هر سه در ۰۰۹
   فیکس شد:**
   - کپیِ تک‌تراکنشه ⇒ نوشته‌های حینِ کپی در `*_old` اسیر + پنجرهٔ قفلِ بلند
     ⇒ **دو تراکنش + کچ‌آپِ ضدالحاق زیرِ ACCESS EXCLUSIVE کوتاه**.
   - تریگرِ chg حینِ کپی رویِ هر سطرِ کپی می‌پرید ⇒ کچ‌آپِ تمام‌جدول ⇒
     **DISABLE/ENABLE دورِ کپی** (chg_id کپی حفظ می‌شود — تستِ L3e).
   - **بازنویسیِ معکوس:** پیشیکیتِ تساویِ chg نوشتهٔ تازهٔ post-swap را با
     کهنهٔ `*_old` برمی‌گرداند (در استیجینگ wrong=1 واقعی دیده شد) ⇒ شرطِ
     تازگی **`p.chg_id >= o.chg_id`** در هر ۶ ضدالحاق (last-writer-wins).
3. **اعدادِ نهایی استیجینگ (run4/run5):** مهاجرت ۵۷–۶۵s · خواندن‌ها err=0،
   p50=۲–۳ms، p95=۸–۱۶ms، **بدترین توقف ۱.۸–۲.۲s** (پنجرهٔ swap) ·
   نوشتن‌ها err=0، p50=۷–۱۱ms، ولی **بدترین کامیت ۴۱–۴۷s** (فشار WAL حینِ
   کپی — توصیه: بازهٔ کم‌ترافیک؛ مستند در §۹.۳) · راستی‌آزمایی همه صفر ·
   ANALYZE داخلِ ۰۰9 بینِ تراکنش‌ها.
4. **رصدِ post-migration (perf.js):** فیدِ chg **۱–۲ms** · واترمارکِ ۱۴
   جدول ۴ms · مسیرِ زمانیِ v2 در پنجرهٔ حجیم ۸۱k سطری ~۱s (فیدِ chg
   ~۵۰۰× سریع‌تر) · اسکنِ سالِ هرس‌شده ۳۰ms.
5. **Retention سالانه (تحویلِ جدید):** `tools/partition-retention.js`
   (fail-closed: dry-run پیش‌فرض · فقطِ `*_y<YYYY>` · default هرگز · سالِ
   جاری/آینده هرگز · بایگانیِ pg_dump پیش از حذف، شکست ⇒ حذف نه) +
   `tests/wave10-retention.js` **۱۵/۱۵** + `infra/cron/partition-retention.cron`
   (ماهانه باِ بایگانی + پیشاهنگِ هفتگیِ dry-run؛ سیاست: ۵ سال).
6. **تست‌ها:** partitioning **۴۲→۵۵** (U7 خاموشیِ تریگر؛ L3e حفظِ chg_id؛
   L9 اسیر/کچ‌آپ/سرگردان؛ L9e-1/2 رگرسیونِ بازنویسیِ معکوس).

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **55/55** · chg_id_cursor **33/33** · wave10-retention
**15/15** · wave10-chg-id **31/31** · wave10-db-scale **26/26** ·
wave10-pgbouncer **22/22** · migration-sequence ✓ · docs-consistency ✓ ·
build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- **استیجینگِ واقعی از سندباکس قابل‌دسترس نیست** — همهٔ اعدادِ §۹ از
  PG 17.11 محلی باِ دادهٔ مصنوعیِ ۱.۸M سطری است؛ همین‌طور مستند شده.
- **۵۰M/۲۸۸M اجرا نشد** — نرخِ کپی ~۳۱k سطر/s ⇒ مرتبهٔ چند ساعت
  (I/O-bound)؛ برون‌یابیِ صادقانه در §۷.۴/§۹.۳.
- سنجهٔ «دلتای ۱h» باِ seed واقع‌گرایانه (updated_at=created_at + ۸۰۰
  ویرایشِ امروز) گرفته شد؛ پنجرهٔ حجیم ۸۱k سطری مصنوعِ تاریخ‌های آیندهٔ
  seed است و همین‌طور برچسب خورده (§۹.۴).
- read-replica همچنان fake-DB.
- PG محلی بین ترن‌ها ریست می‌شود؛ بازسازی: سربرگِ `tests/partitioning.js`
  و §۹.۱ هارنس.

## نکتهٔ اصلاحی نسبت به نوبتِ سوم

`PAYESH_PARTITIONED_TABLES` باید **پیش از** اجرای ۰۰۹ فعال شود (نه پس
از آن) — persistOp رویِ heap هم مسیرِ نو را می‌رود و همه‌چیز idempotent
است؛ در استیجینگ همین‌طور اجرا و تأیید شد (ران‌بوکِ §۹.۶).

## پی‌آیندهای پیشنهادی نوبتِ بعد

- اجرای ۰۰۹ + فعال‌سازیِ فلگ در استیجینگِ واقعی/تولید وقتی در دسترس شد
  (ران‌بوکِ آماده: §۹.۶).
- مانورِ مقیاس ۵۰M+ در محیطِ باِ I/O واقعی.
- پایشِ رشدِ `default` partition (سریع‌الرشد بودنش یعنی سطر خارجِ بازه).

---

# Wave 10 (نوبتِ سوم) — Partitioning زنده + chg_id↔Cursor v3 — Handoff

**Date:** 2026-09-11 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این نوبت چه شد

1. **محیطِ PG زنده:** PostgreSQL 17.11 در سندباکس + role/db `w10`/`payesh_w10`؛
   زنجیرهٔ `001→008` از صفر سبز شد.
2. **مهاجرتِ `012_partition_grades_attendance.sql` (+down):** پارتیشن‌بندیِ
   چهارفازیِ grades/attendance (RANGE(created_at) سالانه + default؛ PK ⇒
   (id, created_at)؛ کپیِ دسته‌ایِ ۵۰k؛ swap یک‌تراکنشی با حفظِ نام‌های
   ایندکس/سکوئنس؛ `*_old` برای rollback، `*_recovered` در down). سه اصلاحِ
   مهمِ دیباگ: حذفِ ۳ ستونِ غیرواقعیِ grades (زنجیرهٔ مهاجرت مرجع است، نه
   schema اپ) + دو ایندکسِ جاافتادهٔ ۰۰۲ (`school_class_date`،
   `school_student_subject`) + رقصِ rename کامل.
3. **رفعِ مسدودکنندهٔ persistOp** (`server/db.js`): جدولِ در
   `PAYESH_PARTITIONED_TABLES` ⇒ UPDATE→INSERT→23505→UPDATE-retry؛ مسیرِ
   legacy دست‌نخورده. خروجیِ `isPartitionedTable` هم export شد.
4. **اتصالِ chg_id به کرسرِ v3:** `cursor.js` (sign سه‌پارامتری + verify) ·
   `pull.js` (`captureChgWatermark` pre-read + مسیرِ byChg بدونِ time-guard +
   `chg_watermark` در پاسخ) · `syncdelta.js` (`CHG_TABLES`).
5. **دو باگِ coercion که تست‌ها گرفتند:** `sign(…,null)` می‌ساخت cw=0 (فیدِ
   chg از صفر!) و `verify` با `Number([1])`/`Number(true)` عبور می‌داد — هر
   دو فیکس + رگرسیون.
6. **تست‌ها:** `tests/partitioning.js` **۴۲/۴۲** (واحد ۱۶ + زندهٔ ۲۶ روی
   PG با فیکسچرِ 180k: پریتی، EXPLAIN pruning، وارون‌سازی) ·
   `tests/chg_id_cursor.js` **۳۳/۳۳** (جدید) · MR1/M17 فاز ۴ به v3+cw
   مهاجرت شد.

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **42/42** · chg_id_cursor **33/33** · wave10-chg-id **31/31** ·
wave10-db-scale **26/26** · wave10-pgbouncer **22/22** · delta-phase4 **23/23**
(+ جهش **20/20**) · delta-sync-hardening **19/19** · contract-layers **18/18**
· pull-bootstrap **12/12** · pull-to-refresh **15/15** · wave3-keyset **13/13**
· migration-sequence ✓ · build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- **۵۰M/۲۸۸M در سندباکس اجرا نشد** — فیکسچرِ 180k + زمان‌سنجی
  (~۳۵k سطر/s کپی) + برون‌یابیِ مستند (۵۰M ≈ ۲۴ دقیقه؛ فقط مرتبهٔ بزرگی).
  `docs/WAVE10_DB_SCALE.md` §۷.۴.
- read-replica همچنان fake-DB (تأییدِ نهایی موعودِ استیجینگ).
- ۰۰۹ روی استیجینگ/تولید هنوز اجرا نشده — پیش‌نیازِ فعال‌سازی: تنظیمِ
  `PAYESH_PARTITIONED_TABLES=grades,attendance` **فقط پس از** اجرای ۰۰۹.
- PG زندهٔ سندباکس بین ترن‌ها پاک می‌شود؛ راه‌اندازیِ تکرارپذیر در
  `tests/partitioning.js` سربرگ + `docs/WAVE10_DB_SCALE.md` §۷.

## پی‌آیندهای پیشنهادی نوبتِ بعد

- اجرای ۰۰۹ بر استیجینگ با دادهٔ واقعی + `ANALYZE` پس از کپی.
- فعال‌سازیِ `PAYESH_PARTITIONED_TABLES` در compose استیجینگ + پایشِ
  متریک‌های pool پس از تعویض.
- retention سالانهٔ پارتیشن‌ها (detach/drop سال‌های قدیمی با تأییدِ وزارتی —
  طراحی در §۳ نوبتِ دوم).
- کلاینت: نمایشِ سنجهٔ `chg_watermark` در پنل دیباگِ سینک (اختیاری).

---

# Bug Hunt Session 8 / Wave 9 — Handoff

**Date:** 2026-09-11
**Branch:** `feat/bughunt-session8-wave9`
**Status:** Performance fixes complete; delivery gates/documentation in progress
**Code-fix HEAD:** `685f935`
**Author:** rezaa2544

---

## Completed in this session

- Eight independent performance/resource fixes were completed with red regression, fix, mutation test, and separate Conventional Commit: `062fbe3`, `324eec8`, `8f45f54`, `d4fc168`, `6035028`, `dd2d7eb`, `6aeb5ba`, `e54b998`.
- Wave 8 outbox mutation-fixture drift was repaired in `685f935`; final `wave8-outbox` is 14/14 and its mutations are 5/5.
- Fast gates are green: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 9 39/39.
- Session 8 regressions total 38/38 checks across the eight suites; all 16 Session 8 mutants were killed and every baseline was restored green.
- Detailed evidence: `docs/WAVE9_SESSION8_PERFORMANCE.md`; cumulative report: `docs/BUG_HUNT_REPORT.md`.

## Explicit limitations — do not report as green

- `tests/wave8-deep-audit.js` is missing from the repository; running it produced `MODULE_NOT_FOUND`.
- `scripts/run-all-tests.sh` did not reach a final total during the clean attempt because stale/overlapping runner processes were stopped after the tool window. Partial legacy reds remain unaccepted; no full-suite green claim is made.
- Local Node is v20.20.2 while the package engine requests >=22; the fast gates run but retain that environment warning.
- Ruflo is not installed in the sandbox. The requested key `bug_hunt_session8` is pending; no fabricated memory-write result exists.

## Delivery status

- Fast gates were repeated after the documentation commit: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 8 outbox 14/14 + mutations 5/5, and Wave 9 39/39.
- With temporary authentication, `feat/bughunt-session8-wave9` was pushed successfully; the permanent remote remains credential-free.
- PR created: `https://github.com/rezaa2544/p2/pull/75` with title `fix: bug hunt session 8 (wave 9 performance)`.
- Fallback bundle remains verified at `/home/user/bandle/bug-hunt-session8-wave9.bundle`; 24 credential-free patches are in `/home/user/bandle/patches/`.
- Ruflo registration `bug_hunt_session8` is pending because `ruflo` is not installed; no fabricated memory result is recorded.

---

# Historical handoff — Wave 19 Chaos Residuals

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report

---

# Handoff — Wave 18 National Load Testing

**Date:** 2026-09-12
**Branch:** `feat/wave18-national-load-test`
**Status:** Staging run complete; national capacity **not** measurable on this hardware
**Full report:** `docs/WAVE18_LOAD_TEST_REPORT.md`

---

## What was actually run

Five k6 scenarios (k6 v2.2.0) against a real staging stack — PostgreSQL 17 (90
tables), the Node API, and a regenerated `scale=0.001` national dataset:

| scenario | rps | p95 | HTTP fail | writes | write_errors |
|---|---:|---:|---:|---:|---:|
| load   | 106.3 | 248.8 ms | 0% | 533 | 0% |
| peak   | 20.3  | 147,345 ms | **19.07%** | 58 | 0% |
| stress | 357.3 | 1,417.9 ms | 0% | 8,119 | 0% |
| spike  | 236.9 | 1,596.6 ms | 0% | 855 | 0% |
| soak   | 81.9  | 270.8 ms | 0% | 467 | 0% |

Raw exports are committed at `tests/performance/results/w18-*.json` and are
reproducible via `tools/wave18-summarize-results.py`.

## Failure found — peak killed the server (OOM)

At a 60 rps target the API process was killed by the OOM killer
(`anon-rss ≈ 911 MB`). Symptoms observed in that session:

- `dmesg`: `Out of memory: Killed process (node) total-vm:13211364kB, anon-rss:911480kB`
- `api.log`: `[DB] Query execution error: timeout exceeded when trying to connect` (x9)
- k6: `Error: logi…` — `setup()` login failed because the API was already dead

**Provenance warning:** the sandbox rebooted afterwards (uptime ~101 s), so the
`dmesg` ring buffer and `/var/tmp` are gone. Those three lines were read and
recorded during the run but **cannot be re-verified today**. What remains
independently verifiable is the committed k6 JSON. Re-running peak requires
rebuilding staging via `infra/wave18-loadtest/staging-bootstrap.sh`.

## Explicit limitations — do not report as green

- **National capacity (20,000 rps) was not measured and cannot be on this box.**
  2 vCPU / 1984 MB, with the load generator, the API and PostgreSQL all sharing
  those 2 cores. Failure appeared around 60 rps — three orders of magnitude
  below target. The numbers above validate the harness, not the system.
- `write_errors = 0%` in **peak is not evidence of write-path resilience**: only
  58 writes reached the server before it died (vs 8,119 in stress).
- A prior interim report quoted **1099 as "interrupted iterations"**. That was
  wrong: 1099 is `vus_max`. The correct metric is `dropped_iterations = 2346`.
  The console figure itself is not persisted in the export.
- The dataset generator still emits **no `enrollments`** (0 rows) even though
  `server/policy.js` requires one for every teacher-scoped write. The loader
  derives them from `attendance × classes` as a workaround; the generator itself
  is still unfixed.
- Generator-vs-plan dimension divergence (item 2 of `docs/DOCS_CONSISTENCY_REPORT.md`)
  remains open.

## Two false greens fixed in the harness

1. `SCENARIO=peak` built **no scenario at all** — every condition was false, so
   `options.scenarios` was `{}` and k6 ran `setup()` once. It reported
   "40.3 rps, 1 write, all thresholds green" while measuring nothing. Proof:
   `k6 inspect -e SCENARIO=peak` → `"scenarios": {}`. Fixed by adding
   `peak_standalone` plus a guard that rejects unknown `SCENARIO` values.
2. `spike` never executed: `preAllocatedVUs=200` was fixed while
   `maxVUs = SPIKE_VUS * 2`, so any `SPIKE_VUS < 100` aborted with
   `maxVUs can't be less than preAllocatedVUs` (exit 104).

## Tests status (final, on the committed tree)

- `node tests/wave18-load-test.js` — 38/38, exit 0
- `node tests/secret-scan.js` — **12/12** (was 11; new negative control), exit 0
- `node tests/check-authz.js` — 6 checks, all green, exit 0
- `node build.js --check` — 394 actions (199 writers), full match, exit 0
- `node tests/smoke.js` — 547/547, exit 0

`secret-scan` initially failed 10 green / 1 red on six sha256 values in
`data/national/scale-0.001/stats.json`. Those are the dataset's own file
checksums (all 6 verified against real file hashes; the generator is
deterministic), and `T7d` of `tests/wave18-load-test.js` requires that field.
The allowance is narrow (`"<name>.csv": "` only), the logic now lives in a named
`hexAllowed()` shared by the scan loop and a 14-case negative control, and a
mutation check confirms the control exercises the same code path.

## Next steps

1. Re-run peak/stress on real staging with separate hosts for generator and DB
   before quoting any capacity number.
2. Fix `enrollments` in `tools/generate-national-dataset.js` itself.
3. Profile API memory growth under load (`anon-rss ≈ 911 MB` at OOM looks low
   for the target load, but this hardware cannot yield a trustworthy answer).

---

## Current checkpoint — 2026-10-18 (M15-01 / SI-013)

**Binding:** `rezaa2544/p2`, branch `arena/c33a022c-p2`, source HEAD `8f6e7d5f0a823a70a58f85f7803a4d956db350ab` (matched `origin/main` at review). Per the explicit user instruction, M15-01 precedes M15-02 for this session.

- **M15-01:** current-head static rebind documented in `docs/audit/PAYESH_SYSTEM_SCALE_RELIABILITY_GAP_AUDIT_2026-10-05.md`; status **BLOCKED / REVALIDATION_REQUIRED** because no live route-RPS run, current `EXPLAIN`, deployed-observability check, or current DR run was available. **M15-02 remains NOT STARTED**; no capacity-baseline work was represented as measured.
- **Artifact safety:** the five Wave 18 JSON files are redacted only in the local worktree; a programmatic structural comparison confirmed the metrics, root groups, and workload models were unchanged. These five JSON edits are excluded from the M15-01 publication to avoid re-emitting removed values in a Git patch. Their first tracked commit (`0069a23892323f8f45a1ed4386c3dc6129fb3862`, 2026-09-25) is reachable from the public repository history. The session credentials' expiry predated that commit, but user-identity provenance is unverified. No history rewrite or public notification was performed. Incident **SI-013** is provisionally P0 pending owner review; no credential or identity value is copied into this handoff.
- `gh api .../secret-scanning/alerts` returned HTTP 403 (“Resource not accessible by integration”); alert state is unknown. The current `node tests/secret-scan.js` run exits 1 (12 green / 1 red; 82 candidate hits) and is not a clean gate; no values were printed. A dedicated staging DB/Redis/k6 environment is absent, and the sandbox cannot reach arbitrary external staging hosts.
- Current workspace-only checks: `npm test` exit 0 (tests/run.js 39/39, API suites 31/31, smoke 547/547); `node tests/capacity-saturation-probe.js` 16/16; syntax checks for four probe/auth-delta files; `node tools/capacity-saturation-probe.js --validate`; `node tests/wave18-load-test.js` 38/38; `wave10-chg-id` 31/31; `chg_id_cursor` 33/33; change-ID mutation suite 8/8; `handoff-integrity` 4/4; JSON redaction integrity; docs-index 75/75; documentation-map 23/23 (zero orphans); onboarding 30/30; freeze marker 14/14; docs stats `--check --freeze` exit 0. These local checks do not establish E3.

**Owner follow-up:** confirm whether the identity metadata is synthetic, decide incident notification and public-history cleanup, and provide an authorized reachable staging/runtime path through secure configuration (never chat) before reopening M15-01 runtime verification. Do not start M15-02 until the M15-01 gate is met.

### Rule 15/16 task contract and five-pass ledger

**Contract:** Objective: rebind M15-01 to current HEAD, establish which runtime evidence exists, contain/report the Wave 18 artifact exposure, and reconcile canonical status docs. Scope: static M15 architecture and source-history review, local artifact redaction, evidence-gap recording, and freeze update. Out of scope: running M15-02, inventing/using synthetic E3, contacting production, or rewriting public Git history. Owner: session agent for repository work; repository/security owner for identity provenance, notification, history-cleanup decision, and staging access. Dependencies: authorized reachable staging/DB/Redis plus owner security decision. Acceptance: five traceable tasks; five independent checks per task; exact SHA and command/output provenance where available; no secret or PII values in records; no PASS/DONE without E3. Required outputs: current-head rebind, incident record, blocker and next action.

| Task | Five independent verification passes (evidence / result) | Status |
|---|---|---|
| T1 — Bind repository and history | (1) `git branch --show-current` + `git rev-parse HEAD`; (2) `git rev-parse origin/main` equality; (3) GitHub compare from `1b19449f49a2952d2fbda99053f9af42f2cf4c6c` to current SHA (141 ahead, 0 behind); (4) `git show -s` and `git merge-base --is-ancestor` for artifact-introduction commit; (5) `git diff --name-only`/`git diff --check`, confirming the only server-source edits are the two comment corrections (no runtime logic change). | VERIFIED for source binding only |
| T2 — Inventory hot paths and RPS | (1) compare targets in `docs/CAPACITY_WORKLOAD_MODEL.md`; (2) map router dispatch in `server/index.js`; (3) re-read pull/sync/DB read paths and line-bound behavior; (4) run `python3 tools/wave18-summarize-results.py tests/performance/results`; (5) compare all five stored rates with the report's five prose rates; (6) run capacity-probe 16/16 plus a `responseFailure(step) => null` mutation that fails the suite (exit 1). The static map and guard behavior are traceable; no current runtime RPS was generated. | VERIFIED for static inventory/harness guard only; operational acceptance NOT AVAILABLE |
| T3 — Query plans, observability, queue, and DR | (1) inspect current DB/query builders; (2) bind M15-03 report to its older synthetic PG16 run/SHA; (3) inspect current metrics and queue gauges; (4) inspect DR runbook/report provenance; (5) check runtime availability (`command -v` for PG/Redis/k6/container tools, connection variables, listeners). Five checks confirm there is no current E3 plan, deployment check, or DR run. | BLOCKED — runtime acceptance not met |
| T4 — Contain/report SI-013 | (1) compare each old/current JSON structure without printing fields; (2) assert redaction markers and unchanged metrics/root/model; (3) verify first-add commit date and ancestry; (4) run current secret scan with matched values kept out of output (exit 1); (5) query GitHub alert endpoint (403; state unknown). Worktree redaction is verified; public-history removal and identity provenance remain open. | BLOCKED — owner action required |
| T5 — Reconcile documentation | (1) re-read applicable engineering/documentation rules; (2) update audit, plan, intelligence, incident log, and handoff; (3) run `node tools/docs-stats-sync.js --freeze`; (4) run `node tools/docs-stats-sync.js --check --freeze`; (5) run `git diff --check` plus the three coverage gates. Current results: docs-index 75/75; documentation-map 23/23 with 0 orphans; onboarding 30/30; freeze marker 14/14; stats check exit 0. `node tools/docs-metadata.js` confirms zero orphans. Documentation verification passes; repository delivery is pending commit/push. | VERIFIED for documentation checks; unpublished, not DONE |

### Revalidation — 2026-10-19

The owner explicitly authorized permitted actions. No isolated E3 target is thereby created or identified:

- Vercel `p2` deployment `dpl_TU3Dva3d9f75ebh3ZKs52ZjVQ7av` is `READY`/`PROMOTED` on production at SHA `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`. Its 2-vCPU/8-GiB figure is the build machine, not runtime capacity. Project and shared env-variable lists are empty; no request or load was sent to production.
- The only Supabase project found is `kzgeffoqglvptgikcnod` (PG17, `ap-northeast-2`, `INACTIVE`). Health returned no active services; migration listing timed out; secrets list was empty; no repository/Vercel link was found. It was not restored or modified.
- No local PG/Redis/container/k6 tooling or DB/Redis/API environment variables are present. GitHub Actions secret enumeration returned 403, so that inventory remains unknown; no secret values were read.
- Current local regressions: capacity probe 16/16; `wave10-chg-id` 31/31; `chg_id_cursor` 33/33; mutation suite 8/8. A deliberate `responseFailure(step) => null` mutation made the capacity-probe suite fail as expected (exit 1). These are local code/harness checks, not E3 operational evidence.
- The stale comments in `server/db.js` and `server/syncdelta.js` were corrected in the worktree; behavior is unchanged. The phone-index plan remains unverified until current-schema `EXPLAIN`.
- The former `handoff-integrity.js` path/wiring defect is closed: it now checks `docs/HANDOFF.md`, is invoked by `tests/run.js`, and passes 4/4 on this worktree.

**Disposition unchanged:** M15-01 **BLOCKED / REVALIDATION_REQUIRED**; M15-02 **NOT STARTED**. Production was not load-tested, no Supabase project was restored, and no DR operation was attempted. SI-013 remains provisional P0; local artifact redaction does not remove public historical copies or settle identity-data provenance.

**Evidence boundary:** “VERIFIED” above applies only to the named static subtask, never to M15-01 overall, M15-02, E3 capacity, production readiness, or SI-013 closure.

---

## Continuation checkpoint — 2026-10-20 (M15-01)

**Binding:** `rezaa2544/p2`, branch `arena/c33a022c-p2`, checked-out `HEAD` `8f6e7d5f0a823a70a58f85f7803a4d956db350ab`. The worktree is dirty and contains uncommitted repository changes; this SHA names the base checkout, not the changed files.

**Disposition:** M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**; M15-02 remains **NOT STARTED**. Current-head route RPS, schema-current `EXPLAIN`, live observability/alert delivery, queue behavior, PITR restore, and PostgreSQL/Redis failover are still **NOT RUN**. No production traffic was sent, no remote database was restored or modified, and no E3 artifact exists.

**Worktree-only harness hardening:** PostgreSQL runtime credentials are randomized and passed through protected mode-0600 env files; the shared command/output redactor covers DSNs, common token/key/cookie assignments and authorization headers. Raw DR output is staged outside the upload directory, moved into evidence only after redaction, and the DR report includes source-tree cleanliness plus a disposition that cannot close M15-01. The runtime harness now inspects effective API/load-generator container users as well as resource limits and removes transient route files. The image runs as `node`; Docker context excludes local credentials, dependencies, tests, and unrelated data. The Prometheus token file is mode 0640 with no world access; a CI-only Compose override grants only its runner group to the non-root Prometheus process, and the runtime guard verifies its owner/GID. These are code/harness controls, not operational proof.

**Local verification on 2026-10-20:** `npm ci` exit 0; `npm audit --omit=dev` exit 0 (0 production vulnerabilities); full `npm audit` exit 1 for one moderate dev-only Moment path-traversal advisory (not changed in this M15 scope); `npm test` exit 0 (main 39/39 and smoke 547/547; API runner completed, with the test output explicitly selecting the JSON/in-memory store because `DATABASE_URL` is unset); runtime unit 27/27; DR unit 14/14; PITR argv contract 5/5; HA config 100/100; observability config 23/23; docs index 75/75; documentation map 23/23 (zero orphans); onboarding 30/30. Node/Bash syntax checks and `git diff --check` passed. Docs stats first found a stale freeze count; after the new checkpoint text, another check found stale search-token and freeze counts. `node tools/docs-stats-sync.js --freeze` synchronized the map/freeze files, and the final `--check --freeze` plus docs-metrics 25/25 passed. The local availability check found no Docker/Podman, PostgreSQL/Redis clients or servers, k6, actionlint, DB/API endpoint variables, or listeners on the M15 ports. All of these are local regression/configuration checks only.

**Next gate:** provide an authorized, reachable isolated E3 runner/runtime and secure configuration. Run the exact-SHA route/query/observability/queue and DR jobs there; inspect command, output, exit code, SHA, environment, run count, and stated limits. A single-runner drill is at most E3; E4 still requires independent failure domains, genuine off-site recovery evidence, and alert → on-call → acknowledgement → runbook → recovery. Do not push before M15-01 actually meets its gate; do not start M15-02 before then.

### Dockerless feasibility check — 2026-10-20

The user asked to continue without Docker. This sandbox is Debian 12 x86_64 with `gcc`/`make` but has no PostgreSQL (`postgres`/`initdb`/`pg_ctl`), Redis server/CLI, Prometheus/`promtool`, Alertmanager, MinIO/`mc`, pgBackRest, PgBouncer, or Go binaries. The current runtime harness expects real PostgreSQL 17.11, Redis 8.0.2, Prometheus 2.54.1, and Alertmanager 0.27.0; the DR harness additionally uses PostgreSQL 16, Redis 7.4.2, MinIO, pgBackRest, and PgBouncer. No version-matched native stack has been provisioned or validated here. Replacing these services with JSON/in-memory stores, mocks, or an embedded SQL substitute would not satisfy operational acceptance and must not be reported as E3. The sandbox also cannot control the user's Windows host. Disposition remains M15-01 **BLOCKED / REVALIDATION_REQUIRED**, M15-02 **NOT STARTED**; no push.


### Scope-limited workflow publication authorization — 2026-10-20

The user's later explicit authorization allows commit/push of reviewed M15-01 harness/support changes to `arena/c33a022c-p2` solely to make the isolated workflow run and collect evidence. This supersedes the earlier no-push instruction only for that exact operation. It does not allow a `main`/other-branch push, merge, force-push, branch-protection bypass, or production testing. Workflow completion is not independent acceptance or E4 proof. M15-01 remains **BLOCKED / REVALIDATION_REQUIRED**, M15-02 **NOT STARTED**, and SI-013/P0 remains open.

## Continuation checkpoint — 2026-10-21 (workflow outcomes)

**Source:** `arena/c33a022c-p2`, workflow SHA `69662f4232208cff059bdc3c6a176aabf2ecd182`; permitted commits are `0fa2f305a66a344a91aaca963158b72ae53a4570`, `aac25f38f464a2578a078310da0c2984e83f5c0d`, and `69662f4232208cff059bdc3c6a176aabf2ecd182`. All pushes were fast-forward to this branch only. No merge, force-push, bypass, or production test occurred.

- Latest M15 Actions run `39495570754`: **FAIL**. Runtime A/B stopped at `p11-phone-auth-live` before the runtime evidence report; DR stopped at `pg-ha-start`. The artifacts uploaded with exact-SHA status/stage metadata.
- Latest observability run `39495570472`: **FAIL**. Static/promtool/amtool validation passed; the Loki/Promtail stream check failed, and the dependent healthy-metric runtime step failed.
- GitHub artifact payload download is blocked by the sandbox's outbound allowlist. Only names, sizes, job/step conclusions, and current-head binding were reviewed; command-output contents were not. These failures are not accepted E3 evidence and cannot be marked PASS.
- Local `npm test` passed (39/39, REST API 31/31, smoke 547/547) in JSON/in-memory mode because `DATABASE_URL` is absent. `build:check` passed; M15 unit 30/30, DR unit 16/16, PITR args 5/5, observability config 24/24, semantic guard, docs/freeze gates passed. YAML and embedded shell syntax parsed. The secret scan remains red with 81 long-hex candidates; values are withheld. SI-013/P0 remains open.
- The seven capacity/W18 paths remain local and unstaged; none is in the three commits, and public history was not rewritten. Independent review has not occurred. E3 acceptance is **NOT ESTABLISHED**, E4/production readiness remain **UNPROVEN**.

**Disposition:** M15-01 **BLOCKED / REVALIDATION_REQUIRED**; M15-02 **NOT STARTED**. A single-runner drill is at most E3 and does not prove off-site recovery or the full alert → on-call → acknowledgement → runbook → recovery chain.

**Next action:** repository owner reviews the redacted command output for runs `39495570754` and `39495570472` in GitHub and shares only the sanitized first-error lines for correction and revalidation.

## Continuation checkpoint — 2026-10-21 (E3 runtime, HA/PITR/Sentinel DR, and observability CI verification on `arena/9aa4efea-p2`)

**Source & branch governance:** Arena bound the active session checkout to `arena/9aa4efea-p2` (created from `4d7c09ee25582e8c52a2d63fb22e8b4b04ffc5e3`, identical tip to `arena/c33a022c-p2` / PR #475), fast-forwarded cleanly onto `origin/main` (`d2cab1a8225777463506996a7865884f5398f888`, containing merged PR #476 from `arena/e17368b2-p2` / `3ffe95b2bcf19d178727c85cb6874cb5170b30ed`). No branch switching, history rewrite, force-push, gate bypass, or `main` push occurred.

- **E3 runtime & DR CI verification (`9/9` jobs green across 3 full runs):**
  - Run `39642161980` (`9c1471f71d80e03dfba1ce8f44d66cc2a9db590e`, Attempts 1 & 2: jobs `119368210052`, `119368210668`, `119368211127`, `119413981527`, `119413981753`, `119413981482`) and Run `39657186882` (`fb262f7a063b9ef5dca686d902357269f9a8bb0c`: `run a` `119420455894` / artifact `12372418673`, `run b` `119420455785` / artifact `12373120361`, `dr` `119420455987` / artifact `12370869905`): all **PASS** (`evidence_level: "E3"`, `mission_disposition: "SUBSET_ONLY_NOT_M15_01_CLOSURE"`).
  - Verified live outcomes: 26 migrations (`026`) applied with catalog SHA-256 `sha256:7743953e67a9f6421a245143501f010532c02056427d8d480725fdecfcd14eb6`; P11 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` index scan (`users_seq_scan: false`, `0.028–0.032 ms`); 5 live routes with zero Prometheus counter drift; real `docker restart` outbox replay with preserved `INSTANCE_ID`, active timer (`250 ms`), zero manual `tick()`, plus independent second consumer replay reaching watermark `1`; live Redis fault (`payesh_redis_up=0`) firing + post-recovery resolved Alertmanager webhooks; isolated PostgreSQL 16 + `pgBackRest` `2.59.3-1.pgdg12+1` PITR (`before_marker_restored: true`, `after_marker_excluded: true`, `restored_catalog_verified: true`); PostgreSQL primary stop + `tools/failover-postgres.sh` standby promotion + write (`rto_ms: 11973–12177`, `pgbouncer_reroute_tested: false`); 3-Sentinel Redis 7.4.2 quorum failover + write (`commands_log_sha256: sha256:dfdbebad9ff745ffe8ebe5cde0f7b7ba4b6483d4a1a1d6a97a8fc1652750bee4`).
- **Observability runtime & MSDO `403` verification (`3/3` jobs green):**
  - Run `39657186919` (`fb262f7a063b9ef5dca686d902357269f9a8bb0c`): `static-and-promtool` (`119420456156`), `promtail-runtime` (`119420457463`), and `runtime` (`119420714271`) all **PASS** after updating `infra/observability/loki-config.yml` for `grafana/loki:3.1.1` (`tsdb`/`v13`, `compactor` retention config, `allow_structured_metadata: true`), closing mutation/drift gaps (`observability-config` 28/28, `observability-config-mutations` 8/8, `wave14-observability` 96/96, `wave14-observability-mutations` 11/11, `observability-dashboards` 30/30), and adding `permissions: { contents: read, security-events: write, actions: read }` to `.github/workflows/defender-for-devops.yml` (fixing SARIF upload HTTP `403`).
- **Local gates:** `npm test` (main + API 31/31 + smoke 547/547), `npm run lint` (0 errors), `npm run build:check`, `m15-01-runtime-evidence-unit` (36/36), `m15-01-dr-runtime-unit` (27/27), `ha-config` (104/104), `ha-config-mutations` (7/7), `dr-runbook` (38/38), `pitr-restore-args` (5/5), YAML parser across 34 files, and all docs/freeze/handoff/refs gates passed. `node tests/secret-scan.js` remains **FAIL** (12 green / 1 red, 81 long-hex candidates withheld).

**Disposition:** Single-runner E3 runtime, PITR/failover DR, and observability runtime subsets **VERIFIED**; overall M15-01 **REVALIDATION_REQUIRED** pending independent review of uploaded artifact ZIP payloads; **E4** **NOT RUN**; **M15-02** **NOT STARTED**; **SI-013/P0** **OPEN**.

## Continuation checkpoint — 2026-10-23 (M15-01 closeout audit, PgBouncer reroute & ZIP audit PASS, and E4 operational blocker proof on `arena/d6dcce08-p2`)

- **Branch & PR state:** `rezaa2544/p2` PR `#479` (`arena/d6dcce08-p2` -> `main @ 64ea2630a8dde3b06db289a6849051c521dc05c6`), verified pre-doc-sync code commit `d4dc1e210c8133aa47d8eeef910ef63ef1158650`. All 3 `@codex` review threads (`PRRT_kwDOUMXeSc6vb5nW`, `PRRT_kwDOUMXeSc6vb5ne`, `PRRT_kwDOUMXeSc6vcgXu`) resolved.
- **Verified green repo gates & single-runner E3 subsets (`SUBSET_ONLY_NOT_M15_01_CLOSURE`):** `Node.js CI` (`39987698638` & `39987709199`, `77/77` steps), `M15-01 E3 Runtime Evidence` (`39987698570` & `39987708959`: real `PgBouncer` transaction-pool reroute `pgbouncer_reroute_tested: true`, `11,671–11,677 ms`, ZIP `12517095640` `sha256:80e6a52202c8f77ed88f92c55ad4eb9e0aa22772ed5c52694153d06d621c30b5`, plus independent `artifact-audit` jobs `120535396398` & `120535755062` `audit_pass: true`), `observability-regression` (`39987698604` & `39987709036`), `Codacy`, `CodeQL`, `Defender`, `Security Program`, `SecurityCodeScan`, `Runtime Reliability`, and active-tree `SI-013` secret scan (`13/13` per Owner Option A).
- **Operational E4 verification (`tools/m15-01-e4-verify.js`):** Added fail-closed multi-node operational E4 probe + 6-field closure checklist (`tests/m15-01-e4-verify-unit.js` `18/18`, mutation-verified). Live probe exited **`2` (`BLOCKED`, `0/7` E4 criteria executed)** because multi-node staging targets are absent (`Supabase kzgeffoqglvptgikcnod` = `INACTIVE`, `Vercel` `env: []`, `0` staging environments).
- **Authoritative disposition:** **M15-01 = `BLOCKED WITH PROOF`** (kept **OPEN**); **M15-02 (`#468`) = `NOT STARTED`**.

## Continuation checkpoint — 2026-10-23 late (CI-FLAKE-01 closed at source: readiness gate, fail-closed mutation verdicts, `psql -c` fix on `arena/d6dcce08-p2`)

- **Live-state truth at cycle start (`2026-10-23T21:07:00Z`):** `origin/main` = `64ea2630a8dde3b06db289a6849051c521dc05c6`; PR `#479` head `7d902f336d16013da89b6c04ab7c0ede86a1011d` (`24` commits, `592` files, `mergeable: true`, `mergeable_state: "unstable"`), `64` check-runs = `50 success` / `2 skipped` / `12 failure`. Local `HEAD` had silently drifted one commit behind (`e9682d35` vs remote `7d902f33`) and was recovered by `git reset 7d902f33…` (soft, tree preserved) after `git diff --stat 7d902f33 -- .` proved no local work would be lost; `node_modules` was rehydrated with `npm ci` (`156` entries) because the snapshot excluded it.
- **Only repository-controlled red:** PR `Node.js CI` job `build (22.x)` [`120598819123`](https://github.com/rezaa2544/p2/actions/runs/40007436008/job/120598819123) — `RED suite server13-mutations`, while the push twin of the same tree `120598792376` was `77/77 success`. The other `11` reds are owner/vendor-gated (`STRICT`, `Fortify`, `APIsec`, `Jscrambler`, `Payesh Watch` — the watcher reports `main @ 64ea2630` honestly, where those workflows are themselves red).
- **Reproduced root cause (real PostgreSQL 18.4 + real Redis 7.2.5, no mocks):** (D-1) `tests/server13.js` started production-mode servers that require the shared CI database with no readiness gate and a swallowed `migrate-ledger up` (`catch (_err) { /* best-effort */ }`), so a DB window surfaced as `❌ T2 — سرور بالا نیامد … connect ECONNREFUSED`; (D-2) `tests/server13-mutations.js` ended in an unguarded `execFileSync` baseline re-check that aborted as `Error: Command failed … output: [null, Buffer(846) …]` — the exact CI annotation shape; (D-3) substring scoring `firstFail.includes('T1')` matched `T1b`, so an environmental red could be counted as a mutation kill.
- **Fix on `9ec20e7891541bbf7de2a4da339041e92a4ad4c2`:** new `tests/helpers/live-db-readiness.js` (bounded fail-closed `SELECT 1` gate + bounded migration retry + credential-redacting diagnostics) and `tests/helpers/mutation-verdict.js` (word-boundary check matching, crash/empty/timeout never scored as kills, redacting tails); `server13.js` gated, `server13-mutations.js` baseline-validated before and after mutation with `BASELINE-RED`; `scripts/run-all-tests.sh` gained `pg_wait_if_expected` for the parallel lanes (armed only when a live PostgreSQL was seen at startup); `tools/psql-min.js` `-c` crash fixed via pure `resolveSqlSource` (selftest `29/29 -> 33/33`); new `tests/m15-01-ci-flake-01-unit.js` (`65` checks).
- **Measured before/after:** dead target — pre-fix `exit 1` after `44 s` blaming `T2`, harness crash with raw `Buffer` dumps; post-fix `exit 1` in `< 1 s` labelled `ENVIRONMENT — PostgreSQL unreachable` (harness: `BASELINE-RED`, `grep -c 'Buffer('` = `0`, `grep -c 'کشته شد'` = `0`, `grep -c 'payesh:payesh'` = `0`). A real `12 s` `pg_ctl stop -m immediate` outage is now absorbed (`attempts=12 waited_ms=11044`, `9/9 ✅`) instead of going red. Healthy tree: `server13` `9/9`, `server13-mutations` `exit 0` (`baseline-pre 9/9` → `M1 … KILLED_ON_EXPECTED_CHECK` → `baseline-post 9/9`).
- **What was NOT done (deliberate):** no assertion deleted or weakened, no suite skipped, no per-suite scratch database (`payesh_s13_<pid>` was implemented, measured to work, then rejected as hidden CI-infra scope and reverted), no positive end-to-end spawning of `server13`/mutants from the new unit test (the port-lane design makes parallel spawns collide `898x` — only dead-DSN fail-closed paths are spawned), no registry rebind away from `head_bound=e4584806…` and no `--allow-registry-drift` (would fabricate `29` independent attestations), no retry-to-green, no vendor secrets (`Fortify` `SECIFY_ENT_FORTIFY_SSH_KEY` still unset by design), no destructive actions against external infra.
- **Gate surface:** `ci-test-parity-contract` `33/33`, `g7-ci-database-env` `10/10`, `false-green-defense` `29/29`, `secret-scan` `13/13`, `si013-secret-scan` `18/18`, `test-coverage-report-coverage` `۳۳/۳۳` (`657 = 625 root + 32 api`), `docs-metrics` `25/25`, `docs-metadata` `۱۸/۱۸`, `docs-consistency` `22/22`, `docs-health` `9/9`, `documentation-map-coverage` `۲۳/۲۳`, `docs-freeze-marker` `14/14` (rc44 manifest re-frozen), `m15-01-dr-runtime-unit` `34/34`, `m15-01-e4-verify-unit` `18/18`, `mutant-kit-test` `17/17`, `ha-config` `104/104`, `wave16-dr` `75/75`, `pg-prod-suite-policy` `9/9`, `npm test` (`main` + `REST 31/31` + `smoke 547/547`), `npm run build:check`, `tools/release-gate.js`, `eslint --max-warnings=0`, `git diff --check` — all green; `A-30` negative suite `29/29`.
- **Evidence boundary:** `tools/m15-01-e4-verify.js` re-run on the current head still returns `overall_status: BLOCKED` (`exit 1` / report `exit_code 2`, `0/7 PASS / 7/7 BLOCKED`, `report_sha256 6b4612767c6e2bc3e82e1d2f6f6d40f11fe0b689505d8e94f4cf36ca54d2f3a`); `tools/strict-verification-gate.js` still exits `1` with `238` reviewer-bound conditions. **Disposition unchanged: M15-01 = `BLOCKED WITH PROOF` (OPEN); M15-02 (`#468`) = `NOT STARTED`.**
