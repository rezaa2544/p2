# Arena 11 — Production Readiness Auditor — DR / HA / Backup / Restore / RPO/RTO / E3–E4

## 1. Identity

| Item | Value |
|---|---|
| Arena ID | Arena 11 — Production Readiness Auditor |
| Task | DR, HA, Backup, Restore, RPO/RTO, E3/E4 classification, Operational Risks |
| Date | 2026-09-22 (Asia/Tehran) |
| Repository | `rezaa2544/p2` |
| Branch | `main` == `origin/main` (ahead/behind 0/0) |
| Current HEAD | `ecc8b40b5d533d77c6ebad63ca0854119873c504` |
| Evidence tier achievable here | **E3 only** (single host, single kernel `6.1.158+`, `e2b.local`, 2 vCPU / 1,984 MB) |
| Toolchain | Node v22.21.1 · PostgreSQL 17.11 · pgBackRest 2.55.1 · Redis 8.0.2 + redis-sentinel 8.0.2 |
| Governing rule | **E3 ≠ E4 — local evidence is NOT production proof** |

---

## 2. Production Checklist

| # | Checklist item | Finding at Current HEAD | Status |
|---|---|---|---|
| 1 | Canonical CI gate green | Node.js CI run `35657129976` on HEAD = **failure** (`npm test` → smoke.js ENOENT) | ❌ NOT READY |
| 2 | pgBackRest full backup succeeds | reproduced: exit 0, ~2.2s | ✅ E3 |
| 3 | pgBackRest incremental (true delta) | reproduced: `_…I` set, delta stored | ✅ E3 |
| 4 | pgBackRest verify detects corruption | reproduced: `invalid checksum`, `checksum invalid: 1` | ✅ E3 |
| 5 | **verify exit code on corruption** | reproduced: **exit 0** (false green) → **DR-01 OPEN** | ⚠️ DR-01 |
| 6 | pgBackRest restore fails closed on corruption | reproduced: **exit 29** (`Data corruption detected`, 2 retries) | ✅ E3 |
| 7 | Restore identity (md5 identical) | reproduced: `6c190b3f…` == source, 50,000/50,000 rows | ✅ E3 |
| 8 | PG crash recovery (kill -9) | reproduced: restart OK, 50,000 rows intact, ~1.1s wall | ✅ E3 |
| 9 | Streaming standby + promote | reproduced: `state=streaming`, promote ~1.1s, 0 rows lost | ✅ E3 |
| 10 | WAL disk-full drill (real ENOSPC) | reproduced: FATAL `No space left on device`, RTO 30.2s, RPO 0 | ✅ E3 |
| 11 | Sentinel HA topology (1M+2R+3S, quorum 2) | reproduced: `connected_slaves:2`, quorum OK | ✅ E3 |
| 12 | Sentinel automatic failover | reproduced: kill -9 master → new master **RTO 3,325 ms**, 2000/2000 keys, RPO 0 | ✅ E3 |
| 13 | Redis replica read-only guard | configured (`replicaof`) | ✅ (unit tests) |
| 14 | `redis-backup.sh` SAVE+BGREWRITEAOF | reproduced against real Redis: dump+appendonlydir written | ✅ E3 |
| 15 | `redis-backup.sh` lock contention exit | reproduced: **exit 75** (F-QA-08 fixed at HEAD) | ✅ E3 |
| 16 | RDB backup actually loads | reproduced: restored dbsize 2000, canary `k42`→`v42` | ✅ E3 |
| 17 | `failover-postgres.sh` split-brain guard | reproduced: refuses live/duplicate primary (exit 1) | ✅ E3 |
| 18 | `failover-redis.sh` healthy-master guard | reproduced: refuses manual failover on live master (exit 1) | ✅ E3 |
| 19 | Server-side restore drill (`server/dr.js`) | reproduced: PASS (snapshot→verify→encrypt→tamper-reject→RPO 0) | ✅ E3 |
| 20 | Migration chain 001→020, 113 tables | reproduced (`infra/wal-drill/bootstrap.sh`, all 20 applied) | ✅ E3 |
| 21 | Alert rules (Prometheus) | `alert-rules.yml`+`alerts.yml` valid, no hardcoded secrets (tests 63/63, 28/28) | ✅ config-only |
| 22 | Alertmanager real receiver wired | `__WEBHOOK_URL__` placeholder only — no live receiver | ⚠️ NOT WIRED |
| 23 | Off-site / S3 backup repository | `repo1-path` local POSIX only; `aws` ABSENT | ❌ EXTERNAL |
| 24 | Multi-host / independent failure domains | single KVM guest, shared PID namespace | ❌ EXTERNAL |
| 25 | Network-partition-capable testbed | loopback-only | ❌ EXTERNAL |
| 26 | Production-scale (10M rows) RPO/RTO | 58k-row class dataset only | ❌ EXTERNAL |
| 27 | Formal RPO/RTO SLO ratified | none exists to compare against (D4) | ⚠️ OWNER DECISION |
| 28 | `phase8.2-verified` tag CI-backed | tag on `401d02b2`, 8 behind HEAD, 0 green CI | ❌ NOT READY |

