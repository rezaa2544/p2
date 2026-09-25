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
V-02 weak evidence binding            -> V-02 evidence binds HEAD+artifact+hash (and registry head_bound == HEAD)
V-03 reviewer independence            -> V-03 reviewer evidence pairwise distinct (no byte-cloned PASS)
V-04 status machine                   -> V-04 allowed_statuses == canonical machine; item/verdict membership enforced
V-05 BLOCKED_UNTIL ignored            -> V-05 top-level status must be in the machine and not BLOCKED*
V-06 local-only HEAD binding          -> V-06 origin/main resolvable and HEAD contained in origin/main
V-07 scanner coverage                 -> G7 walks sh/ts/json + self-skip/self-only/expect-true patterns; G6b allowlist entries must be owned (owner/reason/expiry/replacement) and may be path-scoped
V-08 self-attested intelligence       -> V-08 self-certification modules may not be the sole evidence source
V-09 certification input injection    -> V-09 every reviewer PASS needs reviews_recorded + item.reviews + slot-identity corroboration
V-10 human governance fail-open       -> V-10 human_governance absent keys fail; approver must be human (not an AI reviewer), head-bound
V-11 empty zero-ranking compliance    -> V-11 checks_total >= 1 (no 0/0) and both positive and adversarial evidence present
V-12 evidence schema                  -> V-12 mandatory schema for evidence/reviewer/run/command/exit/artifact/hash/runtime (docs/verification/VERIFICATION_EVIDENCE_SCHEMA.json, pinned in the gate)

FAIL-CLOSED: any missing/unprovable field above => NOT VERIFIED + exit 1. No fallback green.
