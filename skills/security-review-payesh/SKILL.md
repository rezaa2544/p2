---
name: security-review-payesh
description: Security review for the Payesh (پایش) project — client-side vanilla JS, localStorage data, simulated authz (30-authz.js). Use when reviewing a diff, new feature, or new action for vulnerabilities: cross-school data leakage (IDOR / school_id filters in queries), XSS (esc/escAttr on user input), tokens or secrets committed into project files, journal/applyOp data-integrity, missing or wrong authz entries. Dilaz rule applies: NO FINDING WITHOUT A WORKING EXPLOIT — a finding only counts with a runnable jsdom PoC test (tests/smoke.js harness, W() idiom) that actually demonstrates the vulnerability. Includes the list of known intentional deviations (round 28, in TODO_BEFORE_PRODUCTION.md) to avoid false positives.
---

# بازبینی امنیتی پایش — کلاینت‌ساید (security-review-payesh)

## ⚖️ اصل حاکم (الگوی Dilaz)

**«بدون exploit کارکردن، یافته نداریم»:** ادعای «ممکن است آسیب‌پذیر
باشید» حساب **فایده نمی‌شود**. هر یافته باید با یک **آزمون jsdom
کارکردن** همراه باشد که آسیب‌پذیری را واقعاً نشان دهد — مثلاً:

* یک کاربر مدرسهٔ ۱ که رکورد مدرسهٔ ۲ را می‌خواند (نشت بین‌مدرسه‌ای)؛
* یک مقدار کاربرِ حاوی `<img src=x onerror=...>` که در HTML خام
  می‌نشیند (XSS)؛
* نوشتن داده بدون ثبت در journal که sync/بازپس‌گیری را می‌شکند.

این دقیقاً همان فلسفهٔ تست جهش خودِ پایش است: **ثبیت با اجرا، نه
با حدس.** آزمون exploit در `tests/smoke.js` (ایدیوم `W()`) نوشته
می‌شود و اگر سبز شد، یافته قطعی است؛ بعدش فایکس + همین آزمون
بماند (حلقه بسته).

## دامنهٔ بازبینی — واقعیت این پروژه

این یک **اپ سروری نیست**: داده در localStorage، «احراز هویت» و
«مجوز» شبیه‌سازی فاز دمویی در `30-authz.js` (جدول `ACTION_ROLES`)
هست. سطح حملهٔ واقعی این فاز:

1. **نشت بین‌مدرسه‌ای (IDOR)** — خطرسازترین؛
2. **XSS** — ورودی کاربر به HTML؛
3. **یکپارچگی داده (journal/applyOp)** — دوطرفهٔ آفلاین/سرور.

## چک‌لیست اجباری (برای هر تغییر)

1. **نشت بین‌مدرسه‌ای:** هر کوئری تازه روی `db.*` باید فیلتر
   `school_id` داشته باشد یا از کوئری‌های `visible*` (04-queries)
   بگذرد. PoC: با کاربر مدرسهٔ ۱، رکورد مدرسهٔ ۲ را بخوان/تغییر
   بده → باید نرسد.
2. **`esc()` روی همهٔ ورودی:** متن با `esc()`، آتریبیوت با
   `escAttr()`. هر `+` ورودی کاربر در قالب HTML که بدون esc رد
   شود = P0 تا وقتی exploit نوشته نشود.
3. **token/رمز در فایل:** diff نباید هیچ token، رمز عبور واقعی یا
   secret بیاورد (token فقط در `~/.payesh_gh_token`؛ رمز دمو
   `123456` یک نقض شناخته‌شده است، ببخش پایین).
4. **یکپارچگی journal:** هر تغییر دادهٔ تازه باید از
   `applyOp`/insert/update/remove بگذرد. نوشتن مستقیم `db` بدون
   log = یافته (مگر fixture آزمونِ موقتی با restore).
5. **جدول مجوز (30-authz):** هر `data-act` تازه باید ورودی با نقش
   معقول داشته باشد. اکشنِ بدون authz یا با نقش گسترده‌تر از
   لازم = P0/P1.
6. **مرز نقش روی نماها:** صفحهٔ حساسِ تازه باید برای نقش‌های
   ممنوعه بسته باشد (الگوی آزمون‌های «صفحه‌های حساس باز نیستند»).
7. **ورودی به journal:** مقادیر وارد applyOp باید همان‌ها باشند که
   UI تأیید کرده (اسنپشات/بررسی در سمت ثبت — الگوی «بررسی دروازه
   مطلق» اصل پنجم).

## روش ۹ مرحله‌ای (مکمل — از security-expert / اصل پنجم)

1. بفهم قابلیت چه می‌کند
2. دادهٔ حساس و مرزهای اعتماد را بیاب
3. مهاجم و سناریوی سوءاستفاده را تصور کن
4. احراز هویت و مجوز را بررسی کن
5. **هر** ورودی کاربر را وارسی کن
6. نشت احتمالی داده را بیاب
7. ارتباط با سرویس بیرونی را بررسی کن
8. ضعف‌ها را فهرست کن
9. بر پایهٔ شدت طبقه‌بندی کن (P0–P3)

## 🚫 نقض‌های شناخته‌شده و عمداً پذیرفته‌شده (دور ۲۸)

این موارد در `TODO_BEFORE_PRODUCTION.md` ثبت‌اند و **تصمیم آگاهانه**
اند — در بازبینی **دوباره گزارش نشوند** (هشدار کاذب):

1. bcrypt — رمزهای دمو متن ساده
2. احراز هویت سمت سرور
3. پایگاه دادهٔ واقعی
4. بررسی نقش سمت سرور

## فرمت ثبت هر یافته

```
شدت: P0–P3
مسیر: فایل/تابع
Exploit (اجباری): آزمون jsdom کارکردن در tests/smoke.js
                 که آسیب‌پذیری را نشان می‌دهد (کد آزمون پیوست)
فایکس: ...
حلقه بسته: آزمون exploit پس از فایکس سبز بماند
```

**کمیتهٔ تصمیم:** یافتهٔ P0/P1 بدون exploit کارکردن وارد گزارش
نمی‌شود؛ P2/P3 می‌توانند بدون exploit ثبت شوند ولی برچسب
«بدون PoC» دارند و اولویت فایکس پایین‌تر است.
