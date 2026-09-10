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

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { buildClassesList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */

function createClassRoutes(ctx) {
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

  async function getClassesList(req, urlParams) {
    const user = req.user;
    const paginationOpts = parsePaginationParams(urlParams);

    /* Wave 3: DB-native path — runs ONLY when a live PostgreSQL is wired.
       Pushes role-scope + filters + order + keyset pagination (with enrollment
       count + teacher name enrichment) down to SQL. Unverified against a real
       PG in this sandbox (see docs/WAVE3_QUERY_PERFORMANCE.md). */
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
      const built = buildClassesList({
        user,
        office: policy.userOffice(store, user), /* Wave 5 — هندسهٔ اداره */
        grade: urlParams.get('grade'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline — Wave 5: مدلِ یکتا (دبیر فقط کلاس‌های تدرسی/سرپرستی،
       دانش‌آموز فقط کلاس خودش، ولی فقط کلاس فرزندان، مدیر فقط مدرسهٔ خودش). */
    let classes = (store.classes || []);
    classes = policy.filterReadable(store, user, 'classes', classes);

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
    const paginated = paginateArray(enriched, paginationOpts);

    return { ok: true, ...paginated };
  }

  async function getClassById(req, id) {
    const user = req.user;
    const cls = await findLive('classes', id);
    if (!cls || !policy.restReadGate(store, user, 'classes', cls).ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    const users = await listLive('users');
    const teacher = users.find(u => u.id === cls.homeroom_teacher_id);
    const enrollments = (await listLive('enrollments')).filter(e => e.class_id === cls.id);
    const studentIds = new Set(enrollments.map(e => e.student_id));
    const students = users
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
    if (!policy.restWriteRoleOk(user, 'classes', 'ins')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ایجاد کلاس است' } };
    }

    if (!body || !body.name || body.grade == null) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'نام کلاس و پایه الزامی است' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-16: شناسهٔ بدون‌برخورد (دنباله/قفل) به‌جای مکس+۱ ناهمزمان */
    const nextId = await ids.nextId('classes', store.classes);

    const newClass = {
      id: nextId,
      name: String(body.name).trim(),
      grade: Number(body.grade),
      school_id: schoolId,
      capacity: Number(body.capacity || 30),
      homeroom_teacher_id: body.homeroom_teacher_id ? Number(body.homeroom_teacher_id) : null,
      class_mode: body.class_mode || 'general',
      version: 1, /* P0-18 */
      created_at: new Date().toISOString()
    };

    if (!Array.isArray(store.classes)) store.classes = [];
    /* Wave 1: PG-first — the insert commits before the cache is touched, so a
       PG failure returns here with the store still clean (memory mode: no-op). */
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'classes', t: 'ins', data: newClass }]);
      } else if (db && typeof db.persistOp === 'function') {
        await db.persistOp({ c: 'classes', t: 'ins', data: newClass });
      }
    } catch (e) {
      return pgDown();
    }
    store.classes.push(newClass);
    markDirty();

    audit('class_created', { user_id: user.id, class_id: newClass.id, school_id: schoolId });
    return { status: 201, body: { ok: true, data: newClass } };
  }

  async function updateClass(req, id, body) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'classes', 'upd', Object.keys(body || {}))) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به ویرایش کلاس است' } };
    }

    const cls = await findLive('classes', id);
    if (!cls || !policy.inScope(user, store, 'classes', cls.id, cls)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(cls, body, 'کلاس');
    if (conflict) return conflict;

    /* Wave 1: patch روی کپی محاسبه می‌شود؛ store فقط پس از کامیت PG لمس می‌شود. */
    const next = Object.assign({}, cls);
    if (body.name !== undefined) next.name = String(body.name).trim();
    if (body.grade !== undefined) next.grade = Number(body.grade);
    if (body.capacity !== undefined) next.capacity = Number(body.capacity);
    if (body.homeroom_teacher_id !== undefined) next.homeroom_teacher_id = body.homeroom_teacher_id ? Number(body.homeroom_teacher_id) : null;
    if (body.class_mode !== undefined) next.class_mode = body.class_mode;
    bump(next); /* P0-18 */

    const base = body.base_version !== undefined ? body.base_version : body.version;
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'classes', t: 'upd', id: cls.id, data: next, base_version: base }]);
      } else if (db) {
        await db.persistOp({ c: 'classes', t: 'upd', data: next });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'کلاس هم‌زمان تغییر کرده است' } };
      return pgDown();
    }

    /* کامیت به کش: به‌روزرسانی کپی store (یا seed اگر رکوردِ نمونهٔ دیگر است). */
    const cached = (store.classes || []).find(c => c.id === Number(id));
    if (cached) Object.assign(cached, next);
    else { if (!Array.isArray(store.classes)) store.classes = []; store.classes.push(next); }
    markDirty();

    audit('class_updated', { user_id: user.id, class_id: cls.id });
    return { status: 200, body: { ok: true, data: cached || next } };
  }

  async function deleteClass(req, id) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'classes', 'del')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیر مدرسه مجاز به حذف کلاس است' } };
    }

    const cls = await findLive('classes', id);
    if (!cls) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    if (!policy.inScope(user, store, 'classes', cls.id, cls)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('classes', { id: Number(id) }, {
      actor: user,
      audit: () => audit('class_deleted', { user_id: user.id, class_id: Number(id) })
    });
    if (!del.ok) {
      if (del.status === 503) return pgDown();
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کلاس یافت نشد' } };
    }
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
