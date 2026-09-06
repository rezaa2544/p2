/* ═══════════════════════════════════════════════════════════════════
   server/sync.js — POST /api/sync: the offline write queue
   Contract: docs/SERVER_SECURITY_CONTRACT.md §3
     #1 op.by === authenticated user — ONE forgery poisons the WHOLE batch
     #2 user/school stamps must match the token
     #3 role may write the collection (server-side mirror, fail closed)
     #4 target record is inside this user's scope
   Plus §3.3: uid idempotency, ≤500 ops, clock-skew log (not reject).
   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* Core mirror of the client's ACTION_ROLES table for WRITE operations.
   The full table mirror is the next phase (AD.md §14) — unknown
   collection/role here FAILS CLOSED. */
const WRITE_PERMS = {
  superadmin : ['*'],
  edu_office : [],
  manager    : ['attendance','attendance_modes','notify_queue','grades','discipline','leaves','announcements','notifications','messages','installments','transactions','tuitions','tuition_plans','schedule','classes','subjects','users','corrections','assets','visitors','lib_books','lib_loans','certificates','meeting_slots','bus_routes','bus_students','bus_events','bus_needs','bus_followups','counselor_refs','pre_enrollments','enrollments','student_transfers','transfer_requests','vclass_sessions','vclass_attendance','internships','preapps','scholarships','reexams','assoc_minutes','summer_classes','dorm_rooms','dorm_assignments','dorm_meals'],
  teacher    : ['attendance','notify_queue','grades','discipline','messages','corrections','hw_assignments','hw_submissions','vclass_sessions','vclass_attendance','vclass_questions','vclass_links','substitutions','teacher_notes','nudges','teacher_sms','internships'],
  counselor  : ['counselor_refs','messages','counselor_msgs'],
  student    : ['messages','hw_submissions','vclass_questions','counselor_msgs'],
  parent     : ['leaves','messages','parent_verifications','counselor_msgs'],
};
function canWrite(role, coll){
  const list = WRITE_PERMS[role];
  if(!list) return false;
  return list.indexOf('*') > -1 || list.indexOf(coll) > -1;
}

/* بند ۲.۲ — IEP: دبیر می‌تواند رکوردِ دانش‌آموز (users) را بروزرسانی کند،
   ولی فقط با فیلدهای IEP — استثنأ محدوده‌دار از fail-closed روی users.
   scope (inScope: همان مدرسه) همچنان جدا اعمال می‌شود. */
const IEP_KEYS = ['iep_notes','iep_staff','iep_updated'];
function iepUsersUpdate(s, op){
  if(op.c !== 'users' || s.role !== 'teacher') return false;
  if(op.t !== 'upd' || op.id == null) return false;
  const d = op.data || {};
  const keys = Object.keys(d).filter(k => k !== 'id');
  return keys.length > 0 && keys.every(k => IEP_KEYS.indexOf(k) > -1);
}

/* Round 76 — Dropout (soft status, no data deletion): a scoped,
   whitelist exception on `users` updates that touch dropout fields —
   same pattern as IEP above.
     • only a MANAGER may write them (teachers stay IEP_KEYS-only)
     • all changed keys must be within DROP_KEYS (no mixing)
     • status, if present, must be 'active' | 'dropped_out'
   School domain (own school, fail-closed) is enforced separately by
   inScope (#4) — unchanged. */
/* Only the dropout-specific fields gate the whitelist: existing
   status flows (promotion/graduation/transfer) keep the manager's
   general `users` permission, still scoped by inScope. */
const DROP_FIELD_KEYS = ['dropped_out_at','dropped_out_by','dropped_out_reason','dropped_out_note','returned_at','returned_by'];
const DROP_KEYS = ['status','active'].concat(DROP_FIELD_KEYS);
function dropTouchesDropout(op){
  if(op.c !== 'users' || op.t !== 'upd') return false;
  const d = op.data || {};
  return Object.keys(d).some(k => DROP_FIELD_KEYS.indexOf(k) > -1);
}
function dropUsersUpdate(s, op){
  if(op.c !== 'users' || s.role !== 'manager') return false;
  if(op.t !== 'upd' || op.id == null) return false;
  const d = op.data || {};
  const keys = Object.keys(d).filter(k => k !== 'id');
  if(keys.length === 0) return false;
  if(keys.indexOf('status') > -1 && d.status !== 'active' && d.status !== 'dropped_out') return false;
  return keys.every(k => DROP_KEYS.indexOf(k) > -1);
}

/* #4 — is the target record inside this user's scope? Real records
   from the store; unknown ids fail closed. */
