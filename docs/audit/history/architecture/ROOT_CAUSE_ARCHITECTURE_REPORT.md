# ROOT_CAUSE_ARCHITECTURE_REPORT.md
## گزارش تحلیل ریشه‌ای معماری و برنامه بازطراحی بنیادین سامانه پایش
### Root Cause Architecture Reset & Permanent Verification Program

**تاریخ گزارش:** ۲۹ شهریور ۱۴۰۵ (19 September 2026)  
**نسخه سامانه:** Payesh Core v1.0.0 (Post-Phase 6 Deep Audit)  
**تیم مؤلف:** هیئت معماری و ممیزی مستقل رد تیم (Principal Architect & Red Team Auditor)  
**مرجع گیت:** مخزن `https://github.com/rezaa2544/p2` (شاخه `main` — کامیت `1d3ca7d5`)  
**خط‌مشی حاکم:** **Zero Trust Architecture & Permanent Root-Cause Elimination**

---

# ۱. تحلیل ریشه‌ای علل تکرار خطاها (Root Cause Analysis)

علت تکرار شکست‌های امنیتی و عملیاتی در ممیزی‌های پیاپی، «وجود باگ در کد» نبوده، بلکه اتخاذ رویکرد **Patch Cycle (چرخه وصله‌کاری)** به جای **Architectural Correction (اصلاح ساختار معماری)** بوده است. توسعه‌دهندگان پیشین به جای درمان علت بنیادین، نشانه‌ها (Symptoms) را با افزودن شرط‌های موضعی یا نوشتن یونیت‌تست‌های ایزوله پوشش می‌دادند؛ در حالی که ریشه زایش خطا در معماری دست‌نخورده باقی می‌ماند.

چهار ریشه ساختاری زایش خطا در سامانه عبارتند از:

### ۱. توهم وضعیت دوگانه و چندگانگی مرجع حقیقت (The Dual-State Illusion & Multi-Authority)
- **علت ریشه‌ای:** سامانه همزمان دارای سه لایه مدعی مرجعیت داده است: پایگاه داده PostgreSQL، سند حافظه‌ای `store` در پروسه Node، و حافظه پنهان Redis.
- **مکانیسم شکست:** در بسیاری از ماژول‌ها، خواندن و اعتبارسنجی از RAM پروسه محلی انجام می‌شود، در حالی که فرض شده PostgreSQL مرجع است. در استقرار بیش از یک نمونه سرور (Multi-Instance)، هر پروسه یک جزیره منزوی از وضعیت در RAM برای خود می‌سازد (`_nationalTrafficWeights`، `_nationalRegionStore`، `store.users`). با هر درخواست، نمونه‌ها واگرا شده و با هر `kill -9`، تمام تصمیمات گرفته‌شده محو می‌گردند.

### ۲. زیرسیستم‌های موهوم و تحویل بدون اتصال به رانتایم (Orphaned Subsystems)
- **علت ریشه‌ای:** پیاده‌سازی قابلیت‌ها در قالب کلاس‌ها یا فایل‌های کتابخانه‌ای مستقل، بدون تزریق وابستگی (Dependency Injection) و بدون گره زدن به خط لوله واقعی درخواست‌های وب (`server/index.js`).
- **مکانیسم شکست:** ماژول‌هایی نظیر `Phase6CanaryEngine` و `assertTenantBoundary` با هزاران خط کد و صدها تست نوشته شدند، اما هیچ کنترلر یا میدلوری در مسیر HTTP آن‌ها را صدا نمی‌زند. در نتیجه، در تست‌های واحد کاملاً سبز بودند اما در ترافیک پروداکشن وجود خارجی نداشتند.

### ۳. الگوی ضدمعماری فال‌بک خاموش (Silent Fallback & Fail-Open Anti-Pattern)
- **علت ریشه‌ای:** اشتباه گرفتن اصل «تاب‌آوری (Resilience)» با «نادیده‌گرفتن خطا (Error Swallowing)».
- **مکانیسم شکست:** در زمان قطعی ردیس یا دیتابیس، سیستم به جای رفتار صلب قطع خدمت در تولید (`Fail-Closed / 503 Service Unavailable`)، استثناها را با `catch (e) {}` می‌بلعد، ریت‌لیمیتر را با `allowed: true` باز می‌کند، و تراکنش‌های شکست‌خورده دیتابیس را به عنوان موفقیت در RAM ثبت می‌کند.

