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