function inScope(session, coll, recId, data){
  const u = session;
  if(u.role === 'superadmin') return true;
  const rec = recId != null ? (store_get(coll).find(x => x.id === Number(recId))) : null;
  function store_get(c){ return (get_store() || {})[c] || []; }

  if(u.role === 'student'){
    if(coll === 'users' && rec && rec.id === u.id) return true;
    if(rec && rec.student_id != null) return rec.student_id === u.id;
    if(data && data.student_id != null) return Number(data.student_id) === u.id;
    return false;
  }
  if(u.role === 'parent'){
    const kids = (get_store().parent_links || []).filter(l => l.parent_id === u.id).map(l => l.student_id);
    const sid = rec ? rec.student_id : (data && data.student_id);
    if(sid == null) return !!(rec && rec.parent_id === u.id);
    return kids.indexOf(Number(sid)) > -1;
  }
  if(u.role === 'teacher'){
    const sid = rec ? rec.student_id : (data && data.student_id);
    if(sid != null){
      const enr = (get_store().enrollments || []).find(e => e.student_id === Number(sid));
      if(!enr) return false;
      const cls = (get_store().classes || []).find(c => c.id === enr.class_id);
      if(!cls) return false;
      if(cls.homeroom_teacher_id === u.id) return true;
      return (get_store().schedule || []).some(s => s.class_id === cls.id && s.teacher_id === u.id);
    }
    if(rec && rec.teacher_id != null) return rec.teacher_id === u.id;
    if(rec && rec.school_id != null) return rec.school_id === u.school_id;
    return false;
  }
  /* manager / edu_office: school-level */
  const s = rec ? rec.school_id : (data && data.school_id);
  if(s == null) return u.role === 'edu_office';
  return s === u.school_id;
}

/* get_store is injected so the module stays pure-ish and testable */
let store_ref = null;
function get_store(){ return store_ref; }
function attach(store){ store_ref = store; }

/* §13.1 — روزِ غیرحضوری (virtual): عملیاتِ فیزیکی مسدود است.
   آینهٔ سمتِ سرور از گاردِ کلاینت (schoolVirtual — 57-school-mode.js، بند ۱۶).
   عملیات‌های فیزیکی:
     - attendance: وضعیتِ present/late/absent/early_exit (excused = رکوردِ اداری، آزاد)
     - lib_loans:  امانتِ جدید (بازگشت = returned_at، آزاد)
     - visitors:   مهمانِ جدید (خروج = out_at، آزاد)
     - assets:     وضعیتِ in_use (تحویلِ فیزیکی)
   جریانِ کلاسِ مجازی (vclass_*) دست‌نخورده است — جدولِ جدا. */
function isoDay(v){ return String(v || '').slice(0, 10); }
function isVirtualDay(store, schoolId, dateISO){
  if(schoolId == null) return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ''))) return false;
  return (store.attendance_modes || []).some(
    m => m.school_id === Number(schoolId) && m.date === dateISO && m.mode === 'virtual');
}
function virtualDayViolation(op, store){
  const c = op.c;
  const d = op.data || {};
  const nowIso = new Date().toISOString();
  if(c === 'attendance'){
    const rec = op.id != null ? (store.attendance || []).find(x => x.id === Number(op.id)) : null;
    const eff = Object.assign({}, rec, d);
    if(['present','late','absent','early_exit'].indexOf(eff.status) === -1) return null;
    if(isVirtualDay(store, eff.school_id, eff.date)) return { schoolId: eff.school_id, date: eff.date };
    return null;
  }
  if(c === 'lib_loans' && op.t === 'ins'){
    const day = isoDay(d.loan_at || op.at || nowIso);
    if(isVirtualDay(store, d.school_id, day)) return { schoolId: d.school_id, date: day };
    return null;
  }
  if(c === 'visitors' && op.t === 'ins'){
    const day = isoDay(d.in_at || op.at || nowIso);
    if(isVirtualDay(store, d.school_id, day)) return { schoolId: d.school_id, date: day };
    return null;
  }
  if(c === 'assets' && op.t === 'upd'){
    if(d.status !== 'in_use') return null;
    const rec = (store.assets || []).find(x => x.id === Number(op.id != null ? op.id : d.id));
    if(!rec) return null; /* شناسهٔ ناشناس توسط بند #4 (fail-closed) سنجیده می‌شود */
    const day = isoDay(op.at || nowIso);
    if(isVirtualDay(store, rec.school_id, day)) return { schoolId: rec.school_id, date: day };
    return null;
  }
  return null;
}

function nextId(c){
  let m = 0;
  for(const x of store_ref[c]) if(x.id != null && x.id > m) m = x.id;
  return m + 1;
}

