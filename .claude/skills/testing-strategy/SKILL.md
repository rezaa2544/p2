---
name: testing-strategy
description: Use when writing tests, deciding what to test, or reviewing test coverage. Ensures tests actually catch regressions rather than merely existing.
allowed-tools: Read, Grep, Glob, Bash
---

# Testing Strategy — Tests That Actually Catch Bugs

A test suite that is green tells you nothing on its own. It only means
something if you know the tests would go red when the behavior they
claim to guard actually breaks. Never report "tests pass" as evidence of
correctness without having verified this.

## Step 1 — What to test, prioritized

1. The exact bug/behavior just fixed — a regression test tied directly
   to the reported problem, not a generic "happy path" test.
2. Boundary and edge cases: empty input, single item, exactly-at-limit,
   over-limit, concurrent/interleaved operations.
3. Cross-cutting invariants that many features depend on (auth checks,
   ownership/scope checks, data integrity rules) — these deserve tests
   independent of any single feature, because a regression here breaks
   many things silently at once.
4. Integration paths where two independently-correct pieces combine
   incorrectly — these are the bugs unit tests miss by construction.

## Step 2 — Verify the test actually tests something (mutation check)

For any test guarding an important behavior (a security check, a data
integrity rule, a fix for a real bug), deliberately break the
implementation on purpose and confirm the test fails. If it doesn't fail:

- The test is asserting the wrong thing, or
- The test and the code share a common dependency that makes them
  agree by construction rather than by real verification (e.g. a test
  that derives its expected value from the same function it's testing),
  or
- The test isn't actually being executed (skipped, wrong file matched,
  swallowed exception).

Do this for the tests that matter most, not exhaustively for every line
— but never skip it for a test you're about to report as "verifying" a
fix.

## Step 3 — Test with real interaction paths when relevant

For UI/user-facing logic, prefer driving the actual code path a real
user would trigger (a real click/input event through the real render
function) over calling an internal function directly — internal-function
tests can pass while the actual wiring between UI and logic is broken.

## Step 4 — Don't let test data leak across tests

A common source of flaky or misleading results: state left behind by one
test (a global, a shared fixture, a skipped/disabled flag) silently
affecting a later test. If a test suite's timing or results seem
inconsistent, check for this before assuming the code under test is
what's wrong.

## Output format

- What is now tested, and why it was chosen (tie explicitly to a real
  risk, not just "for coverage").
- Result of the mutation check for the important tests: which mutation
  was tried, and confirmation the test caught it.
- Anything you deliberately chose not to test and why (time-boxed
  scope, out-of-scope for this change, etc.) — don't leave it implicit.
