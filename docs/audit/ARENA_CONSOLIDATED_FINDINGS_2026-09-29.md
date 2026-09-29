# Arena 1/2/3 — Consolidated Hidden-Defect Findings Intake
Date: 2026-09-29
Repository: rezaa2544/p2
Audited HEAD: 633fec4652b51d3b325584f5a57efddf8f4401af

## Purpose
This document extracts reusable findings, lessons, and verification patterns from the Arena 1/2/3 independent red-team reports. It is an intake/canonical summary, not a claim that every finding is already fixed or certified.

## Confirmed / high-confidence findings from the reports

### 1. OTP 0000 bypass and production-truth mismatch
- Arena reproduced the fixed OTP value 0000 bypass in the current HEAD.
- The bypass can skip normal OTP record/rate-limit checks when the environment is treated as non-production.
- A deeper finding is the mismatch between production detection in different modules (for example NODE_ENV/PAYESH_ENV in auth versus production-shape logic elsewhere).
- The important reusable lesson: production truth must be defined once and used consistently; security-sensitive dev bypasses must never become reachable merely because an environment variable was omitted or misclassified.
- Status: CONFIRMED in the reports; current fix status must always be checked against current HEAD/evidence.

### 2. Revocation fallback is a distributed-systems boundary
Arena found multiple failure modes around the disk revocation journal:
- concurrent read-modify-write can lose a newly appended revocation;
- multi-instance/container deployments cannot safely rely on instance-local storage;
- synchronous disk I/O in the authenticated request path creates an Event Loop/performance risk;
- append failure can be ignored while an audit event still claims the revocation was journaled;
- documentation references a replay bound/environment variable that the implementation does not actually use.
Arena 2 runtime reproduced 16 lost revocations out of 100 under four concurrent writers.
Arena 1 separately reproduced an interleaving where a newly appended revocation was overwritten during replay.
- Reusable lesson: a security fallback must be designed for the deployment topology it claims to protect. Multi-instance state requires shared durable coordination; read-modify-write needs atomicity/concurrency control; audit records must reflect actual persistence results.

### 3. Partial bootstrap seed can permanently shrink runtime data
Arena 2 reproduced a two-boot cascade:
- bootstrap contains more data than PG after a partial seed;
- first boot leaves PG partial;
- next boot hydrates from partial PG;
- runtime remains smaller than the bootstrap source with no durable divergence warning.
- Impact described by Arena: availability/data-loss exposure after an initial seed failure.
- Reusable lesson: when a source-of-truth transition crosses boot boundaries, partial failure must have an explicit convergence/recovery contract. A single-boot guard is insufficient; test multi-boot sequences.

### 4. Outbox collision can silently drop events
Arena identified the contradiction between:
- INSERT ... ON CONFLICT (id) DO NOTHING
- and catch logic expecting PostgreSQL 23505 to trigger ID regeneration.
With DO NOTHING, the conflict may return rowCount=0 instead of throwing, so the recovery branch is unreachable.
- Reusable lesson: verify SQL control flow against actual database semantics; never treat "no exception" as successful persistence when rowCount/affected-row semantics can indicate a dropped write.
- Status in Arena reports: confirmed by static analysis; runtime reproduction should still be used for final certification.

### 5. Office scope can fail open when geographic fields are missing
Arena reported that an office with null province/county/district fields can cause office coverage logic to return true and DB query construction to omit geographic restrictions.
Arena 3 also reported runtime reproduction of cross-school access.
- Reusable lesson: missing authorization boundary data must fail closed. Never interpret an absent scope as unrestricted scope.
- This finding overlaps prior HIDDEN-05/A-22-style scope concerns and should be deduplicated rather than counted as a new independent defect each time.

### 6. Partitioned grades/attendance identity invariant
Arena 3 identified a potential integrity problem when a partitioned table uses a composite primary key (id, created_at) while application code treats id alone as unique.
Concurrent inserts with the same id but different created_at could therefore evade a uniqueness violation.
- Reusable lesson: application identity semantics must match actual database constraints, especially after partitioning. Verify concurrency, upsert semantics, foreign-key references, and sequence behavior on the real PostgreSQL engine.
- Status: reported by Arena; requires current PostgreSQL reproduction before certification.

### 7. Test-runner environment stripping / false-green risk
Arena 3 reported that tests/api/runner.js deletes DATABASE_URL/PGURL/READ_DATABASE_URL/REDIS_URL before running API suites.
Arena also identified patterns such as assert(true), process.exit(0), || true, stale registries, and CI early exits.
- Reusable lesson: a test that intentionally removes the production dependency can prove only mock behavior, not database/runtime truth. A green suite must state whether it is mock, integration, or production-like runtime evidence.
- This is a process-integrity issue and belongs under the project's Evidence Gate / false-green laws.

