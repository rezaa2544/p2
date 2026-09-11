# Red Team Exercise — Q3 2026

**Exercise date:** 2026-09-11  
**Branch:** `feat/red-team-and-supply-chain`  
**Harness:** `node tests/red-team.js` (isolated JSON store and ephemeral local HTTP server)

## Objective and method

This exercise uses attacker-controlled HTTP requests rather than mock-only assertions. The tests were written before the CSRF remediation; the first `RT-09` run was red because a foreign `Origin` could submit an authenticated `POST /api/auth/logout`. The remediation is the small, fail-closed origin gate in `server/csrf.js`, dispatched before a body is read or a stateful API route is selected.

Every test uses a fresh copy of `server/data/payesh.json`, a generated JWT key, and temporary audit/OTP files. No production data, secrets, or persistent session state is used.

## Attack matrix

| ID | Attack | Adversary action | Required safe result | Result |
|---|---|---|---|---|
| RT-01 | Session replay | Reuse a cookie after logout | `401 no_session` | Blocked |
| RT-02 | JWT forgery | Present `alg:none` token claiming `superadmin` | `401 no_session` | Blocked |
| RT-03 | Tenant / IDOR | School 1 manager reads a School 2 student | `404 not_found`, not `403` | Blocked |
| RT-04 | Privilege escalation | Teacher creates a user through `/api/sync` | Per-operation or batch authorization denial | Blocked |
| RT-05 | OTP identity swap | Pair a valid OTP with another national ID | `401 nid_mismatch` | Blocked |
| RT-06 | Rate-limit enumeration | Repeated `send-code` for an unknown number | First two accepted; third `429 rate_limited` | Blocked |
| RT-07 | Sync forgery | Assert another actor in `op.by` | Whole batch `403 forged_by` | Blocked |
| RT-08 | SQL injection | Send `1' OR 1=1--` in an API query | WAF `403 waf_blocked`, no payload echo | Blocked |
| RT-09 | CSRF | Cross-origin cookie-authenticated logout | `403 csrf_origin_mismatch`; session remains live | Blocked after remediation |
| RT-10 | Information disclosure | Anonymous student record request | `401 no_session`, no name/phone/national ID | Blocked |

**Latest result:** `10/10 blocked`.

## CSRF control

`server/csrf.js` considers `POST`, `PUT`, `PATCH`, and `DELETE` below `/api/` state-changing. When a browser supplies `Origin`, it must equal the exact request scheme and host. For legacy requests with no `Origin` but a `Referer`, the referer origin must also match. A mismatch returns a minimal `403` response and an audit event containing only route, decision code, and IP; request content is never logged.

Requests with neither browser header remain compatible with offline/native and server-to-server integrations. They continue to require normal authentication, authorization, tenant-scope, field-gate, OTP, and rate-limit controls. Browser cookie requests retain `SameSite=Lax` as a second layer. Deployments should terminate TLS correctly and preserve the original `Host` header; production monitoring should alert on `csrf_denied` events.

## Mutation evidence

Run:

```bash
node tests/red-team-mutations.js
```

The four mutations are all killed by the attack path (not by source inspection):

1. remove `POST` from the state-changing methods;
2. remove the exact-origin comparison;
3. turn a foreign-origin denial into an allow decision;
4. ignore the `Origin` header.

Latest result: **4/4 killed**, followed by a clean restoration check.

## Operating requirements and residual risk

- The SQL injection scenario runs with `PAYESH_WAF_MODE=enforce`. The repository default remains `report` to preserve the existing staged rollout; a production deployment that relies on application-level WAF blocking must explicitly set `PAYESH_WAF_MODE=enforce` after observing false-positive telemetry.
- Signature/WAF matching is a compensating control, not a substitute for parameterized database queries and server-side schema validation. Both existing controls remain required.
- `Origin` and `Referer` are browser security signals. Header-less non-browser requests are intentionally supported, so API credentials, TLS, scoped authorization, and network boundary controls remain mandatory.

## Reproduction

```bash
node server/seed.js
node tests/red-team.js
node tests/red-team-mutations.js
```
