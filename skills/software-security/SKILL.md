---
name: software-security
description: Prevent and fix common software vulnerabilities — input validation, access control, injection, secrets, and secure session handling.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [security, owasp, vulnerabilities, education]
    related_skills: [network-fundamentals, qa-testing, code-review]
---

# امنیت نرم‌افزار (software-security)

این مهارت شناخت و پیشگیری از آسیب‌پذیری‌های رایج نرم‌افزاری (OWASP Top 10)
و پیاده‌سازی تدابیر پیشگیرانه را پوشش می‌دهد.

## When to Use

- در فاز توسعه هر نرم‌افزار، مخصوصاً قبل از انتشار یا ادغام تغییرات مهم.
- بازبینی یک diff، route یا قابلیت جدید برای یافتن آسیب‌پذیری.
- وقتی داده حساس (PII، credential، داده دانش‌آموز) درگیر است.
- Don't use for: ارزیابی زیرساخت فیزیکی یا network penetration test تخصصی —
  برای آن از `network-fundamentals` و ابزارهای تخصصی استفاده کن.

## Procedure

1. **OWASP Top 10 را مرور کن** و مرتبط‌ترین موارد را با پروژه تطبیق بده:
   - Broken Access Control
   - Cryptographic Failures
   - Injection (SQL، Command، XSS)
   - Insecure Design
   - Security Misconfiguration
   - Vulnerable and Outdated Components
   - Identification and Authentication Failures
   - Software and Data Integrity Failures
   - Security Logging and Monitoring Failures
   - Server-Side Request Forgery (SSRF)
2. **ورودی کاربر را اعتبارسنجی کن.** هر ورودی از بیرون باید schema/type/range
   بررسی شود. هیچ‌وقت ورودی را قابل اعتماد فرض نکن.
3. **کنترل دسترسی را پیاده‌سازی کن.** اصل حداقل دسترسی (Least Privilege).
   هر request باید owner/scope را خودش تأیید کند، نه اینکه به session تکیه کند.
4. **در برابر injection مقاومت کن.**
   - SQL: از parameterized queries استفاده کن (نه string concatenation)
   - XSS: خروجی HTML را escape کن (`esc()` در پروژه پایش)
   - Command: از آرایه argument استفاده کن، نه از shell string
5. **اسرار را مدیریت کن.** هیچ‌گاه توکن/کلید/رمز را در کد یا فایل‌های پروژه
   قرار نده. از متغیرهای محیطی استفاده کن. `.env` در `.gitignore` است.
6. **احراز هویت و نشست را سخت کن.** رمز عبور هش‌شده (bcrypt/argon2)،
   ماندگاری نشست محدود، cookie با `HttpOnly; Secure; SameSite`،
   rate limiting روی ورود.
7. **تست نفوذ انجام کن.** با ابزارهایی مثل OWASP ZAP یا پروبهای دستی،
   endpointهای اصلی را آزمایش کن (positive + negative + boundary).
8. **امنیت را لاگ کن.** رخدادهای امنیتی (ورود ناموفق، دسترسی غیرمجاز،
   تغییر حساس) را ثبت کن تا قابل پیگیری باشند.
9. **در پروژه پایش — موارد خاص:**
   - Tenant isolation: کوئریها همیشه `school_id` دارند
   - PII دانش‌آموزان (نام، کد ملی، شماره تماس)
   - OTP و JWT در `server/auth.js`
   - نباید کلید یا توکن در فایل‌های پروژه باشد (`tests/secret-scan.js`
     این را بررسی می‌کند)

## Pitfalls

- **اعتماد به ورودی کاربر** — همه ورودی را بررسی و فیلتر کن.
- **تکیه صرف روی frontend** برای امنیت — کنترل باید در سرور باشد.
- **پنهان کردن خطا به جای حل آن** — یک catch خالی با response موفق،
  false-green است.
- **دسترسی بر اساس نقش بدون بررسی owner** — IDOR: هر کاربر می‌تواند
  داده دیگران را با تغییر ID بخواند.
- **فراموش کردن rate limiting** روی endpointهای حساس (login، OTP).
- **لاگ کردن داده حساس** — رمز/کد ملی را در لاگ ننویس.

## Verification

- هر endpoint حساس با یک ورودی نامعتبر، fail-closed برمی‌گرداند.
- یک پروب نفوذ (مثلاً دسترسی به داده کاربر دیگر) مسدود می‌شود.
- اسکن secretها (`node tests/secret-scan.js` در پروژه پایش) سبز است.
- تستهای negative/adversarial برای کنترل دسترسی نوشته و سبز شده‌اند.
- عملیات حساس audit log تولید می‌کنند.
