# سند جامع راهبرد بهینه‌سازی عملکرد پایگاه داده و زیرساخت (Database & Infrastructure Performance Optimization)
## سامانه پایش — معماری بهینه‌سازی در مقیاس ملی (۱۰ میلیون کاربر)

**سند مرجع:** `02_SCALE_ARCHITECTURE.docx` (بندهای ۸ تا ۱۵)  
**نسخه سند:** ۱.۰.۰  
**تاریخ تدوین:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت:** مصوب مهندسی پایگاه داده و زیرساخت (Database & Platform Engineering Specification)  

---

## ۱. استراتژی ایندکس‌های ترکیبی اصلی پایگاه داده (بند ۸)

در یک سامانه چندهسته‌ای (Multi-Tenant) مدرسه‌ای، تقریباً تمامی کوئری‌های OLTP با شناسه مدرسه (`school_id`) فیلتر می‌شوند. ایجاد ایندکس‌های ترکیبی (Composite Indexes) منطبق بر الگوی دسترسی کوئری‌ها، اسکن‌های سنگین جدول (Seq Scan) را به پیمایش‌های فوق‌سریع شاخه‌های ایندکس (Index Seek / B-Tree Scan) تبدیل می‌کند.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              ماتریس ایندکس‌های ترکیبی کلیدی پایگاه داده                                        │
├────────────────────────────────┬──────────────────────┬──────────────────────┬─────────────────────────────────┤
│ ایندکس ترکیبی (Index DDL)      │ جدول هدف             │ کوئری‌های تحت پوشش   │ تحلیل بهبود کارایی و هدف        │
├────────────────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ (school_id, id)                │ users, classes,      │ جستجوی مستقیم موجودیت│ جلوگیری از نشت داده بین مدارسی، │
│                                │ subjects, attendance │ در محدوده یک مدرسه   │ اعتبارسنجی سریع مالکیت رکورد    │
├────────────────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ (school_id, student_id)        │ enrollments, grades, │ پرونده تحصیلی، شهریه،│ واکشی کارنامه و سوابق دانش‌آموز │
│                                │ discipline, tuitions │ حضور و غیاب فردی     │ در زیر ۱ میلی‌ثانیه بدون اسکن   │
├────────────────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ (school_id, class_id, date)    │ attendance,          │ لیست حضور و غیاب کلاس│ لود فوری دفتر کلاسی روزانه دبیر │
│                                │ hw_submissions       │ در تاریخ مشخص        │ و جلوگیری از قفل جدول در صبحگاه │
├────────────────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ (school_id, teacher_id, date)  │ schedule, exam_duties│ برنامه روزانه دبیر،  │ نمایش بلادرنگ داشبورد دبیر و    │
│                                │ meeting_slots        │ مراقبت آزمون‌ها      │ تشخیص زنگ جاری (bell_now)       │
├────────────────────────────────┼──────────────────────┼──────────────────────┼─────────────────────────────────┤
│ (school_id, parent_id)         │ parent_links,        │ پنل اولیا، دسترسی    │ واکشی فوری لیست فرزندان ولی و   │
│                                │ parent_subscriptions │ به پرونده چندفرزندی  │ وضعیت اشتراک‌ها در یک درخواست   │
└────────────────────────────────┴──────────────────────┴──────────────────────┴─────────────────────────────────┘
```

### ۱.۱. دستورات ساخت ایندکس‌ها در PostgreSQL / SQLite (DDL Specifications)

```sql
-- ۱. ایندکس ترکیبی عمومی مدرسه و شناسه
CREATE INDEX CONCURRENTLY idx_users_school_id 
ON users (school_id, id) 
INCLUDE (role, national_id, full_name);

-- ۲. ایندکس پرونده تحصیلی دانش‌آموز
CREATE INDEX CONCURRENTLY idx_enrollments_school_student 
ON enrollments (school_id, student_id, status) 
INCLUDE (class_id);

CREATE INDEX CONCURRENTLY idx_grades_school_student 
ON grades (school_id, student_id, term_id) 
INCLUDE (subject_id, score, score_text);

-- ۳. ایندکس حضور و غیاب روزانه کلاسی
CREATE INDEX CONCURRENTLY idx_attendance_school_class_date 
ON attendance (school_id, class_id, date) 
INCLUDE (student_id, status, late_minutes);

-- ۴. ایندکس زمان‌بندی و برنامه دبیران
CREATE INDEX CONCURRENTLY idx_schedule_school_teacher_day 
ON schedule (school_id, teacher_id, day_of_week) 
INCLUDE (class_id, subject_id, period_num);

