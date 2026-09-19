# گزارش ممیزی متخاصم و صدور رأی قطعی رد تیم فاز ۷.۶-R.1
## Phase 7.6-R.1 — Zero-Trust Independent Runtime Re-Certification Report

**سازمان ممیزی:** هیئت مستقل رد تیم، مهندسی قابلیت اطمینان سیستم‌های توزیع‌شده و بازرسی جرائم فنی PostgreSQL 17  
**موضوع ممیزی:** ارزیابی مستقل و بدون اعتماد کامیت `b49b69050015655b7e664a18f2a14e96771eb31f`  
**مخزن:** `https://github.com/rezaa2544/p2` (شاخه `main`)  
**محیط آزمایشگاهی:** Debian 13 (Trixie), Node.js v20.20.2, PostgreSQL 17.11 (پورت ۵۴۳۲), Redis 8.0.2 (پورت ۶۳۷۹)  
**تاریخ ممیزی:** ۲۹ شهریور ۱۴۰۵ (19 September 2026)  
**حکم نهایی قطعی و صلب:** **🔴 NOT VERIFIED**

---

## تابلوی حکم اجرایی (Final Executive Verdict)

```text
╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║                 PHASE 7.6-R.1 RED TEAM FINAL CERTIFICATION VERDICT                 ║
║                                                                                    ║
║                   حکم قطعی ممیزی متخاصم:  🔴 NOT VERIFIED                          ║
║                                                                                    ║
║  با وجود تلاش برای اصلاح DDL مایگریشن ۰۲۰ و افزودن توابع به Authority Layer،         ║
║  مایگریشن ۰۲۰ به دلیل ارجاع به جدول ناموجود governance_ledger_store روی PostgreSQL  ║
║  با خطای مرگبار Exit Code 3 متوقف می‌شود. ابزار production-verifier.sh شکست خورده،  ║
║  توابع جدید لایه Authority در مسیر درخواست‌های زنده فاقد Caller بوده، ثبت Audit    ║
║  با .catch(() => {}) بلعیده می‌شود و پرچم ALLOW_MEMORY_FALLBACK الزامات تولید را   ║
║  دور می‌زند. سامانه فاقد هرگونه صلاحیت ورود به فاز تولید کشوری است.                ║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

---

## ۱. راستی‌آزمایی کامیت و تغییرات پایگاه کد (Gate 0: Commit Reality)

### شواهد ثبتی گیت
```bash
git rev-parse HEAD
# b49b69050015655b7e664a18f2a14e96771eb31f

git ls-remote origin main
# b49b69050015655b7e664a18f2a14e96771eb31f    refs/heads/main

git diff dfcfe71e..b49b690 --stat -- server migrations tests tools
```

### آمار تفکیکی تغییرات نسبت به آخرین کامیت ممیزی‌شده رد تیم (`dfcfe71e`):
```text
 migrations/020_operator_identity_fix.down.sql |  35 ++++++--
 migrations/020_operator_identity_fix.sql      |  34 +++++++-
 server/cache.js                               |   2 +-
 server/infrastructure/authority/index.js      | 111 +++++++++++++++++++-------
 server/infrastructure/change-management.js    |   6 ++
 server/infrastructure/phase6-canary-engine.js |  50 +++++++++++-
 server/rate-limit.js                          |   2 +-
 server/redis.js                               |   8 +-
 tests/server17.js                             |  12 ++-
 tools/production-verifier.sh                  |   0 (mode change)
 tools/test-discovery-verifier.sh              |   0 (mode change)
 11 files changed, 206 insertions(+), 54 deletions(-)
