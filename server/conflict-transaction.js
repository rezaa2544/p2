'use strict';
// A-18: conflict and target share one authoritative transaction, not cache state.
const { AUTHZ, PROTECTED_FIELDS, OWNERSHIP_KEYS, fieldGate } = require('./sync');
async function selectOneForUpdate(client, sqlBase, params) {
  try {
    return (await client.query(sqlBase + ' FOR UPDATE', params)).rows[0];
  } catch (e) {
    if (/Not supported/i.test(String(e && e.message))) {
      return (await client.query(sqlBase, params)).rows[0];
    }
    throw e;
  }
}

async function resolveTransaction(db, session, id, winner, reason) {
  const reject = (status, code) => ({ status, body: { ok: false, code } });
  return db.transaction(async client => {
    if (!client) throw new Error('PostgreSQL unavailable');
    const c = await selectOneForUpdate(client, 'SELECT * FROM sync_conflicts WHERE id=$1', [id]);
    if (!c) return reject(404, 'not_found');
    if (session.role === 'manager' && (c.school_id == null || Number(c.school_id) !== Number(session.school_id))) return reject(403, 'out_of_scope');
    if (c.status !== 'open') return reject(409, 'already_resolved');
    if (!Object.prototype.hasOwnProperty.call(AUTHZ, c.collection) || !/^[a-z_]+$/.test(c.collection)) return reject(400, 'invalid_collection');
    const table = '"' + c.collection + '"';
    let target = await selectOneForUpdate(client, 'SELECT * FROM ' + table + ' WHERE id=$1', [c.record_id]);
    if (!target) return reject(409, 'target_missing');
    if (session.role === 'manager' && (target.school_id == null || Number(target.school_id) !== Number(session.school_id))) return reject(403, 'out_of_scope');
    if (winner === 'incoming') {
      if (Number(target.version) !== Number(c.server_version)) return reject(409, 'stale_conflict');
      let incoming = c.incoming;
      if (typeof incoming === 'string') { try { incoming = JSON.parse(incoming); } catch (_) { return reject(400, 'invalid_incoming'); } }
      if (incoming && incoming.data) incoming = incoming.data;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return reject(400, 'invalid_incoming');
      // Resolution is not an ownership/privilege escalation or metadata edit.
      const protectedKeys = new Set(PROTECTED_FIELDS.filter(k => k !== 'status').concat([OWNERSHIP_KEYS[c.collection]]));
      const metadata = new Set(['id','version','base_version','created_at','updated_at']);
      const patch = {};
      for (const [key,value] of Object.entries(incoming)) {
        if (key === 'id' && Number(value) !== Number(c.record_id)) return reject(400, 'invalid_incoming');
        if (metadata.has(key)) continue;
        if (protectedKeys.has(key)) {
          if (value != target[key]) return reject(403, 'protected_field');
          continue;
        }
        patch[key] = value;
      }
      if (fieldGate({ c:c.collection, t:'upd', id:c.record_id, data:patch }, session)) return reject(403, 'field_denied');
      for (const key of Object.keys(patch)) {
        if (!Object.prototype.hasOwnProperty.call(target,key)) return reject(400,'invalid_incoming');
      }
      if (require('./validate').validateSyncData(c.collection, patch, 'upd')) return reject(400, 'invalid_incoming');
      patch.updated_at = new Date().toISOString();
      await db.persistOpsBatchWithClient(client, [{ c: c.collection, t:'upd', id:c.record_id, base_version:Number(target.version), data:patch }]);
      target = (await client.query('SELECT * FROM '+table+' WHERE id=$1', [c.record_id])).rows[0];
    }
    const resolved = (await client.query(
      "UPDATE sync_conflicts SET status='resolved', winner=$2, resolved_by=$3, resolved_at=NOW(), updated_at=NOW(), reason=$4 WHERE id=$1 RETURNING *",
      [c.id,winner,session.id,reason ? String(reason).slice(0,200) : c.reason || null])).rows[0];
    return { status:200, body:{ok:true, conflict:resolved, applied_data:target} };
  });
}
module.exports = { resolveTransaction };
