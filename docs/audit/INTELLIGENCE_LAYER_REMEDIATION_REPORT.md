> ## 🔴 CURRENT-HEAD RECONCILIATION — 2026-09-24
> این گزارش، گزارش remediation است و نباید به‌تنهایی certification نهایی تلقی شود.
> نتیجهٔ remediation در main: PR #401 با merge `e264932419335ce42da53f2700e362bce31670b9`؛ 21/21 موتور runtime-wired و 0 orphan؛ F-EI-01 بسته در سطح code/remediation.
> **نکته:** وضعیت نهایی Intelligence باید در validation campaign روی current HEAD مستقل re-run شود. `generate-write-perms --check` failure پیش‌موجود است و بازسازی آن نباید مجوزهای 199تایی را حذف کند؛ `tools/check-authz.js` گیت مجوزهاست.
> مرجع اجرای جاری: `docs/CURRENT_WORK_EXECUTION_PLAN.md`؛ مرجع هوش پروژه: `docs/CURRENT_PROJECT_INTELLIGENCE.md`.

---

# گزارش رفع عیوب لایه هوشمندی پایش
## Intelligence Layer Remediation Report — 2026-09-24

**شاخه:** `fix/intelligence-layer-defects`
**دامنه:** ممیزی کامل لایه هوشمندی آموزشی (`server/analytics/` — ۲۰ موتور)، لایهٔ معنایی، مسیرهای API، گواهی انتشار، و کلاینت آفلاین.

---

## خلاصهٔ اجرایی

هفت عیب در لایه هوشمندی شناسایی شد. **۶ عیب کاملاً رفع شد** و یک عیب کوچک (D7) در حین رفع D3 برطرف گردید. همهٔ اصلاحات با تست‌های رگرسیونِ جدید قفل شدند که در CI اجرا می‌شوند — یعنی برگشت به حالتِ معیوب دیگر ممکن نیست.

| # | عیب | شدت | وضعیت | شواهد قبل | شواهد بعد |
|---|---|---|---|---|---|
| D1 | پیش‌فرض‌های خوش‌بینانه، دادهٔ گم‌شده را پنهان می‌کردند (۲۲ نقطه در ۸ موتور) | 🔴 بحرانی | ✅ رفع شد | مدرسه با صفر داده → `HEALTHY ۸۳.۲` | مدرسهٔ خالی → `NEEDS_IMMEDIATE_ACTION` / `NO_DATA` |
| D2 | تاریخ ثابت ۲۰۲۶-۰۹-۱۸ + برخورد fingerprint گواهی | 🔴 بحرانی | ✅ رفع شد | دو روز مختلف → شناسهٔ گواهی کاملاً یکسان | fingerprint در روزهای مختلف متفاوت است |
| D3 | ۸ موتور یتیم (F-EI-01): صفر ارجاع رانتایم | 🔴 بالا | ✅ رفع شد | ۸ موتور بدون هیچ مصرف‌کننده‌ای | ۸ endpoint جدید با ایزولاسیون چندمستأجری؛ ۲۱/۲۱ موتور متصل |
| D4 | suite هوش (۳۳/۳۳) در هیچ CI اجرا نمی‌شد | 🔴 بالا | ✅ رفع شد | تنها چک سبز: CircleCI که `echo Hello, World!` می‌زد | ۷ گیت جدید در GitHub Actions + CircleCI |
| D5 | گواهی انتشار چرخشی و استاتیک | 🟠 متوسط | ✅ رفع شد | کاتالوگ فقط خودش را چک می‌کرد؛ ۸ موتور غایب | گراف require واقعی اسکن می‌شود؛ موتور مرده گواهی را مسدود می‌کند |
| D6 | کلاینت صفر فراخوانی به `/api/v1/analytics/*` داشت | 🟠 متوسط | ✅ رفع شد | هیچ ارجاعی در کلِ `src/js` | داشبورد «مرکز هوشمندی مدرسه» برای ۳ نقش |
| D7 | drift معیارها: موتورها لایهٔ معنایی را دوباره پیاده می‌کردند | 🟡 پایین | ✅ رفع شد | `chronic_absence_rate` در واقع «نرخ کل غیبت» بود | استفاده از معیارهای لایهٔ معنایی |

