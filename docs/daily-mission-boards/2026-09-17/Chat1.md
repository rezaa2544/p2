# شیفت کاری ۲ — Chat1

Base reference: `main@d262b4e624a021f478fd965dc29edd972dec9302`

Rules: one active mission at a time; scope isolation; no `git add -A`; no force-push; raw test exits; NOT-RUN is not PASS; push/merge evidence required; never touch another Arena's owned files; merge only after reconciliation.

| # | Mission ID | مأموریت | Acceptance |
|---:|---|---|---|
| 1 | `C1-01` | State recovery و تعیین Base واحد | main/branch/PR state + یک Base SHA canonical + branch ownership ثبت شود |
| 2 | `C1-02` | حل تعارض Wave-1 بین Chat1/Chat3 | یک انتخاب معماری مستند + conflict map + ترتیب merge؛ بدون کد |
| 3 | `C1-03` | فرود Wave-1 canonical | wave1-multi-instance و wave1-gate روی درخت نهایی PASS |
| 4 | `C1-04` | Inventory fallbackهای JSON/in-memory | تمام production read/write pathها file:line + owner + disposition |
| 5 | `C1-05` | حذف یک fallback تولیدی تأییدشده | targeted regression + Wave1 gate PASS |
| 6 | `C1-06` | استاندارد error-path در یک ماژول | error code/message/context + success/failure tests |
| 7 | `C1-07` | Developer handoff map | entrypoint/ownership/invariant/test/debug map قابل استفاده |
| 8 | `C1-08` | Validator گزارش/evidence | validator فیلدهای SHA/test/exit/scope را اجباری کند |
| 9 | `C1-09` | Arena isolation guard | foreign/shared branch یا path قبل از edit تشخیص داده شود |
| 10 | `C1-10` | Generated-artifact provenance gate | source→index/write-perms/guide stale mutant را بگیرد |
| 11 | `C1-11` | Post-merge audit برای C1-05 | ادعاهای f75/eb99 روی main فعلی دوباره سنجیده شود |
| 12 | `C1-12` | Release candidate rehearsal | clean checkout + gate matrix + artifact reproducibility |
| 13 | `C1-13` | Dependency map موانع P0/P1/F11/F13/F14 | هر blocker یک owner/next action/evidence داشته باشد |
| 14 | `C1-14` | Architecture order gate | اجرای خارج از ترتیب Waveها detect/block شود |
| 15 | `C1-15` | Roadmap evidence reconciliation | statusهای NATIONAL_ROADMAP با SHA/date فعلی reconcile شوند |
| 16 | `C1-16` | Refresh شش P0 blocker | هر کارت status/dependency/owner/evidence فعلی داشته باشد |
| 17 | `C1-17` | Dependency map Waves 21–26 و EI | اولین P0-EIهای قابل اجرا بعد از زیرساخت مشخص شوند |
| 18 | `C1-18` | UI/UX readiness inventory | critical UX defects با file/line و owner آماده شوند |
| 19 | `C1-19` | Shift ledger reconciliation | Mission→SHA→PR→merge→tests→conflict برای همه ثبت شود |
| 20 | `C1-20` | End-of-shift audit package | بسته نهایی reproducible برای ChatGPT؛ بدون GO/NO-GO |

## Execution contract
`PLANNED → ASSIGNED → ACTIVE → EXECUTED → REPORTED → COMMITTED → PUSHED → PR/MERGE → VERIFIED → NEXT`

A mission is not complete until its exact SHA, test exits, PR/merge state and touched-file scope are recorded.