```

### پاسخ به پرسش‌های چهارگانه Gate 0:
1. **چند خط واقعی در `server/` تغییر کرده است؟**  
   مجموعاً **۱۷۹ خط افزوده و ۴۲ خط کاسته** شده است (شامل بازنویسی `server/infrastructure/authority/index.js`، تغییرات جزئی در `server/rate-limit.js`، `server/redis.js` و اتصال متدهای لاگ در `phase6-canary-engine.js`).
2. **چند migration واقعی تغییر کرده است؟**  
   دقیقاً **۲ فایل** (`migrations/020_operator_identity_fix.sql` و نسخه `.down.sql` آن).
3. **آیا ادعای Migration 020 در کامیت واقعاً وجود دارد؟**  
   بله، فایل‌ها بر روی دیسک ویرایش شده‌اند اما دارای خطای مرگبار ارجاع به جدول ناموجود هستند (شرح در Gate 7).
4. **آیا تغییرات فقط مستندات هستند؟**  
   خیر؛ بر خلاف کامیت قبلی (`7db2b474`) که صرفاً Markdown بود، در این کامیت کدهای واقعی در `server/` و `migrations/` دستکاری شده‌اند.

---

## ۲. کالبدشکافی سیم‌کشی لایه مرجعیت در رانتایم (Gate 1: Authority Runtime Wiring)

هیئت ممیزی رد تیم چهار تابع هدف در لایه Authority را به صورت خط‌به‌خط ردیابی کرد:

| نام تابع | محل تعریف | فراخوان‌کننده مستقیم (Caller) | فراخوان‌کننده بالادستی (Caller-of-Caller) | مدخل HTTP و رفتار رانتایم | وضعیت تأیید |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **`authority.getCanaryState`** | `server/infrastructure/authority/index.js:32` | `Phase6CanaryEngine.getCanaryState` (`line 824`) | **فاقد فراخوان‌کننده (Zero Callers)!** | مسیر HTTP در `server/index.js:801` تابع `routeRequestSoT` را صدا می‌زند که مستقیماً `SELECT * FROM phase6_canary_configs` می‌زند و هرگز `getCanaryState` را فراخوانی نمی‌کند. | 🔴 **FAIL (کد مرده)** |
| **`authority.assertTenantPolicy`** | `server/infrastructure/authority/index.js:55` | **فاقد فراخوان‌کننده (Zero Callers)!** | **فاقد فراخوان‌کننده!** | هیچ روتی در سرور این تابع را صدا نمی‌زند. میدلور سرور مستقیماً `assertTenantBoundary` در `phase6-production-hardening.js` را اجرا می‌کند. | 🔴 **FAIL (کد مرده)** |
| **`authority.verifyAndRecordGovernanceNonce`** | `server/infrastructure/authority/index.js:47` | `Phase6CanaryEngine.assertGovernanceApproval` (`line 732`) | `setTrafficWeight` (`line 275`) | `POST /api/v1/system/canary/weight` در `server/routes/system.js:1900` | 🟢 **PASS** |
| **`authority.appendSystemAudit`** | `server/infrastructure/authority/index.js:51` | `logAudit` (`line 784`) و `persistChange` (`line 54`) | `setTrafficWeight` و `recordChangeRequest` | خطای نوشتن در Audit با `.catch(() => {})` بلعیده می‌شود. | 🔴 **FAIL (نقض ایمنی)** |

> **قاعده صلب ممیزی:** وجود تابع در ماژول بدون اتصال به درخت روت‌های پروداکشن، به عنوان «کد مرده» (Dead Code) تلقی شده و مردود است.

---

## ۳. آزمون زنده سقوط ردیس و رفتار Fail-Closed (Gate 2: Redis Kill Test)

### سناریوی آزمون تزریق خرابی در رانتایم
- تنظیم متغیرهای محیطی:
  `NODE_ENV=production`, `PAYESH_ENV=production`, `DATABASE_URL=postgres://...`, `REDIS_URL=redis://127.0.0.1:6379`
- ارسال سیگنال مرگ به ردیس: `pkill -9 redis-server`
- ارسال درخواست زنده به سرور از طریق `rateLimit.checkRateLimit`:

```javascript
// دستور اجرا:
const res = await rateLimit.checkRateLimit({ prefix: 'otp', identifier: '09121111111', limit: 5, windowSeconds: 60 });
```

### خروجی عینی ترمینال:
```text
Redis initialized. isAlive: false
Step 1 (Redis alive): { allowed: true, remaining: 4, reset: 60, limit: 5 }
Step 2: Killing Redis...
Step 3: Checking rate-limit with Redis dead...
VULNERABILITY FAIL_OPEN: { allowed: true, remaining: 3, reset: 59, limit: 5 }
```

### تحلیل امنیتی رد تیم:
1. در فایل `server/redis.js` خط ۵۵۹، تابع `incrByWithTtl` در زمان قطع ارتباط با ردیس به متغیر محلی `memCache` در RAM پروسه سوییچ می‌کند.
2. ماژول `server/rate-limit.js` استثنا صادر نمی‌کند و مقدار `{ allowed: true, remaining: 3 }` را برمی‌گرداند.
3. در `server/redis.js` خط ۳۸، متغیر `ALLOW_MEMORY_FALLBACK` تعبیه شده است:
   ```javascript
   const ALLOW_MEMORY_FALLBACK = process.env.ALLOW_MEMORY_FALLBACK === '1' || process.env.ALLOW_MEMORY_FALLBACK === 'true';
   const IS_PRODUCTION = !ALLOW_MEMORY_FALLBACK && (process.env.NODE_ENV === 'production' || ...);
   ```
   تنظیم این متغیر در محیط پروداکشن باعث بی‌اثر شدن `IS_PRODUCTION` شده و سد امنیتی ریت‌لیمیتر را کاملاً باز (Fail-Open) می‌گذارد.  
   **حکم: 🔴 FAIL.**

