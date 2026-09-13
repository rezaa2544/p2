# بستهٔ شواهد اتکاپذیری همگام‌سازی (Sync Reliability Evidence Package)

**تاریخ:** ۲۰۲۶-۰۹-۱۳ · **مالک:** چت ۳ (همگام‌سازی/آفلاین) · **وضعیت:** تجمیع دورهای ۱۱ و ۱۲
**مصرف‌کننده:** بستهٔ ۵ نقشه راه (Operational Readiness) — ورودی برای SLO/error-budget/on-call
**سوئیت‌های مرجع (اجراپذیر، روی main):** `tests/offline-sync-drill.js` ‏(29/29) · `tests/sync-conflict-storm-drill.js` ‏(18/18) · پایه: `tests/offline-e2e.js` ‏(23/23، ‏P0-3)

## ۱) خلاصهٔ اجرایی

ده سناریوی اتکاپذیری روی **کد واقعی** (کلاینت = باندل index.html در jsdom؛ سرور = ‏server/sync.js با authz/فیلدگیت/OCC/idempotency/undo-log) اجرا شد — **۱۰/۱۰ ‏PASS با integrity کامل** (snapshot-diff قبل/بعد؛ صفر duplicate/گم‌شده/خرابی). پنج جهش خانوادهٔ سرور کشته شد. شش NOT-RUN صادقانه ثبت است (§۵).

> **حد ادعا (صریح):** این بسته «صحتِ رفتار» را اثبات می‌کند، نه ظرفیت را. ‏**capacity ملی اثبات‌نشده** — ‏latency/throughput زیر بار = مالکیت چت ۴؛ هم‌زمانی بین‌پروسه‌ای/چندنمونه‌ای = استیجینگ P0-5 / قلمرو Wave 6.

## ۲) جدول ده سناریو

| # | سناریو | دور | metrics کلیدی (اجرای واقعی) | Data Integrity | نتیجه |
|---|---|---|---|---|---|
| S1 | ‏Offline → صف(۵) → Reconnect → Push | ۱۱ | ‏push ‏7ms · **۱ تماس batch** | ✅ ‏+5 expected، ‏0 unexpected | PASS |
| S2 | ‏Duplicate ×۳ → Dedupe → Idempotency | ۱۱ | ‏dedupe ‏2/3 · side-effect=1 | ✅ | PASS |
| S3 | ‏Conflict ‏(OCC) → Preserve → Resolve | ۱۱ | ‏detect ‏3ms | ✅ رکورد مرجع دست‌نخورده | PASS |
| S4 | ‏Clock Skew ‏±۵/۳۰min → قرارداد drift | ۱۱ | ‏drift>حد ⇒ اعمال+audit ‏(fail-open با ثبت) | ✅ | PASS |
| S5 | صف بزرگ (۱۲۰) → یک batch push | ۱۱ | ‏9ms · ترتیب حفظ · ‏heapΔ≈0 | ✅ ‏applied=persisted=120 | PASS |
| S6 | ‏Server Reject → dead-letter → fix دستی | ۱۱ | ‏error-prop ‏2ms | ✅ تا fix هیچ نوشته‌ای ننشست | PASS |
| S7 | ‏Conflict Storm: ‏۵۰ آپدیت هم‌زمانِ یک رکورد | ۱۲ | ‏detect ‏7ms · ‏50/50 preserve | ✅ رکورد مرجع بایت‌برابر؛ ‏applied=0 | PASS |
| S8 | ‏Partial Failure: کرش DB وسط batch ‏(PG-live) | ۱۲ | ‏rollback اتمیک · retry ‏1ms | ✅ دقیقاً ۱۰ در مرجع؛ صفر dup | PASS |
| S9 | ‏Retry Storm: ‏۳۰۰ درخواست (۱۰۰×۳ شافل قطعی) | ۱۲ | ‏drain ‏11ms · dedupe ‏200/300 | ✅ اثر=۱۰۰؛ ‏uids=+100 | PASS |
| S10 | ‏Clock Storm: ‏۲۰ کلاینت skew ‏±۶۰min | ۱۲ | ‏audit=۱۶ (دقیقاً بیرونِ حد) | ✅ ترتیب علّی از version نه timestamp | PASS |

## ۳) پنج یافتهٔ واقعی (red شدند و درس دادند)

1. **‏Reconnect دوجزئی است (دور ۱۱):** ‏`SYNC.online=true` کافی نیست — ‏`DATA_MODE` (بوت آفلاین آن را local می‌گذارد و `Api.request` مسیر نسبی را رد می‌کند) و `SYNC.syncing` معلق هم باید ریست شوند. در مرورگر واقعی `detectServer` چرخهٔ بعد این را می‌کند؛ هر هارنس/ابزار عملیاتی باید بداند.
2. **‏Dedupe دولایه است (دور ۱۱):** پیش‌چک `isProcessed` + ‏check&claim اتمیک درون‌batch ‏(sync.js:~984). جهشِ فقط لایهٔ اول نمی‌میرد — پایش عملیاتی باید هر دو لایه را پوشش دهد.
3. **فیلدگیت دامنهٔ نمره زیر طوفان هم فعال است (دور ۱۲):** ‏score خارج از ۰-۲۰ حتی در مسیر storm با `validation_failed` رد می‌شود — اعتبارسنجی قابل دورزدن با حجم نیست.
4. **قرارداد P1-2 سنجش integrity را عوض می‌کند (دور ۱۲):** در PG-live آینهٔ کالکشن‌های خارجِ لیست سفید پس از commit **عمداً هرس می‌شود** — integrity باید روی *مرجع* ‏(PG/ژورنال persistOpsBatch) سنجیده شود نه آینهٔ store. برای runbook و هر ابزار diag حیاتی است.
5. **پوشش متقاطع سناریوها (دور ۱۲):** جهش OCC چهار سنجه در دو سناریوی مستقل ‏(S7+S10c) را قرمز کرد — عمق دفاع قابل‌اندازه‌گیری است.

