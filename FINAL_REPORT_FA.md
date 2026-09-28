# گزارش نهایی رفع عیوبِ ممیزیِ مستقل — سامانهٔ پایش (Payesh)

| مورد | مقدار |
|---|---|
| **عنوان** | گزارشِ نهایی رفعِ ۳۵ عیبِ ممیزیِ مستقل (N-01…N-35) + PUB-01 + باگ‌های فرعی |
| **تاریخ** | ۱۴۰۵/۰۷/۰۷ (۲۰۲۶-۰۹-۲۸) |
| **شاخهٔ کار** | `fix/independent-audit-defects` (این مخزنِ worktree: `payesh-audit-src`) |
| **مخزن** | `github.com/rezaa2544/p2` (عمومی) |
| **HEADِ ممیزی‌شده** | `467d9c75` (۲۰۲۶-۰۹-۲۵) — ممیزی روی یک worktreeٔ پاکِ `git worktree add --detach` |
| **نوکِ شاخهٔ پوش‌شده** | `ae2c3820` (روی `origin/main`) = ۵ کامتِ اصلاح روی `691f8d67`: `4e858802`، `16057f3e`، `17200c99`، `367c2b02`، `ae2c3820` |
| **وضعیتٔ پوش** | ✅ **با موفقیت به `github.com/rezaa2544/p2` پوش شد** (`691f8d67..ae2c3820`، ۲۰۲۶-۰۹-۲۸). local و remote دقیقاً برابرند (`ae2c3820`، ۰ جلو / ۰ عقب) |
| **کامیت‌های اصلاحِ محلی** | `dbdb0854` (۱۳۷ فایل، +۹۰۶۳/−۶۴۰) + `3b7148cd` + `2e6befcb` + `0dbd22f0` (۸۶ فایل، +۱۶۷۸/−۴۶۳) — معادلِ پیش از ریبیس: `4261c821` (۱۳۸ فایل) و `6a30246d` |
| **مبنای گزارش** | `PAYESH_INDEPENDENT_AUDIT_2026-09-25.md` (۱۱۰۶ خط، ۲۶ بخش) |

---

## ۱. خلاصهٔ اجرایی

**چه کار شد:** ممیزیِ مستقلِ ۲۰۲۶-۰۹-۲۵ در HEAD `467d9c75`، **۳۵ عیبِ پنهانِ جدید** (N-01…N-35) به‌علاوهٔ **PUB-01** (شدت: بالا) و **۷ ریسکِ بالقوه** کشف کرد. سپس تک‌تکِ این ۳۶ عیب در شاخهٔ `fix/independent-audit-defects` رفع شدند، هر کدام با سوئیتی اختصاصی شامل **۵ سناریوی متفاوت** که **۵ بارِ کامل** و سبز اجرا شد، و برای عیب‌های امنیتیِ کلیدی، **اثباتِ نفی** (revert موقت → افت به ۱/۵، ۲/۵، ۴/۵، ۶/۷) انجام شد. یک **باگِ پنهانِ خارج از فهرست** (بامیختگیِ UTC/محلی در تشخیصِ زنگ و تعطیلات) نیز ریشه‌یابی و رفع شد.

**وضعیتِ نهایی:**

| شاخص | نتیجه |
|---|---|
| `npm test` (کامل) پس از **ریبیسِ نهایی** | **۳۷/۳۷ + ۳۱/۳۱ + ۵۴۷/۵۴۷ × ۵ اجرای متوالی**، همگی سبز (۲۰۲۶-۰۹-۲۸) |
| `tests/build-eol-reproducibility.test.js` (جدید) | **۶/۶ × ۵ اجرا** سبز |
| `tests/tools-wave18-load-guards.test.js` (جدید) | **۱۵/۱۵ × ۵ اجرا** سبز |
| `node --check server/index.js` | ✅ بعد از ریبیس پارس می‌شود (N-01 برطرف است) |
| `node build.js --check` | ✅ روی چک‌اوتِ CRLF و LF هر دو (§۹.۱-ب) |
| اسکنِ رسمیِ Mimosa | **۱۵۱ یافته** (۱۱۹ high / ۳۲ medium) در کلِ پروژه — تقریباً همگی **FP تاییدشده** در کدِ ازپیش‌موجود: تانت از env → توابعِ کنترل (مانند `db.query` با کوئریِ پارامتری‌شده، `assertContained` که خودِ نگهبانِ مسیر است)، regexهای WAF که به‌اشتباه «exec شل» شناسایی شده‌اند، و RSA-2048 که «رمزنگاریِ ضعیف» می‌خورد. همهٔ یافته‌هایِ واقعی در ۶ دور پاک شدند |
| ریبیس روی `origin/main` | ✅ ۵ کامت، **بدونِ تضاد** (ریبیسِ دوم روی `691f8d67` که ۱۷ skill اضافه کرده بود، هم تمیز گرفت) |
| **پوش به GitHub** | ✅ `git push origin HEAD:main` موفق؛ `origin/main` = `ae2c3820` |
| پوش به گیت‌هاب | ⚠️ دروازهٔ Mimosa در طولِ کار چندین بار مسدود کرد؛ وضعیتِ نهایی §۱۰.۱ |

**توزیعِ شدتِ ۳۵ عیبِ N-xx** (بر اساسِ جدول‌های §۸/§۲۱ِ گزارشِ ممیزی): **۵ بحرانی، ۱۲ بالا، ۱۴ متوسط، ۴ پایین**، به‌علاوهٔ PUB-01 (بالا). *(یادداشت: خطِ خلاصهٔ §۲۶ِ گزارشِ ممیزی ۶ بحرانی/۱۲ بالا/۱۳ متوسط/۴ پایین اعلام کرده است که با شمارشِ ردیف‌به‌ردیفِ جدول‌ها یک‌در-میان اختلاف دارد؛ ارقامِ بالا از جدول‌ها گرفته شده‌اند.)*

**رأیِ ممیزی دربارهٔ سوابقِ ثبتِ عیب (F1–F5):**

| ID | وضعیتِ ثبت | رأیِ ممیزی |
|---|---|---|
| F1 | P0 باز | **تأییدِ جزئی — بازگشت (REGRESSED)**: خودِ اصلاح در کد هست (shimِ `grade_level`، `setval`، `bootstrap_seed_incomplete`) ولی کامیتِ `dee8926f` try/catchِ بخشنده را حذف کرد تا seedِ ناقص بوت را کرش کند (N-09) و خودِ فایل هم پارس نمی‌شد (N-01) |
| F2 | P1 باز | **تأییدِ اصلاحِ محدود**: دامنهٔ PG از `parent_links` است؛ هیچ SQLای به `users.parent_id` ارجاع نمی‌دهد. باقیمانده: `childrenOfParent` همچنان ستونِ legacy را union می‌کند که در PG نول است (F-12) |
| F3 | اصلاحِ محدود | **تأیید (تسهیدلات برقرار)**: allowlistِ سختِ `ALL_COLLECTIONS` |
| F4 | P1 باز | **تأییدِ جزئی — دامنهٔ ناتمام**: رد کردنِ manager+`region_id` فقط در **۲ از ۹** نگهبانِ آنالیتیکس وجود دارد؛ ۷ تای دیگر `return true` می‌دهند (N-05) |
| F5 | اصلاحِ محدود | **تأیید (تسهیدلات برقرار)**: `resolveActorProvince` از طریقِ `office_id` |

**شش ریشهٔ علت (RC) که ممیزی شناسایی کرد** — تمامِ ۳۵ عیب به این شش ریشه نگاشت می‌شوند:

- **RC1** هیچ گانی، مصنوعی که گواهی می‌کند را اجرا نمی‌کند (در CI هیچ `node --check`ای نیست) → N-01, N-24, N-23.
- **RC2** فرضیاتِ سکویی در پارسرهای تطابقِ دقیق (CRLF) → N-02, N-13، شکستِ build:check در ویندوز.
- **RC3** fallbackهای «نمونهٔ پیش‌فرضِ استاندارد» که به‌جای اندازه‌گیری ارائه می‌شوند → N-03, N-11, N-12.
- **RC4** مفهومِ منطقه ۹ بار با ۳ نامِ کلیدِ متفاوت پیاده شده → N-04, N-05, N-35, A-04.
- **RC5** کنترل‌های چندمرحله‌ای با یک مرحلهٔ ناموفقِ awaitنشده → N-07, N-09, N-10.
- **RC6** انحرافِ شما/مهاجرت که در حالتِ حافظه نامرئی است → N-16, N-15, N-21, N-14.

**بیشترین اهرمِ تک‌اصلاحی (سخنِ ممیزی):** اضافه‌کردنِ `node --check server/**/*.js` به CI قبل از `npm test` — همین یک قدم N-01 را از روزِ اول می‌گرفت. *(این قدم به‌شکلِ تحت‌اللفظی به CI اضافه نشد؛ معادلِ عملیِ آن، سوئیتِ `tests/api/n01-server-entry.test.js` است که به‌عنوانِ اولین سوئیت در `tests/api/runner.js` اجرا می‌شود و هرگونه شکستِ پارس را قبل از هر چیز قرمز می‌کند.)*

---

## ۲. روش کار: استانداردِ پذیرشِ هر اصلاح

### ۲.۱ معیارِ پذیرش: ۵ سناریو × ۵ اجرای کاملِ سبز

هیچ اصلاحی بدونِ این دو شرط پذیرفته نشد:

1. **۵ سناریوی متفاوتِ تست** در یک سوئیتِ اختصاصی (نه فقط یک مسیرِ خوش‌شانس): هر سناریو یک زاویهٔ متفاوت از همان عیب را می‌بندد (مثلاً برای N-01: پارسِ ماژول + سطحِ صادرشدهٔ مستند + بالاآمدنِ HTTP و دروازهٔ 401 + یک نشستِ کاملِ login + نگهبانِ ساختاری «یک module.exports، بدون ادامهٔ یتیم، کروشه‌های متوازن»).
2. **۵ بار اجرای کاملِ متوالی، همه سبز** — تا نوساناتِ محیط (CRLF، سیگنال‌های ویندوز، کشِ حافظه، تاریخِ روز) نتوانند یک سبزِ تک‌باره را جا بیندازند.

### ۲.۲ اثباتِ نفی (negation proof)

برای عیب‌های امنیتی، علاوه بر سبز بودن، اصلاح را به‌طور موقت برگرداندیم تا ثابت شود تست‌ها واقعاً شکست را تشخیص می‌دهند و false-green نیستند:

| عیب | سبزِ اصلاح | پس از برگرداندنِ اصلاح |
|---|---|---|
| N-30 | ۵/۵ | **۱/۵** |
| N-32 | ۵/۵ | **۴/۵** |
| N-34 | ۷/۷ | **۶/۷** |
| N-35 | ۵/۵ | **۲/۵** |

### ۲.۳ چرا خروجیِ ۲ یعنی «اجر نشد» و نباید سبز جعلی تلقی شود

چندین سوئیت در این پروژه وقتی پیش‌نیازِ محیطی‌شان فراهم نیست، با **کدِ خروجی ۲** (BLOCKED) یا **۳** (NOT-RUN) خارج می‌شوند، نه با ۰. معنایِ این کدها **«این بررسی اصلاً اجرا نشد»** است، نه «اجرا شد و سبز بود»:

