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

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */
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

  /* Wave 1: PG-live read helper — single records come from PostgreSQL when it
     is the authority (fresh cross-instance reads); memory mode keeps the exact
     legacy store-direct find. PG copies are detached; callers commit to the
     store cache explicitly after a successful PG write. */
  const pgLive = () => db && typeof db.isPostgres === 'function' && db.isPostgres();
  async function findLive(collection, id) {
    if (pgLive() && typeof db.readOne === 'function') return await db.readOne(collection, id);
    return (store[collection] || []).find(r => r && r.id === Number(id)) || null;
  }
  async function listLive(collection) {
    if (pgLive() && typeof db.readCollection === 'function') return await db.readCollection(collection);
    return (store[collection] || []);
  }
  const pgDown = () => ({ status: 503, body: { ok: false, code: 'pg_unavailable', message: 'پایگاه داده در دسترس نیست؛ دوباره تلاش کنید' } });

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
        office: policy.userOffice(store, user), /* Wave 5 — هندسهٔ اداره */
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

    /* Memory/JS pipeline — Wave 5: مدلِ یکتا (دانش‌آموز=خودش، ولی=فرزندان،
       دبیر=کلاس‌های تدرسی، مدیر=مدرسهٔ خودش، بی‌مهار=دیده نمی‌شود). */
    let students = (store.users || []).filter(u => u.role === 'student');
    students = policy.filterReadable(store, user, 'students', students);

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

    /* teacher scope unified in policy.filterReadable (single model — no parallel logic) */

    // Sort by id ascending
    students.sort((a, b) => a.id - b.id);

    const paginated = paginateArray(students, paginationOpts);

    paginated.data = paginated.data.map(s => projectUserByRole(s, user.role));
    return { ok: true, ...paginated };
  }

  async function getStudentById(req, id) {
    const user = req.user;
    const _cand = await findLive('users', id);
    const student = (_cand && _cand.role === 'student') ? _cand : null;
    /* Wave 5 — نما/رکوردِ دانش‌آموز = همان قاعدهٔ idor.js (دبیر فقط کلاس‌های
       تدرسی؛ والد فقط فرزندان؛ مدیر فقط مدرسهٔ خودش؛ بقیه از جمله اداره ⇒ رد)
       — یک دروازه برای هر دو endpoint؛ بیرون ⇒ ۴۰۴ ضدشمارش. در حالتِ PG،
       پیوندهایِ والد زنده از DB خوانده و به‌عنوان opts به همانِ دروازهٔ policy
       پاس می‌شود (ویو ۱: داده تازه، مدلِ یکتا). */
    const _gateOpts = pgLive() ? { parentLinks: await listLive('parent_links') } : null;
    const gate = policy.restReadGate(store, user, 'students', student, _gateOpts);
    if (!student || !gate.ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
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
    /* Wave 5 — ساختِ دانش‌آموز فقط برایِ نقشِ مجازِ مدل (manager/superadmin) */
    if (!policy.restWriteRoleOk(user, 'users', 'ins')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ثبت دانش‌آموز است' } };
    }
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

    /* Wave 1: PG-first — the insert commits before the cache is touched, so a
       PG failure returns here with the store still clean (memory mode: no-op). */
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        /* Wave 2: مسیر حیاتی ثبت دانش‌آموز در آینهٔ PostgreSQL اتمیک است
           (transaction در db.persistOpsBatch)؛ در حالت JSON memory همان رفتار قبلی حفظ می‌شود. */
        await db.persistOpsBatch([{ c: 'users', t: 'ins', data: newStudent }]);
      } else if (db && typeof db.persistOp === 'function') {
        await db.persistOp({ c: 'users', t: 'ins', data: newStudent });
      }
    } catch (e) {
      return pgDown();
    }
    store.users.push(newStudent);
    markDirty();

    audit('student_created', { user_id: user.id, student_id: newStudent.id, school_id: schoolId });
    return { status: 201, body: { ok: true, data: projectUserByRole(newStudent, user.role) } };
  }

  async function updateStudent(req, id, body) {
    const user = req.user;
    const _found = await findLive('users', id);
    const student = (_found && _found.role === 'student') ? _found : null;
    /* Wave 5 — محدوده از policy.inScope (users collection): مدیر فقط مدرسهٔ
       خودش fail-closed؛ دبیر IEP هم‌مدرسه (آینهٔ استثنایِ sync)؛ رکوردِ
       یافته‌شده به‌عنوان data پاس می‌شود تا در حالتِ PG (کپیِ detached،
       نبودِ در store) هم دقیق حل شود (ویو ۱). */
    const scopeOk = !!student && (policy.inScope(user, store, 'users', student.id, student)
      || (user.role === 'teacher' && student.school_id != null && Number(student.school_id) === Number(user.school_id)));
    if (!student || !scopeOk) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(student, body, 'دانش‌آموز');
    if (conflict) return conflict;

    // Teacher is allowed to update IEP fields only
    if (user.role === 'teacher') {
      /* Wave 1: patch روی کپی؛ store فقط پس از کامیت PG. */
      const next = Object.assign({}, student);
      if (body.iep_notes !== undefined) next.iep_notes = body.iep_notes;
      if (body.iep_staff !== undefined) next.iep_staff = body.iep_staff;
      next.iep_updated = new Date().toISOString();
      bump(next); /* P0-18 */
      const baseT = body.base_version !== undefined ? body.base_version : body.version;
      try {
        if (db && typeof db.persistOpsBatch === 'function') {
          await db.persistOpsBatch([{ c: 'users', t: 'upd', id: student.id, data: next, base_version: baseT }]);
        } else if (db) {
          await db.persistOp({ c: 'users', t: 'upd', data: next });
        }
      } catch (e) {
        if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'دانش‌آموز هم‌زمان تغییر کرده است' } };
        return pgDown();
      }
      const cachedT = (store.users || []).find(u => u.id === Number(id));
      if (cachedT) Object.assign(cachedT, next);
      markDirty();
      audit('student_iep_updated', { user_id: user.id, student_id: student.id });
      return { status: 200, body: { ok: true, data: projectUserByRole(cachedT || next, user.role) } };
    }

    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const next = Object.assign({}, student);
    const allowed = ['full_name', 'phone', 'national_id', 'grade_level', 'field', 'active', 'status', 'iep_notes'];
    for (const key of allowed) {
      if (body[key] !== undefined) next[key] = body[key];
    }
    bump(next); /* P0-18 */

    const base = body.base_version !== undefined ? body.base_version : body.version;
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'users', t: 'upd', id: student.id, data: next, base_version: base }]);
      } else if (db) {
        await db.persistOp({ c: 'users', t: 'upd', data: next });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'دانش‌آموز هم‌زمان تغییر کرده است' } };
      return pgDown();
    }
    const cached = (store.users || []).find(u => u.id === Number(id));
    if (cached) Object.assign(cached, next);
    markDirty();

    audit('student_updated', { user_id: user.id, student_id: student.id });
    return { status: 200, body: { ok: true, data: projectUserByRole(cached || next, user.role) } };
  }

  async function deleteStudent(req, id) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'users', 'del')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیریت مجاز به حذف دانش‌آموز است' } };
    }

    const _del = await findLive('users', id);
    const student = (_del && _del.role === 'student') ? _del : null;
    if (!student) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    if (!policy.inScope(user, store, 'users', student.id, student)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'دانش‌آموز یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('users', { id: Number(id), role: 'student' }, {
      actor: user,
      audit: () => audit('student_deleted', { user_id: user.id, student_id: Number(id) })
    });
    if (!del.ok) {
      if (del.status === 503) return pgDown();
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
