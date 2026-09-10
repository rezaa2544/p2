# معماری چندنمونه‌ای امن — P0 #2 (Production Readiness Checklist بخش ۲۷)

**تاریخ:** ۱۹/۰۶/۱۴۰۵ (2026-09-10) · **شاخه:** `arena/01a08545-p2` (چت ۳)
**ملاک:** «معماری چندنمونه‌ای امن» — تمام stateهایِ حیاتی از حافظهٔ محلی و فایل به
Redis/PostgreSQL منتقل شود تا سیستم با چند instance API کار کند.
**ممیزیِ کامل:** `docs/MULTI_INSTANCE_AUDIT.md` · **اثبات رفتاری:** `tests/multi-instance.js`

---

## ۱) معماری هدف

```
                    ┌────────────────بالانس بار/Ingress (TLS)────────────┐
                    │   (readiness probe: GET /api/readiness)         │
        ┌───────────┴──────┐                        ┌─────────────────┴──────┐
        │   instance A     │                        │      instance B        │
        │  node index.js   │                        │      node index.js     │
        │  (store seed,    │                        │     (store seed,       │
        │   L1 cache,      │                        │      L1 cache,         │
        │   outbox queue)  │                        │     outbox queue)      │
        └───┬──────────┬───┘                        └───┬──────────┬─────────┘
            │          │                                │          │
     ┌──────▼───┐  ┌───▼──────────────┐          ┌──────▼───┐  ┌───▼──────────────┐
     │ Redis    │  │ PostgreSQL       │          │ Redis    │  │ PostgreSQL       │
     │ (مشترک:  │  │ (مشترک: دادهٔ   │          │ (مشترک)  │  │ (مشترک)          │
     │  state)  │  │  اپ + آینه)     │          │          │  │                  │
     └──────────  └──────────────────          └──────────┘  └──────────────────┘
```

قانون: **هیچ state حیاتی در حافظهٔ فرایند یا فایلِ اختصاصیِ هر instance نمی‌ماند**؛
فایل‌هایِ محلی (payesh.json، otp.json، audit.log، jwt.key) در حالتِ چندنمونه‌ای فقط
**seed/بوت‌استرپ و لاگِ محلی** هستند.

## ۲) لایهٔ state مشترک (Redis) — نقشهٔ کلیدها

| کلید | TTL | owner (ماژول) | قاعده |
|---|---|---|---|
| `payesh:otp:state` | پُرین ۲۵h | `otp-store.js` (P0-15) | منبعِ حقیقتِ OTP: codes(hashes)+cooldown+login_fail+**tomb**؛ فلاش زیر قفل (P0-14) با seq؛ `reloadIfChanged` در ورودِ هر درخواست ⇒ نمونهٔ خواهر کدهایِ هم را همان لحظه می‌بیند |
| `rate:otp:send:{phone|ip}:…`، `rate:otp:login:ip:<ip>` | پنجره (۶۰s–۸۶٬۴۰s) | `rate-limit.js` | `INCR`+`EXPIRE` اتمیک (اسکرپت) — burst سقف را نمی‌شکند؛ fail-open (لبهٔ سخت nginx) |
| `payesh:rl:waf:{ip|rule}:…` | ۶۰s | `cache.checkRateLimit` | همان قرارداد |
| `payesh:enum:<jti>` | ۶۰۰s | `index.js` (R97) | نگهبانِ شمارشِ شناسه |
| `revoked:<jti>` | باقیِ exp | `revocation.js` | denylist — logout در A ⇒ 401 در همهٔ نمونه‌ها |
| `sessver:<uid>` | — | `revocation.js` | revoke-all با «نسخهٔ نشست» |
| `payesh:idempotency:<uid>` | ۲۴h | `cache.js` (+ PG `server_processed_uids`) | replay در هر نمونه `duplicate_ignored` |
| `payesh:lock:<name>` | ۵–۱۰s | `cache.js` (P0-14) | `SET NX EX` + رهاکردنِ CAS |
| `payesh:cache:bootstrap:<uid>`، `payesh:cache:school:<sid>` | ۳۰s / — | `cache.js` (W11) | کشِ L2 + انقضایِ رویدادیِ بین‌نمونه‌ای (Pub/Sub `payesh:pubsub:inval`) |
| `payesh:outbox:seq` | — | `outbox.js` (**تازه در این دور**) | دنبالهٔ **سراسری** id رویدادها — صفرِ تلاش‌تلاقی در `server_outbox`ِ PG مشترک |

