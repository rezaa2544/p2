# پایش — سندِ درکِ عمیقِ سامانه (مرجعِ عامل)

**تاریخ:** ۲۰۲۶-۰۹-۰۸ · **شاخه:** `arena/01a08256-p2` · **کامیتِ مبنا:** `4ca531c`
**هدف:** این سند «حافظه‌ی بلندمدتِ» عامل است — هرچه از خواندنِ کاملِ مخزن به دست
آمده، یک‌جا و با نشانیِ فایل. پیش از هر تغییر، این فایل را بخوان.

> ⚠️ این سند **تحلیل** است، نه مستندِ محصول. مستندِ کاربر/ناظر در `reza/` و
> `docs/` است (نقشه‌اش در §۸).

---

## ۰. آنچه برای نوشتن این سند خوانده شد

| حوزه | فایل‌ها | وضعیت |
|---|---|---|
| سرور (همه) | `server/*.js` (۲۰ فایل) + `server/middleware/*` (۴) + `server/routes/*` (۶) | خوانده‌شده خط‌به‌خط |
| کلاینت — هسته | `src/js/00-data-layer.js`، `00-migration.js`، `01-helpers.js`، `03-persistence.js`، `03-idb-persistence.js`، `28-indexes.js`، `05-router.js`، `24-edu-office.js` (بوت و `render()`) | خط‌به‌خط |
| کلاینت — امنیت/همگامی | `27-sync.js`، `29-pull.js`، `29-scope.js`، `30-authz.js`، `06-login.js`، `07-shell.js`، `19-actions-core.js` | خط‌به‌خط |
| کلاینت — نمونه‌ها | `02-demo-data.js`، `42-self-diagnostics.js`، `44-sms-notify.js`، `66-client-features.js`، `99-theme-loader.js`، `src/head.html`، `src/body.html` | ساختار و سرخط‌ها |
| مجوز | `authz/model.json` (۸۰ مجموعه) + `authz/write-perms.json` (تولیدی، ۱۷۰ اکشن) | ساختار + ماشین‌حسابی |
| ابزار/ساخت/تست | `build.js`، `tools/check-authz.js`، `tools/generate-write-perms.js`، `tests/run.js`، `scripts/run-all-tests.sh`، `.github/workflows/*` | خط‌به‌خط |
| راهنماهای متنی | `reza/توضیح_کامل_برنامه.md`، `docs/راهنمای_برنامه_نویس.md`، `docs/README.md`، `README.md` | کامل |
| وضعیت/گزارش | `TODO_BEFORE_PRODUCTION.md`، `REMAINING_WORK_SUMMARY.md`، `PILOT_READY_SUMMARY.md`، `FINAL_VERIFICATION_REPORT.md`، `docs/ROADMAP_FINAL_SCAN_2026-09-08.md`، `PROJECT_NOTES.md` (فهرست) | کامل/فهرستی |

مخزن ۵۳۵ فایل دارد. فایل‌های حجیمِ غیرکد (`index.html` ۱.۹MB، `USER_GUIDE.html`
۲.۴MB، `reza/برنامه_نویس/index.html` ۱.۹MB، `server/schema.sql` ۴۰k خط،
`docs/HANDOFF_ARCHIVE.md`، `docs/AI_PROMPT.md`) خروجی/آرشیو حساب شده‌اند و
نیازی به خواندنِ کامل ندارند — خودشان از `src/` و `server/` تولید می‌شوند.

---

## ۱. چیستیِ محصول

**پایش** = سامانه‌ی مدیریت مدرسه، فارسی/RTL، تقویم شمسی، **آفلاین-محور**،
**تک‌فایلی**، بدون هیچ وابستگی/CDN. خروجی نهایی یک فایل HTML است که در
`file://` هم کامل کار می‌کند.

سه ستونِ هویتیِ محصول (از `reza/توضیح_کامل_برنامه.md` و `PROJECT_NOTES.md`):

1. **آفلاینِ مطلق** — دبیر وسط زنگ با اینترنتِ قطع‌شده هم حضور ثبت می‌کند؛
   تغییر در صف محلی می‌ماند و بعداً ارسال می‌شود.
2. **بدون وابستگی** — فونتِ Vazirmatn و لوگو به‌صورت base64 جاسازی شده‌اند.
3. **ورود بی‌رمز** — تلفن + کد پیامکی + کد ملی (ستونِ `password` آرشیوی است
   و در ورود خوانده نمی‌شود؛ قفلِ smoke دارد).

### نقش‌ها (۸ نقش واقعی در کد — مستندات گاهی می‌گویند ۶ یا ۷)

`superadmin` · `edu_office` · `manager` · `teacher` · `counselor` · `driver` ·
`student` · `parent` (`src/js/01-helpers.js:ROLE_FA` — ۸ کلید).
`counselor` و `driver` در `NAV` هم منوی مستقل دارند (`05-router.js:13-14`).

### مقیاسِ کد