-- ۵. ایندکس پیوند اولیا و فرزندان
CREATE INDEX CONCURRENTLY idx_parent_links_school_parent 
ON parent_links (school_id, parent_id, student_id);
```

---

## ۲. تجمیع داده‌ها در سمت سرور برای داشبوردها (Server-Side Aggregations - بند ۹)

در معماری اولیه، کلاینت برای رسم نمودارهای داشبورد و آمارها، هزاران رکورد را واکشی و در مرورگر با حلقه‌های JS پیمایش می‌کرد. در مقیاس ملی، این محاسبات به **کوئری‌های تجمیعی پایگاه داده (Database Aggregation Pipelines)** یا **جداول رابطه‌ای دید ماتریسی (Materialized Views)** منتقل می‌شود.

```
                                  ┌────────────────────────────────┐
                                  │      داشبورد مدیر مدرسه        │
                                  └───────────────┬────────────────┘
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 │ روش قدیمی (ارسال کل داده‌ها): واکشی ۱۵,۰۰۰ رکورد (۸ مگابایت)      │
                 │ روش جدید (کوئری تجمیعی سرور): واکشی ۱ ردیف خلاصه (۲۰۰ بایت)     │
                 ▼                                                                 ▼
       ┌───────────────────┐                                             ┌───────────────────┐
       │   Client Laggy    │                                             │   Instant Render  │
       │  Processing 1.8s  │                                             │   Response < 12ms │
       └───────────────────┘                                             └───────────────────┘
```

### ۲.۱. نمونه کوئری‌های تجمیعی سرور (Optimized SQL Aggregations)

#### الف) آمار حضور و غیاب امروز مدرسه:
```sql
-- محاسبه اتمیک آمار حضور امروز کل مدرسه در یک رفت‌وبرگشت دیتابیس
SELECT 
    COUNT(*) AS total_records,
    COUNT(CASE WHEN status = 'present' THEN 1 END) AS present_count,
    COUNT(CASE WHEN status = 'absent' AND is_excused = FALSE THEN 1 END) AS unexcused_absent_count,
    COUNT(CASE WHEN status = 'absent' AND is_excused = TRUE THEN 1 END) AS excused_absent_count,
    COUNT(CASE WHEN status = 'late' THEN 1 END) AS late_count,
    COALESCE(SUM(late_minutes), 0) AS total_late_minutes
FROM attendance
WHERE school_id = :school_id 
  AND date = CURRENT_DATE;
```

#### ب) میانگین نمرات و توزیع آماری بر حسب درس و پایه:
```sql
SELECT 
    sub.id AS subject_id,
    sub.name AS subject_name,
    c.grade_level,
    ROUND(AVG(g.score), 2) AS average_score,
    MIN(g.score) AS min_score,
    MAX(g.score) AS max_score,
    COUNT(CASE WHEN g.score < 10 THEN 1 END) AS failed_count,
    COUNT(CASE WHEN g.score >= 17 THEN 1 END) AS excellent_count
FROM grades g
JOIN subjects sub ON sub.id = g.subject_id
JOIN enrollments e ON e.student_id = g.student_id
JOIN classes c ON c.id = e.class_id
WHERE g.school_id = :school_id 
  AND g.term_id = :current_term_id
GROUP BY sub.id, sub.name, c.grade_level;
```

#### ج) شناسایی خودکار دانش‌آموزان در معرض افت یا ترک تحصیل (At-Risk Early Warning):
```sql
SELECT 
    s.id AS student_id,
    s.full_name,
    COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS total_absences,
    ROUND(AVG(g.score), 2) AS current_gpa
FROM users s
JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
LEFT JOIN attendance a ON a.student_id = s.id AND a.date >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN grades g ON g.student_id = s.id
WHERE e.school_id = :school_id
GROUP BY s.id, s.full_name
HAVING COUNT(CASE WHEN a.status = 'absent' THEN 1 END) >= 5 
    OR AVG(g.score) < 12.0
ORDER BY total_absences DESC, current_gpa ASC;
```

---

## ۳. مدیریت استخر اتصالات، زمان‌بندی و Circuit Breaker (بندهای ۱۰ و ۱۱)

### ۳.۱. تنظیمات استخر اتصالات دیتابیس (Connection Pool Sizing)
فرمول تجربی استاندارد PostgreSQL برای تعیین سقف اتصالات پایگاه داده:
$$\text{Pool Size} = ((\text{Core Count} \times 2) + \text{Effective Spindle Count})$$

```javascript
/* تنظیمات استخر اتصال در server/db.js */
const poolConfig = {
  min: 5,                       // حداقل اتصالات آماده
  max: 25,                      // حداکثر اتصالات به ازای هر نمونه سرور Node.js
  acquireTimeoutMillis: 3000,   // سقف انتظار برای دریافت اتصال از استخر
  createTimeoutMillis: 2000,    // سقف انتظار ایجاد اتصال جدید
  idleTimeoutMillis: 10000,     // زمان آزاد کردن اتصالات بلااستفاده
  reapIntervalMillis: 1000,
  statement_timeout: 2500,      // سقف زمان اجرای هر کوئری OLTP (2.5 ثانیه)
  query_timeout: 3000           // قطع اتصال در صورت فریز شدن کوئری
};
```

---

### ۳.۲. کلید قطع خودکار برای وب‌سرویس‌های خارجی (Circuit Breaker)

وب‌سرویس‌های پیامک و استعلام شاهکار ممکن است دچار کندی شوند. الگوی Circuit Breaker از مسدود شدن اتصالات سرور جلوگیری می‌کند:

```
[درخواست کلاینت] ──► [Circuit Breaker (Closed)] ──► [وب‌سرویس پیامک / استعلام]
                            │ (در صورت بروز ۵ خطای متوالی)
                            ▼
                     [حالت Open: قطع تماس به مدت ۳۰ ثانیه]
                            │
                            ▼
                     [پاسخ فوری با صف محلی و پیامک در انتظار]
