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
const { createPolicy } = require('../policy');

const ROLE_LEVEL = { student: 0, parent: 1, driver: 1, counselor: 3, teacher: 3, edu_office: 3, manager: 4, superadmin: 5 };

function createUserRoutes(ctx) {
  const store = ctx.store;
  const db = ctx.db;
  const ids = ctx.ids; /* P0-16 */
  const deleter = ctx.deleter; /* P0-17 */
  const audit = ctx.audit || (() => {});
  const markDirty = ctx.markDirty || (() => {});
  const policy = createPolicy({ store });
  const COLL = 'users';

  function denied(pa){
    return { status: pa.status, body: { ok: false, code: pa.code, message: pa.message } };
  }

  function getUsersList(req, urlParams) {
    const user = req.user;
    /* P0-03: هر endpoint از authorize می‌گذرد (خوانش: نقشِ شناخته‌شده) */
    const pa = policy.authorize(user, 'read', { coll: COLL });
    if(!pa.ok) return denied(pa);
    let list = (store.users || []);
    list = filterByScope(user, list, store);

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
    const paginationOpts = parsePaginationParams(urlParams);
    const paginated = paginateArray(list, paginationOpts);

    paginated.data = paginated.data.map(u => projectUserByRole(u, user.role, u.id === user.id));
    return { ok: true, ...paginated };
  }

  function getUserById(req, id) {
    const user = req.user;
    /* P0-03: هر endpoint از authorize می‌گذرد (خوانش: نقشِ شناخته‌شده) */
    const pa0 = policy.authorize(user, 'read', { coll: COLL, id: Number(id) });
    if(!pa0.ok) return denied(pa0);
    const target = (store.users || []).find(u => u.id === Number(id));
    if (!target || !checkSchoolScope(user, target.school_id, store)) {
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

    /* P0-03: نقش + قلمرو از policy مرکزی (manager/superadmin — هم‌ترازِ sync).
       توجه: edu_office دیگر کاربر نمی‌سازد (در sync هم نمی‌توانست). */
    const pa = policy.authorize(user, 'ins', { coll: COLL }, { role: body.role, school_id: user.school_id });
    if(!pa.ok) return denied(pa);
    const pv = policy.validate('ins', COLL, body);
    if(!pv.ok) return denied(pv);

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
    /* P0-03: نقش + قلمرو از policy مرکزی. exc=self جایِ isSelf، و
       exc=iep از این مسیر پذیرفته نیست (IEP فقط از /students). */
    const pa = policy.authorize(user, 'upd', { coll: COLL, id: Number(id) }, body || {});
    if(!pa.ok) return denied(pa);
    if(pa.exc === 'iep')
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'به‌روزرسانی IEP فقط از مسیر دانش‌آموزان مجاز است' } };
    /* P0-06: خودبه‌روزرسانیِ غیر-مدیر فقط فیلدهایِ SELF_ALLOWED_FIELDS.
       مدیر رویِ خودش/دیگران با اختیاراتِ مدیریتی کار می‌کند (نامحدود). */
    if(pa.exc === 'self' && user.role !== 'manager' && user.role !== 'superadmin'){
      const deniedKeys = policy.selfFieldDenied(body || {});
      if(deniedKeys.length)
        return { status: 403, body: { ok: false, code: 'field_denied',
          message: 'تغییرِ «' + deniedKeys.join('، ') + '» در خودبه‌روزرسانی مجاز نیست' } };
    }
    const pv = policy.validate('upd', COLL, body || {});
    if(!pv.ok) return denied(pv);

    const target = (store.users || []).find(u => u.id === Number(id));
    if (!target) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(target, body, 'کاربر');
    if (conflict) return conflict;

    const isSelf = user.id === target.id;
    const isManager = user.role === 'manager' || user.role === 'superadmin';

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

    /* P0-06: email/profile_picture هم اعمال می‌شوند (عضوِ SELF_ALLOWED_FIELDS‌اند) */
    const allowed = ['full_name', 'phone', 'national_id', 'active', 'status', 'grade_level', 'field', 'email', 'profile_picture'];
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
    /* P0-03: حذف هم تحتِ مجوزِ مدل است (مثلِ sync) — نه فقط نقشِ دستی */
    const pa = policy.authorize(user, 'del', { coll: COLL, id: Number(id) });
    if(!pa.ok) return denied(pa);

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
