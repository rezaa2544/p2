# A-39 Evidence — structured logging (JSON-lines + correlation id + tenant/user searchability)

- **Verification id:** A-39
- **Scope token:** `A-39:STRUCTURED-LOGGING`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

The server had **no logger abstraction, no correlation id, and 125 ad-hoc
console sites** (34 console.log + 91 console.error/warn across server/**).
Task 17 demanded: full console.log replacement, a correlation id per request,
and log lines searchable by tenant / user / request_id.

## Change

**`server/logger.js`** (NEW) — a zero-dependency JSON-lines logger:
`{ ts, level, msg, request_id, tenant, user, ...fields }` per line to stdout
(and error lines to stderr). Levels debug/info/warn/error with the
`LOG_LEVEL` gate; `child(bind)` returns a logger with stable bound context;
`newRequestId()` mints a UUID. No new dependency (pino/winston were never
present; the output contract is the same JSON-lines a collector parses — the
repo keeps its zero-supply-chain posture). The module has no server requires,
so it is safe from any boot order (no circular dependency).

**`server/index.js`** — the request wrapper now mints/honors a correlation
id (the incoming `x-request-id` is honored for edge-owned ids; otherwise a
UUID), echoes it on the `x-request-id` response header, and binds a request
logger. When the session resolves, the logger child binds `tenant` (school_id)
and `user` — every line of a request is searchable by all three fields.

**Migration:** all 34 `console.log` sites in server/** replaced with
`logger.info` (mechanical, comment-stripped scan confirms **zero** remain).

## Guard test (`tests/a39-structured-logging.test.js`) — CHECKS 9 FAIL 0, exit 0

L1 one JSON object per line (ts/level/msg) · L2 the child binding
(request_id/tenant/user) on every line · L2b extra fields pass through ·
L3 the level gate (debug below info not emitted) · L4 error = a JSON line on
stderr · R1/R2/R3 the HTTP correlation (minted UUID echoed; per-request
uniqueness; client-supplied id honored/echoed — looked through the repo's
in-process boot harness: `tests/api/*` require index and bind manually) ·
R4 zero `console.log` left in server/ (comment-stripped tree scan).

**Mutation negative proof:** the `x-request-id` echo removed → **R1 + R3
fail** (no correlation id on the wire) — caught, reverted, 9/0 restored.

## Regression

The migration touched the boot + the dispatcher, so the full battery re-ran:
**`tests/api/runner.js` → 32/32 suites, 242 assertions, exit 0**; the unit
guards a34/a35/a37/a32/a38/letta/a36 all CHECKS 0 FAIL.

## Notes

- `A-39:STRUCTURED-LOGGING — RUNTIME-VERIFIED` (live requests concluded the
  correlation contract; the mutation caught a real gap).
- The 91 console.error/warn sit es are out of this task's literal scope
  ("جایگزینی کامل console.log"); they are the tracked follow-up.
- Boot: index auto-listens only when it is the main module (`require.main ===
  module`); test harnesses bind manually — the a39 guard follows that
  convention, which is why no boot-time "listening" log is asserted.
