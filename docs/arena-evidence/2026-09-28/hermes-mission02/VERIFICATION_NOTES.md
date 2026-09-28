# Mission 02 verification notes (local, before push)

Baseline at start of this continuation session:
- local HEAD: 631073d3, origin/main: 0fd0aed5 (10 commits ahead; local was the merge-base)
- local worktree: 12 uncommitted/untracked Mission-02 items, none pushed

Verified locally before branching:
- scripts/run-all-tests.sh: derives DATABASE_URL from PGURL, set -u safe
- migrations/024 and 025 had NO .down.sql (same G6 class as the 022 defect) -> added
- server/occ.js:23 / conflicts.js:166 / sync.js:814: strict base_version in prod
- server/revocation-fallback.js: durable revocation journal + replay
- server/key-strength.js N-06 gate correctly rejects 'a'.repeat(64) -> test fixture fixed

Test results on branch fix/hermes-mission02-applied (node v26.7.0, exit 0):
  g7-ci-database-env:            10/10
  g6-migration-022-down:         11/11 (added 024/025 down files)
  a20-occ-production-invariant:  40/40
  false-green-defense:           25/25
  reaudit-redis-outage (A-22):   17/17 (was 16/17 — S3d fail-open closed)
  reaudit-occ-stale-write:       34/34

Lint (eslint 8.57.1, project config): 1426 warnings / 0 errors with my changes;
baseline was 1426 warnings / 1 error. My changes remove the error and add no warnings.

CI evidence on this branch:
- run 36477947151: Lint step failed (no-useless-escape in my regex) -> fixed in 1724b10e
- run 36478816930: Lint PASS; regression runner reached the live-PG pre-flight for the
  first time ("-- DATABASE_URL derived from PGURL", "-- live PostgreSQL detected")
  and exposed a latent pre-existing failure: DOCS STATS STALE (exit 5).
  Root cause: docs/DOCS_FREEZE_v1.0.0-rc44.md was committed with CRLF, but
  tools/docs-stats-sync.js looks for the LF manifest header, and the manifest
  counts were stale (473 recorded vs 477 actual). Upstream main fails the same
  way (run 36479913082). Fixed in 448d4e08 (CRLF->LF + regenerated manifest;
  --freeze --check now exits 0).
