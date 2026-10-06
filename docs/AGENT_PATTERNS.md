# Production Agent Patterns — مرجع کامل الگوهای Production برای agentهای پایش

> **منبع:** بررسی عمیق چهار ریپوی production واقعی — OpenMAIC (پلتفرم Next.js/LangGraph)، databasement (لاراول چندسازمانی)، archify (سیستم delivery دیاگرام)، ai-engineering-from-scratch (corpus مهندسی agent).
>
> **این فایل خلاصه نیست.** هر الگو با کد واقعی، اعداد دقیق، نام فایل و قوانین قابل‌استناد نوشته شده تا در مکان مربوطه line-by-line cite شود. وقتی به یک الگو نیاز دارید، کل بخشش را بخوانید، فقط headingش را نه.

---

## بخش ۱: Stall و ابزارهای بدون deadline

### ۱.۱ مشکل دقیق

حلقهٔ agent بدون deadline صبر می‌کند. وقتی `tool.execute(...)` را await می‌کند، اگر آن promise نه resolve شود نه reject — یک درخواست provider آویزان، یک نوشتن DB که هرگز برنمی‌گردد، یک library call روی یک await غیرقابل‌cancel — **session برای همیشه قفل می‌شود**. Lease همچنان heartbeat می‌دهد، ظاهراً همه‌چیز سالم است، و هیچ ترمیمی اجرا نمی‌شود تا زمانی که process زنده است.

این خاموش‌ترین حالت خرابی است: health check سبز، کار متوقف.

### ۱.۲ راهکار: timeout race با دو سیگنال (OpenMAIC `lib/agent/runtime/tool-timeout.ts`)

هر فراخوانی tool را در برابر **دو** سیگنال race کنید، نه یک.

**سیگنال اول — timeout سخت:**
- پیش‌فرض: `DEFAULT_AGENT_TOOL_TIMEOUT_MS = 10 * 60_000` (۱۰ دقیقه).
- overrides per-tool که دانش deployment را رمزگذاری می‌کنند (override برندهٔ env است):
  ```ts
  const AGENT_TOOL_TIMEOUT_OVERRIDES: Readonly<Record<string, number>> = {
    generate_scene: 15 * 60_000,
    generate_actions: 15 * 60_000,
    extract_material: 15 * 60_000,
  };
  ```
- `resolveAgentToolTimeoutMs(toolName, env)`: اگر override وجود دارد برمی‌گردد؛ در غیر این صورت env را می‌خواند و فقط وقتی `Number.isFinite(parsed) && parsed > 0` می‌پذیرد.

**سیگنال دوم — AbortSignal فراخواننده:**
session cancel / lease loss / shutdown. این به خودی خود کافی نیست چون یک await که signal را نادیده می‌گیرد همچنان session را زنده نگه می‌دارد.

**نحوه ترکیب — یک AbortController مشتق‌شده:**
```ts
const controller = new AbortController();
const forwardAbort = () => controller.abort(signal?.reason);
if (signal?.aborted) controller.abort(signal.reason);
else signal?.addEventListener('abort', forwardAbort, { once: true });
```
ابزار `controller.signal` را می‌بیند، نه `signal` بیرونی را. بنابراین abort به work در حال اجرا می‌رسد **حتی اگر حلقهٔ agent پس از timeout همچنان اجرا شود**.

**قانون یک برنده (`settled`):**
```ts
let settled = false;
const finish = (apply: () => void): void => {
  if (settled) return;
  settled = true;
  cleanup();
  apply();
};
```
این guard باعث می‌شود خطای timeout حتی وقتی tool به‌طور همزمان از abortی که تازه دریافت کرده reject شود، برندهٔ race باشد.

**آپدیت‌های zombie drop می‌شوند:**
```ts
const guardedUpdate = onUpdate
  ? (partial) => { if (!settled) onUpdate(partial); }
  : undefined;
```
پیشرفتی که یک ابزار zombie پس از settle شدن race می‌فرستد نادیده گرفته می‌شود.

**abort listener نمی‌تواند race را بشکند:**
```ts
const abortWork = (reason: unknown): void => {
  try { controller.abort(reason); } catch { /* ignore: race still settles */ }
};
```
یک listener abort پرتاب‌کننده، bug ابزار است، نه دلیلی برای قفل session.

**نتیجهٔ timeout:** `AgentToolTimeoutError` پرتاب می‌شود → harness آن را به یک structured error tool-result در transcript تبدیل می‌کند → agent شکست را می‌بیند و می‌تواند retry یا proceed کند. **session نمی‌میرد.**

### ۱.۳ راهکار جایگزین: lease بدون heartbeat (databasement `BackupJobHandler`)

وقتی شغلی نمی‌تواند mid-run heartbeat بدهد:
```php
public function leaseSeconds(): int {
    return max(1, (int) AppConfig::get('backup.job_timeout'));
}
```
دلیل مستند: «دستور dump نمی‌تواند وسط کار heartbeat بدهد، پس lease کل job timeout را پوشش می‌دهد به جای اینکه تحت یک dump طولانی expire شود.»

**قانون:** وقتی heartbeat ممکن نیست، lease را صادقانه برابر حداکثر مدت مجاز تنظیم کنید — اجازه ندهید expire شود و سپس کارگر دیگری آن را بدزدد در حالی که کار هنوز در حال اجراست.

---

## بخش ۲: پروتکل lease برای صف کارگر

### ۲.۱ مشکل دقیق

چند کارگر، crashها، restartها و deployهای rolling. بدون پروتکل: یا کار گم می‌شود، یا دو بار اجرا می‌شود، یا یک session cancelشده توسط restart احیا می‌شود.

### ۲.۲ schema (OpenMAIC `packages/@openmaic/storage/src/agent-session/pg.ts`)

ستون‌ها: `status`، `attempt`، `lease_worker_id`، `lease_worker_pid`، `lease_heartbeat_at`، `cancel_requested_at`، `error`، `deleted_at`.

