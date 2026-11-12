# A-32 Evidence — no hardcoded endpoints or secrets in the source

- **Verification id:** A-32
- **Scope token:** `A-32:NO-HARDCODED-CONFIG`
- **Date:** 2026-11-12 (current HEAD)

## Ground truth at verification

A full source scan (server/, scripts/, src/) on the current HEAD:

- **Secrets:** none. The only secret-shaped literals are (a) a multi-line comment
  in `server/index.js` documenting a REMOVED demo-generator anti-pattern
  (`password: '123456'` was stripped at load — the comment explains the strip),
  and (b) a sentinel token value (`otp-store.js` `token = 'no-lock'` — a lock
  marker, not a credential).
- **Endpoints:** no external endpoint configuration anywhere. The only URL
  literals are the `new URL(relative, base)` parse placeholders
  (`http://csrf.local`, `http://waf.local` — never fetched), the SVG XML
  namespace identifier (`http://www.w3.org/2000/svg` — an identifier, not an
  endpoint), and one demo seed row (`shad.ir` virtual-class sample data — never
  fetched at runtime).
- **JWT secret:** env-only (the N-06 boot gate owns `PAYESH_JWT_SECRET`; no
  fallback literal exists in the server).

## Guard test (`tests/a32-no-hardcoded-config.test.js`)

**Result: CHECKS 3 FAIL 0, exit 0.**

| Guard | What it proves |
|---|---|
| G1 | No secret-shaped literals in server/ + scripts/ source (comment-stripped scan; the documented anti-pattern comments do not trigger) |
| G2 | No external endpoint URLs in src/ outside the documented demo-seed/namespace/parse-placeholder allowlist |
| G3 | No JWT-secret fallback literal anywhere in the server |

**Mutation negative proof (False-Green Law):**
- M1 — planted `password: 'hunter2secret'` in server/csrf.js → **caught** (G1 red, exit 1). The first M1 run was NOT caught — it exposed a real guard bug (a `/g`-flagged regex carries `lastIndex` between the raw-line and comment-stripped `.test()` calls, silently missing the match). The regex was fixed to a stateless `/i` and the mutation re-run: caught. This is exactly the value of mutation proofing.
- M2 — planted `https://evil.example.com/api` in src/js/48-bus-service.js → **caught** (G2 red, exit 1).

Both mutations reverted; final state 3/0.

## Notes

- `A-32:NO-HARDCODED-CONFIG — RUNTIME-VERIFIED` (guard executed, exit 0; both mutations caught).
- The canonical runner discovers `tests/*.test.js` root tests automatically; this
  battery runs in CI from this push.
