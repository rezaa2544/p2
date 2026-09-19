# گزارش ممیزی رد تیم، تست زنده و اثبات صحت فاز ۳ سامانه پایش
## Red Team Verification, Live Runtime Audit & Proof Matrix — Phase 3

**تاریخ ممیزی:** ۲۹ شهریور ۱۴۰۵ (19 September 2026)  
**نسخه سامانه:** Payesh Core v1.0.0 (Phase 3 Core REST & Educational Semantic Layer P0-EI-01..21)  
**محیط آزمون زنده:**  
- سیستم‌عامل: Linux x86_64 (Debian Trixie)  
- موتور جاوااسکریپت: Node.js v22.23.2 (ارتقا یافته از v20 جهت تطابق با `engines >= 22` و `jsdom 30`)  
- پایگاه داده رابطه‌ای زنده: PostgreSQL 17.11 (سرویس محلی، پورت 5432، دیتابیس `payesh_dev` با افزونه‌های `uuid-ossp` و `btree_gist`)  
- کش و صف رویداد توزیع‌شده زنده: Redis 8.0.2 (سرویس محلی، پورت 6379)  
- وضعیت ممیزی: **Zero Trust — اتکا صرفاً به اجرای زنده، DDL واقعی، ترافیک HTTP، تست نفوذ و کد واقعی**  

---

## ۱. حکم نهایی ممیزی (Audit Verdict)

# 🔴 NOT VERIFIED (مشروط / عدم تایید کامل در لایه پایگاه‌داده رابطه‌ای)

### خلاصه دلایل حکم:
1. **لایه منطق تجاری و API در حافظه (In-Memory / Redis):** 🟢 **تایید کامل (100% VERIFIED)**  
   کلیه پایانه‌های RESTful، قوانین کنترل دسترسی مبتنی بر نقش (RBAC)، مهار BOLA/IDOR، پایش چندمستأجری (Tenant Isolation)، کنترل همروندی خوش‌بینانه (OCC با خطای 409)، ماسک‌گذاری PII، و ۲۱ موتور هوشمندی آموزشی (P0-EI-01 تا P0-EI-21) در تست‌های تهاجمی زنده (Red Team) با موفقیت کامل ۲۲ از ۲۲ آزمون را پاس کردند.
2. **لایه پایگاه داده رابطه‌ای (PostgreSQL 17 Integration):** 🔴 **رد و عدم تایید (FAIL / BLOCKER)**  
   - مهاجرت پایگاه‌داده شماره ۰۱۴ (`migrations/014_outbox_dlq.sql`) به دلیل عدم وجود جدول پایه `server_outbox` در کل زنجیره مهاجرت‌های قبلی، با خطای صلب `ERROR: relation "server_outbox" does not exist` می‌شکند.
   - مهاجرت شماره ۰۱۳ (`migrations/013_universal_occ_and_sequences.sql`) به دلیل عدم تطابق شمای جدول `sync_conflicts`، با خطای صلب `ERROR: column "user_id" does not exist` می‌شکند.
   - اسکریپت رسمی مهاجرت `tools/migrate-to-pg.js` به دلیل ترتیب وابستگی کلیدهای خارجی (ایجاد جدول با FK به `schools` قبل از ساخت خود جدول `schools`) با خطای `relation "schools" does not exist` سقط می‌شود.
   - سوئیت رسمی اعتبارسنجی پایگاه داده زنده `tests/pg-relational-seed.js` هنگام اجرا بر روی PostgreSQL واقعی با شکست **۱۴ آزمون از ۳۷ آزمون (23/37)** مواجه می‌شود.
   - بوت سرور روی دیتابیس تمیز PostgreSQL منجر به پاک‌شدن کاربران حافظه (`hydrateStoreFromPg` با 0 رکورد) و قطع دسترسی احراز هویت می‌شود.

---

## ۲. خلاصه اجرایی (Executive Summary)

سامانه پایش در فاز ۳ دارای دو بستر عملکردی متمایز است که در این ممیزی هر دو مورد کالبدشکافی دقیق قرار گرفتند:
1. **بخش اول (Phase 3 Core RESTful APIs):** پایانه‌های منابع اصلی شامل مدیریت دانش‌آموزان (`/api/v1/students`)، کلاس‌ها (`/api/v1/classes`)، حضوروغیاب (`/api/v1/attendance`)، کارنامه و نمرات (`/api/v1/grades`)، کاربران و کارکنان (`/api/v1/users`)، بوت‌استرپ سبک (`/api/v1/bootstrap`) و همگام‌سازی جابجایی دلتا (`/api/v1/pull`).
2. **بخش دوم (Educational Semantic Layer / Intelligence Engines):** ۲۱ موتور هوشمندی و پردازش معنایی آموزش و پرورش (شامل P0-EI-01 تا P0-EI-21) مستقر در `server/analytics/` همراه با ۱۳ پایانه گزارش‌گیری در `server/routes/analytics.js` و ۳۴ سوئیت آزمون جامع در `tests/semantic-layer/`.