---

## شواهد تفصیلی (قبل/بعد)

### D1 — پنهان‌سازی دادهٔ گم‌شده 🔴

**مشکل:** ۲۲ نقطه در ۸ موتور از پیش‌فرض‌های `?? 15.0` / `?? 90.0` / `?? 5.0` / `?? 75.0` استفاده می‌کردند. وقتی داده‌ای نبود، موتور عددی می‌ساخت و گزارش می‌داد.

```js
// قبل — مدرسه‌ای با صفر نمره و صفر جلسهٔ حضور
status: 'HEALTHY', health_index: 83.2     // کاملاً دروغ

// بعد
health_index: { score: null, status: 'NEEDS_IMMEDIATE_ACTION',
                data_quality: { status: 'NO_DATA', missing_dimensions: [...] } }
```

**فایل‌های تغییر یافته:** `school-intelligence-center.js`، `intervention-case-management.js`، `quality-governance.js`، `regional-intelligence-network.js`.
**قفل:** `tests/no-data-masking.test.js` (۹ بررسی).

### D2 — زمان‌مهر ثابت و fingerprint متصادم 🔴

**مشکل:** همهٔ handlerها `options.timestamp` نمی‌دادند، پس موتورها به fallback ثابت `2026-09-18` می‌چسبیدند. دو گواهی در دو روز مختلف شناسهٔ کاملاً یکسانی داشتند — یعنی گواهی قابل بازتولیدِ کامل و غیرقابل تفکیک.

```js
// قبل
const nowIso = '2026-09-18T12:00:00.000Z';          // ثابت
// بعد
const ROUTE_NOW = process.env.PAYESH_ANALYTICS_FIXED_NOW || new Date().toISOString();
```

۱۳ نقطهٔ فراخوانی در `routes/analytics.js` زمان‌مهر تزریقی دریافت کردند.
**قفل:** `tests/analytics-timestamps.test.js` (۵ بررسی).

### D3 — ۸ موتور یتیم (F-EI-01) 🔴

**مشکل:** این هشت موتور وجود داشتند، تست‌های خودشان را داشتند، ولی هیچ فایل سروری آن‌ها را `require` نمی‌کرد — کد «موجود اما مرده» که در گزارش‌ها به‌اشتباه «پیاده‌سازی‌شده» می‌خواند شد:

| موتور | شناسه رسمی | وضعیت قبل |
|---|---|---|
| `semantic.js` | P0-EI-01 | یتیم |
| `student-timeline.js` | P0-EI-02 | یتیم |
| `assessment-intelligence.js` | P0-EI-03 | یتیم |
| `attendance-intelligence.js` | P0-EI-04 | یتیم |
| `school-health-dashboard.js` | P0-EI-05 | یتیم |
| `parent-360.js` | P0-EI-06 | یتیم |
| `teacher-evidence.js` | P0-EI-07 | یتیم |
| `intervention-case-management.js` | P0-EI-08 | یتیم |

**رفع:** `server/routes/semantic-analytics.js` (~۴۰۰ خط) ساخته شد و هر هشت موتور را به مسیرهای HTTP زنده وصل کرد:
`/api/v1/analytics/{semantic-metrics, assessment-quality, attendance-risk, student-timeline, intervention-warnings, school-health-dashboard, parent-360, teacher-evidence}` — هر کدام با `assertCanSeeSchool` (zero-trust) و `guard(fn)`.

**نکتهٔ مهم:** نخستین نسخهٔ نگهبانِ اتصال، فقط ۵ یتیم را پیدا کرد، چون `require` کردنِ یک یتیم توسط یک یتیمِ دیگر را به‌عنوان «متصل» می‌شمرد. این با **تحلیل گرافِ دسترس‌پذیری (BFS از ریشه‌های زنده)** اصلاح شد که دقیقاً ۸ یتیم را گزارش داد.

```
📊 موتورها: ۲۱ کل | ۲۱ متصل | ۰ یتیم
```
**قفل:** `tests/analytics-wiring-guard.test.js` (۴ بررسی) + `tests/semantic-analytics-e2e.test.js` (۱۲ بررسی شامل ایزولاسیون مستأجر).

