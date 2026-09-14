# Payesh — National Execution Control Protocol

**Status:** ACTIVE  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — Acting Coordinator / Online Supervisor  
**Execution:** Arena chats  
**Effective:** 2026-09-14

## 1. Canonical project sources

1. `docs/ROADMAP.md` — master engineering roadmap.
2. `docs/NATIONAL_ROADMAP_PROGRESS.md` — Wave owner/status/dependency/evidence matrix.
3. `docs/P0_BLOCKER_TRACKER.md` — canonical P0 no-go tracker.
4. `docs/ARCHITECTURE_REVIEW.md` — current technical P1 inventory; P1 numbering must not be re-used or invented.
5. `docs/ARENA_EXECUTION_MODEL.md` — Git-driven execution/control model.
6. `docs/ARENA_CONTINUATION_POLICY.md` — mandatory all-day continuation behavior.
7. `docs/ARENA_RUNTIME_CONTRACT.md` — non-terminal runtime state machine and hard stop gate.
8. `docs/ARENA_CONTROL_PLANE_RECOVERY.md` — non-blocking Mission/bootstrap recovery.
9. `docs/ARENA_REGISTRY.md` — operational Arena roles.

If sources conflict, **do not guess**. Chat 1 records the conflict and escalates it to ChatGPT.

## 2. Daily operating loop

### Start of day
ChatGPT audits the previous cycle and publishes/authorizes the active Mission files under:

`docs/daily-missions/<CHAT_NAME>/ACTIVE.md`

Each Arena has at most one active Mission. An active Mission is the only authorized product-work scope for that Arena.

### During the day
Chat 1 supervises online:

- Arena report = **CLAIM**, not proof.
- Verify branch, commit, diff, tests, CI, PR and merge state against GitHub/Repo.
- Mark each result explicitly: `CLAIMED`, `IMPLEMENTED`, `TESTED LOCALLY`, `PUSHED`, `PR OPEN`, `MERGED`, `VERIFIED ON MAIN`, `VERIFIED IN STAGING`, `PRODUCTION PROVEN`.
- Never promote a lower evidence state into a higher one.
- Do not start product work outside the active Mission.

### End of cycle
Each Arena records stage/pass checkpoints in:

`docs/daily-reports/<CHAT_NAME>/YYYY-MM-DD.md`

A report is not a stop signal. Chat 1 reconciles claims with repository evidence; ChatGPT independently audits the reconciled state.

### Continuation
An M1→M4 Queue is a minimum work sequence, never a stop signal. After M4, the Arena MUST enter the Continuation Loop and keep executing the highest-value unresolved safe work within the same Mission until the work window ends or a second independent pass proves no scoped work remains.

If M1–M4 were already completed in an earlier round of the same active Mission, the Arena MUST resume at Continuation Pass. A `re-validation`, `round N`, `unchanged`, or similar prompt does not reset or close the Mission.

**Hard gate:** an Arena must not produce a report-only re-validation response as its first action. It must execute at least one concrete scoped action. If the Mission is missing locally, the first action is **CONTROL-PLANE RECOVERY**, not BLOCKED.

A single network failure, stale checkout, missing local report, Mission-fetch failure, or NOT-RUN check does not stop the Arena. Mission-fetch failure triggers the recovery protocol in `docs/ARENA_CONTROL_PLANE_RECOVERY.md`; it does not prove that no authorized work exists.

No local/session-specific policy may override the canonical continuation or recovery rules.

## 3. Mission Packet minimum fields

Every Mission file MUST contain:

- Mission ID
- Owner / Arena
- Base SHA
- Source references
- `P0_REF` when P0-related: `file#heading Lx-Ly @sha`
- Scope
- Forbidden scope
- Dependencies
- Acceptance Criteria
- Required tests
- Required evidence
- Git / PR rules
- Definition of Done
- Report path

## 4. Evidence and Git rules

