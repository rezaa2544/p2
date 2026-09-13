# گزارش نهایی ممیزی PRها — 2026-09-13

**دامنه:** همهٔ ۱۳۴ PR مرج‌شدهٔ مخزن تا این تاریخ — دور ۱ (‏#133→#119، ۱۱ PR؛ گزارش: `2026-09-13-pr-audit-report.md`) + دور ۲ (۱۱۷ PR باقی‌مانده؛ گزارش‌های `2026-09-13-pr-audit-batch-1..6.md`) + ۶ PR تازه‌مرجِ حین ممیزی (#136، #138، #139، #140 — راستی‌آزمایی مرج در پایهٔ به‌روز).

## جمع‌بندی

| وضعیت | تعداد | شرح |
|---|---|---|
| ✅ سالم | 110 | مرج تأییدشده + سوئیت‌ها سبز (شامل ۱۱ PR دور ۱ — یافتهٔ stats-drift دور ۱ با #136 ناظر منسوخ شد) |
| ✅⚠️ سالم با قرمز پیش‌موجود | 9 | سوئیت مرتبط در b53a7a7 هم قرمز بود — رگرسیونِ PR نیست؛ فهرست در «بدهی پیش‌موجود» |
| ⏸/✅ جزئی NOT-RUN | 4 | a11y-* ‏(playwright در سندباکس نصب‌نشدنی) و load-test ‏(RAM) — بقیهٔ سوئیت‌ها سبز |
| ❌→✅ مشکل یافته + PR رفع | 4 | ‏#124 (رگرسیون resolve⇒del → #143؛ قرارداد W4c → #144) · #4 (rot جهش → #150) · #45/#5 (M2 — روی main جاری با #139 سبز) |

## مشکلات همهٔ دورها و وضعیت رفع

| # | یافته | ریشه | رفع | وضعیت |
|---|---|---|---|---|
| 1 | رانش آمار اسناد (دور ۱) | drift شمارنده‌های DOCS_METRICS | PR #135 | منسوخ — ناظر با #136 مستقل رفع کرد؛ #135 بسته شد |
| 2 | **رگرسیون SG11 + server15 C15c/C16/C17c** | ‏`resolve⇒del` فوری در `05c3136` (باگ ۲ بازبین #124) قرارداد Gap-3 ‏(#59: دلتا ردیف resolved را از updated_at می‌بیند) و 409 already_resolved را می‌شکست | **PR #143**: resolve⇒keep + هرس سقف‌دار جداگانهٔ resolvedها (`PAYESH_RESOLVED_CONFLICTS_MAX`، پیش‌فرض ۵۰۰)؛ جهش ۲/۲ کشته | ✅ **مرج شد** (`ca648cf`) |
| 3 | **رگرسیون wave1-writes W4c** | برش post-commit آینه (‏`430e1b3`، ‏#124) نوتیف مشتق را عمداً از store می‌بُرد؛ قرارداد تست کهنه + شکاف پوشش memory-mode | **PR #144**: ‏W4c به قرارداد جدید + تست W4m جدید (memory-mode)؛ جهش ۲/۲ کشته | ✅ **مرج شد** (`a877b99`) |
| 4 | rot سوئیت جهش server15-mutations ‏(M1/M6 «الگو پیدا نشد» = جهش اعمال‌نشده) | بازآرایی کد در #124 و delta-hardening | PR #150 باز شد؛ ناظر هم‌زمان با **#147** (‏`a150d4d`، مهاجرت کامل به الگوی امن کیت + همان ری‌تارگت) جامع‌تر رفعش کرد | ✅ بسته — #150 منسوخ با #147؛ روی main جاری ۶/۶ کشته |
| 5 | server-mutations M2 «الگو پیدا نشد» | جابجایی scope به policy.js (خیلی قدیمی) | قبلاً در bh-mut فاز ۲ (‏#139 ناظر) ری‌تارگت شده — روی main جاری ۲۰/۲۰ کشته | ✅ بسته (بدون اقدام) |
| 6 | آلودگی درخت کاری سندباکس (گارد نقش خنثی با `if(false&&...)`) | بقایای جهش‌آزمایی چت قبلی — نه در مخزن | `git checkout -- .` + حذف فایل جهش untracked؛ یافته‌های قبل از پاک‌سازی باطل اعلام شد | ✅ بسته (محیطی) |
| 7 | **دنبالهٔ #143 — دو یافتهٔ بازبین devin، هر دو معتبر:** (الف) `apiList` با ۵۰+ resolved تعارض‌های باز را از پاسخ می‌انداخت (`slice(-50)` ابتدای آرایهٔ «بازها اول» را می‌بُرید)؛ (ب) هرس resolvedها بدون tombstone بود — کلاینت آفلاین بسته‌شدن تعارض را هرگز نمی‌شنید | resolve⇒keep ‏#143 هر دو مسیر نهفته را فعال کرد | **PR #153**: ‏`slice(0,50)` (بازها هرگز قربانی سقف نشوند) + tombstone به `__deleted_records` در هرس (قرارداد del موجود)؛ سوئیت جدید `conflicts-list-cap.js` red-first؛ جهش کشته | ✅ **مرج شد** (`264f001`) |
| 8 | **دور ۲ بازبین #153 — دو یافتهٔ دیگر devin، هر دو معتبر:** (الف) سنگ‌قبرهای هرس بیرون جاروی post-commit سقف ۵۰۰۰ نداشتند؛ (ب) UI «داوری‌های اخیر» با قرارداد جدید ترتیب، کهنه‌ترین‌ها را نشان می‌داد (`slice(-5).reverse()`) | دنبالهٔ همان تغییر قرارداد | رفع در همان **#153** ‏(`8e433e1`): برش ۵۰۰۰ بلافاصله در pruneResolved + ‏`slice(0,5)` در UI؛ تست L5/L6 ‏red-first؛ جهش ۲/۲ کشته؛ ‏conflicts-list-cap ‏14/14 | ✅ **مرج شد** (درون #153، ‏`264f001`) |
| 9 | بدهی پیش‌موجود: rot لنگر در `dropout-mutations` ‏(M2/M6) و `wave17-testing-mutations` ‏(Z4) — جهش هرگز اعمال نمی‌شد | تورفتگی build · جابجایی scope به policy.js ‏(‏`3e86993`) · بازآرایی versionedMismatch | **PR #154** (بسته — superseded): ناظر همان سه لنگر را در **#156** با راه‌حل هم‌ارز ترمیم کرد؛ روی main جاری ‏6/6 و 10/10 ✅ |

## راستی‌آزمایی مرج
- ‏۱۱۶/۱۱۷ sha مرج ancestor ‏main ✅.
- **استثنا #59:** sha ‏`282bfbe` فقط از `feat/delta-hardening-phase2` ‏reachable؛ محتوا (تست delta-schema-gaps + سخت‌سازی) از راه `45ac511` در main حاضر و در `282bfbe` ‏12/12 سبز ⇒ content-verified.

## Evidence اجرا (دور ۲)
- ۲۹۵ سوئیت یکتا مرتبط با ۱۱۷ PR اجرا شد (batch + بازاجرای تکی قرمزها + baseline ‏b53a7a7).
- PG-لازم‌ها روی PostgreSQL ‏embedded 18.4 واقعی: ‏p06 ‏60/60 (با تست جدید V8c) · wave23-reports-pg ✅ · p11-live ‏14/14.
- flaky زیر فشار CPU (تکی سبز): otp-ratelimit، server17. TIMEOUTهای batch با مهلت بلند بازاجرا شدند: otp-ratelimit-mutations ✅ · server-mutations ‏20/20 ✅ (روی main جاری) · server15-mutations با #143+#150 ‏۶/۶ ✅.
- NOT-RUN محیطی: a11y-interactive/keyboard/runtime ‏(playwright نصب‌نشدنی در سندباکس — دانلود مرورگر مسدود) · wave18-load-test ‏(RAM ~1GB) · CI ‏(بیلینگ، RISK-O-007).

## بدهی پیش‌موجود (RED@b53a7a7) — دسته‌بندی و تعیین تکلیف (به‌روزرسانی پس از ممیزی)
| دسته | سوئیت‌ها | وضعیت |
|---|---|---|
| ترمیم‌شده (ما در #154، ناظر هم‌ارز در **#156** — مرجِ ناظر برنده؛ #154 بسته) | `dropout-mutations` · `wave17-testing-mutations` | ✅ روی main ‏6/6 و 10/10 |
| قبلاً در شاخهٔ `bh-mut/phase2` ناظر رفع شده (راستی‌آزمایی شد) | `staff-gap-mutations` ‏7/7 · `urgent-ann-mutations` ‏6/6 · `wave5-authz-mutations` ‏5/5 · `server14-gc-mutations` ‏4/4 · `sync-atomic-batch-mutations` ‏5/5 | ✅ **مرج شد** — ناظر شاخهٔ bh-mut/phase2 را با **#152** ‏(`402ef12`) مرج کرد؛ قلم ۵ بسته |
| flaky زیر فشار CPU — تکی سبز | `libserial2-mutations` ‏4/4 · `vocational-grades-mutations` ‏5/5 | ✅ بدون اقدام |
| رفع در **PR #158** ‏(کوریِ سنجه) | `wave14-observability(+mutations)` — چهار روت گزارش وزارتی Wave 23 از `ROUTE_EXACT` جا مانده بود (T7a + برچسب fail-closedِ `api_unmatched`) | ✅ ‏95/95 — منتظر مرج (تنها diff = ‏server/metrics.js) |
| ترمیم‌شده در **#156** ناظر | `wal-disk-full-mutations` (ENOENT ‏migrations در sandbox جهش — رفع ما با ترمیم هم‌ارز ناظر جایگزین شد) | ✅ ‏2/2 green روی main |
| misclassification — سوئیت نیست | `wave15-child` (helper فرزندِ `wave15-health` که 10/10 سبز است) | ✅ بدون اقدام |
| ‏NOT-RUN عمدی / محیطی | `wal-disk-full` ‏(9/14 + ۵ سناریوی live با exit 2 — «سبز جعلی ممنوع»؛ مانور واقعی tmpfs/PG لازم) · `wave18-load-test` ‏(RAM) | 📋 صف P2 ناظر |

## توصیه‌ها
1. ~~مرج زنجیرهٔ #143 → #150 (استک) و #144~~ ✅ انجام شد (‏#143/#144 مرج؛ #150 منسوخ با #147 ناظر). ✅ ‏#153 ‏(`264f001`) و #151 ‏(`23bf513`) هم مرج شدند؛ ناظر #152 ‏(bh-mut/phase2) را نیز مرج کرد. باقی‌مانده: مرج **#158** (فقط ‏server/metrics.js — T7a) + ‏**ACCEPT #129**@`11f97ef`؛ ‏#154 بسته (superseded با #156 ناظر).
2. ~~تعیین تکلیف بدهی پیش‌موجود~~ ✅ دسته‌بندی شد (جدول بالا): ‏۲ سوئیت در #154 رفع؛ ۵ سوئیت در bh-mut/phase2 ناظر آماده (قلم ۵)؛ ۲ flaky بی‌اقدام؛ ۴ شکست واقعی در صف wave جدا.
3. برای سوئیت‌های جهش متن‌محور: لنگرها را با کامنت‌مارکر پایدار کنید تا refactor آن‌ها را نشکند.
4. ‏a11y-*: اجرای دوره‌ای در محیطی با اینترنت باز برای playwright.
5. قلم‌های باز ناظر: ACCEPT ‏#129 · flag-1 · tenancy · counselor · دوزیه §۶ · مشخصه §۵ + دو آستانه (p95 ‏500ms، نرخ ۱٪).

## جدول کامل ۱۳۴ PR

### دور ۱ (جزئیات در `2026-09-13-pr-audit-report.md`)
| PR | وضعیت |
|---|---|
| #133 | ✅ |
| #132 | ✅ |
| #130 | ✅ |
| #128 | ✅ |
| #127 | ✅ |
| #126 | ✅ |
| #125 | ✅ |
| #124 | ✅ |
| #123 | ✅ |
| #122 | ✅ |
| #119 | ✅ |

### دور ۲ (جزئیات + Evidence هر سوئیت در `2026-09-13-pr-audit-batch-1..6.md`)
| PR | عنوان | مرج | وضعیت |
|---|---|---|---|
| #136 | docs: چکیدهٔ بستن حلقهٔ P1-2 + قفل rc40 + ترمیم دو بدهی | ✅ | ✅ |
| #134 | docs(daily): رفع ردیف تکراری BH-mut + گزارش فاز ۱ نسخهٔ | ✅ | ✅ |
| #131 | test(bh-mut): مهاجرت فایل‌های جهش به الگوی امن — فاز ۱  | ✅ | ✅ |
| #121 | fix(p0-6): reviewer round 2 — scoped ins undo, ownershi | ✅ | ✅ |
| #120 | feat(wave23): تکمیل P0-1 — گزارش‌های DB-native برای aca | ✅ | ✅ |
| #117 | docs(p5b): سبزکردنِ قرمزهای ارثی + ثبت ردهٔ گزارش‌ها +  | ✅ | ✅ |
| #116 | docs: daily report P1-1 — users(phone) index + auth fro | ✅ | ✅ |
| #115 | perf(p1-1): users(phone) expression index + auth lookup | ✅ | ✅ |
| #113 | docs: پ۰ — بهداشت ورک‌اسپیس سندباکس (۲۳۲MB→۸۹٫۴MB) + WO | ✅ | ✅ |
| #112 | fix(p0-6): reviewer fixes — ownership-guarded undo, whi | ✅ | ✅ |
| #111 | docs: گزارش روزانهٔ P0-3/P1-1 + ROADMAP/NEXT_ACTIONS +  | ✅ | ✅ |
| #110 | P0-3: آفلاین E2E کامل (restart واقعی+جهش ۷/۷) + P1-1: P | ✅ | ✅ |
| #109 | docs(p5): correct the bundle size + final main SHA | ✅ | ✅ |
| #108 | docs(p5): record the real push evidence (SHAs + main be | ✅ | ✅ |
| #107 | docs(p5): bug-hunt queue disposition (#76/#74/#80) + fr | ✅ | ✅ |
| #106 | fix(bughunt): session-7 non-token fixes split out of #7 | ✅ | ✅ |
| #105 | P0-4: national dataset with real relations (10 new CSVs | ✅ | ✅ |
| #104 | docs(daily-reports): P0-4/P1-3 round + migration reserv | ✅ | ✅ |
| #103 | feat(p0-6): O(batch) sync undo-log + bounded mirror gro | ✅ | ✅ |
| #102 | feat(p0-4): national dataset load at sandbox ceiling (s | ✅ | ✅ |
| #101 | Migration 009: report_logs CHECK constraints + proven t | ✅ | ✅ |
| #100 | docs(daily-reports): گزارش روزانه Wave 3 — بازراستی‌آزم | ✅ | ✅ |
| #99 | test(wave10): گیت زندهٔ PostgreSQL — replica واقعی + پا | ✅ | ✅ |
| #98 | docs(reports): init daily-reports folder + 2026-09-12 r | ✅ | ✅ |
| #97 | Wave 6+11: گیت زندهٔ Redis — قید pending هر دو موج بسته | ✅ | ✅ |
| #96 | Wave 3: گیت برابری فیلد‌به‌فیلد JS↔SQL روی PostgreSQL ز | ✅ | ✅ |
| #95 | E.11: به‌روزرسانی هدفمند راهنمای کاربر (USER_GUIDE) — چ | ✅ | ✅ |
| #94 | feat(wave18): national load test — staging run, bounded | ✅ | ✅ |
| #93 | perf(reports): DB-native attendance report on PostgreSQ | ✅ | ✅ |
| #92 | feat(tools): docs-refs-check ratchet + migration 008 pi | ✅ | ✅ |
| #90 | test(a11y): assert f()'s behaviour, not the spelling of | ✅ | ✅ |
| #89 | Wave 24: بهینه‌سازی عملکرد — ۴/۴ KPI سبز (index.html −۲ | ✅ | ✅ |
| #88 | Wave 23: سیستم گزارش‌دهی پیشرفته — ۴ گزارش وزارتی، آفلا | ✅ | ✅ |
| #87 | feat(tools): docs-stats-sync — stop hand-typing doc cou | ✅ | ✅ |
| #86 | docs: تأیید نهایی Wave 21 + وضعیت PR #74/#81/#84 + آماد | ✅ | ✅ |
| #85 | feat: wave 21 — multigrade matrix view for rural school | ✅ | ✅ |
| #84 | fix: bug hunt session 9 (delta phase 4 / a11y keyboard  | ✅ | ✅ |
| #83 | fix(docs): bundle-recovery commands were broken — inval | ✅ | ✅ |
| #81 | fix(wave19): HANDOFF mojibake + stale migration list +  | ✅ | ✅⚠️ |
| #80 | fix(a11y): keep focus restore alive across nested modal | ✅ | ✅ |
| #79 | docs: restore PUSH_RECOVERY_PLAYBOOK contract + bump do | ✅ | ✅ |
| #78 | feat: WAL disk-full drill (tmpfs variant — second imple | ✅ | ✅⚠️ |
| #77 | feat: a11y keyboard navigation (focus trap + tab order) | ✅ | ⏸/✅ |
| #75 | fix: bug hunt session 8 (wave 9 performance) | ✅ | ✅ |
| #73 | docs: migration guide v2 + duplicate fix | ✅ | ✅ |
| #72 | feat: a11y verification for modals and interactive stat | ✅ | ⏸/✅ |
| #71 | feat: delta sync phase 4 (backpressure, compression, re | ✅ | ✅ |
| #70 | fix: bug hunt session 7 (waves 11-13) | ✅ | ✅ |
| #69 | feat: WCAG 2.1 AA a11y rebuild | ✅ | ⏸/✅ |
| #68 | fix(delta): complete phase-3 schema gaps on main (parti | ✅ | ✅ |
| #67 | Feat/runtime security monitoring | ✅ | ✅ |
| #66 | chore: remove binary artifacts from repo | ✅ | ✅ |
| #65 | Feat/chat2 main sync | ✅ | ✅ |
| #64 | feat: a11y runtime verification (playwright + axe-core) | ✅ | ⏸/✅ |
| #63 | feat: red team + supply chain audit | ✅ | ✅ |
| #62 | Feat/push recovery playbook | ✅ | ❌→✅ |
| #61 | Chat3 restored | ✅ | ✅ |
| #60 | feat: Wave 19 chaos residuals (network + WAL) | ✅ | ✅ |
| #59 | fix(delta): close the three delta schema gaps (homework | ⚠️ content-verified | ❌→✅ |
| #58 | feat: offline-first enhancements | ✅ | ✅ |
| #57 | fix(tests): repair 3 docs tests that were never green ( | ✅ | ✅ |
| #56 | feat: delta sync hardening phase 2 (4 gaps: long-lived  | ✅ | ✅ |
| #55 | docs: chat6 master recovery (all sessions 21-43) | ✅ | ✅ |
| #54 | docs: wave5 red analysis (O-2 RCA) — T18/T20/T21 root c | ✅ | ✅ |
| #53 | docs: chat 7 merge-queue final report + HANDOFF session | ✅ | ✅ |
| #52 | fix(bug-hunt): 4 sessions of bug fixes (waves 3, 4, 7,  | ✅ | ✅ |
| #51 | docs: OBSERVABILITY.md — سند یکپارچهٔ رصدپذیری §30 (چت  | ✅ | ✅ |
| #50 | docs: اسناد اجباری §30 — ظرفیت، آزمون بار، ران‌بوک تولی | ✅ | ✅ |
| #49 | Wave 5 — Authorization و Tenant Isolation: مدلِ یکتای م | ✅ | ✅⚠️ |
| #48 | Wave 1 P0: PostgreSQL transaction-first writes | ✅ | ✅ |
| #47 | feat: waves 1p2, 6, 11, 15, 18, 19, 20 — client, redis, | ✅ | ❌→✅ |
| #46 | feat: waves 14, 16, 17, 18 — observability, DR, testing | ✅ | ✅⚠️ |
| #45 | Feat/wave20 chat4 | ✅ | ✅ |
| #44 | perf(wave9): application performance — heavy worker, as | ✅ | ✅ |
| #43 | Feat/wave12 chat4 | ✅ | ✅ |
| #42 | Feat/wave8 chat4 | ✅ | ✅ |
| #41 | Feat/wave5 authz chat4 | ✅ | ✅⚠️ |
| #40 | docs: add wave zero database cache baseline | ✅ | ✅ |
| #39 | feat(wave1): PostgreSQL Source of Truth — Part 1 (reads | ✅ | ✅ |
| #38 | docs: add wave zero server api baseline | ✅ | ✅ |
| #37 | feat: فاز ۰.۱+۰.۲+۰.۳ + ادغامِ شاخهٔ زیرساخت/امنیت (aut | ✅ | ✅ |
| #36 | Feat/redis cluster chat4 | ✅ | ✅ |
| #35 | Feat/b3 d234 chat4 | ✅ | ✅⚠️ |
| #34 | feat(internship): add e.2 progress, certificate, overvi | ✅ | ✅ |
| #33 | feat(behavior): add e.3 quick awards, dashboard strip,  | ✅ | ✅ |
| #32 | feat(assets): add e.5 counts, custodian, and search | ✅ | ✅ |
| #31 | feat(health): add g.1 school health index | ✅ | ✅ |
| #30 | feat(schedgen): add e.6 automatic timetable generator | ✅ | ✅ |
| #29 | feat(library): add e.4 delegation, copies, and student  | ✅ | ✅ |
| #28 | feat(b3): anonymous teacher evaluation — no responder i | ✅ | ✅ |
| #27 | Feat/staff training chat1 | ✅ | ✅ |
| #26 | docs: add cert reports verification | ✅ | ✅ |
| #25 | feat(security): add session revocation denylist with re | ✅ | ✅ |
| #24 | docs: add chat3 summary | ✅ | ✅ |
| #23 | docs: add zero trust architecture | ✅ | ✅ |
| #22 | feat(observability): implement distributed tracing with | ✅ | ✅ |
| #21 | feat(security): implement waf and ddos protection | ✅ | ✅ |
| #20 | feat(security): implement distributed rate limiting wit | ✅ | ✅ |
| #19 | Feat/p2 redis integrity chat4 | ✅ | ✅ |
| #18 | P1 data integrity (chat3): queue caps + DB invariants + | ✅ | ✅⚠️ |
| #17 | Feat/farnaz phase1 chat4 | ✅ | ✅ |
| #16 | build(deps-dev): bump jsdom from 25.0.1 to 30.0.1 | ✅ | ✅ |
| #15 | fix(db): add support_tickets table to PostgreSQL schema | ✅ | ✅ |
| #14 | Feat/farnaz phase1 chat4 | ✅ | ✅ |
| #13 | Feat/farnaz phase1 chat3 | ✅ | ✅ |
| #12 | Feat/farnaz phase1 chat1 c | ✅ | ✅ |
| #11 | پایهٔ فرناز — بندهای کوچک اس.۰ تا اس.۵ (پیش‌نویس از چت  | ✅ | ✅ |
| #10 | Feat/farnaz phase1 chat3 | ✅ | ✅ |
| #9 | Feat/farnaz phase1 chat4 | ✅ | ✅ |
| #8 | چت ۱ — فرناز فاز ۱ (WIP draft) | ✅ | ✅ |
| #7 | docs: add SKILLS_MASTER engineering constitution (v1.0. | ✅ | ✅ |
| #6 | feat: implement distributed OTP + rate limiting — R101 | ✅ | ✅⚠️ |
| #5 | fix: resolve all 6 behavior findings (F01-F06) — R100 | ✅ | ✅⚠️ |
| #4 | Feat/request validationfeat: strict request validation  | ✅ | ❌→✅ |
| #3 | fix: resolve document leaks (cert-print, receipt-tuitio | ✅ | ✅ |
| #2 | feat: add client-side features (tomorrow checklist, exa | ✅ | ✅ |
| #1 | ui: بهبودهای بصری جامع — همه بخش‌ها (فقط CSS) | ✅ | ✅ |

### مرج‌شده‌های حین ممیزی (پایهٔ به‌روزرسانی)
| PR | وضعیت |
|---|---|
| #136 (rc40) | پایهٔ دور ۲؛ stats-check+freeze سبز ✅ |
| #138 (رفع conflict markers) | ancestor main ✅ |
| #139 (bh-mut فاز ۲) | ancestor ✅؛ M2 ری‌تارگتش تأیید شد ✅ |
| #140 (RISK-O-007 + جهش گزارش‌ها) | ancestor ✅ |

**معیار تکمیل:** هر ۱۳۴ PR یکی از ✅/❌→✅/⏸ با دلیل — برآورده شد. هیچ PR بدون وضعیت نماند.
