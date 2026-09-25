# Current-HEAD Sync / Offline audit

**Final verdict: NOT VERIFIED (Strict Verification Gate).**  
**Global no-stale-overwrite invariant: FAILED in intentionally retained legacy mode.**  
A-18 / A-20 / A-24: **PARTIALLY VERIFIED** — scoped fixes and runtime regressions exist; no independent-review or production clearance.

## Provenance and publication

- Base/main: `4938631633c9c578db2679905fd46c4daaedd80a`, freshly fetched; no old Arena/DR branch dependency.
- Final tested HEAD: **`ea75623dd1a5cb06d72549703204601a5413425f`**; branch `arena-sync/current-head-20260925`.
- Main remained at the base SHA when publication was attempted. Final working tree is clean.
- Three local commits: atomic conflict/OCC/UID fixes; built distributable client; measurement-test repairs.
- Push: **BLOCKED**, exit128, HTTPS credentials unavailable. **No PR created; no merge performed.** Tech Lead alone merges.
- `current-head-sync.bundle` contains the three commits relative to base; bundle verification succeeded. `PR_DRAFT.md` is a draft, not an opened PR.

## Contract decision — explicit user choice

The user selected **production/strict only**. Missing/invalid bases are rejected for client update/delete in strict/production, including formerly LWW collections. Legacy missing-base behavior remains outside strict mode. Its failed invariant cells are **not** changed to PASS.

Strict = `PAYESH_STRICT_BASE_VERSION=1`, `PAYESH_ENV=production`, or `NODE_ENV=production`. All production writers must use this policy: a non-strict process sharing the database can still overwrite or even rewind strict-written state. Client event timestamps do not override server OCC. Rollout of older clients needs an explicit compatibility plan; their unversioned writes will be rejected rather than silently rebased.

## Paired runtime evidence

| Execution | Product SHA | Composite assertions | PASS | FAIL | Harness errors | Exit |
|---|---|---:|---:|---:|---:|---:|
| Base with final identical harness | `4938631` | 387 | 218 | 169 | 0 | 1 |
| Final run 1 | `ea75623` | 387 | 357 | 30 | 0 | 1 |
| Final run 2 | `ea75623` | 387 | 357 | 30 | 0 | 1 |

The 30 final failures are exactly 25 legacy no-base PATCH cells (five routes × five repetitions) plus five legacy no-base LWW cells. **No failed cell is hidden or counted as success.** Counts are composite assertion/ledger cells, not distinct defects; some cells check several malformed inputs. The two final runs are repetitions, not 774 unique scenarios.

Base replay uses the exact final harness files copied into a detached worktree of the same freshly fetched main. That worktree reports dirty because the three harness files are untracked; **tracked product diff is empty**, recorded in `base-product-diff.*`. Paired harness SHA256 hashes match. This avoids relying on the evolving early development runner as the only reproduction source. Intermediate dirty-tree runs are development evidence only, archived separately.

## Runtime environment and boundaries

v22.23.3
postgres (PostgreSQL) 17.11 (Debian 17.11-0+deb13u1)
Version 1.63.0

Real PostgreSQL17; independent HTTP worker processes loading production route/sync/conflict modules; authoritative SQL readbacks; real SIGKILL/restart. Real Chromium contexts execute current production client modules with actual localStorage, offline network control, reload, and CDP renderer crash. The browser uses a fixed session fixture, **not full login/authentication**.

Normal cells run five times per suite invocation. Each PATCH pre-commit crash runs once per route per invocation; sync pre-commit and post-commit/lost-ACK kills each run once. Browser scenarios each run five times. All these were repeated on the final clean SHA.

Minimal disposable schema, not a full production migration replay. Same-machine workers are not production multi-host proof. Browser harness uses production modules but not the complete built app boot/auth flow. Renderer crash is not device power loss or a full browser-process kill. Real Service Worker/IndexedDB background durability, Redis-backed multi-host behavior, arbitrary outages, full tenant/role coverage, independent reviews and E4 remain **NOT VERIFIED**.

## Reproduced defects → scoped remediation

| Item / owner | Baseline reproduction | Root cause / fix | Current scoped evidence |
|---|---|---|---|
| A-18 / Sync owner / P1 | Conflict at v9; B commits newer v10; A resolves incoming; old payload replaces newer with version still10 | Cached arbitration and separate, error-swallowing writes. `server/conflict-transaction.js:4–46` locks conflict/target, checks freshness, CAS-updates target and conflict atomically; `server/conflicts.js:92–118` publishes cache only after commit | Stale reject; fresh apply; concurrent one-winner resolve; deleted-target reject; live server winner; injected status-write failure rolls back target |
| A-20 / REST OCC owner / P2 | Boolean base at v1 became503, despite rejection at v10 | Coercive comparison reached persistence. `server/occ.js:35–37` rejects malformed base before DB | All five PATCH routes: numeric/alias positives, stale/future/absent/malformed boundaries, race, duplicate and kill/restart |
| A-24 / DB + Sync owner / P1 | Same UID concurrently creates two durable inserts | UID recorded after effect with DO NOTHING. `server/db.js:852–866` atomically claims sorted UIDs before effects; losing batch rolls back, returns retryable failure | Concurrent duplicate + retry commits one effect; pre-commit kill rolls back claim/effect; lost-ACK retry observes durable UID |
| A-24 / Sync + client owner / P1 strict | LWW older delivery overwrites newer; sync loses final CAS base | `server/sync.js:802–1123`: strict universal bases, predicted batch versions, authoritative row data, base forwarded to SQL; `src/js/03-persistence.js:183–199`: original base in update/delete queue; rebuilt index.html | LWW stale rejection, races, sequential offline batches, stale deletes, real browser reconnect/reload/crash |

