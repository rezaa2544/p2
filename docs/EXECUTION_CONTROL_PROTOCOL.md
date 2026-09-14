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

If sources conflict, **do not guess**. Chat 1 records the conflict and escalates it to ChatGPT.

## 2. Daily operating loop

### Start of day
ChatGPT audits the previous day's evidence and publishes exactly one new Daily Mission file in:

`docs/daily-reports/missions/`

The mission is the only authorized work scope for that day.

### During the day
Chat 1 supervises online:

- Arena report = CLAIM, not proof.
- Verify branch, commit, diff, tests, CI, PR and merge state against GitHub/Repo.
- Mark each result explicitly: `CLAIMED`, `IMPLEMENTED`, `TESTED LOCALLY`, `PUSHED`, `PR OPEN`, `MERGED`, `VERIFIED ON MAIN`, `VERIFIED IN STAGING`, `PRODUCTION PROVEN`.
- Never promote a lower evidence state into a higher one.
- Do not start work outside the active Mission.

### End of day
The Arena submits one concise mission report. Chat 1 reconciles it with repository evidence and writes the final report to:

`docs/daily-reports/`

No completion is accepted from chat text alone.

### Next day
ChatGPT independently audits the final report and repository state, then issues the next mission file. Chat 1 must not start the next implementation mission before that file exists and is authorized.

## 3. Mission Packet minimum fields

Every mission file MUST contain:

- Mission ID
- Owner / Arena
- Base SHA
- `P0_REF` when P0-related: `file#heading Lx-Ly @sha`
- Scope
- Forbidden scope
- Dependencies
- Acceptance Criteria
- Required tests
- Required evidence
- Git / PR rules
- Definition of Done

## 4. Evidence and Git rules

- Prefer a clean, current `main` SHA.
- Shallow-clone limitations must be reported as `NOT-RUN`; never infer ahead/behind.
- Network/API failures are `NOT-RUN`, not success.
- Local green tests do not prove CI, staging, or production readiness.
- Uncommitted work is not project-complete evidence.
- Historical documents remain historical unless explicitly adjudicated.
- No P0/P1 item may be created, renamed, closed, or re-numbered without source + owner + evidence.

## 5. National GO gate

National status remains **NO-GO** until all applicable P0 gates are closed with sufficient evidence and the independent auditor approves the release decision.

Chat 1 may coordinate and recommend. Chat 1 may **not** self-declare National GO.

## 6. Anti-drift rule

At the start of every mission Chat 1 MUST re-read:

`docs/ROADMAP.md`
`docs/NATIONAL_ROADMAP_PROGRESS.md`
`docs/P0_BLOCKER_TRACKER.md`
`docs/EXECUTION_CONTROL_PROTOCOL.md`

Then verify the active mission against current Repo evidence.

## 7. Mission sequencing

Default sequence:

`AUDIT → MISSION → ARENA EXECUTION → RECONCILIATION → CHATGPT AUDIT → NEXT MISSION`

If a mission is rejected, blocked, or materially incomplete, the next mission is a remediation/reverification mission—not an unrelated feature mission.

## 8. Current control state

As of 2026-09-14:

- National GO/NO-GO: **NO-GO**.
- P0-1 PostgreSQL source-of-truth: **OPEN / UNDER ADJUDICATION**.
- RTO/RPO figures S1-S6: **UNSOURCED — DO NOT REUSE** until source evidence is present.
- `RELIABILITY_DR_PLAN.md`: **OWNER UNASSIGNED** until explicitly assigned.
- Live national staging/capacity evidence is not assumed from local tests.
- GitHub/network limitations must remain explicit when encountered.

This document is an operational control layer. It does not silently rewrite historical roadmap claims.
