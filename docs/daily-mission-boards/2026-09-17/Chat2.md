# شیفت کاری ۲ — Chat2

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C2-01` | SI-012 closure evidence | status امنِ rotate/revoke؛ بدون token value |
| 2 | `C2-02` | Authz model/write-perms parity | zero unexplained drift + negative control |
| 3 | `C2-03` | is_head end-to-end contract | seed/model/write-perms/sync/policy/UI positive+negative |
| 4 | `C2-04` | Tenant isolation negative tests | cross-school/office access fail-closed |
| 5 | `C2-05` | Mass-assignment audit | forbidden fields rejected on targeted routes |
| 6 | `C2-06` | HPP audit | duplicate parameter cases blocked safely |
| 7 | `C2-07` | SSRF webhook audit | internal/dangerous targets blocked |
| 8 | `C2-08` | Host-header/cache-poison audit | canonical host handling verified |
| 9 | `C2-09` | Sensitive logging audit | secrets/PII not emitted |
| 10 | `C2-10` | CodeQL autofix verification A | selected merged alerts source+test verified |
| 11 | `C2-11` | CodeQL autofix verification B | remaining selected alerts dispositioned |
| 12 | `C2-12` | Workflow permission audit | least-privilege permissions verified |
| 13 | `C2-13` | Dependency security audit | actionable advisories dispositioned |
| 14 | `C2-14` | Encoding/sink audit | HTML/URL/attribute sinks context-safe |
| 15 | `C2-15` | Authz regression battery | positive/negative deterministic |
| 16 | `C2-16` | Security error taxonomy | stable machine code + safe UI/log semantics |
| 17 | `C2-17` | Session/CORS/CSRF config audit | unsafe defaults fixed or escalated |
| 18 | `C2-18` | Secret-scan hardening | negative fixture caught; no real secret |
| 19 | `C2-19` | Security developer runbook | authz/tenant/SSRF/logging debug path |
| 20 | `C2-20` | Security release gate | full security matrix + handback |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
