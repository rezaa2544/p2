# Wave 18 — National Load Testing — Handoff

**Date:** 2026-09-12
**Branch:** `feat/wave18-load-test` (از `main` @ `4cf53af` — بدون دست‌زدن به شاخه‌های دیگر)
**Status:** هر ۵ سناریوی طرح روی محیط production-like سندباکس اجرا و مستند شد
**Author:** rezaa2544

---

## چه ساخته/اجراء شد

- **محیط:** PostgreSQL 17.11 (`payesh_w18`) + Redis 8.0.2 روی یک جعبهٔ ۲vCPU/۲GB؛ دیتاست ملی مقیاس ۰٫۳ (seed=20260912): ‏۳۰٬۰۰۰ مدرسه، ۳۰۰٬۰۰۰ کلاس، ۳٬۰۰۰٬۰۰۱ کاربر، ۱۵M سطر حضور، ۶M نمره (~۷٫۶GB)؛ بارگذاری با `tools/w18-load-pg.sh` (۸m10s)؛ k6 v2.2.0.
- **اجرا:** پنج سناریو (بار ۵۰۰/s، اوج ۲۰۰۰/s، فشار رَمپ ۱۰۰→۵۰۰۰/s، جهش ۵۰۰→۳۰۰۰، سوک ۱۰۰۰/s×۱۵m فشرده) با سوئیتِ ارتقایافتهٔ `tests/performance/suites/national-load-test.js`: استخر ۴۰ مدیر واقعی (`PAYESH_USERS=phone:nid,…`)، نوشتنِ حضور با idهای نشست/دیتاست (نسبت ۸:۱)، envهای `SPIKE_BASE`/`TIME_SCALE`/`MAX_VUS`/`SUMMARY_FILE`. اعداد کامل در `docs/WAVE18_LOAD_TEST_REPORT.md`.
- **سه یافتهٔ معماری (ریشه‌یابی کمّی + رفع/پیشنهاد):**
  1. بوتِ PG-live با هیدراتاسیون کامل جداول ⇒ OOM گارانتی‌شده (۲۴M سطر). رفعِ اعمال‌شده: envهای `PAYESH_PG_HYDRATE_LIMIT=tbl:cap` / `PAYESH_PG_HYDRATE_SKIP` در `server/db.js` (پیش‌فرض = رفتار قبلی؛ `server/index.js` لاگ capped/env-skipped).
  2. هزینهٔ حافظهٔ هر درخواستِ هم‌زمان ~۱MB (سنجش ۳۵۰-موازی: ۳۱→۳۴۶MB) — عاملِ اصلی: snapshotِ `JSON.parse(JSON.stringify(store[c]))` به‌ازای هر sync (O(collection) نه O(batch)). پیشنهادِ ثبت‌شده در گزارش §۵-۲.
  3. رشدِ نامحدودِ آینهٔ store در مسیرِ نوشتن (۱۰,۴۸۸B/نوشتن سنجیده شد) + auth با اسکن خطی و بدونِ ایندکس `users.phone`.
- **نتیجهٔ سلامت:** صفر خطای نوشتن در هر ۵ سناریو (۱۹٬۰۴۲ sync اتمیک؛ پس از هر مرگِ OOM، بازشماریِ PG سالم). سقفِ تک‌جعبه ~۶۳۰rps؛ مرگِ OOM فقط در فشارِ پایدار ۳×+ (exit 137، بازیابی با ری‌استارت).
- **تست‌ها:** `wave18-load` ‏38/38 · `wave18-stress` (جدید) ‏34/34 · `wave18-spike` (جدید) ‏22/22 · گیت‌های پایه پس از تغییرات: smoke ‏547/547 · check-authz ‏0 · secret-scan ‏11/11 · build --check ✓.

## محدودیت‌ها — ادعای سبز نشود

- سوکِ ۲۴h واقعی اجرا نشد (۱۵m فشرده زیر ۶٫۸× اضافه‌بار)؛ فشار ۵۰۰۰ به‌صورت iter/s عرضه با سقفِ مولد ۳۰۰ VU اعمال شد (۵۰۰۰ VU روی جعبهٔ مشترک بی‌معنا بود).
- مولد و سرور و PG روی یک جعبه بودند ⇒ اعداد، حدِ پایینِ سیستم‌اند؛ اعدادِ ۱۰M/۲۰k-rps نیازمند استیجینگِ مجزای چندنمونه‌ای طبق §21 طرح‌اند.
- `users.phone` هنوز ایندکس ندارد؛ `public-report` از آینهٔ مقیّد محاسبه می‌شود (تقریب) — هر دو در گزارش §۵ با پیشنهاد ثبت شد.
- واگرایی ابعاد مولد دیتاست با §۲.۱ طرح بار (قلم ۲ `docs/DOCS_CONSISTENCY_REPORT.md`) همچنان باز.