---

## ۴. اسکن متخاصم و کالبدشکافی حافظه فرار (Gate 3: RAM Authority Forensics)

دستور اسکن جامع متخاصم:
```bash
grep -RniE "new Map|new Set|memCache|fallback|_nationalTrafficWeights|activeReservations|changeRegistry|_nationalRegionStore|_provincialStateStore|this.clusters" server/
```

### طبقه‌بندی وضعیت‌های درون حافظه:

| نام متغیر / ماژول | فایل و خط | طبقه‌بندی | ریسک در مقیاس ملی |
| :--- | :--- | :---: | :--- |
| `_nationalTrafficWeights` | `server/infrastructure/national-traffic-fabric.js:49` | 🔴 **Forbidden Authority** | نگهداری اوزان مسیریابی در RAM؛ در صورت کرش پاک می‌شود. |
| `memCache` / `memExpiry` | `server/redis.js:31-34` | 🔴 **Forbidden Authority** | جعل وضعیت ردیس در RAM؛ سوراخ امنیتی ریت‌لیمیتر. |
| `localFallbackRateLimits` | `server/cache.js:41` | 🔴 **Forbidden Authority** | ریت‌لیمیتر موضعی در RAM که بین نمونه‌ها همگام نیست. |
| `changeRegistry` | `server/infrastructure/change-management.js:40` | 🔴 **Forbidden Authority** | ثبت تغییرات در حافظه فرار. |
| `activeReservations` | `server/infrastructure/national-capacity-enforcement.js:46` | 🔴 **Forbidden Authority** | ذخیره رزرو ظرفیت مدارس در حافظه پروسه. |
| `_nationalRegionStore` | `server/infrastructure/national-region-control-plane.js:169` | 🔴 **Forbidden Authority** | ذخیره وضعیت کلاسترهای استانی در RAM. |
| `_provincialStateStore` | `server/infrastructure/provincial-pilot-scaling.js:371` | 🔴 **Forbidden Authority** | وضعیت پایلوت در RAM. |
| `this.clusters` | `server/infrastructure/phase6-canary-engine.js:133` | 🟡 **Cache with Stale Window** | دارای پنجره ۵۰ میلی‌ثانیه‌ای که مانع استعلام زنده می‌شود. |
| `metrics.series` | `server/metrics.js:111` | 🟢 **Telemetry** | مجاز (آمار پنجره لغزان پرومتئوس). |
| `chains` | `server/ids.js:21` | 🟢 **Mutex** | مجاز (میوتکس پروسه محلی). |

---

## ۵. آزمون همزمانی چند سرور و واگرایی حالت (Gate 4: Multi-Instance Split-Brain)

- **روش آزمایش:** اجرای دو پروسه مستقل سرور متصل به پایگاه داده مشترک PostgreSQL 17 و اعمال تغییر وزن ترافیک کلاستر تهران از ۱۰۰ به ۵۰ در سرور الف.
- **مشاهده رانتایم:**
  - سرور الف بلافاصله وزن ۵۰ را اعمال کرد.
  - سرور ب در درخواست‌های همزمان به دلیل گارد `if (!force && this._sotCacheAt && (Date.now() - this._sotCacheAt) < 50) return;` در خط ۱۸۶ فایل `phase6-canary-engine.js`، استعلام دیتابیس را نادیده گرفت و درخواست‌ها را با وزن قدیمی ۱۰۰ هدایت کرد.
  - پس از ری‌استارت هر دو پروسه، وضعیت از دیتابیس بازیابی شد؛ اما در زمان ترافیک بالا (۱۰,۰۰۰ req/sec)، پنجره ۵۰ میلی‌ثانیه‌ای منجر به واگرایی صدها درخواست می‌گردد.

---

## ۶. راستی‌آزمایی دفاع در برابر بازپخش نانس (Gate 5: Governance Replay)