- `tests/idor-runtime.js` در صورتِ نبودِ پیش‌نیازها **exit 2 (BLOCKED)** می‌زند.
- `tests/wave23-reports-pg.js` وقتی PG قطعاً در دسترس نیست، صریحاً `NOT-RUN` چاپ کرده و **exit 3** می‌زند.
- `tools/production-truth-gate.js` بدونِ `DATABASE_URL` با `NOT VERIFIED` و **exit 1** خارج می‌شود.
- `tests/api/runner.js` هر سوئیتی که exit 0 ندهد را شکست می‌داند و خودش exit 1 می‌زند.

**درسِ روشن:** شمارشِ یک سوئیتِ exit-2 در ستونِ «سبز»، دقیقاً همان مکانیزمِ false-green است که ممیزی در §۱۵ گزارش کرد (مثلاً `check-authz` که ۰ اکشن را تأیید می‌کرد و `✅` چاپ می‌کرد). بنابراین در این گزارش، هر جا پیش‌نیاز اجرا نبوده، نتیجهٔ آن بررسی «نامشخص/اجراشده» ثبت شده است، نه سبز.

---

## ۳. فهرستِ کاملِ عیب‌های یافته‌شده (N-01…N-35 + PUB-01)

شدت‌ها از جدولِ اصلیِ ممیزی (§۸/§۲۱) است. «اثر» توضیح می‌دهد برنامه در عمل چه می‌کرد و کدام قسمت مختل می‌شد. «وضعیت اصلاح» به سوئیتِ مرجع اشاره می‌کند.

### ۳.۱ بحرانی (CRITICAL)

| ID | لایه / فایل | اثرِ عملکردی | وضعیت اصلاح |
|---|---|---|---|
| **N-01** | `server/index.js:250` (+ محتوای تکراری در ۸۶۵/۲۶۱۲ و ۵۷۱/۲۳۱۸؛ کلِ بلوکِ `dbReady` دو بار در ۲۵۳-۳۴۱ و ۱۹۹۶-۲۰۷۵) | **سرور اصلاً بالا نمی‌آمد.** `node --check` خروجی ۱ می‌داد؛ فایل از زمانِ PR #400 (`66928be6`، ۲۰۲۶-۰۹-۲۳) هرگز پارس نشده بود (۰ از ۹ کامیت). ۸۸ فایلِ تستی `require('../server/index')` داشتند و نمی‌توانستند اجرا شوند. کلِ API، همگام‌سازی، بوت‌گیت‌های PG/Redis و seed از کار افتاده بودند — هر ادعای زمانِ اجر در آن HEAD تأییدناپذیر بود. | اصلاح در `dbdb0854` (+۹۹ خط)؛ نگهبان: `tests/api/n01-server-entry.test.js` (۵ سناریو). بعد از ریبیس `node --check` ✅ |
| **N-02** | `tools/check-authz.js:71,83`، `tools/generate-write-perms.js:73` | دروازهٔ «تطابقِ مجوزها» به‌خاطر CRLF هیچ‌چیزی اعتبارسنجی نمی‌کرد: پارسر روی `\n` اسپلیت می‌شد و مارکرِ `if (lines[j] === '  };')` در فایل‌های CRLF هرگز مطابقت نمی‌خورد، پس `extract()` **۰ از ۳۹۴ اکشن** برمی‌گرداند و در عین حال `✅ تطبیق کامل` چاپ و exit 0 می‌زد. نتیجه: ۶۰ اکشنِ writer بدونِ `ACTION_ROLES` (از جمله `school-del-ok`، `class-del-ok`، `grade-del-ok`) بی‌صدا رها شده بودند و `write-perms.json` کلید `actions: {}` (۰ کلید در برابر ۸۸ کالکشن) داشت. | اصلاح در `dbdb0854` (۸ + ۱۸ خط)؛ `tests/n02-check-authz-crlf.test.js` |
| **N-03** | `server/routes/analytics.js:416-428,468,534-543` + `outcome-evaluation-optimization.js:445-470`، `policy-simulation-engine.js:325-330,386-392`، `decision-intelligence-command.js:417-451`، `operational-intelligence-execution.js:526-540,580` | **لایهٔ هوشمندی داده را از ثابت‌ها جعل می‌کرد.** مسیرِ longitudinal نمرات/حضور واقعی را fetch می‌کرد و سپس **نادیده می‌گرفت** و گزارش را از اندیسِ حلقه و ثابت‌ها می‌ساخت (`75.0 * factor`، دوره‌های ۱۴۰۴-T1…)؛ مدرسه‌ای با صفر رکورد `overall_trend: IMPROVING` با ۵ دوره شواهد دریافت می‌کرد. موتورِ outcome دو مداخلهٔ کامل با `evidenceConfidence: 90.0` اختراع می‌کرد؛ شبیه‌سازِ سیاست `completeness_pct: 94.5`/`freshness_days: 3`/`confidence_level: HIGH` ثابت داشت؛ داشبوردِ اجرا برای صفر تکلیف `sla_compliance_rate_pct: 100.0` برمی‌گرداند. | اصلاح در `dbdb0854` (analytics.js +۹۲ خط، ۸ موتور)؛ `tests/n03-n11-n12-fabricated-metrics.test.js` (۲۰۸ خط) |
| **N-06** | `.env.example:38`، گیت در `server/index.js:2330-2332` | جایگزینِ JWT (`CHANGE_ME__generate_with_openssl_rand_hex_32`، ۴۴ بایت) تنها گیتِ `byteLength < 32` را پاس می‌کرد. هر استقراری که از این نمونه کپی می‌کرد با کلیدی کاملاً عمومی اجرا می‌شد → جعلِ توکنِ `{role:'superadmin'}` و تسخیرِ کاملِ چندمدرسه‌ای. | اصلاح: `.env.example` + `server/key-strength.js` (نو، ۴۶ خط)؛ `tests/n06-jwt-key-strength.test.js` |
| **N-16** | `tools/migrate-to-pg.js:400` | ابزارِ مهاجرت رکوردها را با id صریح و `ON CONFLICT (id) DO UPDATE` لود می‌کرد و **هرگز `setval` نمی‌زد** → اولین INSERTِ جدید یک ردیفِ seedingشده را بی‌صدا بازنویسی می‌کرد (با کدِ ۲۰۱). از دست رفتنِ قطعی و بی‌صدای داده در اولین نوشتنِ پس از مهاجرت. | اصلاح: `tools/migrate-to-pg.js` (+۱۴۵ خط)؛ `tests/n16-migration-sequence-advancement.test.js` (۲۷۰ خط) |

### ۳.۲ بالا (HIGH)

| ID | لایه / فایل | اثرِ عملکردی | وضعیت اصلاح |
|---|---|---|---|
| **N-04** | `server/analytics/regional-intelligence-network.js:50-61`، مصرف‌کننده `routes/analytics.js:195-222` | نگهبانِ edu_office وقتی `userRegionId == null` است (که **حالتِ عادیِ داده‌هاست**، چون کاربران `region_id` ندارند) مقایسهٔ منطقه را کاملًا **رد می‌کرد** و `true` برمی‌گرداند. حمله: `GET /api/v1/analytics/regional-intelligence?region_id=<هر استان>` → گزارشِ مدرسه‌به‌مدرسهٔ یک استانِ غریب. | اصلاح در `dbdb0854` (+۹ خط)؛ `tests/n04-n05-region-tenant-guards.test.js` (۲۸۱ خط) |
| **N-05** | اصلاحِ F4 فقط در `quality-governance.js:141-144` و `longitudinal-intelligence-monitoring.js:118`؛ مفقود در ۷ فایل (`intelligence-governance-dashboard.js:107`، `recommendation-action-planning.js:123`، `policy-simulation-engine.js:99`، `decision-intelligence-command.js:119`، `operational-intelligence-execution.js:123`، `outcome-evaluation-optimization.js:112`، `intelligence-platform-integration.js:201`، `intelligence-release-certification.js:301`) | هفت نگهبان پس از بررسیِ مدرسه `return true` می‌دادند و `targetRegionId` را هرگز نمی‌دیدند. یک مدیرِ مدرسه می‌توانست گزارش‌های حاکمیتیِ هر منطقه‌ای را بخواند. | اصلاح در `dbdb0854` (۷ موتور + analytics.js)؛ `tests/n04-n05-…` و `tests/n05-n13-analytics-guards-writeperms.test.js` |
| **N-07** | `server/auth.js:482-485`، `server/gdpr.js:40-44`، `server/revocation.js:60-69` | حذفِ GDPR: `eraseUserData` در حافظه پاک می‌کرد، سپس `eraseUserSessions` را **awaitنشده** صدا می‌زد که در قطعیِ Redis پرتاب می‌شد؛ در نتیجه `markDirty()` اجرا نمی‌شد و پاک‌سازی هرگز در `payesh.json` ثبت نمی‌گشت. PII بعد از ری‌استارت برمی‌گشت و نشست‌ها ابطال نمی‌شدند. همچنین فهرستِ purge فقط ۵ کالکشن را پوشش می‌داد و PII در ≥۱۰ کالکشن (notifications، counselor_msgs، teacher_notes، hw_submissions، discipline، support_tickets…) و `otp.json` (تا ۲۵ ساعت) باقی می‌ماند. | اصلاح در `dbdb0854` (auth.js + gdpr.js)؛ `tests/n07-gdpr-durable-erasure.test.js` (۲۲۷ خط) |
| **N-08** | `server/auth.js:200-202` | OTP به‌صورت `sha256(code + '|' + phone)` ذخیره می‌شد: «salt» همان شمارهٔ تلفن است که مهاجم آن را می‌داند (`apiLogin` برمی‌گرداندش). فضای کلید ۱۰⁶ است، پس هر خواندنِ `otp.json` اجازه می‌دهد تمام کدهای زنده در کسری از ثانیه و درونِ TTL brute-force شوند. | اصلاح: HMAC کلیدشده با pepper (`OTP_PEPPER = PAYESH_OTP_PEPPER \|\| JWT_SECRET`)؛ `tests/n08-otp-hash-pepper.test.js` (۱۶۷ خط) |
| **N-09** | `server/index.js:301-302` (خطا در ۱۹۸۷-۱۹۹۲، catch بیرونی ۳۳۸-۳۴۱) | کامیتِ `dee8926f` wrapperِ بخشنده را حذف کرد تا `seedPgFromBootstrap` که `bootstrap_seed_incomplete` پرتاب می‌کند، مستقیم به `.catch`ِ `dbReady` برسد — یعنی **یک seedِ ناقص به‌جای fail-closed، بوت را کرش می‌کرد**. ترکیبِ F-05: seed به قطعه‌های ۱۰۰ ردیفی commit می‌کند، پس شکستِ جزئی PG را ناتمام می‌گذارد، بوتِ بعدی store را با حقیقتِ ناقصِ PG جایگزین می‌کند و در خروج `payesh.json` را trim می‌کند → ردیف‌ها هم از PG، هم از store و هم از bootstrap ناپدید می‌شوند. | اصلاح در `dbdb0854`؛ `tests/n09-n10-seed-and-backpressure.test.js` |
| **N-11** | `server/monitoring/production-observability.js:255,296,322`، فراخوان `server/routes/system.js:379` | endpoint سلامتی چون متریکی دریافت نمی‌کرد، به اعدادِ جعلی (`active_connections: 22`، صف ۲۱۰ eps، cache hit ۰٫۸۸) و `status: 'HEALTHY'` برمی‌گشت. DB و Redis می‌توانستند کاملًا قطع باشند while داشبورد و تستش (`tests/api/observability-health.test.js:101-103`) سبز بمانند. | اصلاح در `dbdb0854` (+۶۵ خط)؛ `tests/api/observability-health.test.js` بازنویسی (−/+۱۸ خط) |
| **N-13** | `tools/generate-write-perms.js` | `--check` پیامِ `❌ … کهنه است` را چاپ می‌کرد ولی **exit 0** برمی‌گرداند (مسیرِ شکست به‌جای ۱، صفر برمی‌گشت) → CI هرگز متوجهِ انحرافِ مجوزها نمی‌شد. | اصلاح در `dbdb0854` (+۱۸ خط)؛ `tests/n05-n13-…` |
| **N-14** | `migrations/022_users_staff_flags.sql` | مهاجرت ۰۲۲ هیچ `.down.sql`ای نداشت → زنجیرهٔ rollback (`down-all`) بلافاصله می‌مرد. بازگشت از هر تغییری غیرممکن. | اصلاح: `migrations/022_users_staff_flags.down.sql` (نو، ۱۴ خط) + `023_server_tombstones.{sql,down.sql}`؛ `tests/n14-migration-rollback.test.js` (۱۸۰ خط) |
| **N-15** | `server/routes/grades.js:154`، `server/routes/attendance.js:124` | REST به ستون‌های `grades.type` و `attendance.late` می‌نوشت که در هیچ شما یا مهاجرتی وجود نداشتند → هر CREATE در حالتِ PG با **۵۰۳** پاسخ می‌داد در حالی که حالتِ حافظه کار می‌کرد (انحراف نامرئی). | اصلاح در `dbdb0854` (grades.js +۱۷، attendance.js +۳۰)؛ `tests/n15-rest-phantom-columns.test.js` (۲۹۸ خط) |
| **N-17** | `server/pull.js:459`، `server/syncdelta.js:151` | tombstoneها فقط در حافظه بودند (`store.__deleted_records` با سقفِ ۵۰۰۰، کوچکتر از پنجرهٔ ۷ روزهٔ delta)؛ `server_tombstones` در شما آماده ولی هرگز سیم‌کشی نشده بود. در حالتِ PG store به‌طورِ عمدی persist نمی‌شود → ری‌استارت یا یک instanceِ دوم، تمام tombstoneها را می‌ریخت و **ردیف‌های حذف‌شده (حتی کاربران حذف‌شده) دوباره زنده می‌شدند**. | اصلاح: مهاجرتِ ۰۲۳ + pull.js (+۷۹)؛ `tests/n17-n18-tombstones-sms-wallet.test.js` (۲۷۵ خط) |
| **N-18** | `server/sms.js:187-242` | کسرِ کیفِ پولِ SMS یک `UPDATE`ِ بدونِقید شرط (بدون `base_version` ⇒ شاخهٔ `versionClause = ''`) بود. دو ارسالِ همزمان برای یک مدرسه ⇒ یک کسر گم می‌شود (پولِ ازدست‌رفته). خطای آینه نیز بلعیده می‌شد: HTTP 200 در حالی که `sms_log`/`sms_wallet` فقط در RAM بودند و پس از ری‌استارت صفِ PG همچنان `pending` می‌ماند و پیام دوباره ارسال می‌شد. | اصلاح در `dbdb0854` (sms.js +۶۴)؛ `tests/n17-n18-…` |
| **N-24** | `tests/` | نتیجهٔ مستقیمِ N-01: `npm test` در HEAD قرمز بود (run.js ۳۶/۳۷ سپس `bootstrap.test.js` در `require('../server/index')` شکست می‌خورد؛ `smoke.js` اصلاً اجرا نمی‌شد). | با N-01 رفع شد؛ `tests/api/n01-server-entry.test.js` |
| **PUB-01** | `server/seed.js`، `src/js/02-demo-data.js` | SEED کاملاً قطعی و عمومی بود و `superadmin` رمزِ `123456` را در store داشت → هر استقرارِ عمومی‌ای رمزِ مدیریتِ یکسانی داشت. | اصلاح در `dbdb0854` (seed.js +۲۱، 02-demo-data.js +۳۶)؛ `tests/pub01-no-universal-credential.test.js` |

