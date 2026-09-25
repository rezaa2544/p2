/* ═══════════════════════════════════════════════════════════════════
   server/conflicts.js — GET /api/sync/conflicts & POST /api/sync/resolve-conflict
   ───────────────────────────────────────────────────────────────────
   Contracts:
     • docs/SERVER_SECURITY_CONTRACT.md §3.4
     • docs/MIGRATION_GUIDE.md §8 (013_universal_occ_and_sequences.sql)
   Authorization:
     • list & resolve require `manager` or `superadmin`
     • `manager` is strictly scoped to their own `school_id`
       (school_id == null conflicts are global and visible to any manager)
     • `superadmin` sees and resolves across all schools
   Persistence:
     • SSoT when PostgreSQL is live: PostgreSQL `sync_conflicts` table
     • In-memory fallback (`store.sync_conflicts`) for dev/test
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

function shallowTrim(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const k of Object.keys(obj)) {
    out[k] = typeof obj[k] === 'string' ? obj[k].trim() : obj[k];
  }
  return out;
}

function createConflicts(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const sessionFrom = ctx.sessionFrom;
  const audit = ctx.audit || (() => {});

  async function apiList(req, res) {
    const s = await sessionFrom(req);
    if (!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if (s.role !== 'manager' && s.role !== 'superadmin')
      return sendJson(res, 403, { ok: false, code: 'role_denied' });

    /* P1-06: PostgreSQL is SSoT for sync_conflicts when live */
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    if (pgLive && typeof db.query === 'function') {
      try {
        let sql = 'SELECT id, collection, record_id, school_id, base_version, server_version, server_state, incoming, status, winner, resolved_by, resolved_at, reason, created_at, updated_at FROM sync_conflicts WHERE 1=1';
        const params = [];
        if (s.role === 'manager') {
          sql += ' AND (school_id IS NULL OR school_id = $1)';
          params.push(s.school_id);
        }
        sql += ' ORDER BY CASE WHEN status = \'open\' THEN 0 ELSE 1 END, created_at DESC LIMIT 50';
        const resPg = await db.query(sql, params);
        if (resPg && resPg.rows) {
          return sendJson(res, 200, { ok: true, conflicts: resPg.rows });
        }
      } catch (err) {
        console.error('[CONFLICTS] PG apiList query failed, falling back to cache:', err.message);
      }
    }

    if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    const scoped = s.role === 'manager'
      ? store.sync_conflicts.filter(c => c.school_id == null || Number(c.school_id) === Number(s.school_id))
      : store.sync_conflicts;
    scoped.sort((a, b) =>
      ((a.status === 'open') === (b.status === 'open') ? 0 : (a.status === 'open' ? -1 : 1))
      || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return sendJson(res, 200, { ok: true, conflicts: scoped.slice(0, 50) });
  }

  async function apiResolve(req, res, body) {
    const s = await sessionFrom(req);
    if (!s) return sendJson(res, 401, { ok: false, code: 'no_session' });
    if (s.role !== 'manager' && s.role !== 'superadmin')
      return sendJson(res, 403, { ok: false, code: 'role_denied' });

    const trimmed = shallowTrim(body);
    const conflictId = trimmed.conflict_id || trimmed.id;
    const winner = trimmed.winner; /* 'incoming' | 'server' */

    if (!conflictId) return sendJson(res, 400, { ok: false, code: 'missing_fields', field: 'conflict_id' });
    if (winner !== 'incoming' && winner !== 'server')
      return sendJson(res, 400, { ok: false, code: 'invalid_winner', message: 'winner باید incoming یا server باشد' });

    if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    let c = store.sync_conflicts.find(x => String(x.id) === String(conflictId));

    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    if (!c && pgLive && typeof db.query === 'function') {
      try {
        const resPg = await db.query('SELECT * FROM sync_conflicts WHERE id = $1', [conflictId]);
        if (resPg && resPg.rows && resPg.rows.length > 0) {
          c = resPg.rows[0];
          if (!store.sync_conflicts.some(x => String(x.id) === String(c.id))) {
            store.sync_conflicts.push(c);
          }
        }
      } catch (e) {
        console.error('[CONFLICTS] PG lookup for resolve failed:', e.message);
      }
    }

    if (!c) return sendJson(res, 404, { ok: false, code: 'not_found' });

    if (s.role === 'manager' && c.school_id != null && Number(c.school_id) !== Number(s.school_id))
      return sendJson(res, 403, { ok: false, code: 'out_of_scope' });

    if (c.status === 'resolved')
      return sendJson(res, 409, { ok: false, code: 'already_resolved' });

    const coll = c.collection;
    if (!Array.isArray(store[coll])) store[coll] = [];
    const targetId = Number(c.record_id);
    let target = store[coll].find(x => Number(x.id) === targetId);

    if (winner === 'incoming') {
      let incData = c.incoming;
      if (typeof incData === 'string') {
        try { incData = JSON.parse(incData); } catch (e) { incData = {}; }
      }
      /* P0 fix (Phase-2 remediation, found live via R95 server15 C15): incoming
         is stored as the ENVELOPE { data, by, at, op_uid } — the adjudicator's
         payload lives under .data. Applying the envelope verbatim wrote junk
         fields (data/by/at) onto the record and never landed the client's
         values, so 'incoming wins' silently did nothing (score stayed 12.5).
         Unwrap the envelope first. */
      if (incData && typeof incData === 'object' && incData.data && typeof incData.data === 'object') incData = incData.data;
      if (!incData || typeof incData !== 'object') incData = {};

      /* A-18: تعارضِ سراسری (school_id == null) نباید به مدیرِ یک مدرسه اجازهٔ
         بازنویسیِ رکوردِ مدرسه‌ای دیگر را بدهد. مدرسهٔ ردیفِ تعارض کافی نیست
         (ممکن است null باشد) — دامنه را رویِ خودِ رکوردِ هدف می‌سنجیم. */
      if (s.role === 'manager') {
        const recSchool = target ? target.school_id : incData.school_id;
        if (recSchool != null && Number(recSchool) !== Number(s.school_id))
          return sendJson(res, 403, { ok: false, code: 'out_of_scope', message: 'رکوردِ هدف خارج از محدودهٔ مدرسهٔ شماست' });
      }

      /* A-18: نسخهٔ جدید باید از هر دو بزرگتر باشد — نسخهٔ زندهٔ رکوردِ هدف
         و نسخهٔ ثبت‌شدهٔ تعارض. مشتق‌کردن فقط از c.server_versionِ قدیمی،
         رکورد را به گذشته برمی‌گرداند (مثلاً ۱۰ ← ۴). */
      const curVer = target ? (Number(target.version) || 0) : 0;
      const nextVer = Math.max(curVer, Number(c.server_version) || 0) + 1;
      const patch = Object.assign({}, incData, { id: targetId, version: nextVer });

      if (target) {
        Object.assign(target, patch);
      } else {
        store[coll].push(patch);
        target = patch;
      }

      if (pgLive && typeof db.persistOpsBatch === 'function') {
        try {
          await db.persistOpsBatch([{
            c: coll,
            t: target ? 'upd' : 'ins',
            id: targetId,
            data: patch
          }]);
        } catch (e) {
          console.error('[CONFLICTS] PG apply incoming failed:', e.message);
        }
      }
    }

    c.status = 'resolved';
    c.winner = winner;
    c.resolved_by = s.id;
    c.resolved_at = new Date().toISOString();
    c.updated_at = c.resolved_at;
    if (body.reason) c.reason = String(body.reason).slice(0, 200);

    /* P1-06: Persist resolved conflict state to PostgreSQL SSoT */
    if (pgLive && db && typeof db.query === 'function') {
      try {
        await db.query(
          `UPDATE sync_conflicts
              SET status = $2, winner = $3, resolved_by = $4,
                  resolved_at = $5, updated_at = $6, reason = $7
            WHERE id = $1`,
          [c.id, 'resolved', winner, s.id, c.resolved_at, c.updated_at, c.reason || null]
        );
      } catch (pgErr) {
        console.error('[CONFLICTS] Failed to update sync_conflicts status in PG:', pgErr.message);
      }
    }

    ctx.markDirty();
    audit('sync_conflict_resolved', {
      user_id: s.id,
      conflict_id: c.id,
      collection: coll,
      winner: winner,
      school_id: c.school_id
    });

    return sendJson(res, 200, {
      ok: true,
      conflict: c,
      applied_data: winner === 'incoming' ? target : (c.server_state || target)
    });
  }

  return { apiList, apiResolve };
}

module.exports = { createConflicts };
