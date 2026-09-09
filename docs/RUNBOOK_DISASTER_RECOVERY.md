# RUNBOOK — Disaster Recovery & Restore

**Owner:** on-call (Arena 4/5) · **Wave:** 16 · **Last drill:** see `data/dr-drill-*.json`
**Companion:** `docs/WAVE16_DISASTER_RECOVERY.md` (design + evidence),
`docs/RELIABILITY_DR_PLAN.md` (architecture)

> Read this at 3 a.m. It is ordered by what you do first. Every command is copy-pasteable.
> Anything marked **NOT DRILLED** has not been executed in this environment — say so out
> loud in the incident channel instead of assuming it works.

---

## 0. Objectives

| | Value | Env |
|---|---|---|
| RPO (max data loss) | **300 s** | `PAYESH_DR_RPO_S` |
| RTO (max recovery time) | **900 s** | `PAYESH_DR_RTO_S` |

Check the *achieved* RPO before you promise anyone a number:

```bash
node -e "const{createDR}=require('./server/dr.js');console.log(createDR({dataDir:'server/data'}).rpoStatus())"
```

`breached: true` means the newest backup is older than the objective. **Restore from what
exists; do not wait for a newer backup.**

---

## 1. Triage — which failure is this?

| Symptom | Go to |
|---|---|
| App up, data wrong / lost / corrupted | §2 Restore |
| App down, host recoverable | §3 Restart, then §2 |
| Host / disk lost | §4 Off-site restore |
| Database primary lost (PostgreSQL mode) | §5 Failover + §PITR |
| Ransomware / suspected tampering with backups | §6 |

---

## 2. Restore from a local backup

```bash
# 1. ALWAYS drill first — this proves the archive restores BEFORE you touch prod
node scripts/dr-restore-drill.js --json data/dr-drill-$(date +%s).json

# 2. list candidates (newest last) and verify one explicitly
ls -1 server/data/backups/payesh-*.json | tail -5
node -e "const{createDR}=require('./server/dr.js');const d=createDR({dataDir:'server/data'});
console.log(d.verifyBackup(process.argv[1]))" server/data/backups/<FILE>.json

# 3. restore through the API (superadmin only, audited, fail-closed)
curl -X POST -b cookies.txt -H 'Content-Type: application/json' \
     -d '{"file":"<FILE>.json"}' https://<host>/api/admin/restore
```

Restore semantics (from `server/admin.js`, unchanged by Wave 16):
- an invalid/corrupt file returns **409** and leaves the live store untouched;
- revocation state (`__revoked_jti`) and rate-limit state **survive** the restore, so a
  restore cannot be used to un-revoke a session or restart a brute-force;
- the operation is audited as `restore_completed` / `restore_failed`.

**Post-restore checks**
- [ ] `GET /api/health` returns 200
- [ ] one manager can log in and sees their own school only (tenant isolation)
- [ ] `payesh_http_requests_total{code=~"5.."}` is not climbing (`/metrics`, Wave 14)
- [ ] offline clients re-sync without a conflict storm
      (`payesh_sync_conflicts_total`, alert `PayeshSyncConflictSpike`)

---

## 3. Restart

```bash
systemctl restart payesh          # or: pm2 restart payesh
node scripts/dr-restore-drill.js  # prove recovery capability while the host is warm
```

If restarts loop, check `payesh_node_uptime_seconds` (alert `PayeshRestartLoop`) and the
last deploy — correlate with `payesh_build_info`.

---

## 4. Off-site restore (host lost)

```bash
# the off-site copy is the ENCRYPTED archive
ls -1 "$PAYESH_BACKUP_OFFSITE_DIR"/payesh-*.json.enc | tail -3

# decrypt with the backup key — a wrong key or a modified archive FAILS loudly
PAYESH_BACKUP_KEY="$(cat /etc/payesh/backup.key)" \
node -e "const{createDR}=require('./server/dr.js');const d=createDR({dataDir:'server/data'});
console.log(d.decryptFile(process.argv[1], 'server/data/backups/'+process.argv[1].split('/').pop().replace(/\.enc\$/,'')))" \
"$PAYESH_BACKUP_OFFSITE_DIR/<FILE>.json.enc"

# then §2 step 3
```

