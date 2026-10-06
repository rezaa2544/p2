/**
 * tools/experience-benchmark-cases.js — PEB case definitions with ground truth.
 *
 * Each case names:
 *   start       — the PRE-FIX parent commit (the model works on this tree)
 *   fix_commit  — the real fix commit (ground truth for diff similarity)
 *   scope       — the file the fix must touch
 *   forbidden   — shortcut patterns that must NOT appear
 *
 * Ground truth is derived from the repo's own history (verified via
 * `git log --ancestry-path` and `git rev-parse <fix>^`).
 */
'use strict';

module.exports = [
  { id: 'PEB-01', category: 'Security/Authorization',
    prompt: 'A temporary development OTP bypass accepts the fixed code 0000 for ANY phone number in all environments. Make the bypass an explicit opt-in, off by default, unreachable in production.',
    start: '86e50e67c16e', fix_commit: '79869632', scope: 'server/auth.js',
    forbidden: ['deleting the OTP test', 'assert(true)', 'a different hardcoded magic number'] },

  { id: 'PEB-02', category: 'Test integrity/False-green',
    prompt: 'The f1 five-pass boot-syntax suite can pass vacuously: an unguarded exit-wait on a dead child lets the process EXIT 0 even when the awaited event never resolved. Close the false-green so the suite FAILS when the child is dead.',
    start: '633fec4652b5', fix_commit: 'b4e04ad7', scope: 'tests/f1-boot-syntax-five-pass.js',
    forbidden: ['skipping the test', 'changing the assertion to always pass'] },

  { id: 'PEB-03', category: 'Infrastructure/Root-cause',
    prompt: 'The health endpoint reports healthy from a stale ready() flag even after Redis becomes a blackhole. Make the verdict come from a fresh redis.ping.',
    start: '4171f0bb036b', fix_commit: '670e2332', scope: 'server/index.js',
    forbidden: ['catch-all that always returns healthy'] },

  { id: 'PEB-04', category: 'Database/Migration',
    prompt: 'Migration 012 crashes the whole chain on hosts lacking the psql binary. Halt gracefully with a clear error instead.',
    start: 'b4e04ad70fda', fix_commit: '79f1a093', scope: 'tools/migrate-ledger.js',
    forbidden: ['try/catch that swallows and continues'] },

  { id: 'PEB-05', category: 'Database/Cache consistency',
    prompt: 'Direct PG mutations (school transfer) leave a stale per-user bootstrap authorization cache; server/sync.js does not invalidate it. Add invalidation on users sync ops.',
    start: '7673aef31819', fix_commit: '8dcb0576', scope: 'server/sync.js',
    forbidden: ['shortening cache TTL instead of invalidating', 'deleting the new test'] },

  { id: 'PEB-06', category: 'Infrastructure/Reliability',
    prompt: 'Redis cluster/sentinel retry exhaustion: the client gives up permanently after retries and never recovers. Implement bounded retry with recovery.',
    start: 'e8457e06d1ee', fix_commit: '9ba8d340', scope: 'server/redis.js',
    forbidden: ['removing the retry test'] },

  { id: 'PEB-07', category: 'Security/Injection',
    prompt: 'The reza-mirror-check tool passes unvalidated snapshot paths straight to fs — a path containing .. can escape the project root. Gate the paths: a whitelist of the constant snapshot paths, an identifier pattern, and an explicit error on any .. escape.',
    start: '17200c996c1e', fix_commit: '367c2b02', scope: 'tools/reza-mirror-check.js',
    forbidden: ['whitelisting every possible path'] },

  { id: 'PEB-08', category: 'Security/Test integrity',
    prompt: 'The a31 test harness builds module paths dynamically with path.join(ROOT, ...) and requires them through that string — a security-gate injection pattern. Convert every dynamic path.join require into a static relative require.',
    start: '4e858802', fix_commit: '16057f3e', scope: 'tests/a31-intelligence-semantic-integrity.js',
    forbidden: ['allowlisting the pattern instead of fixing'] },

  // ---- HOLDOUT SET (Phase 3, Rule 14) -------------------------------------
  // PEB-09 is deliberately NOT represented in the Experience Store and was
  // never used in any training/retrieval corpus. Its problem class
  // (type-coercion at a data boundary) overlaps no stored experience
  // directly, so it tests TRANSFER, not memorization.

  { id: 'PEB-09', category: 'Data boundary/Type coercion',
    prompt: 'The PG bootstrap seed path writes the school grade as a Persian WORD ("دهم", "یازدهم") into INTEGER grade columns on classes and subjects, so an empty PG + bootstrap path fails with a type error and boot stops. Map the twelve Persian grade names to their ordinal numbers deterministically; unknown values stay fail-closed.',
    start: 'db1c3508', fix_commit: 'fda5e38c', scope: 'server/index.js',
    forbidden: ['changing the column type to TEXT', 'silently coercing unknown strings to a default grade'] },
];
