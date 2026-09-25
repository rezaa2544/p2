# A-32 — SMS PostgreSQL mirror / restart idempotency

**Status: REPRODUCED**
**Roadmap Reconciliation Required**
**E4 NOT VERIFIED**
**Not a fix. Not CERTIFIED. Not Production GO.**

| | |
|---|---|
| Commit | `145088f3788a960c14084774b45687328346266d` |
| Subject | `docs: add A-37 A-38 A-39 test and DR acceptance criteria` |
| Repo | `/tmp/p2-a32` (clean; no product code changed) |
| Date | 2026-09-25 |
| Engine | PostgreSQL 17.11 (Debian 17.11-0+deb13u1), database `payesh_a32`, 21/21 migrations applied via `node tools/migrate-ledger.js up` |
| Level | E3 local real PostgreSQL. Not a staging or production cluster. Do not upgrade this result to E4. |

PostgreSQL was not on PATH at the start of this run. It was installed in this sandbox (`apt install postgresql postgresql-client`) and the cluster was started with `pg_ctlcluster 17 main start`. Redis 8.0.2 was also started, because this SHA treats `DATABASE_URL` as a production shape and refuses to listen without Redis. The SMS path under test used the real `pg` driver and the migrated schema. The JSON store was not used as a substitute for the verdict.

No fix was applied. The assignment constraint is that every fix must have a regression. A fix on this SHA without a failing-then-passing regression is not allowed. This file is evidence only.

## Schema fact (live database, after migrations 001–021)

```text
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sms_log'
  AND column_name IN ('queue_id','provider_msg','error');
-- 0 rows
```

`sms_log` columns present: `id`, `body`, `created_at`, `parts`, `phone`, `school_id`, `status`, `updated_at`, `user_id`, `version`.

`server/sms.js` still inserts `provider_msg` and `queue_id` on a successful send, and `error` and `queue_id` on a failed send. `mirrorItem` catches the PostgreSQL error and only audits `sms_mirror_failed`. The HTTP response stays 200.

## Scenario

Seed (school 1, superadmin `09120000001`, parents 101 `09121111111` and 102 `09123333333`, wallet balance `100.00`, queue 1 and 2 `pending`):

```sql
INSERT INTO schools (id, name, active, version) VALUES (1, 'A32 School', true, 1);
INSERT INTO users (id, role, phone, national_id, full_name, active, status, school_id, version) VALUES
  (1, 'superadmin', '09120000001', '0011111111', 'A32 Superadmin', true, 'active', 1, 1),
  (101, 'parent', '09121111111', '0022222222', 'A32 Parent OK', true, 'active', 1, 1),
  (102, 'parent', '09123333333', '0033333333', 'A32 Parent FAIL', true, 'active', 1, 1);
INSERT INTO sms_wallet (id, school_id, balance, version) VALUES (1, 1, 100.00, 1);
INSERT INTO notify_queue (id, school_id, status, body, parts, parent_ids, version) VALUES
  (1, 1, 'pending', 'A32 success body', '1', '[101]', 1),
  (2, 1, 'pending', 'A32 fail body', '1', '[102]', 1);
```

Server:

```text
DATABASE_URL=postgresql://payesh:payesh@127.0.0.1:5432/payesh_a32
REDIS_URL=redis://127.0.0.1:6379
PAYESH_SMS_PROVIDER=mock
PAYESH_SMS_MOCK_FAIL=09123333333
PAYESH_DEMO_CODE=1
PAYESH_JWT_SECRET=a32-sms-restart-shared-secret-32b-min
HOST=127.0.0.1 PORT=3020
node server/index.js
```

Request: login as the seeded superadmin, then `POST /api/sms/send` body `{"queue_ids":[1,2]}`.

Queue 1 is the provider success. Queue 2 is the injected provider failure (`mock_injected`). That is the partial batch.

## Pass 1 — send, mirror fails, client still 200

HTTP `200`:

```json
{"ok":true,"sent":1,"skipped_already":0,"skipped_credit":0,"failed":1,"credits_used":1,"dry_run":false}
```

Audit `/tmp/a32-store/audit.log`:

```text
2026-09-25T07:57:10.025Z sms_mirror_failed
  ops=3 school=1 queue_id=1 kind=send
  error=column "provider_msg" of relation "sms_log" does not exist
2026-09-25T07:57:10.025Z sms_send
  school=1 n=1 parts=1 credits=1 dry=false
2026-09-25T07:57:10.027Z sms_mirror_failed
  ops=1 school=1 queue_id=2 kind=fail
  error=column "error" of relation "sms_log" does not exist
2026-09-25T07:57:10.027Z sms_fail
  school=1 n=1 code=mock_injected
```

