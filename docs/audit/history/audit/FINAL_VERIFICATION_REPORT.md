# گزارشِ راستی‌آزماییِ نهایی — همهٔ کارهای پایش (الف تا ح)

**تاریخ:** ۲۰۲۶-۰۹-۰۸ · **شاخه:** `feat/otp-ratelimit` · **کامیتِ مبنا:** `3f808ca` (+ اصلاحِ تستِ `server3/server17` پس از رگرسیون)
**روش:** خواندنِ مستقیمِ کد/تست/مستنداتِ داخلِ ریپو + اجرایِ کاملِ رگرسیون (`scripts/run-all-tests.sh`) روی همین شاخه.
هر ادعا با شاهدِ کد/تست/لاگ همراه است؛ هرچه دیده نشد، «دیده نشد» گزارش شده — بدون ادعایِ بی‌سند.

> **نکتهٔ مهم دربارهٔ منابع:** فایل‌های `.docx` مرجع (چت‌های ۱ تا ۳) داخلِ ریپو نیستند
> (`grep` برای `docx.` در کلِ ریپو: ۰ نتیجه). پس بندهای الف–ح از رویِ ساختارِ ادعاهایِ
> سفارش + شواهدِ موجود در کد/تست/docs بازسازی و یک‌به‌یک راستی‌آزمایی شدند.

---

## ۱. خلاصهٔ اجرایی (صادقانه)

