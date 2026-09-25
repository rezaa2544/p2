# Arena 6 — Security / Red Team Audit Report

**Repository:** `rezaa2544/p2` · **Current HEAD (reconciled, fast-forward from `ecc8b40b`):** `5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2` (= origin/main via `ls-remote`+fetch+update-ref; 239 commits ahead of previous audit SHA) · **Date:** 2026-09-23 (Asia/Tehran) · **Evidence level:** **E3** throughout. **E4 NOT VERIFIED.**

## 0. Governing bases (read before work — Rule 1)

| Source | Status |
|---|---|
| `docs/PROJECT_INTELLIGENCE.md` (v1.0.1) | **READ** (present at this HEAD; mandatory loading order applied) |
| `docs/ENGINEERING_EXECUTION_AND_VERIFICATION_POLICY.md` (v1.3.0) | **READ** — Rules 1–31 govern (2/3/5/6/7/10/15/21/27/29/30) |
| `docs/SECURITY_AUDIT_CHECKLIST.md` | **READ** — baseline now EXISTS at this HEAD (added within the 239-commit range; at `ecc8b40b` it was absent — **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** applied then, reconstructing never occurred) |
| `docs/ROADMAP.md` + `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md` | **READ** — Gate: Phase 8.2 Exit NOT VERIFIED · 8.3 BLOCKED · Production GO NOT DECLARED · E4 external |
| Prior security audits: `SECURITY_FINDINGS_REGISTER.md` (rc11+post-lock), `PEN_TEST_CHECKLIST.md`, `ZERO_TRUST_SECURITY_AUDIT.md`, `SECRETS_MANAGEMENT.md`, prior Arena report at `ecc8b40b` | **READ** — historical evidence only; all findings re-verified on current HEAD |

