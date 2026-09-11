'use strict';
const { validate } = require('./validate');
/* ── R95 (بند ۲.۵) — sync_conflicts: فهرست + داوریِ انسانی ─────────────────
   سیاست (docs/TODO_BEFORE_PRODUCTION.md بند ۲.۵):
     • حضور/نمره/انضباطی  → تعارض «حفظ» می‌شود (sync_conflicts) — اینجا داوری
     • اعلان/یادداشت       → آخرین نوشتن (در sync.js بی‌اثر بر base_version)
     • ساختار              → سرور مرجع (stale_base در sync.js)
   داوری فقط manager/superadmin — مدیر فقط برایِ مدرسهٔ خود. */

function createConflicts(ctx){
  const store     = ctx.store;
  const db        = ctx.db || null; /* Wave 1: PG-first adjudication writes */
  const audit     = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson  = ctx.sendJson;
  const markDirty = ctx.markDirty;

  /* فهرستِ تعارض‌ها (بازها اول، تازه‌ترها اول — حداکثر ۵۰) */
  async function apiList(req, res){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if(s.role !== 'manager' && s.role !== 'superadmin')
      return sendJson(res, 403, { ok: false, code: 'role_denied' });
    if(!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    const scoped = s.role === 'manager'
      ? store.sync_conflicts.filter(c => c.school_id == null || Number(c.school_id) === Number(s.school_id))
      : store.sync_conflicts.slice();
    scoped.sort((a, b) =>
      ((a.status === 'open') === (b.status === 'open') ? 0 : (a.status === 'open' ? -1 : 1))
      || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return sendJson(res, 200, { ok: true, conflicts: scoped.slice(-50).reverse() });
  }

  /* { conflict_id, winner: 'incoming' | 'server', reason? } → اعمالِ اتمیک */
  async function apiResolve(req, res, body){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if(s.role !== 'manager' && s.role !== 'superadmin')
      return sendJson(res, 403, { ok: false, code: 'role_denied' });
    /* لایهٔ مقدار (validate.js): فقط {conflict_id, winner, reason?} —
       کلیدِ ناشناخته = رد؛ conflict_id عددِ صحیحِ مثبت؛ winner از enum؛
       reason حداکثر ۲۰۰ نویسه (به‌جایِ برشِ خاموش، ردِّ صریح). */
    const v = validate(body, { fields: {
      conflict_id: { type: 'integer', min: 1 },
      winner: { type: 'string', enum: ['incoming', 'server'] },
      reason: { type: 'string', max: 200 }
    }, required: ['conflict_id', 'winner'] });
    if(!v.ok){
      if(v.kind === 'unknown_field')
        return sendJson(res, 400, { ok: false, code: 'unknown_field', field: v.field });
      return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    }
    const cid = body.conflict_id;
    const winner = body.winner;
    const c = (store.sync_conflicts || []).find(x => x.id === cid);
    if(!c) return sendJson(res, 404, { ok: false, code: 'not_found' });
    if(s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))
      return sendJson(res, 403, { ok: false, code: 'out_of_scope' });
    if(c.status !== 'open')
      return sendJson(res, 409, { ok: false, code: 'already_resolved', conflict: c });

    /* Wave 1: PG-first adjudication. The winning record commits to the authority
       (OCC on the live version) BEFORE the cache mutates; on PG failure nothing
       mutates and the conflict stays open (retryable). NOTE: sync_conflicts rows
       themselves are intentionally cache-side in Wave 1 (arbitration state; the
       validation path never mirrored them), so apiList keeps reading the store. */
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    let pgNext = null, pgIsInsert = false, pgBase = null;
    if(winner === 'incoming' && c.incoming && c.incoming.data){
      if(!Array.isArray(store[c.collection])) store[c.collection] = [];
      let rec = store[c.collection].find(x => x.id === Number(c.record_id));
      if(!rec && pgLive && typeof db.readOne === 'function'){
        try{
          const row = await db.readOne(c.collection, c.record_id);
          if(row){ store[c.collection].push(row); rec = row; }
        }catch(e){ /* genuinely missing: insert path */ }
      }
      const nowIso = new Date().toISOString();
      if(pgLive && db && typeof db.persistOpsBatch === 'function'){
        if(rec){
          pgBase = (rec.version || 1);
          pgNext = Object.assign({}, rec, c.incoming.data, { id: rec.id, updated_at: nowIso });
          pgNext.version = pgBase + 1;
        }else{
          pgIsInsert = true;
          pgNext = Object.assign({}, c.incoming.data);
          pgNext.id = Number(c.record_id);
          pgNext.version = (c.server_version || 0) + 1;
          pgNext.updated_at = nowIso;
        }
        try{
          await db.persistOpsBatch([pgIsInsert
            ? { c: c.collection, t: 'ins', data: pgNext }
            : { c: c.collection, t: 'upd', data: pgNext, base_version: pgBase }]);
        }catch(pgErr){
          const st = pgErr && pgErr.status ? Number(pgErr.status) : 0;
          if(st === 409)
            return sendJson(res, 409, { ok: false, code: 'version_conflict', conflict: c,
              message: 'رکورد از زمانِ بارگذاریِ تعارض تغییر کرده — دوباره داوری کنید' });
          return sendJson(res, 503, { ok: false, code: 'pg_unavailable' });
        }
      }
      /* Authority committed (or memory mode): apply the identical state to the cache. */
      if(rec){
        if(pgNext) Object.assign(rec, pgNext);
        else{
          Object.assign(rec, c.incoming.data, { id: rec.id, updated_at: nowIso });
          rec.version = (rec.version || 1) + 1;
        }
      }else{
        const data = pgNext || Object.assign({}, c.incoming.data);
        if(!pgNext){
          data.id = Number(c.record_id);
          data.version = (c.server_version || 0) + 1;
          data.updated_at = nowIso;
        }
        store[c.collection].push(data);
      }
    }
    c.status = 'resolved';
    c.winner = winner;
    c.resolved_by = s.id;
    c.resolved_at = new Date().toISOString();
    /* Gap 3 (Δ-schema): داوری خودش یک تغییر است — بدونِ این مُهر، دلتا
       ردیفِ حل‌شدهٔ قدیمی را هرگز نمی‌بیند (created_at کهنه است). */
    c.updated_at = c.resolved_at;
    if(body.reason) c.reason = String(body.reason).slice(0, 200);
    markDirty();
    audit('conflict_resolved', { user_id: s.id, conflict_id: c.id, collection: c.collection, record_id: c.record_id, winner });
    return sendJson(res, 200, { ok: true, conflict: c });
  }

  return { apiList, apiResolve };
}

module.exports = { createConflicts };