- **شواهد آزمایشگاهی:**
  - ارسال نخست درخواست حاکمیتی با کلید Ed25519 و نانس `gate5-replay-...`: پاسخ `200 OK`.
  - استعلام مستقیم از جدول پایگاه داده:
    ```sql
    SELECT nonce, signature_hash FROM phase6_replay_ledger WHERE nonce = 'gate5-replay-...';
    -- نتیجه: دقیقاً ۱ ردیف درج شد.
    ```
  - ارسال مجدد همان بسته با همان نانس: پاسخ با کد ۴۰۳ و خطای `REPLAY_ATTACK_DETECTED`.
  - تخریب کامل پروسه و ارتباط (`kill -9`) و راه‌اندازی نمونه جدید: درخواست بازپخش مجدداً با خطای ۴۰۳ مسدود گردید.
  - **حکم: 🟢 PASS (گارد ضد بازپخش نانس در دیتابیس پایدار است).**

---

## ۷. واقعیت لاگ‌های ممیزی سیستم و بلعیدن خطاها (Gate 6: System Audit Reality)

- **استعلام ردیف‌های `system_audit`:**
  با اعمال تغییرات قناری، تعداد ردیف‌ها از ۰ به ۳ افزایش یافت.
- **🔴 نقص امنیتی بحرانی (Silent Failure Swallowing):**  
  در خط ۷۸۹ فایل `server/infrastructure/phase6-canary-engine.js`:
  ```javascript
  if (authority.attached()) {
    await authority.appendSystemAudit({ ... }).catch(() => {});
  }
  ```
  و در خط ۵۷ فایل `server/infrastructure/change-management.js`:
  ```javascript
  await authority.appendSystemAudit({ ... }).catch(() => {});
  ```
  خطای درج در جدول ممیزی با الگوی ممنوعه `.catch(() => {})` بلعیده می‌شود! در صورتی که دیتابیس به دلیل قفل یا قطعی موقت نتواند رکورد ممیزی را ثبت کند، عملیات تغییر ساختار بدون ثبت هیچ ردی در سیستم با موفقیت اعمال می‌شود که نقض صریح ممیزی‌پذیری سازمانی است.  
  **حکم: 🔴 FAIL.**

---

## ۸. شکست قطعی مایگریشن ۰۲۰ روی پایگاه داده خام (Gate 7: Migration 020)

### سناریوی آزمون هسته‌ای روی دیتابیس تمیز PostgreSQL 17
```bash
psql -h 127.0.0.1 -U postgres -d test_gate7_db -v ON_ERROR_STOP=1 -f migrations/020_operator_identity_fix.sql
```

### خروجی خام ترمینال (Terminal Proof):
```text
psql:migrations/020_operator_identity_fix.sql:22: ERROR: relation "governance_ledger_store" does not exist
Exit code: 3
```

### خروجی در زمان بازگشت (`.down.sql`):
```text
psql:migrations/020_operator_identity_fix.down.sql:16: ERROR: relation "governance_ledger_store" does not exist
Exit code: 3
```

### تحلیل متخاصم خطای ساختاری:
نویسنده کامیت `b49b690` برای رفع خطای قبلی، دستور `ALTER TABLE governance_ledger` را به دستور زیر تغییر داده است:
```sql
ALTER TABLE governance_ledger_store 
    ALTER COLUMN operator TYPE VARCHAR(128) USING operator::VARCHAR(128);
```
در حالی که در کل پایگاه داده و در تمام مایگریشن‌های ۰۰۱ تا ۰۱۹، **هیچ جدولی به نام `governance_ledger_store` وجود ندارد!**  
شیء `governance_ledger` یک **VIEW** بر روی جدول `phase6_replay_ledger` است. اجرای این مایگریشن روی هر پایگاه داده خام پروداکشن بلافاصله با کد خروج ۳ شکست خورده و رول‌بک می‌شود.  
**حکم: 🔴 BLOCKER (شکست در استقرار دیتابیس).**

---

## ۹. بررسی صداقت تست‌های خودکار مخزن (Gate 8: Test Honesty)

| فایل تست | خروجی رانتایم | تعداد تست‌های واقعی | وضعیت |
| :--- | :--- | :---: | :---: |
| `tests/migration-sequence.js` | بررسی گارد ساختار دیسک | ۱۹ تست ساختاری | 🟢 سبز |
| `tests/migrate-pg-constraints.js` | اینوارینت‌های DDL دیتابیس | ۱۴ تست اینوارینت | 🟢 سبز |
| `tests/server17.js` | تست یکپارچگی احراز هویت | ۷۰ تست | 🟡 سبز (با دور زدن CA) |
| `tests/smoke.js` | تست‌های رابط کاربری | ۰ تست (کرش نود) | 🔴 خطای ناسازگاری jsdom |
| `tools/production-verifier.sh` | ارزیابی گیت‌های T1 تا T7 | شکست در T1 | 🔴 کرش به علت مایگریشن ۰۲۰ |
| `tools/test-discovery-verifier.sh` | اسکریپت جدید کشف تست‌ها | شکست در گام دوم | 🔴 کرش در فراخوانی `smoke.js` |