| عدد | مقدار | منبع |
|---|---|---|
| ماژولِ JS در باندل | **۸۱** | `src/js/_order.json` |
| مجموعه‌ی داده (`db.*`) | **۸۰** | `src/js/02-demo-data.js:65` |
| مسیر (route) در `renderRoute` | ~۵۰ | `src/js/07-shell.js` |
| اکشنِ ثبت‌شده در `ACTION_ROLES` | ~۳۳۷–۳۴۰ | `src/js/30-authz.js` |
| اکشنِ استخراج‌شده در جدولِ تولیدی | **۱۷۰** | `authz/write-perms.json` |
| سوئیتِ تست (غیرجهش) | **۱۰۸** (+۴۵ جهش = ۱۵۳) | `ls tests/*.js` |
| حجم خروجی | ~۱.۸ MB | `dist/payesh.html` |

---

## ۲. خطِ ساخت (build)

```
src/styles/*.css  ─┐
src/js/*.js (81)  ─┼─→ build.js ─→ dist/payesh.html  و  index.html
src/head.html     ─┤
src/body.html     ─┘
```

* `build.js` ترتیب را از `src/js/_order.json` می‌خواند (نه از الفبا) — ماژولِ
  جدید **حتماً** باید آن‌جا ثبت شود.
* `build.js --check` سه چک را هم‌زمان می‌زند: (۱) خروجی بیت‌به‌بیت با
  `index.html` یکی باشد، (۲) `tools/generate-write-perms.js --check`
  (جدولِ مجوزِ تولیدی کهنه نباشد)، (۳) `tools/check-authz.js`
  (اکشن‌های نویسنده‌ی کلاینت ↔ `WRITE_PERMS` سرور).
* مُهرِ همگامی: `build.js` هشِ sha1ِ خروجی را در
  `<meta name="payesh-build">` داخل `USER_GUIDE.html` می‌نویسد؛
  ناهماهنگی = build قرمز (`syncGuide()`).
* **nonceـِ CSP**: بیلد جای‌نکهدار `__PAYESH_NONCE__` می‌گذارد و
  `server/index.js` در هر درخواست آن را با مقدار تصادفی پر می‌کند
  (بدون `unsafe-inline`).

دستورها: `npm run build` · `npm run build:check` · `npm run dev` ·
`npm test` (`tests/run.js` + `tests/smoke.js`) · `npm start` (سرور).

---

## ۳. معماریِ کلاینت

### ۳.۱ لایه‌ی داده — «تنها دروازه»

`src/js/00-data-layer.js`:

* `Store` = کلید-مقدار روی `localStorage`، هر متد در برابر خطا مقاوم
  (حالت ناشناس، حافظه‌ی پر) — خروجی همیشه مقدار دارد، هرگز استثنا نمی‌اندازد.
* `Api.request()` = تنها نقطه‌ی `fetch` در کل برنامه (با `credentials:'include'`).
  در حالت محلی مسیرهای نسبی رد می‌شوند تا تکیه‌ی زودهنگام به سرور بی‌صدا نماند.
* `Data.{all,find,where,create,update,delete,batch}` = چهار عملِ داده؛
  نما/منطق حقِ دستکاریِ مستقیمِ آرایه‌های `db` را ندارد.
* `httpGetJson()` = تنها خوانشِ شبکه؛ **هرگز reject نمی‌کند** و همیشه
  `{ok,status,code,serverTime,data,error,networkError,timedOut}` برمی‌گرداند.
* `DATA_MODE` محلی/سروری · `detectServer()` با `GET /api/health` سرور را کشف
  می‌کند و در صورت موفقیت `SYNC.demoMode=false` و `SYNC.serverUrl='/api/sync'`.

قاعده‌ی طلایی (تست‌شده در smoke): **هیچ فایلی جز این لایه `localStorage` یا
`fetch` را مستقیم صدا نمی‌زند.**

### ۳.۲ ماندگاری — دفترچه‌ی عملیات (event log)

`03-persistence.js` + `03-idb-persistence.js`:

* داده به‌شکل **دفترچه‌ی عملیات** (`log`) نگه داشته می‌شود نه عکسِ لحظه‌ای؛
  وضعیتِ فعلی از بازپخش (`applyLog` → `applyOp`) می‌آید. این همان ساختاری است
  که همگام‌سازی را ممکن می‌کند: همان سطرها به صفِ ارسال می‌روند.
* `applyOp(op, record=true)` سه نوع دارد: `ins` / `upd` / `del`.
  در `ins` یک **رونوشتِ سطحی** از `op.data` گرفته می‌شود — وگرنه ویرایشِ بعدی
  روی شیءِ زنده، گذشته‌ی دفترچه را بازنویسی می‌کرد (دامِ دور ۴۲: سابقه‌ی
  تغییرات دروغ می‌گفت).
* `batchWrites(fn)` همه‌ی نوشتن‌های داخل `fn` را جمع می‌کند و **یک بار**
  ذخیره می‌کند (بدونش، فارغ‌التحصیل‌کردنِ ۵۰۰ دانش‌آموز درجه‌دوم می‌شد).
* **فشردنِ دفترچه** (`compactLogIfNeeded`): روی آستانه‌ی ۳۰٬۰۰۰ عملیات یا
  ۳MB، دفترچه به «اسنپ‌شات + ۵۰۰ عملِ آخر» تبدیل می‌شود؛ عمل‌های مانده
  نشانِ `__a` (فقط‌سابقه) می‌گیرند و بازپخش نمی‌شوند. گارد: فقط وقتی فشردن
  واقعاً کوچک می‌کند (cand < ۹۰٪ قدیمی).
