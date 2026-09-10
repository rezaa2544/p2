# Wave 1 — موجودی کامل مسیرهای نوشتن (Writes Inventory)

- **تاریخ:** 2026-09-10 | **بیس:** `origin/main` @ `351bd10` | **شاخهٔ اجرا:** `arena/01a08a2e-p2`
- **هدف Wave 1:** ‏PostgreSQL تنها مرجع حقیقت (SoT)؛ store حافظه‌ای فقط کش write-through که «می‌تواند از PG عقب باشد ولی هرگز جلو نیست».
- **اصل ضدالگو (§28.1):** «PG اضافه شود ولی store بماند = دو SoT» — ممنوع. هر مسیر زیر یا PG-اول شد یا با دلیل صریح بیرون از scope ماند.
- **محدودیت محیط:** در سندباکس PG زنده نیست (no apt/maven/docker) — راستی‌آزمایی با `pg-mem` (مفسر واقعی SQL: تراکنش، upsert، sequence) + شاخهٔ guarded برای `DATABASE_URL` زنده در `tests/wave1-multi-instance.js`. اجرای staging روی PG واقعی، دنبالهٔ Wave 15 است.

## ۱. جدول مسیرها (پیش از Wave 1 → پس از Wave 1)

| # | مسیر نوشتن | فایل | پیش از Wave 1 (store-اول) | پس از Wave 1 (PG-اول) | تست شاهد |
|---|---|---|---|---|---|
| 1 | REST create (هر ۵ روت) | `server/routes/{attendance,classes,grades,students,users}.js` | `store.push` + ‏mirror بی‌خطا (خطای PG = واگرایی بی‌صدا) | ساخت رکورد ← `persistOpsBatch(ins)` در تراکنش ← بعد `store.push`؛ خطا = 500/503 بدون لمس store | `wave1-multi-instance` A1–A3 |
| 2 | REST update + ‏OCC (هر ۵ روت) | همان‌ها | جهش store اول، بعد mirror؛ روی 409 از PG، store جهش‌یافته می‌ماند (واگرایی!) | پیش‌چک store ← ‏UPDATE…WHERE version در PG (مرجع 409) ← بعد اعمال روی store | `occ` ‏18/18‏ + `wave1-multi-instance` B1–B3 |
| 3 | REST delete (نرم + سنگ‌قبر) | `server/delete-service.js` + ۵ روت | splice از store اول، بعد `persistOp` بلع‌کنندهٔ خطا | `persistOpsBatch(del)` اول (throw) ← بعد splice/tombstone؛ خطا = 503 (نه 404) | `tombstone` ‏25/25‏ + `wave1-multi-instance` C1 |
| 4 | Sync apply (ins/upd/del + هوک نوتیف) | `server/sync.js` (حلقهٔ ~746–790 + هوک‌ها) | اعمال روی store، بعد mirror اتمیک؛ روی شکست mirror: 200-ok برمی‌گشت و uid «پردازش‌شده» می‌ماند = **گم‌شدن بی‌صدای داده نسبت به PG** | اسنپ‌شات مجموعه‌های لمسی ← اعمال ← mirror اتمیک ← **روی شکست: rollback اسنپ‌شات + 503** (`sync_mirror_failed`) تا کلاینت retry کند؛ uidها فقط پس از کامیت موفق علامت می‌خورند (store و Redis) | `sync-atomic-batch` ‏22/22‏ + جهش 5/5 + `wave1-multi-instance` D1–D4 |
| 5 | Sync: شناسه‌های ins + نوتیفیکیشن‌ها | `server/sync.js` (`nextId` محلی max+1) | max+1 روی store همان نمونه = برخورد PK بین نمونه‌ها | `ctx.ids.nextId` (sequence/identity در PG، ‏guarded-max+1 در مموری) با fallback به محلی وقتی ids تزریق نشده | `wave1-multi-instance` D5 |
| 6 | Sync: خوانش ضمنی (`ex`/`rec`) | `server/sync.js` | فقط store همان نمونه = نادیده‌گرفتن silent آپدیت رکوردِ ساخته‌شده در نمونهٔ دیگر | miss در store + ‏PG زنده → `db.readOne` و seed کردن store؛ همچنان-missing = رفتار قبلی (skip) | `wave1-multi-instance` D6 |
| 7 | Sync: نوتیفیکیشن‌های سروری | `server/sync.js` (هوک‌های R88/R89) | فقط store — اصلاً mirror نمی‌شدند | به `mirror[]` اضافه شدند (جدول `notifications` موجود است) | `wave1-multi-instance` D7 |
| 8 | Resolve تعارض | `server/conflicts.js` (`apiResolve`) | فقط store (رکورد + `sync_conflicts`) | upsert رکورد + سطر `sync_conflicts` در PG اول (جدول موجود است)، بعد store | `wave1-multi-instance` E1 |
| 9 | حذف حساب (GDPR) | `server/gdpr.js` (`eraseUserData`) + ‏`auth.js` | purge فقط از store (۵ کالکشن) | ‏DELETE از PG اول (تراکنش) بعد purge store؛ خطا = 503 (قابل retry) | `wave1-multi-instance` F1 |
| 10 | Restore بکاپ | `server/admin.js` (`apiRestore`) | swap کامل store از فایل، بدون لمس PG = واگرایی عظیم | اعتبارسنجی فایل ← re-mirror همهٔ کالکشن‌های رابطه‌ای به PG (upsert + حذف idهای غایب) ← بعد swap store | `wave1-multi-instance` G1 |
| 11 | Outbox append/mark | `server/outbox.js` | store اول + آینهٔ best-effort PG («منبع حقیقت اسنپ‌شات») | ‏INSERT اول در `server_outbox` (شناسه از sequence در PG) + store؛ خطای PG = audit + ادامه (رویداد derived است، دامین نیست) | `wave1-multi-instance` H1 |
| 12 | خوانش تک‌رکورد در مسیر نوشتن | ۵ روت + ‏`conflicts` + ‏`auth` (find کاربر) | `store.find` مستقیم = تصمیم روی دادهٔ stale (404 کاذب، allow کاذب) | ‏PG زنده → `db.readOne/readCollection`؛ مموری → رفتار قبلی | `wave1-multi-instance` (پوشش ضمنی B/C/D) |
| 13 | بوت: hydrate + ‏persist دوره‌ای | `server/index.js` (`loadStore`، ‏`setInterval 2s`) | بوت بدون فایل = مرگ؛ persist کامل JSON هر ۲ ثانیه در همهٔ حالت‌ها | ‏PG زنده → بوت بدون فایل مجاز (اسکلت) + hydrate کالکشن‌ها از PG؛ persist دوره‌ای در PG-mode رد می‌شود؛ persist هنگام shutdown همیشه (بکاپ crash-consistent) | بوت‌تست `wave1-multi-instance` I1 + ‏smoke ‏547/547 |
| 14 | بازگشت اضطراری به مموری | جدید: `tools/reseed-from-pg.js` | — (فایل همیشه تازه بود چون persist می‌شد) | ابزار رسمی PG←JSON برای سناریوی failover به مموری + قاعدهٔ عملیاتی در همین سند (§۴) | اجرای دستی (لاگ در PR) |