---

## 3. Verified Items (reproduced in this mission on Current HEAD)

| Layer | Evidence | Level |
|---|---|---|
| pgBackRest backup/incr/verify/restore identity/crash-recovery chain | full cycle executed: full → incr → corrupt → verify-detect → restore-fail-closed(29) → repair → verify-clean → restore → md5 match | **E3 VERIFIED** |
| PostgreSQL streaming replication + promotion (RPO=0) | `pg_basebackup -R`, `state=streaming`, marker row streamed, promote 1.1s, `pg_is_in_recovery()=f`, writes accepted, 0 data loss | **E3 VERIFIED** |
| WAL disk-full (real ENOSPC/FATAL) + recovery | real tmpfs ENOSPC, `FATAL: could not write to file … No space left on device`, free space → restart → **RTO 30.2s**, checksum identical, **RPO 0**; replica catch-up (W4) and RPO-to-replica (W5) reproduced | **E3 VERIFIED** |
| Redis Sentinel 1M+2R+3S failover | kill -9 master PID → Sentinel promoted `:56030` in **3,325 ms**, 2000/2000 keys, canary intact, writable | **E3 VERIFIED** |
| Redis durability boundary | `WAIT 2 2000` → **2**; both replicas dbsize=2000 | **E3 VERIFIED** |
| Redis backup + restore + lock-guard | `redis-backup.sh` → RDB/AOF; RDB loaded by fresh server (dbsize 2000); flock exit **75** | **E3 VERIFIED** |
| Repo failover tool guards | `failover-postgres.sh` and `failover-redis.sh` both exit 1 on split-brain/healthy-master conditions | **E3 VERIFIED** |
| Server-level DR contract | `tests/wave16-dr.js` **75/75** · `scripts/dr-restore-drill.js` PASS (AES-256-GCM round-trip, tamper rejected, RPO 0) · `tests/dr-runbook.js` **38/38** | **E3 VERIFIED** |
| Observability config hygiene | `observability-config.js` 63/63 · `observability-s2-metrics` 4/4 · `observability-live-setup-coverage` 28/28 | **E3 VERIFIED** |

**DR-01 re-confirmed independently (3/3 trials, this lab):** `pgbackrest verify` reports `invalid checksum '…/pg_data/base/16384/16386.zst'`, `status: invalid`, `checksum invalid: 1` — **while exiting 0** and logging `verify command end: completed successfully`. `restore` fails closed with **exit 29**. This matches the Chat 4 finding exactly, on the same tool versions, on Current HEAD's toolchain (pgBackRest 2.55.1). **Any future gate keying on `verify`'s exit code alone is a false green.**

---

## 4. Blockers (Blocking Production Readiness)

| ID | Blocker | Because | Class |
|---|---|---|---|
| B-01 | **CI gate is RED at HEAD** (`npm test` fails) | reproduced: `tests/smoke.js` reads moved `TODO_BEFORE_PRODUCTION.md` → 546/547 exit 1; CI run `35657129976` confirms | **P0 code** |
| B-02 | No off-site/immutable backup target | `pgbackrest repo1-path` is local POSIX `/var/tmp`-class path; `aws` ABSENT; no S3 bucket | Owner/Infra |
| B-03 | No multi-node cluster (`docker`/`kubectl` ABSENT) | E4 topology (independent failure domains) impossible | Owner/Infra |
| B-04 | No real network partition capability | loopback only; split-brain "proof" is simulated, not network-real | Owner/Infra |
| B-05 | No 10M-row national dataset / prod hardware | RPO/RTO numbers (3.3s Redis, 30.2s WAL, ~1.1s PG promote) are 58k-row-class; must not be extrapolated | Owner/Infra |
| B-06 | No ratified RPO/RTO SLO | docs state *policy ceilings* (PG ≤5/≤15min; Redis ≤1/≤5min; regional ≤30min/≤4h); no SLO document for acceptance measurement (D4) | Owner decision |
| B-07 | Alert→on-call→ack→recovery chain not operatinally proven | canonical configs exist, but webhook is a placeholder; no MTTA/MTTR/acknowledgement evidence | Owner/platform |