* **نسخه‌گذاری (R95)**: در `upd` روی مجموعه‌های نسخه‌دار
  (`grades`/`attendance`/`discipline`) پیش از اعمال، `op.base_version` ثبت و
  `it.version` یکی زیاد می‌شود — مبنای تشخیصِ تعارض در سرور.
* لایه‌ی دوم = IndexedDB (`payesh_offline_db`) با ۳ استور
  (`entities` / `sync_queue` / `metadata`) و مهاجرتِ یک‌باره از
  localStorage (`00-migration.js`).

### ۳.۳ ایندکس

`28-indexes.js`: هر ایندکس با شمارنده‌ی نسخه‌ی همان مجموعه (`IDX_VER`)
اعتبارسنجی می‌شود؛ `idxInvalidate(coll)` از `applyOp` صدا زده می‌شود.
`idxAppend()` درجِ افزایشی است — بدونش، ورودِ ۲۰۰۰ ردیف اکسل از ۱۰۰۰ms به
۱۴٬۲۵۷ms می‌رفت (insert کل ایندکس را باطل می‌کرد).

### ۳.۴ مسیریابی و پوسته

* `S` = وضعیتِ سراسری (`05-router.js:5`)؛ `NAV` = منوی هر نقش؛ `TITLES` =
  عنوان+شرحِ هر مسیر.
* `S.stack` + `history.pushState` + `goBack()` ⇒ **دکمه‌ی Backِ گوشی** درست
  کار می‌کند (مودال → منوی کناری → صفحه‌ی قبل).
* `renderRoute()` (`07-shell.js:117`) ابتدا سه گارد را می‌زند:
  دیوارِ پرداختِ ولی (`parentLocked` + `PARENT_FREE_ROUTES`)، قفلِ فرزند‌به‌فرزند،
  و **`canRoute()`**؛ بعد به `view*()` می‌رود.
* `render()` (`24-edu-office.js:891`) کلِ `#root` را بازنویسی می‌کند و
  **موقعیت اسکرولِ منو و محتوا را پیش/پس از آن برمی‌دارد** — با تفکیکِ
  «تغییر مسیر ⇒ از بالا» / «همان صفحه ⇒ حفظِ جا».

### ۳.۵ کنترلگرِ رویداد

`19-actions-core.js` — یک شنونده‌ی کلیک با واگذاری رویداد روی
`[data-act]`:

```js
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  if (S.user && canAction(a) === false) { toast('شما اجازه…'); return; }   // گاردِ مجوز
  const A = Object.assign({}, coreActions(), dormActions(), dropoutActions(),
    smsActions(), financeActions(), busActions(), vclassActions(),
    scheduleActions(), adminActions());
  if (A[a]) A[a](); else if (F7_ACTIONS[a]) … /* P8/P9/P10/CF/JD/FILTER/SYNC */
});
```

شنونده‌های جدا برای `input` (فیلترهای زنده با debounce ۲۸۰ms) و `change`
(آبشاریِ مقطع→پایه→شاخه→رشته، انتخابگرِ پوسته، ویرایشگرِ زنگ‌ها).

### ۳.۶ مجوزِ سمتِ کلاینت (`30-authz.js`)

* `allowedRoutes(role)` از خودِ `NAV` استخراج می‌شود + `EXTRA_ROUTES`
  (زیرصفحه‌های بی‌منو) + `COMMON_ROUTES`. ⇒ **حذفِ یک آیتم از منو، دسترسیِ مسیر
  را هم قطع می‌کند** (دامِ مستندشده).
* `canRoute()` · `homeRoute()` (مشاور → `cqueue`، اداره → `officedash`،
  راننده → `myservice`).
* `ACTION_ROLES` = اکشن → نقش‌های مجاز؛ `canAction()` در شنونده‌ی کلیک.
  سوپرادمین عمداً اکشن‌های مدرسه‌ای (ورود اکسل، ثبت نمره/حضور) را **ندارد** —
  وقتی با `school-enter` وارد پنل مدرسه می‌شود، `S.user` خودِ مدیر می‌شود.
* ⚠️ متنِ خودِ ماژول تأکید می‌کند: **این لایه سدِ نهایی نیست**؛ سرور موظف است
  همان قواعد را مستقل اعمال کند.

### ۳.۷ بوت

`24-edu-office.js` در `setTimeout(...,50)`:

1. `loadLog()` **پیش از** مولدها (وگرنه `generate*` با وضعیتِ تقریباً خالی،
   دفترچه‌ی نشست‌های پیشین را بازنویسی می‌کرد — دامِ دور ۸۵/W1)،
2. `generate()` / `generateExtras()` / `generateP8…P12()` / `generatePriorYear()`
   و مولدهای دامنه‌ای (سرویس، کلاس مجازی، تکلیف، مهمان‌ها، کتابخانه، اموال،
   سیدا، حالتِ مدرسه)،
3. `applyLog(); initSync();`
4. `detectServer()` → `GET /api/auth/me` → نشستِ معتبر = همان کاربرِ محلی،
   کوکیِ نامعتبر = پاک‌شدنِ نشست محلی، نبودِ شبکه = تغییری نمی‌کند،
5. بازگردانیِ نشست/شخصا/باسِ دمو (فقط دمو — علامت‌گذاری‌شده در کد)،
6. `render()`.

---

