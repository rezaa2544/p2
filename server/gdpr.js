/* ═══════════════════════════════════════════════════════════════════
   server/gdpr.js — حقِ فراموشی (تنها مسیرِ سیم‌کشی‌شده: DELETE /api/auth/account)
   ───────────────────────────────────────────────────────────────────
   - eraseUserData: پاک‌سازیِ کاملِ داده‌های شخصیِ کاربر از store (منتقل‌شده
     از apiDeleteAccount — همان ترتیب و همان گزاره‌ها؛ داده‌های نهادی می‌ماند).
   - eraseUserSessions: ابطالِ همهٔ نشست‌های کاربر (revoke-all) + ابطالِ صریحِ
     نشستِ جاری؛ پس از فراموشی هیچ توکنی — حتی سالم — پذیرفته نمی‌شود.
   - روتِ تازه‌ای اضافه نمی‌کند (check-authz بی‌اثر)؛ بدونِ PII در خروجی.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const revocation = require('./revocation');

/* پاک‌سازیِ داده‌های شخصی؛ خروجی: شمارِ حذف‌شده به‌تفکیکِ کالکشن (برای audit). */
function eraseUserData(store, uid) {
  const purged = {};
  function purge(coll, pred) {
    const rows = store[coll];
    if (!Array.isArray(rows)) return;
    const keep = rows.filter((r) => !pred(r));
    if (keep.length !== rows.length) {
      purged[coll] = rows.length - keep.length;
      store[coll] = keep;
    }
  }
  purge('parent_links', (r) => Number(r.parent_id) === uid || Number(r.student_id) === uid);
  purge('parent_verifications', (r) => Number(r.parent_id) === uid);
  purge('parent_subscriptions', (r) => Number(r.user_id) === uid);
  purge('messages', (r) => Number(r.from_id) === uid);
  purge('users', (r) => Number(r.id) === uid);
  return purged;
}

/* ابطالِ نشست‌ها: همه (نسخه) + جاری (jti)؛ خروجی: نسخهٔ جدید. */
async function eraseUserSessions(uid, currentJti, sessionTtlS) {
  if (currentJti) {
    try { await revocation.revokeSession(currentJti, sessionTtlS || 28800); } catch (e) {}
  }
  return revocation.revokeAllUserSessions(uid);
}

module.exports = { eraseUserData, eraseUserSessions };
