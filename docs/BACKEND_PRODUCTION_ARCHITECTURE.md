# سند جامع معماری لایه تولیدی سرور (Backend Production Architecture)
## سامانه پایش — طراحی زیرساخت مدرن RESTful، پایگاه‌داده PostgreSQL و سرویس‌های توزیع‌شده

**سند مرجع:** `03_IMPLEMENTATION_ROADMAP.docx` (فاز ۳ — بندهای ۱ تا ۹)  
**نسخه سند:** ۱.۰.۰  
**تاریخ تدوین:** ۱۸ شهریور ۱۴۰۵ (2026-09-08)  
**وضعیت:** مصوب معماری سرور (Backend Architecture Specification)  

---

## ۱. معماری و نقاط پایانی منبع‌محور (Resource-Based RESTful APIs - بند ۱)

در فاز تولیدی و پس از مهاجرت از فایل JSON به پایگاه‌داده رابطه‌ای PostgreSQL، ارتباط کلاینت-سرور از الگوی RPC/Sync یکپارچه به **معماری استاندارد RESTful مبتنی بر منبع (Resource-Oriented)** ارتقا می‌یابد.

```
┌────────────────────────────────────────────────────────────────────────┐
│             الگوی استاندارد نگاشت منابع در API سرور پایش              │
├────────┬───────────────────────────────┬───────────────────────────────┤
│ متد    │ الگوی مسیر (Endpoint Pattern) │ شرح عملیات                    │
├────────┼───────────────────────────────┼───────────────────────────────┤
│ GET    │ /api/v1/:resource             │ واکشی لیست با صفحه‌بندی و فیلتر│
├────────┼───────────────────────────────┼───────────────────────────────┤
│ GET    │ /api/v1/:resource/:id         │ واکشی تکی یک رکورد با پروجکشن │
├────────┼───────────────────────────────┼───────────────────────────────┤
│ POST   │ /api/v1/:resource             │ ایجاد رکورد جدید (با Idempotency)│
├────────┼───────────────────────────────┼───────────────────────────────┤
│ PATCH  │ /api/v1/:resource/:id         │ ویرایش فیلدهای مجاز (با نسخه)  │
├────────┼───────────────────────────────┼───────────────────────────────┤
│ DELETE │ /api/v1/:resource/:id         │ حذف نرم (Soft Delete) یا دائم │
├────────┼───────────────────────────────┼───────────────────────────────┤
│ POST   │ /api/v1/sync/batch            │ همگام‌سازی دسته‌ای آفلاین موبایل│
└────────┴───────────────────────────────┴───────────────────────────────┘
```

### ۱.۱. جدول نگاشت مجموعه‌های داده پایش به مسیرهای RESTful

```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────────────────┐
│ مجموعه داده (Collection)     │ مسیر منبع در API             │ دسترسی‌های مجاز (RBAC)                  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ users / students / teachers  │ /api/v1/users                │ superadmin, manager, edu_office          │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ classes                      │ /api/v1/classes              │ superadmin, manager, teacher (read)      │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ subjects / curriculum        │ /api/v1/subjects             │ تمام نقش‌ها (Read-Only)                  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ attendance                   │ /api/v1/attendance           │ manager, teacher (class scope)           │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ grades / exams               │ /api/v1/grades               │ manager, teacher (subject scope)         │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ discipline                   │ /api/v1/discipline           │ manager, teacher (view: parent/student)  │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ tuitions / installments      │ /api/v1/tuitions             │ manager, parent (own kids), superadmin   │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ leaves                       │ /api/v1/leaves               │ parent (request), manager (approve)      │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ homework / submissions       │ /api/v1/homework             │ teacher (create), student (submit)       │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ schedule / bell_schedules    │ /api/v1/schedules            │ manager (manage), all roles (read)       │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ announcements / notifications│ /api/v1/announcements        │ manager, superadmin (create), all (read) │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────────────────┤
│ sync_conflicts               │ /api/v1/sync/conflicts       │ manager (own school), superadmin         │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────────────────┘
```

---

## ۲. نقطه پایانی واکشی داده‌های اولیه بر مبنای محدوده (`/api/v1/bootstrap` Scoped - بند ۲)

