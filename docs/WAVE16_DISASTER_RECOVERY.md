# Wave 16 — Disaster Recovery

**Wave:** 16 — Disaster Recovery (Roadmap §19) · **Owner:** Arena 4 + Arena 5
**Branch:** `arena/01a0867f-p2` · **Date:** 2026-09-09
**Status:** ✅ implemented (JSON-store path) · 🟡 PITR is PostgreSQL-side, see §6

> **Addendum rule:** every capability below is code in `server/dr.js` plus an executable
> drill (`scripts/dr-restore-drill.js`), verified by `tests/wave16-dr.js`.
> `docs/RELIABILITY_DR_PLAN.md` remains the *architecture* document; this is the
> *implementation* record and it says plainly what is real and what is posture.

ROADMAP §19 closes with: **"Backup داشتن بدون restore drill کافی نیست."** Before Wave 16
that sentence described us exactly — `server/admin.js` could write a snapshot and restore
it, and nothing ever proved the snapshot was restorable, intact, encrypted, or off-site.

---

## 1. Gap analysis (before → after)

| Roadmap requirement | Before Wave 16 | After Wave 16 |
|---|---|---|
| **RPO / RTO defined** | asserted in a design doc only | objectives in code + **achieved** RPO measured from the newest backup (`rpoStatus()`) |
| **Backup** | ✅ `admin.backupNow()` — atomic tmp+rename, 0600, retention 10 | unchanged (Wave 16 does not rewrite a working writer) |
| **Integrity** | ❌ none — corruption only found by a JSON parse at restore | ✅ SHA-256 manifest, self-healing from disk (`ensureManifest`, `verifyBackup`) |
| **Encryption** | ❌ plaintext PII (phone, national id) on disk | ✅ AES-256-GCM + scrypt, **fail-closed** without a key in production |
| **Off-site copy** | ❌ local disk only | ✅ checksum-verified copy; a target inside the data dir is **refused** |
| **PITR** | ❌ not addressed | 🟡 posture report; real PITR is PostgreSQL WAL archiving (§6) |
| **Restore test** | ❌ none | ✅ `restoreDrill()` — 8 timed phases incl. a **tamper test** |
| **Failover test** | ❌ none | ✅ checklist + drill evidence (§7); real multi-region failover needs Wave 15 |
| **Runbook** | ❌ none | ✅ `docs/RUNBOOK_DISASTER_RECOVERY.md` |

**Deliberate non-goals.** No new HTTP endpoint: a restore reachable over HTTP is a
data-destruction primitive, and the drill is an operator-run script instead. No change to
`server/admin.js`: the manifest is *derived* from the files on disk, so it can be rebuilt
even after the manifest itself is lost — a checksum database that cannot be regenerated is
just another thing to lose in the same disaster.

---

## 2. RPO / RTO

| Objective | Value | Source | Enforced by |
|---|---|---|---|
| **RPO** — max tolerable data loss | **300 s** (5 min) | `PAYESH_DR_RPO_S` | `rpoStatus()` compares the age of the newest backup |
| **RTO** — max tolerable recovery time | **900 s** (15 min) | `PAYESH_DR_RTO_S` | `restoreDrill()` measures restore phases and fails past the objective |

Both defaults match the approved figures in `docs/RELIABILITY_DR_PLAN.md` §1. Values are
clamped to 1…86400 s; a non-numeric or non-positive value falls back to the default rather
than silently disabling the check.

**The honest caveat:** on the JSON store the RPO is *exactly the backup interval*. Setting
`PAYESH_BACKUP_EVERY_HOURS=24` gives a 24-hour RPO no matter what `PAYESH_DR_RPO_S` says —
which is why `rpoStatus()` reports `breached: true` instead of trusting the configured
objective. A sub-5-minute RPO requires PostgreSQL streaming replication + WAL archiving
(Wave 1 / §6).

---

## 3. Integrity — SHA-256 manifest