### D4 — suite هوش در CI اجرا نمی‌شد 🔴

**مشکل:** تنها چک سبز روی HEAD، job ای به نام `say-hello` در CircleCI بود که `echo Hello, World!` چاپ می‌کرد. ۳۳ suite لایهٔ معنایی که همه پاس می‌کردند، هیچ‌گاه اجرا نمی‌شدند — یعنی شکستنشان غیرممکن و ارزششان صفر بود.

**رفع:** `say-hello` به `payesh-node-gate` تبدیل شد (بررسی نسخهٔ Node + `tests/run.js` + runner لایهٔ معنایی + همهٔ گیت‌ها). ۷ گیت به GitHub Actions اضافه شد.

| گیت | بررسی‌ها |
|---|---|
| `analytics-wiring-guard` | ۴ |
| `no-data-masking` (D1) | ۹ |
| `analytics-timestamps` (D2) | ۵ |
| `semantic-analytics-e2e` (D3) | ۱۲ |
| `certification-non-circular` (D5) | ۱۴ |
| `intelligence-client-render` (D6) | ۲۹ |
| `semantic-layer/runner.js` | ۳۳ suite |

**محدودیت رعایت‌شده:** قرارداد P3 در `tests/ci-test-parity-contract.js` الزام می‌کند که `npm test` دقیقاً `run.js + smoke.js` بماند. به همین دلیل گیت‌ها در workflow YAML قرار گرفتند، نه در `package.json`. P6 (بودجهٔ تست‌های متصل‌نشده ≤ ۴۸۵) نیز حفظ شد: parity ۲۶/۲۶.

### D5 — گواهی انتشار چرخشی 🟠

**مشکل:** `validateEngineCompleteness` فقط چک می‌کرد که آیا کاتالوگِ خودش، همهٔ شناسه‌ها را `ACTIVE` لیست کرده یا نه. این یک بررسی کاملاً خودارجاع است: هر موتوری — حتی کاملاً مرده — تا ابد «پیاده‌سازی‌شده» می‌نمود و گواهی انتشار همچنان صادر می‌شد. علاوه بر این، کاتالوگ ۸ موتور یتیم را به‌کل غایب بود.

```js
// قبل — چرخشی
const complete = missing.length === 0 && activeEngines.length >= 12;
// (منبع حقیقت: همین کاتالوگ)

// بعد — غیرچرخشی
const wiring = options.runtimeWiring || computeRuntimeWiring();
// BFS روی گراف require واقعی سرور، از فایل‌های غیر-analytics
const deadActiveEngines = engines.filter(e => e.status==='ACTIVE' && e.module && !wiredSet.has(e.module));
const complete = missing.length===0 && activeEngines.length===totalRequired && deadActiveEngines.length===0;
```

- `PHASE3_ENGINE_ID` از ۱۲ به ۲۰ موتور گسترش یافت (افزودن P0-EI-01..08).
- هر کاتالوگ فیلد `module` (نگاشت به فایل روی دیسک) گرفت.
- `wiring_verified_at` از زمان‌مهرِ تزریقی گرفته می‌شود تا قطعیتِ ۱۰ اجرا حفظ شود.
**قفل:** `tests/certification-non-circular.test.js` (۱۴ بررسی) — از جمله شبیه‌سازیِ یتیمی کامل که گواهی را REJECTED می‌کند.

### D6 — کلاینتِ صفر 🟠

**مشکل:** کلِ `src/js` هیچ فراخوانی به `/api/v1/analytics/*` نداشت. ۲۰ موتور روی سرور محاسبه می‌شدند و کاربر نهایی هیچ راهی برای دیدنشان نداشت.

