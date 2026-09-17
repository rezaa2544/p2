# 2026-09-17 — Parallel / Failover Governance Change

## Finding

The previous execution model introduced a fleet bottleneck by requiring serial Mission handshakes and making Chat1 reconciliation a prerequisite for the next Mission. The shift report also recorded that all nine Arena sandboxes failed delivery attempts and that the remote/session environment returned `This coding session has ended` and TLS failures. The repository evidence therefore showed a real delivery bottleneck plus a governance bottleneck.

## Root cause classification

Two different problems must not be conflated:

1. **Platform/session delivery failure:** the Arena sessions could not push from their ended/unavailable sessions. Removing repository governance locks cannot make an ended session push.
2. **Repository execution-policy bottleneck:** the prior protocol made Mission sequencing unnecessarily dependent on Chat1 and on completion/delivery of preceding Missions. This could waste the remaining work window when one Arena failed.

## Decision

The execution model is changed to **parallel + failover**.

- Arena ownership is default ownership, not an exclusive lock.
- The 20-Mission board is a work pool, not a global serial queue.
- Multiple independent Missions may be ACTIVE simultaneously.
- Chat1 coordinates when available but is not a single point of failure.
- Another Arena may take over an unavailable Arena's Mission after evidence-first state recovery.
- `PUSH FAILED` blocks only that delivery attempt; it does not block the fleet.
- A new session resumes the existing Mission/work; it does not automatically create a new Mission.
- Integration and shared-file conflicts are handled at integration time rather than by freezing unrelated work.

## Safety invariants intentionally retained

The change does **not** remove:

- scope control;
- evidence requirements;
- deliberate Git staging;
- no force-push/history rewrite;
- no fabricated CI/staging/production evidence;
- no secrets/tokens in repository or prompts;
- P0/P1 governance;
- National GO/NO-GO authority of ChatGPT.

These are engineering safety controls, not execution locks.

## Canonical documents changed

- `docs/PARALLEL_FAILOVER_EXECUTION_PROTOCOL.md`
- `docs/EXECUTION_CONTROL_PROTOCOL.md`
- `docs/DAILY_20_MISSION_PROTOCOL.md`
- `docs/ARENA_EXECUTION_MODEL.md`
- `docs/ARENA_AGENT_PROMPT.md`

The older dated Mission files remain historical records; the current canonical execution overlay supersedes serial/wait language in them.

## Expected operational result

If one chat fails, the fleet continues.

If Chat1 fails, Arenas continue safe work and can take over.

If GitHub push fails in one session, other work continues and a later live session can perform delivery.

No work is promoted to `PUSHED`, `MERGED`, or `VERIFIED ON MAIN` without actual evidence.
