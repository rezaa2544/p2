# شیفت کاری ۲ — Chat7

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C7-01` | Current refs baseline | fresh/inherited refs exact |
| 2 | `C7-02` | Stale ref cluster A | one real cluster fixed with delta |
| 3 | `C7-03` | Stale ref cluster B | next independent cluster fixed |
| 4 | `C7-04` | control-plane path remediation | canonical path/exemption; never fake directory |
| 5 | `C7-05` | Refs negative fixture | weakened checker fails |
| 6 | `C7-06` | Report-path isolation | daily reports do not pollute stale-ref gate |
| 7 | `C7-07` | Docs metadata audit | one real orphan fixed if owned |
| 8 | `C7-08` | DOCS_INDEX integrity | one broken link fixed + check |
| 9 | `C7-09` | Historical audit integrity | historical blocks byte-preserved |
| 10 | `C7-10` | Quoted-path convention | evidence quotes do not become stale refs |
| 11 | `C7-11` | Baseline provenance audit | no blind baseline rebase |
| 12 | `C7-12` | Docs gate performance | runtime benchmark + one safe optimization |
| 13 | `C7-13` | Docs CI integration | correct path + nonzero failure semantics |
| 14 | `C7-14` | Docs error messages | path/cause/remediation explicit |
| 15 | `C7-15` | Documentation ownership map | release-critical docs owned |
| 16 | `C7-16` | Developer docs navigation | architecture/runbooks/gates discoverable |
| 17 | `C7-17` | Docs build reproducibility | clean checkout repeatability |
| 18 | `C7-18` | Freeze consistency audit | manifest vs tree mismatch mapped |
| 19 | `C7-19` | Docs regression gate | refs+stats+metadata negative controls |
| 20 | `C7-20` | Docs handback | final counts/paths/PRs/blockers |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
