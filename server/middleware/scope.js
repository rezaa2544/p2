/* ═══════════════════════════════════════════════════════════════════
   server/middleware/scope.js — Role Authorization & Tenant Scope
   -------------------------------------------------------------------
   ویو ۵ (بخش دوم): این فایل دیگر سیاست موازی ندارد — فقط «درِ سازگاری»
   روی مدل یکتای `server/policy.js` است.

   تغییرات رفتاری امنیتی (با آزمون در tests/wave5-authz.js):
     • checkSchoolScope: رکورد بدونِ school_id دیگر «برایِ همه مجاز» نیست
       (فقط سوپرامین — fail-closed). پیش از این `targetSchoolId == null`
       یعنی allow برایِ همه → نشتِ حساب‌هایِ ملی/سراسری به نقش‌هایِ محلی.
     • edu_office: از «دور‌زدنِ کاملِ محدوده» به «هندسهٔ دفتر» (استان/
       شهرستان/منطقه) تنزل یافت — یکسان با دروازهٔ نوشتنِ sync.
     • filterByScope: فیلترِ مجموعه‌محورِ یکتا (خواند‌ن) — مهارِ سختِ مدرسه،
       مالکیتِ رکوردیِ دانش‌آموز/والی/دبیر؛ دیگر هیچ رکوردِ بی‌مهار
       رد نمی‌شود که «چون مدرسه ندارد» بماند.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const policy = require('../policy');

/**
 * Middleware factory to require specific roles
 * @param  {...string} allowedRoles - list of authorized roles (e.g., 'manager', 'superadmin')
 */
function requireRoles(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    const user = req.user || req.session;
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, code: 'unauthorized', message: 'نیاز به احراز هویت است' }));
      return false;
    }

    if (user.role === 'superadmin') {
      if (next) next();
      return true;
    }

    if (!allowedRoles.includes(user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, code: 'forbidden', message: 'شما دسترسی لازم به این بخش را ندارید' }));
      return false;
    }

    if (next) next();
    return true;
  };
}

/**
 * School-boundary check — fail-closed. Accepts a school id or a record.
 * superadmin: always; edu_office: office geometry (needs store — without it
 * the check fails closed on purpose); school roles: strict id equality;
 * null school (record without anchor): DENIED except superadmin.
 */
function checkSchoolScope(user, target, store) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const schoolId = (target !== null && typeof target === 'object') ? target.school_id : target;
  if (user.role === 'edu_office') {
    if (schoolId == null) return false;
    if (!store) return false; /* بدونِ فروشگاه، هندسهٔ دفتر حل‌ناپذیر = رد (fail-closed) */
    return policy.schoolInOfficeScope(store, user, schoolId);
  }
  if (schoolId == null) return false;
  return Number(user.school_id) === Number(schoolId);
}

/**
 * Read-side list filter — delegates to the single policy model.
 * @param {Object} user  - session
 * @param {Array} records
 * @param {string} [coll] - collection key for role ownership ('users',
 *        'classes', 'grades', 'attendance', ...). Without coll, legacy
 *        school-scope semantics apply — still fail-closed on null school.
 */
function filterByScope(user, records, coll, store) {
  if (!Array.isArray(records)) return [];
  if (!user) return [];
  if (coll && store) return policy.filterReadable(store, user, coll, records);
  if (user.role === 'superadmin') return records;
  /* سازگاریِ فراخوانی‌هایِ قدیمی (بی‌coll): همان فیلترِ سختِ مدرسه، اما
     بدونِ نشتِ رکوردِ بی‌مهار — و هندسهٔ اداره وقتی store هست. */
  return records.filter((r) => {
    if (user.role === 'edu_office') return store ? policy.schoolInOfficeScope(store, user, r && r.school_id) : false;
    return r && r.school_id != null && Number(r.school_id) === Number(user.school_id);
  });
}

module.exports = {
  requireRoles,
  checkSchoolScope,
  filterByScope
};
