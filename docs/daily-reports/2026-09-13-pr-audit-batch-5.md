# ممیزی PRها — دور ۲، Batch 5 ‏(PR #37 → #18)

تاریخ: 2026-09-13 · پایه: main@`ad7ce5c` · شاخهٔ ممیزی: `fix/pr-audit-batch-2`

| PR | عنوان | sha | مرج | وضعیت | Evidence |
|---|---|---|---|---|---|
| #37 | feat: فاز ۰.۱+۰.۲+۰.۳ + ادغامِ شاخهٔ زیرساخت/امنیت (authz مر | `f92f9c2` | ✅ | ✅ | `academic-years-mutations.js` ✅ سبز؛ `academic-years.js` ✅ سبز؛ `exam-types-mutations.js` ✅ سبز؛ `exam-types.js` ✅ سبز؛ `school-type-mutations.js` ✅ سبز؛ `school-type.js` ✅ سبز |
| #36 | Feat/redis cluster chat4 | `84875b4` | ✅ | ✅ | `redis-backup.js` ✅ سبز؛ `redis-cluster.js` ✅ سبز |
| #35 | Feat/b3 d234 chat4 | `d816c30` | ✅ | ✅⚠️ | `region-scorecard-mutations.js` ✅ سبز؛ `region-scorecard.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `staff-gap-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `staff-gap.js` ✅ سبز؛ `urgent-ann-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `urgent-ann.js` ✅ سبز |
| #34 | feat(internship): add e.2 progress, certificate, overview, m | `fb9fcba` | ✅ | ✅ | `internship-mutations.js` ✅ سبز؛ `internship2.js` ✅ سبز |
| #33 | feat(behavior): add e.3 quick awards, dashboard strip, manag | `80c5e3e` | ✅ | ✅ | `behavior-mutations.js` ✅ سبز؛ `behavior2.js` ✅ سبز |
| #32 | feat(assets): add e.5 counts, custodian, and search | `cd484c3` | ✅ | ✅ | `assets-mutations.js` ✅ سبز؛ `assets2.js` ✅ سبز |
| #31 | feat(health): add g.1 school health index | `c2473e1` | ✅ | ✅ | `health-index-mutations.js` ✅ سبز؛ `health-index.js` ✅ سبز |
| #30 | feat(schedgen): add e.6 automatic timetable generator | `2a2b74f` | ✅ | ✅ | `schedule-gen-mutations.js` ✅ سبز؛ `schedule-gen.js` ✅ سبز |
| #29 | feat(library): add e.4 delegation, copies, and student view | `c7eee52` | ✅ | ✅ | `library-mutations.js` ✅ سبز؛ `library2.js` ✅ سبز؛ `smoke.js` ✅ سبز |
| #28 | feat(b3): anonymous teacher evaluation — no responder identi | `6236c3b` | ✅ | ✅ | `smoke.js` ✅ سبز؛ `teacher-eval-mutations.js` ✅ سبز؛ `teacher-eval-server.js` ✅ سبز؛ `teacher-eval.js` ✅ سبز |
| #27 | Feat/staff training chat1 | `390b77e` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #26 | docs: add cert reports verification | `cc0b00d` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #25 | feat(security): add session revocation denylist with redis | `8878cf2` | ✅ | ✅ | `session-revocation-mutations.js` ✅ سبز؛ `session-revocation.js` ✅ سبز |
| #24 | docs: add chat3 summary | `b08862e` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #23 | docs: add zero trust architecture | `56bbedf` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #22 | feat(observability): implement distributed tracing with Jaeg | `455b2e9` | ✅ | ✅ | `tracing-integration.js` ✅ سبز؛ `tracing-mutations.js` ✅ سبز؛ `tracing-performance.js` ✅ سبز؛ `tracing-sampling.js` ✅ سبز |
| #21 | feat(security): implement waf and ddos protection | `9b10f66` | ✅ | ✅ | `waf-ddos.js` ✅ سبز؛ `waf-mutations.js` ✅ سبز |
| #20 | feat(security): implement distributed rate limiting with red | `7a193ba` | ✅ | ✅ | `rate-limit-distributed.js` ✅ سبز؛ `rate-limit-mutations.js` ✅ سبز |
| #19 | Feat/p2 redis integrity chat4 | `430c7c8` | ✅ | ✅ | `id-collision.js` ✅ سبز؛ `lock-atomic.js` ✅ سبز؛ `occ.js` ✅ سبز؛ `otp-redis.js` ✅ سبز؛ `redis-fallback.js` ✅ سبز؛ `redis-key-audit.js` ✅ سبز؛ `tombstone.js` ✅ سبز |
| #18 | P1 data integrity (chat3): queue caps + DB invariants + atom | `46cc979` | ✅ | ✅⚠️ | `migrate-pg-constraints-mutations.js` ✅ سبز؛ `migrate-pg-constraints.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `sync-atomic-batch-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `sync-atomic-batch.js` ✅ سبز؛ `sync-queue-caps-mutations.js` ✅ سبز؛ `sync-queue-caps.js` ✅ سبز |
