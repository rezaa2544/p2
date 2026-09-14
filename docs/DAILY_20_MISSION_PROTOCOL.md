# Daily 20-Mission Execution Protocol

**Status:** ACTIVE  
**Authority:** ChatGPT — Independent Senior Auditor / National GO-NO-GO  
**Coordinator:** Chat 1 — task distributor and online supervisor  
**Execution:** Chat2–Chat10  
**Effective:** 2026-09-14

## Why this replaces the failing runtime loop

The previous all-day continuation model is retained as a safety concept, but it is **not** the primary execution mechanism. Repeated Arena stops after Mission/re-validation/recovery failures showed that an LLM can still enter a report-only loop despite repository rules.

The deterministic operating unit is now **one Mission = one handshake**.

Each Arena receives a daily board containing 20 pre-scoped Missions. Only one Mission is ACTIVE at a time. Chat 1 chooses the next Mission from the board using repository evidence and writes the execution prompt. The Arena executes it, records evidence, commits, and pushes. Chat 1 verifies the delivery and then selects/writes the next prompt.

## Daily flow

`ChatGPT audit → 20-Mission boards → Chat1 selects M1 → Arena executes → REPORT + COMMIT + PUSH → Chat1 verifies → Chat1 selects M2 → ... → M20 → ChatGPT end-of-day audit`

There is **no autonomous M1→M20 continuation inside an Arena**. This is intentional: the Coordinator is the sequencing gate.

## Mission state machine

`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → VERIFIED → NEXT`

If a task fails, its state becomes `REMEDIATION` and Chat 1 issues the next corrective prompt. It is not silently skipped.

## Mandatory delivery rule

For **every completed Mission**, the Arena MUST:

1. perform only the assigned scope;
2. run the required tests/checks;
3. write the Mission report/checkpoint;
4. commit **all Mission-scoped changes**;
5. push the commit to its assigned branch;
6. report the exact commit SHA and push result to Chat 1.

`PUSH FAILED` is not success. If network prevents push, the Arena must report `NOT-PUSHED` with the exact reason; Chat 1 decides the next operational step. The Arena does not silently accumulate multiple Missions.

## Reporting rule

A Mission is not considered completed from a chat response alone. Completion requires repository evidence: commit SHA plus pushed branch, and where applicable PR/merge/check evidence.

Every Mission report must contain:

- Mission ID
- exact scope performed
- files changed
- tests/checks and exact results
- commit SHA
- branch
- push result
- PR/merge result when applicable
- NOT-RUN items with exact reason
- findings/blockers
- suggested next Mission (Chat 1 makes the final assignment)

## Chat 1 responsibility

Chat 1 is the **online supervisor and distributor**. It must:

- read the daily board;
- inspect current Repo/main/branches and the latest Arena report;
- reconcile claim vs evidence;
- choose the next highest-value uncompleted Mission;
- write the exact prompt for that Mission;
- not issue Mission N+1 until Mission N's report/delivery state has been reconciled;
- prevent scope overlap and unsafe `git add -A` behavior;
- escalate P0/P1 changes, cross-Arena ownership conflicts, and governance decisions to ChatGPT;
- never declare National GO.

Chat 1 does **not** need to invent Missions during the day. The 20 daily Missions are the authorized work pool. If a board item is obsolete or contradictory, Chat 1 marks it `REQUIRES AUDIT` and escalates rather than inventing a replacement.

## ChatGPT responsibility

At the end of the work window ChatGPT independently audits:

- all 20 boards;
- every Mission report;
- commit/push/PR/merge evidence;
- failures and NOT-RUN items;
- cross-Arena overlap;
- P0/P1 impact;
- remaining work.

ChatGPT then authorizes the next daily 20-Mission boards.

## Scope safety

No Arena may self-authorize a new Mission. No Arena may change P0/P1 status, Roadmap status, ownership, or National GO/NO-GO. A board item is the authorization; the prompt written by Chat 1 may narrow execution details but may not expand the board item's scope.

## Git safety

No `git add -A` when the workspace contains other-Arena work. Add files deliberately and review `git diff --stat` and `git diff --name-status` before commit. Never force-push. A Mission must leave a traceable commit and push result.

## Anti-stop rule

The Arena may stop after a Mission **only because that Mission is actually reported and handed back to Chat 1**. It must not invent continuation work while waiting for the next assignment. This is deliberate and replaces the previous ambiguous all-day stop/continuation behavior.

## National gate

This protocol does not change the National gate. National status remains controlled by ChatGPT and remains NO-GO until independently proven otherwise.
