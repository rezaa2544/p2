/* ═══════════════════════════════════════════════════════════════════
   server/pull.js — Scoped General Pull & Delta Sync Endpoint (A01)
   -------------------------------------------------------------------
   GET /api/v1/pull?since=<iso>&collections=<c1,c2,...>&school_id=<id>
   - Scoped dataset extraction per role & school
   - Differential / delta change calculation via updated_at & tombstones
   - Projections and sensitive field masking
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const url = require('url');
const { projectUserByRole } = require('./middleware/projection');
const { deltaRowsSql } = require('./syncdelta'); /* Wave 4 (chat2) */
const { createCursor } = require('./cursor'); /* Delta Hardening Phase 2 (gap 2) */
const { sendJsonCompressed } = require('./compress'); /* Delta Phase 4 (gap 2) */
const metrics = require('./metrics'); /* Delta Phase 4 (gaps 2+4) */

/* ── Gap 1 (Delta Hardening Phase 2): long-lived delta cutoff ─────────
   A delta whose `since` is older than DELTA_MAX_AGE_DAYS (default 7) is
   upgraded to a FULL snapshot: the delta window grows unboundedly for
   offline clients, tombstone/compaction retention is not guaranteed
   beyond the window, and re-scanning 7+ days defeats the point of a
   delta. The response still carries tombstones after `since` so old
   clients converge correctly, plus the explicit flag
   `full_snapshot_required: true` (new clients may clear delta state).
   Read per-request (not at module load) so deployments can tune it and
   tests can override it without a process restart. */
