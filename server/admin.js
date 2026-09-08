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
const { validate } = require('./validate');

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

  /* هستهٔ پشتیبان‌گیری — مشترک بین endpoint و زمان‌بندیِ خودکار */
  function backupNow(source, userId){
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
      fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 }); /* S-73-3: PII — owner-only */
      fs.renameSync(tmp, final);
      try{ fs.chmodSync(final, 0o600); }catch(e){}
    }catch(e){
      return null;
    }
    const all = listBackups();
    for(const f of all.slice(0, Math.max(0, all.length - RETENTION))){
      try{ fs.unlinkSync(path.join(dir, f)); }catch(e){}
    }
    let size = 0;
    try{ size = fs.statSync(final).size; }catch(e){}
    audit('backup_created', { user_id: (userId == null ? null : userId), file: name, size, source: source || 'manual' });
    return { name: name, size: size, count: listBackups().length };
  }

  function apiBackup(req, res){
    const g = checkAdmin(req, res);
    if(g.done) return g.done;
    const r = backupNow('manual', g.user.id);
    if(!r) return sendJson(res, 500, { ok: false, code: 'backup_failed' });
    return sendJson(res, 200, { ok: true, file: r.name, size: r.size, count: r.count });
  }

  function apiRestore(req, res, body){
    const g = checkAdmin(req, res);
    if(g.done) return g.done;
    /* لایهٔ مقدار (validate.js): فقط {file?} — کلیدِ ناشناخته = رد. */
    const v = validate(body || {}, { fields: { file: { type: 'string', max: 128 } } });
    if(!v.ok){
      if(v.kind === 'unknown_field')
        return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
      return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    }
    const all = listBackups();
    if(!all.length) return sendJson(res, 404, { ok: false, code: 'no_backup' });
    const wanted = (body && typeof body.file === 'string' && body.file !== '') ? body.file : null;
    /* نامِ خواسته‌شده باید الگویِ پشتیبان باشد و در فهرست باشد؛ وگرنه ردِّ
       صریح (رفتارِ پیشین: سکوت و بازگشت به آخرین نسخه — fail-open بود). */
    if(wanted && (!NAME_RE.test(wanted) || all.indexOf(wanted) === -1))
      return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    const name = wanted || all[all.length - 1];
    const fp = path.join(dir, name);
    let data = null;
    try{ data = JSON.parse(fs.readFileSync(fp, 'utf8')); }catch(e){}
    if(!data || typeof data !== 'object' || !Array.isArray(data.users)){
      audit('restore_failed', { user_id: g.user.id, file: name, reason: 'corrupt' });
      return sendJson(res, 409, { ok: false, code: 'corrupt_backup' });
    }
    /* S-73-1: in-place swap — the live object is kept (modules hold its
       reference). Internal auth state is captured BEFORE the swap and
       restored AFTER: only the DATA collections come from the file.
    */
    const kept_auth = store.__auth;
    const kept_uids = store.__processed_uids;
    const kept_rev  = store.__revoked_jti;
    for(const k of Object.keys(store)) delete store[k];
    for(const k of Object.keys(data)) store[k] = data[k];
    /* S-73-1: a session logged out before the restore STAYS logged out
       (revocation is permanent); rate-limit state is not reset, so a
       restore cannot be used to restart brute force. */
    store.__auth = kept_auth || { codes: {}, login_fail: {}, code_rate: {} };
    store.__processed_uids = kept_uids || {};
    store.__revoked_jti = kept_rev || {};
    if(markDirty) markDirty();
    audit('restore_completed', { user_id: g.user.id, file: name });
    return sendJson(res, 200, { ok: true, file: name });
  }

  /*
   * زمان‌بندیِ خودکار (باقی‌ماندهٔ 2.4) — درون‌پروسه، بدون cronِ بیرونی.
   * ms <= 0 → باز نمی‌گردد. unref: تایمر فرآیندِ تست را درگیر نمی‌کند.
   */
  function startAutoBackup(ms){
    if(!ms || ms <= 0) return null;
    const t = setInterval(() => {
      const r = backupNow('auto', null);
      if(r) console.log('auto-backup: ' + r.name + ' (count ' + r.count + ')');
    }, ms);
    if(t.unref) t.unref();
    return t;
  }

  return { apiBackup, apiRestore, listBackups, backupNow, startAutoBackup };

}
module.exports = { createAdmin, RETENTION };