در حین این ممیزی، یک محیط کاملاً واقعی و زنده با PostgreSQL 17 و Redis 8 و Node.js 22 راه‌اندازی شد. کلیه ادعاهای مستندات و تست‌های مخزن در برابر رفتار واقعی سنجیده شدند.

---

## ۳. ماتریس راستی‌آزمایی ادعاها (Claim Verification Matrix)

| ردیف | مؤلفه / ادعا | ادعای مستندات / فاز ۳ | وضعیت واقعی کشف‌شده | شواهد ممیزی و تست زنده | وضعیت نهایی |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C-01** | زنجیره مهاجرت‌های DDL (001 تا 014) | مهاجرت تمیز و بدون خطا روی PostgreSQL | **PARTIAL / BROKEN** | مهاجرت 013 روی ستون `user_id` و مهاجرت 014 روی جدول `server_outbox` فیل می‌شوند | 🔴 مردود |
| **C-02** | مهاجرت معکوس (Rollback / Down) | رول‌بک کامل مهاجرت‌ها تا نقطه صفر | **PARTIAL** | رول‌بک 001 تا 012 کار می‌کند؛ 013 و 014 به دلیل خطای Up قابل تست کامل نیستند | 🟡 ناقص |
| **C-03** | اسکریپت مهاجرت داده `tools/migrate-to-pg.js` | مهاجرت خودکار کل مدل به PostgreSQL | **BROKEN** | خطای `relation "schools" does not exist` به دلیل ترتیب نامناسب ساخت جداول | 🔴 مردود |
| **C-04** | سوئیت تست دیتابیس `tests/pg-relational-seed.js` | اثبات درستی و برقراری FKها در دیتابیس واقعی | **FAILED (23/37)** | در محیط CI به دلیل نبود `PG_LIVE_PG` اسکیپ می‌شد؛ در دیتابیس واقعی ۱۴ تست شکست خورد | 🔴 مردود |
| **C-05** | اندپوینت‌های RESTful فاز ۳ (`/api/v1/*`) | عملکرد کامل ۷ پایانه CRUD | **REAL (In-Memory / Redis)** | با ارسال درخواست HTTP زنده تایید شد؛ تمامی کدهای وضعیت 200 و 201 صحیح بودند | 🟢 تایید |
| **C-06** | کنترل همروندی خوش‌بینانه (OCC) | مهار تداخل با `base_version` و بازگشت 409 | **REAL** | ارسال ۵ درخواست هم‌زمان: دقیقاً ۱ درخواست ۲۰۰ و ۴ تای دیگر ۴۰۹ شدند | 🟢 تایید |
| **C-07** | ایزولاسیون مستأجر و مهار BOLA/IDOR | عدم دسترسی مدیر/دبیر/ولی به سایر مدارس | **REAL** | تست تهاجمی مدیر مدرسه ۱ به دانش‌آموز مدرسه ۲ با ۴۰۴ ضدشمارش مسدود شد | 🟢 تایید |
| **C-08** | مهار ارتقای دسترسی (Privilege Escalation) | منع ساخت کاربر با نقش بالاتر یا تغییر نقش خود | **REAL** | درخواست POST مدیر برای ساخت superadmin با ۴۰۳ مسدود شد؛ درخواست دانش‌آموز با ۴۰۳ رد شد | 🟢 تایید |
| **C-09** | لایه معنایی آموزشی (P0-EI-01 تا P0-EI-21) | محاسبات روان‌سنجی، حضور، غیبت مزمن، سلامت | **REAL** | ۳۳ سوئیت آزمون در `tests/semantic-layer/runner.js` با موفقیت ۱۰۰٪ در ۱.۶۲ ثانیه پاس شدند | 🟢 تایید |
| **C-10** | حاکمیت انسانی و منع رتبه‌بندی رقابتی | Zero-Ranking & Human-in-the-loop | **REAL** | موتورها خطای صلب `ZERO_RANKING_VIOLATION` داده و خروجی رتبه‌بندی تولید نمی‌کنند | 🟢 تایید |
| **C-11** | حفاظت از تزریق SQL و پی‌لودهای مخرب | پارامتریزه بودن کوئری‌ها و سقف حجم پی‌لود | **REAL** | تزریق `' OR '1'='1` مهار شد؛ پی‌لود بزرگتر از ۶۴ کیلوبایت خطای ۴۱۳ برگرداند | 🟢 تایید |
| **C-12** | وابستگی به موتور Node.js | سازگاری با محیط‌های استاندارد | **PARTIAL** | نیازمند قطعی Node.js 22؛ روی Node.js 20 کتابخانه `jsdom 30` کرش می‌کند | 🟡 نیازمند توجه |