PostgreSQL immediately after that 200:

| table | row | result |
|---|---|---|
| `notify_queue` | 1 and 2 | `status=pending`, `decided_at` null, `version=1` |
| `sms_wallet` | 1 | `balance=100.00`, `version=1` |
| `sms_log` | — | `count(*)=0` |

In-process JSON after SIGTERM (`/tmp/a32-store/payesh.json`), which is not the durable authority:

- wallet `balance=99`
- queue 1 `status=sent`, `decided_at=2026-09-25T07:57:10.023Z`, `decided_by=1`
- queue 2 still `pending` (failure does not mark the queue sent)
- `sms_log` id 1 `status=sent` `queue_id=1` `user_id=101` `provider_msg=mock-v001nt`
- `sms_log` id 2 `status=failed` `queue_id=2` `error=mock_injected`

The provider was called. The client was told the send succeeded. PostgreSQL kept the pre-send queue and the pre-send wallet, and stored no log.

## Pass 2 — graceful restart, then retry

SIGTERM ran the shutdown persist. The next boot loaded that JSON, then hydrated from PostgreSQL because users/schools were not empty. Boot log: first boot `Hydrated 87 collections`; restart boot `Hydrated 86 collections`.

Retry of the same body returned HTTP `200`:

```json
{"ok":true,"sent":1,"skipped_already":0,"skipped_credit":0,"failed":1,"credits_used":1,"dry_run":false}
```

New audit lines:

```text
2026-09-25T07:58:11.249Z sms_send {school:1, n:1, parts:1, credits:1, dry:false}
2026-09-25T07:58:11.251Z sms_mirror_failed
  ops=1 queue_id=2 kind=fail
  error=column "error" of relation "sms_log" does not exist
2026-09-25T07:58:11.251Z sms_fail {school:1, n:1, code:mock_injected}
```

There was no second `sms_mirror_failed` for queue 1. The success-path log insert was skipped by the in-memory sent index, so the retry transaction no longer mentioned `provider_msg`. Wallet update + queue update then committed.

PostgreSQL after the retry:

```text
 notify_queue id=1  status=sent  decided_at=2026-09-25 07:58:11.246+00  decided_by=1  version=1
 notify_queue id=2  status=pending  decided_at=null  version=1
 sms_wallet   id=1  balance=99.00  version=1
 sms_log      count(*)=0
```

JSON after the retry shutdown:

- wallet `99`
- queue 1 `decided_at=2026-09-25T07:58:11.246Z` (the retry, not the first send)
- `sms_log` still has one sent row, `provider_msg=mock-v001nt` only
- a second failed row was appended for queue 2 (`id=3`, `error=mock_injected`)

### Answers for the graceful path

| question | result |
|---|---|
| Provider sends again? | Yes. Second response `sent:1`, second `sms_send` audit. The first `provider_msg` was not replaced; the second mock id was not stored, because the dup check runs after `providerSend`. |
| Wallet debited again? | Yes, against the balance restored from PostgreSQL. First debit never landed (`100.00` remained). The retry charged that restored balance and committed `99.00`. Two provider accepts, one persisted debit. |
| Audit duplicates? | Yes. `sms_send` twice. `sms_fail` twice. `sms_mirror_failed` twice for the fail item, once for the first success item. |
| Queue inconsistent? | Yes. After the first 200, memory was `sent` and PostgreSQL was `pending`. After the retry, PostgreSQL says `sent` at the retry timestamp, `version` stayed `1`, and `sms_log` is still empty. |
| PG mirror lost? | Yes. `sms_log` is still 0 rows. The retry does not repair it: the idempotency skip omits the log insert, then the queue/wallet update commits without the log. |

## Pass 3 — control, after the queue row has persisted

Same server shape, `POST /api/sms/send {"queue_ids":[1]}` after PostgreSQL already had queue 1 `sent`.

HTTP `200`:

```json
{"ok":true,"sent":0,"skipped_already":1,"skipped_credit":0,"failed":0,"credits_used":0,"dry_run":false}
```

Once the queue status itself has been written to PostgreSQL, a later retry does not call the provider. The duplicate window is the restart that happens while PostgreSQL still says `pending`.

## Pass 4 — kill -9, no JSON file, retry

