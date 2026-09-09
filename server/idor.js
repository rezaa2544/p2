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

    let ok = false;
    if(s.role === 'superadmin') ok = true;
    else if(s.role === 'manager') ok = st.school_id === s.school_id;
    else if(s.role === 'student') ok = sid === s.id;
    else if(s.role === 'parent') ok = (store.parent_links || []).some(l => l.parent_id === s.id && l.student_id === sid);
    else if(s.role === 'teacher'){
      const enr = (store.enrollments || []).find(x => x.student_id === sid);
      if(enr){
        const cls = (store.classes || []).find(c => c.id === enr.class_id);
        ok = !!cls && (cls.homeroom_teacher_id === s.id || (store.schedule || []).some(q => q.class_id === cls.id && q.teacher_id === s.id));
      }
    }
    if(!ok) return sendJson(res, 404, { ok: false, code: 'not_found' });

    /* sanitized projection — no phone / national_id (§4.1) */
    sendJson(res, 200, { ok: true, student: { id: st.id, full_name: st.full_name, school_id: st.school_id, active: st.active, username: st.username } });
  }

  return { apiStudent };
}
module.exports = { createIdor };