> **واقعیت آماری پوشش تست:**  
> دستور رسمی `npm test` تنها ۲ فایل (`tests/run.js` و `tests/smoke.js`) را اجرا می‌کند و **۵۶۱ فایل تست دیگر مخزن کاملاً دور زده می‌شوند**. ادعای پاس شدن ۵۶۳ فایل آزمون در اسناد فاز ۷.۵ جعل آماری بوده و واقعیت خارجی ندارد.

---

## ۱۰. بازرسی پسرفت امنیتی TLS (Gate 9: Security Regression)

در فایل `tests/server17.js` خط ۶۰:
```javascript
diff --git a/tests/server17.js b/tests/server17.js
@@ -57,7 +57,7 @@ function req(method, port, p, body, cookie, mod) {
-      rejectUnauthorized: true,
+      rejectUnauthorized: false,
```
- **تحلیل رد تیم:** این تغییر در کلاینت تست اعمال شده تا گواهینامه‌های خودامضاشده بدون اعتبارسنجی CA پذیرفته شوند. اگرچه این تغییر در فایل تست است و تنظیمات سرور پروداکشن را مستقیماً تغییر نداده، اما اعتبارسنجی واقعی زنجیره اعتماد TLS را در پایپ‌لاین آزمون خنثی ساخته است.

---

## ۱۱. فهرست بلوکرهای بحرانی و توالی اصلاحات الزامی (Blockers & Exact Next Sequence)

### فهرست ۴ بلوکر مسدودکننده استقرار سراسری:
1. **BLOCKER 1 (Migration 020 Crash):** ارجاع به جدول ناموجود `governance_ledger_store` در فایل‌های `020_operator_identity_fix.sql` و `.down.sql`.
2. **BLOCKER 2 (Redis Fail-Open Rate Limiter):** سوییچ به `memCache` در RAM پروسه هنگام قطعی ردیس و باز ماندن سد ترافیک با `{ allowed: true }`.
3. **BLOCKER 3 (Orphaned Authority Functions):** عدم فراخوانی `authority.getCanaryState` و `authority.assertTenantPolicy` در روت‌های واقعی سرور.
4. **BLOCKER 4 (Audit Log Error Swallowing):** استفاده از `.catch(() => {})` در زمان ثبت ممیزی حاکمیتی و قناری.

### توالی دقیق اقدامات اصلاحی برای مهندسین اصلاح (Fix Engineers):
1. **گام اول (اصلاح مایگریشن ۰۲۰):** حذف خط `ALTER TABLE governance_ledger_store` از فایل‌های ۰۲۰؛ زیرا `governance_ledger` یک View روی `phase6_replay_ledger` است و ستون `operator` در آن به صورت `NULL::text AS operator` تعریف شده و نیاز به تغییر DDL ندارد.
2. **گام دوم (Fail-Closed صلب ردیس):** حذف کامل سوییچ به `memCache` در تابع `incrByWithTtl` هنگامی که `IS_PRODUCTION` فعال است و صدور خطای قطعی `REDIS_UNAVAILABLE` با وضعیت ۵۰۳؛ همچنین حذف امکان دور زدن با `ALLOW_MEMORY_FALLBACK` در تولید.
3. **گام سوم (سیم‌کشی واقعی لایه Authority):** متصل کردن مستقیم `server/index.js` و `routeRequestSoT` به `authority.getCanaryState()` و الزام فراخوانی `authority.assertTenantPolicy()` در گارد درخواست‌ها.
4. **گام چهارم (رفع بلعیدن خطای ممیزی):** حذف `.catch(() => {})` از فراخوانی‌های `appendSystemAudit` و ایجاد تراکنش صلب که در صورت شکست ثبت لاگ، عملیات تغییر وزن قناری را نیز ملغی (Rollback) کند.

---

## حکم نهایی ممیزی متخاصم (Final Determination)

# 🔴 NOT VERIFIED

هیئت مستقل رد تیم ورود سامانه ملی پایش به **Phase 8 Production Hardening** را مجدداً رسماً **وتو** می‌نماید.  
سامانه تا زمان اجرای توالی اصلاحات چهارگانه فوق و اثبات موفقیت آن‌ها در آزمون‌های رانتایم، پایگاه داده و تزریق خرابی، فاقد شرایط پایداری و امنیت تولید است.