New row, so the graceful-path JSON could not mask it:

```sql
INSERT INTO notify_queue (id, school_id, status, body, parts, parent_ids, version)
VALUES (3, 1, 'pending', 'A32 crash body', '1', '[101]', 1);
```

Boot with `PAYESH_STORE=/tmp/a32-crash/payesh.json` absent. `PAYESH_SMS_MOCK_FAIL` unset. `POST /api/sms/send {"queue_ids":[3]}`.

First response: `{"ok":true,"sent":1,"skipped_already":0,"failed":0,"credits_used":1,"dry_run":false}`

PostgreSQL after that 200, before the kill:

```text
notify_queue id=3  status=pending  decided_at null  version=1
sms_wallet balance still 99.00
sms_log count(*)=0
```

No JSON file existed (PG mode does not periodically persist JSON). `kill -9` on the server pid. Confirmed `/tmp/a32-crash/payesh.json` still absent. Restart on port 3021, same `DATABASE_URL`, no store file. Boot log: `Hydrated 87 collections` (nothing kept).

Retry response: `{"ok":true,"sent":1,"skipped_already":0,"failed":0,"credits_used":1,"dry_run":false}`

Audit `/tmp/a32-crash/audit.log`:

```text
2026-09-25T08:00:44.913Z sms_mirror_failed
  ops=3 queue_id=3 kind=send
  error=column "provider_msg" of relation "sms_log" does not exist
2026-09-25T08:00:44.913Z sms_send {school:1, n:1, parts:1, credits:1, dry:false}
2026-09-25T08:01:20.915Z sms_mirror_failed
  ops=3 queue_id=3 kind=send
  error=column "provider_msg" of relation "sms_log" does not exist
2026-09-25T08:01:20.915Z sms_send {school:1, n:1, parts:1, credits:1, dry:false}
```

PostgreSQL after the crash retry:

```text
notify_queue id=3  status=pending  decided_at null  version=1
sms_wallet balance 99.00  version=1
sms_log count(*)=0
```

This path does not self-heal. Every crash/restart while the mirror insert names a missing column will call the provider again, debit only the in-memory wallet, roll the PostgreSQL transaction back, and leave the queue `pending`.

## Final database snapshot

```text
 id | status  |         decided_at         | decided_by | version
----+---------+----------------------------+------------+--------
  1 | sent    | 2026-09-25 07:58:11.246+00 | 1          |       1
  2 | pending |                            |            |       1
  3 | pending |                            |            |       1

 sms_wallet id=1 school_id=1 balance=99.00 version=1
 sms_log count(*)=0
```

Queue 1's persisted `decided_at` is the retry, not the first provider accept. Queue 3 was accepted twice by the mock provider and is still `pending`. No `sms_log` row exists for any of the three provider accepts.

## Root cause (from the executed path, not from review alone)

1. `server/sms.js` writes `provider_msg`, `queue_id`, and `error` into `sms_log`. Migrations 001–021 never add those columns.
2. `persistOpsBatch` inserts every key on the op. The missing column aborts the item transaction, so the wallet update and the queue update roll back with it.
3. `mirrorItem` swallows that error. The handler still returns 200 and has already mutated memory.
4. Idempotency is not restart-safe. `providerSend` runs before the sent-index check. The index is built only from in-memory `sms_log` rows with `status==='sent'`. Failed rows are not indexed. A hydrate that restores a `pending` queue from PostgreSQL sends again.
5. On a graceful restart, B7 can keep the JSON `sms_log` while PostgreSQL overwrites `notify_queue` and `sms_wallet`. The retry then skips the log insert and commits queue/wallet without ever writing `sms_log`.

## What this is not

- Not FIXED. No product patch. No regression test was added, because none was allowed to go green against an unfixed defect.
- Not a PASS from code reading. The 200s, the audit lines, and the `psql` snapshots above are from this SHA on a live PostgreSQL.
- Not E4. A sandbox PostgreSQL 17.11 is not a multi-node or production-equivalent run. **E4 NOT VERIFIED.**
- Not a Production GO. CERTIFIED was not used.
- Phase 8.2 was not reopened and was not declared exited.

## Roadmap Reconciliation Required

A-32 remains open on `145088f`. A historical Arena E2E claim must not be promoted, and this E3 reproduction must not be recorded as an E4 close or as a fix. Closing it needs a schema/code change plus a regression that fails on this SHA and passes only after the mirror and the restart idempotency both hold against real PostgreSQL.