استنتاج: PostgreSQL **READ COMMITTED**. درستی به این بستگی که lock ردیفِ والد به دنبال آن تخصیص max-plus-one فرزند می‌آید.

### ۲.۳ claimNextSession — اسکن خوش‌بینانه سپس lock-and-recheck

**مرحله ۱ — اسکن کاندید بدون lock:**
```sql
SELECT id FROM agent_sessions
 WHERE deleted_at IS NULL
   AND (status = 'queued'
        OR (status = 'running'
            AND (lease_heartbeat_at IS NULL OR lease_heartbeat_at < $1)
            AND (lease_worker_id IS NULL OR lease_worker_id <> $2)))
   AND (attempt < $3 OR status = 'running')
 ORDER BY created_at LIMIT 5
```

**مرحله ۲ — قفل و بررسی مجدد (مرجع واقعی):**
```sql
SELECT status, attempt, cancel_requested_at FROM agent_sessions
 WHERE id = $1 AND deleted_at IS NULL
   AND (status = 'queued'
        OR (status = 'running'
            AND (lease_heartbeat_at IS NULL OR lease_heartbeat_at < $2)
            AND (lease_worker_id IS NULL OR lease_worker_id <> $3)))
   AND (attempt < $4 OR status = 'running')
 FOR UPDATE
```

> «snapshotهای کاندید به محض خوانده شدن stale می‌شوند. بررسی قفل‌شده مرجع است.»

**مرحله ۳ — UPDATE تحت lock:**
```sql
UPDATE agent_sessions
   SET status = 'running',
       attempt = attempt + CASE
         WHEN status = 'queued' THEN 1
         WHEN status = 'running' AND lease_worker_id IS NOT NULL THEN 1
         ELSE 0
       END,
       lease_worker_id = $2,
       lease_worker_pid = $3,
       lease_heartbeat_at = $4,
       error = NULL, updated_at = now()
 WHERE id = $1 AND deleted_at IS NULL
```
نکته: PostgreSQL هر SET expression را از ردیف pre-update قفل‌شده ارزیابی می‌کند، پس `lease_worker_id` در اینجا هنوز دارندهٔ قبلی را مشخص می‌کند.

### ۲.۴ شارژ attempt در هر takeover

| حالت takeover | هزینهٔ attempt |
|---|---|
| claim از `queued` | ۱ |
| takeover یک lease رهاشده (stale غیر-null) | ۱ |
| takeover یک lease تمیزًا آزادشده (null) | **۰** |

**قانون:** parkهای تمیز هرگز یک session سالم را به اشتباه توسط cap attempt محدود نمی‌کنند، در حالی که crashloopها توسط `maxAttempts` محدود می‌مانند.

### ۲.۵ cancel در زمان claim ترمینال است

```ts
if (previous.cancel_requested_at !== null) {
  await this.settleCancelledAtClaim(tx, candidate.id, now, previous.attempt);
  return null;  // به اسکن برای کاندید بعدی ادامه می‌دهیم
}
```
`settleCancelledAtClaim`: row به `cancelled` settle می‌شود (reset attempt، پاک کردن cancel request)، projection مالک status ترمینال را ثبت می‌کند، و event log یک frame `session_end` دریافت می‌کند تا stream انتقال ترمینال را نشان دهد «حتی اگر هیچ دارندهٔ leaseی هرگز این attempt را اجرا نکرده باشد».

> «یک restart هرگز نمی‌تواند sessionی را که کاربر قبلاً cancel کرده، احیا کند.»

### ۲.۶ gating سؤال کاربر در SQL

یک session با یک رویداد `user_question` بی‌جواب (هیچ `user_message` غیرخالی بعدی وجود ندارد) از batch claim خارج نگه داشته می‌شود:
```sql
AND (cancel_requested_at IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM agent_session_events question
   WHERE question.session_id = agent_sessions.id
     AND question.type = 'user_question'
     AND NOT EXISTS (
       SELECT 1 FROM agent_session_events answer
        WHERE answer.session_id = question.session_id
          AND answer.seq > question.seq
          AND answer.type = 'user_message'
          AND length(btrim(COALESCE(answer.data->>'text', ''))) > 0
     )
))
```
این predicate پس از قفل ردیف تکرار می‌شود — بررسی قفل‌شده مرجع است، و نسخهٔ scan فقط ردیف‌های fenced را از batch خوش‌بینانه دور نگه می‌دارد. یک attachment متریال بدون متن پشت سؤال در صف می‌ماند.

### ۲.۷ heartbeat

```sql
UPDATE agent_sessions
   SET lease_heartbeat_at = $3, updated_at = now()
 WHERE id = $1 AND lease_worker_id = $2 AND deleted_at IS NULL
```
heartbeat از کارگر اشتباه ۰ سطر را update می‌کند و `false` برمی‌گرداند — این یک سیگنال قابل تشخیص است، نه یک خطای خاموش.

### ۲.۸ assertActiveLease — قبل از هر write

```sql
SELECT attempt FROM agent_sessions
 WHERE id = $1 AND lease_worker_id = $2 AND attempt = $3
   AND cancel_requested_at IS NULL AND deleted_at IS NULL
 FOR SHARE
```
داخل خود تراکنش write اجرا می‌شود. عدم تطابق → `AgentSessionLeaseLostError`. **هر append باید lease را قبل از نوشتن verify کند.**

### ۲.۹ finishSession

یک UPDATE محافظت‌شده توسط:
- `lease_worker_id = $2` (فقط دارنده می‌تواند پایان دهد)
- `expectedAttempt` اختیاری (optimistic concurrency)
- `consumeCancelRequestedAt` (idempotency — فقط cancel موردنظر را پاک می‌کند)

`releaseLease` مستقل است: فیلدهای lease را null می‌کند بدون اینکه status را settle کند (park تمیز، بدون هزینهٔ attempt).

---

## بخش ۳: Tenant isolation — دفاع زیر router

