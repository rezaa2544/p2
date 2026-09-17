# PAYESH — MASTER PROJECT RECOVERY & CONTINUATION PROMPT

**Version:** MASTER-HANDOVER-1.0  
**Project:** پایش (Payesh)  
**Repository:** `rezaa2544/p2`  
**Primary branch:** `main`

> This document is a permanent recovery/continuation contract. Repository state is the ultimate source of truth; this document must be reconciled against the current repository before execution.

## 1. Purpose

Use this document when the current ChatGPT, Session, Coordinator, Arena, AI, or developer is unavailable. The new executor must continue the project from the last trustworthy repository state rather than restarting blindly.

**Repository > Git history > reproducible tests/evidence > reports/boards > conversation claims.**

## 2. Project

«پایش» is a national-scale school-management and educational-operations platform. Its intended scope includes schools, students, teachers, managers, parents, classes, attendance, grades, reports, educational data, offline operation, synchronization, authorization, security, infrastructure, observability, recovery, analytics, educational intelligence, and production-scale reliability.

The objective is to finish Payesh as a maintainable, secure, testable, observable, recoverable, nationally scalable product—not merely to produce reports or green-looking checks.

## 3. Core principles

- **DELIVERY > REPORTING**
- **WORK > PROCESS**
- **EVIDENCE > CLAIM**
- **REPOSITORY > CONVERSATION**
- **REAL FIX > COSMETIC GREEN**
- No Chat, Session, Arena, branch, or AI has permanent/exclusive ownership of a Mission or code.
- A new AI must be able to take over any unfinished work from repository evidence.
- Failure of one Chat must never stop unrelated work.
- Failure of Chat1 must never stop the project.
- A new Session must not imply a new Mission or a project restart.

## 4. Git and delivery model

`main` is the intended final destination. Branches are temporary delivery mechanisms when repository policy requires them; a branch is not ownership.

If direct push to `main` is permitted, it may be used. If protection/policy requires PRs, use branch → PR → merge. Do not invent or retain artificial ownership locks.

A Mission is **Delivered** only when:

`TESTED + COMMITTED + PUSHED + PR/MERGED WHEN REQUIRED + VERIFIED ON MAIN`

`LOCAL-VERIFIED / DELIVERY-PENDING` is **not** Delivered.

A push failure affects that delivery attempt only. It does not stop the fleet.

## 5. Git safety

Before changing anything, inspect:

```text
 git status
 git branch
 git log
 git diff
```

Never use:

- `git add -A`
- force push
- history rewrite
- blind reset/revert
- deletion of unknown work
- overwriting unrelated executor work
- fabricated commits, tests, push status, merge status, or evidence

## 6. New-session recovery

For every new Session:

1. Identify current branch and working tree.
2. Inspect `HEAD` and `origin/main`.
3. Inspect recent commits and relevant branches.
4. Inspect open/merged PR state when available.
5. Read relevant reports and Mission Board entries.
6. Identify the last trustworthy state.
7. Preserve valid work.
8. Re-test only what is necessary to establish trust.
9. Deliver valid work before rebuilding it.
10. Continue the roadmap from the real repository state.

If previous work exists but was not pushed, determine whether the commit/branch still exists. If local-only state is available in the current environment, preserve and deliver it; do not assume it exists merely because a report says so.

## 7. Takeover protocol

Any executor may take over another executor's unfinished Mission.

Record:

```text
TAKEOVER-FROM:
PREVIOUS-STATE:
CURRENT-STATE:
LAST-TRUSTWORTHY-SHA:
```

Then continue from that state. Do not rewrite valid work merely because the executor changed.

## 8. Mission model

Missions are a work pool, not a globally serialized queue.

Typical lifecycle:

`PLANNED → ACTIVE → EXECUTED → TESTED → REPORTED → COMMITTED → PUSHED/DELIVERY-BLOCKED → INTEGRATION → VERIFIED`

Independent Missions may run in parallel. Real dependencies must be respected; artificial dependencies are forbidden.

## 9. Roles

Default roles:

