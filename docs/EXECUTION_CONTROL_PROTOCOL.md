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
6. `docs/ARENA_REGISTRY.md` — operational Arena roles.

If sources conflict, **do not guess**. Chat 1 records the conflict and escalates it to ChatGPT.

## 2. Daily operating loop

### Start of day
ChatGPT audits the previous cycle and publishes/authorizes the active Mission files under:

`docs/daily-missions/<CHAT_NAME>/ACTIVE.md`

Each Arena has at most one active Mission. An active Mission is the only authorized work scope for that Arena.

### During the day
Chat 1 supervises online:

- Arena report = **CLAIM**, not proof.
- Verify branch, commit, diff, tests, CI, PR and merge state against GitHub/Repo.
- Mark each result explicitly: `CLAIMED`, `IMPLEMENTED`, `TESTED LOCALLY`, `PUSHED`, `PR OPEN`, `MERGED`, `VERIFIED ON MAIN`, `VERIFIED IN STAGING`, `PRODUCTION PROVEN`.
- Never promote a lower evidence state into a higher one.
- Do not start work outside the active Mission.

### End of cycle
Each Arena submits one concise mission report to:

`docs/daily-reports/<CHAT_NAME>/YYYY-MM-DD.md`

Chat 1 reconciles the report with repository evidence. ChatGPT then independently audits the reconciled state.

### Next cycle
Only ChatGPT-authorized Missions become the next active scope. A rejected/blocked Mission produces remediation or reverification work before unrelated work resumes.

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

## 5. National GO gate

National status remains **NO-GO** until all applicable P0 gates are closed with sufficient evidence and the independent auditor approves the release decision.

Chat 1 may coordinate and recommend. Chat 1 may **not** self-declare National GO.

## 6. Anti-drift rule

At the start of every Mission Chat 1 MUST re-read:

`docs/ROADMAP.md`  
`docs/NATIONAL_ROADMAP_PROGRESS.md`  
`docs/P0_BLOCKER_TRACKER.md`  
`docs/EXECUTION_CONTROL_PROTOCOL.md`  
`docs/ARENA_EXECUTION_MODEL.md`

Then verify every active Mission against current Repo evidence.

Arena chats must read their own `ACTIVE.md` before execution. Missing/stale/contradictory Mission means `BLOCKED`.

## 7. Mission sequencing

Default sequence:

`AUDIT → MISSION → ARENA EXECUTION → REPORT → RECONCILIATION → CHATGPT AUDIT → NEXT MISSION`

If a Mission is rejected, blocked, or materially incomplete, the next Mission is a remediation/reverification Mission—not an unrelated feature Mission.

## 8. User operating model

The user does not need to distribute bespoke daily task instructions. The common prompt in `docs/ARENA_AGENT_PROMPT.md` is sent to each Arena with only `CHAT_NAME` changed.

The Arena reads its Mission from Git, executes it, and writes its report back to Git. Project continuity therefore lives in version-controlled evidence rather than chat memory.

## 9. Current control state

As of 2026-09-14:

- National GO/NO-GO: **NO-GO**.
- P0-1 PostgreSQL source-of-truth: **OPEN / UNDER ADJUDICATION**.
- RTO/RPO figures S1-S6: **UNSOURCED — DO NOT REUSE** until source evidence is present.
- `RELIABILITY_DR_PLAN.md`: **OWNER UNASSIGNED** until explicitly assigned.
- Live national staging/capacity evidence is not assumed from local tests.
- GitHub/network limitations must remain explicit when encountered.

This document is an operational control layer. It does not silently rewrite historical roadmap claims.
