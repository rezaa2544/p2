# Arena 8 — Disaster Recovery / Backup / Restore

## 1. Identity و Final Verdict

**Final Verdict: FAILED** — مسیرهای recovery مخزن دارای نقص‌های واقعی و بازتولیدشده‌اند. موفقیت کنترل‌های مستقلِ موتور، این نقص‌ها را نمی‌پوشاند.

**E4 NOT VERIFIED — EXTERNAL BLOCKER / OWNER DECISION REQUIRED**

| مشخصه | مقدار |
|---|---|
| Arena ID | Arena 8؛ مأموریت DR، جدا از ممیزی Performance قبلی |
| تاریخ کاربر | 2026-09-23، Asia/Tehran |
| زمان خام آزمایش | UTC در 2026-09-22؛ با تاریخ محلی فوق سازگار است؛ timestampها بازنویسی نشده‌اند |
| Repository / Branch | `rezaa2544/p2` / `main` |
| Current HEAD آزمایش | `172da62b63f70d406ffad69893851a01b042ffc4` |
| origin/main بعد از fetch نهایی | همان SHA؛ ls-remote نیز همان SHA |
| Working tree | clean در شروع و پایان؛ هیچ تغییر کد، commit، push یا ارتقای Roadmap انجام نشد |
| محیط | Linux x86_64، یک host/kernel؛ PostgreSQL 17.11، pgBackRest 2.55.1، Redis 8.0.2؛ آزمون‌های JS با Node 22.23.2 |
| داده | مصنوعی و کوچک: پنج جدول حداقلی، هرکدام ابتدا ده ردیف؛ Redis marker اختصاصی هر run. schema کامل برنامه/داده ملی نیست |
| topology | PG با socket/datadir جدا؛ Redis و سه Sentinel محلی. استقلال failure domain ندارد |
| محیط خارجی | topology، مقصد مجاز S3، credentials و مسیر on-call برای این مأموریت تحویل نشده؛ هیچ مقصد خارجی تست نشد |

شواهد کامل: `evidence/COMPLETE_LEDGER.json` و CSV؛ 321 رکورد فرمان شامل مراحل setup/cleanup و تلاش‌های ناموفق. این تعداد، تعداد تستِ موفق یا Pass نیست. هر رکورد SHA، argv، محیط کنترل‌شده، exit، stdout/stderr، زمان و انتظار را ثبت می‌کند. فایل‌های خام نیز نگهداری شده‌اند. Harnessها خارج مخزن هستند و exit صفر خود harness فقط پایان جمع‌آوری است، نه سبز بودن نتایج.

## 2. Scope، منابع و قرارداد

دقیقاً پنج Task: **T1 PostgreSQL backup/restore/PITR؛ T2 PostgreSQL promote/failover/data-integrity؛ T3 Redis backup/restore/failover؛ T4 S3/off-site integrity/target identity؛ T5 RPO/RTO و recovery evidence.** قرارداد پیش از اجرا در `PLAN.md` ثبت شد.

منابع حاکمیتی و بخش‌های مرتبط بررسی‌شده: AGENTS، CLAUDE، CONTRIBUTING، Engineering Policy، skills strict-verification/evidence-integrity/verification-before-completion؛ docs README/PROJECT_OVERVIEW/REPOSITORY_MAP؛ Roadmap و Master Schedule بخش gateهای DR؛ DR_RUNBOOK، RELIABILITY_DR_PLAN، REDIS_RESTORE_PROCEDURE، کارت PG_PITR_RESTORE؛ CAPACITY_MODEL، SCALE_10M و PHASE5_OPERATIONAL_SLO_ENFORCEMENT؛ گزارش‌های Chat4 در `docs/audit/E4_DR_*`، `CHAT4_E4_DR_HA_CURRENT_HEAD_RECONCILIATION_2026-09-22.md` و ماتریس DR-01. مرور متمرکز بر بخش‌های مرتبط بود، نه ممیزی تمام کاتالوگ محصول یا همه فازهای Roadmap.

سوابق فقط سرنخ بودند؛ عدد تاریخی به‌عنوان measurement فعلی استفاده نشد. هیچ کد یا آزمایش تاریخی گمشده بازسازی نشد. کنترل‌های تازهٔ این مأموریت در فایل‌های harness مشخص‌اند.

