# گزارش دور ۱۰۵ (چت ۳) — Wave 1 بخش دوم: انتقال Writes و Transactions به PostgreSQL

**تاریخ:** ۲۰/۰۶/۱۴۰ (2026-09-09)
**شاخه:** `arena/01a08545-p2`
**مأموریت (ناظر):** Wave 1 بخش ۲ — اسنکواریِ نوشت‌ها به store، انتقالِ نوشت‌هایِ باقی‌مانده به PG، تراکنش‌بندیِ عملیات‌هایِ چندمرحله‌ای، تست‌هایِ جدید + دروازه‌هایِ سلامت.

---

## ⚠️ انحرافِ ثبت‌شده: نامِ شاخه

ناظر خواستارِ شاخهٔ `feat/wave1-writes-chat3` بود. این سشن در Arena به
`arena/01a08545-p2` **مسمر (pin)** است و کار روی هر شاخهٔ دیگری با سشن
ارتباط نمی‌گیرد — امکانِ تغییر نبود. همهٔ کار روی شاخهٔ مسمر انجام و
فشار داده شد؛ این انحراف با رضایتِ پیش‌فرضِ کارفرما (کار فقط روی شاخهٔ
مجاز) در این گزارش و HANDOFF ثبت شد.

## ۱. اسنکواری (تفویضِ اول)

`docs/WAVE1_WRITES_INVENTORY.md` — هر نوشتِ سمتِ سرور با وضعیتِ دقیق:

| دسته | مسیر | وضعیت PG |
|---|---|---|
| sync batch (opsِ کلاینت) | `server/sync.js` | ✅ اتمیک (تک‌تراکنشِ کل دسته — P1-14، از قبل) |
| **نوتیفیکیشن‌هایِ مشتق (تازه)** | `server/sync.js` | ✅ اتمیک — در **همان تراکنشِ mirror** |
| REST routes (attendance/classes/grades/students/users) | `server/routes/*` | ✅ best-effort (تک‌رکوردی، از قبل) |
| **sms آیتم (تازه)** | `server/sms.js` | ✅ یک تراکنش: sms_log + sms_wallet + notify_queue (یا رکوردِ failed) |
| **حذفِ نرم (تازه)** | `server/delete-service.js` | ✅ یک تراکنش: DELETE + رویدادِ `server_outbox` |
| **outbox append (تازه)** | `server/outbox.js` | ✅ داخل تراکنشِ فراخوان (client اختیاری) |
| فقط-JSONِ سازِ‌عملکرد | جلسات/JTI، OTP، گورناخن‌ها، `sync_conflicts`، صفِ outbox، فایل‌هایِ بکاپ/audit | ✅ بدون جدول — دلیل‌بندی‌شده در سند |

**یافتهٔ مهم:** عملیات‌هایِ چندمرحله‌ای (حضور گروهی، ثبتِ نمرات، ساختِ
دانش‌آموز + ثبت‌نام) سمتِ کلاینت به‌صورتِ چند op در یک batch می‌آیند →
اتمی‌بودنشان در سطحِ batch تأمین است؛ REST routes تک‌رکوردی‌اند و
تراکنشِ چندگانه ندارند.

## ۲. تغییراتِ کد (۵ فایل)

1. **`server/outbox.js`** — `append(event, client)`: client اختیاری؛
   `outboxInsertSql`/`outboxParams` جدا شد. با client → INSERT روی همان
   client (خطا می‌پردازد ⇒ ROLLBACKِ تراکنشِ فراخوان)؛ بدون client →
   اتصالِ جدا + بلعِ خطا (رفتارِ پیشین).
2. **`server/delete-service.js`** — شاخهٔ PG: یک `db.transaction` با
   `persistOpWithClient` + `outbox.append(evt, client)` — all-or-nothing.
   حالتِ حافظه دست‌نخورده.
3. **`server/sms.js`** — ctx += `db`؛ helper `mirrorItem(itemOps, where)`
   (`persistOpsBatch` + try/catch → audit `sms_mirror_failed`؛ پاسخ عوض
   نمی‌شود — الگویِ P1-14). مسیرِ موفق: N نوشت (log+wallet+queue) در یک
   تراکنش؛ مسیرِ شکست: یک رکوردِ `failed` در یک تراکنش.
4. **`server/index.js`** — سیم‌کشیِ sms += `db`.
5. **`server/sync.js`** — `derived = []`؛ هر ۴ hook (conflict/leaves/chat/
   corrections) نوتیفیکیشنِ ساخته‌شده را در `derived` ثبت می‌کند؛ دستهٔ
   پایانی = `mirror.concat(derived)` در یک `persistOpsBatch`.