### 8. CI chain can hide downstream failures
Arena 1 found an ESLint 10/config mismatch that stopped CI before later tests/gates ran.
Arena also found merge-through-red behavior and security workflows that were failing for unrelated/misconfigured reasons.
- Reusable lesson: "first failure" is not equivalent to "only failure". Once the first blocker is fixed, the full chain must be rerun; downstream gates need independent visibility.
- A CI pipeline should make dependency/skip/early-exit behavior explicit.

### 9. Docs references: green ratchet != repaired documentation
Arena found a large stale-reference baseline where the ratchet could report zero NEW stale references while historical broken references remained.
- Reusable lesson: distinguish "no new debt" from "existing debt repaired". A baseline suppresses regression but does not certify documentation correctness.
- Status of any exact count must be bound to the audited SHA and current checker behavior.

### 10. Teacher subject-scope policy is a policy-intent question
Arena 2 reproduced that a teacher who teaches a subject in one class can see grades for that subject in another class.
All three examined paths were consistent, so this is not merely JS/SQL drift.
- Status: behavior CONFIRMED; defect SUSPECT until the intended policy is decided.
- Reusable lesson: authorization correctness is not only code parity; it requires an explicit business policy/ownership contract. Consistent implementation of the wrong policy is still wrong, but must not be labeled a defect without establishing intent.

## Important revalidated findings / themes
- OCC/versionless compatibility can permit silent stale writes; distinguish "bypass" from "unsafe compatibility fallback".
- Some previous migration concerns were false positives: Arena reported 25/25 down files and live forward/backward/forward checks for migrations 024/025 under appropriate data conditions.
- SQL injection concerns in reports were rejected where allowlists and parameter binding were present.
- Client-injected independent verification for intelligence certification was not supported by the examined public route.
- Jalali storage/display separation was reported as sound.
- Some earlier claims about bootstrap grade conversion were rejected for classes because unknown strings are rescued into grade_level; subjects require separate analysis.

## Reusable engineering lessons extracted from all three Arenas

1. **Fresh baseline first:** always fetch current origin/main before evaluating a prior claim.
2. **Break the claim, not the code:** independent reviewers should not fix what they are reviewing.
3. **Report != evidence:** a finding needs reproduction or sufficient source/runtime evidence.
4. **Deduplicate by root cause:** the same scope bypass reported by several Arenas is one underlying defect, not several defects.
5. **Separate behavior from policy intent:** if all paths agree, determine whether the contract itself is wrong before calling it a bug.
6. **Static evidence and runtime evidence have different authority:** runtime/database/distributed claims need the real environment when applicable.
7. **Cross-instance behavior needs cross-instance tests:** single-process tests cannot certify distributed guarantees.
8. **Two-boot and restart sequences matter:** many data-integrity defects emerge only after state crosses process boundaries.
9. **Negative tests must prove the bad path fails:** especially for auth, scope, concurrency, recovery, and false-green detection.
10. **A test suite can be green while its environment is fake:** record mock/in-memory/real-DB status explicitly.
11. **First CI failure can conceal later failures:** after each blocker is fixed, rerun the complete chain.
12. **Missing scope data is security-sensitive:** default-deny, not default-allow.
13. **Database constraints are part of application invariants:** verify schema constraints and application assumptions together.
14. **Audit logs must be truthful:** an audit event must not claim persistence that failed.
15. **Documentation baselines are not documentation repair:** distinguish ratchet health from actual reference validity.
16. **Unknown is a valid status:** Arena correctly kept some findings SUSPECT/NEEDS-RUNTIME instead of inflating them.
17. **Do not bulk-fix sibling patterns without reproduction:** discover broadly, confirm narrowly, then fix at the invariant boundary.
18. **Current SHA + environment binding is mandatory:** historical Arena evidence is not automatically current evidence.

## Findings intentionally NOT promoted to confirmed defects
The reports contained additional SUSPECT/LIKELY/NEEDS-RUNTIME items including:
- unscoped tombstones with null school_id;
- replay-journal performance magnitude;
- full live parity of all dbquery builders;
- OCC requirements beyond currently versioned collections;
- office_id→region fallback exploitability;
- certification-non-circular and sync delta-schema gaps;
- full 244-test RED breakdown under real PG/Redis CI;
- exact branch-protection configuration.
These remain revalidation items, not confirmed facts.

## How this intake should be used later
Before starting any future Payesh mission, compare new findings against this list and classify each as:
DISCOVERED → REPORTED → SUSPECTED → REPRODUCED → ROOT-CAUSED → IMPLEMENTED → TESTED → VERIFIED → INDEPENDENTLY VERIFIED → CERTIFIED.

Do not count the same root cause multiple times merely because Arena 1/2/3 found it independently. Independent reports are valuable as independent evidence, not automatic additional defects.

Source: uploaded Arena 1/2/3 report bundle, audited HEAD 633fec4.