در هنگام نخستین ورود یا باز شدن اپلیکیشن، کلاینت درخواست اولیه خود را به `/api/v1/bootstrap` ارسال می‌کند. سرور بر اساس نقش کاربر (`session.role`) و شناسه مدرسه (`session.school_id`) صرفاً داده‌های مجاز را در یک بسته فشرده و سبک بازمی‌گرداند.

```
                               ┌────────────────────────────────┐
                               │     GET /api/v1/bootstrap      │
                               └───────────────┬────────────────┘
                                               │
                 ┌─────────────────────────────┼─────────────────────────────┐
                 │ (بررسی نقش کاربر)           │                             │
                 ▼                             ▼                             ▼
       ┌───────────────────┐         ┌───────────────────┐         ┌───────────────────┐
       │   نقش مدیر مدرسه  │         │     نقش دبیر      │         │ نقش دانش‌آموز/ولی │
       │     (Manager)     │         │     (Teacher)     │         │ (Student/Parent)  │
       ├───────────────────┤         ├───────────────────┤         ├───────────────────┤
       │ • چارت کل کلاس‌ها │         │ • کلاس‌های منتسب  │         │ • پرونده تحصیلی   │
       │ • لیست کل دبیران  │         │ • دانش‌آموزان کلاس│         │ • برنامه کلاسی خود│
       │ • کاتالوگ دروس    │         │ • برنامه هفتگی خود│         │ • تکالیف فعال     │
       │ • زنگ‌های مدرسه   │         │ • زنگ جاری مدرسه  │         │ • وضعیت شهریه فرد │
       │ (حجم: ~۱۵۰ کیلوبایت)│       │ (حجم: ~۳۵ کیلوبایت)│       │ (حجم: ~۱۲ کیلوبایت)│
       └───────────────────┘         └───────────────────┘         └───────────────────┘
```

### ۲.۱. نمونه ساختار پاسخ Bootstrap برای نقش دبیر:

```json
{
  "ok": true,
  "server_time": "2026-09-08T10:00:00.000Z",
  "user": { "id": "01AN4Z07BY79KA1307SR9X4MV3", "full_name": "سارا احمدی", "role": "teacher" },
  "school": { "id": "01AN4Z07C011AA223344556677", "name": "دبیرستان علامه حلی ۱", "is_virtual": false },
  "classes": [
    { "id": "CLS_101", "name": "دهم ریاضی الف", "grade": 10, "is_homeroom": true }
  ],
  "schedule": [
    { "class_id": "CLS_101", "subject_id": "SUB_MATH", "day_of_week": 0, "period": 1 }
  ],
  "bell_schedule": { "periods": [{ "period": 1, "start": "07:45", "end": "09:15" }] },
  "unread_notifications": 2
}
```

---

## ۳. صفحه‌بندی مبتنی بر نشانگر (Cursor-Based / Keyset Pagination - بند ۳)

برای تمام لیست‌های حجیم، صفحه‌بندی سنتی `OFFSET/LIMIT` به دلیل افت کارایی در صفحات بالا منسوخ‌شده و از **Keyset Pagination بر مبنای ULID** استفاده می‌شود:

### ۳.۱. قرارداد ورودی و خروجی API:
```http
GET /api/v1/students?limit=50&cursor=01AN4Z07BY79KA1307SR9X4MV3&direction=next HTTP/1.1
Host: api.payesh.ir
Authorization: Bearer <JWT>
```

```json
{
  "ok": true,
  "data": [
    { "id": "01AN4Z07BY79KA1307SR9X4MV4", "full_name": "امیرحسین رضایی", "national_id_masked": "001***5678" }
  ],
  "pagination": {
    "limit": 50,
    "has_more": true,
    "next_cursor": "01AN4Z07BY79KA1307SR9X4MZZ",
    "prev_cursor": "01AN4Z07BY79KA1307SR9X4MV4"
  }
}
```

---

## ۴. پروجکشن فیلدها در سمت سرور بر اساس نقش (Role-Based Projections - بند ۴)

برای حفظ محرمانگی حریم خصوصی و کاهش ۶۰ درصدی پهنای باند مصرفی، سرور فیلدهای خروجی را پیش از ارسال فیلتر می‌کند:

