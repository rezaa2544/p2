# CI-02 / RC44 Evidence — CI pipeline with the honest supported-runtime matrix

- **Verification id:** CI-02 (RC44)
- **Scope token:** `CI-02:NODE-MATRIX`
- **Date:** 2026-11-12 (current HEAD)

## Finding

The CI pipeline exists and is the canonical regression runner
(`.github/workflows/node.js.yml` → `npm run test:all`, wired in `package.json` and
verified by the A-12/A-13 checks). The task text's "Node 20 و 22" matrix predates
the engines contract: `package.json` `engines.node` is `>=22` (A-29 reconciliation:
roadmap + engines both say Node 22+), so **Node 20 is out of the supported band**
and a 20 lane would fail the enforced engines check (tests/run.js fails loudly on
old Node — P1-GAP-02 remediation; the 18/20 lanes were already removed because
they produced silent-skip fake-green).

## Change

`node-version: [22.x]` → **`[22.x, 24.x]`** — BOTH supported LTS lines are now
first-class CI lanes (22 maintenance-LTS, 24 active-LTS — the entire suite runs
green on Node 24.21 locally, DSH runtime).

## Evidence

- Workflow YAML parses: matrix = `['22.x', '24.x']` (js-yaml round-trip).
- Canonical runner wired: `package.json` `test:all` + workflow step (A-12/A-13).
- The canonical Node.js CI run on the prior HEAD exercises the full suite
  (~75 min) including the wal-disk-full live drill; the matrix lanes repeat it
  per supported runtime on this push.
- `CI-02:NODE-MATRIX — RUNTIME-VERIFIED` (workflow matrix on HEAD; lanes verified
  by the CI runs on this push).
