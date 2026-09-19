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

  /* سقفِ نگه‌داریِ تعارض‌هایِ داوری‌شده — بستنِ بی‌سقفیِ #124 بدونِ شکستنِ
     قراردادِ Gap-3 (#59): ردیفِ resolved باید بماند تا (الف) دلتا آن را از
     راهِ updated_at به کلاینت برساند و UI تعارضِ محلی را ببندد، و (ب)
     resolveِ دوباره 409 already_resolved بدهد نه 404. پس حذفِ فوری ممنوع؛
     به‌جایش صفِ resolvedها جدا هرس می‌شود: کهنه‌ترین resolved_at اول.
     پیش‌فرض ۵۰۰؛ PAYESH_RESOLVED_CONFLICTS_MAX=0 یعنی بدونِ هرس. */
  function resolvedKeepMax(){
    const n = Number(process.env.PAYESH_RESOLVED_CONFLICTS_MAX);
    return Number.isFinite(n) && n >= 0 ? n : 500;
  }
  function pruneResolved(){
    const cap = resolvedKeepMax();
    if(cap <= 0 || !Array.isArray(store.sync_conflicts)) return;
    const resolved = store.sync_conflicts.filter(x => x && x.status === 'resolved');
    if(resolved.length <= cap) return;
    resolved.sort((a, b) => String(a.resolved_at || a.updated_at || '')
      .localeCompare(String(b.resolved_at || b.updated_at || '')));
    const drop = new Set(resolved.slice(0, resolved.length - cap));
    /* بازخورد بازبین #143 (باگ ۲): هرسِ شمارشی بدون tombstone حذف را از
       کلاینتِ آفلاین پنهان می‌کرد — دلتا فقط ردیف‌های موجود را می‌فرستد و
       کلاینتی که ردیفِ resolved را پیش از هرس نگرفته بود، تعارضِ محلی را
       برای همیشه باز می‌دید. مثل هر حذفِ دیگر (sync.js del)، سنگ‌قبر به
       __deleted_records می‌رود تا مسیرِ دلتا (pull.js: deleted[]) بسته‌شدن را
       اعلام کند. برشِ سقفِ __deleted_records همان مکانیزمِ موجودِ sync.js است. */
    if(!Array.isArray(store.__deleted_records)) store.__deleted_records = [];
    const nowIso = new Date().toISOString();
    for(const d of drop)
      store.__deleted_records.push({ c: 'sync_conflicts', id: d.id,
        school_id: d.school_id != null ? d.school_id : null, at: nowIso });
    /* بازخورد بازبین #153 (باگ ۱): این مسیر بیرونِ جاروی post-commitِ sync.js
       اجرا می‌شود — بدونِ برشِ همین‌جا، داوری‌های پیوسته __deleted_records را
       بی‌سقف می‌راندند. همان سقفِ ۵۰۰۰ قراردادِ موجود (sync.js/delete-service). */
    if(store.__deleted_records.length > 5000)
      store.__deleted_records = store.__deleted_records.slice(-5000);
    store.sync_conflicts = store.sync_conflicts.filter(x => !drop.has(x));
  }

  /* فهرستِ تعارض‌ها (بازها اول، تازه‌ترها اول — حداکثر ۵۰) */
  async function apiList(req, res){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if(s.role !== 'manager' && s.role !== 'superadmin')
      return sendJson(res, 403, { ok: false, code: 'role_denied' });

    // B1: Persistent Conflict Reading from PostgreSQL SSoT
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    if (pgLive && typeof db.query === 'function') {
      try {
        const querySql = s.role === 'manager'
          ? `SELECT * FROM sync_conflicts WHERE school_id IS NULL OR school_id = $1 ORDER BY (status = 'open') DESC, created_at DESC LIMIT 50;`
          : `SELECT * FROM sync_conflicts ORDER BY (status = 'open') DESC, created_at DESC LIMIT 50;`;
        const params = s.role === 'manager' ? [Number(s.school_id)] : [];
        const r = await db.query(querySql, params);
        if (r && Array.isArray(r.rows)) {
          return sendJson(res, 200, { ok: true, conflicts: r.rows });
        }
      } catch (err) {
        // fallback to cache on query error
      }
    }

    if(!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    const scoped = s.role === 'manager'
      ? store.sync_conflicts.filter(c => c.school_id == null || Number(c.school_id) === Number(s.school_id))
      : store.sync_conflicts.slice();
    scoped.sort((a, b) =>
      ((a.status === 'open') === (b.status === 'open') ? 0 : (a.status === 'open' ? -1 : 1))
      || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return sendJson(res, 200, { ok: true, conflicts: scoped.slice(0, 50) });
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
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    let c = (store.sync_conflicts || []).find(x => x.id === cid);
    if(!c && pgLive && typeof db.query === 'function'){
      try{
        const r = await db.query('SELECT * FROM sync_conflicts WHERE id = $1;', [Number(cid)]);
        if(r && r.rows && r.rows[0]) c = r.rows[0];
      }catch(_){}
    }
    if(!c) return sendJson(res, 404, { ok: false, code: 'not_found' });
    if(s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))
      return sendJson(res, 403, { ok: false, code: 'out_of_scope' });
    if(c.status !== 'open')
      return sendJson(res, 409, { ok: false, code: 'already_resolved', conflict: c });

    /* Wave 1: PG-first adjudication. The winning record commits to the authority
       (OCC on the live version) BEFORE the cache mutates; on PG failure nothing
       mutates and the conflict stays open (retryable). */
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
    /* P0 (Chat 2 audit 4.2 follow-up): conflicts now live in PG too (sync.js
       persists them in the phase-2 transaction) — so the adjudication must be
       recorded there as well, or a restart re-hydrates the row as `open` and
       the arbitration silently evaporates. Fail-closed mirrors the Wave-1
       record-write path above: PG failure ⇒ 503, RAM untouched, retryable.
       (Rows created before this fix may not exist in PG — UPDATE 0 rows is fine.) */
    if(pgLive && db && typeof db.query === 'function'){
      try {
        await db.query(
          `UPDATE sync_conflicts
              SET status = $2, winner = $3, resolved_by = $4,
                  resolved_at = $5, updated_at = $6, reason = $7
            WHERE id = $1`,
          [c.id, 'resolved', winner, s.id, c.resolved_at, c.updated_at, c.reason || null]
        );
      } catch (pgErr) {
        audit('conflict_resolve_pg_failed', { conflict_id: c.id, error: String((pgErr && pgErr.message) || pgErr).slice(0, 140) });
        return sendJson(res, 503, { ok: false, code: 'pg_unavailable' });
      }
    }
    /* ممیزی دور ۲ (رگرسیونِ SG11/C15c/C16/C17c): resolve ⇒ delِ فوری (باگ ۲
       بازبین #124) قراردادِ Gap-3 (#59) را می‌شکست — دلتا ردیفِ resolved را
       از راهِ updated_at به کلاینت می‌رساند تا UI تعارضِ محلی را ببندد؛ حذفِ
       فوری آن را کور می‌کرد و resolveِ دوباره به‌جای 409 already_resolved
       404 می‌داد. جایگزین: ردیفِ resolved می‌ماند و صفِ resolvedها جدا
       سقف‌دار هرس می‌شود (کهنه‌ترین resolved_at اول). بی‌سقفیِ #124 همچنان
       بسته است: openها را ringِ mirrorAppend (sync.js) سقف می‌زند،
       resolvedها را این هرس. */
    if (pgLive && db && typeof db.query === 'function') {
      try {
        await db.query(
          `UPDATE sync_conflicts SET status = 'resolved', winner = $1, reason = $2, resolved_at = NOW(), resolved_by = $3, updated_at = NOW() WHERE id = $4;`,
          [winner, c.reason || null, s.id, Number(c.id)]
        );
      } catch (_) {}
    }
    pruneResolved();
    markDirty();
    audit('conflict_resolved', { user_id: s.id, conflict_id: c.id, collection: c.collection, record_id: c.record_id, winner });
    return sendJson(res, 200, { ok: true, conflict: c });
  }

  return { apiList, apiResolve };
}

module.exports = { createConflicts };
