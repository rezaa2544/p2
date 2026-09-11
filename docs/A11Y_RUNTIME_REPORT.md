# گزارشِ راستی‌آزماییِ دسترس‌پذیری در زمانِ اجرا (A11y Runtime Verification)

**تاریخ:** ۲۰۲۶-۰۹-۱۱ · **شاخه:** `feat/a11y-runtime-verification` · **ابزار:** playwright 1.63.0 + @axe-core/playwright، Chromium Headless Shell 153
**استاندارد:** WCAG 2.0/2.1 سطح A و AA (تگ‌های axe: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`)
**دامنه:** صفحهٔ ورود + ۵ نقش × حداکثر ۱۰ نمایِ اصلی = **۴۵ اسکن** رویِ DOM زندهٔ مرورگرِ واقعی (نه jsdom)

> ⚠️ صداقتِ دامنه: بریفِ مأموریت نقشِ «staff» را خواسته بود؛ این مخزن نقشی به نامِ staff **ندارد**
> (نقش‌ها در `src/js/01-helpers.js` → ROLE_FA). به‌جایش نقشِ **counselor** (مشاور) اسکن شد.

## نقش‌ها و کاربرانِ دمو

| نقشِ بریف | نقشِ واقعی | کاربرِ دمو |
|---|---|---|
| manager | manager | manager1 |
| teacher | teacher | teacher1_1 |
| parent | parent | parent_multi |
| student | student | نخستین کاربرِ نقشِ student |
| staff (موجود نیست) | counselor | counselor1 |

## خطِ پایه (پیش از رفع) — critical=43، serious=337

| قانونِ axe | شدت | نود | نما | شرح |
|---|---|---|---|---|
| `select-name` | critical | 10 | 8 | سلکت بدونِ نامِ دسترس‌پذیر — login (pubschool)، atrisk (riskDays)، sidadiff (term)، attendance/grades (class)، schedule (homepick)، record/children (cert_term، cert_tpl) |
| `label` | critical | 33 | 5 | input بی‌برچسب — چک‌باکس‌هایِ «چک‌لیست فردا» (داشبورد والد/دانش‌آموز)، ورودیِ تاریخِ حضورغیاب، ورودیِ فایلِ تکلیف |
| `color-contrast` | serious | 337 | 44 | کنتراستِ زیرِ 4.5:1 — سرگروه‌هایِ سایدبار، badgeها، sync-chip، دکمه‌هایِ پوسته، متنِ رنگیِ درون‌خطی، toastها، تاریخ‌هایِ کم‌رنگ |

## رفع‌ها (هر رفع = کامیتِ جداگانه)

| کامیت | قانون | رفع | نتیجه |
|---|---|---|---|
| `daee937` | select-name + label | `aria-label` فارسیِ توصیفی رویِ هر ۱۱ کنترلِ بی‌نام؛ برچسبِ چک‌باکسِ داشبورد شمارهٔ زنگ + نامِ درس را می‌گوید | critical: 43 → 0 |
| `d59b3e8` | color-contrast | تیره‌سازیِ توکن‌ها با حفظِ هویتِ رنگی: `--green #0f9d63→#0a6f46`، `--red #e0405a→#b7253f`، `--amber #e08e17→#96590a`؛ توکن‌هایِ متنیِ نو `--green-text/--red-text/--amber-text` برایِ badge/sync-chip رویِ پس‌زمینهٔ soft؛ `.nav-group #64718c→#8b9ab8`؛ `.b-gray→#556074`، `.b-cyan→#09678a`، `.b-purple→#5d3ad6`؛ `toast.warn/err` پس‌زمینهٔ تیره‌تر؛ `--muted` هر سه تم ≥5.3؛ حذفِ `opacity:.7` از تاریخ‌هایِ muted | serious: 337 → 0 |
| `de55ca0` | — | تستِ رگرسیونِ استاتیک `tests/a11y-regressions.js` (28 چک، mutation-verified) + بازساختِ index.html | نگهبانِ بازگشت |

## نتیجهٔ نهایی — پس از رفع‌ها

| شدت | تعداد |
|---|---|
| **critical** | **0** ✅ |
| **serious** | **0** ✅ |
| moderate | 0 |
| minor | 0 |

هر ۴۵ اسکن ✅ — گزارشِ ماشینی: `out/a11y-runtime.json` (در build تولید می‌شود؛ ورژن‌گیری نمی‌شود).

## اجرایِ دوباره

```bash
npm install --no-save playwright @axe-core/playwright
npx playwright install chromium --with-deps
node tests/a11y-runtime.js      # اسکنِ کامل در مرورگرِ واقعی (خروجی 1 اگر critical/serious>0؛ خروجی 3 اگر playwright نصب نیست)
node tests/a11y-regressions.js  # نگهبانِ استاتیک — بدونِ مرورگر، مناسبِ CI سبک
```

## فاز ۲ — مودال‌ها و حالت‌هایِ تعاملی (2026-09-11، شاخهٔ `feat/a11y-modals-interactive`)

بدهیِ فازِ ۱ («اسکن فقط نماهایِ سطحِ NAV») بسته شد: هارنسِ نو `tests/a11y-interactive.js`
**۱۸ سناریویِ حالت‌دار** را هر کدام در contextِ تازهٔ مرورگر می‌سازد و اسکن می‌کند.

### سناریوها

| گروه | سناریوها |
|---|---|
| مودال‌هایِ CRUD | user new/edit، class، subject، calendar event، ticket، school (superadmin)، grade (teacher) |
| مودال‌هایِ تأیید | confirmModal (حذف)، askConfirm (عمومی) |
| مودال‌هایِ گزارش/پنل | syncPanelModal، storageQuotaModal |
| حالتِ خطایِ فرم | invalid() رویِ u_name (الزامی) و u_nid (کد ملی نامعتبر) — has-error + field-error-msg + toast err |
| toast | ok + err + warn هم‌زمان نمایان |
| سایدبار | S.sidebar=true رویِ viewport موبایل (۴۲۰px) + scrim |
| dropdown | منویِ پوستهٔ data-tpopmenu باز |
| بعدِ ورود | مودالِ panel-picker (showPicker) |

ضدِ سبزِ جعلی: هر سناریویِ مودال اثبات می‌کند مودال واقعاً باز شده؛ سناریویِ toast سه toast
می‌شمارد؛ سناریوهایِ خطا وجودِ `.has-error` را چک می‌کنند — سناریویِ ساکت‌شکسته = شکست.

### خطِ پایهٔ فاز ۲ — critical=74، serious=2

| قانون | شدت | نود | سناریو | ریشه |
|---|---|---|---|---|
| `label` | critical | 42 | 10 | هلپرِ مشترکِ `f(label,inner)` در 18-modals: `<label>` بدونِ `for=` |
| `select-name` | critical | 32 | 10 | همان ریشه — سلکت‌هایِ مودال بی‌نام |
| `scrollable-region-focusable` | serious | 2 | 2 | `.vscroll` در syncPanel و `.table-wrap` زیرِ سایدبارِ باز — بدونِ tabindex |

### رفع‌هایِ فاز ۲ (هر رفع = کامیتِ جدا)

| کامیت | رفع | نتیجه |
|---|---|---|
| `2f003cd` | هلپرِ `f()`: اگر کنترل id دارد → `<label for=…>`؛ وگرنه متنِ برچسب → `aria-label`. یک نقطهٔ رفع، ~۳۰ فرمِ مودال درست شدند | critical: 74 → 0 |
| `2014c93` | `a11yScrollablePass(root)` در 01-helpers — بعدِ هر `render()` و هر `openModal()`، به `.table-wrap/.vscroll` سرریزدار `tabindex=0 + role=region + aria-label` می‌دهد (idempotent) | serious: 2 → 0 |
| `904fd93` | §4–5 در `a11y-regressions.js` (28→35 چک) — mutation-verified | نگهبان |

ضمنی: `087a67c` خرابیِ UTF-16 در `.gitignore` را رفع کرد (کامیتِ 9a08ac5 بایت‌هایِ UTF-16LE
چسبانده بود و git خطِ `*` می‌دید — **هر فایلِ تازهٔ مخزن ignore می‌شد**).

### نتیجهٔ نهاییِ فاز ۲

| سوئیت | نتیجه |
|---|---|
| `a11y-interactive.js` (۱۸ سناریو) | **critical=0 serious=0** ✅ |
| `a11y-runtime.js` (۴۵ اسکنِ فاز ۱ — رگرسیون نگرفت) | **critical=0 serious=0** ✅ |
| `a11y-regressions.js` | 35/35 ✅ |

## راستی‌آزماییِ mutation (سبزِ جعلی ممنوع)

- حذفِ `aria-label` از سلکتِ مدرسهٔ ورود → `a11y-regressions.js` خروجی 1 ✅
- بازگرداندنِ `--red` به `#e0405a` → دو چکِ کنتراست سرخ، خروجی 1 ✅
- تستِ runtime پیش از رفع‌ها واقعاً سرخ بود (critical=43, serious=337) و پیوسته با هر کامیتِ رفع پایین آمد (43→2→0 و 337→199→147→20→0).
- فاز ۲: برگرداندنِ `f()` به قالبِ قدیمی → ۳ چک سرخ، خروجی 1 ✅؛ حذفِ hook از `openModal` → ۱ چک سرخ، خروجی 1 ✅؛ تستِ interactive پیش از رفع واقعاً سرخ بود (74/2) و بعدِ رفع صفر/صفر.
