/* ═══════════════════════════════════════════════════════════════════
   server/routes/students.js — RESTful Student Management API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/students (filter by class, grade, search + pagination)
   - GET /api/v1/students/:id (single student with projection & IDOR check)
   - POST /api/v1/students (create student record)
   - PATCH /api/v1/students/:id (update student info / IEP)
   - DELETE /api/v1/students/:id (soft delete / remove)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { filterByScope, checkSchoolScope } = require('../middleware/scope');
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { projectUserByRole } = require('../middleware/projection');
const { buildStudentsList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */

function createStudentRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const ids = ctx.ids; /* P0-16 */
  const deleter = ctx.deleter; /* P0-17 */
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});

  async function getStudentsList(req, urlParams) {
    const user = req.user;
    const paginationOpts = parsePaginationParams(urlParams);

    /* Wave 3: DB-native path — runs ONLY when a live PostgreSQL is wired.
       Pushes role-scope + filters + order + keyset pagination to SQL instead
       of load-all→filter→sort→slice in JS. Marked UNVERIFIED against a real
       PG in this sandbox (see docs/WAVE3_QUERY_PERFORMANCE.md). */
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
      const built = buildStudentsList({
        user,
        classId: urlParams.get('class_id'),
        grade: urlParams.get('grade'),
        search: urlParams.get('q'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      res.data = res.data.map(s => projectUserByRole(s, user.role));
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline (runtime in this sandbox — byte-identical to before). */
    let students = (store.users || []).filter(u => u.role === 'student');
    students = filterByScope(user, students);

    // Filter by class
    const classId = urlParams.get('class_id');
    if (classId) {
      const enrollments = (store.enrollments || []).filter(e => String(e.class_id) === String(classId));
      const enrolledStudentIds = new Set(enrollments.map(e => e.student_id));
      students = students.filter(s => enrolledStudentIds.has(s.id));
    }

    // Filter by grade level
    const grade = urlParams.get('grade');
    if (grade) {
      students = students.filter(s => String(s.grade_level) === String(grade));
    }

    // Filter by search term
    const search = urlParams.get('q');
    if (search) {
      const q = search.trim().toLowerCase();
      students = students.filter(s => 
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.national_id && s.national_id.includes(q))
      );
    }

    // Teacher scope: limit to students in classes the teacher actually teaches
    if (user.role === 'teacher') {
      const teacherClassIds = new Set();
      (store.classes || []).filter(c => c.homeroom_teacher_id === user.id).forEach(c => teacherClassIds.add(c.id));
      (store.schedule || []).filter(s => s.teacher_id === user.id).forEach(s => teacherClassIds.add(s.class_id));

      const taughtEnrollments = (store.enrollments || []).filter(e => teacherClassIds.has(e.class_id));
      const taughtStudentIds = new Set(taughtEnrollments.map(e => e.student_id));
      students = students.filter(s => taughtStudentIds.has(s.id));
    }

    // Sort by id ascending
    students.sort((a, b) => a.id - b.id);

    const paginated = paginateArray(students, paginationOpts);

    paginated.data = paginated.data.map(s => projectUserByRole(s, user.role));
    return { ok: true, ...paginated };
  }

  function getStudentById(req, id) {
    const user = req.user;
    const student = (store.users || []).find(u => u.id === Number(id) && u.role === 'student');
    if (!student) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    if (!checkSchoolScope(user, student.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    // Parent check: only own children
    if (user.role === 'parent') {
      const isMyKid = (store.parent_links || []).some(l => l.parent_id === user.id && l.student_id === student.id);
      if (!isMyKid) {
        return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
      }
      return { status: 200, body: { ok: true, data: projectUserByRole(student, user.role, true) } };
    }

    return { status: 200, body: { ok: true, data: projectUserByRole(student, user.role, user.id === student.id) } };
  }

  async function createStudent(req, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ثبت دانش‌آموز است' } };
    }

    if (!body || !body.full_name || !body.national_id) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'نام و کد ملی الزامی است' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-16: شناسهٔ بدون‌برخورد (دنباله/قفل) به‌جای مکس+۱ ناهمزمان */
    const nextId = await ids.nextId('users', store.users);

    const newStudent = {
      id: nextId,
      full_name: String(body.full_name).trim(),
      national_id: String(body.national_id).trim(),
      phone: body.phone ? String(body.phone).trim() : '',
      role: 'student',
      school_id: schoolId,
      grade_level: body.grade_level || 10,
      field: body.field || '',
      active: true,
      status: 'active',
      version: 1, /* P0-18 */
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    store.users.push(newStudent);
    markDirty();

    if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'users', t: 'ins', data: newStudent });
    }

    audit('student_created', { user_id: user.id, student_id: newStudent.id, school_id: schoolId });
    return { status: 201, body: { ok: true, data: projectUserByRole(newStudent, user.role) } };
  }

  async function updateStudent(req, id, body) {
    const user = req.user;
    const student = (store.users || []).find(u => u.id === Number(id) && u.role === 'student');
    if (!student || !checkSchoolScope(user, student.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(student, body, 'دانش‌آموز');
    if (conflict) return conflict;

    // Teacher is allowed to update IEP fields only
    if (user.role === 'teacher') {
      if (body.iep_notes !== undefined) student.iep_notes = body.iep_notes;
      if (body.iep_staff !== undefined) student.iep_staff = body.iep_staff;
      student.iep_updated = new Date().toISOString();
      bump(student); /* P0-18 */
      markDirty();
      if (db) await db.persistOp({ c: 'users', t: 'upd', data: student });
      audit('student_iep_updated', { user_id: user.id, student_id: student.id });
      return { status: 200, body: { ok: true, data: projectUserByRole(student, user.role) } };
    }

    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const allowed = ['full_name', 'phone', 'national_id', 'grade_level', 'field', 'active', 'status', 'iep_notes'];
    for (const key of allowed) {
      if (body[key] !== undefined) student[key] = body[key];
    }
    bump(student); /* P0-18 */
    markDirty();

    if (db) await db.persistOp({ c: 'users', t: 'upd', data: student });
    audit('student_updated', { user_id: user.id, student_id: student.id });
    return { status: 200, body: { ok: true, data: projectUserByRole(student, user.role) } };
  }

  async function deleteStudent(req, id) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیریت مجاز به حذف دانش‌آموز است' } };
    }

    const studentIdx = (store.users || []).findIndex(u => u.id === Number(id) && u.role === 'student');
    if (studentIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    const student = store.users[studentIdx];
    if (!checkSchoolScope(user, student.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('users', { id: Number(id), role: 'student' }, {
      actor: user,
      audit: () => audit('student_deleted', { user_id: user.id, student_id: Number(id) })
    });
    if (!del.ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }
    return { status: 200, body: { ok: true, message: 'دانش‌آموز با موفقیت حذف شد' } };
  }

  return {
    getStudentsList,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent
  };
}

module.exports = { createStudentRoutes };