### ۳.۱ مشکل دقیق (مستقیماً M14-A01)

رد کردن عملیات در لایه HTTP (status code) به خودی خود کافی نیست. هر spelling از مسیر درخواست می‌تواند دور آن بزرد. یک tenant حذف‌شده باید داده‌اش را از **هر** مسیری غیرقابل دسترس کند.

### ۳.۲ مشکل ساختاری

وقتی یک دوره delete می‌شود:
- `stage_meta.deleted_at` آن را tombstone می‌کند و **ردیف‌ها را نگه می‌دارد**.
- sessionهای runtime فقط یک stage id حمل می‌کنند، پس **هیچ‌چیز در runtime store از tombstone خبر ندارد**.

دو سیستم جداگانه، و هیچ‌کدام به تنهایی کافی نیست.

### ۳.۳ راهکار: دکوراتور روی store، زیر router (OpenMAIC `lib/persistence/runtime-tombstone-guard.ts`)

```ts
export function createTombstoneGuardedRuntimeStore(
  inner: RuntimeStore,
  isTombstoned: StageTombstoneReader,
): RuntimeStore {
  const tombstoned = (stageId: string) =>
    isQueryableStageId(stageId) ? isTombstoned(stageId) : Promise.resolve(false);
  return {
    async createSession(init) {
      if (await tombstoned(init.stageId)) throw new RuntimeStageNotFoundError(init.stageId);
      return inner.createSession(init);
    },
    async getSession(sessionId) {
      const session = await inner.getSession(sessionId);
      if (session === undefined) return undefined;
      return (await tombstoned(session.stageId)) ? undefined : session;
    },
    async listSessions(stageId, learnerKey) {
      if (await tombstoned(stageId)) return [];
      return inner.listSessions(stageId, learnerKey);
    },
    // write methods مستقیماً pass through می‌شوند — handler HTTP قبل از write می‌خواند
  };
}
```

> «امتناع در اینجا، زیر router، به این معناست که **هیچ spellingی از مسیر درخواست نمی‌تواند دور آن بزرد**.»

handler HTTP قبل از هر write یک session را می‌خواند، پس تغییرات status و appendهای record برای یک session tombstoneشده مانند یک session ناشناخته 404 جواب می‌دهند. ایجاد session روی یک دورهٔ tombstoneشده توسط خود store با `RuntimeStageNotFoundError` رد می‌شود که handler با `404 STAGE_NOT_FOUND` جواب می‌دهد.

**چرا writeها pass-through هستند:** dedup و fault tolerance به این بستگی که writes در یک session هرگز به‌خاطر tombstoning رد نشوند. امتناع در لایه read کافی است چون هر write از طریق یک read شروع می‌شود.

### ۳.۴ قانون: ابتدا queryability را بررسی کنید

```ts
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

export function isQueryableStageId(stageId: string): boolean {
  return stageId !== '' && !stageId.includes('\0') && !LONE_SURROGATE.test(stageId);
}
```

دلیل مستند: «Whether PostgreSQL can bind the id; one it cannot bind names no row.»

یک id که PG نمی‌تواند bind کند باید به عنوان «no row» رفتار کند، نه به عنوان یک خطا. بدون این guard، یک id مخرب می‌تواند یک مسیر خطا متفاوت و احتمالاً کمتر-guardشده را طی کند.

### ۳.۵ دو لایه دفاع tenant (databasement)

**لایه ۱ — global scope (خواندن):**
```php
class OrganizationScope implements Scope {
  public function apply(Builder $builder, Model $model): void {
    $currentOrg = app(CurrentOrganization::class);
    if ($currentOrg->isResolved()) {
      $builder->getQuery()->where($model->getTable().'.organization_id', $currentOrg->id());
    }
  }
}
```
هر query روی `organization_id` در صورتی که یک org resolve شده باشد فیلتر می‌شود.

**لایه ۲ — policy (نوشتن):** writes از `authorize()` عبور می‌کنند، پس policy و scope **با هم** در مسیری که یک bypass داده را نابود می‌کند، تمرین می‌شوند.

**نکتهٔ scope غیرمستقیم:** رکوردهایی که `organization_id` خودشان را ندارند (مثلاً snapshots) از طریق والدشان scope می‌شوند (یک `DatabaseServerOrganizationScope` جداگانه). مدل متفاوت، همان تضمین.

**قوانین Bouncer:**
```php
Bouncer::scope()->to($orgId)->onlyRelations()->dontScopeRoleAbilities();
```
- **تعاریف** role/ability سراسری هستند (بین همهٔ سازمان‌ها به اشتراک گذاشته می‌شوند).
- **تخصیص‌ها** role per-org هستند.
- «هر جایی که با Bouncer صحبت می‌کند باید دقیقاً همین configuration را اعمال کند؛ مخلوط کردن flagها چیزی است که باعث می‌شود مسیر خواندن نتایج غلط برگرداند.»

**Ability یک enum کد-تعریف‌شده است:** مدیران هرگز نام ability را free-type نمی‌کنند؛ این مجموعه فقط با یک تغییر کد تغییر می‌کند.

---

## بخش ۴: تست tenant isolation

### ۴.۱ مشکل دقیق — تستی که خودش باگ را پنهان می‌کند

راهنمای تست suite سازمان را از قبل resolve می‌کند (`setupOrgContext()`)، که **هر چیزی را که tenant را قبل از اجرای middleware می‌خواند، پنهان می‌کند**.

### ۴.۲ راهکار: context را reset کنید

```php
function asUnresolvedRequest(): void {
  app(CurrentOrganization::class)->reset();
}
```

> «یک درخواست واقعی با هیچ سازمان resolveشده‌ای به framework می‌رسد؛ setupOrgContext() از قبل یکی را resolve می‌کند... پاک کردن آن در اینجا باعث می‌شود این تست‌ها از جایی شروع شوند که یک درخواست شروع می‌کند.»

