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

/* ctx: { store, ENUM_WINDOW_MS, ENUM_THRESHOLD, ENUM_SLOW_MS, audit,
          sessionFrom, sendJson } */
function createIdor(ctx){
  const store = ctx.store;
  const ENUM_WINDOW_MS = ctx.ENUM_WINDOW_MS;
  const ENUM_THRESHOLD = ctx.ENUM_THRESHOLD;
  const ENUM_SLOW_MS = ctx.ENUM_SLOW_MS;
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function apiStudent(req, res, id){
    const s = sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });

    /* enumeration guard — slow down and warn, never hard-cut (§5.7.2) */
    const now = Date.now();
    const e = (store.__auth.enum[s.jti] = store.__auth.enum[s.jti] || { t: now, n: 0 });
    if(now - e.t > ENUM_WINDOW_MS){ e.t = now; e.n = 0; }
    e.n += 1;
    if(e.n > ENUM_THRESHOLD){
      if(e.n === ENUM_THRESHOLD + 1) audit('enum_warn', { user_id: s.id, rate: e.n + '/60s' });
      await sleep(ENUM_SLOW_MS * Math.ceil((e.n - ENUM_THRESHOLD) / 10));
    }

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