/* ctx: { store, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom, sendJson } */
function createSync(ctx){
  const store = ctx.store;
  const MAX_BATCH = ctx.MAX_BATCH;
  const AT_DRIFT_MS = ctx.AT_DRIFT_MS;
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;

  async function apiSync(req, res, body){
    const s = sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });

    const ops = (body && body.ops);
    if(!Array.isArray(ops)) return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    if(ops.length > MAX_BATCH) return sendJson(res, 413, { ok: false, code: 'batch_too_large' });
    if(ops.length === 0) return sendJson(res, 200, { ok: true, results: [] });

    const all = (code) => sendJson(res, 403, { ok: false, code, results: ops.map(o => ({ uid: o && o.uid, ok: false, code })) });

    const results = [];
    const apply = [];
    for(const op of ops){
      if(!op || !op.uid || op.t === undefined || !op.c) return all('malformed_op');
      /* #1 — `by` is an assertion from the browser; verify or poison batch */
      if(Number(op.by) !== s.id){
        audit('sync_forge_by', { user_id: s.id, claimed_by: op.by, uid: op.uid });
        return all('forged_by');
      }
      /* #2 — stamps must match the token */
      if(op.user_id != null && Number(op.user_id) !== s.id) return all('user_mismatch');
      if(op.school_id != null && s.school_id != null && Number(op.school_id) !== s.school_id) return all('school_mismatch');
      /* #3 — role may write this collection (fail closed) */
      if(!canWrite(s.role, op.c) && !iepUsersUpdate(s, op)) return all('role_denied');
      /* Round 76 — dropout whitelist: any users update touching
         dropout/status fields must be a clean dropout op (manager,
         own keys only). Teacher → role_denied; other-school manager
         is caught by inScope (#4, fail closed). */
      if(dropTouchesDropout(op) && s.role !== 'superadmin' && !dropUsersUpdate(s, op)) return all('role_denied');
      /* #4 — target record inside scope */
      const recId = op.id != null ? op.id : (op.data && op.data.id);
      if(!inScope(s, op.c, recId, op.data)) return all('out_of_scope');
      /* §13.1 — non-in-person day: physical ops rejected per-op (rest continues) */
      const vd = virtualDayViolation(op, store);
      if(vd){
        audit('sync_virtual_day_blocked', { user_id: s.id, uid: op.uid, collection: op.c, school_id: vd.schoolId, date: vd.date });
        results.push({ uid: op.uid, ok: false, code: 'virtual_day', message: 'در روز غیرحضوری، این عملیاتِ فیزیکی مسدود است' });
        continue;
      }
      /* §3.3 — idempotency: a repeated uid is already applied */
      if(store.__processed_uids[op.uid]){
        results.push({ uid: op.uid, ok: true, code: 'duplicate_ignored', serverTime: new Date().toISOString() });
        continue;
      }
      /* §3.3 — clock skew: suspicious but not fatal — log, keep going */
      if(op.at){
        const drift = Math.abs(Date.now() - Date.parse(op.at));
        if(drift > AT_DRIFT_MS) audit('sync_clock_skew', { user_id: s.id, uid: op.uid, drift_ms: drift });
      }
      results.push({ uid: op.uid, ok: true, serverTime: new Date().toISOString() });
      apply.push(op);
    }

    for(const op of apply){
      if(!Array.isArray(store[op.c])) store[op.c] = [];
      if(op.t === 'ins'){
        const data = Object.assign({}, op.data);
        if(data.id == null) data.id = nextId(op.c);
        const ex = store[op.c].find(x => x.id === data.id);
        if(ex) Object.assign(ex, data); else store[op.c].push(data);
        data.updated_at = new Date().toISOString();
      }else if(op.t === 'upd'){
        const rec = store[op.c].find(x => x.id === Number(op.id != null ? op.id : (op.data && op.data.id)));
        if(rec) Object.assign(rec, op.data, { id: rec.id, updated_at: new Date().toISOString() });
      }else if(op.t === 'del'){
        store[op.c] = store[op.c].filter(x => x.id !== Number(op.id != null ? op.id : (op.data && op.data.id)));
      }
      store.__processed_uids[op.uid] = Date.now();
    }
    if(apply.length) ctx.markDirty();
    audit('sync_ok', { user_id: s.id, ops: apply.length });
    sendJson(res, 200, { ok: true, results });
  }

  return { apiSync, canWrite, inScope };
}
module.exports = { createSync, attach, canWrite, inScope, isVirtualDay, virtualDayViolation, WRITE_PERMS, iepUsersUpdate, IEP_KEYS, dropUsersUpdate, DROP_KEYS, dropTouchesDropout };
