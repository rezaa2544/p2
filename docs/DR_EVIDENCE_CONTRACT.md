# DR evidence contract — Arena 8 closure

Baseline: `5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2`. Scope: native disposable E3 recovery and fail-closed tool contracts. Merge owner: Tech Lead. Nothing here certifies E4 or production readiness.

## PostgreSQL

`backup exists` != `backup restorable`. Use real pgBackRest backup metadata and a restore drill, not file existence. `pgbackrest verify` 2.55.1 can emit `status: invalid` and exit zero. A consumer must inspect semantic status. Current recovery uses actual restore followed by an independent complete dataset comparison; no raw-verify exit-only acceptance gate is introduced.

At the intended **committed** recovery point, quiesce writers and capture the expected dataset on the source:

```bash
PGHOST=<source-socket> PGPORT=<source-port> PGDATABASE=payesh PGUSER=<owner> \
  python3 tools/pitr-manifest.py --capture /approved/expected.json
```

Capture uses one read-only repeatable-read transaction and hashes all rows, deterministically ordered by id, in users/schools/classes/grades/attendance, plus their schemas, database and physical cluster lineage. This is not a full application schema certificate; additional business invariants must be tested by the owner. The manifest must be approved and retained independently of the backup; an attacker-controlled manifest is not a trust anchor.

Create the recovery point only after the desired writes commit. Do not combine INSERT and pg_create_restore_point in a single implicit transaction and then expect the INSERT at that point.

```bash
PGDATABASE=payesh PGUSER=<owner> PITR_EXPECT_MANIFEST=/approved/expected.json \
  bash tools/pitr-restore.sh --name before_incident --dest /isolated/dr --port 54329
# or --time '2026-09-23 10:00:00+00'; or --latest with a matching expected dataset
```

The native script preserves the pgBackRest-generated restore_command and target identity, waits for `pg_is_in_recovery() = false`, then compares the approved manifest. The source directory cannot serve as the restored target. A system_identifier match is expected for a physical clone but insufficient by itself: explicit destination directory, database, schema/count/full-table digest must match too. Paths with shell/config-unsafe characters are rejected. Container recovery must execute entirely in the target namespace; mixed native `PBR_EXEC` is rejected rather than pretending to restore a remote filesystem.

`--no-start` is **PREPARED_NOT_VERIFIED**. `--no-verify` is **RUNNING_NOT_VERIFIED**, never PITR_READY. `--native` remains a compatibility alias. Python3 and the PostgreSQL control/client binaries are required; missing dependencies fail.

For independent revalidation:

```bash
PGHOST=<restore-socket> PGPORT=54329 PGDATABASE=payesh PGUSER=<owner> \
  bash tools/pitr-verify.sh --manifest /approved/expected.json --expect-data-dir <restore-data-directory>
```

An obsolete `--expect-before` audit-table sample is not enough to prove PITR correctness. It is replaced by the approved expected dataset, not silently ignored. No automatic fixed database `postgres` is substituted for `payesh`.

## PostgreSQL failover and fencing

A failed network probe is **not** proof the old primary is fenced. `PG_FENCE_CHECK` must name an operator-controlled executable. It receives the exact old host and port; it must exit zero and print exactly `FENCED <host>:<port>` only after verifying the authoritative fencing mechanism. `--force` does not bypass this requirement. Unknown replay lag fails closed; bytes of lag are not a measured RPO in seconds.

A local drill verifier may check the old process is stopped. This is not production fencing. E4 needs the owner's actual power/orchestration/lease authority and a partition drill. PROMOTE_OK is PostgreSQL role-change evidence, not proof that routing/PgBouncer/the application recovered.

## Redis snapshots

The native job is loopback/local-file only. Redis CONFIG GET dir/dbfilename must match the supplied source directory; run_id must stay constant. PING/SAVE/AOF statuses and parsers are checked semantically. Lock contention exits 75 and creates no backup; filename collision fails rather than overwrites.