## ۳) Fail-closed و fail-fast (production)

| در | رفتار |
|---|---|
| Redis نباشد / ناپایدار (P0-13) | **استارت نمی‌دهد** (`[FATAL]` + exit 1) — فال‌بکِ حافظه فقط در توسعه. اگر بالا آمده باشد: `/api/readiness` و `/api/health` تا زنده شدن = **503** (LB نمونه را خارج می‌کند) |
| TLS نباشد (یا self-signed) | استارت نمی‌دهد (یا پشت پروکسیِ اعلام‌شده `PAYESH_BEHIND_PROXY=1`) |
| کلیدِ JWT < 256 بیت | استارت نمی‌دهد |
| **بک‌اندِ مشترک (Redis/PG) بدونِ `PAYESH_JWT_SECRET`** (**تازه در این دور**) | استارت نمی‌دهد — کلیدِ تولیدشدهٔ per-instance، جلساتِ چندنمونه‌ای را ساکت می‌شکست |
| PG نباشد | (تک‌نمونهٔ production) مجاز — ولی **چندنمونه‌ای بدون PG معنای ندارد** (بند ۴) |

## ۴) planeِ datastore — شکافِ باقی‌مانده (صادقانه)

دادهٔ اپ (students/grades/…) هنوز **دو-حالته** است: store فرایند + آینهٔ PG. وضعیتِ
هر مسیر (بر پایهٔ Wave 1/2/3 که روی main است):

| مسیر | PG؟ |
|---|---|
| **نوشت‌های sync** (صفِ offline) | ✅ **تراکنشی** (W1p2) — all-or-nothing + آینهٔ outbox |
| **نوشت‌های SMS** (sms_log/wallet/notify) | ✅ **تراکنشی** (W1p2) |
| **حذف‌های REST** (delete-service) | ✅ **تراکنشی** (W1p2) |
| **نوشت‌های REST تک‌رکوردی** (create/update در ۵ route) | ✅ آینهٔ PG (persistOp(sBatch)) — best-effort (شکست = لاگ، پاسخ داده شده) |
| **خوانش bootstrap** | ✅ DB-native (W1: `db.readCollection`) |
| **خوانش pull/delta** | ✅ DB-native (W1) |
| **GET-list**: students, attendance, grades, classes, users | ✅ DB-native (W3: `dbquery.js` + keyset pagination) |
| **GET-list بقیهٔ کالکسیون‌ها** | ❌ store فرایند (باقی‌ماندهٔ W3) |
| **خوانش‌هایِ داخلی** (sessionFrom→users، bell، conflicts، public-report، ...) | ❌ store فرایند |

**نتیجه:** «write A → read B» روی **دادهٔ اپ** زمانی برقرار است که خوانش از PG بیاید
(مسیرهایِ بالا ✅)؛ مسیرهایِ ❌ هنوز به store فرایند وابسته‌اند و برایِ چندنمونه‌ای
الزاماً باید DB-native شوند — این **دامنهٔ ادامهٔ Wave 1/3** است (چت ۲)، نه P0 #2.
P0 #2 = stateهایِ **حیاتیِ هماهنگ‌سازی** که همین حالا همگی مشترک‌اند (§۲).
در این ساندباکس PG زنده نیست ⇒ اثباتِ plane داده «در انتظارِ زیرساخت» (الگوی W18/W19)؛
اثباتِ plane هماهنگ‌سازی (OTP/جلسه/نرخ/tombstone/outbox/idempotency) با **دو فرایندِ
واقعی + Redis مشترک** انجام شد (§۶).

## ۵) الزاماتِ deployment چندنمونه‌ای (چک‌لیست)

1. **هر instance:** `PAYESH_STORE` و `PAYESH_AUDIT` و `PAYESH_KEY` **جدا** (هرگز دو
   writer روی یک فایل). payesh.json = seed بوت (از یک seedِ مشترک تولید می‌شود).