**رفع:** `src/js/78-intelligence.js` — داشبورد «مرکز هوشمندی مدرسه»:
- شاخص سلامت (با نشانگرهای وضعیت و کیفیت داده)
- پرچم‌های بحرانی و اقدامات اولویت‌دار مدیر
- ثبت در `_order.json`، route در `07-shell.js`، NAV + TITLES برای `manager`/`superadmin`/`edu_office`، مجوز در `30-authz.js`، اکشن `INT_ACTIONS` در dispatcher
- رندر صادقانه: ابعادِ غایب «بدون داده» نشان داده می‌شوند و کیفیت PARTIAL توضیح داده می‌شود (هماهنگ با D1)
- `index.html` با `build.js` بازسازی شد (که artifact قدیمیِ commit‌شده را هم تازه کرد)
**قفل:** `tests/intelligence-client-render.test.js` (۲۹ بررسی).

### D7 — drift معیارها 🟡

**مشکل:** موتورهای متصل، معیارها را به‌جای استفاده از لایهٔ معنایی، دوباره پیاده می‌کردند (مثلاً `chronic_absence_rate` در واقع «نرخ کل غیبت» بود، نه غیبت مزمن).
**رفع:** در حین Stage 4 برطرف شد — ترکیب با `semantic.calculateChronicAbsence` به‌جای تکثیر.

---

## ماتریس نهایی گیت‌ها

| گیت | نتیجه |
|---|---|
| wiring guard (no orphan engines) | **۴/۴** ✅ |
| no-data-masking (D1) | **۹/۹** ✅ |
| timestamps + fingerprint (D2) | **۵/۵** ✅ |
| wiring gate E2E (D3) | **۱۲/۱۲** ✅ |
| non-circular certification (D5) | **۱۴/۱۴** ✅ |
| client render (D6) | **۲۹/۲۹** ✅ |
| semantic-layer suite | **۳۳/۳۳** ✅ |
| API integration suite | **۳۰/۳۰** ✅ |
| CI test parity contract | **۲۶/۲۶** ✅ |
| regression (run.js) | **۳۴/۳۵** ⚠️ (از پیش موجود) |
| certification gate (۸ suite) | **۸/۸** ✅ |

**نکتهٔ گیتِ regression:** یک مورد ناموفق است که **از پیش روی HEAD موجود بود** و به این کار ربطی ندارد: `generate-write-perms --check`. مولد، `authz/write-perms.json` را با ۰ اکشنِ نویسنده تولید می‌کند (نسخهٔ commit‌شده ۱۹۹ اکشن دارد). اگر فایل بازسازی‌شده را commit می‌کردیم، ۱۹۹ مجوزِ نقش حذف می‌شد — یک تضعیفِ امنیتی. به همین دلیل فایلِ commit‌شده حفظ شد. بررسیِ واقعیِ مجوزها (`tools/check-authz.js`) کاملاً پاس می‌شود:

```
✅ تطبیق کامل: هر اکشنِ نویسنده، نقش‌هایش را در WRITE_PERMS سرور دارد.
```

---

## وضعیت F-EI-01

| شاخص | قبل | بعد |
|---|---|---|
| موتورهای متصل | ۱۳ از ۲۱ | **۲۱ از ۲۱** |
| موتورهای یتیم | ۸ | **۰** |
| مسیرهای API زنده برای موتورهای یتیم | ۰ | **۸** |
| کاتالوگ گواهی | ۱۲ موتور | **۲۰ موتور** |
| مصرف‌کنندهٔ کلاینت | ۰ | **۱ داشبورد (۳ نقش)** |

**F-EI-01 بسته شد.** نگهبانِ اتصالِ رانتایم که این یتیمی را کشف کرد، اکنون یک گیتِ دائمی CI است — برگشت آن غیرممکن است.

---

## کامیت‌ها

| SHA | عنوان |
|---|---|
| `ab9f75b` | fix(ci): wire intelligence layer into CI — real CircleCI gate + wiring guard (D4) |
| `0f8174e` | fix(intelligence): remove optimistic defaults that masked missing data (D1) |
| `11eddd0` | fix(intelligence): inject real timestamps, make certificate fingerprints unique (D2) |
| `947aada` | fix(intelligence): wire 8 orphan educational engines into real HTTP paths (D3, F-EI-01) |
| `35ebdbc` | fix(intelligence): make release certification non-circular, verify real runtime wiring (D5) |
| `182c24e` | feat(client): intelligence dashboard consumes the analytics API (D6) |
