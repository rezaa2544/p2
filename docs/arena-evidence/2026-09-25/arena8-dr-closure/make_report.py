import json,hashlib,subprocess,datetime
from pathlib import Path
B=Path(__file__).parent; E=B/'evidence'; R=Path('/home/user/p2')
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()
base='5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2'
assert sha=='452c7c10eed0274544c71422a772b6448e04a09b'
assert subprocess.check_output(['git','status','--porcelain'],cwd=R,text=True)==''
sets={name:json.loads((E/name/'measurements.json').read_text()) for name in ['final-restore','final-sentinel']}
ledger=[]
for name,measurements in sets.items():
 assert json.loads((E/name/'failures.json').read_text())==[]
 assert len(measurements)==5 and all(x['valid'] for x in measurements)
 for row in json.loads((E/name/'ledger.json').read_text()):ledger.append(dict(row,sha=sha,evidence_level='E3',source=str(Path(name)/'ledger.json')))
(E/'FINAL_LEDGER.json').write_text(json.dumps(ledger,indent=2))
provenance={'sha':sha,'base':base,'branch':'arena8/dr-closure-20260923','tree':'clean','report_generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cwd':str(R),'lab_environment':{'TMPDIR':'/var/tmp','network':'loopback only','PG':'17.11','Redis':'8.0.2','pgBackRest':'2.55.1','Node':'22.23.2'},'commands':[{'command':'TMPDIR=/var/tmp python3 tests/infrastructure/disaster-recovery/live-dr-closure.py --runs 5 --out /home/user/arena8-dr-closure/evidence/final-restore','exit':0,'rounds':5},{'command':'TMPDIR=/var/tmp python3 tests/infrastructure/disaster-recovery/live-redis-failover.py --out /home/user/arena8-dr-closure/evidence/final-sentinel','exit':0,'rounds':5},{'command':'python3 tests/infrastructure/disaster-recovery/s3-tool-contract.py','exit':0,'rounds':5,'evidence_level':'MOCK ONLY'}],'remote_push_exit':128,'PR':None,'merged':False,'GitHub_Actions':'NOT VERIFIED'}
(E/'provenance.json').write_text(json.dumps(provenance,indent=2))
measure_table='| Service / round | Measured RTO (s) | ACK-loss window (s) | Recovery-point age at fault (s) | Lost ACK IDs |\n|---|---:|---:|---:|---|\n'
for label,name in [('PostgreSQL','final-restore'),('Redis','final-sentinel')]:
 for m in sets[name]:measure_table+=f"| {label} / {m['run']} | {m['rto_seconds']:.6f} | {m['rpo_ack_loss_window_seconds']:.6f} | {m['recovered_point_age_at_failure_seconds']:.6f} | {m['lost_acknowledged_ids']} |\n"