---

## ۴. یافته‌ها و باگ‌های بحرانی (Vulnerabilities & Bugs Classification)

### 🔴 رده P0 (بحرانی / مانع انتشار - Critical Blockers)

#### ۱. [P0-BUG-01] فقدان تعریف DDL جدول `server_outbox` در مهاجرت‌ها
- **فایل‌های متأثر:** `migrations/014_outbox_dlq.sql`، `tools/w18-load-pg.sh`، `tools/seed-relational-small.js`، `server/index.js`
- **شرح باگ:** در فایل `migrations/014_outbox_dlq.sql` خط ۲۶ دستور زیر آمده است:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_server_outbox_status_id ON server_outbox (status, id ASC);
  ```
  اما در هیچ‌یک از مهاجرت‌های شماره ۰۰۱ تا ۰۱۳ جدول `server_outbox` ایجاد نشده است! در نتیجه هنگام اجرای مهاجرت با پرچم `ON_ERROR_STOP=1` خطای صلب زیر رخ می‌دهد:
  ```text
  ERROR: relation "server_outbox" does not exist
  ```
- **شواهد تست‌های دروغین:** در فایل‌های تستی مانند `tests/wave1-multi-instance.js` خط ۱۱۱ و `tests/chaos-drill-lib.js` خط ۲۹۶، نویسندگان تست به صورت دستی دستور `CREATE TABLE server_outbox (...)` را تزریق کرده بودند تا تست‌های خودشان سبز شود، در حالی که در خط تولید و دیتابیس واقعی این جدول وجود ندارد!

#### ۲. [P0-BUG-02] خطای شمای جدول `sync_conflicts` در مهاجرت ۰۱۳
- **فایل متأثر:** `migrations/013_universal_occ_and_sequences.sql:25`
- **شرح باگ:** جدول `sync_conflicts` در مهاجرت ۰۰۱ با ستون‌های متفاوتی ساخته شده است (فاقد ستون `user_id`). مهاجرت ۰۱۳ از دستور `CREATE TABLE IF NOT EXISTS sync_conflicts (id BIGSERIAL, ..., user_id BIGINT)` استفاده می‌کند که به دلیل وجود قبلی جدول هیچ اثری ندارد؛ سپس در خط ۲۵ تلاش می‌کند ایندکس روی `user_id` بسازد:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user ON sync_conflicts (user_id, created_at);
  ```
  که بلافاصله منجر به خطای صلب می‌شود:
  ```text
  ERROR: column "user_id" does not exist
  ```

#### ۳. [P0-BUG-03] خطای ترتیبی کلیدهای خارجی در `tools/migrate-to-pg.js`
- **فایل متأثر:** `tools/migrate-to-pg.js:140-280`
- **شرح باگ:** تابع `generateDDL` جداول را بر اساس ترتیب حروف الفبای کالکشن‌ها ایجاد می‌کند. جدول `announcements` در خط ۵۰ ایجاد می‌شود و دارای قید `FOREIGN KEY (school_id) REFERENCES schools(id)` است. چون جدول `schools` هنوز ایجاد نشده، اجرای آن روی دیتابیس خام با خطای زیر متوقف می‌شود:
  ```text
  Migration failed: error: relation "schools" does not exist
  ```

#### ۴. [P0-BUG-04] پاک‌شدن کاربران حافظه در راه‌اندازی با PostgreSQL خالی
- **فایل متأثر:** `server/db.js:520` (`hydrateStoreFromPg`) و `server/index.js:160`
- **شرح باگ:** هنگامی که `DATABASE_URL` تنظیم شود، تابع `hydrateStoreFromPg` کالکشن‌های حافظه را با رکوردهای دیتابیس جایگزین می‌کند. اگر دیتابیس خالی باشد، `store.users` خالی می‌شود. از آنجا که تابع ورود در `server/auth.js` به جستجوی کاربر در دیتابیس متکی است، هیچ کاربری امکان دریافت کد OTP یا لاگین پیدا نمی‌کند.