**این دقیقاً کلاس باگی است که یک suite تست معمولی نمی‌تواند شکار کند.**

### ۴.۳ هفت تست اجباری

**تست ۱ — ترتیب middleware:**
```php
test('tenant context is resolved before route-model binding', function (string $routeName) {
    $router = app(Router::class);
    $pipeline = iterator_to_array(new SortedMiddleware(
        app(Kernel::class)->getMiddlewarePriority(),
        $router->gatherRouteMiddleware($router->getRoutes()->getByName($routeName)),
    ));
    expect(array_search(SetCurrentOrganization::class, $pipeline, true))
        ->toBeLessThan(array_search(SubstituteBindings::class, $pipeline, true));
})->with(['api.database-servers.show', 'dashboard']);
```
tenant middleware باید **قبل از** route-model binding قرار داشته باشد — در غیر این صورت یک model bindشده از scope فرار می‌کند.

**تست ۲ — خواندن کاربر غیرعضو:**
```php
$this->actingAs($this->eve, 'sanctum')
    ->getJson("/api/v1/database-servers/{$this->foreignServer->id}")
    ->assertNotFound();
```
(scope به تنهایی این را نگه می‌دارد؛ `show` هیچ `authorize()` خودش را صدا نمی‌زند.)

**تست ۳ — نوشتن کاربر غیرعضو (مسیری که در آن یک bypass داده را نابود می‌کند):**
```php
$this->actingAs($this->eve, 'sanctum')
    ->deleteJson("/api/v1/volumes/{$volume->id}")
    ->assertNotFound();

expect(Volume::withoutGlobalScopes()->find($volume->id))->not->toBeNull();
```
**نکتهٔ حیاتی:** کد پاسخ کافی نیست — **وجود رکورد را نیز verify کنید.**

**تست ۴ — رکورد scopeشده به صورت غیرمستقیم:**
```php
$snapshot = Snapshot::factory()
    ->forServer($this->foreignServer)
    ->onVolumes(Volume::factory()->create(['organization_id' => $this->orgA->id]))
    ->create();
// → assertNotFound()
```

**تست ۵ — ability به تنهایی authorize نمی‌کند:**
```php
// Eve همه abilityها را دارد، اما فقط در Org B
foreach ($foreign as $model) {
    expect($this->eve->can('view', $model))->toBeFalse()
        ->and($this->eve->can('update', $model))->toBeFalse()
        ->and($this->eve->can('delete', $model))->toBeFalse();
}
```
برای هر چهار نوع مدل (DatabaseServer، Volume، Agent، DatabaseServerSshConfig) باید false باشد.

**تست ۶ — همان ability در org خودش هنوز کار می‌کند:**
```php
foreach ($own as $model) {
    expect($this->eve->can('view', $model))->toBeTrue()
        ->and($this->eve->can('update', $model))->toBeTrue()
        ->and($this->eve->can('delete', $model))->toBeTrue();
}
```
این false-positive را غیرممکن می‌کند: اگر تست ۵ به تنهایی اجرا شود، یک پیاده‌سازی که همه را رد می‌کند هم پاس می‌شود.

**تست ۷ — escape hatch صادقانه:**
```php
test('the guard passes when no organization is resolved', function () {
    asUnresolvedRequest();
    expect($this->eve->can('view', $this->foreignServer))->toBeTrue();
});
```
در context CLI/queue هیچ orgی resolve نمی‌شود و scope فیلتر نمی‌کند. **این رفتار موردنظر است، پنهانش نکنید.**

### ۴.۴ setup تست

```php
beforeEach(function () {
    $this->orgA = Organization::factory()->create(['name' => 'Org A']);
    $this->orgB = Organization::factory()->create(['name' => 'Org B']);
    // Eve همه abilityها را دارد، اما فقط داخل Org B
    $this->eve = User::factory()->create();
    $this->eve->organizations()->detach();
    attachUserToOrg($this->eve, $this->orgB, 'admin');
    $this->foreignServer = DatabaseServer::factory()->create(['organization_id' => $this->orgA->id]);
});
```
نکته: Eve **admin** است — یعنی همهٔ abilityها را دارد. اگر یک کاربر admin نتواند دسترسی پیدا کند، قطعاً isolation کار می‌کند، نه اینکه نقش‌ها خراب باشند.

---

## بخش ۵: False green در تست‌ها

### ۵.۱ مشکل دقیق — TIA / Test Impact Analysis

Pest 5 TIA نتایج کش‌شده را بازپخش می‌کند و فقط تست‌های تحت تاثیر working tree را دوباره اجرا می‌کند، یک suite ~۱۱۰ ثانیه‌ای را به بازپخش ~۲ ثانیه‌ای تبدیل می‌کند.

### ۵.۲ شاهد مستند از databasement

> «هرگز یک `make test-tia` سبز را به عنوان proof اینکه suite پاس می‌شود، در نظر نگیرید. در این codebase گراف ضبط‌شده فقط برای ۱۷۷ از ۲۹۱ فایل `app/` test edge دارد، و `app/Livewire` تقریباً کاملاً غایب است (۲ از ۷۰ فایل edge دارند). **حذف یک `authorize()` از یک Livewire component باعث شد `1487 passed` تحت TIA گزارش شود در حالی که suite کامل روی آن fail شد.**»

### ۵.۳ سه قانون

۱. **هرگز بازپخش کش‌شده را proof ندانید.** آن را فقط برای feedback سریع inner-loop استفاده کنید، سپس همیشه با `make test` قبل از commit تایید کنید.

۲. **پایه باید با `--coverage` ثبت شود.** بدون آن، recorder خود Pest فایل‌های `app/` صفر را ثبت می‌کند (pcov فقط فایل‌هایی را می‌بیند که در پنجرهٔ شروعش compile شده‌اند، و Laravel همه‌چیز را در طول bootstrap compile می‌کند)، پس **هر تغییر green بازپخش می‌شود**.

