# Arena Sync / Offline / Conflict — گزارش شواهد و تحویل

**وضعیت نهایی: TESTED locally — Strict Gate: NOT VERIFIED.**

بازتولید، اصلاح، regression و commit انجام شد. این گزارش گواهی سلامت کل سامانه نیست. هیچ clearance سه‌طرفه، merge یا Production GO اعلام نمی‌شود.

## 1. Current HEAD / scope / اختیار

| مورد | مقدار |
|---|---|
| تاریخ | 2026-09-24 |
| Fresh main مبنا و آخرین main مشاهده‌شده | `4bff3bcb757162f040e82ffa26f3d40e46eb7a36` |
| Branch مستقل | `arena-sync/offline-occ-20260924` |
| Commit نهایی، دقیقاً آزموده‌شده | **`4b577701b42fd33b61babdacab346b449e11c580`** |
| Working tree پس از آزمون | clean |
| وابستگی به DR قبلی | ندارد؛ branch مستقیماً از main ساخته شد |
| مسئولیت Arena | reproduce → fix → regression → commit → تلاش push/PR |
| مسئول merge | فقط Tech Lead |
| Push | تلاش واقعی، exit **128**؛ نبود HTTPS authentication |
| PR / Merge | **ایجاد نشده / انجام نشده** |

[remote main](evidence/remote-main-final.txt) · [push failure](evidence/push.log) · [final tree](evidence/final-tree.txt) · [bundle قابل انتقال](sync-offline-fix.bundle)

تغییرات ثبت‌نشدهٔ موجود در آغاز دست‌نخورده حفظ شدند: stash `89de93a27d3a1eb5e642fa8f945ffd9b0ac6c86e` و `evidence/pre-existing-tree.patch`. شاخهٔ DR و commitهایش نیز باقی هستند. برای رعایت سقف فضا، تاریخچهٔ remote main به depth1 دریافت و اشیای غیرقابل‌دسترسی Git پاک شدند؛ refs مربوط به DR/stash حفظ شدند. هیچ force-push انجام نشد.

## 2. Breachهای بازتولیدشده

**قانون انتظار:** نسخهٔ قدیمی نباید نسخهٔ جدیدتر را عقب ببرد یا دادهٔ آن را بی‌صدا overwrite کند. ردکردن عملیات باید داده را حفظ کند؛ خطای persistence نباید موفقیت یا حل تعارض جعلی بسازد.

| ID / شدت محلی | Expected | Actual قبل از اصلاح | محل اصلاح / شاهد |
|---|---|---|---|
| **A-18 / High** | conflict گرفته‌شده در v2 نتواند target جاری v9 را overwrite کند | پاسخ **200**؛ score **20→11** و version **9→3** | `server/conflicts.js:80–178`؛ [baseline pristine](evidence/pristine-baseline.jsonl) |
| **A-18 failure / High** | exception ذخیره‌سازی، cache و conflict را تغییر ندهد | DB error بلعیده شد؛ cache تغییر کرد و status=resolved با پاسخ200 | همان baseline، سناریوی injected outage؛ regression واقعی trigger/rollback |
| **A-20 / Medium→data-integrity** | نبود base در production برای تمام PATCHهای نسخه‌دار رد شود | grades در helper به 400 رسید؛ call contract مسیرهای دیگر بدون opt-in عبور کرد | `server/occ.js` و routes classes/attendance/students/users؛ [inventory پنج مسیر](evidence/patch-inventory.txt)، پنج مسیر در regression واقعی PG/HTTP |
| **SYNC-CAS / High** | نوشتن B بین precheck و commit، نوشتن قدیمی A را رد کند | در PG واقعی، `newer-from-client-B` با `older-from-client-A` overwrite شد؛ sync پاسخ200 داد | `server/sync.js:1089,1109`؛ [pristine real-PG race](evidence/pristine-baseline-sync-race.jsonl) |
| **SYNC-DUP / High** | یک UID همزمان فقط یک اثر durable داشته باشد | دو context همزمان، دو پاسخ200 و **دو رکورد** برای یک قصد/UID | `server/db.js:899–911`؛ [pristine real-PG duplicate](evidence/pristine-baseline-duplicate.jsonl) |
| **SYNC-PENDING / High** | duplicate در حال اجرا پیش از commit ACK نشود | duplicate موفق اعلام شد درحالی‌که تلاش نخست هنوز pending بود و بعداً شکست خورد | `server/sync.js:1379–1390`؛ [failure reproduction](evidence/pending-duplicate-reproduced.log) |
| **SYNC-INSERT / High** | INSERT دارای ID موجود، creation باشد نه stale upsert | INSERT جدید با ID موجود رکورد را overwrite و version را به **1** برگرداند | `server/db.js:706–716` و sync collision guard؛ [pristine real-PG insert](evidence/pristine-baseline-insert.jsonl) |
| **CLIENT-PULL / High** | pull قدیمی نتواند row جدیدتر را عقب ببرد | v9/score20 با v2/score1 جایگزین شد | `src/js/29-pull.js`؛ [baseline client VM](evidence/baseline-client.json) |
| **CLIENT-QUEUE / High** | pending offline operation هنگام pull حفظ شود | guard دنبال queueItem.c بود، نه queueItem.op.c؛ ویرایش محلی v10 توسط پاسخ v9 بازنویسی شد | همان فایل؛ wrapper واقعی `{op,status}` اکنون محافظت می‌شود |

