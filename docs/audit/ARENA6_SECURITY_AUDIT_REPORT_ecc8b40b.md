# Arena 6 — Security / Red Team Audit Report

**Repository:** `rezaa2544/p2` · **Current HEAD:** `ecc8b40b5d533d77c6ebad63ca0854119873c504` (= origin/main, verified via `ls-remote` + `update-ref`) · **Audit date:** 2026-09-23 (Asia/Tehran) · **Evidence level:** **E3** (code + live local probes + suite runs). **E4 NOT VERIFIED** — this audit does NOT replace a specialist E4 penetration test.

**Declared base:** `docs/SECURITY_AUDIT_CHECKLIST.md` → **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** (searched: only PEN_TEST/ONBOARDING/PLAY_STORE/PRODUCTION/RELEASE checklists exist).
**Fallback bases:** `docs/PEN_TEST_CHECKLIST.md` (8 scenarios, P0#6), `docs/ZERO_TRUST_SECURITY_AUDIT.md`, `docs/SECURITY_FINDINGS_REGISTER.md` (36 findings, frozen rc11), `docs/SECRETS_MANAGEMENT.md` (3 principles).

---

## 0. Verdict

🏁 **FAILED** — repo-owned security defects are open and reproducible; CI security posture contains a proven false-green architecture (HIGH). Secret-handling gate works but has a proven false-negative. Authentication/session core verified green under E3. Authorization enforcement verified working (one suspected bypass disproved). External blockers (E4 pen-test, live-PG isolation, SI-012 PAT rotation) remain **EXTERNAL BLOCKER**. `Roadmap Reconciliation Required` flagged — status upgrades are NOT mine to make.

## 1. Scope — 5 Tasks × 5 verification dimensions

| Task | Scope | Dim1 Functional | Dim2 Boundary | Dim3 Negative | Dim4 Concurrency/Replay | Dim5 Independent/Alt path |
|---|---|---|---|---|---|---|
| **T1** Secret hygiene | secret-scan, .env.example, live grep, SI-012 | ✅ 12/12 ×2 | ✅ caught `.env` probe; ❌ **FN `.example`** | ✅ `.md` injection caught exit1 ×2 | n/a (static tool) | ✅ independent grep (PEM/AKIA/ghp/24+hex) = clean except doc refs |
| **T2** AuthN/session/token | login, OTP, logout, JWT, rotation | ✅ live 200s | ✅ oversize/alg-none/400-class | ✅ wrong-key 401, evil-origin 403 | ✅ OTP replay-after-use 401; parallel cookie replay ×3 = 401×3; session-revocation 16/16; otp-rl 49/49 | ✅ PREV-grace dance (below); audit.js 47/47 |
| **T3** AuthZ/RBAC/IDOR | parity, model, OCC, tenant, sync | ✅ check-authz 0; occ 18/18; id-collision 11/11 | ✅ authz-model D13/D14 fail-closed | ✅ red-team 10/10 ×2 + mutations 4/4 | ✅ id-collision ×1; OCC multi | ⚠️ rti **7/14** (3× PG-env NEEDS RECHECK + 1× envelope contract, authz enforced); authz-model 255/257 |
| **T4** Input/injection/SSRF/file | validation, XSS, WAF, traversal, error-body | ✅ xss-guard 23/23 (n22); form 28/28; waf-enforce 33/33; public2 8/8 | ✅ bad JSON→500 generic; 5000-char→413 generic; CL-huge→408 | ✅ SQLi/NoSQLi login→400 fail-closed; red-team RT-01…10 blocked | ✅ waf-mut 4/4; rate-limit-mut 4/4; otp replay 401 | ✅ public2-mut 3/3; session8-public EXIT0; **named traversal/upload/sql-injection/ssrf suites NOT IN CURRENT REPOSITORY** |
| **T5** Deps/supply-chain/errors/infra | npm audit, supply-chain, CI, disclosure, bind | ✅ audit 0 vulns ×2 | ✅ secret-scan gates CI (no c-o-e) | ✅ local waf-ddos full honest-fails INT-0 (exit 1, no fake green) | n/a | ❌ supply-chain **5/7 RED**; ❌ config-audit **13/15**; CI orphan map below |

Suite runs performed under **node v22.14.0** (restored after /tmp wipe forced a first pass under v20 — see F-S16). `env -u DATABASE_URL -u REDIS_URL` used for in-memory isolation; no local PG/Redis/Docker/nginx → live-PG suites honestly NOT RUN (BLOCKED).

## 2. Findings register (repo-owned → closure = complete characterization + remediation-ready spec; Arena ≠ main coder)

### F-S01 — Secret scanner false-negative on `.example` (and any extension outside its allowlist) — **REPRODUCED**
- **Category:** T1 Secret hygiene · **Severity:** MEDIUM · **Evidence:** E3 · **Runs:** 2 (positive+negative)
- **Location:** `tests/secret-scan.js:46` (ext allowlist `.js/.json/.html/.md/.env/.sh/.yml/.yaml`), text-filter line ~74
- **Threat:** A real credential committed in `*.env.example`, `*.toml`, `*.txt`, `Dockerfile`, etc. ships scanned-clean.
- **Repro:** write `ghp_…` token into `docs/_a6_probe.env.example` → `node tests/secret-scan.js` → **exit 0 (clean)**; same token in `*_probe.env` → **exit 1 caught**. Probes removed; scanner restored exit 0.
- **Expected:** every tracked file scanned (or at minimum `.example` + dotfiles). **Actual:** allowlist-only walk misses non-listed extensions.
- **Root cause:** recursive walker filters by fixed extension set instead of `git ls-files`.
- **Fix:** scan the full tracked-file set (`git ls-files`), keep SKIP_DIRS for generated trees; add regression fixtures per extension class.
- **Regression test:** secret-scan must fail when a token is planted in `.example`, `.txt`, `Dockerfile`, and pass after clean-up.

### F-S02 — Published example JWT secret is accepted at boot (conditional session forgery) — **REPRODUCED (live)**
- **Category:** T1/T2 · **Severity:** MEDIUM (conditional — becomes CRITICAL on copy-paste deploys) · **Evidence:** E3 · **Runs:** 1 live boot + static ×2
- **Location:** `.env.example:38` (`PAYESH_JWT_SECRET=e7b4c91a82f3d5e6a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0`), `docs/CONFIGURATION_REFERENCE.md:260` («کپی به `.env`»), `server/index.js:548` (length≥32 only)
- **Threat:** operator copies example → every deployment shares a globally-known signing key → attacker forges any session (role/school_id/jti) for all such installs.
- **Repro:** `PAYESH_JWT_SECRET=<example value> node server/index.js` → boots, `/api/health` **200 — no rejection**.
- **Expected:** boot refuses known example/placeholder values (denylist + entropy-source hint). **Actual:** only `length ≥ 32` checked.
- **Fix:** denylist published example values (and low-entropy patterns) at boot; fail closed with actionable message.
- **Regression test:** boot with example secret → expect FATAL non-zero exit; with random 64-hex → boots.

### F-S03 — SI-012 leaked GitHub PATs (6× `ghp_`) rotate/revoke status — **EXTERNAL BLOCKER**
- Owner action outside repo (GitHub PAT revoke/rotate). Tracked in `docs/SECURITY_INCIDENT_LOG.md`; `security-incident-log-coverage` 37/37 green (doc coverage only). Rotation effectiveness = **NOT VERIFIED** (owner dependency).

### F-S04 — CI false-green architecture: advisory security jobs + orphaned security suites + phantom “nightly” — **REPRODUCED**
- **Category:** T5/T1 False-green · **Severity:** **HIGH** · **Evidence:** E3 · **Runs:** static sweep ×3 (workflows + API)
- **Location:** `.github/workflows/security.yml:69` (SCA `continue-on-error: true`), `:85` (SBOM), `:106` (DAST), `:163` (advisory note), header lines 7–13
- **Threat:** repo *appears* to run a security pipeline while the substantive checks never gate anything.
- **Actual:** (a) SCA/SBOM/DAST never fail CI; (b) **no workflow executes** `tests/xss-guard.js`, `tests/security*.js` (full), `tests/waf-ddos.js` (full — only `--unit-only` at line 221), `tests/supply-chain.js`, `tests/red-team{,-mutations}.js`, `tests/otp-ratelimit{,-mutations}.js`, `tests/session-revocation*.js`, `tests/public-security.js`, `tests/public2*.js`, `tests/rate-limit-mutations.js`, `tests/form-validation-ux.js`, `tests/reports-tenant-isolation.js`, `tests/authz-model.js`, `tests/config-audit.js`, `tests/audit.js` — grep of all workflows = 0 references; `tests/run.js` (CI line 44) is structural-contract only (engines/build/_order/vm), `npm test` = run.js + smoke.js; (c) header claims a “local/nightly flow” — **no such nightly exists** (only codacy+fortify crons). Genuinely gating today: `tools/check-authz.js` (line 46), `tests/secret-scan.js` (line 63), `waf-enforce` (226).
- **Expected:** security suites run on schedule and at least authz/tenant/supply-chain/secret-scan gate merges. **Actual:** red suites (F-S05, F-S09, F-S10, F-S06, rti-reds) are **invisible to CI**.
- **Fix:** nightly workflow running the full security matrix with job-level failure (keep SCA advisory only if registry-flaky, but publish status); wire supply-chain + authz-model + reports-tenant + config-audit into gating jobs; remove phantom-flow claims from header or create the flow.
- **Regression test:** CI contract test asserting the security suite list ⊆ workflow-executed list (parity contract pattern already used in repo).

### F-S05 — Supply-chain baseline drift: suite RED at HEAD, invisible to CI — **REPRODUCED**
- **Category:** T5 · **Severity:** MEDIUM · **Evidence:** E3 · **Runs:** 2 (n20+n22, identical)
- **Location:** `tests/supply-chain.js` SC-05 (“SHA-256 drift; resolved-count drift; direct dependency drift: jsdom”); lock `jsdom=30.0.1` = `package.json ^30.0.1`; baseline fingerprint source not refreshed (SC-03 points at `docs/THIRD_PARTY_LICENSES.md` `lockfile_sha256`); only lock-touching commit in shallow view = `ecc8b40b` itself.
- **Expected:** 7/7 with approved baseline re-cut on intentional dep changes. **Actual:** **5/7, EXIT=1**; suite referenced by zero workflows (F-S04) → permanent invisible red.
- **Fix:** re-approve baseline through the documented process, regenerate fingerprint; add suite to CI gate.
- **Regression test:** SC-05 green at HEAD post-rebaseline; a deliberate lock edit turns it red in CI.

### F-S06 — authz model completeness gap: `outbox`, `tombstones` not in `authz/model.json` — **REPRODUCED**
- **Category:** T3 · **Severity:** LOW · **Evidence:** E3 · **Runs:** 2 (n20+n22)
- **Location:** `tests/authz-model.js` reds B)-items; writers = `server/delete-service.js` (tombstones, cap 20000), `server/db.js:522` (outbox cache-only); both absent from `WR.ops`/`WR.perms` and `authz/model.json`.
- **Threat:** collections outside the modeled authorization surface — dedicated writers must carry their own gates; model-based audits silently pass over them. Sync-side = fail-closed (unknown-coll deny, D13 green).
- **Expected:** every store collection modeled or explicitly whitelisted as internal-cache with documented gates. **Actual:** 255/257 — model red.
- **Fix:** add model entries (fields+roles) for both or declare them internal-only with invariant tests on `delete-service`/`outbox` gates.
- **Regression test:** authz-model 257/257.