۳. **TIA باید opt-in باشد.** در databasement عمداً از `make test`، pre-commit hook و CI غایب است.

### ۵.۴ طبقه‌بندی کلی‌تر — چهار ادعای evidence جدا

هرگز این چهار ادعا را با هم مخلوط نکنید (archify):
1. **deterministic** — بررسی‌های artifact + byte identity (`deliver`).
2. **browser** — evidence خودکار از browser از دقیقاً همان artifact، **بدون capture تصویر** (`browser-check`).
3. **capture** — screenshots bound به artifact + contact sheet (`visual-check`).
4. **perceptual** — قضاوت یک انسان یا مدل بینا.

> «رد شدن یکی هرگز به معنای دیگری نیست. هرگز ادعا نکنید که receipt deterministic شامل evidence browser یا perceptual می‌شود.»

یک receipt با چهار artifact check، validation پایه است، نه پذیرش showcase: به **تمام نه check، صفر composition error، صفر warning** نیاز است. `visualReview: "not-requested"` یک وضعیت نهایی معتبر است — gate خودکار نه تصویری ایجاد می‌کند و نه نیازی به reviewer دارد.

---

## بخش ۶: Publication بدون clobber و قابل بازیابی

### ۶.۱ مشکل دقیق

Node.js یک pathname compare-and-swap ندارد که هم یک نام را به طور اتمی جایگزین کند و هم از overwrite کردن یک claimant دیررس خودداری کند. `rename` تنها با overwrite کردن آن claimant شکاف visibility را می‌بندد. پس «جایگزینی اتمی» ممکن نیست — اما **بدون clobber و قابل بازیابی** ممکن است.

### ۶.۲ پروتکل (archify `delivery-contract.md`)

**مرحله ۱ — قبل از staging، snapshot بگیرید:**
directory entry درخواست‌شده، canonical write slot، physical parent، و نوع هدف موجود + device/inode identity + mode.

**مرحله ۲ — بلافاصله قبل از replacement دوباره اعتبارسنجی کنید.**

**مرحله ۳ — توالی publish:**
1. فایل قدیمی bound شده را در یک **backup recovery خصوصی** retain کنید.
2. نام عمومی را از طریق **identity-bound quarantine** حذف کنید.
3. نام عمومی جدید را با یک **exclusive hard link** ایجاد کنید.

**مرحله ۴ — rollback:** یک شکست گرفته شده زمانی rollback می‌شود که slot عمومی و binding recovery همچنان اجازه دهند.

### ۶.۳ بازیابی صریح

وقتی upload بین عملیات‌های namespace قطع می‌شود، مسیر عمومی می‌تواند غایب باشد در حالی که bytes قبلی تأییدشده در یک backup خصوصی مجاور هستند:
```
.archify-remove-<id>/publication-recovery-v1.json
```
```bash
node bin/recover-output.mjs /absolute/path/to/.archify-remove-<id> --json
```
این **بازیابی صریح است، نه یک directory scanner**. قبل از link، helper بررسی می‌کند: parent یا alias تغییر کرده، record یا backup تغییر پیدا کرده/hardlink شده، digest یا inode mismatch، و هر هدف عمومی موجود. این فقط با **no-clobber hard link** بازیابی می‌کند، تا یک claimant جدید به جای overwrite حفظ شود. بازیابی کامل **idempotent** است.

> «record evidence‌ای است که باید به طور مستقل verify شود، نه یک authority برای بازگرداندن bytes خصوصی دلخواه.»

helper فقط record را از فرزند generated ضبط‌شدهٔ والد فیزیکی هدف اصلی با همان directory identity می‌پذیرد. یک process غیرهمکاری‌کننده همچنان می‌تواند پس از آن بررسی‌ها و قبل از `linkSync` مسیرها را عوض کند؛ سپس identity verification پس از link fail-closed می‌شود و evidence recovery را حفظ می‌کند، به جای اینکه ادعای بازیابی کند یا یک نام نامطمئن را delete کند.

### ۶.۴ pending journal به عنوان سد fail-closed

`deliver` journal را قبل از render ایجاد می‌کند و آن را تا بعد از commit جفت HTML+sidecar نگه می‌دارد. journal فقط پس از آن commit حذف می‌شود.

**هر directory entry در مسیر journal یا lock** — شامل فایل غیرقابل خواندن، symlink، یا dangling symlink — باعث می‌شود `check`، `browser-check` و `visual-check` **قبل از** پذیرش HTML حفظشده fail شوند.

journal عمداً یک سد امنیتی است: یک interruption می‌تواند journal را پشت سر بگذارد، و آن journal هرگز نباید قابل اعتماد باشد.

### ۶.۵ جدول تصمیم stateهای lock

`.archify-delivery-lock.json` هر delivery را در یک directory خروجی فیزیکی serial می‌کند — عمداً در برابر case، Unicode-normalization، Windows short-name و aliasهای symlink که می‌توانند ownerهای مستقل یک مکان ایجاد کنند، مقاوم است.

| state lock مشاهده‌شده | نتیجهٔ `deliver` |
|---|---|
| No directory entry | تلاش برای creation انحصاری؛ فقط موفقیت آن ownership می‌دهد |
| Valid schema-v1 lock، PID در حال اجرا یا قابل تشخیص نیست | Exit 1 با `delivery/concurrent-attempt`؛ حفظ همهٔ مسیرهای مشترک |
| Valid schema-v1 lock، PID مشخصاً خارج شده | Exit 1 با `delivery/lock-stale`؛ حفظ lock، artifact، journal و provenance |
| Unreadable، malformed، symlink، dangling symlink، directory | Exit 1 با `delivery/lock-invalid` |
| Capability دیگر با lock یا journal فعلی مطابقت ندارد | Exit 1 با `delivery/ownership-lost`؛ توقف تمام mutation مسیر مشترک |
| Owner نمی‌تواند lock خود را حذف کند | Exit 1 با `delivery/lock-release`؛ حفظ lock |

