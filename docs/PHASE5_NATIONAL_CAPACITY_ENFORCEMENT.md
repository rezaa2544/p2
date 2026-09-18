# اجبار صلب سقف‌های ظرفیت ملی و حاکمیت رزرو سهمیه (P2-NI-03)
## Phase 5: National Capacity Enforcement, Quota Ceiling & Reservation Governance

**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**کد ماژول مرجع:** `server/infrastructure/national-capacity-enforcement.js`  

---

## ۱. تفاوت مدل ظرفیت و لایه اجبار صلب (Model vs Enforcement)

در فازهای پیشین، مدل ظرفیت به صورت یک افق محاسباتی و توصیه‌ای تعریف شده بود. در گام **P2-NI-03**، این مدل به یک **قرارداد اجبار صلب و غیرقابل‌تخلف (Enforcement Contract)** تبدیل شده است؛ به‌نحوی‌که هرگونه تقاضای مازاد بر سقف‌های رسمی به صورت بلافاصله و بدون فالبک خاموش مسدود (Fail-Closed) می‌گردد.

---

## ۲. سقف‌های قطعی و خطاهای رسمی لایه اجبار

| شاخص ظرفیت | سقف مجاز سراسری | رفتار در عبور از سقف | کد خطای رسمی |
|---|:---:|:---:|---|
| **نرخ کل درخواست‌ها (RPS)** | ۲۰,۰۰۰ | رد فوری درخواست با HTTP 422 | `PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH` |
| **کاربران پیک همزمان** | ۲,۵۰۰,۰۰۰ | توقف پذیرش نشست‌های جدید | `PHASE5_NATIONAL_CAPACITY_LIMIT_BREACH` |
| **نرخ نوشتن پایدار (Write TPS)** | ۲,۵۰۰ | اعمال Backpressure و رد تراکنش‌های غیراضطراری | `PHASE5_NATIONAL_WRITE_CAPACITY_BREACH` |
| **گذردهی صف رویدادها** | ۲۵,۰۰۰ eps | مسدودسازی رویدادهای غیراصلی Outbox | `PHASE5_NATIONAL_EVENT_CAPACITY_BREACH` |
| **اتصالات فعال پایگاه داده** | ۳,۵۰۰ | رد اتصال اضافه در لایه استخر کانکشن | `PHASE5_NATIONAL_DB_CAPACITY_BREACH` |

---

## ۳. حاکمیت رزرو سهمیه ظرفیت (Capacity Reservation Governance)

برای بازه‌های آزمون ملی یا دوره‌های پرفشار ثبت‌نام، ظرفیت به صورت کنترل‌شده و از طریق پایانه رسمی رزرو می‌گردد:

```json
{
  "reservation_id": "res-math-exam-2026",
  "region_id": "ir-isfahan-1",
  "tenant_id": "tenant-district-03",
  "requested_capacity": { "rps": 500, "concurrent_users": 100000 },
  "approved_capacity": { "rps": 500, "concurrent_users": 100000 },
  "operator_id": "op-exam-lead",
  "approval_id": "appv-res-9901",
  "created_at": "2026-09-18T10:00:00Z",
  "expires_at": "2026-09-18T14:00:00Z",
  "reason": "پوشش سهمیه آزمون استانی ریاضی"
}
```

### الزامات و قیود حاکمیتی:
1. **الزام تایید اپراتور انسانی:** هر رزرو بدون امضای معتبر انسانی خطای `PHASE5_RESERVATION_APPROVAL_REQUIRED` پرتاب می‌کند.
2. **منع تصمیمات خودکار:** پرچم‌های `automated_decision: true` یا `auto_scale: true` اکیداً باطل می‌گردند.
3. **انقضای خودکار:** با فرارسیدن `expires_at` وضعیت رزرو به صورت صلب به `EXPIRED` تغییر می‌یابد.
