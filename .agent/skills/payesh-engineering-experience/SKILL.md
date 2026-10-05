---
name: payesh-engineering-experience
description: Retrieve verified Payesh engineering experience (defect patterns, false-green rules, verification methods) before reasoning about a Payesh task. Use when working on the rezaa2544/p2 repository or auditing its tests.
version: 1.0.0
owner: Hermes (verifier) / ChatGPT Control Plane (promotion authority)
status: operational
---

# Payesh Engineering Experience — Retrieval Skill

## When to use
Before any engineering reasoning on `rezaa2544/p2`: bug fixing, verification, audit,
false-green review, or defect discovery.

## Why
Payesh has a documented history of false-green suites, CI/local divergence, and
audit findings that are cited at stale HEADs. Retrieving verified experience first
prevents repeating these errors; the store is leakage-controlled so retrieval never
hands you a benchmark solution.

## Procedure (in order — skipping a step is a process violation)

1. **CURRENT REPO TRUTH FIRST.** Never reason from memory or historical reports.
   ```bash
   git -C <repo> rev-parse HEAD
   git -C <repo> status --short
   ```
   If retrieved experience contradicts the current source, **the source wins**.
   This is non-negotiable.

2. **RETRIEVE** (query in the task's own words):
   ```bash
   node tools/experience-store.js get "<task keywords>"
   ```
   - `EMPTY_RETRIEVAL` is a valid answer. Do not invent a match.
   - Only `head_status: HEAD_INDEPENDENT` or `CURRENT` experiences are usable as-is.
   - `head_status: STALE` ⇒ REVALIDATION_REQUIRED. Re-check the claim at the
     current HEAD before using it; never quote it as current fact.

3. **INDEPENDENT ANALYSIS.** Experience is context, never a verdict.
   The forbidden shortcut is exactly: `experience → verdict`.
   The required path is: `experience → independent analysis → source/test/runtime
   evidence → verification → verdict`.

4. **VERIFY.** Reproduce the claim yourself with a tool call. An agent claim alone
   is not evidence. Acceptable evidence kinds: `git`, `test`, `tool-output`.

5. **POST-MISSION LEARNING.** If this mission produced reusable knowledge, add it:
   ```bash
   node tools/experience-store.js add <experience.json>
   ```
   Then ask the Control Plane to promote it. RAW experience must never be quoted
   as canonical fact.

## Hard rules (each is a load-bearing lesson, each has repo evidence)

- **Not-RUN ≠ PASS.** A suite that prints NOT-RUN for a skipped scenario is
  reporting an honest skip. Reading it as a pass is a false-green. Permitted skips
  must stay explicitly labeled.
- **A mock is a false-green only if it replaces the code under test.** Replacing a
  dependency is legitimate. Verify by breaking the mock on purpose — a broken mock
  must fail assertions.
- **Per-assertion coverage, not per-file.** A green file does not prove every
  mechanism in it ran. For each assertion there must exist a mutation that makes
  *only that assertion* fail. (Proven on tests/cache-l2-epoch.js: deleting the
  school-scope epoch write left all 8 assertions green.)
- **Guard every wait on a child process.** An unguarded exit-wait lets the parent
  EXIT 0 while the awaited event never happened. Never read exit code 0 as success
  without confirming the child was alive and the event fired.
- **Bind defect findings to a HEAD.** A finding verified at an older HEAD is a
  historical artifact. Re-verify at the current HEAD before acting on it.
- **Do not fix during a read-only audit.** A fix destroys the evidence boundary.
  Use a separate worktree.
- **CI green ≠ local green.** CI may run suites before a service (PostgreSQL) is
  ready. Before attributing a CI failure to the change, check service-readiness
  ordering in the workflow.
- **Commission ≠ detection.** When auditing for anti-patterns, a pattern inside
  tool output is a *detection*; only a pattern inside a command/patch the agent
  executed is a *commission*. Counting detections as violations produces
  false accusations.
- **A capped session is UNCERTAIN.** A session that hit the tool-iteration cap
  did not complete; its summary is not an outcome.

## Forbidden
- Quoting a RAW (unverified) experience as fact.
- Using an experience whose retrieval marked it `STALE` without re-verification.
- Modifying governance/verifier/tests to make a benchmark or dataset easier.
- Treating retrieval as authority over current source.

## Governance
```
CREATE    any agent (Atria candidate producer)
VALIDATE  Hermes   (requires external evidence: git/test/tool-output)
PROMOTE   ChatGPT Control Plane
SUPERSEDE Hermes + Control Plane
RETIRE    Control Plane
```

## Verification
```bash
node tools/verify-agent-skills.js   # must stay 7/7 (this skill extends, not replaces)
node tools/experience-store.js audit
node tools/experience-store.js boundary
```