---

## 5. External Dependencies (Owner decision required)

| ID | Dependency | Needed for | Action by |
|---|---|---|---|
| D-01 | S3/object storage + IAM + keys | off-site encrypted backup, immutability, region DR | Infrastructure owner |
| D-02 | Genuine multi-host E4 environment (independent failure domains, real NICs) | true partition/Split-brain proof, cross-host PITR | Infrastructure owner |
| D-03 | Production-class hardware + 10M-row seed | credible RPO/RTO + capacity (Phase 8.3) | Infrastructure + DBA |
| D-04 | Ratified RPO/RTO SLOs (acceptance thresholds) | turn measurements into pass/fail | Product/SRE owner |
| D-05 | Real alerting receiver (Matrix/Slack/webhook) + on-call roster | S3 alert→on-call→ack→runbook drill (M1) | Platform owner |
| D-06 | Decision on `pgbackrest verify` usage in gates | DR-01 — must parse output (`status: invalid`/JSON), never exit code | DR/Platform owner |

---

## 6. E3 / E4 Classification

| Area | E3 | E4 |
|---|---|---|
| PostgreSQL backup / incr / verify / corruption-detect / restore / identity / PITR-equivalent / crash recovery | **VERIFIED** (real binaries, real WAL, real corruption, real kill -9) | **NOT VERIFIED** |
| Redis Sentinel failover / quorum / split-brain-guard / backup-restore | **VERIFIED** (real processes, real kill -9, real sentinel consensus) | **NOT VERIFIED** |
| RPO/RTO measurements | **MEASURED on 58k-row single host** (PG promote ≈1.1s, RPO 0 · WAL drill RTO 30.2s RPO 0 · Redis failover RTO 3,325ms RPO 0) | **NOT MEASURED** (no prod scale) |
| DR-01 verify false-green | CONFIRMED / OPEN (upstream tool) | — |
| Multi-host DR / HA / regional DC / network partition / off-site restore | — | **E4 NOT VERIFIED** |
| Production HA proof | **NOT ESTABLISHED** | NOT ESTABLISHED |

**E3 ≠ E4.** Every drill in this report ran as co-located processes on one kernel and one filesystem. They prove the *procedure and data path*; they do **not** prove the *infrastructure* survives host/rack/zone failure. Nothing here is promoted to E4.

---

## 7. Operational Risks (ranked)

1. **Critical — canonical CI gate red while team cites green evidence.** HEAD has no green Node.js CI; any "VERIFIED at HEAD" statement that doesn't carry this caveat is misleading. (See Arena deep-verification report of earlier today for the full masked-failure timeline.)
2. **Critical — DR-01 residual.** pgBackRest `verify` exit-0-on-corruption will silently bless code that keys on exit status. No repo gate does today (verified: 0 callers), but every *future* automation is at risk until D-06 is decided.
3. **High — Alerting is config, not operations.** Canonical Prometheus/Alertmanager files exist and are secret-clean, but there is no evidence a receiver is actually wired and paging a human (placeholder `__WEBHOOK_URL__`). Operational MTTA/MTTR claims remain unproven.
4. **High — RPO/RTO numbers are code/config-agnostic single-host figures.** Quoting 3.3s/30.2s as production NRT indicators before E4 would be an extrapolation fallacy. No SLO exists to ratify them either way.
5. **Medium — Redis master-name drift.** `docker-compose.sentinel.yml` + `failover-redis.sh` default use **`mymaster`**; `ops/redis/sentinel-*.conf` use **`payesh-master`**. If a deployment mixes these configs, Sentinel failover will silently target the wrong name (a config-mismatch failure class). Needs reconciliation + a cross-check test.
6. **Medium — WAL-drill lifecycle sensitivity.** `tests/wal-disk-full.js` is an orphan (not in npm test/CI) and depends on an external `bootstrap.sh` + tmpfs mount; multiple NOT-RUN gates are the norm unless strictly pre-staged. Fine as a manual drill; risky as an unattended gate.
7. **Medium — server/admin.js snapshot vs server/dr.js restore are JSON-store-level.** They do not cover WAL/PITR of the PostgreSQL tier; that lives only in shell tooling (`tools/pitr-*.sh`). No single end-to-end verifier spans DB + Redis + store restore in one command.
8. **Low — `wave1-reads` / `wave23-reports-pg` are red with live PG but un-wired (orphans).** They're DR-adjacent report/certification paths; red-orphan state hides in the 485-file budget. (See Arena deep-verification findings DEF-004/005.)

