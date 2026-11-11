# A-10 evidence note — CodeQL real scanning state (default setup)

Recorded: 2026-11-11, during legacy carry-over revalidation (A-01..A-29).

## Method

GitHub REST API (repo `rezaa2544/p2`), called by the acting team with repository
read scope:

- `GET /repos/rezaa2544/p2/code-scanning/default-setup`
  → `state=configured`, `query_suites=default`
- `GET /repos/rezaa2544/p2/code-scanning/alerts?state=open`
  → 3 open code-scanning alerts (i.e. the scanner runs and files findings)

## Facts on this HEAD

- `.github/workflows/codeql.yml` — the echo-only stub ("Default CodeQL setup is
  enabled in repository settings") has been REMOVED from `.github/workflows/`
  (15 workflow files remain; no codeql.yml).
- GitHub's **default CodeQL setup is `configured`** at the repository level, so
  code scanning runs without a workflow file, and it produces real alerts
  (3 open at recording time).

## Verdict

The A-10 defect ("codeql.yml still only echoes — no real scan") is resolved:
there is no stub workflow any more, and real CodeQL analysis runs through the
repository's default setup. Reproduce by calling the two endpoints above; the
state is readable by any repo reader.
