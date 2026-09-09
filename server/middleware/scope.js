/* ═══════════════════════════════════════════════════════════════════
   server/middleware/scope.js — Role Authorization & School Boundary Scope
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - Multi-tenant school domain boundary enforcement (school_id scope).
   - Role-Based Access Control (RBAC) guard.
   - Resource-level scope guards for Teacher, Student, and Parent.
   - P0-07: edu_office دیگر global-pass ندارد؛ قلمرو از tenancy
     (استان→شهرستان→ناحیه→مدرسه). فراخوان‌ها store را می‌دهند؛
     بدونِ store رفتارِ legacy (برایِ سازگاریِ فراخوان‌هایِ قدیمی).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const tenancy = require('../tenancy');

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
 * Enforce school scope on records
 * @param {Object} user - Authenticated session
 * @param {number|string} targetSchoolId - School ID of the target resource
 * @param {Object} [store] - Data store (needed for edu_office tenancy)
 */
function checkSchoolScope(user, targetSchoolId, store) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  /* P0-07: پایانِ global-pass اداره */
  if (user.role === 'edu_office') {
    if (targetSchoolId == null) return true;
    if (!store) return true;
    return tenancy.inOfficeScope(store, user, targetSchoolId);
  }
  if (targetSchoolId == null) return true;
  return Number(user.school_id) === Number(targetSchoolId);
}

/**
 * Filter an array of records by the user's school scope
 * @param {Object} user - Authenticated session
 * @param {Array} records - List of records with school_id
 * @param {Object} [store] - Data store (needed for edu_office tenancy)
 */
function filterByScope(user, records, store) {
  if (!Array.isArray(records)) return [];
  if (!user || user.role === 'superadmin') {
    return records;
  }
  /* P0-07: اداره فقط مدرسه‌هایِ tenancy خودش (+ رکوردِ بی‌مدرسه، مثلِ نقش‌هایِ مدرسه) */
  if (user.role === 'edu_office') {
    if (!store) return records;
    return records.filter(r => r.school_id == null || tenancy.inOfficeScope(store, user, r.school_id));
  }
  return records.filter(r => r.school_id == null || Number(r.school_id) === Number(user.school_id));
}

module.exports = {
  requireRoles,
  checkSchoolScope,
  filterByScope
};
