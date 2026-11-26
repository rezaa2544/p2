/* ═══════════════════════════════════════════════════════════════════
   server/redis-roles.js — رجیستری نقش‌های Redis (M15-08 لایهٔ مخزن)
   -------------------------------------------------------------------
   مأموریت: «M15-08 — Redis role separation» (CURRENT_WORK_EXECUTION_PLAN §M15-08؛
   ledger معماری = تفکیک نقش‌ها؛ نباید با ردیف ۲۷ صف Notion «M15-08 مانیتورینگ» قاطی شود).

   چه چیزی اینجاست:
   - FAMILIES: فهرستِ جامعِ خانواده‌های کلیدِ Redis در مخزن — هر خانواده: پیشوندِ
     canonical، نقش، ماژولِ مالک، و یادداشت. این فهرست «قراردادِ» پیشوندهاست؛
     سوئیتِ گیت (tests/m15-08-redis-roles.js) انحراف از آن را قرمز می‌کند.
   - ROLES: شش نقشِ مأموریت (CACHE / RATE-LIMIT / SESSION-REVOCATION-OTP /
     LOCK-IDEMPOTENCY / PUBSUB / COUNTER) با کلاسِ تخلیه و قراردادِ تنزل.
   - EV_POLICY: رأیِ نهاییِ تعارض V2-F07 (infra «noeviction» vs سند کش
     «allkeys-lru») — رأی: noeviction روی نمونهٔ مشترک؛ lru فقط برای نمونهٔ
     اختصاصیِ CACHE در معماریِ نقش‌جداشدهٔ آینده (capacity-gated به M15-02/18).
     دلیل: sessver/lock/idempotency بدونِ TTL یا با معنای دوام‌اند؛ allkeys-lru
     می‌توانست نشانِ ابطال را بیرون بپراند = fail-open امنیتی؛ volatile-lru هم
     فقط وقتی امن است که «همهٔ» کلیدهای دوامی TTL داشته باشند که ندارند.

   آگاهانه انجام نشده (قلمروِ صادقانه):
   - تغییرِ نامِ هیچ کلیدِ زنده‌ای (حتی rate:) در این لایه رخ نمی‌دهد — تغییرِ
     پیشوندِ روبه‌روی deploy غلتان، پنجرهٔ ناهمگامی بین نمونه‌ها می‌سازد (برای
     revoked یعنی ردِ ابطال = نقصِ امنیتی). اینجا «یکسان‌سازی» به معنای ثبتِ
     یک قراردادِ واحد + گیتِ ضد-انحراف است؛ تغییرِ نامِ خانواده‌ها به‌عنوان
     مهاجرتِ دو-نویسه/دو-خوان جداگانه (فقط برای خانواده‌های بی‌خطر) در دورهای
     بعدی و با شواهد انجام می‌شود.
   - تفکیکِ زیرساختیِ نمونه‌ها (failure domain جدا به‌ازای هر نقش + مانورِ
     خرابیِ هر نقش) به شواهد ظرفیت (M15-02/18) و E4 گره خورده — BLOCKED-OWNER.

   این ماژول خالص است (بدون require از redis.js و بدون اتصال) تا در تست و
   ابزارهای audit هم قابل استفاده باشد.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* نقش‌ها — کلاسِ تخلیه: 'volatile' (قابلِ تخلیه در نمونهٔ اختصاصیِ آیندهٔ CACHE)
   یا 'durable' (هرگز نباید تخلیه‌شوندنی باشد؛ روی نمونهٔ مشترک = noeviction). */