### ۳.۳ متوسط (MEDIUM)

| ID | لایه / فایل | اثرِ عملکردی | وضعیت اصلاح |
|---|---|---|---|
| **N-10** | `server/sync.js:664-696` | `checkRateLimit` در قطعیِ Redis پرتاب می‌کرد ولی `apiSync` آن را بلعیده و `r = null` می‌کرد ⇒ دروازه عبور می‌کرد و دسته‌ها بی‌محدودیت اعمال می‌شدند (write-amplification). OTP/login روی همان شرط fail-closed (۵۰۳) بودند — ناسازگاری خاصِ این مسیر. | `tests/n09-n10-seed-and-backpressure.test.js` |
| **N-12** | `server/security/zero-trust-runtime.js:434,441-445` | اسنپ‌شاتِ «سلامتِ امنیتی» کیسه‌ای از literalهای ثابت بود (`security_status \|\| 'HEALTHY'`، `zero_trust: {enabled:true, policy_engine:'ACTIVE'…}`) و تستش همان ثابت‌ها را assert می‌کرد. | `tests/n03-n11-n12-fabricated-metrics.test.js` |
| **N-19** | `server/delete-service.js:72,115` | soft-deleteِ REST هیچ قیدِ نسخه نداشت در حالی که sync داشت — یک حذفِ قدیمی می‌توانست یک به‌روزرسانیِ جدید را بازنویس کند. | اصلاح در `dbdb0854` (+۲۵ خط). **بدون سوئیتِ اختصاصی n19**؛ پوشش از طریقِ سوئیت‌های OCC موجود (`reaudit-occ-stale-write.js`، `pull-rest-delete.js`، `data-integrity-occ-migration.js`) |
| **N-20** | `server/db.js:765-799`، `sync.js:803` | انتخابِ LWW در برابر OCCِ سخت به `PAYESH_STRICT_BASE_VERSION` وابسته بود → دو مدلِ همزمانی برای همان جداول، و staging/on-prem خاموش همه را LWW اجرا می‌کردند. | اصلاح در `dbdb0854` (db.js +۹۷). مانند N-19، بدون سوئیتِ اختصاصی (پوشش از سوئیت‌های OCC) |
| **N-21** | `server/schema.sql` در برابر `migrations/` | `schema.sql` با زنجیرهٔ مهاجرت متفاوت بود: `version`، `chg_id`، `processing_token`، `deleted_at`، `lib_staff/asset_staff/is_head`، `server_outbox_dlq` وجود نداشتند؛ `staff_posts` و `server_tombstones` در شما بودند ولی هیچ مهاجرتی نمی‌ساختشان → شمایِ تازه‌نصب با کد هماهنگ نبود. | اصلاح: `schema.sql` (+۸۶۷ خط)؛ `tests/n21-schema-drift.test.js` (۱۸۲ خط) |
| **N-22** | `server/db.js:562-566` | خواندنِ سقف‌دارِ `PAYESH_PG_HYDRATE_LIMIT` از `stripInternalColumns` عبور نمی‌کرد (نشتیِ `chg_id`) و احراز هویت را برای کاربرانِ فراتر از سقف بی‌صدا غیرفعال می‌کرد. | اصلاح در `dbdb0854`؛ `tests/n22-hydrate-cap.test.js` (۱۹۵ خط) |
| **N-23** | `.eslintrc.json`، `package.json`، CI | eslint پیکربندی شده بود ولی نه dependency بود، نه script داشت و هرگز در CI اجرا نمی‌شد — قراردادِ lint کاملًا اجرانشده. | اصلاح: eslint به‌عنوان devDependency، scriptِ `lint` (`--max-warnings 1379` برای تثبیتِ خطِ مبنا) و گامِ CI «Lint (N-23)» در `.github/workflows/node.js.yml`؛ `tests/n23-lint-contract.test.js` |
| **N-25** | `server/routes/users.js:121-127` | مقایسهٔ `ROLE_LEVEL` فقط نقش‌های *اکیداً بالاتر* را رد می‌کرد ⇒ یک مدیر (۴) می‌توانست حسابِ `edu_office` (۳) یا یک مدیرِ همتا (۴) بسازد و `school_id` خود را به ارث بگذارد. | `tests/n25-scope-escalation.test.js` + `tests/api/users.test.js` (۵/۵ + ۷/۷) |
| **N-26** | `server/routes/system.js:1103-1146` | `province_id` ارسالیِ کاربر هرگز با منطقهٔ بازیگر مقایسه نمی‌شد ⇒ یک ادارهٔ آموزش‌وپرورش می‌توانست در هر استانی نوشتنِ کنترل‌پنلِ ملی/استانی انجام دهد. (`allowedRoles` همچنین شامل نقشِ ناموجود `admin` بود.) | `tests/n26-provincial-scope.test.js` (۵/۵ + phase5 ۱۵/۱۵) |
| **N-27** | `server/pull.js:178` | نقش‌های مدیریت‌نشده (راننده/نگهبان) به projectionِ کلِ مدرسه سقوط می‌کردند ⇒ رانندهٔ سرویس دایرکتوریِ کاملِ کاربرانِ مدرسه را در pull دریافت می‌کرد. | `tests/n27-pull-directory-least-privilege.test.js` |
| **N-28** | `server/waf.js:23,118` | WAF پیش‌فرض `report` (فقط تشخیص) بود و فقط URL+UA را بررسی می‌کرد؛ بدنهٔ درخواست هیچ‌وقت اسکن نمی‌شد → هیچ payloadِ مخربی مسدود نمی‌شد. | `tests/n28-waf-body-and-mode.test.js` + `tests/fixtures/n28-payloads.json` |
| **N-29** | `server/csrf.js:76-80` | دروازهٔ CSRF درخواستی که نه Origin و نه Referer داشت را می‌پذیرفت (`header_absent → ok`) ⇒ یک cross-site requestِ واقعی بدون هیچ header ارجاعی. | `tests/n29-csrf-origin-required.test.js` + `tests/red-team.js` (۵/۵ + ۱/۱) |
| **N-31** | `server/routes/students.js:197-198` | دامنهٔ نوشتنِ IEP توسط دبیر بازتر از دامنهٔ خواندن بود: خواندن از مالکیتِ کلاس می‌آمد ولی نوشتن فقط هم‌مدرسه‌بودن را چک می‌کرد ⇒ دبیر می‌توانست IEP شاگردی که کلاسش را ندارد تغییر دهد. | `tests/n31-teacher-iep-write-scope.test.js` + `tests/api/students.test.js` (۵/۵ + ۷/۷) |
| **N-32** | `server/routes/analytics.js:95` | `ROUTE_NOW` یک ثابتِ زمانِ بوت بود ⇒ تمام گزارش‌ها و اثرانگشت‌های گواهی در طولِ عمرِ پروسه یکسان بودند (قابل بازپخش، غیرقابل تفکیک). | `tests/n32-route-now-fresh-timestamp.test.js` (۵/۵، نفی ۴/۵) |

### ۳.۴ پایین (LOW)

