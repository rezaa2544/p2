# Payesh — Replit + Bolt External Audit Reconciliation
## 2026-10-02 — Current-main reconciliation

**Repository:** `rezaa2544/p2`  
**Current main HEAD:** `a8e5772767d2bd4166864aa86033252adccdfb27`  
**Replit blind-pass SHA:** `6152a48add2ba8197c7c122133d9e2859e90711f`  
**Bolt cross-layer SHA:** `4acaf5329b1fb41f12e50065ecb0f0b4a84168e9`  
**Current-main comparison:** both audited SHAs are ancestors of current main; the current-main delta from Bolt is documentation-only, and the Replit reconciliation likewise found no source/test/workflow changes since its audited SHA. Therefore source-level findings below remain relevant to current main unless explicitly dispositioned otherwise.

## 1. Replit reconciliation

Replit corrected its earlier overstatement and now treats the audit as discovery evidence, not verification. Four candidates are registered in the project as R-A1..R-A4:

- R-A1 / class-detail projection: student/parent class roster may expose classmates' names and masked national-ID prefixes. **P2 / CONDITIONAL / REVALIDATION_REQUIRED.** Product projection intent and real role matrix remain unresolved.
- R-A2 / Redis Cluster recovery after retry exhaustion. **P1 / STRONGLY_SUPPORTED / REVALIDATION_REQUIRED.** Source/dependency behavior is persuasive, but live cluster outage→recovery has not been run.
- R-A3 / HA-only Redis Cluster/Sentinel configuration classification and fallback. **P3 / CONDITIONAL / REVALIDATION_REQUIRED.** Needs supported-configuration matrix before defect classification.
- R-A4 / broad `/tmp/payesh-*` cleanup. **P3 / source-confirmed deletion behavior / REVALIDATION_REQUIRED.** Ownership-safe cleanup regression is still required.

Known themes correctly deduplicated by Replit:
- all-null `edu_office` scope → existing office-scope finding;
- conditional `0000` OTP bypass → existing OTP finding;
- missing explicit suite/CI timeout → existing timeout theme.

Replit's revised report explicitly says none of these are VERIFIED/closed.

## 2. Bolt reconciliation

Bolt reviewed cross-layer interactions at `4acaf53` and found ten candidates. Current source was checked on `main`; because the 4acaf53→a8e5772 delta contains documentation only, the source observations remain applicable to current main.

### New / materially additive findings to register

**B-01 — Redis outage can silently lose cache invalidation**  
**P1 / source-supported / REVALIDATION_REQUIRED.**  
`server/cache.js` performs the Redis epoch write before local L1 clearing, L2 purge and pub/sub. Relevant REST routes use fire-and-forget `.catch(() => {})`. If Redis is unavailable during a successful PostgreSQL write, invalidation can abort before local/L2 cleanup and the error can be swallowed. After Redis recovery, stale cache may remain until TTL. This is distinct from the existing revocation journal because there is no equivalent cache-invalidation replay mechanism. Requires live PG+Redis reproduction.

**B-02 — Bootstrap cache can retain old role/school scope after direct PostgreSQL role change**  
**P1 / conditional / REVALIDATION_REQUIRED.**  
`sessionFrom` refreshes the user from PG, but bootstrap cache is keyed by user ID and can be served before rebuilding the response. The reported path is specifically direct PG role/school mutation that bypasses application invalidation. If direct PG administrative changes are an allowed operational path, this needs a current-head runtime proof and then a cache-key/validation decision.

**B-03 — PG→memory fallback has no client-visible stale/source signal**  
**P2 / source-supported, partially known / REVALIDATION_REQUIRED.**  
Analytics, semantic analytics and bootstrap can serve the in-memory mirror after PG failure while returning successful responses; the current code logs a warning but does not expose a source/staleness contract. This extends the existing A-03 fallback concern into an explicit API freshness contract. Do not duplicate A-03; register as a cross-layer residual/revalidation item.

**B-04 — Local revocation journal is not inherently cross-instance durable in container deployments**  
**P2 / conditional / REVALIDATION_REQUIRED.**  
The journal is a local JSON file. In separate containers/pods, local files are not automatically shared. If a revocation is journaled during Redis outage and the originating instance restarts before Redis recovery, the evidence path can disappear. Classification depends on the actual deployment storage contract. Requires deployment/storage verification before remediation.

