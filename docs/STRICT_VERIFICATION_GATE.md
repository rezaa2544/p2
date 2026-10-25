PAYESH STRICT VERIFICATION GATE

MANDATORY / NON-BYPASSABLE / GROUND-TRUTH

NO EVIDENCE CHAIN -> NO GREEN CHECK.

هیچ قابلیت، فاز، defect، security control، role، route، data flow، intelligence engine یا operational claim نباید فقط به دلیل سبز شدن تست، CI، گزارش AI یا review به عنوان PASS/VERIFIED ثبت شود.

THREE-AI RULE
هر آیتم قابل گواهی باید برای همان HEAD/commit توسط سه بررسی مستقل ارزیابی شود:
1) ChatGPT: معماری، امنیت، منطق و ground truth
2) Arena: اجرای مستقل و adversarial
3) Atria: adversarial reproduction و defect hunting

هیچ مدل نباید نتیجه دو مدل دیگر را مبنا قرار دهد. اختلاف‌ها باید ثبت و حل شوند.

EVIDENCE CONTRACT
برای VERIFIED/CERTIFIED وجود requirement، HEAD SHA، positive test، negative/adversarial test، runtime evidence در موارد runtime، data/tenant/ownership evidence در موارد مرتبط، failure/recovery evidence در موارد مرتبط، تعداد واقعی checks، نبود false-green، سه review مستقل، artifact/log قابل بازتولید، reviewer/timestamp و known limitations الزامی است.

STATUS MACHINE
UNKNOWN -> TESTED -> RUNTIME_VERIFIED -> ADVERSARIAL_VERIFIED -> INDEPENDENTLY_VERIFIED -> CERTIFIED
code reviewed، test passed، CI green، AI said pass، historical verified، deferred و not reproduced معادل PASS نیستند.

FALSE-GREEN BLOCKERS
assert(true)، assertion ثابت، process.exit(0) برای پایان موفق بدون اثبات checks، 0/0، || true برای بلعیدن failure، self-skip/environment skip که PASS گزارش کند، mock-only برای real-runtime، test بدون اجرای target path، prerequisite غایب با PASS، historical CI برای current HEAD و evidence بدون binding به HEAD، همگی blocker هستند مگر در allowlist صریح با owner/reason/expiry/test جایگزین.

FAIL-CLOSED
registry ناقص، SHA متفاوت، نبود یکی از سه review، نبود evidence یا ناتوانی gate در اثبات ادعا = NOT VERIFIED + exit 1. هیچ fallback سبزی وجود ندارد.

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
