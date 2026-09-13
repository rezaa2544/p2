# Runtime Attack Patterns

## Detector boundary

`server/attack-detector.js` consumes bounded runtime facts and emits one
redacted event per actor/pattern/window. It is intentionally not a substitute
for policy enforcement: scope checks, IDOR controls, login throttles, and WAF
blocks make access decisions. `server/abuse-guard.js` is the common alert egress
boundary: every detector finding attempts a structured audit record, increments
a bounded metric, updates the health counter, and posts an optional HTTPS
webhook. Delivery errors are fail-safe and must not impact a request.

The detector only retains TTL-bounded internal hashes. It never emits raw IPs,
sessions, phone numbers, path values, record IDs, tenant IDs, or request bodies.
Webhook and audit payloads contain fixed pattern/severity/count/timestamp fields
only. `PAYESH_RUNTIME_ALERT_WEBHOOK` is optional deployment configuration and
must be an HTTPS, non-loopback destination; it is never stored in the repo.

## Signatures

| Signature | Evidence in bounded window | Primary existing control | Response |
|---|---|---|---|
| `sequential_id_enumeration` | ascending `/api/students/:id` identifiers | IDOR scope + R97 enumeration guard | revoke/slow session if existing control reaches its stage; RC-016 |
| `rapid_login_failures` | one source fails across distinct submitted users | IP/phone login throttles + OTP limits | edge block/rate-limit review; RC-016 |
| `cross_school_access` | repeated stable `out_of_scope`/school mismatch responses | tenant scope policy | verify scope and revoke suspected session; RC-016 |
| `bulk_export` | repeated export endpoint requests | authorization/WAF/rate controls | halt export path at edge if needed; RC-016 |
| `forged_sync_metadata` | stable forged ownership/author/school code | sync ownership validation | revoke session and preserve audit trail; RC-016 |
| `waf_blocked` | enforced WAF block observed | WAF enforce mode | correlate with pattern and tune only after review |

A signature is emitted once per actor and pattern during the configured window;
repeated evidence remains counted internally but does not create alert storms.
`attack_patterns_blocked` counts detected signature events associated with a
denied/blockable attack attempt, not a claim that a report-only WAF stopped every
request. Turn on `PAYESH_WAF_MODE=enforce` where the deployment decision permits
an enforcement action.

## Alert and incident workflow

Prometheus rules `AnomalyDetected`, `AttackPatternSignature`, and
`SuspiciousSession` are in `monitoring/alert-rules.yml`. Alertmanager and the
runtime egress webhook require an on-call destination injected by deployment;
the repository deliberately contains only a placeholder. Record only a trace
ID, fixed pattern, bounded count, and time in the incident channel. Never copy
tokens, tenant IDs, IPs, phone numbers, or payloads from application logs.

```sh
node tests/attack-detector.js
node tests/attack-detector-mutations.js
```

The tests cover all five requested signatures, redaction, deduplication,
audit/metric/webhook egress, and six killed detector/egress mutations.
