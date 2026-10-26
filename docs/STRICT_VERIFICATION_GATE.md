PAYESH STRICT VERIFICATION GATE

MANDATORY / NON-BYPASSABLE / GROUND-TRUTH

NO EVIDENCE CHAIN -> NO GREEN CHECK.

OPERATING MODEL (2026-10): Arena is the sole required AI execution/review agent. ChatGPT and Atria are not required reviewer slots; no missing vote may be fabricated or used as a blocker. Human governance and fail-closed evidence requirements remain mandatory.

هیچ قابلیت، فاز، defect، security control، role، route، data flow، intelligence engine یا operational claim نباید فقط به دلیل سبز شدن تست، CI، گزارش AI یا review به عنوان PASS/VERIFIED ثبت شود.

ARENA-ONLY REVIEW RULE
هر آیتم باید توسط Arena برای همان HEAD/commit ارزیابی شود. Arena مسئول اجرا، بررسی کد، تست مثبت و منفی، ثبت محدودیت‌ها و ارائه شواهد قابل بازتولید است. رأی ChatGPT یا Atria الزامی نیست و نباید به‌صورت صوری تولید شود.

Human governance همچنان جداست: تصمیم‌های مالک پروژه و تأیید انسانی هرگز با رأی Arena جایگزین نمی‌شوند.

EVIDENCE CONTRACT
برای VERIFIED/CERTIFIED وجود requirement، HEAD SHA، positive test، negative/adversarial test، runtime evidence در موارد runtime، data/tenant/ownership evidence در موارد مرتبط، failure/recovery evidence در موارد مرتبط، تعداد واقعی checks، نبود false-green، review مستند Arena، artifact/log قابل بازتولید، reviewer/timestamp و known limitations الزامی است.

STATUS MACHINE
UNKNOWN -> TESTED -> RUNTIME_VERIFIED -> ADVERSARIAL_VERIFIED -> INDEPENDENTLY_VERIFIED -> CERTIFIED
code reviewed، test passed، CI green، AI said pass، historical verified، deferred و not reproduced معادل PASS نیستند.

FALSE-GREEN BLOCKERS
assert(true)، assertion ثابت، process.exit(0) برای پایان موفق بدون اثبات checks، 0/0، || true برای بلعیدن failure، self-skip/environment skip که PASS گزارش کند، mock-only برای real-runtime، test بدون اجرای target path، prerequisite غایب با PASS، historical CI برای current HEAD و evidence بدون binding به HEAD، همگی blocker هستند مگر در allowlist صریح با owner/reason/expiry/test جایگزین.

FAIL-CLOSED
registry ناقص، SHA متفاوت، نبود review یا evidence معتبر Arena، نبود evidence یا ناتوانی gate در اثبات ادعا = NOT VERIFIED + exit 1. هیچ fallback سبزی وجود ندارد.

SCOPE
Authentication/Session، RBAC/ABAC/Policy، Tenant/IDOR/ownership، API/Backend، PostgreSQL، Redis/Queue/Worker/Outbox، Sync/Offline/Conflict/OCC، Intelligence/Analytics، Frontend، Roles/Capabilities، E2E، Failure/Recovery/HA/DR، Performance، Observability، CI/Test integrity، Migration/Backup/Restore، Production readiness و هر architecture/security claim جدید.

A-01..A-23 در docs/audit/ATRIA_PHASE_A_CARRYOVER.md نیز مشمول این gate هستند؛ deferred یا out of scope clearance نیست.

هدف: حذف مسیرهای false-green و افزایش confidence با evidence مستقل، قابل بازسازی و fail-closed.

A-30 HARDENING CONTRACT (V-01..V-12) — GATE CHECKS

Registry exploits below must be rejected by tools/strict-verification-gate.js with exit 1.
Negative fixtures: tests/strict-verification-gate.negative.test.js (wired in .github/workflows/strict-verification.yml).