`ensureManifest()` scans `data/backups/`, computes SHA-256 for every `payesh-*.json` that
has no entry, and drops entries whose file is gone. The manifest lives at
`data/backups/MANIFEST.json` — a name that matches neither the backup pattern nor the
archive pattern, so it can never be offered as a restorable backup.

`verifyBackup(name)` is the gate, and it checks **both** halves:

1. **Checksum** — recomputed from disk and compared with the manifest. A single flipped byte
   is `checksum_mismatch` (test `D3e`).
2. **Structure** — `users` non-empty and well-formed, `schools` non-empty, no orphan
   `classes.school_id`, and **no `__*` internal state leaked into the snapshot** (`D3c`,
   `D3i`).

Checking only the checksum would let a *consistent but wrong* file pass — e.g. a snapshot
written before a bad migration. Checking only the structure would let a truncated file pass.
Test `D3f` pins the combination: a structurally invalid file **whose checksum matches the
manifest** is still refused.

**The subtle part, and why `ensureManifest()` only ever adds entries.** A rescan must *not*
recompute the checksum of an archive that already has an entry. If it did, a tampered file
would simply acquire a new matching entry on the next scan and the checksum control would be
worthless. So the manifest holds the hash *as recorded when the archive was first seen*, and
`D3e2` pins that behaviour.

The honest consequence: if an archive is already modified **before its first scan**, the
manifest records the modified hash. Nothing derived from disk can do better — which is
precisely why the drill (§7) creates the archive and verifies it inside one run, and why
`§6` of the runbook says to copy `backups/` read-only *before* investigating a suspected
compromise.

---

## 4. Encryption at rest

| Property | Choice |
|---|---|
| Cipher | **AES-256-GCM** (authenticated — tampering is detectable, not just decryptable) |
| KDF | **scrypt** (N=16384, r=8, p=1) with a per-archive random 16-byte salt |
| IV | random 12 bytes per archive |
| Key | `PAYESH_BACKUP_KEY`, **≥ 16 characters**, never logged, never in the manifest |
| File | `payesh-…json.enc` = `PAYESHDR1` magic + 4-byte header length + JSON header + ciphertext, mode **0600** |
| Header | `{v, cipher, kdf, N, r, p, salt, iv, tag, plain_sha256, plain_size}` |

**Fail-closed:** in production, `encryptBackup()` without a key returns
`key_required_in_production` and audits `backup_unencrypted`. A plaintext archive full of
phone numbers and national ids may not be promoted to "off-site ready".

**Defence in depth:** decryption verifies the GCM auth tag **and** cross-checks the
plaintext SHA-256 against the header, so a header swap with a valid ciphertext body is also
caught. A rejected decrypt writes nothing to disk (`D4l`).

Why encrypt at all when the file is 0600? File permissions protect against other users on
one host. Backups leave that host — to object storage, to a laptop, to a support engineer.
`docs/RELIABILITY_DR_PLAN.md` §3 already requires AES-256 for the S3 tier; this makes it
true for the tier we actually run today.

---

## 5. Off-site copy

`copyOffSite(name)` copies the **encrypted** archive to `PAYESH_BACKUP_OFFSITE_DIR` and
verifies the copy by SHA-256. Two refusals worth calling out:

- `not_configured` — no target set. Reported, never faked.
- `target_inside_data_dir` — the resolved target is the data directory or a child of it.
  **An "off-site" copy on the same disk protects against nothing**, so the module refuses
  rather than reporting success. This is the fail-closed principle applied to a control that
  is easy to configure wrongly and hard to notice being wrong.

For real object storage the seam is a mounted path (rclone/s3cmd mount) — the checksum
verification is identical, and the runbook has the exact commands.

---

## 6. PITR

`pitrStatus()` reports the posture and nothing more:

| Mode | `pitr` | Meaning |
|---|---|---|
| `json-store` (no `DATABASE_URL`) | `false` | no WAL exists; RPO = backup interval |
| `postgres` (`DATABASE_URL` live) | `true` | PITR via `pgBackRest`/`WAL-G` archiving — **configured in `postgresql.conf`, not in this repo** |

