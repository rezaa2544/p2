# GitHub ↔ Notion synchronization contract

**Status:** implementation contract for `.github/workflows/notion-sync.yml`.

## Authority model

- **GitHub is authoritative** for repository HEAD, commits, pull requests, issues, CI conclusions, and the canonical execution plan.
- **Canonical planning documents** are `docs/CURRENT_WORK_EXECUTION_PLAN.md`, `docs/ROADMAP_MASTER_EXECUTION_SCHEDULE.md`, and `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`.
- **Notion is a synchronized management projection**, not an independent source of engineering truth and not a certification record.
- A mismatch must be resolved in favor of current GitHub state and canonical repository documents; then the Notion projection must be refreshed. Do not silently change GitHub status because a Notion row says Done.

## Automated coverage

The workflow reconciles a stable, managed current-state block in the Payesh Current Work Queue & Evidence Snapshot page. It refreshes on:
- pushes to `main`;
- relevant issue lifecycle/metadata changes;
- relevant pull-request lifecycle/review-readiness changes;
- completion of the `Node.js CI` workflow;
- a daily schedule; and
- manual dispatch.

The snapshot records the live `main` HEAD, event SHA and run URL, the priority anchor Issue #443, a bounded view of open issues and PRs, and recent GitHub Actions outcomes. The managed paragraph is updated in place on reruns rather than appending a new duplicate snapshot each time. The workflow reads the resulting Notion block back and fails if the write cannot be verified.

## Integrity rules

- Missing API results are `UNKNOWN`, never `PASS`.
- A green individual workflow does not mean all CI is green or that production readiness is certified.
- Historical test results remain historical until rerun against the current SHA.
- Infrastructure claims requiring live PostgreSQL/Redis or production-equivalent evidence must not be inferred from GitHub metadata.
- `NOTION_API_KEY` is supplied only through GitHub Actions Secrets; it must never be committed or printed.

## Scope boundary

This is a **GitHub-authoritative status and work-queue projection**, not arbitrary bidirectional conflict resolution. Work-plan edits must be made in the canonical GitHub issue/docs first; the workflow then reflects the current state in Notion. Notion-only edits to mirrored status fields are not authoritative. The current-state snapshot is bounded to fit Notion's rich-text limits; it links to the full canonical work plan and issue queue rather than claiming to duplicate every historical artifact.
