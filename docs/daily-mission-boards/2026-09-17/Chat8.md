# شیفت کاری ۲ — Chat8

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C8-01` | Current integration baseline | main/PR/branch/hotspot map |
| 2 | `C8-02` | Shared-file collision detector | intentional overlap blocked |
| 3 | `C8-03` | Critical integration E2E | login→policy→sync→DB→report |
| 4 | `C8-04` | UI component inventory | shared patterns/duplication map |
| 5 | `C8-05` | Design-system consistency | one concrete shared UI defect fixed |
| 6 | `C8-06` | Form validation UX | immediate validation + recovery |
| 7 | `C8-07` | Error-state UX | offline/timeout/server states clear |
| 8 | `C8-08` | Loading/performance UX | one measured UI bottleneck fixed |
| 9 | `C8-09` | Accessibility UI | one high-impact focus/label issue fixed |
| 10 | `C8-10` | Responsive layout | one confirmed overflow fixed |
| 11 | `C8-11` | Parent experience | one permission-safe usability improvement |
| 12 | `C8-12` | Teacher workflow | one unnecessary step removed safely |
| 13 | `C8-13` | Manager command center | one action-oriented exception panel |
| 14 | `C8-14` | Educational visualization | one validated trend/distribution view |
| 15 | `C8-15` | UI error taxonomy | user vs technical error separation |
| 16 | `C8-16` | UI/server contract tests | schema drift detected |
| 17 | `C8-17` | Build artifact integration | build-check + smoke after UI change |
| 18 | `C8-18` | Cross-Arena integration rehearsal | Chat2/3/4 sequence conflict-free |
| 19 | `C8-19` | Release UX smoke | critical UI path evidence |
| 20 | `C8-20` | Integration handback | conflicts/UI results/candidate SHA |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
