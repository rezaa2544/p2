# Wave 10 (نوبتِ سوم) — Partitioning زنده + chg_id↔Cursor v3 — Handoff

**Date:** 2026-09-11 · **Branch:** `feat/db-scale-wave10` · **Status:** همهٔ گیت‌ها سبز؛ تحویل کامل

## این نوبت چه شد

1. **محیطِ PG زنده:** PostgreSQL 17.11 در سندباکس + role/db `w10`/`payesh_w10`؛
   زنجیرهٔ `001→008` از صفر سبز شد.
2. **مهاجرتِ `009_partition_grades_attendance.sql` (+down):** پارتیشن‌بندیِ
   چهارفازیِ grades/attendance (RANGE(created_at) سالانه + default؛ PK ⇒
   (id, created_at)؛ کپیِ دسته‌ایِ ۵۰k؛ swap یک‌تراکنشی با حفظِ نام‌های
   ایندکس/سکوئنس؛ `*_old` برای rollback، `*_recovered` در down). سه اصلاحِ
   مهمِ دیباگ: حذفِ ۳ ستونِ غیرواقعیِ grades (زنجیرهٔ مهاجرت مرجع است، نه
   schema اپ) + دو ایندکسِ جاافتادهٔ ۰۰۲ (`school_class_date`،
   `school_student_subject`) + رقصِ rename کامل.
3. **رفعِ مسدودکنندهٔ persistOp** (`server/db.js`): جدولِ در
   `PAYESH_PARTITIONED_TABLES` ⇒ UPDATE→INSERT→23505→UPDATE-retry؛ مسیرِ
   legacy دست‌نخورده. خروجیِ `isPartitionedTable` هم export شد.
4. **اتصالِ chg_id به کرسرِ v3:** `cursor.js` (sign سه‌پارامتری + verify) ·
   `pull.js` (`captureChgWatermark` pre-read + مسیرِ byChg بدونِ time-guard +
   `chg_watermark` در پاسخ) · `syncdelta.js` (`CHG_TABLES`).
5. **دو باگِ coercion که تست‌ها گرفتند:** `sign(…,null)` می‌ساخت cw=0 (فیدِ
   chg از صفر!) و `verify` با `Number([1])`/`Number(true)` عبور می‌داد — هر
   دو فیکس + رگرسیون.
6. **تست‌ها:** `tests/partitioning.js` **۴۲/۴۲** (واحد ۱۶ + زندهٔ ۲۶ روی
   PG با فیکسچرِ 180k: پریتی، EXPLAIN pruning، وارون‌سازی) ·
   `tests/chg_id_cursor.js` **۳۳/۳۳** (جدید) · MR1/M17 فاز ۴ به v3+cw
   مهاجرت شد.

## گیت‌ها (همه سبز)

smoke **547/547** · check-authz **0** · secret-scan **11/11** ·
partitioning **42/42** · chg_id_cursor **33/33** · wave10-chg-id **31/31** ·
wave10-db-scale **26/26** · wave10-pgbouncer **22/22** · delta-phase4 **23/23**
(+ جهش **20/20**) · delta-sync-hardening **19/19** · contract-layers **18/18**
· pull-bootstrap **12/12** · pull-to-refresh **15/15** · wave3-keyset **13/13**
· migration-sequence ✓ · build --check ✓

## محدودیت‌ها — سبز گزارش نشود

- **۵۰M/۲۸۸M در سندباکس اجرا نشد** — فیکسچرِ 180k + زمان‌سنجی
  (~۳۵k سطر/s کپی) + برون‌یابیِ مستند (۵۰M ≈ ۲۴ دقیقه؛ فقط مرتبهٔ بزرگی).
  `docs/WAVE10_DB_SCALE.md` §۷.۴.
- read-replica همچنان fake-DB (تأییدِ نهایی موعودِ استیجینگ).
- ۰۰۹ روی استیجینگ/تولید هنوز اجرا نشده — پیش‌نیازِ فعال‌سازی: تنظیمِ
  `PAYESH_PARTITIONED_TABLES=grades,attendance` **فقط پس از** اجرای ۰۰۹.
- PG زندهٔ سندباکس بین ترن‌ها پاک می‌شود؛ راه‌اندازیِ تکرارپذیر در
  `tests/partitioning.js` سربرگ + `docs/WAVE10_DB_SCALE.md` §۷.

## پی‌آیندهای پیشنهادی نوبتِ بعد

- اجرای ۰۰۹ بر استیجینگ با دادهٔ واقعی + `ANALYZE` پس از کپی.
- فعال‌سازیِ `PAYESH_PARTITIONED_TABLES` در compose استیجینگ + پایشِ
  متریک‌های pool پس از تعویض.
- retention سالانهٔ پارتیشن‌ها (detach/drop سال‌های قدیمی با تأییدِ وزارتی —
  طراحی در §۳ نوبتِ دوم).
- کلاینت: نمایشِ سنجهٔ `chg_watermark` در پنل دیباگِ سینک (اختیاری).

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
