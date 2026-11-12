# A-37 Evidence — unit tests of the leader election logic (all paths)

- **Verification id:** A-37
- **Scope token:** `A-37:LEADER-ELECTION-PATHS`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

The repo had **no leader election at all** (searched `server/**` + `src/**` for
isLeader/electLeader/leadership — zero hits). The M15 multi-instance target
makes singleton jobs (the retention reaper, the replicator, the future
scheduler lanes) unsafe without one. Task 16 demanded the logic WITH tests for
every path: the election start, the vote collection, the resignation, the
re-election after failure.

## Change

**`server/leader-election.js`** (NEW) — the lease-based election on the
existing redis driver:
- `startElection({ role, leaseSeconds })` — the atomic single-winner vote
  (SET NX + TTL; a burst still produces exactly one winner).
- `isLeader(role)` — the cheap per-tick fencing check.
- `renewLease(...)` — the renewal refused once the lease belongs to someone
  else.
- `resign(role)` — the aware resignation: only the holder's lease is deleted,
  the next election promotes immediately.
- Re-election after failure = the lease TTL expiry + the takeover with zero
  coordination.
- The B5 outage contract (configured-but-dead = fail-closed) + the dev
  in-memory fallback + the documented consumer fencing duty (re-check
  isLeader per tick — never trust a stale lease for a costly action).

**`tests/a37-leader-election.test.js`** (NEW) — **CHECKS 14 FAIL 0, exit 0 —
TWICE: the in-memory driver AND the live staging Redis (authenticated).**

E1 the start (the single winner) · E2a/b the vote collection (the competing
candidate refused + learns the leader) · E3a/b/c the resignation (frees +
promotes + cannot resign someone else's lease) · E4a/b/c the re-election
after failure (the blocked takeover during the lease → the takeover after the
TTL expiry → the fencing check agrees) · E5a/b isLeader only for the holder ·
E6a/b the renewal refused for a non-holder / OK for the holder · E7 the lease
TTL armed (self-healing — no orphan leader key).

**Mutation negative proof:** the resignation's holder-check mutated away →
**E3c FAILS** (an instance could delete another instance's lease) — caught,
reverted, 14/0 restored.

## Notes

- `A-37:LEADER-ELECTION-PATHS — RUNTIME-VERIFIED` (memory + live Redis; the mutation caught).
- The wiring into the singleton job lanes = the M15-02+ runtime items (the
  module = the primitive; the consumers re-check per tick by contract).
- The test initially failed twice on ITS OWN wrong driver call
  (`redis.set(key, val, 30)` — the driver contract = `set(key, val, 'EX',
  sec)`); the module was correct — the test was fixed, not the guard.
