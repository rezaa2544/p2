/* ═══════════════════════════════════════════════════════════════════
   server/validate.js — اعتبارسنجیِ صریحِ درخواست‌ها (strict request validation)
   -------------------------------------------------------------------
   همهٔ endpointهای سرور، بدنهٔ درخواست را پیش از هر منطقی از همین‌جا
   رد می‌کنند (یک منبعِ حقیقت — درسِ R96 P0-1: کنترلِ پراکنده = شکاف):

     • validate(body, schema) — بدنهٔ endpointها؛ الگو:
         { fields: { name: { type:'string', max:100 }, ... }, required: [...] }
     • validateSyncEnvelope(op) — پاکتِ عملیاتِ همگام‌سازی (کلیدِ ناشناخته
       = ردِّ کلِ دسته، هم‌خانواده با رفتارِ موجودِ malformed_op)
     • validateSyncData(coll, data, type) — مقدارِ فیلدها (طول/enum/عدد/
       تاریخ)؛ ردِّ عملیات‌محور (200 + ok:false) مثلِ field_denied تا یک
       عملیاتِ خراب، دستهٔ سالم را مسموم نکند.

   قراردادها (docs/SERVER_SECURITY_CONTRACT.md):
     §3.2 — سنجش‌های ۱ تا ۴ در sync.js می‌مانند و دست‌نخورده‌اند؛ این
       ماژول «لایهٔ مقدار» است و بعد از fieldGate اجرا می‌شود تا هیچ
       کدِ ردیِ قفل‌شده‌ای عوض نشود (مثلاً unknown_field و field_denied).
     §3.3 — op.at هرگز رد نمی‌شود (فقط ثبت)؛ این‌جا فقط «رشته‌بودن» آن
       سنجیده می‌شود.
     §4   — پیام‌ها و آدیت هرگز مقدارِ خام را برنمی‌گردانند (فقط نامِ
       فیلد + قاعده) تا PII (نام/تلفن/کد ملی) در پاسخ یا لاگ نیاید.

   خروجیِ validate:
     { ok:true } یا { ok:false, kind, field, message }
     kind: 'unknown_field' | 'missing' | 'invalid'
     نگاشتِ kind به code پاسخ، با خودِ endpoint است تا codeهای قفل‌شده
     (bad_phone / missing_fields / bad_batch / bad_payload) حفظ شوند.

   Runtime deps: Node stdlib only.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── سقف‌ها ─────────────────────────────────────────────────────── */
const LIMITS = {
  BODY_DEFAULT : 1024 * 1024,  /* سقفِ پیش‌فرضِ بدنه: 1MB (اکثرِ endpointها) */
  BODY_SYNC    : 1024 * 1024,  /* /api/sync — همان سقفِ موجود */
  BODY_SMALL   : 4 * 1024,     /* auth / resolve-conflict / restore — بدنه‌هایِ کوچک */
  BODY_SMS     : 32 * 1024,    /* /api/sms/send — همان سقفِ موجود */
  STR_SHORT    : 100,          /* نام‌ها/عنوان‌ها/شناسه‌هایِ انسانی */
  STR_MID      : 200,          /* توکن/نوع/پیوند و مانندِ آن */
  STR_LONG     : 2000,         /* متن‌ها (body/note/reason/...) + سقفِ پیش‌فرضِ رشته */
  UID          : 128,          /* شناسهٔ عملیات (نمونهٔ واقعی ≈ ۲۵ نویسه) */
  COLL         : 64,           /* نامِ مجموعه */
  ARRAY        : 2000,         /* طولِ آرایه (مثلِ *_ids) */
  OBJ_KEYS     : 100,          /* کلیدهایِ شیءِ تودرتو + عمقِ حداکثر ۵ */
  OBJ_KEYLEN   : 64,
  NUM_ABS      : 1e12,         /* قدرمطلقِ عدد (|بزرگ‌ترینِ دمو| ≈ 3.2e8) */
  ID_MAX       : 2147483647,   /* سقفِ شناسه (int32) */
  YEAR_MIN     : 1900,
  YEAR_MAX     : 2100,
};

