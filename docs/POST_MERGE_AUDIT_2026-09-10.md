# 🔍 Repository Health Audit — پس از ۸ مرج زنجیره‌ای
**تاریخ:** ۲۰ شهریور ۱۴۰۵ (2026-09-10) · **ممیزی‌کننده:** چت ۷ (Merge Queue Manager) · **مبنا:** `main @ c7eee52` (زنده، پس از fetch)
**روش:** شاخهٔ محلی تمیز از `origin/main` در worktree جدا (`/tmp/audit`) — بدون آلوده‌کردن درخت کاری

---

## بخش ۱ — Merge History (ترتیب زمانی مرج‌ها)

> هفت PR ابلاغ‌شده (#51، #34، #33، #31، #35، #46، #32) + **#29 که در حین ممیزی مرج شد** (ساعت ۱۹:۳۶ UTC) = ۸ مرج کامل. ترتیب زیر از `git log` زنده + GitHub API:

| # | PR | عنوان | تاریخ مرج (UTC) | نویسنده | merge-commit | کامیت‌ها | فایل‌ها |
|---|---|---|---|---|---|---|---|
| ۱ | **#51** | docs: OBSERVABILITY.md §30 (چت ۶) | 2026-09-10 18:17 | app/arena-ai-coding-agent | `5418fb6` | ۵ | ۴ |
| ۲ | **#34** | feat(internship) E.2 (چت ۳) | 2026-09-10 18:18 | rezaa2544 | `fb9fcba` | ۳ | ۱۳ |
| ۳ | **#33** | feat(behavior) E.3 (چت ۳) | 2026-09-10 18:30 | rezaa2544 | `80c5e3e` | ۴ | ۱۴ |
| ۴ | **#35** | Feat/b3-d234 (چت ۴ — B.3/D.2-D.4) | 2026-09-10 18:45 | rezaa2544 | `d816c30` | ۱۱ | ۲۹ |
| ۵ | **#31** | feat(health) G.1 (چت ۳) | 2026-09-10 18:46 | rezaa2544 | `c2473e1` | ۵ | ۶ |
| ۶ | **#46** | waves 14/16/17/18 (چت ۲) | 2026-09-10 19:28 | app/arena-ai-coding-agent | `8c0977c` | ۳۹ | ۳۹ |
| ۷ | **#32** | feat(assets) E.5 (چت ۳) | 2026-09-10 19:28 | rezaa2544 | `cd484c3` | ۶ | ۱۵ |
| ۸ | **#29** | feat(library) E.4 (چت ۳) | 2026-09-10 19:36 | rezaa2544 | `c7eee52` | ۶ | ۱۵ |

**جمع:** ۸ مرج در ~۸۰ دقیقه · ۷۹ کامیت · ~۱۳۵ فایل. هر مرج پس از یک رفع تعارض چت ۷ انجام شد (۱۷ حلقهٔ رفع در ۴ موج re-dirty — `main` حین کار ۵ بار جلو رفت: `fac2ddf→fb9fcba→80c5e3e→c2473e1→cd484c3→c7eee52`).

## بخش ۲ — Gate Verification (روی `main @ c7eee52`)

| گیت | انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|
| `node tests/smoke.js` | ۵۴۷/۵۴۷ | **۵۴۷/۵۴۷** | ✅ |
| `node tools/check-authz.js` | ۰ | **۰** (۳۸۳ اکشن؛ ۱۸۷ نویسنده) | ✅ |
| `node tests/secret-scan.js` | ۱۱/۱۱ | **۱۱/۱۱** | ✅ |
| `node build.js --check` | exit 0 | **exit 0** — «خروجی build با index.html بیت‌به‌بیت یکسان» + راهنما و write-perms همگام | ✅ |
| `node tests/api/runner.js` | ۷/۷ | **۷/۷ سوئیت** | ✅ |
| `node tests/wave1-writes.js` | سبز | **۱۴/۱۴** | ✅ |
| `node tests/wave1-multi-instance.js` | ۳۳/۳۳ | **۳۳/۳۳** | ✅ |
| `node tests/wave5-authz.js` | ۳۷/۳۷ | **۳۴/۳۷** — ۳ قرمزِ **pre-existing** (T18/T20/T21) | ⚠️ (بدون رگرسیون — مدرک زیر) |
| `node tests/wave6-redis.js` | ۲۲/۲۲ | **۲۲/۲۲** | ✅ |
| `node tests/wave12.js` → `wave12-network.js` | ۲۴/۲۴ | **۲۴/۲۴** (نام فایل واقعی: `wave12-network.js`) | ✅ |
| `node tests/wave14-observability.js` | ۹۵/۹۵ | **۹۵/۹۵** | ✅ |
| `node tests/wave15-health.js` | ۱۰/۱۰ | **۱۰/۱۰** | ✅ |
| `node tests/wave17-testing.js` | ۷۳/۷۳ | **۷۳/۷۳** | ✅ |
| `node tests/wave18-load-test.js` | ۳۸/۳۸ | **۳۸/۳۸** | ✅ |
| `node tests/wave19-chaos.js` | ۲۸/۲۸ | **۲۸/۲۸** | ✅ |
| `node tests/wave20-arena5.js` | ۲۲/۲۲ | **۲۲/۲۲** | ✅ |

### ⚠️ مدرک wave5-authz (۳۴/۳۷) — pre-existing، نه رگرسیون
سه قرمزِ T18/T20/T21 **دقیقاً همان سه قرمزِ baseline تمیزِ main پیش از هر مرج** است:
- سنجیده‌شده روی `main @ fac2ddf` (قبل از هر ۸ مرج، نشست چت ۷): `34/37` — ناموفق‌ها: T18 · T20 · T21 (امضاها بیت‌به‌بیت همان).
- سنجیده‌شده روی `main @ c7eee52` (امروز، این ممیزی): `34/37` — همان سه مورد.
- در میانهٔ مسیر (حلقهٔ رفع #35 و #32) نیز `34/37` همان بود.
**نتیجه:** زنجیرهٔ ۸ مرج **صفر** قرمزِ تازه وارد کرد. سه قرمزِ باقی‌مانده یک بدهیِ تستی قدیمی است (احتمالاً drift تست-با-کد پس از بازمهندسی REST ویو ۵) — پیگیری‌اش در بخش ۴.

## بخش ۳ — Interference Check (تداخل مرج‌های زنجیره‌ای)

### ۳.۱ — آیا #46 (waves 14/16/17/18) با #35 (B.3/D.2-D.4) تداخل داشته؟
**خیر — هم‌زیستی سالم.** هر دو PR قواعد مجوز را در `server/policy.js` (منبع یکتای ویو ۵) تغییر دادند:
- #35: گارد D.3 (`announcements` + office_id) و گیت جغرافیایی D.4 (`staff_posts`، data-first) در شاخهٔ edu_office
- #46: **صفر تغییر در policy.js** (ممیزی diff تأیید کرد — موج‌های ۱۴/۱۶/۱۷/۱۸ لایهٔ observability/DR/test/load هستند)
- راستی‌آزمایی رفتاری روی main نهایی: `staff-gap` **۱۷/۱۷** · `urgent-ann` **۱۴/۱۴** · `region-scorecard` **۱۴/۱۴** · `exam-types` **۲۷/۲۷** · `wave14-observability` **۹۵/۹۵** — یعنی قواعد #35 و رصدپذیری #46 همزمان سبزند.
- نقطهٔ تماس واقعی: `server/metrics.js` (#46 مالک) — مسیر `/api/health-index` (#31) و مسیرهای Wave 15 در کاتالوگ روت اضافه شدند (T7a سبز: ۹۵/۹۵).

### ۳.۲ — آیا #51 (سند OBSERVABILITY) با کد wave14 تداخل داشته؟
**خیر — سند و کد هم‌راستا.** #51 سند `docs/OBSERVABILITY.md` (§30) را ساخت و #46 استک زندهٔ observability را آورد. هر سه گارد تطابق:
- `observability-doc-coverage` **۵۵/۵۵** (ارجاع‌های فایل سند §30 زنده‌اند)
- `observability-config` **۵۵/۵۵** (alert-rules/prometheus/compose ↔ metrics.js — همهٔ متریک‌های قوانین تعریف‌شده)
- `observability-dashboards` **۳۰/۳۰** (داشبوردها فقط متریک‌های واقعی می‌خوانند)
> نکتهٔ فنی: برای تأمین این گاردها، سری‌های سازگاریِ استکِ live-deploy (`payesh_redis_up`، `payesh_db_up`، …) با probeهای لحظهٔ scrape (`publishRuntimeProbes`) به registry ویو ۱۴ اضافه شدند — حلقهٔ رفع #46.

### ۳.۳ — آیا library (#29) و assets (#32) در policy.js درست ادغام شده‌اند؟
**بله — keep-both کامل.** `server/policy.js`، شاخهٔ teacher:
- خط ۲۷۱: `if (coll === 'lib_loans')` — قانون E.4 کتابدار (`lib_staff === 1` + مهار مدرسه)
- خط ۲۷۹: `if (coll === 'assets')` — قانون E.5 تحویلدار (`asset_staff === 1` + مهار مدرسه)
- راستی‌آزمایی: `library2` **۷/۷** · `library-mutations` **۴/۴ کشته** · `assets2` **۵/۵** · `assets-mutations` **۴/۴ کشته** — هر دو ماژول همزمان کار می‌کنند و گاردها با جهش کشته می‌شوند.
- همسایگی‌های چت ۳: `internship2` ۴/۴ · `behavior2` ۴/۴ · `health-index` ۳۲/۳۲ ✅
- جبر cursor: `wave3-query3` **۱۸/۱۸** (algebra چت ۲ + W3-1/W3-2 main) ✅

### ۳.۴ — آیا index.html و USER_GUIDE.html بیت‌به‌بیت با src مطابق دارند؟
**بله.** `node build.js --check` روی `main @ c7eee52`:
- «✅ خروجی build با index.html بیت‌به‌بیت یکسان است.»
- «✅ راهنما همگام با index.html است.» (مُهرِ `payesh-build` = hash زندهٔ بیلد)
- «✅ generate-write-perms: authz/write-perms.json با منبعِ یکسان است»
یعنی هیچ مرج دستیِ خروجی‌ها صورت نگرفته — همه از مولد رسمی عبور کرده‌اند (اصل Single-File Distribution رعیت شد).

## بخش ۴ — Open Issues (قرمزها و مشکوک‌ها)

### 🔴 O-1 — `node_modules` به‌صورت symlink در gitِ main track شده (بهداشت مخزن)
- **مدرک:** `git ls-tree origin/main -- node_modules` → blob `120000` (symlink) با هدف **مسیر مطلقِ سندباکسِ توسعه‌دهنده** (`/home/user/p2/node_modules`).
- **ریشه:** کامیت قدیمی نشست‌های قبلی (زنجیرهٔ PR #41)؛ الگوی `node_modules/` در `.gitignore` (با اسلش) symlink را ignore نمی‌کند.
- **اثر:** کلون تازه ⇒ symlink معلق؛ `npm install` ممکن است رفتار وابسته به پلتفرم بدهد (CI تاکنون گذرانده چون npm لینک معلق را بازنویسی می‌کند). در #35 (کامیت `3a01e90`) روی شاخه پاک شد ولی به main راه پیدا نکرد.
- **اصلاح در همین PR:** `git rm --cached node_modules` + سطرِ بدون‌اسلش `node_modules` در `.gitignore` (کامیت chore جداگانه).

### 🟡 O-2 — سه قرمزِ pre-existing در wave5-authz (T18/T20/T21)
- مشروح در §۲ — **قبل از هر ۸ مرج** وجود داشته؛ drift تست-با-کد در مسیر REST attendance/خودویرایشی دانش‌آموز (احتمالاً پس از بازمهندسی پنج مسیر v1 و allowlist خودویرایشی).
- **توصیه:** تخصیص به چت ۵ (Bug Hunt) برای ریشه‌یابی — تست غلط است یا کد؟ (هر ۳ مورد مربوط به رفتار teacher/student در REST v1 است.)

### 🟡 O-3 — ناهم‌خوانی نام تست wave12
- ابلاغ ممیزی `tests/wave12.js` گفت؛ فایل واقعی `tests/wave12-network.js` است (۲۴/۲۴ سبز). صرفاً نکتهٔ مستندسازی.

### 🟢 O-4 — عملیاتی (اطلاعی)
- ریست‌های سندباکس چت ۷ سه بار کار را قطع کرد (worktreeهای `/tmp` و Ruflo پاک شدند) — هر بار بازسازی شد؛ درس‌آموزخته‌ها در Ruflo (`chat7_lessons`) ثبت است.
- PR #22 (tracing) طبق PR_MERGE_PLAN دارای ۶ یافتهٔ Devin بود — خارج از scope این ممیزی (PR بسته/مرج‌شده در گذشته یا صف قبل)؛ صرفاً یادآوری برای چت ۱.

## بخش ۵ — Final Verdict

### آیا main آماده برای مرج #29 بود؟
**بله — و اتفاقاً در حین این ممیزی مرج شد** (`c7eee52`، ساعت ۱۹:۳۶ UTC). پس از آن، کل باتری گیت‌ها روی mainِ حاصل دوباره سبز شد (§۲) — یعنی نقطهٔ پایانی زنجیره نیز سالم است. **صف چت ۷: صفر PR باز** (تنها PR باز مخزن: #53 — مستندات همین نشست).

### آیا main آماده برای شروع Wave 18 Live است؟
**بله، از نگاه گیت‌های نرم‌افزاری — با سه قید صادقانه:**
1. ✅ پیش‌نیازهای کد/تست: `wave18-load-test` ۳۸/۳۸ · `wave17-testing` ۷۳/۷۳ · `wave19-chaos` ۲۸/۲۸ · `wave14-observability` ۹۵/۹۵ · `wave15-health` ۱۰/۱۰ · `wave20-arena5` ۲۲/۲۲ · smoke ۵۴۷/۵۴۷ · api ۷/۷ — همه سبز.
2. ⏳ پیش‌نیاز زیرساخت: اجرای live طبق `docs/WAVE18_LOAD_TESTING.md` نیازمند استقرار واقعی (PG/Redis/edge + دادهٔ مقیاس ملی `tools/seed-national.js`) است که در سندباکس نیست — «Honest gap» خود سند هم همین را می‌گوید.
3. ⚠️ توصیه: پیش از شروع live، دو مورد §۴ اولویت‌بندی شود: O-1 (با merge همین PR بسته می‌شود) و O-2 (سه قرمزِ wave5 — بهتر است قبل از بارگذاریِ live تعیین تکلیف شود تا سیگنال CI تمیز بماند).

### جدول نهایی گیت‌ها
| گیت | نتیجه |
|---|---|
| smoke | ۵۴۷/۵۴۷ ✅ |
| check-authz | ۰ ✅ |
| secret-scan | ۱۱/۱۱ ✅ |
| build --check (بیت‌به‌بیت) | exit 0 ✅ |
| api/runner | ۷/۷ ✅ |
| wave1-writes / wave1-multi-instance | ۱۴/۱۴ · ۳۳/۳۳ ✅ |
| wave5-authz | ۳۴/۳۷ ⚠️ (۳ قرمز pre-existing — بدون رگرسیون) |
| wave6-redis / wave12-network | ۲۲/۲۲ · ۲۴/۲۴ ✅ |
| wave14 / wave15 / wave17 | ۹۵/۹۵ · ۱۰/۱۰ · ۷۳/۷۳ ✅ |
| wave18-load-test / wave19-chaos / wave20 | ۳۸/۳۸ · ۲۸/۲۸ · ۲۲/۲۲ ✅ |
| تداخل‌ها (§۳) | همه سبز ✅ |

**verdikt نهایی: main پس از ۸ مرج زنجیره‌ای سالم است — صفر رگرسیون؛ آمادهٔ Wave 18 Live (با قیدهای بالا).**

---
*ممیزی: چت ۷ — Merge Queue Manager · شاخهٔ گزارش: `arena/01a08c7a-p2` (PR #53) · Ruflo: `post_merge_audit_2026_09_10`*
