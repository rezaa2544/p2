# گزارش اسکن عمیق پایش — Muse Spark — 2026-09-25
HEAD: `145088f3788a960c14084774b45687328346266d` (`docs: add A-37 A-38 A-39`)
وضعیت: فقط گزارش، هیچ کدی تغییر نکرده.

## روش
خواندن README، PROJECT_OVERVIEW، REPOSITORY_MAP، ARCHITECTURE، DEVELOPMENT_GUIDE، ROADMAP، GROUND_TRUTH 2026-09-21، package.json، build.js، server/index.js، server/sync.js، tests/run.js، smoke.js، migration-sequence.js، openapi-drift.js، check-authz.js، node.js.yml، .env.example، openapi.yaml، API_REFERENCE + لیست src/js، server، routes، migrations، authz، Actions و PRها از روی Current HEAD عمومی. تست اجرایی محلی انجام نشد.

## خلاصه مدیریتی
| دسته | تعداد | شناسه |
|---|---|---|
| بحرانی | 3 | C-01,C-02,C-03 |
| بالا | 7 | H-01..H-07 |
| متوسط | 9 | M-01..M-09 |
| پایین | 6 | L-01..L-06 |
| جمع | 25 | |

حکم: Phase 8.2 Exit=NOT VERIFIED و Production GO=NOT DECLARED (خوداظهاری درست مخزن). بزرگ‌ترین ریسک‌ها: نقطه‌کور drift، تناقض ARCHITECTURE، تناقض لایسنس، سکرت مثال واقعی‌نما، PRهای draft باز، نبود CI روی HEAD دقیق.
## بحرانی
### C-01 نقطه‌کور tools/openapi-drift.js
فقط regex روی `p === '...' && method` در server/index.js می‌گردد، ولی روت‌های واقعی به فکتوری‌ها واگذار شده‌اند: createStudentRoutes/Class/Attendance/Grade/User/Reports/Analytics/Semantic/Bootstrap/System. روت داخل server/routes/system.js (65KB) که لفظ p=== ندارد شمرده نمی‌شود و صفر دریفت کاذب می‌دهد. tests/openapi-drift.js هم همان الگوریتم را تکرار می‌کند + عدد جادویی 31 را assert می‌کند. بازتولید: node tools/openapi-drift.js در برابر grep -c روی routes. پیشنهاد: شمارش از رجیستری مرکزی یا تست HTTP زنده.
### C-02 کلید تکراری description در openapi.yaml تگ analytics
دو خط description پشت سر هم (هوشمندی آموزشی و سلامت) — در YAML دومی اولی را بی‌صدا می‌بلعد. توضیح هوشمندی عملاً در خروجی ماشین‌خوانده نیست. بازتولید با js-yaml load و دیدن تک description. پیشنهاد: جدا کردن تگ analytics و observability.
### C-03 تناقض لایسنس MIT در برابر Proprietary
package.json می‌گوید MIT ولی openapi.yaml می‌گوید Proprietary با url مثال example.ir. یکی دروغ است. ریشه هم LICENSE ندارد و publishConfig به npm.pkg.github.com فعال است. پیشنهاد: تعیین‌تکلیف واحد + افزودن/حذف LICENSE.
## بالا H-01..H-07
H-01: ARCHITECTURE.md هنوز می‌گوید بدون بک‌اند/بدون رمز، در برابر README و سرور واقعی JWT+PostgreSQL. توسعه‌دهنده جدید گمراه می‌شود.
H-02: سکرت واقعی‌نما در .env.example: PAYESH_JWT_SECRET=e7b4c91a...abcdef0 شبیه کلید واقعی است؛ باید CHANGE_ME باشد.
H-03: ناهمخوانی شمار API: API_REFERENCE می‌گوید 26 مسیر/31 عملیات ولی openapi.yaml با مسیرهای national ده‌ها مسیر دارد؛ یا مرجع کهنه است یا اسپک بادکرده با رزروهای بدون اندپوینت.
H-04: روت شرطی /api/__slow فقط با PAYESH_TEST_SLOW_MS وجود دارد ولی drift محیط را ثابت فرض کرده — قرمز/سبز کاذب.
H-05: ترتیب tests/run.js اول --check بعد build (نوشتن) درخت را کثیف می‌کند و گارد dirty-tree می‌شکند؛ npm test نباید بنویسد.
H-06: هفت PR/issue باز همه draft (نمونه 413 و 412 روی base قدیمی cb7e065 در برابر HEAD جدید 145088f) — کار امنیتی خاک می‌خورد.
H-07: CI روی HEAD دقیق نیست (PARTIAL) — ده run آخر Actions مال برنچ‌های PR بودند نه main@145088f. هیچ سبز جاری برای HEAD فعلی نیست.
## متوسط M-01..M-09
M-01: عملگرهای یتیم کلاینت که خود نگهبان‌ها لو دادند: byId بی‌گارد در جدول نمرات، فراخوانی add به‌جای insert (7 نقطه دور100 که بعد بوت گم می‌شود)، تابع تکراری generateP12 که سایه می‌انداخت. ریشه (scope مشترک + الحاق رشته‌ای) باقی است.
M-02: فایل JS بیرون _order.json فقط با یک تست گرفته می‌شود؛ .mjs یا زیرپوشه از build و تست می‌افتد و قابلیت یتیم می‌ماند.
M-03: server/index.js تک‌فایل 114KB با 20+ require و ترتیب حیاتی tracing اول؛ حذف یک ماژول یعنی crash بوت.
M-04: موتورهای server/analytics سابقه یتیم‌بودن (F-EI-01) دارند؛ ادعای 21/21 wired نیاز به re-verify روی HEAD جدید دارد و PR412 هنوز draft است.
M-05: بدهی سازمان‌دهی: گزارش‌های حجیم در ریشه + TODO_BEFORE_PRODUCTION دوپاره (redirect در ریشه و اصل در docs/audit/history). لینک‌شکنی و اشتباه truth تاریخی محتمل.
M-06: .env.example ناقص: PAYESH_WAF_MODE و PAYESH_TEST_SLOW_MS و PAYESH_BUILD_NO_CACHE در کد هست ولی در example نیست؛ PGURL در برابر DATABASE_URL دو قرارداد موازی.
M-07: بلعیدن خطای WAF با try/catch خالی در index.js یعنی کرش WAF در enforce برابر عبور بدون محافظ (fail-open لایه WAF).
M-08: متریک با route:p خام (url.pathname) در برابر ادعای قالب مسیر — شناسه در مسیر یعنی انفجار cardinality و پر شدن سقف 1024.
M-09: ROLE_LEVEL در sync.js نقش guard را ندارد (student/parent/driver/counselor/teacher/edu_office/manager/superadmin هست ولی guard نیست) — قاعده بدون ارتقاء برای guard نامشخص.
## پایین L-01..L-06 + سالم‌ها + بازتولید
L-01: سرورهای openapi.yaml مثال‌اند (payesh.example.ir) و استیجینگ برپا نشده — codegen با آن غلط است.
L-02: contact.url arena.ai و license.url example.ir نامعتبر/نامرتبط.
L-03: وضعیت gitignore کش بیلد .build-cache و dist نامشخص — npm test درخت را کثیف می‌کند.
L-04: sw.js دهKB از تست آفلاین‌بودن که فقط index.html را می‌گردد جا مانده و می‌تواند fetch کند.
L-05: manifest.json و آیکن‌ها هم از پوشش offline جا مانده‌اند.
L-06: پیام jsdom می‌گوید Node>=22.22 در برابر engines >=22.0.0 و CI 22.x — عدد 22.22 گمراه‌کننده.

سالم‌ها: زنجیره migration از 001 تا 021 پیوسته و جفت‌دار؛ _order.json نودونه‌تایی با سه نگهبان؛ WRITE_PERMS تک‌منبع از write-perms.json؛ حذف Node18/20 و fail-loud؛ Live PG/Redis در CI با fail-closed.

بازتولید:
git log --oneline -5
node tools/openapi-drift.js
grep -c p=== در برابر grep روی routes
node با js-yaml برای تگ analytics
grep PAYESH_JWT_SECRET و ROLE_LEVEL
node tests/migration-sequence.js
node build.js --check و git status --porcelain
تطبیق head_sha در Actions با commits/main

قرارداد: هیچ کدی تغییر نکرد؛ هیچ status ارتقا/تنزل نیافت؛ مرجع وضعیت همان GROUND_TRUTH 2026-09-21 + HEAD جاری است؛ Rule15 برای این اسکن ادعا نشده (اسکن استاتیک است نه verification اجرایی).
انتشار: نویسنده Muse Spark. مسیر پیشنهادی در مخزن: docs/audit/MUSE_SPARK_DEEP_SCAN_2026-09-25.md. پوش به origin نیازمند توکن کاربر است — در پیام نهایی دستور آماده داده شده.
