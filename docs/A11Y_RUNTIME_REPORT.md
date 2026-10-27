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

## فاز ۳ — ناوبریِ صفحه‌کلید (2026-09-11، شاخهٔ `feat/a11y-keyboard-nav`)

بدهیِ فازِ ۲ («focus-trap و ترتیبِ tab سنجیده نشد — axe برایش rule ندارد») بسته شد:
هارنسِ **رفتاریِ** `tests/a11y-keyboard.js` با فشردنِ کلیدهایِ واقعی (`page.keyboard`)
**۹۲ چک** را می‌سنجد — نه ساختارِ DOM، بلکه خودِ رفتار.

### پوششِ آزمون

| گروه | چک‌ها |
|---|---|
| ۱۱ مودال (manager/teacher/superadmin) | focus اولیه واردِ مودال؛ Tab از آخرین→اولین؛ Shift+Tab از اولین→آخرین؛ ۳×Tab بدونِ فرار (trap)؛ Escape می‌بندد؛ focus به بازکننده برمی‌گردد |
| پوستهٔ ۵ نقش (manager/teacher/parent/student/counselor) | نخستین Tab → skip-link؛ Enter → focus رویِ `.main`؛ nav-item فوکوس‌پذیر و با Enter فعال |
| dropdown پوسته (نمایِ موبایل ۴۲۰px) | Enter باز می‌کند؛ ArrowDown/ArrowUp پیمایش؛ Escape می‌بندد + focus برمی‌گردد |
| فرم | ArrowDown رویِ select رفتارِ بومی را حفظ کرده |

### خطِ پایه: ۲۳ قبول / ۵۵ رد → نهایی: **۹۲ / ۰**

| کامیت | رفع | نتیجه |
|---|---|---|
| `aa33cb4` | **focus trap مودال**: `openModal` بازکننده را به‌خاطر می‌سپارد، `role=dialog aria-modal=true` می‌دهد، focus اولیه به نخستین کنترلِ فرم می‌رود، keydown-trap چرخهٔ Tab/Shift+Tab را می‌بندد؛ `closeModal` focus را برمی‌گرداند | 23→67 |
| `81eb468` | **skip-link + nav**: `<a class=skip-link>` نخستین عنصرِ پوسته (تا فوکوس نگیرد مخفی)؛ اکشنِ `skip-to-main` → focus رویِ `.main`؛ `.nav-item` با `role=link tabindex=0` + حلقهٔ `:focus-visible`؛ هندلرِ سراسریِ Enter/Space برایِ عناصرِ غیربومیِ `data-act` | 67→87 |
| `b82bfad` | **dropdown پوسته**: ArrowDown/ArrowUp پیمایشِ چرخه‌ای، Home/End، Escape با capture (تا هندلرِ سراسریِ goBack نبلعد) + بازگشتِ focus به 🎨 | 87→**92** |
| `0ceaa6c` | §6 در `a11y-regressions.js` (35→46 چک) | نگهبان |

### mutation فاز ۳
- حذفِ `role=dialog` → گاردِ استاتیک سرخ (exit 1) ✅
- حذفِ skip-link → گاردِ استاتیک سرخ (exit 1) ✅
- حذفِ listenerِ trap → سوئیتِ رفتاری از ۹۲ به ۷۰ سقوط کرد ✅
- خطِ پایه واقعاً سرخ بود (۵۵ شکست) و با هر کامیت پیوسته بالا آمد (23→67→87→92).

## راستی‌آزماییِ mutation (سبزِ جعلی ممنوع)

- حذفِ `aria-label` از سلکتِ مدرسهٔ ورود → `a11y-regressions.js` خروجی 1 ✅
- بازگرداندنِ `--red` به `#e0405a` → دو چکِ کنتراست سرخ، خروجی 1 ✅
- تستِ runtime پیش از رفع‌ها واقعاً سرخ بود (critical=43, serious=337) و پیوسته با هر کامیتِ رفع پایین آمد (43→2→0 و 337→199→147→20→0).
- فاز ۲: برگرداندنِ `f()` به قالبِ قدیمی → ۳ چک سرخ، خروجی 1 ✅؛ حذفِ hook از `openModal` → ۱ چک سرخ، خروجی 1 ✅؛ تستِ interactive پیش از رفع واقعاً سرخ بود (74/2) و بعدِ رفع صفر/صفر.

## A11Y-MOTION-01 — یافتهٔ **متناوب**ِ `serious: color-contrast` (2026-10-27)

### نشانه
در برخی اجراها `tests/a11y-runtime.js` یک یافتهٔ `serious` از نوعِ `color-contrast` می‌داد و
در اجرایِ بعد، با همان کامیت و همان مرورگر، صفر. یعنی یافته به کد وابسته نبود، به **زمان‌بندی**.

### ریشه (نه نشانه)
axe-core نسبتِ کنتراست را از رنگِ **محاسبه‌شده** (`getComputedStyle`) در لحظهٔ نمونه‌برداری
می‌سازد. اگر در آن لحظه یک CSS animation/transition در جریان باشد، رنگِ خوانده‌شده رنگِ
**آمیختهٔ نیمه‌کاره** است:

