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
  async function checkAdmin(req, res){
    const s = await sessionFrom(req);
    if(!s) {
      audit('authz_failure', { summary: 'عدم احراز نشست در بخش مدیریت', reason: 'no_session' });
      return { done: sendJson(res, 401, { ok: false, code: 'no_session' }) };
    }
    if(s.role !== 'superadmin') {
      audit('authz_failure', { user_id: s.id, role: s.role, school_id: s.school_id, summary: 'عدم دسترسی به بخش مدیریت با نقش ' + s.role, reason: 'forbidden' });
      return { done: sendJson(res, 403, { ok: false, code: 'forbidden' }) };
    }
    return { user: s };
  }

  /* هستهٔ پشتیبان‌گیری — مشترک بین endpoint و زمان‌بندیِ خودکار.
     Wave 9: مسیرِ عادی از رشتهٔ اصلی خارج شد — JSON.stringify(کلِ store)
     و نوشتنِ فایل در رشتهٔ کارِ پس‌زمینه انجام می‌شود (ورکرِ عملیاتِ
     سنگین). پاسخِ HTTP فقط بعد از نشستنِ فایل روی disk می‌آید تا
     قراردادِ «فایلِ پاسخ موجود است» دست‌نخورده بماند. شکستِ ورکر →
     همان مسیرِ درون‌پروسه‌ایِ قدیمی (فال‌بک). */
  /* Wave 1: PG is the authority — a JSON snapshot of this instance's cache would
     be a partial backup presented as full (other instances' writes are invisible
     here), and a JSON restore would rewind the cache behind PG. Both endpoints
     fail closed in PG mode; operators use pg_dump/pg_restore (see HANDOFF). */
  function pgLive(){
    const db = ctx.db || null;
    return !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
  }
  async function backupNow(source, userId, ip){
    if(pgLive()){
      if(source !== 'auto') console.warn('[admin] backup refused: PG authoritative — use pg_dump');
      return null;
    }
    if(ctx.workers && typeof ctx.workers.runBackup === 'function'){
      try{
        const r = await ctx.workers.runBackup(dir, RETENTION);
        audit('backup_created', { user_id: (userId == null ? null : userId), role: 'superadmin', file: r.name, size: r.size, source: source || 'manual', ip: ip || null, summary: 'تهیه نسخه پشتیبان (export): ' + r.name + ' (' + r.size + ' بایت)' });
        return { name: r.name, size: r.size, count: r.count };
      }catch(e){ /* فال‌بک به مسیرِ درون‌پروسه‌ای */ }
    }
    return backupNowInline(source, userId, ip);
  }

  /* مسیرِ درون‌پروسه‌ای — فال‌بکِ ورکر (و ابزارِ مستقیمِ تست‌ها) */
  function backupNowInline(source, userId, ip){
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
    audit('backup_created', { user_id: (userId == null ? null : userId), role: 'superadmin', file: name, size, source: source || 'manual', ip: ip || null, summary: 'تهیه نسخه پشتیبان (export): ' + name + ' (' + size + ' بایت)' });
    return { name: name, size: size, count: listBackups().length };
  }

  async function apiBackup(req, res){
    const g = await checkAdmin(req, res);
    if(g.done) return g.done;
    if(pgLive()) return sendJson(res, 501, { ok: false, code: 'pg_authoritative',
      message: 'در حالتِ پستگرس، پشتیبان‌گیری با pg_dump انجام می‌شود ( JSON ناقص است)' });
    const r = await backupNow('manual', g.user.id);
    if(!r) return sendJson(res, 500, { ok: false, code: 'backup_failed' });
    return sendJson(res, 200, { ok: true, file: r.name, size: r.size, count: r.count });
  }

  async function apiRestore(req, res, body){
    const g = await checkAdmin(req, res);
    if(g.done) return g.done;
    if(pgLive()) return sendJson(res, 501, { ok: false, code: 'pg_authoritative',
      message: 'در حالتِ پستگرس، بازیابی با pg_restore + راه‌اندازیِ دوباره انجام می‌شود' });
    /* لایهٔ مقدار (validate.js): فقط {file?} — کلیدِ ناشناخته = ردِّ 400.
       نامِ نامعتبر/ناموجود مثلِ گذشته به آخرین نسخهٔ معتبر برمی‌گردد
       (قراردادِ قفل‌شده در security2:F1 — امنیت با الگو + فهرست است نه
       با رد؛ traversal هرگز به دیسک نمی‌رسد). */
    const v = validate(body || {}, { fields: { file: { type: 'string', max: 128 } } });
    if(!v.ok && v.kind === 'unknown_field')
      return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
    const all = listBackups();
    if(!all.length) return sendJson(res, 404, { ok: false, code: 'no_backup' });
    const wanted = (body && typeof body.file === 'string' && body.file !== '') ? body.file : null;
    const name = (wanted && NAME_RE.test(wanted) && all.indexOf(wanted) > -1)
      ? wanted
      : all[all.length - 1];
    const fp = path.join(dir, name);
    let data = null;
    try{ data = JSON.parse(fs.readFileSync(fp, 'utf8')); }catch(e){}
    if(!data || typeof data !== 'object' || !Array.isArray(data.users)){
      audit('restore_failed', { user_id: g.user.id, role: g.user.role, school_id: g.user.school_id, file: name, reason: 'corrupt', summary: 'خطا در بازیابی پشتیبان: فایل خراب ' + name });
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
    audit('restore_completed', { user_id: g.user.id, role: g.user.role, school_id: g.user.school_id, file: name, summary: 'بازیابی موفق پشتیبان از فایل: ' + name });
    return sendJson(res, 200, { ok: true, file: name });
  }

  /*
   * زمان‌بندیِ خودکار (باقی‌ماندهٔ 2.4) — درون‌پروسه، بدون cronِ بیرونی.
   * ms <= 0 → باز نمی‌گردد. unref: تایمر فرآیندِ تست را درگیر نمی‌کند.
   */
  function startAutoBackup(ms){
    if(!ms || ms <= 0) return null;
    /* A-05b: در حالتِ PG-live، backupNow اسنپ‌شاتِ JSON را رد می‌کند (PG
       مرجع است — اسنپ‌شاتِ جزئیِ کشِ این نمونه، بکاپِ کامل جلوه می‌کند).
       تا پیش از این تایمر مسلح می‌شد و هر تیک ساکت null برمی‌گرداند: هیچ
       فایلی نوشته نمی‌شد و هیچ خطایی چاپ نمی‌شد، در حالی که بنرِ بوت قولِ
       «بکاپِ خودکارِ هر N دقیقه» را می‌داد. استقراری می‌توانست ماه‌ها فکر
       کند بکاپ دارد. اکنون تایتر اصلاً مسلح نمی‌شود و یک‌بار دلیلش گفته
       می‌شود. بکاپِ واقعی در سطحِ زیرساخت است (pg_dump/pgBackRest/WAL-G —
       docs/RELIABILITY_DR_PLAN.md). */
    if (pgLive()) {
      console.warn('auto-backup: PG is authoritative — the in-process JSON-export timer is a NO-OP here. ' +
        'Backups must be taken at the infrastructure level (pg_dump / pgBackRest / WAL-G).');
      return null;
    }
    const t = setInterval(() => {
      Promise.resolve(backupNow('auto', null)).then((r) => {
        if(r) console.log('auto-backup: ' + r.name + ' (count ' + r.count + ')');
        else console.warn('auto-backup: tick produced no backup file (workers/in-process path failed) — investigate.');
      }).catch(() => {});
    }, ms);
    if(t.unref) t.unref();
    return t;
  }

  return { apiBackup, apiRestore, listBackups, backupNow, backupNowInline, startAutoBackup };

}
module.exports = { createAdmin, RETENTION };