**قانون:** «یک مدعی رد شده journal ایجاد نمی‌کند یا provenance ناموفق ثبت نمی‌کند.»

بازیابی عمداً صریح و serial است: تمام تلاش‌های delivery را برای آن directory متوقف کنید، تایید کنید هیچ delivery فعالی آن را ندارد و ورودی stale گزارش‌شده جایگزین نشده، فقط lock گزارش‌شده را حذف کنید، سپس `deliver` را دوباره اجرا کنید. **یک artifact، provenance فعلی، یا pending journal را به عنوان بخشی از بازیابی stale-lock حذف نکنید.**

حدس صادقانه: «این ادعا برای درست بودن lock توزیع‌شده روی NFS، SMB یا سایر filesystemهای شبکه‌ای نیست.»

---

## بخش ۷: انضباط evidence ریپو

### ۷.۱ مشکل

یک agent که مستندات یا دیاگرام از یک codebase می‌نویسد، به راحتی می‌تواند یک label، توصیف package یا مقدار config را به یک سرویس یا رفتار مشاهده‌نشده تبدیل کند.

### ۷.۲ پنج قانون (archify `repository-authoring.md`)

**قانون ۱ — identity را freeze کنید:**
```bash
git rev-parse HEAD
git remote get-url origin
git status --short
```
HTTP(S) **userinfo** (نام کاربری، رمز عبور، توکن) را قبل از record استرایپ کنید. transport، port، path و پسوند `.git` را حفظ کنید. **یک origin SSH داخلی را به عنوان HTTPS بازنویس نکنید.** URL بدون credential و revision ۴۰ کاراکتری را در `meta.repository` pin کنید.

> «Evidence در برابر byteهای commit‌شده در revision pin‌شده verify می‌شود، نه ویرایش‌های working tree.»

برای هر مسیر تغییر کرده ارجاع داده‌شده، یک checkout تمیز در آن revision بررسی کنید. **byteهای commit‌نشده را به عنوان evidence برای `HEAD` ارائه ندهید.**

**قانون ۲ — یک slice متصل را trace کنید، نه یک اسکن:**
از project instructions، manifests، entry pointها، registrations و deployment configuration برای locate کردن runtime unitهای کاندید استفاده کنید. سپس imports و call sites را دنبال کنید تا زمانی که responsibility درخواست‌شده به input، output یا side effect واقعی خود برسد.

**قانون ۳ — ownership را در call sites trace کنید:**
بازیگر درخواست‌کننده controller را از runtime اجراکننده و store دریافت‌کننده متمایز کنید. برای یک edge فایل یا database، source باید reader یا writer واقعی آن را مشخص کند.

> «یک جملهٔ responsibility مانند "tasks را نگه می‌دارد" I/O مستقیم را ثابت نمی‌کند.»

تابعی که export یا config شده اما در مسیر عادی هرگز صدا زده نمی‌شود، **یک قابلیت اختیاری است، نه یک edge runtime موردنیاز.** برای یک claim دربارهٔ تغییر state authoritativo یا ownership کنترل، به سایت write یا execution واقعی و شرایطی که آن را مجاز می‌کند trace کنید.

**قانون ۴ — مسیرهای نسبی دقیق و شامل line ranges را ثبت کنید:**
هر component و هر relationship معنادار باید repo-relative path و inclusive line ranges داشته باشد. branchهای واقعی، retryها، fallbackها و error handling را دنبال کنید.

**قانون ۵ — عدم قطعیت را در کنار claim نام‌گذاری کنید:**
> «`writeFile` در اینجا صدا زده می‌شود؛ durability ناشناخته است.»

یک سوال را با خواندن محدودهٔ source مرتبط بعدی حل کنید یا آن را به عنوان یک ناشناخته صریح حفظ کنید. **هرگز یک label، package description یا config value را به یک سرویس یا رفتار مشاهده‌نشده تبدیل نکنید.**

### ۷.۳ قانون مثال‌ها

> «یک مثال structure را نشان می‌دهد؛ هر مقدار معتبری را برشمرد نمی‌کند. IDs، wording، facts و layout تازه بنویسید.»

یک کتابخانه نیازی به nodeهای filesystem ندارد؛ یک showcase تمام‌شده همچنان از قانون first-draft automatic-routing پیروی می‌کند.

---

## بخش ۸: Firewall فراخوانی ابزار

### ۸.۱ سه گیت مستقل — هرگز در یک check ادغام نکنید

**گیت ۱ — beforeToolCall (allowlist):**
```ts
export function makeAllowlistGate(allowed: ReadonlySet<string>) {
  return async (ctx: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> => {
    if (allowed.has(ctx.toolCall.name)) return undefined;
    return { block: true, reason: `Tool "${ctx.toolCall.name}" is not enabled in this build.` };
  };
}
```
capability یک `ReadonlySet<string>` از نام ابزارهاست. **گسترش capability = اضافه کردن یک نام.** یک gate، نه یک workflow hardcode‌شده — و پیام خطا tool-facing است.

**گیت ۲ — execution (timeout race — بخش ۱).**

**گیت ۳ — afterToolCall (quota + isError normalization):**
```ts
const markerIsError =
  typeof context.result === 'object' && context.result !== null &&
  Object.prototype.hasOwnProperty.call(context.result, 'isError') &&
  (context.result as { isError?: unknown }).isError === true;
const baseIsError = context.isError || markerIsError;
```
ابزاری که failure را به عنوان content گزارش می‌کند (با یک `isError: true` marker) همچنان loop quota را terminate می‌کند. این normalization برای خود quota hook نیز استفاده می‌شود:
```ts
if (source.remaining() <= 0) return { terminate: true };
```

### ۸.۲ Approval — role هرگز از خروجی model

**قانون:** role از application invocation می‌آید، **هرگز از خروجی model**.

