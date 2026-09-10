/* ═══════════════════════════════════════════════════════════════════
   server/routes/users.js — RESTful User Management API
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - GET /api/v1/users (filter by role, school, query + projection)
   - GET /api/v1/users/:id (single user with safe projection)
   - POST /api/v1/users (create user with role escalation guard)
   - PATCH /api/v1/users/:id (update user info)
   - DELETE /api/v1/users/:id (remove user)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const { filterByScope, checkSchoolScope } = require('../middleware/scope');
const { checkOcc, bump } = require('../occ'); /* P0-18 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { projectUserByRole } = require('../middleware/projection');
const { buildUsersList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */

const ROLE_LEVEL = { student: 0, parent: 1, driver: 1, counselor: 3, teacher: 3, edu_office: 3, manager: 4, superadmin: 5 };

function createUserRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const ids = ctx.ids; /* P0-16 */
  const deleter = ctx.deleter; /* P0-17 */
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});

  async function getUsersList(req, urlParams) {
    const user = req.user;
    const paginationOpts = parsePaginationParams(urlParams);

    /* Wave 3: DB-native path — runs ONLY when a live PostgreSQL is wired.
       Pushes school scope + role + free-text search (national_id only ever a
       bound ILIKE param) + order + keyset pagination down to SQL. Unverified
       against a real PG in this sandbox (see WAVE3_QUERY_PERFORMANCE.md). */
    if (db && typeof db.isPostgres === 'function' && db.isPostgres()) {
      const built = buildUsersList({
        user,
        role: urlParams.get('role'),
        search: urlParams.get('q'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      res.data = res.data.map(u => projectUserByRole(u, user.role, u.id === user.id));
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline (runtime in this sandbox — byte-identical to before). */
    let list = (store.users || []);
    list = filterByScope(user, list);

    const role = urlParams.get('role');
    if (role) {
      list = list.filter(u => u.role === role);
    }

    const search = urlParams.get('q');
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(u => 
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.national_id && u.national_id.includes(q)) ||
        (u.phone && u.phone.includes(q))
      );
    }

    list.sort((a, b) => a.id - b.id);
    const paginated = paginateArray(list, paginationOpts);

    paginated.data = paginated.data.map(u => projectUserByRole(u, user.role, u.id === user.id));
    return { ok: true, ...paginated };
  }

  function getUserById(req, id) {
    const user = req.user;
    const target = (store.users || []).find(u => u.id === Number(id));
    if (!target || !checkSchoolScope(user, target.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    return {
      status: 200,
      body: {
        ok: true,
        data: projectUserByRole(target, user.role, target.id === user.id)
      }
    };
  }

  async function createUser(req, body) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin' && user.role !== 'edu_office') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'شما مجاز به ایجاد کاربر نیستید' } };
    }

    if (!body || !body.full_name || !body.role) {
      return { status: 400, body: { ok: false, code: 'bad_request', message: 'نام کامل و نقش الزامی است' } };
    }

    // Role escalation prevention
    const targetLvl = ROLE_LEVEL[body.role];
    if (targetLvl == null) {
      return { status: 400, body: { ok: false, code: 'invalid_role', message: 'نقش نامعتبر است' } };
    }
    if (user.role !== 'superadmin' && targetLvl > ROLE_LEVEL[user.role]) {
      return { status: 403, body: { ok: false, code: 'role_escalation', message: 'ثبت کاربر با نقش بالاتر از سطح خود مجاز نیست' } };
    }

    const schoolId = user.role === 'superadmin' && body.school_id ? Number(body.school_id) : user.school_id;
    /* P0-16: شناسهٔ بدون‌برخورد (دنباله/قفل) به‌جای مکس+۱ ناهمزمان */
    const nextId = await ids.nextId('users', store.users);

    const newUser = {
      id: nextId,
      full_name: String(body.full_name).trim(),
      role: body.role,
      national_id: body.national_id ? String(body.national_id).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      school_id: schoolId,
      active: body.active !== undefined ? Boolean(body.active) : true,
      status: 'active',
      version: 1, /* P0-18 */
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!Array.isArray(store.users)) store.users = [];
    store.users.push(newUser);
    markDirty();

    if (db && typeof db.persistOp === 'function') {
      await db.persistOp({ c: 'users', t: 'ins', data: newUser });
    }

    audit('user_created', { user_id: user.id, target_user_id: newUser.id, role: newUser.role, school_id: schoolId });
    return { status: 201, body: { ok: true, data: projectUserByRole(newUser, user.role) } };
  }

  async function updateUser(req, id, body) {
    const user = req.user;
    const target = (store.users || []).find(u => u.id === Number(id));
    if (!target || !checkSchoolScope(user, target.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(target, body, 'کاربر');
    if (conflict) return conflict;

    const isSelf = user.id === target.id;
    const isManager = user.role === 'manager' || user.role === 'superadmin';

    /* BUG-3 (باگ‌هانت چت ۵): مدلِ مجوز (authz/model.json: users.upd) فقط
       manager/superadmin است و sync خودبه‌روزرسانیِ غیرمدیر را role_denied
       می‌کند (phone/national_id/status/active فقط-مدیریتی‌اند)؛ ولی این
       مسیر به هر نقشی اجازه می‌داد رکوردِ خودش را — شاملِ همان فیلدهایِ
       حساس — تغییر دهد. برایِ یکپارچگی با sync، users.upd در REST هم
       فقط-مدیر است (کلاینتِ آفلاین‌محور اصلاً این endpoint را صدا نمی‌زند). */
    if (!isManager) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'ویرایش کاربر فقط توسط مدیریت مجاز است' } };
    }

    // Role change rules
    if (body.role && body.role !== target.role) {
      if (!isManager) {
        return { status: 403, body: { ok: false, code: 'forbidden', message: 'تغییر نقش فقط توسط مدیریت مجاز است' } };
      }
      const targetLvl = ROLE_LEVEL[body.role];
      if (user.role !== 'superadmin' && (targetLvl == null || targetLvl > ROLE_LEVEL[user.role])) {
        return { status: 403, body: { ok: false, code: 'role_escalation', message: 'ارتقای نقش به سطحی بالاتر از خود مجاز نیست' } };
      }
      target.role = body.role;
    }

    const allowed = ['full_name', 'phone', 'national_id', 'active', 'status', 'grade_level', 'field'];
    for (const key of allowed) {
      if (body[key] !== undefined) target[key] = body[key];
    }
    bump(target); /* P0-18 */

    markDirty();
    if (db) await db.persistOp({ c: 'users', t: 'upd', data: target });

    audit('user_updated', { user_id: user.id, target_user_id: target.id });
    return { status: 200, body: { ok: true, data: projectUserByRole(target, user.role, isSelf) } };
  }

  async function deleteUser(req, id) {
    const user = req.user;
    if (user.role !== 'manager' && user.role !== 'superadmin') {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیریت مجاز به حذف حساب کاربری است' } };
    }

    const uIdx = (store.users || []).findIndex(u => u.id === Number(id));
    if (uIdx === -1) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    const target = store.users[uIdx];
    if (!checkSchoolScope(user, target.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('users', { id: Number(id) }, {
      actor: user,
      audit: () => audit('user_deleted', { user_id: user.id, target_user_id: Number(id) })
    });
    if (!del.ok) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }
    return { status: 200, body: { ok: true, message: 'کاربر با موفقیت حذف شد' } };
  }

  return {
    getUsersList,
    getUserById,
    createUser,
    updateUser,
    deleteUser
  };
}

module.exports = { createUserRoutes };
