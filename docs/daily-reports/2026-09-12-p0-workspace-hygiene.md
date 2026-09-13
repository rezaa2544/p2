# گزارش روزانه — پ۰ دور ۲: بهداشتِ پیگیرِ ورک‌اسپیس سندباکس (فازهای ۰-۵)

**تاریخ:** ۲۱ شهریور ۱۴۰۵ (۲۰۲۶-۰۹-۱۲ عصر) · **مأموریت:** پ۰ — رساندنِ ورک‌اسپیس به زیرِ سقفِ
snapshot با حاشیهٔ امن (هدف ≤۱۰۰MB و ≤۸٬۰۰۰ فایل) · **شاخه:** `docs/p0-workspace-hygiene-v2`
(از `main@b53a7a7`) · **PR:** این شاخه.
**CI گیت‌هاب: NOT-RUN** (بیلینگ — الگوی ثبت‌شده) — همهٔ اعداد اجرای محلی‌اند.

## ۱. حکم نهایی: 🟢 PASS

> **اصلاح (کامیت بعدی):** شمارشِ اولیهٔ «۳۶ فایل» خطا داشت — شمارشِ مجددِ نهایی پس از کپیِ همین گزارش به
> پوشهٔ کاریِ سندباکس: **۳۷ فایل / ۸۶٫۹MB مؤثر / du ۸۸MB**. اعدادِ اصلاح‌شده در جدول اعمال شده‌اند.

| سنجه | پیش | پس | هدف |
|---|---:|---:|---|
| حجمِ مؤثر (سنجهٔ §۱ سند بهداشت) | ۱۴۳٫۸ MB | ۸۶٫۹ MB | ≤۱۰۰MB |
| `du -sh /home/user` | ۱۴۷MB | ۸۸MB | — |
| تعداد فایل | ۱٬۳۲۳ | ۳۷ | ≤۸٬۰۰۰ |

## ۲. فاز ۰ — موجودیِ فقط‌خواندنی

ریشه: `.ruvector` ‏۸۷MB (مدلِ ONIX پلتفرم) · `p2` ‏۳۲MB (کپیِ بی‌گیت کهنه) · `bandle` ‏۲۸MB
(سه قلم چت ۲) · `w18-delivery`+تار ‏۲۶۸K · `staging` ‏۸۸K · `WAVE18_FINAL_REPORT.md` ‏۱۲K ·
اسکریپت‌ها/متادیتا ~۶۰K. هیچ دایرکتوریِ ریشه گیت نبود (`p2`/`bandle`/`w18-delivery`/`staging`/
`replay-manifests` همه بدون `.git`). کلون‌ها در `/var/tmp` (بیرونِ snapshot): `p12-work`
(کانونیکال، تمیز) · `v124` · `docs-push`.

## ۳. فاز ۱/۲ — طبقه‌بندی و حذفِ دروازه‌دار (هر قلم یک خطِ شاهد)