---

# Bug Hunt Session 8 / Wave 9 — Handoff

**Date:** 2026-09-11
**Branch:** `feat/bughunt-session8-wave9`
**Status:** Performance fixes complete; delivery gates/documentation in progress
**Code-fix HEAD:** `685f935`
**Author:** rezaa2544

---

## Completed in this session

- Eight independent performance/resource fixes were completed with red regression, fix, mutation test, and separate Conventional Commit: `062fbe3`, `324eec8`, `8f45f54`, `d4fc168`, `6035028`, `dd2d7eb`, `6aeb5ba`, `e54b998`.
- Wave 8 outbox mutation-fixture drift was repaired in `685f935`; final `wave8-outbox` is 14/14 and its mutations are 5/5.
- Fast gates are green: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 9 39/39.
- Session 8 regressions total 38/38 checks across the eight suites; all 16 Session 8 mutants were killed and every baseline was restored green.
- Detailed evidence: `docs/WAVE9_SESSION8_PERFORMANCE.md`; cumulative report: `docs/BUG_HUNT_REPORT.md`.

## Explicit limitations — do not report as green

- `tests/wave8-deep-audit.js` is missing from the repository; running it produced `MODULE_NOT_FOUND`.
- `scripts/run-all-tests.sh` did not reach a final total during the clean attempt because stale/overlapping runner processes were stopped after the tool window. Partial legacy reds remain unaccepted; no full-suite green claim is made.
- Local Node is v20.20.2 while the package engine requests >=22; the fast gates run but retain that environment warning.
- Ruflo is not installed in the sandbox. The requested key `bug_hunt_session8` is pending; no fabricated memory-write result exists.

## Delivery status

- Fast gates were repeated after the documentation commit: smoke 547/547, authz exit 0, secret scan 11/11, build check pass, Wave 8 outbox 14/14 + mutations 5/5, and Wave 9 39/39.
- With temporary authentication, `feat/bughunt-session8-wave9` was pushed successfully; the permanent remote remains credential-free.
- PR created: `https://github.com/rezaa2544/p2/pull/75` with title `fix: bug hunt session 8 (wave 9 performance)`.
- Fallback bundle remains verified at `/home/user/bandle/bug-hunt-session8-wave9.bundle`; 24 credential-free patches are in `/home/user/bandle/patches/`.
- Ruflo registration `bug_hunt_session8` is pending because `ruflo` is not installed; no fabricated memory result is recorded.

---

# Historical handoff — Wave 19 Chaos Residuals

**Date:** 2026-09-11
**Branch:** feat/wave19-residuals
**Status:** In Progress
**Author:** rezaa2544

---

## Session Summary

Wave 19 Chaos Residuals session: re-running C1-C6 checks with Redis 7.4.2, adding network-level chaos (AZ partition) and WAL-disk-full scenarios, running all tests, and creating PR.

## Infrastructure Limitations

- npm install times out: jsdom, ruflo not installed
- bash not available: Required for tools/chaos-test.sh and wave19-chaos.js C1-C3
- ruflo@3.39.2 does not exist on npm registry
- Linux-only tools: tc, netem, fallocate unavailable on Windows
- PostgreSQL/Redis not running as embedded instances

## Tests Status

| Test | Result | Notes |
|------|--------|-------|
| node tests/smoke.js | SKIPPED | jsdom not installed |
| node tools/check-authz.js | PASS | 385 actions, all authorized |
| node tests/secret-scan.js | 10/11 | 4 hits are false positives |
| node build.js --check | PASS | Bit-for-bit match |
| node tests/wave19-chaos.js | PARTIAL | C1-C3 fail (no bash) |
| node tests/wave16-dr.js | 73/75 | 2 pre-existing failures |

## Scenarios (Documented, DRY_RUN)

1. kill-api (SIGKILL)
2. redis-down
3. pg-down
4. net-latency
5. disk-full
6. AZ partition (added)
7. WAL-disk-full (added)

## Commits

1. feat: add Wave 19 chaos live report and HANDOFF.md
2. feat: add S6 AZ partition + S7 WAL-disk-full to Wave 19 plan
3. feat: link chaos playbooks in INCIDENT_RESPONSE.md

## PR

See gh pr create output below.

## Next Steps

1. Install dependencies on a machine with better network
2. Set up PostgreSQL 16 + Redis 7.4.2 via embedded-postgres
3. Install Git Bash/WSL for bash compatibility
4. Execute --live scenarios
5. Install ruflo from source or alternative registry
6. Run network-level chaos and WAL-disk-full drills on Linux

## Incident Reference

- incident: wave19-chaos-residuals
- See docs/INCIDENT_RESPONSE.md for process
- See docs/WAVE19_CHAOS_LIVE_REPORT.md for full report