---

### 🟡 رده P1 (بالا / ریسک معماری - High Architecture Gaps)

#### ۱. [P1-GAP-01] الگوهای سبز کاذب (Fake-Green) در غیاب دیتابیس
- **شواهد:** تست‌هایی نظیر `tests/pg-relational-seed.js`، `tests/wave3-query.js`، `tests/wave3-query3.js` و `tests/wave3-parity.js` در شرایطی که `DATABASE_URL` یا `PG_LIVE_PG` مقداردهی نشده باشند، فاز اعتبارسنجی زنده را اسکیپ کرده و با کد خروج 0 خارج می‌شوند.
- هنگامی که این تست‌ها در محیط واقعی با PostgreSQL اجرا شدند:
  - `tests/pg-relational-seed.js` شکست خورد (۲۳ پاس، ۱۴ فیل).
  - `tests/wave3-parity.js` به دلیل خالی بودن آرایه‌ها دچار کرش نال‌پوینتر شد (`Cannot read properties of undefined`).
  - `tests/wave3-query3.js` در گیت B7 (عدم Sequential Scan) به دلیل حجم کم داده‌ها فیل شد.

#### ۲. [P1-GAP-02] ناسازگاری محیط اجرایی Node 20 با وابستگی‌های ثبت‌شده
- **شواهد:** در فایل `package.json` پیش‌نیاز `"node": ">=22"` درج شده اما در اکثر محیط‌های سروری پیش‌فرض Node 20 فعال است. در Node 20، کتابخانه `jsdom v30` به دلیل وابستگی به پیاده‌سازی جدید `undici/webidl` با خطای قطعی زیر کرش کرده و مانع اجرای `node server/seed.js` می‌شود:
  ```text
  TypeError: webidl.util.markAsUncloneable is not a function
  ```

---

### 🔵 رده P2 و P3 (متوسط و پایین - Medium/Low Observations)

1. **[P2-OBS-01] عدم پوشش OpenAPI 3.1 برای پایانه‌های هوشمندی آموزشی:**  
   مستندات `docs/openapi.yaml` صرفاً پایانه‌های CRUD سنتی فاز ۳ را در بر دارد و ۱۳ اندپوینت تحلیلی جدید (`/api/v1/analytics/*`) در شمای OpenAPI منعکس نشده‌اند.
2. **[P2-OBS-02] سهمیه‌بندی و اسکن جدول در Keyset Pagination:**  
   در پیاده‌سازی کوئری‌های Keyset Pagination در `server/dbquery.js`، شرط‌های ایندکس‌دار به دقت طراحی شده‌اند اما به دلیل عدم اعمال آنالیزهای دوره‌ای (`ANALYZE`) روی جداول پارتیشن‌بندی شده، پلنر پستگرس روی جداول کم‌حجم به Seq Scan بازمی‌گردد.

---

## ۵. شواهد آزمون تهاجمی زنده (Red Team Adversarial Results)

نتایج اجرای اسکریپت آزمون زنده (`/tmp/phase3_redteam_test.js`) بر روی سرور در حال اجرا:

