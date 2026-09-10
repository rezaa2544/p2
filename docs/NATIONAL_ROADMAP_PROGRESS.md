# پیگیری پیشرفت نقشه راه ملی پایش

**مرجع اصلی:** `docs/ROADMAP.md` — National Scale Master Roadmap

**مکمل الزام‌آور:** `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` — اجرای Waves بدون رعایت آن مجاز نیست.

**قاعده Addendum:** فقط Status کافی نیست؛ هر ردیف باید Owner، Risk، Dependency و Evidence داشته باشد.

| Wave | عنوان | Owner | Status | Risk | Dependency | Evidence |
|---:|---|---|---|---|---|---|
| -1 | Architecture Discovery | Arena 5 / همه Arenaها | ✅ | High | پیش‌نیاز همه Waves | کامل شد: Dependency/Data/Auth/Sync Flow + docs/THREAT_MODEL.md + docs/BOTTLENECK_MAP.md |
| 0 | Baseline و Freeze | Arena 1 + Arena 5 | ✅ | Medium | Wave -1 کامل | Part 1: docs/NATIONAL_BASELINE.md؛ Part 2: docs/NATIONAL_BASELINE_PART2.md؛ Part 3: docs/NATIONAL_BASELINE_PART3.md؛ Part 4: docs/NATIONAL_BASELINE_PART4.md؛ tag national-baseline-start (Part 4 بازسازی شد — commit اولیهٔ 0245515 هرگز push نشده بود) |
| 1 | PostgreSQL Source of Truth [P0] | Arena 1 | 🟡 | Critical | Wave -1 و Wave 2 (✅)؛ تصمیم ناظر روی تداخل با پیاده‌سازی چت ۳ | P0 کامل و راستی‌آزمایی‌شده روی arena/01a08a2e-p2 (۱۳ کامیت c16b178..c3bf3a1): migration 004، بوتِ PG-authoritative، ۵ روت + sync دوفازی + سرویس‌ها PG-first؛ tests/wave1-multi-instance.js ‏33/33‏، tools/wave1-gate.js ‏35/35‏، رگرسیون ‏243/247‏ با تعیین‌تکلیف هر ۴ قرمز (HANDOFF.md). باقی: ~~push نهایی (۲ کامیت محلی — احراز GitHub) + چرخاندن ruflo + PR~~ انجام شد: push ‏dd14330‏ + ruflo ‏wave1_status=completed‏ + PR ‏#48‏ به main. هشدار: پیاده‌سازی writes چت ۳ روی origin/arena/01a08545-p2 همچنان منتظر ریبیس است — ادغام/انتخاب بین دو پیاده‌سازی با ناظر |
| 2 | Database Engineering | Arena 1 | ✅ | High | Wave -1 برای کشف کامل؛ Wave 1 برای PG-only شدن تولید | docs/DATABASE_ARCHITECTURE.md؛ migrations/؛ tests/db-engineering.js |
| 3 | Query و Performance [P0] | Arena 1 + Arena 4 | 🟡 | High | Wave 1/2 | بدنهٔ DB-native از چت ۲ (PR #39): `server/dbquery.js` برای هر ۵ GET-list پرترافیک + `tests/wave3-query.js` ۱۳/۱۳ + `wave3-query2` ۱۳/۱۳. **این دور:** راستی‌آزماییِ زنده روی PostgreSQL ۱۸.۴ (از راهِ `embedded-postgres`، `migrations/` اعمال‌شده، ۲.۱۹M ردیف) با `EXPLAIN (ANALYZE, BUFFERS)` روی **هر ۱۳** کوئریِ builder — بدونِ Seq Scan روی جدولِ پایه؛ `tests/wave3-query3.js` **۱۸/۱۸** (و **۲۵/۲۵** با PG زنده: پیمایشِ کاملِ صفحه‌ها، بدونِ تکرار، عدمِ نشتِ مدرسهٔ دیگر، خنثی‌بودنِ injection)؛ `migrations/004_wave3_query_indexes.sql` (+down)؛ `docs/WAVE3_QUERY_PERFORMANCE.md`. **چهار یافته؛ سه تا بسته شد، یکی باز:** (الف) cursor جدولِ `attendance` ترکیبی نبود و **۹۵٪ داده هرگز برنمی‌گشت** → اصلاح شد، اکنون ۰ گم‌شده · (ب) `migrations/001_initial.sql` روی دیتابیسِ خالی اصلاً اجرا نمی‌شد (۴۹ ارجاعِ جلو به `schools`) → اصلاح شد · (پ) drift هفت Index بینِ `schema.sql` و `migrations/` → بسته شد، ولی A/B صادقانه **۰.۶۳×–۱.۵۸× یعنی نویز** و ادعای بهبودِ عملکرد نمی‌کنیم · (ت) **باز:** 🔴 تصمیمِ tenancy دربارهٔ `school_id IS NULL` در `grades` (۱۰۵.۲ms → ۰.۲۲ms، ~۴۸۰×) · 🔴 گیتِ برابریِ JS↔SQL · 🟡 بخشِ B در CI و `CONCURRENTLY` برایِ ۰۰۴ در تولید. commits `bfa0fc9`/`85da6c5`/`c58b5de`/`9d78398`/`fef0de7` · PR #46 |
| 4 | Sync / A01 | Arena 3 | ⏳ | High | Wave 1/2/5 | در انتظار شروع |
| 5 | Authorization و Tenant Isolation [P0] | Arena 2 | ✅ | Critical | Wave -1 و مدل واحد policy | مدل یکتای `server/policy.js` (Sync+REST+PG هم‌قرارداد)؛ `docs/WAVE5_AUTHZ.md` + `docs/AUTHORIZATION_MODEL.md`؛ wave5-authz 37/37، جهش‌ها 5/5، هم‌ارزی 93,024/۰، smoke 547/547، api 7/7 — commits 8472f17..d5230b7 |
| 6 | Redis و Distributed State [P0] | Arena 4 | ⏳ | High | Wave 1 و سیاست production readiness | در انتظار شروع |
| 7 | Offline-first | Arena 3 | ⏳ | Medium | Wave 4/6 | در انتظار شروع |
| 8 | Async Architecture | Arena 4 | ⏳ | Medium | Wave 1/2 و Outbox | در انتظار شروع |
| 9 | Application Performance | Arena 4 | 🟡 | High | Wave 3 و baseline عملکرد (Part 2/3 ✅) | شروع شد: heavy worker برایِ persist/backup/report + ممیزیِ پس‌زمینه + L1 محدود + کشِ استاتیک (docs/WAVE9_PERFORMANCE.md؛ tests/wave9-performance.js ‏39/39؛ بلاکِ event-loop بکاپ ~۴۶ms→۰٫۶ms). باقی‌مانده: ایندکسِ مسیرهای فیلترِ O(n) (وابسته به Wave 1) |
| 10 | Database Scale | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2/3 و benchmark | در انتظار شروع |
| 11 | Cache | Arena 4 | ⏳ | Medium | Wave 3/6 و benchmark | در انتظار شروع |
| 12 | Network / Edge | Arena 4 | ✅ | Medium | استقرار production و TLS/CDN/WAF | PR #43 مرج شد (463233c): بلاک‌های لبه nginx + اسناد CDN/WAF + ci/pending CodeQL + wave12 24/24 و جهش 5/5؛ رفعِ braceِ رگکس‌های map در nginx -t رانر؛ باقی‌مانده: اِعمال پچ CodeQL با توکن workflow |
| 13 | Security Program | Arena 2 + Arena 5 | ⏳ | Critical | Wave 5 و threat model | در انتظار شروع |
| 14 | Observability | Arena 4 + Arena 5 | ✅ | High | Wave -1 و deployment model | server/metrics.js (۲۷ metric، cardinality guard، scrape fail-closed) + ابزارگیری در index/db/cache/worker/sync/outbox؛ docs/WAVE14_OBSERVABILITY.md؛ infra/observability/ (prometheus.yml, alerts.yml, dashboard)؛ tests/wave14-observability.js **۹۵/۹۵** + mutations **۱۲/۱۲** |
| 15 | Health / Deployment | Arena 4 | ⏳ | High | Wave 14 و stateless API | در انتظار شروع |
| 16 | Disaster Recovery | Arena 4 + Arena 5 | ✅ | Critical | Wave 10/15 و RPO/RTO | server/dr.js (SHA-256 manifest، AES-256-GCM + scrypt، fail-closed بدون کلید در تولید، RPO ۳۰۰s / RTO ۹۰۰s) + scripts/dr-restore-drill.js (۸ فاز زمان‌دار)؛ docs/WAVE16_DISASTER_RECOVERY.md + docs/RUNBOOK_DISASTER_RECOVERY.md؛ tests/wave16-dr.js **۷۵/۷۵** + mutations **۱۱/۱۱**. PITR سمتِ PostgreSQL است (🟡) |
| 17 | Testing Pyramid | Arena 5 | ✅ | High | همه Waveها | tests/wave17-testing.js **۷۳/۷۳** روی سرورِ واقعی: P0/IN(۱۱)/CT(۱۰)/E2E(۹)/CC(۶)/LD(۶)/ST(۶)/SP(۵)/SK(۷)/PY(۸) + mutations **۱۰/۱۰**؛ docs/WAVE17_TESTING.md و docs/WAVE17_TESTING_PYRAMID.md. هر ۱۲ سطح به سوئیتِ موجود نگاشت شده؛ سوئیتِ موجودی حذف/ضعیف نشده (PY1–PY8) |
| 18 | National Load Testing | Arena 5 + Arena 4 | 🟡 | High | Capacity Model، Wave 3/10/14 | tools/seed-national.js (مدلِ ۱۰M کاربر با نسبت‌هایِ صریح + مولدِ دیتاست)؛ tests/wave18-load.js **۶۲/۶۲** (مدل/دیتاست/Load/Stress/Spike/Soak با ۶ آشکارسازِ نشتی)؛ tests/performance/suites/national-load-test.js (k6، هر ۴ سناریو)؛ docs/WAVE18_LOAD_TESTING.md. **ظرفیتِ ملی اندازه‌گیری نشده** — k6 نصب نیست و DB TPS/Redis ops/sec در مسیرِ JSON معنا ندارند |
| 19 | Chaos / Failure Testing | Arena 5 + Arena 4 | ⏳ | Critical | Wave 15/16 و Observability | در انتظار شروع |
| 20 | چهار Arena + Arena پنجم | همه Arenaها | ⏳ | Medium | Addendum اعمال‌شده | Arena 5 ثبت شد؛ تقسیم مالکیت به‌روز شد |

## Arenaها

| Arena | مالکیت | وضعیت | توضیح | Evidence |
|---|---|---|---|---|
| Arena 1 — Database/Core | PostgreSQL، schema، migrations، queries، indexes، transactions، OCC | 🟡 | Wave 2 کامل؛ Wave 3 راستی‌آزماییِ زنده شد (تصمیمِ tenancy باز)؛ Wave 1/10 باقی | `docs/DATABASE_ARCHITECTURE.md`، `docs/WAVE3_QUERY_PERFORMANCE.md` |
| Arena 2 — Security | Auth، RBAC، Tenant isolation، session، rate limiting، security tests | 🟡 | Wave 5 کامل (ویو ۵)؛ Wave 13 باقی | `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` |
| Arena 3 — Sync/Offline | A01، Pull/Push، tombstone، cursor، offline queue، conflict resolution، IndexedDB | ⏳ | منتظر Wave 4/7 | `docs/ROADMAP.md` |
| Arena 4 — Performance/Infra | Redis، cache، workers، observability، load tests، deployment | ⏳ | منتظر Wave 6/8/9/14/15 | `docs/ROADMAP.md` |
| Arena 5 — QA / Reliability Engineering | Test Strategy، Regression، Load/Stress/Spike/Soak/Chaos، Recovery Validation، Release Gate | 🟡 | Wave 20 مرج شد (351bd10)؛ مالک quality gate همهٔ Waves (فعال) | `docs/ARENA5_QA_RELIABILITY.md` |

## راهنمای وضعیت

- ⏳ در انتظار شروع
- 🟡 در حال انجام
- ✅ کامل
- 🔴 مسدود/نیازمند تصمیم

## قرارداد به‌روزرسانی

پس از هر task مرتبط با یک Wave، همین فایل باید با وضعیت جدید، Owner، Risk، Dependency، Evidence، خلاصه اثر معماری/دیتابیس/امنیت/کارایی و لینک commit/PR به‌روز شود.