```
┌────────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ نقش درخواست‌کننده      │ فیلدهای قابل مشاهده در پروفایل دانش‌آموز (User Projection)            │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ مدیر مدرسه (Manager)   │ تمام فیلدها: id, full_name, national_id, phone, address, tuition, IEP  │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ دبیر (Teacher)         │ فیلدهای آموزشی: id, full_name, avatar, grades, attendance, iep_notes   │
│                        │ (تلفن، آدرس، کد ملی و سوابق مالی کاملاً حذف می‌شوند)                  │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ دانش‌آموز/هم‌کلاسی     │ فیلدهای عمومی: id, full_name, avatar                                   │
├────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ ولی (Parent)           │ تمام فیلدها منحصراً برای فرزندان خود؛ صفر برای سایر دانش‌آموزان        │
└────────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

```javascript
/* پیاده‌سازی پروجکشن امن در لایه Service سرور */
function projectUserByRole(userRecord, requesterRole, isSelfOrOwnChild) {
  if (requesterRole === 'superadmin' || requesterRole === 'manager' || isSelfOrOwnChild) {
    return userRecord; // دسترسی کامل
  }

  if (requesterRole === 'teacher') {
    const { id, full_name, avatar, iep_notes, active } = userRecord;
    return { id, full_name, avatar, iep_notes, active };
  }

  // سایر نقش‌ها (دانش‌آموز/هم‌کلاسی)
  return { id: userRecord.id, full_name: userRecord.full_name, avatar: userRecord.avatar };
}
```

---

## ۵. یکپارچه‌سازی با کلاستر Redis (Redis Integration - بند ۵)

مطابق سند `MULTI_INSTANCE_READINESS.md`، کلیه نمونه‌های سرور به کلاستر مشترک Redis متصل می‌شوند:

```javascript
/* server/redis.js — کلاینت استاندارد ioredis با اتصال به کلاستر */
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

redis.on('connect', () => console.log('✅ اتصال به کلاستر Redis برقرار شد.'));
redis.on('error', (err) => console.error('❌ خطای Redis:', err));

module.exports = redis;
```

---

## ۶. صف پردازش ناهمگام و صف پیام‌های مرده (Worker Queue & DLQ Architecture - بند ۶)

برای تضمین زمان پاسخگویی زیر ۵۰ میلی‌ثانیه در درخواست‌های کاربران، تمامی فرآیندهای سنگین یا وابسته به شبکه از مسیر اصلی درخواست خارج‌شده و به صف کارهای پس‌زمینه (BullMQ / Redis Streams) منتقل می‌شوند:

```
[درخواست کلاینت] ──► [API Server] ──(افزودن به صف Job)──► [Redis Streams Queue]
                            │                                     │
                            ▼ (پاسخ فوری 202 Accepted)            ▼
                     [کلاینت آزاد شد]                    [Worker Process]
                                                                  │
                                            ┌─────────────────────┴─────────────────────┐
                                            ▼                                           ▼
                                    [انجام موفق Job]                         [شکست بیش از ۵ بار]
                                  (ارسال SMS / گزارش)                                   │
                                                                                        ▼
                                                                             [Dead-Letter Queue (DLQ)]
                                                                                        │
                                                                                        ▼
                                                                             [ارسال هشدار به ادمین]
```

```javascript
/* server/workers/sms-worker.js — ورکر ناهمگام پیامک با پس‌روی نمایی */
const { Worker, Queue } = require('bullmq');
const redis = require('../redis');

const smsQueue = new Queue('sms_notifications', { connection: redis });
const dlqQueue = new Queue('sms_dead_letter_queue', { connection: redis });

const smsWorker = new Worker('sms_notifications', async (job) => {
  const { phone, template, params } = job.data;
  const gatewayResult = await sendSmsViaGateway(phone, template, params);
  
  if (!gatewayResult.ok) {
    throw new Error(`SMS Gateway Error: ${gatewayResult.code}`);
  }
  return gatewayResult;
}, {
  connection: redis,
  concurrency: 20, // پردازش همزمان ۲۰ پیامک به ازای هر ورکر
  limiter: { max: 100, duration: 1000 } // حداکثر ۱۰۰ پیامک در ثانیه
});