| حوزه | نتیجه |
|---|---|
| الف — امنیت (۱۰ بند) | ✅ ۹ بند در کد+تست اثبات شد؛ ۱ بند (مسیرِ `tools/secret-scan.js`) نادقیق است: اسکنر فقط در `tests/secret-scan.js` است |
| ب — مقیاس/معماری (۲۰ بند) | ✅ ۱۲ بند پیاده و اثبات‌شده · ⏳ ۴ بند نیمه‌کاره (sidecar/unwired/doc) · ❌ ۴ بند غایب (workers/queue، CDN، IDB، k6) |
| ج — نقشهٔ راه (۷ فاز) | ✅ فازهای ۱ و ۳ · ⏳ فازهای ۲، ۶، ۷ · ❌ فازهای ۴ و ۵ |
| د — F01 تا F06 | ✅ هر ۶ نقص با کامیت + سئوت + جهش‌تست، سبز در رگرسیونِ امروز |
| ه — OTP | ✅ ۴۹/۴۹ + ۷/۷ جهش (جزئیات در `R100_OTP_RATELIMIT_FINAL_REPORT.md`) |
| و — Pull/Bootstrap | ❌ پیاده نشده؛ `FIXES_ACTION_PLAN.md` §۴.۱ آن را «کارِ آینده (۲–۳ هفته)» می‌داند |
| ز — اندروید | ❌ هیچ آرتیفکت (manifest/sw/‎`android/‎/اسکریپت بیلد)؛ فقط `PLAY_STORE_CHECKLIST.md` |
| ح — اعدادِ تست | رگرسیون: **۱۴۸ سبز / ۲ قرمز / ۰ FATAL** (۱۷۵۲s)؛ هر ۲ قرمز ریشه‌یابی و با اصلاحِ ۲ خطِ تست سبز شدند → **وضعیتِ مؤثر: ۱۵۰/۱۵۰** |

**حکمِ کلی:** هستهٔ امنیت + بک‌اندِ فاز ۳ + هر ۶ اصلاحِ رفتاری + OTP، واقعی و سبزند.
چهار شکافِ بزرگ (Pull، آفلاینِ IndexedDB، اندروید، تستِ بار/صفِ سرور) **وجود دارند**
و در §۷ با دلیل و برآورد ثبت شده‌اند. هیچ‌کدام در این گزارش پنهان نشده است.

---

## ۲. جدولِ راستی‌آزماییِ بندها

### الف — امنیت (۱۰ بند)

| # | ادعا | وضعیت | سندِ مرجع (داخل ریپو) | شاهدِ کد/تست |
|---|---|---|---|---|
| A1 | مدلِ مجوزِ write-only + بازتولیدِ ۷۷ فایل | ✅ | `R99` در HANDOFF | `authz/write-perms.json` + ژنراتور؛ `tests/server18.js` (۵۶ ادعا)؛ `tests/check-authz.js` + `tools/check-authz.js` (سبز در رگرسیون) |
| A2 | allowlist میدانی برای همهٔ کالکشن‌ها | ✅ | کد | `server/sync.js:292-304` — `FIELD_ALLOWLISTS` برای **همهٔ** کالکشن‌ها (known fields − protected) + سیاستِ خاصِ `leaves` |
| A3 | اعتبارسنجیِ سخت‌گیرانه (PR#4) | ✅ | کد + تست | `server/validate.js` (`unknown_field`، fail-closed)؛ پوشش در `server18` |
| A4 | ثوابتِ OTP متمرکز | ✅ | `R100_OTP_RATELIMIT_FINAL_REPORT.md` | `server/auth.js:131-136,198` — WINDOW=900، COOLDOWN=60، DAILY=20، IP_SEND=10، PHONE=5، LOGIN_IP=10؛ `randomInt(100000,1000000)` |
| A5 | مرجعِ IDOR + تفکیک اسکوپ | ✅ | کد + تست | اندپوینتِ مرجعِ idor (۵۱ خط) + `server/middleware/scope.js` (projection) **مصرف‌شده در هر ۶ روت**؛ توجه: «مرجع» است نه دیتابیسِ واقعی |
| A6 | الزامِ TLS در production | ✅ | کد | `server/index.js:525-530` — fail-fast اگر در prod کلید/TLS نباشد |
| A7 | سخت‌سازیِ audit + چرخش | ✅ | کد | `server/audit.js` (۳۴۴ خط)؛ `rotate()` در `:162-178` (هر ۱۰۰۰ رویداد / روزانه / سقفِ حجم) |
| A8 | اسکنِ رازها | ✅⚠️ | تست | `tests/secret-scan.js` — خودکفا، پیمایشِ کلِ ریپو با الگوهای واقعی. ⚠️ ادعایِ مسیرِ `tools/secret-scan.js` **نادقیق** است (این فایل نیست) |
| A9 | سئوت‌های امنیتی | ✅ | تست‌ها | `tests/security.js`، `security2.js`، `security_client.js`، `security_seed.js`، `authz-model.js` — همه سبز در رگرسیون |
| A10 | پوششِ چک‌لیستِ امنیتیِ چت-۱ | ⏳ | — | `.docx` در ریپو نیست؛ پوشش از روی کد/تست بازسازی شد (A1–A9). بدونِ فایلِ مرجع، «تطبیقِ بندبه‌بند با چت-۱» قابل امضا نیست |

### ب — مقیاس/معماری (۲۰ بند)

| # | ادعا | وضعیت | سندِ مرجع | شاهدِ کد/تست |
|---|---|---|---|---|
| B1 | لایهٔ DB دوحالته (PG/memory) + init در بوت | ✅⏳ | `docs/PG_*.md` | `server/db.js` (۲۹۷ خط): memory مگر `DATABASE_URL`+`pg`؛ `init` در بوت صدا زده می‌شود. ⏳ **مسیرِ زندهٔ درخواست‌ها file store است**؛ DB آماده/کناری (sidecar) است نه سروینگِ واقعی |
| B2 | ۶ روتِ API فاز ۳ | ✅ | `docs/*PHASE*` | ۶ فایل در `server/routes/`؛ ⏳ `tests/api/*.test.js` هست ولی **در رگرسیون سیم‌کشی نشده** (`grep tests/api run-all-tests.sh` = ۰) |
| B3 | لایهٔ کش (Redis + fallback) | ✅ | کد | `server/redis.js` (۲۸۹) + `server/cache.js` (۲۰۷) با fallback حافظه |
| B4 | نرخ‌محدودیتِ دوسطحی | ⏳ | کد | `checkRateLimit` در `cache.js:128` پیاده است ولی **بیرون از `cache.js` هیچ مصرف‌کننده‌ای ندارد** (unwired) |
| B5 | حلِ تعارضِ سینک | ✅ | کد | پیاده‌سازیِ ۸۹خطیِ conflicts + تست |
| B6 | روت‌های نسخه‌دارِ v1 | ✅ | کد | همان ۶ روتِ B2 (هم‌پوشان) |
| B7 | ورکر/صفِ پس‌زمینهٔ سرور | ❌ | — | `server/workers/` **نیست**؛ هیچ پیاده‌سازیِ queue در کد دیده نشد |
| B8 | اسکیمای PG با ۱۸۹ ایندکس | ✅ | کد | اسکیمای ۴۰KB با ۱۸۹ `CREATE INDEX` + `migrate-to-pg` (۳۴۸ خط) |
| B9 | اسنادِ تضمین (inscope/perf) | ⏳ | `docs/.../inscope.md` (۲۱۵ خط)، `perf.md` (۴۰۱ خط) | فقط مدرکِ سندی راستی‌آزمایی شد؛ شاهدِ تستِ متناظر استخراج نشد |
| B10 | تنظیمِ pool اتصال | ✅ | کد | `server/db.js:31-34` — min=2، max=20، timeoutها (مشروط به B1: فقط وقتی PG فعال شود اثر دارد) |
| B11 | معماریِ مقیاس (سند) | ⏳ | docs فاز ۳ | سند هست؛ workers (B7) ندارد |
| B12 | rate-limit توزیع‌شده | ⏳ | کد | همان B4: تابع هست، سیم‌کشی نیست |
| B13 | صفحه‌بندیِ cursor-based | ✅ | کد | `server/middleware/pagination.js` — پیاده‌سازیِ واقعی (`parsePaginationParams`، limit پیش‌فرض ۵۰) |
| B14 | CDN برای استاتیک | ❌ | — | هیچ ارجاعی در کد/چک‌لیست؛ برای اپِ آفلاینِ تک‌فایل اساساً نامربوط — نیازمندِ تصمیمِ معماری |
| B15 | health/readiness/liveness | ✅⏳ | کد + سند | `/api/health` پایه ✅؛ **readiness/liveness جدا نیست**؛ `RELIABILITY_DR_PLAN.md` فقط spec است |
| B16 | مهاجرت localStorage → IndexedDB | ❌ | `docs/CLIENT_OFFLINE_ARCHITECTURE.md` | خودِ سند می‌گوید: localStorage «وضعیتِ فعلی»، IDB «معماریِ هدف». `src/js/03-idb-persistence.js` **نیست** |
| B17 | کشِ آفلاینِ رسانه | ✅ | کد | `src/js/49-vclass-idb.js` — تنها مصرفِ IDB (کشِ مدیای کلاس مجازی)، نه دیتای عمومی |
| B18 | صفِ آفلاینِ کلاینت | ✅ | کد | `SYNC` + صف در `27-sync.js` (چانکینگِ F01) — روی localStorage |
| B19 | سندِ معماریِ آفلاین | ✅ | `docs/CLIENT_OFFLINE_ARCHITECTURE.md` | سندِ «مصوبِ معماری» (Specification) — پیاده‌سازی نیست |
| B20 | تاب‌آوریِ ذخیره‌سازی (quota/corruption) | ❌ | — | بدونِ IDB (B16) عملاً محقق نشده؛ فقط در spec آمده |

### ج — نقشهٔ راه (۷ فاز)

| فاز | ادعا | وضعیت | شاهد |
|---|---|---|---|
| ۱. امنیت | R96–R101 | ✅ | ثوابت/allowlist/audit/TLS + سئوت‌ها (الف) |
| ۲. دیتابیس | مهاجرت به PG | ⏳ | sidecar آماده (B1/B8/B10)؛ مسیرِ زنده نه |
| ۳. بک‌اند | ۶ روت + کش + تعارض | ✅ | روت‌ها + redis/cache + conflicts + pagination |
| ۴. آفلاینِ کلاینت | IDB + pull + سینکِ کامل | ❌ | نه IDB (B16) نه pull (و) |
| ۵. عملکرد | k6/load + بهینه‌سازی | ❌ | فقط `LOAD_TESTING_PLAN.md` و `PERFORMANCE_TESTING_PLAN.md`؛ هیچ اسکریپتِ k6/load در ریپو |
| ۶. پایداری | health/DR/مانیتورینگ | ⏳ | `/api/health` پایه + spec (B15) |
| ۷. انتشار | اندروید/استور | ⏳❌ | فقط `PLAY_STORE_CHECKLIST.md` (ز) |

---

## ۳. د — F01 تا F06 (یافته‌های رفتاری، R100)

همه روی شاخهٔ `fix/behavior-findings`، هر قدم یک کامیت، و در رگرسیونِ امروزِ `feat/otp-ratelimit` سبز.

| شناسه | اصلاح | کامیت | فایل‌های محصول | سئوت + جهش | رگرسیونِ امروز |
|---|---|---|---|---|---|
| F01 | ارسالِ چانک‌شدهٔ سینک (۲۰۰تایی) + شکافِ بازگشتیِ 413 + dead-letter | `9558707` (step2) | `src/js/27-sync.js` (`SYNC_413_CODES` در :255، `splitPush` در :276) | `tests/sync-chunk.js` ۲۸/۲۸ + `sync-chunk-mutations` ۵/۵ | ✅ سبز |
| F02 | ۷ مسیرِ `add()` → ‏`insert()` (persist+queue) | `c2a9fd1` (step1) | `52-dojo`، `53-visitors`، `54-library` (books+loans)، `55-assets`، `56-sida-diff`، `33-forms-sms:289` (certificates) | `tests/persist-roundtrip.js` ۹/۹ + ۷/۷ جهش | ✅ سبز |
| F03 | `tuition plan-save` → ‏`tuition-plan-save` (رفعِ سایه + نقش‌ها) | `a7a918f` (step3) | `src/js/20-communication-finance.js` + `30-authz.js` + بازتولیدِ perms | `tests/tuition-plan.js` ۱۷/۱۷ + ۴/۴ جهش | ✅ سبز |
| F04 | `autoPlacement` → ‏`{buckets, unplaced}` + بجِ سرریز | `da4611b` (step4) | `src/js/39-school-year.js:158-165` | `tests/placement-overflow.js` ۱۸/۱۸ + ۵/۵ جهش | ✅ سبز |
| F05 | بکاپِ v3 با اسنپ‌شات (`t:'snap'`) + سازگاریِ v2 | `411fc5b` (step5) | `src/js/38-plans-backup.js:133` | `tests/backup-snap.js` ۱۸/۱۸ + ۵/۵ جهش | ✅ سبز |
| F06 | `generateP12` → ‏`generatePriorYear` (رفعِ سایه با فاز ۱۲) | `f8f3e21` (step6) | `src/js/45-teacher-tools.js:332` + فراخوانیِ دوگانه در `24-edu-office.js:970` و `38-plans-backup.js:213` | `tests/genp12.js` ۹/۹ + ۴/۴ جهش | ✅ سبز |

کامیتِ تجمیعی: `d6118dd` («resolve all 6 behavior findings (F01-F06) — R100»)؛ مبنای `7ae96a4` (step0).

---

## ۴. ه و و — OTP و Pull

### ه — OTP + rate-limit توزیع‌شده (R101) ✅
- سئوت: `tests/otp-ratelimit.js` **۴۹/۴۹** (R1 شکلِ ۶رقمی+CSPRNG · R2 سقفِ phone ‏۵/۱۵min‎ · R3 سقفِ روزانهٔ ۲۰ · R4 سقفِ IP ارسال ۱۰ · R5 سقفِ IP ورود ۱۰ · R6 مرگِ کد + R6a2 · R7 بروت‌فورس ۱۲تلاشه · R8 جفتِ توزیع‌شده · R9 بی‌echo + enum-guard · R10 مهاجرت · R11 رازداری)؛ جهش‌ها **۷/۷ کشته**؛ GC مهاجرت G7/G7b در `server14-gc`.
- شاهدِ کد: `server/otp-store.js` (swapِ درجای `data`)، `server/auth.js` (ثوابت + ‎`DEMO_CODE_ECHO` فقط در تست).
- گزارشِ کامل: `R100_OTP_RATELIMIT_FINAL_REPORT.md` (۴۹ ادعا، M1–M۷).
- ⚠️ اثرِ جانبیِ واقعیِ R101 که در همین راستی‌آزمایی گرفته و رفع شد: خوانندهٔ قدیمیِ `(\d{4})` در `tests/server3.js:146` با کدِ ۶رقمی ناسازگار بود → اصلاح به `(\d{4,6})`؛ نگهبانِ نشتِ `server17.js:346` هم به `{4,6}` ارتقا یافت. (جزئیات در §۶.)

### و — Pull/Bootstrap ❌ (پیاده نشده)
- نیست: `server/pull.js` ❌ · `src/js/29-pull.js` ❌ · `tests/pull-bootstrap.js` ❌.
- تنها ارجاعِ ریپو: `docs/FIXES_ACTION_PLAN.md` §۴.۱ که pull را **صراحتاً «کارِ آینده»** (پیشنهادِ ۲–۳ هفته‌ای) می‌داند.
- آنچه هست: فقط `GET /api/v1/bootstrap` (بوت‌استرپِ اولیه، نه pull/sync).
- ح
...[truncated 3942 chars]