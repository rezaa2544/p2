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

const { validate, validateSyncEnvelope, validateSyncData } = require('./validate');
const cache = require('./cache');
/* ویو ۱۴ (Observability) — شمارِ تعارض‌هایِ همگام‌سازی (سیگنالِ OCC). */
const metrics = require('./metrics');

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
/* R96 P0-1 — مدلِ مرکزیِ مجوز (single source of truth):
   authz/model.json — tests/authz-model.js آن را بازتولید و با seed + کلاینت
   diff می‌کند (گیتِ build)؛ tests/server16.js ماتریسِ منفیِ
   role×collection×op را اجرا می‌کند. ناآگاه بودن از یک collection =
   fail-closed (رد).
   R99 — تک‌منبعِ مجوزها (دستورِ «centralized authorization source»):
   سرور حالا جدولِ **تولیدشده** را می‌خواند، نه جدولِ دستی:
   authz/write-perms.json — خروجیِ tools/generate-write-perms.js که از
   (۱) ACTION_ROLES در src/js/30-authz.js، (۲) تحلیلِ استاتیکِ اکشن‌ها
   (مجموعه‌هایِ نوشتاریِ هر اکشن) و (۳) authz/model.json (fields + نقش‌های
   هر عمل) ساخته می‌شود. `node build.js --check` مولد را با --check اجرا
   و diff می‌کند — جدولِ کهنه = build قرمز. بخشِ `actions` همان نقشهٔ
   صریحِ «اکشن ← نقش‌ها + مجموعه‌هایِ قابلِ نوشتن» است. */
const WR = require('../authz/write-perms.json');
const policy = require('./policy'); /* ویو ۵ — مدل یکتای محدوده/مالکیت */
const AUTHZ = (function(){
  const out = {};
  for (const c of Object.keys(WR.ops)){
    out[c] = { fields: WR.fields[c] || [], ins: WR.ops[c].ins, upd: WR.ops[c].upd, del: WR.ops[c].del };
  }
  return out;
})();

/* WRITE_PERMS — از فایلِ تولیدشده (R99). superadmin = '*' (همان معنایِ
   پیشین). مشتقِ دستیِ قدیمی حذف شد — یک منبع: مولد. */
const WRITE_PERMS = WR.perms;
function canWrite(role, coll){
  const list = WRITE_PERMS[role];
  if(!list) return false;
  return list.indexOf('*') > -1 || list.indexOf(coll) > -1;
}


/* R96 P0-2 — مجوزِ عملیاتی از مدل (per-op) + دروازهٔ فیلد */
function canOp(role, coll, t){
  const def = AUTHZ[coll];
  if(!def) return false;               /* مجموعهٔ ناشناخته = رد (fail-closed) — حتی superadmin */
  if(role === 'superadmin') return t === 'ins' || t === 'upd' || t === 'del';
  return (def[t] || []).indexOf(role) > -1;
}

/* P0-2: سطحِ نقش‌ها — قاعدهٔ «بدونِ ارتقاء»: نویسنده نمی‌تواند رکوردی
   با نقشِ بالاترِ خود بسازد (superadmin آزاد است). */
const ROLE_LEVEL = { student: 0, parent: 1, driver: 1, counselor: 3, teacher: 3, edu_office: 3, manager: 4, superadmin: 5 };
/* کلیدهایِ مالکیت: مقدرشان همیشه خودِ نشست است (inject نمی‌شوند) */
const OWNERSHIP_KEYS = { messages: 'from_id', counselor_msgs: 'author_id', hw_submissions: 'graded_by' };
/* مجموعه‌هایی که نویسندهٔ اصلی (نه فقط مدیر) می‌تواند status را عوض کند */
const STATUS_WRITER_COLL = { attendance: 1 };
/* مقادیرِ اولیهِٔ مجاز در ins (نقش‌هایِ غیر-مدیر) */
const STATUS_INITIAL_MAP = {
  meeting_slots: ['open'],
  counselor_msgs: ['open'],
  counselor_refs: ['open'],
  parent_verifications: ['pending'],
  corrections: ['open', 'pending'],
  parent_subscriptions: ['trial', 'none', 'active', 'expired', 'pending'],
  internships: ['pending'],
  nudges: ['pending'],
  teacher_sms: ['queued'],
  notify_queue: ['pending'],
  reexams: ['scheduled'],
  pre_enrollments: ['registered'],
  exam_terms: ['draft', 'published'],
  bus_followups: ['open'],
  assets: ['available', 'in_use', 'repair'],
  leaves: ['pending'],
};
/* نقش‌هایی که در کارکردِ کلاینت انتقالِ status را انجام می‌دهند (upd) */
const STATUS_UPD_ROLE = {
  meeting_slots: ['teacher', 'parent'],      /* رزرو/لغو نوبت */
  notify_queue: ['teacher', 'edu_office', 'counselor'], /* ارسال/لغو از صف */
  corrections: ['edu_office'],               /* بررسیِ درخواستِ اصلاح */
  parent_verifications: ['edu_office'],      /* تأیید/ردِ اعتبارسنجی */
  counselor_refs: ['counselor'],             /* handling */
  internships: ['teacher'],                  /* تأییدِ ساعتِ کارآموزی */
  nudges: ['teacher'],                       /* پاسخِ دبیر */
  parent_subscriptions: ['parent'],          /* وضعیتِ اشتراکِ خود */
  assets: ['teacher'],                       /* E.5 — تحویلدار (پرچم+مدرسه در inScope) */
};

/**
 * R96 P0-2 — دروازهٔ فیلدِ عمومی (عمومی‌سازیِ الگوی IEP/DROP):
 *   ۱. فیلدِ ناشناخته → رد (fail-closed؛ fields = seed ∪ کلاینت ∪ managed)
 *   ۲. users.role → بدونِ ارتقاء (سقف = سطحِ نویسنده)
 *   ۳. users.phone/national_id → فقط manager/edu_office/superadmin
 *   ۴. school_id → مشتق از نشست (نقش‌هایِ scoped)
 *   ۵. کلیدهایِ مالکیت (from_id/author_id/graded_by) → خودِ نشست
 *   ۶. status → ins فقط مقدارِ اولیه (pending) برایِ غیرمدیر؛
 *      upd فقط manager+ (استثنا: attendance — نویسندهٔ حضور؛
 *      leaves — FIELD_ALLOWLISTSِ موجود)
 * خروجی: null = عبور (و مشتق‌ها روی op.data اعمال شده) یا {code,msg}.
 * `exc` = استثنایِ IEP/DROP (users) که پیش‌تر اعطا شده است.
 */
function fieldGate(op, s, exc){
  const def = AUTHZ[op.c];
  if(!def) return { code: 'unknown_collection', msg: 'این مجموعه در مدلِ مجوز نیست' };
  if(op.t === 'del'){
    /* del هم تحتِ مجوزِ مدل است (مثلِ legacy) — نه صرفاً scope */
    if(!canOp(s.role, op.c, 'del')) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };
    return null;
  }
  const d = op.data;
  if(!d || typeof d !== 'object' || Array.isArray(d)) return { code: 'malformed_op', msg: 'data باید یک شیء باشد' };
  if(!exc && !canOp(s.role, op.c, op.t)) return { code: 'role_denied', msg: 'این عملیات برای نقش شما مجاز نیست' };
  for(const k of Object.keys(d)){
    /* R96: رمز اولیه فقط هنگامِ ساختِ کاربر، توسطِ مدیر */
    if(k === 'password' && op.c === 'users' && op.t === 'ins' && (s.role === 'manager' || s.role === 'superadmin')) continue;
    if(!def.fields || def.fields.indexOf(k) === -1) return { code: 'unknown_field', msg: 'فیلدِ «' + k + '» در این مجموعه تعریف نشده است' };
    if(PROTECTED_FIELDS.indexOf(k) > -1){
      /* R98 — فیلدِ ممنوع: هرگز از allowlistِ عمومی عبور نمی‌کند؛
         فقط سیاستِ صریح (protPolicy) + بلوک‌هایِ اختصاصیِ پایین
         (مشتق‌سازیِ school_id / سیاستِ status / بدونِ ارتقاء / PII مدیری). */
      const pv = protPolicy(op, s, k);
      if(pv) return pv;
      continue;
    }
    /* R98 — allowlistِ عمومیِ collection×op (فیلدهایِ غیرممنوعِ شناخته‌شده) */
    const fa = FIELD_ALLOWLISTS[op.c];
    const allow = fa && fa[op.t] ? fa[op.t].fields : null;
    if(allow && allow.indexOf(k) === -1) return { code: 'field_denied', msg: 'فیلدِ «' + k + '» در ' + op.t + ' مجموعهٔ ' + op.c + ' قابلِ تغییر نیست' };
  }
  if(op.c === 'users'){
    if(d.role != null){
      const lvl = ROLE_LEVEL[d.role];
      if(lvl == null) return { code: 'unknown_field', msg: 'نقشِ ناشناخته' };
      if(s.role !== 'superadmin' && lvl > ROLE_LEVEL[s.role]) return { code: 'role_escalation', msg: 'نقشِ بالاتر از سطحِ خود مجاز نیست' };
    }
    if(!exc && (d.phone != null || d.national_id != null) && s.role !== 'manager' && s.role !== 'superadmin' && s.role !== 'edu_office'){
      return { code: 'field_denied', msg: 'تلفن/کد ملی فقط توسطِ مدیریتِ کاربران قابلِ ثبت است' };
    }
  }
  if(s.school_id != null && (d.school_id != null || (def.fields || []).indexOf('school_id') > -1)){
    if(d.school_id != null && Number(d.school_id) !== Number(s.school_id))
      return { code: 'school_mismatch', msg: 'school_id باید همان مدرسهٔ شما باشد' };
    d.school_id = s.school_id;
  }
  const ok = OWNERSHIP_KEYS[op.c];
  if(ok){
    if(d[ok] != null && Number(d[ok]) !== s.id) return { code: 'ownership_forge', msg: 'شناسهٔ مالکیت قابلِ تغییر نیست' };
    d[ok] = s.id;
  }
  if(op.c === 'counselor_msgs' && d.author_role != null && d.author_role !== s.role)
    return { code: 'ownership_forge', msg: 'author_role قابلِ تغییر نیست' };
  if(d.status != null){
    /* R96 P0-2 — سیاستِ status (مشتق از اسکِنِ کلاینت + تحلیلِ کارکرد):
       • ins: مقدارِ اولیهٔ workflow (به‌ازایِ هر مجموعه) — مدیر/superadmin/
         edu_office (کارتِ اعتبارسنجی) و نویسندهٔ اصلی (attendance) آزادند.
       • upd: انتقالِ workflow فقط برایِ نقش‌هایی که در کارکردِ کلاینت
         آن انتقال را انجام می‌دهند (لیستِ صریح) — بقیه فقط مدیر. */
    const freeIns = s.role === 'manager' || s.role === 'superadmin' || s.role === 'edu_office';
    if(op.t === 'ins'){
      if(STATUS_WRITER_COLL[op.c]){/* نویسندهٔ اصلی — status خودِ داده است */}
      else if(!freeIns){
        const init = STATUS_INITIAL_MAP[op.c] || ['pending'];
        if(init.indexOf('*') < 0 && init.indexOf(d.status) < 0)
          return { code: 'field_denied', msg: 'مقدارِ اولیهٔ status در این مجموعه فقط ' + init.join('/') + ' است' };
      }
    }else{
      if(STATUS_WRITER_COLL[op.c] || s.role === 'manager' || s.role === 'superadmin'){/* آزاد */}
      else{
        const roles = STATUS_UPD_ROLE[op.c];
        if(!roles || roles.indexOf(s.role) < 0)
          return { code: 'field_denied', msg: 'تغییرِ status برای نقش شما مجاز نیست' };
      }
    }
  }
  return null;
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

