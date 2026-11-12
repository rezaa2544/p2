# A-38 Evidence — SSM parameter-store dependency removed; config is env-vars only

- **Verification id:** A-38 (issue #472)
- **Scope token:** `A-38:CONFIG-ENV-ONLY`
- **Date:** 2026-11-12 (current HEAD)

## Finding

The SSM/AWS parameter-store dependency is **already absent** on the current HEAD —
the removal itself landed with the #472 strict-verification-gate hardening. This
task verifies that state and adds a fail-closed guard so it cannot regress.

## Guard test (`tests/a38-config-env-only.test.js`)

**Result: CHECKS 6 FAIL 0, exit 0.**

| Guard | What it proves |
|---|---|
| G1 | `package.json` declares no `@aws-sdk/*` / `aws-sdk` / AWS dependency (runtime, dev, optional, peer) |
| G1b | `package-lock.json` contains no AWS SDK package entries (the actual tree) |
| G2 | No `SSM` / `GetParameter` / `PutParameter` / `ParameterStore` / `parameter-store` API references in server/tools/infra/scripts/tests sources (case-sensitive scan; the guard self-excludes its own pattern literals) |
| G3 | `server/index.js` reads `DATABASE_URL` and `REDIS_URL` from `process.env` (env-vars-only live wiring) |
| G4 | No AWS endpoint/region defaults in runtime config files (`server/db.js`, `server/redis.js`) |

## Notes

- The configuration surface of the running system is environment variables:
  `DATABASE_URL`, `REDIS_URL`, `PAYESH_*` (see docs/BACKEND_PRODUCTION_ARCHITECTURE.md);
  no parameter-store client, no AWS SDK in the dependency tree, no AWS endpoint
  defaults in runtime config.
- The docs mention `@aws-sdk/client-s3` only as a *hypothetical* pattern in an
  architecture note — it is not a dependency of this codebase.
- `A-38:CONFIG-ENV-ONLY — RUNTIME-VERIFIED` (guard executed, exit 0, on this HEAD).