```

```javascript
class ExternalServiceCircuitBreaker {
  constructor(name, failureThreshold = 5, cooldownMs = 30000) {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttempt = 0;
  }

  async execute(asyncCall, fallbackFn) {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now < this.nextAttempt) return fallbackFn();
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await asyncCall();
      this.reset();
      return result;
    } catch (err) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttempt = now + this.cooldownMs;
        console.warn(`⚠️ Circuit Breaker [${this.name}] OPENED! Failing over to fallback.`);
      }
      return fallbackFn();
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
  }
}
```

---

## ۴. کنترل نرخ دو لایه (Two-Tier Rate Limiting - بند ۱۲)

برای حفاظت در برابر حملات DDoS و مصرف نامتعارف منابع:

```
[کاربران و مهاجمان] 
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ لایه اول: Nginx / Gateway (IP-Based Protection)        │
│ • سقف سخت: حداکثر ۵۰ درخواست در ثانیه به ازای هر IP    │
│ • مهار حملات Flooding و اسکنرهای امنیتی                │
└────────────────────────┬───────────────────────────────┘
                         │ (درخواست‌های معتبر)
                         ▼
┌────────────────────────────────────────────────────────┐
│ لایه دوم: Application / Redis (User-Based Protection)  │
│ • سقف مبتنی بر نقش کاربر (Role-Based Tokens)           │
│ • پنجره‌های لغزان مجزا برای OTP، لاگین و Sync         │
└────────────────────────────────────────────────────────┘
```

```nginx
# نمونه تنظیمات لایه ۱ در Nginx Gateway
http {
    limit_req_zone $binary_remote_addr zone=ip_gateway_limit:20m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;

    server {
        location /api/auth/ {
            limit_req zone=auth_limit burst=10 nodelay;
            proxy_pass http://payesh_cluster;
        }

        location /api/ {
            limit_req zone=ip_gateway_limit burst=50 nodelay;
            proxy_pass http://payesh_cluster;
        }
    }
}
```

---

## ۵. فشرده‌سازی بسته‌ها و صفحه‌بندی مبتنی بر نشانگر (Payload Compression & Keyset Pagination - بند ۱۳)

### ۵.۱. فشرده‌سازی پویای Brotli و Gzip
* **پروتکل Brotli (`br`):** فشرده‌سازی بسته‌های JSON تا ۸۵٪ کاهش حجم در مقایسه با متن خام (کاهش بسته ۲.۵ مگابایتی به کمتر از ۳۵۰ کیلوبایت).
* **پروتکل Gzip:** فال‌بک برای مرورگرهای قدیمی‌تر.

```nginx
# تنظیمات فشرده‌سازی Nginx
gzip on;
gzip_types application/json text/css application/javascript text/xml;
gzip_min_length 1024;
gzip_comp_level 6;

brotli on;
brotli_types application/json text/css application/javascript text/xml;
brotli_comp_level 4; # بهینه برای فشرده‌سازی بلادرنگ پویا
```

---

### ۵.۲. صفحه‌بندی مبتنی بر نشانگر (Cursor-Based / Keyset Pagination)
استفاده از `OFFSET` در جداول میلیونی موجب افت شدید سرعت می‌شود ($O(N)$). الگوی Keyset Pagination از ایندکس ترتیبی ULID استفاده کرده و سرعت اجرای ثابت $O(1)$ را تضمین می‌کند:

```
GET /api/students?limit=50&cursor=01AN4Z07BY79KA1307SR9X4MV3
```

```sql
-- کوئری صفحه‌بندی با سرعت ثابت مستقل از شماره صفحه
SELECT id, full_name, national_id, role
FROM users
WHERE school_id = :school_id 
  AND role = 'student'
  AND id > :cursor_ulid  -- ایندکس مستقیماً به رکورد بعدی پرش می‌کند