/* ── R95 (بند ۲.۵) — base_version + سیاستِ ترکیبیِ تعارض ──
   VERSIONED  (حفظِ تعارض): حضور/نمره/انضباطی — عملیاتِ کهنه (base_version
     نادرست) اعمال نمی‌شود؛ تعارض در sync_conflicts حفظ می‌شود تا داوریِ انسانی.
   STRUCTURAL (سرور مرجع): کلاس/درس/کاربر/... — عملیاتِ کهنه با stale_base رد
     می‌شود (وضعیتِ سرور برنده است؛ کلاینت تازه‌سازی می‌کند).
   بقیهٔ مجموعه‌ها LWW‌اند: base_version بی‌اثر (آخرین نوشتن بر پایهٔ زمانِ
     دریافتِ سرور). عملیاتِ بی‌base_version (کلاینتِ کهنه) عینِ قبل اعمال می‌شود. */
const VERSIONED = { grades: 1, attendance: 1, discipline: 1 };
const STRUCTURAL = { schools: 1, classes: 1, subjects: 1, users: 1, enrollments: 1, schedule: 1 };
const VERSION_TRACKED = Object.assign({}, VERSIONED, STRUCTURAL);

/* ── R98 — field-level authorization: generic FIELD_ALLOWLISTS for all
   collections + explicit policy for the forbidden set.
   The role/scope gates above answer "may this role write this collection,
   to this record?". FIELD_ALLOWLISTS answers the finer question:
   "may this role write THIS FIELD, on THIS op (ins/upd)?"
   PROTECTED_FIELDS are NEVER part of the generic allowlist — they can only
   reach the store through the explicit policy below (or session derivation),
   never through a raw Object.assign of the body payload:
     • status        — workflow: ins = initial value (per collection),
                       upd = manager or the explicit workflow roles (fieldGate)
     • school_id     — derived from the session for scoped roles (fieldGate);
                       superadmin has no school in its session, so the target
                       school rides on the op (cross-school authority)
     • user_id       — owner/recipient identity: management only (protPolicy)
     • role          — users: no-escalation (fieldGate); domain 'role'
                       (exam_duties/notifications): management only
     • national_id   — users: management (fieldGate); elsewhere: management
     • phone         — users: management (fieldGate); elsewhere: management,
                       except teacher_sms.phone (recipient phone = the teacher's
                       own SMS data)
   Without this, a low-privilege writer could reassign a record's
   user_id/role or inject PII — see docs/ARCHITECTURE_REVIEW.md §2.2.
   The leaves status policy (arch review P0-1) is preserved below, unchanged. */
const PROTECTED_FIELDS = ['status', 'school_id', 'user_id', 'role', 'national_id', 'phone'];

/* R98 — explicit policy for the protected set (the ONLY door into these
   fields). Returns null = defer to the dedicated value block in fieldGate
   (school_id derivation / status workflow) or grant; {code,msg} = reject. */
function protPolicy(op, s, k){
  const admin = s.role === 'manager' || s.role === 'superadmin' || s.role === 'edu_office';
  if(k === 'user_id'){
    if(admin) return null;
    return { code: 'field_denied', msg: 'user_id فیلدِ هویتی است و برای نقش شما قابلِ نوشتن نیست' };
  }
  if(k === 'role'){
    if(op.c === 'users') return null;      /* no-escalation block in fieldGate */
    if(admin) return null;                 /* domain role (exam_duties/notifications) */
    return { code: 'field_denied', msg: 'role در این مجموعه فقط برای مدیریت قابلِ نوشتن است' };
  }
  if(k === 'national_id' || k === 'phone'){
    if(op.c === 'users') return null;      /* admin block in fieldGate */
    if(admin) return null;
    if(op.c === 'teacher_sms' && s.role === 'teacher') return null;
    return { code: 'field_denied', msg: 'فیلدِ «' + k + '» فقط توسطِ مدیریت قابلِ ثبت است' };
  }
  return null; /* school_id, status */
}

