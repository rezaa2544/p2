# چک‌لیست آمادگی تولید (Production Readiness Gate) — بخش ۲۷ نقشه راه

- **تاریخ بررسی:** 2026-09-10 | **بیس:** `origin/main` @ `351bd10` (پس از PR #45) + شاخهٔ `arena/01a08a2e-p2`
- **مرجع:** `docs/ROADMAP.md` §27 (چهل معیار در هفت محور) + §30 (اسناد اجباری)
- **روش:** راستی‌آزمایی زنده — خواندن کد، اجرای تست‌های هدفمند (`occ`، ‏`tombstone`‏، ‏`lock-atomic`‏)، گیت‌ها (smoke/check-authz/secret-scan) و وضعیت واقعی PRها. هیچ موردی از روی حدس علامت نخورده است.
- **راهنما:** ✅ برآورده‌شده (با شاهد) · ⏳ ناقص/در مسیر (پیشرفت واقعی + باقی‌ماندهٔ مشخص) · ❌ برآورده‌نشده/مسدود
- **مرجع کلان:** معماری هدف و ضدالگوهای حاکم بر همهٔ محورها: `docs/NATIONAL_ARCHITECTURE.md` (سند چتر §30، چت ۶).
- **پیگیری موانع:** شش مانع پ0 بازِ این چک‌لیست به‌صورت زنده در `docs/P0_BLOCKER_TRACKER.md` (مسیر نو-گو → گو) پیگیری می‌شوند.

## Data (داده)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| PostgreSQL تنها Source of Truth | ❌ | `server/db.js`: fallback به حافظه/JSON یک قابلیت رسمی است («zero-dependency in-memory JSON fallback» + fallback هنگام خطای PG) و خوانش‌ها از `store` می‌آیند؛ Wave 1 فقط «Part 1 — reads inventory» مرج شده (PR #39) |
| transactions | ⏳ | `db.transaction(callback)` + pooling پیاده شده؛ راستی‌آزمایی فقط با fake-pool در `tests/wave10-db-scale.js` (D4) — اجرای زندهٔ تراکنش هنوز نه؛ اما مسیرِ خواندنِ دلتا روی PG 18.4 زنده اجرا و سنجه شد (فاز ۲، `docs/DELTA_HARDENING.md` §۳) |
| constraints | ⏳ | `migrations/003_constraints.sql` (بلوک‌های idempotent + فایل rollback) تعریف شده، ولی فقط وقتی PG زنده باشد اعمال می‌شود |
| migrations | ⏳ | `migrations/001–005` نسخه‌دار و تغییرناپذیر با جفتِ رفت/برگشت؛ قرارداد کامل: `docs/MIGRATION_GUIDE.md` (§30، چت ۶)؛ ۰۰۵ (ایندکس‌های `updated_at` دلتا — Delta Hardening فاز ۲) در ۲۰۲۶-۰۹-۱۱ روی PG 18.4 زنده اعمال و A/B شد (`docs/DELTA_HARDENING.md` §۳)؛ رانر خودکار برای اعمال `*.sql` وجود ندارد (اعمال دستی) |
| OCC | ✅ | `server/occ.js` + `base_version` در روت‌های `attendance/classes/grades` + خطای `409`؛ `tests/occ.js` ‏**18/18** سبز (اجرای زنده 2026-09-10) |
| tombstones | ✅ | `server/delete-service.js` + `pull.js` + `syncdelta.js` + `schema.sql`؛ `tests/tombstone.js` ‏**25/25** سبز (اجرای زنده) |

## Security (امنیت)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| centralized authorization | ✅ | مجوزهای تولیدشدهٔ R99 (`WRITE_PERMS` در `server/sync.js`) + مرج Wave 5 (PR #41)؛ `node tools/check-authz.js` → **exit 0** (تطبیق کامل) |
| tenant isolation | ✅ | `server/middleware/scope.js` در هر ۶ روت (`attendance/bootstrap/classes/grades/students/users`) + گیت check-authz سبز |
| secret management | ✅ | `PAYESH_JWT_SECRET` از env (اول)، فایل 0600، عدم track شدن (`secret-scan` صریحاً چک می‌کند)، fail-closed روی کلید ضعیف (R96 P0-3: استارت می‌میرد)؛ `tests/secret-scan.js` ‏**11/11** |
| SAST/DAST/SCA | ⏳ | `‎.github/workflows/security.yml`: ‏SAST اجباری و سبز؛ SCA/SBOM/DAST best-effort — DAST هرگز زنده اجرا نشده (سکرت staging تنظیم نیست؛ مسیر fallback محلی روی این شاخه اضافه شد ولی هنوز در CI ندویده)؛ `tests/wave13-security.js` ‏**23/23** استاتیک |
| penetration testing | ⏳ | `docs/PEN_TEST_CHECKLIST.md` (سناریوها) آماده است؛ خودِ تست اجرا نشده و سند نتیجه وجود ندارد |
| abuse protection | ⏳ | ریت‌لیمیت توزیعی Redis (PR #20) + OTP سخت‌شده R101 (PR #6) در کد زنده‌اند؛ WAF فقط-تشخیص است (PR #21؛ حالت enforce تعمداً در v1 نیست) و دریل DDoS زنده انجام نشده |

## Performance (کارایی)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| SQL pagination | ✅ | `executePagedList` در `server/dbquery.js` + استفاده در ۵ روت + سوئیت‌های `tests/wave3-query*.js` |
| indexed queries | ⏳→✅(دلتا) | ایندکس‌های دلتا: راستی‌آزماییِ زنده انجام شد — قبل از `005` پلنِ دلتا Parallel Seq Scan بود (۳۷.۴ms، ‏p50≈۴s زیر بارِ ۱۰۰۰)؛ بعد از ۰۰۵ (۱۶ ایندکس `updated_at`): BitmapOr، ‏p50=۴۷۲ms، ‏۱۱۵۷ req/s (`docs/DELTA_HARDENING.md` §۳). ایندکس‌های لیست‌های REST از Wave 3 روی PG زنده باقی است |
| no whole-store serialization | ❌ | `persistStoreSync` در `server/index.js` کل store را یک‌جا serialize می‌کند؛ با Wave 9 (PR #44) از مسیر درخواست خارج شد (ورکر + فقط-هنگام-تغییر) ولی ذاتاً باقی است — رفع کامل مسدود به Wave 1 |
| no request-path sync disk I/O | ⏳ | Wave 9: persist در ورکر + صف پس‌زمینهٔ audit؛ باقی‌مانده در مسیر درخواست: `writeFileSync` در `server/admin.js` (بکاپ)، `server/otp-store.js` (حالت فایلی)، و حالت پیش‌فرض sync ممیزی (حالت async با `PAYESH_AUDIT_ASYNC=1` opt-in است) |
| cache strategy | ✅ | `docs/CACHE_STRATEGY_DESIGN.md` + کش L1 در `server/cache.js` + Redis (کلاستر: PR #36) + اسناد `REDIS_*` (کلیدها، کلاستر، ری‌استور) |

## Distributed (توزیع‌شدگی)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| stateless API | ❌ | هر نمونه `memoryStore` اختصاصی در حافظه دارد (واگرایی بین نمونه‌ها) و OTP در غیاب Redis به فایل برمی‌گردد (`server/otp-store.js`) — scale-out افقی امن نیست |
| Redis distributed state | ⏳ | `server/redis.js` + fail-fast تولید (P0-13: بدون Redis زنده سرویس نمی‌دهد) + ریت‌لیمیت/ابطال نشست روی Redis (PR #20/#25)؛ اعتبارسنجی زندهٔ چندنمونه‌ای نشده |
| idempotency | ⏳ | موتور `payesh:idempotency:{uid}` در `server/cache.js` + سیم‌کشی در `server/sync.js`؛ تست اختصاصی روی main نیست |
| graceful shutdown | ⏳ | هندلرهای `SIGTERM/SIGINT` در `server/index.js` (توقف ورکر + persist + flush ممیزی + بستن اتصال‌ها)؛ بدون draining اتصال‌های درحال‌پرواز و بدون تست (Wave 15 روی شاخهٔ مرج‌نشدهٔ چت ۳) |

## Reliability (پایایی)

> **مرجع معماری بازیابی:** `docs/DISASTER_RECOVERY.md` (سیاست/توپولوژی/چرخهٔ آزمون — §30، چت ۶) + بازوی اجرایی `docs/DR_RUNBOOK.md`.

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| HA database | ❌ | رپلیکای زنده وجود ندارد؛ Wave 10 فقط routing/fallback با fake-pool را ثابت می‌کند (`tests/wave10-db-scale.js` ‏26/26، با قید صریح «اجرای PG واقعی در انتظار») |
| backup | ⏳ | `apiBackup/apiRestore` + بکاپ خودکار (`server/admin.js`) + `tools/redis-backup.sh` + `docs/REDIS_RESTORE_PROCEDURE.md`؛ بکاپ برون‌سایتی و PITR وجود ندارد |
| PITR | ❌ | هیچ نشانه‌ای از WAL archiving / بازیابی نقطه-در-زمان در کد و اسناد نیست |
| restore drill | ❌ | کد ری‌استور هست (`apiRestore`) ولی هیچ گزارش/لاگ مانور ری‌استور وجود ندارد؛ رویهٔ ماهانه اکنون مستند است (`docs/PRODUCTION_RUNBOOK.md` §۴ + `docs/DR_RUNBOOK.md` §۶) — اجرا باقی است |
| failover drill | ⏳ | مانور WAL disk-full شامل replica واقعی (`pg_basebackup -X stream` روی پورت ۵۵۴۳۳) بود که پس از PANICِ primary به سرویس‌دهی خواند ادامه داد (`in_recovery=true`, ۳۰٬۰۰۰ ردیف) — `docs/WAVE19_WAL_DRILL_REPORT.md`. اما promoteِ واقعی standby هنوز درل نشده؛ رویه مستند: `docs/PRODUCTION_RUNBOOK.md` §۵ + `docs/DR_RUNBOOK.md` §۱/§۲ — اجرا باقی است |
| RPO/RTO | ⏳ | در `docs/RELIABILITY_DR_PLAN.md` تعریف شده (RTO کمتر از ۱۵ دقیقه، RPO کمتر از ۵ دقیقه). **اولین سنجش واقعی:** مانور WAL disk-full روی PostgreSQL 17 زنده — **RTO=۱۶۲ms، RPO=۰** (۳۰٬۰۰۰ تراکنش کامیت‌شده، صفر اتلاف) — `docs/WAVE19_WAL_DRILL_REPORT.md`. هنوز روی محیط production-like با حجم واقعی داده تکرار نشده |

## Observability (رصدپذیری)

> **مرجع معماری یکپارچه:** `docs/OBSERVABILITY.md` (سند اجباری §30 — چت ۶، ۲۰۲۶-۰۹-۱۰): مدل سه سیگنال، جدول متریک‌ها، سیاست آلارم، داشبوردها، اس‌ال‌او و نگهداری.

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| metrics | ✅ | `server/metrics.js` (اکسپوزیشنِ صفرِوابستگی، دروازهٔ `METRICS_TOKEN`) — مرجِ ویو ۱۴ در PR #49؛ صحت‌سنجی زنده در سندباکس؛ پایش مستمر: `docs/PRODUCTION_RUNBOOK.md` §۳ |
| logs | ✅ | `server/audit.js` (چرخش 10MB، ماسک PII، حالت async) + تزریق `trace_id` (PR #22) |
| traces | ✅ | `server/tracing.js` + سرآیند `X-Trace-Id` (PR #22، OTLP fail-open)؛ سوئیت‌های tracing سبز (شامل فیکس‌های PR #45) |
| dashboards | ✅ | `infra/observability/dashboards/payesh-main.json` + `payesh-logs.json` با پروویژنینگ خودکار گرافانا (ویو ۱۴، تست ۳۰/۳۰) — اجرای زنده روی میزبان باقی است |
| alerts | ⏳ | ده قانون: هفت قانون زیرساختی + `AnomalyDetected`/`AttackPatternSignature`/`SuspiciousSession` در `infra/observability/alert-rules.yml` (alias: `monitoring/alert-rules.yml`)؛ metricهای runtime و RC-016 تست شده‌اند. وب‌هوک واقعی، stack production و drill اعلان همچنان باقی است |

## Testing (آزمون)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| integration | ✅ | ۷ سوئیت `tests/api/*` + رگرسیون کامل سبز در PR #45 (green=243, red=0) + smoke ‏**547/547** (اجرای زنده 2026-09-10) |
| concurrency | ⏳ | `tests/sync-atomic-batch.js` ‏22/22‏ + `tests/lock-atomic.js` ‏12/12‏ (اجرای زنده) روی main؛ ماتریس کامل‌تر (اتمی‌بودن ۲۰۰همزمان ریت‌لیمیت و…) روی شاخهٔ مرج‌نشدهٔ چت ۳ است |
| load | ⏳ | طرح رسمی `docs/LOAD_TEST_PLAN.md` (چت ۶، ۲۰۲۶-۰۹-۱۰) + زیرساخت k6 روی main (`tests/performance/`: ۶ سناریو + ۴ سوئیت)؛ اجرا مسدود به ادغام شاخهٔ چت ۳ (`seed-national.js`) و استیجینگ §۵ سند. هماهنگی ممیزی: مولد هم‌ارز `tools/generate-national-dataset.js` روی main موجود است — قلم باز ۲ در `docs/DOCS_CONSISTENCY_REPORT.md` |
| stress | ❌ | اجرا نشده (همان انسداد load) |
| spike | ❌ | اجرا نشده |
| soak | ❌ | اجرا نشده |
| chaos | ❌ | Wave 19 (پنج سناریو + `tools/chaos-test.sh`) روی شاخهٔ مرج‌نشدهٔ چت ۳ است |
| recovery | ❌ | بدون chaos/recovery drill زنده؛ فقط طرح روی کاغذ (`RELIABILITY_DR_PLAN`) |

**جمع‌بندی شمارشی:** ✅ ۱۲ · ⏳ ۱۵ · ❌ ۱۳ (از ۴۰ معیار)

---

## آیا سیستم برای Go-Live آماده است؟

> **بستهٔ رسمی انتشار:** `docs/GO_LIVE_PACKAGE.md` (چک‌لیست پیش از انتشار، ترتیب روز صفر، برنامهٔ بازگشت، ماتریس تصمیم، مانع‌های باز) + `docs/RELEASE_NOTES.md` (v1.0.0-rc1).

**خیر — آماده نیست.** سیستم در «کیفیت کد و امنیت پایه» قوی است ولی در «آمادگی بهره‌برداری واقعی» (دادهٔ توزیع‌شده، پایایی، رصد، آزمون‌های مقیاس) شکاف‌های مسدودکننده دارد.

### موانع باقی‌مانده (P0 — پیش از هر Go-Live)

1. **Wave 1 — ‏PostgreSQL تنها SoT:** تا store حافظه‌ای/JSON مسیر اصلی است، معیارهای «sole SoT»، ‏«no whole-store serialization» و «stateless API» قابل تحقق نیستند. (وابسته‌ها: Data-1، ‏Performance-3‏، Distributed-1)
2. **معماری چندنمونه‌ای امن:** حذف وابستگی به فایل/حافظهٔ محلی در مسیر درخواست (OTP فایلی، ‏`memoryStore` اختصاصی) + اعتبارسنجی زندهٔ دو نمونه با یک DB. (Distributed-1/2)
3. **پایایی داده:** رپلیکای HA + ‏PITR + اجرای واقعی مانورهای restore/failover + سنجش RPO/RTO (تعریف‌ها آماده‌اند، اجرا نشده‌اند). (Reliability ۱ تا ۶)
4. **رصدپذیری حداقلی بهره‌برداری:** کدِ متریک/داشبورد/قوانینِ آلارم مرج شده (ویو ۱۴، PR #49)؛ باقی‌ماندهٔ مسدودکننده: اجرای زندهٔ استک روی میزبان، وب‌هوک واقعی آلارم و دریل اعلان (`docs/OBSERVABILITY_DEPLOYMENT.md` «باقی» + `docs/INCIDENT_RESPONSE.md`). (Observability-4/5)
5. **آزمون‌های مقیاس روی staging:** اجرا (نه فقط پلن) load/stress/spike/soak + ‏chaos + ‏recovery روی infra چندنوده با k6 و دیتاست ملی — پلن رسمی آماده است (`docs/LOAD_TEST_PLAN.md`)؛ اجرا نیازمند مرج شاخهٔ چت ۳ (Wave 18/19) و سپس اجرا. (Testing ۳ تا ۸)
6. **امنیت اجرایی:** اجرای زندهٔ DAST (staging یا مسیر محلی جدید در CI)، اجرای pen-test طبق چک‌لیست، و فعال‌سازی حالت enforce در WAF. (Security-4/5/6)

### موارد P1 (پس از P0، پیش از مقیاس ملی)

- باقی‌ماندهٔ I/O سنکرون در مسیر درخواست (بکاپ admin، حالت فایلی OTP، پیش‌فرض sync ممیزی)؛ رانر خودکار migrations؛ تست اختصاصی idempotency؛ draining اتصال‌ها در shutdown + تست آن؛ راستی‌آزمایی ایندکس‌ها روی PG زنده (Wave 3).

### نقاط قوت (آماده و قابل اتکا)

- مدل مجوزدهی متمرکز + ایزولاسیون tenant (گیت سبز)؛ مدیریت secret با fail-closed؛ OCC + tombstone با تست سبز؛ لاگ/تریس با همبستگی؛ استراتژی کش؛ رگرسیون یکپارچگی سبز (۲۴۳) + دودی ۵۴۷/۵۴۷.

---

## پیوست: اسناد اجباری پایان پروژه (§30)

| سند | وضعیت | توضیح |
|---|---|---|
| NATIONAL_BASELINE.md | ✅ | هر ۴ بخش روی main |
| DATABASE_ARCHITECTURE.md | ✅ | + migrations مستند |
| AUTHORIZATION_MODEL.md | ✅ | + گزارش‌های R98/R99 |
| SYNC_PROTOCOL.md | ✅ | |
| SECURITY_MODEL.md | ✅ | + چک‌لیست pen-test |
| NATIONAL_ARCHITECTURE.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — سند چتر معماری ملی (۱۴ بخش + ۱۰ رکورد تصمیم) + تست پوشش `tests/national-architecture-coverage.js` |
| DISASTER_RECOVERY.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — معماری کلان بازیابی + تست پوشش `tests/disaster-recovery-coverage.js` |
| OBSERVABILITY.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — سند یکپارچهٔ معماری رصدپذیری + تست پوشش `tests/observability-doc-coverage.js` |
| CAPACITY_MODEL.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — مدل رسمی برای طراحی/تست؛ اعداد در انتظار اثبات در Wave 18 |
| LOAD_TEST_PLAN.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — ورودی رسمی Wave 18؛ جایگزین اعداد اسناد قدیمی (`LOAD_TESTING_PLAN.md`/`PERFORMANCE_TESTING_PLAN.md`) |
| LOAD_TEST_RESULTS.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — **قالب آماده + چارچوب تحلیل** (نسخهٔ ۰.۱.۰) + پوشش‌سنج `tests/load-test-results-coverage.js`؛ پر شدن اعداد همچنان مسدود به اجرای زندهٔ موج ۱۸ است |
| PRODUCTION_RUNBOOK.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — ۸ بخش + پوشش‌سنج `tests/runbook-coverage.js` (72/72) |
| INCIDENT_RESPONSE.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — ۴ سطح شدت + ۱۰ پلی‌بوک + پوشش‌سنج `tests/incident-playbooks.js` (86/86) |
| MIGRATION_GUIDE.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — سیاست/چرخه/بسط‌انقباض/مهاجرت زنده + تست پوشش `tests/migration-guide-coverage.js` |

**جمع §30:** موجود **۱۴ از ۱۴** — آخرین سند (`LOAD_TEST_RESULTS.md`) با قالب آماده و چارچوب تحلیل تحویل شد؛ فقط پر شدن اعداد به اجرای واقعی آزمون بار ملی (موج ۱۸) مسدود است.