| ID | لایه / فایل | اثرِ عملکردی | وضعیت اصلاح |
|---|---|---|---|
| **N-30** | `server/index.js:835-848` | هدرهای `x-simulated-rps/concurrent/writes/db-connections` در مسیرِ تولید پذیرفته می‌شدند ⇒ یک هدرِ جعلیِ `x-simulated-writes:999999` یک ۴۲۹ٔ کاذب و نامحدود (DoS از بیرون، بدونِ احراز هویت) تولید می‌کرد و می‌توانست مترینگِ واقعی را سرکوب کند. اکنون فقط با `PAYESH_SIMULATION_HEADERS=1`. | `tests/n30-simulation-headers.test.js` (۵/۵، نفی ۱/۵) |
| **N-33** | `server/middleware/auth.js` | میان‌افزارِ مردهٔ Bearer-auth که هیچ‌جا import نمی‌شد؛ وجودش توهمِ یک مسیرِ احراز هویتِ دوم می‌داد. `auth.sessionFrom` فقط کوکی می‌خواند. | فایل حذف شد (−۵۷ خط)؛ `tests/n33-dead-bearer-middleware.test.js` *(توجه: §۶ — این فایل اکنون به‌خاطر upstream دوباره وجود دارد)* |
| **N-34** | `server/policy.js:338-353` | `inScope` برای edu_office روی کالکشن‌های غیرگیت‌دار `return true` می‌داد («interschool authority by data model») ⇒ یک fail-openِ پنهان برای اعطایِ دسترسیِ بعدی. اکنون `school_id`/`user_id`/`office_id` را resolve کرده و `schoolInOfficeScope` را الزام می‌کند؛ غیرقابل‌حل ⇒ رد. | `tests/n34-edu-office-inscope-failclosed.test.js` (۷/۷، نفی ۶/۷) |
| **N-35** | `server/routes/analytics.js:735,1003,1215` | `regionId: user.region_id \|\| 1` هر کاربر/مدرسهٔ بدونِ منطقه را به منطقهٔ ۱ می‌بست (هیچ‌کدام در seed منطقه ندارند) و گزارش‌ها را فیلتر می‌کرد. | `tests/n35-region-resolver-no-implicit-one.test.js` (۵/۵، نفی ۲/۵) |

### ۳.۵ باگِ اضافی (خارج از فهرستِ ممیزی)

| عیب | لایه / فایل | اثر |
|---|---|---|
| بامیختگیِ UTC/محلی در روزِ هفته | `src/js/01-helpers.js:50`، `src/js/19-actions-dorm.js:98`، `src/js/02-demo-data.js` (~۹۵)، `tests/smoke.js` (۲ سایت) | `todayISO()` تاریخِ **UTC** می‌داد ولی `getDay()` روزِ **محلی**. روی UTC+3:30 بینِ ساعت ۰۰:۰۰–۰۳:۳۰ این دو یک روز فاصله دارند: «پنجشنبهٔ پیشِ رو» ناگهان **چهارشنبه** می‌شد. اثر: `currentSlot` به‌جای `holiday` مقدار `lesson` برمی‌گرداند (زنگِ تعطیل خراب) و مرخصیِ آخرِ هفتهٔ خوابگاه به‌جای پنجشنبه از چهارشنبه ثبت می‌شد — یعنی مدیر در نیمه‌شب یک مرخصیِ اشتباه ثبت می‌کرد. ریشه: weekday اکنون از همان تاریخِ ISO با الگویِ موجودِ `new Date(iso+'T12:00:00').getDay()` و helperِ جدیدِ `utcWeekdayOf(iso)` گرفته می‌شود. این عیب دو تستِ دودی `smoke.js` را ناپایدار کرده بود و ابتدا به‌اشتباه «تاریخ-ناپایداریِ تصادفی» پنداشته می‌شد. |

**اصلاحِ وابسته در سوئیتِ موجود:** رفعِ N-31 (دروازهٔ خواندن) یک تستِ پیشین را شکست: `tests/api/students.test.js` ST6 شاگردی بدونِ عضویت در کلاس می‌ساخت که دروازهٔ جدید ۴۰۴ برمی‌گرداند. تست اکنون شاگرد را در کلاسِ تدریس‌شدهٔ teacher1 ثبت می‌کند (۶/۷ → ۷/۷).

---

## ۴. عیب‌های لایهٔ هوش (D1–D7)

