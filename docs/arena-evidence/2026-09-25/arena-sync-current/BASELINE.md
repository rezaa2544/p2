# Current-HEAD runtime baseline — IN PROGRESS

SHA: `4938631633c9c578db2679905fd46c4daaedd80a`
Branch: `arena-sync/current-head-20260925`, created directly from fetched main. No historical branch dependency.

## Verdict
**FAILED**: requested no-stale-overwrite invariant is breached on this HEAD.
Strict Verification Gate: **NOT VERIFIED**, exit 1.
No product fix, commit, push, PR, merge, or roadmap promotion in this audit yet. **Roadmap Reconciliation Required**.

## Evidence boundary
281 runtime assertions: **211 PASS, 70 FAIL, 0 harness errors**, program exit **1**. These are assertion counts, not independent defects. Five repetitions per normal scenario; each of five PATCH routes has one real pre-commit process-kill experiment; one lost-ACK sync crash experiment. An earlier narrower run had 161 PASS / 45 FAIL; do not add these counts as unique coverage.

Real Node 22 child HTTP processes load current production factories, sharing a disposable real PostgreSQL 17 database. Authoritative post-request SELECTs are recorded. Authentication is a fixed manager fixture; schema is minimal, not a production migration replay. Client A/B are independent HTTP request streams to separate processes. Offline means a deliberately held operation delivered after another client commits, not an actual browser network-disconnect/IndexedDB test. E3 local evidence only.

Browser/device queue durability, full authenticated app, Redis dedup configuration, migrated production schema, dependency outages, production multi-host topology and E4: **NOT VERIFIED**. Matrix is expanded baseline coverage, not exhaustive malformed-input or all-policy clearance.

## Matrix
All five explicit PATCH dispatches in `server/index.js`: students (1582), classes (1607), attendance (1628), grades (1649), users (1674). Mapping checked against current dispatch source.

| Entity | Runtime scenario | PASS | FAIL |
|---|---|---:|---:|
| students | correct version | 5 | 0 |
| students | stale explicit version | 5 | 0 |
| students | missing version strict | 5 | 0 |
| students | boolean base strict | 5 | 0 |
| students | legacy missing version after A | 0 | 5 |
| students | version alias | 5 | 0 |
| students | future version | 5 | 0 |
| students | boolean base at version1 | 0 | 5 |
| students | two-client concurrent update | 5 | 0 |
| students | duplicate PATCH replay | 5 | 0 |
| users | correct version | 5 | 0 |
| users | stale explicit version | 5 | 0 |
| users | missing version strict | 5 | 0 |
| users | boolean base strict | 5 | 0 |
| users | legacy missing version after A | 0 | 5 |
| users | version alias | 5 | 0 |
| users | future version | 5 | 0 |
| users | boolean base at version1 | 0 | 5 |
| users | two-client concurrent update | 5 | 0 |
| users | duplicate PATCH replay | 5 | 0 |
| classes | correct version | 5 | 0 |
| classes | stale explicit version | 5 | 0 |
| classes | missing version strict | 5 | 0 |
| classes | boolean base strict | 5 | 0 |
| classes | legacy missing version after A | 0 | 5 |
| classes | version alias | 5 | 0 |
| classes | future version | 5 | 0 |
| classes | boolean base at version1 | 0 | 5 |
| classes | two-client concurrent update | 5 | 0 |
| classes | duplicate PATCH replay | 5 | 0 |
| attendance | correct version | 5 | 0 |
| attendance | stale explicit version | 5 | 0 |
| attendance | missing version strict | 5 | 0 |
| attendance | boolean base strict | 5 | 0 |
| attendance | legacy missing version after A | 0 | 5 |
| attendance | version alias | 5 | 0 |
| attendance | future version | 5 | 0 |
| attendance | boolean base at version1 | 0 | 5 |
| attendance | two-client concurrent update | 5 | 0 |
| attendance | duplicate PATCH replay | 5 | 0 |
| grades | correct version | 5 | 0 |
| grades | stale explicit version | 5 | 0 |
| grades | missing version strict | 5 | 0 |
| grades | boolean base strict | 5 | 0 |
| grades | legacy missing version after A | 0 | 5 |
| grades | version alias | 5 | 0 |
| grades | future version | 5 | 0 |
| grades | boolean base at version1 | 0 | 5 |
| grades | two-client concurrent update | 5 | 0 |
| grades | duplicate PATCH replay | 5 | 0 |
| A-18 | resolve conflict after newer write | 0 | 5 |
| A-18 | duplicate concurrent resolution | 0 | 5 |
| A-24 | offline delayed reconnect versioned | 5 | 0 |
| A-24 | LWW out-of-order old event | 0 | 5 |
| A-24 | duplicate sync two processes | 0 | 5 |
| students | SIGKILL before commit; reconnect stale retry | 1 | 0 |
| users | SIGKILL before commit; reconnect stale retry | 1 | 0 |
| classes | SIGKILL before commit; reconnect stale retry | 1 | 0 |
| attendance | SIGKILL before commit; reconnect stale retry | 1 | 0 |
| grades | SIGKILL before commit; reconnect stale retry | 1 | 0 |
| A-24 | SIGKILL after commit before response; replay | 1 | 0 |

