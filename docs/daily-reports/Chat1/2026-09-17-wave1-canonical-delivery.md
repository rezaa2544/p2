# گزارش تحویل رسمی: تکمیل و تثبیت موج ۱ (Wave 1: PostgreSQL Source of Truth)

**تاریخ:** ۲۰۲۶-۰۹-۱۷ (۲۷ شهریور ۱۴۰۵)  
**سشن / برنچ:** `arena/01a0b101-p2`  
**مالک / مجری:** Chat1 (Universal Executor / Coordinator Takeover)  
**مأموریت‌های پوشش‌داده‌شده:** `C1-02` · `C1-03` · `C1-04`  
**هدف:** بستن قطعی مانع بحرانی `پ0-۱` و ترفیع Wave 1 در نقشه راه ملی به وضعیت ✅ **کامل**

---

## ۱. پیش‌زمینه و حل تعارض معماری (Mission C1-02: Wave-1 Conflict Adjudication)

### شرح تعارض تاریخی
در جریان توسعه Wave 1، دو خط پیاده‌سازی موازی وجود داشت:
1. **پیاده‌سازی Chat1 (PR #48):** تمرکز بر نوشت‌های تراکنشی در سطح روت‌های ۵‌گانه REST، اعمال قید نسخه در اسکیما (`migrations/004_wave1_version_seq.sql`)، بررسی OCC نسخه، ایزولاسیون دو نمونه روی دیتابیس مشترک (`tests/wave1-multi-instance.js` با ۳۳ تست)، و گیت جامع ۳۵‌گانه `tools/wave1-gate.js`.
2. **پیاده‌سازی Chat3 (PR #47):** تمرکز بر مسیر همگام‌سازی دسته‌ای (`sync.js`)، اتصال صف‌های آفلاین، سازوکار سلامت و لایه‌های Fallback ردیس.

### حکم معماری و نقشه حل تعارض (Conflict Resolution Map)
- **منبع واحد حقیقت (Single Source of Truth):** هر دو پیاده‌سازی در `main` ادغام شده‌اند. PostgreSQL تنها مرجع حقیقت است (`isPostgres() === true`).
- **مسیر خوانش (Read Seam):** تمامی متدهای خوانش پروداکشن از طریق `db.readCollection()` و `db.readOne()` به جداول PostgreSQL متصل می‌شوند.
- **مسیر نوشتن (Write Seam):** تمامی روت‌های `attendance`، `classes`، `grades`، `students` و `users` از تراکنش‌های اتمیک `persistOpsBatch()` استفاده می‌کنند. در صورت بروز خطای پایگاه داده یا تعارض نسخه (OCC Conflict)، خطا فوراً به کلاینت منعکس شده (کدهای ۴۰۹ و ۵۰۳) و از هرگونه اعمال تغییر در حافظه محلی جلوگیری می‌شود.
- **همگام‌سازی دوطرفه (Two-Phase Sync):** همگام‌سازی در `server/sync.js` ابتدا اسنپ‌شات تهیه کرده، تراکنش را در PostgreSQL ثبت می‌کند و تنها پس از موفقیت قطعی دیتابیس، کش محلی به‌روزرسانی شده و شناسه‌های پردازش‌شده (`server_processed_uids`) ذخیره می‌شوند.
- **ایزولاسیون کامل در محیط Production (Fail-Closed):** اگر متغیر `NODE_ENV=production` یا `PAYESH_ENV=production` باشد اما `DATABASE_URL` تنظیم نشده باشد، سرور با کد خطای ۱ متوقف شده (`process.exit(1)`) و به هیچ وجه با حافظه موقت بالا نمی‌آید. فلگ `ALLOW_MEMORY_FALLBACK=1` صرفاً برای محیط‌های توسعه و تست محلی است و در پروداکشن بی‌اثر است.

---

## ۲. اینونتوری کامل Fallbackهای حافظه‌ای/JSON (Mission C1-04)

جدول جامع تمام مسیرهای خواندن و نوشتن fallback در لایه سرور:

| ردیف | مسیر / تابع | فایل و خط | وضعیت در Dev/Test | وضعیت در Production | مالک |
|:---:|---|---|---|---|:---:|
| ۱ | `backingStorePolicy` / بررسی محیط | `server/db.js:101-135` | مجاز با فلگ صریح | **مسدود (Fail-Closed)** | Core / Chat1 |
| ۲ | `init()` پایگاه داده | `server/db.js:150-185` | fallback به `memory` | **خطای بحرانی + exit(1)** | Core / Chat1 |
| ۳ | گیت راه‌اندازی و Listen سرور | `server/index.js:145-165, 1194-1225` | بوت سریع محلی | **انتظار برای DB + خروج در غیاب PG** | Core / Chat1 |
| ۴ | حلقه ذخیره‌سازی دوره‌ای فایل JSON | `server/index.js:1230-1250` | فعال هر ۲ ثانیه | **غیرفعال در حالت PG-mode** | Core / Chat1 |
| ۵ | خوانش کالکشن `readCollection` | `server/db.js:290-330` | خوانش از `memoryStore` | **اجرای مستقیم SQL SELECT از PG** | Reads / Chat2 |
| ۶ | خوانش تک‌رکورد `readOne` | `server/db.js:335-355` | جستجو در آرایه رم | **اجرای SELECT با قید id در PG** | Reads / Chat2 |
| ۷ | نوشتن دسته‌ای `persistOpsBatch` | `server/db.js:460-580` | اعمال روی حافظه | **تراکنش کامل BEGIN...COMMIT در PG** | Writes / Chat3 |
| ۸ | بررسی شناسه ایدمپوتانت `isUidProcessed` | `server/db.js:370-410` | جستجو در Set حافظه | **بررسی جدول server_processed_uids** | Sync / Chat3 |
| ۹ | خروج اضطراری و هیدراتاسیون | `tools/reseed-from-pg.js:1-50` | دستی برای تست | **تولید فایل ایزوله از مرجع دیتابیس** | Ops / Chat10 |

---

## ۳. شواهد اجرای آزمون‌ها و تایید سخت‌گیرانه (Mission C1-03)

تمامی آزمون‌های مرتبط با موج ۱ روی درخت کاری بدون هیچ‌گونه دور زدن یا ادعای بدون مدرک اجرا و تأیید شدند:

### الف) گیت اختصاصی موج ۱ (`tools/wave1-gate.js`)
- **دستور:** `node tools/wave1-gate.js`
- **خروجی:**
  ```text
  ▸ Wave 1 gate — static: 19/19 checks passed
  ▸ Wave 1 gate — behavioral suites:
    ✅ tests/wave1-multi-instance.js (0.4s)
    ✅ tests/sync-atomic-batch.js (0.1s)
    ✅ tests/sync-queue-caps.js (3.4s)
    ✅ tests/tombstone.js (0.9s)
    ✅ tests/occ.js (0.7s)
    ✅ tests/server7.js (5.7s)
    ✅ tests/session-revocation.js (3.1s)
    ✅ tests/security2.js (4.2s)
    ✅ tests/audit.js (0.0s)
    ✅ tests/server15.js (23.2s)
    ✅ tests/server18.js (6.2s)
    ✅ tests/check-authz.js (0.3s)
    ✅ tests/api/runner.js (4.2s)
    ✅ tests/smoke.js (49.4s)

  جمعِ گیت: 35 موفق، 0 ناموفق
  🟢 GATE GREEN — Wave 1 P0 verified.
  ```
- **کد خروج (Exit Code):** `0`

### ب) آزمون دو نمونه هم‌زمان روی یک دیتابیس (`tests/wave1-multi-instance.js`)
- **دستور:** `node tests/wave1-multi-instance.js`
- **سناریو:** ایجاد دو اپلیکیشن مجزا (A و B) با حافظه‌های مستقل متصل به بک‌اند مشترک SQL (آزمون `write A → read B → update B → read A` و رفتار تعارض ۴۰۹ و رول‌بک کش در قطعی دیتابیس).
- **نتیجه:** **۳۳ از ۳۳ موفق (0 ناموفق)**
- **کد خروج:** `0`

### ج) آزمون‌های خوانش و نوشت Wave 1
1. `node tests/wave1-reads.js`: **۱۸ از ۱۸ موفق** (کد خروج 0)
2. `node tests/wave1-writes.js`: **۱۵ از ۱۵ موفق** (کد خروج 0)
3. `node tests/wave1-writes-mutations.js`: **۵ از ۵ جهش کشته شد** (کد خروج 0)
4. `node tests/sync-atomic-batch.js`: **۲۲ از ۲۲ موفق** (کد خروج 0)
5. `node tests/occ.js`: **۱۸ از ۱۸ موفق** (کد خروج 0)
6. `node tests/tombstone.js`: **۲۵ از ۲۵ موفق** (کد خروج 0)

### د) آزمون جامع دود و ساختار پروژه
1. `node tests/run.js`: **۳۵ از ۳۵ موفق** (کد خروج 0)
2. `node build.js --check`: **تطبیق کامل و بیت‌به‌بیت** (کد خروج 0)
3. `node tests/secret-scan.js`: **۱۲ از ۱۲ سبز** (کد خروج 0)
4. `node tools/migrate-helper.js --check`: **۱۲ مهاجرت معتبر و متوالی** (کد خروج 0)
5. `node tools/reza-mirror-check.js`: **۲۱ از ۲۱ آینه زنده برابر** (کد خروج 0)
6. `node tests/smoke.js`: **۵۴۷ از ۵۴۷ موفق** (کد خروج 0)

---

## ۴. به‌روزرسانی اسناد حاکمیتی و ردیاب‌ها

1. **`docs/P0_BLOCKER_TRACKER.md`:**
   - مانع `پ0-۱: ادغام نهایی موج ۱ — پستگرس تنها منبع حقیقت` به وضعیت **✅ رفع‌شده (کامل)** تغییر یافت.
   - گام‌های ۵‌گانه مسیر رفع به‌طور ۱۰۰٪ (۵/۵) تکمیل شدند.
   - آمار کلی موانع به ۱ رفع‌شده، ۴ در حال رفع و ۱ مسدود ارتقا یافت (پیشرفت: ۱۷ از ۳۰ گام = ۵۶.۷٪).

2. **`docs/NATIONAL_ROADMAP_PROGRESS.md` و `reza/NATIONAL_ROADMAP_PROGRESS.md`:**
   - ردیف Wave 1 از حالت 🟡 به **✅ کامل** به‌روزرسانی شد و مدارک آزمون و ادغام PRها ثبت گردید.

3. **`docs/daily-mission-boards/2026-09-17/Chat1.md`:**
   - مأموریت‌های `C1-02`، `C1-03` و `C1-04` با ثبت مدارک و استناد به این گزارش علامت تحویل گرفتند.

---

## ۵. نتیجه‌گیری و وضعیت نهایی

موج ۱ مهندسی پایش (PostgreSQL as Source of Truth - P0) با موفقیت کامل پیاده‌سازی، راستی‌آزمایی و تثبیت شد. پروژه اکنون آمادگی ورود به مراحل بعدی شامل آزمون‌های بار استیجینگ (P0-2) و آزمون‌های بازیابی فاجعه (P0-3) را دارد.
