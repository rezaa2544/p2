# راهنمای جامع اسکریپت‌های آزمون بار و پایداری k6 (فاز ۵)
## سامانه پایش — سامانه هوشمند مدیریت مدرسه

**سند مرجع مهندسی:** `docs/PERFORMANCE_TESTING_PLAN.md` و `03_IMPLEMENTATION_ROADMAP.docx` (فاز ۵ — بندهای ۱ تا ۸)  
**ابزار بنچ‌مارک:** [k6 by Grafana](https://k6.io/)  
**نسخه:** ۱.۰.۰  

---

## ۱. ساختار دایرکتوری و سازمان‌دهی فایل‌ها

کلیه اسکریپت‌های تست کارایی و بنچ‌مارک در ساختار استاندارد زیر پیاده‌سازی شده‌اند:

```
tests/performance/
├── config/
│   ├── environments.json       # آدرس‌های سرور محلی، پیش‌تولید (Staging) و کلاستر تست
│   └── thresholds.json         # اهداف کیفی و آستانه‌های رسمی SLO (p95, p99, Error Rate)
├── helpers/
│   ├── auth-helper.js          # ورود خودکار با OTP، استخراج کوکی نشست و تولید هدرهای JWT
│   ├── payload-generator.js    # تولید رکوردهای تصادفی و واقع‌گرایانه حضور، نمرات، و جهش‌های آفلاین
│   └── metrics.js              # سنجه‌های کاستوم k6 (Trends, Rates, Counters, Gauges)
├── scenarios/
│   ├── 01-login.js             # سناریوی ورود انبوه هم‌زمان با OTP و کد ملی
│   ├── 02-bootstrap.js         # سناریوی واکشی داده‌های اولیه کلاینت (Scoped Bootstrap API)
│   ├── 03-attendance.js        # سناریوی ثبت حضور و غیاب صبحگاهی در ساعت ۸:۰۰
│   ├── 04-grades.js            # سناریوی ثبت نمرات و اعتبارسنجی همزمانی (Optimistic Concurrency)
│   ├── 05-notifications.js     # سناریوی صف پیام‌ها و ارسال گروهی اعلان‌ها
│   └── 06-sync-batch.js        # سناریوی همگام‌سازی دسته‌های آفلاین تا ۵۰۰ عملیات اتمیک
├── suites/
│   ├── saturation-test.js      # آزمون اشباع و شناسایی نقطه شکست پایگاه داده (Knee Point)
│   ├── chaos-redis-test.js     # آزمون تاب‌آوری در زمان قطع ناگهانی کلاستر Redis
│   ├── soak-24h-test.js        # آزمون پایداری و استقامت طولانی‌مدت (۲۴ ساعته)
│   └── spike-mehr-test.js      # آزمون ضربه ترافیکی ۱۰ برابری اول مهرماه (Mehr 1st 10x Spike)
├── run-benchmarks.sh           # اسکریپت هماهنگ‌کننده و اجرای خط فرمانی خودکار
└── README.md                   # مستند حاضر
```

---

## ۲. پیش‌نیازها و نصب ابزار k6

برای اجرای اسکریپت‌ها، ابزار **k6** باید روی سیستم نصب باشد:

### نصب از طریق توزیع‌های لینوکس (Debian/Ubuntu/Tarball):
```bash
# دانلود مستقیم باینری رسمی
curl -sL https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-linux-amd64.tar.gz -o /tmp/k6.tar.gz
tar -xzf /tmp/k6.tar.gz -C /tmp/
sudo mv /tmp/k6-v0.54.0-linux-amd64/k6 /usr/local/bin/k6

# بررسی صحت نصب
k6 version
```

---

## ۳. نحوه اجرای آزمون‌ها (دستورات سریع)

فایل اجرایی `run-benchmarks.sh` برای مدیریت کامل محیط، آغاز سرور آزمون محلی در صورت نیاز و اجرای سناریوها طراحی شده است:

### ۳.۱. اجرای سناریوهای تکی و دسته‌جمعی:
```bash
# اجرای سناریوی ورود (01-login)
./run-benchmarks.sh --scenario 01-login

# اجرای سناریوی بوت‌استرپ
./run-benchmarks.sh --scenario 02-bootstrap

# اجرای سناریوی حضور و غیاب
./run-benchmarks.sh --scenario 03-attendance

# اجرای سناریوی ثبت نمرات
./run-benchmarks.sh --scenario 04-grades

# اجرای سناریوی اعلان‌ها
./run-benchmarks.sh --scenario 05-notifications

# اجرای سناریوی همگام‌سازی دسته‌ای
./run-benchmarks.sh --scenario 06-sync-batch

# اجرای تمام ۶ سناریو پشت سر هم
./run-benchmarks.sh --scenario all
```

---

### ۳.۲. اجرای سوئیت‌های جامع ارزیابی پایداری و بحران:
```bash
# ۱. آزمون اشباع دیتابیس (Database Saturation & Breaking Point)
./run-benchmarks.sh --suite saturation

# ۲. آزمون تاب‌آوری در زمان قطعی Redis (Graceful Degradation)
./run-benchmarks.sh --suite chaos-redis

# ۳. آزمون ضربه ترافیکی اول مهر (Mehr 1st 10x Spike)
./run-benchmarks.sh --suite spike-mehr

# ۴. آزمون استقامت ۲۴ ساعته (24-Hour Soak Test)
./run-benchmarks.sh --suite soak-24h --duration 24h

# ۵. اجرای تمامی سوئیت‌های تست (تست سریع تمام سناریوهای بحران)
./run-benchmarks.sh --suite all
```

---

### ۳.۳. انتخاب محیط هدف و تغییر پارامترها:
```bash
# اجرا بر روی محیط Staging
./run-benchmarks.sh --scenario 02-bootstrap --env staging

# اجرا با تعداد ۵۰ کاربر همزمان (VU) به مدت ۲ دقیقه
./run-benchmarks.sh --scenario 03-attendance --vus 50 --duration 2m

# اجرا روی کلاستر هدف دلخواه
./run-benchmarks.sh --scenario all --base-url http://192.168.1.100:3000
```

---

## ۴. شرح سناریوهای اصلی و اهداف کیفی (SLO Targets)

| سناریو | فایل اجرایی | عملیات تحت آزمون | هدف آستانه p95 | سقف مجاز خطا |
| :--- | :--- | :--- | :--- | :--- |
| **ورود (OTP Login)** | `scenarios/01-login.js` | ارسال کد OTP + تایید شماره و کد ملی | کمتر از ۱۵۰ ms | < ۱٪ |
| **بوت‌استرپ کلاینت** | `scenarios/02-bootstrap.js` | واکشی داده‌های اول دوره با دامنه تفکیک‌شده نقش | کمتر از ۱۸۰ ms | < ۰.۵٪ |
| **حضور و غیاب** | `scenarios/03-attendance.js` | ثبت اتمیک وضعیت کلاس‌ها در ساعت ۸:۰۰ صبح | کمتر از ۲۵۰ ms | < ۱٪ |
| **ثبت نمرات** | `scenarios/04-grades.js` | ثبت و ویرایش نمرات همراه با قفل نسخه‌ای | کمتر از ۲۰۰ ms | < ۱٪ |
| **اعلان و پیامک** | `scenarios/05-notifications.js` | صف‌بندی پیامک‌ها و دریافت وضعیت خوانده‌نشده | کمتر از ۳۰۰ ms | < ۱٪ |
| **همگام‌سازی آفلاین** | `scenarios/06-sync-batch.js` | تخلیه بسته‌های ۵ تا ۵۰۰ عملیاتی صف PWA | کمتر از ۵۰۰ ms | < ۱٪ |

---

## ۵. شرح سوئیت‌های آزمون بار و سناریوهای بحران

### ۵.۱. سوئیت اشباع دیتابیس (`suites/saturation-test.js`):
- افزایش تدریجی کاربران فعال هم‌زمان (Ramping VUs) از ۲۵ تا ۲۰۰+ کاربر.
- اندازه‌گیری دقیق تاخیر کوئری‌ها، قفل‌های ردیفی و زمان پاسخ تا رسیدن دیتابیس به نقطه اشباع (Knee Point).

### ۵.۲. سوئیت آزمون آشوب Redis (`suites/chaos-redis-test.js`):
- شبیه‌سازی قطعی یا تاخیر شبکه ردیس.
- سنجش مکانیزم مدارشکن (Circuit Breaker) و برگشت خودکار به L1 In-Memory Cache.
- تایید اعتبار بدون وقفه توکن‌های رمزنگاری‌شده JWT بدون رخداد حتی یک خطای 500.

### ۵.۳. سوئیت آزمون ضربه اول مهر (`suites/spike-mehr-test.js`):
- شبیه‌سازی هجوم ناگهانی ۲۵۰,۰۰۰ کاربر در روز بازگشایی مدارس در کمتر از ۱۲۰ ثانیه.
- ارزیابی توان پاسخ‌دهی سرور زیر ضربه ترافیکی بدون افزایش نرخ خطا به بالای ۰.۱٪.

### ۵.۴. سوئیت استقامت ۲۴ ساعته (`suites/soak-24h-test.js`):
- اعمال بار مداوم و یکنواخت به مدت ۲۴ ساعت کامل.
- رصد شیب مصرف حافظه V8 Heap، مهار نشت سوکت‌ها و اتصالات معلق دیتابیس.