**تعارض قواعد:** skill قدیمی، E4 را independent red-team می‌نامد؛ Policy Rule7 و دستور کاربر E4 را production-equivalent تعریف می‌کنند. تعریف سخت‌گیرانهٔ کاربر اعمال شد. Rule30 جدید خواهان fix/commit است، ولی نقش صریح کاربر اجازهٔ اصلاح کد نمی‌دهد؛ بنابراین نقص‌ها به Coding/Tech Lead تحویل داده می‌شوند و بسته‌شده اعلام نمی‌شوند.

## 3. Evidence Matrix — نتیجه‌های کلیدی

SHA/محیط بالا بر همه ردیف‌ها اعمال می‌شود. فرمان دقیق با مسیرها و ورودی هر run در JSON هم‌نام است؛ نام‌های p/r/s شناسهٔ آزمایش‌اند، نه Pass.

| ID / Task | فرمان یا ورودی | Expected | Actual / Exit | Runs استنادی | Evidence / Status |
|---|---|---|---|---:|---|
| PG-B / T1 | `pgbackrest --stanza=payesh --type=full backup`، سپس info | artifact واقعی و metadata موجود | backup و info موفق؛ دو repo واقعی پاک در `p7-clean-repository.tar.gz` و `p8-clean-repository.tar.gz` نگهداری شد | 2 منتخب؛ اجراهای بیشتر در ledger | E3، PARTIALLY VERIFIED؛ وجود backup محلی، نه off-site |
| PG-T / T1 | `bash tools/pitr-restore.sh --time '2026-09-23 00:00:00+00' --no-start ...` | timestamp یک argv باشد | `invalid command '00:00:00+00'`؛ exit **48** | p9,p10؛ در runs قبلی هم تکرار شد | E3، REPRODUCED |
| PG-L / T1 | همان ابزار `--latest --no-start` | restore type معتبر | `'latest' is not allowed for 'type'`؛ exit **32** | p9,p10 | E3، REPRODUCED |
| PG-N / T1 | دستور کارت runbook با `--native` | گزینه مستند پذیرفته شود | usage؛ exit **1** | p9,p10 | E3 CLI، REPRODUCED |
| PG-W / T1 | named restore + بوت با config تولیدشدهٔ دست‌نخورده | WAL از repo برای مقصد جدا replay شود | archive-get از pg1-path مبدأ استفاده می‌کند؛ checkpoint پیدا نمی‌شود؛ pg_ctl exit **1** | p9,p10؛ لاگ p3,p4 نیز موجود | E3، REPRODUCED |
| PG-C / T1 | کنترل مستقل: اصلاح فقط config مقصد disposable + explicit promote/max_connections | count/hash در نقطهٔ committed target برابر باشد | **11 ردیف و hash برابر** در هر run؛ ردیف پس از target بازنگشت | p9,p10 | E3، PARTIALLY VERIFIED؛ موتور/کنترل مستقل، نه wrapper |
| PG-V / T1,T2 | `bash tools/pitr-verify.sh` علیه مبدأ اشتباه و مقصد صحیح | target/dataset اشتباه رد شود | هر دو exit **0**؛ مبدأ **12** ردیف، مقصد صحیح **11** ردیف | p9,p10 | E3، REPRODUCED؛ verifier فاقد قرارداد expected identity است |
| PG-X / T1 | خراب‌کردن فایل nonempty backup؛ verify و restore | خرابی تشخیص و restore متوقف شود | verify: `status: invalid`, exit **0**؛ restore: zlib error، exit **29** | p7,p8 | E3؛ DR-01 REPRODUCED، fail-closed restore در این case PARTIALLY VERIFIED |
| PG-P / T2 | basebackup واقعی؛ standby؛ stop immediate مبدأ؛ `failover-postgres.sh` | promote + حفظ داده | قبل `t|12|hash`، بعد `f|12|same hash`؛ exit **0** | p9,p10 | E3، PARTIALLY VERIFIED؛ نه network partition/fencing E4 |
| PG-G / T2 | failover dry-run علیه target ازقبل primary | رد | exit **1** | p9,p10 | E3، PARTIALLY VERIFIED |
| R-RDB / T3 | `redis-backup.sh` و restore RDB در target جدا | marker صحیح و integrity | marker هر run برگشت؛ redis-check-rdb exit **0** | r1,r2 | E3، PARTIALLY VERIFIED |
| R-AOF / T3 | restore پوشهٔ AOF تولیدشده | marker صحیح | Redis بالا آمد ولی GET خالی؛ base.rdb و manifest در backup نبودند | r1,r2 | E3، REPRODUCED |
| R-ID / T3,T4 | Redis endpoint سالم، REDIS_DIR به RDB قدیمی اشاره کند | mismatch رد شود | exit **0**؛ hash backup همان RDB قدیمی، manifest نام endpoint فعلی را ثبت کرد | r1,r2 | E3، REPRODUCED |
| R-F / T3 | RDB truncated؛ endpoint قطع؛ flock اشغال | شکست آشکار | به‌ترتیب exits **1،1،75** | هرکدام r1,r2 | E3، PARTIALLY VERIFIED؛ skip را PASS نشمرده‌ایم |
| R-S / T3 | سه Sentinel، replica واقعی؛ `failover-redis.sh --force` | تغییر master و تأیید درست | failover انجام شد و marker/write روی master جدید صحیح بود، ولی wrapper exit **1** | s1,s2 | E3، REPRODUCED؛ false negative پس از تغییر state |
| S3-M / T4 | `BACKUP_S3` تنظیم، aws غایب | موفقیت کامل off-site صادر نشود | هشدار local-only ولی پایان موفق/exit **0**؛ هیچ upload صورت نگرفت | r1,r2 | E3 local negative control؛ off-site NOT VERIFIED |
| META / T5 | فراخوانی مستقیم توابع DR بدون evidence، و ورودی منفی | UNKNOWN/NOT VERIFIED یا رد | backup verified، restore PASSED، status healthy و RPO/RTO عددی ساخته می‌شود | metadata1,2 | E2 UNIT، REPRODUCED؛ نه HTTP end-to-end |
| REG / همه | unit backup/restore، redis-backup stub، dr-runbook | ثبت محدودهٔ واقعی تست | همه exit **0**؛ redis stub **11/11**، runbook **38/38** | هرکدام 2 | E2 UNIT/MOCK/static؛ اثبات recovery نیست |