**HEAD reconcile:** `git fetch origin main` → FF `ecc8b40b → 5d4a48f` → clean tree (`git status` = 0) → remote URL restored. Upstream delta includes: security.yml continue-on-error removal (PR #345), `test(security): pin canonical alert rules path` (`6af53f3`), sync.js/outbox/db/worker changes, new SECURITY_AUDIT_CHECKLIST + PROJECT_INTELLIGENCE docs.

## 1. Verdict

🏁 **FAILED** (repo-owned defects open at current HEAD; primary secret gate red in CI). Counter-evidence also recorded: auth/session/RBAC/WAF/XSS/rate-limit cores verified green under E3 with run×2; one upstream false-green fix verified (`continue-on-error` = 0). `Roadmap Reconciliation Required` — I do not upgrade roadmap statuses. **This audit does NOT replace a specialist E4 penetration test.**

## 2. Task × Round matrix (Rule 15 — 5 tasks × ≥5 independent rounds, run @ `5d4a48f`)

### Task 1 — secret / token / session / auth boundary
| Round | What ran | Result |
|---|---|---|
| R1 Functional | `secret-scan` baseline; `check-authz`; login→me live | ❌ **crash (F-A7-01)**; ✅ EXIT0; ✅ 200/200 |
| R2 Boundary | boot with **published example secret**; `.example` scan boundary; garbage/empty token | ❌ **boot 200 (F-A7-02)**; ❌ **FN (F-A7-03)**; ✅ 401/401 |
| R3 Malformed/Adversarial | `alg=none`, wrong-key, current-key forged superadmin, `ghp_` injection | ✅ 401, ✅ 401, ⚠️ 200 (=impact of known key, ties F-A7-02), ✅ `.env` hit caught / `.example` silent |
| R4 Failure | logout→replay; PREV-rotation dance; OTP replay (suite) | ✅ 401 after logout; ✅ grace 200 → cleared **401**; ✅ replay-after-use 401 |
| R5 Independent regression | `session-revocation` ×2, `otp-ratelimit` ×2, `secrets-management-coverage`, `audit.js`, `security-incident-log-coverage`, `run.js` | ✅ 16/16, ✅ 49/49, ✅ 31/31, ✅ 47/47, ✅ 37/37, ✅ 35/35 |

### Task 2 — authorization / RBAC / tenant / IDOR
| Round | What ran | Result |
|---|---|---|
| R1 Functional | `check-authz`, `occ`, `id-collision` | ✅ 0 drift, ✅ 18/18, ✅ 11/11 |
| R2 Boundary | `authz-model` unknown-collections + fail-closed checks | ❌ **255/257 (F-A7-10)**; D13/D14 fail-closed ✅ |
| R3 Malformed/Adversarial | focused teacher→sync `report_logs` repro (exact suite op-shape); manager cross-school | ✅ authz **enforced** (role_denied, no row ×2); ❌ **envelope inconsistency (F-A7-08)**; ✅ cross 403 no-row |
| R4 Failure/Negative | `red-team` (unauth/cross-origin/PII), `reports-tenant-isolation` unauth 401 greens, wave5 | ✅ 10/10 ×2; ✅ 401 greens; ❌ rti **7/4 reds ×2 (F-A7-09 + oracle)**; ⚠️ wave5 29/37 (PG-dependent 503s + ERR) |
| R5 Independent regression | `red-team-mutations`, `rate-limit-mutations`, re-runs of above ×2 | ✅ 4/4 killed, ✅ 4/4 killed, stable counts |

### Task 3 — input validation / injection / SSRF / file upload
| Round | What ran | Result |
|---|---|---|
| R1 Functional | `xss-guard`, `form-validation-ux` (after `node build.js`), `waf-enforce`, `public-security` | ✅ 23/23, ✅ 28/28, ✅ 33/33, ✅ 10/10 |
| R2 Boundary | oversize body (5000-char), huge Content-Length, empty/short fields | ✅ 413 `body_too_large` generic; ✅ 408; ✅ 400 `missing_fields`/`bad_phone` |
| R3 Malformed/Adversarial | truncated JSON; `' OR 1=1--`; NoSQL `$gt` object; `<img onerror>` field | ❌ **500 generic (F-A7-11)**; ✅ 400; ✅ 400; ✅ 400 `bad_phone` |
| R4 Failure | WAF block paths, `public-security` fail-closed, red-team RT-01…10 | ✅ waf-enforce 33/33, ✅ 10/10 ×2 |
| R5 Regression/Alt path | `waf-mutations`, `red-team-mutations`, `xss-guard` ×2; SSRF surface static; file-upload/traversal suites | ✅ 4/4, ✅ 4/4, ✅ stable; SSRF = single guarded webhook (F-A7-12); **named ssrf/path-traversal/file-upload/sql-injection/input-validation suites NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** |

### Task 4 — rate limiting / error disclosure / dependency supply chain
| Round | What ran | Result |
|---|---|---|
| R1 Functional | `npm audit --audit-level=high`, `supply-chain` | ✅ 0 vulns ×2; ❌ **5/7 ×2 (F-A7-05)** |
| R2 Boundary | `config-audit` code↔doc boundary; SBOM freshness | ❌ **13/15 ×2, 9 vars (F-A7-07)**; ❌ SC-01 SBOM stale |
| R3 Adversarial | rotating `X-Forwarded-For` send-code ×8; `rate-limit-mutations` | ✅ 200→429×7 (spoof ineffective); ✅ 4/4 killed |
| R4 Failure/disclosure | error bodies on 500/413/400; fake-cred grep in workflows | ✅ generic codes only, no stack/SQL/topology; ✅ none |
| R5 Regression | `otp-ratelimit-mutations` (long), `supply-chain` re-run, `config-audit` re-run | ❌ **7/11 stale anchors (F-A7-06)**; ❌ stable 5/7; ❌ stable 13/15 |

### Task 5 — adversarial regression + security evidence contract
| Round | What ran | Result |
|---|---|---|
| R1 Functional | gates that CI actually runs: `run.js`, `check-authz`, `secret-scan`, `waf-enforce`, `waf-ddos --unit-only` | ✅ 35/35, ✅ 0-drift, ❌ **crash (F-A7-01)**, ✅ 33/33, ✅ unit |
| R2 Boundary | workflow contract: `continue-on-error` inventory, suite membership, cron inventory | ✅ **0 continue-on-error** (upstream fix VERIFIED); ❌ **orphan suites + phantom nightly (F-A7-04)**; crons = codacy+fortify only |
| R3 Malformed/Adversarial | false-green review: fake creds, skip-as-pass, misleading failure text, broken-symlink hazard | ✅ no fake creds; ⚠️ skip→exit0 paths exist in session-revocation env-gates (static); ⚠️ jsdom-under-node<22 misleading text (static); ❌ crash doubles as scan-abort hazard (F-A7-01) |
| R4 Failure | full `waf-ddos` (was INT-0 red at prior SHA) | ✅ **29/29 EXIT0 at this HEAD** (seed present — prior red resolved) |
| R5 Independent regression / external | GitHub Actions API for exact SHA + job breakdown; Evidence Contract self-audit | ❌ **Security Program = failure; Secret scan job = failure** (external corroboration of F-A7-01); Codacy failure (tooling, non-blocking per GT); Node.js CI = success; contract audit below |

## 3. Findings register (Reproduce → Evidence → Root Cause → Impact → Remediation → Regression → Independent Verification)

### F-A7-01 — Secret-scan gate crashes at current HEAD (broken symlink) — **Finding · REPRODUCED** · Severity **HIGH**
1. **Reproduce:** `cd p2 && node tests/secret-scan.js` → `Error: ENOENT … open '…/monitoring/alert-rules.yml'`, EXIT=1, no final verdict line.
2. **Evidence:** run×3 local (`a7-ss.log`, `a7_fn1/2.log`); `ls -la monitoring/` shows `alert-rules.yml -> # DEPRECATED — canonical…` = **broken symlink whose target is deprecation prose, not a path**; external CI: Actions run `35846202502` on `5d4a48f` → job **“Secret scan” = failure** (all other Security Program jobs success).
3. **Root cause:** deprecation marker committed as a symlink with multi-line text target; `tests/secret-scan.js:93` `readFileSync` over walk output has no dangling-symlink guard; crash occurs **mid-scan** (files alphabetically after `monitoring/` never read).
4. **Impact:** repo’s primary secret gate is RED in CI at HEAD **and** scan coverage is truncated (false-negative window) — ironic failure mode for a secret scanner (Rule 4/10).
5. **Remediation:** commit the marker as a regular file (content already authored) or remove it (canonical = `infra/observability/alert-rules.yml`); make walker skip+report dangling symlinks explicitly (fail or warn per policy, never uncaught-crash); optionally scan via `git ls-files`.
6. **Regression test:** secret-scan green ×2 on clean tree + fixture containing a dangling symlink handled by design; CI Secret-scan job success on the fix SHA.
7. **Independent verification:** re-run locally + GitHub Actions job conclusion on exact SHA (external). — *Status: Finding (fix not applied: Arena is not the assigned coder; Rule 30 closure requires Tech-Lead-assigned fix task).*

### F-A7-02 — Published example JWT secret accepted at boot — **Finding · REPRODUCED** · Severity **MEDIUM (conditional → CRITICAL on copy-paste deploys)**
1. **Reproduce:** `PAYESH_JWT_SECRET=<value from .env.example:38> … node server/index.js` → `/api/health` **200**.
2. **Evidence:** live boot @`5d4a48f` (`a7_exsec.log`, run×1; same probe at `ecc8b40b` run×1 — historical corroboration); static `server/index.js` boot check = length≥32 only; `CONFIGURATION_REFERENCE.md` instructs copy→`.env`; impact demo: token signed with configured known key → **200 superadmin** (`forged_role_current_key=200`).
3. **Root cause:** no denylist/entropy-source check for globally-known example values.
4. **Impact:** any deployment copying the example shares a public signing key → universal session forgery.
5. **Remediation:** boot-reject known example/low-entropy values with actionable FATAL message.
6. **Regression:** boot with example ⇒ exit 1; random 64-hex ⇒ boots.
7. **Independent verification:** re-boot probe + CI/local run on fix SHA.

### F-A7-03 — Secret-scan extension allowlist false-negative (`.example`) — **Finding · REPRODUCED** · Severity **MEDIUM**
1. **Reproduce:** plant `ghp_…` in `docs/_a7_probe.env.example` and `docs/_a7_probe.env`; run scanner.
2. **Evidence:** `.env` → `⚠️ GitHub token` hit printed; `.example` → **no hit** while both were processed before the F-A7-01 crash point (docs/ < monitoring/); run×1 @`5d4a48f` + run×2 @`ecc8b40b` (prior report).
3. **Root cause:** walker extension allowlist lacks `.example` (and any extension outside the fixed set).
4. **Impact:** secrets in example/manifest/template files ship scanned-clean — checklist §1 control defeated.
5. **Remediation:** scan full tracked set (`git ls-files`) or add `.example` + catch-all text extensions.
6. **Regression:** token in `.example` ⇒ scanner fails; clean tree ⇒ green.
7. **Independent verification:** repeat probe + CI job.

### F-A7-04 — Phantom “nightly flow” + orphaned security suites — **Finding · REPRODUCED** · Severity **HIGH**
1. **Reproduce:** `grep -nE "xss-guard|supply-chain|authz-model|config-audit|session-revocation|otp-ratelimit|public-security|red-team|rate-limit-mutations|reports-tenant|form-validation|audit\.js|secrets-management" .github/workflows/*.yml` → only comments; `grep cron` → codacy+fortify only.
2. **Evidence:** workflow greps @`5d4a48f` (rounds T5-R1/R2); `security.yml:10` still claims suites “run in the local/nightly flow”; no such workflow exists. **Counter-evidence (fix verified):** `continue-on-error` inventory = **0** (upstream PR #345 — prior F-S04 limb FIXED & VERIFIED at this HEAD).
3. **Root cause:** documentation claim written when a nightly was planned; suites added without wiring; merge-gate comment retained.
4. **Impact:** red suites (F-A7-05/06/07/08/09/10) are invisible to CI; reviewers may believe adversarial suites execute nightly.
5. **Remediation:** create nightly workflow running the full security matrix with hard failure (seed/redis services as needed) **or** delete the claim and register the gap; add parity contract test (suite list ⊆ executed list) like existing contract-test pattern.
6. **Regression:** contract test fails if a security suite is orphaned or the claim reappears without a cron.
7. **Independent verification:** `actions` API shows the nightly run executing each named suite.

### F-A7-05 — Supply-chain gates red (SBOM stale + baseline drift) — **Finding · REPRODUCED** · Severity **MEDIUM**
1. **Reproduce:** `node tests/supply-chain.js` → EXIT=1, **5/7**; failures: **SC-01** (SBOM package count/fingerprint stale vs lockfile) + **SC-05** (lock SHA-256/resolved-count/jsdom drift vs `DEPENDENCY_DRIFT_BASELINE`).
2. **Evidence:** run×2 @`5d4a48f` (`a7-sc.log`, `a7-sc2.log`); `npm audit` = 0 vulns ×2 (no known-CVE exposure — drift is process/integrity, not CVE).
3. **Root cause:** intentional dep changes (jsdom direct dep, lock updates) without re-approving baseline + regenerating `docs/SBOM.spdx.json`; suite orphaned (F-A7-04) so red invisible.
4. **Impact:** lockfile-integrity gate and SBOM provenance broken → supply-chain evidence contract fails (checklist §8).
5. **Remediation:** re-cut baseline through documented approval; regenerate SBOM in CI on every lock change; gate the suite.
6. **Regression:** 7/7 green post-rebaseline; deliberate lock edit ⇒ red in CI.
7. **Independent verification:** CI job + local re-run.

### F-A7-06 — OTP rate-limit mutation guard incomplete (7/11) — **Finding · REPRODUCED** · Severity **MEDIUM**
1. **Reproduce:** `node tests/otp-ratelimit-mutations.js` → EXIT=1, “جهش: 7/11 کشته · جهش‌مندی ناقص ❌”.
2. **Evidence:** run×1 @`5d4a48f` (287–312 s, `a7_orm.log`); survivors **M3–M6 all “الگو پیدا نشد”** (stale source anchors for daily/phone/IP caps); historical runs @`ecc8b40b`: 7/11 and 6/11 (both evidence sets; variance noted).
3. **Root cause:** mutation anchors not refactored with source (drift), so cap-removal mutants never apply ⇒ guard cannot detect regression of those caps.
4. **Impact:** four rate-cap controls can regress silently (Rule 4 fake-green family).
5. **Remediation:** re-anchor M3–M6 to current source expressions; fail suite on “pattern not found” (harness self-check) instead of counting as survived-without-test.
6. **Regression:** 11/11 killed ×2 consecutive runs.
7. **Independent verification:** re-run on fix SHA.

### F-A7-07 — Config↔doc drift: 9 undocumented code variables — **Finding · REPRODUCED** · Severity **MEDIUM**
1. **Reproduce:** `node tools/config-audit.js` → EXIT=1; `node tests/config-audit.js` → 13/15.
2. **Evidence:** run×2 (suite+tool) @`5d4a48f`; missing from `CONFIGURATION_REFERENCE §۲`: `GATE_REQUIRE_CLEAN`, `GATE_REQUIRE_REMOTE_MATCH`, `PAYESH_ALLOW_DEV_MEMORY_AUTHORITY`, `PAYESH_FORCE_HYDRATION`, **`PAYESH_OUTBOX_LEASE_SECONDS` (new since prior SHA)**, `PAYESH_STRICT_BASE_VERSION`, `PAYESH_STRICT_OCC`, `PGURL`, **`TRUSTED_PROXIES`**.
3. **Root cause:** code adds env switches faster than doc §۲ updates; suite orphaned (F-A7-04).
4. **Impact:** security-relevant switches (proxy trust ⇒ Secure/XFP path; dev memory authority; boot gates) invisible to operators (checklist §9/§10 config exposure).
5. **Remediation:** document all 9 (or remove dead vars); gate config-audit in CI.
6. **Regression:** tool exit 0 in CI.
7. **Independent verification:** CI + local re-run.

### F-A7-08 — `/api/sync` denial-envelope inconsistency — **Finding · REPRODUCED** · Severity **LOW-MEDIUM**
1. **Reproduce:** focused harness (exact suite op-shape): teacher `ins report_logs` → **HTTP 200 + `results[0]={ok:false, code:"role_denied"}` + rows unchanged**; manager cross-school → **HTTP 403 `out_of_scope`**, no row.
2. **Evidence:** run×2 @`5d4a48f` (`a7_tsr1/2.log`); suite oracle `reports-tenant-isolation.js:181-190` asserts 403 ⇒ red (authz itself **enforced** — earlier “200 = bypass” hypothesis disproved again).
3. **Root cause:** batch endpoint maps `out_of_scope` to HTTP 403 but leaves per-op `role_denied` at envelope 200.
4. **Impact:** clients trusting HTTP status misread role denials as success; suite red hides in nightly gap.
5. **Remediation:** unify denial mapping (403 for all denial classes or documented envelope + fixed oracle).
6. **Regression:** rti 11/11 + contract assertion on both classes.
7. **Independent verification:** focused harness + suite green on fix SHA.

### F-A7-09 — Tenant/report isolation suite reds under in-memory (PG-dependent) — **Finding · NEEDS RECHECK (PG)** · Severity **indeterminate until PG**
1. **Reproduce:** `node tests/reports-tenant-isolation.js` → 7✅/4❌ ×2 @`5d4a48f` (attendance 503/403 `AUTHORITY_UNAVAILABLE`, geometry 403≠200); `wave5-authz` 29/37 with same 503 class ×2.
2. **Evidence:** run×2 each; bodies carry `AUTHORITY_UNAVAILABLE` (authority layer requires PG); PG contract lives in `tests/wave23-reports-pg.js` (external env absent locally).
3. **Root cause hypothesis:** in-memory mode lacks authority hydration for attendance/geometry paths (env) — **plus** F-A7-08 oracle red (separated above).
4. **Impact:** if reds persist on PG ⇒ real isolation defect; if green on PG ⇒ env artifact. Not decidable locally.
5. **Remediation:** run suite on live-PG staging; fix whichever side is wrong (code or oracle/env docs).
6. **Regression:** rti 11/11 on PG env in CI lane.
7. **Independent verification:** PG-lane CI run. — *External dependency: no local PostgreSQL ⇒ BLOCKED/NEEDS RECHECK.*

### F-A7-10 — authz-model missing `outbox`/`tombstones` — **Finding · REPRODUCED** · Severity **LOW**
1. **Reproduce:** `node tests/authz-model.js` → 255/257 ❌ both names.
2. **Evidence:** run×2 @`5d4a48f`; writers = `delete-service.js` (tombstones), db outbox cache; absent from `authz/model.json` and `WR.ops`.
3. **Root cause:** model documents sync-facing collections only; side-channel writers not modeled.
4. **Impact:** model-based audits skip these write paths (sync-side fail-closed by unknown-coll — D13 green).
5. **Remediation:** add model entries or declare internal-only with invariant tests on dedicated writers.
6. **Regression:** 257/257.
7. **Independent verification:** re-run ×2.

### F-A7-11 — Malformed JSON → HTTP 500 — **Finding · REPRODUCED** · Severity **LOW**
1. **Reproduce:** `curl -d '{"phone":' …/api/auth/send-code` → `500 {"ok":false,"code":"server_error"}`.
2. **Evidence:** run×2 probes @`5d4a48f`; body generic (no stack/SQL/topology — disclosure control OK; status semantics wrong).
3. **Root cause:** JSON parse errors not mapped to 400 class.
4. **Impact:** misleading 5xx inflates error-rate signals; disclosure itself clean.
5. **Remediation:** parse errors → 400 `bad_json`.
6. **Regression:** fixture asserts 400+code.
7. **Independent verification:** probe re-run.

### F-A7-12 — SSRF surface: single guarded webhook with validation gaps — **Finding · static** · Severity **LOW (hardening)**
1. **Reproduce:** `grep -rnE "https?\.request|fetch\(" server/*.js` → only `abuse-guard.js:30`.
2. **Evidence:** static @`5d4a48f`; file unchanged since `ecc8b40b`; `validWebhookTarget` = https-only, no creds, blocks localhost/127/10/192.168/0.x — misses `172.16/12`, `169.254/16`, CGNAT, IPv6 ULA, and resolved-IP pinning; target = **operator env** (`PAYESH_RUNTIME_ALERT_WEBHOOK`), not request input ⇒ no remote SSRF today.
3. **Root cause:** hostname-literal denylist incomplete; no DNS-resolution check.
4. **Impact:** defense-in-depth only under current threat model.
5. **Remediation:** resolve-then-check IPs; extend deny ranges; optional pin.
6. **Regression:** unit tests over private-range cases.
7. **Independent verification:** static re-audit. — *Checklist §5 SSRF = **Tested (static) + Finding**; named `ssrf-protection` suite **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT**.*

### Not-a-finding (documented)
- `form-validation-ux` first-run EXIT=1 = missing `dist/payesh.html` build artifact → after `node build.js`: **28/28** (environment precondition; suite could document it — P3 note).
- Prior `waf-ddos` INT-0 red @`ecc8b40b` → **29/29 green** at this HEAD (seed present).

### Prior-round findings disposition @ `5d4a48f`
| Prior | Disposition now |
|---|---|
| F-S04a continue-on-error ×3 | **FIXED & VERIFIED upstream** (0 occurrences) |
| F-S04b orphan suites + phantom nightly | **REPRODUCED** → F-A7-04 |
| F-S01 `.example` FN | **REPRODUCED** → F-A7-03 |
| F-S02 example-secret boot | **REPRODUCED** → F-A7-02 |
| F-S05 supply-chain | **REPRODUCED + worsened** (SC-01 added) → F-A7-05 |
| F-S06 authz-model | **REPRODUCED** → F-A7-10 |
| F-S07 sync envelope | **REPRODUCED** → F-A7-08 |
| F-S08 rti PG reds | **REPRODUCED** → F-A7-09 |
| F-S09 otp-mutations | **REPRODUCED** (7/11; M1 fixed upstream, M3–M6 stale) → F-A7-06 |
| F-S10 config-audit | **REPRODUCED + grew** (+`PAYESH_OUTBOX_LEASE_SECONDS`) → F-A7-07 |
| F-S11 malformed 500 | **REPRODUCED** → F-A7-11 |
| F-S12 `HOST=0.0.0.0` default | static unchanged (`server/index.js` untouched this range) — holds LOW/INFO |
| F-S13 skip→exit0 pattern | static unchanged — holds LOW (dormant) |
| F-S14 webhook gaps | static unchanged → F-A7-12 |
| F-S16 node<22 misleading jsdom text | static unchanged — holds LOW (env-gated; suites green under node22) |
| F-S03 SI-012 PAT rotate | **EXTERNAL BLOCKER** persists (incident-log coverage 37/37 documents only) |

## 4. Checklist control statuses (`SECURITY_AUDIT_CHECKLIST.md` §14 vocabulary)

| § | Control | Status | Provenance (SHA `5d4a48f`, E3) |
|---|---|---|---|
| 1 | Secret hygiene | **Finding** | F-A7-01 (gate crash), F-A7-03 (FN); live grep clean; secrets-cov 31/31; incident 37/37 |
| 2 | AuthN / session / token | **Tested** | battery R1–R5 (200/401 set); PREV dance; session-rev 16/16; otp-rl 49/49; F-A7-02 conditional Finding |
| 3 | AuthZ / RBAC / tenant / IDOR | **Finding** | check-authz 0; red-team 10/10 ×2; authz forced (no-row ×2) but F-A7-08/09/10 red |
| 4 | Input validation / injection | **Tested** | xss 23/23; waf 33/33; SQLi/NoSQLi→400; F-A7-11 (500) Finding LOW |
| 5 | SSRF / outbound | **Finding** (static) | F-A7-12; no other egress primitives |
| 6 | Rate limiting / abuse | **Finding** | rl-mut 4/4; XFF spoof fails ✅; but F-A7-06 (otp-mut 7/11) |
| 7 | File upload / handling | **N/A + Not Tested** | no upload endpoints in boot route table; named suites NOT IN REPO — reason recorded |
| 8 | Dependency / supply chain | **Finding** | F-A7-05; npm audit 0 vulns (Tested sub-item) |
| 9 | Error disclosure | **Finding** (LOW) | F-A7-11; bodies otherwise clean (no stack/SQL/topology) — Tested sub-item |
| 10 | Infra / storage / IAM exposure | **Evidence Missing** (E4) + Tested (static) | metrics loopback-only, HOST 0.0.0.0 default static; no live PG/Redis/nginx/TLS to probe ⇒ E4 gap |

## 5. E3 / E4 separation (never mixed)

- **E3 (this audit):** all suite runs, live :3121 probes, static analysis, local npm audit, workflow-file audits. Run counts as listed (key greens run×2 @ this SHA; crash/config/supply run×2–3; otp-mut run×1 @ this SHA + historical ×2).
- **External corroboration (CI, not E4):** GitHub Actions run IDs `35846202502` (Security Program failure — Secret scan), `35846202478` (Node.js CI success), `35846203065` (Runtime Reliability success), `35846202614` (Fortify success), `35846202773` (Codacy failure — tooling), combined commit-status API = success (only CircleCI say-hello). CI ≠ E4.
- **E4 / EXTERNAL BLOCKER:** specialist penetration test (sqlmap/nuclei/Burp live against staging — PEN_TEST §5 explicitly pending), live-PG for F-A7-09, multi-host DR/load per Ground Truth, SI-012 PAT owner action. **E4 NOT VERIFIED.**

## 6. False-green review (checklist §13 / Rule 10)

✅ `continue-on-error` = 0 (fix verified) · ✅ no fake credentials in workflows · ✅ no test deletion/weakening by this audit (tree clean, 0 changes) · ✅ waf-ddos full honest now 29/29 (prior honest-red preserved semantics) · ❌ phantom nightly claim (F-A7-04) · ❌ scanner crash truncates coverage (F-A7-01) · ⚠️ skip→exit0 env paths in session-revocation (static, dormant) · ⚠️ mutation harness “pattern not found” must not count as satisfied (F-A7-06 root).

## 7. Roadmap Reconciliation Required (flag only)

F-A7-01 (CI security red on current main), F-A7-04 (coverage claim vs reality), F-A7-05/06/07 (red gates), F-A7-08/09/10 (authz reds). Standing claims re-verified unchanged: **Phase 8.2 Exit NOT VERIFIED · Phase 8.3 BLOCKED · Production GO NOT DECLARED · E4 unproven.**

## 8. Evidence ledger (logs in /tmp, disposable; this report durable)

`a7-ss*`, `a7_fn*`, `a7_exsec`, `a7-srvA/B/C` (PREV dance), `a7_tsr1/2`, `a7_sc`, `a7_sc2`, `a7_caudit*`/`a7-cfgtool`, `a7_orm`, `a7_rl`/`a7_or*`, `a7_sr*`, `a7_am`, `a7_occ`, `a7_idc`, `a7_rt*`, `a7_w5`, `a7_rti*`, `a7_xss*`, `a7_wafe`, `a7_fvu*`, `a7_ps`, `a7_wafm`, `a7_qrtm`, `a7_rl*`, `a7_runjs`, `a7_wd`, probe `/tmp/a7-tsrepro.js`; Actions runs 35846202134–35846203065.

## 9. Remediation priority (spec-ready; Arena did not change code)

**P0:** F-A7-01 (restore green secret gate + symlink fix + scanner guard). **P1:** F-A7-04 (nightly+parity contract), F-A7-03 (scan git ls-files), F-A7-02 (boot denylist), F-A7-05 (rebaseline+SBOM regen), F-A7-07 (document 9 vars+gate), F-A7-06 (re-anchor mutants). **P2:** F-A7-08/09(PG)/10/11/12. **External:** E4 pentest, live-PG lane, SI-012.

**END — Arena 6 @ `5d4a48f` · verdict FAILED (characterized, fix-ready) · E3 only · E4 NOT VERIFIED.**