Baselineهای اصلی دوباره در worktree **pristine و clean** همان main اجرا شدند؛ آن worktree پس از ثبت شواهد حذف شد. [خلاصهٔ ماشینی بازتولیدها](evidence/reproduced-breaches.json). Exit0 ابزار baseline به معنای PASS invariant نیست؛ این ابزارها رخداد breach را ثبت می‌کنند. Baseline client/helper سطح UNIT است؛ baselineهای CAS/duplicate/insert واقعاً از PostgreSQL استفاده کردند. آزمون pending-duplicate در میانهٔ اصلاحات، قبل از اضافه‌شدن قفل pending، شکست را ثبت کرده است؛ به baseline pristine نسبت داده نمی‌شود.

## 3. Root cause و اصلاح

### A-18 — adjudication اتمیک و متکی به دادهٔ جاری

- conflict و target از PostgreSQL، در یک transaction با `FOR UPDATE` خوانده می‌شوند؛ cache مبنای تصمیم نیست.
- incoming فقط وقتی اعمال می‌شود که target هنوز همان `server_version` مورد داوری را داشته باشد. conflict قدیمی با **409 stale_conflict** رد می‌شود؛ نسخه خودکار rebase نمی‌شود.
- target حذف‌شده دوباره ساخته نمی‌شود. identity/tenant/field/role/schema دوباره کنترل می‌شوند.
- patch داده و status=resolved باهم commit/rollback می‌شوند. cache فقط بعد از commit منتشر می‌شود.
- server-wins، **row جاری** را برمی‌گرداند، نه server_state تاریخی داخل conflict.
- manager نمی‌تواند conflict با school_id تهی یا target منتقل‌شده به مدرسهٔ دیگر را داوری کند. PG list failure نیز به cache-success تبدیل نمی‌شود.

### A-20 / final OCC

پنج PATCH موجود در router: students، classes، grades، attendance، users. همه اکنون required-base را در production/strict mode فعال می‌کنند؛ version عدد صحیح مثبتِ امن است، نه coercion رشته/boolean. در sync، `base_version` اصلی تا UPDATE/DELETE نهایی منتقل می‌شود و payload آینه یک copy مستقل است. precheck صرفاً advisory است؛ **CAS داخل PostgreSQL** تصمیم نهایی را می‌گیرد.

### Duplicate / retry / creation

- sync-only transaction، UIDها را با ترتیب ثابت lock می‌کند، committed UID را قبل از mutation بررسی می‌کند و data/derived effects/UID را یکجا commit می‌کند.
- رقابت duplicate بین contextها ممکن است یک **503 قابل retry** بدهد؛ retry سپس duplicate_ignored می‌شود، بدون اثر دوم.
- برای همان context، درخواست‌های دارای UID مشترک منتظر commit/rollback قبلی می‌مانند؛ درخواست‌های بدون UID مشترک همزمان می‌مانند.
- sync INSERT دیگر upsert بدون نسخه نیست؛ هویت موجود رد می‌شود. callerهای trusted غیرsync قرارداد پیشین خود را دارند.

### Offline client

pending/sending/conflict entries در ساختار واقعی صف محافظت می‌شوند. پاسخ timestamped قدیمی پیش از تغییر cursor رد می‌شود؛ row با version کمتر، حتی در full snapshot هم جای row جدیدتر را نمی‌گیرد. structural write و delete نیز base را ثبت می‌کنند. شمارندهٔ نسخه با payload محلی عقب نمی‌رود. source با دستور رسمی build در `index.html` و `USER_GUIDE.html` ساخته شد؛ permission catalogue بازتولید نشد.

