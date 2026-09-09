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

/* ── فاز ۲.۴: مسیرِ خواندنِ تفکیک‌شده ──────────────────────────────
   partitioning (server/partitioning.js) نمایهٔ «ردیف‌های هر مدرسه» را
   نگه می‌دارد تا خوانشِ محدودشده، کلِ مجموعه را پویش نکند. اینجا فقط
   یک نگهدارنده است (تزریق از index.js) تا این میان‌افزار به چیزی
   وابسته نشود. */
let _part = null;   /* { partitioning, store } */

function setPartitioning(partitioning, store) {
  _part = (partitioning && store) ? { partitioning: partitioning, store: store } : null;
}

/**
 * Filter an array of records by the user's school scope
 * @param {Object} user - Authenticated session
 * @param {Array|string} records - آرایهٔ ردیف‌ها **یا نامِ مجموعه**
 *
 * اگر **نامِ مجموعه** بدهید (مسیرِ تازه)، خوانش از نمایهٔ تفکیک‌شده
 * انجام می‌شود (O(ردیف‌های همان مدرسه) به‌جای O(کل)). اگر **آرایه**
 * بدهید (مسیرِ قدیمی)، همان رفتارِ همیشگی. و اگر نمایه‌ای در کار نباشد،
 * به همان پویشِ قدیمی برمی‌گردیم — هرگز به‌خاطرِ یک بهینه‌سازی، داده‌ای
 * را پنهان نمی‌کنیم (fail-closed برعکس: اینجا «بی‌داده نماندن» اصل است).
 */
function filterByScope(user, records) {
  if (typeof records === 'string') {
    if (_part) return _part.partitioning.scoped(user, records);
    const rows = (_part && _part.store) ? _part.store[records] : null;
    if (!Array.isArray(rows)) return [];
    if (!user || user.role === 'superadmin' || user.role === 'edu_office') return rows;
    return rows.filter(r => r.school_id == null || Number(r.school_id) === Number(user.school_id));
  }
  if (!Array.isArray(records)) return [];
  if (!user || user.role === 'superadmin' || user.role === 'edu_office') {
    return records;
  }
  return records.filter(r => r.school_id == null || Number(r.school_id) === Number(user.school_id));
}

module.exports = {
  requireRoles,
  checkSchoolScope,
  filterByScope,
  setPartitioning
};