const FIELD_ALLOWLISTS = (function(){
  /* R98 — generated for EVERY collection: the generic writable set per op =
     the model's known fields MINUS the protected set (those ride on explicit
     policy only). Unknown field = reject stays fail-closed as before. */
  const out = {};
  for(const c of Object.keys(AUTHZ)){
    const f = AUTHZ[c].fields || [];
    const allow = f.filter(x => PROTECTED_FIELDS.indexOf(x) === -1);
    out[c] = { ins: { fields: allow.slice() }, upd: { fields: allow.slice() } };
  }
  /* leaves — the pre-existing status policy (arch review P0-1) is preserved
     on top of the generated allowlist: ins normalizes status to 'pending'
     (manager may create with a decision status); upd status = decision,
     manager/superadmin only. */
  out.leaves = {
    ins: {
      fields     : out.leaves.ins.fields,
      defaultRoles : ['pending'],
      managerRoles : ['pending', 'approved', 'rejected']
    },
    upd: {
      fields     : out.leaves.upd.fields,
      statusRoles  : ['manager', 'superadmin'],
      statusValues : ['approved', 'rejected']
    }
  };
  return out;
})();

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
    /* R96 P0-1: دروازهٔ status (insِ مقدارِ اولیه + updِ نقش) تک‌منبع —
       fieldGate. اینجا فقط نرمال‌سازیِ نبودِ status می‌ماند.
       R98: defaultRoles/statusValues فقط برایِ leaves تعریف‌اند (entryهایِ
       تولیدشدهٔ بقیهٔ مجموعه‌ها فقط fields دارند). */
    if(op.t === 'ins'){
      if(fa.ins.defaultRoles && d.status == null) d.status = fa.ins.defaultRoles[0]; /* normalize (leaves) */
      return null;
    }
    if(op.t === 'upd' && d.status != null){
      /* چکِ ارزش برایِ مدیر (R96ِ fieldGate نقش را می‌سنجد، ارزشِ مدیر را نه) */
      if(fa.upd.statusValues && isMgr && fa.upd.statusValues.indexOf(d.status) === -1)
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

/* #4 — محدوده/مالکیت: ویو ۵ بخش دوم — مدلِ یکتا در `server/policy.js`.
   sync دیگر سیاستِ موازی ندارد؛ این‌جا فقط «درِ» دسترسی با همان امضا و
   همان store تزریق‌شده است. رفتار بیت‌به‌بیت حفظ شده (آزمون برابریِ
   ۳۸٬۳۳۶ ترکیبی روی فروشگاه واقعی + سوئیت‌های T5b/server16).
   EO_SCOPE_GATED: نشانهٔ سازگاری — منبع حقیقت در policy است؛ این نام
   فقط re-export است تا مصرف‌کنندگانِ داخلیِ همین فایل یکسان بخوانند. */
const EO_SCOPE_GATED = policy.EO_SCOPE_GATED;

function inScope(session, coll, recId, data){
  return policy.inScope(session, get_store(), coll, recId, data);
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
/* S2-2 (موج ۴): مبنایِ «آفلاینِ» تصمیمِ روزِ مجازی. برمی‌گرداند {schoolId,
   date} فقط وقتی (۱) شکلِ عملیات از آنِ گیتِ فیزیکی است و روزِ مؤثر از
   op.atِ ادعایی آمده (نه از دادهٔ رکورد)، (۲) آن روز با امروزِ سرور فرق
   دارد، و (۳) امروزِ سرور برایِ همان مدرسه مجازی است — یعنی واگراییِ ساعتِ
   کلاینت در تصمیمِ «مجاز» مؤثر بوده و باید ردِّ پا داشته باشد. در غیرِ این
   صورت null (روزِ عادی، یا تاریخی که سرور هم قبول دارد → بی‌سر‌و‌صدا).
   خالص؛ در تست واحد صدا زده می‌شود. */
function virtualDayOfflineBasis(op, store){
  const c = op.c;
  const d = op.data || {};
  const todayIso = new Date().toISOString().slice(0, 10);
  const day = isoDay(op.at || '');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || day === todayIso) return null;
  let schoolId = null;
  if(c === 'assets' && op.t === 'upd' && d.status === 'in_use'){
    const rec = (store.assets || []).find(x => x.id === Number(op.id != null ? op.id : d.id));
    if(!rec) return null;
    schoolId = rec.school_id;
  }else if(c === 'lib_loans' && op.t === 'ins' && d.loan_at == null){
    schoolId = d.school_id;
  }else if(c === 'visitors' && op.t === 'ins' && d.in_at == null){
    schoolId = d.school_id;
  }else{
    return null;
  }
  if(schoolId == null) return null;
  if(!isVirtualDay(store, schoolId, todayIso)) return null;
  return { schoolId: schoolId, date: day };
}

function nextId(c){
  let m = 0;
  for(const x of store_ref[c]) if(x.id != null && x.id > m) m = x.id;
  return m + 1;
}

/* R98 — فیلدهایِ ممنوع هرگز از Object.assignِ عمومیِ payload عبور نمی‌کنند:
   از یک کپیِ جدا جدا می‌شوند و مقادیرِ اعتبارسنجی‌شده/مشتق‌شدهٔ سرور
   بعداً صریحاً نوشته می‌شوند. روی کپی کار می‌کند تا op.data برایِ
   hookهایِ بعد از apply (notifications) دست‌نخورده بماند. */
function stripProtected(d){
  const prot = {};
  if(d && typeof d === 'object'){
    for(const k of PROTECTED_FIELDS){
      if(d[k] !== undefined){ prot[k] = d[k]; delete d[k]; }
    }
  }
  return prot;
}

/* ctx: { store, db, MAX_BATCH, AT_DRIFT_MS, audit, sessionFrom, sendJson } */
function createSync(ctx){
  const store = ctx.store;
  if (store) attach(store);
  const db = ctx.db;
  const MAX_BATCH = ctx.MAX_BATCH;
  const AT_DRIFT_MS = ctx.AT_DRIFT_MS;
  const audit = ctx.audit;
  const sessionFrom = ctx.sessionFrom;
  const sendJson = ctx.sendJson;
  const ids = ctx.ids || null; /* Wave 1: ids service for server-assigned ids (PG sequences when live) */

  /* ── Backpressure (Delta Phase 4, gap 1) ────────────────────────────
     دروازهٔ نرخ روی «تعداد op در پنجرهٔ ۶۰ثانیه‌ای به‌ازای نشست» با همان
     موتورِ توزیع‌شدهٔ rate-limit.js (Redis در تولید، fallback درون‌حافظه‌ای در
     dev/test). خطای موتور = fail-open (اجازه) — لبهٔ سختِ نرخ نزدِ
     nginx/Cloudflare می‌ماند؛ این دروازه برای «مهارِ مؤدبانهٔ کلاینتِ مشتاق»
     است، نه DDoS. ctx.rateLimit تزریق می‌شود (index.js)؛ نبودنش (تست‌های
     قدیمی) یعنی بدونِ سقف — رفتارِ پیشین. */
  const rateLimit = ctx.rateLimit || null;
  const syncOpsPerMinute = () => {
    const n = Number(ctx.syncOpsPerMin != null ? ctx.syncOpsPerMin : process.env.PAYESH_SYNC_OPS_PER_MIN);
    if (!Number.isFinite(n)) return 5000; /* پیش‌فرض: سخاوتمندانه — فقط مشتاق‌های واقعی مهار می‌شوند */
    return Math.min(1000000, Math.max(100, Math.trunc(n)));
  };

  /* Wave 1: server-assigned ids come from the ids service (PG sequences when live,
     local max+1 -- same values as nextId -- in memory mode) so two instances never
     collide. Legacy local max+1 stays as the fallback when no ids service was
     injected (older tests). */
  async function serverId(c){
    if(ids && typeof ids.nextId === 'function'){
      try{ return await ids.nextId(c, store[c] || []); }catch(e){ /* fall through */ }
    }
    return nextId(c);
  }

  /* ═══ P0-6 — مهارِ رشدِ آینهٔ درون‌حافظه‌ای در PG-live ═══════════════
     یافتهٔ کمّی Wave 18 §۵-۳: هر op پذیرفته‌شده (و هر missِ hydrate از PG)
     به آینهٔ store اضافه می‌شد بدون سقف — ۱۰,۴۸۸B به‌ازایِ هر نوشتن؛ در سوکِ
     زیرِ بار یعنی رشدِ خطیِ حافظه. مهار:
     • mirrorAppend: push + ثبت در growthLog؛ وقتی رشدِ بعد از بوت از سقف گذشت
       (PAYESH_PG_MIRROR_GROWTH_CAP؛ پیش‌فرض PG-live=50000، memory=0=بی‌سقف)
       قدیمی‌ترینِ رشد‌ها batch-wise حذف می‌شوند (تا سقف برگردند). رکوردهای
       هیدراته‌شده در بوت دست‌نخورده می‌مانند.
     • pruneProcessedUids: __processed_uids هم بی‌سقف رشد می‌کرد؛ سقف
       (PAYESH_UID_DEDUP_MAX؛ پیش‌فرض PG-live=20000، memory=0) با حذفِ
       قدیمی‌ترین‌ها (بر اساسِ timestamp ذخیره‌شده) نگه داشته می‌شود.
       dedup تازه پوشش کامل دارد (پنجرهٔ اخیر) و در استقرارِ چندنمونه‌ای،
       Redis (cache.markProcessedUid با TTL 24h) مرجعِ اشتراکی است.
     اعدادِ پیش‌فرض محافظه‌کارانه‌اند تا در دپلوی‌های کوچکِ موجود رفتار
     عملاً تغییر نکند (هرگز به سقف نمی‌رسند). */
  const growthLog = {};   /* [c] → idهایی که بعد از بوت به آینه افزودیم */
  function mirrorGrowthCap(){
    if(!(db && typeof db.isPostgres === 'function' && db.isPostgres())) return 0;
    const n = Number(process.env.PAYESH_PG_MIRROR_GROWTH_CAP);
    return Number.isFinite(n) && n >= 0 ? n : 50000;
  }
  /* بازخورد بازبین PR #103 (باگ ۱): هرسِ آینه، دسترسیِ معتبر را می‌شکند —
     دروازهٔ محدوده (policy.js:inScope) رکوردِ هدف و وابستگی‌های مجوز
     (users/parent_links/enrollments/classes/schedule/schools/offices) را
     فقط از آینه می‌خواند و خطای کش را با PG جبران نمی‌کند. پس هیچ
     مجموعه‌ای به‌طور پیش‌فرض هرس نمی‌شود؛ فقط مجموعه‌های صراحتاً لیست‌شده
     در PAYESH_PG_MIRROR_PRUNE_SAFE (جداشده با کاما) — انتخابِ اپراتورِ
     بار/استیجینگ که پذیرفته رکوردهای قدیمیِ درج‌شده از آینه محلی بیایند.
     لیستِ خالی (پیش‌فرض) = هرس هرگز — رفتارِ پیش از P0-6 برای مجوزها. */
  function mirrorPruneSafe(){
    if(!(db && typeof db.isPostgres === 'function' && db.isPostgres())) return [];
    /* P1-2: sync_conflicts = صفِ داوریِ انسانی — تنها read-pathی که زنده از
       آینه می‌خواند (conflicts.js؛ pull از db.readCollection یعنی PG می‌خواند)
       و بالذاتِ bounded است (resolve ⇒ del). همیشه در لیستِ سفید، فارغ از env. */
    const env = String(process.env.PAYESH_PG_MIRROR_PRUNE_SAFE || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    return env.indexOf('sync_conflicts') === -1 ? env.concat(['sync_conflicts']) : env;
  }
  function uidDedupMax(){
    if(!(db && typeof db.isPostgres === 'function' && db.isPostgres())) return 0;
    const n = Number(process.env.PAYESH_UID_DEDUP_MAX);
    return Number.isFinite(n) && n >= 0 ? n : 20000;
  }
  /* P1-2 (Wave 18 §۵-۳): dedup با TTL — پیش‌فرض ۲۴h، هم‌پنجرهٔ کشِ Redis
     (cache.markProcessedUid خودش TTL 24h دارد). این TTL برای سقفِ حافظهٔ
     in-memory است، نه تضعیفِ idempotency: مرجعِ رد، PG (server_processed_uids)
     و کش است و دست‌نخورده می‌ماند. */
  function uidDedupTtlMs(){
    /* باگ ۱ (بازبین دور ۱ #124): در حالتِ حافظه‌ای، __processed_uids تنها
       مرجعِ idempotency است (PG/کش در کار نیست) — TTL آنجا نباید بسوزد وگرنه
       بازپخش‌های دیرهنگام دوباره اعمال می‌شوند. TTL فقط وقتی فعال است که
       مرجعِ پایدار (PG server_processed_uids / کشِ اشتراکی) هست — الگوی uidDedupMax. */
    if(!(db && typeof db.isPostgres === 'function' && db.isPostgres())) return 0;
    const n = Number(process.env.PAYESH_UID_DEDUP_TTL_MS);
    return Number.isFinite(n) && n >= 0 ? n : 24 * 3600 * 1000;
  }
  function mirrorAppend(c, row){
    if(row == null) return row;
    if(!Array.isArray(store[c])) store[c] = [];
    store[c].push(row);
    const cap = mirrorGrowthCap();
    if(cap > 0 && mirrorPruneSafe().indexOf(c) !== -1){   /* باگ ۱: فقط لیست سفید */
      if(!Array.isArray(growthLog[c])) growthLog[c] = [];
      growthLog[c].push(row.id);
      if(growthLog[c].length > cap * 1.2){
        const drop = growthLog[c].splice(0, growthLog[c].length - cap);
        for(const id of drop){
          const arr = store[c];
          const j = arr.findIndex(x => x && x.id === id);
          if(j >= 0) arr.splice(j, 1);
        }
      }
    }
    return row;
  }
  function pruneProcessedUids(){
    const pu = store.__processed_uids;
    if(!pu || typeof pu !== 'object') return;
    /* P1-2: اول TTL — uidهای بیرونِ پنجره حذف می‌شوند، فارغ از شمارِ کل */
    const ttl = uidDedupTtlMs();
    if(ttl > 0){
      const now = Date.now();
      for(const k of Object.keys(pu)) if(now - (pu[k] || 0) > ttl) delete pu[k];
    }
    const cap = uidDedupMax();
    if(cap <= 0) return;
    const keys = Object.keys(pu);
    if(keys.length <= cap) return;
    keys.sort((a, b) => (pu[a] || 0) - (pu[b] || 0));
    const drop = keys.slice(0, keys.length - cap);
    for(const d of drop) delete pu[d];
  }

  /* Wave 1: cross-instance apply -- a record created on another instance is not in
     this store; when PG is live, hydrate the miss from the authority before deciding
     the op targets nothing. Memory mode: identical skip semantics.
     P0-6: hydration از PG رشدِ آینه است — از mirrorAppend می‌گذرد (سقفِ رشد در
     PG-live) و اگر درخواستِ جاری undo-log باز دارد، در آن ثبت می‌شود تا شکستِ
     آینه دقیقاً همین ردیفِ تازه‌هیدراته‌شده را هم بازگرداند (رفتارِ snapshot قدیمی). */
  async function findForApply(c, id, undo){
    const arr = store[c] || [];
    const rec = arr.find(x => x && x.id === Number(id));
    if(rec) return rec;
    if(db && typeof db.isPostgres === 'function' && db.isPostgres()
        && typeof db.readOne === 'function'){
      try{
        const row = await db.readOne(c, id);
        if(row){
          mirrorAppend(c, row);
          /* باگ ۳ (بازبین دور ۱ #124): after = state هیدراته — rollback و برشِ
             post-commit هر دو با همان قواعدِ مالکیتِ pop این‌جا کار می‌کنند؛
             در rollback معکوس (LIFO)، recهای بعدیِ همین دسته اول به قبل
             برمی‌گردند و بعد این pop دقیقاً مچ می‌شود. */
          if(undo) undo.items.push({ k: 'pop', c, id: row.id, idx: store[c].length - 1,
            after: JSON.parse(JSON.stringify(row)) });
          return row;
        }
      }catch(e){ /* not in PG either: genuinely missing */ }
    }
    return null;
  }

  async function apiSync(req, res, body){
    const s = await sessionFrom(req);
    if(!s) return sendJson(res, 401, { ok: false, code: 'no_session' });

    /* لایهٔ مقدار (validate.js): بدنه فقط {ops} است — کلیدِ ناشناخته = ردِّ
       400 (fail-closed؛ کلاینت فقط ops می‌فرستد). ترتیبِ بعدی (413 برایِ
       دستهٔ بزرگ + 200 برایِ خالی) عینِ رفتارِ قفل‌شده می‌ماند. */
    const bv = validate(body, { fields: { ops: { type: 'array' } }, required: ['ops'] });
    if(!bv.ok && bv.kind === 'unknown_field')
      return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    const ops = (body && body.ops);
    if(!Array.isArray(ops)) return sendJson(res, 400, { ok: false, code: 'bad_payload' });
    if(ops.length > MAX_BATCH) return sendJson(res, 413, { ok: false, code: 'batch_too_large' });
    if(ops.length === 0) return sendJson(res, 200, { ok: true, results: [] });

    /* ── Backpressure (Delta Phase 4, gap 1) ────────────────────────────
       سقفِ op در پنجرهٔ ۶۰ثانیه‌ای برایِ این نشست. رد = 429 + retry_after_s
       (از TTLِ واقعیِ پنجره) + سرآیندِ Retry-After؛ هیچ op اعمال نمی‌شود —
       کلاینت (27-sync.js) دسته را دست‌نخورده در صف نگه می‌دارد و با مُهرِ
       سرور دوباره می‌آید. گذراست: نه dead-letter، نه شمارشِ تلاشِ ناموفق op. */
    if (rateLimit && typeof rateLimit === 'function') {
      let r = null;
      try {
        r = await rateLimit({
          prefix: 'sync:ops',
          identifier: 'u' + (s.id != null ? s.id : 'anon'),
          limit: syncOpsPerMinute(),
          windowSeconds: 60,
          weight: ops.length
        });
      } catch (_) { r = null; /* fail-open — همان قراردادِ rate-limit.js */ }
      if (r && r.allowed === false) {
        metrics.inc('payesh_sync_backpressure_rejections_total', []);
        const retryAfterS = Math.max(1, Math.min(60, Math.round(Number(r.reset) || 60)));
        if (res && typeof res.setHeader === 'function') {
          try { res.setHeader('Retry-After', String(retryAfterS)); } catch (_) {}
        }
        return sendJson(res, 429, {
          ok: false,
          code: 'sync_backpressure',
          retry_after_s: retryAfterS,
          message: 'سرور زیر فشار است — تغییرات در صفِ محلی می‌مانند و کمی بعد دوباره ارسال می‌شوند'
        });
      }
    }

    const all = async (code) => {
      /* باگ ۳ (بازبین دور ۱ #124): ردِ پایِ زودهنگام یعنی دسته هرگز commit
         نمی‌شود — آینه نمی‌تواند اثرِ نیمه‌کاره نگه دارد (هیدراتاسیونِ گِیتِ
         scope و opهای قبلیِ همین دسته). همان rollbackِ شکستِ commit اجرا
         می‌شود؛ پیش از هر تغییری no-op است و پاسخ عینِ قرارداد می‌ماند. */
      if(undo && undo.items.length) await rollbackUndo();
      /* R96 P1-8: authorization failure باید ردِّ پای داشته باشد (بدونِ PII) */
      audit('sync_authz_fail', { user_id: s.id, code, ops: ops.length });
      return sendJson(res, 403, { ok: false, code, results: ops.map(o => ({ uid: o && o.uid, ok: false, code })) });
    };

    const results = [];

    /* P0-6 — undo-log به‌جای snapshotِ کلِ کالکشن (جزئیات در کامنتِ فازِ دوم):
       اینجا و پیش از حلقهٔ اعتبارسنجی ساخته می‌شود تا pushهایِ فازِ اعتبارسنجی
       (sync_conflicts و notifications تعارض) هم — مثلِ snapshot قدیمی — پوشش
       داشته باشند. هزینهٔ ساخت O(1) است؛ در حالتِ memory مقدار null می‌ماند. */
    const pgLive = !!(db && typeof db.isPostgres === 'function' && db.isPostgres());
    /* باگ ۲ (بازبین): undo مالکیت‌دار — هر مدخل حالتِ پس از تغییرِ خودِ این
       درخواست (after) را هم نگه می‌دارد؛ rollback فقط وقتی اجرا می‌شود که
       رکورد هنوز دقیقاً همان state باشد (تغییرِ هم‌زمانِ موفقِ درخواستِ دیگر
       حفظ می‌شود). __server_version هم به‌جای انتسابِ مطلق، با شمارشِ
       افزایش‌های خودِ درخواست (bumps) معکوس می‌شود. */
    const undo = pgLive ? { bumps: 0, items: [] } : null;
    /* ثبتِ undo برای یک push تازه به انتهای آرایه (idx فعلی) */
    const uPush = (c, row) => {
      if(undo && row != null){
        const arr = store[c];
        undo.items.push({ k: 'pop', c, id: row.id, idx: Array.isArray(arr) ? arr.length - 1 : -1,
                          after: JSON.parse(JSON.stringify(row)) });   /* باگ ۲: شرط مالکیت */
      }
    };
    /* P1-2 (بازبین دور ۱ #124): معکوسِ undo-log — مشترک بینِ شکستِ commit
       (mirrorFailed) و ردِ پایِ زودهنگامِ all()؛ در هر دو، دسته commit نشده
       و آینه باید دقیقاً به پیش از درخواست برگردد. */
    const rollbackUndo = async () => {
      if(!undo) return;
      /* باگ ۲: معکوسِ افزایش‌های خودِ درخواست، نه انتسابِ مطلق —
         افزایش‌های درخواست‌هایِ هم‌زمانِ موفق حفظ می‌شوند. */
      store.__server_version = Math.max(0, (store.__server_version || 0) - undo.bumps);
      for(let i = undo.items.length - 1; i >= 0; i--){
        const u = undo.items[i];
        try{
          if(u.k === 'pop'){
            /* فقط اگر رکورد هنوز دقیقاً همان state ای است که این درخواست
               push کرده (تغییر/حذفِ هم‌زمانِ موفقِ دیگری → دست نمی‌زنیم) */
            const arr = store[u.c];
            if(Array.isArray(arr)){
              const cur = arr[u.idx] && arr[u.idx].id === u.id ? arr[u.idx] : arr.find((x) => x && x.id === u.id);
              if(cur && JSON.stringify(cur) === JSON.stringify(u.after)){
                const j = arr[u.idx] && arr[u.idx].id === u.id ? u.idx : arr.findIndex((x) => x && x.id === u.id);
                if(j >= 0) arr.splice(j, 1);
              }
            }
          } else if(u.k === 'rec'){
            /* فقط اگر رکورد هنوز دقیقاً afterِ همین درخواست است —
               وگرنه کسی دیگر بعد از ما تغییرش داده و commit کرده؛
               state او (که PG مرجع تأییدش کرده) حفظ می‌شود. */
            const r = (store[u.c] || []).find(x => x && x.id === u.id);
            if(r && u.after && JSON.stringify(r) === JSON.stringify(u.after)
               && u.before){
              for(const key of Object.keys(r)) delete r[key];
              Object.assign(r, u.before);
            }
          } else if(u.k === 'reinsert'){
            /* باگ ۲ (بازبین، دور ۲): نبودِ رکورد در آینه ثابت نمی‌کند حذفِ
               همین درخواست عاملش است — درخواستِ دیگری می‌تواند همان حذف را
               در PG قطعی کرده باشد. پیش از بازدرج، مرجع را می‌پرسیم:
               رکورد در PG هست → حذفِ ما اعمال نشده → بازدرج درست است؛
               نیست → حذفِ دیگری قطعی شده → دست نمی‌زنیم. خطایِ پرسش →
               بازدرج: وقتی PG پایین است هیچ commitِ هم‌زمانی ممکن نبوده. */
            if(Array.isArray(store[u.c]) && !store[u.c].some(x => x && x.id === u.rec.id)){
              let pgHas = true;
              try{
                const r = await db.query('SELECT 1 FROM "' + String(u.c).replace(/"/g, '') + '" WHERE id = $1 LIMIT 1', [u.rec.id]);
                pgHas = !!(r && r.rows && r.rows.length);
              }catch(_){ pgHas = true; }
              if(pgHas) store[u.c].push(u.rec);
            }
          } else if(u.k === 'popDelRec'){
            /* باگ ۳ (بازبین، دور ۲): حذفِ دقیقِ مدخلِ خودِ این درخواست —
               با هویتِ کامل: ۱) جایگاه+رفرنس (تا اولین برش)؛ ۲) indexOf با
               رفرنسِ همان آبجکت (پس از جابه‌جایی هم دقیق)؛ ۳) c+id+at. */
            const dr = store.__deleted_records;
            if(Array.isArray(dr)){
              if(u.ref){
                if(dr[u.idx] === u.ref) dr.splice(u.idx, 1);
                else { const j = dr.indexOf(u.ref); if(j >= 0) dr.splice(j, 1); }
              } else if(dr[u.idx] && dr[u.idx].id === u.id && dr[u.idx].c === u.c){
                dr.splice(u.idx, 1);
              } else {
                const j = dr.findIndex((x) => x && x.c === u.c && x.id === u.id && x.at === u.at);
                if(j >= 0) dr.splice(j, 1);
              }
            }
          } else if(u.k === 'unmarkUid'){
            delete store.__processed_uids[u.uid];
          }
        }catch(_){ /* best-effort — audit بالا خطای آینه را ثبت کرده است */ }
      }
    };

    const derived = [];  /* Wave1-W: نوشت‌هایِ مشتقِ سرور (نوتیفیکیشن‌ها) — با mirror در یک تراکنش */
    const apply = [];
    for(const op of ops){
      /* پاکتِ عملیات (validate.js): کلیدِ ناشناخته یا uid/c/id/atِ بدشکل =
         malformed (کلِ دسته، مثلِ رفتارِ موجود). مقدارِ t این‌جا سنجیده
         نمی‌شود — canOp در fieldGate هر tِ غیرِ ins/upd/del را رد می‌کند. */
      if(!validateSyncEnvelope(op).ok) return all('malformed_op');
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
      /* R96 P0-1: دروازهٔ نقشِ جداگانهٔ قدیمی (canWrite) حذف شد —
         canOp داخلِ fieldGate همان ماتریسِ مدل را با تفکیکِ عمل
         اعمال می‌کند (IEP/DROP با exc می‌گذرند). یک منبعِ حقیقت: مدل. */
      /* Round 76 — dropout whitelist double guard (semantics unchanged) */
      if(dropTouchesDropout(op) && s.role !== 'superadmin' && !dropUsersUpdate(s, op)) return all('role_denied');
      /* #4 — target record inside scope */
      const recId = op.id != null ? op.id : (op.data && op.data.id);
      /* Wave 1: cross-instance scope — the authority knows the record's school.
         Hydrate store-misses from PG before the scope check so a valid
         cross-instance op is judged on truth, not on cache absence (inScope
         keeps enforcing school/ownership on the hydrated row; unknown ids still
         fail closed). Memory mode: no-op, legacy fail-closed preserved. */
      if((op.t === 'upd' || op.t === 'del') && recId != null
          && !(store[op.c] || []).some(x => x && x.id === Number(recId))){
        /* P1-2: هیدراتاسیونِ گِیت هم undo می‌گیرد — پیش‌تر بدونِ مدخل بود و
           ردیفِ هیدراته‌شده در rollback نمی‌ماند به عقب برمی‌گشت و در آینه
           می‌نشست (نشتیِ §۵-۳). ثبتِ pop = rollback دقیق + برشِ post-commit. */
        await findForApply(op.c, recId, undo);
      }
      if(!inScope(s, op.c, recId, op.data)) return all('out_of_scope');
      /* R96 P0-2 — دروازهٔ فیلد: فیلدِ ناشناخته / ارتقاءِ نقش / مالکیت /
         status. استثنایِ IEP/DROP (users) که در گِیتِ قبلی اعطا شده،
         از canOp/phone-nid معاف است ولی فیلدِ ناشناخته را نمی‌شود. */
      const fv = fieldGate(op, s, iepUsersUpdate(s, op) || dropUsersUpdate(s, op));
      if(fv){
        audit('sync_field_gate', { user_id: s.id, uid: op.uid, collection: op.c, code: fv.code });
        results.push({ uid: op.uid, ok: false, code: fv.code, message: fv.msg });
        continue;
      }
      /* لایهٔ مقدار (validate.js): طولِ رشته / enum / عدد / تاریخ — ردِّ
         عملیات‌محور (مثلِ field_denied) تا یک عملیاتِ خراب، دستهٔ سالم را
         مسموم نکند. مقدارِ خام هرگز در پاسخ/آدیت نمی‌آید (قرارداد §4). */
      const vv = validateSyncData(op.c, op.data, op.t);
      if(vv){
        audit('sync_validation_failed', { user_id: s.id, uid: op.uid, collection: op.c, field: vv.field, reason: vv.reason });
        results.push({ uid: op.uid, ok: false, code: 'validation_failed', field: vv.field, message: 'مقدارِ «' + vv.field + '» معتبر نیست' });
        continue;
      }
      /* base_versionِ بدشکل (غیرِ عددِ صحیحِ مثبت) = ردِّ عملیات — وگرنه در
         مجموعهٔ نسخه‌دار، سطرِ تعارضِ بیهوده می‌ساخت. */
      if(op.t === 'upd' && op.base_version != null &&
         (typeof op.base_version !== 'number' || !Number.isInteger(op.base_version) || op.base_version < 1)){
        audit('sync_validation_failed', { user_id: s.id, uid: op.uid, collection: op.c, field: 'base_version', reason: 'bad_base_version' });
        results.push({ uid: op.uid, ok: false, code: 'validation_failed', field: 'base_version', message: 'مقدارِ «base_version» معتبر نیست' });
        continue;
      }
      /* P1-05: mandatory base_version on VERSIONED resource updates when in strict mode or production */
      const strictBaseVersion = process.env.PAYESH_STRICT_BASE_VERSION === '1' || process.env.PAYESH_ENV === 'production' || process.env.NODE_ENV === 'production';
      if(op.t === 'upd' && VERSIONED[op.c] && op.base_version == null && strictBaseVersion){
        audit('sync_validation_failed', { user_id: s.id, uid: op.uid, collection: op.c, field: 'base_version', reason: 'missing_base_version' });
        results.push({ uid: op.uid, ok: false, code: 'missing_base_version', field: 'base_version', message: 'مقدارِ «base_version» برای مجموعه‌های نسخه‌دار الزامی است' });
        continue;
      }
      /* §13.1 — non-in-person day: physical ops rejected per-op (rest continues) */
      const vd = virtualDayViolation(op, store);
      if(vd){
        audit('sync_virtual_day_blocked', { user_id: s.id, uid: op.uid, collection: op.c, school_id: vd.schoolId, date: vd.date });
        results.push({ uid: op.uid, ok: false, code: 'virtual_day', message: 'در روز غیرحضوری، این عملیاتِ فیزیکی مسدود است' });
        continue;
      }
      /* S2-2 (موج ۴): اجازه‌ای که بر تاریخِ ادعاییِ کلاینت (op.at) تکیه کرد
         و امروزِ سرور مجازی بود، ردِّ پا می‌گیرد — وگرنه جعلِ op.at برایِ
         دور زدنِ روزِ مجازی کاملاً نامرئی بود. رفتار (مجاز/مسدود) بی‌تغییر؛
         مشروعیتِ آفلاین حفظ شده. (خطِ vd بالا لنگرِ جهشِ M13 است — نخورد.) */
      const vdb = virtualDayOfflineBasis(op, store);
      if(vdb){
        try { audit('sync_virtual_day_offline_allow', { user_id: s.id, uid: op.uid, collection: op.c, school_id: vdb.schoolId, date: vdb.date }); } catch(_) {}
      }
      /* §3.3 — idempotency: a repeated uid is already applied.
         F2 (chaos-drill #185): dedupe سه‌لایه است (کشِ Redis → db → store).
         قطعِ Redis در production پیش‌تر از prodRethrow تا این‌جا می‌پرید و
         کلِ /api/sync را 500 می‌کرد — درحالی‌که دو لایهٔ authoritative بعدی
         سالم‌اند. شکستِ لایهٔ کش فقط audit می‌شود و dedupe به لایه‌های
         بعدی می‌افتد (fail-closedِ داده حفظ است: mark هم سه‌لایه است). */
      let cacheProcessed = false;
      try { cacheProcessed = await cache.isProcessedUid(op.uid); }
      catch (cacheErr) {
        try { audit('sync_idempotency_cache_unavailable', { user_id: s.id, uid: op.uid, error: String((cacheErr && cacheErr.message) || cacheErr).slice(0, 120) }); } catch (_) {}
      }
      const isProcessed = cacheProcessed ||
        ((db && typeof db.isUidProcessed === 'function') ? await db.isUidProcessed(op.uid) : false) ||
        !!(store.__processed_uids && store.__processed_uids[op.uid]);
      if(isProcessed){
        results.push({ uid: op.uid, ok: true, code: 'duplicate_ignored', serverTime: new Date().toISOString() });
        continue;
      }
      /* R95 بند ۲.۵ — base_version: تعارضِ حفظ‌شده / سرورِ مرجع */
      if(op.t === 'upd' && op.base_version != null){
        const occT0 = process.hrtime.bigint();
        const vid = Number(op.id != null ? op.id : (op.data && op.data.id));
        let vrec = null;
        if(db && typeof db.isPostgres === 'function' && db.isPostgres() && typeof db.readOne === 'function'){
          try { vrec = await db.readOne(op.c, vid); } catch(_) {}
        }
        if(!vrec){
          vrec = (store[op.c] || []).find(x => x.id === vid);
        }
        const cur = vrec ? (vrec.version || 1) : 0;
        const versionedMismatch = !!VERSIONED[op.c] && Number(op.base_version) !== cur;
        const structuralMismatch = !versionedMismatch && !!STRUCTURAL[op.c] && Number(op.base_version) !== cur;
        /* Delta Hardening Phase 2 (gap 4): conflict-detection latency — the
           locate+compare step itself (before any conflict bookkeeping), on
           every versioned write. Closed label set: conflict|stale|clean. R1:
           observability never breaks the request path. */
        try {
          const occSec = Number(process.hrtime.bigint() - occT0) / 1e9;
          metrics.observe('payesh_sync_conflict_detection_seconds',
            { outcome: versionedMismatch ? 'conflict' : (structuralMismatch ? 'stale' : 'clean') }, occSec);
        } catch(_) {}
        if(versionedMismatch){
          const nowIso = new Date().toISOString();
          if(!Array.isArray(store.sync_conflicts)) store.sync_conflicts = [];
          const cfSchoolId = (vrec && vrec.school_id != null ? vrec.school_id
                             : (op.data && op.data.school_id != null ? op.data.school_id : s.school_id));
          const cf = {
            id: await serverId('sync_conflicts'),
            collection: op.c,
            record_id: vid,
            school_id: cfSchoolId,
            user_id: s.id,
            client_uid: op.uid || null,
            base_version: Number(op.base_version),
            incoming_version: Number((op.data && op.data.version) || op.base_version || 1),
            current_version: vrec ? (vrec.version || 1) : null,
            server_version: vrec ? (vrec.version || 1) : null,
            client_data: op.data ? Object.assign({}, op.data) : null,
            server_data: vrec ? Object.assign({}, vrec) : null,
            server_state: vrec ? Object.assign({}, vrec) : null,
            incoming: { data: Object.assign({}, op.data), by: s.id, at: nowIso, op_uid: op.uid },
            status: 'open',
            created_at: nowIso,
            updated_at: nowIso
          };
          /* باگ ۲ (بازبین دور ۱ #124): درج از mirrorAppend می‌گذرد تا هرسِ ringِ
             سقف‌دار (sync_conflicts لیست‌سفید است) رویش کار کند — push خام
             growthLog را خالی می‌گذاشت و صف بی‌سقف می‌راند. uPush همان‌جا:
             بازگشتِ دقیق همین ردیف در rollback (P0-6).
             P1-06: افزودن به derived جهت ماندگاری اتمیک در PostgreSQL */
          uPush('sync_conflicts', mirrorAppend('sync_conflicts', cf));
          derived.push({ c: 'sync_conflicts', t: 'ins', data: cf });
          /* ویو ۱۴: برچسبِ collection نامِ جدول است (مجموعهٔ بستهٔ VERSIONED)،
             نه شناسهٔ رکورد — بدون PII و با cardinality کران‌دار. */
          metrics.inc('payesh_sync_conflicts_total', { collection: String(op.c || 'unknown').slice(0, 32) });
          audit('sync_conflict_preserved', { user_id: s.id, conflict_id: cf.id, collection: op.c, record_id: vid, school_id: cf.school_id });
          /* هشدار به مدیرِ مدرسه (الگویِ hookهایِ R88/R89) */
          const cmgr = (store.users || []).find(x => x.school_id === cf.school_id && x.role === 'manager');
          if(cmgr){
            if(!Array.isArray(store.notifications)) store.notifications = [];
            const cnotif = {
              id: await serverId('notifications'), user_id: cmgr.id, school_id: cf.school_id, type: 'announcement',
              title: '⚠️ تعارض همگام‌سازی',
              body: 'یک تغییرِ «' + op.c + '» با نسخهٔ کهنه رسید و به‌جای اعمال، برایِ داوری محفوظ شد.',
              link: 'dashboard', read: 0, created_at: nowIso.slice(0, 10)
            };
            uPush('notifications', mirrorAppend('notifications', cnotif));   /* P1-2: از مسیرِ سقف‌دار، نه push خام؛ uPush همان‌جا */
            derived.push({ c: 'notifications', t: 'ins', data: cnotif }); /* Wave1-W */
          }
          ctx.markDirty();
          results.push({ uid: op.uid, ok: false, code: 'conflict_preserved', conflict_id: cf.id,
                         message: 'تعارض محفوظ شد — برایِ داوری به بخشِ «تعارض‌های همگام‌سازی» مراجعه کنید' });
          continue;
        }
        if(structuralMismatch){
          results.push({ uid: op.uid, ok: false, code: 'stale_base',
                         message: 'نسخهٔ رکورد کهنه است — سرور مرجع است؛ داده را تازه کنید و دوباره تلاش کنید' });
          continue;
        }
      }
      /* §3.3 — clock skew: suspicious but not fatal — log, keep going */
      if(op.at){
        const drift = Math.abs(Date.now() - Date.parse(op.at));
        if(drift > AT_DRIFT_MS) audit('sync_clock_skew', { user_id: s.id, uid: op.uid, drift_ms: drift });
      }
      results.push({ uid: op.uid, ok: true, serverTime: new Date().toISOString() });
      apply.push(op);
    }

    /* Wave 1: PG-first two-phase. Phase 1 applies to the store; phase 2 commits the
       atomic PG mirror; on mirror failure the store changes are rolled back and the
       client gets 503 (uids stay unmarked so the retry replays cleanly).
       Memory mode: the mirror is a no-op success, so behavior is identical and
       nothing is journaled for zero overhead.
       P0-6 — undo-log به‌جای snapshotِ کلِ کالکشن: نسخهٔ قبلی این کد کلِ هر
       کالکشنِ درگیر را با JSON.parse(JSON.stringify(store[k])) clone می‌کرد ⇒
       هزینهٔ هر درخواستِ sync با اندازهٔ آینه رشد می‌کرد (O(collection)، در
       مانورِ بار ~۱MB/درخواستِ هم‌زمان)، نه با اندازهٔ batch. حالا هر mutation
       فقط یک مدخلِ O(1) در undo ثبت می‌کند (clone تک‌رکورد برای upd، idx/id
       برای push، رکوردِ حذف‌شده برای del) و rollback مدخل‌ها را معکوس اجرا
       می‌کند ⇒ O(batch). از نظرِ صحت هم بهتر است: snapshotِ کل، تغییرهایِ
       هم‌زمانِ درخواست‌هایِ دیگر (بینِ awaitها) را هم بی‌سروصدا برمی‌گرداند؛
       undo فقط تغییرهایِ همین batch را برمی‌گرداند. sync_conflicts و
       notifications ساخته‌شده در فازِ اعتبارسنجی هم — مثلِ قبل — پوشش دارند:
       undo پیش از حلقهٔ اعتبارسنجی ساخته می‌شود و همان حلقه‌ها در آن ثبت
       می‌کنند. */
    const mirror = [];   /* P1-14: opsِ آینه با شناسه‌هایِ اعمال‌شدهٔ سرور */
    for(const op of apply){
      /* S2-1 (موج ۴): ادعایِ اتمیکِ uid — حتماً پیش از اعمال. بررسی در
         اعتبارسنجی بود ولی ثبت بعدتر — تکراریِ درون‌دسته دو بار اعمال
         می‌شد و دسته‌هایِ هم‌زمان مسابقه می‌دادند. این حلقه هیچ await
         ندارد پس check+claim درون‌فرآیند اتمیک است. تکراری، ورودیِ
         متناظرِ خودش در results (از آخر به اول — op دوم به بعد) را
         duplicate_ignored می‌کند. (ادعایِ توزیع‌شده چندنمونه‌ای = Wave 6.) */
      if(store.__processed_uids && store.__processed_uids[op.uid]){
        for(let ri = results.length - 1; ri >= 0; ri--){
          if(results[ri].uid === op.uid && results[ri].ok && !results[ri].code){
            results[ri] = { uid: op.uid, ok: true, code: 'duplicate_ignored', serverTime: results[ri].serverTime };
            break;
          }
        }
        try { audit('sync_duplicate_ignored', { user_id: s.id, uid: op.uid }); } catch(_) {}
        continue;
      }
      store.__processed_uids[op.uid] = Date.now();
      if(undo) undo.items.push({ k: 'unmarkUid', uid: op.uid });   /* P0-6 */
      if(!Array.isArray(store[op.c])) store[op.c] = [];
      if(op.t === 'ins'){
        const data = Object.assign({}, op.data);
        const prot = stripProtected(data); /* R98 — ممنوع‌ها جدا؛ بعداً صریح */
        if(data.id == null) data.id = await serverId(op.c); /* Wave 1: ids service (PG sequences when live) */
        if(VERSION_TRACKED[op.c] && data.version == null) data.version = 1; /* R95 */
        /* Wave 1: hydrate cross-instance misses from PG before the upsert check. */
        const ex = await findForApply(op.c, data.id, undo);
        if(ex){
          const uRec = undo ? undo.items.push({ k: 'rec', c: op.c, id: ex.id,
            before: JSON.parse(JSON.stringify(ex)) }) - 1 : -1;   /* باگ ۲: before + after */
          Object.assign(ex, data); Object.assign(ex, prot);
          if(undo) undo.items[uRec].after = JSON.parse(JSON.stringify(ex));
        }
        else { Object.assign(data, prot); mirrorAppend(op.c, data); }
        data.updated_at = new Date().toISOString();   /* تکمیلِ رکورد پیش از ثبتِ after */
        /* باگ ۱ (بازبین، دور ۲): uPush فقط برای درجِ خودِ این op — var تابع‌محدوده
           بود و مقدارش از دورِ قبل می‌ماند؛ op برخوردیِ بعدی (مسیرِ ex) با رکوردِ
           دورِ قبل مدخلِ popِ تکراری/نامالک می‌ساخت و rollback می‌توانست رکوردِ
           قطعی‌شدهٔ درخواستِ دیگر را از آینه حذف کند. */
        if(!ex) uPush(op.c, data);   /* باگ ۲: after دقیقاً state نهایی push خودمان */
        if(op.c === 'users' && (data.role || (prot && prot.role))){
          const r = data.role || prot.role;
          audit('role_change', { user_id: s.id, role: s.role, school_id: s.school_id, target_user_id: data.id, new_role: r, summary: 'ثبت کاربر با نقش ' + r + ' (شناسه ' + data.id + ')' });
        }
        mirror.push({ uid: op.uid, c: op.c, t: 'ins', data: (ex || data) });   /* P1-14: رکوردِ اعمال‌شده با شناسهٔ سرور */
      }else if(op.t === 'upd'){
        /* Wave 1: hydrate cross-instance misses from PG before applying. */
        const rec = await findForApply(op.c, op.id != null ? op.id : (op.data && op.data.id), undo);
        if(rec){
          const uRec = undo ? undo.items.push({ k: 'rec', c: op.c, id: rec.id,
            before: JSON.parse(JSON.stringify(rec)) }) - 1 : -1;   /* باگ ۲ */
          const clean = Object.assign({}, op.data); /* R98 — op.data برایِ hookها دست‌نخورده */
          const prot = stripProtected(clean);
          if(op.c === 'users' && clean.role && rec.role !== clean.role){
            audit('role_change', { user_id: s.id, role: s.role, school_id: s.school_id, target_user_id: rec.id, old_role: rec.role, new_role: clean.role, summary: 'تغییر نقش کاربر ' + rec.id + ' به ' + clean.role });
          }
          Object.assign(rec, clean, { id: rec.id, updated_at: new Date().toISOString() });
          Object.assign(rec, prot); /* مقادیرِ اعتبارسنجی‌شده — صریح، نه inject */
          if(VERSION_TRACKED[op.c]) rec.version = (rec.version || 1) + 1; /* R95 */
          if(undo) undo.items[uRec].after = JSON.parse(JSON.stringify(rec));   /* باگ ۲ */
          mirror.push({ uid: op.uid, c: op.c, t: 'upd', data: rec });   /* P1-14 */
        }
      }else if(op.t === 'del'){
        const delId = Number(op.id != null ? op.id : (op.data && op.data.id));
        /* Wave 1: hydrate cross-instance misses from PG (seeded row is removed by the filter below). */
        const delRec = await findForApply(op.c, delId, undo);
        const delSchoolId = delRec ? delRec.school_id : (op.data && op.data.school_id ? op.data.school_id : s.school_id);
        if(undo && delRec) undo.items.push({ k: 'reinsert', c: op.c, rec: JSON.parse(JSON.stringify(delRec)) });   /* P0-6 */
        store[op.c] = store[op.c].filter(x => x.id !== delId);
        if(!Array.isArray(store.__deleted_records)) store.__deleted_records = [];
        const tomb = { c: op.c, id: delId, school_id: delSchoolId, at: new Date().toISOString() };
        store.__deleted_records.push(tomb);
        /* باگ ۳ (بازبین): برشِ ۵۰۰۰تایی دیگر در مسیرِ apply نیست — پس از
           commitِ موفق انجام می‌شود تا rollback آرایه را دقیقاً به قبل بازگرداند
           (برشِ داخل apply یک سنگ‌قبرِ قدیمی را گم می‌کرد). */
        /* باگ ۳ (بازبین، دور ۲): رفرنسِ خودِ سنگ‌قبر (identity) + c — جایگاه فقط
           تا اولین برشِ post-commitِ درخواستِ دیگر معتبر است و id تنها، بینِ
           مجموعه‌ها اشتباه می‌گرفت (grades:42 vs announcements:42). */
        if(undo) undo.items.push({ k: 'popDelRec', idx: store.__deleted_records.length - 1, id: delId, c: op.c, at: tomb.at, ref: tomb });
        audit('record_deleted', { user_id: s.id, role: s.role, school_id: s.school_id, collection: op.c, record_id: delId, summary: 'حذف رکورد ' + delId + ' از ' + op.c });
        mirror.push({ uid: op.uid, c: op.c, t: 'del', id: delId });   /* P1-14 */
      }
      store.__server_version = (store.__server_version || 0) + 1;
      if(undo) undo.bumps++;   /* باگ ۲: فقط افزایش‌های خودِ این درخواست */
      /* Wave 1: uid marking moved post-commit (see below) so failed batches replay.
         SUSPECT-C (باگ‌هانت چت ۵، نشست ۲): خطایِ ابطال پیش‌تر با `.catch(()=>{})`
         بلعیده می‌شد؛ در تولید (گاردهای BUG-2) واقعی است و بی‌صدایی واگراییِ
         نامرئی می‌سازد. حالا audit می‌شود؛ پاسخ بی‌تغییر می‌ماند و خودِ audit
         هم هرگز پاسخ را نمی‌شکند. (markProcessedUid پس از کامیت پایین‌تر audit می‌شود.) */
      cache.invalidateCollection(op.c, op.data && op.data.school_id).catch((invErr) => {
        try { audit('sync_invalidate_failed', { user_id: s.id, collection: op.c, error: String((invErr && invErr.message) || invErr) }); } catch (_) {}
      });
      /* P1-14: آینه این‌جا نیست — پس از حلقه، یک‌جا و اتمیک (persistOpsBatch) */
    }
    /* Round 88 + Round 89 — server side: the client cannot create notifications
       (inScope structurally rejects ins notifications for every non-manager role);
       the server therefore creates the needed one for the ACTION itself:
       1) leaves pending (non-manager)  -> school manager   (R88; R89 generalized wording)
       2) messages / chat (non-manager) -> the recipient    (R89)
       3) corrections open (non-manager)-> school manager   (R89)
       Manager/superadmin actions keep the client-created notification (applied),
       so the hook skips them — no duplicates. */
    const notifBefore = Array.isArray(store.notifications) ? store.notifications.length : 0;
    for(const op of apply){
      if(!Array.isArray(store.notifications)) store.notifications = [];
      const todayD = new Date().toISOString().slice(0, 10);
      if(op.c === 'leaves' && op.t === 'ins' && op.data && op.data.status === 'pending'
         && s.role !== 'manager' && s.role !== 'superadmin'){
        const d = op.data;
        const mgr = (store.users || []).find(x => x.school_id === d.school_id && x.role === 'manager');
        if(mgr){
          const st = (store.users || []).find(x => x.id === d.student_id);
            const ln = {
              id: await serverId('notifications'), user_id: mgr.id, school_id: d.school_id, type: 'leave',
            title: '📨 درخواست مرخصی جدید',
            body: 'برای ' + ((st && st.full_name) || '') + ' از ' + d.from_date + ' تا ' + d.to_date + ' — در انتظارِ بررسی.',
            link: 'leaves', read: 0, created_at: todayD
          };
          mirrorAppend('notifications', ln); uPush('notifications', ln);   /* P0-6 */
          derived.push({ c: 'notifications', t: 'ins', data: ln }); /* Wave1-W */
          audit('leave_request_notified', { user_id: s.id, leave_id: d.id, school_id: d.school_id });
        }
      }
      if(op.c === 'messages' && op.t === 'ins' && op.data && op.data.to_id != null
         && s.role !== 'manager' && s.role !== 'superadmin'
         && Number(op.data.to_id) !== s.id){
        const to = (store.users || []).find(x => x.id === Number(op.data.to_id));
        if(to){
          const from = (store.users || []).find(x => x.id === Number(op.data.from_id != null ? op.data.from_id : s.id));
            const cn = {
              id: await serverId('notifications'), user_id: to.id,
            school_id: op.data.school_id != null ? op.data.school_id : to.school_id,
            type: 'chat', title: '💬 پیام جدید',
            body: ((from && from.full_name) || '') + ': ' + String(op.data.body || '').slice(0, 60),
            link: 'chat', read: 0, created_at: todayD
          };
          mirrorAppend('notifications', cn); uPush('notifications', cn);   /* P0-6 */
          derived.push({ c: 'notifications', t: 'ins', data: cn }); /* Wave1-W */
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
            const crn = {
              id: await serverId('notifications'), user_id: mgr.id, school_id: d.school_id, type: 'announcement',
            title: '⚠️ درخواست اصلاح اطلاعات ولی',
            body: ((par && par.full_name) || '') + ' اعلام کرد ' + ((st && st.full_name) || '') + ' فرزند او نیست.',
            link: 'corrections', read: 0, created_at: todayD
          };
          mirrorAppend('notifications', crn); uPush('notifications', crn);   /* P0-6 */
          derived.push({ c: 'notifications', t: 'ins', data: crn }); /* Wave1-W */
          audit('correction_notified', { user_id: s.id, correction_id: d.id, school_id: d.school_id });
        }
      }
    }
    /* P1-14: آینهٔ اتمیکِ چندرکوردی — همه در یک تراکنش (all-or-nothing).
       شکست → rollback + audit؛ در حالتِ PG پاسخ ۵۰۳ می‌شود تا کلاینت retry کند
       (Wave 1)؛ در memory پاسخ مثلِ قبل عوض نمی‌شود — ولی دیگر بی‌خبر هم نیست:
       پرچمِ مرئیِ mirror_failed (SUSPECT-A، نشست ۲) همراهِ ok=true برمی‌گردد. */
    /* Wave1-W: نوشت‌هایِ مشتقِ سرور (نوتیفیکیشن‌هایِ hook) در همان تراکنش —
       همان ردیف‌هایی که store.notifications.slice(notifBefore) می‌داد، ولی
       دقیق و بدونِ اسکن (هر hook خودش را به derived می‌رساند). */
    const batchAll = mirror.concat(derived);
    /* Wave 1: phase 2 -- the atomic PG commit. On failure with PG live, roll the
       store back to the pre-request snapshot and fail closed (503) so the client
       retries; uids stay unmarked so the retry replays instead of being skipped.
       Without PG (memory mode, e.g. older mirror-failure tests), keep the legacy
       audit-and-continue semantics plus the visible mirror_failed flag (SUSPECT-A). */
    let mirrorFailed = false;
    if(batchAll.length && db && typeof db.persistOpsBatch === 'function'){
      try{
        await db.persistOpsBatch(batchAll);
      }catch(mirrorErr){
        const why = String((mirrorErr && mirrorErr.message) || mirrorErr);
        mirrorFailed = true;
        audit('sync_mirror_failed', { user_id: s.id, ops: batchAll.length, error: why });
        /* F1 (chaos-drill #185): pgLive در *ابتدای* درخواست ارزیابی شده؛ اگر
           PG وسطِ قطع باشد isPostgres()=false و pgLive=false است — ولی وقتی
           «PG انتظار می‌رود» (production + DATABASE_URL)، ackِ 200 بدونِ
           mirror = گم‌شدنِ دائمیِ داده (پس از بازگشتِ PG آن ops آن‌جا نیستند
           و retry هم duplicate_ignored می‌گیرد). همان مسیرِ 503 اجرا شود. */
        const pgWasExpected = !!(db && typeof db.pgExpected === 'function' && db.pgExpected());
        if(pgWasExpected && !pgLive){
          /* در این حالت undo=null است (pgLive در ابتدای درخواست false بود) —
             claimِ uidهای همین batch در __processed_uids می‌ماند و بازاجرایِ
             کلاینت duplicate_ignored می‌گرفت بی‌آنکه به PG برسد (rows=0).
             آزادسازیِ دستی: شکستِ کامل = replayِ کامل مجاز (قرارداد Wave 1). */
          for(const op of batchAll){
            if(op && op.uid && store.__processed_uids) delete store.__processed_uids[op.uid];
          }
        }
        if(pgLive || pgWasExpected){
          /* P0-6 — rollback با undo-log: معکوسِ ثبت‌های همین batch — O(batch)،
             نه بازنویسیِ کلِ کالکشن. مزیتِ صحت: تغییرهایِ هم‌زمانِ درخواست‌هایِ
             دیگر بینِ awaitها حفظ می‌شوند (snapshot قدیمی آن‌ها را هم برمی‌گرداند).
             P1-2: بدنه به rollbackUndo منتقل شد (مشترک با ردِّ پایِ زودهنگامِ all). */
          await rollbackUndo();
          for(const r of results){ if(r) r.ok = false; }
          return sendJson(res, 503, { ok: false, code: 'sync_mirror_failed', results });
        }
      }
    }
    /* Wave 1: uids are marked only after the authority committed (store AND cache),
       so a failed batch always replays. End state in memory mode is unchanged. */
    if(!store.__processed_uids) store.__processed_uids = {};
    for(const op of apply){
      store.__processed_uids[op.uid] = Date.now();
      /* SUSPECT-C (باگ‌هانت چت ۵، نشست ۲): علامتِ idempotency در کش هم audit می‌شود. */
      try{ cache.markProcessedUid(op.uid).catch((markErr) => {
        try { audit('sync_idempotency_mark_failed', { user_id: s.id, uid: op.uid, error: String((markErr && markErr.message) || markErr) }); } catch (_) {}
      }); }catch(e){}
    }
    /* P1-2 (Wave 18 §۵-۳): قطعِ آینه از مسیرِ نوشتن در PG-live — مجموعه‌های
       خارجِ لیستِ سفیدِ هرس (PAYESH_PG_MIRROR_PRUNE_SAFE) پس از commitِ موفق
       به آینهٔ پیش از دسته بازمی‌گردند: رکورد فقط در PG است (مرجع) و آینه
       cacheیِ bounded می‌ماند (هیدراتاسیونِ بوت + write-through صرفاً برای
       مجموعه‌های هرس‌امن). درونِ دسته رفتارِ امروز حفظ می‌شود تا policy و
       دست‌های وابستهٔ همان batch همان‌طور ببینند؛ rollbackِ دستهٔ شکست‌خورده
       (undo) پیش از این اجرا شده و این‌جا فقط مسیرِ موفق را می‌بُرد.
       مالکیت‌دار: مدخلِ pop با after فقط وقتی می‌بُرد که رکورد هنوز state
       نهاییِ خودِ همین دسته باشد (تغییرِ هم‌زمانِ دیگری محفوظ می‌ماند)؛
       مدخلِ بدونِ after = هیدراتاسیونِ همین دسته (ردیف عیناً از PG آمده). */
    if(pgLive && undo && mirrorGrowthCap() > 0){
      const safeSet = mirrorPruneSafe();
      /* باگ ۳ (بازبین دور ۱ #124): مالکیت با «آخرین state نوشته‌شدهٔ خودِ همین
         دسته» سنجیده می‌شود — نه فقط after خودِ pop: اگر opهای همین دسته
         رکوردِ هیدراته‌شده را هم به‌روز کرده باشند (rec با after جدیدتر)،
         state نهایی باز مالِ ماست و بریده می‌شود؛ تغییرِ ناهمگامِ درخواستِ
         دیگر با هیچِ afterِ خودی مچ نمی‌شود و محفوظ می‌ماند. */
      const lastAfter = {};
      for(let i = undo.items.length - 1; i >= 0; i--){
        const u = undo.items[i];
        if(u.k !== 'pop' && u.k !== 'rec') continue;
        const key = u.c + ':' + u.id;
        if(!(key in lastAfter)) lastAfter[key] = u.after || null;   /* نخستینِ دیده‌شده از پایان = آخرین نوشته */
        if(u.k !== 'pop' || safeSet.indexOf(u.c) !== -1) continue;
        const arr = store[u.c];
        if(!Array.isArray(arr)) continue;
        const j = (arr[u.idx] && arr[u.idx].id === u.id) ? u.idx : arr.findIndex(x => x && x.id === u.id);
        if(j < 0) continue;
        const own = lastAfter[key];
        if(own && JSON.stringify(arr[j]) !== JSON.stringify(own)) continue;   /* تغییرِ ناهمگامِ دیگران — احترام */
        arr.splice(j, 1);
      }
    }
    if(Array.isArray(store.__deleted_records) && store.__deleted_records.length > 5000){
      store.__deleted_records = store.__deleted_records.slice(-5000);   /* باگ ۳: پس از commit — rollback دیگر در کار نیست */
    }
    pruneProcessedUids();   /* P1-2: TTL + سقف */   /* P0-6: __processed_uids سقف‌دار (پیش‌فرض PG-live=20000؛ پنجرهٔ اخیر کافی است چون Redis dedup اشتراکی هم هست) */
    if(apply.length) ctx.markDirty();
    audit('sync_ok', { user_id: s.id, ops: apply.length });
    /* Delta Phase 4 (gap 4): هر pushِ موفق (دستهٔ غیرخالی که به ۲۰۰ رسید)
       یک واحد — پالسِ سلامتِ مسیرِ write. */
    metrics.inc('payesh_sync_pushes_total');
    sendJson(res, 200, mirrorFailed ? { ok: true, results, mirror_failed: true } : { ok: true, results });
  }

  return { apiSync, canWrite, inScope };
}
module.exports = { createSync, attach, canWrite, canOp, fieldGate, inScope, isVirtualDay, virtualDayViolation, virtualDayOfflineBasis, WRITE_PERMS, AUTHZ, ROLE_LEVEL, OWNERSHIP_KEYS, STATUS_WRITER_COLL, STATUS_INITIAL_MAP, STATUS_UPD_ROLE, iepUsersUpdate, IEP_KEYS, dropUsersUpdate, DROP_KEYS, dropTouchesDropout, filterFields, FIELD_ALLOWLISTS, PROTECTED_FIELDS, protPolicy, VERSIONED, STRUCTURAL, VERSION_TRACKED };