## ۴. همگام‌سازی (Push + Pull)

### ۴.۱ صفِ ارسال (`27-sync.js`)

* وضعیتِ هر عمل: `pending → sending → synced | failed | conflict | rejected`.
* `SYNC_DEAD_CODES` = ردهای پایدار (`field_denied`, `malformed_op`,
  `role_denied`, `out_of_scope`, `forged_by`, `unknown_field`,
  `unknown_collection`, `role_escalation`, `ownership_forge`,
  `conflict_preserved`, `stale_base`, `validation_failed`, `oversized_op`) —
  این‌ها به `rejected` می‌روند و از چرخه خارج می‌شوند تا صفِ سالم‌ها را نگیرند.
  ردهای گذرا (`virtual_day`, ۴۰۱ نشست) همان `failed` با backoff می‌مانند.
* `duplicate_ignored` موفق حساب می‌شود (ایدمپوتانسِ uid پس از قطعی).
* Backoff: ۲s → ۴ → ۸ … تا سقف ۵ دقیقه.
* `enqueueOp()` کلیدهای محلیِ `id`/`by` را از `data` پاک می‌کند (سرور آن‌ها را
  `unknown_field` می‌داند).
* ارسالِ تکه‌تکه (`sendChunked`) + پیشرفت (`SYNC.progress`)؛ تک‌عملیاتی که حتی
  تنها هم ۴۱۳ می‌خورد ⇒ `oversized_op`.

### ۴.۲ کشش/دلتا (`29-pull.js` — A01)

`GET /api/v1/pull?since=…&collections=…` → `mergeServerDelta(payload)`:

* رکوردی که در صفِ محلی عملیاتِ ارسال‌نشده دارد را **بازنویسی نمی‌کند**
  (تغییرِ محلی از بین نمی‌رود)،
* آرایه‌ی `deleted` (tombstone) را از پایگاه محلی حذف می‌کند،
* `payesh_last_pull_time` را جلو می‌برد، ایندکس‌های لمس‌شده را باطل می‌کند،
* IndexedDB را در پس‌زمینه به‌روز می‌کند.

### ۴.۳ محدوده‌ی داده (`29-scope.js`)

`SCOPE_LIMITS` = ۶۰٬۰۰۰ رکورد / ۸MB / پنجره‌ی ۴۵ روزه‌ی حضور / ۲ ترم / صفحه‌ی ۵۰.
`scopeDescriptor(role)` برشِ هر نقش را توصیف می‌کند (اداره فقط تجمیع؛
مشاور فقط صفِ ارجاع + نام/کلاسِ ارجاع‌شده‌ها؛ سوپرادمین آمارِ ملی).

---

## ۵. سرور (`server/` — فقط Node stdlib؛ `pg` و `ioredis` اختیاری)

### ۵.۱ نقشه‌ی فایل

| فایل | نقش |
|---|---|
| `index.js` | روتر، سرآیندهای امنیتی، CSP nonce، GC، persist، TLS، بکاپِ خودکار، نگهبانِ شمردنِ شناسه |
| `auth.js` | JWTِ HS256 دست‌ساز، OTP (CSPRNG + فقط هش)، سقف‌های نرخ، ورود/خروج/حذف حساب |
| `otp-store.js` | حالتِ OTP/نرخ در `server/data/otp.json` (مشترک بین instanceها) |
| `sync.js` | `POST /api/sync` — ۴ سنجش + دروازه‌ی فیلد + نسخه/تعارض + اعلان‌های خودکار |
| `validate.js` | لایه‌ی مقدار (طول/enum/عدد/تاریخ)، پاکتِ عملیات، `STATUS_ENUMS` برای ۲۴ مجموعه |
| `idor.js` | `GET /api/students/:id` — مرجعِ IDOR (خارج از محدوده = **۴۰۴ نه ۴۰۳**) |
| `pull.js` | `GET /api/v1/pull` — دلتا + سنگ‌قبرها + پوششِ نقش |
| `conflicts.js` | فهرست و داوریِ تعارض (فقط manager/superadmin) |
| `admin.js` | بکاپ/بازیابی (فقط superadmin)، نگهداری ۱۰ نسخه، زمان‌بندی درون‌پروسه |
| `sms.js` | ارسالِ واقعی (فقط superadmin)، کیف پول، سقف روزانه، ایدمپوتانس |
| `bell.js` | `GET /api/bell/now` — ساعتِ سرور + حضورِ امروزِ فرزندان (پُلِ زنده) |
| `audit.js` | لاگِ فقط‌افزودنی، پاک‌سازیِ phone/nid، چرخش (۱۰۰۰ رویداد/روزانه/۱۰MB) |
| `db.js` | دولایه: PostgreSQL (`DATABASE_URL`) با fallbackِ حافظه، تراکنش، ping |
| `redis.js` / `cache.js` | Redis با fallbackِ حافظه؛ کشِ bootstrap، نرخ، ایدمپوتانس، pub/subِ باطل‌سازی |
| `tls-cert.js` | تولید گواهیِ خودامضا برای توسعه |
| `seed.js` | ساختِ `server/data/payesh.json` از همان دنیای دمو (jsdom) — قطعی |
| `schema.sql` | اسکیمای PostgreSQL (۴۰k خط، ۱۸۹ ایندکس) |
| `routes/*.js` | فاز ۳: students / classes / attendance / grades / users / bootstrap (RESTِ `/api/v1/`) |
| `middleware/*.js` | auth (JWT/کوکی)، scope (مدرسه/نقش)، projection (ماسکِ PII)، pagination (keyset) |

