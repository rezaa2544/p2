#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server/worker-service.js — مدیرِ رشتهٔ کارِ عملیاتِ سنگین (Wave 9)
   -------------------------------------------------------------------
   یک Workerِ دیرزیاد (lazy) نگه می‌دارد و قراردادِ پیام را مدیریت می‌کند:
     runPersist(file) — نوشتنِ اتمیِ store روی دیسک در پس‌زمینه
     runBackup(dir, retention) — اسنپ‌شاتِ فقط‌داده + نگه‌داری
     runReport(sid) — گزارشِ عمومی از اسنپ‌شاتِ ورکر
   تازگیِ داده (freshness): هر markDirty نسخه را جلو می‌برد (bump).
   اگر ورکر عقب باشد، پیش از هر عملیاتِ داده‌محور یک اسنپ‌شاتِ تازه
   (structured clone — روی رشتهٔ اصلی، اما چند برابر ارزان‌تر از
   JSON.stringify) ارسال می‌شود؛ در حالتِ پایدار (بدونِ نوشتنِ تازه)
   بکاپ/گزارش بدونِ هیچ هزینه‌ای روی رشتهٔ اصلی پاسخ می‌گیرند.
   شکستِ ورکر هرگز عملیات را نمی‌کشد — فراخواننده به مسیرِ درون‌پروسه‌ایِ
   قدیمی برمی‌گردد (فال‌بک در index.js/admin.js/public-report.js).
   Worker با unref باز می‌شود تا فرآیندِ تست/سرور را زنده نگه ندارد.
   Runtime deps: Node stdlib only (worker_threads).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE = path.join(__dirname, 'workers', 'heavy.js');
const OP_TIMEOUT_MS = Number(process.env.PAYESH_WORKER_TIMEOUT_MS || 15000);

function createHeavyWorker(ctx){
  const getStore = ctx.getStore;

  let worker = null;
  let seq = 0;
  const pending = new Map();   /* id -> { resolve, reject, timer } */
  let mainVersion = 0;         /* هر markDirty یکی اضافه می‌کند */
  let workerVersion = -1;      /* نسخه‌ای که ورکر واقعاً دارد */
  let snapChain = Promise.resolve(); /* ارسالِ اسنپ‌شات‌ها سریالی و مرتب */

  function ensureWorker(){
    if(worker) return worker;
    worker = new Worker(WORKER_FILE);
    if(worker.unref) worker.unref();
    worker.on('message', (m) => {
      if(!m || !m.id) return;
      const p = pending.get(m.id);
      if(!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if(m.ok) p.resolve(m);
      else p.reject(new Error(m.error || 'worker op failed'));
    });
    worker.on('error', (e) => failAll(e));
    worker.on('exit', () => { worker = null; failAll(new Error('heavy worker exited')); });
    return worker;
  }
  function failAll(err){
    for(const p of pending.values()){
      clearTimeout(p.timer);
      p.reject(err instanceof Error ? err : new Error(String(err)));
    }
    pending.clear();
  }

  function call(msg){
    return new Promise((resolve, reject) => {
      let w;
      try{ w = ensureWorker(); }
      catch(e){ return reject(e); }
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('worker op timeout')); }, OP_TIMEOUT_MS);
      if(timer.unref) timer.unref();
      pending.set(id, { resolve, reject, timer });
      try{ w.postMessage(Object.assign({ id: id }, msg)); }
      catch(e){ pending.delete(id); clearTimeout(timer); reject(e); }
    });
  }

  /* اسنپ‌شاتِ تازه — فقط وقتی ورکر عقب است؛ سریالی تا دو فراخوانِ
     هم‌زمان دو clone نپردازند (دومی از میان‌برِ نسخه رد می‌شود). */
  function syncSnapshot(){
    const run = async () => {
      if(mainVersion === workerVersion) return workerVersion;
      const r = await call({ op: 'snap', v: mainVersion, data: getStore() });
      workerVersion = r.v;
      return workerVersion;
    };
    snapChain = snapChain.then(run, run);
    return snapChain;
  }

  return {
    /* markDirtyِ index.js این را صدا می‌زند */
    bump(){ mainVersion += 1; },
    version(){ return mainVersion; },
    syncSnapshot,
    async runPersist(file){
      await syncSnapshot();
      const r = await call({ op: 'persist', file: file });
      return { bytes: r.bytes, v: r.v };
    },
    async runBackup(dir, retention){
      await syncSnapshot();
      const r = await call({ op: 'backup', dir: dir, retention: retention });
      return { name: r.name, size: r.size, count: r.count };
    },
    async runReport(sid){
      await syncSnapshot();
      const r = await call({ op: 'report', sid: sid });
      return r.out;
    },
    stats(){
      return { mainVersion: mainVersion, workerVersion: workerVersion, alive: !!worker, pending: pending.size };
    },
    terminate(){
      if(worker){
        const w = worker;
        worker = null;
        failAll(new Error('heavy worker terminated'));
        try{ w.terminate().catch(() => {}); }catch(e){}
      }
    }
  };
}

module.exports = { createHeavyWorker };
