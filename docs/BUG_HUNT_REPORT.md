# گزارش باگ‌هانت — نشست ۱ (چت ۵: مهندس ادغام و رفع خطا)

**تاریخ:** ۲۰۲۶-۰۹-۱۰ (پنجشنبه — همان روزی که باگ پنجشنبهٔ قبلی در آن می‌ترکید)
**مبنا:** `main @ 351bd10` (مرج PR #45) · **شاخهٔ کار:** `arena/01a08a9c-p2`
**قاعده:** با رجوع به `SKILLS_MASTER.md` — هر باگ اول با پروب زنده/تست رگرسیون بازتولید شد، بعد رفع؛ هیچ تستی حذف/ضعیف نشد (موارد اصلاح‌شده همگی قوی‌تر شدند).

---

## ۱. گیت‌های اولیه روی درخت تمیز (پیش از هر تغییر)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | ✅ ۵۴۷/۵۴۷ |
| `node tools/check-authz.js` | ✅ تطبیق کامل / ۰ ناهمخوانی |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ |
| `node build.js --check` | ✅ سبز |

## ۲. رگرسیون کامل (`scripts/run-all-tests.sh`)

- اجرا روی مبنا آغاز شد؛ نتیجهٔ نهایی: **۲۴۲ سوئیت سبز / ۳ قرمز** در ۲۰۴۴ ثانیه (جزئیات هر سوئیت در لاگ اجرای رانر).
- هر ۳ قرمز **پیش‌موجود روی HEAD تمیز** بودند (زمان اجرا ۰۹:۳۲، پیش از اولین ویرایش ۰۹:۳۸) و هر ۳ در همین نشست رفع و سبز شدند (BUG-6).
- راستی‌آزمایی پس از رفع‌ها: سوئیت‌های لمس‌شده + همسایه‌ها تک‌تک سبز (فهرست در §۵).

| سوئیت قرمز پیش‌موجود | علت | وضعیت نهایی |
|---|---|---|
| `workdays` (۵/۶) | W2 تاریخِ اجرا («امروز») را شنبه فرض می‌کرد — پنجشنبه/جمعه قرمز | ✅ ۶/۶ (تاریخ ثابت + پوشش جمعه) |
| `wave13-security` (۱۶/۱۷) | لنگر S6a مسیر غلط و حذف‌شدهٔ `actions-baseline` را می‌خواست | ✅ ۱۷/۱۷ |
| `wave20-arena5` (۲۱/۲۲) | CIN-1 ماتریس سه‌نسخه می‌خواست ولی main عمداً `[22.x]` است | ✅ ۲۲/۲۲ |

## ۳. جدول باگ‌ها

| شناسه | عنوان | شدت | وضعیت | شاهد |
|---|---|---|---|---|
| BUG-1 | مرخصی آخر هفتهٔ خوابگاه جمعه→شنبه می‌ساخت به‌جای پنجشنبه→جمعه (هر ۷ روز هفته) + دودی همان فرمول غلط را آینه می‌کرد | P1 | ✅ رفع‌شده | پروب زندهٔ ۷ روزه + `tests/dorm-leave-dates.js` (پیش از رفع ۰/۲۱) |
| BUG-2 | عملیات‌های ردیس در تولید روی خطای زمان اجرا بی‌صدا به حافظهٔ محلی می‌افتادند (واگرایی state حیاتی بین نمونه‌ها) | P1 | ✅ رفع‌شده | `tests/redis-prodfail.js` (پیش از رفع: نقش a ‏۴/۱۶، نقش c ‏۹/۲۱) |
| BUG-3 | خودبه‌روزرسانی کاربر در REST سیاست فقط-مدیر مدل را دور می‌زد (تغییر phone/national_id/active/status خود بدون راستی‌آزمایی) | P1 | ✅ رفع‌شده | USR6 پیش از رفع ۲۰۰ می‌گرفت به‌جای ۴۰۳ |
| BUG-4 | نوشتن حضور/نمره در REST بایند دبیر→کلاس را اعمال نمی‌کرد (هر دبیری هر رکورد مدرسه) | P1 | ✅ رفع‌شده | ATT6/GRD6 پیش از رفع ۲۰۱ می‌گرفتند به‌جای ۴۰۳ |
| BUG-5 | نمونه‌بردار tracing فقط NODE_ENV را می‌خواند؛ با PAYESH_ENV=production نمونه‌برداری ۱۰۰٪ به‌جای ۱۰٪ | P2 | ✅ رفع‌شده | SMP-sel جدید پیش از رفع قرمز (۳۱/۳۲) |
| BUG-6 | سه سوئیت قرمز پیش‌موجود روی main (قراردادهای کهنه/وابسته‌به‌تاریخ، §۲) | P2 | ✅ رفع‌شده | هر ۳ در رگرسیون مبنا قرمز بودند، حالا سبز |

### موارد مشکوک/در انتظار (رفع نشد — نیازمند تصمیم معماری یا Wave مالک)

| شناسه | عنوان | شدت | وضعیت | توضیح |
|---|---|---|---|---|
| SUSPECT-A | شکست آینهٔ PG در sync با موفقیت به کلاینت گزارش می‌شود (`server/sync.js` ~L851، در خود کد مستند است) | P0 | ⏳ در انتظار Wave 1 | امروز از دست‌رفتگی نیست (حافظه SoT است)؛ در برش PG باید تراکنشی/خطا شود |
| SUSPECT-B | دو پرچم تولید ناهماهنگ: گیت ردیس `NODE_ENV`، گیت TLS ‏`PAYESH_ENV` (استقرارِ فقط-PAYESH_ENV فال‌بک حافظه می‌گیرد) | P1 | ⏳ در انتظار Wave 15 | توصیه: یکپارچه‌سازی روی یک پرچم در ران‌بوک استقرار (+ این نشست فقط tracing را دوپرچمه کرد) |
| SUSPECT-C | `.catch(()=>{})` روی `markProcessedUid`/`invalidateCollection` در حلقهٔ apply سینک (بهترین-تلاش، بی‌صدا) | P2 | ⏳ ثبت‌شده | با BUG-2 حالا در تولید روی خطای ردیس می‌پراند و بلعیده می‌شود؛ راه‌حل کامل = جدول idempotency در PG (Wave 1/2) |

### موارد بررسی‌شده و سالم (باگ نیستند)

- `nextId` محلی `sync.js` (max+1): فاز apply بدون await است، پس در تک‌فرایند مسابقه نیست؛ چندنمونه‌ای بدون PG هم پشتیبانی نمی‌شود (P0-13).
- نگاشت `(getDay()+1)%7` در ۱۰+ ماژول، `schoolDays` (حذف ۴/۵ = پنجشنبه/جمعه)، `STAFF_ATT_WDAYS`، محاسبهٔ جمعهٔ دمو — همه درست.
- گیت‌های REST بقیهٔ مسیرها (students/classes/attendance-del) با مدل یکسان‌اند؛ فقط users/grades/attendance-write شکاف داشتند (رفع شد).
- فیکس باگ پنجشنبهٔ مولد دمو (ویو ۲۰) پابرجاست: دودی در خودِ پنجشنبه ۵۴۷/۵۴۷ سبز.

## ۴. رفع‌ها (هر رفع = یک کامیت)

| کامیت | باگ | تغییر | تست رگرسیون |
|---|---|---|---|
| `23206c7` | BUG-1 | `src/js/19-actions-dorm.js`: لنگر پنجشنبه (۴) + اصلاح انتظار دودی (تقویت با weekday صریح) + بازبیلد `index.html` | `tests/dorm-leave-dates.js` — ‏۲۱/۲۱ (۷ روز هفته) |
| `582ced6` | BUG-5 | `server/tracing.js`: بررسی `PAYESH_ENV` پیش از `NODE_ENV` (حفظ لنگر M1) | SMP-sel جدید + جهش M6 — ‏۶/۶ کشته |
| `78da091` | BUG-3 | `server/routes/users.js`: `users.upd` فقط-مدیر (403 برای غیرمدیر حتی روی خود) | USR6 (منفی) + USR7 (مثبت) در `tests/api/users.test.js` — ‏۷/۷ |
| `4895f51` | BUG-4 | `server/routes/{attendance,grades}.js`: بایند دبیر→کلاس با همان `inScope` سینک (۵ مسیر نوشتن) | ATT6/GRD6 — ‏۶/۶ هر دو |
| `4f57c77` | BUG-2 | `server/redis.js`: گاردهای `prodRethrow`/`prodNoRedis` روی ۱۲ عملیات (توسعه بی‌تغییر بایت‌به‌بایت) | `tests/redis-prodfail.js` — ‏۵۰/۵۰ (۳ نقش: پرتاب-در-تولید/حفظ-توسعه/چرخهٔ قطع‌وبهداشتگی) |
| +۳ کامیت | BUG-6 | `tests/workdays.js` (تاریخ ثابت)، `tests/wave13-security.js` (لنگر درست ZAP + نبود مسیر غلط)، `tests/wave20-arena5.js` + سند آرنا ۵ (ماتریس 22.x) | همان سوئیت‌ها: ۶/۶، ۱۷/۱۷، ۲۲/۲۲ |

## ۵. راستی‌آزمایی پس از رفع (تک‌تک، بدون تداخل)

- گیت‌ها: smoke ‏۵۴۷/۵۴۷ · check-authz ‏۰ · secret-scan ‏۱۱/۱۱ · build --check ✅
- سوئیت‌های لمس‌شده/همسایه: `dorm-leave-dates` ‏۲۱/۲۱ · `tracing-sampling` ‏۳۲/۳۲ · `tracing-mutations` ‏۶/۶ · `tests/api/runner.js` ‏۷/۷ سوئیت · `occ` ‏۱۸/۱۸ · `redis-fallback` ‏۱۰/۱۰ · `redis-key-audit` ‏۱۷/۱۷ · `rate-limit-distributed` ‏۹/۹ · `otp-redis` ‏۱۶/۱۶ · `lock-atomic` ‏۱۲/۱۲ · `otp-ratelimit` ‏۴۹/۴۹ · `workdays` ‏۶/۶ · `wave13-security` ‏۱۷/۱۷ · `wave20-arena5` ‏۲۲/۲۲
- ⚠️ یک اجرای میانی `otp-ratelimit` (۴۱/۴۹) هم‌زمان با رگرسیون پس‌زمینه روی پورت ثابت تداخل کرد (سناریوی مستند false-red در سربرگ رانر)؛ اجرای تمیز پس از پایان رگرسیون: **۴۹/۴۹** ✅ (تغییر BUG-2 در مد توسعه بی‌اثر اثباتی است — گاردها فقط با `NODE_ENV=production` فعال‌اند و این سوئیت آن را ست نمی‌کند).

## ۶. Push

- شاخه: `arena/01a08a9c-p2`
- تأییدیهٔ `git ls-remote origin arena/01a08a9c-p2`:
  `c834461095b49c189a4d242d92771784c10e0982` = HEAD ✅ (۹ کامیت، ۲۰۲۶-۰۹-۱۰)

## ۷. Ruflo

- `bug_hunt_session1 = completed` در حافظهٔ مشترک ثبت شد (اگر کرش: قید می‌شد — نشد).

---

# گزارش باگ‌هانت — نشست ۲ (چت ۵: مهندس ادغام و رفع خطا)

**تاریخ:** ۲۰۲۶-۰۹-۱۰ · **مبنا:** `arena/01a08a9c-p2 @ b287628` (پایان نشست ۱) · **شاخهٔ کار:** `arena/01a08a9c-p2`
**مأموریت:** (۱) رفع هر ۳ مظنون نشست ۱ · (۲) آدیت تازهٔ موج ۴ (push/pull) · (۳) آدیت تازهٔ موج ۷ (صف کلاینت/IDB) — هر باگ: تست-اول-قرمز + رفع + کامیت جدا.
**قاعده:** با رجوع به `SKILLS_MASTER.md` — هیچ تستی حذف/ضعیف نشد؛ رفتارهای پین‌شده (B8، T2، M13، Q4، P0-13) همه حفظ شدند.

## ۱. گیت‌های اولیه روی درخت تمیز (پیش از هر تغییر)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | ✅ ۵۴۷/۵۴۷ |
| `node tools/check-authz.js` | ✅ تطبیق کامل / ۰ ناهمخوانی |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ |
| `node build.js --check` | ✅ سبز |

## ۲. رگرسیون کامل (`scripts/run-all-tests.sh`)

- نتیجهٔ نهایی: **۳۴۳ سوئیت سبز / ۰ قرمز** در ۲۰۸۵ ثانیه (خلاصه در `/tmp/all-tests.log`؛ خطوط `GREEN`/`TOTAL`/`DONE`). رگرسیون تمیزِ کامل — هیچ قرمزی برای تحلیل نماند.
- هر ۱۱ تست تازهٔ این نشست در رگرسیون سبز بودند (هر یک در دو لاین).
- `tests/integration.js` پس از رگرسیون جداگانه اجرا شد (پورت ثابت — بدون تداخل): **۱۲/۱۲** ✅

## ۳. جدول باگ‌ها

| شناسه | عنوان | شدت | وضعیت | شاهد |
|---|---|---|---|---|
| SUSPECT-C | خطاهای `markProcessedUid`/`invalidateCollection` در حلقهٔ apply با `.catch(()=>{})` بلعیده می‌شد (در تولید با گاردهای BUG-2 واقعی‌اند) | P2 | ✅ رفع‌شده | `tests/sync-cache-errors.js` پیش از رفع ۵/۷ (C4/C5 قرمز) |
| SUSPECT-A | شکست آینهٔ PG برای کلاینت کاملاً نامرئی بود (۲۰۰+ok) در حالی که خوانش PG و حافظه ناهمگام می‌ماند | P1 | ✅ رفع‌شده (پرچم مرئی؛ برش تراکنشی همچنان Wave 1) | `tests/sync-mirror-visible.js` پیش از رفع ۵/۶ (M2 قرمز) |
| SUSPECT-B | دو پرچم تولید ناهماهنگ (`NODE_ENV` گیت ردیس، `PAYESH_ENV` گیت TLS) بی‌صدا رفتار readiness/health را عوض می‌کرد | P1 | ✅ رفع‌شده (هشدار بلند + قانون متعارف؛ یکپارچه‌سازی کامل همچنان Wave 15) | `tests/env-flags.js` پیش از رفع: ماژول نبود (کرش) |
| S2-1 | uid تکراری درون یک دسته همیشه دو بار اعمال می‌شد + مسابقهٔ TOCTOU بین دسته‌های هم‌زمان (بررسی در اعتبارسنجی، ثبت بعدتر، بدون بازبینی) | P2 | ✅ رفع‌شده (ادعای اتمیک در حلقهٔ بی-await؛ توزیع‌شده = Wave 6) | پروب زنده (۲ رکورد + مسابقهٔ نامتقارن ۳ رکورد) + `tests/sync-dup-claim.js` پیش از رفع ۱/۷ |
| S2-2 | `op.at` عقب‌کشیده (<۲۴h) گارد روز مجازی را دور می‌زد — بدون بلوک و بدون audit ؛ نامرئی کامل | P2 | ✅ رفع‌شده (ردِّ `sync_virtual_day_offline_allow`؛ رفتار مجاز/مسدود بی‌تغییر، آفلاین مشروع حفظ) | پروب زنده (کنترل مسدود شد، جعل ok گرفت) + `tests/sync-virtualday-audit.js` پیش از رفع ۶/۷ |
| S2-3a | حذف REST (`softDelete`) سنگ‌قبر دلتا نمی‌گذاشت — pull فقط `__deleted_records` را می‌خواند؛ کلاینت‌ها (حتی بوت‌استرپ ادغامی) حذف را هیچ‌وقت نمی‌دیدند (رکورد شبح ابدی) | P2 | ✅ رفع‌شده (پل سنگ‌قبر در تک‌گلوگاه هر ۵ حذف REST) | `tests/pull-rest-delete.js` پیش از رفع ۴/۶ (`deleted: []`) |
| S2-3b | `eraseUserData` (فراموشی GDPR) بی‌سنگ‌قبر پاک می‌کرد — دادهٔ «فراموش‌شده» روی IndexedDB کلاینت‌ها می‌ماند (فراموشی ناقص) | P2 | ✅ رفع‌شده (سنگ‌قبر سبک برای سطرهای idدار) | `tests/gdpr-tombstones.js` پیش از رفع ۲/۴ |
| W7-1 | قلم `sending` هیچ مسیر بازگشتی نداشت: کرش وسط ارسال = چسبندگی ابدی + «همگام» دروغین (گم‌شدن بی‌صدا)؛ پاسخ ناقص سرور هم درون جلسه می‌چسباند | P1 | ✅ رفع‌شده (احیا در `loadQueue` + جاروی پس‌ازدسته) | `tests/sync-sending-revive.js` پیش از رفع ۱/۷ (`statuses=sending,sending`) |
| W7-2 | `lastSync` («آخرین همگام‌سازی موفق») پس از هر اجرا جلو می‌رفت حتی با صفر همگام (تازگی دروغین در پنل) | P3 | ✅ رفع‌شده (پیشروی فقط با ≥۱ همگام واقعی) | `tests/sync-lastsync.js` پیش از رفع ۶/۸ (L1/L3 قرمز) |
| W7-3 | صف مرده فقط «حذف» داشت: قلم دفنِ گذرا (قطعی مکرر/سقف — داده‌ای که سرور هرگز ندیده) هیچ مسیر بازگشتی نداشت | P2 | ✅ رفع‌شده (دکمهٔ «تلاش دوباره» + اکشن `sync-retry`) | `tests/sync-dlq-retry.js` پیش از رفع: اکشن نبود |
| W7-4 | `saveLog` هنگام شکست Store اگر IDB در دسترس بود هشدار «حافظه پر» را سرکوب می‌کرد — با فرض تور نجاتی که فقط-نوشتنی است و مسیر بازگشت ندارد (ویرایش‌ها فقط RAM → بستن تب = فقدان بی‌صدا) | P2 | ✅ رفع‌شده (شکست Store همیشه بلند) | `tests/storage-full-honest.js` پیش از رفع ۵/۷ (F4/F5 قرمز) |

### موارد مشکوک/باقی‌ماندهٔ ثبت‌شده (رفع نشد — نیازمند تصمیم Wave مالک)

| شناسه | عنوان | شدت | وضعیت | توضیح |
|---|---|---|---|---|
| S2-R1 | سقف ۵۰۰۰ سنگ‌قبر دلتا بی‌صدا قدیمی‌ها را حذف می‌کند؛ کلاینت با کرسر قدیمی‌تر حذف‌ها را ناقص می‌گیرد (رستاخیز) بدون هیچ سیگنال full-resync | P2 | 📝 طرح ثبت شد | رفع درست = شمارندهٔ نسل/کف سنگ‌قبر + wipe امن سمت کلاینت (با حفظ pending) — wipe عجولانه از خود باگ بدتر است؛ نیازمند طراحی Wave 5 |
| W7-R1 | استور `sync_queue` در IDB و آینهٔ entities عملاً فقط-نوشتنی‌اند (بازیابی بوت از لاگ/صف localStorage است؛ مهاجرت به IDB ناتمام) | P3 | 📝 ثبت شد | یکپارچه‌سازی روی IDB (ناهمگام) یا سیم‌کشی restore = کار معماری Wave |
| S2-R2 | بستن کامل جعل `op.at` (امضای اقدام/پنجرهٔ سخت) | P3 | 📝 ثبت شد | با W7-4/S2-2 جعل حالا ردِّ پا دارد؛ بستن کامل مشروعیت آفلاین چندروزه را می‌شکند — تصمیم محصول |
| S2-R3 | ادعای idempotency توزیع‌شدهٔ چندنمونه‌ای (claim پیش‌از-apply با NX) | P3 | 📝 ثبت شد | S2-1 تک‌نمونه را بست؛ `setNX` ردیس «داشتیم/قطع» را یکی می‌کند — نیازمند API کش جدید (Wave 6) |

### موارد بررسی‌شده و سالم (باگ نیستند)

- **OCC:** کلاینت `base_version` را فقط برای همان ۳ مجموعهٔ `VERSIONED` سرور می‌فرستد (`_VERSIONED_C` هر دو یکسان) — پوشش یکسان، بدون شکاف.
- **`version-vector.js` (موج ۴):** چنین فایلی/زیرسیستمی در ریپو نیست — بردارساعت نداریم؛ OCC نسخه‌محور همان نقش را دارد. فهرست فایل مأموریت برای این بخش نامعتبر بود.
- **Skew در pull دلتا:** کرسر `since` پژواک `server_time` است (ساعت سرور) — ساعت کلاینت اصلاً دخیل نیست؛ تنها سطح skew همان `op.at` بود (S2-2).
- **`bump(rec)` در REST:** `updated_at` می‌زند (`occ.js`) پس آپدیت‌های REST در دلتا دیده می‌شوند؛ create هم `created_at` دارد.
- **قطعی وسط ارسال (تکهٔ در حال پرواز):** ابهام با idempotency سمت سرور حل می‌شود (`duplicate_ignored` → synced)؛ `sendChunked` نتایج تکه‌های موفق را نگه می‌دارد + W7-1/W7-3 تور بازگشت کامل کردند.
- **بلع `.catch(()=>{})` روی نوشتن‌های IDB:** درست است — آینهٔ بهترین-تلاش هرگز نباید برنامه را بشکند (W7-4 فقط سرکوب هشدار لایهٔ اصلی را بست).
- **حذف مجموعه‌های ناشناخته در pull:** فقط نام‌های واقعاً ناشناخته (تایپی) می‌افتند؛ کلاینت نام‌های ثابت معتبر می‌فرستد — دست‌نخورده ماند (پیشنهاد ۴۰۰ برای Wave 5).
- **`ins` با id موجود (upsert):** با `inScope` روی رکورد هدف fail-closed است؛ `upd` به ناشناس بی‌اثرِ همگراست — دست‌نخورده.

## ۴. رفع‌ها (هر رفع = یک کامیت)

| کامیت | باگ | تغییر | تست رگرسیون |
|---|---|---|---|
| `4da4cab` | SUSPECT-C | `server/sync.js`: audit شدن `sync_idempotency_mark_failed`/`sync_invalidate_failed` با try/catch داخلی (پاسخ بی‌تغییر) | `tests/sync-cache-errors.js` — ۷/۷ |
| `b4858ae` | SUSPECT-A | `server/sync.js`: پرچم افزایشی `mirror_failed` در پاسخِ شکست آینه (شکل موفق بایت‌به‌بایت) | `tests/sync-mirror-visible.js` — ۶/۶ |
| `dc08f99` | SUSPECT-B | `server/env-flags.js` تازه (خالص) + هشدار بوت در `index.js` + قانون «هر دو production» در `DEPLOY.md` §۳ (رفتار بوت بی‌تغییر) | `tests/env-flags.js` — ۱۱/۱۱ (با بوت زندهٔ PORT=0) |
| `5f904b8` | S2-1 | `server/sync.js`: ادعای اتمیک uid در صدر حلقهٔ apply (بدون await) + `duplicate_ignored` روی ورودی متناظر | `tests/sync-dup-claim.js` — ۷/۷ |
| `7a15afa` | S2-2 | `server/sync.js`: هلپر خالص `virtualDayOfflineBasis` + audit تصمیم مؤثر-بر-واگرایی (لنگر M13 نخورد) | `tests/sync-virtualday-audit.js` — ۷/۷ |
| `d431182` | S2-3a | `server/delete-service.js`: سنگ‌قبر سبک دلتا با همان مهر/سقف/اسکوپ مسیر sync | `tests/pull-rest-delete.js` — ۶/۶ |
| `9eba338` | S2-3b | `server/gdpr.js`: سنگ‌قبر سبک برای سطرهای پاک‌شدهٔ idدار (پیوند مرکب بی‌id: آگاهانه هیچ) | `tests/gdpr-tombstones.js` — ۴/۴ |
| `9cee4bd` | W7-1 | `src/js/27-sync.js`: احیای sending→pending در `loadQueue` + جاروی پس‌ازدسته + بازبیلد باندل | `tests/sync-sending-revive.js` — ۷/۷ |
| `dd4dcd9` | W7-2 | `src/js/27-sync.js`: شمارش `syncedN` و پیشروی مشروط `lastSync` + بازبیلد | `tests/sync-lastsync.js` — ۸/۸ |
| `a5efbaa` | W7-3 | `src/js/27-sync.js`: اکشن `sync-retry` + دکمهٔ «تلاش دوباره» در سطر DLQ + بازبیلد | `tests/sync-dlq-retry.js` — ۷/۷ |
| `19419fa` | W7-4 | `src/js/03-persistence.js`: حذف شاخهٔ سرکوب IDB — شکست Store همیشه بلند + بازبیلد | `tests/storage-full-honest.js` — ۷/۷ |

## ۵. راستی‌آزمایی پس از رفع (تک‌تک، بدون تداخل)

- گیت‌ها: smoke ‏۵۴۷/۵۴۷ · check-authz ‏۰ · secret-scan ‏۱۱/۱۱ · build --check ✅ · `tests/api/runner.js` ‏۷/۷ سوئیت · `tests/integration.js` ✅ (پس از رگرسیون)
- همسایه‌های سرور: `sync-atomic-batch` ‏۲۲/۲۲ (B8 حفظ شد) · `sync-chunk` ‏۲۸/۲۸ · `sync-chunk-mutations` ‏۵/۵ · `sync-atomic-batch-mutations` ‏۵/۵ · `sync-queue-caps` ‏۳۶/۳۶ · `wave4-sync` ‏۱۱/۱۱ · `server6` ‏۹/۹ (گارد مجازی) · `server-mutations` ‏۲۰/۲۰ (M13 زنده) · `server17` ‏۷۰/۷۰ (T2 حفظ شد) · `redis-fallback` ‏۱۰/۱۰ · `server13` ‏۹/۹ · `tombstone` ‏۲۵/۲۵ · `wave8-outbox` ‏۱۴/۱۴ · `security2` ‏۲۵/۲۵ · `server7` ‏۱۵/۱۵
- همسایه‌های کلاینت: `sync-queue-caps-mutations` ‏۵/۵ · `idb-persistence` ‏۱۶/۱۶ · `idb-persistence-mutations` ‏۳/۳
- هر ۱۱ تست تازه: ‏۷۷/۷۷ سبز (۷+۶+۱۱+۷+۷+۶+۴+۷+۸+۷+۷)

## ۶. Push

- شاخه: `arena/01a08a9c-p2`
- تأییدیهٔ `git ls-remote origin arena/01a08a9c-p2`:
  `f595ffc338c3c692a0adddc86939176fe5cf9eac` = HEAD ✅ (۱۲ کامیت، ۲۰۲۶-۰۹-۱۰ — پس از اتصال دوبارهٔ GitHub در ابتدای نشست ۳ پوش شد)
- (یادداشت زمانی: در پایان نشست ۲ توکن سندباکس منقضی بود و پوش ناممکن؛ همین ۱۲ کامیت در گام ۱ نشست ۳ بی‌تغییر پوش شدند.)

## ۷. Ruflo

- ثبت نشد: `ruflo memory` در سندباکس کرش می‌کند (`memory allocation of 4158883080 bytes failed`)؛ سوابق در همین گزارش + HANDOFF + کامیت‌هاست.

---

# گزارش باگ‌هانت — نشست ۳ (چت ۵: مهندس ادغام و رفع خطا)

**تاریخ:** ۲۰۲۶-۰۹-۱۰ · **مبنا:** `arena/01a08a9c-p2 @ f595ffc` (پایان نشست ۲، پوش‌شده) · **شاخهٔ کار:** `arena/01a08a9c-p2`
**مأموریت:** (۱) پوش ۱۲ کامیت نشست ۲ · (۲) آدیت موج ۱۰ (`server/db.js`: رپلیکا/pool) و موج ۱۱ (`server/cache.js`/`redis.js`: کش/ابطال) — هر باگ: تست-اول-قرمز + رفع + کامیت جدا.
**قاعده:** با رجوع به `SKILLS_MASTER.md` — هیچ تستی حذف/ضعیف نشد؛ پین‌های D3c/W9-C/ریت‌لیمیت/P0-13 همه حفظ شدند.

## ۱. گیت‌های اولیه روی درخت تمیز (پیش از هر تغییر)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | ✅ ۵۴۷/۵۴۷ |
| `node tools/check-authz.js` | ✅ تطبیق کامل / ۰ ناهمخوانی |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ (پس از جابه‌جایی آشغالِ ruflo — §۵) |
| `node build.js --check` | ✅ سبز |

## ۲. رگرسیون کامل (`scripts/run-all-tests.sh`)

- نتیجهٔ نهایی: **۲۶۱ سوئیت سبز / ۱ قرمز** در ۲۰۲۸ ثانیه (خلاصه در `/tmp/all-tests.log`).
- تنها قرمز (`env-flags`، E10) **false-red تحت بار** است: بوت فرزندِ توسعه زیر رقابت کامل لاین‌های موازی از ۱۵ ثانیه گذشت؛ اجرای تمیز بلافاصله پس از رگرسیون **۱۱/۱۱ در ~۳ ثانیه** ✅ — همان کلاسِ false-red نشست ۱ (otp-ratelimit). برای سختی، تایم‌اوت به ۲۵ ثانیه رسید (کامیت جدا، بدون تغییر assertion).
- هر ۴ سوئیت تازهٔ این نشست در رگرسیون سبز بودند؛ `tests/api/runner.js` ‏۷/۷ و `tests/integration.js` ‏۱۲/۱۲ پس از رگرسیون جداگانه سبز شدند.

## ۳. جدول باگ‌ها

| شناسه | عنوان | شدت | وضعیت | شاهد |
|---|---|---|---|---|
| S3-1 | هر خطای queryRead — حتی SQL بدِ نامرتبط (42P01) — مسیریابی رپلیکا را برای همیشه می‌خواباند و هیچ بازگشتی نبود (برخلاف پرماری)؛ منفعت موج ۱۰ بی‌صدا از دست می‌رفت | P2 | ✅ رفع‌شده (طبقه‌بندی خطا + کاوش خودکار بازگشت؛ fallback و D3c سرِ جا) | پروب زنده (`isReplicaActive: true→false` با 42P01) + `tests/db-replica-recovery.js` پیش از رفع: کرش (درز نبود) |
| W11-2 | ابطال مدرسه/سراسری فقط L2 کاربرانِ حاضر در L1 همان نمونه را پاک می‌کرد؛ ورودی خالص-L2 (پس از LRU/ری‌استارت) تا ۵ دقیقه کهنه می‌ماند — از جمله بوت‌استرپ تنزل‌یافته | P2 | ✅ رفع‌شده (epoch ابطال مدرسه+سراسری، پاکت L2، اعتبارسنجی در خوانش؛ legacy پذیرفته می‌شود؛ کلیدها در ممیزی ثبت شدند) | پروب زنده (پس از invalidateSchool خوانشِ کهنه برگشت) + `tests/cache-l2-epoch.js` پیش از رفع ۵/۸ (E1/E4/E6 قرمز) |
| W11-3 | فال‌بک حافظهٔ `redis.set`: بازنویسی بی‌TTL انقضای قبلی را پاک نمی‌کرد (ردیس واقعی ماندگار می‌کند) + مدت رشته‌ای عددی نادیده گرفته می‌شد | P3 | ✅ رفع‌شده (پاک‌سازی انقضا + پذیرش مدت عددی؛ ورودی نامعتبر همان رفتار بی‌صدای قبلی) | `tests/redis-mem-ttl.js` پیش از رفع ۲/۵ (M1/M2/M3 قرمز) |

### موارد بررسی‌شده و سالم (باگ نیستند)

- **لاگ رپلیکا روی نوشتن:** نوشتن‌ها + خوانش‌های صحت (sync/pull/readCollection) همیشه پرماری‌اند (پین D4/D5)؛ فقط لیست‌های سنگین GET روی رپلیکا (لاگ eventualِ پذیرفته‌شده).
- **متریک‌های pool:** `healthCheck` خطا را برمی‌گرداند (نه بلع)؛ `poolStats` خوانش خالص است؛ D7/D8 سبز.
- **page+count در `executePagedList`:** دو خوانش جدا بدون تراکنش — روی پرماری و رپلیکا یکسان (ناهنجاری تازه‌ای از رپلیکا نمی‌آید)؛ `total` آگاهانه best-effort است.
- **نشت L1:** محدود است (سقف ۲۰۴۸ + LRU + TTL، موج ۹)؛ هرس منقضی پیش از تخلیه؛ W9-C سبز.
- **مسیرهای Pub/Sub:** خطا می‌پراند (→ audit ـ SUSPECT-C / fail-fast ـ P0-13) یا تحویل می‌دهد؛ بلع فقط روی callback مشترکِ خراب (درست) و parse پیام مسموم (درست).
- **`checkRateLimit` قدیمی (مسابقه get+set):** صدازنندهٔ اجرایی ندارد (همه روی `rate-limit.js` اتمیک‌اند) — کد مرده؛ دست‌نخورده (حذف در بک‌لاگ Wave).
- **stampede بوت‌استرپ:** نگهبان singleflight نیست — آگاهانه و خنثی از نظر صحت (فقط CPU)؛ بهینه‌سازی Wave.
- **فال‌بک حافظه:** جاروگر انقضا (۱۰ثانیه‌ای، unref) + همهٔ setهای کش EXدار؛ کلیدهای ماندگار واقعی (OTP doc، شمارنده revocation) همان‌طور طراحی شده‌اند.
- **`set` با mode نامعتبر/NX:** صدازننده ندارد؛ رفتار بی‌صدای قبلی برای ورودی نامعتبر حفظ شد.

## ۴. رفع‌ها (هر رفع = یک کامیت)

| کامیت | باگ | تغییر | تست رگرسیون |
|---|---|---|---|
| `6b04479` | S3-1 | `server/db.js`: طبقه‌بند `isReplicaQueryError` (22/23/42) + `scheduleReplicaReprobe` (آینهٔ پرماری) + سیم‌کشی در queryRead/ هندلر error/ init + درز تأخیر تست | `tests/db-replica-recovery.js` — ۱۱/۱۱ |
| `56b1124` | W11-2 | `server/cache.js`: epoch یکتای ابطال (مدرسه+سراسری، اولِ ابطال) + پاکت L2 + اعتبارسنجی خوانش + `tools/redis-audit.js`: ثبت کلیدهای epoch | `tests/cache-l2-epoch.js` — ۸/۸ |
| `f29f957` | W11-3 | `server/redis.js`: پاک‌سازی انقضا در بازنویسی بی‌TTL + پذیرش مدت رشته‌ای عددی در فال‌بک حافظه | `tests/redis-mem-ttl.js` — ۵/۵ |
| `9f59ae0` | — | سوئیت یکپارچگی موج ۱۱ (رفت‌وبرگشت، ابطال‌ها، ریت‌لیمیت، قفل، idempotency، فن‌اوت، آمار L1) | `tests/wave11-cache.js` — ۱۵/۱۵ |

## ۵. راستی‌آزمایی پس از رفع (تک‌تک، بدون تداخل)

- گیت‌ها: smoke ‏۵۴۷/۵۴۷ · check-authz ‏۰ · secret-scan ‏۱۱/۱۱ · build --check ✅ · `wave10-db-scale` ‏۲۶/۲۶ · `wave11-cache` ‏۱۵/۱۵
- همسایه‌ها: `wave1-reads` · `sync-atomic-batch` ‏۲۲/۲۲ · `wave9-performance` ‏۳۹/۳۹ (W9-C سرِ جا) · `redis-key-audit` ‏۱۷/۱۷ · `api/bootstrap` ‏۵/۵ · `sync-cache-errors` ‏۷/۷ · `redis-prodfail` ‏۳/۳ نقش · `otp-redis` ‏۱۶/۱۶ · `lock-atomic` ‏۱۲/۱۲ · `rate-limit-distributed` ‏۹/۹ · `redis-fallback` ‏۱۰/۱۰
- هر ۴ سوئیت تازه: ۳۹/۳۹ سبز (۱۱+۸+۵+۱۵)
- ⚠️ میانهٔ نشست secret-scan یک‌بار ۱۰/۱۱ قرمز شد: آشغالِ untracked دستورهای کرش‌کردهٔ `ruflo memory` در نشست ۲ (`.claude/proven-config.json` + `.claude-flow/*` — هش‌های sha256 پیکربندی، نه سکرت واقعی)؛ به `/tmp/ruflo-state-backup/` منتقل شد و گیت به ۱۱/۱۱ برگشت. حین جابه‌جایی مشخص شد `.claude/skills/` (از جمله `SKILLS_MASTER.md`) ترَک‌شده است — بلافاصله و بی‌تغییر بازگردانده شد (`git diff` خالی تأیید شد)؛ درس‌آموخته در HANDOFF ثبت شد.

## ۶. Push

- شاخه: `arena/01a08a9c-p2`
- تأییدیهٔ `git ls-remote origin arena/01a08a9c-p2`:
  `523c2df92c750535d30254392ea640d2dadf3273` = HEAD ✅ (۶ کامیت نشست ۳، ۲۰۲۶-۰۹-۱۰)

## ۷. Ruflo

- ثبت نشد (تکرار نشست ۲): `ruflo memory store` با `memory allocation of 4158883080 bytes failed` کرش می‌کند؛ سوابق در همین گزارش + HANDOFF + کامیت‌هاست. (آشغالِ untracked تازه‌ساخته‌شده‌اش هم به `/tmp/ruflo-state-backup/` منتقل شد.)

---

# گزارش باگ‌هانت — نشست ۴ (چت ۵: مهندس ادغام و رفع خطا)

**تاریخ:** ۲۰۲۶-۰۹-۱۰ · **مبنا:** `arena/01a08b3d-p2 @ 0801b40` (مرج ادغام نشست‌های ۱–۳) · **شاخهٔ کار:** `arena/01a08b3d-p2`
**مأموریت:** (۱) ادغام `arena/01a08a9c-p2` به‌صورت merge `--no-ff` با حفظ هر دو طرف · (۲) آدیت موج ۳ (query/performance: `server/dbquery.js` + مسیرهای v1) و موج ۷ (offline-first: `src/js/27-sync.js` + لایهٔ IndexedDB) — هر باگ: تست-اول-قرمز + رفع + کامیت جدا.

## ۱. ادغام (Step 1–3)

- `git fetch origin` + `git merge --no-ff` از `arena/01a08a9c-p2` (`779552c9`) روی `arena/01a08b3d-p2`؛ ۵ تعارض با «حفظ هر دو طرف» حل شد (HANDOFF اتحاد · `users.js` BUG-3 · `delete-service.js` سنگ‌قبر + `pgLive` · `sync.js` `mirrorFailed` + `pgLive` · `wave13-security.js` S6)؛ هیچ نشانِ تعارض نماند.
- مرج `0801b40` (والدین `a30fb20` + `779552c`) پوش و با `git ls-remote` تأیید شد.
- گیت‌های پس‌ازادغام: دودی **۵۴۷/۵۴۷** · مجوزها **۰** · نشت‌یاب **۱۱/۱۱** · بیلد‌چک ✅ · رانر API **۷/۷ سوئیت**.

## ۲. گیت‌های اولیهٔ نشست ۴ (پیش از رفع‌ها)

| گیت | نتیجه |
|---|---|
| `node tests/smoke.js` | ✅ ۵۴۷/۵۴۷ |
| `node tools/check-authz.js` | ✅ ۰ ناهمخوانی |
| `node tests/secret-scan.js` | ✅ ۱۱/۱۱ |
| `node build.js --check` | ✅ سبز |

## ۳. جدول باگ‌ها

| شناسه | عنوان | شدت | وضعیت | شاهد |
|---|---|---|---|---|
| W3-1 | صفحه‌بندی keyset نمرات روی `ORDER BY g.id DESC` همچنان `g.id > $n` می‌زد → هر صفحه ردیف‌های تکراری برمی‌گرداند (پیمایش ناپایدار) | P1 | ✅ رفع‌شده (جهت‌آگاه: `<` برای DESC) | `tests/wave3-keyset.js` پیش از رفع: تکرار ردیف در پیمایش |
| W3-2 | کرسر حضوروغیاب `id` تنها بود ولی مرتب‌سازی مرکب است (`date DESC, id ASC`) → `id > $n` همهٔ تاریخ‌های قدیمی‌تر را رد می‌کرد (پس از صفحهٔ ۱، داده نامرئی) | P1 | ✅ رفع‌شده (کرسر مرکب `date\|id` + گزارهٔ `date < $d OR (date = $d AND id > $i)`) | `tests/wave3-keyset.js` پیش از رفع: صفحات بعدی خالی/ناقص |
| W7-5 | مهاجرت IDB کلیدِ کهنهٔ `sms_queue_v1`/`payesh_sync_queue` را می‌خواند در حالی که صفِ واقعی زیر `sms_syncq_v1` است → صفِ معلق هرگز مهاجرت نمی‌کرد ولی پرچم «انجام شد» می‌شد (مهاجرت ناتمامِ بی‌بازگشت) | P2 | ✅ رفع‌شده (خواندن `sms_syncq_v1` نخست، فال‌بک کهنه) | `tests/idb-migration-queue.js` پیش از رفع: قلمِ واقعی غایب از IDB |
| W7-6 | قلم‌های `failed`‌شدهٔ جارویِ «پاسخِ ناقصِ سرور» (W7-1) بیرون از شمارش `bad` بودند → بدون backoffِ خودکار تا یک محرکِ بیرونی زمین‌گیر می‌ماندند | P2 | ✅ رفع‌شده (هر `failed`ِ باقی در صف backoff را زمان‌بندی می‌کند) | `tests/wave7-offline-queue.js` پیش از رفع: attempts=0 و autoTimer خالی |

### موارد بررسی‌شده و سالم (باگ نیستند)

- **نشت حافظهٔ صف:** سقف‌ها (P1-10) فعال و بسته‌اند — صف ≤۱۰۰۰ قلم / ≤۵MB، DLQ ≤۲۰۰، هرسِ قدمت فقط روی قلم‌های ترمینال (pending/sending هرگز). نشتی نیافتیم.
- **ساعتِ کج (clock skew):** کرسرِ pull دلتا پژواکِ `server_time` (ساعتِ سرور) است و سرور `sync_clock_skew` را آدیت می‌کند؛ `lastSync` روی ساعتِ کلاینت است (فقط نمایش، بی‌اثر بر داده). سطحِ skewِ داده‌ای همان `op.at` بود (S2-2، رفع‌شده).
- **بلع خطاها:** `.catch(()=>{})` روی نوشتن‌های آینهٔ IDB درست است (بهترین-تلاش نباید برنامه را بشکند) — همان نتیجه‌گیریِ ثبت‌شدهٔ نشست ۲.
- **`noteOpFailed` و قلمِ بدون `tries`:** اگر localStorage از نسخه‌ای پیش از فیلد `tries` قلم داشته باشد، `undefined + 1 = NaN` می‌شود و قلم هرگز به DLQ نمی‌رسد؛ مسیرِ تکرارپذیر در تولید نیست (همهٔ قلم‌ها با `tries:0` ساخته می‌شوند) — ثبت به‌عنوان سخت‌سازیِ اختیاری، رفع نشد.

## ۴. رفع‌ها (هر رفع = یک کامیت)

| کامیت | باگ | تغییر | تست رگرسیون |
|---|---|---|---|
| `5a2d69e` | W3-1, W3-2 | `server/dbquery.js`: `_finalize` جهت‌آگاه + `cursorKeyset`/`cursorKey` مرکب؛ `middleware/pagination.js`: پشتیبانی `order`/`composite`؛ `routes/grades.js` `order:'desc'` · `routes/attendance.js` `composite:true` | `tests/wave3-keyset.js` — ۱۳/۱۳ |
| `30dffb0` | W7-5 | `src/js/00-migration.js`: خواندن `sms_syncq_v1` نخست + فال‌بک کهنه + بازبیلد | `tests/idb-migration-queue.js` — ۵/۵ |
| `ed013a9` | W7-6 | `src/js/27-sync.js`: backoff خودکار برای هر `failed`ِ باقی در صف + بازبیلد | `tests/wave7-offline-queue.js` — ۷/۷ |

## ۵. راستی‌آزمایی پس از رفع (تک‌تک، بدون تداخل)

- گیت‌ها: دودی **۵۴۷/۵۴۷** · مجوزها **۰** · نشت‌یاب **۱۱/۱۱** · `build.js --check` ✅ · رانر API **۷/۷ سوئیت**.
- موج ۳: `wave3-query` **۱۳/۱۳** · `wave3-query2` **۱۳/۱۳** · `wave3-keyset` **۱۳/۱۳**.
- موج ۷: `wave7-offline-queue` **۷/۷** · `idb-migration-queue` **۵/۵** · همسایه‌ها: `sync-sending-revive` **۷/۷** · `sync-lastsync` **۸/۸** · `sync-dlq-retry` **۷/۷** · `sync-queue-caps` **۳۶/۳۶** · `idb-persistence` **۱۶/۱۶** · `idb-persistence-mutations` **۳/۳**.

## ۶. Push و PR نهایی

- شاخه: `arena/01a08b3d-p2` · ۳ کامیت نشست ۴ (به‌علاوهٔ مرج `0801b40`).
- دو مرجِ تازهٔ `origin/main` روی این شاخه (keep-both): `43ccaa4` (کار چت ۳/۴ — Wave 1 writes/WAF/observability؛ تعارض‌ها: cache.js، sync.js، attendance/grades، wave11-cache، wave20-arena5، HANDOFF، USER_GUIDE) و `4199971` (کار چت ۶ — اسناد §30؛ تعارض: فقط HANDOFF). به‌همراهِ `855c729` (تستِ virtualday-audit قطعی‌سازی شد — flakeِ وابسته به ساعت).
- **PR:** `fix(bug-hunt): 4 sessions of bug fixes (waves 3, 4, 7, 10, 11)` → **https://github.com/rezaa2544/p2/pull/52**
- وضعیت PR: `OPEN` · `MERGEABLE` · `CLEAN` — هر ۷ چک CI سبز (build 22.x · SAST · Secret scan · SCA · SBOM · DAST · WAF & nginx).
- تأییدیهٔ `git ls-remote origin arena/01a08b3d-p2`:
  `4199971dadfb561d9c41330c49822cea544dee52` = HEAD ✅

## ۷. Ruflo

- `bug_hunt_session4` = `"completed"` ✅ (ثبت با `CLAUDE_FLOW_MEMORY_PATH=/tmp/ruflo-unified CLAUDE_FLOW_DISABLE_BRIDGE=1`).
- `bug_hunt_pr_status` = `"ready-for-merge"` ✅ (همان env؛ تأیید با `memory get`).

---

# گزارش باگ‌هانت — نشست ۸ / Wave 9 Performance

**تاریخ:** ۲۰۲۶-۰۹-۱۱ · **مبنا:** `origin/main @ aaf3fab` · **شاخه:** `feat/bughunt-session8-wave9` · **آخرین code-fix HEAD:** `685f935`

این نشست با رجوع به `SKILLS_MASTER.md` و چرخهٔ اجباریِ قرمز→رفع→جهش انجام شد. هدف، حذف کار سنگین از مسیر درخواست، کنترل رشد حافظه/کش، و حفظ fail-closed و tenant isolation بود. گزارش کامل و ماتریس گیت‌ها در `docs/WAVE9_SESSION8_PERFORMANCE.md` است.

## گیت‌های ثبت‌شده

| گیت | شاهد |
|---|---|
| `node tests/smoke.js` | ✅ **۵۴۷/۵۴۷**؛ فقط هشدار شناخته‌شدهٔ jsdom برای `window.scrollTo` و هشدار engine محلی Node 20 در برابر نیازمندی >=22 |
| `node tools/check-authz.js` | ✅ exit 0؛ **۳۸۸** اکشن بررسی شد و تطبیق مجوز کامل بود |
| `node tests/secret-scan.js` | ✅ **۱۱/۱۱**؛ هیچ credential ثبت‌شده‌ای یافت نشد |
| `node build.js --check` | ✅ build/index/guide و authz هم‌گام |
| `node tests/wave8-outbox.js` | ✅ **۱۴/۱۴** |
| `node tests/wave8-outbox-mutations.js` | ✅ **۵/۵**؛ anchor جهش M3 در `685f935` با وضعیت red قبلی اصلاح شد |
| `node tests/wave9-performance.js` | ✅ **۳۹/۳۹** |
| `node tests/wave8-deep-audit.js` | ⚠️ فایل در repository وجود ندارد؛ اجرا `MODULE_NOT_FOUND` داد و سبز گزارش نشد |
| `scripts/run-all-tests.sh` | ⚠️ در پنجرهٔ ابزار به ماتریس نهایی نرسید؛ به‌علت runnerهای stale/هم‌پوشان متوقف شد و هیچ ادعای سبز کامل ثبت نمی‌شود |

## جدول رفع‌های نشست ۸

| شناسه | باگ | شدت | کامیت | شاهد رگرسیون / جهش |
|---|---|---|---|---|
| W9-S8-1 | GC timestampهای شیئی state داخلی را جمع نمی‌کرد؛ نشتِ تدریجی `__processed_uids`/`__revoked_jti` | P2 | `062fbe3` | `session8-gc` **۵/۵** · جهش **۲/۲** |
| W9-S8-2 | صف async audit سقف نداشت؛ audit burst می‌توانست heap را بی‌حد رشد دهد | P1 | `324eec8` | `session8-audit-queue` **۴/۴** · جهش **۲/۲** |
| W9-S8-3 | append ناموفق audit batch را دور می‌ریخت؛ از دست‌رفتن evidence | P1 | `8f45f54` | `session8-audit-flush` **۴/۴** · جهش **۲/۲** |
| W9-S8-4 | school index کش TTL و purge کامل membership/L2 نداشت | P1 | `d4fc168` | `session8-cache-index` **۶/۶** · جهش **۲/۲** |
| W9-S8-5 | گزارش عمومی meeting را در چند پیمایش محاسبه می‌کرد | P2 | `6035028` | `session8-public-report` **۴/۴** · جهش **۲/۲** |
| W9-S8-6 | enrichment کلاس برای هر کلاس `enrollments.filter` می‌زد؛ O(classes×enrollments) | P2 | `dd2d7eb` | `session8-classes-index` **۵/۵** · جهش **۲/۲** |
| W9-S8-7 | enrichment نمره برای هر نمره `subjects/users.find` می‌زد؛ اسکن خطی تکراری | P2 | `6aeb5ba` | `session8-grades-index` **۵/۵** · جهش **۲/۲** |
| W9-S8-8 | init/rotation async audit هنوز sync filesystem داشت و event loop را block می‌کرد | P1 | `e54b998` | `session8-audit-async-io` **۵/۵** · جهش **۲/۲** |

## وضعیت delivery و موارد باز

- ثبت Ruflo با کلید `bug_hunt_session8` انجام نشد: executable `ruflo` در sandbox نصب نیست و تلاش واقعی با exit 127 و `ruflo: command not found` برگشت؛ بنابراین memory store ساختگی ثبت نمی‌شود.
- با احراز هویت موقت، `feat/bughunt-session8-wave9` با موفقیت به GitHub push شد؛ remote دائمی بدون credential باقی ماند.
- PR ساخته شد: `https://github.com/rezaa2544/p2/pull/75` با عنوان `fix: bug hunt session 8 (wave 9 performance)`.
- fallback بدون credential نیز در `/home/user/bandle/bug-hunt-session8-wave9.bundle` نگه داشته و با `git bundle verify` معتبر شناخته شده است؛ ۲۴ patch جداگانه در `/home/user/bandle/patches/` قرار دارد.
- `tests/wave8-deep-audit.js` باید در یک commit/محیط بعدی ارائه شود؛ نبودن آن یک regression گیت است، نه یک pass.
- گزارش full regression ناقص است؛ redهای legacy در partial log به Session 8 نسبت داده نشده‌اند و بدون اجرای تمیز دوباره سبز اعلام نمی‌شوند.


---

## نشست ۹ — آدیتِ ادغام‌شده‌ها و شاخه‌های باز (PR #71 · #77 · #78) — ۲۰۲۶-۰۹-۱۱

**محدوده:** PR #71 (Delta Hardening Phase 4، ادغام‌شده در `main@7567607`) · PR #77 (ناوبریِ کیبورد/a11y، باز) · PR #78 (مانورِ واقعیِ WAL disk-full، باز).
**روش:** هر یافته با تستِ قرمزِ اول بازتولید شد، بعد رفع، بعد جهش‌آزمایی (تغییرِ شرط/حذفِ خط/شبیه‌سازیِ کرش).

| شناسه | یافته | شدت | محل | کامیت | شاهد رگرسیون / جهش |
|---|---|---|---|---|---|
| S9-1 | کرسرِ v2 داوریِ منطقه را **پیش از** تأییدِ HMAC برمی‌گرداند: توکنِ جعلیِ بی‌امضا با ادعایِ منطقهٔ دیگر «region_mismatch» می‌گرفت (نقضِ قراردادِ خودِ ماژول: signature first) و شمارندهٔ سلامتِ `payesh_cursor_region_mismatch_total` را بی‌هیچ امضایی جلو می‌بُرد | P2 | `server/cursor.js` | `1b6ae2d` | `bughunt-session9` A1–A7 · جهش M1/M2 |
| S9-2 | `negotiateEncoding` مقدارِ `q=0` و بزرگی/کوچکیِ حرف‌ها را نمی‌فهمید: `Accept-Encoding: gzip;q=0` (ردِ صریح) پاسخِ gzip می‌گرفت، `gzip;q=0, br` به brotli fallback نمی‌کرد و `GZIP` هیچ نمی‌گرفت | P2 | `server/compress.js` | `941e1b5` | B1–B6 · جهش M3 |
| S9-3 | فشرده‌سازیِ **سنکرون** روی مسیرِ داغِ pull: اندازه‌گیریِ واقعی ~۴٫۷ms به‌ازای هر مگابایت — برای دلتای واقعیِ ده‌ها مگابایتی صدها میلی‌ثانیه قفلِ کاملِ حلقهٔ رویداد در هر pull، و همهٔ درخواست‌های هم‌زمان پشتِ آن | P1 | `server/compress.js` · `server/pull.js` | `941e1b5` | C1/C6/C7 · جهش M4/M7 |
| S9-4 | زنجیرهٔ مودالِ تودرتو (دکمه‌ای درونِ مودال A که مودال B را باز می‌کند — همهٔ ۳۲ فراخوانِ `askConfirm` و مسیرهای `dorm-assign-pick`/`sub-del`/`hw-view`/`leave-new`) بازکنندهٔ فوکوس را با نابودیِ A از سند بیرون می‌انداخت ⇒ `document.contains` رد می‌کرد و فوکوس روی `<body>` سقوط می‌کرد (WCAG 2.4.3) | P3 | `src/js/18-modals.js` (PR #77) | `c469f70` — شاخهٔ `fix/a11y-modal-focus-s9` / PR #80 | `a11y-modal-focus` ۹/۹ · جهش ۵/۵ · `a11y-regressions` خودِ PR ۴۶/۴۶ دست‌نخورده |
| S9-5 | کلِ `HANDOFF.md` در PR #78 مو‌جی‌بِیک نوشته شده بود (UTF-8 → Windows-1256 → UTF-8): ۱۷۱۹ از ۱۹۵۶ خطِ فارسی ناخوانا و همهٔ ورودی‌های سشن‌های قبلی با نسخهٔ خراب جایگزین ⇒ با merge، دفترچهٔ تحویل برای همیشه از دست می‌رفت | P2 | `HANDOFF.md` (PR #78) | `767f2e0` — PR #81 | `handoff-integrity` ۴/۴ (پیش از رفع ۱/۴) |
| S9-6 | `bootstrap.sh` مانورِ WAL فهرستِ migrationها را hardcode کرده بود و فایلِ ناموجود را «skip (absent)» می‌کرد؛ پس از بازشماریِ ۰۰۴→۰۰۷ دو نام بی‌وجود شده بودند ⇒ مانور بدونِ ایندکس‌های wave3 و بدونِ ۰۰۵ «سبز» می‌شد. چکِ ایستایِ خودِ PR هم فقط *تعدادِ نام‌های ذکرشده در متن* را می‌شمرد. همچنین `WAL_MNT`/`PGDATA` از محیط می‌آمدند و هیچ گاردی پیش از `mount`/`rm -rf`/`chown -R` نبود | P1 | `infra/wal-drill/bootstrap.sh` (PR #78) | `767f2e0` — PR #81 | `wal-drill-bootstrap` ۷/۷ (پیش از رفع ۲/۷) · S5/S8/S9 تازه |
| S9-7 | حالتِ ایستایِ مستندِ `node tests/wal-disk-full.js --skip-live` با TDZ می‌مرد (`Cannot access 'finished' before initialization`) — چون `let finished` بعد از IIFE تعریف شده بود؛ یعنی چکِ آفلاینِ مانور هیچ‌وقت کار نکرده بود | P2 | `tests/wal-disk-full.js` (PR #78) | `767f2e0` — PR #81 | پیش از رفع: استک‌تریس بدونِ خروجی؛ پس از رفع: **۹/۱۴ + exit 2** |

**جهش‌آزماییِ نشست ۹ (`tests/bughunt-session9-mutations.js`):** ۷ جهشِ هدفمند — همه کشته؛ به‌علاوهٔ جاروبِ حذفِ تصادفیِ خط با بذرِ ثابت روی `compress.js`/`cursor.js`: **۱۵ از ۱۹ جهشِ معتبر (۷۹٪) کشته شد** (خطوطِ کامنتی و جهش‌های غیرقابل‌تجزیه از مخرج کنار گذاشته شدند؛ ۰ خطای محیطی).

### گیت‌های نشست ۹

| گیت | نتیجه |
|---|---|
| `node tests/bughunt-session9.js` | **۲۵/۲۵ ✅** |
| `node tests/bughunt-session9-mutations.js` | **۸/۸ ✅** (۷ هدفمند + جاروب) |
| `node tests/handoff-integrity.js` | **۴/۴ ✅** |
| `node tests/delta-phase4.js` (خودِ PR #71) | **۲۳/۲۳ ✅** |
| `node tests/delta-phase4-mutations.js` (لنگرهای M7/M16/M19 به‌روز شد) | **۲۰/۲۰ ✅** |
| `node tests/a11y-modal-focus.js` + `-mutations` (شاخهٔ PR #80) | **۹/۹ ✅** · **۵/۵ ✅** |
| `node tests/wal-drill-bootstrap.js` (شاخهٔ PR #81) | **۷/۷ ✅** |
| `node tests/wal-disk-full.js --skip-live` | ۹ ایستا + ۵ NOT-RUN · **exit 2** (طراحیِ خودِ فایل) |
| `node tests/smoke.js` | **۵۴۷/۵۴۷ ✅** (روی `bug-hunt-session9` و روی شاخهٔ #77) |
| `tools/check-authz.js` · `tests/secret-scan.js` | exit 0 · **۱۱/۱۱ ✅** |
| `node build.js --check` | ✅ |
| `tests/docs-consistency.js` · `security-findings-register-coverage.js` | ۲۳/۲۳ ✅ · ۵۱/۵۱ ✅ |
| `tests/docs-freeze-marker.js` | ⚠️ **۳ خطای پیش‌موجود روی `main`** — باگهانت نشست ۹ آن‌ها را نه ساخته و نه سبز اعلام می‌کند |

### وضعیتِ تحویلِ نشست ۹

- شاخهٔ کاریِ نشست روی `main@7567607`: `bug-hunt-session9` با ۴ کامیت (`98ebc54` تستِ قرمزِ اول · `1b6ae2d` S9-1 · `941e1b5` S9-2+S9-3 · `2be3fb4` سخت‌سازیِ تست/جهش/نگهبانِ دست‌آف).
- برای دو PR بازی که کدشان روی `main` نیست، رفع‌ها روی شاخهٔ خودشان نشست (قاعدهٔ keep-both): **PR #80** (`fix/a11y-modal-focus-s9` @ `c469f70`) روی `feat/a11y-keyboard-nav` و **PR #81** (`fix/wave19-wal-drill-s9` @ `767f2e0`) روی `feat/wave19-wal-drill-tmpfs`.
- `docs/SECURITY_FINDINGS_REGISTER.md` عمداً دست‌نخورده نماند: پیوستِ پس از قفل با شناسه‌های `اس‌اف-۰۳۸` تا `اس‌اف-۰۴۲` اضافه شد (بدنهٔ یخ‌زدهٔ `rc11` تغییر نکرد).
- باز: PR #74 (نشست ۷ من) هنوز open است؛ #76 (واریانتِ دیگرِ مانورِ WAL) بررسی نشد؛ S9-4 در PR #80 منتظرِ پذیرشِ نویسندهٔ #77 است.
