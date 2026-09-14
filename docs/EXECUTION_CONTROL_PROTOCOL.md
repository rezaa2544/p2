# Payesh — National Execution Control Protocol

**Status:** ACTIVE  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — Acting Coordinator / Online Supervisor  
**Execution:** Arena chats  
**Effective:** 2026-09-14

## 0. EXECUTION MODE — DETERMINISTIC DAILY 20-MISSION HANDSHAKE

Effective immediately, `docs/DAILY_20_MISSION_PROTOCOL.md` is the **primary daytime execution model**. The previous autonomous M1→M4→Continuation loop is retained only as background safety guidance and must not be used to bypass the one-Mission-at-a-time coordinator handshake.

Each Arena has a daily board of **20 pre-scoped Missions**. Chat 1 selects exactly one Mission, writes the execution prompt, and waits for that Mission's report/delivery evidence before assigning the next one.

The operational loop is:

`20-MISSION BOARD → Chat1 ASSIGNS ONE → Arena EXECUTES → REPORT + COMMIT + PUSH → Chat1 RECONCILES → NEXT MISSION`

This is intentional. It removes the recurring ambiguity in which an Arena interprets `continuation`, `re-validation`, or a missing Mission as permission to stop or to invent work.

**Mandatory for every Arena:** after every Mission, write the report and push the Mission-scoped commit to GitHub. A chat response alone is never completion evidence.

**Mandatory for Chat1:** do not issue Mission N+1 until Mission N has a report and its Git evidence has been reconciled as far as the environment permits. If push is impossible, record `NOT-PUSHED` and explicitly decide the recovery/remediation step; do not silently advance as if delivery succeeded.

**Important:** ChatGPT remains the only National GO/NO-GO authority. Chat1 remains the distributor/supervisor, not the national release authority.

## 1. Canonical project sources

1. `docs/ROADMAP.md` — master engineering roadmap.
2. `docs/NATIONAL_ROADMAP_PROGRESS.md` — Wave owner/status/dependency/evidence matrix.
3. `docs/P0_BLOCKER_TRACKER.md` — canonical P0 no-go tracker.
4. `docs/ARCHITECTURE_REVIEW.md` — current technical P1 inventory; P1 numbering must not be re-used or invented.
5. `docs/DAILY_20_MISSION_PROTOCOL.md` — primary daily execution and delivery handshake.
6. `docs/ARENA_EXECUTION_MODEL.md` — supporting execution/control model.
7. `docs/ARENA_CONTINUATION_POLICY.md` — safety/continuation guidance; not a bypass of the daily handshake.
8. `docs/ARENA_RUNTIME_CONTRACT.md` — runtime safety state machine.
9. `docs/ARENA_CONTROL_PLANE_RECOVERY.md` — Mission/bootstrap recovery.
10. `docs/ARENA_CONTINUITY_AUTHORIZATION.md` — bounded fallback safety authorization; not a replacement for the daily board.
11. `docs/ARENA_REGISTRY.md` — operational Arena roles.

If sources conflict, the deterministic daily 20-Mission handshake governs daytime sequencing; Chat1 records material conflicts and escalates them to ChatGPT.

## 2. Daily operating loop

### Start of day
ChatGPT audits the previous cycle and publishes/authorizes one daily 20-Mission board per Arena under:

`docs/daily-mission-boards/YYYY-MM-DD/<CHAT_NAME>.md`

The board contains exactly 20 pre-scoped Missions. Each Mission has an ID, scope, forbidden scope, acceptance criteria, evidence requirements, and report path.

### During the day
Chat 1 supervises online:

- Arena report = **CLAIM**, not proof.
- Verify branch, commit, diff, tests, CI, PR and merge state against GitHub/Repo.
- Select the next Mission only after reconciling the previous Mission.
- Write the exact Arena prompt for the selected Mission.
- Prevent overlap, unsafe `git add -A`, and scope invention.
- Mark each result explicitly: `CLAIMED`, `IMPLEMENTED`, `TESTED LOCALLY`, `COMMITTED`, `PUSHED`, `PR OPEN`, `MERGED`, `VERIFIED ON MAIN`, `VERIFIED IN STAGING`, `PRODUCTION PROVEN`.
- Never promote a lower evidence state into a higher one.

