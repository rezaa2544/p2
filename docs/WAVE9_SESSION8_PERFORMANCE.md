# Wave 9 Performance — Bug Hunt Session 8

**Date:** 2026-09-11 (Asia/Tehran)  
**Branch:** `feat/bughunt-session8-wave9`  
**Base:** `origin/main @ aaf3fab`  
**Current local HEAD:** `685f935`  
**Method:** `SKILLS_MASTER.md`; red regression first, implementation second, mutation test third, one Conventional Commit per fix.

## Scope

This session targeted request-path work and bounded resources in the server: internal GC timestamp maps, asynchronous audit buffering and disk I/O, bootstrap school indexes, public-report aggregation, and nested enrichment scans in the classes and grades routes. The work covers the Wave 9 categories of large stringify/I/O, repeated filter/find work, audit bursts, heavy report computation, memory growth, and cache stampede/index retention.

No secret, token, or credential is recorded in this document.

## Findings and fixes

| ID | Finding / impact | Severity | Red witness | Fix commit | Mutation witness |
|---|---|---:|---|---|---|
| W9-S8-1 | GC treated internal timestamp objects as non-expiring values; stale `__processed_uids`/`__revoked_jti` entries could accumulate. | P2 | `tests/session8-gc.js` was red before timestamp-aware collection | `062fbe3` `fix(runtime): collect timestamped internal state` | `session8-gc-mutations.js`: **2/2 killed** |
| W9-S8-2 | Async audit buffering had no explicit queue bound; an audit burst could grow the heap without limit. | P1 | `tests/session8-audit-queue.js`: queue-cap assertion red before the bound | `324eec8` `fix(audit): bound asynchronous event buffering` | `session8-audit-queue-mutations.js`: **2/2 killed** |
| W9-S8-3 | Failed asynchronous audit appends discarded the batch, losing security evidence after a transient disk error. | P1 | `tests/session8-audit-flush.js`: retry/retention assertions red before requeue | `8f45f54` `fix(audit): retain failed asynchronous batches` | `session8-audit-flush-mutations.js`: **2/2 killed** |
| W9-S8-4 | Bootstrap school indexes could grow without a finite TTL and invalidation left stale L2 membership/index data. | P1 | `tests/session8-cache-index.js`: TTL/purge assertions red before the fix | `d4fc168` `fix(cache): bound bootstrap school indexes` | `session8-cache-index-mutations.js`: **2/2 killed** |
| W9-S8-5 | Public meeting statistics repeatedly filtered/grouped the same collection; report cost grew with repeated passes. | P2 | `tests/session8-public-report.js`: filter-pass assertion red before aggregation | `6035028` `perf(report): aggregate meeting stats in one pass` | `session8-public-report-mutations.js`: **2/2 killed** |
| W9-S8-6 | Class-list enrichment called `enrollments.filter()` once per class, producing O(classes × enrollments) memory-path work. | P2 | `tests/session8-classes-index.js` failed with a live forbidden-filter probe | `dd2d7eb` `perf(classes): index enrollments during list enrichment` | `session8-classes-index-mutations.js`: **2/2 killed** |
| W9-S8-7 | Grade-list enrichment called `subjects.find()` and `users.find()` once per grade, producing repeated linear scans. | P2 | `tests/session8-grades-index.js` failed with live forbidden-find probes | `6aeb5ba` `perf(grades): index enrichment lookups` | `session8-grades-index-mutations.js`: **2/2 killed** |
| W9-S8-8 | Async audit initialization and rotation still used synchronous filesystem calls outside `record()`; the first event and size rotation could block the event loop. | P1 | `tests/session8-audit-async-io.js` first failed with `1 !== 0` sync-FS calls | `e54b998` `perf(audit): make async initialization and rotation nonblocking` | `session8-audit-async-io-mutations.js`: **2/2 killed** |

### Design notes

