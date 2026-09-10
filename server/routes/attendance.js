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

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { buildAttendanceList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */

function createAttendanceRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const ids = ctx.ids; /* P0-16 */
  const deleter = ctx.deleter; /* P0-17 */
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});

  async function getAttendanceList(req, urlParams) {
    const user = req.user;
    const paginationOpts = parsePaginationParams(urlParams);

    /* Wave 3: DB-native path — runs ONLY when a live PostgreSQL is wired.
       Pushes role-scope + filters + order + keyset pagination to SQL instead
       of load-all→filter→sort→slice in JS. Marked UNVERIFIED against a real
       PG in this sandbox (see docs/WAVE3_QUERY_PERFORMANCE.md). */
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
      const built = buildAttendanceList({
        user,
        office: policy.userOffice(store, user), /* Wave 5 — هندسهٔ اداره */
        date: urlParams.get('date'),
        classId: urlParams.get('class_id'),
        studentId: urlParams.get('student_id'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline — Wave 5: مدلِ یکتا (مدیر=مدرسه، دبیر=کلاسِ تدرسی،
       دانش‌آموز=خودش، ولی=فرزندان — همان filterReadable که pull/PG می‌زنند). */
    let list = (store.attendance || []);
    list = policy.filterReadable(store, user, 'attendance', list);

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

    /* role restrictions unified in policy.filterReadable above */

    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id - b.id);
    const paginated = paginateArray(list, paginationOpts);

    return { ok: true, ...paginated };
  }

  async function createAttendance(req, body) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'attendance', 'ins')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'شما مجاز به ثبت حضور و غیاب نیستید' } };
    }

    if (!body || !body.student_id || !body.class_id || !body.date || !body.status) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'اطلاعات کامل حضور و غیاب الزامی است' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-16: شناسهٔ بدون‌برخورد (دنباله/قفل) به‌جای مکس+۱ ناهمزمان */
    const nextId = await ids.nextId('attendance', store.attendance);

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

    /* Wave 5 — مهارِ مدلِ یکتا روی بدنهٔ تازه (دبیر: دانش‌آموزِ کلاسِ تدرسی؛
       مدیر: دانش‌آموزِ مدرسهٔ خودش؛ ناسازگاریِ مهار/دانش‌آموز ⇒ رد). */
    if (!policy.restCreateScopeOk(store, user, 'attendance', newRecord)) {
      return { status: 403, body: { ok: false, code: 'out_of_scope', message: 'دانش‌آموز خارج از محدودهٔ دسترسی شماست' } };
    }

    if (!Array.isArray(store.attendance)) store.attendance = [];
    store.attendance.push(newRecord);
    markDirty();

    if (db && typeof db.persistOpsBatch === 'function') {
      /* Wave 2: مسیر حیاتی ثبت حضور (قابل استفاده برای ثبت گروهی با چند op)
         از transaction مشترک db.persistOpsBatch عبور می‌کند. */
      await db.persistOpsBatch([{ c: 'attendance', t: 'ins', data: newRecord }]);
    } else if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'attendance', t: 'ins', data: newRecord });
    }

    audit('attendance_recorded', { user_id: user.id, student_id: newRecord.student_id, date: newRecord.date, status: newRecord.status });
    return { status: 201, body: { ok: true, data: newRecord } };
  }

  async function updateAttendance(req, id, body) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'attendance', 'upd', Object.keys(body || {}))) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const rec = (store.attendance || []).find(a => a.id === Number(id));
    if (!rec || !policy.inScope(user, store, 'attendance', rec.id, null)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد حضور و غیاب یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ (پیش‌تر نسخه بی‌بررسی بالا می‌رفت) */
    const conflict = checkOcc(rec, body, 'رکورد حضور و غیاب');
    if (conflict) return conflict;

    if (body.status !== undefined) rec.status = String(body.status).trim();
    if (body.late !== undefined) rec.late = Number(body.late);
    if (body.note !== undefined) rec.note = String(body.note).trim();
    bump(rec);

    markDirty();
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'attendance', t: 'upd', id: rec.id, data: rec, base_version: body.base_version !== undefined ? body.base_version : body.version }]);
      } else if (db) {
        await db.persistOp({ c: 'attendance', t: 'upd', data: rec });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'رکورد حضور و غیاب هم‌زمان تغییر کرده است' } };
      throw e;
    }

    audit('attendance_updated', { user_id: user.id, record_id: rec.id });
    return { status: 200, body: { ok: true, data: rec } };
  }

  async function deleteAttendance(req, id) {
    const user = req.user;
    /* تنگ‌سازیِ مستندِ REST (مدلِ یکتا §۴ — REST ⊆ sync؛ مدل del را برای دبیر
       باز می‌گذارد ولی REST عامداً تنگ‌تر است): علاوه بر نقشِ مجازِ مدل، فقط
       مدیر/سوپراملایِن حذف می‌کند. تعریفِ باز در نقش‌ها ممنوع. */
    if (!policy.restWriteRoleOk(user, 'attendance', 'del')
        || !policy.DELETE_ROLES_REST.has(user.role)) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مجاز به حذف است' } };
    }

    const recIdx = (store.attendance || []).findIndex(a => a.id === Number(id));
    if (recIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد یافت نشد' } };
    }

    const rec = store.attendance[recIdx];
    if (!policy.inScope(user, store, 'attendance', rec.id, null)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('attendance', { id: Number(id) }, {
      actor: user,
      audit: () => audit('attendance_deleted', { user_id: user.id, record_id: Number(id) })
    });
    if (!del.ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'رکورد یافت نشد' } };
    }
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
