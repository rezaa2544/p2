# 🗂️ رجیستری مرکزی باندل‌ها — BUNDLE_REGISTRY

**نسخه:** ۱.۰.۰ | **تاریخ:** ۲۰۲۶-۰۹-۱۱ | **مالک:** چت ۶ (مستندات و انتشار)
**وضعیت:** فهرست مرکزی و مرجع راستی‌آزمایی **همهٔ** باندل‌های گیت پروژه در سندباکس‌های آره‌نا.
تا پیش از این سند، باندل‌ها فقط در گزارش‌های پراکندهٔ مأموریت‌ها ثبت بودند — ریسک گم‌شدن داشتند.
**هم‌خانواده:** `docs/PUSH_RECOVERY_PLAYBOOK.md` (دستور پوش) · `docs/PR_MERGE_PLAN.md` · `docs/RISK_REGISTER.md` (`RISK-E-004`) · `HANDOFF.md`

---

## ۱) هدف و قواعد

- **مرکز واحد:** هر باندل بلافاصله پس از ساخت باید یک ردیف در §۲ بگیرد؛ باندل بی‌ردیف، باندل گم‌شدهٔ آینده است.
- **وضعیت‌ها:** ✅ تأییدشده (`bundle verify` = okay، ثبت در گزارش) · 📝 گزارش‌شده (در گزارش مأموریت آمده ولی این سندباکس تأیید نکرده) · ⏳ در انتظار (مأموریتش فعال است) · ❌ از دست رفته (سندباکس ریست شد و باندل بیرون نیامد).
- **دو ریست پیاپی سندباکس در ۲۰۲۶-۰۹-۱۱** نشان داد فایل‌های بیرون ریپو پایدار نیستند؛ تنها چیزی که می‌ماند **ردیف همین رجیستری + گزارش مأموریت** است. پس ستون‌های «آخرین تأیید» و «محل بازیابی» الزامی‌اند.

## ۲) جدول مرکزی باندل‌ها

