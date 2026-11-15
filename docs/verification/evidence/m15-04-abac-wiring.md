# شواهدِ M15-04 — سیم‌کشیِ ABAC به دروازهٔ sync (follow-upِ ردیفِ ۲۴)

تاریخ: ۲۰۲۶-۱۱-۱۴ · شاخه: main · والد: تسکِ ۲۴ صفِ Notion (M15-04 کنترل دسترسی دقیق — هیبرید RBAC+ABAC)

## چه چیزی تحویل شد

ردیفِ ۲۴ صف، پیش‌تر PARTIAL بود با یادداشتِ «per-API wiring follow-up». این تحویل همان follow-up را می‌بندد:

1. **سیم‌کشیِ موتورِ ABAC به دروازهٔ عملیات** (`server/sync.js`):
   - نمونهٔ ABAC در سطح ماژول با بوتِ fail-fast (سیاستِ ناخوانا = کرشِ بوت، نه اجازهٔ خاموش) — `createAbac()` روی `authz/abac-policies.json`.
   - در `fieldGate` — بلافاصله پس از بررسیِ مجموعهٔ ناشناخته، **پیش از** شاخهٔ del و بررسی‌های نقش: تصمیمِ ABAC با نگاشتِ `action = <collection>:write|delete`، `resource.type` از نقشهٔ `ABAC_RESOURCE` (grades→grade، exams→exam، reports→report)، و صفاتِ `school_id` (داده یا نشست)، `grade` (پایهٔ حل‌شده)، `exam_type` (داده).
   - **deny = ردِ عملیات‌محور** با `code: 'abac_denied'` — الگوی «۲۰۰ + ok:false» حفظ می‌شود؛ کل دسته نمی‌میرد؛ audit با `sync_field_gate` ثبت می‌شود.
   - defer (بدون قاعده) = رفتارِ پیشین (RBAC تصمیم می‌گیرد) — **هیچ مسیرِ عادی تغییر رفتار ندارد**.
   - **حلِ پایهٔ منبع**: ردیفِ grades پایه را حمل نمی‌کند (پایه روی classes است)؛ در call-site، برای `grades` با `class_id`، پایه از کلاسِ هدف در store حل می‌شود؛ کلاسِ نایافتنی = defer.
   - دسترسیِ `__abac` در exports (الگویِ موجودِ `db.__setPoolForTests`) برای reload در اثباتِ منفی.

2. **اصلاحِ قواعدِ مردهٔ سیاست** (`authz/abac-policies.json`): مقدارهای انگلیسیِ `national`/`school`/`class` در مدلِ واقعیِ محصول هرگز منطبق نمی‌شدند (مقادیرِ کلاینت فارسی‌اند و فیلدِ exam_type روی exams هم نیست). اصلاح:
   - aba-03 → `grades:write` deny با `exam_type: 'امتحان نهایی'` (نوعِ آزمون روی ردیفِ grades است) — قاعدهٔ مطلق حتی برای superadmin.
   - aba-04 → `exams:write` allow با `school_id: self` (برنامهٔ آزمون‌ها tenant-scoped).
   - aba-01 (پایه‌های ۱۲/۱۱/۱۰) با حلِ پایهٔ کلاس **زنده** شد — پیش‌تر روی دادهٔ grades هرگز منطبق نمی‌شد.

3. **سوئیتِ جدید** `tests/m15-04-abac-wiring.js` — ۱۵ چک (W0-W8) با **اثباتِ منفیِ سیم‌کشی**: جهشِ `aba-01` از deny به allow در فایلِ سیاست + reload → همان صحنه‌ای که رد می‌شد عبور می‌کند (W5) → گیت واقعاً از فایل تغذیه می‌شود، deny هاردکد نیست. فایل در finally بازگردانده و دوباره آزمون می‌شود (W5b/W5c).

4. **هماهنگیِ سوئیتِ موتور** `tests/m15-04-abac.test.js` (B4) با مقادیرِ واقعیِ محصول — B4a حالا روی `grades:write` با «امتحان نهایی» است؛ ۱۱/۱۱.

## چرا بدونِ شکستنِ هیچ سوئیتی

- هیچ سوئیتی از مسیر sync با `exam_type='امتحان نهایی'` یا کلاسِ پایه‌یِ ۱۰-۱۲ نمی‌نویسد (جستجوی فراگیرِ tests/*.js — صفر منطبق).
- مقادیرِ پایه در فیکسچرهای sync فقط ۷/۸/۹ (یا بی‌کلاس) است؛ مسیرِ deny جدید فقط سناریوهایِ سیاست‌گذاری‌شده را می‌گیرد.
- deny مقدم بر canOp است، پس حتی سوپرادمین هم از قواعدِ صفت‌محور عبور نمی‌کند — فلسفهٔ deny-first.

## فرمان‌های تأیید

- `node tests/m15-04-abac-wiring.js` → `m15-04-abac-wiring: 15 pass / 0 fail` — `CHECKS 15 FAIL 0` — exit 0
- `node tests/m15-04-abac.test.js` → `m15-04-abac: 11 pass / 0 fail` — `CHECKS 11 FAIL 0` — exit 0
- `node tools/strict-verification-gate.js` → `RESULT 755 pass / 1 fail`؛ تنها fail = G17 (دریفتِ کامیت‌نشده — همین تغییرات)؛ `VERIFIED_ITEMS 32/32`؛ پس از ریتوالِ کامیت باید VERDICT VERIFIED شود.
