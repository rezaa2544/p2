# A-34 Evidence — comprehensive API error handling: the process-level async policy

- **Verification id:** A-34
- **Scope token:** `A-34:PROCESS-ERROR-POLICY`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

The API error handling was already layered and verified:
per-request dispatcher boundary (413 `body_too_large` / 500 `server_error` +
audit), the S7-1 global request wrapper (`wrappedRequest` — one bad request may
fail, the service must not go down with it), structured error codes
(`AUTHORITY_QUERY_FAILED` 503 wrap, `sync_mirror_failed` + client-side retry
semantics), and the Wave-15 graceful shutdown (SIGTERM/SIGINT → drain →
dependencies closed → exit 0).

**Missing: the process-level async error policy** — background paths (workers,
timers, pub/sub) outside the request boundary could still hit Node's defaults
(unhandledRejection on Node ≥15 = process exit; uncaughtException = the unknown
sync state with no drain).

## Change (`server/index.js`)

- `unhandledRejection` → loud log + audit (`unhandled_rejection`) + **keep
  alive** (the S7-1 philosophy extended beyond the request boundary).
- `uncaughtException` → loud log + audit (`uncaught_exception`) + **graceful
  shutdown with drain** (the same SIGTERM sequence) and **exit 1**.
- `handleShutdown(signal, exitCode)` — the exit code parameter: 0 = clean stop
  (SIGTERM/SIGINT unchanged), 1 = faulty shutdown (crash visibility for the
  supervisor without cutting in-flight requests).

## Behavioral guard (`tests/a34-process-error-policy.test.js`)

**Result: CHECKS 4 FAIL 0, exit 0** (real child processes booting the server):

| Probe | Result |
|---|---|
| P1 stray `unhandledRejection` | process **stays alive** (ALIVE after 3s; Node's default would exit) |
| P1b | the rejection is loudly logged: `[process] unhandledRejection (kept alive): a34-stray-rejection` |
| P2 stray `uncaughtException` | **exit 1** |
| P2b | the full shutdown sequence ran: `[shutdown] uncaughtException received — draining …` + `dependencies closed` |
| P3 SIGTERM exit 0 | documented platform skip on Windows (TerminateProcess delivers no signal phase) — exercised fully on the Linux CI lanes |

**Mutation negative proof:** the `unhandledRejection` handler renamed away →
P1 **fails** (the Node default crashes the child, exit 1) — caught, reverted,
4/0 restored.

## Notes

- `A-34:PROCESS-ERROR-POLICY — RUNTIME-VERIFIED` (behavioral children, exit 0; the mutation caught).
- The n01-server-entry suite stays green after the index.js change (5/5).
