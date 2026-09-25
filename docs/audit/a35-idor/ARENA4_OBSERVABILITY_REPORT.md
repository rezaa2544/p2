# Arena 4 — Observability Reliability: Verification & Remediation Report

**Repo:** `rezaa2544/p2` · **Pinned HEAD:** `172da62b` (clean tree, verified at session start) · **Date:** 2026-09-22 (Asia/Tehran)
**Scope:** correctness + failure visibility of Metric → Alert → Alertmanager → Logs → Loki/Promtail → On-call.
**Mandate:** every repo-owned defect **fixed + regression-locked** (explicit user override for this task). No fabricated E4 alert/on-call/ack evidence; non-executable receiver/ack → EXTERNAL BLOCKER.

---

## 1. Verdict summary

| # | Area | Verdict |
|---|------|---------|
| T1 | Metric ↔ alert semantic correctness | **CORRECT at HEAD** (13/13 metric names, `code` label, label sets, thresholds) — verified live. Only stale *doc-side* names. |
| T2 | Duplicate/legacy catalogue + rule drift | **DEFECTS FOUND & FIXED** — CI gate itself was RED (stale tests), 3 docs drifted, secondary Redis catalogue not mounted (owner decision). |
| T3 | Alertmanager fail-closed / placeholder / secret | **CORRECT (by design), verified with real binaries** — both fail-closed cases exit 78; interpolation correct; owner endpoint not committed. |
| T4 | Promtail/Loki parsing + trace/log correlation | **2 HIGH DEFECTS FOUND & FIXED** — Loki config never bootable (pinned 3.1.1) + rotated audit logs silently dropped (149/150 in E3). |
| T5 | End-to-end alert failure detection + recovery | **Chain VERIFIED live (E3)** with a real Redis outage → 4 alerts fired, 5 firing + 3 resolved webhooks delivered. **E4 on-call ack = EXTERNAL BLOCKER** (below). |

**Live E3 evidence (2026-09-22 21:19–21:56 UTC, real app in production mode + real prometheus 2.54.1 / alertmanager 0.27.0 / loki 3.1.1 / promtail 3.1.1):**

- App booted production semantics (PG + Redis + bearer /metrics), scrape target `payesh-api` = **up**.
- Redis killed 21:20 → `/api/readiness` 200→**503** (real 5xx traffic), `payesh_redis_up`→0.
- **`RedisDown` (critical) fired 21:20:25** (for:1m), **`HighErrorRate` (critical) fired 21:26:45** (for:2m, 5xx rate 0.93 req/s), **`AnomalyDetected` fired 21:27:35** (app's own anomaly detector cross-signalled the outage), `MemoryHigh` fired (sandbox heap).
- Webhook sink received **5 firing + 3 resolved notifications** via Alertmanager using the repo's config (interpolated from the `__WEBHOOK_URL__` placeholder by the repo's own entrypoint sed). `send_resolved: true` works; resolved delivery observed up to ~`group_interval` (5m) late — AM group semantics, not a defect.
- Redis restored 21:32 → readiness 200, alerts resolved.
- Rotation drop (F-OBS-01) reproduced deterministically: promtail down across a rotation → **149/150 rotated lines never ingested**, post-rotation lines flowed normally (invisible blind spot). After the fix (glob), **150/150 ingested**.

**Static gates after fixes:** `promtool check rules` = **11 rules SUCCESS** · `promtool check config` OK · `amtool check-config` (interpolated) **SUCCESS** · repo placeholder file unparseable by amtool *by design* (template; fail-closed entrypoint guarantees AM never boots on it; CI validates interpolated output).
**All 9 repo observability suites GREEN** (see §6).

---

## 2. Findings (all repo-owned, all fixed + regression-locked)

