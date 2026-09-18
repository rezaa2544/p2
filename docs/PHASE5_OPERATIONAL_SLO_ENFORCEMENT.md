# گیت اجبار شاخص‌های سطح خدمت و مهار تخلفات (P2-NI-03)
## Phase 5: Operational SLO Enforcement Gate & Breach Prevention

**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**کد ماژول مرجع:** `server/monitoring/national-observability-plane.js`  

---

## ۱. شاخص‌های رسمی سطح خدمت (SLO Standards)

| شاخص عملکردی | سقف رسمی SLO | رفتار در نقض سقف | وضعیت در نبود داده واقعی |
|---|:---:|---|:---:|
| **تاخیر صدک ۹۵ (p95)** | $\le 300\text{ ms}$ | ثبت وضعیت BREACHED / خطای Fail-Closed | `NOT_VERIFIED` |
| **تاخیر صدک ۹۹ (p99)** | $\le 1000\text{ ms}$ | ثبت وضعیت BREACHED / خطای Fail-Closed | `NOT_VERIFIED` |
| **نرخ خطای درخواست‌ها** | $< 0.1\%$ | توقف مسیر و اعلام هشدار قرمز NOC | `NOT_VERIFIED` |
| **تاخیر صف رویدادها** | $\le 500\text{ ms}$ | مهار پذیرش کارهای جدید در Outbox | `NOT_VERIFIED` |
| **تاخیر رپلیکیشن دیتابیس** | $\le 300\text{ ms}$ | هشدار عدم همگام‌سازی Standby | `NOT_VERIFIED` |

---

## ۲. قانون شفافیت: تفکیک NOT_VERIFIED از PASS

در صورتی که داده‌های تله‌متری بلادرنگ در دسترس نباشند:
- وضعیت سامانه هرگز `PASS` یا `VERIFIED` علامت‌گذاری نمی‌شود.
- وضعیت رسماً به عنوان `NOT_VERIFIED` ثبت می‌گردد تا از ایجاد احساس امنیت کاذب جلوگیری شود.