### ۴. تست‌های فریبنده و اعتبارسنجی غیرواقعی (Fake-Green Test Infrastructure)
- **علت ریشه‌ای:** طراحی تست‌ها به گونه‌ای که نبود وابستگی‌های اساسی به جای شکست تست، منجر به صدور کد خروج صفر (`process.exit(0)`) شود.
- **مکانیسم شکست:** تعداد ۲۰۱ مورد `process.exit(0)` در پوشه تست‌ها وجود دارد که حداقل ۱۰۲ مورد آن برای دور زدن الزامات دیتابیس و ردیس است. همچنین دستور `npm test` تنها ۲ فایل رابط کاربری را اجرا کرده و بیش از ۵۵۰ سوئیت آزمون بک‌اند را کاملاً نادیده می‌گیرد.

---

## ماتریس مرجعیت مؤلفه‌ها (Component Authority Matrix)

| مؤلفه سیستم | مرجعیت فعلی در کد | مرجعیت الزامی در معماری هدف | ریسک معماری در پروداکشن |
| :--- | :--- | :--- | :--- |
| **کاربران و هویت** | `store.users` (RAM) | PostgreSQL `users` table | بازنویسی و پاک‌شدن کاربران با اتصال به دیتابیس خام؛ نابودی سشن‌ها |
| **کنترل نسخه و OCC** | `student.version` در RAM | PostgreSQL Row Version (`RETURNING version`) | رخداد بازنویسی خاموش (Lost Update) در ترافیک همروند چندنمونه‌ای |
| **اوزان ترافیک قناری** | `_nationalTrafficWeights` (`Map`) | جدول پایدار `phase6_canary_configs` | نابودی کامل تنظیمات رول‌اوت پس از هر ری‌استارت یا کرش سرور |
| **مرکز عملیات ملی (NOC)** | متغیرهای ثابت `185/620` در کد | متریک‌های محاسبه‌شده از Prometheus/Timeseries | نمایش تابلوی جعلی و عدم درک تاخیرات فاجعه‌بار در سطح ملی |
| **کنترل بار و ریت‌لیمت** | RAM Fallback (`allowed: true`) | Redis Cluster (Fail-Closed در تولید) | باز شدن کامل درگاه در برابر حملات DDoS و Brute-Force هنگام قطعی ردیس |
| **تفکیک حریم استان‌ها** | بدون گارد در روت‌های اصلی | میدلور متمرکز استانی در خط لوله HTTP | نشت اطلاعات تحصیلی میان استانی و نقض کامل الزامات حاکمیتی |
| **تاییدیه اپراتور (ADR-012)** | فیلد ساده بولی `approved: true` | دفترکل تراکنشی + امضای نامتقارن (Ed25519) | آسیب‌پذیری قطعی در برابر Replay Attack و جعل هویت اپراتور ارشد |
| **صف رویدادها (Outbox)** | `store.outbox` (RAM) | جدول تراکنشی `server_outbox` + `server_outbox_dlq` | گم شدن دائمی رویدادها در زمان کرش؛ تجمع پیام‌های سمی در حافظه |

---

## فهرست پیاده‌سازی‌های موهوم و کدهای مرده (Fake Implementation Register)

1. **`server/infrastructure/phase6-canary-engine.js`:**  
   - *وضعیت:* کدهای کامل ثبت کلاستر، سوابق ممیزی و رول‌بک در کلاس `Phase6CanaryEngine` وجود دارند، اما در کل دایرکتوری `server/` **صفر بار** فراخوانی شده است. موتور قناری به مسیر HTTP وصل نیست.
2. **`server/infrastructure/phase6-production-hardening.js:81` (`assertTenantBoundary`):**  
   - *وضعیت:* تابع اعتبارسنجی حریم مدرسه و استان تعریف شده، اما فقط در یونیت‌تست فراخوانی می‌شود و در هیچ‌یک از روت‌های بیزینس سرور استفاده نشده است.
3. **`server/routes/system.js:56` (`enforceGeographicBoundary`):**  
   - *وضعیت:* در بالای فایل ایمپورت شده اما در هیچ کجای فایل صدا زده نشده است (Unused Import / Dead Code).
4. **`server/outbox.js:207` (`moveToDlq`):**  
   - *وضعیت:* پیاده‌سازی انتقال پیام سمی به DLQ انجام شده، اما ورکر صف رویدادها (`server/worker.js`) در زمان اتمام تلاش‌ها هرگز آن را فراخوانی نمی‌کند.
