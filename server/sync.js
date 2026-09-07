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
/* تک‌منبعِ حقیقتِ مجوزها (فاز ۲ بند ۳ + W4): این جدول از واقعیتِ
   اکشن‌هایِ کلاینت همگام است و tools/check-authz.js (سیم‌شده به
   node build.js --check + tests/check-authz.js) در هر دور نگهبانی
   می‌دهد: هر اکشنی که روی مجموعه‌ای می‌نویسد، نقش‌های مجازش باید
   این‌جا حقِ نوشتن داشته باشند.
   استثنایِ users روی teacher محدودیتِ فیلدیِ سمتِ سرور است
   (IEP_KEYS/DROP_KEYS — بند ۲.۲). */
const WRITE_PERMS = {
  superadmin : ['*'],
  edu_office : ['announcements','notifications','attendance_modes','notify_queue'],
  manager    : ['attendance','attendance_modes','notify_queue','grades','discipline','leaves','announcements','notifications','messages','installments','transactions','tuitions','tuition_plans','schedule','classes','subjects','users','corrections','assets','visitors','lib_books','lib_loans','certificates','meeting_slots','bus_routes','bus_students','bus_events','bus_needs','bus_followups','counselor_refs','pre_enrollments','enrollments','student_transfers','transfer_requests','vclass_sessions','vclass_attendance','internships','preapps','scholarships','reexams','assoc_minutes','summer_classes','dorm_rooms','dorm_assignments','dorm_meals','class_subject_members','schools','sedascores','nid_conflicts','parent_links','sms_log','sms_wallet','school_years','student_archive','dojo_types','substitutions','vclass_links','vclass_questions','hw_assignments','hw_submissions','parent_subscriptions'],
  teacher    : ['attendance','notify_queue','grades','discipline','messages','corrections','hw_assignments','hw_submissions','vclass_sessions','vclass_attendance','vclass_questions','vclass_links','substitutions','teacher_notes','nudges','teacher_sms','internships','notifications','meeting_slots'],
  counselor  : ['counselor_refs','messages','counselor_msgs'],
  student    : ['messages','hw_submissions','vclass_questions','counselor_msgs','bus_events','notify_queue','bus_locations','vclass_attendance','notifications'],
  parent     : ['leaves','messages','parent_verifications','counselor_msgs','meeting_slots','notifications','bus_needs','corrections','parent_links'],
  driver     : ['bus_events','notify_queue','bus_locations'],
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

/* ── FIELD_ALLOWLISTS — field-level rules per collection (arch review P0-1) ──
   The role/scope gates above answer "may this role write this collection,
   to this record?". FIELD_ALLOWLISTS answers the finer question:
   "may this role write THIS FIELD?".
   Today: `leaves`.
     • ins — the requester creates a REQUEST: initial status is 'pending'
       only. Exception: manager/superadmin may create directly with a
       decision status — locked flow AD 78.3 (dorm manager creates the
       weekend leave already approved).
     • upd — only manager/superadmin may touch `status`, and only to a
       decision ('approved' | 'rejected'). Other fields (reason, dates…)
       stay writable for any role holding the collection permission.
   Without this, a parent could forge an approved leave for their child
   (ins/upd with status:'approved') — see docs/ARCHITECTURE_REVIEW.md §2.2. */
const FIELD_ALLOWLISTS = {
  leaves: {
    ins: {
      defaultRoles : ['pending'],
      managerRoles : ['pending', 'approved', 'rejected']
    },
    upd: {
      statusRoles  : ['manager', 'superadmin'],
      statusValues : ['approved', 'rejected']
    }
  }
};

/**
 * Shared field-level exception gate (arch review P0-1). Passes all three
 * field exceptions through ONE helper:
 *   1) users + IEP keys   (teacher)  — the existing IEP exception
 *   2) users + dropout    (manager)  — the existing dropout whitelist
 *   3) leaves status      (P0-1)     — the new field allowlist
 * Returns:
 *   null                       — no field rule applies (normal path)
 *   { kind:'allow' }           — exception grants the write (IEP/DROP)
 *   { kind:'reject', code }    — reject the WHOLE batch, as before
 *                                (403; keeps IEP/DROP semantics byte-identical)
 *   { kind:'reject_op', code } — reject THIS op only (200 + ok:false),
 *                                like virtual_day; the rest of the batch
 *                                continues. Used by the leaves rule.
 */
function filterFields(op, collection, role){
  const fa = FIELD_ALLOWLISTS[collection];
  if(fa){
    const d = (op && op.data) || {};
    const isMgr = role === 'manager' || role === 'superadmin';
    if(op.t === 'ins'){
      const allowed = isMgr ? fa.ins.managerRoles : fa.ins.defaultRoles;
      if(d.status != null && allowed.indexOf(d.status) === -1)
        return { kind: 'reject_op', code: 'field_denied' };
      if(d.status == null) d.status = fa.ins.defaultRoles[0]; /* normalize */
      return null;
    }
    if(op.t === 'upd' && d.status != null){
      if(!isMgr || fa.upd.statusValues.indexOf(d.status) === -1)
        return { kind: 'reject_op', code: 'field_denied' };
      return null;
    }
    return null;
  }
  if(collection === 'users' && op && op.t === 'upd'){
    if(role === 'teacher' && iepUsersUpdate({ role }, op)) return { kind: 'allow' };
    if(dropTouchesDropout(op)){
      if(role === 'superadmin') return null;
      if(role === 'manager' && dropUsersUpdate({ role }, op)) return { kind: 'allow' };
      return { kind: 'reject', code: 'role_denied' };
    }
  }
  return null;
}

/* #4 — is the target record inside this user's scope? Real records
   from the store; unknown ids fail closed. */
function inScope(session, coll, recId, data){
  const u = session;
  if(u.role === 'superadmin') return true;
  const rec = recId != null ? (store_get(coll).find(x => x.id === Number(recId))) : null;
  function store_get(c){ return (get_store() || {})[c] || []; }

  /* Round 89 — ownership that does not ride on student_id:
     messages  : for record-scoped roles (student/parent/teacher) the sender (from_id)
                 owns the record — chat (fail-closed without from_id).
                 manager/edu_office keep the pre-existing school-level path (S20).
     notifications: the recipient (user_id) may update their own record (read badge) */
  function msgOwnerOk(){
    const f = (data && data.from_id != null) ? Number(data.from_id)
             : (rec && rec.from_id != null) ? Number(rec.from_id) : null;
    return f != null && f === u.id;
  }
  if(coll === 'notifications' && rec && Number(rec.user_id) === u.id) return true;

  if(u.role === 'student'){
    if(coll === 'messages') return msgOwnerOk();
    if(coll === 'users' && rec && rec.id === u.id) return true;
    if(rec && rec.student_id != null) return rec.student_id === u.id;
    if(data && data.student_id != null) return Number(data.student_id) === u.id;
    return false;
  }
  if(u.role === 'parent'){
    if(coll === 'messages') return msgOwnerOk();
    const kids = (get_store().parent_links || []).filter(l => l.parent_id === u.id).map(l => l.student_id);
    const sid = rec ? rec.student_id : (data && data.student_id);
    /* Round 89 — parent_links (kid-reject flow removes their own link):
       a NEW link must belong to the parent themselves (no forging links for others) */
    if(coll === 'parent_links' && !rec && data && Number(data.parent_id) !== u.id) return false;
    if(sid == null) return !!(rec && rec.parent_id === u.id);
    return kids.indexOf(Number(sid)) > -1;
  }
  if(u.role === 'teacher'){
    if(coll === 'messages') return msgOwnerOk();
    /* Round 89 — class-level collections: a teacher is bound to classes they actually
       teach (homeroom or schedule) — fail-closed for any other class.
       meeting_slots: their own slots (created with parent_id/student_id null). */
    const t2 = rec || data || {};
    if(coll === 'meeting_slots' && t2.teacher_id != null){
      return Number(t2.teacher_id) === u.id;
    }
    if((coll === 'hw_assignments' || coll === 'vclass_sessions') && t2.class_id != null){
      const cls2 = (get_store().classes || []).find(c => c.id === Number(t2.class_id));
      if(!cls2) return false;
      if(cls2.homeroom_teacher_id === u.id) return true;
      return (get_store().schedule || []).some(x => x.class_id === cls2.id && x.teacher_id === u.id);
    }
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
      /* #3 — field-level exceptions first: ONE gate for all three
         (IEP / dropout / leaves — see filterFields).
           reject    → whole batch, 403 (IEP/DROP semantics unchanged)
           reject_op → this op only, 200 + ok:false (batch continues) */
      const ff = filterFields(op, op.c, s.role);
      if(ff && ff.kind === 'reject') return all(ff.code);
      if(ff && ff.kind === 'reject_op'){
        audit('sync_field_denied', { user_id: s.id, uid: op.uid, collection: op.c });
        results.push({ uid: op.uid, ok: false, code: ff.code, message: 'تغییر این فیلد برای نقش شما مجاز نیست' });
        continue;
      }
      if(!canWrite(s.role, op.c) && !(ff && ff.kind === 'allow') && !iepUsersUpdate(s, op)) return all('role_denied');
      /* Round 76 — dropout whitelist double guard (semantics unchanged) */
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
    /* Round 88 + Round 89 — server side: the client cannot create notifications
       (inScope structurally rejects ins notifications for every non-manager role);
       the server therefore creates the needed one for the ACTION itself:
       1) leaves pending (non-manager)  -> school manager   (R88; R89 generalized wording)
       2) messages / chat (non-manager) -> the recipient    (R89)
       3) corrections open (non-manager)-> school manager   (R89)
       Manager/superadmin actions keep the client-created notification (applied),
       so the hook skips them — no duplicates. */
    for(const op of apply){
      if(!Array.isArray(store.notifications)) store.notifications = [];
      const todayD = new Date().toISOString().slice(0, 10);
      if(op.c === 'leaves' && op.t === 'ins' && op.data && op.data.status === 'pending'
         && s.role !== 'manager' && s.role !== 'superadmin'){
        const d = op.data;
        const mgr = (store.users || []).find(x => x.school_id === d.school_id && x.role === 'manager');
        if(mgr){
          const st = (store.users || []).find(x => x.id === d.student_id);
          store.notifications.push({
            id: nextId('notifications'), user_id: mgr.id, school_id: d.school_id, type: 'leave',
            title: '📨 درخواست مرخصی جدید',
            body: 'برای ' + ((st && st.full_name) || '') + ' از ' + d.from_date + ' تا ' + d.to_date + ' — در انتظارِ بررسی.',
            link: 'leaves', read: 0, created_at: todayD
          });
          audit('leave_request_notified', { user_id: s.id, leave_id: d.id, school_id: d.school_id });
        }
      }
      if(op.c === 'messages' && op.t === 'ins' && op.data && op.data.to_id != null
         && s.role !== 'manager' && s.role !== 'superadmin'
         && Number(op.data.to_id) !== s.id){
        const to = (store.users || []).find(x => x.id === Number(op.data.to_id));
        if(to){
          const from = (store.users || []).find(x => x.id === Number(op.data.from_id != null ? op.data.from_id : s.id));
          store.notifications.push({
            id: nextId('notifications'), user_id: to.id,
            school_id: op.data.school_id != null ? op.data.school_id : to.school_id,
            type: 'chat', title: '💬 پیام جدید',
            body: ((from && from.full_name) || '') + ': ' + String(op.data.body || '').slice(0, 60),
            link: 'chat', read: 0, created_at: todayD
          });
          audit('chat_notified', { user_id: s.id, to_user_id: to.id });
        }
      }
      if(op.c === 'corrections' && op.t === 'ins' && op.data && op.data.status === 'open'
         && s.role !== 'manager' && s.role !== 'superadmin'){
        const d = op.data;
        const mgr = (store.users || []).find(x => x.school_id === d.school_id && x.role === 'manager');
        if(mgr){
          const st = (store.users || []).find(x => x.id === d.student_id);
          const par = (store.users || []).find(x => x.id === d.parent_id);
          store.notifications.push({
            id: nextId('notifications'), user_id: mgr.id, school_id: d.school_id, type: 'announcement',
            title: '⚠️ درخواست اصلاح اطلاعات ولی',
            body: ((par && par.full_name) || '') + ' اعلام کرد ' + ((st && st.full_name) || '') + ' فرزند او نیست.',
            link: 'corrections', read: 0, created_at: todayD
          });
          audit('correction_notified', { user_id: s.id, correction_id: d.id, school_id: d.school_id });
        }
      }
    }
    if(apply.length) ctx.markDirty();
    audit('sync_ok', { user_id: s.id, ops: apply.length });
    sendJson(res, 200, { ok: true, results });
  }

  return { apiSync, canWrite, inScope };
}
module.exports = { createSync, attach, canWrite, inScope, isVirtualDay, virtualDayViolation, WRITE_PERMS, iepUsersUpdate, IEP_KEYS, dropUsersUpdate, DROP_KEYS, dropTouchesDropout, filterFields, FIELD_ALLOWLISTS };