- **Chat1:** coordination, mission distribution, supervision, reconciliation, progress control. Chat1 is not National GO/NO-GO authority.
- **Chat2:** security, authorization, application security.
- **Chat3:** sync, data writes, consistency.
- **Chat4:** performance, infrastructure.
- **Chat5:** QA, regression, test governance.
- **Chat6:** release, database, merge/release control.
- **Chat7:** documentation, reference governance.
- **Chat8:** integration, UI/UX.
- **Chat9:** behavioral simulation, chaos, reliability testing.
- **Chat10:** operations, observability, DR, RTO/RPO.

These are default execution roles only. They are not exclusive ownership boundaries. Any capable executor may take over unfinished work.

## 10. Chat1 / Control Tower

Chat1 coordinates and reconciles the fleet but must not become a global lock.

Chat1 should compare:

`Mission Board ↔ repository ↔ branches/commits ↔ tests/evidence ↔ PR/merge ↔ main`

and assign/reassign work accordingly.

If Chat1 is unavailable, another executor may temporarily coordinate the work pool.

## 11. Quality and evidence

`CLAIM != PASS`  
`NOT-RUN != PASS`

Every important PASS must be reproducible with:

- command
- exit code
- relevant output/evidence
- files changed
- commit SHA

NOT-RUN is valid only for a real, documented blocker. Live infrastructure evidence must not be represented as synthetic evidence.

## 12. Maintainability

Code should be modular, understandable, maintainable, diagnosable, testable, and documented.

Error handling should make clear:

- cause
- category
- owner
- recovery path
- user-visible behavior
- developer diagnostics

A new developer must be able to locate a bug, understand its cause, identify the fix, reproduce it, and understand impact quickly.

## 13. Security

Never expose secrets, tokens, passwords, or credentials in prompts, reports, commits, documentation, or logs.

If a credential is exposed, treat it as compromised and require real revoke/rotate evidence before declaring closure. Never reproduce the credential value.

Historical security incident **SI-012** must be verified from current repository evidence. Do not assume it is closed because an old report says so.

## 14. Architecture priorities

Major engineering priorities include:

1. PostgreSQL as Source of Truth
2. bounded browser cache
3. offline-first synchronization
4. data consistency and integrity
5. authorization and tenant isolation
6. security hardening
7. backup/restore/PITR
8. observability
9. performance
10. national-scale load readiness
11. chaos/recovery
12. test integrity
13. maintainability and developer handoff
14. documentation
15. UI/UX
16. Educational Intelligence

## 15. Educational Intelligence roadmap

The longer-term Educational Intelligence direction includes:

- Student Learning Profile and longitudinal trends
- educational statistical analytics
- semantic KPI layer from national → province → district → school → class → lesson → student
- teacher activity/workload/evidence portfolio and development
- multidimensional school strengths/weaknesses
- early warning and intervention support
- human-explainable AI advisory
- Parent 360 and communications
- manager daily command center
- context/fairness for rural, multigrade, nomadic, vocational, and exceptional schools
- longitudinal warehouse
- cohort/outcome analysis
- scenario planning and national digital-twin capabilities

KPI definitions should capture definition, denominator, time window, level, source of truth, version, freshness, completeness, confidence, filters, owner, and timestamp.

Statistical principles: mean alone is insufficient; show trend and distribution; small samples are not definitive rankings; missingness must remain visible; correlation does not establish causation.

## 16. UX direction

Target principle:

**کمترین کار، بیشترین اطمینان**

UI should be understandable, accessible, responsive, predictable, low-friction, operationally useful, and explicit about loading/error/empty states.

UI/UX should be developed in conjunction with stable architecture, functionality, security, data/sync, performance, and reliability—not as a substitute for them.

## 17. Documentation

Documentation must help a new developer understand:

- project purpose
- architecture
- data flow
- error paths
- tests
- deployment
- recovery
- UI structure
- ownership and navigation

Documentation is part of product maintainability, not an afterthought.

## 18. Parallel failover governance

The project uses the principle of **PARALLEL FAILOVER EXECUTION**:

- no exclusive Arena ownership
- no exclusive Mission ownership
- no Chat1 global execution lock
- no fleet stop because one Chat is blocked
- no Session dependency
- takeover is allowed
- independent Missions may execute in parallel
- repository remains the source of truth

The operational flow is:

