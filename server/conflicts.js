/* ═══════════════════════════════════════════════════════════════════
   server/conflicts.js — GET /api/sync/conflicts & POST /api/sync/resolve-conflict
   ───────────────────────────────────────────────────────────────────
   Contracts:
     • docs/SERVER_SECURITY_CONTRACT.md §3.4
     • docs/MIGRATION_GUIDE.md §8 (013_universal_occ_and_sequences.sql)
   Authorization:
     • list & resolve require `manager` or `superadmin`
     • `manager` is strictly scoped to their own `school_id`
       (global conflicts require superadmin)
     • `superadmin` sees and resolves across all schools
   Persistence:
     • SSoT when PostgreSQL is live: PostgreSQL `sync_conflicts` table
     • In-memory fallback (`store.sync_conflicts`) for dev/test
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

function defaultSendJson(res, statusCode, data) {
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
  const sendJson = ctx.sendJson || defaultSendJson;
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
          sql += ' AND school_id = $1';
          params.push(s.school_id);
        }
        sql += ' ORDER BY CASE WHEN status = \'open\' THEN 0 ELSE 1 END, created_at DESC LIMIT 50';
        const resPg = await db.query(sql, params);
        if (resPg && resPg.rows) {
          return sendJson(res, 200, { ok: true, conflicts: resPg.rows });
        }
      } catch (err) {
        return sendJson(res, 503, { ok: false, code: 'pg_unavailable' });
      }
    }

    if (pgLive) return sendJson(res, 503, { ok: false, code: 'pg_unavailable' });
    if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
    const scoped = s.role === 'manager'
      ? store.sync_conflicts.filter(c => c.school_id != null && Number(c.school_id) === Number(s.school_id))
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

    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    if (Object.keys(body).some(k => !['conflict_id','id','winner','reason'].includes(k))) return sendJson(res, 400, { ok: false, code: 'unknown_field' });
    const suppliedId = body.conflict_id !== undefined ? body.conflict_id : body.id;
    if (typeof suppliedId !== 'number' || !Number.isSafeInteger(suppliedId) || suppliedId < 1 ||
        (body.id !== undefined && body.conflict_id !== undefined && body.id !== body.conflict_id) ||
        !['incoming','server'].includes(body.winner) ||
        (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 200))) {
      return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    }
    const trimmed = shallowTrim(body);
    const conflictId = trimmed.conflict_id || trimmed.id;
    const winner = trimmed.winner; /* 'incoming' | 'server' */

    if (!conflictId) return sendJson(res, 400, { ok: false, code: 'missing_fields', field: 'conflict_id' });
    if (winner !== 'incoming' && winner !== 'server')
      return sendJson(res, 400, { ok: false, code: 'invalid_winner', message: 'winner باید incoming یا server باشد' });

    // A-18: PostgreSQL is authoritative; never adjudicate a cached conflict.
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    const { AUTHZ, fieldGate } = require('./sync');
    const { validateSyncData } = require('./validate');
    function reject(status, code) { const e = new Error(code); e.status = status; e.code = code; throw e; }
    function prepare(c, target) {
      if (!c) reject(404, 'not_found');
      if (s.role === 'manager' && (c.school_id == null || Number(c.school_id) !== Number(s.school_id))) reject(403, 'out_of_scope');
      if (c.status !== 'open') reject(409, 'already_resolved');
      if (target && s.role === 'manager' && Number(target.school_id) !== Number(s.school_id)) reject(403, 'out_of_scope');
      if (winner !== 'incoming') return null;
      if (!target) reject(409, 'target_deleted'); // Never resurrect a deleted row.
      const version = Number(target.version || 1);
      if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER ||
          !Number.isSafeInteger(Number(c.server_version)) || Number(c.server_version) !== version) reject(409, 'stale_conflict');
      let data = c.incoming;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { reject(400, 'invalid_conflict_payload'); } }
      if (data && data.data) data = data.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) reject(400, 'invalid_conflict_payload');
      data = Object.assign({}, data);
      if (data.id != null && Number(data.id) !== Number(target.id)) reject(400, 'record_identity_mismatch');
      for (const key of ['id', 'version', 'base_version', 'created_at', 'updated_at']) delete data[key];
      const coll = c.collection === 'students' ? 'users' : c.collection;
      const op = { c: coll, t: 'upd', id: target.id, data };
      const field = fieldGate(op, s, false);
      if (field) reject(403, field.code);
      if (validateSyncData(coll, op.data, 'upd')) reject(400, 'validation_failed');
      return Object.assign({}, op.data, { version: version + 1, updated_at: new Date().toISOString() });
    }
    async function work(client) {
      const c = client
        ? (await client.query('SELECT * FROM sync_conflicts WHERE id = $1 FOR UPDATE', [conflictId])).rows[0]
        : (store.sync_conflicts || []).find(x => String(x.id) === String(conflictId));
      if (!c) reject(404, 'not_found');
      const coll = c.collection === 'students' ? 'users' : c.collection;
      if (!Object.prototype.hasOwnProperty.call(AUTHZ, coll) || !/^[a-z_]+$/.test(coll)) reject(400, 'unknown_collection');
      // Check scope before reading a foreign target, even for server-wins.
      if (s.role === 'manager' && (c.school_id == null || Number(c.school_id) !== Number(s.school_id))) reject(403, 'out_of_scope');
      const target = client
        ? (await client.query('SELECT * FROM "' + coll + '" WHERE id = $1 FOR UPDATE', [c.record_id])).rows[0]
        : (store[coll] || []).find(x => Number(x.id) === Number(c.record_id));
      const patch = prepare(c, target);
      const resolved = Object.assign({}, c, { status: 'resolved', winner, resolved_by: s.id,
        resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(), reason: trimmed.reason ? String(trimmed.reason).slice(0, 200) : null });
      let applied = target || null;
      if (client) {
        if (patch) {
          await db.persistOpWithClient(client, { c: coll, t: 'upd', id: target.id, base_version: Number(target.version || 1), data: patch });
          applied = (await client.query('SELECT * FROM "' + coll + '" WHERE id = $1', [target.id])).rows[0];
        }
        const r = await client.query("UPDATE sync_conflicts SET status='resolved', winner=$2, resolved_by=$3, resolved_at=$4, updated_at=$4, reason=$5 WHERE id=$1 AND status='open'", [c.id, winner, s.id, resolved.resolved_at, resolved.reason]);
        if (r.rowCount !== 1) reject(409, 'already_resolved');
      } else {
        // No await between comparison and both mutations in memory mode.
        if (patch) Object.assign(target, patch);
        Object.assign(c, resolved);
      }
      return { conflict: resolved, applied_data: applied, coll };
    }
    try {
      if (pgLive && (typeof db.transaction !== 'function' || typeof db.persistOpWithClient !== 'function')) reject(503, 'pg_unavailable');
      const result = pgLive ? await db.transaction(work) : await work(null);
      // Publish cache only after the database transaction has committed.
      if (pgLive) {
        if (!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
        const old = store.sync_conflicts.find(x => String(x.id) === String(conflictId));
        if (old) Object.assign(old, result.conflict); else store.sync_conflicts.push(result.conflict);
        if (result.applied_data) {
          const cached = (store[result.coll] || []).find(x => Number(x.id) === Number(result.applied_data.id));
          if (cached) Object.assign(cached, result.applied_data);
        }
      }
      // Bounded dev/offline cache retention; PG retains authoritative audit rows.
      if (!pgLive) {
        const raw = Number(process.env.PAYESH_RESOLVED_CONFLICTS_MAX || 1000);
        const cap = Number.isSafeInteger(raw) && raw > 0 ? raw : 1000;
        const resolved = (store.sync_conflicts || []).filter(x => x.status === 'resolved')
          .sort((a,b) => String(b.resolved_at || '').localeCompare(String(a.resolved_at || '')));
        const removed = new Set(resolved.slice(cap));
        if (removed.size) {
          if (!Array.isArray(store.__deleted_records)) store.__deleted_records = [];
          for (const c of removed) store.__deleted_records.push({ c: 'sync_conflicts', id: c.id, school_id: c.school_id, at: new Date().toISOString() });
          store.sync_conflicts = store.sync_conflicts.filter(c => !removed.has(c));
          store.__deleted_records = store.__deleted_records.slice(-5000);
        }
      }
      ctx.markDirty();
      audit('sync_conflict_resolved', { user_id: s.id, conflict_id: result.conflict.id, collection: result.coll, winner, school_id: result.conflict.school_id });
      return sendJson(res, 200, { ok: true, conflict: result.conflict, applied_data: result.applied_data });
    } catch (e) {
      const status = [400,403,404,409].includes(e.status) ? e.status : 503;
      return sendJson(res, status, { ok: false, code: status === 503 ? 'pg_unavailable' : e.code });
    }
  }

  return { apiList, apiResolve };
}

module.exports = { createConflicts };