```text
===============================================================
🚀 RED TEAM AUDIT SUITE: PHASE 3 VERIFICATION & ADVERSARIAL DRILL
===============================================================

--- SECTION 1: RESTful API Runtime Behavior ---
  ✅ [PASS] RT-01: GET /api/v1/bootstrap returns 200 with school and classes for manager
  ✅ [PASS] RT-02: GET /api/v1/students returns 200 with paginated student records
  ✅ [PASS] RT-03: GET /api/v1/students/16 returns 200 with full student detail for manager
  ✅ [PASS] RT-04: GET /api/v1/classes returns 200 with enriched class records
  ✅ [PASS] RT-05: GET /api/v1/attendance returns 200 for manager
  ✅ [PASS] RT-06: GET /api/v1/grades returns 200 with student and subject names
  ✅ [PASS] RT-07: GET /api/v1/users returns 200 with role and safe projection

--- SECTION 2: Adversarial Security Tests (RBAC, IDOR, Injection) ---
  ✅ [PASS] SEC-01: Anonymous access to /api/v1/students is rejected with 401
  ✅ [PASS] SEC-02: Forged JWT session cookie is rejected with 401
  ✅ [PASS] SEC-03: Student role attempting to POST /api/v1/students is rejected with 403
  ✅ [PASS] SEC-04: Student role attempting to view /api/v1/analytics/school-intelligence is rejected with 403
  ✅ [PASS] SEC-05: Teacher role attempting to DELETE student is rejected with 403
  ✅ [PASS] SEC-06: Manager 1 accessing Student of School 2 is rejected with 404 (Anti-Enumeration)
  ✅ [PASS] SEC-07: Manager 1 accessing Class of School 2 is rejected with 404 (Anti-Enumeration)
  ✅ [PASS] SEC-08: Parent accessing non-child student is rejected with 404 (Anti-Enumeration)
  ✅ [PASS] SEC-09: Manager 1 requesting School 2 analytics is rejected with 403 (Cross-Tenant Guard)
  ✅ [PASS] SEC-10: Manager attempting to create superadmin user is rejected with 403
  ✅ [PASS] SEC-11: Student attempting to PATCH self to manager role is rejected with 403
  ✅ [PASS] SEC-12: SQL Injection attempt in query string (' OR '1'='1) does not crash or leak (returns 200 safe)
  ✅ [PASS] SEC-13: Oversized request body (>64KB) is rejected with 413 (body_too_large)

--- SECTION 3: Concurrency & Optimistic Concurrency Control (OCC) ---
  ✅ [PASS] OCC-01: Update with stale base_version is rejected with 409 (Conflict)
  ✅ [PASS] OCC-02: Racing updates with same base_version: exactly 1 succeeds (200) and 4 fail with 409 [success=1, conflict=4]

===============================================================
TOTAL RED TEAM TESTS: 22 | PASSED: 22 | FAILED: 0
===============================================================
```

---

## ۶. بررسی تطابق با اصول معماری و مهندسی پروژه

1. **اصل ایزولاسیون مستأجر و عدم نشت (Fail-Closed Tenant Isolation):**  
   کاملاً رعایت شده است. مدیر مدرسه ۱ تحت هیچ شرایطی امکان دریافت رکوردهای مدرسه ۲ را ندارد. در صورت درخواست شناسه نامعتبر، کد ۴۰۴ (به جای ۴۰۳) بازمی‌گردد تا از حملات برشماری (Enumeration) ممانعت شود.
2. **اصل حاکمیت تصمیم انسانی و منع رتبه‌بندی رقابتی (No Ranking / Human-in-the-loop):**  
   تمامی ۲۱ موتور لایه معنایی آموزشی مجهز به گارد `ZERO_RANKING_VIOLATION` هستند و از ایجاد جدول رده‌بندی رقابتی یا تصمیم‌گیری خودکار الگوریتمی جلوگیری می‌کنند.
3. **کنترل همروندی خوش‌بینانه (OCC):**  
   با مکانیزم `checkOcc` و مقایسه فیلدهای `base_version` و `version`، مسابقه بروزرسانی (Race Condition) با موفقیت کنترل شده و رکوردهای بازنویسی‌شده پس‌زده می‌شوند (کد ۴۰۹).
4. **اصل توزیع تک‌فایلی و عدم وابستگی به محیط کانتینری در کلاینت:**  
   برنامه کلاینت کماکان ساختار یکپارچه بدون بیلد را حفظ کرده است.

---

## ۷. نقشه راه اصلاحی پیشنهادی برای تیم توسعه (Remediation Plan)

برای رسیدن سامانه به وضعیت تایید کامل (`🟢 VERIFIED COMPLETE`)، اقدامات زیر الزامی است:
1. **اصلاح زنجیره مهاجرت‌ها:**
   - افزودن ایجاد DDL جدول `server_outbox` قبل از مهاجرت ۰۱۴.
   - اصلاح مهاجرت ۰۱۳ به گونه‌ای که ستون `user_id` را با دستور `ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS user_id BIGINT;` به جدول بیفزاید.
2. **اصلاح اسکریپت `tools/migrate-to-pg.js`:**
   - تفکیک ایجاد جداول از اضافه کردن قیود کلید خارجی (ایجاد کلیه جداول در گام اول، و سپس افزودن `ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY`).
3. **حذف الگوهای Fake-Green در CI:**
   - اجباری کردن اجرای سرویس کانتینری PostgreSQL و Redis در اکشن‌های گیت‌هاب و حذف شرط‌های `if (!process.env.PG_LIVE_PG) process.exit(0)`.
4. **تکمیل مستندات OpenAPI:**
   - افزودن تعاریف مسیرهای `/api/v1/analytics/*` به مستندات رسمی OpenAPI 3.1.