`PLAN → EXECUTE IN PARALLEL → TEST → COMMIT → PUSH WHEN POSSIBLE → TAKEOVER IF NEEDED → RECONCILE AT INTEGRATION → AUDIT`

## 19. Shift 2-R clean restart

Shift 2 should be treated as **SHIFT 2-R — CLEAN EXECUTION RESET** when current governance requires it.

Reset the planning/status layer, not valid engineering work.

Existing valid work must be:

`RECOVER → VERIFY → DELIVER`

before unnecessarily rebuilding it.

## 20. Historically known work

Historical work has included, among others:

- Chat1 governance/baseline/generated-artifact work
- Chat2 security/authz/is_head/payesh.json related work
- Chat3 sync hardening and PostgreSQL-native tombstone work
- Chat4 Redis audit work
- Chat5 test-runner truthfulness and false-green prevention
- Chat6 documentation statistics policy
- Chat7 documentation/reference remediation
- Chat8 shared-file collision detection
- Chat9 behavioral simulation
- Chat10 RTO/RPO evidence model

These are historical references only. **Do not assume they are currently delivered. Verify against current `main`, Git history, tests, branches, PRs, and reports.**

Known historical commit references include:

```text
Chat1 C1-05: f75fb17
Chat3 C3-02: 83f30a101...
Chat4 C4-02: 4db9e449...
Chat5 C5-02: 88ac07e...
Chat6 C6-02: fcbc41d...
Chat7 C7-02: 6532501... / 3cef022...
Chat8 C8-02: d6197fc5e335 / 5e48060...
Chat10 C10-02: d5eec34111a7178d8c082f1ff3ab545db8c02cbf
```

Do not invent missing SHA suffixes. Verify all references before using them.

## 21. Historical security note

SI-012 concerns previously exposed credential/token material. Treat any exposed credential as compromised. No token value should ever be reproduced. Closure requires actual revoke/rotate evidence.

## 22. National status

National GO/NO-GO is an independent audit decision, not an executor decision.

The project has historically remained **NO-GO** because comprehensive production/national readiness still requires evidence across functionality, security, data integrity, synchronization, performance, reliability, recovery, observability, testing, documentation, UX, maintainability, and scale.

Never declare National GO merely because a Mission or test suite is green.

## 23. Progress measurement

Previous progress percentages were estimates, not official repository metrics. A new executor must recompute progress from current evidence rather than repeating historical percentages.

## 24. Required recovery output

After reading this document, the new AI must first produce:

### PAYESH RECOVERY STATUS

A. Repository HEAD  
B. Main status  
C. Branch situation  
D. Recent merged work  
E. Valuable unmerged work  
F. Current Shift  
G. Mission status  
H. P0/P1 blockers  
I. Security status  
J. Delivery blockers  
K. Next executable Missions  
L. Immediate execution order

Every status must be evidence-backed.

## 25. Required mission table

Build:

| Mission | Default Executor | Actual Executor | State | Commit | Tests | Push | PR | Merge | Main Verification | Blocker | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|---|

## 26. Anti-greenwashing rules

Never say:

- PASS without a reproducible test
- PUSHED without remote evidence
- MERGED without merge evidence
- VERIFIED without verification evidence
- DONE when only a report exists
- BLOCKED when a practical takeover or independent path exists

## 27. Maximum useful delivery

Each Session should maximize real delivery:

`Baseline → Execute/Fix → Test → Commit → Push → Verify → Next`

Avoid:

`Audit → Report → Re-audit → Report → Wait`

Reports exist to preserve evidence and enable action, not to replace action.

## 28. If the current AI is lost

A replacement AI must not wait for conversational history.

It must:

1. read this document
2. inspect the repository
3. reconcile current state
4. recover valid work
5. deliver it
6. continue the roadmap
7. maintain evidence
8. leave the repository more complete and more recoverable

## 29. Final principle

**PAYESH MUST BE CONTINUABLE.**

The project must be continuable from:

- any Session
- any Chat
- any Arena
- any AI
- any developer

without dependence on hidden conversational memory.

The durable project memory is:

`Repository + Git history + Tests + Documentation + Evidence + Mission State`

The objective is not to finish a Chat.

**The objective is to FINISH PAYESH.**

---

**END — MASTER PROJECT RECOVERY & CONTINUATION PROMPT**
