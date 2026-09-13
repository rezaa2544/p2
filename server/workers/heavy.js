#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server/workers/heavy.js — رشتهٔ کارِ عملیاتِ سنگین (Wave 9)
   -------------------------------------------------------------------
   این فایل فقط توسطِ worker_threads اجرا می‌شود، نه مستقیم.
   چرا Worker؟ سه عملیاتِ سنگین روی رشتهٔ اصلی، event-loop را می‌بندند:
     ۱) JSON.stringify(کلِ store)  ≈ ۳۰ms روی store نمایشیِ ۵.۶MB
        (مقیاسِ ملی: چندصد ms) — در persist هر ۲ ثانیه و در هر بکاپ
     ۲) نوشتنِ سنکرونِ فایل (writeFileSync/renameSync)
     ۳) اسکنِ O(n) گزارشِ عمومی روی کلکسیون‌های بزرگ
   الگو: رشتهٔ اصلی آخرین اسنپ‌شاتِ store را (structured clone — سریع‌تر
   از stringify) به ورکر می‌فرستد؛ ورکر اسنپ‌شات را نگه می‌دارد و
   stringify/نوشتن/گزارش را بیرون از event-loop انجام می‌دهد.
     op:snap    — اسنپ‌شاتِ تازه (v = شمارهٔ نسخه)
     op:persist — نوشتنِ اتمیِ اسنپ‌شاتِ کامل روی دیسک (tmp + rename)
     op:backup  — اسنپ‌شاتِ فقط‌داده (بدونِ __*) + نگه‌داری + شمارش
     op:report  — گزارشِ عمومی از دلِ اسنپ‌شات (هستهٔ مشترک با endpoint)
   I/O سنکرونِ fs در این رشته مجاز است — رشتهٔ پس‌زمینه است.
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { parentPort } = require('worker_threads');
const { computePublicReport } = require('../public-report-core');
const { stringifyAscii } = require('../json-fast');

const NAME_RE = /^payesh-\d{8}-\d{6}-\d{3}\.json$/;

/* آخرین اسنپ‌شاتِ کاملِ store — فقط دادهٔ JSON خالص (قابلِ clone) */
let snapshot = null;
let snapVersion = -1;

function atomicWrite(file, str, mode){
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, str, { encoding: 'utf8', mode: mode });
  fs.renameSync(tmp, file);
  try{ fs.chmodSync(file, mode); }catch(e){}
}

/* اسنپ‌شاتِ فقط‌داده — کلیدهای __* (حالتِ داخلی) واردِ بکاپ نمی‌شوند */
function dataOnly(s){
  const out = {};
  for(const k of Object.keys(s)) if(k.indexOf('__') !== 0) out[k] = s[k];
  return out;
}

function listBackups(dir){
  try{ return fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort(); }
  catch(e){ return []; }
}

function opBackup(dir, retention){
  try{ fs.mkdirSync(dir, { recursive: true }); }catch(e){}
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const name = 'payesh-' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate())
    + '-' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds())
    + '-' + String(now.getMilliseconds()).padStart(3, '0') + '.json';
  const final = path.join(dir, name);
  atomicWrite(final, JSON.stringify(dataOnly(snapshot)), 0o600); /* S-73-3: PII — owner-only */
  const all = listBackups(dir);
  for(const f of all.slice(0, Math.max(0, all.length - retention))){
    try{ fs.unlinkSync(path.join(dir, f)); }catch(e){}
  }
  let size = 0;
  try{ size = fs.statSync(final).size; }catch(e){}
  return { ok: true, name: name, size: size, count: listBackups(dir).length };
}

parentPort.on('message', (m) => {
  if(!m || typeof m !== 'object' || !m.id) return;
  try{
    if(m.op === 'snap'){
      snapshot = m.data;
      snapVersion = m.v;
      parentPort.postMessage({ id: m.id, ok: true, op: 'snap', v: snapVersion });
      return;
    }
    if(m.op === 'persist'){
      if(!snapshot) throw new Error('no_snapshot');
      /* Wave 24 (KPI-3): خروجیِ ASCII-escaped — پارسِ بوتِ بعدی ~۲۰٪
         سریع‌تر (مسیرِ یک‌بایتیِ V8). escape این‌جاست، بیرون از
         event-loop اصلی؛ خروجی JSON استاندارد و هم‌ارز است. */
      const str = stringifyAscii(snapshot);
      atomicWrite(m.file, str, 0o600); /* S-73-3: PII — owner-only */
      parentPort.postMessage({ id: m.id, ok: true, op: 'persist', bytes: Buffer.byteLength(str, 'utf8'), v: snapVersion });
      return;
    }
    if(m.op === 'backup'){
      if(!snapshot) throw new Error('no_snapshot');
      const r = opBackup(m.dir, m.retention);
      parentPort.postMessage(Object.assign({ id: m.id, op: 'backup' }, r));
      return;
    }
    if(m.op === 'report'){
      if(!snapshot) throw new Error('no_snapshot');
      const out = computePublicReport(snapshot, m.sid);
      parentPort.postMessage({ id: m.id, ok: true, op: 'report', out: out });
      return;
    }
    throw new Error('unknown_op:' + m.op);
  }catch(e){
    try{ parentPort.postMessage({ id: m.id, ok: false, op: m.op, error: String((e && e.message) || e) }); }catch(_){}
  }
});
