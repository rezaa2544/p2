# Payesh — External Project Memory System

**Status:** ACTIVE / CANONICAL  
**Purpose:** Keep project memory outside the chat context and make the repository the durable source for project state.

## Seven memory layers

| Layer | Question answered | Canonical artifact/tool |
|---|---|---|
| 1 | Where are we in the overall project? | `docs/external-memory/PROJECT_DASHBOARD.md` + project board |
| 2 | What must be done today? | `docs/external-memory/DAILY_TASKS.md` + TickTick |
| 3 | Why was this decision made / how is the system structured? | `docs/external-memory/DECISION_LOG.md` + Notion |
| 4 | Which code defects exist and what is their state? | GitHub Issues |
| 5 | What ideas appeared during work? | Google Keep; later promoted into layers 1–4/6/7 |
| 6 | How are system components connected? | `docs/external-memory/PAYESH_ARCHITECTURE.excalidraw` |
| 7 | What changed, when, and why? | root `CHANGELOG.md` + Git history |

## Source-of-truth rules

1. Current code state is determined by the current Git HEAD and current evidence.
2. This memory system records project state; it does not replace the canonical engineering roadmap or verification gate.
3. A chat message is not durable project state until it is promoted into the appropriate layer.
4. Every material defect gets a GitHub Issue or an explicit reference to an existing issue.
5. Every material architectural decision gets a dated Decision Log entry.
6. Every material code change gets a precise commit message and a CHANGELOG entry when user-visible, architectural, security, reliability, or operationally significant.
7. Daily task lists are execution aids, not evidence of completion.
8. External services are synchronization surfaces, not independent sources of truth unless explicitly designated.

## Session handoff protocol

At the start of a session:

1. Read `docs/ROADMAP_CURRENT_GROUND_TRUTH_2026-09-21.md`.
2. Read `docs/external-memory/PROJECT_DASHBOARD.md`.
3. Read the latest entries in `DAILY_TASKS.md`, `DECISION_LOG.md`, and `CHANGELOG.md`.
4. Inspect current Git HEAD before making status claims.
5. For verification claims, use the repository's Strict Verification Gate and evidence registry.

At the end of a session:

1. Move completed tasks to Done only after actual evidence exists.
2. Record new decisions.
3. Record material changes in CHANGELOG.
4. Create/update Issues for unresolved defects.
5. Update the architecture diagram when component relationships change.
6. Leave a concise handoff entry in the dashboard.

## External app mapping

- **Project board:** use the existing project-management board for Layer 1. If the selected board is not accessible from ChatGPT, the repository dashboard remains the fallback canonical execution map.
- **TickTick:** daily reminders and small tasks only.
- **Notion:** long-lived decisions/specifications and searchable project knowledge.
- **Google Keep:** transient capture only; promote durable items later.
- **Excalidraw:** visual architecture and dependency map.
- **GitHub:** code, issues, evidence, history, and canonical implementation state.

## Anti-drift rule

If an external app disagrees with GitHub/current evidence, do not silently reconcile it. Mark the discrepancy, inspect the current repository state, and update the external memory surface after the repository truth is established.
