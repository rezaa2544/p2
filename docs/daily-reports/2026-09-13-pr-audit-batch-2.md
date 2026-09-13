# ممیزی PRها — دور ۲، Batch 2 ‏(PR #101 → #80)

تاریخ: 2026-09-13 · پایه: main@`ad7ce5c` · شاخهٔ ممیزی: `fix/pr-audit-batch-2`

| PR | عنوان | sha | مرج | وضعیت | Evidence |
|---|---|---|---|---|---|
| #101 | Migration 009: report_logs CHECK constraints + proven tenant | `d18b662` | ✅ | ✅ | `migration-009-live-mutations.js` ✅ سبز؛ `migration-009-live.js` ✅ سبز |
| #100 | docs(daily-reports): گزارش روزانه Wave 3 — بازراستی‌آزمایی گ | `53a1137` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #99 | test(wave10): گیت زندهٔ PostgreSQL — replica واقعی + پارتیشن | `a8bc038` | ✅ | ✅ | `wave10-pg-live-mutations.js` ✅ سبز؛ `wave10-pg-live.js` ✅ سبز |
| #98 | docs(reports): init daily-reports folder + 2026-09-12 report | `86c0fe1` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #97 | Wave 6+11: گیت زندهٔ Redis — قید pending هر دو موج بسته شد ( | `83ad521` | ✅ | ✅ | `wave6-11-redis-live-mutations.js` ✅ سبز؛ `wave6-11-redis-live.js` ✅ سبز |
| #96 | Wave 3: گیت برابری فیلد‌به‌فیلد JS↔SQL روی PostgreSQL زنده — | `f2f0ba1` | ✅ | ✅ | `wave3-parity-mutations.js` ✅ سبز؛ `wave3-parity.js` ✅ سبز |
| #95 | E.11: به‌روزرسانی هدفمند راهنمای کاربر (USER_GUIDE) — چهار پ | `6d03418` | ✅ | ✅ | `user-guide-mutations.js` ✅ سبز؛ `user-guide.js` ✅ سبز |
| #94 | feat(wave18): national load test — staging run, bounded hydr | `c91c788` | ✅ | ✅ | `wave18-hydration-guards.js` ✅ سبز؛ `wave18-spike-test.js` ✅ سبز؛ `wave18-stress-test.js` ✅ سبز |
| #93 | perf(reports): DB-native attendance report on PostgreSQL (Wa | `e2779f7` | ✅ | ✅ | `wave23-reports-pg.js` ✅ سبز؛ `wave23-reports-sql.js` ✅ سبز |
| #92 | feat(tools): docs-refs-check ratchet + migration 008 pins fr | `efe364d` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز؛ `docs-refs-check.js` ✅ سبز |
| #90 | test(a11y): assert f()'s behaviour, not the spelling of its  | `d8880f4` | ✅ | ✅ | `a11y-regressions.js` ✅ سبز |
| #89 | Wave 24: بهینه‌سازی عملکرد — ۴/۴ KPI سبز (index.html −۲۷٪، b | `7ee5237` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #88 | Wave 23: سیستم گزارش‌دهی پیشرفته — ۴ گزارش وزارتی، آفلاین‌او | `0a45c13` | ✅ | ✅ | `reports-basic.js` ✅ سبز؛ `reports-export.js` ✅ سبز؛ `reports-offline.js` ✅ سبز؛ `reports-tenant-isolation.js` ✅ سبز؛ `smoke.js` ✅ سبز |
| #87 | feat(tools): docs-stats-sync — stop hand-typing doc counts;  | `613df6c` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز |
| #86 | docs: تأیید نهایی Wave 21 + وضعیت PR #74/#81/#84 + آماده‌ساز | `8812e15` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #85 | feat: wave 21 — multigrade matrix view for rural schools (کل | `d1a0bf2` | ✅ | ✅ | `multi-grade.js` ✅ سبز؛ `smoke.js` ✅ سبز |
| #84 | fix: bug hunt session 9 (delta phase 4 / a11y keyboard / WAL | `886e2da` | ✅ | ✅ | `bughunt-session9-mutations.js` ✅ سبز؛ `bughunt-session9.js` ✅ سبز؛ `delta-phase4-mutations.js` ✅ سبز؛ `docs-freeze-marker.js` ✅ سبز؛ `handoff-integrity.js` ✅ سبز |
| #83 | fix(docs): bundle-recovery commands were broken — invalid re | `44d0db4` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #81 | fix(wave19): HANDOFF mojibake + stale migration list + --ski | `9e7da2c` | ✅ | ✅⚠️ | `a11y-modal-focus-mutations.js` ✅ سبز؛ `a11y-modal-focus.js` ✅ سبز؛ `bughunt-session9-mutations.js` ✅ سبز؛ `bughunt-session9.js` ✅ سبز؛ `delta-phase4-mutations.js` ✅ سبز؛ `docs-freeze-marker.js` ✅ سبز؛ `handoff-integrity.js` ✅ سبز؛ `multi-grade.js` ✅ سبز؛ `pr81-mutations.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `wal-disk-full.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `wal-drill-bootstrap.js` ✅ سبز |
| #80 | fix(a11y): keep focus restore alive across nested modals (S9 | `9eea4df` | ✅ | ✅ | `a11y-modal-focus-mutations.js` ✅ سبز؛ `a11y-modal-focus.js` ✅ سبز |