ORDER BY id ASC
LIMIT 50;
```

---

## ۶. شبکه توزیع محتوا برای دارایی‌های ایستا (Edge CDN Caching - بند ۱۴)

فایل توزیعی تک‌فایلی `index.html` (شامل فونت‌های Base64 و کدهای کلاینت)، فایل‌های استایل و تصاویر در لبه‌های شبکه توزیع محتوا (ArvanCloud / Cloudflare CDN) کش می‌شوند:

```
┌───────────────────────────────┬─────────────────────────────┬──────────────────────────────────────────┐
│ مسیر منبع                     │ هدر Cache-Control           │ رفتار و استراتژی ابطال                   │
├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────┤
│ /index.html                   │ no-cache, must-revalidate   │ بررسی ETag در لبه؛ ابطال آنی پس از Build │
├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────┤
│ /assets/* (فونت‌ها، تصاویر)   │ public, max-age=31536000    │ کش دائمی یک‌ساله با هش نسخه در نام فایل  │
├───────────────────────────────┼─────────────────────────────┼──────────────────────────────────────────┤
│ /api/* (مسیرهای پویا)         │ no-store, private           │ هرگز در CDN کش نمی‌شوند                 │
└───────────────────────────────┴─────────────────────────────┴──────────────────────────────────────────┘
```

* **ابطال خودکار کش در پایپ‌لاین CI/CD:**
  ```bash
  # اسکریپت Purge CDN در انتهای npm run build
  curl -X POST "https://napi.arvancloud.ir/cdn/4.0/domains/payesh.ir/caching/purge" \
       -H "Authorization: $ARVAN_API_KEY" \
       -d '{"urls": ["https://payesh.ir/index.html", "https://payesh.ir/"]}'
  ```

---

## ۷. نقاط پایانی ارزیابی سلامت و آمادگی (Health, Readiness & Liveness Endpoints - بند ۱۵)

برای استقرار و مدیریت چرخه حیات کانتینرها در Kubernetes / Docker Swarm:

```
[Kubernetes Kubelet]
     │
     ├─► GET /api/liveness   ──► [بررسی عدم قفل‌شدگی Event Loop و حافظه] ──► (در صورت ۵۰۰: ریست کانتینر)
     │
     └─► GET /api/readiness  ──► [بررسی اتصال دیتابیس، Redis و گرم بودن کش] ──► (در صورت ۵۰۳: خروج از چرخه ترافیک)
```

```javascript
/* پیاده‌سازی اندپوینت‌های سلامت در server/health.js */
async function handleHealthEndpoints(req, res, db, redis, s3) {
  const p = req.url;

  // ۱. Liveness Probe: فرآیند زنده است و حلقه رویداد فریز نشده است
  if (p === '/api/liveness') {
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 1.8 * 1024 * 1024 * 1024) { // بیش از ۱.۸ گیگابایت
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'DEAD', reason: 'OOM_RISK' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ALIVE', uptime: process.uptime() }));
  }

  // ۲. Readiness Probe: سامانه آماده پذیرش ترافیک کاربران است
  if (p === '/api/readiness') {
    try {
      const dbOk = await db.ping();
      const redisOk = await redis.ping() === 'PONG';
      
      if (!dbOk || !redisOk) throw new Error('Subsystem disconnected');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'READY', db: true, redis: true }));
    } catch (err) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'NOT_READY', error: err.message }));
    }
  }

  // ۳. General Health: گزارش مدیریتی وضعیت سرویس
  if (p === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'HEALTHY',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
  }
}
```

---

## ۸. جمع‌بندی شاخص‌های بهینه‌سازی پایگاه داده و زیرساخت

| محور بهینه‌سازی | قبل از بهینه‌سازی | پس از اعمال استراتژی جدید |
|---|---|---|
| **نوع ایندکس‌گذاری** | تک‌فیلدی روی ID | ایندکس‌های ترکیبی پوششی چندسطحی (Composite) |
| **محاسبات داشبورد** | واکشی ۱۵,۰۰۰ رکورد در کلاینت | محاسبات اتمیک در سرور (ارسال کمتر از ۱ کیلوبایت) |
| **سقف ظرفیت اتصالات** | اتصالات بدون سقف و ناپایدار | Connection Pooling با استخر ۲۵تایی و Timeout امن |
| **فیلترینگ و ریت‌لیمیتر** | فقط در لایه کدهای Node.js | دولایه: Nginx در دروازه + Redis در اپلیکیشن |
| **صفحه‌بندی جداول** | `OFFSET` کند در مقیاس بالا | `Cursor-Based` بر مبنای ایندکس ULID در $O(1)$ |
| **پایداری کانتینرها** | بدون پروب‌های نظارتی | مانیتورینگ بلادرنگ با Readiness و Liveness |