### F-S07 — `/api/sync` error-envelope inconsistency: `role_denied` → HTTP **200**+`ok:false`, `out_of_scope` → HTTP **403** — **REPRODUCED (×2 focused + suite ×3)**
- **Category:** T3 AuthZ contract · **Severity:** LOW-MEDIUM · **Evidence:** E3 · **Runs:** 2 focused (+ suite runs rti ×2 + suite-in-repro ×2 earlier = consistent)
- **Location:** `server/sync.js` batch handler (~line 802+, fieldGate role check line 131; out_of_scope short-circuit maps 403) vs oracle `tests/reports-tenant-isolation.js:181-190` (`assert.strictEqual(r.status, 403)`).
- **Repro (focused, exact suite op-shape):** teacher ins `report_logs` → **HTTP 200, `results[0]={ok:false, code:"role_denied"}`, rows 0→0 (NO write)**; manager own → 200 ok:true row added; manager cross-school → **403 `out_of_scope`**, no row. ×2 identical.
- **Expected:** uniform denial envelope (both 403, or both 200+ok:false) and suite green. **Actual:** inconsistent statuses; suite red; **authorization itself ENFORCED (no bypass, no row)** — the earlier “200 = bypass” reading is DISPROVED.
- **Impact:** API clients trusting HTTP status alone misread role denials as success (mis-handling risk, not data leak).
- **Fix:** map per-op `role_denied`/`role_escalation`/`malformed_op` to batch HTTP 403 (or document envelope + fix oracle); keep results[] semantics.
- **Regression test:** rti 11/11; contract assertion on both denial classes.

