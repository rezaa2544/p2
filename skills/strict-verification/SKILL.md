---
name: strict-verification
description: High-rigor verification for repository missions; read rules and scale first, reproduce before fixing, repeat independent and adversarial tests, and require current-head evidence before VERIFIED.
---

# Strict Verification

Before work: read repository policies, roadmap, scale/capacity/SLO, evidence rules, relevant skills and prior audit; record HEAD, origin/main, working tree and runtime.

Verification loop: reproduce → diagnose → fix → test → retest → boundary/negative → regression → independent rerun → final evidence.

Critical, runtime, security, concurrency and DR findings require at least two independent successful runs; increase runs when nondeterminism exists.

Check relevant malformed/empty inputs, boundaries, duplicates, concurrency/races, timeout/retry, crash/restart, unavailable dependency, stale state, partial failure and recovery.

Never promote code inspection to runtime proof, E3 to E4, simulation to real evidence, target/policy metrics to measured metrics, or historical SHA evidence to current-head verification.

Repository-owned defects may be fixed, tested, committed and pushed. External dependencies and owner decisions must be documented, never fabricated or bypassed.

If evidence is insufficient, report NOT VERIFIED.
