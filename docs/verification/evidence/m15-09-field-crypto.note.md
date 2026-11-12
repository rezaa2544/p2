# M15-09 Evidence — encryption-at-rest for sensitive tenant data (AES-256-GCM)

- **Verification id:** M15-09
- **Scope token:** `M15-09:FENC-BUCKET-POLICY`
- **Date:** 2026-11-12 (current HEAD)
- **Status:** PARTIAL — the mechanism + the policy delivered; the store-wiring and the live MinIO apply = the documented follow-ups.

## What existed before

- The backup-at-rest = already encrypted (server/dr.js: the AES-256-GCM + scrypt, the fail-closed) — the whole snapshot level.
- The **field-level** encryption for the live PII (the nid/phone in the store/PG) = absent: the at-rest rows = plaintext.
- The S3/MinIO bucket policy = absent.

## Delivered this round

1. **`server/field-crypto.js`** (NEW) — the AES-256-GCM field encryption:
   - the envelope `payesh-fenc:v1:<kid>:<iv>:<tag>:<ct>` — the kid-bearing = **rotation-ready for SI-013**: the new key = added to `PAYESH_FIELD_ENC_KEYS`, `PAYESH_FIELD_ENC_KID` = moved; the old rows = still decrypt via their kid;
   - the fail-closed: the missing/short key = `FIELD_CRYPTO_KEY_MISSING` (the loud, never the silent plaintext); the tamper = the GCM auth-tag failure (`FIELD_CRYPTO_DECRYPT_FAILED`); the unknown kid = `FIELD_CRYPTO_UNKNOWN_KID`;
   - the non-deterministic (a fresh IV per call) — no PII equality oracle in the ciphertext;
   - the honest boundary: the equality LOOKUP (the auth.js's phone) = a separate hash column — this module = the at-rest VALUE encryption, not a search index.
2. **`infra/minio/bucket-policy.json`** (NEW, valid JSON): the DenyInsecureTransport (the TLS-only), the DenyPublicReads (the private-by-default), the RequireServerSideEncryption (the SSE-AES256 on the put). The apply = `mc anonymous set none` + `mc admin policy set` documented in the note; the staging MinIO server = not currently up (the PG-HA/Redis-HA stacks only), the live apply = blocked on the S3 stack boot.
3. **The guard test** `tests/m15-09-field-crypto.test.js` — **CHECKS 12 FAIL 0, exit 0**: F1 the round-trip · F2a no plaintext leak in the envelope · F2b the non-determinism · F2c the kid = in the envelope · F3 the tamper = rejected · F4 an unknown kid = loud · F5a/b/c the rotation (the old rows readable, the new writes = the new kid, the 2-key map) · F6a/b/c the key contract (the KEY_MISSING fail-closed + the explicit dev passthrough).
4. **Mutation negative proof:** the key fail-closed mutated away (`if (required)` → `if (false)`) → **F6b red** (the missing-key encrypt = silently passthrough) — caught, reverted, 12/0 restored.

## Honest gaps (the documented follow-ups)

- **The store wiring:** field-crypto = the primitive; wiring it into the persist/hydrate boundary (the index.js's store persistence + the db.js's the user rows) + the backfill migration of the existing rows = the next step (the riskier surgery — the separate change with its own verification).
- **The live MinIO apply:** the policy file + the apply commands = ready; the execution = on the S3 stack boot (or the production deploy where the real buckets exist).
- **The SI-013 key provisioning:** the ROTATION event itself = the owner's (the BLOCKED-OWNER row 2); the key map = the consumer of whatever the rotated credentials produce.
