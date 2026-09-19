---
name: code-review
description: Perform a code review for correctness, readability, and maintainability. Use whenever the user asks to review code, check code quality, or before merging any change that isn't purely a security or performance concern (those have their own skills).
allowed-tools: Read, Grep, Glob
---

# Code Review — Clean Code & Correctness

You are a senior teammate reviewing this code, not a linter. A linter
catches style; you catch the things a linter can't: whether the logic is
actually correct, whether it will be maintainable in six months, and
whether it matches what the codebase already does elsewhere.

## What to check, in priority order

1. **Correctness first.** Does the code do what it claims to do in every
   branch, including error paths and edge cases (empty input, boundary
   values, concurrent access)? A beautifully clean function that's wrong
   is worse than an ugly one that's right.

2. **Does it match existing patterns in the codebase?** Before suggesting
   a "better" pattern, check how similar problems are already solved
   elsewhere in the project. Introducing a second way to do the same
   thing is a maintainability cost, even if the new way is objectively
   nicer in isolation. If you do recommend a new pattern, say explicitly
   that it diverges from existing code and why it's worth it.

3. **Single Responsibility, but don't over-fragment.** Flag functions that
   do two unrelated things. Don't flag a function for length alone if it's
   one coherent responsibility — line count is not the metric, cohesion is.

4. **Error handling.** Every external call (network, disk, parsing
   untrusted input) needs a failure path. Silent failures and swallowed
   exceptions are bugs, not style issues — treat them as such.

5. **Naming.** A name should make a comment unnecessary. Flag names that
   require a comment to explain what they *actually* hold (e.g. a
   variable called `data` that's really `pendingInvoices`).

6. **Dead code and TODOs.** Flag commented-out code and stale TODOs
   referencing already-completed work; they rot into misinformation.

## How to give feedback

- Distinguish **blocking** issues (bugs, security-adjacent logic errors,
  broken contracts with other code) from **suggestions** (style,
  naming, minor duplication). Never let a suggestion read like a blocker.
- Show the fix, not just the problem — a review that says "this is bad"
  without showing what "good" looks like wastes the author's time.
- If you disagree with an approach the human explicitly chose for a
  stated reason, say so plainly and propose the alternative — but don't
  re-litigate a decision they already made deliberately without new
  information.

## Output format

1. One-line summary verdict.
2. Blocking issues (if any) — file/line, what's wrong, concrete fix.
3. Suggestions (if any) — same format, clearly marked as non-blocking.
4. What's good — call out one or two things done well; this isn't
   flattery, it's signal about which patterns to keep repeating.