/* ── enumهایِ status به‌ازایِ هر مجموعه ────────────────────────────
   اجتماعِ سه منبع: seed (server/seed.js) + نوشتن‌هایِ کلاینت
   (src/js) + محموله‌هایِ تست‌ها. مجموعه‌ای که این‌جا نیست، status
   ندارد (۲۴ مجموعهٔ دارایِ status، هر ۲۴ این‌جاست). */
const STATUS_ENUMS = {
  assets               : ['available', 'in_use', 'repair'],
  attendance           : ['present', 'absent', 'late', 'early_exit', 'excused'],
  bus_followups        : ['open', 'closed'],
  corrections          : ['open', 'pending', 'resolved'],
  counselor_msgs       : ['open'],
  counselor_refs       : ['open', 'handled'],
  exam_terms           : ['draft', 'published'],
  installments         : ['pending', 'paid', 'partial', 'canceled', 'cancelled'],
  internships          : ['pending', 'approved', 'rejected'],
  leaves               : ['pending', 'approved', 'rejected'],
  meeting_slots        : ['open', 'booked', 'cancelled', 'canceled'],
  nid_conflicts        : ['open', 'resolved', 'dismissed'],
  notify_queue         : ['pending', 'sent', 'cancelled', 'rejected'],
  nudges               : ['pending', 'queued', 'replied'],
  parent_subscriptions : ['trial', 'none', 'active', 'expired', 'pending'],
  parent_verifications : ['pending', 'confirmed', 'rejected'],
  pre_enrollments      : ['registered', 'confirmed', 'placed', 'rejected'],
  reexams              : ['scheduled', 'done'],
  scholarships         : ['requested', 'review', 'approved', 'rejected'],
  sms_log              : ['queued', 'sent', 'failed'],
  staff_attendance     : ['present', 'absent', 'late'],
  teacher_sms          : ['queued', 'sent', 'failed'],
  training_courses     : ['ongoing', 'completed'],
  transfer_requests    : ['pending', 'approved', 'rejected'],
  tuitions             : ['open', 'partial', 'settled'],
  users                : ['active', 'dropped_out', 'graduated', 'awaiting_transfer'],
};

/* enumهایِ تک‌فیلدیِ دیگر (شواهد در src/js + seed) */
const STAGE_ENUM      = ['contact', 'visit', 'exam', 'enrolled'];           /* preapps.stage */
const USER_ROLES      = ['student', 'parent', 'driver', 'counselor',
                         'teacher', 'edu_office', 'manager', 'superadmin']; /* users.role */
const SCHOOL_GENDERS  = ['پسرانه', 'دخترانه', 'مختلط'];                     /* schools.gender */
/* نکته: exam_duties.role و counselor_msgs.author_role عمداً enum ندارند —
   واژگان‌شان باز است (مثلاً 'proctor' در تستِ F5 سرور۱۷) و گاردِ «چه کسی»
   (protPolicy/canOp/manager-only) سرِ جایِ خودش است؛ این‌جا فقط سقفِ طول. */

/* نام‌فیلدهایِ کوتاه (≤۱۰۰) و میانی (≤۲۰۰) */
const SHORT_FIELDS = ['full_name', 'name', 'title', 'username', 'subject',
  'job', 'degree', 'field', 'code', 'first_name', 'last_name'];
const MID_FIELDS = ['type', 'link', 'kind', 'token', 'file_key', 'file_name',
  'mime', 'color', 'day', 'month', 'source', 'provider', 'method', 'plan',
  'category', 'level', 'shift', 'branch', 'stage'];

/* پرچم‌هایِ ۰/۱ (در این کدبیس عددند، نه boolean) */
const FLAG_FIELDS = ['active', 'read', 'excused'];

