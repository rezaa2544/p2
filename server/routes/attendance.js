/* ═══════════════════════════════════════════════════════════════════
   server/routes/attendance.js — RESTful Attendance API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/attendance (filter by date, class_id, student_id)
   - POST /api/v1/attendance (record daily attendance entry)
   - PATCH /api/v1/attendance/:id (update attendance status / late mins)
   - DELETE /api/v1/attendance/:id (delete attendance record)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { filterByScope } = require('../middleware/scope');
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { createPolicy } = require('../policy');

function createAttendanceRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});
  const policy = createPolicy({ store });
  const COLL = 'attendance';

  function denied(pa){
    return { status: pa.status, body: { ok: false, code: pa.code, message: pa.message } };
  }

  function getAttendanceList(req, urlParams) {
    const user = req.user;
    /* P0-03: هر endpoint از authorize می‌گذرد (خوانش: نقشِ شناخته‌شده) */
    const pa = policy.authorize(user, 'read', { coll: COLL });
    if(!pa.ok) return denied(pa);
    let list = (store.attendance || []);
    list = filterByScope(user, list);

    const date = urlParams.get('date');
    if (date) {
      list = list.filter(a => a.date === date);
    }

    const classId = urlParams.get('class_id');
    if (classId) {
      list = list.filter(a => String(a.class_id) === String(classId));
    }

    const studentId = urlParams.get('student_id');
    if (studentId) {
      list = list.filter(a => String(a.student_id) === String(studentId));
    }

    // Role restrictions: student/parent only own
    if (user.role === 'student') {
      list = list.filter(a => a.student_id === user.id);
    } else if (user.role === 'parent') {
      const kids = (store.parent_links || []).filter(l => l.parent_id === user.id).map(l => l.student_id);
      list = list.filter(a => kids.includes(a.student_id));
    } else if (user.role === 'teacher') {
      /* P0-04: دبیر فقط حضورِ کلاس‌هایی که خودش درس می‌دهد (homeroom/schedule) */
      const teacherClassIds = new Set();
      (store.classes || []).filter(c => c.homeroom_teacher_id === user.id).forEach(c => teacherClassIds.add(c.id));
      (store.schedule || []).filter(s => s.teacher_id === user.id).forEach(s => teacherClassIds.add(s.class_id));
      list = list.filter(a => teacherClassIds.has(a.class_id));
    }

    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id - b.id);
    const paginationOpts = parsePaginationParams(urlParams);
    const paginated = paginateArray(list, paginationOpts);

    return { ok: true, ...paginated };
  }

  async function createAttendance(req, body) {
    const user = req.user;
    if (!body || !body.student_id || !body.class_id || !body.date || !body.status) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'اطلاعات کامل حضور و غیاب الزامی است' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-03: نقش + قلمرو از policy مرکزی (همان هستهٔ sync) */
    const pa = policy.authorize(user, 'ins', { coll: COLL }, {
      student_id: Number(body.student_id), class_id: Number(body.class_id), school_id: schoolId,
    });
    if(!pa.ok) return denied(pa);
    const pv = policy.validate('ins', COLL, body);
    if(!pv.ok) return denied(pv);
    let nextId = 1;
    for (const a of (store.attendance || [])) {
      if (a.id >= nextId) nextId = a.id + 1;
    }

    const newRecord = {
      id: nextId,
      student_id: Number(body.student_id),
      class_id: Number(body.class_id),
      school_id: schoolId,
      date: String(body.date).trim(),
      status: String(body.status).trim(),
      late: Number(body.late || 0),
      note: body.note ? String(body.note).trim() : '',
      version: 1,
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(store.attendance)) store.attendance = [];
    store.attendance.push(newRecord);
    markDirty();

    if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'attendance', t: 'ins', data: newRecord });
    }

    audit('attendance_recorded', { user_id: user.id, student_id: newRecord.student_id, date: newRecord.date, status: newRecord.status });
    return { status: 201, body: { ok: true, data: newRecord } };
  }

  async function updateAttendance(req, id, body) {
    const user = req.user;
    /* P0-03: نقش + قلمرو از policy مرکزی (404-not-403 برایِ بیرونِ قلمرو) */
    const pa = policy.authorize(user, 'upd', { coll: COLL, id: Number(id) }, body || {});
    if(!pa.ok) return denied(pa);
    const pv = policy.validate('upd', COLL, body || {});
    if(!pv.ok) return denied(pv);

    const rec = (store.attendance || []).find(a => a.id === Number(id));
    if (!rec) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد حضور و غیاب یافت نشد' } };
    }

    if (body.status !== undefined) rec.status = String(body.status).trim();
    if (body.late !== undefined) rec.late = Number(body.late);
    if (body.note !== undefined) rec.note = String(body.note).trim();
    rec.version = (rec.version || 1) + 1;
    rec.updated_at = new Date().toISOString();

    markDirty();
    if (db) await db.persistOp({ c: 'attendance', t: 'upd', data: rec });

    audit('attendance_updated', { user_id: user.id, record_id: rec.id });
    return { status: 200, body: { ok: true, data: rec } };
  }

  async function deleteAttendance(req, id) {
    const user = req.user;
    /* P0-03: حذف هم تحتِ مجوزِ مدل است (مثلِ sync) — نه فقط نقشِ دستی.
       توجه: مدل، delِ حضور را به manager/teacher/superadmin می‌دهد. */
    const pa = policy.authorize(user, 'del', { coll: COLL, id: Number(id) });
    if(!pa.ok) return denied(pa);

    const recIdx = (store.attendance || []).findIndex(a => a.id === Number(id));
    if (recIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد یافت نشد' } };
    }

    store.attendance.splice(recIdx, 1);
    markDirty();

    if (db) await db.persistOp({ c: 'attendance', t: 'del', id: Number(id) });
    audit('attendance_deleted', { user_id: user.id, record_id: Number(id) });
    return { status: 200, body: { ok: true, message: 'رکورد حضور با موفقیت حذف شد' } };
  }

  return {
    getAttendanceList,
    createAttendance,
    updateAttendance,
    deleteAttendance
  };
}

module.exports = { createAttendanceRoutes };