| سندباکس | باندل | مسیر در سندباکس | شاخه | کامیت | رأس (Tip) | پایه | حجم | وضعیت |
|---|---|---|---|---|---|---|---|---|
| چت ۱ | `p0-2-close-v1.bundle` | `/home/user/p0-2-close-v1.bundle` | `arena/01a08543-p2` | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۱ | `p0-2-close-v2.bundle` | `/home/user/p0-2-close-v2.bundle` | `arena/01a08543-p2` | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۱ | `p0-2-close-v3.bundle` | `/home/user/p0-2-close-v3.bundle` | `arena/01a08543-p2` | ۱۱ | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۱ | `p0-2-close-v4.bundle` | `/home/user/p0-2-close-v4.bundle` | `arena/01a08543-p2` | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۱ | `p0-2-close-v5.bundle` | `/home/user/p0-2-close-v5.bundle` | `arena/01a08543-p2` | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۲ | `delta-schema-gaps.bundle` | `/home/user/delta-schema-gaps.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۲ | `delta-scope-columns.bundle` | `/home/user/delta-scope-columns.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۲ | `delta-teacher-scope.bundle` | `/home/user/delta-teacher-scope.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۲ | `delta-driver-scope.bundle` | `/home/user/delta-driver-scope.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۳ | `feedback-widget.bundle` | `/home/user/feedback-widget.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۳ | `a11y-rebuild.bundle` | `/home/user/a11y-rebuild.bundle` | نامشخص در گزارش | نامشخص | نامشخص در گزارش | نامشخص | نامشخص | ⏳ در انتظار (بازسازی دسترس‌پذیری فعال) |
| چت ۴ | `wave19-chaos-live.bundle` | `/home/user/wave19-chaos-live.bundle` | `arena/01a08a4e-p2` | ۱۳ | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده |
| چت ۴ | `wave19-wal-full.bundle` | `/home/user/wave19-wal-full.bundle` | `arena/01a08a4e-p2` | نامشخص | — | — | — | ⏳ در انتظار (دریل وال-دیسک فعال) |
| چت ۵ | (هنوز ساخته نشده) | — | — | — | — | — | — | ⏳ در انتظار (باگ‌هانت نشست ۷) |
| چت ۷ | `chat7-session6.bundle` | `/home/user/chat7-session6.bundle` | `arena/01a08c7a-p2` | **۲۷** | نامشخص در گزارش | نامشخص | نامشخص | 📝 گزارش‌شده — پرریسک‌ترین |
| چت ۶ | `lessons-learned.bundle` | `/home/user/lessons-learned.bundle` | `arena/01a08b24-p2` | مأموریت ۳۴ | `66e03f0` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `executive-briefing.bundle` | `/home/user/executive-briefing.bundle` | `arena/01a08b24-p2` | مأموریت ۳۵ | `66e03f0` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `release-notes-rc17.bundle` | `/home/user/release-notes-rc17.bundle` | `arena/01a08b24-p2` | مأموریت ۳۵ | `519917e` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `openapi-spec.bundle` | `/home/user/openapi-spec.bundle` | `arena/01a08b24-p2` | مأموریت ۳۶ | `400d59b` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `config-reference.bundle` | `/home/user/config-reference.bundle` | `arena/01a08b24-p2` | مأموریت ۳۷ | `0c84f11` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `pilot-playbook.bundle` | `/home/user/pilot-playbook.bundle` | `arena/01a08b24-p2` | مأموریت ۳۸ | `aefbc29` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `vendor-playbook.bundle` | `/home/user/vendor-playbook.bundle` | `arena/01a08b24-p2` | مأموریت ۳۹ | `cac106d` | نامشخص | نامشخص | ❌ فایل با ریست رفت؛ رأس در گزارش ثبت است |
| چت ۶ | `master-onboarding.bundle` | `/home/user/master-onboarding.bundle` | `arena/01a08b24-p2` | مأموریت ۴۰ | `1d26d8f` | `a30fb20` | ≈۸.۶ مگابایت | ❌ فایل با ریست دوم رفت؛ ✅ تأییدشده در مأموریت ۴۰ |
| چت ۶ | `push-recovery.bundle` | `/home/user/push-recovery.bundle` | `arena/01a08b24-p2` | مأموریت ۴۱ (۱۱ کامیت پس از ریست) | `5f675d4` | `a30fb20` | ≈۸.۶ مگابایت | ❌ فایل با ریست دوم رفت؛ ✅ تأییدشده در مأموریت ۴۱ |
| چت ۶ | `docs-index.bundle` | نامشخص در گزارش | `arena/01a08b24-p2` | نامشخص | نامشخص | نامشخص | نامشخص | 📝 فقط در ابلاغ مأموریت ۴۲ ذکر شده — نیازمند تأیید وجود |
| چت ۶ | `chat6-master-recovery.bundle` | `/home/user/chat6-master-recovery.bundle` | `arena/01a08b24-p2` | کل مأموریت‌های ۳۶–۴۳ | در گزارش مأموریت ۴۳ | `a30fb20` | ≈۸.۶ مگابایت | ✅ تأییدشده — باندل جامع نجات (مأموریت ۴۳) |
| چت ۵ (پ۵) | `chat5-p5.bundle` | `/home/user/bandle/chat5-p5.bundle` | `fix/bughunt-s7-split` + `docs/p5-bughunt-queue` | پ۵ — ۲ کامیت روی ۲ شاخه | `11febdb` | `c91c788` | ≈۵۵.۴ مگابایت | ✅ آمادهٔ نجات — PR [#106](https://github.com/rezaa2544/p2/pull/106) (شکافتِ #74) · PR [#107](https://github.com/rezaa2544/p2/pull/107) (مستنداتِ پ۵ + قفل `rc34`)؛ `sha256=c45c3728…1933` · رأس = کامیتِ **پیش از** کامیتِ همین ردیف (رجیستری خودارجاع نمی‌شود) |
| چت ۵ (نشست ۹) | `chat5-session9.bundle` | `/home/user/bandle/chat5-session9.bundle` | `bug-hunt-session9` + `fix/a11y-modal-focus-s9` + `fix/wave19-wal-drill-s9` | نشستِ ۹ — ۹ کامیت روی ۳ شاخه | `884161c` | `44f645c` | ≈۵۴.۶ مگابایت | ✅ آمادهٔ نجات — PR [#84](https://github.com/rezaa2544/p2/pull/84) (نشست ۹) · PR [#80](https://github.com/rezaa2544/p2/pull/80) (a11y S9-4) · PR [#81](https://github.com/rezaa2544/p2/pull/81) (WAL S9-6/S9-7)؛ `sha256=42a62d41…96fb` · رأس = کامیتِ **پیش از** همین ردیف (رجیستری خودارجاع نمی‌تواند باشد) |

**جمع:** ۲۶ ردیف شناخته‌شده (۵ چت۱ + ۴ چت۲ + ۲ چت۳ + ۲ چت۴ + ۱۱ چت۶ + ۱ چت۷ + ۱ در انتظار چت۵).

---

## ۳) پروتکل راستی‌آزمایی

برای هر باندل، به ترتیب:

1. **وجود فایل:** `ls -la <مسیر>` — اگر نبود، وضعیت ❌ و رجوع به ستون «محل بازیابی».
2. **رأس و تاریخچه:** `git bundle verify <باندل>` باید بدهد: نام شاخه + رأس با گزارش مأموریت یکسان + «complete history» + **okay**.
3. **تطبیق با رجیستری:** رأس/کامیت/شاخه را با ردیف §۲ مقایسه و ستون «آخرین تأیید» را با تاریخ روز به‌روز کنید.
4. **گیت محتوا (پیش از هر مرج):** دود ۵۴۷ · مجوز ۰ · راز ۱۱/۱۱ · بیلد ۰ (طبق `PUSH_RECOVERY_PLAYBOOK.md` §۴).
5. **ثبت نتیجه:** هر تغییر وضعیت ⇒ ویرایش ردیف + بامپ قفل مستندات (این سند فهرست‌شدهٔ قفل است).

**محل بازیابی ردیف‌های ❌:** بایگانی کاربر (فایل‌هایی که در نشست‌های قبلی تحویل گرفته‌اند)؛ اگر آن هم نبود،
کار آن مأموریت از روی گزارش مأموریت **بازسازی** می‌شود (هزینهٔ واقعی ریست — دلیل وجود همین سند).

---

## ۴) دستور بازیابی در نشست جدید

مسیر دقیق هر باندل در ستون «مسیر در سندباکس» §۲ است. در نشست تازهٔ دارای دسترسی گیت‌هاب:

```bash
git bundle verify /home/user/<name>.bundle                 # باید okay بدهد (داخل مخزن)
git fetch origin main
git checkout -b push-<sandbox-name> origin/main            # از ریموت، نه مِین محلیِ کهنه
git bundle list-heads /home/user/<name>.bundle             # رف‌های باندل را ببینید
# رفِ دلخواه را صریحاً واکشی کنید؛ رف‌اسپکِ ستاره‌دار در مبدأ نامعتبر است و
# ستاره‌کردن مقصد هم برای باندل‌های تک‌کامیتی صفر رف می‌سازد (فقط HEAD دارند).
git fetch /home/user/<name>.bundle refs/heads/<branch-in-bundle>:refs/heads/bundle-<sandbox-name>
#   یا برای باندلِ تک‌کامیتی:  HEAD:refs/heads/bundle-<sandbox-name>
git merge bundle-<sandbox-name> --no-ff
# چهار گیت: دود ۵۴۷ · مجوز ۰ · راز ۱۱/۱۱ · بیلد ۰ — شرح کامل: PUSH_RECOVERY_PLAYBOOK.md §۴
git push origin push-<sandbox-name>
```

**ترتیب مرج پیشنهاد سندها** (از `PUSH_RECOVERY_PLAYBOOK.md` §۶):
چت ۷ (۲۷ کامیت) → چت ۴ (۱۳) → چت ۱ (۱۱) → چت ۶ → چت‌های ۲/۳/۵. هر باندل یک پی‌آر جدا؛ تعارض‌ها با حفظ دوطرفه.

---

## ۵) ریسک و اولویت

| رتبه | قلم | ریسک | اقدام |
|---|---|---|---|
| ۱ | `chat7-session6` (۲۷ کامیت) | اگر سندباکس چت ۷ ریست شود و باندل بیرون نیامده باشد، بزرگ‌ترین حجم کار می‌رود | تأیید وجود باندل در اولین فرصت + پوش فوری |
| ۲ | ردیف‌های ❌ چت ۶ (۹ باندل) | فایل‌ها با دو ریست رفته‌اند؛ فقط رأس‌ها ثبت‌اند | بررسی بایگانی کاربر؛ در صورت نبود، بازسازی از گزارش |
| ۳ | ردیف‌های 📝 با جزئیات ناقص | رأس/پایه نامشخص ⇒ هنگام مرج ممکن است «تاریخچهٔ نامرتبط» بدهند | از سندباکس مبدأ یا گزارش، رأس را بگیرید |
| ۴ | ردیف‌های ⏳ | هنوز باندل ندارند | در پایان مأموریت مربوط، باندل + ردیف تازه الزامی است |

---

## ۶) قواعد نگهداری رجیستری

1. **باندل جدید = ردیف جدید، همان لحظه** — در همان کامیت باندل یا نهایتاً کامیت گزارش.
2. هر مأموریت چت ۶ در گزارش خود رأس و تأیید باندل را می‌آورد؛ این سند آن‌ها را متمرکز می‌کند (منبع حقیقتِ «کجا» و «چه وضعیتی»).
3. ویرایش این سند بدون بامپ قفل ممنوع است؛ افزودن ردیف تازه با بامپ انجام می‌شود.
4. پس از مرج موفق هر باندل: وضعیت ردیف → «✅ نجات‌یافته» + پیوند به پی‌آر.


## ۷) حذف‌های ثبت‌شده — پ۰ (پاک‌سازی ورک‌اسپیس، ۲۰۲۶-۰۹-۱۲)

> در مأموریت **پ۰** (بهداشت ورک‌اسپیس سندباکس؛ سقف ۱۲۸MB/۱۰٬۰۰۰ فایل) این اقلام حذف شدند.
> **هر قلم پیش از `rm` یک خط شاهد گرفت** (فایل شاهد: `/tmp/deletion-evidence.log`، ساعت ۱۵:۲۶).
> هیچ‌کدام محتوای یگانه نداشتند؛ بازیابی همه از `origin` ممکن است.

| قلم | حجم | شاهدِ پوشش | بازیابی |
|---|---:|---|---|
| `bandle/chat5-full-history.bundle` | 19M | ۱۱۲ ref · ۱۰۵ عیناً روی origin + ۷ جد · `bundle verify` OK · `sha256 e9c4947eb309…` ≡ مانیفست | بازسازی از `origin` |
| `bandle/chat5-work.bundle` | 18M | HEAD `b872f44f` ∈ `origin/main` · verify OK · `sha256 b4d42414a155…` ≡ مانیفست | `git fetch origin` (رأس روی main) |
| `bandle/chat5-session7.bundle` | 15M | ردیف رجیستری + tip `8ea217a2` ∈ `origin/bug-hunt-session7` · `sha256 002d4ea77a30…` | `git fetch origin bug-hunt-session7` |
| `bandle/chat5-session7-continued.bundle` | 14M | ردیف رجیستری + tip `e3bb9364` ∈ همان شاخه · `sha256 9030dec1252e…` | همان |
| `bandle/chat5-session7-final.bundle` | 14M | ردیف رجیستری + tip `1b6cd4c8` ∈ همان شاخه · `sha256 c69be49ebd74…` | همان |
| `bandle/chat5-session9-worktree.tar.gz` | 12M | ۱۲۰۲ فایل: ۱۱۷۳ مسیر+blob در refها · ۲۷ blob جای‌دیگر · ۲ تولیدیِ gitignored | بازتولید از refها |
| `bandle/chat5-worktree-backup.tar.gz` | 12M | ۱۱۴۹ فایل: ۱۱۲۰ مسیر+blob در refها · ۲۷ blob جای‌دیگر | بازتولید از refها |
| `state-backup-2026-09-12/p2-worktree-dirty.tar.gz` | 12M | ۱۱۹۹ فایل: ۱۱۷۱ مسیر+blob در refها · ۲۵ blob جای‌دیگر · ۳ عیناً روی دیسک · ۰ قلمِ بی‌شاهد | بازتولید از refها |
| `p2/.build-cache.blob` | 1.6M | `.gitignore` خط ۶۸ · خروجیِ `node build.js` | `npm run build` |
| `p2/.build-cache.meta.json` | 8K | `.gitignore` خط ۶۷ · خروجیِ `node build.js` | `npm run build` |
| ۱۴۶ ref محلی/ریموتیِ بی‌استفاده (از ۱۵۹) | — | هر ۵۴ شاخهٔ محلی پیش‌تر «عیناً روی origin یا جدِ آن» تأیید شد · فهرست: `state-backup-2026-09-12/dropped-refs-local.txt` | `git fetch --all` |

**جمعِ حجمِ اقلامِ بالا:** ≈۱۱۷٫۶MB (حجمِ `du` هر قلم؛ قبل از `repack` نهایی).
**حذف‌نشده‌ها (توقفِ آگاهانه):** دو فایلِ `src/js/00-migration.js` + `src/js/27-sync.js` که blob‌هایشان در هیچ ref محلی/ریموتی نبود ⇒ منتقل به
`/home/user/state-backup-2026-09-12/preserved-unpushed/` (حفظ شد، حذف نشد).
**وضعیت ردیف‌های ۴۶/۴۷ (باندل‌های پ۵ و نشست ۹):** این دو فایل روی دیسک نیستند (ریست سندباکس)، اما محتوایشان روی `origin` است؛
وضعیت‌شان هرگز از ref کهنه نتیجه‌گیری نشود — فقط با `git ls-remote` زنده.

---

_چت ۶ (مستندات و انتشار) — مأموریت ۴۲. این رجیستری پس از دو ریست پیاپی سندباکس در یک روز ساخته شد؛
وجودش خود دلیل ضرورتش است._

## ۸) حذف‌های ثبت‌شده — پ۰ دورِ ۲ (پاک‌سازی پیگیر، ۲۰۲۶-۰۹-۱۲ عصر)

> دورِ دوم بهداشت ورک‌اسپیس (۱۴۷MB/۱٬۳۲۳ فایل → ۸۸MB/۳۷ فایل؛ گزارش:
> `daily-reports/2026-09-12-p0-workspace-hygiene.md`). هر قلم پیش از `rm` با شاهدِ remote
> اثبات شد (`/tmp/deletion-evidence-p0r2.log`)؛ هیچ محتوای یگانه‌ای حذف نشد.

| قلم | حجم | شاهدِ پوشش | بازیابی |
|---|---:|---|---|
| `bandle/chat2-work.bundle` | 17M | HEAD `abe9c608` == `origin/feat/delta-schema-gaps` (PR #59؛ ls-remote) · `bundle verify` = complete history · `sha256 aee67a774b40…` ≡ `chat2-sha256.txt` | `git fetch origin feat/delta-schema-gaps` |
| `bandle/chat2-work.patch` | 57K | ۴ پچ == کامیت‌های همان شاخه (`2dad76a9`…) · sha256 ≡ مانیفست | همان |
| `bandle/chat2-worktree-backup.tar.gz` | 11M | ۱۱۲۳ فایل: ۱۱۴/۱۱۷ متفاوتِ SHA-مچ کامل با history remote؛ ۳ فایلِ میانی (HANDOFF/USER_GUIDE/index.html) با تمامِ محتوا در `f4f9797`/`bed30f0`/`08d4492`/`32da05e` (جستجوی `-S`) · sha256 ≡ مانیفست | checkout کامیت‌های نامبرده از origin |
| `p2` (به‌جز `docs/daily-reports/`) | ۳۲M | کپیِ بی‌گیتِ کهنه: ۴۱/۴۴ متفاوت SHA-مچ با history remote؛ `NEXT_ACTIONS`/`ROADMAP` پیش‌نویسِ مقدم‌شده (ردیف‌هایشان در main به‌روزتر)؛ `server/data` = اجرایی (audit.log + jwt.key) | `git clone` از origin |
| `w18-delivery/` + `w18-delivery-bundle.tar.gz` | ۲۶۸K | ۶/۹ فایل == کامیت `81a523e` (PR #94 مرج‌شده)؛ ۳ فایلِ باقی نسخهٔ پیش-اصلاحِ بازبین‌اند — diff دقیقاً guardهای `db43769`/`fffde46` است که نهایی روی remoteاند | `git show 81a523e:<path>` |
| `git-auth.sh` · `replay-push.sh` · `w18-push-rebuild.sh` | ~۲۴K | **توکن GitHub در متنِ فایل‌ها** (نقض قاعدهٔ توکن) — حذفِ امنیتی (P2-5) | — (عمداً بازیابی نمی‌شود؛ توکن‌ها rotate شوند) |
| `replay-manifests/` · دو `*-commit-message.txt` · `build-w18-bundle.sh` | ~۳۲K | مانیفست/پیامِ کامیت‌های موجود در remote (`81a523e`؛ init شاخهٔ `docs/daily-reports-init` در history مرجِ PR #98) | از history remote |