**B-05 — Health-index reads memory mirror rather than PostgreSQL source of truth**  
**P2 / source-supported / REVALIDATION_REQUIRED.**  
`server/health-index.js` gathers health data from `store` and its constructor is not given a DB handle. In PG-live mode, a truncated/stale mirror can therefore produce health scores that differ from authoritative PG data. This is distinct from ordinary analytics fallback because the health-index path has no PG primary-read branch at all.

**B-06 — PG pool min/max parsing still accepts malformed numeric configuration**  
**P2 / source-supported / REVALIDATION_REQUIRED.**  
B-PG M12 bounded the timeout-related settings through `boundedMs`, but `PG_POOL_MIN` and `PG_POOL_MAX` still use bare `parseInt`. A malformed value can become `NaN`. This is an additive configuration-hardening finding, not a duplicate of the fixed B-PG timeout findings. Runtime/config matrix is required.

**B-07 — Shutdown does not explicitly stop the outbox worker before DB/Redis close**  
**P3 / possible / REVALIDATION_REQUIRED.**  
`handleShutdown` closes dependencies without calling the worker's `stop()`; the worker timer is unref'd. The likely impact is limited to an in-flight outbox operation racing dependency closure and then being retried after restart. Requires a controlled shutdown test before treating it as a defect.

### Findings that should NOT become duplicates

- Bolt F-05 (edu_office Phase-6 guard weakness) is folded into the existing office/tenant authorization revalidation family; current `resolveActorProvince` fail-closed behavior materially changes the old lockout path, but the defense-in-depth invariant still needs audit.
- Bolt F-08 is the existing OTP bypass family. Its new contribution is the explicit rate-limit bypass interaction in non-production/staging; update that existing finding rather than create a duplicate.
- Bolt F-10 is a conservative readiness false-negative during a narrow Redis reconnect window; keep as a low-priority architecture observation unless runtime evidence shows operational impact.
- Bolt's false positives/disproved candidates (JWT alg:none, OTP timing oracle, production Redis memory fallback, sync/REST twin-policy bypass, bootstrap PG scope) are not defects and are not added to the active defect queue.

## 3. Combined priority / next reproduction queue

Do not remediate blindly from these reports. The immediate controlled reproduction queue is:

1. **B-01 P1** — Redis outage during write → recovery → stale cache.
2. **B-02 P1** — direct PG role/school mutation → bootstrap cache behavior.
3. **R-A2 P1** — Redis Cluster retry exhaustion → restore → client recovery.
4. **B-04 P2** — multi-instance/container revocation journal durability.
5. **B-05 P2** — PG-live health-index vs authoritative PG.
6. **B-06 P2** — malformed PG_POOL_MIN/MAX configuration.
7. **B-03 P2** — PG fallback response freshness/source contract.
8. **R-A1 P2** — class roster projection/role matrix.
9. **R-A3 P3** — supported Redis HA configuration matrix.
10. **R-A4 P3** — run-owned temporary cleanup.
11. **B-07 P3** — shutdown/worker race.
12. Existing timeout/OTP/office findings: update existing records; do not duplicate.

## 4. Behavior of the two external auditors

### Replit — BLIND-DISCOVERY-AUDITOR
Strong points:
- independent repository-wide perspective;
- corrected its own earlier confidence overstatement;
- reconciled findings against current main;
- separated known findings from new candidates;
- explicitly listed false-positive caveats and remaining blind spots;
- did not claim certification.

Weakness / limitation:
- no live PG/Redis/CI execution in the audited environment;
- several findings remain synthetic/source-level;
- no repository writes.

### Bolt — CROSS-LAYER-ARCHITECTURE-CHALLENGER
Strong points:
- focused on interactions that single-layer audits can miss;
- built explicit state-transition and authority-conflict analysis;
- traced concrete multi-layer failure sequences;
- identified several genuinely additive cross-layer candidates;
- documented false positives rather than treating every suspicion as a defect.

Weakness / limitation:
- static analysis only; no PG/Redis runtime;
- several findings depend on deployment contracts or operational assumptions;
- it reported at `4acaf53`, so current-main reconciliation was necessary.

## 5. Governance result

These reports are **discovery evidence only**. No item above is VERIFIED.

The project remains:

**HARDENING / RECONCILIATION — NOT VERIFIED**

The canonical chain remains:

**External discovery → deduplicate → controlled reproduction → Atria remediation if confirmed → Hermes independent verification → ChatGPT reconciliation/decision.**
