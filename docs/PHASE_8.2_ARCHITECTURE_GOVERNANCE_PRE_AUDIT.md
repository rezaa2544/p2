# CHAT4 — PHASE 8.2 ARCHITECTURE GOVERNANCE PRE-AUDIT

```
HEAD:        bc68b2b539bf5b59aa0108c0959af767ea57ce35  (تأییدشده — بدون drift)
AUDIT DATE:  2026-09-20
AUTHOR:      چت ۴ — معمار ارشد مستقل / مرجع حاکمیت معماری
MODE:        AUDIT-ONLY — صفر mutation روی کد (هیچ فایل کد/پیکربندی تغییر نکرد)
SCOPE GUARD: بدون تکرار تست‌های Chat1 · بدون Performance audit (Chat2) · بدون Red-Team S3/S4 (Chat3)
```

> **ماهیت این سند:** این گزارش یک بازبینی پس از تحویل نیست. این یک **قرارداد پذیرش مستقل و از پیش تعیین‌شده** است
> که وقتی چت ۱ تحویل S2 را ارائه داد، مستقیماً علیه آن اعمال می‌شود — تا معیار پذیرش در لحظهٔ تحویل «ساخته» نشود.
>
> **قیود ضدِ greenwashing (لازم‌الاجرا):** هیچ استنتاجِ «سند هست ⇒ کار می‌کند»، «تست هست ⇒ پاس شده»،
> «پیکربندی شده ⇒ عملیاتی است»، «E3 ⇒ E4»، «هدف ⇒ اندازه‌گیری‌شده» پذیرفته نیست.
> جایی که شواهد نیست، عبارت **«NOT VERIFIED — EVIDENCE MISSING»** می‌آید، نه حدس.

---

## ۱. S2 Architecture Acceptance Matrix

| Area | Required architectural property | Current state | Required evidence | Risk |
|---|---|---|---|---|
| **R6** | ابطال نشست باید یا PG-backed باشد یا پنجرهٔ fail-open کران‌دار و امضاشده | **DISCOVERED — fail-open تأییدشده**: `server/revocation.js:39-40` → `catch ⇒ return false`؛ `sessver:<uid>` **بدون TTL** و **فقط در Redis**؛ صفر جدول PG (grep روی `migrations/` خالی) | سند تصمیم + تست اجراشدنی که پنجره را **اندازه بگیرد** | **P1** |
| **R7** | backpressure = availability policy، نه security invariant | **VERIFIED (کد)**: `server/sync.js:674-682` advisory + audit؛ `server/auth.js:259,315` hard 503 | تحلیل عددی noisy-tenant + امضای مالک | **P2** |
| **SLO** | هر SLI از telemetry موجود قابل استخراج | **PARTIAL** — پایه‌ها موجود، ۵ حوزه بدون متریک | `docs/SLO.md` با ۱۱ ستون | **P1** |
| **Metrics** | خطاهای authority و audit قابل رصد | **NOT VERIFIED** — `payesh_audit_write_failures_total` و `payesh_authority_unavailable_total` صفر ارجاع در `server/` | انتشار متریک + قانون آلارم | **P1** |
| **Alert ownership** | هر آلارم قابل انتساب به مالک | **NOT VERIFIED** — ۱۱ آلارم، فقط `severity`، صفر `owner`/`team` | برچسب + routing واقعی | **P0 (S3)** |
| **Redis cache-only** | هیچ حالت مرجعی در Redis نماند | **BLOCKED — نقض معماری**: حالت ابطال تنها در Redis زندگی می‌کند | تصمیم صریح: پذیرش مستند یا PG-backing | **P1** |
| **PostgreSQL SoT** | مسیر authority کاملاً PG | **VERIFIED** — R1 49/49 و R2 32/32 اجراشده توسط ممیز؛ الگوی hydrate با `source:'PG_AUTHORITY'` | نگهداری وضعیت سبز | — |
| **Security (stale cache)** | کش کهنه نباید مجوز بدهد | **BLOCKED** — Redis خالی پس از restart ⇒ `isRevoked=false` ⇒ توکن ابطال‌شده پذیرفته می‌شود | اثبات اجراشدنی cold-cache | **P1** |

---

## ۲. R6 Architecture Contract

### پاسخ به پرسش اصلی — «آیا معماری فعلی واقعاً با PG-as-SoT و Redis-cache-only سازگار است؟»

