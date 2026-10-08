# PAYESH — CONTROL PLANE RECONCILIATION PROTOCOL

**Status:** CANONICAL / MANDATORY
**Purpose:** Prevent repository-reality denial, verifier over-trust, mission-state loss, and false completion.

## 1. Three independent truths
Every material claim must reconcile:
- MISSION TRUTH — exact mission, owner/chat, scope, non-goals and finite DoD.
- REPORT TRUTH — what executor/verifier claims and its evidence.
- REPOSITORY TRUTH — current Git refs, ancestry, files, tests, CI/runtime evidence and canonical queue.

No single agent, report, memory, or previous verdict is authoritative by itself.

## 2. Mandatory Triple Reconciliation
A material status may become VERIFIED only when Mission + Report + Repository are mutually consistent.
If any conflict exists: RECONCILIATION_REQUIRED / NOT VERIFIED.

Mandatory checks: mission ID; owner/chat; Primary Objective; DoD; current HEAD; origin/main; relevant branch; exact SHA; parent/ancestry; local vs remote branch vs PR vs main; changed files/diff; test commands and exits; CI/runtime evidence; canonical queue; parallel-session changes; working-tree state.

## 3. Branch is not main
These states are distinct:
LOCAL → REMOTE BRANCH → PR → MERGED MAIN → CURRENT-HEAD VERIFIED

PUBLISHED-BRANCH is not MERGED-MAIN. COMMITTED is not VERIFIED. OLD-HEAD VERIFIED is not CURRENT-HEAD VERIFIED. TEST-PASS is not MISSION-COMPLETE.

## 4. Hermes Verification Contract
Hermes MUST independently inspect repository reality, exact refs and ancestry; distinguish branch publication from main merge; challenge executor claims conflicting with Git; check mission alignment; invalidate stale evidence; report conflicts; and never defend a prior verdict merely because it was previously issued.

Required report sections: MISSION ALIGNMENT; REPOSITORY RECONCILIATION; TECHNICAL EVIDENCE; CONFLICTS / LIMITATIONS; FINAL VERDICT.

If repository evidence contradicts a report, Hermes must explicitly state: CONFLICT — REPORT NOT ACCEPTED AS GROUND TRUTH.

## 5. ChatGPT Control-Plane Contract
Before accepting any material executor/verifier verdict, ChatGPT MUST retrieve the original mission/DoD; identify owner/chat; reconcile report against current repository; verify branch/main state; inspect parallel-session changes; classify unrelated findings separately; then issue the control-plane verdict.

ChatGPT MUST NOT accept a verdict solely because Hermes agrees with Atria; infer completion from prose; treat historical status as current; confuse branch publication with main merge; lose chat ownership; or silently replace the Primary Objective with supporting work.

## 6. Durable Mission Ledger
Every active mission must have a durable record containing: Mission ID; Primary Objective; Non-goals; Owner/chat; assigned date; DoD; expected branch/worktree; expected commit/PR; status; last verified HEAD; executor report; Hermes verification; ChatGPT reconciliation; deferred findings; blockers; next action.

A chat message alone cannot close a mission.

## 7. Completion States
Allowed states:
NOT STARTED / IN PROGRESS / BLOCKED / FIXED-SCOPED / PUBLISHED-BRANCH / MERGED-MAIN / REVALIDATION_REQUIRED / VERIFIED / CLOSED / ACCEPTED RISK

VERIFIED requires current-head evidence. CLOSED requires the canonical queue to reflect the verified state.

## 8. Evidence Invalidation
Material changes to tested code, shared infrastructure, auth/security, schema/migrations, queue/cache/invalidation, test harness/gates, configuration, runtime/dependencies, or evidence registries invalidate dependent evidence.

Invalidated evidence becomes REVALIDATION_REQUIRED. Old PASS cannot be silently reused.

## 9. Parallel-Session Protection
Before completion: compare start/end HEAD; enumerate commits in the mission window; identify other-session commits; inspect whether they touched the tested surface; and record unrelated changes separately.

No session may claim another session's commit without evidence.

## 10. Mission Drift Guard
Every mission has one Primary Objective. Useful independent discoveries are SUPPORTING / DEFERRED and must enter the queue without replacing the mission.

When work starts becoming a different objective, executor and verifier must emit MISSION-DRIFT ALERT.

Completion is forbidden until the original DoD is satisfied.

## 11. Report Acceptance Gate
Every material report must contain: mission ID; Primary Objective; exact HEAD; exact branch; exact commit(s); changed files; commands/tests and exit codes; evidence artifacts; limitations; incomplete DoD; supporting/deferred findings; final verdict.

Missing critical evidence means NOT VERIFIED, never PASS.

## 12. Anti-Denial Rule
When narrative conflicts with repository evidence: repository evidence wins for repository state; mission record wins for assigned scope; neither agent may override the conflict by assertion.

The required action is reconciliation.

## 13. Final Closure Question
Before closing any mission, verifier and control plane must answer:

> If every previous report were ignored and only the mission record plus current repository/evidence were inspected, would the same verdict be reached?

If no: RECONCILIATION_REQUIRED.

## 14. Recurrence Prevention
Any recurrence of repository/report conflict, branch/main confusion, stale-head verification, mission drift, lost chat ownership, parallel-session confusion, or unsupported completion claim must be registered as a control defect and added to the canonical plan before the next material mission.

This protocol is mandatory for M15 and all subsequent work.