Approval باید **یک‌بارمصرف و bound به request** باشد:
- باید با call دقیق مطابقت داشته باشد **و** محتوای write دقیق.
- سپس `used = true` می‌شود.
- تکرار همان approval → `ErrConflict`.

**Audit:** envelope `id|role|tool|argument` با pipe-delimited، که control characters و هر فیلد خالی را رد می‌کند. Audit log ۱۰ ورودی را cap می‌کند و پیشوند `id\t` تکراری را رد می‌کند.

**Path policy:** رد کردن leading `.`، هر `\`، هر component غیر-`Normal`، سپس `canonicalize()` هم root و هم target و نیازمند `starts_with(base)`.

### ۸.۳ قانون rule-of-two

هر فراخوانی را روی سه محور طبقه‌بندی کنید:
1. input غیرقابل اعتماد را consume می‌کند؟
2. می‌تواند به data حساس دسترسی داشته باشد؟
3. یک action خارجی با عواقب انجام می‌دهد؟

> **یک گام اتوماتیک تکی نباید هر سه را ترکیب کند.** آن را split کنید، privilege را کاهش دهید، یا از یک confirmation round-trip استفاده کنید.

---

## بخش ۹: Validation boot که سرور را متوقف می‌کند

### ۹.۱ مشکل

Providerهای persistence اغلب **lazy و memoised** هستند. اگر یک مقدار config فقط در آنجا resolve شود، یک deployment misconfigured:
1. boot می‌شود،
2. health check خود را رد می‌کند،
3. سپس **هر** درخواست persistence را — documents و runtime، نه تنها assets — یکی‌یکی fail می‌دهد.

### ۹.۲ راهکار

از `instrumentation.ts` پرتاب کنید (Next آن را یک بار در هر instance server قبل از serv کردن هر چیزی اجرا می‌کند). این چیدمان نقطهٔ کلیدی است: خطا پردازش را از شروع متوقف می‌کند.

### ۹.۳ مثال: quota asset

```ts
const DEFAULT_ASSET_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