> ### خیر. این یک تنش معماری واقعی است، نه صرفاً یک fail-open تاکتیکی.

شواهد تأییدشدهٔ مستقل (بازبینی `server/revocation.js`، ۶۸ خط، کامل):

- `server/revocation.js` **تنها** مصرف‌کنندهٔ کلیدهای `sessver:` و `revoked:` است — هیچ ماژول دیگری آن‌ها را نمی‌نویسد.
- هیچ migration جدول ابطال یا نسخهٔ نشست تعریف نکرده است.
- `sessver:<userId>` **عمداً بدون TTL** است (خط ۱۳ خود فایل: «`sessver:<userId>` (بدونِ TTL)») — یعنی Redis نگهدارندهٔ حالت **ماندگار** است، نه ephemeral.
- نتیجهٔ معماری: **از دست رفتن Redis = از دست رفتن دائمی حالت امنیتی**. این دقیقاً تعریف «authority» است، نه «cache».

### قرارداد پذیرش R6 (چت ۱ باید به تک‌تک این‌ها پاسخ دهد)

| # | پرسش | قرارداد پذیرش |
|---|---|---|
| R6-C1 | رفتار در قطعی Redis | نقل صریح `revocation.js:39-40`؛ اعلام بی‌پردهٔ fail-open |
| R6-C2 | `isRevoked` | باید بگوید تنها دفاع باقی‌مانده `store.__revoked_jti` است (per-process، `server/auth.js:87`) |
| R6-C3 | نسخهٔ نشست | باید بپذیرد `sessver` بدون TTL = حالت ماندگار در لایهٔ ephemeral |
| R6-C4 | **cold cache** | **بحرانی‌ترین بند:** Redis خالی ⇒ `getSessionVersion=0` ⇒ همهٔ توکن‌های قدیمی دوباره معتبر می‌شوند. باید صریحاً پذیرفته یا رفع شود |
| R6-C5 | Redis restart | همان C4، با پیوند صریح به بخش Redis recovery در S4 |
| R6-C6 | در دسترس بودن PG | ابطال هیچ مسیر PG ندارد ⇒ قطعی PG اثری بر ابطال ندارد. باید ثبت شود |
| R6-C7 | حالت کهنهٔ ابطال | کران زمانی = TTL توکن (پیش‌فرض ۲۸۸۰۰ ثانیه، `revocation.js:25`) — باید **عدد** بیاید، نه «حدود ۸ ساعت» |
| R6-C8 | مالک + مسیر تشدید | نقش مشخص + ارجاع به `docs/ONCALL_SCHEDULE.md §۲` |
| R6-C9 | **تست قابل‌اندازه‌گیری** | سناریو: revoke → توقف Redis → درخواست با توکن ابطال‌شده → خروجی واقعی ثبت شود |

### سه گزینهٔ معماری مجاز (انتخاب با چت ۱، اما باید دقیقاً یکی انتخاب و امضا شود)

1. **PG-backing** برای `session_version` — Redis صرفاً کش خواندنی. سازگارترین با ناوردا.
2. **پذیرش مستند** با کران سخت: کاهش TTL توکن + آلارم روی `payesh_redis_up` + ثبت در Risk Register.
3. **Fail-closed** روی مسیرهای حساس: رد درخواست وقتی Redis در دسترس نیست. امن‌ترین، پرهزینه‌ترین.

> **رد خودکار:** هر متنی که ادعا کند «Redis همچنان cache-only است» بدون پرداختن به `sessver` بدون‌TTL، رد می‌شود.

---

## ۳. R7 Architecture Contract

### تفکیک الزامی (برای جلوگیری از اختلاط R7 با R1/R2)

| لایه | طبقه‌بندی | شواهد کد |
|---|---|---|
| OTP / login rate-limit | **SECURITY INVARIANT — fail-CLOSED** | `server/auth.js:259,315` → HTTP 503 · `server/rate-limit.js:52` صراحتاً «Fail CLOSED» |
| sync ops backpressure | **AVAILABILITY / LOAD-MANAGEMENT POLICY — advisory** | `server/sync.js:679` → audit + ادامهٔ نوشتن |
| authz | **SECURITY INVARIANT — hard gate، مستقل از Redis** | کامنت `server/sync.js:676`: «auth is the hard gate» |

این تفکیک در کد **درست** است و نباید تغییر کند. وظیفهٔ S2 صرفاً **رسمی‌کردن** آن است.

### قرارداد پذیرش R7