- Prefer a clean, current `main` SHA.
- Shallow-clone limitations must be reported as `NOT-RUN`; never infer ahead/behind.
- Network/API failures are `NOT-RUN`, not success.
- Local green tests do not prove CI, staging, or production readiness.
- Uncommitted work is not project-complete evidence.
- Historical documents remain historical unless explicitly adjudicated.
- No P0/P1 item may be created, renamed, closed, or re-numbered without source + owner + evidence.
- No force-push.
- For Mission-scoped changes, the owning Arena is responsible for the full delivery chain: `commit → push → PR → checks/review → merge → verify main → report`.
- Self-merge is authorized when the change is fully within Mission scope, required tests/checks are satisfied or explicitly documented `NOT-RUN`, no unresolved conflict remains, and merge does not itself close/reclassify a P0/P1 or decide National GO.
- Merge must stop for P0 closure, P0/P1 status changes, cross-Arena ownership conflicts, or material governance adjudication.
- If remote delivery is unavailable, only the affected operation is NOT-RUN; independent Mission work continues.

## 5. National GO gate

National status remains **NO-GO** until all applicable P0 gates are closed with sufficient evidence and the independent auditor approves the release decision.

Chat 1 may coordinate and recommend. Chat 1 may **not** self-declare National GO.

## 6. Anti-drift and recovery rule

At the start of every Mission Chat 1 MUST re-read the canonical sources and verify every active Mission against current Repo evidence.

Arena chats must read their own `ACTIVE.md` before execution. If local state is stale/missing, recover the exact Mission from current `main` where possible; local drift is not itself a blocker. If remote recovery is unavailable, enter **CONTROL-PLANE RECOVERY** and perform only recovery/evidence/environment actions until the exact Mission is recovered. Do not invent a Mission and do not manufacture product work.

`MISSION FILE NOT FOUND LOCALLY` is not evidence that the Mission is absent from current `main`. `FETCH FAILED` is not evidence that no authorized work exists.

Only a genuinely missing/expired/contradictory Mission on current `main`, after all permitted recovery actions are exhausted and an external decision is actually required, can produce a Mission-level `BLOCKED` state.

## 7. Mission sequencing

Default sequence:

`AUDIT → MISSION → ARENA EXECUTION → REPORT → RECONCILIATION → CHATGPT AUDIT → NEXT MISSION`

Within an active Queue:

`M1 → M2 → M3 → M4 → CONTINUATION LOOP → CONTINUATION LOOP → ...`

Before claiming that no scoped work remains, the Arena MUST perform a second independent pass over acceptance criteria, relevant code/tests/docs, PR/CI state, NOT-RUN/environment limitations and unresolved findings, and record the result. `complete`, `finished`, `awaiting coordinator`, `awaiting audit`, `awaiting prompt`, `nothing else`, `session policy`, `awaiting merge path`, and `re-validation stands` are not valid stop reasons by themselves.

If a Mission is rejected, blocked, or materially incomplete, the next Mission is remediation/reverification—not unrelated feature work.

## 8. User operating model

The user does not need to distribute bespoke daily task instructions. The common prompt in `docs/ARENA_AGENT_PROMPT.md` is sent to each Arena with only `CHAT_NAME` changed. The common prompt, runtime contract, recovery protocol and continuation policy are normative and override any weaker stop interpretation in a Mission file.

The Arena reads its Mission from Git, executes it, performs the delivery chain for authorized changes, and writes checkpoints/evidence back to Git. Project continuity therefore lives in version-controlled evidence rather than chat memory.

A repeated user prompt does not authorize a fresh stop/revalidation-only cycle: if the Mission remains ACTIVE, execution resumes from its current stage/pass.

## 9. Current control state

As of 2026-09-14:

- National GO/NO-GO: **NO-GO**.
- P0-1 PostgreSQL source-of-truth: **OPEN / UNDER ADJUDICATION**.
- RTO/RPO figures S1-S6: **UNSOURCED — DO NOT REUSE** until source evidence is present.
- `RELIABILITY_DR_PLAN.md`: **OWNER UNASSIGNED** until explicitly assigned.
- Live national staging/capacity evidence is not assumed from local tests.
- GitHub/network limitations must remain explicit when encountered.

This document is an operational control layer. It does not silently rewrite historical roadmap claims.
