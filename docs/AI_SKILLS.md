# چارچوب رسمی مهارت‌های مهندسی هوش مصنوعی (AI Skills Framework)
## Official AI Engineering Agent Skills for Payesh (`rezaa2544/p2`)

**تاریخ سند:** ۲۰۲۶-۰۹-۱۸  
**نگارش:** ۱.۰.۰  
**وضعیت:** مصوب و مستقر در محیط پروژه (Approved & Operational)  
**مسیر فیزیکی:** `.agent/skills/`  
**اسکریپت اعتبارسنجی:** `node tools/verify-agent-skills.js`  

---

## ۱. فلسفه و هدف استقرار مهارت‌ها

پروژه سامانه ملی پایش مدارس دارای نیازمندی‌های سخت‌گیرانه، غیرقابل‌مذاکره و اصول تخطی‌ناپذیر مهندسی (نظیر حاکمیت تصمیم انسانی، شکست‌ایمن، منع رتبه‌بندی رقابتی و زنجیره صلب تحویل گیت) است. جهت تضمین پایبندی تمامی ایجنت‌های هوش مصنوعی (در Arena، ChatGPT، Codex، Claude Code و غیره) به استانداردهای بالای مهندسی نرم‌افزار، ۸ مهارت رسمی و بالینی مهندسی در مخزن پروژه نصب و پیکربندی شدند.

---

## ۲. مشخصات و مخازن مرجع ۷ مهارت مستقر

| # | نام مهارت (Skill) | مخزن مرجع (Source Repository) | موقعیت در ساختار پروژه | مأموریت و هدف اجرایی |
|---|---|---|---|---|
| **۱** | **`interview-me`** | [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) | `.agent/skills/interview-me/` | پرسشگری هدفمند قبل از کدنویسی جهت شفاف‌سازی ابهامات و کشف نیازهای واقعی کاربر |
| **۲** | **`agent-watchdog`** | [`BuilderIO/skills`](https://github.com/BuilderIO/skills) | `.agent/skills/agent-watchdog/` | دیده‌بانی و نظارت بر کنش‌های ایجنت و مهار انحراف از مشخصات و توهم در کد |
| **۳** | **`plan-arbiter`** | [`BuilderIO/skills`](https://github.com/BuilderIO/skills) | `.agent/skills/plan-arbiter/` | داوری بین طرح‌های فنی رقیب، ارزیابی سبک‌سنگین کردن‌ها (Trade-offs) و صدور یادداشت تصمیم |
| **۴** | **`systematic-debugging`** | [`obra/superpowers`](https://github.com/obra/superpowers) | `.agent/skills/systematic-debugging/` | عیب‌یابی سیستماتیک ۴ مرحله‌ای، ریشه‌یابی علل باگ و توقف آزمون‌وخطای تصادفی |
| **۵** | **`verification-before-completion`** | [`obra/superpowers`](https://github.com/obra/superpowers) | `.agent/skills/verification-before-completion/` | تحریم ادعای انجام کار قبل از اجرای واقعی آزمون‌ها و مشاهده عینی شواهد سبز |
| **۶** | **`frontend-design`** | [`anthropics/skills`](https://github.com/anthropics/skills) | `.agent/skills/frontend-design/` | طراحی واسط کاربری معنادار، تمایزیافته و فرار قاطع از قالب‌های پیش‌پاافتاده و کلیشه‌ای |
| **۷** | **`read-the-damn-docs`** | [`BuilderIO/skills`](https://github.com/BuilderIO/skills) | `.agent/skills/read-the-damn-docs/` | رجوع مستقیم به مستندات و قراردادهای مرجع دیتابیس و معماری قبل از اتکا به حافظه مدل |

---

### ۸) strict-verification — راستی‌آزمایی چندباره و evidence-first
- مسیر: `.agent/skills/strict-verification/`
- مأموریت: مطالعه اجباری قوانین/scaleها، بازتولید، تست چندباره مستقل، adversarial/boundary/negative testing، regression و منع VERIFIED بدون evidence current-head.

## ۳. نگاشت مهارت‌ها با زنجیره رسمی تحویل پروژه (`Delivery Chain`)

فرایند تحویل مهندسی در این پروژه به شرح زیر با مهارت‌های هفت‌گانه گره خورده است:

```
[درخواست کاربر]
       ↓
[interview-me] ──────────→ شفاف‌سازی ابهام‌ها و عدم اتکا به فرضیات نامشخص
       ↓
[read-the-damn-docs] ────→ مطالعه اسناد معماری، مدل‌های داده و قراردادهای API
       ↓
[plan-arbiter] ──────────→ مقایسه معماری‌ها و گزینش استراتژی بهینه
       ↓
[CODE / IMPLEMENT] ──────→ توسعه با رعایت [frontend-design] برای UI و کد نویسی تمیز
       ↓
[systematic-debugging] ──→ رفع اصولی و ریشه‌ای خطاهای احتمالی تست‌ها
       ↓
[TEST / VERIFY] ─────────→ اجرای کلیه دروازه‌های کیفی (Quality Gates)
       ↓
[verification-before-completion] ─→ مهار ادعای Done بدون مشاهده شواهد عینی سبز
       ↓
[agent-watchdog] ────────→ ممیزی عدم نشت سکرت، پاکی گیت و رعایت حاکمیت انسانی
       ↓
[COMMIT → PUSH → PR → MERGE → MAIN VERIFICATION → REPORT]
```

---

## ۴. دستورالعمل راستی‌آزمایی در محیط پروژه

جهت اطمینان از سلامت و در دسترس بودن مهارت‌ها، اسکریپت راستی‌آزمایی زیر در محیط قابل اجراست:

```bash
node tools/verify-agent-skills.js
```

خروجی موفقیت‌آمیز شامل تایید ۱۰۰٪ وجود فایل‌های `SKILL.md`، عدم وجود شکست در ارجاعات داخلی و ثبت ۷ مهارت فعال می‌باشد.
