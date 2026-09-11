# Supply Chain Audit — Q3 2026

**Audit date:** 2026-09-11  
**Lockfile:** `package-lock.json` (lockfile v3)  
**Lockfile SHA256:** `bbf621178e16d91511d65c6deb98eb5abc17ba81b51f136be080c128a623e047`

## Scope

The audit covers the npm production dependency graph locked in `package-lock.json`, its declared third-party licenses, and reproducibility/drift controls. The inventory contains **126 third-party resolved packages** plus the Payesh root package.

## npm audit result

Command run:

```bash
npm audit --omit=dev --json
```

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Info | 0 |
| **Total** | **0** |

The complete machine-readable snapshot is [`NPM_AUDIT_2026_Q3.json`](NPM_AUDIT_2026_Q3.json). This is a point-in-time result; npm advisory data changes, so it must be re-run in CI and before release.

## SPDX SBOM

[`SBOM.spdx.json`](SBOM.spdx.json) is a valid SPDX 2.3 JSON document generated from the lockfile. It contains:

- root package identity;
- all 126 resolved third-party packages;
- locked version, declared/concluded license, npm PURL, and integrity-derived checksum where available;
- `DEPENDS_ON` relationships for direct runtime and development dependencies; and
- a lockfile fingerprint annotation.

Regenerate after an approved dependency update:

```bash
node tools/supply-chain-audit.js --write
```

## Third-party licenses

The generated complete inventory is [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). License distribution at audit time:

| License | Packages |
|---|---:|
| MIT | 93 |
| Apache-2.0 | 20 |
| ISC | 6 |
| BSD-2-Clause | 2 |
| BSD-3-Clause | 2 |
| CC0-1.0 | 1 |
| MIT-0 | 1 |
| Public Domain | 1 |
| Unknown / NOASSERTION | **0** |

No license exception was identified from lockfile package metadata. Legal review remains required for a new license family or an upstream license change.

## Dependency drift detection

[`DEPENDENCY_DRIFT_BASELINE.json`](DEPENDENCY_DRIFT_BASELINE.json) records the full lockfile SHA-256, package count, lockfile format, and every direct dependency's declaration and locked resolution. The gate checks that the lockfile, SBOM, licenses, audit snapshot, and baseline still agree:

```bash
node tools/supply-chain-audit.js --check
node tests/supply-chain.js
```

The regression test deliberately changes the in-memory lockfile text by one byte and confirms that the SHA-256 drift gate fails. This prevents unreviewed `package-lock.json` edits, stale SBOMs, or a missing direct dependency resolution from silently reaching a release.

## Release policy

1. Use `npm ci` rather than an unlocked install in CI/release jobs.
2. Run `npm audit --omit=dev --json` and retain an updated snapshot.
3. Require `node tools/supply-chain-audit.js --check` and `node tests/supply-chain.js` to pass.
4. Regenerate SBOM, license inventory, and baseline in the same reviewed change as any approved lockfile update.
5. Treat any critical/high advisory, unresolved license, or drift failure as a release blocker until triaged and documented.
