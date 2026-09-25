# Arena 5 — Production Readiness Gate

Independent final-gate audit. Not a happy-path pass. No historical evidence is promoted to current evidence. No rank, no score, no Production GO guess.

- Live `origin/main` at audit start: `172da62b63f70d406ffad69893851a01b042ffc4` (2026-09-22T20:42:36Z, merge of PR #358)
- Local fix commit, **not on origin**: `38aed69611754807b6570ade7e8634d5d468817d`
- Push: **EXTERNAL BLOCKER** — `git push` failed with `could not read Username for 'https://github.com': terminal prompts disabled`. No token in this environment.
- Patch kept at `arena5-gate-38aed69.patch` so the fix is not only in `/tmp`.
- This sandbox: Node v20.20.2, no PostgreSQL, no Redis, no Docker. That is E3-incomplete, not E4.

Mandatory sources read against the live clone, not the stale workspace tree: `AGENTS.md`, `docs/README.md`, `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` (Rules 1–15, 30), `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`, `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md` exit chain, `docs/PRODUCTION_READINESS_CHECKLIST.md` (historical, SHA `351bd10`), `docs/SLO.md` RPO/RTO rows, `infra/observability/alertmanager.yml`, `infra/observability/prometheus.yml`, `tools/production-verifier.sh`, Node.js CI workflow. `PROJECT_OVERVIEW.md` and `REPOSITORY_MAP.md` were not re-quoted; they do not contain current-SHA gate evidence.

---

## Task 1 — Phase 8.2 gate reconciliation

| Dimension | What was checked | Result |
|---|---|---|
| Functional | Master schedule exit chain is S3 alert evidence, then S4 PG/Redis restore + measured RPO/RTO, then Gate 8.2 Exit, then 8.3. | Exit is not met on `172da62`. |
| Boundary | Ground-truth matrix that says some repo gates are VERIFIED names SHA `21ec84e1`, not `172da62`. Checklist is dated 2026-09-10 at `351bd10`. | Not current evidence. |
| Negative | Search for a Production GO stamp on this SHA. Documents say NOT DECLARED. No file in `docs/` contains `172da62`. | No silent promotion found. |
| Replay | Repeated ground-truth appendices agree the exit was not issued. Agreement of old documents is not a new pass. | Not used as a pass. |
| Independent | Live GitHub check-runs for `172da62` were fetched from the API, not from the ground-truth file. | Suite is red. Exit stays **NOT VERIFIED**. |

## Task 2 — Repo-owned defect closure

Found, reproduced, root-caused, fixed locally, regression-run, re-run after commit. Push did not happen.

| ID | Find / reproduce | Root cause | Local fix | Regression |
|---|---|---|---|---|
| G-01 | `bash -n tools/production-verifier.sh` fails. CI step `Phase 7 verifier contract` failed on `172da62` (run `35782045259`). Isolated line 382 is valid; the parser dies there because an earlier quote never closes. | Line 325 is spliced: `grep -v '\.down\.sqlPORTC=3513`. The loop body and a second T5–T7 copy sit after `exit`. | One T5 loop (`019_`/`020_` skipped), one T6, one T7, verdict at EOF. | `bash -n` OK. Contract test 6/6, including a second process after commit. |
| G-02 | `boot_one` comment sits on the line after a backslash. A throwaway function with the same shape exported only the post-comment assignment. | Bash drops the prefix when a comment is inside the continuation. `PAYESH_DEMO_CODE=1` never reached the process. | Comment moved above the command. `NODE_ENV=development` kept. | No backslash-then-comment line remains. Contract still forbids `NODE_ENV=production` together with the demo code. |
| G-03 | `node tests/secret-scan.js` throws `ENOENT` on `monitoring/alert-rules.yml`. Matches CI secret-scan failure (job `106929672393`). | Git mode `120000`. Symlink target is the deprecation comment, not a path. | Regular file, same comment, `groups: []`, no `- alert:`. | secret-scan 12/12, twice. Semantic guard still accepts the marker. |
| G-04 | `tests/observability-config.js` false-fails “canonical rule file only” on unmodified `prometheus.yml`. | The regex uses `$` as end-of-file, but `scrape_configs` follows `rule_files`. | Assertion reads only the `rule_files` entries. | 21/21. A mutated second path is rejected. |

Not closed, and not weakened:

- Codacy SARIF upload failed after a successful CLI step (`Invalid request. 1 item required; only 0 were supplied`). Job logs were HTTP 403. Adding `continue-on-error` would be fake green. Status **NOT VERIFIED**.
- Full T1–T7 verifier runtime was not run. No local PostgreSQL or Redis. CI skipped that step.

## Task 3 — Current-head CI / runtime

| Dimension | Evidence |
|---|---|
| Functional | Check-runs on `172da62`: `build (22.x)` failure, Secret scan failure, Codacy failure. CodeQL/SAST/SCA/SBOM/DAST/WAF/Fortify success. |
| Boundary | Combined status is `success` only because CircleCI `say-hello` (run 680) is the sole status context. That is not `npm test` and is not the production verifier. |
| Negative | Failed CI step name matches the local `bash -n` failure before the fix. |
| Replay | Open PR #359 is a later attempt on the same branch. It is not `main`. Its in-progress CI was not used as current evidence. |
| Independent | Local reproduction on the cloned SHA, then a second process after commit `38aed69`. GitHub has not re-run CI on that commit. |

Published CI status: **NOT VERIFIED**.

## Task 4 — DR / backup / alerting boundary

| Dimension | Evidence |
|---|---|
| Functional | Canonical rules file has 11 alerts. Prometheus `rule_files` lists only `/etc/prometheus/alert-rules.yml`. `redis-backup.sh` exits 75 on lock contention. Local `tests/redis-backup.js` 11/11, including “contention is not green”. |
| Boundary | `monitoring/alert-rules.yml` was not a second catalogue; it was an unreadable symlink. Alertmanager receiver is the literal `__WEBHOOK_URL__`. |
| Negative | No `s3://` or off-site target found in `infra/postgres/pgbackrest.conf.template` or `docs/DR_RUNBOOK.md` during this pass. No drill log names `172da62`. |
| Recovery | No PostgreSQL restore, Redis failover, or backup restore was executed here. Templates and runbooks are not a drill. |
| Independent | `redis-backup.js` was re-run after the other fixes. It does not measure RPO/RTO and it is not E4. |

SLO rows 16–17 are labeled **TARGET/POLICY — MEASUREMENT REQUIRED**. No measurement on this SHA was found. Historical E3 numbers in the ground-truth file stay historical.

## Task 5 — Production GO prerequisites and Phase 8.3

| Dimension | Evidence |
|---|---|
| Functional | Schedule: 8.3 starts after Gate 8.2 Exit. Exit requires S3 and S4 evidence. Those are absent on this SHA. |
| Boundary | 8.3 empirical load still depends on an E4/10M environment that is not in this repo and not in this sandbox. |
| Negative | No document on this SHA issues Production GO. |
| Dependency | 8.2 exit unmet, so 8.3 cannot start. Green local contract tests do not remove that dependency. |
| Independent | Live CI on origin is red, so the repo-side CI prerequisite is also unmet on the published SHA. |

Production GO is **NOT VERIFIED**. It is not declared, and this audit does not infer a GO or a NO-GO score.

---

## Gate Matrix

| Gate | Status | Evidence | SHA | Environment | Owner | Remaining dependency |
|---|---|---|---|---|---|---|
| Phase 8.2 Exit | NOT VERIFIED | Exit chain requires S3 and S4 evidence. None is bound to this SHA. Published Node.js CI is red. | `172da62b63f70d406ffad69893851a01b042ffc4` | GitHub Actions + doc/code read. Not E4. | Release owner | S3 drill, S4 E4 restore, green current-head suite |
| S3 alert → on-call → acknowledgement → recovery | EXTERNAL BLOCKER | Rules exist. Alertmanager URL is `__WEBHOOK_URL__`. No fire/ack/recovery timestamps on this SHA. | `172da62b63f70d406ffad69893851a01b042ffc4` | Repo config only | SRE / on-call owner | Real receiver, human acknowledgement, MTTA/MTTR |
| S4 PostgreSQL DR | EXTERNAL BLOCKER | Restore templates and runbooks exist. No restore/promote was run. No artifact names this SHA. | `172da62b63f70d406ffad69893851a01b042ffc4` | Not executed. Sandbox has no PostgreSQL. | DBA / platform | E4 restore/promote, identity/checksum, verifier on the recovered target |
| Redis DR | EXTERNAL BLOCKER | `tools/redis-backup.sh` lock-contention test 11/11 locally. No failover or restore drill on this SHA. | `172da62b63f70d406ffad69893851a01b042ffc4` | Local script test only. Not a cluster. | Platform | E4 failover/restore and revocation/rate-limit check after restore |
| backup/restore | NOT VERIFIED | Script and procedure files exist. No restore of a backup was executed on this SHA. Historical drill reports were not promoted. | `172da62b63f70d406ffad69893851a01b042ffc4` | Repo read + local backup-script unit test | DBA / SRE | A restore against a known backup identity |
| S3/off-site | EXTERNAL BLOCKER | No off-site/S3 target evidence found in the pgBackRest template or DR runbook during this pass. | `172da62b63f70d406ffad69893851a01b042ffc4` | Repo read | Platform owner | Off-site bucket, credentials, restore from that copy |
| RPO/RTO | NOT VERIFIED | `docs/SLO.md` marks both as TARGET/POLICY, measurement required. No measurement file cites `172da62`. | `172da62b63f70d406ffad69893851a01b042ffc4` | Document read | SRE + owner decision | Measured drill, then an owner acceptance of the number |
| current-head CI | NOT VERIFIED | Node.js CI `35782045259` failed at the Phase 7 contract step. Secret scan failed. Codacy SARIF upload failed. CircleCI say-hello success is not this gate. | `172da62b63f70d406ffad69893851a01b042ffc4` | GitHub Actions API | Repo | Re-run on a SHA that contains the fix, after push |
| production verifier | NOT VERIFIED | Contract/syntax fixed locally (`bash -n`, 6/6). T1–T7 runtime not executed. CI skipped that step on `172da62`. | local `38aed69611754807b6570ade7e8634d5d468817d` | Local syntax only. No PG/Redis. | Repo | Live verifier run with PostgreSQL and Redis |
| E3 vs E4 | EXTERNAL BLOCKER | This pass did not create an E4 environment. E3 script tests are not E4. | `172da62b63f70d406ffad69893851a01b042ffc4` | Single sandbox, no cluster | Infrastructure owner | Production-equivalent topology, independent failure domains |
| Phase 8.3 | BLOCKED | Schedule starts 8.3 only after 8.2 Exit. Exit is NOT VERIFIED. | `172da62b63f70d406ffad69893851a01b042ffc4` | Governance read | Release owner | Phase 8.2 Exit plus E4/10M environment |
| Production GO | NOT VERIFIED | No GO is declared on this SHA. Prerequisites above are unmet. This row is not an inferred GO or NO-GO. | `172da62b63f70d406ffad69893851a01b042ffc4` | — | Release owner | Exit evidence, E4, owner authorization |
| Repo-owned fix push | EXTERNAL BLOCKER | Commit `38aed69` is local only. `git push origin main` failed for missing GitHub credentials. | `38aed69611754807b6570ade7e8634d5d468817d` | Local git | Repo owner | Authenticated push, then CI on that SHA |

Roadmap Reconciliation Required: do not upgrade Phase 8.2 Exit, Phase 8.3, E4, or Production GO from this audit. The ground-truth appendix that names `21ec84e1` remains historical.