RDB and AOF are **independent snapshots**, not a shared atomic transaction. Multipart AOF copies the stable manifest and all active referenced base/incremental files, supports Redis 7 and Redis 8 offset fields, and requires redis-check-aof without repair. Missing/changed/truncated data fails; never call --fix to make a backup pass. RDB is independently validated with redis-check-rdb. A restore to a separate target plus application-level readback is still required.

`manifest-<TS>.txt` and `checksums-<TS>.txt` identify a run; `last-backup.txt` is updated only after completion. A file left by an interrupted publication is not a committed backup. Verify the selected per-run hash catalogue, not the mutable latest pointer. Retention happens only after successful completion; retry after a partial publication uses a fresh timestamp.

Custom AOF layouts other than the supported legacy appendonly.aof or default appendonlydir fail closed. Place this native job inside the Redis filesystem/process namespace; do not infer remote identity from a same-named host mount. Remote environments need an explicit attested runner and E4 review.

## Off-site publication

If BACKUP_S3 is absent the job is local-only. If supplied, failure is not downgraded to local success. `aws` and `BACKUP_S3_OWNER` (expected AWS account ID) are mandatory. The complete RDB/AOF/manifest bundle is uploaded to a unique key in a versioned bucket. The exact returned version is downloaded with expected-owner enforcement and SHA256 compared. An ETag alone is not a content checksum. Unknown/null version, owner denial, timeout, partial upload and readback mismatch fail.

Mock tests prove only CLI/dataflow behavior. Real S3 identity, credentials/IAM, encryption/KMS, object lock/retention, cross-site independence and network failures remain external verification requirements. Failed uploads may leave an unaccepted orphan version; owner lifecycle policy must handle these without deleting accepted recovery points. No production S3 credential or bucket is bundled with this repository.

## RPO/RTO semantics

Measure using a monotonic clock, capture UTC provenance separately. Local drill RTO is fault-injection start through role convergence, expected-data check and a new successful committed write/read. It is **database-service E3 RTO**, not full application/on-call recovery time. The harness records acknowledged write IDs and timestamps, surviving IDs, and:

- lost acknowledged records;
- acknowledged-loss window: last acknowledged write timestamp minus newest recovered acknowledged write timestamp;
- age of that recovery point at failure (separate from the loss window).

Zero observed loss is scoped to the acknowledged workload and observation window. It is not proof that every production workload has RPO zero. If no acknowledged write survives, the time window is unknown, not zero. A failed integrity/readback assertion invalidates the measurement.

The DR API returns `not_verified` and null measured fields without collector evidence. Module-level DTO validators accept explicit caller-supplied evidence; they do not perform backup I/O and must not be represented as independent storage verification. Estimates are retained only as estimates and never satisfy measured-RTO compliance. Governance constants (300/900 seconds) are targets, not measurements or newly ratified production SLOs.

## Verification and external blockers

```bash
python3 tests/infrastructure/disaster-recovery/live-dr-closure.py --out /tmp/pg-dr-evidence
python3 tests/infrastructure/disaster-recovery/live-redis-failover.py --out /tmp/redis-dr-evidence
python3 tests/infrastructure/disaster-recovery/s3-tool-contract.py # MOCK ONLY
node tests/infrastructure/disaster-recovery/index.test.js
node tests/infrastructure/disaster-recovery/truth-contract.test.js
```

Missing binaries cause failure, not skip/PASS. Fresh topology is built independently five times. Each of the five Tasks requires at least five independent rounds in addition to functional/boundary/failure/concurrency-recovery/regression dimensions. Five S3 mock rounds do not satisfy five real external S3 rounds; that portion remains EXTERNAL BLOCKER. Failures are retained in ledgers; a harness summary must be checked as well as the exit code. The CI workflow runs these separately from unit/model coverage.

**External owners:** infrastructure/SRE provides E4 topology, real off-site repository, credentials and fault authorization; on-call owner provides receiver/ack path; repository owner provides GitHub push/PR access; Tech Lead reviews and merges. No main/roadmap/Production GO promotion follows from local tests alone.
