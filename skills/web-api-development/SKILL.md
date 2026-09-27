---
name: web-api-development
description: Build web APIs and services — route design, HTTP methods, validation, error handling, documentation, and CORS.
version: 1.0.0
author: rezaa2544, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [api, web, http, rest, education]
    related_skills: [network-fundamentals, software-security, databases-fundamentals]
---

# توسعه وب و APIها (web-api-development)

این مهارت ساخت سرویس‌های وب و API برای ارتباط کاربران یا سرویس‌های دیگر را
پوشش می‌دهد — از طراحی route تا اعتبارسنجی، مدیریت خطا و مستندسازی.

## When to Use

- ارائه یک سرویس تحت وب یا تعامل با کلاینت (UI وب، موبایل، سرویس دیگر).
- طراحی یا بازبینی یک API جدید.
- مستندسازی یا تست یک API موجود.
- Don't use for: منطق داخلی برنامه بدون نیاز به شبکه — مستقیم فراخوانی کن.

## Procedure

1. **مسیرها (routes) را طراحی کن.** بر اساس resource، نه بر اساس عمل:
   - `GET /api/students` — لیست
   - `GET /api/students/:id` — جزئیات
   - `POST /api/students` — ایجاد
   - `PATCH /api/students/:id` — به‌روزرسانی
   - `DELETE /api/students/:id` — حذف
2. **متدهای درست را انتخاب کن.** `GET` برای خواندن (بدون side effect)،
   `POST` برای ایجاد، `PATCH`/`PUT` برای تغییر، `DELETE` برای حذف.
3. **ورودیها را اعتبارسنجی کن.** هر درخواست باید schema/type/range بررسی
   شود. فیلدهای ناشناخته باید رد شوند (fail-closed)، نه نادیده گرفته شوند.
4. **کدهای وضعیت درست برگردان.**
   - `200` موفقیت، `201` ایجاد شده
   - `400` ورودی نامعتبر، `401` نیاز به ورود، `403` ممنوع، `404` پیدا نشد،
     `409` تعارض، `429` محدودیت نرخ
   - `500` خطای سرور (هرگز جزئیات حساس را فاش نکن)
5. **مدیریت خطا را统一 کن.** یک فرمت خطای واحد با `code` قابل پردازش
   ماشینی (مثلاً `{ok:false, code:"validation_failed"}`).
6. **احراز هویت و دسترسی را اعمال کن.** هر route حساس باید session تایید
   شده + scope check (owner/tenant) داشته باشد.
7. **مستندسازی کن.** OpenAPI/Swagger یا یک فایل مرجع با ورودی/خروجی و
   کدهای خطای هر endpoint.
8. **CORS را تنظیم کن.** فقط دامنه‌های مجاز را اجازه بده.
9. **rate limiting اضافه کن.** روی endpointهای حساس (login، OTP).
10. **در پروژه پایش:**
    - routeها در `server/routes/`
    - اعتبارسنجی در `server/validate.js`
    - authorization در `authz/`
    - API reference در `docs/API_REFERENCE.md` و `docs/openapi.yaml`

## Pitfalls

- **برگرداندن HTML به‌جای JSON** در یک API.
- **کد وضعیت اشتباه** (مثلاً `200` برای ورودی نامعتبر).
- **فراموش کردن احراز هویت** روی یک route.
- **نادیده گرفتن CORS** → درخواستها از مرورگر مسدود می‌شوند.
- **اعتبارسنجی فقط در frontend** — باید در سرور هم باشد.
- **نشت جزئیات خطا** (stack trace، نام فایل) به پاسخ کاربر.
- **عدم rate limiting** روی login → brute-force.

## Verification

- هر endpoint با ورودی معتبر، خروجی درست و کد وضعیت صحیح برمی‌گرداند.
- ورودی نامعتبر با `400` و یک کد خطای ماشینی رد می‌شود.
- یک request بدون session با `401`/`403` رد می‌شود.
- مستندات با رفتار واقعی API همخوانی دارد.
- endpointهای حساس rate-limited هستند.