### F-OBS-01 — HIGH — Rotated audit logs silently dropped from Loki (+ non-persistent positions)
- **Location:** `infra/observability/promtail.yml` (single exact `__path__: /var/log/payesh/audit.log`), `server/audit.js:309` (rotation to `audit-<ts>.log`, 10MB default at `:199`), `infra/observability/docker-compose.observability.yml` (positions at container-local `/tmp/positions.yaml`, no volume).
- **Repro (E3, deterministic):** stop promtail → append 150 lines to `audit.log` → rotate (mv) → write post-rotation line → restart promtail → query Loki: post-rotation line present, **149/150 rotated lines absent** (1 rescued by inotify race).
- **Expected:** rotated audit content reachable in Loki. **Actual:** permanently absent; pipeline looks healthy (post-rotation lines keep flowing) → **observability blind spot exactly when you most need history** (outage forensics). Secondary: positions in unmounted `/tmp` → restart re-tails from start (duplicates) or, after crash, loses offsets.
- **Root cause:** `__path__` is an exact path with no rotation glob; promtail never opens `audit-<ts>.log`.
- **Fix:** `__path__: /var/log/payesh/audit*.log` (and `server*.log` for deployment-level rotation robustness) + `promtail-positions:/tmp/positions` compose volume (+ `positions:` filename moved to `/tmp/positions/positions.yaml`).
- **Note (caught during fix):** the first attempt used `audit.log*` which does **not** match `audit-<ts>.log` (dash, not dot) — lock asserts the exact `audit*.log` form.
- **Regression locks:** `tests/observability-config.js` — `Promtail tails canonical server.log and audit.log (incl. rotation)` + `promtail rotation glob covers audit-<ts>.log names` + `promtail positions persist across restarts (compose volume)`.
- **Post-fix E3:** fresh promtail with fixed config ingested **150/150** rotated lines; re-tail duplicates from fresh positions demonstrated (why the volume matters).

### F-OBS-02 — HIGH — The repo's own observability CI gate was RED at HEAD (stale tests masked real guards)
- **Location:** `tests/observability-config.js:20` (end-of-file-anchored `rule_files` regex), `tests/wave14-observability.js` T8e (read the **retired** `alerts.yml` tombstone), `tests/observability-config-mutations.js` (expectFail strings stale after #335 check renames; two guard checks missing).
- **Repro:** at `172da62b`, `node tests/observability-config.js` → exit 1 (`Prometheus loads only canonical alert-rules.yml`) — exactly the failing CI step (`Configuration regression`); GitHub API: last 5 `observability-regression` runs all **failure**.
- **Impact:** the whole static job aborted at check #1, so **M1/M3/M4/M5 mutations appeared to "survive"** (suite died before reaching them) and the mutation suite reported 1/6. The gate provided false safety for the whole observability surface, and `T8e` asserted coverage against a 5-line tombstone.
- **Fix:**
  - `rule_files` check rewritten to order-independent exact-list extraction (stronger: re-adding `alerts.yml` now fails).
  - T8e now reads `alert-rules.yml` and asserts the live catalog's 12-signal coverage (honest reconciliation with #335's deliberate retirement of db-errors/pool/cache/outbox/dropped alerts — documented, not hidden).
  - Added missing guard checks: `SyncQueueDepth rule alerts at payesh_sync_queue_depth > 1000` (M1), `collector OTLP port is 4318 in compose` (M3); anchored the scrape-path regex so `/metrics2` no longer satisfies `/metrics` (M4); updated all mutation `expectFail` strings to current check names (M1–M5).
- **Regression locks:** the fixed guards themselves; mutation suite now **6/6 killed** (proves the three-way lock actually bites: rule deletion, OTLP port drift, scrape-path drift, one-way metric rename all detected).
- **Post-fix E3:** 23→30 checks green; mutations 6/6; wave14 95/95; wave14-mutations 12/12.

### F-OBS-03 (was F-OBS-04) — HIGH — `loki-config.yml` cannot load on the pinned Loki 3.1.1 → the reference log pipeline never started
- **Location:** `infra/observability/loki-config.yml` (top-level `retention_enabled: true` = Loki **2.x** field; missing `schema_config`).
- **Repro (E3, real binary):** `loki-linux-amd64 (v3.1.1) -config.file=loki-config.yml` → **parse error** `field retention_enabled not found` (first blocker). After removing it: **panic** `index out of range` in `validateSchemaRequirements` (missing `schema_config`).
- **Root cause:** config written for Loki 2.x and never validated against the pinned 3.1.1 image; present since the stack's first commit (`f91bd355`). **Consequence: in the reference compose stack Loki crashes on boot → zero log ingestion, and the CI `promtail-runtime` job fails** ("Loki did not receive both Promtail streams in time") — this was the second failing CI job (not flake; config defect).
- **Fix:** `compactor.retention_enabled: true` (3.x location; keeps the 720h retention from `limits_config.retention_period`) + minimal 3.x TSDB schema (`schema_config: from 2024-01-01, store tsdb, object_store filesystem, schema v13, index period 24h`).
- **Regression locks:** `tests/observability-config.js` — `loki config is valid for pinned loki 3.1.1`; the CI `promtail-runtime` job (real loki+promtail, Loki API asserts) is the runtime lock and should now pass.
- **Post-fix E3:** Loki boots, `/ready` 200; both streams ingested; retention healthy (marker entry survived multiple compactor cycles; `count_over_time` = 369/369).
- **E3 investigation note (no defect):** `query_range` default `limit` is **100** — early "vanishing lines" were a query artifact, disproven via `count_over_time` (369) and explicit `limit=500`.

