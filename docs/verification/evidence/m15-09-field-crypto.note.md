# M15-09 Evidence — encryption-at-rest for sensitive tenant data (AES-256-GCM)

- **Verification id:** M15-09
- **Scope token:** `M15-09:FENC-BUCKET-POLICY`
- **Date:** 2026-11-12 (current HEAD)
- **Status:** the mechanism + the policy + THE STORE WIRING delivered (2026-11-14); the live MinIO apply + the SI-013 rotation + the hash-column activation prerequisite = the documented follow-ups.

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

## Delivered 2026-11-14 — the store wiring (the follow-up №1 closed)

- **`server/field-crypto-store.js`** (NEW) — the boundary wiring module:
  `encryptRowValues/decryptRowValues/encryptRows/decryptRows` + `storeSnapshotForPersist` +
  the test seam `__setForTests` (the `db.__setPoolForTests` pattern).
  **The default (no `PAYESH_FIELD_ENC_KEYS`) = full passthrough** — every existing
  suite/flow unchanged; the encryption activates ONLY with the key configured.
- **The persist boundary** (`server/db.js persistOpWithClient`): the users rows'
  phone/national_id = encrypted before the SQL params (the envelope in PG; the
  RAM mirror stays plaintext).
- **The read pipes** (db.js): `readCollection` / `readOne` / the capped hydrate =
  one decrypt pipe (`fcs.decryptRows`) — fail-closed on a tamper (a loud error,
  never a wrong plaintext).
- **The JSON snapshot boundary** (`server/index.js`): `loadStore` decrypts the
  users' sensitive fields on boot; the worker `getStore` + `persistStoreSync`
  serialize an ENCRYPTED snapshot clone (`storeSnapshotForPersist` — the live
  store object untouched).
- **The backfill tool** `tools/backfill-field-encryption.js` (NEW): the one-off
  migration of the existing rows — dry-run by default, `--apply` to write,
  fail-closed without a key, idempotent (the envelope rows untouched; the
  leftover plaintext rows pass through the reads — a partial run never breaks
  reads). Smoke: without a key = exit 2 (the loud refusal); with a key = the
  clean dry-run.
- **The wiring guard** `tests/m15-09-field-crypto-wiring.js` — **CHECKS 18 FAIL 0,
  exit 0**: Y1 the persist envelope (the plaintext absent from the SQL params) ·
  Y2 the static wiring of all five pipes + the unit round-trip · Y3 the tamper
  = FIELD_CRYPTO_DECRYPT_FAILED · Y4 the snapshot (the RAM untouched / the file
  ciphertext) · Y5 **the mutation negative** (a passthrough crypto injected →
  the plaintext in the SQL → the assertion flips → restored → the envelope
  again — the test depends on the real crypto being consulted) · Y6 the
  keyless child = the full passthrough.
- **The documented prerequisite for ACTIVATION** (unchanged): the equality
  lookup (auth.js's phone) needs the separate hash-column migration BEFORE the
  key goes live in production — the at-rest VALUE mechanism here is not a
  search index; activating without it breaks the phone login (documented in
  field-crypto.js L18 and here).

## Honest gaps (the remaining follow-ups)

- **The live MinIO apply:** the policy file + the apply commands = ready; the execution = on the S3 stack boot (or the production deploy where the real buckets exist) — owner-side infrastructure.
- **The SI-013 key provisioning:** the ROTATION event itself = the owner's (the BLOCKED-OWNER row 2); the key map = the consumer of whatever the rotated credentials produce.
- **The hash-column migration for the phone lookup** = the activation prerequisite (above) — the next repo-side step before the keys go live.