export function resolveAssetQuotaBytes(): number | undefined {
  const raw = process.env.ASSET_QUOTA_BYTES?.trim();
  if (!raw) return DEFAULT_ASSET_QUOTA_BYTES;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      `ASSET_QUOTA_BYTES must be a non-negative integer number of bytes, or 0 to opt out ` +
      `of the quota entirely; received ${JSON.stringify(raw)}.`,
    );
  }
  return parsed === 0 ? undefined : parsed;
}
```

**قانون parsing — اول parse کنید، سپس با صفر مقایسه کنید، هرگز text-match نکنید:**
`0`، `00`، `0.0`، `+0` و `0e0` همگی یک intent هستند. اگر به صورت متن مطابقت داده شوند، یک deployment که یکی از spellings غیرعادی را نوشته است به جای یک store نامحدود که درخواست کرده بود، بی‌صدا یک ceiling ۱۰ GiB می‌گیرد.

**قانون خطا — پرتاب کنید، fallback نکنید:**
> «یک warning به علاوه یک default بدترین حالت هر دو است: اپراتوری که `10GB` را تایپ کرده نه ceilingی که نوشته و نه شکستی که متوجه می‌شود را می‌گیرد.»

**قانون پیش‌فرض:** ۱۰ GiB — «سخاوتمندانه برای یک کتابخانهٔ دوره و به اندازهٔ کافی کوچک که متوجه شوید.»

### ۹.۴ enforcement

Quota باید **داخل تراکنش write و تحت یک advisory lock per-principal** اعمال شود، تا uploadهای همزمان نتوانند از آن عبور کنند.

---

## بخش ۱۰: Receipt-driven outputs و vocabulary خطا

### ۱۰.۱ Receipt

هر artifact باید با `schema_version: 1` + input SHA-256 تمام شود. Receiptها re-run و composition cross-tool را **قابل بررسی** می‌کنند به جای trust-based.

sidecar موفق:
- `schemaVersion: 1`
- `status: "current"`
- `command: "deliver"`
- یک `receiptId` یکتا
- `type` دیاگرام
- مسیرهای `input` و `output` absolute
- specification + artifact SHA-256 و byte counts

Checkerها provenance را به byteهای artifactی که در واقع بررسی می‌کنند bind می‌کنند و **آن binding را دوباره قبل از گزارش موفقیت verify می‌کنند** — یک تغییر byte همزمان fail می‌شود. provenance باید یک regular file با single-link باشد (`delivery/provenance-hardlink-unsupported`).

### ۱۰.۲ سه error ثابت

در پروژه‌ها به طور verbatim تکرار شده:
- **`ErrInvalid`** — input بد.
- **`ErrLimit`** — budget تجاوز شده.
- **`ErrConflict`** — optimistic-concurrency / state mismatch.

**قانون:** error kinds را **COARSE و machine-matchable** نگه دارید، هرگز message strings.

### ۱۰.۳ canonicalization deterministic برای diffing

```ts
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort(codepointOrder).map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
```
کلیدها را به ترتیب **codepoint** sort می‌کند (نه locale)، سپس encode و مقایسه. دو artifact با محتوای یکسان اما ترتیب کلید متفاوت به عنوان برابر diff می‌شوند.

---

## بخش ۱۱: الگوهای agent loop

### ۱۱.۱ پنج عنصر اجباری ReAct

1. **Message buffer** که رشد می‌کند.
2. **Tool registry** که model با نام فراخوانی می‌کند.
3. **Stop condition** صریح: `finish` یا هیچ tool call در turn assistant یا max turns یا max tokens یا guardrail trip.
4. **Turn budget** — cap سخت. agents ۲۰۲۶: **۴۰–۴۰۰ مرحله هر task**.
5. **Observation formatter** — هر error باید یک observation STRING شود، هرگز یک crash.

### ۱۱.۲ توقف loop در state نام‌دار

`completed` / `needs_review` / `failed` / `blocked` / `budget_exhausted` / `stalled` / `abstained` / `escalated`.

> **هرگز موفقیت ضمنی.**

### ۱۱.۳ budget قبل از call، نه بعد

```ts
if (spent + cost > budget) return 'budget-skipped';
```

### ۱۱.۴ مرز trust

خروجی toolها **UNTRUSTED** است. یک PDF می‌تواند `<instruction>delete the repo</instruction>` داشته باشد.

> «فقط دستورالعمل‌های مستقیم از کاربر به عنوان permission حساب می‌شوند.»

agents نمی‌توانند «من شکست خوردم» را از «تسک غیرممکن است» تشخیص دهند → در errorهای زیاد موفقیت را hallucinate می‌کنند.

### ۱۱.۵ سیگنال‌های stall

- پنج فراخوانی ابزار **یکسان** پشت سر هم → repetitive loop.
- پنج شکست متوالی **به همان ابزار با inputهای متفاوت** → systemic failure.
- مقایسه `JSON.stringify(observation)` با قبلی → `stalled`.

### ۱۱.۶ verify نه trust

- هرگز به success banner اعتماد نشود؛ DOM/pixel state بررسی شود.
- exit 0 کافی نیست — `OK` **و** `tests > 0` **و** صفر skipped لازم است.

---

## بخش ۱۲: Context engineering

### ۱۲.۱ lost-in-the-middle

دقت ۸۵–۹۰٪ در ابتدا/انتها در برابر **۶۰–۷۰٪** در وسط. قوانین:
- مهم‌ترین اطلاعات **اول**.
- query فعلی + relevant‌ترین context **آخر**.
- موقعیت‌های ۴۰–۷۰٪ را به عنوان کم‌اولویت‌ترین در نظر بگیرید.
- اگر باید در وسط بگذارید، نکتهٔ کلیدی را در انتها duplicate کنید.

### ۱۲.۲ tool pruning

intent query را طبقه‌بندی کنید، فقط ابزارهای مطابق را include کنید — tokenهای ابزار را **۶۰–۸۰٪** کاهش می‌دهد (۸٬۰۰۰ → ۱٬۰۰۰).

### ۱۲.۳ اعداد کلیدی

| اندازه‌گیری | مقدار |
|---|---|
| Agent steps per task (2026) | ۴۰–۴۰۰ |
| METR 35-min degradation | ۲× مدت ≈ ۴× نرخ شکست |
| JSON بدون schema | ۵–۱۵٪ شکست |
| فراخوانی ابزار parallel | ۶۰–۷۰٪ کاهش wall-clock |
| کیفیت description ابزار | ۱۰–۲۰ pts swing (۶۲٪→۸۹٪) |
| Token estimate | `len(text.split()) * 1.3` |

### ۱۲.۴ الگوی description ابزار

**«Use when X. Do not use for Y.»** زیر **۱۰۲۴** کاراکتر. ارزان‌ترین اهرمی که دارید — ۱۰–۲۰ نقطهٔ درصدی در دقت انتخاب ابزار.

---

## بخش ۱۳: workflow-vs-agent — مینیمم را انتخاب کنید

**workflow** = engineer-owned graph. **agent** = model-owned graph.

**درخت تصمیم:**
- مراحل شمارش‌پذیر → prompt chain / routing.
- نیاز به aggregation → parallelization.
- pool specialist متغیر → orchestrator-workers.
- نیاز به refinement تکراری → evaluator-optimizer.
- تعداد مراحل به نتایج میانی بستگی دارد → **agent loop**.

**rejectهای سخت:** framework برای یک ۳-step prompt chain (over-engineering). صدا زدن یک ۳-worker orchestrator "multi-agent". evaluator-optimizer بدون stop condition.

**workflows برنده‌اند وقتی:** taskهای قابل پیش‌بینی، cost-bound، compliance-bound.
**agents برنده‌اند وقتی:** research open-ended، طول task متغیر، domain جدید.

---

## بخش ۱۴: memory — سه فروشگاه

| فروشگاه | برای |
|---|---|
| **vector** | شباهت معنایی |
| **KV** | fast fact lookup O(1) |
| **graph** | entity-relationship reasoning |

**قانون:** روی `add`، facts را به **هر سه** بنویسید. روی `search`، top-k هر کدام را fuse کنید.

Fusion scoring = weighted sum **relevance + importance + recency**.

> «یک memory تک‌فروشگاهی برای دو از سه کلاس query همیشه غلط است.»

سه failure mode که پنجره‌های بزرگتر آن را حل نمی‌کنند:
- **overflow** — از پنجره رد شدید، گذشته gone.
- **dilution** — context نامرتبط attention را رقیق می‌کند.
- **persistence** — session جدید = پنجره خالی.

---

## نحوهٔ استفادهٔ این فایل در پایش

| مشکل | بخش |
|---|---|
| **M14-A01 / tenant isolation در sync و report_logs** | ۳ (دفاع زیر router) + ۴ (الگوی تست). defect قرارداد status (fieldGate rejection که HTTP ۲۰۰ به جای ۴۰۳ برمی‌گرداند) دقیقاً کلاس باگی است که بخش ۳ از آن جلوگیری می‌کند. |
| **stall زدکد** | ۱ (timeout race) + ۲ (lease protocol) |
| **false-green در gates تست** | ۵ (TIA) + ۵.۴ (چهار ادعای evidence) |
| **هر گزارش verification** | ۷ (repo evidence) + ۱۰ (receipts) |
| **هر claim** | باید به tool output واقعی قابل trace باشد. ریپو برنده است — فایل و line را cite کنید و هر عدم قطعیت را نام‌گذاری کنید. |

**قوانین دائمی:**
- Historical reports منبع truth نیستند؛ فقط evidence تاریخی‌اند.
- Current HEAD تنها مرجع وضعیت جاری است.
- هرگز کاری را سبز نکنید تا یک gate رد شود.
- NOT-RUN / UNKNOWN را صادقانه گزارش کنید به جای ادعای موفقیت اثبات‌نشده.