| # | قرارداد |
|---|---|
| R7-C1 | اعلام صریح: قطعی Redis ⇒ نوشتن sync بدون throttle ادامه می‌یابد |
| R7-C2 | اثبات اینکه authz تحت تأثیر قرار نمی‌گیرد (ارجاع مستقیم به کد) |
| R7-C3 | **عدد** بدترین حالت noisy-tenant: نرخ × مدت قطعی = حجم نوشتن کنترل‌نشده |
| R7-C4 | رفتار `payesh_sync_queue_depth` و `payesh_sync_backpressure_rejections_total` هنگام قطعی |
| R7-C5 | توجیه اینکه چرا 503 انتخاب نشد — تصمیم availability امضاشده |
| R7-C6 | مالک + مسیر تشدید + تست اجراشدنی |

> ⚠️ **قید ضدِ اختلاط:** R7 **نباید** توجیهی برای هیچ تضعیفی در R1/R2 شود.
> «advisory بودن backpressure» هرگز نباید به «advisory بودن authority» تعمیم یابد.

---

## ۴. SLO Architecture Contract

موجودی telemetry تأییدشده از `server/metrics.js` — با **سقف کاردینالیتی ۱۰۲۴ سری به ازای هر متریک** و شمارش drop (خطوط ۱۹–۲۱ و ۱۲۳).

| SLO مورد نیاز | متریک موجود؟ | دقیقاً همان را می‌سنجد؟ | alertable؟ | حکم |
|---|---|---|---|---|
| API availability | `payesh_http_requests_total` ✅ | بله (نسبت 5xx) | ✅ | **MEASURABLE** |
| API latency p95/p99 | `payesh_http_request_duration_seconds_bucket` ✅ | بله (histogram) | ✅ | **MEASURABLE** |
| write-path latency | ❌ بدون تفکیک مسیر نوشتن | خیر — HTTP کلی است | — | **SLO NOT MEASURABLE** |
| PostgreSQL availability | `payesh_db_up` ✅ | بله | ✅ | **MEASURABLE** |
| رفتار خطای PG | `payesh_db_query_errors_total` ✅ | بله | ✅ | **MEASURABLE** |
| وابستگی Redis | `payesh_redis_up` ✅ | بله | ✅ | **MEASURABLE** |
| authentication | `payesh_auth_rejections_total` ✅ | بله | ✅ | **MEASURABLE** |
| **audit persistence** | ❌ صفر ارجاع در `server/` | — | — | **SLO NOT MEASURABLE — P1** |
| **canary / control-plane** | ❌ متریک اختصاصی ندارد | — | — | **SLO NOT MEASURABLE — P1** |
| event / outbox | `payesh_outbox_depth` ✅ | عمق بله، تأخیر خیر | جزئی | **PARTIAL** |
| **migration safety** | ❌ | — | — | **SLO NOT MEASURABLE — P2** |
| **backup / restore · RPO · RTO** | ❌ | — | — | **SLO NOT MEASURABLE — P1** |
| DB connections (۳۵۰۰) | `payesh_db_pool_total` ✅ | بله | ✅ | **MEASURABLE** |

### قید ضدِ greenwashing روی اعداد مقیاس

مبنای مقیاس ملی که باید عیناً حفظ شود:
**۱۰M کاربر · ۲٫۵M همزمان · ۲۰k RPS · ۲٫۵k TPS · ۲۵k events/s · ۲۵k IOPS · ۳۰۰ MB/s · ۴۵k Redis ops/s · ۳۵۰۰ اتصال DB**

هیچ‌یک از این اعداد امروز اندازه‌گیری نشده است. `docs/CAPACITY_MODEL.md` خودش تصریح می‌کند:
«**وضعیت: مدل رسمی برای طراحی و تست — هنوز اثبات بار واقعی نشده است.**»

⇒ همهٔ SLOهای ظرفیتی اجباراً با برچسب **`TARGET / POLICY`** منتشر شوند.
⇒ طبقه‌بندی `MEASURED` **انحصاراً** در اختیار گزارش Performance چت ۲ است، نه سند SLO.

---

## ۵. Alert → On-call Governance Chain

