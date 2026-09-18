# سیاست حاکمیت ملی پایلوت و مهار رفتارهای خودکار (P2-PL-01)
## Phase 5: National Pilot Governance Policy & Human Sovereignty Standards

**نسخه:** ۱.۰.۰  
**تاریخ انتشار:** ۲۰۲۶-۰۹-۱۸  
**مرجع مهندسی:** الزامات حاکمیتی و اخلاقی نقشه راه ملی پایش  
**ماژول اجرایی:** `server/infrastructure/resource-governance.js`  

---

## ۱. اصل بنیادین حاکمیت نظارت انسانی (Human Sovereignty Invariant)

در پایلوت ملی سامانه پایش مدارس، تصمیم‌گیری پیرامون سرنوشت آموزشی و زیرساختی دانش‌آموزان و مدارس هرگز به الگوریتم‌های خودمختار واگذار نخواهد شد.

### قاعده صلب فنی (Code-Level Invariant)
هرگونه ثبت مداخله یا تصمیم پیرامون:
1. افزایش یا تغییر سهمیه‌بندی منابع کلاسترها یا مدارس.
2. اعمال تغییر در وضعیت دسترسی یا خارج‌سازی کلاستر از مدار (Failover).
3. استقرار سناریوهای مداخله یا سیاست‌گذاری آموزشی منطقه‌ای.

باید قاطعانه شروط سه‌گانه زیر را برآورده سازد:
```json
{
  "automated_decision": false,
  "automated_execution": false,
  "requires_human_approval": true
}
```

در صورت نقض هر یک از شروط فوق (برای مثال `automated_decision = true` یا `requires_human_approval = false`)، سامانه بلافاصله با پرتاب خطای زیر عملیات را متوقف می‌کند:
```
PHASE5_HUMAN_APPROVAL_REQUIRED: مداخله خودکار اکیداً مسدود است؛ تاییدیه باید مستقیماً با عاملیت انسانی صادر شود
```

---

## ۲. نقش‌ها و سلسله‌مراتب مجاز صدور تاییدیه (Approval Hierarchy)

| نقش کاربر | حوزه صلاحیت صدور تاییدیه | کد خطا در صورت نقض |
|---|---|---|
| `superadmin` | صدور تاییدیه سراسری و تغییر وضعیت تمام ۷ کلاستر ملی | - |
| `admin` | صدور تاییدیه تغییرات استانی و مدیریت کلاسترهای منطقه‌ای | - |
| `edu_office` | صدور تاییدیه تخصیص سهمیه مدارس داخل منطقه تحت مدیریت | `PHASE5_REGION_ISOLATION_VIOLATION` در صورت اقدام فرا‌منطقه‌ای |
| `manager`, `teacher`, `student`, `parent` | فاقد هرگونه دسترسی به گیت تایید حاکمیتی | `PHASE5_REGION_ISOLATION_VIOLATION` / `HTTP 403 Forbidden` |

---

## ۳. تضمین بدون مسامحه منع رتبه‌بندی رقابتی (Strict Zero-Ranking Standard)

بر مبنای اصول بنیادین سند تحول بنیادین آموزش و پرورش و مصوبات شورای عالی، **هرگونه رتبه‌بندی رقابتی مدارس و ایجاد جداول رده‌بندی (League Tables) غیرقانونی و ممنوع است.**

### ۳.۱ کلیدواژه‌ها و الگوهای ممنوعه
سامانه در کلیه لایه‌ها مجهز به اسکن بازگشتی داده‌ها است. مشاهده هر یک از واژگان یا ساختارهای زیر منجر به پرتاب فوری خطای `ZERO_RANKING_VIOLATION` می‌شود:
- `rank`, `ranking_score`, `ranking_position`
- `league_table`, `school_ranking`
- `best_school`, `worst_school`
- `top_school`, `compare_school`

### ۳.۲ رویکرد جایگزین رسمی: ارزیابی فردی و بافتی (Ipsative Evaluation)
تنها متدولوژی مجاز در گزارش‌های حاکمیتی و داشبوردها عبارت است از:
- **تحلیل طولی رشد همان مدرسه نسبت به گذشته خودش (Self-Referenced Growth).**
- **سهمیه‌بندی مبتنی بر نیاز بافتی و عدالت ترمیمی (Equitable Resource Distribution).**

---

## ۴. ثبت حسابرسی تغییرات حاکمیتی (Governance Audit Logging)

هر تاییدیه اپراتور انسانی که از طریق مسیر `/api/v1/system/phase5/pilot-approval` صادر می‌شود، یک رسید غیرقابل‌انکار با ساختار زیر دریافت کرده و در جدول پایدار حسابرسی ذخیره می‌گردد:

```json
{
  "approval_id": "APPV-1726665600000-abc12",
  "action_type": "CAPACITY_QUOTA_ADJUSTMENT",
  "target_region": "ir-tehran-1",
  "target_school": 101,
  "status": "APPROVED",
  "operator": {
    "id": 1,
    "role": "superadmin",
    "name": "مدیر کل زیرساخت"
  },
  "human_verified": true,
  "execution_mode": "SUPERVISED_HUMAN_DISPATCH",
  "timestamp": "2026-09-18T14:00:00.000Z"
}
```

رسیدهای صادره به صورت منجمد (Deep Freeze) بوده و در حافظه یا کش قابل تغییر یا بازنویسی نیستند.
