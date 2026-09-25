# Arena 8 — contract, 2026-09-22
Baseline ecc8b40b5d533d77c6ebad63ca0854119873c504, main. Independent audit; no repository edits.
Owner: Arena 8 evidence; Coding team fixes; Tech Lead integration and infrastructure authorization.
Out of scope: production traffic, project modifications, capacity certification, reconstructed historical code.

Five tasks: T1 measurement provenance/CI; T2 capacity probe correctness; T3 k6 workload/failure integrity; T4 resource/bottleneck candidates; T5 scalability and missing benchmark reconciliation.
Acceptance: each conclusion traceable to current code or executable evidence, not guessed capacity. Runtime capacity acceptance needs authorized realistic service/database/cache workload and resource telemetry, unavailable at intake.
Required evidence: SHA, lines, commands, environment, inputs, expected/actual, exit, runs, evidence type. Store artifacts outside repository.
Passes per task: normal; boundary; negative; concurrent/recovery; independent regression. Unexecuted passes remain NOT VERIFIED or BLOCKED with reason; static inspections do not substitute for benchmark/recovery execution.
Plan: inspect current policies and code; execute real capacity-probe CLI against disposable loopback fault fixture only (not application benchmark); test zero-work and malformed CLI; inspect k6 suites and CI; inspect resource paths; reconcile final HEAD and deliver measurement gaps. No claim of completed 25 runtime passes.
Dependencies: Node >=22 (sandbox default initially Node20); k6/PG/Redis and authorized E4 topology not supplied. Install isolated Node22 for probe reproduction only. No application load will target external hosts.