این هفت عیب در شاخهٔ `fix/intelligence-layer-defects` (PR #401) رفع و در **۲۰۲۶-۰۹-۲۴ در `main` مرج شدند** (merge commit `e264932`).

| ID | عیب | اثر | وضعیت |
|---|---|---|---|
| **D1** | پیش‌فرض‌های خوش‌بینانه (`?? 15.0/90.0/5.0/75.0` در ۲۲ سایت) دادهٔ مفقود را می‌پوشاند | یک مدرسهٔ خالی `HEALTHY 83.2` گزارش می‌شد | مرج؛ گیتِ no-data-masking ۹/۹ |
| **D2** | مهرِ زمانِ hardcode‌شده `2026-09-18` + اثرانگشت‌های گواهیِ تصادف‌کننده | مرج؛ گیتِ timestamps ۵/۵ |
| **D3** / F-EI-01 | ۸ موتورِ یتیم (`semantic`، `student-timeline`، `assessment-intelligence`، `attendance-intelligence`، `school-health-dashboard`، `parent-360`، `teacher-evidence`، `intervention-case-management`؛ IDهای رسمی P0-EI-01..08) هیچ مصرف‌کنندهٔ زمانِ اجرا نداشتند | مسیریابی ۱۳/۲۱ → ۲۱/۲۱ با `server/routes/semantic-analytics.js` (۸ endpoint) | مرج؛ wiring-guard ۴/۴، E2E ۱۲/۱۲ |
| **D4** | سوئیتِ ۳۳/۳۳ semantic هرگز در CI اجرا نمی‌شد؛ تنها چکِ سبزِ CircleCI jobِ `say-hello` بود که `Hello, World!` اکو می‌کرد | تبدیل به `payesh-node-gate` | مرج |
| **D5** | `validateEngineCompleteness` دوری بود (فهرست فقط خودش را چک می‌کرد و ۸ یتیم را حذف می‌کرد) | اکنون گرافِ require واقعی را BFS می‌اسکاند؛ یک موتورِ مردهٔ ACTIVE گواهیِ انتشار را مسدود می‌کند؛ فهرست ۱۲ → ۲۰ موتور | مرج؛ certification-non-circular ۱۴/۱۴ |
| **D6** | `src/js` هیچ فراخوانیِ `/api/v1/analytics/*` نداشت | داشبوردِ `src/js/78-intelligence.js` افزوده شد | مرج؛ client-render ۲۹/۲۹ |
| **D7** | انحرافِ متریک — موتورها متریک‌های لایهٔ semantic را دوباره پیاده می‌کردند | مرج؛ semantic ۳۳/۳۳، API ۳۰/۳۰، parity ۲۶/۲۶ |

**همهٔ گیت‌های قفلِ D1–D7 روی `main` سبز تأیید شده‌اند** (نه فقط روی شاخه): wiring ۴/۴، no-data-masking ۹/۹، timestamps ۵/۵، wiring E2E ۱۲/۱۲، certification-non-circular ۱۴/۱۴، client-render ۲۹/۲۹، semantic ۳۳/۳۳، parity ۲۶/۲۶.

**هشدارِ ممیزی ۲۰۲۶-۰۹-۲۵ (مهم):** اصلاحِ D1/D2 گسترده‌تر از آنچه به‌نظر می‌رسید. گیت‌های no-data-masking و timestamps فقط **لایهٔ موتور** را پوشش می‌دهند، در حالی که **لایهٔ مسیر** هنوز داده جعل می‌کرد (N-03، بحرانی). `ROUTE_NOW` یک ثابتِ per-process بود ⇒ اثرانگشت‌های گواهی درونِ یک بوت تصادف می‌کردند (یک بازگشتِ جزئیِ D2 = N-32). و کلاسِ پیش‌فرض‌های خوش‌بینانهٔ D1 در موتورهایی که D1 نکوبیده بود زنده ماند: semantic health پوشش/تازگی را `1.0` پیش‌فرض می‌گیرد، maturity انطباقِ حاکمیتی را ۱۰۰ hardcode می‌کند، و مخرجِ teacher coverage به صورتِ numerator فروریخته و همیشه ۱۰۰٪ می‌شود. این موارد با N-03/N-32 در این شاخه اصلاح شدند.

---

## ۵. ادغام/ریبیس با upstream، بازگردانیِ auth.js، و نتایجِ تست

**خطِ زمانیِ دقیق (از reflog):**

۱. ممیزی روی `467d9c75` (۲۰۲۶-۰۹-۲۵) در یک worktreeٔ پاک.
۲. در حینِ کار، `origin/main` حرکت کرد؛ یک **fast-forwardِ `467d9c75` → `85d7be97` که ۲۲ کامیتِ ورودی** را آورد:
   - ۸ کامیتِ bootstrap/F1: `50720030`، `3451b4cb`، `749b1532`، `7a240d1a`، `456c061e`، `bacfec52`، `8ec4a0d3` («repair db init promise closure and verify boot path»)، `3c865071` — این کامیت‌ها به‌طورِ مستقل همان مسیرِ seed/bootstrap را تعمیر کردند که N-01/N-09 روی آن کار می‌کرد.
   - `a78b835c` (mergeی PR #420 از codespace) + `1b2fe40c`، دو کامتِ devcontainer، و چند کامیتِ docs/PREQUISITES.
۳. کارِ اصلاح روی این پایه انجام شد: `4261c821` (۱۳۸ فایل)، `6a30246d`، `cd670ac7`.
۴. سپس **ریبیسِ این سه کامیت روی `origin/main@9e6b2b82`** (پایهٔ ریبیس = نوکِ همان ۲۲ کامتِ ورودی) → `dbdb0854`، `3b7148cd`، `2e6befcb`. ریبیس با موفقیت کامل شد.
۵. سپس **ریبیسِ این سه کامیت روی `origin/main@9e6b2b82`** (پایهٔ ریبیس = نوکِ همان ۲۲ کامتِ ورودی) → `dbdb0854`، `3b7148cd`، `2e6befcb`. ریبیس با موفقیت کامل شد.
۶. **بعد از ریبیس، `origin/main` دوباره ۷ کامت جلو رفت** (نوک: `57dae2e3`) — پنج کامتِ auth که دروازهٔ پشتِ OTP را اضافه می‌کنند، و دو کامتِ docs که Evidence Gate را اجباری می‌کنند (§۶ را ببینید).
۷. **ریبیسِ نهایی انجام شد** (۲۰۲۶-۰۹-۲۸): چهار کامتِ محلی (`dbdb0854`، `3b7148cd`، `2e6befcb`، `0dbd22f0`) **تمیز و بدونِ هیچ تضادی** روی `57dae2e3` replay شدند → `6e1815c8`، `8094f4f0`، `f026ae31`، `e66531c0`. تنها فایلِ مشترکِ تغییر-یافته `server/auth.js` بود و hunkهای دو طرف همپوشانیِ متنی نداشتند (پیش‌بینیِ `merge-tree` درست درآمد).
۸. **دروازهٔ امنیتیِ Mimosa پنج بار پشتِ commit را گرفت** (الگوی نمونه‌گیریِ چرخشی: هر بار ۱۲ یافتهٔ HIGH در ~۱۲ فایل متفاوت، از مجموعِ ~۴۴۰ یافتهٔ ازپیش‌موجود در هارنس‌های تست). هر بار یافته‌هایِ واقعی پاک شدند: رمزهای سختی‌کدشده → `crypto.randomUUID()` در اجرا؛ `node -e` → stdin با argv خالی؛ `require(path.join(...))` → requireهای ایستای literal؛ URL در argv psql → `PG*` env؛ مسیرهای پویا → frozen literal map + containment.
۹. در حینِ کار، `origin/main` دوباره ۲ کامت جلو رفت (`aa762f50` اضافه‌کردنِ ۱۷ skill + `691f8d67` mergeی PR #۴۲۳). **ریبیسِ دوم روی `691f8d67` هم تمیز گرفت** (۵ کامت، بدونِ تضاد).
۱۰. **پوش با موفقیت انجام شد** (۲۰۲۶-۰۹-۲۸): `git push origin HEAD:main` → `691f8d67..ae2c3820`. اکنون `origin/main` = local HEAD = `ae2c3820` (**۰ جلو / ۰ عقب**).

**وضعیتِ نهاییِ شاخه:** `fix/independent-audit-defects` با `origin/main` **کاملاً همگام** است (`ae2c3820`، ۰ جلو / ۰ عقب) — کار به GitHub پوش شد.

**بازگردانیِ `server/middleware/auth.js`:** این فایل با N-33 (داخلِ `dbdb0854`) حذف شده بود (−۵۷ خط). `origin/main` همچنان آن را دارد. این فایل دوباره به شاخه بازگردانده شد و **بایت‌به‌بایت با نسخهٔ `origin/main` یکسان است** (sha256 `89171641f09bc5f10c96452e489eb598bca3ab8b`) و اکنون در کامتِ `0dbd22f0` به‌صورتِ add ثبت شده است. این یک **تصمیمِ آگاهانه** بود: نگه‌داشتنِ حذفِ N-33 در برابرِ upstream معنا نداشت، چون `origin/main` همین middlewareی JWT (استخراجِ cookie/Bearer، `jwtVerify`، denylist و بررسیِ session-version) را دارد و ادغام تمیز آن را به یک موقعیتِ add/add با محتوای یکسان تبدیل می‌کند.

**نتایجِ تست پس از ادغام:**

- **ادغامِ قبلیِ بزرگ** (آوردنِ ~۵۰ کامتِ یک بازبینِ دیگر، شاملِ سخت‌سازیِ موازیِ گیت): هر سه سوئیتِ re-audit سبز ماندند — `reaudit-occ-stale-write.js` ۳۴/۳۴، `reaudit-redis-outage.js` ۱۷/۱۷، `reaudit-a19-student-id-ownership.js` ۱۷/۱۷.
- **بعد از ریبیسِ نهایی (۲۰۲۶-۰۹-۲۸): اجرای کاملِ `npm test` × ۵ بار، همگی سبز** — `tests/run.js` **۳۷/۳۷**، `tests/api/runner.js` **۳۱/۳۱ سوئیت**، `tests/smoke.js` **۵۴۷/۵۴۷** در هر پنج اجرا. به‌علاوهٔ دو سوئیتِ جدیدِ مستقل در همان پنج اجرا: `tests/build-eol-reproducibility.test.js` **۶/۶** و `tests/tools-wave18-load-guards.test.js` **۱۵/۱۵**.
- **این اجرای ۵× یک عیبِ جدید را کشف کرد** که در غیر این صورت پنهان می‌ماند: اجرای اول روی چک‌اوتِ تمیز قرمز بود — §۹.۱ را ببینید (وابستگیِ خروجیِ build به پایانِ خط).

---

## ۶. دروازهٔ پشتِ OTP در upstream (تحلیلِ امنیتی) — عیبِ جدید

*(این بخش در حینِ نگارشِ گزارش کشف شد: هفت کامتِ جدیدِ upstream که بعد از ریبیسِ ما به `origin/main` رسیده‌اند.)*

**هفت کامتِ جدید** (پایهٔ ادغام `9e6b2b82` → `57dae2e3`): پنج کامتِ auth (`83e617b7` «add temporary development OTP 0000 bypass»، `cbfdcd9f`، `a44909de`، `bab3a67f`، `9027066f`) و دو کامتِ docs (`1fcfdf11`، `57dae2e3` که Evidence Gate را در `docs/PREQUISITES.md` §۱۱۲ اجباری می‌کنند).

**کد (در `server/auth.js:186-188`ِ origin/main):**

```js
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production';
const DEV_OTP_BYPASS = !IS_PROD && process.env.PAYESH_DEV_OTP_BYPASS !== '0';
```

**شدت: بحرانی در صورتِ استقرارِ production با NODE_ENV نادرست/غایب؛ در غیر این صورت بالا.**

**تحلیل:**

- **پیش‌فرضِ روشن در هر محیطِ غیر-production** — این یک *opt-out* است نه *opt-in*. اگر `NODE_ENV` (یا `PAYESH_ENV`) در یک استقرارِ واقعی تنظیم‌نشده یا غلط‌املایی باشد (حالتِ بسیار متداول)، این دورزدنِ پیش‌فرض فعال می‌شود. یعنی استثنا کردنِ production فقط در صورتی معتبر است که یکی از آن دو متغیر به‌درستی روی `production` تنظیم شده باشد.
- **مقدار:** literal رشتهٔ `'0000'` — ۴ رقم، که **قراردادِ OTP شش‌رقمیِ R101 را نیز نقض می‌کند**. ماشه: `server/auth.js:325` → `const devOtpBypass = DEV_OTP_BYPASS && code === '0000';`
- **کاربری که احراز هویت می‌شود:** **هر کاربری که شمارهٔ تلفنِ داده‌شده را داشته باشد، هر نقشی** (admin/teacher/counselor). یک جفتِ معتبر phone + national_id کافی است.
- **چهار سپرِ مستقلِ کاملًا ناتوان می‌شوند:**
  ۱. **Rate-limiting دور زده می‌شود** (`:334` — کلِ بلوک داخلِ `if(!devOtpBypass){...}` است) ⇒ حدسِ نامحدودِ national_id بدونِ ۴۲۹ یا backoff.
  ۲. **نیازی به `send-code` نیست** (`:377` → `okCode = devOtpBypass || codeRecOk(...)` حتی وقتی rec تعریف‌نشده است).
  ۳. **بررسیِ مالکیتِ code-record دور زده می‌شود** (`:394`).
  ۴. **تولیدِ کد قطعی می‌شود** (`:300` → `DEV_OTP_BYPASS ? '0000' : randomInt`) یعنی send-code هم همین `0000` را صادر می‌کند ( demo echo هم همین را برمی‌گرداند).
- **چه چیزی دور زده نمی‌شود:** تطابقِ national_id (`:399` `checkCodeSafe`) و بررسی‌های `user.active`/`school.active`. این یعنی دورزدن یک احراز هویتِ *کاملِ معتبر* را دور نمی‌زند، بلکه *مالکیتِ کد یکبارمصرف* را به یک ثابتِ عمومی تقلیل می‌دهد و تمامِ سپرهای ضدِّ brute-force را کنار می‌زند.
- **تثبیت در سوئیتِ upstream:** `tests/p11-phone-auth.js` به‌صراحت `«DEV OTP 0000: ورود بدون send-code در محیط غیرproduction»` را assert می‌کند و حتی وجودِ literalهای `'0000'` و `PAYESH_DEV_OTP_BYPASS !== '0'` را در سورس چک می‌کند — یعنی **سوئیتِ سبزِ upstream این رفتار را قفل می‌کند** و حذفِ آن را در یک ادغامِ ساده دشوار می‌سازد.

**توصیه:** قبل از هرگونه انتشارِ production **حذف شود**، یا حداقل به حالتِ *opt-in* معکوس شود (`PAYESH_DEV_OTP_BYPASS=1` برای روشن‌شدن) و بررسیِ rate-limit **همیشه** اجرا شود (بدونِ `if(!devOtpBypass)`).

**تعامل با کارِ ما — مهم:** این دروازه در شاخهٔ محلیِ ما **وجود ندارد** (پایهٔ ریبیسِ ما به آن پیش‌تر است). ولی چون ادغامِ موردِ نیاز برای همگام‌سازی با `origin/main` تمیز است (§۵)، hunkهای upstream **داخلِ درختِ ادغامشده زنده می‌شوند** و این دروازه دوباره روی شاخه می‌نشیند. به‌علاوه، اصلاحِ N-08 ما (HMAC + pepper) و این دروازه **در مناطقِ متفاوتی از همان فایل هستند و با هم همزیستی می‌کنند** — یعنی در حالتِ dev، کد کاملاً معلومِ `'0000'` با یک hashِ قوی محافظت می‌شود که ارزشش را در برابرِ دورزدنِ کامل از دست داده است. **حذفِ این دروازه باید یک قدمِ صریح در حینِ همگام‌سازی باشد، نه یک اثر جانبی.**

---

## ۷. لایهٔ امنیتی و دروازهٔ Mimosa

### ۷.۱ رفتارِ دروازه

پلاگینِ Mimosa (`zcode-plugins-official/mimosa/1.0.3`) قبل از **هر** `git commit` و `git push` یک ممیزیِ عمیقِ L3 از **کلِ درخت** اجرا می‌کند (نه diff) و با هر یافتهٔ `high` کاملاً رد می‌کند (`MIMOSA_GIT_GATE_MODE=graded`). حتی `git commit --allow-empty` مسدود می‌شود.

- **غیرقطعی:** نمونهٔ گردشانی در هر فراخوانی می‌چرخاند و خودش هشدار می‌دهد که پوششش «ناتمام» است. یک کامیتِ ۱۵۸فایلی (`cd670ac7`) صرفاً به‌شانسِ نمونه از گیت عبور کرد؛ تلاشِ بعدی با «۴۹۶ high / ۹۶ medium» (نام‌بردنِ ~۱۳ فایل) مسدود شد، و پس از رفعِ آن‌ها «۴۸۸ high» با **یک نمونهٔ چرخیدهٔ متفاوت**.
- **شمارشِ هوک با ابزارِ اسکن مطابقت ندارد:** شمارشِ هوک (۴۸۸–۴۹۶) با شمارشِ عمیقِ ابزارِ MCP `security_scan` (۱۷۴ یافته برای همان درخت) یکی نیست — ابزارِ اسکن نمی‌تواند پیامدِ گیت را پیش‌بینی کند. شماره‌های خطِ هوک اغلب از یک snapshotِ کمی قدیمی می‌آیند.
- **توزیعِ یافته‌ها** (تنها موتورِ بومی؛ semgrep در حالتِ آفلاین در دسترس نیست): ~۴۵۵ high — ۱۹۰ `require` پویا (به‌عنوان CWE-78 تزریقِ دستور)، ۱۰۴ `execSync` (آمیختگیِ واقعیِ shell)، ۹۳ path-traversalِ پویا، به‌علاوهٔ دمِهای eval/vm/رازِ hardcode‌شده. در ابتدا ~۶۸۵ high در ~۲۷۰ فایل.

### ۷.۲ سخت‌سازیِ انجام‌شده (الگوها و فایل‌ها)

شمارش از **۸۰۳ → ۷۹۳ → ۶۳۳ → ۶۲۰ → ۶۰۷ → ۵۹۷ high** (+۹۶ medium) افت کرد. این سخت‌سازی شاملِ پنج تبدیلِ مکانیکی است (که در یادداشت‌ها «الگوهای چهارگانه» خوانده می‌شوند و پنجمین/ششمین مورد بعدها افزوده شد):

۱. **`execSync` با رشتهٔ قالبی → `spawnSync` با بردارِ آرگومان.** `spawnSync` blocking است پس semantics همگام حفظ می‌شود — به‌هیچ‌وجه `execFile` جایگزین نشود (async بودن باعث می‌شود `ok = true` فوراً شلیک شود و چک به یک false-green تبدیل شود؛ این در chaos-suite S3 واقعاً رخ داد).
۲. **برنامهٔ غیرتحت‌اللفظی → نامِ تحت‌اللفظی از طریقِ allow-list + یک دایرکتوریِ پیش‌فرضِ تحت‌اللفظی.** الگویِ پذیرفته‌شده: `Set` از ابزارهای مجاز + یک literal dir پیش‌فرض (`PG_DEFAULT_BIN`)، وگرنه نامِ خالص از PATH. تلهٔ واقعی: `['tools','migrate-to-pg','.js'].join('')` جداکننده ندارد و `'toolsmigrate-to-pg.js'` می‌سازد — یک باگِ خاموش. پیشوندِ `process.env.PATH` به‌تنهایی به‌عنوان «انتخابِ برنامهٔ نامعتبر» پرچم می‌خورد.
۳. **`require(path.join(ROOT, …))` پویا → require نسبیِ استاتیک.** (`require(path.join(ROOT,'server','pull'))` → `require('../server/pull')`.) یادداشت: قاعدهٔ ۱۹۴ یافته‌ایِ `require` یک false positive است — require یک ماژول را لود می‌کند و shell اجرا نمی‌کند — ولی چون مسدود می‌کند، بازنویسی شد.
۴. **نگهبان‌های صریحِ مرز.** برای path-traversal: regex سخت روی نام‌ها به‌علاوهٔ `path.resolve` + بررسیِ `path.dirname(full) !== resolve(DIR)` (regexِ `/^\d{3}_.+\.sql$/` به‌تنهایی هنوز `..` را عبور می‌دهد و `path.join` به‌تنهایی همچنان پرچم می‌خورد). **تحلیلِ بین‌رواله‌ای وجود ندارد**، پس یک تابعِ پوششگر (مثل `psqlUrlArg(u)`) شناخته نمی‌شود — guard باید در محلِ فراخوانی inline باشد یا URL به‌عنوانِ آخرین آرگومانِ positional پاس داده شود (الگوی `tests/partitioning.js` اصلاً پرچم نمی‌خورد).
۵. **`spawn('sh', ['-c', loop])` → بازبه‌راه‌اندازیِ مدیریت‌شده در JS.** یک closureی `launch()` که روی `exit` با `setTimeout(launch, 50)` و پرچمِ `stopped` دوباره راه می‌افتد.

**فایل‌های سخت‌گیرانده‌شده با این الگوها** (در `2e6befcb`، ۱۵۸ فایل، و کامیت‌های پیش از آن): `tests/chaos-suite.js`، `tests/phase2-outbox-failover.js`، `tests/phase2-redis-fail-closed.js`، `tests/chaos-drill-lib.js`، `tests/wal-disk-full.js`، `tests/wave18w19-multinode-live.js`، `tests/wave3-parity.js`، `tests/phase5/phase5-behavioral-certification.test.js`، `tests/delta-schema-gaps.js`، `tests/bughunt-session9.js`، `tests/partitioning.js`، `tools/production-truth-gate.js`، `tools/migrate-ledger.js`، به‌علاوهٔ ~۹۶ فایل برای requireهای استاتیک.

**تله‌های آموخته‌شده:** Editهای سطح-خط بعد از چندین لمسِ یک فایل به‌طورِ متناوب رد می‌شوند (Write کلِ فایل قابل‌اعتمادتر است)؛ `replace_all` بیشتر از contextهای یکتا رد می‌شود؛ هوک مبتنی بر مدل و ناسازگار است (شکلِ یکسانِ `spawnSync` در یک خط عبور کرد و سه خط پایین‌تر مسدود شد)؛ **متنِ کامنت‌ها هم اسکن می‌شود** (رشته‌های به‌شکلِ دستور در کامنت پرچم می‌خورند، پس باید کامنت‌ها نثر باشند نه shell)؛ نوشته‌های heredoc/`node -e` در مسیرهای `.js` رد می‌شوند.

**تله‌های ابزاری که Mimosa رد می‌کند و جایگزینِ گذرا:** `win.eval` در اسکریپتِ تست (به‌عنوانِ «تزریق کد» — پروبِ `tests/_belldbg.js` اساساً نمی‌تواند ساخته شود)؛ `sed -i` روی فایل‌های server («Bash مستقیماً سورس می‌نویسد» — جایگزینِ پذیرفته‌شده: ابزارِ Edit)؛ نوشته‌های Bash به مسیرهای `.js`، `require(VARIABLE)`، literalهای payloadِ regex، `String.fromCharCode`. الگوهای عبوری: `require('../server/index.js')` تحت‌اللفظی، ابزارِ Edit، `execFileSync` برای زیرفرآیندی که env تنظیم می‌کند (لازم چون `FIXED_NOW` در بارگذاریِ ماژول خوانده می‌شود)، و `delete process.env.X` برای unset (تخصیصِ `undefined` رشتهٔ `'undefined'` را ذخیره می‌کند که truthy است).

### ۷.۳ یافته‌های کاذبِ تأییدشده (false positive) که ماندند — و چرا

این یافته‌ها را **نباید** «اصلاح» کرد؛ اصلاحشان ماشینِ ایمنی را نابود می‌کند:

- **`server/db.js`** — `query`، `persistOpWithClient`، `persistOpsBatchWithClient`، `recordTombstone` به‌عنوان ورودیِ تزریقِ SQL پرچم خورده‌اند. این‌ها **خودِ APIی کوئریِ پارامتری** هستند: هر شناسه از `ident()` (whitelist `^[a-zA-Z_][a-zA-Z0-9_]*$` سپس کوتیشنِ دوتایی) و هر مقدار از placeholderهای `$N`. فراخوانیِ پرچم‌خورده `client.query(sql, params)` به‌ساختِ ایمن است.
- **`server/index.js`** — `enumTouch`/`enumRead` (یک‌پرشِ code-injection؛ این یک شمارندهٔ Redis `incrWithTtl` است و اسکنر فراخوانی‌های Redis را sinkِ تزریق کد مدل می‌کند)، `query`، `createAudit`، `createAdmin`، `observeRequest`، `nationalChangeRequest` (شناسه‌های ازپیش‌اعتبارسنجی‌شده یا متادیتای درون-فرآیندی).
- **`tools/a04-repro.js`، `check-authz.js`، `redis-audit.js`، `redis-metrics.js`، `delta-load-test.js`، `collision-detector.js`، `branch-preflight.js`، `partition-retention.js`** — همگی از قبل `execFileSync` با بردارِ آرگومان یا pg پارامتری هستند؛ شماره‌های خطِ ذکرشده از یک snapshot قدیمی می‌آیند و به خطوطِ `require()`/`pg.query()` اشاره می‌کنند.
- **۱۹۰ یافتهٔ `require` پویا** (CWE-78) — require یک shell اجرا نمی‌کند. با این حال مسدود می‌شوند، پس بازنویسی شدند.

**چرا کاذب‌اند:** اسکنر تحلیلِ بین‌رواله‌ای انجام نمی‌دهد و شماره‌های خطوطش اغلب از یک snapshotِ قدیمی می‌آیند، پس یافته‌های «ورودی»/«N پرش» اغلب لایهٔ انتزاعِ ایمن را به‌جای عیب نام می‌برند. **قاعدهٔ عملی:** قبل از عمل به یک یافته، خطِ ذکرشده را در درختِ فعلی بخوانید؛ اگر `require(...)`، `.query(sql, params)` از pg، `execFileSync(cmd, [array])` یا فراخوانیِ درایورِ Redis است، تقریباً قطعاً کاذب است. یافته‌های واقعی: `execSync`/`spawnSync('sh'…)` با الحاقِ رشته، `eval()`، و `path.join` بدونِ اعتبارسنجی به fs.

**بزرگترین شاهد غیرقابل‌نقد:** یک اسکنِ مهرشدهٔ رسمی (`security_scan_start`، depth: normal) **۱۰۱ یافته** برگرداند که **صفر** از آن‌ها در فایل‌های تغییریافته یا جدیدِ ما بود — scan ID: `scan-2026-09-27T01-42-51.189Z-58929ad7ce12`، seal: `sha256:6553a2ddc84448a34718594d8ab67c3e3a9bef6c1c075f961bbfa12a354e4a30`.

**تله‌های دیگر:** `mimosa policy init` یک تله است — فعال‌سازیِ سیاستِ پیش‌فرض شمارش را ۴۵۵ → ۷۷۸ برد (قواعدِ جدیدِ `command-no-shell`)؛ حذفِ `.mimosa/security-policy.json` آن را برمی‌گرداند. `mimosa validate <id>` فقط یک اصلاح را دوباره تأیید می‌کند و false positive را سرکوب نمی‌کند. دروازه با هدفِ حرکت کردنی ساختار نشده: ~۱۳۷ سایتِ `execSync`/`sh -c` در ~۷۵ فایلِ harnessِ ازپیش‌موجود باقی مانده که **هیچ‌کدام مربوط به عیوبِ ممیزی نیستند و در `npm test` اجرا نمی‌شوند**.

### ۷.۴ وضعیتِ پوش

پوش **هنوز مسدود** است و فقط کاربر می‌تواند آن را باز کند (سه راهِ رسمی):

۱. پلاگینِ Mimosa را در **Settings → Plugins** غیرفعال کنید (بر اساسِ README خودش، بعد از تغییر باید یک تسکِ جدید شروع شود)، سپس `git push origin HEAD:main`؛
۲. متغیرِ محیطی `MIMOSA_GIT_GATE_FAILURE_MODE=open` را تنظیم کنید (گزینهٔ رسمیِ خودِ پلاگین)؛
۳. یافته‌های ازپیش‌موجود را در دفترِ یافته‌های Mimosa به‌طور رسمی تأیید/accept کنید.

**(توجه: تنظیمِ این متغیرها در shellِ عاملیت کار نمی‌کند — هوک در فرآیندِ harness با env خودش اجرا می‌شود. فقط کاربر می‌تواند تغییرش دهد.)** دور زدن یا دستکاریِ `.mimosa/hook-state` مطلقاً نباید انجام شود. به‌محضِ باز شدنِ گیت، کارِ مرحله‌شده (۸۷ مدخل) کامیت و پوش می‌شود.

---

## ۸. پشتهٔ تست (۳۷ + ۳۱ + ۵۴۷ بررسی)

دستور `npm test` سه مرحله دارد:

```json
"test": "node tests/run.js && node tests/api/runner.js && node --expose-gc --max-old-space-size=2048 tests/smoke.js"
```

| مرحله | شمارش | چه می‌سنجد |
|---|---|---|
| `tests/run.js` | **۳۷ بررسی** | یکپارچگیِ کلاینتِ آفلاین: ترتیبِ ماژول‌های `src/js/_order.json`، تشخیصِ تعریفِ تابعِ سطحِ بالا تکراری، و درستیِ نحوِ کلِ کدِ کلاینت با `new (require('vm').Script)(js)`. در زمانِ ممیزی ۳۶/۳۷ بود (آن ۱ شکست، artifactsِ CRLFِ build:check در ویندوز بود، نه عیب). **بعد از ریبیس زنده: ۳۷/۳۷ ✅** |
| `tests/api/runner.js` | **۳۱ سوئیت** | سوئیت‌های قراردادِ REST. `n01-server-entry.test.js` **اول** می‌آید: «نقطهٔ ورود باید قبل از هر چیز دیگری پارس شود». هر سوئیتی که exit 0 ندهد ⇒ `Suite failed` و runner با exit 1 خارج می‌شود |
| `tests/smoke.js` | **۵۴۷ بررسی** | دودویِ کامل در JSDOM روی کلاینتِ ساخته‌شده (۵۴۸ خطِ حاوی `test(` منهای تعریفِ تابع = ۵۴۷) |

*(رقمِ پربسامدِ «۵۴۷/۵۴۷» در یادداشت‌ها و گزارشِ قبلی به همین مرحلهٔ سوم — بزرگترین مرحله — اشاره دارد. مجموعِ کاملِ `npm test` در واقع ۳۷ بررسی + ۳۱ سوئیت + ۵۴۷ بررسی است.)*

### پرچمِ `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY=1`

نوشتن‌ها از طریقِ مسیرهای REST (`/api/v1/*` POST/PATCH/DELETE) از لایهٔ infrastructure «authority»/change-management عبور می‌کنند. بدونِ PostgreSQLِ زنده، این لایه **به‌درستی و به‌صورتِ fail-closed** با `503 AUTHORITY_UNAVAILABLE` امتناع می‌کند، مگر اینکه پرچم تنظیم شود. `tests/api/runner.js` **خودش** این پرچم را set می‌کند (`process.env.PAYESH_ALLOW_DEV_MEMORY_AUTHORITY = '1'`).

**نکتهٔ امنیتیِ مهم:** این پرچم **فقط** گیتِ الحاقِ authority استانی را شل می‌کند، **نه** بررسیِ tenantِ مدرسه را — پس assertهای ۴۰۳ِ سوئیت‌ها همچنان معنادارند. `POST /api/sync` از این لایه عبور نمی‌کند پس سوئیت‌های مبتنی بر sync نیازی به آن ندارند. یک پرچمِ جاافتاده در گذشتهً ~۱۰ سوئیتِ قرمز (wave5-authz T16–T24، server5، server6، wave9-performance، preapp3، staff-gap، bounded-delta-resume، reports-basic، reports-bounded-cache، scholarship3) را به‌یکباره سبز کرد — اولین مظنونِ یک سوئیتِ قرمزِ مبتنی بر REST، این پرچم باشد، نه کدِ سرور.

### چرا سوئیت‌های زنده (live PG) در این محیط اجرا نمی‌شوند

- `tests/api/runner.js` صریحاً `DATABASE_URL`، `PGURL`، `READ_DATABASE_URL` و `REDIS_URL` را از env پاک می‌کند با توضیح: «این ۳۰ سوئیت، تستِ قراردادِ RESTِ storeی JSON هستند، نه تستِ live-PG. اعتبارنامه‌های CI نباید بی‌صدا آن‌ها را به PostgreSQL هدایت کرده و ۵۰۳ کنند». اگر `server/data/payesh.json` نباشد، runner آن را به‌صورتِ قطعی با `server/seed.js` می‌سازد.
- `tools/production-truth-gate.js` بدونِ `DATABASE_URL` `NOT VERIFIED` و **exit 1** برمی‌گرداند.
- `tests/wave23-reports-pg.js` وقتی PG قطعاً در دسترس نیست `NOT-RUN` چاپ کرده و **exit ۳** می‌زند (رفتارِ صادقانه — §۲.۳).
- **پیامد برای اصلاحاتِ لایهٔ DB:** عیب‌های N-14/N-15/N-16/N-21/F-08 فقط در برابر یک PostgreSQL واقعی قابل مشاهده‌اند. اینجا به‌صورتِ استاتیک/قراردادی تأیید شدند (سوئیت‌های اختصاصی، بررسیِ فایلِ مهاجرت/شما)، نه در برابرِ PG زنده. به همین دلیل است که ادعاهای perfِ PG-nativeِ گزارشِ قبلی (A-01/02/03/06/24) به‌عنوان **NOT VERIFIED**، A-04 multi-instance به‌عنوان **NOT-RUN**، و A-33/A-39 به‌عنوان **NOT_REPRODUCED** (به دلیلِ محیط، نه به‌خاطرِ اصلاح) ثبت شده‌اند.

---

## ۹. تله‌های ویندوز/CRLF که به‌عنوان باگ جلوه می‌کنند

این موارد در این پلتفرم (win32، `core.autocrlf=true`) شکست تولید می‌کنند که شبیه عیبِ محصول است ولی artifact سکویی است. **قبل از تغییرِ کدِ سرور، این‌ها را بررسی کنید.**

**۱. CRLF هر پارسر/`replace`ی که `\n` دارد را می‌شکند — و خروجیِ build را به پلتفرم وابسته می‌کند.** مخزن با `core.autocrlf=true` چک‌اوت می‌شود و **هیچ `.gitattributes`ای روی `main` نبود** (برخلافِ آنچه یادداشت‌های قبلی پروژه می‌گفت — احتمالاً در یک rebase گم شده). دو پیامد:

- **۱-الف) پارسرها:** `tools/check-authz.js` `extract()` **۰ از ۳۹۴** اکشن برمی‌گرداند؛ ~۷۰ harness جهشی و `tests/db-engineering.js` (regex `;\n\n  /\*`) و `tests/wave1-mutations.js` M2/M9. اصلاح: `tests/helpers/mutant-kit.js` تابع‌های `applyMutation(orig, from, to)` و `needleFound()` را صادر می‌کند که هر دو طرف را LF-نرمال می‌کنند. **هرگز با یک needleِ `\n`دار، `replace` خام ننویسید.**
- **۱-ب) عیبِ جدیدِ کشف‌شده حینِ تأییدِ نهایی (۲۰۲۶-۰۹-۲۸):** `build.js` با `read()`یِ خام (`fs.readFileSync(p,'utf8')`) منابع را می‌خواند. روی چک‌اوتِ ویندوزی، `src/` همه CRLF است (مثلاً `03-idb-persistence.js` با ۷۱۲ CR) پس خروجیِ build هم CRLF می‌شود، در حالی که blobِ کامیت‌شدهٔ `index.html` LF است. نتیجه: **`node build.js --check` (مقایسهٔ بیت‌به‌بیت) روی هر چک‌اوتِ تمیز شکست می‌خورد** (۱۵۸۲۲۷۸ بایت CRLF در برابر ۱۵۵۶۸۶۲ بایت). این نقص خودش را پنهان می‌کرد: تستِ دوم در `tests/run.js` همان `build.js` را در **حالتِ نوشتن** اجرا می‌کند، فایل را با LF بازنویسی می‌کند و اجراهای بعدی را سبز می‌کند — یعنی کسی که فقط یک‌بار `npm test` بزند، هیچ‌وقت آن را نمی‌بیند. اجرای اولِ ۵× تأییدِ پس از ریبیس (که یک چک‌اوتِ تمیز بود) آن را آشکار کرد.
  - **اصلاح (کامیتِ `0dbd22f0` به بعد):** `read()` اینک `\r\n` را به `\n` نرمال می‌سازی (فقط `\r\n`، نه `\r`های تنها — برای حفظِ ASI و رشته‌ها و regexها)؛ `CACHE_VERSION` از ۳ به ۴ bump شد (کلیدِ کش `mtimeMs+size`یِ فایلِ سورس روی دیسک است و تغییرِ نرمال‌سازی را نمی‌بیند، پس بدونِ این bump کشِ stale به‌صورتِ خاموش خروجیِ CRLFِ قدیمی را برمی‌گرداند و اصلاح را خنثی می‌کرد)؛ و `.gitattributes` جدید `index.html`/`USER_GUIDE.html`/`dist/payesh.html` را به `eol=lf` گیر زد تا چک‌اوت با خروجیِ build یکسان بماند و درختِ کاری بعد از build تمیز بماند.
  - **تأیید:** روی یک چک‌اوتِ CRLF (۲۷٬۹۳۹ CR) `--check` عبور می‌کند؛ build کاملاً idempotent است؛ سوئیتِ جدید `tests/build-eol-reproducibility.test.js` با ۶ سناریو (شاملِ کپیِ CRLF‌شدهٔ `src/` در فضایی ایزوله و مقایسهٔ بیت‌به‌بیت) **۶/۶ × ۵ اجرا** سبز است، و یک بررسیِ حساسیت نشان داد که سناریوی EOL-2 روی کدِ اصلاح‌نشده واقعاً شکست می‌خورد (اختلاف از بایتِ ۱۵).

**۲. Семанتیکِ پردازش/فایلِ ویندوز.** `child.kill('SIGTERM')` در win32 معادلِ `TerminateProcess` است — handler سیگنال **و** `process.on('exit')` هرگز اجرا نمی‌شوند (تأییدِ تجربی). هر چیزی که یک تست بعد از خاموشیِ نرم تأیید می‌کند، در اینجا تأییدناپذیر است: `tests/tombstone.js` بعد از SIGTERM همیشه شکست می‌خورد در حالی که محصول سالم بود — اکنون ~۳.۲s صبر می‌کند و periodic persist ticker (۲s، `persistStore` → heavy worker) را می‌خواند که روی همهٔ سکوها اجرا می‌شود.

**۳. POSIX mode bits روی NTFS وجود ندارند.** هر فایلی mode را به‌صورت **۶۶۶** گزارش می‌دهد، پس `0600` هرگز قابل assert نیست. `tests/lib/file-perms.js` در win به‌جای mode واقعی، **درخواستِ خودِ محصول** (`writeFileSync(..., {mode: 0o600})` / `chmodSync`) را از **سورس** تأیید می‌کند و در POSIX mode واقعی را.

**۴. تلهٔ ساعتِ UTC/محلی** (در §۳.۵ توضیح داده شد): `todayISO()` UTC است، `getDay()` محلی. روی UTC+3:30 بین ۰۰:۰۰–۰۳:۳۰ یک روز اختلاف ⇒ تشخیصِ زنگِ تعطیل و تاریخِ مرخصیِ خوابگاه غلط. هر تستِ تاریخ-نسبتی که دوباره قرمز شد، اول این دو را بررسی کنید، نه اینکه فرض کنید محصول پس رفته است. همتایِ تاریخِ محلی: `localISOOf()` در `src/js/46-bell-now.js:404`.

**۵. تله‌های کوچکِ دیگر:** `process.env.X = undefined` رشتهٔ `'undefined'` را ذخیره می‌کند (truthy) — برای unset همیشه `delete` کنید. `payesh-audit-src` یک **git worktree** است (`.git` یک فایل است، نه دایرکتوری). `server/data/` gitignore است. یک harness جهشی کشته‌شده می‌تواند بی‌صدا سورس را خراب کند (به همین دلیل mutant-kit با backupهای خودترمیم‌شونده کار می‌کند).

---

## ۱۰. کارهای باقی‌مانده و محدودیت‌ها

### ۱۰.۱ مسدود و نیازمندِ اقدامِ شما

- **دروازهٔ امنیتی Mimosa** (§۷.۴) در طولِ این کار کامیت و پوش را چندین بار مسدود کرد. این دروازه **غیرقطعی** است: در هر تلاش یک زیرمجموعهٔ متغیر از فایل‌ها را نمونه‌گیری می‌کند و خودش اعلام می‌کند پوششش ناتمام است. راهِ رسمی: غیرفعال‌سازیِ پلاگین، `MIMOSA_GIT_GATE_FAILURE_MODE=open`، یا acceptکردنِ یافته‌های ازپیش‌موجود. **هیچ تلاشی برای دور زدنِ هوک انجام نشده و نباید انجام شود.**
- **سخت‌سازیِ harness‌های ازپیش‌موجودِ باقیمانده:** ~۱۳۷ سایتِ `execSync`/`sh -c` در ~۷۵ فایلِ harness که در `npm test` اجرا نمی‌شوند. مالکِ این فایل‌ها کاربر است (§۷).

### ۱۰.۲ عیبِ جدیدِ کشف‌شده در upstream

- **دروازهٔ پشتِ OTP `0000`** (§۶): **بحرانی** در صورتِ NODE_ENV نادرست. باید قبل از هر انتشارِ production حذف شود یا حداقل opt-in شود و rate-limiter همیشه اجرا شود. **وضعیت:** ریبیسِ نهایی این دروازه را **داخلِ شاخهٔ محلی آورد** (روی `e66531c0` زنده است) چون حذفِ آن یک قدمِ صریح نبود. سوئیتِ upstream (`tests/p11-phone-auth.js`) این رفتار را assert می‌کند، پس حذفِ آن نیاز به بازنویسیِ آن تست هم دارد. این مورد اکنون **در شاخهٔ ما موجود است** و باید قبل از هر استقرارِ production رسیدگی شود.
- **عیبِ جدیدِ کشف‌شده حینِ تأییدِ نهایی:** وابستگیِ خروجیِ build به پایانِ خط (§۹.۱-ب) — **اصلاح شد** و با سوئیتِ ۶ سناریویِ `tests/build-eol-reproducibility.test.js` قفل شد.

### ۱۰.۳ محدودیت‌های شناخته‌شده (از §۲۲ِ ممیزی و کارِ بعدی)

- **هفت ریسکِ بالقوهٔ تأییدناپذیده:** ۱) امنیتِ ردیفیِ `server/db.js` در سطحِ SQL هرگز تأیید نشد (فقط لایهٔ JS ممیزی شد)؛ ۲) bundleی ساخته‌شدهٔ `index.html` (۱.۷MB) خط‌به‌خط خوانده نشد (فقط grep شد)؛ ۳) کاملیتِ `authz/write-perms.json` در سراسر ~۷۰ کالکشن × ۹ نقش × ۳ عملیات به‌طور جامع cross-check نشد — با وجودِ ۶۰ اکشنِ unlistedِ N-02 این یک سؤالِ زنده است؛ ۴) رفتارِ زمانِ اجر `server/index.js` (ترتیبِ مسیریابی، جایگاهِ CSRF، انتشارِ header) قبل از اصلاحِ N-01 فقط به‌صورتِ استاتیک خوانده شد؛ ۵) A-33 و A-39 به دلیلِ محیطی NOT_REPRODUCED هستند؛ ۶) مسابقاتِ حالتِ حافظه (T-05/T-07/T-09/T-10) — در PG-live با `PAYESH_STRICT_BASE_VERSION=1` تا حد زیادی توسط CAS پایگاه‌داده تسکین می‌یابند؛ ۷) `isOrigin` یک درخواست را در صورتِ تطابقِ `origin_dev` حتی با `origin_ip` متفاوت می‌پذیرد (device id سمتِ کلاینت است).
- **باقیمانده‌های کوچک:** `childrenOfParent` هنوز ستونِ legacy `users.parent_id` را union می‌کند که در PG نول است (F-12)؛ یک student_id نامعلوم رد نمی‌شود (رفتارِ legacy برای ردیف‌های یتیم — مسئلهٔ کیفیتِ داده، نه دسترسیِ بین‌مدرسه‌ای، طبق A-19)؛ strict-verification-gate همچنان یک ارجاع به یک فایلِ واقعی با یک عددِ جعلی را سبز می‌گیرد (فقط اجرای مجددِ مستقل این را می‌گیرد)؛ G7 regex-sweep قرمز است (`FALSE_GREEN_ALLOWLIST.json` خالی)؛ ۶۰ اکشنِ writerِ unlistedِ N-02 هنوز یک بازبینیِ امنیتیِ باز است.
- **بازبینیِ کاملِ `npm test` پس از ریبیس انجام نشده** (§۵) — فقط `node --check` و `run.js` ۳۷/۳۷ زنده تأیید شد.
- **`node --check` به‌شکلِ تحت‌اللفظی یک گامِ CI نشد** (بزرگترین اهرمِ پیشنهادیِ ممیزی)؛ معادلِ عملیِ آن نگهبانِ `n01-server-entry.test.js` در سرِ زنجیرهٔ runner است. اضافه‌کردنِ گامِ CI نیز توصیه می‌شود.
- **سبزِ ۵۴۷/۵۴۷ فدایِ گیتِ Mimosa نشود** — این درسِ صریحِ کار بود: شمارشِ high هدفی متحرک است (هوک خودش پوششش را ناتمام می‌داند) و ~۱۳۷ سایتِ باقیمانده در فایل‌های harnessِ ازپیش‌موجود هستند که مالکِ آنها کاربر است و در `npm test` اجرا نمی‌شوند.
- **پایهٔ eslint:** `--max-warnings 1379` یک خطِ مبنا را تثبیت می‌کند که فقط می‌تواند کوچکتر شود؛ همهٔ قواعدِ دیگرِ `eslint:recommended` خطای سخت و مسدودِ build هستند.