function deltaMaxAgeMs() {
  const d = Number(process.env.PAYESH_DELTA_MAX_AGE_DAYS);
  const days = (Number.isFinite(d) && d > 0) ? d : 7;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * ایجاد کنترلر دریافت داده‌ها و دلتاهای سرور
 * @param {object} ctx
 */
function createPull(ctx) {
  const store = ctx.store;
  const db = ctx.db; /* Wave 1 (chat2): unified read seam — PG when active, JSON store otherwise */
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  /* Gap 2: signed, TTL-bound cursor. ctx.cursor may carry a pre-built signer
     (tests); ctx.cursorSecret a raw key; otherwise the module resolves from
     env (PAYESH_CURSOR_SECRET / PAYESH_JWT_SECRET). No key ⇒ disabled. */
  const cursor = ctx.cursor || createCursor({ secret: ctx.cursorSecret });

  /**
   * Wave 1: single read seam for pulling a collection's raw rows. When the
   * unified db layer is wired (index.js passes db) rows come through
   * db.readCollection (PostgreSQL when active; the JSON store in fallback —
   * identical rows). When db is absent (isolated tests, e.g. pull-bootstrap.js)
   * it reads the store directly. Internal store keys (__deleted_records,
   * __server_version, …) and the cross-collection lookups inside
   * filterCollectionForSession (store.users / schedule / enrollments used to
   * compute a session's scope) are intentionally still served from `store` in
   * this Wave-1 part — they are real-store metadata / scope aids, not the
   * requested data payload. See docs/WAVE1_READS_INVENTORY.md.
   */
  async function readCol(c) {
    if (db && typeof db.readCollection === 'function') {
      const rows = await db.readCollection(c);
      return Array.isArray(rows) ? rows : [];
    }
    return (store && Array.isArray(store[c])) ? store[c] : [];
  }

  /**
   * Wave 4: DB-native delta fetch — pushes the `(created_at|updated_at) > since`
   * predicate + stable (updated_at, id) ordering down to PostgreSQL so a delta
   * pull returns only rows changed after `since`, not the whole table. Runs
   * ONLY when PostgreSQL is live. Role/school scope is applied afterwards by
   * filterCollectionForSession (scope only ever removes rows, so it cannot add
   * back a row the delta predicate excluded).
   *
   * ⚠️ If a pull table lacks the timestamp columns the query transparently
   * falls back to the full-table fetch (behaviour identical to before) — so a
   * partial schema can never break a delta pull. Real-PG run documented PENDING
   * in docs/SYNC_PROTOCOL.md.
   */
  async function fetchDeltaRows(c, sinceISO) {
    if (!(db && typeof db.isPostgres === 'function' && db.isPostgres()
          && typeof db.query === 'function')) return null;
    try {
      const built = deltaRowsSql(c, { sinceISO });
      const res = await db.query(built.sql, built.params);
      return Array.isArray(res && res.rows) ? res.rows : [];
    } catch (e) {
      // timestamp columns absent or DB hiccup → fall back to full-table read
      return null;
    }
  }

  /**
   * فیلتر کردن رکوردهای یک مجموعه بر اساس نقش و محدوده کاربر
   */
  function filterCollectionForSession(c, records, session) {
    if (!Array.isArray(records)) return [];
    const role = session.role;
    const userId = Number(session.id);
    const schoolId = session.school_id != null ? Number(session.school_id) : null;

    if (role === 'superadmin') {
      return records;
    }

    if (c === 'schools') {
      return records.filter(s => Number(s.id) === schoolId);
    }

    if (c === 'users') {
      if (role === 'manager' || role === 'counselor') {
        return records.filter(u => Number(u.school_id) === schoolId).map(u => projectUserByRole(u, role));
      }
      if (role === 'teacher') {
        return records.filter(u => Number(u.school_id) === schoolId).map(u => projectUserByRole(u, role));
      }
      if (role === 'student') {
        return records.filter(u => Number(u.id) === userId).map(u => projectUserByRole(u, role));
      }
      if (role === 'parent') {
        // اولیا به رکوردهای فرزندان و خودشان دسترسی دارند
        const children = (store.users || []).filter(u => u.role === 'student' && (u.parent_id === userId || (u.parent_national_ids && u.parent_national_ids.includes(session.national_id))));
        const childIds = children.map(ch => ch.id).concat([userId]);
        return records.filter(u => childIds.includes(u.id)).map(u => projectUserByRole(u, role));
      }
      return records.filter(u => Number(u.school_id) === schoolId).map(u => projectUserByRole(u, role));
    }

    if (c === 'classes') {
      if (role === 'manager' || role === 'counselor') {
        return records.filter(cl => Number(cl.school_id) === schoolId);
      }
      if (role === 'teacher') {
        // کلاس‌های سرپرستی یا تدریس
        const schedules = (store.schedule || []).filter(sc => Number(sc.teacher_id) === userId);
        const taughtClassIds = schedules.map(sc => Number(sc.class_id));
        return records.filter(cl => Number(cl.school_id) === schoolId && (Number(cl.homeroom_teacher_id) === userId || taughtClassIds.includes(Number(cl.id))));
      }
      if (role === 'student') {
        const enr = (store.enrollments || []).filter(e => Number(e.student_id) === userId);
        const clsIds = enr.map(e => Number(e.class_id));
        return records.filter(cl => clsIds.includes(Number(cl.id)));
      }
      if (role === 'parent') {
        const children = (store.users || []).filter(u => u.role === 'student' && u.parent_id === userId);
        const childIds = children.map(ch => ch.id);
        const enr = (store.enrollments || []).filter(e => childIds.includes(Number(e.student_id)));
        const clsIds = enr.map(e => Number(e.class_id));
        return records.filter(cl => clsIds.includes(Number(cl.id)));
      }
      return records.filter(cl => Number(cl.school_id) === schoolId);
    }

    if (c === 'subjects') {
      return records; // دروس عمومی و پایه
    }

    if (c === 'notifications') {
      return records.filter(n => Number(n.user_id) === userId);
    }

    if (c === 'announcements') {
      return records.filter(a => a.school_id == null || Number(a.school_id) === schoolId);
    }

    if (c === 'grades' || c === 'attendance' || c === 'discipline') {
      if (role === 'manager' || role === 'counselor') {
        return records.filter(r => Number(r.school_id) === schoolId);
      }
      if (role === 'teacher') {
        // نمرات و حضور و غیاب کلاس‌های معلم
        const schedules = (store.schedule || []).filter(sc => Number(sc.teacher_id) === userId);
        const taughtClassIds = schedules.map(sc => Number(sc.class_id));
        const taughtSubjectIds = schedules.map(sc => Number(sc.subject_id));
        return records.filter(r => Number(r.school_id) === schoolId && (taughtClassIds.includes(Number(r.class_id)) || taughtSubjectIds.includes(Number(r.subject_id)) || Number(r.teacher_id) === userId));
      }
      if (role === 'student') {
        return records.filter(r => Number(r.student_id) === userId);
      }
      if (role === 'parent') {
        const children = (store.users || []).filter(u => u.role === 'student' && u.parent_id === userId);
        const childIds = children.map(ch => ch.id);
        return records.filter(r => childIds.includes(Number(r.student_id)));
      }
      return records.filter(r => Number(r.school_id) === schoolId);
    }

    // مجموعه‌های عمومی مدرسه
    return records.filter(r => r.school_id == null || Number(r.school_id) === schoolId);
  }

  /**
   * پردازش درخواست GET /api/v1/pull
   */
  async function apiPull(req, res) {
    const session = await sessionFrom(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
    }

    /* Gap 2 (Delta Hardening Phase 2): the request snapshot clock is captured
       BEFORE any data read — the response `server_time`/next-cursor `since` is
       this moment. Using a post-read timestamp could silently skip rows that
       changed between the read and the response build (the next delta would
       start after them). Slight overlap on retry is harmless (idempotent merge). */
    const startedAtIso = new Date().toISOString();

    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};
    const cursorToken = query.cursor ? String(query.cursor) : null;

    /* Gap 2: a presented cursor token is verified fail-closed. The signed
       `since` inside the token wins over any query-string `since` (the token
       is authenticated; the query param is a client claim). */
    if (cursorToken) {
      const v = cursor.verify(cursorToken);
      if (!v.ok) {
        /* Delta Phase 4 (gap 4): دیده‌بانیِ چرخهٔ عمرِ کرسر. */
        if (v.code === 'cursor_expired') metrics.inc('payesh_cursor_expired_total');
        if (v.code === 'region_mismatch') metrics.inc('payesh_cursor_region_mismatch_total');
        /* 401 + machine-readable code; the client renews with one full pull
           (its response always carries a fresh next_cursor). */
        return sendJson(res, 401, {
          ok: false,
          code: v.code, /* cursor_expired | cursor_invalid | cursor_unavailable */
          message: v.code === 'cursor_expired'
            ? 'کرسر دلتا منقضی شده است — یک pull کامل بگیرید'
            : v.code === 'region_mismatch'
              ? 'کرسر دلتا در منطقهٔ دیگری صادر شده است — یک pull کامل بگیرید'
              : 'کرسر دلتا نامعتبر است',
          cursor_renewal: 'full_pull'
        });
      }
      query.since = v.payload.since;
    }

    const since = query.since ? String(query.since) : null;
    const sinceTime = since ? new Date(since).getTime() : 0;
    const isDelta = !!since && !isNaN(sinceTime) && sinceTime > 0;

    /* Gap 1: too-old delta → force a full snapshot (with tombstones after
       `since` so both old and new clients converge). */
    const sinceTooOld = isDelta && (Date.now() - sinceTime > deltaMaxAgeMs());
    const forceFull = sinceTooOld;

    const requestedCols = query.collections ? String(query.collections).split(',').map(s => s.trim()).filter(Boolean) : null;

    // مجموعه‌های استاندارد سامانه
    const ALL_COLLECTIONS = [
      'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
      'attendance', 'grades', 'discipline', 'leaves', 'notifications',
      'announcements', 'hw_assignments', 'hw_submissions', 'vclass_sessions',
      'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
    ];

    const targetCols = requestedCols ? requestedCols.filter(c => store[c] != null || ALL_COLLECTIONS.includes(c)) : ALL_COLLECTIONS;

    const resultCollections = {};
    for (const c of targetCols) {
      /* Wave 4: in PG-live delta mode, ask the DB for only rows changed after
         `since` (no full-table scan). Returns null → fall back to full read.
         Gap 1: a forced-full pull skips the delta predicate entirely. */
      let rawList;
      if (isDelta && !forceFull) {
        rawList = await fetchDeltaRows(c, since); // null ⇒ fall back below
      }
      if (!isDelta || forceFull || rawList == null) {
        rawList = await readCol(c);
      }
      const scopedList = filterCollectionForSession(c, rawList, session);

      if (isDelta && !forceFull) {
        // JS time filter is kept as a harmless second guard (DB already bounded
        // the set, and the memory fallback still needs it).
        resultCollections[c] = scopedList.filter(r => {
          const upAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
          const crAt = r.created_at ? new Date(r.created_at).getTime() : 0;
          return upAt > sinceTime || crAt > sinceTime;
        });
      } else {
        resultCollections[c] = scopedList;
      }
    }

    // استخراج رکوردهای حذف‌شده (Tombstones) در حالت Delta
    /* Gap 1: tombstones are ALSO returned on a forced-full snapshot (they are
       the only way an old client learns about deletions inside the skipped
       window), so `isDelta` (a `since` was presented) — not full_snapshot —
       gates this block. */
    let deletedRecords = [];
    if (isDelta && Array.isArray(store.__deleted_records)) {
      const schoolId = session.school_id != null ? Number(session.school_id) : null;
      deletedRecords = store.__deleted_records.filter(d => {
        const dAt = d.at ? new Date(d.at).getTime() : 0;
        if (dAt <= sinceTime) return false;
        if (session.role === 'superadmin') return true;
        if (d.school_id == null || Number(d.school_id) === schoolId) return true;
        return false;
      }).map(d => ({ c: d.c, id: d.id, at: d.at }));
    }

    /* Gap 2: mint the next cursor over this response's snapshot moment. Only
       when cursor signing is enabled (a key exists); legacy clients simply
       keep using `server_time` as their next `since`. */
    const nextCursor = cursor.enabled ? cursor.sign(startedAtIso) : null;

    const body = {
      ok: true,
      server_time: startedAtIso,
      since: since,
      full_snapshot: !isDelta || forceFull,
      full_snapshot_required: forceFull ? true : undefined,
      full_snapshot_reason: forceFull ? 'since_too_old' : undefined,
      next_cursor: nextCursor != null ? nextCursor : undefined,
      cursor_ttl_s: cursor.enabled ? cursor.ttlS : undefined,
      server_version: store.__server_version || 1,
      collections: resultCollections,
      deleted: deletedRecords
    };

    /* Delta Phase 4 — gap 4: شمارندهٔ پول‌ها (delta/full) پیش از فرستتن. */
    metrics.inc('payesh_sync_pulls_total', { mode: (isDelta && !forceFull) ? 'delta' : 'full' });

    /* Delta Phase 4 — gap 2: فشرده‌سازیِ مذاکره‌شده (gzip ارجح، br جایگزین)
       + سنجه‌های حجم (خام و سیم). res بدونِ writeHead (هارنس قدیمی) =
       عیناً مسیرِ پیشین. */
    /* S9-3: فشرده‌سازی ناهمگام است — await لازم است تا پاسخ و متریک‌ها
       پیش از بازگشتِ هندلر کامل شوند (قراردادِ پیشین از دیدِ فراخوان). */
    const encInfo = await sendJsonCompressed(res, req, 200, body, sendJson);
    metrics.observe('payesh_sync_delta_size_bytes', [], encInfo.rawBytes);
    metrics.observe('payesh_sync_delta_wire_bytes', [], encInfo.wireBytes);
    if (encInfo.encoding) {
      metrics.inc('payesh_sync_delta_compressions_total', { encoding: encInfo.encoding });
    }
    /* حفظِ قراردادِ قبلی: مقدارِ بازگشتیِ sendJson به فراخوان عیناً برمی‌گردد
       (هارنس‌های قدیمی روی آن حساب می‌کنند). */
    return encInfo.reply;
  }

  return {
    apiPull,
    filterCollectionForSession,
    /* Delta Phase 4 (gap 3): introspection — سلامتِ بوت و /api/health
       می‌پرسند کلیدِ کرسر پایدار است یا نه. */
    cursor
  };
}

module.exports = {
  createPull
};
