---
name: payesh-standards
description: Working rules for the Payesh (پایش) school-management project — vanilla JS, single-file offline build, jsdom smoke tests. Use this skill on ANY change in this repository: writing or reviewing code, running tests (smoke.js, run.js, build.js), adding fixtures, committing, pushing, writing docs (AI_PROMPT, CONTRIBUTING, PROJECT_NOTES), or ending a session (HANDOFF). Covers: mandatory mutation testing, real-execution verification (never guess), esc() on all user input, data changes only via the applyOp journal, no tokens in project files, ISO storage / Jalali display, index.html is build output, per-change commit + push + ls-remote verification, Persian-digit corruption audit, protected files (New folder.rar).
---

# استانداردهای پروژهٔ پایش (payesh-standards)

این اسکیل **قوانین ثابت** پروژهٔ پایش است — همان‌هایی که در هر سشن
تکرار می‌شوند. برای **هر** تغییری در این ریپو (از یک خط تا یک
قابلیت کامل) این فهرست را طی کن.

## قانون طلایی

**«تأیید کورکورانه نکن»:** هیچ ادعایی دربارهٔ رفتار کد بدون **اجرای
واقعی** (jsdom در `tests/smoke.js` با ایدیوم `W()`) قابل ثبت نیست.
از حافظه یا حدس کار نکن — بکن، ببین، ثبت کن.

## قوانین اجباری

1. **تست جهش برای هر آزمون مهم (اجباری):** کد را عمداً خراب کن
   (جهش) و آزمون باید آن را بگیرد. آزمونی که یک جهش را نمی‌گیرد،
   بی‌ارزش است. روال: بکاپ فایل → جهش → بیلد → اجرای smoke →
   تأیید افت آزمون → بازگردانی → اجرای نهایی سبز.
2. **اجرای واقعی برای هر ادعا:** رفتار با `W()` در jsdom یا
   `node tests/smoke.js` تأیید شود، نه «باید کار کند».
3. **`esc()` روی همهٔ ورودی کاربر:** متن با `esc()`، آتریبیوت
   با `escAttr()`. ورودی خام در HTML = XSS.
4. **تغییر داده فقط از راه journal:** `applyOp` / insert / update /
   remove. دستکاری مستقیم `db` فقط در fixtures آزمون موقتی — و
   حتماً با بازگردانی (restore) در همان آزمون.
5. **token هرگز در فایل پروژه:** توکن فقط در
   `~/.payesh_gh_token` می‌ماند؛ در کد، کامیت و مستندات نه.
6. **تاریخ ISO-گریگوری ذخیره، جلالی نمایش:** هرگز جلالی ذخیره
   نشود.
7. **`index.html` خروجی بیلد است — دست‌نخورده:** تغییر در `src/` +
   `node build.js`. پس از بیلد، `node build.js --check` باید سبز
   بماند (بیت‌به‌بیت).
8. **هر تغییر = کامیت جدا + push + تأیید با `git ls-remote`:**
   تا sha در GitHub دیده نشود، push «انجام شده» نیست.
9. **مستندات در همان کامیت کد:** `docs/AI_PROMPT.md`،
   `CONTRIBUTING.md`، `PROJECT_NOTES.md` (برای تغییرات رفتاری/قاعده‌ای).
10. **HANDOFF بالای فایل در پایان هر سشن:** ورودی تازه **بالای**
    `HANDOFF.md` (جدیدترین اول) + کامیت جدا.
11. **بازبینی فساد اعداد فارسی:** بعد از هر نوشتاری که اعداد
    فارسی (۰-۹) دارد، دنباله‌ها را با کد‌پوینت بازرسی کن — باگ
    تکراری: ارقام (معمولاً ۳ یا ۰) در خروجی گم می‌شوند.
12. **`New folder.rar` دست‌نخورده:** تصمیمش با رضاست.
13. **دادهٔ دمو فقط با `add()`:** دادهٔ پایه با `SEED` + `rng()`
    بازتولیدپذیر است؛ آزمون‌ها فقط رکوردِ ساخته‌شدهٔ خودشان را پاک
    می‌کنند (با نقشهٔ شناسه‌های از‌پیش‌موجود).
14. **بدون فریم‌ورک و وابستگی خارجی:** تک‌فایلی، کاملاً آفلاین.
15. **کنترل سمت کلاینت = مجوز واقعی نیست:** `30-authz.js`
    شبیه‌سازی فاز دمو است (مورد نقض شناخته‌شدهٔ ۴ — ببخش پایانی).

## دستورهای تست

```
NODE_OPTIONS=--max-old-space-size=1536 node tests/smoke.js   # دودی (jsdom)
node tests/run.js                                            # ایستا
node build.js                                                # بیلد
node build.js --check                                        # یکسانی بیت‌به‌بیت
```

## فرمت گزارش پایان هر سشن

- چه شد / چه پیدا شد / چه می‌ماند
- وضعیت نهایی: smoke، ایستا، build --check، جهش‌ها
- GitHub: sha با تأیید ls-remote
- 🔴 **گزارش تجمیعی («گزارش کلی») همیشه به‌صورت فایل در
  `docs/REPORT_*.md`** + commit + push؛ در چت فقط اشارهٔ کوتاه
  (دستور صریح رضا).

## 🚫 نقض‌های شناخته‌شده و عمداً پذیرفته‌شده (دور ۲۸)

این موارد در `TODO_BEFORE_PRODUCTION.md` ثبت‌اند و **تصمیم آگاهانه**
اند — به‌عنوان نقص گزارش نشوند:

1. bcrypt (رمزهای دمو متن ساده)
2. احراز هویت سمت سرور
3. پایگاه دادهٔ واقعی
4. بررسی نقش سمت سرور
