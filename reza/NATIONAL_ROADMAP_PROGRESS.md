# پیگیری پیشرفت نقشه راه ملی پایش

**مرجع اصلی:** `docs/ROADMAP.md` — National Scale Master Roadmap

**مکمل الزام‌آور:** `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` — اجرای Waves بدون رعایت آن مجاز نیست.

**قاعده Addendum:** فقط Status کافی نیست؛ هر ردیف باید Owner، Risk، Dependency و Evidence داشته باشد.

| Wave | عنوان | Owner | Status | Risk | Dependency | Evidence |
|---:|---|---|---|---|---|---|
| -1 | Architecture Discovery | Arena 5 / همه Arenaها | 🟡 | High | پیش‌نیاز همه Waves | بخش اول کامل شد: docs/DEPENDENCY_GRAPH.md، docs/DATA_FLOW.md، docs/AUTH_FLOW.md، docs/SYNC_FLOW.md |
| 0 | Baseline و Freeze | Arena 1 + Arena 5 | 🟡 | Medium | Wave -1 + تقسیم بخش‌های ۲ تا ۴ | docs/NATIONAL_BASELINE.md؛ tag national-baseline-start؛ Part 1 کامل |
| 1 | PostgreSQL Source of Truth [P0] | Arena 1 | ⏳ | Critical | Wave -1 و Wave 2؛ هماهنگی با چت ۲/۳ | در انتظار شروع/ادغام خروجی چت‌های Wave 1 |
| 2 | Database Engineering | Arena 1 | ✅ | High | Wave -1 برای کشف کامل؛ Wave 1 برای PG-only شدن تولید | docs/DATABASE_ARCHITECTURE.md؛ migrations/؛ tests/db-engineering.js |
| 3 | Query و Performance [P0] | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2 | در انتظار شروع |
| 4 | Sync / A01 | Arena 3 | ⏳ | High | Wave 1/2/5 | در انتظار شروع |
| 5 | Authorization و Tenant Isolation [P0] | Arena 2 | ⏳ | Critical | Wave -1 و مدل واحد policy | در انتظار شروع |
| 6 | Redis و Distributed State [P0] | Arena 4 | ⏳ | High | Wave 1 و سیاست production readiness | در انتظار شروع |
| 7 | Offline-first | Arena 3 | ⏳ | Medium | Wave 4/6 | در انتظار شروع |
| 8 | Async Architecture | Arena 4 | ⏳ | Medium | Wave 1/2 و Outbox | در انتظار شروع |
| 9 | Application Performance | Arena 4 | ⏳ | High | Wave 3 و baseline عملکرد | در انتظار شروع |
| 10 | Database Scale | Arena 1 + Arena 4 | ⏳ | High | Wave 1/2/3 و benchmark | در انتظار شروع |
| 11 | Cache | Arena 4 | ⏳ | Medium | Wave 3/6 و benchmark | در انتظار شروع |
| 12 | Network / Edge | Arena 4 | ⏳ | Medium | استقرار production و TLS/CDN/WAF | در انتظار شروع |
| 13 | Security Program | Arena 2 + Arena 5 | ⏳ | Critical | Wave 5 و threat model | در انتظار شروع |
| 14 | Observability | Arena 4 + Arena 5 | ⏳ | High | Wave -1 و deployment model | در انتظار شروع |
| 15 | Health / Deployment | Arena 4 | ⏳ | High | Wave 14 و stateless API | در انتظار شروع |
| 16 | Disaster Recovery | Arena 4 + Arena 5 | ⏳ | Critical | Wave 10/15 و RPO/RTO | در انتظار شروع |
| 17 | Testing Pyramid | Arena 5 | ⏳ | High | همه Waveها | در انتظار شروع |
| 18 | National Load Testing | Arena 5 + Arena 4 | ⏳ | High | Capacity Model، Wave 3/10/14 | در انتظار شروع |
| 19 | Chaos / Failure Testing | Arena 5 + Arena 4 | ⏳ | Critical | Wave 15/16 و Observability | در انتظار شروع |
| 20 | چهار Arena + Arena پنجم | همه Arenaها | ⏳ | Medium | Addendum اعمال‌شده | Arena 5 ثبت شد؛ تقسیم مالکیت به‌روز شد |

## Arenaها

| Arena | مالکیت | وضعیت | توضیح | Evidence |
|---|---|---|---|---|
| Arena 1 — Database/Core | PostgreSQL، schema، migrations، queries، indexes، transactions، OCC | 🟡 | Wave 2 کامل؛ Wave 1/3/10 باقی | `docs/DATABASE_ARCHITECTURE.md` |
| Arena 2 — Security | Auth، RBAC، Tenant isolation، session، rate limiting، security tests | ⏳ | منتظر Wave -1 و Wave 5/13 | `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` |
| Arena 3 — Sync/Offline | A01، Pull/Push، tombstone، cursor، offline queue، conflict resolution، IndexedDB | ⏳ | منتظر Wave 4/7 | `docs/ROADMAP.md` |
| Arena 4 — Performance/Infra | Redis، cache، workers، observability، load tests، deployment | ⏳ | منتظر Wave 6/8/9/14/15 | `docs/ROADMAP.md` |
| Arena 5 — QA / Reliability Engineering | Test Strategy، Regression، Load/Stress/Spike/Soak/Chaos، Recovery Validation، Release Gate | ⏳ | افزوده‌شده طبق Addendum؛ باید مالک quality gate همه Waves باشد | `docs/NATIONAL_ROADMAP_ARCHITECTURE_ADDENDUM.md` |

## راهنمای وضعیت

- ⏳ در انتظار شروع
- 🟡 در حال انجام
- ✅ کامل
- 🔴 مسدود/نیازمند تصمیم

## قرارداد به‌روزرسانی

پس از هر task مرتبط با یک Wave، همین فایل باید با وضعیت جدید، Owner، Risk، Dependency، Evidence، خلاصه اثر معماری/دیتابیس/امنیت/کارایی و لینک commit/PR به‌روز شود.