V-01 empty-registry bypass            -> V-01 registry declares a non-empty items array
V-02 evidence binding            -> V-02 binds immutable evidence SHA + artifact + hash; normally checkout HEAD, or the parent SHA only when a metadata-only commit changes exactly docs/verification/VERIFICATION_REGISTRY.json (ancestry still checks checkout HEAD)
V-03 reviewer independence            -> V-03 reviewer evidence pairwise distinct (no byte-cloned PASS)
V-04 status machine                   -> V-04 allowed_statuses == canonical machine; item/verdict membership enforced
V-05 BLOCKED_UNTIL ignored            -> V-05 top-level status must be in the machine and not BLOCKED*
V-06 remote ancestry binding          -> origin/main resolves; on push/main HEAD is an ancestor of origin/main, while on pull_request origin/main is an ancestor of PR HEAD
V-07 scanner coverage                 -> G7 walks sh/ts/json + self-skip/self-only/expect-true patterns; G6b allowlist entries must be owned (owner/reason/expiry/replacement) and may be path-scoped
V-08 self-attested intelligence       -> V-08 self-certification modules may not be the sole evidence source
V-09 certification input injection    -> V-09 every reviewer PASS needs reviews_recorded + item.reviews + slot-identity corroboration
V-10 human governance fail-open       -> V-10 human_governance absent keys fail; approver must be human (not an AI reviewer), head-bound
V-11 empty zero-ranking compliance    -> V-11 checks_total >= 1 (no 0/0) and both positive and adversarial evidence present
V-12 evidence schema                  -> V-12 mandatory schema for evidence/reviewer/run/command/exit/artifact/hash/runtime (docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json, pinned in the gate)

FAIL-CLOSED: any missing/unprovable field above => NOT VERIFIED + exit 1. No fallback green.


