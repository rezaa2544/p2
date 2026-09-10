# پیگیری پیشرفت نقشه راه ملی پایش

**مرجع اصلی:** `docs/ROADMAP.md` — National Scale Master Roadmap

**مکمل الزام‌آور:** `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` — اجرای Waves بدون رعایت آن مجاز نیست.

**قاعده Addendum:** فقط Status کافی نیست؛ هر ردیف باید Owner، Risk، Dependency و Evidence داشته باشد.

| Wave | عنوان | Owner | Status | Risk | Dependency | Evidence |
|---:|---|---|---|---|---|---|
| -1 | Architecture Discovery | Arena 5 / همه Arenaها | ✅ | High | پیش‌نیاز همه Waves | کامل شد: Dependency/Data/Auth/Sync Flow + docs/THREAT_MODEL.md + docs/BOTTLENECK_MAP.md |
| 0 | Baseline و Freeze | Arena 1 + Arena 5 | ✅ | Medium | Wave -1 کامل | Part 1: docs/NATIONAL_BASELINE.md؛ Part 2: docs/NATIONAL_BASELINE_PART2.md؛ Part 3: docs/NATIONAL_BASELINE_PART3.md؛ Part 4: docs/NATIONAL_BASELINE_PART4.md؛ tag national-baseline-start (Part 4 بازسازی شد — commit اولیهٔ 0245515 هرگز push نشده بود) |
| 1 | PostgreSQL Source of Truth [P0] | Arena 1 | 🟡 | Critical | Wave -1 و Wave 2؛ هماهنگی با چت ۲/۳ | بخش writes کامل روی origin/arena/01a08545-p2 (چت ۳؛ tests/wave1-writes.js + mutations)؛ تکمیل + ریبیس سنگین (ahead25/behind105 از main) + PR باقی |
| 2 | Database Engineering | Arena 1 | ✅ | High | Wave -1 برای کشف کامل؛ Wave 1 برای PG-only شدن تولید | docs/DATABASE_ARCHITECTURE.md؛ migrations/؛ tests/db-engineering.js |
| 3 | Query و Performance [P0] | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2 | در انتظار شروع |
| 4 | Sync / A01 | Arena 3 | ⏳ | High | Wave 1/2/5 | در انتظار شروع |
| 5 | Authorization و Tenant Isolation [P0] | Arena 2 | ⏳ | Critical | Wave -1 و مدل واحد policy | در انتظار شروع |
| 6 | Redis و Distributed State [P0] | Arena 4 | 🟡 | High | Wave 1 و سیاست production readiness | کامل روی origin/arena/01a08545-p2 (چت ۳؛ tests/wave6-redis.js)؛ منتظر ریبیس و PR |
| 7 | Offline-first | Arena 3 | ⏳ | Medium | Wave 4/6 | در انتظار شروع |
| 8 | Async Architecture | Arena 4 | ⏳ | Medium | Wave 1/2 و Outbox | در انتظار شروع |
| 9 | Application Performance | Arena 4 | 🟡 | High | Wave 3 و baseline عملکرد (Part 2/3 ✅) | شروع شد: heavy worker برایِ persist/backup/report + ممیزیِ پس‌زمینه + L1 محدود + کشِ استاتیک (docs/WAVE9_PERFORMANCE.md؛ tests/wave9-performance.js ‏39/39؛ بلاکِ event-loop بکاپ ~۴۶ms→۰٫۶ms). باقی‌مانده: ایندکسِ مسیرهای فیلترِ O(n) (وابسته به Wave 1) |
| 10 | Database Scale | Arena 1 + Arena 4 | 🟡 | High | Wave 1/2/3 و benchmark | روی main سبز: tests/wave10-db-scale.js ‏26/26‏ (routing + fallback با fake pool)؛ اجرای واقعی رپلیکای PG زنده باقی |
| 11 | Cache | Arena 4 | 🟡 | Medium | Wave 3/6 و benchmark | کامل روی origin/arena/01a08545-p2 (چت ۳؛ tests/wave11-cache.js)؛ منتظر ریبیس و PR |
| 12 | Network / Edge | Arena 4 | ⏳ | Medium | استقرار production و TLS/CDN/WAF | در انتظار شروع |
| 13 | Security Program | Arena 2 + Arena 5 | 🟡 | Critical | Wave 5 و threat model | پوشش CI کامل روی arena/01a08a2e-p2 (تست wave13 ‏23/23‏؛ ZAP best-effort با fallback هدف محلی، بدون skip)؛ enforce روی یافته‌های High + DAST واقعی staging باقی |
| 14 | Observability | Arena 4 + Arena 5 | 🟡 | High | Wave -1 و deployment model | کامل روی origin/arena/01a0867f-p2 (چت ۲؛ tests/wave14-observability.js + mutations)؛ منتظر ریبیس (ahead16/behind25) و PR |
| 15 | Health / Deployment | Arena 4 | 🟡 | High | Wave 14 و stateless API | کامل روی origin/arena/01a08545-p2 (چت ۳؛ tests/wave15-health.js: liveness/readiness/drain)؛ منتظر ریبیس و PR |
| 16 | Disaster Recovery | Arena 4 + Arena 5 | 🟡 | Critical | Wave 10/15 و RPO/RTO | کامل روی origin/arena/01a0867f-p2 (چت ۲؛ tests/wave16-dr.js + mutations)؛ منتظر ریبیس و PR |
| 17 | Testing Pyramid | Arena 5 | 🟡 | High | همه Waveها | کامل روی origin/arena/01a0867f-p2 (چت ۲؛ 96bf550؛ tests/wave17-testing.js ‏54/54‏ + mutations ‏10/10‏)؛ منتظر ریبیس و PR |
| 18 | National Load Testing | Arena 5 + Arena 4 | 🟡 | High | Capacity Model، Wave 3/10/14 | کامل روی origin/arena/01a08545-p2 (چت ۳؛ 38/38 + پلن بار ملی 10M کاربر)؛ اجرای زنده در انتظار infra چندنوده؛ منتظر ریبیس و PR |
| 19 | Chaos / Failure Testing | Arena 5 + Arena 4 | 🟡 | Critical | Wave 15/16 و Observability | کامل روی origin/arena/01a08545-p2 (چت ۳؛ 28/28 + پنج سناریوی آشوب)؛ اجرای زنده در انتظار infra؛ منتظر ریبیس و PR |
| 20 | چهار Arena + Arena پنجم | همه Arenaها | ✅ | Medium | Addendum اعمال‌شده | مرج شد: PR #45 (feat/wave20-chat4) ← 351bd10 (2026-09-10): docs/ARENA5_QA_RELIABILITY.md + docs/ARENA4_PERFORMANCE_INFRA.md + tests/wave20-arena5.js ‏22/22‏ + دروازهٔ انتشار؛ ci/pending patch ثبت شد |

## Arenaها

| Arena | مالکیت | وضعیت | توضیح | Evidence |
|---|---|---|---|---|
| Arena 1 — Database/Core | PostgreSQL، schema، migrations، queries، indexes، transactions، OCC | 🟡 | Wave 2 کامل؛ Wave 1/3/10 باقی | `docs/DATABASE_ARCHITECTURE.md` |
| Arena 2 — Security | Auth، RBAC، Tenant isolation، session، rate limiting، security tests | ⏳ | منتظر Wave -1 و Wave 5/13 | `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` |
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
