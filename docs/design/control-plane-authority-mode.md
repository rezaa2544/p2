# Control-plane authority mode — RAM-authoritative remnants (A-28 design documentation)

Recorded: 2026-11-11, during legacy carry-over revalidation (A-01..A-29).
Status vocabulary per docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md.

## Scope

The legacy carry-over A-28 records an Architecture/scale obligation:
"RAM-authoritative control planes, authority mode, legacy tenant enforcement
remain design/documentation obligations". This note is the authoritative
design documentation that discharges the DOCUMENTATION obligation; the
implementation work itself stays tracked in Phase 8.3 / C2 (see
docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md, R1).

## 1. Authority modes (terminology, repo-canonical)

| Mode | Meaning | Cross-instance correctness |
|---|---|---|
| **PG-authoritative** | PostgreSQL is the single source of truth; every read/write goes through `db.query` with the server-side truth (e.g. `nextval`, `pg_advisory_xact_lock`) | correct by construction |
| **RAM-authoritative** | A per-process in-memory Map/Set is the source of truth for a control-plane decision | only correct for single-instance deployments |

A module is RAM-authoritative when its state map is neither read from nor
written through to PostgreSQL on every decision.

## 2. The five remaining RAM-authoritative control-plane modules

Ground truth from docs/PHASE_8_ENTRY_AUDIT_REPORT.md (R1) and
docs/PHASE_8.1_REMEDIATION_AUDIT_REPORT.md — verified to remain at this HEAD:

1. `server/provincial-pilot-scaling.js` — `_provincialStateStore`
2. `server/change-management.js` — `changeRegistry`
3. `server/national-capacity-enforcement.js` — `activeReservations`
4. `server/national-operations-center.js` — `activeIncidents`
5. `server/event-processing-layer.js` — `processedIdempotencyKeys`

Shared properties (documented honestly, not hidden): they boot-hydrate from
`authority_state`, some transitions write through (`persistChange` →
`putState`), but **there is no cross-instance runtime invalidation** (no Redis
pub/sub fan-out for these maps). Instance B does not observe a change created
on instance A until restart.

## 3. Target design (authority mode)

For each of the five modules the migration is the same three steps:

1. **Declare the authority** — each module gains an explicit `authority`
   config value (`pg` | `ram`) chosen at boot from the deployment shape:
   `authority=pg` when `DATABASE_URL` is configured, `ram` otherwise.
   The declaration is logged at boot and exposed on `/readyz` detail.
2. **Write-through on every mutation** — in `pg` mode every state transition
   persists via the existing `putState`/`persistChange` path INSIDE the same
   request (no post-commit hook), so a crash cannot lose a transition that a
   client has observed.
3. **Cross-instance invalidation** — in `pg` mode each transition also
   publishes a compact invalidation event on the existing Redis pub/sub
   channel used by M15-05 durable cache invalidation
   (`payesh:cache:invalidate`); subscribers drop the affected map entry and
   re-hydrate lazily from `authority_state` on next access. In `ram` mode the
   publish step is skipped (single instance, no subscriber).

Legacy tenant enforcement (the fragmented per-route checks) is NOT migrated by
this design: it is tracked separately (Phase 8.3 C2 scope), and the canonical
gate for any new/changed route remains `policy.studentRecordOk` /
`assertCanSeeSchool` (A-19 pattern).

## 4. Acceptance criteria for the implementation mission (Phase 8.3 / C2)

- All five maps run in `pg` mode under `DATABASE_URL` with write-through +
  pub/sub invalidation; adversarial test: create a change on instance A,
  instance B observes it WITHOUT restart (negative proof: the test must fail
  when the publish step is mutated away).
- `readyz` exposes the declared authority mode per module.
- No change in `ram` mode behavior for pure-local deployments (no
  `DATABASE_URL`) — documented + covered by the existing single-instance
  suites.

## 5. Verification of THIS note

The revalidation harness (`tools/legacy-revalidation.js`, check A-28) asserts
this note exists and names the obligation; the implementation mission's
evidence will live under `docs/verification/evidence/` with its own registry
binding.
