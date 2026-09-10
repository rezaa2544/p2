# ممیزی معماری چندنمونه‌ای — P0 #2 (Production Readiness Checklist بخش ۲۷)

**تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-10) · **شاخه:** `arena/01a08545-p2` (چت ۳)
**دامنهٔ ممیزی:** `server/redis.js`، `server/auth.js`، `server/cache.js`، `server/db.js` +
سایر ماژول‌های صاحبِ state (`otp-store.js`، `rate-limit.js`، `revocation.js`، `sync.js`،
`outbox.js`، `ids.js`، `waf.js`، `worker.js`، `worker-service.js`، `index.js`).

**سؤال:** کدام stateهایِ حیاتی هنوز در حافظهٔ فرایند یا فایلِ محلی هستند و با دو instance
API روی یک Redis/PG واگرا می‌شوند؟

---

## ۱) stateهایِ حیاتی — وضعیت هرکدام

### ۱.۱) stateهایی که **روی Redis مشترک** هستند (چندنمونه‌ای ✅)

| # | State | ماژول | کلید(های) Redis | TTL | مکانیزم |
|---|---|---|---|---|---|
| 1 | **OTP** — هشِ کدها + cooldownِ ارسال + تأخیرِ تصاعدیِ login + **سنگ‌قبر** (P0-15) | `server/otp-store.js` | `payesh:otp:state` | پُرینِ ۲۵h روی هر بخش؛ کد ۵ دقیقه | **Redis = تنها منبعِ حقیقت** وقتی زنده است: فلاش زیر قفلِ توزیع‌شده (P0-14) با شمارهٔ دنباله (نوشتِ کهنه نمی‌پوشد) + `reloadIfChanged` در ورودِ **هر درخواست** (نمونهٔ خواهر کدهای هم را می‌بیند) + ادغامِ کلیدبه‌کلیدِ تازه‌ترین‌برد. فایلِ `otp.json` فقط فال‌بکِ **توسعهٔ بدون ردیس** است (در production لمس نمی‌شود). |
| 2 | **Rate limit** — شمارنده‌هایِ پنجرهٔ لغزان (OTP send/login: phone/ip/daily؛ WAF ip/rule) | `server/rate-limit.js`، `cache.checkRateLimit` | `rate:otp:*`، `payesh:rl:waf:*` | پنجره (۶۰s–۸۶٬۴۰s) | `INCR` + تضمینِ `EXPIRE` در یک اسکرپت اتمیک (`incrWithTtl`) — burstِ همزمان سقف را نمی‌شکند؛ خطا = fail-open (ممنوعِ تبدیلِ افتِ Redis به DDoS؛ لبهٔ سخت nginx می‌ماند). |
| 3 | **Session revocation** — denylistِ logout (jti) | `server/revocation.js` | `revoked:<jti>` | باقیِ عمرِ توکن | `SET EX`؛ `sessionFrom` در **هر نمونه** پیش از پذیرشِ نشست آن را می‌خواند ⇒ logout در A همان لحظه در B اثر می‌کند. |
| 4 | **Revoke-all** — «نسخهٔ نشست» کاربر | `server/revocation.js` | `sessver:<userId>` | بدون (قدیمی‌ها با `sv` مردودند) | `INCR`؛ توکن‌ها نسخهٔ صدور را حمل می‌کنند. |
| 5 | **Idempotency** — uidهایِ syncِ پردازش‌شده (۲۴h) | `server/cache.js` + `server/db.js` | `payesh:idempotency:<uid>` + جدولِ PG `server_processed_uids` | ۲۴h | بررسیِ سه‌لایه در `sync.js`: **Redis اول** ← PG ← `store.__processed_uids` (محلی، فقط دفاعِ درون‌فرایند). علامت‌گذاری روی **هر سه** ⇒ replay در نمونهٔ دیگر `duplicate_ignored` می‌شود. |
| 6 | **قفلِ توزیع‌شده** (P0-14) — mutex با token | `server/cache.js` | `payesh:lock:<name>` | ۵–۱۰s | `SET NX EX` اتمیک + رهاکردنِ CAS (`compareAndDelete`) — قفلِ منقضی هرگز توسطِ مالکِ قبلی حذف نمی‌شود. |
| 7 | **کشِ L2** — bootstrap cache + ایندکسِ «مدرسه ⇒ کاربرانِ کش‌شده» | `server/cache.js` | `payesh:cache:bootstrap:<uid>`، `payesh:cache:school:<sid>` | ۳۰۰s / ۶۰s | انقضایِ رویدادی **بین نمونه‌ها** با Pub/Sub (`payesh:pubsub:inval`) + single-flightِ stampede (W11). |
| 8 | **نگهبانِ شمارشِ شناسه** (R97) — پنجرهٔ ۱۰دقیقهٔ 401/403/404 | `server/index.js` | `payesh:enum:<jti>` | ۶۰۰s | `incrWithTtl`؛ REVOKE هم توزیع‌شده (denylist). |