smsWorker.on('failed', async (job, err) => {
  console.warn(`⚠️ ارسال پیامک به ${job.data.phone} شکست خورد (تلاش ${job.attemptsMade})`);
  if (job.attemptsMade >= 5) {
    // انتقال به Dead-Letter Queue
    await dlqQueue.add('dead_sms', { ...job.data, failed_reason: err.message, failed_at: new Date() });
  }
});
```

---

## ۷. یکپارچه‌سازی با فضای ابری اشیاء (Object Storage Integration - S3 / ArvanCloud - بند ۷)

آپلود فایل‌های چندرسانه‌ای (عکس، تکالیف، پشتیبان‌ها) با الگوی **Presigned URL** و مستقیماً بین مرورگر کاربر و باکت S3 انجام می‌شود:

```javascript
/* server/services/storage.js — تولید بلیط آپلود مستقیم */
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: 'default',
  endpoint: process.env.S3_ENDPOINT || 'https://s3.ir-tbz-sh1.arvanstorage.ir',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  }
});

async function createUploadTicket(schoolId, userId, fileType, ext) {
  const fileKey = `schools/${schoolId}/users/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  
  const command = new PutObjectCommand({
    Bucket: 'payesh-media-attachments',
    Key: fileKey,
    ContentType: fileType,
    Metadata: { school_id: String(schoolId), uploaded_by: String(userId) }
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // اعتبار ۵ دقیقه
  return { upload_url: presignedUrl, file_key: fileKey };
}
```

---

## ۸. تضمین یکتایی پردازش (Idempotency Engine - بند ۸)

کلیه درخواست‌های تغییر وضعیت (`POST`, `PATCH`, `DELETE`) ملزم به ارسال هدر `X-Idempotency-Key` یا شناسه `uid` درون بدنه هستند:

```javascript
/* Middleware تضمین پردازش یکباره در Express / Node.js */
async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['x-idempotency-key'] || (req.body && req.body.uid);
  if (!key) return next();

  const redisKey = `payesh:idempotency:${key}`;
  // دریافت قفل اتمیک برای ۲۴ ساعت
  const acquired = await redis.set(redisKey, 'PROCESSING', 'EX', 86400, 'NX');

  if (!acquired) {
    // این عملیات قبلاً پردازش‌شده یا در حال پردازش است
    const cachedResponse = await redis.get(`${redisKey}:response`);
    if (cachedResponse) {
      const { status, body } = JSON.parse(cachedResponse);
      return res.status(status).json(body);
    }
    return res.status(409).json({ ok: false, code: 'concurrent_mutation_in_progress' });
  }

  // ثبت پاسخ پس از اتمام درخواست
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    redis.set(`${redisKey}:response`, JSON.stringify({ status: res.statusCode, body }), 'EX', 86400);
    return originalJson(body);
  };

  next();
}
```

---

## ۹. مدیریت نسخه‌گذاری و کنترل هم‌زمانی خوش‌بینانه (Optimistic Concurrency - بند ۹)

در زمان ویرایش رکوردهای حساس (نمرات و سوابق تحصیلی)، سرور شماره نسخه ارسالی (`base_version` یا هدر `If-Match`) را با شماره نسخه موجود در پایگاه‌داده مقایسه می‌کند:

```sql
-- کوئری اتمیک به‌روزرسانی نمره با قفل خوش‌بینانه
UPDATE grades 
SET score = :new_score, 
    version = version + 1, 
    updated_at = NOW()
WHERE id = :grade_id 
  AND school_id = :school_id 
  AND version = :base_version;
```

* **در صورت موفقیت (Rows Affected = 1):** نسخه افزایش یافته و تغییر ثبت می‌شود.
* **در صورت عدم تطابق (Rows Affected = 0):** رکورد دچار تعارض‌شده است. سرور خطای `409 Conflict` بازمی‌گرداند و مطابق با سند `docs/CONFLICT_MODEL_DESIGN.md`، رکورد تعارض را در جدول `sync_conflicts` ثبت و به مدیر اطلاع‌رسانی می‌کند.

---

## ۱۰. جمع‌بندی ساختار تولیدی بک‌اند

با استقرار این معماری:
1. ارتباط کلاینت-سرور به استانداردهای رسمی RESTful ارتقا یافته و سازگاری کامل با اپلیکیشن‌های موبایل (Android/iOS) برقرار می‌شود.
2. حجم داده‌های تبادلی به لطف پروجکشن سمت سرور و فشرده‌سازی تا **۸۰ درصد کاهش** می‌یابد.
3. ترافیک سنگین کارهای پس‌زمینه (SMS، فایل‌ها و پشتیبان‌ها) از هسته تراکنشی سامانه ایزوله می‌شود.