text=f'''# Arena 8 — DR closure / گزارش نهایی

**Final verdict: PARTIALLY VERIFIED.** اصلاحات مخزن روی شاخهٔ مستقل locally FIXED & VERIFIED هستند؛ مأموریت end-to-end بسته نیست: push/PR مسدود، merge انجام نشده، S3 واقعی و E4 راستی‌آزمایی نشده‌اند.

**E4 NOT VERIFIED — EXTERNAL BLOCKER / OWNER DECISION REQUIRED.**

## 1. Current HEAD و اختیار

- تاریخ: 2026-09-23. Commit نهایی و دقیقاً آزموده‌شده: `{sha}`.
- Branch: `arena8/dr-closure-20260923`؛ دو commit محلی: `ad3e9f6` و `452c7c1`.
- Base و آخرین remote main مشاهده‌شده: `{base}`؛ [remote probe](evidence/remote-main-final.txt).
- Working tree پس از آزمون: clean. هیچ merge یا تغییر production انجام نشد.
- Arena: fix/commit/push/PR؛ Tech Lead: review و merge نهایی. مجوز E3 disposable only رعایت شد.
- push واقعی تلاش شد و با exit **128** به علت نبود HTTPS authentication متوقف شد؛ [خروجی](evidence/push-final.log). **PR ایجاد نشده است.**
- [بستهٔ دو commit](dr-closure.bundle) برای انتقال بدون credentials موجود است؛ prerequisite آن base بالاست. [اعتبارسنجی bundle](evidence/bundle-verify.log).

## 2. پنج Task و تعداد دورها

| Task | دورهای مستقل روی SHA نهایی | نتیجه و مرز |
|---|---|---|
| T1 PostgreSQL backup / restore / PITR | **5 topology/repository تازه**؛ در هر دور named + time + latest | **VERIFIED در E3 کوچک**؛ 15 restore با manifest مستقل، schema/count/full-row SHA256؛ reboot و corruption refusal |
| T2 PostgreSQL promote / failover | **5 standby تازه** | **VERIFIED در E3**؛ source crash، fence verifier، role change، hash و ACK، write/read جدید؛ fencing بین میزبان‌ها اثبات نشده |
| T3 Redis backup / HA / recovery | **5 snapshot round + 5 topology Sentinel تازه** | **VERIFIED در E3**؛ RDB + multipart AOF، base RDB و pure-AOF، restart، manual wrapper، automatic failover و rejoin |
| T4 S3 / off-site / integrity | **5 mock-contract rounds** و 5 real local missing-uploader refusals؛ **0 real S3 rounds** | **EXTERNAL BLOCKER**؛ پنج mock جای پنج مانور واقعی off-site نیست و شرط کامل این Task را برآورده نمی‌کند |
| T5 measured RPO/RTO + drills | **5 PG + 5 Redis service-recovery rounds** | **VERIFIED برای اعداد محدود E3 پایین**؛ full application، on-call، backup-to-service incident RTO و E4 **MEASUREMENT GAP** |

بنابراین ادعای «هر پنج Task کامل و end-to-end بسته شد» نمی‌شود. پنج بُعد نیز جدا پوشش دارند: functional restore؛ boundary/identity/invalid evidence؛ corruption/outage/rejected promotion؛ concurrent PG writers/backup lock/restart/rejoin؛ fresh-topology regression. برای S3، همهٔ ابعاد به جز local refusal صرفاً mock هستند.

## 3. RPO/RTO واقعاً اندازه‌گیری‌شده

{measure_table}

**تعریف:** RTO از monotonic timestamp شروع fault injection تا تغییر role، کنترل داده و موفقیت یک write/read committed جدید است؛ مدت اجرای صرف command نیست. PostgreSQL شامل 10 ثانیه سه‌پروب محافظ failover نیز هست. Redis شامل automatic Sentinel election پس از kill master است؛ forced-wrapper قبلی جزو این RTO نیست.

**RPO محدود به workload ثبت‌شده:** newest source ACK timestamp منهای newest surviving ACK timestamp. در هر service/round ده ACK ثبت‌شده حفظ شد؛ 0 lost IDs و 0 observed ACK-loss window. سن recovery point هنگام fault جدا آمده تا عدد صفر با تازگی مطلق داده اشتباه نشود. timestamps، IDs و فرمول‌ها در [PG measurements](evidence/final-restore/measurements.json) و [Redis measurements](evidence/final-sentinel/measurements.json) هستند.

**شرایط آزمایش:** هر دو replica پیش از fault با انتظار bounded به dataset رسیده‌اند؛ PG چهار writer concurrent با ده transaction دارد، ولی قبل از fault تمام ACKهای این workload جمع‌آوری و replication catch-up کنترل می‌شود. این آزمایش ادعای no-loss هنگام workload نامحدود یا partition واقعی ندارد. داده PG پنج جدول مصنوعی کوچک، Redis marker/ده کلید است؛ نه schema کامل 38 جدول یا بار ملی. همه روی یک kernel/host هستند. RDB/AOF restore نیز واقعاً readback شدند، ولی زمان command آن‌ها full incident RTO نام‌گذاری نشده است.

## 4. Defect closure و root cause

مالک همهٔ اصلاحات repository: Arena در این branch؛ review/merge: Tech Lead. وضعیت‌های زیر **محلی** هستند، نه closure در main.

| Finding / severity | Root cause و اصلاح | مکان فعلی / regression | وضعیت |
|---|---|---|---|
| DR8-01 / High | glob ناقص AOF فقط increment را می‌گرفت؛ اکنون active manifest/base/increments، stable-generation و redis-check-aof بدون repair | `tools/redis-aof-snapshot.py:10–42`, `tools/redis-backup.sh`؛ r1…r5 backup/AOF/readback/restart | FIXED & VERIFIED، E3 |
| DR8-02 / High | argv زمان split می‌شد، latest نامعتبر، restore_command خراب override می‌شد؛ اکنون argv array، type=default، حفظ config تولیدشده و promote/readiness | `tools/pitr-restore.sh:12–76`؛ p1…p5 named/time/native/latest/restart | FIXED & VERIFIED، E3 |
| DR8-03 / High | verifier فقط نمونه می‌دید و source اشتباه را قبول می‌کرد؛ اکنون approved manifest + database/system lineage/data-dir/schema/count/full rows | `tools/pitr-manifest.py:18–96`, `tools/pitr-verify.sh`؛ wrong source/dir/missing manifest پنج دور | FIXED & VERIFIED، E3 |
| DR8-04 / High | defaults موفقیت و RPO/RTO می‌ساختند؛ اکنون null/not_verified بدون evidence، estimates جدا، hash/boolean/number validation | `server/infrastructure/disaster-recovery.js:186–274,483`؛ truth contract، هشت unit suite و HTTP API 6/6 | FIXED & VERIFIED، UNIT + E3 HTTP dev fixture؛ collector واقعی نیست |
| DR8-05 / Medium | address parsing باعث false negative پس از Sentinel failover بود؛ اکنون delimiter درست، exact PONG/OK، bounded CLI و role check | `tools/failover-redis.sh:23–65`؛ پنج forced wrapper + automatic recovery/rejoin | FIXED & VERIFIED، E3 |
| DR8-06 / High | endpoint سالم با مسیر فایل stale پذیرفته می‌شد؛ اکنون native local CONFIG path/dbfilename + stable run_id attestation | `tools/redis-backup.sh`؛ پنج wrong-source refusal، RDB/AOF readback | FIXED & VERIFIED، E3 native namespace only |
| DR8-07 / Medium | S3 خواسته‌شده بدون uploader به local-success تنزل می‌یافت؛ اکنون fail-closed، expected owner/version و SHA256 readback | `tools/backup-s3-publish.py:16–50`؛ پنج local negative + پنج mock round شامل partial/timeout/corruption/concurrency | FIXED & VERIFIED برای repo contract؛ **external S3 BLOCKED** |
| PG safety / High | SQL failures/unknown lag یا عدم fencing مستقل می‌توانستند مبهم باشند؛ اکنون ON_ERROR_STOP، fence identity الزامی حتی با force، سه probe، unknown-lag refusal | `tools/failover-postgres.sh:21–78`؛ پنج already-primary/no-fence refusal و real stopped-source promotion | FIXED & VERIFIED برای مسیرهای آزموده؛ production fence trust externally unverified |
| Runbook drift / Medium | CLI قدیمی و ارجاع به middleware حذف‌شده | DR_RUNBOOK، PG PITR card، REDIS_RESTORE_PROCEDURE، PRODUCTION_RUNBOOK؛ regression coverage سبز | FIXED & VERIFIED، static contract |

قرارداد اپراتوری و محدودیت‌های native/manifest/S3: [DR_EVIDENCE_CONTRACT](../p2/docs/DR_EVIDENCE_CONTRACT.md). '--no-start' و '--no-verify' عمداً گواهی بازیابی نیستند. ایجاد manifest از backup خراب خودِ آن backup را معتبر نمی‌کند؛ provenance manifest نیازمند تأیید مستقل است.

## 5. DR-01 — تصمیم مبتنی بر شواهد

در **هر پنج round نهایی** pgBackRest 2.55.1 روی backup عمداً خراب‌شده، `status: invalid` داد ولی exit **0**؛ restore همان backup nonzero شد. raw output در `evidence/final-restore/pN-verify-corrupt.json` و `pN-restore-corrupt.json` (N=1…5) است.

این **upstream tool contract** است، نه یک repo caller فرضی: production restore gate فعلی از restore واقعی و manifest verification استفاده می‌کند، نه صرف raw verify exit. خطر upstream حذف یا «رفع‌شده» اعلام نمی‌شود: **GOVERNED LIMITATION**. CI regression به semantic invalid نگاه می‌کند؛ مصرف‌کنندهٔ آتی raw verify نیز باید semantic status را بخواند.

## 6. Regression / CI parity / provenance

- هر دو real harness نهایی exit **0** و `failures=[]` دارند؛ {len(ledger)} ledger records شامل command و assertion است، نه {len(ledger)} مانور مستقل.
- 13 entrypoint رگرسیون در SHA نهایی exit0: DR index، truth contract، national DR، redis-backup mock، DR health API، dr-runbook، ha-config، ha-config-mutations، disaster-recovery-coverage، incident-playbooks، runbook-cards-coverage، runbook-coverage و wave16-dr.
- Redis legacy mock **11/11**؛ HTTP API **6/6**. API از seeded JSON/development authority استفاده می‌کند، نه production PG authority.
- S3 contract پنج round: good، denied owner، partial، missing/wrong version، corrupt readback، timeout، invalid owner و چهار upload concurrent با keys یکتا. **MOCK ONLY**.
- `.github/workflows/dr-e3.yml` همین harnessها، پنج round، dependency hard failure و artifact retention را وارد PR CI می‌کند؛ seed prerequisite نیز اصلاح شد. **GitHub Actions execution NOT VERIFIED** چون push مسدود است. ادعای اجرای کامل `npm test` یا post-merge regression نداریم.
- [Unified final ledger](evidence/FINAL_LEDGER.json)، [provenance](evidence/provenance.json)، [source-review inventory/passages](evidence/source-review.json). command دقیق، env، expected/actual، stdout/stderr، UTC/monotonic در ledgerهای خام باقی است.

## 7. Failures retained — بدون پاک‌کردن شواهد

1. `live-pass1`: Redis8 offset manifest ابتدا رد می‌شد؛ time target با backup stop ثانیه‌ای مرزی بود؛ semantic log assertion بدون info-level چیزی نمی‌دید. parser اصلاح، target بعد از commit/stop boundary و log level صریح شد. `live-pass2` دو دور موفق بود ولی پنج‌دور محسوب نشد.
2. `redis-ha`: round1 پیش از discovery replica توسط Sentinel force شد و رد شد؛ مراحل بعدی همان round معتبر نیستند. **هیچ timing آن round failed وارد جدول نهایی نشده است.** readiness واقعی CKQUORUM/replica discovery اضافه شد؛ شواهد پاک نشده‌اند.
3. `exact-sha-restore` روی `ad3e9f6`: /tmp کوچک در PG promotion پر شد؛ server و wrapper شکست خوردند. یک Redis port collision نیز وجود داشت. تمام اندازه‌گیری‌های failed کنار گذاشته شد؛ labs نهایی به `/var/tmp` با 20GB آزاد منتقل و ports زیر ephemeral range شدند. این failure شواهد fail-closed است، نه recovery PASS.
4. اولین committed-SHA API run: seed حذف‌شده/غایب، ENOENT و exit1. CI seed prerequisite اصلاح و suite دوباره موفق اجرا شد.
5. runbook-coverage ابتدا reference فایل حذف‌شده را گرفت؛ به guard زنده attendance اصلاح شد؛ تست فعلی بدون کاهش assertion سبز است.

## 8. Reconciliation و blockers

Project Intelligence، Current Ground Truth، policy/roadmap و گزارش‌های مرتبط DR/backup در [source inventory](evidence/source-review.json) با hash و passages مربوط ثبت‌اند. Chat1 RT1، Chat2 RT2، Chat3 current-head و Chat4 DR فقط lead بودند؛ نتایج این گزارش از اجرای تازه است. artifact تاریخی غایب: **NOT IN CURRENT REPOSITORY — DO NOT RECONSTRUCT**؛ چیزی بازسازی و به گذشته منتسب نشده است.

تعارض‌ها به نفع هیچ agent خودکار حل نشده‌اند: عددهای تاریخی 120/145–240 ثانیه یا ادعای 38 جدول مدرک runtime فعلی نیستند. اسناد قدیمی می‌گویند SLO رسمی نیست، درحالی‌که plan/model هدف 300/900 ثانیه دارند؛ کارت‌های incident بودجه‌های 60/90 دقیقه را نیز ذکر می‌کنند. این‌ها targets/budgets با scopeهای متفاوت‌اند، نه measured recovery و نه مصوبهٔ جدید. owner باید acceptance SLO دقیق را ratify کند؛ این گزارش هیچ roadmap gate را ارتقا نمی‌دهد.

**Roadmap Reconciliation Required** برای همهٔ موارد زیر:

| مورد | وضعیت | مالک / شواهد لازم |
|---|---|---|
| انتشار branch و PR | BLOCKED؛ push128 | GitHub/repository owner: authenticated integration؛ سپس Arena push/PR |
| closure روی current main | NOT VERIFIED؛ main هنوز base است | Tech Lead: review، merge؛ سپس exact merged-SHA regression |
| actual off-site/S3 (پنج round) | EXTERNAL BLOCKER | Infra/SRE: approved bucket/versioning/IAM/KMS/independent failure domain، backup→download→restore/hash و faults |
| multi-host PG/Redis، partition و authoritative fencing | E4 NOT VERIFIED | Infra/SRE: production-equivalent topology و fault authorization |
| on-call/ack/application route/full incident RTO | MEASUREMENT GAP | On-call/application owner: زمان‌های alert→ack→service recovery، routing/PgBouncer/application reads/writes |
| formal acceptance SLO / production scale | OWNER DECISION REQUIRED | Product/SRE/Tech Lead: scoped thresholds، dataset/hardware و five-round E4 evidence |

**Phase 8.2 Exit: NOT VERIFIED. Phase 8.3: BLOCKED by exit evidence. Production GO: NOT DECLARED.**

## 9. Handoff / rollback

کلون workspace `/home/user/p2` شامل code/دو commit/branch clean است. bundle با `git bundle verify` تأیید شده و base بالا لازم است. روی clone دارای آن base می‌توان `git fetch /path/dr-closure.bundle HEAD:refs/heads/arena8/dr-closure-20260923` اجرا کرد؛ این خود merge نیست. قبل از push مجدد main و branch را reconcile کنید. Rollback مخزن: revert دو commit scoped، با review؛ هیچ rollback production لازم نیست چون production دست‌نخورده است.

داده‌ها و processهای lab پاک شدند، evidence حفظ شد. workspace زیر 100MB نگه داشته شد؛ ابزارهای نصب‌شده بیرون workspace هستند و ممکن است در session بعد نیازمند نصب مجدد باشند.
'''
(B/'REPORT.md').write_text(text)
(B/'PR_DRAFT.md').write_text(f'''# DR semantic recovery contracts and measured E3 regression\n\nBase: {base}\nHead: {sha}\nBranch: arena8/dr-closure-20260923\n\nFix PITR argv/config/identity/hash validation; complete Redis AOF/native source attestation; fail-closed S3 publication with versioned readback; PG fencing/SQL guards; Sentinel response parsing; unknown DR metadata by default. Add five-round real E3 restore/HA tests and explicit S3 mocks, CI, and operator contract.\n\nFive fresh PG restore/failover rounds and five Redis snapshot/Sentinel rounds PASS on this head. Thirteen regression entrypoints PASS. Detailed local evidence/report supplied separately.\n\nNot merged. Push currently fails 128 (HTTPS auth unavailable), so this is a draft, NOT an existing GitHub PR. Real S3/E4 and completed remote CI NOT VERIFIED. No Production GO. Tech Lead owns review/merge.\n\nCompatibility changes: verified PITR requires approved expected manifest; PG promotion requires executable fencing proof even with force; configured S3 requires owner/version/readback; API defaults now unknown/null. Read docs/DR_EVIDENCE_CONTRACT.md before rollout.\n''')
print('report written',sha,'records',len(ledger))