## 4. Findings و تحویل به تیم کدنویسی

### DR8-01 — High — backup چندفایلی AOF قابل اتکا نیست
- **Location:** `tools/redis-backup.sh:93–97`؛ `docs/REDIS_RESTORE_PROCEDURE.md` بخش restore AOF.
- **Root cause:** تنها `*.aof` کپی می‌شود؛ `appendonly.aof.manifest` و فایل `*.base.rdb` حذف می‌شوند.
- **Reproduction:** `python3 arena8-dr/dr_lab_initial.py`؛ evidence `r1/r2-archive.json`, `r1/r2-aof-restored-marker.json`, `r1/r2-aof-boot.log`.
- **Expected / Actual:** restore همان marker؛ در عمل Redis بدون marker بالا آمد و AOF جدید ساخت. RDB کنترل همان marker را درست برگرداند.
- **Impact:** ظاهر سالم فرآیند، بدون بازگشت دادهٔ AOF؛ خطر data loss هنگام اتکا به این مسیر.
- **Remediation حداقلی:** کپی مجموعهٔ کامل referenced-by-manifest به‌صورت سازگار/اتمیک، اعتبارسنجی فایل‌ها، و boot/readback مستقل؛ تنها glob گسترده‌تر بدون کنترل consistency کافی نیست.
- **Regression:** AOF چندفایلی با base RDB و pure-AOF، concurrent writes/rewrite، فایل گمشده/خراب، restart و readback.
- **Ownership / Status:** Backend/DR owner؛ **REPRODUCED، E3**، fix نشده.

