/* ═══════════════════════════════════════════════════════════════════
   server/revocation.js — Session Revocation Denylist (کنترلِ پیشگیرانه P4)
   ───────────────────────────────────────────────────────────────────
   چرا این ماژول وجود دارد؟
     ابطالِ نشست از قبل بود (`store.__revoked_jti`) و درست هم کار می‌کرد —
     ولی **فقط در همان نمونه**. در استقرارِ چندنمونه‌ای (معماریِ مصوب:
     docs/MULTI_INSTANCE_READINESS.md بند ۲.۱) کاربری که از نمونه‌ی A
     خارج شده، روی نمونه‌ی B تا ۸ ساعت زنده می‌ماند. این ماژول همان
     تصمیم را **توزیع‌شده** می‌کند، بی‌آن‌که رفتارِ تک‌نمونه‌ای تغییر کند.

   سه لایه:
     L1 — store.__revoked_jti (درون‌پروسه، پایدار در فایلِ store)
          منبعِ حقیقت برایِ همان نمونه؛ همزمان (sync) و بدونِ I/O.
          نگه داشتنِ این لایه یعنی: هیچ رفتاری از امروز عوض نمی‌شود
          (تست‌های server1/S11، server14-gc و admin/restore سر جایند).
     L2 — Redis: payesh:revoked:<jti> = '1' با EX = عمرِ نشست (۸h)
          تا نمونه‌ای که پیام را از دست داده هم بتواند بپرسد.
     L3 — Pub/Sub روی payesh:pubsub:revoke
          پخشِ فوری: نمونه‌های دیگر همان لحظه jti را محلی علامت می‌زنند
          (بدونِ نیاز به SCAN/KEYS که در redis.js موجود نیست).

   نکتهٔ مهم دربارهٔ واسطِ Redis:
     کدِ مرجعِ درخواست از `redis.setex` و `redis.smembers` استفاده کرده بود؛
     **هیچ‌کدام در server/redis.js وجود ندارند** (نه در این شاخه، نه در main)
     ⇒ همان کد با TypeError می‌شکند. اینجا فقط از get/set/del/publish/subscribe
     استفاده شده (مجموعه با آرایه‌ی JSON شبیه‌سازی شده) تا روی هر دو نسخه
     کار کند و نیازی به متدِ تازه در redis.js نباشد — به‌جز `getStrict`
     که برایِ «خطا را دیدن» لازم است (پایین توضیح داده شده).

   اجرا: نیازی به راه‌اندازیِ جدا نیست؛ server/index.js صدایش می‌زند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DEFAULT_TTL_S = 28800;              /* ۸h — برابر SESSION_TTL_S (قرارداد §2.1) */
