/* ═══════════════════════════════════════════════════════════════════
   server/leader-election.js — انتخاب رهبر (leader election) با قرارداد lease
   ───────────────────────────────────────────────────────────────────
   A-37: برای استقرارِ چندنمونه‌ایِ M15، کارهای تک‌اجرا (singleton jobs)
   باید فقط در یک نمونه اجرا شوند. انتخابات = اجارهٔ اتمیک (lease):

     startElection({ role, leaseSeconds })
       → SET NX leader:<role> = <instanceId> با TTL — اولین نامزدِ رسیده
         برندهٔ «جمع رأی» است (اتمیک؛ زیرِ burst هم یک برنده).
     isLeader(role)       → true فقط اگر اجاره‌نامه فعلاً از آنِ ماست.
     renewLease(...)      → تمدید فقط برای رهبرِ فعلی (اگر اجاره منقضی و
                            دیگری برنده شده، تمدید رد می‌شود).
     resign(role)         → استعفای آگاهانه: کلید فقط اگر از آنِ ماست حذف
                            می‌شود؛ انتخاباتِ بعدی فوراً رهبرِ تازه می‌دهد.
     re-election پس از خرابی: رهبرِ مرده استعفا نمی‌کند؛ TTL اجاره‌نامه
       تمام می‌شود و نامزدِ بعدی startElection را می‌برد — بدون هیچ
       هماهنگیِ خارجی.

   Fencing: هیچ تصمیمِ پرهزینه‌ای فقط با isLeader گرفته نمی‌شود؛ کارِ
   singleton پیش از هر tick بایدLeadership را دوباره بسنجد (قراردادِ
   مصرف‌کننده) تا پنجرهٔ اجارهٔ منقضی‌شده آسیبی نزند.
   خطای Redis: همان قرارداد B5 (configured = fail-closed؛ فقط devِ بی‌URL =
   fallback حافظه‌ای).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const os = require('os');
const redis = require('./redis');

const INSTANCE_ID = process.env.PAYESH_INSTANCE_ID || (os.hostname() + ':' + process.pid);

function leaseKey(role) { return 'leader:' + String(role); }

function assertConfigured() {
  const redisConfigured = !!String(process.env.REDIS_URL || '').trim() || !!String(process.env.DATABASE_URL || '').trim();
  if (redisConfigured
      && typeof redis.isConfigured === 'function' && redis.isConfigured()
      && typeof redis.isAlive === 'function' && !redis.isAlive()) {
    const err = new Error('REDIS_UNAVAILABLE: leader election unavailable — failing closed');
    err.code = 'REDIS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
  return redisConfigured;
}

/**
 * Enter (or re-enter) the election for `role`. Atomic single-winner vote.
 * Returns { isLeader, leader, leaseSeconds }.
 */
async function startElection({ role, leaseSeconds = 30 }) {
  assertConfigured();
  const ttl = Math.max(1, Math.trunc(Number(leaseSeconds) || 30));
  const key = leaseKey(role);
  const won = await redis.setNX(key, INSTANCE_ID, ttl);
  if (won) return { isLeader: true, leader: INSTANCE_ID, leaseSeconds: ttl };
  const leader = await redis.get(key);
  return { isLeader: false, leader: leader || null, leaseSeconds: ttl };
}

/**
 * Am I the current leader for `role`? (Cheap per-tick fencing check.)
 */
async function isLeader(role) {
  assertConfigured();
  const cur = await redis.get(leaseKey(role));
  return cur === INSTANCE_ID;
}

/**
 * Renew the lease — succeeds only while the lease is still ours. If the
 * lease expired and another instance won, renewal is refused (the caller
 * must re-elect or stand down).
 */
async function renewLease({ role, leaseSeconds = 30 }) {
  assertConfigured();
  const ttl = Math.max(1, Math.trunc(Number(leaseSeconds) || 30));
  const key = leaseKey(role);
  const cur = await redis.get(key);
  if (cur !== INSTANCE_ID) return { renewed: false, leader: cur || null };
  await redis.expire(key, ttl);
  return { renewed: true, leader: INSTANCE_ID, leaseSeconds: ttl };
}

/**
 * Deliberate resignation: delete the lease only if it is ours. The next
 * election promotes a new leader immediately.
 */
async function resign(role) {
  assertConfigured();
  const key = leaseKey(role);
  const cur = await redis.get(key);
  if (cur !== INSTANCE_ID) return { resigned: false, leader: cur || null };
  await redis.del(key);
  return { resigned: true, leader: null };
}

module.exports = { INSTANCE_ID, leaseKey, startElection, isLeader, renewLease, resign };
