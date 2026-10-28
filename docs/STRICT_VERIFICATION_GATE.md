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
V-02 evidence binding            -> V-02 binds immutable evidence SHA + artifact + hash; `binding_mode` selects the rule: `legacy` (checkout HEAD, or the parent SHA only when a metadata-only commit changes exactly docs/verification/VERIFICATION_REGISTRY.json) or `lineage` (source SHA must be an ancestor of the checkout and every witnessed path must be byte-identical to it). Both modes also check artifact existence + hash in that commit. See M15-01 RECOVERY ADDENDUM (R-1/R-2) and tools/lib/verification-witness.js — the gate, the provenance audit and the registry builder share this one implementation.
V-03 reviewer independence            -> V-03 reviewer evidence pairwise distinct (no byte-cloned PASS)
V-04 status machine                   -> V-04 allowed_statuses == canonical machine; item/verdict membership enforced
V-05 BLOCKED_UNTIL ignored            -> V-05 top-level status must be in the machine and not BLOCKED*
V-06 remote ancestry binding          -> origin/main resolves; on push/main HEAD is an ancestor of origin/main, while on pull_request origin/main is an ancestor of PR HEAD
V-07 scanner coverage                 -> G7 walks sh/ts/json + self-skip/self-only/expect-true patterns; G6b allowlist entries must be owned (owner/reason/expiry/replacement) and may be path-scoped
V-08 self-attested intelligence       -> V-08 self-certification modules may not be the sole evidence source
V-09 certification input injection    -> V-09 every reviewer PASS needs reviews_recorded + item.reviews + slot-identity corroboration
V-10 human governance fail-open       -> RETIRED (owner ruling 2026-10-27). No check reads human_governance: a per-registry human signature is not a condition for passing this gate, and its absence is not a failure. Oversight is exercised directly on the repository; the retirement is pinned by controls (see § OWNER RULINGS)
V-11 empty zero-ranking compliance    -> V-11 checks_total >= 1 (no 0/0) and both positive and adversarial evidence present
V-12 evidence schema                  -> V-12 mandatory schema for evidence/reviewer/run/command/exit/artifact/hash/runtime (docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json, pinned in the gate)

FAIL-CLOSED: any missing/unprovable field above => NOT VERIFIED + exit 1. No fallback green.