### F-S08 — reports-tenant-isolation attendance/geometry reds (503/403) — **NEEDS RECHECK (PG env)**
- **Category:** T3 · **Severity:** indeterminate until PG run · **Evidence:** E3 in-memory · **Runs:** 2 (n20+n22 identical: 7✅/4❌)
- **Location:** suite reds: (1) non-privileged four-reports expected 403 → attendance **503**; (2) manager own-school attendance expected 200 → **503**; (3) edu_office geometry expected 200 → **403**; bodies `AUTHORITY_UNAVAILABLE` → authority layer requires PG; PG contract lives in `tests/wave23-reports-pg.js` (PR #114).
- **Status:** NOT VERIFIED locally (no PG) — suite does not skip-without-DB, it red-fails (honest, not fake-green). `Roadmap Recheck Required` with live PG.

### F-S09 — otp-ratelimit mutation guard incomplete: **6/11 killed** — **REPRODUCED**
- **Category:** T2/T4 · **Severity:** MEDIUM · **Evidence:** E3 · **Runs:** 1 this audit (n22, 287 s) + prior-mission 7/11 (both evidence sets presented; counts differ → run-variance noted)
- **Location:** `tests/otp-ratelimit-mutations.js`: **M1 survived** (4-digit code revert “PASSED (no failure)” = oracle miss); **M3–M6 “الگو پیدا نشد”** = stale mutation targets (daily/phone/IP caps patterns drifted from source).
- **Threat:** rate-cap removals can land without the suite noticing → limits mutable without detection.
- **Fix:** refresh M3–M6 anchors to current source; fix M1 oracle to assert code-length invariant.
- **Regression test:** 11/11 killed, stable across 2 runs.

### F-S10 — Config↔doc audit RED: 8 code variables undocumented — **REPRODUCED (×2)**
- **Category:** T1/T5 · **Severity:** MEDIUM · **Evidence:** E3 · **Runs:** 2 (suite) + 1 (tool direct)
- **Location:** `tools/config-audit.js` EXIT=1; missing from `docs/CONFIGURATION_REFERENCE.md` §۲: `GATE_REQUIRE_CLEAN`, `GATE_REQUIRE_REMOTE_MATCH`, **`PAYESH_ALLOW_DEV_MEMORY_AUTHORITY`**, `PAYESH_FORCE_HYDRATION`, `PAYESH_STRICT_BASE_VERSION`, `PAYESH_STRICT_OCC`, `PGURL`, **`TRUSTED_PROXIES`**.
- **Threat:** security-relevant switches (proxy trust ⇒ Secure-cookie/XFP path; dev memory authority; boot gates) invisible to operators → misconfiguration.
- **Expected:** 0 drift (“هیچ متغیر کدی بی‌سند نیست”). **Actual:** 8 undocumented + 27 doc-only infra vars (⚠️ infra-only, external).
- **Fix:** document all 8 (or remove dead vars); add config-audit to CI gate.
- **Regression test:** config-audit exit 0.

### F-S11 — Malformed JSON → HTTP **500** (generic body) — **REPRODUCED**
- **Category:** T4 Error handling · **Severity:** LOW · **Evidence:** E3 · **Runs:** 1
- **Location:** POST `/api/auth/send-code` with truncated JSON → `500 {"ok":false,"code":"server_error"}` (contrast: oversize → 413 `body_too_large`, bad fields → 400).
- **Disclosure check:** body carries **no stack/detail** (no info-leak); issue = status semantics (should be 400 `bad_json`).
- **Fix:** JSON parse errors → 400 with stable code; keep generic 500 mapping for true faults.
- **Regression test:** malformed-JSON fixture asserts 400 + code.

### F-S12 — Default bind `0.0.0.0`, in-app TLS absent — **VERIFIED (static)**
- **Location:** `server/index.js:99` `HOST = process.env.HOST || '0.0.0.0'`; metrics loopback-only (line 959); boot fail-closed on DB when `DATABASE_URL` set (lines 1799–1812).
- **Severity:** LOW/INFO — correct behind reverse-proxy TLS (documented), but default-all-interfaces on an internet host without firewall = exposure. Recommend defaulting `HOST=127.0.0.1` for non-container deploys or requiring explicit `HOST`.

### F-S13 — Session-skip paths exit green (conditional false-green pattern) — **VERIFIED (static)**
- **Location:** `tests/session-revocation.js:251-265` — missing seed/redis/boot → prints ⏭️ skips and returns (exit 0).
- **Note:** our full run executed **16/16** (no skips triggered); risk = suite can go green without running its Redis-revocation subset where env is thin — and CI never runs it anyway (F-S04). Align skip→non-zero (or distinct “incomplete” code) with waf-ddos’s honest INT-0 failure style.

### F-S14 — abuse-guard webhook target validation gaps (defense-in-depth) — **VERIFIED (static)**
- **Location:** `server/abuse-guard.js:18-28` `validWebhookTarget`: https-only ✓, no creds ✓, blocks localhost/127/10/192.168/0.x — **misses `172.16.0.0/12`, `169.254.0.0/16` (incl. metadata), CGNAT `100.64/10`, IPv6 ULA/link-local, and does not pin resolved IPs (DNS-rebind)**.
- **Threat model bounded:** target comes from **operator env** `PAYESH_RUNTIME_ALERT_WEBHOOK`, not request input → no remote SSRF today. LOW hardening gap.
- **Fix:** resolve-then-check IP against private ranges; extend denylist; optional pin.

### F-S15 — **SSRF surface: minimal** — **PARTIALLY VERIFIED (static)**
- Only server-side egress primitive = abuse-guard webhook (F-S14). No `fetch`/`http.request` in routes; `tests/ssrf-protection.js`, `path-traversal.js`, `file-upload-mutations.js`, `sql-injection.js`, `input-validation.js` **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT** (nearest green coverage: red-team RT-01…08 WAF/SQLi blocked, xss-guard 23/23, waf-enforce 33/33, form-validation 28/28). File-upload endpoints not present in boot route table (admin backup/restore, sms, students, public-report only).

### F-S16 — Standalone suites give misleading failure under Node <22 — **REPRODUCED**
- **Location:** `tests/xss-guard.js:18-19` & `tests/public-security.js` — `require('jsdom')` throws under v20 (jsdom 30 engine) → message **“jsdom نصب نیست”** (false: installed) + exit 1. Under v22.14.0 both run green (**xss-guard 23/23**, **public-security 10/10**). `tests/run.js:13-18` enforces engines ≥22, standalone entry points don’t.
- **Severity:** LOW test-infra; fix = engine guard + truthful message (“requires Node ≥22”).
- **Audit hygiene:** first pass ran under /tmp-wiped node20 → all key suites **re-run under v22** (results above; greens held: secret-scan, session-rev 16/16, otp-rl 49/49, red-team 10/10, occ 18/18, check-authz, npm audit 0, supply-chain still 5/7 red, rti still 7/4).

## 3. Verified green (this audit, E3 — none upgraded to E4)

**T1:** secret-scan 12/12 ×2 (CI-gating, no continue-on-error) · negative `.md` injection caught ×2 · independent live-credential grep clean · `secrets-management-coverage` 31/31 · `security-incident-log-coverage` 37/37.
**T2:** login 200 · OTP replay-after-use 401 · logout→me 401 + parallel replay ×3 = 401×3 · current-secret token 200 · **alg-none 401** · wrong-key/forged-role 401 · **PREV rotation dance:** old cookie 200 during grace → **401 after PREV cleared** (design works; ops must clear PREV) · session-revocation 16/16 · otp-ratelimit 49/49 · audit.js 47/47 · CSRF: evil-origin 403 (same-origin http usable) · cookie HttpOnly ✓.
**T3:** check-authz parity EXIT0 · authz-model 255/257 (D13/D14 fail-closed green) · occ 18/18 · id-collision 11/11 · red-team 10/10 ×2 · red-team-mutations 4/4 · **teacher-sync “200 bypass” disproved (no row ×2)**.
**T4:** xss-guard 23/23 (n22) · waf-enforce 33/33 · waf-mutations 4/4 · rate-limit-mutations 4/4 · form-validation 28/28 · public2 8/8 + mut 3/3 · session8-public EXIT0 · SQLi/NoSQLi bodies → 400 fail-closed · oversize → 413 generic · error bodies stack-free.
**T5:** `npm audit --audit-level=high` 0 vulns ×2 · redis-key-audit 24/24 · asvs-coverage 41/41 · fortify.yml explicitly no continue-on-error (line 60) · Codacy commit-status on HEAD = success (only `ci/circleci: say-hello`) · CI #1205 corroborates steps 1–26 green / step 27 red on this SHA (external API) · waf-ddos local full = honest 19/20 fail (INT-0 no seed) — **not fake-green**.

## 4. False-green review (mandatory) — findings

1. **continue-on-error** on security jobs: `security.yml:69` SCA, `:85` SBOM, `:106` DAST (+ `:163` advisory note) — job-level, never gates.
2. **Phantom coverage:** header claims suites run “in the local/nightly flow”; **no nightly exists**; 15+ security suites referenced by zero workflows while red (supply-chain, config-audit, authz-model, rti, otp-mutations) — see F-S04.
3. **Partial-run green:** session-revocation skip→exit0 (F-S13); waf-ddos `--unit-only` in CI (full run red-fails honestly locally — opposite, honest).
4. **Scanner false-negative** (F-S01) = silent clean pass on unlisted extensions.
5. **Misleading failure text** (F-S16) — fails but lies about cause (not a green, but an honesty defect).
6. **No fake credentials** in workflows (grep `PAYESH_JWT_SECRET=|PASSWORD=|API_KEY=` → empty) · **no skip-as-pass counters** found in secret-scan/supply-chain/xss/waf-enforce/red-team/otp suites (skip paths exist only where documented env-gates) · no assertion-weakening observed in this audit’s runs · no tests deleted (Arena did not modify repo code; `git status` clean at report time).

## 5. External blockers (owner / infra)

| ID | Item | Status |
|---|---|---|
| EXT-1 | E4 specialist penetration test (physical + prod-like infra) | **EXTERNAL BLOCKER / E4 NOT VERIFIED** |
| EXT-2 | SI-012: rotate/revoke 6× leaked `ghp_` PATs | **EXTERNAL BLOCKER** (owner action; F-S03) |
| EXT-3 | Live-PG verification: rti attendance/geometry reds (F-S08), wave23-reports-pg, live-tenant suites | **BLOCKED** locally (no PostgreSQL) → NEEDS RECHECK on PG env |
| EXT-4 | Redis/session-skip paths + full waf-ddos seed gate | **MEASUREMENT GAP** locally (no redis-server; seed policy) |
| EXT-5 | 27 doc-only infra vars (ES/Grafana/MinIO/PgBouncer/PGHA…) existence check | infra-only → **EXTERNAL** (config-audit ⚠️ list) |

## 6. Roadmap Reconciliation Required (flag only — no status upgrades by Arena)

Flagged: F-S04 (CI security posture), F-S05 (supply-chain gate), F-S06 (authz-model), F-S07+rti-oracle (sync envelope), F-S08 (tenant-isolation PG recheck), F-S09 (otp-mutations), F-S10 (config-doc drift). Known standing claims re-verified at HEAD: **Phase 8.2 NOT VERIFIED · Phase 8.3 BLOCKED · no Production GO · E4 unproven** — unchanged.

## 7. Evidence index (logs in /tmp — disposable; this report is the durable artifact)

`a6-secretscan/…` (`-n22` = node22 rerun), `a6-supply`/`a6-sc22`, `a6-cfgtool`, `a6-x_config-audit{,2}`, `a6-tsr3/4` (focused sync repro), `a6-rti`/`a6-rti22`, `a6-am`, `a6-ca`, `a6-occ`, `a6-w5`, `a6-idc`, `a6-rt22` (red-team), `a6-rtm2`, `a6-xss22`, `a6-ps22`, `a6-fvu`, `a6-wafe`, `a6-wafm`, `a6-rlm`, `a6-orm2`, `a6-sr22`, `a6-or22`, `a6-srm2`, `a6-audit22`, `a6-wafddos`, `a6-s8`, `a6-p2`/`a6-p2m`, `a6-smc`, `a6-al2`(not-found refuted), `a6-exsec` (example-secret boot), `a6-srv6/7` (PREV dance), probe scripts `/tmp/a6-teacher-sync-repro.js`, `/tmp/a6-tsrepro2.js`.

## 8. Workspace hygiene

Servers killed; `node_modules` removed; workspace **< 100 MB** (rule). Repo clean (`git status` empty), HEAD `ecc8b40b` unchanged — **Arena made zero code changes** (findings only, per mandate).

## 9. Remediation priority (spec-ready for Tech Lead)

1. **P0/ HIGH:** F-S04 — nightly+gating security matrix; remove phantom-flow claim.
2. **P1/ MEDIUM:** F-S01 (scan `git ls-files`), F-S02 (boot denylist), F-S05 (rebaseline+gate), F-S10 (document 8 vars+gate), F-S09 (repair otp-mut anchors/oracle).
3. **P2/ LOW-MED:** F-S07 (uniform sync denial envelope), F-S06 (model outbox/tombstones), F-S11 (400 for bad JSON), F-S13 (skip→incomplete exit), F-S16 (engine guard), F-S12/F-S14 (bind default, webhook IP pinning).
4. **External:** EXT-1…5 as listed.

**END OF REPORT — Arena 6 Security/Red Team · E3 · verdict FAILED (fixable, fully characterized) · E4 pen-test still required.**
