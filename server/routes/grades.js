/* ═══════════════════════════════════════════════════════════════════
   server/routes/grades.js — RESTful Grade & Assessment API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/grades (filter by student, subject, class, term)
   - POST /api/v1/grades (record student score)
   - PATCH /api/v1/grades/:id (optimistic concurrency version update)
   - DELETE /api/v1/grades/:id (remove grade record)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { filterByScope, checkSchoolScope } = require('../middleware/scope');
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');

function createGradeRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const ids = ctx.ids; /* P0-16 */
  const deleter = ctx.deleter; /* P0-17 */
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});

  function getGradesList(req, urlParams) {
    const user = req.user;
    let list = (store.grades || []);
    list = filterByScope(user, list);

    const studentId = urlParams.get('student_id');
    if (studentId) {
      list = list.filter(g => String(g.student_id) === String(studentId));
    }

    const subjectId = urlParams.get('subject_id');
    if (subjectId) {
      list = list.filter(g => String(g.subject_id) === String(subjectId));
    }

    const classId = urlParams.get('class_id');
    if (classId) {
      list = list.filter(g => String(g.class_id) === String(classId));
    }

    // Role restrictions
    if (user.role === 'student') {
      list = list.filter(g => g.student_id === user.id);
    } else if (user.role === 'parent') {
      const kids = (store.parent_links || []).filter(l => l.parent_id === user.id).map(l => l.student_id);
      list = list.filter(g => kids.includes(g.student_id));
    } else if (user.role === 'teacher') {
      // Teacher can only view grades for subjects they teach
      const teacherSubjects = new Set((store.schedule || []).filter(s => s.teacher_id === user.id).map(s => s.subject_id));
      list = list.filter(g => teacherSubjects.has(g.subject_id) || g.teacher_id === user.id);
    }

    // Enrich with subject & student names
    const enriched = list.map(g => {
      const sub = (store.subjects || []).find(s => s.id === g.subject_id);
      const student = (store.users || []).find(u => u.id === g.student_id);
      return {
        ...g,
        subject_name: sub ? sub.name : null,
        student_name: student ? student.full_name : null
      };
    });

    enriched.sort((a, b) => b.id - a.id);
    const paginationOpts = parsePaginationParams(urlParams);
    const paginated = paginateArray(enriched, paginationOpts);

    return { ok: true, ...paginated };
  }

  async function createGrade(req, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'teacher' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'شما مجاز به ثبت نمره نیستید' } };
    }

    if (!body || body.student_id == null || body.subject_id == null || body.score == null) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'شناسه دانش‌آموز، درس و نمره الزامی است' } };
    }

    const scoreNum = Number(body.score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 20) {
      return { status: 400, body: { ok: false, code: 'bad_score', message: 'نمره باید بین ۰ تا ۲۰ باشد' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-16: شناسهٔ بدون‌برخورد (دنباله/قفل) به‌جای مکس+۱ ناهمزمان */
    const nextId = await ids.nextId('grades', store.grades);

    const newGrade = {
      id: nextId,
      student_id: Number(body.student_id),
      subject_id: Number(body.subject_id),
      class_id: body.class_id ? Number(body.class_id) : null,
      teacher_id: user.role === 'teacher' ? user.id : (body.teacher_id ? Number(body.teacher_id) : null),
      school_id: schoolId,
      score: scoreNum,
      term: body.term || 'term1',
      type: body.type || 'quiz',
      date: body.date || new Date().toISOString().slice(0, 10),
      version: 1,
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(store.grades)) store.grades = [];
    store.grades.push(newGrade);
    markDirty();

    if (db && typeof db.persistOpsBatch === 'function') {
      /* Wave 2: مسیر حیاتی ثبت نمره از transaction مشترک db.persistOpsBatch عبور می‌کند. */
      await db.persistOpsBatch([{ c: 'grades', t: 'ins', data: newGrade }]);
    } else if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'grades', t: 'ins', data: newGrade });
    }

    audit('grade_created', { user_id: user.id, student_id: newGrade.student_id, subject_id: newGrade.subject_id, score: newGrade.score });
    return { status: 201, body: { ok: true, data: newGrade } };
  }

  async function updateGrade(req, id, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'teacher' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const grade = (store.grades || []).find(g => g.id === Number(id));
    if (!grade || !checkSchoolScope(user, grade.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }

    /* P0-18: OCC از هِلپر مشترک — پایه از base_version یا version */
    const conflict = checkOcc(grade, body, 'نمره');
    if (conflict) return conflict;

    if (body.score != null) {
      const s = Number(body.score);
      if (isNaN(s) || s < 0 || s > 20) {
        return { status: 400, body: { ok: false, code: 'bad_score', message: 'نمره نامعتبر است' } };
      }
      grade.score = s;
    }

    if (body.type !== undefined) grade.type = body.type;
    if (body.term !== undefined) grade.term = body.term;
    bump(grade); /* P0-18 */

    markDirty();
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'grades', t: 'upd', id: grade.id, data: grade, base_version: body.base_version !== undefined ? body.base_version : body.version }]);
      } else if (db) {
        await db.persistOp({ c: 'grades', t: 'upd', data: grade });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'نمره هم‌زمان تغییر کرده است' } };
      throw e;
    }

    audit('grade_updated', { user_id: user.id, grade_id: grade.id, score: grade.score, version: grade.version });
    return { status: 200, body: { ok: true, data: grade } };
  }

  async function deleteGrade(req, id) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'teacher' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const gradeIdx = (store.grades || []).findIndex(g => g.id === Number(id));
    if (gradeIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }

    const grade = store.grades[gradeIdx];
    if (!checkSchoolScope(user, grade.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('grades', { id: Number(id) }, {
      actor: user,
      audit: () => audit('grade_deleted', { user_id: user.id, grade_id: Number(id) })
    });
    if (!del.ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }
    return { status: 200, body: { ok: true, message: 'نمره با موفقیت حذف شد' } };
  }

  return {
    getGradesList,
    createGrade,
    updateGrade,
    deleteGrade
  };
}

module.exports = { createGradeRoutes };