| حلقه | وضعیت | شواهد |
|---|---|---|
| Metric | **PARTIAL** | ۱۱ آلارم؛ متریک‌های ارجاعی موجودند؛ ۲ متریک حیاتی غایب (بند ۴) |
| Prometheus Rule | **VERIFIED** | `infra/observability/alert-rules.yml` با شرط `for:` |
| Alertmanager | **PARTIAL** | routing موجود است؛ اما `alertmanager.yml:19` → `url: "__WEBHOOK_URL__"` **placeholder** |
| Owner | **MISSING** | صفر برچسب `owner`/`team` روی هر ۱۱ آلارم |
| On-call | **MISSING** | `docs/ONCALL_SCHEDULE.md:4` خودش اعلام می‌کند: «انتساب واقعی افراد **NOT-RUN**»؛ §۶ جدول خالی |
| Acknowledgement | **MISSING** | فقط SLA کاغذی (P0 ≤۵ دقیقه …)؛ هیچ مکانیسم فنی ack وجود ندارد |
| MTTA | **MISSING** | صفر پیاده‌سازی، صفر محل ذخیره |
| Runbook | **VERIFIED** | `docs/INCIDENT_PLAYBOOK.md §۱٫۱` |
| MTTR | **MISSING** | صفر پیاده‌سازی، صفر محل ذخیره |
| Post-incident | **PARTIAL** | قالب موجود است، اجرا نشده |

---

## ۶. S3 Architecture Readiness

> ### PARTIAL — ARCHITECTURAL REMEDIATION REQUIRED
> (S3 **اجرا نشد** — این صرفاً ارزیابی آمادگی معماری است.)

پنج پیش‌نیاز **غیرقابل‌مذاکره** پیش از هر اجرای E4:

1. برچسب `owner`/`team` روی هر ۱۱ آلارم
2. receiver واقعی در Alertmanager (نه `__WEBHOOK_URL__`)
3. انتساب on-call واقعی (رفع وضعیت NOT-RUN)
4. مکانیسم acknowledgement با مهر زمانی ماشین‌خوان
5. تعریف و محل ذخیرهٔ MTTA/MTTR

بدون این پنج مورد، مانور «اجرا می‌شود» اما **قابل انتساب و قابل اندازه‌گیری نیست** ⇒ شواهد E4 تولید نمی‌کند.

---

## ۷. S4 Restore Evidence Contract

> **هیچ restore اجرا نشد.** این بخش صرفاً قرارداد شواهد است.

### پرسش اصلی — «چگونه ثابت می‌کنیم verifier روی DB بازیابی‌شده اجرا شده، نه روی DB مبدأ؟»

> **وضعیت امروز: هیچ مکانیسمی وجود ندارد.**
> `tools/production-verifier.sh:34` صرفاً `DATABASE_URL` را از محیط می‌خواند و **هیچ ادعای هویتی** روی دیتابیس نمی‌کند.
> جستجوی `system_identifier|pg_controldata|inet_server_port|data_directory` در `tools/` و `tests/` هیچ مکانیسم اثباتی نیافت.

### قرارداد اثبات هویت (چهارگانه، اجباری، ثبت‌شده در لاگ پیش و پس از هر گام)

| # | اثبات | فرمان |
|---|---|---|
| I1 | هویت سیستمی PG | `SELECT system_identifier FROM pg_control_system()` — باید با مقدار مبدأ **ثبت و مقایسه** شود |
| I2 | پورت + دایرکتوری داده | `SELECT inet_server_port(), current_setting('data_directory')` — باید پورت ایزوله (`PBR_PORT` پیش‌فرض **۵۴۳۲۹**) و مسیر موقت `$RUN_DIR/data` باشد |
| I3 | **نشانگر canary ایزوله** | ردیفی که **فقط** در نسخهٔ بازیابی‌شده درج شده؛ نبودش یعنی تست روی DB اشتباه اجرا شده |
| I4 | هویت اسکیما/مهاجرت | چک‌سام `schema_migrations` + آخرین version — باید با نقطهٔ بازیابی هم‌خوان باشد |

### ناوردا‌هایی که پس از restore باید دوباره verify شوند

`schema_migrations` (پیوستگی بدون gap — ابزار `tools/migrate-ledger.js` موجود است) · `authority_state` · `ops_kv` ·
وضعیت canary · replay ledger · audit ledger · tenant policy · outbox/DLQ · roles · extensions ·
پیوستگی WAL · checksum · پاک‌سازی قطعی محیط بازیابی

### شکاف ابزاری تأییدشده