### DR8-02 — High — wrapper PITR در مسیرهای مستند شکست می‌خورد
- **Location:** `tools/pitr-restore.sh:39–42,71,87`؛ کارت `docs/RUNBOOK_CARDS/PG_PITR_RESTORE.md` Step3.
- **Root cause:** timestamp در رشتهٔ TARGET_SPEC و expansion بدون quoting؛ `--type=latest` نامعتبر؛ append کردن restore_command بدون pg1-path مقصد، override کردن فرمان صحیح تولیدشدهٔ pgBackRest؛ `--native` در CLI وجود ندارد.
- **Behavior/failure proof:** `p9/p10-restore-time`, `restore-latest`, `restore-native`, `target-original-start` و لاگ‌های `p9/p10-final-*`؛ در auto.conf، دو restore_command با مقاصد متفاوت دیده می‌شود. pgBackRest خطای mismatch working-directory و source pg1-path می‌دهد.
- **کنترل مستقل:** فقط در datadir موقتِ آزمایش، restore_command با pg1-path مقصد دوباره تنظیم و promote/max_connections صریح داده شد؛ سپس replay صحیح بود. این تغییر، patch پروژه یا «رفع‌شده» نیست.
- **Remediation:** آرایهٔ argv؛ نگاشت latest به گزینهٔ معتبر نسخهٔ پشتیبانی‌شده؛ حفظ فرمان تولیدشدهٔ restore؛ propagate کردن recovery target/action و پارامترهای سازگار با source؛ هماهنگی runbook.
- **Regression:** exact documented CLI، timestamp با timezone/space، named/XID targets، WAL missing/corrupt، separate path و reboot بدون workaround.
- **Ownership / Status:** Platform/DR؛ **REPRODUCED، E3**.

### DR8-03 — High — verifier هویت و checksum موردانتظار را اثبات نمی‌کند
- **Location:** `tools/pitr-verify.sh:29–65`؛ `tools/pitr-restore.sh:105–107`.
- **Root cause:** فقط اتصال، پایان recovery و nonempty بودن جدول‌ها چک می‌شود؛ checksum چاپ می‌شود ولی baseline مقایسه نمی‌شود. TARGET_SPEC پارس‌شده برای پذیرش استفاده نمی‌شود؛ انتظار زمانی تنها با `--expect-before` فعال می‌شود. wrapper نیز `PGDATABASE=postgres` را تحمیل می‌کند.
- **Proof:** مبدأ دارای 12 ردیف و target صحیح 11 ردیفی هر دو «بازیابی معتبر» می‌گیرند. verifier علیه postgres بدون جدول exit1 می‌دهد (`p9/p10-verify-postgres-db`)؛ خط hardcoded DB در wrapper ایستا مشاهده شد، کل wrapper پس از آن نقطه با workaround اجرا نشد.
- **Impact:** gate می‌تواند مقصد/نسخهٔ دادهٔ نامرتبط را بپذیرد؛ یا restore payesh صحیح را به علت DB اشتباه رد کند.
- **Remediation:** manifest الزامی از expected DB/system lineage/data-directory/backup-set/target LSN یا زمان + count/hash مستقل؛ database مشخص و صریح؛ مقایسه fail-closed. system_identifier به‌تنهایی کافی نیست، زیرا physical restore همان lineage را حفظ می‌کند.
- **Regression:** مبدأ اشتباه، DB اشتباه، dataset غیرخالی ولی hash متفاوت، رویداد بعد target، checksum query failure؛ دو restore مستقل.
- **Ownership / Status:** Platform + QA؛ **REPRODUCED، E3**؛ فاقد API expected identity یک evidence-gap طراحی هم هست.

### DR8-04 — High — تولید موفقیت و زمان‌های DR بدون recovery evidence
- **Location:** `server/infrastructure/disaster-recovery.js:184–222,230–276,320–338`؛ `server/routes/system.js:465–469,492–496`.
- **Root cause:** پیش‌فرض true؛ checksum از literal ثابت؛ last_success از ساعت جاری منهای عدد ثابت؛ مدت و تعداد رکورد پیش‌فرض؛ پذیرش زمان منفی. route، snapshot را بدون options حاوی evidence فراخوانی می‌کند.
- **Proof:** `metadata1/2.json` روی Node22: بدون backup artifact یا اتصال DB، verified/PASSED/healthy برمی‌گردد. `duration_seconds=-5` و `records_restored=0` نیز با tables=38 پذیرفته می‌شود؛ metrics منفی compliant می‌شوند.
- **Impact:** ادعای health و RPO/RTO می‌تواند دادهٔ ساخته‌شده باشد، نه measurement.
- **Remediation:** absence → NOT VERIFIED؛ جداسازی demo/model از operational evidence؛ checksum واقعی artifact؛ timestamps از drill، نه defaults؛ finite/nonnegative validation و run-ID/target identity.
- **Regression:** missing/stale/forged metadata، منفی/NaN، source unavailable، checksum mismatch، end-to-end route با evidence معتبر و نامعتبر.
- **Ownership / Status:** Backend/observability؛ **REPRODUCED، E2 UNIT**. wiring مسیر HTTP از source بررسی شد، رفتار endpoint از شبکه در این مأموریت اجرا نشد.

