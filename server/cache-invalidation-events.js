/* ═════════════════════════════════════════════════════════════════
   server/cache-invalidation-events.js — N-36 / M15-05
   ─────────────────────────────────────────────────────────────────
   سازندهٔ رویدادهایِ ابطالِ دوام‌دار برای صندوقِ برون‌مرزی.

   این ماژول فقط event می‌سازد و به outbox می‌سپارد — منطقِ ابطال
   (del/epoch/publish) در server/cache.js است و کارگر در server/worker.js
   آن را اجرا می‌کند. جداسازیِ این لایه برای این است که هر producer
   (sync، REST، delete) یک شکلِ واحد داشته باشد و scope هرگز از روی
   عدمِ حضورِ یک فیلد استنتاج نشود (fail-closed).

   negative-proof: CACHE_DURABLE_VULN=1 کلِ append را skip می‌کند —
   دنیایِ پیشین (فیگِ Pub/Sub-only). هم‌چنین PAYESH_CACHE_DURABLE_INVALIDATION=off
   مسیرِ دوام‌دار را به‌طور کامل (producer + worker) خاموش می‌کند.
   ═════════════════════════════════════════════════════════════════ */
'use strict';

const metrics = require('./metrics');

/**
 * Ref دیررس به outbox. index.js پس از ساختِ outbox آن را تزریق می‌کند
 * (همان الگویی که server/cache.js به‌صورت require مستقیم در دسترس است).
 * مسیرهای REST بدونِ تغییرِ signature سازندهٔ خودشان از این ref استفاده
 * می‌کنند.
 */
let _outboxRef = null;
function setOutbox(o) { _outboxRef = o; }
function getOutbox() { return _outboxRef; }

/**
 * помощникِ مسیرهای REST: یک event (یا دو event برای users) درست می‌کند و
 * در همان تراکنشِ persistOpsBatch می‌نویسد. اگر مسیرِ دوام‌دار خاموش است
 * یا outbox نیست، no-op برمی‌گردد.
 * @param {object} opts — { collection, schoolId?, userId?, actorId?, client, origin }
 */
async function appendRoute(opts) {
  if (!durableEnabled()) return null;
  const outbox = opts && opts.outbox ? opts.outbox : _outboxRef;
  if (!outbox) return null;
  const client = opts && opts.client ? opts.client : undefined;
  const actorId = opts && opts.actorId;
  const version = opts && opts.version;
  const origin = (opts && opts.origin) || 'rest';
  const wrote = [];
  if (opts && opts.userId != null && Number.isFinite(Number(opts.userId))) {
    wrote.push(await appendDurable(outbox, userChanged(opts.userId, actorId, version, origin), client));
  }
  if (opts && opts.schoolId != null && Number.isFinite(Number(opts.schoolId))) {
    wrote.push(await appendDurable(outbox, schoolChanged(opts.collection, opts.schoolId, actorId, version, origin), client));
  } else if (opts && opts.collection && !opts.userId) {
    /* schoolId نیست و user هم نیست → ابطالِ سراسریِ آن کالکشن */
    wrote.push(await appendDurable(outbox, collectionChanged(opts.collection, actorId, version, origin), client));
  }
  return wrote.filter(Boolean);
}

/** مسیرِ دوام‌دار فعال است (مگر اینکه صریحاً خاموش شده باشد). */
function durableEnabled() {
  return process.env.CACHE_DURABLE_VULN !== '1'
    && process.env.PAYESH_CACHE_DURABLE_INVALIDATION !== 'off';
}

/** رویدادِ ابطالِ یک کاربر — scope:user. record_id = شناسهٔ کاربر. */
function userChanged(uid, actorId, version, origin) {
  return {
    type: 'cache.user_changed',
    collection: 'users',
    record_id: Number(uid),
    actor_id: actorId != null ? Number(actorId) : null,
    version: Number(version) || null,
    payload: { scope: 'user', user_id: Number(uid), origin: origin || 'sync' }
  };
}

/** رویدادِ ابطالِ یک مدرسه — scope:school. record_id = شناسهٔ مدرسه. */
function schoolChanged(collection, schoolId, actorId, version, origin) {
  if (schoolId == null || !Number.isFinite(Number(schoolId))) return null;
  return {
    type: 'cache.school_changed',
    collection: String(collection || ''),
    record_id: Number(schoolId),
    actor_id: actorId != null ? Number(actorId) : null,
    version: Number(version) || null,
    payload: { scope: 'school', school_id: Number(schoolId), origin: origin || 'sync' }
  };
}

/** رویدادِ ابطالِ سراسری — scope:global. */
function collectionChanged(collection, actorId, version, origin) {
  return {
    type: 'cache.collection_changed',
    collection: String(collection || ''),
    record_id: null,
    actor_id: actorId != null ? Number(actorId) : null,
    version: Number(version) || null,
    payload: { scope: 'global', origin: origin || 'sync' }
  };
}

/**
 * از invQueueِ sync یک رویدادِ درست می‌سازد: school_id → scope:school،
 * نبودِ آن → scope:global.
 * @param {[string, number|null]} invq — [collection, schoolId]
 */
function fromInvQueue(invq, actorId, version, origin) {
  if (!Array.isArray(invq)) return null;
  const collection = invq[0];
  const sid = invq[1];
  if (sid != null && Number.isFinite(Number(sid))) {
    return schoolChanged(collection, sid, actorId, version, origin);
  }
  return collectionChanged(collection, actorId, version, origin);
}

/**
 * یک رویداد را به outbox می‌سپارد — داخلِ تراکنشِ فراخوان (client داده
 * شده) یا best-effort. خطا پرتاب می‌شود تا تراکنشِ بیرونی رول‌بک شود
 * (commit بدونِ رویداد ممکن نیست).
 * @returns {Promise<object|null>} رویدادِ ثبت‌شده، یا null اگر مسیر خاموش است
 */
async function appendDurable(outbox, evt, client) {
  if (!durableEnabled() || !outbox || !evt) return null;
  const r = await outbox.append(evt, client || undefined);
  metrics.inc('payesh_cache_outbox_events_produced_total', { scope: String((evt.payload && evt.payload.scope) || 'unknown') });
  return r;
}

/**
 * کلِ invQueue + userInvQueueِ sync را به یک لیستِ رویداد تبدیل می‌کند.
 * invQueue هم‌اکنون بر اساس (collection, school_id) تجمیع شده است و
 * userInvQueue یک Set از شناسه‌های کاربر است — پس تعداد رویدادها
 * O(scopeهای متمایز) است نه O(opها).
 * @param {Array} invQueue — آرایهٔ [collection, schoolId]
 * @param {Set} userInvQueue — Set از شناسه‌های کاربر
 * @returns {Array} رویدادها (ممکن است خالی)
 */
function fromInvQueueList(invQueue, userInvQueue, actorId, version, origin) {
  const out = [];
  if (Array.isArray(invQueue)) {
    for (const invq of invQueue) {
      const ev = fromInvQueue(invq, actorId, version, origin);
      if (ev) out.push(ev);
    }
  }
  if (userInvQueue && typeof userInvQueue.forEach === 'function') {
    for (const uid of userInvQueue) {
      if (uid != null && Number.isFinite(Number(uid))) out.push(userChanged(uid, actorId, version, origin));
    }
  }
  return out;
}

module.exports = {
  durableEnabled,
  setOutbox,
  getOutbox,
  appendRoute,
  userChanged,
  schoolChanged,
  collectionChanged,
  fromInvQueue,
  fromInvQueueList,
  appendDurable
};