`pg_basebackup` در **هیچ** ابزاری استفاده نشده است (تنها `pgbackrest` داخل `tools/pitr-restore.sh`).
⇒ زنجیرهٔ خواستهٔ مأموریت با ابزار موجود **قابل اجرا نیست** مگر ابزار افزوده شود.

نکتهٔ مثبت تأییدشده: `tools/pitr-restore.sh` واقعاً ایزوله می‌کند — `PBR_PORT=54329`، دایرکتوری دادهٔ مستقل،
`fsync=off`، `max_connections=50`، `restore_command` از طریق pgbackrest archive-get، و هدف‌گذاری `--type=time|name|xid`.

### قرارداد بازیابی Redis

**قابل بازیابی:** کش گرم و شمارنده‌ها.
**باید از PG بازسازی شود:** نسخهٔ نشست · tenant policy · وضعیت canary · replay ledger.
**رد قطعی:** هر طراحی که در آن Redis بازیابی‌شده بتواند PG را override کند، یا کش کهنه مجوز صادر کند.

> ⚠️ **تضاد فعال با R6-C4:** بند «کش کهنه نباید مجوز بدهد» با fail-open فعلی `isRevoked` مستقیماً در تضاد است.
> این دو باید هم‌زمان حل شوند، نه جداگانه.

---

## ۸. Chat1 Change-Safety Constraints

«اگر چت ۱ در S2 این تغییرات را انجام داد، کدام regressionها ممنوع‌اند»

| # | قید | آستانهٔ تشخیص regression |
|---|---|---|
| CS-1 | R1 سبز بماند | `node tests/r1-eliminate-ram-authorities.test.js` = **49/0** |
| CS-2 | R2 سبز بماند | `node tests/r2-postgres-authority-fail-closed.js` = **32/0** |
| CS-3 | R21 سبز بماند | unit **8/0** + live-PG **14/14** |
| CS-4 | PostgreSQL مرجع بماند | الگوی hydrate + `source:'PG_AUTHORITY'` در هر ۱۰ ماژول کنترل‌پلن دست‌نخورده |
| CS-5 | Redis ephemeral بماند | **هیچ کلید جدید بدون TTL** — `sessver` تنها استثنای موجود است و باید در R6 حل شود، نه تکثیر |
| CS-6 | صفر RAM authority | Mapهای موجود (`changeRegistry`, `activeReservations`, `_provincialStateStore`, `activeIncidents`, `processedIdempotencyKeys`, `_nationalRegionCache`, `eventHandlersRegistry`) فقط **cache** بمانند — هر نوشتن بدون PG-first یک regression است |
| CS-7 | صفر تصمیم امنیتی کلاینت‌محور | هیچ هدر یا فیلد ورودی نباید مسیر authz را تغییر دهد |
| CS-8 | صفر fail-open جدید | `catch ⇒ return false` روی مسیر امنیتی **ممنوع** (یک مورد موجود است: R6 — تکثیرش ممنوع) |
| CS-9 | صفر fake-green | نبود وابستگی ⇒ **exit ≠ 0**. الگوی فعلی `production-verifier.sh:34` و تست‌های ledger زنده درست است و باید حفظ شود |
| CS-10 | کاردینالیتی کران‌دار | متریک‌های جدید SLO نباید برچسب پرتنوع (`user_id`, `jti`, `school_id`) بگیرند؛ سقف ۱۰۲۴ و `payesh_metrics_dropped_series_total` باید صفر بماند |
| CS-11 | صفر اتوماسیون mutation تولید | S2 صرفاً سند + متریک است؛ هیچ اسکریپت خودکار تغییر محیط تولید نباید افزوده شود |

---

## ۹. Phase 8.3 Entry Conditions

ورود به فاز ۸.۳ **مسدود** است تا همهٔ موارد زیر محقق شوند (بدون هیچ تست بار در این مرحله):

1. R6 — تصمیم امضاشده + تست اجراشدنی
2. R7 — تصمیم امضاشده + عدد noisy-tenant
3. `docs/SLO.md` پذیرفته‌شده، با برچسب صریح `TARGET/POLICY`
4. مالکیت — برچسب آلارم‌ها + انتساب واقعی on-call
5. زنجیرهٔ رصد **از نظر معماری** کامل (۵ حلقهٔ MISSING بسته شده)
6. پیش‌نیازهای S3 (پنج‌گانهٔ بند ۶) محقق
7. پیش‌نیازهای S4 (قرارداد هویت I1–I4 + ابزار basebackup) تعریف‌شده
8. طبقه‌بندی شواهد Performance از **چت ۲** دریافت شده (نه بازتولید توسط چت ۴)
9. صفر بلوکر باز P0/P1 معماری