### DR8-05 — Medium — false negative پس از failover واقعی Redis
- **Location:** `tools/failover-redis.sh:51,57–59`.
- **Root cause:** NEW با comma ساخته می‌شود، ولی NH/NP با colon جدا می‌شوند.
- **Proof:** s1/s2: `NEW_MASTER=127.0.0.1,56611` یا `56621`؛ خطای اتصال به host/port malformed؛ wrapper exit1. Query مستقل روی port صحیح role master، marker و نوشتن موفق را اثبات کرد.
- **Impact:** اپراتور شکست گزارش‌شده می‌بیند در حالی که topology تغییر کرده؛ retry بی‌بررسی خطرناک است.
- **Remediation:** ساختار آرایه برای host/port، parsing واحد و validation، تأیید مستقل master/replicas و idempotent retry.
- **Regression:** failover واقعی، healthy guard، malformed/empty Sentinel result، retry پس از state change و reconvergence.
- **Ownership / Status:** Redis/Platform؛ **REPRODUCED، E3**. `--force` فقط در lab disposable استفاده شد؛ network-partition proof نیست.

### DR8-06 — High — source identity پشتیبان Redis enforce نمی‌شود
- **Location:** `tools/redis-backup.sh:68–73,120–126`.
- **Root cause:** SAVE علیه endpoint انجام می‌شود ولی فایل از REDIS_DIR دلخواه خوانده می‌شود؛ تطبیق dir/dbfilename/run_id با endpoint و fingerprint داده انجام نمی‌شود.
- **Proof:** بعد از تغییر marker سرور، REDIS_DIR به نسخهٔ قدیمی اشاره داده شد. script exit0 داد؛ SHA256 backup دقیقاً برابر snapshot قدیمی بود؛ manifest به endpoint فعلی نسبت داده شد (`r1/r2-wrong-target.json`).
- **Impact:** وجود artifact کافی نیست؛ artifact ممکن است متعلق به dataset موردانتظار نباشد.
- **Remediation:** identity/path attestation یا مکانیزم remote-safe backup؛ manifest شامل identity واقعی، timestamp، byte size و checksum؛ restore readback مستقل.
- **Regression:** مسیر اشتباه/قدیمی، فایل معتبر از instance دیگر، remote endpoint، تغییر همزمان مسیر و snapshot.
- **Ownership / Status:** DR/Redis؛ **REPRODUCED، E3**.

### DR8-07 — Medium — قرارداد local success از off-site success تفکیک نمی‌شود
- **Location:** `tools/redis-backup.sh:103–109,120–128`؛ pgBackRest S3 template صرفاً config است.
- **Proof:** BACKUP_S3 با URI آزمایشی تنظیم شد اما aws در PATH نبود. هشدار local-only داده شد و exit0 باقی ماند؛ upload انجام نشد. backtick در متن warning حتی تلاش می‌کند دستور aws را اجرا کند.
- **دقت طبقه‌بندی:** script انتقال S3 را اختیاری معرفی کرده و هشدار را مخفی نکرده است؛ پس این را اثبات دروغ «upload موفق» نمی‌نامیم. اما exit0 به‌تنهایی گواه پذیرش task off-site نیست.
- **Remediation:** policy صریح required/optional، state machine جدا برای local/remote، object version/key/bucket/account identity و download/readback checksum قبل از پذیرش/retention.
- **Regression:** missing uploader، AccessDenied، timeout، partial upload، bucket اشتباه، version اشتباه، download corrupt؛ موارد خارجی در این مأموریت اجرا نشدند.
- **Ownership / Status:** قرارداد خروجی با Coding/Tech Lead؛ S3 واقعی با Infra. local behavior **REPRODUCED**؛ external integrity **EXTERNAL BLOCKER**.

### DR8-08 — Medium — DR-01 upstream semantic verification
- **Location:** قرارداد pgBackRest 2.55.1؛ فایل‌های `p7/p8-verify-corrupt.json`.
- **Proof:** status invalid و یک checksum invalid با exit0؛ restore همان فایل nonempty خراب exit29. دو اجرای مستقل و repo تازه.
- **Ownership:** upstream/tool-contract و مالک هر gate آینده؛ repo-owned verify wrapper جدید اختراع نمی‌کنیم. `pitr-verify.sh` جداگانه DR8-03 دارد و صرفاً با درستی restore موتور تبرئه نمی‌شود.
- **Regression requirement:** semantic parse + restore/readback، نه exit-only؛ نسخهٔ ابزار ثابت و ثبت‌شده.
- **Status:** **REPRODUCED، E3**؛ دادهٔ تاریخی نیست.

