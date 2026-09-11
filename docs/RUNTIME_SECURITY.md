# Runtime Security Monitoring

## Purpose and boundary

`server/runtime-monitor.js` is a dependency-free, in-process **detection**
layer. It does not authorize requests, alter responses, or replace the WAF,
rate limits, tenant scope checks, or IDOR protections. Existing controls remain
the enforcement boundary; monitoring supplies an auditable signal for on-call
triage.

Each process maintains five fixed one-minute buckets (a rolling five-minute
baseline by default) for a closed set of roles and signals. The code accepts a
smaller bucket only in tests. A bucket alerts once when its accumulated value is
strictly greater than `mean + 3 × population-standard-deviation` of the prior
baseline buckets. This gives a conservative, noise-resistant detector rather
than an assertion that every spike is malicious.

## Signals and health contract

| Signal | Dimension | Input point |
|---|---|---|
| request rate | allowlisted role | completed HTTP response |
| auth error rate | allowlisted role | completed 401/403 response |
| response volume | allowlisted role | completed response byte count |
| tenant-switch rate | allowlisted role | authenticated session's tenant change |
| sync-operation rate | allowlisted role | `/api/sync` operation count |

`GET /api/health` exposes integer, 24-hour counters:

- `anomalies_detected_24h`
- `suspicious_sessions`
- `attack_patterns_blocked`

`/metrics` also exposes `payesh_runtime_anomalies_total`,
`payesh_suspicious_sessions`, and `payesh_attack_patterns_blocked`. The gauge
values are refreshed on scrape and health checks. Runtime alerts are declared in
[`monitoring/alert-rules.yml`](../monitoring/alert-rules.yml), a tracked alias
of the Prometheus-mounted `infra/observability/alert-rules.yml`.

## Privacy, safety, and limits

No raw URL, route parameter, record ID, IP, tenant ID, user ID, phone number,
JWT, payload, or session token is emitted by this monitor. Session and tenant
values are one-way, process-local digests solely to correlate a bounded entry;
they are never returned from `snapshot()` or `/api/health`. Role labels are a
closed allowlist, so telemetry cannot create unbounded Prometheus cardinality.

The series map and session LRU both have caps; stale session entries expire no
later than 24 hours (configurable downward for tests). Out-of-order events do
not rewrite closed buckets. All recorder callbacks are fail-safe so telemetry
failure cannot deny production traffic.

## Operational limits

This is per-process volatile state, not a cross-instance SIEM. A restart clears
its rolling history; a multi-instance deployment must aggregate Prometheus
counters and audit events, while retaining the local detectors. Treat alerts as
a triage trigger, correlate them with authorization/WAF outcomes, and follow
[RC-016](RUNBOOK_CARDS/RC-016.md). Configure the alerting destination outside
the repository; no webhook URL or credential is committed here.

## Verification

```sh
node tests/runtime-monitor.js
node tests/runtime-monitor-mutations.js
```

The regression suite proves the 3σ baseline, signal coverage, deduplication,
bounded/expiring state, redaction, and public health contract. Mutation tests
kill disabled threshold, deduplication, tenant-switch, and LRU-eviction mutants.
