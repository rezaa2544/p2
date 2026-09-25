# Arena Sync/Offline/Conflict — execution contract
Date: 2026-09-24. Baseline fresh main: 4bff3bcb757162f040e82ffa26f3d40e46eb7a36. Branch: arena-sync/offline-occ-20260924, directly from main, no DR dependency. Owner Arena reproduction/fix/regression/commit/push/PR; Tech Lead alone merges. CERTIFIED prohibited. Strict Verification Gate applies: no fabricated ChatGPT/Atria reviews; local successful tests do not satisfy the three-review gate.

Invariant: an older/missing/malformed version must not overwrite newer data; resolution cannot rewind counters, resurrect deleted data, bypass field/tenant authorization, swallow persistence failure, or resolve twice concurrently. Two clients must race on the same version against real PG, not just sequential mock writes. Record accepted/rejected mutations and final DB state.

Workstreams: (1) offline queue/retry/duplicate/out-of-order/stale pull; (2) sync versioned update/delete, duplicate UID and concurrent batches; (3) A-20 inventory all PATCH routes and strict version omissions; (4) A-18 adversarial resolve-conflict/current-state/ownership/atomic persistence; (5) regression, exact-SHA evidence, independent review blockers and PR handoff.

Five dimensions: functional, malformed/boundary, negative/failure, concurrency/replay/recovery, independent regression. At least two fresh runs of critical runtime scenarios; use five where race-sensitive. Evidence records command, SHA/tree, environment, input/expected/actual/exit/count. Preserve failures; no skip-as-PASS.

Pre-existing dirty worktree saved in git stash (89de93a27d3a1eb5e642fa8f945ffd9b0ac6c86e) and evidence/pre-existing-tree.patch; previous DR branch retained. Fresh fetch caused storage growth; fetched main depth1 and GC reclaimed redundant history while preserving DR/stash refs (workspace back to 89MB). Dependencies/disposable runtime outside /home/user; keep workspace below100MB.

Read CURRENT_PROJECT_INTELLIGENCE, CURRENT_WORK_EXECUTION_PLAN, ATRIA_PHASE_A_CARRYOVER and STRICT_VERIFICATION_GATE alongside older Project Intelligence/ground truth. A-18/A-20 are leads, not assumed runtime defects. No changes to other Atria scope or whole-project certification. Source freeze/disjoint branch; re-read remote main and compare before PR.
