/* ═══════════════════════════════════════════════════════════════════
   server/policy.js — لایهٔ یکپارچهٔ سیاستِ دسترسی (P0-03 ؛ تک‌منبعِ REST)
   -------------------------------------------------------------------
   پیش از این، endpointهایِ `/api/v1/*` منطقِ مجوزِ دستی و جداگانه‌ای
   داشتند (فقط role چک می‌شد، بدونِ مدلِ مرکزی). حالا هر endpoint از
   همین در می‌گذرد — با همان هسته‌ای که /api/sync استفاده می‌کند:

     authorize(user, op, resource, payload)  نقش + قلمرو (canOp + scope)
     validate(op, coll, payload)             شکلِ بدنه (ruleFor + alias)
     scope(user, resource)                   قلمرو (inScope + tenancy)

   - op: 'read' | 'ins' | 'upd' | 'del'  (تطبیقِ REST: GET/POST/PATCH/DELETE)
   - resource: { coll, id? }  — برایِ students، coll همان 'users' است.
   - authorize برایِ خوانش (404-not-403): بیرونِ قلمرو ⇒ 404، نه 403.

   استثناهایِ هم‌ترازِ sync (همان معنا، همان‌جا):
     • self: کاربر رویِ رکوردِ خودش (users.upd) — نقش عبور می‌کند؛
       تحدیدِ فیلد با SELF_ALLOWED_FIELDS در اعتبارسنجی/روت (P0-06).
     • iep: دبیر رویِ دانش‌آموز فقط با کلیدهایِ IEP (هم‌ارزِ exc در sync).

   فیلدهایِ REST-ویژه (در مدلِ sync نیستند ولی قراردادِ API عمومی‌اند):
     attendance.late ، grades.base_version/type ، users.profile_picture/email
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const sync = require('./sync');
const { ruleFor, checkRule, checkGeneric } = require('./validate');
const tenancy = require('./tenancy');

const KNOWN_ROLES = ['student', 'parent', 'driver', 'counselor',
  'teacher', 'edu_office', 'manager', 'superadmin'];
const IEP_KEYS = ['iep_notes', 'iep_staff', 'iep_updated'];

/* P0-06 — تنها فیلدهایی که کاربر می‌تواند رویِ خودش عوض کند.
   phone/national_id/role/school_id/active/status عمداً بیرون‌اند:
   تغییرشان workflow احرازِ جداگانه می‌خواهد. */
const SELF_ALLOWED_FIELDS = ['full_name', 'profile_picture', 'email'];

const REST_ALIASES = {
  attendance: { late: { type: 'integer', min: 0, max: 1440 } },
  grades: { base_version: { type: 'integer', min: 1 }, type: { type: 'string', max: 32 } },
  users: { profile_picture: { type: 'string', max: 500 }, email: { type: 'string', max: 200 } },
  classes: {},
};

function deny(status, code, message){
  return { ok: false, status, code, message };
}

function createPolicy(ctx){
  const store = (ctx && ctx.store) || null;
  if(store && typeof sync.attach === 'function') sync.attach(store);
  const AUTHZ = sync.AUTHZ || {};

  /* ── قلمرو ─────────────────────────────────────────────────── */
  function scope(user, resource){
    resource = resource || {};
    const coll = resource.coll;
    const id = resource.id;
    const data = resource.data;
    if(!user || !coll) return false;
    if(user.role === 'superadmin') return true;
    /* edu_office: قلمروِ tenancy (تک‌منبع: tenancy.js) — دیگر global نیست */
    if(user.role === 'edu_office'){
      if(!store) return false;
      const sid = tenancy.resolveSchoolId(store, coll, id, data);
      if(sid == null) return false;
      return tenancy.inOfficeScope(store, user, sid);
    }
    return sync.inScope(user, coll, id, data);
  }

  function targetIsStudent(id){
    if(!store || id == null) return false;
    const t = (store.users || []).find(u => u.id === Number(id));
    return !!(t && t.role === 'student');
  }

  function iepOnly(data){
    const ks = Object.keys(data || {});
    return ks.length > 0 && ks.every(k => IEP_KEYS.indexOf(k) > -1);
  }

  /* ── مجوز ───────────────────────────────────────────────────── */
  function authorize(user, op, resource, payload){
    if(!user || KNOWN_ROLES.indexOf(user.role) === -1)
      return deny(401, 'unauthorized', 'احراز هویت معتبر نیست');
    const coll = resource && resource.coll;
    const def = coll && AUTHZ[coll];
    /* مجموعهٔ ناشناخته = رد — حتی superadmin (هم‌ترازِ canOp) */
    if(!def) return deny(403, 'unknown_collection', 'این مجموعه در مدلِ مجوز نیست');
    /* خوانش: نقشِ شناخته‌شده عبور می‌کند؛ فیلترِ قلمرو در روت اعمال می‌شود */
    if(op === 'read') return { ok: true, exc: null };
    if(op !== 'ins' && op !== 'upd' && op !== 'del')
      return deny(403, 'bad_operation', 'عملیاتِ ناشناخته');
    const id = resource.id;
    const data = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    /* استثناها (هم‌ترازِ sync): self و IEP */
    let exc = null;
    if(coll === 'users' && op === 'upd' && id != null && Number(id) === Number(user.id)) exc = 'self';
    else if(coll === 'users' && op === 'upd' && user.role === 'teacher' && iepOnly(data) && targetIsStudent(id)) exc = 'iep';
    if(!exc && !sync.canOp(user.role, coll, op))
      return deny(403, 'role_denied', 'این عملیات برای نقش شما مجاز نیست');
    if(!scope(user, { coll, id, data }))
      return deny(404, 'not_found', 'یافت نشد');
    return { ok: true, exc };
  }

  /* ── اعتبارسنجیِ شکلِ بدنه ──────────────────────────────────── */
  function validate(op, coll, payload){
    if(op === 'read' || op === 'del') return { ok: true };
    if(!payload || typeof payload !== 'object' || Array.isArray(payload))
      return deny(400, 'malformed', 'بدنه باید یک شیء باشد');
    const def = AUTHZ[coll];
    if(!def) return deny(403, 'unknown_collection', 'این مجموعه در مدلِ مجوز نیست');
    const fields = def.fields || [];
    const aliases = REST_ALIASES[coll] || {};
    for(const k of Object.keys(payload)){
      const inModel = fields.indexOf(k) > -1;
      const inAlias = Object.prototype.hasOwnProperty.call(aliases, k);
      if(!inModel && !inAlias)
        return deny(400, 'unknown_field', 'فیلدِ ناشناخته: ' + k);
      const v = payload[k];
      if(v === undefined || v === null || v === '') continue; /* patchِ جزئی */
      const rule = inAlias ? aliases[k] : ruleFor(coll, k);
      const r = rule ? checkRule(v, rule) : checkGeneric(v);
      if(r) return deny(400, 'invalid', 'مقدارِ «' + k + '» معتبر نیست (' + r + ')');
    }
    return { ok: true };
  }

  /* ── تحدیدِ self-update (P0-06): distinctions در روت اعمال می‌شود ── */
  function selfFieldDenied(payload){
    return Object.keys(payload || {}).filter(k => SELF_ALLOWED_FIELDS.indexOf(k) === -1);
  }

  return { authorize, validate, scope, selfFieldDenied };
}

module.exports = { createPolicy, SELF_ALLOWED_FIELDS, REST_ALIASES, KNOWN_ROLES };
