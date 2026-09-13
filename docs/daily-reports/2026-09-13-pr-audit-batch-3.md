# ممیزی PRها — دور ۲، Batch 3 ‏(PR #79 → #58)

تاریخ: 2026-09-13 · پایه: main@`ad7ce5c` · شاخهٔ ممیزی: `fix/pr-audit-batch-2`

| PR | عنوان | sha | مرج | وضعیت | Evidence |
|---|---|---|---|---|---|
| #79 | docs: restore PUSH_RECOVERY_PLAYBOOK contract + bump docs fr | `29627ea` | ✅ | ✅ | `docs-freeze-marker.js` ✅ سبز؛ `docs-metrics.js` ✅ سبز |
| #78 | feat: WAL disk-full drill (tmpfs variant — second implementa | `94d3ac2` | ✅ | ✅⚠️ | `wal-disk-full-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `wal-disk-full.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست |
| #77 | feat: a11y keyboard navigation (focus trap + tab order) | `2c7097d` | ✅ | ⏸/✅ | `a11y-keyboard.js` ⏸ playwright غایب (محیط سندباکس)؛ `a11y-regressions.js` ✅ سبز |
| #75 | fix: bug hunt session 8 (wave 9 performance) | `a89b4b9` | ✅ | ✅ | `session8-audit-async-io-mutations.js` ✅ سبز؛ `session8-audit-async-io.js` ✅ سبز؛ `session8-audit-flush-mutations.js` ✅ سبز؛ `session8-audit-flush.js` ✅ سبز؛ `session8-audit-queue-mutations.js` ✅ سبز؛ `session8-audit-queue.js` ✅ سبز؛ `session8-cache-index-mutations.js` ✅ سبز؛ `session8-cache-index.js` ✅ سبز؛ `session8-classes-index-mutations.js` ✅ سبز؛ `session8-classes-index.js` ✅ سبز؛ `session8-gc-mutations.js` ✅ سبز؛ `session8-gc.js` ✅ سبز؛ `session8-grades-index-mutations.js` ✅ سبز؛ `session8-grades-index.js` ✅ سبز؛ `session8-public-report-mutations.js` ✅ سبز؛ `session8-public-report.js` ✅ سبز؛ `wave8-outbox-mutations.js` ✅ سبز |
| #73 | docs: migration guide v2 + duplicate fix | `ace1223` | ✅ | ✅ | `db-engineering.js` ✅ سبز؛ `migration-sequence.js` ✅ سبز |
| #72 | feat: a11y verification for modals and interactive states | `ddae7fc` | ✅ | ⏸/✅ | `a11y-interactive.js` ⏸ playwright غایب (محیط سندباکس)؛ `a11y-regressions.js` ✅ سبز |
| #71 | feat: delta sync phase 4 (backpressure, compression, region- | `e5c9b27` | ✅ | ✅ | `delta-phase4-mutations.js` ✅ سبز؛ `delta-phase4.js` ✅ سبز |
| #70 | fix: bug hunt session 7 (waves 11-13) | `b2a688a` | ✅ | ✅ | `secret-scan.js` ✅ سبز؛ `wave3-keyset.js` ✅ سبز؛ `wave5-authz.js` ✅ سبز |
| #69 | feat: WCAG 2.1 AA a11y rebuild | `c015b69` | ✅ | ⏸/✅ | `a11y-audit-mutations.js` ✅ سبز؛ `a11y-audit.js` ✅ سبز؛ `a11y-interactive.js` ⏸ playwright غایب (محیط سندباکس)؛ `a11y-keyboard.js` ⏸ playwright غایب (محیط سندباکس)؛ `a11y-modal-focus-mutations.js` ✅ سبز؛ `a11y-modal-focus.js` ✅ سبز؛ `a11y-regressions.js` ✅ سبز؛ `bughunt-session9-mutations.js` ✅ سبز؛ `bughunt-session9.js` ✅ سبز؛ `db-engineering.js` ✅ سبز؛ `delta-phase4-mutations.js` ✅ سبز؛ `delta-phase4.js` ✅ سبز؛ `docs-freeze-marker.js` ✅ سبز؛ `docs-metrics.js` ✅ سبز؛ `handoff-integrity.js` ✅ سبز؛ `migration-sequence.js` ✅ سبز؛ `multi-grade.js` ✅ سبز؛ `secret-scan.js` ✅ سبز؛ `session8-audit-async-io-mutations.js` ✅ سبز؛ `session8-audit-async-io.js` ✅ سبز؛ `session8-audit-flush-mutations.js` ✅ سبز؛ `session8-audit-flush.js` ✅ سبز؛ `session8-audit-queue-mutations.js` ✅ سبز |
| #68 | fix(delta): complete phase-3 schema gaps on main (partial-sy | `6dbef89` | ✅ | ✅ | `wave10-query-audit.js` ✅ سبز؛ `wave4-sync-all-collections.js` ✅ سبز |
| #67 | Feat/runtime security monitoring | `aaf3fab` | ✅ | ✅ | `attack-detector-mutations.js` ✅ سبز؛ `attack-detector.js` ✅ سبز؛ `observability-config.js` ✅ سبز؛ `observability-doc-coverage.js` ✅ سبز؛ `runbook-cards-coverage.js` ✅ سبز؛ `runtime-monitor-mutations.js` ✅ سبز؛ `runtime-monitor.js` ✅ سبز؛ `runtime-security-alert-mutations.js` ✅ سبز |
| #66 | chore: remove binary artifacts from repo | `948fbd1` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #65 | Feat/chat2 main sync | `5319df0` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #64 | feat: a11y runtime verification (playwright + axe-core) | `3e983ee` | ✅ | ⏸/✅ | `a11y-regressions.js` ✅ سبز؛ `a11y-runtime.js` ⏸ playwright غایب (محیط سندباکس) |
| #63 | feat: red team + supply chain audit | `b872f44` | ✅ | ✅ | `red-team-mutations.js` ✅ سبز؛ `red-team.js` ✅ سبز؛ `secret-scan.js` ✅ سبز؛ `supply-chain.js` ✅ سبز |
| #62 | Feat/push recovery playbook | `04f306c` | ✅ | ❌→✅ | `delta-schema-gaps.js` 🔴 رگرسیون main → رفع #143 |
| #61 | Chat3 restored | `728c119` | ✅ | ✅ | `bgsync.js` ✅ سبز؛ `offline-indicator.js` ✅ سبز؛ `pull-to-refresh.js` ✅ سبز؛ `storage-quota.js` ✅ سبز؛ `sync-conflict-ui.js` ✅ سبز |
| #60 | feat: Wave 19 chaos residuals (network + WAL) | `8952195` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #59 | fix(delta): close the three delta schema gaps (homework→hw_a | `282bfbe` | ⚠️* | ❌→✅ | `delta-schema-gaps.js` 🔴 رگرسیون main → رفع #143؛ `wave10-query-audit.js` ✅ سبز؛ `wave4-sync-all-collections.js` ✅ سبز |
| #58 | feat: offline-first enhancements | `a555174` | ✅ | ✅ | `bgsync.js` ✅ سبز؛ `offline-indicator.js` ✅ سبز؛ `pull-to-refresh.js` ✅ سبز؛ `storage-quota.js` ✅ سبز؛ `sync-conflict-ui.js` ✅ سبز |

\* **#59:** sha مرج `282bfbe` ancestor ‏main نیست (فقط از `feat/delta-hardening-phase2` reachable)؛ ولی محتوایش (تست `delta-schema-gaps.js` و سخت‌سازی دلتا) از راه `45ac511` در main حاضر و سوئیتش در `282bfbe` ‏12/12 سبز بود ⇒ محتوا merge-verified؛ فقط تاریخچهٔ مرج غیرمعمول (احتمالاً cherry-pick/بازآوری). رگرسیون SG11 بعدی کار #124 بود نه #59.