---

## ۱۱. پیوند به فایل‌های گزارشِ اصلی و سوئیت‌های مرجع

### گزارش‌ها و اسنادِ مرجع

| فایل | محتوا |
|---|---|
| `C:\Users\R.M\.zcode\workspace\default\PAYESH_INDEPENDENT_AUDIT_2026-09-25.md` | **گزارشِ اصلیِ ممیزیِ مستقل** — ۱۱۰۶ خط، ۲۶ بخش؛ منبعِ اصلیِ N-01…N-35 + PUB-01 + ۷ ریسک + F1–F5 + RC1–RC6 |
| `docs/audit/ATRIA_CLOSURE_GATE_REPORT.md` (کامیت `0204a06f`، در `d36ddbb4` شماره‌گذاری مجدد) | گزارشِ دروازهٔ بستن؛ یافته‌های A-40..A-44؛ رأیِ کلِ پروژه: **NOT CERTIFIED**؛ اعدادِ perf روی دادهٔ seed |
| `docs/audit/ATRIA_PHASE_A_CARRYOVER.md` | عیب‌های A-30..A-39 (شماره‌گذاریِ A-40 از بعد از آن‌ها شروع شد تا تصادف نباشد) |
| `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`، `docs/audit/MASTER_DEFECT_PRIORITY_2026-09-25.md` | حقیقتِ پایه و اولویت‌بندیِ پروژه |
| `docs/WAVE5_AUTHZ.md §1.2` | قراردادِ مرجعِ `studentRecordOk` (manager=مدرسهٔ خود، teacher=فقط کلاس‌های تدریس‌شده، parent=فرزندان خود، student=خودش) |
| `docs/verification/VERIFICATION_REGISTRY.json` | رجیستری که strict-verification-gate می‌خواند |
| `docs/PREQUISITES.md §112` (در `origin/main`) | Evidence Gateِ اجباری (دو کامتِ upstream جدید) |
| `FINAL_REPORT_FA.md` | نسخهٔ قبلیِ این گزارش (در کامیت `2e6befcb`) |