5. **`tests/infrastructure/phase6/failure-resilience.test.js`:**  
   - *وضعیت:* با ساخت اشیاء ماک موضعی (`fakeStore`, `fakeDb`) آزمون DLQ را سبز نشان می‌دهد، در حالی که در رانتایم واقعی سیستم پیام‌ها در صف می‌سوزند.

---

## ممیزی معماری پایگاه داده و مهاجرت‌ها (001 تا 014)

| شماره مهاجرت | مرز تراکنش (`BEGIN/COMMIT`) | وضعیت روی دیتابیس تمیز | پسماند در رول‌بک (DOWN) | عیب ساختاری |
| :---: | :---: | :---: | :---: | :--- |
| **001_initial** | دارد | ✅ موفق | 🔴 نشت جدول `sync_conflicts` | فایل DOWN فاقد دستور حذف جدول تعارضات است |
| **002 تا 012** | دارد | ✅ موفق | ✅ بدون پسماند | ارتباط کلیدهای خارجی نیازمند ترتیب دقیق است |
| **013_universal_occ** | 🔴 فاقد COMMIT | 🔴 شکست در خط ۲۵ | 🔴 رول‌بک ناقص | ستون `user_id` در جدول `sync_conflicts` وجود ندارد |
| **014_outbox_dlq** | 🔴 فاقد BEGIN/COMMIT | 🔴 شکست در خط ۲۶ | 🔴 رول‌بک ناقص | جدول `server_outbox` اصلاً در دیتابیس ساخته نشده است |

---

# ۲. طراحی معماری پایدار هدف (Target Architecture Design)

در معماری جدید، توهم وضعیت دوگانه به طور کامل منسوخ می‌شود. **پایگاه داده PostgreSQL تنها و یگانه مرجع حقیقت (Single Source of Truth) است.** حافظه RAM و Redis به جایگاه واقعی خود (بهینه‌ساز و شتاب‌دهنده موقت) بازمی‌گردند.

```
                                  [ HTTP Request ]
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │          WAF & Ingress Rate Limiter          │
                 │   (Fail-Closed via Redis / Nginx Hard Cap)   │
                 └───────────────────────┬──────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │       Global Authentication Middleware       │
                 │    (Cookie Session / JWT Expiry / JTI DB)    │
                 └───────────────────────┬──────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │   Tenant & Provincial Isolation Middleware   │
                 │   (Zero-Trust Boundary Guard: School/Prov)   │
                 └───────────────────────┬──────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │         Canary & Cluster Routing Fabric      │
                 │  (State loaded from PostgreSQL, cached in L1) │
                 └───────────────────────┬──────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │     Domain Service & Repository Pipeline     │
                 │   - Atomic OCC in SQL (RETURNING version)    │
                 │   - Cryptographic Operator Governance (Nonce)│
                 │   - Transactional Outbox Pattern Insertion   │
                 └───────────────────────┬──────────────────────┘
                                         │
                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       DATA STORAGE & AUTHORITY TIERS                        │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ TIER 0: PostgreSQL 17 (SOLE SOURCE OF TRUTH — SSoT)                   │  │
 │  │ - Relational Integrity, Foreign Keys, Check Constraints               │  │
 │  │ - Transaction Isolation (SERIALIZABLE / REPEATABLE READ)              │  │
 │  │ - Outbox Queue & DLQ Tables (`server_outbox`, `server_outbox_dlq`)    │  │
 │  │ - Canary Configs & Replay Ledger Tables                               │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │ Changes emitted via LISTEN/NOTIFY    │
 │                                      ▼ or post-commit cache invalidation    │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ TIER 1: Redis 8 (ACCELERATOR & DISTRIBUTED LOCKS — NON-AUTHORITATIVE) │  │
 │  │ - Distributed Cache (L2) with strict TTL and School Epoch             │  │
 │  │ - Distributed Sliding-Window Rate Limiter (Fail-Closed)               │  │
 │  │ - Distributed Lock for High-Contention Operations                     │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │ Local L1 copy                        │
 │                                      ▼                                      │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │ TIER 2: Process RAM (EPHEMERAL EXECUTION OPTIMIZATION — ZERO STATE)   │  │
 │  │ - Single-Flight Promise Deduping                                      │  │
 │  │ - Bounded In-Flight Execution Counters                                │  │
 │  │ - Strictly FORBIDDEN to store master records, permissions or weights  │  │
 │  └───────────────────────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │            Audit Ledger & Metrics            │
                 │ (Post-Commit Event Emission, Headers Injected│
                 │  X-Canary-ID, X-Cluster-ID, Real Latencies)  │
                 └──────────────────────────────────────────────┘
```