قرارداد تفصیلی: [SYNC_OCC_EVIDENCE_CONTRACT](../p2/docs/SYNC_OCC_EVIDENCE_CONTRACT.md).

## 4. رقابت دو client و آزمون adversarial

روی **SHA نهایی** هر باتری جدید در **دو اجرای مستقل** اجرا شد؛ هر اجرای feature battery پنج round با state تازه دارد. schemaهای هر اجرای زنده یکتا و disposable هستند.

| باتری | هر اجرا | نتایج دو اجرای نهایی | سطح واقعی |
|---|---:|---|---|
| `sync-occ-adversarial-live.js` | 5 rounds، **135 named checks** + assertions داده | exit0 / exit0 | PostgreSQL واقعی + دو HTTP listener که routeهای محصول را اجرا می‌کنند؛ sessionها fixture هستند |
| `sync-replay-adversarial-live.js` | 5 rounds، **60 named checks** + assertions داده | exit0 / exit0 | PostgreSQL واقعی، contextهای مستقل sync داخل یک process؛ نه کلاستر چندمیزبانه |
| `sync-client-adversarial.js` | 5 VM مستقل، **75 checks** | exit0 / exit0 | کد واقعی source کلاینت در VM؛ نه اثبات crash durability مرورگر |
| `strict-gate-empty-registry.js` | **2 negative cases** | exit0 / exit0 | رد registry ناقص؛ به معنای clearance پروژه نیست |

**سناریوهای مهم اجراشده:**

- دو درخواست HTTP همزمان: incoming conflict resolution در برابر PATCH همان نسخه؛ دقیقاً یکی 200، دیگری409؛ افزایش version دقیقاً یک واحد و دادهٔ برنده در PG.
- دو resolve همزمان و replay همان conflict؛ یک commit، دیگری409؛ cache قدیمی نتوانست conflict بسته‌شدهٔ DB را باز کند.
- عمدی: base قدیمی، base غایب، malformed version، conflict تاریخی، foreign/null tenant، forged ID، unknown field، target حذف‌شده.
- update/delete با تغییر واقعی PG در فاصلهٔ precheck تا commit؛ CAS نهایی رد کرد و newer state حفظ شد.
- دو context با UID یکسان؛ یک اثر، retry بدون دوباره‌نویسی.
- duplicate در زمان pending و شکست تلاش اول؛ ACK زودهنگام صادر نشد و waiter پس از rollback توانست یکبار اعمال کند.
- trigger خطا هنگام تغییر status conflict یا ذخیرهٔ UID؛ rollback داده/metadata و retry پس از برداشتن fault.
- pull قدیمی، full snapshot قدیمی، نسخهٔ پایین‌تر، pending offline update/delete و base capture در client.

لاگ‌ها: `evidence/final-sync-*-independent-1.log` و `...-2.log`. همه به SHA نهایی در [command ledger](evidence/final-command-ledger.json) متصل‌اند؛ command، UTC، monotonic start/end، expected/actual exit و مسیر log ثبت شده است.

## 5. Regression، assertion integrity و CI

۱۸ مجموعهٔ موجود روی SHA نهایی exit0 داشتند:

`data-integrity-occ-migration`, `sync-dup-claim`, `sync-atomic-batch`, `sync-del-mirror`, `sync-cache-errors`, `sync-mirror-visible`, `sync-chunk`, `sync-sending-revive`, `sync-dlq-retry`, `sync-queue-caps`, `sync-lastsync`, `delta-sync-hardening`, `offline-sync-drill`, `sync-conflict-ui`, `occ`, `server15`, `server18`, `conflicts-list-cap`.

- `server18`: **55/55**؛ `conflicts-list-cap`: **14/14**. `check-authz` نیز exit0.
- assertion ثابت S2c در offline drill با بررسی واقعی هر سه response جایگزین شد.
- conflict-list fixtureها collection/record identity صریح گرفتند؛ assertionهای retention حذف نشدند.
- server18 قبلاً batch-wide rejection قدیمی را انتظار داشت؛ assertion اکنون `ok=false + role_denied` عملیات **و عدم تغییر تعداد row ذخیره‌شده** را می‌سنجد، نه صرف status200.
- CI همان سه باتری جدید و negative gate test را با PG service اجرا می‌کند. **اجرای remote CI روی این SHA وجود ندارد/تأیید نشده** چون push مسدود است.
- اجرای کامل همهٔ تست‌های مخزن، سه review مستقل یا post-merge verification ادعا نمی‌شود.