### ۵.۲ endpointها (از `index.js`)

```
GET    /api/health
POST   /api/auth/send-code · /api/auth/login · /api/auth/me · /api/auth/logout · /api/auth/delete-account
POST   /api/sync                       (سقف ۵۰۰ عمل در هر دسته)
GET    /api/sync/conflicts             (manager/superadmin)
POST   /api/sync/resolve-conflict      (manager/superadmin)
GET    /api/students/:id               (مرجعِ IDOR)
GET    /api/bell/now
POST   /api/admin/backup · /api/admin/restore   (superadmin)
POST   /api/sms/send                            (superadmin)
GET    /api/v1/bootstrap · /api/v1/pull
GET/POST/PATCH/DELETE /api/v1/{students,classes,attendance,grades,users}[/:id]
static: / · /index.html · /USER_GUIDE.html · /privacy.html · /account-deletion.html
```

### ۵.۳ زنجیره‌ی امنیت (به‌ترتیب اجرا)

1. **سرآیندها** (`securityHeaders`): CSP با nonceِ تصادفیِ هر درخواست،
   `X-Frame-Options: DENY`، `nosniff`، `Referrer-Policy: same-origin`،
   `Permissions-Policy` و HSTS زیر HTTPS.
2. **نگهبانِ شمردنِ شناسه (R97)**: هر رد (۴۰۱/۴۰۳/۴۰۴) و هر خوانشِ
   `/api/students/:id` به‌ازای هر نشست در پنجره‌ی ۱۰ دقیقه شمرده می‌شود:
   `WARN=20` → آدیت؛ `SLOW1=100` → تأخیر ۵۰۰ms؛ `SLOW2=500` → تأخیر ۲s؛
   `REVOKE=2000` → ابطالِ نشست (`__revoked_jti`). `/api/auth/*` مستثنی است.
3. **نشست**: کوکی `HttpOnly; SameSite=Lax` (+ `Secure` زیر HTTPS). JWT با
   الگوریتمِ **سخت‌کد‌شده‌ی HS256** (کشتنِ `alg:none`)؛ بررسیِ `iss`/`aud`/
   `exp`/تازگیِ `iat`/ابطالِ `jti`؛ امضای کلیدِ قبلی هم پذیرفته می‌شود
   (rotation). کلیدِ کوتاه‌تر از ۲۵۶ بیت ⇒ استارت نمی‌کند.
4. **OTP**: `randomInt(100000,1000000)`؛ روی دیسک **فقط هش** می‌رود؛
   سقف‌ها: cooldown ۶۰s، روزانه ۲۰، ارسال/پنجره برای هر شماره ۵، برای هر IP ۱۰،
   ورود برای هر IP ۱۰، تلاشِ غلطِ کد ۵ (بعدش کد می‌میرد)؛ تأخیرِ تصاعدیِ
   شکست‌ها (۱،۲،۴،۸… تا ۳۰s). **همه‌ی سقف‌ها پیش از بررسیِ وجودِ شماره**
   اعمال می‌شوند و پاسخ برای شماره‌ی موجود/ناموجود یک‌شکل است (ضدِ شمردن).
5. **`POST /api/sync`** — ۴ سنجشِ قرارداد به‌علاوه‌ی دروازه‌ی فیلد:
   * #1 `op.by === session.id` — جعل ⇒ **کل دسته** رد می‌شود،
   * #2 مُهرهای `user_id`/`school_id` با توکن یکی باشند،
   * #3 مجوزِ عمل (از مدل — ناشناخته = رد، حتی برای سوپرادمین)،
   * #4 `inScope()` — محدوده‌ی واقعیِ رکورد (دانش‌آموز/ولی/دبیر/مدیر/اداره).
   * دروازه‌ی فیلد (`fieldGate`): فیلدِ ناشناس = رد؛ «بدون ارتقاء» روی
     `users.role`؛ `phone`/`national_id` فقط مدیریت؛ `school_id` مشتق از نشست؛
     کلیدهای مالکیت (`from_id`/`author_id`/`graded_by`) = خودِ نشست؛
     سیاستِ `status` (ins = مقدارِ اولیه، upd = مدیر یا نقش‌های صریحِ workflow)؛
     فیلدهای محافظت‌شده (`status, school_id, user_id, role, national_id, phone`)
     هرگز از کپیِ عمومیِ payload عبور نمی‌کنند.
   * استثناهای حداقلی و محدوده‌دار: **IEP** (دبیر روی `users` فقط با کلیدهای
     IEP) و **ترک‌تحصیل** (مدیر، فقط کلیدهای dropout + `status∈{active,dropped_out}`).
   * `validateSyncData` — ردِّ عملیات‌محور (یک عملِ خراب، دسته را مسموم نمی‌کند)؛
     مقدارِ خام هرگز در پاسخ/آدیت نمی‌آید.
   * ایدمپوتانس با `uid` (حافظه/Redis/PG)؛ انحرافِ ساعت فقط ثبت می‌شود (رد نه)؛
     مسدودسازیِ عملیاتِ فیزیکی در **روزِ غیرحضوری** (`virtual_day`).
   * `server_version` و `__deleted_records` (سنگ‌قبر، سقف ۵۰۰۰).