`authentication_failed` means the archive was modified **or** the key is wrong. Do not
retry with other keys — treat it as §6.

---

## 5. Database failover (PostgreSQL mode)

**NOT DRILLED in this environment** — requires Patroni/replica infrastructure
(`docs/RELIABILITY_DR_PLAN.md` §2).

1. Confirm the primary is really down (`pg_isready`, `payesh_db_query_errors_total`).
2. Promote the standby (Patroni does this automatically; manual: `pg_ctl promote`).
3. Point `DATABASE_URL` at the new primary, restart the API, confirm
   `payesh_db_pool_waiting == 0`.
4. Reads fall back to the primary automatically when the replica dies
   (`server/db.js` `queryRead`) — expect primary load to rise; alert `PayeshDbReplicaFailing`.
5. Verify data integrity per §2 post-restore checks.

---

## 6. Suspected tampering / ransomware

1. **Stop the backup scheduler** — an attacker with write access will encrypt or delete
   your newest archives. `PAYESH_BACKUP_EVERY_HOURS` unset disables it.
2. Copy the whole `backups/` directory **read-only** to a clean host before touching anything.
3. Verify every archive: a checksum failure means that archive is compromised.
4. Restore from the newest archive that verifies **and** predates the incident window.
5. Rotate: `PAYESH_BACKUP_KEY`, `PAYESH_JWT_SECRET` (keep `_PREV` so live sessions survive),
   DB credentials, `PAYESH_METRICS_TOKEN`.
6. Preserve `server/data/audit.log` for forensics — it is masked, so it is safe to share
   with the incident team.

---

## PITR (PostgreSQL only)

Wave 16 **reports** PITR posture (`pitrStatus()`); it cannot enable it. Server-side setup:

```conf
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=payesh archive-push %p'
archive_timeout = 300          # bounds RPO at 5 min to match PAYESH_DR_RPO_S
```

```bash
# verify archiving is actually running (a silent archive_command failure is the
# classic way to discover you have no PITR, at the worst possible moment)
psql -c "SELECT archived_count, failed_count, last_failed_wal FROM pg_stat_archiver;"

# point-in-time restore into a scratch cluster, never in place
pgbackrest --stanza=payesh --type=time --target="2026-09-09 12:00:00+03:30" restore
```

`failed_count > 0` is a **critical** incident: your RPO is not what you think it is.

---

## Failover drill checklist (quarterly GameDay)

| # | Step | Owner | Time | Pass |
|---|---|---|---|---|
| 1 | Kill the primary API instance; traffic continues | Arena 4 | | ☐ |
| 2 | `payesh_http_requests_total{code=~"5.."}` spike < 1 % during cutover | Arena 5 | | ☐ |
| 3 | Promote DB standby; writes resume | Arena 4 | | ☐ |
| 4 | **Restore drill passes inside RTO** (`scripts/dr-restore-drill.js`) | Arena 5 | | ☐ |
| 5 | No session is silently logged out | Arena 5 | | ☐ |
| 6 | Offline queues catch up; no conflict storm | Arena 3 | | ☐ |
| 7 | Media/attachments still resolve | Arena 4 | | ☐ |
| 8 | Incident timeline written within 24 h | Arena 5 | | ☐ |

Steps 1–3 and 5–7 are **NOT DRILLED** in the current environment (no multi-instance
deployment; Wave 15 dependency). Step 4 **is** automated and runs in CI.

---

## Recurring schedule

| Cadence | Task | Command |
|---|---|---|
| every deploy | restore drill | `node scripts/dr-restore-drill.js` |
| daily | verify newest backup | `verifyBackup()` via `newestVerified()` |
| monthly | off-site copy + decrypt round trip | `PAYESH_BACKUP_OFFSITE_DIR=… node scripts/dr-restore-drill.js` |
| quarterly | GameDay (§Failover) | manual, with the table above |

A drill that is skipped is not a drill. `payesh_metrics_dropped_series_total`-style
self-monitoring applies here too: if the drill stops running, that is the finding.