---

# ۳. نقشه راه مهاجرت و اصلاح ساختاری (Migration Roadmap)

### فاز A: زیرساخت داده و مرجعیت واحد (Days 1–3: Data Foundation & Authority Reset)
1. **اصلاح و استانداردسازی مایگریشن‌های موجود:**
   - افزودن بلوک‌های تراکنشی `BEGIN; ... COMMIT;` به مایگریشن‌های ۰۱۳ و ۰۱۴.
   - اصلاح مایگریشن ۰۱۳: افزودن `ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS user_id BIGINT;`.
   - ایجاد جدول `server_outbox` قبل از ایندکس‌گذاری در مایگریشن ۰۱۴.
   - اصلاح `001_initial.down.sql` و اضافه کردن `DROP TABLE IF EXISTS sync_conflicts;`.
2. **ایجاد مایگریشن‌های زیرساختی فاز ۶:**
   - `migrations/015_national_canary_configs.sql`: ایجاد جدول ماندگار `phase6_canary_configs` با قیدهای کنترلی وزن و رول‌بک.
   - `migrations/016_governance_replay_ledger.sql`: ایجاد جدول `governance_replay_ledger` (شامل `nonce`، امضای اپراتور، کلید عمومی، و تاریخ انقضا).
   - `migrations/017_outbox_dlq_hardening.sql`: یکپارچه‌سازی کامل صف رویدادها و صف پیام‌های مرده در دیتابیس.
3. **حذف مرجعیت RAM از هسته سیستم:**
   - منسوخ کردن متغیرهای `_nationalTrafficWeights`، `_nationalRegionStore` و توابع همگام‌ساز در حافظه.
   - هدایت تمام کوئری‌های خواندن و نوشتن مستقیماً به مخزن دیتابیس (`Repository Layer`).

### فاز B: استقرار گاردهای امنیتی Zero Trust (Days 3–5: Security & Governance Reset)
1. **اتصال میدلور قناری به خط لوله HTTP:**
   - ایجاد `server/middleware/canary.js` و اتصال مستقیم آن در `server/index.js` پیش از توزیع روت‌ها.
   - تزریق سرآیندهای اجباری: `X-Canary-ID`, `X-Canary-Cluster`, `X-Canary-Version`.
2. **فعال‌سازی سراسری گارد ایزولاسیون استانی و مدرسه‌ای:**
   - تبدیل `assertTenantBoundary` به یک میدلور سراسری روی کلیه روت‌های بیزینس (`/api/v1/students`, `/grades`, `/attendance`, `/classes`).
   - انسداد بلادرنگ دسترسی‌های غیرمجاز با کد خطای رسمی `403 PHASE6_TENANT_ISOLATION_BREACH`.
3. **پیاده‌سازی اعتبارسنجی رمزنگاری‌شده حاکمیتی (ADR-012):**
   - جایگزینی فیلد ساده `approved: true` با الگوریتم امضای نامتقارن (Ed25519) یا کلید امن HMAC-SHA256 به همراه اعتبارسنجی فیلد یک‌بارمصرف `nonce`.
   - ثبت کلیه تاییدیه‌ها در جدول `governance_replay_ledger` و رد آنی هرگونه تلاش برای بازپخش (Replay Attack) با خطای ۴۰۳.

### فاز C: قابلیت اطمینان توزیع‌شده و چندسروری (Days 3–5: Distributed Consistency)
1. **اصلاح کنترل همروندی خوش‌بینانه (Universal OCC in SQL):**
   - حذف مقایسه نسخه در حافظه Node.
   - اجرای مستقیم دستور اتمیک:  
     `UPDATE table SET ..., version = version + 1 WHERE id = $id AND version = $base RETURNING version;`  
     و پرتاب خطای ۴۰۹ به همراه درج در `sync_conflicts` در صورت صفر بودن ردیف‌های تغییریافته.
2. **اصلاح رفتار ریت‌لیمیتر به Fail-Closed در محیط تولید:**
   - اصلاح `server/rate-limit.js` و `server/cache.js` تا در صورت قطعی اتصال ردیس در محیط پروداکشن، به جای `{ allowed: true }` صراحتاً خطای ۵۰۳ صادر شود.
3. **اتصال بلادرنگ تابلوی مرکز عملیات ملی (NOC):**
   - حذف اعداد هاردکدشده `185` و `620` از `national-observability-plane.js`.
   - اتصال مستقیم مقادیر p95 و p99 به بافر هیستوگرام ماژول `server/metrics.js`.