const ROLES = {
  cache: {
    fa: 'CACHE — کشِ خواندنی (TTLدار، قابلِ تخلیه، تنزل = fail-open به منبعِ اصلی)',
    evictionClass: 'volatile',
    degradation: 'fail-open: خطای کش هرگز پاسخِ امنیتی/دوام را عوض نمی‌کند — منبع اصلی خوانده می‌شود'
  },
  ratelimit: {
    fa: 'RATE-LIMIT — شمارنده‌های نرخ (TTLدار؛ فقدانِ موقت = فقط یک پنجرهٔ شل‌تر؛ لبهٔ بیرونی کنترلِ سخت را نگه می‌دارد)',
    evictionClass: 'durable',
    degradation: 'fail-closed در تولید وقتی Redis پیکربندی‌شده ولی از دسترس است (B5/BUG-2)؛ فقدانِ داده = حداکثر یک پنجره'
  },
  session: {
    fa: 'SESSION/REVOCATION/OTP — ابطال نشست، نسخهٔ نشست، OTP، شمارندهٔ enum (دوامِ بحرانی امنیتی)',
    evictionClass: 'durable',
    degradation: 'خواندنِ ابطال = fail-closed (A-22)؛ نوشتن = صفِ تلاشِ مجدد (pendingRevocations)؛ sessver عمداً بی‌TTL'
  },
  lock: {
    fa: 'LOCK/IDEMPOTENCY — قفل‌های اتمیک و شناسه‌های تکرار (درستیِ exactly-once)',
    evictionClass: 'durable',
    degradation: 'تخلیه/فقدان = ریسکِ پردازشِ دوباره یا بن‌بستِ قفل — هرگز قابلِ تخلیه نیست'
  },
  pubsub: {
    fa: 'PUBSUB — کانال‌های انتشار/اشتراک (ابطال کش، فن‌اوت)؛ بدونِ keyspace دوام',
    evictionClass: 'volatile',
    degradation: 'پیامِ گم‌شده = عقب‌افتادگیِ موقتِ ابطال؛ مسیرِ دوام‌دارِ N-36 (outbox replicate) جبران می‌کند'
  },
  counter: {
    fa: 'COUNTER — شمارنده‌های ترتیب/توالی (outbox seq)؛ یکتاییِ مطلق',
    evictionClass: 'durable',
    degradation: 'فقدان = ریسکِ دوگانگیِ شناسه — هرگز قابلِ تخلیه نیست'
  }
};

/* خانواده‌های کلید — پیشوند دقیقاً همان رشته‌ای که در کدِ زنده ساخته می‌شود.
   «payesh-fenc:v1:» کلیدِ Redis نیست (قالبِ پاکتِ field-crypto در PG است) — ثبت نشده. */
const FAMILIES = [
  /* ── cache (volatile) ── */
  { id: 'cache-core', prefix: 'payesh:cache:',       role: 'cache',    canonical: true, owner: 'server/cache.js', note: 'bootstrap/epoch/school — ابطال با epoch و pubsub (W11-2)' },
  { id: 'cache-tenant', prefix: 'payesh:t:',         role: 'cache',    owner: 'server/infrastructure/scalability-foundation.js', note: 'کشِ tenant (TENANT_CACHE_PREFIX)' },
  { id: 'cache-region', prefix: 'payesh:r:',         role: 'cache',    owner: 'server/infrastructure/geographic-isolation.js', note: 'کشِ منطقه‌ای' },
  { id: 'cache-sovereign', prefix: 'payesh:sov:',    role: 'cache',    owner: 'server/infrastructure/data-sovereignty.js', note: 'کشِ حاکمیت داده' },
  /* ── ratelimit (durable + TTL) ── */
  { id: 'ratelimit-live', prefix: 'rate:',           role: 'ratelimit', canonical: true, owner: 'server/rate-limit.js', note: 'شمارنده‌های نرخ زنده (fixed/sliding) — در آستانهٔ مهاجرتِ اختیاری به payesh:rl:' },
  { id: 'ratelimit-legacy', prefix: 'payesh:rl:',    role: 'ratelimit', owner: 'server/cache.js', note: 'سکیمهٔ قدیمیِ نرخ (کد مرده طبق BUG_HUNT_REPORT §۳ — صدازنندهٔ اجرایی ندارد)' },
  /* ── session (durable) ── */
  { id: 'revocation-deny', prefix: 'revoked:',       role: 'session',  canonical: true, owner: 'server/revocation.js + server/auth.js', note: 'denylist نشست (TTL=عمر توکن) — ممنوعِ تغییرِ نام بدونِ مهاجرتِ دو-نویسه' },
  { id: 'session-version', prefix: 'sessver:',       role: 'session',  owner: 'server/revocation.js', note: 'نسخهٔ نشست برای revoke-all — عمداً بی‌TTL' },
  { id: 'otp-state', prefix: 'payesh:otp:state',     role: 'session',  owner: 'server/otp-store.js', note: 'کلیدِ یگانهٔ OTP' },
  { id: 'enum-counter', prefix: 'payesh:enum:',      role: 'session',  owner: 'server/index.js', note: 'شمارندهٔ enum verifier' },
  /* ── lock (durable) ── */
  { id: 'lock-atomic', prefix: 'payesh:lock:',       role: 'lock',     canonical: true, owner: 'server/cache.js', note: 'قفل اتمیک setNX/compareAndDelete' },
  { id: 'idempotency-sync', prefix: 'payesh:idempotency:', role: 'lock', owner: 'server/cache.js', note: 'شناسهٔ تکرارِ sync' },
  { id: 'idempotency-event', prefix: 'idem:',        role: 'lock',     owner: 'server/infrastructure/event-processing-layer.js', note: 'کلید idempotency رویداد' },
  /* ── pubsub ── */
  { id: 'pubsub-inval', prefix: 'payesh:pubsub:',    role: 'pubsub',   canonical: true, owner: 'server/cache.js', note: 'کانالِ ابطال INVAL_CHANNEL' },
  /* ── counter ── */
  { id: 'outbox-seq', prefix: 'payesh:outbox:seq',   role: 'counter',  canonical: true, owner: 'server/outbox.js', note: 'توالی outbox' }
];

