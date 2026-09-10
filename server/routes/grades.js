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

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { buildGradesList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */
const { inScope: syncInScope } = require('../sync'); /* BUG-4: سیاستِ واحد با sync (نه موازی) */

function createGradeRoutes(ctx) {
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
  const pgDown = () => ({ status: 503, body: { ok: false, code: 'pg_unavailable', message: 'پایگاه داده در دسترس نیست؛ دوباره تلاش کنید' } });

  async function getGradesList(req, urlParams) {
    const user = req.user;
    const paginationOpts = parsePaginationParams(urlParams);

    /* Wave 3: DB-native path — runs ONLY when a live PostgreSQL is wired.
       Pushes role-scope + filters + order + keyset pagination (with subject /
       student name enrichment via LEFT JOINs) down to SQL. Unverified against
       a real PG in this sandbox (see docs/WAVE3_QUERY_PERFORMANCE.md). */
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
      const built = buildGradesList({
        user,
        office: policy.userOffice(store, user), /* Wave 5 — هندسهٔ اداره */
        studentId: urlParams.get('student_id'),
        subjectId: urlParams.get('subject_id'),
        classId: urlParams.get('class_id'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline — Wave 5: مدلِ یکتا (دانش‌آموز=خودش، ولی=فرزندان،
       دبیر=کلاس/درسِ تدریسی یا نمرهٔ خودش، مدیر=مدرسهٔ خودش — همان
       فیلتری که pull و PG (dbquery) اعمال می‌کنند). */
    let list = (store.grades || []);
    list = policy.filterReadable(store, user, 'grades', list);

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

    /* role restrictions unified in policy.filterReadable above */

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
    /* W3-1: sort is id DESC, so keyset "next" walks backwards (id < cursor). */
    const paginated = paginateArray(enriched, Object.assign({}, paginationOpts, { order: 'desc' }));

    return { ok: true, ...paginated };
  }

  async function createGrade(req, body) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'grades', 'ins')) {
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
    /* BUG-4 (باگ‌هانت چت ۵): بایندِ دبیر→کلاس — همان سیاستِ sync؛ دبیر
       فقط روی دانش‌آموزِ کلاسِ خودش (مبوّب/برنامه) می‌نویسد. */
    if (user.role === 'teacher' && !syncInScope(user, 'grades', null, { student_id: Number(body.student_id), school_id: schoolId })) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'این دانش‌آموز در کلاس‌های شما نیست' } };
    }
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

    /* Wave 5 — مهارِ دانش‌آموز با محدوده (دبیر: کلاسِ تدرسی؛ مدیر: مدرسهٔ خود) —
       همان inScope که sync اعمال می‌کند. */
    if (!policy.restCreateScopeOk(store, user, 'grades', newGrade)) {
      return { status: 403, body: { ok: false, code: 'out_of_scope', message: 'دانش‌آموز خارج از محدودهٔ دسترسی شماست' } };
    }

    if (!Array.isArray(store.grades)) store.grades = [];
    /* Wave 1: PG-first — the insert commits before the cache is touched, so a
       PG failure returns here with the store still clean (memory mode: no-op). */
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        /* Wave 2: مسیر حیاتی ثبت نمره از transaction مشترک db.persistOpsBatch عبور می‌کند. */
        await db.persistOpsBatch([{ c: 'grades', t: 'ins', data: newGrade }]);
      } else if (db && typeof db.persistOp === 'function') {
        await db.persistOp({ c: 'grades', t: 'ins', data: newGrade });
      }
    } catch (e) {
      return pgDown();
    }
    store.grades.push(newGrade);
    markDirty();

    audit('grade_created', { user_id: user.id, student_id: newGrade.student_id, subject_id: newGrade.subject_id, score: newGrade.score });
    return { status: 201, body: { ok: true, data: newGrade } };
  }

  async function updateGrade(req, id, body) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'grades', 'upd', Object.keys(body || {}))) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const grade = await findLive('grades', id);
    /* BUG-4 (باگ‌هانت چت ۵): بایندِ دبیر→کلاس — همان سیاستِ sync؛ دبیرِ
       هم‌مدرسه ولی خارج از کلاس → 403 (نه 404). رکوردِ ناموجود یا مدرسهٔ
       دیگر → 404 (عدم افشا). */
    if (!grade || !policy.inScope(user, store, 'grades', grade.id, grade)) {
      if (grade && user.role === 'teacher' && user.school_id != null
          && Number(grade.school_id) === Number(user.school_id)) {
        return { status: 403, body: { ok: false, code: 'forbidden', message: 'این نمره در کلاس‌های شما نیست' } };
      }
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }

    /* P0-18: OCC از هِلپر مشترک — پایه از base_version یا version */
    const conflict = checkOcc(grade, body, 'نمره');
    if (conflict) return conflict;

    /* Wave 1: patch روی کپی محاسبه می‌شود؛ store فقط پس از کامیت PG لمس می‌شود. */
    const next = Object.assign({}, grade);
    if (body.score != null) {
      const s = Number(body.score);
      if (isNaN(s) || s < 0 || s > 20) {
        return { status: 400, body: { ok: false, code: 'bad_score', message: 'نمره نامعتبر است' } };
      }
      next.score = s;
    }

    if (body.type !== undefined) next.type = body.type;
    if (body.term !== undefined) next.term = body.term;
    bump(next); /* P0-18 */

    const base = body.base_version !== undefined ? body.base_version : body.version;
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'grades', t: 'upd', id: grade.id, data: next, base_version: base }]);
      } else if (db) {
        await db.persistOp({ c: 'grades', t: 'upd', data: next });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'نمره هم‌زمان تغییر کرده است' } };
      return pgDown();
    }

    /* کامیت به کش: به‌روزرسانی کپی store (یا seed اگر رکوردِ نمونهٔ دیگر است). */
    const cached = (store.grades || []).find(g => g.id === Number(id));
    if (cached) Object.assign(cached, next);
    else { if (!Array.isArray(store.grades)) store.grades = []; store.grades.push(next); }
    markDirty();

    audit('grade_updated', { user_id: user.id, grade_id: grade.id, score: next.score, version: next.version });
    return { status: 200, body: { ok: true, data: cached || next } };
  }

  async function deleteGrade(req, id) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'grades', 'del')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'دسترسی غیرمجاز' } };
    }

    const grade = await findLive('grades', id);
    /* BUG-4 (باگ‌هانت چت ۵): بایندِ دبیر→کلاس — همان سیاستِ sync؛ دبیرِ
       هم‌مدرسه ولی خارج از کلاس → 403 (نه 404). رکوردِ ناموجود یا مدرسهٔ
       دیگر → 404 (عدم افشا). */
    if (!grade || !policy.inScope(user, store, 'grades', grade.id, grade)) {
      if (grade && user.role === 'teacher' && user.school_id != null
          && Number(grade.school_id) === Number(user.school_id)) {
        return { status: 403, body: { ok: false, code: 'forbidden', message: 'این نمره در کلاس‌های شما نیست' } };
      }
      return { status: 404, body: { ok: false, code: 'not_found', message: 'نمره یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('grades', { id: Number(id) }, {
      actor: user,
      audit: () => audit('grade_deleted', { user_id: user.id, grade_id: Number(id) })
    });
    if (!del.ok) {
      if (del.status === 503) return pgDown();
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