| منبعِ حرکت | نمونه | چرا کنتراست را می‌شکند |
|---|---|---|
| `@keyframes pop{from{opacity:0}}` رویِ `.toast`/`.modal` | ظاهر شدنِ toast/modal پس از `render()` | متنِ سفید با opacity≈۰٫۳ رویِ `#101a2e` ترکیب می‌شود ⇒ نسبتِ زیرِ ۴٫۵:۱ |
| `@keyframes fslide{from{opacity:0}}` رویِ `.filter-body` | باز شدنِ پنلِ فیلتر | همان مکانیزم |
| `transition:background .15s,color .15s` رویِ `.nav-item`/`.att-btn`/`.tab`/`.btn`/`.pager` | تغییرِ کلاس با `render()` یا با تایمر | رنگ میانِ دو توکن می‌افتد (مثلاً میانِ `--muted` و `--green-text`) |
| `@keyframes sh/sp/pulse/att-pulse` (بی‌پایان) | skeleton، spinner، sync-chip | با هر نمونه‌برداری در فازِ متفاوتی هستند |

هارنس دو عاملِ تقویت‌کننده داشت:
1. `reducedMotion:'reduce'` برقرار بود، ولی **تنها** قاعدهٔ `@media (prefers-reduced-motion:reduce)`
   در شیت سه انیمیشنِ `.hgt-*` را خاموش می‌کرد؛ ۹ keyframe و ۳۸ transitionِ دیگر زنده بودند.
2. اسکنِ صفحهٔ ورود **هیچ** انتظاری نداشت و بقیهٔ نماها `waitForTimeout(150)` داشتند — عددی
   کوتاه‌تر از `pop .18s`/`fslide .16s`/`sh 1.3s` و وابسته به سرعتِ ماشین. تایمرهایِ دورهٔ
   برنامه (`attTimerPaint` هر ۱s، `bellLiveTick`، `syncConflictsTick`) هم می‌توانند درست پیش از
   نمونه‌برداری یک transitionِ تازه شروع کنند.

### رفع (بدونِ خفه‌کردنِ آزمون)
- `src/styles/base.css`: قاعدهٔ reduced-motion به **همهٔ** حرکت تعمیم یافت —
  `*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;…}`
  ⇒ هر عنصر بلافاصله در حالتِ نهایی رنگ می‌شود و انیمیشنِ بی‌پایان تمام می‌شود. این یک بهبودِ
  واقعیِ دسترس‌پذیری (WCAG 2.3.3) است، نه تنظیمِ آزمون.
- `tests/helpers/a11y-quiescence.js` (نو): سدِ قطعیِ حرکت — `finish()` برای هر انیمیشنِ متناهی،
  `cancel()` برای هر بی‌پایان، دو فریم انتظار تا رنگِ نهایی، سپس بازبینیِ محدود. اگر چیزی آرام
  نشود اسکن انجام **نمی‌شود** و تست شکست می‌دهد؛ مرورگرِ بی‌`getAnimations` هم fail-closed است.
- `tests/a11y-runtime.js`: `waitForTimeout(150)` حذف شد؛ خودِ `scan()` پیش از هر `AxeBuilder.analyze()`
  سد را می‌زند و صفحهٔ ورود سدِ صریح دارد. هیچ قاعده‌ای از axe خفه نشد و شرطِ `critical/serious == 0`
  دست‌نخورده است.

### رگرسیونِ قطعی
`tests/a11y-motion-determinism.js` — **46 چک، 0 شکست**، بدونِ مرورگر:
- ۱۴ چک رویِ سورس/آرتیفکت: قاعدهٔ عمومی + `!important` + تک‌تکرار + حضور در `index.html`ِ ساخته‌شده؛
  سیم‌کشیِ سد در `scan`، نبودِ `waitForTimeout`، حفظِ سیاستِ خروجی (۱/۳) و نبودِ `disableRules`.
- ۱۰ چکِ رفتاری رویِ سد با DOMِ ساختگی: متناهی→`finish`، بی‌پایان→`cancel`، خطایِ `finish`→`cancel`،
  لجباز→`ok=false` (نه skip)، `quiesce()` در چهار حالت fail-closed.
- ۱۲ چکِ mutation (درجا، بدونِ کامیت): برگرداندنِ قاعدهٔ محدود، حذفِ `iteration-count`/`transition-duration`/
  کلِ بلوک/`!important`، و حذفِ سد از `scan`/بازگشتِ `waitForTimeout`/حذفِ require/برداشتنِ
  `reducedMotion` — هر یک نگهبانِ مربوطه را سرخ می‌کند و سورسِ دست‌نخورده سبز است.

**صادقانه:** این تست قطعی‌بودنِ سازوکار را اثبات می‌کند؛ اجرایِ actual مرورگری در این محیط
ممکن نشد (playwright/chromium در دسترس نیست: `exit 3`ِ پیش‌نیاز)، پس «صفر serious رویِ HEADِ نهایی
با Chromiumِ واقعی» یک ادعای اثبات‌نشده باقی می‌ماند تا اجرایِ دارایِ لاگ در CI.