**نتیجهٔ ۱.۱:** همهٔ stateهایِ حیاتیِ **هماهنگ‌سازی** (OTP، session/revocation، rate limit،
idempotency، lock، cache) روی Redis با TTL هستند و بین نمونه‌ها مشترک‌اند.

### ۱.۲) **Fail-closed در production** (P0-13) — موجود ✅

- `server/redis.js::init` — در `NODE_ENV=production`: بدون `REDIS_URL` یا ردیسِ
  غیرقابل‌اتصال ⇒ `ok:false` (فال‌بکِ حافظه **ممنوع**).
- `server/index.js` — در production: `cache.init` شکست خورد ⇒ `process.exit(1)` با `[FATAL]`
  (استارت نمی‌دهد)؛ حتی اگر بالا آمده باشد: `/api/readiness` و `/api/health` تا زنده
  شدنِ Redis **503** (LB نمونه را خارج می‌کند).
- `redis.ready()` — production بدون Redis زنده = false ⇒ health 503.
- (مستقل) production بدون TLSِ معتبر/پروکسیِ اعلام‌شده = fail-fast؛ کلیدِ JWT < 256 بیت = fail-fast.

### ۱.۳) stateهایِ **فرایندی/محلّی** — باقی‌مانده و طبقه‌بندی‌شده