---

## ۱۰. Master Schedule Integrity

| بررسی | نتیجه |
|---|---|
| S2 → S3 → S4 مجزا و به‌ترتیب | ✅ Seq 23 / 24 / 25 |
| فاز ۸.۳ قبل از خروج ۸.۲ شروع نشود | ✅ قفل — Entry = «8.2 exit» |
| نگاشت W21 | ✅ W21-05 و W21-07 در ۸.۲ · W21-06 و W21-10 در ۸.۴ · W21-09 در ۸.۳ |
| گیت‌های G0–G10 | ✅ دست‌نخورده |
| مسیر بحرانی ۱۴۰ اسپرینت | ✅ حفظ شده — چت ۱ آن را **سخت‌تر** کرد (مسیر سریالی به‌عنوان مبنای کانونی تثبیت شد) |
| میان‌بر مستندی برای دور زدن گیت | ✅ یافت نشد — وابستگی Seq 29 از `21` به `28, G3, G4, G9` تشدید شده است |

**Discrepancy گزارش‌شده (بدون اصلاح، طبق دستور):**
سرصفحهٔ `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md` مدعی «HEAD مبنای کد تأییدشده: `4de6f57d`» است،
در حالی که HEAD واقعی `bc68b2b5` است (۸ کامیت کد جلوتر) — **P2، دفترداری**.

---

## ۱۱. P0/P1/P2/P3 Findings

| ID | یافته | رده | مسدود می‌کند |
|---|---|---|---|
| G-01 | صفر برچسب `owner`/`team` روی ۱۱ آلارم | **P0** | S3 |
| G-02 | receiver = `__WEBHOOK_URL__` (placeholder) | **P0** | S3 |
| G-03 | انتساب on-call = NOT-RUN (به اقرار خود سند) | **P0** | S3 |
| G-04 | مکانیسم فنی acknowledgement وجود ندارد | **P0** | S3 |
| G-05 | MTTA/MTTR غیرقابل اندازه‌گیری | **P0** | S3 |
| G-06 | اثبات هویت DB بازیابی‌شده وجود ندارد | **P0** | S4 |
| G-07 | `pg_basebackup` در هیچ ابزاری نیست | **P0** | S4 |
| **G-08** | **`sessver` بدون TTL فقط در Redis = نقض ناوردای cache-only** | **P1** | S2 + S4 |
| **G-09** | **cold cache ⇒ توکن ابطال‌شده دوباره معتبر می‌شود** | **P1** | S2 + S4 |
| G-10 | `payesh_audit_write_failures_total` هرگز منتشر نمی‌شود | **P1** | S2 (SLO) |
| G-11 | `payesh_authority_unavailable_total` هرگز منتشر نمی‌شود | **P1** | S2 (SLO) |
| G-12 | SLI تأخیر مسیر نوشتن وجود ندارد | **P1** | S2 (SLO) |
| G-13 | `tools/redis-backup.sh:51` — تداخل قفل ⇒ `exit 0` بدون گرفتن بکاپ (fake-green) | **P1** | S4 |
| G-14 | SLOهای ظرفیتی (RPS/TPS/IOPS) هرگز اندازه‌گیری نشده‌اند | **P2** | 8.3 |
| G-15 | HEAD اعلامی در سرصفحهٔ Master Schedule ≠ HEAD واقعی | **P2** | — |
| G-16 | ردیف «نمونهٔ قالب» با تاریخ آیندهٔ `2026-10-05` در میان مانورهای واقعی (`docs/DR_RUNBOOK.md:133`) | **P2** | — |
| G-17 | `tests/canary-atomic-postgres-live-runtime.js:22` به DATABASE_URL پیش‌فرض برمی‌گردد (در بستر S4 می‌تواند DB اشتباه را تست کند) | **P3** (در S4: P1) | — |

---

## ۱۲. Items Chat1 MUST NOT Change

1. الگوی hydrate / PG-first در هر ۱۰ ماژول کنترل‌پلن (ناوردای R1/R2)
2. `server/rate-limit.js:52` fail-CLOSED و نگاشت 503 در `server/auth.js`
3. `tools/production-verifier.sh:34-40` — «نبود وابستگی = FAIL»
4. خروج غیرصفر تست‌های ledger زنده هنگام نبود `DATABASE_URL`
5. سقف کاردینالیتی ۱۰۲۴ و شمارندهٔ `payesh_metrics_dropped_series_total`
6. تفکیک «authz = hard gate» از «backpressure = advisory»
7. وابستگی Seq 29 → `28, G3, G4, G9` در Master Schedule
8. `process.exit(0)` مشروط به `fail === 0` در سوئیت‌های زنده

