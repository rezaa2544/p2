# ممیزی PRها — دور ۲، Batch 6 ‏(PR #17 → #1)

تاریخ: 2026-09-13 · پایه: main@`ad7ce5c` · شاخهٔ ممیزی: `fix/pr-audit-batch-2`

| PR | عنوان | sha | مرج | وضعیت | Evidence |
|---|---|---|---|---|---|
| #17 | Feat/farnaz phase1 chat4 | `fadeae6` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #16 | build(deps-dev): bump jsdom from 25.0.1 to 30.0.1 | `3c5ebff` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #15 | fix(db): add support_tickets table to PostgreSQL schema (G.2 | `15ae1bd` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #14 | Feat/farnaz phase1 chat4 | `54b1820` | ✅ | ✅ | `attpartial-mutations.js` ✅ سبز؛ `attpartial.js` ✅ سبز |
| #13 | Feat/farnaz phase1 chat3 | `daefb69` | ✅ | ✅ | `pubrep-mutations.js` ✅ سبز؛ `pubrep.js` ✅ سبز |
| #12 | Feat/farnaz phase1 chat1 c | `5d7fe50` | ✅ | ✅ | `boom2-mutations.js` ✅ سبز؛ `boom2.js` ✅ سبز؛ `minutes2-mutations.js` ✅ سبز؛ `minutes2.js` ✅ سبز؛ `public2-mutations.js` ✅ سبز؛ `public2.js` ✅ سبز |
| #11 | پایهٔ فرناز — بندهای کوچک اس.۰ تا اس.۵ (پیش‌نویس از چت ۴ برا | `cce3726` | ✅ | ✅ | `dorm-kind-mutations.js` ✅ سبز؛ `dorm-kind.js` ✅ سبز؛ `entry-gpa-mutations.js` ✅ سبز؛ `entry-gpa.js` ✅ سبز؛ `smoke.js` ✅ سبز |
| #10 | Feat/farnaz phase1 chat3 | `6961b72` | ✅ | ✅ | `examcount-mutations.js` ✅ سبز؛ `examcount.js` ✅ سبز؛ `excuse-mutations.js` ✅ سبز؛ `excuse.js` ✅ سبز؛ `goals-mutations.js` ✅ سبز؛ `goals.js` ✅ سبز؛ `ics-mutations.js` ✅ سبز؛ `ics.js` ✅ سبز؛ `pnote-mutations.js` ✅ سبز؛ `pnote.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `tickets-mutations.js` ✅ سبز؛ `tickets.js` ✅ سبز؛ `tomorrow-mutations.js` ✅ سبز؛ `tomorrow.js` ✅ سبز |
| #9 | Feat/farnaz phase1 chat4 | `d941e8d` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #8 | چت ۱ — فرناز فاز ۱ (WIP draft) | `48e88f9` | ✅ | ✅ | `donations-mutations.js` ✅ سبز؛ `donations2.js` ✅ سبز؛ `drills-mutations.js` ✅ سبز؛ `drills2.js` ✅ سبز؛ `family2.js` ✅ سبز؛ `public-security.js` ✅ سبز؛ `public2-mutations.js` ✅ سبز؛ `public2.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `staffatt-mutations.js` ✅ سبز؛ `staffatt2.js` ✅ سبز؛ `training-mutations.js` ✅ سبز؛ `training2.js` ✅ سبز؛ `tuition-exempt-mutations.js` ✅ سبز؛ `tuition-exempt.js` ✅ سبز |
| #7 | docs: add SKILLS_MASTER engineering constitution (v1.0.0) | `71c244a` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
| #6 | feat: implement distributed OTP + rate limiting — R101 | `dc5d60b` | ✅ | ✅⚠️ | `otp-ratelimit-mutations.js` ✅ TIMEOUT در batch؛ بازاجرا با مهلت بلند سبز (همهٔ جهش‌ها کشته)؛ `otp-ratelimit.js` ✅ flaky زیر فشار CPU اجرای انبوه؛ تکی سبز؛ `server1.js` ✅ سبز؛ `server14-gc-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `server14-gc.js` ✅ سبز؛ `server17.js` ✅ flaky زیر فشار CPU اجرای انبوه؛ تکی سبز؛ `server3.js` ✅ سبز |
| #5 | fix: resolve all 6 behavior findings (F01-F06) — R100 | `17f31ac` | ✅ | ✅⚠️ | `backup-snap-mutations.js` ✅ سبز؛ `backup-snap.js` ✅ سبز؛ `dropout-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `genp12-mutations.js` ✅ سبز؛ `genp12.js` ✅ سبز؛ `libserial2-mutations.js` ⚠️ قرمز پیش‌موجود (RED@b53a7a7 هم) — رگرسیون نیست؛ `persist-roundtrip-mutations.js` ✅ سبز؛ `persist-roundtrip.js` ✅ سبز؛ `placement-overflow-mutations.js` ✅ سبز؛ `placement-overflow.js` ✅ سبز؛ `run.js` ✅ سبز؛ `server-mutations.js` ✅ M2 در batch قرمز بود؛ روی main جاری سبز (bh-mut فاز ۲، #139، ری‌تارگت کرده)؛ `simulation.js` ✅ سبز؛ `smoke.js` ✅ سبز؛ `sync-chunk-mutations.js` ✅ سبز؛ `sync-chunk.js` ✅ سبز؛ `tuition-plan-mutations.js` ✅ سبز؛ `tuition-plan.js` ✅ سبز |
| #4 | Feat/request validationfeat: strict request validation for a | `ca9ca60` | ✅ | ❌→✅ | `server15-mutations.js` 🔧 rot الگوی جهش M1/M6 → رفع #150؛ `server15.js` 🔴 رگرسیون main → رفع #143؛ `server18.js` ✅ سبز |
| #3 | fix: resolve document leaks (cert-print, receipt-tuition, re | `4dbceaf` | ✅ | ✅ | `certify.js` ✅ سبز؛ `client-features.js` ✅ سبز؛ `finance2.js` ✅ سبز؛ `theme-picker.js` ✅ سبز |
| #2 | feat: add client-side features (tomorrow checklist, exam cou | `0acd68e` | ✅ | ✅ | `client-features.js` ✅ سبز |
| #1 | ui: بهبودهای بصری جامع — همه بخش‌ها (فقط CSS) | `b153f0f` | ✅ | ✅ | بدون سوئیت تستی مستقیم — کد/داکس؛ مرج و mirror-check پوشش می‌دهد |