## ۲. بیرون از scope (با دلیل صریح — دادهٔ دامین نیستند)

| مورد | چرا بیرون است | مالک واقعی |
|---|---|---|
| Audit log (فایل، چرخش 10MB) | تله‌متری ops است نه دادهٔ دامین؛ در همهٔ shopهای PG هم فایل/استریم جدا دارد | همان‌طور که هست ✅ |
| کدهای OTP/کول‌داون (`otp-store`) | state نشستی/امنیتی زنده؛ حالت Redis (P0-15) موجود است | Wave 6 (تکمیل Redis-اجباری) |
| شمارنده‌های abuse/rate | قبلاً Redis-محور شده (PR #20) | ✅ انجام‌شده |
| نشست‌ها (JWT + ‏denylist) | stateless + ‏denylist در Redis (PR #25)؛ کپی store فقط آینهٔ محلی است | ✅ انجام‌شده |
| `__server_version` | فقط نمایشی در پاسخ pull؛ کرسر دلتا `since` زمانی است (Wave 4) | بدون اقدام |
| انتشار tombstone بین نمونه‌ها (pull-delta deletes) | نیازمند طراحی انتشار PG-tombstone در پروتکل sync | **Wave 4 (پیش‌نیاز عملیاتی: sticky-session تا آن موقع — §۴)** |
| مصرف‌کنندهٔ PG-محور outbox (ورکر) | ورکر Wave 8 از store می‌خواند؛ polling از PG با اوست | Wave 8 |
| `__auth.enum` (نگهبان R97) | state امنیتی زندهٔ هر نمونه؛ fail-closed محلی | بدون اقدام (موقت تا Wave 6) |

## ۳. تغییرات اسکیما — مایگریشن `004_wave1_version_seq`

- مشکل پیدا شده در inventory: هیچ‌کدام از جداول دامین ستون `version` ندارند ولی مسیر OCC در SQL (`UPDATE…WHERE version`) به آن نیاز دارد → روی PG واقعی با خطای «no such column» می‌مرد.
- `migrations/004_wave1_version_seq.sql` (idempotent، با `.down.sql`): افزودن `version INTEGER NOT NULL DEFAULT 1` به ۹ جدول `VERSION_TRACKED` (‏grades/attendance/discipline/schools/classes/subjects/users/enrollments/schedule‏) + ساخت sequence سراسری `payesh_outbox_id_seq`.
- اعتبارسنجی: اعمال فایل روی pg-mem در `wave1-multi-instance` (بلوک M1) + بازبینی دستی روی PG واقعی در staging.

## ۴. قواعد عملیاتی پس از Wave 1

1. **PG مرجع است.** هر واگرایی ادعاشده store←PG باگ P0 محسوب می‌شود (store فقط کش write-through).
2. **تا Wave 4: sticky-session اجباری** (یا تک‌نمونهٔ نویسنده) — چون انتشار tombstone/delta-deletes هنوز نمونه‌محلی است. خوانش/نوشت رکوردها跨 نمونه امن است؛ فقط «حذف» در pull-delta نمونهٔ دیگر با تأخیر دیده می‌شود.
3. **بوت بدون PG پس از دورهٔ PG:** فایل JSON ممکن است قدیمی باشد (persist دوره‌ای در PG-mode خاموش است) → ابتدا `node tools/reseed-from-pg.js` (به PG زنده وصل می‌شود و `payesh.json` تازه می‌سازد)، بعد بوت مموری.
4. **Restore در PG-mode** از مسیر `apiRestore` می‌گذرد (PG اول، بعد store) — هرگز فایل را دستی جایگزین نکنید.
5. **شناسه‌ها:** در PG-mode از identity/sequence می‌آیند؛ `max+1` فقط در مموری (تک‌نمونه) مجاز است.

## ۵. ماتریس شواهد

- `tests/wave1-multi-instance.js`: دو ست کنترلر (storeهای جدا، بدون اشتراک مرجع) روی یک بک‌اند مشترک (pg-mem؛ یا PG زنده اگر `DATABASE_URL` باشد): ‏write A → read B → update B → read A + ‏OCC-409 بدون lead + ‏rollback روی شکست mirror + ‏GDPR/restore/outbox.
- گیت‌ها: smoke ‏547/547‏ · check-authz=0 · secret-scan ‏11/11‏ · رگرسیون کامل `run-all-tests.sh` سبز.
- behavior-parity در مموری: همهٔ سوئیت‌های موجود (به‌ویژه `sync-atomic-batch` با ادعای exact-once mirror) بدون تغییر سبز می‌مانند.