### فاز D: پایپ‌لاین اعتبارسنجی دائم و اسکریپت آزمون جامع (Days 2–3: Verification Pipeline)
1. **حذف کامل کدهای فریبنده در تست‌ها:**
   - حذف تمام ۲۰۱ مورد `process.exit(0)` از فایل‌های آزمون و جایگزینی با پرتاب استثنای واقعی.
   - حذف ماک‌های فرضی (`fakeStore`, `fakeDb`) از تست‌های تاب‌آوری.
2. **ساخت اسکریپت استاندارد `tools/verify-production.sh`:**
   - اجرای آزمون سه‌گانه مایگریشن روی دیتابیس صفر (`UP -> DOWN -> UP -> DOWN -> UP`).
   - اجرای آزمون تزریق شکست قطعی ردیس و دیتابیس و اعتبارسنجی پاسخ ۵۰۳.
   - اجرای آزمون بازپخش (Replay Attack) و پایداری وزن‌ها پس از `kill -9`.
   - اجرای آزمون چندنمونه‌ای (دو پروسه موازی) جهت اثبات عدم رخداد Split-Brain.

---

# ۴. گاردهای دائمی معماری (Architecture Guards in CI)

برای جلوگیری دائمی از بازگشت الگوهای معیوب به مخزن، اسکریپت اعتبارسنجی استاتیک `tools/architecture-guard.js` در گیت‌هاب اکشنز و مرحله Pre-commit تعبیه خواهد شد:

```javascript
/**
 * قوانین مهارکننده دائمی در CI (Architecture Guard Rules):
 * ۱. ممنوعیت تعریف Map/Set در دامنه سراسری برای نگهداری موجودیت‌های بیزینس.
 * ۲. ممنوعیت استفاده از process.exit(0) در بلوک‌های try/catch فایل‌های تست.
 * ۳. ممنوعیت استفاده از عبارات خالی catch (_) {}.
 * ۴. ممنوعیت بازگرداندن allowed: true یا fallback: true در زمان بروز خطای ردیس در ماژول‌های امنیتی.
 * ۵. الزام اتصال تمام فایل‌های زیرساختی جدید به درخت روتینگ server/index.js.
 */
```

---

# ۵. ماتریس ریسک و راهکارهای مهار (Risk Matrix)

| ریسک ساختاری | احتمال | شدت اثر | راهکار مهار قطعی در معماری جدید |
| :--- | :---: | :---: | :--- |
| **واگرایی وضعیت در چند سرور (Split-Brain)** | قطعی | فاجعه‌بار | حذف مطلق اوزان و وضعیت‌ها از RAM و خواندن انحصاری از PostgreSQL با کش با TTL کوتاه |
| **بازنویسی خاموش داده‌ها (Lost Update)** | بالا | بحرانی | انتقال کامل OCC به سطح دستورات اتمیک SQL (`UPDATE ... WHERE version = $base`) |
| **شکست مهاجرت در محیط عملیاتی جدید** | قطعی | مسدودکننده | اصلاح کامل فایل‌های ۰۱۳ و ۰۱۴ و الزام گذر از آزمون چرخه سه‌گانه UP/DOWN در CI |
| **نفوذ از طریق حمله بازپخش (Replay Attack)** | بالا | بحرانی | پیاده‌سازی امضای دیجیتال نامتقارن، نانس‌های یک‌بارمصرف و جدول دفترکل در دیتابیس |
| **حملات منع سرویس در قطعی کش (Fail-Open)** | متوسط | بحرانی | تغییر سیاست ریت‌لیمیتر در محیط تولید به Fail-Closed صلب با خطای ۵۰۳ |
| **گزارش‌دهی گمراه‌کننده وضعیت سیستم** | قطعی | متوسط | حذف کامل ثابت‌های هاردکدشده در NOC و استخراج متریک‌ها از ترافیک زنده سرور |

---

# ۶. نتیجه‌گیری و حکم نهایی مرحله ممیزی

# 🔴 AUDIT COMPLETE — AWAITING ARCHITECTURAL APPROVAL

این سند ریشه کلاس خطاها را در تمامی فازها به صورت مستند و تجربی شناسایی کرده و برنامه جامع بازطراحی را ارائه داده است.  
**مطابق با دستورالعمل صلب ممیزی، هیچ تغییری در سورس‌کد پروداکشن ایجاد نشد.**  
پس از تایید این سند معماری، مرحله پیاده‌سازی گام‌به‌گام فازهای A تا D آغاز خواهد شد.
