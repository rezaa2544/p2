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

const policy = require('../policy'); /* Wave 5 — مدلِ یکتای مجوز */
const { checkOcc, bump, recordRejectedConflict } = require('../occ'); /* P0-18 + B4 */
const { paginateArray, parsePaginationParams } = require('../middleware/pagination');
const { projectUserByRole } = require('../middleware/projection');
const { buildUsersList, executePagedList } = require('../dbquery'); /* Wave 3 (chat2) */const cache = require('../cache'); /* Wave 11 */

const ROLE_LEVEL = { student: 0, parent: 1, driver: 1, counselor: 3, teacher: 3, edu_office: 3, manager: 4, superadmin: 5 };

function createUserRoutes(ctx) {
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
        office: policy.userOffice(store, user), /* Wave 5 — هندسهٔ اداره جای bypass */
        role: urlParams.get('role'),
        search: urlParams.get('q'),
        limit: paginationOpts.limit,
        cursor: paginationOpts.cursor
      });
      const res = await executePagedList(db, built, paginationOpts);
      res.data = res.data.map(u => projectUserByRole(u, user.role, u.id === user.id));
      return { ok: true, ...res };
    }

    /* Memory/JS pipeline — Wave 5: همان مدلِ یکتا (دایرکتوریِ کاربرانِ مدرسه؛
       حساب‌های ملیِ بی‌مهار فقط سوپرامین؛ والد/دانش‌آموز فقط خود+فرزندان). */
    let list = (store.users || []);
    list = policy.filterReadable(store, user, 'users', list);

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

  async function getUserById(req, id) {
    const user = req.user;
    const target = await findLive('users', id);
    /* Wave 5 — دروازهٔ خواند‌نِ یکتا (بیرون محدوده ⇒ ۴۰۴ ضدشمارش)؛
       findLive = هیدریشنِ PG-first پیش از سنجشِ محدوده (ویو ۱) */
    const gate = policy.restReadGate(store, user, 'users', target);
    if (!target || !gate.ok) {
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
    /* Wave 5 — نقش از مدلِ واحد (authz/write-perms: users.ins = manager/superadmin).
       edu_office که پیش‌تر از این در بازکردنِ موازی رد می‌شد دیگر کاربر نمی‌سازد. */
    if (!policy.restWriteRoleOk(user, 'users', 'ins')) {
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
    /* Wave 1: PG-first — the insert commits before the cache is touched, so a
       PG failure returns here with the store still clean (memory mode: no-op). */
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'users', t: 'ins', data: newUser }]);
      } else if (db && typeof db.persistOp === 'function') {
        await db.persistOp({ c: 'users', t: 'ins', data: newUser });
      }
    } catch (e) {
      return pgDown();
    }
    store.users.push(newUser);
    markDirty();

      cache.invalidateCollection('users', newUser.school_id).catch(() => {}); /* Wave 11: انقضایِ کش پس از نوشت */
    audit('user_created', { user_id: user.id, target_user_id: newUser.id, role: newUser.role, school_id: schoolId });
    return { status: 201, body: { ok: true, data: projectUserByRole(newUser, user.role) } };
  }

  async function updateUser(req, id, body) {
    const user = req.user;
    const target = await findLive('users', id);
    /* Wave 5 — دروازهٔ نوشتنِ یکتا: نقش از مدل + محدوده از policy.inScope
       (بیرون محدوده ۴۰۴؛ findLive مطمئن می‌شود رکورد در store هست تا
       inScopeِ رکورد-محور حلِ صحیح کند — ویو ۱). */
    const scopeOk = !!target && policy.inScope(user, store, 'users', target.id, target);
    if (!target || !scopeOk) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* P0-18: OCC — نسخهٔ پایهٔ نادرست ⇒ ۴۰۹ */
    const conflict = checkOcc(target, body, 'کاربر');
    if (conflict) {
      /* B4: rejected concurrent write ⇒ recorded in sync_conflicts (SSoT) */
      await recordRejectedConflict({ store, db, ids }, { collection: 'users', rec: target, user, base: body && (body.base_version !== undefined ? body.base_version : body.version), body });
      return conflict;
    }

    const isSelf = user.id === target.id;
    const isManager = user.role === 'manager' || user.role === 'superadmin';
    /* Wave 5 — IEP دبیر (استثنای صریحِ مدل، آینهٔ sync) */
    const isIep = policy.isTeacherIepUpdate(user, 'users', 'upd', Object.keys(body || {}));

    /* BUG-3 (باگ‌هانت چت ۵): مدلِ مجوز (authz/model.json: users.upd) فقط
       manager/superadmin است و sync خودبه‌روزرسانیِ غیرمدیر را role_denied
       می‌کند (phone/national_id/status/active فقط-مدیریتی‌اند)؛ ولی مسیرِ
       قبلی به هر نقشی اجازه می‌داد رکوردِ خودش را — شاملِ همان فیلدهایِ
       حساس — تغییر دهد. برایِ یکپارچگی با sync، users.upd در REST هم
       فقط-مدیر است (کلاینتِ آفلاین‌محور اصلاً این endpoint را صدا نمی‌زند). */
    if (!isManager) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'ویرایش کاربر فقط توسط مدیریت مجاز است' } };
    }
    /* محدودهٔ IEP: دبیر فقط روی کاربرانی که در کلاس‌هایش‌اند یا هم‌مدرسه‌ایِ
       مستقیم — همان inScope که در بالا رد کرد؛ اینجا فقط کلیدها سنجیده می‌شوند. */
    if (isIep && !isSelf && !isManager && user.school_id != null && Number(target.school_id) !== Number(user.school_id)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* Wave 1: patch روی کپی محاسبه می‌شود؛ store فقط پس از کامیت PG لمس می‌شود. */
    const next = Object.assign({}, target);
    // Role change rules
    if (body.role && body.role !== target.role) {
      if (!isManager) {
        return { status: 403, body: { ok: false, code: 'forbidden', message: 'تغییر نقش فقط توسط مدیریت مجاز است' } };
      }
      const targetLvl = ROLE_LEVEL[body.role];
      if (user.role !== 'superadmin' && (targetLvl == null || targetLvl > ROLE_LEVEL[user.role])) {
        return { status: 403, body: { ok: false, code: 'role_escalation', message: 'ارتقای نقش به سطحی بالاتر از خود مجاز نیست' } };
      }
      next.role = body.role;
    }

    /* Wave 5 — allowlistِ تفکیکی: خودِ کاربر فقط full_name؛ مدیریت مجموعهٔ
       مدیریتی؛ IEP فقط کلیدهای iep_* — فیلدِ ناشناخته/ممنوع = field_denied. */
    const bodyKeys = Object.keys(body || {}).filter(k => k !== 'id' && k !== 'base_version' && k !== 'version');
    const allowed = isManager ? ['full_name', 'phone', 'national_id', 'active', 'status', 'grade_level', 'field']
                  : isIep   ? policy.IEP_KEYS
                  :           policy.SELF_EDIT_FIELDS.users;
    const denied = bodyKeys.filter(k => allowed.indexOf(k) === -1);
    if (denied.length) {
      return { status: 403, body: { ok: false, code: 'field_denied', message: 'فیلد(‌های) «' + denied.join('، ') + '» برای این مسیر قابلِ ویرایش نیستند' } };
    }
    for (const key of allowed) {
      if (body[key] !== undefined) next[key] = body[key];
    }
    if (isIep) next.iep_updated = new Date().toISOString();
    bump(next); /* P0-18 */

    const base = body.base_version !== undefined ? body.base_version : body.version;
    try {
      if (db && typeof db.persistOpsBatch === 'function') {
        await db.persistOpsBatch([{ c: 'users', t: 'upd', id: target.id, data: next, base_version: base }]);
      } else if (db) {
        await db.persistOp({ c: 'users', t: 'upd', data: next });
      }
    } catch (e) {
      if (e && e.status === 409) return { status: 409, body: { ok: false, code: 'conflict', message: 'کاربر هم‌زمان تغییر کرده است' } };
      return pgDown();
    }

    /* کامیت به کش: به‌روزرسانی کپی store (یا seed اگر رکوردِ نمونهٔ دیگر است). */
    const cached = (store.users || []).find(u => u.id === Number(id));
    if (cached) Object.assign(cached, next);
    else { if (!Array.isArray(store.users)) store.users = []; store.users.push(next); }
    markDirty();
    cache.invalidateCollection('users', target.school_id).catch(() => {}); /* Wave 11: انقضایِ کش پس از نوشت */

    audit('user_updated', { user_id: user.id, target_user_id: target.id });
    return { status: 200, body: { ok: true, data: projectUserByRole(cached || next, user.role, isSelf) } };
  }

  async function deleteUser(req, id) {
    const user = req.user;
    if (!policy.restWriteRoleOk(user, 'users', 'del')) {
      return { status: 403, body: { ok: false, code: 'forbidden', message: 'فقط مدیریت مجاز به حذف حساب کاربری است' } };
    }

    const target = await findLive('users', id);
    if (!target) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* Wave 5 — حذفِ بین‌مدرسه‌ای و حساب‌هایِ ملیِ بی‌مهار برایِ مدیر رد
       (fail-closed؛ دروازهٔ inScope همان دروازهٔ sync است؛ target از findLive) */
    if (!policy.inScope(user, store, 'users', target.id, target)) {
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }

    /* P0-17: حذف امن با سرویس واحد — سنگ‌قبر + نسخه + رویداد برون‌مرزی */
    const del = await deleter.softDelete('users', { id: Number(id) }, {
      actor: user,
      audit: () => audit('user_deleted', { user_id: user.id, target_user_id: Number(id) })
    });
    if (!del.ok) {
      if (del.status === 503) return pgDown();
      return { status: 404, body: { ok: false, code: 'not_found', message: 'کاربر یافت نشد' } };
    }
    cache.invalidateCollection('users', target.school_id).catch(() => {}); /* Wave 11: انقضایِ کش پس از نوشت */
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
