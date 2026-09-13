# گزارش پ۳ — تأیید Wave 21 + وضعیت PRها + آماده‌سازی Wave 23 (2026-09-12)

## ۱) تأیید وضعیت نهایی Wave 21 ✅

| مورد | نتیجه |
|---|---|
| PR #85 از GitHub API | `state: closed`، **`merged: true`**، merged_by: `rezaa2544` |
| Merge commit | **`d1a0bf2`** — با `merge-base --is-ancestor` عضو `main` ✅ |
| کامیت‌های زنجیره در main | هر ۷ مورد ∈ main: `a154b61`، `39843e2`، `57da915`، `9786aa8`، `f95b0ae`، `c841ee4`، `d1a0bf2` ✅ |
| فایل‌های کلیدی روی main | `src/js/76-multigrade.js`، `tests/multi-grade.js`، `docs/MULTI_GRADE_GUIDE.md`، `docs/WAVE21_MULTIGRADE_REPORT.md` — همگی موجود ✅ |
| مستندات | ردیف Wave 21 در `NATIONAL_ROADMAP_PROGRESS.md` = ✅ با Evidence «PR #85 مرج شد @ d1a0bf2»؛ گزارش موج ۲۱ شامل بخش‌های مرج نهایی و راستی‌آزمایی؛ ورودی‌های HANDOFF سرِ جای خود ✅ |

## ۲) وضعیت PRهای باقی‌مانده

| PR | عنوان | وضعیت | جزئیات |
|---|---|---|---|
| **#74** | Bug Hunt Session 7 (unauthenticated DoS + silent queue loss) | **باز — قابل مرج نیست** | `mergeable: false (dirty)` — ۲۰ کامیت / ۱۹ فایل، تعارض با main فعلی؛ نیازمند rebase/حل تعارض توسط مالک شاخه. به شاخه دست نزدم (خارج از ابلاغ). |
| **#81** | fix: HANDOFF mojibake + WAL drill issues (S9) | **✅ مرج شد** | merge commit `9e7da2c` — همان head فعلی `main`؛ merged_by: `rezaa2544` |
| **#84** | Bug Hunt Session 9 (delta ph4 / a11y keyboard / WAL audit) | **✅ مرج شد** | merge commit `886e2da` ∈ main؛ merged_by: `rezaa2544` |

نکته: از سشن قبل تاکنون `main` سه مرج دیگر هم گرفته (#69، #81، #84) و اکنون در `9e7da2c` است.

## ۳) آماده‌سازی محیط Wave 23 ✅

- **شاخه:** `feat/wave23-advanced-reporting` از `main@9e7da2c` ساخته و **push شد**:
  ```
  git ls-remote origin feat/wave23-advanced-reporting
  → 9e7da2c0db545f52819d0bdfd3edd71d2462e793  (= HEAD محلی ✅)
  ```
- **وابستگی‌ها نصب شد:** jsdom + playwright + @axe-core/playwright (npm) و
  chromium headless-shell + کتابخانه‌های سیستمی (`--with-deps`) — بازیابیِ
  اسنپ‌شات همه را پاک کرده بود؛ `chromium.launch()` تست و OK.
- **Baseline پیش از توسعه — همه سبز:**

| گیت | نتیجه |
|---|---|
| `tests/smoke.js` | **547/547** ✅ |
| `tools/check-authz.js` | **exit 0** — تطبیق کامل ✅ |
| `tests/secret-scan.js` | **11/11** ✅ |
| `tests/multi-grade.js` | **34/34** ✅ |
| `tests/a11y-keyboard.js` | **92/92** ✅ |
| `node build.js --check` | سبز (۴/۴ چک) ✅ |

## ۴) شناسایی اولیهٔ زیرساخت گزارش‌دهی موجود (برای Wave 23)

- **خروجی CSV:** اکشن `export-csv` در `src/js/37-admin-tools.js` (مجوز: مدیر)
  — روی فهرست‌های مدارس/کاربران و…
- **داشبوردها:** `src/js/08-dashboard.js` (نمودارهای bar، شمارنده‌ها،
  تفکیک حضور)
- **گزارش منطقه‌ای:** کارت امتیازی منطقه `src/js/74-region-tools.js`
  (امتیاز ۰-۱۰۰ در ۵ بعد + خروجی CSV) و داشبورد اداره `24-edu-office.js`
- **گزارش رویدادهای حضور:** بخش «گزارش رویدادها» در `12-attendance.js`

## ⚠️ نکتهٔ مهم پیش از شروع توسعهٔ Wave 23

«سیستم گزارش‌دهی پیشرفته» در `docs/ROADMAP.md` **تعریف نشده است** (جدول
Waveها تا ۲۰ است؛ ۲۱ در roadmap-progress افزوده شد؛ ردیفی برای ۲۲/۲۳
وجود ندارد). پیش از کدنویسی، بریفِ دامنهٔ دقیق لازم است: کدام گزارش‌ها،
برای کدام نقش‌ها، چه خروجی‌هایی (CSV/چاپ/نمودار)، و آیا سمتِ سرور هم
درگیر است یا فقط کلاینت. **محیط کاملاً آماده است؛ منتظر بریف Wave 23.**
