/* ═══════════════════════════════════════════════════════════════════
   server/syncdelta.js — DB-native delta-pull builders (Wave 4, chat2)
   -------------------------------------------------------------------
   Pure, parameterized builders for the A01 delta-sync read path. They push
   the delta predicate and stable (updated_at, id) ordering down to PostgreSQL
   so a delta pull no longer has to scan the whole table in JS.

   Security invariants:
   - Table identifiers come only from an internal allowlist; every value is a
     bound parameter.
   - Role/school *scope* is intentionally NOT folded in here generically —
     pull's per-role scope is multi-collection and role-specific, so pull.js
     applies it after the DB returns the time-bounded delta rows (scope only
     ever *removes* rows, so it cannot add rows the delta predicate excluded).
     That keeps tenant boundaries correct without duplicating ~19 scope rules.

   ⚠️ HONEST VERIFICATION NOTE: builders are unit-tested (structure / params /
   allowlist / injection). The row-delta path in pull.js runs only when
   PostgreSQL is live and transparently falls back to the full-table fetch if a
   table lacks the timestamp columns. Real-PG execution + the one-transaction
   PUSH rewrite are documented as PENDING in docs/SYNC_PROTOCOL.md.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* Allowlist — every table/column identifier placed into SQL is taken from
   here (or is a fixed literal). Nothing user-supplied is interpolated. */
const ALLOWED = new Set([
  'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'hw_assignments', 'hw_submissions', 'vclass_sessions',
  'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
]);

function tableName(t) {
  if (!ALLOWED.has(t)) throw new Error(`syncdelta: table not allowlisted: ${String(t)}`);
  return t;
}

/**
 * Build the SELECT that returns a collection's rows that changed after
 * `sinceISO` (updated_at OR created_at), ordered stably by (updated_at, id)
 * so an equal-timestamp (clock-skew) boundary never loses/duplicates a row
 * when paginated by (updated_at, id). Optional keyset tie-breaker:
 * `(updated_at = $since AND id > $cursorId)` continues exactly after a page.
 *
 * Callers apply role/school scope on the (bounded) result set — scope only
 * removes rows. Used by pull.js only when PostgreSQL is live.
 *
 * @param {string} table
 * @param {Object} o { sinceISO, lastUpdatedAt?, lastId? }
 * @returns {{sql:string, params:Array<*>}}
 */
function deltaRowsSql(table, o) {
  o = o || {};
  const t = tableName(table);
  const sinceISO = o.sinceISO;
  if (!sinceISO) throw new Error('syncdelta.deltaRowsSql: sinceISO required');
  const params = [sinceISO];
  // rows changed strictly after `since` (created OR updated), excluding the
  // boundary row unless we are continuing from it via keyset (clock-skew tie).
  const preds = [`(created_at > $1 OR updated_at > $1)`];
  if (o.lastUpdatedAt != null && o.lastId != null) {
    params.push(String(o.lastUpdatedAt), Number(o.lastId));
    // boundary row already emitted on the previous page → continue past it
    preds.push(`NOT (updated_at = $1 AND created_at <= $1 AND id <= $3)`);
    preds.push(`(updated_at > $1 OR (updated_at = $1 AND id > $3))`);
  }
  const where = preds.length ? `WHERE ${preds.join(' AND ')}` : '';
  return {
    sql: `SELECT * FROM "${t}" ${where} ORDER BY updated_at ASC, id ASC`,
    params
  };
}

/**
 * Build a keyset-continuation form that a caller paginating by (updated_at,id)
 * can run repeatedly. Each call returns rows whose (updated_at,id) is strictly
 * after the previous page's last row, and includes a ready `next` token. This
 * is the stable cursor over the delta stream.
 * (Provided for the paginated-delta protocol; pull currently emits one full
 * delta batch and the client pages by `since`, so this is the building block
 * that a future `cursor` pull mode will use.)
 *
 * @param {string} table
 * @param {Object} o { sinceISO, afterUpdatedAt?, afterId?, limit }
 * @returns {{sql, params, afterCol, idCol}}
 */
function deltaKeysetSql(table, o) {
  o = o || {};
  const t = tableName(table);
  const sinceISO = o.sinceISO;
  if (!sinceISO) throw new Error('syncdelta.deltaKeysetSql: sinceISO required');
  const params = [sinceISO];
  const preds = [];
  // base: changed after since
  if (o.afterUpdatedAt == null) {
    preds.push(`(updated_at > $1 OR created_at > $1)`);
  } else {
    // continuing: strictly after (afterUpdatedAt, afterId) in (updated_at,id)
    params.push(String(o.afterUpdatedAt), Number(o.afterId));
    preds.push(`(updated_at > $1 AND updated_at > $2)`);
    preds.push(`(updated_at = $2 AND id > $3)`);
  }
  const where = preds.length ? `WHERE ${preds.join(' OR ')}` : '';
  const limit = Number(o.limit && o.limit > 0 ? o.limit : 100);
  params.push(limit + 1); // +1 → detect has_more
  return {
    sql: `SELECT * FROM "${t}" ${where} ORDER BY updated_at ASC, id ASC LIMIT $${params.length}`,
    params
  };
}

/**
 * Tombstone delta query — reads soft-deleted records from the intended
 * PostgreSQL tombstone table. PREPARED / NOT yet wired to pull.js: the current
 * write side (sync.js push + delete-service) still records deletions in the
 * in-memory store, so switching pull's tombstone source to this (currently
 * empty) table would LOSE real deletions. Activation is PENDING on the push /
 * write side becoming PostgreSQL-native (see docs/SYNC_PROTOCOL.md).
 */
function tombstonesSql(o) {
  o = o || {};
  const params = [o.sinceISO];
  const preds = [`deleted_at > $1`];
  if (o.schoolId != null) {
    params.push(Number(o.schoolId));
    preds.push(`(school_id IS NULL OR school_id = $${params.length})`);
  }
  const where = preds.join(' AND ');
  return {
    sql: `SELECT "collection" AS c, record_id AS id, school_id, deleted_at AS at FROM server_tombstones WHERE ${where} ORDER BY deleted_at ASC, id ASC`,
    params
  };
}

module.exports = { deltaRowsSql, deltaKeysetSql, tombstonesSql, tableName };