const CHANNEL       = 'payesh:pubsub:revoke';
const K_REVOKED     = (jti) => 'payesh:revoked:' + jti;
const K_USESSIONS   = (uid) => 'payesh:usessions:' + uid;
const MAX_TRACKED_PER_USER = 100;         /* سقفِ نشست‌هایِ ردیابی‌شده برای هر کاربر */
const NEG_CACHE_MS  = (() => {
  const n = Number(process.env.PAYESH_REVOKE_NEG_CACHE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
})(); /* پاسخِ منفیِ L2 را تا ۵ ثانیه به‌خاطر می‌سپاریم تا هر درخواست
         یک round-tripِ Redis اضافه نکند؛ پخشِ فوری با Pub/Sub است،
         این فقط «پشتبان» برایِ پیام‌هایِ از‌دست‌رفته است. */

function createRevocation(opts){
  const o = opts || {};
  const store   = o.store || {};
  const redis   = o.redis || require('./redis');   /* تزریق‌پذیر — برای آزمون */
  const ttlS    = Number(o.ttlS) > 0 ? Number(o.ttlS) : DEFAULT_TTL_S;
  const channel = o.channel || CHANNEL;
  const markDirty = (typeof o.markDirty === 'function') ? o.markDirty : function(){};
  const audit   = (typeof o.audit === 'function') ? o.audit : function(){};
  const now     = () => (o.now ? o.now() : Date.now());

  /* L1: همان نقشه‌ی قدیمی — نگه داشته شد تا GC، persist و restore
     (admin.js که آن را پیش/پس از swap حفظ می‌کند) بی‌تغییر بماند. */
  if(!store.__revoked_jti) store.__revoked_jti = {};

  /* نشست‌هایِ ردیابی‌شده‌ی هر کاربر (فقط حافظه — بازساخت‌پذیر است) */
  const byUser = new Map();               /* uid -> [{jti, at}] */

  /* پاسخ‌هایِ منفیِ L2 (jti -> انقضا) */
  const negCache = new Map();

  const stats = { revoked: 0, revokedAll: 0, tracked: 0, remoteHits: 0,
                  remoteMisses: 0, unknown: 0, writeErrors: 0, published: 0, received: 0 };

  let subscribed = false;

  /* ── L1 helpers ────────────────────────────────────────────────── */
  function markLocal(jti, at){
    if(typeof jti !== 'string' || !jti) return false;
    if(store.__revoked_jti[jti]) return false;
    store.__revoked_jti[jti] = at || now();
    negCache.delete(jti);
    markDirty();
    return true;
  }

  /* ── Pub/Sub ───────────────────────────────────────────────────── */
  async function init(){
    try{
      await redis.subscribe(channel, (msg) => {
        try{
          const ev = JSON.parse(String(msg));
          if(ev && typeof ev.jti === 'string'){
            stats.received++;
            markLocal(ev.jti, ev.at);
          }
        }catch(e){}
      });
      subscribed = true;
    }catch(e){ /* اشتراک اختیاری است — بدون آن هم L2 پرسیده می‌شود */ }
    return { ok: true, driver: (redis.isRedis && redis.isRedis()) ? 'redis' : 'memory', ttlS };
  }

  /* ── نوشتن در L2/L3 — هرگز اجازه نداریم جلویِ پاسخ را بگیریم ────
     ابطالِ محلی (L1) که انجام شد، نشست مرده است؛ خطایِ Redis نباید
     باعث شود خروج (logout) با خطا روبه‌رو شود. فقط شمرده می‌شود. */
  async function writeRemote(jti, at, reason){
    try{
      await redis.set(K_REVOKED(jti), '1', 'EX', ttlS);
    }catch(e){ stats.writeErrors++; return false; }
    try{
      await redis.publish(channel, JSON.stringify({ jti: jti, at: at, reason: reason || 'revoke' }));
      stats.published++;
    }catch(e){ stats.writeErrors++; }
    return true;
  }

  /* ── API: ابطالِ یک نشست ───────────────────────────────────────── */
  async function revokeSession(jti, reason){
    if(typeof jti !== 'string' || !jti) return false;
    const at = now();
    const fresh = markLocal(jti, at);
    if(fresh) stats.revoked++;
    await writeRemote(jti, at, reason);
    return true;
  }

  /* ── ردیابی: kدام نشست‌ها برای کدام کاربر صادر شده‌اند؟ ────────
     بدونِ این ثبت، «ابطالِ همه‌ی نشست‌های یک کاربر» ناممکن است
     (jti در هیچ جا به کاربر وصل نبود — کدِ مرجع فرض کرده بود مجموعه‌ای
     هست که هیچ‌کس پُرش نمی‌کند ⇒ smembers همیشه خالی ⇒ ابطالِ خاموش). */
  function trackSession(userId, jti){
    const uid = Number(userId);
    if(!Number.isFinite(uid) || typeof jti !== 'string' || !jti) return false;
    let list = byUser.get(uid);
    if(!list){ list = []; byUser.set(uid, list); }
    list.push({ jti: jti, at: now() });
    /* سقف: ورودِ پیاپی نباید حافظه را بی‌پایان بالا ببرد — قدیمی‌ترین‌ها
       کنار می‌روند (نشستِ واقعی هنوز معتبر است، فقط در «ابطالِ همه»
       شرکت نمی‌کند؛ خودش با انقضایِ توکن از بین می‌رود). */
    while(list.length > MAX_TRACKED_PER_USER) list.shift();
    stats.tracked++;
    /* L2: مجموعه به شکلِ آرایه‌ی JSON (redis.js مجموعه ندارد) */
    try{ redis.set(K_USESSIONS(uid), JSON.stringify(list.slice(-MAX_TRACKED_PER_USER)), 'EX', ttlS); }
    catch(e){}
    return true;
  }

  function sessionsOf(userId){
    const l = byUser.get(Number(userId)) || [];
    return l.map(x => x.jti);
  }

  /* ── API: ابطالِ همه‌ی نشست‌های یک کاربر ───────────────────────── */
  async function revokeAllUserSessions(userId, reason){
    const uid = Number(userId);
    let list = byUser.get(uid) || [];

    /* اگر این نمونه چیزی از کاربر نمی‌داند (مثلاً تازه بالا آمده)،
       از L2 بخوان — وگرنه «ابطالِ همه» بی‌سروصدا هیچ کاری نمی‌کند. */
    if(!list.length){
      try{
        const raw = await redis.get(K_USESSIONS(uid));
        if(raw){
          const arr = JSON.parse(raw);
          if(Array.isArray(arr)) list = arr.filter(x => x && typeof x.jti === 'string');
        }
      }catch(e){}
    }

    for(const it of list) await revokeSession(it.jti, reason || 'revoke_all');
    byUser.delete(uid);
    try{ await redis.del(K_USESSIONS(uid)); }catch(e){}
    stats.revokedAll++;
    return list.length;
  }

  /* ── خواندن: همزمان (L1) و ناهمزمان (L1 + L2) ─────────────────── */
  function isRevoked(jti){
    if(typeof jti !== 'string' || !jti) return true;   /* بی‌نشانه = مرده */
    return !!store.__revoked_jti[jti];
  }

  /* منفیِ تازه برایِ این jti داریم؟ (پاسخِ منفیِ L2 را کِش کرده‌ایم) */
  function negFresh(jti){
    const t = negCache.get(jti);
    if(t == null) return false;
    if(now() >= t){ negCache.delete(jti); return false; }
    return true;
  }

  /* بررسیِ کامل — در دروازه‌ی درخواست صدا زده می‌شود.
     سیاستِ اشتباه: «نشدنِ تشخیص = رد» (fail-closed). باقیِ حالت‌ها
     (پاسخِ منفیِ واقعی) عبورند — تک‌نمونه‌ای هم هیچ ۴۰۱ تازه‌ای نمی‌سازد. */
  async function isRevokedAsync(jti){
    if(isRevoked(jti)) return true;                 /* L1: قطعی و همزمان */
    /* قطع شدنِ Redis در برابرِ «خطایِ فرمان» — تفاوت مهم:
       · isRedis() === false یعنی درایور می‌داند وصل نیست (قطع/هرگز تنظیم
         نشده) ⇒ مسیر به حافظه می‌افتد و پاسخ می‌دهد (در دسترس ماندن).
       · getStrict پرتابِ خطا یعنی درایور خیال می‌کند وصل است اما فرمان
         جواب نداد ⇒ fail-closed (پایین‌تر).
       گزینهٔ دوم برایِ استقراری که امنیت را بر در دسترس بودن ترجیح
       می‌دهد: PAYESH_REVOKE_REQUIRE_REDIS=1 ⇒ قطعِ Redis هم مساویِ ۴۰۱.
       پیش‌فرض خاموش است، چون یک پرشِ کوتاهِ Redis نباید همهٔ مدارس را
       یک‌باره بیرون بیندازد. */
    const active = (typeof redis.isRedis === 'function') ? redis.isRedis() : false;
    if(!active && process.env.PAYESH_REVOKE_REQUIRE_REDIS === '1' && process.env.REDIS_URL){
      stats.unknown++;
      return true;
    }

    /* حتی وقتی در حالتِ بازگشتِ حافظه‌ای هستیم، L2 پرسیده می‌شود:
       در تک‌نمونه‌ایِ تولید، کلید را فقط همین پروسه نوشته ⇒ L1 از قبل
       می‌داند ⇒ پاسخ یکی است و هیچ ۴۰۱ تازه‌ای ساخته نمی‌شود؛ در عوض
       پشتبان واقعاً کار می‌کند (برایِ نمونه‌هایِ هم‌پروسه و برای آزمون).
       خطا فقط از getStrict می‌آید و همان‌جا fail-closed اعمال می‌شود. */
    if(negFresh(jti)){ stats.remoteMisses++; return false; }

    let v = null;
    try{
      /* getStrict خطا را بالا می‌دهد (redis.get خطا را می‌بلعد و بی‌سروصدا
         به حافظه برمی‌گردد ⇒ امکانِ fail-closed از بین می‌رفت). اگر نسخه‌ی
         redis.js آن را ندارد (مثلاً پیش از ادغام)، به get برمی‌گردیم. */
      if(typeof redis.getStrict === 'function') v = await redis.getStrict(K_REVOKED(jti));
      else v = await redis.get(K_REVOKED(jti));
    }catch(e){
      stats.unknown++;                              /* نمی‌دانیم ⇒ رد می‌کنیم */
      return true;
    }
    if(v === '1' || v === 1){ markLocal(jti, now()); stats.remoteHits++; return true; }
    negCache.set(jti, now() + NEG_CACHE_MS);
    stats.remoteMisses++;
    return false;
  }

  /* کِشِ منفی را پاک کن (برای آزمون و برایِ ابطالِ فوری از مسیرِ دیگر) */
  function forget(jti){ negCache.delete(jti); }

  function snapshot(){
    return {
      ttlS: ttlS,
      channel: channel,
      subscribed: subscribed,
      localRevoked: Object.keys(store.__revoked_jti || {}).length,
      trackedUsers: byUser.size,
      negCache: negCache.size,
      stats: Object.assign({}, stats)
    };
  }

  return { init, revokeSession, revokeAllUserSessions, trackSession, sessionsOf,
           isRevoked, isRevokedAsync, forget, snapshot,
           _keys: { K_REVOKED, K_USESSIONS, CHANNEL: channel } };
}

module.exports = { createRevocation };