| # | State | کجا | چندنمونه‌ای؟ | تصمیم |
|---|---|---|---|---|
| A | **کلیدِ امضای JWT** — بدون env، در `jwt.key` روی **دیسکِ هر instance** تولید می‌شود | `server/index.js:258` | ❌ **مانع واقعی**: توکنِ صادرشده در A در B نامعتبر (و بالعکس) | **رفع در این دور:** در production وقتی بک‌اندِ مشترک (Redis/PG) پیکربندی شده ولی `PAYESH_JWT_SECRET` env نیست ⇒ **fail-fast در استارت**. در deployment چندنمونه‌ای env الزامی است (سند معماری). |
| B | **دنبالهٔ id_outbox** — شمارندهٔ JS داخل هر instance | `server/outbox.js:nextId` | ❌ **مانع واقع‌نظر**: با PG مشترک، دو instance ممکن است id یکسان بدهند ⇒ `ON CONFLICT DO NOTHING` در `server_outbox` رویداد را **ساکت می‌ریزد** | **رفع در این دور:** وقتی Redis زنده است، id از `INCR payesh:outbox:seq` (مشترک، monotonic) می‌آید؛ حالتِ بدون ردیس (توسعهٔ تک‌نمونه‌ای) شمارندهٔ محلی می‌ماند. |
| C | **Datastore** — `memoryStore` (JSON در حافظه) + فایلِ `payesh.json`ِ **هر instance** (persist هر ۲s) | `server/index.js` + `worker-service.js` | ❌ **بزرگ‌ترین شکاف** — ولی یک موجِ مستقل است (Wave 1/3) و **نیمه‌مسیر است**: (الف) نوشت‌هایِ sync/sms/delete در **PG تراکنشی** (W1p2)؛ (ب) نوشت‌هایِ REST در **آینهٔ PG** (persistOpsBatch/persistOp)؛ (ج) خوانش‌ها: **bootstrap + pull = DB-native** (W1: `db.readCollection`) و **GET-listهایِ students/attendance/grades/classes/users = DB-native** (W3: `dbquery.js`). بقیهٔ خوانش‌ها (REST GET بقیهٔ کالکسیون‌ها + خوانش‌هایِ داخلی) هنوز از storeِ فرایند. | **خارج از دامنهٔ این دور** (قلمِ W1/W3 ادامه) — با جدولِ دقیق در `MULTI_INSTANCE_ARCHITECTURE.md` §۴. نتیجهٔ عملی: **بدون PG، datastore تک‌نمونه‌ای است** و deployment چندنمونه‌ای الزاماً PG دارد (آن‌وقت داده از PG می‌رود و می‌آید؛ store فقط seed/فال‌بکِ توسعه). |
| D | `store.__revoked_jti` (نقشهٔ محلیِ jti) | `server/index.js:88` | ⚠️ فرایندی — ولی **لایهٔ سومِ دفاع**: لایهٔ مشترکِ Redis (revoked:\<jti\>) در `sessionFrom` جدا چک می‌شود ⇒ بین نمونه‌ها **واگرا نمی‌شود** (حداکثر: تا خواندنِ Redis، همان فرایند خود را فوری ابطال دیده است) | حفظ (دفاعِ درون‌فرایند) — تغییری لازم نیست. |
| E | `store.__processed_uids` (نقشهٔ محلیِ idempotency) | `server/index.js:87` | ⚠️ فرایندی — لایهٔ سوم (بند #5 در ۱.۱) | حفظ. |
| F | **کشِ L1** (bootstrap، LRU با سقف + TTL ۶۰s) | `server/cache.js` | ⚠️ فرایندی — ولی **کش است نه state**: انقضایِ رویدادی از طریقِ Pub/Subِ مشترک می‌آید (W11) ⇒ کهنه‌ترین دادهٔ بین نمونه‌ها ≤ ۶۰s + لحظهٔ event | حفظ — مُستند (معیارِ طلایی: دادهٔ state هرگز از L1 خوانده نمی‌شود). |
| G | **صفِ outbox** (حلقهٔ پردازش `store.outbox`) | `server/worker.js` | ⚠️ فرایندی — **سازگار به‌صورتِ عمدی**: کارگر هر instance فقط **cacheِ L1 خودش** را باطل می‌کند (handlerهایِ فعلی = کارِ محلی) ⇒ هر instance باید صفِ خود را پردازش کند. آینهٔ PG (`server_outbox`) فقط برای حسابرسی/بازسازی است. | حفظ — مُستند. (اگر در آینده handlerِ **سراسری** بیاید باید claim توزیع‌شده بگیرد — یادداشت در سند معماری.) |
| H | **ورکرِ Wave 9** (persist/backup/report در رشتهٔ پس‌زمینه) | `server/worker-service.js` | ⚠️ فرایندی — هر instance **فایلِ خود** را می‌نویسد (persist هر ۲s) | در deployment چندنمونه‌ای: `PAYESH_STORE` **برای هر instance جدا** (به‌هم‌ریختنِ دو writer روی یک فایل). مُستند. |
| I | **audit log** (JSONL append-only) | `server/audit.js` | ⚠️ فرایندی — لاگِ محلی (معیارِ Play: لاگِ هر نمونه جدا؛ تجمیع در سمتِ جمع‌آوری) | حفظ — مُستند. |
| J | **کشِ استاتیک** (mtime-based) | `server/static-cache.js` | ⚠️ فرایندی — کشِ خواندنِ فایلِ build | حفظ — مُستند. |
| K | `REQ_STATE` (شیءِ module-level برایِ روتر) | `server/index.js:159` | 🔴 **مشاهدهٔ کنکاشی (خارج از دامنهٔ رفع)**: زیرِ درخواست‌هایِ هم‌زمانِ **یک** instance، `sess` می‌تواند توسطِ درخواستِ دیگر سای بخورد ⇒ نسبت‌دادنِ شمارشِ enum به نشستِ اشتباه. state بین نمونه‌ها نیست (فرایندی) ولی **باقی‌ماندهٔ واقعیِ concurrency** است — پیشنهادِ دورِ بعد: context per-request. | **فقط مُستند شد** (تغییر، تغییرِ رفتارِ روتر است و به آزمون‌هایِ R97 می‌خورد؛ با دستور). |

### ۱.۴) چیزهایی که **state نیستند** (برایِ تکمیلِ لیست)

- `db.js`: poolهایِ اتصال (primary + read-replica) — stateless API، هر instance pool خودش؛ PG مشترک.
- `tracing.js` (OTel)، `waf.js` (detect-only؛ شمارشش روی Redis است — بند #2).
- `admin.js`: تایمرِ backup — فرایندی، خروجی = فایل/کپی؛ در چندنمونه‌ای backup **per-instance**
  (معیار: دادهٔ حقیقت در PG است؛ backupِ PG = کارِ اپراتور — §۵ سند معماری).
- `occ.js`/`validate.js`/`gdpr.js`: توابعِ خالص/درخواستی — state پایدار ندارند.

---

## ۲) جمع‌بندی

| طبقه | وضعیت پیش از این دور | پس از این دور |
|---|---|---|
| OTP | ✅ Redis (P0-15) | ✅ (تغییر نکرده) |
| Session / revocation / revoke-all | ✅ Redis | ✅ (تغییر نکرده) |
| Rate limit (OTP/WAF/enum) | ✅ Redis | ✅ (تغییر نکرده) |
| Idempotency | ✅ Redis + PG (+محلی) | ✅ (تغییر نکرده) |
| Lock / cache L2 / pubsub | ✅ Redis | ✅ (تغییر نکرده) |
| Fail-closed (Redis down ⇒ not ready) | ✅ P0-13 | ✅ (تقویت: تستِ چندنمونه‌ایِ آن در `tests/multi-instance.js`) |
| **JWT secret** | ❌ per-instance generation ساکت | ✅ **fail-fast** در production با بک‌اندِ مشترک + env الزامی |
| **outbox id** | ❌ counter فرایندی (تلاقی در PG مشترک) | ✅ **`INCR` مشترک** وقتی Redis زنده است |
| Datastore (memoryStore + payesh.json) | ❌ فرایندی (نیمه‌مسیرِ W1/W3) | ❌ **باز** — قلمِ موجِ W1/W3 (جدولِ کامل در سند معماری §۴) |
| L1 / outbox queue / audit / static | ⚠️ فرایندی (به‌صورتِ عمدی) | ⚠️ **مُستند** (کش/لاگ/صفِ کارِ محلی — state حیاتی نیستند) |

**پاسخ به سؤال P0 #2:** stateهایِ حیاتیِ هماهنگ‌سازی **همه** روی Redis/PG با TTL هستند
(P0-13/14/15 از دورهای پیش — این دور آن‌ها را **ممیزی و قفل** کرد، نه ساخت). دو مانعِ واقعیِ
چندنمونه‌ای که مانده بود (کلیدِ JWT و id outbox) در این دور رفع شد؛ مانعِ اصلیِ باقی‌مانده
(datastore) یک موجِ جداست که نیمه‌راه است و جدولِ دقیقِ آن در
`docs/MULTI_INSTANCE_ARCHITECTURE.md` ثبت شد.

## ۳) روشِ راستی‌آزمایی

- ممیزی: خواندنِ کدبه‌کدِ ۱۰ ماژولِ صاحبِ state + گشتِ `new Map()`/`setInterval`/فایل‌نویش
  در کلِ `server/`.
- قفلِ رفتاری: `tests/multi-instance.js` (دو فرایندِ واقعی + یک Redis مشترکِ شبیه‌سازی‌شده
  روی TCP — همان الگویِ fake-RESPِ `tests/arena5-recovery.js`) — write A → read B →
  update B → read A + fail-closed. جزئیات در `docs/MULTI_INSTANCE_ARCHITECTURE.md`.