- Async audit mode remains opt-in through `PAYESH_AUDIT_ASYNC=1`; in that mode request-time initialization does not call sync filesystem APIs, and background rotation uses `fs.promises`.
- `flushSync()` is deliberately retained for process shutdown and now creates the parent directories before the final append. It is not used on the normal request path.
- Class and grade enrichment build `Map` indexes once per request and preserve the existing tenant/policy filtering and output shape.
- Cache invalidation removes both the school membership set and the associated bootstrap L2 entries; Redis/memory fallback expiry is bounded as well.

## Regression and mutation evidence

| Suite | Result |
|---|---:|
| `node tests/session8-gc.js` | **5/5** |
| `node tests/session8-audit-queue.js` | **4/4** |
| `node tests/session8-audit-flush.js` | **4/4** |
| `node tests/session8-audit-async-io.js` | **5/5** |
| `node tests/session8-cache-index.js` | **6/6** |
| `node tests/session8-public-report.js` | **4/4** |
| `node tests/session8-classes-index.js` | **5/5** |
| `node tests/session8-grades-index.js` | **5/5** |
| All eight Session 8 mutation suites | **16/16 mutants killed; every baseline restored green** |
| `node tests/wave9-performance.js` | **39/39** |
| `node tests/wave8-outbox.js` | **14/14** |
| `node tests/wave8-outbox-mutations.js` | **5/5** after `685f935` repaired a stale mutation anchor |

## Required gates

| Gate | Result | Evidence / limitation |
|---|---|---|
| `node tests/smoke.js` | **547/547** | One expected jsdom `window.scrollTo` “Not implemented” console notice; no failed assertion. Node warns that the workspace is v20.20.2 while the project engine requests >=22. |
| `node tools/check-authz.js` | **exit 0** | 388 actions checked; authorization mapping matched. The tool reports 54 writer actions without a client `canAction` label as an existing advisory; server fail-closed guard remains the contract. |
| `node tests/secret-scan.js` | **11/11** | No credential findings; `.gitignore` coverage passed. |
| `node build.js --check` | **pass** | Build output and checked-in index/guide matched; authz generation matched. |
| `node tests/wave8-outbox.js` | **14/14** | Green. |
| `node tests/wave8-deep-audit.js` | **NOT RUN / missing** | The repository has no such file; Node exited with `MODULE_NOT_FOUND` (exit 1 in the combined gate command). This is not counted as green. |
| `bash scripts/run-all-tests.sh` | **incomplete / not accepted as green** | The runner did not reach a final `TOTAL` before the 30-minute tool window and stale overlapping runner processes were stopped. Partial logs contained unrelated pre-existing red suites; no all-suite green claim is made. |
| Documentation consistency checks | **partial** | `docs-health.js` passed 9/9. `docs-consistency.js` remained red on the pre-existing migration-count mismatch (19/22), and `docs-metadata.js` remained red on the existing orphan-document check (16/17); generated reports were restored rather than claiming green. |

### Wave 8 regression record

- `wave8-outbox.js` itself was green at 14/14 throughout the final verification.
- Its mutation suite initially reported 4/5 because the M3 deletion mutant anchor had become stale after the worker metrics line was added. That red result was reproduced, the mutation fixture was corrected in `685f935`, and the final mutation result is 5/5.
- `tests/wave8-deep-audit.js` is absent and remains an explicit missing-gate regression, not a fabricated pass.
- The partial all-suite run also exposed unrelated existing mutation/coverage reds (including `server-mutations.js` 19/20 and other legacy suites). They were not attributed to Session 8 and were not silently converted to green.

## Ruflo and delivery status

- Ruflo registration key requested: `bug_hunt_session8`.
- **Registration is pending:** no `ruflo` executable is installed in this sandbox, so no successful memory write is claimed. No credential or token was placed in a report, patch, bundle, or remote URL.
- Push and PR are pending until documentation is committed and the clean-tree/secret checks are repeated.

## Next steps

1. Commit the Session 8/Wave 9 documentation and handoff updates.
2. Repeat the fast required gates on the final clean tree.
3. Attempt the authenticated push using the existing temporary authentication mechanism without persisting credentials; leave the permanent remote credential-free.
4. Create PR titled `fix: bug hunt session 8 (wave 9 performance)` if push succeeds.
5. If push fails, write a credential-free patch/bundle under `/home/user/bandle` and report the exact failure.
