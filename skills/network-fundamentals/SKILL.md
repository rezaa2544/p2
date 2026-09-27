---
name: network-fundamentals
description: Understand networking essentials — OSI model, TCP/IP, HTTP/HTTPS, DNS, and troubleshooting connections between services.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [networking, osi, tcp-ip, http, education]
    related_skills: [software-security, devops-cicd, web-api-development]
---

# مفاهیم شبکه (network-fundamentals)

این مهارت درک اصول پایه ارتباطات شبکه‌ای را پوشش می‌دهد: مدل OSI،
پروتکل‌های TCP/IP، HTTP/HTTPS و عیب‌یابی ارتباط بین سرویس‌ها.

## When to Use

- نوشتن سرویس‌های شبکه یا کار با APIهای وب.
- عیب‌یابی ارتباط بین کلاینت و سرور یا بین میکروسرویس‌ها.
- تنظیم timeout، retry و مدیریت خطاهای شبکه در کد.
- Don't use for: طراحی زیرساخت تولید پیشرفته (load balancer، CDN) — برای
  آن مستندات تخصصی بخوان.

## Procedure

1. **مدل OSI را بشناس.** هفت لایه: Physical، Data Link، Network، Transport،
   Session، Presentation، Application. هر لایه مسئولیت مشخصی دارد.
2. **پروتکل‌های کلیدی:**
   - **IP:** مسیریابی بسته‌ها بین شبکه‌ها
   - **TCP:** اتصال‌محور، قابل اعتماد، handshake سه‌مرحله‌ای
   - **UDP:** بدون اتصال، سریع، بدون تضمین تحویل
   - **HTTP/HTTPS:** request/response، methodها، status codeها
   - **DNS:** ترجمه نام دامنه به آدرس IP
3. **یک کلاینت/سرور ساده بنویس.** مثلاً با `socket` در پایتون یا `http`
   در Node.js. این پایه فهم عملی است.
4. **ابزارهای عیب‌یابی را به کار ببر:**
   - `ping` — آیا مقصد قابل دسترسی است؟
   - `traceroute` / `tracert` — مسیر بسته‌ها
   - `netstat` / `ss` — پورتها و اتصالهای فعال
   - `curl -v` — جزئیات یک درخواست HTTP
5. **خطاهای رایج را تشخیص بده:**
   - Timeout: مقصد غیرقابل دسترسی یا کند
   - Connection refused: سرویس روی آن پورت اجرا نمی‌شود
   - DNS resolution failure: نام دامنه قابل ترجمه نیست
   - 502/503/504: درخواست به سرور پایانی نرسید یا سرور اشباع شد
6. **در کد، شبکه را قابل اعتماد طراحی کن:**
   - timeout مشخص برای هر request
   - retry با backoff تصاعدی (نه حلقه بی‌نهایت)
   - fail-closed وقتی سرویس وابسته در دسترس نیست
7. **امنیت ارتباط را در نظر بگیر.** HTTPS به جای HTTP در تولید، TLS
   certificates معتبر، جلوگیری از SSRF در requestهای سمت سرور.

## Pitfalls

- **عدم تنظیم timeout** — برنامه می‌تواند تا ابد منتظر بماند.
- **فراموش کردن retry با backoff** — یک قطع کوتاه کل سیستم را از کار
  می‌اندازد.
- **اشتباه گرفتن TCP و UDP** — UDP برای انتقال قابل اعتماد مناسب نیست.
- **دنبال کردن مشکل در لایه اشتباه** — قبل از بررسی کد، connectivity
   پایه (ping، DNS) را بررسی کن.
- **استفاده از HTTP ساده** در تولید به جای HTTPS.

## Verification

- یک سرویس نمونه روی یک پورت اجرا و با یک کلاینت قابل دسترسی است.
- `curl` یک status code قابل تفسیر برمی‌گرداند.
- وقتی یک سرویس وابسته قطع است، کد به‌جای hang، یک خطای شفاف برمی‌گرداند.
- retry logic در صورت خطای گذرا، در نهایت موفق می‌شود یا fail-closed می‌کند.