This module can never enable WAL archiving; claiming otherwise would be a lie in a document
someone reads at 3 a.m. The exact `archive_command`, retention and validation steps are in
`docs/RUNBOOK_DISASTER_RECOVERY.md` §PITR.

---

## 7. The restore drill

`restoreDrill()` and `scripts/dr-restore-drill.js` run the same eight timed phases:

| # | Phase | What it proves |
|---|---|---|
| P1 | `snapshot` | the real snapshot writer produces the archive |
| P2 | `verify` | checksum **and** structure pass |
| P3 | `restore_isolated` | the archive parses into a usable store — **the live store is never touched** |
| P4 | `encrypt` | AES-256-GCM archive produced (or explicitly `skipped=no_key`) |
| P5 | `decrypt_roundtrip` | decrypted bytes are **byte-identical** to the original |
| P6 | `tamper_rejected` | one flipped ciphertext byte ⇒ `authentication_failed` |
| P7 | `tamper_wrote_nothing` | a rejected decrypt leaves no partial file behind |
| P8 | `offsite_copy` | the off-site copy verifies (or explicitly `skipped=not_configured`) |

Then: `restore_ms` (P2+P3+P5) is compared against the RTO objective and the drill fails if
it is exceeded.

### Why the tamper test asserts the *reason*

The first version of this drill named the tampered archive `….json.tampered.enc`. That name
does not match the archive pattern, so `decryptBackup()` rejected it during **name
validation** — the drill reported "tamper rejected ✅" while the cryptography was never
exercised. A green test that proves nothing is worse than no test. The drill now reads the
tampered archive by path and requires `reason === 'authentication_failed'`
(`tamper_reason` is printed in the report). Test `D8c` pins it.

### Failover test

Real multi-region failover needs Wave 15 (stateless deployment, health endpoints, graceful
shutdown) and a second data centre; it cannot be executed in this sandbox. What Wave 16
does provide is the *data* half of a failover, measured: a standby can take a verified,
encrypted archive and restore it inside the RTO. The remaining checklist — DNS/LB cutover,
session continuity, offline-queue catch-up — is in `docs/RUNBOOK_DISASTER_RECOVERY.md`
§Failover and is explicitly marked **not executed here**.

---

## 8. Verification (what was actually run)

| Check | Command | Result |
|---|---|---|
| DR suite | `node tests/wave16-dr.js` | see §9 |
| Mutation suite | `node tests/wave16-dr-mutations.js` | see §9 |
| Drill on the seeded store, **no key** | `node scripts/dr-restore-drill.js --data-dir /tmp/drdrill` | `PASS` — 4 phases + 3 explicitly skipped, restore 114 ms vs 900 s RTO, 1035 users / 6 schools / 86 collections |
| Drill on the seeded store, **with key + off-site** | `PAYESH_BACKUP_KEY=… PAYESH_BACKUP_OFFSITE_DIR=… node scripts/dr-restore-drill.js --data-dir /tmp/drdrill2` | `PASS` — all 8 phases, tamper rejected with `authentication_failed`, off-site archive 0600, restore 185 ms |
| Regression | `node tests/smoke.js` · `node tools/check-authz.js` · `node tests/secret-scan.js` | see §9 |

**Honest gaps:** no live PostgreSQL (so PITR is posture, not proof), no object storage (the
off-site seam is a verified filesystem copy), and no multi-region failover (needs Wave 15 +
a second site). Each is stated where it applies rather than implied by a green test.

---

## 9. Gate summary

- `tests/wave16-dr.js` — D1…D12 + deliverable checks
- `tests/wave16-dr-mutations.js` — mutation kills
- `node tests/smoke.js` → **547/547**
- `node tools/check-authz.js` → **exit 0**
- `node tests/secret-scan.js` → **11/11**

Roadmap deliverable mapping: **Backup** (§1) · **Off-site copy** (§5) · **Encryption** (§4)
· **PITR** (§6) · **Restore test** (§7) · **Failover test** (§7) · **Runbook**
(`docs/RUNBOOK_DISASTER_RECOVERY.md`).
