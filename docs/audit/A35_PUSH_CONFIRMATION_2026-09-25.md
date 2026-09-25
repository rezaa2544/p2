# A-35 Push Confirmation — 2026-09-25

**Repo:** rezaa2544/p2 · **Branch:** main · **Push:** `2baa7c1..31145f0` (fast-forward)

| Commit | Content |
|---|---|
| `e05d021` fix(A-35) | Cross-tenant authz bypass fixes: server/policy.js (+62/−6), server/auth.js (+14/−2), tests/a35-regression.js (+175, 15 live pins) |
| `31145f0` docs(audit) | A-35 audit bundle: docs/audit/a35-idor/ (report, 7 evidence files, 4 harnesses, fixture overlay, IDOR phase 1/2 reports, Arena-4 observability/DB/verification reports) + tests/idor-runtime{,-r4}.js, tests/idor-regression.js (22 files, +2541) |

**Verification on the pushed base (2baa7c1 + e05d021):**
- `tests/a35-regression.js` live run: **15 PASS / 0 FAIL / 0 SKIP** (app + PG + Redis, prod env, A-35 fixture).
- All 8 exploit pins rejected (403 out_of_scope / canonical bucket / OTP replay 401); all 7 control pins intact.
- Upstream drift note: remote advanced 4bff3bcb → 2baa7c1 (12 commits) before this push; upstream did NOT touch server/policy.js, server/auth.js, or the inScope call path in server/sync.js; fix re-verified on the new base before pushing.

**Workspace hygiene:** audit artifacts now live in the repo; duplicate root-level copies removed from the local workspace (kept: report, env-bootstrap.sh, a35-overlay.js). Workspace < 100MB.
