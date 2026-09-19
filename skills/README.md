# Payesh Engineering Skill Pack

Five skills for `.claude/skills/`, written to give Arena senior-level
reasoning in security, architecture, code review, performance, and
testing — matched to the standing contract (senior engineer, honest
pushback, teammate not code-generator) and to the real lessons already
learned on Payesh (IDOR, timing attacks, O(n²) bugs, tests that pass for
the wrong reason).

## What's inside

- `security-review/SKILL.md` — threat-reasoning approach (inspired by
  the evaluated strength of `getsentry/skills` security-review: teaches
  *how to think* about security, not just a checklist) + Payesh-specific
  lessons (IDOR is a role-check vs ownership-check distinction; client-
  side "enforcement" isn't enforcement).
- `architect/SKILL.md` — reversible vs. expensive-to-reverse decision
  framing, directly modeled on how the multi-tenant/localStorage
  decision was actually reasoned through in this project.
- `code-review/SKILL.md` — correctness and maintainability review,
  blocking vs. suggestion distinction.
- `performance-audit/SKILL.md` — measure-before-optimizing discipline,
  the "vary each axis separately" lesson from the O(n²) bugs already
  found in this codebase.
- `testing-strategy/SKILL.md` — mutation-testing discipline (the exact
  practice that caught the silent `skipTest` bug and the shared-fixture
  bug already found in Payesh's history).
- `evidence-integrity-and-commit-accounting/SKILL.md` — strict evidence
  standards (Type A/B/C), E0-E4 strength levels, mandatory mock/real
  separation, separate commit accounting (CODE_SHA vs DOC_SHA), git diff
  verification, and anti-hallucination guards.


## Other real, independently-evaluated skills worth adding directly from source

I can't push to GitHub myself, but if Arena has web/GitHub access, these
are genuinely worth pulling in as-is rather than reinventing:

- `getsentry/skills` (security-review) — the security skill research
  rated as the actual standout among five compared.
- `alirezarezvani/claude-skills` (senior-security) — deeper toolkit:
  STRIDE/DREAD threat modeling, defense-in-depth, incident response,
  ships with secret-scanning scripts. Best for periodic deep audits,
  not every commit.
- `pvnarp/claude-code-skills` — a 49-skill collection including
  `architect`, `review`, `perf`, `testing`, `bug`, `workflow` — worth
  browsing for anything this 5-skill pack doesn't cover (e.g. git
  workflow conventions, build/release checklists).

## Install

Copy this whole folder's contents into `.claude/skills/` at the repo
root and commit. Claude Code / Arena will auto-discover each skill by
its `description` field — no further configuration needed.