TWO-PHASE REGISTRY BINDING (Issue #472)
A tracked registry cannot store the SHA of the same commit containing it: changing the registry changes that commit SHA. The gate therefore supports a metadata-only commit protocol:
1. Run required tests and collect independent evidence against an immutable source SHA.
2. Commit only `docs/verification/VERIFICATION_REGISTRY.json` in a child commit.
3. The gate binds registry `head_bound`, item `head_sha` and evidence `head_sha` to the parent source SHA only if HEAD is a single-parent, non-merge commit and `git diff --name-only --no-renames HEAD^ HEAD` contains exactly that registry path. Merge commits are rejected for metadata-only binding.
4. Any additional changed path, missing parent, mismatched SHA, artifact/hash mismatch, or missing reviewer evidence remains FAIL / NOT VERIFIED. (Retiring V-10 removed *only* the human-approval condition — it did not soften a single binding or evidence rule.)
4a. Rejected shapes are pinned by real-git adversarial fixtures in `tests/strict-verification-gate.negative.test.js`: an extra changed path in the metadata commit, a rename whose post-image is the registry path, an empty commit placed right after a valid metadata commit (it must not inherit the privilege), and a parentless commit. Under a deliberate weakening of the sole-path rule (`changed.includes(path)`) those fixtures go red with `ACCEPTED by gate (defect)`, so the contract is mutation-verified rather than asserted.
5. This protocol resolves SHA self-reference only; it does not create evidence or grant approvals. The registry must not be updated to imply tests/reviews that were not performed on the source SHA.

LANDING MECHANICS (measured on the live gate, 2026-10-24)
The binding reads the parent of the landed commit, so the merge strategy is part of the contract, not a style choice:
6. Land the metadata commit with a fast-forward, rebase or squash — a single-parent landing commit. A `--no-ff` merge commit gives the metadata commit two parents, `parent_count != 1`, the metadata-only privilege is refused, `evidenceHead` stays at the landing SHA and every per-item `V-02` and `G9` binding fails. Measured with a synthetic conformant registry on the current gate: metadata commit on a branch = exit 1 with 1 FAIL (`V-06`, the expected self-reference while unmerged), fast-forward landing = exit 0 with 0 FAIL, merge-commit landing = exit 1 with 60 FAIL (`V-02` x30 + `G9` x29 + `V-10` x1) — that figure was measured while V-10 still existed; the same shape now yields the `V-02`/`G9` failures only, and it has not been re-measured here. Repo policy for `main` may still require a merge commit for ordinary PRs; that is why step 7 exists.
7. Write `head_bound` (and item and evidence `head_sha`) as the exact pre-landing `origin/main` SHA, because that is the parent the landed commit will carry. Collect all evidence against that same SHA: rebase the metadata commit onto a newer `main` only after re-running the gate, the fixtures and re-issuing the review/approval bindings, otherwise `V-06`/`V-02`/`G9` go red and no amount of registry editing repairs it.
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
                     model; G5 + V-15 + V-17 + V-18 bound it (V-10 retired 2026-10-27).
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

M15-01 RECOVERY ADDENDUM (2026-10-27) — WHY `main` WAS PERMANENTLY RED, AND THE FIX

R-1  THE BINDING WAS A SCALAR, SO IT EXPIRED ON THE NEXT COMMIT.
     V-02 (and the provenance audit's head-bind) required `head_bound == evidence head`.
     The evidence head was the *checkout* HEAD unless HEAD happened to be a single-parent
     registry-only metadata commit. Any later commit — a docs commit, a Dependabot bump —
     therefore turned every item red forever, and the only repair was to re-run the full
     suite and re-emit the registry after *every* commit. Measured on `fff1beae` (clean
     checkout, no local change): gate `633 pass / 65 fail`, exit 1, every failure being
     `V-02`/`G9` `head_bound=bf263bf2 vs evidence_sha=fff1beae`. The evidence was not wrong;
     the rule could not express "this evidence still describes the code that is here".

R-2  THE AUDIT USED A DIFFERENT RULE THAN THE GATE. `tools/registry-provenance.js` matched
     evidence through `DEPENDENCY_SETS` + `provenance.dependency_hash`, a field no item
     carries, so on the same file it reported 29 UNBOUND rows and exit 2 while the gate
     reported 65 fails. Two implementations of one contract is two contracts.

R-3  V-15 AND V-16 WERE JOINTLY UNSATISFIABLE. V-15 capped the headline at the weakest item
     (29 UNKNOWN legacy records ⇒ UNKNOWN) while V-16 refused a green verdict when no item
     was in the verifying band. With honest legacy records both fire, so no registry of this
     repository could ever pass — a permanent red that encouraged exactly the fabrication the
     gate exists to detect.

THE SHARED RULE (one implementation, three consumers)
`tools/lib/verification-witness.js` is now the only place the binding is defined; the gate,
`tools/registry-provenance.js` and `tools/m15-01-build-registry.js` all call it.

  binding_mode: "legacy"   `head_bound` must equal the evidence head (checkout HEAD, or the
                           parent of a single-parent registry-only metadata commit). The
                           pre-recovery rule, unchanged, still available for old registries.
  binding_mode: "lineage"  `head_bound` is the immutable SOURCE commit: it must be a real
                           commit AND an ancestor of the checkout. The registry carries
                           `witness.paths` and `witness.blobs`.
                           * `witness.paths` must equal the set RECOMPUTED FROM THE REGISTRY
                             (every evidence `artifact`, every repo path cited in an evidence
                             `command`, plus the always-witnessed policy, schema, gate,
                             witness lib, package.json and tests/run.js). A witness can
                             therefore not be shrunk after the fact to hide a changed file,
                             and an inflated one is rejected too.
                           * `witness.blobs[p]` is the git blob sha1 at the source commit; it
                             must equal the blob at the source commit AND the blob at HEAD.
                           Consequence, in both directions: an unrelated docs or dependency
                             commit leaves the evidence valid, while any edit to a witnessed
                             test, tool, policy, schema or evidence log makes the evidence
                             stale and requires a re-run and a re-emit. Stale evidence is
                             rejected, never warned about.

CLOSURE SCOPE (what the headline is allowed to mean)
`closure_scope` names the item ids that define closure; `blocked_items` declares how many
items claim nothing. The checks:
V-19a  `closure_scope` present, duplicate-free and a subset of `expected_ids`
V-19b  every in-scope item is in the verifying band, carries an Arena PASS and is not blocked
V-19c  no item OUTSIDE the scope claims a verifying status (the scope cannot be widened by
       smuggling a verifying item in beside it)
V-19d  no blocked item is inside the scope
V-19e  `blocked_items` equals the real number of blocked items
V-15   rewritten: the headline is bounded by the weakest IN-SCOPE item; an empty scope is
       legal but then the headline must be UNKNOWN
V-15b  a registry with blocked items can never be CERTIFIED
V-16   refuses the green verdict when the scope verifies nothing
This is what makes R-3 satisfiable without lying: 29 honest UNKNOWN legacy records sit
outside the scope and are counted, while the in-scope items are bounded on their own merits.

PINNED BY REAL-GIT FIXTURES
`tests/verification-binding-contract.test.js` (24 checks, `CHECKS 24 FAIL 0`) builds real
repositories and asserts, in both directions, every rule above: a registry-only landing
binds; an unrelated documentation commit does not break the binding; editing a witnessed
file does (and the rejection names it); a shrunk, inflated or forged witness and a
non-ancestor `head_bound` are rejected; legacy mode keeps its strictness; six closure-scope
violations are each rejected; gate and provenance audit agree on valid and on invalid input;
and an in-process mutation matrix proves the *named* rule — not some other check — is what
rejects each case. `tests/strict-verification-gate.negative.test.js` (55/0) and
`tests/strict-verification-gate-a30.test.js` (21/0) were rewritten onto the shared rule;
`tools/lib/verification-witness.js` being inside every witness set is what makes a
commit-based mutation of the rule impossible, which is why the mutation proof is in-process.

DOCUMENTED CONSEQUENCE FOR LANDING
Steps 1–8 above still describe the landing mechanics, but with `binding_mode: "lineage"` the
registry-only commit must carry a witness computed from the source commit, and the source
commit must contain the evidence logs the witness hashes. Re-emitting the registry without
re-running the suite is therefore not a way to clear a red gate: the witness blobs of a
changed test will not match.

OWNER RULINGS
2026-10-27 — HUMAN APPROVAL IS NOT A GATE CONDITION.
  The project owner decided that a separate approval recorded inside VERIFICATION_REGISTRY.json
  must not be required to pass the Strict Verification Gate. Direct owner oversight of the project
  continues; what ended is the per-registry signature, not the oversight.
  Removed: the gate's V-10 check, `human_governance` from `REQUIRED_REGISTRY_KEYS`, the schema's
  `required_registry_keys` entry (the block stays documented as an optional annotation with
  `policed_by_gate: false`), the builder's forced emission of an unapproved block, and the four
  fixtures that asserted redness for a missing/false human approval.
  Unchanged and still enforced: V-02 (SHA + artifact + sha256 + `exit_code == 0` +
  `checks_passed == checks_total`), V-14/V-06 ancestry, V-11/V-12 schema and evidence
  completeness, V-01/G14a-d/`expected_ids` completeness, V-17 witness scoping, V-18 status reach,
  V-13/V-15/V-15b blocked-and-headline discipline, V-16, G7 false-green scanning, and every
  security guard outside this gate.
  Pinned by tests, in both directions: `GOOD-NO-HUMAN-GOVERNANCE` and `GOOD-HUMAN-APPROVAL-FALSE`
  (tests/strict-verification-gate.negative.test.js) must exit 0, and property P3 of
  tests/m15-01-registry-strict-verification.test.js re-injects a human-approval requirement into a
  copy of the gate and asserts that exactly those two controls turn red while the valid `GOOD`
  control stays green. The A-30 contract suite carries the same pair as controls
  (`absent human_governance block stays green`, `an explicitly unapproved human_governance block
  also stays green`). A re-added V-10 therefore cannot pass unnoticed.

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
O-1  Human governance — DECIDED 2026-10-27, see § OWNER RULINGS below. The registry no longer
     carries a human_governance block and the gate no longer asks for one. A registry still cannot
     become green by that change: main's stays NOT VERIFIED because 29 legacy items are UNKNOWN
     (V-15) and no item was promoted.
O-2  .github/workflows/strict-verification.yml triggers on `push` to `arena/**`, while V-06 in
     push context requires HEAD to be an ancestor of origin/main. A branch push can therefore
     never pass V-06. Either the trigger or the ancestry contract must change, and both choices
     alter a security/CI requirement — that is an owner call, not an execution call.
O-3  Landing mechanics: the metadata-only registry commit must land as a single-parent commit
     (fast-forward or a rebuild after landing). A `--no-ff` merge or a squash makes the registry
     commit non-metadata-only and V-02/G9 fail by construction. Known and accepted; the
     registry is bound to the source SHA it was built from and must be rebuilt if the line moves.
