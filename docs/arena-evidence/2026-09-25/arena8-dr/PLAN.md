# Arena 8 DR task contract
Date 2026-09-23 (user timezone). Baseline 172da62b63f70d406ffad69893851a01b042ffc4 main. Exactly five tasks:
T1 PostgreSQL backup/restore/PITR: trace and test current scripts, target correctness and WAL boundary.
T2 PostgreSQL promote/failover/data-integrity: inspect promote/fencing, compare committed identity/dataset on separate local restore target where feasible.
T3 Redis backup/restore/failover: real local binaries, archive contents, corruption, target dataset, locking/failover scripts.
T4 S3/off-site integrity and identity: inspect fail-closed behavior and local negative control; no external network backup actions without authorized target.
T5 RPO/RTO evidence: inspect measurement implementations and runbooks; capture monotonic timestamps for local operations only. No production timing inference.
Common passes: functional, boundary, failure injection, concurrency/resilience/recovery, independent rerun. Critical findings need two independent runs. Nonexecuted passes remain BLOCKED/NOT VERIFIED with explicit dependencies. No artificial five-pass completion.
Owner: Arena independent testing/evidence, coding team remediation, Tech Lead reconciliation, Infrastructure owner E4 topology/credentials/S3/on-call and SLO decisions.
Scope excludes source edits, production writes, arbitrary targets, commit/push, roadmap promotion. More recent policy Rule30 requires coding/commit closure but explicit user role forbids implementation: hand off defects, do not silently fix.
Dependencies: local binary availability; optional isolated installation outside workspace, ephemeral lab under /tmp with durable evidence under /home/user/arena8-dr. Workspace must stay under 100MB; no project npm dependencies installed. E4 topology/credentials are not supplied. No secrets read or logged.
Acceptance: actual backup artifact, expected dataset manifest, source/target identity, checksum compare, correct WAL cutoff and promotion, application-level consistency, failure behavior; two runs per critical claim. E4 requires independent failure domains, approved target credentials, workload, fault plan and recovery/on-call evidence. Local successful execution is at most E3.
Required evidence/output: SHA, path/lines, exact commands, sanitized environment/input, expected/actual, exit, runs, timestamps, classification; full ledger, findings, 5x5 pass matrix, roadmap impact and final HEAD reconciliation.