/* رأیِ ثبت‌شدهٔ V2-F07 — تعارض noeviction/allkeys-lru */
const EV_POLICY = {
  sharedInstance: 'noeviction',
  dedicatedCacheInstance: 'volatile-lru (اختیاری: allkeys-lru) — فقط پس از تفکیکِ نقش‌ها (capacity-gated: M15-02/18 + E4)',
  rationale: 'sessver/lock/idempotency بدونِ TTL یا دوام‌محورند؛ تخلیهٔ نشانِ ابطال = fail-open امنیتی؛ volatile-lru تنها با «همه-TTL» دوام امن می‌شود که برقرار نیست. infra/redis/docker-compose.sentinel.yml (noeviction 512mb) مرجع است.',
  sourceOfTruth: 'infra/redis/docker-compose.sentinel.yml --maxmemory-policy noeviction',
  resolved: 'V2-F07'
};


function roleOf(key) {
  const k = String(key || '');
  const fam = FAMILIES.find(f => k.startsWith(f.prefix));
  return fam ? fam.role : null;
}

function familyOf(key) {
  const k = String(key || '');
  return FAMILIES.find(f => k.startsWith(f.prefix)) || null;
}

/* سازندهٔ کلیدِ قراردادی — از خانوادهٔ canonicalِ هر نقش استفاده می‌کند.
   خانواده‌های غیر-canonical (سکیمه‌های قدیمی/فرعی) فقط ثبت‌اند، تولید از این‌جا نیست. */
function key(role, ...parts) {
  if (!ROLES[role]) throw new Error('redis-roles: نقش ناشناخته: ' + role);
  const fam = FAMILIES.find(f => f.role === role && f.canonical);
  if (!fam) throw new Error('redis-roles: خانوادهٔ canonical برای نقش ' + role + ' ثبت نشده');
  return fam.prefix + parts.join(':');
}

/* پیشوندِ خانواده بر اساس id پایدار — منبعِ واحدِ حقیقت برای ماژول‌های زنده
   (مثلاً revocation.js: familyPrefix('revocation-deny'))؛ مقدار دقیقاً همان
   پیشوندِ تاریخی است — هیچ تغییرِ نامی رخ نمی‌دهد. */
function familyPrefix(id) {
  const fam = FAMILIES.find(f => f.id === id);
  if (!fam) throw new Error('redis-roles: خانوادهٔ ناشناخته: ' + id);
  return fam.prefix;
}

/* سدِ ضد-کلیدِ سرگردان — در سوئیتِ گیت و ابزارِ redis-audit استفاده می‌شود */
function assertKnownKey(key) {
  const fam = familyOf(key);
  if (!fam) {
    const err = new Error('redis-roles: کلیدِ خارج از قرارداد: ' + String(key));
    err.code = 'REDIS_ROGUE_KEY';
    throw err;
  }
  return fam;
}

module.exports = { ROLES, FAMILIES, EV_POLICY, roleOf, familyOf, familyPrefix, key, assertKnownKey };