The required all-PATCH inventory is students/classes/attendance/grades/users at `server/index.js:1582/1607/1628/1649/1674`. Full cell results are in **PATCH_OCC_MATRIX.csv**, with expected/actual payloads in the JSON ledger. PASS labels there apply only to the executed assertion, not a roadmap item or deployment.

## Additional runtime matrix (one final invocation)

| Entity | Scenario | PASS | FAIL |
|---|---|---:|---:|
| A-18 | resolve conflict after newer write | 5 | 0 |
| A-18 | duplicate concurrent resolution | 5 | 0 |
| A-18 | fresh incoming resolution | 5 | 0 |
| A-18 | server winner after newer write | 5 | 0 |
| A-18 | deleted target | 5 | 0 |
| A-18 | target+conflict transaction rollback | 5 | 0 |
| A-24 | classes sync CAS race | 5 | 0 |
| A-24 | classes missing base strict | 5 | 0 |
| A-24 | classes dependent offline batch | 5 | 0 |
| A-24 | classes stale delete | 5 | 0 |
| A-24 | announcements sync CAS race | 5 | 0 |
| A-24 | announcements missing base strict | 5 | 0 |
| A-24 | announcements dependent offline batch | 5 | 0 |
| A-24 | announcements stale delete | 5 | 0 |
| A-24 | offline delayed reconnect versioned | 5 | 0 |
| A-24 | LWW out-of-order old event | 5 | 0 |
| legacy | LWW missing base after strict newer write | 0 | 5 |
| A-24 | duplicate sync two processes | 5 | 0 |
| browser | two contexts offline/reconnect actual client queue | 5 | 0 |
| browser | offline dependent LWW edits survive reload | 5 | 0 |
| browser | renderer crash after commit before ACK | 5 | 0 |
| A-24 | SIGKILL between UID claim and commit | 1 | 0 |
| A-24 | SIGKILL after commit before response; replay | 1 | 0 |

## Regression and build integrity

- Final SHA: 16 existing suites returned0; bgsync ran five rounds on that SHA, all0. These suites include mocks/static assertions and are **not substitutes** for PG/browser evidence.
- Earlier bgsync fixed700ms observations failed intermittently (including 2/5 in a preserved run). Test now waits up to5s for the same actual mirror state, then asserts it; no test retry or silent skip. Real SW/IDB durability is not inferred from this fixture.
- Existing wave4 AC11 failed on pristine base too. Diagnostic SQL showed 14 MAX(chg_id) watermark reads, not delta-row reads. Test now permits only that exact SQL shape and requires full reads for every collection; other SQL still fails.
- Final `node build.js --check`: **exit0**, built HTML byte-identical, guide stamp matches, generated write-permissions and authz checks pass. No old write-permissions assumption was reused.
- Final Strict Verification Gate: **exit1 / NOT VERIFIED**: unapproved false-green-marker hits plus absent current-SHA item bindings and required independent reviews. No registry entries were upgraded.

## Evidence and reproduction

Primary evidence:
- `evidence/base-with-final-harness/{ledger,summary}.json` and `.log/.exit`: paired original-main reproduction.
- `evidence/head-ea75623-{1,2}/{ledger,summary}.json` and `.log/.exit`: final clean-SHA runtime evidence, every input/expected/actual/status/round/time recorded.
- `evidence/head-ea75623-existing-summary.json`, corresponding suite logs: same-SHA suite executions.
- `evidence/head-ea75623-{strict-gate,build-check,push}.*`: gate/build/publication exits and raw logs.
- `evidence/paired-harness-SHA256SUMS`: identical reproduction harness verification.
- `evidence/development-runs.tar.gz`, `superseded-5747436-runs.tar.gz`: archived superseded evidence, not current clearance.

Commands (from repo; DB and dependencies must be installed, no skipped prerequisite):
```sh
NODE_PATH=/var/tmp/arena-sync-current-browser/node_modules:/var/tmp/arena-sync-current-deps/node_modules \
PLAYWRIGHT_BROWSERS_PATH=/var/tmp/arena-sync-current-browsers \
SYNC_DATABASE_URL=postgres://user@127.0.0.1:25433/postgres \
/var/tmp/arena-sync-current-node/node_modules/.bin/node \
  tests/current-head-sync-pg.cjs /path/to/evidence
# Expected current global-invariant audit exit: 1, because legacy failures remain.

node build.js --check
node tools/strict-verification-gate.js
```

## Roadmap Reconciliation Required

1. **Tech Lead / reviewers:** reconcile historical A18/A20 fixed claims with reproduced fresh-main failures and this new tested SHA; obtain independent reviews. A24 stays PARTIALLY VERIFIED. Do not promote registry statuses from an assertion count.
2. **Release/backend owner:** require strict policy on every production writer, migration/version-column availability, compatible client rollout, and full-app/multi-host failure tests. Legacy is an explicit limitation, not evidence for a universal invariant.
3. **Frontend/offline owner:** real Service Worker/IndexedDB and device power-loss tests remain NOT VERIFIED, separate from the renderer/localStorage evidence.
4. **Repository owner:** supply secure authenticated publication; push/PR is BLOCKED. No credentials in chat. Only Tech Lead merges after review/gate reconciliation.

No production GO. Workspace remains below100MB; prerequisites and disposable database are outside the persisted workspace. Unrelated pre-existing changes remain stashed and were not restored.
