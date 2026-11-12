# LETTA / #454 Evidence — dead-letter management: operator requeue path

- **Verification id:** LETTA (issue #454 scope: transaction handler / dead-letter management)
- **Scope token:** `LETTA:DLQ-MANAGEMENT`
- **Date:** 2026-11-12 (current HEAD)

## Finding

The DLQ machinery existed and was runtime-verified (atomic transfer, lease-token
guard, terminal `dead_letter` never claimed by the worker — asserted by
`tests/outbox-runtime-reliability.test.js`), but the DLQ was **one-way**: once an
event was dead-lettered, no path returned it to the queue after the operator fixed
the underlying cause. A dead-lettered event was replayable only by hand-editing
the DB — no audited, guarded management surface.

## Change (`server/outbox.js`)

- **`listDead(limit)`** — exposes DLQ rows (PG: `server_outbox_dlq ORDER BY failed_at DESC`; RAM: the mirror), for operator review.
- **`requeueDead(ref)`** — the guarded return path:
  - accepts only a ref present in the DLQ (`NOT_IN_DLQ` otherwise) — ref = `outbox_id` or DLQ row `id`;
  - **deletes the DLQ row** — mandatory: `UNIQUE(outbox_id)` + `ON CONFLICT DO NOTHING` means a surviving DLQ row would silently swallow any future `moveToDlq` of the same event (R6 proves this);
  - verifies the source row is still `dead_letter` (`SOURCE_NOT_DEAD_LETTER` on mismatch);
  - restores the source row to `pending` with a fresh budget (`retry_count = 0`, `last_error = NULL`, lease fields cleared);
  - the whole transfer is **one atomic transaction** in PG (delete + update together or nothing, rollback on failure);
  - replay goes through the NORMAL worker claim path — no parallel replay route was built.

## Guard test (`tests/letta-dlq-requeue.test.js`)

**Result: CHECKS 13 FAIL 0, exit 0.**

R1 poison event → DLQ + worker does not claim dead_letter · R2 listDead exposes the row · R3 requeue restores pending with a fresh budget and removes the DLQ row · R4 the replayed event is processed by the normal `worker.tick()` path · R5 unknown ref refused (NOT_IN_DLQ) / DLQ row with a non-dead_letter source refused (SOURCE_NOT_DEAD_LETTER) / the stale DLQ row survives the refusal · R6 re-DLQ after requeue is NOT swallowed by the UNIQUE conflict.

**Mutation negative proof (False-Green Law):**
- M1 — the RAM requeue skips the DLQ-row deletion → 3 failures (R3b, R6) ✓ caught, reverted, 13/0.
- M2 — the RAM requeue drops the source status guard → 2 failures (R5b-ii/iii) ✓ caught, reverted, 13/0.

## Notes

- `LETTA:DLQ-MANAGEMENT — RUNTIME-VERIFIED` (guard executed, exit 0; both mutations caught).
- The canonical runner discovers `tests/*.test.js` root tests automatically; this
  battery runs in CI from this push.
