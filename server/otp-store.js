/* ═══════════════════════════════════════════════════════════════════
   server/otp-store.js — OTP + rate-limit state in a DEDICATED file
   (R101: server/data/otp.json) — distributed across instances.
   ───────────────────────────────────────────────────────────────────
   Layout: { v:1,
     codes:         { phone: { h, at, user_id, tries } },  // h = sha256 hex, NEVER plaintext
     cd:            { phone: lastSendTs },                 // send cooldown
     daily:         { phone: { day, n } },                 // sends per UTC day
     rate:          { phone: [ts...] },                    // sliding-window sends
     rate_ip:       { ip: [ts...] },
     login_rate_ip: { ip: [ts...] },                       // sliding-window logins
     login_fail:    { phone: { n, until } } }              // progressive delay
   - EVERY mutation is written back synchronously (tmp + rename): crash-safe,
     and brute-force counters survive restarts (no reset window for attackers).
   - reloadIfChanged() at request entry picks up sibling instances' writes
     (mmap-free poor-man's distribution: one shared file, last-writer-wins
     per request — exact enough for throttling).
   - One-time migration from the legacy in-store location (R96 __auth):
     in-flight codes survive the upgrade; legacy keys are then dropped.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

function blank(){
  return { v: 1, codes: {}, cd: {}, daily: {}, rate: {}, rate_ip: {},
           login_rate_ip: {}, login_fail: {} };
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
  let data = blank();
  let lastWrite = 0;

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
    const day = new Date(now).toISOString().slice(0, 10);
    for(const p in data.daily){ if(!data.daily[p] || data.daily[p].day !== day) delete data.daily[p]; }
    for(const m of [data.rate, data.rate_ip, data.login_rate_ip]){
      for(const k in m){
        const l = m[k];
        if(!Array.isArray(l)){ delete m[k]; continue; }
        while(l.length && l[0] < now - H) l.shift();
        if(!l.length) delete m[k];
      }
    }
    for(const p in data.login_fail){
      const f = data.login_fail[p];
      if(!f || (f.until || 0) < now - H) delete data.login_fail[p];
    }
  };

  const save = () => {
    prune();
    try{
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
      lastWrite = Date.now();
    }catch(e){ /* disk failure must not break login; state stays in memory */ }
  };

  const load = () => {
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

  const reloadIfChanged = () => {
    let st = null;
    try{ st = fs.statSync(file); }catch(e){ return; }
    if(st.mtimeMs > lastWrite) load();
  };

  /* ── boot: load, else migrate once from legacy __auth ─────────── */
  if(!load() && store && store.__auth){
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
    mv('daily', 'code_daily');
    mv('rate', 'code_rate');
    mv('rate_ip', 'code_rate_ip');
    mv('login_rate_ip', 'login_rate_ip');
    if(moved){ save(); if(markDirty) markDirty(); }
  }

  return { data, save, reloadIfChanged, file };
}

module.exports = { createOtpStore };
