/* ═══════════════════════════════════════════════════════════════════
   server/middleware/scope.js — Role Authorization & School Boundary Scope
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - Multi-tenant school domain boundary enforcement (school_id scope).
   - Role-Based Access Control (RBAC) guard.
   - Resource-level scope guards for Teacher, Student, and Parent.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

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
 */
function checkSchoolScope(user, targetSchoolId) {
  if (!user) return false;
  if (user.role === 'superadmin' || user.role === 'edu_office') return true;
  if (targetSchoolId == null) return true;
  return Number(user.school_id) === Number(targetSchoolId);
}

/**
 * Filter an array of records by the user's school scope
 * @param {Object} user - Authenticated session
 * @param {Array} records - List of records with school_id
 */
function filterByScope(user, records) {
  if (!Array.isArray(records)) return [];
  if (!user || user.role === 'superadmin' || user.role === 'edu_office') {
    return records;
  }
  return records.filter(r => r.school_id == null || Number(r.school_id) === Number(user.school_id));
}

module.exports = {
  requireRoles,
  checkSchoolScope,
  filterByScope
};