| قلم | حجم | حکم | شاهد (خروجی واقعی) |
|---|---:|---|---|
| `p2` به‌جز `docs/daily-reports/` | ~۳۱٫۹M | DELETE | ۴۱/۴۴ فایلِ متفاوت SHA-مچ کامل با history remote (نمونه: `server/sync.js`==`4a63f13`، `server/index.js`==`fffde46`)؛ `NEXT_ACTIONS`/`ROADMAP` محلی پیش‌نویسِ مقدم‌شده بودند (ردیف‌های P0-3/P1-1/Wave18 در main به‌روزتر)؛ `server/data` = اجرایی (audit.log + jwt.key اعتبارنامهٔ dev)؛ ۴ گزارشِ loose == SHA شاخه‌های #125/#128 |
| `bandle/chat2-work.bundle` | 17M | DELETE | HEAD `abe9c608` == `origin/feat/delta-schema-gaps` (ls-remote؛ PR #59) · `bundle verify` = complete history · sha256 ≡ `chat2-sha256.txt` |
| `bandle/chat2-work.patch` | 57K | DELETE | ۴ پچ == کامیت‌های همان شاخه · sha256 ≡ مانیفست |
| `bandle/chat2-worktree-backup.tar.gz` | 11M | DELETE | ۱۱۲۳ فایل: ۱۱۴/۱۱۷ متفاوت SHA-مچ کامل با history؛ ۳ فایلِ میانی با تمامِ محتوا در `f4f9797`/`bed30f0`/`08d4492`/`32da05e` (جستجوی `-S`) |
| `w18-delivery/` + باندل تار | ۲۶۸K | DELETE | ۶/۹ فایل == کامیت `81a523e` (PR #94 مرج‌شده)؛ ۳ فایلِ باقی نسخهٔ پیش-اصلاحِ بازبین‌اند — diff دقیقاً guardهای `db43769`/`fffde46` |
| `git-auth.sh` · `replay-push.sh` · `w18-push-rebuild.sh` | ~۲۴K | DELETE (امنیتی) | توکنِ GitHub در متنِ هر سه (نقض قاعدهٔ توکن؛ P2-5) — **rotate لازم** |
| `replay-manifests/` · دو `*-commit-message.txt` · `build-w18-bundle.sh` | ~۳۲K | DELETE | مانیفست/پیامِ کامیت‌های موجود در remote (`81a523e`؛ init شاخهٔ `docs/daily-reports-init` در history مرجِ PR #98) |
| `WAVE18_FINAL_REPORT.md` | ۱۲K | **ARCHIVE** | در هیچ شاخهٔ remote نبود ⇒ این کامیت: `docs/WAVE18_FINAL_REPORT.md`؛ پس از پوش، نسخهٔ loose حذف شد |
| `staging/` | ۸۸K | **STOP — نگه داشته شد** | ارجاعِ نامی `grades_recovered` در `WAVE10_DB_SCALE.md` (کامیت `f7e3dbf`) هست، اما تطبیقِ مستقیمِ خروجی‌های `report*.json`/اسکریپت‌های perf با ریپو اثبات نشد (تطبیقِ عددیِ اولیه کاذب ازکارافتاد — §۶) |
| `.ruvector/` | ۸۷M | **STOP — نگه داشته شد** | مدلِ embedding پلتفرم سندباکس (`all-MiniLM-L6-v2`)؛ زیرساخت، نه کارِ پروژه؛ با ماندنش هم بودجه 🟢 است |
| `p2/docs/daily-reports/` (۱۵ فایل) | ۱۵۶K | KEEP | پوشهٔ گزارش‌نویسیِ نشست؛ همه SHA-مچ remote یا نسخهٔ main |
| `.gitconfig` · `.claude-flow/` | ~۵K | KEEP | هویتِ گیت (بدون توکن) · state ابزار |

ثبتِ مرحله‌به‌مرحله: `/tmp/deletion-evidence-p0r2.log` + جدولِ بازیابی در `docs/BUNDLE_REGISTRY.md` §۸.

## ۴. فاز ۳ — کلون‌های `/var/tmp` (بیرونِ snapshot)

- `v124` (کهنهٔ پیش-rebase): هر دو کامیتِ آن با `git cherry` «-» (هم‌ارزِ بالادستی) — محتوا در
  `origin/feat/p12-mirror-write-cut` @ `05c3136` ⇒ حذف شد.
- `docs-push` (کهنه): سرِ `17af573` == `origin/docs/daily-reports-p11` ⇒ حذف شد.
- ماند: `p12-work` (کانونیکال؛ `docs/daily-reports-p13` @ `57a5ef7`، dirty=0) + کلونِ کاریِ همین
  شاخه = ۲ checkout (حداکثر مجاز). `node_modules`ی `p12-work` برای گیت‌های همین دور ماند؛
  بازیابی در نشستِ تازه: `npm ci`.

## ۵. فاز ۴ — قواعد بهداشت ماندگار

- `docs/WORKSPACE_HYGIENE.md` **§۱۰** (الگوی دورِ دوم + قلم‌های توقف + سه درس).
- `docs/BUNDLE_REGISTRY.md` **§۸** (بازیابیِ هر قلمِ حذف‌شده).
- قفل: `rc36` بنرِ تاریخی گرفت؛ **`rc37`** با مانیفستِ ۳۱۹ سند ریشه بسته شد
  (`node tests/docs-freeze-marker.js`).

## ۶. یافته‌هایی که خودم رد کردم (صداقتِ شواهد)

1. **تطبیقِ کاذبِ اعداد بنچمارک:** جستجوی `2068`/`526`/`604` (از `staging/report.json`) در
   docs ریپو، «ردیف‌هایی» یافت که در واقع بخشی از رشته‌های sha256 بودند ⇒ شاهدِ ثبتِ خروجی
   در ریپو **رد شد** و `staging/` به لیست توقف رفت.
2. **قرائتِ غلطِ وضعیت PR:** فیلد `merged` در endpointِ فهرستِ PRها برنمی‌گردد؛ خواندنِ
   «PR #113 بسته» از آن endpoint خطا بود — endpointِ تک‌PR نشان داد **مرج شده** (و
   `WORKSPACE_HYGIENE.md` از پیش روی main بود ⇒ به‌روزرسانی شد نه ساختنِ دوباره).
3. **شمارشِ اولیهٔ فایل‌های p2 «فقط قدیمی»:** جهتِ تفاوت‌ها را با شواهدِ محتوایی تأیید کردم
   (`sync.js` بدون دور ۲، `auth.js` با یک `readOne` در برابر دو) پیش از هر حکم.

## ۷. گیت‌ها (همه روی سرِ همین شاخه)

| گیت | نتیجه |
|---|---|
| smoke | **547/547 ✅** (`node --expose-gc --max-old-space-size=2048 tests/smoke.js`؛ تنها هشدار: jsdom `window.scrollTo` — شناخته‌شده و بی‌اثر) |
| docs-freeze-marker | **14/14 ✅** (قفلِ rc37 با ۳۱۹ ردیف) |
| docs-index-coverage | **75/75 ✅** |
| docs-metrics | **11/11 ✅** |
| docs-health | **9/9 ✅** |
| docs-consistency | **22/22 ✅** |
| docs-refs-check | **29/29 ✅** |
| docs-metadata | **17/17 ✅** — یتیمیِ ارثیِ `review-round2-fixes.md` با ردیفِ §۲.۱۳ بسته شد (پیش از پ۰: 16/1) |
| docs-export-script | **12/12 ✅** |
| secret-scan | **11/11 ✅** |
| dc-check | **49/0 ✅** (`tools/docs-consistency-check.sh`) |
| stats-sync | `--check`: **۰ ردیفِ کهنه ✅** |
| CI گیت‌هاب | **NOT-RUN** (بیلینگ — الگوی ثبت‌شده) |

`node_modules`ی کلونِ کانونیکال ماند (گیت‌های همین دور لازم داشت) — بازیابی در نشستِ تازه: `npm ci`.

## ۸. گام‌های بعدی

1. **چرخشِ (rotate) توکن‌های افشاشده** — سه فایل توکن‌دار حذف شدند اما خودِ توکن‌ها تا پیش از
   rotate معتبرند (P2-5؛ نیازمند اقدامِ مالک ریپو).
2. تعیینِ تکلیفِ `staging/` (۸۸K): آرشیوِ اسکریپت‌های perf در ریپو یا حذف با شاهدِ قوی‌تر —
   تصمیم با ناظر.
3. مرجِ PRهای بازِ صف (#124 · #127 · #125 · #128 · همین PR) پس از بازبینی.