### Per-Mission delivery
For every Mission, the Arena must:

`EXECUTE → TEST → REPORT → COMMIT → PUSH → HAND BACK TO CHAT1`

The report must include exact files, tests/results, commit SHA, branch, push result, PR/merge result where applicable, NOT-RUN reasons, findings, and next suggested Mission.

### End of day
Each Arena's 20-Mission board and all Mission reports are audited by ChatGPT. Uncompleted Missions are explicitly carried forward or re-planned; they are not silently considered complete.

## 3. Mission Packet minimum fields

Every board Mission MUST contain:

- Mission ID
- Owner / Arena
- Board date
- Base SHA or `BASE-TO-BE-VERIFIED`
- Source references
- `P0_REF` when P0-related
- Scope
- Forbidden scope
- Dependencies
- Acceptance Criteria
- Required tests
- Required evidence
- Git / PR rules
- Definition of Done
- Report path

A board Mission is the authorization. Chat1 may narrow execution details but may not expand its scope.

## 4. Evidence and Git rules

- Prefer a clean, current `main` SHA.
- Shallow-clone limitations must be reported as `NOT-RUN`; never infer ahead/behind.
- Network/API failures are `NOT-RUN`, not success.
- Local green tests do not prove CI, staging, or production readiness.
- Uncommitted work is not project-complete evidence.
- Historical documents remain historical unless explicitly adjudicated.
- No P0/P1 item may be created, renamed, closed, or re-numbered without source + owner + evidence.
- No force-push.
- **Every Mission-scoped change must be committed and pushed.**
- `git add -A` is forbidden when unrelated workspace changes exist; add Mission files deliberately after reviewing `git diff --stat` and `git diff --name-status`.
- A failed push is `NOT-PUSHED`, never `PUSHED` and never silently ignored.
- PR/merge may proceed only under normal governance rules and must leave traceable Git evidence.

## 5. National GO gate

National status remains **NO-GO** until all applicable P0 gates are closed with sufficient evidence and the independent auditor approves the release decision.

Chat 1 may coordinate and recommend. Chat 1 may **not** self-declare National GO.

## 6. Recovery rule

A missing local Mission file, stale checkout, or network failure does not authorize Mission invention. Chat1 first checks the current daily board and current `main`.

If an Arena cannot access the board, it may perform only control-plane recovery until Chat1 restores the exact board Mission. The bounded continuity authorization remains a safety fallback, but it does **not** create a new daytime work stream independent of Chat1's assignment.

`MISSION FILE NOT FOUND LOCALLY` is not proof that the daily board is absent. `FETCH FAILED` is not proof of project state.

## 7. Mission sequencing

The canonical daytime sequence is:

`AUDIT → 20-MISSION BOARD → Chat1 ASSIGN → ARENA EXECUTE → REPORT+COMMIT+PUSH → Chat1 RECONCILE → NEXT ASSIGNMENT → ... → CHATGPT END-OF-DAY AUDIT`

There is **no autonomous M4→Continuation path for daily task sequencing**. The old continuation rules may prevent an unsafe stop inside an already-running Mission, but they may not be used to self-assign the next Mission.

A Mission failure becomes a remediation/reverification decision for Chat1. An Arena must not silently skip a failed Mission or invent an unrelated task.

## 8. User operating model

The user sends the common Arena prompt once to each Chat at the beginning of the work session. Chat1 handles the per-Mission prompts after that.

The user does not need to manually invent task content. ChatGPT prepares the 20-Mission boards; Chat1 reads them, assigns one task at a time, verifies the report/Git evidence, and writes the next prompt.

Every completed task must leave a report and Git push. Project continuity lives in Git rather than chat memory.

## 9. Current control state

As of 2026-09-14:

- National GO/NO-GO: **NO-GO**.
- P0-1 PostgreSQL source-of-truth: **OPEN / UNDER ADJUDICATION**.
- RTO/RPO figures S1-S6: **UNSOURCED — DO NOT REUSE** until source evidence is present.
- `RELIABILITY_DR_PLAN.md`: **OWNER UNASSIGNED** until explicitly assigned.
- Live national staging/capacity evidence is not assumed from local tests.
- GitHub/network limitations must remain explicit when encountered.

This document is an operational control layer. It does not silently rewrite historical roadmap claims.