### ریسک‌های ایستا، بدون failure proof کامل
`failover-postgres.sh:33–52`: در اولین unreachable بودن primary، حلقه break می‌کند؛ نبود connectivity مساوی fencing نیست. query error در sq بلعیده می‌شود و lag نامعلوم مانع قطعی ادامه نیست. این موارد **NOT VERIFIED برای split-brain/network failure** هستند؛ هیچ ادعای بازتولید split-brain صادر نمی‌شود. رفع آن نیازمند قرارداد fence/lease و drill partition مستقل است.

## 5. Five-Task / Five-Pass Verification

همه پنج بُعد برای هر Task بررسی وضعیت شده‌اند، ولی Pass اجرا‌نشده را اجراشده نمی‌شماریم. دو run مستقل جای پنج بُعد متفاوت را نمی‌گیرد.

| Task | Functional | Boundary | Failure injection | Concurrency / resilience / recovery | Independent rerun |
|---|---|---|---|---|---|
| **T1 PG backup/restore/PITR** | backup واقعی موجود؛ wrapper restore FAILED | time/latest/native REPRODUCED؛ committed point کنترل شد | nonempty corruption: restore exit29؛ verify exit0 invalid | named WAL replay فقط با کنترل مستقل موفق؛ concurrent workload/WAL-gap مستقل NOT VERIFIED | p9/p10 fresh cluster؛ p7/p8 corruption تازه؛ PARTIALLY VERIFIED موتور، FAILED wrapper |
| **T2 PG promote/integrity** | promote واقعی روی standby محلی موفق | already-primary guard exit1؛ wrong-target verifier REPRODUCED | stop immediate مبدأ، promote و hash-preservation | replication واقعی و تغییر role؛ fencing/partition/cross-host/rejoin NOT VERIFIED، E4 EXTERNAL BLOCKER | p9/p10، hash برابر قبل/بعد؛ PARTIALLY VERIFIED |
| **T3 Redis** | RDB restore موفق؛ AOF FAILED | AOF چندفایلی/dir mismatch REPRODUCED | RDB truncation و source unavailable رد شدند | flock exit75؛ Sentinel واقعی تغییر master، wrapper FAILED؛ crash/quorum-loss/app session consistency NOT VERIFIED | r1/r2 و s1/s2 با فرآیندها و داده تازه؛ FAILED task |
| **T4 S3/off-site** | remote artifact وجودش اثبات نشده؛ EXTERNAL BLOCKER | target identity local mismatch REPRODUCED؛ bucket/version identity NOT VERIFIED | aws missing local control؛ remote IAM/network/corruption BLOCKED | partial upload/retry/retention/site-loss BLOCKED، مقصد مجاز/credentials نداریم | local negative دوبار؛ independent external rerun صفر؛ EXTERNAL BLOCKER |
| **T5 RPO/RTO evidence** | زمان‌های component ثبت؛ service RPO/RTO NOT VERIFIED | metadata missing/negative REPRODUCED | fake metrics در فقدان evidence؛ failureهای واقعی ثبت | clocks/incident→service recovery/on-call/load NOT VERIFIED؛ زیرساخت و telemetry لازم است | دو اجرای مستقل control؛ metadata نیز دوبار؛ MEASUREMENT GAP |

هیچ Task کامل VERIFIED اعلام نمی‌شود؛ E4 در تمام پنج Task NOT VERIFIED است.

## 6. Measurement Integrity — چه چیزی واقعاً اندازه‌گیری شد؟

فرمان‌ها با `time.monotonic_ns()` مدت‌سنجی شده‌اند؛ UTC start یا end در JSON ثبت شده است. این زمان‌ها **component elapsed time** هستند، نه incident-to-service RTO.

| مؤلفهٔ کنترل مستقل | p9 | p10 | حد استنتاج |
|---|---:|---:|---|
| named restore file-copy command | 301.87 ms | 328.61 ms | فقط بازگردانی فایل؛ نه availability برنامه |
| بوت target با config اصلاح‌شدهٔ disposable | 107.81 ms | 108.00 ms | pg_ctl readiness؛ gate مستقل پس از آن recovery=false و hash را چک کرد |
| failover-postgres.sh بعد از توقف واقعی primary | 129.65 ms | 130.62 ms | زمان فرمان promote؛ شامل detection/on-call/routing/API recovery نیست |

