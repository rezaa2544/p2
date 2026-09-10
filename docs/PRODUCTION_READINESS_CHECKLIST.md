# چک‌لیست آمادگی تولید (Production Readiness Gate) — بخش ۲۷ نقشه راه

- **تاریخ بررسی:** 2026-09-10 | **بیس:** `origin/main` @ `351bd10` (پس از PR #45) + شاخهٔ `arena/01a08a2e-p2`
- **مرجع:** `docs/ROADMAP.md` §27 (چهل معیار در هفت محور) + §30 (اسناد اجباری)
- **روش:** راستی‌آزمایی زنده — خواندن کد، اجرای تست‌های هدفمند (`occ`، ‏`tombstone`‏، ‏`lock-atomic`‏)، گیت‌ها (smoke/check-authz/secret-scan) و وضعیت واقعی PRها. هیچ موردی از روی حدس علامت نخورده است.
- **راهنما:** ✅ برآورده‌شده (با شاهد) · ⏳ ناقص/در مسیر (پیشرفت واقعی + باقی‌ماندهٔ مشخص) · ❌ برآورده‌نشده/مسدود

## Data (داده)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| PostgreSQL تنها Source of Truth | ❌ | `server/db.js`: fallback به حافظه/JSON یک قابلیت رسمی است («zero-dependency in-memory JSON fallback» + fallback هنگام خطای PG) و خوانش‌ها از `store` می‌آیند؛ Wave 1 فقط «Part 1 — reads inventory» مرج شده (PR #39) |
| transactions | ⏳ | `db.transaction(callback)` + pooling پیاده شده؛ راستی‌آزمایی فقط با fake-pool در `tests/wave10-db-scale.js` (D4) — اجرای زنده روی PG واقعی نشده |
| constraints | ⏳ | `migrations/003_constraints.sql` (بلوک‌های idempotent + فایل rollback) تعریف شده، ولی فقط وقتی PG زنده باشد اعمال می‌شود |
| migrations | ⏳ | `migrations/001–003` نسخه‌دار و immutable + rollback صریح (`docs/DATABASE_ARCHITECTURE.md` §2)؛ رانر خودکار برای اعمال `*.sql` وجود ندارد (اعمال دستی) |
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
| indexed queries | ⏳ | `migrations/002_indexes.sql` (+ ایندکس‌های `001`) تعریف شده؛ راستی‌آزمایی روی PG زنده نشده (Wave 3 باز است) |
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

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| HA database | ❌ | رپلیکای زنده وجود ندارد؛ Wave 10 فقط routing/fallback با fake-pool را ثابت می‌کند (`tests/wave10-db-scale.js` ‏26/26، با قید صریح «اجرای PG واقعی در انتظار») |
| backup | ⏳ | `apiBackup/apiRestore` + بکاپ خودکار (`server/admin.js`) + `tools/redis-backup.sh` + `docs/REDIS_RESTORE_PROCEDURE.md`؛ بکاپ برون‌سایتی و PITR وجود ندارد |
| PITR | ❌ | هیچ نشانه‌ای از WAL archiving / بازیابی نقطه-در-زمان در کد و اسناد نیست |
| restore drill | ❌ | کد ری‌استور هست (`apiRestore`) ولی هیچ گزارش/لاگ مانور ری‌استور وجود ندارد |
| failover drill | ❌ | هیچ مدرکی از مانور failover نیست |
| RPO/RTO | ⏳ | در `docs/RELIABILITY_DR_PLAN.md` تعریف شده (RTO کمتر از ۱۵ دقیقه، RPO کمتر از ۵ دقیقه + طرح مانور ماهانه) ولی هرگز سنجیده/درل نشده |

## Observability (رصدپذیری)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| metrics | ❌ | اندپوینت `/metrics` (یا معادل Prometheus) وجود ندارد؛ فقط `/api/health` هست که متریک نیست |
| logs | ✅ | `server/audit.js` (چرخش 10MB، ماسک PII، حالت async) + تزریق `trace_id` (PR #22) |
| traces | ✅ | `server/tracing.js` + سرآیند `X-Trace-Id` (PR #22، OTLP fail-open)؛ سوئیت‌های tracing سبز (شامل فیکس‌های PR #45) |
| dashboards | ❌ | فقط `infra/tracing/jaeger-*.yaml` هست؛ داشبورد Grafana (یا معادل) وجود ندارد |
| alerts | ❌ | هیچ قاعدهٔ alert (آستانه‌ها، مسیر escalation) در ریپو نیست |

## Testing (آزمون)

| معیار §27 | وضعیت | شاهد |
|---|---|---|
| integration | ✅ | ۷ سوئیت `tests/api/*` + رگرسیون کامل سبز در PR #45 (green=243, red=0) + smoke ‏**547/547** (اجرای زنده 2026-09-10) |
| concurrency | ⏳ | `tests/sync-atomic-batch.js` ‏22/22‏ + `tests/lock-atomic.js` ‏12/12‏ (اجرای زنده) روی main؛ ماتریس کامل‌تر (اتمی‌بودن ۲۰۰همزمان ریت‌لیمیت و…) روی شاخهٔ مرج‌نشدهٔ چت ۳ است |
| load | ⏳ | طرح رسمی `docs/LOAD_TEST_PLAN.md` (چت ۶، ۲۰۲۶-۰۹-۱۰) + زیرساخت k6 روی main (`tests/performance/`: ۶ سناریو + ۴ سوئیت)؛ اجرا مسدود به ادغام شاخهٔ چت ۳ (`seed-national.js`) و استیجینگ §۵ سند |
| stress | ❌ | اجرا نشده (همان انسداد load) |
| spike | ❌ | اجرا نشده |
| soak | ❌ | اجرا نشده |
| chaos | ❌ | Wave 19 (پنج سناریو + `tools/chaos-test.sh`) روی شاخهٔ مرج‌نشدهٔ چت ۳ است |
| recovery | ❌ | بدون chaos/recovery drill زنده؛ فقط طرح روی کاغذ (`RELIABILITY_DR_PLAN`) |

**جمع‌بندی شمارشی:** ✅ ۱۰ · ⏳ ۱۴ · ❌ ۱۶ (از ۴۰ معیار)

---

## آیا سیستم برای Go-Live آماده است؟

**خیر — آماده نیست.** سیستم در «کیفیت کد و امنیت پایه» قوی است ولی در «آمادگی بهره‌برداری واقعی» (دادهٔ توزیع‌شده، پایایی، رصد، آزمون‌های مقیاس) شکاف‌های مسدودکننده دارد.

### موانع باقی‌مانده (P0 — پیش از هر Go-Live)

1. **Wave 1 — ‏PostgreSQL تنها SoT:** تا store حافظه‌ای/JSON مسیر اصلی است، معیارهای «sole SoT»، ‏«no whole-store serialization» و «stateless API» قابل تحقق نیستند. (وابسته‌ها: Data-1، ‏Performance-3‏، Distributed-1)
2. **معماری چندنمونه‌ای امن:** حذف وابستگی به فایل/حافظهٔ محلی در مسیر درخواست (OTP فایلی، ‏`memoryStore` اختصاصی) + اعتبارسنجی زندهٔ دو نمونه با یک DB. (Distributed-1/2)
3. **پایایی داده:** رپلیکای HA + ‏PITR + اجرای واقعی مانورهای restore/failover + سنجش RPO/RTO (تعریف‌ها آماده‌اند، اجرا نشده‌اند). (Reliability ۱ تا ۶)
4. **رصدپذیری حداقلی بهره‌برداری:** اندپوینت متریک + داشبورد + آلارم (بدون این‌ها، تیم در تاریکی اپراتوری می‌کند). (Observability-1/4/5)
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
| NATIONAL_ARCHITECTURE.md | ❌ | نزدیک‌ترین معادل: `ARCHITECTURE.md` / `ARCHITECTURE_DECISIONS.md` (نیازمند هم‌نام‌سازی یا نگاشت رسمی) |
| DISASTER_RECOVERY.md | ❌ | نزدیک‌ترین معادل: `RELIABILITY_DR_PLAN.md` |
| OBSERVABILITY.md | ❌ | پراکنده در `TRACING_SETUP.md` و WAF/rate-limit docs |
| CAPACITY_MODEL.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — مدل رسمی برای طراحی/تست؛ اعداد در انتظار اثبات در Wave 18 |
| LOAD_TEST_PLAN.md | ✅ | چت ۶ (۲۰۲۶-۰۹-۱۰) — ورودی رسمی Wave 18؛ جایگزین اعداد اسناد قدیمی (`LOAD_TESTING_PLAN.md`/`PERFORMANCE_TESTING_PLAN.md`) |
| LOAD_TEST_RESULTS.md | ❌ | اجرا نشده — ذاتاً مسدود به P0-5 |
| PRODUCTION_RUNBOOK.md | ❌ | وجود ندارد |
| INCIDENT_RESPONSE.md | ❌ | وجود ندارد |
| MIGRATION_GUIDE.md | ❌ | پراکنده در `DATABASE_ARCHITECTURE.md`؛ راهنمای مستقل نیست |

**جمع §30:** موجود ۷ از ۱۴ — تکمیل/هم‌نام‌سازی اسناد، پیش‌نیاز نرم Go-Live است (به‌ویژه runbook و incident response).