2. **مشترک:** `REDIS_URL` (یا sentinel/cluster) · `DATABASE_URL` (+ `READ_DATABASE_URL` اختیاری)
   · `PAYESH_JWT_SECRET` (همان مقدار در همه — ≥32 بایت) · `PAYESH_JWT_SECRET_PREV` برایِ rotation.
3. **LB/Ingress:** TLS (یا `PAYESH_BEHIND_PROXY=1`) · probe = `GET /api/readiness`
   (readiness 503 ⇒ نمونه از ترافیک خارج می‌شود) · liveness = `/api/liveness`
   (عمداً وابستگی نمی‌بیند — طوفانِ ری‌استارت نمی‌سازد).
4. **Graceful:** SIGTERM ⇒ drain (W15) — rollout با maxSurge=1/maxUnavailable=0.
5. **PG:** source of truthِ داده — backup/PITR با ابزارِ اپراتور (backupِ اپ
   `POST /api/admin/backup` = پشتیبانِ store فرایندِ همان instance — در چندنمونه‌ای
   backupِ اصلی = PG).
6. **Redis:** AOF (appendonly yes + everysec) — state حیاتی نباید با restartِ Redis بمیرد
   (الگوی `ops/redis/` چت ۴).

## ۶) شواهد (این دور)

- `tests/multi-instance.js` **17/17** — دو فرایندِ واقعی + fake-Redis مشترک (TCP):
  - write A (send-code) → read B (login 200) → read A (/me 200 با کوکیِ B)
  - update B (logout) → read A (401 — denylist مشترک) + read B (401 فوری)
  - مرگِ کد در B ⇒ replay در A = bad_code (**tombstone مشترک**) + cooldown مشترک
  - rate limitِ IP مشترک (۸ ارسال در A ⇒ 429 در B)
  - fail-closed (production + Redis مرده ⇒ exit 1) + fail-fastِ کلیدِ نشستِ مشترک (exit 1)
  - outbox: ۳۰ append متناوب از دو outbox ⇒ ۳۰ id منحصر‌به‌فرد روی `payesh:outbox:seq`
  - idempotency: mark در «A» ⇒ read در «B»
- گیت‌هایِ استاندارد (پایانِ دور): smoke 547/547 · check-authz 0 · secret-scan 11/11 ·
  wave6 22/22 · wave15 10/10 · arena5-recovery 32/32 · build --check.

## ۷) محدودیت‌ها و کارهایِ باز (صادقانه)

1. **Datastore plane** — GET-list بقیهٔ کالکسیون‌ها + خوانش‌هایِ داخلی ⇒ DB-native
   (ادامهٔ W1/W3 — چت ۲). تا آن‌وقت، deployment چندنمونه‌ای فقط روی مسیرهایِ §۴ِ ✅
   داده‌ای‌ست و بقیهٔ خوانش‌ها store فرایندِ همان instance را می‌بینند.
2. **outbox queue** — کارگر هر instance صفِ **خود** را پردازش می‌کند (handlerهایِ فعلی
   = باطل‌کردنِ کشِ محلی ⇒ درست به‌صورتِ عمدی). اگر handlerِ **سراسری** بیاید باید
   claim توزیع‌شده (قفل/`FOR UPDATE SKIP LOCKED`) بگیرد.
3. **`REQ_STATE` در روتر** — شیءِ module-level؛ زیرِ درخواست‌هایِ هم‌زمانِ یک instance
   نسبت‌دادنِ شمارشِ enum به نشستِ اشتباه ممکن است (فرایندی، نه بین‌نمونه‌ای) —
   پیشنهاد: context per-request (با دستور؛ آزمون‌هایِ R97 را لمس می‌کند).
4. **backupِ اپ** در چندنمونه‌ای = per-instance؛ منبعِ حقیقتِ recovery = PG (PITR).
5. **اجرایِ زندهٔ چندنمونه‌ای** (۲+ instance واقعی با PG/Redis زنده) — «در انتظارِ
   زیرساخت» (الگوی W18/W19)؛ این دور با شبیه‌سازیِ قراردادسازگار (fake-RESP روی TCP)
   اثبات شد.