### F-OBS-04 (was F-OBS-02-docs) — MEDIUM — Doc drift: retired `alerts.yml` / `CriticalErrorBudgetBurn` claimed as live
- **Location & drift:** `docs/SLO.md:33,90,123` (alerts "codified in alert-rules.yml **and alerts.yml**"; burn-rate table attributed to `CriticalErrorBudgetBurn` in `alerts.yml`), `docs/WAVE14_OBSERVABILITY.md:178-186` (burn-rate row; "Alert rules live in alerts.yml" + stale 13-signal list incl. scrape-down/cardinality-guard; stale dashboard path), `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md:321` (RT2-04 "Prometheus loads **both** files"), `docs/OBSERVABILITY.md` (trace_id listed as required field of **every** audit line while `server/audit.js:566` attaches it only when `currentTraceId()` is set — code comment itself: "فقط وقتی ردیابی فعال است").
- **Why it matters:** SLO §5.2 (multi-window burn-rate alerting) was cited as if live — it is **not** in the P0 catalogue (retired with `alerts.yml` in #335, never re-added). On-call could expect a page that can never fire.
- **Fix:** SLO.md points at the canonical catalogue; §5.2 explicitly marked **design target** + honest coverage-gap note (11 live alerts enumerated; owner decision: port burn-rate rules or mark reference-only); WAVE14 rewritten to the live 11-alert catalog + honest "no longer alerted" list + real dashboard paths (+ noted the orphan unmounted `payesh-dashboard.json`); GROUND_TRUTH RT2-04 corrected ("فقط alert-rules.yml"); OBSERVABILITY.md trace_id row now states the conditional-attachment contract precisely.
- **Regression locks:** `tests/observability-config.js` — 4 doc-reference checks (CriticalErrorBudgetBurn never claimed live; Alert Threshold no longer cites alerts.yml; WAVE14 canonical-file lock; RT2-04 "فقط" lock). **`.github/workflows/observability-regression.yml` path filter extended** (both push + pull_request) with `server/audit.js`, `docs/SLO.md`, `docs/WAVE14_OBSERVABILITY.md`, `docs/OBSERVABILITY.md`, `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` — doc drift can no longer escape the gate.
- **Related (T1):** the *docs'* alert table names `status`/`payesh_eventloop_lag_ms{q}`/`payesh_process_heap_bytes{kind}`/`db_up{driver}` are stale; the live catalogue correctly uses `code` and the canonical node gauges (config suite already locks `code` + canonical names). Doc table wording updated where touched; OBSERVABILITY.md table re-checked at HEAD and consistent with the live catalogue.

### Minor (not fixed — owner decision, documented)
1. **`monitoring/alert-rules.yaml`** (Redis-exporter catalogue, `PayeshRedisLayerDown` etc.) is referenced by 8 docs as the Redis alerting path but **not mounted** in the reference compose (no redis-exporter service) → documented-not-evaluated. The config suite's "secondary catalogue is absent or retired" check passes **vacuously** (regex only matches unindented `- alert:`) — guard is weaker than it looks. Owner decision: wire exporter+rules or retire the file/docs.
2. **`infra/observability/payesh-dashboard.json`** — orphan dashboard file, not mounted by compose (real dashboards are `dashboards/payesh-{main,logs}.json`); noted in WAVE14.
3. **`tests/run.js` (npm test) contains no observability tests** — coverage relies on the dedicated `observability-regression.yml` (path-triggered). If a change touches neither obs paths nor docs, nothing re-runs the gate; considered, left as repo design choice, flagged here.
4. **AM resolved-notification latency:** observed up to ~5–6 min (group_interval semantics) — acceptable, documented in §3 (T5) for on-call expectations.

---

## 3. Task × dimension matrix (evidence levels)

**E3 = real binaries/real app executed in sandbox; E4 = production/on-call — never claimed.**

| Task | Functional | Boundary | Negative | Resilience | Regression |
|---|---|---|---|---|---|
| **T1** metric↔alert | E3: live scrape of real app; all 11 alert target series queried from Prometheus (9 live + 3 lazy-by-design counters, verified registration in metrics.js); `promtool check rules` 11/11 | E3: threshold/`for`/severity matrix read + live firing timings (RedisDown 1m, HighErrorRate 2m) | E3: empty-vector semantics — `payesh_db_up==1 and …` label-set join verified live; 5xx selector empty before first 5xx (correct, no false fire) | E3: Redis outage + 5xx storm → correct alerts, no false positives on 404/401 traffic | Mutation M5 (one-way metric rename) killed; semantic-guard + "all alert metric names occur in metrics.js" |
| **T2** catalogue/drift | E3: single canonical rule_file (order-independent lock); 11-rule count locked | Boundary: re-adding `alerts.yml` entry now fails the exact-list check | E3: CI-red root cause reproduced & fixed (stale regex/tombstone read); 5 mutation guards now actually bite | E3: gate survives file reordering (rule_files no longer position-dependent) | 30/30 config checks incl. new locks; mutations 6/6 |
| **T3** AM config | E3: real alertmanager 0.27.0 booted on the entrypoint-generated config; delivery to webhook sink works | E3: **empty URL → exit 78**, **placeholder `__WEBHOOK_URL__` → exit 78** (repo entrypoint verbatim) | E3: sed escaping (`|` delimiter, `\&|` escaping) verified on the generated file; raw placeholder file correctly *fails* amtool (template by design; CI checks interpolated output) | E3: AM survived alert lifecycle incl. resolution; cluster flags only needed in sandbox (no private IP) — compose network unaffected | amtool check-config in CI + placeholder/fail-closed static checks + new path filters |
| **T4** promtail/loki | E3: loki 3.1.1 + promtail 3.1.1 with repo configs (paths only localized): both streams ingested; **trace correlation verified** — dashboard contract `{…audit-log} | json | trace_id=~"$trace_id"` matched the injected `runtime-trace-001` line; textbox variable (no metadata-selector dependency) | E3: rotation boundary — 149/150 drop with old config; 150/150 with fixed glob (both directions proven) | E3: Loki rejects 2.x config (parse) & panics w/o schema_config; promtail push-retry across Loki downtime (batches delivered after recovery) | E3: restart behavior — positions volume added; re-tail/duplicate behavior demonstrated with fresh positions; inotify vs poll race documented | New config locks (glob, positions volume, loki 3.1.1 validity); CI promtail-runtime job is the runtime lock |
| **T5** e2e failure detection | E3: **full chain** Metric→Rule→Prometheus→AM→webhook: 5 firing notifications on real outage; alert states tracked in Prometheus API | E3: firing timings matched `for:` values exactly (RedisDown 21:20:25 ≈ outage+1m+scrape) | E3: 404/401 traffic did not fire HighErrorRate; no alert on healthy baseline | E3: recovery — Redis restored → all alerts resolved → 3 resolved notifications (send_resolved verified) | Regression workflow now path-covers docs + audit.js; full suite green at HEAD |

**E4 (not verified — EXTERNAL BLOCKER):** real on-call receiver + human acknowledgement.
- **Blocker:** production `ALERTMANAGER_WEBHOOK_URL` is an owner secret (correctly uncommitted; `env.observability.example` ships empty). No on-call channel reachable from this sandbox.
- **Owner:** repo owner (rezaa2544) / ops.
- **Required evidence for E4:** (1) deploy `docker-compose.observability.yml` with a real webhook; (2) trigger a known P0 alert (e.g., Redis outage drill); (3) timestamped channel receipt (Matrix/Slack/phone) + on-call ack inside `repeat_interval`; (4) `amtool`/AM UI history showing the group. Nothing here substitutes for that.

---

## 4. Mandatory checklist coverage

| Checklist item | Status |
|---|---|
| metric label drift | ✅ `code` label locked (old `status` doc-side drift documented); label-set `and` join verified live |
| legacy metric references | ✅ all 13 alert metric names ⊆ metrics.js (lock); stale doc names fixed |
| PromQL semantic mismatch | ✅ `promtool check rules` + live firing semantics (for/thresholds/rates) |
| duplicate alert definitions | ✅ single canonical rule_file enforced (exact-list lock); retired tombstone has no active alert |
| malformed config | ✅ promtool/amtool on real binaries; **loki 2.x field found & fixed** |
| empty/placeholder credentials | ✅ fail-closed ×2 exit 78 with real binary; owner endpoint empty (locked) |
| config interpolation | ✅ entrypoint sed verified on generated file (escaping correct) |
| alert firing | ✅ 4 real alerts fired from a real outage |
| notification delivery | ✅ 5 firing + 3 resolved webhooks received (E3 sink); E4 ack = EXTERNAL BLOCKER |
| logging parser mismatch | ✅ promtail json+structured_metadata pipeline exercised; dashboard parser query matched |
| trace_id/traceId drift | ✅ `trace_id` (snake) end-to-end; conditional-attachment doc/impl contradiction fixed |
| Loki ingestion | ✅ verified after loki-config fix (was **zero** — F-OBS-03) |
| dropped logs | ✅ **149/150 rotation drop proven & fixed** (F-OBS-01) |
| restart behavior | ✅ positions volume added; re-tail/duplicate demonstrated; promtail push-retry across Loki down |

---

## 5. Changes made (11 files, +94/−27)

| File | Change |
|---|---|
| `infra/observability/loki-config.yml` | F-OBS-03: 3.x-valid (schema_config + compactor.retention_enabled) |
| `infra/observability/promtail.yml` | F-OBS-01: rotation globs `audit*.log`/`server*.log`, positions path under `/tmp/positions` |
| `infra/observability/docker-compose.observability.yml` | F-OBS-01: `promtail-positions` volume (service + top-level) |
| `tests/observability-config.js` | F-OBS-02 + locks: rule_files exact-list, SyncQueueDepth rule, OTLP port, anchored /metrics, promtail glob/positions, loki 3.1.1 validity, 4 doc-reference locks (21→30 checks) |
| `tests/observability-config-mutations.js` | F-OBS-02: expectFail strings synced to current check names (all 5 mutations now killable) |
| `tests/wave14-observability.js` | F-OBS-02: T8e reads canonical catalogue, live 12-signal contract |
| `.github/workflows/observability-regression.yml` | path filters (push+PR): +`server/audit.js`, 4 docs |
| `docs/SLO.md` | F-OBS-04: canonical catalogue refs; §5.2 design-target + coverage-gap note |
| `docs/WAVE14_OBSERVABILITY.md` | F-OBS-04: live 11-alert catalog, honest "no longer alerted" list, real dashboard paths, orphan dashboard noted |
| `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` | F-OBS-04: RT2-04 corrected (loads only alert-rules.yml) |
| `docs/OBSERVABILITY.md` | F-OBS-04: trace_id conditional-attachment contract |

---

## 6. Final test state at `172da62b` + fixes (2026-09-22 ~22:00 local)

| Suite | Result |
|---|---|
| `observability-config.js` | **30/30 PASS** (was 20/21 RED at HEAD) |
| `observability-semantic-guard.js` | PASS |
| `observability-doc-coverage.js` | 61/61 |
| `observability-dashboards.js` | 30/30 |
| `observability-live-setup-coverage.js` | PASS |
| `observability-s2-metrics.test.js` | PASS |
| `wave14-observability.js` | 95/95 (was 94/95 RED at HEAD) |
| `wave14-observability-mutations.js` | 12/12 |
| `observability-config-mutations.js` | **6/6 (was 1/6 RED at HEAD)** |
| `promtool check rules / check config` | SUCCESS (11 rules) |
| `amtool check-config` (interpolated) | SUCCESS |

GitHub CI at `172da62b` (pre-fix): `observability-regression` last 5 runs **failure** (static job at `Configuration regression`, promtail-runtime at `Verify Loki received both streams`) — both root causes fixed above; the workflow will re-trigger on push of these files (path filter now covers all of them). Node.js CI failure (F-RT-001) is a separate, pre-existing, out-of-scope-for-this-task red.

**Environment note:** no docker in sandbox — all E3 ran on pinned upstream binaries (prometheus 2.54.1, alertmanager 0.27.0, loki 3.1.1, promtail 3.1.1) + the real app in production mode (PG+Redis). AM gossip-mesh needed a local advertise flag (sandbox has no private IP) — compose networking unaffected. Sandbox artifacts cleaned; binaries kept at `/opt/obs` (outside workspace) for re-runs; workspace snapshot-eligible size ≈ 45 MB.

---

## 7. Addendum — post-reset re-verification (2026-09-23)

Sandbox reset (5th) dropped `.git` and `node22`. Reconstructed and re-verified:

- GitHub API re-check: **main tip still `172da62b63f70d406ffad69893851a01b042ffc4`** — no new commits since the audit; pin holds.
- Fresh full clone @ `172da62b` + the 11 fixed files re-applied (preserved verbatim from the previous tree) → `git status` shows exactly the 11 intended modifications (+95/−28).
- **All 9 observability suites re-run green on the fresh clone** (system node v20): config 30/30, semantic-guard PASS, doc-coverage 61/61, dashboards 30/30, live-setup PASS, s2-metrics PASS, wave14 95/95, wave14-mutations 12/12, config-mutations 6/6.
- Machine-applicable patch of the complete fix set: **`/home/user/arena4-observability-fix.patch`** (326 lines; `git apply` on a clean `172da62b` tree).
- Working tree (excl. `.git`/`node_modules`): 40 MB — under the 100 MB workspace ceiling.


## 8. Addendum — Re-issue protocol execution at `5d4a48f7` (2026-09-23)

### 8.1 HEAD moved: `172da62b` → `5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2`

Current main tip at execution time = **`5d4a48f7`** (supersedes the §7 pin). Obs-scope delta `172da62b..5d4a48f7`:

| File | Change | Assessment |
|---|---|---|
| `tests/observability-config.js` | 1 line: `\s*$` → `(?:\s*)$` (commit `dff14e07` "test(obs): tolerate valid Prometheus rule_files formatting") | **NO-OP FIX.** Without `m`-flag, `$` is end-of-string in both forms — semantically identical. The branch's own CI runs **failed** (obs-regression red ×2 at `dff14e07`), and it was merged anyway. |
| `tests/secret-scan.js` | +2 lines (canonical-rules readable check) | Benign, unrelated to this task. |

**Baseline re-proven at `5d4a48f7` (pre-my-fix):** `node tests/observability-config.js` → **20/21 FAIL** — the same stale `rule_files` check (F-OBS-02) is alive at the current HEAD. CI at the tip: no obs-regression run exists at `5d4a48f7`; latest main run (`b3721b99`, an ancestor) = failure. Queued/absent CI runs were **not** counted as evidence (per protocol).

**PR/branch reconciliation (GitHub API):** 13 open PRs — all `fix/phase7-*`, **none observability** (no conflict with this fix). 100 branches; 44 legacy `alert-autofix-N`; `obs/runtime-verification-current-main-fix-2026-09-22` (tip `dff14e07`) = source of the no-op fix. `b3721b99` is an ancestor of main.

### 8.2 Re-landing at the new base

`git reset --hard origin/main` → stale (172da62b-based) patch applied with `--reject`: 10/11 clean, `tests/observability-config.js` whole-file reject → **hand-rebuilt**. The rebuild silently dropped 3 of my own checks (SyncQueueDepth rule, OTLP 4318, anchored `/metrics`) — the **mutation suite caught all 3** (M1/M3/M4); re-added. Final tree = **13 content-modified files** (11 previous + `monitoring/alert-rules.yaml` + `docs/REDIS_MONITORING_ALERTING.md`).

### 8.3 New findings this turn (repo-owned → fixed + locked)

**F-OBS-05 (MEDIUM) — `RedisDown` defined in TWO catalogues with different signals.**
`monitoring/alert-rules.yaml:13` (`expr: redis_up == 0`, exporter-side) vs `infra/observability/alert-rules.yml` (`expr: payesh_redis_up == 0`, app-side). Alertmanager groups by `alertname`: if the (documented) Redis catalogue is mounted, both fire as one `RedisDown` group → mixed notifications, ambiguous resolve semantics, runbook/dashboard ambiguity. **Fix:** renamed the exporter-side alert to `RedisExporterDown` (catalogue + `docs/REDIS_MONITORING_ALERTING.md` ×3 refs; all other doc refs to `RedisDown` point at the canonical app-side alert and were untouched). **Lock:** `tests/observability-config.js` cross-catalogue duplicate guard — live-verified (re-introducing the dup fails the suite: 30/31 → restored: 31/31… final suite 32/32).

**T2-R4 doc-catalog drift (LOW) — `DiskSpaceLow` missing from the "live rules" table** in `docs/OBSERVABILITY.md` (table claims to list `infra/observability/alert-rules.yml` alerts: 10/11). **Fix:** row added. **Lock:** suite now asserts every live catalogue alert appears in that table — live-verified (removing the row → 31/32; restored → 32/32).

**Minor (owner, not fixed):** `monitoring/alert-rules.yml` is a **tracked broken (tombstone) symlink** — git mode 120000, target = 6-line deprecation notice. `fs.existsSync` = false, so the "secondary catalogue absent or retired" check passes via the *absent* branch (the *retired-text* branch is never exercised). Cosmetic/hygiene; the deprecation intent is clear. Naive `readFileSync` walks crash on it (hit during T2-R3; scan made symlink-safe).

### 8.4 Promtail EOL — architectural boundary (NOT a defect; owner decision)

Per protocol, EOL status was **proven, not assumed**: upstream Grafana official docs state **Promtail is EOL as of 2026-03-02** (development moved to Grafana Alloy; migration tool `alloy convert --source-format=promtail`). The repo pins `promtail:3.1.1` in `infra/observability/docker-compose.observability.yml` and `promtail.yml` is the live pipeline config. This is a **dependency/architecture boundary item requiring an owner decision** (stay on pinned 3.1.1 as-is vs migrate to Alloy vs track promtail security releases). **Loki 3.1.1 is NOT EOL** (3.x line active) — only the promtail pin is affected. Registered as owner-decision item; no code change made for it.

### 8.5 Five tasks × five rounds — execution matrix (static vs runtime separated)

**T1 — Metric↔Alert semantic integrity**
| Round | Type | Evidence |
|---|---|---|
| R1 | static | `promtool check rules` → **11 rules SUCCESS** |
| R2 | static | config suite: alertname↔expr↔severity mapping (32/32) + mutation suite 6/6 (metric-name/for/severity mutations all killed) |
| R3 | static | semantic-guard suite **PASS** (exprs vs registry, lazy counters by design) |
| R4 | runtime | live scrape: `payesh-api` target **up**; 9 live series + 3 lazy (5xx counter 0 until first 5xx — expected) |
| R5 | runtime | real outage (Redis killed + 5xx load): `RedisDown` firing, `HighErrorRate` firing, `MemoryHigh` firing (heap genuinely 85%+) — all resolved after Redis restart |

**T2 — Duplicate/legacy alert catalogue**
| Round | Type | Evidence |
|---|---|---|
| R1 | static | compose mounts exactly one rule file; suite locks it; 11 rules |
| R2 | static | full-repo yml scan: 2 catalogues + tombstone symlink; 23 distinct names; **RedisDown ×2 found** |
| R3 | static | symlink-safe cross-file duplicate scan → caught F-OBS-05 → 0 after rename |
| R4 | static | doc↔catalogue reconciliation → **DiskSpaceLow missing** → fixed + locked; WAL table verified as a correctly-separate external-alert section |
| R5 | runtime | `/api/v1/rules` → **exactly 11 rules from the canonical file** (no orphan/secondary file loaded) |

**T3 — Alertmanager fail-closed / secret placeholder**
| Round | Type | Evidence |
|---|---|---|
| R1 | static | entrypoint logic review: 2 refusal paths; compose uses entrypoint (suite-locked) |
| R2 | static | `amtool check-config` on entrypoint-**generated** config → valid; `__WEBHOOK_URL__` never reaches a running AM |
| R3 | runtime | fail-closed ×2 → **exit 78** with exact stderr (unset; placeholder) using the repo's real entrypoint + real AM 0.27.0 binary |
| R4 | runtime | webhook delivery to real sink: **6 notifications (4 firing + 2 resolved)**, correct labels/annotations/groupKey |
| R5 | static | secret-scan suite green; no real secrets in committed AM config; generated file is build-time only |

**T4 — Promtail/Loki/trace/log correlation**
| Round | Type | Evidence |
|---|---|---|
| R1 | static+runtime | pinned **Loki 3.1.1 boots the repo `loki-config.yml`** (`/ready` 200); pinned **promtail 3.1.1** runs the repo `promtail.yml` (targets added) |
| R2 | runtime | **false-green contract (logging contract §live drill):** 2 fresh outage-window lines (server+audit) → both in Loki |
| R3 | runtime | rotation both directions: OLD exact-path config **0/80** rotated lines (drop — deterministic: file rotated while its promtail ran); FIXED glob config **80/80** + post-rotation line (recovery) |
| R4 | runtime | trace correlation: LogQL `{service="payesh",log_source="audit-log"} \| json \| trace_id =~ "e3-trace-20260923-001"` → **1/1** returned |
| R5 | static | EOL boundary documented (owner decision, §8.4); both streams carry correct `log_source` labels (verified via `filename` stream labels in Loki) |

**T5 — e2e alert → notification → acknowledgement → recovery**
| Round | Type | Evidence |
|---|---|---|
| R1 | runtime | real outage → 3 alerts firing (`RedisDown`, `HighErrorRate`, synthetic delivery probe) |
| R2 | runtime | sink received firing notifications with full labels (`alertname/instance/job/severity`) + Persian annotations (`summary`/`description`) |
| R3 | runtime | Redis restarted → **resolved notifications for `RedisDown` + `HighErrorRate`** (recovery end-to-end) |
| R4 | runtime | AM pipeline ran the **entrypoint-generated** config (fail-closed proofs + `amtool` on the generated file); `group_by: severity`, correct groupKeys |
| R5 | — | **acknowledgement / on-call: EXTERNAL BLOCKER** (no ack receiver in repo; see §8.7 E4) |

### 8.6 Final suite state at `5d4a48f7` + all fixes (2026-09-23, system node v20)

| Suite | Result |
|---|---|
| `tests/observability-config.js` | **32/32 PASS** (2 new locks this turn: cross-catalogue duplicate guard, live-table completeness) |
| `tests/observability-config-mutations.js` | **6/6** (each mutation still killed) |
| `tests/observability-semantic-guard.js` | **PASS** |
| `tests/observability-doc-coverage.js` | **61/61** |
| `tests/observability-dashboards.js` | **30/30** |
| `tests/observability-live-setup-coverage.js` | **28/28** |
| `tests/observability-s2-metrics.test.js` | **4/4** |
| `tests/wave14-observability.js` | **95/95** |
| `tests/wave14-observability-mutations.js` | **12/12** |

Both new locks were **failure-verified** (reverting the fix → suite fails; restoring → green). E3 raw evidence: `/home/user/arena4-e3-notifications.jsonl` (15 notification events).

### 8.7 Final verdict by evidence level (separate statuses, per protocol)

- **E1 — Static reading of current-HEAD sources: COMPLETE.** Pinned `5d4a48f7`; all observability sources re-read at the tip; 1-line delta reconciled and assessed (no-op fix proven); no historical evidence reused without re-verification.
- **E2 — Static tool validation: COMPLETE.** 9/9 suites green (table §8.6) + `promtool check rules` (11 SUCCESS) + `amtool check-config` (valid). Note: `promtool check config infra/observability/prometheus.yml` fails *outside the container* only because the file references container path `/etc/prometheus/` — expected context artifact; the live E3 load is the valid evidence.
- **E3 — Runtime on real binaries + real app + real failure: COMPLETE (this turn, at `5d4a48f7`).** Real app (production env, PG+Redis), real Prometheus 2.54.1 / Alertmanager 0.27.0 / Loki 3.1.1 / promtail 3.1.1; real Redis outage + real 5xx load; all rounds in §8.5 executed and evidenced. No mock substitution; no queued CI counted.
- **E4 — On-call acknowledgement / human notification: NOT VERIFIED — EXTERNAL BLOCKER.** Owner: repo owner (`rezaa2544`). No ack-capable receiver exists in the repo; required evidence to close: a real receiver endpoint, a working acknowledgement path, and delivery proof to the actual on-call tooling. No E4 evidence was fabricated, and nothing below E4 was promoted to E4.

### 8.8 Deliverables (regenerated this turn)

- **Patch:** `/home/user/arena4-observability-fix.patch` — 396 lines, **13 files**, `git apply --check` **clean** against pristine `5d4a48f7` (verified via stash → check → pop).
- **E3 evidence:** `/home/user/arena4-e3-notifications.jsonl`.
- **Owner-decision items (not defects):** (1) Promtail EOL → Alloy migration boundary; (2) unmounted `monitoring/alert-rules.yaml` (now name-collision-free post-F-OBS-05) — mount or retire; (3) tombstone symlink `monitoring/alert-rules.yml`; (4) orphan `payesh-dashboard.json`; (5) obs suites not in `npm test`.