TWO-PHASE REGISTRY BINDING (Issue #472)
A tracked registry cannot store the SHA of the same commit containing it: changing the registry changes that commit SHA. The gate therefore supports a metadata-only commit protocol:
1. Run required tests and collect independent evidence against an immutable source SHA.
2. Commit only `docs/verification/VERIFICATION_REGISTRY.json` in a child commit.
3. The gate binds registry `head_bound`, item `head_sha`, evidence `head_sha`, and human-governance `head_sha` to the parent source SHA only if HEAD is a single-parent, non-merge commit and `git diff --name-only --no-renames HEAD^ HEAD` contains exactly that registry path. Merge commits are rejected for metadata-only binding.
4. Any additional changed path, missing parent, mismatched SHA, artifact/hash mismatch, absent human approval, or missing reviewer evidence remains FAIL / NOT VERIFIED.
4a. Rejected shapes are pinned by real-git adversarial fixtures in `tests/strict-verification-gate.negative.test.js`: an extra changed path in the metadata commit, a rename whose post-image is the registry path, an empty commit placed right after a valid metadata commit (it must not inherit the privilege), and a parentless commit. Under a deliberate weakening of the sole-path rule (`changed.includes(path)`) those fixtures go red with `ACCEPTED by gate (defect)`, so the contract is mutation-verified rather than asserted.
5. This protocol resolves SHA self-reference only; it does not create evidence or grant approvals. The registry must not be updated to imply tests/reviews that were not performed on the source SHA.

LANDING MECHANICS (measured on the live gate, 2026-10-24)
The binding reads the parent of the landed commit, so the merge strategy is part of the contract, not a style choice:
6. Land the metadata commit with a fast-forward, rebase or squash — a single-parent landing commit. A `--no-ff` merge commit gives the metadata commit two parents, `parent_count != 1`, the metadata-only privilege is refused, `evidenceHead` stays at the landing SHA and every per-item `V-02`, `G9` and the registry-level `V-10` binding fails. Measured with a synthetic conformant registry on the current gate: metadata commit on a branch = exit 1 with 1 FAIL (`V-06`, the expected self-reference while unmerged), fast-forward landing = exit 0 with 0 FAIL, merge-commit landing = exit 1 with 60 FAIL (`V-02` x30 + `G9` x29 + `V-10` x1). Repo policy for `main` may still require a merge commit for ordinary PRs; that is why step 7 exists.
7. Write `head_bound` (and item, evidence and human-governance `head_sha`) as the exact pre-landing `origin/main` SHA, because that is the parent the landed commit will carry. Collect all evidence against that same SHA: rebase the metadata commit onto a newer `main` only after re-running the gate, the fixtures and re-issuing the review/approval bindings, otherwise `V-06`/`V-02`/`G9` go red and no amount of registry editing repairs it.
8. Pre-flight before pushing (read-only, no ref is moved): `git rev-list --parents -n 1 <candidate>` must print exactly two SHA tokens, and `git diff --name-only --no-renames <pre-landing-main> <candidate>` must print exactly `docs/verification/VERIFICATION_REGISTRY.json`. If either differs, the landing cannot bind and must be rebuilt, not patched afterwards.


M15-01 ADDENDUM (2026-10-26) — REGISTRY & STRICT VERIFICATION REPAIR

Measured defects this addendum closes. Each one is a way an honest registry stopped being
able to say "not verified", or a way a non-verification stopped being detectable.

D-1  REGISTRY COULD NOT REPRESENT "NOT VERIFIED". The A-01..A-29 records carried `atria_status`
     prose, no `status`, no `head_sha`, no `evidence` objects and no `arena` slot. A legacy
     record could therefore be neither verified nor blocked: all 29 items failed V-04/V-12 at
     once, and the only way out was to fabricate statuses. Fixed by the blocked state below.
D-2  HEADLINE COULD OUT-CLAIM THE ITEMS. Nothing bound `status` to the items, so a registry of
     29 UNKNOWN items could carry any headline, and one blocked item could be buried.
D-3  ARTIFACT HASHES COVERED UNCOMMITTED BYTES. V-02 hashed the working tree only, so a log
     could be hashed against content that never existed in the evidence commit.
D-4  A FAILING RUN COULD BE FILED AS EVIDENCE. `exit_code` was documented as "must be 0" but
     was never checked, and `checks_passed` was not compared with `checks_total`.
D-5  COMPLETENESS WAS ONE-DIRECTIONAL. G14b proved declared ids exist; an item that was never
     declared rode along, and duplicate declarations were accepted.
D-6  "NOTHING VERIFIED" READ AS A GREEN GATE. A schema-valid registry whose items were all
     UNKNOWN printed `VERDICT VERIFIED` and exited 0.
D-7  THE FIXTURES SPOKE A RETIRED CONTRACT. tests/strict-verification-gate.negative.test.js and
     tests/strict-verification-gate-a30.test.js still declared chatgpt/arena/atria, so their
     positive controls failed G5 and every negative case was "rejected" by G5 rather than by
     the exploit under test. The harness also accepted any output that merely *contained* the
     check label — including an `OK` line — as proof of rejection.

NEW / CHANGED CHECKS
V-02s/artifacts      every evidence artifact must exist in the evidence commit with exactly the
                     declared sha256 (git cat-file), in addition to the working-tree hash
V-02e/exit           exit_code must be 0 and checks_passed must equal checks_total
V-13 blocked state   blocked=true => status UNKNOWN + blocked_reason + owner_decision_required +
                     Arena verdict BLOCKED; a FAIL/BLOCKED verdict may never carry
                     RUNTIME_VERIFIED or above; verdict BLOCKED without blocked=true fails
V-14 evidence SHA    the evidence SHA must be a real commit and an ancestor of the checkout
V-15 headline        registry status <= weakest item; any blocked item caps it at TESTED
V-16 nothing verified a registry with no item in the verifying band is NOT VERIFIED, exit 1,
                     even when every structural check passes
G14c/G14d            undeclared items and duplicate expected_ids are named
G15b/G17             cited tests|tools paths must exist; no uncommitted tracked drift outside
                     the registry (evidence must describe the committed tree)
V-09b/V-09c          reviews_recorded may not name a retired slot and its records must be
                     distinct non-empty strings
V-12 (schema)        reviewer slots in item.reviews must be known and unique; blocked_item_keys
                     is pinned in the gate and in VERIFICATION_EVIDENCE_SCHEMA.json
G13                  replaced a tautology ("not CERTIFIED implies not CERTIFIED") with a real
                     property: a non-certified item may not claim certification
V-03/G16             structurally vacuous with one reviewer slot — reported as N/A (never counted
                     as a passed check). Independence is not obtainable from AI review under this
                     model; G5 + V-10 + V-15 + V-17 + V-18 bound it.
V-17 shared witness  a byte-identical evidence record (artifact + sha256 + command + exit_code +
                     checks_total + checks_passed + kind) may not certify more than one VERIFYING
                     item unless each sharing item declares `scope`, the scopes differ, and every
                     check identifier named by a scope occurs in the artifacts that item cites.
                     One run pasted under two ids is copy-paste self-confirmation, not evidence;
                     it is not excused by a single-reviewer model because it is not a
                     reviewer-pairwise property. Blocked/UNKNOWN items are exempt: they claim
                     nothing, and forcing a bespoke log per honest non-claim invites invention.
V-18 status reach    with fewer than two declared reviewer slots no item may carry
                     INDEPENDENTLY_VERIFIED or CERTIFIED — those ranks mean "corroborated by
                     another reviewer". The gate caps them instead of letting a vacuous V-03/G16
                     pass buy them back. Widening the reviewer contract is an owner decision.
V-02 ts              an evidence timestamp in the future (beyond a 15-minute skew) is rejected.

EVIDENCE HEADER CONTRACT (registry builder)
Each committed log under `docs/verification/evidence/` starts with a machine-readable header:

    # M15-01-EVIDENCE name=<key> ts=<iso8601> exit=<int> runtime=<a:b,c:d,...> command="<argv>"

`command` contains spaces, so it is QUOTED and the reader captures each value up to the next
`key=` (quoted values are unescaped; unquoted legacy headers are recovered in full). Before this
contract, the builder wrote the command bare and read it back with `/([a-z_]+)=([^\s]+)/`, which
stopped at the first space: every `command` field of a generated registry became the single token
`node` (72/72 fields in one committed registry). The gate then rejects the pointer (G15a needs a
real path or command), so the damage was visible rather than silently green — but a registry
whose `command` does not name the invocation cannot prove reproducibility. The builder now
asserts the write→read round-trip on every run and refuses to emit on any loss
(`node tools/m15-01-build-registry.js --selftest` proves the parser without executing suites), and
`--emit` re-checks the V-17 scoping rule so it cannot produce a registry its own gate would fail.

HONEST BLOCKED STATE (required shape)
  "status": "UNKNOWN", "blocked": true, "blocked_reason": "<why>",
  "owner_decision_required": true, "arena": { "status": "BLOCKED", "evidence": [<review_note>] }
This is CONTRACT PASS and recordable, and it is never VERIFIED: V-16 forces the gate to exit 1
and V-15b keeps the headline at or below TESTED.

MUTATION-VERIFIED FIXTURES
`node tests/m15-01-registry-strict-verification.test.js` runs each acceptance property against
its fixtures, then re-runs the same fixtures against a deliberately weakened copy of the gate
(one check disabled at a time) and fails if a fixture survives its own check being removed.
A fixture that cannot go red is not evidence.

OPEN (OWNER DECISION REQUIRED — NOT VERIFIED ON PURPOSE)
O-1  Human governance. VERIFICATION_REGISTRY.json carries
     human_governance.human_approved=false with no approver and no decided_at, because no human
     decision exists. Until an owner records one, V-10 keeps the whole registry NOT VERIFIED.
     This is not a defect to be worked around; it is the gate working.
O-2  .github/workflows/strict-verification.yml triggers on `push` to `arena/**`, while V-06 in
     push context requires HEAD to be an ancestor of origin/main. A branch push can therefore
     never pass V-06. Either the trigger or the ancestry contract must change, and both choices
     alter a security/CI requirement — that is an owner call, not an execution call.
O-3  Landing mechanics: the metadata-only registry commit must land as a single-parent commit
     (fast-forward or a rebuild after landing). A `--no-ff` merge or a squash makes the registry
     commit non-metadata-only and V-02/G9/V-10 fail by construction. Known and accepted; the
     registry is bound to the source SHA it was built from and must be rebuilt if the line moves.
