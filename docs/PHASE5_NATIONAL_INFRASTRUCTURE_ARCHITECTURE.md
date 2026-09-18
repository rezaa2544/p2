# معماری شالوده زیرساخت ملی و فابریک تولید (P2-NI-01)
## Phase 5: National Infrastructure Foundation, Multi-Region Production Fabric & Sovereign Operations Layer

**نسخه:** ۱.۰.۰  
**تاریخ تصویب:** ۲۰۲۶-۰۹-۱۸  
**وضعیت:** مصوب و مستقر در هسته تولید ملی (Active & Production Ready)  
**مرجع مهندسی:** نقشه راه ملی پایش مدارس (بخش §۳۲ و §۳۳) — گام P2-NI-01  

---

## ۱. بیانیه مأموریت و چشم‌انداز راهبردی (Mission Statement)

گام **P2-NI-01** تحولی بنیادین در مسیر مهندسی فاز ۵ سامانه ملی پایش مدارس است: ساخت و استقرار قطعی **شالوده زیرساخت ملی تولید (National Production Fabric)** از هم‌اکنون، به گونه‌ای که مراحل آتی صرفاً شامل فعال‌سازی کلاسترها، اتصال استان‌ها و افزایش ظرفیت باشد و سامانه هیچ‌گاه نیازمند بازطراحی ساختاری، بازنویسی پروتکل‌ها یا تغییر معماری نگردد.

### ستون‌های پنج‌گانه فابریک زیرساخت ملی:
1. **National Region Control Plane:** مدیریت یکپارچه کنترل‌پلین ۷ کلاستر ملی با ماشین وضعیت صلب (`PROVISIONING`, `READY`, `ACTIVE`, `DEGRADED`, `MAINTENANCE`, `RECOVERY`).
2. **National Capacity Planning Engine:** مدل ظرفیت محاسباتی ۱۰ میلیون کاربر، ۲۰ هزار RPS، استریم رویدادهای Outbox و منع قاطع هرگونه Auto-scaling خودکار.
3. **National Traffic Fabric:** شبکه توزیع و بالانس ترافیک بین‌منطقه‌ای با گام‌های انتشار قناری `[0%, 5%, 10%, 25%, 50%, 100%]`.
4. **National Disaster Recovery Fabric:** نقشه اتصال متقاطع بین کلاسترها (Cross-Region DR Pairing) با RPO <= 300s و RTO <= 900s.
5. **Database Sovereignty & Zero Trust:** تثبیت انحصاری PostgreSQL به عنوان تنها منبع معتبر حقیقت (Single Source of Truth) و استفاده از Redis منحصراً به عنوان کش فرار.

---

## ۲. مشخصات کلاسترهای هفت‌گانه فابریک ملی

| شناسه کلاستر | نام کلاستر | استان‌های تحت پوشش | دیتاسنتر اصلی | دیتاسنتر جانبی | ظرفیت هدف RPS | سهمیه کاربران همزمان |
|---|---|---|---|---|:---:|:---:|
| `ir-tehran-1` | کلاستر پایتخت و حوزه مرکزی | تهران، البرز، قم، مرکزی، سمنان | `tehran-dc-01` | `tehran-dc-02` | ۳,۵۰۰ | ۱,۵۰۰,۰۰۰ |
| `ir-isfahan-1` | کلاستر فلات مرکزی ایران | اصفهان، یزد، چهارمحال و بختیاری، لرستان | `isfahan-dc-01` | `isfahan-dc-02` | ۲,۰۰۰ | ۸۰۰,۰۰۰ |
| `ir-khorasan-1` | کلاستر شمال شرق و شرق | خراسان رضوی، شمالی، جنوبی، کرمان، سیستان و بلوچستان | `mashhad-dc-01` | `mashhad-dc-02` | ۲,۲۰۰ | ۹۰۰,۰۰۰ |
| `ir-fars-1` | کلاستر جنوب و خلیج فارس | فارس، بوشهر، هرمزگان، کهگیلویه و بویراحمد | `shiraz-dc-01` | `shiraz-dc-02` | ۱,۸۰۰ | ۷۵۰,۰۰۰ |
| `ir-tabriz-1` | کلاستر شمال غرب و خزر | آذربایجان شرقی، غربی، اردبیل، زنجان، گیلان، مازندران، گلستان، قزوین | `tabriz-dc-01` | `tabriz-dc-02` | ۱,۸۰۰ | ۷۵۰,۰۰۰ |
| `ir-border-west-1` | کلاستر غرب و مرز مقاوم | خوزستان، کرمانشاه، ایلام، کردستان، همدان | `ahvaz-dc-01` | `kermanshah-dc-01` | ۱,۲۰۰ | ۵۰۰,۰۰۰ |
| `ir-rural-central-1` | کلاستر سراسری روستایی | مدارس روستایی و عشایری کل کشور | `tehran-dc-03` | `isfahan-dc-03` | ۸۰۰ | ۳۰۰,۰۰۰ |

---

## ۳. فرآیند تغییرات زیرساختی (National Change Request Invariant)

هیچ‌گونه تغییر در وزن ترافیک، وضعیت کلاستر یا سهمیه‌بندی منابع خارج از فرآیند Change Request مجاز نیست:

```json
{
  "change_type": "TRAFFIC_WEIGHT",
  "region_id": "ir-tehran-1",
  "target_weight": 50,
  "approved": true,
  "automated_decision": false,
  "automated_execution": false,
  "requires_human_approval": true
}
```

در صورت نقض هر یک از شروط حاکمیتی فوق، درخواست تغییر با خطای `PHASE5_NATIONAL_CHANGE_APPROVAL_REQUIRED` مسدود (Fail-Closed) می‌گردد.

---

## ۴. استانداردهای اخلاقی و منع رتبه‌بندی رقابتی (Zero-Ranking Guarantee)

بر مبنای مصوبات رسمی، سامانه پایش فاقد هرگونه فیلد مقایسه‌ای یا رتبه‌بندی بین‌مدرسه‌ای است. کلیه پایگاه‌های داده، کنترلرها و APIها با گارد اختصاصی مجهز به اسکن بازگشتی کلمات ممنوعه (`rank`, `ranking_score`, `league_table`, `best_school`, `worst_school`, `compare_school`, `top_school`) هستند و مشاهده هر یک بلافاصله خطای `ZERO_RANKING_VIOLATION` با کد وضعیت HTTP 400 تولید می‌کند.

---

## ۵. وب‌سرویس‌های عملیاتی زیرساخت ملی (RESTful APIs)

| متد | مسیر وب‌سرویس | سطح دسترسی | کارکرد |
|:---:|---|---|---|
| `GET` | `/api/v1/system/national/regions` | Admin, EduOffice, Manager | کنترل‌پلین کلاسترهای ۷‌گانه ملی و دیتاسنترها |
| `GET` | `/api/v1/system/national/capacity` | Admin, EduOffice, Manager | مدل کلان ظرفیت ملی، سهمیه‌ها و محدودیت‌ها |
| `GET` | `/api/v1/system/national/health` | Admin, EduOffice, Manager | تابلوی جامع رصدپذیری ملی و پایش شاخص‌های SLO |
| `GET` | `/api/v1/system/national/traffic` | Admin, EduOffice, Manager | وضعیت فابریک و نقشه توزیع ترافیک سراسری |
| `POST` | `/api/v1/system/national/change-request` | Superadmin, Admin | دروازه رسمی ثبت و اعمال تغییرات زیرساختی ملی |