---

## 8. Final Readiness Status

| Verdict | Status |
|---|---|
| DR/HA/Backup/Restore correctness (single-host, procedure-level) | **E3 VERIFIED** |
| RPO/RTO — measured (small scale) | **MEASURED (E3, non-extrapolatable)** |
| Production-equivalent (multi-host, real partition, off-site, prod scale) | **E4 NOT VERIFIED** |
| DR-01 (`verify` exit-code false green) | **CONFIRMED / OPEN** |
| Phase 8.2 Exit | **NOT ISSUED** |
| Phase 8.3 | **BLOCKED** |
| Production GO | **NOT DECLARED — NOT READY** |

### Single-sentence verdict

**Production Readiness: `NOT READY` — `E4 NOT VERIFIED` / `EXTERNAL BLOCKER`.**
The DR/HA *mechanisms are real and work* at E3 (backups restore byte-identically, corruption is detected and fails closed, Sentinel fails over in ~3.3s with zero key loss, WAL exhaustion recovers with RPO 0, PG promotes with zero row loss) — **but none of that is Production proof.** The blocking gaps are: a red canonical CI gate on the current SHA, no off-site backup, no multi-host topology, no network-partition testbed, no production-scale dataset, no ratified SLO, and an unwired alerting receiver. All of these are **external dependencies / owner decisions**, not code defects that in-repo agents alone can close.

**E3 ≠ E4. No fake green. No production GO.**

---

### Appendix A — Reproduction command index (all executed this mission)

```bash
# PostgreSQL + pgBackRest lab (single host)
initdb -D /home/user/e4lab/pgdata --data-checksums (port 55432, archive_command → pgbackrest archive-push)
pgbackrest --config=pbr.conf --stanza=payesh stanza-create/check
pgbackrest --type=full backup            # exit 0
INSERT 50,000 rows; pgbackrest --type=incr backup
dd corrupt 16386.zst → pgbackrest verify # exit 0 but status:invalid (DR-01)
pgbackrest restore --set=…I --target-action=promote  # exit 29 fail-closed
repair → verify clean → restore → promote → md5 identical, 50,000 rows
kill -9 postmaster → restart → 50,000 rows (crash recovery)
pg_basebackup -R → standby :55434 (state=streaming) → kill primary → SELECT pg_promote → 0 rows lost

# Redis Sentinel lab (single host)
redis-server n1/n2/n3 (:56010/:56020/:56030) + redis-sentinel s1/s2/s3 (quorum 2, down-after 2000ms)
SET 2,000 keys; WAIT 2 2000 → 2
kill -9 master → SENTINEL get-master-addr-by-name → new master :56030, RTO 3325 ms, 2000/2000 keys

# Repo tooling
REDIS_HOST=… REDIS_PASSWORD=… bash tools/redis-backup.sh        # exit 0; dump+RDB+AOF
flock-busy → exit 75 (F-QA-08)
bash tools/failover-redis.sh / failover-postgres.sh → exit 1 guards
PAYESH_BACKUP_KEY=… node scripts/dr-restore-drill.js --store …  # PASS
sudo bash infra/wal-drill/bootstrap.sh → 113 tables
sudo node tests/wal-disk-full.js → ENOSPC FATAL · RTO 30.2s · RPO 0 · replica catch-up
node tests/wave16-dr.js 75/75 · tests/dr-runbook.js 38/38
```

### Appendix B — E4 criterion probes (this host)

`docker` ABSENT · `kubectl` ABSENT · `aws` ABSENT · `vault` ABSENT · virt=`kvm` · kernel `6.1.158+` · host `e2b.local` · 2 vCPU / 1,984 MB · all drill listeners on `127.0.0.1`. → **0 of 6 E4 criteria satisfied.**