/* ── کمک‌تابع‌ها ────────────────────────────────────────────────── */
function isPlainObject(v){
  if(!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

/* خالی = غایب (فیلدِ اختیاری رد نمی‌شود؛ required جداگانه سنجیده می‌شود) */
function isEmpty(v){ return v === undefined || v === null || v === ''; }

/* تاریخِ تقویمیِ معتبر: YYYY-MM-DD با روزِ واقعی (کبیسه هم حساب است) */
function validYMD(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if(y < LIMITS.YEAR_MIN || y > LIMITS.YEAR_MAX || mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

/* datetimeِ ISO با سالِ معقول (پذیرشِ 'YYYY-MM-DD' هم این‌جاست) */
function validDatetime(s){
  if(typeof s !== 'string' || s.length > 64) return false;
  if(validYMD(s)) return true;
  if(!/^\d{4}-\d{2}-\d{2}T/.test(s)) return false;
  const t = Date.parse(s);
  if(isNaN(t)) return false;
  const y = new Date(t).getUTCFullYear();
  /* تطابقِ جزءها: '2026-02-30' را Date به ۲ مارس می‌لغزاند — رد شود */
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if(!m) return false;
  const d = new Date(t);
  const sameDay = d.getUTCFullYear() === Number(m[1]) &&
    (d.getUTCMonth() + 1) === Number(m[2]) && d.getUTCDate() === Number(m[3]);
  return sameDay && y >= LIMITS.YEAR_MIN && y <= LIMITS.YEAR_MAX;
}

const PHONE_NORM = (v) => String(v).replace(/[\s\-()]/g, '');
function validPhone(v){           /* موبایلِ ایران: دقیقاً ۱۱ رقم با 09 */
  if(typeof v !== 'string') return false;
  return /^09\d{9}$/.test(PHONE_NORM(v));
}
function validLandline(v){        /* تلفنِ ثابت: ۰ + ۹ تا ۱۰ رقم */
  if(typeof v !== 'string') return false;
  return /^0\d{9,10}$/.test(String(v).replace(/\D/g, ''));
}
function validAuthPhone(v){       /* قراردادِ ورود (§2): ‎+‎۹۸ هم می‌پذیرد */
  if(typeof v !== 'string') return false;
  return /^\+?\d{10,15}$/.test(PHONE_NORM(v));
}
function validNid(v){ return typeof v === 'string' && /^\d{10}$/.test(v); }
function validOtpCode(v){ return typeof v === 'string' && /^\d{4,6}$/.test(v); }

/* شناسه: عددِ صحیحِ مثبت یا رشتهٔ متنیِ همان (تحملِ رفت‌وبرگشتِ DOM —
   dataset همیشه رشته است؛ '16' می‌پذیرد ولی '16.5'/' 16'/'1e2' رد) */
function validId(v){
  if(typeof v === 'number')
    return Number.isInteger(v) && v > 0 && v <= LIMITS.ID_MAX;
  if(typeof v === 'string'){
    if(!/^\d{1,10}$/.test(v)) return false;
    const n = Number(v);
    return n > 0 && n <= LIMITS.ID_MAX;
  }
  return false;
}

/* شیءِ تودرتو (capabilities/notify_rules/pattern): سقفِ کلید + عمق + بازگشت */
function validNestedObject(v, depth){
  if(!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  if(keys.length > LIMITS.OBJ_KEYS || depth > 5) return false;
  for(const k of keys){
    if(k.length > LIMITS.OBJ_KEYLEN) return false;
    const x = v[k];
    if(x === null || x === undefined) continue;
    if(typeof x === 'string'){ if(x.length > LIMITS.STR_LONG) return false; }
    else if(typeof x === 'number'){ if(!Number.isFinite(x) || Math.abs(x) > LIMITS.NUM_ABS) return false; }
    else if(typeof x === 'boolean') continue;
    else if(Array.isArray(x)){
      if(x.length > LIMITS.ARRAY) return false;
      for(const e of x){
        if(e === null || e === undefined) continue;
        if(typeof e === 'string'){ if(e.length > LIMITS.STR_LONG) return false; }
        else if(typeof e === 'number'){ if(!Number.isFinite(e) || Math.abs(e) > LIMITS.NUM_ABS) return false; }
        else if(typeof e === 'boolean') continue;
        else if(isPlainObject(e)){ if(!validNestedObject(e, depth + 1)) return false; }
        else return false;
      }
    }
    else if(isPlainObject(x)){ if(!validNestedObject(x, depth + 1)) return false; }
    else return false;
  }
  return true;
}

/* ── موتورِ قانونِ تکی ────────────────────────────────────────────
   rule: { type, min, max, pattern, enum/values, of }
   خروجی: null = قبول، یا رشتهٔ کوتاهِ انگلیسیِ علت (هرگز مقدارِ خام نه) */
function checkRule(v, rule){
  const t = rule.type || 'string';
  switch(t){
    case 'string': {
      if(typeof v !== 'string') return 'not_string';
      const max = rule.max != null ? rule.max : LIMITS.STR_LONG;
      const min = rule.min != null ? rule.min : 0;
      if(v.length > max) return 'too_long';
      if(v.length < min) return 'too_short';
      if(rule.pattern && !rule.pattern.test(v)) return 'bad_format';
      const en = rule.enum || rule.values;
      if(en && en.indexOf(v) === -1) return 'bad_enum';
      return null;
    }
    case 'phone':    return validPhone(v) ? null : 'bad_phone';
    case 'landline': return validLandline(v) ? null : 'bad_landline';
    case 'authphone':return validAuthPhone(v) ? null : 'bad_phone';
    case 'nid':      return validNid(v) ? null : 'bad_nid';
    case 'code':     return validOtpCode(v) ? null : 'bad_code';
    case 'integer': {
      if(typeof v !== 'number' || !Number.isInteger(v)) return 'not_integer';
      if(rule.min != null && v < rule.min) return 'too_small';
      if(rule.max != null && v > rule.max) return 'too_big';
      return null;
    }
    case 'number': {
      if(typeof v !== 'number' || !Number.isFinite(v)) return 'not_number';
      if(Math.abs(v) > LIMITS.NUM_ABS) return 'too_big';
      if(rule.min != null && v < rule.min) return 'too_small';
      if(rule.max != null && v > rule.max) return 'too_big';
      return null;
    }
    case 'score': {  /* نمرهٔ ایرانی: عددِ ۰ تا ۲۰ (کلاینت با Number می‌فرستد) */
      if(typeof v !== 'number' || !Number.isFinite(v)) return 'not_number';
      if(v < 0 || v > 20) return 'out_of_range';
      return null;
    }
    case 'id':       return validId(v) ? null : 'bad_id';
    case 'flag':     /* ۰/۱ِ عددی یا boolean */
      return (v === 0 || v === 1 || v === true || v === false) ? null : 'bad_flag';
    case 'boolean':
      return (v === true || v === false) ? null : 'not_boolean';
    case 'date':     return validDatetime(v) ? null : 'bad_date';
    case 'datetime': return validDatetime(v) ? null : 'bad_date';
    case 'time': {   /* HH:MM یا datetimeِ ISO (shad_time هر دو را دارد) */
      if(typeof v !== 'string') return 'not_string';
      if(/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return null;
      return validDatetime(v) ? null : 'bad_time';
    }
    case 'enum': {
      const en = rule.enum || rule.values || [];
      return en.indexOf(v) > -1 ? null : 'bad_enum';
    }
    case 'array': {
      if(!Array.isArray(v)) return 'not_array';
      const max = rule.max != null ? rule.max : LIMITS.ARRAY;
      if(v.length > max) return 'too_long';
      if(rule.min != null && v.length < rule.min) return 'too_short';
      if(rule.of){
        for(const e of v){
          if(isEmpty(e)) continue;
          const r = checkRule(e, rule.of);
          if(r) return 'bad_item:' + r;
        }
      }
      return null;
    }
    case 'object':
      return validNestedObject(v, 1) ? null : 'bad_object';
    default:
      return 'bad_type:' + t;
  }
}

/* ── validate(body, schema) — الگویِ درخواستی ─────────────────────
   schema = { fields: { name: { type:'string', max:100 }, ... }, required: [...] }
   کلیدِ ناشناخته = رد (fail-closed). ترتیب: شیءبودن → ناشناخته →
   required → مقدار. */
function validate(body, schema){
  schema = schema || {};
  const fields = schema.fields || {};
  const required = schema.required || [];
  if(!isPlainObject(body))
    return { ok: false, kind: 'invalid', field: null, message: 'بدنه باید یک شیء باشد' };
  for(const k of Object.keys(body)){
    if(!Object.prototype.hasOwnProperty.call(fields, k))
      return { ok: false, kind: 'unknown_field', field: k, message: 'فیلدِ ناشناخته: ' + k };
  }
  for(const k of required){
    if(isEmpty(body[k]))
      return { ok: false, kind: 'missing', field: k, message: 'فیلدِ الزامیِ «' + k + '» خالی است' };
  }
  for(const k of Object.keys(fields)){
    const v = body[k];
    if(isEmpty(v)) continue;
    const rule = fields[k] || {};
    if(rule.required === false && isEmpty(v)) continue;
    const r = checkRule(v, rule);
    if(r) return { ok: false, kind: 'invalid', field: k, message: 'مقدارِ «' + k + '» معتبر نیست (' + r + ')' };
  }
  return { ok: true };
}

/* ── قانونِ فیلدِ دادهٔ sync از رویِ (مجموعه، نام) ───────────────── */
function ruleFor(coll, key){
  /* ۱. status — همیشه enumِ مجموعه (هر ۲۴ مجموعهٔ دارایِ status نگاشته‌اند) */
  if(key === 'status'){
    const en = STATUS_ENUMS[coll];
    if(en) return { type: 'enum', values: en };
    return { type: 'string', max: 32 };
  }
  /* ۲. enumهایِ تک‌فیلدی */
  if(key === 'stage' && coll === 'preapps') return { type: 'enum', values: STAGE_ENUM };
  if(key === 'meeting_type' && coll === 'assoc_minutes') return { type: 'enum', values: ['assoc','teachers','students'] }; /* C.1 فرناز */
  if(key === 'role'){
    if(coll === 'users') return { type: 'enum', values: USER_ROLES };
    return { type: 'string', max: LIMITS.STR_MID };
  }
  if(key === 'author_role') return { type: 'string', max: LIMITS.STR_MID };
  if(key === 'boom_goals') return { type: 'string', max: LIMITS.STR_LONG }; /* C.2 فرناز: اهداف سالانه (بوم) */
  if(key === 'gender'){
    if(coll === 'schools') return { type: 'enum', values: SCHOOL_GENDERS };
    return { type: 'string', max: 40 };
  }
  /* ۳. هویت و تماس */
  if(key === 'phone') return { type: 'phone' };
  if(key === 'landline') return { type: 'landline' };
  if(key === 'national_id' || key === 'parent_nid' ||
     key === 'father_nid' || key === 'mother_nid') return { type: 'nid' };
  if(key === 'password') return { type: 'string', max: 128 };
  /* ۴. شناسه‌ها و شمارنده‌ها */
  if(key === 'id' || /_id$/.test(key)) return { type: 'id' };
  if(key === 'version') return { type: 'integer', min: 1, max: LIMITS.ID_MAX };
  if(key === 'participant_count_students' || key === 'participant_count_staff') return { type: 'integer', min: 0, max: 100000 }; /* B.4 فرناز: شمار شرکت‌کننده مانور */
  if(FLAG_FIELDS.indexOf(key) > -1) return { type: 'flag' };
  /* ۵. نمره‌ها */
  if(key === 'score' || key === 'original_score' || key === 'new_score') return { type: 'score' };
  if(key === 'max_score') return { type: 'number', min: 0, max: 100 };
  /* ۶. تاریخ و ساعت */
  if(key === 'date' || /(_at|_date|_deadline)$/.test(key)) return { type: 'date' };
  if(/_time$/.test(key)) return { type: 'time' };
  /* ۷. طولِ رشته‌هایِ شناخته‌شده */
  if(SHORT_FIELDS.indexOf(key) > -1) return { type: 'string', max: LIMITS.STR_SHORT };
  if(MID_FIELDS.indexOf(key) > -1) return { type: 'string', max: LIMITS.STR_MID };
  /* ۸. آرایه‌ها */
  if(/ids$/.test(key) || key === 'parent_ids' || key === 'student_ids')
    return { type: 'array', max: LIMITS.ARRAY, of: { type: 'id' } };
  if(key === 'branches' || key === 'fields')
    return { type: 'array', max: 100, of: { type: 'string', max: LIMITS.STR_MID } };
  /* ۹. پیش‌فرضِ fail-closed بر اساسِ نوعِ جاوااسکریپتی (در validateSyncData) */
  return null;
}

/* مقدارِ فیلدِ ناشناخته‌الگو: فقط سقفِ نوع (رشته/عدد/آرایه/شیء) */
function checkGeneric(v){
  if(typeof v === 'string') return v.length <= LIMITS.STR_LONG ? null : 'too_long';
  if(typeof v === 'number')
    return (Number.isFinite(v) && Math.abs(v) <= LIMITS.NUM_ABS) ? null : 'bad_number';
  if(typeof v === 'boolean') return null;
  if(Array.isArray(v)){
    if(v.length > LIMITS.ARRAY) return 'too_long';
    for(const e of v){
      if(isEmpty(e)) continue;
      if(typeof e === 'string'){ if(e.length > LIMITS.STR_LONG) return 'too_long'; }
      else if(typeof e === 'number'){
        if(!Number.isFinite(e) || Math.abs(e) > LIMITS.NUM_ABS) return 'bad_number';
      }
      else if(typeof e === 'boolean') continue;
      else if(isPlainObject(e)){ if(!validNestedObject(e, 2)) return 'bad_object'; }
      else return 'bad_item';
    }
    return null;
  }
  if(isPlainObject(v)) return validNestedObject(v, 1) ? null : 'bad_object';
  return 'bad_type';
}

/* ── پاکتِ عملیاتِ sync ───────────────────────────────────────────
   کلیدهایِ مجاز = همان‌هایی که کلاینت (27-sync + 03-persistence) و
   قرارداد (§3.1) می‌فرستند؛ هر چیزِ دیگر = malformed (کلِ دسته، مثلِ
   رفتارِ موجود). مقدارِ t این‌جا سنجیده نمی‌شود — canOp در fieldGate
   هر tِ غیرِ ins/upd/del را fail-closed رد می‌کند (رفتارِ قفل‌شده). */
const OP_KEYS = ['uid', 't', 'c', 'id', 'data', 'by', 'at',
  'user_id', 'school_id', 'base_version'];
function validateSyncEnvelope(op){
  if(!isPlainObject(op)) return { ok: false, code: 'malformed_op' };
  for(const k of Object.keys(op)){
    if(OP_KEYS.indexOf(k) === -1) return { ok: false, code: 'malformed_op', field: k };
  }
  if(typeof op.uid !== 'string' || op.uid.length === 0 || op.uid.length > LIMITS.UID)
    return { ok: false, code: 'malformed_op', field: 'uid' };
  if(op.t === undefined) return { ok: false, code: 'malformed_op', field: 't' };
  if(typeof op.c !== 'string' || op.c.length === 0 || op.c.length > LIMITS.COLL)
    return { ok: false, code: 'malformed_op', field: 'c' };
  if(op.id !== undefined && op.id !== null && !validId(op.id))
    return { ok: false, code: 'malformed_op', field: 'id' };
  if(op.at !== undefined && op.at !== null &&
     (typeof op.at !== 'string' || op.at.length > 64))
    return { ok: false, code: 'malformed_op', field: 'at' };
  /* by/user_id/school_id با Number() در sync.js سنجیده می‌شوند (هر مقدارِ
     غیرعددی = forged/user_mismatch/school_mismatch) — این‌جا کاری نیست. */
  return { ok: true };
}

/* ── مقدارهایِ data (بعد از fieldGate) ────────────────────────────
   خروجی: null = قبول، یا { field, reason } برایِ ردِّ عملیات‌محور. */
function validateSyncData(coll, data, type){
  if(type === 'del') return null;   /* حذف، data ندارد (اگر داشت نادیده) */
  if(!isPlainObject(data)) return { field: null, reason: 'not_object' };
  for(const k of Object.keys(data)){
    const v = data[k];
    if(isEmpty(v)) continue;        /* patchِ جزئی: غایب/خالی رد نمی‌شود */
    const rule = ruleFor(coll, k);
    const r = rule ? checkRule(v, rule) : checkGeneric(v);
    if(r) return { field: k, reason: r };
  }
  return null;
}

module.exports = {
  LIMITS, STATUS_ENUMS, STAGE_ENUM, USER_ROLES,
  SCHOOL_GENDERS, OP_KEYS,
  validate, checkRule, ruleFor, validateSyncEnvelope, validateSyncData,
  validPhone, validLandline, validAuthPhone, validNid, validOtpCode, validId,
  validYMD, validDatetime,
};