6. **پاسخ و آدیت**: هیچ phone/nid کامل در پاسخ نیست؛ آدیت بیرون از store،
   با دسترسی ۰۶۰۰، و پاک‌سازیِ خودکارِ شماره/کدملی.

### ۵.۴ پایگاه/کش

* مسیرِ زنده = **فایلِ JSON** (`server/data/payesh.json`)، ذخیره‌ی اتمی
  (tmp + rename، mode ۰۶۰۰) هر ۲s در صورتِ کثیف‌بودن؛ GC برای
  `__processed_uids` (۳۰ روز) و `__revoked_jti` (TTLِ نشست).
* در صورتِ `DATABASE_URL` + `pg`: هر عملِ اعمال‌شده با UPSERT به PG می‌رود
  (`db.persistOp`)؛ در صورتِ `REDIS_URL` + `ioredis`: کش/نرخ/ایدمپوتانس/
  pub/sub. هر دو با fallbackِ بی‌صدا به حافظه.
* `PAYESH_ENV=production` بدون TLS یا اعلامِ پروکسی ⇒ **exit(1)**؛
  گواهیِ خودامضا در production ⇒ exit(1).

---

## ۶. مدلِ مجوز — یک منبعِ حقیقت

```
src/js/30-authz.js (ACTION_ROLES)  ┐
تحلیلِ استاتیکِ اکشن‌ها              ├─ tools/generate-write-perms.js ─→ authz/write-perms.json ─→ server/sync.js
authz/model.json (۸۰ مجموعه×۳ عمل) ┘
```

* `authz/model.json` = منبعِ سرپرستی‌شده: برای هر مجموعه، `fields` +
  `ins`/`upd`/`del` (فهرستِ نقش‌ها).
* `authz/write-perms.json` = **تولیدی** (۱۷۰ اکشن، ۸۰ مجموعه). سرور این را
  می‌خواند، نه جدولِ دستی.
* نگهبان‌ها: `node build.js --check` مولد را با `--check` اجرا و diff می‌کند
  (جدولِ کهنه = build قرمز)؛ `tools/check-authz.js` نویسنده‌های کلاینت را با
  `WRITE_PERMS` می‌سنجد؛ `tests/server16.js` ماتریسِ منفیِ role×collection×op؛
  `tests/authz-model.js` مدل را بازتولید و با seed/کلاینت diff می‌کند.

---

## ۷. تست

* `tests/run.js` — ساختار، ماژول‌ها، استایل، امنیت، آفلاین (سوئیتِ دروازه).
* `tests/smoke.js` — ۵۴۶/۵۴۷ مرحله در jsdom (جریان‌های هر نقش).
* ۱۰۸ سوئیتِ تخصصی + ۴۵ سوئیتِ **جهش** (`*-mutations.js`: کد را عمداً خراب
  می‌کند و می‌سنجد تست واقعاً می‌میرد یا نه).
* `scripts/run-all-tests.sh` (v3): سه خط — A (فقط‌خواندنی، درجا، ۲ کارگر)،
  B (تغییردهنده: جهش‌ها/سرورها/بازسازها ⇒ **کپیِ ایزوله** در `/tmp/mut-*`)،
  و خطِ سریال برای سوئیت‌هایی که پورتِ ثابتِ 89xx/90xx می‌گیرند.
  Self-heal برای jsdom / هویتِ گیت / remote / seed؛ گارد برای درختِ کثیف (exit 3)
  و کمبودِ فضای `/tmp` (exit 4). زمانِ اندازه‌گیری‌شده: ~۷ دقیقه.
* `tests/api/*` (فاز ۳، ۷ سوئیت) با `tests/api/runner.js` — **در
  `run-all-tests.sh` سیم‌کشی نشده** (`grep tests/api scripts/run-all-tests.sh` = ۰).
* `tests/performance/` — سناریوهای k6 (ورود، بوت‌استرپ، حضور، نمره، اعلان، سینک)،
  سوئیت‌های saturation / soak-24h / spike-mehr / chaos-redis،
  با `tests/performance/run-benchmarks.sh` (و `run-benchmarks.sh` در ریشه).
* CI: `.github/workflows/node.js.yml` (Node ۱۸/۲۰/۲۲: `npm ci` → `npm run build`
  → `npm test`) و `npm-publish-github-packages.yml` (انتشار هنگام release).

---

## ۸. نقشه‌ی مستندات (کدام سند مرجعِ چیست)