## ۴) جهش‌آزمایی (۵ جهش خانواده — همه کشته)

| جهش (روی server/sync.js یا هارنس) | سنجه‌های قرمزشده | دور |
|---|---|---|
| ‏dedupe هر دو لایه خاموش | ‏S2 ‏(2×) · ‏S9 ‏(3×) | ۱۱، ۱۲ |
| ‏OCC ‏(base_version gate) خاموش | ‏S3 ‏(3×) · ‏S4c · ‏S7 ‏(3×) · ‏S10c | ۱۱، ۱۲ |
| ‏rollback ‏(undo-log) خاموش | ‏S8b | ۱۲ |
| حذف guard/پرچم دانه (کنترل هارنس دانه) | ‏seed-completeness ‏A1/A2 | ۱۰ |
| فیکسچر جهش تک‌لایهٔ dedupe (کنترل منفی) | *نمی‌میرد* — اثبات دولایگی | ۱۱ |

هر جهش پس از بازگردانی: سوئیت‌ها به ‏29/29 و 18/18 برگشتند.

## ۵) ‏NOT-RUN صادقانه (۶ مورد — سبز جعلی ممنوع)

| مورد | دلیل | مسیر بستن |
|---|---|---|
| ‏Service Worker Background Sync با تب بستهٔ واقعی | ‏jsdom ‏SW ندارد | ‏Chromium واقعی (استیجینگ)؛ منطق آینه: `tests/bgsync.js` |
| قطع شبکهٔ واقعی ‏(iptables/tc) | سندباکس بدون root شبکه | استیجینگ P0-5 |
| ‏persistence/طوفان روی PG/Redis زندهٔ بین‌پروسه‌ای | drill درهم‌تنیدگی event-loop تک‌پروسه است | استیجینگ P0-5 · مسیر PG: `wave10-pg-live` ‏(D1..D4) |
| ‏p50/p95/p99 زیر بار | مالکیت Capacity = چت ۴ | بنچ چت ۴ |
| ‏conflict storm چند-tenant | قرارداد counselor/tenancy باز (صف ناظر) | پس از حکم |
| ‏CI | بیلینگ Actions ‏(RISK-O-007) | فعال‌سازی بیلینگ |

## ۶) ورودی پیشنهادی برای بستهٔ ۵ ‏(Operational Readiness) — پیشنهاد، نه تصمیم

> ‏`OPERATIONAL_READINESS.md` هنوز در مخزن **وجود ندارد** (بررسی این دور)؛ نزدیک‌ترین اسناد: ‏`PRODUCTION_READINESS_CHECKLIST.md` (ردیف‌های sync آن با این بسته تقویت می‌شوند) و `PRODUCTION_RUNBOOK.md`/`INCIDENT_RESPONSE.md`. مالک ساخت سند = تصمیم ناظر (پیش‌فرض نقشه راه: چت ۶). اعداد زیر **پیشنهاد مهندسی از رفتار اندازه‌گیری‌شده در سندباکس** است و پیش از SLO شدن باید روی استیجینگ کالیبره شود:

- **‏SLO پیشنهادی sync:** موفقیت push ‏(بدون خطای غیر از conflict/rejected معتبر) ≥ ‏۹۹.۹٪ در پنجرهٔ ۳۰روزه؛ ‏conflict-preserve نرخ گم‌شدگی داده = ‏**۰** (‏invariant، نه SLO).
- **‏SLA داوری تعارض:** صف `sync_conflicts` قدیمی‌تر از ‏۷۲h = هشدار (متریک موجود: ‏`payesh_http_requests_total{route=/api/sync/resolve-conflict}` + شمار صف).
- **‏error budget طوفان:** ‏`sync_mirror_failed` > ‏۰ در ساعت ⇒ ‏page؛ ‏`sync_clock_skew` نرخ > ‏۵٪ درخواست‌ها ⇒ بررسی NTP کلاینت‌ها.
- **‏Runbook پیوند:** سناریوی «کرش DB وسط batch» ⇒ رفتار مورد انتظار: ‏503+rollback+retry خودکار کلاینت — اپراتور فقط سلامت PG را برگرداند؛ داده self-healing است (شاهد: S8).
- ‏**bus-factor:** دانش reconnect دوجزئی و dedupe دولایه اکنون در همین سند و تست‌ها کدگذاری شده — وابسته به فرد نیست.

## ۷) ‏Acceptance Bundle

- ‏COMMIT: این سند + دو سوئیت مرجع (‏SHAها در PRهای #178/#182/همین PR)
- ‏TEST COMMANDS: ‏`node tests/offline-sync-drill.js` · ‏`node tests/sync-conflict-storm-drill.js` · ‏`node tests/offline-e2e.js`
- ‏RAW OUTPUT: جدول metrics ماشینی در انتهای خروجی هر سوئیت (JSON-per-line)
- ‏SECURITY: ‏tenant/جعل هویت ‏(offline-e2e ‏E21..E23) · ‏check-authz ✅ · ‏secret-scan ‏12/12 · ‏۰ توکن
- ‏ROLLBACK: ‏`git revert` — سوئیت‌ها/سند مستقل‌اند؛ صفر تغییر کد محصول در کل دورهای ۱۱-۱۳
- ‏KNOWN LIMITATIONS: §۵ همین سند · ‏CI: ‏NOT-RUN (بیلینگ)
