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

/**
 * ایجاد کنترلر دریافت داده‌ها و دلتاهای سرور
 * @param {object} ctx
 */
function createPull(ctx) {
  const store = ctx.store;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;

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
    const session = sessionFrom(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, code: 'unauthorized', message: 'احراز هویت الزامی است' });
    }

    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};
    const since = query.since ? String(query.since) : null;
    const sinceTime = since ? new Date(since).getTime() : 0;
    const isDelta = !!since && !isNaN(sinceTime) && sinceTime > 0;

    const requestedCols = query.collections ? String(query.collections).split(',').map(s => s.trim()).filter(Boolean) : null;

    // مجموعه‌های استاندارد سامانه
    const ALL_COLLECTIONS = [
      'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
      'attendance', 'grades', 'discipline', 'leaves', 'notifications',
      'announcements', 'homework', 'hw_submissions', 'vclass_rooms',
      'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
    ];

    const targetCols = requestedCols ? requestedCols.filter(c => store[c] != null || ALL_COLLECTIONS.includes(c)) : ALL_COLLECTIONS;

    const resultCollections = {};
    for (const c of targetCols) {
      const rawList = store[c] || [];
      const scopedList = filterCollectionForSession(c, rawList, session);

      if (isDelta) {
        // فقط رکوردهایی که بعد از since تغییر کرده یا ایجاد شده‌اند
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

    return sendJson(res, 200, {
      ok: true,
      server_time: new Date().toISOString(),
      since: since,
      full_snapshot: !isDelta,
      server_version: store.__server_version || 1,
      collections: resultCollections,
      deleted: deletedRecords
    });
  }

  return {
    apiPull,
    filterCollectionForSession
  };
}

module.exports = {
  createPull
};