**RTO واقعی سرویس: NOT VERIFIED. RPO زمانی واقعی: NOT VERIFIED.** مقایسهٔ داده نشان داد p9/p10 committed target را با hash برابر بازیابی کردند و standby قبل/بعد promote همان 12 ردیف را داشت؛ این به‌تنهایی «RPO=0 ثانیه تولید» نیست. Dataset حداقلی، بدون workload همزمان، app traffic و independent failure domain بوده است.

پذیرش آتی: ثبت زمان failure، آخرین write acknowledged، آخرین committed transaction بازیابی‌شده، زمان پایان replay/promote، نخستین write/read صحیح برنامه و پایان recovery پایدار؛ clock offset و uncertainty؛ counts/checksums برای همه tenantهای نمونه؛ workload و backup age؛ دو run مستقل در E4. backup freshness با `appendfsync everysec` یکی نیست: snapshot دوره‌ای AOF لزوماً RPO یک‌ثانیه‌ای off-site نمی‌دهد.

### تلاش‌های ناموفق خود ممیز، بدون حذف Evidence
1. **p1/p2:** target start شکست خورد؛ لاگ داخلی PG قبل از cleanup در این نسخهٔ اولیهٔ harness ذخیره نشده بود. فقط command/exit محفوظ است؛ علت را از آن دو run به‌تنهایی استنتاج نکردیم. p3/p4 و بعدی‌ها لاگ کامل نگه داشتند و pg1-path mismatch را نشان دادند.
2. **p5 تا p8:** انتظار اولیه 11 ردیف بود ولی target ده ردیف داشت. علت خطای طراحی harness بود: INSERT و restore-point در یک `psql -c` و یک transaction قرار داشتند؛ restore point پیش از commit آن INSERT بود. این را bug PostgreSQL یا loss داده اعلام نمی‌کنیم. در p9/p10، INSERT ابتدا commit مستقل شد و بعد restore point ساخته شد؛ expected/actual هر دو 11 و hash برابر شدند. JSONهای mismatch حذف نشده‌اند.
3. **p5/p6 corruption:** تغییر اولین فایل انتخابی موجب fail restore نشد (exit0). این negative control برای اثبات fail-closed کافی نبود و هیچ حکم integrity از آن صادر نشد. p7/p8 عمداً فایل بزرگ nonempty انتخاب کردند، verify invalid و restore29 شد. دامنهٔ نتیجه فقط corruption آزموده‌شده است؛ ادعای «هر فساد ممکن» نداریم.
4. نسخهٔ clone ابتدا shallow بود؛ `git diff HEAD^` exit128 داد. depth به 2 افزایش یافت و parent diff جدا ذخیره شد؛ خطای قبلی حذف نشد.

## 7. Cross-Agent / Documentation Conflicts

- گزارش Chat4، success موتورهای واقعی در lab تاریخی را ثبت کرده؛ تست‌های کنونی wrapperهای مخزن را مستقل اجرا کردند. موفقیت موتور با شکست wrapper تناقض منطقی ندارد؛ **مرز scope باید در gate صریح شود**. raw historical measurements به HEAD جدید منتقل نشدند.
- گزارش DR-01 تاریخی می‌گوید formal RPO/RTO SLO در repo وجود ندارد. Current HEAD در `RELIABILITY_DR_PLAN.md:11–24` و `DR_RUNBOOK.md:3–18` هدف‌های 5 و 15 دقیقه را دارد؛ خود ماژول نیز constants 300/900 دارد. پس ادعای «هیچ عدد هدفی وجود ندارد» با متن جاری سازگار نیست. ratification، تعریف دقیق measurement و مالک acceptance هنوز باید reconcile شود؛ عدد هدف، proof تحقق نیست.
- کارت PITR بودجهٔ 60 دقیقه دارد، درحالی‌که runbook سقف 15 دقیقه را نقل می‌کند؛ `--native` کارت هم CLI معتبر نیست. **Roadmap Reconciliation Required** برای سند/اجرا/معیار پذیرش.
- تست‌های سبز فعلیِ metadata و stub، recovery واقعی را اثبات نمی‌کنند. تست redis-backup با legacy single-file stub نقص AOF واقعی را نمی‌بیند؛ تست runbook رشته‌ها/ارجاع‌ها را بررسی می‌کند، نه اجرای exact CLI.
- CI config به‌طور محدود بررسی شد؛ هیچ current-SHA Actions artifact/نتیجهٔ live CI واکشی نشد. نبود match مستقیم در grep را نبود کل پوشش غیرمستقیم نمی‌نامیم. full regression برنامه اجرا نشد.

