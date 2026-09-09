/* ═══════════════════════════════════════════════════════════════════
   server/otp-store.js — OTP state (R101) — codes + cooldown + delay
   ───────────────────────────────────────────────────────────────────
   Layout: { v:1,
     codes:      { phone: { h, at, user_id, tries } },  // h = sha256 hex, NEVER plaintext
     cd:         { phone: lastSendTs },                 // send cooldown
     login_fail: { phone: { n, until } },               // progressive delay
     tomb:       { phone: ts } }                        // P0-15 tombstones (consumed codes stay dead)
   (R dist: window counters live in Redis via server/rate-limit.js —
   fixed-window atomic; this store keeps code lifecycle + cooldown + delay.
   Old files with counter keys still load: sane() drops unknown keys.)

   P0-15 — دو حالت:
   ● ردیس فعال: ردیس تنها منبع حقیقت است (کلید `payesh:otp:state`).
     - save() = فلاشِ سریالی‌شده زیرِ قفل توزیع‌شده (P0-14) با شماره‌گذاری
       دنباله (seq): نویسندهٔ کهنه هرگز حالت جدیدتر را بازنویسی نمی‌کند.
       فلاش‌ها هم‌جوشی می‌شوند تا انبوه تغییرات، یک نوشتِ ردیسی بسازد.
     - reloadIfChanged() = خواندن از ردیس در ورودِ درخواست — نمونهٔ خواهر
       کدها و محدودیت‌های نمونهٔ دیگر را پیش از تصمیم می‌بیند.
     - ادغامِ حالت دورتر زیرِ قفل: کلیدبه‌کلید تازه‌ترین‌برد + سنگ‌قبرها
       → کدِ مصرف‌شده در هیچ نمونه‌ای زنده نمی‌ماند.
   ● بدون ردیس (توسعه): همان فایلِ `otp.json` با نوشتِ اتمیک (tmp+rename)
     و reload بر پایهٔ mtime — رفتار پیشین، دست‌نخورده.
   - یک‌بار مهاجرت از جای کهنهٔ درون‌فروشگاهی (R96 __auth).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const REDIS_KEY = 'payesh:otp:state';
const LOCK_NAME = 'otp-state';
const LOCK_TTL_S = 10;

function blank(){
  return { v: 1, codes: {}, cd: {}, login_fail: {}, tomb: {} };
}
function sane(o){
  const b = blank();
  if(!o || typeof o !== 'object') return b;
  for(const k of Object.keys(b)){
    if(o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) b[k] = o[k];
  }
  return b;
}

function createOtpStore(opts){
  const file = opts.file;
  const ttlMs = opts.ttlMs;
  const store = opts.store;         /* legacy migration source (R96 __auth) */
  const markDirty = opts.markDirty;
  const redis = opts.redis || null;        /* P0-15: حالت ردیس */
  const cache = opts.cache || null;        /* P0-15: قفل توزیع‌شده */
  let data = blank();
  let lastWrite = 0;
  let seq = 0;                       /* دنبالهٔ فلاش — بازدارندهٔ نوشتِ کهنه */
  let flushChain = Promise.resolve();
  let flushDirty = false;

  const useRedis = () => !!(redis && redis.isRedis && redis.isRedis());

  /* prune is size hygiene only (25h horizon); request paths prune with the
     exact sliding window before counting — correctness never depends on this. */
  const prune = (now) => {
    now = now || Date.now();
    const H = 25 * 3600 * 1000;
    for(const p in data.codes){
      const r = data.codes[p];
      if(!r || now - (r.at || 0) >= ttlMs) delete data.codes[p];
    }
    for(const p in data.cd){ if(now - data.cd[p] > H) delete data.cd[p]; }
    for(const p in data.login_fail){
      const f = data.login_fail[p];
      if(!f || (f.until || 0) < now - H) delete data.login_fail[p];
    }
    /* سنگ‌قبرها فقط تا عمرِ کد معنا دارند — بعد از آن کدِ مرده خودش منقضی است */
    for(const p in data.tomb){ if(now - data.tomb[p] > ttlMs) delete data.tomb[p]; }
  };

  /* حذفِ کد با سنگ‌قبر — تا حذف در ادغام‌های چندنمونه‌ای گم نشود
     (وگرنه کدِ مصرف‌شده در نمونهٔ خواهر زنده می‌ماند = بازپخش). */
  const deleteCode = (phone) => {
    if(data.codes && phone in data.codes) delete data.codes[phone];
    data.tomb[phone] = Date.now();
  };

  /* ── ادغامِ حالت دورتر: کلیدبه‌کلید تازه‌ترین‌برد ─────────────────
     (پنجره‌های لغزان به rate-limit.js رفته‌اند؛ اینجا آرایه نداریم.) */
  const entryTs = (sec, key, v) => {
    if(sec === 'codes') return (v && v.at) || 0;
    if(sec === 'cd') return typeof v === 'number' ? v : 0;
    if(sec === 'login_fail') return (v && v.until) || 0;
    return 0;
  };
  const mergeFrom = (remote) => {
    const r = sane(remote);
    for(const sec of Object.keys(blank())){
      if(sec === 'v') continue;
      const local = data[sec], far = r[sec];
      for(const key of Object.keys(far)){
        const fv = far[key], lv = local[key];
        if(sec === 'tomb'){
          local[key] = Math.max(lv || 0, fv || 0);
        }else if(lv === undefined){
          local[key] = fv;
        }else if(entryTs(sec, key, fv) > entryTs(sec, key, lv)){
          local[key] = fv;
        }
      }
    }
    /* اعمالِ سنگ‌قبرها: کدی که هر نمونه‌ای مصرف/منقضی کرده، همه‌جا مرده است */
    for(const p of Object.keys(data.tomb)){
      const rec = data.codes[p];
      if(rec && (rec.at || 0) <= data.tomb[p]) delete data.codes[p];
    }
  };

  /* ── همگام‌سازی با حالت دورتر (ورودِ درخواست) ─────────────────────
     ادغام می‌کنیم، بازنویسی نه — وگرنه تغییرات محلیِ هنوز فلاش‌نشده
     زیر پای درخواست جاری پاک می‌شدند.                               */
  const adopt = (remoteDoc, remoteSeq) => {
    mergeFrom(remoteDoc);
    seq = remoteSeq;
    prune();
  };

  /* ── فلاش به ردیس: زیر قفل، خواندن دورتر، ادغام، نوشت با دنباله ── */
  const doFlush = async () => {
    if(!useRedis()) return;
    prune();
    let token = null;
    if(cache){
      /* قفل شرطِ ورود است؛ بدون آن نوشت‌ها همدیگر را می‌پوشانند.
         تا یک ثانیه می‌کوشیم؛ نشد، فلاش به دور بعد می‌ماند. */
      for(let tries = 0; tries < 200 && !token; tries++){
        token = await cache.acquireLock(LOCK_NAME, LOCK_TTL_S);
        if(!token) await new Promise(r => setTimeout(r, 5));
      }
      if(!token){ flushDirty = true; return; }
    }else{
      token = 'no-lock';
    }
    try{
      const raw = await redis.get(REDIS_KEY);
      if(raw){
        let remote = null;
        try{ remote = JSON.parse(raw); }catch(e){ remote = null; }
        const rSeq = (remote && typeof remote.seq === 'number') ? remote.seq : 0;
        if(rSeq > seq){ mergeFrom(remote); seq = rSeq; }
      }
      seq += 1;
      const doc = Object.assign({}, data, { seq });
      await redis.set(REDIS_KEY, JSON.stringify(doc));
      lastWrite = Date.now();
    }catch(e){ /* شکست شبکه: حالت در حافظه می‌ماند؛ فلاش بعدی دوباره می‌کوشد */
    }finally{
      if(cache && token !== 'no-lock') await cache.releaseLock(LOCK_NAME, token);
    }
  };

  const enqueueFlush = () => {
    flushDirty = true;
    flushChain = flushChain.then(async () => {
      /* هم‌جوشی: اگر حینِ فلاش، تغییر جدیدی آمد، یک فلاشِ دیگر کافی است */
      while(flushDirty){
        flushDirty = false;
        await doFlush();
      }
    }).catch(() => {});
    return flushChain;
  };

  const saveFile = () => {
    try{
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
      lastWrite = Date.now();
    }catch(e){ /* disk failure must not break login; state stays in memory */ }
  };

  const save = () => {
    prune();
    if(useRedis()) return enqueueFlush();   /* P0-15: ردیس منبع حقیقت است */
    saveFile();                             /* توسعهٔ بدون ردیس: فایلِ محلی */
    return undefined;
  };

  const loadFile = () => {
    try{
      if(!fs.existsSync(file)) return false;
      /* درجا جایگزین می‌شود (نه rebinding) — وگرنه otp.dataِ صادرشده
         به شیءِ کهنه اشاره می‌ماند و reload دیده نمی‌شد. */
      const fresh = sane(JSON.parse(fs.readFileSync(file, 'utf8')));
      for(const k of Object.keys(data)) delete data[k];
      Object.assign(data, fresh);
      prune();
      lastWrite = Date.now();
      return true;
    }catch(e){ return false; }
  };

  const reloadIfChanged = async () => {
    if(useRedis()){
      /* P0-15: در حالت ردیس، ورودِ هر درخواست حالتِ دورتر را می‌خواند تا
         کدها و حدّ‌نرخ‌های نمونه‌های خواهر دیده شوند. */
      try{
        const raw = await redis.get(REDIS_KEY);
        if(raw){
          let remote = null;
          try{ remote = JSON.parse(raw); }catch(e){ remote = null; }
          const rSeq = (remote && typeof remote.seq === 'number') ? remote.seq : 0;
          if(rSeq > seq) adopt(remote, rSeq);
        }
      }catch(e){ /* خواندن نشد → تصمیم با حالت محلی (بدتر از قبل نیست) */ }
      return;
    }
    let st = null;
    try{ st = fs.statSync(file); }catch(e){ return; }
    if(st.mtimeMs > lastWrite) loadFile();
  };

  /* برای آزمون‌ها و گزارش‌گیری */
  const flush = () => enqueueFlush();
  const getSeq = () => seq;

  /* ── boot: load, else migrate once from legacy __auth ─────────── */
  if(!useRedis()){
    if(!loadFile() && store && store.__auth){
      const a = store.__auth;
      const mv = (dst, src) => {
        if(a[src] && typeof a[src] === 'object' && Object.keys(a[src]).length){
          data[dst] = a[src]; moved = true;
        }
        delete a[src];
      };
      let moved = false;
      mv('codes', 'codes');
      mv('login_fail', 'login_fail');
      mv('cd', 'code_cd');
      /* R dist: legacy counters (code_daily/code_rate/...) are NOT migrated —
         Redis owns windows now; stale keys are dropped below with the rest. */
      delete a.code_daily; delete a.code_rate; delete a.code_rate_ip;
      delete a.login_rate_ip;
      if(moved){ saveFile(); if(markDirty) markDirty(); }
    }
  }

  return { data, save, reloadIfChanged, flush, getSeq, deleteCode, file };
}

module.exports = { createOtpStore };