| بخواهی… | برو به |
|---|---|
| معماری/تصمیم‌های قفل‌شده | `docs/ARCHITECTURE_DECISIONS.md` · `docs/ARCHITECTURE.md` · `docs/ARCHITECTURE_REVIEW.md` |
| قراردادِ الزام‌آورِ سرور | `docs/SERVER_SECURITY_CONTRACT.md` (۵۰KB) |
| استقرار و env | `docs/DEPLOY.md` · `.env.example` |
| چه مانده پیش از تولید | `TODO_BEFORE_PRODUCTION.md` (بازبینیِ R96) |
| آمادگیِ پایلوت | `PILOT_READY_SUMMARY.md` · `docs/PILOT_ONBOARDING.md` · `docs/PILOT_KICKOFF.md` · `docs/pilot/` |
| راهنماهای نقش‌محور | `reza/مدرسه/` · `reza/اداره/` · `reza/سازنده/` · `reza/برنامه_نویس/` |
| توضیحِ محصول برای غیرفنی | `reza/توضیح_کامل_برنامه.md` · `USER_GUIDE.html` |
| وضعیتِ روزانه/دورها | `docs/REPORT_*.md` + `docs/README.md` (فهرستِ زمانی) |
| تاریخچه‌ی طولانی | `PROJECT_NOTES.md` · `HANDOFF.md` · `docs/HANDOFF_ARCHIVE.md` |
| مهارت‌های عامل | `SKILLS_MASTER.md` · `.claude/skills/*` |

> `docs/README.md` جدولِ زمانیِ فایل‌های `docs/` را نگه می‌دارد (قاعده: با هر
> به‌روزرسانی، ردیفش در همان دور تازه شود).

---

## ۹. وضعیتِ امروز: چه انجام شده، چه مانده

### ۹.۱ انجام‌شده (با شاهد)

| حوزه | وضعیت | شاهد |
|---|---|---|
| ۲۸/۲۸ بندِ نقشه‌راه (فاز ۰–۶) | ✅ | `docs/ROADMAP_FINAL_SCAN_2026-09-08.md` |
| سرورِ واقعی با صفر وابستگی | ✅ | `server/README.md`، ۱۵۴ بررسی (server1..server10) |
| احرازِ سرور (JWT/OTP/نرخ/ضدِ‌شمردن) | ✅ | `server/auth.js`, `server/otp-store.js`, server17 J/O |
| مجوزِ مرکزی + سطحِ فیلد + محدوده | ✅ | `authz/*`, `server/sync.js:fieldGate`, server16 (۳۹) |
| تعارضِ همگام‌سازی + داوری | ✅ | `server/conflicts.js`, server15 + جهش |
| بکاپ/بازیابی + خودکار | ✅ | `server/admin.js`, server9 A2/A4 |
| آدیتِ فقط‌افزودنی + چرخش + پاک‌سازی | ✅ | `server/audit.js`, server17 T6 |
| TLS در production (fail-fast) + CSP nonce | ✅ | `server/index.js`, server17 T1–T4 |
| Pull/Bootstrap و دلتا (A01) | ✅ | `server/pull.js`, `src/js/29-pull.js`, `tests/pull-bootstrap.js` |
| اندروید (TWA) | 🟡 اسکلت | `android/` + `tools/build-android.js` + `docs/PLAY_STORE_CHECKLIST.md` |
| پایلوت | 🟢 آماده با ۳ پیش‌نیازِ کارفرما | `PILOT_READY_SUMMARY.md` |

### ۹.۲ باز (فقط مواردی که در کد/مستندات زنده‌اند)

1. **پرداختِ والد** — تنها موردِ بازِ کلِ پروژه (تصمیمِ محصول؛ R88b/R90).
2. **بند ۰.۴ در برابر پی‌والِ فعلی** — `PARENT_FREE_ROUTES` فقط
   اشتراک/اعلان/اطلاعیه را رایگان می‌کند؛ نمره و حضور پشتِ قفلِ اشتراک‌اند.
   ممکن است با «داده‌ی پایه هرگز پولی نشود» در تنش باشد ⇒ **پرسشِ محصولی**،
   نه باگ (`docs/ROADMAP_FINAL_SCAN_2026-09-08.md` §۳).
3. **ذخیره‌ساز** — سرور روی فایلِ JSON است (برای پایلوت کافی)؛ PG/مقیاس =
   تصمیمِ استقرار (`docs/STORAGE_OPTIONS_2026-09-06.md`).
4. **پایگاهِ داده‌ی زنده نشده** — `db.js` آماده ولی مسیرِ سروینگِ درخواست‌ها
   همان فایل است (FINAL_VERIFICATION_REPORT بند B1 «sidecar»).
5. **`cache.checkRateLimit` مصرف‌کننده ندارد** (نوشته‌شده، بیرون از `cache.js`
   سیم‌کشی نشده) — بند B4.
6. **ورودِ اکسل سقفِ نرخ ندارد** (بند ۲.۲).
7. **`tests/api/*` در رگرسیون سیم‌کشی نشده**.
8. **فلیک‌های زمانی** — `homework2` (۲۳:۰۰–۲۳:۵۹ UTC)، `bus2`/`bus3`
   (پیش از ۰۷:۴۲Z)، `bell2` (شنبه/پنجشنبه) — ایرادِ تست، نه اپ؛
   و ۱۵ سوئیتِ جهش که `19-actions.js` حذف‌شده را می‌خوانند (`OPEN_ITEMS.md` §۵.۲).
9. **حذفِ نرم (`deleted_at`)** — تصمیم گرفته شده، پیاده‌سازیِ کاملِ
   «هر پرس‌وجو `WHERE deleted_at IS NULL`» مانده (بند ۲.۸).
10. **UUID برای شناسه‌ها** — تصمیم باید «پیش از نخستین استقرار واقعی» گرفته
    شود (بند ۲.۷).