---

## ۱۳. Items Chat1 MUST Prove

| # | اثبات لازم | شکل شواهد |
|---|---|---|
| ۱ | تصمیم R6 با یکی از سه گزینهٔ معماری بند ۲ | سند + امضای مالک |
| ۲ | رفتار cold-cache (G-09) | تست اجراشدنی با خروجی واقعی |
| ۳ | کران عددی پنجرهٔ fail-open | عدد استخراج‌شده از کد، نه تخمین |
| ۴ | تصمیم R7 + عدد noisy-tenant | سند + محاسبه |
| ۵ | `docs/SLO.md` با ۱۱ ستون و برچسب TARGET/POLICY | سند |
| ۶ | انتشار دو متریک غایب + قوانین آلارم متناظر | کد + rule |
| ۷ | برچسب `owner`/`team` روی هر ۱۱ آلارم | diff پیکربندی |
| ۸ | R1=49/0، R2=32/0، R21=8/0 پس از تغییرات | خروجی خام اجرا |
| ۹ | `payesh_metrics_dropped_series_total` = صفر پس از افزودن متریک‌ها | خروجی endpoint |
| ۱۰ | صفر کلید Redis جدید بدون TTL | grep + توضیح |

---

## ۱۴. Final Architecture Decision

> # PARTIAL — ARCHITECTURAL REMEDIATION REQUIRED

**مبنای این تصمیم:**

- ✅ **هستهٔ authority سالم و مستحکم است** — R1/R2 در ممیزی مستقل اجرا و تأیید شدند (49/0 و 32/0)؛ الگوی PG-first در ۱۰ ماژول منسجم است؛ Mapهای باقی‌مانده اکنون نقش cache دارند نه authority.
- ✅ **Master Schedule دست‌نخورده و حتی سخت‌تر شده است** — هیچ میان‌بری برای دور زدن گیت‌ها ایجاد نشده.
- ✅ **تفکیک fail-closed / advisory در کد درست است** — R7 نیاز به رسمی‌سازی دارد، نه تغییر.
- ⚠️ **یک تنش معماری واقعی کشف شد (G-08/G-09):** حالت ابطال نشست **تنها** در Redis و **بدون TTL** نگهداری می‌شود. این با ناوردای «Redis = cache-only» ناسازگار است و هم‌زمان S2 (R6) و S4 (بازیابی Redis) را لمس می‌کند. پیش‌تر در رجیستر صرفاً به‌عنوان «fail-open پذیرفته‌شده» ثبت شده بود؛ **تحلیل این دور نشان می‌دهد ابعاد آن از fail-open فراتر است.**
- ❌ **پنج حلقهٔ P0 در زنجیرهٔ حاکمیتی آلارم** همچنان MISSING است.
- ❌ **قرارداد اثبات هویت restore** وجود ندارد و ابزار `pg_basebackup` نیز موجود نیست.

**این سند از این لحظه قرارداد پذیرش معماری مستقل است.**
هنگامی که چت ۱ تحویل S2 را ارائه دهد، ممیزی مستقیماً علیه بندهای ۱–۴ (ماتریس و قراردادها)،
بند ۸ (قیود تغییر) و بند ۱۳ (اثبات‌های لازم) انجام می‌شود — بدون نیاز به تعریف مجدد معیار در لحظهٔ تحویل.

---

### تأیید یکپارچگی ممیزی

- صفر ویرایش کد · صفر پیاده‌سازی · صفر اجرای restore · صفر تست بار
- تحلیل روی نسخهٔ استخراج‌شدهٔ فقط‌خواندنی در `/tmp` انجام و سپس پاک شد
- `git status` در طول کل ممیزی خالی بود
- این سند تنها artifact تولیدشده است (DOC_COMMIT، بدون هیچ CODE_COMMIT)

**ممیز:** چت ۴ — معمار ارشد مستقل
**تاریخ:** ۲۰۲۶-۰۹-۲۰
**HEAD مبنا:** `bc68b2b539bf5b59aa0108c0959af767ea57ce35`
