---
name: performance-audit
description: Use when investigating slowness, doing a performance review, or before claiming a change is "fast" or "optimized." Covers algorithmic complexity, database/query patterns, memory, and rendering performance.
allowed-tools: Read, Grep, Glob, Bash
---

# Performance Audit — Measure, Don't Guess

The single rule that overrides everything else in this skill: **never
report a performance number you did not actually measure in this
environment.** A plausible-sounding estimate is worse than no number,
because it gets trusted and repeated.

## Step 1 — Reproduce before touching anything

1. Get a realistic dataset size (not 5 rows — whatever the target scale
   actually is: hundreds, thousands, hundreds of thousands).
2. Measure the *current* behavior with a real timer/profiler, not a guess.
   Report the actual number.
3. Only after you have a real baseline, form a hypothesis about the cause.

## Step 2 — Find the actual bottleneck, don't guess-and-fix

- If you suspect an algorithmic issue, check complexity along **every**
  axis independently. A function with two inputs (e.g. rows × categories)
  can look linear if you only vary one axis in your test — always vary
  each axis separately to catch hidden O(n²) behavior.
- If your first fix doesn't move the number, don't assume the code is
  now "fine" — profile again and find what's *actually* still slow.
  Measuring in isolation (per-function timing) beats guessing from
  reading the code.
- Common real culprits, roughly in order of frequency: N+1 queries/
  lookups inside a loop, unnecessary re-computation of something that
  could be cached or hoisted out of a loop, unindexed lookups on large
  collections, and unnecessary data transfer (sending more than the
  client needs).

## Step 3 — Distinguish the layers

Be explicit about which layer a number describes — these are not
interchangeable and conflating them produces false confidence:
- Client-side render/compute time
- Server response time under a single request
- Server behavior under concurrent load (this needs actual concurrent
  requests, not a loop of sequential ones)
- Network/transfer time

A fast client-side render says nothing about server behavior at scale.
Say so explicitly when a benchmark only covers one layer.

## Step 4 — Verify the fix actually fixes it, and that it's still correct

- Re-run the same benchmark that found the problem, with the same
  dataset shape, after the fix — report before/after numbers together.
- Confirm the optimization didn't silently change correctness (a faster
  wrong answer is not an improvement). Write or run a test that would
  catch a regression, and ideally mutate the fix intentionally once to
  confirm the test would actually catch it if it broke again.

## Output format

- Baseline number (with dataset size/shape) → what you found → fix →
  after number (same dataset). Always paired, never just one side.
- If you could not reproduce or measure something, say so explicitly
  instead of estimating.
