/* ═══════════════════════════════════════════════════════════════════
   server/idor.js — GET /api/students/:id, the reference IDOR endpoint
   Contract: docs/SERVER_SECURITY_CONTRACT.md
     §1.2  — scope check per record; OUT OF SCOPE → 404 (never 403 —
             a 403 would let an attacker enumerate real ids)
     §5.7  — enumeration guard: slow down + warn, do not cut
     §4.1  — phone / national_id never leave the server
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const policy = require('./policy'); /* ویو ۵ — مدلِ یکتا */

/* ctx: { store, audit, sessionFrom, sendJson }
   (R97: ENUM_* و نگهبانِ درونِ این ماژول به روتر منتقل شد.) */
function createIdor(ctx){
  const store = ctx.store;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;

  async function apiStudent(req, res, id){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });

    /* R97: نگهبانِ شمردنِ شناسه به سطحِ روتر منتقل شد (یک منبعِ حقیقت؛
       این endpoint 404 برمی‌گرداند و روتر آن را می‌شمارد). */

    const sid = Number(id);
    if(!Number.isInteger(sid) || sid <= 0) return sendJson(res, 404, { ok: false, code: 'not_found' });
    const st = (store.users || []).find(u => u.id === sid && u.role === 'student');
    if(!st) return sendJson(res, 404, { ok: false, code: 'not_found' });

    /* ویو ۵ — منبعِ یکتا: قراردادِ §۱.۲ در policy.studentRecordOk نشسته است
       (همان قواعد: مدیرِ سخت‌مدرسه، دبیرِ کلاسِ تدرسیِ واقعی، ولی از
       parent_links، دانش‌آموزِ خودش؛ بقیهٔ نقش‌ها از جمله اداره ⇒ رد).
       رد ⇒ ۴۰۴ (هرگز ۴۰۳ — ضدِ شمارشِ شناسه). */
    if(!policy.studentRecordOk(store, s, st)) return sendJson(res, 404, { ok: false, code: 'not_found' });

    /* sanitized projection — no phone / national_id (§4.1) */
    sendJson(res, 200, { ok: true, student: { id: st.id, full_name: st.full_name, school_id: st.school_id, active: st.active, username: st.username } });
  }

  return { apiStudent };
}
module.exports = { createIdor };