**تصمیمِ شناختی — idهایِ sms:** max+1 محلی نگه داشته شد (نه دنبالهٔ
مرکزی `ids.js`) چون `NAMESPACES` فقط `{attendance,classes,grades,users}`
است و `sms_log` به دنبالهٔ `users` نگاشت می‌شد. الگو با sync هماهنگ است
و در PG تکرارِ هم‌زمان توسطِ `ON CONFLICT (id)` دفع می‌شود.
**fail-closed:** شکستِ تراکنشِ delete در PG به handlerِ سراسری می‌رسد ⇒
500 (در حالتِ حافظه هیچ‌گاه throw نیست).

## ۳. تست‌ها (تفویضِ سوم)

- **`tests/wave1-writes.js` — 14/14 سبز** (بدون PG واقعی؛ pool/clientِ
  جعلی که انضباطِ فراخوانی را می‌سنجد):
  - W1 sms موفق ⇒ یک BEGIN…COMMIT با سه upsert (log+wallet+queue)
  - W2 sms شکست ⇒ تراکنشِ رکوردِ failed
  - W3 sms شکستِ آینه ⇒ پاسخ بی‌تغییر (200) + ROLLBACK + audit
  - W4 sync ⇒ نوتیفیکیشنِ مشتق (hookِ پیام) در **همان تراکنش**ِ mirror
  - W5 delete ⇒ DELETE و outbox در یک تراکنش (توالیِ BEGIN < هر دو < COMMIT)
  - W6 حالتِ حافظه ⇒ هیچ SQL + همه ok
  - W7 شکستِ delete ⇒ ROLLBACK + throw (نه COMMIT)
- **`tests/wave1-writes-mutations.js` — 5/5 جهش کشته:**
  حذفِ آینهٔ sms (MW1)، حذفِ derived از دستهٔ sync (MW2)، حذفِ بدون
  تراکنش (MW3)، حذفِ شاخهٔ client در outbox (MW4)، حذفِ try/catch آینهٔ
  sms (MW5).

## ۴. دروازه‌هایِ سلامت (تفویضِ چهارم)

| دروازه | نتیجه |
|---|---|
| smoke | **547/547** ✅ |
| check-authz | **0** (۶/۶ بررسی سبز) ✅ |
| secret-scan | **11/11** ✅ |
| build --check | ✅ تطبیق کامل |

## ۵. رگرسیون

همهٔ سوئیت‌هایِ سرور سبز: server1 31/31 · s4 16 · s5 14 · s6 9 · s7 15 ·
s8 9 · s9 10 · s10 7 · s11-sms 9 · s11-mut 6/6 · s12 43 · s13 9 · s14 13 ·
s15 40 · s16 39 · s17 70 · s18 55 · tombstone 25 · occ 18 · id-collision 11 ·
lock-atomic 12 · sync-atomic-batch 22.

**پیشینهٔ ثبت‌شده (نه رگرسیونِ این دور):** `tests/server-mutations.js`
= 17/20 (M1 jti و M14/M15 — الگوها در `server/auth.js` پیدا نمی‌شوند؛
روی in-treeٔ تمیز با `git stash` راستی‌آزمایی شد) و `tests/server11-child.js`
که helperِ فرزند است (argv می‌خواهد) و به‌تنهایی کرش می‌کند.

## ۶. کامیت‌ها و فشار (push)

- **کامیت ۱ (هسته + تست‌ها):** `45ef4c4` — ۵ فایلِ سرور + ۲ فایلِ تست
- **کامیت ۲ (مستندات):** `89352ca` — `docs/WAVE1_WRITES_INVENTORY.md` +
  AI_PROMPT ۰/۵/۳۰ + ROADMAP B.3 + HANDOFF
- **کامیت ۳:** این گزارش
- **فشار و تأیید:** `git push origin arena/01a08545-p2` موفق
  (`023e63f..89352ca`)؛ `git ls-remote origin arena/01a08545-p2` =
  `89352cafba60d323474f399845b1d8d829fee301` = HEADِ محلی در لحظهٔ
  تأیید (کامیتِ این گزارش بلافاصله پس از آن و در همان فشار/پوشِ بعدی
  قرار گرفت).

## ۷. بدهی/پیشنهادِ بعدی (برایِ ناظر)

- REST routes هنوز best-effort‌اند (تک‌op)؛ اگر روزی درخواستِ
  چندرکوردیِ مستقیمِ REST بیاید، `persistOpWithClient` + `db.transaction`
  آماده است.
- جدول‌هایِ `server_processed_uids` و `server_outbox` آینه‌اند؛ منبعِ
  حقیقتِ صف‌ها اسنپ‌شات است (سازِ‌عملکرد).
- بخشِ سومِ Wave 1 (اگر توسطِ ناظر تعریف شود): مهاجرتِ خوانش‌هایِ
  باقی‌مانده از store به PG (بخش ۱ را چت ۲ دارد).
