# Daily Mission — {{CHAT_NAME}}

**Mission ID:** {{MISSION_ID}}  
**Date:** {{YYYY-MM-DD}}  
**Owner / Arena:** {{CHAT_NAME}}  
**Status:** ACTIVE  
**Base SHA:** `{{BASE_SHA}}`  
**P0_REF:** `{{P0_REF_OR_NA}}`

## Source references

- `docs/ROADMAP.md`
- `docs/NATIONAL_ROADMAP_PROGRESS.md`
- `docs/P0_BLOCKER_TRACKER.md`
- `docs/ARCHITECTURE_REVIEW.md`
- `docs/EXECUTION_CONTROL_PROTOCOL.md`
- `docs/ARENA_EXECUTION_MODEL.md`

## Scope

{{EXACT_SCOPE}}

## Forbidden scope

{{FORBIDDEN_SCOPE}}

## Dependencies

{{DEPENDENCIES}}

## Acceptance criteria

- [ ] {{AC1}}
- [ ] {{AC2}}
- [ ] {{AC3}}

## Required tests

{{REQUIRED_TESTS}}

## Required evidence

{{REQUIRED_EVIDENCE}}

## Git / PR rules

- No unrelated files in commit.
- No force-push.
- Record branch, commit SHA and exact diff scope.
- CI/PR/merge state must be reported separately from local results.
- Network/API failures are `NOT-RUN`.

## Definition of Done

The Mission is not complete when implementation merely exists. It is complete only when every acceptance criterion has the required evidence and the final report is committed to the required report path.

## Report path

`docs/daily-reports/{{CHAT_NAME}}/{{YYYY-MM-DD}}.md`
