/* ═══════════════════════════════════════════════════════════════════
   server/admin.js — پشتیبان‌گیری و بازیابیِ پایگاه (OPEN_ITEMS 2.4)
   فقط superadmin (fail-closed).
     POST /api/admin/backup  → اسنپ‌شاتِ اتمیِ store در data/backups
                               (حداکثر ۱۰ نسخهٔ تازه؛ اسنپ‌شات فقط داده
                               است — حالتِ داخلیِ __* وارد فایل نمی‌شود)
     POST /api/admin/restore → بازگشت به آخرین پشتیبان (یا file دلخواه)
                               (فایلِ خراب = 409، store دست‌نخورده)
   Audit: backup_created / restore_completed (بدون phone/nid).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const RETENTION = 10;
const NAME_RE = /^payesh-\d{8}-\d{6}-\d{3}\.json$/;

function createAdmin(ctx){
  const store = ctx.store;
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const markDirty = ctx.markDirty;
  const dir = path.join(ctx.dataDir, 'backups');

  function ensureDir(){
    try{ fs.mkdirSync(dir, { recursive: true }); }catch(e){}
  }
  function listBackups(){
    try{
      return fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort();
    }catch(e){ return []; }
  }
  function checkAdmin(req, res){
    const s = sessionFrom(req);
    if(!s) return { done: sendJson(res, 401, { ok: false, code: 'no_session' }) };
    if(s.role !== 'superadmin') return { done: sendJson(res, 403, { ok: false, code: 'forbidden' }) };
    return { user: s };
  }

  function apiBackup(req, res){
    const g = checkAdmin(req, res);
    if(g.done) return g.done;
    ensureDir();
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = 'payesh-' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate())
      + '-' + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds())
      + '-' + String(now.getMilliseconds()).padStart(3, '0') + '.json';
    const tmp = path.join(dir, name + '.tmp');
    const final = path.join(dir, name);
    /* اسنپ‌شاتِ فقط‌داده: کلیدهای __* (حالتِ داخلی) وارد فایل نمی‌شوند */
    const data = {};
    for(const k of Object.keys(store)) if(k.indexOf('__') !== 0) data[k] = store[k];
    try{
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, final);
    }catch(e){
      return sendJson(res, 500, { ok: false, code: 'backup_failed' });
    }
    const all = listBackups();
    for(const f of all.slice(0, Math.max(0, all.length - RETENTION))){
      try{ fs.unlinkSync(path.join(dir, f)); }catch(e){}
    }
    let size = 0;
    try{ size = fs.statSync(final).size; }catch(e){}
    audit('backup_created', { user_id: g.user.id, file: name, size });
    return sendJson(res, 200, { ok: true, file: name, size, count: listBackups().length });
  }

  function apiRestore(req, res, body){
    const g = checkAdmin(req, res);
    if(g.done) return g.done;
    const all = listBackups();
    if(!all.length) return sendJson(res, 404, { ok: false, code: 'no_backup' });
    const wanted = (body && typeof body.file === 'string') ? body.file : null;
    const name = (wanted && NAME_RE.test(wanted) && all.indexOf(wanted) > -1)
      ? wanted
      : all[all.length - 1];
    const fp = path.join(dir, name);
    let data = null;
    try{ data = JSON.parse(fs.readFileSync(fp, 'utf8')); }catch(e){}
    if(!data || typeof data !== 'object' || !Array.isArray(data.users)){
      audit('restore_failed', { user_id: g.user.id, file: name, reason: 'corrupt' });
      return sendJson(res, 409, { ok: false, code: 'corrupt_backup' });
    }
    /* جایگزینیِ درجا (حالا‌یِ آبجکت محفوظ می‌ماند — ماژول‌ها reference دارند) */
    for(const k of Object.keys(store)) delete store[k];
    for(const k of Object.keys(data)) store[k] = data[k];
    /* حالتِ داخلی از نو — اسنپ‌شات حاوی __* نبود */
    store.__auth = { codes: {}, login_fail: {}, code_rate: {} };
    store.__processed_uids = {};
    store.__revoked_jti = {};
    if(markDirty) markDirty();
    audit('restore_completed', { user_id: g.user.id, file: name });
    return sendJson(res, 200, { ok: true, file: name });
  }

  return { apiBackup, apiRestore, listBackups };
}
module.exports = { createAdmin, RETENTION };
