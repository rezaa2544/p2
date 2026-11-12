# M15-04 Evidence — hybrid RBAC+ABAC fine-grained access control

- **Verification id:** M15-04
- **Scope token:** `M15-04:ABAC-ENGINE`
- **Date:** 2026-11-12 (current HEAD)
- **Status:** PARTIAL — the ABAC decision engine + the curated policies delivered; the per-API gate wiring = the documented follow-up.

## What existed

The RBAC layer = mature (server/policy.js = 704 lines = the curated authorization model; the generated authz/write-perms.json = the role→action map; the build gate = regenerates + diffs). The attribute-based conditions (the school_id/grade/exam_type) = NOT part of the decision — the cross-tenant checks = scattered, not policy-driven.

## Delivered this round

1. **`server/abac.js`** (NEW): `createAbac()` — the attribute rules ON TOP of the RBAC:
   - the policies = `authz/abac-policies.json` (the curated file, the schema `payesh-abac/v1`);
   - the decision = **deny-first over allow**; **no rule = `defer`** (the RBAC decides — the honest hybrid split, never an implicit allow);
   - the attributes: `school_id: 'self'` (the session's tenant; the superadmin = the cross-tenant by design), the `grade` lists, the `exam_type` lists;
   - **fail-closed**: the unreadable policy = `ABAC_POLICY_UNREADABLE` (the loud, never the silent allow); the every decision = a REASON + the rule id (auditability).
2. **`authz/abac-policies.json`** (NEW): the 5 curated rules (the final-years grade registration = the office-approval lane only; the national exams = the province path; the own-tenant allow; the example of the absolute management-report deny).
3. **The guard test** `tests/m15-04-abac.test.js` — **CHECKS 11 FAIL 0, exit 0**: B0 the load · B1 the deny-first · B2 the cross-tenant = the defer to the RBAC (the documented hybrid split) + B2b the own-tenant = the allow · B3 the superadmin = the cross-tenant · B4a/b/c the field conditions (the national/class/grade-out-of-list) · B5 the defer ≠ the implicit allow · B6 the fail-closed on the broken policy file · B7 the reason in the every decision.
4. **Mutation negative proof:** the deny-rule return = swallowed (the deny → the fallthrough) → **B1 red** (the deny became the allow — the final-years grades = registerable) — caught, reverted, 11/0 restored.

## Honest gap (the documented follow-up)

The **per-API gate wiring**: the `/api/v1` dispatcher (and the sync lane) must call `abac.evaluate()` AFTER the RBAC permit and BEFORE the handler — the deny = the 403 `abac_denied` + the audit entry. The engine = the pure function (no I/O on the hot path); the wiring = mechanical but touches the request path = its own change with its own verification (the false-green law: the mutation on a wired rule must show a 403 in an HTTP-level test).
