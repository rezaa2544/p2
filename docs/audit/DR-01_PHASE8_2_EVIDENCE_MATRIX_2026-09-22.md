# DR-01 / Phase 8.2 Evidence Matrix — 2026-09-22

Repository: rezaa2544/p2
Latest verified main SHA at reconciliation: 7fb6a3a6495a613ae41a44a50d78d80908ef1493
User-supplied SHA: 62c18cc3fd4791666ecec3bc1616f07faadde9fe
Main divergence: current main is 32 commits ahead of the supplied SHA; no DR/HA implementation files used by DR-01 are changed in the current comparison.

## Evidence contract

Every status is tied to SHA + command + run + environment + result. A historical runtime run is not silently relabeled as a current-HEAD runtime run.

| Area | SHA | Command / scenario | Run | Environment | Result | Classification |
|---|---|---|---:|---|---|---|
| DR-01 clean verify | 2211ba45903cb4f967adcad71271178d201361c5 | pgbackrest --stanza=payesh verify | 1 | PostgreSQL 17.11, pgBackRest 2.55.1, single-host E3 lab | exit 0, no invalid findings | E3 PASS |
| DR-01 corruption detection | 2211ba45903cb4f967adcad71271178d201361c5 | corrupt 16B bundle file, then verify | 3 | same E3 lab | status: invalid, invalid checksum, 973/974 valid, exit 0 in all runs | DR-01 CONFIRMED |
| DR-01 restore safety | 2211ba45903cb4f967adcad71271178d201361c5 | pgbackrest restore on corrupted repo | 2 | same E3 lab | exit 29, zlib data error; fail-closed | E3 PASS |
| DR-01 independent re-check | 2211ba45903cb4f967adcad71271178d201361c5 | repair + re-verify + independent PITR | 2 | same E3 lab | clean re-verify; identical PITR md5 693f2e13... | E3 PASS |
| PITR | 2211ba45903cb4f967adcad71271178d201361c5 | time-target restore, separate dirs | 2 | 2-vCPU / 1,984 MB, 58k-row E3 lab | RTO 502ms / 510ms, RPO 0, identical md5 | E3 VERIFIED |
| Redis HA | 2211ba45903cb4f967adcad71271178d201361c5 | two Sentinel failovers + quorum-loss/heal | 2+ | same single-host E3 lab | RTO 3250ms / 2601ms; RPO 0 | E3 VERIFIED |
| S3 alert/on-call | Current evidence | alert → receiver → on-call → ack → runbook → recovery | 0 | no production-equivalent E4 evidence supplied | live receiver/on-call/ack/MTTA/MTTR evidence remains missing | NOT VERIFIED / BLOCKER |
| S4 PG+Redis restore/failover | Current evidence | production-equivalent restore/promote/failover | 0 | no multi-host E4 topology | only isolated E3 evidence exists | E4 NOT VERIFIED / BLOCKER |
| RPO/RTO | 2211ba45903cb4f967adcad71271178d201361c5 | PITR / crash / Sentinel drills | multiple | single-host E3 lab | measured locally; no formal repository SLO threshold exists | E3 evidence; owner decision required |

## Current-main reconciliation

The requested SHA 62c18cc... is not the current main. GitHub comparison shows:

- base: 62c18cc3fd4791666ecec3bc1616f07faadde9fe
- head: main → 7fb6a3a6495a613ae41a44a50d78d80908ef1493
- main is 32 commits ahead, 0 behind.
- None of the files changed between those commits are the DR/HA implementation files used by DR-01; therefore the DR-01 code path is unchanged across that delta.
- A separate comparison from the audited DR/HA SHA 2211ba45... to current main also shows no DR/HA implementation file changes.

Runtime limitation: this reconciliation environment has GitHub repository access but no executable pgBackRest lab/host. Therefore the 3/3 corruption run is not falsely reported as a fresh runtime execution at f5e75955. It is current-code-equivalent E3 evidence carried from 2211ba45..., with the unchanged-code chain explicitly recorded above. A fresh pgBackRest run on 7fb6a3a remains an evidence-refresh item.

## DR-01 decision boundary

pgBackrest verify is an upstream tool contract, not a repo-owned gate in the current repository. The repo-owned PITR path in tools/pitr-restore.sh performs restore and then invokes the repo-owned tools/pitr-verify.sh; it does not use the raw pgBackRest verify exit code as its acceptance gate.

Therefore no wrapper/non-zero-exit code change is made in this task. Governance requirement: any future gate that invokes pgBackrest verify must parse semantic output/status and must not treat exit code 0 alone as proof of backup integrity.

## Phase 8.2 / Production boundary

| Decision item | Current truth |
|---|---|
| Phase 8.2 S2 | PARTIAL / delivered evidence exists |
| S3 alert/on-call/recovery E4 | NOT VERIFIED |
| S4 restore/failover E4 | NOT VERIFIED |
| DR-01 | CONFIRMED / OPEN as tooling-contract risk; not a repo-owned bug |
| RPO/RTO | E3 measurements exist; formal acceptance SLO is an owner decision |
| E3 | VERIFIED for the documented single-host drills |
| E4 | NOT VERIFIED |
| Phase 8.2 Exit | NOT VERIFIED / NOT ISSUED |
| Phase 8.3 | BLOCKED |
| Production GO | NOT DECLARED |

## Blockers / ownership

Repo-owned blockers
1. Ground-truth documents contained stale SHA/CI assertions; this reconciliation repairs the documentation source of truth.
2. Final Phase 8.2 evidence package still needs a current-SHA, run-ID-backed exit matrix before any status promotion.
3. Future automation must explicitly parse pgBackrest semantic verification output if it uses that command.

External blockers
1. S3/object storage + real credentials / independent backup failure domain.
2. Genuine multi-host E4 topology and independent failure domains.
3. Production-scale dataset/hardware for credible RPO/RTO and Phase 8.3 evidence.
4. Real inter-host network partition/failover environment.

Owner Decision Required
1. Adopt D1: semantic parsing for any future pgBackrest verify gate.
2. Ratify formal RPO/RTO SLO thresholds.
3. Provision E4 infrastructure and real off-site storage/credentials.

## Five-pass record

The DR evidence package already contains five independent dimensions: functional backup, clean/boundary verification, failure injection, restore resilience, and independent re-run/PITR. These are historical E3 runs at 2211ba45...; the current 7fb6a3a runtime re-run is still required for a fresh current-SHA execution record.

No Production GO is inferred from E3 evidence.

## Final observed snapshot

The final observed operational baseline for this reconciliation is `7fb6a3a6495a613ae41a44a50d78d80908ef1493`. The later commits in the repository are documentation-only reconciliation commits; they do not change the DR-01 implementation path. Fresh current-runtime pgBackRest evidence remains missing.
