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
    const gone = rows.filter((r) => pred(r));
    if (!gone.length) return;
    purged[coll] = gone.length;
    store[coll] = rows.filter((r) => !pred(r));
    /* S2-3b (موج ۴): پلِ سنگ‌قبرِ دلتا. سطرِ پاک‌شدهٔ بی‌سنگ‌قبر رویِ
       کلاینت‌ها (دلتا و بوت‌استرپِ ادغامی) می‌ماند — فراموشیِ ناقص.
       سطرهایِ idدار سنگ‌قبرِ سبک می‌گیرند (همان سقفِ ۵۰۰۰)؛ پیوندِ مرکبِ
       بی‌id (parent_links) سنگ‌قبرِ کاذب نمی‌گیرد. شمار/ترتیب/گزاره‌ها
       بی‌تغییر. */
    if (!Array.isArray(store.__deleted_records)) store.__deleted_records = [];
    const at = new Date().toISOString();
    for (const g of gone) {
      if (g && g.id != null) {
        store.__deleted_records.push({
          c: coll, id: g.id,
          school_id: g.school_id != null ? g.school_id : null, at: at
        });
      }
    }
    if (store.__deleted_records.length > 5000) store.__deleted_records = store.__deleted_records.slice(-5000);
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