## 8. Roadmap Impact / Ownership / Next Action

**Roadmap Reconciliation Required** برای DR8-01..08، S3 identity، measurement gaps و مرز historical-vs-current. Arena هیچ status را ارتقا نداده است.

1. **Coding/DR owner:** DR8-01،02،03،04،06 را با اولویت High اصلاح کند؛ exact documented command و واقعی‌بودن backup/identity را regression کند. DR8-05 را پیش از اتکا به automation failover اصلاح کند. تغییرات باید SHA تازه و evidence مستقل داشته باشند.
2. **QA:** negative controlهای این بسته را کنار mock/unit فعلی اضافه کند؛ افشای success بدون data integrity را gate کند. این مأموریت fix یا post-fix regression ندارد؛ یافته‌ها بسته نشده‌اند.
3. **Tech Lead:** تعریف واحد RPO/RTO و اهداف ناسازگار را resolve کند؛ historical E3 VERIFIED را به wrapperهای بررسی‌نشده تعمیم ندهد؛ E3 موجود را حذف هم نکند، فقط scope درست ثبت کند.
4. **Infra/SRE — EXTERNAL BLOCKER / OWNER DECISION REQUIRED:** محیط چندمیزبانه، source/target inventory، approved fault plan، S3 bucket/account/version/IAM/KMS و سیاست retention/object-lock، credentials تزریق‌شده بدون چت، actual offsite backups و on-call receiver/ack فراهم کند.
5. **E4 drill بعدی:** restore روی میزبان مستقل، download/readback از S3، corrupted/missing WAL، network partition و fencing، concurrent writes، Redis outage/rejoin و session/revocation/rate-limit consistency، application recovery و incident timestamps؛ هر critical drill حداقل دوبار مستقل.

## 9. Current HEAD Reconciliation و Handoff

SHA ابتدا و پس از آخرین fetch/depth2 همان `172da62b63f70d406ffad69893851a01b042ffc4` بود؛ origin/main برابر و working tree clean. snapshot منبع با خطوط و SHA256 در `source-evidence.txt` ذخیره شده است. code/documentation commit جدیدی وجود ندارد.

تمام فرآیندهای lab توسط harness بسته و datadirهای موقت پاک شدند؛ دو backup repository پاکِ منتخب و شواهد خام پایدار حفظ شدند. محیط lab قابل تداوم فرض نمی‌شود و نصب binaryها در snapshot تضمین ندارد. workspace در پایان کنترل می‌شود و باید زیر 100MB بماند.

### بازتولید
```bash
# نیازمند PostgreSQL 17، pgBackRest 2.55.1، Redis 8 و Node22؛ فقط sandbox disposable
# مخزن باید در /home/user/p2 و روی SHA ثبت‌شده باشد.
python3 /home/user/arena8-dr/dr_lab_initial.py       # Redis و اولین کنترل‌های PG؛ failureها موردانتظارند
python3 /home/user/arena8-dr/dr_lab_corruption_control.py  # p7/p8 corruption و raw diagnostic evidence
python3 /home/user/arena8-dr/dr_lab.py               # p9/p10 committed-target + promote
python3 /home/user/arena8-dr/sentinel_lab.py
/tmp/a8-node/node_modules/.bin/node /home/user/arena8-dr/metadata_probe.cjs
```
این فرمان‌ها، آزمایش‌های جدید مستقل‌اند و نباید خروجی جدید را با run قبلی مخلوط کرد؛ قبل rerun از evidence قبلی نسخه بگیرید. ابزارها روی آدرس/دایرکتوری موقت محلی کار می‌کنند؛ برای انتقال به محیط مشترک، port/target authorization مجدد لازم است. package includes synthetic local database backups; no production credentials or data were used.

**حکم نهایی: FAILED. قابلیت recovery انتهابه‌انتهای مخزن تأیید نشد؛ موفقیت‌های محلی محدود حفظ شدند؛ E4 NOT VERIFIED.**
