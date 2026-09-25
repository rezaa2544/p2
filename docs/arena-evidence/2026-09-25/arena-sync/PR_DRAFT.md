# Draft only — Sync OCC, conflict adjudication and replay safety

Base: `4bff3bcb757162f040e82ffa26f3d40e46eb7a36`
Head: `4b577701b42fd33b61babdacab346b449e11c580`
Branch: `arena-sync/offline-occ-20260924`

No remote PR exists: push failed exit128 (HTTPS authentication unavailable).

Fix A-18 stale conflict version rewind and non-atomic resolution; A-20 missing-base PATCH inconsistencies; lost OCC base during sync persistence; concurrent UID duplication/premature pending ACK; existing-ID insert upsert; stale pull and offline queue protection. Preserve strict field/tenant validation and fail-closed persistence. Rebuild the distributable frontend. Add real-PG/HTTP and source-client adversarial suites to CI.

Evidence: 18 existing regression entrypoints exit0; new suites independently executed twice on this exact SHA, five rounds per feature suite. Details in docs/SYNC_OCC_EVIDENCE_CONTRACT.md and supplied external REPORT.md/evidence ledger.

Strict Verification Gate remains NOT VERIFIED. Empty/blocked registry and independent ChatGPT/Atria reviews are unresolved; project-wide pattern hits require QA triage. Local successes are not certification. The monitoring compatibility-marker file type and empty-registry guard were repaired without changing canonical rules or relaxing the allowlist.

Review focus: PG row-lock ordering/transaction rollback; sync-only advisory UID locks and transient duplicate 503/retry; insert-only collision semantics; client version/pending/full-snapshot behavior; legacy development/LWW boundaries. Tech Lead owns merge; do not merge before review and required CI/gate decisions. No production changes.