## Reproduced findings
1. **A-18 / P1 / Sync owner**: conflict at v9, B commits newer content at v10, A resolves incoming using stale cached target. HTTP 200; PostgreSQL content becomes stale-conflict while version remains 10. `server/conflicts.js:150` monotonic max does not protect payload freshness. Required remediation: authoritative locked reads, reject obsolete conflict baseline, target CAS plus conflict resolution in one transaction, publish cache only after commit; concurrent resolve must not double-accept.
2. **A-24 / P1 / Sync + DB owner**: concurrent same UID insert on two processes creates two durable announcements. `server/db.js:822` records UID after effect with ON CONFLICT DO NOTHING; pre-check is not a transactional claim. Required remediation: unique durable UID claim and all effects in one transaction, rollback/retry semantics for mixed batches; test pre-commit and lost-ACK crashes.
3. **A-20 / P2 / REST OCC owner**: boolean base at version1 passes coercive comparison then persistence rejects it, producing HTTP 503 rather than validation 400 on all five PATCH routes. No mutation observed. `server/occ.js` must reject nonnumeric/noninteger bases before persistence. The earlier boolean-at-v10 test rejected via mismatch and alone would miss this boundary.
4. **A-20 / contract decision**: legacy no-base PATCH overwrites a newer acknowledged write on all five routes. Strict mode rejects missing bases and passed these tested cells; this does not make legacy safe.
5. **A-24 / contract decision**: LWW announcements accepts a newer event, then an older queued event with base9. Older content overwrites newer content, counter stays9. Current receipt-order LWW policy explicitly permits this; requested invariant does not. Client timestamps are not a safe replacement for OCC. Must choose contract change or preserve policy with FAILED invariant, not silently label PASS.

## Positive runtime evidence (scoped, not gate clearance)
All five PATCH routes passed correct numeric base, version alias, stale/future rejection, strict missing-base rejection, one-winner same-base race, replay rejection, and pre-commit SIGKILL → rollback → B newer commit → restarted A stale rejection. Delayed structural sync was rejected. Lost-ACK insertion survived worker restart and replay produced duplicate_ignored with one row. These do not erase concurrent-UID or conflict-resolution failures.

## Reproduction and artifacts
Command (dependencies outside workspace):
```sh
NODE_PATH=/var/tmp/arena-sync-current-deps/node_modules \
SYNC_DATABASE_URL=postgres://user@127.0.0.1:25433/postgres \
/var/tmp/arena-sync-current-node/node_modules/.bin/node \
/home/user/arena-sync-current/current-runtime.cjs /home/user/arena-sync-current/evidence/baseline-expanded
```
`current-runtime.cjs`, `runtime-worker.cjs`: reproducible runner/HTTP host. Runner creates and drops a unique disposable schema. PostgreSQL must already be running; prerequisites are not skipped.
`evidence/baseline-expanded/ledger.json`: each assertion includes SHA, input/expected/actual, round, UTC and evidence level.
`evidence/baseline-expanded.log`, `.exit`, `baseline-expanded/summary.json`: raw output and exact failing exit.
`evidence/baseline-strict-gate.log`, `.exit`: independently executed current gate, exit1; missing current-SHA bindings/reviews.

## Next actions — not completed
Obtain explicit legacy/LWW compatibility decision; fix repo-owned A18, malformed OCC and transactional UID race; implement chosen sync/client contract; add stronger malformed, out-of-order, delete, transaction-failure, browser queue and restart tests; reproduce regressions on final committed SHA; independent reviewers and Tech Lead merge remain required. No prior report is current evidence.
