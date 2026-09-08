/* ═══════════════════════════════════════════════════════════════════
   server/routes/classes.js — RESTful Class Management API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/classes (list classes with student counts)
   - GET /api/v1/classes/:id (class detail + enrolled students)
   - POST /api/v1/classes (create new class)
   - PATCH /api/v1/classes/:id (update class details)
   - DELETE /api/v1/classes/:id (delete class)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { filterByScope, checkSchoolScope } = require('../middleware/scope');
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');

function createClassRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});

  function getClassesList(req, urlParams) {
    const user = req.user;
    let classes = (store.classes || []);
    classes = filterByScope(user, classes);

    const grade = urlParams.get('grade');
    if (grade) {
      classes = classes.filter(c => String(c.grade) === String(grade));
    }

    // Attach student count and teacher name
    const enriched = classes.map(c => {
      const studentCount = (store.enrollments || []).filter(e => e.class_id === c.id).length;
      const teacher = (store.users || []).find(u => u.id === c.homeroom_teacher_id);
      return {
        ...c,
        student_count: studentCount,
        homeroom_teacher_name: teacher ? teacher.full_name : null
      };
    });

    enriched.sort((a, b) => a.id - b.id);
    const paginationOpts = parsePaginationParams(urlParams);
    const paginated = paginateArray(enriched, paginationOpts);

    return { ok: true, ...paginated };
  }

  function getClassById(req, id) {
    const user = req.user;
    const cls = (store.classes || []).find(c => c.id === Number(id));
    if (!cls || !checkSchoolScope(user, cls.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    const teacher = (store.users || []).find(u => u.id === cls.homeroom_teacher_id);
    const enrollments = (store.enrollments || []).filter(e => e.class_id === cls.id);
    const studentIds = new Set(enrollments.map(e => e.student_id));
    const students = (store.users || [])
      .filter(u => studentIds.has(u.id))
      .map(u => ({ id: u.id, full_name: u.full_name, national_id_masked: u.national_id ? u.national_id.slice(0, 3) + '***' : null }));

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          ...cls,
          homeroom_teacher_name: teacher ? teacher.full_name : null,
          students
        }
      }
    };
  }

  async function createClass(req, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ایجاد کلاس است' } };
    }

    if (!body || !body.name || body.grade == null) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'نام کلاس و پایه الزامی است' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    let nextId = 1;
    for (const c of (store.classes || [])) {
      if (c.id >= nextId) nextId = c.id + 1;
    }

    const newClass = {
      id: nextId,
      name: String(body.name).trim(),
      grade: Number(body.grade),
      school_id: schoolId,
      capacity: Number(body.capacity || 30),
      homeroom_teacher_id: body.homeroom_teacher_id ? Number(body.homeroom_teacher_id) : null,
      class_mode: body.class_mode || 'general',
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(store.classes)) store.classes = [];
    store.classes.push(newClass);
    markDirty();

    if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'classes', t: 'ins', data: newClass });
    }

    audit('class_created', { user_id: user.id, class_id: newClass.id, school_id: schoolId });
    return { status: 201, body: { ok: true, data: newClass } };
  }

  async function updateClass(req, id, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ویرایش کلاس است' } };
    }

    const cls = (store.classes || []).find(c => c.id === Number(id));
    if (!cls || !checkSchoolScope(user, cls.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    if (body.name !== undefined) cls.name = String(body.name).trim();
    if (body.grade !== undefined) cls.grade = Number(body.grade);
    if (body.capacity !== undefined) cls.capacity = Number(body.capacity);
    if (body.homeroom_teacher_id !== undefined) cls.homeroom_teacher_id = body.homeroom_teacher_id ? Number(body.homeroom_teacher_id) : null;
    if (body.class_mode !== undefined) cls.class_mode = body.class_mode;

    markDirty();
    if (db) await db.persistOp({ c: 'classes', t: 'upd', data: cls });

    audit('class_updated', { user_id: user.id, class_id: cls.id });
    return { status: 200, body: { ok: true, data: cls } };
  }

  async function deleteClass(req, id) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به حذف کلاس است' } };
    }

    const clsIdx = (store.classes || []).findIndex(c => c.id === Number(id));
    if (clsIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    const cls = store.classes[clsIdx];
    if (!checkSchoolScope(user, cls.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    store.classes.splice(clsIdx, 1);
    markDirty();

    if (db) await db.persistOp({ c: 'classes', t: 'del', id: Number(id) });
    audit('class_deleted', { user_id: user.id, class_id: Number(id) });
    return { status: 200, body: { ok: true, message: 'کلاس با موفقیت حذف شد' } };
  }

  return {
    getClassesList,
    getClassById,
    createClass,
    updateClass,
    deleteClass
  };
}

module.exports = { createClassRoutes };
