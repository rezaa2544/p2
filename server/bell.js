/* ═══════════════════════════════════════════════════════════════════
   payesh-server — GET /api/bell/now (stage 2, AD 13.4)
   -------------------------------------------------------------------
   The "live" views in the client (family bell cards, teacher bar)
   are rendered by a periodic bridge — every 45 s (user-decided
   30–60 s window). In server mode each tick pulls this tiny
   endpoint instead of trusting the device clock / local data only:

     1. ts        — the SERVER clock. The client stores it in
                    sms_server_time_v1, which activates the third
                    layer of clockSanity() (device-vs-server drift
                    warning) — the hook that was waiting for exactly
                    this connection.
     2. family    — today's attendance per visible child, straight
                    from the store. This is what makes the live card
                    multi-device: a teacher records a status, the
                    parent's next poll shows it.
     3. teacher   — school id of the teacher (clock correction for
                    the teacher bar).

   Security (contract §3/§5):
     - session required (401 otherwise);
     - scope comes from the JWT user, NEVER from the request:
       a parent only ever gets rows for their own parent_links,
       a teacher only their own school;
     - the payload is minimal and sanitized: no phone, no nid,
       no password material — by construction.

   No Persian strings here on purpose: labels are rendered by the
   client from its own data (glyph-safety rule from CONTRIBUTING).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

function isoOf(t){
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

/* today's attendance status for a student in the store (null = none) */
function attFor(store, studentId, dateISO){
  const a = (store.attendance || []).find(
    (x) => x.student_id === studentId && x.date === dateISO);
  return a ? a.status : null;
}

/* the visible children of the logged-in user, from parent_links only.
   This is the mutation-critical scope filter (M9): it must never
   broaden beyond the user's own links. */
function childrenOf(store, userId, role){
  if(role === 'student') return [userId];
  if(role === 'parent'){
    return (store.parent_links || [])
      .filter((p) => p.parent_id === userId)
      .map((p) => p.student_id);
  }
  return [];
}

function createBell(ctx){
  const store = ctx.store;
  const audit = ctx.audit;

  return {
    async apiBellNow(req, res){
      /* sessionFrom already resolves the JWT to the (active) user */
      const user = await ctx.sessionFrom(req);
      if(!user || user.id == null){
        return ctx.sendJson(res, 401, { ok: false, code: 'no_session' });
      }
      const t = new Date();
      const iso = isoOf(t);
      const kids = childrenOf(store, user.id, user.role);
      const family = kids
        .map((k) => ({ studentId: k, att: attFor(store, k, iso) }));
      const teacher = user.role === 'teacher' && user.school_id
        ? { schoolId: user.school_id }
        : null;
      audit('bell_now', { role: user.role, kids: kids.length });
      ctx.sendJson(res, 200, {
        ok: true,
        ts: t.getTime(),
        date: iso,
        family,
        teacher
      });
    }
  };
}

module.exports = { createBell, attFor, childrenOf, isoOf };