## 6. Strict Verification Gate — واقعاً قرمز

**اجرای نهایی: exit1، VERDICT NOT VERIFIED.** [لاگ دقیق](evidence/final-strict-gate.log)

در baseline، فایل compatibility مانیتورینگ به اشتباه symlink با target متن شش‌خطی YAML بود؛ خواندن آن scanner را با ENOENT می‌انداخت. فایل با **همان محتوا** به regular file تبدیل شد؛ canonical alert rules عوض نشدند. همچنین شرط صریح nonempty/unblocked registry به گیت اضافه و تست شد.

گیت اکنون اجرا می‌شود اما همچنان registry تهی/blocked و patternهای تأییدنشدهٔ repository-wide را گزارش می‌کند. هیچ review متعلق به ChatGPT یا Atria جعل نشد، registry سبز نشد و allowlist تخفیف داده نشد. موارد scanner به معنی اثبات defect در تک‌تک hitها نیست؛ بعضی hitها literal/comment یا خود scanner هستند و triage QA لازم دارند. این کار فقط scope Sync و پیش‌نیاز اجرایی گیت را تغییر داد؛ queueهای دیگر Atria پاک نشده‌اند.

**expected_exit=1 در ledger صرفاً ثبت نتیجهٔ موردانتظارِ گیت blocked است؛ گیت PASS نشده است.**

## 7. شواهد شکست و محدودیت‌ها

- همهٔ baseline breachها، failureهای میانی و رگرسیون اولیهٔ server18/conflict-list حفظ شده‌اند.
- تلاش server18 بدون seed با ENOENT شکست خورد؛ prerequisite seed فراهم و سپس روی SHA نهایی دوباره اجرا شد. شکست اولیه حذف یا skip محسوب نشده است.
- محیط: Node **22.23.3**، PostgreSQL **17.11**، Linux تک‌میزبان. داده‌ها synthetic/minimal و sessionهای باتری PG fixture هستند؛ این تست‌ها auth، کل schema production، مقیاس ملی یا استقلال failure domain را ثابت نمی‌کنند.
- legacy development memory mode با strict خاموش هنوز missing-version compatibility دارد. این یک **مرز محدودیت** است، نه تضمین newer-wins برای آن حالت. production/staging باید strict و PG-authoritative باشند.
- مجموعه‌های untracked با receipt-order/LWW، replayهای همهٔ مدل‌های دامنه، device/browser crash durability، reconnect واقعی شبکه و چند process/چند میزبان production در این تحویل به‌طور جامع اثبات نشده‌اند. پس ادعای «هیچ overwrite در هیچ مسیر محصول ممکن نیست» مجاز نیست.
- سمت client، تست جدید VM است؛ رگرسیون built-app/queue با harnessهای موجود انجام شد، نه آزمایش روی دستگاه واقعی.

## 8. Reconciliation / handoff

**Roadmap Reconciliation Required.** گزارش branch به carry-over register لینک شد، ولی A-18/A-20 در **main** closed اعلام نشده‌اند. موارد باز:

| مورد | وضعیت | مالک / اقدام لازم |
|---|---|---|
| انتشار commit و PR | BLOCKED؛ push128 | repository owner: اتصال احراز هویت امن؛ سپس Arena push/PR |
| review مستقل همان SHA | NOT VERIFIED | ChatGPT و Atria، مستقل از ادعای Arena |
| Strict registry و scanner triage | NOT VERIFIED | QA/Gate owners و reviewerها؛ بدون blanket allowlist |
| merge و merged-SHA regression | انجام نشده | Tech Lead؛ سپس regression روی SHA merge |
| پوشش legacy/LWW و device crash/production topology | NOT VERIFIED / scope limitation | ادامهٔ workstream با قرارداد روشن نسخه/دامنه و محیط مجاز |

Commit مستقل در workspace آماده است. [Bundle](sync-offline-fix.bundle) با `git bundle verify` بررسی شد؛ prerequisite آن base `4bff3bcb…` است. روی clone دارای base:

```bash
git fetch /path/sync-offline-fix.bundle HEAD:refs/heads/arena-sync/offline-occ-20260924
```

این دستور merge نیست. قبل از انتشار/merge، main را دوباره reconcile کنید. Rollback: revert همان commit با review؛ production دست‌نخورده بوده است.

**نتیجه:** breachهای جدول بازتولید و اصلاح شدند و در سناریوهای تست‌شده newer state حفظ شد؛ **قبولی نهایی Strict Gate و closure در main هنوز وجود ندارد**.