11. **درگاهِ پیامکِ واقعی** — فقط گامِ ۱ پیاده شده؛
    `PAYESH_SMS_PROVIDER` تنظیم نشده ⇒ ۵۰۳ (`docs/PLAN_SMS_GATEWAY.md`).
12. **انتخابگرِ تم در رابط** — سه پوسته وجود دارد ولی آخرین کامیت
    (`4ca531c`) آن را به نوارِ بالای سوپرادمین سنجاق کرده است.

### ۹.۳ عددهای سلامت (از گزارش‌ها)

* رگرسیونِ کاملِ آخر: ۱۴۸ سبز / ۲ قرمز (هر دو با اصلاحِ ۲ خطِ تست سبز شدند) ⇒
  **مؤثر ۱۵۰/۱۵۰**؛ قبل‌تر ۱۲۴/۱۲۵ (فلیکِ `homework2`).
* ظرفیت: ۵۰۰ عمل در یک دسته = ۱۴ms؛ ۱۰۰۰ رکوردِ حضور < 9s؛ رندر p90 ≈ 9ms؛
  localStorage پس از ۳۰ روز = 568KB از ۵MB.

---

## ۱۰. قواعدِ کار (از `CONTRIBUTING.md`، `SKILLS_MASTER.md` و متنِ کد)

1. **تک‌منبعِ حقیقت** برای مجوز، داده و شبکه — کنترلِ پراکنده ممنوع
   (درسِ R96 P0-1).
2. **Fail-closed**: ناشناخته = رد. مجموعه/فیلد/نقشِ نشناخته هرگز عبور نمی‌کند،
   حتی برای سوپرادمین.
3. **۴۰۴ نه ۴۰۳** برای رکوردِ خارج از محدوده (۴۰۳ وجودِ رکورد را لو می‌دهد).
4. **هیچ PII در پاسخ/آدیت** — phone/nid همیشه ماسک یا حذف.
5. **توضیحِ فارسی در کد** برای هر تصمیمِ غیربدیهی؛ کامنت‌های «چرا» ارزشمندتر از
   «چه».
6. **Glyph-safety**: متنِ UI/پیام فقط در کلاینت (فایل‌های سرور عمداً
   رشته‌ی فارسی ندارند تا در صورتِ نشت، لاگ آلوده نشود).
7. `esc()` برای متن، `escAttr()` برای صفت — هیچ مقدارِ پویا بدون آن‌ها وارد
   `innerHTML` نشود. خروجیِ CSV باید ضدِ تزریقِ فرمول باشد.
8. **وابستگیِ تازه ممنوع** مگر با اجازه؛ سرور فقط stdlib + دو درایورِ اختیاری.
9. **`node build.js`** بعد از هر تغییر در `src/`؛ و `--check` پیش از تحویل.
10. ماژولِ جدید را در `src/js/_order.json` ثبت کن.
11. هر ادعا باید **شاهدِ کد/تست** داشته باشد؛ چیزی که دیده نشد، «دیده نشد»
    گزارش شود (روشِ `FINAL_VERIFICATION_REPORT.md`).

---

## ۱۱. دام‌های ثبت‌شده در کد (قبل از دست‌زدن بخوان)

| دام | کجا | خلاصه |
|---|---|---|
| ترتیبِ `loadLog` / `generate*` | `24-edu-office.js` بوت | `loadLog` باید پیش از مولدها باشد |
| رونوشت در `ins` | `03-persistence.js:applyOp` | بدونش سابقه‌ی تغییرات دروغ می‌گوید |
| درجِ افزایشیِ ایندکس | `28-indexes.js:idxAppend` | باطل‌سازی در حلقه ⇒ درجه‌دوم |
| حذف از `NAV` = قطعِ دسترسی | `30-authz.js:allowedRoutes` | مجوز از منو مشتق می‌شود |
| `op.data.id/by` در صف | `27-sync.js:enqueueOp` | سرور آن‌ها را `unknown_field` می‌داند |
| `__a` در فشردن | `03-persistence.js:compactLogIfNeeded` | عمل‌های مانده فقط‌سابقه‌اند |
| بازیابی، ابطالِ نشست را زنده نگه می‌دارد | `server/admin.js:apiRestore` | خروجِ پیش از restore پابرجاست |
| خودامضا در production | `server/index.js` | استارت نمی‌کند |
| اسکنِ کلیدواژه‌ی انگلیسی | `docs/ROADMAP_FINAL_SCAN…` §۱ | روی کدِ فارسی منفیِ کاذب می‌دهد |

---

## ۱۲. آماده‌به‌کار: دستورهای پرتکرار

```bash
node build.js            # ساختِ index.html + dist/payesh.html
node build.js --check    # انطباقِ بیت‌به‌بیت + مجوزها + مُهرِ راهنما
npm test                 # tests/run.js + tests/smoke.js
node server/seed.js      # ساختِ server/data/payesh.json (نیاز: jsdom)
node server/index.js     # وب + API روی :3000
bash scripts/run-all-tests.sh     # رگرسیونِ کامل (~۷ دقیقه)
node tools/check-authz.js         # اکشن‌ها ↔ WRITE_PERMS
node tools/generate-write-perms.js --check
```

---

*این سند توسط عامل (Arena Agent Mode) و با خواندنِ مستقیمِ مخزن نوشته شده؛
هر ادعایِ عددی در آن قابلِ بازتولید با دستورِ روبه‌رو است.*