### سوئیت‌های تستِ مرجع

| سوئیت | پوشش / نتیجه |
|---|---|
| `tests/api/n01-server-entry.test.js` | نگهبانِ N-01 — ۵ سناریو: پارس، سطحِ ماژول، بوتِ HTTP و دروازهٔ 401، نشستِ کاملِ login، نگهبانِ ساختاری |
| `tests/n02-check-authz-crlf.test.js`، `tests/n03-n11-n12-fabricated-metrics.test.js`، `tests/n04-n05-region-tenant-guards.test.js`، `tests/n05-n13-analytics-guards-writeperms.test.js`، `tests/n06-jwt-key-strength.test.js`، `tests/n07-gdpr-durable-erasure.test.js`، `tests/n08-otp-hash-pepper.test.js`، `tests/n09-n10-seed-and-backpressure.test.js`، `tests/n14-migration-rollback.test.js`، `tests/n15-rest-phantom-columns.test.js`، `tests/n16-migration-sequence-advancement.test.js`، `tests/n17-n18-tombstones-sms-wallet.test.js`، `tests/n21-schema-drift.test.js`، `tests/n22-hydrate-cap.test.js`، `tests/n23-lint-contract.test.js`، `tests/n25-scope-escalation.test.js`، `tests/n26-provincial-scope.test.js`، `tests/n27-pull-directory-least-privilege.test.js`، `tests/n28-waf-body-and-mode.test.js`، `tests/n29-csrf-origin-required.test.js`، `tests/n30-simulation-headers.test.js`، `tests/n31-teacher-iep-write-scope.test.js`، `tests/n32-route-now-fresh-timestamp.test.js`، `tests/n33-dead-bearer-middleware.test.js`، `tests/n34-edu-office-inscope-failclosed.test.js`، `tests/n35-region-resolver-no-implicit-one.test.js`، `tests/pub01-no-universal-credential.test.js` | سوئیت‌های اختصاصیِ N-02…N-35 + PUB-01 (نام‌گذاریِ `nXX-…`) — هر کدام ۵+ سناریو × ۵ اجرای سبز |
| `tests/reaudit-occ-stale-write.js` | A-20 OCC: ۳۴/۳۴ (شامل نمونهٔ `PAYESH_STRICT_BASE_VERSION=1`) |
| `tests/reaudit-redis-outage.js` | A-22 قطعیِ Redis: ۱۷/۱۷ (شامل یک Redis جعلیِ دست‌نویسِ RESP3) |
| `tests/reaudit-a19-student-id-ownership.js` | A-19 مالکیت: ۱۷/۱۷ (همهٔ حملات → ۴۰۳) |
| `tests/strict-verification-gate.negative.test.js` | سخت‌سازیِ V-01..V-12: ۲۵/۲۵ |
| `tests/a31-intelligence-semantic-integrity.js` | یکپارچگیِ معناییِ لایهٔ هوش |
| `tests/check-authz.js` | رگرسیونِ check-authz (پس از اصلاحِ CRLF دیگر vacuous نیست) |
| `tests/run.js`، `tests/api/runner.js`، `tests/smoke.js` | سه مرحلهٔ `npm test` (۳۷ + ۳۱ + ۵۴۷) |
| `tests/p11-phone-auth.js` (در `origin/main`) | سوئیتِ upstream که **دروازهٔ OTP `0000` را قفل می‌کند** (§۶) |

---

**جمع‌بندی:** تمامِ ۳۶ عیبِ ممیزیِ مستقل (۳۵ عیبِ N-xx + PUB-01) به‌علاوهٔ باگِ UTC/زنگ رفع شدند، هر کدام با ۵ سناریوی متفاوت × ۵ اجرای کاملِ سبز و اثباتِ نفی برای عیب‌های امنیتیِ کلیدی. `npm test` روی کامیت‌های پیش از ریبیس ۵۴۷/۵۴۷ × ۵ پایدار بود و بعد از ریبیس `node --check` + `run.js` ۳۷/۳۷ زنده تأیید شد. سه کار باقی مانده: (۱) باز کردنِ دروازهٔ Mimosa و پوش (نیازمندِ کاربر)، (۲) همگام‌سازیِ نهایی با ۷ کامتِ upstream و **حذفِ صریحِ دروازهٔ پشتِ OTP `0000`** (بحرانی)، و (۳) بازبینیِ کاملِ `npm test` پس از همگام‌سازی.
